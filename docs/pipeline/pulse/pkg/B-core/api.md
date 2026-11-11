# B-core — the LifeOS core API (migration 031, plan Phase 2)

The contract the screen lanes build against. TypeScript types: `frontend/src/lib/lifeos-api.ts`
(arrives through `shared.patch` in this folder). Server truth: `backend/src/lifeos/routes.js`
(zod schemas), `backend/src/db/tx/lifeos.js` (answers), `backend/src/db/migrations/031_lifeos_core.sql`.

Conventions (unchanged house rules): all under `/api/v1`, cookie auth (`requireAuth`), CSRF header
`X-CSRF: 1` on writes, errors are `{ error, code, requestId }`, every body / query is a `.strict()`
zod schema (an unknown key is a 400). Money is integer minor units (1 coin = 100); **1 LifeOS point =
1 coin**. XP and levels are whole points. Day keys are `YYYY-MM-DD` in the user's own zone.

## The day

- The **logical day** starts at the user's `dayStartHour` (0 / 2 / 4 / 6, default 4) on the WALL
  CLOCK of their zone — 02:30 with a 04:00 start belongs to yesterday. DST-safe (verified on
  2026-03-29 and 2026-10-25, Europe/Budapest).
- A day **settles** at the start of the next day + 6 h (04:00 start -> yesterday settles at 10:00).
  Settling is lazy: `GET /lifeos/today` and `GET /coins/wallet` settle what is due before answering.
  At most 7 past days settle with coins; older gaps settle as `lapsed` (no coins, no penalty).
- LifeOS **starts** the first time a zone is known (`startedOn` = the logical today then). Nothing
  before it settles.
- Workouts keep their CALENDAR date (`workout_logs.local_date`, the date in the user's zone when the
  session started) — `workout.date` on today, and the day a workout counts for at the day close.

## GET /me/prefs

`200 { prefs: UserPrefs }` · `401` anonymous · `400` any query key.

```json
{ "prefs": { "timezone": "Europe/Budapest", "dayStartHour": 4, "startedOn": "2026-10-18",
             "utcOffsetMinutes": 120, "today": "2026-10-18", "timezoneChangeableAt": null } }
```

## PATCH /me/prefs

Body (`.strict()`, at least one key): `{ timezone?: IANA string, dayStartHour?: 0 | 2 | 4 | 6 }`.
The zone is regex-bounded AND must be known to the server's ICU data.

- `200 { prefs }` — applied. Re-sending the current zone is a no-op (send the browser zone silently
  on every app open; it never spends the allowance).
- `409 { code: 'TIMEZONE_TOO_SOON', changeableAt: <epoch ms> }` — the zone changed less than 24 h ago.
- `400` validation · `401` · `403` without `X-CSRF`.
- Every zone change and day-start change is audited (`lifeos.prefs.timezone`, `lifeos.prefs.day_start`).
- Limits: 60 / 15 min per IP, 30 / 15 min per account.

## GET /lifeos/today (Phase-2 fields)

`200 LifeosToday` · `401` · `400` any query key (a client cannot pick the day).

```json
{
  "started": true, "timezone": "Europe/Budapest", "dayStartHour": 4, "startedOn": "2026-10-11",
  "today": "2026-10-18", "settledThrough": "2026-10-17", "rulesVersion": 1,
  "wallet": { "...": "as GET /coins/wallet" },
  "workout": { "date": "2026-10-18", "due": true, "done": false, "pointsFull": 30,
               "occurrences": [ { "planId": 4, "planName": "Erő", "dayId": 9, "dayName": "Push",
                                  "isRest": false, "estMinutes": 60, "startTime": null,
                                  "exerciseCount": 6, "logId": null, "logStatus": null } ] }
}
```

Before a zone is set: `started: false`, `today: null`, `settledThrough: null`, the wallet still answers
(`week: []`, `todayEarnedMinor: null`), and the workout uses the UTC date. Habits, tasks, the daily
draw, focus and nutrition join this answer in Phases 3-6.

## GET /coins/wallet (extended)

Was `{ balanceMinor }`. Now (settles due days first):

```json
{ "balanceMinor": -3500, "spendableMinor": 0, "xp": 2158, "level": 4,
  "bounds": { "levelFloorXp": 1600, "nextLevelXp": 2500 },
  "dailyEarnCapMinor": 40000, "todayEarnedMinor": 400, "today": "2026-10-18",
  "week": [ { "date": "2026-10-12", "netMinor": -1500, "future": false }, "... 7 days, Mon..Sun" ],
  "settleTime": "10:00" }
```

