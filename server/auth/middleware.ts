import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { getEmbedApp, toAppInfo } from '../embed/store'
import type { AuthVariables } from '../types'
import { resolveSession } from './store'

export const SESSION_COOKIE = 'aurastudio_session'

export const requireAuth: MiddlewareHandler<{
  Variables: AuthVariables
}> = async (c, next) => {
  const cookieToken = getCookie(c, SESSION_COOKIE)
  const authHeader = c.req.header('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : ''

  const resolved = bearerToken
    ? resolveSession(bearerToken)
    : cookieToken
      ? resolveSession(cookieToken)
      : undefined

  if (!resolved) {
    return c.json(
      { ok: false, error: '登录已失效，请重新登录', code: 'UNAUTHORIZED' },
      401,
    )
  }

  // Bearer tokens are only valid for embed sessions (prevent cookie-token reuse as Bearer)
  if (bearerToken && resolved.kind !== 'embed') {
    return c.json(
      { ok: false, error: '登录已失效，请重新登录', code: 'UNAUTHORIZED' },
      401,
    )
  }

  c.set('authUser', resolved.user)
  c.set('authSessionId', resolved.sessionId)
  c.set('sessionKind', resolved.kind)
  if (resolved.kind === 'embed' && resolved.appId) {
    const app = getEmbedApp(resolved.appId)
    if (!app || app.status !== 'active') {
      return c.json(
        { ok: false, error: '接入应用已停用', code: 'APP_DISABLED' },
        403,
      )
    }
    c.set('authApp', toAppInfo(app))
  }
  await next()
}

export const requireAdmin: MiddlewareHandler<{
  Variables: AuthVariables
}> = async (c, next) => {
  const user = c.get('authUser')
  if (user.role !== 'admin') {
    return c.json(
      { ok: false, error: '仅管理员可执行此操作', code: 'FORBIDDEN' },
      403,
    )
  }
  await next()
}

export const requirePasswordChanged: MiddlewareHandler<{
  Variables: AuthVariables
}> = async (c, next) => {
  // Embed shadow users never need a password change
  if (c.get('sessionKind') === 'embed') {
    await next()
    return
  }
  const user = c.get('authUser')
  if (user.mustChangePassword) {
    return c.json(
      {
        ok: false,
        error: '首次登录必须先修改密码',
        code: 'PASSWORD_CHANGE_REQUIRED',
      },
      403,
    )
  }
  await next()
}
