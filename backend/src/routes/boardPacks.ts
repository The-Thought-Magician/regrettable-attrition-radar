import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  board_packs,
  exits,
  employees,
  risk_scores,
  replacement_costs,
  manager_scorecards,
  exit_drivers,
  exit_driver_records,
  activity_log,
} from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const assembleSchema = z.object({
  title: z.string().min(1).optional(),
  period: z.string().min(1),
})

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

// Public: list board packs
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(board_packs)
    .where(eq(board_packs.user_id, userId))
    .orderBy(desc(board_packs.created_at))
  return c.json(rows)
})

// Public: board pack detail
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [pack] = await db.select().from(board_packs).where(eq(board_packs.id, id))
  if (!pack) return c.json({ error: 'Not found' }, 404)
  return c.json(pack)
})

// Auth: assemble a board pack for a period (computes metrics + deterministic narrative, persists)
router.post('/', authMiddleware, zValidator('json', assembleSchema), async (c) => {
  const userId = getUserId(c)
  const { period } = c.req.valid('json')
  const title = c.req.valid('json').title ?? `Board Pack — ${period}`

  // --- Gather source data (scoped to user) ---
  const allEmployees = await db.select().from(employees).where(eq(employees.user_id, userId))
  const activeHeadcount = allEmployees.filter((e) => e.status === 'active').length

  const allExits = await db.select().from(exits).where(eq(exits.user_id, userId))
  const periodExits = allExits.filter((e) => exitPeriod(e.exit_date) === period)
  const exitsForRate = periodExits.length > 0 ? periodExits : allExits

  const regrettableExits = exitsForRate.filter((e) => e.is_regrettable).length
  const totalExits = exitsForRate.length
  const regrettableRate = totalExits > 0 ? regrettableExits / totalExits : 0

  // Headcount at risk by band (latest score per employee)
  const allScores = await db.select().from(risk_scores).where(eq(risk_scores.user_id, userId))
  const latestByEmp = new Map<string, (typeof allScores)[number]>()
  for (const s of allScores) {
    const cur = latestByEmp.get(s.employee_id)
    if (!cur || new Date(s.computed_at).getTime() > new Date(cur.computed_at).getTime()) {
      latestByEmp.set(s.employee_id, s)
    }
  }
  const bandCounts: Record<string, number> = {}
  for (const s of latestByEmp.values()) {
    bandCounts[s.band] = (bandCounts[s.band] ?? 0) + 1
  }
  const riskByBand = Object.entries(bandCounts)
    .map(([band, count]) => ({ band, count }))
    .sort((a, b) => b.count - a.count)
  const highRiskCount = (bandCounts['high'] ?? 0) + (bandCounts['critical'] ?? 0)

  // Replacement-cost exposure (latest cost per employee)
  const allCosts = await db.select().from(replacement_costs).where(eq(replacement_costs.user_id, userId))
  const latestCostByEmp = new Map<string, (typeof allCosts)[number]>()
  for (const rc of allCosts) {
    const cur = latestCostByEmp.get(rc.employee_id)
    if (!cur || new Date(rc.computed_at).getTime() > new Date(cur.computed_at).getTime()) {
      latestCostByEmp.set(rc.employee_id, rc)
    }
  }
  const totalExposure = [...latestCostByEmp.values()].reduce((s, rc) => s + (rc.total_cost ?? 0), 0)

  // Exposure tied to regrettable exits in the period
  let realizedRegrettableCost = 0
  for (const ex of periodExits) {
    if (!ex.is_regrettable) continue
    const rc = latestCostByEmp.get(ex.employee_id)
    if (rc) realizedRegrettableCost += rc.total_cost ?? 0
  }

  // Manager outliers
  const allScorecards = await db
    .select()
    .from(manager_scorecards)
    .where(eq(manager_scorecards.user_id, userId))
  const latestCardByMgr = new Map<string, (typeof allScorecards)[number]>()
  for (const sc of allScorecards) {
    const cur = latestCardByMgr.get(sc.manager_id)
    if (!cur || new Date(sc.computed_at).getTime() > new Date(cur.computed_at).getTime()) {
      latestCardByMgr.set(sc.manager_id, sc)
    }
  }
  const outliers = [...latestCardByMgr.values()]
    .filter((sc) => sc.is_outlier)
    .map((sc) => ({
      manager_id: sc.manager_id,
      manager_name: sc.manager_name,
      regrettable_rate: sc.regrettable_rate,
      avg_flight_risk: sc.avg_flight_risk,
    }))
    .sort((a, b) => b.regrettable_rate - a.regrettable_rate)

  // Top exit drivers (frequency, regrettable-weighted)
  const drivers = await db.select().from(exit_drivers).where(eq(exit_drivers.user_id, userId))
  const records = await db
    .select()
    .from(exit_driver_records)
    .where(eq(exit_driver_records.user_id, userId))
  const exitById = new Map(allExits.map((e) => [e.id, e]))
  const driverWeight = new Map<string, number>()
  const driverFreq = new Map<string, number>()
  for (const r of records) {
    const ex = exitById.get(r.exit_id)
    const weight = (r.severity ?? 1) * (ex?.is_regrettable ? 2 : 1)
    driverWeight.set(r.driver_id, (driverWeight.get(r.driver_id) ?? 0) + weight)
    driverFreq.set(r.driver_id, (driverFreq.get(r.driver_id) ?? 0) + 1)
  }
  const driverNameById = new Map(drivers.map((d) => [d.id, d.name]))
  const topDrivers = [...driverWeight.entries()]
    .map(([driver_id, weight]) => ({
      driver_id,
      name: driverNameById.get(driver_id) ?? 'Unknown',
      weight,
      frequency: driverFreq.get(driver_id) ?? 0,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)

  const metrics = {
    period,
    activeHeadcount,
    totalExits,
    regrettableExits,
    regrettableRate,
    riskByBand,
    highRiskCount,
    totalExposure,
    realizedRegrettableCost,
    managerOutliers: outliers,
    topDrivers,
  }

  // --- Deterministic narrative ---
  const lines: string[] = []
  lines.push(`Attrition & Retention Risk Review — ${period}`)
  lines.push('')
  lines.push(
    `Across an active headcount of ${activeHeadcount}, the organization recorded ${totalExits} exit${totalExits === 1 ? '' : 's'} this period, of which ${regrettableExits} (${fmtPct(regrettableRate)}) were classified regrettable.`,
  )
  if (highRiskCount > 0) {
    lines.push(
      `${highRiskCount} employee${highRiskCount === 1 ? ' is' : 's are'} currently in high or critical flight-risk bands, representing the most immediate retention exposure.`,
    )
  } else {
    lines.push('No employees currently sit in the high or critical flight-risk bands.')
  }
  lines.push(
    `Modeled replacement-cost exposure across the at-risk population totals ${fmtMoney(totalExposure)}.`,
  )
  if (realizedRegrettableCost > 0) {
    lines.push(
      `Regrettable departures this period carry an estimated ${fmtMoney(realizedRegrettableCost)} in realized replacement cost.`,
    )
  }
  if (topDrivers.length > 0) {
    lines.push('')
    lines.push(
      `Leading exit drivers (regrettable-weighted): ${topDrivers.map((d) => d.name).join(', ')}.`,
    )
  }
  if (outliers.length > 0) {
    lines.push('')
    lines.push(
      `Manager outliers requiring attention: ${outliers
        .map((o) => `${o.manager_name ?? o.manager_id} (${fmtPct(o.regrettable_rate)})`)
        .join(', ')}.`,
    )
  }
  lines.push('')
  lines.push(
    regrettableRate > 0.15
      ? 'Recommendation: regrettable attrition is above a healthy threshold; prioritize funded retention interventions for the high-risk cohort and review manager outliers.'
      : 'Recommendation: regrettable attrition remains within a manageable range; maintain monitoring and targeted interventions for the high-risk cohort.',
  )
  const narrative = lines.join('\n')

  const [pack] = await db
    .insert(board_packs)
    .values({ user_id: userId, title, period, metrics, narrative })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'board_pack',
    entity_id: pack.id,
    action: 'assemble',
    detail: { period },
  })

  return c.json(pack, 201)
})

// Auth: delete board pack
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(board_packs).where(eq(board_packs.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(board_packs).where(eq(board_packs.id, id))

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'board_pack',
    entity_id: id,
    action: 'delete',
    detail: { period: existing.period },
  })

  return c.json({ success: true })
})

// Map an exit_date to a "YYYY-Qn" period bucket.
function exitPeriod(date: Date | null): string | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}

export default router
