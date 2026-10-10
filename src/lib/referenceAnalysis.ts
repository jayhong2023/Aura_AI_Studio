import type {
  AtmosphereBackground,
  ImageType,
  ModelImageType,
} from './jewelry'
import type { ReferenceImage } from '../components/ReferenceUploader'

interface ImageStats {
  luminanceMean: number
  luminanceStd: number
  skinRatio: number
  rMean: number
  gMean: number
  bMean: number
}

export interface StyleAnalysis {
  imageType: ImageType
  summary: string
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
  let rSum = 0
  let gSum = 0
  let bSum = 0
  const n = size * size

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    lumSum += y
    lumSqSum += y * y
    rSum += r
    gSum += g
    bSum += b

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
    rMean: rSum / n,
    gMean: gSum / n,
    bMean: bSum / n,
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

function describeLighting(statsList: ImageStats[]): string {
  const avg =
    statsList.reduce((s, x) => s + x.luminanceMean, 0) / statsList.length
  const contrast =
    statsList.reduce((s, x) => s + x.luminanceStd, 0) / statsList.length
  const brightness =
    avg > 200 ? '高亮环境' : avg > 140 ? '中性明亮' : avg > 90 ? '暖暗情境' : '低光暗调'
  const softHard =
    contrast < 35 ? '柔和平光' : contrast < 60 ? '自然光影' : '高对比戏剧光'
  return `${brightness}，${softHard}`
}

function describeTone(statsList: ImageStats[]): string {
  const r = statsList.reduce((s, x) => s + x.rMean, 0) / statsList.length
  const g = statsList.reduce((s, x) => s + x.gMean, 0) / statsList.length
  const b = statsList.reduce((s, x) => s + x.bMean, 0) / statsList.length
  if (r - b > 18 && r > g) return '暖金调'
  if (b - r > 12) return '冷银调'
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) return '中性灰白调'
  return '自然色彩'
}

function summarizeStyle(
  imageType: ImageType,
  statsList: ImageStats[],
): string {
  const lighting = describeLighting(statsList)
  const tone = describeTone(statsList)
  const skin =
    statsList.reduce((s, x) => s + x.skinRatio, 0) / statsList.length

  if (imageType === 'product_white') {
    return `B区风格：高亮纯白电商背景，${tone}，${lighting}；仅参考布光与留白构图，不引入B区商品`
  }
  if (imageType === 'atmosphere') {
    return `B区风格：情境氛围大片，${tone}，${lighting}；仅参考光影、色温和陈列氛围，不引入B区商品款式`
  }
  const skinText =
    skin > 0.08 ? `含真人皮肤约${Math.round(skin * 100)}%` : '弱肤色信号'
  return `B区风格：真人佩戴模特构图，${skinText}，${tone}，${lighting}；仅参考姿势/构图/光影，不引入B区身上其他首饰`
}

export async function analyzeStyleFromB(
  styleRefs: ReferenceImage[],
): Promise<StyleAnalysis> {
  if (styleRefs.length === 0) {
    return {
      imageType: 'model_necklace_pendant',
      summary: 'B区未上传：按当前所选图片类型与默认布光生成',
    }
  }

  let productWhiteVotes = 0
  let modelVotes = 0
  let atmosphereVotes = 0
  const statsList: ImageStats[] = []

  for (const ref of styleRefs.slice(0, 6)) {
    const s = await computeStats(ref.dataUrl)
    statsList.push(s)
    const isWhiteBg = s.luminanceMean > 220 && s.luminanceStd < 45
    const isModel = s.skinRatio > 0.08
    if (isWhiteBg) productWhiteVotes += 1
    else if (isModel) modelVotes += 1
    else atmosphereVotes += 1
  }

  let imageType: ImageType
  if (productWhiteVotes >= modelVotes && productWhiteVotes >= atmosphereVotes) {
    imageType = 'product_white'
  } else if (modelVotes >= atmosphereVotes) {
    // B 区只能粗分“模特图”，默认映射到较通用的项链/吊坠模特类型。
    imageType = 'model_necklace_pendant'
  } else {
    imageType = 'atmosphere'
  }

  return {
    imageType,
    summary: summarizeStyle(imageType, statsList),
  }
}

