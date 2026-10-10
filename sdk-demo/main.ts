import AuraStudio from '../sdk/aura-embed'

const logEl = document.getElementById('log')!
const log = (m: string) => {
  logEl.textContent = `${new Date().toLocaleTimeString()}  ${m}\n${logEl.textContent}`
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getTicket(): Promise<string> {
  const appId = (document.getElementById('appId') as HTMLInputElement).value.trim()
  const secret = (document.getElementById('secret') as HTMLInputElement).value.trim()
  const externalUserId = (
    document.getElementById('externalUserId') as HTMLInputElement
  ).value.trim()
  const base = (
    (document.getElementById('baseUrl') as HTMLInputElement).value.trim() ||
    location.origin
  ).replace(/\/$/, '')
  const body = JSON.stringify({ externalUserId })
  const timestamp = String(Date.now())
  const signature = await hmacHex(secret, `${timestamp}\n${body}`)
  const res = await fetch(`${base}/api/embed/v1/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Aura-AppId': appId,
      'X-Aura-Timestamp': timestamp,
      'X-Aura-Signature': signature,
    },
    body,
  })
  const data = (await res.json()) as { ok: boolean; ticket?: string; error?: string }
  if (!res.ok || !data.ok || !data.ticket) {
    throw new Error(data.error || '换票失败')
  }
  return data.ticket
}

let handle: ReturnType<typeof AuraStudio.mount> | undefined
document.getElementById('start')!.addEventListener('click', () => {
  handle?.destroy()
  const appId = (document.getElementById('appId') as HTMLInputElement).value.trim()
  const baseUrl =
    (document.getElementById('baseUrl') as HTMLInputElement).value.trim() ||
    location.origin
  handle = AuraStudio.mount('#mount', {
    appId,
    baseUrl,
    getTicket,
    onReady: () => log('ready'),
    onGenerated: (p) => log(`generated ${p.images.length} 张`),
    onError: (e) => log(`error: ${e.message}`),
    onTokenExpired: () => log('token expired, refreshing…'),
  })
  log('mounted')
})
