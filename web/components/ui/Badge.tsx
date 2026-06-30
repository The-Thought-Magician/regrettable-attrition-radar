import type { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'low' | 'moderate' | 'elevated' | 'high' | 'critical' | 'amber' | 'green' | 'rose'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  low: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  moderate: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  elevated: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  high: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  critical: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
}

export function bandTone(band?: string): Tone {
  const b = (band ?? '').toLowerCase()
  if (b === 'low') return 'low'
  if (b === 'moderate') return 'moderate'
  if (b === 'elevated') return 'elevated'
  if (b === 'high') return 'high'
  if (b === 'critical') return 'critical'
  return 'neutral'
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
