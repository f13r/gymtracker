---
name: ralph-prep
description: Ralph-loop pre-loop. Turns one tracker issue into an approved implementation plan via a grill⇄BA self-play. Use when the user runs `/ralph-prep <issue#>` or wants to prepare an issue for the Ralph loop.
---

# /ralph-prep `<issue#>`

Pre-loop zone of the Ralph-loop pipeline (steps 1–4). Takes **one slice issue** and produces an approved `docs/plans/issue-N.md` for Ralphex to execute.

Design: `docs/plans/2026-06-24-ralph-loop-pipeline.md`. Config: `.ralph/config.yml`.

## Inputs

- `$ARGUMENTS` = a single issue number `N` (e.g. `12`). Get it from `gh issue list`.
- Reads `.ralph/config.yml` for `tracker`, `knowledge`, `settings.branch_prefix`, `settings.grill_max_rounds`, `settings.gates.plan_approval`.

## Step 0 — Setup

1. Read `.ralph/config.yml`.
2. Create/switch to the working branch: `git switch -c <branch_prefix><N>` (e.g. `ralph/issue-12`). If it exists, switch to it. **This branch name is the shared state key** for the whole pipeline.
3. Ensure `.ralph/scratch/` exists (git-ignored). The transcript lives at `.ralph/scratch/issue-N.qa.md` and is **never committed**.

## Step 1 — Fetch the "future" layer

- Fetch the issue per the `tracker` adapter. For `gh`: `gh issue view N --comments`.
- If the issue references a parent **PRD** (e.g. "PRD: …" linked, or a `Slice` of a PRD), fetch that too — it's *context*, but the plan you emit covers **only this slice's** scope.

## Step 2 — Grill ⇄ BA self-play (steps 2–3)

The heart of pre-loop. Run **two separate sub-agents** (Agent tool, `general-purpose`) with **fresh contexts**, and **you mediate** between them. Do NOT role-play both yourself — separation is the whole point.

- **Grill agent** — system prompt = [`grill-agent.md`](grill-agent.md). Sees **present + future** (the `knowledge.present` sources + the fetched issue/PRD). Emits the *next single question* (or declares shared understanding).
- **BA agent** — system prompt = [`ba-agent.md`](ba-agent.md). Sees **present + past** (`knowledge.present` + `knowledge.past`), **not** the grill's reasoning. Answers the question **with a citation** to the source file/issue/commit backing it.

Loop (mediated by you), appending each exchange to `.ralph/scratch/issue-N.qa.md`:

1. Ask the Grill agent for the next question (give it the transcript so far).
2. Pass *only that question* to the BA agent (give it the transcript so far). It returns an answer **with citations**, or `NEEDS-HUMAN` if it cannot ground an answer.
3. Append `Q:` / `A:` (+ citations) to the transcript.
4. **When a decision crystallizes**, edit `CONTEXT.md` / `docs/adr/**` **live** in the working tree (this is `/grill-with-docs` behavior — sharpen terminology, add/supersede ADRs). These edits are reviewed at gate #1.
5. Repeat.

**Termination** — whichever comes first:
- the Grill agent emits no new question (declares shared understanding), **OR**
- every open question has a cited BA answer, **OR**
- `settings.grill_max_rounds` (default 15) is reached.

**Flag, don't guess.** Any `NEEDS-HUMAN` answer or low-confidence point is collected into a **"Decisions needed from human"** list — never fabricated. This list surfaces at gate #1.

## Step 3 — Plan (step 4)

Turn the transcript + the live doc edits into `docs/plans/issue-N.md`, in **Ralphex's exact plan format** (Ralphex finds work by scanning for `### Task N:` headers with `[ ]` checkboxes). Tracer-bullet vertical slices — each task a thin end-to-end increment (lean on the `to-issues` slicing philosophy).

**The strategy tag goes in the Task title** (Ralphex's task prompt reads it there): `[tdd]` for anything with real business logic (stats math, progression rules, snapshot/state logic — `/tdd` red-green-refactor), `[direct]` for pure UI/copy/config with nothing meaningful to assert.

Template:

```markdown
# Issue N: <title>

## Overview
<one-paragraph goal of this slice>

## Context
- Issue: <link>  ·  Parent PRD: <link if any>
- Decisions made (from grill⇄BA): <bullets, each citing CONTEXT.md/ADR/issue>
- Decisions needed from human: <NEEDS-HUMAN items, or "none">

### Task 1: [tdd] <thin vertical slice>
- [ ] <behavior to implement>
- [ ] <test asserting it through the public interface>

### Task 2: [direct] <slice>
- [ ] <UI/copy/config change>

## Success criteria
- [ ] <observable end-to-end outcome for the slice>
```

Validation is **not** restated per task — it's wired globally in `.ralphex/prompts/task.txt`.

## Gate #1 — plan approval

If `settings.gates.plan_approval` is `true` (B-mode), **stop and present to the human**:

- the plan `docs/plans/issue-N.md`,
- the live `CONTEXT.md` / ADR edits (show `git diff`),
- the "Decisions needed from human" list.

Tell the user the next step: review/edit, then run `ralphex docs/plans/issue-N.md`.

If `plan_approval` is `false` (A-mode), skip the pause and proceed straight to launching Ralphex.
