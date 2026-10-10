import type { Artwork, GenerationParams } from './jewelry'
import { buildPrompt, makeTinyThumb } from './jewelry'
import { apiFetch, isEmbedMode } from './http'

export interface ApiStatus {
  ok: true
  provider: string
  ready: boolean
  message: string
  /** Admin-selected image model applied to every generation */
  model?: { id: string; name: string; resolution: string }
}

interface GenerateSuccess {
  ok: true
  provider: string
  prompt: string
  model: string
  images: { url: string; width?: number; height?: number; model?: string }[]
}

interface GenerateError {
  ok: false
  error: string
  code?: string
}

interface ReviseSuccess {
  ok: true
  revisedPrompt: string
  summary: string
}

function notifyAuthFailure(res: Response): void {
  if (res.status === 401 && !isEmbedMode()) {
    window.dispatchEvent(new Event('aurastudio:auth-expired'))
  }
}

async function parseJsonResponse<T>(
  res: Response,
  emptyMessage: string,
): Promise<T> {
  const raw = await res.text()
  if (!raw.trim()) {
    throw new Error(emptyMessage)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`服务返回数据格式异常（HTTP ${res.status}），请稍后重试`)
  }
}

/** Fetch provider status from local API proxy (no secrets exposed) */
export async function fetchApiStatus(): Promise<ApiStatus | null> {
  try {
    const res = await apiFetch('/api/status')
    notifyAuthFailure(res)
    if (!res.ok) return null
    return (await res.json()) as ApiStatus
  } catch {
    return null
  }
}

/** Client data saved with a server job so the UI can resume after a reload */
export interface JobContext {
  userText: string
  source: 'guide' | 'agent'
  params: Omit<GenerationParams, 'references'>
  startedAt: number
  selectedProductRefIds: string[]
  /** Tiny preview of the primary product image for the gallery card */
  referenceThumb?: string
}

export interface GenerationJob {
  id: string
  status: 'running' | 'success' | 'failed'
  context: JobContext | null
  result?: GenerateSuccess
  error?: string
  createdAt: number
  updatedAt: number
}

type JobResponse = { ok: true; job: GenerationJob } | GenerateError

/**
 * Starts a server-side generation job. The job keeps running even if this
 * page reloads; poll it with waitForJob. API keys never leave the server.
 */
export async function startGenerationJob(
  params: GenerationParams,
  prompt: string,
  context: Omit<JobContext, 'referenceThumb'>,
): Promise<GenerationJob> {
  const trimmed = prompt.trim() || buildPrompt(params).trim()
  if (!trimmed) throw new Error('提示词不能为空')
  const useRefs = params.mode === 'reference' && params.references.length > 0

  let referenceThumb: string | undefined
  if (useRefs) {
    try {
      referenceThumb = await makeTinyThumb(params.references[0])
    } catch {
      referenceThumb = undefined
    }
  }

  const res = await apiFetch('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      mode: params.mode,
      prompt: trimmed,
      count: params.count,
      references: useRefs ? params.references : undefined,
      meta: {
        category: params.category,
        metal: params.metal,
        stone: params.stone,
        scene: params.scene,
        imageType: params.imageType,
      },
      context: { ...context, referenceThumb } satisfies JobContext,
    }),
  })
  notifyAuthFailure(res)
  const data = await parseJsonResponse<JobResponse>(
    res,
    '提交生成任务失败，请检查网络后重试',
  )
  if (!res.ok || !data.ok) {
    throw new Error(!data.ok ? data.error : `HTTP ${res.status}`)
  }
  return data.job
}

const JOB_POLL_MS = 2500
const JOB_TIMEOUT_MS = 15 * 60 * 1000

/** Polls until the job finishes; transient network errors are retried. */
export async function waitForJob(
  jobId: string,
  startedAt: number,
  onProgress?: (pct: number) => void,
): Promise<GenerationJob> {
  for (;;) {
    const elapsed = Date.now() - startedAt
    onProgress?.(Math.round(8 + 84 * (1 - Math.exp(-elapsed / 60_000))))
    if (elapsed > JOB_TIMEOUT_MS) {
      throw new Error('生成超时，请稍后在历史任务中查看或重新生成')
    }

    try {
      const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        cache: 'no-store',
      })
      notifyAuthFailure(res)
      if (res.status === 404) throw new Error('任务不存在或已过期')
      if (res.ok) {
        const data = (await res.json()) as JobResponse
        if (data.ok && data.job.status !== 'running') {
          onProgress?.(100)
          return data.job
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === '任务不存在或已过期') throw e
    }

    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS))
  }
}

