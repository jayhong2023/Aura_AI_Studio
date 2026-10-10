/** postMessage protocol between embed page and H5 host (AuraStudio JS SDK). */

export const AURA_PREFIX = 'aura:'

export type EmbedToHost =
  | { type: 'aura:ready'; appId: string }
  | { type: 'aura:resize'; height: number }
  | { type: 'aura:generated'; jobId: string; images: string[]; prompt: string }
  | { type: 'aura:token-expired' }
  | { type: 'aura:error'; message: string }

export type HostToEmbed =
  | { type: 'aura:ticket'; ticket: string }
  | { type: 'aura:config'; imageType?: string }

export function isInMiniprogram(): boolean {
  try {
    return (
      (window as unknown as { __wxjs_environment?: string }).__wxjs_environment ===
        'miniprogram' ||
      /miniProgram/i.test(navigator.userAgent)
    )
  } catch {
    return false
  }
}

export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function postToHost(message: EmbedToHost): void {
  if (!isInIframe()) return
  try {
    window.parent.postMessage(message, '*')
  } catch {
    // ignore
  }
}

export function listenFromHost(
  handler: (msg: HostToEmbed) => void,
): () => void {
  const onMessage = (event: MessageEvent) => {
    const data = event.data as HostToEmbed | null
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return
    if (!data.type.startsWith(AURA_PREFIX)) return
    handler(data)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
