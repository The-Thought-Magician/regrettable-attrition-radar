import Link from 'next/link'

const features = [
  {
    title: 'Deterministic Flight-Risk Score',
    body: 'Rule-weighted scoring over tenure, time-in-role, time-since-raise, compa-ratio, span-of-control, and promotion velocity. Every number has a defensible factor breakdown. No black-box ML.',
  },
  {
    title: 'Regrettable vs Non-Regrettable Classifier',
    body: 'A configurable, weighted rule set separates the exits that genuinely hurt from healthy attrition, with a per-exit explanation and an analyst override workflow.',
  },
  {
    title: 'Replacement-Cost Calculator',
    body: 'Per-role cost models turn recruiting fees, ramp loss, onboarding, and knowledge transfer into a dollar figure per employee and total exposure across the org.',
  },
  {
    title: 'Cohort Attrition Curves',
    body: 'Survival curves by hire-class, department, manager, location, or level. Retention at 3, 6, 12, 18, and 24 months, with early-attrition flags.',
  },
  {
    title: 'Retention-Spend ROI Optimizer',
    body: 'Given a finite budget, greedily allocate raises, bonuses, and counteroffers to maximize regrettable-risk reduction per dollar, then save and compare scenarios.',
  },
  {
    title: 'Manager Attrition Scorecard',
    body: 'Attribute regrettable loss to the team it happened on. Rank managers, flag outliers, and drill through to per-report flight risk.',
  },
  {
    title: 'Exit-Driver Register',
    body: 'Catalog and tag the real reasons people leave, then rank drivers by regrettable-weighted frequency and map each to the intervention that addresses it.',
  },
  {
    title: 'Quarterly Board Pack',
    body: 'Auto-assemble a reproducible, board-ready report: regrettable rate, headcount at risk, exposure, retention ROI, top drivers, and manager outliers.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-bold text-amber-400">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">◎</span>
          RegrettableAttritionRadar
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-slate-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-slate-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-lg">Get Started</Link>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          People analytics, fully explainable
        </span>
        <h1 className="mt-6 text-4xl sm:text-5xl font-black tracking-tight">
          See who is likely to leave, which exits actually <span className="text-amber-400">hurt</span>, and where retention dollars pay off.
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-slate-400">
          RegrettableAttritionRadar scores employee flight risk with transparent, rule-weighted logic, quantifies the replacement cost of every loss, and ranks where a finite retention budget produces the most risk reduction per dollar.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-lg">Start free</Link>
          <Link href="/auth/sign-in" className="border border-slate-700 hover:bg-slate-800 text-slate-200 px-6 py-3 rounded-lg">Sign in</Link>
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/30">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center">The problem with attrition today</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="font-semibold text-amber-300">No explainable model</h3>
              <p className="mt-2 text-sm text-slate-400">Vendor tools are black-box ML you cannot defend in a board meeting, or they simply do not exist and you fall back on gut feel.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="font-semibold text-amber-300">No tie between risk and money</h3>
              <p className="mt-2 text-sm text-slate-400">Knowing someone is at risk is useless without the dollar cost of losing them and the dollar cost of keeping them.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="font-semibold text-amber-300">No regrettable filter</h3>
              <p className="mt-2 text-sm text-slate-400">Aggregate turnover conflates healthy attrition with the exits that genuinely set the company back.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="font-semibold text-amber-300">No budget optimizer or accountability</h3>
              <p className="mt-2 text-sm text-slate-400">Retention budget gets spent reactively, and regrettable loss is rarely attributed to the manager whose team it happened on.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-center">Everything you need to defend the number</h2>
        <p className="mt-3 text-center text-slate-400">Deterministic over hard workforce attributes. No surveys required.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/30">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold">Built for People leaders who own the retention number</h2>
          <p className="mt-4 text-slate-400">Seed a realistic 200-person org in one click, or import your own roster. Every feature is free.</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-lg">Get started free</Link>
            <Link href="/pricing" className="border border-slate-700 hover:bg-slate-800 text-slate-200 px-6 py-3 rounded-lg">See pricing</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-slate-600 text-sm">
        <p>RegrettableAttritionRadar — explainable flight-risk scoring tied to replacement-cost economics and retention ROI.</p>
      </footer>
    </main>
  )
}
