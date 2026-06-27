# Thermo-nuclear code-quality review — framework

A **high-level architectural and maintainability** review. It is **not** linting/typecheck/build (those are the mechanical `validation` gate). It audits structure, abstraction quality, and codebase health on a **diff/branch changeset**, one-shot, producing **prioritized** findings.

Source: cursor-team-kit `thermo-nuclear-code-quality-review` skill. Bundled here for offline stability; refresh from upstream if it changes.

## Baseline question

For the changes in the diff, ask: _"How could this be restructured to meaningfully improve code quality **without changing behavior**?"_ Prefer the cleaner structure over merely-working code.

## Seven non-negotiable standards

1. **Structural ambition** — look for "code judo": restructurings that dramatically simplify while preserving behavior.
2. **File-size discipline** — a file crossing ~1,000 lines is a design smell; flag for decomposition.
3. **Spaghetti detection** — ban ad-hoc conditionals scattered into unrelated flows.
4. **Design-first bias** — prefer a cleaner abstraction over a working-but-tangled one.
5. **Type / boundary clarity** — question unnecessary optionality and casting; tighten boundaries.
6. **Canonical-layer enforcement** — logic lives in the right package; reuse existing helpers instead of duplicating. (For this repo: shared logic in `packages/`, not copied across `apps/`.)
7. **Orchestration atomicity** — flag needless sequencing where parallelization/simplification is cleaner.

## Output contract

Emit a list of findings, each with:

- `severity`: `critical` | `high` | `medium` | `low`
- `file:line`
- `finding`: the structural problem
- `suggestion`: the concrete restructuring (the "judo" move)

Prioritize structural regressions and missed simplifications over cosmetic nits. The caller blocks on `high`/`critical`; `medium`/`low` are advisory.
