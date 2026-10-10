import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { serverConfig } from '../config'
import { db } from '../db'
import type { AuthUser, UserRole } from '../types'
import { hashPassword } from './password'

interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  role: UserRole
  disabled: number
  must_change_password: number
  created_at: number
  updated_at: number
  last_login_at: number | null
  app_id: string | null
  external_id: string | null
}

interface SessionUserRow extends UserRow {
  session_id: string
  session_kind: 'cookie' | 'embed'
  session_app_id: string | null
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    disabled INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
    ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);
`)

function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
  }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

ensureColumn('users', 'app_id', 'app_id TEXT')
ensureColumn('users', 'external_id', 'external_id TEXT')
ensureColumn('sessions', 'kind', "kind TEXT NOT NULL DEFAULT 'cookie'")
ensureColumn('sessions', 'app_id', 'app_id TEXT')
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_app_external
    ON users(app_id, external_id)
    WHERE app_id IS NOT NULL AND external_id IS NOT NULL;
`)

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username)
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized)) {
    return '账号需为 3-32 位小写字母、数字、点、下划线或短横线'
  }
  return null
}

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    disabled: Boolean(row.disabled),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? undefined,
    appId: row.app_id ?? undefined,
    externalId: row.external_id ?? undefined,
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function initializeAuthStore(): Promise<{
  bootstrapped: boolean
  username?: string
  temporaryPassword?: string
}> {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as {
    count: number
  }
  if (Number(row.count) > 0) return { bootstrapped: false }

  const username = normalizeUsername(serverConfig.adminUsername)
  const temporaryPassword =
    serverConfig.adminInitialPassword || randomBytes(18).toString('base64url')
  const now = Date.now()
  db.prepare(
    `INSERT INTO users
      (id, username, display_name, password_hash, role, disabled,
       must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 0, 1, ?, ?)`,
  ).run(
    randomUUID(),
    username,
    '系统管理员',
    await hashPassword(temporaryPassword),
    now,
    now,
  )
  return { bootstrapped: true, username, temporaryPassword }
}

export function findUserWithPassword(username: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(normalizeUsername(username)) as UserRow | undefined
}

export function getUserById(id: string): AuthUser | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined
  return row ? toUser(row) : undefined
}

export function listUsers(opts?: { includeEmbed?: boolean }): AuthUser[] {
  const rows = opts?.includeEmbed
    ? (db
        .prepare('SELECT * FROM users ORDER BY created_at ASC')
        .all() as unknown as UserRow[])
    : (db
        .prepare(
          'SELECT * FROM users WHERE app_id IS NULL ORDER BY created_at ASC',
        )
        .all() as unknown as UserRow[])
  return rows.map(toUser)
}

/**
 * Finds or creates a shadow user bound to an embed app + host user id.
 * Shadow accounts cannot log in with a password.
 */
export async function findOrCreateEmbedUser(input: {
  appId: string
  externalId: string
  displayName?: string
}): Promise<AuthUser> {
  const existing = db
    .prepare(
      'SELECT * FROM users WHERE app_id = ? AND external_id = ?',
    )
    .get(input.appId, input.externalId) as UserRow | undefined
  if (existing) {
    if (existing.disabled) throw new Error('该用户已被禁用')
    return toUser(existing)
  }

  const safeExternal = input.externalId
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 40)
  const username = `app_${input.appId.slice(0, 12)}_${safeExternal}`.slice(0, 64)
  const now = Date.now()
  const id = randomUUID()
  const password = randomBytes(24).toString('base64url')
  try {
    db.prepare(
      `INSERT INTO users
        (id, username, display_name, password_hash, role, disabled,
         must_change_password, created_at, updated_at, app_id, external_id)
       VALUES (?, ?, ?, ?, 'user', 0, 0, ?, ?, ?, ?)`,
    ).run(
      id,
      username.toLowerCase(),
      input.displayName?.trim() || `embed:${input.externalId}`,
      await hashPassword(password),
      now,
      now,
      input.appId,
      input.externalId,
    )
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      const again = db
        .prepare(
          'SELECT * FROM users WHERE app_id = ? AND external_id = ?',
        )
        .get(input.appId, input.externalId) as UserRow | undefined
      if (again) return toUser(again)
    }
    throw error
  }
  return getUserById(id)!
}

