---
type: plan
title: LifeOS port + stackable roles + Profile v2
status: approved
date: 2026-10-17
tags: [plan, lifeos, roles, pulse]
---


## Context

The owner wants the features of `github.com/kytrack/f_app` ("LifeOS": a single-user, local-only Expo app with habits,
tasks, recurrence, day close, calendar/events, focus sessions, quick capture, a points ledger with streaks / freezes /
XP / levels, user-defined rewards, a daily random challenge, stats) ported into TRACKER, rewritten in the Pulse design.
At the same time: roles must STACK on one account (no separate accounts), with a view switcher — a trainer gets
"go to trainer view" on Profil, after which the bottom bar swaps to trainer icons with "back to user view" as the first
icon; an admin gets two leading icons (back to user, back to trainer) then admin items. Profil must stop being a page
of dumped text. New features get their own pages; at most 6–7 tabs per bar.

Owner decisions (final, 2026-10-17): port all four groups (habits+tasks+day close; calendar+events; focus+capture;
points+rewards+challenge) · full gamification allowed (reverses the earlier "no streak / XP / level / quest" record) ·
ONE currency: everything pays TRACKER coins · user bar = 6 tabs: **Ma · Edzés · Étkezés · Naptár · Haladás · Profil**
(Ma replaces Kezdőlap; rewards and coins are reached from Profil).

Exploration facts that shape the plan: the backend role model is already a ladder (admin ⊇ coach ⊇ user —
`requireCoach` admits admin, ~20 SQL checks use `role IN ('coach','admin')`), so stacking needs no migration;
`users.role` CHECK cannot be altered and a `users` rebuild is unsafe. Coins (`019_coins.sql`) are an immutable,
trigger-guarded ledger with a natural-key index (one row per reason+ref), a non-negative-balance trigger and one-time
store ownership — repeatable LifeOS awards need an event table to point at. There is no scheduler; the user timezone
is never written (dates are effectively UTC). None of tasks / habits / focus / events / challenges / day close exist.

## Decisions taken in this plan

| # | Decision | Why |
|---|---|---|
| R1 | Keep the role ladder; `/auth/me` adds a derived `roles[]` (user→[user], coach→[user,coach], admin→[user,coach,admin]); JWT and guards unchanged; no migration | ladder already stacks; no risky schema change |
| R2 | The active **view is derived from the URL** (`/coach*`,`/compose*` → trainer; `/admin*` → admin; else user); only `/notifications` is shared and uses the last view (sessionStorage) | deep links, refresh, back button and the static nav gates keep working |
| R3 | A view grants nothing: never sent to the server; every route keeps its server-side role check | security invariant (asserted by `check-routes`) |
| L1 | Point rules are **admin-global** (append-only `point_rule_sets`, admin "Szabályok" page); per-item points are user-set but capped | one shared currency — per-user rules would let anyone mint coins |
| L2 | 1 f_app point = 1 coin (100 minor); multipliers stored in basis points | readable numbers next to existing achievement rewards |
| L3 | Penalties and reversals may take the balance below zero; **spends may not** (`trg_coin_ledger_never_negative` → `trg_coin_ledger_spend_covered`); spendable = max(0, balance) | exact reversals are the only non-farmable undo; matches f_app raw/spendable |
| L4 | A day stays editable until it settles: day D settles lazily at start(D+1) + 6 h | one consistent lock instead of f_app's contradictory 48 h grace |
| L5 | Habits pay at day close, tasks pay on completion; Ma shows a habit preview | habit value is final only when the day settles |
| L6 | Day close runs **lazily** (on `GET /lifeos/today`, LifeOS routes, wallet), idempotent per (user,date), catch-up ≤ 7 days; older gaps settle as `lapsed` (no penalty, streak reset) | no scheduler; a returning user is not buried in penalties |
| L7 | Every award / penalty / reversal is a `coin_events` row; its ledger row points at it (`ref_type 'coin_event'`) | satisfies the natural-key index and keeps the ledger immutable |
| L8 | Daily earn cap (400 coins) + item caps (habits 20, open tasks 300, challenge pool 50, rewards 100) | user-defined items make every earn path farmable |
| L9 | LifeOS writes are not queued offline (outbox allow-list unchanged) | day-dependent coin writes must not land late |
| L10 | LifeOS data is private to the user; no coach endpoint reads it | personal data, not requested |

