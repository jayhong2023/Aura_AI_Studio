import { serverConfig } from '../config'
import type { GenerateImageResult, GenerateRequestBody } from '../types'

interface JsonRpcSuccess {
  jsonrpc: '2.0'
  id: number
  result?: {
    content?: Array<{ type: string; text?: string }>
    structuredContent?: Record<string, unknown>
    isError?: boolean
  }
  error?: { code: number; message: string }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function mcpCall(
  method: string,
  params: Record<string, unknown>,
  id: number,
): Promise<JsonRpcSuccess> {
  const url = serverConfig.vibradraftUrl
  const token = serverConfig.vibradraftToken
  if (!url || !token) {
    throw new Error('VIBRADRAFT_MCP_URL / VIBRADRAFT_MCP_TOKEN 未配置')
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token.startsWith('Bearer ')
          ? token
          : `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`VibraDraft MCP HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = (await res.json()) as JsonRpcSuccess
    if (data.error) {
      throw new Error(`VibraDraft MCP: ${data.error.message}`)
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  id: number,
) {
  return mcpCall('tools/call', { name, arguments: args }, id)
}

function getStructured(data: JsonRpcSuccess): Record<string, unknown> | null {
  const sc = data.result?.structuredContent
  return sc && typeof sc === 'object' ? sc : null
}

/** Extract human-readable error from VibraDraft structured payload */
function extractErrorMessage(sc: Record<string, unknown>): string {
  const err = sc.error
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return simplifyProviderError(obj.message)
    }
    if (typeof obj.code === 'string') return `VibraDraft 错误: ${obj.code}`
  }
  if (typeof sc.message === 'string' && sc.message.trim()) return sc.message
  const result = sc.result as Record<string, unknown> | undefined
  if (result && typeof result.error === 'string') return result.error
  return 'VibraDraft 生成失败'
}

function simplifyProviderError(raw: string): string {
  // e.g. Image image failed: {"error":{"code":400,"message":"Provided image is not valid."...
  try {
    const jsonStart = raw.indexOf('{')
    if (jsonStart >= 0) {
      const nested = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string }
      }
      if (nested.error?.message) {
        const m = nested.error.message
        if (/not valid/i.test(m)) {
          return '参考图格式无效，请改用 JPG/PNG 后重试'
        }
        return m
      }
    }
  } catch {
    // keep raw
  }
  if (/not valid/i.test(raw)) {
    return '参考图格式无效，请改用 JPG/PNG 后重试'
  }
  return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw
}

/**
 * Normalize data URLs for VibraDraft:
 * - strip oversized payloads
 * - ensure image/* mime
 */
function normalizeReference(dataUrl: string, index: number): string {
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error(`第 ${index + 1} 张参考图不是有效的图片数据`)
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) {
    throw new Error(`第 ${index + 1} 张参考图编码无效，请重新上传 JPG/PNG`)
  }

  let mime = match[1].toLowerCase()
  const b64 = match[2].replace(/\s/g, '')

  // VibraDraft / Gemini 对 webp/heic 支持不稳定，提示用户
  if (mime.includes('heic') || mime.includes('heif')) {
    throw new Error('暂不支持 HEIC，请先转为 JPG/PNG 再上传')
  }

  // Treat jpeg variants uniformly
  if (mime === 'image/jpg') mime = 'image/jpeg'

  // ~4MB base64 ceiling to avoid MCP payload rejection
  const maxChars = 3_500_000
  if (b64.length > maxChars) {
    throw new Error(
      `第 ${index + 1} 张参考图过大，请压缩后再上传（建议边长 ≤ 1280）`,
    )
  }

  return `data:${mime};base64,${b64}`
}

async function startGeneration(
  body: GenerateRequestBody,
  index: number,
  refs: string[],
): Promise<string> {
  const isRef = body.mode === 'reference'
  const toolName = isRef ? 'vibra_image_to_image' : 'vibra_text_to_image'

  const args: Record<string, unknown> = {
    prompt: body.prompt,
    saveToCanvas: false,
    waitForResult: false,
    aspectRatio: '1:1',
    resolution: '1K',
  }

  if (serverConfig.vibradraftModelId) {
    args.modelId = serverConfig.vibradraftModelId
  }

  if (isRef) {
    if (refs.length === 0) {
      throw new Error('参考图模式需要至少一张图片')
    }
    // Cap refs per request — prioritize A区主体 + B区风格，最多5张
    args.images = refs.slice(0, 5)
  }

  const res = await callTool(toolName, args, 100 + index)
  const sc = getStructured(res)
  const taskId = typeof sc?.taskId === 'string' ? sc.taskId : null
  if (!taskId) {
    const hint = sc ? extractErrorMessage(sc) : 'VibraDraft 未返回 taskId'
    throw new Error(hint)
  }
  return taskId
}

