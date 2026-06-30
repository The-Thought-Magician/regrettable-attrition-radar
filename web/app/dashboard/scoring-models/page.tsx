'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface ScoringModel {
  id: string
  name: string
  description: string | null
  version: number
  is_active: boolean
  band_thresholds: Record<string, number> | null
  created_at: string
}

interface Band {
  min: number
  max: number
  score: number
}

interface ScoringFactor {
  id?: string
  factor_key: string
  label: string
  weight: number
  bands: Band[]
}

const BAND_ORDER = ['low', 'moderate', 'elevated', 'high', 'critical']

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

export default function ScoringModelsPage() {
  const [models, setModels] = useState<ScoringModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ model: ScoringModel; factors: ScoringFactor[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // editable working copy of factors + thresholds
  const [factorDraft, setFactorDraft] = useState<ScoringFactor[]>([])
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, number>>({})
  const [factorsDirty, setFactorsDirty] = useState(false)
  const [savingFactors, setSavingFactors] = useState(false)
  const [activating, setActivating] = useState(false)

  // model meta edit
  const [metaForm, setMetaForm] = useState({ name: '', description: '' })
  const [metaDirty, setMetaDirty] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  const [busyDelete, setBusyDelete] = useState(false)

  async function loadModels(selectFirst = false) {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listScoringModels()
      const arr: ScoringModel[] = Array.isArray(list) ? list : []
      setModels(arr)
      if (selectFirst || !selectedId) {
        const active = arr.find((m) => m.is_active) ?? arr[0]
        if (active) setSelectedId(active.id)
        else setSelectedId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scoring models')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModels(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadDetail(id: string) {
    setDetailLoading(true)
    setActionError(null)
    try {
      const data = await api.getScoringModel(id)
      const model: ScoringModel = data.model
      const factors: ScoringFactor[] = Array.isArray(data.factors)
        ? data.factors.map((f: ScoringFactor) => ({
            ...f,
            bands: Array.isArray(f.bands) ? f.bands : [],
          }))
        : []
      setDetail({ model, factors })
      setFactorDraft(factors.map((f) => ({ ...f, bands: f.bands.map((b) => ({ ...b })) })))
      setThresholdDraft({ ...(model.band_thresholds ?? {}) })
      setMetaForm({ name: model.name ?? '', description: model.description ?? '' })
      setFactorsDirty(false)
      setMetaDirty(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to load model detail')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const totalWeight = useMemo(
    () => factorDraft.reduce((sum, f) => sum + num(f.weight), 0),
    [factorDraft],
  )

  function updateFactor(idx: number, patch: Partial<ScoringFactor>) {
    setFactorDraft((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
    setFactorsDirty(true)
  }

  function updateBand(fIdx: number, bIdx: number, patch: Partial<Band>) {
    setFactorDraft((prev) =>
      prev.map((f, i) =>
        i === fIdx ? { ...f, bands: f.bands.map((b, j) => (j === bIdx ? { ...b, ...patch } : b)) } : f,
      ),
    )
    setFactorsDirty(true)
  }

  function addBand(fIdx: number) {
    setFactorDraft((prev) =>
      prev.map((f, i) => (i === fIdx ? { ...f, bands: [...f.bands, { min: 0, max: 0, score: 0 }] } : f)),
    )
    setFactorsDirty(true)
  }

  function removeBand(fIdx: number, bIdx: number) {
    setFactorDraft((prev) =>
      prev.map((f, i) => (i === fIdx ? { ...f, bands: f.bands.filter((_, j) => j !== bIdx) } : f)),
    )
    setFactorsDirty(true)
  }

  function addFactor() {
    setFactorDraft((prev) => [
      ...prev,
      { factor_key: '', label: '', weight: 1, bands: [{ min: 0, max: 0, score: 0 }] },
    ])
    setFactorsDirty(true)
  }

  function removeFactor(idx: number) {
    setFactorDraft((prev) => prev.filter((_, i) => i !== idx))
    setFactorsDirty(true)
  }

  function updateThreshold(band: string, value: number) {
    setThresholdDraft((prev) => ({ ...prev, [band]: value }))
    setFactorsDirty(true)
  }

  async function saveFactors() {
    if (!selectedId) return
    for (const f of factorDraft) {
      if (!f.factor_key.trim() || !f.label.trim()) {
        setActionError('Every factor needs a key and a label.')
        return
      }
    }
    setSavingFactors(true)
    setActionError(null)
    try {
      await api.updateScoringFactors(selectedId, {
        factors: factorDraft.map((f) => ({
          factor_key: f.factor_key.trim(),
          label: f.label.trim(),
          weight: num(f.weight),
          bands: f.bands.map((b) => ({ min: num(b.min), max: num(b.max), score: num(b.score) })),
        })),
        band_thresholds: thresholdDraft,
      })
      await loadDetail(selectedId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save factors')
    } finally {
      setSavingFactors(false)
    }
  }

  async function saveMeta() {
    if (!selectedId) return
    if (!metaForm.name.trim()) {
      setActionError('Model name is required.')
      return
    }
    setSavingMeta(true)
    setActionError(null)
    try {
      await api.updateScoringModel(selectedId, {
        name: metaForm.name.trim(),
        description: metaForm.description.trim() || undefined,
      })
      await loadModels()
      await loadDetail(selectedId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save model')
    } finally {
      setSavingMeta(false)
    }
  }

  async function activate() {
    if (!selectedId) return
    setActivating(true)
    setActionError(null)
    try {
      await api.activateScoringModel(selectedId)
      await loadModels()
      await loadDetail(selectedId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to activate model')
    } finally {
      setActivating(false)
    }
  }

  async function create() {
    if (!createForm.name.trim()) {
      setActionError('Model name is required.')
      return
    }
    setCreating(true)
    setActionError(null)
    try {
      const created: ScoringModel = await api.createScoringModel({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
      })
      setCreateOpen(false)
      setCreateForm({ name: '', description: '' })
      await loadModels()
      if (created?.id) setSelectedId(created.id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to create model')
    } finally {
      setCreating(false)
    }
  }

  async function remove(model: ScoringModel) {
    if (!window.confirm(`Delete scoring model "${model.name}"? This cannot be undone.`)) return
    setBusyDelete(true)
    setActionError(null)
    try {
      await api.deleteScoringModel(model.id)
      if (selectedId === model.id) setSelectedId(null)
      await loadModels(true)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete model')
    } finally {
      setBusyDelete(false)
    }
  }

  if (loading) return <PageSpinner label="Loading scoring models..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scoring Models</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure flight-risk factor weights and risk band thresholds.
          </p>
        </div>
        <Button onClick={() => { setActionError(null); setCreateOpen(true) }}>+ New model</Button>
      </div>

      {error && (
        <Card className="border-rose-500/40">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-sm text-rose-300">{error}</span>
            <Button variant="secondary" onClick={() => loadModels(true)}>
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

      {models.length === 0 ? (
        <EmptyState
          title="No scoring models yet"
          description="Create a model to define how flight-risk scores are weighted and banded."
          icon="🎯"
          action={<Button onClick={() => setCreateOpen(true)}>+ New model</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Model list */}
          <div className="space-y-2">
            {models.map((m) => {
              const selected = m.id === selectedId
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected
                      ? 'border-amber-500 bg-amber-500/5'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">{m.name}</span>
                    {m.is_active && <Badge tone="green">Active</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>v{m.version}</span>
                    {m.description && <span className="truncate">· {m.description}</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail editor */}
          <div className="space-y-6">
            {detailLoading ? (
              <Card>
                <CardBody>
                  <Spinner label="Loading model…" />
                </CardBody>
              </Card>
            ) : !detail ? (
              <EmptyState title="Select a model" description="Choose a model on the left to edit it." icon="←" />
            ) : (
              <>
                {/* Meta */}
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">Model details</h2>
                    <div className="flex items-center gap-2">
                      {detail.model.is_active ? (
                        <Badge tone="green">Active model</Badge>
                      ) : (
                        <Button variant="secondary" onClick={activate} disabled={activating}>
                          {activating ? 'Activating…' : 'Set active'}
                        </Button>
                      )}
                      <Button variant="danger" onClick={() => remove(detail.model)} disabled={busyDelete}>
                        Delete
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                          Name
                        </span>
                        <input
                          value={metaForm.name}
                          onChange={(e) => {
                            setMetaForm({ ...metaForm, name: e.target.value })
                            setMetaDirty(true)
                          }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                      <div className="flex items-end text-xs text-slate-500">
                        Version {detail.model.version} · created{' '}
                        {detail.model.created_at
                          ? new Date(detail.model.created_at).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })
                          : '—'}
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Description
                      </span>
                      <textarea
                        value={metaForm.description}
                        onChange={(e) => {
                          setMetaForm({ ...metaForm, description: e.target.value })
                          setMetaDirty(true)
                        }}
                        rows={2}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                      />
                    </label>
                    {metaDirty && (
                      <div className="flex justify-end">
                        <Button onClick={saveMeta} disabled={savingMeta}>
                          {savingMeta ? 'Saving…' : 'Save details (bumps version)'}
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Band thresholds */}
                <Card>
                  <CardHeader>
                    <h2 className="text-base font-semibold text-white">Risk band thresholds</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Minimum score for each band. Scores at or above a threshold fall into that band.
                    </p>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {BAND_ORDER.map((band) => (
                        <label key={band} className="block">
                          <span className="mb-1 flex items-center gap-1 text-xs font-medium capitalize text-slate-300">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                band === 'low'
                                  ? 'bg-emerald-400'
                                  : band === 'moderate'
                                    ? 'bg-sky-400'
                                    : band === 'elevated'
                                      ? 'bg-amber-400'
                                      : band === 'high'
                                        ? 'bg-orange-400'
                                        : 'bg-rose-400'
                              }`}
                            />
                            {band}
                          </span>
                          <input
                            type="number"
                            step="any"
                            value={thresholdDraft[band] ?? ''}
                            onChange={(e) => updateThreshold(band, num(e.target.value))}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm tabular-nums text-slate-200 focus:border-amber-500 focus:outline-none"
                          />
                        </label>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                {/* Factors */}
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white">Factor weights &amp; bands</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Total weight:{' '}
                        <span className="tabular-nums text-slate-300">{totalWeight.toFixed(2)}</span>
                      </p>
                    </div>
                    <Button variant="secondary" onClick={addFactor}>
                      + Add factor
                    </Button>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    {factorDraft.length === 0 ? (
                      <p className="text-sm text-slate-500">No factors defined. Add one to start scoring.</p>
                    ) : (
                      factorDraft.map((f, fIdx) => {
                        const weightPct = totalWeight > 0 ? (num(f.weight) / totalWeight) * 100 : 0
                        return (
                          <div
                            key={f.id ?? `new-${fIdx}`}
                            className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                          >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                  Factor key
                                </span>
                                <input
                                  value={f.factor_key}
                                  onChange={(e) => updateFactor(fIdx, { factor_key: e.target.value })}
                                  placeholder="compa_ratio"
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                  Label
                                </span>
                                <input
                                  value={f.label}
                                  onChange={(e) => updateFactor(fIdx, { label: e.target.value })}
                                  placeholder="Compensation ratio"
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                  Weight
                                </span>
                                <input
                                  type="number"
                                  step="any"
                                  value={f.weight}
                                  onChange={(e) => updateFactor(fIdx, { weight: num(e.target.value) })}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm tabular-nums text-slate-200 focus:border-amber-500 focus:outline-none"
                                />
                              </label>
                              <Button variant="ghost" onClick={() => removeFactor(fIdx)}>
                                Remove
                              </Button>
                            </div>

                            {/* Weight share bar */}
                            <div className="mt-3">
                              <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                                <span>Weight share</span>
                                <span className="tabular-nums">{weightPct.toFixed(0)}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-amber-500"
                                  style={{ width: `${Math.min(100, Math.max(0, weightPct))}%` }}
                                />
                              </div>
                            </div>

                            {/* Bands */}
                            <div className="mt-4">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                  Scoring bands (raw value range → score)
                                </span>
                                <button
                                  onClick={() => addBand(fIdx)}
                                  className="text-xs text-amber-400 hover:text-amber-300"
                                >
                                  + Add band
                                </button>
                              </div>
                              {f.bands.length === 0 ? (
                                <p className="text-xs text-slate-600">No bands. Add at least one.</p>
                              ) : (
                                <div className="space-y-2">
                                  {f.bands.map((b, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2"
                                    >
                                      <input
                                        type="number"
                                        step="any"
                                        value={b.min}
                                        onChange={(e) => updateBand(fIdx, bIdx, { min: num(e.target.value) })}
                                        placeholder="min"
                                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs tabular-nums text-slate-200 focus:border-amber-500 focus:outline-none"
                                      />
                                      <input
                                        type="number"
                                        step="any"
                                        value={b.max}
                                        onChange={(e) => updateBand(fIdx, bIdx, { max: num(e.target.value) })}
                                        placeholder="max"
                                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs tabular-nums text-slate-200 focus:border-amber-500 focus:outline-none"
                                      />
                                      <input
                                        type="number"
                                        step="any"
                                        value={b.score}
                                        onChange={(e) =>
                                          updateBand(fIdx, bIdx, { score: num(e.target.value) })
                                        }
                                        placeholder="score"
                                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs tabular-nums text-amber-300 focus:border-amber-500 focus:outline-none"
                                      />
                                      <button
                                        onClick={() => removeBand(fIdx, bIdx)}
                                        className="px-2 text-slate-500 hover:text-rose-400"
                                        aria-label="Remove band"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </CardBody>
                  <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
                    <span className="text-xs text-slate-500">
                      {factorsDirty ? 'Unsaved changes' : 'All changes saved'}
                    </span>
                    <Button onClick={saveFactors} disabled={savingFactors || !factorsDirty}>
                      {savingFactors ? 'Saving…' : 'Save factors & thresholds'}
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New scoring model"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={create} disabled={creating}>
              {creating ? 'Creating…' : 'Create model'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. 2026 Flight-Risk Model"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Description
            </span>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              rows={2}
              placeholder="Optional. Default factors are seeded automatically."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <p className="text-xs text-slate-500">
            A starter set of factors is seeded on creation; tune their weights and bands afterward.
          </p>
          {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
        </div>
      </Modal>
    </div>
  )
}
