---
type: screen-spec
title: Edzői profil — Public coach profile
route: /m/c/:handle
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Edzői profil — Public coach profile

One coach, seen by a stranger who arrived from the feed or from a shared link. The visitor is answering a single question — *who is this person and should I trust them with my training* — and then browsing everything that coach has published. No account required, and none of it changes for someone who has one.

## Anchor

A very large circular portrait wrapped in a bold periwinkle ring, with the verified check badge sitting on the ring's lower-right, centred and filling the top third. An avatar because the subject *is* a person: no count to ring, no trend to plot, and the reader's question is about a human. The ring is a frame, not a meter.

> [!warning]
> Everywhere else in this product a ring around a value means progress (E16, the daily rings on home and nutrition). Here it carries no value and must never be wired to a percentage — a coach profile with a three-quarters-full ring reads as a coach who is three-quarters of something. Draw it as a complete, decorative frame whose only job is to give the badge something to sit on.

## Blocks

1. **Public top bar** — back chevron on the left returning to `/m`, `Belépés` pill on the right.
2. **Avatar + ring + verified badge** — the anchor. The badge's accessible label is the existing `Ellenőrzött edző`.
3. **Display name** — `Kovács Péter`, centred, the largest type below the avatar. The check badge no longer sits inline beside the name; it moved onto the ring.
4. **Headline** — `Erőemelés és mozgásminta-javítás 12 éve`, secondary colour, one line.
5. **Credential caption row** — `Ellenőrzött edző · 📍 Budapest`, small and grey.
6. **Three summary tiles**, side by side, each an icon in a tinted circle over a large number over a caption: `12` / `Év tapasztalat`, `48` / `Kliens`, `6` / `Program`.
7. **Specialty chips** — one row of four non-interactive labels: `Erő`, `Erőemelés`, `Mobilitás`, `Táplálkozás`. They look like filters and are not; nothing happens on tap.
8. **Bio** — two lines: `Kezdőktől a versenyzőkig dolgozom, de a felépítés mindig ugyanaz: előbb a technika, aztán a terhelés.`
9. **Primary action** — full-width accent button, `Kapcsolatfelvétel`. The only filled control on the screen.
10. **Section heading** — an icon tile followed by `Bejegyzései`.
11. **Post list** — compact bordered cards, each a kind icon tile plus two lines: grey `Esemény · 2026. 09. 12.` and the truncated title. Whole card taps through to `/m/p/:id`.

## What was merged away, and why

- **The bio document collapses to two lines.** It used to run through `DocRenderer` in full — two paragraphs, a subheading, a three-item bullet list, a block quotation and an inline link with its host in parentheses. That was the single largest contributor to the "everything is data fields" reading: an introduction rendered as a document. The full renderer still runs on the post detail, where a reader has committed to reading. Cost: coaches with a long bio lose most of it. Answer with a clamp plus a `Több` / `Kevesebb` expander (both strings already exist in `common`) or an explicit budget in the profile editor — not by silently truncating.
- **Fourteen specialty pills became four.** Fourteen taxonomy chips is a tag cloud, and a tag cloud says the coach does everything, which reads as the coach does nothing in particular.
- **The enumerated credentials in prose became three summary tiles.** Three numbers a visitor can compare across coaches beats a paragraph they have to parse for the same facts. This is the trade the whole redesign rests on: the tiles are dense, but they are *shaped*, and shape is what a text block never had.
- **Five post cards became three, and each lost its two-line excerpt** — same reasoning as the feed card. Kind, date, title is enough to choose from; the excerpt belongs where the post is read.
- **`@handle` gave up its slot to `Ellenőrzött edző`.** A handle is an address, not a credential, and it was occupying the one line under the name that a visitor actually reads. The handle still lives in the URL, which is where it is useful.

> [!warning]
> None of the three tile numbers exist. `PublicCoach` carries handle, display name, headline, doc, city, verified and published-at — nothing more. Years of experience, client count and programme count are all new fields, and two of them are claims the coach makes about themselves. Client count in particular can either be *computed* from the coach's real client rows or *typed* by the coach — those are two different products. Decide before drawing them: a self-entered `48 Kliens` sitting directly beneath an admin-granted verified badge borrows that badge's credibility, and the badge is the one thing on this page the schema actually enforces.

> [!important]
> `Kapcsolatfelvétel` is new, and the current screen has no message path by decision — no follow, no follower count, no message button, no rating, no rank. Whatever this button does, it must be useful without an account (the page runs with `credentials: 'omit'`) and it must not quietly become a private inbox on a public route. The honest first version is what the post detail already tells the reader in words: it hands over the coach's own contact route.

> [!warning]
> The specialty chips render `t(s.i18nKey, { defaultValue: s.key })` and there are no Hungarian specialty strings in the bundle — today they would display `strength`, `powerlifting`, `mobility`, `nutrition`. The mockup's `Erő`, `Erőemelés`, `Mobilitás`, `Táplálkozás` require those keys to be written first. Cheap, but it is a blocker, not a polish item.

## States

- **Loading** — the current skeleton is a half-width bar and one block, which no longer matches this geometry. It must grow to the new shape: avatar circle, name bar, tile row, chip row. A skeleton that does not match causes the layout shift it exists to prevent.
- **Gone / error** — draft, removed, and a handle nobody ever took are **one** answer, matching the server: `EmptyState` with `heading="h1"`, the crossed-out-person icon, `Ez a profil nem érhető el` / `Lehet, hogy még nincs közzétéve, vagy már nem elérhető.`, then the `Vissza a piactérre` link. Never split these into distinct messages — the page would become an oracle for removed content that the API refused to be.
- **No posts** — a single grey caption in place of the list: `Még nincs közzétett bejegyzése.` The section heading stays.
- **No bio, no city, no specialties** — each block is simply absent; nothing renders an empty shell.
- **Offline** — none, same gap as the rest of the public shell: `OfflineIndicator` lives in `AppLayout`, which this route sits outside.
- **Role-gated** — none. Identical for visitor, member, coach and admin.

## Components

Reuses `EmptyState` (with `heading="h1"`, since it *is* the whole page in the gone state), `Skeleton`, `DocRenderer` for the bio, `Pressable` for the contact button and the chip-shaped specialties, the `control` recipe, and the verified badge with `marketplace.verified` as its label.

Genuinely new: the ring-framed avatar with the badge riding on the ring; the three-up summary tile; the icon-tile section heading; the compact post card with a leading kind icon; the contact button. The summary tile is the same new component the post detail needs — build it once, in `ui/`, not twice in `features/marketplace/`.

> [!important]
> Do not reach for `CountUp` on the tile numbers. It exists for a value that just changed under the user; these are static facts on a cold page load, and animating them turns a credential into a slot machine.

## Navigation

No bottom bar — this route renders outside `AppLayout` with the rest of the public marketplace. Tab count for this screen's role: none (public marketplace). The two ways off the screen are the back chevron to `/m` and the `Belépés` pill to `/login`.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/09-edzoi-profil.webp]]
![[_mockups/vilagos/09-edzoi-profil.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
