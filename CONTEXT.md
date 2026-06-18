# GymTracker

A personal fitness tracking application for logging workouts, tracking body progress, and analysing training over time. Currently single-user (prototyping phase); multi-user with authentication is planned.

## Language

### Workout domain

**Exercise**:
A named movement (e.g. Bench Press, Squat) with a category and equipment type. Can be a default exercise (seeded at startup, shared as a starting library) or a custom exercise created by the user. Users may delete defaults and build their own library. May carry an Exercise Image and an optional reference `description`.
_Avoid_: movement, lift, activity

**Exercise Image**:
A single demonstration picture stored locally for an Exercise — the user's own uploaded photo, or (for the original defaults) the image carried over from the now-removed wger.de integration. Stored as a self-contained `.webp` on disk (orig + thumb), addressed via the Exercise's id, never hot-linked from a third party. Optional: an Exercise may have none. Shown in the active logger, the Template editor, and the exercise library. The Exercise also carries an optional plain-text `description` (reference/how-to text), distinct from the user's free-text `notes`.
_Avoid_: demonstration, media, wger image, thumbnail

**Category**:
The muscle-group classification of an Exercise: `push`, `pull`, `legs`, `core`, `cardio`, `other`.
_Avoid_: type, group, muscle group

**Equipment Type**:
The classification of apparatus an Exercise uses: `barbell`, `dumbbell`, `machine`, `bodyweight`, `cable`, `other`. An attribute on Exercise, not a standalone entity.
_Avoid_: equipment, gear, tool

**Equipment**:
A physical piece of gym apparatus photographed by the user, belonging to a Gym. Has a short `name` (e.g. "Left Cable Tower"), an Equipment Type, a free-text `description` (the hint the user provides to help the AI — also serves as a human-readable note), free-form `tags`, and a photo. Associated with one or more Exercises via a many-to-many join. A Set and a TemplateExercise may each optionally reference the Equipment used. Future: gif, YouTube link showing how to use it.
_Avoid_: machine, station, gear

**Equipment Analysis**:
The AI-driven step that accepts an Equipment photo and returns an Analysis Suggestion. Performed once per Equipment before it is saved. The user may re-enter Step 1 to retake the photo and trigger a fresh Analysis.
_Avoid_: AI scan, detection, recognition

**Analysis Suggestion**:
The structured output of an Equipment Analysis: a proposed Equipment name, tags, and a list of Suggested Exercises. The user reviews and edits the suggestion in Step 2 of the Add Equipment wizard before saving. The suggestion is ephemeral — it is never persisted; only the user's accepted/edited values are saved.
_Avoid_: AI result, scan result, prediction

**Progression Suggestion**:
An AI-generated load prescription for an upcoming Session: a specific Exercise, suggested sets, reps, and weight, with a human-readable reason and an array of evidence strings citing the actual training data behind it. Persisted (unlike an Analysis Suggestion which is ephemeral). Generated asynchronously (fire-and-forget) when a Session finishes — the finish request completes immediately, then a single AI call is made with all exercises from the session in one batch, returning all suggestions at once. One active Progression Suggestion per Exercise — replaced each time a new one is generated. For exercises without enough history, defaults to a conservative +2–3% increment with a note that suggestions will improve as more data accumulates. Distinct from an Analysis Suggestion (which is about what exercises to add); a Progression Suggestion is about how to perform exercises the user already trains.
_Avoid_: recommendation, auto-progression, coaching tip

**Set Pre-population Hierarchy**:
The priority order used to fill the reps/weight of a Session's Sets, evaluated **once at Start** when the Session Snapshot is materialised (not per-Set at log time, as it previously was). Note this governs **numbers only** — set count and the exercise list always come from the Template. Current model, per Exercise: (1) the **last-done** value for that Exercise — the reps/weight of its Sets the last time it was done in any finished Session; (2) the **Template** default, used the first time an Exercise is ever done. A **Progression Suggestion** is the intended top tier (overriding reps/weight where present) but is **temporarily turned off** while statistics accumulate — to be reintroduced above last-done later.
_Avoid_: default sets, seed weight

