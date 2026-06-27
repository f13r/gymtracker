import { Minus, Plus } from 'lucide-react'
import { useState, useRef } from 'react'

import { useLongPress } from './useLongPress'

interface NumericInputProps {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  bigStep?: number
  unit?: string
  fieldKey: string
  label?: string
  size?: 'md' | 'lg'
  highlighted?: boolean
  readOnly?: boolean
}

export function NumericInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  label,
  size = 'md',
  highlighted = false,
  readOnly = false,
}: NumericInputProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = (v: number) => Math.max(min, Math.min(max, parseFloat(v.toFixed(2))))

  const decPress = useLongPress(() => onChange(clamp(value - step)))
  const incPress = useLongPress(() => onChange(clamp(value + step)))

  const lg = size === 'lg'

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span
          className={`text-center text-[10px] font-semibold tracking-widest uppercase ${highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
        >
          {label}
          {unit ? ` (${unit})` : ''}
        </span>
      )}
      <div
        className={`bg-card border-border flex items-center overflow-hidden rounded-xl border ${lg ? 'h-16' : 'h-14'}`}
      >
        {!readOnly && (
          <button
            className={`text-muted-foreground active:bg-muted flex h-full flex-shrink-0 items-center justify-center transition-colors ${lg ? 'w-12' : 'w-9'}`}
            type="button"
            {...decPress}
          >
            <Minus size={lg ? 20 : 16} strokeWidth={2.5} />
          </button>
        )}

        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          {!readOnly && editing ? (
            <input
              ref={inputRef}
              className={`font-display font-700 h-full w-full bg-transparent text-center tracking-wide tabular-nums outline-none ${lg ? 'text-3xl' : 'text-xl'}`}
              defaultValue={value === 0 ? '' : value}
              type="number"
              autoFocus
              onBlur={e => {
                const parsed = parseFloat(e.target.value)
                onChange(clamp(Number.isNaN(parsed) ? value : parsed))
                setEditing(false)
              }}
              onFocus={e => e.target.select()}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.blur()}
            />
          ) : (
            <button
              className="flex h-full w-full items-center justify-center"
              disabled={readOnly}
              type="button"
              onClick={() => !readOnly && setEditing(true)}
            >
              <span className={`font-display font-700 tracking-wide tabular-nums ${lg ? 'text-3xl' : 'text-xl'}`}>
                {value % 1 === 0 ? value : value.toFixed(1)}
              </span>
            </button>
          )}
        </div>

        {!readOnly && (
          <button
            className={`text-muted-foreground active:bg-muted flex h-full flex-shrink-0 items-center justify-center transition-colors ${lg ? 'w-12' : 'w-9'}`}
            type="button"
            {...incPress}
          >
            <Plus size={lg ? 20 : 16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
}
