# Workout Hub Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Dashboard into a workout hub when a session is active — showing all exercises with progress so users can jump directly into any exercise, and updating the WorkoutLogger's all-done drawer to route back to the hub.

**Architecture:** Three surgical changes: (1) add `setActiveExerciseIndex` to the Zustand store, (2) replace the simple "Active Session" card in Dashboard with a full exercise-list hub view, (3) replace the "Next exercise" CTA in the WorkoutLogger all-done drawer with "Back to Overview". No new routes or files needed.

**Tech Stack:** React 19, TanStack Query v5, TanStack Router v1, Zustand v5, Tailwind CSS v4, Lucide React

> **Note:** This project has no test runner configured. Skip TDD steps; validate by running the dev server and exercising the feature manually.

---

## File Map

| File | Change |
|------|--------|
| `apps/web/src/stores/workout.store.ts` | Add `setActiveExerciseIndex(n: number)` action |
| `apps/web/src/routes/dashboard.tsx` | Full rewrite of the active-session branch: hub view with timer, exercise list, finish button |
| `apps/web/src/components/workout/WorkoutLogger.tsx` | Change all-done drawer: primary → "BACK TO OVERVIEW", remove next-exercise shortcut |

---

## Task 1: Add `setActiveExerciseIndex` to store

**Files:**
- Modify: `apps/web/src/stores/workout.store.ts`

- [ ] **Step 1: Add the action to the interface and implementation**

Open `apps/web/src/stores/workout.store.ts`. The current file is:

```ts
import { create } from 'zustand'

interface WorkoutStore {
  activeSessionId: string | null
  activeExerciseIndex: number
  setActiveSession: (id: string | null) => void
  nextExercise: () => void
  prevExercise: () => void
  resetExerciseIndex: () => void
}

export const useWorkoutStore = create<WorkoutStore>(set => ({
  activeSessionId: null,
  activeExerciseIndex: 0,
  setActiveSession: id => set({ activeSessionId: id, activeExerciseIndex: 0 }),
  nextExercise: () => set(s => ({ activeExerciseIndex: s.activeExerciseIndex + 1 })),
  prevExercise: () => set(s => ({ activeExerciseIndex: Math.max(0, s.activeExerciseIndex - 1) })),
  resetExerciseIndex: () => set({ activeExerciseIndex: 0 }),
}))
```

Replace with:

```ts
import { create } from 'zustand'

interface WorkoutStore {
  activeSessionId: string | null
  activeExerciseIndex: number
  setActiveSession: (id: string | null) => void
  setActiveExerciseIndex: (index: number) => void
  nextExercise: () => void
  prevExercise: () => void
  resetExerciseIndex: () => void
}

export const useWorkoutStore = create<WorkoutStore>(set => ({
  activeSessionId: null,
  activeExerciseIndex: 0,
  setActiveSession: id => set({ activeSessionId: id, activeExerciseIndex: 0 }),
  setActiveExerciseIndex: index => set({ activeExerciseIndex: index }),
  nextExercise: () => set(s => ({ activeExerciseIndex: s.activeExerciseIndex + 1 })),
  prevExercise: () => set(s => ({ activeExerciseIndex: Math.max(0, s.activeExerciseIndex - 1) })),
  resetExerciseIndex: () => set({ activeExerciseIndex: 0 }),
}))
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/workout.store.ts
git commit -m "feat(store): add setActiveExerciseIndex action"
```

---

## Task 2: Transform Dashboard into workout hub

**Files:**
- Modify: `apps/web/src/routes/dashboard.tsx`

This task replaces the single "active session" button with a full workout hub view. When `active` is null, the existing dashboard (greeting + start button + recent sessions) is unchanged.

- [ ] **Step 1: Add required imports to dashboard.tsx**

The current imports are:
```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { Dumbbell, ChevronRight, Clock, Zap } from 'lucide-react'
import { useState } from 'react'

import type { WorkoutSession } from '@gymtracker/shared'

import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkoutStore } from '@/stores/workout.store'
```

