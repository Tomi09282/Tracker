# Pulse — running the app and proving a screen

Area: RUNNING IT AND PROVING IT. Phase: understand (read-only on source).
Written 2026-10-11 (a Sunday) against branch `pulse-redesign` at `2829c3a`. While this was being
written a docs-only commit landed (`0860942`, the Pulse design notes) and the owner answered four
open decisions (`docs/pipeline/pulse/understand/00-owner-decisions.md`, D1 – D4); their effect on
this area is in section 0.1. `frontend/` and `backend/` are byte-identical between the two commits.
Every claim below is either read from a file (path:line given) or measured on this machine today
(Appendix B lists the commands). Where something could NOT be exercised because this phase may not
start servers, it says "not exercised".

---

## 0. What the planner needs to know first

1. **The app is runnable right now.** `backend/.env` is present and valid in shape, the encrypted
   dev DB opens with it (schema `user_version` 29 = newest migration), both `node_modules` are
   installed, the 11 frontend gates are green, `tsc -b` is green, `vite build` is green.
   Nothing is listening on 3000 / 5173 / 4173 at the moment.
2. **The dev data is 48 days stale.** `seed:demo` anchors everything on the day it runs; it last ran
   on 2026-08-24. The Figma frames were drawn for the week of 2026-10-05 (reference moment Friday
   2026-10-09). Re-seed before any screen is compared, and again every Monday (section 3).
3. **A desktop browser at 402 x 874 does not match a Figma frame**, because the frame reserves a
   62 pt status-bar zone and a 34 pt home-indicator zone and a browser reports both insets as 0.
   This is solved, and proven on this machine: headless Chrome 154 over raw CDP accepts
   `Emulation.setSafeAreaInsetsOverride`, and at 402 x 874 with device scale 2 it produces an
   804 x 1748 PNG — the exact pixel size of the frame PNGs (section 5, Appendix A).
4. **The in-app Browser pane is not a reliable eye on this machine.** Six earlier phase audits
   record "the pane does not composite frames in this session": screenshots fail, and CSS
   transitions and `requestAnimationFrame` freeze. Use it for clicking around, not as the proof.
5. **`npx tsc --noEmit` is a false green.** The root `tsconfig.json` has `files: []`, so that
   command checks 0 files and exits 0 in 0.9 s. The real per-agent check is
   `npx tsc -p tsconfig.app.json --noEmit` (143 files, 6.7 s, writes nothing).
6. **One account cannot serve every screen.** The tab bar has 5 / 6 / 7 tabs by role and the kit
   draws each count differently; `admin@` and `coach@` have no member data at all. Member frames
   need `user@`, coach frames `coach@`, admin frames `admin@`, public frames no session.
7. **Parallel agents will hit the login limiter.** 10 logins per 15 minutes per IP, and every local
   agent is the same IP. All live sessions in the DB have expired (0 live refresh tokens), so
   everybody starts by logging in. Fix: run the dev backend with `NODE_ENV=test` (the only thing
   that changes is that the 32 limiters skip and stdout logging stops), or let one tool own login.
8. **There is no URL-addressable sub-state.** `useSearchParams` is used nowhere in `frontend/src`.
   Tabs, sheets, the selected muscle and the onboarding step live in component state, so about half
   of the 59 frames need clicks to reach and are lost on every full reload.
9. **A full `npm run build` costs about 16 seconds**, so a single serial integrator is not a
   bottleneck. What must be serial is small and listed in section 6.

### 0.1 What the owner's decisions (D1 – D4) change for running and proving

| Decision | Effect on this area |
|---|---|
| D1 — Pulse is the only look; the seven packs, the aurora skins, the glass tokens and `data-transparency` are deleted; the backend still sells and returns packs for now | (a) The frames that DRAW packs are no longer the target where they show them: `settings-1/2` (pack rows, "Áttetsző felületek") and `coins-1` (the two store items are theme packs). Compare structure, not those rows. (b) A new must-prove case: a browser that still holds an old `localStorage['tracker.theme']` (a pack id, a custom accent, a gradient, `transparency`) and an account whose server pref is `aurora` (that is `user@`) must render plain Pulse. The capture tool should be able to pre-load `localStorage` so this is tested on purpose. (c) `index.html:19-39` (the pre-paint script) and `index.html:9` (`theme-color`) change with it. |
| D2 — with no session running, the "Edzés" tab shows the muscle selector / library; with a session it shows the player; Home gets a row to the library | The frame `workout-3` ("nincs futó edzés", an empty player) is superseded: at `/workout` the no-session account must show the library (compare with `library-1`). Two accounts prove the switch: `user@` (live session → player) and `demo.nagy.balazs@` (none → selector). The Home row is not in any frame. |
| D3 — the redesign is frontend-only; finishing a workout is a later package and must not be faked | `user@` will show "Edzés folyamatban · Folytatás" on Home for ever after a re-seed, by design. Reaching `home-1` therefore needs section 8 (abandon through the existing endpoint in a test window, or a fixture), never a new button. It also settles the default for unreachable states: fixtures on the frontend side, not a seed change. |
| D4 — every finished step is its own local commit on `pulse-redesign`; never push; never touch `master`; message ends with the co-author line | The integrator commits per step with `git add <owned paths>`. In a shared tree a commit must never sweep in another agent's half-written files. Worktree branches, if used, are merged locally only. |

---

## 1. What is runnable right now (measured)

| Thing | State | Evidence |
|---|---|---|
| Node / npm | v24.16.0 / 11.13.0 | `node --version` |
| `backend/.env` | present, 1731 bytes; every required key set (NODE_ENV=development, PORT, DB_PATH, DB_MASTER_KEY 43 chars, DB_KEY_SALT 22, JWT_SECRET 43, JWT_KID, issuer, audience, LOG_LEVEL, CORS empty, STRIPE_WEBHOOK_SECRET set) | key names and lengths only were read; values never printed |
| Encrypted dev DB | `backend/data/app.db`, 7,831,552 bytes, last written 2026-10-05 22:20, no `-wal` / `-shm` sidecar (nothing has it open) | `ls backend/data` |
| DB opens with the `.env` key | yes — a read-only SELECT script through `src/db/index.js` returned rows; `PRAGMA user_version` = 29; 104 tables | scratch script, SELECT only |
| Migrations | 28 files, newest `029_display_name.sql` → boot will apply nothing | `ls backend/src/db/migrations` |
| `backend/node_modules` | installed, 53 MB, native `better_sqlite3.node` built | `ls .../build/Release` |
| `frontend/node_modules` | installed, 184 MB | `du -sh` |
| Installed versions | **vite 8.2.0**, typescript 6.0.3, react 19.2.8, tailwindcss 4.3.3, react-router 8.3.0 (the brief said Vite 6 — it is 8) | each `package.json` in `node_modules` |
| Fonts installed | only `@fontsource-variable/inter` and `@fontsource/space-grotesk`. Big Shoulders Display, Geist, Geist Mono are NOT installed | `ls node_modules/@fontsource*` |
| 11 build gates | all exit 0 (table in section 6.1) | each run once today |
| `tsc -b` | exit 0, 7.0 s | run today |
| `vite build` | exit 0, 1.9 s wall (built into a scratch dir; `frontend/dist` untouched, still the 2026-10-05 build) | run today |
| `oxlint` | exits 0 with warnings only (react-hooks/exhaustive-deps); 1.3 s; NOT part of `npm run build`, there is no `lint` script | run today |
| Ports 3000 / 5173 / 4173 | nothing listening | `netstat -ano` |
| Live sessions in the DB | 0 un-revoked, un-expired refresh tokens — every browser must log in again | SELECT |
| Browsers | Google Chrome 154.0.8037.99 at `C:\Program Files\Google\Chrome\Application\chrome.exe`; Playwright's `chromium-1234` and `chromium_headless_shell-1234` are on disk under `%LOCALAPPDATA%\ms-playwright`; no `playwright` / `puppeteer` npm package in the repo | `ls` |
| Machine | 24 logical cores, 15.9 GB RAM, **3.1 GB free at the time of measuring** | `os` module |
| Repo README | none at the root. `frontend/README.md` is the untouched Vite template. Run knowledge lives in `docs/pipeline/SHARED_MEMORY.md` | `ls` |
| Git | branch `pulse-redesign`. At the start: HEAD `2829c3a`, with the Pulse notes untracked. At the end: HEAD `0860942` (the notes committed, docs only); the only untracked path is `docs/pipeline/pulse/`. A second worktree exists at `…/scratchpad/pre-pull` (detached `234089b`) | `git status`, `git log`, `git worktree list` |

