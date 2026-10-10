export type GenerateMode = 'text' | 'reference'
export type UserRole = 'admin' | 'user'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  disabled: boolean
  mustChangePassword: boolean
  createdAt: number
  updatedAt: number
  lastLoginAt?: number
  /** Present when this is a shadow user created by an embed app */
  appId?: string
  externalId?: string
}

export interface EmbedAppInfo {
  id: string
  name: string
  allowedOrigins: string[]
  webhookUrl: string | null
  dailyImageQuota: number
  status: 'active' | 'disabled'
}

export interface AuthVariables {
  authUser: AuthUser
  authSessionId: string
  /** Set when the session was issued via embed ticket exchange */
  authApp?: EmbedAppInfo
  sessionKind?: 'cookie' | 'embed'
}

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
  /** Admin-selected image model, applied to every generation */
  model?: { id: string; name: string; resolution: string }
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
