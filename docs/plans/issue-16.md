# Issue #16 — Create superset functionality

## Overview

Let a user group two-or-more Exercises in a Workout Template into a **Superset** —
an ordered subset performed back-to-back, one Set each per round-robin round. Two
user-facing payoffs:

1. **Template editor**: create one or more Supersets within a Template, with the
   list color-coding which Exercises are standalone and which belong to which
   Superset (issue #16: "show what is normal and what is superset … use colors";
   "One workout template can have more than one superset").
2. **Logger round-robin**: marking a Set Done inside a Superset auto-advances the
   **Active Exercise** to the next member, wrapping back to the first member that
   still owes a **Planned Set**; when the whole group is exhausted, return to the
   **Overview** (issue #16: "click done set → switch to second … click done on
   second → switch to third (or if only two — get back to first)").

A Superset is modelled as a **grouping marker, not a standalone entity**: a
nullable `supersetGroup` id on the Template's exercise rows that is copied into
the Session Snapshot at Start and read from the Session thereafter. It is
**structure, not numbers** — orthogonal to every performance metric, so no stats
code changes.

## Context

Issue: https://github.com/f13r/gymtracker/issues/16 ("Create superset functionality")

Grill⇄BA transcript (6 rounds): `.ralph/scratch/issue-16.qa.md`

No prior superset work exists anywhere in the repo: `grep -ri superset` across
docs and code is empty; the only closed issue (#8) is unrelated. So nothing below
re-litigates a settled decision.

### Decisions made (each cited)

- **Adopt "Superset" as the single canonical term for 2+ Exercises.** The user
  uses "superset" in #16's title and body; CONTEXT.md's glossary convention is to
  pick one canonical term and list rejected synonyms under `_Avoid_`. Fold tri-set
  / giant set into "a larger Superset" — no separate term. `_Avoid_: circuit,
  tri-set, giant set, drop set` (note "drop set" is a genuinely different concept,
  same Exercise descending load — listing it flags it out of scope). — Round 1
  (issue #16; CONTEXT.md glossary `_Avoid_` convention across entries).

- **Structural grouping, not a standalone entity.** Mirrors the documented
  precedent that **Equipment Type** is "an attribute on Exercise, not a standalone
  entity" (CONTEXT.md). A Superset refines the Template's ordered exercise list
  (like `orderIndex`), so no new table. — Round 1 (CONTEXT.md Equipment Type;
  Relationships "A Template contains an ordered list of Exercises").

- **One nullable `supersetGroup` column on BOTH `templateExercises` and
  `sessionExercises`; stable generated id, null = standalone.** Per ADR-0008,
  structure is re-read from the Template at every Start and copied into
  session-owned rows; the logger then reads only its own data, never the live
  Template. `supersetGroup` is structure, so it rides alongside the existing
  snapshotted `orderIndex` / `equipmentId` on `sessionExercises`. A stable id (not
  a recomputed ordinal) so a Superset keeps identity across edits and the snapshot
  is a verbatim column carry. Additive migration — null backfills all existing rows
  cleanly (like `removedAt` in ADR-0008). — Rounds 1–2 (ADR-0008:7,12,26;
  CONTEXT.md Session/Session Snapshot; schema.ts:33-42, 76-82; models.ts:26-35,
  66-72).

- **Order within a Superset comes from the existing `orderIndex`.** `supersetGroup`
  answers "which Superset," `orderIndex` answers "in what order" — the
  1→2→3→back-to-1 cycle falls out of grouping + order with no new field. — Rounds
  1–2 (issue #16; CONTEXT.md `orderIndex` on both exercise tables).

- **Logger round-robin advance, driven by the Set→Done transition.** On marking a
  Set Done, advance the Active Exercise (the URL `?exercise=`, ADR-0009) to the
  next member of the same `supersetGroup` by `orderIndex`, wrapping to the first
  member with a remaining **Planned Set**, never skipping an exercise that still
  owes a Planned Set. This is a pure navigation move via the existing
  `goToExercise(..., { replace: true })` path; it sets **no** new persisted Session
  attribute. This is genuinely new behavior — the logger has no per-Set
  auto-advance today (`nextExercise()` is user-driven). Gated on
  `supersetGroup != null`; standalone exercises behave exactly as today. — Round 2
  (issue #16; ADR-0009; CONTEXT.md Active Exercise; useWorkoutLogger.ts:34-35,
  165-168).

- **Cycle predicate = Planned Set remaining (`done=0 AND removedAt IS NULL`), NOT
  "non-Done."** A **Removed Set** records a deliberate drop and is hidden from the
  logger; counting it as "owed" would cycle forever on a dropped exercise. The
  logger already builds `loggedSets` filtering `removedAt == null`, so "next member
  with a remaining Planned Set" = "next member whose `loggedSets` has a `!done`
  entry" — Removed Sets are invisible by construction; the existing
  `loggedSets.length > 0` guard already protects an all-Removed exercise from being
  a rotation target. — Round 3 (CONTEXT.md Set tri-state / Planned / Removed;
  ADR-0008:10,12,27; useWorkoutLogger.ts:105-108,137,193-196).

- **Terminate to the Overview; make `allDone` superset-aware.** When the group has
  zero remaining Planned Sets (every member's Sets Done or Removed), fire the
  existing end-of-exercise affordance (`setAllDoneOpen` → `shouldRedirectToOverview`
  → Overview) rather than auto-jumping into the next group — there is no
  cross-group auto-jump precedent, and "no Active Exercise → Overview" is home
  base. Critically, the current per-exercise `allDone` must NOT fire mid-cycle: it
  must evaluate "every Set of every member of the `supersetGroup` is Done/Removed"
  before terminating. Standalone (`supersetGroup == null`) keeps today's
  per-exercise behavior. — Rounds 2–3 (CONTEXT.md Overview / Active Exercise;
  useWorkoutLogger.ts:157-158,193-196).

- **Per-group color, not a single "is-superset" accent.** #16 requires both "show
  what is normal and what is superset" AND "more than one superset" per Template;
  a single accent cannot separate two groups. Assign a distinct accent per
  `supersetGroup` (cycling a small palette), standalone exercises neutral. — Round
  4 (issue #16; **GROUNDED, no human needed**).

- **Template-only scope.** #16 asks only to "create supersets in workout
  templates." In-session formation/breaking of Supersets is unrequested and
  deferred, consistent with grouping being snapshotted from the Template. — Round 4
  (issue #16; ADR-0008; **GROUNDED, no human needed**).

- **`supersetGroup` is stats-neutral and flows through the other structure sources
  for free.** Every metric (Volume, PR, e1RM, Last-Done Comparison, Streak) keys on
  Exercise + Done Sets + day and ignores order/grouping — no stats code changes.
  **Session Repeat** re-reads structure from the current Template at Start, so the
  snapshot copy carries grouping with no special handling (and grouping comes from
  the current Template, never the repeated past Session). **Program-generated
  Templates** are ordinary Templates; the AI path emits no Supersets for this issue
  — the column simply stays null (AI-authored supersets deferred). — Round 5
  (CONTEXT.md Volume/PR/e1RM/Last-Done/Streak; CONTEXT.md Session Repeat; CONTEXT.md
  Program generates ordinary Templates).

### Decisions needed from human

**GATE #1 — Contiguity constraint (blocks Task 2; informs Task 1's CONTEXT.md term
and whether Task 5 writes an ADR).** Must Superset members be **contiguous** in
`orderIndex`, or may a Superset span non-adjacent rows? Nothing settles this — no
ADR, no CONTEXT.md statement, no closed issue, no code precedent, and #16 is
silent. The grill's "round-robin only makes sense for adjacent exercises" rationale
is **false against our own locked model**: the cycle iterates over group
*membership* by `orderIndex` and works identically whether or not other exercises
sit between members. So contiguity is **not** a data-model requirement — it is
purely an editor-interaction / rendering preference:

- *Require contiguous* → editor = "select a run of rows → group"; `supersetGroup`
  derivable from position; one solid color block per group; matches the physical
  "back-to-back" intuition.
- *Allow non-adjacent* → more flexible; the model supports it natively; members
  render back-to-back at log time via the cycle regardless of Template position,
  but the Template list shows a visually "broken" group.

**Recommendation to the human:** require contiguity for v1 (simpler editor, cleaner
color rendering), but record in the CONTEXT.md Superset term that the *data model*
does not require it — so non-adjacent Supersets remain a pure UI relaxation later
with no migration. If contiguity is adopted as a real rule, write an ADR (Task 5);
if not, the term note suffices. — Round 4 (ba: NEEDS-HUMAN).

## Success criteria

- A nullable `supersetGroup` column exists on both `templateExercises` and
  `sessionExercises`; the migration is additive and existing rows backfill to null.
- The Template editor can place 2+ exercises into a Superset and into more than one
  distinct Superset, can ungroup, and persists `supersetGroup` on save; standalone
  exercises save with `supersetGroup = null`.
- The Template editor color-codes the list: a distinct accent per `supersetGroup`
  (cycling a small palette), standalone exercises neutral.
- Starting a Session copies each exercise's `supersetGroup` into `sessionExercises`
  verbatim (Session Repeat included); the logger reads grouping from the Session,
  never the live Template.
- In the logger, marking a Set Done inside a Superset advances the Active Exercise
  to the next member with a remaining Planned Set, wrapping to the first; it never
  advances past a member that still owes a Planned Set, and a Removed Set never
  keeps the cycle alive.
- When a Superset has no remaining Planned Sets, the logger surfaces the
  end-of-exercise affordance and returns to the Overview — and the per-exercise
  `allDone` does NOT fire mid-cycle.
- A standalone exercise (`supersetGroup == null`) behaves exactly as today (no
  per-Set auto-advance; per-exercise `allDone` unchanged).
- No change to any stats query (Volume / PR / e1RM / Last-Done Comparison /
  Streak); finished-Session detail renders identically with or without grouping.
- CONTEXT.md gains a **Superset** term and a Relationships line; the contiguity
  decision is recorded (and an ADR added iff contiguity is adopted as a rule).
- `apps/api` and `packages/shared` vitest suites pass; `pnpm --filter
  @gymtracker/web lint` + web build pass; `react-doctor` regression is clean for
  changed web files.

---

### Task 1: [tdd] Carry `supersetGroup` through the data model and Session Snapshot

The data-model spine: add the nullable column to both tables, thread it through the
shared types and the create-Template DTO, and copy it at snapshot time. The
verifiable behavior — "the snapshot carries grouping" — lives in `apps/api`, which
has vitest (`workouts.service.spec.ts`), so this slice is test-first.

- [ ] **Red:** extend `apps/api/src/workouts/workouts.service.spec.ts` (or the
      relevant snapshot test) to assert that `snapshotPlan()` copies each template
      exercise's `supersetGroup` into the created `sessionExercises` row verbatim
      (including a mix of a null/standalone exercise and 2+ exercises sharing a
      group id). Also assert null backfill behaves (a Template with no grouping →
      all-null session rows). Run; confirm it fails.
- [ ] Add nullable `supersetGroup` to the Drizzle schema on **both**
      `templateExercises` (`apps/api/src/drizzle/schema.ts:33-42`) and
      `sessionExercises` (`schema.ts:76-82`). Use a stable id type consistent with
      the existing id columns (integer/serial-style or text — match the codebase's
      grouping-id convention; it is an opaque shared marker, null = standalone).
- [ ] Generate the additive migration (`drizzle-kit generate`) into
      `apps/api/src/drizzle/migrations/`; verify the generated SQL is a pure
      `ADD COLUMN … NULL` on both tables (no data rewrite, no NOT NULL).
- [ ] Add `supersetGroup: <id> | null` to `TemplateExercise`
      (`packages/shared/src/models.ts:26-35`) and `SessionExercise`
      (`models.ts:66-72`).
- [ ] Add `supersetGroup` (optional/nullable) to the create-Template exercise
      object in `CreateTemplateSchema`
      (`packages/shared/src/workout.schema.ts:3-17`) so the editor can persist it.
      Keep it optional so existing callers and Program-generated Templates omit it
      (column stays null).
- [ ] Copy `supersetGroup` in `snapshotPlan()`
      (`apps/api/src/workouts/workouts.service.ts:283-347`, alongside the existing
      `orderIndex` / `equipmentId` copy at ~313-319) so it lands on the
      `sessionExercises` rows. Ensure `createTemplate` / `updateTemplate` /
      `addTemplateExercise` persist the field from the DTO onto
      `templateExercises`.
- [ ] **Green:** run `apps/api` + `packages/shared` vitest; confirm the new
      assertions pass and no existing test regresses.
- [ ] Confirm **no stats code reads `supersetGroup`** (grep stats utils /
      services) — it must stay structure-only (Decisions: stats-neutral).
- [ ] Do NOT touch the editor UI or the logger here — those are Tasks 2–4.

### Task 2: [direct] Template editor — group exercises into Supersets with per-group color

**Blocked on GATE #1 (contiguity).** Build the editor interaction that assigns
`supersetGroup` and the per-group color coding. `apps/web` has no test runner, so
this is `[direct]` — verified by build + lint + `react-doctor` + visual check.

- [ ] **Confirm GATE #1 is resolved** before starting. If contiguity is required,
      express grouping as "select a contiguous run of rows → group" and derive/keep
      `supersetGroup` consistent with position on reorder. If non-adjacent is
      allowed, grouping is a free assignment of a group id to any rows. Implement
      the decided rule; do not invent one.
- [ ] Add `supersetGroup: <id> | null` to the `ExerciseRow` state in
      `apps/web/src/components/workout/TemplateForm.tsx:33-42`.
- [ ] Add UI to form a Superset from selected rows, to add a row to / remove a row
      from a group, and to ungroup. Generate a stable group id per Superset (so two
      Supersets in one Template are distinct). Reuse the existing dnd-kit reorder
      (`handleDragEnd`, ~229-239); if contiguity is required, keep groups contiguous
      across reorders (or block a reorder that would break a group).
- [ ] Color-code the list: a **distinct accent per `supersetGroup`** cycling a
      small palette, standalone rows neutral/default (Decisions: per-group color).
      Make the accent legible and reuse existing design tokens; ensure two groups in
      one Template are visually separable.
- [ ] Include `supersetGroup` in the `CreateTemplateDto` save loop
      (`TemplateForm.tsx:246-264`, alongside `orderIndex: i`), null for standalone.
- [ ] Verify visually via the create and edit routes
      (`workout.template.new.tsx`, `workout.template.$templateId.tsx`): create a
      Template with two distinct Supersets + at least one standalone exercise, save,
      reload, confirm grouping + colors round-trip; ungroup and confirm it reverts
      to neutral and saves null.
- [ ] Run `pnpm --filter @gymtracker/web lint`, the web build, and the
      `react-doctor` regression check on the changed files.

### Task 3: [tdd] Round-robin selection logic (pure, in `packages/shared`)

Extract the cycle's decision into a pure, exhaustively-testable selector placed in
`packages/shared` (which has vitest), so the hairy edge cases (wrap, exhausted
group, Removed-only member, standalone) are nailed down test-first before any
React wiring.

- [ ] **Red:** add a test file in `packages/shared/src` for a pure
      `nextSupersetExercise(...)` (name to match repo conventions). Given the
      Session's exercises (each with `exerciseId`, `supersetGroup`, `orderIndex`)
      plus per-exercise Planned-Set info (a `!done && removedAt == null` remaining
      flag) and the current `exerciseId`, it returns the next `exerciseId` to focus
      or a terminal signal. Cover:
      - advance to the next member by `orderIndex` that has a remaining Planned Set;
      - wrap to the first member with a remaining Planned Set when at the last;
      - never advance to / wrap onto a member with no remaining Planned Set
        (Done or all-Removed — drops out of rotation);
      - return the terminal/Overview signal when the whole group has zero remaining
        Planned Sets;
      - return null/no-op when the current exercise's `supersetGroup` is null
        (standalone — caller does nothing new);
      - two-member group: A done → B; B done with A still owing → back to A.
- [ ] Implement the pure selector to make the tests pass. Predicate is strictly
      **Planned Set remaining** (`done=0 AND removedAt IS NULL`); membership is "same
      `supersetGroup`," ordering is `orderIndex` (Decisions: cycle predicate;
      order). No DOM, no navigation, no persistence in this function.
- [ ] **Green:** run `packages/shared` vitest; all cases pass.

### Task 4: [direct] Wire the selector into the logger and make `allDone` superset-aware

Connect Task 3's pure logic to the live logger. `apps/web` has no test runner →
`[direct]`, verified by build + lint + `react-doctor` + manual logger walkthrough.

- [ ] On the Set→Done transition, when the current exercise's `supersetGroup != null`,
      call `nextSupersetExercise(...)` and navigate via the existing
      `goToExercise(..., { replace: true })` path
      (`useWorkoutLogger.ts:34-35`) to the returned `exerciseId`. This is a pure
      navigation move — set **no** new persisted Session attribute (Decisions:
      round-robin advance; ADR-0009).
- [ ] Build the selector's input from the existing `loggedSets`
      (`useWorkoutLogger.ts:105-108,137`, already filtered `removedAt == null`) so
      Removed Sets are invisible to the cycle and the `loggedSets.length > 0` guard
      protects an all-Removed member (Decisions: cycle predicate).
- [ ] Make the `allDone` check (`useWorkoutLogger.ts:193-196`) superset-aware: for
      a member of a Superset it must NOT fire until **every** member of the
      `supersetGroup` has zero remaining Planned Sets; only then fire
      `setAllDoneOpen(true)` → `shouldRedirectToOverview` (157-158) → Overview. For a
      standalone exercise (`supersetGroup == null`) keep today's exact per-exercise
      behavior (Decisions: terminate to Overview).
- [ ] Confirm `nextExercise()` (`useWorkoutLogger.ts:165-168`) and all standalone
      flows are unchanged — the new advance is additive and gated on
      `supersetGroup != null`.
- [ ] Manual walkthrough: start a Session from a Template with one 3-exercise
      Superset + a standalone. Mark Set 1 of A Done → focus jumps to B; B → C; C →
      back to A round 2; verify wrap skips a member whose Sets are all Done; Remove
      the last Planned Set of a member mid-cycle → it drops out; finish the group →
      end-of-exercise affordance + return to Overview, NOT mid-cycle. Confirm the
      standalone exercise has no per-Set auto-advance.
- [ ] Run `pnpm --filter @gymtracker/web lint`, the web build, and `react-doctor`
      on the changed files.

### Task 5: [direct] Document the Superset term and (iff contiguity) an ADR

Lock the language and the contiguity decision into the project's canonical docs.

- [ ] Add a **Superset** entry to CONTEXT.md (Workout domain section): "An ordered
      subset of a Template's Exercises performed back-to-back, one Set each per
      round. Represented as a nullable `supersetGroup` marker on a Template's
      exercises (shared id = same Superset; null = standalone), not a standalone
      entity — order within the group comes from the existing exercise order. A
      Template may contain multiple Supersets. Like all structure, the grouping is
      copied into the Session Snapshot at Start and read from the Session
      thereafter." `_Avoid_: circuit, tri-set, giant set, drop set` (Decisions:
      canonical term).
- [ ] Record the **GATE #1 contiguity** outcome in that term: state explicitly that
      the data model (`supersetGroup` id + `orderIndex`) does **not** require
      contiguity, and whether v1 enforces it as an editor rule — so a future
      non-adjacent relaxation is pure UI, no migration.
- [ ] Add a CONTEXT.md Relationships bullet: a Template's Exercises may be grouped
      into Supersets via `supersetGroup`; the grouping is snapshotted into the
      Session at Start and is stats-neutral.
- [ ] **Iff GATE #1 adopts contiguity as a real rule**, add an ADR under
      `docs/adr/` (next number after 0010) capturing the choice, the rejected
      non-adjacent alternative, and the note that it is a UI constraint not a
      data-model one. If non-adjacent is chosen, the CONTEXT.md term note suffices —
      no ADR.
- [ ] Note the deferred seams already identified (no work now): in-session
      formation/breaking of Supersets; AI-authored Supersets in Program-generated
      Templates; and the Program exercise-swap inheriting a slot's `supersetGroup`
      (Decisions: Template-only scope; stats-neutral / Program seam).
