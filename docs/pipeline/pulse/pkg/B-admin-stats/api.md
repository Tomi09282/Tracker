# B-admin-stats - API for the Moderation panel and the Statistics page

Backend half of owner decision (3) of 2026-11-03: a compact statistics panel at the top of Moderacio
(6 numbers + one 30-day curve, frames `admin-moderation-v2` / `-empty`) with a door row to a detailed
Statistics page (frames `admin-statistics-1` / `-2`). Frontend lane: S-admin-moderation.

No migration, no new table, no i18n key, no audit row (both are reads). Both routes are admin-only:
`requireAuth` + `requireRole('admin')` (the JWT hint) + `assertAdmin` (the DB re-check, so a demoted or
disabled admin whose token is still valid gets **403**). A member or coach gets 403, no session 401.

| Route | New file | Registered |
|---|---|---|
| `GET /api/v1/admin/stats` (additive `panel`) | `backend/src/admin/routes.js` (one import, one array element, one key in the JSON) | already |
| `GET /api/v1/admin/statistics?days=7\|30\|90` | `backend/src/admin/statistics.js` | `server.js` one mount line, `brain-gen.mjs` one router line |
| shared reconciliation | `backend/src/coins/integrity.js` (`coinIntegrity()`), `GET /admin/coins/audit` now calls it | - |
| cache | `backend/src/lib/ttl-cache.js` | - |

## What is NOT here, on purpose

* **No DAU/MAU.** The product has no `last_seen` (migration 025 header). The series is called
  `loggedPeople` = distinct people who logged a workout or a meal on a local day. The Statistics frame
  prints the honesty note next to it; the response has no `dau`, `mau`, `lastSeen` field (the smoke
  asserts that).
* **Counts only.** No query selects a name, e-mail, id, body, measurement or photo. The smoke scans the
  whole payload for `@`, `email`, `displayName`, `userId`, `"id":`.
* **No per-person drill-down.** The Statistics page cannot answer "who".

## Clocks (labelled on every series)

| `clock` | meaning | used by |
|---|---|---|
| `local_date` | the person's own day (`workout_logs.local_date`, `nutrition_log_items.local_date`), compared with UTC date keys | loggedPeople, completedWorkouts, nutritionLog, panel workouts |
| `utc` | server time of the event | signups, coins, `window` |
| `epoch` | an instant, rolling window | marketplace, system |

"Today" and the **end of every window is the UTC calendar date** at request time (`window.today`,
`panel.today`). There is no single platform timezone. A person whose local day is already ahead of
UTC (Auckland, 10:00 on the 4th while UTC is still the 3rd) is counted in the bucket for the 4th once
UTC reaches the 4th, so the "ma" tile can lag by hours for them. Windows are `days` consecutive date
keys **ending today and including it** (so `days=7` is today and the six days before; 7 points).

All series are **dense and ascending**: exactly `days` points, zero where nothing happened. A client
never needs to infer a missing day.

## Cache and cost

Every query starts from an index (EXPLAIN below). On top of that, results go through an in-process
**single-flight TTL cache** (`lib/ttl-cache.js`): concurrent first requests for a key run one
computation, later ones are served from memory, a failed computation is never stored. Never
invalidated (read-only analytics; there is no write path to hook). Per process under cluster.js.

| Cached | Key | TTL |
|---|---|---|
| `/admin/statistics` body | `statistics:<days>:<UTC day>` | 45 s |
| coin integrity verdict (shared by 7/30/90) | `coin-integrity` | 45 s (so the verdict can be up to ~90 s old) |
| `panel` scan half (`workouts`, `loggedPeople`) | `activity:<UTC day>` | 30 s |

**Live (never cached) on the panel:** `users`, `activeCoaches`, `moderationPending`, `openReports`. The
last two sit directly above the lists they count; a number that disagrees with the list under it for
30 s after a decision would read as a bug. A decision on the queue moves the panel at once.

Rate limits (production; skipped under `NODE_ENV=test` like every admin limiter): `/admin/statistics`
240 / 15 min per IP and **120 / 15 min per admin** (lower than the 600 / 300 admin-read budget, this is
the heavy page). Measured on a development-mode server: requests 1-120 -> 200, 121+ -> 429 with
`RateLimit-*` and `Retry-After`. `/admin/stats` keeps its existing 600 / 300 budget. The response has
`Cache-Control: no-store`.

### EXPLAIN QUERY PLAN (scratch DB migrated to 35, `seed:exercises` + `seed:dev-users` + `seed:demo`)

