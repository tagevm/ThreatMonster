import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react'
import { Globe, Lock } from 'lucide-react'
import { ThreatBadge, type ThreatSummary } from '../components/ThreatBadge'
import type { Flow } from '../model/types'
import { useModel } from '../store/modelStore'

export interface FlowEdgeData extends Record<string, unknown> {
  flow: Flow
  threats?: ThreatSummary
  crossesBoundary: boolean
  /** Perpendicular offset so parallel flows between the same two elements do not overlap. */
  offset: number
}

export type FlowEdgeType = Edge<FlowEdgeData>

interface Pt {
  x: number
  y: number
}

function centreAndSize(node: InternalNode) {
  const w = node.measured.width ?? node.width ?? 0
  const h = node.measured.height ?? node.height ?? 0
  const p = node.internals.positionAbsolute
  return { c: { x: p.x + w / 2, y: p.y + h / 2 }, w, h, ellipse: node.type === 'process' }
}

/** Where a ray from the node centre towards `towards` leaves the node's outline. */
function exitPoint(node: InternalNode, towards: Pt): Pt {
  const { c, w, h, ellipse } = centreAndSize(node)
  const dx = towards.x - c.x
  const dy = towards.y - c.y
  if (dx === 0 && dy === 0) return c
  const t = ellipse
    ? 1 / Math.sqrt((dx / (w / 2)) ** 2 + (dy / (h / 2)) ** 2)
    : Math.min(dx === 0 ? Infinity : w / 2 / Math.abs(dx), dy === 0 ? Infinity : h / 2 / Math.abs(dy))
  return { x: c.x + dx * t, y: c.y + dy * t }
}

export function FlowEdge({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps<FlowEdgeType>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const select = useModel((s) => s.select)
  if (!sourceNode || !targetNode || !data) return null

  const a = centreAndSize(sourceNode).c
  const b = centreAndSize(targetNode).c
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  // Normal of the canonical (id-ordered) direction, so A→B and B→A bend to opposite sides.
  const sign = source < target ? 1 : -1
  const nx = (-(b.y - a.y) / len) * sign
  const ny = ((b.x - a.x) / len) * sign
  const control = { x: (a.x + b.x) / 2 + nx * data.offset, y: (a.y + b.y) / 2 + ny * data.offset }

  const s = exitPoint(sourceNode, control)
  const t = exitPoint(targetNode, control)
  const path = `M ${s.x},${s.y} Q ${control.x},${control.y} ${t.x},${t.y}`
  const label = { x: 0.25 * s.x + 0.5 * control.x + 0.25 * t.x, y: 0.25 * s.y + 0.5 * control.y + 0.25 * t.y }

  const { flow } = data
  const stroke = selected ? '#7c3aed' : data.crossesBoundary ? '#d97706' : '#57534e'

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={16}
        style={{
          stroke,
          strokeWidth: selected || data.crossesBoundary ? 2.25 : 1.5,
          strokeDasharray: flow.outOfScope ? '4 4' : undefined,
          opacity: flow.outOfScope ? 0.5 : 1,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex cursor-pointer items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)`, pointerEvents: 'all' }}
          onClick={() => select([id])}
        >
          {(flow.name || flow.isEncrypted || flow.isPublicNetwork) && (
            <span
              className={`flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs shadow-sm ${selected ? 'border-violet-400 text-violet-900' : data.crossesBoundary ? 'border-amber-300 text-stone-800' : 'border-stone-200 text-stone-700'}`}
            >
              {flow.isEncrypted && <Lock size={11} className="text-green-700" aria-label="encrypted" />}
              {flow.isPublicNetwork && <Globe size={11} className="text-sky-700" aria-label="public network" />}
              {flow.name}
            </span>
          )}
          <ThreatBadge summary={data.threats} />
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const edgeTypes = { flow: FlowEdge }
