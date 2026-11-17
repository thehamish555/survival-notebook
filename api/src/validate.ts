import type { Context } from 'hono'
import { z } from 'zod'
export const Email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)
export async function readBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null))
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, res: c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400) }
}
