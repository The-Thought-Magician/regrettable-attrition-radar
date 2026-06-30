import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  import_jobs,
  employees,
  departments,
  locations,
  roles,
  exits,
  activity_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET / — list import jobs
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id') ?? ''
  const rows = await db
    .select()
    .from(import_jobs)
    .where(eq(import_jobs.user_id, userId))
    .orderBy(desc(import_jobs.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// Shared employee row schema (lenient — import data is often partial)
// ---------------------------------------------------------------------------
const employeeRowSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
  role_id: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  hire_date: z.string().optional().nullable(),
  role_start_date: z.string().optional().nullable(),
  last_raise_date: z.string().optional().nullable(),
  last_promotion_date: z.string().optional().nullable(),
  salary: z.number().optional().nullable(),
  compa_ratio: z.number().optional().nullable(),
  span_of_control: z.number().int().optional().nullable(),
  performance_rating: z.number().optional().nullable(),
  succession_depth: z.number().int().optional().nullable(),
  unique_skill: z.boolean().optional().nullable(),
  status: z.string().optional().nullable(),
  hire_cohort: z.string().optional().nullable(),
  attributes: z.record(z.unknown()).optional().nullable(),
})

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

function rowToInsert(userId: string, row: z.infer<typeof employeeRowSchema>): typeof employees.$inferInsert {
  return {
    user_id: userId,
    full_name: row.full_name,
    email: row.email ?? null,
    department_id: row.department_id ?? null,
    location_id: row.location_id ?? null,
    role_id: row.role_id ?? null,
    manager_id: row.manager_id ?? null,
    level: row.level ?? null,
    hire_date: toDate(row.hire_date),
    role_start_date: toDate(row.role_start_date),
    last_raise_date: toDate(row.last_raise_date),
    last_promotion_date: toDate(row.last_promotion_date),
    salary: row.salary ?? null,
    compa_ratio: row.compa_ratio ?? null,
    span_of_control: row.span_of_control ?? 0,
    performance_rating: row.performance_rating ?? null,
    succession_depth: row.succession_depth ?? 0,
    unique_skill: row.unique_skill ?? false,
    status: row.status ?? 'active',
    hire_cohort: row.hire_cohort ?? null,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
  }
}

// ---------------------------------------------------------------------------
// POST /employees — bulk import employees from parsed rows
// ---------------------------------------------------------------------------
router.post(
  '/employees',
  authMiddleware,
  zValidator('json', z.object({ rows: z.array(z.record(z.unknown())).min(1) })),
  async (c) => {
    const userId = getUserId(c)
    const { rows } = c.req.valid('json')

    let processed = 0
    let failed = 0
    const errors: string[] = []
    const inserts: typeof employees.$inferInsert[] = []

    rows.forEach((raw, idx) => {
      const parsed = employeeRowSchema.safeParse(raw)
      if (!parsed.success) {
        failed++
        errors.push(`Row ${idx + 1}: ${parsed.error.issues.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`)
        return
      }
      inserts.push(rowToInsert(userId, parsed.data))
      processed++
    })

    if (inserts.length > 0) {
      // Insert in chunks to stay within statement limits.
      const CHUNK = 100
      for (let i = 0; i < inserts.length; i += CHUNK) {
        await db.insert(employees).values(inserts.slice(i, i + CHUNK))
      }
    }

    const [job] = await db
      .insert(import_jobs)
      .values({
        user_id: userId,
        kind: 'employees',
        status: failed > 0 && processed === 0 ? 'failed' : 'completed',
        rows_processed: processed,
        rows_failed: failed,
        errors: errors.slice(0, 100),
      })
      .returning()

    await db.insert(activity_log).values({
      user_id: userId,
      entity_type: 'import_job',
      entity_id: job.id,
      action: 'import_employees',
      detail: { processed, failed },
    })

    return c.json(job, 201)
  },
)

// ---------------------------------------------------------------------------
// POST /seed-sample — generate the 200-person sample org
//   (departments, locations, roles, employees, some exits)
// ---------------------------------------------------------------------------

