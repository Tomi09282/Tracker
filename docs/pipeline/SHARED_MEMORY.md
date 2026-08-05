# SHARED_MEMORY — hot working memory

**READ FIRST, WRITE LAST.** Every agent run reads this file completely before touching
anything, and updates it before finishing. No exceptions.

This is the *hot* store: what the next job needs right now. The Obsidian brain (`docs/brain/`)
is the *cold* store — durable decisions and long-term state. The coordinator syncs hot → cold at
every phase approval and prunes this file back down.

Hard cap ~2000 lines so it can always be read whole. Facts and pointers, not essays.

---

## 1. STATUS BOARD

| Phase | Job | State | By | Date |
|---|---|---|---|---|
| 0 | Repo skeleton + brain restore | done | Opus | 2026-08-04 |
| 0 | Design token layer + build gate | done | Opus | 2026-08-04 |
| 0 | Backend scaffold (env, DB pool, server, logging) | done | Opus | 2026-08-04 |
| 0 | Auth (JWT + rotating refresh + CSRF + limits) | done | Opus | 2026-08-04 |
| 0 | Shared control primitive (44px floor, structural) | done | Opus | 2026-08-04 |
| **0** | **PHASE 0 COMPLETE — 18/18** | done | Opus | 2026-08-04 |
| 1 | J1 app shell (router, nav, api client, i18n, auth screens) | done | Opus | 2026-08-04 |
| 1 | J2 theme engine (packs, accent, gradient, contrast guard, persistence) | done | Opus | 2026-08-04 |
| 1 | J3 feedback architecture + E1, E2, E4, E5 (20 variants) | done | Opus | 2026-08-04 |
| 1 | J3b catalog E3, E6, E7 (35/100 variants) | done | Opus | 2026-08-04 |
| 1 | J5 exercise backend (schema, CRUD, FTS, filters, anti-IDOR) | done | Opus | 2026-08-04 |
| 1 | J5b seed — 1652 exercises imported | done | Opus | 2026-08-04 |
| 1 | J5d multi-language content model (migration 004 + 22 languages) | done | Opus | 2026-08-04 |
| 1 | J5c media upload pipeline | done | Opus | 2026-08-04 |
| 1 | J6 library UI (list, filters, detail) | done | Opus | 2026-08-04 |
| 1 | J7 admin-lite (stats, moderation, role change) | done | Opus | 2026-08-04 |
| 1 | J6b muscle map — SVG figure, both views, reversible filter | done | Opus | 2026-08-04 |
| 1 | J3c feedback catalog E8-E20 — ALL 100 variants complete | done | Opus | 2026-08-04 |
| 1 | UX base pack (offline, Cmd+K, haptics) | done | Opus | 2026-08-04 |
| **1** | **PHASE 1 CODE-COMPLETE — 41/51; the rest are owner decisions or blocked audits** | done | Opus | 2026-08-04 |
| 2 | J1 coaching: teams, codes, three join flows | done | Opus | 2026-08-04 |
| 2 | J2 coach dashboard (roster, codes, teams, pre-generate) | done | Opus | 2026-08-04 |
| 2 | J3 onboarding questionnaire (F11) + taxonomy i18n | done | Opus | 2026-08-05 |
| 2 | J3b client detail screen (blueprint 7 shell) | done | Opus | 2026-08-05 |
| 2 | J4 schema RESEARCH (3 designs, 6 attacks, 39 fatal flaws) | done | Opus | 2026-08-05 |
| 2 | J4 migration 010 — fix the draft first, critic said needs-work | pending | — | — |
| 1 | J3c catalog E8-E20 | pending | — | — |

Pipeline: **Opus 5 solo, all roles** (D-P1). There is no PVP loop to hand off to.

---

**PHASE 2 AS OF 2026-08-05: 63 of 66 done.** 78 endpoints · schema v12 · smoke 313/313 ·
verify:schema 21/21 · check-routes OK (74 routes, 8 public by design) · npm audit 0 · 3 languages ×
406 keys · vault in sync. Open: two ui-ux-pro-max passes (T2.0.3, T2.0.4) and the per-coach seat
cap (T2.3.5), which is reserved for the billing phase by design.

## 2. CONTRACTS

Established facts other jobs must not re-derive or contradict.

### API
- Base path `/api/v1`. Auth router mounted at **`/api/v1/auth`**.
- Error envelope, always: `{ error, code, requestId }`. Codes come from `ERR` in
  `src/lib/http.js` — never invent a code inline.
