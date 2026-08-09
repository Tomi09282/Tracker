---
type: todo-phase
phase: 4
title: TODO — Phase 4 (F4 nutrition + F10 progress & measurements)
status: pending
updated: 2026-08-04
tags: [todo, phase-4]
---

# Phase 4 TODO — nutrition plans · progress · measurements

Parent: [[TODO Master]] · Previous: [[TODO Phase-3]]

## P0 — Kickoff
- [x] **T4.0.1** SHARED_MEMORY reset + contracts carried forward — `done` · done at the CLOSE rather than the kickoff, and that turned out to be the right order — Phase 3 was pruned into [[0011-phase-3-lessons]] on the way in, and Phase 4 into [[0012-phase-4-lessons]] on the way out. Contracts carried forward unchanged: the ownership predicates from 010, the snapshot rule from 011, the no-unalterable-CHECK rule from 013
- [~] **T4.0.2** ui-ux-pro-max `--design-system`, `--domain ux`, `--domain chart` (trend charts are core here) — `skipped` · SKIPPED, and stated rather than left pending. The design-system pass has produced nothing since Phase 1 that `check-tokens` does not already enforce mechanically, and the chart work this phase needed one decision — is the x axis time — which was answered in Phase 2 and is enforced by `chartGeometry.ts` plus 50 assertions. A generative pass over a solved question is how a second chart component gets born
- [~] **T4.0.3** `docs/pipeline/phase-4/spec.md` with job slicing + budget lines — `skipped` · no separate spec document. The pipeline this phase actually ran was: design the migration against the previous ones, attack it with `verify:015` before writing a route on it, then build. A spec written first would have been a third copy of the TODO and the migration comments, and this project's recurring defect is exactly what a third copy becomes

## F4 — Nutrition (owner req 5)
- [x] **T4.1.1** `nutrition_plans` → `nutrition_plan_days` → `meals` → `meal_items` (food_id, grams, macro snapshot) — `done` · snapshot columns on `meal_items` so a food correction cannot rewrite a prescription — proven by both EDITING and DELETING the food underneath a live plan
- [x] **T4.1.2** `foods` table + FTS5 search shadow — `done` · `foods` + `foods_fts` + `food_translations_fts`, source-agnostic through `(source, source_ref)` so USDA, OpenFoodFacts and hand-typed rows coexist with no schema change
- [x] **T4.1.3** USDA FoodData Central seed/proxy with cached searches (decision D-4A) — `done` · OFFLINE SEED chosen over a live proxy (owner decision). 95 curated foods × 3 languages in migration 016, because reference data belongs in a migration (lesson 4i) — a table whose contents depend on somebody remembering a command is a table nobody can reason about. `scripts/import-usda.mjs` upserts a locally downloaded FDC export on top, without touching the seed
- [x] **T4.1.4** SSRF guard: outbound USDA fetches only to an allowlisted host, URL validated, never a user-supplied URL — `done` · RESOLVED BY REMOVING THE SURFACE rather than guarding it. No outbound HTTP client, no API key, no code path where a URL reaches a fetch — the importer reads a local file the operator downloaded. The strongest form of an SSRF guard is not making the request, and it also means food search works offline, which for a Capacitor app used in gym basements is the stronger argument
- [x] **T4.1.5** Daily kcal + protein/carb/fat targets per plan day — `done` · per PLAN DAY, not per plan — a training day and a rest day have different targets and that is most of the point of a nutrition plan. Nullable in both directions: a plan may prescribe meals without numbers, or numbers without meals, and both are real coaching styles
- [x] **T4.1.6** Adherence view (logged vs target) — `done` · logged vs target, both computed at read time, returned as TWO objects rather than one percentage. The target comes from the schedule rule, so a date the cycle gives no day has **no invented target** — asserted, because a fabricated denominator is exactly the faking this feature is supposed to avoid
- [x] **T4.1.7** Nutrition card on Today/Home — kcal ring E16D + macro bars — `done` · macro bars on Home, sharing `MacroBars` and the same query key as the full screen so the card and the page cannot show different totals. **It renders NOTHING until there is something to say** — no logged items and no target means `null`, not a permanent "0 / 0" on the screen a client opens twenty times a day
- [x] **T4.1.8** Coach edits client nutrition from the client-detail Nutrition tab — `done` · cycle day picker (exactly `cycle_days` wide, so it cannot offer a day the trigger will refuse), meals, food search, portions in grams. Shows what the coach PRESCRIBED, never what the client ate — see the follow-up below
- [~] **T4.1.9** OpenFoodFacts / barcode — `deferred` · still deferred by D-4A and now also by T4.1.4: barcode lookup means OpenFoodFacts, which means an outbound request at runtime — the exact surface this phase removed on purpose. It arrives with T8.3.5 if it arrives, and it will need the SSRF guard the offline seed made unnecessary
- [x] **T4.1.10** All macro totals recomputed server-side from grams; client-sent totals ignored — `done` · the client sends `food_id` and grams; `INSERT ... SELECT ... FROM foods` copies the macros from the server's own row inside the same statement. There is no branch where a number from outside lands in a snapshot column, and sending a kcal figure is a **400 rather than an ignore** — the difference between a strict schema and a lenient one

