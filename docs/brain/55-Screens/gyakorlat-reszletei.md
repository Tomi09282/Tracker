---
type: screen-spec
title: Gyakorlat részletei — Exercise detail
route: /library/:id
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Gyakorlat részletei — Exercise detail

One exercise, opened from the library or from a plan: how it is performed, exactly which muscles it works, and a way out to a substitute. The user arrived either because they do not know the movement, or because they cannot do it today and need something close.

## Anchor

A landscape media hero of the movement — the aspect the code already reserves — with one large circular play button centred on it, filling roughly the top third.

A demonstration, because the question is *how is this done*, and a moving picture answers it before any sentence does. The play button is the anchor's whole argument: a still photograph of a bench press is a decoration, a frame with a play button on it is a promise.

The muscle map further down is drawn **deliberately smaller** than the same component on the library screen. Only one element may dominate, and here anatomy is evidence rather than subject — the map confirms what the video shows, so it must not compete with it.

## Blocks

1. **Back link** — a left arrow plus the word `Gyakorlatok`, grey, with a tap area meeting the floor. Returns to `/library`.
2. **Status banner** (conditional, deliberately **above** the hero) —
   - *Rejected*: a card with a danger-tinted warning puck, the bold line `Ezt a beküldést elutasították`, and the moderator's own free-text reason underneath in grey (`A leírás nem egyezik a videóval.`). This is the far end of the moderation loop — the admin route has always refused a rejection with no reason, that reason was stored and returned, and for a whole phase it was rendered nowhere. Above the media, because somebody opening a submission they are waiting on should not have to scroll to learn it was turned down.
   - *Pending*: an info-tinted card, one grey line `Beküldve — moderálásra vár.`
   - *Published*: nothing.
3. **Media hero** — full bleed inside the page gutter, rounded, bordered, with the play affordance centred. The ratio is reserved whether or not media exists, so nothing shifts on load. *Empty variant*: the same reserved box holding one dumbbell outline — **and no play button**.
4. **h1 exercise name** — `Fekvenyomás`.
5. **Meta pill row** — small grey pills directly under the title: the difficulty word `Haladó`, then the type word `Erő`. When the text is a language fallback, a warning-toned uppercase language pill joins them — the API tells the UI the row is untranslated, so the UI says so rather than passing English off as Hungarian.
6. **Primary action, full width** — `Hozzáadás az edzéshez`. New; see below.
7. **`IZOMCSOPORT` section** — an anatomy badge glyph, then the micro uppercase accent heading. Under it the `Elöl` / `Hátul` chip pair, then the centred read-only figure: primary target muscles painted solid accent, secondary ones in the subtle accent tint, everything else in the surface ramp. When a highlighted muscle sits on the other view, a small grey caption under the figure says so (`További célizmok a hátul nézetben.`) — otherwise nothing lights up and the map looks broken. Then a wrapped chip row naming the muscles: `Mell`, `Tricepsz`, each carrying a leading dot in its own role colour.
8. **`Végrehajtás` section** — a numbered-list badge glyph, then the heading, then an ordered list. Each step is an accent-tinted circle holding its numeral with the step text beside it.
9. **`Helyettesítő gyakorlatok` section** — below the fold in the frame, unchanged in intent: a horizontally scrolling strip of bordered cards bleeding to both screen edges, each holding an exercise name on up to two lines and its difficulty word in small grey underneath (`Kézisúlyzós nyomás — Kezdő`, `Gépi nyomás — Kezdő`). About two visible at a time. The strip scrolls inside itself; the page body never scrolls sideways.
10. **Bottom navigation** — fixed, blurred, five tabs.

> [!important]
> The `Elöl` / `Hátul` chips are the **only** interactive part of the map on this screen. The regions themselves are not tappable here — the component is passed no select handler, so they are not keyboard targets either. Do not make them tappable "for consistency" with the library screen; a region that navigates from a read-only diagram is a trap, not a shortcut.

