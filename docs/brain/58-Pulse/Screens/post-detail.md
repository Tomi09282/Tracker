---
type: screen-inventory
title: Poszt részletei — screen inventory
updated: 2026-10-11
route: "/m/p/:publicId"
tags: [ux, screen, inventory, pulse]
---

# Poszt részletei — route `/m/p/:publicId` · reached by EVERYONE incl. signed-out visitors (no credentials are sent; byte-identical for stranger / member / the coach who wrote it / admin) · you get there by tapping the lead tile or a row on `/m`, a row under `marketplace.theirPosts` = "Bejegyzései" on a coach profile, a shared link, or (admin only) `admin.marketplace.openLive` = "Élő oldal megnyitása" in the moderation queue, which opens it in a new browser tab · bottom tab lit: NONE — outside the app shell, no bottom bar

Sources read: `features/marketplace/PostPage.tsx`, `DocRenderer.tsx`, `PublicChrome.tsx`, `usePublic.ts`, `backend/src/public/routes.js`, `visibility.js`, `compose.js` (limits), migration `021_public_marketplace.sql`, `seed-demo.mjs` (§12), `55-Screens/marketplace-post-detail.md`. The screen has no Hungarian title string: its h1 is the post's own title ("Poszt részletei" is only this document's name).

## Purpose

