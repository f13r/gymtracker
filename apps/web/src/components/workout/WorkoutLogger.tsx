import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronUp, ChevronDown, Plus, Minus, CheckCircle2, Square, X } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'

import type { Exercise, WorkoutSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { setsApi } from '@/api/sets'
import { workoutsApi } from '@/api/workouts'
import { NumericInput } from '@/components/inputs/NumericInput'
import { useLongPress } from '@/components/inputs/useLongPress'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useWorkoutStore } from '@/stores/workout.store'

interface WorkoutLoggerProps {
  sessionId: string
}

// ─── Input panel (weight + reps + log/update/delete) ──────────────────────

function InputPanel({
  weight,
  reps,
  onWeightChange,
  onRepsChange,
  editingSet,
  nextSetLabel,
  onLog,
  onUpdate,
  onDelete,
  isPending,
}: {
  weight: number
  reps: number
  onWeightChange: (v: number) => void
  onRepsChange: (v: number) => void
  editingSet: WorkoutSet | null
  nextSetLabel: string
  onLog: () => void
  onUpdate: () => void
  onDelete: () => void
  isPending: boolean
}) {
  return (
    <div className="shrink-0 border-b border-border px-4 pt-3 pb-4">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <NumericInput
          fieldKey="weight"
          label="WEIGHT"
          unit="kg"
          value={weight}
          min={0}
          max={300}
          step={2.5}
          bigStep={5}
          onChange={onWeightChange}
        />
        <NumericInput
          fieldKey="reps"
          label="REPS"
          value={reps}
          min={1}
          max={50}
          step={1}
          bigStep={5}
          onChange={onRepsChange}
        />
      </div>

      <p className="text-muted-foreground mb-2 text-center text-xs font-semibold tracking-widest uppercase">
        {editingSet ? `Editing set ${editingSet.setNumber}` : nextSetLabel}
      </p>

      {editingSet ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="font-display font-700 h-14 rounded-xl bg-primary text-primary-foreground text-lg tracking-widest active:scale-[0.97] transition-transform disabled:opacity-40"
            disabled={isPending}
            onClick={onUpdate}
          >
            {isPending ? '…' : 'UPDATE'}
          </button>
          <button
            className="font-display font-700 h-14 rounded-xl bg-destructive text-destructive-foreground text-lg tracking-widest active:scale-[0.97] transition-transform disabled:opacity-40"
            disabled={isPending}
            onClick={onDelete}
          >
            {isPending ? '…' : 'DELETE'}
          </button>
        </div>
      ) : (
        <button
          className="font-display font-700 h-14 w-full rounded-xl bg-primary text-primary-foreground text-2xl tracking-widest shadow-lg shadow-primary/30 active:scale-[0.97] transition-transform disabled:opacity-40"
          disabled={isPending}
          onClick={onLog}
        >
          {isPending ? '…' : 'LOG SET'}
        </button>
      )}
    </div>
  )
}

// ─── Swipeable set row (tap to edit, swipe left to delete) ────────────────

function SwipeableSetRow({
  set,
  isSelected,
  onTap,
  onDelete,
  isDeletePending,
}: {
  set: WorkoutSet
  isSelected: boolean
  onTap: () => void
  onDelete: () => void
  isDeletePending: boolean
}) {
  const [offsetX, setOffsetX] = useState(0)
  const startX = useRef(0)
  const isDragging = useRef(false)
  const hasMoved = useRef(false)
  const DELETE_WIDTH = 80

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX
    isDragging.current = true
    hasMoved.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - startX.current
    if (Math.abs(dx) > 5) hasMoved.current = true
    if (dx < 0) setOffsetX(Math.max(dx, -DELETE_WIDTH))
    else setOffsetX(Math.min(0, offsetX + dx))
  }

  const handlePointerUp = () => {
    isDragging.current = false
    const wasOpen = offsetX < -DELETE_WIDTH / 2
    if (wasOpen) {
      setOffsetX(-DELETE_WIDTH)
    } else {
      setOffsetX(0)
      if (!hasMoved.current) onTap()
    }
  }

  return (
    <div className="relative h-14 overflow-hidden border-b border-border/40">
      {/* Delete zone revealed behind sliding content */}
      <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-destructive">
        <button
          className="text-destructive-foreground text-sm font-semibold disabled:opacity-40 w-full h-full"
          disabled={isDeletePending}
          onClick={onDelete}
        >
          {isDeletePending ? '…' : 'DELETE'}
        </button>
      </div>

      {/* Sliding row content */}
      <div
        className={cn(
          'absolute inset-0 flex items-center px-4 bg-background',
          isSelected && 'border-l-[3px] border-primary bg-primary/5',
        )}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging.current ? 'none' : 'transform 200ms ease-out',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="flex-1 text-base font-medium tabular-nums">
          {set.weightKg} kg × {set.reps}
        </span>
        <CheckCircle2 className="shrink-0 text-accent" size={20} />
      </div>
    </div>
  )
}

