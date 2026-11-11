---
type: screen-inventory
title: Piactér — screen inventory
updated: 2026-10-11
route: "/m"
tags: [ux, screen, inventory, pulse]
---

# Piactér — route `/m` · reached by EVERYONE incl. signed-out visitors (no credentials are sent; identical for stranger / member / coach / admin) · you get there by a shared link or typed URL, by `marketplace.backToFeed` = "Vissza a piactérre" / the back control from a post or coach profile, and (signed-in, desktop ≥ 1024 px only) the command-palette entry `nav.marketplace` = "Piactér" · bottom tab lit: NONE — the page renders outside the app shell, there is no bottom bar (`navTabs.ts` declares `/m` under `nav.coach` = "Edző", but the bar never renders here)

Sources read: `features/marketplace/MarketplacePage.tsx`, `PublicChrome.tsx`, `usePublic.ts`, `app/router.tsx`, `app/providers.tsx`, `backend/src/public/routes.js`, `visibility.js`, migration `021_public_marketplace.sql`, `backend/scripts/seed-demo.mjs` (§12), `55-Screens/piacter.md`. Status words: live = in code and reachable · planned = spec / API only · cut = decided against.

## Purpose

The product's front door for someone who has never heard of it: browse what coaches have published (programmes, events, announcements), narrow by kind or by a search word, tap through to one post. Nothing can be bought, booked, liked or followed here — it is a noticeboard.
**ONE primary action (as coded):** `auth.switchToLogin` = "Belépés" → `/login`. It is the only filled accent control on the screen, so in Pulse it is the one lime pill. The visitor's real task — opening a post — is a row tap, not a button.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Back control (top left) | live | Icon-only. On `/m` it is browser-history back (`navigate(-1)`) — there is no parent route. Dead on a cold shared link (nothing to go back to). | accessible name `common.back` = "Vissza" | chevron / arrow glyph |
| Login pill (top right) | live | Plain link → `/login`. ALWAYS shown, also to a signed-in reader (the page never reads the session). | `auth.switchToLogin` = "Belépés" | Belépés |
| Page title (the only h1) | live | Static. | `marketplace.title` = "Piactér" | Piactér |
| Lead tile (the anchor) | live | The FIRST post of the current feed (after the kind chip), shown as its **cover photograph only** — a wide crop (5:2 today), whole tile → `/m/p/:id`. No title, caption, badge or overlay is drawn; the title is only the accessible name. The lead is removed from the list below, so its title / coach / price appear NOWHERE on this screen today. Stays in place while searching (it is the feed's lead, never a search hit). No cover → brand gradient + the kind glyph. | no key (image; aria = post title) | cover of "Online edzésterv – 12 hét, heti visszajelzéssel" (Program · Online · Kovács Péter ✓ · 45 000 Ft — data available on the same feed row) |
| Search field | live | No visible label, leading search glyph, NO clear-×. From 2 characters the list becomes search results (fires on every keystroke, no debounce); below 2 the feed returns. Server full-text over post **title, body and city**, diacritics-insensitive, every word prefix-matched and ANDed, ONE page (max 12), relevance order. Search ignores the kind chip. Coach NAMES are not indexed. | `marketplace.searchPlaceholder` = "Programok, események, edzők…" (also the accessible name) | typed: budapest |
| Kind chip row | live | One horizontally scrolling row that never wraps (today its right edge fades out to say there is more), single choice. First chip = all kinds; then the kinds from `GET /public/taxonomy` in server order. Selected chip carries a check glyph + selected state; tapping the selected kind returns to "Minden". Filters the FEED (and therefore the lead tile). "Esemény" also re-sorts to soonest-first and shows only UPCOMING events; all other choices are newest-first. No counts. | `marketplace.allKinds` = "Minden"<br>`marketplace.kind.program` = "Program"<br>`marketplace.kind.event` = "Esemény"<br>`marketplace.kind.announcement` = "Közlemény" | Minden (selected) · Program · Esemény · Közlemény |
| Post row | live | Whole row is one tap target → `/m/p/:id`. (1) kind glyph (today a line icon: layers / calendar / megaphone; unknown kind = sheet). (2) meta line "kind · city · date" — absent parts simply vanish; date = the event's date when it has one, otherwise the publication date; date only, never a time. (3) title, max 2 lines. (4) coach display name (1 line, ellipsis) + verified tick when the coach is admin-verified. (5) price right-aligned, only when the post has one (announcements never do). City, event date and price are RENDER-ONLY today: the post editor has no field for any of them (see Notes), so a post a coach writes in the app shows "kind · publication date", title and coach name — nothing else. | kind labels as above<br>tick's accessible name `marketplace.verified` = "Ellenőrzött edző"<br>city, date, price: no key (server value / `Intl`) | Esemény · Budapest · 2026. 10. 30.<br>Guggolás-technika műhely – október 30.<br>Kovács Péter ✓ · 12 000 Ft |
| Feed length | live | First page only: max 12 posts (1 lead + 11 rows). No load-more, no pager, no total, no footer — the API returns a `nextCursor` the screen ignores. | — | demo: 6 posts = lead + 5 rows |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Search-cap caption | live | Shown under the list whenever a search is active and settled (also under "no results"). Explains why there is no "more". | `marketplace.searchCapped` = "A keresés egy oldalnyi találatot ad. Szűkíts a szavakkal vagy a várossal, ha nem ezt kerested." | as copy |
| Error panel + retry | live | Replaces the list when the feed (or the search) request fails — after two silent automatic retries, so about 3 s of skeleton come first. Retry refetches. A large glyph mark (today a warning triangle in a tinted disc), title, body, one full-width secondary button. | `marketplace.errorTitle` = "Nem sikerült betölteni a piacteret"<br>`marketplace.errorBody` = "A szerver most nem válaszolt. Próbáld meg újra."<br>`common.retry` = "Újra" | as copy |
| Empty marketplace | live | Feed returned nothing and no search is active: no lead tile either, so this block carries the top of the page (large variant: a compass glyph mark in a tinted disc, title, body). ALSO shown when a kind chip filters to zero (e.g. "Esemény" with no upcoming event) — the copy then wrongly says the whole marketplace is empty. No action. | `marketplace.emptyTitle` = "Még nincs itt semmi"<br>`marketplace.emptyBody` = "Amint edzők közzétesznek programokat vagy eseményeket, itt fognak megjelenni." | as copy |
| No search results | live | Inline (small) block under the lead tile and the chips: the same compass mark at the smaller size, title, body. No action. | `marketplace.noResultsTitle` = "Nincs találat"<br>`marketplace.noResultsBody` = "Próbálj más szót, vagy írd be a város nevét." | typed: jóga |
| Offline strip | live | App-level strip above everything (mounted in `Providers`, so it covers public routes). A signed-out visitor only ever gets the one-line form. | `offline.title` = "Nincs internetkapcsolat" | as copy |
| City filter | cut (to return as a secondary control, never as a second chip row) | The API accepts `city`; the UI has no control. The label survives only in the coach's profile editor. | `marketplace.everywhere` = "Bárhol" (not rendered here) | — |
| "Browse coaches" directory | planned (API only) | `GET /public/coaches` and the hook `useCoachDirectory` exist; no screen, no link. A coach is reachable only through one of their posts. | no key | — |
| Paging past 12 posts | planned (API only) | Cursor exists server-side; no UI. | no key | — |
| Row excerpt | cut | `excerpt` is in every feed row's payload; deliberately not drawn on the list. | — | — |
| "Kiemelt" pill · count badge on a chip · play disc on the lead tile | cut | No featured flag, no per-kind counts, no video anywhere in the product. | no key | — |

## States

- **Route chunk loading** — generic full-screen skeleton (screen-reader text `common.loading` = "Betöltés").
- **Feed loading** — top bar, title, search field and the "Minden" chip are already there; the lead tile is one skeleton block at the tile's proportion (held until the cover request has also settled); the list is three row-height skeleton blocks. Never a spinner.
- **Taxonomy pending / failed** — only "Minden" is in the chip row (no chip skeleton, no error); prices are not rendered at all until the currency table arrives (silent).
- **Feed, default** — lead tile + up to 11 rows, newest first.
- **Kind selected** — that chip shows the check + selected state, "Minden" loses it; lead tile and rows are replaced by that kind's feed (the lead tile and the three row blocks go back to skeletons while it loads). "Esemény": soonest first, upcoming only. With the demo data: "Program" = lead "Online edzésterv – 12 hét, heti visszajelzéssel" + 2 rows (Őszi erőblokk…, Félmaraton…); "Közlemény" = lead "Novembertől két új időpont" + 1 row (Ingyenes kalisztenika…); "Esemény" = ONE post, so the lead tile alone with nothing under it (the "Exactly one post" state below — the event's title is then nowhere on the screen).
- **Lead without a cover** — gradient tile with the kind glyph (in Pulse: needs its own answer, see Images).
- **Exactly one post** — lead tile only, nothing below it.
- **One character typed** — nothing changes (still the feed).
- **Search in flight** — every keystroke from the 2nd character is a new request: the rows are replaced by the three row-height skeleton blocks until it answers (the previous hits are not kept on screen); the lead tile, the chips and the typed text stay. The cap caption is hidden while loading.
- **Searching (≥ 2 characters)** — rows are search hits (max 12, the lead post may appear among them); the lead tile and chips stay; caption `marketplace.searchCapped` underneath.
- **Search, no hits** — "Nincs találat" / "Próbálj más szót, vagy írd be a város nevét." + the cap caption.
- **Empty** — "Még nincs itt semmi" / "Amint edzők közzétesznek programokat vagy eseményeket, itt fognak megjelenni." (large, no lead tile).
- **Error** — "Nem sikerült betölteni a piacteret" / "A szerver most nem válaszolt. Próbáld meg újra." / [Újra]. Title, search and chips stay above it.
- **Offline** — strip "Nincs internetkapcsolat" on top; a failed request then shows the error panel (nothing is cached for a cold visitor).
- **Role / device variants** — none. No bottom bar at any width; a signed-in member, coach or admin sees exactly the visitor's page including "Belépés". No sheets, no dialogs, no toasts on this screen.

