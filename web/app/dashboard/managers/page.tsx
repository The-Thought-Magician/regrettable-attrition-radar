'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Scorecard {
  id: string
  manager_id: string
  manager_name: string
  team_size: number
  regrettable_exits: number
  regrettable_rate: number
  avg_flight_risk: number
  replacement_cost_exposure: number
  is_outlier: boolean
  period: string
  computed_at: string
}

interface TeamMember {
  id: string
  full_name: string
  level?: string
  status?: string
  score?: number
  band?: string
  performance_rating?: number
}

interface ScorecardDetail {
  scorecard: Scorecard
  team: TeamMember[]
}

type SortKey = 'manager_name' | 'team_size' | 'regrettable_rate' | 'avg_flight_risk' | 'replacement_cost_exposure'

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `$${Math.round(n)}`
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`
const fmtRisk = (n: number) => (n <= 1 ? (n * 100).toFixed(0) : n.toFixed(0))

function riskTone(rate: number) {
  if (rate >= 0.2) return 'critical' as const
  if (rate >= 0.12) return 'high' as const
  if (rate >= 0.06) return 'elevated' as const
  return 'low' as const
}

export default function ManagersPage() {
  const [scorecards, setScorecards] = useState<Scorecard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)
  const [search, setSearch] = useState('')
  const [onlyOutliers, setOnlyOutliers] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('regrettable_rate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ScorecardDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const rows = await api.listManagerScorecards()
      setScorecards(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scorecards')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function recompute() {
    setComputing(true)
    setError(null)
    try {
      await api.computeManagerScorecards()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compute scorecards')
    } finally {
      setComputing(false)
    }
  }

  async function openDetail(managerId: string) {
    setDetailOpen(true)
    setDetail(null)
    setDetailLoading(true)
    try {
      const d = await api.getManagerScorecard(managerId)
      setDetail(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load manager detail')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'manager_name' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    let rows = scorecards
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) => (r.manager_name ?? '').toLowerCase().includes(q))
    }
    if (onlyOutliers) rows = rows.filter((r) => r.is_outlier)
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (typeof av === 'string' || typeof bv === 'string') {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''))
      } else {
        cmp = (Number(av) || 0) - (Number(bv) || 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [scorecards, search, onlyOutliers, sortKey, sortDir])

  const totals = useMemo(() => {
    const teams = scorecards.reduce((s, r) => s + (r.team_size || 0), 0)
    const exits = scorecards.reduce((s, r) => s + (r.regrettable_exits || 0), 0)
    const exposure = scorecards.reduce((s, r) => s + (r.replacement_cost_exposure || 0), 0)
    const outliers = scorecards.filter((r) => r.is_outlier).length
    const avgRate =
      scorecards.length > 0
        ? scorecards.reduce((s, r) => s + (r.regrettable_rate || 0), 0) / scorecards.length
        : 0
    return { teams, exits, exposure, outliers, avgRate }
  }, [scorecards])

  const maxExposure = useMemo(
    () => Math.max(1, ...scorecards.map((r) => r.replacement_cost_exposure || 0)),
    [scorecards],
  )

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  if (loading) return <PageSpinner label="Loading manager scorecards..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Manager Scorecards</h1>
          <p className="mt-1 text-sm text-stone-400">
            Regrettable attrition, flight risk, and cost exposure by people manager. Outliers run hot
            against their peers.
          </p>
        </div>
        <Button onClick={recompute} disabled={computing}>
          {computing ? 'Computing...' : 'Recompute scorecards'}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Managers" value={scorecards.length} />
        <Stat label="People covered" value={totals.teams} />
        <Stat label="Regrettable exits" value={totals.exits} tone="rose" />
        <Stat label="Avg regrettable rate" value={fmtPct(totals.avgRate)} tone="amber" />
        <Stat
          label="Outliers"
          value={totals.outliers}
          tone={totals.outliers > 0 ? 'rose' : 'default'}
          sub={`${fmtMoney(totals.exposure)} total exposure`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search manager..."
              className="w-56 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input
                type="checkbox"
                checked={onlyOutliers}
                onChange={(e) => setOnlyOutliers(e.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
              Outliers only
            </label>
          </div>
          <span className="text-xs text-stone-500">
            {filtered.length} of {scorecards.length}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={scorecards.length === 0 ? 'No scorecards yet' : 'No managers match your filters'}
                description={
                  scorecards.length === 0
                    ? 'Recompute scorecards after employees, risk scores, and exits are loaded.'
                    : 'Adjust your search or clear the outliers filter.'
                }
                action={
                  scorecards.length === 0 ? (
                    <Button onClick={recompute} disabled={computing}>
                      {computing ? 'Computing...' : 'Recompute scorecards'}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="cursor-pointer select-none" onClick={() => toggleSort('manager_name')}>
                    Manager{sortArrow('manager_name')}
                  </TH>
                  <TH className="cursor-pointer select-none text-right" onClick={() => toggleSort('team_size')}>
                    Team{sortArrow('team_size')}
                  </TH>
                  <TH className="text-right">Reg. exits</TH>
                  <TH className="cursor-pointer select-none text-right" onClick={() => toggleSort('regrettable_rate')}>
                    Reg. rate{sortArrow('regrettable_rate')}
                  </TH>
                  <TH className="cursor-pointer select-none text-right" onClick={() => toggleSort('avg_flight_risk')}>
                    Avg flight risk{sortArrow('avg_flight_risk')}
                  </TH>
                  <TH className="cursor-pointer select-none" onClick={() => toggleSort('replacement_cost_exposure')}>
                    Cost exposure{sortArrow('replacement_cost_exposure')}
                  </TH>
                  <TH>Status</TH>
                  <TH className="text-right">Period</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => openDetail(r.manager_id)}>
                    <TD className="font-medium text-white">{r.manager_name || r.manager_id}</TD>
                    <TD className="text-right tabular-nums">{r.team_size}</TD>
                    <TD className="text-right tabular-nums">{r.regrettable_exits}</TD>
                    <TD className="text-right">
                      <Badge tone={riskTone(r.regrettable_rate)}>{fmtPct(r.regrettable_rate)}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{fmtRisk(r.avg_flight_risk)}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-800">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${Math.min(100, (r.replacement_cost_exposure / maxExposure) * 100)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-stone-300">{fmtMoney(r.replacement_cost_exposure)}</span>
                      </div>
                    </TD>
                    <TD>
                      {r.is_outlier ? (
                        <Badge tone="critical">Outlier</Badge>
                      ) : (
                        <Badge tone="low">In range</Badge>
                      )}
                    </TD>
                    <TD className="text-right text-stone-400">{r.period}</TD>
                    <TD className="text-right">
                      <span className="text-indigo-400">View →</span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `${detail.scorecard.manager_name || 'Manager'} — team drill-through` : 'Manager detail'}
        className="max-w-3xl"
      >
        {detailLoading || !detail ? (
          <Spinner label="Loading team..." className="py-10" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Team size" value={detail.scorecard.team_size} />
              <Stat label="Reg. rate" value={fmtPct(detail.scorecard.regrettable_rate)} tone="amber" />
              <Stat label="Avg flight risk" value={fmtRisk(detail.scorecard.avg_flight_risk)} />
              <Stat
                label="Cost exposure"
                value={fmtMoney(detail.scorecard.replacement_cost_exposure)}
                tone="rose"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-200">Team roster</h3>
                {detail.scorecard.is_outlier && <Badge tone="critical">Outlier manager</Badge>}
              </div>
              {detail.team.length === 0 ? (
                <EmptyState title="No direct reports" description="This manager has no active reports on record." />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Report</TH>
                      <TH>Level</TH>
                      <TH className="text-right">Flight risk</TH>
                      <TH>Band</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {detail.team
                      .slice()
                      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                      .map((m) => (
                        <TR key={m.id}>
                          <TD className="font-medium text-white">{m.full_name}</TD>
                          <TD className="text-stone-400">{m.level ?? '—'}</TD>
                          <TD className="text-right tabular-nums">
                            {m.score != null ? fmtRisk(m.score) : '—'}
                          </TD>
                          <TD>{m.band ? <Badge tone={bandTone(m.band)}>{m.band}</Badge> : '—'}</TD>
                          <TD className="text-stone-400">{m.status ?? '—'}</TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