---

## 2. How to run it

### 2.1 The two processes

| Process | Command (run from) | Port | What it does |
|---|---|---|---|
| Backend | `npm run dev` in `backend/` = `node run-server.js` | 3000 (`PORT` in `.env`) | `run-server.js` is a crash SUPERVISOR that spawns `server.js` (`backend/run-server.js:31`). `server.js` runs migrations at boot (`server.js:48`), purges expired refresh tokens (`:67`), then listens (`:267`). |
| Frontend | `npm run dev` in `frontend/` = `vite` | 5173, `strictPort: true` (`frontend/vite.config.ts:12-13`) | Proxies `/api` and `/healthz` to `http://localhost:3000` (`:15-22`), so the app is same-origin and the auth cookies behave as in production. |
| Preview (built app) | `npm run preview` in `frontend/` | 4173, strict (`vite.config.ts:24-34`) | Serves `frontend/dist` with the same proxy. This is the only place the service worker registers (`src/lib/registerSW.ts:46`). |

Facts that bite:

- **The backend must run with cwd = `backend/`.** `.env` is loaded by `dotenv/config` from cwd,
  `DB_PATH` is `./data/app.db`, `STORAGE_ROOT` is `path.resolve('storage')`
  (`backend/src/lib/media.js:18`), the log is `./logs/server.log` (`src/lib/logger.js:14`).
  `npm run dev --prefix <abs path to backend>` satisfies this.
- **Stop the supervisor, not the child.** Killing only `server.js` makes `run-server.js` respawn it
  and keep the DB open (`run-server.js:6-8`, `SHARED_MEMORY.md:234`).
- **The frontend hot-reloads; the backend does not** (`SHARED_MEMORY.md`, just above section 4d). Irrelevant
  while Pulse leaves the backend alone, but it means a backend restart is the only way to reset the
  in-memory rate limiters.
- **The backend does not serve the frontend.** There is no `express.static` in `server.js`; the
  CSP in `server.js:93-122` therefore never applies to the page in dev or in `vite preview`.
- **Environment variables on the command line win over `.env`** (dotenv does not override). The
  project already relies on this: `backend/scripts/smoke-run.mjs:22-31` boots a throwaway server
  with `NODE_ENV`, `PORT` and `DB_PATH` overridden.
- **Default DB pool = 23 worker threads on this machine** (`max(2, cores-1)`,
  `backend/src/db/index.js:13`), each running the scrypt KDF and opening the DB. With 3 GB free,
  start the dev backend with `DB_POOL_THREADS=4`.

### 2.2 Launch configs (for `preview_start`)

| File | Entries relevant to TRACKER | Gap |
|---|---|---|
| `C:/Users/Petike/Documents/Cursor/tracker/.claude/launch.json` | `tracker-frontend` (npm run dev --prefix frontend, 5173), `tracker-preview` (npm run preview --prefix frontend, 4173) | **no backend entry** |
| `C:/Users/Petike/Documents/Claude Code/.claude/launch.json` (the session's working directory, so this is the one `preview_start` reads) | `tracker-frontend` with the absolute prefix, 5173 | **no backend entry, no preview entry**; and `haromezer-api` in the same file claims **port 3000**, the TRACKER backend's port |

Other ports that file reserves: 5174, 5176, 5177, 5187, 5190. If extra Vite instances are ever
needed for TRACKER (worktree mode), use 5180-5186.

Until a backend entry exists, the backend has to be started from a shell. Recommended command for
the implementation phase (Git Bash; not exercised in this phase):

```bash
cd /c/Users/Petike/Documents/Cursor/tracker/backend && NODE_ENV=test DB_POOL_THREADS=4 npm run dev
```

PowerShell: `$env:NODE_ENV='test'; $env:DB_POOL_THREADS='4'; npm run dev --prefix C:\Users\Petike\Documents\Cursor\tracker\backend`

Health checks: `http://localhost:3000/healthz` (liveness, `server.js:183`),
`http://localhost:3000/readyz` (DB reachable, `:186`), and through Vite
`http://localhost:5173/healthz` and `http://localhost:5173/api/v1/config` → `{"appName":"Tracker"}`.

### 2.3 What `NODE_ENV=test` changes (the whole list)

`grep NODE_ENV backend/src backend/server.js` — four behaviours exist, and only the first two
differ between `development` and `test`:

| Site | development | test |
|---|---|---|
| every limiter — 40 `rateLimit({` call sites, each with a `skip` that tests `NODE_ENV === 'test'` (32 literal checks; five files share one through a `limiter()` helper) | limiters live | **limiters skipped** |
| `src/lib/logger.js:17` | also logs to stdout | file only |
| `src/auth/middleware.js:7` (`isProd`) | false — cookies `access` / `refresh`, not Secure | identical |
| `server.js:118` (HSTS) | off | off |

The seed scripts refuse only `production` (`seed-dev-users.mjs:11`, `seed-demo.mjs:64`).
So `NODE_ENV=test` is "development without rate limits", set per process, with no file changed.

### 2.4 Database scripts (all in `backend/`, all need cwd = `backend/`)

| Script | What it does | Mutates the dev DB |
|---|---|---|
| `npm run migrate` | applies pending migrations without binding a port (`scripts/migrate.mjs`) | only if pending (none are) |
| `npm run seed:dev-users` | creates / resets `user@`, `coach@`, `admin@tracker.local`: password, role, display name, clears `disabled_at`, `failed_logins`, `next_login_at`; puts coach and admin on the `unlimited` tier (`scripts/seed-dev-users.mjs:19-71`) | yes, idempotent |
| `npm run seed:demo` | DELETES every row owned by the three fixtures and by `demo.*@tracker.local`, then re-inserts from scratch, anchored on today (`scripts/seed-demo.mjs:17-36, 115-124`). Requires the three fixtures to exist (`:145-157`) | yes, destructive for fixture content |
| `npm run seed:exercises`, `seed:translations` | catalogue import; already done (1653 global exercises) | not needed |
| `npm run backup` | encrypted `VACUUM INTO` copy under `backend/backups/` | no |
| `npm run smoke` | hermetic: its own temp DB and random port 3100-3499, `NODE_ENV=test` | no |

`seed:demo` uses only WAL writes through the pool, so it can run while the server is up, but every
open page shows transient empties while it deletes and re-inserts. Run it at a wave boundary.
How long it takes was not measured (running it would have changed the DB).

---

## 3. Seed data — who exists and who has what

### 3.1 Accounts

Password for all of them: the dev fixture password defined once at
`backend/scripts/seed-dev-users.mjs:16` (and reused at `seed-demo.mjs:69`). Do not copy it into
a third file; read it from there or from an env var.

| Account | Role | Display name | Tabs | What it is for |
|---|---|---|---|---|
| `user@tracker.local` | user | Teszt Elek | 5 | THE member. Every member frame was drawn from this account's seed |
| `coach@tracker.local` | coach | Kovács Péter | 6 | THE coach. Handle `kovacs-peter`, verified, published profile |
| `admin@tracker.local` | admin | Rendszergazda | 7 | admin screens; also an "empty" coach |
| `demo.kovacs.eszter@`, `demo.toth.reka@`, `demo.horvath.anna@tracker.local` | user | named | 5 | clients WITH an active plan and NO live session |
| `demo.nagy.balazs@`, `demo.szabo.gergo@`, `demo.varga.mate@`, `demo.kiss.dora@` | user | named | 5 | active clients, no plan, freestyle history |
| `demo.molnar.zsolt@`, `demo.farkas.nora@` | user | named | 5 | lapsed (last trained 31 / 47 days before the seed day) |
| `demo.balogh.tamas@`, `demo.papp.viktoria@` | user | named | 5 | invited, not accepted |
| `demo.lukacs.adam@`, `demo.nemeth.zsofia@` | user | NULL name, `must_change_credentials = 1` | 5 | pregenerated, awaiting handover |
| `demo.simon.laszlo@` | user | named | 5 | archived link |
| `demo.coach.szilagyi.reka@`, `demo.coach.feher.tamas@` | coach | named | 6 | second marketplace coaches, `starter` tier, no clients, no plans |

Also in the DB and NOT fixtures: **30 leftover accounts** from earlier manual smoke runs
(`smoke-…@example.com`, `player-…@example.com`, `ui-onb-…@example.com` …). Totals today:
49 users (45 user, 3 coach, 1 admin). The admin frame shows 19 / 15 / 3 / 1.

### 3.2 What each fixed account holds (queried from the DB today)

| | `user@` | `coach@` | `admin@` |
|---|---|---|---|
| Active workout plan as client | 1 (`Felső/alsó szplit – 12 hetes blokk`, 7-day cycle) | 0 | 0 |
| Plans authored | 0 | 9 (5 templates: active, draft, active, paused, ended/archived; 4 client plans) | 0 |
| Completed sessions | 42 | 0 | 0 |
| Live (`in_progress`) session | 1 | 0 | 0 |
| PR events | 17 | 0 | 0 |
| Body measurements | 42 rows, 5 metrics, last 2026-08-23 | 0 | 0 |
| Progress photos | 0 | 0 | 0 |
| Nutrition plan (active) | 1 (`Rekomp étrend – 7 napos ciklus`) | 0 | 0 |
| Nutrition log items | 542, last 2026-08-26 | 1 | 0 |
| Coins | 190.00 (19000 minor), 7 ledger rows, 4 of 7 achievements | 125.00, 1 row | 0, no rows |
| Notifications | 8, **0 unread** | 5, 2 unread | 3, 0 unread |
| Coach links (as coach) | 0 | 15 (12 active incl. 2 pregenerated, 2 invited, 1 archived), 4 teams | 0 |
| Linked to a coach | yes (`coach@`, team "Erőemelő csapat") | no | no |
| Conversations | 1 (5 messages) | 5 | 0 |
| Onboarding | complete | complete | complete |
| Server theme pack | `aurora` (bought) | `solar` | `midnight` |
| Coach profile / posts | — | 1 profile; 5 posts (4 published, 1 draft) | — |
| Coach subscription | — | unlimited | unlimited |

**Answer to "admin sees all tabs — does admin also have member data?": no.** Admin's Home, Edzés,
Étkezés and Haladás render empty states, its coach dashboard has zero clients and its plan library
is empty. Its bar is the 7-tab variant, which the kit draws with a different inset and icon size
(`figma-build/app-kit.src.js:165`: inset 10 / 12 / 8 and icon 32 / 32 / 28 for 5 / 6 / 7 tabs).
Admin is useful for admin frames and as a free supply of EMPTY states; it cannot stand in for the
member or the coach.

Global content (role-independent): 1653 global exercises, 3 `pending_review`, 2 private, 2 rejected;
127 foods (95 global); 7 theme packs (`aurora`, `ember` are paid); 2 store items at 250 coins;
7 achievements; 27 `element_style_config` rows; 4 open content reports, 1 open message report;
3 published coach profiles; 7 posts.

### 3.3 The seed is anchored on the day it runs — and it last ran on 2026-08-24

`seed-demo.mjs:115-124`: `TODAY = today`, `MONDAY = Monday of this week`,
`PLAN_START = MONDAY - 84 days`, `NUTRITION_START = MONDAY - 56 days`.
The DB shows the result of a run on 2026-08-24: member plan `starts_on = 2026-06-01`, last
completed session 2026-08-22, live session dated 2026-08-24, last notification 2026-08-23.

Consequences today (2026-10-11), before re-seeding:

- the week strip, "last trained", streaks, the chart's right edge and every relative time are
  seven weeks old; the coach dashboard's "inactive" colouring applies to everybody;
- the member's live session is a 48-day-old `in_progress` row;
- the member's notifications are all read (opening `/notifications` marks everything read on
  mount, `frontend/src/features/chat/NotificationsPage.tsx:273-279`), so the bell badge is gone.

