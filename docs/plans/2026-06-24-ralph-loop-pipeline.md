# Ralph-Loop Pipeline — Design Plan

**Date:** 2026-06-24
**Status:** Design agreed (via grilling). Not yet implemented.
**Goal:** Wrap [Ralphex](https://ralphex.com/) in a repeatable, **portable** issue→ship pipeline. POC on `gymtracker`; the universal core is reused unchanged in a future prod project (only a per-project config differs).

---

## 1. The key insight that shapes everything

Ralphex is **not** a script runner — it is itself an orchestrator with its own loop. A Ralphex run is already a 4-phase pipeline (task execution + per-task validation + 5-agent review + optional codex review + final critical-issues review), and it **consumes a markdown plan file** with task checkboxes. It does _not_ fetch issues or grill anyone.

So the user's 10 steps do **not** all live "inside Ralphex." They split into **three zones**:

| Zone          | Steps                                                 | Who owns it                                  |
| ------------- | ----------------------------------------------------- | -------------------------------------------- |
| **Pre-loop**  | 1–4: get issue → grill → BA answers → plan            | Custom skill `/ralph-prep` (our code)        |
| **The loop**  | 5–8: implement → validate → review → fix              | **Ralphex**, configured (not rebuilt)        |
| **Post-loop** | 7→9–10: thermo-nuclear review → deploy → close → docs | Custom skills `/ralph-review`, `/ralph-ship` |

Guiding principle (decided Q1): **configure Ralphex, don't fight it.** Ride its loop and review machinery; express our needs (validation command, review framework, TDD) as _configuration_, not as a parallel reimplementation.

---

## 2. Two human gates (B-mode now → A-mode later)

We run in **B-mode** (two human gates) now; the **ultimate goal is A-mode** (fully autonomous). Critically, **each gate is a toggle, not baked-in logic** — reaching A-mode means deleting two pause points, not rewriting the pipeline.

- **Gate #1 — plan approval** (after pre-loop): human reviews `docs/plans/issue-N.md` + the live CONTEXT.md/ADR edits + flagged-for-human questions, then lets the loop run.
- **Gate #2 — ship approval** (after review): human reviews the PR + `comparison.md`, then **merges to `main` themselves**. The merge _is_ the ship decision.

These are the two genuinely irreversible decisions (what to build; what to ship). Everything between is on a branch and cheaply revertible, so it's safe to automate.

**B→A migration:**

- Gate #1 off: a wrapper auto-approves the plan (or skips the pause) and feeds the `ready-for-agent` label queue one issue at a time.
- Gate #2 off: `/ralph-ship` does the merge itself after the loop, instead of the human.
- No change to the per-issue skills.

---

## 3. Universal core vs. project-specific surface

The whole point of the design is reuse. The **only** project-specific surface, across all 10 steps, is **four variables** in one config file:

`.ralph/config` (kept **separate** from Ralphex's own `.ralphex/` dir so the two layers swap independently):

```yaml
tracker: gh # how to fetch the "future" layer + close issues
knowledge: # how the present/past abstractions resolve to real sources
  present: CONTEXT.md, docs/adr/**, <codebase>
  past: docs/plans/**, docs/superpowers/plans/** # prod: + fetched .md from Jira/Confluence/Miro
validation: npm run lint && npm run format:check && npm run build && npm run doctor --workspace=apps/web
ship: <invoke /deploy skill> # push main → CI auto-deploy → SSH-verify
```

| Universal (never changes per project)                     | Project-specific (only `.ralph/config`) |
| --------------------------------------------------------- | --------------------------------------- |
| Grill ↔ BA two-agent self-play                            | `tracker` (gh now; Jira later)          |
| BA agent (filesystem-only, cites sources)                 | `knowledge` source paths                |
| Planner (tracer-bullet, TDD tagging)                      | `validation` command                    |
| `/tdd` skill                                              | `ship` command                          |
| `/ralph-prep`, `/ralph-review`, `/ralph-ship` skill logic |                                         |

Porting to prod = **rewrite one file**.

---

## 4. The knowledge model (present / future / past)

These are **abstractions over sources that already exist** — there are **no** `present/`, `future/`, `past/` folders. The BA agent reads them in place.

| Abstraction | Meaning                                      | POC source                                                                              | Prod source                                         |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Present** | current state of the project                 | the code + `CONTEXT.md` + `docs/adr/**`                                                 | same + more                                         |
| **Future**  | what to build                                | `gh issue view <N>` (+ its parent PRD as context)                                       | Jira task                                           |
| **Past**    | institutional memory — don't repeat mistakes | `docs/plans/**`, `docs/superpowers/plans/**`, closed issues, `git log`, superseded ADRs | **+ fetched `.md`** from Jira/Confluence/Miro/Slack |

**Prod note (deferred):** a project-specific _fetcher_ materializes external services → local `.md` files. The BA agent stays filesystem-only and never talks to a service directly. POC needs no fetcher — the data is already on disk.

---

## 5. Components

### 5.1 `/ralph-prep <issue-number>` (pre-loop — steps 1–4)

Unit of work = **one slice issue** (e.g. `#12`). Its parent PRD is pulled in as additional context; the planner only emits tasks for the slice.

1. **Fetch** the issue (`gh issue view N`) + parent PRD if linked → the "future" layer.
2. **Grill ↔ BA self-play** (steps 2–3):
   - **Two separate agents, fresh contexts, orchestrator-mediated** (not one agent role-playing both — that collapses into self-agreement).
   - **Grill agent** runs `/grill-with-docs` logic over _present + future_, emits questions.
   - **BA agent** (persona: Business Analyst / Product Owner / Gym member) sees _present + past_ (not the grill's reasoning), answers **with mandatory source citations**.
   - Exchange via `qa-transcript.md`.
   - **Termination:** grill emits no new questions **OR** every open question has a cited answer **OR** hard cap **N=15 rounds** — whichever first.
   - **Flag, don't guess:** unanswered / low-confidence questions are flagged for the gate-#1 human, never fabricated.
   - **Docs edited live (Q5-i):** `/grill-with-docs` edits `CONTEXT.md` / ADRs in the working tree as decisions crystallize. Human reviews them at gate #1 (it's all on a branch).
3. **Planner** turns the transcript + doc edits into `docs/plans/issue-N.md` — **tracer-bullet vertical slices**, each task tagged:
   - `- [ ] [tdd] ...` — anything with real business logic (stats, progression math, snapshot rules).
   - `- [ ] [direct] ...` — pure UI/copy/config with nothing to assert.
   - Tagging decided at plan time so it's **visible and editable at gate #1**.

→ **GATE #1**: human reviews `docs/plans/issue-N.md`, the live doc edits, and flagged questions.

### 5.2 Ralphex (the loop — steps 5–8 implement/validate)

Invoked: `ralphex docs/plans/issue-N.md` while on the `ralph/issue-N` branch. **Isolation is branch-based** (not Docker, not worktree — see below). `[tdd]` tasks run tests against the Postgres test DB (`docker compose up -d postgres`). Configured via `.ralphex/` (`external_review_tool = none`, `move_plan_on_completion = false`, custom `prompts/task.txt`):

- **Task execution:** the per-task prompt reads each task's tag and invokes **`/tdd`** for `[tdd]` tasks, direct implementation for `[direct]`.
- **Per-task validation (step 6, blocking):** the `.ralph/config` `validation` command — `lint && format:check && build && doctor`. Mechanical gate; a task isn't done until it passes. **react-doctor is hard-blocking** — its findings feed an additional fix-work pass, not just a fail.
- **Native review (step 5/8):** Ralphex's 5-agent review runs as normal (quality, implementation, testing, simplification, docs) with its auto-fix loop.

### 5.3 `/ralph-review` (post-loop — steps 7–8 review/fix)

Runs after Ralphex completes, on the **branch diff**:

1. Run **thermo-nuclear** review (architectural/structural: code-judo, file-size discipline, spaghetti, canonical-layer, simplification). Claude-run now; **gpt-5/codex in prod** (deferred).
2. **`comparison.md`** — diff thermo-nuclear's findings against Ralphex's native-review findings. **Purpose: empirically decide whether we need both long-term**, or can drop one.
3. **Fix loop (step 8):** fix **high/critical** findings (Claude-in-skill, since thermo-nuclear is outside Ralphex) → re-run `validation` → re-review until clean. Medium/low ride along as **advisory PR notes**, not blockers (blocking on nits never converges).
4. Push branch, open PR with `comparison.md` + advisory notes attached.

> **Research question this answers:** run both reviews, compare, then decide. In prod, thermo-nuclear becomes the gpt-5/codex external must-pass gate after Ralphex's review.

→ **GATE #2**: human reviews PR + `comparison.md`, then **merges to `main`**.

### 5.4 `/ralph-ship` (post-loop — steps 9–10)

Triggered after the human merges:

1. Run the existing **`/deploy`** skill (`ship` config) — push→CI→SSH-verify.
2. **If SSH-verify fails → STOP and report. Do NOT close the issue.**
3. On healthy deploy:
   - **Close the issue** (`gh issue close N` with a comment linking the PR/commit).
   - **Doc reconciliation (step 10):** CONTEXT.md/ADRs were already edited in prep — reconcile against what actually shipped; update **`DEPLOY.md`** if the change was deploy-affecting (per standing rule to keep it current).

---

## 6. End-to-end flow (maps the user's 10 steps)

```
  /ralph-prep 12
    1. fetch issue #12 (+ parent PRD)                         [step 1]
    2. grill agent  ⇄  BA agent  (cited, ≤15 rounds)          [steps 2–3]
       └─ edits CONTEXT.md / ADRs live
    3. planner → docs/plans/issue-12.md  ([tdd]/[direct])     [step 4]
  ── GATE #1: approve plan ──────────────────────────────────
  ralphex docs/plans/issue-12.md
    4. per task: /tdd if tagged, else direct                  [step 5]
    5. per task: lint && format:check && build && doctor      [step 6]
    6. Ralphex 5-agent native review + auto-fix
  /ralph-review
    7. thermo-nuclear review on branch diff                   [step 7]
    8. comparison.md (native vs thermo-nuclear)
    9. fix high/critical → re-validate → re-review            [step 8]
   10. open PR
  ── GATE #2: review PR + comparison.md, merge to main ──────
  /ralph-ship
   11. /deploy (push→CI→SSH-verify)                           [step 9]
   12. close issue + reconcile docs + DEPLOY.md               [step 10]
```

---

## 7. Artifacts & where they live

| Artifact           | Path                                       | Lifetime                  |
| ------------------ | ------------------------------------------ | ------------------------- |
| Q&A transcript     | branch-local scratch (NOT committed)       | checked on the fly        |
| Plan               | `docs/plans/issue-N.md`                    | committed                 |
| Review comparison  | `comparison.md` (PR-attached)              | reviewed at gate #2       |
| Live doc edits     | `CONTEXT.md`, `docs/adr/**`                | committed on branch       |
| Per-project config | `.ralph/config`                            | committed, the reuse seam |
| Ralphex config     | `.ralphex/` (agent prompts, plan settings) | committed                 |

---

## 8. Build order

1. **`.ralph/config`** with the four keys (the seam — define it first).
2. **`/ralph-prep`**: orchestrate grill⇄BA self-play + planner. Hardest, most novel. Validate the transcript/citation/flagging behavior by hand before automating.
3. **`.ralphex/`** config: wire `validation`, the per-task TDD-tag prompt, keep native review.
4. **`/ralph-review`**: thermo-nuclear pass + `comparison.md` + high/critical fix loop.
5. **`/ralph-ship`**: `/deploy` + close + doc reconcile, with the verify-fail abort.
6. **Dry-run** end-to-end on a low-risk slice (e.g. `#10`), both gates manual.

---

## 9. Deferred (prod project, not POC)

- **Knowledge fetcher**: Jira/Confluence/Miro/Slack → local `.md`. BA agent unchanged.
- **thermo-nuclear via gpt-5/codex** as the external must-pass gate.
- **A-mode**: drop both gates; `ready-for-agent` label queue drives runs; `/ralph-ship` does the merge.

---

## 10. Settled build-time decisions

- **react-doctor is hard-blocking.** `doctor` blocks the task like lint/format/build, **and** its findings feed an additional fix-work pass (not just a fail) — the task isn't done until doctor is clean.
- **`qa-transcript` is NOT committed** — branch-local scratch, checked on the fly, never lands in git.
- **Isolation is branch-based** (revised after inspecting Ralphex v1.5.1). Ralphex has no Docker mode; its only isolation is git worktrees, which break for this npm-workspaces repo (a worktree has no `node_modules`). So we run in place on the `ralph/issue-N` branch — every change committed and revertible, gated before `main`. The Postgres container is just the `[tdd]` test DB, not agent isolation.
- **Branch name is the shared state key.** `/ralph-prep`, Ralphex, `/ralph-review`, `/ralph-ship` hand off across separate sessions via the branch name (e.g. `ralph/issue-N`).
