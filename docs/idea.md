# RegrettableAttritionRadar

> Score employee flight risk, quantify replacement cost, and rank where retention spend has the best ROI.

---

## Overview

RegrettableAttritionRadar is a deterministic, explainable people-analytics platform that helps People leaders see *who is likely to leave*, *which of those exits would actually hurt* (regrettable vs non-regrettable), *what each loss costs to replace*, and *where a finite retention budget produces the most risk-reduction-per-dollar*. Every score is rule-weighted and transparent: there is no black-box ML, so a VP of People can defend every number in a board meeting and a manager can see exactly which factors drive a report's flight risk.

The product ingests workforce data three ways: CSV upload, a built-in sample-data seeder (for instant demoability), and a structured manual-entry path. From that data it computes flight-risk scores, classifies probable exits as regrettable or not, runs a replacement-cost model by role and seniority, builds cohort survival/attrition curves, attributes regrettable loss to managers, ranks retention interventions by ROI, maintains an exit-driver register, and assembles a quarterly board pack.

## Problem

Regrettable senior attrition costs 1-2x annual salary per exit (recruiting fees, time-to-fill ramp, lost productivity, institutional knowledge) and is a standing board-reported metric. Yet most People teams have:

- No explainable flight-risk model. Vendor tools are either black-box ML (undefensible in a board setting) or nonexistent (gut feel).
- No tie between risk and money. Knowing someone is "at risk" is useless without knowing the dollar cost of losing them and the dollar cost of preventing it.
- No regrettable filter. Aggregate turnover numbers conflate good attrition (low performers, redundant roles) with the exits that genuinely set the company back.
- No budget optimizer. A retention/counteroffer budget gets spent reactively, not allocated to maximize total risk reduction.
- No manager accountability. Regrettable loss is rarely attributed to the manager whose team it happened on.

## Target Users

Primary: VPs of People / Heads of Talent at 150-3000 person companies who own board-reported retention metrics and control a retention/counteroffer budget.

Secondary:
- People Analytics / HRBP teams who build the underlying data and run the scenarios.
- Finance partners who sign off on replacement-cost assumptions and retention ROI.
- Line managers who consume their attrition scorecard and per-report risk drivers.
- CHRO / executive sponsors who consume the quarterly board pack.

## Why this is NOT an existing project

Near-neighbors in the broader corpus and why this is distinct:

- churn-prediction / customer-health-score: those model **customer** churn (accounts, MRR, product usage). This models **employee** regrettable attrition and replacement-cost economics for the workforce, not the customer base.
- hr-platform / HRIS: those are systems-of-record for HR operations (onboarding, PTO, payroll, org chart CRUD). RAR is an analytics layer that *reads* workforce attributes and produces flight-risk + retention-ROI decisions; it is not a system of record.
- manager-span-layer-optimizer (nearest sibling): analyzes org **structure** (spans of control, layers, reorg). RAR analyzes **flight risk and retention ROI** of individuals, not the shape of the org chart.
- comp-band-equity-auditor (nearest sibling): analyzes **pay equity** and compa-band placement. RAR uses compa-ratio only as one of several flight-risk signals; its output is attrition risk and retention spend allocation, not equity remediation.
- engagement-survey tools: those measure sentiment via surveys. RAR is deterministic over hard workforce attributes (tenure, time-in-role, time-since-raise, compa-ratio, span, promotion velocity) and does not require a survey.

The defining wedge: **deterministic, explainable, rule-weighted (no-ML) flight-risk scoring tied directly to replacement-cost economics and a retention-budget ROI optimizer.**

---

## Major Features

### 1. Deterministic, Explainable Flight-Risk Score
- Rule-weighted scoring engine over six core signals: tenure, time-in-role, time-since-last-raise, compa-ratio, span-of-control deviation, promotion velocity.
- Each signal maps to a 0-100 sub-score via a configurable banded rule (e.g. time-in-role > 36 months adds risk).
- Configurable per-factor weights stored in a scoring model; total score is the weighted sum, normalized 0-100.
- Risk band classification (Low / Moderate / Elevated / High / Critical) from configurable thresholds.
- Full factor-contribution breakdown per employee (which factors drove the score and by how much), so every number is explainable.
- What-if recompute: adjust an input (e.g. give a raise) and see the new score before committing.
- Score history tracked over time per employee to show trajectory.

### 2. Regrettable vs Non-Regrettable Exit Classifier
- Deterministic classifier marking a probable/actual exit as regrettable or non-regrettable.
- Inputs: performance rating, role criticality, succession depth, time-to-backfill, unique-skill flag.
- Configurable regrettability rule set with weighted criteria and a threshold.
- Per-exit explanation of why it was classified regrettable.
- Regrettable rate metric: regrettable exits / total exits, trended over time.
- Override workflow: a People analyst can manually reclassify with a recorded reason.

