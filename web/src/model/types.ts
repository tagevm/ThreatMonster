// Mirrors ThreatMonster.Core.Model (the *.tm.json file format). Positions are absolute canvas coordinates.

export type ElementKind = 'actor' | 'process' | 'store' | 'boundary' | 'annotation'
export type ActorType = 'human' | 'system' | 'agent'
export type StrideCategory =
  | 'spoofing'
  | 'tampering'
  | 'repudiation'
  | 'informationDisclosure'
  | 'denialOfService'
  | 'elevationOfPrivilege'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type ThreatStatus = 'open' | 'mitigated' | 'accepted' | 'notApplicable'

export interface ThreatModel {
  format: 'threatmonster'
  version: number
  summary: ModelSummary
  diagrams: Diagram[]
  threats: Threat[]
}

export interface ModelSummary {
  title: string
  owner?: string
  reviewer?: string
  description?: string
  contributors: string[]
  createdAt?: string
  modifiedAt?: string
}

export interface Diagram {
  id: string
  title: string
  description?: string
  elements: Element[]
  flows: Flow[]
}

export interface Point {
  x: number
  y: number
}

export interface Element {
  id: string
  kind: ElementKind
  name: string
  description?: string
  parentId?: string
  x: number
  y: number
  width: number
  height: number
  outOfScope: boolean
  outOfScopeReason?: string
  actorType?: ActorType
  providesAuthentication?: boolean
  isWebApplication?: boolean
  privileged?: boolean
  storesCredentials?: boolean
  isLog?: boolean
  isEncrypted?: boolean
  isSigned?: boolean
  points?: Point[]
}

export interface Flow {
  id: string
  sourceId: string
  targetId: string
  name: string
  description?: string
  protocol?: string
  isEncrypted: boolean
  isPublicNetwork: boolean
  isBidirectional: boolean
  outOfScope: boolean
  outOfScopeReason?: string
}

export interface CvssScore {
  vector: string
  baseScore?: number
}

export interface Threat {
  id: string
  number: number
  title: string
  category: StrideCategory
  diagramId: string
  targetId: string
  description?: string
  mitigation?: string
  severity?: Severity
  status: ThreatStatus
  cvss?: CvssScore
  catalogId?: string
}

/** Something threats can be attached to. */
export type TargetKind = 'actor' | 'process' | 'store' | 'flow'

export interface CatalogEntry {
  id: string
  category: StrideCategory
  appliesTo: TargetKind[]
  title: string
  description: string
  mitigation: string
  when?: string[]
}

export interface Catalog {
  applicability: Record<TargetKind, StrideCategory[]>
  entries: CatalogEntry[]
}

export interface Finding {
  level: 'Info' | 'Warning'
  diagramId: string
  targetId?: string
  message: string
}

export function newId(): string {
  return crypto.randomUUID()
}

export function emptyModel(): ThreatModel {
  return {
    format: 'threatmonster',
    version: 1,
    summary: { title: 'Untitled threat model', contributors: [], createdAt: new Date().toISOString() },
    diagrams: [{ id: newId(), title: 'Main diagram', elements: [], flows: [] }],
    threats: [],
  }
}