## Frames to draw

**Frame 1 — "Piactér · feed" (default, chip "Minden").** Top to bottom:
1. Status bar. No offline strip.
2. Top bar: back glyph (left) · lime pill "Belépés" (right) — the only filled shape on the screen.
3. Title: "Piactér".
4. Lead tile: the cover photograph of the lead post, wide crop, edge to edge or edgeless per the Pulse image rule. Live code draws no text on it; if the designer sets type with it, the real data is: "Online edzésterv – 12 hét, heti visszajelzéssel" · Program · Online · Kovács Péter (verified) · 45 000 Ft.
5. Search field, placeholder "Programok, események, edzők…", leading search glyph.
6. Chip row: "Minden" (selected, check) · "Program" · "Esemény" · "Közlemény".
7. Rows, hairline-separated, in this order (newest first):
   - Közlemény · Budapest · 2026. 10. 05. / **Novembertől két új időpont** / Kovács Péter ✓ / (no price)
   - Esemény · Budapest · 2026. 10. 30. / **Guggolás-technika műhely – október 30.** / Kovács Péter ✓ / 12 000 Ft
   - Program · Budapest · 2026. 09. 18. / **Őszi erőblokk – 8 hetes csoportos program** / Kovács Péter ✓ / 69 000 Ft
   - Program · Szeged · 2026. 09. 09. / **Félmaraton 12 hét alatt – kezdőknek** / Szilágyi Réka (not verified) / 32 000 Ft
   - Közlemény · Online · 2026. 08. 25. / **Ingyenes kalisztenika bemelegítő sorozat** / Fehér Tamás (not verified) / (no price)
