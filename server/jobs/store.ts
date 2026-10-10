import { randomUUID } from 'node:crypto'
import { db } from '../db'
import type { GenerateResponse } from '../types'

export type JobStatus = 'running' | 'success' | 'failed'

export interface GenerationJob {
  id: string
  status: JobStatus
  /** Opaque client context used to resume the UI after a reload */
  context: unknown
  result?: GenerateResponse
  error?: string
  acknowledged: boolean
  appId?: string
  createdAt: number
  updatedAt: number
}

interface JobRow {
  id: string
  user_id: string
  status: JobStatus
  context_json: string
  result_json: string | null
  error: string | null
  acknowledged: number
  created_at: number
  updated_at: number
  app_id?: string | null
}

/** Jobs double as the admin-visible generation history. */
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000

const JOBS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS generation_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    image_type TEXT,
    model TEXT,
    prompt TEXT,
    image_count INTEGER NOT NULL DEFAULT 0,
    context_json TEXT NOT NULL DEFAULT 'null',
    result_json TEXT,
    error TEXT,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`

function migrateJobsTable(): void {
  const columns = db
    .prepare('PRAGMA table_info(generation_jobs)')
    .all() as Array<{ name: string }>
  if (columns.length === 0 || columns.some((c) => c.name === 'username')) return
  // First version cascaded deletes from users and lacked history columns.
  db.exec('BEGIN')
  try {
    db.exec(`ALTER TABLE generation_jobs RENAME TO generation_jobs_v1`)
    db.exec(JOBS_TABLE_SQL)
    db.exec(`
      INSERT INTO generation_jobs
        (id, user_id, username, status, image_type, model, prompt, image_count,
         context_json, result_json, error, acknowledged, created_at, updated_at)
      SELECT j.id, j.user_id, COALESCE(u.username, ''), j.status,
        json_extract(j.context_json, '$.params.imageType'),
        json_extract(j.result_json, '$.model'),
        json_extract(j.result_json, '$.prompt'),
        COALESCE(json_array_length(j.result_json, '$.images'), 0),
        j.context_json, j.result_json, j.error, j.acknowledged, j.created_at, j.updated_at
      FROM generation_jobs_v1 j LEFT JOIN users u ON u.id = j.user_id
    `)
    db.exec('DROP TABLE generation_jobs_v1')
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

migrateJobsTable()
db.exec(`
  ${JOBS_TABLE_SQL};
  CREATE INDEX IF NOT EXISTS idx_generation_jobs_user
    ON generation_jobs(user_id, acknowledged, created_at);
  CREATE INDEX IF NOT EXISTS idx_generation_jobs_created
    ON generation_jobs(created_at);
`)

{
  const cols = db
    .prepare('PRAGMA table_info(generation_jobs)')
    .all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'app_id')) {
    db.exec('ALTER TABLE generation_jobs ADD COLUMN app_id TEXT')
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_generation_jobs_app ON generation_jobs(app_id, created_at)',
  )
}

function toJob(row: JobRow): GenerationJob {
  const parse = (raw: string | null) => {
    if (!raw) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  return {
    id: row.id,
    status: row.status,
    context: parse(row.context_json) ?? null,
    result: parse(row.result_json),
    error: row.error ?? undefined,
    acknowledged: Boolean(row.acknowledged),
    appId: row.app_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Jobs cannot outlive the process that runs them; fail leftovers on boot. */
export function initializeJobStore(): void {
  const now = Date.now()
  db.prepare(
    `UPDATE generation_jobs
     SET status = 'failed', error = '服务重启导致任务中断，请重新生成', updated_at = ?
     WHERE status = 'running'`,
  ).run(now)
  db.prepare('DELETE FROM generation_jobs WHERE created_at < ?').run(
    now - RETENTION_MS,
  )
}

export function createJob(input: {
  userId: string
  username: string
  imageType?: string
  model: string
  prompt: string
  context: unknown
  appId?: string
}): GenerationJob {
  const now = Date.now()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO generation_jobs
       (id, user_id, username, status, image_type, model, prompt, context_json,
        created_at, updated_at, app_id)
     VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.username,
    input.imageType ?? null,
    input.model,
    input.prompt,
    JSON.stringify(input.context ?? null),
    now,
    now,
    input.appId ?? null,
  )
  return getJob(input.userId, id)!
}

/** Successful jobs for the current user (embed gallery). */
export function listMineJobs(
  userId: string,
  limit = 40,
): GenerationJob[] {
  const rows = db
    .prepare(
      `SELECT * FROM generation_jobs
       WHERE user_id = ? AND status = 'success'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(userId, Math.min(100, Math.max(1, limit))) as unknown as JobRow[]
  return rows.map(toJob)
}

