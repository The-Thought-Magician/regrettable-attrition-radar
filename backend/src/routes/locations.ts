import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const locationSchema = z.object({
  name: z.string().min(1),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
})

// Public: list all locations
router.get('/', async (c) => {
  const all = await db.select().from(locations).orderBy(desc(locations.created_at))
  return c.json(all)
})

// Auth-gated: create
router.post('/', authMiddleware, zValidator('json', locationSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(locations)
    .values({
      name: body.name,
      region: body.region ?? null,
      country: body.country ?? null,
      user_id: userId,
    })
    .returning()
  return c.json(row, 201)
})

// Auth-gated: update (ownership)
router.put('/:id', authMiddleware, zValidator('json', locationSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(locations).where(eq(locations.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(locations)
    .set(body)
    .where(eq(locations.id, id))
    .returning()
  return c.json(updated)
})

// Auth-gated: delete (ownership)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(locations).where(eq(locations.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(locations).where(eq(locations.id, id))
  return c.json({ success: true })
})

export default router
