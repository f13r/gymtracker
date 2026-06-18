import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { CreateTemplateDto, Exercise, WorkoutTemplateWithExercises } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { NumericInput } from '@/components/inputs/NumericInput'
import { Input } from '@/components/ui/input'
import { ExerciseMediaDrawer } from '@/components/workout/ExerciseMediaDrawer'
import { ExercisePicker } from '@/components/workout/ExercisePicker'

interface ExerciseRow {
  key: number
  exerciseId: string
  exerciseName: string
  defaultSets: number
  defaultReps: number
  defaultWeightKg: number
  // Carried through untouched so a coach-prescribed Equipment reference survives an edit save.
  equipmentId: string | null
}

let keyCounter = 0

function makeRow(): ExerciseRow {
  return {
    key: keyCounter++,
    exerciseId: '',
    exerciseName: '',
    defaultSets: 3,
    defaultReps: 10,
    defaultWeightKg: 0,
    equipmentId: null,
  }
}

function rowsFromTemplate(template: WorkoutTemplateWithExercises): ExerciseRow[] {
  return [...template.exercises]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(ex => ({
      key: keyCounter++,
      exerciseId: ex.exerciseId ?? '',
      // Display name is resolved at render from the exercise catalog, so leave it blank here.
      exerciseName: '',
      defaultSets: ex.defaultSets ?? 3,
      defaultReps: ex.defaultReps ?? 10,
      defaultWeightKg: ex.defaultWeightKg ?? 0,
      equipmentId: ex.equipmentId,
    }))
}

interface SortableExerciseRowProps {
  row: ExerciseRow
  idx: number
  displayName: string
  canRemove: boolean
  onUpdate: (key: number, patch: Partial<ExerciseRow>) => void
  onRemove: (key: number) => void
  onPickExercise: (key: number) => void
  onShowMedia: (key: number) => void
}

