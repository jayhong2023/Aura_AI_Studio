import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  ReferenceUploader,
  type ReferenceImage,
} from './ReferenceUploader'
import {
  downloadImageViaApi,
  generateViaApi,
  revisePromptViaApi,
  type ApiStatus,
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

interface AgentPanelProps {
  isMobilePreview?: boolean
  params: GenerationParams
  productRefs: ReferenceImage[]
  styleRefs: ReferenceImage[]
  onProductRefsChange: (images: ReferenceImage[]) => void
  onStyleRefsChange: (images: ReferenceImage[]) => void
  lockTargetType: boolean
  detectedProductCount: number
  detectedStyleType: ImageType
  onPromptChange: (prompt: string) => void
  onGenerated: (artworks: Artwork[]) => void
  onTaskLogged: (task: TaskHistoryInput) => void
  apiStatus: ApiStatus | null
  seedPrompt: string
}

const QUICK_CHIPS = [
  '换成产品白底图',
  '改成模特佩戴图',
  '做成氛围大片',
  '换成玫瑰金',
  '宝石换成钻石',
  '更亮一点',
]

export function AgentPanel({
  isMobilePreview = false,
  params,
  productRefs,
  styleRefs,
  onProductRefsChange,
  onStyleRefsChange,
  lockTargetType,
  detectedProductCount,
  detectedStyleType,
  onPromptChange,
  onGenerated,
  onTaskLogged,
  apiStatus,
  seedPrompt,
}: AgentPanelProps) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    {
      id: 'welcome',
      role: 'system',
      content:
        'Agent 模式：用自然语言描述想要的调整，我会修订提示词并重新生成。例如「换成玫瑰金」「改成手部佩戴」「更亮一点」。',
      createdAt: Date.now(),
    },
  ])
  const [workingPrompt, setWorkingPrompt] = useState(seedPrompt)
  const bottomRef = useRef<HTMLDivElement>(null)
  const productRefUrls = useMemo(
    () => productRefs.slice(0, 3).map((r) => r.dataUrl),
    [productRefs],
  )
  const styleRefUrls = useMemo(
    () => styleRefs.slice(0, 2).map((r) => r.dataUrl),
    [styleRefs],
  )
  const refsForGeneration = useMemo(
    () => [...productRefUrls, ...styleRefUrls],
    [productRefUrls, styleRefUrls],
  )

  useEffect(() => {
    setWorkingPrompt(seedPrompt)
  }, [seedPrompt])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const push = (msg: Omit<AgentMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() },
    ])
  }

  const runTurn = async (instruction: string) => {
    if (busy || !instruction.trim()) return

    if (params.mode === 'reference' && productRefs.length === 0) {
      setError('参考图模式下请先在A区上传至少一张产品图')
      return
    }
    if (params.mode === 'reference' && styleRefs.length === 0) {
      setError('参考图模式下请先在B区上传至少一张风格图')
      return
    }

    setError(null)
    setBusy(true)
    setProgress(0)
    const startedAt = Date.now()
    push({ role: 'user', content: instruction.trim() })

    try {
      const base =
        workingPrompt.trim() ||
        buildPrompt({
          ...params,
          references: refsForGeneration,
          referenceItemsCount: detectedProductCount || undefined,
          referenceStyleType: detectedStyleType,
        })

      const { revisedPrompt, summary } = await revisePromptViaApi(
        base,
        instruction,
        undefined,
        lockTargetType ? params.imageType : undefined,
      )
      setWorkingPrompt(revisedPrompt)
      onPromptChange(revisedPrompt)

      push({
        role: 'assistant',
        content: `${summary}\n\n将使用以下提示词重新生成：`,
        prompt: revisedPrompt,
      })

      const artworks = await generateViaApi(
        {
          ...params,
          prompt: revisedPrompt,
          references: refsForGeneration,
          referenceItemsCount: detectedProductCount || undefined,
          referenceStyleType: detectedStyleType,
          count: Math.min(params.count, 2),
        },
        setProgress,
        revisedPrompt,
      )

      onGenerated(artworks)
      onTaskLogged({
        status: 'success',
        source: 'agent',
        mode: params.mode,
        imageType: params.imageType,
        prompt: revisedPrompt,
        provider: artworks[0]?.provider,
        model: artworks[0]?.model,
        countRequested: Math.min(params.count, 2),
        countCompleted: artworks.length,
        durationMs: Date.now() - startedAt,
        productRefUrls,
        styleRefUrls,
        previewUrls: artworks.map((a) => a.url).slice(0, 4),
      })
      push({
        role: 'assistant',
        content: `已生成 ${artworks.length} 张。可继续说「再暗一点」「换成蓝宝石」等继续调整。`,
        artworks,
        model: artworks[0]?.model,
        prompt: revisedPrompt,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '调整失败'
      setError(
        apiStatus
          ? msg
          : '无法连接 API 服务。请用 npm run dev 同时启动前端与后端。',
      )
      onTaskLogged({
        status: 'failed',
        source: 'agent',
        mode: params.mode,
        imageType: params.imageType,
        prompt: workingPrompt,
        provider: apiStatus?.provider,
        countRequested: Math.min(params.count, 2),
        countCompleted: 0,
        durationMs: Date.now() - startedAt,
        productRefUrls,
        styleRefUrls,
        previewUrls: [],
      })
      push({ role: 'assistant', content: `失败：${msg}` })
    } finally {
      setBusy(false)
      setProgress(0)
      setInput('')
    }
  }

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: '对话已清空。可以说「换成玫瑰金」或「改成白底主图」开始新一轮调整。',
        createdAt: Date.now(),
      },
    ])
    setError(null)
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-3 lg:min-h-[560px] lg:gap-4">
      {params.mode === 'reference' && (
        <div className="space-y-3">
          <div
            className={`grid gap-3 ${
              isMobilePreview ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            <ReferenceUploader
              label="A区 · 产品主体"
              emptyHint="上传产品实拍 / CAD（可多商品）"
              images={productRefs}
              onChange={onProductRefsChange}
              maxCount={10}
            />
            <ReferenceUploader
              label="B区 · 风格模板"
              emptyHint="上传模特图 / 白底图 / 氛围图"
              images={styleRefs}
              onChange={onStyleRefsChange}
              maxCount={6}
            />
          </div>
          <div className="rounded-2xl border border-cream-dark bg-mist/70 px-3 py-2 text-xs leading-relaxed text-stone">
            识别结果：A区约 {detectedProductCount || 0} 件商品 · B区风格为
            {IMAGE_TYPES.find((t) => t.value === detectedStyleType)?.label}
            。生成时优先使用 A区前3张 + B区前2张。
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-cream-dark bg-white/70">
        <div className="flex items-center justify-between gap-2 border-b border-cream-dark/70 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <MessageSquare className="h-4 w-4 text-champagne-dark" />
            对话调图
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowPrompt((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone hover:bg-mist hover:text-ink"
            >
              <Wand2 className="h-3 w-3" />
              {showPrompt ? '隐藏提示词' : '当前提示词'}
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone hover:bg-mist hover:text-ink"
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          </div>
        </div>

        {showPrompt && (
          <div className="border-b border-cream-dark/70 bg-mist/50 px-4 py-2.5">
            <p className="mb-1 text-[11px] font-medium tracking-wider text-stone uppercase">
              当前工作提示词
            </p>
            <p className="max-h-24 overflow-y-auto font-display text-sm leading-relaxed text-ink-soft italic">
              {workingPrompt || '（尚未生成，将根据左侧参数自动构建）'}
            </p>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-stone">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在修订并生成… {progress}%
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-2 border-t border-cream-dark/70 p-3">
          {lockTargetType && (
            <p className="rounded-lg bg-champagne/10 px-3 py-1.5 text-[11px] text-champagne-dark">
              已锁定目标类型「
              {IMAGE_TYPES.find((t) => t.value === params.imageType)?.label}
              」，Agent 每轮将固定按此类型生成。
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void runTurn(chip)}
                className="rounded-full border border-cream-dark bg-cream px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-champagne/50 hover:text-ink disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void runTurn(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="描述想怎么改，例如：换成蓝宝石，背景改白底…"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-cream-dark bg-cream px-3 py-2.5 text-sm text-ink outline-none placeholder:text-stone/60 focus:border-champagne disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="min-h-11 shrink-0 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-champagne" />
              )}
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