// ─── Adjacent exercise strip ───────────────────────────────────────────────

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
      className="flex w-full items-center justify-between px-4 py-2.5 border-border/60 active:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 min-w-0">
        {direction === 'prev'
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium text-muted-foreground truncate">{name}</span>
      </div>
      <span className={cn('text-xs font-semibold ml-2 shrink-0', done ? 'text-accent' : 'text-muted-foreground')}>
        {loggedCount}/{totalCount}{done ? ' ✓' : ''}
      </span>
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function WorkoutLogger({ sessionId }: WorkoutLoggerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeExerciseIndex, nextExercise, prevExercise } = useWorkoutStore()
  const { restTimerSeconds } = usePreferencesStore()

  // free-workout state (only used when no template)
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(8)
  const [lastExerciseIndex, setLastExerciseIndex] = useState(activeExerciseIndex)
  const [showPicker, setShowPicker] = useState(false)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null)

  // template-workout state
  const [extraSets, setExtraSets] = useState<Record<string, number>>({})
  const [allDoneOpen, setAllDoneOpen] = useState(false)
  const prevAllDoneRef = useRef(false)

  // shared state
  const [restTimer, setRestTimer] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
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

  // Build exercise list from template if available, else from session.sets
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
          isWarmup: !!te.isWarmup,
          loggedSets: (session?.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === te.exerciseId),
        }))
    }
    if (!session?.sets) return []
    const ids = [...new Set(session.sets.map((s: WorkoutSet) => s.exerciseId).filter(Boolean) as string[])]
    return ids.map(id => ({
      id,
      name: exerciseNameMap[id] ?? 'Exercise',
      defaultSets: 0,
      defaultReps: 8,
      defaultWeightKg: 0,
      isWarmup: false,
      loggedSets: session.sets.filter((s: WorkoutSet) => s.exerciseId === id),
    }))
  }, [template, session, exerciseNameMap])

  const currentExercise = exercises[activeExerciseIndex]
  const prevExerciseData = activeExerciseIndex > 0 ? exercises[activeExerciseIndex - 1] : null
  const nextExerciseData = activeExerciseIndex < exercises.length - 1 ? exercises[activeExerciseIndex + 1] : null

  // All-done detection for template workouts
  const allDone = !!template &&
    !!currentExercise &&
    currentExercise.defaultSets > 0 &&
    currentExercise.loggedSets.length >= currentExercise.defaultSets

  useEffect(() => {
    if (allDone && !prevAllDoneRef.current) {
      setAllDoneOpen(true)
    }
    prevAllDoneRef.current = allDone
  }, [allDone])

  // Free workout: sync weight/reps when switching exercises
  if (!template && activeExerciseIndex !== lastExerciseIndex) {
    setLastExerciseIndex(activeExerciseIndex)
    const last = currentExercise?.loggedSets?.at(-1)
    setWeight(last?.weightKg ?? 0)
    setReps(last?.reps ?? 8)
  }

  // Rest timer
  useEffect(() => {
    if (restTimer === null) return
    const id = setInterval(() => setElapsed(p => p + 1), 1000)
    return () => clearInterval(id)
  }, [restTimer])

  // Workout clock
  useEffect(() => {
    const startedAt = session?.startedAt
    if (!startedAt) return
    const id = setInterval(() => {
      setWorkoutSeconds(Math.floor(Date.now() / 1000) - startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [session?.startedAt])

  // Free workout log set mutation
  const freeLogSet = useMutation({
    mutationFn: () => {
      const id = selectedExerciseId ?? currentExercise?.id
      if (!id) throw new Error('No exercise selected')
      return setsApi.logSet(sessionId, {
        exerciseId: id,
        setNumber: (currentExercise?.loggedSets.length ?? 0) + 1,
        reps,
        weightKg: weight,
        isWarmup: false,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
      if ('vibrate' in navigator) navigator.vibrate(50)
      handleSetLogged()
      setSelectedExerciseId(null)
      setSelectedExerciseName(null)
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

  const handleSetLogged = () => {
    setRestTimer(Date.now())
    setElapsed(0)
  }

  const mm = String(Math.floor(workoutSeconds / 60)).padStart(2, '0')
  const ss = String(workoutSeconds % 60).padStart(2, '0')

  const restProgress = restTimer !== null ? Math.min(elapsed / restTimerSeconds, 1) : 0
  const restDone = restProgress >= 1
  const restRemaining = restTimer !== null ? Math.max(0, restTimerSeconds - elapsed) : 0

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

  const isTemplateBased = !!template

  return (
    <div className="bg-background flex h-svh flex-col select-none">
      {/* Rest timer bar */}
      {restTimer !== null && (
        <div className="bg-muted h-1 shrink-0">
          <div
            className={cn('h-1 transition-all duration-1000', restDone ? 'bg-accent' : 'bg-primary')}
            style={{ width: `${restProgress * 100}%` }}
          />
        </div>
      )}

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
          <span className="text-muted-foreground font-mono text-sm tabular-nums">{mm}:{ss}</span>
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
        <div className="border-b border-border/60 shrink-0">
          <ExerciseStrip
            direction="prev"
            loggedCount={prevExerciseData.loggedSets.length}
            name={prevExerciseData.name}
            totalCount={prevExerciseData.defaultSets}
            onClick={prevExercise}
          />
        </div>
      )}

      {/* Current exercise header */}
      {isTemplateBased && currentExercise ? (
        <div className="border-border shrink-0 border-b px-4 py-3">
          <p className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-widest uppercase">
            Exercise {activeExerciseIndex + 1} of {exercises.length}
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
                {exercises.length > 0
                  ? `Exercise ${activeExerciseIndex + 1} of ${exercises.length}`
                  : 'Exercise'}
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

      {/* Set list */}
      <div className="flex-1 overflow-y-auto">
        {isTemplateBased && currentExercise ? (
          <>
            {/* Planned + extra set rows */}
            {Array.from({
              length: Math.max(currentExercise.defaultSets, currentExercise.loggedSets.length) +
                (extraSets[currentExercise.id] ?? 0),
            }).map((_, i) => {
              const setNumber = i + 1
              const loggedSet = currentExercise.loggedSets.find(s => s.setNumber === setNumber) ?? null
              return (
                <SetRow
                  key={`${currentExercise.id}-${setNumber}`}
                  defaultReps={currentExercise.defaultReps}
                  defaultWeight={currentExercise.defaultWeightKg}
                  exerciseId={currentExercise.id}
                  isWarmup={currentExercise.isWarmup}
                  loggedSet={loggedSet}
                  sessionId={sessionId}
                  setNumber={setNumber}
                  onLogged={handleSetLogged}
                />
              )
            })}

            {/* Add / remove extra set */}
            {(() => {
              const totalSets = Math.max(currentExercise.defaultSets, currentExercise.loggedSets.length) +
                (extraSets[currentExercise.id] ?? 0)
              const lastSetLogged = currentExercise.loggedSets.some(s => s.setNumber === totalSets)
              const canRemove = (extraSets[currentExercise.id] ?? 0) > 0 && !lastSetLogged
              return (
                <div className="flex items-center border-t border-border/40">
                  <button
                    className="flex flex-1 items-center gap-2 px-4 py-3 text-primary active:bg-muted/50 transition-colors"
                    onClick={() =>
                      setExtraSets(prev => ({
                        ...prev,
                        [currentExercise.id]: (prev[currentExercise.id] ?? 0) + 1,
                      }))
                    }
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    <span className="text-sm font-medium">Add set</span>
                  </button>
                  {canRemove && (
                    <button
                      className="flex h-11 w-11 items-center justify-center text-destructive active:bg-muted/50 transition-colors shrink-0"
                      onClick={() =>
                        setExtraSets(prev => ({
                          ...prev,
                          [currentExercise.id]: (prev[currentExercise.id] ?? 1) - 1,
                        }))
                      }
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )
            })()}
          </>
        ) : !isTemplateBased ? (
          /* Free workout: existing set list */
          <>
            {currentExercise?.loggedSets.length ? (
              <div className="px-4 py-2">
                {currentExercise.loggedSets.map((s: WorkoutSet, i: number) => (
                  <div key={s.id} className="border-border/50 flex items-center justify-between border-b py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground w-8 text-xs font-semibold uppercase">S{i + 1}</span>
                      <span className="text-sm font-medium">{s.weightKg} kg × {s.reps}</span>
                    </div>
                    <CheckCircle2 className="text-accent" size={16} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 pb-8">
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
          </>
        ) : null}

        {/* Rest timer card */}
        {restTimer !== null && !restDone && (
          <div className="bg-primary/10 border-primary/20 mx-4 my-2 flex items-center justify-between rounded-xl border px-4 py-2.5">
            <span className="text-primary text-sm font-medium">Rest timer</span>
            <span className="font-display font-700 text-primary text-xl tabular-nums">
              {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}
            </span>
          </div>
        )}
        {restDone && (
          <div className="bg-accent/10 border-accent/20 mx-4 my-2 flex items-center gap-2 rounded-xl border px-4 py-2.5">
            <CheckCircle2 className="text-accent" size={16} />
            <span className="text-accent text-sm font-medium">Rest complete — go!</span>
          </div>
        )}
      </div>

      {/* Free workout: LOG SET button */}
      {!isTemplateBased && (
        <div className="border-border shrink-0 border-t">
          <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-2">
            <NumericInput
              bigStep={10}
              fieldKey="weight"
              label="WEIGHT"
              max={300}
              min={0}
              step={2.5}
              unit="kg"
              value={weight}
              onChange={setWeight}
            />
            <NumericInput fieldKey="reps" label="REPS" max={50} min={1} step={1} value={reps} onChange={setReps} />
          </div>
          <div className="px-4 pb-2">
            <button
              className={cn(
                'font-display font-700 h-16 w-full rounded-xl text-2xl tracking-widest transition-all active:scale-[0.97]',
                (selectedExerciseId ?? currentExercise?.id)
                  ? 'bg-primary text-primary-foreground shadow-primary/30 shadow-lg'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
              disabled={freeLogSet.isPending || !(selectedExerciseId ?? currentExercise?.id)}
              onClick={() => freeLogSet.mutate()}
            >
              {freeLogSet.isPending ? '...' : 'LOG SET'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
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
              <ChevronUp size={16} className="rotate-90"  />
            </button>
          </div>
        </div>
      )}

      {/* Next exercise strip */}
      {isTemplateBased && nextExerciseData && (
        <div className="border-t border-border/60 shrink-0">
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
            <DrawerHeader className="text-center pb-2">
              <div className="flex justify-center mb-3">
                <CheckCircle2 className="text-accent" size={40} />
              </div>
              <DrawerTitle className="text-xl">
                {currentExercise?.name} done!
              </DrawerTitle>
              <p className="text-muted-foreground text-sm mt-1">
                {nextExerciseData
                  ? `Ready for ${nextExerciseData.name}?`
                  : 'That was the last exercise. Finish the workout?'}
              </p>
            </DrawerHeader>
            <DrawerFooter>
              <button
                className="bg-primary text-primary-foreground font-display font-700 h-14 w-full rounded-xl text-lg tracking-widest active:scale-[0.97] transition-transform"
                onClick={() => {
                  setAllDoneOpen(false)
                  if (nextExerciseData) {
                    nextExercise()
                  } else {
                    finishWorkout.mutate()
                  }
                }}
              >
                {nextExerciseData ? `NEXT: ${nextExerciseData.name.toUpperCase()}` : 'FINISH WORKOUT'}
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