8. No bottom tab bar, no footer, no "load more". Home indicator only.

**Frame 2 — "Piactér · keresés" (searching "budapest").** Same top bar, title and lead tile as Frame 1. Search field filled with "budapest" (no clear-×). Chips unchanged ("Minden" selected). Rows = hits (relevance order; any order is plausible):
   - Program · Budapest · 2026. 09. 18. / Őszi erőblokk – 8 hetes csoportos program / Kovács Péter ✓ / 69 000 Ft
   - Esemény · Budapest · 2026. 10. 30. / Guggolás-technika műhely – október 30. / Kovács Péter ✓ / 12 000 Ft
   - Közlemény · Budapest · 2026. 10. 05. / Novembertől két új időpont / Kovács Péter ✓
   Then the caption: "A keresés egy oldalnyi találatot ad. Szűkíts a szavakkal vagy a várossal, ha nem ezt kerested."

**Frame 3 — "Piactér · hiba" (feed request failed).** Top bar · "Piactér" · no lead tile · search field · chip row ("Minden" only, or all four) · then the panel: "Nem sikerült betölteni a piacteret" / "A szerver most nem válaszolt. Próbáld meg újra." / secondary button "Újra". The same block with other copy is the empty state ("Még nincs itt semmi" + body, no button, larger) and the no-results state ("Nincs találat" + body, no button, with the lead tile above) — draw them as variants of this one component, not as new layouts.

## Images

- **What exists:** one coach-uploaded COVER photograph per post (re-encoded WebP; the uploader chooses it; any subject, colour, quality). The feed row payload carries NO image — the lead tile fetches its cover with one extra request, so only the lead can show a picture. In the demo seed every cover is a blank 320 × 180 placeholder file: there is no real photography to copy from.
- **What could help:** (1) for the mockup's lead tile, a generated low-key black-and-white training photograph standing in for a coach's cover (barbell in a rack, a small group on a gym floor) — and a rule for how a real, arbitrary colour upload is graded into Pulse (monochrome + fade to black is an OWNER decision: it alters coach content). (2) The three kind marks: today basic line icons in tinted tiles — the owner rejected basic line icons; candidates are three small graphite renders in the tab-icon family (stacked plates = Program, a stopwatch or whistle = Esemény, a megaphone = Közlemény) or no mark at all with the kind as a micro tag. (3) A no-cover lead: the kind render at hero size on black, never a grey box. (4) Empty / error / no-results: reuse the same render, no new art.
- **Must NOT be shown as if it existed:** coach portrait photos (a coach has only a monogram: KP, SR, FT), a cover thumbnail on every row, video or a play triangle, a "Kiemelt" ribbon, a count on a chip, star ratings, a map, category banner images, a platform logo or illustration in the header.

