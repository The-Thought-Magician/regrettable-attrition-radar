import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { departments } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const departmentSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
})

// Public: list all departments
router.get('/', async (c) => {
  const all = await db.select().from(departments).orderBy(desc(departments.created_at))
  return c.json(all)
})

// Auth-gated: create
router.post('/', authMiddleware, zValidator('json', departmentSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(departments)
    .values({ name: body.name, code: body.code ?? null, user_id: userId })
    .returning()
  return c.json(row, 201)
})

// Auth-gated: update (ownership)
router.put('/:id', authMiddleware, zValidator('json', departmentSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(departments).where(eq(departments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(departments)
    .set(body)
    .where(eq(departments.id, id))
    .returning()
  return c.json(updated)
})

// Auth-gated: delete (ownership)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(departments).where(eq(departments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(departments).where(eq(departments.id, id))
  return c.json({ success: true })
})

export default router
