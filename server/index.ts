import { serve } from '@hono/node-server'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stream } from 'hono/streaming'
import { revisePrompt } from './agent/revise'
import {
  requireAuth,
  requirePasswordChanged,
} from './auth/middleware'
import { adminConsoleRoutes } from './admin/routes'
import { adminRoutes, authRoutes } from './auth/routes'
import { initializeAuthStore } from './auth/store'
import {
  acknowledgeJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  initializeJobStore,
  listMineJobs,
  listPendingJobs,
  type GenerationJob,
} from './jobs/store'
import { assertProviderReady, serverConfig } from './config'
import { signAssetUrlsInResult, verifyAssetSignature } from './embed/assets'
import { embedRoutes, serveEmbedHtml } from './embed/routes'
import { countTodayImagesForApp } from './embed/store'
import { dispatchJobWebhook } from './embed/webhook'
import { generateWithDemo } from './providers/demo'
import { generateWithFal } from './providers/fal'
import { generateWithVibradraft } from './providers/vibradraft'
import { getGenerationSettings } from './settings/store'
import { persistGeneratedImages, readAssetFile } from './storage'
import type {
  AgentReviseRequest,
  ErrorResponse,
  GenerateRequestBody,
  GenerateResponse,
  StatusResponse,
  AuthVariables,
} from './types'

const ASSET_TTL_MS = 24 * 60 * 60 * 1000

function withSignedAssets(job: GenerationJob): GenerationJob {
  if (!job.result?.images) return job
  return {
    ...job,
    result: {
      ...job.result,
      images: signAssetUrlsInResult(job.result.images, ASSET_TTL_MS),
    },
  }
}

function isPrivateIp(address: string): boolean {
  if (address === '::1' || address === '::') return true
  const lower = address.toLowerCase()
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) {
    return true
  }
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  const ipv4 = mapped || (isIP(address) === 4 ? address : '')
  if (!ipv4) return false
  const [a, b] = ipv4.split('.').map(Number)
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

async function assertPublicRemoteTarget(target: URL): Promise<void> {
  if (target.username || target.password) throw new Error('下载地址不能包含凭据')
  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('不允许访问本机地址')
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((item) => isPrivateIp(item.address))) {
    throw new Error('不允许访问内网地址')
  }
}

async function fetchPublicRemote(target: URL): Promise<Response> {
  let current = target
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    await assertPublicRemoteTarget(current)
    const response = await fetch(current, { redirect: 'manual' })
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get('location')
    ) {
      current = new URL(response.headers.get('location')!, current)
      continue
    }
    return response
  }
  throw new Error('下载地址重定向次数过多')
}

const app = new Hono<{ Variables: AuthVariables }>()

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Aura-AppId',
      'X-Aura-Timestamp',
      'X-Aura-Signature',
    ],
    credentials: true,
  }),
)

app.get('/api/health', (c) => {
  return c.json({ ok: true, service: 'aurastudio-api' })
})

