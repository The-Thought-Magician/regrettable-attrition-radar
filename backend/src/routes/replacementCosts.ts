import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  replacement_cost_models,
  replacement_costs,
  employees,
  roles,
  departments,
  risk_scores,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function log(userId: string, entityId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'replacement_cost',
    entity_id: entityId,
    action,
    detail,
  })
}

// ---------------------------------------------------------------------------
// Cost computation for a single employee against a cost model.
//
//   recruiting_cost      = salary * agency_pct
//   ramp_cost            = (salary / 52) * weeks_to_productivity * 0.5
//                          (half-productive ramp period)
//   productivity_loss    = (salary / 52) * weeks_to_productivity * salary_multiplier_factor
//   onboarding_cost      = model.onboarding_cost
//   knowledge_transfer   = model.knowledge_transfer_cost
//   total                = sum of the above, scaled by salary_multiplier
// ---------------------------------------------------------------------------

function computeForEmployee(
  emp: typeof employees.$inferSelect,
  model: typeof replacement_cost_models.$inferSelect,
) {
  const salary = emp.salary ?? 0
  const weeklySalary = salary / 52

  const recruiting_cost = salary * model.agency_pct
  const ramp_cost = weeklySalary * model.weeks_to_productivity * 0.5
  const productivity_loss = weeklySalary * model.weeks_to_productivity * 0.5
  const onboarding_cost = model.onboarding_cost
  const knowledge_transfer_cost = model.knowledge_transfer_cost

  const base =
    recruiting_cost +
    ramp_cost +
    productivity_loss +
    onboarding_cost +
    knowledge_transfer_cost
  const total_cost = base * model.salary_multiplier

  return {
    recruiting_cost,
    ramp_cost,
    productivity_loss,
    onboarding_cost,
    knowledge_transfer_cost,
    total_cost,
    breakdown: {
      recruiting_cost,
      ramp_cost,
      productivity_loss,
      onboarding_cost,
      knowledge_transfer_cost,
      salary_multiplier: model.salary_multiplier,
    } as Record<string, number>,
  }
}

// Pick the best-matching cost model for a role family, else a generic default.
function pickModel(
  roleFamily: string | null | undefined,
  models: Array<typeof replacement_cost_models.$inferSelect>,
): typeof replacement_cost_models.$inferSelect {
  const exact = models.find((m) => m.role_family === roleFamily)
  if (exact) return exact
  const generic = models.find((m) => m.role_family === 'default' || m.role_family === '*')
  if (generic) return generic
  if (models.length > 0) return models[0]
  // Synthetic fallback model when none are configured.
  return {
    id: 'synthetic',
    user_id: '',
    role_family: 'default',
    salary_multiplier: 1,
    agency_pct: 0.2,
    weeks_to_productivity: 12,
    onboarding_cost: 5000,
    knowledge_transfer_cost: 3000,
    created_at: new Date(),
  }
}

const modelSchema = z.object({
  role_family: z.string().min(1),
  salary_multiplier: z.number().optional().default(1),
  agency_pct: z.number().optional().default(0.2),
  weeks_to_productivity: z.number().int().optional().default(12),
  onboarding_cost: z.number().optional().default(0),
  knowledge_transfer_cost: z.number().optional().default(0),
})

// ---------------------------------------------------------------------------
// GET /models — list cost models (public read, scoped to user when identified)
// ---------------------------------------------------------------------------

