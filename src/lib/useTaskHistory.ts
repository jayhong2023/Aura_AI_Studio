import { useEffect, useRef, useState } from 'react'
import type { GenerateMode, ImageType } from './jewelry'

export type TaskStatus = 'success' | 'failed'
export type TaskSource = 'guide' | 'agent'

export interface TaskHistoryItem {
  id: string
  createdAt: number
  status: TaskStatus
  source: TaskSource
  mode: GenerateMode
  imageType: ImageType
  prompt: string
  provider?: string
  model?: string
  countRequested: number
  countCompleted: number
  durationMs?: number
  errorMessage?: string
  productRefUrls?: string[]
  styleRefUrls?: string[]
  /** optional ids of A-zone images selected as target product views */
  selectedProductRefIds?: string[]
  previewUrls: string[]
}

export type TaskHistoryInput = Omit<TaskHistoryItem, 'id' | 'createdAt'>

const LEGACY_STORAGE_KEY = 'aurastudio_task_history'
const MIGRATION_KEY = 'aurastudio_task_history_migrated'

function storageKey(ownerId: string): string {
  return `aurastudio_task_history:${ownerId}`
}

function load(ownerId?: string): TaskHistoryItem[] {
  if (!ownerId) return []
  try {
    const key = storageKey(ownerId)
    let raw = localStorage.getItem(key)
    if (!raw && !localStorage.getItem(MIGRATION_KEY)) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (raw) localStorage.setItem(key, raw)
      localStorage.setItem(MIGRATION_KEY, ownerId)
    }
    if (!raw) return []
    const parsed = JSON.parse(raw) as TaskHistoryItem[]
    return parsed
      .map((it) => ({
        ...it,
        mode: it.mode ?? 'text',
        imageType: it.imageType ?? 'product_white',
        productRefUrls: Array.isArray(it.productRefUrls)
          ? it.productRefUrls
          : [],
        styleRefUrls: Array.isArray(it.styleRefUrls) ? it.styleRefUrls : [],
        selectedProductRefIds: Array.isArray(it.selectedProductRefIds)
          ? it.selectedProductRefIds
          : undefined,
        previewUrls: Array.isArray(it.previewUrls) ? it.previewUrls : [],
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

const MAX_ITEMS = 80

function save(ownerId: string, items: TaskHistoryItem[]) {
  const key = storageKey(ownerId)
  // 输入/输出图片以 data URL 保存，体积较大，遇到配额超限时逐步丢弃最旧的记录。
  let slice = items.slice(0, MAX_ITEMS)
  while (slice.length > 0) {
    try {
      localStorage.setItem(key, JSON.stringify(slice))
      return
    } catch {
      slice = slice.slice(0, Math.max(1, Math.floor(slice.length / 2)))
      if (slice.length === 1) {
        try {
          localStorage.setItem(key, JSON.stringify(slice))
        } catch {
          // 单条仍超限则放弃写入，避免抛出异常影响使用
        }
        return
      }
    }
  }
}

export function useTaskHistory(ownerId?: string) {
  const [items, setItems] = useState<TaskHistoryItem[]>(() => load(ownerId))
  const itemsOwnerRef = useRef(ownerId)
  const skipNextSaveRef = useRef(false)

  useEffect(() => {
    if (itemsOwnerRef.current === ownerId) return
    const next = load(ownerId)
    itemsOwnerRef.current = ownerId
    skipNextSaveRef.current = true
    setItems(next)
  }, [ownerId])

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (ownerId && itemsOwnerRef.current === ownerId) {
      save(ownerId, items)
    }
  }, [items, ownerId])

  const add = (input: TaskHistoryInput) => {
    const item: TaskHistoryItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      ...input,
    }
    setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS))
  }

  const remove = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const clear = () => setItems([])

  return { items, add, remove, clear }
}

