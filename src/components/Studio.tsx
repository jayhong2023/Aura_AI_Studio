import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Wand2 } from 'lucide-react'
import { AgentPanel } from './AgentPanel'
import { ImageTypePicker } from './ImageTypePicker'
import { type ReferenceImage } from './ReferenceUploader'
import { type ApiStatus } from '../lib/api'
import {
  detectStyleTypeFromB,
  estimateProductCountFromA,
} from '../lib/referenceAnalysis'
import {
  buildPrompt,
  DEFAULT_PARAMS,
  IMAGE_TYPES,
  isModelImageType,
  type Artwork,
  type GenerationParams,
  type ImageType,
} from '../lib/jewelry'
import type { TaskHistoryInput } from '../lib/useTaskHistory'

interface StudioProps {
  isMobilePreview?: boolean
  onGenerated: (artworks: Artwork[]) => void
  apiStatus: ApiStatus | null
  onTaskLogged: (task: TaskHistoryInput) => void
}

export function Studio({
  isMobilePreview = false,
  onGenerated,
  apiStatus,
  onTaskLogged,
}: StudioProps) {
  const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS)
  const [productRefs, setProductRefs] = useState<ReferenceImage[]>([])
  const [styleRefs, setStyleRefs] = useState<ReferenceImage[]>([])
  const [detectedProductCount, setDetectedProductCount] = useState(0)
  const [detectedStyleType, setDetectedStyleType] = useState<ImageType>(
    'model_necklace_pendant',
  )
  const [promptDraft, setPromptDraft] = useState('')
  const [promptTouched, setPromptTouched] = useState(false)
  const [lockTargetType, setLockTargetType] = useState(false)

  const refsForGeneration = useMemo(
    () => [
      ...productRefs.slice(0, 3).map((r) => r.dataUrl),
      ...styleRefs.slice(0, 2).map((r) => r.dataUrl),
    ],
    [productRefs, styleRefs],
  )

  const autoPrompt = useMemo(
    () =>
      buildPrompt({
        ...params,
        prompt: '',
        references: refsForGeneration,
        referenceItemsCount: detectedProductCount || undefined,
        referenceStyleType: detectedStyleType,
      }),
    [params, refsForGeneration, detectedProductCount, detectedStyleType],
  )

  useEffect(() => {
    if (!promptTouched) {
      setPromptDraft(autoPrompt)
    }
  }, [autoPrompt, promptTouched])

  const update = <K extends keyof GenerationParams>(
    key: K,
    value: GenerationParams[K],
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (productRefs.length === 0) {
        setDetectedProductCount(0)
        return
      }
      try {
        const count = await estimateProductCountFromA(productRefs)
        if (!cancelled) setDetectedProductCount(count)
      } catch {
        if (!cancelled) setDetectedProductCount(Math.min(productRefs.length, 1))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [productRefs])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (styleRefs.length === 0) return
      try {
        const style = await detectStyleTypeFromB(styleRefs)
        if (!cancelled) {
          setDetectedStyleType(style)
          setParams((prev) => {
            const meta = IMAGE_TYPES.find((t) => t.value === style)
            if (!meta) return prev
            const nextImageType =
              isModelImageType(style) && isModelImageType(prev.imageType)
                ? prev.imageType
                : style
            const nextMeta = IMAGE_TYPES.find((t) => t.value === nextImageType)
            return {
              ...prev,
              imageType: nextImageType,
              scene: nextMeta?.defaultScene ?? meta.defaultScene,
            }
          })
          setPromptTouched(false)
        }
      } catch {
        // keep previous style type
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [styleRefs])

  const handleProductRefsChange = (images: ReferenceImage[]) => {
    setProductRefs(images)
    if (images.length > 0 && params.mode !== 'reference') {
      update('mode', 'reference')
    }
  }

  const handleStyleRefsChange = (images: ReferenceImage[]) => {
    setStyleRefs(images)
    if (images.length > 0 && params.mode !== 'reference') {
      update('mode', 'reference')
    }
  }

  const effectivePrompt = promptDraft.trim() || autoPrompt

  const handleImageTypeChange = (imageType: ImageType) => {
    const meta = IMAGE_TYPES.find((t) => t.value === imageType)
    setParams((prev) => ({
      ...prev,
      imageType,
      scene: meta?.defaultScene ?? prev.scene,
    }))
    setPromptTouched(false)
  }

  return (
    <div
      className={`grid w-full gap-4 px-3 py-4 sm:px-5 lg:gap-6 lg:px-6 ${
        isMobilePreview
          ? ''
          : 'lg:grid-cols-[3fr_7fr]'
      }`}
    >
      <aside
        className={`lux-card animate-fade-up space-y-5 rounded-3xl p-4 backdrop-blur lg:p-5 ${
          isMobilePreview
            ? ''
            : 'lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto'
        }`}
      >
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink lg:text-[1.8rem]">
            创作向导
          </h2>
          <p className="mt-1 text-sm text-stone lg:text-base">
            双参考区（A主体 / B风格）· 完整提示词可编辑 · 右侧 Agent 多轮调图
          </p>
          <div className="mt-2 inline-flex items-center rounded-full border border-champagne/35 bg-champagne/10 px-2.5 py-1 text-[11px] tracking-wide text-champagne-dark">
            AURA SIGNATURE WORKSPACE
          </div>
        </div>

        <ImageTypePicker
          value={params.imageType}
          onChange={handleImageTypeChange}
          compact={isMobilePreview}
        />

        <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-cream-dark bg-cream/70 px-3 py-2.5">
          <input
            type="checkbox"
            checked={lockTargetType}
            onChange={(e) => setLockTargetType(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-champagne"
          />
          <span className="text-sm leading-snug text-ink-soft">
            锁定目标类型
            <span className="mt-0.5 block text-xs text-stone">
              {lockTargetType
                ? `Agent 每轮固定按「${
                    IMAGE_TYPES.find((t) => t.value === params.imageType)?.label
                  }」生成`
                : '开启后，Agent 调图始终保持上方所选素材类型'}
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium tracking-wider text-stone uppercase">
              生成数量
            </label>
            <span className="text-base font-medium text-ink">
              {params.count} 张
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={4}
            value={params.count}
            onChange={(e) => update('count', Number(e.target.value))}
            className="w-full accent-champagne"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1 text-sm font-medium tracking-wider text-stone uppercase">
              <Wand2 className="h-3 w-3" />
              完整提示词
            </label>
            <button
              type="button"
              onClick={() => {
                setPromptDraft(autoPrompt)
                setPromptTouched(false)
              }}
              className="flex items-center gap-1 text-xs text-champagne-dark hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              按参数重建
            </button>
          </div>
          <textarea
            value={promptDraft}
            onChange={(e) => {
              setPromptDraft(e.target.value)
              setPromptTouched(true)
            }}
            rows={6}
            placeholder="可直接编写完整中文提示词…"
            className="w-full resize-y rounded-xl border border-cream-dark bg-cream px-3 py-2.5 font-display text-sm leading-relaxed text-ink outline-none placeholder:text-stone/60 focus:border-champagne"
          />
          <p className="text-xs text-stone">
            {promptTouched
              ? '已手动编辑，改参数不会覆盖（可点「按参数重建」）'
              : '随左侧参数自动更新，也可直接改写全文'}
          </p>
        </div>

        <p className="text-center text-xs text-stone">
          {apiStatus?.ready &&
          (apiStatus.provider === 'fal' ||
            apiStatus.provider === 'vibradraft')
            ? `真实生成 · 经服务端代理调用 ${
                apiStatus.provider === 'vibradraft' ? 'VibraDraft' : 'fal.ai'
              }`
            : apiStatus
              ? apiStatus.message
              : 'API 离线 · 请运行 npm run dev'}
        </p>
      </aside>

      <section className="lux-card animate-fade-up min-h-[520px] rounded-3xl p-3 backdrop-blur sm:p-4 lg:p-5">
        <AgentPanel
          isMobilePreview={isMobilePreview}
          params={params}
          productRefs={productRefs}
          styleRefs={styleRefs}
          detectedProductCount={detectedProductCount}
          detectedStyleType={detectedStyleType}
          onProductRefsChange={handleProductRefsChange}
          onStyleRefsChange={handleStyleRefsChange}
          lockTargetType={lockTargetType}
          onTaskLogged={onTaskLogged}
          onPromptChange={(p) => {
            setPromptDraft(p)
            setPromptTouched(true)
          }}
          onGenerated={onGenerated}
          apiStatus={apiStatus}
          seedPrompt={effectivePrompt}
        />
      </section>
    </div>
  )
}