// Deterministic PRNG so the sample org is reproducible per call.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DEPT_DEFS = [
  { name: 'Engineering', code: 'ENG' },
  { name: 'Product', code: 'PRD' },
  { name: 'Sales', code: 'SAL' },
  { name: 'Marketing', code: 'MKT' },
  { name: 'Customer Success', code: 'CS' },
  { name: 'Finance', code: 'FIN' },
  { name: 'People Ops', code: 'HR' },
  { name: 'Operations', code: 'OPS' },
]

const LOC_DEFS = [
  { name: 'San Francisco', region: 'West', country: 'USA' },
  { name: 'New York', region: 'East', country: 'USA' },
  { name: 'Austin', region: 'South', country: 'USA' },
  { name: 'London', region: 'EMEA', country: 'UK' },
  { name: 'Berlin', region: 'EMEA', country: 'Germany' },
  { name: 'Remote', region: 'Global', country: 'USA' },
]

const ROLE_DEFS = [
  { title: 'Software Engineer', level: 'L3', role_family: 'Engineering', band_midpoint: 145000, is_critical: false },
  { title: 'Senior Software Engineer', level: 'L4', role_family: 'Engineering', band_midpoint: 185000, is_critical: true },
  { title: 'Staff Engineer', level: 'L5', role_family: 'Engineering', band_midpoint: 235000, is_critical: true },
  { title: 'Engineering Manager', level: 'M2', role_family: 'Engineering', band_midpoint: 220000, is_critical: true },
  { title: 'Product Manager', level: 'L4', role_family: 'Product', band_midpoint: 170000, is_critical: true },
  { title: 'Account Executive', level: 'L3', role_family: 'Sales', band_midpoint: 130000, is_critical: false },
  { title: 'Sales Manager', level: 'M2', role_family: 'Sales', band_midpoint: 175000, is_critical: true },
  { title: 'Marketing Specialist', level: 'L2', role_family: 'Marketing', band_midpoint: 95000, is_critical: false },
  { title: 'Customer Success Manager', level: 'L3', role_family: 'Customer Success', band_midpoint: 110000, is_critical: false },
  { title: 'Financial Analyst', level: 'L3', role_family: 'Finance', band_midpoint: 105000, is_critical: false },
  { title: 'Recruiter', level: 'L3', role_family: 'People Ops', band_midpoint: 100000, is_critical: false },
  { title: 'Operations Analyst', level: 'L2', role_family: 'Operations', band_midpoint: 90000, is_critical: false },
]

