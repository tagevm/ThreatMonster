import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

let listeners: ((t: Toast) => void)[] = []
let nextId = 1

export function notify(message: string, kind: Toast['kind'] = 'info') {
  const toast = { id: nextId++, message, kind }
  listeners.forEach((l) => l(toast))
}

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (t: Toast) => {
      setToasts((ts) => [...ts, t])
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), t.kind === 'error' ? 8000 : 4000)
    }
    listeners.push(listener)
    return () => {
      listeners = listeners.filter((l) => l !== listener)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg ${t.kind === 'error' ? 'bg-red-700 text-white' : 'bg-stone-800 text-white'}`}
        >
          <span className="whitespace-pre-line">{t.message}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