- `GET /healthz` → `{ok:true}`, touches nothing. `GET /readyz` → pings the DB, 503 on failure.
- `GET /api/v1/config` → `{ appName }`. The UI reads its own name from here.
- Auth: `POST /register` `/login` `/refresh` `/logout` `/logout-all`, `GET /me`.
- CSRF middleware is mounted **below** health/config and **above** every API router, so a new
  router cannot forget to opt in.

### Coaching (phase 2)
- `coach_clients` is the link — a client may be coached by different coaches over time, so it
  is never a column on `users`. UNIQUE on (coach_id, client_id); a trigger forbids self-coaching.
- Join codes are stored as **sha256 hashes**. The plaintext is returned exactly once, at
  creation, and exists nowhere else. Listing codes never echoes it.
- `must_change_credentials = 1` locks a pre-generated account out of everything except
  `/auth/me`, `/auth/change-credentials` and `/auth/logout` — enforced in `requireAuth`.
- `POST /api/v1/join` consumes the code and creates the link in ONE transaction, with the
  use-count guard inside the UPDATE.

### Auth
- Access JWT 15 min, HS256, `kid` header, claims `sub` `role` `sv` `jti`, issuer/audience from env.
- Refresh: opaque 32 random bytes, stored as sha256, rotated every use, `family_id` per login.
- Reuse detection: consumed token replayed **>10 s** later ⇒ family revoked + `session_version`
  bumped. Replay **within** 10 s ⇒ `409 refresh in progress`, no alarm (two tabs racing).
- Cookies: `access` (HttpOnly, SameSite=Lax, Path=/) and `refresh` (HttpOnly, SameSite=Strict,
  Path=`/api/v1/auth`). Prod adds Secure + `__Host-`/`__Secure-` prefixes.
- `sv` cache is 30 s. Anything that changes role, disables a user or forces logout MUST bump
  `session_version` and call `invalidateSvCache(userId)` in the same operation.

### Database
- Access ONLY through `src/db/index.js`. Nothing outside `src/db/` imports better-sqlite3.
- Migrations are `src/db/migrations/NNN_name.sql`; the number is the target `user_version`, and
  the bump happens **inside** the file's transaction.
- Current schema version: **6** (`users`, `refresh_tokens`, `audit_log`, `user_theme_prefs`, `element_style_config`).
- `audit_log` is append-only, enforced by BEFORE UPDATE/DELETE triggers — not by convention.
- `writeTx` is for simple multi-statement writes only. Guards or branching ⇒ a named worker fn.

### Design tokens
- `frontend/src/ui/tokens/tokens.css` is the ONLY file allowed a raw color, radius or duration.
- Type utilities: `text-display` `text-title-1` `text-title-2` `text-title-3` `text-body`
  `text-body-s` `text-caption` `text-micro` — each carries its own line-height/weight/tracking.
- Colors: `surface-0..3`, `text-1..3`, `accent` (+ `-hover` `-pressed` `-subtle`, ramp 50–950),
  `success|warning|danger|info` each with `-subtle` `-border` and `on-*`.
- Radius: `rounded-card|button|chip|field|sheet` — theme-scoped, never a raw px.
- `--target-min: 44px` is the interactive floor. `--nav-h: 64px`, nav icon `--icon-lg: 24px`.
- `@theme static` is required in Layer 1: Tailwind tree-shakes unused theme vars and half this
  layer is consumed through `var()` from JS.

### Key paths
- `backend/server.js`, `backend/run-server.js`, `backend/src/{lib,db,auth}/`
- `frontend/src/ui/tokens/tokens.css`, `frontend/src/index.css`, `frontend/scripts/check-tokens.mjs`
- `scripts/brain-sync.mjs` (repo → Obsidian vault mirror)

---

## 3. DECISIONS

- `2026-08-04` **No PVP.** Opus 5 fills every pipeline role solo. (owner)
- `2026-08-04` **Full rebuild from scratch**; design system before screens. ADR-0006. (owner)
- `2026-08-04` VISUAL DESIGN BIBLE outranks ui-ux-pro-max; the skill's palette, fonts and
  landing-page pattern were explicitly rejected. ADR-0007.
- `2026-08-04` Fonts self-hosted via `@fontsource`, not the Google CDN — the CSP allows no
  third-party font origin.
- `2026-08-04` Accent ramp derived at runtime in OKLab, so a user-picked accent gets the same
  perceptual spacing as the built-in packs.
- `2026-08-04` Smoke suites are hermetic: `smoke-run.mjs` boots a throwaway server on a random
  port with a fresh temp database. Functional suite runs `NODE_ENV=test` (limiters skipped);
  limiters get their own run where the skip is NOT active.

---

## 4. GOTCHAS

