import { Trash2 } from 'lucide-react'
import { Label, Segmented, Select, TextArea, TextField, Toggle } from '../components/form'
import { notify } from '../components/Toasts'
import { api } from '../api'
import { SEVERITIES, STATUSES, STRIDE, severityClasses, statusClasses } from '../model/stride'
import type { Threat } from '../model/types'
import { useModel } from '../store/modelStore'
import { CvssEditor, DEFAULT_VECTOR } from './CvssEditor'

export function ThreatEditor({ threat, autoFocus }: { threat: Threat; autoFocus?: boolean }) {
  const { updateThreat, removeThreat } = useModel.getState()
  const update = (patch: Partial<Threat>) => updateThreat(threat.id, patch)

  return (
    <div className="space-y-3">
      <TextField label="Title" value={threat.title} onChange={(title) => update({ title })} autoFocus={autoFocus} />

      <div>
        <Label>Status</Label>
        <Segmented
          size="sm"
          value={threat.status}
          options={STATUSES.map((s) => ({ ...s, activeClass: `${statusClasses[s.id]} ring-1 ring-inset font-medium` }))}
          onChange={(status) => update({ status })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="STRIDE category"
          value={threat.category}
          options={STRIDE.map((s) => ({ id: s.id, label: s.label }))}
          onChange={(category) => category && update({ category })}
        />
        <Select
          label={threat.cvss ? 'Severity (from CVSS)' : 'Severity'}
          value={threat.severity}
          disabled={!!threat.cvss}
          options={[{ id: '', label: 'Not rated' }, ...SEVERITIES]}
          onChange={(severity) => update({ severity })}
        />
      </div>

      <Toggle
        label="Score with CVSS"
        hint="Optional. When on, severity is derived from the CVSS base score."
        checked={!!threat.cvss}
        onChange={async (on) => {
          if (!on) return update({ cvss: undefined })
          try {
            const r = await api.cvss(DEFAULT_VECTOR)
            update({ cvss: { vector: r.vector, baseScore: r.baseScore }, severity: r.severity })
          } catch (e) {
            notify(`CVSS calculator unavailable: ${(e as Error).message}`, 'error')
          }
        }}
      />
      {threat.cvss && <CvssEditor value={threat.cvss} onChange={(cvss, severity) => update({ cvss, severity })} />}

      <TextArea label="Description" value={threat.description} onChange={(description) => update({ description })} rows={3} />
      <TextArea
        label="Mitigation"
        value={threat.mitigation}
        onChange={(mitigation) => update({ mitigation })}
        placeholder="How is this threat addressed, or what should be done?"
        rows={3}
      />

      <div className="flex justify-end">
        <button
          onClick={() => {
            removeThreat(threat.id)
            notify(`Deleted threat #${threat.number}. Press Ctrl+Z to undo.`)
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50"
        >
          <Trash2 size={14} /> Delete threat
        </button>
      </div>
    </div>
  )
}

export function SeverityBadge({ threat }: { threat: Threat }) {
  const label = SEVERITIES.find((s) => s.id === threat.severity)?.label ?? 'Not rated'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${severityClasses[threat.severity ?? 'none']}`}
    >
      {label}
      {threat.cvss?.baseScore !== undefined && <span className="ml-1 tabular-nums opacity-75">{threat.cvss.baseScore.toFixed(1)}</span>}
    </span>
  )
}

export function StatusBadge({ threat }: { threat: Threat }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${statusClasses[threat.status]}`}>
      {STATUSES.find((s) => s.id === threat.status)!.label}
    </span>
  )
}
