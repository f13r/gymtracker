# Sessions snapshot the plan at Start: structure from Template, numbers from last-done

Amends ADR-0007 (templates referenced, not snapshotted).

When a **Session** starts, it materialises its plan into **session-owned rows** — a **Session Snapshot** — instead of deriving the plan live from the Template on every render. The snapshot has two distinct sources:

- **Structure (exercise list, order, set count): from the Workout Template, re-read at every Start.** This preserves ADR-0007's core win — editing a Template (or a Coach/Program editing it) still propagates to all *future* Sessions, because each Start copies the current Template structure afresh. A **Schedule** for a future date remains a pure `templateId` reference (no copy until Start), exactly as ADR-0007 specified.
- **Numbers (reps/weight): from per-Exercise last-done.** Each Planned Set's reps/weight is seeded from the most recent finished Session in which that Exercise had a **Done** Set, matched by set position with carry-forward for positions the last-done didn't have; the Template default is used only the first time an Exercise is ever done. (A **Progression Suggestion** is the intended top tier above last-done but is temporarily turned off while statistics accumulate.)

**Sets become tri-state.** In addition to **Done** (`done = 1`) and **Planned** (`done = 0`), a Set can be **Removed** — soft-deleted via a non-null `removedAt`, hidden from the logger but retained in the database. There is no hard delete of a snapshotted Set.

**In-session edits are statistics-only.** Removing a Set or exercise, adding one, or changing a weight is recorded on the Session's own rows for that Session's planned-vs-done record, but never reshapes a future Session — structure always returns to the Template. To change the ongoing plan, the user (or Coach/Program) edits the Template.

## Why this differs from ADR-0007

ADR-0007 rejected copy-on-start and materialised the plan *only* when a Set was logged. That left the planned-but-not-logged slots (the logger's pending rows) existing purely as a live derivation with no database identity — so they could not be removed persistently, and a finished Session carried no record of what was *planned* versus what was *done*. The driving requirement here is **statistics**: real per-Set/rep/exercise rows are needed to analyse intended-vs-completed training and, later, to drive progression. ADR-0007's rejection reasoning was really about **Schedules** (copying onto every future occurrence causes divergence and forces multi-row rewrites on a Template edit); that reasoning does not apply to a Session being performed *now*, which has no future occurrence to diverge from. We therefore split the two: Schedules stay references; a Session snapshots at Start.

## Considered Options

- **Pure reference, materialise only on log (ADR-0007, superseded for Sessions):** rejected. No durable identity for planned sets → removal can't persist, and no planned-vs-done record for statistics.
- **Full snapshot chained from the previous Session of the same Template (a "workout chain"):** considered and rejected during design. It made the Template's contents vestigial after the first Session and let in-session edits permanently reshape future Sessions. The user wants the opposite: the Template (the Coach's plan) is the stable structure every time, and only the *numbers* follow history.
- **Snapshot at Start — structure from Template, numbers from last-done (chosen):** the Template stays authoritative for structure and edits propagate forward; history drives the load you start from; the Session owns durable rows for removal and statistics; in-session edits stay local to the Session.

## Consequences

- New table **`session_exercises`** holds the Session-owned ordered exercise list (`sessionId`, `exerciseId`, `orderIndex`, snapshotted `equipmentId`); `sets` gains a nullable `removedAt`. Migration is additive — existing `sets` backfill to `removedAt = null`, and history is not backfilled (finished Sessions keep deriving their exercise list from existing `sets` rows for display).
- The logger no longer renders template-derived "pending" placeholders; it renders the Session's own Planned Set rows. Removing one sets `removedAt` (persisted, cross-device) rather than adjusting client-only state.
- `getSession` must return the snapshot in a stable order; Removed Sets are excluded from the logger view but available to statistics queries.
- **Coach/Program changes to a Template's set count or reps/weight do propagate** for set count and exercise list (structure is re-read at Start) but **not** for reps/weight (those come from last-done). Reconciling Coach-prescribed load changes with last-done is deferred Program/progression work.
- Progression Suggestion is disabled in the current build; the Set Pre-population Hierarchy is `last-done → Template default` until it returns.
