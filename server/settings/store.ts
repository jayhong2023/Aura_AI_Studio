import { serverConfig } from '../config'
import { db } from '../db'

export type ImageResolution = '1K' | '2K' | '4K'

export interface GenerationSettings {
  imageModelId: string
  imageModelName: string
  resolution: ImageResolution
  updatedAt?: number
  updatedBy?: string
}

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );
`)

const GENERATION_KEY = 'generation'

function defaults(): GenerationSettings {
  const id = serverConfig.vibradraftModelId || 'gpt-image-2.0'
  return { imageModelId: id, imageModelName: id, resolution: '1K' }
}

/** Read on every generation so admin changes apply without a restart. */
export function getGenerationSettings(): GenerationSettings {
  const row = db
    .prepare(
      'SELECT value_json, updated_at, updated_by FROM app_settings WHERE key = ?',
    )
    .get(GENERATION_KEY) as
    | { value_json: string; updated_at: number; updated_by: string | null }
    | undefined
  if (!row) return defaults()
  try {
    const saved = JSON.parse(row.value_json) as Partial<GenerationSettings>
    return {
      ...defaults(),
      ...saved,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by ?? undefined,
    }
  } catch {
    return defaults()
  }
}

export function saveGenerationSettings(
  settings: Pick<GenerationSettings, 'imageModelId' | 'imageModelName' | 'resolution'>,
  updatedBy: string,
): GenerationSettings {
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(GENERATION_KEY, JSON.stringify(settings), Date.now(), updatedBy)
  return getGenerationSettings()
}
