# B-lifeos-polish — the LifeOS backend polish round (no migration)

Changes to the contracts of `pkg/B-core`, `pkg/B-habits-tasks`, `pkg/B-rewards-challenges`,
`pkg/B-calendar` and `pkg/B-focus` (`api.md` in each). TypeScript types: `frontend/src/lib/lifeos-api.ts`,
the additions arrive through `shared.patch` in this folder (types only). House rules unchanged:
`/api/v1`, cookie auth, `X-CSRF: 1` on writes, `{ error, code, requestId }`, `.strict()` bodies,
integer minor units (1 coin = 100), logical day keys. **No migration** (036 is not used).

## 1. LifeOS starts lazily (no client trick needed)

An account with a stored zone and no start day (migration 031's backfill from onboarding, the seeded
`user@` / `coach@` / `admin@`) used to answer `started: false` everywhere and `409 TIMEZONE_REQUIRED`
on every write. Now:

- The **first LifeOS read or write** after a zone exists starts LifeOS at the user's **logical
  today** (`readStartedPrefs`, inside the write's own IMMEDIATE transaction; on a read a single
  idempotent `UPDATE ... WHERE lifeos_started_on IS NULL`). Every route of `/lifeos/*`, `/habits`,
  `/tasks`, `/challenges`, `/rewards`, `/events`, `/calendar`, `/focus`, `/coins/wallet` qualifies.
- `PATCH /me/prefs` with the **already stored zone** starts it too (no zone change is spent:
  `timezoneChangeableAt` stays `null`).
- **Nobody is buried:** the start day is today, so no earlier day ever settles. The 7-day catch-up
  rule is unchanged for users who had started before.
- Without a zone nothing starts (`started: false`, writes `409 TIMEZONE_REQUIRED`), as before.

## 2. `taskRules` — the numbers the priority picker prints

`GET /tasks` (also before a zone, next to `started: false`) and `GET /lifeos/today` carry

```json
"rulesVersion": 1,
"taskRules": { "lowMinor": 500, "midMinor": 1000, "highMinor": 2000, "latePct": 50, "overdueMinor": 500 }
```

from the admin rule set in force (`taskLow` / `taskMid` / `taskHigh` / `taskLatePct` / `taskOverdue`):
"Alacsony 5 / Közepes 10 / Fontos 20" (tasks-1, task-form, capture). `GET /lifeos/today` already had
`rulesVersion`; `GET /tasks` gains it.

## 3. `nextEvent` — the first reminder (ma-1 "Trattoria Toscana · emlékeztető 18:30")

`GET /lifeos/today` → `nextEvent` gains

| Field | |
|---|---|
| `reminders` | the event's reminder offsets, minutes before the start, ascending (`[]` = none) |
| `firstReminder` | `{ minutesBefore, at, time }` — the reminder that fires FIRST (the largest offset), `at` in epoch seconds, `time` the wall clock in the user's zone ("18:30"); `null` without reminders |

## 4. MAI DOBÁS after the pick — from `GET /lifeos/today` alone

The picked task already carried `challengeId` in every task list (`tasks.due` etc.), so FELADATOK and
the MA a/b counters can leave it out. `challenge.picked` (also on `GET /challenges/today` and every
draw answer) gains:

| Field | |
|---|---|
| `title` | the picked task's title (the challenge's name at the pick) |
| `valueMinor` | the task's full value ("+15 érme") |
| `paidMinor` | what completing it paid; `null` while open or after a reopen |

`state: 'picked'` + `picked.done` decide "ELVÁLLALVA" / "TELJESÍTVE" (ma-1 / ma-2) without matching
the task lists.

## 5. Security review (`.pulse/review/security-lifeos`) — behaviour changes

| Attack | Before | Now |
|---|---|---|
| 01 milestone farm | streak milestones (cap-exempt) paid per HABIT: 20 bad habits crossing 100 days paid 20 × 500 on one day | a tier pays at most **once per account per window as long as the tier** (7-day once in any 7 logical days, 30 in 30, 100 in 100), whichever habit crosses first; every habit still records `milestoneDays` |
| 02 / 02b / 11 back onto a settled day | a zone switch westwards (or a day-start change on a DST night) made a closed day "today"; focus finish paid onto it | `PATCH /me/prefs` answers **409 `DAY_SETTLED`** `{ changeableAt }` (epoch ms) when the new today would be on or before the newest settled day, the old boundary's settled-through day, or the day before the start; task complete and focus finish on a settled today answer **409 `DAY_LOCKED`**; `postCoinEvent` throws on a settled day (backstop) |
| 05(a) zero-effort perfect day | one bad habit and nothing else = a 25-coin perfect day every day | the perfect day needs a **good habit that counts or the scheduled workout** (bad habits still count for "every habit done"; the clean day still pays) |
| 07 empty workout | any completed log ticked the day's workout (perfect day, Ma) | `workout.done` / the perfect day need a completed log with **≥ 1 working set done and ≥ `workoutHalfPct` of them** |
| 08 empty-session achievements | 100 empty start / finish pairs unlocked 325 coins of workout-count achievements in a minute | a session counts with a working set done **or** ≥ 10 minutes between the server's start and finish |
| 12 archive dodge | archive after a relapse / miss, the day closes without the habit, restore — the streak jumped over the bad day | the close also settles a habit archived **after the day ended**, and one archived **during** the day with a log on it; archive / restore run the lazy close first; archiving during a day with nothing logged leaves that day out (as Kihagyás does) |

New error code: `DAY_SETTLED` (PATCH /me/prefs, 409, with `changeableAt`). `DAY_LOCKED` is now also
answered by `POST /tasks/:id/complete` and `POST /focus/:id/finish`.
