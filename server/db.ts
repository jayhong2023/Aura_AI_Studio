import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serverConfig } from './config'

mkdirSync(dirname(serverConfig.sqlitePath), { recursive: true })

export const db = new DatabaseSync(serverConfig.sqlitePath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
