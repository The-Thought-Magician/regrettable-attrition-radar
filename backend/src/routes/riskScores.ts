import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { risk_scores, scoring_models, scoring_factors, employees } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

type Band = { min: number; max: number; score: number }
type FactorRow = {
  id: string
  factor_key: string
  label: string
  weight: number
  bands: Band[] | null
}
type Breakdown = { key: string; label: string; contribution: number; raw: number }

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375

function monthsBetween(from: Date | null | undefined, to: Date): number | null {
  if (!from) return null
  const f = from instanceof Date ? from : new Date(from)
  if (Number.isNaN(f.getTime())) return null
  return Math.max(0, (to.getTime() - f.getTime()) / MS_PER_MONTH)
}

// Map a single factor_key to a raw numeric input drawn from an employee record.
// Returns null when the input is not available (the factor is then skipped).
function rawInputFor(factorKey: string, emp: Record<string, any>, now: Date): number | null {
  switch (factorKey) {
    case 'tenure_in_role_months':
      return monthsBetween(emp.role_start_date ?? emp.hire_date, now)
    case 'tenure_months':
      return monthsBetween(emp.hire_date, now)
    case 'months_since_raise':
      return monthsBetween(emp.last_raise_date, now)
    case 'months_since_promotion':
      return monthsBetween(emp.last_promotion_date, now)
    case 'compa_ratio':
      return emp.compa_ratio ?? null
    case 'performance_rating':
      return emp.performance_rating ?? null
    case 'span_of_control':
      return emp.span_of_control ?? null
    case 'succession_depth':
      return emp.succession_depth ?? null
    case 'unique_skill':
      return emp.unique_skill ? 1 : 0
    case 'salary':
      return emp.salary ?? null
    default: {
      // fall back to a same-named numeric attribute (jsonb) if present
      const attrs = emp.attributes ?? {}
      const v = attrs[factorKey]
      return typeof v === 'number' ? v : null
    }
  }
}

// Score a raw input against banded thresholds → 0-100 sub-score.
function bandScore(raw: number, bands: Band[] | null): number {
  if (!bands || bands.length === 0) return Math.max(0, Math.min(100, raw))
  for (const b of bands) {
    if (raw >= b.min && raw < b.max) return b.score
  }
  // inclusive of the last band's upper edge
  const last = bands[bands.length - 1]
  if (raw >= last.max) return last.score
  return bands[0].score
}

function bandFor(score: number, thresholds: Record<string, number>): string {
  const entries = Object.entries(thresholds).sort((a, b) => b[1] - a[1])
  for (const [name, min] of entries) {
    if (score >= min) return name
  }
  return entries.length ? entries[entries.length - 1][0] : 'low'
}

interface ScoreResult {
  score: number
  band: string
  factor_breakdown: Breakdown[]
}

function computeScore(
  emp: Record<string, any>,
  factors: FactorRow[],
  thresholds: Record<string, number>,
  now: Date,
): ScoreResult {
  const breakdown: Breakdown[] = []
  let weightedSum = 0
  let weightTotal = 0

  for (const f of factors) {
    const raw = rawInputFor(f.factor_key, emp, now)
    if (raw === null) continue
    const sub = bandScore(raw, f.bands)
    const weight = f.weight ?? 1
    const contribution = sub * weight
    weightedSum += contribution
    weightTotal += weight
    breakdown.push({ key: f.factor_key, label: f.label, contribution: sub, raw })
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 0
  const rounded = Math.round(score * 100) / 100
  return { score: rounded, band: bandFor(rounded, thresholds), factor_breakdown: breakdown }
}

async function loadActiveModel(userId: string) {
  const [model] = await db
    .select()
    .from(scoring_models)
    .where(and(eq(scoring_models.user_id, userId), eq(scoring_models.is_active, true)))
    .orderBy(desc(scoring_models.created_at))
  if (!model) return null
  const factors = (await db
    .select()
    .from(scoring_factors)
    .where(eq(scoring_factors.model_id, model.id))) as unknown as FactorRow[]
  const thresholds = (model.band_thresholds ?? { low: 0, medium: 40, high: 70 }) as Record<string, number>
  return { model, factors, thresholds }
}

// Public: ranked flight-risk list — latest score per employee, highest risk first
router.get('/', async (c) => {
  const rows = await db.select().from(risk_scores).orderBy(desc(risk_scores.computed_at))
  const latest = new Map<string, typeof rows[number]>()
  for (const r of rows) {
    if (!latest.has(r.employee_id)) latest.set(r.employee_id, r)
  }
  const emps = await db.select().from(employees)
  const empById = new Map(emps.map((e) => [e.id, e]))

  const result = [...latest.values()]
    .map((r) => {
      const emp = empById.get(r.employee_id)
      return {
        ...r,
        employee_name: emp?.full_name ?? null,
        department_id: emp?.department_id ?? null,
        manager_id: emp?.manager_id ?? null,
        level: emp?.level ?? null,
      }
    })
    .sort((a, b) => b.score - a.score)

  return c.json(result)
})

// Public: full score history for one employee (newest first)
router.get('/employee/:employeeId', async (c) => {
  const employeeId = c.req.param('employeeId')
  const history = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.employee_id, employeeId))
    .orderBy(desc(risk_scores.computed_at))
  return c.json(history)
})

