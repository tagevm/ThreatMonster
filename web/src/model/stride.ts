import type { ActorType, ElementKind, Severity, StrideCategory, TargetKind, ThreatStatus } from './types'

export const STRIDE: { id: StrideCategory; letter: string; label: string; question: string }[] = [
  { id: 'spoofing', letter: 'S', label: 'Spoofing', question: 'Can someone pretend to be this?' },
  { id: 'tampering', letter: 'T', label: 'Tampering', question: 'Can data or code be modified?' },
  { id: 'repudiation', letter: 'R', label: 'Repudiation', question: 'Can actions be denied afterwards?' },
  { id: 'informationDisclosure', letter: 'I', label: 'Information disclosure', question: 'Can data leak to the wrong party?' },
  { id: 'denialOfService', letter: 'D', label: 'Denial of service', question: 'Can it be made unavailable?' },
  { id: 'elevationOfPrivilege', letter: 'E', label: 'Elevation of privilege', question: 'Can someone gain rights they should not have?' },
]

export const strideLabel = (c: StrideCategory) => STRIDE.find((s) => s.id === c)!.label
export const strideLetter = (c: StrideCategory) => STRIDE.find((s) => s.id === c)!.letter

export const SEVERITIES: { id: Severity; label: string }[] = [
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

export const severityRank = (s?: Severity) => (s ? 4 - SEVERITIES.findIndex((x) => x.id === s) : 0)
export const severityLabel = (s?: Severity) => SEVERITIES.find((x) => x.id === s)?.label ?? 'Not rated'

export const STATUSES: { id: ThreatStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'mitigated', label: 'Mitigated' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'notApplicable', label: 'Not applicable' },
]

export const statusLabel = (s: ThreatStatus) => STATUSES.find((x) => x.id === s)!.label

export const KIND_LABELS: Record<ElementKind | 'flow', string> = {
  actor: 'Actor',
  process: 'Process',
  store: 'Data store',
  boundary: 'Trust boundary',
  annotation: 'Note',
  flow: 'Data flow',
}

export const ACTOR_TYPES: { id: ActorType; label: string }[] = [
  { id: 'human', label: 'Human user' },
  { id: 'system', label: 'External system' },
  { id: 'agent', label: 'Automated / AI agent' },
]

export function isTargetKind(kind: string): kind is TargetKind {
  return kind === 'actor' || kind === 'process' || kind === 'store' || kind === 'flow'
}

// Tailwind classes, kept in one place so badges look the same everywhere.
export const severityClasses: Record<Severity | 'none', string> = {
  critical: 'bg-red-100 text-red-800 ring-red-300',
  high: 'bg-orange-100 text-orange-800 ring-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 ring-yellow-300',
  low: 'bg-blue-100 text-blue-800 ring-blue-300',
  none: 'bg-stone-100 text-stone-600 ring-stone-300',
}

export const severityDot: Record<Severity | 'none', string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-yellow-400',
  low: 'bg-blue-500',
  none: 'bg-stone-400',
}

export const statusClasses: Record<ThreatStatus, string> = {
  open: 'bg-amber-100 text-amber-800 ring-amber-300',
  mitigated: 'bg-green-100 text-green-800 ring-green-300',
  accepted: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
  notApplicable: 'bg-stone-100 text-stone-600 ring-stone-300',
}
