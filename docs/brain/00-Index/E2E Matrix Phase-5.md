---
type: report
title: Webview E2E matrix — Phase 5
updated: 2026-08-06
tags: [audit, phase-5, e2e, coins]
---

# Webview E2E matrix — Phase 5 (T5.5.4)

**This table lists ROUTES WALKED, not screens that exist.** Phase 5's audit found a pre-existing
finding on `/settings` that four previous phases had reported clean — because none of them had
walked it. A ✅ is a statement about coverage first.

| route | 360 | 1440 |
|---|---|---|
| `/coins` · Store | ✅ | — |
| `/coins` · Achievements | ✅ | — |
| `/coins` · Statement | ✅ | — |
| `/settings` (theme picker with paid packs) | ⚠️ named exception | — |

## Driven, not rendered

The money path was exercised end to end through the UI as the user:

**600 coins → buy Aurora for 250 → 350 coins.** Aurora then reads *Megvan*, Ember stays
purchasable, and the header balance rolls from the previous value rather than from zero.

## The replay and race attempts the phase gate asks for

These are HTTP-level and live in the smoke suite rather than the browser, because a browser cannot
issue two genuinely concurrent requests with controlled ordering. Both are permanent regression
tests:

- **REPLAY** — the same adjustment twice moves the balance ONCE and reports `replayed: true`, and
  the replayed receipt is **byte-identical** to the original except for that flag, asserted by key
  comparison rather than by eye. The same key with a different amount, or a different item, is 409
  with nothing moved. The same client string on a different endpoint is a real, separate operation.
- **RACE** — two concurrent purchases against exactly one item's worth of coins: **exactly one
  wins**, the balance lands on 0, and exactly one entitlement exists.
- **CASCADE** (schema level) — deleting an account whose credit precedes its debit still succeeds,
  which is why non-negativity lives on the ledger INSERT and not on the wallet UPDATE.

## And the one that would have caught a shipped-but-dead feature

**Finishing a session unlocks `workout.first`, pays 2500 minor, and the reward arrives through the
LEDGER with a reference to the unlock row.** Migration 019 shipped every piece of that and nothing
called any of it; the assertion exists because the feature did not.

A second session does not pay it again — award-once holds against the EVALUATOR, not only against
a duplicate request.

## Not covered

- Real iOS/Android hardware. Chromium in a webview only.
- Screenshots — the pane does not composite in this session.
- 1440 on the coin screens. Single-column lists with no breakpoint behaviour; recorded as
  uncovered rather than assumed fine.
- The admin coin console has no UI yet — the endpoints are exercised from the smoke suite only.
- A ledger long enough to need its cursor. The endpoint pages and the cap is stated; behaviour
  past 50 entries is untested through the UI.
