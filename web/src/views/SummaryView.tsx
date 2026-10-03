import { useState } from 'react'
import { FileCode2, FileText, Loader2 } from 'lucide-react'
import { FindingsList } from '../components/FindingsList'
import { notify } from '../components/Toasts'
import { useFindings } from '../components/useFindings'
import { SEVERITIES, STRIDE, severityClasses } from '../model/stride'
import type { Severity } from '../model/types'
import { downloadMarkdownReport, openHtmlReport } from '../reports'
import { useModel } from '../store/modelStore'

export function SummaryView() {
  const model = useModel((s) => s.model)
  const findings = useFindings()
  const threats = model.threats
  const open = threats.filter((t) => t.status === 'open')
  const elements = model.diagrams.flatMap((d) => d.elements).filter((e) => e.kind === 'actor' || e.kind === 'process' || e.kind === 'store')
  const flows = model.diagrams.flatMap((d) => d.flows)
  const covered = new Set(threats.map((t) => t.targetId))
  const inScope = [...elements, ...flows].filter((x) => !x.outOfScope)
  const coverage = inScope.length ? Math.round((inScope.filter((x) => covered.has(x.id)).length / inScope.length) * 100) : 0
  const severityCols: (Severity | undefined)[] = [...SEVERITIES.map((s) => s.id), undefined]

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{model.summary.title}</h1>
          {model.summary.description && <p className="mt-1 max-w-3xl text-stone-600">{model.summary.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Threats" value={threats.length} />
          <Stat label="Open" value={open.length} tone="text-amber-700" />
          <Stat label="High / critical open" value={open.filter((t) => t.severity === 'high' || t.severity === 'critical').length} tone="text-red-700" />
          <Stat label="Mitigated" value={threats.filter((t) => t.status === 'mitigated').length} tone="text-green-700" />
          <Stat label="Elements & flows with threats" value={`${coverage}%`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card title="Open threats by STRIDE category">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-500">
                  <th className="py-1.5 text-left font-medium">Category</th>
                  {severityCols.map((s) => (
                    <th key={s ?? 'none'} className="py-1.5 text-center font-medium">
                      {SEVERITIES.find((x) => x.id === s)?.label ?? 'Not rated'}
                    </th>
                  ))}
                  <th className="py-1.5 text-center font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {STRIDE.map((c) => {
                  const inCat = open.filter((t) => t.category === c.id)
                  return (
                    <tr key={c.id} className="border-t border-stone-100">
                      <td className="py-1.5 text-stone-700">
                        <span className="mr-2 inline-flex size-5 items-center justify-center rounded bg-violet-100 text-[11px] font-bold text-violet-800">{c.letter}</span>
                        {c.label}
                      </td>
                      {severityCols.map((s) => {
                        const n = inCat.filter((t) => t.severity === s).length
                        return (
                          <td key={s ?? 'none'} className="py-1.5 text-center">
                            {n > 0 ? (
                              <span className={`inline-block min-w-6 rounded-full px-1.5 text-xs font-semibold ring-1 ring-inset ${severityClasses[s ?? 'none']}`}>{n}</span>
                            ) : (
                              <span className="text-stone-300">·</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-1.5 text-center font-semibold text-stone-800">{inCat.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <Card title="Reports">
            <p className="mb-3 text-sm text-stone-600">Reports include the diagrams, every threat with its mitigation, and the open analysis gaps.</p>
            <div className="space-y-2">
              <ReportButton
                icon={<FileText size={18} />}
                label="HTML report"
                hint="Opens in a new tab. Use the browser's Print, then Save as PDF, to get a PDF."
                action={openHtmlReport}
              />
              <ReportButton
                icon={<FileCode2 size={18} />}
                label="Markdown report"
                hint="Diagrams as Mermaid, so they render in GitHub, GitLab and Azure DevOps."
                action={downloadMarkdownReport}
              />
            </div>
          </Card>
        </div>

        <Card title="Analysis gaps">
          <FindingsList findings={findings} />
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'text-stone-900' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-stone-500 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function ReportButton({ icon, label, hint, action }: { icon: React.ReactNode; label: string; hint: string; action: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await action()
        } catch (e) {
          notify(`Could not create report: ${(e as Error).message}`, 'error')
        } finally {
          setBusy(false)
        }
      }}
      className="flex w-full items-start gap-3 rounded-lg border border-stone-200 p-3 text-left hover:border-violet-300 hover:bg-violet-50 disabled:opacity-60"
    >
      <span className="mt-0.5 text-violet-700">{busy ? <Loader2 size={18} className="animate-spin" /> : icon}</span>
      <span>
        <span className="block text-sm font-medium text-stone-800">{label}</span>
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
    </button>
  )
}