export async function createUser(input: {
  username: string
  displayName?: string
  password: string
  role: UserRole
}): Promise<AuthUser> {
  const now = Date.now()
  const id = randomUUID()
  try {
    db.prepare(
      `INSERT INTO users
        (id, username, display_name, password_hash, role, disabled,
         must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    ).run(
      id,
      normalizeUsername(input.username),
      input.displayName?.trim() || input.username.trim(),
      await hashPassword(input.password),
      input.role,
      now,
      now,
    )
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Error('账号已存在')
    throw error
  }
  return getUserById(id)!
}

export function updateUser(
  id: string,
  input: {
    displayName?: string
    role?: UserRole
    disabled?: boolean
  },
): AuthUser {
  const current = getUserById(id)
  if (!current) throw new Error('用户不存在')
  db.prepare(
    `UPDATE users
     SET display_name = ?, role = ?, disabled = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.displayName?.trim() ?? current.displayName,
    input.role ?? current.role,
    input.disabled === undefined ? Number(current.disabled) : Number(input.disabled),
    Date.now(),
    id,
  )
  if (input.disabled === true) revokeUserSessions(id)
  return getUserById(id)!
}

export async function setUserPassword(
  id: string,
  password: string,
  mustChangePassword: boolean,
): Promise<void> {
  const result = db
    .prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      await hashPassword(password),
      Number(mustChangePassword),
      Date.now(),
      id,
    )
  if (Number(result.changes) === 0) throw new Error('用户不存在')
  revokeUserSessions(id)
}

export function markLogin(id: string): void {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
    Date.now(),
    id,
  )
}

export function clearMustChangePassword(id: string): void {
  db.prepare(
    'UPDATE users SET must_change_password = 0, updated_at = ? WHERE id = ?',
  ).run(Date.now(), id)
}

export function deleteUser(id: string): void {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id)
  if (Number(result.changes) === 0) throw new Error('用户不存在')
}

export function countEnabledAdmins(): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM users
       WHERE role = 'admin' AND disabled = 0`,
    )
    .get() as { count: number }
  return Number(row.count)
}

export function createSession(input: {
  userId: string
  ip?: string
  userAgent?: string
  kind?: 'cookie' | 'embed'
  appId?: string
  /** Override TTL; embed sessions default to 2 hours */
  ttlMs?: number
}): { id: string; token: string; expiresAt: number } {
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const kind = input.kind ?? 'cookie'
  const expiresAt =
    Date.now() +
    (input.ttlMs ??
      (kind === 'embed'
        ? 2 * 60 * 60 * 1000
        : serverConfig.sessionTtlDays * 24 * 60 * 60 * 1000))
  db.prepare(
    `INSERT INTO sessions
      (id, user_id, token_hash, expires_at, created_at, ip, user_agent, kind, app_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    hashToken(token),
    expiresAt,
    Date.now(),
    input.ip || null,
    input.userAgent?.slice(0, 300) || null,
    kind,
    input.appId ?? null,
  )
  return { id, token, expiresAt }
}

export function resolveSession(token: string):
  | {
      sessionId: string
      user: AuthUser
      kind: 'cookie' | 'embed'
      appId?: string
    }
  | undefined {
  const row = db
    .prepare(
      `SELECT u.*, s.id AS session_id,
         COALESCE(s.kind, 'cookie') AS session_kind,
         s.app_id AS session_app_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), Date.now()) as SessionUserRow | undefined
  if (!row || row.disabled) return undefined
  return {
    sessionId: row.session_id,
    user: toUser(row),
    kind: row.session_kind === 'embed' ? 'embed' : 'cookie',
    appId: row.session_app_id ?? row.app_id ?? undefined,
  }
}

export function revokeSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

export function revokeUserSessions(userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function getPasswordHash(userId: string): string | undefined {
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(userId) as { password_hash: string } | undefined
  return row?.password_hash
}
