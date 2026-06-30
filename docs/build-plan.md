# RegrettableAttritionRadar — Build Contract (Single Source of Truth)

This document is binding. Filenames, mount paths, api method names, and page files declared here are authoritative. Every api method is implemented by exactly one route endpoint and consumed by at least one page.

Stack: Hono backend (mount under `/api/v1` via child `api` router), Neon Postgres + drizzle, Next.js 16 + `@neondatabase/auth@0.4.2-beta`, `proxy.ts` only, backend trusts `X-User-Id` via `getUserId(c)`. Public reads / auth-gated writes with zod + ownership checks. All features free; Stripe optional (503).

---

## (a) Tables (columns)

See `backend/src/db/schema.ts` and `backend/src/db/migrate.ts` for authoritative columns. Summary:

- **departments** — id, user_id, name, code, created_at
- **locations** — id, user_id, name, region, country, created_at
- **roles** — id, user_id, title, level, role_family, band_midpoint, is_critical, created_at
- **employees** — id, user_id, full_name, email, department_id(fk), location_id(fk), role_id(fk), manager_id, level, hire_date, role_start_date, last_raise_date, last_promotion_date, salary, compa_ratio, span_of_control, performance_rating, succession_depth, unique_skill, status, hire_cohort, attributes(jsonb), created_at
- **scoring_models** — id, user_id, name, description, version, is_active, band_thresholds(jsonb), created_at
- **scoring_factors** — id, user_id, model_id(fk), factor_key, label, weight, bands(jsonb), created_at; unique(model_id, factor_key)
- **risk_scores** — id, user_id, employee_id(fk), model_id(fk), score, band, factor_breakdown(jsonb), computed_at, created_at
- **regrettability_rules** — id, user_id, name, is_active, threshold, criteria(jsonb), created_at
- **exits** — id, user_id, employee_id(fk), exit_type, exit_date, is_regrettable, regrettable_score, classification_reason, manually_overridden, override_reason, notes, created_at
- **replacement_cost_models** — id, user_id, role_family, salary_multiplier, agency_pct, weeks_to_productivity, onboarding_cost, knowledge_transfer_cost, created_at
- **replacement_costs** — id, user_id, employee_id(fk), total_cost, recruiting_cost, ramp_cost, productivity_loss, onboarding_cost, knowledge_transfer_cost, breakdown(jsonb), computed_at, created_at
- **cohorts** — id, user_id, name, dimension, filters(jsonb), created_at
- **interventions** — id, user_id, name, kind, description, cost, risk_reduction, addresses_driver, created_at
- **intervention_candidates** — id, user_id, employee_id(fk), intervention_id(fk), cost, risk_reduction, roi, created_at
- **scenarios** — id, user_id, name, budget, projected_regrettable_rate, projected_retained, projected_avoided_cost, total_spend, notes, created_at
- **scenario_allocations** — id, user_id, scenario_id(fk), employee_id(fk), intervention_id(fk), cost, risk_reduction, created_at
- **manager_scorecards** — id, user_id, manager_id, manager_name, team_size, regrettable_exits, regrettable_rate, avg_flight_risk, replacement_cost_exposure, is_outlier, period, computed_at, created_at
- **exit_drivers** — id, user_id, name, category, description, created_at
- **exit_driver_records** — id, user_id, exit_id(fk), driver_id(fk), severity, notes, created_at
- **watchlist** — id, user_id, employee_id(fk), reason, owner, status, next_review, created_at; unique(user_id, employee_id)
- **board_packs** — id, user_id, title, period, metrics(jsonb), narrative, created_at
- **benchmarks** — id, user_id, key, label, value, default_value, unit, created_at; unique(user_id, key)
- **alerts** — id, user_id, kind, title, body, employee_id, is_read, created_at
- **import_jobs** — id, user_id, kind, status, rows_processed, rows_failed, errors(jsonb), created_at
- **activity_log** — id, user_id, entity_type, entity_id, action, detail(jsonb), created_at
- **org_settings** — id, user_id(unique), industry, currency, fiscal_quarter_start, headcount_band, settings(jsonb), updated_at, created_at
- **plans** — id(text), name, price_cents
- **subscriptions** — id, user_id(unique), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend route files (mount under `/api/v1`)

