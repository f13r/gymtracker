import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronUp, ChevronDown, Plus, CheckCircle2, Square } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'

import type { Exercise, WorkoutSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { setsApi } from '@/api/sets'
import { workoutsApi } from '@/api/workouts'
import { NumericInput } from '@/components/inputs/NumericInput'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import { cn, formatElapsed } from '@/lib/utils'
import { useWorkoutStore } from '@/stores/workout.store'

interface WorkoutLoggerProps {
  sessionId: string
}

// ─── Inline editable set row ──────────────────────────────────────────────────

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDirtyRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressDidFireRef = useRef(false)

  if (!isDirtyRef.current && (set.weightKg !== prevSet.weightKg || set.reps !== prevSet.reps)) {
    setPrevSet(set)
    setWeight(set.weightKg ?? 0)
    setReps(set.reps ?? 8)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current) }
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current) }
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

  const handlePressStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) { return }
    longPressTimerRef.current = setTimeout(() => {
      longPressDidFireRef.current = true
      setShowDeleteConfirm(true)
      longPressTimerRef.current = null
    }, 500)
  }

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if (showDeleteConfirm) { return }
    if ((e.target as HTMLElement).closest('button')) { return }
    if (longPressDidFireRef.current) {
      longPressDidFireRef.current = false
      return
    }
    onToggleDone()
  }

  const isDone = set.done

  return (
    <div
      className={cn('border-border/40 border-b px-4 pt-4 pb-5 transition-colors', isDone && 'bg-primary')}
      style={{ touchAction: 'pan-y' }}
      onClick={handleRowClick}
      onPointerDown={handlePressStart}
      onPointerLeave={handlePressEnd}
      onPointerUp={handlePressEnd}
    >
      {showDeleteConfirm ? (
        <div className="flex h-16 items-center justify-between gap-3">
          <span className="text-sm font-semibold">Remove this set?</span>
          <div className="flex gap-2">
            <button
              className="border-border h-10 rounded-xl border px-4 text-sm font-semibold"
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false) }}
            >
              Cancel
            </button>
            <button
              className="bg-destructive text-destructive-foreground h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
              disabled={isDeletePending}
              onClick={(e) => { e.stopPropagation(); onDelete() }}
            >
              {isDeletePending ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  )
}

// ─── Pending (not-yet-logged) set row ─────────────────────────────────────────

