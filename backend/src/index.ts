import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import {
  plans,
  departments,
  locations,
  roles,
  employees,
  scoring_models,
  scoring_factors,
  regrettability_rules,
  interventions,
  exit_drivers,
  benchmarks,
} from './db/schema.js'
import { eq } from 'drizzle-orm'

import employeesRoutes from './routes/employees.js'
import departmentsRoutes from './routes/departments.js'
import locationsRoutes from './routes/locations.js'
import rolesRoutes from './routes/roles.js'
import scoringModelsRoutes from './routes/scoringModels.js'
import riskScoresRoutes from './routes/riskScores.js'
import exitsRoutes from './routes/exits.js'
import regrettabilityRulesRoutes from './routes/regrettabilityRules.js'
import replacementCostsRoutes from './routes/replacementCosts.js'
import cohortsRoutes from './routes/cohorts.js'
import interventionsRoutes from './routes/interventions.js'
import optimizerRoutes from './routes/optimizer.js'
import scenariosRoutes from './routes/scenarios.js'
import managerScorecardsRoutes from './routes/managerScorecards.js'
import exitDriversRoutes from './routes/exitDrivers.js'
import watchlistRoutes from './routes/watchlist.js'
import boardPacksRoutes from './routes/boardPacks.js'
import benchmarksRoutes from './routes/benchmarks.js'
import alertsRoutes from './routes/alerts.js'
import importsRoutes from './routes/imports.js'
import dashboardRoutes from './routes/dashboard.js'
import activityRoutes from './routes/activity.js'
import settingsRoutes from './routes/settings.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://regrettable-attrition-radar.vercel.app',
]

app.use('*', cors({
  origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
  credentials: true,
}))

