# Issue #14 — Dashboard Volume card display fixes

## Overview

Fix the two pure-presentation defects on the dashboard's Volume summary card
(`WorkoutSummaryCard` in `apps/web/src/routes/dashboard.tsx`), as seen in #14's
screenshot ("VOLUME — / was 9.6kkg / −9.6k"):

1. **`kkg` double-"k"** — `fmtVol()` already appends `"k"` for values ≥ 1000, but
   two call sites then append a literal `"kg"`, producing `"9.6kkg"`.
2. **Delta-from-nothing** — when current Volume renders as `—` (gated on
   `currentVolume > 0`), the card still shows a concrete delta (e.g. `−9.6k`),
   i.e. a difference from a value displayed as "nothing". Suppress the delta
   whenever current renders `—`.

Both are pure display changes on the same card in the same screenshot, with
**zero domain dependency**. They do not touch the Volume calculation, do not
special-case bodyweight, and encode no stance on whether bodyweight should count
toward Volume — that is a separate product-decision issue (see Context).

## Context

Issue: https://github.com/f13r/gymtracker/issues/14 ("Bodyweight exercise issues")

Grill⇄BA transcript (3 rounds): `.ralph/scratch/issue-14.qa.md`

### Scope decision: split #14 into display-fix vs. domain-change

Issue #14 as filed bundles two distinct things: (a) a product request to count
bodyweight exercises toward Volume using the user's real body weight as per-rep
load, and (b) the display defects on the Volume card. **This plan covers only
(b) — the display fixes.** The bodyweight-Volume change is a separate
product-decision issue and is explicitly out of scope here.

Decisions made (each cited):

- **Scope #14 to the display bug only; spin the bodyweight-Volume override into a
  separate issue.** The display defects are independent and shippable now with no
  domain implication; the bodyweight change amends the Volume definition, is
  under-specified (4 unresolved spec questions), and would also reverse the
  "e1RM undefined for bodyweight" rule. — Round 1 (CONTEXT.md:117-119 Volume =
  Done Sets only; CONTEXT.md:126 e1RM undefined for bodyweight;
  `packages/shared/src/stats.utils.ts:63` `calculateVolume` returns 0 when
  `weightKg = 0`; commit `16694ab` hid KG for bodyweight → `weightKg = 0`).

- **Treat `—` (current = 0) and `−9.6k` as truthful outputs of the current Volume
  rule, NOT data defects.** An all-bodyweight session legitimately has Volume 0,
  so `currentVolume > 0 ? … : '—'` (`dashboard.tsx:66`) correctly renders `—`
  and `deltaVol = 0 − 9600` correctly yields `−9.6k` (`dashboard.tsx:52`). Do
  **not** special-case the data — no forcing current to `0`, no clamping
  negatives. Those would smuggle in a bodyweight-Volume stance and belong to the
  separate issue. — Rounds 2 & 3.

- **Fix the `kkg` at BOTH call sites on the card** — `dashboard.tsx:77`
  (`` `${fmtVol(prevVolume!)}kg` `` in "was …") and `dashboard.tsx:113`
  (`+{fmtVol(ex.delta)}kg` in the exceeded-exercises list, which also produces
  `kkg` for any delta ≥ 1000). `fmtVol` (`dashboard.tsx:31`) already appends the
  `"k"`. — Round 3.

- **`WorkoutLogger.tsx:27,30` is OUT of scope.** The same `fmtVol`/delta pattern
  is duplicated there, but it is a different surface (the active logger, not the
  dashboard card in the screenshot). Repo-wide cleanup was not requested for
  #14. — Round 3.