## What was merged away, and why

- **The three-sentence description paragraph.** The numbered how-to says the same thing operationally, and prose above a procedure is the same content twice at lower density. Cutting it is what paid for the play button and the action button occupying the top half.
- **The `ESZKÖZ` chip pair (`Rúd`, `Pad`).** The hero image shows the bar and the bench, so on a populated exercise the chips restate the picture.
- **The legend and its caption (`Fő célizom` / `Segédizom`).** Two lines under the figure, removed. The chips now carry a leading dot in their role's colour, so the accent/tint distinction on the figure has *a* key — but a weaker one.
- **One of three tag pills, one of four numbered steps, and the rejection banner's extra wording.** Frame budget for the mockup, not decisions. The real screen renders every pill and every step.
- **The substitution strip is not cut** — it is below the fold. It survives intact and must be built.

> [!important]
> Two of these cuts have a condition attached, and shipping them unconditionally is a defect:
> - **Equipment must come back when there is no media.** For an exercise with an empty hero, the equipment chips are the *only* statement of what the user needs to have in front of them. Render the section at minimum whenever the hero is the dumbbell placeholder.
> - **A colour distinction with no key is not information.** Primary versus secondary is the map's entire argument — "works your chest, and incidentally your triceps". The chip dots are the surviving key; if they are ever dropped for looking noisy, the legend comes back with them, not instead of them.

## States

- **Loading** — grey skeleton only, matching the real geometry: a full-width hero block, a title bar at two-thirds width, a meta bar at one-third, then one rounded block. No spinner.
- **Not found / error** — one nearly blank page: the grey line `Nincs találat` and, under it, a button with a left arrow reading `Gyakorlatok`. No retry control, no toast.
- **Empty media** — the reserved box with a dumbbell outline; the play affordance must not render.
- **Offline** — the shell's strip only. Nothing on this screen renders a network state.
- **Role-gated** — a member viewing a published exercise sees no banner. The owner or coach viewing **their own** submission sees an identical screen apart from the danger or info banner above the hero. The rejection reason is the moderator's verbatim free text and this is the only place it ever surfaces — it is never truncated to fit.
- **No modals** — no bottom sheet, no dialog, no toast exists on either library screen.

> [!warning]
> A failed fetch and a bad id land on the same nearly-blank page, and it offers no retry. A user whose connection dropped mid-navigation is told the exercise does not exist.

## Components

- Reused as-is: `MuscleMap` in its **read** direction (`highlights` as slug → role, no select handler); `Pressable` for the back link, the view chips and the primary action; `Skeleton`; the `control` recipe for the tap-target floors; the shared chip shape for the meta pills, the muscle chips and the equipment chips.
- **New — and each is real work, not a restyle:**
  - **The play affordance.** The hero renders `media[0]` as a still image today; there is no player on this screen and no poster/video pairing in the data. Either the media contract gains a video plus a poster frame, or the play button is a lie. Do not draw it over a photograph that does nothing when tapped.
  - **`Hozzáadás az edzéshez`.** Nothing in the detail page or the exercise endpoints does this. It needs a defined target (the active session? a plan day? which one?) and an answer for the case where there is no active workout — a primary button that is dead most of the time is worse than no button. This is the single largest open question on the screen.
  - The section badge glyphs before `IZOMCSOPORT` and `Végrehajtás`, shared with the nutrition and progress screens.
  - The dotted outline chip for muscle roles, replacing the solid-accent / tinted-fill chip pair the code renders.

## Navigation

Bottom bar, `EDZÉS` active — the same tab as the library it was opened from; a detail page does not change the active tab. Member: five tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `PROFIL`. Coach: six. Admin: seven. See the library note for the clamp problem that all three share.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/04-gyakorlat-reszletei.webp]]
![[_mockups/vilagos/04-gyakorlat-reszletei.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[50-UX-Concepts/Muscle Map]] · [[00-Index/TODO Master]]
