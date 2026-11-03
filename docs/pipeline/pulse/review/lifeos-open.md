# LifeOS closing — open findings (2026-11-03)

Found by the LifeOS closing regression (INT, step `LifeOS-closing`) on `pulse-int` at `1be6042` and after.
Pictures: `.pulse/final-lifeos/` (git-ignored): one pair per frame under `pairs/`, one sheet per group
`overview-*.png`, the en / de captures under `lang/`, the offline cold start under `offline/`.

## Fixed in this step (integration level)

| # | Finding | Fix |
|---|---|---|
| F1 | `verify-013` crashed on a database seeded only by `seed:dev-users` (UNIQUE on `coach_clients`): its spare link re-used the already-linked coach / member pair | commit `1be6042`: it picks an unlinked pair |
| F2 | `brain-gen` refused to run (`server.js mounts routers this script does not know about: ../src/lifeos/routes.js`), so `30-API/Endpoints.md` had no LifeOS endpoint | the LifeOS router and its seven sub-routers are listed; 229 endpoints, schema v35 |
| F3 | The capture freeze lacked requests that later packages added to old screens: `GET /rewards` (user, admin — Profil's JUTALMAK row), `GET /me/prefs` (coach, demo N — the timezone bootstrap), `GET /my-plans/week?from=2026-10-16&days=1` (user). 18 states of S-settings, S-coins-xp, S-day-settings, S-workout and coach-dashboard-1 failed with `unrecorded` | recorded with `pulse-shot --record --only-missing` against the dev backend (GETs only; `.pulse/rec` is not in git). Every LifeOS and round-A state captures again (the superseded `workout-3` aside, O3) |

## Open (not fixed here), with the owning package

| # | Severity | Finding | Owner | Smallest fix |
|---|---|---|---|---|
| O1 | major (pre-existing, not a regression) | Offline cold start: a signed-in member who opens the app with no network lands on `/login` with "Nincs internetkapcsolat" above a working form, not on the shell. `RequireAuth` reads the failed `/auth/me` as "signed out". The service worker is fine (`tracker-shell-v2`, 111 entries); back online the app returns to Ma. Same as the 2026-10-17 sweep (`.pulse/sweep/b.md` row 7) | G-shell / INT (`src/app`) | keep the last known session for an offline start and show the shell with the offline line |
| O2 | owner | A new account's first daily draw has nothing to draw from (`409 EMPTY_POOL`): Ma says "A napi dobás a saját kihívásaid közül választ." until the member adds challenges at `/challenges/pool`. f_app ships a starter pool | B-rewards-challenges | owner decision: seed a starter pool per account, or keep "make your own" |
| O3 | minor | The `workout-3` state (a superseded round-0 frame, account N without a time zone) fails its capture: the signed-in shell's timezone bootstrap fires `PATCH /me/prefs`, which the capture guard blocks | S-workout states / INT capture | a stub for `PATCH /me/prefs` in that state, or retire the superseded state |
| O4 | minor | Profil (`/settings`) has no `h1`; every other LifeOS page has one (Szokások, Feladatok, Fókusz, Mai dobás, Jutalmak, Naptár, Haladás, Érmék, Nap és időzóna) | S-profile-v2 | make the name the page heading |
| O5 | minor | `settings-v2-2` (admin) draws no SZINT row: the admin's frozen `GET /coins/wallet` predates migration 031 and carries no level, so the row is correctly withheld; the picture differs from the frame for a data reason | INT (freeze) | re-record `GET /coins/wallet` for admin when the freeze is next refreshed |
| O6 | owner (waits on images) | The Naptár tab and the other new tab icons are placeholders (the hexagon), the 7 equipment stills are missing | owner (Higgsfield web) | generate from the prompt files, then the asset pipeline |

## Checked and passing

- Frontend: `npm run build` green; `npm run verify:gates` 78 passed, 0 failed, 7 dormant; tree back byte for byte.
- Backend (throwaway DB migrated to 35 + `seed:dev-users`): every `check:all` step green, verify-015 included
  (30 passed); `npm run smoke` 806 passed, 0 failed.
- Roles (live, int build on a scratch backend): member — one lit tab on every member route, `/coach` and `/coach/plans`
  show the member bar and "Ez a felület edzőknek szól", `/compose` and `/admin*` refuse with no tab lit; coach —
  `Tag · Kliensek · Tervek · Pult`, `Tag` never lit, Profil > Edzői nézet -> `/coach`, `Tag` -> Ma; admin —
  `Tag · Edző · Moderáció · Fiókok · Piactér`, `/admin/rules` and `/admin/styles` light Moderáció. The user bar has
  the six tabs at 360 / 402 / 430 wide, no tab label overflows, no horizontal page scroll.
- Languages: all LifeOS packages captured in `en` and `de` (65 states each); no app string left in Hungarian (the
  only Hungarian left is user data and Chrome's own date / time field labels).
- Captures: every LifeOS frame (28) and every round-A frame (14) paired with the integration build.
