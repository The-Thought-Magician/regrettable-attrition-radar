'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Stat } from '@/components/ui/Stat'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'

interface RiskByBand {
  band: string
  count: number
}
interface TopDriver {
  name?: string
  driver?: string
  count?: number
  frequency?: number
  weighted?: number
}
interface TopAtRisk {
  id?: string
  employee_id?: string
  full_name?: string
  name?: string
  score?: number
  band?: string
  department?: string
}
interface ManagerOutlier {
  manager_id?: string
  manager_name?: string
  regrettable_rate?: number | string
  avg_flight_risk?: number
  team_size?: number
  replacement_cost_exposure?: number | string
}
interface DashboardSummary {
  regrettableRate?: number | string
  riskByBand?: RiskByBand[]
  exposure?: number | string
  budgetUtil?: number | string
  topDrivers?: TopDriver[]
  topAtRisk?: TopAtRisk[]
  managerOutliers?: ManagerOutlier[]
}

function fmtMoney(n?: number | string | null): string {
  const num = typeof n === 'object' ? NaN : Number(n)
  if (n === undefined || n === null || Number.isNaN(num)) return '$0'
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${Math.round(num).toLocaleString()}`
}

function fmtPct(n?: number | string | null): string {
  const num = typeof n === 'object' ? NaN : Number(n)
  if (n === undefined || n === null || Number.isNaN(num)) return '0%'
  // accept either fraction (0.12) or percent (12)
  const v = Math.abs(num) <= 1 ? num * 100 : num
  return `${v.toFixed(1)}%`
}

const bandColors: Record<string, string> = {
  low: 'bg-emerald-500',
  moderate: 'bg-sky-500',
  elevated: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-rose-500',
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.getDashboardSummary()
      setSummary(data ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function runAlertEvaluation() {
    setEvaluating(true)
    setAlertMsg('')
    try {
      const res = await api.evaluateAlerts()
      const created = res?.created ?? (Array.isArray(res?.alerts) ? res.alerts.length : 0)
      setAlertMsg(`${created} alert${created === 1 ? '' : 's'} generated`)
      await load()
    } catch (e) {
      setAlertMsg(e instanceof Error ? e.message : 'Alert evaluation failed')
    } finally {
      setEvaluating(false)
    }
  }

  if (loading) return <PageSpinner label="Loading retention overview..." />

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Retention Overview</h1>
        <Card>
          <CardBody>
            <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-4 text-sm text-rose-300">
              {error}
            </div>
            <div className="mt-4">
              <Button variant="secondary" onClick={load}>Retry</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const s = summary ?? {}
  const riskByBand = s.riskByBand ?? []
  const totalAtRisk = riskByBand
    .filter((b) => ['elevated', 'high', 'critical'].includes((b.band ?? '').toLowerCase()))
    .reduce((acc, b) => acc + (b.count ?? 0), 0)
  const totalHeadcount = riskByBand.reduce((acc, b) => acc + (b.count ?? 0), 0)
  const maxBand = Math.max(1, ...riskByBand.map((b) => b.count ?? 0))
  const topDrivers = s.topDrivers ?? []
  const topAtRisk = s.topAtRisk ?? []
  const managerOutliers = s.managerOutliers ?? []

  const isEmpty = totalHeadcount === 0 && topAtRisk.length === 0 && managerOutliers.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Retention Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Regrettable attrition signals across your organization.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alertMsg && <span className="text-sm text-amber-300">{alertMsg}</span>}
          <Button onClick={runAlertEvaluation} disabled={evaluating}>
            {evaluating ? 'Evaluating...' : 'Evaluate Alerts'}
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          title="No people data yet"
          description="Seed a sample organization or import employees, then compute risk scores to populate this dashboard."
          icon="📡"
          action={
            <Link href="/dashboard/imports">
              <Button>Import or seed data</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Regrettable Rate"
              value={fmtPct(s.regrettableRate)}
              sub="Share of exits flagged regrettable"
              tone="rose"
            />
            <Stat
              label="Headcount at Risk"
              value={totalAtRisk.toLocaleString()}
              sub={`${totalHeadcount.toLocaleString()} scored employees`}
              tone="amber"
            />
            <Stat
              label="Replacement Exposure"
              value={fmtMoney(s.exposure)}
              sub="Projected cost if at-risk leave"
              tone="rose"
            />
            <Stat
              label="Budget Utilization"
              value={fmtPct(s.budgetUtil)}
              sub="Retention spend committed"
              tone="green"
            />
          </div>

          {/* Risk band distribution */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Flight-Risk Distribution</h2>
              <Link href="/dashboard/risk" className="text-xs text-amber-400 hover:text-amber-300">
                View ranking →
              </Link>
            </CardHeader>
            <CardBody>
              {riskByBand.length === 0 ? (
                <p className="text-sm text-slate-500">No risk scores computed yet.</p>
              ) : (
                <div className="space-y-3">
                  {riskByBand.map((b) => {
                    const band = (b.band ?? 'unknown').toLowerCase()
                    const pct = Math.round(((b.count ?? 0) / maxBand) * 100)
                    return (
                      <div key={b.band} className="flex items-center gap-3">
                        <div className="w-24 shrink-0">
                          <Badge tone={bandTone(band)}>{b.band}</Badge>
                        </div>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${bandColors[band] ?? 'bg-slate-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-200">
                          {(b.count ?? 0).toLocaleString()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Top at-risk */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Top At-Risk Employees</h2>
                <Link href="/dashboard/employees" className="text-xs text-amber-400 hover:text-amber-300">
                  All employees →
                </Link>
              </CardHeader>
              <CardBody className="p-0">
                {topAtRisk.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">No at-risk employees identified.</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Employee</TH>
                        <TH>Department</TH>
                        <TH className="text-right">Risk Score</TH>
                        <TH>Band</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {topAtRisk.map((e, i) => {
                        const id = e.id ?? e.employee_id
                        const name = e.full_name ?? e.name ?? 'Unknown'
                        return (
                          <TR key={id ?? i}>
                            <TD>
                              {id ? (
                                <Link
                                  href={`/dashboard/employees/${id}`}
                                  className="font-medium text-amber-400 hover:text-amber-300"
                                >
                                  {name}
                                </Link>
                              ) : (
                                <span className="font-medium text-slate-200">{name}</span>
                              )}
                            </TD>
                            <TD className="text-slate-400">{e.department ?? '—'}</TD>
                            <TD className="text-right font-semibold tabular-nums">
                              {e.score !== undefined ? Math.round(e.score) : '—'}
                            </TD>
                            <TD>
                              {e.band ? <Badge tone={bandTone(e.band)}>{e.band}</Badge> : '—'}
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>

            {/* Top drivers */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Top Exit Drivers</h2>
                <Link href="/dashboard/drivers" className="text-xs text-amber-400 hover:text-amber-300">
                  Drivers →
                </Link>
              </CardHeader>
              <CardBody>
                {topDrivers.length === 0 ? (
                  <p className="text-sm text-slate-500">No exit drivers recorded.</p>
                ) : (
                  <ul className="space-y-3">
                    {topDrivers.map((d, i) => {
                      const label = d.name ?? d.driver ?? 'Unknown'
                      const count = d.count ?? d.frequency ?? d.weighted ?? 0
                      return (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm text-slate-200">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-amber-400">
                              {i + 1}
                            </span>
                            {label}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-slate-300">
                            {Math.round(count)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Manager outliers */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Manager Outliers</h2>
              <Link href="/dashboard/managers" className="text-xs text-amber-400 hover:text-amber-300">
                Scorecards →
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {managerOutliers.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">No manager outliers detected.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Manager</TH>
                      <TH className="text-right">Team Size</TH>
                      <TH className="text-right">Regrettable Rate</TH>
                      <TH className="text-right">Avg Flight Risk</TH>
                      <TH className="text-right">Exposure</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {managerOutliers.map((m, i) => (
                      <TR key={m.manager_id ?? i}>
                        <TD>
                          {m.manager_id ? (
                            <Link
                              href={`/dashboard/managers`}
                              className="font-medium text-slate-200 hover:text-amber-300"
                            >
                              {m.manager_name ?? m.manager_id}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-200">{m.manager_name ?? '—'}</span>
                          )}
                        </TD>
                        <TD className="text-right tabular-nums text-slate-400">{m.team_size ?? '—'}</TD>
                        <TD className="text-right tabular-nums text-rose-300">{fmtPct(m.regrettable_rate)}</TD>
                        <TD className="text-right tabular-nums text-amber-300">
                          {m.avg_flight_risk !== undefined ? Math.round(m.avg_flight_risk) : '—'}
                        </TD>
                        <TD className="text-right tabular-nums text-slate-300">
                          {fmtMoney(m.replacement_cost_exposure)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