The design's own data set (`docs/brain/58-Pulse/Feature inventory.md:600-640`) says the frames
mirror this seed run in the week of 2026-10-05: plan started 2026-07-13, reference moment
**Friday 2026-10-09**. So re-seeding in the right week reproduces the drawn data; re-seeding in a
later week shifts all dates by whole weeks but keeps the shape.

**Re-seed recipe** (integrator, at the start of implementation and every Monday):

```bash
cd /c/Users/Petike/Documents/Cursor/tracker/backend
npm run seed:dev-users && npm run seed:demo
```

Then, with the backend stopped (so no `-wal` sidecar exists), keep a baseline to restore from:
`cp data/app.db data/app.pulse-baseline.db` (`backend/data/` is gitignored, `.gitignore:11`).
Restore = stop the supervisor, copy it back, start again.

What changes on every re-seed: all surrogate ids (the member's coach link is `1` and plan is `1`
today; `/coach/clients/:id` takes the LINK id — `ClientDetailPage.tsx:163`). Never hard-code them;
read them from `GET /api/v1/clients` and `GET /api/v1/plans`. What does NOT change: post public ids
and coach handles (derived from a hash of a label, `seed-demo.mjs:93-99`).

### 3.4 What the member's Home shows depends on the weekday

The plan cycle is fixed (`seed-demo.mjs:759-837`):

| Weekday | Plan day | Start | Exercises | Home on that day |
|---|---|---|---|---|
| Mon | Alsótest – erő | 18:00 | 5 | training day |
| Tue | Pihenőnap | — | — | rest |
| Wed | Felsőtest – nyomás | 18:00 | 5 | training day |
| Thu | Pihenőnap | — | — | rest |
| **Fri** | **Felsőtest – húzás** | 18:00 | 5 | **the day the frames were drawn** |
| Sat | Alsótest – volumen | 10:00 | 4 | training day |
| Sun | Pihenőnap | — | — | rest (today) |

And the seed ALWAYS leaves the member mid-session (`seed-demo.mjs:1218-1273`): a plan session on a
training day, a freestyle session titled "Szabad edzés" on a rest day. So after a re-seed:

- `home-2` (edzés folyamatban) and `workout-1` (futó edzés) are what `user@` shows, every day;
- `home-1` (edzésnap, "Indítás") is NOT reachable for `user@` without ending the live session;
- on Tue / Thu / Sun the title is "Szabad edzés", not a plan day — only Mon / Wed / Fri / Sat can
  resemble the frame, and only a Friday matches it.

### 3.5 Known differences between a frame and the seeded app — do not chase these

| Frame shows | Running app shows | Why |
|---|---|---|
| Takács Dániel, `takacs.daniel@pelda.hu`, monogram TD | Teszt Elek, `user@tracker.local`, TE | the inventory replaced the names on purpose (`Feature inventory.md:602`) |
| "Péntek, október 9." | the real date | `HomePage.tsx:50-54` uses `new Date()` |
| Home nutrition 1840 / 2600 etc., six logged foods | nothing logged today | the seed logs up to the Sunday before the seed week only (`seed-demo.mjs:1513-1515`); the frame's totals are "illustrative" |
| bell badge 2; two unread rows with server-emitted types | 2 unread after a re-seed, but 8 rows of other types, and all read after the first visit | `seed-demo.mjs:1770-1778`; auto-read on mount |
| coach dashboard: 6 clients, 3 teams, 2 live codes | 12 active links, 4 teams, 6 un-revoked codes | the frame is abbreviated |
| event post "… – október 30." | "… – szeptember 14." | seed text |
| marketplace and post covers are photographs | a 320 x 180 placeholder WebP | `seed-demo.mjs:1810-1813` |
| compose-post-1 "piszkozat borítóval" | the seeded draft `6gVoWP7TYVXO` has no cover | 0 `post_media` rows for it |
| admin: 19 users (15 / 3 / 1) | 49 users (45 / 3 / 1) | 30 leftover smoke accounts |
| status bar 9:41, Dynamic Island, home indicator, 52 pt rounded corners | none of them | device chrome drawn by the kit (`app-kit.src.js:149, 175, 180-182`) |
| settings: seven theme packs, "Áttetsző felületek"; coins "Bolt": Aurora and Ember | no pack UI | owner decision D1 — the frames predate it |
| workout-3: an empty player with no session | the muscle selector | owner decision D2 |
| a "finish workout" control in the workout frames | none | owner decision D3 — not in the screen phase, never a dead button |