### 3. Replacement-Cost Calculator
- Computes total replacement cost per role/seniority from components: recruiting fee, agency cost, time-to-fill ramp loss, onboarding cost, lost productivity, knowledge-transfer overhead.
- Cost driven by a per-role-family cost model with configurable assumptions (multiplier of salary, weeks-to-productivity, agency %).
- Per-employee replacement cost computed from their role mapping and salary.
- Aggregate replacement-cost exposure across all at-risk employees.
- Sensitivity view: how cost changes with each assumption.
- Benchmark assumptions library (default industry multipliers, editable).

### 4. Cohort Attrition Curves
- Survival/attrition curves by cohort dimension: hire-class (quarter/year), department, manager, location, level.
- Retention rate at N months (3/6/12/18/24) per cohort.
- Curve comparison across cohorts.
- Cohort builder with arbitrary filter combinations.
- Early-attrition flag (cohorts losing people faster than baseline).
- Exportable cohort table.

### 5. Retention-Spend ROI Optimizer
- Library of retention interventions (raise, retention bonus, promotion, counteroffer, role change, manager change, equity refresh) each with a cost and an estimated risk-reduction effect.
- Per-employee candidate interventions with computed risk-reduction-per-dollar.
- Budget-constrained optimizer: given a total budget, greedily select the set of interventions maximizing total regrettable-risk-weighted reduction.
- Scenario save/compare (allocate $X this way vs that way).
- Marginal-ROI ranking of every candidate intervention.
- Projected retained-headcount and avoided replacement-cost from a chosen allocation.

### 6. Manager Attrition Scorecard
- Per-manager metrics: team size, regrettable exits, regrettable rate, avg team flight-risk, replacement-cost exposure on their team.
- Regrettable-loss attribution to the manager whose team an exit occurred on.
- Manager ranking / outlier detection (managers with abnormally high regrettable loss).
- Trend per manager over time.
- Drill-through to the manager's team roster and per-report risk.

### 7. Exit-Driver Register
- Catalog of exit drivers (comp, career growth, manager, burnout, relocation, role fit, external offer, etc.).
- Per-exit recorded driver(s) with severity and notes.
- Aggregate driver frequency and regrettable-weighted driver ranking.
- Driver trend over time.
- Driver-to-intervention mapping (which intervention addresses which driver).

### 8. Quarterly Board Pack
- Auto-assembled board-ready report: regrettable rate, headcount at risk, replacement-cost exposure, retention spend ROI, top drivers, manager outliers.
- Period selection (quarter/year).
- Snapshot persistence so a board pack is reproducible.
- Narrative summary generated deterministically from the metrics.
- Export to a shareable view.

### 9. Employee Roster & Profiles
- Master employee list with all workforce attributes.
- Per-employee profile: attributes, current flight-risk score + breakdown, replacement cost, recommended interventions, score history, exit record if applicable.
- Search and filter (department, manager, level, risk band, location).
- Inline edit of attributes (auth-gated, ownership-checked).

### 10. Data Ingestion & Sample Seeder
- CSV upload of employees with column mapping.
- Built-in sample-data seeder generating a realistic 200-person org for instant demoability.
- Manual single-employee add.
- Import job tracking (rows processed, errors).
- Field validation on import.

### 11. Scoring Model Configuration
- Manage named scoring models with per-factor weights and band rules.
- Default model seeded; clone-and-edit workflow.
- Activate one model as the org default used by the radar.
- Versioned: editing creates a new revision so historical scores remain explainable.

### 12. Risk Watchlist
- Curated list of employees flagged for active retention attention.
- Add/remove from watchlist with a reason and owner.
- Status tracking (watching / intervening / resolved / exited).
- Due-date / next-review reminders surfaced on the dashboard.

### 13. Compensation Signals
- Compa-ratio computation from salary vs band midpoint per role.
- Time-since-last-raise tracking.
- Below-band and stale-comp flags feeding the flight-risk score.
- Comp adjustment recommendations tied to the ROI optimizer.

### 14. Promotion Velocity Tracking
- Time-since-last-promotion and historical promotion cadence per employee.
- Stalled-career flag (no promotion beyond an expected window for the level).
- Promotion velocity as a flight-risk factor.

### 15. Span & Org Context
- Span-of-control per manager and deviation from a target band.
- Over/under-spanned manager flags (context for attrition, not a reorg tool).
- Reporting-line context surfaced on profiles.

### 16. Scenario Planning
- Save what-if scenarios combining interventions, budget, and assumption changes.
- Compare scenarios side by side on projected regrettable rate, retained headcount, avoided cost, spend.
- Clone and iterate scenarios.

### 17. Alerts & Triggers
- Rule-based alerts: score crossing a threshold, new High/Critical risk, manager regrettable-rate spike, watchlist review due.
- Per-user alert feed.
- Mark-read / dismiss.

