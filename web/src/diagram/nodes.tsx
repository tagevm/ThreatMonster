import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { Bot, Monitor, User } from 'lucide-react'
import { ThreatBadge, type ThreatSummary } from '../components/ThreatBadge'
import type { Element } from '../model/types'
import { useModel } from '../store/modelStore'

export interface ElementNodeData extends Record<string, unknown> {
  element: Element
  threats?: ThreatSummary
  /** Absolute position of the parent boundary, for converting resize results. */
  parentOffset: { x: number; y: number }
}

export type ElementNode = Node<ElementNodeData>

function Handles() {
  // Loose connection mode: every handle can start or end a flow. Edges are drawn floating,
  // so which handle was used does not matter.
  return (
    <>
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Left} id="l" />
    </>
  )
}

/** Shows the element name; becomes a text field while the element is being renamed. */
function InlineName({ element, multiline = false, className = '' }: { element: Element; multiline?: boolean; className?: string }) {
  const editing = useModel((s) => s.editingId === element.id)
  const setEditing = useModel((s) => s.setEditing)
  const updateElement = useModel((s) => s.updateElement)
  const [draft, setDraft] = useState(element.name)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(element.name)
      requestAnimationFrame(() => ref.current?.select())
    }
  }, [editing, element.name])

  if (!editing)
    return <span className={`whitespace-pre-wrap break-words ${className}`}>{element.name || <i className="text-stone-400">unnamed</i>}</span>

  const commit = () => {
    if (draft.trim() !== element.name) updateElement(element.id, { name: draft.trim() })
    setEditing(undefined)
  }
  return (
    <textarea
      ref={ref}
      value={draft}
      rows={multiline ? 3 : 1}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') setEditing(undefined)
      }}
      className={`nodrag nowheel w-full resize-none rounded bg-white/90 px-1 text-center outline-2 outline-violet-500 ${className}`}
    />
  )
}

function Resizer({ selected, data, id, minWidth = 60, minHeight = 40 }: NodeProps<ElementNode> & { minWidth?: number; minHeight?: number }) {
  const commitGeometry = useModel((s) => s.commitGeometry)
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="border-violet-400!"
      handleClassName="h-2.5! w-2.5! rounded-sm! border-violet-500! bg-white!"
      onResizeEnd={(_, p) =>
        commitGeometry([{ id, x: p.x + data.parentOffset.x, y: p.y + data.parentOffset.y, width: p.width, height: p.height }])
      }
    />
  )
}

function Badge({ data }: { data: ElementNodeData }) {
  return <ThreatBadge summary={data.threats} className="absolute -top-2.5 -right-2.5 z-10" />
}

function OutOfScopeTag({ element }: { element: Element }) {
  if (!element.outOfScope) return null
  return (
    <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded bg-stone-200 px-1 text-[10px] whitespace-nowrap text-stone-600">
      out of scope
    </span>
  )
}

const scopeClass = (e: Element) => (e.outOfScope ? 'opacity-50 saturate-0' : '')
const selectedRing = (selected: boolean) => (selected ? 'ring-2 ring-violet-500 ring-offset-2' : '')

const actorIcons = { human: User, system: Monitor, agent: Bot }

export function ActorNode(props: NodeProps<ElementNode>) {
  const { element } = props.data
  const Icon = actorIcons[element.actorType ?? 'human']
  return (
    <div className={`relative h-full w-full ${scopeClass(element)}`}>
      <Resizer {...props} />
      <div
        className={`flex h-full w-full items-center gap-2 rounded-md border-2 border-stone-700 bg-white px-3 text-sm font-medium text-stone-800 shadow-sm ${selectedRing(props.selected)}`}
      >
        <Icon size={18} className="shrink-0 text-stone-600" />
        <InlineName element={element} className="min-w-0 flex-1 text-left" />
      </div>
      <Handles />
      <Badge data={props.data} />
      <OutOfScopeTag element={element} />
    </div>
  )
}

export function ProcessNode(props: NodeProps<ElementNode>) {
  const { element } = props.data
  return (
    <div className={`relative h-full w-full ${scopeClass(element)}`}>
      <Resizer {...props} />
      <div
        className={`flex h-full w-full items-center justify-center rounded-[50%] border-2 border-violet-600 bg-violet-50 p-3 text-center text-sm font-medium text-violet-950 shadow-sm ${selectedRing(props.selected)}`}
      >
        <InlineName element={element} />
      </div>
      <Handles />
      <Badge data={props.data} />
      <OutOfScopeTag element={element} />
    </div>
  )
}

export function StoreNode(props: NodeProps<ElementNode>) {
  const { element } = props.data
  return (
    <div className={`relative h-full w-full ${scopeClass(element)}`}>
      <Resizer {...props} />
      <div
        className={`flex h-full w-full items-center justify-center border-y-[3px] border-sky-700 bg-sky-50 px-3 text-center text-sm font-medium text-sky-950 ${selectedRing(props.selected)}`}
      >
        <InlineName element={element} />
      </div>
      <Handles />
      <Badge data={props.data} />
      <OutOfScopeTag element={element} />
    </div>
  )
}

export function BoundaryNode(props: NodeProps<ElementNode>) {
  const { element } = props.data
  return (
    <div className="relative h-full w-full">
      <Resizer {...props} minWidth={120} minHeight={80} />
      <div
        className={`h-full w-full rounded-xl border-2 border-dashed ${props.selected ? 'border-red-600 bg-red-100/30' : 'border-red-400 bg-red-50/20'}`}
      />
      <div className="absolute -top-3 left-3 max-w-[90%] rounded bg-white px-1.5 text-xs font-semibold tracking-wide text-red-700 uppercase">
        <InlineName element={element} className="normal-case" />
      </div>
    </div>
  )
}

export function AnnotationNode(props: NodeProps<ElementNode>) {
  const { element } = props.data
  if (element.points && element.points.length >= 2) {
    // A free-hand boundary line (e.g. imported from Threat Dragon); points are absolute.
    const pts = element.points.map((p) => `${p.x - element.x},${p.y - element.y}`).join(' ')
    const mid = element.points[Math.floor(element.points.length / 2)]
    return (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 overflow-visible" width="100%" height="100%">
          <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
          <polyline
            points={pts}
            fill="none"
            stroke={props.selected ? '#dc2626' : '#f87171'}
            strokeWidth={2}
            strokeDasharray="8 5"
          />
        </svg>
        {element.name && (
          <span
            className="absolute rounded bg-white px-1 text-xs font-semibold text-red-700"
            style={{ left: mid.x - element.x, top: mid.y - element.y }}
          >
            {element.name}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="relative h-full w-full">
      <Resizer {...props} minWidth={60} minHeight={24} />
      <div
        className={`h-full w-full rounded px-1 text-sm text-stone-600 italic ${props.selected ? 'outline-1 outline-violet-400 outline-dashed' : ''}`}
      >
        <InlineName element={element} multiline className="text-left" />
      </div>
    </div>
  )
}

export const nodeTypes = {
  actor: ActorNode,
  process: ProcessNode,
  store: StoreNode,
  boundary: BoundaryNode,
  annotation: AnnotationNode,
}
