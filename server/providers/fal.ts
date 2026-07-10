import { fal } from '@fal-ai/client'
import { serverConfig } from '../config'
import type { GenerateImageResult, GenerateRequestBody } from '../types'

function ensureFalConfigured() {
  if (!serverConfig.falKey) {
    throw new Error('FAL_KEY 未配置')
  }
  fal.config({ credentials: serverConfig.falKey })
}

type FalImage = { url: string; width?: number; height?: number }

/**
 * Text-to-image via FLUX
 * Docs: https://fal.ai/models/fal-ai/flux/dev
 */
async function textToImage(
  prompt: string,
  count: number,
): Promise<GenerateImageResult[]> {
  ensureFalConfigured()

  const result = await fal.subscribe('fal-ai/flux/dev', {
    input: {
      prompt,
      num_images: count,
      image_size: 'square_hd',
      enable_safety_checker: true,
    },
    logs: false,
  })

  const data = result.data as { images?: FalImage[] }
  const images = data.images ?? []
  if (images.length === 0) {
    throw new Error('fal.ai 未返回图片')
  }

  return images.map((img) => ({
    url: img.url,
    width: img.width,
    height: img.height,
    model: 'fal-ai/flux/dev',
  }))
}

/**
 * Image-to-image via FLUX (first reference as base)
 * Docs: https://fal.ai/models/fal-ai/flux/dev/image-to-image
 */
async function imageToImage(
  prompt: string,
  referenceDataUrl: string,
  count: number,
): Promise<GenerateImageResult[]> {
  ensureFalConfigured()

  const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
    input: {
      prompt,
      image_url: referenceDataUrl,
      num_images: count,
      strength: 0.65,
      image_size: 'square_hd',
      enable_safety_checker: true,
    },
    logs: false,
  })

  const data = result.data as { images?: FalImage[] }
  const images = data.images ?? []
  if (images.length === 0) {
    throw new Error('fal.ai 未返回图片')
  }

  return images.map((img) => ({
    url: img.url,
    width: img.width,
    height: img.height,
    model: 'fal-ai/flux/dev/image-to-image',
  }))
}

export async function generateWithFal(
  body: GenerateRequestBody,
): Promise<GenerateImageResult[]> {
  const count = Math.min(4, Math.max(1, body.count || 1))
  const prompt = body.prompt?.trim()
  if (!prompt) {
    throw new Error('prompt 不能为空')
  }

  if (body.mode === 'reference') {
    const refs = body.references?.filter(Boolean) ?? []
    if (refs.length === 0) {
      throw new Error('参考图模式需要至少一张图片')
    }
    // Use primary reference; extra refs are reflected in prompt on the client
    return imageToImage(prompt, refs[0], count)
  }

  return textToImage(prompt, count)
}
