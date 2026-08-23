---
type: screen-spec
title: Edzés — Workout player
route: /workout
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Edzés — Workout player

The screen a lifter holds one-handed between sets, often without looking at it properly. Its only job is to record what just happened and say what is next — which is why it is the one screen in the product built around a layout law rather than a layout preference.

> [!important]
> **THE LAW: the page never scrolls.** It is a fixed column exactly one viewport tall minus the nav — hero, title row, set list, switcher, timer. Only the set list scrolls, inside its own box. If the page scrolls, the check button is in a different place every time, and the failure mode is not "mildly annoying": it is tapping the wrong row and recording a lift that did not happen, on a row the schema then freezes. `min-h-0` on the middle track is what makes the grid child scroll instead of growing the page, and it is the single most common way this pattern is got wrong.

## Anchor

The anatomical muscle map, drawn large enough to nearly fill the hero panel across the top third. A body map, because the question it answers is *anatomy* — which muscles this movement works, primary versus assisting — and no chart, ring or photograph answers that as directly as a lit-up figure. It is also the one element on this screen that is not a number, which is exactly why it is the anchor: everything below it is figures, and the map is what stops the page reading as a spreadsheet.

The map carries its own `Elöl` / `Hátul` segmented control at the top of the hero and a legend beneath the figure — `Fő célizom` (full accent) and `Segédizom` (subtle accent fill). A `Videó` chip sits at the bottom-right of the hero and swaps the panel to the exercise media; its label toggles to `Izomtérkép` when the media is showing.

## Blocks

1. **Hero panel** — a wide rounded panel on the raised surface, one of three contents: the muscle map (drawn here), the media placeholder, or the interval stage. Overlay chips sit in its bottom corners: bottom-right `Videó` / `Izomtérkép` always, bottom-left `Időzítő` **only** when the current exercise belongs to a circuit / EMOM / AMRAP block. Both chips disappear entirely while an interval timer is counting, so a live countdown cannot be dismissed by reflex.
2. **Title row** — the exercise name in the display face, truncated (`Fekvenyomás`), and a small grey tabular counter in a pill at the right, `3 / 4` — this exercise against the session's exercise count.
3. **Set list — the only scrolling region.** Opens with a tiny uppercase column header: `#` · `Előző` · `kg` · `ism.` · (blank for the check column). Then one row per set.
   - **Pending row** — index, the previous session's value in grey (`60 kg × 7`, or an em-dash when there is none), a centred weight input carrying the prescribed target as a *faint placeholder only*, a centred reps input the same way, and a square check button.
   - **Recorded row** — pale success fill, both inputs disabled and showing what was recorded, a lock glyph inside the weight field, a success check at the trailing edge.
   - **Active row** — accent ring around the whole row, the index circled, the check button filled accent, and the hold instruction `Tartsd nyomva a rögzítéshez` beneath it.
4. **Exercise switcher** — a horizontally scrolling chip row pinned above the timer, one chip per exercise: truncated name plus a faded tabular count. `Guggolás ✓ 4/4`, `Fekvenyomás 3/4` (filled accent, current), `Evezés 0/4`, `Lat húzás 0/3` clipped at the edge. The clipped fourth chip is deliberate — it is the affordance that says the row scrolls.
5. **Rest timer** — a blurred floating card pinned **above** the nav, never over it: a draining accent ring, the clock `1:30` in the display face with tabular figures, `Következik: Evezés` beneath, and a ghost X (`Pihenő átugrása`) at the trailing edge. Absent whenever no rest is running.
6. **Bottom nav** — `Edzés` active.

> [!warning]
> The prescribed target is **never** a pre-filled value, only a placeholder. Pre-filling is how a lifter logs the prescription instead of what they actually did, and the row then freezes it.

## What was merged away, and why

The map and the focused set table both survived — this screen was never the "whole UI is data fields" offender, because here the fields *are* the work. The edit was trimming around them so the two things that matter can breathe.

