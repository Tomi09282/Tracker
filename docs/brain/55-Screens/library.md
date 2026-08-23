---
type: screen-spec
title: Gyakorlatok — Exercise library
route: /library
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Gyakorlatok — Exercise library

Find one exercise out of the whole catalogue and open it. Three ways in — type its name, point at the muscle on a body, or tap a muscle-group chip — and the screen's job is to make the second of those the one you notice first, because it is the only one that works when you cannot name what you want.

## Anchor

The anatomical body map, lifted out of its collapsed disclosure and given the top of the screen in its own card: `Elöl` / `Hátul` chips centred above the figure, the pectorals filled solid accent as the selected muscle.

A body map because this screen is **about anatomy**, and because it is the one element here that is not a text field. It also states the screen's premise before the user types a character: you can find an exercise by pointing at yourself. Sitting it under a search box would have made the distinctive control the thing you scroll to.

> [!warning]
> `MuscleMap`'s own documentation is explicit that the map is a **secondary** affordance — its regions sit well under the tap-target floor and cannot be enlarged without destroying the anatomy — and that what keeps this honest is that the same filtering is always available from the chip row below, which does meet the floor. Promoting the map to the anchor does not change that contract. The `IZOMCSOPORT` chip row must stay, and must stay reachable. If the map ever becomes the only path to selecting a muscle, the rule is broken, and the fix is to restore the chips, never to inflate the regions.

## Blocks

1. **h1 `Gyakorlatok`** — largest type on the screen, left-aligned.
2. **Muscle-map card** (anchor) — a bordered card holding, top to bottom: the pill pair `Elöl` (filled accent, check mark) / `Hátul` (outlined), then the front silhouette drawn from separate anatomical parts. Idle regions read as flat surface; the selected region flips to solid accent. Tapping a region sets the muscle filter, tapping the same region again clears it, and the matching chip below lights up in step — the map and the chips are one control with two surfaces.
3. **Search field** — full width, magnifier inset left, an X clear button at the right as soon as there is text. Placeholder `Gyakorlat neve…`. Typing is debounced so a request does not fire per keystroke.
4. **`IZOMCSOPORT` filter row** — a funnel badge glyph, then the micro uppercase label. Under it a single horizontally scrolling chip strip that bleeds to both screen edges: active chip solid accent with a check (`Mell`), the next outlined and emphasised (`Elülső vállizom`), the remainder ghosted and fading off the right edge to advertise the scroll. Twenty chips: `Mell`, `Elülső vállizom`, `Oldalsó vállizom`, `Hátsó vállizom`, `Bicepsz`, `Tricepsz`, `Alkar`, `Hasizom`, `Ferde hasizom`, `Széles hátizom`, `Csuklyásizom`, `Alsó hát`, `Farizom`, `Négyfejű combizom`, `Combhajlító`, `Vádli`, `Közelítő izmok`, `Távolító izmok`, `Nyak`, `Teljes test`. Single-select; tapping the active one clears it.
5. **Count row** — `24 gyakorlat` in grey on the left (`Betöltés` while pending); on the right, only when a filter is active, `Szűrők törlése` as a compact filled chip. It clears the muscle filter and leaves the search text alone.
6. **Result list** — card rows of one fixed height. Each: a landscape thumbnail left (photo, or a dumbbell glyph on a plain square when there is no image — the box is reserved either way so an arriving image cannot shift the row); a single-line truncated title; under it a meta line carrying a difficulty dot plus its word, then the type word, then optionally a tiny uppercase `EN` pill. Difficulty words `Kezdő` / `Haladó` / `Profi`, type words `Erő` / `Nyújtás` / `Kardió` / `Mobilitás` / `Pliometria`. The whole row is one tap target linking to `/library/:id`.
7. **Infinite-scroll tail** — an invisible sentinel ahead of the list end loads the next page; three skeleton rows of the identical geometry appear at the bottom while it loads. No "load more" button.
8. **Bottom navigation** — fixed, blurred, five tabs.

## What was merged away, and why