- MEASUREMENT TRAP: in the non-compositing preview pane, CSS transitions and rAF are both frozen,
  so `getComputedStyle` returns the PRE-transition value forever. Read `el.style.<prop>` (the
  specified value) to check correctness — otherwise a working component reads as broken. The real
  bug of this shape is when the DOM CONTENT is wrong (a rAF counter stuck at 0), not the paint.

- `requestAnimationFrame` never fires in a tab that is not compositing, so a rAF-driven counter
  stays at its initial value. A statistic reading 0 when the truth is 1652 is a WRONG NUMBER,
  not a missing animation — always pair the animation with a timeout that lands the real value.

- The brain data-model and API notes are GENERATED (`npm run brain:gen`) from the live schema
  and the mounted routers. Do not hand-edit them; they were stale within a day when hand-written.

- Piscina strips SQLite errors down to `{code:"SQLITE_ERROR"}` with no message. `src/db/worker.js`
  now re-wraps them with the message AND the failing statement — this cost three blind hunts.
- `ON CONFLICT(col)` needs a real constraint on that column. `users.email` is unique only via an
  index on `lower(trim(email))`, so use `INSERT OR IGNORE` there.
- Dev logins: `user@ / coach@ / admin@tracker.local`, password `TrackerDev123`
  (`npm run seed:dev-users`, refuses to run with NODE_ENV=production).

- An FTS5 external-content index addresses its source BY ROWID, so its source table cannot be
  WITHOUT ROWID. Use a surrogate id + a UNIQUE index on the natural key.
- wger language ids are NOT guessable: 12 is French, and wger has NO Hungarian at all. Fetch
  /api/v2/language and map by the ISO short_name the API reports.

- Migrations previously ran ONLY at server boot, so any script (seed, maintenance, CI) hit a
  bare "no such table" against a stale schema. `npm run migrate` now applies them standalone.

- A control sized to its own GRAPHIC is the 44px bug in disguise: the checkbox rendered a
  24px box and became a 24px target. Size the button to the floor and put the graphic inside it.
- Guarding an idempotent edit with includes("symbolName") fails when the symbol already appears
  in the body being edited — the import never got added and the feature silently no-opped.

- A contrast guard written as `max(ratio vs black, ratio vs white) >= 4.5` is VACUOUS: those
  two curves cross at 4.58, so the better of the pair never drops below 4.5 for ANY colour.
  The binding constraint is the accent AS TEXT on the app background. Both copies now check that.

- `run-server.js` is a **supervisor**. Killing only `server.js` makes it respawn, which keeps a
  lock on `data/app.db`. Kill the supervisor first.
- Tailwind 4 tree-shakes unused `@theme` vars → use `@theme static` for the primitive layer.
- Do not re-declare a theme-independent token inside `@theme inline` as `var(--itself)`: with no
  Layer-2 backing it resolves to the empty string. (Cost one debugging round on `--ease-standard`.)
- React-Hook-Form ignores a raw `value` assignment from automation. Drive inputs through the
  native setter plus an `input` event, or the form silently never submits.
- The rate limiters make any non-hermetic auth suite unrepeatable within 15 minutes. Always run
  through `npm run smoke`.
- The 10 s benign-race window means a theft test **must** wait it out. The sleep in `smoke.js` is
  load-bearing; do not "optimize" it away with a test-only branch through security code.
- React Router 8 exports TWO RouterProviders. Browser data-router apps need `react-router/dom`;
  the package-root one renders an EMPTY document with no error and no warning.
- Frontend and backend must share ONE zod major or the shared-schema plan is dead. npm gave the
  frontend zod 3 while the backend had 4; pin both to ^4.
- `npx skills add` symlinks by default and the links are dead on Windows — always `--copy`.
- A repo→vault mirror must skip dot-directories, or it deletes the vault's `.obsidian` config.

---

## 4aa. A CHART'S X AXIS IS TIME, OR THE CHART IS LYING

The progress chart shipped positioning points by INDEX. It is the obvious implementation and it is
wrong for this chart: five sessions in a week then a two-month break renders identically to seven
consecutive days. The whole question a progress chart answers is **how fast**, and index spacing
destroys precisely that — a coach reads evenly-spaced points as steady training.

Fixed by positioning on the date. The cost is that clustered sessions crowd and gaps open up; that
is the truth, and a visible gap is information.

Two supporting decisions:

- **The geometry moved to a pure module** (`chartGeometry.ts`), because where the points go is the
  one thing a chart can get silently, misleadingly wrong — and pure arithmetic can be checked
  exhaustively without a DOM. Same reasoning as `intervalPlan.ts`.
