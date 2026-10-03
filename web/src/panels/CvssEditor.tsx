import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Label, Segmented } from '../components/form'
import type { CvssScore, Severity } from '../model/types'

const METRICS: { id: string; label: string; values: { id: string; label: string }[] }[] = [
  { id: 'AV', label: 'Attack vector', values: [{ id: 'N', label: 'Network' }, { id: 'A', label: 'Adjacent' }, { id: 'L', label: 'Local' }, { id: 'P', label: 'Physical' }] },
  { id: 'AC', label: 'Attack complexity', values: [{ id: 'L', label: 'Low' }, { id: 'H', label: 'High' }] },
  { id: 'PR', label: 'Privileges required', values: [{ id: 'N', label: 'None' }, { id: 'L', label: 'Low' }, { id: 'H', label: 'High' }] },
  { id: 'UI', label: 'User interaction', values: [{ id: 'N', label: 'None' }, { id: 'R', label: 'Required' }] },
  { id: 'S', label: 'Scope', values: [{ id: 'U', label: 'Unchanged' }, { id: 'C', label: 'Changed' }] },
  { id: 'C', label: 'Confidentiality', values: [{ id: 'N', label: 'None' }, { id: 'L', label: 'Low' }, { id: 'H', label: 'High' }] },
  { id: 'I', label: 'Integrity', values: [{ id: 'N', label: 'None' }, { id: 'L', label: 'Low' }, { id: 'H', label: 'High' }] },
  { id: 'A', label: 'Availability', values: [{ id: 'N', label: 'None' }, { id: 'L', label: 'Low' }, { id: 'H', label: 'High' }] },
]

export const DEFAULT_VECTOR = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N'

function parse(vector: string): Record<string, string> {
  const metrics: Record<string, string> = {}
  for (const part of vector.split('/').slice(1)) {
    const [k, v] = part.split(':')
    if (k && v) metrics[k] = v
  }
  return metrics
}

function build(prefix: string, metrics: Record<string, string>, extra: string[]): string {
  return [prefix, ...METRICS.map((m) => `${m.id}:${metrics[m.id] ?? m.values[0].id}`), ...extra].join('/')
}

/**
 * CVSS v3.1 base metric calculator. Scores come from the server so the app has a single implementation.
 */
export function CvssEditor({ value, onChange }: { value: CvssScore; onChange: (cvss: CvssScore, severity: Severity | undefined) => void }) {
  const [text, setText] = useState(value.vector)
  const [error, setError] = useState<string>()
  // The vector including clicks whose score is still being calculated, so quick clicks build on each other.
  const latest = useRef(value.vector)
  useEffect(() => {
    setText(value.vector)
    latest.current = value.vector
  }, [value.vector])

  const metrics = parse(value.vector)

  function setMetric(id: string, v: string) {
    const current = latest.current
    const prefix = current.split('/')[0] || 'CVSS:3.1'
    // Temporal/environmental metrics typed into the vector are preserved.
    const extra = current.split('/').slice(1).filter((p) => !METRICS.some((m) => p.startsWith(m.id + ':')))
    void apply(build(prefix, { ...parse(current), [id]: v }, extra))
  }

  async function apply(vector: string) {
    latest.current = vector
    try {
      const result = await api.cvss(vector)
      setError(undefined)
      onChange({ vector: result.vector, baseScore: result.baseScore }, result.severity)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-600">CVSS 3.1 base score</span>
        <span className="text-lg font-bold text-stone-900 tabular-nums">{value.baseScore?.toFixed(1) ?? '–'}</span>
      </div>
      {METRICS.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-xs text-stone-600">{m.label}</span>
          <Segmented
            size="sm"
            value={metrics[m.id]}
            options={m.values}
            onChange={(v) => setMetric(m.id, v)}
          />
        </div>
      ))}
      <label className="block">
        <Label>Vector</Label>
        <input
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-violet-500"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value.vector && apply(text.trim())}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
