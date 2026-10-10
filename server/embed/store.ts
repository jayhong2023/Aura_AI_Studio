import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { serverConfig } from '../config'
import { db } from '../db'
import type { EmbedAppInfo } from '../types'

export interface EmbedApp extends EmbedAppInfo {
  createdAt: number
  updatedAt: number
}

interface EmbedAppRow {
  id: string
  name: string
  secret_enc: string
  allowed_origins: string
  webhook_url: string | null
  daily_image_quota: number
  status: 'active' | 'disabled'
  created_at: number
  updated_at: number
}

db.exec(`
  CREATE TABLE IF NOT EXISTS embed_apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    allowed_origins TEXT NOT NULL DEFAULT '[]',
    webhook_url TEXT,
    daily_image_quota INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS embed_tickets (
    id TEXT PRIMARY KEY,
    ticket_hash TEXT NOT NULL UNIQUE,
    app_id TEXT NOT NULL REFERENCES embed_apps(id) ON DELETE CASCADE,
    external_user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_embed_tickets_hash
    ON embed_tickets(ticket_hash);
  CREATE INDEX IF NOT EXISTS idx_embed_tickets_expires
    ON embed_tickets(expires_at);
`)

function pepperKey(): Buffer {
  return createHash('sha256').update(serverConfig.assetSigningSecret).digest()
}

function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', pepperKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64url')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', pepperKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

function hashTicket(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex')
}

