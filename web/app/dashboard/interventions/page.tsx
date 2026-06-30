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
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Intervention {
  id: string
  user_id?: string
  name: string
  kind: string
  description: string | null
  cost: number | null
  risk_reduction: number | null
  addresses_driver: string | null
  created_at?: string
}

const KINDS = ['compensation', 'promotion', 'development', 'manager', 'workload', 'recognition', 'flexibility', 'retention_bonus', 'other']

const KIND_TONES: Record<string, 'low' | 'moderate' | 'elevated' | 'high' | 'amber' | 'green' | 'neutral'> = {
  compensation: 'amber',
  retention_bonus: 'amber',
  promotion: 'high',
  development: 'moderate',
  manager: 'elevated',
  workload: 'high',
  recognition: 'green',
  flexibility: 'moderate',
  other: 'neutral',
}

type FormState = {
  name: string
  kind: string
  description: string
  cost: string
  risk_reduction: string
  addresses_driver: string
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'compensation',
  description: '',
  cost: '',
  risk_reduction: '',
  addresses_driver: '',
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  // risk_reduction stored as fraction (0..1) — render as percentage
  const v = n <= 1 ? n * 100 : n
  return `${v.toFixed(0)}%`
}

export default function InterventionsPage() {
  const [items, setItems] = useState<Intervention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Intervention | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listInterventions()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load interventions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (kindFilter !== 'all' && it.kind !== kindFilter) return false
      if (!q) return true
      return (
        it.name.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q) ||
        (it.addresses_driver ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, search, kindFilter])

  const stats = useMemo(() => {
    const count = items.length
    const totalCost = items.reduce((s, it) => s + (it.cost ?? 0), 0)
    const avgReduction =
      count > 0
        ? items.reduce((s, it) => s + (it.risk_reduction ?? 0), 0) / count
        : 0
    const kinds = new Set(items.map((it) => it.kind)).size
    return { count, totalCost, avgReduction, kinds }
  }, [items])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(it: Intervention) {
    setEditing(it)
    setForm({
      name: it.name ?? '',
      kind: it.kind ?? 'other',
      description: it.description ?? '',
      cost: it.cost != null ? String(it.cost) : '',
      risk_reduction: it.risk_reduction != null ? String(it.risk_reduction) : '',
      addresses_driver: it.addresses_driver ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      kind: form.kind,
      description: form.description.trim() || null,
      cost: form.cost === '' ? null : Number(form.cost),
      risk_reduction: form.risk_reduction === '' ? null : Number(form.risk_reduction),
      addresses_driver: form.addresses_driver.trim() || null,
    }
    try {
      if (editing) {
        await api.updateIntervention(editing.id, body)
      } else {
        await api.createIntervention(body)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove(it: Intervention) {
    if (!confirm(`Delete intervention "${it.name}"? This cannot be undone.`)) return
    setDeletingId(it.id)
    try {
      await api.deleteIntervention(it.id)
      setItems((prev) => prev.filter((x) => x.id !== it.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading interventions..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Intervention Catalog</h1>
          <p className="mt-1 text-sm text-slate-400">
            Retention levers the optimizer can deploy against flight risk. Define cost and expected risk reduction.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Intervention</Button>
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
        <Stat label="Interventions" value={stats.count} />
        <Stat label="Catalog Spend / Unit" value={fmtMoney(stats.totalCost)} tone="amber" />
        <Stat label="Avg Risk Reduction" value={fmtPct(stats.avgReduction)} tone="green" />
        <Stat label="Lever Types" value={stats.kinds} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, description, driver..."
            className="flex-1 min-w-[200px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
          />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
          >
            <option value="all">All types</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {filtered.length} of {items.length}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={items.length === 0 ? 'No interventions yet' : 'No matches'}
                description={
                  items.length === 0
                    ? 'Build a catalog of retention levers so the ROI optimizer can recommend targeted actions.'
                    : 'Try a different search or filter.'
                }
                action={
                  items.length === 0 ? <Button onClick={openCreate}>Add your first intervention</Button> : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Addresses Driver</TH>
                  <TH className="text-right">Cost</TH>
                  <TH className="text-right">Risk Reduction</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((it) => (
                  <TR key={it.id}>
                    <TD>
                      <div className="font-medium text-white">{it.name}</div>
                      {it.description && (
                        <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">{it.description}</div>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={KIND_TONES[it.kind] ?? 'neutral'}>{it.kind.replace(/_/g, ' ')}</Badge>
                    </TD>
                    <TD className="text-slate-400">{it.addresses_driver || '—'}</TD>
                    <TD className="text-right tabular-nums text-amber-300">{fmtMoney(it.cost)}</TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{
                              width: `${Math.min(100, ((it.risk_reduction ?? 0) <= 1 ? (it.risk_reduction ?? 0) * 100 : (it.risk_reduction ?? 0)))}%`,
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-emerald-300">{fmtPct(it.risk_reduction)}</span>
                      </div>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(it)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          onClick={() => remove(it)}
                          disabled={deletingId === it.id}
                        >
                          {deletingId === it.id ? '...' : 'Delete'}
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Intervention' : 'New Intervention'}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Off-cycle equity refresh"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Addresses Driver</label>
              <input
                value={form.addresses_driver}
                onChange={(e) => setForm({ ...form, addresses_driver: e.target.value })}
                placeholder="e.g. compensation"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Cost (USD)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                placeholder="0"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Risk Reduction (0–1 or %)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.risk_reduction}
                onChange={(e) => setForm({ ...form, risk_reduction: e.target.value })}
                placeholder="0.15"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="What the intervention does and when to apply it..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
