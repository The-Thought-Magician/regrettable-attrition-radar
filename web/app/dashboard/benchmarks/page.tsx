'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Benchmark {
  id: string
  user_id?: string
  key: string
  label: string
  value: number | null
  default_value: number | null
  unit: string | null
  created_at?: string
}

function fmtVal(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null) return '—'
  const u = (unit ?? '').toLowerCase()
  if (u === 'usd' || u === '$') return `$${Math.round(v).toLocaleString()}`
  if (u === 'pct' || u === '%') return `${v}%`
  if (u) return `${v} ${unit}`
  return String(v)
}

export default function BenchmarksPage() {
  const [items, setItems] = useState<Benchmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listBenchmarks()
      const list: Benchmark[] = Array.isArray(data) ? data : []
      setItems(list)
      const d: Record<string, string> = {}
      for (const b of list) d[b.id] = b.value != null ? String(b.value) : ''
      setDrafts(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load benchmarks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (b) => b.label.toLowerCase().includes(q) || b.key.toLowerCase().includes(q),
    )
  }, [items, search])

  const overrides = useMemo(
    () => items.filter((b) => b.default_value != null && b.value !== b.default_value).length,
    [items],
  )

  function isDirty(b: Benchmark): boolean {
    const draft = drafts[b.id] ?? ''
    const current = b.value != null ? String(b.value) : ''
    return draft !== current
  }

  async function save(b: Benchmark) {
    const raw = drafts[b.id] ?? ''
    if (raw === '' || isNaN(Number(raw))) {
      setError(`"${b.label}" must be a number`)
      return
    }
    setSavingId(b.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await api.updateBenchmark(b.id, { value: Number(raw) })
      setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...updated } : x)))
      setNotice(`Saved "${b.label}"`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  function revertToDefault(b: Benchmark) {
    if (b.default_value == null) return
    setDrafts((d) => ({ ...d, [b.id]: String(b.default_value) }))
  }

  async function resetAll() {
    if (!confirm('Reset every benchmark to its default value?')) return
    setResetting(true)
    setError(null)
    setNotice(null)
    try {
      await api.resetBenchmarks()
      await load()
      setNotice('All benchmarks reset to defaults')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <PageSpinner label="Loading benchmarks..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Assumptions & Benchmarks</h1>
          <p className="mt-1 text-sm text-stone-400">
            The economic assumptions behind replacement cost, ROI, and retention math. Tune them to your org.
          </p>
        </div>
        <Button variant="secondary" onClick={resetAll} disabled={resetting}>
          {resetting ? 'Resetting...' : 'Reset all to defaults'}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}{' '}
          <button onClick={load} className="ml-2 underline hover:text-rose-200">
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Benchmarks" value={items.length} />
        <Stat label="Overridden from Default" value={overrides} tone={overrides > 0 ? 'amber' : 'default'} />
        <Stat label="At Default" value={items.length - overrides} tone="green" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search benchmarks..."
            className="flex-1 min-w-[200px] rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/60 focus:outline-none"
          />
          <span className="text-xs text-stone-500">
            {filtered.length} of {items.length}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={items.length === 0 ? 'No benchmarks' : 'No matches'}
                description={
                  items.length === 0
                    ? 'Defaults are seeded automatically on first load. Try refreshing.'
                    : 'Try a different search.'
                }
                action={items.length === 0 ? <Button onClick={load}>Refresh</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Benchmark</TH>
                  <TH>Default</TH>
                  <TH>Current Value</TH>
                  <TH>Unit</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((b) => {
                  const dirty = isDirty(b)
                  const overridden = b.default_value != null && b.value !== b.default_value
                  return (
                    <TR key={b.id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{b.label}</span>
                          {overridden && <Badge tone="amber">overridden</Badge>}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-stone-600">{b.key}</div>
                      </TD>
                      <TD className="tabular-nums text-stone-400">
                        {fmtVal(b.default_value, b.unit)}
                      </TD>
                      <TD>
                        <input
                          type="number"
                          step="any"
                          value={drafts[b.id] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                          className={`w-32 rounded-md border bg-stone-950 px-2 py-1.5 text-sm text-stone-200 focus:outline-none ${
                            dirty ? 'border-indigo-500/60' : 'border-stone-700 focus:border-indigo-500/60'
                          }`}
                        />
                      </TD>
                      <TD className="text-stone-400">{b.unit || '—'}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          {b.default_value != null && b.value !== b.default_value && (
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              onClick={() => revertToDefault(b)}
                              title="Set field to default value"
                            >
                              Use default
                            </Button>
                          )}
                          <Button
                            variant={dirty ? 'primary' : 'secondary'}
                            className="px-3 py-1 text-xs"
                            onClick={() => save(b)}
                            disabled={!dirty || savingId === b.id}
                          >
                            {savingId === b.id ? '...' : 'Save'}
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
    </div>
  )
}
