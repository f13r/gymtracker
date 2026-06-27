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

## Stranded local branch (never pushed)

A second, distinct failure mode leaves an in-review task stuck: the work is
committed only on a **local** `fusion/fn-XXX` branch that was never pushed to
`origin`, so no PR exists and the merger has nothing to land. Worked example:
FN-010 (landed via FN-017 as PR #21, squash-merge `5207732`).

### Symptom

- The task sits in **In Review** but the merge step has no PR to act on.
- The branch exists locally (and in its worktree) but is absent from `origin`.
- Because `main` keeps advancing, the stranded branch usually no longer merges
  cleanly (dependency/lockfile drift in `package.json` / `package-lock.json`).

### How to detect it

```sh
# Branch missing from origin (only other fusion/* branches listed):
git ls-remote --heads origin 'fusion/*'

# No PR for the branch in either open or closed state:
gh pr list --repo f13r/gymtracker --state all
```

### Drift check before landing

Always confirm whether the stranded branch still merges cleanly before pushing:

```sh
git fetch origin
git merge-tree $(git merge-base origin/main fusion/fn-XXX) origin/main fusion/fn-XXX \
  | grep -c '<<<<<<<\|changed in both\|added in both'   # 0 == clean
```

### Supported recovery

```sh
# 1. Rebase the stranded branch onto current origin/main (resolve conflicts;
#    for package.json keep the UNION of both sides' dependencies).
cd .worktrees/<branch-worktree>
git fetch origin && git rebase origin/main

# 2. Regenerate the lockfile from the merged manifests — never hand-merge it.
npm install
git add package-lock.json apps/web/package.json && git rebase --continue

# 3. Re-verify package-scoped (not the full workspace suite):
npm run test --workspace=apps/web -- --reporter=dot
npm run lint
npm run build --workspace=apps/web

# 4. Push the rebased branch and open the PR (never pass a worktree PATH to --repo).
git push origin fusion/fn-XXX
gh pr create --repo f13r/gymtracker --base main --head fusion/fn-XXX \
  --title "FN-XXX: <summary>" --body "<links the in-review task>"

# 5. Re-check drift is 0, then squash-merge and delete the branch.
gh pr merge <n> --repo f13r/gymtracker --squash --delete-branch
gh pr view <n> --repo f13r/gymtracker --json number,state   # expect MERGED
```

### Proof of landing

```sh
git fetch origin
git merge-base --is-ancestor <squash-merge-sha> origin/main   # exits 0
git show origin/main:<a-file-only-on-the-branch>              # succeeds
```

> Note: the same stranded-branch pattern affects FN-006 (entangled with its
> duplicate FN-008); landing it needs this same recovery procedure.
