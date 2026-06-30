import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  manager_scorecards,
  employees,
  exits,
  risk_scores,
  replacement_costs,
  activity_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers — compute the latest manager scorecards from raw data.
// ---------------------------------------------------------------------------

interface ComputedCard {
  manager_id: string
  manager_name: string | null
  team_size: number
  regrettable_exits: number
  regrettable_rate: number
  avg_flight_risk: number
  replacement_cost_exposure: number
}

async function computeScorecards(userId: string, period: string): Promise<ComputedCard[]> {
  const allEmployees = await db.select().from(employees).where(eq(employees.user_id, userId))
  const allExits = await db.select().from(exits).where(eq(exits.user_id, userId))
  const allScores = await db.select().from(risk_scores).where(eq(risk_scores.user_id, userId))
  const allCosts = await db.select().from(replacement_costs).where(eq(replacement_costs.user_id, userId))

  // Latest risk score per employee.
  const latestScore = new Map<string, number>()
  const scoreSeen = new Map<string, Date>()
  for (const s of allScores) {
    const at = new Date(s.computed_at as unknown as string).getTime()
    const prev = scoreSeen.get(s.employee_id)
    if (!prev || at > prev.getTime()) {
      scoreSeen.set(s.employee_id, new Date(at))
      latestScore.set(s.employee_id, s.score)
    }
  }

  // Latest replacement cost per employee.
  const latestCost = new Map<string, number>()
  const costSeen = new Map<string, number>()
  for (const rc of allCosts) {
    const at = new Date(rc.computed_at as unknown as string).getTime()
    const prev = costSeen.get(rc.employee_id)
    if (prev === undefined || at > prev) {
      costSeen.set(rc.employee_id, at)
      latestCost.set(rc.employee_id, rc.total_cost)
    }
  }

  // Map employee -> name for manager labelling.
  const empName = new Map<string, string>()
  for (const e of allEmployees) empName.set(e.id, e.full_name)

  // Regrettable exit counts per manager. An exit's manager is the manager of
  // the exiting employee.
  const empManager = new Map<string, string | null>()
  for (const e of allEmployees) empManager.set(e.id, e.manager_id ?? null)

  const regrettableByManager = new Map<string, number>()
  const exitsByManager = new Map<string, number>()
  for (const x of allExits) {
    const mgr = empManager.get(x.employee_id) ?? null
    if (!mgr) continue
    exitsByManager.set(mgr, (exitsByManager.get(mgr) ?? 0) + 1)
    if (x.is_regrettable) regrettableByManager.set(mgr, (regrettableByManager.get(mgr) ?? 0) + 1)
  }

  // Group active employees by manager to build the roster metrics.
  const teamByManager = new Map<string, typeof allEmployees>()
  for (const e of allEmployees) {
    const mgr = e.manager_id
    if (!mgr) continue
    if (!teamByManager.has(mgr)) teamByManager.set(mgr, [])
    teamByManager.get(mgr)!.push(e)
  }

  // Union of all manager ids that have either reports or exits attributed.
  const managerIds = new Set<string>([...teamByManager.keys(), ...exitsByManager.keys()])

  const cards: ComputedCard[] = []
  for (const mgr of managerIds) {
    const team = teamByManager.get(mgr) ?? []
    const teamSize = team.length
    const regrettable = regrettableByManager.get(mgr) ?? 0
    const totalExits = exitsByManager.get(mgr) ?? 0

    // Regrettable rate: regrettable exits over (team headcount + total exits),
    // i.e. share of the manager's population that left regrettably.
    const denom = teamSize + totalExits
    const regrettableRate = denom > 0 ? regrettable / denom : 0

    let riskSum = 0
    let riskCount = 0
    let costSum = 0
    for (const e of team) {
      const sc = latestScore.get(e.id)
      if (sc !== undefined) {
        riskSum += sc
        riskCount += 1
      }
      costSum += latestCost.get(e.id) ?? 0
    }
    const avgFlightRisk = riskCount > 0 ? riskSum / riskCount : 0

    cards.push({
      manager_id: mgr,
      manager_name: empName.get(mgr) ?? null,
      team_size: teamSize,
      regrettable_exits: regrettable,
      regrettable_rate: regrettableRate,
      avg_flight_risk: avgFlightRisk,
      replacement_cost_exposure: costSum,
    })
  }

  return cards
}

