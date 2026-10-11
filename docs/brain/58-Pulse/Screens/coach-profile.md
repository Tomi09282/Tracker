---
type: screen-inventory
title: Edzői profil (nyilvános) — screen inventory
updated: 2026-10-11
route: "/m/c/:handle"
tags: [ux, screen, inventory, pulse]
---

# Edzői profil (nyilvános) — route `/m/c/:handle` · reached by EVERYONE incl. signed-out visitors (no credentials are sent; identical for stranger / member / coach / admin — the coach sees their own page exactly as a stranger does) · you get there ONLY by tapping the coach row on a post (`/m/p/:publicId`) or by a shared link; there is no coach list anywhere · bottom tab lit: NONE — outside the app shell, no bottom bar

Sources read: `features/marketplace/CoachProfilePage.tsx`, `DocRenderer.tsx`, `PublicChrome.tsx`, `usePublic.ts`, `lib/person.ts`, `backend/src/public/routes.js`, `visibility.js`, `compose.js` (limits), migration `021_public_marketplace.sql`, `seed-demo.mjs` (§12), `55-Screens/edzoi-profil.md`. The screen has no Hungarian title string: its h1 is the coach's display name.

## Purpose

One coach, seen by a stranger asking a single question — who is this and would I trust them with my training — and then browsing everything that coach has published. The page is identity (name, one-line headline, the admin-granted verified mark, city, specialties, a short bio) followed by the coach's posts.
**ONE primary action: there is none.** No contact, message, follow or booking exists. The only taps are a post row → `/m/p/:id`, the bio expander, the back control → `/m` and the quiet `auth.switchToLogin` = "Belépés" → `/login`. As coded the screen has ZERO filled controls.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Back control (top left) | live | Icon-only link, always to `/m` (not back to the post you came from). | accessible name `common.back` = "Vissza" | chevron / arrow glyph |
| Login link (top right) | live | Plain link → `/login`, quiet (not filled). Always shown. | `auth.switchToLogin` = "Belépés" | Belépés |
| Identity anchor: monogram | live | Two initials computed from the display name (two words → first letter of each; one word → its first two letters), very large, centred today inside a complete decorative ring. A coach has NO photo field. The ring is a frame, never a meter — it must not look like progress. | no key (computed) | KP |
| Verified mark | live render · granted only by the seed / database today | Shown only when the coach carries the verified flag (database-enforced as admin-granted; the one credential on the page that is not self-typed). No admin screen and no endpoint sets the flag yet — in the demo the seed does. Today a filled tick riding on the monogram's frame, and repeated in words in the caption row. | `marketplace.verified` = "Ellenőrzött edző" | ✓ Ellenőrzött edző |
| Display name (the only h1) | live | 2–120 characters, coach's own text. | no key | Kovács Péter |
| Headline (optional) | live | One free-text line, up to 120 characters, not clamped (wraps). Absent when empty. | no key | Erőnléti edző · 12 év tapasztalat · Budapest és online |
| Credential caption row (optional) | live | "verified words · city" — each part only when present, the dot only between two present parts; the whole row is absent for an unverified coach without a city. City = the native name from the public city list (10 values incl. "Online"), today led by a small pin glyph. | `marketplace.verified` = "Ellenőrzött edző"<br>city: no key (server list) | Ellenőrzött edző · Budapest |
| Specialty labels (0–6) | live | Plain labels in server order, NOT tappable, not filters. Absent when the coach chose none. The 14 possible values are all translated. | `public.specialty.strength` = "Erő"<br>`public.specialty.hypertrophy` = "Izomtömeg"<br>`public.specialty.rehabilitation` = "Rehabilitáció"<br>`public.specialty.nutrition` = "Táplálkozás"<br>(full list in Notes) | Erő · Izomtömeg · Rehabilitáció · Táplálkozás |
| Bio (optional) | live | The coach's introduction — the same block document as a post body (paragraphs, level-2 / level-3 headings, check-led and numbered lists, quote, bold / italic / links with the host in parentheses), up to 8 000 characters. Collapsed to the height of TWO body lines; the expander appears only if the text really overflows and toggles the full document in place. Absent when empty. | `common.more` = "Több"<br>`common.less` = "Kevesebb" | collapsed + "Több" |
| Posts section heading | live | Always shown, even with no posts. Today led by a small bookmark glyph. | `marketplace.theirPosts` = "Bejegyzései" | Bejegyzései |
| Post row | live | The coach's published posts, newest PUBLISHED first, max 24, no paging. Whole row → `/m/p/:id`. Kind mark, meta "kind · date" (event date when it has one, else publication date; date only), title on ONE line with ellipsis. No city, no price, no excerpt, no coach name on these rows. | `marketplace.kind.program` = "Program"<br>`marketplace.kind.event` = "Esemény"<br>`marketplace.kind.announcement` = "Közlemény" | Program · 2026. 10. 08.<br>Online edzésterv – 12 hét, heti visszajelzéssel |
| No-posts line | live | One quiet caption in place of the list. | `marketplace.noPostsYet` = "Még nincs közzétett bejegyzése." | as copy |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Loading skeleton | live | Top bar real; blocks for the monogram, name, headline, caption, four labels, two bio lines, the section heading and three rows. | screen-reader `common.loading` = "Betöltés" | — |
| Gone / error state | live | ONE answer for unpublished, moderator-removed, never-existed handle and any failed request. Mark (today a crossed-out person glyph in a tinted disc) + title (this state's h1) + body + text link back. Top bar stays. No retry control; the request is retried twice automatically first, so about 3 s of the loading skeleton precede this state. | `marketplace.coachGoneTitle` = "Ez a profil nem érhető el"<br>`marketplace.coachGoneBody` = "Lehet, hogy még nincs közzétéve, vagy már nem elérhető."<br>`marketplace.backToFeed` = "Vissza a piactérre" | as copy |
| Offline strip | live | App-level strip above the top bar. | `offline.title` = "Nincs internetkapcsolat" | as copy |
| "Kapcsolatfelvétel" (contact) button | cut | In the old mockup; not built — the page has no message path by decision and no contact field exists. | no key | — |
| Three summary tiles (12 Év tapasztalat · 48 Kliens · 6 Program) | cut (open owner question: computed or self-typed) | None of the three numbers is a field. | no key | — |
| `@handle` under the name | cut | The handle lives only in the URL. | no key | kovacs-peter |
| Follow / follower count | cut | A follows table is seeded, but there is no endpoint and no UI; follower numbers are deliberately never shown. | no key | — |
| "Listed since" date | planned (in the payload, not rendered) | `publishedAt` arrives with the profile. | no key | — |
| Report this profile | planned (API only: `POST /reports`) | No button, no copy. | no key | — |

## States

- **Route chunk loading** — generic full-screen skeleton (`common.loading` = "Betöltés").
- **Loading** — the shaped skeleton above; never a spinner.
- **Verified coach, full profile** — everything in the MUST table.
- **Unverified coach** — no tick; the caption row shows only the city (or is absent).
- **No headline / no city / no specialties / no bio** — each block is simply absent; nothing leaves an empty shell. Minimum page: monogram, name, "Bejegyzései", and rows or the no-posts line.
- **City name pending** — for a moment the raw key ("budapest") can show before the city list arrives.
- **Bio collapsed** — two lines + "Több" (only if it overflows; a one-line bio has no expander).
- **Bio expanded** — the full document + "Kevesebb"; the page grows, nothing opens in a sheet.
- **No posts** — heading "Bejegyzései" + "Még nincs közzétett bejegyzése."
- **Gone / error** — "Ez a profil nem érhető el" / "Lehet, hogy még nincs közzétéve, vagy már nem elérhető." / link "Vissza a piactérre".
- **Offline** — strip "Nincs internetkapcsolat"; a cold load then ends in the gone state.
- **Role / device variants** — none (the owner coach gets no edit button here; editing lives at `/compose/profile`, reached from the coach's desk `/compose`, which itself has no phone door). No sheets, dialogs or toasts.

## Frames to draw

**Frame 1 — "Edzői profil · Kovács Péter" (verified, bio collapsed).** Top to bottom:
1. Status bar. Top bar: back glyph (left) · quiet text link "Belépés" (right). No filled shape.
2. Monogram "KP" at hero size (the approved Profile screen sets the member's "TD." flush left with a lime full stop — the same device fits here as "KP."), with the verified tick attached to it.
3. Name: "Kovács Péter".
4. Headline: "Erőnléti edző · 12 év tapasztalat · Budapest és online".
5. Caption row: "Ellenőrzött edző · Budapest".
6. Specialty labels: "Erő" · "Izomtömeg" · "Rehabilitáció" · "Táplálkozás".
7. Bio, collapsed to two lines, then "Több". Text to set (the seed bio opens with a heading, then a paragraph): "Kinek szól" / "Olyan felnőtteknek, akik **komolyan** akarnak erősödni, de a hetük nem edzőterem köré épül."
8. Section heading: "Bejegyzései".
9. Four rows (newest published first):
   - Program · 2026. 10. 08. / Online edzésterv – 12 hét, heti visszajelzéssel
   - Közlemény · 2026. 10. 05. / Novembertől két új időpont
   - Esemény · 2026. 10. 30. / Guggolás-technika műhely – október 30.
   - Program · 2026. 09. 18. / Őszi erőblokk – 8 hetes csoportos program
10. End of page. No bottom bar, no sticky action.

**Frame 2 — "Edzői profil · bio kinyitva" (expanded bio; draw as a tall scroll).** Blocks 1–6 as Frame 1, then the whole document and "Kevesebb":
   - level-2 heading: "Kinek szól"
   - paragraph: "Olyan felnőtteknek, akik **komolyan** akarnak erősödni, de a hetük nem edzőterem köré épül." ("komolyan" is bold)
   - list (three check-led rows): "heti 3-4 edzés, 60-75 perc" · "minden hétre írásos terv és videós visszajelzés" · "táplálkozási keret, nem diéta"
   - level-2 heading: "Hogyan dolgozom"
   - paragraph: "Az első hónap felmérés és technika. Utána négyhetes blokkokban haladunk, a negyedik hét mindig könnyebb."
   - quote: "Aki minden héten rekordot akar dönteni, három hónap múlva sérült lesz."
   - paragraph: "Írj bátran, ha kérdésed van."
   - "Kevesebb"
   Then "Bejegyzései" and the four rows as in Frame 1.

**Frame 3 — "Edzői profil · Fehér Tamás" (unverified, sparse).** Top bar as above · monogram "FT" with NO tick · name "Fehér Tamás" · headline "Kalisztenika és saját testsúly · Online" · caption row: "Online" (city only, no dot) · labels "Mobilitás" · "Saját testsúlyos" · bio collapsed: "Saját testsúlyos programok, felszerelés nélkül vagy egy rúddal." + "Több" (the rest is a numbered list: 1 "alapok: húzódzkodás, tolódzkodás, guggolás" · 2 "statikus elemek: planche, front lever" · 3 "kombinációk") · "Bejegyzései" · one row: Közlemény · 2026. 08. 25. / Ingyenes kalisztenika bemelegítő sorozat.
   Variants of this frame by swapping one block: no posts → "Még nincs közzétett bejegyzése." under the heading; gone → the post-detail gone layout with "Ez a profil nem érhető el" / "Lehet, hogy még nincs közzétéve, vagy már nem elérhető." / "Vissza a piactérre".

## Images

- **What exists:** NOTHING. A coach profile has no portrait, no cover, no banner, no gallery — the only "image" is the two-letter monogram computed from the name. The post rows carry no thumbnails (covers live on the post detail only).
- **What could help:** the monogram as the hero, in the approved Profile grammar (giant condensed letters, textured light inside the letterforms, lime full stop) — it differs between coaches and fakes nothing. The verified state deserves one distinct mark in the Pulse render family (a small lime-lit tick / seal) used identically on the feed row, the post's coach row and here. Kind marks on the post rows: the same three as the feed (or a micro tag) — keep one answer across the three public screens.
- **Must NOT be shown as if it existed:** a portrait or any photo of a person, a gym / studio banner, before-after client photos, certificate scans, logos of federations, a map of the city, post thumbnails, an "online now" dot. The monogram's lime full stop must NOT be reused as the verified signal: every monogram in the approved look has it, verified or not.

## Do not invent

- "Kapcsolatfelvétel", message, call, e-mail, WhatsApp, website or social links — no contact field exists.
- Follow / "Követés", follower or client counts, "x people trained", rank, "top coach", trending.
- Ratings, stars, reviews, testimonials, client results.
- Years of experience, client count, programme count or any stat tile (the headline may SAY "12 év tapasztalat" — that is free text, not a number field).
- Price list, packages, availability calendar, booking, "free consultation".
- Certifications / qualifications list, languages spoken, gender, age, gym name, address, map.
- `@handle` on the page, a share button, a QR code, a report or block button.
- Tappable specialty labels (they filter nothing), a "show all specialties" expander (max 6 exist).
- Kind tabs or filters above the posts, post search, paging / "show more posts" (max 24, no control).
- Prices, cities, excerpts or thumbnails on the post rows.
- An "Edit profile" button for the owner, a signed-in variant, a bottom tab bar, a sticky footer.
- Join-code entry or "choose this coach" — a member cannot link to a coach from the UI at all.

## Notes for the designer

- **All 14 specialty labels** (a coach picks up to 6; shown in this order): Erő · Izomtömeg · Erőemelés · Súlyemelés · Állóképesség · Futás · Mobilitás · Rehabilitáció · Táplálkozás · Fogyás · Kismama · Szenior · Ifjúsági · Saját testsúlyos (keys `public.specialty.*`; longest = "Saját testsúlyos", 16 characters). Six labels must be able to wrap to two or three lines at 360 pt.
- **The 10 cities:** Budapest · Debrecen · Szeged · Miskolc · Pécs · Győr · Nyíregyháza · Kecskemét · Székesfehérvár · Online. "Online" is a city value, so "Ellenőrzött edző · Online" is a real caption.
- **Long strings:** display name up to 120 characters (h1, not clamped — at monogram-adjacent title size "Kovács Péter" is short, but design for a three-word name wrapping to two lines); headline up to 120 characters, not clamped (the sample is 54 and already wraps to 2 lines at body size); post titles up to 140, one line with ellipsis; `marketplace.coachGoneBody` is 55 characters; `marketplace.noPostsYet` 31.
- **The collapsed bio is a height clamp, not a text clamp.** Because a bio is a full document, the demo coach's two visible "lines" are in fact the heading "Kinek szól" with its glyph and nothing else — the live result looks broken. In the new design decide what the collapsed state shows (recommended: the first two lines of running text, heading styles flattened) and say so; the expander strings stay "Több" / "Kevesebb".
- **Verified is the only enforced credential** and it appears twice today (tick on the frame + words in the caption). Unverified is the common case (2 of 3 demo coaches) — and today the ONLY case outside the seed: the database demands an admin as the granter, but no admin screen or endpoint grants the flag. The page must look complete without it; do not draw a "request verification" or "verify" control.
- **What a coach can and cannot author:** everything in the identity block (name, headline, city, up to 6 specialties, bio) is editable in the profile editor. The posts are thinner than the seed suggests — the post editor has no event-date field and the server refuses an "Esemény" without a date, so the "Esemény · 2026. 10. 30." row exists only through the seed; a row written in the app is "Program · publication date" or "Közlemény · publication date".
- **Seed values used verbatim:** Kovács Péter (handle `kovacs-peter`, Budapest, verified, 4 specialties, the bio above), Szilágyi Réka (`szilagyi-reka`, Szeged, "Futóedző és mobilitás · Szeged", Futás · Állóképesség · Mobilitás — server order: Állóképesség · Futás · Mobilitás), Fehér Tamás (`feher-tamas`, Online). Adapted to the reference moment (Fri 9 Oct 2026): dates, and the two seed titles that hard-code September ("Guggolás-technika műhely – szeptember 14." → "– október 30.", "Szeptembertől két új időpont" → "Novembertől két új időpont").
- **The coach's other identity in this product:** the same Kovács Péter is the signed-in coach of the coach-side screens (monogram KP, kovacs.peter@pelda.hu). His e-mail never appears on this public page, and nothing here links into the app.
- **Zero filled controls is the coded truth** (same as the post detail). The lime on this screen is light on data: the verified mark, the monogram's full stop. Do not add a lime pill without an owner decision — there is no action for it to perform.
- **Back goes to `/m`,** although the usual way in is from a post. A reader who came from a post loses their place; that is live behaviour, not a design choice to reproduce with a "back to post" label.
- **Post rows here are deliberately thinner than feed rows** (kind · date · one-line title). Keep the difference small but real: same row grammar, fewer fields, no price.