- **A break of 14 days or more is NAMED in the axis row.** Once the axis is honest the gap is
  visible, but visible and understood are different things: the caption is what stops the drop
  after a break being read as lost strength. Fourteen days because a week off is ordinary.

Deliberately NOT changed, so it is not re-raised: there is no y-axis scale (this is a sparkline —
the caption carries the current value and the change, which is what a coach reads), and the delta
is first-to-last over the window rather than since the previous point (a single-session dip is
noise; where they started versus where they are is the question).

## 5. HANDOFF QUEUE

Phase 2's 20 accumulated lessons were PRUNED from this hot file on 2026-08-05, after
being distilled into the cold brain at `docs/brain/60-Decisions/0010-phase-2-lessons.md` — which,
unlike this file, IS mirrored to the Obsidian vault. That is the entire reason the hot/cold split
exists: this file is a scratchpad for one phase, and the vault is what survives it.

Nothing was lost. What was pruned, by title, so a reader can tell whether the cold note covers
what they are looking for:

  - 5t. A SCREENSHOT IS EVIDENCE OF A FRAME; A MEASUREMENT IS EVIDENCE OF A FACT
  - 5r. AN AUDIT YOU RUN ONCE IS A SNAPSHOT
  - 5s. ONE POINT PER DAY, AND THREE POINTS BEFORE A LINE
  - 5q. FLAG, DO NOT FILTER — AND SAY WHY
  - 5p. A TAB IS A FILTER, NOT A NEW ENDPOINT
  - 5n. A SESSION COULD BE STARTED AND NEVER FINISHED
  - 5o. THE HANDOVER IS SCROLLED TO, NOT FOCUSED
  - 5l. THE INTERVAL ENGINE: ONE ANCHOR, AND NO THRESHOLD
  - 5m. THREE CUE CHANNELS, NOT ONE SOUND SWITCH
  - 5i. A ROUND IS A SET ROW
  - 5j. CONDITIONING WORK EARNS NO STRENGTH RECORD
  - 5k. TWO BUGS THE INTERVAL WORK EXPOSED, BOTH PRE-EXISTING
  - 5h. THE UNDO, AND WHY IT IS NOT A SECOND ROLLUP
  - 5g. A CREDENTIAL YOU CANNOT WITHDRAW
  - 5f. A CUE IS AN EVENT, NOT A RENDERED STATE
  - 5e. THE SCHEDULE RULE NOW EXISTS ONCE — AND THIS TIME IT IS TRUE
  - 5c. COPY-WEEK IS A CYCLE CHANGE, AND THE ONLY HONEST OPTION IS TO SAY SO
  - 5d. A LIMIT CHECK THAT PASSES BECAUSE THE INPUT WAS UNDER THE LIMIT
  - 5b. A BEARER URL NEEDS ITS REVOCATION IN THE FETCH PREDICATE
  - 5a. CLONE MEANS COPY, AND THE PROOF IS THE INDEPENDENCE TEST

The five evidence rules distilled from them are the part worth carrying into Phase 3:

  1. A test never seen to fail is not evidence.
  2. A screenshot is evidence of a frame; a measurement is evidence of a fact.
  3. An audit you run once is a snapshot; a gate is what keeps being true.
  4. An audit must not carry its own copy of what it audits.
  5. A path exercised only one way is one untested branch from never having worked.

## 4z. A SNAPSHOT IS A FALLBACK, NOT A DISPLAY VALUE

The plan editor showed **"Squats"** to a coach who had just picked **"Guggolás"** from the search.

`exercise_name_snapshot` exists so a log still renders after the exercise is renamed or deleted —
that is its whole job. Reading it while the link is LIVE means the plan is stuck in whatever
language the row was created in, and a Hungarian coach and a German client see each other's
language instead of their own.

The plan tree now resolves through the same chain as everything else — requested → default →
canonical → snapshot — so the same plan reads **Guggolás / Squats / Kniebeuge**. The snapshot is
the last link in the chain, where it belongs.

The general rule: a denormalised copy kept for DURABILITY must not become the value the UI reads
while the original is still there.

## 4y. TWO QUERIES ANSWERING ONE QUESTION MUST SHARE EVERY FILTER

`/my-plans/today` answers in two parts: days the cycle lands on, and days MOVED onto today by an
exception. The scheduled half filtered `starts_on <= today AND (ends_on IS NULL OR ends_on >= today)`.
The moved half did not.

Result: a day moved onto today out of a block that had already ENDED still appeared. Caught by a
smoke check that set `ends_on` to yesterday and expected zero days.

The rule, and it is the third time this session: when one answer is assembled from two statements,
every predicate that decides ELIGIBILITY has to appear in both. Otherwise the answer depends on
which statement happened to find the row.

