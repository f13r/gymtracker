# The Active Exercise lives in the URL, addressed by exerciseId

The **Active Exercise** — the one Exercise within the **Active Session** that the logger is focused on — is held in the URL as the single source of truth, as a search param on the session route:

```
/workout/$sessionId?exercise=<exerciseId>
```

Previously the Active Exercise was a positional index (`activeExerciseIndex`) in an in-memory Zustand store (`workout.store.ts`). Because the index was neither persisted nor in the URL, a page refresh reset it to `0` and threw the user back to the first Exercise, even though the **Session** itself survived (its id is in the URL path and the server re-derives the Active Session from `finishedAt IS NULL`). The store and the URL were two sources of truth for "where the user is," and they drifted on reload.

**The Active Exercise is navigation state, not a domain attribute of the Session.** It is part of _where the user is in the app_, so it belongs in the URL — the same place the Session already lives — not on the Session row in the database and not in a client store.

**Addressed by `exerciseId`, never by position.** A Session is editable in place: the glossary's **Session** entry allows the user to add, remove, and reorder exercises mid-session. A positional index in the URL would point at a _different_ Exercise after a reorder or removal. An `exerciseId` survives both. It is also the only identifier available in **both** session modes: freeform Sessions have no `session_exercises` snapshot rows (their exercise list is derived from Sets, de-duped by `exerciseId`), so the snapshot row PK cannot serve as a universal identifier.

**The URL is honored literally — the logger never auto-picks an Exercise and never rewrites the URL.** The displayed Exercise is _exactly_ the one whose id matches `?exercise`, or nothing:

- **Param present, structure still loading:** show a loading state. Do **not** render a positional fallback (e.g. `exercises[0]`) — that was the source of a visible flicker on refresh: a legacy Session (no Snapshot) briefly exposes a Sets-only list that doesn't contain the param's id, so any fallback renders the wrong Exercise for a beat before correcting.
- **Param present and resolved to an Exercise in the Session:** render it.
- **Param absent, or present but not found once the structure has fully loaded** (stale id, removed mid-session, wrong Session): there is no Active Exercise — redirect to the **overview** (`/dashboard`). A missing param redirects immediately; an unresolved-but-present param redirects only after the Session and its Template have settled, so a slow load is never mistaken for an invalid id.

This is the user's model: _"no exercise chosen → dashboard; an exercise chosen → that one."_ The overview is where you are when no Exercise is focused; the logger is always focused on one specific Exercise.

**An earlier draft of this ADR specified the opposite** — auto-resolve a missing/stale param to the first not-done Exercise and `replace` the URL to pin it. That rule was removed: the auto-rewrite fought the async load (rewriting a valid param before the full structure arrived) and the positional fallback flickered. Honoring the URL literally and routing the empty case to the overview is simpler and has no race.

**History.** Entering the logger from the overview pushes a history entry; switching Exercise via the freeform prev/next uses `replace`. The redirect-to-overview for an empty/invalid param also uses `replace` (the bad URL should not sit in history). The browser/Android Back button therefore exits the logger to the overview rather than stepping back through every Exercise.

## Considered Options

- **Positional index in the URL (`?ex=2`):** rejected. Breaks under the in-session reorder/remove that the domain explicitly permits — the index silently re-binds to another Exercise.
- **Persist the index in the Zustand store (e.g. `localStorage`):** rejected. Survives refresh on one device but keeps a second source of truth alongside the URL — the exact drift that caused the bug — and isn't shareable or restorable from the URL.
- **Persist an `activeExerciseId` on the Session row (server-side):** rejected. Survives refresh and crosses devices, but makes a transient navigation concern a durable domain attribute, adds write traffic on every Exercise switch, and conflates "where the user is looking" with "what happened in the workout."
- **Snapshot row id (`session_exercises.id`) in the URL:** rejected. Truly unique even if the same Exercise appeared twice, but the row does not exist for freeform Sessions, so it cannot be the universal identifier.
- **Auto-resolve a missing/stale param to the first not-done Exercise + rewrite the URL (earlier draft, rejected):** raced the async load and flickered via the positional fallback (see above). Replaced by literal URL-honoring + redirect-to-overview.
- **`exerciseId` in a URL search param, URL as sole source of truth, honored literally (chosen):** robust to reorder/rename, identical handling for template and freeform Sessions, one source of truth, restorable by refresh, no rewrite race.

## Consequences

- `workout.store.ts`'s exercise machinery is removed: `activeExerciseIndex`, `nextExercise`, `prevExercise`, `resetExerciseIndex`, and the already-dead `activeSessionId` / `setActiveSession` (written but never read; the live Active Session comes from the server). Navigation now flows through `navigate({ search: { exercise } })`.
- The `/workout/$sessionId` route gains a validated optional `exercise` search param. `WorkoutLogger` derives `currentExercise` strictly by matching that id — no positional fallback — shows a loader until the structure (Session + Template) has settled, and redirects to `/dashboard` when the param is absent or resolves to nothing. It never rewrites the URL (except the freeform new-Exercise case below).
- The dashboard overview-tap navigates with `search: { exercise: id }` (push) instead of mutating the store; the freeform logger's prev/next buttons navigate by id (`replace`).
- **Legacy Sessions with no Snapshot** derive their exercise list from the **Template** (not Sets-only), so the logger's list matches the overview's and every exercise is addressable. The "structure settled" check therefore waits for the Template query before deciding a param is invalid.
- **Freeform "add a brand-new Exercise"** keeps an ephemeral local selection until its first Set is logged (it has no Set/Snapshot row yet); this counts as "chosen," so the empty-param redirect is suppressed while a fresh pick is pending, and the URL is pinned to the new `exerciseId` once the Set is logged.
- **A Session containing the same Exercise twice remains unrepresentable** (see the flagged ambiguity in `CONTEXT.md`). Identifying the Active Exercise by `exerciseId` inherits — but does not worsen — the logger's existing assumption that `exerciseId` is unique within a Session.
