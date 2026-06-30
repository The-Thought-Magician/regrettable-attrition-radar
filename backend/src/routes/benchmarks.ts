import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { benchmarks, activity_log } from '../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Default assumptions / benchmark library seeded per user on first read.
const DEFAULT_BENCHMARKS: Array<{ key: string; label: string; value: number; unit: string }> = [
  { key: 'industry_voluntary_attrition', label: 'Industry voluntary attrition rate', value: 13, unit: '%' },
  { key: 'industry_regrettable_rate', label: 'Industry regrettable attrition rate', value: 7, unit: '%' },
  { key: 'recruiting_cost_pct_salary', label: 'Recruiting cost (% of salary)', value: 20, unit: '%' },
  { key: 'agency_fee_pct', label: 'Agency fee (% of salary)', value: 20, unit: '%' },
  { key: 'weeks_to_productivity', label: 'Weeks to full productivity', value: 12, unit: 'weeks' },
  { key: 'productivity_loss_pct', label: 'Productivity loss during ramp (%)', value: 50, unit: '%' },
  { key: 'onboarding_cost_per_hire', label: 'Onboarding cost per hire', value: 5000, unit: '$' },
  { key: 'knowledge_transfer_cost', label: 'Knowledge transfer cost per exit', value: 7500, unit: '$' },
  { key: 'manager_outlier_threshold', label: 'Manager outlier regrettable-rate threshold', value: 15, unit: '%' },
  { key: 'high_risk_score_threshold', label: 'High flight-risk score threshold', value: 70, unit: 'score' },
  { key: 'critical_risk_score_threshold', label: 'Critical flight-risk score threshold', value: 85, unit: 'score' },
  { key: 'early_attrition_months', label: 'Early-attrition flag window', value: 12, unit: 'months' },
  { key: 'target_regrettable_rate', label: 'Target regrettable attrition rate', value: 5, unit: '%' },
  { key: 'retention_budget_pct_payroll', label: 'Retention budget (% of payroll)', value: 2, unit: '%' },
]

async function seedDefaults(userId: string) {
  const existing = await db.select().from(benchmarks).where(eq(benchmarks.user_id, userId)).limit(1)
  if (existing.length > 0) return
  for (const d of DEFAULT_BENCHMARKS) {
    await db
      .insert(benchmarks)
      .values({
        user_id: userId,
        key: d.key,
        label: d.label,
        value: d.value,
        default_value: d.value,
        unit: d.unit,
      })
      .onConflictDoNothing({ target: [benchmarks.user_id, benchmarks.key] })
  }
}

// Public: list benchmarks (seeds defaults if empty for user)
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])
  await seedDefaults(userId)
  const rows = await db
    .select()
    .from(benchmarks)
    .where(eq(benchmarks.user_id, userId))
    .orderBy(asc(benchmarks.label))
  return c.json(rows)
})

const updateSchema = z.object({
  value: z.number(),
})

// Auth: update a benchmark value
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { value } = c.req.valid('json')

  const [existing] = await db.select().from(benchmarks).where(eq(benchmarks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(benchmarks)
    .set({ value })
    .where(eq(benchmarks.id, id))
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'benchmark',
    entity_id: id,
    action: 'update',
    detail: { key: existing.key, value },
  })

  return c.json(updated)
})

// Auth: reset all benchmarks to default_value
router.post('/reset', authMiddleware, async (c) => {
  const userId = getUserId(c)
  await seedDefaults(userId)

  const rows = await db.select().from(benchmarks).where(eq(benchmarks.user_id, userId))
  for (const b of rows) {
    if (b.value !== b.default_value) {
      await db
        .update(benchmarks)
        .set({ value: b.default_value })
        .where(and(eq(benchmarks.id, b.id), eq(benchmarks.user_id, userId)))
    }
  }

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'benchmark',
    entity_id: null,
    action: 'reset',
    detail: { count: rows.length },
  })

  const updated = await db
    .select()
    .from(benchmarks)
    .where(eq(benchmarks.user_id, userId))
    .orderBy(asc(benchmarks.label))

  return c.json({ benchmarks: updated })
})

export default router
