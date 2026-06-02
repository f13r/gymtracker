import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { workoutsApi } from '@/api/workouts'
import { NumericInput } from '@/components/inputs/NumericInput'
import { Input } from '@/components/ui/input'
import { ExercisePicker } from '@/components/workout/ExercisePicker'

interface ExerciseRow {
  key: number
  exerciseId: string
  exerciseName: string
  defaultSets: number
  defaultReps: number
  defaultWeightKg: number
}

let keyCounter = 0

function makeRow(exerciseId = '', exerciseName = ''): ExerciseRow {
  return {
    key: keyCounter++,
    exerciseId,
    exerciseName,
    defaultSets: 3,
    defaultReps: 10,
    defaultWeightKg: 0,
  }
}

export function NewTemplatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [rows, setRows] = useState<ExerciseRow[]>([makeRow()])
  const [pickerForKey, setPickerForKey] = useState<number | null>(null)

  const save = useMutation({
    mutationFn: () =>
      workoutsApi.createTemplate({
        name,
        exercises: rows
          .filter(r => r.exerciseId)
          .map((r, i) => ({
            exerciseId: r.exerciseId,
            orderIndex: i,
            defaultSets: r.defaultSets,
            defaultReps: r.defaultReps,
            defaultWeightKg: r.defaultWeightKg || undefined,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      navigate({ to: '/workout/start' })
    },
  })

  function updateRow(key: number, patch: Partial<ExerciseRow>) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: number) {
    setRows(prev => prev.filter(r => r.key !== key))
  }

  const canSave = name.trim().length > 0 && rows.some(r => r.exerciseId)

  if (pickerForKey !== null) {
    return (
      <ExercisePicker
        onClose={() => setPickerForKey(null)}
        onSelect={(id, exName) => {
          updateRow(pickerForKey, { exerciseId: id, exerciseName: exName })
          setPickerForKey(null)
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <button
          className="text-muted-foreground mb-3 -ml-1 flex items-center gap-1"
          type="button"
          onClick={() => navigate({ to: '/workout/start' })}
        >
          <ChevronLeft size={18} />
          <span className="text-sm">Workouts</span>
        </button>
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">New</p>
        <h1 className="font-display font-700 text-3xl tracking-wide">TEMPLATE</h1>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Template name */}
        <Input
          className="bg-card border-border h-12 rounded-xl text-base"
          placeholder="Template name"
          value={name}
          autoFocus
          onChange={e => setName(e.target.value)}
        />

        {/* Exercise rows */}
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.key} className="bg-card border-border overflow-hidden rounded-2xl border">
              {/* Exercise header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <button className="flex-1 text-left" type="button" onClick={() => setPickerForKey(row.key)}>
                  {row.exerciseId ? (
                    <p className="font-display font-600 text-base tracking-wide">{row.exerciseName}</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">Tap to select exercise…</p>
                  )}
                  <p className="text-muted-foreground mt-0.5 text-xs">Exercise {idx + 1}</p>
                </button>
                <div className="flex items-center gap-1">
                  {rows.length > 1 && (
                    <button
                      aria-label="Remove exercise"
                      className="text-destructive/50 active:text-destructive flex size-10 items-center justify-center transition-colors"
                      type="button"
                      onClick={() => removeRow(row.key)}
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>

              {/* Sets / Reps / Weight */}
              <div className="border-border/50 grid grid-cols-3 gap-3 border-t px-4 py-3">
                <NumericInput
                  fieldKey={`sets-${row.key}`}
                  label="SETS"
                  max={20}
                  min={1}
                  step={1}
                  value={row.defaultSets}
                  onChange={v => updateRow(row.key, { defaultSets: v })}
                />
                <NumericInput
                  fieldKey={`reps-${row.key}`}
                  label="REPS"
                  max={100}
                  min={1}
                  step={1}
                  value={row.defaultReps}
                  onChange={v => updateRow(row.key, { defaultReps: v })}
                />
                <NumericInput
                  fieldKey={`weight-${row.key}`}
                  label="KG"
                  max={300}
                  min={0}
                  step={2.5}
                  value={row.defaultWeightKg}
                  onChange={v => updateRow(row.key, { defaultWeightKg: v })}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Add exercise */}
        <button
          className="border-border text-muted-foreground active:bg-card flex w-full items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-medium transition-colors"
          type="button"
          onClick={() => setRows(prev => [...prev, makeRow()])}
        >
          <Plus size={16} strokeWidth={2} />
          Add Exercise
        </button>
      </div>

      {/* Save — sticky at bottom */}
      <div className="border-border bg-background border-t p-4">
        <button
          className="bg-primary text-primary-foreground font-display font-700 flex w-full items-center justify-center rounded-xl py-4 text-lg tracking-widest transition-transform active:scale-[0.98] disabled:opacity-50"
          disabled={!canSave || save.isPending}
          type="button"
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'SAVE TEMPLATE'}
        </button>
      </div>
    </div>
  )
}