app.route('/api/auth', authRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/admin', adminConsoleRoutes)
app.route('/api/embed', embedRoutes)

/** Embed SPA with per-app frame-ancestors CSP */
app.get('/embed', async (c) => {
  const { html, csp } = await serveEmbedHtml(c.req.query('appId'))
  return c.html(html, 200, {
    'Content-Security-Policy': csp,
    'Cache-Control': 'no-store',
  })
})
app.get('/embed/', async (c) => {
  const { html, csp } = await serveEmbedHtml(c.req.query('appId'))
  return c.html(html, 200, {
    'Content-Security-Policy': csp,
    'Cache-Control': 'no-store',
  })
})

app.use('/api/status', requireAuth, requirePasswordChanged)
app.use('/api/download', requireAuth, requirePasswordChanged)
app.use('/api/agent/revise', requireAuth, requirePasswordChanged)
app.use('/api/generate', requireAuth, requirePasswordChanged)
app.use('/api/jobs', requireAuth, requirePasswordChanged)
app.use('/api/jobs/*', requireAuth, requirePasswordChanged)

app.get('/api/status', (c) => {
  let ready = true
  let message = '演示模式：无需密钥，返回模拟图'

  if (serverConfig.provider === 'fal') {
    ready = Boolean(serverConfig.falKey)
    message = ready
      ? 'fal.ai 已就绪（密钥仅存于服务端）'
      : '已选择 fal，但缺少 FAL_KEY'
  } else if (serverConfig.provider === 'vibradraft') {
    ready = Boolean(serverConfig.vibradraftToken)
    message = ready
      ? 'VibraDraft MCP 已就绪（Token 仅存于服务端）'
      : '已选择 vibradraft，但缺少 VIBRADRAFT_MCP_TOKEN'
  }

  const settings = getGenerationSettings()
  const body: StatusResponse = {
    ok: true,
    provider: serverConfig.provider,
    ready,
    message,
    model:
      serverConfig.provider === 'vibradraft'
        ? {
            id: settings.imageModelId,
            name: settings.imageModelName,
            resolution: settings.resolution,
          }
        : undefined,
  }
  return c.json(body)
})

app.get('/api/assets/:filename', async (c) => {
  const filename = c.req.param('filename')
  const exp = c.req.query('exp')
  const sig = c.req.query('sig')
  const hasValidSig = verifyAssetSignature(filename, exp, sig)

  if (!hasValidSig) {
    // Fall back to session auth (cookie or Bearer)
    const cookie = c.req.header('cookie') || ''
    const auth = c.req.header('authorization') || ''
    if (!cookie.includes('aurastudio_session=') && !auth.startsWith('Bearer ')) {
      return c.json(
        { ok: false, error: '未授权', code: 'UNAUTHORIZED' },
        401,
      )
    }
    // Lightweight re-check via requireAuth pattern
    const { resolveSession } = await import('./auth/store')
    const { getCookie } = await import('hono/cookie')
    const token =
      (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '') ||
      getCookie(c, 'aurastudio_session') ||
      ''
    if (!resolveSession(token)) {
      return c.json(
        { ok: false, error: '未授权', code: 'UNAUTHORIZED' },
        401,
      )
    }
  }

  try {
    const { bytes, contentType } = await readAssetFile(filename)
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': hasValidSig
          ? 'private, max-age=3600'
          : 'private, no-store',
      },
    })
  } catch {
    const err: ErrorResponse = {
      ok: false,
      error: '素材不存在或已被清理',
      code: 'NOT_FOUND',
    }
    return c.json(err, 404)
  }
})

