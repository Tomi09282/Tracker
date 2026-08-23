---
type: screen-spec
title: Bejegyzés részletei — Marketplace post detail
route: /m/p/:publicId
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Bejegyzés részletei — Marketplace post detail

One coach's programme, event or announcement read in full by a stranger who followed a link. This is the screen in the whole product that a cold visitor is most likely to land on first. They came to answer three questions — what is this, what does it cost me in time and money, and how do I get in — and then to decide whether to contact the coach.

## Anchor

The post's own cover image, full width and rounded, with one bold circular play button centred on it. A photo rather than a ring or a chart because a programme or an event is judged on what the room looks like and who is in it — and because this is the only element on the screen that is not text. The cover is also the post's own content, not decoration: whoever published it chose it.

## Blocks

1. **Public top bar** — square back arrow on the left, `Belépés` pill on the right. This replaces the inline `← Vissza a piactérre` text link that used to open the page; the string survives and is still used in the gone state.
2. **Cover image** — cropped to fill, lazy-loaded, served through the gated public media route, with the play overlay on top.
3. **Meta row** — small grey type, wrapping: kind pill `Program`, then pin + `Szeged`, then calendar + `2026. 09. 12.` Time and capacity are no longer here.
4. **h1** — the post title, `Őszi alapozó erőprogram kezdőknek`, the largest type on the screen. The page owns this h1; the body's own headings start one level down.
5. **Coach card row** — a bordered row holding the coach's avatar, `Kovács Péter` with the verified badge, an `Ellenőrzött edző` chip beneath the name, and a chevron on the right. The whole row taps through to `/m/c/:handle`.
6. **Three summary tiles** — icon over number over caption: `8` / `Hét`, `2` / `Heti alkalom`, `24` / `Szabad hely`.
7. **Body lead** — one paragraph opening with a bold run: `Heti két közös edzés` … Line length stays capped at a comfortable measure.
8. **`Kinek szól?`** — an icon-led h2, then three icon-led rows, one line each: `Aki most kezdi a súlyzós edzést.` / `Aki már edz, de a technikáján javítana.` / `Aki heti két alkalmat biztosan be tud tervezni.`
9. **Price card** — bordered, on a raised surface: the price `45 000 Ft` in large tabular numerals, a full-width primary button `Jelentkezem`, and the disclaimer caption beneath it.

## What was merged away, and why

- **The body document was cut to roughly a third.** The opening paragraph loses a line; the numbered three-step list, the block quotation, the closing paragraph with its host-annotated link, and the six-thumbnail gallery are all dropped. What is left is a lead paragraph and one answer to one question.
- **The four-item bulleted list became three icon-led rows under `Kinek szól?`** This is the most important single change on the screen. A bullet list is precisely the shape that made the previous design read as data fields — same content, no visual entry point, nothing to land the eye on. Icon-led rows carry the same three sentences and can be scanned instead of read.
- **The meta row lost its time and its capacity field**, and capacity moved into a tile. The reader's "is there room" question was previously a small grey clause at the end of a wrapping caption row, ranked equal with the city; it is now one of three things they see before scrolling.
- **What all of that bought:** the three questions are answered above the fold — who is behind it (coach row), what it costs in commitment (tiles), what it costs in money (price card) — instead of being buried inside a document the visitor has to read to extract them.

> [!warning]
> Two of the three tile values do not exist. `PublicPost` carries city, event time, capacity, price and the document — nothing about duration or weekly frequency. `8 Hét` and `2 Heti alkalom` are new authored fields on the post, which means new inputs and new validation in the post editor. And `24 Szabad hely` is a re-label of `capacity`, which is the **total**, not the remainder: the caption claims a live seat count the product does not track and cannot honour. Either label the tile with what the field means — the existing plural string renders `24 hely` — or build booking. A stale "free seats" number on a public page is the kind of wrong that gets a coach shouted at.

> [!warning]
> The mockup's price caption reads `Az ár tájékoztató, a jelentkezés az edzővel közvetlenül történik.` The real string is `Az ár tájékoztató. A jelentkezés az edzővel közvetlenül történik — a fizetés még nem az appon keresztül megy.` The clause the mockup dropped is exactly the clause that stops a button labelled `Jelentkezem` from reading as a checkout. Keep the full string, or do not ship the button — there is no purchase path in this phase, and a price beside a button that silently does nothing is worse than a price beside a sentence that tells the truth.

> [!important]
> The body is a closed node tree walked into React elements by `DocRenderer` — no HTML string exists at any point between the coach's keyboard and the screen. The icon-led rows must be rendered by `DocRenderer` from a list node, not by a hand-built markup path in this page, or the coach's bio and their post body diverge in what they are allowed to contain. Two renderers is two sanitisers, and one of them will be the weaker one.

Body links keep both of their rules: the destination host is always appended in small grey parentheses after the label — `jelentkezés itt (forms.gle)` — and a link whose scheme is not http or https silently renders as plain text. These are this page's only defence on a route a stranger arrives at cold.

## States

- **Loading** — the current skeleton (a title bar and one block) must grow to the new geometry: cover, coach row, tile row, then body. Otherwise the swap shifts the layout, which is the one thing `Skeleton` exists to prevent.
- **Gone / error** — a draft, a removed post and one that never existed are **one** answer, matching the server: `EmptyState` with `heading="h1"`, the file-with-question-mark icon, `Ez a bejegyzés nem érhető el` / `Lehet, hogy elköltözött, vagy a szerzője levette. A piactéren továbbra is böngészhetsz.`, then the `Vissza a piactérre` link. Do not split these — a "this was removed" message is an oracle for the existence of removed content.
- **No cover** — the hero is absent entirely, the meta row becomes the first block, and the h1 becomes the anchor. Do not draw a placeholder image; an empty grey rectangle is worse than none.
- **No price** — the entire price card is absent, button and caption included. `Közlemény` posts routinely have no price, and a bare `Jelentkezem` with nothing to apply to is a dead control.
- **No gallery** — the grid renders only when there is more than one image; a single image is the cover and nothing else.
- **Offline** — none, same public-shell gap: `OfflineIndicator` is mounted in `AppLayout`, which this route sits outside.
- **Role-gated** — none. Byte-identical for a visitor, a member and the coach who wrote it.

## Components

Reuses `DocRenderer` (the whole body, including the new icon rows), `EmptyState` with `heading="h1"`, `Skeleton`, `usePriceFormatter` (minor units per currency, so HUF renders `45 000 Ft` with no decimals), the verified badge with its `Ellenőrzött edző` label, `Pressable` for the primary button, and the `control` recipe.

Genuinely new: the public top bar; the play overlay on the cover; the coach card row with avatar and chevron (today this is a bare text link); the three-up summary tile — the **same** component the coach profile needs, so build it once in `ui/`; the icon-led list row inside `DocRenderer`; and the price card's primary button, which needs its destination decided before it is drawn.

## Navigation

No bottom bar. This route renders outside `AppLayout`, along with the rest of the public marketplace. Tab count for this screen's role: none (public marketplace). Three ways off the screen: back to `/m`, through to the coach at `/m/c/:handle`, and `Belépés` to `/login`.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/11-marketplace-post-detail.webp]]
![[_mockups/vilagos/11-marketplace-post-detail.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
