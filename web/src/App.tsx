import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { FilePlus2, FolderOpen, HelpCircle, Redo2, Save, Undo2 } from 'lucide-react'
import { useStore } from 'zustand'
import { api } from './api'
import { importListeners, newModel, openDroppedFile, openModel, save } from './commands'
import { Modal } from './components/Modal'
import { Toasts, notify } from './components/Toasts'
import { DiagramCanvas, Kbd, canvasApi } from './diagram/DiagramCanvas'
import { DiagramTabs } from './diagram/DiagramTabs'
import { Palette } from './diagram/Palette'
import { readDraft, supportsSaveInPlace, writeDraft, type Draft, type OpenedFile } from './files'
import type { ElementKind } from './model/types'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { redo, undo, useIsDirty, useModel, type View } from './store/modelStore'
import { SummaryView } from './views/SummaryView'
import { ThreatsView } from './views/ThreatsView'

const SHORTCUT_KINDS: Record<string, ElementKind> = { a: 'actor', p: 'process', s: 'store', b: 'boundary', n: 'annotation' }

export default function App() {
  const view = useModel((s) => s.view)
  const [help, setHelp] = useState(false)
  const [imported, setImported] = useState<OpenedFile>()
  const [draft, setDraft] = useState<Draft | undefined>(() => readDraft())

  useEffect(() => {
    api
      .catalog()
      .then(useModel.getState().setCatalog)
      .catch(() => notify('Cannot reach the ThreatMonster API. Is the .NET backend running (dotnet run)?', 'error'))
    importListeners.onImported = setImported
  }, [])

  useDraftAutosave(draft !== undefined)
  useShortcuts(() => setHelp((h) => !h))
  useFileDrop()

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-900">
      <TopBar onHelp={() => setHelp(true)} />
      {draft && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>
            Found unsaved work{draft.fileName ? ` on ${draft.fileName}` : ''} from {new Date(draft.savedAt).toLocaleString()}.
          </span>
          <button
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
            onClick={() => {
              useModel.getState().load(draft.model, { name: draft.fileName }, { dirty: true })
              setDraft(undefined)
            }}
          >
            Restore
          </button>
          <button
            className="rounded-md px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
            onClick={() => {
              writeDraft(undefined)
              setDraft(undefined)
            }}
          >
            Discard
          </button>
        </div>
      )}
      <main className="min-h-0 flex-1">
        {view === 'diagram' && (
          <div className="flex h-full">
            <Palette />
            <div className="flex min-w-0 flex-1 flex-col">
              <DiagramTabs />
              <div className="relative min-h-0 flex-1 bg-white">
                <ReactFlowProvider>
                  <DiagramCanvas />
                </ReactFlowProvider>
              </div>
            </div>
            <PropertiesPanel />
          </div>
        )}
        {view === 'threats' && <ThreatsView />}
        {view === 'summary' && <SummaryView />}
      </main>
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {imported && <ImportDialog file={imported} onClose={() => setImported(undefined)} />}
      <Toasts />
    </div>
  )
}

