# AI coaching stays LLM-owned, fed by deterministic signals

A research report ("AI Fitness App Development Research") proposed three things for the coaching engine: a deterministic sports-science algorithm engine (APRE adjustment tables, Double Progression logic gates, hardcoded volume-landmark arithmetic) that computes prescriptions, the ExerciseDB API (11k exercises) for the exercise library and equipment-based substitution, and on-device edge computer vision (quantized YOLO) for equipment scanning. We deliberately adopted **none** of them.

**Decision:** Progression Suggestions and Program adaptation remain **LLM-owned** — the model computes the sets/reps/weight and chooses the adaptation action. We improve quality only by feeding the LLM better **deterministic signals** (e.g. estimated 1RM trends, per-exercise Adaptive Resistance flags), never by moving the computation out of the model. The exercise library stays LLM-suggested and user-curated; equipment understanding stays cloud VLM (Gemini Equipment Analysis).

## Why

- **Deterministic engine rejected:** APRE/Double-Progression are per-exercise rules that can't do the cross-exercise, whole-program holistic reasoning the app is built around (e.g. respecting total muscle-group load across exercises). The LLM's judgement is the product. Determinism is added as _guardrails/signals_, not as the prescriber.
- **ExerciseDB rejected:** its `bodyPart`/`target`/`secondaryMuscles` taxonomy conflicts with our deliberately coarse Category model, and it adds an external runtime dependency. For a personal tracker the right swap target is an exercise from the user's _own_ library, not a random external entry.
- **Edge CV rejected:** the VLM half already exists (cloud Gemini Equipment Analysis). On-device YOLO only adds live/offline scanning, which presupposes a native mobile client we don't have. Not worth it at single-user web-prototype scale.

## Consequences

- The arithmetic in a Progression Suggestion is not reproducible or unit-testable; we accept that in exchange for holistic reasoning. Safety comes from signals and prompt constraints, not a deterministic gate.
- Revisit ExerciseDB / edge CV only if the app goes multi-user or mobile-native.
