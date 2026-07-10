import { Clock3, Gem, Images, Monitor, Smartphone, Sparkles } from 'lucide-react'
import type { ApiStatus } from '../lib/api'

export type Tab = 'studio' | 'gallery' | 'history'
export type ViewMode = 'web' | 'mobile'

interface HeaderProps {
  tab: Tab
  onTabChange: (tab: Tab) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  galleryCount: number
  taskCount: number
  apiStatus: ApiStatus | null
}

export function Header({
  tab,
  onTabChange,
  viewMode,
  onViewModeChange,
  galleryCount,
  taskCount,
  apiStatus,
}: HeaderProps) {
  const isMobilePreview = viewMode === 'mobile'

  return (
    <header className="sticky top-0 z-50 border-b border-cream-dark/80 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-none flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#111111] via-[#2b2b2b] to-[#111111] shadow-[0_6px_16px_rgba(0,0,0,0.25)] ring-1 ring-champagne/30">
            <Gem className="h-4.5 w-4.5 text-champagne-light" strokeWidth={1.75} />
          </div>
          <div className="leading-tight">
            <h1 className="font-display text-xl font-semibold tracking-[0.06em] text-ink">
              AuraStudio
            </h1>
            <p className="hidden text-[11px] tracking-wider text-stone uppercase sm:block">
              Jewelry AI Studio
            </p>
          </div>
        </div>

        <div
          className={`flex w-full items-center gap-2 sm:w-auto sm:justify-end sm:gap-3 ${
            isMobilePreview ? 'flex-wrap justify-between' : 'justify-between'
          }`}
        >
          <div className="lux-pill flex items-center rounded-full p-1">
            <button
              type="button"
              onClick={() => onViewModeChange('web')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                viewMode === 'web'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
              title="网页版视图"
            >
              <Monitor className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">网页版</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('mobile')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                viewMode === 'mobile'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
              title="手机版视图"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">手机版</span>
            </button>
          </div>

          <ProviderBadge status={apiStatus} compact={isMobilePreview} />

          <nav
            className={`lux-pill rounded-full p-1 ${
              isMobilePreview
                ? 'grid w-full grid-cols-3 gap-1 overflow-hidden'
                : 'flex max-w-[60vw] items-center gap-1 overflow-x-auto sm:max-w-none'
            }`}
          >
            <button
              type="button"
              onClick={() => onTabChange('studio')}
              className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 font-medium whitespace-nowrap transition-all ${
                tab === 'studio'
                  ? 'bg-ink text-cream shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              } ${isMobilePreview ? 'text-xs' : 'text-sm'}`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              创作
            </button>
            <button
              type="button"
              onClick={() => onTabChange('gallery')}
              className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 font-medium whitespace-nowrap transition-all ${
                tab === 'gallery'
                  ? 'bg-ink text-cream shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              } ${isMobilePreview ? 'text-xs' : 'text-sm'}`}
            >
              <Images className="h-3.5 w-3.5" />
              {isMobilePreview ? '作品' : '作品库'}
              {galleryCount > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    tab === 'gallery'
                      ? 'bg-champagne/30 text-champagne-light'
                      : 'bg-champagne/20 text-champagne-dark'
                  }`}
                >
                  {galleryCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onTabChange('history')}
              className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 font-medium whitespace-nowrap transition-all ${
                tab === 'history'
                  ? 'bg-ink text-cream shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              } ${isMobilePreview ? 'text-xs' : 'text-sm'}`}
            >
              <Clock3 className="h-3.5 w-3.5" />
              {isMobilePreview ? '历史' : '历史任务'}
              {taskCount > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    tab === 'history'
                      ? 'bg-champagne/30 text-champagne-light'
                      : 'bg-champagne/20 text-champagne-dark'
                  }`}
                >
                  {taskCount}
                </span>
              )}
            </button>
          </nav>
        </div>
      </div>
    </header>
  )
}

function ProviderBadge({
  status,
  compact = false,
}: {
  status: ApiStatus | null
  compact?: boolean
}) {
  if (!status) {
    return (
      <span
        title="API 服务未连接，请运行 npm run dev"
        className={`hidden items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700 ${
          compact ? 'xl:inline-flex' : 'sm:inline-flex'
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        API 离线
      </span>
    )
  }

  const isLive =
    status.ready &&
    (status.provider === 'fal' || status.provider === 'vibradraft')

  const label = !status.ready
    ? `${status.provider} 未就绪`
    : status.provider === 'fal'
      ? 'fal.ai'
      : status.provider === 'vibradraft'
        ? 'VibraDraft'
        : '演示'

  return (
    <span
      title={status.message}
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        compact ? 'xl:inline-flex' : 'sm:inline-flex'
      } ${
        isLive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : status.ready
            ? 'border-cream-dark bg-white text-ink-soft'
            : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isLive
            ? 'bg-emerald-500'
            : status.ready
              ? 'bg-champagne'
              : 'bg-amber-500'
        }`}
      />
      {label}
    </span>
  )
}
