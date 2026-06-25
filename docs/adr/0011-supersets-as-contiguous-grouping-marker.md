# Supersets are a grouping marker; contiguity is an editor rule, not a data-model one

A **Superset** — an ordered subset of a **Template**'s Exercises performed back-to-back, one Set each per round — is modelled as a **nullable `supersetGroup` marker** on the Template's exercise rows, not as a standalone entity. A shared id means "same Superset"; `null` means standalone. Order within a Superset comes from the existing `orderIndex`, so the 1→2→3→back-to-1 round-robin falls out of grouping + order with no new field.

This mirrors the documented precedent that **Equipment Type** is "an attribute on Exercise, not a standalone entity" (CONTEXT.md), and that a Template "contains an ordered list of Exercises" refined by `orderIndex`. A Superset is one more refinement of that ordered list, so no new table.

**`supersetGroup` rides through the Session Snapshot like every other structure attribute.** Per ADR-0008, structure is re-read from the Template at every Start and copied into session-owned rows; the logger then reads only its own data, never the live Template. `supersetGroup` is structure, so it sits alongside the snapshotted `orderIndex` / `equipmentId` on `sessionExercises` and is copied verbatim in `snapshotPlan()`. A **stable generated id** (not a recomputed ordinal) so a Superset keeps identity across edits and the snapshot is a verbatim column carry. The migration is **additive** — `ADD COLUMN … NULL` on both `templateExercises` and `sessionExercises`, null backfilling all existing rows cleanly (like `removedAt` in ADR-0008).

**The cycle predicate is "a remaining Planned Set" (`done = 0 AND removedAt IS NULL`), not "non-Done."** A **Removed Set** records a deliberate drop and is hidden from the logger; counting it as "owed" would cycle forever on a dropped exercise. The logger already builds `loggedSets` filtering `removedAt == null`, so a Removed Set is invisible to the cycle by construction and the existing `loggedSets.length > 0` guard protects an all-Removed member from being a rotation target.

**Termination returns to the Overview, and `allDone` is superset-aware.** When a Superset has zero remaining Planned Sets across **all** members, the logger fires the existing end-of-exercise affordance (`setAllDoneOpen` → `shouldRedirectToOverview` → Overview) rather than auto-jumping into the next group — there is no cross-group auto-jump precedent, and "no Active Exercise → Overview" is home base. Critically, the per-exercise `allDone` must NOT fire mid-cycle: it evaluates "every Set of every member of the `supersetGroup` is Done/Removed" before terminating. Standalone exercises (`supersetGroup == null`) keep today's exact per-exercise behavior.

**`supersetGroup` is stats-neutral.** Every metric (Volume, PR, e1RM, Last-Done Comparison, Streak) keys on Exercise + Done Sets + day and ignores order/grouping — no stats code changes. Session Repeat re-reads structure from the current Template at Start, so the snapshot copy carries grouping with no special handling. Program-generated Templates are ordinary Templates; the AI path emits no Supersets for this issue — the column simply stays null.

## The contiguity question

The open question (GATE #1 in the plan) was whether Superset members must be **contiguous** in `orderIndex` or may span non-adjacent rows. The "round-robin only makes sense for adjacent exercises" intuition is **false against this model**: the cycle iterates over group _membership_ by `orderIndex` and works identically whether or not other exercises sit between members. So contiguity is **not** a data-model requirement — it is purely an editor-interaction / rendering preference.

**Decision: require contiguity in the v1 editor, but record that the data model does not require it.** The editor expresses grouping contiguity-by-construction — a link control between adjacent rows joins neighbours, and a normalisation step re-derives valid contiguous runs (≥2 members) after every reorder/edit. This gives a simpler editor ("link a run of adjacent rows") and cleaner per-group color rendering (one solid block). Because the underlying model (`supersetGroup` id + `orderIndex`) already supports non-adjacent members, a future relaxation to non-adjacent Supersets is **pure UI with no migration**.

## Considered Options

- **Standalone Superset entity (own table, FK from exercises):** rejected. A Superset refines the Template's existing ordered exercise list; a separate table duplicates ordering and contradicts the Equipment Type precedent of modelling refinements as attributes, not entities.
- **Recomputed ordinal group index (e.g. "group 1, 2, …" by position):** rejected. A position-derived index changes identity on every reorder and is not a verbatim snapshot carry; a stable generated id keeps the Superset's identity across edits and lets `snapshotPlan()` copy one column unchanged.
- **A separate "in this Superset" boolean + order field:** rejected. `orderIndex` already answers "in what order"; only "which Superset" is new, so a single nullable id is the minimal addition.
- **Cycle predicate = "non-Done":** rejected. Counts Removed Sets as owed and loops forever on a deliberately-dropped exercise. "Remaining Planned Set" (`done = 0 AND removedAt IS NULL`) drops Removed and Done members out of rotation.
- **Auto-jump to the next Superset / next exercise when a group is exhausted:** rejected. No cross-group auto-jump precedent; returning to the Overview ("no Active Exercise → home base") matches ADR-0009's navigation model.
- **Enforce contiguity in the data model (derive `supersetGroup` from position, forbid gaps in schema):** rejected. Bakes a UI preference into the persistence layer and would require a migration to relax later. Keeping contiguity an editor rule leaves the model flexible.
- **Allow non-adjacent members in the v1 editor:** deferred, not rejected. The model supports it, but it complicates the editor interaction and color rendering for no requested benefit; the Template list would show a visually "broken" group. Left as a pure-UI future relaxation.
- **Nullable `supersetGroup` id marker + contiguity enforced only in the editor (chosen):** minimal additive migration, verbatim snapshot carry, stats-neutral, stable identity across edits, and a clean upgrade path to non-adjacent Supersets with no data change.

## Consequences

- Both `templateExercises` and `sessionExercises` gain a nullable `supersetGroup` column via an additive `ADD COLUMN … NULL` migration; all existing rows backfill to null (standalone).
- `TemplateExercise` and `SessionExercise` shared models and the create-Template DTO (`CreateTemplateSchema`) carry an optional/nullable `supersetGroup`; existing callers and Program-generated Templates omit it and the column stays null.
- `snapshotPlan()` copies `supersetGroup` onto session rows alongside `orderIndex` / `equipmentId`; Session Repeat inherits it for free because structure is re-read from the current Template at Start.
- The Template editor enforces contiguous membership and color-codes the list with a distinct accent per `supersetGroup` (cycling a small palette), standalone rows neutral.
- A pure `nextSupersetExercise(...)` selector in `packages/shared` owns the round-robin decision (advance / wrap / skip-exhausted / terminal); the logger wires it on the Set→Done transition via the existing `goToExercise(..., { replace: true })` path and sets no new persisted Session attribute.
- The logger's `allDone` becomes superset-aware: it fires only when every member of the `supersetGroup` has zero remaining Planned Sets; standalone exercises keep today's per-exercise behavior.
- **No stats query changes.** A finished Session's detail renders identically with or without grouping.
- **Deferred seams (no work now):** in-session formation/breaking of Supersets; AI-authored Supersets in Program-generated Templates; and the Program exercise-swap inheriting a slot's `supersetGroup`. Non-adjacent Supersets remain a pure-UI relaxation enabled by this model.
