---
type: screen-inventory
title: Elem-stílus stúdió — screen inventory
updated: 2026-10-11
route: "/admin/styles"
tags: [ux, screen, inventory, pulse]
---

# Elem-stílus stúdió — `/admin/styles` · admin (the page itself has no role gate, only saving is refused for others) · from `/admin` via the "Stílus stúdió" link; desktop command palette · lit tab: Admin (6th of 7)

Sources read: `frontend/src/features/admin/StyleStudioPage.tsx`, `useElementStyles.ts`, `ui/feedback/catalog.ts`, `features/playground/PlaygroundPage.tsx` (the preview harness), `ui/feedback/ToastHost.tsx`, `app/navTabs.ts`, `backend/src/theme/routes.js`, migrations `002_theming.sql` / `012_element_style_e27.sql`, brain spec `55-Screens/admin-elem-stilus-studio.md`. Copy is quoted in the form key = "value", every pair taken from `frontend/src/i18n/hu.json` and machine-checked against it. Status: **live** = rendered on the route · **planned** = spec only · **cut**.

## Purpose

The product has 27 interactive UI elements (button, toggle, toast, rest timer …), and each ships in five behaviour variants, A to E — differences in motion and feedback, not in colour. Here the admin picks which variant every user gets. The change is global, immediate for the admin and live for everyone else on their next load, with no deploy. The admin usually comes for ONE element ("what does the button do when pressed, and can it do better?"), so the screen shows that element live and pressable.

**The ONE primary action:** `studio.makeActive` = "Legyen ez" on a variant — one tap commits, no confirmation, no save bar.

## Elements

### MUST (all live)