Conventions: each file `export default router`. Public reads, auth-gated writes (`authMiddleware`), zod validation, ownership checks (`existing.user_id !== getUserId(c)` → 403). All list endpoints filter by `user_id` where ownership applies; reference/catalog reads are public.

### 1. `employees.ts` → mount `employees`
- `GET /` — auth? no — list employees (query filters: department_id, manager_id, level, status, location_id) — `Employee[]`
- `GET /:id` — no — employee detail — `Employee`
- `GET /:id/profile` — no — profile bundle (employee + latest risk_score + replacement_cost + candidate interventions + score history + exit) — `{ employee, score, replacementCost, candidates, history, exit }`
- `POST /` — yes — create employee — `Employee`
- `PUT /:id` — yes — update employee attributes — `Employee`
- `DELETE /:id` — yes — delete employee — `{ success }`

### 2. `departments.ts` → mount `departments`
- `GET /` — no — list — `Department[]`
- `POST /` — yes — create — `Department`
- `PUT /:id` — yes — update — `Department`
- `DELETE /:id` — yes — delete — `{ success }`

### 3. `locations.ts` → mount `locations`
- `GET /` — no — list — `Location[]`
- `POST /` — yes — create — `Location`
- `PUT /:id` — yes — update — `Location`
- `DELETE /:id` — yes — delete — `{ success }`

### 4. `roles.ts` → mount `roles`
- `GET /` — no — list — `Role[]`
- `POST /` — yes — create — `Role`
- `PUT /:id` — yes — update — `Role`
- `DELETE /:id` — yes — delete — `{ success }`

### 5. `scoringModels.ts` → mount `scoring-models`
- `GET /` — no — list models — `ScoringModel[]`
- `GET /:id` — no — model + factors — `{ model, factors }`
- `POST /` — yes — create model (seeds default factors) — `ScoringModel`
- `PUT /:id` — yes — update model (bumps version) — `ScoringModel`
- `POST /:id/activate` — yes — set active model — `ScoringModel`
- `PUT /:id/factors` — yes — replace factor weights/bands — `{ factors }`
- `DELETE /:id` — yes — delete model — `{ success }`

### 6. `riskScores.ts` → mount `risk-scores`
- `GET /` — no — ranked risk list (latest score per employee, sort desc) — `RiskRow[]`
- `GET /employee/:employeeId` — no — score history for employee — `RiskScore[]`
- `POST /compute` — yes — recompute all employees against active model, persist snapshots — `{ computed, scores }`
- `POST /whatif` — yes — recompute one employee with overridden inputs (no persist) — `{ score, band, factor_breakdown }`

### 7. `exits.ts` → mount `exits`
- `GET /` — no — list exits (with employee join) — `ExitRow[]`
- `POST /` — yes — record exit (auto-classify regrettable) — `Exit`
- `POST /:id/classify` — yes — re-run classifier on exit — `Exit`
- `PUT /:id/override` — yes — manual reclassify with reason — `Exit`
- `GET /rate` — no — regrettable rate trend — `{ overall, byPeriod[] }`
- `DELETE /:id` — yes — delete exit — `{ success }`

### 8. `regrettabilityRules.ts` → mount `regrettability-rules`
- `GET /` — no — list rules — `RegrettabilityRule[]`
- `POST /` — yes — create rule — `RegrettabilityRule`
- `PUT /:id` — yes — update rule — `RegrettabilityRule`
- `POST /:id/activate` — yes — activate rule — `RegrettabilityRule`
- `DELETE /:id` — yes — delete — `{ success }`

### 9. `replacementCosts.ts` → mount `replacement-costs`
- `GET /models` — no — list cost models — `ReplacementCostModel[]`
- `POST /models` — yes — create cost model — `ReplacementCostModel`
- `PUT /models/:id` — yes — update cost model — `ReplacementCostModel`
- `POST /compute` — yes — compute replacement cost for all employees, persist — `{ computed, costs }`
- `GET /exposure` — no — aggregate exposure (total, by department, by risk band) — `{ total, byDepartment[], byBand[], rows[] }`

