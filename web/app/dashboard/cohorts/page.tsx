'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'

interface Cohort {
  id: string
  name: string
  dimension: string
  filters?: Record<string, unknown>
  created_at?: string
}

interface CurvePoint {
  month: number
  retention: number
  attrition?: number
}

interface CohortCurve {
  points: CurvePoint[]
  retention: { m3: number; m6: number; m12: number; m18: number; m24: number }
  earlyFlag: boolean
}

interface CurveSeries {
  cohortId?: string
  name: string
  points: CurvePoint[]
}

interface CohortCurves {
  dimension: string
  series: CurveSeries[]
}

const DIMENSIONS = ['department', 'location', 'role_family', 'hire_cohort', 'manager', 'level']

const SERIES_COLORS = ['#fbbf24', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb7185', '#fb923c', '#22d3ee']

function pct(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const v = n <= 1 ? n * 100 : n
  return `${v.toFixed(1)}%`
}

function normRetention(n: number | undefined): number {
  if (n === undefined || n === null || Number.isNaN(n)) return 0
  return n <= 1 ? n * 100 : n
}

// Single-cohort survival/attrition SVG curve
function SurvivalChart({ points }: { points: CurvePoint[] }) {
  const W = 640
  const H = 240
  const padL = 44
  const padB = 28
  const padT = 16
  const padR = 16
  const sorted = [...points].sort((a, b) => a.month - b.month)
  if (sorted.length === 0) return <div className="text-sm text-slate-500">No curve points.</div>
  const maxMonth = Math.max(...sorted.map((p) => p.month), 1)
  const xFor = (m: number) => padL + (m / maxMonth) * (W - padL - padR)
  const yFor = (r: number) => padT + (1 - normRetention(r) / 100) * (H - padT - padB)

  const line = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.month).toFixed(1)},${yFor(p.retention).toFixed(1)}`).join(' ')
  const area = `${line} L${xFor(sorted[sorted.length - 1].month).toFixed(1)},${(H - padB).toFixed(1)} L${xFor(sorted[0].month).toFixed(1)},${(H - padB).toFixed(1)} Z`

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label="Survival curve">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={yFor(g)} y2={yFor(g)} stroke="#1e293b" strokeWidth={1} />
            <text x={padL - 8} y={yFor(g) + 4} textAnchor="end" fontSize={10} fill="#64748b">{g}%</text>
          </g>
        ))}
        {sorted.map((p) => (
          <text key={p.month} x={xFor(p.month)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="#64748b">
            {p.month}m
          </text>
        ))}
        <path d={area} fill="#fbbf2422" />
        <path d={line} fill="none" stroke="#fbbf24" strokeWidth={2} />
        {sorted.map((p) => (
          <circle key={p.month} cx={xFor(p.month)} cy={yFor(p.retention)} r={3} fill="#fbbf24" />
        ))}
      </svg>
    </div>
  )
}

// Multi-series comparison curve
function ComparisonChart({ series }: { series: CurveSeries[] }) {
  const W = 720
  const H = 280
  const padL = 44
  const padB = 28
  const padT = 16
  const padR = 16
  const allMonths = series.flatMap((s) => s.points.map((p) => p.month))
  if (allMonths.length === 0) return <div className="text-sm text-slate-500">No comparison data.</div>
  const maxMonth = Math.max(...allMonths, 1)
  const xFor = (m: number) => padL + (m / maxMonth) * (W - padL - padR)
  const yFor = (r: number) => padT + (1 - normRetention(r) / 100) * (H - padT - padB)

  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Comparison curves">
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={padL} x2={W - padR} y1={yFor(g)} y2={yFor(g)} stroke="#1e293b" strokeWidth={1} />
              <text x={padL - 8} y={yFor(g) + 4} textAnchor="end" fontSize={10} fill="#64748b">{g}%</text>
            </g>
          ))}
          {series.map((s, si) => {
            const sorted = [...s.points].sort((a, b) => a.month - b.month)
            if (sorted.length === 0) return null
            const line = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.month).toFixed(1)},${yFor(p.retention).toFixed(1)}`).join(' ')
            const color = SERIES_COLORS[si % SERIES_COLORS.length]
            return (
              <g key={s.cohortId ?? s.name + si}>
                <path d={line} fill="none" stroke={color} strokeWidth={2} />
                {sorted.map((p) => (
                  <circle key={p.month} cx={xFor(p.month)} cy={yFor(p.retention)} r={2.5} fill={color} />
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {series.map((s, si) => (
          <div key={s.cohortId ?? s.name + si} className="flex items-center gap-2 text-xs text-slate-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [dimFilter, setDimFilter] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [dimension, setDimension] = useState('department')
  const [filtersText, setFiltersText] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [curve, setCurve] = useState<CohortCurve | null>(null)
  const [curveLoading, setCurveLoading] = useState(false)
  const [curveErr, setCurveErr] = useState<string | null>(null)

  const [compareDim, setCompareDim] = useState('department')
  const [curves, setCurves] = useState<CohortCurves | null>(null)
  const [curvesLoading, setCurvesLoading] = useState(false)
  const [curvesErr, setCurvesErr] = useState<string | null>(null)

  async function loadCohorts() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listCohorts()
      setCohorts(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cohorts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCohorts()
  }, [])

  async function loadCurve(id: string) {
    setSelectedId(id)
    setCurveLoading(true)
    setCurveErr(null)
    setCurve(null)
    try {
      const data = await api.getCohortCurve(id)
      setCurve(data)
    } catch (e) {
      setCurveErr(e instanceof Error ? e.message : 'Failed to load curve')
    } finally {
      setCurveLoading(false)
    }
  }

  async function loadCurves(dim: string) {
    setCompareDim(dim)
    setCurvesLoading(true)
    setCurvesErr(null)
    try {
      const data = await api.getCohortCurves(dim)
      setCurves(data)
    } catch (e) {
      setCurvesErr(e instanceof Error ? e.message : 'Failed to load comparison')
    } finally {
      setCurvesLoading(false)
    }
  }

  useEffect(() => {
    loadCurves(compareDim)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    let filters: unknown = {}
    if (filtersText.trim()) {
      try {
        filters = JSON.parse(filtersText)
      } catch {
        setFormErr('Filters must be valid JSON.')
        return
      }
    }
    setSaving(true)
    try {
      await api.createCohort({ name: name.trim(), dimension, filters })
      setCreateOpen(false)
      setName('')
      setDimension('department')
      setFiltersText('{}')
      await loadCohorts()
      await loadCurves(compareDim)
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Failed to create cohort')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this cohort?')) return
    try {
      await api.deleteCohort(id)
      if (selectedId === id) {
        setSelectedId(null)
        setCurve(null)
      }
      await loadCohorts()
      await loadCurves(compareDim)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete cohort')
    }
  }

  const filtered = useMemo(() => {
    return cohorts.filter((c) => {
      if (dimFilter && c.dimension !== dimFilter) return false
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [cohorts, dimFilter, search])

  const dimensionsPresent = useMemo(() => Array.from(new Set(cohorts.map((c) => c.dimension))), [cohorts])

  if (loading) return <PageSpinner label="Loading cohorts..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Cohorts &amp; Attrition Curves</h1>
          <p className="mt-1 text-sm text-slate-400">Build employee cohorts and compare survival curves across the org.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New cohort</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Saved cohorts" value={cohorts.length} tone="amber" />
        <Stat label="Dimensions in use" value={dimensionsPresent.length} />
        <Stat label="Comparison dimension" value={compareDim.replace('_', ' ')} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cohort list */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Saved cohorts</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
              <select
                value={dimFilter}
                onChange={(e) => setDimFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
              >
                <option value="">All dimensions</option>
                {DIMENSIONS.map((d) => (
                  <option key={d} value={d}>{d.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No cohorts"
                  description={cohorts.length === 0 ? 'Create your first cohort to view attrition curves.' : 'No cohorts match your filters.'}
                  action={cohorts.length === 0 ? <Button onClick={() => setCreateOpen(true)}>+ New cohort</Button> : undefined}
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Dimension</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((c) => (
                    <TR key={c.id} className={selectedId === c.id ? 'bg-amber-500/5' : ''}>
                      <TD>
                        <button onClick={() => loadCurve(c.id)} className="font-medium text-amber-300 hover:underline">
                          {c.name}
                        </button>
                      </TD>
                      <TD><Badge tone="neutral">{c.dimension.replace('_', ' ')}</Badge></TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => loadCurve(c.id)}>Curve</Button>
                          <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => handleDelete(c.id)}>Delete</Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Single cohort curve */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Cohort survival curve</h2>
          </CardHeader>
          <CardBody>
            {!selectedId ? (
              <EmptyState title="Select a cohort" description="Pick a cohort on the left to view its retention curve and milestones." />
            ) : curveLoading ? (
              <Spinner label="Computing curve..." className="py-10" />
            ) : curveErr ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{curveErr}</div>
            ) : curve ? (
              <div className="space-y-4">
                {curve.earlyFlag && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    <span>⚠</span> Early-attrition flag: this cohort is losing people faster than expected.
                  </div>
                )}
                <SurvivalChart points={curve.points} />
                <div className="grid grid-cols-5 gap-2">
                  {(['m3', 'm6', 'm12', 'm18', 'm24'] as const).map((k) => (
                    <div key={k} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k.replace('m', '')} mo</div>
                      <div className="mt-1 text-sm font-bold tabular-nums text-white">{pct(curve.retention?.[k])}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No curve data.</div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Comparison across dimension */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Compare curves by dimension</h2>
          <select
            value={compareDim}
            onChange={(e) => loadCurves(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>{d.replace('_', ' ')}</option>
            ))}
          </select>
        </CardHeader>
        <CardBody>
          {curvesLoading ? (
            <Spinner label="Loading comparison..." className="py-10" />
          ) : curvesErr ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{curvesErr}</div>
          ) : curves && curves.series && curves.series.length > 0 ? (
            <ComparisonChart series={curves.series} />
          ) : (
            <EmptyState title="No comparison data" description="No survival series available for this dimension yet." />
          )}
        </CardBody>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New cohort"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="cohort-form" disabled={saving || !name.trim()}>
              {saving ? 'Creating...' : 'Create cohort'}
            </Button>
          </>
        }
      >
        <form id="cohort-form" onSubmit={handleCreate} className="space-y-4">
          {formErr && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{formErr}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2024 H1 hires"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Dimension</label>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>{d.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Filters (JSON)</label>
            <textarea
              value={filtersText}
              onChange={(e) => setFiltersText(e.target.value)}
              rows={4}
              placeholder='{"department_id": "...", "level": "IC4"}'
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">Optional key/value filters that scope which employees belong to the cohort.</p>
          </div>
        </form>
      </Modal>
    </div>
  )
}