---

## 4. Session, cookie and limiter facts that shape the protocol

| Fact | Evidence | Consequence for agents |
|---|---|---|
| Access JWT 15 min; refresh 7 days sliding, 30 days absolute | `backend/src/auth/tokens.js:10-12` | a tab left for 15 minutes refreshes itself on the next request (`frontend/src/lib/api.ts:129-137`) |
| Dev cookie names `access` (Path `/`, SameSite Lax) and `refresh` (Path `/api/v1/auth`, Strict), HttpOnly, not Secure | `backend/src/auth/middleware.js:11-45` | work over plain http on localhost |
| **Cookies are scoped by host, not by port** | browser behaviour | every tab on `localhost:<any port>` in one browser profile is the SAME account |
| Login: 10 / 15 min per IP, plus 20 / 15 min per e-mail; per-account backoff after 3 wrong passwords | `backend/src/auth/routes.js:61-64, 71-80, 126-136` | N agents logging in separately run out; a typo loop locks the shared fixture (cleared by `seed:dev-users`) |
| Register 5 / 15 min per IP | `routes.js:63` | do not create accounts casually |
| Refresh reuse after 10 s = "theft": the whole family is revoked AND `session_version` is bumped | `routes.js:179-199` | never copy a refresh cookie into a second cookie jar — it kills that user's sessions everywhere |
| `POST /auth/logout-all` and `POST /auth/change-credentials` bump `session_version` | `routes.js:236-250, 263-302` | pressing either on a shared fixture logs out every agent on that account |
| CSRF: `X-CSRF: 1` + JSON content type; `Sec-Fetch-Site` checked only when present | `middleware.js:148-163` | a Node `fetch` login works; so does an in-page `fetch` |
| Limiters are in memory | `express-rate-limit` default store | a backend restart resets them |
| Polled GETs are not limited (`/notifications`, `/notifications/unread-count`, `/conversations/:id/messages`) | `notifications/routes.js:52-83`, `chat/routes.js:52-113` | open tabs do not eat a budget |
| Per-IP read budgets that N agents share: public marketplace 240 / 15 min, exercises 600, coins 600, admin 600, compose 600 | `public/routes.js:57`, `exercises/routes.js:17`, `coins/routes.js:49`, `admin/routes.js:37`, `public/compose.js:76` | only the marketplace one is tight; three agents reloading `/m` pages can reach it |
| Language defaults to `hu` whatever the browser locale; stored in `localStorage['tracker.lang']` | `frontend/src/i18n/index.ts:35-52` | a fresh profile renders Hungarian, as the frames do |
| Theme pack, accent and transparency come from `localStorage['tracker.theme']` first; the server copy is applied only by the settings screen | `ui/theme/ThemeProvider.tsx:110-141`, `features/settings/useThemeSync.ts:32-50` | a fresh profile renders `midnight`; a used profile may carry another pack or a custom accent into every screenshot |
| `index.html` pre-paint script knows 5 packs; `THEME_PACKS` has 7 | `frontend/index.html:24` vs `ThemeProvider.tsx:11-19` | existing drift; whatever Pulse decides about packs, both lists and the `theme-color` meta (`index.html:9`, `#0B0D10`) must move together |
| Service worker registers only in a production build and unregisters itself in dev | `lib/registerSW.ts:43-57` | `vite preview` in a persistent browser profile can serve a stale bundle; a fresh profile per screenshot cannot |

**Vite accepts `*.localhost` host names without configuration.** Read from the installed package:
`node_modules/vite/dist/node/chunks/node.js:17377-17389` returns true for `localhost`, for any
name ending in `.localhost` and for any IP literal. So `http://member.localhost:5173`,
`http://coach.localhost:5173`, `http://admin.localhost:5173` and `http://anon.localhost:5173` are
four separate cookie jars and four separate `localStorage`s on one dev server, in one browser.
(Chrome resolves `*.localhost` to loopback. Not exercised in this phase.)

---

## 5. How an agent SEES a screen

### 5.1 Frame geometry (the numbers the comparison depends on)

From `figma-build/KIT.md` ("Device canvas") and `docs/brain/58-Pulse/Pulse System.md:106-125`:

| Zone | y (pt) | Note |
|---|---|---|
| Frame | 402 x 874, corner radius 52, clipped | iPhone 17 Pro |
| Status bar | 0 – 62 | "9:41", Dynamic Island 126 x 37 at y 11 — device chrome, not app |
| Root header | 72 – 120 | content top = 72 |
| Bottom fade | 744 – 874 | solid from 780 |
| Tab bar | 782 – 838, 56 high | its bottom edge is 36 pt above the frame bottom |
| Home indicator | 861 – 866 | device chrome |

Frame PNGs (`TRACKER-mockups/5-pulse/kepernyok-2x/`): 59 frames, all 804 px wide (2x).
**28 are exactly 804 x 1748** (one viewport). **30 are taller** (up to 804 x 4182 = 402 x 2091 pt):
those are the "long-scroll" frames, built with the tab bar and home indicator docked at the BOTTOM
of the tall frame (`Pulse System.md`, "Long-scroll frame"). One is shorter (`post-detail-3`).
Heights at 1x:

| Frame | h (pt) | Frame | h (pt) | Frame | h (pt) |
|---|---|---|---|---|---|
| admin-1 | 1138 | admin-2 | 1607 | client-detail-1 | 1394 |
| client-detail-2 | 2091 | client-detail-3 | 1542 | coach-dashboard-1 | 1459 |
| coach-dashboard-3 | 1594 | coach-plans-1 | 1274 | coach-profile-2 | 1376 |
| coins-2 | 1108 | compose-post-1 | 1244 | compose-profile-1 | 1416 |
| compose-profile-2 | 1089 | exercise-detail-1 | 1708 | exercise-detail-2 | 1872 |
| marketplace-1 | 1176 | marketplace-2 | 1032 | nutrition-1 | 1674 |
| nutrition-2 | 1204 | onboarding-1 | 1284 | onboarding-2 | 1060 |
| onboarding-3 | 1292 | plan-editor-2 | 2078 | post-detail-1 | 1166 |
| post-detail-2 | 1313 | post-detail-3 | 542 (a type specimen, not a screen) | progress-1 | 1687 |
| progress-2 | 1096 | settings-2 | 2026 | style-studio-1 | 1226 |
| style-studio-2 | 905 | | | | |

Every other frame is 874. (`post-detail-2-specimen@2x.png` is a byte-size duplicate of
`post-detail-3@2x.png`; the `_…` files are overview and reference sheets.)

Note the Index lists more states than there are PNGs for three screens (library 5 named / 3 PNGs,
progress 4 / 3, onboarding 3 = 3). The PNGs are the frames; the extra names are states of the same
frame.

### 5.2 Channel A — headless Chrome over CDP (the proof channel) — PROVEN TODAY

Measured with a 60-line Node script, no npm dependency, no server (Appendix A):

```
browser: Chrome/154.0.8037.99
setDeviceMetricsOverride: ok            (402 x 874, deviceScaleFactor 2, mobile)
setSafeAreaInsetsOverride: ok           (top 62, bottom 34)
page: {"w":402,"h":874,"dpr":2,"padTop":"62px","padBottom":"34px",...}
viewport screenshot px: 804 x 1748
full-page screenshot px: 804 x 4000
probe wall time: 1408ms
```

What that buys:

- **Pixel-size parity with the frames** (804 x 1748) with no scaling step.
- **`env(safe-area-inset-top)` really is 62 px and `…-bottom` 34 px** in the page. The app uses
  `env(safe-area-inset-*)` directly in 8 files (`index.css`, `tokens.css:154`, `BottomNav.tsx`,
  `RestTimer.tsx`, `ToastHost.tsx`, `OfflineIndicator.tsx`, `E14E20.tsx`, `E8E9.tsx`), and the
  project's own gate comment says nobody can see an inset mistake "on a laptop, where every inset
  is zero" (`scripts/check-safe-area.mjs`). With the override the tab bar and header land where the
  frame draws them, and the inset code is finally exercised.