## Phases (each ends green: `npm run build`, `verify:gates`, backend `check:all`, `npm run smoke`)

### Phase 0 — finish the Pulse effort (INT)
- Regression-sweep fixes from `.pulse/sweep/a.md`, `b.md` (offline cold start: warm the lazy `AuthPage` chunk + a Pulse
  `errorElement`; the `POST /conversations` loop in `features/chat/useChat.ts`; 44 pt hit areas; DEV lines).
- F19 closing rows 1–7 (`docs/pipeline/pulse/PLAN.md` §7.3) — after this `check:pulse` is unconditional bans, so new
  screens are written against the final kit.
- Equipment stills: the owner's 7 web-generated images → `npm run assets:pulse` → merge `pulse/A-equipment`.
- D3: finish / abandon workout UI on the existing routes (`backend/src/logs/routes.js:512/519`).
- Q2: `030_retire_theme_packs.sql` + `verify-030`.
- Docs + ADR + brain sync.
- **Checkpoint C0:** does `pulse-redesign` land on `master` first; reserve migrations 031–035 with the other developer;
  the new effort branches to `lifeos-int` with the same slot / integrator model.

### Phase 1 — stackable roles, view switcher, nav, Profile v2, admin section routes
**Backend (S):** `auth/routes.js` `/me` (304-316) returns `roles`; `GET /conversations?side=coach|client`
(`chat/routes.js:52`, strict zod enum) so the trainer view lists only coach-side threads; `requireCoach` on
`GET /clients/:id/records` (`logs/routes.js:729`); smoke rows.

**Client view model (INT):** `app/navTabs.ts` stays pure data — `NavView = 'user'|'trainer'|'admin'`,
`NAV_TABS: Record<NavView, NavTabSpec[]>`, a new **switch tab kind** `{ kind:'switch', key, to, view, icon, labelKey }`
(never lit, never `aria-current`, accessible name is the full phrase), `VIEW_ROUTES`, `viewsFor(roles)`,
`viewForPath(path, roles, lastView)`, `tabsForView`. `app/useView.ts` (sessionStorage last view), `AppLayout.tsx`
uses it, `routeMeta.ts` gains `byView` parents (`/notifications` → `/` or `/coach`), `CommandPalette` updated.
`useSession.ts` gains `roles`; scattered `user.role` checks become `hasRole()`.

**Tab sets:**
| View | Tabs |
|---|---|
| user (P1 → P5) | Kezdőlap·Edzés·Étkezés·Haladás·Profil → **Ma·Edzés·Étkezés·Naptár·Haladás·Profil** |
| trainer | **↩ Saját** (switch → `/`) · Ügyfelek `/coach` · Tervek `/coach/plans` · Pult `/compose` |
| admin | **↩ Saját** · **↩ Edző** (switch → `/coach`) · Moderáció `/admin` · Fiókok `/admin/accounts` · Piactér `/admin/marketplace` — Szabályok `/admin/rules` (from P2) is a door row on Moderáció, not a tab (design round A) |

- The user bar is identical for every role; trainer/admin views are entered from Profil.
- `/admin` local-state sections (`AdminPage.tsx:179, 228-256`) become routes (Moderation / Accounts / Marketplace pages).
- `/compose` becomes a trainer tab — reverses Q5 for `/compose` only (owner checkpoint C3); `/m` stays URL-only.

**BottomNav (`ui/nav/BottomNav.tsx`):** sizing for 4..7 cells (new `--tabbar-inset-4`), `key={tab.key}`, switch cells
idle-raster only, a hairline divider after the switch group (design round A confirms).

**New tab icons (owner generates graphite masters; lit masters on the accent ramp):** pairs `calendar`, `plans`,
`desk`, `accounts`, `market`, `rules`; idle-only switch icons `switch-user`, `switch-trainer` (14 files). Pipeline:
masters in `TRACKER-mockups/5-pulse/kepek` → `assets-src/pulse/assets.json` → `npm run assets:pulse`.

**Gates re-pointed in the same commit (INT):** `check-nav.mjs` (counts per view, switches first, unique keys, required
doors `/coach` and `/admin` from `SettingsPage.tsx`, drop the `/compose` OPEN entry), `check-nav-active.mjs` (EXPECT per
view, no switch ever lit, `viewForPath` covers every signed-in route), `verify-gates.mjs` (re-anchor + new probes:
switch-lit, switch-door-deleted, shared-parent-missing, view-count, switch-has-lit), `check-assets.mjs` assertion 4
(`SWITCH_ICON_KEYS`: idle file, no lit file), playground specimens import `NAV_TABS`.

