/**
 * Unified fetch for main app (cookie) and embed (Bearer).
 * Embed mode is activated via setEmbedAccessToken().
 */

let embedAccessToken: string | null = null

export function setEmbedAccessToken(token: string | null): void {
  embedAccessToken = token
  if (token) {
    try {
      sessionStorage.setItem('aurastudio_embed_token', token)
    } catch {
      // ignore
    }
  } else {
    try {
      sessionStorage.removeItem('aurastudio_embed_token')
    } catch {
      // ignore
    }
  }
}

export function getEmbedAccessToken(): string | null {
  if (embedAccessToken) return embedAccessToken
  try {
    embedAccessToken = sessionStorage.getItem('aurastudio_embed_token')
  } catch {
    embedAccessToken = null
  }
  return embedAccessToken
}

export function isEmbedMode(): boolean {
  return Boolean(getEmbedAccessToken())
}

export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = getEmbedAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(input, {
    ...init,
    headers,
    credentials: token ? 'omit' : 'include',
  })
  if (res.status === 401 && token) {
    window.dispatchEvent(new Event('aurastudio:embed-token-expired'))
  }
  return res
}
