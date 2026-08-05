---
type: report
title: Webview E2E matrix — Phase 2
updated: 2026-08-05
tags: [audit, phase-2, e2e]
---

# Webview E2E matrix — Phase 2

Every route walked in the real webview at **375 × 812** and **1440 × 900**, with the checks below
MEASURED in the DOM rather than eyeballed from a screenshot. Two defects were found this way and
both are fixed; a third suspicion turned out to be a misread screenshot and is recorded as such,
because a false alarm is worth writing down once so it is not re-raised.

## What was asserted, and why each one

| check | why it is the check |
|---|---|
| `scrollWidth - innerWidth` | horizontal page scroll is the defect that makes a phone app feel broken; 0 or negative (a scrollbar) is the pass |
| targets below 44 × 44 | the Bible floor. A control you cannot reliably hit one-handed is not a control |
| exactly one `<h1>` | a page with none is a page a screen-reader user cannot navigate into |
| `<img>` without `alt` | an unlabelled image is an unlabelled control |
| landmarks present | `main` / `nav` / `header` are how assistive tech skips the chrome |

## Result

| route | 375 px | 1440 px | notes |
|---|---|---|---|
| `/` home | ✅ | ✅ | |
| `/library` | ✅ | ✅ | |
| `/workout` | ✅ | ✅ | **had no `h1`** when empty — fixed |
| `/coach` | ✅ | ✅ | **3 targets at 209 × 40** — fixed |
| `/coach/plans` | ✅ | ✅ | |
| `/coach/clients/:id` | ✅ | ✅ | all four tabs, real tablist keyboard semantics |
| `/settings` | ✅ | ✅ | three cue switches, 44 × 44 each |
| `/progress` | ✅ | ✅ | |

Overflow 0 on every route at both widths. Zero sub-44 px targets after the fixes. One `h1` per
route after the fixes.

## The two defects

**The coach's roster links were 209 × 40.** Below the floor, and this is not a decorative control —
it is the coach's primary navigation, the row they tap all day, on a phone, one-handed. Now
`min-h-[var(--target-min)]`.

**`/workout` had no `h1` when no session was running.** `EmptyState` renders an `h2`, which is
right when it sits inside a screen that already has a heading and wrong when it IS the screen —
and three routes render nothing but it. `EmptyState` now takes a `heading` prop defaulting to `h2`,
and the three whole-page uses pass `h1`. Promoting it everywhere would have given the other pages
two `h1`s, which is its own defect.

## The false alarm, recorded on purpose

At 1440 px the bottom navigation *looked* stranded in the middle of the page in a screenshot. It is
not: measured, it is `position: fixed`, occupying 818–884 in a 900 px viewport — pinned exactly
where it belongs. The screenshot was scaled and captured mid-scroll.

This is the third time in this project that a screenshot has suggested a defect the DOM then
disproved. **A picture is evidence of what a frame looked like; a measurement is evidence of what
is true.** When they disagree, measure again.

## Not covered here

- Real iOS/Android hardware. The webview is Chromium; `navigator.vibrate` is absent on iOS Safari
  and the wake lock is unavailable before iOS 16.4, so the interval timer's cue behaviour on an
  iPhone is inferred from feature detection, not observed. Flagged in `SHARED_MEMORY` §5m.
- Reduced-motion and forced-colours system settings.
- Screen readers. The semantics are asserted structurally (roles, heading levels, hidden data
  tables); how a specific reader announces them is not.