function SortableExerciseRow({
  row,
  idx,
  displayName,
  canRemove,
  onUpdate,
  onRemove,
  onPickExercise,
  onShowMedia,
}: SortableExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  })

  return (
    <div
      ref={setNodeRef}
      className={`bg-card border-border touch-manipulation overflow-hidden rounded-2xl border select-none ${
        isDragging ? 'border-primary/50 relative z-10 shadow-lg' : ''
      }`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      {/* Exercise header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex-1">
          {row.exerciseId ? (
            <p className="font-display font-600 text-base tracking-wide">{displayName}</p>
          ) : (
            <p className="text-muted-foreground text-sm">No exercise selected</p>
          )}
          <p className="text-muted-foreground mt-0.5 text-xs">Exercise {idx + 1}</p>
        </div>
        <div className="flex items-center gap-1">
          {row.exerciseId && (
            <button
              aria-label="Show exercise demonstration"
              className="text-muted-foreground/60 active:text-primary flex size-10 items-center justify-center transition-colors"
              type="button"
              onClick={() => onShowMedia(row.key)}
            >
              <Eye size={16} strokeWidth={1.5} />
            </button>
          )}
          <button
            aria-label={row.exerciseId ? 'Change exercise' : 'Select exercise'}
            className="text-muted-foreground/60 active:text-primary flex size-10 items-center justify-center transition-colors"
            type="button"
            onClick={() => onPickExercise(row.key)}
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
          {canRemove && (
            <button
              aria-label="Remove exercise"
              className="text-destructive/50 active:text-destructive flex size-10 items-center justify-center transition-colors"
              type="button"
              onClick={() => onRemove(row.key)}
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
          onChange={v => onUpdate(row.key, { defaultSets: v })}
        />
        <NumericInput
          fieldKey={`reps-${row.key}`}
          label="REPS"
          max={100}
          min={1}
          step={1}
          value={row.defaultReps}
          onChange={v => onUpdate(row.key, { defaultReps: v })}
        />
        <NumericInput
          fieldKey={`weight-${row.key}`}
          label="KG"
          max={300}
          min={0}
          step={2.5}
          value={row.defaultWeightKg}
          onChange={v => onUpdate(row.key, { defaultWeightKg: v })}
        />
      </div>
    </div>
  )
}

interface TemplateFormProps {
  mode: 'create' | 'edit'
  /** Pre-fill values when editing an existing Workout Template. */
  initialTemplate?: WorkoutTemplateWithExercises
  isSaving: boolean
  onSave: (dto: CreateTemplateDto) => void
  onBack: () => void
}

export function TemplateForm({ mode, initialTemplate, isSaving, onSave, onBack }: TemplateFormProps) {
  const [name, setName] = useState(initialTemplate?.name ?? '')
  const [rows, setRows] = useState<ExerciseRow[]>(() =>
    initialTemplate ? rowsFromTemplate(initialTemplate) : [makeRow()],
  )
  const [pickerForKey, setPickerForKey] = useState<number | null>(null)
  const [mediaForKey, setMediaForKey] = useState<number | null>(null)

  const { data: allExercises = [] } = useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: exercisesApi.getAll,
  })
  const exerciseMap = useMemo(
    () => new Map(allExercises.map((e: Exercise) => [e.id, e])),
    [allExercises],
  )

  // Whole card is draggable: touch needs a long-press (so swipes still scroll the list),
  // mouse needs 8px of movement (so clicks on the card don't lift it). Buttons/inputs
  // inside the card never start a drag — dnd-kit sensors skip interactive elements.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function updateRow(key: number, patch: Partial<ExerciseRow>) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: number) {
    setRows(prev => prev.filter(r => r.key !== key))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {return}
    setRows(prev => {
      const from = prev.findIndex(r => r.key === active.id)
      const to = prev.findIndex(r => r.key === over.id)
      return arrayMove(prev, from, to)
    })
  }

  const canSave = name.trim().length > 0 && rows.some(r => r.exerciseId)

  const mediaRow = rows.find(r => r.key === mediaForKey)
  const mediaExercise = mediaRow ? exerciseMap.get(mediaRow.exerciseId) : undefined

  function handleSave() {
    onSave({
      name,
      exercises: rows
        .filter(r => r.exerciseId)
        .map((r, i) => ({
          exerciseId: r.exerciseId,
          orderIndex: i,
          defaultSets: r.defaultSets,
          defaultReps: r.defaultReps,
          defaultWeightKg: r.defaultWeightKg || undefined,
          equipmentId: r.equipmentId ?? undefined,
        })),
    })
  }

  if (pickerForKey !== null) {
    return (
      <ExercisePicker
        selectedId={rows.find(r => r.key === pickerForKey)?.exerciseId || undefined}
        onClose={() => setPickerForKey(null)}
        onSelect={(id, exName) => {
          // Selecting a different exercise drops any inherited equipment reference.
          updateRow(pickerForKey, { exerciseId: id, exerciseName: exName, equipmentId: null })
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
          onClick={onBack}
        >
          <ChevronLeft size={18} />
          <span className="text-sm">Workouts</span>
        </button>
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          {mode === 'edit' ? 'Edit' : 'New'}
        </p>
        <h1 className="font-display font-700 text-3xl tracking-wide">WORKOUT TEMPLATE</h1>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Template name */}
        <Input
          autoFocus={mode === 'create'}
          className="bg-card border-border h-12 rounded-xl text-base"
          placeholder="Workout template name"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        {/* Exercise rows */}
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          sensors={sensors}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={rows.map(r => r.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {rows.map((row, idx) => (
                <SortableExerciseRow
                  key={row.key}
                  canRemove={rows.length > 1}
                  displayName={exerciseMap.get(row.exerciseId)?.name ?? row.exerciseName}
                  idx={idx}
                  row={row}
                  onPickExercise={setPickerForKey}
                  onRemove={removeRow}
                  onShowMedia={setMediaForKey}
                  onUpdate={updateRow}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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
          disabled={!canSave || isSaving}
          type="button"
          onClick={handleSave}
        >
          {isSaving ? 'Saving…' : mode === 'edit' ? 'SAVE CHANGES' : 'SAVE TEMPLATE'}
        </button>
      </div>

      <ExerciseMediaDrawer
        description={mediaExercise?.description ?? null}
        exerciseId={mediaExercise?.id}
        exerciseName={mediaExercise?.name ?? ''}
        hasImage={mediaExercise?.hasImage ?? false}
        open={mediaForKey !== null}
        onOpenChange={open => !open && setMediaForKey(null)}
      />
    </div>
  )
}
