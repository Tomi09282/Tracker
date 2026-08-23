---
type: screen-spec
title: Kezdőlap (üres) — Home, empty state
route: /
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Kezdőlap (üres) — Home, empty state

The same route as [[Screens/01 Home]], on the day the schedule has nothing to say: no plan day today, so no ring, no week evidence, no session to resume. The user still came here to find out what to do — so this variant's job is to answer that honestly and hand them one thing to press, rather than showing a zeroed-out copy of the populated screen.

## Anchor

A very large soft tinted circle, close to half the screen wide, holding one oversized outline calendar glyph with a crescent moon tucked at its lower right. It replaces the weekly ring entirely.

Why an illustration and not a ring at zero: a ring reading `0 / 5` is not information, it is an accusation — and worse, it is *wrong*, because a client with no active plan has no denominator at all. The moon inside the calendar carries the actual meaning (nothing is scheduled, and that is fine) in the same footprint the ring occupied, so the page's rhythm is unchanged between the two variants. This is the same rule `NutritionCard` already enforces in code: render nothing rather than a zero ring over a zero bar.

## Blocks

1. **Offline strip** — pinned above everything when the outbox is holding writes: cloud-off glyph, `Nincs internetkapcsolat` on the strong line, `3 művelet vár feltöltésre` beneath, accent rail down the leading edge. Shown in this mockup because the empty screen is where an offline client most often lands.
2. **Header row** — `Szia!` over `Szombat, augusztus 22.`, and the bell at the far right. Here the bell is drawn as a bordered rounded-square button with a `99+` badge, which is the capped upper bound: the server reports `capped` rather than a larger number.
3. **Empty panel (the anchor)** — one bordered card holding a centred column: the tinted circle glyph, the heading `Ma nincs betervezve edzés.`, the body line `Ha van aktív terved, a mai napja itt jelenik meg.`, then a **full-width filled accent** button with a dumbbell glyph reading `Gyakorlatok böngészése`. One action, and it is the only filled control on the page.
4. **Nutrition block** — unchanged from the populated screen: section header (tinted icon tile, `Táplálkozás`, trailing link `Megnyitás`) over the macro tile grid. `1840 / cél 2500` and `128 g / cél 160 g` sit at target colour; the third tile is **over target** — `265 g` against `cél 250 g`, prefixed with a warning triangle, its bar and its border in the warning colour.
5. **Bottom nav** — fixed, `Kezdőlap` active.

> [!important]
> Over target is **warning, never danger**, and the copy never scolds. Someone three hundred calories past their target has had a normal Tuesday. `MacroBars` already encodes this rule and the tile must not quietly harden it into red.

## What was merged away, and why

The rejected empty state was the populated screen with its values blanked: an empty week grid, a bordered card with a small icon and small text lost in the middle of it, a chevron pager over nothing, and a macro table of dashes. Seven controls, none of them worth pressing.

- **The entire seven-cell week grid is gone in this variant**, along with the day numbers and the `‹ ›` pager. On the populated screen the strip is evidence for the ring; with no plan there is nothing to be evidence *of*, and seven empty bordered cells look like a rendering failure. Cutting it is what let the empty panel take the anchor slot at full size instead of being a small card below a large blank.
- **The offline strip lost its trailing count pill.** The count moved into the strip's second line (`3 művelet vár feltöltésre`), which reads as a sentence instead of as a number in a chip beside a sentence saying the same thing.
- **The signed-in e-mail is gone from the header**, same reasoning as the populated screen: it belongs on `Profil`.
- **The four-row macro table became three tiles**, with the over-target case promoted from "an amber number in a table row" to "a tile that is visibly different from its neighbours". In the table the overshoot was one coloured figure among sixteen; as a tile it is the one object on the row with a warning border.
- **The empty state grew rather than shrank.** The instinct on an empty screen is to make the empty card small and apologetic. That is backwards — the emptiness *is* the content here, so it gets the anchor's footprint and the page's only filled button.

## States

- **Empty** — this note. Triggered by `days.length === 0` for today, and it is the same panel whether the client has no active plan at all or simply has no session prescribed for today. Copy stays the same in both cases because the next step is the same.
- **Loading** — a skeleton in the shape of the empty panel, not a spinner. The empty panel and the day list occupy the same slot, so one skeleton shape serves both and the swap causes no shift.
- **Error** — a failed `today` query renders this panel, not a red error card. A client who cannot be told what is scheduled needs the same escape hatch as one with nothing scheduled; the failure itself is a server-log concern.
- **Offline** — as drawn: the strip appears, `Gyakorlatok böngészése` still works against the cached library, and the nutrition tiles keep the last cached day rather than blanking.
- **Nutrition absent** — if nothing is logged today and no target exists, block 4 is not rendered at all. The empty panel is then the whole page above the nav. Do not add a second empty state for food here.
- **Role-gated** — none.

## Components

Reuses `EmptyState` (icon, title, body, single action — this variant is exactly what it was built for, with `heading="h2"` since the page keeps its `Szia!` `h1`), `Pressable` for the action, `OfflineIndicator` with its outbox count, `NotificationBell`, `Skeleton`, `BottomNav`, and the `MacroTile` / `SectionHeader` pieces introduced on [[Screens/01 Home]].

Genuinely new here: **the oversized illustrated glyph slot**. `EmptyState`'s existing mark is a fixed-size tinted square with a stroked icon in it; this design wants a circle at anchor scale with a composed glyph (calendar plus moon). That is a real change to `EmptyState`, not a wrapper — give it a size variant rather than forking the component, so the small in-list empty states elsewhere in the app keep the mark they have.

> [!warning]
> `EmptyState` renders its own heading level. When this panel is the only content on the route it still must not become the page `h1` — `Szia!` owns that. A page whose `h1` disappears depending on whether a plan exists is a page screen-reader users navigate differently on different days.

## Navigation

Bottom bar, `Kezdőlap` active. Member: **5 tabs** — `Kezdőlap`, `Edzés`, `Étkezés`, `Haladás`, `Profil`. Same clamp caveat as the populated screen.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/01b-home-empty.webp]]
![[_mockups/vilagos/01b-home-empty.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
