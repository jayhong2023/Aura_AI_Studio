import { signAssetUrlsInResult } from './assets'
import { getEmbedApp, signWebhookPayload } from './store'
import type { GenerateResponse } from '../types'

const WEBHOOK_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function dispatchJobWebhook(input: {
  jobId: string
  appId: string
  externalUserId: string
  imageType?: string
  result: GenerateResponse
}): Promise<void> {
  const app = getEmbedApp(input.appId)
  if (!app?.webhookUrl) return

  const images = signAssetUrlsInResult(
    input.result.images,
    WEBHOOK_TTL_MS,
    true,
  ).map((img) => img.url)

  const payload = {
    appId: input.appId,
    externalUserId: input.externalUserId,
    jobId: input.jobId,
    status: 'success' as const,
    prompt: input.result.prompt,
    imageType: input.imageType ?? null,
    model: input.result.model,
    images,
    createdAt: Date.now(),
  }
  const body = JSON.stringify(payload)
  const timestamp = Date.now()
  const signature = signWebhookPayload(input.appId, body, timestamp)
  if (!signature) return

  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(app.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Aura-AppId': input.appId,
          'X-Aura-Timestamp': String(timestamp),
          'X-Aura-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return
      lastError = `HTTP ${res.status}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  console.error('[webhook]', input.jobId, app.webhookUrl, lastError)
}
