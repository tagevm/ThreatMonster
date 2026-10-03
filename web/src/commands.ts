import { produce } from 'immer'
import { notify } from './components/Toasts'
import { openText, pickAndOpen, saveModel, type OpenedFile } from './files'
import { emptyModel } from './model/types'
import { useModel } from './store/modelStore'

// File commands shared by the toolbar, keyboard shortcuts and drag & drop.

/** Set by the app to show Threat Dragon import warnings. */
export const importListeners: { onImported?: (file: OpenedFile) => void } = {}

function confirmDiscard(): boolean {
  const s = useModel.getState()
  return s.model === s.savedModel || confirm('You have unsaved changes. Discard them?')
}

export function newModel() {
  if (confirmDiscard()) useModel.getState().load(emptyModel())
}

export async function openModel() {
  if (!confirmDiscard()) return
  try {
    const file = await pickAndOpen()
    if (file) loadOpened(file)
  } catch (e) {
    notify((e as Error).message, 'error')
  }
}

export async function openDroppedFile(file: File) {
  if (!confirmDiscard()) return
  try {
    loadOpened(await openText(await file.text(), file.name))
  } catch (e) {
    notify((e as Error).message, 'error')
  }
}

function loadOpened(file: OpenedFile) {
  const imported = file.importWarnings !== undefined
  useModel.getState().load(file.model, { handle: file.handle, name: file.name }, { dirty: imported })
  if (imported) importListeners.onImported?.(file)
}

export async function save(saveAs = false) {
  const s = useModel.getState()
  const model = produce(s.model, (m) => {
    m.summary.modifiedAt = new Date().toISOString()
    m.summary.createdAt ??= m.summary.modifiedAt
  })
  try {
    const result = await saveModel(model, { handle: s.fileHandle, name: s.fileName }, saveAs)
    if (!result) return
    useModel.getState().markSaved(model, result)
    notify(result.handle ? `Saved ${result.name}` : `Downloaded ${result.name}`)
  } catch (e) {
    notify(`Save failed: ${(e as Error).message}`, 'error')
  }
}
