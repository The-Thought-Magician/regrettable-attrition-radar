import { db } from './index.js'
import { sql } from 'drizzle-orm'

// Idempotent self-provisioning DDL. Column names/types match schema.ts exactly.
// Timestamps use timestamptz; jsonb for json columns; real for floats; integer for ints.
const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS departments (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    code text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS locations (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    region text,
    country text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS roles (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    title text NOT NULL,
    level text NOT NULL,
    role_family text NOT NULL,
    band_midpoint real,
    is_critical boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS employees (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    full_name text NOT NULL,
    email text,
    department_id text REFERENCES departments(id),
    location_id text REFERENCES locations(id),
    role_id text REFERENCES roles(id),
    manager_id text,
    level text,
    hire_date timestamptz,
    role_start_date timestamptz,
    last_raise_date timestamptz,
    last_promotion_date timestamptz,
    salary real,
    compa_ratio real,
    span_of_control integer DEFAULT 0,
    performance_rating real,
    succession_depth integer DEFAULT 0,
    unique_skill boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    hire_cohort text,
    attributes jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS scoring_models (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT false,
    band_thresholds jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS scoring_factors (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    model_id text NOT NULL REFERENCES scoring_models(id),
    factor_key text NOT NULL,
    label text NOT NULL,
    weight real NOT NULL DEFAULT 1,
    bands jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (model_id, factor_key)
  )`,

  `CREATE TABLE IF NOT EXISTS risk_scores (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employee_id text NOT NULL REFERENCES employees(id),
    model_id text REFERENCES scoring_models(id),
    score real NOT NULL,
    band text NOT NULL,
    factor_breakdown jsonb DEFAULT '[]'::jsonb,
    computed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS regrettability_rules (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT false,
    threshold real NOT NULL DEFAULT 50,
    criteria jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS exits (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employee_id text NOT NULL REFERENCES employees(id),
    exit_type text NOT NULL DEFAULT 'voluntary',
    exit_date timestamptz,
    is_regrettable boolean NOT NULL DEFAULT false,
    regrettable_score real,
    classification_reason text,
    manually_overridden boolean NOT NULL DEFAULT false,
    override_reason text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS replacement_cost_models (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    role_family text NOT NULL,
    salary_multiplier real NOT NULL DEFAULT 1,
    agency_pct real NOT NULL DEFAULT 0.2,
    weeks_to_productivity integer NOT NULL DEFAULT 12,
    onboarding_cost real NOT NULL DEFAULT 0,
    knowledge_transfer_cost real NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS replacement_costs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employee_id text NOT NULL REFERENCES employees(id),
    total_cost real NOT NULL,
    recruiting_cost real DEFAULT 0,
    ramp_cost real DEFAULT 0,
    productivity_loss real DEFAULT 0,
    onboarding_cost real DEFAULT 0,
    knowledge_transfer_cost real DEFAULT 0,
    breakdown jsonb DEFAULT '{}'::jsonb,
    computed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS cohorts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    dimension text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS interventions (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    description text,
    cost real NOT NULL DEFAULT 0,
    risk_reduction real NOT NULL DEFAULT 0,
    addresses_driver text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS intervention_candidates (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employee_id text NOT NULL REFERENCES employees(id),
    intervention_id text NOT NULL REFERENCES interventions(id),
    cost real NOT NULL,
    risk_reduction real NOT NULL,
    roi real NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS scenarios (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    budget real NOT NULL DEFAULT 0,
    projected_regrettable_rate real,
    projected_retained integer,
    projected_avoided_cost real,
    total_spend real DEFAULT 0,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS scenario_allocations (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    scenario_id text NOT NULL REFERENCES scenarios(id),
    employee_id text NOT NULL REFERENCES employees(id),
    intervention_id text NOT NULL REFERENCES interventions(id),
    cost real NOT NULL,
    risk_reduction real NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS manager_scorecards (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    manager_id text NOT NULL,
    manager_name text,
    team_size integer NOT NULL DEFAULT 0,
    regrettable_exits integer NOT NULL DEFAULT 0,
    regrettable_rate real NOT NULL DEFAULT 0,
    avg_flight_risk real NOT NULL DEFAULT 0,
    replacement_cost_exposure real NOT NULL DEFAULT 0,
    is_outlier boolean NOT NULL DEFAULT false,
    period text,
    computed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS exit_drivers (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    category text,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS exit_driver_records (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    exit_id text NOT NULL REFERENCES exits(id),
    driver_id text NOT NULL REFERENCES exit_drivers(id),
    severity integer NOT NULL DEFAULT 1,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS watchlist (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employee_id text NOT NULL REFERENCES employees(id),
    reason text,
    owner text,
    status text NOT NULL DEFAULT 'watching',
    next_review timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, employee_id)
  )`,

  `CREATE TABLE IF NOT EXISTS board_packs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    title text NOT NULL,
    period text NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb,
    narrative text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS benchmarks (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    value real NOT NULL,
    default_value real NOT NULL,
    unit text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, key)
  )`,

  `CREATE TABLE IF NOT EXISTS alerts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    employee_id text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS import_jobs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'completed',
    rows_processed integer NOT NULL DEFAULT 0,
    rows_failed integer NOT NULL DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS org_settings (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    industry text,
    currency text NOT NULL DEFAULT 'USD',
    fiscal_quarter_start integer NOT NULL DEFAULT 1,
    headcount_band text,
    settings jsonb DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_departments_user ON departments(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_roles_user ON roles(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_location ON employees(location_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scoring_models_user ON scoring_models(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scoring_factors_model ON scoring_factors(model_id)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_scores_user ON risk_scores(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_scores_employee ON risk_scores(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exits_user ON exits(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exits_employee ON exits(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_replacement_costs_employee ON replacement_costs(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cohorts_user ON cohorts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_interventions_user ON interventions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_intervention_candidates_employee ON intervention_candidates(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scenarios_user ON scenarios(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scenario_allocations_scenario ON scenario_allocations(scenario_id)`,
  `CREATE INDEX IF NOT EXISTS idx_manager_scorecards_user ON manager_scorecards(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_manager_scorecards_manager ON manager_scorecards(manager_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exit_drivers_user ON exit_drivers(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exit_driver_records_exit ON exit_driver_records(exit_id)`,
  `CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_board_packs_user ON board_packs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_benchmarks_user ON benchmarks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const idx of indexes) {
    await db.execute(sql.raw(idx))
  }
  console.log('Migration complete')
}
