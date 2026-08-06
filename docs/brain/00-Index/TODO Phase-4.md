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
- [ ] **T4.0.1** SHARED_MEMORY reset + contracts carried forward — `pending`
- [ ] **T4.0.2** ui-ux-pro-max `--design-system`, `--domain ux`, `--domain chart` (trend charts are core here) — `pending` · SO-4
- [ ] **T4.0.3** `docs/pipeline/phase-4/spec.md` with job slicing + budget lines — `pending`

## F4 — Nutrition (owner req 5)
- [x] **T4.1.1** `nutrition_plans` → `nutrition_plan_days` → `meals` → `meal_items` (food_id, grams, macro snapshot) — `done` · snapshot columns on `meal_items` so a food correction cannot rewrite a prescription — proven by both EDITING and DELETING the food underneath a live plan
- [x] **T4.1.2** `foods` table + FTS5 search shadow — `done` · `foods` + `foods_fts` + `food_translations_fts`, source-agnostic through `(source, source_ref)` so USDA, OpenFoodFacts and hand-typed rows coexist with no schema change
- [x] **T4.1.3** USDA FoodData Central seed/proxy with cached searches (decision D-4A) — `done` · OFFLINE SEED chosen over a live proxy (owner decision). 95 curated foods × 3 languages in migration 016, because reference data belongs in a migration (lesson 4i) — a table whose contents depend on somebody remembering a command is a table nobody can reason about. `scripts/import-usda.mjs` upserts a locally downloaded FDC export on top, without touching the seed
- [x] **T4.1.4** SSRF guard: outbound USDA fetches only to an allowlisted host, URL validated, never a user-supplied URL — `done` · RESOLVED BY REMOVING THE SURFACE rather than guarding it. No outbound HTTP client, no API key, no code path where a URL reaches a fetch — the importer reads a local file the operator downloaded. The strongest form of an SSRF guard is not making the request, and it also means food search works offline, which for a Capacitor app used in gym basements is the stronger argument
- [x] **T4.1.5** Daily kcal + protein/carb/fat targets per plan day — `done` · per PLAN DAY, not per plan — a training day and a rest day have different targets and that is most of the point of a nutrition plan. Nullable in both directions: a plan may prescribe meals without numbers, or numbers without meals, and both are real coaching styles
- [x] **T4.1.6** Adherence view (logged vs target) — `done` · logged vs target, both computed at read time, returned as TWO objects rather than one percentage. The target comes from the schedule rule, so a date the cycle gives no day has **no invented target** — asserted, because a fabricated denominator is exactly the faking this feature is supposed to avoid
- [ ] **T4.1.7** Nutrition card on Today/Home — kcal ring E16D + macro bars — `pending` · frontend
- [ ] **T4.1.8** Coach edits client nutrition from the client-detail Nutrition tab — `pending` · frontend
- [ ] **T4.1.9** OpenFoodFacts / barcode — `pending` · explicitly deferred (D-4A)
- [x] **T4.1.10** All macro totals recomputed server-side from grams; client-sent totals ignored — `done` · the client sends `food_id` and grams; `INSERT ... SELECT ... FROM foods` copies the macros from the server's own row inside the same statement. There is no branch where a number from outside lands in a snapshot column, and sending a kcal figure is a **400 rather than an ignore** — the difference between a strict schema and a lenient one

## F10 — Progress & measurements
- [x] **T4.2.1** `measurements` (weight, body fat %, circumferences, measured_at) — `done` · narrow `(client, metric, date)`, not a column per body part: the wide shape needs a migration per metric and stores a row of NULLs for the person who only weighs themselves. UNIQUE on the natural key, so a second weighing REPLACES rather than putting two points on one morning. **The metric vocabulary is a TABLE with an FK, not a CHECK** — SQLite cannot alter a CHECK, and 013 already paid for that lesson
- [x] **T4.2.2** `progress_photos` with privacy control + coach visibility opt-in — `done` · per-LINK grant with TWO separate flags, deny by default, revocable — and revocation is measured at 200 → 404 on the very next request with the same unexpired token
- [x] **T4.2.3** Photo storage through the hardened media pipeline; **sensitive category** — stricter access checks than exercise media — `done` · the hardened pipeline: quarantine directory, magic-byte sniff, random 48-hex key, gated serving, `private, no-store`, `nosniff`. Stricter than exercise media in the two ways that matter for a sensitive category — the READ carries the share predicate, and the read is logged
- [ ] **T4.2.4** Trend charts for weight / body fat / circumferences — `pending` · frontend
- [ ] **T4.2.5** Unified Progress tab joining F3 exercise graphs with body metrics — `pending` · frontend
- [ ] **T4.2.6** Empty states + skeletons for every chart (no blank axis frames) — `pending` · frontend

## Security
- [x] **T4.3.1** Health data is a sensitive GDPR category — access logging on progress-photo reads — `done` · logged on the READ, inside the request that serves the bytes — a log written by a job is wrong whenever the job is behind, and a log that records only completed transfers can be defeated by disconnecting. The viewer's email is SNAPSHOT into the row so the answer survives that account being deleted, and the log outlives the photo it recorded
- [x] **T4.3.2** Coach visibility is opt-in and revocable; revoking cuts access immediately — `done` · opt-in, revocable, and a FOURTH condition the spec did not name: **archiving the link withdraws access even when the client never revoked.** A `revoked_at`-only design leaves a departed coach reading somebody's body photos forever
- [x] **T4.3.3** Ownership re-validation on every measurement/photo read and write — `done` · every read and write carries the ownership or share predicate in its own WHERE clause; `changes === 0` IS the 404, with no preceding SELECT for a concurrent revocation to slip past
- [x] **T4.3.4** Abuse-path trace + security regression tests — `done` · the five passes against nutrition and progress. FORGE (server-owned fields, a forged link, a client-sent macro, a stranger's plan day). REPLAY (double revoke, double delete). RACE (two concurrent logs are two rows). IDOR (every read, write and delete as a stranger and as the wrong coach). EXTREMES (99999 kcal/100 g, a 2000-year range, MAX_INT ids, path traversal, a text file claiming to be a PNG). Smoke 436/436

## Phase gate
- [ ] **T4.4.1** build + smoke + `npm audit` green — `pending`
- [ ] **T4.4.2** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T4.4.3** Webview E2E ✅/❌ matrix — `pending`
- [ ] **T4.4.4** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-3]] · [[TODO Phase-5]]
