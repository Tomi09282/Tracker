---
type: design-review
title: Pulse — five-lens review and v2 brief
updated: 2026-10-11
tags: [ux, review, pulse]
---

> [!warning] A review, not a decision
> Written while the owner was still choosing a container language. He then chose V1 “Open Field” and asked for the whole app in it. Proposals here that change what he approved (dropping the mono face, replacing the fist photograph, a new mannequin, the training-hub tab, a finish-workout action) are OPEN — see [[0000 Index]].

# PULSE v2 — working brief (Home · Muscle selector · Profile + the Pulse system)

Status: merged from five reviews (craft, UX/flows, taste, system, coverage) plus the skeptic's re-check in `specs/pulse-reviews.json`, re-read against the three reviewed shots, the two V1 "Open Field" shots, `specs/pulse.md`, `build/pulse/prelude.js`, `build/pulse/v1-prelude.js`, `feature-inventory.md` and the app's `tokens.css`.
Owner's steer for this round: improve, do not reinvent · kill the generic cards · keep it very clean ("nagyon letisztult") · three screens in depth plus the design system.
Not re-planned here (already in progress): the three container languages (V1 Open Field, V2 Instrument Panel, V3 Bands and Image Surfaces), the new raster tab icons, the back-view mannequin render.

Reading guide: every decision is final for the build unless it is one of the four questions in section 10. Where the reviewers disagreed the line ends with "Decided: … because …".

---

## 1. VERDICT

**Keep — this is the signature, do not touch it.**

1. The black room where lime is light, not paint: one glowing primary action per screen, no drop shadows, black kept as part of the composition.
2. The giant condensed numerals with the seven-segment week bar under them ("2/4" at 124 pt). The bar's three states (lit / pending / off) are the best piece of grammar in the direction and become the grammar of everything.
3. The mannequin whose selected muscle is the lamp, in the same lime as its chip. It is the only image in the product that is also an interface.
4. The edgeless image (true-black asset, no rectangle anywhere).
5. The monogram closed by a lime full stop — an identity that does not fake a profile photo.
6. The discipline underneath: one left edge (24) and one right edge (378), three text tiers that measure 17.7 / 8.7 / 5.6 : 1, verbatim Hungarian strings, nothing from the do-not-invent lists.

**Weak — in this order.**