const FIRST = ['Avery', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Sage', 'Drew', 'Reese', 'Skyler', 'Cameron', 'Hayden', 'Emerson', 'Rowan', 'Finley', 'Dakota', 'Parker', 'Logan', 'Charlie', 'Elliot', 'Marley', 'Sasha', 'Kai', 'Noor']
const LAST = ['Patel', 'Nguyen', 'Garcia', 'Smith', 'Johnson', 'Kim', 'Lopez', 'Brown', 'Davis', 'Martinez', 'Lee', 'Walker', 'Hall', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Adams', 'Baker', 'Hill', 'Rivera', 'Cooper', 'Reed']

router.post('/seed-sample', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rand = mulberry32(0x9e3779b1)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo)

  // 1. Departments.
  const insertedDepts = await db
    .insert(departments)
    .values(DEPT_DEFS.map((d) => ({ user_id: userId, name: d.name, code: d.code })))
    .returning()

  // 2. Locations.
  const insertedLocs = await db
    .insert(locations)
    .values(LOC_DEFS.map((l) => ({ user_id: userId, name: l.name, region: l.region, country: l.country })))
    .returning()

  // 3. Roles.
  const insertedRoles = await db
    .insert(roles)
    .values(
      ROLE_DEFS.map((r) => ({
        user_id: userId,
        title: r.title,
        level: r.level,
        role_family: r.role_family,
        band_midpoint: r.band_midpoint,
        is_critical: r.is_critical,
      })),
    )
    .returning()

  const roleByFamily = new Map<string, typeof insertedRoles>()
  for (const r of insertedRoles) {
    const list = roleByFamily.get(r.role_family) ?? []
    list.push(r)
    roleByFamily.set(r.role_family, list)
  }
  const familyForDept: Record<string, string> = {
    Engineering: 'Engineering',
    Product: 'Product',
    Sales: 'Sales',
    Marketing: 'Marketing',
    'Customer Success': 'Customer Success',
    Finance: 'Finance',
    'People Ops': 'People Ops',
    Operations: 'Operations',
  }

  // 4. Employees — 200 total. Build managers first (one per dept), then ICs.
  const now = Date.now()
  const DAY = 86_400_000
  const employeeRows: typeof employees.$inferInsert[] = []

  // Managers: one per department.
  const managerIndexByDept: Record<string, number> = {}
  insertedDepts.forEach((dept, di) => {
    const fam = familyForDept[dept.name] ?? 'Operations'
    const famRoles = roleByFamily.get(fam) ?? insertedRoles
    const mgrRole = famRoles.find((r) => r.level.startsWith('M')) ?? famRoles[famRoles.length - 1]
    const hireYearsAgo = between(3, 8)
    employeeRows.push({
      user_id: userId,
      full_name: `${pick(FIRST)} ${pick(LAST)}`,
      email: `manager${di}@sample.example`,
      department_id: dept.id,
      location_id: pick(insertedLocs).id,
      role_id: mgrRole.id,
      manager_id: null,
      level: mgrRole.level,
      hire_date: new Date(now - hireYearsAgo * 365 * DAY),
      role_start_date: new Date(now - between(1, hireYearsAgo) * 365 * DAY),
      last_raise_date: new Date(now - between(0.2, 1.5) * 365 * DAY),
      last_promotion_date: new Date(now - between(1, 3) * 365 * DAY),
      salary: Math.round((mgrRole.band_midpoint ?? 180000) * between(0.95, 1.15)),
      compa_ratio: Number(between(0.92, 1.12).toFixed(2)),
      span_of_control: 0, // filled after we know team sizes
      performance_rating: Number(between(3.2, 4.8).toFixed(1)),
      succession_depth: Math.floor(between(0, 3)),
      unique_skill: rand() < 0.2,
      status: 'active',
      hire_cohort: `${new Date(now - hireYearsAgo * 365 * DAY).getFullYear()}`,
      attributes: { seeded: true, is_manager: true },
    })
    managerIndexByDept[dept.id] = employeeRows.length - 1
  })

  const managerCount = employeeRows.length
  const icTarget = 200 - managerCount

  for (let i = 0; i < icTarget; i++) {
    const dept = pick(insertedDepts)
    const fam = familyForDept[dept.name] ?? 'Operations'
    const famRoles = (roleByFamily.get(fam) ?? insertedRoles).filter((r) => !r.level.startsWith('M'))
    const role = famRoles.length > 0 ? pick(famRoles) : pick(insertedRoles)
    const hireYearsAgo = between(0.1, 6)
    const compa = Number(between(0.78, 1.18).toFixed(2))
    const perf = Number(between(2.4, 4.9).toFixed(1))
    employeeRows.push({
      user_id: userId,
      full_name: `${pick(FIRST)} ${pick(LAST)}`,
      email: `employee${i}@sample.example`,
      department_id: dept.id,
      location_id: pick(insertedLocs).id,
      role_id: role.id,
      manager_id: null, // resolved after manager ids are known
      level: role.level,
      hire_date: new Date(now - hireYearsAgo * 365 * DAY),
      role_start_date: new Date(now - between(0.1, hireYearsAgo) * 365 * DAY),
      last_raise_date: new Date(now - between(0.1, 2.5) * 365 * DAY),
      last_promotion_date: rand() < 0.6 ? new Date(now - between(0.5, 4) * 365 * DAY) : null,
      salary: Math.round((role.band_midpoint ?? 110000) * compa),
      compa_ratio: compa,
      span_of_control: 0,
      performance_rating: perf,
      succession_depth: Math.floor(between(0, 3)),
      unique_skill: rand() < 0.18,
      status: 'active',
      hire_cohort: `${new Date(now - hireYearsAgo * 365 * DAY).getFullYear()}`,
      attributes: {
        seeded: true,
        is_manager: false,
        _deptId: dept.id, // transient, stripped before insert
      },
    })
  }

  // Insert employees in chunks, then patch manager_id + span_of_control.
  const CHUNK = 100
  const insertedEmployees: typeof employees.$inferSelect[] = []
  for (let i = 0; i < employeeRows.length; i += CHUNK) {
    const chunk = employeeRows.slice(i, i + CHUNK).map((r) => {
      const attrs = { ...(r.attributes as Record<string, unknown>) }
      delete (attrs as Record<string, unknown>)._deptId
      return { ...r, attributes: attrs }
    })
    const out = await db.insert(employees).values(chunk).returning()
    insertedEmployees.push(...out)
  }

  // Map dept -> manager employee row.
  const managerEmployeeByDept = new Map<string, typeof insertedEmployees[number]>()
  insertedDepts.forEach((dept) => {
    const idx = managerIndexByDept[dept.id]
    if (idx !== undefined) managerEmployeeByDept.set(dept.id, insertedEmployees[idx])
  })

  // Assign each IC its department manager; count team sizes.
  const spanByManager = new Map<string, number>()
  for (let i = managerCount; i < insertedEmployees.length; i++) {
    const emp = insertedEmployees[i]
    const deptId = emp.department_id
    const mgr = deptId ? managerEmployeeByDept.get(deptId) : undefined
    if (mgr && mgr.id !== emp.id) {
      await db.update(employees).set({ manager_id: mgr.id }).where(eq(employees.id, emp.id))
      spanByManager.set(mgr.id, (spanByManager.get(mgr.id) ?? 0) + 1)
    }
  }
  for (const [mgrId, span] of spanByManager) {
    await db.update(employees).set({ span_of_control: span }).where(eq(employees.id, mgrId))
  }

  // 5. Exits — mark ~12% of ICs as departed (mix of regrettable / not).
  const exitRows: typeof exits.$inferInsert[] = []
  const icEmployees = insertedEmployees.slice(managerCount)
  const exitCount = Math.floor(icEmployees.length * 0.12)
  const shuffled = [...icEmployees].sort(() => rand() - 0.5)
  for (let i = 0; i < exitCount; i++) {
    const emp = shuffled[i]
    const exitDaysAgo = Math.floor(between(15, 540))
    // Regrettable when high performer with strong compa or unique skill.
    const perf = emp.performance_rating ?? 3
    const regrettable = perf >= 3.8 || emp.unique_skill === true
    const score = Math.round(
      Math.min(100, perf * 12 + (emp.unique_skill ? 25 : 0) + (emp.succession_depth === 0 ? 15 : 0)),
    )
    const exitType = rand() < 0.85 ? 'voluntary' : 'involuntary'
    exitRows.push({
      user_id: userId,
      employee_id: emp.id,
      exit_type: exitType,
      exit_date: new Date(now - exitDaysAgo * DAY),
      is_regrettable: exitType === 'voluntary' && regrettable,
      regrettable_score: score,
      classification_reason:
        exitType === 'voluntary' && regrettable
          ? `High performer (${perf}) with thin succession — regrettable`
          : 'Below regrettability threshold or involuntary',
      manually_overridden: false,
      notes: 'Seeded sample exit',
    })
    await db.update(employees).set({ status: 'departed' }).where(eq(employees.id, emp.id))
  }
  if (exitRows.length > 0) {
    await db.insert(exits).values(exitRows)
  }

  const [job] = await db
    .insert(import_jobs)
    .values({
      user_id: userId,
      kind: 'seed_sample',
      status: 'completed',
      rows_processed: insertedEmployees.length,
      rows_failed: 0,
      errors: [],
    })
    .returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'import_job',
    entity_id: job.id,
    action: 'seed_sample',
    detail: {
      departments: insertedDepts.length,
      locations: insertedLocs.length,
      roles: insertedRoles.length,
      employees: insertedEmployees.length,
      exits: exitRows.length,
    },
  })

  return c.json(job, 201)
})

// ---------------------------------------------------------------------------
// POST /employee — manual single-employee add (delegates to employee create)
// ---------------------------------------------------------------------------
router.post('/employee', authMiddleware, zValidator('json', employeeRowSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [emp] = await db.insert(employees).values(rowToInsert(userId, body)).returning()

  await db.insert(activity_log).values({
    user_id: userId,
    entity_type: 'employee',
    entity_id: emp.id,
    action: 'manual_add',
    detail: { full_name: emp.full_name },
  })

  return c.json(emp, 201)
})

export default router
