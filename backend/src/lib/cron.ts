import { CronExpressionParser } from 'cron-parser'

// ---------------------------------------------------------------------------
// Schedule engine — pure, deterministic, self-contained.
//
// Three schedule "kinds" are supported:
//   - 'cron'   — a standard 5/6-field cron expression, evaluated in a timezone
//   - 'rate'   — a human "every N minutes|hours|days" expression
//   - 'oneoff' — a single ISO instant (the expr is the ISO string)
//
// All firing instants are returned as ISO-8601 UTC strings (…Z).
// ---------------------------------------------------------------------------

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface Job {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string
}

export interface CollisionWindow {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageWindow {
  start: string
  end: string
  jobId?: string
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// Rate expression parsing — "every N minutes|hours|days"
// ---------------------------------------------------------------------------

interface RateSpec {
  intervalMs: number
  n: number
  unit: 'minutes' | 'hours' | 'days'
}

function parseRate(expr: string): RateSpec | null {
  const m = /^\s*every\s+(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days)\s*$/i.exec(expr)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const raw = m[2].toLowerCase()
  if (raw.startsWith('min')) return { intervalMs: n * MINUTE_MS, n, unit: 'minutes' }
  if (raw.startsWith('hr') || raw.startsWith('hour')) return { intervalMs: n * HOUR_MS, n, unit: 'hours' }
  return { intervalMs: n * DAY_MS, n, unit: 'days' }
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  if (typeof expr !== 'string' || expr.trim() === '') {
    return { valid: false, error: 'Expression is empty' }
  }
  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(expr)
      return { valid: true }
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  if (kind === 'rate') {
    const spec = parseRate(expr)
    if (!spec) return { valid: false, error: 'Expected "every N minutes|hours|days"' }
    return { valid: true }
  }
  if (kind === 'oneoff') {
    const t = Date.parse(expr)
    if (Number.isNaN(t)) return { valid: false, error: 'Not a valid ISO timestamp' }
    return { valid: true }
  }
  return { valid: false, error: `Unknown schedule kind: ${kind}` }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function describeExpression(kind: ScheduleKind, expr: string, timezone = 'UTC'): string {
  const v = validateExpression(kind, expr)
  if (!v.valid) return `Invalid expression: ${v.error}`

  if (kind === 'rate') {
    const spec = parseRate(expr)!
    return `Every ${spec.n} ${spec.n === 1 ? spec.unit.replace(/s$/, '') : spec.unit}`
  }

  if (kind === 'oneoff') {
    return `Once at ${new Date(expr).toISOString()}`
  }

  // cron
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return `Cron "${expr}" (${timezone})`
  const [min, hour, dom, mon, dow] = parts
  const segs: string[] = []

  if (min === '*' && hour === '*') {
    segs.push('every minute')
  } else if (min.startsWith('*/')) {
    segs.push(`every ${min.slice(2)} minutes`)
  } else if (hour === '*') {
    segs.push(`at minute ${min} of every hour`)
  } else if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    segs.push(`at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`)
  } else {
    segs.push(`minute ${min}, hour ${hour}`)
  }

  if (dow !== '*') {
    const days = dow.split(',').map((d) => {
      const n = parseInt(d, 10)
      return Number.isFinite(n) ? (DOW[n % 7] ?? d) : d
    })
    segs.push(`on ${days.join(', ')}`)
  }
  if (dom !== '*') segs.push(`on day-of-month ${dom}`)
  if (mon !== '*') segs.push(`in month ${mon}`)

  return `${segs.join(' ')} (${timezone})`
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
  fromISO?: string,
  count = 10,
): string[] {
  const v = validateExpression(kind, expr)
  if (!v.valid) return []
  const n = Math.max(0, Math.min(count, 1000))
  if (n === 0) return []

  const from = fromISO ? new Date(fromISO) : new Date()
  if (Number.isNaN(from.getTime())) return []

  if (kind === 'cron') {
    try {
      const it = CronExpressionParser.parse(expr, { tz: timezone, currentDate: from })
      const out: string[] = []
      for (let i = 0; i < n; i++) {
        out.push(it.next().toDate().toISOString())
      }
      return out
    } catch {
      return []
    }
  }

  if (kind === 'rate') {
    const spec = parseRate(expr)!
    const out: string[] = []
    let t = from.getTime() + spec.intervalMs
    for (let i = 0; i < n; i++) {
      out.push(new Date(t).toISOString())
      t += spec.intervalMs
    }
    return out
  }

  // oneoff
  const at = new Date(expr)
  if (at.getTime() > from.getTime()) return [at.toISOString()]
  return []
}

// ---------------------------------------------------------------------------
// computeCollisions
//
// Expand each job's firings across the horizon, bucket by UTC minute, then
// flag any minute where total concurrency >= threshold, OR where >= 2 jobs
// share the same resourceId.
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: Job[],
  opts: { horizonDays?: number; threshold?: number } = {},
): CollisionWindow[] {
  const horizonDays = opts.horizonDays ?? 7
  const threshold = opts.threshold ?? 2
  const now = Date.now()
  const horizonEnd = now + horizonDays * DAY_MS
  const fromISO = new Date(now).toISOString()

  // minuteKey -> { jobIds: Set, resourceCount: Map<resourceId,Set<jobId>> }
  const buckets = new Map<string, { jobIds: Set<string>; resources: Map<string, Set<string>> }>()

  for (const job of jobs) {
    const firings = expandJobFirings(job, fromISO, horizonEnd, 5000)
    for (const f of firings) {
      const key = minuteKey(f)
      let b = buckets.get(key)
      if (!b) {
        b = { jobIds: new Set(), resources: new Map() }
        buckets.set(key, b)
      }
      b.jobIds.add(job.id)
      if (job.resourceId) {
        let rs = b.resources.get(job.resourceId)
        if (!rs) { rs = new Set(); b.resources.set(job.resourceId, rs) }
        rs.add(job.id)
      }
    }
  }

  const windows: CollisionWindow[] = []
  for (const [key, b] of buckets) {
    const concurrency = b.jobIds.size
    let sharedResource: string | undefined
    for (const [rid, set] of b.resources) {
      if (set.size >= 2) { sharedResource = rid; break }
    }
    const flagged = concurrency >= threshold || sharedResource !== undefined
    if (!flagged) continue

    const start = new Date(parseInt(key, 10) * MINUTE_MS)
    const end = new Date(start.getTime() + MINUTE_MS)
    let severity: CollisionWindow['severity'] = 'low'
    if (concurrency >= threshold * 2) severity = 'high'
    else if (concurrency >= threshold) severity = 'medium'
    if (sharedResource && severity === 'low') severity = 'medium'

    windows.push({
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      jobIds: [...b.jobIds].sort(),
      severity,
      resourceId: sharedResource,
    })
  }

  windows.sort((a, b) => a.windowStart.localeCompare(b.windowStart))
  return windows
}

function minuteKey(iso: string): string {
  return String(Math.floor(new Date(iso).getTime() / MINUTE_MS))
}

function expandJobFirings(job: Job, fromISO: string, horizonEndMs: number, cap: number): string[] {
  const out: string[] = []
  if (job.kind === 'cron') {
    try {
      const it = CronExpressionParser.parse(job.expr, {
        tz: job.timezone ?? 'UTC',
        currentDate: new Date(fromISO),
      })
      for (let i = 0; i < cap; i++) {
        const next = it.next().toDate()
        if (next.getTime() > horizonEndMs) break
        out.push(next.toISOString())
      }
    } catch {
      return out
    }
  } else if (job.kind === 'rate') {
    const spec = parseRate(job.expr)
    if (!spec) return out
    let t = new Date(fromISO).getTime() + spec.intervalMs
    let i = 0
    while (t <= horizonEndMs && i < cap) {
      out.push(new Date(t).toISOString())
      t += spec.intervalMs
      i++
    }
  } else {
    const at = new Date(job.expr)
    if (at.getTime() > new Date(fromISO).getTime() && at.getTime() <= horizonEndMs) {
      out.push(at.toISOString())
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// loadHeatmap — firings per UTC hour bucket across the horizon
// ---------------------------------------------------------------------------

export function loadHeatmap(jobs: Job[], opts: { horizonDays?: number } = {}): HeatmapBucket[] {
  const horizonDays = opts.horizonDays ?? 7
  const now = Date.now()
  const horizonEnd = now + horizonDays * DAY_MS
  const fromISO = new Date(now).toISOString()

  const counts = new Map<string, number>()
  for (const job of jobs) {
    const firings = expandJobFirings(job, fromISO, horizonEnd, 5000)
    for (const f of firings) {
      const d = new Date(f)
      d.setUTCMinutes(0, 0, 0)
      const key = d.toISOString()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

// ---------------------------------------------------------------------------
// dstTraps — detect double-fire / skip / ambiguous windows caused by DST
// offset changes in the target timezone across the window.
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
  fromISO?: string,
  days = 30,
): DstTrap[] {
  const v = validateExpression(kind, expr)
  if (!v.valid) return []

  const from = fromISO ? new Date(fromISO) : new Date()
  if (Number.isNaN(from.getTime())) return []
  const horizonEnd = from.getTime() + days * DAY_MS

  // 1. Find DST transition instants by scanning hour-by-hour for offset changes.
  const transitions: Array<{ atMs: number; before: number; after: number }> = []
  let prevOffset = tzOffsetMinutes(from, timezone)
  for (let t = from.getTime() + HOUR_MS; t <= horizonEnd; t += HOUR_MS) {
    const off = tzOffsetMinutes(new Date(t), timezone)
    if (off !== prevOffset) {
      transitions.push({ atMs: t, before: prevOffset, after: off })
      prevOffset = off
    }
  }
  if (transitions.length === 0) return []

  // 2. Collect firings in the window for this single schedule.
  const job: Job = { id: '_', kind, expr, timezone }
  const firings = expandJobFirings(job, from.toISOString(), horizonEnd, 5000)

  const traps: DstTrap[] = []
  for (const tr of transitions) {
    // Spring-forward (offset increases): local clock skips an hour → 'skip'.
    // Fall-back (offset decreases): local clock repeats an hour → 'double_fire'/'ambiguous'.
    const windowStart = tr.atMs - HOUR_MS
    const windowEnd = tr.atMs + HOUR_MS
    const inWindow = firings.filter((f) => {
      const ms = new Date(f).getTime()
      return ms >= windowStart && ms <= windowEnd
    })

    if (tr.after > tr.before) {
      // spring forward — flag firings that target the skipped local hour
      for (const f of inWindow) {
        traps.push({ type: 'skip', atLocal: localString(f, timezone), atUtc: f })
      }
    } else {
      // fall back — the repeated local hour is ambiguous; >1 firing = double fire
      if (inWindow.length >= 2) {
        for (const f of inWindow) {
          traps.push({ type: 'double_fire', atLocal: localString(f, timezone), atUtc: f })
        }
      } else {
        for (const f of inWindow) {
          traps.push({ type: 'ambiguous', atLocal: localString(f, timezone), atUtc: f })
        }
      }
    }
  }

  traps.sort((a, b) => a.atUtc.localeCompare(b.atUtc))
  return traps
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  // Offset (in minutes) of the timezone relative to UTC at this instant.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10)
  let hour = map.hour
  if (hour === 24) hour = 0
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second)
  return Math.round((asUTC - date.getTime()) / MINUTE_MS)
}

function localString(iso: string, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(new Date(iso))
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  let hh = map.hour
  if (hh === '24') hh = '00'
  return `${map.year}-${map.month}-${map.day}T${hh}:${map.minute}:${map.second}`
}

// ---------------------------------------------------------------------------
// coverageGaps — given desired coverage windows and the jobs that should
// satisfy them, find stretches of the horizon with no firing.
// ---------------------------------------------------------------------------

export function coverageGaps(
  windows: CoverageWindow[],
  jobs: Job[],
  opts: { horizonDays?: number; maxGapMinutes?: number } = {},
): CoverageGap[] {
  const horizonDays = opts.horizonDays ?? 7
  const maxGapMinutes = opts.maxGapMinutes ?? 60
  const now = Date.now()
  const horizonEnd = now + horizonDays * DAY_MS
  const fromISO = new Date(now).toISOString()

  // All firing instants across all jobs, sorted.
  const firings: number[] = []
  for (const job of jobs) {
    for (const f of expandJobFirings(job, fromISO, horizonEnd, 5000)) {
      firings.push(new Date(f).getTime())
    }
  }
  firings.sort((a, b) => a - b)

  // Reference coverage intervals: explicit windows if given, else whole horizon.
  const intervals = windows.length > 0
    ? windows
        .map((w) => ({ start: new Date(w.start).getTime(), end: new Date(w.end).getTime() }))
        .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    : [{ start: now, end: horizonEnd }]

  const gaps: CoverageGap[] = []
  for (const iv of intervals) {
    const inside = firings.filter((t) => t >= iv.start && t <= iv.end)
    let cursor = iv.start
    const points = [...inside, iv.end]
    for (const p of points) {
      const gapMs = p - cursor
      if (gapMs > maxGapMinutes * MINUTE_MS) {
        gaps.push({
          gapStart: new Date(cursor).toISOString(),
          gapEnd: new Date(p).toISOString(),
          durationMinutes: Math.round(gapMs / MINUTE_MS),
        })
      }
      cursor = Math.max(cursor, p)
    }
  }

  gaps.sort((a, b) => a.gapStart.localeCompare(b.gapStart))
  return gaps
}

// ---------------------------------------------------------------------------
// autoSpread — for jobs participating in collisions, suggest a staggered
// expression that shifts them off the contested minute.
// ---------------------------------------------------------------------------

export function autoSpread(
  jobs: Job[],
  opts: { threshold?: number; horizonDays?: number } = {},
): SpreadSuggestion[] {
  const threshold = opts.threshold ?? 2
  const collisions = computeCollisions(jobs, { horizonDays: opts.horizonDays ?? 7, threshold })
  if (collisions.length === 0) return []

  // Count how many collision windows each job is implicated in.
  const involvement = new Map<string, number>()
  for (const w of collisions) {
    for (const id of w.jobIds) involvement.set(id, (involvement.get(id) ?? 0) + 1)
  }

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const ranked = [...involvement.entries()].sort((a, b) => b[1] - a[1])

  const suggestions: SpreadSuggestion[] = []
  let shift = 1
  // Keep the least-involved job on its slot; nudge the rest by increasing minute offsets.
  for (let i = 0; i < ranked.length; i++) {
    const [jobId, hits] = ranked[i]
    const job = jobById.get(jobId)
    if (!job) continue
    if (i === ranked.length - 1 && ranked.length > 1) continue // leave one anchored

    const suggested = shiftExpression(job, shift)
    if (suggested && suggested !== job.expr) {
      suggestions.push({
        jobId,
        suggestedExpr: suggested,
        reason: `Involved in ${hits} collision window${hits === 1 ? '' : 's'}; shift by ${shift} minute${shift === 1 ? '' : 's'} to de-conflict`,
      })
      shift += 1
    }
  }

  return suggestions
}

function shiftExpression(job: Job, minutes: number): string | null {
  if (job.kind === 'cron') {
    const parts = job.expr.trim().split(/\s+/)
    if (parts.length < 5) return null
    const min = parts[0]
    if (/^\d+$/.test(min)) {
      parts[0] = String((parseInt(min, 10) + minutes) % 60)
      return parts.join(' ')
    }
    // For '*' or step minutes, pin to an explicit offset minute.
    if (min === '*' || min.startsWith('*/')) {
      parts[0] = String(minutes % 60)
      return parts.join(' ')
    }
    return null
  }
  if (job.kind === 'rate') {
    // Rate jobs cannot be phase-shifted by changing the expression alone; no-op.
    return null
  }
  if (job.kind === 'oneoff') {
    const at = new Date(job.expr)
    if (Number.isNaN(at.getTime())) return null
    return new Date(at.getTime() + minutes * MINUTE_MS).toISOString()
  }
  return null
}
