import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import {
  Download,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'
import { type ReferenceImage } from './ReferenceUploader'
import {
  ackJobViaApi,
  artworksFromJob,
  downloadImageViaApi,
  listPendingJobsViaApi,
  revisePromptViaApi,
  startGenerationJob,
  waitForJob,
  type ApiStatus,
  type GenerationJob,
} from '../lib/api'
import {
  buildPrompt,
  IMAGE_TYPES,
  type Artwork,
  type GenerationParams,
  type ImageType,
} from '../lib/jewelry'
import type { TaskHistoryInput } from '../lib/useTaskHistory'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  prompt?: string
  artworks?: Artwork[]
  model?: string
  createdAt: number
}

export interface AgentPanelHandle {
  generate: () => Promise<void>
}

interface AgentPanelProps {
  ref?: Ref<AgentPanelHandle>
  params: GenerationParams
  productRefs: ReferenceImage[]
  styleRefs: ReferenceImage[]
  selectedProductRefIds: string[]
  lockTargetType: boolean
  detectedProductCount: number
  detectedStyleType: ImageType
  styleSummary: string
  onPromptChange: (prompt: string) => void
  onGenerated: (artworks: Artwork[]) => void
  onTaskLogged: (task: TaskHistoryInput) => void
  onBusyChange?: (busy: boolean) => void
  onActiveCountChange?: (count: number) => void
  apiStatus: ApiStatus | null
  seedPrompt: string
}

export const MAX_CONCURRENT_JOBS = 4

const QUICK_CHIPS = ['背景更简洁', '光线更亮一点', '加强金属质感', '换成玫瑰金']

const MAX_TARGET_VIEWS = 5

const WELCOME =
  '左侧上传产品图、选好类型后点「生成图片」。出图后可以在下方直接说怎么改，例如「背景更简洁」。'

