export type JewelryCategory =
  | 'ring'
  | 'necklace'
  | 'earring'
  | 'bracelet'
  | 'pendant'

export type MetalType =
  | 'yellow_gold'
  | 'rose_gold'
  | 'white_gold'
  | 'platinum'
  | 'silver'

export type StoneType =
  | 'diamond'
  | 'ruby'
  | 'sapphire'
  | 'emerald'
  | 'pearl'
  | 'none'

export type SceneTemplate =
  | 'white_bg'
  | 'lifestyle_hand'
  | 'velvet_box'
  | 'marble'
  | 'editorial'
  | 'macro'

/** High-level output style for jewelry shoots */
export type ImageType =
  | 'product_white'
  | 'model_bracelet_bangle'
  | 'model_earring'
  | 'model_necklace_pendant'
  | 'model_ring'
  | 'model_set'
  | 'atmosphere'

export type GenerateMode = 'text' | 'reference'
export type StudioMode = 'guide' | 'agent'

export interface GenerationParams {
  category: JewelryCategory
  metal: MetalType
  stone: StoneType
  scene: SceneTemplate
  imageType: ImageType
  prompt: string
  count: number
  mode: GenerateMode
  /** compressed data URLs of reference images */
  references: string[]
  /** estimated unique products count from A zone */
  referenceItemsCount?: number
  /** detected style type from B zone */
  referenceStyleType?: ImageType
}

export function isModelImageType(type: ImageType): boolean {
  return (
    type === 'model_bracelet_bangle' ||
    type === 'model_earring' ||
    type === 'model_necklace_pendant' ||
    type === 'model_ring' ||
    type === 'model_set'
  )
}

export interface ImageTypeOption {
  value: ImageType
  label: string
  desc: string
  /** short use-case line */
  useCase: string
  sampleUrl: string
  /** default scene when this type is selected */
  defaultScene: SceneTemplate
}

export interface Artwork {
  id: string
  url: string
  prompt: string
  params: GenerationParams
  createdAt: number
  favorite: boolean
  /** thumbnail of primary reference used (if any) */
  referenceThumb?: string
  /** provider id e.g. vibradraft / fal / demo */
  provider?: string
  /** concrete model id when available */
  model?: string
}

export interface OptionItem<T extends string> {
  value: T
  label: string
  desc?: string
  color?: string
}

export const CATEGORIES: OptionItem<JewelryCategory>[] = [
  { value: 'ring', label: '戒指', desc: '订婚戒 / 对戒 / 时尚戒' },
  { value: 'necklace', label: '项链', desc: '锁骨链 / 长链' },
  { value: 'earring', label: '耳环', desc: '耳钉 / 耳坠' },
  { value: 'bracelet', label: '手镯', desc: '手链 / 手环' },
  { value: 'pendant', label: '吊坠', desc: '独立吊坠' },
]

export const METALS: OptionItem<MetalType>[] = [
  { value: 'yellow_gold', label: '18K 黄金', color: '#D4AF37' },
  { value: 'rose_gold', label: '18K 玫瑰金', color: '#B76E79' },
  { value: 'white_gold', label: '18K 白金', color: '#E8E8E8' },
  { value: 'platinum', label: '铂金', color: '#C0C0C0' },
  { value: 'silver', label: '925 银', color: '#A8A9AD' },
]

export const STONES: OptionItem<StoneType>[] = [
  { value: 'diamond', label: '钻石', desc: '圆钻 / 火彩' },
  { value: 'ruby', label: '红宝石', desc: '鸽血红' },
  { value: 'sapphire', label: '蓝宝石', desc: '皇家蓝' },
  { value: 'emerald', label: '祖母绿', desc: '哥伦比亚绿' },
  { value: 'pearl', label: '珍珠', desc: '海水珠光' },
  { value: 'none', label: '无宝石', desc: '素金款' },
]

