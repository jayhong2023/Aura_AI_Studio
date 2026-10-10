import { Hono } from 'hono'
import { requireAdmin, requireAuth, requirePasswordChanged } from '../auth/middleware'
import { listUsers } from '../auth/store'
import { serverConfig } from '../config'
import {
  historyFacets,
  historyStats,
  queryHistory,
  type JobStatus,
} from '../jobs/store'
import {
  getDiamondBalance,
  listVibradraftModels,
} from '../providers/vibradraft'
import {
  createEmbedApp,
  deleteEmbedApp,
  embedAppUsage,
  listEmbedApps,
  resetEmbedAppSecret,
  updateEmbedApp,
} from '../embed/store'
import {
  getGenerationSettings,
  saveGenerationSettings,
  type ImageResolution,
} from '../settings/store'
import type { AuthVariables } from '../types'

type Env = { Variables: AuthVariables }

const RESOLUTIONS: ImageResolution[] = ['1K', '2K', '4K']

export const adminConsoleRoutes = new Hono<Env>()
adminConsoleRoutes.use('*', requireAuth, requirePasswordChanged, requireAdmin)

adminConsoleRoutes.get('/models', async (c) => {
  const settings = getGenerationSettings()
  if (serverConfig.provider !== 'vibradraft') {
    return c.json({
      ok: true,
      provider: serverConfig.provider,
      models: [],
      balance: null,
      settings,
      notice: `当前服务端提供方为 ${serverConfig.provider}，模型切换仅对 VibraDraft MCP 生效`,
    })
  }
  try {
    const [models, balance] = await Promise.all([
      listVibradraftModels(c.req.query('refresh') === '1'),
      getDiamondBalance(),
    ])
    return c.json({ ok: true, provider: serverConfig.provider, models, balance, settings })
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : '获取模型列表失败' },
      502,
    )
  }
})

adminConsoleRoutes.put('/settings/generation', async (c) => {
  let body: { imageModelId?: string; resolution?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const resolution = body.resolution as ImageResolution
  if (!RESOLUTIONS.includes(resolution)) {
    return c.json({ ok: false, error: '分辨率无效' }, 400)
  }
  let models
  try {
    models = await listVibradraftModels()
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : '获取模型列表失败' },
      502,
    )
  }
  const model = models.find((m) => m.id === body.imageModelId)
  if (!model || model.type !== 'image' || model.status !== 'available') {
    return c.json({ ok: false, error: '模型不存在或不可用' }, 400)
  }
  if (!model.supportedModes.includes('edit')) {
    return c.json(
      { ok: false, error: '该模型不支持参考图生成，无法用于产品图创作' },
      400,
    )
  }
  if (
    model.supportedResolutions.length > 0 &&
    !model.supportedResolutions.includes(resolution)
  ) {
    return c.json({ ok: false, error: `该模型不支持 ${resolution} 分辨率` }, 400)
  }
  const settings = saveGenerationSettings(
    { imageModelId: model.id, imageModelName: model.displayName, resolution },
    c.get('authUser').username,
  )
  return c.json({ ok: true, settings })
})

adminConsoleRoutes.get('/history', (c) => {
  const q = c.req.query()
  const num = (v: string | undefined) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const status = ['running', 'success', 'failed'].includes(q.status ?? '')
    ? (q.status as JobStatus)
    : undefined
  const result = queryHistory({
    userId: q.userId || undefined,
    status,
    model: q.model || undefined,
    imageType: q.imageType || undefined,
    appId: q.appId || undefined,
    keyword: q.keyword?.trim().slice(0, 100) || undefined,
    from: num(q.from),
    to: num(q.to),
    page: Math.max(1, Math.floor(num(q.page) ?? 1)),
    pageSize: Math.min(100, Math.max(5, Math.floor(num(q.pageSize) ?? 20))),
  })
  return c.json({ ok: true, ...result })
})

adminConsoleRoutes.get('/history/facets', (c) => {
  const users = listUsers().map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
  }))
  return c.json({
    ok: true,
    users,
    apps: listEmbedApps().map((a) => ({ id: a.id, name: a.name })),
    ...historyFacets(),
  })
})

adminConsoleRoutes.get('/stats', (c) => {
  return c.json({
    ok: true,
    stats: historyStats(),
    userCount: listUsers().length,
    settings: getGenerationSettings(),
  })
})

adminConsoleRoutes.get('/embed-apps', (c) => {
  const apps = listEmbedApps().map((app) => ({
    ...app,
    usage: embedAppUsage(app.id),
  }))
  return c.json({ ok: true, apps })
})

adminConsoleRoutes.post('/embed-apps', async (c) => {
  let body: {
    name?: string
    allowedOrigins?: string[]
    webhookUrl?: string
    dailyImageQuota?: number
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  const name = body.name?.trim() || ''
  if (!name) return c.json({ ok: false, error: '请填写应用名称' }, 400)
  const origins = Array.isArray(body.allowedOrigins)
    ? body.allowedOrigins.map((o) => o.trim()).filter(Boolean)
    : []
  const { app, secret } = createEmbedApp({
    name,
    allowedOrigins: origins,
    webhookUrl: body.webhookUrl,
    dailyImageQuota: body.dailyImageQuota,
  })
  return c.json({ ok: true, app, secret }, 201)
})

adminConsoleRoutes.patch('/embed-apps/:id', async (c) => {
  const id = c.req.param('id')
  let body: {
    name?: string
    allowedOrigins?: string[]
    webhookUrl?: string | null
    dailyImageQuota?: number
    status?: 'active' | 'disabled'
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体必须是 JSON' }, 400)
  }
  try {
    const app = updateEmbedApp(id, body)
    return c.json({ ok: true, app })
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : '更新失败' },
      400,
    )
  }
})

adminConsoleRoutes.post('/embed-apps/:id/reset-secret', (c) => {
  try {
    const secret = resetEmbedAppSecret(c.req.param('id'))
    return c.json({ ok: true, secret })
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : '重置失败' },
      400,
    )
  }
})

adminConsoleRoutes.delete('/embed-apps/:id', (c) => {
  try {
    deleteEmbedApp(c.req.param('id'))
    return c.json({ ok: true })
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : '删除失败' },
      400,
    )
  }
})