- **Bundle the delta-coherence fix into #14.** Gate the delta on `currentVolume > 0`
  too (extend `dashboard.tsx:79`) so the delta hides whenever current renders
  `—`. It is the minimal coherent change, is pure presentation, and encodes no
  bodyweight-Volume stance ("don't show a difference from a value we render as
  nothing"). Shipping one coherent card in one PR beats leaving `—` next to
  `−9.6k`. — Rounds 2 & 3.

- **Strategy: `[direct]` (no TDD).** `apps/web` has no test runner configured
  (no vitest/testing-library/jsdom in `apps/web/package.json`), and the defects
  live in JSX template literals / a render condition, not in extractable pure
  functions. Standing up component-test infra for a two-line display fix is
  disproportionate. Verification is build + lint + visual check.

### Decisions needed from human

None.

## Success criteria

- The dashboard Volume card never renders `kkg`: the "was …" value and any
  exceeded-exercise delta ≥ 1000 read e.g. `9.6kg`, not `9.6kkg`.
- When current Volume renders as `—` (`currentVolume === 0`), no delta is shown
  beside it (no `−9.6k` against `—`).
- When current Volume is > 0, the delta still renders exactly as before
  (sign, colour, `fmtDelta` formatting unchanged).
- No change to Volume calculation, bodyweight handling, or any non-display
  behaviour. `WorkoutLogger.tsx` is untouched.
- `pnpm --filter @gymtracker/web lint` and the web build pass; the `react-doctor`
  regression check is clean for the changed file.

---

### Task 1: [direct] Remove the `kkg` double-"k" on the Volume card

`fmtVol` (`apps/web/src/routes/dashboard.tsx:31`) already appends `"k"` for
values ≥ 1000. Two call sites on the same card then append a literal `"kg"`,
producing `"9.6kkg"`. Fix both so the unit reads `kg` once.

- [x] Fix the "was …" site at `dashboard.tsx:77`: `` `${fmtVol(prevVolume!)}kg` ``
      renders `9.6kkg`. Render the numeric value via `fmtVol` and the `kg` unit
      separately so the value is never glued to a literal `kg` after the `k`
      suffix. Match the existing current-value treatment (`fmtVol(currentVolume)`
      + a separate `<span>…kg</span>`, `dashboard.tsx:66-70`) so the "was" label
      and the current value format identically.
- [x] Fix the exceeded-exercises site at `dashboard.tsx:113`:
      `+{fmtVol(ex.delta)}kg` produces `kkg` for any delta ≥ 1000. Apply the same
      separation so the `+`, the `fmtVol` value, and the `kg` unit compose
      without doubling the `k`.
- [x] Do NOT touch `WorkoutLogger.tsx` (out of scope) and do NOT alter `fmtVol`
      itself (other callers rely on its `"k"` suffix).
- [x] Verify visually with a value ≥ 1000 (e.g. prevVolume 9600 → reads `9.6kg`,
      not `9.6kkg`) and a value < 1000 (e.g. 850 → reads `850kg`). [manual visual
      test skipped - not automatable; verified by code: value via `fmtVol` + a
      separate `<span>kg</span>`, so a 9600 prev renders `9.6` + `kg` = `9.6kg`,
      and 850 renders `850` + `kg` = `850kg` — no doubled `k`.]

### Task 2: [direct] Suppress the delta when current Volume renders `—`

The current value is gated on `currentVolume > 0` (renders `—` otherwise,
`dashboard.tsx:66`), but the delta is gated only on `deltaVol !== null && deltaVol !== 0`
(`dashboard.tsx:79`) — so the card shows a concrete delta against a value
displayed as `—` (a difference from "nothing").

- [x] Extend the delta condition at `dashboard.tsx:79` to also require
      `currentVolume > 0`, so the delta block is hidden whenever the current
      value renders `—`. (Condition now reads `currentVolume > 0 && deltaVol !== null && deltaVol !== 0`.)
- [x] Do NOT force current to show `0` instead of `—`, and do NOT clamp negative
      deltas — those encode a bodyweight-Volume stance that belongs to the
      separate issue. The only change is gating the delta's visibility. (Only the
      delta-visibility guard changed; the `—` fallback and `deltaVol` math are untouched.)
- [x] Verify: an all-bodyweight current session (currentVolume 0, prevVolume
      9600) shows `—` with no delta; a weighted current session (currentVolume
      > 0) still shows its delta exactly as before. [manual visual test skipped -
      not automatable; verified by code: with currentVolume 0 the current value
      renders `—` (line 66) AND the delta guard's `currentVolume > 0` is false so
      the delta block is not rendered; with currentVolume > 0 the guard reduces to
      the original `deltaVol !== null && deltaVol !== 0` condition, so the delta
      renders exactly as before.]
