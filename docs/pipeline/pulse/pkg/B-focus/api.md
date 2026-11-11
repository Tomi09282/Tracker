# B-focus — focus sessions and the LifeOS statistics (migration 035, plan Phase 6)

The contract the Fókusz (focus-1 / focus-2 / focus-3), Ma (the FÓKUSZ block) and Haladás > Napok
(progress-days) lanes build against. TypeScript types: `frontend/src/lib/lifeos-api.ts` (the
Phase-6 block arrives through `shared.patch` in this folder). Server truth:
`backend/src/lifeos/focus-routes.js`, `stats-routes.js` (zod schemas), `backend/src/db/tx/lifeos-focus.js`,
`lifeos-stats.js` (answers), `backend/src/lifeos/focus.js`, `stats.js` (the rules, pure),
`backend/src/db/migrations/035_lifeos_focus.sql`. The core contract (the day, the wallet, the cap)
is unchanged: `docs/pipeline/pulse/pkg/B-core/api.md`, `pkg/B-habits-tasks/api.md`.

House rules as before: `/api/v1`, cookie auth, `X-CSRF: 1` on writes, `{ error, code, requestId }`,
every body / query `.strict()` (an unknown key is a 400). Amounts are integer minor units (1 coin =
100); **1 point = 1 coin**. Day keys are the user's logical days. **Focus times are epoch SECONDS**
(as `doneAt` / `completedAt`); `startTime` / `endTime` are the user's wall clock.

## The economy of a focus block (f_app `focus.ts`, rules admin-global)

| What | Pays |
|---|---|
| **Befejezés** (finish) a running or ran-out block | `focus.finish` = round(minutes × `focusPointsPerHour` / 60) + check-ins × `focusCheckinPoint` — default 20 / hour, +2 per check-in; minutes = the whole minutes spent, capped at the planned length (focus-3: 50 × 20 / 60 = 16.7 → **17**, + 3 × 2 = **+23**) |
| **Feladás** (cancel) | nothing, nothing to reverse |
| **Rajta vagyok** (check-in) | nothing at once — it raises the count the finish pays +2 for |

- Paid **once** per block, on the user's **logical today at the finish**, through the one
  `postCoinEvent`: the **400-coin daily earn cap** trims it (`capped: true`), never refuses it.
- **Daily focus limit: 480 paid minutes per logical day.** A finish beyond it still closes the block;
  it pays for the minutes left under the limit, and only the check-ins those minutes cover
  (`paidMinutes < elapsedMinutes` on the session shows the trim).
