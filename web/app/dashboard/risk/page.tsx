'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'

interface RiskRow {
  id: string
  employee_id: string
  full_name?: string
  email?: string | null
  department_name?: string | null
  role_title?: string | null
  level?: string | null
  manager_id?: string | null
  score: number
  band: string
  factor_breakdown?: Array<{ key: string; label: string; contribution: number; raw: number }>
  computed_at?: string
}

interface WhatIfResult {
  score: number
  band: string
  factor_breakdown: Array<{ key: string; label: string; contribution: number; raw: number }>
}

const WHATIF_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'compa_ratio', label: 'Compa-ratio', placeholder: 'e.g. 0.92' },
  { key: 'salary', label: 'Salary', placeholder: 'e.g. 120000' },
  { key: 'performance_rating', label: 'Performance rating', placeholder: 'e.g. 4.2' },
  { key: 'span_of_control', label: 'Span of control', placeholder: 'e.g. 6' },
  { key: 'succession_depth', label: 'Succession depth', placeholder: 'e.g. 1' },
]

function fmtScore(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toFixed(1)
}

export default function FlightRiskPage() {
  const [rows, setRows] = useState<RiskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [bandFilter, setBandFilter] = useState<string>('all')

  // What-if panel state
  const [selected, setSelected] = useState<RiskRow | null>(null)
  const [whatIfInputs, setWhatIfInputs] = useState<Record<string, string>>({})
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null)
  const [whatIfRunning, setWhatIfRunning] = useState(false)
  const [whatIfError, setWhatIfError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listRiskScores()
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load risk scores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function recompute() {
    setComputing(true)
    setNotice(null)
    setError(null)
    try {
      const res = await api.computeRiskScores()
      const count = res?.computed ?? (Array.isArray(res?.scores) ? res.scores.length : 0)
      setNotice(`Recomputed flight risk for ${count} employee${count === 1 ? '' : 's'}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recompute risk scores')
    } finally {
      setComputing(false)
    }
  }

  const bands = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => r.band && set.add(r.band))
    return Array.from(set)
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (bandFilter !== 'all' && (r.band ?? '').toLowerCase() !== bandFilter.toLowerCase()) return false
      if (!q) return true
      return (
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.department_name ?? '').toLowerCase().includes(q) ||
        (r.role_title ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, bandFilter])

  const summary = useMemo(() => {
    const total = rows.length
    const byBand: Record<string, number> = {}
    let scoreSum = 0
    rows.forEach((r) => {
      byBand[r.band] = (byBand[r.band] ?? 0) + 1
      scoreSum += r.score ?? 0
    })
    const high = (byBand['high'] ?? 0) + (byBand['critical'] ?? 0)
    return { total, byBand, avg: total ? scoreSum / total : 0, high }
  }, [rows])

  function openWhatIf(row: RiskRow) {
    setSelected(row)
    setWhatIfResult(null)
    setWhatIfError(null)
    setWhatIfInputs({})
  }

  function closeWhatIf() {
    setSelected(null)
    setWhatIfResult(null)
    setWhatIfError(null)
    setWhatIfInputs({})
  }

  async function runWhatIf() {
    if (!selected) return
    setWhatIfRunning(true)
    setWhatIfError(null)
    try {
      const overrides: Record<string, number> = {}
      for (const f of WHATIF_FIELDS) {
        const v = whatIfInputs[f.key]
        if (v !== undefined && v !== '') {
          const num = Number(v)
          if (!Number.isNaN(num)) overrides[f.key] = num
        }
      }
      const res: WhatIfResult = await api.whatIfRiskScore({
        employee_id: selected.employee_id,
        overrides,
      })
      setWhatIfResult(res)
    } catch (e) {
      setWhatIfError(e instanceof Error ? e.message : 'What-if failed')
    } finally {
      setWhatIfRunning(false)
    }
  }

  if (loading) return <PageSpinner label="Loading flight-risk ranking..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Flight Risk</h1>
          <p className="mt-1 text-sm text-slate-400">
            Ranked attrition risk per employee against the active scoring model.
          </p>
        </div>
        <Button onClick={recompute} disabled={computing}>
          {computing ? <Spinner label="Recomputing..." /> : 'Recompute risk'}
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Scored employees" value={summary.total} />
        <Stat label="Avg risk score" value={fmtScore(summary.avg)} tone="amber" />
        <Stat label="High + critical" value={summary.high} tone="rose" />
        <Stat
          label="Bands covered"
          value={bands.length}
          sub={bands.map((b) => `${b}: ${summary.byBand[b] ?? 0}`).join('  ·  ') || '—'}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, dept, role…"
              className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
            />
            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              <option value="all">All bands</option>
              {bands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-500">
            {filtered.length} of {rows.length} shown
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="No risk scores yet"
              description="Recompute risk to score every active employee against your active model."
              action={
                <Button onClick={recompute} disabled={computing}>
                  {computing ? 'Recomputing...' : 'Recompute risk'}
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches" description="Try a different search or band filter." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-12">#</TH>
                  <TH>Employee</TH>
                  <TH>Department</TH>
                  <TH>Role</TH>
                  <TH className="text-right">Score</TH>
                  <TH>Band</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r, i) => (
                  <TR key={r.id ?? r.employee_id}>
                    <TD className="text-slate-500">{i + 1}</TD>
                    <TD>
                      <div className="font-medium text-white">{r.full_name ?? r.employee_id}</div>
                      {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
                    </TD>
                    <TD className="text-slate-400">{r.department_name ?? '—'}</TD>
                    <TD className="text-slate-400">
                      {r.role_title ?? '—'}
                      {r.level ? <span className="ml-1 text-xs text-slate-600">({r.level})</span> : null}
                    </TD>
                    <TD className="text-right tabular-nums font-semibold text-amber-300">{fmtScore(r.score)}</TD>
                    <TD>
                      <Badge tone={bandTone(r.band)}>{r.band ?? '—'}</Badge>
                    </TD>
                    <TD className="text-right">
                      <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => openWhatIf(r)}>
                        What-if
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {selected && (
        <Card className="border-amber-500/30">
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                What-if · {selected.full_name ?? selected.employee_id}
              </h2>
              <p className="text-xs text-slate-500">
                Current score{' '}
                <span className="font-semibold text-amber-300">{fmtScore(selected.score)}</span>{' '}
                <Badge tone={bandTone(selected.band)}>{selected.band}</Badge> — try input overrides without
                persisting.
              </p>
            </div>
            <button onClick={closeWhatIf} className="text-slate-500 hover:text-white" aria-label="Close what-if">
              ✕
            </button>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {WHATIF_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    {f.label}
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={whatIfInputs[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setWhatIfInputs((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={runWhatIf} disabled={whatIfRunning}>
                {whatIfRunning ? <Spinner label="Computing..." /> : 'Run what-if'}
              </Button>
              <Button variant="ghost" onClick={() => { setWhatIfInputs({}); setWhatIfResult(null); setWhatIfError(null) }}>
                Reset inputs
              </Button>
            </div>

            {whatIfError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {whatIfError}
              </div>
            )}

            {whatIfResult && (
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Projected score</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-amber-300">
                      {fmtScore(whatIfResult.score)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Projected band</div>
                    <div className="mt-2">
                      <Badge tone={bandTone(whatIfResult.band)}>{whatIfResult.band}</Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Delta vs current</div>
                    <div
                      className={`mt-1 text-2xl font-bold tabular-nums ${
                        whatIfResult.score - selected.score <= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {whatIfResult.score - selected.score >= 0 ? '+' : ''}
                      {fmtScore(whatIfResult.score - selected.score)}
                    </div>
                  </div>
                </div>

                {Array.isArray(whatIfResult.factor_breakdown) && whatIfResult.factor_breakdown.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Factor contributions
                    </div>
                    <div className="space-y-2">
                      {whatIfResult.factor_breakdown.map((fb) => {
                        const max = Math.max(
                          ...whatIfResult.factor_breakdown.map((x) => Math.abs(x.contribution)),
                          1,
                        )
                        const pct = Math.min(100, (Math.abs(fb.contribution) / max) * 100)
                        return (
                          <div key={fb.key} className="flex items-center gap-3">
                            <div className="w-40 shrink-0 truncate text-sm text-slate-300">{fb.label ?? fb.key}</div>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="w-16 shrink-0 text-right tabular-nums text-sm text-slate-400">
                              {fmtScore(fb.contribution)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