### 18. Benchmarks & Assumptions Library
- Editable library of cost multipliers, ramp weeks, agency %, intervention effects.
- Org-level defaults applied across calculators.
- Reset-to-default.

### 19. Reports & Exports
- On-demand reports: at-risk roster, replacement-cost exposure, cohort table, manager scorecard, driver register.
- Export-ready tabular views.
- Saved report definitions.

### 20. Dashboard & KPI Overview
- Executive summary: regrettable rate, headcount at risk by band, total replacement-cost exposure, retention budget utilization, top drivers, top at-risk employees, manager outliers.
- Trend tiles.
- Quick links into each module.

### 21. Activity Log / Audit Trail
- Record of edits: reclassifications, score-model changes, watchlist changes, scenario saves.
- Per-entity history.

### 22. Settings & Org Profile
- Org-level configuration: industry, default currency, fiscal-quarter start, headcount band.
- Billing/plan view (all features free; Stripe optional).

---

## Data Model (Tables)

- `employees` — workforce roster and all scoring attributes.
- `departments` — department reference.
- `locations` — location reference.
- `roles` — role/level reference with band midpoint and role family.
- `scoring_models` — named rule-weighted flight-risk models.
- `scoring_factors` — per-model factor weights and band rules.
- `risk_scores` — computed flight-risk score snapshots per employee.
- `exits` — recorded/probable exits with regrettable classification.
- `regrettability_rules` — configurable regrettable-classification rule sets.
- `replacement_cost_models` — per-role-family cost assumption sets.
- `replacement_costs` — computed replacement cost per employee.
- `cohorts` — saved cohort definitions.
- `interventions` — retention intervention catalog with cost and effect.
- `intervention_candidates` — per-employee candidate interventions with ROI.
- `scenarios` — saved retention/budget scenarios.
- `scenario_allocations` — selected interventions within a scenario.
- `manager_scorecards` — computed per-manager attrition metrics snapshots.
- `exit_drivers` — exit-driver catalog.
- `exit_driver_records` — drivers attached to a specific exit.
- `watchlist` — employees flagged for retention attention.
- `board_packs` — assembled quarterly board pack snapshots.
- `benchmarks` — editable assumptions/benchmark library.
- `alerts` — per-user rule-based alerts.
- `import_jobs` — data ingestion job tracking.
- `activity_log` — audit trail of edits.
- `org_settings` — org-level configuration.
- `plans` — billing plans (free/pro).
- `subscriptions` — per-user subscription state.

## API Surface (high level)

- `/employees` — CRUD, search, profile, attributes.
- `/departments`, `/locations`, `/roles` — reference CRUD.
- `/scoring-models`, `/scoring-factors` — model config.
- `/risk-scores` — compute, list, history, what-if.
- `/exits` — CRUD, classify, reclassify.
- `/regrettability-rules` — config.
- `/replacement-costs` — models, compute, exposure.
- `/cohorts` — build, list, curves.
- `/interventions` — catalog CRUD.
- `/optimizer` — candidates, optimize, ranking.
- `/scenarios` — CRUD, compare.
- `/manager-scorecards` — compute, list, detail.
- `/exit-drivers` — catalog + records, aggregates.
- `/watchlist` — CRUD, status.
- `/board-packs` — assemble, list, detail.
- `/benchmarks` — list, edit, reset.
- `/alerts` — list, mark-read.
- `/imports` — upload, seed sample, status.
- `/dashboard` — KPI summary.
- `/activity` — audit log.
- `/settings` — org settings.
- `/billing` — plan, checkout, portal, webhook.

## Frontend Pages (~24)

Public:
1. `/` — static landing.
2. `/auth/sign-in` — sign in.
3. `/auth/sign-up` — sign up.
4. `/pricing` — plans (all free).

Dashboard:
5. `/dashboard` — KPI overview.
6. `/dashboard/employees` — roster.
7. `/dashboard/employees/[id]` — employee profile.
8. `/dashboard/risk` — flight-risk radar / ranking.
9. `/dashboard/exits` — exits + regrettable classifier.
10. `/dashboard/replacement-costs` — cost exposure.
11. `/dashboard/cohorts` — cohort attrition curves.
12. `/dashboard/optimizer` — retention ROI optimizer.
13. `/dashboard/scenarios` — scenario planning.
14. `/dashboard/managers` — manager scorecards.
15. `/dashboard/drivers` — exit-driver register.
16. `/dashboard/board-packs` — board pack list + assemble.
17. `/dashboard/board-packs/[id]` — board pack detail.
18. `/dashboard/watchlist` — risk watchlist.
19. `/dashboard/scoring-models` — scoring model config.
20. `/dashboard/interventions` — intervention catalog.
21. `/dashboard/benchmarks` — assumptions library.
22. `/dashboard/imports` — data ingestion + sample seeder.
23. `/dashboard/alerts` — alerts feed.
24. `/dashboard/activity` — audit log.
25. `/dashboard/settings` — org settings + billing.