- **Check-ins are paced by the clock:** at most floor(elapsed / interval) are answerable (focus-2's
  "1 / 3" at 15 of 50 minutes, every 15), the block holds floor((planned − 1) / interval) in all (the
  interval's multiples strictly before the end: 50 / 15 → 3, 50 / 25 → 1), and two closer than
  **5 minutes** count once (a double tap, or catching up late, cannot farm the bonus).
- **One unfinished block per user** (planned, running or ran out). A ran-out block waits for
  Befejezés / Feladás; it blocks a new start until answered (409 `FOCUS_OPEN` carries it).
- At most **48 blocks started per logical day** (`LIMIT_REACHED`, `limit: 48`).
- Nothing a client sends reaches an amount: no minutes, no finish time, no amount. The one time a
  client may name is a **planned** start (`startAt`), and the past is refused — a block only pays for
  minutes that pass after it was made.

The database proves it again (migration 035): the plan is frozen after the insert, check-ins are
paced by the row's own clock, a finish cannot pay more minutes than passed or check-ins than were
answered, a closed block is history, and a `focus.finish` event must point at a DONE block of the
same account on its close day, worth at least the amount.

## The session (`FocusSession`)

```json
{ "id": 41, "title": "Szakdolgozat – 3. fejezet", "status": "active",
  "startsAt": 1792609800, "endsAt": 1792612800, "startTime": "21:10", "endTime": "22:00",
  "plannedMinutes": 50, "elapsedMinutes": 15, "remainingSeconds": 2082,
  "checkinMinutes": 15, "checkinsDone": 1, "checkinsMax": 3, "checkinDue": false,
  "nextCheckinAt": 1792611600, "lastCheckinAt": 1792610718,
  "expectedMinor": 2300, "payoutNowMinor": 700,
  "closedAt": null, "closedOn": null, "paidMinutes": null, "paidCheckins": null,
  "awardedMinor": null, "capped": false }
```

| Field | Screen |
|---|---|
| `status` | `planned` (Ma "Következő blokk") · `active` (focus-2) · `ended` (ran out: answer it) · `done` (focus-3) · `cancelled` |
| `startTime` → `endTime` | focus-1 head "21:10 → 22:00", focus-2 "21:10 · … · 22:00", focus-3 "21:10 – 22:00" |
| `remainingSeconds` | focus-2 countdown "34:42" (correct with the answer's `now` for clock skew) |
| `elapsedMinutes` / `plannedMinutes` | focus-2 "15 / 50 perc", the progress line |
| `checkinsDone` / `checkinsMax` | ELLENŐRZÉS "1 / 3"; focus-3 "3 / 3" |
| `checkinDue` | the lime "Rajta vagyok" pill is live |
| `expectedMinor` | focus-1 "Várhatóan +23 érme" (the whole plan, every check-in answered) |
| `payoutNowMinor` | what Befejezés would pay now (before the daily coin cap) |
| `paidMinutes`, `paidCheckins`, `awardedMinor`, `capped` | focus-3 "50 PERC", "+23 jóváírva" |

## GET /focus/current → `FocusCurrentResponse`

`{ started, today, now, session: FocusSession | null, todayMinutes, rules }` — `rules` =
`{ pointsPerHour, checkinPoint, maxMinutesPerDay, minCheckinGapMinutes, minMinutes, maxMinutes,
maxCheckinMinutes }` so focus-1 can draw its estimate before a block exists. Before a zone is set:
`started: false`, `session: null`.

## GET /focus → `FocusListResponse`

`{ started, today, now, sessions }` — the open block first, then the newest closed ones (at most 50).

## GET /focus/:id → `{ now, session }`

404 for a missing id or another account's block (indistinguishable).

## POST /focus → 201 `{ session }` (200 `{ session, replayed: true }`)

`{ clientKey, title (1..120), minutes (5..720), checkinMinutes (0 | 5..180), startAt? (epoch s) }`.
focus-1 offers minutes 25 / 50 / 60 / 90 / 120 and check-ins Nincs (0) / 10 / 15 / 30. `startAt`
absent = now; up to 2 minutes in the past is read as now; further back or more than 24 h ahead is
400. The same `clientKey` answers the first block whatever the body. 409 `FOCUS_OPEN` (+ `session`)
while another block is open; 409 `TIMEZONE_REQUIRED`; 409 `LIMIT_REACHED` (`limit: 48`).

## POST /focus/:id/checkin → `{ session, counted }`

Empty body. `counted: true` — the check-in counted. `counted: false, reason: 'not_due'` — the clock
has not earned another one yet; `reason: 'too_soon'` — within 5 minutes of the last. Both are 200
(the tap was answered). 409 `FOCUS_NOT_ACTIVE` (+ `session`) when the block is not running (planned,
ran out, closed); 409 `FOCUS_NO_CHECKINS` for a block without check-ins. Moves no coin.

## POST /focus/:id/finish → `{ session, awardedMinor, capped }` | `{ session, already: true, awardedMinor, capped }`

Empty body. Settles due days first, then pays (see the economy). `awardedMinor` may be 0 (a block
finished in its first minute, the daily focus limit used up, or the cap reached). A second finish
answers `already` with the same award and pays nothing. 409 `FOCUS_NOT_STARTED` for a planned block,
409 `FOCUS_CLOSED` for a cancelled one.

## POST /focus/:id/cancel → `{ session }` | `{ session, already: true }`

Empty body. Pays nothing. 409 `FOCUS_CLOSED` for a finished block (a paid block cannot become a
free one).

## Errors shared by every focus route

`401` anonymous · `403` no `X-CSRF` · `400 validation_error` · `404 not_found` (another account's
block too) · `409` with a `code`: `TIMEZONE_REQUIRED`, `LIMIT_REACHED`, `FOCUS_OPEN`,
`FOCUS_NOT_STARTED`, `FOCUS_NOT_ACTIVE`, `FOCUS_NO_CHECKINS`, `FOCUS_CLOSED`.
Limits: reads 600 / 15 min per IP; writes 300 per IP and 200 per account; check-in + finish 120 per
account.

## GET /lifeos/today (Phase-6 field)

Adds `focus: TodayFocus` — Ma's FÓKUSZ block ("Mélymunka – szakdolgozat · Következő blokk · 25
perc · +8 érme · 14:00" = a `planned` `current` with `plannedMinutes` 25, `expectedMinor` 800,
`startTime` "14:00"):

```json
{ "focus": { "current": { "...": "FocusSession | null" }, "todayMinutes": 50, "todaySessions": 1,
             "todayEarnedMinor": 2300, "maxMinutesPerDay": 480 } }
```

## GET /lifeos/days?from&to → `LifeosDaysResponse`

Both or neither (neither = the last 14 logical days ending today); `from <= to`, at most 92 days.
Settles due days first. One row per day, ascending (f_app `pointsHistory` + the settled facts):

```json
{ "date": "2026-10-17", "status": "closed", "netMinor": 5700, "earnedMinor": 5700, "lostMinor": 0,
  "penalties": 0, "perfect": true, "workoutDue": false, "workoutDone": false,
  "kcalTarget": 2200, "kcalEaten": 2140.5, "kcalOutcome": "hit",
  "habitsScheduled": 4, "habitsDone": 4, "tasksDue": 1, "tasksDone": 1, "focusMinutes": 50 }
```

`status`: `closed` / `lapsed` (settled) · `open` (not settled yet: kcal and the workout-done flag are
live, habit / task counts null) · `before_start` · `future`. Money is summed by the movement's logical
day, reversals included (a reopened task nets 0); `penalties` counts negative movements that are not
reversals.

## GET /lifeos/stats?days&weeks → `LifeosStatsResponse`

`days` 7..28 (default 14), `weeks` 1..12 (default 4). Settles due days first. Haladás > Napok in one
snapshot:

| Block | progress-days |
|---|---|
| `week` `{ from, to, netMinor, avgPerDayMinor, daysElapsed, prevWeekNetMinor }` | EZEN A HÉTEN "490 érme · átlag 70 / nap · előző hét 339" (average over the days elapsed Monday..today) |
| `days[]` (oldest first, the last = today) `{ date, status, netMinor, earnedMinor, lostMinor, perfect }` | the 14 columns |
| `weeks[]` (newest first) `{ weekStart, weekEnd, isoYear, isoWeek, netMinor, earnedMinor, lostMinor, perfectDays, penalties, current }` | HETEK "42. hét · okt. 12–18. · 1 tökéletes nap · +490", "3 büntetés" |
| `habits { from, to, rows[] }` — every live habit: `{ id, name, kind, scheduleType, streak, cells[] }`, `cells` = the settled days before today (`days` − 1), `state` `done · partial · frozen · missed · relapse · skipped · open · lapsed · none` | SZOKÁSOK "okt. 5–17.", "12 NAP ×1,25", the SegmentBar (lit = done, half = partial / frozen, off = missed) |
| `kcal { from, to, targetKcal, days[], overDays, hitDays, trackedDays, windowDays, penaltyMinor, rewardMinor }` | KALÓRIA "cél 2200 kcal", "4 nap a cél fölött a 13-ból · −10 érme naponta" |
| `overview { xp, level, bounds, balanceMinor, spendableMinor, daysTracked, perfectDays, workouts, focusSessions, focusMinutes, bestStreak, activeStreaks }` | f_app `overview()` |

Before a zone is set: `started: false`, `week / habits / kcal` null, `days / weeks` empty, the
overview still answers. Limits: 600 / 15 min per IP.

## GET /coins/ledger

`sourceType` is also `focus` (the block's id) for `focus.finish`.

## GDPR

The export adds `focus_sessions` (`client_key` is the user's own idempotency key, not a secret).
