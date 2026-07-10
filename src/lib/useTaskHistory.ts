import { useEffect, useState } from 'react'
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
  previewUrls: string[]
}

export type TaskHistoryInput = Omit<TaskHistoryItem, 'id' | 'createdAt'>

const STORAGE_KEY = 'aurastudio_task_history'

function load(): TaskHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
        previewUrls: Array.isArray(it.previewUrls) ? it.previewUrls : [],
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

const MAX_ITEMS = 80

function save(items: TaskHistoryItem[]) {
  // 输入/输出图片以 data URL 保存，体积较大，遇到配额超限时逐步丢弃最旧的记录。
  let slice = items.slice(0, MAX_ITEMS)
  while (slice.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slice))
      return
    } catch {
      slice = slice.slice(0, Math.max(1, Math.floor(slice.length / 2)))
      if (slice.length === 1) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slice))
        } catch {
          // 单条仍超限则放弃写入，避免抛出异常影响使用
        }
        return
      }
    }
  }
}

export function useTaskHistory() {
  const [items, setItems] = useState<TaskHistoryItem[]>(() => load())

  useEffect(() => {
    save(items)
  }, [items])

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