export async function detectStyleTypeFromB(
  styleRefs: ReferenceImage[],
): Promise<ImageType> {
  const analysis = await analyzeStyleFromB(styleRefs)
  return analysis.imageType
}

export interface AtmosphereBackgroundSuggestion {
  background: AtmosphereBackground
  reason: string
}

/**
 * Picks red or black backdrop for the atmosphere image from the product's own
 * colors: products with lots of red (enamel, ruby, red agate) blend into a red
 * backdrop, so they get black; everything else gets the signature red.
 */
export async function suggestAtmosphereBackground(
  dataUrl: string,
): Promise<AtmosphereBackgroundSuggestion> {
  const bmp = await loadImageBitmap(dataUrl)
  const size = 72
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

  let br = 0
  let bg = 0
  let bb = 0
  let borderCount = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x > 2 && x < size - 3 && y > 2 && y < size - 3) continue
      const i = (y * size + x) * 4
      br += data[i]
      bg += data[i + 1]
      bb += data[i + 2]
      borderCount++
    }
  }
  br /= borderCount
  bg /= borderCount
  bb /= borderCount

  let product = 0
  let red = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (Math.hypot(r - br, g - bg, b - bb) < 45) continue
    product++
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const v = max / 255
    const s = max === 0 ? 0 : (max - min) / max
    if (max !== r || v < 0.22 || s < 0.42) continue
    const hue = ((g - b) / (max - min || 1)) * 60
    const h = hue < 0 ? hue + 360 : hue
    if (h <= 14 || h >= 335) red++
  }

  const redRatio = product > 0 ? red / product : 0
  if (redRatio > 0.15) {
    return {
      background: 'black',
      reason: `产品红色占比约${Math.round(redRatio * 100)}%，用黑色背景避免主体与背景融在一起`,
    }
  }
  return {
    background: 'red',
    reason: '产品以金/银/绿等非红色为主，用红色背景更衬托主体',
  }
}

export interface OutfitTypeSuggestion {
  type: ModelImageType
  reason: string
}

const OUTFIT_NAME_KEYWORDS: Array<[ModelImageType, RegExp]> = [
  ['model_set', /套装|套链|成套|\bset\b|suit/i],
  ['model_earring', /耳钉|耳环|耳坠|耳线|耳饰|earring|ear[-_ ]?stud|\bstud/i],
  ['model_necklace_pendant', /项链|吊坠|锁骨链|挂坠|necklace|pendant|choker/i],
  ['model_bracelet_bangle', /手链|手镯|手环|脚链|bracelet|bangle|anklet/i],
  ['model_ring', /戒指|对戒|指环|\bring\b/i],
]

interface MaskShape {
  components: Array<{ area: number; w: number; h: number; cx: number }>
  aspect: number
  fillRatio: number
  holeRatio: number
  /** Vertical position of the enclosed holes within the bounding box, 0 = top */
  holeCenterY: number
}

