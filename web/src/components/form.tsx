import { useEffect, useRef, useState } from 'react'

const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-xs outline-none placeholder:text-stone-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200'

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-stone-600">{children}</span>
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label?: string
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return (
    <label className="block">
      {label && <Label>{label}</Label>}
      <input ref={ref} className={inputClass} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label?: string
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="block">
      {label && <Label>{label}</Label>}
      <textarea
        className={`${inputClass} resize-y`}
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className = '',
}: {
  label?: string
  value: T | undefined
  options: { id: T | ''; label: string }[]
  onChange: (v: T | undefined) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      {label && <Label>{label}</Label>}
      <select
        className={`${inputClass} disabled:bg-stone-100 disabled:text-stone-500`}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-0.5 text-sm text-stone-700" title={hint}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-violet-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T | undefined
  options: { id: T; label: string; title?: string; activeClass?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex flex-wrap rounded-md border border-stone-300 bg-stone-50 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`rounded px-2 ${size === 'sm' ? 'py-0.5 text-xs' : 'py-1 text-sm'} ${value === o.id ? (o.activeClass ?? 'bg-violet-600 text-white shadow-sm') : 'text-stone-600 hover:bg-stone-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-stone-200 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-stone-500 uppercase">{title}</h3>
        {aside}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

/** Comma separated list edited as text. */
export function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        className={inputClass}
        value={text}
        placeholder="Comma separated"
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  )
}
