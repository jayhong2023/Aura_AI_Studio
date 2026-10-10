import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createSession,
  findOrCreateEmbedUser,
  markLogin,
} from '../auth/store'
import { getGenerationSettings } from '../settings/store'
import type { AuthVariables } from '../types'
import {
  consumeTicket,
  countTodayImagesForApp,
  createTicket,
  getEmbedApp,
  toAppInfo,
  verifyAppRequest,
} from './store'

type Env = { Variables: AuthVariables }

export const embedRoutes = new Hono<Env>()

function getClientIp(c: {
  req: { header: (name: string) => string | undefined }
}): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

/**
 * Host backend issues a one-time ticket for an end user.
 * Headers: X-Aura-AppId, X-Aura-Timestamp, X-Aura-Signature
 * Body: { externalUserId, displayName? }
 */
embedRoutes.post('/v1/tickets', async (c) => {
  const appId = c.req.header('x-aura-appid') || ''
  const timestamp = c.req.header('x-aura-timestamp') || ''
  const signature = c.req.header('x-aura-signature') || ''
  const rawBody = await c.req.text()
  const app = verifyAppRequest(appId, timestamp, rawBody, signature)
  if (!app) {
    return c.json(
      { ok: false, error: '签名无效或应用不可用', code: 'INVALID_SIGNATURE' },
      401,
    )
  }

  let body: { externalUserId?: string; displayName?: string }
  try {
    body = JSON.parse(rawBody || '{}') as typeof body
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const externalUserId = body.externalUserId?.trim() || ''
  if (!externalUserId || externalUserId.length > 128) {
    return c.json({ ok: false, error: 'externalUserId 无效' }, 400)
  }

  const { ticket, expiresAt } = createTicket({
    appId: app.id,
    externalUserId,
  })
  return c.json({
    ok: true,
    ticket,
    expiresAt,
    embedUrl: `/embed/?appId=${encodeURIComponent(app.id)}&ticket=${encodeURIComponent(ticket)}`,
  })
})

/** Exchange a one-time ticket for a Bearer access token. */
embedRoutes.post('/v1/session', async (c) => {
  let body: { ticket?: string; appId?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const ticket = body.ticket?.trim() || ''
  if (!ticket) return c.json({ ok: false, error: '缺少 ticket' }, 400)

  const consumed = consumeTicket(ticket)
  if (!consumed) {
    return c.json(
      { ok: false, error: '票据无效、已过期或已使用', code: 'INVALID_TICKET' },
      401,
    )
  }
  if (body.appId && body.appId !== consumed.appId) {
    return c.json({ ok: false, error: 'appId 与票据不匹配' }, 400)
  }

  const app = getEmbedApp(consumed.appId)
  if (!app || app.status !== 'active') {
    return c.json({ ok: false, error: '接入应用已停用' }, 403)
  }

  try {
    const user = await findOrCreateEmbedUser({
      appId: consumed.appId,
      externalId: consumed.externalUserId,
    })
    markLogin(user.id)
    const session = createSession({
      userId: user.id,
      kind: 'embed',
      appId: app.id,
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent'),
    })
    return c.json({
      ok: true,
      accessToken: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        externalId: user.externalId,
        displayName: user.displayName,
      },
      app: toAppInfo(app),
    })
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : '创建会话失败' },
      400,
    )
  }
})

/** Config for the embed page (requires Bearer embed session). */
embedRoutes.use('/v1/config', async (c, next) => {
  const { requireAuth } = await import('../auth/middleware')
  return requireAuth(c, next)
})
embedRoutes.get('/v1/config', (c) => {
  const app = c.get('authApp')
  if (!app) {
    return c.json({ ok: false, error: '仅嵌入会话可访问' }, 403)
  }
  const settings = getGenerationSettings()
  const used = countTodayImagesForApp(app.id)
  return c.json({
    ok: true,
    app: {
      id: app.id,
      name: app.name,
      dailyImageQuota: app.dailyImageQuota,
      remainingImages: Math.max(0, app.dailyImageQuota - used),
    },
    model: {
      id: settings.imageModelId,
      name: settings.imageModelName,
      resolution: settings.resolution,
    },
    imageTypes: [
      'product_white',
      'model_necklace_pendant',
      'model_bracelet_bangle',
      'model_earring',
      'model_ring',
      'model_set',
      'atmosphere',
    ],
  })
})

/**
 * Serve embed HTML with frame-ancestors CSP based on appId query.
 * Nginx proxies /embed/ here.
 */
export async function serveEmbedHtml(appId: string | undefined): Promise<{
  html: string
  csp: string
}> {
  const candidates = [
    resolve(process.cwd(), 'dist/embed/index.html'),
    resolve(process.cwd(), 'embed/index.html'),
  ]
  let html = ''
  for (const path of candidates) {
    try {
      html = await readFile(path, 'utf8')
      break
    } catch {
      // try next
    }
  }
  if (!html) {
    html = `<!doctype html><html><body><p>Embed page not built. Run npm run build.</p></body></html>`
  }

  const app = appId ? getEmbedApp(appId) : undefined
  const ancestors =
    app && app.status === 'active' && app.allowedOrigins.length > 0
      ? app.allowedOrigins.join(' ')
      : "'none'"
  // Always allow same-origin and miniprogram web-view (no referrer origin)
  const csp = `frame-ancestors 'self' ${ancestors}`
  return { html, csp }
}