async function analyzeMaskShape(dataUrl: string): Promise<MaskShape> {
  const bmp = await loadImageBitmap(dataUrl)
  const size = 96
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

  let br = 0
  let bg = 0
  let bb = 0
  let borderCount = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x > 1 && x < size - 2 && y > 1 && y < size - 2) continue
      const i = (y * size + x) * 4
      br += data[i]
      bg += data[i + 1]
      bb += data[i + 2]
      borderCount++
    }
  }
  br /= borderCount
  bg /= borderCount
  bb /= borderCount

  const n = size * size
  const fg = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const i = p * 4
    fg[p] =
      Math.hypot(data[i] - br, data[i + 1] - bg, data[i + 2] - bb) > 38 ? 1 : 0
  }

  const label = new Int32Array(n).fill(-1)
  const components: MaskShape['components'] = []
  let minX = size
  let minY = size
  let maxX = 0
  let maxY = 0
  let fgArea = 0
  for (let start = 0; start < n; start++) {
    if (!fg[start] || label[start] !== -1) continue
    const id = components.length
    const stack = [start]
    label[start] = id
    let area = 0
    let cMinX = size
    let cMinY = size
    let cMaxX = 0
    let cMaxY = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % size
      const y = (p - x) / size
      area++
      cMinX = Math.min(cMinX, x)
      cMaxX = Math.max(cMaxX, x)
      cMinY = Math.min(cMinY, y)
      cMaxY = Math.max(cMaxY, y)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const q = ny * size + nx
        if (fg[q] && label[q] === -1) {
          label[q] = id
          stack.push(q)
        }
      }
    }
    components.push({
      area,
      w: cMaxX - cMinX + 1,
      h: cMaxY - cMinY + 1,
      cx: (cMinX + cMaxX) / 2,
    })
    if (area >= n * 0.004) {
      fgArea += area
      minX = Math.min(minX, cMinX)
      maxX = Math.max(maxX, cMaxX)
      minY = Math.min(minY, cMinY)
      maxY = Math.max(maxY, cMaxY)
    }
  }

  // Background reachable from the border; the rest of the background is holes.
  const outside = new Uint8Array(n)
  const stack: number[] = []
  for (let p = 0; p < n; p++) {
    const x = p % size
    const y = (p - x) / size
    if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && !fg[p]) {
      outside[p] = 1
      stack.push(p)
    }
  }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % size
    const y = (p - x) / size
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const q = ny * size + nx
      if (!fg[q] && !outside[q]) {
        outside[q] = 1
        stack.push(q)
      }
    }
  }
  let holes = 0
  let holeYSum = 0
  for (let p = 0; p < n; p++) {
    if (!fg[p] && !outside[p]) {
      holes++
      holeYSum += Math.floor(p / size)
    }
  }

  const bw = Math.max(1, maxX - minX + 1)
  const bh = Math.max(1, maxY - minY + 1)
  const boxArea = bw * bh
  return {
    components: components
      .filter((c) => c.area >= n * 0.004)
      .sort((a, b) => b.area - a.area),
    aspect: bh / bw,
    fillRatio: fgArea / boxArea,
    holeRatio: holes / boxArea,
    holeCenterY: holes > 0 ? (holeYSum / holes - minY) / bh : 0,
  }
}

/**
 * Guesses which outfit (worn) sub-type fits the uploaded jewelry. Filename
 * keywords win; otherwise a coarse silhouette analysis of the primary image.
 */
export async function detectOutfitType(
  refs: ReferenceImage[],
): Promise<OutfitTypeSuggestion> {
  const names = refs.map((r) => r.name).join(' ')
  for (const [type, re] of OUTFIT_NAME_KEYWORDS) {
    if (re.test(names)) {
      return { type, reason: '根据图片文件名识别' }
    }
  }

  if (refs.length === 0) {
    return { type: 'model_necklace_pendant', reason: '默认匹配' }
  }

  const shape = await analyzeMaskShape(refs[0].dataUrl)
  const [a, b] = shape.components
  if (shape.components.length >= 3) {
    return { type: 'model_set', reason: '图中有多件首饰' }
  }
  if (
    a &&
    b &&
    b.area / a.area > 0.55 &&
    Math.abs(a.h - b.h) / Math.max(a.h, b.h) < 0.3
  ) {
    return { type: 'model_earring', reason: '图中为成对的两件饰品' }
  }
  if (shape.aspect >= 1.3) {
    if (shape.holeRatio >= 0.08 && shape.holeCenterY > 0.5) {
      return { type: 'model_ring', reason: '下方戒圈 + 上方戒面的造型' }
    }
    return { type: 'model_necklace_pendant', reason: '竖长造型，带链条/吊坠结构' }
  }
  if (shape.holeRatio >= 0.15) {
    return shape.fillRatio < 0.32 && shape.aspect <= 1.15
      ? { type: 'model_bracelet_bangle', reason: '环形细圈造型' }
      : { type: 'model_ring', reason: '带戒圈的环形造型' }
  }
  if (shape.aspect <= 0.7) {
    return { type: 'model_bracelet_bangle', reason: '横向环形/链状造型' }
  }
  return { type: 'model_ring', reason: '紧凑单件造型' }
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
