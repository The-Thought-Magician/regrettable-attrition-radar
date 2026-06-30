'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'

interface OrgSettings {
  id?: string
  user_id?: string
  industry: string | null
  currency: string | null
  fiscal_quarter_start: string | null
  headcount_band: string | null
  settings: Record<string, unknown> | null
  updated_at?: string
  created_at?: string
}

interface Plan {
  id: string
  name: string
  price_cents: number | null
}

interface Subscription {
  id?: string
  user_id?: string
  plan_id?: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  status?: string | null
  current_period_end?: string | null
}

interface BillingPlan {
  subscription: Subscription | null
  plan: Plan | null
  stripeEnabled: boolean
}

const INDUSTRIES = [
  'technology',
  'financial_services',
  'healthcare',
  'retail',
  'manufacturing',
  'professional_services',
  'media',
  'energy',
  'education',
  'public_sector',
  'other',
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'SGD', 'JPY']

const HEADCOUNT_BANDS = [
  '1-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5000+',
]

const QUARTER_STARTS = [
  { value: 'january', label: 'January (calendar year)' },
  { value: 'february', label: 'February' },
  { value: 'april', label: 'April' },
  { value: 'july', label: 'July' },
  { value: 'october', label: 'October' },
]

type FormState = {
  industry: string
  currency: string
  fiscal_quarter_start: string
  headcount_band: string
  high_risk_alert_threshold: string
  regrettable_rate_target: string
  retention_budget: string
  notify_on_critical: boolean
}

const EMPTY_FORM: FormState = {
  industry: 'technology',
  currency: 'USD',
  fiscal_quarter_start: 'january',
  headcount_band: '201-500',
  high_risk_alert_threshold: '75',
  regrettable_rate_target: '8',
  retention_budget: '',
  notify_on_critical: true,
}

