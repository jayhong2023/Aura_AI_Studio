export type GenerateMode = 'text' | 'reference'

export interface GenerateRequestBody {
  mode: GenerateMode
  prompt: string
  count: number
  /** data URLs, only for reference mode */
  references?: string[]
  /** jewelry params for logging / future routing */
  meta?: {
    category?: string
    metal?: string
    stone?: string
    scene?: string
    imageType?: string
  }
}

export interface GenerateImageResult {
  url: string
  /** remote URL from provider, or data URL in demo */
  width?: number
  height?: number
  /** concrete model id when available */
  model?: string
}

export interface GenerateResponse {
  ok: true
  provider: string
  prompt: string
  model: string
  images: GenerateImageResult[]
}

export interface ErrorResponse {
  ok: false
  error: string
  code?: string
}

export interface StatusResponse {
  ok: true
  provider: string
  ready: boolean
  message: string
}

export interface AgentReviseRequest {
  basePrompt: string
  instruction: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  targetImageType?:
    | 'product_white'
    | 'model_bracelet_bangle'
    | 'model_earring'
    | 'model_necklace_pendant'
    | 'model_ring'
    | 'model_set'
    | 'atmosphere'
}

export interface AgentReviseResponse {
  ok: true
  revisedPrompt: string
  summary: string
}