1. The mannequin is a picture, not a kit. Its panels are not the product's muscles (one shoulder cap for "Elülső vállizom" and "Oldalsó vállizom", no neck / adductor / abductor panel, kneecap and pelvis plates that are no muscle), left and right do not mirror, the lime is baked in, and there is no back view although 10 of the 19 map muscles live there.
2. The screens show states a real account almost never sees. Home is drawn before the first "Indítás" (after it the product shows "Edzés folyamatban … Folytatás" for good); the selector is drawn with the chest lit (it opens with nothing lit); the selector has no door on any day that has a plan; the list rows show equipment pictures the API cannot key today.
3. Five image languages on three screens (a grainy photo of skin, a CG mannequin, soft toy icons, chrome product shots, a haze texture). The two dirtiest things in a "nagyon letisztult" app sit on two hero spots: the fist and the marbled monogram.
4. The system is one state deep and one width wide: 22 type roles in three families, no motion, no overlay / error / skeleton rules, nothing below 402 pt, success folded into the accent.
5. The containers (uniform 28 pt bordered cards and stat tiles — the owner's "AI slop"). Already answered by the three variants; recorded below as done.

**The one thing that matters most.** Turn the mannequin from a generated picture into a production kit: one neutral front and one neutral back from a single source, grooves only where the product has a muscle (12 in front, 10 behind), the lime drawn in the app through vector regions. It is the signature, it is the only P0 that blocks drawing (idle state, back view, exercise detail, player all need it), and it sets the render family every other image has to match.

---

## 2. CHANGES PER SCREEN

Priorities: **P0** = blocks the round or contradicts the product · **P1** = visible quality or flow defect, fix in v2 · **P2** = polish / hygiene, fix while the tokens are cheap.

### 2.0 Done in the variants — not open work

Recorded so nobody re-opens them. Source: `shots/pulse/v1-home@2x.png`, `v1-profile@2x.png`, `build/pulse/v1-prelude.js`.

| # | Finding (review ids) | State in the variants |
|---|---|---|
| D1 | Uniform big-radius bordered cards and stat tiles — "AI slop" (owner; taste-profile-timid) | Gone in V1 (nothing is enclosed); V2 and V3 offer two other answers. The owner picks. |
| D2 | Solid lime pill behind the active tab; the nav was the largest lime object on two of three screens (craft-tab-lime-budget, taste-lime-spent-on-nav) | No pill, no capsule. Active = the lime-lit icon + text-1 label. Nav lime is now a fraction of the content's. |
| D3 | Dim graphite tab icons at 65 % opacity, 2.4–2.9 : 1 (craft-tab-icon-contrast, taste-tab-icons-grey-blobs) | One raster set, brighter steel at 100 % opacity when inactive, the same pixels tinted lime when active (`assets/pulse/icons_v2.py`). |
| D4 | Tabs changed position with the active tab — up to 19.5 pt of travel (craft-tab-shift) | No hugging pill, positions are fixed. Formalised as equal cells in section 9. |
| D5 | Grey icon dissolving into a pack accent on the pill (system-pack-active-icon) | No grey-on-accent pairing left; the tint is computed from the same pixels, so a pack recolours it. |
| D6 | Backdrop blur on the capsule that changes < 8 % of what is seen (system-capsule-blur-dead) | No capsule in V1. If V2 / V3 keep a bar surface: solid, no `backdrop-filter`. |
| D7 | Profile's only glow spent on a round chevron button pointing at a store where the persona can buy nothing (taste-profile-timid, coverage-coins-undesigned) | No glow on Profile in V1. Rule kept: no glow on Profile at rest. |
| D8 | Ring gauge and typewriter figures on Profile ("83 , 1") (taste-mono-not-earning, craft-mono-figures) | V1 sets 190, 4/7 and 83,1 in display numerals. Still open on Home — see H-07. |
| D9 | Slash kerning "2/ 4" (craft-slash-kerning) | V1 `fraction()` locks the slash by ink with equal gaps. |
| D10 | Trailing chevrons 5.5–6 pt short of the right edge; two centre lines in the wallet card (craft-chevron-inset, craft-coin-icon) | V1 places text and glyphs by ink edge and baseline (`put`, `inkX`). |
| D11 | Bell on a bordered disc | V1 bell is a bare glyph with the lime badge. |

Still visible in the V1 shots and therefore still open: the fist photo (H-02), the marbled monogram (P-01), Geist Mono on Home (H-07), the weak today mark and dim blank days (H-08, H-09), "Szia!" in the UI face (H-11), the blank coin stack (P-09).

### 2.1 Home

| ID | P | Where | Problem | Decision |
|---|---|---|---|---|
| H-01 | P0 | Today region; the frame itself | The drawn state ("Indítás") exists until the first tap. Nothing in the UI finishes or abandons a session and a new start resumes the open log, so a returning user — and the demo account, with a null title — sees "Edzés folyamatban · Szabad edzés · Folytatás" permanently. Pressing "Indítás" also flips the numeral to 3/4 and Friday to solid lime although nothing was achieved. | Draw the running-session Home as a first-class frame, with both titles ("Felsőtest – húzás", "Szabad edzés"). The started day gets its own half-lit segment (accent at 40 %) and the 6 pt live dot; solid lime keeps meaning "done". The numeral rises on finish, not on start (frontend: leave the open log out of the count). Which Home is "the default" depends on owner decision 2. |
| H-02 | P1 | Hero image `hero-grip` (216 × 180 pt, right of the numerals) | The only photograph and the only skin in a rendered world; film grain; the bar begins with a vertical soft cut (the whole rise happens in 14–18 pt); 94 % of the zone under the knuckles is clamped to black, so it reads as four knuckles and a detached thumb; 2.87 px/pt; says nothing the numerals do not. | Same slot, same composition, new picture: one on-family CG still per day state (training / rest / nothing scheduled) from the image system in section 4, so the image carries the state. Delivered at ≥ 4.5 px/pt. This is owner decision 4; if he keeps the photo it is re-graded (clamp at 8 with a soft toe, bar fade ≥ 40 pt, no grain). "Light today's muscles on a mannequin" is not done now — see 7.9. |
| H-03 | P1 | States that exist only as sentences | Rest day (3 of the persona's 7 days), done, nothing scheduled / first run (also what a failed today query shows), loading, week-query error, offline, two sessions today. No skeleton is defined for a 124 pt numeral; the product rule is "never a spinner". | Draw them (section 8). Skeleton: the numerals are two `surface-2` blocks at cap height, the week bar seven `track` segments, the image is withheld until the week query lands. The empty state keeps the hero stage with its still and carries the primary "Gyakorlatok böngészése". |
| H-04 | P1 | Under the today block | On every day that has a plan occurrence there is no way to the exercise library (the only `navigate('/library')` is in Home's empty state). | A permanent quiet row with the existing string "Gyakorlatok böngészése" and a small mannequin crop, → `/library`. Stays even if owner decision 1 makes "Edzés" the door. |
| H-05 | P1 | "Indítás" | A failed start (offline, rate limit, 404) only ends the busy dots; offline the button still looks live. | Offline → the disabled style (the strip is the reason). Failed → one inline danger line under the button. No string exists for it: new copy in hu / en / de, flagged, not invented here. |
| H-06 | P1 | Width | Specified at 402 only. At 375 the image touches the "4"; at 360 the bar runs about 16 pt behind it. | Supported range 360–430. Numerals `min(124px, 31vw)`; the image is sized in vw and keeps ≥ 12 pt of black beside the numerals (it shrinks first); gutter 16 below 376. Build a 360 × 800 frame. |
| H-07 | P1 | "18:00 · 5 gyakorlat", weekday letters, macro values | Geist Mono sets words and weekday letters (against the spec's own rule) and gives the macro value one font and its unit another. Still in V1. | Meta line and weekdays in Geist with tabular figures; macro values in display numerals 32 with the unit in Geist 13. Geist Mono leaves the system (section 3.2). |
| H-08 | P2 | Week bar, today | "Today" is a 4 pt dot under the label — the weakest mark in the bar. | Today is read on the segment itself: it is 12 pt tall instead of 8 (grows upward, same baseline) and its label is text-1. The dot is removed. |
| H-09 | P2 | Week bar blank days, macro tracks | 1.28 : 1 on the background. | `track` = white 22 % (1.93 : 1). The three day states stay lime / text-3 / track. Decided against a 3 : 1 blank day (craft) because a rest day is the null state and a brighter one fights "nagyon letisztult" (skeptic). |
| H-10 | P2 | "/4" | Taste asked for outlined pending digits. | Keep solid text-3. Decided: an outlined 124 pt glyph is a second graphic device, `-webkit-text-stroke` leaves artefacts at the joints of a condensed variable face, and V1 already reads "grey = pending" on both the digits and the scheduled segments. |
| H-11 | P2 | Header | Home opens in Geist 22 sentence case while the other tabs open in condensed capitals. | "SZIA!" in `display` 32 on the shared cap-top line (y 80); the date line stays Geist 13 text-2. |
| H-12 | P2 | "Táplálkozás" block | The only tap target is the 78 × 44 pt "Megnyitás" link; without a target the bar shows an empty track that reads as 0 %. | The whole block is one target to `/nutrition`, the link stays as the cue. No target → no bar at all. Over target → `warning` on value and bar, copy never scolds. |
| H-13 | P2 | Long content | A coach's day title is free text; German "Kohlenhydrate" is about 82 pt against a 76.5 pt macro column. | Day title: two lines max, `text-wrap: balance`. Macro name: one line, ellipsis. One German check frame (could). |
| H-14 | P2 | Build translation | Numerals are positioned from Figma ink measurements; a late font swap would reflow the hero. | Freeze the measurements as constants in em (left bearing, slash scale, cap ratio); preload Big Shoulders latin + latin-ext; `font-display: block` for the display face only. |

### 2.2 Muscle selector

No V1 frame of this screen exists yet; everything below is open.

| ID | P | Where | Problem | Decision |
|---|---|---|---|---|
| M-01 | P0 | The figure asset | Cannot express the roster: one cap per shoulder for two chips, no neck / adductor / abductor panel, closed panels that are no muscle (kneecaps, pelvis plate, collar), left / right mirror overlap about 75 %, lime baked in, no neutral base. | Replace with the mannequin kit of section 5: neutral front and back from one generation, mirrored, grooves only on roster boundaries, 22 vector regions, lime drawn in-app. |
| M-02 | P0 | "Hátul" | Ten muscles are on the back, seven of them only there (among them Combhajlító, Tricepsz, Széles hátizom). No asset, no frame. | Back base from the same kit; draw "Hátul" with "Széles hátizom" selected. |
| M-03 | P0 | Tab bar / entry | "Edzés" is lit, correctly by `navTabs.ts`, but that tab opens `/workout`, which without a session is a title and a body with no action. The showcase screen is unreachable on every plan day. | Owner decision 1 (recommended: "Edzés" shows the selector when no session runs, the player when one does) plus the Home row H-04. Frames keep "Edzés" lit. |
| M-04 | P1 | Default state | The screen opens with nothing lit on every mount and on every return from a detail (the selection is in memory only). That state was never drawn and nothing invites a tap. | Draw idle first. Invitation: the existing, currently unused string "Koppints egy izomra a szűréshez" in text-3 on the control line, plus one lime sweep across the regions on mount (not under reduced motion). Muscle, view, search and scroll position live in the URL (`/library?muscle=chest&view=front`) so Back restores them. |
| M-05 | P1 | Chip row | One 44 pt row shows 3 of 20 chips and is about 2 200 pt long; "Négyfejű combizom" starts about 1 400 pt in. Eight chips light nothing on "Elöl"; the chip that peeks in as the scroll cue ("Hátsó vállizom") returns nothing for a member. | Chips are scoped to the visible side: 12 on "Elöl", 10 on "Hátul", plus "Teljes test", in roster order, in one row. The figure and the chips can then never disagree and no chip is dark. Decided: one row, not the two rows UX proposed, because the screen already has only two list rows and side-scoping alone halves the travel; and no auto-flip is needed any more, because a chip can only name a muscle that is on screen. "Teljes test" has no region by design: the figure stays neutral and the list header names it. |
| M-06 | P1 | Vertical budget, scroll, keyboard | The stage takes 384 pt (54 % of the usable height) for 144 pt of figure ink; the list gets two rows and the second ends 6 pt above the bar, so the list looks complete at 2 of 24. No sticky or collapse rule; with the keyboard up no result is visible. | Two detents. Resting: stage height `clamp(240px, 40svh, 340px)`, chips, then the list with two whole rows and a third cut by the fade. Collapsed (on list scroll and on search focus): the stage folds into a sticky 56 pt bar — a 48 pt mini figure with the selection still lit (tap = expand) followed by the chip row; the header with the search field stays above it. List bottom padding = tab bar + 32 so the last row and the three paging skeletons clear the bar. |
| M-07 | P1 | Result rows | Both drawn rows carry an equipment still; the list payload has no equipment field, so the row that ships today is text-only. About 48 % of real names are English with an "EN" tag, about 47 % of rows have no difficulty, long names need two lines. | The 64 pt text-only row is the first-class design; draw it with honest rows: "Fekvenyomás · Erő", "Svend Press · Kezdő · Erő · EN", the two-line "Közepes fogású fekvenyomás rúddal". The still row is variant 2 (after `equipment_slug` exists); in a mixed list every row keeps one text edge (an empty 64 pt slot where there is no still). |
| M-08 | P1 | Count row | "24 gyakorlat" is the number of rows loaded so far and reads as a total; "Szűrők törlése" clears different things in two places. | The selection becomes the list header: "MELL ×" (eyebrow, from `muscle.chest`; × clears the muscle). No count unless the API returns a real total. "Betöltés" stays for the first load. |
| M-09 | P1 | The lit muscle | A flat, hue-locked fill with a faceted outline: a sticker on a 3D body. | Lime through the form map (section 5): centre about 100 %, edges about 70 %, groove still visible, plus a pre-blurred bloom copy at 60 %. Acceptance: at stage size the pec still reads as convex. |
| M-10 | P1 | Figure render defects | Realistic toes; the feet are the brightest part (4.1–4.6 : 1) while thighs and shins sink (2.0 / 1.7 : 1); a white glint at the crotch. | New render: smooth boot-like feet, legs at the torso's tone (about 2.5 : 1), nothing unselected brighter than the torso + 10 %, no rim light on the inner thighs. |
| M-11 | P1 | Control line | "IZOMCSOPORT" sits on the feet line, 27.5 pt from the chips it names, sharing the line with the view switch. | "IZOMCSOPORT" sits directly on its chip row (16 pt by ink). The view switch belongs to the figure (stage, bottom right). |
| M-12 | P1 | Width and height | At 360 the search placeholder is 10 pt short; on an 812 pt screen one row is visible, on 667 none. | Below 376 the title and the search field stack; the stage clamp keeps two rows visible down to 360 × 800. Build that frame. |
| M-13 | P1 | Row destination | Every row tap opens `/library/:id`, which has no Pulse design and no back pattern in the kit. | This round: add the sub-screen header to the system (44 pt back + display title; the tab bar stays, owning tab lit; `chevron-left` joins the allowed glyphs). The detail screen itself is the first screen of the next round. |
| M-14 | P2 | Thumbnails | The barbell is a bar end with one plate (reads as a disc on a rod); the machine is a striped tower; different axes, 3–4.5 pt from the tile edge, different exposure. | New framing rule in section 4; barbell = a whole short bar with two plates, three-quarter view; judged at 64 px, not 128. |
| M-15 | P2 | Read-only figure (detail, player) | Primary and secondary differ by opacity only; UX asked for an outline on secondary. | Keep 100 % / 40 %. Decided: it is a luminance step, not a hue step, the role is repeated on the muscle-name chips, and an outline is paint, not light. |
| M-16 | P2 | No results vs error | The same panel, no retry. | The error variant gets the existing "Újra". |
| M-17 | P2 | Empty chips | "Hátsó vállizom" and "Teljes test" return nothing for a member. | Data call for the owner (fix the mapping or hide); not blocking, listed under assumptions in section 10. |
| M-18 | P2 | Search field text | 15 px, under WebKit's zoom-on-focus threshold. | 16 px in both input heights. |

### 2.3 Profile

| ID | P | Where | Problem | Decision |
|---|---|---|---|---|
| P-01 | P1 | Monogram fill | The "light" inside the letters reads as marble or a smudged print (2.1× luminance swing, a grey diagonal band through the T). Still in V1. | Solid text-1 letters and the lime dot — the spec's own fallback (3.9). `monogram-light` is deleted. Size `min(144px, 38vw)`. Decided: 144, not the ≤ 112 UX asked for, because the monogram is the screen's signature and 144 already lets the fold cut a control. |
| P-02 | P1 | Order of the page | The first viewport spends 218 pt on identity and shows one setting that is changed once in a lifetime; "Felszerelés", the target of the only notification that links here, is about 1 570 pt down. | Order: identity ("TD." · name · e-mail · role) → the "me" rows (Érmék 190 · Eredmények 4/7 · Testsúly 83,1 kg) → "BEÁLLÍTÁSOK": Felszerelés → Hangok és rezgés → Megjelenés → Nyelv → "Fiók": Megjelenített név · Admin felület megnyitása (admins) · Kijelentkezés. `/settings#equipment` scrolls to its section. Decided: the Testsúly row stays (UX wanted it dropped) because it is the one personal datum on the page and V1 shows it works as a row; it is hidden when there is no entry. |
| P-03 | P1 | Lime on Profile | With the arc and the glowing button gone, the only lime left is the dot and the tab. | "4/7" gets a seven-segment bar in the week-bar grammar (4 lit, 3 off): identical count markers, no per-achievement artwork. The largest lime on Profile is content again. |
| P-04 | P1 | "Megjelenés" → theme packs | Seven name-only chips; six show no colour; the two paid packs look free and fail at save with the generic error; the persona's saved pack is Aurora, so this member would not see lime at all. | The picker is seven lamps (a swatch in its own accent + its name), with owned / price state on Aurora and Ember. Needs new client state and one new string — flagged. Shape depends on owner decision 3. Prove it with one Home frame in a second lamp. |
| P-05 | P1 | Saving | Four save behaviours in one scroll; name and theme failures are silent or generic. | One rule: a change applies at once and the trailing slot of its section header reports it ("Mentés folyamatban" → "Felszerelés mentve" / error). Where an explicit commit must stay (the name; the theme while preview-then-save stays), one save bar docks above the tab bar while dirty — the only place the primary style appears on Profile. |
| P-06 | P1 | Destinations | Both "me" rows open `/coins` on the "Bolt" tab, also the one labelled "EREDMÉNYEK". | Érmék → `/coins` (Bolt); Eredmények → `/coins` on "Eredmények" (tab in the route; a small frontend change). `/coins` itself is next round. |
| P-07 | P1 | Below the fold | About two viewports exist only as a list. | Draw the full scroll as one tall frame plus the state frames of section 8. Settings rows hug their content (the "Rezgés" hint is 89 characters). |
| P-08 | P1 | Width | The old bento left no padding at 360. | Verify the row layout at 360: label · caption · numeral · chevron on one baseline; below 376 the caption drops under the label. |
| P-09 | P2 | Coin | A blank stack of three grey discs reads as a database pictogram; 3 % highlights. | One coin, three-quarter view, embossed ring, bright rim (≥ 15 % highlights), 24 pt ink. If it still does not read at 24 pt, drop it: "ÉRMÉK" and "190" already say it. |
| P-10 | P2 | "Áttetsző felületek" | Governs nothing visible in Pulse; its hint ("a kártyákon és a sávokon") is no longer true. | Follow the system setting silently; the control is hidden under Pulse (assumption, section 10). |
| P-11 | P2 | Fold | Nothing is cut, so the page looks finished after one input. | With the 144 pt monogram and the new order the first "Felszerelés" chip row is cut by the fade. |
| P-12 | P2 | Other states | New member (0 coins, 0/7, no weight, no display name); wallet request failed ("—", never 0); session dot absent. | Draw one first-run Profile and the wallet variants (should). With no measurement the Testsúly row becomes the existing link "Mérés rögzítése". |
| P-13 | P2 | i18n | "4/7" + "feloldva" splits one interpolated string and works in Hungarian only; a display name may be 120 characters. | The numeral stays; the full localized string is the accessible name; the visible caption needs its own key in en / de (flagged). Name: one line, ellipsis. |
| P-14 | P2 | Title | No h1; "BEÁLLÍTÁSOK" appeared mid-page at title size. | The monogram is the hero, "BEÁLLÍTÁSOK" is the page's one `display` 32 line and its h1, heading the settings group. Role is a micro tag (as in V1). |

### 2.4 All screens

| ID | P | Where | Problem | Decision |
|---|---|---|---|---|
| X-01 | P1 | Type | 22 roles, 13 sizes, 3 families; six consecutive 1 pt steps; mono on words. | Nine steps, two families — section 3.2. |
| X-02 | P1 | Images | Five render languages; acceptance was "look at it" at twice the real size. | One render family and numeric acceptance — section 4. |
| X-03 | P1 | Motion | "Flowy" was in the brief and the direction is called Pulse; the spec has one optional sentence. | Six named motions on the app's existing duration tokens — section 3.6. |
| X-04 | P1 | States and overlays | Every component exists in one state; no sheet, dialog, toast, scrim, input error, skeleton or offline strip. | A component state board before more screens — section 3.7. |
| X-05 | P1 | Semantic colour | Success was folded into the accent; no info. The app uses all four in 30+ files. | Keep the app's four families; accent is never success — section 3.1. |
| X-06 | P1 | Width | One canvas width. | 360–430, fluid rules as tokens — section 3.4. |
| X-07 | P1 | Roles | Only the 5-tab bar is drawn; coach and admin need two more icons and a rule. | Section 9. |
| X-08 | P1 | Non-text contrast | Input and search boundaries 1.64 : 1, the "Elöl / Hátul" active state 1.32 : 1. | Floors for field edges and for neutral selection only — section 3.1. |
| X-09 | P2 | Header | Three screens, three header grammars. | One rule: a tab root opens with one `display` 32 line, cap top at y 80, one optional trailing control on its centre line. Profile's monogram is the documented exception. |
| X-10 | P2 | Spec / build drift, off-grid values | Opacity 0.65 vs 55 %, raw hexes in screen scripts, gaps of 2, 3, 5, 6, 10, −4. | One token object; the prelude is generated from it and the spec quotes it; spacing on the scale of section 3.4. |
| X-11 | P2 | Asset delivery | 2.1 MB of design-resolution PNGs. | WebP at 3x and 2x of the slot, `width` / `height` on every image, tab icons preloaded. |
| X-12 | P2 | Dark only | The roadmap lists light / dark / system; lime on white is 1.17 : 1 and edgeless images vanish on a light surface. | Pulse is dark-only. State it; do not promise a toggle. |
| X-13 | P2 | Admin Style Studio | 27 elements × 5 behaviour variants are live; raster tab icons break variant E11-C and the `LucideIcon` type. | Implementation note: icon becomes an image descriptor; E11-C is redefined for rasters (scale 1 → 1.12) or marked dormant. Not a design task for this round. |

---

## 3. THE SYSTEM

Reconciled between the system review (fit to the app's `tokens.css` and build gates) and the craft review (measured on the shots). Everything here holds in all three container languages; what the owner's choice still decides is marked **[container]** and collected in 3.8.

### 3.0 The grammar: things light up

One rule replaces the list of ingredients. Lime is never paint, always light, and every state in the product is one of five light levels:

| Level | Token | Means | Week segment | Numeral | Muscle region | Tab icon | Achievement segment |
|---|---|---|---|---|---|---|---|
| Lit | `accent` 100 % | achieved · selected · live | trained | — | selected / primary | active (tinted) | unlocked |
| Half-lit | `accent` 40 % (`#586E18` on bg) | in progress · assisting · finger down | session running today | — | secondary / touch-down | — | — |
| Pending | `text-3` | planned, not yet done | scheduled | denominator "/4", "/7" | — | — | — |
| Off | `track` | nothing | rest or free day | — | idle (graphite) | inactive (steel) | locked |
| Ink | `text-1` | supporting data, counts, neutral selection | — | numerator, all other figures | — | active label | — |

Three consequences. (1) Only the primary action glows; a lit datum never does. (2) On every screen the largest lime element is content, never navigation. (3) No state is carried by hue alone — lime and off-white are both about 1.06 : 1 against each other in luminance, so every level above also differs in fill, tone or shape; that is also what lets a white "Mono" lamp work (section 9).

### 3.1 Palette roles

| Role | Value | Use | Contrast on `bg` |
|---|---|---|---|
| `bg` | `#0B0D0A` | canvas; the black every image is graded to | — |
| `surface-1` | `#141712` | containers and controls where the language draws them **[container]**; thumbnail base | 1.08 |
| `surface-2` | `#1E2219` | overlays (sheet, dialog, toast), skeleton blocks, disabled fill | 1.21 |
| `surface-3` | `#2A2F24` | pressed state | 1.45 |
| `ink` | `#F2F5EA` (242 245 234) | base of all text; white point of every image | 17.7 |
| `text-1` | ink 100 % | primary text, numerals, glyphs | 17.7 |
| `text-2` | ink 70 % (`#A9B09D` as drawn) | secondary text, eyebrows, inactive tab labels | 8.7 |
| `text-3` | ink 52 % (`#858C79` as drawn) | hints, placeholders, pending figures and segments. Never on `surface-3` | 5.6 (5.2 on surface-1) |
| `accent` | `#CBFF2E` | the lamp: lit level and the one primary action | 16.6 |
| `accent-pressed` | `#B4E61F` | pressed primary action | — |
| `accent-half` | accent 40 % | half-lit level | 3.4 |
| `accent-soft` | accent 12 % | fill of a selected multi-select chip | — |
| `on-accent` | `#0B0D0A` | text and glyphs on lime | 16.6 on accent |
| `line` | white 12 % (`#282A27`) | row dividers; container edge **[container]** | 1.35 |
| `track` = `line-strong` | white 22 % (`#414240`) | section rules, meter tracks, blank day, locked segment, control edge **[container]** | 1.93 |
| `field-edge` | ink 36 % (`#5E615B`) | the boundary of anything you type into (underline or outline); focus = `accent` 1.5 pt | 3.1 |
| `selected-neutral` | ink | selection that is not the screen's subject (view switch, language, translucency): V1 = text-1 label + 2 pt ink underline; filled languages = ink 36 % thumb (`#646760` on surface-1, 3.1 : 1 against the track, text-1 on it 5.2 : 1) **[container]** | — |
| `success` | `#34D399` | saved · done · PR · rest phase of an interval | 10.2 |
| `warning` | `#FBBF24` | over-target macro, offline strip | 11.7 |
| `danger` | `#F87171` | failed save, refused purchase, input error | 7.1 |
| `info` | `#60A5FA` | neutral notices | 7.7 |
| `scrim` | black 50 % (sheet) / 65 % (dialog) | under overlays | — |

Decisions.

- Text: the three drawn hexes stay in Figma; in code they are ink alphas (1 / 0.70 / 0.52 resolve to `#ADAFA7` and `#83867E` on bg, 8.8 and 5.3 : 1) so a pack's ink cast carries through. Decided for alphas (system) over fixed hexes (craft) because the difference is under 2 % luminance and packs need it.
- Lines: two line tokens plus one field edge. Craft wanted every control edge at 2.1–3.3 : 1, system wanted exactly two tokens, the skeptic warned that brighter edges cost cleanliness. Decided: only what you type into and neutral selection get a 3 : 1 floor (the WCAG non-text cases that actually carry meaning); dividers and tracks stay quiet. `hairline` 8 % and `track` 10 % are retired — the app itself measured a 7 % line "as an absence".
- Semantic colours: the app's four families with their on- / subtle / border forms, not the two the spec improvised (`#F2B84B`, `#FF6B5C`). Accent is never success: accent = live / selected / primary, success = saved / done / PR / rest. Semantic colours never follow a pack. Check lime next to `#34D399` once on a phone (83° of hue apart).
- The scheduled segment uses `text-3`, not a fourth grey (`#8A8D85`).

### 3.2 Type — nine steps, two families

Big Shoulders Display (Black, Bold) and Geist (Regular, Medium, SemiBold). **Geist Mono leaves the system.** Decided with taste, craft and system against the spec: a monospace gives the Hungarian decimal comma a full cell ("83 , 1"), sets words in a dev-tool voice, and V1's Profile already proved the display numerals do the job. Figures inside sentences are Geist with `font-variant-numeric: tabular-nums`.

| Step | Family · weight | Size / LH | Tracking | Use |
|---|---|---|---|---|
| `poster` | Big Shoulders · Black | 124 / 108 — `min(124px, 31vw)` | −1 % | the one hero numeral of a screen (Home "2/4"); digits and "/" only |
| `stat` | Big Shoulders · Black | 64 / 64 | 0 | second-level numerals: 190, 4/7, 83,1; later the player's kg × reps |
| `subject` | Big Shoulders · Bold (Black for digits) | 48 / 48 | +1 % | the screen's subject line: today's session title **[container]** |
| `display` | Big Shoulders · Bold (Black for digits) | 32 / 34 | +1 % | the one h1 per screen; inline data numerals (macro values) |
| `eyebrow` | Big Shoulders · Bold | 16 / 20 | +6 % | section labels |
| `title` | Geist · SemiBold | 22 / 28 | −1 % | member name; sheet and dialog titles |
| `body` | Geist · Regular / Medium / SemiBold | 16 / 22 | 0 | Regular: input text, paragraphs, e-mail · Medium: row titles · SemiBold: button labels |
| `caption` | Geist · Regular / Medium | 13 / 18 | 0 | Regular: meta lines, hints, macro names, "cél 2600" · Medium: chips, segments, links, field labels |
| `micro` | Geist · Medium | 11 / 14 | +1 % (tags: +6 %, upper-case) | tab labels, weekday letters, badge, "TAG", "EN" |

Rules.

- Words in the display face are always upper-case (`text-transform` under `lang="hu"`, source strings untouched); Geist is always sentence case.
- The monogram is component-local: Big Shoulders Black `min(144px, 38vw)`, −1 %. It is not a ramp step.
- No size between the steps. If a language needs today's title inside a module, it uses 32, not a new 36 — `display-l` 36 is retired, so a container title can never out-rank an h1.
- Selection changes colour, never weight: a weight flip changes the width ("Kezdőlap" 47 → 48 pt) and shifts every chip after it in a scroller.
- Input text is 16 px in every field height (WebKit zooms the page under 16). Body copy is never below 13; 11 is the floor.
- The slash of "2/4" is its own element with a frozen scale constant and equal ink clearance on both sides (0.16 em), so it holds for 1/4, 3/5 and 7/7.
- To verify on the first build: Big Shoulders has tabular digits (`tnum`); if not, ticking numerals sit in fixed-width digit boxes.

Old role → new step: `giant` → poster · `num`, `numM` → stat · `displayXL` → subject · `displayL`, `displayM` → display · `title` → title · `headline`, `rowTitle`, `input`, `body` → body · `label`, `labelOn`, `sub`, `subStrong`, `dataM` → caption · `tab`, `tabOn`, `badge`, `micro`, `dataS` → micro · `dataL` → display (digits) + caption (unit).

### 3.3 Radii

| Token | Value | Status |
|---|---|---|
| `r-bar` | 2 | fixed — meters, week segments, achievement segments |
| `r-full` | height / 2 | fixed — the primary action (56 high), badge, switch |
| `r-container` | legacy 28 · V1 none · V2 and V3 as built | **[container]** |
| `r-control` (chip, input, segmented) | legacy pill · V1 nothing drawn · V2 and V3 as built | **[container]** |
| `r-thumb` | legacy 16 | **[container]** |

The primary action stays a full pill with the glow in every language: it is the lamp, and it is what the owner chose. No other radius is fixed until he has picked a language; after that the losing values are deleted, not kept as options.

### 3.4 Spacing and layout

- Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48. Nothing else (the build used 2, 3, 5, 6, 10, 28 and −4).
- Named distances: `tight` 8 (label → value) · `group` 16 (eyebrow ink bottom → its content, measured by ink, the same everywhere) · `block` 24 · `section` 32 (48 where a language separates sections by space alone **[container]**) · number → unit 4.
- Edges: gutter 24 (16 below 376 px), so one left edge and one right edge; trailing glyphs end on the right edge by ink. Padding inside a container 20 **[container]**.
- Controls: two heights, 44 and 56. Every target ≥ 44 × 44.
- Widths: 360–430 supported, drawn at 402; a 360 × 800 frame of each screen is part of the round.
- Fluid tokens: poster `min(124px, 31vw)` · monogram `min(144px, 38vw)` · figure stage `clamp(240px, 40svh, 340px)` · hero image width in vw with ≥ 12 pt of black kept beside the numerals · title and search stack below 376.
- Fold rule (kept from the spec): the bottom fade may cut a row or a control, never a label standing alone; a scrolling list always shows a cut row.
- Header rule: a tab root opens with one `display` line, cap top at y 80, one optional trailing control on its centre line; a sub-screen opens with a 44 pt back control and the same line.

### 3.5 Glow, elevation, images

| Token | Value | Rule |
|---|---|---|
| `glow-primary` | `0 0 20px` accent 38 % + `0 4px 10px -2px` accent 30 %, derived from `--accent` with `color-mix` | only on the one primary action of a screen, idle state. Pressed: no glow, `accent-pressed`. Never on a chevron, a card or a datum. |
| `bloom-lit` | a pre-blurred copy (10 px) of a lit region at 60 % opacity | the mannequin's lit regions only. Opacity and scale may animate; the blur never does. |
| Elevation | none | no drop shadow anywhere. An overlay is `surface-2` + a `line-strong` edge over `scrim`. A toast is a `surface-2` capsule with a semantic dot, placed at the top. |
| Edgeless image | Figma: `LIGHTEN` over `bg`. Production: WebP with RGB = ink and alpha = luminance, normal compositing | Decided for luminance-as-alpha (system) because a blend mode breaks under the transforms and opacity that screen transitions need, and it ties every image to one surface colour. |
| Bottom fade | `bg` 0 → 100 % over the first 28 % of 130 pt, above the tab bar | fixed, `pointer-events: none` |
| Skeleton | `surface-2` blocks with the app's sheen at `--duration-ambient` | never a spinner |

### 3.6 Motion — lights switching on

The grid is straight and there is no organic shape, so "flowy" comes from motion and light falloff. Built only from the app's existing tokens, so the build gate accepts them: `instant` 100 ms · `fast` 150 · `base` 250 · `slow` 400 · `ambient` 1200 · `ease-standard` = `cubic-bezier(0.16, 1, 0.3, 1)`.

| # | Motion | Where | Spec |
|---|---|---|---|
| 1 | Ignite | selecting a muscle, a chip, a tab; a segment becoming achieved | finger down: half-lit within `instant`. Release: fill 0 → 100 % in `fast`; the bloom copy scales 0.9 → 1.15 → 1 and its opacity goes 0 → 0.9 → 0.6 over `slow`; one pulse, no loop. The previous selection fades in `fast`. One light haptic where the platform has it. |
| 2 | Count-up | hero numeral, week bar, macro bars | only when the value changed since last seen: the digit rolls (translateY) in `slow`; segments fill left to right, `fast` each, 60 ms stagger; bars grow in `base`, 50 ms stagger. |
| 3 | Resting pulse | the idle primary action, or the live dot | the glow's opacity breathes 100 → 65 → 100 % on `ambient` alternate (a 2.4 s cycle), starting after 1.5 s idle, stopping on press. While a session runs the 6 pt live dot takes the pulse and the button rests. |
| 4 | Tab change | tab bar | outgoing tint off in `instant`, incoming on in `fast`. Nothing slides — there is no pill. |
| 5 | Turn | "Elöl" / "Hátul" | crossfade with an 8 pt horizontal slide in `base`, then the lit region re-ignites. Decided against the rotateY flip (taste): a flat image flipping reads as a card, not a body; a real turn needs the 3D model of section 5, stage B. |
| 6 | Lights-on | route change | the hero image fades up from black in `slow`; content rises 8 px with a `base` fade, at most four staggered items. |
| 7 | Collapse | selector stage ↔ sticky bar | scroll-linked scale and translate of the figure into the 48 pt mini figure; no layout animation. |

Rules: transform and opacity only · at most one looping animation per screen · under `prefers-reduced-motion` the state change stays and travel, loops and the mount sweep go · no unlock celebration and no achievement toast (do-not-invent).

### 3.7 Component inventory

One Figma page (the state board) before any further screen. "App" names the existing primitive so nothing is rebuilt.

| Component | Variants | States | App primitive | [container] |
|---|---|---|---|---|
| TabBar | 5 / 6 / 7 equal cells (section 9) | inactive · active · pressed · focus | `nav/BottomNav`, `navTabs` | bar surface or none |
| Button | primary 56 (glow) · secondary 44 · link · icon 44 · danger | idle · pressed · busy (three dots) · disabled · focus; primary also "failed" (inline danger line under it) | `Pressable` + `control` | secondary's edge |
| SaveBar | docked above the tab bar | hidden · dirty · saving · failed | new | surface |
| Chip | filter (single choice) · multi-select · tag | idle · selected (lit) · selected-soft with check · disabled · skeleton | `control` shape chip | shape and idle edge |
| Segmented | 2–3 options | idle · selected (`selected-neutral`) · disabled | E6 `Segmented` | underline or thumb |
| Switch | — | off · on · disabled (hint stays readable) · busy | `Switch.tsx` | no |
| Input | 56 · compact 44 (search) | idle · focus · filled · error (danger edge + caption) · disabled; leading icon, clear | `Field`, E7 | underline or box |
| ScreenHeader | root (display line + trailing slot) · sub (back + title) | — | `ui/data/SectionHeader` | no |
| SectionHeader | eyebrow · eyebrow + link · eyebrow + status ("Mentés folyamatban" / "Felszerelés mentve" / error) | — | `SectionHeader` | rule above or not |
| HeroNumerals | N/M | value · skeleton · retry ("Újra") | `CountUp` | no |
| WeekBar | 7 segments; also the 7-segment achievement bar | lit · half-lit · pending · off · today (taller) | `features/home/WeekStrip`, E16 | no |
| MacroMeter | 4 across | with target · over target (`warning`) · no target (no bar) · absent | E16 `Progress` | no |
| DataRow | label · caption · numeral · chevron (Érmék, Eredmények, Testsúly) | value · loading · failed ("—") · empty (link instead) | `SummaryTile` | row, module or band |
| Sparkline | 140 × 32, neutral | series · gap (dotted) · none | `TrendChart` | no |
| ListRow | text 64 · with still 80 · settings (hug) | idle · pressed · skeleton; "EN" tag; two-line title | new `ui/data/Row` | divider, still frame |
| MuscleFigure | interactive stage · mini 48 · read-only (detail, player) · front / back | idle · touch-down (half-lit) · selected (lit) · secondary (half-lit) · focus ring on region | `muscle-map/MuscleMap` | no |
| Monogram | hero · small 44 | with / without session dot | new | no |
| Badge | count (hidden at 0 · 1–99 · 99+) · tag | — | chip recipe | tag edge |
| GlowImage | hero still · thumbnail | reserved box (width / height) · loaded | new | thumbnail frame |
| EmptyState | with action · without | empty · error (with "Újra") | `EmptyState.tsx` | surface |
| OfflineStrip | one line · two lines | — | app shell | surface |
| Toast · Sheet · Dialog | — | — | `ToastHost`, E14, E15 | edge |
| LampSwatch | theme pack | idle · selected · previewing · owned · priced | new | shape |
| Skeleton | numeral block · row · chip · figure | — | `ScreenSkeleton`, E18 | no |

Utility glyphs (Lucide, stroke 1.75): bell, search, x, check, chevron-right and, new, chevron-left. A line glyph is never the main visual of anything.

### 3.8 What waits for the container choice

Fixed now: the grammar (3.0), palette, type, spacing scale, widths, glow, motion, the primary pill, the tab icons and their two states, the mannequin kit, the image family.
Decided by the owner's pick, then frozen: whether anything is enclosed (`surface-1`, `line`, `r-container`, padding 20) · the shape and edge of chips, inputs and the segmented control · the size of the today title (48 or 32) · thumbnail framing · whether the tab bar has a surface · how sections are separated (rule, space or band).
Method until then: every v2 frame is built from one token object with the language as a single switch, so the chosen language is a re-run, not a redraw.

---

## 4. THE IMAGE SYSTEM

Rule for the whole app: **an image is either the interface (the mannequin, a tab) or answers a question the text beside it would otherwise have to answer** (what kind of day is it, what do I need). No decorative image anywhere. That is the owner's "images that make it easy to use" made checkable.

### 4.1 One render family — "Pulse Studio"

A recipe, not a 3D scene (the scene is big idea 7.12, not done now). Every image obeys all of it.

| Axis | Rule |
|---|---|
| Background | Pure black `#000000`. No floor, no reflection, no haze, no particles. |
| Material | Two only. **Satin graphite** (matte polymer, body about `#50514D` after the grade, 2.4–2.6 : 1 on `bg`): the mannequin and soft goods (bench pad, bands, balls, mat). **Bead-blasted steel** (satin, body about `#9EA198`, highlights up to ink): every metal object, the tab objects, the coin. No skin, no photograph, no film grain, no chalk dust, no mirror chrome, no black rubber on black. |
| Light | One large soft key from top-front-left, neutral and very slightly warm, never blue, so every object has a light side and a dark side; one thin rim from back-right. **Exception — the figure:** frontal, symmetric soft light with a thin rim on both sides, because it is a map and gets mirrored. |
| Colour | Monochrome. **No lime in any image file.** Lime is added in the app (a tint for icons, vector regions for the figure), so a pack recolours it and nothing is ever regenerated for a state. The Figma mock may bake it, but only deterministically from the same pixels, as `icons_v2.py` does. |
| Camera | 85 mm look. Stills of 64 pt and larger: three-quarter view from about 15° above. Icons of 32 pt and smaller: near-frontal, at most 10° of tilt. The whole object is in the frame, long axis 80–85 % of it, short axis ≥ 55 %, centred, nothing within 6 % of an edge. |
| Grade | The existing deterministic grade, extended: luminance mapped black → `bg`, white → ink; black clamp at 8 with a soft toe (22 erased half a hand); the outer 5–10 % feathered to true black; export as luminance-as-alpha WebP at 3x and 2x. |

Acceptance is numbers in the grade script, on contact sheets rendered at true 1x and 3x on the real background — not "name it in one second" at twice the size:

- **Icon:** inactive body ≥ 4.5 : 1 on `bg`; ink 22–24 pt on its long axis in the 32 pt box; box coverage 0.40–0.50 (the old dumbbell had 0.28).
- **Still:** lit box 80–85 % long / ≥ 55 % short; mean lit grey 135 ± 10; at most 12 % of lit pixels above 200; judged at 64 px.
- **Figure:** every body region's median between 2.3 : 1 and the torso + 10 %; no saturated pixel in a neutral base; mirror overlap ≥ 97 %; front and back the same height ± 1 % and shoulder width ± 2 %; ≥ 900 × 1900 px per view from a lossless source.
- **Hero still:** ≥ 4.5 px/pt of its largest use; the 2 px border no brighter than `bg`.
- The eyeball test stays, at the real size: can you name it.

### 4.2 Assets to produce

| Family | Assets | Count | State | Notes |
|---|---|---|---|---|
| Tab icons | home, training, nutrition, progress, profile · **coach** ("Edző": a whistle) · **admin** ("Admin": a shield) | 7 | 5 built (`tab2-*`), 2 to make | One steel file per icon; the active state is the same pixels tinted (in the app: the accent multiplied through the icon's own luminance and alpha). Generate the two new ones with the built sheet as reference. Check at 32 px: the dumbbell's coverage and whether the bowl of spheres reads as food. |
| Mannequin | neutral front base · neutral back base (+ two derived form maps, 22 vector regions, 22 hit zones) | 2 renders | to make — section 5 | Derived with no new render: the 48 pt mini figure, the bust crop (the "Saját testsúly" thumbnail), the crop on Home's library row. |
| Home state stills | training day · rest day · nothing scheduled | 3 | to make, after owner decision 4 | Replace `hero-grip`. The "nothing scheduled" still also serves the `/workout` empty state if that screen survives decision 1. |
| Equipment / type stills | 14 equipment (Rúd, Kézisúlyzó, Kettlebell, Gép, Kábel, Smith-gép, Gumiszalag, EZ-rúd, Húzódzkodó rúd, Pad, Medicinlabda, Fitneszlabda, Hengerelő, TRX) + 4 type fallbacks (Erő: a plate · Nyújtás: a rolled mat · Kardió: a coiled rope · Pliometria: a box) | 18 | 2 exist and are re-shot | Keyed by **equipment**, not by muscle group. Decided: inside a muscle filter a muscle-keyed picture would be the same on all 24 rows, while the kit differs row to row and tells the member what they need. "Saját testsúly" is the bust crop; "Egyéb" has no picture. Gated on `equipment_slug` in the list payload. This round needs six (Rúd, Kézisúlyzó, Gép, Kábel, Pad, the Erő plate) for the "after the backend field" frame only. |
| Coin | one coin | 1 | to re-make | Three-quarter view, raised rim, one embossed plain ring, ≥ 15 % highlights. |
| Achievements | none | 0 | — | Seven identical segments in the week-bar grammar; the inventory forbids per-achievement artwork. |
| Empty states | no new art | 0 | — | Home empty = the "nothing scheduled" still. Library "Nincs találat" = text under the figure that is already on screen. |
| Removed | `monogram-light`, the baked-lime figure, `equip-barbell`, `equip-machine`, and `hero-grip` unless decision 4 keeps it | — | — | |

Whole-app budget: 7 + 2 + 3 + 18 + 1 = **31 images** plus 22 vector regions. This round needs 19 of them; 5 are built.

### 4.3 Prompt recipes

Shared tail for everything opaque: *"Pure black background, hex 000000, seamless, no floor, no ground shadow, no reflection, no gradient, no vignette, no haze, no particles. Strictly monochrome: graphite and satin steel only, no colour anywhere, no green, no lime, no glow. Neutral white light, very slightly warm, no blue. No film grain. No text, no labels, no logos, no watermark."*

**Tab icons — the two new ones** (transparent, `--ref` the built tab sheet):
> Two app icons in ONE horizontal row with a wide empty gap between them, isolated on a fully transparent background, the same series, material, light and camera as the reference sheet: (1) a referee whistle seen from the side with its ring, (2) a plain heater shield. Each is a chunky, simplified 3D object machined from one block of bead-blasted satin steel, light grey, softly bevelled, bold simple volumes, no small details. Soft neutral key light from the upper left, a thin rim light along the top and right edges. Same size as the reference icons, straight-on front view with a slight downward tilt. Strictly monochrome, no colour, no glow. No text, no labels, no ground shadows, no background, no logos, no watermark.

Then `icons_v2.py` makes both states from the one file.

**Mannequin — one turnaround sheet** (3:2 at the highest resolution; front and back in ONE generation so they are the same body):
> A character turnaround sheet for a premium fitness app muscle selector: the SAME minimalist 3D mannequin shown twice side by side — left: exact front view, right: exact back view — same height, same proportions, same pose, each perfectly symmetrical, standing straight in a relaxed A-pose, arms slightly away from the body, feet slightly apart. A smooth satin dark-graphite body, charcoal grey, mid-dark rather than black so every part reads against the black, the same tone from head to feet. A calm, athletic, neutral build, not a bodybuilder. The surface is smooth; the ONLY lines on it are thin, shallow grooves that outline these muscle panels and nothing else. FRONT: neck; front of the shoulder and side of the shoulder as two separate panels; chest; biceps; forearm; one abdominal panel with a faint centre line; oblique; inner thigh; outer hip; front thigh; shin. BACK: neck; trapezius; rear of the shoulder; triceps; forearm; latissimus; lower back; glutes; hamstring; calf. No kneecap plates, no pelvis plate, no collar, no wrist or ankle cuffs, no extra seams on the arms or legs. Featureless smooth head, simple mitten-like hands, smooth boot-like feet with no toes. No face, no hair, no veins, no muscle fibres. Nothing is coloured and nothing glows. Soft even frontal light plus a thin neutral rim light along both sides of each silhouette. Both figures are fully inside the frame from the top of the head to the soles, with clear black margin on every side and between them. Extremely clean and minimal. + shared tail.

**Home state stills** (1:1; generate the first, then the other two with `--ref` to it):
> Studio render on pure black. {SUBJECT}. Bead-blasted satin steel for all metal, satin graphite for soft parts, completely blank surfaces, no chrome mirror, no black rubber. Three-quarter view from about 15 degrees above. The whole subject is inside the frame with black on all four sides; nothing bright touches a frame edge. One large soft key light from the top front left, one thin rim light from back right. Deep focus, everything sharp. + shared tail.

Subjects: training day — *a barbell with one plain plate on each end resting in the two hooks of a rack, ready to lift* · nothing scheduled — *the same two rack hooks, empty* · rest day — *a folded towel on the end of a flat bench pad*. Training and "nothing" share the scene on purpose: the bar is waiting, or nothing is racked.

**Equipment stills** (1:1; the first is the reference for the rest):
> Studio render on pure black. {THE WHOLE OBJECT}, three-quarter view from about 15 degrees above, bead-blasted satin steel (soft goods in satin graphite), no chrome mirror, no black rubber, completely blank: no numbers, no lettering, no brand marks. The whole object is inside the frame, fills about 82 percent of its long axis and is centred. One large soft key light from the top front left so the form reads in mid-grey with a light side and a dark side, one thin rim light from back right. Deep focus. + shared tail.

Subjects are the table in `specs/pulse.md` section 8, with one change: "Rúd" is *a whole short barbell with one plate on each end*, not a bar end.

**Coin** (transparent):
> A single app icon isolated on a fully transparent background: one thick coin standing slightly turned, three-quarter view, bead-blasted satin steel, a raised rim and one plain embossed ring on its face, no symbol, no number, no lettering, a bright highlight running along the rim. Soft neutral key light from the upper left, a thin rim light along the top and right edges. Strictly monochrome, no gold, no colour, no glow. The coin fills about 80 percent of the frame. No text, no ground shadow, no background, no logos, no watermark.

---

## 5. THE MANNEQUIN

**The finding (two reviews, both confirmed by the skeptic, P0).** The approved figure cannot express the product's roster. The front view must offer 12 separately selectable muscles and the back view 10. The render has one cap per shoulder where "Elülső vállizom" and "Oldalsó vállizom" need two regions, no neck, adductor or abductor panel, closed panels that are no muscle (kneecaps, pelvis plate, collar), it does not mirror, the lime is baked in and flat, and there is no back. The spec's "tracing 22 panels is an afternoon" rests on grooves that are not in the image.

### 5.1 Production strategy — decided

**Two neutral base images + vector regions + one form map per side. Lime is never in a file.**

| Part | What it is | How many |
|---|---|---|
| Base | neutral graphite figure, luminance-as-alpha, front and back from ONE generated turnaround sheet, each split out, height-normalised and mirrored about its own axis (left half copied onto the right) | 2 |
| Form map | the same pixels through a high-key curve (body lifted to about 80 %, grooves and the dark side stay darker). A script output, not a render | 2 |
| Regions | inline SVG paths in the base's pixel space, one per muscle per view, compound for paired and segmented muscles; drawn on the left half and mirrored by script | 22 (12 front + 10 back; 19 muscles, three of them on both sides) |
| Hit zones | a separate, invisible layer | 22 |

- **A lit region** is the region path filled with `var(--accent)` and masked by the form map's luminance, drawn over the base, plus a pre-blurred copy at 60 % for the bloom. The mask is what keeps the panel a volume: centre about 100 % lime, edges about 70 %, the groove still visible. Levels: 100 % = selected or primary, 40 % = secondary or finger down. In Figma the same thing is a lime vector with the form image multiplied over it, clipped to the region — so the mock and the app are the same recipe.
- **Tap regions are not the highlights.** At stage size the narrow muscles (neck, oblique, side of the shoulder, inner thigh, outer hip, forearm) are 8–16 pt wide. So 12 zones in front and 10 behind tile the whole stage: every point belongs to its nearest muscle, limb zones run out through the black to the screen edges, narrow torso muscles borrow from big neighbours until they are ≥ 30 pt on the short axis. Finger down shows the half-lit preview, release selects, sliding off cancels, tapping the lit muscle clears. Zones are buttons with `aria-pressed` and the name `muscle.<slug>`. The chip row stays the full-size path — the product's own rule.
- **It drops into the existing component.** `MuscleMap.tsx` already takes highlights, `onSelect` and `selected` and fills from `var(--accent)`; the silhouette becomes the base image and `shapes.ts` gets the new paths.
- **Rejected:** one baked render per muscle (22 images per accent, and it cannot show primary + secondary together) · 22 raster emission masks (needs a 3D scene, no focus ring, 22 more requests).

Where the reviewers disagreed: four lenses said "build a real 3D model now", the system lens said "two bases and SVG paths". **Decided: paths over one mirrored generated pair now; a 3D model only if stage A fails or a real turn is wanted** — because once the highlights are vectors the base image's exact topology stops being critical, the product never overlays front and back (it shows them in sequence or side by side), and the round should not wait a week for a mesh. The skeptic's objection to the spec's Path A (a screen blend flattens the lit panel) is what the form map solves.

### 5.2 How it stays "very clean"

1. Fewer lines than today: grooves only on roster boundaries, smooth everywhere else. No kneecaps, no pelvis plate, no collar, no cuffs; the abs are one panel with a faint centre line; hands are mittens, feet are smooth boots.
2. Every visible panel is a real button and every button is a visible panel. Nothing on the body lies.
3. One tone from head to feet (legs as bright as the torso, feet no brighter), no glints.
4. Idle is one graphite statue and no lime at all. The black beside it is working space for the hit zones, never a place for labels.
5. On the selector one muscle is lit at a time.
6. A calmer athletic-neutral build: the product has one figure for everybody (gender and body-type variants are cut).

### 5.3 What the next figure renders must show

| # | Render | It must prove |
|---|---|---|
| R1 | Neutral front | The 12 regions exist as panels: Nyak · Elülső vállizom · Oldalsó vállizom (two panels per shoulder) · Mell · Bicepsz · Alkar · Hasizom · Ferde hasizom · Közelítő izmok · Távolító izmok · Négyfejű combizom · Vádli (the shin). Nothing else is outlined. |
| R2 | Neutral back, from the same sheet | The 10 regions: Nyak · Csuklyásizom · Hátsó vállizom · Tricepsz · Alkar · Széles hátizom · Alsó hát · Farizom · Combhajlító · Vádli. Same height and shoulder width as R1. |
| R3 | Front, "Mell" lit through region + form map, beside the approved mock | The non-baked light is at least as good as the baked one and the pec reads as convex. |
| R4 | Back, "Széles hátizom" lit the same way | The inventory's back-view frame can be drawn. |
| R5 | Read-only pair at 200 pt each: "Közepes fogású fekvenyomás rúddal" — Mell lit, Oldalsó vállizom and Tricepsz half-lit | Primary and secondary read apart with no legend; front and back side by side removes the "További célizmok a hátul nézetben." problem for the next round. |
| R6 | The mini figure at 48 pt with one muscle lit | The collapsed bar of M-06 is legible. |
| R7 | The hit-zone overlay on R1 and R2 | The zones can be reviewed. |

About the back render already in progress (`assets/pulse/figure-back-pull.png`): it proves the generator can make a back in the same family as the front — same graphite, same rim light. It is a look reference only. Its lime is baked and flat; it lights three muscles at once, which the selector never does (on a member's map more than one muscle is lit only for one exercise's primary and secondary; "a workout's muscles" is not a product state, see 7.9); the legs and forearms carry stripes that are no roster muscle; glutes and lower back are not closed panels; the ankles have cuffs. The second candidate in `check-figure-back.jpg` is off-family (no rim light, darker, a different build) and is rejected.

### 5.4 Cost

- **Stage A — this round, about 1.5 working days.** 6–12 generations of one prompt with vetting (half a day) · the script: split, normalise, mirror, grade, form map, assertions (2–3 h) · tracing 22 half-regions (3–4 h) · hit zones and their annotation (1–2 h) · the proof composites R3–R6 (1–2 h). The result is shippable: roughly 50–100 KB for the two bases and a few KB of paths.
- **Stage B — optional, later, 3–5 days.** One real 3D mannequin in Blender (base mesh, roster grooves, material, the fixed rig, a render script, an ID pass auto-vectorised into the same path format). It buys an exact front / back identity, a real 8–12 frame turn, new poses and every crop for free. Trigger: stage A misses the tolerances of 4.1, or the owner wants the turn. Nothing built in stage A is thrown away — the paths, the zones and the component stay.

---

## 6. NAVIGATION AND PRODUCT TRUTHS

### 6.1 Where the muscle selector really lives

- Route `/library` (detail: `/library/:id`). It has no tab of its own. `navTabs.ts` gives "Edzés" the route `/workout` and lets it own `/library`, so **"Edzés" is the lit tab on the selector — the built frame is right about that.**
- But tapping "Edzés" opens the workout player. With no session running that is "Most nincs futó edzés" · "Indíts egyet a mai napból, vagy csinálj szabad edzést." and no action (in code: deliberately none).
- The only phone door to `/library` is the button inside Home's empty state (`HomePage.tsx:225`). The persona has a plan occurrence on all seven days, so **the screen the owner likes most cannot be reached at all**, and the second tab is a dead end whenever no session runs.
- Fix proposed: "Edzés" shows the selector when no session runs and the player when one does; Home keeps a permanent quiet row "Gyakorlatok böngészése". The first is a behaviour change → owner decision 1. The row is drawn either way (H-04). The `check-nav` build gate asserts today's doors and has to be updated with it.

### 6.2 The Home states that are real

| State | On screen | Reachable today? | Drawn? |
|---|---|---|---|
| Training day, not started | numerals + week bar · "Mai edzés" · session · "Indítás" | Yes — until the first tap, then never again | Yes (the reviewed frame) |
| **Session running** | "Edzés folyamatban" · title or "Szabad edzés" · "Folytatás"; replaces the day list; numerals only if today also has a plan occurrence | **Yes — permanently after the first "Indítás"; the demo account opens here with "Szabad edzés"** | No |
| Rest day | numerals + week bar · "Pihenőnap" · plan name · no action, no count | Yes (3 of the persona's 7 days) — but only while no session is open | No |
| Done | the session with "Kész" instead of the button | Code path exists; not reachable through the UI (only logs ended by API or seed) | No |
| Nothing scheduled / no plan | no numerals, no week bar · "Ma nincs betervezve edzés" · "Ha van aktív terved, a mai napja itt jelenik meg." · "Gyakorlatok böngészése"; also what a failed today query shows | Yes — every new member starts here | No |
| Loading · week-query error ("Újra") · offline strip · two sessions today | — | Yes | No |

**What a returning user actually sees today: the running-session Home.** Nothing in the frontend calls `/workouts/:id/finish` or `/abandon` (both endpoints exist), a new start resumes the open log, and the week count rises the moment a session is started. So: review Home on the running frame; and decide whether the session loop gets closed (owner decision 2), because only then do "not started" before training, "Kész" after it and "Pihenőnap" on rest days become the everyday states they were designed as.

### 6.3 What the built screens say that the product does not

| Screen | On the frame | The product |
|---|---|---|
| Home | "Indítás" as the everyday state | See 6.2. |
| Home | "2/4" as days trained | The count rises on start, not on finish: pressing "Indítás" makes it 3/4 and Friday solid lime. |
| Home | A photo beside the session | The payload carries no muscle and no category; a picture can show the kind of day, never the session. |
| Home | "Megnyitás" as the nutrition block's door | Correct, but it is the block's only 78 × 44 pt target. |
| Muscle selector | Chest lit, list filtered | The screen opens with nothing lit, every time; the selection is lost when a detail is opened. |
| Muscle selector | Two rows with equipment pictures | `GET /exercises` rows carry no equipment; the row that ships today is text-only. None of the 1 652 exercises has media. |
| Muscle selector | "24 gyakorlat" | Rows loaded so far (24, 48, 72 …), not a total; the API returns none. |
| Muscle selector | One smooth shoulder above the chips "Elülső vállizom" and "Oldalsó vállizom" | Two separate front regions. |
| Muscle selector | "Hátsó vállizom" as the chip peeking in | A back muscle, and empty for a member. Eight of the 20 chips light nothing on "Elöl". |
| Muscle selector | "Edzés" lit | True, and unreachable — 6.1. |
| Profile | A profile with balance, 4/7 and body weight | The live screen is "Beállítások" (the tab says "Profil"): identity, sign-out, name, a coins link without a number, settings. The three figures are real data placed here for the first time (three extra requests); the owner has not confirmed that yet — it is assumed (section 10). |
| Profile | Wallet and achievements as two doors | Both open `/coins` on "Bolt". The store has two items; the persona owns one and cannot afford the other (190 < 250). |
| Profile | Lime everywhere | The persona's saved pack is Aurora (teal): this member would see no lime. |
| Profile | — | "Áttetsző felületek" would switch nothing visible; its hint names cards and bars. |
| Tab bar | Five tabs | Coach has six, admin seven; "Edző" and "Admin" have no icon yet. |

Do-not-invent, re-checked: nothing on the three frames breaks the lists. Three proposals from the reviews would have, and are not taken: per-achievement medals, "trained this week" or today's muscles on the member's body map, and a total exercise count.

---

## 7. THE BIG IDEAS

Ranked by impact over effort. Effort: S = hours to a day · M = days · L = a week or more.

| # | Idea | Why | Effort | Recommendation |
|---|---|---|---|---|
| 7.1 | **One grammar: things light up** (3.0) | Turns the signature from four ingredients that are complete only on Home into one rule that makes every screen Pulse without adding an element. | S | **Do.** |
| 7.2 | **The mannequin kit**, stage A (5) | The only P0 that blocks drawing; also fixes the back view, the sticker light and every pack. | M | **Do — first.** |
| 7.3 | **"Edzés" becomes the training hub** + a permanent library row on Home | One routing decision fixes a dead-end tab and a hero screen with no door. | S | **Ask the owner (decision 1) — recommended.** The Home row is done regardless. |
| 7.4 | **A selector that gets out of the way**: two detents with a sticky mini figure, chips scoped to the visible side, selection kept in the URL | A fixed 384 pt stage leaves two rows of 1 652 exercises and nothing with the keyboard up. This is where "flowy" is felt. | M | **Do.** Behaviour changes are listed as assumptions in section 10. |
| 7.5 | **Collapse the tokens, add measured floors, turn asset acceptance into numbers** (3, 4.1) | 22 type roles and "look at it" checks are how the icons shipped at 2.6 : 1. | S | **Do.** |
| 7.6 | **Motion: seven moments, all lights switching on** (3.6) | The brief said "flowy", the direction is called Pulse, and nothing pulses. | S to specify, M to build | **Do the motion sheet this round**; build with the screens. |
| 7.7 | **Close the session loop**: a finish action in the player | Without it Home is "Folytatás" for ever, "Kész" is unreachable and 2/4 counts sessions that were only opened. | M (outside the three screens; new copy in three languages) | **Ask the owner (decision 2) — recommended.** |
| 7.8 | **Sell lamps, not themes** (9) | In a black room with one light, the colour of that light is visible on every screen — a clearer thing to buy for 250 coins than a re-tint; and it lets all seven packs survive. | M | **Ask the owner (decision 3) — recommended.** |
| 7.9 | **The Home image carries the day's state** (three on-family stills) | Replaces the weakest, most off-family image with one that says "training / rest / nothing" at a glance. | M (three stills) | **Ask the owner (decision 4) — recommended.** The stronger variant — the mannequin with today's muscles lit — is **not done now**: it needs a new field on `/my-plans/today` and the inventory keeps a plan-day muscle map off the member's side. |
| 7.10 | **Luminance-as-alpha images** instead of the LIGHTEN blend | Edgeless images that survive transitions and any pack's surface. | S | **Do, at implementation.** |
| 7.11 | **`equipment_slug` on the exercise list** | One correlated subquery unlocks picture rows that tell the member what they need. | S (backend) | **Ask later, not blocking.** Both row variants are drawn; text-only is the first-class one. |
| 7.12 | **Pulse Studio: one 3D scene for every image** | Perfect consistency, masks and on-states for free. | L | **Do not, now.** The recipe plus the numeric grade (4.1) gets most of it; revisit together with the mannequin's stage B. |
| 7.13 | **Equipment as picture tiles** (Felszerelés, onboarding, rows) | Recognising a kettlebell is faster than reading it. | M–L (14 stills that must read at tile size; about 170 pt more scroll) | **Do not, this round.** Could, once the stills have passed at 64 px. |
| 7.14 | **The workout player as the Pulse flagship**, then exercise detail and `/coins` | Home's only button leads to an undesigned screen where the numerals and the one light have real work to do. | L | **Next round, first.** Out of the scope the owner chose. |
| 7.15 | **Labels around the body** instead of a chip scroller | The picture teaches where "Csuklyásizom" is. | M | **Do not.** Less bare, against "nagyon letisztult"; "Négyfejű combizom" is about 114 pt against a 106 pt margin; German is longer. Side-scoped chips solve the reach. |
| 7.16 | Outlined pending numerals · tab icons with one lit part · a rotateY body flip | — | — | **Do not** — decided in H-10, section 2.0 (the owner's tab direction is already built) and 3.6. |

---

## 8. FRAME LIST FOR V2

Every frame is built in the container language the owner picks; until then, in V1, from the one token object (3.8). Canvas 402 × 874 unless a size is given. Role is member unless stated; Home and the selector are identical for coach and admin except for the bar.

**Gates.** Nothing in phase 2 before R1–R4 of the mannequin kit are accepted · P5 and H15 after decision 3 · the still in H2–H5 after decision 4 · H1 / H4 wording after decision 2 · decision 1 changes no frame, only which door is annotated.

### Phase 0 — the system (Figma pages)

| ID | Page | Priority |
|---|---|---|
| S1 | Mannequin kit: R1–R7 (bases, regions, form-map light, hit-zone overlays, mini figure) | must |
| S2 | Tokens: palette roles, the grammar table, type ramp, spacing, radii per language, glow | must |
| S3 | Component state board (3.7), incl. the macro meter states (with target · over target 305 g / cél 290 g · no target · absent) and the sub-screen header | must |
| S4 | Tab bar: 5 / 6 / 7 tabs at 402 and at 360, both icon states, with the two new icons | must |
| S5 | Image contact sheet at true 1x and 3x on the real background, with the acceptance numbers | must |
| S6 | Motion sheet: the seven motions as storyboards with timings and the reduced-motion fallback | should |

### Phase 1 — Home

| ID | State | Content | Priority |
|---|---|---|---|
| H1 | Session running | "Edzés folyamatban" · "Felsőtest – húzás" · [Folytatás]; 2/4, Friday half-lit, live dot | must |
| H1b | Session running, null title; and with no plan occurrence today | "Szabad edzés"; second variant: the banner alone, no numerals | must |
| H2 | Training day, not started (redraw) | Péntek, október 9. · bell 2 · 2/4 · "Felsőtest – húzás" · "Felső/alsó szplit – 12 hetes blokk" · 18:00 · 5 gyakorlat · [Indítás] · macros · the library row · new still · new today mark | must |
| H3 | Rest day | Csütörtök, október 8. · 2/4 · "Pihenőnap" · plan name · no button, no count · cél 2200 / cél 180 g / cél 190 g / cél 75 g · rest still | must |
| H4 | Done | Szerda, október 7. · "Felsőtest – nyomás" · "Kész" | must |
| H5 | Nothing scheduled / first run (also the today-query error) | no numerals, no week bar · "Ma nincs betervezve edzés" · "Ha van aktív terved, a mai napja itt jelenik meg." · [Gyakorlatok böngészése] · no badge · no nutrition block | must |
| H6 | Loading | numeral blocks, seven track segments, session skeleton, macro skeleton; no image | must |
| H7 | H2 at 360 × 800 | fluid rules of 3.4 | must |
| H8 | H2 as coach (6 tabs) and as admin (7 tabs) | content identical | must |
| H9 | Two sessions today — full scroll length | primary + secondary "Indítás"; macros below the fold | should |
| H10 | Starting (busy dots) · start failed (inline line) · offline (disabled) | — | should |
| H11 | Offline strip | "Nincs internetkapcsolat" · "3 művelet vár feltöltésre"; one-line and two-line | should |
| H12 | Week query failed | [Újra] in place of the numerals, "HETI EDZÉS" stays | should |
| H13 | Two-line day title | a long coach-written name, balanced | should |
| H14 | H2 in a second lamp (Aurora) | proves section 9 | should |
| H15 | Bell | none · 2 · 99+ | could |
| H16 | H2 in German | "Kohlenhydrate", "Fortschritt" | could |

### Phase 2 — Muscle selector

| ID | State | Content | Priority |
|---|---|---|---|
| M1 | Idle on mount — the real default | "Elöl", nothing lit, the hint "Koppints egy izomra a szűréshez", 12 chips + "Teljes test" all idle, A–Z text-only rows, no clear control | must |
| M2 | "Elöl" + "Mell" selected (redraw) | list header "MELL ×"; rows: "Fekvenyomás · Erő", "Fekvenyomás gépen · Kezdő · Erő", third row cut by the fade | must |
| M3 | "Hátul" + "Széles hátizom" selected | 10 chips + "Teljes test"; "Húzódzkodás · Kezdő · Erő", "Széles fogású hátlehúzás · Kezdő · Erő" | must |
| M4 | List scrolled | stage collapsed into the sticky bar with the lit mini figure and the chips; honest rows incl. "Svend Press · Kezdő · Erő · EN" and the two-line "Közepes fogású fekvenyomás rúddal"; three paging skeletons clear of the tab bar | must |
| M5 | Full scroll length | one tall frame: stage, chips, about 12 rows, paging | must |
| M6 | Search focused, keyboard up | "fekveny", clear button, stage collapsed, combined with "Mell" | must |
| M7 | No results; and the error variant | chip "Teljes test": "Nincs találat" · "Próbálj más keresőszót vagy szűrőt." · [Szűrők törlése]; error: the same with [Újra] | must |
| M8 | M2 at 360 × 800 | title and search stacked; two rows still visible | must |
| M9 | Finger down | "Hasizom" half-lit before release | should |
| M10 | First load | 6 row skeletons, "Betöltés", 4 chip placeholders | should |
| M11 | Rows with stills (after `equipment_slug`) | six stills; one row without a still keeps the same text edge | should |
| M12 | Chip request failed | placeholders with a retry | could |
| M13 | M2 at 375 × 667 | the stage at its floor | could |

### Phase 3 — Profile

| ID | State | Content | Priority |
|---|---|---|---|
| P1 | First viewport (redraw) | "TD." solid · Takács Dániel · takacs.daniel@pelda.hu · "TAG" · Érmék 190 "Egyenleged" · Eredmények 4/7 "feloldva" with the seven-segment bar · Testsúly 83,1 kg with the sparkline · "BEÁLLÍTÁSOK" · Felszerelés cut by the fade | must |
| P2 | Full scroll, final order — one tall frame (about 2 000 pt) | identity → "me" rows → Felszerelés → Hangok és rezgés → Megjelenés → Nyelv → Fiók | must |
| P3 | Felszerelés | 6 of 16 selected (Rúd, Kézisúlyzó, Gép, Kábel, Húzódzkodó rúd, Pad); header status "Mentés folyamatban" · "Felszerelés mentve" · "A mentés nem sikerült — a válasz megmarad, újrapróbáljuk" | must |
| P4 | Hangok és rezgés | Beszédhang on · Sípszó on · Rezgés disabled with "Ez a készülék nem tud rezegni — iPhone-on a sípszó marad az egyetlen nem vizuális jelzés." | must |
| P5 | Megjelenés | seven lamps: Aurora selected and owned · a pack previewing, unsaved, with the save bar · Ember 250, not owned · save failed: "A téma mentése nem sikerült — a választásod megmaradt, próbáld újra." | must |
| P6 | Fiók — the name | "Megjelenített név" focused with the keyboard · dirty with the save bar ("Mentés") · invalid (one character), save disabled | must |
| P7 | End of the page | Nyelv (Magyar · English · Deutsch) · "Admin felület megnyitása" (admin) · "Kijelentkezés" idle and busy | must |
| P8 | Roles | "EDZŐ" tag with 6 tabs · "ADMIN" tag + the admin row with 7 tabs | must |
| P9 | P1 at 360 × 800 | rows on one baseline; caption under the label | must |
| P10 | First run | 0 coins · 0/7 · no weight ("Mérés rögzítése") · no display name ("takacs.daniel", placeholder "Ahogy mások látnak") | should |
| P11 | Wallet variants | loading · failed ("—") · a four-digit balance · session dot absent | should |
| P12 | Rezgés available (a native build) | switch on | could |
| P13 | P1 in a second lamp | — | could |

Totals: 31 must · 12 should · 6 could. Build order: S1 → S2 → S3 (core components) → S4 → H1, H2 → M1, M2, M3 → P1, P2 → the remaining musts → S5, S6 → shoulds → coulds.

Next round, not this one: exercise detail (`/library/:id`), `/coins`, the workout player with the finish flow, `/notifications`.

---

## 9. THEME PACKS AND ROLES

### 9.1 Packs become lamps

A pack is **the colour of the light**: `accent` and everything derived from it by `color-mix` (pressed, half, soft, glow, focus ring), optionally a faint ink and surface cast. Geometry, type, spacing and every image stay Pulse's. Lime is the default lamp, so a new member always meets Pulse as lime. This is the recommended answer to owner decision 3; the table is what it means pack by pack (accents read from the app's `tokens.css`).

| Pack | Accent today | In Pulse | On `bg` | Note |
|---|---|---|---|---|
| Éjfél (default, free) | `#7C94ED` | **the lime lamp `#CBFF2E`** — key and label stay | 16.6 | The periwinkle retires. |
| Napfény | `#E89D4D` | amber lamp | 8.7 | Loses its own radii and 48 pt controls. Near `warning` in hue — fine, because warnings are always value + bar + text. |
| Erdő | `#4DC18D` | green lamp | 8.7 | Almost the hue of `success`; the two never have to be told apart by colour (success is a status line or a dot). |
| Neon | `#19CDE6` | cyan lamp | 10.1 | Already "pill + glow" in the app. |
| Mono | `#FAFAFA` | white lamp | 18.7 | No hue left; works only because no state is hue-only (3.0). Draw one test frame; if "lit" and "ink" blur, Mono retires. |
| Aurora (250 coins) | `#4FD1C5` | teal lamp; the gradient its store copy promises ("Hideg, északi fényű színátmenet.") lives on the primary pill only, solid teal everywhere else | 10.5 | Owners keep what they bought. |
| Ember (250 coins) | `#F0803C` | orange lamp — "Egyetlen meleg kiemelés." already describes it | 7.3 | Sits between `danger` and `warning` in hue; semantic colours never follow the pack. |

- `on-accent` is `#0B0D0A` on every lamp (7.3 : 1 at worst, on Ember).
- Because no image contains lime (4.1), every lamp works with no new asset: the tab icons tint, the muscle regions fill, the glow derives.
- The picker is seven lamp swatches; Aurora and Ember carry the coin and "250" or "Megvan"; an unowned lamp previews and leads to the purchase where it is chosen. That needs client state and one new string for the locked state.
- Pulse is dark-only. The planned light / dark / system mode cannot be built on it without a second accent and a second grade of every image; it is not promised.

### 9.2 Five, six, seven tabs

With no pill and no capsule the old constraint (a pill up to five tabs, a docked bar above) is gone: **one bar, equal cells, in every role.**

| | Member | Coach | Admin |
|---|---|---|---|
| Tabs | Kezdőlap · Edzés · Étkezés · Haladás · Profil | … · Haladás · **Edző** · Profil | … · Haladás · **Edző** · **Admin** · Profil |
| Side inset | 24 | 12 | 8 |
| Cell at 402 | 70.8 | 63.0 | 55.1 |
| Cell at 360 | 62.4 | 56.0 | 49.1 |
| Icon box | 32 | 32 | 28 |
| Label | always | always | always |

- Inactive: steel icon at 100 %, label text-2. Active: the same icon tinted with the accent, label text-1. Label weight does not change. (V1 still flips the active label to SemiBold and spaces the tabs by content width rather than in equal cells — both change.) Pressed: the icon at the half-lit level for the duration of the press. Target = the whole cell × 56.
- Widest label "Kezdőlap" is 47–48 pt; the tightest case, admin at 360, leaves it 0.5 pt a side inside a 49.1 pt cell, and its neighbour "Edzés" (31 pt) keeps the gap between the two labels near 9.6 pt. Every cell is ≥ 44 pt down to 360. "Edző" and "Admin" are shorter than "Haladás" (estimated, to be measured on S4).
- The whistle and the shield are made from the same sheet and the same tint script — seven icons for the whole app, no per-pack copies.
- German "Fortschritt" does not fit a six- or seven-tab cell: German needs a short tab label (new key, flagged).
- Fallback, only if the seven-tab bar fails on a real 360 pt phone: admin loses its tab and keeps the existing Profile row "Admin felület megnyitása". The owner's call then, not now.
- **[container]**: whether the bar sits on a surface or straight on the fade. The cells, the icons and the states do not change.
- Roles on the three screens: Home and the selector are identical for all three; Profile differs by the role tag ("TAG" / "EDZŐ" / "ADMIN") and the admin row.

---

## 10. OPEN DECISIONS FOR THE OWNER

Four questions, most consequential first. Each can be answered in ten seconds; the recommended option is marked.

**1. Where is the permanent door to the muscle selector?**
- **(recommended) "Edzés" is the door** — with no session running the tab shows the selector, with one running it shows the player; Home also gets a quiet row. Fixes the dead-end tab; changes what a tab means.
- A row on Home only — "Edzés" stays the player and stays empty when nothing runs.
- Leave it — reachable only from Home's empty state, i.e. never on a plan day.

**2. Can a session be finished from the app now?**
- **(recommended) Yes, a finish action in the player** — the backend is ready; needs a little frontend and new copy in three languages. Home then works as designed: "Indítás" before, "Kész" after.
- Finish and abandon both — the complete loop, more copy and one more confirmation to design.
- Not now — then Home's everyday state is "Edzés folyamatban · Folytatás" and that is the frame we polish.

**3. What is a theme pack inside Pulse?**
- **(recommended) The colour of the light** — lime is the default, the other six recolour only the light, the two paid ones are bought where they are chosen. Everything bought keeps its value.
- Lime only — packs are retired and the two paid ones refunded in coins. The purest Pulse; the store is left with nothing to sell.
- As today — each pack restyles the whole app. Pulse then is one pack among seven and cannot be guaranteed to look like Pulse.

**4. What is the big picture on Home?**
- **(recommended) A rendered object that shows the day** — a loaded bar on a training day, a towel on the bench on a rest day, empty hooks when nothing is planned; same world as the mannequin.
- Keep the fist photo — re-graded, without grain; it stays the only photograph in the app.
- The mannequin's upper body — on-family, but it would say nothing until the backend can name today's muscles.
- No picture — the numerals alone on black; the cleanest, and the least "rich in visual hooks".

**Assumed unless vetoed (no answer needed).**

- Two typefaces: Geist Mono is dropped. Pulse is dark-only. The narrowest phone is 360 pt wide.
- The mannequin is a generated neutral pair now, calmer and athletic-neutral, without toes; a Blender model only if that pair fails or a real turn is wanted. He sees and approves the renders themselves.
- On the selector: the chips follow the visible side of the figure; the selection survives opening an exercise and coming back; the unused hint "Koppints egy izomra a szűréshez" returns on the idle state; the list header names the selection instead of "24 gyakorlat".
- On Profile: the order of P-02; balance, 4/7 and body weight are shown there; the "Áttetsző felületek" control is hidden under Pulse; "Eredmények" opens its own tab on `/coins`.
- The idle "Indítás" glow breathes slowly; everything else animates once and respects reduced motion.
- New copy to be written or approved by the owner (hu / en / de), none invented here: the start-failed line · the finish label(s) · the locked-lamp state · a caption key for "feloldva" in en / de · a short German tab label.
- Deferred to the next round: `equipment_slug` on the exercise list, the empty chips "Hátsó vállizom" and "Teljes test", exercise detail, `/coins`, the workout player, the coach and admin work surfaces.

<!-- BRIEF-COMPLETE: sections 1-10 written. -->
