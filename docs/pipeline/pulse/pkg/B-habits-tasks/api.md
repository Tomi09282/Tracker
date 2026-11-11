# B-habits-tasks — habits, tasks and the full day close (migration 032, plan Phase 3)

The contract the Ma / Szokások / Feladatok / Rögzítés lanes build against. TypeScript types:
`frontend/src/lib/lifeos-api.ts` (the Phase-3 block arrives through `shared.patch` in this folder).
Server truth: `backend/src/lifeos/habit-routes.js`, `task-routes.js` (zod schemas),
`backend/src/db/tx/lifeos-habits.js`, `lifeos-tasks.js`, `lifeos.js` (closeLifeDayTx),
`backend/src/lifeos/{habits,tasks,recurrence}.js` (the f_app rules, pure),
`backend/src/db/migrations/032_lifeos_habits_tasks.sql`. The core contract (the day, the wallet,
the cap) is unchanged: `docs/pipeline/pulse/pkg/B-core/api.md`.

House rules as before: `/api/v1`, cookie auth, `X-CSRF: 1` on writes, `{ error, code, requestId }`,
every body / query `.strict()` (an unknown key is a 400). Amounts are integer minor units (1 coin =
100); **1 point = 1 coin**. Day keys are the user's logical days.

## The two economic rules of Phase 3

- **Habits pay when their day settles** (plan L5). A habit write only records what the user says
  about a day; the day close pays it with f_app's amounts. The screens show `previewMinor` — what
  the day pays if it settles as it stands.
- **Tasks pay on completion**, on the logical today, trimmed by the 400-coin daily cap; a reopen
  reverses the award exactly while the completion's day is open.
- **Streak milestones (7 / 30 / 100 days: 25 / 100 / 500) are OUTSIDE the daily cap** (owner,
  2026-10-18): they neither meet the cap nor use it up. Migration 032 adds `coin_reasons.cap_exempt`
  and recreates the 031 cap trigger accordingly.

## The day close (lazy, unchanged triggers: `GET /lifeos/today`, `GET /coins/wallet`, every habit / task route)

One logical day settles at start(next day) + 6 h, oldest first, at most 7 days with coins; older
gaps lapse. A day now settles, in this order:

| Step | What | Coins (default rules) |
|---|---|---|
| habits | every live habit scheduled that day (f_app `settleHabit`) | see below |
| tasks | every open, dated task due on or before the day that was never found overdue — once | `task.overdue` −5 |
| kcal | as Phase 2 | `day.kcal_hit` +20 / `day.kcal_over` −10 |
| perfect day | see below | `day.perfect` +25 |
| summary | `daily_summaries` now holds habits scheduled / done and tasks due / done | — |

