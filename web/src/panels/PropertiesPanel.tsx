import { Trash2 } from 'lucide-react'
import { FindingsList } from '../components/FindingsList'
import { ListField, Section, Segmented, TextArea, TextField, Toggle } from '../components/form'
import { notify } from '../components/Toasts'
import { useFindings } from '../components/useFindings'
import { crossesBoundary, findTarget } from '../model/analysis'
import { ACTOR_TYPES, KIND_LABELS } from '../model/stride'
import type { Element, Flow } from '../model/types'
import { useActiveDiagram, useModel, useSelectedItem } from '../store/modelStore'
import { ThreatsSection } from './ThreatsSection'

export function PropertiesPanel() {
  const item = useSelectedItem()
  const count = useModel((s) => s.selectedIds.length)

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-stone-200 bg-white">
      {item?.element && <ElementProperties key={item.element.id} element={item.element} />}
      {item?.flow && <FlowProperties key={item.flow.id} flow={item.flow} />}
      {!item && count > 1 && <MultiSelection count={count} />}
      {!item && count <= 1 && <ModelProperties />}
    </aside>
  )
}

function Header({ kind, onDelete }: { kind: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2.5">
      <span className="text-xs font-semibold tracking-wider text-stone-500 uppercase">{kind}</span>
      <button title="Delete (Del)" onClick={onDelete} className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function deleteItems(elementIds: string[], flowIds: string[]) {
  const removed = useModel.getState().removeItems(elementIds, flowIds)
  notify(`Deleted${removed ? ` (with ${removed} threat(s))` : ''}. Press Ctrl+Z to undo.`)
}

function ElementProperties({ element }: { element: Element }) {
  const model = useModel((s) => s.model)
  const updateElement = useModel((s) => s.updateElement)
  const update = (patch: Partial<Element>) => updateElement(element.id, patch)
  const target = findTarget(model, element.id)

  return (
    <>
      <Header kind={KIND_LABELS[element.kind]} onDelete={() => deleteItems([element.id], [])} />
      <Section title="Properties">
        <TextField label="Name" value={element.name} onChange={(name) => update({ name })} />
        <TextArea label="Description" value={element.description} onChange={(description) => update({ description })} rows={2} />

        {element.kind === 'actor' && (
          <>
            <Segmented value={element.actorType ?? 'human'} options={ACTOR_TYPES} onChange={(actorType) => update({ actorType })} size="sm" />
            <Toggle
              label="Provides authentication"
              hint="e.g. an identity provider"
              checked={!!element.providesAuthentication}
              onChange={(v) => update({ providesAuthentication: v || undefined })}
            />
          </>
        )}
        {element.kind === 'process' && (
          <>
            <Toggle label="Web application" checked={!!element.isWebApplication} onChange={(v) => update({ isWebApplication: v || undefined })} />
            <Toggle label="Runs with elevated privileges" checked={!!element.privileged} onChange={(v) => update({ privileged: v || undefined })} />
          </>
        )}
        {element.kind === 'store' && (
          <>
            <Toggle label="Stores credentials" checked={!!element.storesCredentials} onChange={(v) => update({ storesCredentials: v || undefined })} />
            <Toggle label="Is a log / audit trail" checked={!!element.isLog} onChange={(v) => update({ isLog: v || undefined })} />
            <Toggle label="Encrypted at rest" checked={!!element.isEncrypted} onChange={(v) => update({ isEncrypted: v || undefined })} />
            <Toggle label="Integrity protected (signed)" checked={!!element.isSigned} onChange={(v) => update({ isSigned: v || undefined })} />
          </>
        )}
        {(element.kind === 'actor' || element.kind === 'process' || element.kind === 'store') && (
          <OutOfScope value={element} onChange={update} />
        )}
      </Section>

      {target && (
        <Section title="Threats">
          <ThreatsSection key={element.id} target={target} />
        </Section>
      )}
    </>
  )
}

function FlowProperties({ flow }: { flow: Flow }) {
  const model = useModel((s) => s.model)
  const diagram = useActiveDiagram()
  const updateFlow = useModel((s) => s.updateFlow)
  const update = (patch: Partial<Flow>) => updateFlow(flow.id, patch)
  const target = findTarget(model, flow.id)
  const name = (id: string) => diagram.elements.find((e) => e.id === id)?.name || '?'

  return (
    <>
      <Header kind="Data flow" onDelete={() => deleteItems([], [flow.id])} />
      <Section title="Properties">
        <p className="text-sm text-stone-600">
          <b className="font-medium text-stone-800">{name(flow.sourceId)}</b> {flow.isBidirectional ? '⇄' : '→'}{' '}
          <b className="font-medium text-stone-800">{name(flow.targetId)}</b>
          {crossesBoundary(diagram, flow) && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">crosses trust boundary</span>
          )}
        </p>
        <TextField label="Name" value={flow.name} onChange={(v) => update({ name: v })} placeholder="What data flows here?" autoFocus={!flow.name} />
        <TextField label="Protocol" value={flow.protocol} onChange={(protocol) => update({ protocol })} placeholder="e.g. HTTPS, AMQP, SQL" />
        <TextArea label="Description" value={flow.description} onChange={(description) => update({ description })} rows={2} />
        <Toggle label="Encrypted in transit" checked={flow.isEncrypted} onChange={(isEncrypted) => update({ isEncrypted })} />
        <Toggle label="Over a public network" checked={flow.isPublicNetwork} onChange={(isPublicNetwork) => update({ isPublicNetwork })} />
        <Toggle label="Bidirectional" checked={flow.isBidirectional} onChange={(isBidirectional) => update({ isBidirectional })} />
        <button
          className="text-xs text-violet-700 hover:underline"
          onClick={() => update({ sourceId: flow.targetId, targetId: flow.sourceId })}
        >
          Reverse direction
        </button>
        <OutOfScope value={flow} onChange={update} />
      </Section>
      {target && (
        <Section title="Threats">
          <ThreatsSection key={flow.id} target={target} />
        </Section>
      )}
    </>
  )
}

function OutOfScope({
  value,
  onChange,
}: {
  value: { outOfScope: boolean; outOfScopeReason?: string }
  onChange: (patch: { outOfScope?: boolean; outOfScopeReason?: string }) => void
}) {
  return (
    <>
      <Toggle label="Out of scope" checked={value.outOfScope} onChange={(outOfScope) => onChange({ outOfScope })} />
      {value.outOfScope && (
        <TextField label="Reason" value={value.outOfScopeReason} onChange={(outOfScopeReason) => onChange({ outOfScopeReason })} />
      )}
    </>
  )
}

function MultiSelection({ count }: { count: number }) {
  const diagram = useActiveDiagram()
  const ids = useModel((s) => s.selectedIds)
  return (
    <Section title="Selection">
      <p className="text-sm text-stone-700">{count} items selected.</p>
      <p className="text-xs text-stone-500">Ctrl+C / Ctrl+V to copy, Ctrl+D to duplicate, Del to delete.</p>
      <button
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-red-700 hover:bg-red-50"
        onClick={() =>
          deleteItems(
            ids.filter((id) => diagram.elements.some((e) => e.id === id)),
            ids.filter((id) => diagram.flows.some((f) => f.id === id)),
          )
        }
      >
        <Trash2 size={14} /> Delete selection
      </button>
    </Section>
  )
}

function ModelProperties() {
  const summary = useModel((s) => s.model.summary)
  const diagram = useActiveDiagram()
  const { updateSummary, updateDiagram } = useModel.getState()
  const findings = useFindings()

  return (
    <>
      <Section title="Threat model">
        <TextField label="Title" value={summary.title} onChange={(title) => updateSummary({ title })} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Owner" value={summary.owner} onChange={(owner) => updateSummary({ owner })} />
          <TextField label="Reviewer" value={summary.reviewer} onChange={(reviewer) => updateSummary({ reviewer })} />
        </div>
        <ListField label="Contributors" value={summary.contributors} onChange={(contributors) => updateSummary({ contributors })} />
        <TextArea
          label="Description"
          value={summary.description}
          onChange={(description) => updateSummary({ description })}
          placeholder="What system is modelled, and what is in scope?"
        />
      </Section>
      <Section title="Diagram">
        <TextField label="Title" value={diagram.title} onChange={(title) => updateDiagram(diagram.id, { title })} />
        <TextArea label="Description" value={diagram.description} onChange={(description) => updateDiagram(diagram.id, { description })} rows={2} />
      </Section>
      <Section title="Analysis gaps">
        <FindingsList findings={findings} limit={8} />
      </Section>
      <p className="px-4 py-3 text-xs text-stone-500">Select an element or flow to see its properties and STRIDE threats.</p>
    </>
  )
}
