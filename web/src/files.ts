import { api } from './api'
import type { ThreatModel } from './model/types'

// File System Access API (Chromium) gives real open / save-in-place; other browsers fall back
// to an <input type=file> and a download.

interface FilePickerWindow {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>
}
const fsWindow = window as unknown as FilePickerWindow

const jsonTypes = [{ description: 'Threat model', accept: { 'application/json': ['.json'] } }]

export const supportsSaveInPlace = typeof fsWindow.showSaveFilePicker === 'function'

export interface OpenedFile {
  model: ThreatModel
  name: string
  handle?: FileSystemFileHandle
  /** Set when the file was converted from Threat Dragon; the model has not been saved in our format yet. */
  importWarnings?: string[]
}

export async function pickAndOpen(): Promise<OpenedFile | undefined> {
  let file: File
  let handle: FileSystemFileHandle | undefined
  if (fsWindow.showOpenFilePicker) {
    try {
      ;[handle] = await fsWindow.showOpenFilePicker({ types: jsonTypes })
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return undefined
      throw e
    }
    file = await handle.getFile()
  } else {
    const picked = await pickWithInput()
    if (!picked) return undefined
    file = picked
  }
  return openText(await file.text(), file.name, handle)
}

/** Detects the format: ThreatMonster files are validated, Threat Dragon files are converted. */
export async function openText(text: string, name: string, handle?: FileSystemFileHandle): Promise<OpenedFile> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${name} is not a JSON file.`)
  }
  const obj = parsed as Record<string, unknown>
  if (obj?.format === 'threatmonster') {
    return { model: await api.openModel(text), name, handle }
  }
  if (obj && typeof obj === 'object' && 'detail' in obj) {
    const { model, warnings } = await api.importThreatDragon(text)
    // Never overwrite the Threat Dragon original: drop the handle and suggest a new name.
    return { model, name: name.replace(/(\.tm)?\.json$/i, '') + '.tm.json', importWarnings: warnings }
  }
  throw new Error(`${name} is neither a ThreatMonster nor a Threat Dragon model.`)
}

function pickWithInput(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => resolve(input.files?.[0])
    input.oncancel = () => resolve(undefined)
    input.click()
  })
}

export function serialize(model: ThreatModel): string {
  return JSON.stringify(model, null, 2) + '\n'
}

export function suggestedName(model: ThreatModel): string {
  const slug = model.summary.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'threat-model'
  return `${slug}.tm.json`
}

/** Saves to the existing handle, or asks for a location. Returns the handle/name used, or undefined if cancelled. */
export async function saveModel(
  model: ThreatModel,
  current: { handle?: FileSystemFileHandle; name?: string },
  saveAs: boolean,
): Promise<{ handle?: FileSystemFileHandle; name: string } | undefined> {
  const text = serialize(model)
  let handle = saveAs ? undefined : current.handle
  if (!handle && fsWindow.showSaveFilePicker) {
    try {
      handle = await fsWindow.showSaveFilePicker({ suggestedName: current.name ?? suggestedName(model), types: jsonTypes })
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return undefined
      throw e
    }
  }
  if (handle) {
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return { handle, name: handle.name }
  }
  const name = current.name ?? suggestedName(model)
  download(text, name, 'application/json')
  return { name }
}

export function download(content: string | Blob, name: string, type: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Autosaved draft, so a closed tab or crash does not lose work.
const DRAFT_KEY = 'threatmonster:draft'

export interface Draft {
  model: ThreatModel
  fileName?: string
  savedAt: string
}

export function writeDraft(draft: Draft | undefined) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage unavailable or full; drafts are best effort */
  }
}

export function readDraft(): Draft | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : undefined
  } catch {
    return undefined
  }
}