## 4w. TWO CALCS THAT HAD TO AGREE, AND DID NOT

The player is a fixed-height grid so the page cannot scroll while sets are checked — a check button
that moves is a check button that records the wrong set, on a row the schema then freezes.

It scrolled by exactly **16 px**. `AppLayout` reserved `nav + 16` below its content; the player
subtracted only `nav`. Both were hand-written calcs, and they drifted the moment one changed.

Now `--content-pad-b` in the token layer, referenced by both. Measured after: page overflow 0, and
at 375x560 the list scrolls internally while `window.scrollTo(0, 500)` moves the page not at all.

## 4x. A COUNTDOWN MUST BE A DEADLINE, NOT A COUNTER

The rest timer stores a wall-clock deadline and derives the remaining seconds from it. A
decrementing counter loses time whenever the tab is backgrounded — which on a phone is every time
the screen locks between sets, i.e. every set. With a deadline the number is correct the instant
the screen comes back, however long it was away.

The interval exists only to repaint and carries no state, so a missed tick costs nothing. Same
reasoning as the muscle map's fills: if no animation frame ever runs, the INFORMATION must still be
right.

## 4u. TWO BUGS IN THE J4 IDEMPOTENCY DESIGN, BOTH FOUND BY RUNNING IT

The four-layer design is sound and is what got implemented. Two integration gaps only appeared
under execution — neither is visible by reading the design, and both returned **400 on an ordinary
user action**.

**1. A replay tried to mint a second record.** The design says a replay is harmless because the
upsert's `DO UPDATE ... WHERE` evaluates to false. That covers the DAY-unique index it names as the
conflict target and misses the second one: `workout_pr_events_source_unique (source_set_id, kind,
rep_bucket)` fires FIRST, because the replay is inserting a second event for a set that already has
one. `ON CONFLICT` names only the day index, so this is an unhandled SQLITE_CONSTRAINT_UNIQUE — a
double-tapped set button came back as an error.

Fix: skip the record block entirely when the set was already complete. Also the semantically
correct answer, not merely the working one — the badges for that set were minted in the SAME
transaction that completed it.

**2. A back-off set could not be logged at all.** The design puts the whole comparison inside the
upsert's `DO UPDATE ... WHERE`. It never gets that far: the table carries
`CHECK (previous_value IS NULL OR value > previous_value)`, evaluated on the row being INSERTED. A
worse set therefore aborts the whole transaction. Measured: 110 kg then 95 kg, and the 95 came back
400 — a lifter doing a lighter back-off set after a heavy one could not record it.

Fix: read the all-time best first and `continue` when it is not beaten. That is NOT the race the
design was avoiding — `tx.immediate()` holds the single write lock from BEGIN, so nothing can
interleave between the read and the write. "No preceding SELECT" applies to a DEFERRED transaction,
where the lock is taken at the first WRITE and the read really is unprotected.

## 4v. A CHECK THAT PASSES FOR THE WRONG REASON IS A CHECK THAT IS NOT RUNNING

The back-off bug was inside a check that was PASSING. It asserted "the lighter set mints nothing",
and a 400 rejection produces exactly the same observable as a legitimate non-record: no records.

Assert the STATUS as well as the effect. The check now reads
`minted[1].status === 200 && minted[1].kinds === 'none'` — the two together say "it was recorded AND
it minted nothing", which is the actual requirement.

## 4s. THE CLIENT SENDS WHAT IT TYPED; THE SERVER COMPUTES WHAT IT MEANS

`workout_plan_exercises` keeps a weight THREE times: canonical `target_weight_kg` for every
comparison, plus the entry pair (`225`, `lb`) so a coach never sees their "225 lb" render as
"102.1 kg". A CHECK verifies the two agree to within 0.02 kg.

Which means the canonical value CANNOT be accepted from the request: a client could send a pair
that disagrees, and the CHECK would reject the write with a message nobody could act on. The route
takes `target_weight` + `target_weight_unit` and computes the kilograms, so the pair is correct by
construction. Verified: 225 lb lands as 102.058 kg with the entry pair intact.

The three columns also move together or not at all in a PATCH — writing one alone puts the row in
violation of a constraint the request never mentioned.

## 4t. A REORDER SENDS THE WHOLE LIST, AND RENUMBERS FROM ZERO

Not a pair of indices: a drag is "here is the new order". Sending it whole means a dropped request
cannot leave two rows claiming one position — the next successful drag states the truth again.

Positions are rewritten from 0 rather than shuffled, because a gap-based scheme eventually runs out
of gaps and needs a compaction pass nobody remembers to write. A cycle is at most 56 days; the
renumber is cheap and always correct.