- **The collapsed `<details>` disclosure and its hint `Koppints egy izomra a szűréshez`.** The map is open by default and *is* the anchor. This bought the screen's most distinctive control an escape from being a single grey row that read as a footnote — the previous arrangement put the product's best idea behind a tap nobody takes. It cost the hint sentence, so the affordance now has to be carried by the arrangement itself: chips above a figure with one region already painted reads as "these are selectable" without being told.
- **The whole `ESZKÖZ` chip strip and its sixteen chips.** Two identical scrolling chip rows stacked is the data-field problem in miniature — the same widget twice, distinguished only by a micro label. Cutting one is what freed the top third for the map.
- **The visible `Keresés` label above the input.** The placeholder `Gyakorlat neve…` is a full sentence about what to type; a label saying `Keresés` above a field with a magnifier in it is the third time the screen says the same word.
- **The offline banner and its queue line.** Not removed — relocated in ownership. It belongs to the app shell, above the page, and drawing it in this screen's spec invites a second implementation.
- **Two of six result rows.** The list runs past the bottom edge on purpose. Do not build a fixed-height results area.

> [!important]
> Equipment filtering now has **no home on this screen**, while `useExercises` still takes an `equipment` filter and the taxonomy still ships sixteen entries. That parameter is either dead code or a missing control; it cannot stay ambiguous. Two honest answers: bring the strip back as a second row and accept the shorter map, or move both filters into a filter sheet reached from the funnel badge. Picking neither and shipping is how a filter becomes unreachable.

## States

- **Loading** — six skeleton rows using the exact row geometry (thumbnail square, a title bar at two-thirds width, a meta bar at one-third), so the swap to real rows shifts nothing. No spinner, no text. The count line reads `Betöltés`.
- **Empty** — centred column: a dumbbell outline in the tinted circle, h2 `Nincs találat`, body `Próbálj más keresőszót vagy szűrőt.`, then a solid accent `Szűrők törlése` — and that button appears **only** when a search term or a filter is actually active, so a genuinely empty catalogue is not offered a button that would change nothing.
- **Error** — there is no separate error screen. A failed request falls through to the same `Nincs találat`.
- **Offline** — the shell strip `Nincs internetkapcsolat`, with `3 művelet vár feltöltésre` when writes are queued.
- **Paging** — three extra skeleton rows appended at the tail while the next page loads; the list above never moves.
- **Role-gated** — none for reading. A coach and an admin see the identical list; the nav bar around it differs.

> [!warning]
> Empty and error being one state means a user with a dead connection is told to try a different search term. The offline strip is currently the only signal that distinguishes them, and it only appears once a *write* has failed — a read failure produces no signal at all.

## Components

- Reused as-is: `MuscleMap` in its **write** direction (`onSelect` plus `selected` — the same component the detail screen uses read-only, which is the reversible-map requirement); `Pressable` in chip shape at compact density for the filter chips and the view toggles; `FeedbackField` for the search input; `EmptyState`; `Skeleton`; the `control` recipe for every tap-target floor on the screen.
- **New**: the map's card wrapper — the `<details>`/`<summary>` element goes away entirely, so the expanded/collapsed state and its hint string both retire with it; the funnel badge glyph before `IZOMCSOPORT` (shared with the other redesigned screens); the count-row `Szűrők törlése` becomes a filled compact chip where the code has a ghost text button; and the row thumbnail changes from a square to a landscape crop, which is a real change to the reserved box and to the row's internal proportions.
- **Honest gap**: whatever answers the equipment question above is new work, not a reshape.

## Navigation

Bottom bar, `EDZÉS` active — the library lives under the training tab, not under a tab of its own. Member: five tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `PROFIL`. Coach: six. Admin: seven.

> [!warning]
> `BottomNav` clamps its tab list, and that clamp has already caused one silent bug — an admin got five tabs and `/admin` was not among them, with the route and the role check both working perfectly. Six and seven tabs cannot ship against that clamp. Decide the overflow answer once, for all three roles, before any screen assumes its tab exists.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/04-library.webp]]
![[_mockups/vilagos/04-library.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[50-UX-Concepts/Muscle Map]] · [[00-Index/TODO Master]]
