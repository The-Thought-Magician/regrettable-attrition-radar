import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { regrettability_rules, activity_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function log(userId: string, entityId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'regrettability_rule',
    entity_id: entityId,
    action,
    detail,
  })
}

const criterionSchema = z.object({
  key: z.string().min(1),
  weight: z.number(),
})

const ruleSchema = z.object({
  name: z.string().min(1),
  is_active: z.boolean().optional().default(false),
  threshold: z.number().optional().default(50),
  criteria: z.array(criterionSchema).optional().default([]),
})

// ---------------------------------------------------------------------------
// GET / — list rules (public read, scoped to user when identified)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const rows = await db
    .select()
    .from(regrettability_rules)
    .where(userId ? eq(regrettability_rules.user_id, userId) : undefined)
    .orderBy(desc(regrettability_rules.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — create rule. If created active, deactivate the others.
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', ruleSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (body.is_active) {
    await db
      .update(regrettability_rules)
      .set({ is_active: false })
      .where(eq(regrettability_rules.user_id, userId))
  }

  const [created] = await db
    .insert(regrettability_rules)
    .values({
      user_id: userId,
      name: body.name,
      is_active: body.is_active,
      threshold: body.threshold,
      criteria: body.criteria,
    })
    .returning()

  await log(userId, created.id, 'create', { name: body.name, is_active: body.is_active })

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — update rule
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', ruleSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(regrettability_rules).where(eq(regrettability_rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // If turning this one active, deactivate the rest first.
  if (body.is_active === true) {
    await db
      .update(regrettability_rules)
      .set({ is_active: false })
      .where(eq(regrettability_rules.user_id, userId))
  }

  const [updated] = await db
    .update(regrettability_rules)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
      ...(body.criteria !== undefined ? { criteria: body.criteria } : {}),
    })
    .where(eq(regrettability_rules.id, id))
    .returning()

  await log(userId, id, 'update', { name: updated.name })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /:id/activate — activate a rule (deactivates the rest)
// ---------------------------------------------------------------------------

router.post('/:id/activate', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(regrettability_rules).where(eq(regrettability_rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db
    .update(regrettability_rules)
    .set({ is_active: false })
    .where(eq(regrettability_rules.user_id, userId))

  const [updated] = await db
    .update(regrettability_rules)
    .set({ is_active: true })
    .where(and(eq(regrettability_rules.id, id), eq(regrettability_rules.user_id, userId)))
    .returning()

  await log(userId, id, 'activate', { name: updated.name })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(regrettability_rules).where(eq(regrettability_rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(regrettability_rules).where(eq(regrettability_rules.id, id))
  await log(userId, id, 'delete', {})

  return c.json({ success: true })
})

export default router
