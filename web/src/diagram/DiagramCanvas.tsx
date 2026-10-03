import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
} from '@xyflow/react'
import { summarizeThreats } from '../components/ThreatBadge'
import { crossesBoundary } from '../model/analysis'
import type { ElementKind } from '../model/types'
import { useActiveDiagram, useModel } from '../store/modelStore'
import { notify } from '../components/Toasts'
import { edgeTypes, type FlowEdgeType } from './FlowEdge'
import { nodeTypes, type ElementNode } from './nodes'

export const DRAG_MIME = 'application/x-threatmonster-kind'

/** Imperative hooks for the palette and keyboard shortcuts. */
export const canvasApi: { addAtPointer?: (kind: ElementKind) => void } = {}

function applySelection(changes: { type: string; id?: string; selected?: boolean }[]) {
  const selects = changes.filter((c) => c.type === 'select')
  if (selects.length === 0) return
  const { selectedIds, select } = useModel.getState()
  const next = new Set(selectedIds)
  for (const c of selects) {
    if (c.selected) next.add(c.id!)
    else next.delete(c.id!)
  }
  if (next.size !== selectedIds.length || selectedIds.some((id) => !next.has(id))) select([...next])
}

export function DiagramCanvas() {
  const diagram = useActiveDiagram()
  const threats = useModel((s) => s.model.threats)
  const selectedIds = useModel((s) => s.selectedIds)
  const focus = useModel((s) => s.focus)
  const { addElement, addFlow, commitGeometry, removeItems, setEditing } = useModel.getState()
  const flow = useReactFlow()
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)

  const summaries = useMemo(() => summarizeThreats(threats), [threats])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const modelNodes = useMemo<ElementNode[]>(() => {
    const byId = new Map(diagram.elements.map((e) => [e.id, e]))
    // Parents must precede children; within a level, boundaries go first so they render underneath.
    return [...diagram.elements]
      .sort((a, b) => depth(a.id) - depth(b.id) || Number(b.kind === 'boundary') - Number(a.kind === 'boundary'))
      .map((el) => {
        const parent = el.parentId ? byId.get(el.parentId) : undefined
        const parentOffset = parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 }
        return {
          id: el.id,
          type: el.kind,
          position: { x: el.x - parentOffset.x, y: el.y - parentOffset.y },
          parentId: parent?.id,
          width: el.width,
          height: el.height,
          selected: selected.has(el.id),
          // A line note's bounding box must not swallow clicks meant for elements underneath; only its stroke is clickable.
          ...(el.points ? { style: { pointerEvents: 'none' as const }, zIndex: -1 } : {}),
          connectable: el.kind === 'actor' || el.kind === 'process' || el.kind === 'store',
          data: { element: el, threats: summaries.get(el.id), parentOffset },
        }
      })

    function depth(id: string): number {
      let d = 0
      for (let p = byId.get(id)?.parentId; p && d < 50; p = byId.get(p)?.parentId) d++
      return d
    }
  }, [diagram, summaries, selected])

  // React Flow needs local node state for smooth dragging/resizing; the model is updated on drag/resize end.
  const [nodes, setNodes] = useState<Node[]>(modelNodes)
  useEffect(() => {
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]))
      return modelNodes.map((n) => ({ ...n, measured: measured.get(n.id) }))
    })
  }, [modelNodes])

  const edges = useMemo<FlowEdgeType[]>(() => {
    // Spread parallel flows between the same pair of elements.
    const groups = new Map<string, string[]>()
    for (const f of diagram.flows) {
      const key = [f.sourceId, f.targetId].sort().join('|')
      groups.set(key, [...(groups.get(key) ?? []), f.id])
    }
    return diagram.flows.map((f) => {
      const group = groups.get([f.sourceId, f.targetId].sort().join('|'))!
      const offset = (group.indexOf(f.id) - (group.length - 1) / 2) * 50
      const crossing = crossesBoundary(diagram, f)
      const isSelected = selected.has(f.id)
      const color = isSelected ? '#7c3aed' : crossing ? '#d97706' : '#57534e'
      const marker = { type: MarkerType.ArrowClosed, color, width: 18, height: 18 }
      return {
        id: f.id,
        type: 'flow',
        source: f.sourceId,
        target: f.targetId,
        selected: isSelected,
        markerEnd: marker,
        markerStart: f.isBidirectional ? marker : undefined,
        data: { flow: f, threats: summaries.get(f.id), crossesBoundary: crossing, offset },
      }
    })
  }, [diagram, summaries, selected])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    applySelection(changes)
    setNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'), nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => applySelection(changes), [])

  const onConnect = useCallback<OnConnect>(
    (c) => {
      if (c.source && c.target && c.source !== c.target) addFlow(c.source, c.target)
    },
    [addFlow],
  )

  const toFlowPoint = useCallback(
    (client?: { x: number; y: number } | null) => {
      if (client) return flow.screenToFlowPosition(client)
      const r = wrapper.current!.getBoundingClientRect()
      return flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    },
    [flow],
  )

  useEffect(() => {
    canvasApi.addAtPointer = (kind) => {
      const p = toFlowPoint(pointer.current)
      addElement(kind, p.x, p.y)
    }
  }, [toFlowPoint, addElement])

  // Fit the whole diagram when switching diagrams or opening a model.
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 50)
    return () => clearTimeout(t)
  }, [diagram.id, flow])

  useEffect(() => {
    if (!focus) return
    const f = diagram.flows.find((x) => x.id === focus.id)
    const ids = f ? [f.sourceId, f.targetId] : [focus.id]
    // Wait for the diagram to render after a view/diagram switch.
    const t = setTimeout(() => flow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.6, duration: 400, maxZoom: 1.25 }), 120)
    return () => clearTimeout(t)
  }, [focus?.nonce]) // only when a new focus is requested

  return (
    <div
      ref={wrapper}
      className="h-full w-full"
      onMouseMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
      onMouseLeave={() => (pointer.current = null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData(DRAG_MIME) as ElementKind
        if (!kind) return
        e.preventDefault()
        const p = toFlowPoint({ x: e.clientX, y: e.clientY })
        addElement(kind, p.x, p.y)
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(c) => c.source !== c.target}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={40}
        onNodeDragStop={(_, __, dragged) =>
          commitGeometry(
            dragged.map((n) => {
              const offset = (n.data as ElementNode['data']).parentOffset
              return { id: n.id, x: n.position.x + offset.x, y: n.position.y + offset.y }
            }),
          )
        }
        onNodeDoubleClick={(_, n) => {
          if (!(n.data as ElementNode['data']).element.points) setEditing(n.id)
        }}
        onDelete={({ nodes: n, edges: e }) => {
          const removed = removeItems(
            n.map((x) => x.id),
            e.map((x) => x.id),
          )
          if (removed > 0) notify(`Deleted ${removed} threat(s) along with the selection. Press Ctrl+Z to undo.`)
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        elevateNodesOnSelect={false}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d6d3d1" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="rounded-lg! border border-stone-200" nodeColor={minimapColor} />
      </ReactFlow>
      {diagram.elements.length === 0 && <EmptyHint />}
    </div>
  )
}

function minimapColor(n: Node) {
  switch (n.type) {
    case 'process':
      return '#c4b5fd'
    case 'store':
      return '#7dd3fc'
    case 'boundary':
      return 'transparent'
    case 'annotation':
      return '#e7e5e4'
    default:
      return '#a8a29e'
  }
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="max-w-sm rounded-xl border border-dashed border-stone-300 bg-white/80 p-6 text-center text-sm text-stone-600">
        <p className="mb-2 text-base font-semibold text-stone-800">Start drawing your system</p>
        <p>
          Drag elements from the left, or hover the canvas and press <Kbd>A</Kbd> actor, <Kbd>P</Kbd> process,{' '}
          <Kbd>S</Kbd> data store, <Kbd>B</Kbd> trust boundary. Drag from an element's edge dot to draw a data flow.
        </p>
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-stone-300 bg-stone-50 px-1 font-mono text-xs text-stone-700">{children}</kbd>
}
