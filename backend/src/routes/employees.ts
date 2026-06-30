import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  employees,
  risk_scores,
  replacement_costs,
  intervention_candidates,
  interventions,
  exits,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Date fields on the employees table are stored as timestamps; accept ISO
// strings from the client and coerce to Date on insert/update.
const dateInput = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : v === null ? null : undefined))

const employeeSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  department_id: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
  role_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  hire_date: dateInput,
  role_start_date: dateInput,
  last_raise_date: dateInput,
  last_promotion_date: dateInput,
  salary: z.number().optional().nullable(),
  compa_ratio: z.number().optional().nullable(),
  span_of_control: z.number().int().optional().nullable(),
  performance_rating: z.number().optional().nullable(),
  succession_depth: z.number().int().optional().nullable(),
  unique_skill: z.boolean().optional(),
  status: z.string().optional(),
  hire_cohort: z.string().optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).optional(),
})

// Public: list employees with optional query filters
router.get('/', async (c) => {
  const { department_id, manager_id, level, status, location_id } = c.req.query()
  const conds = []
  if (department_id) conds.push(eq(employees.department_id, department_id))
  if (manager_id) conds.push(eq(employees.manager_id, manager_id))
  if (level) conds.push(eq(employees.level, level))
  if (status) conds.push(eq(employees.status, status))
  if (location_id) conds.push(eq(employees.location_id, location_id))

  const rows =
    conds.length > 0
      ? await db
          .select()
          .from(employees)
          .where(and(...conds))
          .orderBy(desc(employees.created_at))
      : await db.select().from(employees).orderBy(desc(employees.created_at))

  return c.json(rows)
})

// Public: employee detail
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [emp] = await db.select().from(employees).where(eq(employees.id, id))
  if (!emp) return c.json({ error: 'Not found' }, 404)
  return c.json(emp)
})

// Public: full profile bundle
router.get('/:id/profile', async (c) => {
  const id = c.req.param('id')
  const [employee] = await db.select().from(employees).where(eq(employees.id, id))
  if (!employee) return c.json({ error: 'Not found' }, 404)

  // Latest risk score
  const [score] = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.employee_id, id))
    .orderBy(desc(risk_scores.computed_at))
    .limit(1)

  // Latest replacement cost
  const [replacementCost] = await db
    .select()
    .from(replacement_costs)
    .where(eq(replacement_costs.employee_id, id))
    .orderBy(desc(replacement_costs.computed_at))
    .limit(1)

  // Candidate interventions (with intervention catalog details), ranked by ROI
  const candidates = await db
    .select({
      id: intervention_candidates.id,
      employee_id: intervention_candidates.employee_id,
      intervention_id: intervention_candidates.intervention_id,
      cost: intervention_candidates.cost,
      risk_reduction: intervention_candidates.risk_reduction,
      roi: intervention_candidates.roi,
      created_at: intervention_candidates.created_at,
      intervention_name: interventions.name,
      intervention_kind: interventions.kind,
      addresses_driver: interventions.addresses_driver,
    })
    .from(intervention_candidates)
    .leftJoin(interventions, eq(intervention_candidates.intervention_id, interventions.id))
    .where(eq(intervention_candidates.employee_id, id))
    .orderBy(desc(intervention_candidates.roi))

  // Score history (full timeline)
  const history = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.employee_id, id))
    .orderBy(desc(risk_scores.computed_at))

  // Exit record if the employee has departed
  const [exit] = await db
    .select()
    .from(exits)
    .where(eq(exits.employee_id, id))
    .orderBy(desc(exits.created_at))
    .limit(1)

  return c.json({
    employee,
    score: score ?? null,
    replacementCost: replacementCost ?? null,
    candidates,
    history,
    exit: exit ?? null,
  })
})

// Auth-gated: create employee
router.post('/', authMiddleware, zValidator('json', employeeSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(employees)
    .values({ ...body, user_id: userId })
    .returning()
  return c.json(row, 201)
})

// Auth-gated: update employee (ownership)
router.put('/:id', authMiddleware, zValidator('json', employeeSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(employees).where(eq(employees.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(employees)
    .set(body)
    .where(eq(employees.id, id))
    .returning()
  return c.json(updated)
})

// Auth-gated: delete employee (ownership)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(employees).where(eq(employees.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(employees).where(eq(employees.id, id))
  return c.json({ success: true })
})

export default router
