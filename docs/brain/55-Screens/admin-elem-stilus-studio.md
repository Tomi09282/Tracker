---
type: screen-spec
title: Elem-stílus stúdió — Element style studio
route: /admin/styles
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Elem-stílus stúdió — Element style studio

Where an admin chooses which of five motion and interaction variants each UI element ships with, for every user, without a code change or a redeploy. They came to answer one question about one element — *what does the button do when you press it, and can it do something better* — so the screen has to show the real component behaving, not a description of it.

## Anchor

A hero preview stage spanning the full column, deliberately empty apart from one **real, live, pressable** `Mentés` button drawn several times the size of an ordinary control, caught mid light-sweep. Labelled `GOMB · E1` top-left, an `aktív` chip top-right, and captioned with the running variant, `C · Fénypászma`, underneath.

It is the anchor because it is the only element on the screen that answers *what is live right now*. The previous design made you scan five equal cards for the one with an accent border. Hero size is doing real work here too: these variants are differences in motion, and a small demo of a sheen sweep is a rectangle that flickers.

## Blocks

1. **Eyebrow + title** — `MEGJELENÉS` in uppercase accent, then the h1 `Elem-stílus stúdió`.
2. **Intro line** — one sentence: `Minden elem öt változata, élő komponenssel.`
3. **Hero stage** — the anchor. The chip and the caption both name the active variant; the demo inside is wrapped in the same `VariantOverride` the variant cards use, so the hero is the truth and not a screenshot of it.
4. **Element chip rail** — a horizontally scrolling row: `E1 Gomb` (selected: inverted fill, accent border, glyph above the label), `E4 Kapcsoló`, `E12 Kártya`, and a fourth cut by the edge. Each chip carries a small glyph of its own element. Light mode stacks id over name inside the chip; dark keeps them on one line.
5. **Section header** — a palette icon tile and the h2 `Változatok`.
6. **Variant cards** — one per row, stacked. Each: a stage on the left holding the real component rendered under that variant, and on the right the uppercase label (`A · RUGÓS LENYOMÁS`) over a short rule, a one-line plain-language description (`Megnyomásra rugalmasan összenyomódik`), and the commit button. The active card is filled and bordered with a green `✓ aktív` chip and an inert `Ez az aktív`; the others carry `Legyen ez`. At the wider breakpoint the button moves out to the card's right edge instead of sitting under the description.
7. **Toast** — floats above the nav after a change.
8. **Bottom nav** — fixed, `ADMIN` active.

## What was merged away, and why

**The twenty-seven-row element list became a chip rail.** The list was a full column of ids and names taking the entire left side of a phone screen before any preview appeared. On a phone the studio is opened to change *one* element, usually after someone asked about that specific control — so the rail keeps the hero and the first variants above the fold. Above the wide breakpoint the vertical list stays exactly as it is today; the rail is the phone form of the same single-choice control, not a replacement.

**The five variant cards became rows with a description.** As a two-column grid of squares, the only thing distinguishing `B · Ripple` from `C · Sheen-sweep` was a codename and a demo you had to press to understand. The row shape buys a full sentence of prose per variant, so an admin can decide before pressing anything — and a card that is a stage plus a sentence plus a button is no longer a data field.

**The four-line intro became one line.** The removed sentences explained that a choice applies to every user on their next load with no redeploy. That is a real and slightly alarming fact, and it must not simply vanish — put it where the consequence is, next to or inside the confirmation, not in a paragraph above the fold that gets skimmed once.

**The toast is absent from the mockup.** It was cut for framing only.

> [!warning]
> Do not cut the toast in code. `StyleStudioPage` deliberately has **no** `aria-live` on the workspace — its comment records that a polite region there re-announced the entire right-hand panel, about eighty words, on every pick. The toast, with `role="status"` and one sentence (`E1 mostantól C változatot használ`), is the *only* announcement of the result. Remove it and the screen silently loses its accessible confirmation.

## States