Each UPDATE carries the ownership predicate, so a forged id in the list is a NO-OP rather than a
cross-tenant write — and the response reports `{moved, of}`. Partial success is surfaced, not
hidden: the difference is what tells the UI its list has drifted and it should refetch.

## 4q. A SECURITY PREDICATE WITH TWO COPIES HAS ONE THAT IS WRONG

`VISIBLE` existed as a constant in `exercises/routes.js` AND as a hand-typed duplicate inside
`exercises/media.js`. Extending it for prescribed exercises would have updated one of them, and a
client would have been able to open the exercise their plan prescribed but not its picture.

Now `src/exercises/visibility.js`, exported with a `visibleParams()` helper — because the predicate
grew from one `?` to two, and every call site appends them by hand. `[...rest, userId]` silently
binds the wrong column when a second placeholder appears, and the query still runs.

The read predicate is deliberately one notch STRICTER than the write trigger: it requires
`status <> 'draft'`. A client cannot see a draft plan, so they must not see the movements inside it
— a coach builds a week without the client watching it appear.

## 4r. AN FK ACTION CANNOT BE ALTERED, BUT IT CAN BE MADE UNREACHABLE

`exercises.owner_id ON DELETE CASCADE` (migration 003) meant deleting a coach unlinked their
clients' history. SQLite cannot change an FK action, and the textbook answer — a 12-step table
rebuild — would have meant rebuilding a table with an FTS5 external-content index, three junction
tables pointing at it and 1652 rows of licensed data.

Migration 011 instead puts a `BEFORE DELETE` trigger on `users` that orphans the exercises before
the cascade can fire. Large risky migration avoided; behaviour changed anyway.

The detail that matters: `owner_id = NULL` and **status untouched**. Setting it to 'global' would
have published a departing coach's private library to every user of the product. `verify:schema`
asserts the status stays private, so nobody "simplifies" it later.

## 4o. A CONSTRAINT VIOLATION IS A 400, AND THE TRIGGER'S OWN WORDS ARE THE MESSAGE

Two plan-authoring checks passed while returning **500**: a day outside the plan cycle, and
activating a client plan with no start date. Both are the schema correctly refusing a bad request,
and both were reaching the client as "the server broke" — and the log as a server fault.

`errorHandler` now translates `SQLITE_CONSTRAINT*` into a 400, logged at `info`. The split matters:

  - `RAISE(ABORT, '…')` text was WRITTEN FOR A HUMAN, so it passes through verbatim. The API's
    error message and the schema's rule are then the same string and cannot drift.
    → `400: workout_plan_days.day_index must be inside the plan cycle`
  - A CHECK expression was not written for anyone to read, and dumping it would leak schema
    internals for no benefit. It becomes a generic message; the detail stays in the log.
    → `400: this change is not allowed by the data model`

Detection is on the MESSAGE PREFIX, not `err.code` — the error crosses a Piscina worker boundary
and custom properties do not survive structured cloning. The worker also appends
`— while running: <sql>`, which is trimmed before anything is sent.

## 4p. PLANS: THE LINK IS THE AUTHORITY, NOT THE AUTHORSHIP

`author_user_id` alone would let a coach keep editing a plan belonging to a client they no longer
coach. Every coach-side predicate therefore carries an `EXISTS (… coach_clients … status='active')`,
and the smoke proves the consequence directly: archive the client, and the very next PATCH with the
SAME unexpired token returns 404 — while `GET /my-plans` still shows the client their plan.

They own their training; the coach owned only the relationship.

## 4m. A BATCH REPLACE THAT REPORTS SUCCESS CAN STILL HIT THE WRONG TABLE

A patch adding `timezone` to `workout_calendar_feeds` anchored on a `label TEXT CHECK ...` line.
That exact line appears TWICE in the file, `String.replace` takes the first, and the column landed
on `workout_plan_blocks`. The script printed `✓ ICS: a timezone on the feed`.

It was caught only because the verification queried the column by TABLE rather than by name. This
is the second time this session a batch edit reported success for a replacement that did not do
what it said — the first silently matched nothing at all.

**Anchor on something unique, and verify the RESULT, not the exit code.** The check is now
permanent: `verify:010` asserts the column is on the feeds table AND absent from blocks.

## 4n. REWINDING A MIGRATION IS LEGITIMATE EXACTLY ONCE

`scripts/rewind-010.mjs` drops 010's tables and resets `user_version` to 9 so the corrected file can
be re-applied. Justified only because 010 was hours old on a solo dev database, every table it
created was EMPTY, and no code referenced it — far cleaner than an 011 that rebuilds five tables to
widen two CHECKs on day one.

