import { create } from 'zustand'
import { temporal } from 'zundo'
import { produce } from 'immer'
import { recomputeParents } from '../model/analysis'
import {
  emptyModel,
  newId,
  type Catalog,
  type Diagram,
  type Element,
  type ElementKind,
  type Flow,
  type ModelSummary,
  type Threat,
  type ThreatModel,
} from '../model/types'

export type View = 'diagram' | 'threats' | 'summary'

export interface ClipboardData {
  elements: Element[]
  flows: Flow[]
}

export const DEFAULT_SIZE: Record<ElementKind, { width: number; height: number; name: string }> = {
  actor: { width: 150, height: 70, name: 'New actor' },
  process: { width: 120, height: 120, name: 'New process' },
  store: { width: 160, height: 70, name: 'New data store' },
  boundary: { width: 380, height: 260, name: 'Trust boundary' },
  annotation: { width: 200, height: 50, name: 'Note' },
}

export interface GeometryUpdate {
  id: string
  x: number
  y: number
  width?: number
  height?: number
}

interface State {
  model: ThreatModel
  /** The model object as last saved/opened; dirty means `model !== savedModel`. */
  savedModel: ThreatModel
  fileHandle?: FileSystemFileHandle
  fileName?: string
  activeDiagramId: string
  /** Selected element and flow ids on the active diagram. */
  selectedIds: string[]
  /** Bumped to ask the canvas to scroll an item into view. */
  focus?: { id: string; nonce: number }
  /** Element whose name is being edited inline on the canvas. */
  editingId?: string
  view: View
  catalog?: Catalog
  clipboard?: ClipboardData

  load(model: ThreatModel, file?: { handle?: FileSystemFileHandle; name?: string }, opts?: { dirty?: boolean }): void
  markSaved(model: ThreatModel, file: { handle?: FileSystemFileHandle; name: string }): void
  setCatalog(catalog: Catalog): void
  setView(view: View): void
  select(ids: string[]): void
  setEditing(id?: string): void
  setActiveDiagram(id: string): void
  /** Show a threat's target on its diagram. */
  reveal(targetId: string): void

  updateSummary(patch: Partial<ModelSummary>): void
  addDiagram(): void
  updateDiagram(id: string, patch: Partial<Pick<Diagram, 'title' | 'description'>>): void
  removeDiagram(id: string): void

  addElement(kind: ElementKind, x: number, y: number): string
  updateElement(id: string, patch: Partial<Element>): void
  commitGeometry(updates: GeometryUpdate[]): void
  addFlow(sourceId: string, targetId: string): string
  updateFlow(id: string, patch: Partial<Flow>): void
  /** Removes elements and flows plus the threats attached to them. */
  removeItems(elementIds: string[], flowIds: string[]): number

  copy(elementIds: string[]): void
  paste(): void

  addThreat(threat: Omit<Threat, 'id' | 'number'>): string
  updateThreat(id: string, patch: Partial<Threat>): void
  removeThreat(id: string): void
}

function activeDiagram(model: ThreatModel, id: string): Diagram {
  return model.diagrams.find((d) => d.id === id) ?? model.diagrams[0]
}

function editDiagram(state: State, fn: (diagram: Diagram, model: ThreatModel) => void): ThreatModel {
  return produce(state.model, (draft) => {
    fn(activeDiagram(draft, state.activeDiagramId), draft)
  })
}