- **Loading** — the variant cards become `Skeleton` blocks in the same grid; each element row/chip shows a `·` where its active letter goes. The hero stage shows a skeleton too, since it has no variant to render yet.
- **Saving** — the acting card's button shows a spinner; every other commit button is inert for the duration, so two variants cannot be in flight at once.
- **Saved** — success toast `E1 mostantól C változatot használ`. The hero, the chip rail letter and the active card all move together, because the mutation invalidates the same `['element-styles']` cache entry the provider reads.
- **Save failed** — `A módosítás nem ment át. Frissítsd az oldalt, és nézd meg, mi az aktuális állapot.` The refetch runs on settle, not only on success: the likely failures are a role revoked underneath the tab and a row someone else just changed, and in both cases the screen is now wrong.
- **Load failed** — `EmptyState` with a palette glyph under the grid: `Nem sikerült betölteni a stílusokat` / `A szerver nem válaszolt. Frissítsd az oldalt.`
- **No preview** — for elements the playground cannot demonstrate, the stage holds centred muted text instead: `Ehhez az elemhez még nincs élő előnézet ezen a képernyőn. A változat attól még valódi: a komponensek olvassák.`
- **Inert element** (E23, E24, E27) — a `nem használt` chip beside the workspace heading, the explanation card (`Ezt a beállítást jelenleg egyetlen komponens sem olvassa. …`), and all five commit buttons dimmed and dead. The chip rail must carry the inert marker too; the crossed-out-eye glyph that does this in the list has nowhere to go on a chip, so give inert chips their own muted treatment rather than dropping the signal.
- **Role-gated** — admin only; the endpoint re-checks the role against the database at execution time and writes its audit row in the same transaction.

## Components

Reused: `Demo` and `PREVIEWABLE` from `PlaygroundPage` (exported precisely so the studio does not build a second preview harness that would drift from what ships), `VariantOverride` from `ElementStyleProvider`, `CATALOG` and `VARIANTS` from the element catalog, `useElementStyles` / `useSetElementVariant`, `Pressable`, `EmptyState`, `Skeleton`, `useToast`.

Genuinely new:
- **Hero preview stage** — a large framed stage rendering `Demo` for the active variant, with a label row and a caption. New, and it is the screen's anchor.
- **Element chip rail** — the phone form of the existing radiogroup. Keep the semantics: single choice, `role="radio"` with `aria-checked`, not a row of buttons.
- **Variant row card** — the horizontal stage/label/description/button layout replaces today's square card.
- **Localised catalogue strings** — see below. This is the largest new piece of work on the screen and it is not visual.

> [!warning]
> The mockup is in Hungarian and `catalog.ts` is not. It stores English developer labels — `E1 Button`, `A · Press-spring`, `C · Sheen-sweep`, `D · Morph-to-progress` — and `StyleStudioPage` renders them raw. The mockup needs `E1 Gomb`, `A · RUGÓS LENYOMÁS`, `C · FÉNYPÁSZMA`, `D · FOLYAMATJELZŐVÉ ALAKUL`, **plus a description line the catalogue does not carry at all** (`Fénycsík fut végig a gombon`). That is a name and a sentence for every element and every variant, in every locale, and it cannot live in `catalog.ts` — that file is held in step with the database by the parity check and is code, not copy. Put the ids in the catalogue and the prose in the locale files, keyed by element and variant, and extend `check-element-roster.mjs` so a missing label fails the build instead of rendering a key.

> [!important]
> The active card's chip is **green** in both mockups, while every other "active" on this screen — the selected chip, the active card's border — is accent. Two meanings of active on one screen. Pick one: either the chip returns to accent-subtle, matching what `studio.active` renders today, or green becomes the studio's confirmed-state colour and the border follows it. Do not ship both.

## Navigation

Bottom bar, `ADMIN` active. **Seven tabs for the admin role**: `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `ADMIN`, `PROFIL`. Reached from `/admin` via the `Stílus stúdió` anchor, and from Settings. Note the screen previews `E11 Bottom nav item` variants against a bar that is itself live — the nav at the bottom of this page is the real one and will change under the admin as they commit.

> [!warning]
> Same clamp as `/admin`: `BottomNav` renders `tabs.slice(0, 5)`. Seven tabs is a change to the bar, tracked with the admin overview, not implemented here.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/12-admin-elem-stilus-studio.webp]]
![[_mockups/vilagos/12-admin-elem-stilus-studio.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