export function getJobById(id: string): GenerationJob | undefined {
  const row = db
    .prepare('SELECT * FROM generation_jobs WHERE id = ?')
    .get(id) as JobRow | undefined
  return row ? toJob(row) : undefined
}

export function completeJob(id: string, result: GenerateResponse): void {
  db.prepare(
    `UPDATE generation_jobs
     SET status = 'success', result_json = ?, model = ?, prompt = ?,
         image_count = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    JSON.stringify(result),
    result.model,
    result.prompt,
    result.images.length,
    Date.now(),
    id,
  )
}

export function failJob(id: string, error: string): void {
  db.prepare(
    `UPDATE generation_jobs
     SET status = 'failed', error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(error, Date.now(), id)
}

export function getJob(userId: string, id: string): GenerationJob | undefined {
  const row = db
    .prepare('SELECT * FROM generation_jobs WHERE id = ? AND user_id = ?')
    .get(id, userId) as JobRow | undefined
  return row ? toJob(row) : undefined
}

/** Running jobs plus finished ones whose result the UI has not consumed yet. */
export function listPendingJobs(userId: string): GenerationJob[] {
  const rows = db
    .prepare(
      `SELECT * FROM generation_jobs
       WHERE user_id = ? AND acknowledged = 0
       ORDER BY created_at ASC
       LIMIT 20`,
    )
    .all(userId) as unknown as JobRow[]
  return rows.map(toJob)
}

/**
 * Marks a finished job as consumed. Returns true only for the first caller,
 * so two open tabs never both add the same result to gallery/history.
 */
export function acknowledgeJob(userId: string, id: string): boolean {
  const result = db
    .prepare(
      `UPDATE generation_jobs
       SET acknowledged = 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND acknowledged = 0 AND status != 'running'`,
    )
    .run(Date.now(), id, userId)
  return Number(result.changes) === 1
}

export interface HistoryRecord {
  id: string
  userId: string
  username: string
  status: JobStatus
  imageType: string | null
  model: string | null
  prompt: string | null
  imageCount: number
  images: string[]
  referenceThumb?: string
  userText?: string
  error: string | null
  appId: string | null
  createdAt: number
  updatedAt: number
}

export interface HistoryQuery {
  userId?: string
  status?: JobStatus
  model?: string
  imageType?: string
  appId?: string
  keyword?: string
  from?: number
  to?: number
  page: number
  pageSize: number
}

interface HistoryRow extends JobRow {
  username: string
  image_type: string | null
  model: string | null
  prompt: string | null
  image_count: number
}

function toHistory(row: HistoryRow): HistoryRecord {
  const job = toJob(row)
  const ctx = (job.context ?? {}) as { referenceThumb?: string; userText?: string }
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    status: row.status,
    imageType: row.image_type,
    model: row.model,
    prompt: row.prompt,
    imageCount: row.image_count,
    images: job.result?.images.map((img) => img.url) ?? [],
    referenceThumb: ctx.referenceThumb,
    userText: ctx.userText,
    error: row.error,
    appId: row.app_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** All users' generations for the admin console, newest first. */
export function queryHistory(q: HistoryQuery): {
  items: HistoryRecord[]
  total: number
} {
  const where: string[] = []
  const args: Array<string | number> = []
  if (q.userId) {
    where.push('user_id = ?')
    args.push(q.userId)
  }
  if (q.status) {
    where.push('status = ?')
    args.push(q.status)
  }
  if (q.model) {
    where.push('model = ?')
    args.push(q.model)
  }
  if (q.imageType) {
    where.push('image_type = ?')
    args.push(q.imageType)
  }
  if (q.appId) {
    where.push('app_id = ?')
    args.push(q.appId)
  }
  if (q.keyword) {
    where.push(`(prompt LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\')`)
    const like = `%${q.keyword.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    args.push(like, like)
  }
  if (q.from) {
    where.push('created_at >= ?')
    args.push(q.from)
  }
  if (q.to) {
    where.push('created_at < ?')
    args.push(q.to)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM generation_jobs ${clause}`)
      .get(...args) as { n: number }
  ).n
  const rows = db
    .prepare(
      `SELECT * FROM generation_jobs ${clause}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, q.pageSize, (q.page - 1) * q.pageSize) as unknown as HistoryRow[]
  return { items: rows.map(toHistory), total }
}

export function historyFacets(): { models: string[]; appIds: string[] } {
  const rows = db
    .prepare(
      `SELECT DISTINCT model FROM generation_jobs
       WHERE model IS NOT NULL AND model != '' ORDER BY model`,
    )
    .all() as Array<{ model: string }>
  const apps = db
    .prepare(
      `SELECT DISTINCT app_id FROM generation_jobs
       WHERE app_id IS NOT NULL AND app_id != '' ORDER BY app_id`,
    )
    .all() as Array<{ app_id: string }>
  return {
    models: rows.map((r) => r.model),
    appIds: apps.map((r) => r.app_id),
  }
}

export interface HistoryStats {
  totalJobs: number
  successJobs: number
  failedJobs: number
  runningJobs: number
  totalImages: number
  todayJobs: number
  todayImages: number
  activeUsers7d: number
  byModel: Array<{ model: string; jobs: number; images: number }>
  byDay: Array<{ day: string; jobs: number; images: number }>
}

/** Day boundaries follow Beijing time regardless of the server timezone. */
const DAY_MS = 24 * 60 * 60 * 1000
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000

export function historyStats(): HistoryStats {
  const today =
    Math.floor((Date.now() + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'success') AS success,
         SUM(status = 'failed') AS failed,
         SUM(status = 'running') AS running,
         COALESCE(SUM(image_count), 0) AS images,
         SUM(created_at >= ?) AS today_jobs,
         COALESCE(SUM(CASE WHEN created_at >= ? THEN image_count END), 0) AS today_images,
         COUNT(DISTINCT CASE WHEN created_at >= ? THEN user_id END) AS active
       FROM generation_jobs`,
    )
    .get(today, today, weekAgo) as Record<string, number | null>
  const byModel = db
    .prepare(
      `SELECT model, COUNT(*) AS jobs, COALESCE(SUM(image_count), 0) AS images
       FROM generation_jobs WHERE status = 'success' AND model IS NOT NULL
       GROUP BY model ORDER BY images DESC`,
    )
    .all() as Array<{ model: string; jobs: number; images: number }>
  const byDay = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', (created_at + ?) / 1000, 'unixepoch') AS day,
         COUNT(*) AS jobs, COALESCE(SUM(image_count), 0) AS images
       FROM generation_jobs WHERE created_at >= ?
       GROUP BY day ORDER BY day`,
    )
    .all(TZ_OFFSET_MS, today - 13 * DAY_MS) as Array<{
    day: string
    jobs: number
    images: number
  }>
  const n = (v: number | null | undefined) => Number(v ?? 0)
  return {
    totalJobs: n(totals.total),
    successJobs: n(totals.success),
    failedJobs: n(totals.failed),
    runningJobs: n(totals.running),
    totalImages: n(totals.images),
    todayJobs: n(totals.today_jobs),
    todayImages: n(totals.today_images),
    activeUsers7d: n(totals.active),
    byModel,
    byDay,
  }
}
