---
type: screen-spec
title: Érmék — Coins
route: /coins
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Érmék — Coins

The coin wallet: what you have, what it buys, what you earned it for, and every debit and credit in full. The user came here for one of two reasons — to spend, or to check a number they half-remember — and the screen must answer the second one before it is scrolled.

## Anchor

A large balance ring standing alone across the top third: a coin glyph inside the arc, the whole-coin balance `1 450` filling the middle in the heaviest figures on the screen, and the caption `Egyenleged` beneath it. A ring because a balance is a countable quantity with a spendable relationship to the prices below it — that is exactly the shape a ring reads as, where the old header cluster read as a status line.

The arc is not decoration and must carry a referent: **the share of lifetime earnings still held**, which makes the two tiles under it coherent as its two flows — what came in this week, what has gone out. An arc with no referent on a screen about money is the worst kind of ornament, so if the referent cannot be sourced the ring renders as a quiet full track with no arc rather than a made-up sweep.

> [!important]
> `useLedger` returns one capped page with a `nextCursor` — it cannot total a lifetime. The ring's sweep and both tiles must come from `/coins/wallet` as server-computed fields alongside `balanceMinor`. Summing the visible page would produce a ring that changes meaning as history grows, which is the failure mode this anchor exists to avoid.

## Blocks

1. **Header row** — a back control on the left, the h1 `Érmék` centred. The old inline coin cluster is gone from here entirely; the balance lives in the anchor now.
2. **Balance ring** — see Anchor. The number rolls from the *previous* balance, never from zero (`CoinBalance`'s existing rule), and the purchase delta appears in the caption slot: `+50` in accent, `−250` in muted grey, then the caption returns to `Egyenleged`.
3. **Two flow tiles**, side by side under the ring. Left: a flame icon holder, `+180`, caption `Ezen a héten`. Right: a tag icon holder, `250`, caption `Elköltve`. Neither is tappable — they are readouts, and adding a filter behind them would turn a summary into navigation.
4. **Segmented tab tray** — one rounded tray holding three equal pills: `Bolt` · `Eredmények` · `Kimutatás`. Active pill is filled, the other two are ghost text. A tab is a filter, not a new screen: the header, the ring and the tiles stay put.
5. **`Bolt` body** — a section header with a storefront icon holder reading `MEGVÁSÁROLHATÓ`, then card rows. Each row: an item icon holder, the title, one short description line, and on the right either a price button (coin glyph + whole number) or a green check with `Megvan`. `Aurora` / `Hideg, északi fényű színátmenet.` / `250` is filled-affordable; `Ember` / `Egyetlen meleg kiemelés.` is owned; `Heti jelentés` / `Vasárnap esti összefoglaló.` / `120` is outlined. The list runs off the bottom edge on purpose — the clipped fourth card is the fold cue, not a row budget.
6. **Purchase result lines**, under the list, one at a time: amber `A vásárlás nem ment át. Ellenőrizd az egyenleged — lehet, hogy közben változott az ár.` or muted `Ez a vásárlás már megtörtént, nem terheltünk újra.`
7. **`Eredmények` body** — the counter `3 / 7 feloldva`, then seven rows (trophy icon, title, and `25 érmét adott` when unlocked / `25 érmét ad` when locked, with a padlock at the far right when locked), closing on the footnote `Ezeket az app adja oda magától, amikor teljesíted őket — nincs mit begyűjteni.`
8. **`Kimutatás` body** — compact rows: the reason on the left with the date and optional note beneath it, the signed amount on the right. Credits in accent, debits in plain secondary grey — deliberately not danger red.

> [!warning]
> Store titles and descriptions come from the server, and today they arrive in English (`A cold northern gradient set.`) while the mockup shows Hungarian. Either the catalogue gains localised columns or the client resolves the SKU to a local string — what must not happen is a Hungarian screen with English product copy, which is what will ship if this is left to the API.

## What was merged away, and why

The header coin cluster, the transient delta chip beside it, the upload/pending strip and the bottom helper line are all gone. Together they were four separate places reporting on the same wallet, which is how the old screen ended up reading as a form. Everything they said now lands in one place: the ring holds the balance, its caption slot holds the delta, and the two tiles hold the flows the strip used to hint at.

The debit chip is the cut worth defending. It was the only feedback a spend produced, and it lived in the corner of the header — the least-looked-at pixel on the screen at the exact moment the user needs confirmation that money moved. Folding it into the ring's caption costs a colour distinction and buys the confirmation landing under the user's eyes, on the number that changed.

What survives untouched, and must: the price button stays live when the balance is short. It is not disabled, because a disabled control cannot tell you *how* short you are — the refusal line can, and it is the only path to that information.

## States

- **Loading** — a quiet ring track with no arc and a chip-shaped skeleton where the balance goes; skeleton tiles; then per tab, card-shaped skeletons for the store, bar-shaped ones for achievements and the statement.
- **Empty** — store: `A bolt üres` / `Most nincs megvásárolható tétel.` with a storefront icon. Statement: `Még nincs mozgás` / `Az érmék akkor jelennek meg itt, amikor kiérdemelted vagy elköltötted őket.` Achievements has no empty state — the seven rows always exist, locked.
- **Error** — a failed wallet fetch renders the ring track with no figure rather than a zero balance. A zero balance and an unknown balance are different facts and must never look alike.
- **Offline** — the banner slots above the content: `Nincs internetkapcsolat` or `2 művelet vár feltöltésre`. A purchase must **not** queue. It is a money-class write carrying a once-minted idempotency key; queueing it would replay an intent the user has since forgotten, so it fails visibly instead.
- **In flight** — the tapped price button shows busy; every other price button is inert until it settles. Single-flight, no confirmation dialog, no sheet.
- **Role-gated** — none. Every role sees the same wallet; an admin's grants appear here only as ordinary statement rows.

## Components

Reuses `Pressable` (price buttons, tab pills), `EmptyState`, `Skeleton`, `CountUp` and `CoinBalance` (the roll-from-previous logic and its `aria-live` container move into the ring unchanged), the `control` recipe, `OfflineIndicator`, `BottomNav`.

Genuinely new: the **balance ring**. The only ring in the product today is an inline SVG inside `RestTimer` — it should be lifted into a shared radial component here, because `10-onboarding` needs the same one for its step gauge. Also new: the two flow tiles, the section header with an icon holder, and the per-item icon holder on store rows (rows carry no icon at all today).

## Navigation

Member bar, five tabs. No tab belongs to this screen — `/coins` is entered from the profile stack, so `Profil` stays lit and the back control in the header is the way out. Coach six, admin seven; the coin screen is identical for all of them.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/05-coins.webp]]
![[_mockups/vilagos/05-coins.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
