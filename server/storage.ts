import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GenerateImageResult } from './types'

const ASSET_ROOT = resolve(process.cwd(), '.storage', 'generated')

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

function extFromContentType(contentType: string | null): string {
  const raw = (contentType || '').toLowerCase()
  if (raw.includes('image/png')) return '.png'
  if (raw.includes('image/webp')) return '.webp'
  if (raw.includes('image/gif')) return '.gif'
  return '.jpg'
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    if (CONTENT_TYPE_BY_EXT[ext]) return ext
  } catch {
    // ignore parse errors
  }
  return '.jpg'
}

async function persistRemoteImage(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`抓取远程图片失败（HTTP ${res.status}）`)
  }
  const ext = extFromContentType(res.headers.get('content-type')) || extFromUrl(url)
  const filename = `${Date.now()}-${randomUUID()}${ext}`
  await mkdir(ASSET_ROOT, { recursive: true })
  const bytes = Buffer.from(await res.arrayBuffer())
  await writeFile(resolve(ASSET_ROOT, filename), bytes)
  return filename
}

async function persistDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) {
    throw new Error('data URL 格式无效')
  }
  const [, mime, b64] = match
  const ext = extFromContentType(mime)
  const filename = `${Date.now()}-${randomUUID()}${ext}`
  await mkdir(ASSET_ROOT, { recursive: true })
  await writeFile(resolve(ASSET_ROOT, filename), Buffer.from(b64, 'base64'))
  return filename
}

export async function persistGeneratedImage(
  image: GenerateImageResult,
): Promise<GenerateImageResult> {
  try {
    const filename = image.url.startsWith('data:image/')
      ? await persistDataUrl(image.url)
      : await persistRemoteImage(image.url)
    return {
      ...image,
      url: `/api/assets/${filename}`,
    }
  } catch (e) {
    // Fallback to original URL if local persist fails
    console.error(
      '[storage] persist failed:',
      e instanceof Error ? e.message : String(e),
    )
    return image
  }
}

export async function persistGeneratedImages(
  images: GenerateImageResult[],
): Promise<GenerateImageResult[]> {
  const next: GenerateImageResult[] = []
  for (const image of images) {
    next.push(await persistGeneratedImage(image))
  }
  return next
}

export async function readAssetFile(filename: string): Promise<{
  bytes: Buffer
  contentType: string
}> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '')
  if (!safe || safe !== filename) {
    throw new Error('非法文件名')
  }
  const fullPath = resolve(ASSET_ROOT, safe)
  const bytes = await readFile(fullPath)
  const ext = extname(safe).toLowerCase()
  const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream'
  return { bytes, contentType }
}

