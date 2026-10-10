import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clapperboard, Gem, ImageIcon, Loader2, RefreshCw } from 'lucide-react'
import {
  fetchModels,
  saveGenerationSettings,
  type ImageResolution,
  type ModelInfo,
  type ModelsResponse,
} from './adminApi'
import { ErrorNote, PageHeader, formatTime, secondaryBtn } from './ui'

/** Findings from side-by-side jewelry tests, shown to help admins choose. */
const MODEL_NOTES: Record<string, string> = {
  'gemini-3-pro-image': '产品还原与皮肤真实感最好，4K 实际 3584×4800，速度较快',
  'gpt-image-2.0': '产品还原好，速度最慢；4K 实际约 2480×3312，可输出 JPEG',
  'gemini-3.1-flash-image': '速度最快、成本低，但细节容易走样，适合草稿',
  'gemini-3.1-flash-lite-image': '仅支持 1K，适合快速预览',
}

const RESOLUTIONS: ImageResolution[] = ['1K', '2K', '4K']

function supportsReference(m: ModelInfo) {
  return m.supportedModes.includes('edit')
}

function resolutionOptions(m: ModelInfo): ImageResolution[] {
  if (m.supportedResolutions.length === 0) return RESOLUTIONS
  return RESOLUTIONS.filter((r) => m.supportedResolutions.includes(r))
}

