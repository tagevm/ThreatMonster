import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { Finding } from '../model/types'
import { useModel } from '../store/modelStore'

export function FindingsList({ findings, limit }: { findings?: Finding[]; limit?: number }) {
  const reveal = useModel((s) => s.reveal)
  if (!findings) return <p className="text-sm text-stone-500">Analysing…</p>
  if (findings.length === 0)
    return (
      <p className="flex items-center gap-2 text-sm text-green-700">
        <CheckCircle2 size={16} /> No gaps found. Every element has threats and every boundary-crossing flow is analysed.
      </p>
    )
  const sorted = [...findings].sort((a, b) => Number(b.level === 'Warning') - Number(a.level === 'Warning'))
  const shown = limit ? sorted.slice(0, limit) : sorted
  return (
    <ul className="space-y-1">
      {shown.map((f, i) => (
        <li key={i}>
          <button
            className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm text-stone-700 hover:bg-stone-100"
            onClick={() => f.targetId && reveal(f.targetId)}
          >
            {f.level === 'Warning' ? (
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            ) : (
              <Info size={15} className="mt-0.5 shrink-0 text-stone-400" />
            )}
            {f.message}
          </button>
        </li>
      ))}
      {limit && sorted.length > limit && <li className="px-1.5 text-xs text-stone-500">…and {sorted.length - limit} more (see Summary)</li>}
    </ul>
  )
}
