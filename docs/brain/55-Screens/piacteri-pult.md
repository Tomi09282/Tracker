---
type: screen-spec
title: Piactéri pult — coach's marketplace desk
route: /compose
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Piactéri pult — coach's marketplace desk

The coach's own side of the public marketplace: whether they are allowed to publish, whether their profile is live, and what state each of their posts is in. The coach comes here to answer one of two questions — *is my stuff out there?* or *let me write something* — and the screen is built so both are answered above the fold.

## Anchor

A thick-ringed donut centred under the title, splitting the coach's posts into one arc per state, with the total set very large and tabular in the middle (`18`) over the word `bejegyzés`, and a legend underneath.

The thing this screen is *about* is a countable inventory whose whole meaning is the split between its parts. That is a donut's one honest job. A trend chart would be wrong — nobody's publishing history is a line worth reading — and a ring-as-progress would be wrong too, because there is no goal to fill. The number in the middle is what the coach came to see; the arcs are why it is that number.

> [!warning]
> The mockup draws **four** arcs and labels **three** (`Élő 9`, `Piszkozat 4`, `Levett 4` — 17 of 18). The silent fourth is `Eltávolított`. An unlabelled arc is a chart that refuses to explain itself: either the legend names all four, or removed posts are excluded from the total and the caption says so.

## Blocks

- **Identity row** — small monogram, `Kovács Péter` over `@kovacspeter`, and a right-aligned status pill: globe + `Élő` on a success tint, or eye-off + `Rejtve` on a plain surface. This is the profile card, collapsed to one row.
- **`h1` `Piactéri pult`.**
- **Portfolio card** — the anchor donut, its legend, then the quota caption `Ma még 7 publikálás a 10-ból.` with a thin fill bar under it. Quota and inventory belong in one card because they answer the same question: *what can still go out today?*
- **Posts section header** — a kind-icon tile, `h2` `Bejegyzések`, and an accent-filled `+ Új bejegyzés` button on the right.
- **Filter chips** — a single-select row: `Mind` (selected, carrying a check glyph) / `Piszkozat` / `Élő`, with the remaining states behind an overflow.
- **Post rows** — each a card with a kind-icon tile on the left (calendar for `Program`, microphone for `Esemény`, megaphone for `Közlemény`), the title on the first line and the caption `Program · Piszkozat` on the second. Live rows carry a success tint and a small check badge on the icon tile, so `Élő` is legible without reading the caption. The list runs under the nav bar and the next row is deliberately half-visible — the scroll affordance is the clipped card, not a scrollbar.
- **Bottom nav.**

## What was merged away, and why

- **The subtitle** `Innen kerül ki bármi a nyilvános piactérre.` — cut. It explains the title to someone who already tapped the title.
- **The gate card is no longer a permanent block.** It is a *state* now (see below), not a card that occupies the top of the screen for the one coach in fifty who has an unmet precondition. When every precondition is met — the ordinary case — the top of the screen is the inventory, which is what the coach came for.
- **The two-button profile action row** (`Profil szerkesztése` + `Profil közzététele` / `Profil levétele`) collapsed into the status pill. Two full-width buttons for operations performed a handful of times a year were the loudest thing on a screen whose subject is posts.
- **Five filter chips became three** and their count badges are gone. `Levett` and `Eltávolított` move behind an overflow; the donut legend already carries the counts, so badges on the chips were the same number twice.
- **Three-line post cards became two-line icon rows.** The excerpt was the third line, and an excerpt of your own draft tells you nothing you did not already know — the title does the identifying, the icon does the kind, the tint does the state.
- **The character-limit footnote** moved to the editor, where the limits are actually hit.
- **The toast strip with its countdown bar, the mid-swipe card with revealed action targets, and the moderation card** were mockup illustrations of behaviours, not layout. All three still exist; they are documented under States rather than drawn permanently.

> [!warning]
> Collapsing the button row removes the **only** path to `Profil szerkesztése` and the **only** publish/unpublish control. The status pill must therefore be a real control: tapping it opens a sheet holding `Profil szerkesztése` and `Profil közzététele` / `Profil levétele`. If the pill ships as decoration, this screen silently loses two operations.

## States

- **Gate ladder** — at most one card, the *first* unmet precondition, in the server's own order: `Fogadd el a közösségi irányelveket` + `Elfogadom (1.0)`; `A fiók még túl új` naming the exact moment (`Publikálni 2026. 08. 24. 10:12 után tudsz.`); `Még nincs nyilvános profilod` + `Profil létrehozása`. Every one of these is enforced by a database trigger — **this screen must not re-derive them**, it renders the flags the context endpoint already computed. A second copy of the rule is the copy that will be wrong.
- **Takedown** — a danger-tinted card, `A profilodat levették`, with no button. A moderator removal is not the same as having no profile, and offering "create one" would send the coach at a handle they can no longer claim.
- **Empty post list** — `EmptyState` with a document icon: `Még nincs bejegyzésed` / `Írj egy piszkozatot — publikálni csak akkor fog, ha te mondod.` The donut renders `0` rather than disappearing.
- **Loading** — three stacked skeletons matching the real geometry: header line, portfolio card, list.
- **Error** — `A pult most nem érhető el` / `Próbáld újra egy pillanat múlva.`
- **Quota exhausted** — the fill bar reads full and the caption says so; publishing is refused server-side and reported on the editor, not pre-disabled here.
- **After an unpublish** — a status line reporting how much went dark, `3 poszt lekerült a piactérről.`, because a public post needs a live profile and the back catalogue going dark must never be a surprise.
- **Server refusals** — `Ez a felhasználónév nem elérhető.`, `Előbb tedd közzé a profilodat.`, `Ehhez edzői jogosultság kell.` render in the sheet that raised them.
- **Offline** — the shell indicator; the list serves from cache and mutations fail into their own error text.
- **Role-gated** — non-coaches never reach `/compose`; the `EDZŐ` tab is not in their bar.

## Components

Reuses `Pressable` (chips, the accent button), `EmptyState`, `Skeleton`, `BottomNav`, `CountUp` for the `18`, `Sheet` (E14) for the profile-actions sheet, `ToastHost`, and the `useCompose` context/query layer in `features/compose/useCompose.ts` unchanged — the ladder logic in `ComposePage.tsx` survives as-is, only its rendering moves.

Genuinely new: the **multi-arc donut with legend**. `Progress` (E16, variant `Ring-odometer`) draws a single arc against a track and cannot express four segments; extending it is the wrong move because that component's contract is *one value against one maximum*. Also new: the **kind-icon tile** with its state badge, and the **quota fill bar** (a bar, not the E16 ring — it is a secondary fact and must not compete with the donut).

## Navigation

Bottom bar present, `EDZŐ` active. Coach role: 6 tabs (`KEZDŐ`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `PROFIL`). The page reserves bottom padding for the bar; the clipped fourth post row sits above it, never under it.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/10-piacteri-pult.webp]]
![[_mockups/vilagos/10-piacteri-pult.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
