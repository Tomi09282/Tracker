---
type: screen-spec
title: Edzés (állapotok) — Workout player states
route: /workout
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Edzés (állapotok) — Workout player states

The same player as [[Screens/02 Workout player]], drawn as the state sheet: what the set list looks like when a set has been taken back, when one earned a record, and when the exercise has no muscle map to show. The lifter's task has not changed — record this set, see what is next — so nothing about the law or the layout moves. Only the rows say different things.

## Anchor

A very large soft tinted circle holding one oversized dumbbell glyph, filling the hero panel across the top third. It is the honest stand-in for an exercise with no muscle map and no media: a custom movement, a coach's own entry, anything the taxonomy has not been filled in for.

Why an illustrated placeholder rather than an empty panel or a collapsed hero: the hero's height is load-bearing. Collapsing it would move the set list up, which means the check button lands somewhere different on this exercise than on the previous one — the exact failure the no-scroll law exists to prevent. So the hero keeps its full footprint and fills it with a mark that reads as "nothing to show here" rather than as a broken image. The `Izomtérkép` chip stays in the bottom-right corner so the toggle is still discoverable when a map does exist for the next movement.

## Blocks

1. **Record toast** — pinned at the top of the viewport: a trophy in a circular mark, the word `Új rekord`, a dismiss X, and an accent rail down the leading edge. It is the away-from-the-screen channel for a record, paired with the haptic pattern and the spoken `Új rekord`.
2. **Hero panel (the anchor)** — the tinted circle with the dumbbell glyph, `Izomtérkép` chip bottom-right. No `Időzítő` chip: this is a straight-set exercise.
3. **Title row** — `Fekvenyomás` truncated in the display face, counter pill `4 / 6` at the right.
4. **Set list** — header `#` · `Előző` · `kg` · `ism.`, then the four state rows, in the order a session actually produces them:
   - **Recorded** — row 1. Pale success fill, `60 kg × 8` in the previous column, `62,5` and `8` locked in disabled inputs, success check trailing. Screen-reader label `Rögzítve`.
   - **Withdrawn** — row 2. Same row, dimmed, a strikethrough line running through it, all controls disabled, and an outlined `Visszavonva` chip at the trailing end. It is **neither** pending nor done: a void is terminal on the server, so a check that could not succeed is not offered, and a green tick would put the screen at odds with a session total that already dropped.
   - **Personal record** — row 3. Warning-coloured fill with a warning ring, the recorded values locked (`70`, `5`), a **trophy** in place of the check glyph, and the caption `Új rekord: becsült 1RM` beneath the values. The flash is a moment; the trophy on the button is permanent. Other wordings the same slot carries: `ismétléses csúcs`, `leghosszabb tartás`, `leghosszabb táv`, `legjobb idő`, `edzés-össztérfogat`.
   - **Active** — row 4. Accent ring, circled index, em-dash in the previous column (first time at this weight), placeholders `60` and `8`, filled accent check, and `Tartsd nyomva a rögzítéshez` beneath it.
5. **Exercise switcher** — one line, no wrapping: `Guggolás ✓ 4/4`, `Fekvenyomás 4/6` (filled), `Evezés 0/4`, `Lat húzás 0/3` clipped.
6. **Rest timer** — draining ring, `0:47`, `Következik: Evezés`, dismiss X in the card's top-trailing corner.
7. **Bottom nav** — `Edzés` active.

## What was merged away, and why

The rejected state sheet showed six rows and every failure at once: a conflicted check, an offline check, a withdrawn row and a record row stacked together, each with its own coloured chip floating over its trailing end. Four different alarm colours in one list, and no way to tell which one the lifter was supposed to act on.

- **Six rows down to four; the conflicted-check row and the offline-failed row are cut.** They still exist as states — see [[Screens/02 Workout player]] — but they are cut from the *sheet*, so exactly **one problem state (withdrawn) and one celebration state (record)** are visible at a time. Errors do not stack here. In real use they cannot: a conflict and an offline failure on adjacent rows means something much worse than a bad set is happening, and the screen should not be designed to make that look normal.
- **The switcher lost its fifth chip.** Four chips plus a clipped edge is the same signal as five crowded ones and leaves the row readable.
- **Title-row extras were trimmed** to the name and the counter pill. Anything else there competes with the row the thumb is aimed at.
- **What this bought:** the four rows are full height with real gaps between them, so a withdrawn row and a record row are distinguishable *by shape*, not just by colour — which is the only way this works for a colour-blind lifter and the only way it works at all in a gym mirror.

> [!warning]
> Every overlay in the list — the record caption, the withdrawn chip, an error chip, the undo pill — **floats over its row**. None of them may take a line of their own. A row that grows pushes every row below it under the thumb that is already moving toward the next check button.

## States

- **Recorded** — success fill, inputs locked, values shown as recorded.
- **Withdrawn** — dimmed, struck through, inert, labelled `Visszavonva`. The record earned by a withdrawn set is withdrawn with it: the trophy goes, because the server already retracted the record and a row claiming a lift that no longer exists is worse than no badge.
- **Personal record** — the flash and ring for a short window, then the caption returns to screen-reader-only and the trophy stays. Held in state rather than as an animation, so a refetch can neither replay the celebration nor erase the fact.
- **Failed check** — danger chip over the trailing end plus `Újra`; a conflict offers `Visszavonás` instead. Announced assertively, not politely: mid-set nobody is watching a colour change.
- **Offline** — the check still records into the outbox; the row shows `Nincs kapcsolat` rather than sitting silently pending.
- **Loading** — hero-shaped skeleton plus two row-shaped bars.
- **Empty (no running session)** — the whole screen becomes the centred `Most nincs futó edzés` column with no action, same as the main player note.
- **Role-gated** — none.

## Components

Reuses `SetRow` — all four states drawn here are states it already implements (`done`, `voided`, the record flash and badge, the handover ring), plus the hold gesture with its fill and the `Tartsd nyomva a rögzítéshez` label. Reuses `RestTimer`, `Pressable` and the `control` recipe for every chip, `Skeleton`, `EmptyState`, `BottomNav`.

Genuinely new:

- **The record toast.** `ToastHost` exists and is mounted app-wide, but no workout code raises one today — the record currently lives only on the row. Wiring it here is a real addition, and it needs a rule: **the toast is raised once per record and dismisses itself**; it is not a second permanent statement of the same fact. The row keeps the trophy; the toast is for the lifter who is not looking at the row.
- **The withdrawn chip.** The voided row currently signals itself by opacity and strikethrough alone. A dimmed struck-through row and a merely disabled row are hard to tell apart at arm's length, so the state gets a word.
- **The hero's illustrated placeholder mark.** Today an exercise with no map shows a small centred glyph in an otherwise empty panel; this design fills the panel with a tinted circle at anchor scale. Same size variant that [[Screens/01b Home empty]] needs from `EmptyState` — build it once.

> [!important]
> The row's lock glyph inside a recorded weight field is doing real work: it says *this value is frozen on the server*, not merely *this input is disabled right now*. Do not reuse it for a field that is temporarily read-only.

## Navigation

Bottom bar, `Edzés` active. Member: **5 tabs** — `Kezdőlap`, `Edzés`, `Étkezés`, `Haladás`, `Profil`. The rest timer and the record toast both clear the bar and the safe-area inset; neither may overlap it.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/02b-workout-states.webp]]
![[_mockups/vilagos/02b-workout-states.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
