---
type: decision
title: Phase 3 lessons — chat, notifications, attachments, gates
status: accepted
date: 2026-08-06
tags: [phase-3, lessons, chat, notifications, security]
---

# Phase 3 lessons

Distilled from `docs/pipeline/SHARED_MEMORY.md` at the Phase 3 close, so the hot file can be pruned
back to what the next job needs. Same job as [[0010-phase-2-lessons]]: this is the copy that
survives the phase.

## The recurring bug class, three more times

Phase 3 hit **two things that must agree, drifting apart** three more times, and the fix was the
same every time — collapse to one definition.

- **The nav clamped at five and nobody counted the callers.** `BottomNav` clamps at five slots and
  says so; `AppLayout` handed an admin six. Measured: an admin saw five and `/admin` was not among
  them. The route worked, the role check worked, and there was no way to get there. Neither side
  was wrong on its own. Fixed by moving admin into Settings — role-specific and infrequent *is*
  secondary navigation — and by deciding Phase 3 adds no nav tabs at all.
- **The badge and the inbox are one predicate.** `VISIBLE` is the only definition of "a
  notification I can see", used by the list, the unread count and the mark-read guard. A badge
  reading 3 over an inbox showing 2 is the defect users actually notice, and it happens the moment
  the two are spelled separately.
- **A security predicate with two copies has one that is wrong.** `OWN_OR_HELD` (calendar feeds)
  and `MEMBER_OF` (chat) are each written once and shared by every route that touches the table.

The wider planning lesson: **decide where something LIVES before deciding how it looks.** Two
minutes counting nav slots prevented a build that would have needed unpicking.

## I wrote the second implementation, and it was the worse one

`lib/haptics.ts` already existed, built on the Capacitor plugin, with a header explaining that
`navigator.vibrate` is absent on iOS Safari. Then I wrote `cues.ts` calling `navigator.vibrate`
directly — so on a real iPhone every cue produced nothing while the correct plugin sat unused one
directory away.

How I got there is the part worth keeping: I hit the limitation and wrote comments EXPLAINING it,
at length, in three files, instead of searching the tree for whether it had already been solved.
**A limitation you find yourself documenting carefully is a strong signal that someone already hit
it.** Look for their answer before writing your own.

## The strings nobody looks at

Three defects in places no review reaches:

- **`sr-only` text.** `ScreenSkeleton` shipped a hardcoded English "Loading" — the first thing a
  Hungarian or German screen-reader user heard, for two whole phases. Invisible to visual review,
  and invisible to `check-i18n`, which audits the JSON and not the JSX.
- **A dead key claims a feature exists.** A reader seeing `workout.interval.emomDone` reasonably
  assumes there is a button. Five were dead.
- **A check whose subject moved does not fail — it passes, quietly, forever.** `NATIVE_LABELS`
  guarded three keys that had been relocated, so every iteration was a no-op.

All three are now gated, and each gate was broken deliberately once to watch it fail by name.

## The gate could not see four of its own tokens

`check-tokens` collected declarations with a **line-anchored** regex, but `tokens.css` pairs them
for readability — so only the first on each line was collected. 163 visible, 167 declared, and
using `--on-danger` (exactly what the notification badge is for) failed the build as "undeclared".

**That is how a gate stops being a guard and starts being an obstacle people route around.**

Second trap from the same gate: it scans comments, so prose explaining why a class was avoided
trips the rule that rejects the class. Correct behaviour — a commented-out class can be
uncommented — but it means such prose has to name the class indirectly.

## The review's real finding was the scope

Four adversarial lenses attacked a proposed migration 013 and returned ~30 defects. The signal was
not any single one, it was **where they clustered**: every severe finding sat in the elaborate
parts — collapse upserts, quiet-hours triggers, an automated sweep, a dedupe key bounded by a GLOB
that was a no-op because GLOB is not a regex. The core was reported sound.

One of them, `CHECK (deliver_after <= created_at + 2678400)`, would have bricked every collapsed
notification 31 days after it was raised. **SQLite cannot alter a CHECK**, so that is a 12-step
rebuild of the largest table in the product, discovered by a user.

So 013 shipped the core and nothing else. **ADD COLUMN is legal; a wrong CHECK is not removable.**
The right response to "the reviewers found thirty problems" was to build less.

Three decisions inside that core:

- **A conversation belongs to the LINK, not to the pair of user ids.** The same two people can be
  linked, archived and linked again; those are different working relationships. Keying on the link
  means the second starts clean, and archiving withdraws access on the next request with no code
  remembering to.
- **The notification payload is a SNAPSHOT.** "Your coach added Tuesday" must still read correctly
  after Tuesday is deleted; the alternative makes every future feature that emits a notification
  responsible for cleaning up after itself.
- **Block names WHO blocked.** A coach blocking a client and a client blocking a coach are
  different events with different remedies; a boolean cannot tell a moderator which happened.

## Migration 014: the cascade that took the history with it

013 let deleting a coach link cascade into the conversation. My first verification probe asserted
that as CORRECT (`deleting the link takes the conversation with it` was a PASS) — the probe encoded
the bug. **A client's chat history is theirs and must survive the coach leaving.** 014 rebuilds
with `ON DELETE SET NULL` plus `coach_name_snapshot` and `sender_is_coach`, so a departed coach's
messages still read correctly. Asserted `1 -> 1`, not `1 -> 0`.

