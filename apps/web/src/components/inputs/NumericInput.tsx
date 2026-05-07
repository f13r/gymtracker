import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useLongPress } from './useLongPress';

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  bigStep?: number;
  unit?: string;
  fieldKey: string;
  label?: string;
}

function ButtonMode({ value, onChange, min, max, step, bigStep, unit }: NumericInputProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const decBig = useLongPress(() => onChange(clamp(value - (bigStep ?? step))));
  const dec = useLongPress(() => onChange(clamp(value - step)));
  const inc = useLongPress(() => onChange(clamp(value + step)));
  const incBig = useLongPress(() => onChange(clamp(value + (bigStep ?? step))));

  if (editing) return (
    <input
      ref={inputRef}
      type="number"
      defaultValue={value}
      autoFocus
      className="w-full text-center text-2xl font-bold border rounded-lg p-3"
      onBlur={(e) => { onChange(clamp(parseFloat(e.target.value) || value)); setEditing(false); }}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
    />
  );

  return (
    <div className="flex items-center gap-1">
      {bigStep && <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...decBig}>−{bigStep}</Button>}
      <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...dec}>−{step}</Button>
      <button
        onClick={() => setEditing(true)}
        className="flex-1 min-h-14 text-center font-bold text-xl px-3 rounded-lg bg-muted hover:bg-muted/80"
      >
        {value}{unit ? ` ${unit}` : ''}
      </button>
      <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...inc}>+{step}</Button>
      {bigStep && <Button variant="outline" className="min-w-14 min-h-14 text-lg" {...incBig}>+{bigStep}</Button>}
    </div>
  );
}

function WheelMode({ value, onChange, min, max, step, unit }: NumericInputProps) {
  const items: number[] = [];
  for (let v = min; v <= max; v = Math.round((v + step) * 100) / 100) {
    items.push(v);
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full text-center text-xl font-bold border rounded-lg p-3 bg-background"
    >
      {items.map((v) => (
        <option key={v} value={v}>{v}{unit ? ` ${unit}` : ''}</option>
      ))}
    </select>
  );
}

export function NumericInput(props: NumericInputProps) {
  const { inputModes, setInputMode } = usePreferencesStore();
  const mode = inputModes[props.fieldKey] ?? 'buttons';

  return (
    <div className="relative">
      {props.label && <label className="text-sm text-muted-foreground mb-1 block">{props.label}</label>}
      {mode === 'buttons' ? <ButtonMode {...props} /> : <WheelMode {...props} />}
      <button
        onClick={() => setInputMode(props.fieldKey, mode === 'buttons' ? 'wheel' : 'buttons')}
        className="absolute top-0 right-0 text-xs text-muted-foreground p-1"
        title="Toggle input mode"
      >
        {mode === 'buttons' ? '≡' : '⟳'}
      </button>
    </div>
  );
}
