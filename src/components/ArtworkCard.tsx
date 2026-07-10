import { Download, Heart, Trash2, X } from 'lucide-react'
import type { Artwork } from '../lib/jewelry'
import { downloadImageViaApi } from '../lib/api'
import {
  CATEGORIES,
  IMAGE_TYPES,
  METALS,
  SCENES,
  STONES,
} from '../lib/jewelry'

interface ArtworkCardProps {
  artwork: Artwork
  onFavorite: (id: string) => void
  onRemove: (id: string) => void
  onPreview: (artwork: Artwork) => void
}

export function ArtworkCard({
  artwork,
  onFavorite,
  onRemove,
  onPreview,
}: ArtworkCardProps) {
  const category =
    CATEGORIES.find((c) => c.value === artwork.params.category)?.label ?? ''
  const imageType =
    IMAGE_TYPES.find((t) => t.value === artwork.params.imageType)?.label ?? ''
  const scene =
    SCENES.find((s) => s.value === artwork.params.scene)?.label ?? ''

  const handleDownload = async () => {
    try {
      await downloadImageViaApi(artwork.url, `${artwork.id}.jpg`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '下载失败'
      alert(msg)
    }
  }

  return (
    <article className="group animate-fade-up overflow-hidden rounded-2xl border border-cream-dark bg-white shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        className="relative aspect-square w-full overflow-hidden bg-mist"
        onClick={() => onPreview(artwork)}
      >
        <img
          src={artwork.url}
          alt={artwork.prompt}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {artwork.referenceThumb && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-ink/70 px-1.5 py-1 backdrop-blur">
            <img
              src={artwork.referenceThumb}
              alt=""
              className="h-5 w-5 rounded object-cover"
            />
            <span className="pr-0.5 text-[9px] text-cream">参考</span>
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {imageType || category}
              {imageType && category ? ` · ${category}` : ''}
              {!imageType && scene ? ` · ${scene}` : ''}
            </p>
            {artwork.model && (
              <p className="truncate text-[10px] text-champagne-dark">
                {artwork.model}
              </p>
            )}
            <p className="truncate text-[11px] text-stone">
              {new Date(artwork.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="收藏"
              onClick={() => onFavorite(artwork.id)}
              className={`rounded-lg p-1.5 transition-colors ${
                artwork.favorite
                  ? 'bg-champagne/15 text-champagne-dark'
                  : 'text-stone hover:bg-mist hover:text-ink'
              }`}
            >
              <Heart
                className="h-3.5 w-3.5"
                fill={artwork.favorite ? 'currentColor' : 'none'}
              />
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              aria-label="下载"
              className="rounded-lg p-1.5 text-stone transition-colors hover:bg-mist hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="删除"
              onClick={() => onRemove(artwork.id)}
              className="rounded-lg p-1.5 text-stone transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

interface PreviewModalProps {
  artwork: Artwork | null
  onClose: () => void
}

export function PreviewModal({ artwork, onClose }: PreviewModalProps) {
  if (!artwork) return null

  const metal = METALS.find((m) => m.value === artwork.params.metal)?.label
  const stone = STONES.find((s) => s.value === artwork.params.stone)?.label
  const scene = SCENES.find((s) => s.value === artwork.params.scene)?.label
  const category = CATEGORIES.find(
    (c) => c.value === artwork.params.category,
  )?.label
  const imageType = IMAGE_TYPES.find(
    (t) => t.value === artwork.params.imageType,
  )?.label

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full bg-ink/60 p-2 text-cream backdrop-blur hover:bg-ink"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={artwork.url}
          alt={artwork.prompt}
          className="max-h-[60vh] w-full object-contain bg-mist"
        />
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            {artwork.model && (
              <span className="rounded-full bg-ink px-2.5 py-1 text-xs text-cream">
                模型 · {artwork.model}
              </span>
            )}
            {imageType && (
              <span className="rounded-full bg-champagne/15 px-2.5 py-1 text-xs text-champagne-dark">
                {imageType}
              </span>
            )}
            {artwork.provider && (
              <span className="rounded-full bg-mist px-2.5 py-1 text-xs text-ink-soft">
                {artwork.provider}
              </span>
            )}
            {[category, metal, stone, scene].filter(Boolean).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-mist px-2.5 py-1 text-xs text-ink-soft"
              >
                {tag}
              </span>
            ))}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium tracking-wider text-stone uppercase">
              提示词
            </p>
            <p className="font-display text-sm leading-relaxed text-ink-soft italic">
              {artwork.prompt}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
