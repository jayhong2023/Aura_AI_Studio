import type { ImageType } from './jewelry'
import type { ReferenceImage } from '../components/ReferenceUploader'

interface ImageStats {
  luminanceMean: number
  luminanceStd: number
  skinRatio: number
}

async function loadImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return createImageBitmap(blob)
}

async function computeStats(dataUrl: string): Promise<ImageStats> {
  const bmp = await loadImageBitmap(dataUrl)
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    throw new Error('无法分析图片')
  }
  ctx.drawImage(bmp, 0, 0, size, size)
  bmp.close()

  const { data } = ctx.getImageData(0, 0, size, size)
  let lumSum = 0
  let lumSqSum = 0
  let skin = 0
  const n = size * size

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    lumSum += y
    lumSqSum += y * y

    const isSkin =
      r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 12
    if (isSkin) skin++
  }

  const mean = lumSum / n
  const variance = Math.max(0, lumSqSum / n - mean * mean)
  return {
    luminanceMean: mean,
    luminanceStd: Math.sqrt(variance),
    skinRatio: skin / n,
  }
}

async function computeDHash(dataUrl: string): Promise<string> {
  const bmp = await loadImageBitmap(dataUrl)
  const w = 9
  const h = 8
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    throw new Error('无法分析图片')
  }
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()

  const { data } = ctx.getImageData(0, 0, w, h)
  const gray: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }

  let bits = ''
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const left = gray[y * w + x]
      const right = gray[y * w + x + 1]
      bits += left > right ? '1' : '0'
    }
  }
  return bits
}

function hamming(a: string, b: string): number {
  let d = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++
  return d + Math.abs(a.length - b.length)
}

export async function detectStyleTypeFromB(
  styleRefs: ReferenceImage[],
): Promise<ImageType> {
  if (styleRefs.length === 0) return 'model'

  const votes: Record<ImageType, number> = {
    product_white: 0,
    model: 0,
    atmosphere: 0,
  }

  for (const ref of styleRefs.slice(0, 6)) {
    const s = await computeStats(ref.dataUrl)
    const isWhiteBg = s.luminanceMean > 220 && s.luminanceStd < 45
    const isModel = s.skinRatio > 0.08
    if (isWhiteBg) votes.product_white += 1
    else if (isModel) votes.model += 1
    else votes.atmosphere += 1
  }

  return (Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'model') as ImageType
}

export async function estimateProductCountFromA(
  productRefs: ReferenceImage[],
): Promise<number> {
  if (productRefs.length === 0) return 0

  const hashes = await Promise.all(
    productRefs.slice(0, 10).map((r) => computeDHash(r.dataUrl)),
  )
  const groups: string[] = []
  const threshold = 12

  for (const hash of hashes) {
    const matched = groups.some((g) => hamming(g, hash) <= threshold)
    if (!matched) groups.push(hash)
  }

  return Math.max(1, groups.length)
}

