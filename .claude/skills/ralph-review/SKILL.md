---
name: ralph-review
description: Ralph-loop post-loop review. Runs a thermo-nuclear architectural review on the branch diff after Ralphex finishes, compares it against Ralphex's native review, fixes high/critical findings, and opens the PR. Use when the user runs `/ralph-review` after a Ralphex loop completes.
---

# /ralph-review

Post-loop review zone (steps 7–8). Runs after `ralphex docs/plans/issue-N.md` completes on the working branch.

Design: `docs/plans/2026-06-24-ralph-loop-pipeline.md`. Config: `.ralph/config.yml`.

## Step 0 — Setup

1. Read `.ralph/config.yml` (`validation`, `settings.review_block_severity`).
2. Confirm you're on the `ralph/issue-N` branch. Compute the diff range: `git merge-base main HEAD`..`HEAD`. The **branch diff** is the review input.

## Step 1 — thermo-nuclear review

Apply the architectural/structural framework in [`thermo-nuclear.md`](thermo-nuclear.md) to the branch diff. One-shot, prioritized findings (high/critical/medium/low).

> **Prod note:** in the prod project this step runs via **gpt-5/codex** as an external must-pass gate. For the POC it's Claude-run. Same framework, same output contract.

## Step 2 — gather Ralphex's native review findings

Collect the findings Ralphex's own 5-agent review produced for this branch (from its run output / PR comments / `.ralphex/` run artifacts). These are the comparison baseline.

## Step 3 — `comparison.md`

Write `comparison.md` (PR-attached, not necessarily committed) with three columns: **finding · raised-by-native? · raised-by-thermo-nuclear?**. Summarize: what only thermo-nuclear caught, what only native caught, overlap.

> **Why:** this is the research deliverable — it tells us empirically whether we need both reviewers long-term or can drop one.

## Step 4 — fix loop (step 8)

- Fix every finding whose severity is in `settings.review_block_severity` (default `high`, `critical`) — from **either** reviewer.
- After fixes: re-run the `validation` command (lint/format/build/**doctor**). react-doctor is hard-blocking — triage and fix its findings too.
- Re-run the thermo-nuclear pass on the new diff. Repeat until no high/critical remain.
- **Medium/low** findings are **not** blockers — collect them as advisory notes for the PR.

## Step 5 — open the PR

`git push -u origin ralph/issue-N` and open a PR (`gh pr create`) whose body includes:

- link to the issue,
- the `comparison.md` summary,
- the advisory (medium/low) notes.

## Gate #2 — ship approval

Stop. Tell the human to review the PR + `comparison.md`, then **merge to `main` themselves** — the merge is the ship decision. After they merge, the next step is `/ralph-ship`.

If `settings.gates.ship_approval` is `false` (A-mode), `/ralph-ship` will do the merge itself instead.
