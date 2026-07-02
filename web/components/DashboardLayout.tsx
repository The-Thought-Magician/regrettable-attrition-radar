'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Alerts', href: '/dashboard/alerts' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', href: '/dashboard/employees' },
      { label: 'Flight Risk', href: '/dashboard/risk' },
      { label: 'Watchlist', href: '/dashboard/watchlist' },
    ],
  },
  {
    title: 'Attrition',
    items: [
      { label: 'Exits', href: '/dashboard/exits' },
      { label: 'Exit Drivers', href: '/dashboard/drivers' },
      { label: 'Cohorts', href: '/dashboard/cohorts' },
      { label: 'Manager Scorecards', href: '/dashboard/managers' },
    ],
  },
  {
    title: 'Economics',
    items: [
      { label: 'Replacement Costs', href: '/dashboard/replacement-costs' },
      { label: 'ROI Optimizer', href: '/dashboard/optimizer' },
      { label: 'Scenarios', href: '/dashboard/scenarios' },
    ],
  },
  {
    title: 'Board',
    items: [{ label: 'Board Packs', href: '/dashboard/board-packs' }],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Scoring Models', href: '/dashboard/scoring-models' },
      { label: 'Regrettability Rules', href: '/dashboard/regrettability' },
      { label: 'Interventions', href: '/dashboard/interventions' },
      { label: 'Benchmarks', href: '/dashboard/benchmarks' },
      { label: 'Imports & Data', href: '/dashboard/imports' },
      { label: 'Activity Log', href: '/dashboard/activity' },
      { label: 'Settings', href: '/dashboard/settings' },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await authClient.getSession()
      if (cancelled) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-stone-700 border-t-indigo-400" />
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">◎</span>
        <span className="text-sm font-bold tracking-tight text-white">RegrettableAttritionRadar</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-indigo-500/10 font-medium text-indigo-300'
                          : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-stone-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-stone-800 bg-stone-900/50 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/70" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-stone-800 bg-stone-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-800 bg-stone-900/40 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-stone-400 hover:bg-stone-800 hover:text-white lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-stone-300">Workspace</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/settings" className="text-sm text-stone-400 hover:text-white">Settings</Link>
            <button
              onClick={signOut}
              className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-200 hover:bg-stone-700"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
