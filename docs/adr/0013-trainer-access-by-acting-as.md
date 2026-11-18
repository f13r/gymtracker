# 13. A Trainer works on an athlete's data by acting as them

Date: 2026-11-18

## Status

Accepted

## Context

Until now every User's plans and logs were private: no User saw another's. Viktor trains Inna and wants to see her training and change her plan from the app itself, not only through the Agent's dry-run-and-approve loop. One person may later train several people, and someone who joins the household must not become visible just by joining.

"Coach" already names the in-app AI, so the person gets a different name: **Trainer**.

## Decision

- A **Trainer** is a User linked to one or more other Users, their athletes. Links are many-to-many and come only from the server env `TRAINER_LINKS` (`trainerId:athleteId,...`), parsed into the auth config at boot. There is no table and no in-app way to create a link. Boot fails on an unknown id or a self-link. Removing a line and restarting revokes access.
- A Trainer works on an athlete's data by **acting as** them: the web app sends `X-Act-As: <athleteId>` on every request, the auth guard checks the link, and the request carries both the actor (the Trainer) and the subject (the athlete). Services scope their queries by the subject, as they already scope by the signed-in User.
- Access while acting is **deny by default**. A route works while acting only when it is marked `@TrainerAccess('read')` or `@TrainerAccess('write')`; any other route answers 403.
  - Write: Templates, Schedules (weekly and one-off), the User Profile, per-User Exercise notes.
  - Read: Sessions and Sets, the Program and Program Updates, stats, Body Weight.
  - Nothing: Progress Photos, starting or finishing a Session, logging Sets, accepting or dismissing Program Updates.
- In the web app, acting is a tab-scoped state (sessionStorage) shown by a permanent banner. Switching clears the query cache. The app reuses its ordinary pages, hiding what the access list forbids. The "Act as…" entry appears only for a User with athletes, and an athlete sees their Trainers in Settings.
- The Agent (`/api/agent/*`) is unchanged and separate.

## Consequences

- CONTEXT.md's privacy rule gains an exception: a User's Trainer may see and change the data listed above.
- Trainer changes are **not recorded**: the athlete sees who their Trainers are but not what a Trainer changed or when. Adding an audit later means a log written wherever `actor ≠ subject`.
- Concurrent edits of one Template by Trainer and athlete: the last save wins.
- A Template change never reaches an active Session (ADR 0008), so a Trainer cannot disrupt a workout in progress.
- A new route is private while acting until someone marks it, so new data (e.g. more body data) never leaks by omission. A test checks that every route is either marked or refused.
- Moving links into the database (for in-app invites) later replaces only the config lookup; the guard and the route markings stay.