router.get('/models', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const rows = await db
    .select()
    .from(replacement_cost_models)
    .where(userId ? eq(replacement_cost_models.user_id, userId) : undefined)
    .orderBy(desc(replacement_cost_models.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /models — create cost model
// ---------------------------------------------------------------------------

router.post('/models', authMiddleware, zValidator('json', modelSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [created] = await db
    .insert(replacement_cost_models)
    .values({ user_id: userId, ...body })
    .returning()

  await log(userId, created.id, 'create', { role_family: body.role_family })

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /models/:id — update cost model
// ---------------------------------------------------------------------------

router.put('/models/:id', authMiddleware, zValidator('json', modelSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db
    .select()
    .from(replacement_cost_models)
    .where(eq(replacement_cost_models.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(replacement_cost_models)
    .set(body)
    .where(eq(replacement_cost_models.id, id))
    .returning()

  await log(userId, id, 'update', { role_family: updated.role_family })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /compute — compute replacement cost for all employees, persist snapshots
// ---------------------------------------------------------------------------

router.post('/compute', authMiddleware, async (c) => {
  const userId = getUserId(c)

  const emps = await db
    .select()
    .from(employees)
    .where(eq(employees.user_id, userId))

  const models = await db
    .select()
    .from(replacement_cost_models)
    .where(eq(replacement_cost_models.user_id, userId))

  // Map role_id -> role_family to choose a cost model per employee.
  const roleRows = await db.select().from(roles).where(eq(roles.user_id, userId))
  const roleFamilyById = new Map(roleRows.map((r) => [r.id, r.role_family]))

  // Clear prior snapshots for a clean recompute.
  await db.delete(replacement_costs).where(eq(replacement_costs.user_id, userId))

  const inserted: Array<typeof replacement_costs.$inferSelect> = []
  for (const emp of emps) {
    const roleFamily = emp.role_id ? roleFamilyById.get(emp.role_id) : undefined
    const model = pickModel(roleFamily, models)
    const cc = computeForEmployee(emp, model)
    const [row] = await db
      .insert(replacement_costs)
      .values({
        user_id: userId,
        employee_id: emp.id,
        total_cost: cc.total_cost,
        recruiting_cost: cc.recruiting_cost,
        ramp_cost: cc.ramp_cost,
        productivity_loss: cc.productivity_loss,
        onboarding_cost: cc.onboarding_cost,
        knowledge_transfer_cost: cc.knowledge_transfer_cost,
        breakdown: cc.breakdown,
      })
      .returning()
    inserted.push(row)
  }

  await log(userId, 'all', 'compute', { computed: inserted.length })

  return c.json({ computed: inserted.length, costs: inserted })
})

// ---------------------------------------------------------------------------
// GET /exposure — aggregate exposure (total, by department, by risk band)
// ---------------------------------------------------------------------------

router.get('/exposure', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')

  const costRows = await db
    .select()
    .from(replacement_costs)
    .where(userId ? eq(replacement_costs.user_id, userId) : undefined)

  if (costRows.length === 0) {
    return c.json({ total: 0, byDepartment: [], byBand: [], rows: [] })
  }

  const empIds = costRows.map((r) => r.employee_id)
  const emps = empIds.length
    ? await db.select().from(employees).where(inArray(employees.id, empIds))
    : []
  // Only active employees count toward exposure, matching dashboard /summary.
  const activeEmpIds = new Set(emps.filter((e) => e.status === 'active').map((e) => e.id))
  const empById = new Map(emps.map((e) => [e.id, e]))

  const deptRows = await db
    .select()
    .from(departments)
    .where(userId ? eq(departments.user_id, userId) : undefined)
  const deptName = new Map(deptRows.map((d) => [d.id, d.name]))

  // Latest risk band per employee.
  const riskRows = empIds.length
    ? await db.select().from(risk_scores).where(inArray(risk_scores.employee_id, empIds)).orderBy(desc(risk_scores.computed_at))
    : []
  const bandByEmployee = new Map<string, string>()
  for (const r of riskRows) {
    if (!bandByEmployee.has(r.employee_id)) bandByEmployee.set(r.employee_id, r.band)
  }

  // Dedupe to the latest cost row per employee, and restrict to active
  // at-risk (high/critical) employees, matching the dashboard /summary
  // "exposure" figure so both surfaces agree on the same number.
  const latestCostByEmployee = new Map<string, typeof costRows[number]>()
  for (const cr of costRows) {
    if (!latestCostByEmployee.has(cr.employee_id)) latestCostByEmployee.set(cr.employee_id, cr)
  }
  const filteredCostRows = [...latestCostByEmployee.values()].filter((cr) => {
    const band = bandByEmployee.get(cr.employee_id)
    const atRisk = band === 'high' || band === 'critical'
    return activeEmpIds.has(cr.employee_id) && atRisk
  })

  let total = 0
  const deptAgg = new Map<string, { departmentId: string | null; name: string; total: number; count: number }>()
  const bandAgg = new Map<string, { band: string; total: number; count: number }>()
  const rows: Array<{
    employee_id: string
    employee_name: string | null
    department: string | null
    band: string
    total_cost: number
  }> = []

  for (const cr of filteredCostRows) {
    total += cr.total_cost
    const emp = empById.get(cr.employee_id)
    const deptId = emp?.department_id ?? null
    const dName = deptId ? deptName.get(deptId) ?? 'Unknown' : 'Unassigned'
    const band = bandByEmployee.get(cr.employee_id) ?? 'unscored'

    const dKey = deptId ?? '__unassigned__'
    const dEntry = deptAgg.get(dKey) ?? { departmentId: deptId, name: dName, total: 0, count: 0 }
    dEntry.total += cr.total_cost
    dEntry.count += 1
    deptAgg.set(dKey, dEntry)

    const bEntry = bandAgg.get(band) ?? { band, total: 0, count: 0 }
    bEntry.total += cr.total_cost
    bEntry.count += 1
    bandAgg.set(band, bEntry)

    rows.push({
      employee_id: cr.employee_id,
      employee_name: emp?.full_name ?? null,
      department: dName,
      band,
      total_cost: cr.total_cost,
    })
  }

  rows.sort((a, b) => b.total_cost - a.total_cost)

  const byDepartment = [...deptAgg.values()].sort((a, b) => b.total - a.total)
  const bandOrder: Record<string, number> = { high: 0, medium: 1, low: 2, unscored: 3 }
  const byBand = [...bandAgg.values()].sort(
    (a, b) => (bandOrder[a.band] ?? 9) - (bandOrder[b.band] ?? 9),
  )

  return c.json({ total, byDepartment, byBand, rows })
})

export default router