function parseOrigins(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

function toApp(row: EmbedAppRow): EmbedApp {
  return {
    id: row.id,
    name: row.name,
    allowedOrigins: parseOrigins(row.allowed_origins),
    webhookUrl: row.webhook_url,
    dailyImageQuota: row.daily_image_quota,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toAppInfo(app: EmbedApp): EmbedAppInfo {
  return {
    id: app.id,
    name: app.name,
    allowedOrigins: app.allowedOrigins,
    webhookUrl: app.webhookUrl,
    dailyImageQuota: app.dailyImageQuota,
    status: app.status,
  }
}

function getAppSecret(appId: string): string | null {
  const row = db
    .prepare('SELECT secret_enc FROM embed_apps WHERE id = ?')
    .get(appId) as { secret_enc: string } | undefined
  if (!row) return null
  try {
    return decryptSecret(row.secret_enc)
  } catch {
    return null
  }
}

export function listEmbedApps(): EmbedAppInfo[] {
  const rows = db
    .prepare('SELECT * FROM embed_apps ORDER BY created_at DESC')
    .all() as unknown as EmbedAppRow[]
  return rows.map((r) => toAppInfo(toApp(r)))
}

export function getEmbedApp(id: string): EmbedApp | undefined {
  const row = db.prepare('SELECT * FROM embed_apps WHERE id = ?').get(id) as
    | EmbedAppRow
    | undefined
  return row ? toApp(row) : undefined
}

export function createEmbedApp(input: {
  name: string
  allowedOrigins: string[]
  webhookUrl?: string
  dailyImageQuota?: number
}): { app: EmbedAppInfo; secret: string } {
  const id = `app_${randomBytes(8).toString('hex')}`
  const secret = `sk_${randomBytes(24).toString('base64url')}`
  const now = Date.now()
  db.prepare(
    `INSERT INTO embed_apps
      (id, name, secret_enc, allowed_origins, webhook_url, daily_image_quota,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    input.name.trim(),
    encryptSecret(secret),
    JSON.stringify(input.allowedOrigins),
    input.webhookUrl?.trim() || null,
    Math.max(0, Math.floor(input.dailyImageQuota ?? 100)),
    now,
    now,
  )
  return { app: toAppInfo(getEmbedApp(id)!), secret }
}

export function updateEmbedApp(
  id: string,
  input: {
    name?: string
    allowedOrigins?: string[]
    webhookUrl?: string | null
    dailyImageQuota?: number
    status?: 'active' | 'disabled'
  },
): EmbedAppInfo {
  const current = getEmbedApp(id)
  if (!current) throw new Error('应用不存在')
  db.prepare(
    `UPDATE embed_apps
     SET name = ?, allowed_origins = ?, webhook_url = ?, daily_image_quota = ?,
         status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name?.trim() ?? current.name,
    JSON.stringify(input.allowedOrigins ?? current.allowedOrigins),
    input.webhookUrl === undefined
      ? current.webhookUrl
      : input.webhookUrl?.trim() || null,
    input.dailyImageQuota === undefined
      ? current.dailyImageQuota
      : Math.max(0, Math.floor(input.dailyImageQuota)),
    input.status ?? current.status,
    Date.now(),
    id,
  )
  return toAppInfo(getEmbedApp(id)!)
}

export function resetEmbedAppSecret(id: string): string {
  if (!getEmbedApp(id)) throw new Error('应用不存在')
  const secret = `sk_${randomBytes(24).toString('base64url')}`
  db.prepare(
    'UPDATE embed_apps SET secret_enc = ?, updated_at = ? WHERE id = ?',
  ).run(encryptSecret(secret), Date.now(), id)
  return secret
}

export function deleteEmbedApp(id: string): void {
  const result = db.prepare('DELETE FROM embed_apps WHERE id = ?').run(id)
  if (Number(result.changes) === 0) throw new Error('应用不存在')
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/** HMAC-SHA256(secret, timestamp + "\\n" + body) as hex */
export function verifyAppRequest(
  appId: string,
  timestamp: string,
  body: string,
  signature: string,
): EmbedApp | null {
  const app = getEmbedApp(appId)
  if (!app || app.status !== 'active') return null
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return null
  }
  const secret = getAppSecret(appId)
  if (!secret) return null
  const expected = hmacSha256Hex(secret, `${timestamp}\n${body}`)
  if (!safeEqualHex(expected, signature.toLowerCase())) return null
  return app
}

export function createTicket(input: {
  appId: string
  externalUserId: string
  ttlMs?: number
}): { ticket: string; expiresAt: number } {
  const ticket = `tkt_${randomBytes(24).toString('base64url')}`
  const expiresAt = Date.now() + (input.ttlMs ?? 5 * 60 * 1000)
  db.prepare(
    `INSERT INTO embed_tickets
      (id, ticket_hash, app_id, external_user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    hashTicket(ticket),
    input.appId,
    input.externalUserId,
    expiresAt,
    Date.now(),
  )
  return { ticket, expiresAt }
}

/** Atomically consume a ticket. Returns null if invalid/expired/already used. */
export function consumeTicket(
  ticket: string,
): { appId: string; externalUserId: string } | null {
  const now = Date.now()
  db.prepare(
    'DELETE FROM embed_tickets WHERE expires_at <= ? AND used_at IS NULL',
  ).run(now)
  const row = db
    .prepare(
      `SELECT id, app_id, external_user_id FROM embed_tickets
       WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .get(hashTicket(ticket), now) as
    | { id: string; app_id: string; external_user_id: string }
    | undefined
  if (!row) return null
  const result = db
    .prepare(
      `UPDATE embed_tickets SET used_at = ?
       WHERE id = ? AND used_at IS NULL`,
    )
    .run(now, row.id)
  if (Number(result.changes) !== 1) return null
  return { appId: row.app_id, externalUserId: row.external_user_id }
}

export function countTodayImagesForApp(appId: string): number {
  const TZ_OFFSET_MS = 8 * 60 * 60 * 1000
  const DAY_MS = 24 * 60 * 60 * 1000
  const today =
    Math.floor((Date.now() + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(image_count), 0) AS n FROM generation_jobs
       WHERE app_id = ? AND status = 'success' AND created_at >= ?`,
    )
    .get(appId, today) as { n: number }
  return Number(row.n)
}

export function embedAppUsage(appId: string): {
  todayImages: number
  totalImages: number
  totalJobs: number
} {
  const today = countTodayImagesForApp(appId)
  const row = db
    .prepare(
      `SELECT COUNT(*) AS jobs, COALESCE(SUM(image_count), 0) AS images
       FROM generation_jobs WHERE app_id = ? AND status = 'success'`,
    )
    .get(appId) as { jobs: number; images: number }
  return {
    todayImages: today,
    totalImages: Number(row.images),
    totalJobs: Number(row.jobs),
  }
}

/** Sign webhook payload with the app secret. */
export function signWebhookPayload(appId: string, body: string, timestamp: number): string | null {
  const secret = getAppSecret(appId)
  if (!secret) return null
  return hmacSha256Hex(secret, `${timestamp}\n${body}`)
}
