import type { EventEmitter } from 'node:events'
import type { Config } from './config'
import type { DB } from './db'
export type AppEnv = { Variables: { uid: string; mod?: boolean } }
export type GoogleProfile = { sub: string; email: string; name: string }
export type Ctx = { db: DB; config: Config; bus: EventEmitter; verifyGoogle: (credential: string) => Promise<GoogleProfile> }