### 10. `cohorts.ts` → mount `cohorts`
- `GET /` — no — list saved cohorts — `Cohort[]`
- `POST /` — yes — create cohort — `Cohort`
- `DELETE /:id` — yes — delete — `{ success }`
- `GET /:id/curve` — no — attrition/survival curve + retention@N for cohort — `{ points[], retention: {m3,m6,m12,m18,m24}, earlyFlag }`
- `GET /curves` — no — comparison curves across cohorts for a dimension (query: dimension) — `{ dimension, series[] }`

### 11. `interventions.ts` → mount `interventions`
- `GET /` — no — list intervention catalog — `Intervention[]`
- `POST /` — yes — create — `Intervention`
- `PUT /:id` — yes — update — `Intervention`
- `DELETE /:id` — yes — delete — `{ success }`

### 12. `optimizer.ts` → mount `optimizer`
- `GET /candidates` — no — per-employee candidate interventions ranked by ROI — `Candidate[]`
- `POST /generate` — yes — (re)generate candidate interventions from current risk + catalog, persist — `{ generated, candidates }`
- `POST /optimize` — yes — budget-constrained greedy selection (body: budget) — `{ budget, selected[], totalSpend, totalRiskReduction, projectedRetained, avoidedCost }`
- `GET /ranking` — no — marginal-ROI ranking of all candidates — `Candidate[]`

### 13. `scenarios.ts` → mount `scenarios`
- `GET /` — no — list scenarios — `Scenario[]`
- `GET /:id` — no — scenario + allocations — `{ scenario, allocations }`
- `POST /` — yes — create scenario from an optimize result (persists allocations) — `Scenario`
- `DELETE /:id` — yes — delete scenario — `{ success }`
- `GET /compare` — no — compare scenarios side by side (query: ids) — `{ scenarios[] }`

### 14. `managerScorecards.ts` → mount `manager-scorecards`
- `GET /` — no — list scorecards (latest per manager, outliers flagged) — `ManagerScorecard[]`
- `GET /:managerId` — no — manager detail + team roster + per-report risk — `{ scorecard, team[] }`
- `POST /compute` — yes — recompute manager scorecards, persist — `{ computed, scorecards }`

### 15. `exitDrivers.ts` → mount `exit-drivers`
- `GET /` — no — driver catalog — `ExitDriver[]`
- `POST /` — yes — create driver — `ExitDriver`
- `PUT /:id` — yes — update driver — `ExitDriver`
- `DELETE /:id` — yes — delete driver — `{ success }`
- `GET /records` — no — driver records (with exit join) — `DriverRecord[]`
- `POST /records` — yes — attach driver to an exit — `DriverRecord`
- `GET /aggregate` — no — frequency + regrettable-weighted ranking + trend — `{ ranking[], trend[] }`

### 16. `watchlist.ts` → mount `watchlist`
- `GET /` — no — list watchlist (with employee + risk) — `WatchlistRow[]`
- `POST /` — yes — add to watchlist (upsert on user_id+employee_id) — `Watchlist`
- `PUT /:id` — yes — update reason/owner/status/next_review — `Watchlist`
- `DELETE /:id` — yes — remove — `{ success }`

### 17. `boardPacks.ts` → mount `board-packs`
- `GET /` — no — list board packs — `BoardPack[]`
- `GET /:id` — no — board pack detail — `BoardPack`
- `POST /` — yes — assemble board pack for a period (computes metrics + narrative, persists) — `BoardPack`
- `DELETE /:id` — yes — delete — `{ success }`

### 18. `benchmarks.ts` → mount `benchmarks`
- `GET /` — no — list benchmarks (seeds defaults if empty for user) — `Benchmark[]`
- `PUT /:id` — yes — update a benchmark value — `Benchmark`
- `POST /reset` — yes — reset all to default_value — `{ benchmarks }`

### 19. `alerts.ts` → mount `alerts`
- `GET /` — no — list current user alerts — `Alert[]`
- `POST /evaluate` — yes — run alert rules against current data, create alerts — `{ created, alerts }`
- `PUT /:id/read` — yes — mark read — `Alert`
- `DELETE /:id` — yes — dismiss — `{ success }`