- **Five set rows down to four.** The fifth row was always half-clipped anyway; four full rows plus a visibly clipped fifth reads as "there is more", whereas five crowded rows read as "this is all of it, badly". This is the change that bought the vertical budget for everything below.
- **The undo pill on the completed row is gone from the default view.** It still exists — it overlays the trailing end of a row for a short window after recording — but drawing it permanently on every completed row put a control on rows nobody was going to touch, and it fought the success check for the same corner.
- **The `Időzítő` overlay chip is gone from this variant.** The rest timer already carries the countdown; a second timer affordance in the hero on a straight-set exercise is a control that does nothing, which is worse than no control. It returns only on a circuit / EMOM / AMRAP block.
- **The caption line about the back view is gone.** `Elöl` / `Hátul` is right there as a segmented control; a sentence explaining it was a sentence explaining a two-item toggle.
- **The switcher is three chips plus a clipped fourth**, with wider gaps everywhere. Five tight chips read as a nav bar competing with the real one at the bottom; four loose ones read as a filter row, which is what they are.

## States

- **Empty (no running session)** — the whole screen becomes one centred column: a tinted mark with a play-circle, the heading `Most nincs futó edzés`, and the body `Indíts egyet a mai napból, vagy csinálj szabad edzést.` **No button** — the action lives on Home, and duplicating it here would create a second start path the server has to reconcile.
- **Loading** — a skeleton in the hero's proportions, then two skeleton bars in the set row's shape. Shapes must match the real geometry or the swap causes the layout shift the skeleton exists to prevent.
- **Error on check** — a danger chip *floats over* the trailing end of the row: `Már rögzítve, más értékkel`, `Nincs kapcsolat`, or `Nem sikerült rögzíteni`, with an outlined `Újra` chip beside it. **The list must not reflow** — a row that grows pushes every row below it under the thumb that is about to tap the next one. A conflict is the exception: it offers `Visszavonás` instead of `Újra`, because re-sending the same request against differing stored values cannot succeed.
- **Offline** — the check keeps working; the set is queued through the outbox and the row shows the offline chip rather than staying silently pending. A check that fails quietly is the single worst thing this screen could do.
- **Interval block** — the hero becomes the stage (phase word in its own colour, countdown, tinted progress bar, round line, three compact controls). It is drawn **inside** the hero, never as a full-screen overlay: the hero is already reserved, so the stage costs zero vertical budget and all four rows of the layout survive. Sub-states: not configured (`Ehhez a blokkhoz nincs megadva időtartam`), idle / done, and interrupted (`Az időzítő megszakadt` with `Végigcsináltam` / `Itt megállok`).
- **Handover** — when a rest ends the next pending row takes an accent ring and is scrolled into view. Ring, not jump; and **no focus**, because focusing opens the numeric keyboard over the very rows the lifter came back to read.
- **Role-gated** — none. A coach previewing a client's session is read-only, and that is a different route.

## Components

Reuses `MuscleMap` (with its `Elöl` / `Hátul` control, its highlight roles and its `Fő célizom` / `Segédizom` legend — all already built), `SetRow` with its five interaction variants, `RestTimer`, `IntervalStage`, `Pressable` and the `control` recipe for every chip and the check button, `EmptyState`, `Skeleton`, `BottomNav`.

Genuinely new: the hero is now a **framed panel that hosts the map at full bleed** rather than a centred small figure inside a grey box — `MuscleMap`'s current max width leaves most of the hero empty, so it needs a fill mode. The title row's counter **pill** is new (it was bare grey text). Everything else on this screen is reshaping, not invention.

> [!warning]
> The muscle map is the one component in the product that does not meet the touch-target floor — the narrowest region is a few pixels wide and cannot be inflated without destroying the anatomy. The rule it obeys instead is that it is *never the only way* to do its job. On this screen it is read-only and passes no select handler, so it is not an interactive target at all. If a future change makes it tappable here, that rule is broken and the fix is a chip row, not bigger regions.

> [!warning]
> The light mockup's set-list header reads `Előző, kg, ism.` with an English `Weight` in the third column. That is a mockup defect, not the design. The header of record is four cells: `#` · `Előző` · `kg` · `ism.`

## Navigation

Bottom bar, `Edzés` active with the pale accent pill behind its icon. Member: **5 tabs** — `Kezdőlap`, `Edzés`, `Étkezés`, `Haladás`, `Profil`. The rest timer must clear the bar plus the safe-area inset: a timer covering the nav is a timer people dismiss out of frustration rather than because the rest is over.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/02-workout-player.webp]]
![[_mockups/vilagos/02-workout-player.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
