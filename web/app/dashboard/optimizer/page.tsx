'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'

interface Candidate {
  id: string
  employee_id: string
  employee_name?: string
  intervention_id: string
  intervention_name?: string
  cost: number
  risk_reduction: number
  roi: number
  band?: string
}

interface OptimizeSelected {
  id?: string
  employee_id: string
  employee_name?: string
  intervention_id: string
  intervention_name?: string
  cost: number
  risk_reduction: number
  roi?: number
}

interface OptimizeResult {
  budget: number
  selected: OptimizeSelected[]
  totalSpend: number
  totalRiskReduction: number
  projectedRetained: number
  avoidedCost: number
}

function money(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function num(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function nameOf(c: { employee_name?: string; employee_id: string }): string {
  return c.employee_name || c.employee_id?.slice(0, 8) || '—'
}

function interventionOf(c: { intervention_name?: string; intervention_id: string }): string {
  return c.intervention_name || c.intervention_id?.slice(0, 8) || '—'
}

// horizontal ROI bar chart for top candidates
function RoiBars({ rows }: { rows: Candidate[] }) {
  const top = rows.slice(0, 12)
  const max = Math.max(...top.map((r) => r.roi || 0), 0.0001)
  return (
    <div className="space-y-2">
      {top.map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate text-xs text-stone-300" title={`${nameOf(r)} · ${interventionOf(r)}`}>
            {nameOf(r)}
          </div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-stone-950">
            <div
              className="h-full rounded bg-indigo-500/70"
              style={{ width: `${Math.max(2, ((r.roi || 0) / max) * 100)}%` }}
            />
          </div>
          <div className="w-16 shrink-0 text-right text-xs tabular-nums text-indigo-300">{num(r.roi, 2)}×</div>
        </div>
      ))}
    </div>
  )
}

