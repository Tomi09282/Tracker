# Handoff — where TRACKER stands (2026-11-11)

First written on 2026-11-07 when the owner handed the work to a second developer; rewritten on 2026-11-11 after
the Pulse redesign went into `master`. Everything described as done is on `master` (merge commit `ad3637e`,
PR #6).

## 1. Branches

| Branch | What | State |
|---|---|---|
| `master` | Everything: coach tooling, Pulse redesign, LifeOS, Admin v2, Hungarian + German exercise texts | `ad3637e`. The only long-lived branch. |
| `restyle/ux-engine-2.0` (remote) | An older restyle line | Not touched by this work. |

`pulse-redesign`, `pulse/X-exercise-i18n` (its content reached `master` through PR #2, a cherry-pick onto the
current tree) and the four `work/*` branches (`work/exercise-i18n`, `work/admin-v2-closing`,
`work/verify-015-isolation`, `work/profile-h1`) are merged (PRs #2–#6) and deleted.
`MASTER-MERGE.md` describes a local merge branch prepared on 2026-10-18; it is historical and was not used — the
merge was done through PR #6 instead.

## 2. What is done (all on `master`)

- Pulse V1 "Open Field" design on all 24 screens; LifeOS port (habits, tasks, day close, calendar, focus,
  capture, coins/XP, rewards, challenges, stackable roles + view switcher, Profile v2) — see `LIFEOS-REPORT.md`.
- Starter challenge pool (O2), offline cold start with a UI-only session hint (O1, plus the `/auth/me` refresh
  fix), plan-editor exercise picker with the muscle map (DEV-093).
- **Admin v2** (owner decisions 2026-11-03): per-account inspect/edit page, marketplace-post inspect page
  (take down / restore, no text editing), cleaner Moderáció with a statistics panel + detailed Statistics page.
  Closed on 2026-11-08: ADR `docs/brain/60-Decisions/0026-admin-v2-inspect-and-correct.md`, the screen inventory
  `docs/brain/58-Pulse/Screens/admin-v2.md`, the owner's report `ADMIN-V2-REPORT.md` (Hungarian). No migration
  was needed (the last one is **035**).
- **Coach tooling, plan A:** a client's equipment can be edited — a *Felszerelés* section in Settings and an
  editable equipment card on the coach's client screen (`PATCH /clients/:linkId/onboarding/equipment`, audited,
  notifies the client). `check-admin-audit` now also covers coach cross-user writes. ADR-0012 / ADR-0013.
- **Exercise translations:** Hungarian and German name / description / steps and an idempotent importer
  (`npm run import:exercise-translations`, `--dry` to preview; verified by `verify:import-translations`, 52 checks).
  **The importer has not been run on a real database yet** — only on throwaway ones.
- O4 (Profil page has an h1) and the `verify:015` isolation fix are done; `verify:015` now counts only its own
  food, so it no longer fails on a demo-seeded database.

## 3. Verified state

Run on 2026-11-11 at the tree that became `master` (`48b9d3f`, identical content to `ad3637e`), each on a fresh
database migrated to 35 with `seed:dev-users`:

| Check | Result |
|---|---|
| `cd backend && npm run check:all` | exit 0, nothing failed |
| `cd backend && npm run smoke` | 1364 passed, 0 failed |
| `cd backend && npm run smoke:limits` | 7 passed, 0 failed |
| `cd frontend && npm run build` | green (i18n 1691 keys × 3, nav-active 253 assertions, tsc, vite) |

> [!note] Known Windows flake
> `check:all`, `smoke` and `smoke:limits` can die in a setup step with exit status `3221225477`
> (`0xC0000005`, a native crash on process exit). It is not a code failure: the next run is green. Re-run before
> investigating. `verify:gates` refuses a dirty tree — commit first.

The repository has no CI configured, so nothing above runs automatically. `master` itself was not re-tested after
the merge (the content is the same as the tested tree).

## 4. What is NOT done

1. **Coach tooling plans B and C** were never started: opt-in filtering with the shared `ExercisePicker` and a
   filter sheet (`only_available`, `hide_conflicts`, multi-valued `equipment` on `GET /exercises`), and the
   builder / visual pass (half-height picker sheet, drag-to-reorder over the chevrons, volume heat map).
   Spec: `docs/pipeline/coach-tooling-spec.md` (CT-1.1–1.3, CT-2, CT-4, CT-5).
2. **Exercise translations — quality and rollout.** The Hungarian text got a fix pass after a review average of
   3.79/5; the fix was NOT re-scored and German was never reviewed. wger-derived rows are CC-BY-SA 4.0
   (attribution at `GET /sources`). Run the importer on the real database and look at the result in Hungarian
   before relying on it. Details: `backend/data/exercise-translations/README.md`.
3. **Admin v2 overview sheets** — need the approved frames, which live on the owner's machine (`.pulse/`, not in
   the repo).
4. **Moderáció is fragile:** one non-finite timestamp in the queue crashes the page (`useAgo`). The demo seed that
   produced one is fixed; the screen itself is not hardened. Also: the stats panel counts 9 reports where the tab
   shows 8 cases on test data; `audit_log` has index follow-ups; ADR numbers 0011 / 0012 / 0013 are used twice.
5. **Capture-tool items, not product code:** a superseded workout-3 capture (O3) and the admin SZINT row freeze
   (O5).
6. **Two UI bugs found while testing:** the home screen shows "Szabad edzés" for plan sessions whose log title is
   NULL (seeded logs), and no UI reaches `POST /workouts/start` with a null `plan_day_id` (freestyle start), while
   `workout.noneBody` advertises it.

## 5. Owner-side decisions still open

- **Migrations 030–035 are now on `master`.** If the other developer has branches that number migrations from 030,
  they have to renumber before merging.
- The 8 tab icons and 7 equipment stills (generated on the Higgsfield web), then `npm run assets:pulse`.
- Usage terms of the 49 AI-generated images; DEV-089…DEV-100 rulings (`deviations.md`).
- Admin v2: what a post's text should do when it is hidden and then edited (D1), and display-name markup.
- Exercise data: buying RepDB (701 exercises, one-time $299–$499) — ask for written confirmation that storing it
  in our own DB and storing translations is allowed. No source has Hungarian; Hungarian is machine-translated +
  reviewed.

## 6. How the work was organized (so you can keep or drop it)

One integrator ("INT") was the single writer of `pulse-int`; packages were built on `pulse/<id>` branches in
`tracker-wt/slot-N` worktrees, squash-merged one by one, each gated by the build chain. The local-only `.pulse/`
folder (git-ignored shared state) and the workflow scripts are not in the repo; the commit messages and the
`docs/pipeline/pulse/pkg/*` hand-ins carry the history. You do not need any of it: normal branches + PRs work.

## 7. Running it

```bash
cd backend && npm ci && npm run dev      # needs a validated .env (copy .env.example); migrations run at boot
cd frontend && npm ci && npm run dev     # Vite on :5173
```

Dev accounts come from `npm run seed:dev-users` (user@, coach@, admin@ `tracker.local`). Restart the backend after
pulling backend changes — a running process keeps serving the old routes. For checks, use a throwaway database
(`DB_PATH=<file> npm run migrate && npm run seed:dev-users`), never the dev database.
