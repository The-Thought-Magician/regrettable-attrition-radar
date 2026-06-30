'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Driver {
  id: string
  name: string
  category: string
  description?: string
  created_at: string
}

interface DriverRecord {
  id: string
  exit_id: string
  driver_id: string
  severity: number
  notes?: string
  created_at: string
  driver_name?: string
  employee_name?: string
  exit_date?: string
}

interface ExitRow {
  id: string
  employee_id: string
  employee_name?: string
  exit_type?: string
  exit_date?: string
  is_regrettable?: boolean
}

interface RankingRow {
  driver_id: string
  name?: string
  driver_name?: string
  category?: string
  count: number
  frequency?: number
  regrettable_weighted?: number
  weighted_score?: number
  score?: number
}

interface TrendRow {
  period: string
  count: number
}

interface Aggregate {
  ranking: RankingRow[]
  trend: TrendRow[]
}

const CATEGORIES = ['Compensation', 'Management', 'Career', 'Workload', 'Culture', 'Recognition', 'Location', 'Other']

const sevTone = (s: number) =>
  s >= 4 ? ('critical' as const) : s >= 3 ? ('high' as const) : s >= 2 ? ('elevated' as const) : ('low' as const)

const blankDriver = { name: '', category: 'Compensation', description: '' }

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [records, setRecords] = useState<DriverRecord[]>([])
  const [exits, setExits] = useState<ExitRow[]>([])
  const [aggregate, setAggregate] = useState<Aggregate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'ranking' | 'register' | 'records'>('ranking')

  const [driverModal, setDriverModal] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [driverForm, setDriverForm] = useState(blankDriver)
  const [savingDriver, setSavingDriver] = useState(false)

  const [recordModal, setRecordModal] = useState(false)
  const [recordForm, setRecordForm] = useState({ exit_id: '', driver_id: '', severity: 3, notes: '' })
  const [savingRecord, setSavingRecord] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [d, r, e, agg] = await Promise.all([
        api.listExitDrivers(),
        api.listDriverRecords(),
        api.listExits(),
        api.getDriverAggregate(),
      ])
      setDrivers(Array.isArray(d) ? d : [])
      setRecords(Array.isArray(r) ? r : [])
      setExits(Array.isArray(e) ? e : [])
      setAggregate(agg ?? { ranking: [], trend: [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exit drivers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreateDriver() {
    setEditing(null)
    setDriverForm(blankDriver)
    setDriverModal(true)
  }

  function openEditDriver(d: Driver) {
    setEditing(d)
    setDriverForm({ name: d.name, category: d.category, description: d.description ?? '' })
    setDriverModal(true)
  }

  async function saveDriver() {
    if (!driverForm.name.trim()) return
    setSavingDriver(true)
    setError(null)
    try {
      if (editing) {
        await api.updateExitDriver(editing.id, driverForm)
      } else {
        await api.createExitDriver(driverForm)
      }
      setDriverModal(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save driver')
    } finally {
      setSavingDriver(false)
    }
  }

  async function removeDriver(d: Driver) {
    if (!confirm(`Delete driver "${d.name}"? Existing records referencing it may be affected.`)) return
    setError(null)
    try {
      await api.deleteExitDriver(d.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete driver')
    }
  }

  function openCreateRecord() {
    setRecordForm({
      exit_id: exits[0]?.id ?? '',
      driver_id: drivers[0]?.id ?? '',
      severity: 3,
      notes: '',
    })
    setRecordModal(true)
  }

  async function saveRecord() {
    if (!recordForm.exit_id || !recordForm.driver_id) return
    setSavingRecord(true)
    setError(null)
    try {
      await api.createDriverRecord({
        exit_id: recordForm.exit_id,
        driver_id: recordForm.driver_id,
        severity: Number(recordForm.severity),
        notes: recordForm.notes || undefined,
      })
      setRecordModal(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach driver')
    } finally {
      setSavingRecord(false)
    }
  }

  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? id
  const exitLabel = (id: string) => {
    const x = exits.find((e) => e.id === id)
    if (!x) return id
    return `${x.employee_name ?? 'Employee'}${x.exit_date ? ` · ${x.exit_date}` : ''}`
  }

  const ranking = useMemo(() => {
    const rows = aggregate?.ranking ?? []
    return rows.map((r) => ({
      ...r,
      label: r.name ?? r.driver_name ?? driverName(r.driver_id),
      freq: r.count ?? r.frequency ?? 0,
      weighted: r.regrettable_weighted ?? r.weighted_score ?? r.score ?? 0,
    }))
  }, [aggregate, drivers])

  const maxWeighted = useMemo(() => Math.max(1, ...ranking.map((r) => r.weighted)), [ranking])
  const trend = aggregate?.trend ?? []
  const maxTrend = useMemo(() => Math.max(1, ...trend.map((t) => t.count)), [trend])

  const totalRecords = records.length
  const avgSeverity =
    records.length > 0 ? records.reduce((s, r) => s + (r.severity || 0), 0) / records.length : 0

  if (loading) return <PageSpinner label="Loading exit drivers..." />

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'ranking', label: 'Aggregate ranking' },
    { key: 'register', label: `Driver register (${drivers.length})` },
    { key: 'records', label: `Records (${records.length})` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Exit Drivers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Why people leave. Maintain the driver register, tag exits, and rank drivers by frequency and
            regrettable-weighted impact.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openCreateRecord} disabled={drivers.length === 0 || exits.length === 0}>
            Tag an exit
          </Button>
          <Button onClick={openCreateDriver}>Add driver</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Drivers tracked" value={drivers.length} />
        <Stat label="Tagged records" value={totalRecords} />
        <Stat label="Avg severity" value={avgSeverity.toFixed(1)} tone="amber" />
        <Stat
          label="Top driver"
          value={ranking[0]?.label ?? '—'}
          sub={ranking[0] ? `${ranking[0].freq} exits` : 'No data yet'}
          tone="rose"
        />
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ranking' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-200">Driver ranking</h2>
              <p className="text-xs text-slate-500">Bars show regrettable-weighted impact; count is raw frequency.</p>
            </CardHeader>
            <CardBody>
              {ranking.length === 0 ? (
                <EmptyState
                  title="No driver data yet"
                  description="Tag exits with drivers to build the ranking."
                  action={
                    <Button onClick={openCreateRecord} disabled={drivers.length === 0 || exits.length === 0}>
                      Tag an exit
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {ranking.map((r, i) => (
                    <div key={r.driver_id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-200">
                          <span className="w-5 text-right tabular-nums text-slate-500">{i + 1}.</span>
                          {r.label}
                        </span>
                        <span className="tabular-nums text-slate-400">
                          {r.freq} exits · {r.weighted.toFixed(1)} wt
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
                          style={{ width: `${Math.max(4, (r.weighted / maxWeighted) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-200">Trend</h2>
              <p className="text-xs text-slate-500">Driver records per period.</p>
            </CardHeader>
            <CardBody>
              {trend.length === 0 ? (
                <EmptyState title="No trend yet" description="Records will chart here over time." />
              ) : (
                <div className="flex h-40 items-end gap-2">
                  {trend.map((t) => (
                    <div key={t.period} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-amber-500/70"
                          style={{ height: `${Math.max(4, (t.count / maxTrend) * 100)}%` }}
                          title={`${t.period}: ${t.count}`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{t.period}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'register' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Driver register</h2>
            <Button variant="secondary" onClick={openCreateDriver}>
              Add driver
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {drivers.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No drivers defined"
                  description="Create the categories of reasons people leave, then tag exits to them."
                  action={<Button onClick={openCreateDriver}>Add driver</Button>}
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Driver</TH>
                    <TH>Category</TH>
                    <TH>Description</TH>
                    <TH className="text-right">Records</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {drivers.map((d) => {
                    const cnt = records.filter((r) => r.driver_id === d.id).length
                    return (
                      <TR key={d.id}>
                        <TD className="font-medium text-white">{d.name}</TD>
                        <TD>
                          <Badge tone="neutral">{d.category}</Badge>
                        </TD>
                        <TD className="max-w-md text-slate-400">{d.description || '—'}</TD>
                        <TD className="text-right tabular-nums">{cnt}</TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => openEditDriver(d)}>
                              Edit
                            </Button>
                            <Button variant="ghost" className="text-rose-400 hover:bg-rose-500/10" onClick={() => removeDriver(d)}>
                              Delete
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'records' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Driver records</h2>
            <Button variant="secondary" onClick={openCreateRecord} disabled={drivers.length === 0 || exits.length === 0}>
              Tag an exit
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {records.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No records yet"
                  description={
                    exits.length === 0
                      ? 'Record exits first, then attach the drivers behind them.'
                      : 'Attach drivers to recorded exits to explain attrition.'
                  }
                  action={
                    drivers.length > 0 && exits.length > 0 ? (
                      <Button onClick={openCreateRecord}>Tag an exit</Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Exit</TH>
                    <TH>Driver</TH>
                    <TH className="text-right">Severity</TH>
                    <TH>Notes</TH>
                  </TR>
                </THead>
                <TBody>
                  {records.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-slate-200">{r.employee_name ?? exitLabel(r.exit_id)}</TD>
                      <TD className="font-medium text-white">{r.driver_name ?? driverName(r.driver_id)}</TD>
                      <TD className="text-right">
                        <Badge tone={sevTone(r.severity)}>{r.severity}</Badge>
                      </TD>
                      <TD className="max-w-md text-slate-400">{r.notes || '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={driverModal}
        onClose={() => setDriverModal(false)}
        title={editing ? 'Edit driver' : 'Add exit driver'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDriverModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveDriver} disabled={savingDriver || !driverForm.name.trim()}>
              {savingDriver ? 'Saving...' : editing ? 'Save changes' : 'Create driver'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</label>
            <input
              value={driverForm.name}
              onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
              placeholder="e.g. Below-market compensation"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Category</label>
            <select
              value={driverForm.category}
              onChange={(e) => setDriverForm({ ...driverForm, category: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Description</label>
            <textarea
              value={driverForm.description}
              onChange={(e) => setDriverForm({ ...driverForm, description: e.target.value })}
              rows={3}
              placeholder="Optional context on this driver"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={recordModal}
        onClose={() => setRecordModal(false)}
        title="Tag an exit with a driver"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecordModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveRecord} disabled={savingRecord || !recordForm.exit_id || !recordForm.driver_id}>
              {savingRecord ? 'Saving...' : 'Attach driver'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Exit</label>
            <select
              value={recordForm.exit_id}
              onChange={(e) => setRecordForm({ ...recordForm, exit_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              {exits.map((x) => (
                <option key={x.id} value={x.id}>
                  {exitLabel(x.id)}
                  {x.is_regrettable ? ' (regrettable)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Driver</label>
            <select
              value={recordForm.driver_id}
              onChange={(e) => setRecordForm({ ...recordForm, driver_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Severity: {recordForm.severity}
            </label>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={recordForm.severity}
              onChange={(e) => setRecordForm({ ...recordForm, severity: Number(e.target.value) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>1 minor</span>
              <span>5 decisive</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Notes</label>
            <textarea
              value={recordForm.notes}
              onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
              rows={3}
              placeholder="Optional notes from the exit interview"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
