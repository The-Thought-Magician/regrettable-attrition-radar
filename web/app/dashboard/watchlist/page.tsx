'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Employee {
  id: string
  full_name: string
  email?: string | null
  level?: string | null
  status?: string | null
  department_id?: string | null
}

interface RiskScore {
  score: number
  band: string
}

interface WatchlistRow {
  id: string
  employee_id: string
  reason: string | null
  owner: string | null
  status: string
  next_review: string | null
  created_at: string
  employee: Employee | null
  risk: RiskScore | null
}

const STATUS_OPTIONS = ['watching', 'engaging', 'stay_interview', 'retained', 'lost', 'closed']

function statusTone(status: string): 'neutral' | 'amber' | 'green' | 'rose' | 'moderate' {
  switch (status) {
    case 'watching':
      return 'amber'
    case 'engaging':
    case 'stay_interview':
      return 'moderate'
    case 'retained':
      return 'green'
    case 'lost':
      return 'rose'
    default:
      return 'neutral'
  }
}

function humanizeStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function reviewState(next: string | null): { label: string; tone: 'neutral' | 'amber' | 'rose' | 'green' } {
  if (!next) return { label: 'No review set', tone: 'neutral' }
  const d = new Date(next)
  const now = new Date()
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  const dateStr = d.toLocaleDateString(undefined, { dateStyle: 'medium' })
  if (days < 0) return { label: `Overdue · ${dateStr}`, tone: 'rose' }
  if (days <= 7) return { label: `Due ${dateStr}`, tone: 'amber' }
  return { label: dateStr, tone: 'green' }
}