- `balanceMinor` **may be negative** (debt: "TARTOZÁS"); `spendableMinor = max(0, balance)`.
- XP is earned only by LifeOS awards (a reversal takes it back; penalties never reduce it;
  achievement rewards are not XP). `level = floor(sqrt(xp / 100))`; `bounds` are the current level's
  floor and the next level's threshold.
- `week[].netMinor` is the net of LifeOS events on that logical day.
- A store purchase still needs `spendable >= price` (an account in debt cannot spend: 409).

## GET /coins/ledger (extended)

Each entry gains `localDate`, `sourceType`, `sourceId`, `sourceTitle`, `reversesEventId` — non-null
for LifeOS movements (`refType: 'coin_event'`). `sourceTitle` is the workout's title for
`workout.completed`; day-level movements (`day.kcal_hit`, `day.kcal_over`, `day.perfect`) have
`sourceType: 'day'` and their `localDate`. New `reasonKey`s (labels in `reasonLabel`, English;
Hungarian copy is the screens' i18n): `workout.completed`, `day.kcal_hit`, `day.kcal_over`,
`day.perfect` in Phase 2; `task.done`, `habit.done`, `habit.clean_day`, `streak.milestone`,
`focus.finish`, `habit.missed`, `habit.relapse`, `task.overdue`, `reversal.credit`,
`reversal.debit` reserved for Phases 3-6.

## What pays in Phase 2 (no client endpoint pays anything)

| Movement | When | Amount (default rules) |
|---|---|---|
| `workout.completed` | after `POST /workouts/:id/finish`, fire-and-forget, once per workout, only while its day is open | 30 coins at >= 80 % of the working sets done, 15 at >= 50 %, else 0 |
| `day.kcal_hit` | day close, when the day's eaten kcal is within +/- 10 % of the active nutrition plan's target | +20 |
| `day.kcal_over` | day close, above the band (under-eating is never penalised) | -10 (may go below zero) |
| `day.perfect` | day close: a workout was scheduled AND done, and the kcal goal held when meals were tracked | +25 |

Every earn is capped at **400 coins per logical day** (the admin rule `dailyEarnCap`); an award over
the room left is trimmed (its ledger note says `capped`), never refused.

## GET /admin/rules (admin)

`requireRole('admin')` + `assertAdmin` (DB re-check). `200`:

```json
{ "current": { "version": 7, "rules": { "habitSuccess": 10, "...": "...", "dailyEarnCap": 400 },
               "note": "Fókusz 20 -> 25 / óra", "createdAt": 1792152720, "createdByName": "Takács Dániel" },
  "defaults": { "...": "DEFAULT_RULES" },
  "ranges": { "habitSuccess": [0, 500], "...": "..." } }
```

`403` for a coach or member. The rule keys and ranges are f_app's, with the two fractional rules in
basis points (`streakTier1MultBp` 12500 = x1.25, `streakTier2MultBp` 15000 = x1.5,
`badHabitRelapseFactorBp` 20000 = x2) plus `dailyEarnCap` (coins).

## PUT /admin/rules (admin)

Body (`.strict()`): `{ expectedVersion: int >= 1, rules: PointRules (every key, integers in range,
workoutHalfPct <= workoutFullPct, streakTier2Days >= streakTier1Days), note?: 1..280 chars }`.

- `200 { current }` — a new version is appended (history is never edited); applies from the next
  settlement / award.
- `200 { current, unchanged: true }` — identical to the rules in force; nothing written.
- `409 { code: 'RULES_STALE', currentVersion }` — another admin published since you loaded.
- `400` validation · `403` not an admin (JWT, DB re-read, and the transaction's own re-check of role
  and session under the write lock).
- Audited as `lifeos.rules.set` with the per-key diff. Limits: 20 / 15 min per IP, 10 per account.

## Other behaviour changes

- `POST /nutrition-log` refuses a `local_date` after the user's today (400); with no zone stored, one
  day ahead of UTC is still accepted.
- `plans/schedule.js` reads the zone from `user_prefs` (031 backfilled the never-written
  `onboarding_profiles.timezone`), so workout dates follow the user's zone once it is set.
- An admin acting as a trainer is seat-exempt (no client cap).
- An admin credit to an account in debt now lands even when it does not clear the debt; an admin
  debit still may not overdraw.
