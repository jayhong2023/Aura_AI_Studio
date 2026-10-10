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
  sqlitePath:
    process.env.SQLITE_PATH ||
    resolve(process.cwd(), '.storage', 'aurastudio.db'),
  sessionTtlDays: Math.max(
    1,
    Math.min(90, Number(process.env.SESSION_TTL_DAYS || 14)),
  ),
  authCookieSecure: process.env.AUTH_COOKIE_SECURE === 'true',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
  /** HMAC secret for signed asset URLs and embed ticket integrity */
  assetSigningSecret:
    process.env.ASSET_SIGNING_SECRET ||
    process.env.VIBRADRAFT_MCP_TOKEN ||
    'aurastudio-dev-asset-secret-change-me',
  /** Public base URL used in webhook image links (no trailing slash) */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
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
