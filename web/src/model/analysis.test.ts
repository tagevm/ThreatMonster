import { describe, expect, it } from 'vitest'
import { crossesBoundary, findTarget, recomputeParents, suggestionsFor } from './analysis'
import type { CatalogEntry, Diagram, Element, ThreatModel } from './types'

const el = (id: string, kind: Element['kind'], x: number, y: number, width: number, height: number, extra: Partial<Element> = {}): Element => ({
  id,
  kind,
  name: id,
  x,
  y,
  width,
  height,
  outOfScope: false,
  ...extra,
})

function diagram(): Diagram {
  return {
    id: 'd',
    title: 'd',
    elements: [
      el('outer', 'boundary', 0, 0, 1000, 1000),
      el('inner', 'boundary', 100, 100, 400, 400),
      el('api', 'process', 200, 200, 100, 100), // inside inner
      el('web', 'process', 600, 600, 100, 100), // inside outer only
      el('user', 'actor', 1200, 200, 150, 70), // outside everything
      el('edge', 'store', 470, 200, 100, 60), // centre (520, 230) is outside inner
    ],
    flows: [
      { id: 'f1', sourceId: 'user', targetId: 'web', name: '', isEncrypted: false, isPublicNetwork: false, isBidirectional: false, outOfScope: false },
      { id: 'f2', sourceId: 'web', targetId: 'api', name: '', isEncrypted: true, isPublicNetwork: false, isBidirectional: false, outOfScope: false },
      { id: 'f3', sourceId: 'web', targetId: 'edge', name: '', isEncrypted: false, isPublicNetwork: false, isBidirectional: false, outOfScope: false },
    ],
  }
}

describe('recomputeParents', () => {
  it('nests by centre for elements and full containment for boundaries', () => {
    const d = diagram()
    recomputeParents(d)
    const parent = (id: string) => d.elements.find((e) => e.id === id)!.parentId
    expect(parent('outer')).toBeUndefined()
    expect(parent('inner')).toBe('outer')
    expect(parent('api')).toBe('inner')
    expect(parent('web')).toBe('outer')
    expect(parent('edge')).toBe('outer')
    expect(parent('user')).toBeUndefined()
  })
})

describe('crossesBoundary', () => {
  it('is true when the ends sit in different zones', () => {
    const d = diagram()
    recomputeParents(d)
    const flow = (id: string) => d.flows.find((f) => f.id === id)!
    expect(crossesBoundary(d, flow('f1'))).toBe(true) // outside → outer
    expect(crossesBoundary(d, flow('f2'))).toBe(true) // outer → inner
    expect(crossesBoundary(d, flow('f3'))).toBe(false) // outer → outer
  })
})

describe('suggestionsFor', () => {
  const catalog: CatalogEntry[] = [
    { id: 'always', category: 'tampering', appliesTo: ['flow'], title: '', description: '', mitigation: '' },
    { id: 'plain', category: 'informationDisclosure', appliesTo: ['flow'], title: '', description: '', mitigation: '', when: ['!isEncrypted'] },
    { id: 'crossing', category: 'denialOfService', appliesTo: ['flow'], title: '', description: '', mitigation: '', when: ['crossesBoundary'] },
    { id: 'proc', category: 'spoofing', appliesTo: ['process'], title: '', description: '', mitigation: '' },
  ]

  function model(): ThreatModel {
    const d = diagram()
    recomputeParents(d)
    return { format: 'threatmonster', version: 1, summary: { title: '', contributors: [] }, diagrams: [d], threats: [] }
  }

  it('filters by target kind and conditions', () => {
    const m = model()
    const ids = (targetId: string) => suggestionsFor(findTarget(m, targetId)!, catalog, []).map((e) => e.id)
    expect(ids('f1')).toEqual(['always', 'plain', 'crossing'])
    expect(ids('f2')).toEqual(['always', 'crossing']) // encrypted
    expect(ids('f3')).toEqual(['always', 'plain']) // same zone
    expect(ids('api')).toEqual(['proc'])
  })

  it('hides suggestions that were already added', () => {
    const m = model()
    const existing = [{ id: 't', number: 1, title: '', category: 'tampering' as const, diagramId: 'd', targetId: 'f1', status: 'open' as const, catalogId: 'always' }]
    expect(suggestionsFor(findTarget(m, 'f1')!, catalog, existing).map((e) => e.id)).toEqual(['plain', 'crossing'])
  })
})