app.get('/api/download', async (c) => {
  const sourceUrl = c.req.query('url')
  const requestedName = c.req.query('filename')

  if (!sourceUrl) {
    const err: ErrorResponse = {
      ok: false,
      error: '缺少 url 参数',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  let target: URL
  try {
    target = new URL(sourceUrl)
  } catch {
    const err: ErrorResponse = {
      ok: false,
      error: 'url 参数无效',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    const err: ErrorResponse = {
      ok: false,
      error: '仅支持 http/https 下载地址',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  // Treat our asset route as local regardless of Host. Vite's dev proxy uses
  // changeOrigin, so localhost:5173 becomes localhost:8787 before reaching us.
  if (target.pathname.startsWith('/api/assets/')) {
    try {
      const filename = decodeURIComponent(target.pathname.split('/').pop() || '')
      const { bytes, contentType } = await readAssetFile(filename)
      const safeName =
        requestedName?.replace(/[\\/:*?"<>|]+/g, '_').trim() || filename
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        },
      })
    } catch {
      const err: ErrorResponse = {
        ok: false,
        error: '素材不存在或已被清理',
        code: 'NOT_FOUND',
      }
      return c.json(err, 404)
    }
  }

  try {
    const upstream = await fetchPublicRemote(target)
    if (!upstream.ok) {
      const err: ErrorResponse = {
        ok: false,
        error:
          upstream.status === 403
            ? '下载链接已过期，请重新生成图片后再下载'
            : `下载失败（HTTP ${upstream.status}）`,
        code: 'DOWNLOAD_FAILED',
      }
      return c.json(err, 502)
    }

    const contentType =
      upstream.headers.get('content-type') || 'application/octet-stream'
    const safeName =
      requestedName?.replace(/[\\/:*?"<>|]+/g, '_').trim() ||
      `aurastudio-${Date.now()}.jpg`
    const encodedName = encodeURIComponent(safeName)

    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Cache-Control', 'no-store')
    headers.set(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodedName}`,
    )

    if (upstream.body) {
      return new Response(upstream.body, { status: 200, headers })
    }
    const buffer = await upstream.arrayBuffer()
    return new Response(buffer, { status: 200, headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : '下载失败'
    const err: ErrorResponse = {
      ok: false,
      error: message,
      code: 'DOWNLOAD_FAILED',
    }
    return c.json(err, 500)
  }
})

app.post('/api/agent/revise', async (c) => {
  let body: AgentReviseRequest
  try {
    body = await c.req.json<AgentReviseRequest>()
  } catch {
    const err: ErrorResponse = {
      ok: false,
      error: '请求体必须是 JSON',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  try {
    const result = revisePrompt(body)
    return c.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : '修订失败'
    const err: ErrorResponse = {
      ok: false,
      error: message,
      code: 'REVISE_FAILED',
    }
    return c.json(err, 400)
  }
})

function badRequest(error: string): ErrorResponse {
  return { ok: false, error, code: 'BAD_REQUEST' }
}

/** Validates a generate body and returns the normalized payload or an error. */
function normalizeGenerateBody(
  body: GenerateRequestBody,
): GenerateRequestBody | ErrorResponse {
  if (!body.prompt?.trim()) return badRequest('prompt 不能为空')
  if (body.mode === 'reference' && !body.references?.length) {
    return badRequest('参考图模式需要至少一张图片')
  }
  const count = Math.min(4, Math.max(1, Number(body.count) || 1))
  const prompt = /拼图|多宫格|分屏/.test(body.prompt)
    ? body.prompt.trim()
    : `${body.prompt.trim()}，只输出一张单一画面照片，严禁拼图、多宫格、分屏或多视角拼接`
  return { ...body, count, prompt }
}

async function runGeneration(
  payload: GenerateRequestBody,
): Promise<GenerateResponse> {
  assertProviderReady()

  let images
  switch (serverConfig.provider) {
    case 'fal':
      images = await generateWithFal(payload)
      break
    case 'vibradraft':
      images = await generateWithVibradraft(payload)
      break
    default:
      images = await generateWithDemo(payload)
  }

  images = await persistGeneratedImages(images)

  const model =
    images.find((img) => img.model)?.model ||
    (serverConfig.provider === 'fal'
      ? 'fal-ai/flux/dev'
      : serverConfig.provider === 'vibradraft'
        ? getGenerationSettings().imageModelId
        : 'demo/placeholder')

  return {
    ok: true,
    provider: serverConfig.provider,
    prompt: payload.prompt,
    model,
    images,
  }
}

const MAX_JOB_CONTEXT_CHARS = 20_000

app.post('/api/jobs', async (c) => {
  let body: GenerateRequestBody & { context?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json(badRequest('请求体必须是 JSON'), 400)
  }
  const { context, ...generateBody } = body
  const normalized = normalizeGenerateBody(generateBody)
  if ('ok' in normalized && normalized.ok === false) {
    return c.json(normalized, 400)
  }
  if (JSON.stringify(context ?? null).length > MAX_JOB_CONTEXT_CHARS) {
    return c.json(badRequest('任务上下文过大'), 400)
  }
  const payload = normalized as GenerateRequestBody

  const user = c.get('authUser')
  const authApp = c.get('authApp')

  if (authApp) {
    const used = countTodayImagesForApp(authApp.id)
    if (used + payload.count > authApp.dailyImageQuota) {
      return c.json(
        {
          ok: false,
          error: `今日额度不足（已用 ${used}/${authApp.dailyImageQuota} 张）`,
          code: 'QUOTA_EXCEEDED',
        },
        429,
      )
    }
  }

  const job = createJob({
    userId: user.id,
    username: user.username,
    imageType: payload.meta?.imageType,
    model:
      serverConfig.provider === 'vibradraft'
        ? getGenerationSettings().imageModelId
        : serverConfig.provider,
    prompt: payload.prompt,
    context,
    appId: authApp?.id,
  })
  void runGeneration(payload)
    .then((result) => {
      completeJob(job.id, result)
      if (authApp && user.externalId) {
        void dispatchJobWebhook({
          jobId: job.id,
          appId: authApp.id,
          externalUserId: user.externalId,
          imageType: payload.meta?.imageType,
          result,
        })
      }
    })
    .catch((e) => {
      const message = e instanceof Error ? e.message : '生成失败'
      console.error('[job]', job.id, message)
      failJob(job.id, message)
    })
  return c.json({ ok: true, job: withSignedAssets(job) })
})

app.get('/api/jobs/pending', (c) => {
  const jobs = listPendingJobs(c.get('authUser').id).map(withSignedAssets)
  return c.json({ ok: true, jobs })
})

app.get('/api/jobs/mine', (c) => {
  const limit = Number(c.req.query('limit') || 40)
  const jobs = listMineJobs(c.get('authUser').id, limit).map(withSignedAssets)
  return c.json({ ok: true, jobs })
})

app.get('/api/jobs/:id', (c) => {
  const job = getJob(c.get('authUser').id, c.req.param('id'))
  if (!job) {
    return c.json({ ok: false, error: '任务不存在', code: 'NOT_FOUND' }, 404)
  }
  return c.json({ ok: true, job: withSignedAssets(job) })
})

app.post('/api/jobs/:id/ack', (c) => {
  const claimed = acknowledgeJob(c.get('authUser').id, c.req.param('id'))
  return c.json({ ok: true, claimed })
})

app.post('/api/generate', async (c) => {
  let body: GenerateRequestBody
  try {
    body = await c.req.json<GenerateRequestBody>()
  } catch {
    return c.json(badRequest('请求体必须是 JSON'), 400)
  }

  const normalized = normalizeGenerateBody(body)
  if ('ok' in normalized && normalized.ok === false) {
    return c.json(normalized, 400)
  }
  const payload = normalized as GenerateRequestBody

  c.header('Content-Type', 'application/json; charset=UTF-8')
  c.header('Cache-Control', 'no-store')
  c.header('X-Accel-Buffering', 'no')

  return stream(c, async (responseStream) => {
    // Public networks may close silent HTTP requests after ~120s. Leading JSON
    // whitespace is valid, so send it periodically until generation finishes.
    await responseStream.write(' \n')
    const heartbeat = setInterval(() => {
      void responseStream.write(' \n').catch(() => {
        // The generation task may still finish after the browser disconnects.
      })
    }, 15_000)

    try {
      const res = await runGeneration(payload)
      await responseStream.write(JSON.stringify(res))
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成失败'
      console.error('[generate]', message)
      const err: ErrorResponse = {
        ok: false,
        error: message,
        code: 'GENERATE_FAILED',
      }
      await responseStream.write(JSON.stringify(err))
    } finally {
      clearInterval(heartbeat)
    }
  })
})

const bootstrap = await initializeAuthStore()
initializeJobStore()
if (bootstrap.bootstrapped) {
  console.warn(
    `[AuraStudio Auth] 首次管理员已创建 username=${bootstrap.username} temporaryPassword=${bootstrap.temporaryPassword}`,
  )
  console.warn('[AuraStudio Auth] 首次登录后必须立即修改密码')
}

const port = serverConfig.port
console.log(
  `[AuraStudio API] http://localhost:${port}  provider=${serverConfig.provider}`,
)

serve({ fetch: app.fetch, port })
