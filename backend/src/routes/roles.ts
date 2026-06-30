import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { roles } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const roleSchema = z.object({
  title: z.string().min(1),
  level: z.string().min(1),
  role_family: z.string().min(1),
  band_midpoint: z.number().nonnegative().optional(),
  is_critical: z.boolean().optional().default(false),
})

// Public: list reference roles / levels
router.get('/', async (c) => {
  const all = await db.select().from(roles).orderBy(roles.role_family, roles.level)
  return c.json(all)
})

// Auth: create a role/level reference entry
router.post('/', authMiddleware, zValidator('json', roleSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(roles)
    .values({
      user_id: userId,
      title: body.title,
      level: body.level,
      role_family: body.role_family,
      band_midpoint: body.band_midpoint ?? null,
      is_critical: body.is_critical ?? false,
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update a role
router.put('/:id', authMiddleware, zValidator('json', roleSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(roles).where(eq(roles.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db.update(roles).set(body).where(eq(roles.id, id)).returning()
  return c.json(updated)
})

// Auth: delete a role
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(roles).where(eq(roles.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(roles).where(and(eq(roles.id, id), eq(roles.user_id, userId)))
  return c.json({ success: true })
})

export default router
