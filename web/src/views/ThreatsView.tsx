import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Crosshair, Search, X } from 'lucide-react'
import { findTarget } from '../model/analysis'
import { KIND_LABELS, SEVERITIES, STATUSES, STRIDE, severityClasses, severityRank, statusClasses, strideLabel, strideLetter } from '../model/stride'
import type { Severity, StrideCategory, Threat, ThreatStatus } from '../model/types'
import { useModel } from '../store/modelStore'
import { ThreatEditor, SeverityBadge } from '../panels/ThreatEditor'

type SortKey = 'number' | 'title' | 'target' | 'category' | 'severity' | 'status'

const statusOrder: ThreatStatus[] = ['open', 'accepted', 'mitigated', 'notApplicable']

export function ThreatsView() {
  const model = useModel((s) => s.model)
  const { updateThreat, reveal } = useModel.getState()
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Set<StrideCategory>>(new Set())
  const [severities, setSeverities] = useState<Set<Severity | 'none'>>(new Set())
  const [statuses, setStatuses] = useState<Set<ThreatStatus>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'severity', desc: true })
  const [editing, setEditing] = useState<string>()

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const withTarget = model.threats.map((t) => {
      const target = findTarget(model, t.targetId)
      return { threat: t, target, targetName: target?.name ?? '(deleted)' }
    })
    const filtered = withTarget.filter(
      ({ threat: t, targetName }) =>
        (categories.size === 0 || categories.has(t.category)) &&
        (severities.size === 0 || severities.has(t.severity ?? 'none')) &&
        (statuses.size === 0 || statuses.has(t.status)) &&
        (!q || [t.title, t.description, t.mitigation, targetName, `#${t.number}`].some((s) => s?.toLowerCase().includes(q))),
    )
    const cmp: Record<SortKey, (a: (typeof filtered)[0], b: (typeof filtered)[0]) => number> = {
      number: (a, b) => a.threat.number - b.threat.number,
      title: (a, b) => a.threat.title.localeCompare(b.threat.title),
      target: (a, b) => a.targetName.localeCompare(b.targetName),
      category: (a, b) => STRIDE.findIndex((s) => s.id === a.threat.category) - STRIDE.findIndex((s) => s.id === b.threat.category),
      severity: (a, b) =>
        severityRank(a.threat.severity) - severityRank(b.threat.severity) || (a.threat.cvss?.baseScore ?? 0) - (b.threat.cvss?.baseScore ?? 0),
      status: (a, b) => statusOrder.indexOf(b.threat.status) - statusOrder.indexOf(a.threat.status),
    }
    return filtered.sort((a, b) => (sort.desc ? -1 : 1) * cmp[sort.key](a, b) || a.threat.number - b.threat.number)
  }, [model, query, categories, severities, statuses, sort])

  const editingThreat = model.threats.find((t) => t.id === editing)
  const filtersActive = query || categories.size || severities.size || statuses.size

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-3">
          <label className="relative">
            <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search threats…"
              className="w-56 rounded-md border border-stone-300 py-1.5 pr-2 pl-8 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
          </label>
          <ChipFilter
            options={STRIDE.map((s) => ({ id: s.id, label: s.letter, title: s.label }))}
            value={categories}
            onChange={setCategories}
          />
          <ChipFilter options={[...SEVERITIES, { id: 'none' as const, label: 'Not rated' }]} value={severities} onChange={setSeverities} />
          <ChipFilter options={STATUSES} value={statuses} onChange={setStatuses} />
          {filtersActive ? (
            <button
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
              onClick={() => {
                setQuery('')
                setCategories(new Set())
                setSeverities(new Set())
                setStatuses(new Set())
              }}
            >
              <X size={13} /> Clear
            </button>
          ) : null}
          <span className="ml-auto text-xs text-stone-500">
            {rows.length} of {model.threats.length} threats
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {model.threats.length === 0 ? (
            <div className="p-10 text-center text-sm text-stone-500">
              No threats yet. Select an element on the diagram to add threats from STRIDE suggestions.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-stone-50 text-left text-xs text-stone-600 shadow-[0_1px_0_#e7e5e4]">
                <tr>
                  <Th k="number" sort={sort} setSort={setSort} className="w-14">#</Th>
                  <Th k="title" sort={sort} setSort={setSort}>Threat</Th>
                  <Th k="target" sort={sort} setSort={setSort}>Element / flow</Th>
                  <Th k="category" sort={sort} setSort={setSort}>STRIDE</Th>
                  <Th k="severity" sort={sort} setSort={setSort}>Severity</Th>
                  <Th k="status" sort={sort} setSort={setSort}>Status</Th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ threat: t, target, targetName }) => (
                  <tr
                    key={t.id}
                    onClick={() => setEditing(t.id)}
                    className={`cursor-pointer border-b border-stone-100 ${editing === t.id ? 'bg-violet-50' : 'hover:bg-stone-50'}`}
                  >
                    <td className="px-3 py-2 text-stone-400 tabular-nums">{t.number}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-stone-800">{t.title}</div>
                      {!t.mitigation && t.status === 'open' && <div className="text-xs text-amber-700">No mitigation yet</div>}
                    </td>
                    <td className="px-3 py-2 text-stone-700">
                      {targetName}
                      {target && <div className="text-xs text-stone-400">{KIND_LABELS[target.kind]}{model.diagrams.length > 1 ? ` · ${target.diagram.title}` : ''}</div>}
                    </td>
                    <td className="px-3 py-2" title={strideLabel(t.category)}>
                      <span className="inline-flex size-6 items-center justify-center rounded-md bg-violet-100 text-xs font-bold text-violet-800">
                        {strideLetter(t.category)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {t.cvss ? (
                        <SeverityBadge threat={t} />
                      ) : (
                        <InlineSelect<Severity>
                          value={t.severity}
                          options={[{ id: '', label: 'Not rated' }, ...SEVERITIES]}
                          className={severityClasses[t.severity ?? 'none']}
                          onChange={(severity) => updateThreat(t.id, { severity })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <InlineSelect<ThreatStatus>
                        value={t.status}
                        options={STATUSES}
                        className={statusClasses[t.status]}
                        onChange={(status) => status && updateThreat(t.id, { status })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      {target && (
                        <button
                          title="Show on diagram"
                          className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-800"
                          onClick={(e) => {
                            e.stopPropagation()
                            reveal(t.targetId)
                          }}
                        >
                          <Crosshair size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingThreat && (
        <aside className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-l border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2.5">
            <span className="text-xs font-semibold tracking-wider text-stone-500 uppercase">Threat #{editingThreat.number}</span>
            <button onClick={() => setEditing(undefined)} className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">
              <X size={16} />
            </button>
          </div>
          <div className="p-4">
            <EditorTarget threat={editingThreat} />
            <ThreatEditor key={editingThreat.id} threat={editingThreat} />
          </div>
        </aside>
      )}
    </div>
  )
}

function EditorTarget({ threat }: { threat: Threat }) {
  const model = useModel((s) => s.model)
  const reveal = useModel((s) => s.reveal)
  const target = findTarget(model, threat.targetId)
  if (!target) return null
  return (
    <button onClick={() => reveal(threat.targetId)} className="mb-3 flex items-center gap-1.5 text-sm text-violet-700 hover:underline">
      <Crosshair size={14} /> {KIND_LABELS[target.kind]}: {target.name}
    </button>
  )
}

function Th({
  k,
  sort,
  setSort,
  children,
  className = '',
}: {
  k: SortKey
  sort: { key: SortKey; desc: boolean }
  setSort: (s: { key: SortKey; desc: boolean }) => void
  children: React.ReactNode
  className?: string
}) {
  const active = sort.key === k
  return (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <button className="flex items-center gap-1 hover:text-stone-900" onClick={() => setSort({ key: k, desc: active ? !sort.desc : k === 'severity' })}>
        {children}
        {active && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  )
}

function ChipFilter<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; title?: string }[]
  value: Set<T>
  onChange: (v: Set<T>) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => {
        const on = value.has(o.id)
        return (
          <button
            key={o.id}
            title={o.title}
            onClick={() => {
              const next = new Set(value)
              if (on) next.delete(o.id)
              else next.add(o.id)
              onChange(next)
            }}
            className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset ${on ? 'bg-violet-600 text-white ring-violet-600' : 'text-stone-600 ring-stone-300 hover:bg-stone-100'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function InlineSelect<T extends string>({
  value,
  options,
  onChange,
  className = 'bg-white text-stone-700 ring-stone-300',
}: {
  value: T | undefined
  options: { id: T | ''; label: string }[]
  onChange: (v: T | undefined) => void
  className?: string
}) {
  return (
    <select
      value={value ?? ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      className={`rounded-full border-0 py-0.5 pr-6 pl-2 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
