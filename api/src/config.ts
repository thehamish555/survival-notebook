import { z } from 'zod'

const Schema = z.object({
  NODE_ENV: z.string().default('development'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  GOOGLE_CLIENT_ID: z.string().optional(),   // the OAuth client ID from Google Cloud (required in production)
  ORIGIN_SECRET: z.string().min(16, 'ORIGIN_SECRET must be at least 16 characters').optional(),   // optional extra: only accept requests that carry this in x-origin-secret
  DB_PATH: z.string().default('./data/notebook.db'),
  PORT: z.coerce.number().int().default(8787),
  CORS_ORIGIN: z.string().optional(),   // allow browsers on this origin to call the API directly (comma-separate for several). Not needed in production: the website proxies /api through Vercel
  BACKUP_DIR: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),    // push notification keys. Optional: without them the server makes its own once and keeps them in the database
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),       // contact for push services, a mailto: or https: address (defaults to the website)    // defaults to <folder of DB_PATH>/backups; a snapshot is taken at start and every 24 h, newest 14 kept
})
export type Config = z.infer<typeof Schema>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const prod = env.NODE_ENV === 'production'
  // Zero-config local dev: sensible defaults outside production
  if (!env.PORT && env.SERVER_PORT) env = { ...env, PORT: env.SERVER_PORT }   // Pelican hands the allocated port over as SERVER_PORT
  const merged = prod ? env : { JWT_SECRET: 'dev-only-secret-do-not-use-in-production', CORS_ORIGIN: 'http://localhost:3000', ...env }
  const parsed = Schema.safeParse(merged)
  if (!parsed.success) throw new Error('Invalid configuration:\n' + parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
  if (prod && !parsed.data.GOOGLE_CLIENT_ID) throw new Error('Invalid configuration:\n  GOOGLE_CLIENT_ID is required in production')
  return parsed.data
}