export async function listPendingJobsViaApi(): Promise<GenerationJob[]> {
  const res = await apiFetch('/api/jobs/pending', { cache: 'no-store' })
  notifyAuthFailure(res)
  if (!res.ok) return []
  const data = (await res.json()) as
    | { ok: true; jobs: GenerationJob[] }
    | GenerateError
  return data.ok ? data.jobs : []
}

export async function listMineJobsViaApi(
  limit = 40,
): Promise<GenerationJob[]> {
  const res = await apiFetch(`/api/jobs/mine?limit=${limit}`, {
    cache: 'no-store',
  })
  notifyAuthFailure(res)
  if (!res.ok) return []
  const data = (await res.json()) as
    | { ok: true; jobs: GenerationJob[] }
    | GenerateError
  return data.ok ? data.jobs : []
}

/** Returns true when this tab is the one that should record the result. */
export async function ackJobViaApi(jobId: string): Promise<boolean> {
  const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/ack`, {
    method: 'POST',
  })
  notifyAuthFailure(res)
  if (!res.ok) return false
  const data = (await res.json()) as { ok: true; claimed: boolean }
  return data.claimed
}

export function artworksFromJob(job: GenerationJob): Artwork[] {
  const result = job.result
  const ctx = job.context
  if (!result) return []
  const params: GenerationParams = {
    ...(ctx?.params ?? {
      category: 'ring',
      metal: 'yellow_gold',
      stone: 'diamond',
      scene: 'white_bg',
      imageType: 'product_white',
      prompt: '',
      count: 1,
      mode: 'reference',
    }),
    prompt: result.prompt,
    references: [],
  }
  return result.images.map((img, i) => ({
    id: `art_${job.id.slice(0, 8)}_${i}`,
    url: img.url,
    prompt: result.prompt,
    params,
    createdAt: job.createdAt,
    favorite: false,
    referenceThumb: ctx?.referenceThumb,
    provider: result.provider,
    model: img.model || result.model,
  }))
}

export async function revisePromptViaApi(
  basePrompt: string,
  instruction: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  targetImageType?:
    | 'product_white'
    | 'model_bracelet_bangle'
    | 'model_earring'
    | 'model_necklace_pendant'
    | 'model_ring'
    | 'model_set'
    | 'atmosphere',
): Promise<{ revisedPrompt: string; summary: string }> {
  const res = await apiFetch('/api/agent/revise', {
    method: 'POST',
    body: JSON.stringify({
      basePrompt,
      instruction,
      history,
      targetImageType,
    }),
  })
  notifyAuthFailure(res)
  const data = await parseJsonResponse<ReviseSuccess | GenerateError>(
    res,
    'Agent 连接已中断，请检查网络后重试',
  )
  if (!res.ok || !data.ok) {
    const msg = !data.ok ? data.error : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return {
    revisedPrompt: data.revisedPrompt,
    summary: data.summary,
  }
}

export async function downloadImageViaApi(
  sourceUrl: string,
  filename?: string,
): Promise<void> {
  const absoluteUrl = new URL(sourceUrl, window.location.origin).toString()
  const query = new URLSearchParams({ url: absoluteUrl })
  if (filename) query.set('filename', filename)

  const res = await apiFetch(`/api/download?${query.toString()}`, {
    cache: 'no-store',
  })
  notifyAuthFailure(res)
  if (!res.ok) {
    let msg = `下载失败（HTTP ${res.status}）`
    try {
      const data = (await res.json()) as GenerateError
      if (!data.ok && data.error) msg = data.error
    } catch {
      // ignore json parse failures
    }
    throw new Error(msg)
  }

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename || `aurastudio-${Date.now()}.jpg`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