**Profile v2 (`features/settings/SettingsPage.tsx`) — rows that open things instead of a text page:**
1. Identity hero: 176 pt monogram, name (tap → NameSheet with the existing `DisplayNameField`), email, one micro role
   line ("TAG · EDZŐ · ADMIN").
2. Ledger rows: ÉRMÉK (balance → `/coins`) · SZINT (level + XP bar → `/coins`, P2) · JUTALMAK ("N elérhető" →
   `/rewards`, P4). Testsúly row goes (Haladás owns it); Eredmények moves inside `/coins`.
3. NÉZETEK (coach/admin only): "Edzői nézet ›" → `/coach`, "Admin nézet ›" → `/admin`.
4. BEÁLLÍTÁSOK as one-line rows with value + chevron: Nap és időzóna (`/settings/day`, P2) · Felszerelés
   (`/settings/equipment`, existing `EquipmentSection`) · Edzés közbeni jelzések (CueSheet, existing `CueSettings`) ·
   Nyelv (inline `LanguageToggle`).
5. Kijelentkezés.

**Design round A first** (Figma, Pulse kit node 81:2 + `figma-build/loader.js`): the three bars, the switch cell,
Profile v2, admin section pages, coach dashboard under the trainer bar → owner approves the pictures (C1) → build 1:1
with pair pictures and an independent review, as for the 24 screens.

### LifeOS backend design (Phases 2–6)
- **Day boundary:** new `user_prefs` (timezone, day_start_hour, lifeos_started_on, challenge/focus settings) with a
  row per user (insert trigger + backfill). The client silently sends the browser IANA zone (`PATCH /me/prefs`); LifeOS
  creates refuse with `409 TIMEZONE_REQUIRED` until set; tz change ≤ 1/24 h, audited. `backend/src/lifeos/dates.js`
  ports f_app `dates.ts` (DST-safe). `plans/schedule.js` `localDateFor` reads `user_prefs.timezone` (fixes the UTC
  workout dates). `POST /nutrition-log` refuses future `local_date`.
- **Day close:** `lifeos/settle.js ensureSettled()` → `closeLifeDayTx` per due day (≤ 7), `markLapsedDaysTx` for
  older gaps, then `materializeRecurringTasksTx` and `materializeRemindersTx`. One day settles: habits (f_app
  `settleHabit`: freeze, miss, partial ≥ 50 %, relapse cap, times-per-week Sunday quota, streak, milestones, freeze
  earned), overdue tasks, kcal outcome (shared nutrition SQL moved to `nutrition/daySql.js`), workout due/done from
  `plans/schedule.js` + `workout_logs`, perfect day (incl. the scheduled workout — owner checkpoint C3), summary row,
  self-notifications.
- **Coins:** `coin_reasons` gains `xp` and `spend` columns + new reasons (workout.completed, task.done, habit.done,
  habit.clean_day, streak.milestone, day.kcal_hit, day.perfect, focus.finish, penalties habit.missed / habit.relapse /
  task.overdue / day.kcal_over, reversal.credit / reversal.debit, reward.redeem — each with a cap). `coin_events`
  table; reversal = a new event with unique `reverses_event_id`; triggers `trg_coin_event_shape`,
  `trg_coin_event_immutable`; `trg_coin_ledger_ref_truthful` (019:720) dropped and recreated with a `coin_event`
  clause (and `reward.redeem` in 033); never-negative trigger replaced by spend-covered. XP = Σ xp-reason amounts
  (new index), level = ⌊√(xp/100)⌋. `GET /coins/wallet` returns balance (may be < 0), spendable, xp, level, bounds.
  Streaks/freezes are derived from immutable `habit_day_results`, not mutable counters.
- **Migrations:** 031 core (user_prefs, point_rule_sets seeded with defaults, coin reasons/events, daily_summaries,
  trigger swaps) · 032 habits, habit_logs, habit_day_results, tasks · 033 challenges, challenge_draws, rewards,
  reward_redemptions · 034 events, event_reminders, reminder_deliveries · 035 focus_sessions (unique partial index:
  one unfinished session per user). Integer `*_minor`, typeof CHECKs, user FK cascade, bounded strings.
