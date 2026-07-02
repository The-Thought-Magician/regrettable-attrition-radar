'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface BoardPack {
  id: string
  title: string
  period: string
  metrics: Record<string, unknown> | null
  narrative: string | null
  created_at: string
}

const CURRENCY_HINTS = ['cost', 'exposure', 'spend', 'budget', 'avoided', 'salary', 'dollar', 'usd']
const PERCENT_HINTS = ['rate', 'pct', 'percent', 'ratio', 'utilization', 'util']

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim()
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatValue(key: string, value: unknown): { display: string; tone: 'default' | 'amber' | 'rose' | 'green' } {
  const lk = key.toLowerCase()
  if (typeof value === 'number') {
    if (CURRENCY_HINTS.some((h) => lk.includes(h))) {
      return { display: `$${formatNumber(value)}`, tone: 'amber' }
    }
    if (PERCENT_HINTS.some((h) => lk.includes(h))) {
      const pct = value <= 1 ? value * 100 : value
      const tone = pct >= 15 ? 'rose' : pct >= 8 ? 'amber' : 'green'
      return { display: `${formatNumber(pct)}%`, tone }
    }
    return { display: formatNumber(value), tone: 'default' }
  }
  if (typeof value === 'boolean') return { display: value ? 'Yes' : 'No', tone: 'default' }
  if (value === null || value === undefined) return { display: '—', tone: 'default' }
  return { display: String(value), tone: 'default' }
}

// A metric value can be a scalar (-> stat card) or an array of objects (-> table).
function partitionMetrics(metrics: Record<string, unknown>) {
  const scalars: Array<[string, unknown]> = []
  const tables: Array<[string, Array<Record<string, unknown>>]> = []
  const blobs: Array<[string, unknown]> = []
  for (const [k, v] of Object.entries(metrics)) {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      scalars.push([k, v])
    } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
      tables.push([k, v as Array<Record<string, unknown>>])
    } else if (Array.isArray(v)) {
      blobs.push([k, v])
    } else if (typeof v === 'object') {
      // nested object -> flatten its scalar entries with prefixed keys
      const obj = v as Record<string, unknown>
      const nestedScalars = Object.entries(obj).filter(
        ([, nv]) => nv === null || ['number', 'string', 'boolean'].includes(typeof nv),
      )
      if (nestedScalars.length > 0 && nestedScalars.length === Object.keys(obj).length) {
        for (const [nk, nv] of nestedScalars) scalars.push([`${k}.${nk}`, nv])
      } else {
        blobs.push([k, v])
      }
    } else {
      blobs.push([k, v])
    }
  }
  return { scalars, tables, blobs }
}

export default function BoardPackDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [pack, setPack] = useState<BoardPack | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setError(null)
    api
      .getBoardPack(id)
      .then((data) => {
        if (active) setPack(data)
      })
      .catch((e) => {
        if (active) setError(e?.message ?? 'Failed to load board pack')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  async function handleDelete() {
    if (!id || !pack) return
    if (!window.confirm(`Delete board pack "${pack.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.deleteBoardPack(id)
      router.push('/dashboard/board-packs')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete board pack')
      setDeleting(false)
    }
  }

  if (loading) return <PageSpinner label="Loading board pack..." />

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/board-packs" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Back to board packs
        </Link>
        <EmptyState
          title="Could not load board pack"
          description={error}
          icon="⚠"
          action={
            <Button variant="secondary" onClick={() => router.refresh()}>
              Retry
            </Button>
          }
        />
      </div>
    )
  }

  if (!pack) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/board-packs" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Back to board packs
        </Link>
        <EmptyState title="Board pack not found" description="It may have been deleted." icon="📄" />
      </div>
    )
  }

  const metrics = pack.metrics && typeof pack.metrics === 'object' ? pack.metrics : {}
  const { scalars, tables, blobs } = partitionMetrics(metrics)
  const hasMetrics = scalars.length > 0 || tables.length > 0 || blobs.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link href="/dashboard/board-packs" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to board packs
          </Link>
          <h1 className="text-2xl font-bold text-white">{pack.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-400">
            <Badge tone="amber">{pack.period}</Badge>
            <span>
              Assembled{' '}
              {pack.created_at
                ? new Date(pack.created_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'recently'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>

      {/* Scalar metrics as stat cards */}
      {scalars.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {scalars.map(([key, value]) => {
            const { display, tone } = formatValue(key, value)
            return <Stat key={key} label={humanizeKey(key)} value={display} tone={tone} />
          })}
        </div>
      )}

      {/* Narrative */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Board Narrative</h2>
        </CardHeader>
        <CardBody>
          {pack.narrative ? (
            <div className="space-y-3 text-sm leading-relaxed text-stone-300">
              {pack.narrative.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">No narrative was generated for this period.</p>
          )}
        </CardBody>
      </Card>

      {/* Tabular metrics */}
      {tables.map(([key, rows]) => {
        const columns = Array.from(
          rows.reduce((set, row) => {
            Object.keys(row).forEach((k) => set.add(k))
            return set
          }, new Set<string>()),
        )
        return (
          <Card key={key}>
            <CardHeader>
              <h2 className="text-base font-semibold text-white">{humanizeKey(key)}</h2>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-900/80 text-xs uppercase tracking-wide text-stone-400">
                    <tr>
                      {columns.map((col) => (
                        <th key={col} className="px-4 py-3 font-medium">
                          {humanizeKey(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {rows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-stone-900/50">
                        {columns.map((col) => {
                          const { display } = formatValue(col, row[col])
                          return (
                            <td key={col} className="px-4 py-3 tabular-nums text-stone-200">
                              {display}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )
      })}

      {/* Raw fallback for anything we couldn't structure */}
      {blobs.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Additional Data</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {blobs.map(([key, value]) => (
              <div key={key}>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">
                  {humanizeKey(key)}
                </div>
                <pre className="overflow-x-auto rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-xs text-stone-300">
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {!hasMetrics && !pack.narrative && (
        <EmptyState
          title="This board pack is empty"
          description="No metrics or narrative were recorded for this period."
          icon="📊"
        />
      )}
    </div>
  )
}
