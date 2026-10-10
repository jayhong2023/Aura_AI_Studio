import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react'
import {
  AgentPanel,
  MAX_CONCURRENT_JOBS,
  type AgentPanelHandle,
} from './AgentPanel'
import { ImageTypePicker } from './ImageTypePicker'
import { ReferenceUploader, type ReferenceImage } from './ReferenceUploader'
import { type ApiStatus } from '../lib/api'
import {
  analyzeStyleFromB,
  detectOutfitType,
  estimateProductCountFromA,
  suggestAtmosphereBackground,
  type OutfitTypeSuggestion,
} from '../lib/referenceAnalysis'
import {
  buildPrompt,
  DEFAULT_PARAMS,
  defaultTypeRequirement,
  IMAGE_TYPES,
  isModelImageType,
  MODEL_IMAGE_TYPES,
  outfitShortLabel,
  swapAtmosphereBackground,
  type Artwork,
  type AtmosphereBackground,
  type ModelImageType,
  type GenerationParams,
  type ImageType,
} from '../lib/jewelry'
import type { TaskHistoryInput } from '../lib/useTaskHistory'

interface StudioProps {
  isMobilePreview?: boolean
  onGenerated: (artworks: Artwork[]) => void
  apiStatus: ApiStatus | null
  onTaskLogged: (task: TaskHistoryInput) => void
  onGeneratingChange?: (generating: boolean) => void
}

const MAX_TARGET_VIEWS = 5
const TYPE_REQUIREMENTS_KEY = 'aurastudio_type_requirements'

type RequirementOverrides = Partial<Record<ImageType, string>>

function loadRequirementOverrides(): RequirementOverrides {
  try {
    const raw = localStorage.getItem(TYPE_REQUIREMENTS_KEY)
    return raw ? (JSON.parse(raw) as RequirementOverrides) : {}
  } catch {
    return {}
  }
}

