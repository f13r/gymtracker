# Workout Logger Redesign + Workout Scheduling

## Overview

Two features:
1. Redesign `WorkoutLogger` so template-based workouts show pre-planned sets with per-set checkboxes and contextual prev/next exercise strips.
2. Add workout scheduling — one-time dates or recurring weekly days — with a full-screen prompt on scheduled days.

---

## Feature 1: Workout Logger Redesign

### Problem

When starting a session from a template, `WorkoutLogger` shows an empty state ("No exercise selected") because `exercises` is derived from `session.sets`, which is empty until the user manually logs a set. The user has to tap "Change" to pick an exercise before doing anything.

### New UX

Three-zone vertical layout:

```
┌─────────────────────────────────┐
│  ▲ PREVIOUS EXERCISE  3/3 ✓    │  ← tappable strip (hidden on first exercise)
├─────────────────────────────────┤
│  BENCH PRESS          2 of 5    │
│                                 │
│  S1  [80 kg] × [8]   [✓]        │  ← logged, immutable display
│  S2  [80 kg] × [8]   [✓]        │  ← logged, immutable display
│  S3  [80 kg] × [8]   [ ]        │  ← local state, editable, tap to check = log
│  S4  [80 kg] × [8]   [ ]        │  ← local state, editable
│                                 │
│  + Add set                      │  ← adds extra row beyond defaultSets
├─────────────────────────────────┤
│  ▼ SQUAT              4 sets   │  ← tappable strip (hidden on last exercise)
└─────────────────────────────────┘
```

When all sets for the current exercise are logged → bottom sheet appears:

```
"Bench Press done — move to Squat?"
[ Next Exercise ]   Skip
```

### Data Flow

**Exercise list source changes from `session.sets` → `template.exercises`:**

```ts
const exercises = useMemo(() => {
  if (!template) {
    // Free workout fallback: derive from session.sets (existing behavior)
    return exercisesFromSets(session?.sets, exerciseNameMap)
  }
  return template.exercises
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(te => ({
      id: te.exerciseId,
      name: exerciseNameMap[te.exerciseId] ?? 'Exercise',
      defaultSets: te.defaultSets ?? 3,
      defaultReps: te.defaultReps ?? 8,
      defaultWeightKg: te.defaultWeightKg ?? 0,
      isWarmup: !!te.isWarmup,
      loggedSets: session?.sets?.filter(s => s.exerciseId === te.exerciseId) ?? [],
    }))
}, [template, session, exerciseNameMap])
```

**Set rows per exercise:**

For each planned slot `i` in `[0 .. defaultSets - 1]`:
- If `loggedSets.find(s => s.setNumber === i + 1)` exists → show actual weight/reps, checkbox checked, row non-editable.
- Otherwise → show `defaultWeightKg` / `defaultReps` as local editable state, checkbox unchecked.

Extra logged sets beyond `defaultSets` (user added bonus sets) are appended after.

**Local state for unlogged sets:**

```ts
// keyed by `${exerciseId}-${setNumber}`
const [localSets, setLocalSets] = useState<Record<string, { weight: number; reps: number }>>({})
```

Initialized lazily from template defaults when a row first renders.

**Checking a set:**

Calls `setsApi.logSet` immediately with the row's current weight/reps. On success, `queryClient.invalidateQueries(['session', sessionId])` — the logged set appears via server state; local draft entry is cleared.

**All-done detection:**

```ts
const allDone = currentExercise.loggedSets.length >= currentExercise.defaultSets
```

When `allDone` transitions from false → true, open the "move to next?" bottom sheet.

### Component Structure

```
WorkoutLogger
├── TopBar                    (existing: timer, finish button)
├── PrevExerciseStrip         (new: name + completion, taps prevExercise())
├── CurrentExerciseView       (new)
│   ├── ExerciseHeader        (name, "N of M")
│   ├── SetRow × N            (new: weight input, reps input, checkbox)
│   ├── AddSetButton          (appends extra row to localSets)
│   └── AllDoneSheet          (bottom sheet when allDone, auto-advances)
└── NextExerciseStrip         (new: name + planned sets count, taps nextExercise())
```

`SetRow` owns its own `useState` for weight and reps (initialized from props), so each row is independently editable without lifting all draft state to the parent.

### Free Workout Fallback

If `template` is null (free workout), the top section keeps the existing "Change" picker button and "LOG SET" button. No strips, no pre-planned rows. This path is unchanged.

---

## Feature 2: Workout Scheduling

### Schema (new DB table)

```sql
CREATE TABLE workout_schedules (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id),
  template_id  TEXT REFERENCES workout_templates(id),
  type         TEXT NOT NULL CHECK(type IN ('once', 'weekly')),
  scheduled_date TEXT,   -- ISO date 'YYYY-MM-DD', only for type='once'
  day_of_week  INTEGER,  -- 0=Sun 1=Mon … 6=Sat, only for type='weekly'
  created_at   INTEGER NOT NULL
)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/schedules/today` | Returns the scheduled template for today, or null. Checks `once` where `scheduledDate = today` and `weekly` where `dayOfWeek = today.getDay()`. Excludes templates that already have a session started today. |
| `GET` | `/schedules` | Lists all schedules for the user |
| `POST` | `/schedules` | Creates a schedule |
| `DELETE` | `/schedules/:id` | Removes a schedule |

### Schedule Creation UI

Accessible from the template detail view via a "Schedule" button. Opens a bottom sheet:

```
┌──────────────────────────────────┐
│  Schedule "Push Day"             │
│                                  │
│  [ One time ]  [ Weekly ]        │  ← toggle
│                                  │
│  One time: date picker           │
│  Weekly:  [M] [T] [W] [T] [F]   │
│           [S] [S]                │
│                                  │
│  [  Save Schedule  ]             │
└──────────────────────────────────┘
```

Multiple weekly days can be selected (e.g. Mon + Wed + Fri = 3 separate `weekly` schedule rows, one per day).

Existing schedules for this template shown below the form with a delete button per entry.

### Dashboard Prompt

On app load, `DashboardPage` calls `GET /schedules/today`.

If a result is returned → render a full-screen overlay **before** the dashboard content:

```
┌──────────────────────────────────┐
│                                  │
│   Today: Push Day                │  ← template name
│   Monday · 3 exercises           │  ← day name + exercise count
│                                  │
│   [ Start Workout ]              │  ← primary, starts session, navigates to logger
│                                  │
│   Skip today                     │  ← text button, dismisses overlay
│                                  │
└──────────────────────────────────┘
```

"Skip today" stores the skipped templateId+date in `localStorage` so the prompt doesn't reappear on refresh within the same day.

---

## Implementation Order

1. **DB migration** — add `workout_schedules` table
2. **API** — schedules module (CRUD + `/today` endpoint)
3. **WorkoutLogger** — exercise list from template, SetRow component, prev/next strips, all-done sheet
4. **Schedule creation UI** — bottom sheet on template detail
5. **Dashboard prompt** — today's workout overlay
