# GymTracker

A personal fitness tracking application for logging workouts, tracking body progress, and analysing training over time. Currently single-user (prototyping phase); multi-user with authentication is planned.

## Language

### Workout domain

**Exercise**:
A named movement (e.g. Bench Press, Squat) with a category and equipment type. Can be a default exercise (seeded at startup, shared as a starting library) or a custom exercise created by the user. Users may delete defaults and build their own library.
_Avoid_: movement, lift, activity

**Category**:
The muscle-group classification of an Exercise: `push`, `pull`, `legs`, `core`, `cardio`, `other`.
_Avoid_: type, group, muscle group

**Equipment**:
The apparatus an Exercise uses: `barbell`, `dumbbell`, `machine`, `bodyweight`, `cable`, `other`.
_Avoid_: gear, tool

**Template**:
A reusable workout plan: an ordered list of Exercises with default sets, reps, and weight. Used to pre-populate a Session. A Template can be created from scratch or (planned) saved from a completed Session.
_Avoid_: program, plan, routine

**Session**:
A single workout instance with a start time and optional finish time. May be started from a Template or created freeform. During a Session the user may add, remove, or reorder exercises freely regardless of the source Template.
_Avoid_: workout, log, training

**Active Session**:
A Session whose `finishedAt` is null. Only one Session can be active at a time per user.
_Avoid_: open session, in-progress workout

**Set**:
A single recorded effort within a Session for a given Exercise: reps, weight, RPE, or duration. A Set is either **done** (`done = 1`) or **planned** (`done = 0`).
_Avoid_: rep, effort, entry

**Done Set**:
A Set the user has marked as completed during the Session. Counts toward all performance stats (PRs, volume).
_Avoid_: completed set, finished set

**Planned Set**:
A Set that was pre-populated (from a Template) or added by the user but not yet marked done. Excluded from performance stats but preserved for retrospective analysis (to show what was intended vs. what was completed).
_Avoid_: undone set, pending set, skipped set

**RPE** (Rate of Perceived Exertion):
An optional 1–10 effort score logged per Set. Indicates subjective difficulty.
_Avoid_: effort, difficulty, exertion

**Volume**:
The performance metric computed as `reps × weight` summed per day for a given Exercise. Only Done Sets count. Cardio (duration-based) volume is not yet defined.
_Avoid_: total load, tonnage

**Personal Record (PR)**:
The maximum weight achieved for an Exercise across all Done Sets. Warmup exclusion from PRs is a known gap (currently all Done Sets are included; warmup filtering is planned).
_Avoid_: max, best, record

**Streak**:
The count of consecutive calendar days on which at least one Session was finished. Tracked as current streak and longest-ever streak.
_Avoid_: consistency, run

### Scheduling domain

**Schedule**:
A declaration of intent to train on a specific date (`once`) or on a recurring weekday (`weekly`), linked to a Template. Past `once` Schedules are preserved (not deleted) so they can be compared against actual Sessions in retrospective views.
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

## Relationships

- A **Template** contains an ordered list of **Exercises** with default Sets
- A **Session** may be started from a **Template** or freeform; once started, its exercises are fully editable
- A **Session** contains zero or more **Sets**, each belonging to one **Exercise**
- A **Set** is either **Done** or **Planned**; only Done Sets count toward **PRs**, **Volume**, and **Streak**
- A **Planned Set** is preserved after Session finish for retrospective comparison against the **Schedule**
- A **Schedule** references a **Template** and resolves to a **Today's Schedule** if its date/day matches today and no Session has been started
- A **Progress Photo** optionally records **Body Weight** at the time of the photo

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
- **"auto-progression"**: The `last-sets` endpoint is the data foundation for a planned AI-driven feature that will suggest per-exercise weight/rep progressions. Not yet implemented.