export const SCENES: OptionItem<SceneTemplate>[] = [
  {
    value: 'white_bg',
    label: '电商白底',
    desc: '纯白背景 · 主图规格',
  },
  {
    value: 'lifestyle_hand',
    label: '手部佩戴',
    desc: '真实佩戴感 · 种草图',
  },
  {
    value: 'velvet_box',
    label: '丝绒首饰盒',
    desc: '开盒仪式感',
  },
  {
    value: 'marble',
    label: '大理石台面',
    desc: '轻奢陈列',
  },
  {
    value: 'editorial',
    label: '杂志大片',
    desc: '暗调戏剧光',
  },
  {
    value: 'macro',
    label: '镶嵌特写',
    desc: '工艺细节 macro',
  },
]

export const IMAGE_TYPES: ImageTypeOption[] = [
  {
    value: 'product_white',
    label: '产品白底图',
    desc: '纯白背景 · 电商主图 / 详情页',
    useCase: '适合淘宝、京东、独立站主图',
    sampleUrl: '/samples/product-white.png',
    defaultScene: 'white_bg',
  },
  {
    value: 'model_bracelet_bangle',
    label: '模特图-手链手镯',
    desc: '手部佩戴 · 手链/手镯细节展示',
    useCase: '适合手部特写、手腕佩戴场景',
    sampleUrl: '/samples/model-bracelet-bangle.png',
    defaultScene: 'lifestyle_hand',
  },
  {
    value: 'model_earring',
    label: '模特图-耳钉耳环',
    desc: '耳部佩戴 · 脸部局部与耳饰关系',
    useCase: '适合耳钉、耳环上耳展示',
    sampleUrl: '/samples/model-earring.png',
    defaultScene: 'lifestyle_hand',
  },
  {
    value: 'model_necklace_pendant',
    label: '模特图-项链吊坠',
    desc: '颈部佩戴 · 锁骨与胸前构图',
    useCase: '适合项链、吊坠上身展示',
    sampleUrl: '/samples/model-necklace-pendant.png',
    defaultScene: 'lifestyle_hand',
  },
  {
    value: 'model_ring',
    label: '模特图-戒指',
    desc: '手指佩戴 · 戒圈与手部姿态',
    useCase: '适合单戒、叠戴戒指展示',
    sampleUrl: '/samples/model-ring.png',
    defaultScene: 'lifestyle_hand',
  },
  {
    value: 'model_set',
    label: '模特图-首饰套装',
    desc: '多件同框 · 耳饰/项链/戒指协同',
    useCase: '适合套装搭配与成套销售展示',
    sampleUrl: '/samples/model-set.png',
    defaultScene: 'lifestyle_hand',
  },
  {
    value: 'atmosphere',
    label: '氛围图',
    desc: '情境光影 · 品牌 / 社媒大片',
    useCase: '适合小红书、海报、系列宣传',
    sampleUrl: '/samples/atmosphere.png',
    defaultScene: 'editorial',
  },
]

export const DEFAULT_PARAMS: GenerationParams = {
  category: 'ring',
  metal: 'yellow_gold',
  stone: 'diamond',
  scene: 'white_bg',
  imageType: 'product_white',
  prompt: '',
  count: 1,
  mode: 'reference',
  references: [],
}

export const MODE_OPTIONS: OptionItem<GenerateMode>[] = [
  {
    value: 'text',
    label: '文生图',
    desc: '按参数描述生成',
  },
  {
    value: 'reference',
    label: '参考图生图',
    desc: '上传实拍 / CAD 改款',
  },
]

export const STUDIO_MODE_OPTIONS: OptionItem<StudioMode>[] = [
  {
    value: 'guide',
    label: '向导模式',
    desc: '参数面板一键出图',
  },
  {
    value: 'agent',
    label: 'Agent 模式',
    desc: '多轮对话调图',
  },
]