The script **asserts emptiness and refuses otherwise**, which is what stops it being reached for
later out of habit. A migration that has left this laptop is immutable.

Gotcha it had to handle: `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS`, so the `timezone`
column added to `onboarding_profiles` must be dropped too — otherwise the re-run aborts on
"duplicate column name" AFTER the drops have committed, which is the worst possible half-state.

## 4l. J4 SCHEMA RESEARCH IS ON DISK — READ IT BEFORE WRITING MIGRATION 010

`docs/pipeline/phase-2/j4-schema-constraints.md` — the checklist, 12 recurring fatal flaws with
rules. `j4-schema-research.json` (481 KB) — the full designs and every one of the 39 fatal and 67
serious findings with proposed fixes.

The synthesis finished after ~100 min: `j4-synthesis.sql` (102 KB, 12 tables, 40 indexes, 55
triggers) plus `j4-synthesis-notes.json`. Its own completeness critic returned **needs-work** — 3
verified SQL defects, 3 unaddressed fatal flaws, 8 roadmap requirements it cannot express, and 7
open questions that are genuinely the owner's call. DO NOT APPLY IT AS IT STANDS.

The one conclusion all three independent designs reached: **COPY, DO NOT REFERENCE.** Assigning a
plan deep-copies it; logging deep-copies the prescription. A log is a historical fact.

**The next migration is 010, not 009.** The runner now THROWS on a duplicate version instead of
silently skipping the second file — two reviewers caught that collision independently, and neither
the runner nor any test would have said a word.

## 4k. A LANGUAGE-DEPENDENT FETCH NEEDS THE LANGUAGE IN THE URL **AND** IN THE QUERY KEY

German interface, Hungarian filter chips. `useTaxonomies()` sent no `?lang=` and carried no
language in its React Query key — two independent bugs that produce the same symptom:

  - no `?lang=` → the server falls back to Accept-Language, which is the BROWSER's language and
    has nothing to do with the language the user chose in the app. Those differ for everyone the
    switch exists for.
  - no lang in the key → the first answer is cached for the 30-minute staleTime, so switching
    language keeps showing it. This is the more dangerous half: it survives a fix to the first one
    and makes that fix look broken.

`useExercises` in the SAME FILE had both from the start. Proximity is not consistency.

The rule: if a response's CONTENT depends on the request language, the language belongs in the URL
and in the cache key. Verified by switching language in place, with no reload, and watching the
chips follow — a reload would have hidden the caching half entirely.

## 4i. REFERENCE DATA BELONGS IN A MIGRATION, NOT IN AN IMPORT SCRIPT

`languages` had two rows from migration 004 and twenty-two more that appeared only as a side
effect of `seed-translations.mjs` importing wger. A freshly migrated database and a seeded one
therefore had DIFFERENT language tables, and nothing said so.

It surfaced as `UPDATE languages SET enabled = 1 WHERE code = 'de'` changing zero rows in the
hermetic smoke database — silently, because an UPDATE matching nothing is not an error. The
language tests then failed with a confusing message about German while the German code was fine.

Migration 009 rosters all 24 languages, all `enabled = 0`. The distinction to keep:
  ROSTER (which languages exist) = reference data = schema.
  ENABLED (which a user may be served) = policy = runtime flag.

Corollary that cost two more failing checks: enabling German invalidated two OLDER tests that had
used `de` as their example of a disabled language and asserted the language list as a hardcoded
`'en,hu'`. A test that names a specific datum as its example of a category silently stops testing
when that datum changes category. Assert the PROPERTY.

## 4j. THREE GATES ADDED THIS SESSION, EACH FROM A REAL FAILURE

  - `check-tokens` now rejects an undeclared `var(--x)` and an undefined local utility class.
  - `check-i18n` (new, wired into `npm run build`) requires every bundle to carry an identical key
    set, matching interpolation placeholders, native language labels that stay untranslated, and
    no bundle that is a byte-copy of another.
  - `check-languages` (new) proves the database's enabled set and the frontend's LOCALES registry
    agree. It checks CONFIGURATION, not the running process — `lang.js` caches the enabled set for
    the process lifetime, so a green run here says nothing about what a live request will get
    until the server restarts.

## 4g. 403 IS FOR ROLES, 404 IS FOR OBJECTS — AND THEY MUST NOT DRIFT

`/clients/:id` answered 403 to a plain client while `/clients/:id/onboarding` answered 404 to the
same caller. One guard had been copy-pasted, the other forgotten.