- **Long frames**: set the viewport HEIGHT to the frame's height (table above) instead of 874 and
  take a normal screenshot. The fixed tab bar then docks at the bottom of the tall image exactly
  as the kit docks it in the tall frame.
- **Compositing is real**: rAF and CSS transitions run in headless Chrome, unlike the pane.
- **Parallel-safe**: each run is its own process, its own `--remote-debugging-port=0` and its own
  `--user-data-dir`; ~1.4 s of browser per shot; nothing persistent, so no service-worker or
  `localStorage` leftovers (theme, language) from an earlier run.
- The same session can run measurements (`Runtime.evaluate`) and collect console errors and
  failed requests, which is the project's rule "a screenshot is evidence of a frame; a measurement
  is evidence of a fact" (`SHARED_MEMORY.md:288`).

Not exercised (no server was started): logging in and capturing the real app. The design for it:

1. The tool logs in ONCE per role with a Node `fetch`
   (`POST http://localhost:5173/api/v1/auth/login`, JSON body, header `X-CSRF: 1`), reads the
   `access` cookie from `Set-Cookie`, and keeps it in a cache file OUTSIDE the repo (OS temp),
   reused for 12 minutes. One login per role per 12 minutes for the whole team stays inside the
   10 / 15 min limit even with limiters on.
2. Each headless run injects **only the access cookie** (`Network.setCookie`, name `access`,
   domain `localhost`, path `/`, httpOnly, SameSite Lax). Never the refresh cookie: two jars
   holding one refresh token is the reuse case that revokes the family and bumps `session_version`.
3. Navigate, wait for network idle and `document.fonts.ready`, optionally run a click script to
   reach the sub-state, capture.

### 5.3 Channel B — the in-app Browser pane (the hands, not the proof)

Tools: `preview_start` (name `tracker-frontend`, from the launch.json of the session's working
directory), `resize_window` (custom 402 x 874; any width under 768 also switches to an Android
Chrome user agent with touch points), `computer` screenshot / click, `read_page`, `javascript_tool`.

History on this machine, in the project's own records:

- `docs/brain/40-Pipeline/Phase-1/Phase Report.md:48` — "Screenshot capture BLOCKED — the in-app
  browser pane does not composite frames on this machine (OQ-5)" (`:107` records one session where
  it worked);
- `docs/brain/00-Index/Bible Audit Phase-3.md:65`, `Phase-4.md:57`, `Phase-5.md:60`,
  `Phase-6.md:133`, `E2E Matrix Phase-4/5/6` — "the pane does not composite in this session";
- `docs/pipeline/SHARED_MEMORY.md:198-205, 455-467` — when it is not compositing, CSS transitions
  and rAF are frozen (read `el.style`, not `getComputedStyle`), autofocus cannot be tested, and
  screenshots fail outright.

The pane also reports a "hidden" state in which screenshots are not expected to work, and a
workflow agent running while the owner is away is the likely case. So: use the pane to explore,
click and read the DOM; never make "done" depend on a pane screenshot.

It has one more limit that Channel A does not: it cannot set safe-area insets, so its 402 x 874
viewport shows the app shifted up by 62 pt relative to the frame, with the tab bar flush to the
bottom. If a pane comparison is all there is, resize to **402 x 778** (874 − 62 − 34) and compare
against the frame cropped to y 62 – 840 pt (124 – 1680 px in the 2x PNG).

One browser session serving several agents: possible only per role. All tabs on one host name
share the cookie jar, so use `member.localhost:5173`, `coach.localhost:5173`,
`admin.localhost:5173`, `anon.localhost:5173`, log each in once, and never log out.

### 5.4 Channel C — measurement (the facts a picture cannot prove)

Run in the page (pane `javascript_tool`, or `Runtime.evaluate` in Channel A). The Pulse rules that
are countable:

| Rule | Probe |
|---|---|
| fonts really loaded (the "correct in source, renders wrong" class) | `document.fonts.check('700 96px "Big Shoulders Display"')`, same for Geist and Geist Mono; plus `getComputedStyle(numeral).fontFamily` |
| ő and ű render in the display face, not a fallback | measure the width of "Ő" against a known fallback, or screenshot a word containing them |
| no boxes | count elements with a non-transparent background AND a border-radius AND a non-zero box, excluding the allow-list (pill, switch, sheet) |
| at most one lime pill | count elements whose computed background is the accent and whose radius is full |
| tab bar has no capsule, bottom edge at inset + 2 | `getBoundingClientRect()` of the nav and computed background |
| no horizontal overflow | `document.documentElement.scrollWidth === 402` |
| nothing 404s (images, fonts) | failed requests from the CDP `Network` domain |
| no console errors | CDP `Runtime.consoleAPICalled` / `exceptionThrown` |

### 5.5 The comparison, step by step (per frame)

1. Look at the frame: `Read` on
   `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x/<screen>-<n>@2x.png`, and at
   `figma-build/app/<screen>-<n>.body.js` for exact sizes when something is ambiguous.
2. Capture the app with Channel A: width 402, height = the frame's height in pt, scale 2, insets
   62 / 0 / 34 / 0, the account from section 7, the route, and the click script if the frame is a
   sub-state.
3. Put the two PNGs side by side (same pixel size) and `Read` the pair. A dependency-free way to
   make one image out of two: a tiny HTML page with two `<img>` elements (plus an optional third
   with `mix-blend-mode: difference`), screenshotted by the same headless browser.
4. Ignore: the status bar band (y < 62 pt), the home indicator (y 861 – 866 from the bottom zone),
   the four 52 pt corners, and every row of section 3.5.
5. Compare in this order: left edge and hairlines → type (face, size, case, tracking) → vertical
   rhythm (header 72, first block 152 / 178, 32 between blocks) → the one lime pill → tab bar
   (count, lit icon, y 782 – 838) → imagery (present, unframed, glow).
6. Run the Channel C probes for the same page and attach the numbers to the claim.
7. A frame is "matched" only with: the capture file, the frame file, the probe output, zero
   console errors and zero failed requests.

---

## 6. Verification protocol for parallel agents in ONE working tree

### 6.1 What collides and what does not (measured)

| Command (cwd `frontend/`) | Reads | Writes | Time | Concurrent in one tree? |
|---|---|---|---|---|
| `npm run check:tokens` | `src/**` | nothing | 0.7 s | yes |
| `npm run check:i18n` | 3 bundles + `src/**` | nothing | 1.0 s | yes |
| `npm run check:nav` | router, navTabs, `src/**` | nothing | 0.6 s | yes |
| `npm run check:nav-active` | `navTabs.ts` | nothing | 0.6 s | yes |
| `npm run check:interval` | `intervalPlan.ts`, `chartGeometry.ts` | nothing | 0.6 s | yes |
| `npm run check:elements` | catalog, provider, playground | nothing | 0.6 s | yes |
| `npm run check:autosave` | hook source | nothing | 0.5 s | yes |
| `npm run check:type-scale` | `tokens.css`, `lib/cn.ts` | nothing | 0.5 s | yes |
| `npm run check:aurora` | `src/**` | nothing | 0.6 s | yes |
| `npm run check:safe-area` | `index.html`, `src/**` | nothing | 0.6 s | yes |
| `npm run verify:outbox` | `lib/outbox.ts` | nothing | 0.6 s | yes |
| `npx tsc -p tsconfig.app.json --noEmit` | `src/**` (143 files) | nothing (tsbuildinfo mtime unchanged — verified) | 6.7 s | **yes** |
| `npx oxlint` | `src/**` | nothing | 1.3 s | yes |
| `npx vite build --outDir <private dir> --emptyOutDir` | tree + `public/` | only the private dir (verified: `dist/` untouched) | 1.9 s | yes, one dir per caller |
| headless capture (Channel A) | the dev server | its own temp profile + its own PNG | ~1.5 – 4 s | yes |
| `npx tsc --noEmit` (no `-p`) | **0 files** | nothing | 0.9 s | USELESS — always green |
| `npx tsc -b` | `src/**`, `vite.config.ts` | **`node_modules/.tmp/tsconfig.{app,node}.tsbuildinfo`** (verified rewritten) | 7.0 s | **no — integrator only** |
| `vite build` (default outDir) | tree | **empties and rewrites `frontend/dist/`** | 1.9 s | **no — integrator only** |
| `npm run build` | everything above in sequence | both of the above | ~16 s | **no — integrator only** |
| `npm run preview` | `frontend/dist` | port 4173 (strict) | — | one instance; never while a build runs |
| `npm run dev` | tree | port 5173 (strict), `node_modules/.vite` | — | exactly one instance |
| `npm run verify:nav-gate` | — | **REWRITES `SettingsPage.tsx`, `BottomNav.tsx`, `navTabs.ts`**, runs the gate, restores them (`scripts/verify-nav-gate.mjs:23-46, 51-104`) | — | **never while any agent is editing; a kill mid-run leaves a planted defect** |
| `npm install <pkg>` | — | `package.json`, lockfile, `node_modules` | — | never in parallel; restart the dev server after |
| backend `seed:*` | — | the shared DB | — | integrator only, at a wave boundary |

