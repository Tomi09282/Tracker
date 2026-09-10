---
type: screen-spec
title: Kliens adatlap — Client detail (Terv tab)
route: /coach/clients/:id
updated: 2026-09-11
tags: [ux, screen, redesign]
---

# Kliens adatlap — Client detail (Terv tab)

One client, in full: who they are, the two or three answers that change what gets written for them, and the four working surfaces — plan, nutrition, progress, messages. The coach arrives here to write or fix a training plan.

## Anchor

A large monogram avatar (`AN`) inside a thick status ring with a small check badge, centred and larger than anything else on the screen.

An avatar, because this screen is about a person and every other candidate anchor — a chart, a ring of numbers — would be about their data. The ring is not decoration: it carries the account's handover state. A checked ring means the client owns their own credentials; a pending account gets the alert-toned ring and its glyph instead of the check.

## Blocks

1. **Back link** `Klienseim` → `/coach`.
2. **Anchor avatar** with the status ring and badge.
3. **Identity** — the client's **name** as h1 (wraps, never truncates), and under it a chip row: the grey team chip `Hétfői csoport` and the plain origin word `csapatkóddal` (`meghívóval` / `általad létrehozva` / `kézzel`).
   > This line used to read *"the email as h1 … it is the client's name here"*, and at the time that
   > was accurate: `users` had no name column and this header rendered `demo.farkas.nora@tracker.local`.
   > Fixed by [[0017-a-person-has-a-name]] — migration 029 and `lib/person.ts`. The address is no
   > longer on this screen at all.
4. **Handover banner** — only when the account is still pending. Alert card with the full sentence `Ezeknek a fiókoknak még te ismered a jelszavát, ezért a kliens addig nem tud belépni az appba, amíg sajátot nem állít be.`
5. **Three stat tiles** — circular icon, a display number, a tiny uppercase caption: `6` `EDZÉS / 28 NAP` (dumbbell), `4` `HETI EDZÉS` (calendar), `3` `TERV` (clipboard). Sessions come from the roster's 28-day count, the weekly figure from the questionnaire, the plan count from this client's plans.
6. **Two answer tiles**, side by side. Left, neutral: `CÉL` over `Izomtömeg`. Right, alert-toned with a shield icon: `KÍMÉLENDŐ` over `Térd — kerülendő futás` and the client's own note `A térdem futás után fáj.`
7. **Equipment card** — a full-width `Surface` directly under the answer tiles: the title `Felszerelés`, the hint `A kliens elérhető eszközei. A módosításról értesítést kap.`, a wrapped row of the same `Toggle` chips the client's own Settings screen uses, and a full-width primary `Mentés` button. Unlike the client's own equipment editor, there is **no autosave** — a stray tap here rewrites somebody else's profile and fires a notification into their inbox, so the coach commits on purpose. Saving calls Task 1's `PATCH /clients/:linkId/onboarding/equipment` and, on success, invalidates the same query the card reads, so it renders back whatever the server actually stored.
8. **`Teljes kérdőív` row** — a full-width ghost row with a list icon, an amber `Hiányos` chip when the profile is still a draft, and a chevron. Opens the questionnaire sheet, which still lists the equipment names read-only as one of its rows — the card above is the editor, the sheet row stays the record of what was last saved.
9. **Tab strip** — four pill chips, horizontally scrollable, selected one filled: `Terv` · `Táplálkozás` · `Haladás` · `Üzenetek`.
10. **Terv panel (default)** — one card per plan: bold name, status chip (`Aktív` with a check, `Piszkozat`, `Szünetel`, `Lezárva`), a chevron, and a meta line `4 nap · 7 napos ciklus · 2026-08-24 → 2026-11-16`. A plan with no start date replaces the date range with the alert line `Aktiváláshoz kell egy kezdődátum`.
11. **Actions** — full-width primary `+ Új terv a kliensnek`; the secondary `Klónozás` sits directly beneath it and expands its template list inline, never in a dialog.
12. **Bottom nav.**

## What was merged away, and why

- **The eleven-row questionnaire table is gone from the page.** `Mi a célod?`, `Hetente hány edzés?`, `Hol edzel?`, experience, session length, height, weight, birth year, sex, equipment, free-text notes — all of it, plus the `Több` / `Kevesebb` toggle. Two answers were promoted to tiles, one number became a stat tile, and everything else moved behind the `Teljes kérdőív` row, which opens a `Sheet` holding the same label/value rows in the same order. A sheet rather than a route, because the coach is reading the questionnaire *against* the plan list and must not lose their place in it.
- **Equipment came back out of that sheet as a card, not as a twelfth row.** It was one of the eleven merged-away rows; it is the only one the coach can now act on directly from the page, because [[0013-coach-writes-client-equipment]] gave the coach a route to correct it. The sheet still shows the same field read-only, in its original position, for anyone scanning the questionnaire top to bottom.
- **The `KÍMÉLENDŐ` box collapsed into one tile.** It used to be a bordered inner card listing every non-past limitation with its severity. The tile shows the most severe one and its note.
- **The draft warning shrank to a chip.** `Még nincs befejezve — hiányos válaszokra ne építs tervet.` became `Hiányos`; the full sentence must appear at the top of the questionnaire sheet, where acting on incomplete answers actually begins.
- **Plan cards cut from four to three** and the fourth is implied by the list running past the fold; the `Klónozás` template card is collapsed by default.
- **What that bought:** the plan list — the reason a coach opens this screen — now starts inside the first screenful instead of under a table of eleven rows the coach had already read once.

