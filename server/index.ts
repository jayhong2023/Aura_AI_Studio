import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { revisePrompt } from './agent/revise'
import { assertProviderReady, serverConfig } from './config'
import { generateWithDemo } from './providers/demo'
import { generateWithFal } from './providers/fal'
import { generateWithVibradraft } from './providers/vibradraft'
import { persistGeneratedImages, readAssetFile } from './storage'
import type {
  AgentReviseRequest,
  ErrorResponse,
  GenerateRequestBody,
  GenerateResponse,
  StatusResponse,
} from './types'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
    ],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.get('/api/health', (c) => {
  return c.json({ ok: true, service: 'aurastudio-api' })
})

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

  const body: StatusResponse = {
    ok: true,
    provider: serverConfig.provider,
    ready,
    message,
  }
  return c.json(body)
})

app.get('/api/assets/:filename', async (c) => {
  const filename = c.req.param('filename')
  try {
    const { bytes, contentType } = await readAssetFile(filename)
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
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

  try {
    const upstream = await fetch(target.toString())
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

app.post('/api/generate', async (c) => {
  let body: GenerateRequestBody
  try {
    body = await c.req.json<GenerateRequestBody>()
  } catch {
    const err: ErrorResponse = {
      ok: false,
      error: '请求体必须是 JSON',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  if (!body.prompt?.trim()) {
    const err: ErrorResponse = {
      ok: false,
      error: 'prompt 不能为空',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  if (body.mode === 'reference' && !body.references?.length) {
    const err: ErrorResponse = {
      ok: false,
      error: '参考图模式需要至少一张图片',
      code: 'BAD_REQUEST',
    }
    return c.json(err, 400)
  }

  const count = Math.min(4, Math.max(1, Number(body.count) || 1))
  const payload: GenerateRequestBody = { ...body, count }

  try {
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
          ? serverConfig.vibradraftModelId || 'vibradraft/default'
          : 'demo/placeholder')

    const res: GenerateResponse = {
      ok: true,
      provider: serverConfig.provider,
      prompt: payload.prompt,
      model,
      images,
    }
    return c.json(res)
  } catch (e) {
    const message = e instanceof Error ? e.message : '生成失败'
    console.error('[generate]', message)
    const err: ErrorResponse = {
      ok: false,
      error: message,
      code: 'GENERATE_FAILED',
    }
    return c.json(err, 500)
  }
})

const port = serverConfig.port
console.log(
  `[AuraStudio API] http://localhost:${port}  provider=${serverConfig.provider}`,
)

serve({ fetch: app.fetch, port })