const api = new Hono()
api.route('/employees', employeesRoutes)
api.route('/departments', departmentsRoutes)
api.route('/locations', locationsRoutes)
api.route('/roles', rolesRoutes)
api.route('/scoring-models', scoringModelsRoutes)
api.route('/risk-scores', riskScoresRoutes)
api.route('/exits', exitsRoutes)
api.route('/regrettability-rules', regrettabilityRulesRoutes)
api.route('/replacement-costs', replacementCostsRoutes)
api.route('/cohorts', cohortsRoutes)
api.route('/interventions', interventionsRoutes)
api.route('/optimizer', optimizerRoutes)
api.route('/scenarios', scenariosRoutes)
api.route('/manager-scorecards', managerScorecardsRoutes)
api.route('/exit-drivers', exitDriversRoutes)
api.route('/watchlist', watchlistRoutes)
api.route('/board-packs', boardPacksRoutes)
api.route('/benchmarks', benchmarksRoutes)
api.route('/alerts', alertsRoutes)
api.route('/imports', importsRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/activity', activityRoutes)
api.route('/settings', settingsRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

// ---------------------------------------------------------------------------
// Seed — idempotent (count-then-insert). Seeds billing plans and a small demo
// reference org so the dashboard is non-empty on first boot.
// ---------------------------------------------------------------------------

const DEMO_USER = 'demo'

async function seedIfEmpty() {
  // Billing plans
  const existingPlans = await db.select().from(plans).limit(1)
  if (existingPlans.length === 0) {
    await db.insert(plans).values([
      { id: 'free', name: 'Free', price_cents: 0 },
      { id: 'pro', name: 'Pro', price_cents: 9900 },
    ]).onConflictDoNothing()
    console.log('Seeded plans')
  }

  // Demo reference org (only when the demo user has no departments yet)
  const existingDepts = await db.select().from(departments).where(eq(departments.user_id, DEMO_USER)).limit(1)
  if (existingDepts.length > 0) return

  const [eng, sales, support] = await db.insert(departments).values([
    { user_id: DEMO_USER, name: 'Engineering', code: 'ENG' },
    { user_id: DEMO_USER, name: 'Sales', code: 'SAL' },
    { user_id: DEMO_USER, name: 'Customer Support', code: 'SUP' },
  ]).returning()

  const [sf, nyc, remote] = await db.insert(locations).values([
    { user_id: DEMO_USER, name: 'San Francisco', region: 'West', country: 'US' },
    { user_id: DEMO_USER, name: 'New York', region: 'East', country: 'US' },
    { user_id: DEMO_USER, name: 'Remote', region: 'Global', country: 'US' },
  ]).returning()

  const [swe, ae, csm] = await db.insert(roles).values([
    { user_id: DEMO_USER, title: 'Software Engineer', level: 'IC3', role_family: 'Engineering', band_midpoint: 165000, is_critical: true },
    { user_id: DEMO_USER, title: 'Account Executive', level: 'IC2', role_family: 'Sales', band_midpoint: 120000, is_critical: false },
    { user_id: DEMO_USER, title: 'Customer Success Manager', level: 'IC2', role_family: 'Support', band_midpoint: 95000, is_critical: false },
  ]).returning()

  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86_400_000)

  await db.insert(employees).values([
    {
      user_id: DEMO_USER, full_name: 'Ava Chen', email: 'ava.chen@demo.co',
      department_id: eng.id, location_id: sf.id, role_id: swe.id,
      level: 'IC3', hire_date: daysAgo(820), role_start_date: daysAgo(420),
      last_raise_date: daysAgo(400), last_promotion_date: daysAgo(420),
      salary: 158000, compa_ratio: 0.96, span_of_control: 0, performance_rating: 4.5,
      succession_depth: 0, unique_skill: true, status: 'active', hire_cohort: '2024-Q1',
    },
    {
      user_id: DEMO_USER, full_name: 'Marcus Hill', email: 'marcus.hill@demo.co',
      department_id: sales.id, location_id: nyc.id, role_id: ae.id, manager_id: 'mgr-1',
      level: 'IC2', hire_date: daysAgo(540), role_start_date: daysAgo(540),
      last_raise_date: daysAgo(520), salary: 110000, compa_ratio: 0.92, span_of_control: 0,
      performance_rating: 3.8, succession_depth: 2, unique_skill: false, status: 'active', hire_cohort: '2024-Q3',
    },
    {
      user_id: DEMO_USER, full_name: 'Priya Nair', email: 'priya.nair@demo.co',
      department_id: support.id, location_id: remote.id, role_id: csm.id, manager_id: 'mgr-1',
      level: 'IC2', hire_date: daysAgo(300), role_start_date: daysAgo(300),
      last_raise_date: daysAgo(300), salary: 88000, compa_ratio: 0.93, span_of_control: 0,
      performance_rating: 4.1, succession_depth: 1, unique_skill: false, status: 'active', hire_cohort: '2025-Q2',
    },
  ])

  const [model] = await db.insert(scoring_models).values({
    user_id: DEMO_USER, name: 'Default Flight-Risk Model', description: 'Baseline weighted-factor model',
    version: 1, is_active: true,
    band_thresholds: { low: 33, medium: 66, high: 100 },
  }).returning()

  await db.insert(scoring_factors).values([
    { user_id: DEMO_USER, model_id: model.id, factor_key: 'tenure_in_role', label: 'Tenure in Role', weight: 1.0, bands: [{ min: 0, max: 12, score: 80 }, { min: 12, max: 36, score: 40 }, { min: 36, max: 999, score: 20 }] },
    { user_id: DEMO_USER, model_id: model.id, factor_key: 'compa_ratio', label: 'Compa Ratio', weight: 1.5, bands: [{ min: 0, max: 0.9, score: 90 }, { min: 0.9, max: 1.0, score: 50 }, { min: 1.0, max: 2, score: 20 }] },
    { user_id: DEMO_USER, model_id: model.id, factor_key: 'time_since_promotion', label: 'Time Since Promotion', weight: 1.2, bands: [{ min: 0, max: 18, score: 30 }, { min: 18, max: 36, score: 60 }, { min: 36, max: 999, score: 85 }] },
    { user_id: DEMO_USER, model_id: model.id, factor_key: 'performance_rating', label: 'Performance Rating', weight: 1.0, bands: [{ min: 0, max: 3, score: 30 }, { min: 3, max: 4, score: 50 }, { min: 4, max: 5, score: 75 }] },
  ]).onConflictDoNothing()

  await db.insert(regrettability_rules).values({
    user_id: DEMO_USER, name: 'Default Regrettability Rule', is_active: true, threshold: 50,
    criteria: [
      { key: 'high_performer', weight: 30 },
      { key: 'critical_role', weight: 25 },
      { key: 'unique_skill', weight: 25 },
      { key: 'low_succession_depth', weight: 20 },
    ],
  })

  await db.insert(interventions).values([
    { user_id: DEMO_USER, name: 'Off-cycle Raise', kind: 'compensation', description: 'Targeted comp adjustment to fix compa-ratio gap', cost: 12000, risk_reduction: 25, addresses_driver: 'compensation' },
    { user_id: DEMO_USER, name: 'Promotion', kind: 'career', description: 'Advance level / scope', cost: 20000, risk_reduction: 35, addresses_driver: 'career_growth' },
    { user_id: DEMO_USER, name: 'Retention Bonus', kind: 'compensation', description: 'One-time retention bonus', cost: 15000, risk_reduction: 20, addresses_driver: 'compensation' },
    { user_id: DEMO_USER, name: 'Manager Coaching', kind: 'management', description: 'Coaching for the reporting manager', cost: 3000, risk_reduction: 15, addresses_driver: 'management' },
  ])

  await db.insert(exit_drivers).values([
    { user_id: DEMO_USER, name: 'Compensation', category: 'economic', description: 'Below-market pay or pay compression' },
    { user_id: DEMO_USER, name: 'Career Growth', category: 'development', description: 'Lack of advancement or scope' },
    { user_id: DEMO_USER, name: 'Manager Relationship', category: 'management', description: 'Poor manager fit or trust' },
    { user_id: DEMO_USER, name: 'Burnout', category: 'wellbeing', description: 'Sustained overload' },
  ])

  await db.insert(benchmarks).values([
    { user_id: DEMO_USER, key: 'industry_attrition_rate', label: 'Industry Attrition Rate', value: 13, default_value: 13, unit: '%' },
    { user_id: DEMO_USER, key: 'regrettable_share', label: 'Regrettable Share of Exits', value: 60, default_value: 60, unit: '%' },
    { user_id: DEMO_USER, key: 'avg_replacement_multiplier', label: 'Avg Replacement Cost Multiplier', value: 1.5, default_value: 1.5, unit: 'x salary' },
  ]).onConflictDoNothing()

  console.log('Seeded demo org')
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL boot order: bind the port FIRST so the platform health check
// detects a live service immediately. Run migrate()/seed AFTER serve(),
// each in its own try/catch (both idempotent).
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

try {
  await migrate()
} catch (e) {
  console.error('Migrate error:', e)
}

try {
  await seedIfEmpty()
} catch (e) {
  console.error('Seed error:', e)
}

export default app
