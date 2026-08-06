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

**PHASE 5 CODE-COMPLETE — F7 coins + F12 gamification.** 32 done · 6 deferred · 0 open.

THE MARKETPLACE IS CUT TO MIGRATION 020, and that is the phase's main result rather than a
shortfall. Three designs were attacked by five adversarial lenses; of the 21 fatal-and-severe
findings, **thirteen sat in the marketplace**, including the one FATAL: `trg_plan_source_owned_ins`
(010:1256) requires `source_plan_id` to name a plan the SAME author wrote, so every template
purchase would have aborted. Deleting the feature removed thirteen defects without writing one fix.

Leaving Phase 5: **schema v19 · 130 routes · smoke 472/472 · verify:019 56/56 · verify:schema 23/23
· verify:015 30/30 · check-worker-tx 11 bodies · check-i18n 534 × 3 · npm audit 0.**

Also shipped separately as **migration 018**: a LIVE erasure blocker. `audit_log.actor_id` is
ON DELETE SET NULL and the append-only trigger had no WHEN clause, so an FK action — which IS an
UPDATE as far as triggers are concerned — aborted the delete for anyone who had ever produced an
audit row. Measured, not inferred, and the cleanup after the probe required switching the
guarantee off, which is the argument for its urgency.

Behind it: **PHASE 4 CODE-COMPLETE — F4 nutrition + F10 progress & measurements.** 24 done · 3 deferred · 2 open.

The two still open are follow-ups this phase deliberately did NOT take, both recorded with reasons:
coach visibility into a client's FOOD LOG (needs the same explicit consent design `progress_shares`
got — *coaching seems to imply it* is not a reason), and running a larger USDA import (the script is
written and exercised; `fdc.nal.usda.gov` is unreachable from this host).

Leaving Phase 4: **schema v17 · 121 routes · smoke 438/438 · verify:015 30/30 · verify:schema 21/21
· check-i18n 511 × 3, now bidirectional · check-tokens · check-interval 50 · npm audit 0.**

Behind it: **PHASE 3 — F5 notifications + F6 chat.** 26 done · 2 deferred · 0 open.

The two deferred are **T3.1.2** (quiet hours) and the digest half of **T3.1.6**, both waiting on
the same missing thing: a scheduler. Neither is deferred for effort — each would have to store a
promise the delivery path cannot keep. Reasons in [[0011-phase-3-lessons]]. The one still open is
T3.4.4, this prune itself.

Behind it: **Phase 0 18/18 · Phase 1 57/58 CLOSED (owner sign-off 2026-08-06) · Phase 2 65/66.**
The two carried-forward items are T1.31 (gender/body variants and 3D on the muscle map) and T2.3.5
(per-coach seat cap, reserved for the billing phase). Neither blocks this phase.

Baseline entering Phase 3: 78 endpoints · schema v12 · smoke 316/316 · 412 keys x 3 · 5 commits.
Leaving it: **93 endpoints · schema v14 · smoke 357/357 · verify:013 30/30 · verify:schema 21/21 ·
check-routes 89 routes · check-worker-tx OK · check-tokens OK · check-interval 50 · npm audit 0 ·
437 keys x 3 · Bible audit 360 + 1440 clean with the probe proven to fire.**

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

## 5c. PHASE 5 CLOSE — THE SPENT GOTCHAS, AND WHERE THEY LIVE NOW