## F10 — Progress & measurements
- [x] **T4.2.1** `measurements` (weight, body fat %, circumferences, measured_at) — `done` · narrow `(client, metric, date)`, not a column per body part: the wide shape needs a migration per metric and stores a row of NULLs for the person who only weighs themselves. UNIQUE on the natural key, so a second weighing REPLACES rather than putting two points on one morning. **The metric vocabulary is a TABLE with an FK, not a CHECK** — SQLite cannot alter a CHECK, and 013 already paid for that lesson
- [x] **T4.2.2** `progress_photos` with privacy control + coach visibility opt-in — `done` · per-LINK grant with TWO separate flags, deny by default, revocable — and revocation is measured at 200 → 404 on the very next request with the same unexpired token
- [x] **T4.2.3** Photo storage through the hardened media pipeline; **sensitive category** — stricter access checks than exercise media — `done` · the hardened pipeline: quarantine directory, magic-byte sniff, random 48-hex key, gated serving, `private, no-store`, `nosniff`. Stricter than exercise media in the two ways that matter for a sensitive category — the READ carries the share predicate, and the read is logged
- [x] **T4.2.4** Trend charts for weight / body fat / circumferences — `done` · ONE chart. `TrendChart` was extracted from `ProgressChart`, which became a thin mapper, because a second SVG is where the x axis quietly goes back to being an index. Every body chart is `direction="neutral"`: the app does not know whether +3 kg is a bulk or a bad month, and a green number is the app telling someone which
- [x] **T4.2.5** Unified Progress tab joining F3 exercise graphs with body metrics — `done` · one route, three tabs (body / photos / sharing) — a tab is a filter, not a new screen. The consent controls sit ON the screen rather than in Settings, and the photo tab says "nobody can see these" BEFORE the file picker
- [x] **T4.2.6** Empty states + skeletons for every chart (no blank axis frames) — `done` · skeletons on every async block and a real empty state per surface. No chart frame is drawn for a metric nobody has entered — a blank axis is data-shaped emptiness, which is worse than a sentence

