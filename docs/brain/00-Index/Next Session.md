---
type: handoff
title: Where to pick up
updated: 2026-08-05
tags: [handoff, moc]
---

# Where to pick up

## Do this first

Phase 2 is **63 of 66 done**. Both halves of the product work end to end, and the three that remain are two UX-review passes and a seat cap deliberately reserved for the billing phase.

**Coach**: plan list → editor (days, blocks, supersets, exercise picker, up/down reorder) →
**clone to a client** (deep copy, independence proven in both directions) → copy day / copy week →
calendar week view → client detail with the questionnaire and a Progress tab showing sessions and
records → a subscribable ICS feed **of a client's schedule**, held through the link.

**Client**: Home reads the real schedule → start → the guided player (56 px set rows, wall-clock
rest timer, PR flash, haptic and spoken cues, **undo**, page provably never scrolls) → history,
record book, and their own ICS calendar feed.

**78 endpoints · schema v12 · smoke 313/313 · verify:schema 21/21 · check-routes OK · npm audit 0 ·
3 languages × 406 keys · vault 66/66.**

### Next, in the order that adds most

**Phase 2 is effectively finished — 63 of 66.** What is left in it:

1. **T2.0.3 / T2.0.4** — the two ui-ux-pro-max review passes (`--domain ux` over the interactions
   built here, `--domain chart` over the progress graphs). Review passes, not builds.
2. **T2.3.5 per-coach seat cap** — deliberately reserved for the billing phase; interface only.

Then **Phase 3**. Phase 1 also still has eight open items, mostly audit — see the bottom of this note.

### The gates a change must pass now

Five, all wired into scripts rather than into anybody's habits:

| gate | what it refuses |
|---|---|
| `check:routes` | a route with no auth that is not on the written PUBLIC allowlist; a write with no rate limiter; a `z.object()` that is not `.strict()`; any spread of `req.body` |
| `check:tokens` | a raw value outside the token layer; a raw `<button>` outside `src/ui/` |
| `check:i18n` | a key present in one language bundle and missing from another |
| `check:interval` | the interval schedule arithmetic — 35 assertions, no DOM needed |
| `verify:schema` | 21 schema invariants |

Plus `npm run smoke` (313 checks) and `npm audit`. **Every one was proven load-bearing by breaking
the thing it guards and watching it fail by name.**

### Known and deliberate

- **Nothing has been committed.** No git commit exists in this project at all. Worth a decision.
- Reorder is up/down buttons, not drag. A drag needs pointer, keyboard, screen-reader and touch
  paths; two buttons are all four and send the identical whole-list payload, so drag can be added
  on top without an API change.
- The offline-queue batch contract from the J4 review was dropped, not solved, yet
  `idempotencyDesign` leans on an offline queue in four places.
- `scope='system'` plan suggestions still have no content — a placeholder the schema names as
  "a future product starter library", not a bug.
- **The void is idempotent without a `write_uid`**, unlike every other write here: a void carries
  no values to disagree about, so a second tap asks for the state that already exists.
- **Within a day, voiding a personal record does not restore the previous one.** The day-unique
  index means a same-session beat UPDATES the day's event rather than appending beside it, so the
  earlier value is not stored anywhere. Within a day a record is a high-water mark, not a stack.
- The interval timer's cue behaviour on real iOS is INFERRED from feature detection, not observed:
  `navigator.vibrate` does not exist on iOS Safari and the wake lock needs 16.4+.

### The evidence rules

Distilled from twenty Phase 2 lessons, now in [[0010-phase-2-lessons]]:

1. **A test never seen to fail is not evidence.** Two checks here once passed for the wrong reason.
2. **A screenshot is evidence of a frame; a measurement is evidence of a fact.** Three times a
   screenshot suggested a defect the DOM disproved.
3. **An audit you run once is a snapshot; a gate is what keeps being true.** `check-routes` found
   four unlimited writes on its first run, one of them the route that mints bearer credentials.
4. **An audit must not carry its own copy of what it audits.** The Bible audit's first pass reported
   a false violation because its token list was typed from memory instead of read from the sheet.
5. **A path exercised only one way is one untested branch from never having worked.** Three
   pre-existing holes surfaced this phase — freestyle start had never worked, `total_work_seconds`
   was computed and never sent, and a session could never be finished.

### The recurring bug class, and what finally kills it

Every serious defect this project has produced has the same shape: **two things that must agree,
drifting apart.** A security predicate in two files. Two hand-written `calc()`s. A filter present
in one of two queries. A schedule rule heading for four copies.

The fix is never "fix both" — it is collapsing to one definition:

- `src/exercises/visibility.js` — the exercise visibility predicate, once.
- `src/plans/schedule.js` — the schedule rule AND `localDateFor`, once. This one was claimed done
  while the ICS generator still carried a copy, and that copy had already drifted TWICE (a day
  moved onto the window from before it never appeared; the horizon started on the SERVER's date).
- `--content-pad-b` — what the layout reserves below the content, once.
- `OWN_OR_HELD` in `ics.js` — who may see and revoke a feed, once.

**And: widening who can CREATE a thing is not done until who can SEE and DESTROY it widens with
it.** The coach-held ICS feed nearly shipped with a credential its creator could never withdraw.

### The method that keeps working

**Measure, never assume.** Every completion claim in this project is backed by a DOM measurement, a
smoke check, or a shell probe — and it has caught defects invisible to code review AND caught false
alarms of my own.

**A test that has never been seen to fail is not evidence.** Two checks here once passed for the
wrong reason. The schedule regression test was therefore proven load-bearing before it was
believed: deleting the moved-onto pass makes it fail with `missing UID:tracker-19-20260808@tracker`,
restoring it passes.

Two traps worth knowing before they cost an hour again:

- **`server.js:162` has a catch-all 404 that returns the SAME JSON envelope** as a route's own
  "no such object" answer. From outside they are indistinguishable. A 404 that surprises you may
  simply be a stale server: `npm run smoke` spawns its own, so the long-running dev server on 3000
  can be older than the route you just wrote.
- **A batch edit that reports success without reporting WHICH replacements landed will lie to
  you.** A `sed` that silently matched nothing once made a fix look like a regression.

## Reading order for a cold start

[[Home]] → [[TODO Master]] → [[TODO Phase-2]] → `docs/pipeline/SHARED_MEMORY.md` (hot memory, not
mirrored to the vault by design) → `docs/pipeline/phase-2/j4-schema-constraints.md`.

The 7 open questions in `docs/pipeline/phase-2/j4-synthesis-notes.json` are genuine trade-offs for
a human, not things that could be decided without one: void-only correction vs. edit, rep-max badge
noise for beginners, template-to-clone propagation, the one-live-session lock, ICS token lifetime.

## Phase 1 leftovers

Eight open, mostly audit rather than build: T1.43 webview E2E walk at 360/1440, T1.44 and T1.46
Bible conformance, T1.47 the phase report's outcome section, T1.51 screenshot audits (blocked on
the preview pane not compositing frames). Two are real features: **T1.11** Animate UI / Motion /
Lucide install, awaiting an owner decision, and **T1.31** gender and body variants plus 3D rotation
on the muscle map.

The muscle map itself was rebuilt on an 8-head canon with enforced symmetry: 34 front shapes, 22
back, zero outside the body outline, symmetry error 0.00. Polish still available — hands and feet
are stubs, the neck muscle is a thin cord.