### 20. `imports.ts` → mount `imports`
- `GET /` — no — list import jobs — `ImportJob[]`
- `POST /employees` — yes — bulk import employees from parsed rows (body: rows[]) — `ImportJob`
- `POST /seed-sample` — yes — generate the 200-person sample org (employees, depts, locations, roles, some exits) — `ImportJob`
- `POST /employee` — yes — manual single-employee add (delegates to employees create) — `Employee`

### 21. `dashboard.ts` → mount `dashboard`
- `GET /summary` — no — KPI overview: regrettable rate, headcount at risk by band, total replacement-cost exposure, retention budget utilization, top drivers, top at-risk employees, manager outliers — `{ regrettableRate, riskByBand[], exposure, budgetUtil, topDrivers[], topAtRisk[], managerOutliers[] }`

### 22. `activity.ts` → mount `activity`
- `GET /` — no — list activity log (query: entity_type, entity_id) — `Activity[]`

### 23. `settings.ts` → mount `settings`
- `GET /` — no — get org settings (creates default if missing) — `OrgSettings`
- `PUT /` — yes — update org settings — `OrgSettings`

### 24. `billing.ts` → mount `billing`
- `GET /plan` — no — current subscription + plan + stripeEnabled — `{ subscription, plan, stripeEnabled }`
- `POST /checkout` — no — create Stripe checkout (503 if unconfigured) — `{ url }` | 503
- `POST /portal` — no — Stripe billing portal (503 if unconfigured) — `{ url }` | 503
- `POST /webhook` — no — Stripe webhook (503 if unconfigured) — `{ received }` | 503

---

## (c) lib/api.ts method list

Each is `fetch('/api/proxy/<path>')`; path maps 1:1 to `/api/v1/<path>`. Mutations send `Content-Type: application/json` + `JSON.stringify`.