async function pollUntilDone(taskId: string): Promise<GenerateImageResult> {
  const maxAttempts = 90
  let interval = 2000

  for (let i = 0; i < maxAttempts; i++) {
    const res = await callTool(
      'vibra_get_generation_task',
      { taskId },
      200 + i,
    )
    const sc = getStructured(res)
    if (!sc) {
      await sleep(interval)
      continue
    }

    if (typeof sc.pollIntervalMs === 'number' && sc.pollIntervalMs > 0) {
      interval = Math.min(5000, sc.pollIntervalMs)
    }

    const status = String(sc.status || '').toLowerCase()
    const mcpStatus = String(sc.mcpStatus || '').toLowerCase()

    if (
      status === 'failed' ||
      status === 'error' ||
      mcpStatus === 'failed' ||
      mcpStatus === 'error'
    ) {
      const msg = extractErrorMessage(sc)
      console.error('[vibradraft] task failed', taskId, JSON.stringify(sc.error))
      throw new Error(msg)
    }

    if (status === 'completed' || status === 'success') {
      const result = sc.result as Record<string, unknown> | undefined
      const mediaUrl =
        (typeof result?.mediaUrl === 'string' && result.mediaUrl) ||
        (typeof result?.url === 'string' && result.url) ||
        null

      if (!mediaUrl) {
        throw new Error('VibraDraft 任务完成但未返回图片 URL')
      }

      const model =
        (typeof result?.modelId === 'string' && result.modelId) ||
        (typeof (result?.usage as { modelId?: string } | undefined)?.modelId ===
          'string' &&
          (result?.usage as { modelId?: string }).modelId) ||
        undefined

      return {
        url: mediaUrl,
        width: typeof result?.width === 'number' ? result.width : undefined,
        height: typeof result?.height === 'number' ? result.height : undefined,
        model,
      }
    }

    await sleep(interval)
  }

  throw new Error('VibraDraft 生成超时，请稍后重试')
}

export async function generateWithVibradraft(
  body: GenerateRequestBody,
): Promise<GenerateImageResult[]> {
  const count = Math.min(4, Math.max(1, body.count || 1))
  const prompt = body.prompt?.trim()
  if (!prompt) {
    throw new Error('prompt 不能为空')
  }

  const refs =
    body.mode === 'reference'
      ? (body.references ?? []).map((r, i) => normalizeReference(r, i))
      : []

  // Reference mode stays sequential for stability; text mode can be parallel.
  const images: GenerateImageResult[] = []
  const errors: string[] = []

  if (body.mode === 'text') {
    // Parallel text-to-image to avoid "stuck for long time" UX.
    const settled = await Promise.allSettled(
      Array.from({ length: count }, async (_, i) => {
        const taskId = await startGeneration({ ...body, prompt }, i, refs)
        return pollUntilDone(taskId)
      }),
    )

    settled.forEach((it, i) => {
      if (it.status === 'fulfilled') {
        images.push(it.value)
      } else {
        const msg = it.reason instanceof Error ? it.reason.message : '生成失败'
        console.error(`[vibradraft] image ${i + 1}/${count} failed:`, msg)
        errors.push(msg)
      }
    })
  } else {
    // Sequential tasks: parallel I2I with large data URLs is flaky
    for (let i = 0; i < count; i++) {
      try {
        const taskId = await startGeneration({ ...body, prompt }, i, refs)
        const img = await pollUntilDone(taskId)
        images.push(img)
      } catch (e) {
        const msg = e instanceof Error ? e.message : '生成失败'
        console.error(`[vibradraft] image ${i + 1}/${count} failed:`, msg)
        errors.push(msg)
      }
    }
  }

  if (images.length === 0) {
    throw new Error(errors[0] || 'VibraDraft 生成失败')
  }

  return images
}

/** Lightweight readiness check via tools/list */
export async function checkVibradraftReady(): Promise<boolean> {
  try {
    const res = await mcpCall('tools/list', {}, 1)
    const tools = (res.result as { tools?: unknown[] } | undefined)?.tools
    return Array.isArray(tools) && tools.length > 0
  } catch {
    return false
  }
}