## Do not invent

- City filter row, "near me", map, distance. Sort control. Price or date filters. A calendar view of events.
- "Kiemelt" / featured / trending / "new" badges; per-kind counts; a result total.
- Likes, hearts, comments, saves / bookmarks, share, follow, follower counts, ratings, reviews.
- A coach directory, an "Edzők" segment or tab, coach avatars in a carousel, "top coaches".
- Load-more, infinite scroll, page numbers, pull-to-refresh as a designed feature.
- Search clear-×, recent searches, suggestions, autocomplete, voice search.
- Row excerpts, row thumbnails, remaining-seat counts, countdowns.
- Buy / apply / book / "Jelentkezem" on a row.
- A bottom tab bar, a bell, a profile avatar, a language switch, a "Regisztráció" button (only "Belépés" exists here), a coach "Új bejegyzés" action, any signed-in variant of the header.
- A play button anywhere.

## Notes for the designer

- **City is printed as the raw key on the feed today** (`budapest`, `szeged`, `online`, accents stripped: `pecs`, `gyor`) — a live bug; only the coach profile maps it to the native name. Draw the native names: Budapest, Debrecen, Szeged, Miskolc, Pécs, Győr, Nyíregyháza, Kecskemét, Székesfehérvár, Online.
- **City, event date and price have NO authoring UI today.** The post editor (`features/compose/PostEditorPage.tsx`) offers kind, title, body and one cover; it creates every post with city, event date, capacity and price empty and only passes stored values through on save. The server refuses an "Esemény" without a date, so an event cannot be created in the app at all (the "Esemény" segment is offered and the save fails). Every city / "2026. 10. 30." / "12 000 Ft" on this screen therefore comes from the demo seed (or a direct API call): the shapes and the render code are real and the frames keep them, but the row a coach produces in the app today is "Program · 2026. 10. 08." / title / coach name. Design the row so it is complete without a city and without a price, and do not make the price the row's anchor.
- **The verified tick is render-only too:** the database demands an admin as the granter, but no admin screen and no endpoint sets it — in the demo the seed does (Kovács Péter only). Do not draw a "verify" control anywhere.
- **Prices:** HUF has no minor units and `Intl` prints "69 000 Ft" (non-breaking spaces, no decimals; a four-digit amount prints ungrouped — "4500 Ft", not "4 500 Ft"); EUR prints as "49,00 EUR". The demo seed stores `6900000` for a 69 000 Ft programme, so the running demo actually shows "6 900 000 Ft" — a seed bug; the intended values (used above) are 69 000 / 12 000 / 45 000 / 32 000 Ft.
- **Seed titles adapted to the reference moment (Fri 9 Oct 2026):** the seed says "Guggolás-technika műhely – szeptember 14." and "Szeptembertől két új időpont" while its dates are relative to the day it runs; above they read "– október 30." and "Novembertől …" so title and date agree. Everything else is seed-verbatim (coaches Kovács Péter ✓ Budapest, Szilágyi Réka — Szeged, Fehér Tamás — Online).
- **Long strings:** a title may be 140 characters (2-line clamp on a row); a coach name may be 120 (one line, ellipsis, must not push the price off); `marketplace.searchCapped` is 94 characters and wraps to 3 lines at caption size; `marketplace.emptyBody` wraps to 3; the placeholder "Programok, események, edzők…" is 28 characters and must fit beside the glyph at 360 pt.
- **The placeholder promises "edzők" but coach names are not searched**, and the no-results tip "írd be a város nevét" works only because the city key is indexed (typing "Pécs" matches `pecs`). Do not add a coach-result row type.
- **The lead post's identity is invisible on the feed** (cover only, removed from the list). Setting its title / kind / price in type beside the image uses data that is already in this screen's payload and is not an invented feature — but it is a visible change from the live screen; flag it to the owner.
- **Search does not respect the kind chip**, and the chips stay tappable during a search (they then change only the lead tile). Do not draw a "Program + search" combined state as if it filtered.
- **"Belépés" for a signed-in user** leads to the login form (no redirect). The signed-in case has no design answer in the product; do not draw one.
- **No primary action competes with the pill:** rows are text; there is nothing else filled. A back control on a page with no history is the one weak element — keep it quiet.
- Dates are numeric ("2026. 10. 30."), produced by `toLocaleDateString` in the app language; there is no "ma / tegnap / 3 napja" wording here.