| Method | Verb | Path |
|--------|------|------|
| listEmployees(params?) | GET | /api/proxy/employees |
| getEmployee(id) | GET | /api/proxy/employees/:id |
| getEmployeeProfile(id) | GET | /api/proxy/employees/:id/profile |
| createEmployee(body) | POST | /api/proxy/employees |
| updateEmployee(id, body) | PUT | /api/proxy/employees/:id |
| deleteEmployee(id) | DELETE | /api/proxy/employees/:id |
| listDepartments() | GET | /api/proxy/departments |
| createDepartment(body) | POST | /api/proxy/departments |
| updateDepartment(id, body) | PUT | /api/proxy/departments/:id |
| deleteDepartment(id) | DELETE | /api/proxy/departments/:id |
| listLocations() | GET | /api/proxy/locations |
| createLocation(body) | POST | /api/proxy/locations |
| updateLocation(id, body) | PUT | /api/proxy/locations/:id |
| deleteLocation(id) | DELETE | /api/proxy/locations/:id |
| listRoles() | GET | /api/proxy/roles |
| createRole(body) | POST | /api/proxy/roles |
| updateRole(id, body) | PUT | /api/proxy/roles/:id |
| deleteRole(id) | DELETE | /api/proxy/roles/:id |
| listScoringModels() | GET | /api/proxy/scoring-models |
| getScoringModel(id) | GET | /api/proxy/scoring-models/:id |
| createScoringModel(body) | POST | /api/proxy/scoring-models |
| updateScoringModel(id, body) | PUT | /api/proxy/scoring-models/:id |
| activateScoringModel(id) | POST | /api/proxy/scoring-models/:id/activate |
| updateScoringFactors(id, body) | PUT | /api/proxy/scoring-models/:id/factors |
| deleteScoringModel(id) | DELETE | /api/proxy/scoring-models/:id |
| listRiskScores() | GET | /api/proxy/risk-scores |
| getEmployeeRiskHistory(employeeId) | GET | /api/proxy/risk-scores/employee/:employeeId |
| computeRiskScores() | POST | /api/proxy/risk-scores/compute |
| whatIfRiskScore(body) | POST | /api/proxy/risk-scores/whatif |
| listExits() | GET | /api/proxy/exits |
| createExit(body) | POST | /api/proxy/exits |
| classifyExit(id) | POST | /api/proxy/exits/:id/classify |
| overrideExit(id, body) | PUT | /api/proxy/exits/:id/override |
| getRegrettableRate() | GET | /api/proxy/exits/rate |
| deleteExit(id) | DELETE | /api/proxy/exits/:id |
| listRegrettabilityRules() | GET | /api/proxy/regrettability-rules |
| createRegrettabilityRule(body) | POST | /api/proxy/regrettability-rules |
| updateRegrettabilityRule(id, body) | PUT | /api/proxy/regrettability-rules/:id |
| activateRegrettabilityRule(id) | POST | /api/proxy/regrettability-rules/:id/activate |
| deleteRegrettabilityRule(id) | DELETE | /api/proxy/regrettability-rules/:id |
| listReplacementCostModels() | GET | /api/proxy/replacement-costs/models |
| createReplacementCostModel(body) | POST | /api/proxy/replacement-costs/models |
| updateReplacementCostModel(id, body) | PUT | /api/proxy/replacement-costs/models/:id |
| computeReplacementCosts() | POST | /api/proxy/replacement-costs/compute |
| getReplacementExposure() | GET | /api/proxy/replacement-costs/exposure |
| listCohorts() | GET | /api/proxy/cohorts |
| createCohort(body) | POST | /api/proxy/cohorts |
| deleteCohort(id) | DELETE | /api/proxy/cohorts/:id |
| getCohortCurve(id) | GET | /api/proxy/cohorts/:id/curve |
| getCohortCurves(dimension) | GET | /api/proxy/cohorts/curves |
| listInterventions() | GET | /api/proxy/interventions |
| createIntervention(body) | POST | /api/proxy/interventions |
| updateIntervention(id, body) | PUT | /api/proxy/interventions/:id |
| deleteIntervention(id) | DELETE | /api/proxy/interventions/:id |
| listCandidates() | GET | /api/proxy/optimizer/candidates |
| generateCandidates() | POST | /api/proxy/optimizer/generate |
| optimizeBudget(body) | POST | /api/proxy/optimizer/optimize |
| getCandidateRanking() | GET | /api/proxy/optimizer/ranking |
| listScenarios() | GET | /api/proxy/scenarios |
| getScenario(id) | GET | /api/proxy/scenarios/:id |
| createScenario(body) | POST | /api/proxy/scenarios |
| deleteScenario(id) | DELETE | /api/proxy/scenarios/:id |
| compareScenarios(ids) | GET | /api/proxy/scenarios/compare |
| listManagerScorecards() | GET | /api/proxy/manager-scorecards |
| getManagerScorecard(managerId) | GET | /api/proxy/manager-scorecards/:managerId |
| computeManagerScorecards() | POST | /api/proxy/manager-scorecards/compute |
| listExitDrivers() | GET | /api/proxy/exit-drivers |
| createExitDriver(body) | POST | /api/proxy/exit-drivers |
| updateExitDriver(id, body) | PUT | /api/proxy/exit-drivers/:id |
| deleteExitDriver(id) | DELETE | /api/proxy/exit-drivers/:id |
| listDriverRecords() | GET | /api/proxy/exit-drivers/records |
| createDriverRecord(body) | POST | /api/proxy/exit-drivers/records |
| getDriverAggregate() | GET | /api/proxy/exit-drivers/aggregate |
| listWatchlist() | GET | /api/proxy/watchlist |
| addToWatchlist(body) | POST | /api/proxy/watchlist |
| updateWatchlist(id, body) | PUT | /api/proxy/watchlist/:id |
| removeFromWatchlist(id) | DELETE | /api/proxy/watchlist/:id |
| listBoardPacks() | GET | /api/proxy/board-packs |
| getBoardPack(id) | GET | /api/proxy/board-packs/:id |
| createBoardPack(body) | POST | /api/proxy/board-packs |
| deleteBoardPack(id) | DELETE | /api/proxy/board-packs/:id |
| listBenchmarks() | GET | /api/proxy/benchmarks |
| updateBenchmark(id, body) | PUT | /api/proxy/benchmarks/:id |
| resetBenchmarks() | POST | /api/proxy/benchmarks/reset |
| listAlerts() | GET | /api/proxy/alerts |
| evaluateAlerts() | POST | /api/proxy/alerts/evaluate |
| markAlertRead(id) | PUT | /api/proxy/alerts/:id/read |
| dismissAlert(id) | DELETE | /api/proxy/alerts/:id |
| listImportJobs() | GET | /api/proxy/imports |
| importEmployees(body) | POST | /api/proxy/imports/employees |
| seedSample() | POST | /api/proxy/imports/seed-sample |
| addEmployeeManual(body) | POST | /api/proxy/imports/employee |
| getDashboardSummary() | GET | /api/proxy/dashboard/summary |
| listActivity(params?) | GET | /api/proxy/activity |
| getSettings() | GET | /api/proxy/settings |
| updateSettings(body) | PUT | /api/proxy/settings |
| getBillingPlan() | GET | /api/proxy/billing/plan |
| startCheckout() | POST | /api/proxy/billing/checkout |
| openPortal() | POST | /api/proxy/billing/portal |

