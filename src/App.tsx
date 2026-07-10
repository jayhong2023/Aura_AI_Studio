import { useEffect, useState } from 'react'
import { Header, type Tab, type ViewMode } from './components/Header'
import { Studio } from './components/Studio'
import { Gallery } from './components/Gallery'
import { TaskHistory } from './components/TaskHistory'
import { fetchApiStatus, type ApiStatus } from './lib/api'
import { useGallery } from './lib/useGallery'
import { useTaskHistory } from './lib/useTaskHistory'

export default function App() {
  const [tab, setTab] = useState<Tab>('studio')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('aurastudio_view_mode')
      return saved === 'mobile' ? 'mobile' : 'web'
    } catch {
      return 'web'
    }
  })
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)
  const { items, add, toggleFavorite, remove, clear } = useGallery()
  const {
    items: taskItems,
    add: addTask,
    remove: removeTask,
    clear: clearTasks,
  } = useTaskHistory()

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('aurastudio_view_mode', viewMode)
    } catch {
      // ignore storage failures
    }
  }, [viewMode])

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
        apiStatus={apiStatus}
      />

      <div
        className={
          viewMode === 'mobile'
            ? 'mx-auto w-full max-w-[430px] bg-cream sm:my-3 sm:overflow-hidden sm:rounded-[28px] sm:border sm:border-cream-dark/70 sm:shadow-xl'
            : 'w-full'
        }
      >
        <main className="w-full">
          {tab === 'studio' ? (
            <Studio
              isMobilePreview={viewMode === 'mobile'}
              apiStatus={apiStatus}
              onTaskLogged={addTask}
              onGenerated={(arts) => {
                add(arts)
              }}
            />
          ) : tab === 'gallery' ? (
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
    </div>
  )
}
