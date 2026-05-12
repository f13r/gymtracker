# Workout Logger Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign WorkoutLogger with a fixed top InputPanel (large steppers + LOG/UPDATE/DELETE), scrollable logged-set list (tap-to-edit, swipe-to-delete), and inline rest timer strip — eliminating tiny per-row steppers and wasted empty space.

**Architecture:** Replace the per-row `Stepper`/`SetRow` pattern with a shared `InputPanel` fixed at the top and read-only `SwipeableSetRow` rows in a scrollable list. `InputPanel` has two modes: "new set" (LOG SET button) and "edit mode" (UPDATE + DELETE). Both template and free-workout modes share this panel. `SwipeableSetRow` uses pointer events for swipe-to-delete.

**Tech Stack:** React, TanStack Query, Tailwind CSS, Lucide icons, existing `NumericInput` (already h-14 with tap-to-type), `useLongPress`, `setsApi.updateSet`

---

## File Map

| File                                                | Action    | What changes                                                           |
| --------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `apps/web/src/components/workout/WorkoutLogger.tsx` | Modify    | Full rewrite of sub-components and layout; all logic stays in one file |
| `apps/web/src/components/inputs/NumericInput.tsx`   | Read-only | Reused as-is in InputPanel                                             |
| `apps/web/src/api/sets.ts`                          | Read-only | `updateSet` and `deleteSet` already exist                              |

---

## Task 1: Replace `Stepper` + `SetRow` with `InputPanel`

**Files:**

- Modify: `apps/web/src/components/workout/WorkoutLogger.tsx`

Replace the `Stepper` function (lines 25–51) and `SetRow` function (lines 55–153) with a new `InputPanel` component. `InputPanel` owns no state — all values and handlers come from props.

- [ ] **Step 1: Delete the `Stepper` function entirely** (lines 23–51 in current file). It will no longer be used.

- [ ] **Step 2: Delete the `SetRow` function entirely** (lines 53–153 in current file). Its mutation logic moves to `WorkoutLogger`.

- [ ] **Step 3: Add the `InputPanel` function** in place of the deleted code (after the imports, before `ExerciseStrip`):

```tsx
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
    <div className="border-border shrink-0 border-b px-4 pt-3 pb-4">
      <div className="mb-3 grid grid-cols-2 gap-3">
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
            className="font-display font-700 bg-primary text-primary-foreground h-14 rounded-xl text-lg tracking-widest transition-transform active:scale-[0.97] disabled:opacity-40"
            disabled={isPending}
            onClick={onUpdate}
          >
            {isPending ? '…' : 'UPDATE'}
          </button>
          <button
            className="font-display font-700 bg-destructive text-destructive-foreground h-14 rounded-xl text-lg tracking-widest transition-transform active:scale-[0.97] disabled:opacity-40"
            disabled={isPending}
            onClick={onDelete}
          >
            {isPending ? '…' : 'DELETE'}
          </button>
        </div>
      ) : (
        <button
          className="font-display font-700 bg-primary text-primary-foreground shadow-primary/30 h-14 w-full rounded-xl text-2xl tracking-widest shadow-lg transition-transform active:scale-[0.97] disabled:opacity-40"
          disabled={isPending}
          onClick={onLog}
        >
          {isPending ? '…' : 'LOG SET'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify it type-checks** (no import changes needed — `NumericInput` and `WorkoutSet` are already imported):

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "WorkoutLogger"
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workout/WorkoutLogger.tsx
git commit -m "refactor: replace Stepper+SetRow with InputPanel in WorkoutLogger"
```

---

## Task 2: Add `SwipeableSetRow` component

**Files:**

- Modify: `apps/web/src/components/workout/WorkoutLogger.tsx`

Add `SwipeableSetRow` after `InputPanel` and before `ExerciseStrip`. This component renders one logged set with: tap-to-select (loads into edit mode), swipe-left-to-reveal-delete.

- [ ] **Step 1: Add `useRef` to the React import** — it's already imported, confirm `useRef` is in the list at line 4.

- [ ] **Step 2: Add `SwipeableSetRow` after `InputPanel` and before `ExerciseStrip`:**

