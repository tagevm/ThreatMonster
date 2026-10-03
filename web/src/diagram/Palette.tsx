import { Circle, Database, Square, SquareDashed, StickyNote } from 'lucide-react'
import type { ElementKind } from '../model/types'
import { canvasApi, DRAG_MIME, Kbd } from './DiagramCanvas'

const ITEMS: { kind: ElementKind; label: string; hint: string; key: string; icon: React.ReactNode }[] = [
  {
    kind: 'actor',
    label: 'Actor',
    hint: 'A person, external system or agent outside your control',
    key: 'A',
    icon: <Square size={20} className="text-stone-700" />,
  },
  {
    kind: 'process',
    label: 'Process',
    hint: 'Code you run: a service, app, function or job',
    key: 'P',
    icon: <Circle size={20} className="text-violet-600" />,
  },
  {
    kind: 'store',
    label: 'Data store',
    hint: 'Where data rests: database, file, queue, cache, log',
    key: 'S',
    icon: <Database size={20} className="text-sky-700" />,
  },
  {
    kind: 'boundary',
    label: 'Trust boundary',
    hint: 'A perimeter where the level of trust changes. Drop elements inside it.',
    key: 'B',
    icon: <SquareDashed size={20} className="text-red-500" />,
  },
  {
    kind: 'annotation',
    label: 'Note',
    hint: 'Free text on the diagram',
    key: 'N',
    icon: <StickyNote size={20} className="text-stone-500" />,
  },
]

export function Palette() {
  return (
    <aside className="flex w-44 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-2">
      <p className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Elements</p>
      {ITEMS.map((item) => (
        <button
          key={item.kind}
          draggable
          title={item.hint}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_MIME, item.kind)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          onClick={() => canvasApi.addAtPointer?.(item.kind)}
          className="group flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-stone-700 hover:bg-violet-50 active:cursor-grabbing"
        >
          {item.icon}
          <span className="flex-1">{item.label}</span>
          <Kbd>{item.key}</Kbd>
        </button>
      ))}
      <p className="mt-2 px-2 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Data flow</p>
      <p className="px-2 text-xs leading-relaxed text-stone-500">
        Hover an element and drag from one of its edge dots to another element.
      </p>
      <div className="mt-auto space-y-1 border-t border-stone-100 px-2 pt-2 text-[11px] text-stone-500">
        <Legend color="bg-stone-600" label="Data flow" />
        <Legend color="bg-amber-600" label="Crosses a trust boundary" />
      </div>
    </aside>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-0.5 w-5 ${color}`} />
      {label}
    </div>
  )
}
