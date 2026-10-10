import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { serverConfig } from '../config'
import type { AuthVariables, UserRole } from '../types'
import {
  requireAdmin,
  requireAuth,
  requirePasswordChanged,
  SESSION_COOKIE,
} from './middleware'
import { validatePassword, verifyPassword } from './password'
import {
  clearMustChangePassword,
  countEnabledAdmins,
  createSession,
  createUser,
  deleteUser,
  findUserWithPassword,
  getPasswordHash,
  getUserById,
  listUsers,
  markLogin,
  revokeSession,
  setUserPassword,
  updateUser,
  validateUsername,
} from './store'

type Env = { Variables: AuthVariables }

const loginAttempts = new Map<
  string,
  { count: number; firstAttemptAt: number }
>()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 8

function getClientIp(c: {
  req: { header: (name: string) => string | undefined }
}): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

function cookieSecure(c: {
  req: { header: (name: string) => string | undefined }
}): boolean {
  return (
    serverConfig.authCookieSecure ||
    c.req.header('x-forwarded-proto') === 'https'
  )
}

function setSessionCookie(
  c: Parameters<typeof setCookie>[0],
  token: string,
  expiresAt: number,
): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
  })
}

function checkLoginLimit(key: string): boolean {
  const now = Date.now()
  const current = loginAttempts.get(key)
  if (!current || now - current.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now })
    return true
  }
  current.count += 1
  return current.count <= MAX_LOGIN_ATTEMPTS
}

function parseRole(value: unknown): UserRole | null {
  return value === 'admin' || value === 'user' ? value : null
}

export const authRoutes = new Hono<Env>()

authRoutes.post('/login', async (c) => {
  let body: { username?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }

  const username = body.username?.trim().toLowerCase() || ''
  const password = body.password || ''
  const attemptKey = `${getClientIp(c)}:${username}`
  if (!checkLoginLimit(attemptKey)) {
    return c.json(
      { ok: false, error: '登录尝试过多，请 15 分钟后再试', code: 'RATE_LIMITED' },
      429,
    )
  }

  const row = username ? findUserWithPassword(username) : undefined
  // Shadow embed users cannot log in with password
  const isEmbedShadow = Boolean(
    row && (row as { app_id?: string | null }).app_id,
  )
  const valid =
    Boolean(row) &&
    !isEmbedShadow &&
    (await verifyPassword(password, row!.password_hash))
  if (!valid || row!.disabled) {
    // Keep user existence and disabled status indistinguishable.
    await new Promise((resolve) => setTimeout(resolve, 250))
    return c.json(
      { ok: false, error: '账号或密码错误', code: 'INVALID_CREDENTIALS' },
      401,
    )
  }

  loginAttempts.delete(attemptKey)
  markLogin(row!.id)
  const session = createSession({
    userId: row!.id,
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent'),
  })
  setSessionCookie(c, session.token, session.expiresAt)
  return c.json({ ok: true, user: getUserById(row!.id) })
})

authRoutes.use('/me', requireAuth)
authRoutes.get('/me', (c) => c.json({ ok: true, user: c.get('authUser') }))

authRoutes.use('/logout', requireAuth)
authRoutes.post('/logout', (c) => {
  revokeSession(c.get('authSessionId'))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoutes.use('/change-password', requireAuth)
authRoutes.post('/change-password', async (c) => {
  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const currentPassword = body.currentPassword || ''
  const newPassword = body.newPassword || ''
  const passwordError = validatePassword(newPassword)
  if (passwordError) return c.json({ ok: false, error: passwordError }, 400)
  if (currentPassword === newPassword) {
    return c.json({ ok: false, error: '新密码不能与当前密码相同' }, 400)
  }

  const user = c.get('authUser')
  const currentHash = getPasswordHash(user.id)
  if (!currentHash || !(await verifyPassword(currentPassword, currentHash))) {
    return c.json({ ok: false, error: '当前密码错误' }, 400)
  }

  await setUserPassword(user.id, newPassword, false)
  clearMustChangePassword(user.id)
  const session = createSession({
    userId: user.id,
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent'),
  })
  setSessionCookie(c, session.token, session.expiresAt)
  return c.json({ ok: true, user: getUserById(user.id) })
})

export const adminRoutes = new Hono<Env>()
adminRoutes.use('*', requireAuth, requirePasswordChanged, requireAdmin)

adminRoutes.get('/users', (c) => {
  return c.json({ ok: true, users: listUsers() })
})

adminRoutes.post('/users', async (c) => {
  let body: {
    username?: string
    displayName?: string
    password?: string
    role?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const username = body.username?.trim() || ''
  const password = body.password || ''
  const usernameError = validateUsername(username)
  const passwordError = validatePassword(password)
  const role = parseRole(body.role)
  if (usernameError) return c.json({ ok: false, error: usernameError }, 400)
  if (passwordError) return c.json({ ok: false, error: passwordError }, 400)
  if (!role) return c.json({ ok: false, error: '角色无效' }, 400)

  try {
    const user = await createUser({
      username,
      displayName: body.displayName,
      password,
      role,
    })
    return c.json({ ok: true, user }, 201)
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '创建用户失败',
      },
      400,
    )
  }
})

adminRoutes.patch('/users/:id', async (c) => {
  const id = c.req.param('id')
  const currentAdmin = c.get('authUser')
  const target = getUserById(id)
  if (!target) return c.json({ ok: false, error: '用户不存在' }, 404)

  let body: { displayName?: string; role?: string; disabled?: boolean }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const role = body.role === undefined ? undefined : parseRole(body.role)
  if (body.role !== undefined && !role) {
    return c.json({ ok: false, error: '角色无效' }, 400)
  }
  if (
    id === currentAdmin.id &&
    (body.disabled === true || (role && role !== 'admin'))
  ) {
    return c.json(
      { ok: false, error: '不能禁用自己或移除自己的管理员角色' },
      400,
    )
  }
  const removesEnabledAdmin =
    target.role === 'admin' &&
    !target.disabled &&
    (body.disabled === true || role === 'user')
  if (removesEnabledAdmin && countEnabledAdmins() <= 1) {
    return c.json({ ok: false, error: '必须保留至少一个可用管理员' }, 400)
  }

  const user = updateUser(id, {
    displayName: body.displayName,
    role: role ?? undefined,
    disabled: body.disabled,
  })
  return c.json({ ok: true, user })
})

adminRoutes.post('/users/:id/reset-password', async (c) => {
  const id = c.req.param('id')
  let body: { newPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const password = body.newPassword || ''
  const passwordError = validatePassword(password)
  if (passwordError) return c.json({ ok: false, error: passwordError }, 400)
  if (!getUserById(id)) return c.json({ ok: false, error: '用户不存在' }, 404)

  await setUserPassword(id, password, true)
  return c.json({ ok: true })
})

adminRoutes.delete('/users/:id', (c) => {
  const id = c.req.param('id')
  const currentAdmin = c.get('authUser')
  const target = getUserById(id)
  if (!target) return c.json({ ok: false, error: '用户不存在' }, 404)
  if (id === currentAdmin.id) {
    return c.json({ ok: false, error: '不能删除当前登录账号' }, 400)
  }
  if (
    target.role === 'admin' &&
    !target.disabled &&
    countEnabledAdmins() <= 1
  ) {
    return c.json({ ok: false, error: '必须保留至少一个可用管理员' }, 400)
  }
  deleteUser(id)
  return c.json({ ok: true })
})
