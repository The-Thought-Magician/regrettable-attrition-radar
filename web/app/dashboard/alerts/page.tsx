'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'

interface Alert {
  id: string
  kind: string
  title: string
  body: string
  employee_id?: string | null
  is_read: boolean
  created_at: string
}

type Filter = 'all' | 'unread' | 'read'

function kindTone(kind: string) {
  const k = (kind || '').toLowerCase()
  if (k.includes('critical') || k.includes('exit') || k.includes('regrettable')) return 'critical'
  if (k.includes('high') || k.includes('risk') || k.includes('flight')) return 'high'
  if (k.includes('cost') || k.includes('budget') || k.includes('exposure')) return 'elevated'
  if (k.includes('manager') || k.includes('outlier')) return 'amber'
  return 'moderate'
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function relative(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listAlerts()
      setAlerts(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 4000)
  }

  const evaluate = async () => {
    setBusy('evaluate')
    setError(null)
    try {
      const res = await api.evaluateAlerts()
      const created = res?.created ?? (Array.isArray(res?.alerts) ? res.alerts.length : 0)
      flash(created ? `Generated ${created} new alert(s).` : 'No new alerts — all clear.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed')
    } finally {
      setBusy(null)
    }
  }

  const markRead = async (id: string) => {
    setBusy(id)
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
    try {
      await api.markAlertRead(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark read')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const dismiss = async (id: string) => {
    setBusy(id)
    const snapshot = alerts
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    try {
      await api.dismissAlert(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not dismiss')
      setAlerts(snapshot)
    } finally {
      setBusy(null)
    }
  }

  const markAllRead = async () => {
    const unread = alerts.filter((a) => !a.is_read)
    if (unread.length === 0) return
    setBusy('all')
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
    try {
      await Promise.all(unread.map((a) => api.markAlertRead(a.id)))
      flash(`Marked ${unread.length} alert(s) as read.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk mark-read failed')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const dismissAllRead = async () => {
    const read = alerts.filter((a) => a.is_read)
    if (read.length === 0) return
    setBusy('all')
    const snapshot = alerts
    setAlerts((prev) => prev.filter((a) => !a.is_read))
    try {
      await Promise.all(read.map((a) => api.dismissAlert(a.id)))
      flash(`Dismissed ${read.length} read alert(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk dismiss failed')
      setAlerts(snapshot)
    } finally {
      setBusy(null)
    }
  }

  const kinds = useMemo(() => Array.from(new Set(alerts.map((a) => a.kind).filter(Boolean))).sort(), [alerts])

  const unreadCount = useMemo(() => alerts.filter((a) => !a.is_read).length, [alerts])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return alerts.filter((a) => {
      if (filter === 'unread' && a.is_read) return false
      if (filter === 'read' && !a.is_read) return false
      if (kindFilter !== 'all' && a.kind !== kindFilter) return false
      if (q && !(`${a.title} ${a.body} ${a.kind}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [alerts, filter, kindFilter, search])

  if (loading) return <PageSpinner label="Loading alerts..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Alerts</h1>
          <p className="mt-1 text-sm text-stone-500">
            Retention signals: flight-risk spikes, regrettable exits, manager outliers, budget exposure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={markAllRead} disabled={busy !== null || unreadCount === 0}>
            Mark all read
          </Button>
          <Button onClick={evaluate} disabled={busy !== null}>
            {busy === 'evaluate' ? 'Evaluating…' : 'Evaluate alerts'}
          </Button>
        </div>
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
        <Stat label="Total alerts" value={alerts.length} />
        <Stat label="Unread" value={unreadCount} tone={unreadCount > 0 ? 'amber' : 'default'} />
        <Stat label="Read" value={alerts.length - unreadCount} tone="green" />
        <Stat label="Distinct kinds" value={kinds.length} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-stone-800 bg-stone-950 p-1">
            {(['all', 'unread', 'read'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filter === f ? 'bg-indigo-500/15 text-indigo-300' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-xs text-stone-200 focus:border-indigo-500/50 focus:outline-none"
            >
              <option value="all">All kinds</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alerts…"
              className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-xs text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/50 focus:outline-none"
            />
            {alerts.some((a) => a.is_read) && (
              <Button variant="ghost" onClick={dismissAllRead} disabled={busy !== null}>
                Clear read
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {alerts.length === 0 ? (
            <EmptyState
              title="No alerts"
              description="Run an evaluation to scan current data for retention risks and generate alerts."
              action={
                <Button onClick={evaluate} disabled={busy !== null}>
                  Evaluate alerts
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState title="No matching alerts" description="Adjust the filters or search to see more." />
          ) : (
            <ul className="space-y-2">
              {visible.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    a.is_read
                      ? 'border-stone-800 bg-stone-900/40'
                      : 'border-indigo-500/30 bg-indigo-500/[0.04]'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      a.is_read ? 'bg-stone-700' : 'bg-indigo-400'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={kindTone(a.kind)}>{a.kind}</Badge>
                      <span className={`text-sm font-semibold ${a.is_read ? 'text-stone-300' : 'text-white'}`}>
                        {a.title}
                      </span>
                      <span className="ml-auto text-xs text-stone-500" title={fmtDate(a.created_at)}>
                        {relative(a.created_at)}
                      </span>
                    </div>
                    {a.body && <p className="mt-1 text-sm text-stone-400">{a.body}</p>}
                  </div>
                  <div className="flex flex-shrink-0 flex-col gap-1 sm:flex-row">
                    {!a.is_read && (
                      <Button variant="ghost" onClick={() => markRead(a.id)} disabled={busy === a.id}>
                        Mark read
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => dismiss(a.id)} disabled={busy === a.id}>
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
