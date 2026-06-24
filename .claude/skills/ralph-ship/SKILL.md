---
name: ralph-ship
description: Ralph-loop ship zone. After the human merges the PR to main, deploys via the project ship command, verifies, then closes the issue and reconciles docs. Use when the user runs `/ralph-ship <issue#>` after merging a Ralph-loop PR.
---

# /ralph-ship `<issue#>`

Post-loop ship zone (steps 9–10). Runs **after** the human has merged the `ralph/issue-N` PR to `main` (gate #2), or — in A-mode — does the merge itself first.

Design: `docs/plans/2026-06-24-ralph-loop-pipeline.md`. Config: `.ralph/config.yml`.

## Step 0 — Setup & gate #2

1. Read `.ralph/config.yml` (`ship`, `tracker`, `settings.gates.ship_approval`).
2. If `gates.ship_approval` is `true` (B-mode): **the human merges**. Confirm `main` already contains the branch's commits (`git log main --oneline | grep …`). If not merged yet, stop and tell the user to merge first.
3. If `gates.ship_approval` is `false` (A-mode): merge `ralph/issue-N` into `main` yourself, then continue.

## Step 1 — Deploy

Run the `ship` command from config — here `/deploy` (push `main` → CI auto-deploy → SSH-verify). Follow that command's own verify steps.

## Step 2 — Verify gate

**If deploy/SSH-verify fails: STOP and report. Do NOT close the issue and do NOT reconcile docs.** A red deploy means the work isn't shipped.

## Step 3 — Close & reconcile (only on healthy deploy)

1. **Close the issue** via the `tracker` adapter. For `gh`: `gh issue close N --comment "Shipped in <PR/commit link>."`
2. **Doc reconciliation:** `CONTEXT.md` / ADRs were edited during `/ralph-prep`. Reconcile them against **what actually shipped** (implementation may have diverged from the plan) and fix any drift.
3. **Update `DEPLOY.md`** if the change was deploy-affecting (new env var, migration, service, port, build step) — standing rule: keep the runbook current with every deploy-affecting change.
4. Commit any reconciliation directly to `main` (no `Co-Authored-By` lines, per repo convention) and push.

## Done

Report: deploy result table, issue closed, docs reconciled. The pipeline for issue N is complete.