Replace with:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { Dumbbell, ChevronRight, Clock, Zap, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'

import type { WorkoutSession, WorkoutSet } from '@gymtracker/shared'

import { exercisesApi } from '@/api/exercises'
import { schedulesApi } from '@/api/schedules'
import { workoutsApi } from '@/api/workouts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkoutStore } from '@/stores/workout.store'
```

- [ ] **Step 2: Add the WorkoutHub component above DashboardPage**

Insert this component in `dashboard.tsx` just before `export function DashboardPage()`:

```tsx
function WorkoutHub({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeExerciseIndex, setActiveExerciseIndex } = useWorkoutStore()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

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
    allExercises.forEach((e: { id: string; name: string }) => { map[e.id] = e.name })
    return map
  }, [allExercises])

  const exercises = useMemo(() => {
    if (!session) { return [] }
    if (template) {
      return template.exercises
        .slice()
        .sort((a: { orderIndex: number }, b: { orderIndex: number }) => a.orderIndex - b.orderIndex)
        .map((te: { exerciseId: string; defaultSets?: number; defaultReps?: number; defaultWeightKg?: number; orderIndex: number }) => ({
          id: te.exerciseId,
          name: exerciseNameMap[te.exerciseId] ?? 'Exercise',
          defaultSets: te.defaultSets ?? 3,
          loggedSets: (session.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === te.exerciseId),
        }))
    }
    const ids = [...new Set((session.sets ?? []).map((s: WorkoutSet) => s.exerciseId).filter(Boolean) as string[])]
    return ids.map(id => ({
      id,
      name: exerciseNameMap[id] ?? 'Exercise',
      defaultSets: 0,
      loggedSets: (session.sets ?? []).filter((s: WorkoutSet) => s.exerciseId === id),
    }))
  }, [template, session, exerciseNameMap])

  useEffect(() => {
    if (!session?.startedAt) { return }
    setElapsedSeconds(Math.floor(Date.now() / 1000) - session.startedAt)
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor(Date.now() / 1000) - session.startedAt)
    }, 1000)
    return () => clearInterval(id)
  }, [session?.startedAt])

  const finishWorkout = useMutation({
    mutationFn: () => workoutsApi.finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')
  const ss = String(elapsedSeconds % 60).padStart(2, '0')

  if (!session) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground animate-spin" size={24} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-6">
      {/* Session header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">Active workout</p>
          <h1 className="font-display font-700 mt-0.5 text-3xl leading-tight tracking-wide">
            {session.name.toUpperCase()}
          </h1>
        </div>
        <span className="text-muted-foreground font-mono text-xl tabular-nums">{mm}:{ss}</span>
      </div>

      {/* Exercise list */}
      <div className="bg-card border-border overflow-hidden rounded-2xl border">
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell className="text-muted-foreground" size={28} />
            <p className="text-muted-foreground text-sm">No exercises yet</p>
          </div>
        ) : (
          exercises.map((ex, i) => {
            const doneSets = ex.loggedSets.filter((s: WorkoutSet) => s.done !== 0).length
            const totalSets = ex.defaultSets > 0 ? ex.defaultSets : ex.loggedSets.length
            const isComplete = totalSets > 0 && doneSets >= totalSets
            const isCurrent = i === activeExerciseIndex

            return (
              <button
                key={ex.id}
                className={cn(
                  'border-border/40 active:bg-muted/50 flex w-full items-center justify-between border-b px-4 py-3.5 text-left last:border-b-0 transition-colors',
                  isCurrent && 'bg-primary/5',
                )}
                onClick={() => {
                  setActiveExerciseIndex(i)
                  navigate({ to: '/workout/$sessionId', params: { sessionId } })
                }}
              >
                <div className="flex items-center gap-3">
                  {isComplete ? (
                    <CheckCircle2 className="text-accent shrink-0" size={18} />
                  ) : isCurrent ? (
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                      <span className="bg-primary relative inline-flex h-2.5 w-2.5 rounded-full" />
                    </span>
                  ) : (
                    <Circle className="text-muted-foreground/40 shrink-0" size={18} />
                  )}
                  <span className={cn('text-sm font-semibold', isComplete && 'text-muted-foreground line-through')}>
                    {ex.name}
                  </span>
                </div>
                <span className={cn('text-xs font-semibold tabular-nums', isComplete ? 'text-accent' : 'text-muted-foreground')}>
                  {doneSets}/{totalSets > 0 ? totalSets : '?'}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Finish button */}
      <button
        className="border-destructive/30 text-destructive active:bg-destructive/5 h-12 w-full rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40"
        disabled={finishWorkout.isPending}
        onClick={() => finishWorkout.mutate()}
      >
        {finishWorkout.isPending ? 'Finishing…' : 'Finish Workout'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Update DashboardPage to render WorkoutHub when session is active**

In `DashboardPage`, find the section that currently renders the active session button:

```tsx
      {active ? (
        <button
          className="bg-primary/10 border-primary/30 w-full rounded-xl border p-4 text-left transition-transform active:scale-[0.98]"
          onClick={() => navigate({ to: '/workout/$sessionId', params: { sessionId: active.id } })}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                <span className="bg-primary relative inline-flex h-2.5 w-2.5 rounded-full" />
              </span>
              <span className="text-primary text-xs font-semibold tracking-widest uppercase">Active Session</span>
            </div>
            <ChevronRight className="text-primary" size={16} />
          </div>
          <p className="font-display font-700 mt-1 text-2xl tracking-wide">{active.name}</p>
          <p className="text-muted-foreground mt-0.5 text-sm">Tap to resume your workout</p>
        </button>
      ) : (
```

The entire `DashboardPage` return when `active` is truthy should short-circuit to `WorkoutHub` before rendering the main layout. Add this early return at the top of the `DashboardPage` function body, immediately after the hooks:

```tsx
  if (active) {
    return <WorkoutHub sessionId={active.id} />
  }
```

Place it right after all the hook calls (after `const isSkipped = ...` and `const showPrompt = ...` lines but before `const finished = ...`). The full function body top looks like:

```tsx
export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActiveSession = useWorkoutStore(s => s.setActiveSession)
  const [promptDismissed, setPromptDismissed] = useState(false)

  const { data: active } = useQuery({ queryKey: ['activeSession'], queryFn: workoutsApi.getActiveSession })
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions'], queryFn: workoutsApi.getSessions })
  const { data: todaySchedule } = useQuery({
    queryKey: ['todaySchedule'],
    queryFn: schedulesApi.getToday,
  })

  const startFromSchedule = useMutation({ /* unchanged */ })
  const dismissPrompt = () => { /* unchanged */ }
  const isSkipped = todaySchedule && localStorage.getItem(getSkippedKey(todaySchedule.schedule.templateId!)) === '1'
  const showPrompt = !!todaySchedule && !promptDismissed && !isSkipped && !active

  if (active) {
    return <WorkoutHub sessionId={active.id} />
  }

  const finished = sessions.filter((s: WorkoutSession) => s.finishedAt)
  // ... rest of the existing DashboardPage return unchanged
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

```bash
cd apps/web && npm run dev
```

1. Navigate to `/dashboard` with no active session → existing view (greeting + START WORKOUT + recent) renders unchanged.
2. Start a workout → navigate back to `/dashboard` → hub view shows: workout name, live timer, exercise list, Finish button.
3. Tap an exercise row → lands on WorkoutLogger focused on that exercise.
4. Tap "Back" in logger → returns to `/dashboard` → hub still shows.
5. Tap "Finish Workout" on hub → session ends, hub disappears, normal dashboard returns.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/dashboard.tsx
git commit -m "feat(dashboard): transform into workout hub when session is active"
```

---

## Task 3: Update WorkoutLogger all-done drawer

**Files:**
- Modify: `apps/web/src/components/workout/WorkoutLogger.tsx`

Change the all-done drawer so the primary action navigates back to the Dashboard overview instead of jumping to the next exercise.

- [ ] **Step 1: Find the all-done drawer in WorkoutLogger.tsx**

Around line 772–806:

```tsx
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
                  if (nextExerciseData) { nextExercise() }
                  else { finishWorkout.mutate() }
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
```

Replace it with:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

```bash
cd apps/web && npm run dev
```

1. Start a template-based workout.
2. Complete all sets for an exercise (tap each set row to mark done).
3. All-done drawer appears → primary button reads "BACK TO OVERVIEW".
4. Tap it → lands on `/dashboard` workout hub with the completed exercise showing ✓.
5. Tap "Keep going here" on a second exercise → drawer dismisses, stays in logger.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/workout/WorkoutLogger.tsx
git commit -m "feat(logger): route all-done drawer back to dashboard overview"
```

---

## Self-Review

**Spec coverage:**
- ✅ Home page transforms into workout hub when session active
- ✅ Exercise list with status icons + set progress visible on hub
- ✅ Tap exercise → jumps to that exercise in logger
- ✅ Live timer on hub
- ✅ Finish workout from hub
- ✅ All-done drawer → "BACK TO OVERVIEW" primary action
- ✅ `setActiveExerciseIndex` added to store

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**
- `setActiveExerciseIndex` defined in Task 1, consumed in Task 2 `WorkoutHub` component ✓
- `WorkoutSet` imported in dashboard in Task 2 ✓
- `exercisesApi` imported in dashboard in Task 2 ✓
- `navigate({ to: '/dashboard' })` in Task 3 matches existing navigation pattern ✓