function PendingSetRow({
  index,
  defaultWeight,
  defaultReps,
  onLog,
}: {
  index: number
  defaultWeight: number
  defaultReps: number
  onLog: (weightKg: number, reps: number) => void
}) {
  const [weight, setWeight] = useState(defaultWeight)
  const [reps, setReps] = useState(defaultReps)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressDidFireRef = useRef(false)

  const handlePressStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) { return }
    longPressTimerRef.current = setTimeout(() => {
      longPressDidFireRef.current = true
      longPressTimerRef.current = null
    }, 500)
  }

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) { return }
    if (longPressDidFireRef.current) {
      longPressDidFireRef.current = false
      return
    }
    onLog(weight, reps)
  }

  return (
    <div
      className="border-border/40 border-b px-4 pt-4 pb-5 transition-colors"
      style={{ touchAction: 'pan-y' }}
      onClick={handleRowClick}
      onPointerDown={handlePressStart}
      onPointerLeave={handlePressEnd}
      onPointerUp={handlePressEnd}
    >
      <div className="grid grid-cols-2 gap-3">
        <NumericInput
          bigStep={5}
          fieldKey={`pending-weight-${index}`}
          highlighted={false}
          label="WEIGHT"
          max={300}
          min={0}
          size="lg"
          step={2.5}
          value={weight}
          onChange={setWeight}
        />
        <NumericInput
          bigStep={5}
          fieldKey={`pending-reps-${index}`}
          highlighted={false}
          label="REPS"
          max={50}
          min={1}
          size="lg"
          step={1}
          value={reps}
          onChange={setReps}
        />
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
  const doneSets = currentSets.filter(s => s.done)
  const nowReps = doneSets.reduce((s, x) => s + (x.reps ?? 0), 0)
  const nowVol = doneSets.reduce((s, x) => s + (x.reps ?? 0) * (x.weightKg ?? 0), 0)

  const hasPrev = prevSets.length > 0
  const hasTemplate = defaultSets > 0 && defaultReps > 0

  const wasReps: number | null = hasPrev
    ? prevSets.reduce((s, x) => s + (x.reps ?? 0), 0)
    : hasTemplate ? defaultSets * defaultReps : null

  const wasVol: number | null = hasPrev
    ? prevSets.reduce((s, x) => s + (x.reps ?? 0) * (x.weightKg ?? 0), 0)
    : hasTemplate && defaultWeightKg > 0 ? defaultSets * defaultReps * defaultWeightKg : null

  const compLabel = hasPrev ? 'last time' : hasTemplate ? 'template' : null

  const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
  const fmtDelta = (v: number) => {
    const abs = Math.abs(v)
    return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toString()
  }

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

// ─── Adjacent exercise strip ───────────────────────────────────────────────────

function ExerciseStrip({
  direction,
  name,
  loggedCount,
  totalCount,
  onClick,
}: {
  direction: 'prev' | 'next'
  name: string
  loggedCount: number
  totalCount: number
  onClick: () => void
}) {
  const done = totalCount > 0 && loggedCount >= totalCount
  return (
    <button
      className="border-border/60 active:bg-muted/50 flex w-full items-center justify-between px-4 py-2.5 transition-colors"
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-2">
        {direction === 'prev' ? (
          <ChevronUp className="text-muted-foreground shrink-0" size={16} />
        ) : (
          <ChevronDown className="text-muted-foreground shrink-0" size={16} />
        )}
        <span className="text-muted-foreground truncate text-sm font-medium">{name}</span>
      </div>
      <span className={cn('ml-2 shrink-0 text-xs font-semibold', done ? 'text-accent' : 'text-muted-foreground')}>
        {loggedCount}/{totalCount}
        {done ? ' ✓' : ''}
      </span>
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function WorkoutLogger({ sessionId }: WorkoutLoggerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeExerciseIndex, nextExercise, prevExercise } = useWorkoutStore()
  const [newSetWeight, setNewSetWeight] = useState(0)
  const [newSetReps, setNewSetReps] = useState(8)
  const newSetInitialized = useRef(false)
  const [prevActiveExerciseIndex, setPrevActiveExerciseIndex] = useState(activeExerciseIndex)

  const [showPicker, setShowPicker] = useState(false)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null)

  const [allDoneOpen, setAllDoneOpen] = useState(false)

  const [workoutSeconds, setWorkoutSeconds] = useState(0)

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => workoutsApi.getSession(sessionId),
  })

  const { data: template } = useQuery({
    queryKey: ['template', session?.templateId],
    queryFn: () => workoutsApi.getTemplate(session!.templateId!),
    enabled: !!session?.templateId,
  })

  const { data: allExercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: exercisesApi.getAll,
  })

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    allExercises.forEach((e: Exercise) => { map[e.id] = e.name })
    return map
  }, [allExercises])

  const exercises = useMemo(() => {
    if (template) {
      return template.exercises
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(te => ({
          id: te.exerciseId!,
          name: exerciseNameMap[te.exerciseId!] ?? 'Exercise',
          defaultSets: te.defaultSets ?? 3,
          defaultReps: te.defaultReps ?? 8,
          defaultWeightKg: te.defaultWeightKg ?? 0,
          loggedSets: (session?.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === te.exerciseId),
        }))
    }
    if (!session?.sets) { return [] }
    const ids = [...new Set(session.sets.map((s: WorkoutSet) => s.exerciseId).filter(Boolean) as string[])]
    return ids.map(id => ({
      id,
      name: exerciseNameMap[id] ?? 'Exercise',
      defaultSets: 0,
      defaultReps: 8,
      defaultWeightKg: 0,
      loggedSets: session.sets.filter((s: WorkoutSet) => s.exerciseId === id),
    }))
  }, [template, session, exerciseNameMap])

  const currentExercise = exercises[activeExerciseIndex]
  const prevExerciseData = activeExerciseIndex > 0 ? exercises[activeExerciseIndex - 1] : null
  const nextExerciseData = activeExerciseIndex < exercises.length - 1 ? exercises[activeExerciseIndex + 1] : null
  const loggedCount = currentExercise?.loggedSets.length ?? 0
  const doneCount = currentExercise?.loggedSets.filter((s: WorkoutSet) => s.done).length ?? 0

  const { data: prevSets = [] } = useQuery({
    queryKey: ['exercise-last-sets', currentExercise?.id],
    queryFn: () => exercisesApi.getLastSets(currentExercise!.id),
    enabled: !!currentExercise?.id,
    staleTime: 60_000,
  })

  if (currentExercise && !newSetInitialized.current) {
    newSetInitialized.current = true
    const last = currentExercise.loggedSets.at(-1)
    setNewSetWeight(last?.weightKg ?? currentExercise.defaultWeightKg)
    setNewSetReps(last?.reps ?? currentExercise.defaultReps)
  }

  // Re-sync when navigating to a different exercise
  if (currentExercise && prevActiveExerciseIndex !== activeExerciseIndex) {
    setPrevActiveExerciseIndex(activeExerciseIndex)
    const last = currentExercise.loggedSets.at(-1)
    setNewSetWeight(last?.weightKg ?? currentExercise.defaultWeightKg ?? 0)
    setNewSetReps(last?.reps ?? currentExercise.defaultReps ?? 8)
  }

  const allDone =
    !!template &&
    !!currentExercise &&
    currentExercise.defaultSets > 0 &&
    currentExercise.loggedSets.length >= currentExercise.defaultSets &&
    currentExercise.loggedSets.every((s: WorkoutSet) => s.done)

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
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      if (done && template && currentExercise && currentExercise.defaultSets > 0) {
        const allLogged = currentExercise.loggedSets.length >= currentExercise.defaultSets
        const allOtherDone = currentExercise.loggedSets.every(s => s.id === setId || s.done)
        if (allLogged && allOtherDone) { setAllDoneOpen(true) }
      }
    },
  })

  const deleteSet = useMutation({
    mutationFn: (setId: string) => setsApi.deleteSet(sessionId, setId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    },
  })

  const freeLogSet = useMutation({
    mutationFn: () => {
      const id = selectedExerciseId ?? currentExercise?.id
      if (!id) { throw new Error('No exercise selected') }
      return setsApi.logSet(sessionId, {
        exerciseId: id,
        setNumber: (currentExercise?.loggedSets.length ?? 0) + 1,
        reps: newSetReps,
        weightKg: newSetWeight,
        done: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      if ('vibrate' in navigator) { navigator.vibrate(50) }
      setSelectedExerciseId(null)
      setSelectedExerciseName(null)
    },
  })

  const logSet = useMutation({
    mutationFn: ({ weightKg, reps }: { weightKg: number; reps: number }) => {
      if (!currentExercise) { throw new Error('No exercise') }
      return setsApi.logSet(sessionId, {
        exerciseId: currentExercise.id,
        setNumber: loggedCount + 1,
        reps,
        weightKg,
        done: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      if ('vibrate' in navigator) { navigator.vibrate(50) }
      if (template && currentExercise && currentExercise.defaultSets > 0) {
        const newLength = currentExercise.loggedSets.length + 1
        const allOtherDone = currentExercise.loggedSets.every((s: WorkoutSet) => s.done)
        if (newLength >= currentExercise.defaultSets && allOtherDone) { setAllDoneOpen(true) }
      }
    },
  })

  const updateSet = useMutation({
    mutationFn: ({ setId, data }: { setId: string; data: { weightKg: number; reps: number } }) =>
      setsApi.updateSet(sessionId, setId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    },
  })

  const finishWorkout = useMutation({
    mutationFn: () => workoutsApi.finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      navigate({ to: '/dashboard' })
    },
  })



  const isTemplateBased = !!template
  const isLogPending = isTemplateBased ? logSet.isPending : freeLogSet.isPending

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
            onClick={() => finishWorkout.mutate()}
          >
            <Square fill="currentColor" size={18} />
          </button>
        </div>
      </div>

      {/* Prev exercise strip */}
      {isTemplateBased && prevExerciseData && (
        <div className="border-border/60 shrink-0 border-b">
          <ExerciseStrip
            direction="prev"
            loggedCount={prevExerciseData.loggedSets.length}
            name={prevExerciseData.name}
            totalCount={prevExerciseData.defaultSets}
            onClick={prevExercise}
          />
        </div>
      )}

      {/* Exercise header */}
      {isTemplateBased && currentExercise ? (
        <div className="border-border shrink-0 border-b px-4 py-3">
          <p className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-widest uppercase">
            Exercise {activeExerciseIndex + 1} of {exercises.length}
            {' · '}
            {doneCount}/{loggedCount} sets
          </p>
          <p className="font-display font-700 text-3xl leading-tight tracking-wide">
            {currentExercise.name.toUpperCase()}
          </p>
        </div>
      ) : !isTemplateBased ? (
        <div className="border-border shrink-0 border-b px-4 py-3">
          <button className="group flex w-full items-center justify-between" onClick={() => setShowPicker(true)}>
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

      {/* Set rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isTemplateBased && currentExercise
          ? Array.from({ length: Math.max(currentExercise.defaultSets, currentExercise.loggedSets.length) }).map((_, i) => {
              const s = currentExercise.loggedSets[i] as WorkoutSet | undefined
              if (s) {
                return (
                  <InlineSetRow
                    key={s.id}
                    isDeletePending={deleteSet.isPending && deleteSet.variables === s.id}
                    set={s}
                    onDelete={() => deleteSet.mutate(s.id)}
                    onToggleDone={() => toggleDone.mutate({ setId: s.id, done: !s.done })}
                    onUpdate={(data) => updateSet.mutate({ setId: s.id, data })}
                  />
                )
              }
              return (
                <PendingSetRow
                  key={`pending-${i}`}
                  defaultReps={currentExercise.loggedSets.at(-1)?.reps ?? currentExercise.defaultReps}
                  defaultWeight={currentExercise.loggedSets.at(-1)?.weightKg ?? currentExercise.defaultWeightKg}
                  index={i}
                  onLog={(weightKg, reps) => logSet.mutate({ weightKg, reps })}
                />
              )
            })
          : currentExercise?.loggedSets.map((s: WorkoutSet) => (
              <InlineSetRow
                key={s.id}
                isDeletePending={deleteSet.isPending && deleteSet.variables === s.id}
                set={s}
                onDelete={() => deleteSet.mutate(s.id)}
                onToggleDone={() => toggleDone.mutate({ setId: s.id, done: !s.done })}
                onUpdate={(data) => updateSet.mutate({ setId: s.id, data })}
              />
            ))
        }

        {/* Free workout: empty state */}
        {!isTemplateBased && !currentExercise?.loggedSets.length && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <Plus className="text-muted-foreground" size={24} />
            </div>
            {!(selectedExerciseId ?? currentExercise?.id) ? (
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
        {(isTemplateBased ? !!currentExercise : !!(selectedExerciseId ?? currentExercise?.id)) && (
          <button
            className="text-muted-foreground active:bg-muted/50 flex w-full items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors disabled:opacity-40"
            disabled={isLogPending}
            onClick={() => isTemplateBased ? logSet.mutate({ weightKg: newSetWeight, reps: newSetReps }) : freeLogSet.mutate()}
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
              onClick={prevExercise}
            >
              <ChevronLeft size={16} />
              Prev
            </button>
            <button
              className="border-border text-muted-foreground active:bg-muted flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors"
              onClick={nextExercise}
            >
              Next
              <ChevronUp className="rotate-90" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Next exercise strip */}
      {isTemplateBased && nextExerciseData && allDone && (
        <div className="border-border/60 shrink-0 border-t">
          <ExerciseStrip
            direction="next"
            loggedCount={nextExerciseData.loggedSets.length}
            name={nextExerciseData.name}
            totalCount={nextExerciseData.defaultSets}
            onClick={nextExercise}
          />
        </div>
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
                onClick={() => {
                  setAllDoneOpen(false)
                  navigate({ to: '/dashboard' })
                }}
              >
                BACK TO OVERVIEW
              </button>
              <button
                className="text-muted-foreground h-11 w-full text-sm font-medium"
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
