'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const included = [
  'Deterministic, explainable flight-risk scoring',
  'Regrettable vs non-regrettable exit classifier',
  'Replacement-cost calculator and exposure',
  'Cohort attrition and survival curves',
  'Retention-spend ROI optimizer and scenarios',
  'Manager attrition scorecards and outlier detection',
  'Exit-driver register and aggregate ranking',
  'Quarterly board pack assembly',
  'CSV import, sample seeder, and manual entry',
  'Configurable scoring models, rules, and benchmarks',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api.getBillingPlan()
      .then((p) => { if (!cancelled) setStripeEnabled(!!p?.stripeEnabled) })
      .catch(() => { if (!cancelled) setStripeEnabled(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-amber-400">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">◎</span>
          RegrettableAttritionRadar
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/auth/sign-in" className="text-slate-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-lg">Get Started</Link>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl font-black tracking-tight">Simple pricing. Everything is free.</h1>
        <p className="mt-4 text-lg text-slate-400">
          Every capability in RegrettableAttritionRadar is available at no cost while we are in early access.
        </p>

        <div className="mt-12 rounded-2xl border border-amber-500/30 bg-slate-900 p-8 text-left shadow-xl">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Free</h2>
              <p className="text-sm text-slate-400">The full platform, no limits.</p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-black text-amber-400">$0</span>
              <span className="text-sm text-slate-500">/month</span>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-0.5 text-amber-400">✓</span>
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/auth/sign-up"
            className="mt-8 block w-full rounded-lg bg-amber-500 py-3 text-center font-semibold text-slate-950 hover:bg-amber-400"
          >
            Start free
          </Link>

          <p className="mt-4 text-center text-xs text-slate-500">
            {stripeEnabled === null
              ? 'Loading billing status...'
              : stripeEnabled
                ? 'Paid plans are available — manage billing from Settings after signing in.'
                : 'No payment required. Paid plans are not currently enabled.'}
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-slate-600 text-sm">
        <p>RegrettableAttritionRadar</p>
      </footer>
    </main>
  )
}