const SCENE_TEXT: Record<SceneTemplate, string> = {
  white_bg: '纯白无缝背景，柔光箱布光，居中构图，细节清晰',
  lifestyle_hand: '真人手部佩戴展示，自然光，浅景深，突出佩戴质感',
  velvet_box: '丝绒首饰盒陈列，暖色氛围光，强调开盒仪式感',
  marble: '大理石台面静物陈列，柔和反射，轻奢风格',
  editorial: '杂志感暗调戏剧光，层次分明，品牌大片风格',
  macro: '珠宝镶嵌微距特写，切面锐利，工艺细节清晰',
}

const IMAGE_TYPE_TEXT: Record<ImageType, string> = {
  product_white:
    '产品白底图：适合电商主图，主体独立展示，无模特无道具，背景干净纯白',
  model_bracelet_bangle:
    '模特图-手链手镯：真人手腕佩戴展示，突出手链/手镯在手部动作中的质感与比例',
  model_earring:
    '模特图-耳钉耳环：真人耳部佩戴展示，突出耳饰与脸部轮廓关系，强调耳部近景质感',
  model_necklace_pendant:
    '模特图-项链吊坠：真人颈部佩戴展示，突出锁骨线条与吊坠垂坠关系，强调上身效果',
  model_ring:
    '模特图-戒指：真人手指佩戴展示，突出戒圈比例、手部姿态与戒面细节',
  model_set:
    '模特图-首饰套装：真人多件套佩戴展示，突出耳饰、项链、戒指/手链的整体搭配与统一风格',
  atmosphere:
    '氛围图：品牌情境大片，强调光影、色彩与陈列氛围，营造高端视觉感受',
}

/** Scenes that make sense under each image type (for optional fine-tune) */
export const SCENES_BY_IMAGE_TYPE: Record<ImageType, SceneTemplate[]> = {
  product_white: ['white_bg', 'macro'],
  model_bracelet_bangle: ['lifestyle_hand'],
  model_earring: ['lifestyle_hand'],
  model_necklace_pendant: ['lifestyle_hand'],
  model_ring: ['lifestyle_hand'],
  model_set: ['lifestyle_hand'],
  atmosphere: ['velvet_box', 'marble', 'editorial', 'macro'],
}

export function buildPrompt(params: GenerationParams): string {
  if (params.prompt.trim()) {
    return params.prompt.trim()
  }

  const imageType = params.imageType ?? 'product_white'
  const typeClause = IMAGE_TYPE_TEXT[imageType]
  // Prefer image-type framing; keep scene as secondary nuance when compatible
  const sceneClause =
    imageType === 'product_white' && params.scene === 'macro'
      ? SCENE_TEXT.macro
      : imageType === 'atmosphere'
        ? SCENE_TEXT[params.scene]
        : isModelImageType(imageType)
          ? SCENE_TEXT.lifestyle_hand
          : SCENE_TEXT.white_bg

  if (params.mode === 'reference' && params.references.length > 0) {
    const detectedStyle = params.referenceStyleType ?? params.imageType
    const styleText = IMAGE_TYPE_TEXT[detectedStyle]
    const countText = params.referenceItemsCount
      ? `A区识别约${params.referenceItemsCount}件商品`
      : 'A区主体商品按参考图识别'

    return [
      `基于A/B双参考进行图生图重绘（共${params.references.length}张参考图）`,
      `${countText}，以A区商品为主体`,
      `按B区风格生成：${styleText}`,
      '以参考图中的珠宝品类、材质、宝石与佩戴部位为准，不改成其他品类',
      '保留原款轮廓、镶嵌结构与工艺细节',
      typeClause,
      sceneClause,
      '写实风格，金属反射准确，画面干净，商业级质感，高分辨率',
      '输出A区同款在B区风格下的商业成图',
    ].join('，')
  }

  return [
    '珠宝产品摄影：高质感珠宝单品',
    '材质、宝石与款式可按需求细化',
    typeClause,
    sceneClause,
    '写实风格，金属反射准确，画面干净，商业级质感，高分辨率',
  ].join('，')
}