> [!warning] One tile cannot hold two injuries
> Promoting only the worst limitation hides the rest, and "knee" plus "shoulder" is the ordinary case, not the edge one. When more than one area is flagged, the tile must show the remainder as a count and the `Teljes kérdőív` row must take the alert tone. A coach who reads one limitation and assumes it is the whole list is exactly the failure this data exists to prevent.

> [!important] Severity has to keep its two tones
> `Kerülendő` and `Óvatosan` are different instructions. The strong tone belongs to `kerülendő` only; `óvatosan` gets the softer alert tone. `Régi, már nem fáj` never surfaces here at all — it is filtered out before the tile is built, as it already is in the panel today.

## States

- **Loading** — circle skeleton for the avatar, a title bar, three tile skeletons. No spinner.
- **Error / not found** — the server returns the same 404 for "not yours", "archived" and "never existed", so the UI shows one message: `Ez a kliens nem érhető el` / `Vagy nem hozzád tartozik, vagy archiválva lett.`, with a back button. Do not try to distinguish the three; that rebuilds the oracle the API refuses to be.
- **No questionnaire** — `A kliens még nem töltötte ki a kérdőívet.` replaces both answer tiles with one quiet row; the `HETI EDZÉS` tile shows a dash rather than a zero. The equipment card shows the same line instead of the chip row — there is no `onboarding_profiles` row to edit, and nothing a save here could read back afterwards.
- **Draft questionnaire** — `Hiányos` chip on the row, full warning inside the sheet.
- **Equipment card — loading** — a single card-shaped skeleton in place of the chip row and button, while its own onboarding read and the equipment taxonomy are both still pending. Never an empty chip row: that would read as "this client owns no equipment" before either fetch has answered.
- **Equipment card — saving** — the `Mentés` button shows its busy spinner and is disabled; the chips stay interactive so a coach can keep adjusting before committing.
- **Equipment card — saved** — a toast, `Felszerelés mentve`, and the draft clears back to whatever the server just confirmed. The client is notified server-side in the same request.
- **Equipment card — link archived mid-edit** — a save that 404s (the same story as the whole-page not-found state: not this coach's link any more, or archived) shows `Vagy nem hozzád tartozik, vagy archiválva lett.` under the chips and keeps the draft so the coach is not made to redo the taps.
- **Equipment card — save failed for any other reason** — the questionnaire's own `A mentés nem sikerült — a válasz megmarad, újrapróbáljuk` under the chips; the draft is kept, never silently dropped.
- **Empty plan tab** — `Ennek a kliensnek még nincs terve` / `Készíts egy újat, vagy klónozz rá egy sablont.`, with both action buttons still present.
- **Offline** — shell indicator; `Új terv a kliensnek` and `Klónozás` disabled.
- **Role-gated** — the route is coach-only; a member reaching it gets the same not-found state, since the link id is what carries the proof of access.

## Components

Reuses `Pressable` (chip shape for the tabs, keeping the real `role="tablist"` semantics and arrow-key movement — do not downgrade them to four styled buttons), `EmptyState`, `Skeleton`, `Sheet` for the questionnaire, `CountUp` on the three tiles, the existing `PlanTab`, `NutritionTab`, `ProgressTab` and `ChatTab` panels unchanged behind the strip, and the `control` recipe for the ghost row.

Genuinely new: the status-ring avatar, the answer tile (label over value, two tones), and the disclosure row with trailing chip and chevron. One real implementation cost: the `TERV` stat tile needs the plan list at page level, which today only `PlanTab` fetches — hoist the query, do not add a second endpoint.

**The equipment card** (`ClientEquipmentCard`) is the same `Toggle` chip already used by the client's own Settings equipment section, wrapped in `Surface` with a `Pressable` save button — no new interactive primitive. It reads through `useClientOnboarding(linkId)` (already fetched at page level for the two answer tiles, so no new request) and reads the pickable options through `useTaxonomies(lang)`, already the library screen's own query — not a fourth way to fetch the same taxonomy. It writes through a new `useSetClientEquipment(linkId)` mutation onto Task 1's `PATCH /clients/:linkId/onboarding/equipment`, which on success invalidates the onboarding query rather than trusting the array it just sent.

## Navigation

Bottom bar with `EDZŐ` active. Coach role: 6 tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `PROFIL`. This screen is a push from `EDZŐ`; the tab stays lit and the back link, not the bar, is the way out.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/07-coach-client-detail-terv.webp]]
![[_mockups/vilagos/07-coach-client-detail-terv.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