Pruned 2026-08-06. **This prune is different from the Phase 2 and Phase 3 ones and the difference
matters.** Those distilled LESSONS into cold notes, because a lesson is something learned that no
code records. The sections below were GOTCHAS, and every one of them is now either implemented in
the codebase with its reasoning in a comment beside the code, or has become one of the seven
evidence rules. **The code is a better forwarding address than a document restating it**, and each
line below names the address. All of them also remain verbatim in git history.

  - 5b. PHASE 3 LESSONS — PRUNED TO THE COLD BRAIN
      → folded into this marker — the Phase 3 titles it listed are in 0011-phase-3-lessons
  - 4y. TWO QUERIES ANSWERING ONE QUESTION MUST SHARE EVERY FILTER
      → became the one-predicate rule — VISIBLE, MEMBER_OF, OWN_OR_HELD, visibleFood, sharedWithMe
  - 4w. TWO CALCS THAT HAD TO AGREE, AND DID NOT
      → src/plans/schedule.js — the rule, spelled once
  - 4x. A COUNTDOWN MUST BE A DEADLINE, NOT A COUNTER
      → frontend useIntervalTimer.ts — one anchor, no threshold
  - 4u. TWO BUGS IN THE J4 IDEMPOTENCY DESIGN, BOTH FOUND BY RUNNING IT
      → fixed in 010 and generalised by 019: a key that is not in the unique index is decoration
  - 4v. A CHECK THAT PASSES FOR THE WRONG REASON IS A CHECK THAT IS NOT RUNNING
      → evidence rule 1, and now rule 7 as well
  - 4s. THE CLIENT SENDS WHAT IT TYPED; THE SERVER COMPUTES WHAT IT MEANS
      → the rule every money and macro write is built on — 015 and 019 headers
  - 4t. A REORDER SENDS THE WHOLE LIST, AND RENUMBERS FROM ZERO
      → implemented in the plan editor
  - 4r. AN FK ACTION CANNOT BE ALTERED, BUT IT CAN BE MADE UNREACHABLE
      → superseded by migration 018, which proved the sharper version: an FK action IS an UPDATE
  - 4o. A CONSTRAINT VIOLATION IS A 400, AND THE TRIGGER'S OWN WORDS ARE THE MESSAGE
      → implemented as constraintFault() in src/lib/http.js, with the sanitiser rule in its comment
  - 4p. PLANS: THE LINK IS THE AUTHORITY, NOT THE AUTHORSHIP
      → a CONTRACT in section 2, and the shape of COACH_PLAN in three route files
  - 4m. A BATCH REPLACE THAT REPORTS SUCCESS CAN STILL HIT THE WRONG TABLE
      → fixed; one-off
  - 4n. REWINDING A MIGRATION IS LEGITIMATE EXACTLY ONCE
      → one-off, and it was that once
  - 4l. J4 SCHEMA RESEARCH IS ON DISK — READ IT BEFORE WRITING MIGRATION 010
      → migration 010 shipped; the distillation is docs/pipeline/phase-2/j4-schema-constraints.md
  - 4j. THREE GATES ADDED THIS SESSION, EACH FROM A REAL FAILURE
      → the gates exist and run in the build — check-routes, check-worker-tx, check-tokens
  - 4h. TWO NAMES THAT RESOLVED TO NOTHING
      → fixed; the class is now caught by check-i18n
  - 4f. THE STALE-CLOSURE BUG THAT COST A REAL ANSWER
      → fixed; one-off
  - 4c. LATE GOTCHA
      → superseded

The Phase 1–4 lessons proper are in the cold brain and mirrored to the vault:
[[0010-phase-2-lessons]] · [[0011-phase-3-lessons]] · [[0012-phase-4-lessons]] ·
[[0013-phase-5-lessons]].

WHAT WAS KEPT, and why it is not the same kind of thing: 4z (a snapshot is a display value, not a
fallback), 4q (a security predicate with two copies has one that is wrong), 4g (403 is for roles,
404 is for objects), 4i (reference data belongs in a migration), 4k (a language-dependent fetch
needs the language in the query KEY), 4e (restart the backend after adding a router — which bit
this session twice), 4d (what the browser pane cannot measure) and 4b (the owner's sync
instruction). Each is something a future job must know BEFORE writing code, and none is deducible
from the code once written.

**The evidence rules, now seven:**

  1. A test never seen to fail is not evidence.
  2. A screenshot is evidence of a frame; a measurement is evidence of a fact.
  3. An audit you run once is a snapshot; a gate is what keeps being true.
  4. An audit must not carry its own copy of what it audits.
  5. A path exercised only one way is one untested branch from never having worked.
  6. A probe never seen to fire cannot be told apart from a clean subject.
  7. A clean result is a statement about coverage before it is a statement about the subject.

Rule 4 was broken by its own author this phase: the `ach:<id>` key defect was fixed in the
migration comment and in verify-019's copy of the SQL, and left wrong in the only place that runs.
Rule 7 was earned by `/settings`, which four phases reported clean without walking it.

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

## 4e. RESTART THE BACKEND AFTER ADDING A ROUTER

New routes 404 until `server.js` restarts, and `pkill -f "node server.js"` does NOT reliably
kill it here. Free the port instead:

    Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

This has cost time three separate times. The frontend hot-reloads; the backend does not.

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


