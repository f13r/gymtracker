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
import { ChevronLeft, Eye, Link2, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

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
  // Superset grouping: shared id = same Superset, null = standalone. Members are kept contiguous
  // (GATE #1: v1 requires contiguity) — see normalizeGroups.
  supersetGroup: string | null
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
    supersetGroup: null,
  }
}

// Distinct accents per Superset, cycled by order of first appearance. Standalone rows stay neutral.
const SUPERSET_PALETTE = ['#818cf8', '#2dd4bf', '#fbbf24', '#f472b6', '#34d399', '#c084fc']

function makeGroupId(): string {
  return crypto.randomUUID()
}

// Enforce the contiguity invariant on a row list: a Superset is a *maximal contiguous run* of rows
// sharing an id, with ≥2 members. A lone row carrying an id (e.g. after a reorder splits a group)
// drops to standalone; if the same id resurfaces in a separate run, the later run is re-issued a
// fresh id so two visually-distinct groups never collide.
function normalizeGroups(rows: ExerciseRow[]): ExerciseRow[] {
  const next = rows.map(r => ({ ...r }))
  const seen = new Set<string>()
  let i = 0
  while (i < next.length) {
    const id = next[i].supersetGroup
    if (id == null) {
      i++
      continue
    }
    let j = i
    while (j + 1 < next.length && next[j + 1].supersetGroup === id) {
      j++
    }
    const runLength = j - i + 1
    if (runLength < 2) {
      next[i].supersetGroup = null
    } else {
      const finalId = seen.has(id) ? makeGroupId() : id
      seen.add(finalId)
      for (let k = i; k <= j; k++) {
        next[k].supersetGroup = finalId
      }
    }
    i = j + 1
  }
  return next
}

function rowsFromTemplate(template: WorkoutTemplateWithExercises): ExerciseRow[] {
  return normalizeGroups(
    [...template.exercises]
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
        supersetGroup: ex.supersetGroup ?? null,
      })),
  )
}

interface SortableExerciseRowProps {
  row: ExerciseRow
  idx: number
  displayName: string
  /** Bodyweight exercises (e.g. Pull-ups) track only sets/reps — no weight field. */
  isBodyweight: boolean
  canRemove: boolean
  /** Accent for this row's Superset, or null when standalone. */
  groupColor: string | null
  /** Letter label (A, B, …) shown alongside the Superset accent, or null when standalone. */
  groupLabel: string | null
  onUpdate: (key: number, patch: Partial<ExerciseRow>) => void
  onRemove: (key: number) => void
  onPickExercise: (key: number) => void
  onShowMedia: (key: number) => void
}

