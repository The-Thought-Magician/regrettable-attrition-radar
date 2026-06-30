import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { watchlist, employees, risk_scores, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const addSchema = z.object({
  employee_id: z.string().min(1),
  reason: z.string().optional(),
  owner: z.string().optional(),
  status: z.string().optional(),
  next_review: z.string().optional(),
})

const updateSchema = z.object({
  reason: z.string().optional(),
  owner: z.string().optional(),
  status: z.string().optional(),
  next_review: z.string().nullable().optional(),
})

// Public: list watchlist with employee + latest risk score
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])

  const rows = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.user_id, userId))
    .orderBy(desc(watchlist.created_at))

  const result = []
  for (const w of rows) {
    const [emp] = await db.select().from(employees).where(eq(employees.id, w.employee_id))
    const [score] = await db
      .select()
      .from(risk_scores)
      .where(eq(risk_scores.employee_id, w.employee_id))
      .orderBy(desc(risk_scores.computed_at))
      .limit(1)
    result.push({ ...w, employee: emp ?? null, risk: score ?? null })
  }

  return c.json(result)
})

// Auth: add to watchlist (upsert on user_id + employee_id)
router.post('/', authMiddleware, zValidator('json', addSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Ownership: employee must belong to the user
  const [emp] = await db.select().from(employees).where(eq(employees.id, body.employee_id))
  if (!emp) return c.json({ error: 'Employee not found' }, 404)
  if (emp.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const values = {
    user_id: userId,
    employee_id: body.employee_id,
    reason: body.reason ?? null,
    owner: body.owner ?? null,
    status: body.status ?? 'watching',
    next_review: body.next_review ? new Date(body.next_review) : null,
  }

  const [row] = await db
    .insert(watchlist)
    .values(values)
    .onConflictDoUpdate({
      target: [watchlist.user_id, watchlist.employee_id],
      set: {
        reason: values.reason,
        owner: values.owner,
        status: values.status,
        next_review: values.next_review,
      },
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'watchlist',
    entity_id: row.id,
    action: 'add',
    detail: { employee_id: body.employee_id },
  })

  return c.json(row, 201)
})

// Auth: update reason/owner/status/next_review
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(watchlist).where(eq(watchlist.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const set: Record<string, unknown> = {}
  if (body.reason !== undefined) set.reason = body.reason
  if (body.owner !== undefined) set.owner = body.owner
  if (body.status !== undefined) set.status = body.status
  if (body.next_review !== undefined) {
    set.next_review = body.next_review ? new Date(body.next_review) : null
  }

  const [updated] = await db.update(watchlist).set(set).where(eq(watchlist.id, id)).returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'watchlist',
    entity_id: id,
    action: 'update',
    detail: set as Record<string, unknown>,
  })

  return c.json(updated)
})

// Auth: remove from watchlist
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(watchlist).where(eq(watchlist.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(watchlist).where(eq(watchlist.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'watchlist',
    entity_id: id,
    action: 'remove',
    detail: { employee_id: existing.employee_id },
  })

  return c.json({ success: true })
})

export default router
