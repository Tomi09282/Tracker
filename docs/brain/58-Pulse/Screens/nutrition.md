---
type: screen-inventory
title: Étkezés — screen inventory
updated: 2026-10-11
route: "/nutrition"
tags: [ux, screen, inventory, pulse]
---

# Étkezés (h1 on the screen: "Táplálkozás") — `/nutrition` · member, coach, admin (auth only, identical content) · bottom tab 3 · lit tab: Étkezés

- **Doors:** the bottom tab `nav.nutritionShort = Étkezés` (5 / 6 / 7 tabs by role, always 3rd) · Home section `nutrition.card.title = Táplálkozás` with the link `nutrition.card.open = Megnyitás` (that block only renders when something is logged or a target exists today) · desktop command palette entry `nav.nutrition = Táplálkozás`.
- **Figma page:** "11 · PULSE — Tag" (id 70:3). No sub-routes, no sheets, no dialogs, no toasts on this screen.
- **Sources read:** `frontend/src/features/nutrition/NutritionPage.tsx` (the only live file; `MacroBars.tsx` and `NutritionCard.tsx` are dead code, nothing imports them), `useNutrition.ts`, `backend/src/nutrition/routes.js`, `backend/scripts/seed-demo.mjs`, migration `016_food_translations_and_seed.sql`.

## Purpose

The member's food day for ONE calendar date: "am I over or under the coach's target?" and "log what I just ate". Everything is per day; the date defaults to the device's local today.
**The ONE primary action:** `common.add = Hozzáadás` — add the picked food with its grams. It only exists after a food is picked from search, so the resting screen has NO filled button; the search field is the standing entry point.

## Elements

Status: live = in the running code · planned = API/hook only, no UI · cut = decided against.

### MUST (all live)

