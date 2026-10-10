import { request } from '../lib/authApi'

export type ImageResolution = '1K' | '2K' | '4K'

export interface GenerationSettings {
  imageModelId: string
  imageModelName: string
  resolution: ImageResolution
  updatedAt?: number
  updatedBy?: string
}

export interface ModelInfo {
  id: string
  displayName: string
  type: string
  providerName: string
  status: string
  supportedModes: string[]
  supportedResolutions: string[]
  supportedAspectRatios: string[]
  supportsCustomSize: boolean
  cost?: number
  costCny?: number
}

export interface ModelsResponse {
  provider: string
  models: ModelInfo[]
  balance: number | null
  settings: GenerationSettings
  notice?: string
}

export type JobStatus = 'running' | 'success' | 'failed'

export interface HistoryRecord {
  id: string
  userId: string
  username: string
  status: JobStatus
  imageType: string | null
  model: string | null
  prompt: string | null
  imageCount: number
  images: string[]
  referenceThumb?: string
  userText?: string
  error: string | null
  appId: string | null
  createdAt: number
  updatedAt: number
}

export interface HistoryFilters {
  userId?: string
  status?: JobStatus | ''
  model?: string
  imageType?: string
  appId?: string
  keyword?: string
  from?: number
  to?: number
  page: number
  pageSize: number
}

export interface HistoryStats {
  totalJobs: number
  successJobs: number
  failedJobs: number
  runningJobs: number
  totalImages: number
  todayJobs: number
  todayImages: number
  activeUsers7d: number
  byModel: Array<{ model: string; jobs: number; images: number }>
  byDay: Array<{ day: string; jobs: number; images: number }>
}

export function fetchModels(refresh = false) {
  return request<{ ok: true } & ModelsResponse>(
    `/api/admin/models${refresh ? '?refresh=1' : ''}`,
  )
}

export async function saveGenerationSettings(
  imageModelId: string,
  resolution: ImageResolution,
): Promise<GenerationSettings> {
  const data = await request<{ ok: true; settings: GenerationSettings }>(
    '/api/admin/settings/generation',
    { method: 'PUT', body: JSON.stringify({ imageModelId, resolution }) },
  )
  return data.settings
}

export function fetchHistory(filters: HistoryFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return request<{ ok: true; items: HistoryRecord[]; total: number }>(
    `/api/admin/history?${params}`,
  )
}

export function fetchHistoryFacets() {
  return request<{
    ok: true
    users: Array<{ id: string; username: string; displayName: string }>
    models: string[]
    apps: Array<{ id: string; name: string }>
    appIds: string[]
  }>('/api/admin/history/facets')
}

export function fetchStats() {
  return request<{
    ok: true
    stats: HistoryStats
    userCount: number
    settings: GenerationSettings
  }>('/api/admin/stats')
}
