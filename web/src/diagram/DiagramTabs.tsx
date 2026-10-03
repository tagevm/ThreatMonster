import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useModel } from '../store/modelStore'

/** Tabs for switching between the diagrams of a model. Double-click a tab to rename it. */
export function DiagramTabs() {
  const diagrams = useModel((s) => s.model.diagrams)
  const threats = useModel((s) => s.model.threats)
  const activeId = useModel((s) => s.activeDiagramId)
  const { setActiveDiagram, addDiagram, updateDiagram, removeDiagram } = useModel.getState()
  const [renaming, setRenaming] = useState<string>()

  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50 px-2 pt-1.5">
      {diagrams.map((d) => {
        const active = d.id === activeId
        return (
          <div
            key={d.id}
            className={`group flex items-center gap-1 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm ${active ? 'border-stone-200 bg-white font-medium text-stone-900' : 'border-transparent text-stone-500 hover:bg-stone-100'}`}
            onClick={() => setActiveDiagram(d.id)}
            onDoubleClick={() => setRenaming(d.id)}
          >
            {renaming === d.id ? (
              <input
                autoFocus
                defaultValue={d.title}
                className="w-40 rounded border border-violet-400 px-1 outline-none"
                onBlur={(e) => {
                  updateDiagram(d.id, { title: e.target.value.trim() || d.title })
                  setRenaming(undefined)
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(undefined)
                }}
              />
            ) : (
              <span className="whitespace-nowrap">{d.title}</span>
            )}
            {diagrams.length > 1 && (
              <button
                title="Delete diagram"
                className="ml-1 rounded p-0.5 text-stone-400 opacity-0 group-hover:opacity-100 hover:bg-stone-200 hover:text-stone-700"
                onClick={(e) => {
                  e.stopPropagation()
                  const count = threats.filter((t) => t.diagramId === d.id).length
                  if (confirm(`Delete diagram "${d.title}"${count ? ` and its ${count} threat(s)` : ''}? You can undo with Ctrl+Z.`))
                    removeDiagram(d.id)
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}
      <button
        title="Add diagram"
        onClick={addDiagram}
        className="mb-1 ml-1 rounded p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-800"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