// Auth: recompute every employee against the active model and persist snapshots
router.post('/compute', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const active = await loadActiveModel(userId)
  if (!active) return c.json({ error: 'No active scoring model. Create and activate one first.' }, 400)
  if (active.factors.length === 0) return c.json({ error: 'Active model has no factors.' }, 400)

  const emps = await db.select().from(employees).where(eq(employees.user_id, userId))
  const now = new Date()
  const scores = []

  for (const emp of emps) {
    if (emp.status && emp.status !== 'active') continue
    const result = computeScore(emp as Record<string, any>, active.factors, active.thresholds, now)
    const [snap] = await db
      .insert(risk_scores)
      .values({
        user_id: userId,
        employee_id: emp.id,
        model_id: active.model.id,
        score: result.score,
        band: result.band,
        factor_breakdown: result.factor_breakdown,
        computed_at: now,
      })
      .returning()
    scores.push(snap)
  }

  return c.json({ computed: scores.length, scores })
})

// Auth: what-if recompute for a single employee with overridden inputs (no persist)
const whatifSchema = z.object({
  employee_id: z.string().min(1),
  overrides: z.record(z.string(), z.any()).optional().default({}),
  model_id: z.string().optional(),
})

router.post('/whatif', authMiddleware, zValidator('json', whatifSchema), async (c) => {
  const userId = getUserId(c)
  const { employee_id, overrides, model_id } = c.req.valid('json')

  const [emp] = await db.select().from(employees).where(eq(employees.id, employee_id))
  if (!emp) return c.json({ error: 'Employee not found' }, 404)
  if (emp.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  let factors: FactorRow[]
  let thresholds: Record<string, number>
  let usedModelId: string | null = null

  if (model_id) {
    const [model] = await db.select().from(scoring_models).where(eq(scoring_models.id, model_id))
    if (!model) return c.json({ error: 'Model not found' }, 404)
    if (model.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    factors = (await db
      .select()
      .from(scoring_factors)
      .where(eq(scoring_factors.model_id, model.id))) as unknown as FactorRow[]
    thresholds = (model.band_thresholds ?? { low: 0, medium: 40, high: 70 }) as Record<string, number>
    usedModelId = model.id
  } else {
    const active = await loadActiveModel(userId)
    if (!active) return c.json({ error: 'No active scoring model. Create and activate one first.' }, 400)
    factors = active.factors
    thresholds = active.thresholds
    usedModelId = active.model.id
  }
  if (factors.length === 0) return c.json({ error: 'Model has no factors.' }, 400)

  // Merge overrides over the real employee record. Date-like override values are
  // coerced to Date so tenure factors recompute correctly.
  const merged: Record<string, any> = { ...(emp as Record<string, any>) }
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(v)
      merged[k] = Number.isNaN(d.getTime()) ? v : d
    } else {
      merged[k] = v
    }
  }

  const now = new Date()
  const result = computeScore(merged, factors, thresholds, now)
  return c.json({
    employee_id,
    model_id: usedModelId,
    score: result.score,
    band: result.band,
    factor_breakdown: result.factor_breakdown,
  })
})

export default router