/** Demo placeholder images — jewelry-like Unsplash photos */
const DEMO_IMAGES = [
  'https://images.unsplash.com/photo-1605100804763-247f995f9795?w=800&q=80',
  'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80',
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80',
  'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80',
  'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80',
  'https://images.unsplash.com/photo-1573408301185-91496af45bc0?w=800&q=80',
  'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=800&q=80',
  'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=800&q=80',
]

export function pickDemoImages(count: number, seed: string): string[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    const idx = (hash + i * 3) % DEMO_IMAGES.length
    result.push(DEMO_IMAGES[idx])
  }
  return result
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** Demo I2I: canvas remix of reference images (crop / color / vignette) */
async function remixFromReferences(
  references: string[],
  count: number,
): Promise<string[]> {
  const imgs = await Promise.all(references.map((src) => loadImage(src)))
  const size = 768
  const results: string[] = []

  for (let i = 0; i < count; i++) {
    const src = imgs[i % imgs.length]
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const zoom = 1 + (i % 4) * 0.06
    const cropW = src.width / zoom
    const cropH = src.height / zoom
    const ox = ((i * 17) % 20) * 0.01 * Math.max(0, src.width - cropW)
    const oy = ((i * 23) % 20) * 0.01 * Math.max(0, src.height - cropH)
    const scale = Math.max(size / cropW, size / cropH)
    const dw = cropW * scale
    const dh = cropH * scale
    const dx = (size - dw) / 2
    const dy = (size - dh) / 2

    const hue = (i * 18) % 40 - 12
    const sat = 1 + (i % 3) * 0.08
    const bright = 1 + ((i % 2) * 0.06 - 0.02)
    ctx.filter = `hue-rotate(${hue}deg) saturate(${sat}) brightness(${bright}) contrast(1.05)`
    ctx.drawImage(src, ox, oy, cropW, cropH, dx, dy, dw, dh)
    ctx.filter = 'none'

    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.2,
      size / 2,
      size / 2,
      size * 0.72,
    )
    grad.addColorStop(0, 'rgba(201,169,98,0)')
    grad.addColorStop(1, 'rgba(26,26,26,0.22)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = `rgba(201,169,98,${0.04 + (i % 3) * 0.02})`
    ctx.fillRect(0, 0, size, size)

    results.push(canvas.toDataURL('image/jpeg', 0.85))
  }

  return results
}

/** Tiny thumb for gallery badge (avoid bloating localStorage) */
export async function makeTinyThumb(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const scale = Math.max(size / img.width, size / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return canvas.toDataURL('image/jpeg', 0.7)
}

export async function simulateGenerate(
  params: GenerationParams,
  onProgress?: (pct: number) => void,
): Promise<Artwork[]> {
  const prompt = buildPrompt(params)
  const useRefs =
    params.mode === 'reference' && params.references.length > 0
  const duration = useRefs
    ? 1400 + Math.random() * 900
    : 1800 + Math.random() * 1200

  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = async () => {
      const elapsed = Date.now() - start
      const pct = Math.min(92, Math.round((elapsed / duration) * 100))
      onProgress?.(pct)
      if (elapsed < duration) {
        requestAnimationFrame(() => void tick())
        return
      }

      try {
        onProgress?.(96)
        let urls: string[]
        let thumb: string | undefined
        if (useRefs) {
          urls = await remixFromReferences(params.references, params.count)
          thumb = await makeTinyThumb(params.references[0])
        } else {
          urls = pickDemoImages(params.count, prompt + Date.now())
        }
        onProgress?.(100)
        const artworks: Artwork[] = urls.map((url, i) => ({
          id: `art_${Date.now()}_${i}`,
          url,
          prompt,
          params: {
            ...params,
            references: [],
          },
          createdAt: Date.now(),
          favorite: false,
          referenceThumb: thumb,
        }))
        resolve(artworks)
      } catch (err) {
        reject(err)
      }
    }
    requestAnimationFrame(() => void tick())
  })
}
