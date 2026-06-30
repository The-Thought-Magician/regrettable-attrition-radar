import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { org_settings, activity_log } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Ensure a row exists for the user, creating a default one if missing.
async function ensureSettings(userId: string) {
  const [existing] = await db
    .select()
    .from(org_settings)
    .where(eq(org_settings.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(org_settings)
    .values({ user_id: userId })
    .onConflictDoNothing({ target: org_settings.user_id })
    .returning()
  if (created) return created
  // Conflict raced with a concurrent insert — re-read.
  const [row] = await db
    .select()
    .from(org_settings)
    .where(eq(org_settings.user_id, userId))
  return row
}

const updateSchema = z.object({
  industry: z.string().nullable().optional(),
  currency: z.string().min(1).optional(),
  fiscal_quarter_start: z.number().int().min(1).max(12).optional(),
  headcount_band: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

// Public read: get org settings for the current user, creating defaults if none.
router.get('/', async (c) => {
  const userId = getUserId(c)
  const row = await ensureSettings(userId)
  return c.json(row)
})

// Auth-gated: update org settings (upserts default first if missing).
router.put('/', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  await ensureSettings(userId)

  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (body.industry !== undefined) updates.industry = body.industry
  if (body.currency !== undefined) updates.currency = body.currency
  if (body.fiscal_quarter_start !== undefined) updates.fiscal_quarter_start = body.fiscal_quarter_start
  if (body.headcount_band !== undefined) updates.headcount_band = body.headcount_band
  if (body.settings !== undefined) updates.settings = body.settings

  const [updated] = await db
    .update(org_settings)
    .set(updates)
    .where(eq(org_settings.user_id, userId))
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'org_settings',
    entity_id: updated.id,
    action: 'update',
    detail: body as Record<string, unknown>,
  })

  return c.json(updated)
})

export default router