function statusTone(status?: string | null): 'green' | 'amber' | 'rose' | 'neutral' {
  const s = (status ?? '').toLowerCase()
  if (s === 'active' || s === 'trialing') return 'green'
  if (s === 'past_due' || s === 'unpaid') return 'amber'
  if (s === 'canceled' || s === 'incomplete_expired') return 'rose'
  return 'neutral'
}

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '$0'
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function num(v: unknown, fallback = ''): string {
  if (v == null || v === '') return fallback
  return String(v)
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [settingsMeta, setSettingsMeta] = useState<{ updated_at?: string }>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const [billing, setBilling] = useState<BillingPlan | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [billingBusy, setBillingBusy] = useState<'checkout' | 'portal' | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [settings, plan] = await Promise.all([
        api.getSettings(),
        api.getBillingPlan().catch((e) => {
          setBillingError(e instanceof Error ? e.message : 'Failed to load billing')
          return null
        }),
      ])
      hydrateForm(settings)
      if (plan) setBilling(plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  function hydrateForm(s: OrgSettings | null) {
    if (!s) return
    const extra = (s.settings ?? {}) as Record<string, unknown>
    setForm({
      industry: s.industry ?? 'technology',
      currency: s.currency ?? 'USD',
      fiscal_quarter_start: s.fiscal_quarter_start ?? 'january',
      headcount_band: s.headcount_band ?? '201-500',
      high_risk_alert_threshold: num(extra.high_risk_alert_threshold, '75'),
      regrettable_rate_target: num(extra.regrettable_rate_target, '8'),
      retention_budget: num(extra.retention_budget, ''),
      notify_on_critical:
        extra.notify_on_critical === undefined ? true : Boolean(extra.notify_on_critical),
    })
    setSettingsMeta({ updated_at: s.updated_at })
  }

  useEffect(() => {
    load()
  }, [])

  async function saveSettings() {
    setSaving(true)
    setSaveMsg(null)
    setError(null)
    const body = {
      industry: form.industry,
      currency: form.currency,
      fiscal_quarter_start: form.fiscal_quarter_start,
      headcount_band: form.headcount_band,
      settings: {
        high_risk_alert_threshold:
          form.high_risk_alert_threshold === '' ? null : Number(form.high_risk_alert_threshold),
        regrettable_rate_target:
          form.regrettable_rate_target === '' ? null : Number(form.regrettable_rate_target),
        retention_budget: form.retention_budget === '' ? null : Number(form.retention_budget),
        notify_on_critical: form.notify_on_critical,
      },
    }
    try {
      const updated = await api.updateSettings(body)
      hydrateForm(updated)
      setSaveMsg('Settings saved')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheckout() {
    setBillingBusy('checkout')
    setBillingError(null)
    try {
      const res = await api.startCheckout()
      if (res?.url) {
        window.location.href = res.url
      } else {
        setBillingError('Checkout is not available right now.')
      }
    } catch (e) {
      setBillingError(
        e instanceof Error ? e.message : 'Checkout is unavailable (billing not configured).'
      )
    } finally {
      setBillingBusy(null)
    }
  }

  async function handlePortal() {
    setBillingBusy('portal')
    setBillingError(null)
    try {
      const res = await api.openPortal()
      if (res?.url) {
        window.location.href = res.url
      } else {
        setBillingError('Billing portal is not available right now.')
      }
    } catch (e) {
      setBillingError(
        e instanceof Error ? e.message : 'Billing portal is unavailable (billing not configured).'
      )
    } finally {
      setBillingBusy(null)
    }
  }

  if (loading) return <PageSpinner label="Loading settings..." />

  const sub = billing?.subscription ?? null
  const plan = billing?.plan ?? null
  const stripeEnabled = billing?.stripeEnabled ?? false
  const onPaidPlan =
    (plan?.price_cents ?? 0) > 0 && (sub?.status === 'active' || sub?.status === 'trialing')

  const inputCls =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-slate-400'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Organization profile, retention thresholds, and billing for your attrition radar.
          </p>
        </div>
        {settingsMeta.updated_at && (
          <span className="text-xs text-slate-500">Last updated {fmtDate(settingsMeta.updated_at)}</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}{' '}
          <button onClick={load} className="ml-2 underline hover:text-rose-200">
            Retry
          </button>
        </div>
      )}

      {/* Org profile */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Organization Profile</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Used to benchmark your regrettable-attrition rate against industry peers.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Industry</label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className={inputCls}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Headcount Band</label>
              <select
                value={form.headcount_band}
                onChange={(e) => setForm({ ...form, headcount_band: e.target.value })}
                className={inputCls}
              >
                {HEADCOUNT_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b} employees
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reporting Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className={inputCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Fiscal Quarter Start</label>
              <select
                value={form.fiscal_quarter_start}
                onChange={(e) => setForm({ ...form, fiscal_quarter_start: e.target.value })}
                className={inputCls}
              >
                {QUARTER_STARTS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Retention thresholds */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Retention Thresholds</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Drive alerting and goal tracking across the radar.
          </p>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>High-Risk Alert Threshold (score 0–100)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.high_risk_alert_threshold}
                onChange={(e) => setForm({ ...form, high_risk_alert_threshold: e.target.value })}
                placeholder="75"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-600">
                Employees scoring at or above this are flagged for alerts.
              </p>
            </div>
            <div>
              <label className={labelCls}>Regrettable Rate Target (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.regrettable_rate_target}
                onChange={(e) => setForm({ ...form, regrettable_rate_target: e.target.value })}
                placeholder="8"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-600">
                Annualized regrettable-attrition goal for the org.
              </p>
            </div>
            <div>
              <label className={labelCls}>Retention Budget ({form.currency})</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.retention_budget}
                onChange={(e) => setForm({ ...form, retention_budget: e.target.value })}
                placeholder="500000"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-600">
                Annual budget the ROI optimizer is allowed to allocate.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.notify_on_critical}
              onChange={(e) => setForm({ ...form, notify_on_critical: e.target.checked })}
              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500/60"
            />
            <span className="text-sm text-slate-200">
              Notify me when a critical-band employee enters the watchlist
            </span>
          </label>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
        {saveMsg && (
          <span className="text-sm text-emerald-400">{saveMsg}</span>
        )}
      </div>

      {/* Billing */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Plan &amp; Billing</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Manage your subscription. Every feature on RegrettableAttritionRadar is free.
            </p>
          </div>
          {sub?.status && <Badge tone={statusTone(sub.status)}>{sub.status.replace(/_/g, ' ')}</Badge>}
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Current Plan" value={plan?.name ?? 'Free'} />
            <Stat
              label="Price"
              value={plan?.price_cents ? `${fmtMoney(plan.price_cents)}/mo` : 'Free'}
              tone={plan?.price_cents ? 'amber' : 'green'}
            />
            <Stat
              label="Status"
              value={sub?.status ? sub.status.replace(/_/g, ' ') : 'No subscription'}
            />
            <Stat label="Renews" value={fmtDate(sub?.current_period_end)} />
          </div>

          {billingError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {billingError}
            </div>
          )}

          {!stripeEnabled && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
              Stripe is not configured for this deployment, so checkout and the billing portal are
              disabled. All capabilities remain fully available on the free plan.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleCheckout} disabled={!stripeEnabled || billingBusy !== null || onPaidPlan}>
              {billingBusy === 'checkout'
                ? 'Redirecting...'
                : onPaidPlan
                  ? 'Already subscribed'
                  : 'Upgrade plan'}
            </Button>
            <Button
              variant="secondary"
              onClick={handlePortal}
              disabled={!stripeEnabled || billingBusy !== null}
            >
              {billingBusy === 'portal' ? 'Redirecting...' : 'Manage billing'}
            </Button>
          </div>

          {(sub?.stripe_customer_id || sub?.stripe_subscription_id) && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sub?.stripe_customer_id && (
                  <span>
                    Customer: <span className="text-slate-400">{sub.stripe_customer_id}</span>
                  </span>
                )}
                {sub?.stripe_subscription_id && (
                  <span>
                    Subscription: <span className="text-slate-400">{sub.stripe_subscription_id}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
