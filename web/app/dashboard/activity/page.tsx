'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Activity {
  id: string
  entity_type: string
  entity_id: string | null
  action: string
  detail?: unknown
  created_at: string
}

function actionTone(action: string) {
  const a = (action || '').toLowerCase()
  if (a.includes('delete') || a.includes('remove') || a.includes('dismiss')) return 'rose'
  if (a.includes('create') || a.includes('add') || a.includes('import') || a.includes('seed')) return 'green'
  if (a.includes('update') || a.includes('edit') || a.includes('override') || a.includes('activate')) return 'amber'
  if (a.includes('compute') || a.includes('evaluate') || a.includes('generate') || a.includes('classify')) return 'moderate'
  return 'neutral'
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function dayKey(iso?: string) {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function summarizeDetail(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  try {
    const json = JSON.stringify(detail)
    return json.length > 120 ? json.slice(0, 117) + '…' : json
  } catch {
    return String(detail)
  }
}

export default function ActivityPage() {
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entityType, setEntityType] = useState('all')
  const [action, setAction] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async (params?: Record<string, unknown>) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listActivity(params)
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Server-side entity_type filter (query param honored by backend), reloads on change.
  useEffect(() => {
    if (entityType === 'all') {
      load()
    } else {
      load({ entity_type: entityType })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType])

  const entityTypes = useMemo(
    () => Array.from(new Set(items.map((i) => i.entity_type).filter(Boolean))).sort(),
    [items]
  )
  const actions = useMemo(
    () => Array.from(new Set(items.map((i) => i.action).filter(Boolean))).sort(),
    [items]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (action !== 'all' && i.action !== action) return false
      if (q) {
        const hay = `${i.entity_type} ${i.entity_id ?? ''} ${i.action} ${summarizeDetail(i.detail)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, action, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const item of visible) {
      const key = dayKey(item.created_at)
      const arr = map.get(key)
      if (arr) arr.push(item)
      else map.set(key, [item])
    }
    return Array.from(map.entries())
  }, [visible])

  if (loading) return <PageSpinner label="Loading activity..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Activity Log</h1>
          <p className="mt-1 text-sm text-stone-500">
            Full audit trail of every create, update, delete, and computation across the platform.
          </p>
        </div>
        <Button variant="secondary" onClick={() => load(entityType === 'all' ? undefined : { entity_type: entityType })}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Log entries" value={items.length} />
        <Stat label="Showing" value={visible.length} tone="amber" />
        <Stat label="Entity types" value={entityTypes.length} />
        <Stat label="Action types" value={actions.length} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-white">Audit trail</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-xs text-stone-200 focus:border-indigo-500/50 focus:outline-none"
            >
              <option value="all">All entities</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-xs text-stone-200 focus:border-indigo-500/50 focus:outline-none"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-xs text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/50 focus:outline-none"
            />
          </div>
        </CardHeader>
        <CardBody>
          {items.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Actions you take across the platform will appear here as an audit trail."
            />
          ) : visible.length === 0 ? (
            <EmptyState title="No matching entries" description="Adjust the filters or search to see more." />
          ) : (
            <div className="space-y-6">
              {grouped.map(([day, entries]) => (
                <div key={day}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{day}</span>
                    <span className="text-xs text-stone-600">({entries.length})</span>
                    <div className="h-px flex-1 bg-stone-800" />
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Time</TH>
                        <TH>Action</TH>
                        <TH>Entity</TH>
                        <TH>Reference</TH>
                        <TH>Detail</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {entries.map((i) => {
                        const isOpen = expanded === i.id
                        const detailStr = (() => {
                          try {
                            return typeof i.detail === 'string' ? i.detail : JSON.stringify(i.detail, null, 2)
                          } catch {
                            return String(i.detail)
                          }
                        })()
                        const hasDetail = i.detail != null && detailStr !== 'null' && detailStr !== ''
                        return (
                          <TR key={i.id}>
                            <TD className="whitespace-nowrap text-xs text-stone-500">
                              {new Date(i.created_at).toLocaleTimeString?.() || fmtDate(i.created_at)}
                            </TD>
                            <TD>
                              <Badge tone={actionTone(i.action)}>{i.action}</Badge>
                            </TD>
                            <TD className="font-medium">{i.entity_type}</TD>
                            <TD className="font-mono text-xs text-stone-500">{i.entity_id ?? '—'}</TD>
                            <TD className="max-w-md">
                              {hasDetail ? (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => setExpanded(isOpen ? null : i.id)}
                                    className="text-left text-xs text-indigo-400 hover:text-indigo-300"
                                  >
                                    {isOpen ? 'Hide detail' : summarizeDetail(i.detail)}
                                  </button>
                                  {isOpen && (
                                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-stone-800 bg-stone-950 p-3 text-xs text-stone-300">
                                      {detailStr}
                                    </pre>
                                  )}
                                </div>
                              ) : (
                                <span className="text-stone-600">—</span>
                              )}
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