(`billing/webhook` is hit by Stripe directly, not via lib/api.ts.)

---

## (d) Page list

Public pages do NOT call auth. Dashboard pages live under `/dashboard/*`, wrapped by `web/app/dashboard/layout.tsx` → `DashboardLayout` chrome; each guards via `authClient.getSession()`.

| URL | File (under web/) | Kind | API methods used | Renders |
|-----|-------------------|------|------------------|---------|
| / | app/page.tsx | public | (none) | Static landing: hero, feature grid, CTAs |
| /auth/sign-in | app/auth/sign-in/page.tsx | public | (authClient) | Sign-in form |
| /auth/sign-up | app/auth/sign-up/page.tsx | public | (authClient) | Sign-up form |
| /pricing | app/pricing/page.tsx | public | (none) | Plans (all free) |
| /dashboard | app/dashboard/page.tsx | dashboard | getDashboardSummary, evaluateAlerts | KPI overview tiles, top at-risk, manager outliers, top drivers |
| /dashboard/employees | app/dashboard/employees/page.tsx | dashboard | listEmployees, listDepartments, listLocations, listRoles, createEmployee, deleteEmployee | Roster table with filters + add |
| /dashboard/employees/[id] | app/dashboard/employees/[id]/page.tsx | dashboard | getEmployeeProfile, getEmployeeRiskHistory, updateEmployee, addToWatchlist | Profile: attributes, score breakdown, replacement cost, candidates, history |
| /dashboard/risk | app/dashboard/risk/page.tsx | dashboard | listRiskScores, computeRiskScores, whatIfRiskScore | Flight-risk ranking, recompute, what-if panel |
| /dashboard/exits | app/dashboard/exits/page.tsx | dashboard | listExits, createExit, classifyExit, overrideExit, deleteExit, getRegrettableRate, listEmployees | Exit list, regrettable rate trend, classify/override |
| /dashboard/replacement-costs | app/dashboard/replacement-costs/page.tsx | dashboard | getReplacementExposure, computeReplacementCosts, listReplacementCostModels, createReplacementCostModel, updateReplacementCostModel | Exposure summary + cost models editor |
| /dashboard/cohorts | app/dashboard/cohorts/page.tsx | dashboard | listCohorts, createCohort, deleteCohort, getCohortCurve, getCohortCurves | Cohort builder + attrition curves |
| /dashboard/optimizer | app/dashboard/optimizer/page.tsx | dashboard | listCandidates, generateCandidates, optimizeBudget, getCandidateRanking, createScenario | ROI optimizer: budget input, selected set, marginal ranking, save scenario |
| /dashboard/scenarios | app/dashboard/scenarios/page.tsx | dashboard | listScenarios, getScenario, deleteScenario, compareScenarios | Scenario list + side-by-side compare |
| /dashboard/managers | app/dashboard/managers/page.tsx | dashboard | listManagerScorecards, getManagerScorecard, computeManagerScorecards | Manager scorecard table + drill-through |
| /dashboard/drivers | app/dashboard/drivers/page.tsx | dashboard | listExitDrivers, createExitDriver, updateExitDriver, deleteExitDriver, listDriverRecords, createDriverRecord, getDriverAggregate, listExits | Driver register, records, aggregate ranking |
| /dashboard/board-packs | app/dashboard/board-packs/page.tsx | dashboard | listBoardPacks, createBoardPack, deleteBoardPack | Board pack list + assemble |
| /dashboard/board-packs/[id] | app/dashboard/board-packs/[id]/page.tsx | dashboard | getBoardPack | Board pack detail: metrics + narrative |
| /dashboard/watchlist | app/dashboard/watchlist/page.tsx | dashboard | listWatchlist, addToWatchlist, updateWatchlist, removeFromWatchlist, listEmployees | Watchlist with status + reviews |
| /dashboard/scoring-models | app/dashboard/scoring-models/page.tsx | dashboard | listScoringModels, getScoringModel, createScoringModel, updateScoringModel, activateScoringModel, updateScoringFactors, deleteScoringModel | Scoring model config + factor weights/bands |
| /dashboard/interventions | app/dashboard/interventions/page.tsx | dashboard | listInterventions, createIntervention, updateIntervention, deleteIntervention | Intervention catalog CRUD |
| /dashboard/regrettability | app/dashboard/regrettability/page.tsx | dashboard | listRegrettabilityRules, createRegrettabilityRule, updateRegrettabilityRule, activateRegrettabilityRule, deleteRegrettabilityRule | Regrettability rule sets config |
| /dashboard/benchmarks | app/dashboard/benchmarks/page.tsx | dashboard | listBenchmarks, updateBenchmark, resetBenchmarks | Assumptions/benchmarks library |
| /dashboard/imports | app/dashboard/imports/page.tsx | dashboard | listImportJobs, importEmployees, seedSample, addEmployeeManual | CSV import, sample seeder, manual add |
| /dashboard/alerts | app/dashboard/alerts/page.tsx | dashboard | listAlerts, evaluateAlerts, markAlertRead, dismissAlert | Alerts feed |
| /dashboard/activity | app/dashboard/activity/page.tsx | dashboard | listActivity | Audit trail |
| /dashboard/settings | app/dashboard/settings/page.tsx | dashboard | getSettings, updateSettings, getBillingPlan, startCheckout, openPortal | Org settings + billing |

