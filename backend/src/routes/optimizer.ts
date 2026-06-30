import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  intervention_candidates,
  interventions,
  employees,
  risk_scores,
  replacement_costs,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

type CandidateRow = typeof intervention_candidates.$inferSelect
type InterventionRow = typeof interventions.$inferSelect
type EmployeeRow = typeof employees.$inferSelect
type RiskRow = typeof risk_scores.$inferSelect
type CostRow = typeof replacement_costs.$inferSelect

// ---------------------------------------------------------------------------
// Helpers: latest-snapshot maps
// ---------------------------------------------------------------------------

async function latestRiskByEmployee(userId: string): Promise<Map<string, RiskRow>> {
  const rows = await db
    .select()
    .from(risk_scores)
    .where(eq(risk_scores.user_id, userId))
    .orderBy(desc(risk_scores.computed_at))
  const map = new Map<string, RiskRow>()
  for (const r of rows) if (!map.has(r.employee_id)) map.set(r.employee_id, r)
  return map
}

async function latestCostByEmployee(userId: string): Promise<Map<string, CostRow>> {
  const rows = await db
    .select()
    .from(replacement_costs)
    .where(eq(replacement_costs.user_id, userId))
    .orderBy(desc(replacement_costs.computed_at))
  const map = new Map<string, CostRow>()
  for (const r of rows) if (!map.has(r.employee_id)) map.set(r.employee_id, r)
  return map
}

// Expected avoided cost for an employee for a given risk-reduction fraction.
// flightProb = score/100; baseline expected loss = flightProb * replacementCost;
// applying an intervention that removes `reduction` fraction of risk avoids
// reduction * flightProb * replacementCost.
function expectedAvoidedCost(score: number, replacementCost: number, reduction: number): number {
  const flightProb = Math.max(0, Math.min(1, score / 100))
  return reduction * flightProb * replacementCost
}

interface BuiltCandidate {
  employee_id: string
  intervention_id: string
  cost: number
  risk_reduction: number
  roi: number
  // enrichment (not persisted columns)
  avoidedCost: number
  score: number
  band: string
}

// Build candidate set from current risk + catalog (does not persist).
async function buildCandidates(userId: string): Promise<{
  candidates: BuiltCandidate[]
  emps: EmployeeRow[]
  catalog: InterventionRow[]
  riskMap: Map<string, RiskRow>
  costMap: Map<string, CostRow>
}> {
  const emps = await db.select().from(employees).where(eq(employees.user_id, userId))
  const catalog = await db.select().from(interventions).where(eq(interventions.user_id, userId))
  const riskMap = await latestRiskByEmployee(userId)
  const costMap = await latestCostByEmployee(userId)

  const candidates: BuiltCandidate[] = []
  for (const emp of emps) {
    if (emp.status && emp.status !== 'active') continue
    const risk = riskMap.get(emp.id)
    if (!risk) continue
    const score = risk.score
    // skip negligible-risk employees — nothing to optimize
    if (score <= 0) continue
    const replacementCost = costMap.get(emp.id)?.total_cost ?? (emp.salary ?? 0) * 1.5

    for (const iv of catalog) {
      const reduction = iv.risk_reduction ?? 0
      const cost = iv.cost ?? 0
      if (reduction <= 0) continue
      const avoidedCost = expectedAvoidedCost(score, replacementCost, reduction)
      // ROI: net benefit per dollar. With zero cost, ROI is the raw avoided value.
      const roi = cost > 0 ? (avoidedCost - cost) / cost : avoidedCost
      candidates.push({
        employee_id: emp.id,
        intervention_id: iv.id,
        cost,
        risk_reduction: reduction,
        roi: Math.round(roi * 10000) / 10000,
        avoidedCost: Math.round(avoidedCost * 100) / 100,
        score,
        band: risk.band,
      })
    }
  }

  candidates.sort((a, b) => b.roi - a.roi)
  return { candidates, emps, catalog, riskMap, costMap }
}

