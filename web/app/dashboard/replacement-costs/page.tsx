'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

interface CostModel {
  id: string
  role_family: string
  salary_multiplier: number
  agency_pct: number
  weeks_to_productivity: number
  onboarding_cost: number
  knowledge_transfer_cost: number
  created_at?: string
}

interface ExposureRow {
  employee_id: string
  full_name?: string | null
  department_name?: string | null
  role_family?: string | null
  band?: string | null
  total_cost: number
}

interface Exposure {
  total: number
  byDepartment: Array<{ department: string; total: number; count?: number }>
  byBand: Array<{ band: string; total: number; count?: number }>
  rows: ExposureRow[]
}

const MODEL_FIELDS: { key: keyof CostModel; label: string; step?: string; hint?: string }[] = [
  { key: 'salary_multiplier', label: 'Salary multiplier', step: '0.1', hint: '× annual salary' },
  { key: 'agency_pct', label: 'Agency %', step: '0.01', hint: 'fraction, e.g. 0.2' },
  { key: 'weeks_to_productivity', label: 'Weeks to productivity', step: '1' },
  { key: 'onboarding_cost', label: 'Onboarding cost', step: '100' },
  { key: 'knowledge_transfer_cost', label: 'Knowledge transfer cost', step: '100' },
]

function emptyModelForm() {
  return {
    role_family: '',
    salary_multiplier: '1',
    agency_pct: '0.2',
    weeks_to_productivity: '12',
    onboarding_cost: '0',
    knowledge_transfer_cost: '0',
  }
}

