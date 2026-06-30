import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Reference / org structure
// ---------------------------------------------------------------------------

export const departments = pgTable('departments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const locations = pgTable('locations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  region: text('region'),
  country: text('country'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const roles = pgTable('roles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  title: text('title').notNull(),
  level: text('level').notNull(),
  role_family: text('role_family').notNull(),
  band_midpoint: real('band_midpoint'),
  is_critical: boolean('is_critical').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export const employees = pgTable('employees', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  full_name: text('full_name').notNull(),
  email: text('email'),
  department_id: text('department_id').references(() => departments.id),
  location_id: text('location_id').references(() => locations.id),
  role_id: text('role_id').references(() => roles.id),
  manager_id: text('manager_id'),
  level: text('level'),
  hire_date: timestamp('hire_date'),
  role_start_date: timestamp('role_start_date'),
  last_raise_date: timestamp('last_raise_date'),
  last_promotion_date: timestamp('last_promotion_date'),
  salary: real('salary'),
  compa_ratio: real('compa_ratio'),
  span_of_control: integer('span_of_control').default(0),
  performance_rating: real('performance_rating'),
  succession_depth: integer('succession_depth').default(0),
  unique_skill: boolean('unique_skill').default(false).notNull(),
  status: text('status').default('active').notNull(),
  hire_cohort: text('hire_cohort'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Scoring models & factors
// ---------------------------------------------------------------------------

export const scoring_models = pgTable('scoring_models', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').default(1).notNull(),
  is_active: boolean('is_active').default(false).notNull(),
  band_thresholds: jsonb('band_thresholds').$type<Record<string, number>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const scoring_factors = pgTable('scoring_factors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  model_id: text('model_id').notNull().references(() => scoring_models.id),
  factor_key: text('factor_key').notNull(),
  label: text('label').notNull(),
  weight: real('weight').default(1).notNull(),
  bands: jsonb('bands').$type<Array<{ min: number; max: number; score: number }>>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.model_id, t.factor_key)])

export const risk_scores = pgTable('risk_scores', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  employee_id: text('employee_id').notNull().references(() => employees.id),
  model_id: text('model_id').references(() => scoring_models.id),
  score: real('score').notNull(),
  band: text('band').notNull(),
  factor_breakdown: jsonb('factor_breakdown').$type<Array<{ key: string; label: string; contribution: number; raw: number }>>().default([]),
  computed_at: timestamp('computed_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Exits & regrettability
// ---------------------------------------------------------------------------

export const regrettability_rules = pgTable('regrettability_rules', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  is_active: boolean('is_active').default(false).notNull(),
  threshold: real('threshold').default(50).notNull(),
  criteria: jsonb('criteria').$type<Array<{ key: string; weight: number }>>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const exits = pgTable('exits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  employee_id: text('employee_id').notNull().references(() => employees.id),
  exit_type: text('exit_type').default('voluntary').notNull(),
  exit_date: timestamp('exit_date'),
  is_regrettable: boolean('is_regrettable').default(false).notNull(),
  regrettable_score: real('regrettable_score'),
  classification_reason: text('classification_reason'),
  manually_overridden: boolean('manually_overridden').default(false).notNull(),
  override_reason: text('override_reason'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Replacement cost
// ---------------------------------------------------------------------------

export const replacement_cost_models = pgTable('replacement_cost_models', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  role_family: text('role_family').notNull(),
  salary_multiplier: real('salary_multiplier').default(1).notNull(),
  agency_pct: real('agency_pct').default(0.2).notNull(),
  weeks_to_productivity: integer('weeks_to_productivity').default(12).notNull(),
  onboarding_cost: real('onboarding_cost').default(0).notNull(),
  knowledge_transfer_cost: real('knowledge_transfer_cost').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const replacement_costs = pgTable('replacement_costs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  employee_id: text('employee_id').notNull().references(() => employees.id),
  total_cost: real('total_cost').notNull(),
  recruiting_cost: real('recruiting_cost').default(0),
  ramp_cost: real('ramp_cost').default(0),
  productivity_loss: real('productivity_loss').default(0),
  onboarding_cost: real('onboarding_cost').default(0),
  knowledge_transfer_cost: real('knowledge_transfer_cost').default(0),
  breakdown: jsonb('breakdown').$type<Record<string, number>>().default({}),
  computed_at: timestamp('computed_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

export const cohorts = pgTable('cohorts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  dimension: text('dimension').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Interventions & optimizer
// ---------------------------------------------------------------------------

export const interventions = pgTable('interventions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  description: text('description'),
  cost: real('cost').default(0).notNull(),
  risk_reduction: real('risk_reduction').default(0).notNull(),
  addresses_driver: text('addresses_driver'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const intervention_candidates = pgTable('intervention_candidates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  employee_id: text('employee_id').notNull().references(() => employees.id),
  intervention_id: text('intervention_id').notNull().references(() => interventions.id),
  cost: real('cost').notNull(),
  risk_reduction: real('risk_reduction').notNull(),
  roi: real('roi').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const scenarios = pgTable('scenarios', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  budget: real('budget').default(0).notNull(),
  projected_regrettable_rate: real('projected_regrettable_rate'),
  projected_retained: integer('projected_retained'),
  projected_avoided_cost: real('projected_avoided_cost'),
  total_spend: real('total_spend').default(0),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const scenario_allocations = pgTable('scenario_allocations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  scenario_id: text('scenario_id').notNull().references(() => scenarios.id),
  employee_id: text('employee_id').notNull().references(() => employees.id),
  intervention_id: text('intervention_id').notNull().references(() => interventions.id),
  cost: real('cost').notNull(),
  risk_reduction: real('risk_reduction').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Managers
// ---------------------------------------------------------------------------

export const manager_scorecards = pgTable('manager_scorecards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  manager_id: text('manager_id').notNull(),
  manager_name: text('manager_name'),
  team_size: integer('team_size').default(0).notNull(),
  regrettable_exits: integer('regrettable_exits').default(0).notNull(),
  regrettable_rate: real('regrettable_rate').default(0).notNull(),
  avg_flight_risk: real('avg_flight_risk').default(0).notNull(),
  replacement_cost_exposure: real('replacement_cost_exposure').default(0).notNull(),
  is_outlier: boolean('is_outlier').default(false).notNull(),
  period: text('period'),
  computed_at: timestamp('computed_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Exit drivers
// ---------------------------------------------------------------------------

export const exit_drivers = pgTable('exit_drivers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  category: text('category'),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const exit_driver_records = pgTable('exit_driver_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  exit_id: text('exit_id').notNull().references(() => exits.id),
  driver_id: text('driver_id').notNull().references(() => exit_drivers.id),
  severity: integer('severity').default(1).notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export const watchlist = pgTable('watchlist', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  employee_id: text('employee_id').notNull().references(() => employees.id),
  reason: text('reason'),
  owner: text('owner'),
  status: text('status').default('watching').notNull(),
  next_review: timestamp('next_review'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.user_id, t.employee_id)])

// ---------------------------------------------------------------------------
// Board packs
// ---------------------------------------------------------------------------

export const board_packs = pgTable('board_packs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  title: text('title').notNull(),
  period: text('period').notNull(),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().default({}),
  narrative: text('narrative'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export const benchmarks = pgTable('benchmarks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  value: real('value').notNull(),
  default_value: real('default_value').notNull(),
  unit: text('unit'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.user_id, t.key)])

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const alerts = pgTable('alerts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  employee_id: text('employee_id'),
  is_read: boolean('is_read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const import_jobs = pgTable('import_jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').default('completed').notNull(),
  rows_processed: integer('rows_processed').default(0).notNull(),
  rows_failed: integer('rows_failed').default(0).notNull(),
  errors: jsonb('errors').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export const activity_log = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id'),
  action: text('action').notNull(),
  detail: jsonb('detail').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Org settings
// ---------------------------------------------------------------------------

export const org_settings = pgTable('org_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  industry: text('industry'),
  currency: text('currency').default('USD').notNull(),
  fiscal_quarter_start: integer('fiscal_quarter_start').default(1).notNull(),
  headcount_band: text('headcount_band'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull(),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').default('active').notNull(),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
