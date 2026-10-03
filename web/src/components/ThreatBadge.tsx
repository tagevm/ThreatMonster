import { Check } from 'lucide-react'
import { severityDot, severityLabel, severityRank } from '../model/stride'
import type { Severity, Threat } from '../model/types'

export interface ThreatSummary {
  total: number
  open: number
  /** Highest severity among open threats. */
  worst?: Severity
}

export function summarizeThreats(threats: Threat[]): Map<string, ThreatSummary> {
  const map = new Map<string, ThreatSummary>()
  for (const t of threats) {
    const s = map.get(t.targetId) ?? { total: 0, open: 0 }
    s.total++
    if (t.status === 'open') {
      s.open++
      if (severityRank(t.severity) > severityRank(s.worst)) s.worst = t.severity
    }
    map.set(t.targetId, s)
  }
  return map
}

/** Small pill shown on canvas elements and flows. */
export function ThreatBadge({ summary, className = '' }: { summary?: ThreatSummary; className?: string }) {
  if (!summary || summary.total === 0) return null
  if (summary.open === 0)
    return (
      <span
        title={`${summary.total} threat(s), none open`}
        className={`inline-flex h-5 items-center gap-0.5 rounded-full bg-green-600 px-1.5 text-[11px] font-semibold text-white shadow ${className}`}
      >
        <Check size={12} strokeWidth={3} />
        {summary.total}
      </span>
    )
  return (
    <span
      title={`${summary.open} open threat(s), worst: ${severityLabel(summary.worst)}`}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white shadow ${severityDot[summary.worst ?? 'none']} ${summary.worst === 'medium' ? 'text-yellow-950!' : ''} ${className}`}
    >
      {summary.open}
    </span>
  )
}
