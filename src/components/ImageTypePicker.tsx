import { useState } from 'react'
import { X, ZoomIn } from 'lucide-react'
import {
  IMAGE_TYPES,
  isModelImageType,
  outfitShortLabel,
  type ImageType,
  type ImageTypeOption,
  type ModelImageType,
} from '../lib/jewelry'

interface ImageTypePickerProps {
  value: ImageType
  onChange: (value: ImageType) => void
  /** Outfit sub-type the 穿搭图 card currently maps to */
  outfitType: ModelImageType
  label?: string
}

export function ImageTypePicker({
  value,
  onChange,
  outfitType,
  label = '图片类型',
}: ImageTypePickerProps) {
  const [preview, setPreview] = useState<ImageTypeOption | null>(null)

  const outfitMeta = IMAGE_TYPES.find((t) => t.value === outfitType)!
  const options: ImageTypeOption[] = [
    IMAGE_TYPES.find((t) => t.value === 'product_white')!,
    {
      ...outfitMeta,
      label: '穿搭图',
      desc: `真人佩戴 · 已匹配「${outfitShortLabel(outfitType)}」样式`,
    },
    IMAGE_TYPES.find((t) => t.value === 'atmosphere')!,
  ]

  return (
    <div className="space-y-2.5">
      <label className="text-xs font-medium tracking-wider text-stone uppercase">
        {label}
      </label>

      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const selected = isModelImageType(opt.value)
            ? isModelImageType(value)
            : opt.value === value
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`group overflow-hidden rounded-xl border text-left transition-all ${
                selected
                  ? 'border-champagne bg-gradient-to-b from-champagne/12 to-champagne/4 shadow-[0_6px_14px_rgba(169,139,61,0.18)] ring-1 ring-champagne/35'
                  : 'border-cream-dark bg-white/70'
              }`}
            >
              <div className="relative aspect-square overflow-hidden bg-mist">
                <img
                  src={opt.sampleUrl}
                  alt={`${opt.label}样例`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreview(opt)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      setPreview(opt)
                    }
                  }}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/60 text-cream backdrop-blur active:bg-ink"
                  aria-label={`放大查看${opt.label}示意图`}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </span>
                {selected && (
                  <span className="absolute top-1 left-1 h-2 w-2 rounded-full bg-champagne shadow" />
                )}
              </div>
              <div className="px-1 py-1.5">
                <p
                  title={opt.label}
                  className={`truncate text-center text-xs font-medium ${
                    selected ? 'text-ink' : 'text-ink-soft'
                  }`}
                >
                  {opt.label}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-cream shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute top-3 right-3 z-10 rounded-full bg-ink/60 p-2 text-cream backdrop-blur hover:bg-ink"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={preview.sampleUrl}
              alt={`${preview.label}示意图`}
              className="max-h-[70vh] w-full bg-mist object-contain"
            />
            <div className="space-y-1 p-4">
              <p className="font-display text-lg font-semibold text-ink">
                {preview.label}
              </p>
              <p className="text-sm text-stone">{preview.desc}</p>
              <p className="text-sm text-champagne-dark">{preview.useCase}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
