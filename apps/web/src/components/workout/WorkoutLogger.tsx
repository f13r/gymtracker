import { Navigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronUp, Plus, CheckCircle2, Square, ImageIcon, Trash2, Loader2 } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { PreviousSetReference, WorkoutSet } from '@gymtracker/shared'
import { calculateVolume, getDoneSets } from '@gymtracker/shared'

import { NumericInput } from '@/components/inputs/NumericInput'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { ExerciseMediaDrawer } from '@/components/workout/ExerciseMediaDrawer'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import { buildSupersetMeta } from '@/components/workout/superset-display'
import { useSwipeReveal } from '@/components/workout/useSwipeReveal'
import { useWorkoutLogger } from '@/components/workout/useWorkoutLogger'
import { haptic } from '@/lib/haptics'
import { cn, formatElapsed } from '@/lib/utils'

interface WorkoutLoggerProps {
  sessionId: string
  /** The Active Exercise's id, from the `?exercise=` URL search param (ADR-0009). */
  activeExerciseId?: string
}

// px of the swipe affordance revealed when a row is snapped open
const SWIPE_OPEN = 96

// Volume/delta number formatters — pure, hoisted so they aren't rebuilt per render.
const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
const fmtDelta = (v: number) => {
  const abs = Math.abs(v)
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toString()
}

type Translate = (key: string, options?: Record<string, unknown>) => string

// One previous Done Set, as "60 kg × 10" — weight is dropped for bodyweight
// Exercises and for weightless Sets, where only the reps carry information.
const fmtPrevSet = (t: Translate, prev: PreviousSetReference, isBodyweight: boolean) => {
  const reps = prev.reps ?? 0
  const w = prev.weightKg
  if (isBodyweight || w == null || w === 0) {
    return t('previous.reps', { reps })
  }
  return t('previous.weightByReps', { weight: w % 1 === 0 ? w : w.toFixed(1), reps })
}

// ─── Inline editable set row ──────────────────────────────────────────────────
//
// Every visible row is now backed by a real Set (the Session Snapshot
// materialises Planned Sets at Start — see ADR-0008). Tapping toggles done;
// swiping left soft-removes the Set.