One coach's programme, event or announcement, read in full by someone who followed a link — the screen a cold visitor most likely lands on first. It answers, in order: what is this, who is behind it, where / when / is there room, what does it cost. Then the reader contacts the coach OUTSIDE the app.
**ONE primary action: there is none.** No apply, buy, book or message exists (the price is informational). The only onward taps are the coach row → `/m/c/:handle`, the back control → `/m`, and the quiet `auth.switchToLogin` = "Belépés" → `/login`. As coded the screen has ZERO filled controls — so in Pulse it has no lime pill unless the owner decides otherwise.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Back control (top left) | live | Icon-only link, ALWAYS to `/m` (also when you came from a coach profile or a shared link). | accessible name `common.back` = "Vissza" | chevron / arrow glyph |
| Login link (top right) | live | Plain link → `/login`, drawn at the same quiet weight as the back control (not filled). Always shown, also to signed-in readers. | `auth.switchToLogin` = "Belépés" | Belépés |
| Cover image (optional) | live | The post's cover (role "cover", else its first image), wide crop (16:9 today), not tappable, no overlay. Alt text is the coach's own (may be empty). No cover → the block is absent and the title becomes the top of the page; never a placeholder. | no key (image) | cover of the event (seed alt: "… – borítókép") |
| Meta row | live (kind tag) · render-only today (city, date, capacity — no authoring UI, see Notes) | Up to four groups separated by middle dots, each only when present: (1) kind tag (today a small filled tag); (2) city, led by a pin glyph; (3) event DATE, led by a calendar glyph — drawn for any post that has an event date, which in practice means events (the only kind that requires one); date only, no time; (4) capacity, led by a people glyph — events only (the other kinds may not carry one); it is the TOTAL number of places, not places left. A post without an event date shows no date at all here (its publication date is not on this screen). | `marketplace.kind.program` = "Program" · `marketplace.kind.event` = "Esemény" · `marketplace.kind.announcement` = "Közlemény"<br>`marketplace.capacity` = "{{count}} hely"<br>city, date: no key | Esemény · Budapest · 2026. 10. 30. · 16 hely |
| Title (the only h1) | live | The post title, 3–140 characters, never clamped. | no key (coach's text) | Guggolás-technika műhely – október 30. |
| Coach row | live | Whole row → `/m/c/:handle`. Monogram (two initials from the display name — no photo exists), display name (1 line, ellipsis), verified tick beside the name and the words under it — both only when the coach carries the verified flag (database-enforced as admin-granted, but no admin screen or endpoint sets it today; in the demo the seed does); trailing chevron. | `marketplace.verified` = "Ellenőrzött edző"<br>name: no key | KP · Kovács Péter ✓ · Ellenőrzött edző · › |
| Body document | live | The coach's text as a closed set of blocks, rendered in order: paragraph · level-2 heading (today with one fixed target glyph in front) · level-3 heading · unordered list (rows led by a check mark, not bullets) · ordered list (rows led by their number 1, 2, 3 …) · block quote. Inline: bold, italic, line break, link. A link shows its label followed by the destination host in small grey parentheses and opens in a new tab; a non-http(s) link renders as plain text. No images, tables, code or nested lists can occur. Up to 20 000 characters. | no key (coach's text) | see Frames 1 and 2 |
| Price block (optional) | live render · no authoring UI today (see Notes) | Only when the post has a price (programmes and events; never announcements): the formatted amount as one large numeral + the full disclaimer. NOT a button, nothing to tap. | `marketplace.priceNote` = "Az ár tájékoztató. A jelentkezés az edzővel közvetlenül történik — a fizetés még nem az appon keresztül megy."<br>amount: no key (`Intl`) | 12 000 Ft |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Loading skeleton | live | Top bar real; blocks for cover, meta line, two title lines, coach row, three body lines. | screen-reader `common.loading` = "Betöltés" | — |
| Gone / error state | live | ONE answer for draft, withdrawn, moderator-removed, never-existed and any failed request (deliberately indistinguishable). Mark (today a document-with-question-mark glyph in a tinted disc) + title (this state's h1) + body + a text link back. Top bar stays. It appears only after two silent automatic retries — about 3 s of the loading skeleton come first, also for a post that simply does not exist. | `marketplace.postGoneTitle` = "Ez a bejegyzés nem érhető el"<br>`marketplace.postGoneBody` = "Lehet, hogy elköltözött, vagy a szerzője levette. A piactéren továbbra is böngészhetsz."<br>`marketplace.backToFeed` = "Vissza a piactérre" | as copy |
| Offline strip | live | App-level strip above the top bar. | `offline.title` = "Nincs internetkapcsolat" | as copy |
| Extra images (gallery) | live code, no data path | If a post had more than one image, images 2…n would show as a 3-column grid of square thumbnails under the price (not tappable, no lightbox). The composer uploads exactly ONE cover, so no real post reaches this. | no key | do not draw |
| Event time of day | cut (from this row) | `eventAt` carries a time and `eventTz` a zone; the screen prints the date only. | no key | (a time of day exists in the data, not shown) |
| Coach headline in the coach row | planned (in the payload, not rendered) | `coachHeadline` arrives with every post. | no key | Erőnléti edző · 12 év tapasztalat · Budapest és online |
| "Jelentkezem" button | cut | Was in the old mockup; not built because it has no destination. | no key | — |
| Three summary tiles (8 Hét · 2 Heti alkalom · 24 Szabad hely) | cut | Duration and weekly frequency are not fields; "free places" is not tracked. | no key | — |
| Play overlay on the cover | cut | No video in the product. | no key | — |
| Report this post | planned (API only: `POST /reports`) | No button, no copy on this screen. | no key | — |

## States

- **Route chunk loading** — generic full-screen skeleton (`common.loading` = "Betöltés").
- **Loading** — the shaped skeleton above; never a spinner.
- **Loaded, event** — cover · meta with city + date + capacity · title · coach row · body · price.
- **Loaded, programme** — meta is kind + city only (no date, no capacity); price usually present.
- **Loaded, announcement** — kind + city only; NO price block at all.
- **Loaded, a post written in today's editor** — the editor has no city, date, capacity or price field, so the page is: optional cover · meta row = the kind tag ALONE · title · coach row · body · end. No price block. This is the real common case; the event and programme frames show seed data.
- **No cover** — image block absent; meta row is the first content under the top bar.
- **No city** — that group and its dot vanish (the row never starts or ends with a dot).
- **Unverified coach** — no tick and no "Ellenőrzött edző" line; the coach row is monogram + name + chevron.
- **Price pending** — the price block is absent until the currency table (taxonomy) has loaded, then appears (silent; no skeleton of its own).
- **Gone / error** — "Ez a bejegyzés nem érhető el" / "Lehet, hogy elköltözött, vagy a szerzője levette. A piactéren továbbra is böngészhetsz." / link "Vissza a piactérre". There is no retry control and no separate network-error message (the request is retried twice automatically before this state shows).
- **Offline** — strip "Nincs internetkapcsolat"; a cold load then ends in the gone state.
- **Role / device variants** — none. No sheets, dialogs or toasts. Links in the body leave the app (new tab).

## Frames to draw

**Frame 1 — "Poszt · esemény" (the fullest case; draw as one tall scroll).** Top to bottom:
1. Status bar. Top bar: back glyph (left) · quiet text link "Belépés" (right). No filled shape.
2. Cover photograph, wide (seed alt text: "Guggolás-technika műhely – szeptember 14. – borítókép").
3. Meta row: "Esemény" (tag) · Budapest · 2026. 10. 30. · 16 hely.
4. Title: "Guggolás-technika műhely – október 30."
5. Coach row: monogram "KP" · "Kovács Péter" + verified tick · "Ellenőrzött edző" · chevron.
6. Body:
   - paragraph: "Háromórás gyakorlati műhely a guggolás technikájáról."
   - list (three check-led rows): "állásszélesség és lábfejállás" · "törzsfeszítés és légzés" · "gyakori hibák videóelemzéssel"
   - paragraph: "Hozz magaddal edzőcipőt és kényelmes ruhát."
7. Price: "12 000 Ft", then "Az ár tájékoztató. A jelentkezés az edzővel közvetlenül történik — a fizetés még nem az appon keresztül megy."
8. End of page. No bottom bar, no sticky footer, no related posts.

**Frame 2 — "Poszt · program" (the document vocabulary: heading, numbered list, quote).** Same top bar and cover slot. Then:
1. Meta row: "Program" (tag) · Online. (Nothing else — no date, no capacity.)
2. Title: "Online edzésterv – 12 hét, heti visszajelzéssel" (wraps to 2–3 lines in the display face).
3. Coach row: "KP" · "Kovács Péter" ✓ · "Ellenőrzött edző" · chevron.
4. Body:
   - paragraph: "Táv-edzésterv azoknak, akik saját termükben edzenek."
   - level-2 heading: "Így működik"
   - numbered rows: 1 "felmérő beszélgetés és mozgásvizsgálat videón" · 2 "tizenkét hetes terv, négyhetes blokkokban" · 3 "heti videós visszajelzés a fő gyakorlatokra"
   - quote: "A terv annyit ér, amennyit végre is hajtasz belőle."
5. Price: "45 000 Ft" + the same disclaimer.
   Type specimen to add beside this frame (no seeded post contains them; the link text is an illustrative placeholder, not product or seed copy): a level-3 heading, bold and italic runs, and a link drawn as "jelentkezés itt (forms.gle)" — label in the link style, host in small grey parentheses.

**Frame 3 — "Poszt · nem érhető el" (gone / error).** Top bar as above · then, carrying the whole page: "Ez a bejegyzés nem érhető el" (h1) · "Lehet, hogy elköltözött, vagy a szerzője levette. A piactéren továbbra is böngészhetsz." · link with a back arrow: "Vissza a piactérre". Nothing else. The coach-profile gone state is the same layout with other copy — build once.

Derivable variants (do not need their own frame): announcement = Frame 1 without date, capacity and price ("Közlemény · Budapest", title "Novembertől két új időpont", body "Novembertől kedden és csütörtökön 6:30-kor is indul csoport." + "A jelentkezés a szokásos módon, üzenetben megy. Az online kliensek időpontja nem változik."); no cover = remove block 2; unverified coach = "FT · Fehér Tamás ›".

## Images

- **What exists:** at most ONE cover photograph, chosen and uploaded by the coach (WebP, arbitrary subject / colour / quality, with optional alt text). In the demo seed every cover is a blank 320 × 180 placeholder, so the mockup needs a stand-in.
- **What could help:** a generated low-key black-and-white photograph that plausibly IS a coach's cover — for the event a barbell on a squat rack or a coach watching a squat from the side; for the online programme a phone on a tripod filming a lift. Fade its edges into the black per the Pulse image rule. How real colour uploads get graded (monochrome or left as they are) is an owner decision — it changes coach content.
- **Marks, not images:** the kind tag, the list check, the ordered-list numerals and the heading mark are today small line glyphs in tinted tiles; the meta row adds three more small line glyphs (pin before the city, calendar before the date, people before the capacity) and the gone state a large one. None of them is required — the words carry the meaning. In Open Field they are better as type: a micro tag for the kind, condensed lime-or-ink numerals for ordered rows, a short hairline or a lime tick for list rows. The fixed target glyph before every level-2 heading can simply go (the renderer cannot choose an icon per heading).
- **Must NOT be shown as if it existed:** a coach portrait (monogram only: KP), a play triangle or video scrubber, an image carousel / gallery / lightbox, a venue photo or map, sponsor or certificate logos, per-step illustrations in the body (the body cannot contain images).

## Do not invent

- "Jelentkezem", buy, book, reserve, add to cart, checkout, pay, coins.
- Message / contact / call / e-mail the coach; a contact sheet; a chat bubble.
- Places LEFT, "almost full", a progress bar of seats, a waiting list — capacity is a plain total.
- Duration, weekly frequency, level, equipment or any stat tile — a post has only kind, city, event date, capacity, price and the document.
- Event time, end time, address, venue, map, "add to calendar", countdown.
- Like, save, share, comment, rating, review, view count, "x people interested".
- Report or block controls; "more from this coach"; related posts; next / previous post.
- Publication date or "edited" stamp; author byline beyond the coach row; reading time; excerpt.
- A sticky bottom action bar, a floating button, a bottom tab bar, a signed-in header variant.
- A second price (discount, per-month, "from"), a currency switcher, VAT notes.
- Tappable images, zoom, a gallery (the code path is unreachable).

## Notes for the designer

- **`marketplace.priceNote` is 109 characters** and must be shown IN FULL beside the price — it is the sentence that stops a price from reading as a checkout. It wraps to 3–4 lines at caption size; give it the full column, do not shorten or truncate it.
- **`marketplace.postGoneBody` is 87 characters** (3 lines). "Ellenőrzött edző" is 16 characters — as a micro tag in capitals it needs about half the column.
- **City is printed as the raw key today** (`budapest`, `online`; `pecs`, `gyor` without accents) — a live bug. Draw native names (Budapest, Online, Pécs, Győr …).
- **Seed adaptations:** the seed title is "Guggolás-technika műhely – szeptember 14." with an event date 21 days after the seed run; for the reference moment (Fri 9 Oct 2026) it reads "– október 30." with 2026. 10. 30. The seed price `1200000` renders as "1 200 000 Ft" in the running demo (HUF has no minor units) — a seed bug; the intended 12 000 Ft / 45 000 Ft / 69 000 Ft are used here. Body texts above are seed-verbatim, with one adaptation that follows the adapted announcement title: the seed sentence is "Szeptembertől kedden és csütörtökön 6:30-kor is indul csoport." and reads "Novembertől …" here.
- **City, event date, capacity and price have NO authoring UI today.** The post editor (`features/compose/PostEditorPage.tsx`) offers kind, title, body and one cover; it creates every post with those four fields empty and only passes stored values through on save. The server refuses an "Esemény" without a date, so an event cannot be created in the app at all. Frames 1 and 2 are therefore seed data (real shapes, live render code) — keep them, but the page must also stand complete as kind tag · title · coach row · body with no cover, no city, no date and no price (see States). Do not let the price block or the date carry the layout.
- **Title length:** up to 140 characters with no clamp. In the condensed display face at subject size the 47-character "Online edzésterv – 12 hét, heti visszajelzéssel" is already 2–3 lines; design the title block to grow.
- **The body is the bulk of the screen and is author-controlled:** it can be one sentence or 20 000 characters with a dozen headings. Every block type needs an Open Field style that works with no boxes; list rows are full-width text rows, not cards.
- **Capacity reads "16 hely"** (places in total). Never relabel it "szabad hely".
- **Zero filled controls is the coded truth.** If the owner wants the lime pill here, the only honest candidate today is the coach row ("see the coach") — there is no string for a button label, so that would be new copy in hu / en / de.
- **Back always goes to `/m`,** not to where the reader came from (a coach profile, for instance).
- **Signed-in readers** still see "Belépés" and get the login form; there is no signed-in variant to draw.
- Numerals: the price is the one big figure on the screen — a natural place for the Pulse stat numeral; the amount keeps its non-breaking spaces and the "Ft" unit ("12 000 Ft").