| # | Element | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| 1 | Screen header | Eyebrow, h1, one-line intro. No back control in the code (the Admin tab is the way back) | `studio.eyebrow` = "Megjelenés" (rendered upper-case) · `studio.title` = "Elem-stílus stúdió" · `studio.intro` = "Minden elem öt változata, élő komponenssel." | — |
| 2 | Hero stage — "what is live right now" (the screen's anchor) | Label: element name · id (upper-case; catalogue text, English, no key) · state tag on the right · in the middle the REAL element running its active variant at 150 %, pressable (pressing only plays its feedback, it commits nothing) · caption: active letter · variant name (catalogue text, no key) | state tag `studio.active` = "aktív" (or `studio.inertShort` = "nem használt") | "BUTTON · E1" · "aktív" · a primary button reading "Save" with a share glyph · "D · Morph-to-progress" |
| 3 | Element chooser (27, single choice; a horizontally scrolling rail on a phone, catalogue order E1 … E27) | Each option: a mark for the element + id + name (name truncates). Selecting swaps the hero and the five variants; it saves nothing. Elements nothing reads are muted | group name, not visible: `studio.elementList` = "Elemek" · names have no key (English) | "E1 Button" (selected) · "E2 Copy button" · "E3 Icon button" · "E4 Toggle" … |
| 4 | Section heading | Names the list of five; carries the "not used" tag for an inert element (today's code puts a palette-glyph tile before it — decoration) | `studio.variants` = "Változatok" · `studio.inertShort` = "nem használt" | — |
| 5 | Consequence note (above the variants, live elements only) | Says who is affected before the admin taps | `studio.commitNote` = "Amit itt kiválasztasz, az a következő betöltésnél minden felhasználónál érvényes lesz — kódmódosítás és újratelepítés nélkül." | — |
| 6 | Variant row × 5 (A – E) | A small stage with the real element under THAT variant (pressable) · label: letter · variant name (upper-case, English, no key) · on the active one a check + tag · a hairline under the label (the slot the planned description would sit under) · one commit control | `studio.active` = "aktív" · `studio.makeActive` = "Legyen ez" · `studio.isActive` = "Ez az aktív" (check glyph, disabled) | "A · PRESS-SPRING" · "B · RIPPLE" · "C · SHEEN-SWEEP" · "D · MORPH-TO-PROGRESS" ✓ aktív · "E · ICON-SLIDE" |
| 7 | Result toast (the only confirmation; one sentence) | Success after a switch; error when it did not go through. No undo. Parts: a kind glyph (check for success, warning for the error), the sentence, a close icon (name `common.dismiss` = "Bezárás"), a thin countdown line along its bottom edge (absent under reduced motion); closes by itself after 4 s | `studio.saved` = "{{id}} mostantól {{variant}} változatot használ" · `studio.failed` = "A módosítás nem ment át. Frissítsd az oldalt, és nézd meg, mi az aktuális állapot." | "E1 mostantól C változatot használ" |
| 8 | Bottom bar, 7 tabs | Admin lit (it owns `/admin/…`) | `nav.admin` = "Admin" · entry link on `/admin`: `admin.styleStudio` = "Stílus stúdió" · palette entry: `nav.styleStudio` = "Stílus stúdió" | — |

### SHOULD (live, conditional)

| # | Element | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| S1 | "No live preview" text (in the hero, instead of the element) | For the 7 elements this screen cannot demonstrate. Their five variant stages then show only the letter | `studio.noPreview` = "Ehhez az elemhez még nincs élő előnézet ezen a képernyőn. A változat attól még valódi: a komponensek olvassák." | E21 Set-check row |
| S2 | Inert explanation (replaces the consequence note) | For the 3 elements no component reads: all five commit controls are disabled; the active one is still marked | `studio.inertExplain` = "Ezt a beállítást jelenleg egyetlen komponens sem olvassa. Elmenteni és auditálni lehetne, de a termék nem változna tőle egy képpontot sem — ezért a váltás le van tiltva, amíg nem kap fogyasztót." | E23 Like / reaction |
| S3 | Load-failed message (under the variant list) | Palette mark, title, body; no retry control | `studio.loadFailed` = "Nem sikerült betölteni a stílusokat" · `studio.loadFailedBody` = "A szerver nem válaszolt. Frissítsd az oldalt." | — |
| S4 | Desktop list (≥ 1024 px) | The rail becomes a 27-row column; each row of a live element also shows its active letter (the three unused elements show none) | no key | "E1 Button · D" |

**The catalogue** (ids, English names and the seeded active letter are real: `catalog.ts` + migrations 002 / 012):

| Group | Elements — id name · active |
|---|---|
| Live, with a preview stage (20 — 19 real specimens; E20's stage holds only an English sentence, and no product screen mounts a FAB, only the `/playground` QA page) | E1 Button · D — E2 Copy button · A — E3 Icon button · A — E4 Toggle · A — E5 Checkbox · A — E6 Segmented control · A — E7 Text input · A — E8 Select · D — E9 Date picker · A — E10 Tabs · A — E11 Bottom nav item · A — E12 Card · D — E13 List item + swipe · B — E14 Modal / sheet · A — E15 Toast · C — E16 Progress / ring · D — E17 Slider · A — E18 Skeleton · A — E19 Pull to refresh · C — E20 FAB · B |
| Live, no preview here (4) | E21 Set-check row · A — E22 Rest timer · A — E25 Coin balance · B — E26 Streak / achievement · A |
| Not used by any component (3) | E23 Like / reaction · A — E24 Follow button · A — E27 Interval stage · A |

Variant names used in the frames — E1: A Press-spring · B Ripple · C Sheen-sweep · D Morph-to-progress · E Icon-slide. E23: A Heart-burst · B Double-tap · C Reaction-bar · D Liked-pulse · E Count-roll.

Planned, not live: Hungarian element and variant names ("E1 Gomb", "C · Fénypászma") and a one-sentence description per variant — the brain spec draws them, the catalogue has neither.

## States

- **Loading** — the chooser is already complete (it is static); the hero shows a control-sized skeleton and a caption skeleton, no state tag; the five variant rows are five block skeletons.
- **Default** — element E1 is selected on arrival, always (the choice is not remembered and not in the URL).
- **Saving** — the tapped row's control shows a spinner; all five commit controls are disabled until the answer arrives.
- **Saved** — success toast (element 7); the hero element, its caption and the active row change together.
- **Save failed** — error toast `studio.failed`; the screen re-reads the server state. Also what a non-admin gets on any tap.
- **No preview, live** (E21, E22, E25, E26) — hero: tag "aktív", the `studio.noPreview` text, caption as usual; variant stages show the bare letter; commit controls work.
- **Inert** (E23, E24, E27) — chooser option muted; hero tag "nem használt" + the `studio.noPreview` text; heading tag "nem használt"; `studio.inertExplain` instead of the consequence note; five disabled controls (the active row still reads "Ez az aktív").
- **Load failed** — S3 appears under the list; above it the hero falls back to the `studio.noPreview` text with a "·" caption, and the five rows still render with no row marked active (misleading; gap).
- **Not an admin** — no forbidden page here (unlike `/admin`): the studio renders in full and no tab is lit; a tap ends in the error toast.
- **Offline** — nothing of its own: shell strip `offline.title` = "Nincs internetkapcsolat"; last loaded variants stay, a switch fails into the error toast.
- **Reduced motion** — every variant still changes state, it just does not travel (the previews are real components).

## Frames to draw

Canvas 402 × 874, admin role, 7-tab bar with Admin lit. The page is long (roughly 1 400 pt, estimated); frame 2 is scrolled.

**1. `Stílus stúdió — E1 Button, D aktív`** (arrival; top of the page)
1. Eyebrow "MEGJELENÉS" · h1 "Elem-stílus stúdió" · "Minden elem öt változata, élő komponenssel."
2. Hero stage: "BUTTON · E1" on the left edge · "aktív" on the right edge · centred, large: the product's primary button, label "Save", share glyph before the label · centred caption "D · Morph-to-progress"
3. Element rail (scrolls sideways; three and a bit options visible): "E1 Button" (selected) · "E2 Copy button" · "E3 Icon button" · "E4 Toggle" (cut by the right edge)
4. Heading "Változatok"
5. "Amit itt kiválasztasz, az a következő betöltésnél minden felhasználónál érvényes lesz — kódmódosítás és újratelepítés nélkül."
6. First variant row, cut by the bottom fade: a small stage with the "Save" button · "A · PRESS-SPRING" · "Legyen ez"
7. Tab bar: Kezdőlap · Edzés · Étkezés · Haladás · Edző · **Admin** · Profil

**2. `Stílus stúdió — E1 switched to C, saved`** (scrolled so the heading sits under the status bar; shows all five rows and the toast)
1. Heading "Változatok" · the consequence note (as above)
2. Row — stage: "Save" button · "A · PRESS-SPRING" · "Legyen ez"
3. Row — "B · RIPPLE" · "Legyen ez"
4. Row, ACTIVE — "C · SHEEN-SWEEP" · "✓ aktív" · "✓ Ez az aktív" (disabled)
5. Row — "D · MORPH-TO-PROGRESS" · "Legyen ez" (was active a moment ago)
6. Row — "E · ICON-SLIDE" · "Legyen ez"
7. Success toast: "E1 mostantól C változatot használ"
8. Tab bar, Admin lit
- Variant worth a small second artboard — saving: spinner in row C's control, the other four controls disabled, no toast yet.

**3. `Stílus stúdió — E23, nem használt`** (an element nothing reads; top of the page)
1. Eyebrow "MEGJELENÉS" · h1 "Elem-stílus stúdió" · intro line
2. Hero stage: "LIKE / REACTION · E23" · "nem használt" · centred text instead of an element: "Ehhez az elemhez még nincs élő előnézet ezen a képernyőn. A változat attól még valódi: a komponensek olvassák." · caption "A · Heart-burst"
3. Element rail, scrolled: "E22 Rest timer" · "E23 Like / reaction" (selected, muted) · "E24 Follow button" (muted) · "E25 Coin balance" (cut)
4. Heading "Változatok" · tag "nem használt"
5. "Ezt a beállítást jelenleg egyetlen komponens sem olvassa. Elmenteni és auditálni lehetne, de a termék nem változna tőle egy képpontot sem — ezért a váltás le van tiltva, amíg nem kap fogyasztót."
6. Rows (stage shows only the letter; every control disabled): "A · HEART-BURST" · "✓ aktív" · "✓ Ez az aktív" — then "B · DOUBLE-TAP" · "Legyen ez" (cut by the fade); below the fold "C · REACTION-BAR", "D · LIKED-PULSE", "E · COUNT-ROLL"
7. Tab bar, Admin lit

## Images

- **The image here is the element itself.** The hero and the five small stages hold real product components, so in Pulse they are drawn as Pulse components: for E1 that is the lime pill with its glow. No photograph and no 3D render belongs on this screen; an empty, dark stage around one lit control is the picture.
- **Needed and missing:** the same two tab icons as on `/admin` ("Edző", "Admin") for the 7-tab bar.
- **Chooser marks:** the code uses 27 small line glyphs (pointer, copy, toggle, card …). The owner rejected basic line icons in the nav bar ("nothing basic"), so they should not carry this rail either; the id ("E1") set in the display face can carry the option instead — 27 custom renders for an admin tool are not worth generating.
- **Must NOT be shown as if it existed:** a preview for E21, E22, E25, E26, E23, E24, E27 (text or a bare letter only) · a preview of E20 FAB (its stage shows an English sentence, "Rendered fixed to the viewport, bottom-right") · screenshots, GIFs or recordings standing in for a live element · Hungarian element / variant names · a description sentence under a variant · any figure for "users affected".

## Do not invent

- Search, filter, grouping or favourites in the chooser; a per-screen or per-role scope (every choice is global); a per-user choice (members cannot pick variants anywhere).
- A confirmation dialog, a "Mentés" bar, a draft / "preview for me only" mode, undo in the toast, "reset to defaults", scheduling or percentage roll-out, A/B statistics.
- "Last changed by / when" or a change history — an audit row is written on the server but shown nowhere.
- Editing colours, radii, fonts or tokens here; creating, duplicating or renaming a variant; reordering elements. Theme packs are a different feature and live in Profil.
- A back arrow or breadcrumb as an existing control (none in the code); a link to this page from Profil (the brain spec says so; the code links Profil only to `/admin`).
- Product features implied by catalogue names: "Like / reaction" and "Follow button" are element ids for features with no UI (reactions were cut; following is a database table with no endpoint and no button) — hence "nem használt"; "Streak / achievement" does not mean a streak counter exists; "FAB" and the variant "Center-FAB" do not mean the shell has a floating action button.
- A forbidden / locked page for non-admins on this route — the code has none.

## Notes for the designer

- **Ten lime shapes versus "one filled shape".** The code renders four "Legyen ez" as primary buttons, and the six E1 specimens (hero + five stages) are primary buttons too — ten filled accent shapes on one screen. In the approved language the specimens are content (they must look exactly as they ship), so the commit control cannot also be a lime pill: draw "Legyen ez" as a quiet control or text link, and mark the active row as "lit" (letter, check and "aktív" in the accent). Then the only lime shapes on the screen are the elements under inspection.
- **One meaning of active:** accent everywhere (selected chooser option, active row, "aktív" tag). Success green belongs to the toast only.
- **English inside a Hungarian screen.** Element names, variant names, the hero label and everything inside the specimens are hard-coded English with no key: "Save", "Demo toggle", "Demo checkbox", "All / Mine", "Demo field", "Plan / Log", "Interactive card", "Swipe me", "Open sheet", "Show toast", "Pull down from the top". Draw them in English; do not translate.
- **Copy conflict to raise with the owner, not to fix:** for the three inert elements the hero says "…A változat attól még valódi: a komponensek olvassák." and two blocks lower the explanation says no component reads it.
- **Long strings:** `studio.inertExplain` 194 characters (5 to 6 lines at 354 pt) · `studio.commitNote` 125 · `studio.noPreview` 110, centred inside the hero · `studio.failed` 82 — a toast that must wrap to two or three lines · longest names: "E26 Streak / achievement", "E13 List item + swipe", "E6 Segmented control" (the code truncates them at 112 pt), variants "MORPH-TO-PROGRESS", "INDETERMINATE-SWEEP", "MORPH-FROM-TRIGGER".
- **Glyph check:** "Copy→check morph" (E2 · A) and "Ghost→accent" (E3 · E) contain "→", and labels contain "+", "/" and "·" — confirm the display face has them before setting labels in it.
- **Seeded active letters are real** (table above): E1 arrives on D, not on the "C · Fénypászma" of the old mock-up. Frame 2 switches it to C so the saved toast matches the brain spec's example sentence.
- **The toast** is the screen's only announcement (`role="status"`), one sentence. On this screen it sits at the BOTTOM, above the tab bar — that is what the code does (the review brief places toasts at the top; the code does not, here). The Pulse overlay rule (brief §3.5: a `surface-2` capsule with a semantic dot, no shadow) decides its look only. At most three stack.
- **Wide specimens are cropped on purpose:** the small stage is two fifths of the row and clips (E7's field, E13's swipe row, E11's mini bar); all five rows keep one height.
- **E11 "Bottom nav item"** previews a two-tab mini bar ("One", "Two" with a count of 2), and the real bar under the thumb changes the moment a variant is committed. Its variants (A · Active-pill, E · Center-FAB …) were written for the old bar; how they map onto Pulse's capsule-less bar with image icons is an implementation question (brief X-13), not something to draw now.
- **Skeletons, never spinners,** except the one spinner inside the control being saved.
- **7 tabs at 402 pt:** brief §9.2 — side inset 8, equal cells of 55.1 pt, icon box 28, labels always shown.
- On a phone the only door to this page is the "Stílus stúdió" link on `/admin`; there is no way back except the Admin tab.