export function Studio({
  isMobilePreview = false,
  onGenerated,
  apiStatus,
  onTaskLogged,
  onGeneratingChange,
}: StudioProps) {
  const agentRef = useRef<AgentPanelHandle>(null)
  const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS)
  const [productRefs, setProductRefs] = useState<ReferenceImage[]>([])
  const [styleRefs, setStyleRefs] = useState<ReferenceImage[]>([])
  const [selectedProductRefIds, setSelectedProductRefIds] = useState<string[]>(
    [],
  )
  const [detectedProductCount, setDetectedProductCount] = useState(0)
  const [detectedStyleType, setDetectedStyleType] = useState<ImageType>(
    'model_necklace_pendant',
  )
  const [styleSummary, setStyleSummary] = useState(
    'B区未上传：按当前所选图片类型与默认布光生成',
  )
  const [promptDraft, setPromptDraft] = useState('')
  const [promptTouched, setPromptTouched] = useState(false)
  const [lockTargetType, setLockTargetType] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeJobCount, setActiveJobCount] = useState(0)
  useEffect(() => {
    onGeneratingChange?.(generating)
  }, [generating, onGeneratingChange])
  const [requirementOverrides, setRequirementOverrides] =
    useState<RequirementOverrides>(loadRequirementOverrides)
  const [atmosphereBg, setAtmosphereBg] = useState<AtmosphereBackground>('red')
  const [atmosphereBgManual, setAtmosphereBgManual] = useState(false)
  const [suggestedBg, setSuggestedBg] = useState<AtmosphereBackground>('red')
  const [atmosphereBgReason, setAtmosphereBgReason] = useState(
    '上传产品图后将按产品配色自动推荐',
  )
  const [detectedOutfit, setDetectedOutfit] =
    useState<OutfitTypeSuggestion | null>(null)
  const [outfitManual, setOutfitManual] = useState<ModelImageType | null>(null)
  const outfitType: ModelImageType =
    outfitManual ?? detectedOutfit?.type ?? 'model_necklace_pendant'
  const outfitTypeRef = useRef(outfitType)
  outfitTypeRef.current = outfitType

  const selectedProductRefs = useMemo(() => {
    const byId = new Map(productRefs.map((r) => [r.id, r]))
    return selectedProductRefIds
      .map((id) => byId.get(id))
      .filter((r): r is ReferenceImage => Boolean(r))
      .slice(0, MAX_TARGET_VIEWS)
  }, [productRefs, selectedProductRefIds])

  const refsForGeneration = useMemo(
    () => selectedProductRefs.map((r) => r.dataUrl),
    [selectedProductRefs],
  )

  const typeRequirement =
    requirementOverrides[params.imageType] ??
    defaultTypeRequirement(params.imageType, atmosphereBg)
  const requirementEdited = requirementOverrides[params.imageType] !== undefined
  const effectiveParams = useMemo(
    () => ({ ...params, typeRequirement }),
    [params, typeRequirement],
  )

  useEffect(() => {
    localStorage.setItem(
      TYPE_REQUIREMENTS_KEY,
      JSON.stringify(requirementOverrides),
    )
  }, [requirementOverrides])

  const applyAtmosphereBg = (bg: AtmosphereBackground) => {
    setAtmosphereBg(bg)
    setRequirementOverrides((prev) =>
      prev.atmosphere === undefined
        ? prev
        : { ...prev, atmosphere: swapAtmosphereBackground(prev.atmosphere, bg) },
    )
    setPromptTouched(false)
  }

  const primaryRefUrl = selectedProductRefs[0]?.dataUrl
  const selectedRefsKey = selectedProductRefs.map((r) => r.id).join('|')

  useEffect(() => {
    setOutfitManual(null)
    if (selectedProductRefs.length === 0) {
      setDetectedOutfit(null)
      return
    }
    let cancelled = false
    detectOutfitType(selectedProductRefs)
      .then((s) => {
        if (!cancelled) setDetectedOutfit(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedRefsKey])

  useEffect(() => {
    if (!isModelImageType(params.imageType) || params.imageType === outfitType) {
      return
    }
    setParams((prev) => ({ ...prev, imageType: outfitType }))
    setPromptTouched(false)
  }, [outfitType])

  useEffect(() => {
    if (!primaryRefUrl) return
    let cancelled = false
    suggestAtmosphereBackground(primaryRefUrl)
      .then((s) => {
        if (cancelled) return
        setAtmosphereBgReason(s.reason)
        setSuggestedBg(s.background)
        if (!atmosphereBgManual) applyAtmosphereBg(s.background)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [primaryRefUrl])

  const autoPrompt = useMemo(
    () =>
      buildPrompt({
        ...effectiveParams,
        prompt: '',
        references: refsForGeneration,
        referenceItemsCount: detectedProductCount || undefined,
        selectedProductViewCount: selectedProductRefs.length || undefined,
        referenceStyleType: detectedStyleType,
        referenceStyleSummary: styleSummary,
      }),
    [
      effectiveParams,
      refsForGeneration,
      detectedProductCount,
      detectedStyleType,
      selectedProductRefs.length,
      styleSummary,
    ],
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
      try {
        const analysis = await analyzeStyleFromB(styleRefs)
        if (!cancelled) {
          setDetectedStyleType(analysis.imageType)
          setStyleSummary(analysis.summary)
          if (styleRefs.length > 0) {
            setParams((prev) => {
              const meta = IMAGE_TYPES.find((t) => t.value === analysis.imageType)
              if (!meta) return prev
              const nextImageType = isModelImageType(analysis.imageType)
                ? outfitTypeRef.current
                : analysis.imageType
              const nextMeta = IMAGE_TYPES.find((t) => t.value === nextImageType)
              return {
                ...prev,
                imageType: nextImageType,
                scene: nextMeta?.defaultScene ?? meta.defaultScene,
              }
            })
            setPromptTouched(false)
          }
        }
      } catch {
        // keep previous style analysis
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [styleRefs])

  const handleProductRefsChange = (images: ReferenceImage[]) => {
    setProductRefs(images)
    setSelectedProductRefIds((prev) => {
      const valid = prev.filter((id) => images.some((img) => img.id === id))
      if (valid.length > 0) return valid.slice(0, MAX_TARGET_VIEWS)
      return images.slice(0, 1).map((r) => r.id)
    })
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
  const canGenerate =
    selectedProductRefs.length > 0 && activeJobCount < MAX_CONCURRENT_JOBS

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
        isMobilePreview ? '' : 'lg:grid-cols-[3fr_7fr]'
      }`}
    >
      <aside
        className={`lux-card animate-fade-up flex min-w-0 flex-col rounded-3xl p-4 backdrop-blur lg:p-5 ${
          isMobilePreview
            ? ''
            : 'lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100svh-2rem)]'
        }`}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        <ReferenceUploader
          label="① 上传产品图"
          emptyHint="产品实拍 / CAD，可多角度"
          images={productRefs}
          onChange={handleProductRefsChange}
          maxCount={10}
          selectable
          selectedIds={selectedProductRefIds}
          onSelectedChange={setSelectedProductRefIds}
          maxSelected={MAX_TARGET_VIEWS}
        />

        <ImageTypePicker
          label="② 选择图片类型"
          value={params.imageType}
          onChange={handleImageTypeChange}
          outfitType={outfitType}
        />

        {isModelImageType(params.imageType) && (
          <div className="-mt-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone">首饰类型</span>
              {MODEL_IMAGE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOutfitManual(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    outfitType === t
                      ? 'border-champagne bg-white text-ink shadow-sm'
                      : 'border-cream-dark text-ink-soft hover:border-champagne/40'
                  }`}
                >
                  {outfitShortLabel(t)}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-stone">
              {outfitManual
                ? '已手动指定首饰类型'
                : detectedOutfit
                  ? `已自动匹配「${outfitShortLabel(detectedOutfit.type)}」穿搭样式：${detectedOutfit.reason}，不准确可点选修改`
                  : '上传产品图后将自动识别首饰类型并匹配穿搭样式'}
            </p>
          </div>
        )}

        <details className="group rounded-2xl border border-champagne/30 bg-champagne/5">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 select-none">
            <span className="min-w-0 truncate text-xs font-medium text-ink-soft">
              「{IMAGE_TYPES.find((t) => t.value === params.imageType)?.label}」生成要求
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] whitespace-nowrap text-stone">
              {params.imageType === 'atmosphere' && (
                <>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      atmosphereBg === 'red' ? 'bg-[#8b0f17]' : 'bg-[#111111]'
                    }`}
                  />
                  {atmosphereBg === 'red' ? '红底' : '黑底'}
                  <span>·</span>
                </>
              )}
              {requirementEdited ? '已自定义' : '编辑'}
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </span>
          </summary>

          <div className="space-y-2 border-t border-champagne/20 px-3 pt-2 pb-3">
            {requirementEdited && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setRequirementOverrides((prev) => {
                      const next = { ...prev }
                      delete next[params.imageType]
                      return next
                    })
                    setPromptTouched(false)
                  }}
                  className="flex items-center gap-1 text-xs text-champagne-dark hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  恢复默认
                </button>
              </div>
            )}

            {params.imageType === 'atmosphere' && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone">背景色</span>
                  {(['red', 'black'] as const).map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => {
                        setAtmosphereBgManual(true)
                        applyAtmosphereBg(bg)
                      }}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        atmosphereBg === bg
                          ? 'border-champagne bg-white text-ink shadow-sm'
                          : 'border-cream-dark text-ink-soft hover:border-champagne/40'
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full ${
                          bg === 'red' ? 'bg-[#8b0f17]' : 'bg-[#111111]'
                        }`}
                      />
                      {bg === 'red' ? '红' : '黑'}
                    </button>
                  ))}
                  {atmosphereBgManual && (
                    <button
                      type="button"
                      onClick={() => {
                        setAtmosphereBgManual(false)
                        applyAtmosphereBg(suggestedBg)
                      }}
                      className="text-[11px] text-champagne-dark hover:underline"
                    >
                      改回自动
                    </button>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-stone">
                  {atmosphereBgManual ? '已手动指定背景色' : `自动推荐：${atmosphereBgReason}`}
                </p>
              </div>
            )}

            <textarea
              value={typeRequirement}
              onChange={(e) => {
                const value = e.target.value
                setRequirementOverrides((prev) => ({
                  ...prev,
                  [params.imageType]: value,
                }))
                setPromptTouched(false)
              }}
              rows={params.imageType === 'atmosphere' ? 6 : 3}
              className="w-full resize-y rounded-xl border border-cream-dark bg-white/80 px-3 py-2 text-xs leading-relaxed text-ink outline-none focus:border-champagne"
            />
          </div>
        </details>

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wider text-stone uppercase">
            ③ 生成张数
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => update('count', n)}
                className={`min-h-10 rounded-xl border text-sm font-medium transition-colors ${
                  params.count === n
                    ? 'border-champagne bg-champagne/15 text-ink'
                    : 'border-cream-dark bg-white/70 text-ink-soft hover:border-champagne/40'
                }`}
              >
                {n} 张
              </button>
            ))}
          </div>
        </div>

        <details className="group rounded-2xl border border-cream-dark bg-white/60">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-sm text-ink-soft select-none">
            <Settings2 className="h-4 w-4" />
            更多设置
            <span className="ml-auto text-xs text-stone group-open:hidden">
              风格参考 · 提示词
            </span>
          </summary>

          <div className="space-y-4 border-t border-cream-dark/70 px-3 py-3">
            <div className="space-y-1.5">
              <ReferenceUploader
                label="风格参考图（可选）"
                emptyHint="想模仿的拍摄风格，仅参考光影构图"
                images={styleRefs}
                onChange={handleStyleRefsChange}
                maxCount={6}
              />
              {styleRefs.length > 0 && (
                <p className="text-xs leading-relaxed text-stone">
                  {styleSummary}
                </p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={lockTargetType}
                onChange={(e) => setLockTargetType(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-champagne"
              />
              <span className="text-sm leading-snug text-ink-soft">
                对话微调时保持图片类型不变
              </span>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-wider text-stone uppercase">
                  提示词
                </span>
                {promptTouched && (
                  <button
                    type="button"
                    onClick={() => {
                      setPromptDraft(autoPrompt)
                      setPromptTouched(false)
                    }}
                    className="flex items-center gap-1 text-xs text-champagne-dark hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    恢复自动
                  </button>
                )}
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => {
                  setPromptDraft(e.target.value)
                  setPromptTouched(true)
                }}
                rows={5}
                className="w-full resize-y rounded-xl border border-cream-dark bg-cream px-3 py-2.5 font-display text-sm leading-relaxed text-ink outline-none focus:border-champagne"
              />
            </div>
          </div>
        </details>
        </div>

        <div className="shrink-0 border-t border-cream-dark/70 bg-cream/95 pt-3 -mx-4 px-4 lg:-mx-5 lg:px-5">
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => void agentRef.current?.generate()}
            className="lux-gold-btn flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-5 w-5 text-champagne" />
            {generating ? '再生成一批' : '生成图片'}
          </button>
          {productRefs.length === 0 ? (
            <p className="mt-1.5 text-center text-xs text-stone">
              先上传一张产品图即可开始
            </p>
          ) : activeJobCount >= MAX_CONCURRENT_JOBS ? (
            <p className="mt-1.5 text-center text-[11px] text-stone">
              已达 {MAX_CONCURRENT_JOBS} 个并行上限，请稍候
            </p>
          ) : generating ? (
            <p className="mt-1.5 text-center text-[11px] text-stone">
              进行中 {activeJobCount} 个 · 可改设置后继续提交
            </p>
          ) : (
            apiStatus?.model && (
              <p className="mt-1.5 truncate text-center text-[11px] text-stone">
                模型：{apiStatus.model.name} · {apiStatus.model.resolution}
              </p>
            )
          )}
        </div>
      </aside>

      <section className="lux-card animate-fade-up min-h-[520px] min-w-0 rounded-3xl p-3 backdrop-blur sm:p-4 lg:p-5">
        <AgentPanel
          ref={agentRef}
          params={effectiveParams}
          productRefs={productRefs}
          styleRefs={styleRefs}
          selectedProductRefIds={selectedProductRefIds}
          detectedProductCount={detectedProductCount}
          detectedStyleType={detectedStyleType}
          styleSummary={styleSummary}
          lockTargetType={lockTargetType}
          onTaskLogged={onTaskLogged}
          onBusyChange={setGenerating}
          onActiveCountChange={setActiveJobCount}
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
