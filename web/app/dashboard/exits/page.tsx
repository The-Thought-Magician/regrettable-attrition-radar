'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

interface ExitRow {
  id: string
  employee_id: string
  full_name?: string | null
  email?: string | null
  department_name?: string | null
  exit_type: string
  exit_date?: string | null
  is_regrettable: boolean
  regrettable_score?: number | null
  classification_reason?: string | null
  manually_overridden: boolean
  override_reason?: string | null
  notes?: string | null
  created_at?: string
}

interface RateResponse {
  overall: number
  byPeriod: Array<{ period: string; rate: number; total: number; regrettable: number }>
}

interface EmployeeOption {
  id: string
  full_name: string
  email?: string | null
  status?: string
}

function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  // accept either fraction (0–1) or already-percent (0–100)
  const v = n <= 1 ? n * 100 : n
  return `${v.toFixed(1)}%`
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toISOString().slice(0, 10)
}

const EXIT_TYPES = ['voluntary', 'involuntary', 'retirement', 'end_of_contract']

export default function ExitsPage() {
  const [exits, setExits] = useState<ExitRow[]>([])
  const [rate, setRate] = useState<RateResponse | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [regFilter, setRegFilter] = useState<'all' | 'regrettable' | 'non'>('all')

  // create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ employee_id: '', exit_type: 'voluntary', exit_date: '', notes: '' })

  // override modal
  const [overrideTarget, setOverrideTarget] = useState<ExitRow | null>(null)
  const [overrideForm, setOverrideForm] = useState({ is_regrettable: true, override_reason: '' })
  const [overriding, setOverriding] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ex, rt, emp] = await Promise.all([
        api.listExits(),
        api.getRegrettableRate().catch(() => null),
        api.listEmployees().catch(() => []),
      ])
      setExits(Array.isArray(ex) ? ex : [])
      setRate(rt && typeof rt === 'object' ? (rt as RateResponse) : null)
      setEmployees(Array.isArray(emp) ? emp : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function refreshRate() {
    try {
      const rt = await api.getRegrettableRate()
      setRate(rt && typeof rt === 'object' ? (rt as RateResponse) : null)
    } catch {
      /* keep prior */
    }
  }

  async function submitCreate() {
    if (!form.employee_id) {
      setError('Pick an employee for the exit.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      await api.createExit({
        employee_id: form.employee_id,
        exit_type: form.exit_type,
        exit_date: form.exit_date || undefined,
        notes: form.notes || undefined,
      })
      setNotice('Exit recorded and auto-classified.')
      setCreateOpen(false)
      setForm({ employee_id: '', exit_type: 'voluntary', exit_date: '', notes: '' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record exit')
    } finally {
      setCreating(false)
    }
  }

  async function reclassify(row: ExitRow) {
    setBusyId(row.id)
    setError(null)
    try {
      await api.classifyExit(row.id)
      setNotice(`Re-ran classifier on ${row.full_name ?? 'exit'}.`)
      await load()
      await refreshRate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to classify exit')
    } finally {
      setBusyId(null)
    }
  }

  function openOverride(row: ExitRow) {
    setOverrideTarget(row)
    setOverrideForm({ is_regrettable: !row.is_regrettable, override_reason: row.override_reason ?? '' })
  }

  async function submitOverride() {
    if (!overrideTarget) return
    if (!overrideForm.override_reason.trim()) {
      setError('Override needs a reason.')
      return
    }
    setOverriding(true)
    setError(null)
    try {
      await api.overrideExit(overrideTarget.id, {
        is_regrettable: overrideForm.is_regrettable,
        override_reason: overrideForm.override_reason.trim(),
      })
      setNotice('Exit reclassification overridden.')
      setOverrideTarget(null)
      await load()
      await refreshRate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to override exit')
    } finally {
      setOverriding(false)
    }
  }

  async function remove(row: ExitRow) {
    if (!confirm(`Delete the exit record for ${row.full_name ?? 'this employee'}?`)) return
    setBusyId(row.id)
    setError(null)
    try {
      await api.deleteExit(row.id)
      setNotice('Exit deleted.')
      await load()
      await refreshRate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete exit')
    } finally {
      setBusyId(null)
    }
  }

  const types = useMemo(() => {
    const s = new Set<string>(EXIT_TYPES)
    exits.forEach((e) => e.exit_type && s.add(e.exit_type))
    return Array.from(s)
  }, [exits])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exits.filter((e) => {
      if (typeFilter !== 'all' && e.exit_type !== typeFilter) return false
      if (regFilter === 'regrettable' && !e.is_regrettable) return false
      if (regFilter === 'non' && e.is_regrettable) return false
      if (!q) return true
      return (
        (e.full_name ?? '').toLowerCase().includes(q) ||
        (e.email ?? '').toLowerCase().includes(q) ||
        (e.department_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [exits, search, typeFilter, regFilter])

  const summary = useMemo(() => {
    const total = exits.length
    const regrettable = exits.filter((e) => e.is_regrettable).length
    const overridden = exits.filter((e) => e.manually_overridden).length
    return { total, regrettable, overridden }
  }, [exits])

  const trend = rate?.byPeriod ?? []
  const trendMax = Math.max(...trend.map((p) => (p.rate <= 1 ? p.rate * 100 : p.rate)), 1)

  if (loading) return <PageSpinner label="Loading exits..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Exits</h1>
          <p className="mt-1 text-sm text-stone-400">
            Record departures, track the regrettable rate, and override classifications.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Record exit</Button>
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
        <Stat label="Total exits" value={summary.total} />
        <Stat label="Regrettable" value={summary.regrettable} tone="rose" />
        <Stat label="Overall regrettable rate" value={fmtPct(rate?.overall)} tone="amber" />
        <Stat label="Manual overrides" value={summary.overridden} />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Regrettable rate trend</h2>
          <p className="text-xs text-stone-500">Per-period share of exits classified regrettable.</p>
        </CardHeader>
        <CardBody>
          {trend.length === 0 ? (
            <p className="text-sm text-stone-500">No trend data yet. Record exits to populate the trend.</p>
          ) : (
            <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 180 }}>
              {trend.map((p) => {
                const v = p.rate <= 1 ? p.rate * 100 : p.rate
                const h = Math.max(4, (v / trendMax) * 150)
                return (
                  <div key={p.period} className="flex min-w-[44px] flex-1 flex-col items-center gap-1">
                    <span className="text-xs tabular-nums text-indigo-300">{v.toFixed(0)}%</span>
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-indigo-600/40 to-indigo-400"
                      style={{ height: `${h}px` }}
                      title={`${p.regrettable}/${p.total} regrettable`}
                    />
                    <span className="whitespace-nowrap text-[10px] text-stone-500">{p.period}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, dept…"
              className="w-56 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={regFilter}
              onChange={(e) => setRegFilter(e.target.value as typeof regFilter)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            >
              <option value="all">All outcomes</option>
              <option value="regrettable">Regrettable only</option>
              <option value="non">Non-regrettable</option>
            </select>
          </div>
          <span className="text-xs text-stone-500">
            {filtered.length} of {exits.length} shown
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {exits.length === 0 ? (
            <EmptyState
              title="No exits recorded"
              description="Record a departure to auto-classify whether it is regrettable."
              action={<Button onClick={() => setCreateOpen(true)}>Record exit</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches" description="Adjust your filters or search." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Type</TH>
                  <TH>Exit date</TH>
                  <TH>Classification</TH>
                  <TH className="text-right">Score</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <div className="font-medium text-white">{e.full_name ?? e.employee_id}</div>
                      {e.department_name && <div className="text-xs text-stone-500">{e.department_name}</div>}
                    </TD>
                    <TD className="text-stone-400">{e.exit_type}</TD>
                    <TD className="text-stone-400">{fmtDate(e.exit_date)}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Badge tone={e.is_regrettable ? 'critical' : 'green'}>
                          {e.is_regrettable ? 'Regrettable' : 'Non-regrettable'}
                        </Badge>
                        {e.manually_overridden && <Badge tone="amber">Overridden</Badge>}
                      </div>
                      {(e.override_reason || e.classification_reason) && (
                        <div className="mt-1 max-w-xs truncate text-xs text-stone-500">
                          {e.override_reason || e.classification_reason}
                        </div>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums text-indigo-300">
                      {e.regrettable_score === undefined || e.regrettable_score === null
                        ? '—'
                        : e.regrettable_score.toFixed(0)}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          disabled={busyId === e.id}
                          onClick={() => reclassify(e)}
                        >
                          {busyId === e.id ? '…' : 'Classify'}
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => openOverride(e)}
                        >
                          Override
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          disabled={busyId === e.id}
                          onClick={() => remove(e)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record exit"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating ? <Spinner label="Saving..." /> : 'Record exit'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Employee</span>
            <select
              value={form.employee_id}
              onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            >
              <option value="">Select an employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                  {emp.email ? ` · ${emp.email}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Exit type</span>
            <select
              value={form.exit_type}
              onChange={(e) => setForm((p) => ({ ...p, exit_type: e.target.value }))}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            >
              {EXIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Exit date</span>
            <input
              type="date"
              value={form.exit_date}
              onChange={(e) => setForm((p) => ({ ...p, exit_date: e.target.value }))}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Context, stated reason, etc."
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={!!overrideTarget}
        onClose={() => setOverrideTarget(null)}
        title={`Override · ${overrideTarget?.full_name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverrideTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitOverride} disabled={overriding}>
              {overriding ? <Spinner label="Saving..." /> : 'Apply override'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-stone-400">
            Auto-classification:{' '}
            <Badge tone={overrideTarget?.is_regrettable ? 'critical' : 'green'}>
              {overrideTarget?.is_regrettable ? 'Regrettable' : 'Non-regrettable'}
            </Badge>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
              Reclassify as
            </span>
            <select
              value={overrideForm.is_regrettable ? 'yes' : 'no'}
              onChange={(e) =>
                setOverrideForm((p) => ({ ...p, is_regrettable: e.target.value === 'yes' }))
              }
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            >
              <option value="yes">Regrettable</option>
              <option value="no">Non-regrettable</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
              Override reason
            </span>
            <textarea
              value={overrideForm.override_reason}
              onChange={(e) => setOverrideForm((p) => ({ ...p, override_reason: e.target.value }))}
              rows={3}
              placeholder="Why is the manual classification correct?"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
