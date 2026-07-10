import type { GenerateImageResult, GenerateRequestBody } from './types'

const DEMO_IMAGES = [
  'https://images.unsplash.com/photo-1605100804763-247f995f9795?w=800&q=80',
  'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80',
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80',
  'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80',
  'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80',
  'https://images.unsplash.com/photo-1573408301185-91496af45bc0?w=800&q=80',
  'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=800&q=80',
  'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=800&q=80',
]

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Server-side demo: no third-party key required */
export async function generateWithDemo(
  body: GenerateRequestBody,
): Promise<GenerateImageResult[]> {
  await sleep(800 + Math.random() * 600)

  const count = Math.min(4, Math.max(1, body.count || 1))
  const seed = body.prompt.length + (body.references?.length ?? 0) * 7
  const images: GenerateImageResult[] = []

  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 3) % DEMO_IMAGES.length
    images.push({
      url: DEMO_IMAGES[idx],
      width: 800,
      height: 800,
      model: 'demo/placeholder',
    })
  }

  return images
}