**Suggested Exercise**:
A single exercise proposed within an Analysis Suggestion. May match an existing Exercise in the user's library (by name, case-insensitive) or represent a new one to be created. The user can rename a Suggested Exercise before saving; if it matches an existing Exercise, renaming it also renames that Exercise in the library (with explicit confirmation). Deselecting a Suggested Exercise excludes it from the save entirely.
_Avoid_: recommended exercise, proposed exercise

**Template**:
A reusable workout plan: an ordered list of Exercises with default sets, reps, and weight. Used to pre-populate a Session. A Template can be created from scratch, edited, saved from a completed Session (planned), or generated by a Program. User-facing label is the full form **Workout Template**; "Template" is the short form used in prose and code. Never refer to a Template as a bare "Workout" — that word, when used at all, refers to the training act (the Session).
_Avoid_: plan, routine, workout (as a standalone label for the plan)

**Permanent Add**:
When the user adds an Exercise to an Active Session, an opt-in choice — surfaced as a checkbox "Add to `<Template name>` permanently" — to *also* append that Exercise to the **source Template**, so every future Session from that Template includes it. Default off: an unchecked add affects **this Session only** (the normal rule that in-session edits never reshape the Template). Available only when the Session has a `templateId` (Template-started or Session Repeat); hidden for a freeform Session, which has no Template to write to. The Template write commits when the user saves the add, not on selection.
_Avoid_: save to plan, pin exercise, promote

**Program**:
An AI-generated, multi-phase training prescription spanning weeks or months. Created once from a user intake (experience level, goal, training days per week). Contains an ordered list of Phases. Adapts over time: Phase duration can extend or compress based on performance signals; Exercises within a Phase's Templates can be swapped when adaptive resistance is detected. Only one Program is active per user at a time. A Program generates ordinary Templates (not owned — no special FK) and automatically creates weekly Schedules on the user's configured training days pointing to the correct Phase Templates. If the user deletes a Template that belongs to a Program, the system warns them that it will be removed from the Program before proceeding. Adaptation is evaluated automatically on every Session finish (fire-and-forget, same pattern as Progression Suggestions) and can also be manually re-triggered by the user from the Program view.
_Avoid_: plan, training plan, routine, schedule

**Program Update**:
A pending adaptation proposal generated by the Program's evaluation logic: a description of what would change (phase transition, exercise swap, deload prescription) with a reason. Surfaced to the user as a notification card requiring acknowledgement. The user can accept or dismiss. Templates and Schedules are only mutated after the user accepts. Never silently changed.
_Avoid_: recommendation, suggestion, alert

**Phase**:
A named block within a Program with a planned session count (e.g. 3 days/week × 8 weeks = 24 sessions — not calendar weeks), an internal `type` drawn from the existing training-phase vocabulary (`accumulation | strength | peaking | maintenance`), and a user-facing `name` generated by the AI (e.g. "Building Your Base"). A Phase has a split structure (e.g. full-body 3×/week, upper/lower 4×/week) and references a set of generated Templates. The Phase `type` is the machine-readable signal used to retrieve the right coaching knowledge chunks; the `name` is what the user sees. A Phase is complete when the user has finished its target session count — not when a calendar date arrives. Sessions started from a Program Schedule are tagged with the current Phase so progress is tracked accurately even if the user takes breaks.
_Avoid_: block, stage, period

