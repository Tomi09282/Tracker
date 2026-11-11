---
type: inventory
title: Feature inventory — Home, muscle selector, Profile, navigation, persona
updated: 2026-10-18
tags: [ux, inventory, pulse]
---

# TRACKER — feature inventory for the redesign

Input for a from-scratch UI redesign. The existing visual design is discarded; this file records only WHAT the product does: features, data, actions, states, real labels.

**How to read it**

- **Status** — `live` = implemented and reachable in the running code · `planned` = in a TODO/spec or backend-only, no screen · `cut` = explicitly cut or deferred. `planned (backend only)` means: endpoint exists, no screen, usually no Hungarian copy, and no TODO/spec schedules a UI — the redesign would introduce it for the first time.
- **Copy** — `` `key` = "text" `` is quoted exactly from `frontend/src/i18n/hu.json`. "no key" means no Hungarian string exists; new copy would have to be written in hu/en/de.
- **Source** — merged from four verified inventories (Home, Muscle selector, Profile, Product map) with every verdict correction applied. Conflicts between them were re-checked on 2026-10-05 in: `HomePage.tsx`, `WeekStrip.tsx`, `HomeNutrition.tsx`, `navTabs.ts`, `router.tsx`, `lib/person.ts`, `ui/muscle-map/shapes.ts`, `MuscleMap.tsx`, `CoinBalance.tsx`, `lib/measure.ts`, migrations `003_exercises.sql` / `017_progress.sql` / `019_coins.sql`, `seed-demo.mjs`, `seed-dev-users.mjs`, `translate-exercises-hu.mjs`.
- Repo root: `C:/Users/Petike/Documents/Cursor/tracker`.

---

## 0. Product in one paragraph + feature status table

TRACKER is a coach→client workout and nutrition tracker, Hungarian-first (HU default, EN and DE fully translated), shipped as a mobile-first PWA (React 19 + TS + Tailwind; only `@capacitor/core` and `@capacitor/haptics` are installed — there is no native iOS/Android project). A **member** opens it to see this week's training progress and today's planned session, start or resume a guided workout, log food against coach-set macro targets, record body measurements and private progress photos, browse a 1652-exercise library through an anatomical muscle map, and manage account, appearance and equipment in Profil. A **coach** additionally manages a client roster, join codes, workout and nutrition plans, client chat and a public marketplace profile. An **admin** additionally moderates and configures. Coins are earn-only (seven auto-awarded achievements) and buy two theme packs. Members never pay money in the app.

