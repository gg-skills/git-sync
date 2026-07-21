---
name: git-sync
description: when configuring multi-submodule git workspace sync — inbound pulls, outbound publishes, submodule-first sequencing, dirty-workspace checkpointing. MCP-compatible. Not for flat repos.
---

# GG → Git Sync → Workspace Synchronization

> **Guidance age:** operational as of 2026-05-17. Verify command behavior against your project's
> current helper script implementations before responding with high confidence.

## When to Use

### Inbound (pull from origin)

**TRIGGER when:**

- The user asks to pull, update, or sync the working tree from `origin`.
- The working tree is dirty and the user wants work preserved before pulling.
- Submodule gitlinks need reattachment after a merge or conflict resolution.
- A prior pull left submodules in a detached or inconsistent state.

**SKIP when:**

- The goal is to push local changes to origin (use the Outbound workflow below).
- Only a single submodule needs updating without root-repo coordination.

### Outbound (push to origin)

**TRIGGER when:**

- The user asks to commit and push changes from the current working tree.
- `git status` shows dirty files in the root repo or configured submodules and the goal is to push to origin.
- The user wants to publish without manually sequencing root and submodule commits.

**SKIP when:**

- The request is refresh-only without creating publish commits (use the Inbound workflow instead).

## Common Safety Rules (Apply Both Directions)

| # | Rule | Rationale |
|---|------|-----------|
| 1 | Submodule-first ordering | Submodule commits and pulls must precede root-repo operations so root gitlinks always point to valid SHAs. |
| 2 | Dirty-workspace checkpointing | Checkpoint dirty submodules first, update root gitlinks, then checkpoint root last. Never stash — stashes do not update gitlinks. |
| 3 | Merge-based pulls by default | Use `git pull --no-rebase origin <branch>`. Never rebase unless the user explicitly requests it. |
| 4 | No blanket recursive commands | `git submodule foreach "git pull"` bypasses per-submodule conflict resolution and can corrupt gitlinks. Pull each submodule individually. |
| 5 | Single-writer safety | Do not run concurrent sync or publish operations against the same remote branch. |
| 6 | No forced pushes by default | Use merge-based reconciliation first; only force-push if explicitly asked. |
| 7 | Claim success only when every repo is clean, attached to its intended branch, and at upstream parity. | Partial success is not success. |

## Common Misconceptions

| # | Misconception | Correction |
|---|---------------|------------|
| 1 | `git pull --recurse-submodules` is safe | It bypasses per-submodule conflict resolution and leaves gitlinks inconsistent. |
| 2 | A dirty workspace must be stashed | Checkpoint commits preserve merge history and keep gitlinks valid. |
| 3 | Root repo should be pulled or pushed before submodules | Submodules must resolve first so root gitlinks point to the chosen merge SHAs. |
| 4 | Rebase is the default for clean history | Merge-based pulls are the default. |
| 5 | Only the root repo needs to be clean after publish | Every configured submodule must also be clean and at upstream parity. |
| 6 | Force-push is acceptable by default | Use merge-based reconciliation first; only force if explicitly asked. |
| 7 | Concurrent sync operations are safe | Single-writer safety: never run concurrent sync operations. |

## Quick Commands

```bash
# --- Diagnostic (run first, both directions) ---
git status --short
git branch --show-current
git rev-parse --abbrev-ref '@{upstream}'
git config --file .gitmodules --get-regexp '^submodule\..*\.path$'

# --- Submodule normalization (inbound preflight) ---
git submodule sync
git submodule update --init --recursive

# --- Inbound pull (per-repo, submodules first then root) ---
git pull --no-rebase origin <branch>

# --- Outbound push (per-repo, submodules first then root) ---
git push

# --- Verification (both directions) ---

# Check sync completeness (12-item checklist)
npx tsx .agents/skills/git-sync/scripts/check-sync-completeness.ts --session <dir>
```

## Sync Quality Checklist

Use this checklist before finalizing any sync operation.

| # | Checklist Item | Why It Matters | Gate |
|---|---------------|---------------|------|
| 1 | **Diagnostic run first** — git status, branch, upstream checked | Prevents blind operations | Pre-sync |
| 2 | **Submodule-first ordering** — Submodules synced before root | Gitlink integrity | Draft |
| 3 | **Dirty workspace checkpointed** — Checkpoint commits for dirty repos | Preserves work | Draft |
| 4 | **Merge-based pulls** — git pull --no-rebase, not rebase | History preservation | Draft |
| 5 | **Per-submodule pulls** — No blanket recursive commands | Conflict resolution | Draft |
| 6 | **Root gitlinks updated** — After submodule resolution | Point to valid SHAs | Draft |
| 7 | **Verification run** — git status clean, at upstream parity | Success verification | Closeout |
| 8 | **All repos at upstream parity** — Every submodule + root clean | Complete success | Closeout |

