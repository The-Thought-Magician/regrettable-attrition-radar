import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { exit_drivers, exit_driver_records, exits, employees, activity_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const driverSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
})

const recordSchema = z.object({
  exit_id: z.string().min(1),
  driver_id: z.string().min(1),
  severity: z.number().int().min(1).max(5).default(1),
  notes: z.string().optional(),
})

// ---------------------------------------------------------------------------
// GET / — driver catalog (current user)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(exit_drivers)
    .where(eq(exit_drivers.user_id, userId))
    .orderBy(desc(exit_drivers.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /records — driver records (with exit + employee join)
// (declared before /:id-style routes; this file has no GET /:id but keep order safe)
// ---------------------------------------------------------------------------

router.get('/records', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])

  const rows = await db
    .select({
      record: exit_driver_records,
      driver_name: exit_drivers.name,
      driver_category: exit_drivers.category,
      exit_date: exits.exit_date,
      exit_is_regrettable: exits.is_regrettable,
      employee_name: employees.full_name,
    })
    .from(exit_driver_records)
    .leftJoin(exit_drivers, eq(exit_driver_records.driver_id, exit_drivers.id))
    .leftJoin(exits, eq(exit_driver_records.exit_id, exits.id))
    .leftJoin(employees, eq(exits.employee_id, employees.id))
    .where(eq(exit_driver_records.user_id, userId))
    .orderBy(desc(exit_driver_records.created_at))

  const out = rows.map((r) => ({
    ...r.record,
    driver_name: r.driver_name,
    driver_category: r.driver_category,
    exit_date: r.exit_date,
    exit_is_regrettable: r.exit_is_regrettable,
    employee_name: r.employee_name,
  }))
  return c.json(out)
})

// ---------------------------------------------------------------------------
// GET /aggregate — frequency + regrettable-weighted ranking + trend
// ---------------------------------------------------------------------------

router.get('/aggregate', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json({ ranking: [], trend: [] })

  const rows = await db
    .select({
      driver_id: exit_driver_records.driver_id,
      driver_name: exit_drivers.name,
      driver_category: exit_drivers.category,
      severity: exit_driver_records.severity,
      is_regrettable: exits.is_regrettable,
      exit_date: exits.exit_date,
    })
    .from(exit_driver_records)
    .leftJoin(exit_drivers, eq(exit_driver_records.driver_id, exit_drivers.id))
    .leftJoin(exits, eq(exit_driver_records.exit_id, exits.id))
    .where(eq(exit_driver_records.user_id, userId))

  // Ranking: per driver — frequency, regrettable count, and a regrettable-weighted
  // score = sum over records of severity * (is_regrettable ? 2 : 1).
  interface Agg {
    driver_id: string
    driver_name: string | null
    driver_category: string | null
    frequency: number
    regrettable_count: number
    weighted_score: number
  }
  const byDriver = new Map<string, Agg>()
  for (const r of rows) {
    let a = byDriver.get(r.driver_id)
    if (!a) {
      a = {
        driver_id: r.driver_id,
        driver_name: r.driver_name,
        driver_category: r.driver_category,
        frequency: 0,
        regrettable_count: 0,
        weighted_score: 0,
      }
      byDriver.set(r.driver_id, a)
    }
    a.frequency += 1
    const regrettable = !!r.is_regrettable
    if (regrettable) a.regrettable_count += 1
    a.weighted_score += (r.severity ?? 1) * (regrettable ? 2 : 1)
  }
  const ranking = [...byDriver.values()].sort((x, y) => y.weighted_score - x.weighted_score)

  // Trend: weighted score per YYYY-MM bucket (by exit_date, falling back skipped).
  const byMonth = new Map<string, { period: string; weighted_score: number; count: number; regrettable_count: number }>()
  for (const r of rows) {
    if (!r.exit_date) continue
    const period = new Date(r.exit_date as unknown as string).toISOString().slice(0, 7)
    let m = byMonth.get(period)
    if (!m) {
      m = { period, weighted_score: 0, count: 0, regrettable_count: 0 }
      byMonth.set(period, m)
    }
    const regrettable = !!r.is_regrettable
    m.weighted_score += (r.severity ?? 1) * (regrettable ? 2 : 1)
    m.count += 1
    if (regrettable) m.regrettable_count += 1
  }
  const trend = [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period))

  return c.json({ ranking, trend })
})

// ---------------------------------------------------------------------------
// POST / — create driver
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', driverSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [driver] = await db
    .insert(exit_drivers)
    .values({
      user_id: userId,
      name: body.name,
      category: body.category ?? null,
      description: body.description ?? null,
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'exit_driver',
    entity_id: driver.id,
    action: 'create',
    detail: { name: driver.name },
  })

  return c.json(driver, 201)
})

// ---------------------------------------------------------------------------
// POST /records — attach driver to an exit
// ---------------------------------------------------------------------------

router.post('/records', authMiddleware, zValidator('json', recordSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Ownership checks on both the exit and the driver.
  const [exitRow] = await db.select().from(exits).where(eq(exits.id, body.exit_id))
  if (!exitRow) return c.json({ error: 'Exit not found' }, 404)
  if (exitRow.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [driverRow] = await db.select().from(exit_drivers).where(eq(exit_drivers.id, body.driver_id))
  if (!driverRow) return c.json({ error: 'Driver not found' }, 404)
  if (driverRow.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [record] = await db
    .insert(exit_driver_records)
    .values({
      user_id: userId,
      exit_id: body.exit_id,
      driver_id: body.driver_id,
      severity: body.severity,
      notes: body.notes ?? null,
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'exit_driver_record',
    entity_id: record.id,
    action: 'create',
    detail: { exit_id: body.exit_id, driver_id: body.driver_id, severity: body.severity },
  })

  return c.json(record, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — update driver
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', driverSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(exit_drivers).where(eq(exit_drivers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(exit_drivers)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    })
    .where(eq(exit_drivers.id, id))
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'exit_driver',
    entity_id: id,
    action: 'update',
    detail: { name: updated.name },
  })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete driver (and its attached records)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(exit_drivers).where(eq(exit_drivers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(exit_driver_records).where(eq(exit_driver_records.driver_id, id))
  await db.delete(exit_drivers).where(eq(exit_drivers.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'exit_driver',
    entity_id: id,
    action: 'delete',
    detail: { name: existing.name },
  })

  return c.json({ success: true })
})

export default router