- **API (requireAuth, zod `.strict()`, per-IP + per-account limits, idempotency `<scope>:<user>:<key>`, ownership in
  SQL, miss → 404):** `/me/prefs`; `GET /lifeos/today`; `/habits` (+ log / skip / relapse / archive / history);
  `/tasks` (+ complete / reopen); `/challenges` (+ today draw / reroll / pick); `/rewards` (+ redeem, redemptions,
  fulfilled); `/calendar?from&days≤42` (events + tasks + workout occurrences) and `/events`; `/focus` (+ checkin /
  finish / cancel); `/lifeos/days`, `/lifeos/stats`; `GET/PUT /admin/rules` (admin + assertAdmin + audit +
  expectedVersion). Capture reuses `POST /tasks` / `POST /events`.
- **Named worker transactions** in `backend/src/db/tx/<domain>.js` re-exported from `worker.js` (package B0 first
  moves `getDb/stmt/rethrow` to `db/conn.js` and teaches `check-worker-tx`, `check-admin-audit`, `check-route-tx` to
  read `tx/*.js`). Every award / penalty / redeem / close goes through one `postCoinEvent` (cap → event → ledger); the
  challenge draw uses `crypto.randomInt` in the worker; redeem checks ALREADY_REDEEMED / COOLDOWN / INSUFFICIENT before
  the first write.
- **Five-pass check (forge / replay / race / IDOR / extremes)** for every coin-moving endpoint (task complete/reopen,
  habit log/skip/relapse, day close, challenge pick, reward redeem, focus finish/checkin, admin rules, workout award),
  each pass a `smoke` section.
- **Reminders without push:** `materializeRemindersTx` on `GET /lifeos/today` and the bell's unread poll writes
  self-notifications (event offsets, habit reminder time, tasks due in 60 min, day summary), dedup via
  `reminder_deliveries`, window ≤ 6 h. Honest limit: reminders appear when the app is opened; Web Push is a later effort.
- **GDPR:** all new user tables in `EXPORT_TABLES` (`db/gdpr.js`); `point_rule_sets` exempt with reason.
- **Verify:** `verify-031..035`, `verify-lifeos-rules.mjs` (f_app `tests/domain/*` vectors incl. DST days),
  `verify-day-close.mjs`; ~+150 smoke assertions in `scripts/smoke/lifeos-*.js`.

### LifeOS frontend
- **Design round B before any LifeOS screen** (~32 frames in the Pulse kit): Ma (training day, rest/perfect day, new
  user, pending draw), Naptár + event detail, habits + detail + form, tasks + form, capture, focus (setup / running /
  done), challenges, rewards + form, refreshed coins (XP, negative balance, new reasons), progress days, admin rules.
  Gamification in Pulse: streak as a figure with "NAP", lime multiplier segment, mono freeze count, level as figure +
  SegmentBar — no flames, no illustrations. Owner approves the pictures (C4); seed data for captures added to
  `seed-demo.mjs`.
- **Kit gaps (lane G-lifeos, INT owns `src/ui`):** DayRail, TimeTrigger, RecurrencePicker, WeekdayChips, Countdown
  (fixed-width digits per DEV-003). Everything else reuses the kit (Screen/ScreenHeader, RowStack/ListRow/LedgerRow,
  CheckMark, NumberStepper, Field/TextArea, Sheet, Segmented, ConfirmSheet, ToastHost undo, SegmentBar/ProgressBar/
  Sparkline/TrendChart, EmptyState, Pic, Dot).
- **Feature folders:** `features/today/` (TodayPage at `/` replaces `home/`: greet + bell, ledger line "ÉRME · SZINT",
  hero "MA 3/7", MAI EDZÉS with the one lime pill, SZOKÁSOK, FELADATOK (+ "Rögzítés" capture), NAPI DOBÁS, FÓKUSZ,
  TÁPLÁLKOZÁS, KÖVETKEZŐ, Gyakorlatok row) · `habits/` · `tasks/` · `capture/` · `calendar/` · `focus/` ·
  `challenges/` · `rewards/` (from Profil) · `progress/DaysPage` · `settings/{DaySettingsPage,EquipmentPage}` ·
  `admin/RulesPage` · `coins/` (XP, debt state, new reason labels; rewrite the anti-gamification header comment).