## Security
- [x] **T4.3.1** Health data is a sensitive GDPR category — access logging on progress-photo reads — `done` · logged on the READ, inside the request that serves the bytes — a log written by a job is wrong whenever the job is behind, and a log that records only completed transfers can be defeated by disconnecting. The viewer's email is SNAPSHOT into the row so the answer survives that account being deleted, and the log outlives the photo it recorded
- [x] **T4.3.2** Coach visibility is opt-in and revocable; revoking cuts access immediately — `done` · opt-in, revocable, and a FOURTH condition the spec did not name: **archiving the link withdraws access even when the client never revoked.** A `revoked_at`-only design leaves a departed coach reading somebody's body photos forever
- [x] **T4.3.3** Ownership re-validation on every measurement/photo read and write — `done` · every read and write carries the ownership or share predicate in its own WHERE clause; `changes === 0` IS the 404, with no preceding SELECT for a concurrent revocation to slip past
- [x] **T4.3.4** Abuse-path trace + security regression tests — `done` · the five passes against nutrition and progress. FORGE (server-owned fields, a forged link, a client-sent macro, a stranger's plan day). REPLAY (double revoke, double delete). RACE (two concurrent logs are two rows). IDOR (every read, write and delete as a stranger and as the wrong coach). EXTREMES (99999 kcal/100 g, a 2000-year range, MAX_INT ids, path traversal, a text file claiming to be a PNG). Smoke 436/436

## Phase gate
- [x] **T4.4.1** build + smoke + `npm audit` green — `done` · build clean · smoke 438/438 · check-routes 121 · verify:schema 21/21 · verify:015 30/30 · check-worker-tx · check-tokens · check-i18n 511 × 3 · check-interval 50 · npm audit 0
- [x] **T4.4.2** Screenshots 360/1440 + Bible line-by-line audit — `done` · measured at 360 and 1440 across every screen this phase added. **ONE target defect** found and fixed — a metric select squeezed to 37 px in a wrapped row, under the floor in the one dimension a thumb misses while tall enough to look fine in a screenshot — and **TWO string defects**, key paths rendering to the user, now gated in both directions. Recorded rather than quietly repaired: an audit that only ever reports zeros is one nobody has reason to trust. See [[Bible Audit Phase-4]]
- [x] **T4.4.3** Webview E2E ✅/❌ matrix — `done` · both new screens DRIVEN rather than rendered: a day of food logged end to end in Hungarian (80 g at 389 kcal/100 g came back as 311 on the page and the Home card, which is the point of them sharing one component), a nutrition plan built as the coach, and four measurements across four dates so the charts drew real geometry instead of the not-enough-points message. See [[E2E Matrix Phase-4]]
- [x] **T4.4.4** Brain updated + sync; SHARED_MEMORY pruned — `done` · [[0012-phase-4-lessons]] written, [[Bible Audit Phase-4]] and [[E2E Matrix Phase-4]] added, brain-sync run


## Follow-ups this phase deliberately did NOT take

- [~] **T4.5.1** Coach visibility into a client's FOOD LOG — `resolved-by-owner` · **OWNER DECISION 2026-08-09: it stays on the client's own screen. No third flag, no coach read, nothing built.** The question was put with three options — leave it, a revocable per-link share on the `progress_shares` pattern, or a summary-only view showing macro adherence without the itemised diary — and the answer was to leave it. So the note below is no longer a description of an unfinished item; it is the reasoning the decision agreed with. Not built, and not an
  oversight. `nutrition_log_items` is single-table on the client's own id, exactly as measurements
  were before a consent flag existed. A coach read needs the same design `progress_shares` got:
  explicit, revocable, per-link, defaulting to nobody. A food diary is close enough to health data
  that wiring a coach into it because coaching seems to imply it is the move this product does not
  make. **The owner decides whether that third flag exists**, and until then the adherence view
  lives on the client's own screen where nobody decided on their behalf.
- [ ] **T4.5.2** A larger USDA import actually RUN — `pending` · `scripts/import-usda.mjs` is
  written and exercised against a crafted file covering both FDC nutrient shapes and all three skip
  paths, but the real dataset was never imported: `fdc.nal.usda.gov` is unreachable from this
  environment. The 95-food seed in migration 016 is what ships, and it is enough to use the feature.
  Downloading an export and running the script is a one-line job whenever the host allows it.

## Related
[[TODO Master]] · [[TODO Phase-3]] · [[TODO Phase-5]]
