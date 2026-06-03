# FitNotes CSV Import — Design

**Date:** 2026-06-03
**Goal:** Import a user's FitNotes (Android) workout history — including their exercises — into GymTracker via a one-off script.

## Source

FitNotes "Export Workouts to CSV". Validated against the user's real file
(`FitNotes_Export_2026_06_03_10_59_38.csv`, 860 data rows, UTF-8, 2025-06-04 → 2026-06-03).

Header (10 columns):
```
Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
```

### Critical parsing gotcha

**734 of 860 rows have UNQUOTED commas inside the Exercise name** (e.g.
`Тяга блока, широко`, `Біцепс, Крива штанга, стоячи`). Exercise names are Ukrainian and
embed variation/equipment descriptors. A naive comma split corrupts every such row.

**Robust rule:** every row has exactly the same 8 trailing columns and 1 leading column;
only `Exercise` is variable-width. So after a quote-aware parse:
- `Date = fields[0]`
- trailing 8 = `fields[length-8 .. length-1]` = Category, Weight, Weight Unit, Reps, Distance, Distance Unit, Time, Comment
- `Exercise = fields[1 .. length-9].join(',')`

`Comment` is always quoted, so the quote-aware parser collapses it to one field; `Category`
is a controlled vocabulary and never contains commas; numeric fields never do. So the
"join the middle" reconstruction is sound. Verified: 0 of 860 rows fail to parse.

## Mapping to schema

| FitNotes | GymTracker |
|---|---|
| each distinct `Date` | one `workout_sessions` row |
| each kept row | one `sets` row |
| each distinct `Exercise` name (trimmed) | one `exercises` row (`isDefault=0`, `equipmentType=null`) |

**Category map** (the 7 English categories in the file → `push/pull/legs/core/cardio/other`):

| FitNotes | → |
|---|---|
| Chest, Shoulders, Triceps | `push` |
| Back, Biceps | `pull` |
| Legs | `legs` |
| Abs | `core` |

Unknown categories → `other`, flagged in the dry-run report. Map keyed case-insensitively;
includes a few Ukrainian fallbacks (`груди→push`, `спина→pull`, `ноги→legs`, `прес→core`,
`кардіо→cardio`) for safety, though this file's categories are English.

### Session
- `startedAt` = `finishedAt` = the date at **local noon** (Unix seconds) — noon avoids
  timezone date-shift.
- `name` = derived from the day's mapped categories, e.g. "Pull", "Push / Legs"; fallback
  "Imported workout".
- `notes = 'Imported from FitNotes'` — the **idempotency tag**.

### Set
- `reps` ← Reps (null if blank), `weightKg` ← Weight (× 0.453592 if unit is `lbs`/`lb`;
  this file is `kgs` so no conversion), `durationSec` ← parsed `Time` (`H:MM:SS`).
- `done = 1`, `completedAt` = the date (these are completed historical sets).
- `setNumber` = incrementing per exercise within the session, in file order.
- `rpe = null`.
- **`notes` ← Comment** (see schema change below).

## Skip rule — "not actually done"

Skip any row with **no real training data**: not (reps > 0) AND not (weight > 0) AND
not (duration > 0). Verified against the file: this skips **24 rows** —
- All 16 Plank / Side Plank rows (weight 0, no reps, time `0:00:00`) → these two exercises
  are therefore **never created** (matches user intent: "I never did plank... do not import it").
- 8 stray empty rows across 7 real exercises (e.g. `Литки, тренажер` 12/14 kept) — those
  exercises survive on their remaining real rows.

Result: **30 exercises, ~836 sets, 31 sessions.** The dry-run reports skipped count and any
fully-dropped exercise so nothing is silent.

## Schema change

Add a nullable per-set notes column so FitNotes comments (`важко`, `не зміг`, …) attach 1:1
to their set. Per-set is the granular home — it rolls up to exercise and day, and the
Progression Suggestion / Program AI already reads `sets`, so the notes feed future coaching.

```ts
// drizzle/schema.ts — sets table
notes: text('notes'),
```
Plus a generated Drizzle migration (`drizzle-kit generate`).

## Code structure

- `apps/api/src/scripts/fitnotes-parser.ts` — **pure**, no DB: `parseFitnotesCsv(text)` and
  `buildImportPlan(rows)` → `{ exercises, sessions, sets, skipped, report }`. Unit-tested.
- `apps/api/src/scripts/fitnotes-parser.spec.ts` — vitest: comma-in-name reconstruction,
  skip rule, category map, lbs→kg, duration parse, BOM strip, blank fields.
- `apps/api/src/scripts/import-fitnotes.ts` — thin entrypoint: read file → parser → either
  print dry-run report (default) or, with `--commit`, write via `pg` Pool (mirrors
  `reset.ts`). Idempotency check lives here: skip any date already having a session tagged
  `Imported from FitNotes`.

## Running

Dry-run by default; `--commit` to write. Mirrors `reset.ts` (build then run compiled):
```
npm run import:fitnotes --workspace=apps/api -- ~/Downloads/FitNotes_Export.csv
npm run import:fitnotes --workspace=apps/api -- ~/Downloads/FitNotes_Export.csv --commit
```
(api `package.json`: `"import:fitnotes": "nest build && node -r dotenv/config dist/scripts/import-fitnotes.js"`)

## Idempotency

Re-runnable: on `--commit`, any date already having a session tagged `Imported from FitNotes`
is skipped, so a second run is a no-op (won't duplicate history).
