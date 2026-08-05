---
type: todo-phase
phase: 5
title: TODO — Phase 5 (F7 coins + store + F12 gamification + marketplace)
status: pending
updated: 2026-08-04
tags: [todo, phase-5, critical-endpoints]
---

# Phase 5 TODO — coins · store · gamification · template marketplace

Parent: [[TODO Master]] · Previous: [[TODO Phase-4]]

> [!danger] CRITICAL PHASE
> Every coin movement is a **money-class** endpoint. Build from the webdev-standards
> `transaction-endpoints` template and run its **mandatory 5-pass adversarial checklist**
> (forge / replay / race / IDOR / extremes) on each one before considering it done.
> One business effect exactly once — no exceptions.

## P0 — Kickoff
- [ ] **T5.0.1** Read `webdev-standards/references/transaction-endpoints.md` + `correctness-money-time.md` before any code — `pending`
- [ ] **T5.0.2** SHARED_MEMORY reset; declare the money type + idempotency mechanism as CONTRACTS — `pending`
- [ ] **T5.0.3** ui-ux-pro-max `--design-system` + `--domain ux` + `--domain chart` (coin velocity stats) — `pending` · SO-4
- [ ] **T5.0.4** `docs/pipeline/phase-5/spec.md` with job slicing + budget lines — `pending`

## F7 — Coin currency (owner req 8, decision D-1A earn-only)
- [ ] **T5.1.1** `coin_ledger` append-only (amount ±, reason, ref_type, ref_id, idempotency_key UNIQUE, created_at) — `pending` · never updated, never deleted
- [ ] **T5.1.2** `coin_wallets` cached balance, only ever written inside the same tx as the ledger row — `pending`
- [ ] **T5.1.3** Integer minor units for every amount; no floats anywhere in the money path — `pending`
- [ ] **T5.1.4** Named atomic worker transaction per operation — never the generic `writeTx` — `pending`
- [ ] **T5.1.5** Guards live INSIDE the UPDATE (`WHERE balance >= ?`), not in a preceding SELECT — `pending` · race defense
- [ ] **T5.1.6** Idempotency key required on every mutating coin endpoint; replay returns the original result, never a second effect — `pending`
- [ ] **T5.1.7** Balance is ALWAYS recomputed/validated server-side; a client-sent amount or total is never trusted — `pending`
- [ ] **T5.1.8** `coin_store_items` + `coin_purchases` (idempotent purchase endpoint) — `pending`
- [ ] **T5.1.9** Admin coin adjustment — audited endpoint only, DB-side role re-check at execution time — `pending`
- [ ] **T5.1.10** Every coin event written to `audit_log` with actor + request_id — `pending`
- [ ] **T5.1.11** Rate limits on all coin endpoints (per-IP + per-account composite) — `pending`
- [ ] **T5.1.12** Real-money top-up + payout — `pending` · explicitly deferred (D-1A / D-2A)

### 5-pass adversarial checklist — run per money endpoint
- [ ] **T5.2.1** FORGE — every client-supplied field re-derived or ownership-checked server-side — `pending`
- [ ] **T5.2.2** REPLAY — same idempotency key twice ⇒ exactly one effect — `pending`
- [ ] **T5.2.3** RACE — N parallel requests against one balance ⇒ no oversend, no negative balance — `pending`
- [ ] **T5.2.4** IDOR — another user's wallet/purchase id ⇒ 404, never data — `pending`
- [ ] **T5.2.5** EXTREMES — 0, negative, max int, huge quantity, unicode reason strings — `pending`
- [ ] **T5.2.6** All five frozen as permanent security regression tests — `pending`

## F12 — Gamification
- [ ] **T5.3.1** `achievements` + `user_achievements` — `pending`
- [ ] **T5.3.2** Achievement coin rewards flow through the SAME idempotent ledger path — `pending` · no side channel
- [ ] **T5.3.3** Streak counters for workout + nutrition adherence — `pending`
- [ ] **T5.3.4** E25 coin variants (odometer, fly-to-wallet, pulse, breakdown sheet, milestone banner) — `pending`
- [ ] **T5.3.5** E26 streak/achievement variants (flame flicker, unlock overlay, next tease, streak freeze, confetti finale) — `pending`
- [ ] **T5.3.6** Celebration toggleable in settings; `prefers-reduced-motion` respected — `pending`
- [ ] **T5.3.7** Leaderboard — `pending` · explicitly reserved for later

## Marketplace & theme shop
- [ ] **T5.4.1** Coaches sell plan templates for coins, with app commission computed server-side — `pending`
- [ ] **T5.4.2** Purchase grants a template copy atomically with the ledger debit — `pending`
- [ ] **T5.4.3** Premium theme packs as coin store items (F14 tie-in) — `pending`
- [ ] **T5.4.4** Owning a premium theme is checked server-side on theme apply, not client-side — `pending`

## Phase gate
- [ ] **T5.5.1** build + smoke + `npm audit` green — `pending`
- [ ] **T5.5.2** Security checklist per-endpoint gate walked for EVERY coin route — `pending`
- [ ] **T5.5.3** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T5.5.4** Webview E2E ✅/❌ matrix incl. replay + race attempts — `pending`
- [ ] **T5.5.5** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-4]] · [[TODO Phase-6]]
