import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { scenarios, scenario_allocations, employees, interventions, activity_log } from '../db/schema.js'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const allocationSchema = z.object({
  employee_id: z.string().min(1),
  intervention_id: z.string().min(1),
  cost: z.number().nonnegative(),
  risk_reduction: z.number(),
})

const createScenarioSchema = z.object({
  name: z.string().min(1),
  budget: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  projected_regrettable_rate: z.number().optional(),
  projected_retained: z.number().int().optional(),
  projected_avoided_cost: z.number().optional(),
  total_spend: z.number().nonnegative().optional(),
  allocations: z.array(allocationSchema).default([]),
})

// ---------------------------------------------------------------------------
// GET / — list scenarios for the current user
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.user_id, userId))
    .orderBy(desc(scenarios.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /compare — compare scenarios side by side (query: ids=comma,separated)
// (declared before /:id so "compare" is not captured as an id)
// ---------------------------------------------------------------------------

router.get('/compare', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json({ scenarios: [] })
  const idsParam = c.req.query('ids') ?? ''
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return c.json({ scenarios: [] })

  const rows = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.user_id, userId), inArray(scenarios.id, ids)))

  const out = []
  for (const s of rows) {
    const allocations = await db
      .select()
      .from(scenario_allocations)
      .where(eq(scenario_allocations.scenario_id, s.id))
    const totalRiskReduction = allocations.reduce((acc, a) => acc + (a.risk_reduction ?? 0), 0)
    out.push({
      ...s,
      allocationCount: allocations.length,
      totalRiskReduction,
    })
  }
  // Preserve the order requested by the caller
  out.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  return c.json({ scenarios: out })
})

// ---------------------------------------------------------------------------
// GET /:id — scenario + allocations (with employee + intervention labels)
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const id = c.req.param('id')
  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id))
  if (!scenario) return c.json({ error: 'Not found' }, 404)
  if (userId && scenario.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const allocRows = await db
    .select({
      allocation: scenario_allocations,
      employee_name: employees.full_name,
      intervention_name: interventions.name,
      intervention_kind: interventions.kind,
    })
    .from(scenario_allocations)
    .leftJoin(employees, eq(scenario_allocations.employee_id, employees.id))
    .leftJoin(interventions, eq(scenario_allocations.intervention_id, interventions.id))
    .where(eq(scenario_allocations.scenario_id, id))

  const allocations = allocRows.map((r) => ({
    ...r.allocation,
    employee_name: r.employee_name,
    intervention_name: r.intervention_name,
    intervention_kind: r.intervention_kind,
  }))

  return c.json({ scenario, allocations })
})

// ---------------------------------------------------------------------------
// POST / — create scenario from an optimize result (persists allocations)
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', createScenarioSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const totalSpend = body.total_spend ?? body.allocations.reduce((acc, a) => acc + a.cost, 0)

  const [scenario] = await db
    .insert(scenarios)
    .values({
      user_id: userId,
      name: body.name,
      budget: body.budget,
      notes: body.notes ?? null,
      projected_regrettable_rate: body.projected_regrettable_rate ?? null,
      projected_retained: body.projected_retained ?? null,
      projected_avoided_cost: body.projected_avoided_cost ?? null,
      total_spend: totalSpend,
    })
    .returning()

  if (body.allocations.length > 0) {
    await db.insert(scenario_allocations).values(
      body.allocations.map((a) => ({
        user_id: userId,
        scenario_id: scenario.id,
        employee_id: a.employee_id,
        intervention_id: a.intervention_id,
        cost: a.cost,
        risk_reduction: a.risk_reduction,
      })),
    )
  }

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'scenario',
    entity_id: scenario.id,
    action: 'create',
    detail: { name: scenario.name, budget: scenario.budget, allocations: body.allocations.length },
  })

  return c.json(scenario, 201)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete scenario (and its allocations)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(scenarios).where(eq(scenarios.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(scenario_allocations).where(eq(scenario_allocations.scenario_id, id))
  await db.delete(scenarios).where(eq(scenarios.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'scenario',
    entity_id: id,
    action: 'delete',
    detail: { name: existing.name },
  })

  return c.json({ success: true })
})

export default router
