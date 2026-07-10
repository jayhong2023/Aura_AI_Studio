import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

export type AiProvider = 'demo' | 'fal' | 'vibradraft'

export const serverConfig = {
  port: Number(process.env.PORT || 8787),
  provider: (process.env.AI_PROVIDER || 'demo').toLowerCase() as AiProvider,
  falKey: process.env.FAL_KEY || '',
  /** Prefer HTTPS — HTTP:80 is often closed on this host */
  vibradraftUrl:
    process.env.VIBRADRAFT_MCP_URL || 'https://aigc.chowtaifook.com/mcp',
  vibradraftToken: process.env.VIBRADRAFT_MCP_TOKEN || '',
  // Default image model requested by product: GPT-Image-2
  vibradraftModelId: process.env.VIBRADRAFT_MODEL_ID || 'gpt-image-2.0',
}

export function assertProviderReady() {
  if (serverConfig.provider === 'fal' && !serverConfig.falKey) {
    throw new Error(
      'AI_PROVIDER=fal 但未配置 FAL_KEY。请在 .env.local 中填写密钥。',
    )
  }
  if (serverConfig.provider === 'vibradraft' && !serverConfig.vibradraftToken) {
    throw new Error(
      'AI_PROVIDER=vibradraft 但未配置 VIBRADRAFT_MCP_TOKEN。请在 .env.local 中填写。',
    )
  }
}