function SortableExerciseRow({
  row,
  idx,
  displayName,
  isBodyweight,
  canRemove,
  groupColor,
  groupLabel,
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(groupColor ? { borderLeftColor: groupColor, borderLeftWidth: 4 } : {}),
      }}
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
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-muted-foreground text-xs">Exercise {idx + 1}</p>
            {groupColor && (
              <span
                className="flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
                style={{ color: groupColor }}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: groupColor }} />
                Superset {groupLabel}
              </span>
            )}
          </div>
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

      {/* Sets / Reps / Weight — bodyweight exercises drop the KG field. */}
      <div className={`border-border/50 grid gap-3 border-t px-4 py-3 ${isBodyweight ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
        {!isBodyweight && (
          <NumericInput
            fieldKey={`weight-${row.key}`}
            label="KG"
            max={300}
            min={0}
            step={2.5}
            value={row.defaultWeightKg}
            onChange={v => onUpdate(row.key, { defaultWeightKg: v })}
          />
        )}
      </div>
    </div>
  )
}

interface SupersetConnectorProps {
  /** True when the rows above and below already share a Superset. */
  linked: boolean
  /** Accent of the shared Superset when linked. */
  color: string | null
  onLink: () => void
  onUnlink: () => void
}

// The grouping control between two adjacent rows. Linking joins the rows into one Superset; because
// it only ever acts on neighbours, Supersets stay contiguous by construction (GATE #1).
function SupersetConnector({ linked, color, onLink, onUnlink }: SupersetConnectorProps) {
  if (linked) {
    return (
      <div className="flex justify-center">
        <button
          aria-label="Break this superset"
          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
          style={{ color: color ?? undefined, backgroundColor: color ? `${color}1f` : undefined }}
          type="button"
          onClick={onUnlink}
        >
          <Unlink size={12} strokeWidth={2} />
          Superset
        </button>
      </div>
    )
  }
  return (
    <div className="flex justify-center">
      <button
        aria-label="Group with next exercise into a superset"
        className="text-muted-foreground/50 active:text-primary border-border flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs font-medium transition-colors"
        type="button"
        onClick={onLink}
      >
        <Link2 size={12} strokeWidth={2} />
        Superset
      </button>
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
  const exerciseMap = useMemo(() => new Map(allExercises.map((e: Exercise) => [e.id, e])), [allExercises])

  // Assign each Superset an accent + letter label by order of first appearance, so two distinct
  // groups in one Template are visually separable and stable across re-renders.
  const groupMeta = useMemo(() => {
    const meta = new Map<string, { color: string; label: string }>()
    for (const r of rows) {
      if (r.supersetGroup != null && !meta.has(r.supersetGroup)) {
        meta.set(r.supersetGroup, {
          color: SUPERSET_PALETTE[meta.size % SUPERSET_PALETTE.length],
          label: String.fromCharCode(65 + meta.size),
        })
      }
    }
    return meta
  }, [rows])

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
    // Removing a row can leave a lone Superset member — normalize drops it back to standalone.
    setRows(prev => normalizeGroups(prev.filter(r => r.key !== key)))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    setRows(prev => {
      const from = prev.findIndex(r => r.key === active.id)
      const to = prev.findIndex(r => r.key === over.id)
      // Reorder may split a contiguous group; normalize re-derives valid contiguous Supersets.
      return normalizeGroups(arrayMove(prev, from, to))
    })
  }

  // Join the rows at idx and idx+1 into one Superset, merging any groups they already belong to.
  function linkAt(idx: number) {
    setRows(prev => {
      const next = prev.map(r => ({ ...r }))
      const a = next[idx].supersetGroup
      const b = next[idx + 1].supersetGroup
      const target = a ?? b ?? makeGroupId()
      const merging = new Set([a, b].filter((x): x is string => x != null))
      for (const r of next) {
        if (merging.has(r.supersetGroup ?? '')) {
          r.supersetGroup = target
        }
      }
      next[idx].supersetGroup = target
      next[idx + 1].supersetGroup = target
      return normalizeGroups(next)
    })
  }

  // Split the shared Superset at the idx / idx+1 boundary; normalize drops any singletons left over.
  function unlinkAt(idx: number) {
    setRows(prev => {
      const next = prev.map(r => ({ ...r }))
      const group = next[idx].supersetGroup
      const newId = makeGroupId()
      for (let k = idx + 1; k < next.length && next[k].supersetGroup === group; k++) {
        next[k].supersetGroup = newId
      }
      return normalizeGroups(next)
    })
  }

  const canSave = name.trim().length > 0 && rows.some(r => r.exerciseId)

  const mediaRow = rows.find(r => r.key === mediaForKey)
  const mediaExercise = mediaRow ? exerciseMap.get(mediaRow.exerciseId) : undefined

  function handleSave() {
    // Drop empty rows first, then re-normalize: an unselected row between two members would otherwise
    // leave a stranded singleton once it's filtered out.
    const saved = normalizeGroups(rows.filter(r => r.exerciseId))
    onSave({
      name,
      exercises: saved.map((r, i) => {
        // Bodyweight exercises never carry a weight, even if one was stored before.
        const isBodyweight = exerciseMap.get(r.exerciseId)?.equipmentType === 'bodyweight'
        return {
          exerciseId: r.exerciseId,
          orderIndex: i,
          defaultSets: r.defaultSets,
          defaultReps: r.defaultReps,
          defaultWeightKg: isBodyweight ? undefined : r.defaultWeightKg || undefined,
          equipmentId: r.equipmentId ?? undefined,
          // null/standalone is sent as undefined; the service stores it as null (full-replace).
          supersetGroup: r.supersetGroup ?? undefined,
        }
      }),
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
        <button className="text-muted-foreground mb-3 -ml-1 flex items-center gap-1" type="button" onClick={onBack}>
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
            <div className="space-y-2">
              {rows.map((row, idx) => {
                const meta = row.supersetGroup ? groupMeta.get(row.supersetGroup) : undefined
                const linked =
                  idx < rows.length - 1 &&
                  row.supersetGroup != null &&
                  row.supersetGroup === rows[idx + 1].supersetGroup
                return (
                  <Fragment key={row.key}>
                    <SortableExerciseRow
                      canRemove={rows.length > 1}
                      displayName={exerciseMap.get(row.exerciseId)?.name ?? row.exerciseName}
                      groupColor={meta?.color ?? null}
                      groupLabel={meta?.label ?? null}
                      idx={idx}
                      isBodyweight={exerciseMap.get(row.exerciseId)?.equipmentType === 'bodyweight'}
                      row={row}
                      onPickExercise={setPickerForKey}
                      onRemove={removeRow}
                      onShowMedia={setMediaForKey}
                      onUpdate={updateRow}
                    />
                    {idx < rows.length - 1 && (
                      <SupersetConnector
                        color={linked ? (meta?.color ?? null) : null}
                        linked={linked}
                        onLink={() => linkAt(idx)}
                        onUnlink={() => unlinkAt(idx)}
                      />
                    )}
                  </Fragment>
                )
              })}
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