function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export default function ReplacementCostsPage() {
  const [exposure, setExposure] = useState<Exposure | null>(null)
  const [models, setModels] = useState<CostModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)

  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CostModel | null>(null)
  const [form, setForm] = useState(emptyModelForm())
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [exp, mdl] = await Promise.all([
        api.getReplacementExposure().catch(() => null),
        api.listReplacementCostModels().catch(() => []),
      ])
      setExposure(exp && typeof exp === 'object' ? (exp as Exposure) : null)
      setModels(Array.isArray(mdl) ? mdl : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load replacement costs')
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
    setNotice(null)
    try {
      const res = await api.computeReplacementCosts()
      const count = res?.computed ?? (Array.isArray(res?.costs) ? res.costs.length : 0)
      setNotice(`Recomputed replacement costs for ${count} employee${count === 1 ? '' : 's'}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compute replacement costs')
    } finally {
      setComputing(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyModelForm())
    setModalOpen(true)
  }

  function openEdit(m: CostModel) {
    setEditing(m)
    setForm({
      role_family: m.role_family,
      salary_multiplier: String(m.salary_multiplier),
      agency_pct: String(m.agency_pct),
      weeks_to_productivity: String(m.weeks_to_productivity),
      onboarding_cost: String(m.onboarding_cost),
      knowledge_transfer_cost: String(m.knowledge_transfer_cost),
    })
    setModalOpen(true)
  }

  async function saveModel() {
    if (!form.role_family.trim()) {
      setError('Role family is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body = {
        role_family: form.role_family.trim(),
        salary_multiplier: Number(form.salary_multiplier) || 0,
        agency_pct: Number(form.agency_pct) || 0,
        weeks_to_productivity: Number(form.weeks_to_productivity) || 0,
        onboarding_cost: Number(form.onboarding_cost) || 0,
        knowledge_transfer_cost: Number(form.knowledge_transfer_cost) || 0,
      }
      if (editing) {
        await api.updateReplacementCostModel(editing.id, body)
        setNotice('Cost model updated. Recompute to refresh exposure.')
      } else {
        await api.createReplacementCostModel(body)
        setNotice('Cost model created. Recompute to refresh exposure.')
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save cost model')
    } finally {
      setSaving(false)
    }
  }

  const rows = exposure?.rows ?? []
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.department_name ?? '').toLowerCase().includes(q) ||
        (r.role_family ?? '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const byDept = exposure?.byDepartment ?? []
  const byBand = exposure?.byBand ?? []
  const deptMax = Math.max(...byDept.map((d) => d.total), 1)
  const bandMax = Math.max(...byBand.map((b) => b.total), 1)

  if (loading) return <PageSpinner label="Loading replacement-cost exposure..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Replacement Costs</h1>
          <p className="mt-1 text-sm text-stone-400">
            Total exposure if at-risk employees leave, plus the cost models that drive the math.
          </p>
        </div>
        <Button onClick={recompute} disabled={computing}>
          {computing ? <Spinner label="Computing..." /> : 'Recompute costs'}
        </Button>
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
        <Stat label="Total exposure" value={fmtMoney(exposure?.total)} tone="rose" />
        <Stat label="Employees costed" value={rows.length} />
        <Stat label="Departments" value={byDept.length} />
        <Stat label="Cost models" value={models.length} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Exposure by department</h2>
          </CardHeader>
          <CardBody>
            {byDept.length === 0 ? (
              <p className="text-sm text-stone-500">No exposure yet. Recompute costs to populate.</p>
            ) : (
              <div className="space-y-2.5">
                {byDept.map((d) => (
                  <div key={d.department} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 truncate text-sm text-stone-300">{d.department || '—'}</div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-800">
                      <div
                        className="h-full rounded-full bg-indigo-500/70"
                        style={{ width: `${Math.max(2, (d.total / deptMax) * 100)}%` }}
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right tabular-nums text-sm text-stone-300">
                      {fmtMoney(d.total)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Exposure by risk band</h2>
          </CardHeader>
          <CardBody>
            {byBand.length === 0 ? (
              <p className="text-sm text-stone-500">No exposure yet. Recompute costs to populate.</p>
            ) : (
              <div className="space-y-2.5">
                {byBand.map((b) => (
                  <div key={b.band} className="flex items-center gap-3">
                    <div className="w-32 shrink-0">
                      <Badge tone={bandTone(b.band)}>{b.band || '—'}</Badge>
                    </div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-800">
                      <div
                        className="h-full rounded-full bg-rose-500/70"
                        style={{ width: `${Math.max(2, (b.total / bandMax) * 100)}%` }}
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right tabular-nums text-sm text-stone-300">
                      {fmtMoney(b.total)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-white">Per-employee exposure</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, dept, role family…"
            className="w-64 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
          />
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="No per-employee costs yet"
              description="Recompute replacement costs to estimate exposure for each employee."
              action={
                <Button onClick={recompute} disabled={computing}>
                  {computing ? 'Computing...' : 'Recompute costs'}
                </Button>
              }
            />
          ) : filteredRows.length === 0 ? (
            <EmptyState title="No matches" description="Try a different search." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Department</TH>
                  <TH>Role family</TH>
                  <TH>Band</TH>
                  <TH className="text-right">Total cost</TH>
                </TR>
              </THead>
              <TBody>
                {filteredRows.map((r) => (
                  <TR key={r.employee_id}>
                    <TD className="font-medium text-white">{r.full_name ?? r.employee_id}</TD>
                    <TD className="text-stone-400">{r.department_name ?? '—'}</TD>
                    <TD className="text-stone-400">{r.role_family ?? '—'}</TD>
                    <TD>{r.band ? <Badge tone={bandTone(r.band)}>{r.band}</Badge> : '—'}</TD>
                    <TD className="text-right tabular-nums font-semibold text-rose-300">{fmtMoney(r.total_cost)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Cost models</h2>
            <p className="text-xs text-stone-500">One model per role family drives the replacement-cost formula.</p>
          </div>
          <Button onClick={openCreate}>New model</Button>
        </CardHeader>
        <CardBody className="p-0">
          {models.length === 0 ? (
            <EmptyState
              title="No cost models"
              description="Add a model per role family to control multipliers and fixed costs."
              action={<Button onClick={openCreate}>New model</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Role family</TH>
                  <TH className="text-right">Salary ×</TH>
                  <TH className="text-right">Agency %</TH>
                  <TH className="text-right">Weeks to prod.</TH>
                  <TH className="text-right">Onboarding</TH>
                  <TH className="text-right">Knowledge xfer</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {models.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-medium text-white">{m.role_family}</TD>
                    <TD className="text-right tabular-nums text-stone-300">{m.salary_multiplier}</TD>
                    <TD className="text-right tabular-nums text-stone-300">
                      {(m.agency_pct <= 1 ? m.agency_pct * 100 : m.agency_pct).toFixed(0)}%
                    </TD>
                    <TD className="text-right tabular-nums text-stone-300">{m.weeks_to_productivity}</TD>
                    <TD className="text-right tabular-nums text-stone-300">{fmtMoney(m.onboarding_cost)}</TD>
                    <TD className="text-right tabular-nums text-stone-300">{fmtMoney(m.knowledge_transfer_cost)}</TD>
                    <TD className="text-right">
                      <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => openEdit(m)}>
                        Edit
                      </Button>
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
        title={editing ? `Edit model · ${editing.role_family}` : 'New cost model'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveModel} disabled={saving}>
              {saving ? <Spinner label="Saving..." /> : editing ? 'Save changes' : 'Create model'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Role family</span>
            <input
              value={form.role_family}
              onChange={(e) => setForm((p) => ({ ...p, role_family: e.target.value }))}
              placeholder="e.g. Engineering"
              disabled={!!editing}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none disabled:opacity-60"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MODEL_FIELDS.map((f) => (
              <label key={String(f.key)} className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
                  {f.label}
                  {f.hint && <span className="ml-1 text-stone-600 normal-case">({f.hint})</span>}
                </span>
                <input
                  type="number"
                  step={f.step ?? 'any'}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