The gates and `tsc --noEmit` are whole-tree checks. They never collide mechanically, but in a
shared tree they see every other agent's half-written work. The rule that makes this workable:
**a red result is yours only if the file path in it is yours.** Filter:

```bash
npx tsc -p tsconfig.app.json --noEmit --pretty false | grep "src/features/<area>/"
```

### 6.2 The things one tree makes fragile

| Hazard | Why (evidence) | Mitigation |
|---|---|---|
| One agent's syntax error blanks the app for everybody | `HomePage` and `AuthPage` are imported EAGERLY by the router (`src/app/router.tsx:6-7`); every other page is lazy (`:11-79`). There is no `errorElement` on any route | foundation makes those two lazy and adds a route error boundary; shared files (`tokens.css`, `index.css`, `ui/**`, `app/**`, `i18n/*.json`) are single-writer |
| A broken JSON bundle breaks every screen and `check:i18n` for all | three bundles must carry identical key sets (876 keys each today) and are imported statically (`src/i18n/index.ts:3-5`) | one writer for the bundles, or keys added by the screen agent only inside its own feature namespace and in all three files in one edit |
| HMR resets another agent's sub-state mid-capture | no URL state anywhere; a save in a non-component module triggers a full reload | Channel A captures take seconds and drive their own clicks; retry once on a mismatch |
| Shared DB state | one SQLite file behind one backend | section 6.5 |
| Shared limiter budgets | section 4 | `NODE_ENV=test` |
| Memory | 3.1 GB free; each Vite ~0.3 GB, each default backend 23 DB threads | one backend with `DB_POOL_THREADS=4`, one Vite, headless Chrome only for the seconds of a capture |

### 6.3 What every screen agent runs (parallel-safe)

```bash
cd /c/Users/Petike/Documents/Cursor/tracker/frontend
npx tsc -p tsconfig.app.json --noEmit --pretty false          # 6.7 s — look only at your paths
npm run -s check:tokens && npm run -s check:i18n && npm run -s check:nav \
  && npm run -s check:nav-active && npm run -s check:safe-area && npm run -s check:type-scale
# then: capture each of your frames (Channel A), compare (5.5), probe (5.4)
```

It must NOT run: `npm run build`, `tsc -b`, `vite build` into `dist/`, `npm run preview`,
`npm run verify:nav-gate`, `npm install`, any backend script, a second `npm run dev`.

### 6.4 What the single integrator runs, serially

1. `git status` — only the expected owners' paths are dirty.
2. `npm run build` in `frontend/` (11 gates → `tsc -b` → `vite build`), ~16 s.
3. `npm run preview` (4173) with the backend up, and Channel A captures of a fixed sample (or all
   59) against the BUILT app. This is the only run that sees the production CSS (Tailwind's
   output for the build), hashed font and image URLs, and the service worker.
4. `npm run verify:nav-gate` only when nobody is editing, and only if nav files changed.
5. Commit per finished step with `git add <owned paths>` on `pulse-redesign` (owner decision D4:
   local commits only, never push, never touch `master`, message ends with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); never `git add -A` in a shared tree.
6. Seeds, the DB baseline copy, dependency installs (fonts), and any restart of the dev servers.

### 6.5 Shared-DB rules

Read-only viewing by any number of agents is safe. These actions change what OTHER agents see, so
they are either forbidden on the shared fixtures or integrator-only:

| Action | Effect | Rule |
|---|---|---|
| saving a variant in `/admin/styles` | rewrites `element_style_config` — the variant of that element for EVERY user ("minden felhasználónál érvényes lesz") | integrator only; restore the previous variant |
| "log out everywhere", changing the password, deleting the account | kills every session of that fixture | never on `user@` / `coach@` / `admin@` |
| opening `/notifications` | marks all of that user's notifications read | the "2 olvasatlan" state is single-use per seed; see section 8 |
| starting / finishing / abandoning a workout, checking sets | flips Home between its frames for `user@` | only inside an agreed window, or on a demo client |
| logging food, adding a measurement | changes Home's nutrition block and the chart | fine if it stays; say so in the hand-off |
| publishing / withdrawing posts, creating invite codes, creating plans | changes the coach's counts and lists | avoid; codes cannot be deleted from the UI |
| approving / rejecting a pending exercise in `/admin` | the "3 várakozik" count drops for good (audit log is append-only) | never; open the row, do not decide |
| changing language or theme in Settings | per browser origin (`localStorage`), not per account | irrelevant for Channel A (fresh profile each run) |

If state isolation is ever needed, the backend supports it without a code change: a second
backend from the same folder with `PORT=3101 DB_PATH=./data/agent-a.db NODE_ENV=test
DB_POOL_THREADS=2 node server.js`, where the DB file is a copy of the baseline (same key and salt,
so it opens). The frontend side needs the proxy target made configurable
(`frontend/vite.config.ts:16, 21` hard-code `http://localhost:3000`).

### 6.6 If one tree is not enough — worktrees, with their real cost

| Cost | Evidence |
|---|---|
| Anything untracked is missing from a fresh worktree | the Pulse notes were committed during this run (`0860942`); `docs/pipeline/pulse/` (these reader notes and the owner decisions) is still untracked — commit it first, or give agents absolute paths into the main checkout |
| No `node_modules`, `.env`, `data/`, `storage/` in a worktree (all gitignored) | `.gitignore:1, 6, 11, 13`; `frontend/.gitignore:10` — `npm ci` per worktree (184 MB each); backends still run from the main checkout |
| One Vite per worktree: port and proxy target are hard-coded | `vite.config.ts:12, 16, 21` — port can be passed (`vite --port 5181 --strictPort`), the proxy cannot |
| Every Vite on `localhost` shares one cookie jar | use the `*.localhost` names |
| Memory | N Vite processes on a machine with 3 GB free |
| Merges | `tokens.css`, `index.css`, the three i18n bundles, `router.tsx`, `navTabs.ts` are touched by many screens |

Recommendation: one tree, strict path ownership, foundation first. Move to worktrees only for
work that must rewrite shared files while screens are in flight.

---

## 7. Account, URL and steps per frame

Base URL `http://localhost:5173` (or the role host name). M = `user@tracker.local`,
C = `coach@tracker.local`, A = `admin@tracker.local`, N = `demo.nagy.balazs@tracker.local`
(member, active client, no plan, no live session, no notifications, no onboarding row),
R = `demo.coach.szilagyi.reka@tracker.local` (coach, no clients, no plans), — = signed out.
"Seed" = reachable from a fresh `seed:demo` with no mutation.

This table is derived from the seed script, the DB contents, the router and the screen
inventories (`docs/brain/58-Pulse/Screens/*.md`, "Frames to draw"). **No row was exercised in a
running app in this phase.** The frame → state mapping was checked against the frame names in
`figma-build/app/<screen>-<n>.body.js`.

### Tag

