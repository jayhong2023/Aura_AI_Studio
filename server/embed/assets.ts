import { createHmac, timingSafeEqual } from 'node:crypto'
import { serverConfig } from '../config'

function sign(payload: string): string {
  return createHmac('sha256', serverConfig.assetSigningSecret)
    .update(payload)
    .digest('base64url')
}

/** Build `/api/assets/:file?exp=&sig=` valid for `ttlMs`. */
export function signedAssetPath(filename: string, ttlMs: number): string {
  const exp = Math.floor((Date.now() + ttlMs) / 1000)
  const sig = sign(`${filename}:${exp}`)
  return `/api/assets/${encodeURIComponent(filename)}?exp=${exp}&sig=${sig}`
}

export function signedAssetUrl(
  filename: string,
  ttlMs: number,
  baseUrl?: string,
): string {
  const path = signedAssetPath(filename, ttlMs)
  const base = (baseUrl || serverConfig.publicBaseUrl || '').replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

export function verifyAssetSignature(
  filename: string,
  exp: string | undefined,
  sig: string | undefined,
): boolean {
  if (!exp || !sig) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false
  const expected = sign(`${filename}:${expNum}`)
  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Rewrite `/api/assets/xxx` urls in a job result to signed urls. */
export function signAssetUrlsInResult<T extends { url: string }>(
  images: T[],
  ttlMs: number,
  absolute = false,
): T[] {
  return images.map((img) => {
    const match = /^\/api\/assets\/([^/?#]+)/.exec(img.url)
    if (!match) return img
    const filename = decodeURIComponent(match[1])
    return {
      ...img,
      url: absolute
        ? signedAssetUrl(filename, ttlMs)
        : signedAssetPath(filename, ttlMs),
    }
  })
}