```
signups per day                SEARCH users USING COVERING INDEX users_created_idx (created_at>? AND created_at<?)
logged people (day / window)   SEARCH workout_logs USING COVERING INDEX workout_logs_date_idx (local_date>? AND local_date<?)
                               SEARCH nutrition_log_items USING COVERING INDEX nutrition_log_items_date_idx (local_date>? AND local_date<?)
completed workouts (day, 7d)   SEARCH workout_logs USING INDEX workout_logs_date_idx (local_date>? AND local_date<?)
nutrition per day              SEARCH nutrition_log_items USING COVERING INDEX nutrition_log_items_date_idx (local_date>? AND local_date<?)
coins minted / spent per day   SEARCH l USING INDEX coin_ledger_created_idx (created_at>? AND created_at<?) ; SEARCH r USING PRIMARY KEY (key=?)
open reports (panel)           SEARCH content_reports USING COVERING INDEX content_reports_status_fk_idx (status_key=?)
pending moderation (panel)     SEARCH exercises USING COVERING INDEX exercises_scope_idx (status=? AND owner_id>?)
active coaches / roster        SEARCH u USING INDEX users_role_idx (role=?) ; SEARCH c ... COVERING INDEX coach_clients_active_idx (coach_id=? AND status=?)
live sessions                  SEARCH t USING INDEX refresh_tokens_expiry_idx (expires_at>?) ; SEARCH u USING INTEGER PRIMARY KEY
integrity: unpaid purchases    SCAN p USING COVERING INDEX coin_purchases_item_idx ; SEARCH l USING COVERING INDEX coin_ledger_ref_uidx
integrity: wallet drift        SCAN w ; SEARCH l USING COVERING INDEX coin_ledger_sum_idx (user_id=?)
integrity: unbacked            SCAN e USING INDEX coin_entitlements_live_uidx ; SEARCH p USING INTEGER PRIMARY KEY
```

The windowed series (everything that grows with usage) are index range searches. Honest list of
**scans** that remain, all bounded by the cache and all cheap at today's size:

* `users` totals (`SCAN users`, one row per account; the same scan `/admin/stats` already does).
* `coach_posts` state split (`SCAN coach_posts`; no index covers `deleted_at` / `removed_at`; rows are
  wide because of the body columns - the one to watch if the marketplace becomes large).
* `content_reports` (`SCAN r`, small table), `exercises` / `exercise_media` / `exercise_translations`
  counts (already scans in `/admin/stats`).
* `audit_log` 24 h count: `SCAN audit_log USING COVERING INDEX audit_log_actor_idx`. There is **no
  `audit_log (created_at)` index** (019 / 021 only have partial ones for `coin.*` and
  `marketplace.moderation.*`); this is the first query that will hurt on a long-lived log. Recommend a
  future migration `CREATE INDEX audit_log_created_idx ON audit_log (created_at)`; not done here (no
  migration in this package, numbers are coordinated with the other developer).
* The integrity reconciliation (wallets x ledger, `SCAN l` for orphan debits) is the audit page's own
  query set, run once per 45 s at most.

Cold timing on the demo DB (19 users, 1733 exercises): first `days=90` 0.9 s including pool warm-up,
18.5 KB; warm 3 ms.

---

## `GET /api/v1/admin/stats` - additive `panel`

Every existing key (`users`, `exercises`, `media`, `moderation`, `translations`, `sessions`, `audit`)
is unchanged. New key `panel` (maps 1:1 to `admin-moderation-v2`):

```jsonc
"panel": {
  "today": "2026-11-03",                         // UTC date key, end of the curve
  "users":  { "total": 19, "new7d": 2 },          // "Felhasznalo osszesen", "Uj 7 napban" (rolling 7 x 24 h)
  "activeCoaches": 2,                             // "Aktiv edzo": role coach, enabled, >= 1 ACTIVE client
  "workouts": { "clock": "local_date", "today": 4, "last7d": 23 },   // "Edzes ma / 7 nap", completed only
  "moderationPending": 3,                         // "Varakozo moderacio" = exactly what the queue lists
  "openReports": 4,                               // "Nyitott jelentes" = content_reports.status_key = 'open'
  "loggedPeople": {                               // the 30-day curve "Aktiv naplozok · 30 nap"
    "clock": "local_date",
    "daily": [ { "day": "2026-10-05", "n": 2 } /* ... 30 points, last = today */ ],
    "today": 9,                                   // = daily[29].n ("9 ma")
    "inWindow": 16                                // DISTINCT people across the 30 days (not the sum)
  },
  "activityAsOf": 1793746606,                     // epoch s the CACHED half (workouts, loggedPeople) was computed
  "activityCached": false,                        // true when this response served it from the store
  "activityTtlSeconds": 30
}
```

Notes for the frontend lane:

* `moderationPending` excludes an orphaned submission (the owner erased their account), exactly like the
  queue (`GET /admin/moderation`). The older `moderation.pending` on the same payload does **not**
  exclude it, so the two can differ by the orphans; the panel must use `panel.moderationPending`.
