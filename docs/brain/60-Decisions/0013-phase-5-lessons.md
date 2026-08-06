---
type: decision
title: Phase 5 lessons — money, and the audit that audited its own copy
status: accepted
date: 2026-08-06
tags: [phase-5, lessons, coins, money, security]
---

# Phase 5 lessons

Distilled at the phase close. Same job as [[0012-phase-4-lessons]].

## Build less, and let the attack decide what

Three designs, five adversarial lenses, **75 defects — one fatal, twenty severe, thirteen that
could not have been fixed afterwards** because SQLite cannot alter a CHECK or an FK.

The useful signal was not any single defect. **Thirteen of the twenty-one fatal-and-severe findings
sat in the marketplace**, so the marketplace was deleted — and deleting it removed thirteen defects
without writing one fix. That is migration 013's lesson, arriving a second time with a bigger
number attached.

The fatal one was verified against the real file rather than taken on trust:
`trg_plan_source_owned_ins` (010:1256) requires `source_plan_id` to name a plan the SAME author
wrote, so every template purchase — where a buyer receives a copy of a seller's plan — would have
aborted. Nobody would have found that from the design document.

**Verify the agent's citation before you act on it.** Three of the four claims that changed the
scope of this phase were checked line by line, and all three held; the discipline is not distrust,
it is that a plan built on an unverified line is a plan with one unverified line in its foundation.

## The audit carried its own copy of what it audits, and I wrote that rule

The `ach:<id>` idempotency key was five characters against an eight-character floor. It was found
once, on the first probe run, and fixed **in the migration comment and in `verify-019`** — which
carries its own copy of the SQL so the schema can be attacked without a server.

The actual worker was left wrong. **The probe went green over a production path that aborted on
every single unlock.**

That is evidence rule four, broken by the person who had written it down one phase earlier. Where a
probe must hold a copy, the copy has to be labelled as one and something else has to exercise the
real path — which is now what the smoke suite does.

## A catch that turns an error into a plausible value

`.catch(() => ({ n: 0 }))` around a query with a wrong column name. The query threw on every call
and `pr.first` was silently unearnable forever, reporting a number that looked exactly like "no
records yet".

**That is not resilience; it is a defect given somewhere to hide.** The fire-and-forget decision
belongs at the CALL site, where it is visible and where the failure is logged.

Both this and the key defect surfaced only because the evaluator logged its failure instead of
dying quietly — which is the one thing the swallowing catch would have prevented.

## Machinery gets built; the two lines that call it do not

Migration 019 shipped the achievement catalogue, `user_achievements`, `unlockAchievementTx` and the
ledger path they pay through. **Nothing called any of it.** Every piece was correct, reviewed and
attacked, and the feature did not exist.

The interesting part attracts the attention. The invocation is nobody's idea of work, and it is the
whole difference between a system and a demo. The assertion that catches it is now permanent.

## Money rules worth carrying beyond this phase

- **The balance has exactly one representation**, a cache of `SUM(ledger)`, written only by a
  recompute trigger and refused by a truthfulness trigger if it is anything else. The rejected
  alternative stored a running balance per row: two representations, and once they diverge NO value
  satisfies both triggers, so the account is permanently unable to earn or spend and the repair is
  blocked too. **Loud-and-recoverable beats elegant-and-bricked.**
- **The reason decides the movement.** Direction and ceiling are DATA, so "spend a negative amount
  to mint" is unrepresentable rather than refused, and a new movement type is an INSERT.
- **Non-negativity is a TRIGGER, not a CHECK, and it lives on the ledger INSERT.** On the wallet it
  would also fire from a cascade, and a user whose credit is deleted before their debit would
  momentarily recompute negative and abort their own account deletion.
- **The idempotency key is composed by the SERVER** as `<scope>:<actor>:<clientKey>`, with `:`
  excluded by every route regex and permitted by the column. That asymmetry IS the namespace
  separation, and it is the only thing stopping a client occupying a server slot.
- **One closure reads the result off the stored rows and both the fresh and the replay path call
  it.** A replayed response is byte-identical by construction. One candidate design's fresh path
  reported a JS variable it had never SELECTed while its replay path reported the row.
- **The client mints the idempotency key when the user TAPS, not inside the mutation**, where a
  retry would generate a fresh one and turn one intent into two purchases — the server's machinery
  defeated from the client, which is where it is easiest to defeat and hardest to notice.
- **Streaks are computed, never stored**, and ending YESTERDAY counts. A counter needs a nightly job
  to break it and is wrong every hour that job is late.

## An audit covers what it walks

`/settings` reported ten pure-black foregrounds — pre-existing since Phase 1, defensible
(`readableOn` picks black or white for maximum contrast on a user-chosen accent), and reported
clean by four previous phases **because none of them had walked that route**.

The rows were true about what they measured. The matrix now says ROUTES WALKED rather than
implying the product, because a clean row is a statement about coverage before it is a statement
about the app.

## Gates gained a direction

`check-i18n` had a blind side that its own header described. This phase it caught seven live
strings reported as dead, because `t(a.titleKey)` takes its key from the server and nothing static
can see it. **The fix was not an exemption list** — that is how `NATIVE_LABELS` ended up guarding
nothing for two phases — it was writing the literal prefix so the gate stays honest.

## The evidence rules, now seven

1. A test never seen to fail is not evidence.
2. A screenshot is evidence of a frame; a measurement is evidence of a fact.
3. An audit you run once is a snapshot; a gate is what keeps being true.
4. An audit must not carry its own copy of what it audits.
5. A path exercised only one way is one untested branch from never having worked.
6. A probe never seen to fire cannot be told apart from a clean subject.
7. **A clean result is a statement about coverage before it is a statement about the subject.**

And the corollary from Phase 4 still holds: a gate is only a gate in the directions it checks.
