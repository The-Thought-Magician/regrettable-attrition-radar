'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge, bandTone } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

interface TopAtRisk {
  id?: string
  employee_id?: string
  full_name?: string
  name?: string
  score?: number
  band?: string
  department?: string
}
interface DashboardSummary {
  regrettableRate?: number | string
  exposure?: number | string
  topAtRisk?: TopAtRisk[]
}

function fmtMoney(n?: number | string | null): string {
  const num = typeof n === 'object' ? NaN : Number(n)
  if (n === undefined || n === null || Number.isNaN(num)) return '$0'
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${Math.round(num).toLocaleString()}`
}

function fmtPct(n?: number | string | null): string {
  const num = typeof n === 'object' ? NaN : Number(n)
  if (n === undefined || n === null || Number.isNaN(num)) return '0%'
  const v = Math.abs(num) <= 1 ? num * 100 : num
  return `${v.toFixed(1)}%`
}

/**
 * Right rail summarizing organization-wide risk signal. Pulls from the same
 * /dashboard/summary endpoint already used by the main dashboard page, so no
 * new backend routes are introduced.
 */
export function RightRail() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getDashboardSummary()
        if (!cancelled) setSummary(data ?? {})
      } catch {
        if (!cancelled) setSummary({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const topAtRisk = (summary?.topAtRisk ?? []).slice(0, 5)

  return (
    <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Org Signal</h2>
        </CardHeader>
        <CardBody>
          {loading ? (
            <Spinner label="Loading..." />
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-stone-500">Regrettable Rate</div>
                <div className="text-xl font-bold text-rose-400">{fmtPct(summary?.regrettableRate)}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Replacement Exposure</div>
                <div className="text-xl font-bold text-indigo-400">{fmtMoney(summary?.exposure)}</div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Top At-Risk</h2>
          <Link href="/dashboard/risk" className="text-xs text-indigo-400 hover:text-indigo-300">
            View all →
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="px-5 py-6"><Spinner label="Loading..." /></div>
          ) : topAtRisk.length === 0 ? (
            <p className="px-5 py-6 text-sm text-stone-500">No at-risk employees identified.</p>
          ) : (
            <ul className="divide-y divide-stone-800">
              {topAtRisk.map((e, i) => {
                const id = e.id ?? e.employee_id
                const name = e.full_name ?? e.name ?? 'Unknown'
                return (
                  <li key={id ?? i} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      {id ? (
                        <Link
                          href={`/dashboard/employees/${id}`}
                          className="block truncate text-sm font-medium text-indigo-400 hover:text-indigo-300"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm font-medium text-stone-200">{name}</span>
                      )}
                      <span className="text-xs text-stone-500">{e.department ?? '—'}</span>
                    </div>
                    {e.band && <Badge tone={bandTone(e.band)}>{e.band}</Badge>}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </aside>
  )
}

export default RightRail
