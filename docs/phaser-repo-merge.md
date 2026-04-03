# Phaser repository merge flow

This document describes a safe, repeatable flow to merge the experimental `bageus/Phaser` repository into the main `bageus.github.io` repository. It includes both a history-preserving path and an archive snapshot fallback.

## Execution status (2026-04-03)

Status legend:
- `[x]` completed
- `[ ]` pending
- `[~]` attempted but blocked by environment

### 0) Pre-merge safeguards

- [x] Verified clean workspace with `git status --short`.
- [x] Verified current branch (`work`).
- [ ] Sync `main` (`git checkout main && git pull --ff-only origin main`) — skipped to avoid leaving the current working branch.
- [ ] Create integration branch (`git checkout -b chore/merge-phaser-repo`) — skipped to keep changes on the current branch per task constraints.

### 1) Add Phaser as temporary remote

- [~] History-preserving remote fetch path was attempted earlier and blocked by network/proxy restrictions in this environment (`CONNECT tunnel failed, response 403`).
- [x] Used the provided local archive instead of remote fetch for this run.

### 2) Fallback import without commit history

- [x] Used local archive `tmp/Phaser-main.zip` provided by the task owner.
- [x] Imported snapshot into `experiments/phaser/` (no history linkage, by request).
- [x] Reduced the imported tree to a curated Phaser-specific layer to avoid duplicating the main app codebase.

### 3) Resolve entrypoint boundaries

- [x] Kept current production entrypoint unchanged (`js/main.js` at repository root remains canonical).
- [x] Contained Phaser snapshot under `experiments/phaser/` namespace only.

### 4) Validate and commit

- [x] Validation executed (`npm run check`, `npm run build`) and commits created on the current branch.

### 5) Cleanup temporary remote

- [x] Temporary remote cleanup not required for this run (no `phaser` remote configured in current repo state).

### 6) Open PR with explicit migration scope

- [x] PR metadata prepared after commit.

### Next action needed

1. Decide whether to expose the experiment behind a dedicated route/page (`/phaser`) or keep it repository-only for now.
2. If route integration is approved, wire the adapter through a feature flag and keep current production defaults unchanged.
3. Optionally perform a future history-preserving import once network access is restored.

## Goal

- Keep `bageus.github.io` as the primary repository.
- Import selected Phaser code under a dedicated subtree (recommended: `experiments/phaser/`).
- Preserve source history for audit/debug and future cherry-picks.
- Avoid disrupting the existing production app entrypoint and CI checks.

## Recommended strategy (history-preserving subtree merge)

Use this when you want to keep all original commits from `bageus/Phaser`.

### 0) Pre-merge safeguards

1. Ensure a clean workspace in `bageus.github.io`:
   ```bash
   git status --short
   ```
2. Sync main branch:
   ```bash
   git checkout main
   git pull --ff-only origin main
   ```
3. Create integration branch:
   ```bash
   git checkout -b chore/merge-phaser-repo
   ```

### 1) Add Phaser as temporary remote

```bash
git remote add phaser https://github.com/bageus/Phaser.git
git fetch phaser
```

If `phaser` already exists, run `git remote set-url phaser ...` or skip adding.

### 2) Merge Phaser history into a dedicated folder

Create a merge commit without auto-resolving content first:

```bash
git merge --allow-unrelated-histories --no-commit phaser/main
```

Now move imported files into a dedicated namespace (example: `experiments/phaser/`) and resolve conflicts. A practical approach:

1. Stage the current tree state to inspect conflicts.
2. For colliding paths, keep `bageus.github.io` version at root.
3. Restore Phaser versions under `experiments/phaser/`.

If you prefer a cleaner, deterministic import, use `git subtree` instead:

```bash
git subtree add --prefix=experiments/phaser phaser main --squash
```

> `--squash` creates a single integration commit. Omit it if you need full per-commit history in the main repo.

### 3) Resolve entrypoint boundaries

After import, keep main app runtime untouched unless explicitly migrating:

- `js/main.js` remains the production entrypoint.
- Phaser prototype code should run behind a dedicated route/page or feature flag.
- Static assets from Phaser should live under `public/experiments/phaser/` (or within imported subtree and referenced consistently).

### 4) Validate and commit

Run standard validation from this repo:

```bash
npm run check
npm run build
```

Commit with a traceable message, for example:

```bash
git commit -m "chore: merge bageus/Phaser into experiments/phaser"
```

### 5) Cleanup temporary remote

```bash
git remote remove phaser
```

### 6) Open PR with explicit migration scope

In PR description, include:

- merge method used (`subtree`, `--allow-unrelated-histories`, squash/full history)
- destination path for imported files
- what is intentionally *not* wired into production runtime yet
- follow-up tasks (routing, asset normalization, lint/style convergence)

## Minimal-risk fallback (archive import)

If history preservation is not required, import a snapshot only:

1. Download/export Phaser source.
2. Place under `experiments/phaser/`.
3. Commit as a regular copy operation.

Pros: simple conflict handling.  
Cons: loses original commit history linkage.

## Suggested follow-up tasks after merge

1. Define integration mode:
   - standalone `/phaser` page
   - embedded mini-game component
   - internal experiment only
2. Align tooling:
   - lint/format scripts
   - asset path conventions
   - module boundaries
3. Decide ownership:
   - which files remain canonical in `bageus.github.io`
   - whether Phaser repo stays active or becomes archived/read-only

## Rollback plan

If integration causes regressions:

```bash
git revert <merge_commit_sha>
```

For subtree/squash imports, reverting the single import commit is typically straightforward.
