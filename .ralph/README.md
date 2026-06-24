# `.ralph/` — the project-specific seam

This directory is the **only** part of the Ralph-loop pipeline that changes per project. Everything else — the `/ralph-prep`, `/ralph-review`, `/ralph-ship` skills and the grill⇄BA self-play — is universal and reused byte-for-byte.

Full design: [`docs/plans/2026-06-24-ralph-loop-pipeline.md`](../docs/plans/2026-06-24-ralph-loop-pipeline.md).

## Files

- **`config.yml`** — four keys (`tracker`, `knowledge`, `validation`, `ship`) plus universal tunables. The pipeline skills read it.
- **`scratch/`** — branch-local working files (e.g. the grill⇄BA `qa-transcript.md`). **Git-ignored, never committed.**

## The pipeline (B-mode)

```
/ralph-prep <issue#>   → grill⇄BA self-play → plan         ── GATE #1: approve plan
ralphex docs/plans/issue-N.md   → implement + validate + native review
/ralph-review          → thermo-nuclear + comparison + fix ── GATE #2: review PR, merge
/ralph-ship            → /deploy → close issue → reconcile docs
```

The working branch `ralph/issue-N` is the shared state key across all four steps.

## Porting to another project

Rewrite **`config.yml` only**:

- `tracker` → your tracker adapter (e.g. Jira)
- `knowledge.past` → add your fetched `.md` exports (Jira/Confluence/Miro/Slack)
- `validation` → your project's lint/typecheck/build/test command
- `ship` → your deploy command

Do **not** edit the skills — that breaks reuse. If a project needs different behavior, it belongs in a config key.
