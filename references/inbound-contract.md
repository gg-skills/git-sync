# Inbound Sync Contract (Pull From Origin)

## Scope

Use this flow for the current working tree:

- root repo `.`
- every configured submodule path declared in `.gitmodules`

## Repo Order

Operate in this order:

1. configured submodules
2. root repo

This keeps submodule repository conflicts local first and lets the root repo resolve gitlinks to
the already-chosen submodule merge SHAs.

## Preflight Commands

```bash
git status --short
git branch --show-current
git rev-parse --abbrev-ref '@{upstream}'
git config --file .gitmodules --get-regexp '^submodule\..*\.path$'
git submodule sync
git submodule update --init --recursive
```

Run the branch and upstream checks again inside each configured submodule.

## Checkpoint Policy

When local dirt must be preserved before pulling:

1. Create checkpoint commits in dirty submodules first.
2. Update root gitlinks.
3. Create the root checkpoint commit last.

Suggested checkpoint message:

```text
chore(sync): checkpoint before pulling origin
```

## Pull Contract

Use merge-based pulls by default:

```bash
git pull --no-rebase origin <branch>
```

Do not use blanket recursive commands such as:

```bash
git submodule foreach "git pull"
```

## Conflict Resolution Order

1. Resolve conflicts inside the submodule repository where they occur.
2. Commit the finished submodule merge.
3. Pull the root repo.
4. If the root repo reports gitlink conflicts, set those gitlinks to the intended submodule `HEAD`
   SHAs chosen by the finished submodule merges.
5. Resolve any remaining root content conflicts.

## Verification

```bash
git status --short
git rev-list --left-right --count HEAD...@{upstream}
git submodule sync && git submodule update
```

Success means:

- every repo is clean
- every repo is attached to the intended local branch
- no repo is behind its upstream
- restoring configured submodules leaves the root repo clean
