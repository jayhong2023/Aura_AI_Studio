import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { fetchStats, type GenerationSettings, type HistoryStats } from './adminApi'
import { ErrorNote, PageHeader } from './ui'

type Section = 'overview' | 'models' | 'users' | 'history' | 'embed'

export function Overview({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [data, setData] = useState<{
    stats: HistoryStats
    userCount: number
    settings: GenerationSettings
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStats()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载统计失败'))
  }, [])

  if (!data) {
    return (
      <section>
        <PageHeader title="概览" />
        <ErrorNote message={error} />
        {!error && (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-stone">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在加载统计…
          </div>
        )}
      </section>
    )
  }

  const { stats, userCount, settings } = data
  const finished = stats.successJobs + stats.failedJobs
  const successRate = finished ? Math.round((stats.successJobs / finished) * 100) : null
  const days = lastDays(14, stats.byDay)
  const maxDay = Math.max(1, ...days.map((d) => d.images))
  const maxModel = Math.max(1, ...stats.byModel.map((m) => m.images))

  return (
    <section>
      <PageHeader title="概览" description="平台用量与当前生成配置" />

      <button
        type="button"
        onClick={() => onNavigate('models')}
        className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-4 text-left text-cream shadow-lg"
      >
        <div>
          <p className="text-xs text-cream/60">当前生图模型</p>
          <p className="mt-0.5 text-lg font-semibold">
            {settings.imageModelName}
            <span className="ml-2 rounded-full bg-champagne/20 px-2 py-0.5 align-middle text-xs text-champagne-light">
              {settings.resolution}
            </span>
          </p>
        </div>
        <span className="flex items-center gap-1 text-sm text-champagne-light">
          切换模型
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="今日任务" value={stats.todayJobs} hint={`今日出图 ${stats.todayImages} 张`} />
        <StatCard label="累计出图" value={stats.totalImages} hint={`共 ${stats.totalJobs} 个任务`} />
        <StatCard
          label="成功率"
          value={successRate === null ? '—' : `${successRate}%`}
          hint={`失败 ${stats.failedJobs} · 进行中 ${stats.runningJobs}`}
        />
        <StatCard
          label="用户"
          value={userCount}
          hint={`近 7 天活跃 ${stats.activeUsers7d} 人`}
          onClick={() => onNavigate('users')}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lux-card rounded-2xl p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">近 14 天出图量</h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs text-champagne-dark hover:underline"
            >
              查看生成记录
            </button>
          </div>
          <div className="flex h-40 items-end gap-1.5">
            {days.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}：${d.jobs} 个任务，${d.images} 张图`}>
                <span className="text-[10px] text-stone">{d.images || ''}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-champagne-dark to-champagne-light"
                  style={{ height: `${(d.images / maxDay) * 100}%`, minHeight: d.images ? 4 : 1 }}
                />
                <span className="text-[10px] text-stone">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lux-card rounded-2xl p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-ink">各模型出图量</h2>
          {stats.byModel.length === 0 ? (
            <p className="py-10 text-center text-xs text-stone">暂无成功的生成记录</p>
          ) : (
            <div className="space-y-3">
              {stats.byModel.map((m) => (
                <div key={m.model}>
                  <div className="flex justify-between text-xs">
                    <span className="truncate font-mono text-ink-soft">{m.model}</span>
                    <span className="text-stone">{m.images} 张</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-mist">
                    <div
                      className="h-2 rounded-full bg-champagne"
                      style={{ width: `${(m.images / maxModel) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function StatCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: number | string
  hint: string
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="lux-card rounded-2xl p-4 text-left"
    >
      <p className="text-xs text-stone">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-stone">{hint}</p>
    </Tag>
  )
}

function lastDays(
  n: number,
  data: Array<{ day: string; jobs: number; images: number }>,
) {
  const byDay = new Map(data.map((d) => [d.day, d]))
  const out: Array<{ day: string; jobs: number; images: number }> = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push(byDay.get(key) ?? { day: key, jobs: 0, images: 0 })
  }
  return out
}
