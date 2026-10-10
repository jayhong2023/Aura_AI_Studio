import { useEffect, useRef, useState } from 'react'
import type { Artwork } from './jewelry'

const LEGACY_STORAGE_KEY = 'aurastudio_gallery'
const MIGRATION_KEY = 'aurastudio_gallery_migrated'

function storageKey(ownerId: string): string {
  return `aurastudio_gallery:${ownerId}`
}

function load(ownerId?: string): Artwork[] {
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
    const parsed = JSON.parse(raw) as Artwork[]
    return parsed.map((a) => ({
      ...a,
      provider: a.provider,
      model: a.model,
      params: {
        ...a.params,
        mode: a.params?.mode ?? 'text',
        imageType: a.params?.imageType ?? 'product_white',
        references: a.params?.references ?? [],
      },
    }))
  } catch {
    return []
  }
}

function save(ownerId: string, items: Artwork[]) {
  const key = storageKey(ownerId)
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Quota exceeded — keep newest items only
    const trimmed = items.slice(0, Math.max(4, Math.floor(items.length / 2)))
    try {
      localStorage.setItem(key, JSON.stringify(trimmed))
    } catch {
      localStorage.removeItem(key)
    }
  }
}

export function useGallery(ownerId?: string) {
  const [items, setItems] = useState<Artwork[]>(() => load(ownerId))
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
    if (ownerId && itemsOwnerRef.current === ownerId) save(ownerId, items)
  }, [items, ownerId])

  const add = (artworks: Artwork[]) => {
    setItems((prev) => [...artworks, ...prev])
  }

  const toggleFavorite = (id: string) => {
    setItems((prev) =>
      prev.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a)),
    )
  }

  const remove = (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id))
  }

  const clear = () => setItems([])

  return { items, add, toggleFavorite, remove, clear }
}