function TopBar({ onHelp }: { onHelp: () => void }) {
  const title = useModel((s) => s.model.summary.title)
  const fileName = useModel((s) => s.fileName)
  const threatCount = useModel((s) => s.model.threats.length)
  const openCount = useModel((s) => s.model.threats.filter((t) => t.status === 'open').length)
  const view = useModel((s) => s.view)
  const setView = useModel((s) => s.setView)
  const dirty = useIsDirty()
  const canUndo = useStore(useModel.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useModel.temporal, (s) => s.futureStates.length > 0)

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${title} – ThreatMonster`
  }, [title, dirty])

  const tabs: { id: View; label: string; badge?: string }[] = [
    { id: 'diagram', label: 'Diagram' },
    { id: 'threats', label: 'Threats', badge: threatCount ? `${openCount}/${threatCount}` : undefined },
    { id: 'summary', label: 'Summary & reports' },
  ]

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-3">
      <div className="flex items-center gap-2">
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="font-bold tracking-tight text-violet-800">ThreatMonster</span>
      </div>
      <div className="h-6 w-px bg-stone-200" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-stone-800">
          {title}
          {dirty && <span title="Unsaved changes" className="ml-1.5 inline-block size-2 rounded-full bg-amber-500 align-middle" />}
        </span>
        <span className="truncate text-[11px] text-stone-500">{fileName ?? 'Not saved yet'}</span>
      </div>

      <nav className="mx-auto flex rounded-lg bg-stone-100 p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${view === t.id ? 'bg-white font-medium text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
          >
            {t.label}
            {t.badge && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800" title="open / total threats">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-0.5">
        <IconButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </IconButton>
        <div className="mx-1 h-6 w-px bg-stone-200" />
        <IconButton title="New model" onClick={newModel}>
          <FilePlus2 size={17} />
        </IconButton>
        <IconButton title="Open a ThreatMonster or Threat Dragon file (Ctrl+O)" onClick={openModel}>
          <FolderOpen size={17} />
        </IconButton>
        <button
          title={supportsSaveInPlace ? 'Save (Ctrl+S)' : 'Download the model file (Ctrl+S)'}
          onClick={() => save()}
          className="ml-1 flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
        >
          <Save size={15} /> Save
        </button>
        <IconButton title="Keyboard shortcuts (?)" onClick={onHelp}>
          <HelpCircle size={17} />
        </IconButton>
      </div>
    </header>
  )
}

function IconButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function useShortcuts(toggleHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const typing = isTyping(e.target)
      const s = useModel.getState()

      if (mod && key === 's') {
        e.preventDefault()
        void save(e.shiftKey)
        return
      }
      if (mod && key === 'o') {
        e.preventDefault()
        void openModel()
        return
      }
      if (typing) return

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === '?') {
        toggleHelp()
      } else if (s.view === 'diagram') {
        const diagram = s.model.diagrams.find((d) => d.id === s.activeDiagramId)
        const selectedElements = s.selectedIds.filter((id) => diagram?.elements.some((el) => el.id === id))
        if (mod && key === 'c') {
          if (selectedElements.length) s.copy(selectedElements)
        } else if (mod && key === 'v') {
          e.preventDefault()
          s.paste()
        } else if (mod && key === 'd') {
          e.preventDefault()
          if (selectedElements.length) {
            s.copy(selectedElements)
            s.paste()
          }
        } else if (!mod && !e.altKey && SHORTCUT_KINDS[key]) {
          e.preventDefault()
          canvasApi.addAtPointer?.(SHORTCUT_KINDS[key])
        } else if ((e.key === 'F2' || e.key === 'Enter') && selectedElements.length === 1) {
          e.preventDefault()
          s.setEditing(selectedElements[0])
        } else if (e.key === 'Escape') {
          s.select([])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleHelp])
}

/** Keeps a copy of unsaved work in local storage; paused while an older draft awaits a decision. */
function useDraftAutosave(paused: boolean) {
  useEffect(() => {
    if (paused) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useModel.subscribe((s, prev) => {
      if (s.model === prev.model && s.savedModel === prev.savedModel) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { model, savedModel, fileName } = useModel.getState()
        writeDraft(model === savedModel ? undefined : { model, fileName, savedAt: new Date().toISOString() })
      }, 1000)
    })
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const { model, savedModel } = useModel.getState()
      if (model !== savedModel) e.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      unsubscribe()
      clearTimeout(timer)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [paused])
}

/** Dropping a .json file anywhere opens it. */
function useFileDrop() {
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0]
      if (!file) return
      e.preventDefault()
      void openDroppedFile(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
}

function ImportDialog({ file, onClose }: { file: OpenedFile; onClose: () => void }) {
  const warnings = file.importWarnings ?? []
  return (
    <Modal title="Imported from Threat Dragon" onClose={onClose}>
      <p className="text-sm text-stone-700">
        The model was converted to ThreatMonster's format: {file.model.diagrams.length} diagram(s), {file.model.threats.length} threat(s). Save it to
        keep it as <b>{file.name}</b>; the original file is not changed.
      </p>
      {warnings.length > 0 && (
        <>
          <p className="mt-4 mb-1 text-sm font-medium text-stone-800">Conversion notes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700">
          OK
        </button>
      </div>
    </Modal>
  )
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [React.ReactNode, string][] = [
    [<><Kbd>A</Kbd> <Kbd>P</Kbd> <Kbd>S</Kbd> <Kbd>B</Kbd> <Kbd>N</Kbd></>, 'Add actor / process / data store / trust boundary / note at the mouse pointer'],
    ['Drag from an edge dot', 'Draw a data flow to another element'],
    [<>Double-click, <Kbd>F2</Kbd> or <Kbd>Enter</Kbd></>, 'Rename the selected element'],
    [<><Kbd>Del</Kbd> / <Kbd>Backspace</Kbd></>, 'Delete selection (with its threats)'],
    [<><Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> / <Kbd>V</Kbd> / <Kbd>D</Kbd></>, 'Copy / paste / duplicate'],
    [<><Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd>, <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Z</Kbd></>, 'Undo / redo'],
    [<><Kbd>Shift</Kbd>+drag</>, 'Box-select several elements'],
    [<><Kbd>Shift</Kbd>/<Kbd>Ctrl</Kbd>+click</>, 'Add to selection'],
    [<><Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>, <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>S</Kbd></>, 'Save / save as'],
    [<><Kbd>Ctrl</Kbd>+<Kbd>O</Kbd></>, 'Open a ThreatMonster or Threat Dragon file (or drop it on the window)'],
    [<Kbd>Esc</Kbd>, 'Clear selection'],
  ]
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([keys, what], i) => (
            <tr key={i} className="border-b border-stone-100 last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap text-stone-700">{keys}</td>
              <td className="py-2 text-stone-600">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-stone-500">
        Nesting follows geometry: drop an element inside a trust boundary to put it in that zone. Flows between different zones are highlighted
        in amber.
      </p>
    </Modal>
  )
}
