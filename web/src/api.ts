import type { Catalog, Finding, Severity, ThreatModel } from './model/types'

async function call<T>(path: string, init: RequestInit, as: 'json' | 'text' = 'json'): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      message = (await res.json()).error ?? message
    } catch {
      /* not JSON */
    }
    throw new Error(message)
  }
  return (as === 'json' ? res.json() : res.text()) as Promise<T>
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

export const api = {
  catalog: () => call<Catalog>('/catalog', {}),

  cvss: (vector: string) =>
    call<{ vector: string; baseScore: number; severity?: Severity }>('/cvss', postJson({ vector })),

  /** Validates a ThreatMonster file and returns it normalised. */
  openModel: (json: string) => call<ThreatModel>('/models/open', postJson(json)),

  importThreatDragon: (json: string) =>
    call<{ model: ThreatModel; warnings: string[] }>('/import/threatdragon', postJson(json)),

  analysis: (model: ThreatModel) => call<Finding[]>('/analysis', postJson(model)),

  markdownReport: (model: ThreatModel) => call<string>('/reports/markdown', postJson(model), 'text'),

  htmlReport: (model: ThreatModel) => call<string>('/reports/html', postJson(model), 'text'),
}
