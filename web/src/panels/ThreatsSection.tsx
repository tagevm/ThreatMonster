import { useState } from 'react'
import { ChevronDown, ChevronRight, Lightbulb, Plus } from 'lucide-react'
import { suggestionsFor, type TargetRef } from '../model/analysis'
import { STRIDE, strideLabel } from '../model/stride'
import type { CatalogEntry, StrideCategory, Threat } from '../model/types'
import { useModel } from '../store/modelStore'
import { SeverityBadge, StatusBadge, ThreatEditor } from './ThreatEditor'

/**
 * STRIDE-per-element threat entry: shows the categories that apply to the selected element or flow,
 * the threats recorded for each, and one-click suggestions from the catalog.
 */
export function ThreatsSection({ target }: { target: TargetRef }) {
  const catalog = useModel((s) => s.catalog)
  const allThreats = useModel((s) => s.model.threats)
  const addThreat = useModel((s) => s.addThreat)
  const targetId = target.element?.id ?? target.flow!.id
  const threats = allThreats.filter((t) => t.targetId === targetId).sort((a, b) => a.number - b.number)
  const [openCategory, setOpenCategory] = useState<StrideCategory>()
  const [expandedThreat, setExpandedThreat] = useState<string>()
  const [justAdded, setJustAdded] = useState<string>()

  const applicable = catalog?.applicability[target.kind] ?? []
  const suggestions = catalog ? suggestionsFor(target, catalog.entries, threats) : []
  // Threats in categories that do not normally apply (e.g. imported) are still shown.
  const categories = STRIDE.filter((s) => applicable.includes(s.id) || threats.some((t) => t.category === s.id))

  const add = (category: StrideCategory, entry?: CatalogEntry) => {
    const id = addThreat({
      title: entry?.title ?? `New ${strideLabel(category).toLowerCase()} threat`,
      category,
      diagramId: target.diagram.id,
      targetId,
      description: entry?.description,
      mitigation: entry?.mitigation,
      status: 'open',
      catalogId: entry?.id,
    })
    setExpandedThreat(id)
    if (!entry) setJustAdded(id)
  }

  return (
    <div className="space-y-1.5">
      {categories.map((cat) => {
        const inCategory = threats.filter((t) => t.category === cat.id)
        const catSuggestions = suggestions.filter((s) => s.category === cat.id)
        const open = openCategory === cat.id
        return (
          <div key={cat.id} className={`rounded-lg border ${open ? 'border-violet-300 bg-violet-50/40' : 'border-stone-200'}`}>
            <button
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              onClick={() => setOpenCategory(open ? undefined : cat.id)}
              title={cat.question}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${inCategory.length ? 'bg-violet-600 text-white' : 'border border-dashed border-stone-400 text-stone-500'}`}
              >
                {cat.letter}
              </span>
              <span className="flex-1 text-sm font-medium text-stone-800">{cat.label}</span>
              {catSuggestions.length > 0 && !open && (
                <span className="flex items-center gap-0.5 text-xs text-amber-700" title={`${catSuggestions.length} suggestion(s)`}>
                  <Lightbulb size={12} />
                  {catSuggestions.length}
                </span>
              )}
              <span className="w-5 text-right text-xs text-stone-500 tabular-nums">{inCategory.length || ''}</span>
              {open ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
            </button>

            {open && (
              <div className="space-y-2 px-2.5 pb-2.5">
                <p className="text-xs text-stone-500 italic">{cat.question}</p>
                {inCategory.map((t) => (
                  <ThreatCard
                    key={t.id}
                    threat={t}
                    expanded={expandedThreat === t.id}
                    autoFocus={justAdded === t.id}
                    onToggle={() => setExpandedThreat(expandedThreat === t.id ? undefined : t.id)}
                  />
                ))}
                {catSuggestions.map((s) => (
                  <div key={s.id} className="rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-2">
                    <div className="flex items-start gap-2">
                      <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-800">{s.title}</p>
                        <p className="mt-0.5 text-xs text-stone-600">{s.description}</p>
                      </div>
                      <button
                        onClick={() => add(cat.id, s)}
                        className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-violet-700 shadow-sm ring-1 ring-violet-200 hover:bg-violet-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => add(cat.id)}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-stone-300 py-1.5 text-xs text-stone-600 hover:border-violet-400 hover:text-violet-700"
                >
                  <Plus size={14} /> Custom {cat.label.toLowerCase()} threat
                </button>
              </div>
            )}
          </div>
        )
      })}
      {categories.length === 0 && <p className="text-sm text-stone-500">Loading STRIDE catalog…</p>}
    </div>
  )
}

function ThreatCard({
  threat,
  expanded,
  autoFocus,
  onToggle,
}: {
  threat: Threat
  expanded: boolean
  autoFocus: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-md border border-stone-200 bg-white shadow-xs">
      <button className="flex w-full items-start gap-2 p-2 text-left" onClick={onToggle}>
        <span className="pt-0.5 text-xs text-stone-400 tabular-nums">#{threat.number}</span>
        <span className="min-w-0 flex-1 text-sm text-stone-800">{threat.title}</span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <SeverityBadge threat={threat} />
          <StatusBadge threat={threat} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-stone-100 p-2.5">
          <ThreatEditor threat={threat} autoFocus={autoFocus} />
        </div>
      )}
    </div>
  )
}
