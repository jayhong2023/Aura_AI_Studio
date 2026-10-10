/**
 * AuraStudio Embed JS SDK — mount the creation studio in an iframe.
 *
 * Usage:
 *   const studio = AuraStudio.mount('#aura', {
 *     appId: 'app_xxx',
 *     getTicket: () => fetch('/api/aura-ticket').then(r => r.json()).then(d => d.ticket),
 *     onGenerated: ({ images }) => {},
 *   })
 *   studio.destroy()
 */

export interface AuraEmbedOptions {
  appId: string
  /** Returns a one-time ticket from the host backend */
  getTicket: () => Promise<string>
  /** Origin of AuraStudio (default: same origin) */
  baseUrl?: string
  /** Optional initial image type */
  imageType?: string
  /** iframe height; auto-grows via postMessage when omitted */
  height?: number | string
  onReady?: () => void
  onGenerated?: (payload: {
    jobId: string
    images: string[]
    prompt: string
  }) => void
  onError?: (err: { message: string }) => void
  onTokenExpired?: () => void
}

export interface AuraEmbedHandle {
  destroy: () => void
  refreshTicket: () => Promise<void>
  iframe: HTMLIFrameElement
}

type HostMessage =
  | { type: 'aura:ready'; appId: string }
  | { type: 'aura:resize'; height: number }
  | { type: 'aura:generated'; jobId: string; images: string[]; prompt: string }
  | { type: 'aura:token-expired' }
  | { type: 'aura:error'; message: string }

function resolveEl(target: string | HTMLElement): HTMLElement {
  if (typeof target === 'string') {
    const el = document.querySelector(target)
    if (!el) throw new Error(`AuraStudio: 找不到容器 ${target}`)
    return el as HTMLElement
  }
  return target
}

function mount(
  target: string | HTMLElement,
  options: AuraEmbedOptions,
): AuraEmbedHandle {
  const container = resolveEl(target)
  const base = (options.baseUrl || window.location.origin).replace(/\/$/, '')
  const iframe = document.createElement('iframe')
  iframe.title = 'AuraStudio'
  iframe.allow = 'clipboard-write'
  iframe.style.width = '100%'
  iframe.style.border = '0'
  iframe.style.display = 'block'
  iframe.style.height =
    typeof options.height === 'number'
      ? `${options.height}px`
      : options.height || '640px'

  let destroyed = false
  let embedOrigin = ''
  try {
    embedOrigin = new URL(base).origin
  } catch {
    embedOrigin = window.location.origin
  }

  const sendTicket = async () => {
    const ticket = await options.getTicket()
    if (destroyed) return
    iframe.contentWindow?.postMessage(
      { type: 'aura:ticket', ticket },
      embedOrigin,
    )
    if (options.imageType) {
      iframe.contentWindow?.postMessage(
        { type: 'aura:config', imageType: options.imageType },
        embedOrigin,
      )
    }
  }

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== embedOrigin) return
    if (event.source !== iframe.contentWindow) return
    const data = event.data as HostMessage | null
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return
    if (!data.type.startsWith('aura:')) return

    switch (data.type) {
      case 'aura:ready':
        options.onReady?.()
        break
      case 'aura:resize':
        if (options.height === undefined) {
          iframe.style.height = `${Math.max(480, data.height)}px`
        }
        break
      case 'aura:generated':
        options.onGenerated?.({
          jobId: data.jobId,
          images: data.images,
          prompt: data.prompt,
        })
        break
      case 'aura:token-expired':
        options.onTokenExpired?.()
        void sendTicket().catch((e) =>
          options.onError?.({
            message: e instanceof Error ? e.message : '刷新票据失败',
          }),
        )
        break
      case 'aura:error':
        options.onError?.({ message: data.message })
        break
    }
  }

  window.addEventListener('message', onMessage)

  // Load iframe without ticket in URL (postMessage delivers it) to avoid leaking in history
  iframe.src = `${base}/embed/?appId=${encodeURIComponent(options.appId)}`
  container.innerHTML = ''
  container.appendChild(iframe)

  iframe.addEventListener('load', () => {
    void sendTicket().catch((e) =>
      options.onError?.({
        message: e instanceof Error ? e.message : '获取票据失败',
      }),
    )
  })

  return {
    iframe,
    refreshTicket: sendTicket,
    destroy: () => {
      destroyed = true
      window.removeEventListener('message', onMessage)
      iframe.remove()
    },
  }
}

const AuraStudio = { mount }
export default AuraStudio

// UMD global
declare global {
  interface Window {
    AuraStudio?: typeof AuraStudio
  }
}
if (typeof window !== 'undefined') {
  window.AuraStudio = AuraStudio
}