function shift(el: Element, dx: number, dy: number) {
  el.x += dx
  el.y += dy
  if (el.points) el.points = el.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

const initial = emptyModel()

export const useModel = create<State>()(
  temporal(
    (set, get) => ({
      model: initial,
      savedModel: initial,
      activeDiagramId: initial.diagrams[0].id,
      selectedIds: [],
      view: 'diagram',

      load(model, file, opts) {
        set({
          model,
          savedModel: opts?.dirty ? emptyModel() : model,
          fileHandle: file?.handle,
          fileName: file?.name,
          activeDiagramId: model.diagrams[0]?.id ?? '',
          selectedIds: [],
          editingId: undefined,
          view: 'diagram',
        })
        useModel.temporal.getState().clear()
      },

      markSaved(model, file) {
        // Stamping modifiedAt on save is not an undoable edit.
        const history = useModel.temporal.getState()
        history.pause()
        set({ model, savedModel: model, fileHandle: file.handle, fileName: file.name })
        history.resume()
      },

      setCatalog: (catalog) => set({ catalog }),
      setView: (view) => set({ view }),
      select: (selectedIds) => set({ selectedIds }),
      setEditing: (editingId) => set({ editingId }),
      setActiveDiagram: (id) => set({ activeDiagramId: id, selectedIds: [] }),

      reveal(targetId) {
        const diagram = get().model.diagrams.find(
          (d) => d.elements.some((e) => e.id === targetId) || d.flows.some((f) => f.id === targetId),
        )
        if (!diagram) return
        set((s) => ({
          activeDiagramId: diagram.id,
          selectedIds: [targetId],
          view: 'diagram',
          focus: { id: targetId, nonce: (s.focus?.nonce ?? 0) + 1 },
        }))
      },

      updateSummary: (patch) =>
        set((s) => ({ model: produce(s.model, (m) => void Object.assign(m.summary, patch)) })),

      addDiagram() {
        const id = newId()
        set((s) => ({
          model: produce(s.model, (m) => {
            m.diagrams.push({ id, title: `Diagram ${m.diagrams.length + 1}`, elements: [], flows: [] })
          }),
          activeDiagramId: id,
          selectedIds: [],
        }))
      },

      updateDiagram: (id, patch) =>
        set((s) => ({
          model: produce(s.model, (m) => {
            const d = m.diagrams.find((x) => x.id === id)
            if (d) Object.assign(d, patch)
          }),
        })),

      removeDiagram(id) {
        set((s) => {
          if (s.model.diagrams.length <= 1) return s
          const model = produce(s.model, (m) => {
            m.diagrams = m.diagrams.filter((d) => d.id !== id)
            m.threats = m.threats.filter((t) => t.diagramId !== id)
          })
          return {
            model,
            activeDiagramId: s.activeDiagramId === id ? model.diagrams[0].id : s.activeDiagramId,
            selectedIds: [],
          }
        })
      },

      addElement(kind, x, y) {
        const id = newId()
        const size = DEFAULT_SIZE[kind]
        set((s) => ({
          model: editDiagram(s, (d) => {
            d.elements.push({
              id,
              kind,
              name: size.name,
              x: Math.round(x - size.width / 2),
              y: Math.round(y - size.height / 2),
              width: size.width,
              height: size.height,
              outOfScope: false,
              ...(kind === 'actor' ? { actorType: 'human' as const } : {}),
            })
            recomputeParents(d)
          }),
          selectedIds: [id],
          editingId: kind === 'boundary' ? undefined : id,
        }))
        return id
      },

      updateElement: (id, patch) =>
        set((s) => ({
          model: editDiagram(s, (d) => {
            const el = d.elements.find((e) => e.id === id)
            if (el) Object.assign(el, patch)
          }),
        })),

      commitGeometry(updates) {
        set((s) => ({
          model: editDiagram(s, (d) => {
            const byId = new Map(d.elements.map((e) => [e.id, e]))
            const moved = new Map<string, { dx: number; dy: number }>()
            for (const u of updates) {
              const el = byId.get(u.id)
              if (!el) continue
              const dx = Math.round(u.x) - el.x
              const dy = Math.round(u.y) - el.y
              // A moved boundary carries its contents along. On resize the canvas keeps children in place.
              if (u.width === undefined) moved.set(el.id, { dx, dy })
              shift(el, dx, dy)
              if (u.width !== undefined) el.width = Math.round(u.width)
              if (u.height !== undefined) el.height = Math.round(u.height)
            }
            for (const el of d.elements) {
              if (moved.has(el.id) || updates.some((u) => u.id === el.id)) continue
              for (let p = el.parentId; p; p = byId.get(p)?.parentId) {
                const delta = moved.get(p)
                if (delta) {
                  shift(el, delta.dx, delta.dy)
                  break
                }
              }
            }
            recomputeParents(d)
          }),
        }))
      },

      addFlow(sourceId, targetId) {
        const id = newId()
        set((s) => ({
          model: editDiagram(s, (d) => {
            d.flows.push({
              id,
              sourceId,
              targetId,
              name: '',
              isEncrypted: false,
              isPublicNetwork: false,
              isBidirectional: false,
              outOfScope: false,
            })
          }),
          selectedIds: [id],
        }))
        return id
      },

      updateFlow: (id, patch) =>
        set((s) => ({
          model: editDiagram(s, (d) => {
            const f = d.flows.find((x) => x.id === id)
            if (f) Object.assign(f, patch)
          }),
        })),

      removeItems(elementIds, flowIds) {
        let removedThreats = 0
        set((s) => {
          const model = editDiagram(s, (d, m) => {
            const gone = new Set(elementIds)
            // Children of a deleted boundary stay where they are, in the next boundary up.
            for (const el of d.elements) {
              let parent = el.parentId
              while (parent && gone.has(parent)) parent = d.elements.find((e) => e.id === parent)?.parentId
              if (parent) el.parentId = parent
              else delete el.parentId
            }
            d.elements = d.elements.filter((e) => !gone.has(e.id))
            const goneFlows = new Set(flowIds)
            for (const f of d.flows) if (gone.has(f.sourceId) || gone.has(f.targetId)) goneFlows.add(f.id)
            d.flows = d.flows.filter((f) => !goneFlows.has(f.id))
            const before = m.threats.length
            m.threats = m.threats.filter((t) => !gone.has(t.targetId) && !goneFlows.has(t.targetId))
            removedThreats = before - m.threats.length
          })
          return { model, selectedIds: [] }
        })
        return removedThreats
      },

      copy(elementIds) {
        const d = activeDiagram(get().model, get().activeDiagramId)
        const ids = new Set(elementIds)
        set({
          clipboard: {
            elements: d.elements.filter((e) => ids.has(e.id)),
            flows: d.flows.filter((f) => ids.has(f.sourceId) && ids.has(f.targetId)),
          },
        })
      },

      paste() {
        const clip = get().clipboard
        if (!clip || clip.elements.length === 0) return
        const idMap = new Map(clip.elements.map((e) => [e.id, newId()]))
        set((s) => ({
          model: editDiagram(s, (d) => {
            for (const e of clip.elements) {
              d.elements.push({
                ...structuredClone(e),
                id: idMap.get(e.id)!,
                x: e.x + 40,
                y: e.y + 40,
                points: e.points?.map((p) => ({ x: p.x + 40, y: p.y + 40 })),
              })
            }
            for (const f of clip.flows) {
              d.flows.push({ ...f, id: newId(), sourceId: idMap.get(f.sourceId)!, targetId: idMap.get(f.targetId)! })
            }
            recomputeParents(d)
          }),
          // Pasting again offsets again.
          clipboard: {
            elements: clip.elements.map((e) => ({ ...e, x: e.x + 40, y: e.y + 40, points: e.points?.map((p) => ({ x: p.x + 40, y: p.y + 40 })) })),
            flows: clip.flows,
          },
          selectedIds: [...idMap.values()],
        }))
      },

      addThreat(threat) {
        const id = newId()
        set((s) => ({
          model: produce(s.model, (m) => {
            const number = m.threats.reduce((max, t) => Math.max(max, t.number), 0) + 1
            m.threats.push({ ...threat, id, number })
          }),
        }))
        return id
      },

      updateThreat: (id, patch) =>
        set((s) => ({
          model: produce(s.model, (m) => {
            const t = m.threats.find((x) => x.id === id)
            if (t) Object.assign(t, patch)
          }),
        })),

      removeThreat: (id) =>
        set((s) => ({ model: produce(s.model, (m) => void (m.threats = m.threats.filter((t) => t.id !== id))) })),
    }),
    {
      // Only the model is part of undo history; selection, view etc. are UI state.
      partialize: (s) => ({ model: s.model }),
      equality: (a, b) => a.model === b.model,
      limit: 200,
      // Changes in quick succession (typing in a field) become a single undo step.
      handleSet: (handleSet) => {
        let last = 0
        return (...args: Parameters<typeof handleSet>) => {
          const now = Date.now()
          if (now - last > 400) handleSet(...args)
          last = now
        }
      },
    },
  ),
)

export const useActiveDiagram = () => useModel((s) => activeDiagram(s.model, s.activeDiagramId))

/** The single selected element or flow on the active diagram, if exactly one is selected. */
export function useSelectedItem(): { element?: Element; flow?: Flow } | undefined {
  const diagram = useActiveDiagram()
  const ids = useModel((s) => s.selectedIds)
  if (ids.length !== 1) return undefined
  const element = diagram.elements.find((e) => e.id === ids[0])
  if (element) return { element }
  const flow = diagram.flows.find((f) => f.id === ids[0])
  return flow ? { flow } : undefined
}
export const useIsDirty = () => useModel((s) => s.model !== s.savedModel)
export const undo = () => useModel.temporal.getState().undo()
export const redo = () => useModel.temporal.getState().redo()
