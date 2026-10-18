# Merging pulse-redesign into master (prepared locally, 2026-10-18)

Owner decision (owner-answers.md, 2026-10-17): after the Pulse closing the orchestrator prepares the merge of
`pulse-redesign` with `master` **locally**; the owner reviews and pushes himself. Nothing was pushed and
`origin` was only fetched.

## Where it is

| What | Value |
|---|---|
| Worktree | `C:/Users/Petike/Documents/Cursor/tracker-wt/merge` |
| Branch | `merge/pulse-into-master` (local only, no upstream set) |
| Merge commit | `fd2ab85` "Merge pulse-redesign into master: the Pulse V1 \"Open Field\" redesign" (`--no-ff`) |
| First parent | `origin/master` = `2829c3a` (fetched 2026-10-18 02:44) |
| Second parent | `pulse-redesign` = `4c8fe22` (pulse(S-admin-routes)) |
| Size | 90 Pulse commits, 786 files changed, +303 425 / -25 925 lines |

## What master brought since 2829c3a

**Nothing.** `git fetch origin` shows `origin/master` still at `2829c3a` (2026-09-18, "The gate now refuses a
route that has quietly stopped existing, and the coach card no longer sends a save that changes nothing"), which
is the merge base of `pulse-redesign`. `git log 2829c3a..origin/master` is empty. The only other remote branch,
`origin/restyle/ux-engine-2.0` (`43cbd6a`), is not part of master and was not merged.

## Conflicts

**None.** Because master did not move, the merge is a pure addition of the Pulse line; the merged tree is
byte-identical to `pulse-redesign` (`git diff pulse-redesign merge/pulse-into-master` is empty). No file needed a
resolution, so no master behaviour could be lost.

## Migration numbers

| | Highest migration |
|---|---|
| master (`2829c3a`) | `029_display_name.sql` (user_version 29) |
| ours (`pulse-redesign`) | `030_retire_theme_packs.sql` (B-q2, user_version 30) |
| reserved | `031`-`035` for LifeOS |

Master took none of 030-035. The owner coordinates 030-035 with the other developer (owner-answers, 2026-10-17);
if the other developer lands a migration before this merge is pushed, it must be renumbered past 035 or ours
re-checked against `verify:migrations`.

## Build and check results (in the merge worktree)

| Step | Result |
|---|---|
| `frontend: npm ci` | ok |
| `frontend: npm run build` (all gates) | green |
| `backend: npm ci` | ok |
| `backend: npm run smoke` (hermetic, throwaway DB) | **593 passed, 0 failed** |
| `backend: npm run check:all` | 23 of 24 steps green; **`verify:015` red - pre-existing on master, see below** |

`check:all` reads and writes the database named by `DB_PATH`. It was run against a throwaway encrypted database
in the merge worktree (`npm run migrate`, then `seed-exercises`, `seed-dev-users`, `seed-demo` - the dev state the
probes assume), never against the running dev database; the throwaway files and the copied `.env` were deleted
afterwards. Because `check:all` is an `&&` chain, every step was also run on its own so the steps after the red
one are reported:

check:modules, check:routes, check:admin-audit, check:worker-tx, check:route-tx, check:body-writes, check:gdpr,
verify:schema (23), verify:migrations (6), verify:013 (30), verify:019 (56), verify:021 (38), verify:022 (44),
verify:023 (12), verify:024 (37), verify:025 (7), verify:rekey (12), verify:markdown (50), verify:last-admin (6),
verify:gates (23), verify:seats (20), verify:equipment (28), verify:030 (31) - all OK.

**`verify:015` - 29 passed, 1 failed: `FTS finds "Túró Rudi" when the user types "turo"`.** This is a master
defect, not a merge or Pulse one:

- reproduced on a clean detached checkout of `origin/master` (`2829c3a`) with the same seeding: same single
  failure, 29 passed, 1 failed;
- the probe expects exactly one hit for `turo*`, but `scripts/seed-demo.mjs` (master, 2026-08-24) seeds the
  manual food "Túró, félzsíros", which also matches `turo*`; on any demo-seeded database the probe sees 2 rows
  (on the long-lived dev database it sees more, because the probe's own inserts accumulate);
- Pulse did not touch `verify-015.mjs`, `seed-demo.mjs`, migrations 015 / 016 or the backend lockfile.

The fix belongs to the backend owner (e.g. make the probe match the row it inserted by id, or search a token only
it uses); it was not changed here.

## If pulse-redesign moves on before the push

The branch is a snapshot of `pulse-redesign` at `4c8fe22`. Packages are still being merged; to bring later Pulse
commits in, in the merge worktree:

```sh
git -C C:/Users/Petike/Documents/Cursor/tracker-wt/merge merge --no-ff pulse-redesign
```

(If `origin/master` moved too, `git fetch origin` first and `git merge origin/master` there, then re-run the
checks above.)

## What the owner runs to push

Review first:

```sh
git -C C:/Users/Petike/Documents/Cursor/tracker-wt/merge log --oneline --first-parent -3
git -C C:/Users/Petike/Documents/Cursor/tracker-wt/merge diff --stat origin/master merge/pulse-into-master
```

Then push the branch:

```sh
git -C C:/Users/Petike/Documents/Cursor/tracker-wt/merge push origin merge/pulse-into-master
```

and choose one:

- **Pull request** (review on GitHub): open a PR `merge/pulse-into-master` -> `master` at
  https://github.com/Tomi09282/Tracker (or `gh pr create --base master --head merge/pulse-into-master`), merge it
  there with "Create a merge commit".
- **Fast-forward master directly** (master has not moved, so this is a fast-forward to the merge commit):
  `git -C C:/Users/Petike/Documents/Cursor/tracker-wt/merge push origin merge/pulse-into-master:master`

Afterwards the worktree can be removed with
`git -C C:/Users/Petike/Documents/Cursor/tracker worktree remove C:/Users/Petike/Documents/Cursor/tracker-wt/merge`.
