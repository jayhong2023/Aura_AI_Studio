import { useEffect, useState } from 'react'
import { Header, type Tab, type ViewMode } from './components/Header'
import { Studio } from './components/Studio'
import { Gallery } from './components/Gallery'
import { TaskHistory } from './components/TaskHistory'
import { LoginPage } from './components/LoginPage'
import { ChangePasswordModal } from './components/ChangePasswordModal'
import { fetchApiStatus, type ApiStatus } from './lib/api'
import { useAuth } from './lib/useAuth'
import { useGallery } from './lib/useGallery'
import { useTaskHistory } from './lib/useTaskHistory'
import { Gem, Loader2 } from 'lucide-react'

export default function App() {
  const { user, loading, login, logout, changePassword } = useAuth()
  const [tab, setTab] = useState<Tab>('studio')
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [studioBusy, setStudioBusy] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('aurastudio_view_mode')
      return saved === 'mobile' ? 'mobile' : 'web'
    } catch {
      return 'web'
    }
  })
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)
  const { items, add, toggleFavorite, remove, clear } = useGallery(user?.id)
  const {
    items: taskItems,
    add: addTask,
    remove: removeTask,
    clear: clearTasks,
  } = useTaskHistory(user?.id)

  useEffect(() => {
    if (!user || user.mustChangePassword) {
      setApiStatus(null)
      return
    }
    let cancelled = false

    const load = async () => {
      const status = await fetchApiStatus()
      if (!cancelled) setApiStatus(status)
    }

    void load()
    const id = window.setInterval(() => void load(), 15000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user])

  useEffect(() => {
    try {
      localStorage.setItem('aurastudio_view_mode', viewMode)
    } catch {
      // ignore storage failures
    }
  }, [viewMode])

  if (loading) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-cream text-stone">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-champagne shadow-xl">
          <Gem className="h-6 w-6" />
        </span>
        <span className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在验证登录状态…
        </span>
      </div>
    )
  }

  if (!user) return <LoginPage onLogin={login} />

  return (
    <div className="min-h-svh bg-cream">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute -top-32 -right-24 h-96 w-96 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, #e8d5a3 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute top-1/3 -left-32 h-80 w-80 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, #c9a96233 0%, transparent 70%)',
          }}
        />
      </div>

      <Header
        tab={tab}
        onTabChange={setTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        galleryCount={items.length}
        taskCount={taskItems.length}
        studioBusy={studioBusy}
        apiStatus={apiStatus}
        user={user}
        onChangePassword={() => setShowChangePassword(true)}
        onLogout={() => {
          void logout()
          setTab('studio')
        }}
      />

      <div
        className={
          viewMode === 'mobile'
            ? 'mx-auto w-full max-w-[430px] bg-cream sm:my-3 sm:overflow-hidden sm:rounded-[28px] sm:border sm:border-cream-dark/70 sm:shadow-xl'
            : 'w-full'
        }
      >
        <main className="w-full">
          {/* Studio stays mounted so in-flight generations survive tab switches */}
          <div hidden={tab !== 'studio'}>
            <Studio
              isMobilePreview={viewMode === 'mobile'}
              apiStatus={apiStatus}
              onTaskLogged={addTask}
              onGenerated={(arts) => {
                add(arts)
              }}
              onGeneratingChange={setStudioBusy}
            />
          </div>
          {tab === 'studio' ? null : tab === 'gallery' ? (
            <Gallery
              items={items}
              onFavorite={toggleFavorite}
              onRemove={remove}
              onClear={clear}
            />
          ) : (
            <TaskHistory
              items={taskItems}
              onRemove={removeTask}
              onClear={clearTasks}
            />
          )}
        </main>

        <footer className="border-t border-cream-dark/60 py-6 text-center text-[11px] tracking-wide text-stone">
          AuraStudio · 密钥仅存服务端 · 浏览器不直连第三方 API
        </footer>
      </div>

      {(showChangePassword || user.mustChangePassword) && (
        <ChangePasswordModal
          forced={user.mustChangePassword}
          onClose={() => setShowChangePassword(false)}
          onSubmit={changePassword}
        />
      )}
    </div>
  )
}
