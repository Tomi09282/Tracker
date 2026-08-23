---
type: screen-spec
title: Tervszerkesztő — Plan editor
route: /coach/plans/:id
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Tervszerkesztő — Plan editor

Where the programme is actually built: days inside a cycle, blocks inside a day, exercises inside a block with their sets, reps and load — and from where a finished template is handed to a client as an independent copy.

## Anchor

A week-cycle strip: one row of tall rounded day tiles across the full content width, each carrying a dumbbell glyph or a moon glyph and its day numeral, the open day filled in accent, with the caption `7 napos ciklus · 4 edzésnap` beneath.

The plan *is* a cycle, and this is the only element that shows the whole of it at once. Before a single day is expanded the coach can read the shape — where the rest days fall, whether the week is front-loaded, whether a slot is still empty. The old screen made that shape derivable only by scrolling four collapsed cards and counting.

## Blocks

1. **Header** — back link `Edzéstervek` on the left, a filled `Mentés` pill on the right so it stays above the fold.
2. **Plan identity** — the plan name as h1 (`Felsőtest-alsótest 4x`), editable in place; under it the meta line `Piszkozat · 4. változat`. The cycle length left this line because the strip's caption now carries it.
3. **Cycle strip** — the anchor, in its own card. Tapping a tile opens that day below; tapping an empty slot creates it.
4. **Warning row** (client plans with no start date) — alert icon tile plus `Aktiváláshoz kell egy kezdődátum — enélkül a kliens kezdőlapja üres marad.` It is the reason, not a rejection: the server refuses the activation, this line says why in advance.
5. **Day cards**, one per day. Collapsed: an icon tile (dumbbell, or moon for a rest day), the day name (`Nyomás nap`, `Pihenőnap`), a tabular suffix `1. nap · 18:00` or `2. nap · nincs időpont`, a chevron, and a trash icon button.
6. **Open day** — steps up to the highest surface level, inverting against the page so the area being edited reads as foreground. Inside, one block card per block: the kind label `Szuperszett` (`Egyszerű`, `Kör · 3 kör`, `EMOM`, `AMRAP`) with a collapse chevron and a trash button.
7. **Exercise rows** inside a block — bold name `Fekvenyomás rúddal` over the tabular target line `3 × 8–10 · 60 kg`, with a trash button.
8. **`+ Gyakorlat`** — a full-width ghost button that is replaced in place by the picker: the field `Gyakorlat keresése` and a short scrolling result list. Results are flagged, never filtered: an alert-toned body-area chip (`Térd`) when the movement loads an area the client must avoid, a softer tone for milder conflicts, plus a grey `2 eszköz hiányzik`.
9. **Below the fold** — the block-add chips `Egyszerű` / `Szuperszett` / `Kör`, the `Klónozás` button with its client list and `Másolat sablonként`, the cycle-copy card, and `Nap hozzáadása`.
10. **Bottom nav.**

## What was merged away, and why

- **The four status pills left the header.** `Piszkozat` / `Aktív` / `Szünetel` / `Lezárva` were a wrapping row of buttons sitting where the plan's shape should be. Status is now a word in the meta line, and tapping that word opens a `Sheet` holding the same four options. Status is changed a few times in a plan's life; the cycle is looked at every time the screen opens.
- **The reorder chevrons came off the exercise rows** (blocks kept theirs). The rows are visibly calmer for it — and this is the merge to argue with. See the callout.
- **The clone card, the picker, a second block, the add-block chips and the cycle-copy button are all collapsed or below the fold**, and one day was cut so the list runs past the bottom edge. Nothing was deleted; the first screenful was bought back for the strip.
- **`Nap hozzáadása` lost the only filled button on the screen** to the header's `Mentés` pill, so the commit is reachable without scrolling to the end of a long plan.
- **What that bought:** the plan's structure is legible before any scrolling, which is the one thing the old editor — a stack of collapsed rows and chips — never showed.

> [!warning] The exercise chevrons have to come back on focus
> `PlanEditorPage.tsx` chose up/down buttons over drag on purpose: two buttons are the pointer, keyboard, touch and screen-reader path all at once, and drag is not. Removing them from exercise rows removes the only accessible way to reorder inside a superset — a completely ordinary edit. Spec: the row at rest shows the trash only; the focused or active row reveals its two chevrons, with the first and last item's respective arrow disabled. Never remove them outright.

> [!warning] `Mentés` must not promise a save that already happened
> Every structural edit here commits immediately — adding a day, deleting a block, picking an exercise, reordering. A header pill implying the screen holds unsaved work is a lie in every state but one. It commits the plan-level fields only — name, status, start date — and it is disabled while nothing is pending. If it ever renders enabled on an untouched plan, it is wrong.

> [!important] Deletions are immediate and there is no confirmation
> A day card can hold a dozen exercises and its trash button fires straight away. Client archiving elsewhere confirms; this does not. The right answer is an undo toast on delete, not a confirm sheet — a confirm on every trash makes building a plan unbearable, while an unrecoverable tap on a full day is the worst thing this screen can do.

## States

- **Loading** — a half-width title skeleton and a card skeleton; the strip does not render from partial data.
- **Error / not found** — `Ez a terv nem érhető el` / `Vagy nem a tiéd, vagy archiválva lett.` One message for "not yours", "archived" and "never existed" alike.
- **Empty plan** — `A terv még üres` / `Vegyél fel egy napot, aztán tegyél bele blokkokat és gyakorlatokat.` The strip still renders, every slot empty and tappable; `Klónozás` and `Nap hozzáadása` stay on screen.
- **Cycle full** — `Nap hozzáadása` is replaced by the plain line `A 7 napos ciklus minden napja foglalt.` A button that returns a constraint error is worse than a sentence.
- **After a cycle copy** — the alert status line `A ciklus 14 naposra nőtt — ezzel minden jövőbeli alkalom időpontja eltolódott.` The strip re-renders at the new length, which is the honest way to show what just happened.
- **Picker on a template** — no conflict or equipment chips at all. A template belongs to nobody, so there is no client to flag against.
- **Offline** — shell indicator, every mutation disabled; there is no queued-write store.
- **Role-gated** — coach-only; a member reaching the URL gets the not-found state.

## Components

Reuses `Pressable` in nearly every shape it has (icon for trash and chevrons, chip for block kinds, field for the day header and picker results, primary for `Mentés`), `Field` for the search and the name, `EmptyState`, `Skeleton`, `Sheet` for the status picker, the toast host (E15) for the delete undo, the `control` recipe for card surfaces, and `useExercises` with its `forClient` flagging already in place.

Genuinely new: the cycle strip — nothing in the UI kit draws a slot row of this kind — and the day icon tile. `nincs időpont` is new copy and needs a key; everything else on this screen already exists in `hu.json`.

## Navigation

Bottom bar with `EDZŐ` active. Coach role: 6 tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `PROFIL`. This is a push two levels deep from `EDZŐ`; the back link, not the bar, is the way out, and it goes to `Edzéstervek` rather than to wherever the coach came from.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/08-coach-plan-editor.webp]]
![[_mockups/vilagos/08-coach-plan-editor.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
