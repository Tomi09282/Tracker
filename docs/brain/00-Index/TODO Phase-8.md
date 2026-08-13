---
type: todo-phase
phase: 8
title: TODO — Phase 8 (later bucket)
status: pending
updated: 2026-08-04
tags: [todo, phase-8, later-bucket]
---

# Phase 8 TODO — later bucket

Parent: [[TODO Master]] · Previous: [[TODO Phase-7]]

> [!caution] Do not start any of this early
> Everything here is explicitly deferred. Building any of it before Phase 8 is feature
> creep and counts as a rework violation.

## F13 — Health sync
- [ ] **T8.1.1** Apple Health via Capacitor plugin — `pending`
- [ ] **T8.1.2** Google Fit via Capacitor plugin — `pending`
- [ ] **T8.1.3** Permission flows + granular user consent — `pending` · sensitive health category
- [ ] **T8.1.4** Conflict resolution between synced and manually logged data — `pending`

## Payment processor (decision D-2A)
- [x] **T8.2.1** Choose the processor — `done` · **Stripe (Connect + Billing)**, recorded as [[60-Decisions/0014-payment-processor|ADR-0014]]. Decided by ONE question, not by fee tables: money going OUT to coaches makes this a platform, and a Merchant-of-Record (Paddle/Lemon Squeezy) cannot pay third parties — a capability wall, not a preference. Mangopay rejected on DX, Adyen on stage, Barion on cross-border reach. Costs accepted deliberately: coach KYC becomes a product surface, and EU VAT/OSS on subscription revenue stays ours (the burden the MoR route would have removed)
- [ ] **T8.2.2** Coach subscription billing — `pending`
- [x] **T8.2.3** Per-coach client seat cap enforcement wired to the subscription tier — `done` · enforced at "add a client", NEVER at "have clients" — a tier can drop without consent (failed card), so a billing event must not dissolve a relationship. Both link paths guarded (`redeemInviteTx` and the rewritten `pregenerateClientTx`); `verify:seats` 20/20, each guard mutation-proven. **The FREE tier cap of 3 is still my placeholder, not a decision** — see the note in 026
- [ ] **T8.2.4** Coin real-money top-up — `pending` · D-1A lift
- [ ] **T8.2.5** Marketplace payout to coaches — `pending` · D-1A lift
- [ ] **T8.2.6** Inbound webhook hardening — raw-body constant-time signature verify, timestamp + event-id replay defense, verify-then-parse — `pending`
- [ ] **T8.2.7** Full 5-pass adversarial checklist on every payment endpoint — `pending`

## Parked — do NOT build
- [ ] **T8.3.1** White-label coach branding — `blocked` · explicitly parked by the owner
- [ ] **T8.3.2** Leaderboard (F12) — `pending` · reserved for later
- [ ] **T8.3.3** WebSocket chat upgrade (D-5A) — `pending` · path documented in Phase 3, not built
- [ ] **T8.3.4** FCM/APNs push (D-8A) — `pending` · `push_devices` table exists inert
- [ ] **T8.3.5** OpenFoodFacts / barcode scanning (D-4A) — `pending`
- [ ] **T8.3.6** Muscle map gender/body variants + 3D rotation — `pending`

## Related
[[TODO Master]] · [[TODO Phase-7]]