export function AgentPanel({
  ref,
  params,
  productRefs,
  styleRefs,
  selectedProductRefIds,
  lockTargetType,
  detectedProductCount,
  detectedStyleType,
  styleSummary,
  onPromptChange,
  onGenerated,
  onTaskLogged,
  onBusyChange,
  onActiveCountChange,
  apiStatus,
  seedPrompt,
}: AgentPanelProps) {
  const [input, setInput] = useState('')
  /** Number of in-flight generation jobs (server-backed, can run in parallel) */
  const [activeCount, setActiveCount] = useState(0)
  const activeCountRef = useRef(0)
  const [progress, setProgress] = useState(0)
  const progressByJobRef = useRef(new Map<string, number>())
  const [error, setError] = useState<string | null>(null)
  const busy = activeCount > 0
  const atCapacity = activeCount >= MAX_CONCURRENT_JOBS

  const bumpActive = (delta: number) => {
    activeCountRef.current = Math.max(0, activeCountRef.current + delta)
    setActiveCount(activeCountRef.current)
  }

  const reportProgress = (jobId: string, pct: number) => {
    progressByJobRef.current.set(jobId, pct)
    let max = 0
    for (const v of progressByJobRef.current.values()) max = Math.max(max, v)
    setProgress(max)
  }

  const clearJobProgress = (jobId: string) => {
    progressByJobRef.current.delete(jobId)
    if (progressByJobRef.current.size === 0) setProgress(0)
    else {
      let max = 0
      for (const v of progressByJobRef.current.values()) max = Math.max(max, v)
      setProgress(max)
    }
  }
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    { id: 'welcome', role: 'system', content: WELCOME, createdAt: Date.now() },
  ])
  const [workingPrompt, setWorkingPrompt] = useState(seedPrompt)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedProductRefs = useMemo(() => {
    const byId = new Map(productRefs.map((r) => [r.id, r]))
    return selectedProductRefIds
      .map((id) => byId.get(id))
      .filter((r): r is ReferenceImage => Boolean(r))
      .slice(0, MAX_TARGET_VIEWS)
  }, [productRefs, selectedProductRefIds])

  // Only A-zone selected targets enter generation images
  const refsForGeneration = useMemo(
    () => selectedProductRefs.map((r) => r.dataUrl),
    [selectedProductRefs],
  )
  const allProductRefUrls = useMemo(
    () => productRefs.map((r) => r.dataUrl),
    [productRefs],
  )
  const styleRefUrls = useMemo(
    () => styleRefs.map((r) => r.dataUrl),
    [styleRefs],
  )
  const hasResult = messages.some((m) => m.artworks && m.artworks.length > 0)
  const typeLabel =
    IMAGE_TYPES.find((t) => t.value === params.imageType)?.label ?? '图片'

  useEffect(() => {
    setWorkingPrompt(seedPrompt)
  }, [seedPrompt])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    onActiveCountChange?.(activeCount)
  }, [activeCount, onActiveCountChange])

  const push = (msg: Omit<AgentMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() },
    ])
  }

  const basePrompt = () =>
    workingPrompt.trim() ||
    buildPrompt({
      ...params,
      references: refsForGeneration,
      referenceItemsCount: detectedProductCount || undefined,
      selectedProductViewCount: selectedProductRefs.length || undefined,
      referenceStyleType: detectedStyleType,
      referenceStyleSummary: styleSummary,
    })

  const execute = async (
    userText: string,
    source: 'guide' | 'agent',
    preparePrompt: () => Promise<string>,
  ) => {
    if (activeCountRef.current >= MAX_CONCURRENT_JOBS) {
      setError(`最多同时进行 ${MAX_CONCURRENT_JOBS} 个生成任务，请等其中一个完成`)
      return
    }
    if (productRefs.length === 0) {
      setError('请先在左侧上传产品图')
      return
    }
    if (selectedProductRefs.length === 0) {
      setError('请在左侧点选至少一张要生成的产品图')
      return
    }

    setError(null)
    bumpActive(1)
    const startedAt = Date.now()
    const count = source === 'agent' ? Math.min(params.count, 2) : params.count
    const taskBase = {
      source,
      mode: params.mode,
      imageType: params.imageType,
      countRequested: count,
      productRefUrls: allProductRefUrls,
      styleRefUrls,
      selectedProductRefIds: selectedProductRefIds.slice(0, MAX_TARGET_VIEWS),
    }
    push({ role: 'user', content: userText })

    let prompt = workingPrompt
    let jobId: string | null = null
    try {
      prompt = await preparePrompt()
      const genParams: GenerationParams = {
        ...params,
        prompt,
        references: refsForGeneration,
        referenceItemsCount: detectedProductCount || undefined,
        selectedProductViewCount: selectedProductRefs.length || undefined,
        referenceStyleType: detectedStyleType,
        referenceStyleSummary: styleSummary,
        count,
      }
      const { references: _references, ...contextParams } = genParams
      const job = await startGenerationJob(genParams, prompt, {
        userText,
        source,
        params: contextParams,
        startedAt,
        selectedProductRefIds: taskBase.selectedProductRefIds,
      })
      jobId = job.id
      if (activeCountRef.current > 1) {
        push({
          role: 'system',
          content: `已提交第 ${activeCountRef.current} 个并行任务，可继续等待或再提交`,
        })
      }
      const done = await waitForJob(job.id, startedAt, (pct) =>
        reportProgress(job.id, pct),
      )
      await finishJob(done, {
        productRefUrls: allProductRefUrls,
        styleRefUrls,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败'
      if (jobId) {
        setError(msg)
        push({
          role: 'assistant',
          content: `${msg}。任务仍在服务端处理，完成后刷新页面即可看到结果。`,
        })
      } else {
        setError(
          apiStatus
            ? msg
            : '无法连接 API 服务。请用 npm run dev 同时启动前端与后端。',
        )
        onTaskLogged({
          ...taskBase,
          status: 'failed',
          prompt,
          provider: apiStatus?.provider,
          countCompleted: 0,
          durationMs: Date.now() - startedAt,
          previewUrls: [],
        })
        push({ role: 'assistant', content: `失败：${msg}` })
      }
    } finally {
      if (jobId) clearJobProgress(jobId)
      bumpActive(-1)
    }
  }

  /**
   * Shows a finished job in the chat. Gallery/history are only written by the
   * tab that wins the server-side acknowledgement, so results never duplicate.
   */
  const finishJob = async (
    job: GenerationJob,
    refs: { productRefUrls: string[]; styleRefUrls: string[] },
  ) => {
    const ctx = job.context
    const claimed = await ackJobViaApi(job.id).catch(() => false)
    const prompt = job.result?.prompt ?? ctx?.params.prompt ?? ''
    const startedAt = ctx?.startedAt ?? job.createdAt
    const taskBase = {
      source: ctx?.source ?? ('guide' as const),
      mode: ctx?.params.mode ?? params.mode,
      imageType: ctx?.params.imageType ?? params.imageType,
      countRequested: ctx?.params.count ?? 1,
      selectedProductRefIds: ctx?.selectedProductRefIds ?? [],
      durationMs: Math.max(0, job.updatedAt - startedAt),
      prompt,
      ...refs,
    }

    if (job.status === 'success') {
      const artworks = artworksFromJob(job)
      if (claimed) {
        onGenerated(artworks)
        onTaskLogged({
          ...taskBase,
          status: 'success',
          provider: artworks[0]?.provider,
          model: artworks[0]?.model,
          countCompleted: artworks.length,
          previewUrls: artworks.map((a) => a.url).slice(0, 4),
        })
      }
      push({
        role: 'assistant',
        content: `已生成 ${artworks.length} 张。不满意可以直接说怎么改。`,
        artworks,
        model: artworks[0]?.model,
        prompt,
      })
      return
    }

    const msg = job.error ?? '生成失败'
    setError(msg)
    if (claimed) {
      onTaskLogged({
        ...taskBase,
        status: 'failed',
        provider: apiStatus?.provider,
        countCompleted: 0,
        previewUrls: [],
      })
    }
    push({ role: 'assistant', content: `失败：${msg}` })
  }

  const resumedRef = useRef(false)
  useEffect(() => {
    if (resumedRef.current) return
    resumedRef.current = true
    void (async () => {
      const jobs = await listPendingJobsViaApi().catch(() => [])
      if (jobs.length === 0) return
      push({
        role: 'system',
        content: `已恢复 ${jobs.length} 个未确认的生成任务…`,
      })
      await Promise.allSettled(
        jobs.map(async (job) => {
          bumpActive(1)
          try {
            push({ role: 'user', content: job.context?.userText ?? '生成任务' })
            const done =
              job.status === 'running'
                ? await waitForJob(
                    job.id,
                    job.context?.startedAt ?? job.createdAt,
                    (pct) => reportProgress(job.id, pct),
                  )
                : job
            await finishJob(done, { productRefUrls: [], styleRefUrls: [] })
          } catch (e) {
            setError(e instanceof Error ? e.message : '恢复任务失败')
          } finally {
            clearJobProgress(job.id)
            bumpActive(-1)
          }
        }),
      )
    })()
  }, [])

  const generate = () =>
    execute(`生成 ${params.count} 张「${typeLabel}」`, 'guide', async () =>
      basePrompt(),
    )

  useImperativeHandle(ref, () => ({ generate }))

  const runTurn = (instruction: string) => {
    const text = instruction.trim()
    if (!text) return
    setInput('')
    void execute(text, 'agent', async () => {
      const { revisedPrompt, summary } = await revisePromptViaApi(
        basePrompt(),
        text,
        undefined,
        lockTargetType ? params.imageType : undefined,
      )
      setWorkingPrompt(revisedPrompt)
      onPromptChange(revisedPrompt)
      push({ role: 'assistant', content: summary })
      return revisedPrompt
    })
  }

  const clearChat = () => {
    setMessages([
      { id: 'welcome', role: 'system', content: WELCOME, createdAt: Date.now() },
    ])
    setError(null)
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col lg:min-h-[560px]">
      <div className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-cream-dark bg-white/70">
        <div className="flex items-center justify-between gap-2 border-b border-cream-dark/70 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <MessageSquare className="h-4 w-4 text-champagne-dark" />
            生成结果
          </div>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={clearChat}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone hover:bg-mist hover:text-ink"
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          )}
        </div>

        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {busy && (
            <div className="space-y-2 rounded-xl border border-champagne/25 bg-champagne/5 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-champagne-dark" />
                {activeCount > 1
                  ? `${activeCount} 个任务生成中… ${progress}%`
                  : `正在生成… ${progress}%`}
              </div>
              {!atCapacity && (
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink/80 bg-ink px-3 py-2 text-xs font-semibold text-cream"
                >
                  <Sparkles className="h-3.5 w-3.5 text-champagne" />
                  用左侧当前设置再生成一批
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-cream-dark/70 p-3">
          {hasResult && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={atCapacity}
                  onClick={() => runTurn(chip)}
                  className="rounded-full border border-cream-dark bg-cream px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-champagne/50 hover:text-ink disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              runTurn(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={atCapacity}
              placeholder={
                hasResult
                  ? '说说怎么改，例如：背景改成浅灰，光线更柔和'
                  : '也可以直接描述想要的效果并发送'
              }
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-cream-dark bg-cream px-3 py-2.5 text-sm text-ink outline-none placeholder:text-stone/60 focus:border-champagne disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={atCapacity || !input.trim()}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream disabled:opacity-50"
            >
              <Send className="h-4 w-4 text-champagne" />
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const [preview, setPreview] = useState<Artwork | null>(null)
  const handleDownload = async (art: Artwork) => {
    try {
      await downloadImageViaApi(art.url, `${art.id}.jpg`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '下载失败'
      alert(msg)
    }
  }

  if (message.role === 'system') {
    return (
      <div className="rounded-xl bg-mist/80 px-3 py-2 text-xs leading-relaxed text-stone">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] space-y-2 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-ink text-cream'
            : 'border border-cream-dark bg-cream text-ink'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.prompt && (
          <p
            className={`rounded-lg px-2.5 py-2 font-display text-[11px] italic ${
              isUser ? 'bg-white/10 text-cream/90' : 'bg-white text-ink-soft'
            }`}
          >
            {message.prompt}
          </p>
        )}
        {message.model && (
          <p className={`text-[10px] ${isUser ? 'text-cream/70' : 'text-stone'}`}>
            模型 · {message.model}
          </p>
        )}
        {message.artworks && message.artworks.length > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {message.artworks.map((art) => (
              <div
                key={art.id}
                className="group relative overflow-hidden rounded-lg border border-black/10"
              >
                <img
                  src={art.url}
                  alt={art.prompt}
                  className="aspect-square w-full object-cover"
                />
                <div className="absolute right-1.5 bottom-1.5 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setPreview(art)}
                    className="rounded-md bg-ink/75 px-1.5 py-1 text-cream backdrop-blur hover:bg-ink"
                    title="放大预览"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload(art)}
                    className="rounded-md bg-ink/75 px-1.5 py-1 text-cream backdrop-blur hover:bg-ink"
                    title="下载原图"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!isUser && !message.artworks && (
          <span className="inline-flex items-center gap-1 text-[10px] text-champagne-dark">
            <Sparkles className="h-3 w-3" />
            Agent
          </span>
        )}

        {preview && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
            onClick={() => setPreview(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-cream shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="absolute top-3 right-3 z-10 rounded-full bg-ink/60 p-2 text-cream backdrop-blur hover:bg-ink"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={preview.url}
                alt={preview.prompt}
                className="max-h-[74vh] w-full object-contain bg-mist"
              />
              <div className="flex items-center justify-between gap-3 p-4">
                <p className="line-clamp-2 text-sm text-ink-soft">{preview.prompt}</p>
                <button
                  type="button"
                  onClick={() => void handleDownload(preview)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm text-cream hover:bg-ink-soft"
                >
                  <Download className="h-4 w-4 text-champagne" />
                  下载原图
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