// ---------------------------------------------------------------------------
// GET /candidates — persisted candidates ranked by ROI desc
// ---------------------------------------------------------------------------
router.get('/candidates', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(intervention_candidates)
    .where(eq(intervention_candidates.user_id, userId))
    .orderBy(desc(intervention_candidates.roi))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /ranking — marginal-ROI ranking of all persisted candidates.
// Marginal ROI = ROI adjusted so each subsequent intervention on the SAME
// employee is discounted (diminishing returns: risk already partly mitigated).
// ---------------------------------------------------------------------------
router.get('/ranking', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const rows = await db
    .select()
    .from(intervention_candidates)
    .where(eq(intervention_candidates.user_id, userId))
    .orderBy(desc(intervention_candidates.roi))

  // diminishing-returns discount per employee as we descend the ranked list
  const seenPerEmp = new Map<string, number>()
  const ranked = rows.map((r) => {
    const used = seenPerEmp.get(r.employee_id) ?? 0
    const discount = Math.pow(0.6, used) // 1, 0.6, 0.36, ...
    seenPerEmp.set(r.employee_id, used + 1)
    const marginalRoi = Math.round(r.roi * discount * 10000) / 10000
    return { ...r, marginalRoi, marginalRank: 0 }
  })
  ranked.sort((a, b) => b.marginalRoi - a.marginalRoi)
  ranked.forEach((r, i) => { r.marginalRank = i + 1 })
  return c.json(ranked)
})

// ---------------------------------------------------------------------------
// POST /generate — (re)generate candidates from current risk + catalog, persist
// ---------------------------------------------------------------------------
router.post('/generate', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { candidates } = await buildCandidates(userId)

  // replace prior candidate set for this user
  await db.delete(intervention_candidates).where(eq(intervention_candidates.user_id, userId))

  const persisted: CandidateRow[] = []
  for (const cand of candidates) {
    const [row] = await db.insert(intervention_candidates).values({
      user_id: userId,
      employee_id: cand.employee_id,
      intervention_id: cand.intervention_id,
      cost: cand.cost,
      risk_reduction: cand.risk_reduction,
      roi: cand.roi,
    }).returning()
    persisted.push(row)
  }

  return c.json({ generated: persisted.length, candidates: persisted }, 201)
})

// ---------------------------------------------------------------------------
// POST /optimize — budget-constrained greedy selection by ROI.
// One intervention per employee (the best-ROI candidate that still fits budget);
// greedily fills the budget maximizing total avoided cost.
// ---------------------------------------------------------------------------
const optimizeSchema = z.object({
  budget: z.number().nonnegative(),
})

router.post('/optimize', authMiddleware, zValidator('json', optimizeSchema), async (c) => {
  const userId = getUserId(c)
  const { budget } = c.req.valid('json')

  // recompute candidates fresh (with enrichment) so we have avoidedCost
  const { candidates, riskMap, costMap, emps } = await buildCandidates(userId)

  // candidates already sorted by ROI desc; greedily pick, one per employee
  const usedEmployees = new Set<string>()
  const selected: Array<BuiltCandidate & { intervention_name?: string }> = []
  let totalSpend = 0
  let totalRiskReductionValue = 0
  let totalAvoidedCost = 0

  // map intervention names for enrichment
  const catalogRows = await db.select().from(interventions).where(eq(interventions.user_id, userId))
  const ivName = new Map(catalogRows.map((i) => [i.id, i.name]))

  for (const cand of candidates) {
    if (usedEmployees.has(cand.employee_id)) continue
    if (totalSpend + cand.cost > budget) continue
    usedEmployees.add(cand.employee_id)
    selected.push({ ...cand, intervention_name: ivName.get(cand.intervention_id) })
    totalSpend += cand.cost
    totalRiskReductionValue += cand.risk_reduction
    totalAvoidedCost += cand.avoidedCost
  }

  // projected retained: sum of (flightProb * risk_reduction) over selected,
  // i.e. expected number of regrettable exits prevented.
  let projectedRetained = 0
  for (const s of selected) {
    const flightProb = Math.max(0, Math.min(1, s.score / 100))
    projectedRetained += flightProb * s.risk_reduction
  }

  // projected regrettable rate: baseline expected regrettable exits across the
  // active population minus prevented, over headcount.
  const activeEmps = emps.filter((e) => !e.status || e.status === 'active')
  let baselineExpectedExits = 0
  for (const e of activeEmps) {
    const r = riskMap.get(e.id)
    if (!r) continue
    baselineExpectedExits += Math.max(0, Math.min(1, r.score / 100))
  }
  const headcount = activeEmps.length || 1
  const baselineRate = baselineExpectedExits / headcount
  const projectedRate = Math.max(0, (baselineExpectedExits - projectedRetained) / headcount)

  return c.json({
    budget,
    selected,
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalRiskReduction: Math.round(totalRiskReductionValue * 1000) / 1000,
    projectedRetained: Math.round(projectedRetained * 100) / 100,
    avoidedCost: Math.round(totalAvoidedCost * 100) / 100,
    baselineRegrettableRate: Math.round(baselineRate * 1000) / 1000,
    projectedRegrettableRate: Math.round(projectedRate * 1000) / 1000,
  })
})

export default router