function InlineSetRow({
  set,
  setIndex,
  previous,
  isBodyweight,
  onUpdate,
  onToggleDone,
  onDelete,
  isDeletePending,
}: {
  set: WorkoutSet
  /** 0-based position of this row among the Exercise's Sets. */
  setIndex: number
  /** What was done in the same position last time, if the Exercise has history. */
  previous: PreviousSetReference | undefined
  isBodyweight: boolean
  onUpdate: (data: { weightKg: number; reps: number }) => void
  onToggleDone: () => void
  onDelete: () => void
  isDeletePending: boolean
}) {
  const { t } = useTranslation('workout')
  const [weight, setWeight] = useState(set.weightKg ?? 0)
  const [reps, setReps] = useState(set.reps ?? 8)
  const [prevSet, setPrevSet] = useState(set)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDirtyRef = useRef(false)
  const { dragX, dragging, revealed, close, consumeDrag, swipeHandlers } = useSwipeReveal(SWIPE_OPEN)

  // Resync local fields when the underlying Set changes from outside (refetch).
  // Compare with Object.is, not !==: a NaN would make `NaN !== NaN` perpetually
  // true and re-fire this render-phase setState forever ("too many re-renders").
  // eslint-disable-next-line react-hooks/refs
  if (!isDirtyRef.current && (!Object.is(set.weightKg, prevSet.weightKg) || !Object.is(set.reps, prevSet.reps))) {
    setPrevSet(set)
    setWeight(set.weightKg ?? 0)
    setReps(set.reps ?? 8)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const scheduleUpdate = (w: number, r: number) => {
    isDirtyRef.current = true
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
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
    if ((e.target as HTMLElement).closest('button, input')) {
      return
    }
    if (consumeDrag()) {
      return
    }
    if (revealed) {
      close()
      return
    }
    // Fire the buzz synchronously in the gesture handler — Android ignores it
    // from the mutation's async onMutate.
    haptic(30)
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
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
        >
          {isDeletePending ? (
            '…'
          ) : (
            <>
              <Trash2 size={18} />
              {t('actions.remove')}
            </>
          )}
        </button>
      </div>

      {/* Swipeable foreground */}
      <div
        className={cn('px-4 pt-4 pb-5', isDone ? 'bg-primary' : 'bg-background', !dragging && 'transition-transform')}
        style={{ touchAction: 'pan-y', transform: `translateX(${dragX}px)` }}
        onClick={handleRowClick}
        {...swipeHandlers}
      >
        {/* Row header: which set this is, and what was done in that slot last time */}
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'text-[10px] font-semibold tracking-widest uppercase',
              isDone ? 'text-primary-foreground/70' : 'text-muted-foreground/70',
            )}
          >
            {t('previous.setNumber', { number: setIndex + 1 })}
          </span>
          {previous && (
            <span
              className={cn(
                'text-[11px] tabular-nums',
                isDone ? 'text-primary-foreground/85' : 'text-muted-foreground',
              )}
            >
              {t('previous.lastTime', { value: fmtPrevSet(t, previous, isBodyweight) })}
            </span>
          )}
        </div>

        <div className={cn('grid gap-3', isBodyweight ? 'grid-cols-1' : 'grid-cols-2')}>
          {!isBodyweight && (
            <NumericInput
              bigStep={5}
              fieldKey={`weight-${set.id}`}
              highlighted={isDone}
              label={t('fields.weight')}
              max={300}
              min={0}
              readOnly={isDone}
              size="lg"
              step={2.5}
              value={weight}
              onChange={handleWeightChange}
            />
          )}
          <NumericInput
            bigStep={5}
            fieldKey={`reps-${set.id}`}
            highlighted={isDone}
            label={t('fields.reps')}
            max={50}
            min={0}
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
  isBodyweight,
}: {
  currentSets: WorkoutSet[]
  prevSets: WorkoutSet[]
  defaultReps: number
  defaultWeightKg: number
  defaultSets: number
  isBodyweight: boolean
}) {
  const { t } = useTranslation('workout')
  const doneSets = getDoneSets(currentSets)
  const nowReps = doneSets.reduce((s, x) => s + (x.reps ?? 0), 0)
  const nowVol = calculateVolume(doneSets)

  const donePrevSets = getDoneSets(prevSets)
  const hasPrev = prevSets.length > 0
  const hasTemplate = defaultSets > 0 && defaultReps > 0

  const wasReps: number | null = hasPrev
    ? donePrevSets.reduce((s, x) => s + (x.reps ?? 0), 0)
    : hasTemplate
      ? defaultSets * defaultReps
      : null

  const wasVol: number | null = hasPrev
    ? calculateVolume(donePrevSets)
    : hasTemplate && defaultWeightKg > 0
      ? defaultSets * defaultReps * defaultWeightKg
      : null

  const comparison = hasPrev ? t('summary.vsLastTime') : hasTemplate ? t('summary.vsTemplate') : null

  const deltaReps = wasReps !== null ? nowReps - wasReps : null
  const deltaVol = wasVol !== null ? nowVol - wasVol : null

  return (
    <div className="border-border/30 border-t px-4 pt-3 pb-4">
      {comparison && (
        <p className="text-muted-foreground/50 mb-2.5 text-[9px] font-semibold tracking-widest uppercase">
          {comparison}
        </p>
      )}
      <div className={cn('grid gap-3', isBodyweight ? 'grid-cols-1' : 'grid-cols-2')}>
        {/* Volume card — hidden for bodyweight */}
        {!isBodyweight && (
          <div className="bg-muted/30 rounded-xl px-3 py-2.5">
            <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">
              {t('summary.volume')}
            </p>
            <p className="font-display font-700 text-[26px] leading-none tabular-nums">
              {nowVol > 0 ? (
                <>
                  {fmtVol(nowVol)}
                  <span className="text-muted-foreground ml-0.5 font-sans text-[11px] font-normal">
                    {t('summary.kg')}
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {wasVol !== null ? t('summary.wasKg', { value: fmtVol(wasVol) }) : t('summary.was', { value: '—' })}
              </span>
              {deltaVol !== null && deltaVol !== 0 && (
                <span
                  className={cn(
                    'text-[10px] font-bold tabular-nums',
                    deltaVol > 0 ? 'text-accent' : 'text-destructive',
                  )}
                >
                  {deltaVol > 0 ? '+' : '−'}
                  {fmtDelta(deltaVol)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Reps card */}
        <div className="bg-muted/30 rounded-xl px-3 py-2.5">
          <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">
            {t('summary.reps')}
          </p>
          <p className="font-display font-700 text-[26px] leading-none tabular-nums">{nowReps > 0 ? nowReps : '—'}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {t('summary.was', { value: wasReps ?? '—' })}
            </span>
            {deltaReps !== null && deltaReps !== 0 && (
              <span
                className={cn('text-[10px] font-bold tabular-nums', deltaReps > 0 ? 'text-accent' : 'text-destructive')}
              >
                {deltaReps > 0 ? '+' : '−'}
                {fmtDelta(deltaReps)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
//
// A thin view over `useWorkoutLogger` — all queries, mutations, derived Exercise
// data, navigation, and UI state live in that controller hook.

export function WorkoutLogger({ sessionId, activeExerciseId }: WorkoutLoggerProps) {
  const {
    session,
    exercises,
    currentExercise,
    activeExerciseIndex,
    nextExerciseData,
    isTemplateBased,
    shouldRedirectToOverview,
    resolving,
    loggedCount,
    doneCount,
    canAddSet,
    workoutSeconds,
    prevSets,
    previousReference,
    exerciseMediaMap,
    pendingSelection,
    permanentAdd,
    setPermanentAdd,
    permanentAddTarget,
    showPicker,
    setShowPicker,
    mediaOpen,
    setMediaOpen,
    allDoneOpen,
    setAllDoneOpen,
    navigate,
    prevExercise,
    nextExercise,
    handlePickerSelect,
    toggleDone,
    deleteSet,
    addSet,
    updateSet,
    finishWorkout,
  } = useWorkoutLogger(sessionId, activeExerciseId)
  const { t } = useTranslation('workout')

  // Superset accent/letter for the current Exercise — same assignment as the
  // overview and template editor, so a group keeps one color across all views.
  const supersetMeta = useMemo(() => buildSupersetMeta(exercises.map(e => e.supersetGroup)), [exercises])
  const currentGroup = currentExercise?.supersetGroup ? supersetMeta.get(currentExercise.supersetGroup) : undefined

  if (showPicker) {
    return (
      <ExercisePicker
        permanentAdd={
          permanentAddTarget
            ? { templateName: permanentAddTarget, checked: permanentAdd, onCheckedChange: setPermanentAdd }
            : undefined
        }
        onClose={() => setShowPicker(false)}
        onSelect={handlePickerSelect}
      />
    )
  }

  // No valid Active Exercise once structure has settled → redirect to the
  // overview declaratively, during render. Replaces the old navigate-in-useEffect
  // (an event-handler-in-an-effect): <Navigate> redirects without an extra render.
  if (shouldRedirectToOverview) {
    return <Navigate to="/dashboard" replace />
  }

  // Show a loader (never a positional fallback) until we can render the exact
  // Exercise the URL names.
  if (!session || resolving) {
    return (
      <div className="bg-background flex h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground animate-spin" size={24} />
      </div>
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
          <span className="text-sm">{t('topBar.back')}</span>
        </button>
        <span className="max-w-[160px] truncate text-sm font-semibold">
          {session?.name ?? t('session.fallbackName')}
        </span>
        <div className="flex min-w-[60px] items-center justify-end gap-3">
          <span className="text-muted-foreground font-mono text-sm tabular-nums">{formatElapsed(workoutSeconds)}</span>
          <button
            className="text-destructive"
            disabled={finishWorkout.isPending}
            title={t('topBar.finish')}
            type="button"
            onClick={() => finishWorkout.mutate()}
          >
            <Square fill="currentColor" size={18} />
          </button>
        </div>
      </div>

      {/* Exercise header */}
      {isTemplateBased && currentExercise ? (
        <div
          className="border-border shrink-0 border-b px-4 py-3"
          style={currentGroup ? { borderLeftColor: currentGroup.color, borderLeftWidth: 4 } : undefined}
        >
          <div className="mb-0.5 flex items-center gap-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
              {t('header.exerciseCount', { current: activeExerciseIndex + 1, total: exercises.length })}
              {' · '}
              {t('header.setsProgress', { done: doneCount, logged: loggedCount })}
            </p>
            {currentGroup && (
              <span
                className="flex items-center gap-1 text-xs font-semibold tracking-wide uppercase"
                style={{ color: currentGroup.color }}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: currentGroup.color }} />
                {t('superset.label', { label: currentGroup.label })}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="font-display font-700 text-3xl leading-tight tracking-wide">
              {currentExercise.name.toUpperCase()}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              {canAddSet && (
                <button
                  className="text-muted-foreground border-border active:bg-muted/50 mt-1 flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
                  disabled={addSet.isPending}
                  type="button"
                  onClick={() => {
                    haptic(50)
                    addSet.mutate()
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  {t('actions.addSet')}
                </button>
              )}
              <button
                aria-label={t('aria.showDemonstration')}
                className="text-muted-foreground mt-1 shrink-0 active:opacity-60"
                type="button"
                onClick={() => setMediaOpen(true)}
              >
                <ImageIcon size={20} />
              </button>
            </div>
          </div>
        </div>
      ) : !isTemplateBased ? (
        <div className="border-border shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              className="group flex min-w-0 flex-1 items-center justify-between"
              type="button"
              onClick={() => setShowPicker(true)}
            >
              <div className="min-w-0">
                <p className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-widest uppercase">
                  {exercises.length > 0
                    ? t('header.exerciseCount', { current: activeExerciseIndex + 1, total: exercises.length })
                    : t('header.exercise')}
                </p>
                <p className="font-display font-700 truncate text-3xl leading-tight tracking-wide">
                  {(pendingSelection?.name ?? currentExercise?.name ?? t('header.selectExercise')).toUpperCase()}
                </p>
              </div>
              <div className="text-primary flex items-center gap-1.5">
                <Plus size={18} strokeWidth={2.5} />
                <span className="text-xs font-semibold tracking-wide uppercase">{t('actions.add')}</span>
              </div>
            </button>
            {canAddSet && (
              <button
                className="text-muted-foreground border-border active:bg-muted/50 flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
                disabled={addSet.isPending}
                type="button"
                onClick={() => {
                  haptic(50)
                  addSet.mutate()
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
                {t('actions.addSet')}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Set rows — every row is a real (Planned or Done) Set from the snapshot */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {currentExercise?.loggedSets.map((s: WorkoutSet, i: number) => (
          <InlineSetRow
            key={s.id}
            isBodyweight={currentExercise.equipmentType === 'bodyweight'}
            isDeletePending={deleteSet.isPending && deleteSet.variables === s.id}
            previous={previousReference.perCurrentSet[i]}
            set={s}
            setIndex={i}
            onDelete={() => deleteSet.mutate(s.id)}
            onToggleDone={() => toggleDone.mutate({ setId: s.id, done: !s.done })}
            onUpdate={data => updateSet.mutate({ setId: s.id, data })}
          />
        ))}

        {/* Previous Sets that today's rows don't cover — last time went further
            than the Template plans, so they're listed rather than dropped. With
            no rows yet (a freshly picked Exercise) this is the whole occurrence,
            so it's headed "Last time" rather than "…also did". */}
        {currentExercise && previousReference.extra.length > 0 && (
          <div className="border-border/40 bg-muted/20 border-b px-4 py-3">
            <p className="text-muted-foreground/70 mb-2 text-[10px] font-semibold tracking-widest uppercase">
              {currentExercise.loggedSets.length > 0 ? t('previous.alsoDid') : t('previous.lastTimeHeading')}
            </p>
            <ul className="flex flex-col gap-1.5">
              {previousReference.extra.map(prev => (
                <li key={prev.position} className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground/70 text-[10px] font-semibold tracking-widest uppercase">
                    {t('previous.setNumber', { number: prev.position })}
                  </span>
                  <span className="text-muted-foreground text-[13px] tabular-nums">
                    {fmtPrevSet(t, prev, currentExercise.equipmentType === 'bodyweight')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty state (freeform with no exercise, or an exercise with all sets removed) */}
        {!currentExercise?.loggedSets.length && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            {!isTemplateBased && !(pendingSelection?.id ?? currentExercise?.id) ? (
              <div className="text-center">
                <p className="font-semibold">{t('empty.noExerciseSelected')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('empty.tapAddToSelect')}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t('empty.logFirstSet')}</p>
            )}
          </div>
        )}
      </div>

      {/* Exercise summary — always visible; volume card hidden for bodyweight */}
      {currentExercise && (
        <div className="shrink-0">
          <ExerciseSummaryBar
            currentSets={currentExercise.loggedSets}
            defaultReps={currentExercise.defaultReps}
            defaultSets={currentExercise.defaultSets}
            defaultWeightKg={currentExercise.defaultWeightKg}
            isBodyweight={currentExercise.equipmentType === 'bodyweight'}
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
              {t('actions.prev')}
            </button>
            <button
              className="border-border text-muted-foreground active:bg-muted flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors"
              type="button"
              onClick={nextExercise}
            >
              {t('actions.next')}
              <ChevronUp className="rotate-90" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Exercise media drawer */}
      {isTemplateBased && currentExercise && (
        <ExerciseMediaDrawer
          description={exerciseMediaMap[currentExercise.id]?.description ?? null}
          exerciseId={currentExercise.id}
          exerciseName={currentExercise.name}
          hasImage={exerciseMediaMap[currentExercise.id]?.hasImage ?? false}
          open={mediaOpen}
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
              <DrawerTitle className="text-xl">{t('allDone.title', { name: currentExercise?.name })}</DrawerTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {nextExerciseData ? t('allDone.hasNext') : t('allDone.last')}
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
                {t('allDone.backToOverview')}
              </button>
              <button
                className="text-muted-foreground h-11 w-full text-sm font-medium"
                type="button"
                onClick={() => setAllDoneOpen(false)}
              >
                {t('allDone.keepGoing')}
              </button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}
