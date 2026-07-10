import { useEffect, useState } from 'react'
import type { Artwork } from './jewelry'

const STORAGE_KEY = 'aurastudio_gallery'

function load(): Artwork[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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

function save(items: Artwork[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota exceeded — keep newest items only
    const trimmed = items.slice(0, Math.max(4, Math.floor(items.length / 2)))
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
}

export function useGallery() {
  const [items, setItems] = useState<Artwork[]>(() => load())

  useEffect(() => {
    save(items)
  }, [items])

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
