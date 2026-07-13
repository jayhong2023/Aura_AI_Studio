import type { Artwork, GenerationParams } from './jewelry'
import { buildPrompt, makeTinyThumb } from './jewelry'

export interface ApiStatus {
  ok: true
  provider: string
  ready: boolean
  message: string
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

/** Fetch provider status from local API proxy (no secrets exposed) */
export async function fetchApiStatus(): Promise<ApiStatus | null> {
  try {
    const res = await fetch('/api/status')
    if (!res.ok) return null
    return (await res.json()) as ApiStatus
  } catch {
    return null
  }
}

/**
 * Call same-origin /api/generate — Vite proxies to the Node server.
 * API keys never leave the server process.
 */
export async function generateViaApi(
  params: GenerationParams,
  onProgress?: (pct: number) => void,
  /** When set, use this exact prompt instead of auto-building */
  overridePrompt?: string,
): Promise<Artwork[]> {
  const prompt = (overridePrompt ?? buildPrompt(params)).trim()
  if (!prompt) {
    throw new Error('提示词不能为空')
  }
  const useRefs = params.mode === 'reference' && params.references.length > 0

  let pct = 8
  onProgress?.(pct)
  const timer = setInterval(() => {
    pct = Math.min(88, pct + 3 + Math.random() * 4)
    onProgress?.(Math.round(pct))
  }, 400)

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: params.mode,
        prompt,
        count: params.count,
        references: useRefs ? params.references : undefined,
        meta: {
          category: params.category,
          metal: params.metal,
          stone: params.stone,
          scene: params.scene,
          imageType: params.imageType,
        },
      }),
    })

    const data = (await res.json()) as GenerateSuccess | GenerateError

    if (!res.ok || !data.ok) {
      const msg = !data.ok ? data.error : `HTTP ${res.status}`
      throw new Error(msg)
    }

    onProgress?.(96)

    let thumb: string | undefined
    if (useRefs) {
      try {
        thumb = await makeTinyThumb(params.references[0])
      } catch {
        thumb = undefined
      }
    }

    onProgress?.(100)

    return data.images.map((img, i) => ({
      id: `art_${Date.now()}_${i}`,
      url: img.url,
      prompt: data.prompt,
      params: {
        ...params,
        prompt: data.prompt,
        references: [],
      },
      createdAt: Date.now(),
      favorite: false,
      referenceThumb: thumb,
      provider: data.provider,
      model: img.model || data.model,
    }))
  } finally {
    clearInterval(timer)
  }
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
  const res = await fetch('/api/agent/revise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      basePrompt,
      instruction,
      history,
      targetImageType,
    }),
  })
  const data = (await res.json()) as ReviseSuccess | GenerateError
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

  const res = await fetch(`/api/download?${query.toString()}`)
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
