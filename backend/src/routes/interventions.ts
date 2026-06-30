import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { interventions } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const interventionSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().optional().nullable(),
  cost: z.number().nonnegative().optional().default(0),
  // risk_reduction is a fraction in [0,1] of an employee's risk removed.
  risk_reduction: z.number().min(0).max(1).optional().default(0),
  addresses_driver: z.string().optional().nullable(),
})

// GET / — list intervention catalog (owner-scoped when authed)
router.get('/', async (c) => {
  const userId = getUserId(c)
  const rows = userId
    ? await db.select().from(interventions).where(eq(interventions.user_id, userId)).orderBy(interventions.created_at)
    : await db.select().from(interventions).orderBy(interventions.created_at)
  return c.json(rows)
})

// POST / — create intervention
router.post('/', authMiddleware, zValidator('json', interventionSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db.insert(interventions).values({
    user_id: userId,
    name: body.name,
    kind: body.kind,
    description: body.description ?? null,
    cost: body.cost,
    risk_reduction: body.risk_reduction,
    addresses_driver: body.addresses_driver ?? null,
  }).returning()
  return c.json(created, 201)
})

// PUT /:id — update intervention
router.put('/:id', authMiddleware, zValidator('json', interventionSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(interventions).where(eq(interventions.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db.update(interventions).set(body).where(eq(interventions.id, id)).returning()
  return c.json(updated)
})

// DELETE /:id — delete intervention
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(interventions).where(eq(interventions.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(interventions).where(eq(interventions.id, id))
  return c.json({ success: true })
})

export default router
