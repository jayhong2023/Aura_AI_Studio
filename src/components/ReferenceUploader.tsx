import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Upload, X } from 'lucide-react'

export interface ReferenceImage {
  id: string
  name: string
  /** compressed data URL for preview + demo generation */
  dataUrl: string
}

interface ReferenceUploaderProps {
  images: ReferenceImage[]
  onChange: (images: ReferenceImage[]) => void
  maxCount?: number
  label?: string
  emptyHint?: string
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/jpg'
/** Keep refs modest — VibraDraft rejects invalid / oversized payloads */
const MAX_DIM = 1024
const JPEG_QUALITY = 0.78

async function fileToCompressedDataUrl(file: File): Promise<string> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`无法读取「${file.name}」，请改用 JPG/PNG`)
  }
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('浏览器无法处理该图片')
  }
  // White backdrop avoids transparent PNG quirks with some providers
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export function ReferenceUploader({
  images,
  onChange,
  maxCount = 6,
  label = '参考图',
  emptyHint = '产品实拍 / CAD / 草图',
}: ReferenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (list.length === 0) {
        setError('请选择图片文件（JPG / PNG / WebP）')
        return
      }

      const room = maxCount - images.length
      if (room <= 0) {
        setError(`最多上传 ${maxCount} 张参考图`)
        return
      }

      const toProcess = list.slice(0, room)
      if (list.length > room) {
        setError(`已达上限，仅添加前 ${room} 张`)
      } else {
        setError(null)
      }

      setLoading(true)
      try {
        const next: ReferenceImage[] = []
        for (const file of toProcess) {
          const dataUrl = await fileToCompressedDataUrl(file)
          next.push({
            id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            dataUrl,
          })
        }
        onChange([...images, ...next])
      } catch (e) {
        setError(e instanceof Error ? e.message : '图片读取失败，请重试')
      } finally {
        setLoading(false)
      }
    },
    [images, maxCount, onChange],
  )

  const remove = (id: string) => {
    onChange(images.filter((img) => img.id !== id))
    setError(null)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) {
      void addFiles(e.dataTransfer.files)
    }
  }

  return (
    <div
      className={`relative space-y-2.5 rounded-xl transition-colors ${
        dragging ? 'bg-champagne/5' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!loading) setDragging(true)
      }}
      onDragLeave={(e) => {
        const next = e.relatedTarget as Node | null
        if (!next || !e.currentTarget.contains(next)) {
          setDragging(false)
        }
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium tracking-wider text-stone uppercase">
          {label}
        </label>
        <span className="text-[11px] text-stone">
          {images.length}/{maxCount} · 支持多张
        </span>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-cream-dark bg-mist"
            >
              <img
                src={img.dataUrl}
                alt={img.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={`移除 ${img.name}`}
                onClick={() => remove(img.id)}
                className="absolute top-1 right-1 rounded-full bg-ink/70 p-1 text-cream opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
              <p className="absolute inset-x-0 bottom-0 truncate bg-ink/50 px-1.5 py-0.5 text-[9px] text-cream backdrop-blur">
                {img.name}
              </p>
            </div>
          ))}
          {images.length < maxCount && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-champagne-dark transition-colors ${
                dragging
                  ? 'border-champagne bg-champagne/15'
                  : 'border-champagne/50 bg-champagne/5 hover:bg-champagne/10'
              }`}
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">
                {dragging ? '松手上传' : '继续添加 / 拖拽'}
              </span>
            </button>
          )}
        </div>
      )}

      {images.length === 0 && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${
            dragging
              ? 'border-champagne bg-champagne/10'
              : 'border-cream-dark bg-cream/80 hover:border-champagne/50 hover:bg-mist/50'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
            <Upload className="h-4 w-4 text-champagne-dark" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-ink">
              {loading ? '处理中…' : '拖拽或点击上传'}
            </p>
            <p className="mt-0.5 text-[11px] text-stone">
              {emptyHint}，最多 {maxCount} 张
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
