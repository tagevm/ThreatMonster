import type { CatalogEntry, Diagram, Element, Flow, TargetKind, Threat, ThreatModel } from './types'

// Containment and boundary-crossing logic. ThreatMonster.Core.Analysis has the same crossing rule
// for reports; this copy exists so the canvas can react instantly while editing.

export function boundaryChain(diagram: Diagram, elementId: string): string[] {
  const byId = new Map(diagram.elements.map((e) => [e.id, e]))
  const chain: string[] = []
  let current = byId.get(elementId)?.parentId
  while (current && byId.has(current) && !chain.includes(current)) {
    chain.push(current)
    current = byId.get(current)!.parentId
  }
  return chain
}

export function crossesBoundary(diagram: Diagram, flow: Flow): boolean {
  const a = new Set(boundaryChain(diagram, flow.sourceId))
  const b = boundaryChain(diagram, flow.targetId)
  return a.size !== b.length || b.some((id) => !a.has(id))
}

const area = (e: Element) => e.width * e.height

function containsRect(outer: Element, inner: Element) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height &&
    area(outer) > area(inner)
  )
}

function containsPoint(outer: Element, x: number, y: number) {
  return x >= outer.x && y >= outer.y && x <= outer.x + outer.width && y <= outer.y + outer.height
}

/**
 * Geometry is the source of truth for nesting: an element belongs to the smallest boundary that contains
 * its centre; a boundary belongs to the smallest larger boundary that fully contains it. Mutates the diagram.
 */
export function recomputeParents(diagram: Diagram) {
  const boundaries = diagram.elements.filter((e) => e.kind === 'boundary')
  for (const el of diagram.elements) {
    const candidates =
      el.kind === 'boundary'
        ? boundaries.filter((b) => b !== el && containsRect(b, el))
        : boundaries.filter((b) => containsPoint(b, el.x + el.width / 2, el.y + el.height / 2))
    candidates.sort((a, b) => area(a) - area(b))
    const parent = candidates[0]?.id
    if (parent) el.parentId = parent
    else delete el.parentId
  }
}

export interface TargetRef {
  diagram: Diagram
  kind: TargetKind
  element?: Element
  flow?: Flow
  name: string
}

export function findTarget(model: ThreatModel, targetId: string): TargetRef | undefined {
  for (const diagram of model.diagrams) {
    const element = diagram.elements.find((e) => e.id === targetId)
    if (element && (element.kind === 'actor' || element.kind === 'process' || element.kind === 'store'))
      return { diagram, kind: element.kind, element, name: element.name || `Unnamed ${element.kind}` }
    const flow = diagram.flows.find((f) => f.id === targetId)
    if (flow) return { diagram, kind: 'flow', flow, name: flowName(diagram, flow) }
  }
  return undefined
}

export function flowName(diagram: Diagram, flow: Flow): string {
  if (flow.name) return flow.name
  const name = (id: string) => diagram.elements.find((e) => e.id === id)?.name || '?'
  return `${name(flow.sourceId)} → ${name(flow.targetId)}`
}

/** Facts that catalog "when" conditions can test. */
export function targetFacts(target: TargetRef): Record<string, boolean> {
  if (target.flow) {
    return {
      isEncrypted: target.flow.isEncrypted,
      isPublicNetwork: target.flow.isPublicNetwork,
      crossesBoundary: crossesBoundary(target.diagram, target.flow),
    }
  }
  const e = target.element!
  return {
    isHuman: (e.actorType ?? 'human') === 'human',
    isAgent: e.actorType === 'agent',
    providesAuthentication: !!e.providesAuthentication,
    isWebApplication: !!e.isWebApplication,
    privileged: !!e.privileged,
    storesCredentials: !!e.storesCredentials,
    isLog: !!e.isLog,
    isEncrypted: !!e.isEncrypted,
    isSigned: !!e.isSigned,
  }
}

export function suggestionsFor(target: TargetRef, catalog: CatalogEntry[], existing: Threat[]): CatalogEntry[] {
  const facts = targetFacts(target)
  const used = new Set(existing.map((t) => t.catalogId).filter(Boolean))
  return catalog.filter(
    (entry) =>
      entry.appliesTo.includes(target.kind) &&
      !used.has(entry.id) &&
      (entry.when ?? []).every((cond) => (cond.startsWith('!') ? !facts[cond.slice(1)] : !!facts[cond])),
  )
}
