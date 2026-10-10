import { serverConfig } from '../config'
import { getGenerationSettings } from '../settings/store'
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

class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('VibraDraft 调用过于频繁（每分钟 60 次上限），请稍后重试')
  }
}

/** The MCP token is limited to 60 calls/minute; wait out short bursts. */
async function mcpCall(
  method: string,
  params: Record<string, unknown>,
  id: number,
): Promise<JsonRpcSuccess> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await mcpCallOnce(method, params, id)
    } catch (e) {
      if (!(e instanceof RateLimitError) || attempt >= 3) throw e
      await sleep(Math.min(30_000, Math.max(2_000, e.retryAfterMs)))
    }
  }
}

async function mcpCallOnce(
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
      if (res.status === 429) {
        const retryAfter = Number(/"retryAfterMs"\s*:\s*(\d+)/.exec(text)?.[1])
        throw new RateLimitError(Number.isFinite(retryAfter) ? retryAfter : 10_000)
      }
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
        return localizeProviderMessage(nested.error.message)
      }
    }
  } catch {
    // keep raw
  }
  return localizeProviderMessage(raw)
}

function localizeProviderMessage(raw: string): string {
  if (/not valid/i.test(raw)) {
    return '参考图格式无效，请改用 JPG/PNG 后重试'
  }
  if (/did not generate an image/i.test(raw)) {
    return '模型未返回图片。可换一张参考图、改用 GPT-Image-2，或稍后再试'
  }
  if (/rate limit|too many requests/i.test(raw)) {
    return '生图服务繁忙（调用频率超限），请稍等一会儿再试'
  }
  if (/resource has been exhausted|check quota|quota/i.test(raw)) {
    return '该模型额度已用尽，请在管理后台切换其他模型（如 GPT-Image-2）'
  }
  if (/safety|blocked|policy/i.test(raw)) {
    return '内容被模型安全策略拦截，请调整参考图或提示词后重试'
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

  const settings = getGenerationSettings()
  const args: Record<string, unknown> = {
    prompt: body.prompt,
    saveToCanvas: false,
    waitForResult: false,
    aspectRatio: '1:1',
    resolution: settings.resolution,
    modelId: settings.imageModelId,
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
  // 4s keeps several concurrent tasks under the 60 calls/minute token limit.
  const maxAttempts = 90
  let interval = 4000

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
      interval = Math.min(8000, Math.max(4000, sc.pollIntervalMs))
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

export interface VibradraftModel {
  id: string
  displayName: string
  type: 'image' | 'video' | string
  providerName: string
  status: string
  supportedModes: string[]
  supportedResolutions: string[]
  supportedAspectRatios: string[]
  supportsCustomSize: boolean
  /** Diamonds per generation, from vibra_estimate_cost */
  cost?: number
  costCny?: number
}

const MODEL_CACHE_MS = 5 * 60 * 1000
let modelCache: { at: number; models: VibradraftModel[] } | null = null

async function estimateCost(
  model: VibradraftModel,
): Promise<{ cost?: number; costCny?: number }> {
  try {
    const sc = getStructured(
      await callTool(
        'vibra_estimate_cost',
        {
          mode: model.type === 'video' ? 'video' : 'image',
          modelId: model.id,
          ...(model.supportedModes.includes('edit') ? { images: ['x'] } : {}),
        },
        900,
      ),
    )
    const est = sc?.estimate as
      | { cost?: string | number; modelInfo?: { actualCostCny?: number } }
      | undefined
    const cost = Number(est?.cost)
    const cny = est?.modelInfo?.actualCostCny
    return {
      cost: Number.isFinite(cost) ? cost : undefined,
      costCny: typeof cny === 'number' ? Math.round(cny * 100) / 100 : undefined,
    }
  } catch {
    return {}
  }
}

/** Models available to the configured token, cached briefly. */
export async function listVibradraftModels(
  force = false,
): Promise<VibradraftModel[]> {
  if (!force && modelCache && Date.now() - modelCache.at < MODEL_CACHE_MS) {
    return modelCache.models
  }
  const sc = getStructured(await callTool('vibra_list_models', {}, 800))
  const raw = (sc?.models as Array<Record<string, unknown>> | undefined) ?? []
  const models: VibradraftModel[] = raw.map((m) => {
    const caps = (m.capabilities ?? {}) as Record<string, unknown>
    const strList = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    return {
      id: String(m.id),
      displayName: String(m.displayName || m.id),
      type: String(m.type || 'image'),
      providerName: String(m.providerName || m.providerId || ''),
      status: String(m.status || 'unknown'),
      supportedModes: strList(m.supportedModes),
      supportedResolutions: strList(m.supportedResolutions),
      supportedAspectRatios: strList(m.supportedAspectRatios),
      supportsCustomSize: Boolean(caps.supportsCustomSize),
    }
  })
  const costs = await Promise.all(models.map(estimateCost))
  models.forEach((m, i) => Object.assign(m, costs[i]))
  modelCache = { at: Date.now(), models }
  return models
}

export async function getDiamondBalance(): Promise<number | null> {
  try {
    const sc = getStructured(await callTool('vibra_get_diamond_balance', {}, 801))
    const total = (sc?.balance as { total?: number } | undefined)?.total
    return typeof total === 'number' ? total : null
  } catch {
    return null
  }
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
