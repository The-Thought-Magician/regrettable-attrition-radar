// All calls are same-origin relative fetches to /api/proxy/<path>, which maps 1:1
// to the backend /api/v1/<path>. The proxy route injects X-User-Id after server-side
// session resolution. Mutations send Content-Type: application/json + JSON.stringify.

async function get(path: string): Promise<any> {
  const res = await fetch(`/api/proxy/${path}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `GET ${path} failed (${res.status})`)
  return res.json()
}

async function mutate(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`/api/proxy/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `${method} ${path} failed (${res.status})`)
  return res.json()
}

function qs(params?: Record<string, unknown>): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

const api = {
  // Employees
  listEmployees: (params?: Record<string, unknown>) => get(`employees${qs(params)}`),
  getEmployee: (id: string) => get(`employees/${id}`),
  getEmployeeProfile: (id: string) => get(`employees/${id}/profile`),
  createEmployee: (body: unknown) => mutate('POST', 'employees', body),
  updateEmployee: (id: string, body: unknown) => mutate('PUT', `employees/${id}`, body),
  deleteEmployee: (id: string) => mutate('DELETE', `employees/${id}`),

  // Departments
  listDepartments: () => get('departments'),
  createDepartment: (body: unknown) => mutate('POST', 'departments', body),
  updateDepartment: (id: string, body: unknown) => mutate('PUT', `departments/${id}`, body),
  deleteDepartment: (id: string) => mutate('DELETE', `departments/${id}`),

  // Locations
  listLocations: () => get('locations'),
  createLocation: (body: unknown) => mutate('POST', 'locations', body),
  updateLocation: (id: string, body: unknown) => mutate('PUT', `locations/${id}`, body),
  deleteLocation: (id: string) => mutate('DELETE', `locations/${id}`),

  // Roles
  listRoles: () => get('roles'),
  createRole: (body: unknown) => mutate('POST', 'roles', body),
  updateRole: (id: string, body: unknown) => mutate('PUT', `roles/${id}`, body),
  deleteRole: (id: string) => mutate('DELETE', `roles/${id}`),

  // Scoring models
  listScoringModels: () => get('scoring-models'),
  getScoringModel: (id: string) => get(`scoring-models/${id}`),
  createScoringModel: (body: unknown) => mutate('POST', 'scoring-models', body),
  updateScoringModel: (id: string, body: unknown) => mutate('PUT', `scoring-models/${id}`, body),
  activateScoringModel: (id: string) => mutate('POST', `scoring-models/${id}/activate`),
  updateScoringFactors: (id: string, body: unknown) => mutate('PUT', `scoring-models/${id}/factors`, body),
  deleteScoringModel: (id: string) => mutate('DELETE', `scoring-models/${id}`),

  // Risk scores
  listRiskScores: () => get('risk-scores'),
  getEmployeeRiskHistory: (employeeId: string) => get(`risk-scores/employee/${employeeId}`),
  computeRiskScores: () => mutate('POST', 'risk-scores/compute'),
  whatIfRiskScore: (body: unknown) => mutate('POST', 'risk-scores/whatif', body),

  // Exits
  listExits: () => get('exits'),
  createExit: (body: unknown) => mutate('POST', 'exits', body),
  classifyExit: (id: string) => mutate('POST', `exits/${id}/classify`),
  overrideExit: (id: string, body: unknown) => mutate('PUT', `exits/${id}/override`, body),
  getRegrettableRate: () => get('exits/rate'),
  deleteExit: (id: string) => mutate('DELETE', `exits/${id}`),

  // Regrettability rules
  listRegrettabilityRules: () => get('regrettability-rules'),
  createRegrettabilityRule: (body: unknown) => mutate('POST', 'regrettability-rules', body),
  updateRegrettabilityRule: (id: string, body: unknown) => mutate('PUT', `regrettability-rules/${id}`, body),
  activateRegrettabilityRule: (id: string) => mutate('POST', `regrettability-rules/${id}/activate`),
  deleteRegrettabilityRule: (id: string) => mutate('DELETE', `regrettability-rules/${id}`),

  // Replacement costs
  listReplacementCostModels: () => get('replacement-costs/models'),
  createReplacementCostModel: (body: unknown) => mutate('POST', 'replacement-costs/models', body),
  updateReplacementCostModel: (id: string, body: unknown) => mutate('PUT', `replacement-costs/models/${id}`, body),
  computeReplacementCosts: () => mutate('POST', 'replacement-costs/compute'),
  getReplacementExposure: () => get('replacement-costs/exposure'),

  // Cohorts
  listCohorts: () => get('cohorts'),
  createCohort: (body: unknown) => mutate('POST', 'cohorts', body),
  deleteCohort: (id: string) => mutate('DELETE', `cohorts/${id}`),
  getCohortCurve: (id: string) => get(`cohorts/${id}/curve`),
  getCohortCurves: (dimension: string) => get(`cohorts/curves${qs({ dimension })}`),

  // Interventions
  listInterventions: () => get('interventions'),
  createIntervention: (body: unknown) => mutate('POST', 'interventions', body),
  updateIntervention: (id: string, body: unknown) => mutate('PUT', `interventions/${id}`, body),
  deleteIntervention: (id: string) => mutate('DELETE', `interventions/${id}`),

  // Optimizer
  listCandidates: () => get('optimizer/candidates'),
  generateCandidates: () => mutate('POST', 'optimizer/generate'),
  optimizeBudget: (body: unknown) => mutate('POST', 'optimizer/optimize', body),
  getCandidateRanking: () => get('optimizer/ranking'),

  // Scenarios
  listScenarios: () => get('scenarios'),
  getScenario: (id: string) => get(`scenarios/${id}`),
  createScenario: (body: unknown) => mutate('POST', 'scenarios', body),
  deleteScenario: (id: string) => mutate('DELETE', `scenarios/${id}`),
  compareScenarios: (ids: string) => get(`scenarios/compare${qs({ ids })}`),

  // Manager scorecards
  listManagerScorecards: () => get('manager-scorecards'),
  getManagerScorecard: (managerId: string) => get(`manager-scorecards/${managerId}`),
  computeManagerScorecards: () => mutate('POST', 'manager-scorecards/compute'),

  // Exit drivers
  listExitDrivers: () => get('exit-drivers'),
  createExitDriver: (body: unknown) => mutate('POST', 'exit-drivers', body),
  updateExitDriver: (id: string, body: unknown) => mutate('PUT', `exit-drivers/${id}`, body),
  deleteExitDriver: (id: string) => mutate('DELETE', `exit-drivers/${id}`),
  listDriverRecords: () => get('exit-drivers/records'),
  createDriverRecord: (body: unknown) => mutate('POST', 'exit-drivers/records', body),
  getDriverAggregate: () => get('exit-drivers/aggregate'),

  // Watchlist
  listWatchlist: () => get('watchlist'),
  addToWatchlist: (body: unknown) => mutate('POST', 'watchlist', body),
  updateWatchlist: (id: string, body: unknown) => mutate('PUT', `watchlist/${id}`, body),
  removeFromWatchlist: (id: string) => mutate('DELETE', `watchlist/${id}`),

  // Board packs
  listBoardPacks: () => get('board-packs'),
  getBoardPack: (id: string) => get(`board-packs/${id}`),
  createBoardPack: (body: unknown) => mutate('POST', 'board-packs', body),
  deleteBoardPack: (id: string) => mutate('DELETE', `board-packs/${id}`),

  // Benchmarks
  listBenchmarks: () => get('benchmarks'),
  updateBenchmark: (id: string, body: unknown) => mutate('PUT', `benchmarks/${id}`, body),
  resetBenchmarks: () => mutate('POST', 'benchmarks/reset'),

  // Alerts
  listAlerts: () => get('alerts'),
  evaluateAlerts: () => mutate('POST', 'alerts/evaluate'),
  markAlertRead: (id: string) => mutate('PUT', `alerts/${id}/read`),
  dismissAlert: (id: string) => mutate('DELETE', `alerts/${id}`),

  // Imports
  listImportJobs: () => get('imports'),
  importEmployees: (body: unknown) => mutate('POST', 'imports/employees', body),
  seedSample: () => mutate('POST', 'imports/seed-sample'),
  addEmployeeManual: (body: unknown) => mutate('POST', 'imports/employee', body),

  // Dashboard
  getDashboardSummary: () => get('dashboard/summary'),

  // Activity
  listActivity: (params?: Record<string, unknown>) => get(`activity${qs(params)}`),

  // Settings
  getSettings: () => get('settings'),
  updateSettings: (body: unknown) => mutate('PUT', 'settings', body),

  // Billing
  getBillingPlan: () => get('billing/plan'),
  startCheckout: () => mutate('POST', 'billing/checkout'),
  openPortal: () => mutate('POST', 'billing/portal'),
}

export default api
