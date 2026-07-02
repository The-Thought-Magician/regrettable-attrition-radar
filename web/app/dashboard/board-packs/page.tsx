'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface BoardPack {
  id: string
  title: string
  period: string
  metrics?: Record<string, unknown> | null
  narrative?: string | null
  created_at: string
}

function defaultPeriod() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return `Q${q} ${now.getFullYear()}`
}

function metricSummary(metrics?: Record<string, unknown> | null): string {
  if (!metrics) return '—'
  const keys = Object.keys(metrics)
  return keys.length ? `${keys.length} metrics` : '—'
}

export default function BoardPacksPage() {
  const [packs, setPacks] = useState<BoardPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [assembleOpen, setAssembleOpen] = useState(false)
  const [form, setForm] = useState({ title: '', period: defaultPeriod() })
  const [assembling, setAssembling] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const rows = await api.listBoardPacks()
      setPacks(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load board packs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openAssemble() {
    const period = defaultPeriod()
    setForm({ title: `Retention board pack — ${period}`, period })
    setAssembleOpen(true)
  }

  async function assemble() {
    if (!form.title.trim() || !form.period.trim()) return
    setAssembling(true)
    setError(null)
    try {
      await api.createBoardPack({ title: form.title.trim(), period: form.period.trim() })
      setAssembleOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assemble board pack')
    } finally {
      setAssembling(false)
    }
  }

  async function remove(p: BoardPack) {
    if (!confirm(`Delete board pack "${p.title}"?`)) return
    setError(null)
    try {
      await api.deleteBoardPack(p.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete board pack')
    }
  }

  const byPeriod = useMemo(() => {
    const set = new Set(packs.map((p) => p.period))
    return set.size
  }, [packs])

  const latest = packs[0]

  if (loading) return <PageSpinner label="Loading board packs..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Board Packs</h1>
          <p className="mt-1 text-sm text-stone-400">
            Assemble a board-ready retention briefing for a period. Each pack snapshots the headline metrics
            and an auto-written narrative.
          </p>
        </div>
        <Button onClick={openAssemble}>Assemble board pack</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Board packs" value={packs.length} />
        <Stat label="Periods covered" value={byPeriod} tone="amber" />
        <Stat
          label="Latest pack"
          value={latest?.period ?? '—'}
          sub={latest ? new Date(latest.created_at).toLocaleDateString() : 'None assembled yet'}
        />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-200">All board packs</h2>
          <span className="text-xs text-stone-500">{packs.length} total</span>
        </CardHeader>
        <CardBody className="p-0">
          {packs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No board packs yet"
                description="Assemble your first pack to snapshot retention metrics and a narrative for leadership."
                action={<Button onClick={openAssemble}>Assemble board pack</Button>}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Period</TH>
                  <TH>Metrics</TH>
                  <TH>Narrative</TH>
                  <TH>Assembled</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {packs.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium text-white">
                      <Link href={`/dashboard/board-packs/${p.id}`} className="hover:text-indigo-400">
                        {p.title}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone="amber">{p.period}</Badge>
                    </TD>
                    <TD className="text-stone-400">{metricSummary(p.metrics)}</TD>
                    <TD className="text-stone-400">{p.narrative ? `${p.narrative.length} chars` : '—'}</TD>
                    <TD className="text-stone-400">{new Date(p.created_at).toLocaleDateString()}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/board-packs/${p.id}`}>
                          <Button variant="ghost">Open</Button>
                        </Link>
                        <Button
                          variant="ghost"
                          className="text-rose-400 hover:bg-rose-500/10"
                          onClick={() => remove(p)}
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
        open={assembleOpen}
        onClose={() => setAssembleOpen(false)}
        title="Assemble board pack"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssembleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={assemble} disabled={assembling || !form.title.trim() || !form.period.trim()}>
              {assembling ? 'Assembling...' : 'Assemble'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-400">
            Metrics and the narrative are computed from your current data at assembly time. Pick the reporting
            period below.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Period</label>
            <input
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
              placeholder="e.g. Q2 2026"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500/60 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