**Session Repeat**:
A Session start mode where the user picks a previously finished Session from a calendar view (days with Sessions are marked) and starts a new one. A repeated Session **always carries the `templateId`** of the Session it repeats: **structure always comes from the Template** (exercise list and set count, re-read at Start), exactly as any Template-started Session. The chosen past Session supplies only the per-exercise **reps/weight** seed (overriding the usual last-done value with that specific session's numbers). It does **not** stand in for the Template as a structure source. Requires a new calendar UI surface; the current History page is a flat list grouped by month, not a calendar.
_Avoid_: copy workout, duplicate session, repeat workout

**Session**:
A single workout instance with a start time and optional finish time. May be started from a Template or created freeform. When started, the Session takes a **Session Snapshot** — materialising its plan into session-owned rows — and from then on reads only its own data, never the Template live. During a Session the user may add, remove, or reorder exercises and Sets freely; these edits live on the Session's own data and affect only this Session's record (see Removed Set), never the source Template and never a future Session.
_Avoid_: workout, log, training

**Session Snapshot**:
The session-owned rows materialised when a Session starts. **Structure comes from the Workout Template, every time**: the exercise list, their order, and the set count are copied from the Template (re-read at every Start, so Template / Coach edits — including changing the set count — propagate to all future Sessions). **Numbers come from history**: each Set's reps/weight is seeded per-Exercise from the last-done value for that Exercise (the Template default the first time an Exercise is ever done) — see Set Pre-population Hierarchy. The snapshot is the immutable record of what was planned versus done for that Session; because structure is always re-read from the Template, in-session edits never reshape a future Session.
_Avoid_: copy, materialised plan, instance

**Active Session**:
A Session whose `finishedAt` is null. Only one Session can be active at a time per user.
_Avoid_: open session, in-progress workout

**Active Exercise**:
The single Exercise within the Active Session that the user is currently logging — the one the logger is focused on. A navigation concept, not a persisted domain attribute of the Session: it is part of *where the user is in the app*, addressable so that a refresh returns the user to the same Exercise. There is **at most one** Active Exercise, and only while the user is in the logger: when none is chosen the user is at the **overview** (the list of all the Session's exercises), not in the logger. Choosing an Exercise from the overview makes it the Active Exercise; leaving the logger with none chosen returns to the overview. Distinct from **Exercise Done** (a completed-state of an Exercise's Sets) — the Active Exercise may be done, partially done, or untouched.
_Avoid_: current exercise, focused exercise, selected exercise

**Overview**:
The view of the Active Session as a whole — the ordered list of all its exercises with their progress — from which the user picks which Exercise to log. The home base of an in-progress Session: where the user is when no **Active Exercise** is chosen. Choosing an Exercise here opens the logger on it; finishing or leaving an Exercise returns here.
_Avoid_: dashboard, hub, summary

**Set**:
A single recorded effort within a Session for a given Exercise: reps, weight, RPE, or duration. A Set is in one of **three** states: **Done** (`done = 1`), **Planned** (`done = 0`, not removed), or **Removed** (soft-removed via a non-null `removedAt`). Removed Sets are hidden from the logger but retained in the database so statistics can tell a deliberately-dropped set apart from a missed one. There is no hard delete of a snapshotted Set.
_Avoid_: rep, effort, entry

**Done Set**:
A Set the user has marked as completed during the Session. Counts toward all performance stats (PRs, volume).
_Avoid_: completed set, finished set

**Exercise Done**:
The state an Exercise reaches within a Session when all of its Sets are marked done. A UI affordance — the logger surfaces this state visually. Not the trigger for Progression Suggestion generation (that fires at Session finish as a single batch).
_Avoid_: exercise completed, exercise finished

**Planned Set**:
A Set that was materialised into the Session Snapshot (set count from the Template, reps/weight from last-done) or added by the user, but not yet marked done and not Removed. Excluded from performance stats. A Planned Set that is still un-done when the Session finishes is a **Missed** Set — intended but not completed. Preserved for retrospective analysis (intended vs. completed) for this Session only; it does not shape the next Session, whose structure returns to the Template.
_Avoid_: undone set, pending set, skipped set

**Removed Set**:
A Set the user explicitly dropped from the Session by swiping it away. Soft-removed (a non-null `removedAt`; never hard-deleted) and hidden from the logger, but retained for statistics. Distinct from a **Missed** Planned Set (intended but not completed): a Removed Set records "I deliberately did not do this one today." Like all in-session edits, removal affects only this Session's record — it never changes a future Session, whose set count always returns to the Template. (A future statistic of "this set is consistently removed" could inform the Coach to amend the Template, but that is deferred Program/progression work, not an automatic plan change.)
_Avoid_: deleted set, skipped set, dropped rep

**RPE** (Rate of Perceived Exertion):
An optional 1–10 effort score logged per Set. Indicates subjective difficulty.
_Avoid_: effort, difficulty, exertion

**Volume**:
The performance metric computed as `reps × weight` summed per day for a given Exercise. Only Done Sets count. Cardio (duration-based) volume is not yet defined.
_Avoid_: total load, tonnage

**Personal Record (PR)**:
The maximum weight achieved for an Exercise across all Done Sets. Warmup exclusion from PRs is a known gap (currently all Done Sets are included; warmup filtering is planned).
_Avoid_: max, best, record

**Estimated 1RM (e1RM)**:
A derived estimate of the single-repetition maximum for an Exercise, calculated from weighted Done Sets (sets with a load and a moderate rep count). Distinct from a Personal Record (the heaviest weight actually lifted): a higher-rep lighter set can imply a higher e1RM than a heavy low-rep set. Undefined for bodyweight and cardio Exercises, where no estimate is produced. Used as a normalised strength signal fed to Progression Suggestion generation. It has no dedicated UI, but the LLM may reference it in a Progression Suggestion's evidence text (e.g. "estimated 1-rep max rose 118→123kg").
_Avoid_: one-rep max, 1RM, max strength, predicted max

**Adaptive Resistance**:
The state in which a specific Exercise has stopped producing strength gains despite sustained effort — its Estimated 1RM is flat or declining while perceived effort (RPE) rises. The per-Exercise trigger for an exercise-swap Program Update. Distinct from a systemic volume plateau (which calls for a deload, not a swap): adaptive resistance is localised to one stale movement.
_Avoid_: stall, sticking point

**Streak**:
The count of consecutive calendar days on which at least one Session was finished. Tracked as current streak and longest-ever streak.
_Avoid_: consistency, run

**Gym**:
A physical training location to which Users are associated and which owns Equipment. Equipment photographed at a Gym is shared by all Users associated with that Gym.
_Avoid_: location, facility, place

**User Profile**:
A user's stable lifestyle attributes used as context for Progression Suggestions and Program generation: age, height (cm), experience level (beginner / intermediate / advanced), goal (hypertrophy / strength / powerlifting / general), training phase (accumulation / strength / peaking / maintenance), specific training days of the week (e.g. Monday / Wednesday / Friday — stored as an array; count is derived), and preferred session duration in minutes. Stored as a single row per user. Captured at first launch (onboarding) and editable in Settings. Distinct from body weight (time-series) and health conditions (deferred). Optional — the AI can generate suggestions without it, but suggestions are less personalised. When a Program is active, `trainingPhase` is driven by the current Program Phase rather than set manually.
_Avoid_: health profile, user settings, physical stats

### Scheduling domain

**Schedule**:
A declaration of intent to train on a specific date (`once`) or on a recurring weekday (`weekly`). Has an optional exercise source: a Template, a past Session (Session Repeat), or neither (freeform — the intent to train with no predefined exercises). Past `once` Schedules are preserved (not deleted) so they can be compared against actual Sessions in retrospective views. A Session can be pre-planned for any future date using the same three start modes (freeform, Template, Session Repeat) — picking a future date creates a Schedule instead of starting a Session immediately.
_Avoid_: plan, appointment, reminder

**Today's Schedule**:
The Schedule (if any) whose date or day-of-week matches the current day and for which no Session has been started yet.
_Avoid_: upcoming schedule, today's plan

### Body progress domain

**Body Weight**:
A single body-weight measurement (kg) recorded at a point in time.
_Avoid_: weight entry, weigh-in

**Body Measurement**:
A full-body snapshot recording circumferences (chest, waist, hips, biceps, thighs, shoulders, neck) at a point in time. Recorded as a whole snapshot, not as individual field updates.
_Avoid_: measurements log, body stats

**Progress Photo**:
A photo uploaded by the user with an optional body weight, free-form tags, and notes. Tags are currently free-form strings; a predefined tag set (e.g. front, back, side) is planned.
_Avoid_: photo log, body photo

### Stats domain

**Frequency**:
The count of finished Sessions per calendar week. Used to track training consistency over time.
_Avoid_: sessions per week, training frequency

## Flagged ambiguities — Program domain

- **"Program update timing"**: Adaptation is evaluated on Session finish. Resolved: at most one Program Update is pending at a time. When multiple signals coincide (several Adaptive Resistance flags, a phase-level plateau, phase completion), the evaluation surfaces only the single highest-priority action. The pending update is shown before the next Session can start.
- **"Multiple active Programs"**: Resolved as one active Program per user. What constitutes "active" (status field: `active | completed | abandoned`) is yet to be defined precisely.
- **"Session tagging"**: Sessions started from a Program Schedule are tagged with a Phase. Sessions started freeform while a Program is active are not tagged — they still count toward Progression Suggestions but not toward Phase completion.

## Relationships

- A **Template** contains an ordered list of **Exercises** with default Sets; each TemplateExercise may optionally reference a specific **Equipment** (coach-prescribed machine)
- A **Session** may be started from a **Template** or freeform; at Start it takes a **Session Snapshot** and is fully editable thereafter on its own data
- A **Session Snapshot** owns the Session's ordered exercise list (its structure copied from the Template at Start) and its **Sets**; structure (exercise list + set count) comes from the Template every Start, reps/weight from per-Exercise last-done (see **Set Pre-population Hierarchy**)
- A **Session** contains zero or more **Sets**, each belonging to one **Exercise**; a Set may optionally reference the **Equipment** used
- A **Set** is **Done**, **Planned**, or **Removed**; only Done Sets count toward **PRs**, **Volume**, and **Streak**; Removed Sets are soft-deleted (`removedAt`) and retained for statistics
- In-session edits (remove/add Sets or exercises, change weight) affect only that Session's record; they never reshape a future Session, whose structure returns to the **Template**
- A **Planned Set** is preserved after Session finish for retrospective comparison against the **Schedule** (intended vs. completed)
- A **Schedule** optionally references a **Template**, a past **Session** (Session Repeat source), or neither (freeform); it resolves to a **Today's Schedule** if its date/day matches today and no Session has been started
- A **Program** belongs to one **User**; one active Program per user; contains an ordered list of **Phases**; generates ordinary **Templates** and weekly **Schedules** on the user's configured training days; evaluated for adaptation on every Session finish and on manual re-trigger
- A **Phase** belongs to one **Program**; references one or more **Templates** (one per split day); tracks completion by counting finished **Sessions** tagged with its ID; complete when finished session count reaches its target
- A **Program Update** belongs to one **Program**; pending until the user accepts or dismisses; Templates and Schedules are only mutated on acceptance
- A **Session** started from a Program **Schedule** is tagged with the current **Phase**; freeform Sessions are not tagged
- A **Progression Suggestion** belongs to one **Exercise** and one **User**; one active suggestion per exercise, replaced on each Session finish; pre-populates weight/reps in the logger ahead of last-done Sets and Template defaults
- A **User Profile** belongs to one **User** and provides physical context (age, height, experience level) for Progression Suggestions
- A **Progress Photo** optionally records **Body Weight** at the time of the photo
- A **Gym** owns zero or more **Equipment** records; a User is associated with exactly one Gym (multi-Gym deferred)
- **Equipment** and **Exercise** are linked many-to-many; one Equipment can support many Exercises, one Exercise can be performed on many Equipment instances

## Example dialogue

> **Dev:** "If the user adds extra exercises during a Session, does the original Template change?"
> **Domain expert:** "No — the Template is never mutated. The Session is a live document; the Template is just the starting point."

> **Dev:** "Should we count the 5th set if the user didn't mark it done?"
> **Domain expert:** "Exclude it from PRs and Volume. But keep it — it's a Planned Set. We'll use it in the monthly retrospective to show what was missed."

> **Dev:** "What happens to a once Schedule from last week?"
> **Domain expert:** "It stays in the database. We'll need it to show the planned-vs-completed summary for that week."

## Flagged ambiguities

- **"warmup"**: `isWarmup` existed on Sets and TemplateExercises but has been removed. The concept may return with a better model in the future.
- **"cardio volume"**: `reps × weight` is undefined for duration-based exercises. Cardio volume is deferred; no canonical definition exists yet.
- **"default exercise"**: Initially meant globally shared and immutable, but the correct intent is: a convenience starting library that users can delete and replace with their own exercises.
- **"same Exercise twice in a Session"**: The logger identifies an Exercise within a Session by its `exerciseId` (and the **Active Exercise** is addressed by `exerciseId`). A Session containing the same Exercise twice (e.g. a Template listing it twice, or a freeform add of an already-present Exercise) is therefore not currently representable in the logger — the two entries collide. Unsupported today; no canonical model for repeated Exercises within one Session yet.

## Planned features

- **Category-level Progression Suggestion context**: When generating Progression Suggestions, the AI batch currently receives only the exercises in the finished Session. The planned enhancement is to also pull 4-week historical data for all exercises sharing the same Category as each exercise being suggested — so if today's session has only Bench Press, the AI still sees Incline Press and Cable Fly volume from recent sessions to reason about total chest load. This prevents spurious "increase weight" suggestions when the muscle group is already heavily loaded across multiple exercises on different days.