* `activeCoaches` counts the **coach role** only. `GET /admin/metrics` `coaches.withClients` counts any
  account holding an active link (an admin acting as a trainer too) - do not mix them in one screen.
* One request feeds the whole panel; no `GET /admin/metrics` call is needed.

---

## `GET /api/v1/admin/statistics?days=7|30|90`

Query: `days` optional, default **30**, exactly one of the strings `7`, `30`, `90`. Strict: any other
value (`6`, `91`, `abc`, `7.5`, `07`, `+7`, ` 7`, `1e1`, `0x7`, empty, repeated, `days[a]=7`) and any
unknown key -> **400** `{error, code: "validation_error", requestId}`. 401 without a session, 403 for
member / coach / demoted / disabled admin (403 comes before the 400, a non-admin learns nothing about the
parameters).

Money is **integer minor units** (1 coin = 100 minor, `toCoins()` in `useCoins.ts`); nothing here divides.

```ts
// ---- shared ------------------------------------------------------------------
export type DayKey = string; // 'YYYY-MM-DD'
export type Clock = 'utc' | 'local_date' | 'epoch';

export interface DailyN { day: DayKey; n: number }

// ---- GET /admin/stats panel --------------------------------------------------
export interface AdminPanel {
  today: DayKey;
  users: { total: number; new7d: number };
  activeCoaches: number;
  workouts: { clock: 'local_date'; today: number; last7d: number };
  moderationPending: number;
  openReports: number;
  loggedPeople: { clock: 'local_date'; daily: DailyN[]; today: number; inWindow: number };
  activityAsOf: number;      // epoch seconds
  activityCached: boolean;
  activityTtlSeconds: number;
}
// AdminStats (existing) gains:  panel: AdminPanel

// ---- GET /admin/statistics ---------------------------------------------------
export interface AdminStatistics {
  window: { days: 7 | 30 | 90; from: DayKey; to: DayKey; today: DayKey; clock: 'utc' };
  meta: { generatedAt: number /* epoch s */; cached: boolean; cacheTtlSeconds: number };

  users: {                                             // FELHASZNALOK
    total: number;
    byRole: { user: number; coach: number; admin: number };   // "Tagok 15 / Edzok 3 / Adminok 1" (split bar)
    disabled: number;                                  // "Letiltott"
    mustChange: number;                                // accounts forced to change password
    new7d: number;
    signups: { clock: 'utc'; daily: DailyN[]; total: number }; // "Uj regisztracio" + day bars; total = in window
  };

  activity: {                                          // AKTIVITAS
    loggedPeople: {                                    // NOT DAU/MAU (see above)
      clock: 'local_date';
      daily: DailyN[];                                 // the lime-ended curve
      today: number;                                   // "Naplozok ma"
      inWindow: number;                                // "16 naplozo ember · 30 nap" - DISTINCT people
    };
    completedWorkouts: {                               // "Befejezett edzes 74" + day bars
      clock: 'local_date';
      daily: DailyN[];
      total: number;                                   // sum over the window
      today: number;                                   // independent of `days`
      last7d: number;                                  // independent of `days`
    };
    nutritionLog: {                                    // "Taplalkozas-naplo 404" + day bars
      clock: 'local_date';
      daily: { day: DayKey; people: number; entries: number }[]; // entries = rows, people = distinct
      totalEntries: number;                            // sum of entries over the window
    };
  };

  coins: {                                             // ERME
    clock: 'utc';
    daily: { day: DayKey; mintedMinor: number; spentMinor: number; entries: number }[];
    mintedMinor: number;                               // "Kibocsatas"
    spentMinor: number;                                // "Koltes"
    movedMinor: number;                                // "forgalom" = minted + spent (never a net)
    entries: number;
    integrity: {                                       // "Integritas ellenorzes: Rendben"
      ok: boolean;
      drifting: number;                                // wallets that disagree with their ledger
      unpaidPurchases: number;
      orphanDebits: number;
      unbackedEntitlements: number;
      capped: boolean;                                 // a check hit its 500-row cap: counts are "at least"
    };
  };

  marketplace: {                                       // PIACTER
    clock: 'epoch';
    posts: { total: number; draft: number; scheduled: number; live: number; withdrawn: number; removed: number };
    reports: {
      open: number;                                    // "Nyitott jelentes"
      triaged: number;
      openBySeverity: { high: number; medium: number; low: number };
      resolvedInWindow: number;                        // "Elintezett jelentes" (terminal status, by resolved_at)
    };
  };

  coaches: {                                           // EDZOK
    withRole: number;                                  // "3 edzo" (coach role, enabled)
    withClients: number;                               // "2 / 3 edzo ugyfellel"
    activeLinks: number;                               // "Aktiv kapcsolat 9"
    clientsPerCoach: number | null;                    // "Ugyfel / edzo 4,5" = activeLinks / withClients; null when no coach has a client
    distribution: { bucket: '1' | '2-3' | '4-5' | '6-10' | '11+'; coaches: number }[]; // always these 5, in this order
  };

  system: {                                            // RENDSZER
    clock: 'epoch';
    liveSessions: { people: number; logins: number };  // "Aktiv munkamenet" = people; logins = distinct logins (devices)
    auditEvents24h: number;                            // "Auditesemeny 24 ora"
    exercises: { total: number; global: number; private: number; custom: number; pendingReview: number };
    media: { total: number; bytes: number };
    translations: { rows: number; langs: number };
  };
}
```