| Frame | Acct | URL | Steps | Seed? |
|---|---|---|---|---|
| home-1 edzésnap | M | `/` | training weekday AND no live session | **no** — the seed always leaves a live session (3.4) |
| home-2 edzés folyamatban | M | `/` | none | yes; matches the frame's title only on a training weekday |
| home-3 nincs terv | N | `/` | none | yes |
| workout-1 futó edzés | M | `/workout` | tap "Hátul" | yes |
| workout-2 rekord és pihenő | M | `/workout` | check a set that beats the record; capture while the rest timer runs | **no** — a mutation, and timed |
| workout-3 nincs futó edzés | N | `/workout` | none | yes — but superseded by D2: this account must now show the muscle selector here; compare with `library-1` |
| library-1 alapállapot | M | `/library` | none | yes |
| library-2 Elöl · Mell | M | `/library` | view Elöl, chip Mell | yes |
| library-3 Hátul · Széles hátizom | M | `/library` | view Hátul, chip Széles hátizom | yes |
| exercise-detail-1 | M | `/library/<id>` | id of "Barbell Bench Press - Medium Grip" from `GET /api/v1/exercises?q=…` | yes |
| exercise-detail-2 hátsó nézet | M | `/library/<id>` | a DIFFERENT exercise — the catalogue's "Pullups" ("Húzódzkodás"); tap "Hátul" | yes |
| nutrition-1 mai nap | M | `/nutrition` | six foods logged TODAY | **no** — nothing is logged for the current week |
| nutrition-2 kiválasztott étel | M | `/nutrition` | type in the search, pick a food | yes (no save) |
| progress-1 Test | M | `/progress` | none | yes |
| progress-2 Megosztás | M | `/progress` | tap "Megosztás" | yes |
| progress-3 Fotók (empty) | M | `/progress` | tap "Fotók" | yes — 0 photos exist |
| settings-1 / settings-2 | M | `/settings` | none / full-height capture | yes — minus the pack rows (D1); also capture once with a stale `tracker.theme` in `localStorage` |
| coins-1 Bolt | M | `/coins` | none | yes — the two store items are theme packs; what this tab shows after D1 is the planner's call |
| coins-2 Eredmények | M | `/coins` | tap "Eredmények" | yes |
| coins-3 Kimutatás | M | `/coins` | tap "Kimutatás" | yes |
| notifications-1 2 olvasatlan | M | `/notifications` | first visit after a re-seed only | **single-use** |
| notifications-2 üres | N | `/notifications` | none | yes |
| onboarding-1 5/5 visszatérő | M | `/onboarding` | none (typed URL; nothing links there) | yes — but `user@`'s row has `step = 0` while `coach@` / `admin@` have 8; if the form resumes from `step`, use C or A |
| onboarding-2 1/5 első megnyitás | N | `/onboarding` | first visit, give one answer (the form autosaves a draft) | once |
| onboarding-3 2/5 hiányzó válasz | N | `/onboarding` | leave "sessions per week" empty, go to the end, press "Kész" — it is refused and sends you back to 2/5 | once |

### Edző

| Frame | Acct | URL | Steps | Seed? |
|---|---|---|---|---|
| coach-dashboard-1 alap | C | `/coach` | none | yes |
| coach-dashboard-2 a kód elkészült | C | `/coach` | "+ Új kód" → sheet | **mutation** — creates a code each time |
| coach-dashboard-3 átadásra váró fiók | C | `/coach` | scroll to the pregenerated rows | yes (2 exist) |
| client-detail-1 Terv | C | `/coach/clients/<linkId of user@>` | link id from `GET /api/v1/clients` | yes |
| client-detail-2 Táplálkozás | C | same | tap the tab, open day 1 of the diet | yes |
| client-detail-3 Haladás | C | same | tap the tab | yes (measurements are shared, photos are not) |
| coach-chat-1 beszélgetés | C | `/coach/clients/<linkId of user@>/chat` | none | yes (5 messages) |
| coach-chat-2 üres | C | `/coach/clients/<linkId of demo.nagy.balazs>/chat` | none | yes (opening creates an empty thread) |
| coach-plans-1 könyvtár | C | `/coach/plans` | none | yes (9 plans) |
| coach-plans-2 üres | R | `/coach/plans` | none | yes |
| plan-editor-1 alapállapot | C | `/coach/plans/<id of the member's plan>` | id from `GET /api/v1/plans` | yes |
| plan-editor-2 nyitott nap | C | same | open a day | yes (do not save) |
| plan-editor-3 gyakorlatkereső | C | same | open the exercise search | yes (do not save) |
| compose-hub-1 alap | C | `/compose` | none | yes (5 posts: 4 live, 1 draft) |
| compose-hub-2 profil lap | C | `/compose` | tap the status control | yes |
| compose-profile-1 szerkesztés | C | `/compose/profile` | none | yes |
| compose-profile-2 név és város | C | `/compose/profile` | tap the identity line | yes |
| compose-post-1 piszkozat borítóval | C | `/compose/posts/6gVoWP7TYVXO` | — | **no** — the seeded draft has no cover |
| compose-post-2 új bejegyzés | C | `/compose/posts/new` | none | yes (do not save) |

### Nyilvános + admin

| Frame | Acct | URL | Steps | Seed? |
|---|---|---|---|---|
| auth-1 Belépés | — | `/login` | none | yes |
| auth-2 Regisztráció | — | `/register` | none | yes |
| marketplace-1 alap | — | `/m` | none | yes |
| marketplace-2 keresés | — | `/m` | type a query | yes |
| post-detail-1 esemény | — | `/m/p/4ouWWlOOy7Ho` | none | yes |
| post-detail-2 program | — | `/m/p/pxnIEqPCqqz2` | none | yes |
| post-detail-3 szövegelemek | — | any post whose body uses every markdown element | compare the body typography only (the PNG is a 402 x 542 specimen; the inventory's third state, "nem érhető el", is reachable at `/m/p/<unknown id>` but was not drawn) | partly |
| coach-profile-1 ellenőrzött edző | — | `/m/c/kovacs-peter` | none | yes |
| coach-profile-2 bio kinyitva | — | same | tap "Több" | yes |
| admin-1 Moderáció, 3 várakozik | A | `/admin` | tap "Moderáció" | yes (3 pending) |
| admin-2 Beküldés megnyitva | A | `/admin` | open a row; do NOT approve or reject | yes |
| admin-3 Fiókok | A | `/admin` | tap "Fiókok" | yes |
| style-studio-1 E1, D aktív | A | `/admin/styles` | none | yes |
| style-studio-2 átváltva C-re, mentve | A | `/admin/styles` | pick C, save | **global mutation** — integrator only |

Totals: 59 frames. Reachable from the seed with no mutation: 49. Single-use: 3
(notifications-1, onboarding-2, onboarding-3). Not reachable without a mutation or missing data: 7
(home-1, workout-2, nutrition-1, coach-dashboard-2, compose-post-1, style-studio-2, and
post-detail-3 which is not a screen).

Role gates to expect: `/admin` refuses non-admins client-side (`AdminPage.tsx:195`) and server-side;
`/coach` and `/coach/plans` refuse plain members (`CoachDashboard.tsx:108`, `PlanListPage.tsx:189`);
`/compose*` is `requireCoach` on the server; everything else under `/` only needs a session
(`app/RequireAuth.tsx`); `/m*` are public and outside `RequireAuth` (`router.tsx:101-103`).

---

## 8. States the seed cannot reach — what to do

In order of preference:

1. **Use another account that is already in that state.** `demo.nagy.balazs@` for "no plan",
   "no live session", "no notifications", "first onboarding"; `demo.coach.szilagyi.reka@` and
   `admin@` for empty coach states. This covers every EMPTY frame today.
2. **Reach it through the product's own API, then put it back.** In-page `fetch` with the
   `X-CSRF: 1` header on the signed-in origin:
   - end the live session: `GET /api/v1/workouts/current` → `POST /api/v1/workouts/<id>/abandon`
     (`backend/src/logs/routes.js:214, 519`) → Home shows "Indítás" on a training day (home-1);
     tapping "Indítás" starts a new one (`POST /api/v1/workouts/start`, `:63`).
   - log today's food through the nutrition screen (nutrition-1, Home's nutrition block).
   Put it back with the baseline DB copy or a re-seed. Announce the window to the other agents.
3. **Intercept the request and answer it from a fixture** (headless only). CDP's `Fetch` domain can
   fulfil chosen `GET /api/v1/...` calls with JSON from a file, and a script added before page load
   can pin `Date` to Friday 2026-10-09. That renders the reference moment on any weekday, the
   "2 unread" list for ever, a record-and-rest player, and also the states no seed can produce:
   loading, a 500, offline. No backend or DB change. The fixtures are hand-written from
   `Feature inventory.md` section 6 or recorded once from the real API. Not built, not exercised.
