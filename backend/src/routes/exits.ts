import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  exits,
  employees,
  regrettability_rules,
  risk_scores,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Regrettable classifier
//
// Runs the active regrettability rule set against an employee + exit context.
// Each criterion contributes its `weight` to the score when the underlying
// signal is present. Score >= rule.threshold => regrettable.
// ---------------------------------------------------------------------------

interface ClassifyResult {
  score: number
  isRegrettable: boolean
  reason: string
}

function signalValue(
  key: string,
  emp: typeof employees.$inferSelect,
  latestRisk: typeof risk_scores.$inferSelect | undefined,
  exitType: string,
): boolean {
  switch (key) {
    case 'voluntary':
      return exitType === 'voluntary'
    case 'high_performer':
      return (emp.performance_rating ?? 0) >= 4
    case 'top_performer':
      return (emp.performance_rating ?? 0) >= 4.5
    case 'critical_role':
      return emp.unique_skill === true
    case 'unique_skill':
      return emp.unique_skill === true
    case 'thin_succession':
      return (emp.succession_depth ?? 0) <= 1
    case 'high_flight_risk':
      return latestRisk ? latestRisk.band === 'high' || (latestRisk.score ?? 0) >= 70 : false
    case 'senior':
      return (emp.level ?? '').toLowerCase().includes('senior') ||
        (emp.level ?? '').toLowerCase().includes('staff') ||
        (emp.level ?? '').toLowerCase().includes('principal') ||
        (emp.level ?? '').toLowerCase().includes('director') ||
        (emp.level ?? '').toLowerCase().includes('vp')
    case 'manager':
      return (emp.span_of_control ?? 0) > 0
    case 'high_compa':
      return (emp.compa_ratio ?? 0) >= 1.1
    default:
      return false
  }
}

const DEFAULT_CRITERIA: Array<{ key: string; weight: number }> = [
  { key: 'voluntary', weight: 20 },
  { key: 'high_performer', weight: 25 },
  { key: 'critical_role', weight: 25 },
  { key: 'thin_succession', weight: 15 },
  { key: 'high_flight_risk', weight: 15 },
]

async function classifyExit(
  userId: string,
  emp: typeof employees.$inferSelect,
  exitType: string,
): Promise<ClassifyResult> {
  // Active rule set, or fall back to a sensible default.
  const [rule] = await db
    .select()
    .from(regrettability_rules)
    .where(
      and(
        eq(regrettability_rules.user_id, userId),
        eq(regrettability_rules.is_active, true),
      ),
    )
    .limit(1)

  const threshold = rule?.threshold ?? 50
  const criteria =
    rule && Array.isArray(rule.criteria) && rule.criteria.length > 0
      ? rule.criteria
      : DEFAULT_CRITERIA

  // Latest risk score for this employee (informs flight-risk signals).
  const [latestRisk] = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.employee_id, emp.id))
    .orderBy(desc(risk_scores.computed_at))
    .limit(1)

  let score = 0
  const matched: string[] = []
  for (const cr of criteria) {
    if (signalValue(cr.key, emp, latestRisk, exitType)) {
      score += cr.weight
      matched.push(cr.key)
    }
  }
  // Clamp into 0..100 for a stable, comparable scale.
  score = Math.max(0, Math.min(100, score))

  const isRegrettable = score >= threshold
  const reason = matched.length
    ? `Score ${score.toFixed(0)} vs threshold ${threshold} (${matched.join(', ')})`
    : `Score ${score.toFixed(0)} vs threshold ${threshold} (no matching signals)`

  return { score, isRegrettable, reason }
}

async function log(userId: string, entityId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'exit',
    entity_id: entityId,
    action,
    detail,
  })
}

// ---------------------------------------------------------------------------
// GET / — list exits (with employee join), newest first
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  // Public read; if a user is identified, scope to them, else return all.
  const rows = await db
    .select({
      id: exits.id,
      user_id: exits.user_id,
      employee_id: exits.employee_id,
      exit_type: exits.exit_type,
      exit_date: exits.exit_date,
      is_regrettable: exits.is_regrettable,
      regrettable_score: exits.regrettable_score,
      classification_reason: exits.classification_reason,
      manually_overridden: exits.manually_overridden,
      override_reason: exits.override_reason,
      notes: exits.notes,
      created_at: exits.created_at,
      employee_name: employees.full_name,
      department_id: employees.department_id,
      level: employees.level,
      manager_id: employees.manager_id,
    })
    .from(exits)
    .leftJoin(employees, eq(exits.employee_id, employees.id))
    .where(userId ? eq(exits.user_id, userId) : undefined)
    .orderBy(desc(exits.exit_date))

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /rate — regrettable rate trend (overall + by month period)
// ---------------------------------------------------------------------------

