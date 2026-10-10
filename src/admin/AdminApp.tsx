import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Cpu,
  Gem,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Puzzle,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { ChangePasswordModal } from '../components/ChangePasswordModal'
import { LoginPage } from '../components/LoginPage'
import { useAuth } from '../lib/useAuth'
import { EmbedApps } from './EmbedApps'
import { HistoryRecords } from './HistoryRecords'
import { ModelManagement } from './ModelManagement'
import { Overview } from './Overview'
import { UserManagement } from './UserManagement'

type Section = 'overview' | 'models' | 'users' | 'history' | 'embed'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Cpu }> = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'models', label: '模型管理', icon: Cpu },
  { id: 'embed', label: '接入应用', icon: Puzzle },
  { id: 'users', label: '用户管理', icon: Users },
  { id: 'history', label: '生成记录', icon: History },
]

function sectionFromHash(): Section {
  const id = window.location.hash.replace('#', '')
  return SECTIONS.some((s) => s.id === id) ? (id as Section) : 'overview'
}

export function AdminApp() {
  const { user, loading, login, logout, changePassword } = useAuth()
  const [section, setSection] = useState<Section>(sectionFromHash)

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (id: Section) => {
    window.location.hash = id
    setSection(id)
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 bg-cream text-sm text-stone">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在验证登录状态…
      </div>
    )
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={login}
        subtitle="Admin Console"
        description="管理员登录 · 模型、用户与生成记录管理"
      />
    )
  }

  if (user.mustChangePassword) {
    return (
      <div className="min-h-svh bg-cream">
        <ChangePasswordModal forced onClose={() => {}} onSubmit={changePassword} />
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-cream px-4">
        <div className="lux-card max-w-sm rounded-3xl p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-champagne-dark" />
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">无访问权限</h1>
          <p className="mt-2 text-sm text-stone">
            当前账号 @{user.username} 不是管理员，无法进入管理后台。
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <a
              href="/"
              className="rounded-xl border border-cream-dark bg-white px-4 py-2 text-sm text-ink-soft"
            >
              返回创作平台
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="lux-gold-btn rounded-xl px-4 py-2 text-sm font-semibold text-cream"
            >
              切换账号
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-cream lg:flex">
      <aside className="sticky top-0 z-30 bg-ink text-cream lg:h-svh lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:px-5 lg:py-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-champagne/40">
              <Gem className="h-4.5 w-4.5 text-champagne-light" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold tracking-wide">AuraStudio</p>
              <p className="text-[10px] tracking-[0.2em] text-champagne-light/80 uppercase">
                Admin Console
              </p>
            </div>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-cream/70 hover:text-champagne-light lg:hidden"
          >
            创作平台
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <nav className="grid grid-cols-5 gap-1 px-2 pb-2 lg:flex lg:flex-col lg:px-3 lg:pb-0">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-xs whitespace-nowrap transition-colors lg:justify-start lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-sm ${
                section === id
                  ? 'bg-champagne/15 text-champagne-light'
                  : 'text-cream/65 hover:bg-white/5 hover:text-cream'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="hidden border-t border-white/10 px-5 py-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="mb-3 flex items-center gap-1.5 text-xs text-cream/60 hover:text-champagne-light"
          >
            打开创作平台
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <p className="truncate text-sm">{user.displayName || user.username}</p>
          <p className="truncate text-[11px] text-cream/50">@{user.username} · 管理员</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 flex items-center gap-1.5 text-xs text-cream/60 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          {section === 'overview' && <Overview onNavigate={go} />}
          {section === 'models' && <ModelManagement />}
          {section === 'embed' && <EmbedApps />}
          {section === 'users' && <UserManagement currentUser={user} />}
          {section === 'history' && <HistoryRecords />}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="mx-auto mt-8 flex items-center gap-1.5 text-xs text-stone hover:text-red-600 lg:hidden"
        >
          <LogOut className="h-3.5 w-3.5" />
          退出登录（@{user.username}）
        </button>
      </main>
    </div>
  )
}