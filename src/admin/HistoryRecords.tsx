import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { IMAGE_TYPES } from '../lib/jewelry'
import {
  fetchHistory,
  fetchHistoryFacets,
  type HistoryFilters,
  type HistoryRecord,
  type JobStatus,
} from './adminApi'
import {
  ErrorNote,
  PageHeader,
  formatDuration,
  formatTime,
  imageTypeLabel,
  secondaryBtn,
} from './ui'

const PAGE_SIZE = 20

const STATUS_META: Record<JobStatus, { label: string; className: string }> = {
  success: { label: '成功', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', className: 'bg-red-50 text-red-700' },
  running: { label: '生成中', className: 'bg-amber-50 text-amber-700' },
}

function dayStart(value: string): number | undefined {
  if (!value) return undefined
  const t = new Date(`${value}T00:00:00`).getTime()
  return Number.isFinite(t) ? t : undefined
}

export function HistoryRecords() {
  const [facets, setFacets] = useState<{
    users: Array<{ id: string; username: string; displayName: string }>
    models: string[]
    apps: Array<{ id: string; name: string }>
  }>({ users: [], models: [], apps: [] })
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState<JobStatus | ''>('')
  const [model, setModel] = useState('')
  const [imageType, setImageType] = useState('')
  const [appId, setAppId] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const [items, setItems] = useState<HistoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    void fetchHistoryFacets()
      .then((f) =>
        setFacets({ users: f.users, models: f.models, apps: f.apps || [] }),
      )
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const to = dayStart(toDate)
    const filters: HistoryFilters = {
      userId: userId || undefined,
      status,
      model: model || undefined,
      imageType: imageType || undefined,
      appId: appId || undefined,
      keyword: keyword || undefined,
      from: dayStart(fromDate),
      to: to ? to + 24 * 60 * 60 * 1000 : undefined,
      page,
      pageSize: PAGE_SIZE,
    }
    try {
      const res = await fetchHistory(filters)
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载记录失败')
    } finally {
      setLoading(false)
    }
  }, [userId, status, model, imageType, appId, keyword, fromDate, toDate, page])

  useEffect(() => {
    void load()
  }, [load])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }
  const hasFilter =
    userId || status || model || imageType || appId || keyword || fromDate || toDate

  return (
    <section>
      <PageHeader
        title="生成记录"
        description="查询所有用户的生成任务，包括提示词、结果图、所用模型与失败原因"
        actions={
          <button type="button" className={secondaryBtn} onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        }
      />

      <div className="lux-card mb-4 grid grid-cols-2 gap-2 rounded-2xl p-3 lg:grid-cols-4">
        <form
          className="relative col-span-2"
          onSubmit={(e) => {
            e.preventDefault()
            setKeyword(keywordInput.trim())
            setPage(1)
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone" />
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="搜索提示词或账号，回车确认"
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </form>
        <select
          value={userId}
          onChange={(e) => resetPage(setUserId)(e.target.value)}
          className="form-input"
          aria-label="用户"
        >
          <option value="">全部用户</option>
          {facets.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName ? `${u.displayName}（@${u.username}）` : `@${u.username}`}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => resetPage(setStatus)(e.target.value as JobStatus | '')}
          className="form-input"
          aria-label="状态"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="running">生成中</option>
        </select>
        <select
          value={model}
          onChange={(e) => resetPage(setModel)(e.target.value)}
          className="form-input"
          aria-label="模型"
        >
          <option value="">全部模型</option>
          {facets.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={imageType}
          onChange={(e) => resetPage(setImageType)(e.target.value)}
          className="form-input"
          aria-label="图片类型"
        >
          <option value="">全部类型</option>
          {IMAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={appId}
          onChange={(e) => resetPage(setAppId)(e.target.value)}
          className="form-input"
          aria-label="来源应用"
        >
          <option value="">全部来源</option>
          {facets.apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="flex min-w-0 items-center gap-2 text-xs text-stone">
          从
          <input
            type="date"
            value={fromDate}
            onChange={(e) => resetPage(setFromDate)(e.target.value)}
            className="form-input min-w-0 flex-1"
          />
        </label>
        <label className="flex min-w-0 items-center gap-2 text-xs text-stone">
          至
          <input
            type="date"
            value={toDate}
            onChange={(e) => resetPage(setToDate)(e.target.value)}
            className="form-input min-w-0 flex-1"
          />
        </label>
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setUserId('')
              setStatus('')
              setModel('')
              setImageType('')
              setAppId('')
              setKeyword('')
              setKeywordInput('')
              setFromDate('')
              setToDate('')
              setPage(1)
            }}
            className="col-span-2 justify-self-start text-xs text-champagne-dark hover:underline lg:col-span-4"
          >
            清除筛选条件
          </button>
        )}
      </div>

      <ErrorNote message={error} />

      <p className="mb-2 text-xs text-stone">共 {total} 条记录</p>

      {loading && items.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-stone">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在加载记录…
        </div>
      ) : items.length === 0 ? (
        <div className="lux-card rounded-2xl p-10 text-center text-sm text-stone">
          没有符合条件的生成记录
        </div>
      ) : (
        <div className={`grid gap-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((item) => (
            <RecordRow key={item.id} item={item} onPreview={setPreview} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm text-ink-soft">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={secondaryBtn}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className={secondaryBtn}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt="生成结果大图"
            className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <a
              href={`/api/download?url=${encodeURIComponent(new URL(preview, window.location.origin).href)}`}
              onClick={(e) => e.stopPropagation()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              title="下载原图"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              title="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function RecordRow({
  item,
  onPreview,
}: {
  item: HistoryRecord
  onPreview: (url: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = STATUS_META[item.status]
  return (
    <article className="min-w-0 rounded-2xl border border-cream-dark bg-white/80 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex shrink-0 gap-1.5">
          {item.referenceThumb && (
            <div className="relative">
              <img
                src={item.referenceThumb}
                alt="产品参考图"
                className="h-16 w-16 rounded-lg border border-cream-dark object-cover"
              />
              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                参考
              </span>
            </div>
          )}
          {item.images.slice(0, 4).map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => onPreview(url)}
              className="overflow-hidden rounded-lg border border-cream-dark hover:ring-2 hover:ring-champagne"
            >
              <img src={url} alt="生成结果" loading="lazy" className="h-16 w-16 object-cover" />
            </button>
          ))}
          {item.images.length === 0 && !item.referenceThumb && (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-mist text-[10px] text-stone">
              无图片
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
              {meta.label}
            </span>
            <span className="font-medium text-ink">@{item.username || '已删除用户'}</span>
            <span className="text-xs text-stone">{formatTime(item.createdAt)}</span>
            <span className="text-xs text-stone">· {imageTypeLabel(item.imageType)}</span>
            {item.model && (
              <span className="rounded-md bg-mist px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                {item.model}
              </span>
            )}
            {item.appId && (
              <span className="rounded-md bg-champagne/15 px-1.5 py-0.5 font-mono text-[11px] text-champagne-dark">
                {item.appId}
              </span>
            )}
            {item.status !== 'running' && (
              <span className="text-xs text-stone">
                · {item.imageCount} 张 · 耗时 {formatDuration(item.updatedAt - item.createdAt)}
              </span>
            )}
          </div>
          {item.userText && (
            <p className="mt-1 text-xs text-ink-soft">指令：{item.userText}</p>
          )}
          {item.prompt && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`mt-1 block w-full text-left text-xs leading-relaxed text-stone hover:text-ink-soft ${
                expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
              }`}
              title={expanded ? '点击收起' : '点击展开完整提示词'}
            >
              {item.prompt}
            </button>
          )}
          {item.error && (
            <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1 text-xs break-all text-red-700">
              失败原因：{item.error}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