4. **Extend the dev seed** with dedicated accounts per state (a member with an active plan and no
   live session; a member with two unread notifications; a coach draft with a cover). It lives
   under `backend/scripts/`, which the brief says not to touch in this phase — owner's call.
5. **Say it is not verified.** A frame that needed option 2 – 4 and did not get it is reported as
   "structure compared, state not reproduced", never as matched.

Things no option reaches from code alone: the photographs (the app has placeholders), the device
chrome, and `post-detail-3`, which is a type specimen.

---

## 9. Constraints an implementer must not break (my area)

- Vite stays on 5173 with `strictPort` and the `/api` + `/healthz` proxy
  (`frontend/vite.config.ts:11-23`); the same-origin cookie behaviour depends on it.
- `npm run build` stays the single definition of green
  (`frontend/package.json:9`); do not add a check that only some agents run.
- Gate scripts stay read-only. The one script that writes source (`verify-nav-gate.mjs`) stays out
  of the build chain.
- The backend, its `.env`, its limiters and its seeds are not edited for the convenience of
  screenshots. Process-level env overrides are allowed by design (`smoke-run.mjs:22-31`).
- No credential in a new file: the fixture password stays in the seed script; a cached access
  token lives outside the repo and is never printed.
- A refresh cookie is never copied between cookie jars (`auth/routes.js:179-199`).
- Language default stays `hu` (`src/i18n/index.ts:51`); captures assume it.

---

## 10. Work items this area needs

| # | Item | Files | Size | Depends on | Parallel with screens |
|---|---|---|---|---|---|
| V1 | Commit this pipeline folder on `pulse-redesign` (the design notes were committed during this run, `0860942`) | `docs/pipeline/pulse/**` | S | — | no (before) |
| V2 | Re-seed and keep a baseline DB copy; repeat each Monday | none tracked (`backend/data/` is ignored) | S | — | no (wave boundary) |
| V3 | Backend launch entry + one-command dev stack with `NODE_ENV=test`, `DB_POOL_THREADS=4`, waits for `/readyz` | `.claude/launch.json`, `scripts/dev-stack.mjs` (new, repo root), and `C:/Users/Petike/Documents/Claude Code/.claude/launch.json` (outside the repo) | S | owner OK on `NODE_ENV=test` | yes |
| V4 | `pulse-shot`: headless capture at 402 x H, scale 2, insets 62/34, cookie injection, optional `localStorage` pre-load (the stale-theme case of D1), click script, probes, side-by-side sheet | `frontend/scripts/pulse-shot.mjs` (new), `frontend/scripts/pulse-frames.json` (new: frame → account, route, steps, height), `frontend/package.json` (script `shot`), `frontend/.gitignore` (output dir) | M | V3 for the live run | no (before screens — it is their eyes) |
| V5 | Router resilience for a shared tree: lazy `HomePage` / `AuthPage`, a route error boundary | `frontend/src/app/router.tsx`, one new boundary component | S | — | no (foundation) |
| V6 | Sub-state in the URL (`?tab=`, `?view=`, `?muscle=`, `?step=`) through one shared hook | `frontend/src/lib/useUrlState.ts` (new) in foundation; then one line per tabbed page in each screen's own item (`ProgressPage`, `CoinsPage`, `AdminPage`, `ClientDetailPage`, `LibraryPage`, `OnboardingPage`, `ComposePage`) | S + S per screen | owner OK | hook: no; per page: yes |
| V7 | State fixtures by request interception and a pinned clock in `pulse-shot` | `frontend/scripts/pulse-shot.mjs`, `frontend/scripts/fixtures/*.json` (new) | M | V4 | yes |
| V8 | Configurable proxy target and cache dir, for worktree or private-backend mode only | `frontend/vite.config.ts` | S | — | yes (only if needed) |
| V9 | Integrator's build-proof pass: `npm run build` → `npm run preview` → capture all frames against 4173 → index page of pairs | `frontend/scripts/pulse-shot.mjs` (a `--all` mode), output under the ignored dir | S | V4 | no (serial by nature) |
| V10 | A probe gate for Pulse rules that are countable (fonts loaded, one lime pill, no boxed surfaces, no overflow) driven from `pulse-frames.json` | `frontend/scripts/pulse-shot.mjs`, optionally a `check:pulse` script | M | V4, tokens and primitives landed | yes |

---

## 11. Questions for the owner

1. May the dev backend run with `NODE_ENV=test` during the parallel phase (limiters off, nothing
   else changes, no file edited)? Otherwise all agents share 10 logins per 15 minutes.
2. D3 says the redesign stays frontend-only. Does that also rule out a dev-only fixture script
   under `backend/scripts/` for the states the seed cannot reach? Default assumed here: yes, it is
   ruled out, and those states are rendered by request interception on the frontend side (V7).
3. May the selected tab / view / step go into the URL (`?tab=…`, replace not push)? It makes about
   20 frames directly addressable and survives reloads; it changes what the address bar shows.
4. The 30 leftover smoke accounts inflate every admin count. Delete them from the dev DB?
5. Is a 12-minute cached access token in the OS temp folder acceptable for the capture tool?
6. Home can only resemble its frame on a training weekday, and only a Friday matches it. Accept
   "structure verified on the real weekday" or build the pinned clock (V7)?

---

## Appendix A — the probe that was run (reference for `pulse-shot.mjs`)

Run with `node cdp-probe.mjs <output dir>`; it used a throwaway profile, loaded a `data:` URL, and
left no Chrome process behind. The parts PROVEN by it: launch, port discovery, CDP over Node's
built-in `WebSocket`, device metrics, safe-area override, viewport capture, tall capture.

```js
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
const profile = path.join(out, 'chrome-profile-probe');
fs.mkdirSync(profile, { recursive: true });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

let wsUrl = null;
const ready = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('no DevTools url in 15s')), 15000);
  child.stderr.on('data', (d) => {
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(String(d));
    if (m) { wsUrl = m[1]; clearTimeout(t); res(); }
  });
});

try {
  await ready;
  const port = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Emulation.setDeviceMetricsOverride', { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: 34, left: 0, right: 0 } });
  await send('Page.enable');
  await send('Page.navigate', { url: '<the page>' });
  // …wait for load, network idle and document.fonts.ready; run the click script…
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'shot.png'), Buffer.from(shot.result.data, 'base64'));
  ws.close();
} finally {
  child.kill();
}
```

To add for the real tool (NOT exercised): `Network.setCookie` for the access cookie,
`Network.enable` + `Runtime.enable` to collect failed requests and console errors, a wait strategy,
`Fetch.enable` for fixtures, `Page.addScriptToEvaluateOnNewDocument` for the pinned clock, and
`--remote-debugging-port=0` kept so parallel runs never share a port.

## Appendix B — what was run today

| Command | Result |
|---|---|
| `netstat -ano` filtered on 3000 / 5173 / 4173 | nothing listening |
| three read-only SELECT scripts through `backend/src/db/index.js` (`node --env-file=.env`, cwd `backend/`) | the counts in sections 1, 3 and 7; `backend/data` afterwards still holds only `app.db` |
| each of the 11 gate scripts via `npm run -s` | all exit 0; 0.5 – 1.0 s each, 6.8 s in total |
| `npx tsc -p tsconfig.app.json --noEmit` | exit 0, 6.7 s, tsbuildinfo mtime unchanged |
| `npx tsc --noEmit` | exit 0, 0.9 s, `--listFilesOnly` prints 0 files |
| `npx tsc -b` | exit 0, 7.0 s, both tsbuildinfo files rewritten |
| `npx vite build --outDir <scratch> --emptyOutDir` | exit 0, 1.9 s wall, `frontend/dist` untouched |
| `npx oxlint` | exit 0, warnings only, 1.3 s |
| headless Chrome CDP probe | the output quoted in 5.2 |
| `git status --short` after all of it | no source file changed by this run; the only untracked path is `docs/pipeline/pulse/` |

Not run, on purpose: the backend, the Vite dev server, the preview server, any seed, a login,
`verify:nav-gate`.
