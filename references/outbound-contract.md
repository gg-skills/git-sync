# Outbound Publish Contract (Push To Origin)

## Scope

Root repo `.` plus every configured submodule path declared in `.gitmodules`.

## Commit and Push Order

| Step | Repo | Why |
|------|------|-----|
| 1 | Dirty configured submodules | Submodule commits must exist before the root can record their gitlinks. |
| 2 | Root repo | Root commit must be last so it captures the published submodule SHAs. |

## Pre-Publish Sync

Before any push, run the inbound sync flow (see `inbound-contract.md`).

This is mandatory because it:

- attaches configured submodule branches correctly
- prevents stale `origin` state from producing avoidable push rejections
- resolves submodule conflicts before the root repo updates gitlinks

## Push Policy

Push without force by default.

If a repo has no upstream:

- If `origin/<branch>` already exists, set the upstream explicitly and continue.
- If the remote branch does not exist, stop and ask before creating it.

If a push is rejected because the remote moved after the last pull:

1. Fetch `origin`.
2. Run one more `git pull --no-rebase origin <branch>`.
3. Resolve conflicts if needed.
4. Retry the push once.

If the repo still diverges after that retry window, stop and report instead of looping.

## Conflict Resolution Order

1. Resolve submodule repo conflicts first.
2. Commit the finished submodule merge.
3. Reconcile the root repo.
4. Resolve root gitlink conflicts to the published submodule `HEAD` SHAs.
5. Resolve any remaining root content conflicts.
6. Create the required follow-up root commit before pushing the root repo.

## Verification

```bash
git status --short
git rev-list --left-right --count HEAD...@{upstream}
git submodule sync && git submodule update
```

Success means every repo is clean, no repo is ahead of or behind its upstream, the root repo
records the published submodule `HEAD` SHAs, and restoring configured submodules leaves the
working tree clean.
