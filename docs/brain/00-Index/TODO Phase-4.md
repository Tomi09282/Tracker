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
- [ ] **T4.1.1** `nutrition_plans` → `nutrition_plan_days` → `meals` → `meal_items` (food_id, grams, macro snapshot) — `pending` · snapshot so history survives food-DB edits
- [ ] **T4.1.2** `foods` table + FTS5 search shadow — `pending`
- [ ] **T4.1.3** USDA FoodData Central seed/proxy with cached searches (decision D-4A) — `pending`
- [ ] **T4.1.4** SSRF guard: outbound USDA fetches only to an allowlisted host, URL validated, never a user-supplied URL — `pending`
- [ ] **T4.1.5** Daily kcal + protein/carb/fat targets per plan day — `pending`
- [ ] **T4.1.6** Adherence view (logged vs target) — `pending`
- [ ] **T4.1.7** Nutrition card on Today/Home — kcal ring E16D + macro bars — `pending` · blueprint 2
- [ ] **T4.1.8** Coach edits client nutrition from the client-detail Nutrition tab — `pending`
- [ ] **T4.1.9** OpenFoodFacts / barcode — `pending` · explicitly deferred (D-4A)
- [ ] **T4.1.10** All macro totals recomputed server-side from grams; client-sent totals ignored — `pending` · never trust the client

## F10 — Progress & measurements
- [ ] **T4.2.1** `measurements` (weight, body fat %, circumferences, measured_at) — `pending`
- [ ] **T4.2.2** `progress_photos` with privacy control + coach visibility opt-in — `pending`
- [ ] **T4.2.3** Photo storage through the hardened media pipeline; **sensitive category** — stricter access checks than exercise media — `pending`
- [ ] **T4.2.4** Trend charts for weight / body fat / circumferences — `pending`
- [ ] **T4.2.5** Unified Progress tab joining F3 exercise graphs with body metrics — `pending`
- [ ] **T4.2.6** Empty states + skeletons for every chart (no blank axis frames) — `pending`

## Security
- [ ] **T4.3.1** Health data is a sensitive GDPR category — access logging on progress-photo reads — `pending`
- [ ] **T4.3.2** Coach visibility is opt-in and revocable; revoking cuts access immediately — `pending`
- [ ] **T4.3.3** Ownership re-validation on every measurement/photo read and write — `pending`
- [ ] **T4.3.4** Abuse-path trace + security regression tests — `pending`

## Phase gate
- [ ] **T4.4.1** build + smoke + `npm audit` green — `pending`
- [ ] **T4.4.2** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T4.4.3** Webview E2E ✅/❌ matrix — `pending`
- [ ] **T4.4.4** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-3]] · [[TODO Phase-5]]
