import Link from 'next/link'

const features = [
  {
    title: 'Deterministic Flight-Risk Score',
    body: 'A rule-weighted model scores tenure, time-in-role, time-since-last-raise, compa-ratio, span-of-control deviation, and promotion velocity. Every score carries a full factor breakdown, so it can be defended in front of a board without appeal to a black-box model.',
  },
  {
    title: 'Regrettable vs. Non-Regrettable Classification',
    body: 'A configurable, weighted rule set separates exits that materially harm the business from healthy turnover, with a documented rationale per exit and an analyst override path for edge cases.',
  },
  {
    title: 'Replacement-Cost Modeling',
    body: 'Per-role cost models convert recruiting fees, ramp loss, onboarding, and knowledge-transfer time into a defensible dollar figure per employee, and a rolled-up exposure figure across the organization.',
  },
  {
    title: 'Cohort Attrition Curves',
    body: 'Survival curves segmented by hire class, department, manager, location, or level, with retention checkpoints at 3, 6, 12, 18, and 24 months and flags on early-attrition cohorts.',
  },
  {
    title: 'Retention-Spend ROI Optimizer',
    body: 'Allocates a finite retention budget across raises, bonuses, and counteroffers to maximize regrettable-risk reduction per dollar spent, with scenarios saved for side-by-side comparison.',
  },
  {
    title: 'Manager Attrition Scorecard',
    body: 'Attributes regrettable loss to the team it occurred on. Managers are ranked, outliers are flagged, and each scorecard drills through to per-report flight risk.',
  },
  {
    title: 'Exit-Driver Register',
    body: 'A structured register of the reasons people actually leave, ranked by regrettable-weighted frequency and mapped to the intervention designed to address each one.',
  },
  {
    title: 'Quarterly Board Pack',
    body: 'A reproducible, board-ready report assembled on demand: regrettable rate, headcount at risk, financial exposure, retention ROI, leading drivers, and manager outliers.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-bold text-indigo-400">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15">◎</span>
          RegrettableAttritionRadar
        </span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-stone-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-stone-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-indigo-500 hover:bg-indigo-400 text-stone-950 font-semibold px-4 py-2 rounded-lg">Get Started</Link>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          For People leaders who own the retention number
        </span>
        <h1 className="mt-6 text-4xl sm:text-5xl font-black tracking-tight">
          A defensible answer to who is leaving, which of those exits actually <span className="text-indigo-400">cost you</span>, and where retention spend earns its return.
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-stone-400">
          RegrettableAttritionRadar is a deterministic, rule-weighted flight-risk model, not a black box. It quantifies the replacement cost of every likely exit and ranks where a finite retention budget reduces the most regrettable risk per dollar, so the number you bring to the board holds up.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="bg-indigo-500 hover:bg-indigo-400 text-stone-950 font-semibold px-6 py-3 rounded-lg">Start free</Link>
          <Link href="/auth/sign-in" className="border border-stone-700 hover:bg-stone-800 text-stone-200 px-6 py-3 rounded-lg">Sign in</Link>
        </div>
      </section>

      <section className="border-t border-stone-800 bg-stone-900/30">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center">Why attrition reporting falls short today</h2>
          <p className="mt-3 text-center text-stone-400 max-w-2xl mx-auto">
            Regrettable senior attrition typically runs one to two times annual salary once recruiting, ramp time, and lost institutional knowledge are counted. Most People teams are asked to manage that exposure without the tools to see it coming.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="font-semibold text-indigo-300">No explainable model</h3>
              <p className="mt-2 text-sm text-stone-400">Vendor tools tend to be black-box ML that cannot be walked through in a board meeting, or there is no model at all and the read is gut feel.</p>
            </div>
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="font-semibold text-indigo-300">No link between risk and cost</h3>
              <p className="mt-2 text-sm text-stone-400">Flagging someone as at risk is only useful alongside the dollar cost of losing them, weighed against the dollar cost of keeping them.</p>
            </div>
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="font-semibold text-indigo-300">No regrettable filter</h3>
              <p className="mt-2 text-sm text-stone-400">Aggregate turnover figures conflate healthy attrition with the exits that genuinely set the business back, which understates the real problem.</p>
            </div>
            <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="font-semibold text-indigo-300">No budget discipline or accountability</h3>
              <p className="mt-2 text-sm text-stone-400">Retention budget is typically spent reactively, and regrettable loss is rarely attributed back to the manager whose team it happened on.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-center">A rule-weighted platform built to hold up under scrutiny</h2>
        <p className="mt-3 text-center text-stone-400">Deterministic over hard workforce attributes. No surveys, no opaque scoring.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-stone-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-stone-800 bg-stone-900/30">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold">Built for the teams accountable to the retention number</h2>
          <p className="mt-4 text-stone-400">
            Evaluate the platform against a realistic 200-person organization seeded in one click, or import your own roster via CSV. Every capability is available at no cost.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/auth/sign-up" className="bg-indigo-500 hover:bg-indigo-400 text-stone-950 font-semibold px-6 py-3 rounded-lg">Get started free</Link>
            <Link href="/pricing" className="border border-stone-700 hover:bg-stone-800 text-stone-200 px-6 py-3 rounded-lg">See pricing</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-800 py-8 text-center text-stone-600 text-sm">
        <p>RegrettableAttritionRadar — deterministic flight-risk scoring tied to replacement-cost economics and retention-spend ROI.</p>
      </footer>
    </main>
  )
}