Habit outcomes (one immutable `habit_day_results` row per habit per scheduled day; its id is the
source of the day's habit coins, `sourceType: 'habit_day'`):

| Habit | Day | Outcome | Coins | Streak |
|---|---|---|---|---|
| good | count ≥ target | `done` | `habit.done` = base × multiplier | +1 |
| good | skipped | `skipped` | — | unchanged |
| good, daily / weekdays | not done, freeze held and streak > 0 | `frozen` | — (a freeze is spent) | unchanged |
| good, daily / weekdays | not done | `missed` | `habit.missed` −penalty | 0 |
| good | partial ≥ 50 % of the target | (as above) | + the floored share (f_app keeps the tap credit) | (as above) |
| good, times-per-week | not done, Monday..Saturday | `open` | — | unchanged |
| good, times-per-week | Sunday, quota not met | `missed` | `habit.missed` −penalty (once a week) | 0, week streak 0 |
| good, times-per-week | Sunday, quota met | (the day's own) | — | week streak +1 |
| bad | no relapse | `clean` | `habit.clean_day` = base × multiplier | +1 |
| bad | relapses | `relapse` | `habit.relapse` −min(count × penalty × 2, 30) | 0 |
| any | reaching 7 / 30 / 100 | (the day's own) | `streak.milestone` 25 / 100 / 500 (cap-exempt) | — |

The multiplier is the streak BEFORE the day: ×1.25 from 7 days, ×1.5 from 30. A freeze is earned
at every 30th day of a streak, at most 2 held. A lapsed gap writes one `lapsed` row per live habit
(streak 0, best and freezes kept) and marks the tasks that went overdue inside it — no penalty.

**Perfect day** = a habit that counts (done / missed / clean / relapse) or the scheduled workout
exists, every counted habit was done, every task due that day was completed (by that day), the
scheduled workout was done, and the kcal goal held when meals were tracked. Tasks alone never make a
perfect day (f_app requires a habit; the scheduled workout anchors one too, as in Phase 2).

## The edit window

A day's habit log can be written while the day is open: not in the future (400), not before the
habit's start day or the LifeOS start, not after its settle time (start(D+1) + 6 h) — then `409
DAY_LOCKED`. The database refuses every other writer too (`trg_habit_log_settled_*`). A task
completion can be reopened until its `completedOn` day settles (`409 DAY_LOCKED`).

## Errors shared by every habit / task route

`401` anonymous · `403` no `X-CSRF` · `400 validation_error` · `404 not_found` (also another
account's habit / task — indistinguishable) · `409` with a `code`:

| code | when |
|---|---|
| `TIMEZONE_REQUIRED` | a create / write before the browser zone was sent (`PATCH /me/prefs`) |
| `LIMIT_REACHED` (+ `limit`) | the 21st live habit, the 101st habit in all, the 301st open task |
| `DAY_LOCKED` | the day has settled (or the habit did not exist on it) |
| `NOT_SCHEDULED` | a weekdays habit on one of its off days |
| `WRONG_KIND` | count / skip on a bad habit, relapse on a good one, schedule edits on a bad one |
| `ARCHIVED` | a log write on an archived habit |
| `TEMPLATE` | completing a recurring template (complete its instances) |

Limits: reads 600 / 15 min per IP; habit writes 600 per IP and 300 per account; task writes 300 per
IP and 200 per account; complete / reopen 120 per account.

## Habits

### GET /habits → `HabitsResponse`

```json
{ "started": true, "today": "2026-10-19",
  "habits": [ {
    "id": 7, "name": "Nyújtás 10 perc", "kind": "good", "scheduleType": "daily", "weekdayMask": 127,
    "timesPerWeek": null, "targetCount": 1, "unit": null, "pointsSuccess": 10, "pointsPenalty": 5,
    "reminderTime": "21:30", "sortOrder": 2, "startedOn": "2026-08-03", "archived": false,
    "scheduledToday": true, "log": null,
    "streak": { "current": 31, "best": 45, "freezes": 1, "multiplierBp": 15000, "weekStreak": null },
    "weekDone": null, "previewMinor": 0, "fullMinor": 1500 } ],
  "rules": { "freezeEvery": 30, "maxFreezes": 2, "partialHabitMinPct": 50 },
  "limits": { "live": 20 } }
```

Live habits first (display order), then the archived ones. `log` is today's (`count`, `status`
`pending | done | skipped | relapse`, `doneAt` epoch seconds — the "kész 07:40"). `streak` is as
settled so far. Times-per-week habits carry `weekDone` (done days Monday..today: "0/3 ezen a héten")
and `streak.weekStreak` ("4 HÉT"). A bad habit's clean-day count is `streak.current`; its `log.count`
is today's relapses and `previewMinor` their penalty ("Ma 1 visszaesés · −10 érme").

### GET /habits/:id → `HabitDetailResponse`

`{ habit, from, days[], totals }` — the last 12 Monday..Sunday weeks of SETTLED days, newest first:
`{ id, date, outcome, count, targetCount, multiplierBp, streakAfter, milestoneDays, freezeEarned,
quotaMet, doneAt, coinsMinor }` (`coinsMinor` = the day's net for this habit: "+115" = 15 + the
30-day bonus). `totals`: `coinsMinor`, `done` (done + clean), `scheduled` (done / missed / clean /
relapse). Today is not in `days` (it has not settled); draw it from `habit.log`.

### POST /habits → 201 `{ habit }` (200 `{ habit, replayed: true }` on a replayed key)

`{ clientKey, kind: 'good' | 'bad', name (1..80), scheduleType?, weekdayMask? (with 'weekdays'),
timesPerWeek? (with 'times_per_week', 1..7), targetCount? (1..100), unit? (1..20), pointsSuccess?
(0..50), pointsPenalty? (0..50), reminderTime? 'HH:MM' }`. A bad habit takes only name, coins and
reminder. Defaults: the rules in force (good 10 / bad 15 per success, 5 per miss). The habit starts
on the logical today. `clientKey` is 8..64 of `[A-Za-z0-9_-]`; the same key answers the first habit
whatever the body.

### PATCH /habits/:id → `{ habit }`

Any of the create fields except `clientKey` and `kind` (at least one; schedule fields need
`scheduleType` in the same body). Applies to every day not yet settled.

### POST /habits/:id/archive · POST /habits/:id/restore → `{ habit }`

Empty body. Archived habits do not settle. Restore counts against the live cap. Idempotent.

### POST /habits/:id/log → `{ log, habit }`

`{ date?: DayKey, count: 0..100 }` — a GOOD habit's count, ABSOLUTE (a replay lands on the same
state), clamped to the target; at the target the log is `done`; 0 un-checks. The counted-habit
tap ("+1, wraps at full") is the client sending `count + 1` (or 0). Default day: today.

### POST /habits/:id/skip → `{ log, habit }`

`{ date?: DayKey }` — a good habit, skipped for the day (no coins, no penalty, streak kept). To
undo, log a count.

### POST /habits/:id/relapse → `{ log, habit }`

`{ date?: DayKey, count: 0..100 }` — a BAD habit's relapses that day, absolute ("undo one" =
`count − 1`).

## Tasks

### GET /tasks → `TasksResponse`

`{ started, today, due, overdue, anytime, completedToday, upcoming, done, templates, openCount,
limits }` — the five tabs: **Ma** = `due` (open, due today, by time, date-only last) +
`completedToday`; **Közelgő** = `upcoming` (open, the next 7 days); **Lejárt** = `overdue` (open,
due before today; `overduePenaltyMinor` once a settled day charged it — "1 lejárt teendő · −5 érme
levonva"); **Bármikor** = `anytime`; **Kész** = `done` (the last 7 days, at most 100).
`templates` are the recurring rules (never in a day list).

Each `Task`: `{ id, title, notes, priority (1 | 2 | 3), points (override 0..50 | null), dueOn,
dueTime, recurrence, isTemplate, parentTaskId, completedAt, completedOn, overdueOn, valueMinor (the
"+20"), lateNow, payoutNowMinor, paidMinor, overduePenaltyMinor }`. An instance carries its
template's `recurrence` (the repeat glyph + "hetente").

### GET /tasks/:id → `{ task }`

### POST /tasks → 201 `{ task }` (200 `{ task, replayed: true }`)

`{ clientKey, title (1..120), notes? (1..1000), priority? (default 2), points? (0..50 | null),
dueOn? DayKey, dueTime? 'HH:MM' (needs dueOn), recurrence? }`. `recurrence` (needs `dueOn`, the
first day): `{ type: 'daily', interval?: 1..30 } | { type: 'weekly', weekdayMask: 1..127 } |
{ type: 'monthly', day: 1..31 }` (a 31st clamps to short months). A template creates its instances
for today .. today + 7 at once; later ones appear as the days settle. **Capture (Rögzítés ·
Feladat) is this call** — "Ma" / "Holnap" / "Dátum" are `dueOn`, "Időpontban" adds `dueTime`.

A 02:30 due time with a 04:00 day start belongs to the logical due day and falls on the next
calendar date (f_app's rule), so "late" is judged against that instant.

### PATCH /tasks/:id → `{ task }`

Any create field except `clientKey`. A template cannot drop its recurrence (`409 conflict` — delete
it); an instance or a completed task cannot become a template. A changed template drops its open
instances from today on and materializes again.

### DELETE /tasks/:id → 204

Soft delete. Coins stay as they are (an award is not taken back, a penalty not refunded). Deleting
a template removes its future open instances. A second delete is 404.

### POST /tasks/:id/complete → `{ task, awardedMinor, late, capped }` | `{ task, already: true, awardedMinor: 0 }`

Empty body. Pays `taskLow / taskMid / taskHigh` (5 / 10 / 20) or the override, half when late
(after the due time; a date-only task from the next logical day), on the logical today, trimmed
by the daily cap (`capped: true`, `awardedMinor` may be 0). Completing a completed task pays
nothing (`already`).

### POST /tasks/:id/reopen → `{ task, reversedMinor }` | `{ task, already: true, reversedMinor: 0 }`

Empty body. Reverses the award exactly (`reversal.debit`; the balance may go below zero). After the
completion's day settles: `409 DAY_LOCKED`. Complete → reopen → complete pays once.

## GET /lifeos/today (Phase-3 fields)

Adds to the Phase-2 answer:

```json
{ "habits": [ "Habit … live habits scheduled today, plus every live bad habit" ],
  "tasks": { "due": [ "Task …" ], "overdue": [ "Task …" ], "completedToday": [ "Task …" ],
             "anytimeCount": 1, "openCount": 6 } }
```

Both are empty before a zone is set. The Ma hero ("MA 3/10", README-ma fix round 1) counts the
scheduled workout + the good habits with `scheduledToday` that are not times-per-week + the tasks
due today (`tasks.due` plus the `completedToday` ones whose `dueOn` is today). "Ma eddig +N" (fix
round 2) = the `paidMinor` of `completedToday` + every habit's `previewMinor` (a bad habit's is the
negative relapse preview); the clean-day pay, the kcal outcome and the perfect day come only when
the day settles.

## GET /coins/ledger

`sourceType` is also `task` (title = the task's) and `habit_day` (title = the habit's name).
New reason keys in use: `task.done`, `task.overdue`, `habit.done`, `habit.missed`, `habit.relapse`,
`habit.clean_day`, `streak.milestone`, `reversal.debit`, `reversal.credit`.

## Behaviour changes outside the new routes

- The pool waits for tasks with `atomics: 'async'`: terminating a worker blocked in `Atomics.wait`
  segfaulted `npm run migrate`, the seed scripts and the smoke setup on this machine; B-core's
  run-time V8 flag is removed. Every worker closes its connection before the pool is destroyed.
- `check-worker-tx` counts a call to a writing helper as a write (two new verify-gates probes).
- The GDPR export adds `habits`, `habit_logs`, `habit_day_results`, `tasks`.
