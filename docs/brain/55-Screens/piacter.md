---
type: screen-spec
title: Piactér — Public marketplace feed
route: /m
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Piactér — Public marketplace feed

The product's front door for someone who has never heard of it: a stranger opens a shared link and browses what coaches have published — programmes, events, announcements — filters by kind, searches, and taps through to one post. They came to find out whether there is anything here worth their attention, and they must be able to decide that without an account.

## Anchor

A wide photographic hero tile of a gym floor, cropped to fill, with one bold circular play button centred on it and a `Kiemelt` pill in its lower-left corner. Not a ring, not a chart: an anonymous visitor has no data of their own, so there is nothing countable to ring and no trend to plot. The only thing this screen can put in the top third that is not another row of text is the product's own inventory shown as a *thing*. The play button is what stops the page reading as a search-results list — it says the marketplace holds video and coaches, not records.

## Blocks

1. **Public top bar** — square icon-only back chevron on the left, an accent-filled `Belépés` pill on the right linking to `/login`. New on this route; it exists because there is no bottom bar here and the visitor needs exactly one way into the product.
2. **h1 `Piactér`** — display type, left aligned, the only h1 on the page.
3. **Featured hero tile** — cover image, card radius, play overlay, `Kiemelt` pill. Tappable as a whole.
4. **Search field** — full width, magnifier glyph inset on the left, placeholder `Programok, események, edzők…`. Two or more characters swaps the filtered feed for search results; below two it falls back to the feed. No clear-×.
5. **Kind filter row** — one horizontally scrolling line of chips, never wrapping, the right edge masked to transparent so the row cannot look finished where the viewport cut it. Chips: `Minden` (selected — check glyph, label, and a count badge reading `42`), then `Program`, `Esemény`, `Közlemény`, with the next chip deliberately sliced by the fade. Single-select; tapping the active chip clears back to `Minden`. Choosing `Esemény` re-sorts the feed to soonest-first instead of newest-first.
6. **Result list** — full-width cards, whole card one tap target → `/m/p/:id`. Each card: a leading rounded icon tile keyed to the kind (calendar / stacked sheets / megaphone), then three lines — grey meta `Esemény · Budapest · 2026. 09. 12.`, the title in medium weight, and a footer with the coach name plus verified badge on the left and the price right-aligned in tabular numerals. Announcements carry no price, so that footer holds only `Tóth Gábor`.
7. **The cut-off fourth card** at the bottom edge — the scroll affordance. There is no footer and no "load more".
8. **Search cap caption**, only while searching — `A keresés egy oldalnyi találatot ad. Szűkíts a szavakkal vagy a várossal, ha nem ezt kerested.`

## What was merged away, and why

- **The entire city chip row is gone** — `Bárhol` plus eight city chips. Two scrolling chip rows pushed the results below the fold on the one screen whose whole job is showing results, and the second row was the block that made the header read as a filter form. Cutting it bought the hero tile. The cost is real: city filtering now has no control at all. It must come back as a secondary filter (inside the search field's own sheet, or a single control beside it) — never as a second permanent row.
- **The hero tile keeps the photograph and loses the play disc.** Decided, not deferred. The product has no video player anywhere in it, so the only thing the disc could open is the post — which is exactly what tapping the tile already does. A triangle centred on a photograph that leads to a page of prose is a promise broken on the first tap, and that is worse than the bare photograph, which promises nothing it cannot keep. `MarketplacePage`'s `FeedHero` draws the tile with no overlay at all and records the same answer beside the code. The Anchor above and the Components list below still name the overlay because the mockup centres one; this bullet is the answer to it.
- **Every card's two-line excerpt is dropped.** This is the change that answers "the whole UI is data fields": the old card was meta line + title + excerpt + footer, four text rows each, six of them stacked — a wall of grey. Without the excerpt a card reads in one glance: what kind, where, when, who, how much. The server-derived excerpt still exists and still belongs on the detail screen, where a reader has already chosen to read.
- **Six cards became three and a sliver.** With the excerpt gone the list is denser per card but shorter overall, and the partial card carries the "there is more" job the removed helper caption used to carry.
- **The clear-× and the resting-state helper caption under the list are removed.** Both were affordances for a state the user is not in yet.
- **The kind icon tile is new, and it is what the excerpt paid for.** Kind was a small pill of text; now it is a shape recognisable at glance distance, which is what makes a three-line card scannable.

> [!warning]
> The `42` count badge and the `Kiemelt` pill have no data behind them. `PublicPost` carries no featured flag and `GET /public/taxonomy` returns no per-kind counts. Either the API grows both, or the badge and the pill are not drawn. Do **not** synthesise the count from the loaded page — the feed is one page, so a badge reading `42` over three visible rows would be a number the screen cannot back up.

> [!important]
> Nothing on this route sends credentials. Every query goes through `publicGet` with `credentials: 'omit'`, and the response must be byte-identical for a signed-in coach and a stranger. The `Belépés` pill is a plain link, not a session probe — reading the session here would reintroduce exactly the defect the router comment records, where the public surface was defeated at the client.

## States

- **Loading** — three card-shaped `Skeleton` blocks replace the list. The search field, the chip row and the hero keep their geometry, so the swap causes no layout shift.
- **Empty, not searching** — `EmptyState` with the compass icon: `Még nincs itt semmi` / `Amint edzők közzétesznek programokat vagy eseményeket, itt fognak megjelenni.`
- **No results, searching** — the same block: `Nincs találat` / `Próbálj más szót, vagy vedd le a városszűrőt.` That body copy names a city filter. If the city row stays cut, this string changes with it, or it tells the reader to use a control that is not on the screen.
- **Error** — there is none today: a failed feed fetch falls into the empty state, which lies about the marketplace being empty. Needs its own branch with a retry (`Újra` exists in `common`).
- **Offline** — nothing. `OfflineIndicator` is mounted inside `AppLayout`, and this route sits outside it deliberately, so a public visitor gets no offline notice at all. Fix by hoisting the indicator into `Providers` beside `ToastHost` and `LoadingAnnouncer`, which already cover public routes.
- **Role-gated** — none. Signed-out is the design centre, not a fallback.

## Components

Reuses `Pressable` for every chip (`density="compact"`, ghost/secondary variant, `aria-pressed` carrying the state so the filter is not silent to a screen reader), `EmptyState`, `Skeleton`, the `control` recipe's target-height floor, and `usePriceFormatter` — which reads minor units per currency from the taxonomy, so HUF renders `12 000 Ft` with no decimals and EUR `49,00 €`. Card and skeleton behaviour come from the E12 and E18 catalog variants.

Genuinely new: the public top bar; the featured hero tile with its play overlay and `Kiemelt` pill; the kind-icon tile on the card; and a count-badge slot on a chip. The play button implies a video player the product does not have — decide whether it opens a sheet, a native player, or simply the post detail before it is drawn, because a play button that navigates to text is a promise broken on the first tap.

## Navigation

No bottom bar. This route renders outside `AppLayout` on purpose: a bar full of tabs that all demand a login is a worse first impression than no bar. Tab count for this screen's role: none (public marketplace). `Belépés` is the only route into the authenticated product.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/08-piacter.webp]]
![[_mockups/vilagos/08-piacter.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
