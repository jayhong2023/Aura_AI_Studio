import { useMemo, useState } from 'react'
import { Clock3, Search, Trash2, X } from 'lucide-react'
import { IMAGE_TYPES } from '../lib/jewelry'
import type { TaskHistoryItem, TaskStatus } from '../lib/useTaskHistory'

interface TaskHistoryProps {
  items: TaskHistoryItem[]
  onRemove: (id: string) => void
  onClear: () => void
}

export function TaskHistory({ items, onRemove, onClear }: TaskHistoryProps) {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | TaskStatus>('all')
  const [preview, setPreview] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase()
    return items.filter((it) => {
      if (status !== 'all' && it.status !== status) return false
      if (!key) return true
      return (
        it.prompt.toLowerCase().includes(key) ||
        (it.model ?? '').toLowerCase().includes(key) ||
        (it.provider ?? '').toLowerCase().includes(key)
      )
    })
  }, [items, keyword, status])

  if (items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-none flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-mist">
          <Clock3 className="h-7 w-7 text-stone" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          暂无历史任务
        </h2>
        <p className="max-w-md text-sm text-stone">
          生成成功或失败都会记录到这里，可按关键词查询提示词、模型与执行结果。
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">
            历史任务
          </h2>
          <p className="text-sm text-stone">共 {items.length} 条，可查询</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('确定清空全部历史任务吗？')) onClear()
          }}
          className="flex items-center gap-1 rounded-full border border-cream-dark bg-white px-3 py-1.5 text-xs text-stone transition-colors hover:border-red-200 hover:text-red-600"
        >
          <Trash2 className="h-3 w-3" />
          清空历史
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-cream-dark bg-white/80 p-3">
        <label className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索提示词 / 模型 / Provider"
            className="w-full rounded-xl border border-cream-dark bg-cream py-2.5 pr-3 pl-9 text-sm outline-none focus:border-champagne"
          />
        </label>
        <div className="flex rounded-full bg-mist p-1">
          {[
            { id: 'all', label: '全部' },
            { id: 'success', label: '成功' },
            { id: 'failed', label: '失败' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStatus(opt.id as 'all' | TaskStatus)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                status === opt.id ? 'bg-white text-ink shadow-sm' : 'text-stone'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone">没有匹配的历史任务</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => {
            const imageTypeLabel =
              IMAGE_TYPES.find((t) => t.value === task.imageType)?.label ??
              task.imageType
            return (
              <article
                key={task.id}
                className="space-y-2 rounded-2xl border border-cream-dark bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      task.status === 'success'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {task.status === 'success' ? '成功' : '失败'}
                  </span>
                  <span className="rounded-full bg-mist px-2.5 py-1 text-xs text-ink-soft">
                    {task.source === 'agent' ? 'Agent' : '向导'}
                  </span>
                  <span className="rounded-full bg-mist px-2.5 py-1 text-xs text-ink-soft">
                    {imageTypeLabel}
                  </span>
                  {task.model && (
                    <span className="rounded-full bg-ink px-2.5 py-1 text-xs text-cream">
                      {task.model}
                    </span>
                  )}
                  {task.provider && (
                    <span className="rounded-full bg-champagne/15 px-2.5 py-1 text-xs text-champagne-dark">
                      {task.provider}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-stone">
                    {new Date(task.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-stone">
                  <span>请求 {task.countRequested} 张</span>
                  <span>完成 {task.countCompleted} 张</span>
                  {task.durationMs ? (
                    <span>耗时 {(task.durationMs / 1000).toFixed(1)}s</span>
                  ) : null}
                  {task.errorMessage ? (
                    <span className="text-red-600">错误：{task.errorMessage}</span>
                  ) : null}
                </div>

                <div className="grid gap-3 rounded-xl border border-cream-dark bg-mist/40 p-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium tracking-wider text-stone uppercase">
                      输入
                    </p>
                    <div className="flex flex-wrap items-start gap-3">
                      <RefThumbs
                        label="A区"
                        urls={task.productRefUrls ?? []}
                        onOpen={setPreview}
                      />
                      <RefThumbs
                        label="B区"
                        urls={task.styleRefUrls ?? []}
                        onOpen={setPreview}
                      />
                    </div>
                    <div>
                      <p className="mb-0.5 text-[11px] text-stone">提示词</p>
                      <p className="font-display text-sm leading-relaxed text-ink-soft italic">
                        {task.prompt}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium tracking-wider text-stone uppercase">
                      输出
                    </p>
                    {task.previewUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {task.previewUrls.slice(0, 4).map((url, idx) => (
                          <button
                            key={`${task.id}_${idx}`}
                            type="button"
                            onClick={() => setPreview(url)}
                            className="block overflow-hidden rounded-lg border border-cream-dark"
                          >
                            <img
                              src={url}
                              alt=""
                              className="h-20 w-20 object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone">无输出（生成失败）</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRemove(task.id)}
                    className="text-xs text-stone hover:text-red-600"
                  >
                    删除记录
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-cream shadow-2xl"
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
              src={preview}
              alt="预览"
              className="max-h-[86vh] w-full bg-mist object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function RefThumbs({
  label,
  urls,
  onOpen,
}: {
  label: string
  urls: string[]
  onOpen: (url: string) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-stone">
        {label}
        <span className="ml-1 text-stone/70">{urls.length} 张</span>
      </p>
      {urls.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {urls.map((url, idx) => (
            <button
              key={`${label}_${idx}`}
              type="button"
              onClick={() => onOpen(url)}
              className="block overflow-hidden rounded-lg border border-cream-dark"
            >
              <img
                src={url}
                alt={`${label}参考图`}
                className="h-14 w-14 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-stone/60">无</p>
      )}
    </div>
  )
}