router.get('/rate', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const rows = await db
    .select()
    .from(exits)
    .where(userId ? eq(exits.user_id, userId) : undefined)

  const total = rows.length
  const regrettable = rows.filter((r) => r.is_regrettable).length
  const overall = total > 0 ? regrettable / total : 0

  // Bucket by YYYY-MM of exit_date (fall back to created_at).
  const byPeriodMap = new Map<string, { total: number; regrettable: number }>()
  for (const r of rows) {
    const d = r.exit_date ?? r.created_at
    if (!d) continue
    const period = new Date(d).toISOString().slice(0, 7)
    const b = byPeriodMap.get(period) ?? { total: 0, regrettable: 0 }
    b.total += 1
    if (r.is_regrettable) b.regrettable += 1
    byPeriodMap.set(period, b)
  }

  const byPeriod = [...byPeriodMap.entries()]
    .map(([period, b]) => ({
      period,
      total: b.total,
      regrettable: b.regrettable,
      rate: b.total > 0 ? b.regrettable / b.total : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period))

  return c.json({ overall, total, regrettable, byPeriod })
})

// ---------------------------------------------------------------------------
// POST / — record exit (auto-classify regrettable)
// ---------------------------------------------------------------------------

const exitSchema = z.object({
  employee_id: z.string().min(1),
  exit_type: z.enum(['voluntary', 'involuntary', 'retirement', 'end_of_contract']).optional().default('voluntary'),
  exit_date: z.string().optional(),
  notes: z.string().optional(),
})

router.post('/', authMiddleware, zValidator('json', exitSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [emp] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, body.employee_id))
  if (!emp) return c.json({ error: 'Employee not found' }, 404)
  if (emp.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const cls = await classifyExit(userId, emp, body.exit_type)

  const [created] = await db
    .insert(exits)
    .values({
      user_id: userId,
      employee_id: body.employee_id,
      exit_type: body.exit_type,
      exit_date: body.exit_date ? new Date(body.exit_date) : new Date(),
      is_regrettable: cls.isRegrettable,
      regrettable_score: cls.score,
      classification_reason: cls.reason,
      manually_overridden: false,
      notes: body.notes ?? null,
    })
    .returning()

  // Mark the employee as departed.
  await db.update(employees).set({ status: 'exited' }).where(eq(employees.id, body.employee_id))

  await log(userId, created.id, 'create', {
    employee_id: body.employee_id,
    is_regrettable: cls.isRegrettable,
    regrettable_score: cls.score,
  })

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// POST /:id/classify — re-run classifier on exit
// ---------------------------------------------------------------------------

router.post('/:id/classify', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(exits).where(eq(exits.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [emp] = await db.select().from(employees).where(eq(employees.id, existing.employee_id))
  if (!emp) return c.json({ error: 'Employee not found' }, 404)

  const cls = await classifyExit(userId, emp, existing.exit_type)

  const [updated] = await db
    .update(exits)
    .set({
      is_regrettable: cls.isRegrettable,
      regrettable_score: cls.score,
      classification_reason: cls.reason,
      manually_overridden: false,
      override_reason: null,
    })
    .where(eq(exits.id, id))
    .returning()

  await log(userId, id, 'classify', { is_regrettable: cls.isRegrettable, regrettable_score: cls.score })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// PUT /:id/override — manual reclassify with reason
// ---------------------------------------------------------------------------

const overrideSchema = z.object({
  is_regrettable: z.boolean(),
  override_reason: z.string().min(1),
})

router.put('/:id/override', authMiddleware, zValidator('json', overrideSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(exits).where(eq(exits.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(exits)
    .set({
      is_regrettable: body.is_regrettable,
      manually_overridden: true,
      override_reason: body.override_reason,
      classification_reason: `Manual override: ${body.override_reason}`,
    })
    .where(eq(exits.id, id))
    .returning()

  await log(userId, id, 'override', { is_regrettable: body.is_regrettable, override_reason: body.override_reason })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete exit
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(exits).where(eq(exits.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(exits).where(eq(exits.id, id))
  await log(userId, id, 'delete', {})

  return c.json({ success: true })
})

export default router
