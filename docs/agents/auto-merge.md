# Auto-merge troubleshooting: `error connecting to main`

This note documents a recurring failure in the Fusion manual/auto-merge step and
the supported workaround agents should use.

## Symptom

The Fusion manual-merge step fails for completed in-review tasks with:

```
error connecting to main
```

Affected merges never complete, and the corresponding tasks stay stuck in
**In Review** (observed for FN-002 → PR #18 and FN-004 → PR #19).

## Root cause

The merge tooling invokes `gh` with the **local worktree path** as the `--repo`
value instead of the GitHub `owner/repo` slug. For example:

```sh
gh pr view 18 --repo main/fusion/fn-002 --json number,state
```

Here `main/fusion/fn-002` is the on-disk worktree directory, not a repository
reference. `gh` parses a three-segment `--repo` value as
`host/owner/repo`, so it reads:

- host = `main`
- owner = `fusion`
- repo = `fn-002`

It then tries to reach a GitHub host literally named `main`, which does not
exist, and fails with `error connecting to main`. The PRs themselves are created
correctly against `f13r/gymtracker`; only the `--repo` derivation in the merge
step is wrong.

## Scope boundary — not fixable in this repository

The buggy `--repo` derivation lives in **Fusion's external orchestrator merge
machinery, which is not part of this repository**. There is no in-repo code path
to patch and no in-repo unit test to assert against. This document records the
root cause and the supported manual workaround; an upstream fix to the Fusion
merge tooling is tracked separately.

## Supported workaround

Always pass the GitHub `owner/repo` slug (`f13r/gymtracker`) to `--repo`:

```sh
# Inspect a PR
gh pr view <n> --repo f13r/gymtracker --json number,state,title

# Merge a PR (repo's standard strategy is squash)
gh pr merge <n> --repo f13r/gymtracker --squash
```

When `gh` is run inside a real clone it auto-infers the repository from
`git remote -v`, so you can omit `--repo` entirely in that case. The failure only
occurs when a worktree **path** is passed as `--repo`; never do that.

## Failing vs. correct form

|               | Command                                                    | Result                     |
| ------------- | ---------------------------------------------------------- | -------------------------- |
| ❌ Do not use | `gh pr view 18 --repo main/fusion/fn-002`                  | `error connecting to main` |
| ✅ Correct    | `gh pr view 18 --repo f13r/gymtracker --json number,state` | returns valid JSON         |

## Verification evidence (FN-005)

Running the correct form confirms both PRs merged and that there is no
`error connecting to main`:

```sh
$ gh pr view 18 --repo f13r/gymtracker --json number,state
{"number":18,"state":"MERGED"}

$ gh pr view 19 --repo f13r/gymtracker --json number,state
{"number":19,"state":"MERGED"}
```

Both merge commits are present on `main`:

```
f09dd2a FN-004: Move "Add set" button into the exercise header (#19)
dcb13d9 FN-002: Fix "beat last time" delta to per-exercise volume diff (#18)
```
