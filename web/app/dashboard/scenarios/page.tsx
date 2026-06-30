'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'

interface Scenario {
  id: string
  name: string
  budget: number
  projected_regrettable_rate?: number
  projected_retained?: number
  projected_avoided_cost?: number
  total_spend?: number
  notes?: string
  created_at?: string
}

interface Allocation {
  id: string
  employee_id: string
  employee_name?: string
  intervention_id: string
  intervention_name?: string
  cost: number
  risk_reduction: number
}

interface ScenarioDetail {
  scenario: Scenario
  allocations: Allocation[]
}

function money(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function num(n: number | undefined, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function rate(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const v = n <= 1 ? n * 100 : n
  return `${v.toFixed(1)}%`
}

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ScenarioDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState<string | null>(null)

  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareData, setCompareData] = useState<Scenario[] | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareErr, setCompareErr] = useState<string | null>(null)

  async function loadScenarios() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listScenarios()
      setScenarios(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scenarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadScenarios()
  }, [])

  async function loadDetail(id: string) {
    setDetailId(id)
    setDetailLoading(true)
    setDetailErr(null)
    setDetail(null)
    try {
      const data = await api.getScenario(id)
      setDetail(data)
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Failed to load scenario detail')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this scenario?')) return
    try {
      await api.deleteScenario(id)
      if (detailId === id) { setDetailId(null); setDetail(null) }
      setCompareIds((ids) => ids.filter((x) => x !== id))
      await loadScenarios()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete scenario')
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
    setCompareData(null)
  }

  async function runCompare() {
    if (compareIds.length < 2) return
    setCompareLoading(true)
    setCompareErr(null)
    try {
      const data = await api.compareScenarios(compareIds.join(','))
      const list = Array.isArray(data) ? data : data?.scenarios
      setCompareData(Array.isArray(list) ? list : [])
    } catch (e) {
      setCompareErr(e instanceof Error ? e.message : 'Failed to compare scenarios')
    } finally {
      setCompareLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search) return scenarios
    const q = search.toLowerCase()
    return scenarios.filter((s) => s.name.toLowerCase().includes(q))
  }, [scenarios, search])

  const totals = useMemo(() => {
    const spend = scenarios.reduce((s, x) => s + (x.total_spend || 0), 0)
    const avoided = scenarios.reduce((s, x) => s + (x.projected_avoided_cost || 0), 0)
    return { count: scenarios.length, spend, avoided }
  }, [scenarios])

  const compareMetrics: { key: keyof Scenario; label: string; fmt: (n: number | undefined) => string; lowerBetter?: boolean }[] = [
    { key: 'budget', label: 'Budget', fmt: money },
    { key: 'total_spend', label: 'Total spend', fmt: money },
    { key: 'projected_retained', label: 'Projected retained', fmt: (n) => num(n, 1) },
    { key: 'projected_avoided_cost', label: 'Avoided cost', fmt: money },
    { key: 'projected_regrettable_rate', label: 'Regrettable rate', fmt: rate, lowerBetter: true },
  ]

  if (loading) return <PageSpinner label="Loading scenarios..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Scenarios</h1>
          <p className="mt-1 text-sm text-slate-400">Saved retention plans. Select two or more to compare side by side.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Saved scenarios" value={totals.count} tone="amber" />
        <Stat label="Total planned spend" value={money(totals.spend)} />
        <Stat label="Total avoided cost" value={money(totals.avoided)} tone="green" />
      </div>

      {scenarios.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No scenarios yet"
              description="Run the ROI Optimizer and save the result as a scenario to see it here."
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">All scenarios</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
              <Button onClick={runCompare} disabled={compareIds.length < 2 || compareLoading}>
                {compareLoading ? 'Comparing...' : `Compare (${compareIds.length})`}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10"></TH>
                  <TH>Name</TH>
                  <TH className="text-right">Budget</TH>
                  <TH className="text-right">Spend</TH>
                  <TH className="text-right">Retained</TH>
                  <TH className="text-right">Avoided</TH>
                  <TH className="text-right">Reg. rate</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id} className={detailId === s.id ? 'bg-amber-500/5' : ''}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={compareIds.includes(s.id)}
                        onChange={() => toggleCompare(s.id)}
                        className="h-4 w-4 accent-amber-500"
                        aria-label={`Select ${s.name} for comparison`}
                      />
                    </TD>
                    <TD>
                      <button onClick={() => loadDetail(s.id)} className="font-medium text-amber-300 hover:underline">{s.name}</button>
                      {s.notes && <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{s.notes}</div>}
                    </TD>
                    <TD className="text-right tabular-nums">{money(s.budget)}</TD>
                    <TD className="text-right tabular-nums">{money(s.total_spend)}</TD>
                    <TD className="text-right tabular-nums text-emerald-300">{num(s.projected_retained, 1)}</TD>
                    <TD className="text-right tabular-nums text-emerald-300">{money(s.projected_avoided_cost)}</TD>
                    <TD className="text-right tabular-nums">{rate(s.projected_regrettable_rate)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => loadDetail(s.id)}>Open</Button>
                        <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => handleDelete(s.id)}>Delete</Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {/* Side-by-side comparison */}
      {(compareData || compareErr || compareLoading) && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Side-by-side comparison</h2>
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => { setCompareData(null); setCompareErr(null) }}>Clear</Button>
          </CardHeader>
          <CardBody>
            {compareLoading ? (
              <Spinner label="Comparing..." className="py-8" />
            ) : compareErr ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{compareErr}</div>
            ) : compareData && compareData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Metric</th>
                      {compareData.map((s) => (
                        <th key={s.id} className="px-4 py-3 font-medium text-white">{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {compareMetrics.map((m) => {
                      const vals = compareData.map((s) => Number(s[m.key] ?? NaN))
                      const valid = vals.filter((v) => !Number.isNaN(v))
                      const best = valid.length
                        ? (m.lowerBetter ? Math.min(...valid) : Math.max(...valid))
                        : undefined
                      return (
                        <tr key={String(m.key)} className="hover:bg-slate-900/50">
                          <td className="px-4 py-3 text-slate-400">{m.label}</td>
                          {compareData.map((s, i) => {
                            const v = vals[i]
                            const isBest = best !== undefined && !Number.isNaN(v) && v === best && valid.length > 1
                            return (
                              <td key={s.id} className={`px-4 py-3 tabular-nums ${isBest ? 'font-semibold text-emerald-300' : 'text-slate-200'}`}>
                                {m.fmt(s[m.key] as number | undefined)}
                                {isBest && <span className="ml-1 text-[10px] uppercase text-emerald-400">best</span>}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No comparison data" description="Select at least two scenarios and press Compare." />
            )}
          </CardBody>
        </Card>
      )}

      {/* Detail panel */}
      {detailId && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Scenario detail</h2>
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => { setDetailId(null); setDetail(null) }}>Close</Button>
          </CardHeader>
          <CardBody>
            {detailLoading ? (
              <Spinner label="Loading detail..." className="py-8" />
            ) : detailErr ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{detailErr}</div>
            ) : detail ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">{detail.scenario.name}</h3>
                  {detail.scenario.notes && <p className="mt-1 text-sm text-slate-400">{detail.scenario.notes}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Stat label="Budget" value={money(detail.scenario.budget)} />
                  <Stat label="Spend" value={money(detail.scenario.total_spend)} tone="amber" />
                  <Stat label="Retained" value={num(detail.scenario.projected_retained, 1)} tone="green" />
                  <Stat label="Avoided" value={money(detail.scenario.projected_avoided_cost)} tone="green" />
                  <Stat label="Reg. rate" value={rate(detail.scenario.projected_regrettable_rate)} />
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Allocations ({detail.allocations?.length ?? 0})</h4>
                  {detail.allocations && detail.allocations.length > 0 ? (
                    <Table>
                      <THead>
                        <TR>
                          <TH>Employee</TH>
                          <TH>Intervention</TH>
                          <TH className="text-right">Cost</TH>
                          <TH className="text-right">Risk ↓</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {detail.allocations.map((a) => (
                          <TR key={a.id}>
                            <TD className="font-medium text-white">{a.employee_name || a.employee_id?.slice(0, 8) || '—'}</TD>
                            <TD>{a.intervention_name || a.intervention_id?.slice(0, 8) || '—'}</TD>
                            <TD className="text-right tabular-nums">{money(a.cost)}</TD>
                            <TD className="text-right tabular-nums text-emerald-300">{num(a.risk_reduction, 1)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  ) : (
                    <EmptyState title="No allocations" description="This scenario has no intervention allocations." />
                  )}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
