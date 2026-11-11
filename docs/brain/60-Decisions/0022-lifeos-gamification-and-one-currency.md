---
type: adr
title: ADR-0022 LifeOS reverses the gamification ban; one currency; the economy sheet
status: accepted
date: 2026-10-18
tags: [decision, adr, lifeos, coins, gamification, backend]
---

# ADR-0022 — LifeOS reverses the gamification ban; one currency; the economy sheet

**Context.** Until 2026-10-17 the product's record was "no gamification beyond coins and seven fixed
achievements": no streak number, no XP, no levels, no quests ([[Feature inventory]] listed all of them
as cut or "do not invent"). On 2026-10-17 the owner decided to port the LifeOS features of
`kytrack/f_app` (habits, tasks, day close, calendar, focus, capture, a points ledger with streaks /
freezes / XP / levels, rewards, a daily challenge) into TRACKER, rewritten in the Pulse design. The
approved plan is `C:/Users/Petike/.claude/plans/abundant-booping-willow.md`; the owner's answers are at
the end of `.pulse/owner-answers.md` (2026-10-17 and 2026-10-18).

## Decision

1. **The gamification ban is reversed (owner, 2026-10-17).** Streaks shown as a figure with "NAP",
   streak multipliers, freezes, XP and levels, daily challenges and rewards are now product features.
   The Pulse rule still holds for how they look: no flames, no illustrations — a figure, a lime
   multiplier segment, a mono freeze count, a level figure with a SegmentBar (design round B,
   approved 2026-10-18).
2. **One currency.** Every LifeOS point is a TRACKER coin: 1 point = 1 coin = 100 minor units. There
   is no second balance, no "points" next to "coins". LifeOS movements go through the existing coin
   ledger (migration 019) via a new `coin_events` table (migration 031): an award, a penalty or a
   reversal is an immutable event, and its ledger row points at it (`ref_type 'coin_event'`), so the
   ledger stays append-only and its one-row-per-(reason, ref) index keeps holding.
3. **The rules are admin-global** (`point_rule_sets`, append-only, the newest in force), edited on the
   admin "Szabályok" page (`GET / PUT /admin/rules`, DB-side role re-check, audit, optimistic
   `expectedVersion`). f_app lets every user edit their own rules; with one shared currency that would
   let anyone mint coins.
4. **The economy sheet (owner, 2026-10-18, approved as defaulted in the plan):**

   | Rule | Value |
   |---|---|
   | Exchange | 1 point = 1 coin |
   | Daily earn cap | 400 coins per user per logical day (an admin rule, "Napi plafon"; enforced in `postCoinEvent` and by the `trg_coin_event_daily_cap` backstop) |
   | Negative balance | penalties and reversals may take the balance below zero (shown as debt, "TARTOZÁS"); **spends may not** — `trg_coin_ledger_never_negative` became `trg_coin_ledger_spend_covered` |
   | Settle delay | a day settles 6 h after the next day starts (04:00 start -> yesterday settles at 10:00) |
   | Catch-up | at most 7 past days settle with coins at once; older gaps settle as `lapsed` (no coins, no penalty) |
   | Perfect day | needs the scheduled workout (with no habits yet, a day with no workout scheduled is not perfect) |
   | Pult | `/compose` is a trainer tab |
   | Admin seats | an admin acting as a trainer is seat-exempt (`hasSeat` reads the role from the database) |

5. **The day is the user's.** `user_prefs` (timezone, day start 00 / 02 / 04 / 06, the LifeOS start
   day) has a row per user. The timezone changes at most once per 24 h and every change is audited.
   The day boundary is the WALL CLOCK (`src/lifeos/dates.js`), which differs from f_app on the two DST
   Sundays on purpose (f_app subtracts elapsed hours); the vectors are in `verify-lifeos-rules.mjs`.

## Consequences

- [[Feature inventory]]'s gamification section is rewritten: streaks, XP, levels, the daily challenge
  and rewards move from "cut / do not invent" to "planned (LifeOS)", phase by phase.
- XP is the sum of XP-earning events (`coin_events.xp_minor`), level = floor(sqrt(xp / 100)). A
  reversal takes its XP back; penalties never reduce XP.
- An admin debit still may not overdraw (it is marked as a spend); an admin credit to an account in
  debt now lands even when it does not clear the debt.
- The achievement rewards of 019 are unchanged and do not count as XP.
- **Open for Phase 3:** the f_app default `milestone3Bonus` (500) is above the 400-coin daily cap; as
  built, the cap trims it to the room left that day. The owner may raise the cap, exempt milestones,
  or lower the bonus.
- No push: a day settles when the user's own requests ask (`GET /lifeos/today`, `GET /coins/wallet`),
  never on a timer — the plan's L6.
