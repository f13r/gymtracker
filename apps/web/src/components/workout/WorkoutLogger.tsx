import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronUp, Plus, CheckCircle2, Square, ImageIcon, Trash2 } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'

import type { Exercise, WorkoutSet } from '@gymtracker/shared'
import { calculateVolume, getDoneSets } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { queryKeys } from '@/api/queryKeys'
import { setsApi } from '@/api/sets'
import { workoutsApi } from '@/api/workouts'
import { NumericInput } from '@/components/inputs/NumericInput'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { ExerciseMediaDrawer } from '@/components/workout/ExerciseMediaDrawer'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import { usePrepopulatedSet } from '@/components/workout/usePrepopulatedSet'
import { useSwipeReveal } from '@/components/workout/useSwipeReveal'
import { cn, formatElapsed } from '@/lib/utils'
import { useWorkoutStore } from '@/stores/workout.store'

interface WorkoutLoggerProps {
  sessionId: string
}

// px of the swipe affordance revealed when a row is snapped open
const SWIPE_OPEN = 96

// Volume/delta number formatters — pure, hoisted so they aren't rebuilt per render.
const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
const fmtDelta = (v: number) => {
  const abs = Math.abs(v)
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toString()
}

// ─── Inline editable set row ──────────────────────────────────────────────────
//
// Every visible row is now backed by a real Set (the Session Snapshot
// materialises Planned Sets at Start — see ADR-0008). Tapping toggles done;
// swiping left soft-removes the Set.

