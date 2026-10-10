import { useCallback, useEffect, useState } from 'react'
import {
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { request } from '../lib/authApi'
import { ErrorNote, PageHeader, formatTime, secondaryBtn } from './ui'

interface EmbedAppRow {
  id: string
  name: string
  allowedOrigins: string[]
  webhookUrl: string | null
  dailyImageQuota: number
  status: 'active' | 'disabled'
  createdAt: number
  updatedAt: number
  usage: { todayImages: number; totalImages: number; totalJobs: number }
}

export function EmbedApps() {
  const [apps, setApps] = useState<EmbedAppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState<{
    appId: string
    secret: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request<{ ok: true; apps: EmbedAppRow[] }>(
        '/api/admin/embed-apps',
      )
      setApps(data.apps)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section>
      <PageHeader
        title="接入应用"
        description="为 H5 / 小程序签发 AppId，免登录嵌入创作功能"
        actions={
          <>
            <button type="button" className={secondaryBtn} onClick={() => void load()}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="lux-gold-btn flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-cream"
            >
              <Plus className="h-4 w-4 text-champagne" />
              新建应用
            </button>
          </>
        }
      />

      <ErrorNote message={error} />

      {revealedSecret && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            AppSecret 仅显示一次，请立即复制保存
          </p>
          <p className="mt-1 font-mono text-xs text-amber-800">
            AppId: {revealedSecret.appId}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs">
              {revealedSecret.secret}
            </code>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                void navigator.clipboard.writeText(revealedSecret.secret)
              }}
            >
              <Copy className="h-4 w-4" />
              复制
            </button>
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-amber-800 underline"
            onClick={() => setRevealedSecret(null)}
          >
            我已保存，关闭提示
          </button>
        </div>
      )}

      {showCreate && (
        <CreateForm
          onCancel={() => setShowCreate(false)}
          onCreated={(app, secret) => {
            setShowCreate(false)
            setRevealedSecret({ appId: app.id, secret })
            void load()
          }}
        />
      )}

      {loading && apps.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-stone">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : apps.length === 0 ? (
        <div className="lux-card rounded-2xl p-10 text-center text-sm text-stone">
          还没有接入应用。创建后可在 H5 iframe 或小程序 web-view 中嵌入创作页。
        </div>
      ) : (
        <div className="grid gap-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onChanged={() => void load()}
              onSecret={(secret) => setRevealedSecret({ appId: app.id, secret })}
              onError={setError}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (app: EmbedAppRow, secret: string) => void
}) {
  const [name, setName] = useState('')
  const [origins, setOrigins] = useState('http://localhost:5173')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [quota, setQuota] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="lux-card mb-4 rounded-2xl p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        void request<{ ok: true; app: EmbedAppRow; secret: string }>(
          '/api/admin/embed-apps',
          {
            method: 'POST',
            body: JSON.stringify({
              name,
              allowedOrigins: origins
                .split(/[\n,]/)
                .map((s) => s.trim())
                .filter(Boolean),
              webhookUrl: webhookUrl || undefined,
              dailyImageQuota: quota,
            }),
          },
        )
          .then((data) => onCreated(data.app, data.secret))
          .catch((err) =>
            setError(err instanceof Error ? err.message : '创建失败'),
          )
          .finally(() => setBusy(false))
      }}
    >
      <h3 className="font-medium text-ink">创建接入应用</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-stone">
          应用名称
          <input
            required
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 品牌商城小程序"
          />
        </label>
        <label className="space-y-1 text-xs text-stone">
          每日出图额度
          <input
            type="number"
            min={0}
            className="form-input"
            value={quota}
            onChange={(e) => setQuota(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1 text-xs text-stone sm:col-span-2">
          允许嵌入的域名（逗号或换行分隔，H5 iframe 用）
          <textarea
            className="form-input min-h-20"
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder="https://shop.example.com"
          />
        </label>
        <label className="space-y-1 text-xs text-stone sm:col-span-2">
          Webhook 回调地址（可选）
          <input
            className="form-input"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://shop.example.com/hooks/aura"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          取消
        </button>
        <button
          type="submit"
          disabled={busy}
          className="lux-gold-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          创建
        </button>
      </div>
    </form>
  )
}

function AppCard({
  app,
  onChanged,
  onSecret,
  onError,
}: {
  app: EmbedAppRow
  onChanged: () => void
  onSecret: (secret: string) => void
  onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`lux-card rounded-2xl p-4 ${
        app.status === 'disabled' ? 'opacity-70' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {app.name}
            {app.status === 'disabled' && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
                已停用
              </span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-stone">{app.id}</p>
          <p className="mt-2 text-xs text-stone">
            今日 {app.usage.todayImages}/{app.dailyImageQuota} 张 · 累计{' '}
            {app.usage.totalImages} 张 / {app.usage.totalJobs} 任务 · 创建于{' '}
            {formatTime(app.createdAt)}
          </p>
          {app.allowedOrigins.length > 0 && (
            <p className="mt-1 text-[11px] text-stone">
              域名：{app.allowedOrigins.join(' · ')}
            </p>
          )}
          {app.webhookUrl && (
            <p className="mt-0.5 truncate text-[11px] text-stone">
              Webhook：{app.webhookUrl}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() =>
              void run(async () => {
                await request(`/api/admin/embed-apps/${app.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    status: app.status === 'active' ? 'disabled' : 'active',
                  }),
                })
              })
            }
          >
            {app.status === 'active' ? '停用' : '启用'}
          </button>
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() => {
              if (!window.confirm('重置 Secret 后旧密钥立即失效，确定吗？')) return
              void run(async () => {
                const data = await request<{ ok: true; secret: string }>(
                  `/api/admin/embed-apps/${app.id}/reset-secret`,
                  { method: 'POST' },
                )
                onSecret(data.secret)
              })
            }}
          >
            <KeyRound className="h-4 w-4" />
            重置密钥
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-sm text-red-700"
            onClick={() => {
              if (!window.confirm(`确定删除应用 ${app.name}？`)) return
              void run(async () => {
                await request(`/api/admin/embed-apps/${app.id}`, {
                  method: 'DELETE',
                })
              })
            }}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      </div>
    </article>
  )
}
