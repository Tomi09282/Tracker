---
type: adr
title: ADR-0020 Pulse replaces the liquid-glass redesign
status: accepted
date: 2026-10-11
tags: [decision, adr, design-system, redesign, pulse]
---

# ADR-0020 — Pulse replaces the liquid-glass redesign

> [!success] Implemented — 2026-10-18, on the local branch `pulse-redesign`
> All 24 screens (59 frames) are rebuilt on the Pulse kit in `frontend/src/ui`, and the liquid-glass
> bridge is deleted (closing cleanup F19). Of the 59 frames, 17 match the app on recorded data, 32 match
> on a schema-checked fixture (`matched-fixture`: the recording does not hold the frame's sample data),
> 1 matches by code but cannot be reached as a screen (post-detail-3), 1 is no screen any more
> (workout-3: D2 sends a member with no session to the library), and 8 still differ: library-1..3 (the
> equipment stills are not drawn yet), marketplace-1/2 (the lead post's caption is held back), admin-2
> (the submission's photograph is data) and style-studio-1/2 (every element is honestly dormant, so no
> live specimen or save toast). Per frame: `docs/pipeline/pulse/review/final.json`. Open: the
> deviations awaiting a ruling (`docs/pipeline/pulse/deviations.md`), the proposed strings
> (`copy-to-approve.md`), the sweep's findings (`docs/pipeline/pulse/review/open.md`) and the follow-up
> packages — (1) the coin-store pack delisting on the backend (Q2), (2) finish / abandon workout (D3).
> How it was done and what was ruled on the way: [[0021-pulse-implementation]]. The paragraphs below are
> the record of 2026-10-11 and are left as written.

**Context.** On 2026-10-05 the owner looked at the shipped liquid-glass UI and dropped it in one
sentence: the app has a design, it is not good, forget it. He asked for a very clean
("nagyon letisztult"), mobile-first, image-led UI designed from the product's real feature list,
and for it to be designed in Figma rather than as generated pictures, because a Figma file is
something an implementation can be built from.

Five directions were explored on three screens each (Home, muscle selector, Profile): Liquid Glass
for iOS 26, Editorial, Pulse, Clay and Flow. Two things were rejected on sight during that round
and are rejected for good: the app's own vector anatomy drawing ("ugly, and exactly what we have
now") and basic line icons in the tab bar ("put a custom image there too").

He chose **Pulse** on 2026-10-07 and immediately named its weakness: the cards "look like AI slop".
That was accurate — every block was the same big-radius rectangle with a faint border and a
slightly lighter fill, holding a label, a number and a button. Three container languages were
proposed in its place; the first, **"Open Field"** (no boxes at all), was built and he accepted it
on 2026-10-10 with an instruction to design every other screen the same way.

**Decision.** Pulse V1 "Open Field" is the design of record for the whole app.

- A near-black canvas, one acid-lime accent, giant condensed numerals, graphite renders and
  low-key black-and-white photographs that glow out of the dark with no frame.
- **Nothing is enclosed.** No card, no stat-tile grid, no boxed input, no outlined chip. Structure
  is one left edge, hairlines, small-caps eyebrows, big numerals, mono meta and space. The shapes
  that remain are controls: the lime pill, the switch, and the bottom sheet (the one surface).
- At most one lime pill per screen, and it is the primary action. Every other lime mark means
  live, selected or done.
- The tab bar has no capsule. Its icons are a custom rendered set; the active tab is the same icon
  lit lime.

The Figma file is the source the implementation is built from; the rules are in
[[58-Pulse/Pulse System]]; the screen list is in [[58-Pulse/0000 Index]].

**What this supersedes.** The *look* described by the v4 mockups and by the visual sections of the
`55-Screens` notes, and the visual language of [[0015-liquid-glass-replaces-the-packs]]. It does
NOT supersede what those notes say a screen *does*: the content, the states and the reasons behind
them still hold, and the Pulse screens were drawn from the same code. What happens to the theme
packs that ADR-0015 kept as aurora skins is open (below).

**How it was made, because it decides how far to trust it.** All 24 screens (59 frames) were built
by agents from one tested component kit that lives inside the Figma file, from per-screen
inventories read out of the code and checked by a second pass (exact Hungarian copy, live states,
do-not-invent lists). Each screen was then inspected by a reviewer that had not built it, and the
blocking findings were fixed. That is one round. Nobody has used these screens.

**Consequences.**

- Nothing is implemented. `tokens.css` still describes liquid glass; the eleven build gates still
  guard it. Implementing Pulse starts with a token block and a mapping from the kit's 51
  components to the existing primitives — not with screens.
- The designs lean on 49 generated images. Photographs and renders are AI-generated; their terms
  of use and their consistency over time have to be checked before release.
- The muscle figure is a picture, not a kit. Its panels do not match the 19-muscle roster (one
  shoulder cap for two muscles; no neck, adductor or abductor panel), so the selector cannot ship
  on it. It needs neutral front and back renders plus per-muscle highlight regions.
- Exercise rows are drawn with equipment stills. The list API carries no equipment key today, and
  eight of the sixteen equipment types have no still.
- The builders recorded what each screen needs that the product does not provide — 221 items in
  [[58-Pulse/Product gaps]]. Several are product holes the old design hid: no way to finish a
  workout, no door to the exercise library on a plan day, no way into onboarding.

**Decided by the owner on 2026-10-11, at the start of implementation.**

- *Theme packs:* Pulse is the only look for now. The previous packs are deleted, not kept
  selectable; new packs will be designed for Pulse later. (Packs are sold for coins, so removing
  them on the backend is its own package with a migration.)
- *Muscle selector:* the "Edzés" tab shows it whenever no session is running, and Home carries a
  row that opens it. No new tab.
- *Finishing a workout:* built after the screens, as a separate package with its backend. The
  redesign itself stays frontend-only and does not fake the action.
- *Git:* the work happens on the local branch `pulse-redesign`, one commit per finished step,
  nothing pushed until he says so.

**Still open (2026-10-11).** The mannequin's production strategy (see [[58-Pulse/0000 Index]]) —
answered 2026-10-12 (Q1: neutral renders with regions over them) and built as F15; see
[[0021-pulse-implementation]].

**Not chosen.** Liquid Glass, Editorial, Clay and Flow: the owner picked Pulse out of the five and
gave no reasons against the others, so none are recorded here; their three screens each stay in
the Figma file (pages 01, 02, 04, 05). Within Pulse, the "Instrument Panel" and "Bands" container
languages were stopped unbuilt once he accepted Open Field.