export default function WatchlistPage() {
  const [rows, setRows] = useState<WatchlistRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Add modal state
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    employee_id: '',
    reason: '',
    owner: '',
    status: 'watching',
    next_review: '',
  })
  const [saving, setSaving] = useState(false)

  // Edit modal state
  const [editRow, setEditRow] = useState<WatchlistRow | null>(null)
  const [editForm, setEditForm] = useState({
    reason: '',
    owner: '',
    status: 'watching',
    next_review: '',
  })

  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [wl, emps] = await Promise.all([api.listWatchlist(), api.listEmployees()])
      setRows(Array.isArray(wl) ? wl : [])
      setEmployees(Array.isArray(emps) ? emps : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const watchedIds = useMemo(() => new Set(rows.map((r) => r.employee_id)), [rows])
  const availableEmployees = useMemo(
    () => employees.filter((e) => !watchedIds.has(e.id)),
    [employees, watchedIds],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      const name = r.employee?.full_name?.toLowerCase() ?? ''
      const owner = r.owner?.toLowerCase() ?? ''
      const reason = r.reason?.toLowerCase() ?? ''
      return name.includes(q) || owner.includes(q) || reason.includes(q)
    })
  }, [rows, search, statusFilter])

  const stats = useMemo(() => {
    const total = rows.length
    const overdue = rows.filter((r) => {
      if (!r.next_review) return false
      return new Date(r.next_review).getTime() < Date.now()
    }).length
    const highRisk = rows.filter((r) => {
      const b = (r.risk?.band ?? '').toLowerCase()
      return b === 'high' || b === 'critical'
    }).length
    const retained = rows.filter((r) => r.status === 'retained').length
    return { total, overdue, highRisk, retained }
  }, [rows])

  function openAdd() {
    setActionError(null)
    setAddForm({ employee_id: '', reason: '', owner: '', status: 'watching', next_review: '' })
    setAddOpen(true)
  }

  async function submitAdd() {
    if (!addForm.employee_id) {
      setActionError('Select an employee to add.')
      return
    }
    setSaving(true)
    setActionError(null)
    try {
      await api.addToWatchlist({
        employee_id: addForm.employee_id,
        reason: addForm.reason || undefined,
        owner: addForm.owner || undefined,
        status: addForm.status || undefined,
        next_review: addForm.next_review || undefined,
      })
      setAddOpen(false)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to add to watchlist')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(row: WatchlistRow) {
    setActionError(null)
    setEditRow(row)
    setEditForm({
      reason: row.reason ?? '',
      owner: row.owner ?? '',
      status: row.status ?? 'watching',
      next_review: row.next_review ? row.next_review.slice(0, 10) : '',
    })
  }

  async function submitEdit() {
    if (!editRow) return
    setSaving(true)
    setActionError(null)
    try {
      await api.updateWatchlist(editRow.id, {
        reason: editForm.reason || undefined,
        owner: editForm.owner || undefined,
        status: editForm.status || undefined,
        next_review: editForm.next_review ? editForm.next_review : null,
      })
      setEditRow(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update watchlist entry')
    } finally {
      setSaving(false)
    }
  }

  async function quickStatus(row: WatchlistRow, status: string) {
    setBusyId(row.id)
    setActionError(null)
    try {
      await api.updateWatchlist(row.id, { status })
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(row: WatchlistRow) {
    if (!window.confirm(`Remove ${row.employee?.full_name ?? 'this employee'} from the watchlist?`)) return
    setBusyId(row.id)
    setActionError(null)
    try {
      await api.removeFromWatchlist(row.id)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to remove entry')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading watchlist..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Retention Watchlist</h1>
          <p className="mt-1 text-sm text-stone-400">
            Track at-risk talent, assign owners, and schedule stay reviews.
          </p>
        </div>
        <Button onClick={openAdd}>+ Add to watchlist</Button>
      </div>

      {error && (
        <Card className="border-rose-500/40">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-sm text-rose-300">{error}</span>
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {actionError && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="On watchlist" value={stats.total} />
        <Stat label="High / critical risk" value={stats.highRisk} tone="rose" />
        <Stat label="Reviews overdue" value={stats.overdue} tone="amber" />
        <Stat label="Retained" value={stats.retained} tone="green" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, owner, or reason…"
            className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none sm:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                statusFilter === 'all'
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                  : 'border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              All
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  statusFilter === s
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                {humanizeStatus(s)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={rows.length === 0 ? 'No one on the watchlist yet' : 'No matches'}
                description={
                  rows.length === 0
                    ? 'Add at-risk employees to monitor their flight risk and plan interventions.'
                    : 'Try a different search term or status filter.'
                }
                icon="👀"
                action={
                  rows.length === 0 ? (
                    <Button onClick={openAdd}>+ Add to watchlist</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Flight Risk</TH>
                  <TH>Reason</TH>
                  <TH>Owner</TH>
                  <TH>Status</TH>
                  <TH>Next Review</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row) => {
                  const review = reviewState(row.next_review)
                  return (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/dashboard/employees/${row.employee_id}`}
                          className="font-medium text-stone-100 hover:text-indigo-300"
                        >
                          {row.employee?.full_name ?? 'Unknown employee'}
                        </Link>
                        {row.employee?.level && (
                          <div className="text-xs text-stone-500">{row.employee.level}</div>
                        )}
                      </TD>
                      <TD>
                        {row.risk ? (
                          <div className="flex items-center gap-2">
                            <Badge tone={bandTone(row.risk.band)}>{row.risk.band}</Badge>
                            <span className="text-xs tabular-nums text-stone-400">
                              {Math.round(row.risk.score)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-stone-500">Not scored</span>
                        )}
                      </TD>
                      <TD className="max-w-xs">
                        <span className="line-clamp-2 text-stone-300">{row.reason || '—'}</span>
                      </TD>
                      <TD>{row.owner || <span className="text-stone-500">Unassigned</span>}</TD>
                      <TD>
                        <select
                          value={row.status}
                          disabled={busyId === row.id}
                          onChange={(e) => quickStatus(row, e.target.value)}
                          className="rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {humanizeStatus(s)}
                            </option>
                          ))}
                        </select>
                      </TD>
                      <TD>
                        <Badge tone={review.tone}>{review.label}</Badge>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {busyId === row.id && <Spinner className="!gap-0" />}
                          <Button variant="ghost" onClick={() => openEdit(row)} disabled={busyId === row.id}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => remove(row)} disabled={busyId === row.id}>
                            Remove
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

      {/* Add modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add to watchlist"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={saving}>
              {saving ? 'Adding…' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Employee">
            <select
              value={addForm.employee_id}
              onChange={(e) => setAddForm({ ...addForm, employee_id: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select an employee…</option>
              {availableEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.level ? ` · ${e.level}` : ''}
                </option>
              ))}
            </select>
            {availableEmployees.length === 0 && (
              <p className="mt-1 text-xs text-stone-500">
                All employees are already on the watchlist.
              </p>
            )}
          </Field>
          <Field label="Reason">
            <textarea
              value={addForm.reason}
              onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
              rows={2}
              placeholder="Why are we watching this person?"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner">
              <input
                value={addForm.owner}
                onChange={(e) => setAddForm({ ...addForm, owner: e.target.value })}
                placeholder="e.g. Jane (HRBP)"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none"
              />
            </Field>
            <Field label="Status">
              <select
                value={addForm.status}
                onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {humanizeStatus(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Next review">
            <input
              type="date"
              value={addForm.next_review}
              onChange={(e) => setAddForm({ ...addForm, next_review: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
            />
          </Field>
          {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title={editRow ? `Edit · ${editRow.employee?.full_name ?? 'Entry'}` : 'Edit'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRow(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Reason">
            <textarea
              value={editForm.reason}
              onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner">
              <input
                value={editForm.owner}
                onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              />
            </Field>
            <Field label="Status">
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {humanizeStatus(s)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Next review">
            <input
              type="date"
              value={editForm.next_review}
              onChange={(e) => setEditForm({ ...editForm, next_review: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
            />
          </Field>
          {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
        </div>
      </Modal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">{label}</span>
      {children}
    </label>
  )
}
