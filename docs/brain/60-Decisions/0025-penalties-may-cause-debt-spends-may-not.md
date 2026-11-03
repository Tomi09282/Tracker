---
type: adr
title: ADR-0025 The balance may go negative through penalties; a spend must always be covered
status: accepted
date: 2026-11-03
tags: [decision, adr, lifeos, coins, money, backend]
---

# ADR-0025 — Penalties may cause debt, spends may not

**Context.** Migration 019 made the coin wallet a floor-at-zero balance (`trg_coin_ledger_never_negative`).
LifeOS added penalties (a missed habit, a relapse, an overdue task) and reversals (a reopened task
gives its pay back). If a penalty had to stop at zero, a user at zero would be immune to penalties
and could farm the next award; if a reversal stopped at zero, completing and reopening a task after
spending its coins would mint money. The owner approved the economy sheet on 2026-10-18:
"penalties may take the balance below zero (shown as debt), spends may not".

## Decision

1. **The floor is on spends, not on the balance.** Migration 031 dropped
   `trg_coin_ledger_never_negative` and created `trg_coin_ledger_spend_covered`: a ledger row whose
   reason is marked `spend = 1` in `coin_reasons` is refused when it would take the wallet below
   zero. Penalties, reversals and admin credits are not spends.
2. **What counts as a spend**: a store purchase, a reward redemption (migration 033 — "a reward is
   never bought on debt", `409 INSUFFICIENT`), and an admin debit (it may not overdraw).
3. **Every amount is integer minor units** (1 coin = 100), recomputed on the server; the client
   never sends an amount.
4. **The screens say it plainly**: Érmék shows a negative balance as debt ("TARTOZÁS",
   design round B `coins-1v2-debt`); a redemption the balance does not cover is refused with
   `409 INSUFFICIENT` (checked end to end on 2026-11-03).

## Consequences

- An admin credit to an account in debt lands even when it does not clear the debt.
- The trigger is a database backstop: the named worker transactions check the balance first and
  answer `INSUFFICIENT`, so the trigger fires only if a route forgets.
- `verify-031` / `verify-033` and the smoke's forge / race passes prove both sides (2026-11-03:
  verify-031 84 passed, verify-033 128 passed, smoke 806 passed).
