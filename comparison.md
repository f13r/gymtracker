# Review comparison — issue #14 (`ralph/issue-14`)

Branch diff vs `main` (merge-base `b89c058`). Shipped change is a 14-line
presentational edit to `apps/web/src/routes/dashboard.tsx` (plus the plan doc,
a `.gitignore` rule, and the pipeline state file).

Two reviewers ran over the same diff:

- **Native** — Ralphex's built-in 5-agent review (quality, implementation,
  testing, simplification, documentation) + a critical/major second pass.
- **Thermo-nuclear** — the architectural/structural framework in
  `.claude/skills/ralph-review/thermo-nuclear.md` (7 standards: structural
  ambition, file-size, spaghetti, design-first, type/boundary, canonical-layer,
  orchestration).

## Findings matrix

| # | Finding | Severity | Native? | Thermo-nuclear? | Disposition |
|---|---------|----------|---------|-----------------|-------------|
| 1 | Stray `.ralphex/run-issue-13.log` committed onto the issue-14 branch | high (hygiene) | ✅ (4/5 agents) | ➖ (out of diff-architecture scope) | **Fixed by native loop** (`fa1eca8`): removed + `.ralphex/run-*.log` ignore rule |
| 2 | Stray `pnpm-lock.yaml` left in working tree (npm repo) | low | ✅ (noted, npm vs pnpm) | ➖ | **Fixed this pass**: removed |
| 3 | `fmtVol(x)` + `<span>kg</span>` unit pattern repeated **3×** in `WorkoutSummaryCard` (lines 66–70, 79–82, 121–124); diff adds the 3rd instance | medium | ⚠️ partial — native saw only the *className divergence* on the spans and dismissed it as intentional | ✅ framed as a missed in-component simplification (standard #4 design-first, #1 structural ambition) | Advisory — extract a `<VolumeValue value unitClassName>` helper |
| 4 | `fmtVol`/`fmtDelta` duplicated across `dashboard.tsx` and `WorkoutLogger.tsx` (canonical-layer) | medium | ✅ (flagged "extract to `packages/shared`", dismissed as out-of-scope) | ✅ (standard #6 canonical-layer) | Advisory — agree it's out of scope for this PR; the diff doesn't worsen it |
| 5 | `currentVolume > 0` predicate now duplicated (line 66 render-guard + line 87 delta-guard) | low | ➖ | ✅ (standard #3 spaghetti / DRY) | Advisory — hoist `const hasCurrent = currentVolume > 0` |
| 6 | `prevVolume!` non-null assertion (line 80) leans on the `hasPrev` boolean | low | ➖ | ✅ (standard #5 type/boundary clarity) | Advisory — pre-existing; narrow instead of assert |
| 7 | No automated tests for the change | n/a | ✅ (dismissed) | ➖ | Agree — `apps/web` has no test runner; plan justifies `[direct]` |
| 8 | `WorkoutLogger.tsx` twin of the `kkg` bug | n/a | ✅ (dismissed) | ➖ | Agree out of scope; see #4 |
| 9 | CONTEXT.md Volume-card presentation note | low | ✅ (dismissed) | ➖ | Agree — CONTEXT.md deliberately avoids UI presentation |
| 10 | Plan-doc lint command says `pnpm --filter …` vs repo's `npm run lint` | low | ✅ (dismissed) | ➖ | Advisory doc nit |
| 11 | Trailing-newline on state JSON | low | ✅ (dismissed) | ➖ | Cosmetic |
| 12 | **Spec gap**: #14's core ask (bodyweight volume from real body weight) is not addressed | n/a | ➖ | ➖ (neither reviewer raised it; it's a spec-vs-issue concern, not in either's frame) | Deliberate per plan — split into a separate domain issue |

## Summary

- **Overlap (both caught):** the *substance* of the kg-span duplication (#3) and
  the `fmtVol` canonical-layer point (#4) — though framed differently. Native saw
  the className divergence and the "extract to shared" idea; thermo-nuclear saw
  the same code as a structural/design smell. Same code, two lenses.
- **Only native caught:** all the *hygiene and process* findings — the stray
  issue-13 log (#1, the one genuinely actionable item, fixed), the pnpm lockfile
  (#2), missing tests (#7), the doc-command nit (#10), JSON newline (#11). The
  5-agent split (esp. the dedicated testing + documentation agents) surfaces
  process/hygiene issues the architectural framework isn't looking for.
- **Only thermo-nuclear caught:** the *intra-component* DRY/typing findings the
  native pass didn't name — the duplicated `currentVolume > 0` predicate (#5) and
  the `prevVolume!` assertion (#6). Both low severity.
- **Neither caught:** the spec gap (#12) — surfaced here only by reading the issue
  against the plan. Both reviewers operate on the diff, not the issue intent.

## Verdict for the gate

**No high/critical findings remain.** The one high-impact hygiene item (#1) was
already fixed by the native loop; the stray lockfile (#2) was removed this pass.
Everything thermo-nuclear surfaced is medium/low → advisory, carried into the PR
body. No blocking fix loop required.

### Empirical takeaway (the research question)

For a small, well-scoped presentational diff the two reviewers are **complementary,
not redundant**: native dominates on hygiene/process/test coverage (its 5-agent
breadth), thermo-nuclear dominates on structural/typing nuance within the changed
code. The only true overlap was the kg-span duplication, viewed through different
lenses. On this evidence, dropping either reviewer would lose a distinct class of
finding — keep both, at least until a larger sample shows the overlap growing.
