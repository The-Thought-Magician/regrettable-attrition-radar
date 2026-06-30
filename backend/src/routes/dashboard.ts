import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  employees,
  exits,
  risk_scores,
  replacement_costs,
  manager_scorecards,
  exit_drivers,
  exit_driver_records,
  scenarios,
  benchmarks,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET /summary — KPI overview (public read; scoped by user_id)
//
// Returns:
//   regrettableRate   — overall regrettable-exit rate (regrettable / total exits)
//   riskByBand        — active-headcount-at-risk counts per latest risk band
//   exposure          — total replacement-cost exposure across at-risk headcount
//   budgetUtil        — retention budget utilization from scenarios vs benchmark
//   topDrivers        — most frequent / regrettable-weighted exit drivers
//   topAtRisk         — highest-scoring active employees
//   managerOutliers   — managers flagged as outliers (latest scorecard)
// ---------------------------------------------------------------------------
router.get('/summary', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id') ?? ''

  // --- Exits + regrettable rate ---
  const allExits = await db.select().from(exits).where(eq(exits.user_id, userId))
  const totalExits = allExits.length
  const regrettableExits = allExits.filter((e) => e.is_regrettable).length
  const regrettableRate = totalExits > 0 ? regrettableExits / totalExits : 0

  // --- Active employees ---
  const activeEmps = await db
    .select()
    .from(employees)
    .where(and(eq(employees.user_id, userId), eq(employees.status, 'active')))
  const empById = new Map(activeEmps.map((e) => [e.id, e]))

  // --- Latest risk score per active employee ---
  const allScores = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.user_id, userId))
    .orderBy(desc(risk_scores.computed_at))
  const latestScoreByEmployee = new Map<string, typeof allScores[number]>()
  for (const s of allScores) {
    if (!latestScoreByEmployee.has(s.employee_id)) latestScoreByEmployee.set(s.employee_id, s)
  }

  // Headcount at risk by band (only active employees).
  const bandOrder = ['critical', 'high', 'medium', 'low']
  const bandCounts = new Map<string, number>()
  for (const [empId, score] of latestScoreByEmployee) {
    if (!empById.has(empId)) continue
    bandCounts.set(score.band, (bandCounts.get(score.band) ?? 0) + 1)
  }
  const knownBands = new Set(bandOrder)
  const riskByBand = [
    ...bandOrder.map((band) => ({ band, count: bandCounts.get(band) ?? 0 })),
    ...[...bandCounts.entries()]
      .filter(([band]) => !knownBands.has(band))
      .map(([band, count]) => ({ band, count })),
  ]

  // --- Replacement-cost exposure (latest cost per active at-risk employee) ---
  const allCosts = await db
    .select()
    .from(replacement_costs)
    .where(eq(replacement_costs.user_id, userId))
    .orderBy(desc(replacement_costs.computed_at))
  const latestCostByEmployee = new Map<string, number>()
  for (const rc of allCosts) {
    if (!latestCostByEmployee.has(rc.employee_id)) latestCostByEmployee.set(rc.employee_id, rc.total_cost)
  }
  let exposure = 0
  for (const [empId, cost] of latestCostByEmployee) {
    const score = latestScoreByEmployee.get(empId)
    const atRisk = score ? score.band === 'high' || score.band === 'critical' : false
    if (empById.has(empId) && atRisk) exposure += cost
  }

  // --- Budget utilization (sum of scenario spend vs retention-budget benchmark) ---
  const allScenarios = await db.select().from(scenarios).where(eq(scenarios.user_id, userId))
  const totalSpend = allScenarios.reduce((acc, s) => acc + (s.total_spend ?? 0), 0)
  const bench = await db
    .select()
    .from(benchmarks)
    .where(and(eq(benchmarks.user_id, userId), eq(benchmarks.key, 'retention_budget')))
  const retentionBudget = bench[0]?.value ?? 0
  const budgetUtil = {
    budget: retentionBudget,
    spent: totalSpend,
    utilization: retentionBudget > 0 ? totalSpend / retentionBudget : 0,
  }

  // --- Top exit drivers (frequency + regrettable-weighted) ---
  const driverRecords = await db
    .select()
    .from(exit_driver_records)
    .where(eq(exit_driver_records.user_id, userId))
  const driverDefs = await db.select().from(exit_drivers).where(eq(exit_drivers.user_id, userId))
  const driverNameById = new Map(driverDefs.map((d) => [d.id, d.name]))
  const exitRegrettableById = new Map(allExits.map((e) => [e.id, e.is_regrettable]))

  const driverAgg = new Map<string, { name: string; count: number; weighted: number }>()
  for (const rec of driverRecords) {
    const name = driverNameById.get(rec.driver_id) ?? 'Unknown'
    const entry = driverAgg.get(rec.driver_id) ?? { name, count: 0, weighted: 0 }
    entry.count += 1
    const regrettable = exitRegrettableById.get(rec.exit_id) ? 2 : 1
    entry.weighted += (rec.severity ?? 1) * regrettable
    driverAgg.set(rec.driver_id, entry)
  }
  const topDrivers = [...driverAgg.entries()]
    .map(([driverId, v]) => ({ driverId, name: v.name, count: v.count, weighted: v.weighted }))
    .sort((a, b) => b.weighted - a.weighted || b.count - a.count)
    .slice(0, 5)

  // --- Top at-risk active employees ---
  const topAtRisk = [...latestScoreByEmployee.entries()]
    .filter(([empId]) => empById.has(empId))
    .map(([empId, score]) => {
      const emp = empById.get(empId)!
      return {
        employee_id: empId,
        full_name: emp.full_name,
        score: Math.round(score.score),
        band: score.band,
        department_id: emp.department_id,
        replacement_cost: latestCostByEmployee.get(empId) ?? null,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  // --- Manager outliers (latest scorecard per manager, outliers only) ---
  const allCards = await db
    .select()
    .from(manager_scorecards)
    .where(eq(manager_scorecards.user_id, userId))
    .orderBy(desc(manager_scorecards.computed_at))
  const latestCardByManager = new Map<string, typeof allCards[number]>()
  for (const card of allCards) {
    if (!latestCardByManager.has(card.manager_id)) latestCardByManager.set(card.manager_id, card)
  }
  const managerOutliers = [...latestCardByManager.values()]
    .filter((card) => card.is_outlier)
    .map((card) => ({
      manager_id: card.manager_id,
      manager_name: card.manager_name,
      team_size: card.team_size,
      regrettable_exits: card.regrettable_exits,
      regrettable_rate: card.regrettable_rate,
      avg_flight_risk: card.avg_flight_risk,
      replacement_cost_exposure: card.replacement_cost_exposure,
    }))
    .sort((a, b) => b.regrettable_rate - a.regrettable_rate)
    .slice(0, 10)

  return c.json({
    regrettableRate,
    regrettableExits,
    totalExits,
    headcount: activeEmps.length,
    riskByBand,
    exposure,
    budgetUtil,
    topDrivers,
    topAtRisk,
    managerOutliers,
  })
})

export default router
