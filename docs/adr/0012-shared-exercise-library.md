# 12. One shared Exercise library across Users

Date: 2026-11-16

## Status

Accepted

## Context

GymTracker is becoming multi-User (a household: Viktor and Inna). Every table carried a `user_id`, including `exercises`, so the natural default was per-User Exercise libraries. But both Users train with the same movements, and an AI agent is to maintain the library centrally; two diverging copies of "Bench Press" would split the agent's work and any future cross-User reasoning.

## Decision

Exercises have no owner. There is one library, any User or the agent may add, edit or remove an Exercise, and changes apply to everyone. Names are unique ignoring case (existing duplicates merged on migration). `is_default` is dropped. Removing an Exercise that anything references archives it instead of deleting it, so one User can never damage another's history. `description` and the Exercise Image are shared; `notes` move to a per-User record. Gym and Equipment are likewise household-shared with no User link. Templates, Sessions, Sets, Programs and all body data stay per-User and private.

## Consequences

- A User's edit (rename, image, description) is visible to the other User immediately — accepted for a two-person household.
- Exercise deletion becomes archive-or-delete logic instead of an FK error.
- Name is a usable stable key for the agent's write channel.
- Reversing this later (per-User libraries) would require splitting Exercises and rewriting every reference.
