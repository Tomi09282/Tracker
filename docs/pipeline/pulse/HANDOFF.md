# Handoff — where TRACKER stands (2026-11-07)

Written when the owner handed the work to a second developer. Everything below is on the branch
`pulse-redesign` (= `pulse-int`, tip described by `git log -1`). `master` was NOT touched.

## 1. Branches

| Branch | What | State |
|---|---|---|
| `pulse-redesign` | The whole Pulse redesign + LifeOS port + Admin v2 | Pushed. Fast-forwardable from `origin/master` (2829c3a, 0 commits behind). |
| `pulse/X-exercise-i18n` | Hungarian + German exercise texts and an idempotent importer | Pushed, **not merged** into `pulse-redesign` (based on da2127e). |
| `master` | Untouched | Merging Pulse is the owner's decision, see `MASTER-MERGE.md` (its merge branch is stale — redo it from `pulse-redesign`). |

## 2. What is done (all merged on `pulse-redesign`)

- Pulse V1 "Open Field" design on all 24 screens; LifeOS port (habits, tasks, day close, calendar, focus,
  capture, coins/XP, rewards, challenges, stackable roles + view switcher, Profile v2) — see `LIFEOS-REPORT.md`.
- Since that report: starter challenge pool (O2), offline cold start with a UI-only session hint (O1, plus the
  `/auth/me` refresh fix), plan-editor exercise picker with the muscle map (DEV-093).
- **Admin v2** (owner decisions 2026-11-03): per-account inspect/edit page, marketplace-post inspect page
  (take down / restore, no text editing), cleaner Moderáció with a statistics panel + detailed Statistics page.
  Backend: `B-admin-accounts`, `B-admin-posts`, `B-admin-stats`, `B-admin-polish` (two security-review rounds).
  Frontend: `S-admin-accounts`, `S-admin-posts`, `S-admin-moderation`, `S-admin-fix`. No migration was needed
  (the last one is still 035).

## 3. What is NOT done

1. **Admin v2 closing** — the build workflow was interrupted three times (sessions ended) in its last phase.
   Missing: the ADR, the doc/brain sync for the admin screens, `docs/pipeline/pulse/ADMIN-V2-REPORT.md` (owner's
   report in Hungarian), the overview sheets, and a final end-to-end regression at the tip.
   `pkg/Admin-v2-closing/states.json` is the one closing artifact that exists (the role sheet with the step-up field).
2. **Verification at this exact tip** — only `npm run build` (frontend) was re-run after the last merge. Each
   package was green when merged (`check:all`, smoke 972 assertions, `verify:gates` 78). Re-run at the tip:
   `cd frontend && npm run build && npm run verify:gates`, `cd backend && npm run check:all && npm run smoke`
   (needs a throwaway env + DB, e.g. a fresh DB migrated to 35 with `seed:dev-users`).
3. **Exercise translations** — merge `pulse/X-exercise-i18n` (touches `backend/package.json`,
   `backend/scripts/brain-gen.mjs`, `.gitignore`, `docs/brain/20-Data-Model/exercises.md`; expect a trivial
   conflict). Facts: 1729 dataset exercises; names hu/de 100 %, descriptions ~48 %, steps ~50 % (the English source
   is the ceiling). The Hungarian text got a fix pass after a review average of 3.79/5; the fix was NOT re-scored,
   German was not touched. wger-derived rows are CC-BY-SA 4.0 (attribution at `GET /sources`). Details:
   `backend/data/exercise-translations/README.md`.
4. Known small items: Profil page without an h1 (O4), a superseded workout-3 capture (O3), admin SZINT row
   freeze (O5), `verify:015` failing on a demo-seeded scratch DB ("Túró Rudi" food search — passes on a clean DB,
   undiagnosed).

## 4. Owner-side decisions still open

- Merge Pulse into `master` (fast-forward is possible) — agree migrations **030–035** with the other developer first.
- The 8 tab icons and 7 equipment stills (generated on the Higgsfield web), then `npm run assets:pulse`.
- Usage terms of the 49 AI-generated images; DEV-089…093 rulings.
- Exercise data: buying RepDB (701 exercises, one-time $299–$499) — ask for written confirmation that storing it in
  our own DB and storing translations is allowed. No source has Hungarian; Hungarian is machine-translated + reviewed.

## 5. How the work was organized (so you can keep or drop it)

One integrator ("INT") was the single writer of `pulse-int`; packages were built on `pulse/<id>` branches in
`tracker-wt/slot-N` worktrees, squash-merged one by one, each gated by the build chain. The local-only `.pulse/`
folder (git-ignored shared state) and the workflow scripts are not in the repo; the commit messages and the
`docs/pipeline/pulse/pkg/*` hand-ins carry the history. You do not need any of it: normal branches + PRs work.

## 6. Running it

```bash
cd backend && npm ci && npm run dev      # needs a validated .env (copy .env.example); migrations run at boot
cd frontend && npm ci && npm run dev     # Vite on :5173
```

Dev accounts come from `npm run seed:dev-users` (user@, coach@, admin@ `tracker.local`). Restart the backend after
pulling backend changes — a running process keeps serving the old routes.
