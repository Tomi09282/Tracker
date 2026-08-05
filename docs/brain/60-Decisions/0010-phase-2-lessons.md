---
type: decision
title: Phase 2 lessons — the durable half
updated: 2026-08-05
tags: [decision, phase-2, lessons]
---

# Phase 2 lessons — the durable half

`docs/pipeline/SHARED_MEMORY.md` is HOT memory and is deliberately not mirrored to the vault: it is
a working scratchpad that grows during a phase and gets pruned after it. This note is the cold
half — the lessons from Phase 2 that outlive the phase, written so a reader who has never seen the
hot file gets the whole point.

## The one recurring bug class

**Two things that must agree, drifting apart.** Every serious defect this project produced has this
shape. A security predicate in two files. Two hand-written `calc()`s. A filter present in one of two
queries. A schedule rule heading for four copies. A column list repeated in two history endpoints.

The fix is never "fix both" — it is collapsing to ONE definition:

| what | where it lives now |
|---|---|
| exercise visibility | `backend/src/exercises/visibility.js` |
| the schedule rule + calendar day | `backend/src/plans/schedule.js` |
| who may see/revoke a calendar feed | `OWN_OR_HELD` in `ics.js` |
| what the layout reserves below content | `--content-pad-b` |

The schedule rule is the cautionary tale: it was declared "collapsed" while the ICS generator still
carried a copy, and that copy had already drifted **twice** — it never emitted a day moved onto the
window from before it, and it started its horizon on the SERVER's date rather than the subscriber's.
Neither was visible reading either file alone. **Declaring a duplicate gone is not the same as
deleting it.**

## Widening a permission is three changes, not one

**Widening who can CREATE a thing is not done until who can SEE and DESTROY it widens with it.**

The coach-held ICS feed nearly shipped where a coach could mint a durable bearer URL to a client's
schedule and then never see it again, let alone revoke it — because the list and revoke were still
scoped to `user_id`, and on that row `user_id` is the CLIENT.

## Idempotency: put the state in the WHERE clause

A replay should report zero changes, not raise. Both of Phase 2's new state transitions follow it:

- **Void** is guarded on `voided_at IS NULL`; a second void reports `replayed: true` and answers
  200. It carries no values to disagree about, so the state the second tap asks for is the state
  that already exists — this is the one write in the codebase deliberately without a `write_uid`.
- **Finish** is guarded on `status = 'in_progress'`, which turns what would be a raised
  `trg_log_frozen` (surfacing as a 400 about the data model) into an honest 404.

## Do not re-implement what the schema already owns

The void transaction does **not** recompute session rollups: `trg_log_rollup_recompute_upd` rebuilds
them as `SELECT SUM(...) WHERE voided_at IS NULL` on any set update. Measured — voiding a 110 kg × 5
set moved the session 1525 kg → 975 kg with the transaction touching no total.

Corollary found the hard way: **within a day, voiding a personal record does not restore the
previous one.** The day-unique index means a same-session beat UPDATES the day's event rather than
appending beside it, so the earlier value is not stored anywhere. Within a day a record is a
high-water mark, not a stack. This corrected a comment I had already written the other way.

## A round is a set row

HIIT/Tabata needed no migration. `workout_plan_blocks` already carried `rounds`, `rest_seconds` and
`cap_seconds`; the bug was that `b.rounds` was joined and read by nobody, so a `rounds=8` Tabata
materialised as three sets.

Making a round a ROW gives everything downstream for free: checking a round is an UPDATE on a row
that already exists, each round is independently idempotent under its own `write_uid`, an offline
queue is order-independent, and a crash at round 5 resumes from rows 1-4 with zero new server code.

`target_sets` is ignored for a round-based block: a circuit repeats the BLOCK while a set repeats
the EXERCISE, so multiplying them is an incoherent second repetition count.

## Derive everything from one anchor

The interval engine's every value comes from `elapsed() = (pausedAt ?? now) - anchorAt`. Three
separate defects the reviewers found were all the same mistake — a value derived from something
else: pause that did not pause, a resume that produced `NaN`, a countdown de-dup living in render.

**The interruption rule has no time threshold.** The honest discriminator is not how stale a
boundary is, it is whether a segment was ever ANNOUNCED to the lifter.

## Flag, do not filter — and never invent a duration

The onboarding schema says `severity='avoid'` "removes exercises outright". Correct for an automated
builder; wrong for a coach choosing by hand, who may know the knee is fine this week. **An option
that vanishes teaches them nothing.** The picker shows chips and everything stays selectable.

Related: a block whose durations the coach never wrote is `runnable: false` and says so. Guessing
60 seconds would have the client training to a prescription that does not exist.

## Accessibility is not a label on the drawing

A line chart is unreadable to a screen reader however you title it, so the same data renders as a
real (visually hidden) `<table>` — the drawing is a summary of the table, not the other way round.

Similarly, `EmptyState` renders an `h2` because it usually sits inside a screen that has an `h1`.
Where it IS the screen it takes `heading="h1"`. Promoting it everywhere would give other pages two.

## Three cue channels, never one "sounds" switch

`navigator.vibrate` does not exist on iOS Safari at all, so on an iPhone the BEEP is the only
non-visual cue there is. Bundling it with the synthetic voice means switching off the voice silently
costs that user every cue they have. Speech / tone / haptics are independent, stored per DEVICE.

## Evidence rules

1. **A test never seen to fail is not evidence.** Every regression gate added in Phase 2 was proven
   load-bearing by breaking the thing it guards and watching it fail by name.
2. **A screenshot is evidence of a frame; a measurement is evidence of a fact.** Three times a
   screenshot suggested a defect the DOM disproved.
3. **An audit you run once is a snapshot; a gate is what keeps being true.** `check-routes` found
   four unlimited writes on its first run, including the route that mints bearer credentials.
4. **An audit must not carry its own copy of what it audits.** The Bible audit's first pass reported
   a false violation because its token list was typed from memory; it now reads the stylesheet.
5. **A path exercised only one way is one untested branch from never having worked.** Three
   pre-existing holes surfaced this phase — freestyle start had never worked, `total_work_seconds`
   was computed and never sent, and a session could never be finished.