export default function OptimizerPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [ranking, setRanking] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [budget, setBudget] = useState(250000)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [optErr, setOptErr] = useState<string | null>(null)

  const [search, setSearch] = useState('')

  const [saveOpen, setSaveOpen] = useState(false)
  const [scenarioName, setScenarioName] = useState('')
  const [scenarioNotes, setScenarioNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [cands, rank] = await Promise.all([api.listCandidates(), api.getCandidateRanking()])
      setCandidates(Array.isArray(cands) ? cands : [])
      setRanking(Array.isArray(rank) ? rank : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load optimizer data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      await api.generateCandidates()
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate candidates')
    } finally {
      setGenerating(false)
    }
  }

  async function handleOptimize(e?: React.FormEvent) {
    e?.preventDefault()
    setOptimizing(true)
    setOptErr(null)
    setSaveOk(null)
    try {
      const res = await api.optimizeBudget({ budget })
      setResult(res)
    } catch (err) {
      setOptErr(err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setOptimizing(false)
    }
  }

  async function handleSaveScenario(e: React.FormEvent) {
    e.preventDefault()
    if (!result) return
    setSaving(true)
    setSaveErr(null)
    try {
      await api.createScenario({
        name: scenarioName.trim(),
        notes: scenarioNotes.trim() || undefined,
        budget: result.budget,
        selected: result.selected,
        totalSpend: result.totalSpend,
        totalRiskReduction: result.totalRiskReduction,
        projectedRetained: result.projectedRetained,
        avoidedCost: result.avoidedCost,
      })
      setSaveOpen(false)
      setScenarioName('')
      setScenarioNotes('')
      setSaveOk('Scenario saved. View it under Scenarios.')
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save scenario')
    } finally {
      setSaving(false)
    }
  }

  const filteredRanking = useMemo(() => {
    if (!search) return ranking
    const q = search.toLowerCase()
    return ranking.filter((r) => nameOf(r).toLowerCase().includes(q) || interventionOf(r).toLowerCase().includes(q))
  }, [ranking, search])

  const candidateAggregates = useMemo(() => {
    const totalCost = candidates.reduce((s, c) => s + (c.cost || 0), 0)
    const avgRoi = candidates.length ? candidates.reduce((s, c) => s + (c.roi || 0), 0) / candidates.length : 0
    return { count: candidates.length, totalCost, avgRoi }
  }, [candidates])

  if (loading) return <PageSpinner label="Loading optimizer..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">ROI Optimizer</h1>
          <p className="mt-1 text-sm text-stone-400">Generate retention interventions, optimize within a budget, and bank the result as a scenario.</p>
        </div>
        <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating...' : 'Regenerate candidates'}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Candidate interventions" value={candidateAggregates.count} tone="amber" />
        <Stat label="Total candidate cost" value={money(candidateAggregates.totalCost)} />
        <Stat label="Avg ROI" value={`${num(candidateAggregates.avgRoi, 2)}×`} tone="green" />
      </div>

      {candidates.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No candidates yet"
              description="Generate candidate interventions from current flight-risk scores and the intervention catalog."
              action={<Button onClick={handleGenerate} disabled={generating}>{generating ? 'Generating...' : 'Generate candidates'}</Button>}
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Budget optimizer */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-white">Budget-constrained selection</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <form onSubmit={handleOptimize} className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-400">Retention budget (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-48 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm tabular-nums text-stone-200 focus:border-indigo-500/60 focus:outline-none"
                  />
                </div>
                <Button type="submit" disabled={optimizing}>{optimizing ? 'Optimizing...' : 'Optimize'}</Button>
                {result && (
                  <Button type="button" variant="secondary" onClick={() => { setSaveErr(null); setSaveOpen(true) }}>
                    Save as scenario
                  </Button>
                )}
              </form>

              {optErr && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{optErr}</div>
              )}
              {saveOk && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{saveOk}</div>
              )}

              {optimizing ? (
                <Spinner label="Solving knapsack..." className="py-8" />
              ) : result ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <Stat label="Budget" value={money(result.budget)} />
                    <Stat label="Total spend" value={money(result.totalSpend)} tone="amber" />
                    <Stat label="Risk reduced" value={num(result.totalRiskReduction, 1)} tone="green" />
                    <Stat label="Projected retained" value={num(result.projectedRetained, 1)} tone="green" />
                    <Stat label="Avoided cost" value={money(result.avoidedCost)} tone="green" />
                  </div>
                  {result.selected && result.selected.length > 0 ? (
                    <Table>
                      <THead>
                        <TR>
                          <TH>Employee</TH>
                          <TH>Intervention</TH>
                          <TH className="text-right">Cost</TH>
                          <TH className="text-right">Risk ↓</TH>
                          <TH className="text-right">ROI</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {result.selected.map((s, i) => (
                          <TR key={s.id ?? `${s.employee_id}-${s.intervention_id}-${i}`}>
                            <TD className="font-medium text-white">{nameOf(s)}</TD>
                            <TD>{interventionOf(s)}</TD>
                            <TD className="text-right tabular-nums">{money(s.cost)}</TD>
                            <TD className="text-right tabular-nums text-emerald-300">{num(s.risk_reduction, 1)}</TD>
                            <TD className="text-right tabular-nums text-indigo-300">{s.roi !== undefined ? `${num(s.roi, 2)}×` : '—'}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  ) : (
                    <EmptyState title="Nothing selected" description="No interventions fit within this budget. Try increasing it." />
                  )}
                </div>
              ) : (
                <p className="text-sm text-stone-500">Set a budget and run the optimizer to see the selected intervention set.</p>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ROI bars */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">Top ROI candidates</h2>
              </CardHeader>
              <CardBody>
                {ranking.length === 0 ? (
                  <EmptyState title="No ranking" description="Generate candidates to populate the ROI ranking." />
                ) : (
                  <RoiBars rows={ranking} />
                )}
              </CardBody>
            </Card>

            {/* Marginal ranking table */}
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Marginal-ROI ranking</h2>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employee / intervention..."
                  className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
                />
              </CardHeader>
              <CardBody className="p-0">
                {filteredRanking.length === 0 ? (
                  <div className="p-5">
                    <EmptyState title="No matches" description="No candidates match your search." />
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>#</TH>
                          <TH>Employee</TH>
                          <TH>Intervention</TH>
                          <TH className="text-right">Cost</TH>
                          <TH className="text-right">ROI</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {filteredRanking.map((r, i) => (
                          <TR key={r.id}>
                            <TD className="text-stone-500">{i + 1}</TD>
                            <TD className="font-medium text-white">
                              {nameOf(r)}
                              {r.band && <span className="ml-2"><Badge tone={bandTone(r.band)}>{r.band}</Badge></span>}
                            </TD>
                            <TD>{interventionOf(r)}</TD>
                            <TD className="text-right tabular-nums">{money(r.cost)}</TD>
                            <TD className="text-right tabular-nums text-indigo-300">{num(r.roi, 2)}×</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save scenario"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="submit" form="scenario-form" disabled={saving || !scenarioName.trim()}>
              {saving ? 'Saving...' : 'Save scenario'}
            </Button>
          </>
        }
      >
        <form id="scenario-form" onSubmit={handleSaveScenario} className="space-y-4">
          {saveErr && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{saveErr}</div>
          )}
          {result && (
            <div className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-xs text-stone-400">
              Budget {money(result.budget)} · Spend {money(result.totalSpend)} · {result.selected?.length ?? 0} interventions · Avoided {money(result.avoidedCost)}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Scenario name</label>
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Q3 retention plan"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Notes (optional)</label>
            <textarea
              value={scenarioNotes}
              onChange={(e) => setScenarioNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