| Element | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|
| Screen title (h1) | static | `nutrition.title = Táplálkozás` | — |
| Date control | The selected date. Tap opens the OS-native date picker (not ours to design); any date, past or future; the whole day reloads | accessible name `nutrition.date = Dátum`; the visible date is the native control's own text, no key | value 2026-10-09. The printed text belongs to the OS control and differs by platform: Chrome / Android in Hungarian print "2026. 10. 09.", iOS Safari prints its own medium form (about "2026. okt. 9."). Home prints the same day as "Péntek, október 9." |
| Calorie total vs target (the anchor) | Logged kcal, rounded, NEVER clamped · "/ target kcal" · progress = logged ÷ target, fill clamps at full. (The live code draws it as a closed ring with the figure and the day name inside; that is the old design's shape, not a requirement) | accessible name `nutrition.macro.kcal = Kalória`; "/ 2600 kcal" is hard-coded formatting, no key | 1840 · / 2600 kcal · 71 % |
| Day name | The name the coach gave this plan day; read-only | fallback only: `nutrition.totals = A mai nap` | Edzésnap – péntek (seed data, no key) |
| Macro trio | Protein, carbohydrate, fat: logged grams, target, progress bar (clamped); read-only | `nutrition.macro.protein = Fehérje` · `nutrition.macro.carb = Szénhidrát` · `nutrition.macro.fat = Zsír` · `nutrition.macroTargetShort = cél` ("g" hard-coded) | 128g · cél 180g (71 %) · 210g · cél 290g (72 %) · 52g · cél 70g (74 %) |
| Section head: add | static | `nutrition.add = Hozzáadás` | — |
| Food search field | Type → results on every keystroke (each typed word is matched as the start of a word in the food name, accents ignored, app language + fallback; the member's own foods also match on their brand). Clear control appears once there is text | `nutrition.searchPlaceholder = Étel keresése…` · clear control name `common.close = Bezárás` | csirke |
| Result rows (max 8, no "more") | Name (one line, truncated) · kcal and protein per 100 g · brand when the food has one. The whole row is the tap target = pick; the trailing plus is decoration | "{kcal} kcal · {n}g P /100g · {brand}" is hard-coded, no key · none found: `nutrition.noResults = Nincs találat` | see Frame 2b |
| Picked food row (replaces the result list) | Name · live kcal for the typed grams · grams field (decimal keypad, prefilled with the food's serving size, else 100; not focused automatically) · a "valid number" check mark (`success` colour in the live code, never the accent) · the primary button. The row has no cancel control: editing or clearing the query un-picks it | grams field name `nutrition.grams = gramm` · "g", "kcal" hard-coded · button `common.add = Hozzáadás` | Csirkemell, bőr nélkül, nyers · 180 · g · 297 kcal |
| Section head: log | static | `nutrition.logged = Naplózva` | — |
| Meal group header | One per meal label, in the order first logged (not alphabetical). Rows without a label fall under the fallback. The live code prints it in capitals by styling (REGGELI); the stored text is "Reggeli" | fallback `nutrition.unlabelled = Egyéb`; every other label is stored data, no key | Reggeli · Ebéd · Egyéb |
| Log row | Food name (a snapshot in the language it was logged in) · grams · kcal. Nothing in the row is tappable except delete: ONE tap, no confirm, no undo | "{g}g · {kcal} kcal" hard-coded · delete control name `common.delete = Törlés` | Zabpehely · 60g · 222 kcal |
| Bottom tab bar | 5 tabs (member) | `nav.home = Kezdőlap` · `nav.workout = Edzés` · `nav.nutritionShort = Étkezés` · `nav.progress = Haladás` · `nav.profile = Profil` | Étkezés lit |

### SHOULD

| Element | Status | Data + action | Exact Hungarian copy | Sample |
|---|---|---|---|---|
| No-target line under the calorie figure | live | Shown when the date has no prescribed plan day at all | `nutrition.noTargetToday = Erre a napra nincs előírt cél — az étrend ciklusa nem esik ide.` | Frame 3 |
| Empty log | live | Icon, title, body. No button: the search field is the action | `nutrition.emptyTitle = Még nincs bejegyzés` · `nutrition.emptyBody = Keress rá egy ételre, és add hozzá a naphoz.` | Frame 3 |
| Over-target treatment | live | Figure and bar in `warning` (never `danger`), plus a warning glyph before the macro figure. No text, no scolding | none | 305g · cél 290g on Szénhidrát |
| Loading skeletons | live | See States | none | — |
| Offline strip (app shell, above the header) | live | Not rendered by this screen | `offline.title = Nincs internetkapcsolat` · `offline.queued = {{count}} művelet vár feltöltésre` (the count is workout set checks only) | — |
| Glyphs: flame in the calorie anchor, beef / wheat / droplet on the macros, utensils on result rows, plus / notebook in the section heads, apple in the empty state | live in the old design | Decoration only (basic line icons) | none | drop them: the approved Home shows the same four macros with no glyph |
| Meal-label picker when logging | planned | The API and hook accept `meal_label`; the screen never sends one | no copy exists | — |
| Create your own food | planned | `POST /foods` and a hook exist; no form | no copy exists | — |
| Multi-day nutrition trend | planned | Range endpoint and hook exist; no chart | no copy exists | — |
| Serving hint ("1 filé (150 g)") | data only | Returned by the API for the member's own foods, never rendered; the 95 catalogue foods have none | data, no key | — |
| Barcode / OpenFoodFacts | deferred, nothing built (T4.1.9) | — | — | — |
| Undo after delete, "remaining calories", nutrition streak | cut on purpose (code header) | — | `common.undo` exists but is not used here | — |

## States

| State | What the code renders |
|---|---|
| Loading (first open AND every change to a date not loaded yet; a date already seen comes back from cache without it) | Calorie anchor keeps its track, the figure becomes two skeleton bars · the macro trio becomes three skeletons of the same footprint · the log becomes three row skeletons. Title, date control and the whole add section stay live |
| Default: target + logged items | Frame 1 |
| Morning: target, nothing logged | "0" over "/ 2600 kcal", macros "0g · cél 180g" with empty bars, day name present, log shows the empty state |
| Over target | Calories: full bar, figure in `warning`. Macro: figure + glyph + bar in `warning`. Sample: Szénhidrát 305g · cél 290g |
| No target for the date (no active diet plan, a date before the plan starts, or the cycle has no day there) | Figure becomes "1840 kcal" (the unit joins it), no "/ target", no fill, day line = `nutrition.totals = A mai nap`, plus the `nutrition.noTargetToday` line. Macros: figure + name only, no "cél", no bar |
| Partial target (the coach left some numbers empty) | Each of the four values decides alone: a missing one loses its denominator and bar; the no-target line is NOT shown |
| Empty log | `nutrition.emptyTitle` + `nutrition.emptyBody`, no button |
| Search idle | Nothing under the field |
| Search fetching | The list is simply blank; no spinner, no skeleton exists |
| Search results | Up to 8 rows; catalogue (verified) foods first, the member's own foods after |
| Search without match (also what a failed search shows) | `nutrition.noResults = Nincs találat` |
| Picked, grams valid | Live kcal, check mark, button enabled |
| Picked, grams empty / 0 / not a number | "0 kcal", no check mark, button disabled. No error text exists |
| Un-pick | No cancel control on the picked row. Editing the query brings the result list back; the clear control empties the query and drops the pick |
| Focus | Search field, grams field and date control each show a focus ring; the search field's edge also turns accent. Picking a food does not move focus to the grams field, so the keypad only rises when the member taps it |
| Saving | Button busy. Success: the picked row and the query clear, totals and log grow. Failure: silent, the row just stays |
| Delete | One tap sends it; no confirm, no undo, no pending mark. It is not optimistic: the row stays as it was until the server answers and the day reloads, then it is gone and the totals shrink. A failed delete is silent |
| Error loading the day | NO error state: it renders as "0 kcal", "A mai nap", macros without targets and the empty log. No retry control |
| Offline | Shell strip only. Nutrition writes are NOT queued (only workout set checks are): add and delete fail silently |
| Role / device variants | None in content. Coach and admin get the same screen with 6 / 7 tabs: coach adds `nav.coach = Edző` before Profil, admin adds `nav.coach = Edző` and `nav.admin = Admin` before Profil; Étkezés stays 3rd and lit (a coach without a diet plan of his own sees the no-target state). Desktop: same single column |
| Sheets / dialogs / toasts | None |

## Frames to draw

Sample provenance: totals and targets are feature-inventory §6.4 verbatim. Row kcal are computed from the demo seed's per-100 g values (`seed-demo.mjs`). Five rows were added to the six of §6.4 so the rows really add up: 1839,95 kcal · 128,0 g · 210,2 g · 52,3 g, and the rounded rows sum to exactly 1840.

### Frame 1 — "Étkezés · mai nap" (returning member, Friday 9 October 2026, afternoon; tab Étkezés lit; no filled button anywhere)

1. Status bar 9:41.
2. Header: **Táplálkozás** · trailing date control: calendar glyph + the date (2026-10-09; recommended print "Péntek, október 9." as on the approved Home; the live control shows the OS text instead, "2026. 10. 09." on Chrome / Android and about "2026. okt. 9." on an iPhone).
3. Calorie anchor: **1840** · "/ 2600 kcal" · progress 71 % · day name "Edzésnap – péntek".
4. Macro trio, each with a bar: Fehérje **128g** · cél 180g (71 %) — Szénhidrát **210g** · cél 290g (72 %) — Zsír **52g** · cél 70g (74 %).
5. Section **Hozzáadás**: search field, empty, placeholder "Étel keresése…", search glyph.
6. Section **Naplózva**, three groups, every row with a trailing delete glyph:

| Group header | Row | Caption |
|---|---|---|
| Reggeli | Zabpehely | 60g · 222 kcal |
| | Tejsavó fehérjepor, vanília | 30g · 114 kcal |
| | Banán | 120g · 107 kcal |
| | Görög joghurt, natúr | 100g · 133 kcal |
| | Méz, akác | 30g · 91 kcal |
| Ebéd | Csirkemell filé, nyers | 180g · 198 kcal |
| | Basmati rizs, főtt | 220g · 286 kcal |
| | Brokkoli, párolt | 150g · 53 kcal |
| | Olívaolaj | 20g · 177 kcal |
| Egyéb | Túró, félzsíros | 235g · 237 kcal |
| | Teljes kiőrlésű kenyér | 90g · 222 kcal |

Caution on the group headers: this three-group day cannot come from the app's own logging. "Reggeli" and "Ebéd" are labels only the demo seed writes, and the seed stops at yesterday, so on the reference Friday a member who logs in the app gets all 11 rows under ONE header, "Egyéb". Draw that as variant 1b (same rows, same order, single header); Frame 1 stays as the stress case for several groups, which past days in the demo really show.

7. Tab bar: Kezdőlap · Edzés · **Étkezés** · Haladás · Profil. The list runs under the bottom fade; a row must be visibly cut.

### Frame 2 — "Hozzáadás · kiválasztott étel" (a food is picked; the ONLY state with the lime pill; keyboard optional)

1. Status bar, header as Frame 1 (the calorie anchor and macros may be scrolled partly out; values unchanged).
2. Section **Hozzáadás**.
3. Search field holding the typed query "csirke" + clear glyph (name "Bezárás").
4. Picked row: **Csirkemell, bőr nélkül, nyers** · live "297 kcal" · grams field "180" + "g" + check mark (valid) · lime pill **Hozzáadás**.
5. Section **Naplózva** continues below (first rows of Frame 1, cut by the fold).
6. Tab bar, Étkezés lit.

**2b — the step before (same frame, the result list in place of the picked row; no pill):**

| Row | Caption |
|---|---|
| Csirkecomb, bőr nélkül, nyers | 209 kcal · 18g P /100g |
| Csirkemell, bőr nélkül, nyers | 165 kcal · 31g P /100g |
| Csirkemáj, nyers | 119 kcal · 17g P /100g |
| Csirkemell filé, nyers (the member's own food) | 110 kcal · 23g P /100g |

Branded stress row: Tejsavó fehérjepor, vanília — "380 kcal · 76g P /100g · Scitec".

### Frame 3 — "Üres nap, nincs cél" (member with no diet plan, nothing logged; same Friday; matches Home frame E)

1. Status bar, header as Frame 1.
2. Calorie anchor: **0 kcal** (unit joins the figure) · no "/ target" · no progress fill · line "A mai nap".
3. Line: "Erre a napra nincs előírt cél — az étrend ciklusa nem esik ide."
4. Macro trio without targets and without bars: **0g** Fehérje — **0g** Szénhidrát — **0g** Zsír.
5. Section **Hozzáadás**: empty search field, "Étel keresése…".
6. Section **Naplózva**: empty state — "Még nincs bejegyzés" · "Keress rá egy ételre, és add hozzá a naphoz." · no button.
7. Tab bar, Étkezés lit.

## Images

Foods have NO media: no photo, no thumbnail, no icon field, no brand logo, in the catalogue or on the member's own foods.

| Could help | Where | Note |
|---|---|---|
| One edgeless low-key B/W still beside the calorie numeral (the role the fist plays on Home) | Frame 1 anchor | Generic subject: a hand with a fork over a dark bowl, a steel bowl, a single egg or grain close-up. Graded to the black, one per screen |
| A graphite 3D render of an empty bowl / plate, same family as the tab icons | Frame 3 empty state | Says "nothing logged yet" without a line icon |
| The lime-lit "bowl of spheres" tab icon | tab bar | First screen that shows it active; check it reads as food at 32 px |

Must NOT be shown as if it existed: a photo or thumbnail on any result or log row · a photo "of the member's meal" (no photo logging) · brand logos or packaging · a barcode or scanner image · a coach portrait or avatar · a food illustration per meal group · macro glyphs as content (the approved Home has none).

## Do not invent

- Meal picker (Reggeli / Ebéd / Vacsora chips or tabs) when adding — in-app logging always lands under "Egyéb".
- The coach's prescribed meals for the day ("mai étrend"), "log from plan" or tick-off of prescribed items — the member only ever sees the day's targets and the day name.
- Remaining-calories figure or any "budget left" reading of the calorie progress (the live ring shows logged ÷ target and never what is left), percent labels, nutrition streak, water tracking.
- Editing a logged row (grams, meal, time) — only delete and add again. No swipe-to-delete, no confirm dialog, no undo toast.
- A cancel control (`common.cancel = Mégse` exists but is not used here) or a close glyph on the picked food row — the only way back is the search field (edit or clear the query).
- Barcode scan, photo / AI food recognition, voice input, quick-add of bare kcal.
- Recent foods, favourites, "copy yesterday", saved meals or recipes.
- A create-your-own-food form, a food detail screen, a unit picker (db, szelet, adag) — grams only.
- Per-meal subtotals, timestamps on rows, notes, fibre or micronutrients, carb / fat in result rows, a macro pie or donut.
- Week strip, previous / next day arrows, a "Ma" shortcut, a weekly or monthly chart or calendar heat map.
- An "own food" or "verified" badge on results (the data has the flags; the UI shows nothing).
- Coach comments, sharing the diary with the coach (owner decision 2026-08-09: the diary stays private), reminders or push ("Ma még nem naplóztál" exists only as a seeded demo notification; the server never emits it).
- A success toast, a celebration, or a coin / achievement notice after logging (`achievement.nutrition.logged.7 = 7 nap naplózva` is awarded silently and listed only on `/coins`).

## Notes for the designer

- **Two names for one place:** the tab says "Étkezés", the h1 and Home's section say "Táplálkozás". Both strings are live; draw them as they are.
- **Same word twice:** the section head `nutrition.add` and the button `common.add` are both "Hozzáadás"; in Frame 2 they sit close together.
- **No lime pill at rest.** Frames 1 and 3 have no filled shape except the lit tab icon (like the approved Profile). The search field must read as the way in through type and a rule, not through a box; reuse the underline field of the approved Profile for both search and grams.
- **Unit formatting:** this screen prints "128g", "cél 180g", "60g · 222 kcal" with no space; the approved Home prints "128 g", "cél 180 g". Follow the approved look (the element and frame tables above quote the live strings, so add the space when drawing). All these fragments, "kcal", "g", "/100g" and the protein shorthand "P" are hard-coded, not in hu.json.
- **Decimals:** values under 10 print one decimal with a DOT here ("3.3g P"), unlike Haladás (decimal comma). The frames above avoid such values on purpose.
- **Will not fit:** "Szénhidrát · cél 290g" on one line in a three-across column — stack name / figure / bar / target like the approved Home macro. `nutrition.noTargetToday` (63 characters) wraps to two lines. Food names are truncated to one line (longest catalogue name: "Tonhal, vízben konzerv, lecsöpögtetve"; limit 160 characters). Day name and meal label are free text up to 80 characters. The anchor figure prints a Hungarian thousands space from 10 000 up ("12 400"); targets and row values never do ("12400").
- **Group labels are data, not a feature.** "Reggeli" and "Ebéd" in Frame 1 mirror what the demo seed writes on the past days it fills, about six in seven, never today (Reggeli, Ebéd, Uzsonna, Vacsora, and Nasi only on its over-target days). A real member logging in the app gets ONE group, "Egyéb", holding every row. The header is drawn even then.
- **Delete is one tap and final.** Give the glyph a 44 pt target on the right edge with clear air around it; do not use a chevron there (rows do not navigate).
- **Copy that misleads:** "A mai nap" is printed for any selected date without a named plan day, also in the past; the no-target sentence blames the plan's cycle even when the member has no diet plan at all. Quote both unchanged.
- **Missing pieces (new if drawn; keep them on the state board, not in the frames):** a search-loading state, an error state for the day with `common.retry = Újra`, visible feedback when add or delete fails, a failed-vs-empty distinction (today a failed load looks like an empty day with zero calories).
- **Own foods exist only through the seed.** The demo member has 32 own foods (a serving size on each, a brand on six) because `seed-demo.mjs` inserts them; no screen can create one. Some share a name with a catalogue food ("Túró, félzsíros" 98 vs 101 kcal) and nothing in a result row tells them apart.
- **Date print is a choice.** The live control shows the OS's native date text, which is not the same on every phone ("2026. 10. 09." on Chrome / Android, about "2026. okt. 9." on iOS Safari). "Péntek, október 9." is how Home formats the same day; using it here is a presentation change, the picker behind it stays the OS one.
- **Motion that exists today:** the calorie figure counts up from 0 to its value in about 0,9 s on every load and after every add or delete (it lands at once under reduced motion); the calorie progress and the three macro fills ease to their new length; the loading placeholders shimmer. No toast, sheet or other layer ever appears.
- **Fold:** header + anchor + macros + add + log exceed 874 pt; expect a tall scroll frame beside the 402 × 874 one.
