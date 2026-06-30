import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  alerts,
  employees,
  risk_scores,
  regrettability_rules,
  watchlist,
  replacement_costs,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET / — list current user alerts (public read; scoped by user_id)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id') ?? ''
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.user_id, userId))
    .orderBy(desc(alerts.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /evaluate — run alert rules against current data, create alerts
//
// Rule-based engine:
//  1. Active regrettability rules → for each high-risk employee whose latest
//     risk_score band is 'high'/'critical', raise a flight-risk alert.
//  2. High replacement-cost exposure employees who are also high risk → raise
//     a cost-exposure alert.
//  3. Watchlist employees whose latest risk band is high/critical and who are
//     due for review → raise a review-due alert.
// Duplicate alerts (same kind + employee_id, still unread) are not recreated.
// ---------------------------------------------------------------------------
router.post('/evaluate', authMiddleware, async (c) => {
  const userId = getUserId(c)

  // Existing unread alerts → de-dupe key set.
  const existing = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.user_id, userId), eq(alerts.is_read, false)))
  const existingKeys = new Set(
    existing.map((a) => `${a.kind}:${a.employee_id ?? ''}`),
  )

  // Latest risk score per employee.
  const allScores = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.user_id, userId))
    .orderBy(desc(risk_scores.computed_at))
  const latestByEmployee = new Map<string, typeof allScores[number]>()
  for (const s of allScores) {
    if (!latestByEmployee.has(s.employee_id)) latestByEmployee.set(s.employee_id, s)
  }

  const emps = await db
    .select()
    .from(employees)
    .where(and(eq(employees.user_id, userId), eq(employees.status, 'active')))
  const empById = new Map(emps.map((e) => [e.id, e]))

  const activeRules = await db
    .select()
    .from(regrettability_rules)
    .where(and(eq(regrettability_rules.user_id, userId), eq(regrettability_rules.is_active, true)))
  const ruleThreshold = activeRules.length > 0
    ? Math.min(...activeRules.map((r) => r.threshold))
    : 50

  // Latest replacement cost per employee.
  const allCosts = await db
    .select()
    .from(replacement_costs)
    .where(eq(replacement_costs.user_id, userId))
    .orderBy(desc(replacement_costs.computed_at))
  const costByEmployee = new Map<string, number>()
  for (const rc of allCosts) {
    if (!costByEmployee.has(rc.employee_id)) costByEmployee.set(rc.employee_id, rc.total_cost)
  }

  const toCreate: Array<typeof alerts.$inferInsert> = []

  // 1 + 2. Per high-risk employee.
  for (const [employeeId, score] of latestByEmployee) {
    const emp = empById.get(employeeId)
    if (!emp) continue
    const isHigh = score.band === 'high' || score.band === 'critical' || score.score >= ruleThreshold
    if (!isHigh) continue

    const riskKey = `flight_risk:${employeeId}`
    if (!existingKeys.has(riskKey)) {
      existingKeys.add(riskKey)
      toCreate.push({
        user_id: userId,
        kind: 'flight_risk',
        title: `High flight risk: ${emp.full_name}`,
        body: `${emp.full_name} has a flight-risk score of ${Math.round(score.score)} (band: ${score.band}).`,
        employee_id: employeeId,
        is_read: false,
      })
    }

    const cost = costByEmployee.get(employeeId) ?? 0
    if (cost >= 100000) {
      const costKey = `cost_exposure:${employeeId}`
      if (!existingKeys.has(costKey)) {
        existingKeys.add(costKey)
        toCreate.push({
          user_id: userId,
          kind: 'cost_exposure',
          title: `High replacement-cost exposure: ${emp.full_name}`,
          body: `${emp.full_name} is high-risk with an estimated replacement cost of $${Math.round(cost).toLocaleString()}.`,
          employee_id: employeeId,
          is_read: false,
        })
      }
    }
  }

  // 3. Watchlist review-due.
  const watched = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.user_id, userId))
  const now = Date.now()
  for (const w of watched) {
    if (w.status === 'resolved' || w.status === 'closed') continue
    const dueSoon = w.next_review ? new Date(w.next_review).getTime() <= now : false
    const score = latestByEmployee.get(w.employee_id)
    const isHigh = score ? (score.band === 'high' || score.band === 'critical') : false
    if (!dueSoon && !isHigh) continue
    const emp = empById.get(w.employee_id)
    if (!emp) continue
    const reviewKey = `watchlist_review:${w.employee_id}`
    if (existingKeys.has(reviewKey)) continue
    existingKeys.add(reviewKey)
    toCreate.push({
      user_id: userId,
      kind: 'watchlist_review',
      title: `Watchlist review due: ${emp.full_name}`,
      body: dueSoon
        ? `${emp.full_name} on your watchlist is due for review.`
        : `${emp.full_name} on your watchlist has escalated to a high risk band.`,
      employee_id: w.employee_id,
      is_read: false,
    })
  }

  let created: typeof alerts.$inferSelect[] = []
  if (toCreate.length > 0) {
    created = await db.insert(alerts).values(toCreate).returning()
  }

  return c.json({ created: created.length, alerts: created })
})

// ---------------------------------------------------------------------------
// PUT /:id/read — mark an alert read
// ---------------------------------------------------------------------------
router.put('/:id/read', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(alerts).where(eq(alerts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [updated] = await db
    .update(alerts)
    .set({ is_read: true })
    .where(eq(alerts.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — dismiss an alert
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(alerts).where(eq(alerts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(alerts).where(eq(alerts.id, id))
  return c.json({ success: true })
})

export default router