Mechanical note that cost an hour: **SQLite validates trigger bodies when you DROP a table**, so a
12-step rebuild must `DROP TRIGGER IF EXISTS` everything referencing the table first.

## The gate must run before multer, and the status code cannot tell you it does

The exercise upload checks ownership in its handler, after `upload.single()` has written the file.
For an 8 MB image that is tolerable; for a 128 MiB chat video it is a stranger filling the disk of
a server they have no account on. Chat attachments prove membership in a middleware that runs
**before** multer, where `req.params.id` and `req.user.id` both already exist and nothing is
written.

**The trap is that the status code is identical either way.** The first smoke check asserted the
status and PASSED with the gate deliberately moved after multer — a test that cannot distinguish
the fix from the bug. It now counts the quarantine directory across the attempt: gate after multer
fails with `10 -> 11`, gate first passes `12 -> 12`.

**And the key is not the permission.** A 48-hex storage key is unguessable but not private — it
appears in URLs, histories and proxy logs. The read carries the same conversation predicate the
upload did, and a stranger holding the exact key gets 404.

## Retention is a read predicate first, a sweeper second

Two mechanisms with different jobs. The **read predicate** (`WITHIN_RETENTION`, 730 days, spelled
once) enforces the policy and holds on the very next request whether or not any job runs. The
**sweep** only stops the disk growing, in bounded batches because this is the largest table in the
product and an unbounded DELETE holds the single write lock.

A sweeper-only design makes the policy true exactly as often as the job runs, and a missed run is a
silent breach.

## A chart's x axis is time, or the chart is lying

The progress chart positioned points by INDEX — the obvious implementation, and wrong: five
sessions in a week then a two-month break rendered identically to seven consecutive days. The whole
question a progress chart answers is *how fast*. Fixed by positioning on the date; clustered
sessions crowd and gaps open, which is the truth, and a visible gap is information. A break of 14+
days is NAMED in the axis row, because visible and understood are different things.

The geometry moved to a pure module (`chartGeometry.ts`), like `intervalPlan.ts`, because where the
points go is the one thing a chart can get silently, misleadingly wrong — and pure arithmetic can
be checked exhaustively without a DOM.

## The failure path is the one nobody walks

Both defects the T2.0.3 review found were in code that only runs when something goes wrong.

- **`SetRow.submit()` had `try/finally` and no `catch`.** A failed check stopped the spinner and
  said nothing; a lifter mid-set could not tell a recorded set from a lost one. Now 0 is offline,
  409 is a conflict, anything else is a failure, each with `role="alert"` because the lifter has to
  ACT. **A 409 offers Undo, not Retry** — re-sending cannot help when the stored values differ.
- **A voided set still rendered as done**, because `done` never consulted `voided_at`. The screen
  was disagreeing with the record. The fix is a THIRD state (WITHDRAWN), not a tweak: it cannot
  show DONE because the undo removed it from the totals, and it cannot show PENDING because a tap
  would earn a 409 — **offering a control that cannot succeed is worse than offering none.**

**A feature is not finished when its write lands; it is finished when every screen that displays
the affected row agrees with the new state.**

## Deferred with reasons, not silently

- **Quiet hours (T3.1.2)** wait for a scheduler. Nothing in this product can hold a notification
  back — every notification is written inside the transaction that caused it and read on the next
  request. A settings row saying "22:00–07:00" that the delivery path ignores is a lie stored in
  the database, and it is *worse* than no setting because the user configured it.
- **The weekly digest (T3.1.6)** is a statement about time passing with nothing happening, which
  needs something that runs when nothing happens. Computing it when the coach next opens the app
  produces a "weekly" summary that arrives whenever they happen to log in.
- **Adherence shipped anyway**, as the half that needs no scheduler: a read-time COUNT of completed
  sessions over 28 days. Never a percentage — a percentage needs a denominator, and "how many were
  prescribed" is the schedule rule, arithmetic over a window rather than a column.

The comment it replaced is the caution worth carrying: the dashboard explained the column's absence
with *"nothing logs a workout yet"* — true when written, false the day the player shipped.
**A comment that asserts a state of the world rather than a rule will outlive the world.**

## The evidence rules, extended

Phase 2 left five. Phase 3 used all of them and added one:

1. A test never seen to fail is not evidence.
2. A screenshot is evidence of a frame; a measurement is evidence of a fact.
3. An audit you run once is a snapshot; a gate is what keeps being true.
4. An audit must not carry its own copy of what it audits.
5. A path exercised only one way is one untested branch from never having worked.
6. **A probe that has never been seen to fire cannot be told apart from a clean subject.** Before
   recording a zero, plant the defect and watch the zero become a one. See [[Bible Audit Phase-3]].

## Gates added this phase

- **`check-routes.mjs`** — every route authenticated (allowlist carries a REASON), every write
  rate-limited, every `z.object()` `.strict()`, no `...req.body`. 89 routes.
- **`check-worker-tx.mjs`** — [[0005-transaction-commit-on-return]] clause 3 as a gate. Found a
  live violation on its first run: `copyDaysTx` grew the plan cycle *before* the occupied-day
  check, so a refused copy still re-dated a client's whole schedule.