| Area | Status | What a member can do |
|---|---|---|
| App shell + bottom navigation | live | Bottom bar is the only primary nav (5 tabs member / 6 coach / 7 admin). Offline strip, toasts, skeleton loading, HU/EN/DE. Command palette on desktop only. No top app bar, no drawer. |
| Theme packs + translucent-surface choice | live | Pick one of 7 packs with whole-app live preview, save to account; choose translucency Rendszer / Mindig / Soha. Aurora and Ember must be bought with coins. App is dark-only. |
| Light / dark / system mode | planned | Nothing (TODO Phase-9 T9.3; no labels exist). |
| Custom accent colour + gradient builder | cut | Nothing (removed from the UI; files kept unimported). |
| Auth: register, login, logout | live | E-mail + password (12+ chars, upper/lower/digit), one-tap logout in Profil. |
| Change password, sign out on all devices | planned (backend only) | Nothing. |
| Profil (account + device settings) | live | See who is signed in, set a display name, sign out, open the coin wallet, pick theme and translucency, switch speech / beep / vibration cues, change language, edit the equipment list. No avatar photo, no personal stats, no coach card. |
| Home | live | See trained / planned days this week, today's plan day(s), start or resume a session, today's macros vs target, open notifications. |
| Exercise library + muscle map (the muscle selector) | live | Find an exercise by tapping a muscle (19 map regions / 20 chips), or by search; open detail: target muscles, equipment, how-to steps, substitutes. |
| Library filter sheet (equipment / difficulty / type) | planned | Nothing (ADR-0012, coach-tooling CT-2). |
| Equipment chip strip on the library; gender / body-type / 3D figure | cut | Nothing. |
| Coach custom exercises + media upload UI; dataset sources page | planned (backend only) | Nothing. |
| Coach link — coach side (roster, teams, join codes) | live (coach, admin) | Indirect: the coach reads the member's questionnaire, edits their equipment, builds their plans, sees their workout history and records, messages them. |
| Coach link — member side (enter join code, "my coach", leave coach, forced password change for pre-generated accounts) | planned (backend only) | Nothing — a member cannot link to a coach from the UI. |
| Onboarding questionnaire (5 steps) | live (no inbound link) | Fill and later edit goal, schedule, location + equipment, body data, limitations at `/onboarding` — reachable by URL only. |
| Workout plans (coach authoring) | live (coach) | Member sees a plan only as today's cards and the week ring on Home. |
| Member plan overview; skip / move a scheduled session | planned | Nothing (`GET /my-plans` has no consumer; schedule exceptions have no write API). |
| Workout player | live | Run a started session: sets with kg / reps, check and undo, automatic PR detection, rest timer, interval blocks (circuit / EMOM / AMRAP), read-only muscle map. |
| Finish / abandon a session; freestyle start | planned (backend only) | Nothing — a started session cannot be closed from the UI. |
| Own PR list, per-exercise charts, workout history | planned (backend only) | Nothing (only the coach sees a client's). |
| Nutrition | live | Pick a date, see kcal + protein / carb / fat vs the coach's target, search 95 seeded foods, log by grams, delete an item. |
| Meal-label picker, personal foods, multi-day nutrition trend | planned (API / hook only) | Nothing. |
| Barcode / OpenFoodFacts | cut | Nothing. |
| Progress: measurements, photos, sharing consent | live | Record 15 body metrics, see a trend per metric, upload / delete private photos, share measurements and photos per coach, read the access log. |
| Coach screen for shared measurements / photos | planned (backend only) | Nothing consumes the member's consent yet. |
| Notifications (in-app) | live | Inbox opened from the Home bell, unread badge, mark all read. Only two event types are really emitted (new chat message; coach changed your equipment). |
| Push / e-mail, per-type preferences, quiet hours, digest | cut | Nothing. |
| Chat | live (coach side only) | Nothing: a member can be messaged but has no chat screen or route. |
| Member chat screen; video form-check; withdraw message | planned (backend only) | Nothing. |
| Coins + store | live | See balance, buy Aurora or Ember (250 coins each), read the statement. |
| Achievements | live | See 7 fixed, auto-awarded achievements and their coin rewards. |
| Streak counter, levels / XP, daily challenge, rewards (LifeOS) | planned (LifeOS, [[0022-lifeos-gamification-and-one-currency|ADR-0022]]) | Phase 2 backend: XP and level on `GET /coins/wallet`; streaks, challenges and rewards arrive in Phases 3-4. |
| Leaderboard, buying coins with money | cut | Nothing. |
| Public marketplace (read) | live (public pages outside the shell) | Browse coach posts (kind chips + search), open a post, open a coach profile. No door to it from a phone when signed in. |
| Marketplace comments, likes, follow, in-app booking | cut | Nothing. |
| Coach directory, report button | planned (API only) | Nothing. |
| Marketplace composer; admin panel + element style studio | live (coach / admin) | — |
| PWA, offline, i18n | live | Installable PWA; only workout set checks queue offline; language switch in Profil. |
| GDPR data export, account deletion | planned (backend only) | Nothing. |
| Health sync (Apple Health / Google Fit) | planned (not started) | Nothing. |
| Payments, coach subscriptions, seat caps | planned (server webhook + seat cap only) | Nothing. |

---

## 1. Home (route `/`)

**Purpose.** The screen a member opens several times a day to answer two questions in about two seconds — "am I on track this week?" and "is a session waiting for me right now?" — and to act on it. It is the ONLY place where a workout can be started. Today's macro totals vs the coach's targets sit underneath as secondary context. Coach and admin get the identical Home; only the bottom bar differs.

Data sources: `GET /my-plans/today`, `GET /my-plans/week?from=<monday>&days=7`, `GET /workouts/current`, `GET /nutrition-log/<local date>`, `GET /notifications/unread-count`.

### 1.1 MUST

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Greeting (the page's only h1) | live | Static; not personalised (no name interpolated; the e-mail was deliberately removed from Home). No action. | `home.greeting` = "Szia!" | Szia! |
| Date line | live | Generated client-side with `Intl.DateTimeFormat` in the APP language: long weekday + ", " + long month and day, first letter upper-cased. No action. | no key (generated) | Péntek, október 9. |
| Notification bell + unread badge | live | Link to `/notifications`. Count from the server (polled every 60 s, never decremented locally). Hidden at 0, shows 1–99, "99+" when the server reports capped. A header control, not a tab; exists only on Home and the coach dashboard. | `notifications.title` = "Értesítések"<br>`notifications.withUnread` = "Értesítések, {{count}} olvasatlan" | Badge 2 (variant: 99+) |
| Weekly workout ring (anchor) | live | Numerator = days in this Mon–Sun week whose plan occurrence has a workout log attached (any status — it rises the moment a session is STARTED). Denominator = days this week on which the active plan(s) prescribe ≥ 1 non-rest session (not a constant). A day counts once. Freestyle sessions do not count. Display-only. Rendered ONLY when today has ≥ 1 plan occurrence (training or rest). | `home.weeklyWorkouts` = "Heti edzés" | 2 / 4 · Heti edzés |
| Seven-day week strip | live | Seven cells Mon–Sun, THIS week only. Each cell: short weekday (from Intl) + exactly one state in strict priority: trained > scheduled > blank (rest days and free days are both blank). Today is marked. Display-only: not tappable, no pager, no day numbers. | weekday labels: no key (Intl, hu: H, K, Sze, Cs, P, Szo, V)<br>screen-reader fallback `home.nothingScheduled` = "Nincs betervezve" | H trained · K blank · Sze trained · Cs blank · P today + scheduled · Szo scheduled · V blank |
| "Today's workout" section heading | live | Shown whenever a session is running or today has ≥ 1 plan occurrence. Introduces the only actionable region. | `home.todayTitle` = "Mai edzés" | Mai edzés |
| Today card — to do | live | One card per plan occurrence scheduled today (several possible, ordered by slot). Shows: plan day name, plan name, optional start time HH:MM (only if the coach set one), exercise count. Action START: `POST /workouts/start {plan_day_id}` → navigate to `/workout`. Button is busy while starting. | `home.start` = "Indítás"<br>`home.exerciseCount` = "{{count}} gyakorlat" | Felsőtest – húzás<br>Felső/alsó szplit – 12 hetes blokk · 18:00 · 5 gyakorlat<br>[Indítás] |
| Today card — done | live (code path; not reachable through the UI today, see States) | Same card once the occurrence has a workout log: status text instead of the button, no action. | `home.done` = "Kész"<br>`home.exerciseCount` = "{{count}} gyakorlat" | Felsőtest – nyomás<br>Felső/alsó szplit – 12 hetes blokk · 18:00 · 5 gyakorlat<br>Kész |
| Today card — rest day | live | A prescribed rest day is shown as information, never hidden. Day name + plan name (+ optional time), NO exercise count, no action. Ring and strip still shown. The coach's day note exists in data but is not in the Home payload. | `home.restDay` = "Pihenőnap" | Pihenőnap<br>Felső/alsó szplit – 12 hetes blokk<br>Pihenőnap |
| Live-session banner | live | Shown when `GET /workouts/current` returns an in-progress log. It REPLACES the whole day list (no Indítás / Kész / Pihenőnap card is on screen) and carries the screen's single primary action. Status line + session title (`log.title`; fallback label when the title is null). Action RESUME → `/workout`. One in-progress session per user. | `home.inProgress` = "Edzés folyamatban"<br>`home.resume` = "Folytatás"<br>`workout.freestyle` = "Szabad edzés" | Edzés folyamatban<br>Felsőtest – húzás<br>[Folytatás] |
| Empty state — nothing scheduled today | live | Shown when today has no plan occurrence and no session is running (no active plan, or just no day today) AND when the today query fails. Replaces BOTH the ring/strip and the day list. One action → `/library`. For a member on a phone this button is the only door to the exercise library. | `home.emptyTitle` = "Ma nincs betervezve edzés"<br>`home.emptyBody` = "Ha van aktív terved, a mai napja itt jelenik meg."<br>`home.browseLibrary` = "Gyakorlatok böngészése" | as copy |
| Nutrition heading + open link | live | Link → `/nutrition` (where food is actually logged). The whole nutrition block is absent when nothing is logged today AND no target exists for today. | `nutrition.card.title` = "Táplálkozás"<br>`nutrition.card.open` = "Megnyitás" | Táplálkozás · Megnyitás |
| Today's macro summary (4 figures) | live | Calories (no unit printed), protein g, carbohydrate g, fat g. Each: logged total, the day's target, progress = logged / target. Same hook and query key as `/nutrition`, so the numbers can never differ. Target can be null → the caption becomes the macro name and there is no progress. When a target exists the macro NAME is not printed. Over target = warning state, never an error, copy never scolds. Values ≥ 10 are rounded to integers. Read-only. | `nutrition.card.targetCaption` = "cél {{value}}"<br>no-target captions: `nutrition.macro.kcal` = "Kalória", `nutrition.macro.protein` = "Fehérje", `nutrition.macro.carb` = "Szénhidrát", `nutrition.macro.fat` = "Zsír" | 1840 / cél 2600<br>128 g / cél 180 g<br>210 g / cél 290 g<br>52 g / cél 70 g<br>over-target example: 305 g / cél 290 g |
| Bottom navigation | live | See §4. Home is the active tab on `/` and `/onboarding`. | see §4 | Kezdőlap (active) · Edzés · Étkezés · Haladás · Profil |

### 1.2 SHOULD

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Week panel retry | live | If the week query fails: the ring is replaced by a retry button, the seven-cell row is omitted, the caption stays. Fails independently of the today list. | `common.retry` = "Újra"<br>`home.weeklyWorkouts` = "Heti edzés" | [Újra] |
| Offline / pending-uploads strip (app shell, above every route) | live | Appears when the app is offline (confirmed by a failed `/healthz`) or the outbox holds undelivered writes. Offline with a queue: two lines. Back online and draining: only the queued-count line. No action. Only workout set checks are ever queued. | `offline.title` = "Nincs internetkapcsolat"<br>`offline.queued` = "{{count}} művelet vár feltöltésre" | Nincs internetkapcsolat<br>3 művelet vár feltöltésre |
| Way out of a running session (finish / abandon) | planned (backend only) | `POST /workouts/:id/finish` (completed, with duration / effort / notes) and `/abandon` exist; the frontend has no hook, no button, no key. Without it the banner is permanent after the first start, the "Kész" card and a later "Indítás" are unreachable, and the ring counts the still-open log. Belongs in the player, possibly also on the Home banner. | no key (`workout.check` = "Kész" is the SET-check label, not "finish workout") | — |
| Coach conversation row / unread coach message | planned | Not on Home. Specs say the member reaches their single coach conversation from Home, but no member chat route exists (chat is routed only under `/coach/clients/:id/chat`; the chat notification links to `/chat/<id>`, which is not a route). Data is live: `GET /conversations` → other party's name, last message body + time, unread count. | `chat.thread` = "Beszélgetés"<br>`chat.compose` = "Írj üzenetet"<br>no key for a Home row title | Kovács Péter · „Ja és a hétvégi edzést tedd át szombat délelőttre, ha tudod.” · 1 unread |
| Permanent exercise-library / muscle-selector entry | planned | Not on Home except inside the empty state. `/library` is live but has no tab; on any day with a plan day a member on a phone cannot reach it. | `nav.library` = "Gyakorlatok"<br>`home.browseLibrary` = "Gyakorlatok böngészése" | Gyakorlatok böngészése |

### 1.3 COULD

All rows below are NOT on Home today. "planned" here means: the data exists, nothing on Home reads it, and no spec asks for it (`55-Screens/home.md` deliberately keeps Home to week + today + nutrition).

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Command palette (Cmd/Ctrl+K) | live (desktop ≥ 1024 px only) | Jump-to-screen overlay in the authenticated shell. Irrelevant for phone mockups. | `palette.title` = "Parancsok"<br>`palette.placeholder` = "Ugrás vagy keresés…"<br>`palette.empty` = "Nincs találat" | — |
| Coin balance | planned on Home (live on `/coins`) | `GET /coins/wallet` → `balanceMinor` (100 minor = 1 coin; show whole coins). Could link to `/coins`. | `coins.balanceCaption` = "Egyenleged"<br>`nav.coins` = "Érmék"<br>(`coins.balanceLabel` = "{{count}} érme" is an aria-label only, never visible text) | 190 |
| Latest body measurement | planned on Home (live on `/progress`) | `GET /measurements` → metric key, date, value, unit (kg / cm / pct). Change vs previous entry is derivable; it must stay neutral (never good/bad coloured). | `progress.metricName.weight` = "Testsúly"<br>`progress.record` = "Mérés rögzítése" | Testsúly 83,1 kg |
| Next scheduled session | planned | `GET /my-plans/week?from=<today>&days=N` (N ≤ 28) → date, day name, start time, exercise count, plan name. | no key (`workout.nextUp` = "Következik" is the player's next-exercise label) | Alsótest – volumen · szombat 10:00 · 4 gyakorlat |
| Estimated session length | planned | `est_minutes` is already in the `/my-plans/today` payload (coach-set, nullable); rendered nowhere for a member. | `common.minutesShort` = "perc" | 65 perc |
| Latest personal record | planned | `GET /records` (own record book) has no member consumer; records appear only transiently in the player. | `workout.newRecord` = "Új rekord: {{kind}}"<br>`workout.record.e1rm` = "becsült 1RM" | — |
| Achievement progress | planned on Home (live on `/coins`) | `GET /coins/achievements` → 7-item catalogue with the caller's unlocks. Nothing to claim. | `coins.unlockedCount` = "{{done}} / {{total}} feloldva" | 4 / 7 feloldva |
| Personalised greeting | planned | Session carries `display_name` (nullable; fallback = e-mail local part). No key with a name placeholder. | `home.greeting` = "Szia!" (the only existing greeting) | — |
| Finish-your-questionnaire prompt | planned | `GET /onboarding` → `status` draft / complete + required fields. `/onboarding` has no inbound link today. | `onboarding.missing` = "Hiányzik még: {{fields}}"<br>no key for a prompt title | Hiányzik még: cél, heti edzésszám |
| Enter a coach's join code | planned (backend only) | `POST /join` (rate-limited). No member screen calls it. | no member-side key | code shape: K7M2P-QRS9T-ABCDE-FGH23 |
| Last workout / workout history | planned (backend only) | `GET /workouts` (own sessions, newest first, totals) has no member consumer and there is NO history route — do not link from Home to a history screen. | no member-side key | — |
| Active plan summary | planned (backend only) | `GET /my-plans` (name, goal, cycle_days, starts_on, ends_on, status) has no consumer; a member has no plan or plan-day preview screen, so a Home card cannot link to one. | no key | Felső/alsó szplit – 12 hetes blokk |

### 1.4 States

| State | What is on screen |
|---|---|
| Auth gate (before Home) | Full-screen skeleton while `GET /auth/me` is pending (no bottom bar yet; screen-reader text `common.loading` = "Betöltés"). No user — including a network failure on a cold start — redirects to `/login`. |
| Loading | Placeholders for the week panel and the list; the nutrition block has its own independent placeholder. Never a spinner. |
| Training day, not yet started | Ring + strip, "Mai edzés", card(s) with Indítás. |
| Several occurrences today | One card each, ordered by slot (two slots or two active plans). |
| Rest day | Ring + strip still shown; card shows Pihenőnap, no action, no exercise count. |
| Starting | Every Indítás goes busy together (one shared mutation). A failed start (offline, rate limit 30 / 15 min, 404) is SILENT: the button just stops being busy; no toast, and no copy exists for a start error. |
| Session running | Banner (Edzés folyamatban + title or "Szabad edzés" + Folytatás) replaces the day list. Ring + strip show only if today also has a plan occurrence; otherwise the banner stands alone. Because nothing in the UI can finish or abandon a session and start resumes the open log, this state is effectively PERMANENT after the first Indítás. The demo seed also leaves the member in this state (with a null title, so the demo banner reads "Szabad edzés"). |
| Brief race | The page is gated on the today query only: the list with enabled Indítás can render for a moment before flipping to the banner. |
| Already trained today | Card shows Kész, no action. Reachable only for logs ended outside the UI (API or seed). |
| Empty | No plan occurrence today and nothing running: ring/strip removed, empty panel with "Gyakorlatok böngészése". Identical whether there is no active plan at all or just no day today. |
| Error — today query | Same empty panel (no error message). |
| Error — week query | Ring replaced by "Újra", seven-cell row omitted, caption kept. |
| Nutrition absent | Block not rendered when nothing is logged today and no target exists; no second empty state. |
| Nutrition without target | Food logged, no plan day for the date: captions show the macro name instead of "cél …", no progress. |
| Nutrition over target | Warning state on that macro only. |
| Offline | Shell strip above the header. Cached data stays only in an already-open app session (no persisted cache, API never cached by the service worker); a cold start offline goes to `/login`, never to Home. |
| Bell badge | none at 0 · number 1–99 · "99+". |
| Role | No difference in Home content. Bottom bar: 5 / 6 / 7 tabs (§4). |
| Midnight / travel | The workout list uses the server date in the member's stored timezone; the nutrition block uses the phone's local date — they can disagree. |

### 1.5 Do not invent (Home)

- A streak FLAME or illustration — reversed for the number itself by [[0022-lifeos-gamification-and-one-currency|ADR-0022]]: the LifeOS streak is a figure with "NAP" (design round B), built in Phase 3; never a flame.
- Week pager, day-of-month numbers, tappable week cells, month calendar — the strip is this week only and display-only.
- The user's e-mail, a profile photo or an avatar in the Home header — the e-mail was removed from Home; only name-based monograms exist in the product.
- A quick-start / freestyle "Szabad edzés" button, or "add exercise to workout" — no screen triggers a title-only session and no API appends an exercise to a session.
- Skip / reschedule / move-today's-workout controls — the schedule reads skip and move exceptions but no route writes them.
- "Remaining calories" figure, nutrition streak, water intake.
- Quick-add food, barcode scan, meal-photo button — food is logged only on `/nutrition`.
- Steps, sleep, heart rate, Apple Health / Google Fit widgets.
- Adherence percentages — the product shows counts (2 / 4), never a percentage.
- A weekly trend chart in the ring's slot — charts live on `/progress`.
- Leaderboards, rankings, friends, social feed, challenges.
- Coach presence ("online now", "last active").
- Push opt-in prompts, reminder scheduling, quiet hours.
- A centre floating action button in the bottom bar.
- Buying coins / top-up CTA.
- Search bar, page title or breadcrumb on Home — the active tab is the title.
- Motivational quotes, daily tips, AI suggestions, weather, "workout of the day".
- Badges on bottom-nav tabs — the only unread indicator is the bell.
- A Library / Exercises tab or a Notifications tab in the bar.
- Coach notes or the exercise list of today's session on the Home card — the payload carries only name, plan, time, exercise count, est. minutes and done-state.
- A finish-workout button, post-workout summary, or a link to a workout-history / plan-overview screen, as if they existed.
- An unlock celebration or achievement toast on Home — unlocks are silent everywhere.

### 1.6 Open decisions for the owner (Home)

1. Ring and strip are hidden on any day with no plan occurrence today, even when the plan has sessions elsewhere in the week. Keep, or show the ring and reserve the empty state for "no active plan"?
2. No finish / abandon exists in the UI. The new design needs a way out of a session or the Home state machine cannot be exercised. Where (player only, or also the Home banner)? No Hungarian copy exists.
3. "Done" is decided by `log_id != null` only (`log_status` is ignored), so a just-started or abandoned session counts as trained. Distinct state wanted? No copy exists.
4. Should Home carry a coach-message row (the spec says chat is reached from Home; no route exists), and should a member chat screen be designed now?
5. Should Home carry a permanent entry to the muscle selector / library?
6. Four macros: all equal, or calories leading with three secondary?
7. Personalised greeting (needs a new key in hu / en / de)?
8. Coach and admin get the member Home. Still intended?
9. A coach-less new member has no in-app way to enter a join code and no link to the questionnaire. Should the empty state cover those first-run cases?
10. Which COULD items does the owner actually want on Home?
11. The spec says Indítás is queued offline; in code an offline start fails silently. Which behaviour should the design show?

---

## 2. Muscle selector (top of the exercise library, route `/library`; read-only reuse on `/library/:id` and in the workout player)

**Purpose.** Find one exercise out of 1652 without knowing its name: point at a muscle on a front / back body figure (or tap the equivalent muscle-group chip, or type a name), get a filtered, endlessly scrolling list, open an exercise. On the exercise detail and in the workout player the same body map is read-only and answers the reverse question: which muscles does this movement work, primary vs secondary. Reading is identical for member, coach and admin.

Data sources: `GET /taxonomies?lang=hu` (chip labels), `GET /exercises?q=&muscle=&lang=&cursor=` (24 per page, no total), `GET /exercises/:id` (detail with muscles + role, equipment, steps, substitutions).

### 2.1 MUST

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Screen title (h1) | live | One h1. No action. | `nav.library` = "Gyakorlatok" | Gyakorlatok |
| Interactive body map (anchor) | live | One anatomical figure, one view at a time. Every muscle region is a real button: tap sets the muscle filter for the list, tap the same region again clears it. 19 selectable muscles: 12 on the front view, 10 on the back (neck, forearms, calves on both). Paired and segmented regions share ONE slug and act as one muscle (abs = 4 segments per side, quads = 3 heads, chest = upper + lower, back calves = 2 heads). Region states: idle, hover, keyboard focus, selected. Regions are below the 44 px tap floor at phone size, so by written product rule the map is a SECONDARY affordance and must never be the only way to pick a muscle. | `muscleMap.frontTitle` = "Izomtérkép, elülső nézet"<br>`muscleMap.backTitle` = "Izomtérkép, hátsó nézet"<br>region accessible name = `muscle.<slug>` (roster, §2.4) | Elöl view, Mell selected |
| Front / Back view switch | live | Two options. Defaults to FRONT on every mount; local state (not persisted, not in the URL). Does NOT auto-switch when a chip selects a muscle that exists only on the other view — nothing is lit and no caption explains it on the library. | `muscleMap.front` = "Elöl"<br>`muscleMap.back` = "Hátul"<br>`muscleMap.viewLabel` = "Nézet" | Elöl (active) · Hátul |
| Selection behaviour | live | SINGLE-select: zero or one muscle. Map and chip row are one control with two surfaces — selecting on either marks the other. Combined with the search text as AND. In-memory only (lost on leaving the screen; not restored when returning from a detail). The filter matches an exercise if the muscle is attached in ANY role; the list does not rank or mark by role. | — | `GET /exercises?muscle=chest&lang=hu` |
| Muscle-group chip row | live | Heading, then one row of 20 chips in roster order; labels come from the server taxonomy (identical to the `muscle.*` strings). Active chip is marked; tapping it clears. This is the full-size accessible path to the same filter and must always stay reachable. While the taxonomy request is pending: 4 placeholders. There is NO error branch — if the request fails the placeholders stay forever. | `library.muscle` = "Izomcsoport" | Mell (active) · Elülső vállizom · Oldalsó vállizom · … · Teljes test |
| Search field | live | Free text, debounced 300 ms, clear button once there is text; no visible label. Server full-text search over exercise NAME and DESCRIPTION, in the reader's language and the English fallback; diacritics-insensitive; every word prefix-matched and ANDed; max 120 chars / 8 words. AND with the muscle filter. | `library.search` = "Keresés"<br>`library.searchPlaceholder` = "Gyakorlat neve…"<br>`library.clearSearch` = "Keresés törlése" | "fekveny" → Fekvenyomás, Fekvenyomás gépen, Fekvenyomás kézisúlyzóval … |
| Result count + clear filters | live | Count text; the loading word while the first page is pending. The number is the rows LOADED SO FAR (24, 48, 72 …), not the total — the API returns no total. "Clear filters" appears only when a muscle is selected and clears the MUSCLE only (search text stays). | `library.count` = "{{count}} gyakorlat"<br>`common.loading` = "Betöltés"<br>`library.clearFilters` = "Szűrők törlése" | 24 gyakorlat · Szűrők törlése |
| Exercise result row | live | Whole row is one tap target → `/library/:id`. Content: media slot (first image, else placeholder), name (one line), then difficulty · type · language pill. Difficulty and type are each nullable and then omitted. NOTHING else is on the row (no equipment, no muscle names, no rating, no duration). The viewer's own private exercises and private exercises prescribed to them are mixed in unmarked. | see the two rows below | Közepes fogású fekvenyomás rúddal · Kezdő · Erő |
| Difficulty (3 levels, nullable) | live | `beginner / intermediate / advanced`. Every wger-sourced row (~779 of 1652) has NO difficulty. | `library.difficulty.beginner` = "Kezdő"<br>`library.difficulty.intermediate` = "Haladó"<br>`library.difficulty.advanced` = "Profi" | Kezdő · Haladó · Profi · (none) |
| Exercise type (5 values, nullable) | live | `strength / stretching / cardio / mobility / plyometrics`. Seed is overwhelmingly strength; NO seeded exercise is "mobility". | `library.type.strength` = "Erő"<br>`library.type.stretching` = "Nyújtás"<br>`library.type.cardio` = "Kardió"<br>`library.type.mobility` = "Mobilitás"<br>`library.type.plyometrics` = "Pliometria" | Erő · Nyújtás · Kardió · Pliometria |
| Paging — infinite scroll | live | 24 rows per page (hard server cap), A–Z by the displayed name; next page loads automatically near the end; 3 placeholder rows while loading. No load-more button, page numbers, total or A–Z index. While searching, relevance order is trustworthy for the first 24 results only (paging is keyed on the name, so later pages can skip or repeat rows). | — | 24 → 48 → 72 rows |
| No-results state | live | Title + body + a "clear filters" button ONLY when a search term or a muscle is active (it clears BOTH). A failed list request renders this same state — there is no separate error and no retry. | `library.emptyTitle` = "Nincs találat"<br>`library.emptyBody` = "Próbálj más keresőszót vagy szűrőt."<br>`library.clearFilters` = "Szűrők törlése" | triggers: chip "Teljes test", or search "xyz" |
| Detail — back link | live | Returns to `/library` (always the list; the previously selected muscle is not restored). | `nav.library` = "Gyakorlatok" | Gyakorlatok |
| Detail — media hero | live | The exercise's first image, or a placeholder when it has none. Up to 6 images can be stored but only the first is shown (no gallery). None of the 1652 seeded global exercises has any media, so the hero is the placeholder for the entire public catalogue. | — | placeholder |
| Detail — name + meta | live | h1 exercise name, then difficulty, type, and the language pill when the text is a fallback. Any of the three can be absent. | difficulty / type keys above | Közepes fogású fekvenyomás rúddal · Kezdő · Erő |
| Detail — muscles section (read-only map) | live | Heading, then the same map READ-ONLY (regions not tappable; only the Elöl / Hátul switch works). Three levels: primary target, secondary (assisting), everything else idle. If highlighted muscles exist only on the other view, a caption says so. Below it, muscle-name chips each marked with its role (primary first, then secondary, each in roster order). The separate two-item legend is NOT shown here. Section hidden when the exercise has no muscles. | `library.muscle` = "Izomcsoport"<br>`muscleMap.alsoOnOtherSide` = "További célizmok a {{side}} nézetben." ({{side}} = lower-cased "elöl" / "hátul") | primary: Mell · secondary: Oldalsó vállizom, Tricepsz<br>caption on the front view: További célizmok a hátul nézetben. |
| Detail — how-to steps | live | Numbered steps (typically 2–7). If there are no steps but a description exists, one prose paragraph instead (the ~779 wger rows). Only exercise NAMES were translated: steps and descriptions of seeded exercises are English, and nothing marks that when the name is Hungarian. | `library.howTo` = "Végrehajtás" | 5 English steps for the bench press |

### 2.2 SHOULD

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Untranslated-content language pill | live | When the name is not available in the reader's language the API flags it and the UI marks the row with the literal language code. On the detail: a pill listing the languages the exercise exists in. 861 of 1652 names (52 %) have a Hungarian name, so nearly half the rows carry the pill for a Hungarian reader. | no key (literal language code, upper-cased) | Rope Jumping · Haladó · Kardió · EN |
| Detail — equipment chips | live | Heading + plain chips naming the required equipment. Rendered ONLY when the hero is the placeholder — today that means on every catalogue exercise that has equipment attached. Read-only. | `library.equipment` = "Eszköz"<br>chip labels: no key (server taxonomy, list in §3.1 Equipment) | Rúd · or · Rúd, Pad |
| Detail — substitute exercises | live | Up to 8 cards: name (max 2 lines) + difficulty word; tap opens that exercise. Ranked by shared PRIMARY muscles. Hidden when none. Cards carry no image. | `library.substitutions` = "Helyettesítő gyakorlatok" | Fekvenyomás kézisúlyzóval — Kezdő · Fekvenyomás gépen — Kezdő · Fekvőtámasz — Kezdő · Ferde nyomás kézisúlyzóval — Kezdő |
| Workout player — read-only map | live | On `/workout` the same map shows the current exercise's primary / secondary muscles with the view switch and the two-item legend. One chip swaps the map for a neutral stand-in (the player renders NO exercise photo or video; the chip's label names the other view). A second chip, only on interval blocks (circuit / EMOM / AMRAP), swaps the map for the interval-timer stage. Both chips are hidden while a timer runs. A movement with no linked exercise shows the stand-in and the chip is disabled. Never tappable here. | `muscleMap.primary` = "Fő célizom"<br>`muscleMap.secondary` = "Segédizom"<br>`muscleMap.viewLabel` = "Nézet"<br>`workout.showMedia` = "Videó"<br>`workout.showMuscles` = "Izomtérkép"<br>`workout.showTimer` = "Időzítő" | Mell = Fő célizom, Oldalsó vállizom = Segédizom |
| Entry points | live | `/library` and `/library/:id` light the "Edzés" tab, but that tab opens `/workout`, which has no link to the library. On a phone the only door is the Home empty-state button, so on any day with a plan day the selector is unreachable. Desktop adds the command palette. Detail is reachable only from a list row or a substitute card. | `home.browseLibrary` = "Gyakorlatok böngészése"<br>`nav.workout` = "Edzés" | — |
| Taxonomy-error state for the chip row | planned (not built, not specced) | Needed because a failed `/taxonomies` removes the only full-size path to the filter (violates the rule that the map is never the only path). | no key | — |
| Filter sheet (equipment / difficulty / type) | planned | Accepted replacement for the removed equipment strip (ADR-0012, coach-tooling CT-2); no code exists. Opened from a control showing the number of active filters; contains equipment as MULTI-select (16 items), difficulty, type. Opt-in, server-side; the zero-result state must name the filter that emptied the list and offer to clear it. Meant to serve both the library and the coach's exercise picker. OPEN: whether muscle also lives in the sheet (ADR-0012 says yes, coach-tooling spec CT-2.2 / 2.3 says muscle stays on map + chips). | `library.equipment` = "Eszköz"<br>no key for the sheet title, the badge, or "difficulty" / "type" headings | 2 active filters: Kézisúlyzó, Pad |
| Detail — demonstration video | planned | A frontend branch exists (renders only if the first media item is a video) but no exercise can have one: upload ingests images only, the seed has none. A play control must never be drawn over a still image or the placeholder. | `library.playVideo` = "Videó lejátszása" | none available |

### 2.3 COULD

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| "Add to workout" on the detail | planned (not built on purpose) | No button on `/library/:id`, no API verb to append an exercise to a RUNNING session, no key. (A coach-only verb to add an exercise to a PLAN exists and is used in the plan editor's own picker.) | no key (spec wording: "Hozzáadás az edzéshez") | — |
| Submission status banner on the detail | live | Rendered from the exercise's status alone, with no owner check: "rejected" with the moderator's verbatim reason, or "pending review". Seen by the author, and also by a client to whom the coach prescribed that pending / rejected exercise. No frontend screen creates or submits an exercise, so only seeded / API-created rows reach these states. | `library.rejectedTitle` = "Ezt a beküldést elutasították"<br>`library.pendingReview` = "Beküldve — moderálásra vár." | reason: A leírás nem elég részletes, és nincs kép a kiindulási helyzetről. |
| Coach-only toggles in the planned filter sheet | planned | "Only what the client has kit for" / "hide conflicts"; shown only when a coach picks for a specific client, default OFF. Today the coach picker (name search only, first 12 matches, no muscle filter) only FLAGS rows: missing-kit count and the first conflicting body area. | `plans.missingKit` = "{{count}} eszköz hiányzik"<br>`onboarding.area.knee` = "Térd"<br>no key for the toggles (ADR-0012 names them "Csak amihez van eszköze", "Konfliktusok elrejtése") | Térd · 2 eszköz hiányzik |
| Plan editor picker: muscle map on every result | live | Owner request 2026-11-03 (DEV-093). Each result of the coach's exercise picker is led by a small read-only mannequin with the exercise's muscles lit (primary solid, secondary the weaker step; back view when most primaries are on the back) and a one-line muscle label under the name; `GET /exercises` carries `muscles: [{slug, role}]` for it. Names follow the interface language, the search is debounced 300 ms, and the picker has loading / no-match / failed states. | `plans.pickerNoMuscles` = "Nincs izom megadva"<br>`plans.pickerEmpty` = "Nincs találat"<br>`plans.pickerError` = "A gyakorlatok nem töltődtek be." | Guggolás rúddal — Négyfejű combizom · Alsó hát, Farizom |
| Shared exercise picker for library + plan editor, and a per-day muscle "volume heat map" (coach plan builder) | planned | One picker for library and plan editor; a map lit by a plan day's muscle load. Coach side only. The per-result muscle map of the plan editor picker exists now (row above); the shared picker and the day heat map do not. | `plans.findExercise` = "Gyakorlat keresése" | — |
| Admin moderation review: muscle + equipment chips | live (admin) | In the moderation queue a submission shows ALL its images, description, steps, muscle chips (primary vs secondary) and equipment chips. No body map. | `library.muscle` = "Izomcsoport"<br>`library.equipment` = "Eszköz"<br>`library.howTo` = "Végrehajtás" | — |
| Dataset sources / attribution page | planned (backend only) | Public `GET /sources` returns the two datasets with licence and counts (the wger part is CC-BY-SA and needs visible attribution); no screen or link renders it. | no key | — |
| Offline strip | live (app shell) | The library renders no network state of its own; a failed read becomes "Nincs találat". | `offline.title` = "Nincs internetkapcsolat" | — |
| Equipment chip strip on the library (16 chips) | cut | Removed deliberately in the August redesign; the screen sends no equipment filter. | `library.equipment` = "Eszköz" | — |
| Hint "tap a muscle to filter" | cut | Key still exists, rendered nowhere. | `muscleMap.filterHint` = "Koppints egy izomra a szűréshez" | — |
| Gender / body-type variants, side view, 3D rotation | cut | One neutral figure with two flat views is all that exists (TODO Phase-8 "Parked — do NOT build"). | — | — |

### 2.4 Muscle roster (fixed set of 20; DB sort order = chip order)

"Drawn on" is where the region exists on the map (`shapes.ts`); the DB `body_side` column is ignored by the frontend. The roster changes only through a migration — there is no admin screen or route for it.

| # | slug | Hungarian label (`muscle.<slug>` = chip label) | Drawn on | Data note |
|---|---|---|---|---|
| 1 | `chest` | Mell | front | upper + lower segment, one muscle |
| 2 | `front-delts` | Elülső vállizom | front | fed only by the wger import |
| 3 | `side-delts` | Oldalsó vállizom | front | every free-exercise-db "shoulders" exercise lands here |
| 4 | `rear-delts` | Hátsó vállizom | back | NO global exercises (one pending demo submission, visible to the demo coach only) |
| 5 | `biceps` | Bicepsz | front | |
| 6 | `triceps` | Tricepsz | back | |
| 7 | `forearms` | Alkar | front + back | |
| 8 | `abs` | Hasizom | front | 4 segments per side, one muscle |
| 9 | `obliques` | Ferde hasizom | front | fed only by the wger import |
| 10 | `lats` | Széles hátizom | back | free-exercise-db "middle back" also maps here |
| 11 | `traps` | Csuklyásizom | back | |
| 12 | `lower-back` | Alsó hát | back | |
| 13 | `glutes` | Farizom | back | |
| 14 | `quads` | Négyfejű combizom | front | 3 heads, one muscle |
| 15 | `hamstrings` | Combhajlító | back | |
| 16 | `calves` | Vádli | front + back | front = shin region, back = two calf heads |
| 17 | `adductors` | Közelítő izmok | front | |
| 18 | `abductors` | Távolító izmok | front | |
| 19 | `neck` | Nyak | front + back | |
| 20 | `full-body` | Teljes test | none (chip only) | no map region; NO exercises |

Front view = 12 muscles (1, 2, 3, 5, 7, 8, 9, 14, 16, 17, 18, 19). Back view = 10 muscles (4, 6, 7, 10, 11, 12, 13, 15, 16, 19). Coverage is uneven (importer-derived, approximate, never shown in the UI): largest groups are quads, side-delts, abs, chest, hamstrings, triceps, lats; smallest are adductors, abductors, neck.

### 2.5 Real exercises (for rows and detail mockups)

Names are the Hungarian display names the repo's own composer (`translate-exercises-hu.mjs`) produces for the English canonical names; muscles, difficulty, type and equipment follow the importer mapping in `seed-exercises.mjs`. The encrypted app database itself was not opened. Only name, difficulty, type and the language pill appear on a list ROW; muscles and equipment appear on the DETAIL. "—" = not recorded in the inventory (not necessarily none).

| # | Displayed name (hu) | English canonical | Primary muscle | Secondary muscles | Difficulty | Type | Equipment |
|---|---|---|---|---|---|---|---|
| 1 | Guggolás rúddal | Barbell Squat | Négyfejű combizom | Vádli, Farizom, Combhajlító, Alsó hát | Kezdő | Erő | Rúd |
| 2 | Közepes fogású fekvenyomás rúddal | Barbell Bench Press - Medium Grip | Mell | Oldalsó vállizom, Tricepsz | Kezdő | Erő | Rúd |
| 3 | Felhúzás rúddal | Barbell Deadlift | Alsó hát | — | Haladó | Erő | Rúd |
| 4 | Húzódzkodás | Pullups | Széles hátizom | Bicepsz | Kezdő | Erő | Saját testsúly |
| 5 | Széles fogású hátlehúzás | Wide-Grip Lat Pulldown | Széles hátizom | — | Kezdő | Erő | Kábel |
| 6 | Román felhúzás | Romanian Deadlift | Combhajlító | — | Haladó | Erő | Rúd |
| 7 | Vállnyomás kézisúlyzóval | Dumbbell Shoulder Press | Oldalsó vállizom | Tricepsz | Haladó | Erő | Kézisúlyzó |
| 8 | Csípőtolás rúddal | Barbell Hip Thrust | Farizom | — | Haladó | Erő | Rúd |
| 9 | Függő lábemelés | Hanging Leg Raise | Hasizom | — | Profi | Erő | Saját testsúly |
| 10 | Combhajlítónyújtás | Hamstring Stretch | Combhajlító | — | Kezdő | Nyújtás | — |

Variant rows the mockups should also cover:

| Variant | Row as displayed |
|---|---|
| No Hungarian name → English + language pill | Rope Jumping · Haladó · Kardió · EN |
| wger-sourced row → no difficulty | Fekvenyomás (Bench Press) · Erő — detail equipment: Rúd, Pad |
| Plyometrics type | Elülső ugrás dobozra (Front Box Jump) · Kezdő · Pliometria |
| Advanced | Fej fölötti guggolás (Overhead Squat) · Profi · Erő |
| No media (every catalogue row) | placeholder in the media slot |

### 2.6 States

| State | What is on screen |
|---|---|
| List loading (first page) | 6 placeholder rows in the row shape; the count line reads "Betöltés". No spinner. |
| Chip row loading | 4 placeholders until the taxonomy lands (cached 30 min). If the request fails they stay forever (no error, no retry). |
| Paging | 3 placeholder rows appended while the next 24 load; no load-more button. |
| Filter active | One chip and its map region marked; count row shows "Szűrők törlése" (clears the muscle only). |
| Search has text | Clear button in the field; order switches from A–Z to relevance. |
| Selected muscle not on the visible view | A back-only muscle chosen by chip while Elöl is shown (or the reverse, or "Teljes test", which has no region): nothing is marked on the figure, no caption, the view does not flip. |
| No results | "Nincs találat" + "Próbálj más keresőszót vagy szűrőt." + "Szűrők törlése" only if a term or muscle is active. |
| Error | Identical to no results (known defect). |
| Row variants | image vs placeholder (placeholder for every seeded exercise) · with / without difficulty · with / without type · Hungarian name vs English name + "EN". |
| Map region | idle / hover / keyboard focus / selected. |
| Role | Identical for member / coach / admin. |
| Language | Names and chip labels re-fetch per UI language (requested → default → canonical English). |
| Detail loading | Placeholders for back link, hero, title, meta, one block. |
| Detail not found / error | "Nincs találat" + a link back to the library; no retry; a bad id and a failed fetch are indistinguishable. |
| Detail without media | Placeholder hero, no play control; equipment section appears. |
| Detail with image | First image in the hero; equipment section hidden. |
| Detail conditional sections | Muscles hidden if none · steps list OR fallback description OR nothing · substitutes hidden if none · other-side caption when highlights are on the other view. |
| Detail status banners | rejected (with reason) / pending review. |
| Workout player hero | map (default) / stand-in via "Videó" ↔ "Izomtérkép" / interval stage via "Időzítő" / an exercise with an id but no muscles shows the map with nothing marked and no legend. |
| Offline | Only the shell strip; the screen shows nothing network-specific. |

### 2.7 Do not invent (muscle selector, library, exercise detail)

- Multi-select of muscles, "muscle A + B", or body-region groups (legs / arms / core / push / pull) — selection is single-slug and there is no grouping taxonomy.
- Sub-muscle targets as separate choices (upper chest, inner quad, long head of triceps) — segments act as one muscle; the roster is exactly 20.
- Per-muscle exercise counts on chips or on the map, or a total result count ("1652 gyakorlat", "187 gyakorlat") — the API returns neither; the count shown is rows loaded so far.
- Real exercise photos, GIFs or videos in the list or on the detail as if they existed — the 1652 seeded exercises have NO media.
- A play control over a still image or the placeholder; an image gallery / carousel on the detail.
- An "add to workout" / "start this exercise" button on the exercise detail — no key, no verb for a running session.
- Favourites / bookmarks, recently viewed, recent searches, "popular", "recommended for you".
- A sort control, A–Z index, page numbers, "load more" button.
- Equipment, difficulty or type filter controls as if live — they exist only as the PLANNED filter sheet; label them planned if drawn.
- A muscle "heat", soreness / recovery, "trained this week" or progress overlay on the member's body map — the map shows only a selection (library) or one exercise's primary / secondary muscles (detail, player).
- Gender switch, body-type switch, side view, 3D rotate / zoom.
- Tappable muscle regions on the exercise detail or in the workout player.
- The body map as the ONLY way to choose a muscle (dropping the chip row).
- Sets / reps / weight suggestions, calories, duration, ratings, reviews, comments, share buttons on rows or detail.
- Equipment or muscle names on the LIST row.
- "Create custom exercise", "upload photo", "submit for review" UI — backend only (coach / admin).
- A dataset attribution / licence page as an existing screen.
- Hungarian step-by-step instructions for seeded exercises — only names are translated (52 %).
- A "Mobilitás" category with content, or exercises under "Teljes test"; for a member, "Hátsó vállizom" is empty too.
- The legend "Fő célizom / Segédizom" on the library or the exercise detail — it renders only in the workout player.
- Voice search, camera, AI exercise suggestions.

### 2.8 Open decisions for the owner (muscle selector)

1. Imagery: the brief asks for an image-rich UI, but the catalogue has zero exercise media. Import the upstream dataset's photos, generate imagery (per exercise or per muscle group), or design the no-image row and hero as the first-class case?
2. Does the selector stay the top of `/library`, or become its own step (pick a muscle, then a results screen)? Where is its permanent entry point?
3. Include the planned filter sheet now, although its backend (multi-value equipment, availability, conflicts) is not built?
4. A chip can select a muscle that is not on the visible view. Auto-flip, show both views together, or show a hint? This is a behaviour change.
5. May the redesign enlarge or zoom the figure, show front and back together, or add larger hit areas? The chip row must remain either way.
6. Single-select today. Multi-select (e.g. chest + triceps) needs frontend state and a backend parameter change.
7. The count is "rows loaded so far". Assume a true total (backend change) or drop / reword the count?
8. Empty chips ("Hátsó vállizom", "Teljes test") and the empty type "Mobilitás": keep, hide, or fix the data mapping?
9. Empty and error are one state with no retry, on list and detail. Specify a distinct error state?
10. "Hozzáadás az edzéshez": design it (which target?) or leave it out as the code does on purpose?
11. Show the honest mixed content (half the rows without difficulty, ~48 % English names, English steps) or assume cleaned-up Hungarian content?

---

## 3. Profile ("Profil" tab → route `/settings`, h1 "Beállítások"; sub-screen `/coins` keeps the Profil tab lit)

**Purpose.** The account-and-device screen: confirm who you are signed in as, name yourself, sign out, open the coin wallet, change how the app looks, sounds and speaks on this phone, and revise the equipment you can reach (the list the coach's plan is checked against). Admins get a door to `/admin` here. Everything else "about me" — body measurements, photos, sharing with the coach — lives on the separate Haladás tab; personal training stats, a coach card and account-security controls do not exist in the UI at all.

Block order in the running screen: back + title → identity → sign out → display name → coins row → appearance (theme packs, translucent surfaces) → sounds and haptics → language → equipment → admin link (admins only).

Data sources: `GET /auth/me`, `PATCH /auth/me`, `GET /me/theme` + save, `GET /onboarding` / `PATCH /onboarding` (equipment), `GET /coins/wallet`, `GET /coins/achievements`, `GET /coins/store`, `GET /coins/ledger`.

### 3.1 MUST

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Header | live | Back control + title on `/settings` and `/coins`. The tab says "Profil", the screen title says "Beállítások". | `common.back` = "Vissza"<br>`settings.title` = "Beállítások"<br>`nav.profile` = "Profil" | Beállítások |
| Identity block | live | MONOGRAM only (two initials from the display name; from the e-mail local part when no name is set). Display name (fallback = e-mail local part, never the full address as a name). Full e-mail on its own line — this is the one screen that prints it. Role chip. A "healthy session" mark on the monogram only while the session read succeeds (there is no e-mail-verification concept). No action. There is no uploaded avatar anywhere in the product. | `settings.role.user` = "Tag"<br>`settings.role.coach` = "Edző"<br>`settings.role.admin` = "Admin"<br>`settings.account` = "Fiók" (accessible name only, not visible) | TD · Takács Dániel · takacs.daniel@pelda.hu · Tag<br>no name set: "takacs.daniel", monogram TD |
| Sign out | live | One tap, no confirmation, busy while the request runs; clears caches and the offline outbox. Never queued offline. | `auth.logout` = "Kijelentkezés" | Kijelentkezés |
| Display name editor | live | One text field with label, hint, placeholder. A save button appears only once the text differs from the saved name; disabled when invalid (2–120 characters, no control characters). Clearing the field and saving removes the name. Explicit save, `PATCH /auth/me`. A failed save is SILENT; success has no confirmation other than the button disappearing. | `settings.displayName` = "Megjelenített név"<br>`settings.displayNameHint` = "Az edződ ezt látja az e-mail-címed helyett."<br>`settings.displayNamePlaceholder` = "Ahogy mások látnak"<br>`common.save` = "Mentés"<br>no key for a save error or success | Takács Dániel |
| Coins entry row | live | Link to `/coins`; the wallet's only door on a phone. Shows the label only — NO balance number today (the balance is available from the wallet endpoint). | `nav.coins` = "Érmék" | Érmék (balance available: 190) |
| Appearance — theme pack picker | live | Single choice among SEVEN packs, shown to every account in this order: Éjfél (default), Napfény, Erdő, Neon, Mono, Aurora, Ember. A tap PREVIEWS the pack live across the whole app; a separate save button commits it to the account (disabled until something changed; busy while saving; inline error on failure, choice kept). Leaving the screen with an unsaved preview reverts it. Aurora and Ember are paid (250 coins each in the store); the chips carry no locked / price / owned marker — an unowned pack previews freely and the save then fails with the generic error. The saved pack reaches a new device only when this screen is opened there. | `settings.appearance` = "Megjelenés"<br>`settings.themePacks` = "Témacsomagok"<br>`settings.previewTitle` = "Élő előnézet"<br>`settings.previewBody` = "Az egész app átszíneződik, amint választasz."<br>`settings.saveTheme` = "Téma mentése"<br>`common.saving` = "Mentés folyamatban"<br>`settings.themeSaveError` = "A téma mentése nem sikerült — a választásod megmaradt, próbáld újra."<br>`settings.themePack.midnight` = "Éjfél"<br>`settings.themePack.solar` = "Napfény"<br>`settings.themePack.forest` = "Erdő"<br>`settings.themePack.neon` = "Neon"<br>`settings.themePack.mono` = "Mono"<br>`settings.themePack.aurora` = "Aurora"<br>`settings.themePack.ember` = "Ember"<br>no key for a locked / "buy in the store" state | Aurora selected (owned) |
| Sounds and haptics (three switches) | live | Independent on / off for what the workout player may emit on THIS device: spoken voice, beep, vibration. Each: title, one-line hint, switch. Per device, all default ON; turning one ON plays a demo of it. A channel the device cannot produce is shown disabled, never hidden. Vibration: unavailable in iOS Safari / the PWA (the state an iPhone shows today, with the explanatory hint); it would be AVAILABLE inside a native Capacitor build (none exists yet) — an iPhone design needs both states. Speech: disabled when the speech API is missing, but keeps its normal hint (no "unavailable" copy). Beep is always available. | `settings.cues.title` = "Hangok és rezgés"<br>`settings.cues.speech` = "Beszédhang"<br>`settings.cues.speechHint` = "Bemondja a kört és a pihenőt."<br>`settings.cues.tone` = "Sípszó"<br>`settings.cues.toneHint` = "Rövid hang a visszaszámláláshoz."<br>`settings.cues.haptics` = "Rezgés"<br>`settings.cues.hapticsHint` = "Rezgés a sorozat pipálásakor."<br>`settings.cues.hapticsUnavailable` = "Ez a készülék nem tud rezegni — iPhone-on a sípszó marad az egyetlen nem vizuális jelzés." | Beszédhang on · Sípszó on · Rezgés disabled with the unavailable hint (iPhone PWA) |
| Language | live | Three-way choice, applies immediately, stored on the device; Hungarian is the default. Option labels are native language names from the locale registry, not hu.json keys. | `common.language` = "Nyelv"<br>options: no key — Magyar / English / Deutsch | Magyar selected |
| Equipment | live | Multi-select chips of the equipment the user can reach; the coach's exercise picker flags against it. Same answer as onboarding step 3 (`PATCH /onboarding`). NO save button: every tap autosaves (debounced) and a status line reports saving / saved / failed-will-retry. 16 server options, in this order: Saját testsúly, Rúd, Kézisúlyzó, Kettlebell, Gép, Kábel, Smith-gép, Gumiszalag, EZ-rúd, Húzódzkodó rúd, Pad, Medicinlabda, Fitneszlabda, Hengerelő, TRX, Egyéb. One equipment set per person. A coach can overwrite a client's list; the client then gets a notification linking here (server text, no key: "Felszerelés frissítve" / "Az edződ módosította az eszközeidet."). | `settings.equipment` = "Felszerelés"<br>`settings.equipmentHint` = "Amit el tudsz érni. Az edzésterved ehhez igazodik."<br>`settings.equipmentSaved` = "Felszerelés mentve"<br>`common.saving` = "Mentés folyamatban"<br>`onboarding.saveError` = "A mentés nem sikerült — a válasz megmarad, újrapróbáljuk"<br>option names: no key (server taxonomy) | selected: Rúd, Kézisúlyzó, Gép, Kábel, Húzódzkodó rúd, Pad |
| Admin entry | live (admins only) | One link row to `/admin`; the server re-checks the role. | `nav.admin` = "Admin"<br>`settings.openAdmin` = "Admin felület megnyitása" | Admin felület megnyitása |

### 3.2 SHOULD

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Appearance — translucent surfaces | live | Three options: follow the system accessibility setting (default) / always / never. Applies instantly, stored on this device only. | `settings.transparency` = "Áttetsző felületek"<br>`settings.transparencyHint` = "Az üveghatás a kártyákon és a sávokon. Alapból a rendszer beállítását követi."<br>`settings.transparencySystem` = "Rendszer"<br>`settings.transparencyFull` = "Mindig"<br>`settings.transparencyNone` = "Soha" | Rendszer selected |
| `/coins` — balance | live | Whole-coin number + caption; after a change the caption slot shows the signed delta for ~2.6 s. The server returns ONLY the balance: the "this week" and "spent" figures and the "share of lifetime earnings held" have copy but no data, so they are permanently in their no-data form. | `coins.title` = "Érmék"<br>`coins.balanceCaption` = "Egyenleged"<br>`coins.weekCaption` = "Ezen a héten"<br>`coins.spentCaption` = "Elköltve"<br>(`coins.balanceLabel` = "{{count}} érme" is an aria-label only) | 190 · Egyenleged |
| `/coins` — three tabs | live | Mutually exclusive: store, achievements, statement, in that order; the screen opens on the store; balance stays fixed above. | `coins.tab.store` = "Bolt"<br>`coins.tab.achievements` = "Eredmények"<br>`coins.tab.statement` = "Kimutatás" | Bolt (active) |
| `/coins` — store | live | Exactly TWO items, both theme packs at 250 coins. Row: title, one-line description, and either a price control or the owned label. Purchase = one tap, no confirm, single-flight; the price control stays tappable when unaffordable. ONE generic line covers every failure (not enough coins, price changed, already owned, rate limit, network) — the shortfall is never stated. No success message: success is the balance delta and the row turning to owned. | `coins.storeSection` = "Megvásárolható"<br>`coins.item.theme.aurora.title` = "Aurora"<br>`coins.item.theme.aurora.description` = "Hideg, északi fényű színátmenet."<br>`coins.item.theme.ember.title` = "Ember"<br>`coins.item.theme.ember.description` = "Egyetlen meleg kiemelés."<br>`coins.owned` = "Megvan"<br>`coins.purchaseRefused` = "A vásárlás nem ment át. Ellenőrizd az egyenleged — lehet, hogy közben változott az ár."<br>`coins.alreadyProcessed` = "Ez a vásárlás már megtörtént, nem terheltünk újra."<br>`coins.storeEmptyTitle` = "A bolt üres"<br>`coins.storeEmptyBody` = "Most nincs megvásárolható tétel." | Aurora — Megvan<br>Ember — 250 (balance 190: unaffordable, still tappable) |
| `/coins` — achievements | live | Seven fixed achievements, awarded automatically by the server (nothing to claim); the only way to earn coins besides an admin adjustment. List: counter, each title, what it paid (unlocked) or pays (locked), a footnote. Server order, locked and unlocked interleaved. No per-achievement artwork exists. An unlock is SILENT (no notification, toast or overlay anywhere). The API also returns `category` and `unlockedAt`, neither rendered, neither has copy. | `coins.unlockedCount` = "{{done}} / {{total}} feloldva"<br>`coins.paidYou` = "{{count}} érmét adott"<br>`coins.pays` = "{{count}} érmét ad"<br>`coins.awardedNote` = "Ezeket az app adja oda magától, amikor teljesíted őket — nincs mit begyűjteni."<br>`achievement.workout.first` = "Az első edzés"<br>`achievement.workout.sessions.10` = "10 edzés"<br>`achievement.workout.sessions.100` = "100 edzés"<br>`achievement.pr.first` = "Az első csúcs"<br>`achievement.streak.workout.7` = "7 napos sorozat"<br>`achievement.streak.workout.30` = "30 napos sorozat"<br>`achievement.nutrition.logged.7` = "7 nap naplózva" | 4 / 7 feloldva (rows in §6) |
| Appearance — dark / light / system mode | planned | Owner decision for Phase 9; not built: the app is dark-only. | no key for the mode labels | — |
| "Edit my questionnaire" entry | planned (the `/onboarding` screen itself is live but unlinked) | Only equipment has a door from Profil. Goal, experience, sessions per week, session length, location, units, height, weight, birth year, sex, limitations and the free-text note stay editable at `/onboarding`, reachable by URL only. The coach reads all of it, limitations included. | no key for a profile entry<br>`onboarding.goal.muscle` = "Izomtömeg"<br>`onboarding.exp.intermediate` = "Haladó — 1–3 év"<br>`onboarding.loc.gym` = "Edzőterem"<br>`onboarding.unit.metric` = "Metrikus (kg / cm)" | Izomtömeg · Haladó — 1–3 év · 4 sessions per week · 70 perc · Edzőterem |
| "My coach" (enter join code, coach card, message, leave) | planned (backend only) | `POST /join` (refusals: invalid code, code used up, coach has no free seat, own team — English server strings), `POST /coaches/:linkId/leave` (coach access ends at once, the client's data stays), `GET /conversations`. No member UI and no copy for any of it. Today a member sees their coach's name only under Haladás → Megosztás. | no member-side key<br>the only "no coach" string: `progress.noShares` = "Nincs edződ, akivel megoszthatnád." | Kovács Péter · KP · code shape K7M2P-QRS9T-ABCDE-FGH23 |
| Body summary (latest measurements) | planned on Profil (live on `/progress`) | `GET /measurements`: 15 metrics, dated values. Rule from the spec: the change figure is NEUTRAL in both directions and there is no target for body metrics. | `nav.progress` = "Haladás"<br>`progress.metricName.weight` = "Testsúly"<br>`progress.metricName.body_fat` = "Testzsír"<br>`progress.metricName.waist` = "Derék"<br>`progress.metricName.chest` = "Mellkas"<br>`progress.metricName.arm_right` = "Kar (jobb)" | Testsúly 83,1 kg · Testzsír 18,6 % · Derék 87,5 cm · Mellkas 105,1 cm · Kar (jobb) 37,9 cm |
| Download my data | planned (backend only) | `GET /me/export` → file download (`tracker-export-<id>.json`), 6 per hour per account. | no key | — |
| Delete my account | planned (backend only) | `POST /me/delete`: the password AND a typed confirmation that must equal the literal word DELETE (not translated). Outcomes: validation error, wrong password, refused for the last admin, success = signed out. 5 attempts per hour. The only irreversible act in the product. | no key (`auth.password` = "Jelszó" is an existing field label) | — |
| Change password | planned (backend only) | `POST /auth/change-credentials` (current + new password; signs out every session). Also the mandatory first step for coach-pregenerated accounts, which the server locks until done — no screen handles that state. | no key<br>`auth.passwordRules` = "Legalább 12 karakter, kis- és nagybetűvel és számmal." | — |
| Coach account: door to the public profile editor | planned (the door; `/compose/profile` itself is live) | A coach's Profil is identical to a member's apart from the role chip. Nothing phone-reachable links to `/compose` or `/compose/profile`. | `nav.composeProfile` = "Nyilvános profil"<br>`settings.role.coach` = "Edző" | Kovács Péter · Edző |

### 3.3 COULD

| Element | Status | Data + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| `/coins` — statement | live | Every credit and debit, newest first: reason, date, optional note, signed whole-coin amount. First 25 rows only, no load-more. The reason label arrives from the server in ENGLISH ("Achievement reward", "Store purchase", "Administrative credit", "Administrative debit") — no key. | `coins.noHistoryTitle` = "Még nincs mozgás"<br>`coins.noHistoryBody` = "Az érmék akkor jelennek meg itt, amikor kiérdemelted vagy elköltötted őket." | rows in §6 |
| Progress photos | live on `/progress` → Fotók | Upload a dated photo (JPEG / PNG / WebP), grid with date and delete (delete asks for confirmation). Private by default. No lightbox, no compare. | `progress.tab.photos` = "Fotók"<br>`progress.addPhoto` = "Fotó hozzáadása"<br>`progress.photoPrivacyNote` = "A fotóidat alapból SENKI nem látja — az edződ sem, amíg te nem engeded meg."<br>`progress.noPhotosTitle` = "Még nincs fotó" | none (empty state) |
| Sharing with the coach + access log | live on `/progress` → Megosztás | Per coach: two independent consents (measurements, photos), effective at once; "revoke all"; an ended link is closed. Access log of who viewed what. The spec says this control must STAY next to what it governs and must not move into settings. No coach screen consumes the grant yet, so through the UI the log stays empty. | `progress.tab.sharing` = "Megosztás"<br>`progress.shareMeasurements` = "Mérések megosztása"<br>`progress.sharePhotos` = "Fotók megosztása"<br>`progress.revokeAll` = "Minden hozzáférés visszavonása"<br>`progress.noLooks` = "Még senki nem nézte meg." | Kovács Péter — measurements ON, photos OFF |
| Sign out on all devices | planned (backend only) | `POST /auth/logout-all`. | no key | — |
| Own workout history, PR book, per-exercise progress, calendar feed | planned (backend only) | `GET /workouts` (max 50 rows, no count endpoint → no lifetime "N edzés" figure), `GET /records`, `GET /progress?exercise_id=`, `/calendar-feeds`. No member consumer. | no member-side key | — |
| Door to the public marketplace | planned (the door; `/m` itself is live) | No phone-reachable link for a signed-in user. Those pages have no "join this coach", no ratings, no follower count. | `nav.marketplace` = "Piactér" | — |
| "Member since" | planned | `created_at` is in the session; nothing renders it. | no key | — |
| Custom accent colour + gradient builder | cut | Removed from the screen; keys remain. | `settings.accentCustom` = "Egyedi szín"<br>`settings.gradient.title` = "Gradiens" | — |
| Notification preferences | cut | None exist; notifications are in-app only. | no key | — |
| Levels, streak counter | planned (LifeOS, [[0022-lifeos-gamification-and-one-currency|ADR-0022]]) | Level and XP on `GET /coins/wallet` since Phase 2 (backend); the streak figure with habits in Phase 3; reached from Profil (ÉRMÉK / SZINT rows). | no key yet | — |
| Leaderboard, celebration toggle | cut | Animations follow the OS reduced-motion setting only. | no key | — |

### 3.4 States

| State | What is on screen |
|---|---|
| Before the screen | The route guard shows a full-screen skeleton while the session is pending and redirects to `/login` without a user — so "identity loading" and "identity empty" never occur on this screen. |
| Session refetch failed (cached user) | Name, e-mail and role chip unchanged; ONLY the healthy-session mark is absent. |
| No display name | Name line = e-mail local part; monogram derived from it; the name field shows its placeholder. |
| Display name editing | Save hidden until the text changes; disabled under 2 or over 120 characters; busy while saving; failure silent. |
| Theme | previewing an unsaved pack (whole app repainted, save enabled) / saving / save failed (inline error, choice kept) / nothing to save (save disabled). Unowned paid pack: free preview, save refused with the same generic error. |
| Equipment | own loading placeholder (separate request) · status line: empty / "Mentés folyamatban" / "Felszerelés mentve" / save error (the chip stays as the user left it). |
| Device-gated cue | disabled with (vibration) or without (speech) an explanation; never hidden. |
| Offline | Shell strip; sign-out and coin purchases must NOT queue (they fail visibly). |
| Role | chip Tag / Edző / Admin; admin section only for admins; a coach's screen is otherwise identical to a member's. |
| Coins — wallet | loading (placeholder figure) / fetch failed (NO figure, never a 0) / balance just changed (delta in the caption slot). |
| Coins — store | loading / empty / owned / affordable vs unaffordable (both tappable) / purchase in flight (that control busy, the others inert) / refused / replayed, not charged again. |
| Coins — achievements | always 7 rows, each locked or unlocked. |
| Coins — statement | rows / empty ("Még nincs mozgás"). |
| Pre-generated account | Server blocks everything except reading the session, changing credentials and logging out — no frontend screen handles it (gap). |

### 3.5 Do not invent (Profile, coins)

- Uploaded profile photo, avatar picker, camera badge, "change picture" — monograms only, for members and coaches alike.
- Ranks, tiers. (Levels and XP are no longer in this list: [[0022-lifeos-gamification-and-one-currency|ADR-0022]] — the level is a figure with a SegmentBar on Érmék, design round B.)
- A streak flame or a streak calendar. (The streak figure and the freeze count are LifeOS, ADR-0022, Phase 3.)
- Leaderboards, friends, followers / following counts, a social feed on the profile.
- Profile stats header (total workouts, PR count, streak), bio, a public member profile.
- Daily login rewards, "X coins until …", countdown offers, limited-time deals.
- Buying coins with money, top-up, payment methods, member subscription, "Premium".
- A "claim reward" button, an unlock celebration, per-achievement artwork, or any achievement beyond the seven.
- Store items other than Aurora and Ember.
- A printed "190 érme" label as existing visible copy (the key is an aria-label), a balance history chart, working "this week" / "spent" figures.
- A locked / priced theme chip as existing behaviour (the data exists server-side; the client state and its copy do not).
- Custom accent colour picker, hex field, gradient builder.
- Notification settings: per-type toggles, quiet hours, push on / off, e-mail toggles, weekly digest.
- E-mail verification status, change e-mail, two-factor auth, Face ID lock, active sessions / devices list, social sign-in connections, password reset.
- Apple Health / Google Fit / wearable connections.
- A units (kg / lb) switch as a settings row — it exists only inside the questionnaire.
- Goal weight, target rings, or good / bad colouring for body measurements.
- Before / after photo compare, photo lightbox, sharing photos outside the app.
- Coach ratings / reviews, "find a coach" inside the profile, multiple equipment profiles (gym / home / travel).
- Help centre, FAQ, contact support, terms / privacy links, app version row, "rate the app".
- A confirmation dialog on sign-out, or a save button on equipment (both are explicit decisions).
- Moving the measurement / photo sharing consent into settings.

### 3.6 Open decisions for the owner (Profile)

1. The tab says "Profil", the screen says "Beállítások". Is the redesigned screen a true profile (identity, coins, coach, stats, settings beneath) or still a settings page? Which title wins?
2. Is a real profile photo wanted? The brief asks for an image-rich UI; only monograms exist, and a photo needs new upload / storage / moderation backend.
3. Show the coin balance on the profile itself? Weekly-earned, total-spent and lifetime figures are NOT sent by the server.
4. A "my coach" card with enter-code / message / leave actions? All of it needs new screens and new copy.
5. Do data export, account deletion and password change belong in this design now?
6. Which theme list should the design show: the seven live packs, or the recorded target (ADR-0015: Éjfél free + Aurora / Ember purchasable) plus a dark / light / system control? How does a not-yet-bought pack lead to the store? Do the ADR-0015 decisions, made for the design now being discarded, still bind — the store's only two items are theme packs?
7. Keep preview-then-save for themes, or apply on tap?
8. Read-only body summary on the profile, given Haladás is its own tab?
9. An "edit questionnaire" entry for the answers other than equipment?
10. A streak number or level would be an obvious hook, but neither exists. Is a new endpoint in scope, or is the hook the 4 / 7 achievements and the coin balance only?
11. For coaches: a "Nyilvános profil" row (it would be the first mobile door, not a duplicate)?
12. iPhone "liquid glass" direction: there is no native iOS project (PWA only), and haptics do not work in iOS Safari. Pure web inside Safari / PWA, or is a Capacitor iOS build planned?

---

## 4. Navigation

The bottom bar is the app's only primary navigation. Tab sets are fixed per role (source: `frontend/src/app/navTabs.ts`); the bar is a convenience, every route and endpoint re-checks the role. Landmark name: `nav.primary` = "Fő navigáció". No badge is wired on any tab.

### 4.1 Tabs per role (in order)

| Tab | Exact label | Route | Also active on | Member (5) | Coach (6) | Admin (7) |
|---|---|---|---|---|---|---|
| Home | `nav.home` = "Kezdőlap" | `/` | `/onboarding` | 1 | 1 | 1 |
| Workout | `nav.workout` = "Edzés" | `/workout` | `/library`, `/library/:id` | 2 | 2 | 2 |
| Nutrition | `nav.nutritionShort` = "Étkezés" | `/nutrition` | — | 3 | 3 | 3 |
| Progress | `nav.progress` = "Haladás" | `/progress` | — | 4 | 4 | 4 |
| Coach | `nav.coach` = "Edző" | `/coach` | `/coach/…`, `/compose/…` (declared for `/m` too, but `/m` renders outside the shell with no bar) | — | 5 | 5 |
| Admin | `nav.admin` = "Admin" | `/admin` | `/admin/styles` | — | — | 6 |
| Profile | `nav.profile` = "Profil" | `/settings` | `/coins` | 5 | 6 | 7 |

- Member: Kezdőlap · Edzés · Étkezés · Haladás · Profil
- Coach: Kezdőlap · Edzés · Étkezés · Haladás · Edző · Profil
- Admin: Kezdőlap · Edzés · Étkezés · Haladás · Edző · Admin · Profil
- The sequence opens on Home and closes on Profil in all three roles. The design must work at 5, 6 and 7 tabs (or the owner changes the tab sets).
- "Edzés" opens the workout player; with no running session it is an empty state with no action: `workout.noneTitle` = "Most nincs futó edzés", `workout.noneBody` = "Indíts egyet a mai napból, vagy csinálj szabad edzést."
- A member opening a coach or admin route sees a forbidden state: `coaching.forbiddenTitle` = "Ez a felület edzőknek szól", `admin.forbiddenTitle` = "Nincs jogosultságod".

### 4.2 Destinations without a tab

| Destination | Status | Door on a phone today | Active tab there |
|---|---|---|---|
| `/notifications` (inbox) | live | The bell — only on Home and on the coach dashboard | none |
| `/library`, `/library/:id` (muscle selector, exercise detail) | live | Home empty-state button only | Edzés |
| `/coins` (wallet, store, achievements, statement) | live | Row in Profil | Profil |
| `/onboarding` (questionnaire) | live | none (URL only) | Kezdőlap |
| `/coach/plans` | live (coach) | Link on the coach dashboard | Edző |
| `/admin/styles` | live (admin) | From the admin page | Admin |
| `/compose`, `/compose/profile` (coach marketplace desk, public profile editor) | live (coach) | none (desktop command palette only) | Edző |
| `/m`, `/m/p/:publicId`, `/m/c/:handle` (public marketplace) | live | none for a signed-in user; pages render OUTSIDE the shell: back control + `auth.switchToLogin` = "Belépés", no bottom bar | — |
| `/login`, `/register` | live | Outside the shell | — |
| Member chat | planned | No route (server-written chat notifications link to `/chat/<id>`, which falls back to Home) | — |
| Workout history, plan overview, own PR list | planned (backend only) | No route | — |

Other shell facts: unknown URLs redirect to `/`. Every app route passes an auth gate first (full-screen skeleton, then the screen or `/login`). The command palette (`palette.title` = "Parancsok") is desktop-only. There is no global top app bar, drawer or centre action button.

---

## 5. Global do-not-invent list

Screen-specific lists are in §1.5, §2.7 and §3.5. This list covers the rest of the product so no mockup shows a feature that does not exist.

**Social and marketplace**
- Comments and replies on marketplace posts — cut.
- Likes, reactions, heart counts — cut.
- Follow button, follower counts, "trending" or ranked coaches — cut; no follow endpoint or UI exists.
- A "following" feed, a member-to-member feed, friends, activity sharing — never built.
- Person-level block list on the marketplace — cut.
- Report button or share button on public posts and profiles — report is API-only, share does not exist.
- A city filter on the marketplace feed, or a "browse coaches" directory screen — the feed has kind chips and search only; coaches are reachable only through a post.
- In-app booking, checkout or "buy" on marketplace posts — the price is informational: `marketplace.priceNote` = "Az ár tájékoztató. A jelentkezés az edzővel közvetlenül történik — a fizetés még nem az appon keresztül megy."
- Coach plan-template marketplace for coins — cut.
- White-label coach branding — parked ("do NOT build").
- Post image galleries, image reordering, scheduled publishing in the coach composer — cut (one cover image only).

**Money**
- Buying coins with real money, coin payouts, cash balance — deferred; coins are earn-only.
- Subscription paywall, pricing or billing screen, "upgrade plan", seat-usage meter — not built (only a webhook receiver and a server-side seat cap exist).

**Gamification** — rewritten 2026-10-18: the ban is reversed by the owner (2026-10-17), see
[[0022-lifeos-gamification-and-one-currency|ADR-0022]]. LifeOS (the f_app port) brings full
gamification on ONE currency: every point is a TRACKER coin.
- XP and levels — planned, backend live since Phase 2 (B-core): `GET /coins/wallet` answers `xp`,
  `level` and `bounds` (level = floor(sqrt(xp / 100))); XP is earned only by LifeOS awards, a reversal
  takes it back, a penalty never does. Shown as a level figure with a SegmentBar (Érmék, design round B).
- Negative balance ("TARTOZÁS") — planned, backend live since Phase 2: penalties may take the balance
  below zero; spends may not (`spendableMinor` = max(0, balance)).
- Streaks, the streak multiplier, freezes, milestones — planned for Phase 3 (habits); a figure with
  "NAP", a lime multiplier segment, a mono freeze count. Never a flame.
- Daily challenge, rewards, redeeming — planned for Phase 4.
- The rules (points per action, multipliers, the 400-coin daily cap) — admin-global, edited on the
  admin "Szabályok" page (`GET / PUT /admin/rules`, Phase 2 backend).
- Leaderboards, rankings — still deferred.
- Achievement-unlocked or coin-earned notifications, toasts, celebration overlays — not emitted yet;
  LifeOS reminders and the day summary arrive as self-notifications in Phase 5.

**Notifications and chat**
- Push, e-mail or SMS notifications — deferred (in-app only).
- Notification settings (per-type toggles, quiet hours) — deferred.
- Notification types for plan changes, workout reminders, PRs, coins or achievements — not emitted. Only "new chat message" (its title is the sender's e-mail local part; no message text) and "coach changed your equipment" are real.
- Member chat inbox, messages icon, conversation list — no member-side chat screen or route.
- Typing indicators, online presence, realtime delivery, auto-linked URLs in messages.
- Video form-check upload, timestamped coach notes, deleting a sent message — backend only.
- Weekly digest or summary e-mails — deferred.

**Nutrition and health**
- Barcode scanner / OpenFoodFacts lookup — deferred.
- "Remaining calories" budget figure, nutrition streak, water tracking — deliberately not built.
- A meal picker (breakfast / lunch / dinner) as existing — everything logged from the UI lands under `nutrition.unlabelled` = "Egyéb"; meal names in the demo are seed strings without keys.
- A create-your-own-food form, a weekly or monthly nutrition view — hooks exist, no screen.
- Coach view of the client's food diary — the food log stays private; the coach sees only what was prescribed.
- Apple Health / Google Fit sync, steps, sleep, heart rate, wearables — not started.

**Workout and plans**
- Finish-workout button, post-workout summary or celebration, abandon confirmation — as existing features.
- A freestyle "start empty workout" button, or any button on the `/workout` empty state.
- An exercise photo or video inside the workout player — the "Videó" chip shows a stand-in.
- "Tabata" as a block type — interval blocks are circuit, EMOM and AMRAP.
- Member workout-history list, calendar month view, week pager.
- Member's own PR list and per-exercise strength charts — only the coach's client screen draws them.
- Member-created plans, auto- or AI-generated plans and recommendations, a member plan overview, skip / move a session.
- A coach screen showing a client's shared measurements or photos — not built, although the member-side consent switches are live.
- Drag-and-drop reordering in the coach plan editor — reordering is up / down controls.

**Account**
- Password reset / "forgot password", social login (Google / Apple), e-mail verification, in-app password change, an invite-code field on register.
- Data-export and delete-account controls, "sign out everywhere", a device list — endpoints only.
- A light-mode toggle as an existing feature — the app is dark-only today.
- Avatar or profile-photo upload for members or coaches — monograms everywhere.

**Shell and platform**
- Global top app bar, hamburger menu, drawer, centre floating action button.
- A Library, Coins, Notifications, Messages or Marketplace tab — tab sets are fixed at 5 / 6 / 7.
- Badges on tabs.
- Coach marks or a first-run product tour.
- Native-only capabilities taken for granted — there is no native iOS / Android project; haptics do not work in iOS Safari.
- Offline behaviour beyond the strip — only workout set checks queue; a cold start offline lands on the login screen.

**Admin**
- DAU / MAU figures; role-grant, disable-account or coin-adjust controls — API only.

---

## 6. Sample persona + data set (reuse in every mockup)

One fictional member, so the five style directions stay comparable. Every value uses a data shape that exists in the product. Plan, schedule, targets, measurements, coins, achievements, equipment and questionnaire answers mirror the demo seed of the member account (`backend/scripts/seed-demo.mjs`, account `user@tracker.local`, whose seeded display name is "Teszt Elek", monogram TE). The display name and e-mail below are fictional replacements; the logged macro totals are illustrative.

### 6.1 People

| Field | Value | Where it shows |
|---|---|---|
| Member display name | Takács Dániel | Profil identity; name the coach sees |
| Member monogram | TD | Profil identity |
| Member e-mail | takacs.daniel@pelda.hu | Profil only (never on Home) |
| Role chip | Tag | Profil identity |
| App language | Magyar | Profil → Nyelv |
| Coach display name | Kovács Péter (monogram KP) | Haladás → Megosztás today; any planned coach row / card |
| Coach team | Erőemelő csapat | coach side only |
| Linked to coach | about 90 days ago | — |
| Coach public headline | Erőnléti edző · 12 év tapasztalat · Budapest és online | public marketplace profile (`/m/c/kovacs-peter`) |
| Coach's latest message (unread) | Ja és a hétvégi edzést tedd át szombat délelőttre, ha tudod. | planned coach row only (no member chat screen exists) |

### 6.2 Plan and reference week

Plan: **Felső/alsó szplit – 12 hetes blokk** — goal Izomtömeg, 7-day cycle, status active, started 2026-07-13, no end date. Four training days and three prescribed rest days per week.

Reference moment for all mockups: **Friday 9 October 2026, afternoon, before training.**

| Cell | Date | Plan day | Start | Exercises | Est. minutes (not shown today) | State at the reference moment |
|---|---|---|---|---|---|---|
| H | 2026-10-05 | Alsótest – erő | 18:00 | 5 | 70 | trained |
| K | 2026-10-06 | Pihenőnap | — | — | — | rest (blank cell) |
| Sze | 2026-10-07 | Felsőtest – nyomás | 18:00 | 5 | 65 | trained |
| Cs | 2026-10-08 | Pihenőnap | — | — | — | rest (blank cell) |
| P | 2026-10-09 | Felsőtest – húzás | 18:00 | 5 | 65 | TODAY · scheduled |
| Szo | 2026-10-10 | Alsótest – volumen | 10:00 | 4 | 60 | scheduled |
| V | 2026-10-11 | Pihenőnap | — | — | — | rest (blank cell) |

### 6.3 Home frames

| Frame | Date line | Bell | Ring | Today region | Nutrition |
|---|---|---|---|---|---|
| A — default (use this one first) | Péntek, október 9. | 2 | 2 / 4 · Heti edzés | Mai edzés → Felsőtest – húzás · Felső/alsó szplit – 12 hetes blokk · 18:00 · 5 gyakorlat · [Indítás] | 1840 / cél 2600 · 128 g / cél 180 g · 210 g / cél 290 g · 52 g / cél 70 g |
| B — session running | Péntek, október 9. | 2 | 3 / 4 (the log exists as soon as the session starts; P cell = trained) | Mai edzés → Edzés folyamatban · Felsőtest – húzás · [Folytatás] | as A |
| C — rest day | Csütörtök, október 8. | 2 | 2 / 4 | Mai edzés → Pihenőnap · Felső/alsó szplit – 12 hetes blokk · Pihenőnap | targets: cél 2200 · cél 180 g · cél 190 g · cél 75 g |
| D — already trained | Szerda, október 7. | 2 | 2 / 4 | Mai edzés → Felsőtest – nyomás · Felső/alsó szplit – 12 hetes blokk · 18:00 · 5 gyakorlat · Kész | as A |
| E — nothing scheduled (member without a plan) | Péntek, október 9. | 0 (no badge) | not shown | Ma nincs betervezve edzés · Ha van aktív terved, a mai napja itt jelenik meg. · [Gyakorlatok böngészése] | block absent (nothing logged, no target) |
| F — offline | as A | as A | as A | strip above the header: Nincs internetkapcsolat · 3 művelet vár feltöltésre | as A |

Macro variants: over target → 305 g / cél 290 g on carbohydrate; no target → captions Kalória · Fehérje · Szénhidrát · Zsír with no progress.

### 6.4 Nutrition

| Item | Value |
|---|---|
| Nutrition plan | Rekomp étrend – 7 napos ciklus (coach-assigned, active) |
| Friday target (training day, "Edzésnap – péntek") | 2600 kcal · 180 g protein · 290 g carbohydrate · 70 g fat |
| Logged by the reference moment (illustrative) | 1840 kcal · 128 g · 210 g · 52 g |
| Thursday target (rest day, "Pihenőnap – csütörtök") | 2200 kcal · 180 g · 190 g · 75 g |
| Saturday target | 2500 kcal · 175 g · 275 g · 70 g |
| Logged foods (seed vocabulary, grams) | Zabpehely 60 g · Tejsavó fehérjepor, vanília 30 g · Banán 120 g · Csirkemell filé, nyers 180 g · Basmati rizs, főtt 220 g · Brokkoli, párolt 150 g |

### 6.5 Notifications (badge 2)

Two unread items, using the only two event types the server really emits:

| Title (server text, no key) | Body | Age | Opens |
|---|---|---|---|
| kovacs.peter (the sender's e-mail local part) | — (no message text) | `notifications.minutesAgo` = "{{count}} perce" → 5 perce | `/chat/<id>` — not a route; lands on Home |
| Felszerelés frissítve | Az edződ módosította az eszközeidet. | `notifications.hoursAgo` = "{{count}} órája" → 2 órája | `/settings` |

### 6.6 Muscle selector frame

| Item | Value |
|---|---|
| View | Elöl |
| Selected muscle | Mell (chip and map region) |
| Count row | 24 gyakorlat · Szűrők törlése |
| Rows (A–Z by displayed name; all with the media placeholder) | Fekvenyomás · Erő (no difficulty)<br>Fekvenyomás gépen · Kezdő · Erő<br>Fekvenyomás kézisúlyzóval · Kezdő · Erő<br>Fekvőtámasz · Kezdő · Erő<br>Ferde nyomás kézisúlyzóval · Kezdő · Erő<br>Közepes fogású fekvenyomás rúddal · Kezdő · Erő<br>Svend Press · Kezdő · Erő · EN |
| Detail to open | Közepes fogású fekvenyomás rúddal · Kezdő · Erő — primary Mell; secondary Oldalsó vállizom, Tricepsz; caption "További célizmok a hátul nézetben."; equipment Rúd; 5 steps in English; substitutes: Fekvenyomás kézisúlyzóval — Kezdő, Fekvenyomás gépen — Kezdő, Fekvőtámasz — Kezdő, Ferde nyomás kézisúlyzóval — Kezdő |
| Back-view variant | Hátul, Széles hátizom selected → Húzódzkodás · Kezdő · Erő; Széles fogású hátlehúzás · Kezdő · Erő |
| Empty variant | chip Teljes test → Nincs találat · Próbálj más keresőszót vagy szűrőt. · [Szűrők törlése] |

The Hungarian names are what the repo's composer yields for the English dataset names (Bench Press, Machine Bench Press, Dumbbell Bench Press, Pushups, Incline Dumbbell Press, Barbell Bench Press - Medium Grip; "Svend Press" has no Hungarian composition). Row membership and order in the live database were not checked.

### 6.7 Profile frame

| Item | Value |
|---|---|
| Identity | TD · Takács Dániel · takacs.daniel@pelda.hu · Tag |
| Display name field | Takács Dániel |
| Theme packs | Éjfél · Napfény · Erdő · Neon · Mono · Aurora (selected, owned) · Ember (not owned) |
| Translucent surfaces | Rendszer |
| Sounds and haptics | Beszédhang on · Sípszó on · Rezgés: iPhone PWA = disabled with the unavailable hint; native build = on |
| Language | Magyar (selected) · English · Deutsch |
| Equipment | selected: Rúd, Kézisúlyzó, Gép, Kábel, Húzódzkodó rúd, Pad — not selected: Saját testsúly, Kettlebell, Smith-gép, Gumiszalag, EZ-rúd, Medicinlabda, Fitneszlabda, Hengerelő, TRX, Egyéb |
| Questionnaire answers (not on Profil today) | Izomtömeg · Haladó — 1–3 év · 4 sessions per week · 70 perc · Edzőterem · Metrikus (kg / cm) · 181 cm · 88,4 kg at start · born 1994 · Férfi · limitation: Térd — Óvatosan · note: Térdsérülés után óvatosan a mély guggolásokkal. |
| Sharing | Kovács Péter — Mérések megosztása ON · Fotók megosztása OFF |
| Progress photos | none (empty state) |

### 6.8 Coins and achievements

Balance: **190** (visible as the number with the caption "Egyenleged"). 1 coin = 100 internal minor units; only whole coins are shown.

| Achievement (server order) | State | Line shown |
|---|---|---|
| Az első edzés | unlocked | 25 érmét adott |
| 10 edzés | unlocked | 50 érmét adott |
| 100 edzés | locked | 250 érmét ad |
| Az első csúcs | unlocked | 25 érmét adott |
| 7 napos sorozat | unlocked | 50 érmét adott |
| 30 napos sorozat | locked | 150 érmét ad |
| 7 nap naplózva | locked | 25 érmét ad |

Counter: 4 / 7 feloldva.

| Store item | Description | State |
|---|---|---|
| Aurora | Hideg, északi fényű színátmenet. | Megvan |
| Ember | Egyetlen meleg kiemelés. | price 250 (balance 190: not affordable, control still tappable) |

| Statement row (newest first; reason label is the server's English text) | Note | Amount | Age |
|---|---|---|---|
| Administrative debit | Téves jóváírás korrekciója. | −10 | 12 days ago |
| Store purchase | Aurora | −250 | 35 days ago |
| Administrative credit | Demó feltöltés a bemutatóhoz. | +300 | 40 days ago |
| Achievement reward | — | +50 | 55 days ago |
| Achievement reward | — | +50 | 62 days ago |
| Achievement reward | — | +25 | 80 days ago |
| Achievement reward | — | +25 | 84 days ago |

Check: 25 + 25 + 50 + 50 + 300 − 250 − 10 = 190.

### 6.9 Body measurements (Haladás; for any body summary)

Values are printed with a decimal comma and at most one decimal. Changes are neutral — never good / bad coloured, no targets.

| Metric | Latest | 12 weeks earlier | Cadence in the data |
|---|---|---|---|
| Testsúly | 83,1 kg | 88,4 kg (change −5,3 kg) | every 3–4 days |
| Testzsír | 18,6 % | 22,4 % | weekly |
| Derék | 87,5 cm | 92,5 cm | fortnightly |
| Mellkas | 105,1 cm | 104,0 cm | monthly |
| Kar (jobb) | 37,9 cm | 37,2 cm | monthly |

Every series has a deliberate gap (no entries between 63 and 40 days ago); the weight trend captions it with `progress.gap` = "{{count}} nap kihagyás" → 25 nap kihagyás. Latest weight is within the seed's random noise (about ±0,45 kg around 83,2 kg).