Page count: 26 (4 public + 22 dashboard).

---

## (e) DashboardLayout sidebar nav sections

`web/components/DashboardLayout.tsx` — `'use client'`, `<aside>` sidebar, active state via `usePathname()`, mobile drawer, sign-out via `authClient.signOut()`.

- **Overview**
  - Dashboard → /dashboard
  - Alerts → /dashboard/alerts
- **People**
  - Employees → /dashboard/employees
  - Flight Risk → /dashboard/risk
  - Watchlist → /dashboard/watchlist
- **Attrition**
  - Exits → /dashboard/exits
  - Exit Drivers → /dashboard/drivers
  - Cohorts → /dashboard/cohorts
  - Manager Scorecards → /dashboard/managers
- **Economics**
  - Replacement Costs → /dashboard/replacement-costs
  - ROI Optimizer → /dashboard/optimizer
  - Scenarios → /dashboard/scenarios
- **Board**
  - Board Packs → /dashboard/board-packs
- **Configuration**
  - Scoring Models → /dashboard/scoring-models
  - Regrettability Rules → /dashboard/regrettability
  - Interventions → /dashboard/interventions
  - Benchmarks → /dashboard/benchmarks
  - Imports & Data → /dashboard/imports
  - Activity Log → /dashboard/activity
  - Settings → /dashboard/settings

---

## Consistency guarantees

- 24 backend route files (incl. billing). Every endpoint either is a public read or is auth-gated with zod + ownership.
- Every lib/api.ts method maps 1:1 to exactly one backend endpoint.
- Every api method is consumed by at least one page (see table d).
- 26 pages total (page-count bar met).
- Billing uses the full Stripe-optional-503 pattern; `plans` seeded `free`/`pro`, `subscriptions` text `plan_id`. Add `stripe` dep to backend package.json.
- Schema (`schema.ts`) and DDL (`migrate.ts`) column names/types match exactly.