- **i18n:** f_app's Hungarian copy adapted for `hu` (→ `copy-to-approve.md`), en + de written per package; INT merges.

### Phase table
| Phase | Scope | Verification |
|---|---|---|
| P2 Core | migration 031; dates, rules, settle, postCoinEvent; prefs/timezone; `/admin/rules` (door row on Moderáció); wallet XP/level; `workout.completed` award; day-close skeleton (kcal, workout, perfect day); ADR reversing the gamification ban + rewrite of Feature inventory | verify-031, rule vectors, check:all, smoke, gates |
| P3 Habits + tasks + Ma | 032; full day close; recurring tasks; Ma replaces Kezdőlap; capture (task/note) | verify-032, verify-day-close, DST scenarios, pair pictures, live flow |
| P4 Rewards + challenges | 033; JUTALMAK on Profil; daily draw on Ma | verify-033, redeem race, draw idempotency |
| P5 Calendar | 034; Naptár tab (user bar 6); expansion; reminders; event capture | verify-034, DST occurrence vectors, reminder dedupe |
| P6 Focus + Haladás + closing | 035; stats; docs (20-Data-Model, 30-API, ADRs: views, day boundary, negative balance); brain sync | verify-035, full regression sweep (frames, roles, offline, languages) |

## Work packages, ownership, checkpoints
- **INT** owns: frontend `src/app/**`, `src/ui/**`, `src/lib/**`, `src/i18n/*.json`, `src/assets/**`, `assets-src/**`,
  `frontend/scripts/**`, tokens; backend `server.js`, `db/index.js`, `db/worker.js`, `db/conn.js`, `db/gdpr.js`,
  `package.json`, `check-*.mjs`, `smoke.js`; migration numbers.
- **Packages** own `features/<x>/**` or `backend/src/lifeos/<domain>*.js` + `db/tx/<domain>.js` + their migration +
  verify script; they work in `tracker-wt/slot-N` and hand in patches. Backend packages publish zod schemas / response
  types first so frontend slots build against schema-checked fixtures.
- **Agents:** reading/inventory and mechanical work on Sonnet at medium effort; building screens / backend tx and
  independent reviews on the default model at high effort; merges at medium; never max (owner rule).
- **Order:** P0 → design A ∥ B-roles → P1 → B0 → P2 (design B during P1–P2) → P3 → P4 ∥ P5 backend → P6.
- **Owner checkpoints:** C0 Pulse closed + master merge + migration reservation · C1 design A pictures + icon brief ·
  C2 the 14 icon masters · C3 economy sheet (1 point = 1 coin, daily cap 400, negative balance shown as debt, 6 h
  settle delay, 7-day catch-up, perfect day includes the workout, `/compose` trainer tab, Q2 compensation, admin seat
  exemption) · C4 design B pictures · C5 Hungarian copy per phase · C6 live walkthrough after each phase.

## Verification (end to end, every phase)
- Frontend: `npm run build` (all gates incl. re-pointed nav gates), `npm run verify:gates` (new probes fail on planted
  defects), pulse-shot / pulse-verify captures of the new frames → pair pictures (app | Figma) → independent review.
- Backend: `npm run check:all` (incl. verify-03x, rules vectors, day-close scenarios), `npm run smoke` (5-pass sections
  per coin endpoint), `verify:live` where touched.
- Roles sweep: each view lights exactly one tab per route; switches never lit; a member opening `/coach` sees the user
  bar + the page's refusal; trainer chat lists only coach-side threads.
- Live walkthrough in the running app (dev accounts user@ / coach@ / admin@tracker.local): switch views from Profil,
  tick a habit, complete and reopen a task, redeem a reward, draw a challenge, run a focus block, see the next day settle.

## Risks / open questions
1. Master divergence and migration-number collisions with the other developer → reserve at C0.
2. Timezone switch moves new workout/nutrition dates from UTC to the user zone; historical rows keep their dates.
3. Negative balance UX — fallback if refused: forbid un-complete when not covered (409), never clamp a reversal.
4. No push: reminders need the app open (state it in the product).
5. Seat cap: an admin acting as trainer without a `coach_subscriptions` row is refused — exempt admins? (C3)
6. Deferred: editing a single recurring occurrence, vacation mode, coach visibility of client habits (consent).