### Definitions (what each number means, so the copy can be exact)

* **loggedPeople** - `COUNT(DISTINCT person)` over `workout_logs` (any status, a started or abandoned
  workout is still "logged something") UNION `nutrition_log_items`, per `local_date`. A person who did
  both is counted once. `inWindow` is distinct across the whole window.
* **completedWorkouts** - `workout_logs.status = 'completed'` by `local_date`. `today` / `last7d` are
  independent of `days` (7 local days = today and the six before) and equal `panel.workouts`.
* **nutritionLog.entries** - rows of `nutrition_log_items` (the frame's 404 is an entry count);
  `people` is distinct clients that day.
* **coins** - from `coin_ledger` joined to `coin_reasons`: *minted* = entries whose reason sign is +1,
  *spent* = reason sign -1, as absolute values. "Spent" is every debit: store purchase, reward
  redemption, admin debit **and LifeOS penalties / reversals**. Bucketed by UTC day of `created_at`.
* **integrity** - the four reconciliation checks of `GET /admin/coins/audit` (shared code,
  `coins/integrity.js`), reduced to `ok` + counts; `ok` is exactly the audit page's `clean`.
* **posts** - state is derived (migration 021): `removed_at` wins over `deleted_at` (author withdrew)
  wins over `published_at`: `removed` > `withdrawn` > `draft` (never published) > `scheduled`
  (`published_at` in the future) > `live`. All-time, not windowed. The frame's three groups map as
  Kozzetett = `live` (+ `scheduled` if you want it), Piszkozat = `draft`, Leveve = `removed`;
  `withdrawn` ("Visszavonva") is the author's own withdrawal.
* **openBySeverity** - open reports by their reason's `severity_rank`: `high` >= 80, `medium` 50..79,
  `low` < 50 (current ranks: illegal 100, sexual / violence 90, scam / impersonation 80, dangerous_advice
  / abuse 70, ip_infringement 60, admin_discretion 50, spam 40, other 10).
* **coaches** - coach role, enabled account, **active** `coach_clients` link. Links held by an admin
  acting as a trainer are not counted, so the numbers match `panel.activeCoaches`. Average is rounded to
  one decimal.
* **liveSessions** - unrevoked, unconsumed (not rotated away), unexpired refresh tokens of enabled
  accounts. The old `sessions.active` on `/admin/stats` counts token rows including rotated ones and
  overstates; the page should use this.
* **meta.cached** - `true` only when the body came out of the store; `generatedAt` is when it was
  computed. Show nothing about it unless debugging.

### Frame -> field cheat sheet

`admin-moderation-v2`: `panel.users.total`, `panel.users.new7d`, `panel.activeCoaches`,
`panel.workouts.today` / `.last7d`, `panel.moderationPending`, `panel.openReports`, curve =
`panel.loggedPeople.daily`, caption `panel.loggedPeople.today`. The queue head count ("3 varakozik") is
the queue length; both agree.
`admin-statistics-1` (window switch 7 / 30 / 90 -> `?days=`): blocks as annotated in the types above.
`admin-statistics-2`: loading = the pending request, error = any non-200 (show "Ujra" -> refetch).
Labels follow the window (`window.days`), not a fixed "30 nap".

## Tests

`backend/scripts/smoke/admin-statistics.js` (98 assertions added to the suite: 812 -> 910; the marketplace
fixture assertions need the suite's public corpus): the cache unit cases (single-flight, TTL boundary, failure not
stored), the authorisation matrix (401 / member 403 / coach 403 / demoted admin 403 / disabled admin 403
with the token still valid, POST 404), the strict `days` matrix (18 bad values), a planted fixture (3
accounts, workouts and meals on known days, 3 ledger entries, a coach link, a disabled and a forced-
change account, a removed post) compared against an independent JavaScript oracle for every section and
all three windows, the live-versus-cached behaviour of the panel, the stale-then-fresh proof across one
wait of 47 s, and the integrity flip with a lifted wallet guard (restored afterwards).
Planted defects (each turns the suite red, then reverted): zero-fill removed (16 failures), minted / spent
sign swapped plus window `91` accepted (5 failures), DB re-check removed (demoted and disabled admin get
200).