function InlineSetRow({
  set,
  onUpdate,
  onToggleDone,
  onDelete,
  isDeletePending,
}: {
  set: WorkoutSet
  onUpdate: (data: { weightKg: number; reps: number }) => void
  onToggleDone: () => void
  onDelete: () => void
  isDeletePending: boolean
}) {
  const [weight, setWeight] = useState(set.weightKg ?? 0)
  const [reps, setReps] = useState(set.reps ?? 8)
  const [prevSet, setPrevSet] = useState(set)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDirtyRef = useRef(false)
  const { dragX, dragging, revealed, close, consumeDrag, swipeHandlers } = useSwipeReveal(SWIPE_OPEN)

  // eslint-disable-next-line react-hooks/refs
  if (!isDirtyRef.current && (set.weightKg !== prevSet.weightKg || set.reps !== prevSet.reps)) {
    setPrevSet(set)
    setWeight(set.weightKg ?? 0)
    setReps(set.reps ?? 8)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current) }
    }
  }, [])

  const scheduleUpdate = (w: number, r: number) => {
    isDirtyRef.current = true
    if (debounceRef.current) { clearTimeout(debounceRef.current) }
    debounceRef.current = setTimeout(() => {
      onUpdate({ weightKg: w, reps: r })
      isDirtyRef.current = false
    }, 600)
  }

  const handleWeightChange = (v: number) => {
    setWeight(v)
    scheduleUpdate(v, reps)
  }

  const handleRepsChange = (v: number) => {
    setReps(v)
    scheduleUpdate(weight, v)
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) { return }
    if (consumeDrag()) { return }
    if (revealed) { close(); return }
    onToggleDone()
  }

  const isDone = set.done

  return (
    <div className="border-border/40 relative overflow-hidden border-b">
      {/* Remove affordance revealed by swiping left (soft-removes the Set) */}
      <div className="bg-destructive text-destructive-foreground absolute inset-y-0 right-0 flex items-center">
        <button
          className="flex h-full items-center justify-center gap-1.5 text-sm font-semibold disabled:opacity-50"
          disabled={isDeletePending}
          style={{ width: SWIPE_OPEN }}
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          {isDeletePending ? '…' : <><Trash2 size={18} />Remove</>}
        </button>
      </div>

      {/* Swipeable foreground */}
      <div
        className={cn(
          'px-4 pt-4 pb-5',
          isDone ? 'bg-primary' : 'bg-background',
          !dragging && 'transition-transform',
        )}
        style={{ touchAction: 'pan-y', transform: `translateX(${dragX}px)` }}
        onClick={handleRowClick}
        {...swipeHandlers}
      >
        <div className="grid grid-cols-2 gap-3">
          <NumericInput
            bigStep={5}
            fieldKey={`weight-${set.id}`}
            highlighted={isDone}
            label="WEIGHT"
            max={300}
            min={0}
            readOnly={isDone}
            size="lg"
            step={2.5}
            value={weight}
            onChange={handleWeightChange}
          />
          <NumericInput
            bigStep={5}
            fieldKey={`reps-${set.id}`}
            highlighted={isDone}
            label="REPS"
            max={50}
            min={1}
            readOnly={isDone}
            size="lg"
            step={1}
            value={reps}
            onChange={handleRepsChange}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Exercise progress summary ────────────────────────────────────────────────

function ExerciseSummaryBar({
  currentSets,
  prevSets,
  defaultReps,
  defaultWeightKg,
  defaultSets,
}: {
  currentSets: WorkoutSet[]
  prevSets: WorkoutSet[]
  defaultReps: number
  defaultWeightKg: number
  defaultSets: number
}) {
  const doneSets = getDoneSets(currentSets)
  const nowReps = doneSets.reduce((s, x) => s + (x.reps ?? 0), 0)
  const nowVol = calculateVolume(doneSets)

  const hasPrev = prevSets.length > 0
  const hasTemplate = defaultSets > 0 && defaultReps > 0

  const wasReps: number | null = hasPrev
    ? prevSets.reduce((s, x) => s + (x.reps ?? 0), 0)
    : hasTemplate ? defaultSets * defaultReps : null

  const wasVol: number | null = hasPrev
    ? calculateVolume(getDoneSets(prevSets))
    : hasTemplate && defaultWeightKg > 0 ? defaultSets * defaultReps * defaultWeightKg : null

  const compLabel = hasPrev ? 'last time' : hasTemplate ? 'template' : null

  const deltaReps = wasReps !== null ? nowReps - wasReps : null
  const deltaVol = wasVol !== null ? nowVol - wasVol : null

  return (
    <div className="border-border/30 border-t px-4 pt-3 pb-4">
      {compLabel && (
        <p className="mb-2.5 text-[9px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
          vs {compLabel}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {/* Volume card */}
        <div className="bg-muted/30 rounded-xl px-3 py-2.5">
          <p className="mb-1 text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">VOLUME</p>
          <p className="font-display font-700 text-[26px] leading-none tabular-nums">
            {nowVol > 0 ? (
              <>{fmtVol(nowVol)}<span className="ml-0.5 font-sans text-[11px] font-normal text-muted-foreground">kg</span></>
            ) : '—'}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              was {wasVol !== null ? `${fmtVol(wasVol)}kg` : '—'}
            </span>
            {deltaVol !== null && deltaVol !== 0 && (
              <span className={cn('text-[10px] font-bold tabular-nums', deltaVol > 0 ? 'text-accent' : 'text-destructive')}>
                {deltaVol > 0 ? '+' : '−'}{fmtDelta(deltaVol)}
              </span>
            )}
          </div>
        </div>

        {/* Reps card */}
        <div className="bg-muted/30 rounded-xl px-3 py-2.5">
          <p className="mb-1 text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">REPS</p>
          <p className="font-display font-700 text-[26px] leading-none tabular-nums">
            {nowReps > 0 ? nowReps : '—'}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">was {wasReps ?? '—'}</span>
            {deltaReps !== null && deltaReps !== 0 && (
              <span className={cn('text-[10px] font-bold tabular-nums', deltaReps > 0 ? 'text-accent' : 'text-destructive')}>
                {deltaReps > 0 ? '+' : '−'}{fmtDelta(deltaReps)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function WorkoutLogger({ sessionId }: WorkoutLoggerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeExerciseIndex, nextExercise, prevExercise } = useWorkoutStore()

  const [showPicker, setShowPicker] = useState(false)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null)

  const [allDoneOpen, setAllDoneOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)

  const [workoutSeconds, setWorkoutSeconds] = useState(0)

  const { data: session } = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => workoutsApi.getSession(sessionId),
  })

  // The Template is still fetched only for its per-Exercise defaults (used by the
  // "vs template" summary fallback). Structure now comes from the Session Snapshot.
  const { data: template } = useQuery({
    queryKey: queryKeys.template(session?.templateId),
    queryFn: () => workoutsApi.getTemplate(session!.templateId!),
    enabled: !!session?.templateId,
  })

  const { data: allExercises = [] } = useQuery({
    queryKey: queryKeys.exercises(),
    queryFn: exercisesApi.getAll,
  })

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    allExercises.forEach((e: Exercise) => { map[e.id] = e.name })
    return map
  }, [allExercises])

  const wgerIdMap = useMemo(() => {
    const map: Record<string, number | null> = {}
    allExercises.forEach((e: Exercise) => { map[e.id] = e.wgerId })
    return map
  }, [allExercises])

  const templateDefaults = useMemo(() => {
    const map: Record<string, { defaultSets: number; defaultReps: number; defaultWeightKg: number }> = {}
    template?.exercises.forEach(te => {
      if (te.exerciseId) {
        map[te.exerciseId] = {
          defaultSets: te.defaultSets ?? 0,
          defaultReps: te.defaultReps ?? 8,
          defaultWeightKg: te.defaultWeightKg ?? 0,
        }
      }
    })
    return map
  }, [template])

  // Exercise list = the Session Snapshot (session.exercises), ordered. Freeform
  // sessions have no snapshot, so derive the list from their Sets. Removed Sets
  // (removedAt != null) are hidden from the logger.
  const exercises = useMemo(() => {
    const liveSets = (exId: string) =>
      (session?.sets ?? [])
        .filter((s: WorkoutSet) => s.exerciseId === exId && s.removedAt == null)
        .sort((a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id))

    const snapshot = session?.exercises ?? []
    if (snapshot.length > 0) {
      return snapshot
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(se => ({
          id: se.exerciseId,
          name: exerciseNameMap[se.exerciseId] ?? 'Exercise',
          defaultSets: templateDefaults[se.exerciseId]?.defaultSets ?? 0,
          defaultReps: templateDefaults[se.exerciseId]?.defaultReps ?? 8,
          defaultWeightKg: templateDefaults[se.exerciseId]?.defaultWeightKg ?? 0,
          loggedSets: liveSets(se.exerciseId),
        }))
    }
    if (!session?.sets) { return [] }
    const ids = [...new Set(session.sets.filter((s: WorkoutSet) => s.removedAt == null).map((s: WorkoutSet) => s.exerciseId))]
    return ids.map(id => ({
      id,
      name: exerciseNameMap[id] ?? 'Exercise',
      defaultSets: 0,
      defaultReps: 8,
      defaultWeightKg: 0,
      loggedSets: liveSets(id),
    }))
  }, [session, templateDefaults, exerciseNameMap])

  const currentExercise = exercises[activeExerciseIndex]
  const nextExerciseData = activeExerciseIndex < exercises.length - 1 ? exercises[activeExerciseIndex + 1] : null
  const loggedCount = currentExercise?.loggedSets.length ?? 0
  const doneCount = currentExercise?.loggedSets.filter((s: WorkoutSet) => s.done).length ?? 0

  // Last finished Session's Sets for this Exercise — drives the "vs last time" summary.
  const { prevSets } = usePrepopulatedSet(currentExercise)

  useEffect(() => {
    const startedAt = session?.startedAt
    if (!startedAt) { return }
    const id = setInterval(() => {
      setWorkoutSeconds(Math.floor(Date.now() / 1000) - startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [session?.startedAt])

  const toggleDone = useMutation({
    mutationFn: ({ setId, done }: { setId: string; done: boolean }) =>
      setsApi.updateSet(sessionId, setId, { done }),
    onSuccess: (_, { setId, done }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
      if (done && isTemplateBased && currentExercise) {
        const allDone =
          currentExercise.loggedSets.length > 0 &&
          currentExercise.loggedSets.every(s => s.id === setId || s.done)
        if (allDone) { setAllDoneOpen(true) }
      }
    },
  })

  const deleteSet = useMutation({
    mutationFn: (setId: string) => setsApi.deleteSet(sessionId, setId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
    },
  })

  // Add a Set to the current Exercise, carrying the last Set's numbers forward.
  const addSet = useMutation({
    mutationFn: () => {
      const exId = currentExercise?.id ?? selectedExerciseId
      if (!exId) { throw new Error('No exercise selected') }
      const last = currentExercise?.loggedSets.at(-1)
      return setsApi.logSet(sessionId, {
        exerciseId: exId,
        setNumber: (currentExercise?.loggedSets.length ?? 0) + 1,
        reps: last?.reps ?? 8,
        weightKg: last?.weightKg ?? 0,
        done: false,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
      if ('vibrate' in navigator) { navigator.vibrate(50) }
      setSelectedExerciseId(null)
      setSelectedExerciseName(null)
    },
  })

  const updateSet = useMutation({
    mutationFn: ({ setId, data }: { setId: string; data: { weightKg: number; reps: number } }) =>
      setsApi.updateSet(sessionId, setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
    },
  })

  const finishWorkout = useMutation({
    mutationFn: () => workoutsApi.finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() })
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      navigate({ to: '/dashboard' })
    },
  })

  const isTemplateBased = !!session?.templateId
  const canAddSet = isTemplateBased ? !!currentExercise : !!(selectedExerciseId ?? currentExercise?.id)

  if (showPicker) {
    return (
      <ExercisePicker
        onClose={() => setShowPicker(false)}
        onSelect={(id, name) => {
          setSelectedExerciseId(id)
          setSelectedExerciseName(name)
          setShowPicker(false)
        }}
      />
    )
  }

  return (
    <div className="bg-background flex h-svh flex-col select-none">
      {/* Top bar */}
      <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <button
          className="text-muted-foreground flex min-w-[60px] items-center gap-1"
          type="button"
          onClick={() => navigate({ to: '/dashboard' })}
        >
          <ChevronLeft size={20} />
          <span className="text-sm">Back</span>
        </button>
        <span className="max-w-[160px] truncate text-sm font-semibold">{session?.name ?? 'Workout'}</span>
        <div className="flex min-w-[60px] items-center justify-end gap-3">
          <span className="text-muted-foreground font-mono text-sm tabular-nums">{formatElapsed(workoutSeconds)}</span>
          <button
            className="text-destructive"
            disabled={finishWorkout.isPending}
            title="Finish workout"
            type="button"
            onClick={() => finishWorkout.mutate()}
          >
            <Square fill="currentColor" size={18} />
          </button>
        </div>
      </div>

      {/* Exercise header */}
      {isTemplateBased && currentExercise ? (
        <div className="border-border shrink-0 border-b px-4 py-3">
          <p className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-widest uppercase">
            Exercise {activeExerciseIndex + 1} of {exercises.length}
            {' · '}
            {doneCount}/{loggedCount} sets
          </p>
          <div className="flex items-start justify-between gap-2">
            <p className="font-display font-700 text-3xl leading-tight tracking-wide">
              {currentExercise.name.toUpperCase()}
            </p>
            <button
              aria-label="Show exercise demonstration"
              className="text-muted-foreground mt-1 shrink-0 active:opacity-60"
              type="button"
              onClick={() => setMediaOpen(true)}
            >
              <ImageIcon size={20} />
            </button>
          </div>
        </div>
      ) : !isTemplateBased ? (
        <div className="border-border shrink-0 border-b px-4 py-3">
          <button className="group flex w-full items-center justify-between" type="button" onClick={() => setShowPicker(true)}>
            <div>
              <p className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-widest uppercase">
                {exercises.length > 0 ? `Exercise ${activeExerciseIndex + 1} of ${exercises.length}` : 'Exercise'}
              </p>
              <p className="font-display font-700 text-3xl leading-tight tracking-wide">
                {(selectedExerciseName ?? currentExercise?.name ?? 'Select Exercise').toUpperCase()}
              </p>
            </div>
            <div className="text-primary flex items-center gap-1.5">
              <Plus size={18} strokeWidth={2.5} />
              <span className="text-xs font-semibold tracking-wide uppercase">Add</span>
            </div>
          </button>
        </div>
      ) : null}

      {/* Set rows — every row is a real (Planned or Done) Set from the snapshot */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {currentExercise?.loggedSets.map((s: WorkoutSet) => (
          <InlineSetRow
            key={s.id}
            isDeletePending={deleteSet.isPending && deleteSet.variables === s.id}
            set={s}
            onDelete={() => deleteSet.mutate(s.id)}
            onToggleDone={() => toggleDone.mutate({ setId: s.id, done: !s.done })}
            onUpdate={(data) => updateSet.mutate({ setId: s.id, data })}
          />
        ))}

        {/* Empty state (freeform with no exercise, or an exercise with all sets removed) */}
        {!currentExercise?.loggedSets.length && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <Plus className="text-muted-foreground" size={24} />
            </div>
            {!isTemplateBased && !(selectedExerciseId ?? currentExercise?.id) ? (
              <div className="text-center">
                <p className="font-semibold">No exercise selected</p>
                <p className="text-muted-foreground mt-1 text-sm">Tap "Add" to select one</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Log your first set</p>
            )}
          </div>
        )}

        {/* Add set link */}
        {canAddSet && (
          <button
            className="text-muted-foreground active:bg-muted/50 flex w-full items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors disabled:opacity-40"
            disabled={addSet.isPending}
            type="button"
            onClick={() => addSet.mutate()}
          >
            <Plus size={15} strokeWidth={2} />
            Add set
          </button>
        )}
      </div>

      {/* Exercise summary — always visible */}
      {currentExercise && (
        <div className="shrink-0">
          <ExerciseSummaryBar
            currentSets={currentExercise.loggedSets}
            defaultReps={currentExercise.defaultReps}
            defaultSets={currentExercise.defaultSets}
            defaultWeightKg={currentExercise.defaultWeightKg}
            prevSets={prevSets}
          />
        </div>
      )}

      {/* Free workout: prev/next nav */}
      {!isTemplateBased && (
        <div className="border-border shrink-0 border-t">
          <div className="grid grid-cols-2 gap-2 px-4 py-3">
            <button
              className="border-border text-muted-foreground active:bg-muted flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors disabled:opacity-40"
              disabled={activeExerciseIndex === 0}
              type="button"
              onClick={prevExercise}
            >
              <ChevronLeft size={16} />
              Prev
            </button>
            <button
              className="border-border text-muted-foreground active:bg-muted flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors"
              type="button"
              onClick={nextExercise}
            >
              Next
              <ChevronUp className="rotate-90" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Exercise media drawer */}
      {isTemplateBased && currentExercise && (
        <ExerciseMediaDrawer
          exerciseName={currentExercise.name}
          open={mediaOpen}
          wgerId={wgerIdMap[currentExercise.id] ?? null}
          onOpenChange={setMediaOpen}
        />
      )}

      {/* All-done bottom sheet */}
      {isTemplateBased && (
        <Drawer open={allDoneOpen} onOpenChange={setAllDoneOpen}>
          <DrawerContent>
            <DrawerHeader className="pb-2 text-center">
              <div className="mb-3 flex justify-center">
                <CheckCircle2 className="text-accent" size={40} />
              </div>
              <DrawerTitle className="text-xl">{currentExercise?.name} done!</DrawerTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {nextExerciseData
                  ? 'Head back to the overview to pick your next exercise'
                  : 'That was the last exercise.'}
              </p>
            </DrawerHeader>
            <DrawerFooter>
              <button
                className="bg-primary text-primary-foreground font-display font-700 h-14 w-full rounded-xl text-lg tracking-widest transition-transform active:scale-[0.97]"
                type="button"
                onClick={() => {
                  setAllDoneOpen(false)
                  navigate({ to: '/dashboard' })
                }}
              >
                BACK TO OVERVIEW
              </button>
              <button
                className="text-muted-foreground h-11 w-full text-sm font-medium"
                type="button"
                onClick={() => setAllDoneOpen(false)}
              >
                Keep going here
              </button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}
