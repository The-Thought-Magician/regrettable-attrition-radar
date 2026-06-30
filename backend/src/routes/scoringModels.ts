import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { scoring_models, scoring_factors } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

type Band = { min: number; max: number; score: number }

// Default flight-risk factors seeded for any new model. Each factor maps a raw
// employee input to a 0-100 sub-score via banded thresholds; weights are relative.
const DEFAULT_FACTORS: Array<{
  factor_key: string
  label: string
  weight: number
  bands: Band[]
}> = [
  {
    factor_key: 'tenure_in_role_months',
    label: 'Tenure in role (months)',
    weight: 1.5,
    bands: [
      { min: 0, max: 6, score: 30 },
      { min: 6, max: 18, score: 70 },
      { min: 18, max: 36, score: 90 },
      { min: 36, max: 100000, score: 50 },
    ],
  },
  {
    factor_key: 'months_since_raise',
    label: 'Months since last raise',
    weight: 1.5,
    bands: [
      { min: 0, max: 12, score: 20 },
      { min: 12, max: 18, score: 55 },
      { min: 18, max: 24, score: 80 },
      { min: 24, max: 100000, score: 100 },
    ],
  },
  {
    factor_key: 'months_since_promotion',
    label: 'Months since last promotion',
    weight: 1.0,
    bands: [
      { min: 0, max: 18, score: 20 },
      { min: 18, max: 36, score: 50 },
      { min: 36, max: 60, score: 80 },
      { min: 60, max: 100000, score: 100 },
    ],
  },
  {
    factor_key: 'compa_ratio',
    label: 'Compa-ratio',
    weight: 2.0,
    bands: [
      { min: 0, max: 0.85, score: 100 },
      { min: 0.85, max: 0.95, score: 70 },
      { min: 0.95, max: 1.1, score: 30 },
      { min: 1.1, max: 100, score: 10 },
    ],
  },
  {
    factor_key: 'performance_rating',
    label: 'Performance rating',
    weight: 1.5,
    bands: [
      { min: 0, max: 2, score: 20 },
      { min: 2, max: 3.5, score: 40 },
      { min: 3.5, max: 4.5, score: 80 },
      { min: 4.5, max: 5.01, score: 100 },
    ],
  },
  {
    factor_key: 'span_of_control',
    label: 'Span of control',
    weight: 0.5,
    bands: [
      { min: 0, max: 3, score: 20 },
      { min: 3, max: 8, score: 50 },
      { min: 8, max: 100, score: 80 },
    ],
  },
  {
    factor_key: 'succession_depth',
    label: 'Succession depth',
    weight: 1.0,
    bands: [
      { min: 0, max: 1, score: 100 },
      { min: 1, max: 2, score: 60 },
      { min: 2, max: 100, score: 20 },
    ],
  },
  {
    factor_key: 'unique_skill',
    label: 'Unique / hard-to-replace skill',
    weight: 1.5,
    bands: [
      { min: 0, max: 1, score: 20 },
      { min: 1, max: 2, score: 100 },
    ],
  },
]

const DEFAULT_BAND_THRESHOLDS: Record<string, number> = { low: 0, medium: 40, high: 70 }

const factorInputSchema = z.object({
  factor_key: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().nonnegative(),
  bands: z
    .array(z.object({ min: z.number(), max: z.number(), score: z.number() }))
    .optional()
    .default([]),
})

const modelSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  band_thresholds: z.record(z.string(), z.number()).optional(),
})

// Public: list scoring models for the user (active first, then newest)
router.get('/', async (c) => {
  const all = await db.select().from(scoring_models).orderBy(desc(scoring_models.is_active), desc(scoring_models.created_at))
  return c.json(all)
})

// Public: model detail with its factors
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [model] = await db.select().from(scoring_models).where(eq(scoring_models.id, id))
  if (!model) return c.json({ error: 'Not found' }, 404)
  const factors = await db
    .select()
    .from(scoring_factors)
    .where(eq(scoring_factors.model_id, id))
    .orderBy(scoring_factors.created_at)
  return c.json({ model, factors })
})

// Auth: create a model and seed it with the default factor set
router.post('/', authMiddleware, zValidator('json', modelSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [model] = await db
    .insert(scoring_models)
    .values({
      user_id: userId,
      name: body.name,
      description: body.description ?? null,
      version: 1,
      is_active: false,
      band_thresholds: body.band_thresholds ?? DEFAULT_BAND_THRESHOLDS,
    })
    .returning()

  for (const f of DEFAULT_FACTORS) {
    await db.insert(scoring_factors).values({
      user_id: userId,
      model_id: model.id,
      factor_key: f.factor_key,
      label: f.label,
      weight: f.weight,
      bands: f.bands,
    })
  }

  return c.json(model, 201)
})

// Auth: update model metadata, bumping the version
router.put('/:id', authMiddleware, zValidator('json', modelSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(scoring_models).where(eq(scoring_models.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(scoring_models)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.band_thresholds !== undefined ? { band_thresholds: body.band_thresholds } : {}),
      version: existing.version + 1,
    })
    .where(eq(scoring_models.id, id))
    .returning()
  return c.json(updated)
})

// Auth: activate this model (deactivate all others for the user)
router.post('/:id/activate', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(scoring_models).where(eq(scoring_models.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.update(scoring_models).set({ is_active: false }).where(eq(scoring_models.user_id, userId))
  const [activated] = await db
    .update(scoring_models)
    .set({ is_active: true })
    .where(eq(scoring_models.id, id))
    .returning()
  return c.json(activated)
})

// Auth: replace the full factor set for a model
router.put(
  '/:id/factors',
  authMiddleware,
  zValidator('json', z.object({ factors: z.array(factorInputSchema).min(1) })),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [existing] = await db.select().from(scoring_models).where(eq(scoring_models.id, id))
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const { factors } = c.req.valid('json')

    await db.delete(scoring_factors).where(eq(scoring_factors.model_id, id))
    const inserted = []
    for (const f of factors) {
      const [row] = await db
        .insert(scoring_factors)
        .values({
          user_id: userId,
          model_id: id,
          factor_key: f.factor_key,
          label: f.label,
          weight: f.weight,
          bands: f.bands,
        })
        .returning()
      inserted.push(row)
    }
    await db.update(scoring_models).set({ version: existing.version + 1 }).where(eq(scoring_models.id, id))
    return c.json({ factors: inserted })
  },
)

// Auth: delete a model and its factors
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(scoring_models).where(eq(scoring_models.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(scoring_factors).where(eq(scoring_factors.model_id, id))
  await db.delete(scoring_models).where(and(eq(scoring_models.id, id), eq(scoring_models.user_id, userId)))
  return c.json({ success: true })
})

export default router
