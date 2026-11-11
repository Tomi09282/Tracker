---
type: design-index
title: Pulse — the design of record
updated: 2026-10-18
tags: [ux, design, pulse, index]
---

# Pulse — the design of record

The app's visual design after the owner dropped the liquid-glass look in October 2026. Every screen is drawn in Figma in one language, **Pulse V1 “Open Field”**, and it is **implemented** on the local branch `pulse-redesign` (2026-10-18; not pushed, not merged into `master`). Decision and history: [[60-Decisions/0020-pulse-replaces-liquid-glass]]; how it was built and what was ruled on the way: [[60-Decisions/0021-pulse-implementation]].

> [!success] State of the implementation (2026-10-18)
> All 24 screens are rebuilt on the Pulse kit (`frontend/src/ui`), the liquid-glass bridge is deleted, and the build refuses every construct of the old boxed look (`check:pulse`). Values live in `frontend/src/ui/tokens/tokens.css`; this folder holds the rules.
> - **Matched (17 frames):** the app on recorded data equals the frame within the measured tolerance.
> - **Matched on a fixture (32):** the same, but the recording does not hold the frame's sample data, so a schema-checked fixture supplies it — the look is proven, the data is a sample.
> - **Matched by code, not reachable as a screen (1):** post-detail-3. **No screen any more (1):** workout-3 (D2 sends a member with no session to the library).
> - **Still differ (8):** library-1..3 (the equipment stills: the API carries the keys now, eight stills are still to be made), marketplace-1/2 (the lead post's caption is held back), admin-2 (the submission's photograph is data), style-studio-1/2 (every element is honestly dormant — Q3 — so no live specimen and no save toast).
> - **Open:** `docs/pipeline/pulse/deviations.md` (where the app knowingly differs, each waiting for a ruling), `docs/pipeline/pulse/copy-to-approve.md` (strings the owner did not draw), `docs/pipeline/pulse/review/open.md` (the regression sweep's non-regression findings), and the follow-up packages in order: (1) the coin-store pack delisting on the backend (Q2), (2) finish / abandon workout (D3).
> Per frame: `docs/pipeline/pulse/review/final.json`.

- **Figma:** https://www.figma.com/design/SkWidL9kDDWhBip7cUCFtr — pages “10 · PULSE — Rendszer” (tokens, 51 components in every state, the image shelf), “11 · PULSE — Tag”, “12 · PULSE — Edző”, “13 · PULSE — Piactér, belépés, admin”. Pages 01–05 are the five explored directions; page “03 · Pulse” holds the two approved V1 screens.
- **Archive on disk:** `C:\Users\Petike\Documents\TRACKER-mockups\5-pulse` — all 59 frames as 2x PNG, the 49 images with their manifest, the Figma build kit and one build script per frame.

> [!important] What Pulse is, in five lines
> A black room in which things light up: near-black canvas, one acid-lime lamp, giant condensed numerals, graphite renders and low-key black-and-white photographs glowing out of the dark.
> **No boxes.** Nothing is enclosed in a card; structure is one left edge, hairlines, small-caps eyebrows, big numerals, mono meta and space.
> One lime pill per screen at most (the primary action); every other lime mark means live, selected or done.
> The tab bar has no capsule; its icons are a custom rendered set and the active one is the same icon lit lime.
> Rules, tokens, components: [[Pulse System]].

## The two screens the owner approved

![[_mockups/pulse-v1-home.webp|300]] ![[_mockups/pulse-v1-profile.webp|300]]

## Every screen

59 frames across 24 screens. Each was built by one agent, inspected by an independent reviewer and fixed where the review found a blocking defect.

### Tag — Figma page “11 · PULSE — Tag”

| Screen | Route | Frames | Content source |
|---|---|---|---|
| Kezdőlap | `/` | edzésnap · edzés folyamatban · nincs terv | [[Feature inventory]] (1) |
| Edzéslejátszó | `/workout` | futó edzés · rekord és pihenő · nincs futó edzés | [[Screens/workout\|inventory]] |
| Gyakorlatok (izomválasztó) | `/library` | alapállapot · Elöl · Mell · Hátul · Széles hátizom | [[Feature inventory]] (2) |
| Gyakorlat részletei | `/library/:id` | Alapállapot · Hátsó nézet | [[Screens/exercise-detail\|inventory]] |
| Étkezés | `/nutrition` | mai nap · kiválasztott étel | [[Screens/nutrition\|inventory]] |
| Haladás | `/progress` | Test · Megosztás · Fotók · üres | [[Screens/progress\|inventory]] |
| Profil (Beállítások) | `/settings` | első nézet · teljes görgetés | [[Feature inventory]] (3) |
| Érmék | `/coins` | Bolt · Eredmények · Kimutatás | [[Screens/coins\|inventory]] |
| Értesítések | `/notifications` | érkezés, 2 olvasatlan · üres | [[Screens/notifications\|inventory]] |
| Onboarding kérdőív | `/onboarding` | 5/5 · visszatérő tag · 1/5 · első megnyitás · 2/5 · hiányzó válasz | [[Screens/onboarding\|inventory]] |

### Edző — Figma page “12 · PULSE — Edző”

| Screen | Route | Frames | Content source |
|---|---|---|---|
| Edzői kezdőlap | `/coach` | Alap · A kód elkészült (lap) · Átadásra váró fiók | [[Screens/coach-dashboard\|inventory]] |
| Kliens adatlap | `/coach/clients/:id` | Terv · Táplálkozás (rövidítve) · Haladás (rövidítve) | [[Screens/client-detail\|inventory]] |
| Csevegés | `/coach/clients/:id/chat` | beszélgetés · üres | [[Screens/coach-chat\|inventory]] |
| Edzéstervek | `/coach/plans` | könyvtár · üres | [[Screens/coach-plans\|inventory]] |
| Tervszerkesztő | `/coach/plans/:id` | alapállapot · nyitott nap · gyakorlatkereső | [[Screens/plan-editor\|inventory]] |
| Piactéri pult | `/compose` | alap · profil lap | [[Screens/compose-hub\|inventory]] |
| Edzői profil szerkesztő | `/compose/profile` | szerkesztés · név és város | [[Screens/compose-profile\|inventory]] |
| Poszt szerkesztő | `/compose/posts/:publicId` | piszkozat borítóval · új bejegyzés | [[Screens/compose-post\|inventory]] |

### Nyilvános + admin — Figma page “13 · PULSE — Piactér, belépés, admin”

| Screen | Route | Frames | Content source |
|---|---|---|---|
| Belépés és regisztráció | `/login, /register` | Belépés · Regisztráció | [[Screens/auth\|inventory]] |
| Piactér | `/m` | alap · keresés | [[Screens/marketplace\|inventory]] |
| Poszt részletei | `/m/p/:publicId` | esemény · program · szövegelemek (minta) | [[Screens/post-detail\|inventory]] |
| Edzői profil (nyilvános) | `/m/c/:handle` | ellenőrzött edző · bio kinyitva | [[Screens/coach-profile\|inventory]] |
| Admin áttekintés | `/admin` | Moderáció, 3 várakozik · Beküldés megnyitva · Fiókok | [[Screens/admin\|inventory]] |
| Elem-stílus stúdió | `/admin/styles` | E1 Button, D aktív · E1 átváltva C-re, mentve | [[Screens/style-studio\|inventory]] |

## Overview sheets

**Tag 1/2**

![[_mockups/pulse-tag-1.webp]]

**Tag 2/2**

![[_mockups/pulse-tag-2.webp]]

**Edző 1/2**

![[_mockups/pulse-edzo-1.webp]]

**Edző 2/2**

![[_mockups/pulse-edzo-2.webp]]

**Belépés, piactér, admin**

![[_mockups/pulse-nyilvanos.webp]]


## In this folder

- [[Pulse System]] — the law for implementation: tokens, layout grammar, components with states, imagery rules, do/don't.
- [[Feature inventory]] and `Screens/` — what each screen really does, with the exact Hungarian copy, states and do-not-invent lists (read from the code and verified by a second pass).
- [[Product gaps]] — what the designs need that the product does not provide today (data, endpoints, strings), per screen.
- [[Pulse Review Brief]] — the five-lens review of the first Pulse screens: measured findings and proposals, several of them still open.

## Open decisions (the owner's, before implementation) — all answered

Answered on 2026-10-11 / -12 (D2, D3, D1 + Q2, Q1) and recorded in [[60-Decisions/0021-pulse-implementation]]: the "Edzés" tab shows the selector when no session runs and Home has a library row; finishing a workout is its own package after the screens; Pulse is the only look and the packs are delisted; the mannequin is neutral renders with drawn regions (built, 1:1 with the frames). The list below is the question as it stood.

1. **Where the muscle selector lives.** Today `/library` is reachable only from Home's empty state; the “Edzés” tab opens the player, which is an empty text screen when no session runs. Options: the tab shows the selector when no session runs / a permanent row on Home / leave as is.
2. **Finishing a workout.** Nothing in the UI finishes or abandons a session, so after the first “Indítás” Home shows “Edzés folyamatban · Folytatás” for ever. The endpoints exist; the action and its copy do not.
3. **Theme packs in Pulse.** The product sells packs; Pulse is one black and one lime. Proposed: a pack changes the colour of the light only.
4. **The mannequin as a production asset.** The figure is a generated picture whose panels do not match the 19-muscle roster (one shoulder cap for two muscles, no neck/adductor/abductor panel). It needs a real kit — neutral front and back plus per-muscle highlight regions — before the selector can ship.

## Honest limits

- First-pass design: one review-and-fix round per screen, no user testing, dark only, 402 pt wide only.
- All photographs and renders are AI-generated (Higgsfield); usage terms and long-term consistency have to be checked before release.
- Exercise thumbnails use eight equipment stills; the list API now carries each exercise's equipment keys (owner ruling 2026-10-17), but eight of the sixteen equipment types still have no still, so the library rows leave the cell empty.
- Tab-bar icons are raster; the coach and admin tabs have theirs, any further tab or accent pack needs a new render or a tint.
- The Dynamic Island / native iOS pieces from the Liquid Glass exploration are not part of Pulse.
