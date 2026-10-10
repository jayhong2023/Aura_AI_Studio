import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gem, Images, Loader2, Sparkles } from 'lucide-react'
import { Studio } from '../components/Studio'
import { Gallery } from '../components/Gallery'
import {
  artworksFromJob,
  fetchApiStatus,
  listMineJobsViaApi,
  type ApiStatus,
} from '../lib/api'
import { setEmbedAccessToken } from '../lib/http'
import type { Artwork } from '../lib/jewelry'
import type { TaskHistoryInput } from '../lib/useTaskHistory'
import {
  isInIframe,
  isInMiniprogram,
  listenFromHost,
  postToHost,
} from './bridge'

type Tab = 'studio' | 'gallery'

async function exchangeTicket(
  appId: string,
  ticket: string,
): Promise<{ accessToken: string; appName: string }> {
  const res = await fetch('/api/embed/v1/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, ticket }),
  })
  const data = (await res.json()) as {
    ok: boolean
    accessToken?: string
    app?: { name: string }
    error?: string
  }
  if (!res.ok || !data.ok || !data.accessToken) {
    throw new Error(data.error || '票据无效，请返回重新进入')
  }
  return { accessToken: data.accessToken, appName: data.app?.name || 'AuraStudio' }
}

export function EmbedApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const appId = params.get('appId') || ''
  const initialTicket = params.get('ticket') || ''

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appName, setAppName] = useState('AuraStudio')
  const [tab, setTab] = useState<Tab>('studio')
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)
  const [items, setItems] = useState<Artwork[]>([])
  const [busy, setBusy] = useState(false)
  const miniprogram = isInMiniprogram()

  const stripTicketFromUrl = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('ticket')
    window.history.replaceState({}, '', url.pathname + url.search)
  }, [])

  const activate = useCallback(
    async (ticket: string) => {
      if (!appId || !ticket) {
        setError('缺少 appId 或 ticket，请通过宿主应用进入')
        return
      }
      setError(null)
      try {
        const { accessToken, appName: name } = await exchangeTicket(appId, ticket)
        setEmbedAccessToken(accessToken)
        setAppName(name)
        stripTicketFromUrl()
        setReady(true)
        postToHost({ type: 'aura:ready', appId })
      } catch (e) {
        const msg = e instanceof Error ? e.message : '进入失败'
        setError(msg)
        postToHost({ type: 'aura:error', message: msg })
      }
    },
    [appId, stripTicketFromUrl],
  )

  useEffect(() => {
    if (initialTicket) {
      void activate(initialTicket)
    } else {
      // Wait for host to send a ticket via postMessage
      const stop = listenFromHost((msg) => {
        if (msg.type === 'aura:ticket') void activate(msg.ticket)
      })
      // Also try sessionStorage token (refresh inside iframe)
      const existing = sessionStorage.getItem('aurastudio_embed_token')
      if (existing) {
        setEmbedAccessToken(existing)
        setReady(true)
        postToHost({ type: 'aura:ready', appId })
      } else if (!isInIframe()) {
        setError('请通过宿主应用或带 ticket 的链接进入')
      }
      return stop
    }
  }, [activate, appId, initialTicket])

  useEffect(() => {
    const onExpired = () => {
      setReady(false)
      setEmbedAccessToken(null)
      postToHost({ type: 'aura:token-expired' })
      if (miniprogram || !isInIframe()) {
        setError('会话已过期，请返回重新进入')
      } else {
        setError('会话已过期，正在等待宿主刷新…')
      }
    }
    window.addEventListener('aurastudio:embed-token-expired', onExpired)
    const stop = listenFromHost((msg) => {
      if (msg.type === 'aura:ticket') void activate(msg.ticket)
    })
    return () => {
      window.removeEventListener('aurastudio:embed-token-expired', onExpired)
      stop()
    }
  }, [activate, miniprogram])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const load = async () => {
      const status = await fetchApiStatus()
      if (!cancelled) setApiStatus(status)
      try {
        const jobs = await listMineJobsViaApi(40)
        if (!cancelled) {
          setItems(jobs.flatMap((j) => artworksFromJob(j)))
        }
      } catch {
        // ignore
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [ready])

  useEffect(() => {
    if (!isInIframe()) return
    const report = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        480,
      )
      postToHost({ type: 'aura:resize', height })
    }
    report()
    const obs = new ResizeObserver(report)
    obs.observe(document.body)
    return () => obs.disconnect()
  }, [ready, tab, items.length, busy])

  const onGenerated = (arts: Artwork[]) => {
    setItems((prev) => [...arts, ...prev])
    setTab('gallery')
    if (arts.length > 0) {
      postToHost({
        type: 'aura:generated',
        jobId: arts[0].id,
        images: arts.map((a) => a.url),
        prompt: arts[0].prompt,
      })
    }
  }

  if (error && !ready) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
        <Gem className="h-8 w-8 text-champagne-dark" />
        <p className="text-sm text-red-700">{error}</p>
        {isInIframe() && !miniprogram && (
          <p className="text-xs text-stone">等待宿主应用重新签发票据…</p>
        )}
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 bg-cream text-sm text-stone">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在进入创作…
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-cream">
      <header className="sticky top-0 z-40 border-b border-cream-dark/60 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-[430px] items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-ink">
              {appName}
            </p>
            {apiStatus?.model && (
              <p className="truncate text-[10px] text-stone">
                {apiStatus.model.name} · {apiStatus.model.resolution}
              </p>
            )}
          </div>
          <nav className="lux-pill grid grid-cols-2 gap-1 rounded-full p-1">
            <button
              type="button"
              onClick={() => setTab('studio')}
              className={`flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                tab === 'studio' ? 'bg-ink text-cream' : 'text-ink-soft'
              }`}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              创作
            </button>
            <button
              type="button"
              onClick={() => setTab('gallery')}
              className={`flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                tab === 'gallery' ? 'bg-ink text-cream' : 'text-ink-soft'
              }`}
            >
              <Images className="h-3.5 w-3.5" />
              作品
              {items.length > 0 && (
                <span className="rounded-full bg-champagne/25 px-1.5 text-[10px]">
                  {items.length}
                </span>
              )}
            </button>
          </nav>
        </div>
        {miniprogram && (
          <p className="border-t border-cream-dark/40 px-3 py-1 text-center text-[10px] text-stone">
            微信内请长按图片保存到相册
          </p>
        )}
      </header>

      <main className="mx-auto w-full max-w-[430px]">
        <div hidden={tab !== 'studio'}>
          <Studio
            isMobilePreview
            apiStatus={apiStatus}
            onGenerated={onGenerated}
            onGeneratingChange={setBusy}
            onTaskLogged={(_task: TaskHistoryInput) => {
              // Embed gallery is server-backed; history stays on host via webhook
            }}
          />
        </div>
        {tab === 'gallery' && (
          <Gallery
            items={items}
            onFavorite={(id) =>
              setItems((prev) =>
                prev.map((a) =>
                  a.id === id ? { ...a, favorite: !a.favorite } : a,
                ),
              )
            }
            onRemove={(id) => setItems((prev) => prev.filter((a) => a.id !== id))}
            onClear={() => setItems([])}
          />
        )}
      </main>
    </div>
  )
}
