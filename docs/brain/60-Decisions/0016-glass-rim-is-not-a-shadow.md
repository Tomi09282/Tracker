---
type: adr
title: ADR-0016 A glass rim is an inset highlight, not a shadow
status: accepted
phase: 9
date: 2026-08-23
supersedes: DESIGN.md DECISION 21 / finding F-09 ("cards separate by border OR shadow, never both")
tags: [decision, adr, design-system, glass, phase-9]
---

# ADR-0016 — A glass rim is an inset highlight, not a shadow

**Context.** `DESIGN.md` DECISION 21 is one of the sharpest rules in the system, and it exists
because of a measured defect. Finding **F-09** in the deleted build was *"cards used border AND
shadow together"*, and the rule written to prevent its return reads:

> Cards separate by border OR shadow, never both. The old build did both (F-09). In this app the
> answer is border, everywhere, and shadow is reserved for things that actually float.

The liquid-glass mockups appear to break it immediately. Every card in
`v4-vegleges/sotet/` carries a hairline edge **and** a bright highlight along its top, and the
floating surfaces carry a soft bloom underneath as well.

## Decision

**A glass card keeps its border and gains an INSET highlight along its top edge. That highlight is
not a shadow, and F-09 is not in play.** Drop shadows remain reserved for surfaces that genuinely
float — sheets, the nav, toasts, the rest timer — exactly as DECISION 21 says.

## Why this is a narrowing, not a repeal

F-09 was about **elevation being claimed twice**. A border says "this is a distinct surface"; a drop
shadow says "this surface is above the one behind it". Saying both, on a card that does not float,
is what made the old build look muddy: every card announced itself as lifted, so nothing read as
lifted.

An inset highlight makes neither claim. It is a **material** property, not an elevation cue: it
says the edge of this pane catches light, the way a real sheet of glass does, and it renders
*inside* the element's own box where a drop shadow renders outside it. Two cards side by side both
carrying a rim still read as coplanar — which is precisely the reading F-09 was protecting.

The test to apply when this is challenged: **if you removed the effect, would the card look like it
had descended?** For a drop shadow, yes. For a rim, no — it would look like plastic.

## The mode-dependent half, which is the part that will surprise a reader

The light mockups do not simply invert the dark ones. Comparing `sotet/01-home.png` and
`vilagos/01-home.png` directly:

| | Dark | Light |
|---|---|---|
| What separates a card | a clear hairline **edge** | a brighter **fill** than the ground |
| The border | visible, carries the separation | barely there, nearly redundant |
| Ambient lift | none on a resting card | a soft, wide, very low-contrast shadow |

So the two modes use **different separation strategies**, and the light mode is the one that
actually uses a shadow on a resting card.

This is still inside F-09 rather than outside it, and the reason is worth stating plainly: F-09
forbids *two* separators on one surface, not *a particular* separator. Dark separates by edge.
Light separates by fill, with a shadow doing the ambient work a hairline cannot do on a pale ground
— a 1px border at 12% ink is invisible on near-white, so insisting on it there would be cargo-cult
compliance with a rule whose purpose is legibility.

**One separator per surface, per mode.** That is the rule that replaces DECISION 21, and it is
what DECISION 21 was reaching for.

## What this permits, and what it still forbids

Permitted:
- An inset top-edge highlight on any glass surface, in either mode.
- A drop shadow on a surface that floats over content: sheets, the nav bar, toasts, the rest timer,
  the command palette.
- In light mode, a soft ambient shadow on a resting card **in place of** a visible border.

Still forbidden:
- A visible border *and* a drop shadow on the same resting card. That is F-09, unchanged.
- A drop shadow used decoratively on something that does not float.
- `#000` anywhere (DECISION 22), and a stock `shadow-lg`, which is a light-mode shadow at 10% black
  and is invisible on these surfaces anyway.

> [!important] The gate cannot see this
> `check-tokens` has no rule for border-plus-shadow and cannot easily get one — the two properties
> arrive from different tokens at different call sites. This rule is enforced by `Surface`
> (T9.5.1) owning the combination, and by review. If a card is ever hand-written again, it can
> break this silently, which is one more reason the 92 raw card sites become a component.

## Related

[[0015-liquid-glass-replaces-the-packs]] · [[0017-light-mode-is-a-second-attribute]] · [[00-Index/TODO Phase-9]] · [[50-UX-Concepts/UX Base Pack]]