### Quality Tiers

| Tier | Criteria | Use When |
|------|----------|----------|
| **Minimal** | Items 1-3, 7 | Clean workspace, no dirty repos |
| **Standard** | Items 1-6, 7 | Dirty workspace with checkpointing |
| **Full** | All 8 items | Complex multi-submodule sync |

### Pre-Finalization Verification

Before declaring sync complete:

```
□ git status shows all repos clean
□ All submodules at upstream parity
□ Root repo at upstream parity
□ Gitlinks point to correct SHAs
□ No detached HEAD states
```

## Sync Consistency Validator

Before finalizing, verify:

### Consistency Check Matrix

| Check | What to Verify | How to Fix |
|-------|---------------|------------|
| **Submodule vs Root** | Submodules resolved before root | Reorder |
| **Dirty vs Checkpoint** | Dirty repos have checkpoint commits | Add commits |
| **SHA vs Gitlink** | Gitlinks match submodule SHAs | Update gitlinks |
| **Upstream vs Local** | All repos at upstream parity | Pull/push |

### Red Flags (Never Present)

- [ ] Root synced before submodules
- [ ] Dirty workspace without checkpoint
- [ ] Detached HEAD in any repo
- [ ] Gitlinks pointing to wrong SHAs
- [ ] Rebase used without explicit request
git status --short
git rev-list --left-right --count HEAD...@{upstream}
git submodule sync && git submodule update
```

For the exact contracts, see:
- [references/inbound-contract.md](references/inbound-contract.md)
- [references/outbound-contract.md](references/outbound-contract.md)

## Inbound Workflow (Pull From Origin)

### 1. Build scope from the current working tree

Inspect `.gitmodules`, current branch, and upstream in the root repo and every configured submodule.

### 2. Normalize the working tree before pulling

- `git submodule sync && git submodule update --init --recursive` when submodules may be missing or detached.
- For projects with helper scripts that reattach submodule branches, run those before pulling.

### 3. Choose the local-dirt policy explicitly

| Condition | Action |
|-----------|--------|
| Clean working tree | Pull directly. |
| Dirty working tree, user wants work preserved | Checkpoint dirty submodules first, update root gitlinks, then checkpoint root repo last. |
| Dirty working tree, user does not want automatic checkpoints | Stop and report which repos are dirty. |

Suggested checkpoint commit message:

```text
chore(sync): checkpoint before pulling origin
```

### 4. Pull from origin in repo order

Pull configured submodules first, then the root repo. For each repo: fetch `origin`, verify the
current branch has a usable upstream, then run merge-based pull.

If a submodule conflicts, resolve it there and commit the merge result before returning to the root
repo. After submodule pulls succeed, pull the root repo. If root reports gitlink conflicts, resolve
those gitlinks to the intended submodule `HEAD` SHAs before resolving any remaining root content
conflicts.

### 5. Validate the final state

Confirm every repo is clean, attached to the intended branch, and not behind upstream. Run
`git submodule sync && git submodule update` when optional configured submodules need restoration
to root-recorded gitlinks.

### Inbound Decision Guide

| Scenario | Recommended approach |
|----------|---------------------|
| Clean working tree | Pull directly with merge-based pulls. |
| Dirty working tree, preserve work | Checkpoint submodules first, then root, then pull. |
| Dirty working tree, no checkpoint | Stop and report dirty repos. |
| Submodule conflict | Resolve in submodule, commit, then pull root. |
| Root gitlink conflict after submodule merge | Stage submodule paths with their new SHAs, then resolve any root content conflicts. |
| Detached submodule | Run `git submodule update --init --recursive` before pulling. |

**Rule of thumb:** submodules always go first so root gitlinks resolve to known-good SHAs.

## Outbound Workflow (Push to Origin)

### 1. Build scope

Inspect `.gitmodules`, current branch, and upstream in the root repo and each configured submodule.

### 2. Commit local changes in publish order

Dirty configured submodules first, then the root repo. Keep commits repo-local. Update root
gitlinks after submodule commits land. Create the root commit last so it records the current
submodule SHAs.

If the user did not supply a commit message, synthesize a concise conventional message that matches
the repo-local change surface. Do not silently squash multiple repos into one synthetic summary.

### 3. Reconcile with origin before pushing

Run the Inbound workflow (see above) before any push:

- attach configured submodule branches as needed
- perform merge-based pulls in submodule-first order
- resolve submodule conflicts first, then root gitlink conflicts to the chosen submodule merge SHAs

If the sync changed the root repo after submodule merges updated gitlinks, create the required
follow-up root commit before pushing.

### 4. Push in repo order

Configured submodules first, then the root repo. For each repo:

1. Verify the branch has a usable upstream.
2. Push without force by default.
3. If the push is rejected because origin moved after the last pull, fetch and run one more
   merge-based reconciliation cycle, then retry once.
4. If the repo still diverges after the retry window, stop and report instead of looping.

If a repo has no upstream:

- If `origin/<branch>` already exists, set the upstream explicitly and continue.
- If the remote branch does not exist, stop and ask before creating it.

### 5. Validate the final published state

After all pushes, confirm `git status --short` is empty in every repo, no repo is ahead of or
behind its upstream, and the root repo records the published submodule `HEAD` SHAs.

### Outbound Decision Guide

| Scenario | Recommended approach |
|----------|---------------------|
| Push rejected non-fast-forward | Fetch, merge-based pull, resolve conflicts, retry once. |
| Root gitlink conflict after submodule merge | Resolve to published submodule SHA, create follow-up root commit. |
| Submodule detached or on wrong branch | Run inbound reattachment step before committing. |
| No upstream configured | Set upstream explicitly if remote branch exists; ask before creating new remote branches. |

## Reference: Commands and Contracts

| File | Contents |
|------|----------|
| `references/inbound-contract.md` | Exact repo order, checkpoint policy, conflict-resolution sequence, and verification for pulling. |
| `references/outbound-contract.md` | Exact commit and push order, pre-publish sync requirement, push policy, conflict-resolution steps, and verification checklist for pushing. |

### Reference Loading by Task Type

| Task type | Load these files | Skip |
|-----------|-----------------|------|
| Diagnostic / inspection-first | Run preflight commands first; load nothing unless anomalies found | both contracts |
| Inbound: scope and ordering | `inbound-contract.md` | `outbound-contract.md` |
| Inbound: conflict resolution | `inbound-contract.md` | `outbound-contract.md` |
| Inbound: verification | `inbound-contract.md` | `outbound-contract.md` |
| Outbound: orientation / first use | `outbound-contract.md` | `inbound-contract.md` |
| Outbound: full publish with reconciliation | `outbound-contract.md` | `inbound-contract.md` |
| Outbound: commit-only without push | `outbound-contract.md` (commit order section) | `inbound-contract.md` |
| Conflict resolution during publish | `outbound-contract.md` (conflict resolution section) | `inbound-contract.md` |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Submodule stays dirty after pull | Gitlink mismatch between root and submodule HEAD | Run `git submodule sync && git submodule update` after resolving submodule conflicts. |
| Root repo shows submodule as modified after submodule pull | Gitlink not yet staged to the new submodule SHA | Stage the updated submodule path in root; commit if needed. |
| `no upstream configured` error on pull | Branch lacks tracking information | Run `git branch --set-upstream-to=origin/<branch> <branch>` or verify `.gitmodules` branch config. |
| Conflicts in multiple submodules | Divergent branches across submodules | Resolve each submodule fully before touching the root repo. |
| Submodule not initialized | Submodule not yet registered | Run `git submodule update --init --recursive` for missing submodules. |
| Push rejected with "non-fast-forward" | Origin moved after the last pull | Fetch, run one merge-based pull, resolve conflicts, retry once. See `outbound-contract.md`. |
| `git submodule update` still dirty after publish | Root gitlinks do not match pushed submodule SHAs | Ensure submodules were pushed before the root repo, then re-push the root. |

## Cross-Skill Coordination

- Use the host project's worktree update workflow when the request is to refresh a feature branch from `main` rather than sync with `origin`.
- Use the host project's worktree merge workflow when the request is to publish feature branches into `main`.
- Use `decisions/SKILL.md` when conflicts require a non-trivial judgment call about which history to keep.
- Use the host project's documentation sync workflow after conflict resolution if docs changed.
- Use the host project's agents sync workflow if the workspace sync touched guidance files.

## Local Corpus Layout

`references/` contains **2 files** with no nested subfolders:

| File | Description |
|------|-------------|
| `inbound-contract.md` | Repo order, checkpoint policy, branch attachment rules, conflict-resolution sequence, and verification for the inbound (pull) direction. |
| `outbound-contract.md` | Commit and push order, pre-publish sync requirement, push policy, conflict-resolution steps, and verification checklist for the outbound (push) direction. |

## Key Files

- `.gitmodules`
- `references/inbound-contract.md`
- `references/outbound-contract.md`
