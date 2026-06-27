# Workout Hub Summary Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `WorkoutSummaryCard` between the exercise list and the Finish Workout button in `WorkoutHub`, showing total volume + delta vs last session, exercises completed count, and a list of exercises that beat the previous session.

**Architecture:** Single-file change to `apps/web/src/routes/dashboard.tsx`. A new `WorkoutSummaryCard` presentational component is added above `WorkoutHub`. Two new queries are added to `WorkoutHub` (reusing the `['sessions']` cache key already populated by `DashboardPage`) to find and load the previous session with the same template. A `summaryStats` memo computes all values from current and previous sets.

**Tech Stack:** React 19, TanStack Query v5, Zustand v5, Tailwind CSS v4

> **Note:** No test runner configured — skip TDD steps. Validate manually by running the dev server.

---

## File Map

| File                                | Change                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/dashboard.tsx` | Add `WorkoutSummaryCard` component; add `sessions` + `prevSessionData` queries + `summaryStats` memo to `WorkoutHub`; render `WorkoutSummaryCard` between exercise list and Finish button |

---

## Task 1: Add WorkoutSummaryCard component and wire it into WorkoutHub

**Files:**

- Modify: `apps/web/src/routes/dashboard.tsx`

### Step 1: Add the `WorkoutSummaryCard` component

Insert this new component in `apps/web/src/routes/dashboard.tsx` immediately above the existing `function WorkoutHub(...)` declaration (around line 37):

```tsx
function WorkoutSummaryCard({
  currentVolume,
  prevVolume,
  completedCount,
  totalExercises,
  exceededExercises,
}: {
  currentVolume: number
  prevVolume: number | null
  completedCount: number
  totalExercises: number
  exceededExercises: { name: string; delta: number }[]
}) {
  const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
  const fmtDelta = (v: number) => {
    const abs = Math.abs(v)
    return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toString()
  }

  const deltaVol = prevVolume !== null ? currentVolume - prevVolume : null
  const hasPrev = prevVolume !== null

  return (
    <div className="border-border/30 rounded-2xl border px-4 pt-3 pb-4">
      {hasPrev && (
        <p className="text-muted-foreground/50 mb-2.5 text-[9px] font-semibold tracking-widest uppercase">
          vs last session
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/30 rounded-xl px-3 py-2.5">
          <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">VOLUME</p>
          <p className="font-display font-700 text-[26px] leading-none tabular-nums">
            {currentVolume > 0 ? (
              <>
                {fmtVol(currentVolume)}
                <span className="text-muted-foreground ml-0.5 font-sans text-[11px] font-normal">kg</span>
              </>
            ) : (
              '—'
            )}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px] tabular-nums">
              was {hasPrev ? `${fmtVol(prevVolume!)}kg` : '—'}
            </span>
            {deltaVol !== null && deltaVol !== 0 && (
              <span
                className={cn('text-[10px] font-bold tabular-nums', deltaVol > 0 ? 'text-accent' : 'text-destructive')}
              >
                {deltaVol > 0 ? '+' : '−'}
                {fmtDelta(deltaVol)}
              </span>
            )}
          </div>
        </div>

        <div className="bg-muted/30 rounded-xl px-3 py-2.5">
          <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">DONE</p>
          <p className="font-display font-700 text-[26px] leading-none tabular-nums">
            {completedCount > 0 ? (
              <>
                {completedCount}
                <span className="text-muted-foreground ml-0.5 font-sans text-[11px] font-normal">
                  /{totalExercises}
                </span>
              </>
            ) : (
              `0/${totalExercises}`
            )}
          </p>
          <div className="mt-1.5">
            <span className="text-muted-foreground text-[11px]">exercises complete</span>
          </div>
        </div>
      </div>

      {exceededExercises.length > 0 && (
        <div className="border-border/20 mt-3 border-t pt-3">
          <p className="text-muted-foreground/50 mb-2 text-[9px] font-semibold tracking-widest uppercase">
            beat last time ({exceededExercises.length})
          </p>
          <div className="space-y-1">
            {exceededExercises.map(ex => (
              <div key={ex.name} className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">{ex.name}</span>
                <span className="text-accent text-[10px] font-bold tabular-nums">+{fmtVol(ex.delta)}kg</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add `sessions` and `prevSessionData` queries to `WorkoutHub`**

Inside `WorkoutHub`, after the existing `allExercises` query (currently ending around line 57), add:

```tsx
const { data: allSessions = [] } = useQuery({
  queryKey: ['sessions'],
  queryFn: workoutsApi.getSessions,
})

const prevSession = useMemo(() => {
  if (!session?.templateId) {
    return null
  }
  return (
    allSessions
      .filter((s: WorkoutSession) => s.templateId === session.templateId && s.finishedAt && s.id !== sessionId)
      .sort((a: WorkoutSession, b: WorkoutSession) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0] ?? null
  )
}, [allSessions, session?.templateId, sessionId])

const { data: prevSessionData } = useQuery({
  queryKey: ['session', prevSession?.id],
  queryFn: () => workoutsApi.getSession(prevSession!.id),
  enabled: !!prevSession?.id,
})
```

- [ ] **Step 3: Add `summaryStats` memo to `WorkoutHub`**

After the `exercises` memo (currently ending around line 85), add:

```tsx
const summaryStats = useMemo(() => {
  const currentSets = session?.sets ?? []
  const prevSets = prevSessionData?.sets ?? []

  const currentVolume = currentSets.reduce((sum, s: WorkoutSet) => sum + (s.reps ?? 0) * (s.weightKg ?? 0), 0)
  const prevVolume =
    prevSets.length > 0 ? prevSets.reduce((sum, s: WorkoutSet) => sum + (s.reps ?? 0) * (s.weightKg ?? 0), 0) : null

  const completedCount = exercises.filter(ex => ex.defaultSets > 0 && ex.loggedSets.length >= ex.defaultSets).length

  const exceededExercises = exercises
    .map(ex => {
      const currentExVol = ex.loggedSets.reduce((sum, s: WorkoutSet) => sum + (s.reps ?? 0) * (s.weightKg ?? 0), 0)
      const prevExVol =
        prevSets.length > 0
          ? prevSets
              .filter((s: WorkoutSet) => s.exerciseId === ex.id)
              .reduce((sum, s: WorkoutSet) => sum + (s.reps ?? 0) * (s.weightKg ?? 0), 0)
          : null
      const delta = prevExVol !== null ? currentExVol - prevExVol : null
      return { name: ex.name, delta, currentVol: currentExVol }
    })
    .filter(
      (ex): ex is { name: string; delta: number; currentVol: number } =>
        ex.delta !== null && ex.delta > 0 && ex.currentVol > 0,
    )

  return { currentVolume, prevVolume, completedCount, exceededExercises }
}, [session?.sets, prevSessionData?.sets, exercises])
```

- [ ] **Step 4: Render `WorkoutSummaryCard` between the exercise list and Finish button**

In `WorkoutHub`'s return JSX, find the comment `{/* Finish button */}` and insert the summary card immediately before it. The section currently reads:

```tsx
{
  /* Finish button */
}
;<button
  className="border-destructive/30 text-destructive active:bg-destructive/5 h-12 w-full rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40"
  disabled={finishWorkout.isPending}
  onClick={() => finishWorkout.mutate()}
>
  {finishWorkout.isPending ? 'Finishing…' : 'Finish Workout'}
</button>
```

Replace with:

```tsx
{
  /* Workout summary */
}
{
  exercises.length > 0 && (
    <WorkoutSummaryCard
      completedCount={summaryStats.completedCount}
      currentVolume={summaryStats.currentVolume}
      exceededExercises={summaryStats.exceededExercises}
      prevVolume={summaryStats.prevVolume}
      totalExercises={exercises.length}
    />
  )
}

{
  /* Finish button */
}
;<button
  className="border-destructive/30 text-destructive active:bg-destructive/5 h-12 w-full rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40"
  disabled={finishWorkout.isPending}
  onClick={() => finishWorkout.mutate()}
>
  {finishWorkout.isPending ? 'Finishing…' : 'Finish Workout'}
</button>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/vslavinskyi/html/selfcouch/apps/web && npx tsc --noEmit
```

Expected: no new errors (pre-existing tsconfig composite reference errors are unrelated).

- [ ] **Step 6: Manual smoke test**

```bash
cd /Users/vslavinskyi/html/selfcouch && npm run dev 2>/dev/null || npx --prefix apps/web vite
```

Verify:

1. With an active session (template-based): summary card appears between exercise list and Finish button.
2. Volume card shows total kg lifted; "was —" if no previous session of same template exists.
3. Done card shows `X/Y exercises complete`.
4. "Beat last time" section appears only when current volume exceeds previous session for any exercise.
5. With no sets logged yet: volume shows `—`, done shows `0/N`.
6. Free workouts (no template): summary still renders; "vs last session" label hidden; "done" card is less meaningful but harmless.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/dashboard.tsx
git commit -m "feat(dashboard): add workout summary card with volume and exercise progress"
```

---

## Self-Review

**Spec coverage:**

- ✅ Total volume + delta vs last session — `summaryStats.currentVolume` / `summaryStats.prevVolume`
- ✅ Exercises completed count — `summaryStats.completedCount` / `exercises.length`
- ✅ Exercises that beat last session — `summaryStats.exceededExercises` list with `+Xkg` delta
- ✅ No previous session → shows current totals only, hides "vs last session" label and "beat last time" section
- ✅ Only shown when there are exercises (`exercises.length > 0` guard)

**Placeholder scan:** None — all code is complete.

**Type consistency:**

- `WorkoutSummaryCard` prop `exceededExercises: { name: string; delta: number }[]` — produced by the filter in `summaryStats` memo using `(ex): ex is { name: string; delta: number; currentVol: number }` type guard ✓
- `WorkoutSession` used in `prevSession` memo — already imported at top of file ✓
- `WorkoutSet` used in `summaryStats` memo — already imported at top of file ✓
- `prevVolume: number | null` — `WorkoutSummaryCard` props and `summaryStats` return both use this type ✓
