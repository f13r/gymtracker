# Schedules and Sessions reference Workout Templates by id; the plan is snapshotted only into logged Sets

A **Schedule** and a **Session** both point at a **Workout Template** by `templateId` (a reference), rather than copying the Template's exercises at schedule/start time. The plan is materialised into concrete data only when the user logs a **Set** during a Session — those `sets` rows are the immutable snapshot. Consequently, **editing a Workout Template mutates it in place** (same `workout_templates.id`, replacing its `template_exercises`); it never creates a new Template row.

This means a Template edit propagates to all _future_ scheduled days that reference it (they read the edited Template when started), while _past_ logged workouts are unaffected because their Sets are already snapshotted. A session already in progress reads the Template live, so its not-yet-logged default values can shift, but anything already logged stays — accepted as a negligible edge case for a single user.

## Considered Options

- **Copy-on-schedule / copy-on-start (snapshot the plan onto the scheduled day):** rejected. It duplicates exercise data across every scheduled occurrence, so a Template edit would require rewriting many scheduled days to stay consistent, and stale copies would silently diverge from the Template.
- **Reference by id (chosen):** a future scheduled day is just intent + a pointer; the exercises are resolved at log time. One source of truth, edits propagate forward for free, and history is naturally immutable because it lives in logged Sets.

## Consequences

- Editing a Template must keep the same `workout_templates.id` — a new id would orphan every Schedule and Session `templateId` reference. The edit API is therefore `PATCH /templates/:id`, in place.
- Deleting a Template that future Schedules still reference needs handling (warn / cascade) — out of scope here, noted for the Schedule/Program work.