The rule, written down so it stops being re-litigated:
  - ROLE rejection -> 403. "You are not a coach" reveals nothing about any object and is a fact
    the caller already knows about themselves. This is the ONE deliberate exception to
    404-never-403.
  - OBJECT rejection -> 404. A real coach, correctly past the role gate, must not learn that
    another coach's link exists.

`requireCoach` now lives in `src/auth/middleware.js`, not in a router. The smoke tests BOTH sides
of every coach route: a plain client (403) and a second real coach (404). Testing only one caller
is how the drift survived.

## 4h. TWO NAMES THAT RESOLVED TO NOTHING

`--measure-form` was never declared: `max-width` computed to `none` and the questionnaire ran edge
to edge on desktop. `size-icon-s` was written as if Tailwind generated it from `--icon-sm`; there
is no `--size-*` theme namespace, so the class was INERT and every icon fell back to lucide's 24px.

Neither produced an error, a warning, or a failed build. `check-tokens` passed both because it
policed raw VALUES, not names that resolve to nothing. It now rejects an undeclared `var(--x)` and
an undefined local utility class — measured in the browser first, then turned into a gate.

Also, twice this session: a probe that read the FIRST `[aria-live]` on the page rather than the one
meant, and a "not centred" verdict that compared against `innerWidth` (which includes the
scrollbar) instead of the layout viewport. Measure the element you mean, in the space it lives in.

## 4f. THE STALE-CLOSURE BUG THAT COST A REAL ANSWER

Ticking five equipment boxes saved ONE. Five click handlers fire in a single tick with no repaint
between them, so all five read the same render's `draft` and the last write wins. Measured in the
browser — three clicks, one row in the database. Not caught by code review, not caught by the
build, not caught by the smoke (which drives the API, not the DOM).

Fix: a ref that is updated SYNCHRONOUSLY alongside the state, and every multi-select handler reads
`live()` (the ref-merged profile) rather than the render snapshot. Any handler a user can fire
twice before a repaint needs this — the pattern, not just this screen.

Related false alarm from the same probe: the save indicator looked empty. It was not — the probe
matched the FIRST `[aria-live]` element on the page, which belongs to something else. Measure the
element you mean.

## 4e. RESTART THE BACKEND AFTER ADDING A ROUTER

New routes 404 until `server.js` restarts, and `pkill -f "node server.js"` does NOT reliably
kill it here. Free the port instead:

    Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

This has cost time three separate times. The frontend hot-reloads; the backend does not.

## 4c. LATE GOTCHA

- The 44px floor applies to BOTH axes and the width often comes from LAYOUT, not from a class:
  a 7-column calendar inside a narrow card gave 35x44 day cells. The build lint cannot see this;
  only DOM measurement can. Where the layout would squeeze a control, let the container scroll
  rather than shrinking the target.

## 4d. WHAT THIS PANE CANNOT MEASURE

Three things are untestable in the preview pane, and must be neither claimed nor called broken:

1. **Animation end-states** — no frames composite, so rAF and CSS transitions both freeze. Read
   `el.style.<prop>`, not `getComputedStyle`.
2. **Autofocus** — `document.hasFocus()` is false and even an explicit `.focus()` is refused.
3. **Anything visual** — screenshots fail outright (OQ-5).

A rAF-driven value that ends up in the DOM (a counter's text) IS testable, and a wrong one there
is a real bug — that distinction is what separates a false alarm from a defect.

## 4b. SYNC DISCIPLINE (owner instruction, 2026-08-04)

Sync the brain **before** the context window runs low, not at the end of a session — anything
unsynced when context is lost is simply gone. And when a detail that was already synced changes,
UPDATE that note in the same breath rather than letting the vault drift into describing an
older version of the code.

One command does both: `npm run brain:gen` (schema + API, derived) then `node scripts/brain-sync.mjs`.

## 5. HANDOFF QUEUE

What the next job needs to know:

1. **Phase 0 is complete.** Build every control from `src/ui/primitives/Pressable`; the build
   rejects a raw `<button>` outside `src/ui/`. Variants: primary | secondary | ghost | danger,
   shapes button | icon | chip | field, densities compact | default | large. Density changes
   padding and type size ONLY — never the hit area.
2. **Blocked:** screenshot audits (SO-6). The in-app Browser pane does not composite frames on
   this machine, so visual verification currently comes from DOM measurement plus the owner
   looking at `localhost:5173` directly. See OQ-5.
3. **Seed is back:** `npm run seed:exercises` imports 1652 global exercises and is idempotent.
   Media files were NOT re-fetched — the upload pipeline (J5c) comes first.
4. Nothing is committed yet. 56+ files staged; the owner has been asked about a
   `chore: phase 0 foundation` commit.