```tsx
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
    <div className="border-border/40 relative h-14 overflow-hidden border-b">
      {/* Delete zone revealed behind sliding content */}
      <div className="bg-destructive absolute inset-y-0 right-0 flex w-20 items-center justify-center">
        <button
          className="text-destructive-foreground h-full w-full text-sm font-semibold disabled:opacity-40"
          disabled={isDeletePending}
          onClick={onDelete}
        >
          {isDeletePending ? '…' : 'DELETE'}
        </button>
      </div>

      {/* Sliding row content */}
      <div
        className={cn(
          'bg-background absolute inset-0 flex items-center px-4',
          isSelected && 'border-primary bg-primary/5 border-l-[3px]',
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
        <CheckCircle2 className="text-accent shrink-0" size={20} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check:**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "WorkoutLogger"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/workout/WorkoutLogger.tsx
git commit -m "feat: add SwipeableSetRow with swipe-to-delete and tap-to-edit"
```

---

## Task 3: Refactor `WorkoutLogger` main component state

**Files:**

- Modify: `apps/web/src/components/workout/WorkoutLogger.tsx`

Replace the old weight/reps state and add `editingSet`, `panelWeight`, `panelReps`. Add `updateSet` and `deleteSet` mutations. Add `enterEditMode` / `exitEditMode` helpers.

- [ ] **Step 1: Replace the state declarations block** (currently lines 197–213 in the original, starting with `const [weight, setWeight]`). Remove `weight`, `reps`, and replace with the new unified panel state. The full new state block is:

```tsx
// free-workout state (only used when no template)
const [lastExerciseIndex, setLastExerciseIndex] = useState(activeExerciseIndex)
const [showPicker, setShowPicker] = useState(false)
const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null)

// template-workout state
const [extraSets, setExtraSets] = useState<Record<string, number>>({})
const [allDoneOpen, setAllDoneOpen] = useState(false)
const prevAllDoneRef = useRef(false)

// shared input panel state
const [panelWeight, setPanelWeight] = useState(0)
const [panelReps, setPanelReps] = useState(8)
const [editingSet, setEditingSet] = useState<WorkoutSet | null>(null)
const panelInitialized = useRef(false)

// shared timer state
const [restTimer, setRestTimer] = useState<number | null>(null)
const [elapsed, setElapsed] = useState(0)
const [workoutSeconds, setWorkoutSeconds] = useState(0)
```

- [ ] **Step 2: Add the panel initialization effect** after the `exerciseNameMap` memo and `exercises` memo (after the `useMemo` blocks):

```tsx
// Initialize panel from last logged set or template defaults when data first loads
useEffect(() => {
  if (currentExercise && !panelInitialized.current) {
    panelInitialized.current = true
    const last = currentExercise.loggedSets.at(-1)
    setPanelWeight(last?.weightKg ?? currentExercise.defaultWeightKg)
    setPanelReps(last?.reps ?? currentExercise.defaultReps)
  }
}, [currentExercise])

// Re-sync panel when navigating to a different exercise
useEffect(() => {
  if (!currentExercise) return
  const last = currentExercise.loggedSets.at(-1)
  setPanelWeight(last?.weightKg ?? currentExercise.defaultWeightKg)
  setPanelReps(last?.reps ?? currentExercise.defaultReps)
  setEditingSet(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeExerciseIndex])
```

- [ ] **Step 3: Add `enterEditMode` / `exitEditMode` helpers** after the useEffects:

```tsx
const enterEditMode = (set: WorkoutSet) => {
  setEditingSet(set)
  setPanelWeight(set.weightKg)
  setPanelReps(set.reps)
}

const exitEditMode = () => {
  setEditingSet(null)
  // panel keeps the last-used values as carry-forward for next set
}
```

- [ ] **Step 4: Add `updateSet` and `deleteSet` mutations** after the existing `freeLogSet` and `finishWorkout` mutations:

```tsx
const updateSet = useMutation({
  mutationFn: () => setsApi.updateSet(sessionId, editingSet!.id, { weightKg: panelWeight, reps: panelReps }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    exitEditMode()
  },
})

const deleteSet = useMutation({
  mutationFn: (setId: string) => setsApi.deleteSet(sessionId, setId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    exitEditMode()
  },
})
```

- [ ] **Step 5: Update `handleSetLogged`** — remove rest timer trigger from freeLogSet and keep it here only:

```tsx
const handleSetLogged = () => {
  setRestTimer(Date.now())
  setElapsed(0)
}
```

