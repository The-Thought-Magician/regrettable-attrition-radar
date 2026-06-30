interface StatProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'default' | 'amber' | 'rose' | 'green'
  className?: string
}

const valueTones = {
  default: 'text-white',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  green: 'text-emerald-400',
}

export function Stat({ label, value, sub, tone = 'default', className = '' }: StatProps) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${valueTones[tone]}`}>{value}</div>
      {sub !== undefined && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export default Stat