// Flag outliers: a manager is an outlier when their regrettable_rate or
// avg_flight_risk exceeds (mean + 1 stddev) across all managers.
function flagOutliers(cards: ComputedCard[]): Array<ComputedCard & { is_outlier: boolean }> {
  if (cards.length === 0) return []
  const rates = cards.map((c) => c.regrettable_rate)
  const risks = cards.map((c) => c.avg_flight_risk)
  const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length
  const meanRisk = risks.reduce((a, b) => a + b, 0) / risks.length
  const sd = (arr: number[], mean: number) =>
    Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length)
  const sdRate = sd(rates, meanRate)
  const sdRisk = sd(risks, meanRisk)
  const rateThreshold = meanRate + sdRate
  const riskThreshold = meanRisk + sdRisk
  return cards.map((c) => ({
    ...c,
    is_outlier:
      (sdRate > 0 && c.regrettable_rate > rateThreshold) ||
      (sdRisk > 0 && c.avg_flight_risk > riskThreshold),
  }))
}

// ---------------------------------------------------------------------------
// GET / — list scorecards (latest per manager, outliers flagged)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])

  const rows = await db
    .select()
    .from(manager_scorecards)
    .where(eq(manager_scorecards.user_id, userId))
    .orderBy(desc(manager_scorecards.computed_at))

  // Keep only the latest row per manager.
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    if (!latest.has(r.manager_id)) latest.set(r.manager_id, r)
  }
  const out = [...latest.values()].sort((a, b) => b.regrettable_rate - a.regrettable_rate)
  return c.json(out)
})

// ---------------------------------------------------------------------------
// POST /compute — recompute manager scorecards, persist
// ---------------------------------------------------------------------------

router.post('/compute', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const period = new Date().toISOString().slice(0, 7) // YYYY-MM

  const computed = await computeScorecards(userId, period)
  const flagged = flagOutliers(computed)

  const now = new Date()
  const inserted = []
  for (const card of flagged) {
    const [row] = await db
      .insert(manager_scorecards)
      .values({
        user_id: userId,
        manager_id: card.manager_id,
        manager_name: card.manager_name,
        team_size: card.team_size,
        regrettable_exits: card.regrettable_exits,
        regrettable_rate: card.regrettable_rate,
        avg_flight_risk: card.avg_flight_risk,
        replacement_cost_exposure: card.replacement_cost_exposure,
        is_outlier: card.is_outlier,
        period,
        computed_at: now,
      })
      .returning()
    inserted.push(row)
  }

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'manager_scorecard',
    entity_id: null,
    action: 'compute',
    detail: { computed: inserted.length, period },
  })

  return c.json({ computed: inserted.length, scorecards: inserted })
})

// ---------------------------------------------------------------------------
// GET /:managerId — manager detail + team roster + per-report risk
// (declared after /compute so "compute" is not captured as a managerId)
// ---------------------------------------------------------------------------

router.get('/:managerId', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const managerId = c.req.param('managerId')

  const cardRows = await db
    .select()
    .from(manager_scorecards)
    .where(and(eq(manager_scorecards.user_id, userId), eq(manager_scorecards.manager_id, managerId)))
    .orderBy(desc(manager_scorecards.computed_at))
  const scorecard = cardRows[0] ?? null

  // Team roster: direct reports.
  const team = await db
    .select()
    .from(employees)
    .where(and(eq(employees.user_id, userId), eq(employees.manager_id, managerId)))

  // Latest risk score per report.
  const allScores = await db.select().from(risk_scores).where(eq(risk_scores.user_id, userId))
  const latestScore = new Map<string, { score: number; band: string; at: number }>()
  for (const s of allScores) {
    const at = new Date(s.computed_at as unknown as string).getTime()
    const prev = latestScore.get(s.employee_id)
    if (!prev || at > prev.at) latestScore.set(s.employee_id, { score: s.score, band: s.band, at })
  }

  const roster = team.map((e) => {
    const sc = latestScore.get(e.id)
    return {
      ...e,
      risk_score: sc?.score ?? null,
      risk_band: sc?.band ?? null,
    }
  })

  return c.json({ scorecard, team: roster })
})

export default router