export function ModelManagement() {
  const [data, setData] = useState<ModelsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedTip, setSavedTip] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ modelId: string; resolution: ImageResolution } | null>(
    null,
  )

  const load = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchModels(refresh)
      setData(res)
      setDraft({ modelId: res.settings.imageModelId, resolution: res.settings.resolution })
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载模型失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const imageModels = useMemo(
    () =>
      (data?.models ?? [])
        .filter((m) => m.type === 'image')
        .sort((a, b) => Number(supportsReference(b)) - Number(supportsReference(a))),
    [data],
  )
  const videoModels = useMemo(
    () => (data?.models ?? []).filter((m) => m.type === 'video'),
    [data],
  )

  const current = data?.settings
  const dirty =
    !!draft &&
    !!current &&
    (draft.modelId !== current.imageModelId || draft.resolution !== current.resolution)
  const draftModel = imageModels.find((m) => m.id === draft?.modelId)

  const apply = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const settings = await saveGenerationSettings(draft.modelId, draft.resolution)
      setData((prev) => (prev ? { ...prev, settings } : prev))
      setSavedTip(`已切换为「${settings.imageModelName}」· ${settings.resolution}，所有用户的新任务立即生效`)
      window.setTimeout(() => setSavedTip(null), 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="pb-24">
      <PageHeader
        title="模型管理"
        description="选择全平台使用的生图模型与输出分辨率；切换后新任务立即生效，创作页约 15 秒内同步显示"
        actions={
          <button
            type="button"
            className={secondaryBtn}
            disabled={loading}
            onClick={() => void load(true)}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新模型列表
          </button>
        }
      />

      <ErrorNote message={error} />
      {savedTip && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Check className="h-4 w-4" />
          {savedTip}
        </p>
      )}
      {data?.notice && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {data.notice}
        </p>
      )}

      {loading && !data ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-stone">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在读取 MCP 模型列表…
        </div>
      ) : (
        current && (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="lux-card rounded-2xl p-4 sm:col-span-2">
                <p className="text-xs text-stone">当前生效</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {current.imageModelName}
                  <span className="ml-2 rounded-full bg-champagne/15 px-2 py-0.5 align-middle text-xs font-medium text-champagne-dark">
                    {current.resolution}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-stone">{current.imageModelId}</p>
                <p className="mt-2 text-xs text-stone">
                  {current.updatedAt
                    ? `由 @${current.updatedBy ?? '—'} 于 ${formatTime(current.updatedAt)} 设置`
                    : '使用服务端默认配置（尚未在后台修改过）'}
                </p>
              </div>
              <div className="lux-card rounded-2xl p-4">
                <p className="flex items-center gap-1.5 text-xs text-stone">
                  <Gem className="h-3.5 w-3.5 text-champagne-dark" />
                  钻石余额
                </p>
                <p className="mt-1 text-3xl font-semibold text-ink">
                  {data?.balance ?? '—'}
                </p>
                <p className="mt-1 text-xs text-stone">VibraDraft 账户剩余额度</p>
              </div>
            </div>

            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <ImageIcon className="h-4 w-4 text-champagne-dark" />
              生图模型（{imageModels.length}）
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {imageModels.map((m) => {
                const usable = supportsReference(m) && m.status === 'available'
                const isCurrent = m.id === current.imageModelId
                const isDraft = m.id === draft?.modelId
                return (
                  <article
                    key={m.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      isDraft
                        ? 'border-champagne bg-white shadow-md ring-1 ring-champagne/40'
                        : usable
                          ? 'border-cream-dark bg-white/75'
                          : 'border-cream-dark bg-mist/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{m.displayName}</p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-stone">
                          {m.id} · {m.providerName}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {isCurrent && (
                          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] text-champagne-light">
                            当前使用
                          </span>
                        )}
                        {!supportsReference(m) && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                            不支持参考图
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded-md bg-mist px-1.5 py-0.5 text-ink-soft">
                        {m.supportedModes.map((x) => (x === 'edit' ? '图生图' : '文生图')).join(' / ')}
                      </span>
                      {m.supportsCustomSize && (
                        <span className="rounded-md bg-mist px-1.5 py-0.5 text-ink-soft">
                          自定义尺寸
                        </span>
                      )}
                      <span className="rounded-md bg-mist px-1.5 py-0.5 text-ink-soft">
                        {m.cost !== undefined
                          ? `${m.cost} 钻石/张${m.costCny !== undefined ? ` ≈ ¥${m.costCny}` : ''}`
                          : '费用未知'}
                      </span>
                    </div>

                    {MODEL_NOTES[m.id] && (
                      <p className="mt-2 text-xs leading-relaxed text-stone">{MODEL_NOTES[m.id]}</p>
                    )}

                    {usable ? (
                      <div className="mt-3 flex items-center gap-1.5">
                        <span className="mr-1 text-xs text-stone">分辨率</span>
                        {resolutionOptions(m).map((r) => {
                          const active = isDraft && draft?.resolution === r
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setDraft({ modelId: m.id, resolution: r })}
                              className={`min-h-8 rounded-lg border px-3 text-xs font-medium ${
                                active
                                  ? 'border-champagne bg-champagne/15 text-ink'
                                  : 'border-cream-dark bg-white text-ink-soft hover:border-champagne/50'
                              }`}
                            >
                              {r}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-stone">
                        创作平台基于产品参考图生成，该模型无法选用
                      </p>
                    )}
                  </article>
                )
              })}
            </div>

            {videoModels.length > 0 && (
              <>
                <h2 className="mt-8 mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Clapperboard className="h-4 w-4 text-champagne-dark" />
                  视频模型（{videoModels.length}）
                  <span className="text-xs font-normal text-stone">平台暂未接入生视频，仅供查看</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {videoModels.map((m) => (
                    <article
                      key={m.id}
                      className="rounded-2xl border border-cream-dark bg-white/60 p-4"
                    >
                      <p className="font-medium text-ink">{m.displayName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-stone">
                        {m.id} · {m.providerName}
                      </p>
                      <p className="mt-2 text-[11px] text-stone">
                        比例 {m.supportedAspectRatios.join(' / ') || '—'}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )
      )}

      {dirty && draftModel && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-dark bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              将切换为 <b className="text-ink">{draftModel.displayName}</b> · {draft?.resolution}
              ，所有用户的新生成任务立即使用该配置
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={secondaryBtn}
                onClick={() =>
                  current &&
                  setDraft({ modelId: current.imageModelId, resolution: current.resolution })
                }
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void apply()}
                className="lux-gold-btn flex min-h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-cream disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                应用到全平台
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
