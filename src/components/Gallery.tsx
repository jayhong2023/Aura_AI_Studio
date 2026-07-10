import { useMemo, useState } from 'react'
import { Heart, Images, Trash2 } from 'lucide-react'
import { ArtworkCard, PreviewModal } from './ArtworkCard'
import type { Artwork } from '../lib/jewelry'

interface GalleryProps {
  items: Artwork[]
  onFavorite: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
}

type Filter = 'all' | 'favorite'

export function Gallery({
  items,
  onFavorite,
  onRemove,
  onClear,
}: GalleryProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [preview, setPreview] = useState<Artwork | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'favorite') return items.filter((a) => a.favorite)
    return items
  }, [items, filter])

  if (items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-none flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-mist">
          <Images className="h-7 w-7 text-stone" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          作品库还是空的
        </h2>
        <p className="max-w-sm text-sm text-stone">
          去创作台生成第一批珠宝图片，结果会自动保存在这里（本地浏览器存储）。
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">
            作品库
          </h2>
          <p className="text-sm text-stone">共 {items.length} 张 · 本地保存</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-mist p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === 'all' ? 'bg-white text-ink shadow-sm' : 'text-stone'
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setFilter('favorite')}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === 'favorite'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-stone'
              }`}
            >
              <Heart className="h-3 w-3" />
              收藏
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm('确定清空全部作品？此操作不可恢复。')) onClear()
            }}
            className="flex items-center gap-1 rounded-full border border-cream-dark bg-white px-3 py-1.5 text-xs text-stone transition-colors hover:border-red-200 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
            清空
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone">暂无收藏作品</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((art) => (
            <ArtworkCard
              key={art.id}
              artwork={art}
              onFavorite={onFavorite}
              onRemove={onRemove}
              onPreview={setPreview}
            />
          ))}
        </div>
      )}

      <PreviewModal artwork={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
