---
type: screen-spec
title: Edzéstervek — Plan library
route: /coach/plans
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Edzéstervek — Plan library

Every programme this coach has written, in one list: reusable templates and the copies that belong to a named client. The coach comes here to reopen something they are mid-way through, or to start a new template.

## Anchor

A wide stacked-segment bar in its own card, with the display total `9` and the caption `TERV ÖSSZESEN` above it, and a three-item legend under it: `Aktív 2` · `Piszkozat 3` · `Lezárva 4`.

A bar rather than a ring, for two reasons. Statuses are an ordered pipeline — draft becomes active becomes ended — and a bar reads left to right the way that pipeline does. And the ring is already spent one screen away on the roster; two rings inside one role's area stop meaning anything in particular. The question the bar answers before any row is read is "how much of my work is actually live".

## Blocks

1. **Header** — accent eyebrow `TERVEZÉS` over the h1 `Edzéstervek`.
2. **Anchor card** — total, caption, segmented bar, legend.
3. **`+ Új terv`** — a full-width filled primary, directly under the anchor.
4. **Section `Sablonok`** — clipboard icon tile, heading, template count right-aligned. Then one row per template: bold truncated name, a status chip, and a meta line `4 nap · 7 napos ciklus`, chevron on the right. The whole row is the tap target.
5. **Section `Kliens-tervek`** — person icon tile, heading, count. Identical rows with a monogram avatar leading them (`AN`, `BE`) instead of the printed email.
6. **Bottom nav.**

Cycle length is per plan and is not always a week — `Erő ciklus 5×5` reads `5 nap · 14 napos ciklus`. Never hardcode the seven.

## What was merged away, and why

- **The create card is gone entirely** — the label `Új terv neve`, the text field, its character counter, and the two-line hint `Sablonként jön létre; klienshez a kliens oldaláról rendelhető.` In its place, one button. `Új terv` creates a draft template with a default name and goes straight to the editor, where the name is the h1 and the header's `Mentés` pill commits it. Naming a thing before it exists is a worse moment to name it than naming it while looking at it.
- **The hint was not deleted, it was relocated.** `Sablonként jön létre; klienshez a kliens oldaláról rendelhető.` becomes the body of the empty state, which is the only time a coach does not already know it.
- **The client email left the row.** Four printed addresses were four wrapping strings of near-identical text; the monogram avatar identifies the client at a glance and the full address is one tap away. The status chip moved onto its own line beside the meta so it is scannable down the left edge.
- **Rows are shown at rest only.** The pressed state and the hover tint were dropped from the mockup; the first template row keeps the focus ring so the keyboard state is on the record.
- **What that bought:** the list starts in the top third instead of under a form, and the anchor now says something the old header could not — how much of the library is live.

> [!important] Two partitions of the same nine
> The legend splits by status (`Aktív` / `Piszkozat` / `Lezárva`); the sections split by scope (`Sablonok` / `Kliens-tervek`). They are different cuts of the same list and their counts will not line up — 2+3+4 and 5+4 both make 9 and neither is the other's key. Derive every one of those numbers from the single `GET /plans` array; two independent counts are two things that can disagree.

> [!warning] A create button with no name field
> If the editor does not open with the name field focused and selected, the library fills with rows that all read the same default. The naming step was not removed, it was moved — losing it there loses it entirely.

## States

- **Loading** — an anchor-card skeleton plus two row skeletons, matching the real row height so the swap causes no shift.
- **Empty** — the anchor is suppressed (a bar of zero segments is a decoration), `Új terv` stays, and below it the empty state: `Még nincs terved` / `Hozz létre egy sablont, és építsd fel egyszer — utána bármelyik kliensnek adhatod.`
- **One section only** — a coach with no client plans sees only `Sablonok`; the empty section renders nothing at all, not an empty heading.
- **Error** — generic list error under the header; the anchor is not drawn from partial data.
- **Offline** — shell indicator; `Új terv` disabled, rows still open (the detail is cached).
- **Role-gated** — coach-only route. A member who reaches the URL gets the forbidden empty state, and the server enforces it regardless of what the nav shows.

## Components

Reuses `Pressable` (the primary, and the row as a link surface), `EmptyState`, `Skeleton`, the `control` recipe for the row card, and the status-chip tones already defined for plan status. The row itself is the existing `Row` in `PlanListPage.tsx`, reshaped: icon out, chevron in, email out, avatar in.

Genuinely new: the stacked segment bar with its legend (`MacroBars` is the closest existing thing in spirit but is bound to nutrition macros), and the icon-tile section header with a trailing count — shared with the coach dashboard, so build it once. The monogram avatar is the same new component the dashboard and client detail need.

## Navigation

Bottom bar with `EDZŐ` active. Coach role: 6 tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `PROFIL`.

> [!warning] `Tervek` is no longer a tab
> The shipped nav gives `/coach/plans` its own slot. In this design it does not have one — the library is reached from the coach area, and the sixth slot belongs to `PROFIL`. Removing that tab is part of shipping this screen, not a separate cleanup.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/07-coach-plans.webp]]
![[_mockups/vilagos/07-coach-plans.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
