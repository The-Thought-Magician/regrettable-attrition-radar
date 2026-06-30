import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { cohorts, employees, exits } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const RETENTION_MONTHS = [3, 6, 12, 18, 24]

const cohortSchema = z.object({
  name: z.string().min(1),
  dimension: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
})

type EmployeeRow = typeof employees.$inferSelect
type ExitRow = typeof exits.$inferSelect

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesFilters(emp: EmployeeRow, filters: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(filters ?? {})) {
    if (val === undefined || val === null || val === '') continue
    const field = (emp as Record<string, unknown>)[key]
    if (field === undefined) {
      // also allow matching inside attributes jsonb
      const attrs = (emp.attributes ?? {}) as Record<string, unknown>
      if (String(attrs[key] ?? '') !== String(val)) return false
      continue
    }
    if (String(field) !== String(val)) return false
  }
  return true
}

// Months of tenure for an employee: from hire_date to exit_date (if exited) or now.
function tenureMonths(emp: EmployeeRow, exit?: ExitRow): number | null {
  if (!emp.hire_date) return null
  const start = new Date(emp.hire_date).getTime()
  const end = exit?.exit_date
    ? new Date(exit.exit_date).getTime()
    : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return (end - start) / MONTH_MS
}

interface CurveResult {
  points: Array<{ month: number; surviving: number; survival: number; attrition: number }>
  retention: { m3: number; m6: number; m12: number; m18: number; m24: number }
  earlyFlag: boolean
  cohortSize: number
}

// Build a survival/attrition curve for a set of employees.
// An employee "survives" to month M if they are still active at M, OR exited
// after M. They are counted as a leaver at month M if their exit tenure <= M.
function buildCurve(emps: EmployeeRow[], exitByEmp: Map<string, ExitRow>): CurveResult {
  const cohortSize = emps.length
  const horizon = 24
  const points: CurveResult['points'] = []

  // Pre-compute per-employee: tenure (months) + whether they have exited.
  const records = emps.map((e) => {
    const ex = exitByEmp.get(e.id)
    return { tenure: tenureMonths(e, ex), exited: !!ex }
  }).filter((r) => r.tenure !== null) as Array<{ tenure: number; exited: boolean }>

  const denom = records.length || 1

  for (let m = 0; m <= horizon; m += 3) {
    // Surviving at month m = employees whose observed tenure >= m AND who did
    // not exit before m. Exited-before-m means exited && tenure < m.
    let surviving = 0
    for (const r of records) {
      if (r.exited) {
        if (r.tenure >= m) surviving++
      } else {
        // active employee: counts as surviving if they have reached month m,
        // otherwise they are censored but still "alive".
        surviving++
      }
    }
    const survival = surviving / denom
    points.push({
      month: m,
      surviving,
      survival: Math.round(survival * 1000) / 1000,
      attrition: Math.round((1 - survival) * 1000) / 1000,
    })
  }

  const retentionAt = (m: number): number => {
    const pt = points.find((p) => p.month === m)
    if (pt) return pt.survival
    // interpolate / compute directly for non-multiple-of-3 months
    let surviving = 0
    for (const r of records) {
      if (r.exited) { if (r.tenure >= m) surviving++ } else surviving++
    }
    return Math.round((surviving / denom) * 1000) / 1000
  }

  const retention = {
    m3: retentionAt(3),
    m6: retentionAt(6),
    m12: retentionAt(12),
    m18: retentionAt(18),
    m24: retentionAt(24),
  }

  // Early-attrition flag: meaningful loss inside the first 6 months.
  const earlyFlag = retention.m6 < 0.85

  return { points, retention, earlyFlag, cohortSize }
}

async function loadOwnedEmployeesAndExits(userId: string) {
  const emps = await db.select().from(employees).where(eq(employees.user_id, userId))
  const exitRows = await db.select().from(exits).where(eq(exits.user_id, userId))
  const exitByEmp = new Map<string, ExitRow>()
  for (const ex of exitRows) {
    // keep earliest exit per employee
    const prev = exitByEmp.get(ex.employee_id)
    if (!prev || (ex.exit_date && prev.exit_date && new Date(ex.exit_date) < new Date(prev.exit_date))) {
      exitByEmp.set(ex.employee_id, ex)
    } else if (!prev) {
      exitByEmp.set(ex.employee_id, ex)
    }
  }
  return { emps, exitByEmp }
}

// Resolve the value of a dimension for an employee (for comparison curves).
function dimensionValue(emp: EmployeeRow, dimension: string): string {
  const direct = (emp as Record<string, unknown>)[dimension]
  if (direct !== undefined && direct !== null && direct !== '') return String(direct)
  const attrs = (emp.attributes ?? {}) as Record<string, unknown>
  if (attrs[dimension] !== undefined && attrs[dimension] !== null) return String(attrs[dimension])
  return 'Unknown'
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET / — list saved cohorts (public read, owner-scoped if authed via header)
router.get('/', async (c) => {
  const userId = getUserId(c)
  const rows = userId
    ? await db.select().from(cohorts).where(eq(cohorts.user_id, userId)).orderBy(cohorts.created_at)
    : await db.select().from(cohorts).orderBy(cohorts.created_at)
  return c.json(rows)
})

// GET /curves — comparison curves across a dimension (query: dimension)
// NOTE: declared before /:id/curve so 'curves' is not captured as an :id.
router.get('/curves', async (c) => {
  const dimension = c.req.query('dimension') ?? 'department_id'
  const userId = getUserId(c)
  if (!userId) return c.json({ dimension, series: [] })

  const { emps, exitByEmp } = await loadOwnedEmployeesAndExits(userId)

  // group employees by dimension value
  const groups = new Map<string, EmployeeRow[]>()
  for (const e of emps) {
    const key = dimensionValue(e, dimension)
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }

  const series = [...groups.entries()].map(([value, members]) => {
    const curve = buildCurve(members, exitByEmp)
    return {
      value,
      cohortSize: curve.cohortSize,
      points: curve.points,
      retention: curve.retention,
      earlyFlag: curve.earlyFlag,
    }
  }).sort((a, b) => b.cohortSize - a.cohortSize)

  return c.json({ dimension, series })
})

// GET /:id/curve — attrition/survival curve + retention@N for one cohort
router.get('/:id/curve', async (c) => {
  const id = c.req.param('id')
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, id))
  if (!cohort) return c.json({ error: 'Not found' }, 404)

  const { emps, exitByEmp } = await loadOwnedEmployeesAndExits(cohort.user_id)
  const filters = (cohort.filters ?? {}) as Record<string, unknown>
  const members = emps.filter((e) => matchesFilters(e, filters))

  const curve = buildCurve(members, exitByEmp)
  return c.json({
    cohort,
    points: curve.points,
    retention: curve.retention,
    earlyFlag: curve.earlyFlag,
    cohortSize: curve.cohortSize,
  })
})

// POST / — create cohort
router.post('/', authMiddleware, zValidator('json', cohortSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db.insert(cohorts).values({
    user_id: userId,
    name: body.name,
    dimension: body.dimension,
    filters: body.filters as Record<string, unknown>,
  }).returning()
  return c.json(created, 201)
})

// DELETE /:id — delete cohort
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(cohorts).where(eq(cohorts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(cohorts).where(eq(cohorts.id, id))
  return c.json({ success: true })
})

export default router
