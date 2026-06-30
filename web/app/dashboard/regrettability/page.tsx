'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'

interface Criterion {
  field: string
  op: string
  value: string
  weight?: number
}

interface RegrettabilityRule {
  id: string
  user_id?: string
  name: string
  is_active: boolean
  threshold: number | null
  criteria: Criterion[] | Record<string, unknown> | null
  created_at?: string
}

const FIELDS = [
  'performance_rating',
  'risk_band',
  'risk_score',
  'is_critical',
  'unique_skill',
  'succession_depth',
  'compa_ratio',
  'level',
  'span_of_control',
  'tenure_months',
]

const OPS = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'in']

type FormState = {
  name: string
  threshold: string
  criteria: Criterion[]
}

const EMPTY_FORM: FormState = {
  name: '',
  threshold: '0.5',
  criteria: [{ field: 'performance_rating', op: 'gte', value: '4', weight: 1 }],
}

function normalizeCriteria(c: RegrettabilityRule['criteria']): Criterion[] {
  if (Array.isArray(c)) return c as Criterion[]
  if (c && typeof c === 'object' && Array.isArray((c as Record<string, unknown>).rules)) {
    return (c as Record<string, unknown>).rules as Criterion[]
  }
  return []
}

export default function RegrettabilityPage() {
  const [rules, setRules] = useState<RegrettabilityRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RegrettabilityRule | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listRegrettabilityRules()
      setRules(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rule sets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const active = rules.find((r) => r.is_active)
    return {
      total: rules.length,
      active: active?.name ?? 'None',
      activeThreshold: active?.threshold != null ? active.threshold : null,
      avgCriteria:
        rules.length > 0
          ? Math.round(
              (rules.reduce((s, r) => s + normalizeCriteria(r.criteria).length, 0) / rules.length) * 10,
            ) / 10
          : 0,
    }
  }, [rules])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, criteria: [{ field: 'performance_rating', op: 'gte', value: '4', weight: 1 }] })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(r: RegrettabilityRule) {
    setEditing(r)
    const crit = normalizeCriteria(r.criteria)
    setForm({
      name: r.name ?? '',
      threshold: r.threshold != null ? String(r.threshold) : '0.5',
      criteria: crit.length > 0 ? crit.map((c) => ({ ...c, weight: c.weight ?? 1 })) : [{ field: 'performance_rating', op: 'gte', value: '4', weight: 1 }],
    })
    setFormError(null)
    setModalOpen(true)
  }

  function updateCriterion(idx: number, patch: Partial<Criterion>) {
    setForm((f) => ({
      ...f,
      criteria: f.criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))
  }

  function addCriterion() {
    setForm((f) => ({
      ...f,
      criteria: [...f.criteria, { field: 'risk_band', op: 'in', value: 'high,critical', weight: 1 }],
    }))
  }

  function removeCriterion(idx: number) {
    setForm((f) => ({ ...f, criteria: f.criteria.filter((_, i) => i !== idx) }))
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    if (form.criteria.length === 0) {
      setFormError('Add at least one criterion')
      return
    }
    setSaving(true)
    setFormError(null)
    const body = {
      name: form.name.trim(),
      threshold: form.threshold === '' ? null : Number(form.threshold),
      criteria: form.criteria.map((c) => ({
        field: c.field,
        op: c.op,
        value: c.value,
        weight: c.weight != null ? Number(c.weight) : 1,
      })),
    }
    try {
      if (editing) {
        await api.updateRegrettabilityRule(editing.id, body)
      } else {
        await api.createRegrettabilityRule(body)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function activate(r: RegrettabilityRule) {
    setBusyId(r.id)
    setError(null)
    try {
      await api.activateRegrettabilityRule(r.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activate failed')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(r: RegrettabilityRule) {
    if (!confirm(`Delete rule set "${r.name}"?`)) return
    setBusyId(r.id)
    setError(null)
    try {
      await api.deleteRegrettabilityRule(r.id)
      setRules((prev) => prev.filter((x) => x.id !== r.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading rule sets..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Regrettability Rule Sets</h1>
          <p className="mt-1 text-sm text-slate-400">
            Define what makes an exit regrettable. The active rule set drives auto-classification of exits.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Rule Set</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}{' '}
          <button onClick={load} className="ml-2 underline hover:text-rose-200">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Rule Sets" value={stats.total} />
        <Stat label="Active Rule Set" value={<span className="text-base">{stats.active}</span>} tone="amber" />
        <Stat
          label="Active Threshold"
          value={stats.activeThreshold != null ? stats.activeThreshold : '—'}
        />
        <Stat label="Avg Criteria / Set" value={stats.avgCriteria} />
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No rule sets yet"
          description="Create a rule set describing the signals (high performance, critical role, succession gap) that make an exit regrettable."
          action={<Button onClick={openCreate}>Create your first rule set</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rules.map((r) => {
            const crit = normalizeCriteria(r.criteria)
            return (
              <Card key={r.id} className={r.is_active ? 'ring-1 ring-amber-500/40' : ''}>
                <CardHeader className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-white">{r.name}</h3>
                      {r.is_active ? (
                        <Badge tone="amber">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Threshold {r.threshold != null ? r.threshold : '—'} · {crit.length} criteria
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!r.is_active && (
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => activate(r)}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id ? '...' : 'Activate'}
                      </Button>
                    )}
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      onClick={() => remove(r)}
                      disabled={busyId === r.id}
                    >
                      Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  {crit.length === 0 ? (
                    <p className="text-sm text-slate-500">No criteria defined.</p>
                  ) : (
                    <ul className="space-y-2">
                      {crit.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs"
                        >
                          <span className="font-mono text-slate-300">
                            <span className="text-amber-300">{c.field}</span>{' '}
                            <span className="text-slate-500">{c.op}</span>{' '}
                            <span className="text-sky-300">{String(c.value)}</span>
                          </span>
                          {c.weight != null && (
                            <Badge tone="neutral">×{c.weight}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Rule Set' : 'New Rule Set'}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. High-performer in critical role"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Threshold (regrettable score cutoff)
              </label>
              <input
                type="number"
                step="any"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder="0.5"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">Criteria</label>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={addCriterion}>
                + Add criterion
              </Button>
            </div>
            <div className="space-y-2">
              {form.criteria.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2"
                >
                  <select
                    value={c.field}
                    onChange={(e) => updateCriterion(i, { field: e.target.value })}
                    className="col-span-4 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
                  >
                    {FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => updateCriterion(i, { op: e.target.value })}
                    className="col-span-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
                  >
                    {OPS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <input
                    value={c.value}
                    onChange={(e) => updateCriterion(i, { value: e.target.value })}
                    placeholder="value"
                    className="col-span-3 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="any"
                    value={c.weight ?? 1}
                    onChange={(e) => updateCriterion(i, { weight: Number(e.target.value) })}
                    title="weight"
                    className="col-span-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
                  />
                  <button
                    onClick={() => removeCriterion(i)}
                    className="col-span-1 text-slate-500 hover:text-rose-400"
                    aria-label="Remove criterion"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-600">
              For the <span className="font-mono">in</span> operator, use a comma-separated list (e.g.{' '}
              <span className="font-mono">high,critical</span>).
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