(No change needed here — it's already correct. Ensure `freeLogSet.onSuccess` still calls `handleSetLogged()`.)

- [ ] **Step 6: Update `freeLogSet` mutation** to use `panelWeight` / `panelReps` instead of old `weight` / `reps`:

```tsx
const freeLogSet = useMutation({
  mutationFn: () => {
    const id = selectedExerciseId ?? currentExercise?.id
    if (!id) throw new Error('No exercise selected')
    return setsApi.logSet(sessionId, {
      exerciseId: id,
      setNumber: (currentExercise?.loggedSets.length ?? 0) + 1,
      reps: panelReps,
      weightKg: panelWeight,
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
```

- [ ] **Step 7: Remove the stale free-workout exercise-sync block** — find and delete these lines:

```tsx
// Free workout: sync weight/reps when switching exercises
if (!template && activeExerciseIndex !== lastExerciseIndex) {
  setLastExerciseIndex(activeExerciseIndex)
  const last = currentExercise?.loggedSets?.at(-1)
  setWeight(last?.weightKg ?? 0)
  setReps(last?.reps ?? 8)
}
```

The `lastExerciseIndex` and `setLastExerciseIndex` state can also be removed since the new `activeExerciseIndex` effect handles sync for all modes.

- [ ] **Step 8: Type-check:**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "WorkoutLogger"
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/workout/WorkoutLogger.tsx
git commit -m "refactor: unify panel state and add updateSet/deleteSet mutations"
```

---

## Task 4: Rewrite the JSX layout

**Files:**

- Modify: `apps/web/src/components/workout/WorkoutLogger.tsx`

Replace the entire `return (...)` block in `WorkoutLogger` with the new layout. The new layout has: top bar → exercise header (with set count) → `InputPanel` → rest timer strip → scrollable set list → next exercise strip.

- [ ] **Step 1: Compute derived values** (add these before the `return`):

```tsx
const loggedCount = currentExercise?.loggedSets.length ?? 0
const totalPlannedSets = isTemplateBased
  ? (currentExercise?.defaultSets ?? 0) + (extraSets[currentExercise?.id ?? ''] ?? 0)
  : 0
const nextSetLabel = `Set ${loggedCount + 1}`

const isPanelPending =
  (isTemplateBased ? logSet.isPending : freeLogSet.isPending) || updateSet.isPending || deleteSet.isPending

// Template-based log-set mutation (needed since per-row logSet is removed)
// Define this above allDone, replacing the per-row SetRow mutation:
```

- [ ] **Step 2: Add a top-level `logSet` mutation for template mode** (this replaces the per-row one that was inside `SetRow`). Add it after `freeLogSet`:

```tsx
const logSet = useMutation({
  mutationFn: () => {
    if (!currentExercise) throw new Error('No exercise')
    return setsApi.logSet(sessionId, {
      exerciseId: currentExercise.id,
      setNumber: loggedCount + 1,
      reps: panelReps,
      weightKg: panelWeight,
      isWarmup: currentExercise.isWarmup,
    })
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    if ('vibrate' in navigator) navigator.vibrate(50)
    handleSetLogged()
  },
})
```

Note: `loggedCount` is derived before `return`, but this mutation needs it. Move `loggedCount` declaration to **before** the mutations block (after the `exercises` memo):

```tsx
const loggedCount = currentExercise?.loggedSets.length ?? 0
```

- [ ] **Step 3: Replace the entire `return (...)` block** with the new layout:

```tsx
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
    {/* Rest progress bar */}
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
        <span className="text-muted-foreground font-mono text-sm tabular-nums">
          {mm}:{ss}
        </span>
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
          {loggedCount}/{totalPlannedSets} sets
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

    {/* Input panel */}
    <InputPanel
      weight={panelWeight}
      reps={panelReps}
      onWeightChange={setPanelWeight}
      onRepsChange={setPanelReps}
      editingSet={editingSet}
      nextSetLabel={nextSetLabel}
      onLog={() => (isTemplateBased ? logSet.mutate() : freeLogSet.mutate())}
      onUpdate={() => updateSet.mutate()}
      onDelete={() => editingSet && deleteSet.mutate(editingSet.id)}
      isPending={isPanelPending}
    />

    {/* Rest timer strip */}
    {restTimer !== null && !restDone && (
      <div className="bg-primary/10 border-primary/20 flex shrink-0 items-center justify-between border-b px-4 py-2.5">
        <span className="text-primary text-sm font-medium">Rest</span>
        <span className="font-display font-700 text-primary text-xl tabular-nums">
          {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}
        </span>
      </div>
    )}
    {restDone && (
      <div className="bg-accent/10 border-accent/20 flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <CheckCircle2 className="text-accent" size={16} />
        <span className="text-accent text-sm font-medium">Rest complete — go!</span>
      </div>
    )}

    {/* Scrollable set list */}
    <div className="flex-1 overflow-y-auto">
      {currentExercise?.loggedSets.map((s: WorkoutSet) => (
        <SwipeableSetRow
          key={s.id}
          set={s}
          isSelected={editingSet?.id === s.id}
          isDeletePending={deleteSet.isPending && deleteSet.variables === s.id}
          onTap={() => enterEditMode(s)}
          onDelete={() => deleteSet.mutate(s.id)}
        />
      ))}

      {/* Tap outside edit mode to cancel */}
      {editingSet && currentExercise?.loggedSets.length === 0 && <div />}

      {/* Add / remove extra set (template only) */}
      {isTemplateBased &&
        currentExercise &&
        (() => {
          const lastSetLogged = currentExercise.loggedSets.some(s => s.setNumber === totalPlannedSets)
          const canRemove = (extraSets[currentExercise.id] ?? 0) > 0 && !lastSetLogged
          return (
            <div className="border-border/40 flex items-center border-t">
              <button
                className="text-primary active:bg-muted/50 flex flex-1 items-center gap-2 px-4 py-3 transition-colors"
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
                  className="text-destructive active:bg-muted/50 flex h-11 w-11 shrink-0 items-center justify-center transition-colors"
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

      {/* Free workout: empty state */}
      {!isTemplateBased && !currentExercise?.loggedSets.length && (
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
    </div>

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
            <ChevronUp size={16} className="rotate-90" />
          </button>
        </div>
      </div>
    )}

    {/* Next exercise strip */}
    {isTemplateBased && nextExerciseData && (
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
                ? `Ready for ${nextExerciseData.name}?`
                : 'That was the last exercise. Finish the workout?'}
            </p>
          </DrawerHeader>
          <DrawerFooter>
            <button
              className="bg-primary text-primary-foreground font-display font-700 h-14 w-full rounded-xl text-lg tracking-widest transition-transform active:scale-[0.97]"
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
```

- [ ] **Step 4: Remove `NumericInput` from imports** — it moves from `WorkoutLogger`'s JSX to `InputPanel`. Confirm `NumericInput` is still imported at the top of the file (it already is).

- [ ] **Step 5: Type-check the full file:**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "WorkoutLogger"
```

Expected: no output.

- [ ] **Step 6: Start the dev server and test manually on a narrow viewport:**

```bash
cd apps/web && npm run dev
```

Open http://localhost:5173 in browser, set viewport to 360px width. Verify:

- InputPanel is visible at top with two h-14 steppers and h-14 LOG SET button
- Tapping the number in a stepper opens keyboard
- Tapping LOG SET logs a set and it appears in the list below
- Tapping a logged set row highlights it, loads values into panel, shows UPDATE/DELETE
- Swiping a row left ~80px reveals DELETE button
- Rest timer strip appears between InputPanel and set list (not in the scrollable area)
- No empty space below rest timer
- No S1/S2 labels

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/workout/WorkoutLogger.tsx
git commit -m "feat: redesign WorkoutLogger with fixed InputPanel and swipeable set list"
```

---

## Self-Review

### Spec Coverage

| Requirement                      | Covered by                                                             |
| -------------------------------- | ---------------------------------------------------------------------- |
| Large touch targets (≥44px)      | InputPanel uses h-14 (56px) NumericInput; LOG SET h-14                 |
| Tap to type weight/reps          | NumericInput already has tap-to-edit number input                      |
| Remove S1/S2 labels              | `SwipeableSetRow` shows only `weightKg × reps`, no label               |
| Empty space fix                  | Rest timer moved out of scroll area to fixed strip                     |
| Tap logged set to edit           | `SwipeableSetRow.onTap` → `enterEditMode` → panel loads values         |
| Swipe to delete                  | Pointer-event swipe in `SwipeableSetRow` reveals DELETE button         |
| UPDATE button (explicit confirm) | `InputPanel` edit mode shows UPDATE + DELETE buttons                   |
| Set count in header              | `loggedCount/${totalPlannedSets} sets` in exercise header              |
| Free workout unified             | `freeLogSet` uses `panelWeight`/`panelReps`; same panel for both modes |
| Add/remove extra sets            | Preserved from existing implementation                                 |
| All-done drawer                  | Unchanged                                                              |
| Rest timer                       | Moved to fixed strip, no longer causes empty-space issue               |

### Placeholder Scan

No TBDs, no "add validation", no "handle edge cases" — all steps include complete code.

### Type Consistency

- `WorkoutSet` used in `editingSet`, `SwipeableSetRow`, `enterEditMode` — consistent
- `deleteSet.mutate(s.id)` — `mutationFn: (setId: string)` matches
- `updateSet.mutate()` — no argument, uses closure `editingSet!.id` — consistent
- `logSet.mutate()` / `freeLogSet.mutate()` — no argument, uses closure state — consistent
- `isPanelPending` covers all three pending states — consistent
