---
type: screen-inventory
title: Haladás — screen inventory
updated: 2026-10-11
route: "/progress"
tags: [ux, screen, inventory, pulse]
---

# Haladás — `/progress` · member, coach, admin (no role gate; each sees only their OWN body data) · reached from the bottom tab "Haladás" (desktop also: command palette) · lit tab: Haladás (4th of 5 / 6 / 7)

Checked 2026-10-10 against the code, not the spec: `frontend/src/features/progress/ProgressPage.tsx`, `useProgress.ts`, `ui/feedback/TrendChart.tsx`, `chartGeometry.ts`, `ui/data/SummaryTile.tsx`, `lib/measure.ts`, `lib/person.ts`, `ui/feedback/ToastHost.tsx`, `app/navTabs.ts`, `app/router.tsx`, `backend/src/progress/routes.js`, migration `017_progress.sql`, `backend/scripts/seed-demo.mjs` §8, `docs/brain/55-Screens/haladas.md`.
Status words: **live** = in code and reachable · **planned** = spec / API only, no screen · **cut**.
The spec is out of date in six places, the code wins: the metric select is BACK in the record form; measurement delete has an undo toast and photo delete has a confirm sheet (the spec says "no modals anywhere on this route"); the chart's value scale and gridlines ARE built (the spec lists them as missing); the coach block and the access log print a name / e-mail local part, never the e-mail address the spec draws; the log time carries seconds; and NO coach screen reads the shared data, although the spec says the client-detail tabs do. Tab root: no back control, no bell, no header action.
Skeptic pass 2026-10-10 (second reader, code re-opened): corrected the undo toast (no "Visszavonva" flip in the shipped toast style), the ways the photo sheet closes, the list of filled things in code, the "as on Profil" switch reference, the unit-preference and seed-only caveats; added the rendered parts the first pass skipped (gridlines, calendar glyphs, tile icons, toast parts, silent-failure and never-recorded-metric states).

## Purpose

The member comes to answer "is it moving?" for a body metric (one trend line over real time), to add today's number, to keep private progress photos, and to decide exactly what the coach may see. Three jobs on one route, split by a three-way switch that is a filter, not navigation (URL and lit tab never change).
**The ONE primary action: `common.save` = "Mentés"** — save a measurement (Test tab). On Fotók the only action is "Fájl választása"; Megosztás has no primary action at all.

## Elements

### MUST

| Element · status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|
| Screen title (h1) · live | Static. | `progress.title` = "Haladás" | Haladás |
| Three-way switch · live | Test / Fotók / Megosztás. Local state: always opens on Test, not kept in the URL, not remembered. Exactly one selected. | `progress.tab.body` = "Test"<br>`progress.tab.photos` = "Fotók"<br>`progress.tab.sharing` = "Megosztás" | Test selected |
| **Test** — trend chart (the anchor) · live | ONE chart for the selected metric (default = the metric with the most readings, else weight). Shows: metric name; latest value + unit as the largest figure; the change over the WHOLE window (last − first, signed, one decimal, no unit; hidden when 0); a line with a dot on every reading (last dot larger) and a soft fade under it — one continuous line, so a break is crossed by a single straight segment with no dots on it (line, dots and fade are accent-coloured in code); 3 scale values = max / middle / min of the data itself (not snapped to round numbers; 1 value when the series is flat) with the unit above them, and one hairline gridline per scale value; first and last date under the plot. X axis is real time, so breaks show as distance. Display-only: no tap, no tooltip, no range switch — always the whole history. A screen-reader-only table repeats the series (nothing to draw). | `progress.metricName.weight` = "Testsúly"<br>unit and dates: no key (kg / cm / %, raw ISO date)<br>`progress.date` = "Dátum" (hidden table header only) | Testsúly · **83,1 kg** · −5,3 · scale kg 88,6 / 85,8 / 83,0 · 26 readings (9, a break, 17) · 2026-07-17 … 2026-10-08 |
| Change is NEUTRAL · live (hard product rule) | The delta is the same grey up or down. No green, no red, no arrow, no target, no praise — the app does not know which way is good. | — | −5,3 in secondary ink |
| Break marker · live | When the longest pause between two readings is ≥ 14 days, a label sits between the two axis dates (in code a small filled chip in the warning tone). | `progress.gap` = "{{count}} nap kihagyás" | 25 nap kihagyás (2026-08-06 → 2026-08-31) |
| Other recorded metrics · live | Latest reading of every OTHER metric the member has ever recorded: value + unit, caption "name · date". Two per row in code, each centred under an icon puck (a scale for weight, a % sign for body fat, a ruler for every circumference), ordered alphabetically by the INTERNAL metric key (arm…, body_fat, calf…, chest, …) — not the picker's order. NOT tappable. A metric never recorded gets nothing. Moving the picker swaps the set: the picked metric leaves, the one that was in the chart joins. | `progress.metricName.arm_right` = "Kar (jobb)"<br>`progress.metricName.body_fat` = "Testzsír"<br>`progress.metricName.chest` = "Mellkas"<br>`progress.metricName.waist` = "Derék" | 37,9 cm · Kar (jobb) · 2026-09-11<br>18,6 % · Testzsír · 2026-10-02<br>105,1 cm · Mellkas · 2026-09-11<br>87,5 cm · Derék · 2026-09-25 |
| Record form — heading · live | Section title. Always on screen (also while loading and when empty). | `progress.record` = "Mérés rögzítése" | — |
| Record form — metric picker · live | Native select, full width, 15 options (list in Notes). It is also the ONLY way to change which metric the chart shows. | `progress.metric` = "Mit mérsz" | Testsúly |
| Record form — value · live | Decimal keypad; comma or dot. The unit is appended to the label in code: "Érték (kg)" / "Érték (cm)" / "Érték (%)". No placeholder. | `progress.value` = "Érték" | Érték (kg) · empty (typed example: 83,1) |
| Record form — date · live | Native date field with a calendar glyph inside its leading edge, defaults to today (phone's local day), back-dating allowed. Stays after a save so a run of forgotten days can be entered. | `progress.on` = "Mikor" | today = 2026-10-09 (the field prints the phone's own format: iOS 2026. okt. 9. · Android 2026. 10. 09.) |
| Record form — save · live | Primary. Busy while saving (in code the label is swapped for a spinner and the button keeps its width). On success the value clears, the chart and list refresh. Same metric + same day silently REPLACES the earlier value. Empty or non-positive input: nothing happens. | `common.save` = "Mentés" | [Mentés] |
| Entries list · live | All metrics mixed, newest first, at most the newest 30 (no "more"). Row: metric name, then "date · value unit", then a delete control. One tap deletes, no confirm. Section absent when there are no readings. No editing of a row. | `progress.entries` = "Bejegyzések"<br>`common.delete` = "Törlés" (icon label) | Testsúly — 2026-10-08 · 83,1 kg<br>Testsúly — 2026-10-06 · 83,4 kg<br>Testsúly — 2026-10-03 · 83,0 kg<br>Testzsír — 2026-10-02 · 18,6 %<br>Testsúly — 2026-10-01 · 83,6 kg<br>Testsúly — 2026-09-30 · 83,3 kg |
| Delete toast with undo · live | After a measurement is deleted: a toast at the bottom, above the tab bar, for 4 s. Parts: an info glyph, the message, an undo text action, a close icon, and a thin countdown line along its bottom edge (no line under reduced motion). Undo re-creates the exact row and the toast simply CLOSES — that is the shipped toast style (E15 "Typed-icon"). The flip to the undone word exists only in the alternative toast style "Undo-flip", which an admin can switch on app-wide in the Style Studio: do not draw it as the default. At most three toasts stack. | `progress.measurementDeleted` = "Mérés törölve"<br>`common.undo` = "Visszavonás"<br>`common.dismiss` = "Bezárás" (icon label)<br>`common.undone` = "Visszavonva" (alternative toast style only) | Mérés törölve · Visszavonás |
| **Fotók** — add a photo · live | Heading, then the privacy sentence BEFORE any control, then a date field (same as the record form's: calendar glyph, defaults to today) and a file picker (JPEG / PNG / WebP, max 25 MB). Choosing a file uploads at once — there is no save step. The OS chooser (library / camera / files) does the picking. | `progress.addPhoto` = "Fotó hozzáadása"<br>`progress.photoPrivacyNote` = "A fotóidat alapból SENKI nem látja — az edződ sem, amíg te nem engeded meg."<br>`progress.on` = "Mikor"<br>`progress.chooseFile` = "Fájl választása" | Mikor: 2026-10-09 |
| Photo grid · live | 3 columns, square, centre-cropped, newest first (max 200). Each tile: the date on a solid backing (raw ISO) and a backed delete control. Tapping the photo does nothing. | `progress.photoAlt` = "Haladási fotó, {{date}}" (alt text)<br>`common.delete` = "Törlés" (icon label) | sample member: NO photos (see States) |
| Delete-photo confirm sheet · live | The only sheet on this route (the delete toast is the other overlay). A bottom sheet over a dimmed, blurred scrim: grab handle, title with a close icon opposite it, body; Cancel first and wider, Delete as danger. Closes on Cancel, the close icon, a tap on the scrim, a swipe down on the handle, Escape. Permanent, no undo, no toast afterwards. | `progress.deletePhotoTitle` = "Törlöd ezt a fotót?"<br>`progress.deletePhotoBody` = "A fotó véglegesen törlődik, és nem hozható vissza — újra le sem fényképezhető, mert egy adott naphoz tartozik."<br>`common.cancel` = "Mégse"<br>`common.delete` = "Törlés"<br>`common.close` = "Bezárás" (icon label) | — |
| **Megosztás** — who can see · live | Heading + explainer, then one block per coach link: coach's display name (fallback: e-mail local part, never the full address) and two INDEPENDENT on/off controls (checkboxes in code). A change applies on tap: no confirm, no toast. | `progress.whoCanSee` = "Ki láthatja"<br>`progress.sharingNote` = "Külön dönthetsz a mérésekről és a fotókról. Bármikor visszavonhatod, és azonnal érvényes."<br>`progress.shareMeasurements` = "Mérések megosztása"<br>`progress.sharePhotos` = "Fotók megosztása" | Kovács Péter · Mérések megosztása ON · Fotók megosztása OFF |
| Revoke everything · live | Danger action, shown only while at least one of the two is on. One tap, no confirm; both go off. | `progress.revokeAll` = "Minden hozzáférés visszavonása" | visible (measurements are on) |
| Ended-link tag · live | When the coaching link is not active: tag beside the name (upper-cased by CSS), both controls disabled and shown off. The row stays — "I revoked" and "they left" are different facts. | `progress.linkEnded` = "Lezárult" | LEZÁRULT |
| Who looked (access log) · live | Read-only, newest first, at most 50. Row: viewer (e-mail LOCAL PART of the address stored at view time), then what + when (device-locale date and time WITH seconds, no key). | `progress.whoLooked` = "Ki nézte meg"<br>`progress.looked.measurements` = "Megnézte a méréseidet"<br>`progress.looked.photo` = "Megnézett egy fotót" | kovacs.peter — Megnézte a méréseidet · 2026. 10. 07. 14:12:05<br>then 2026. 10. 01. · 2026. 09. 25. · 2026. 09. 19. · 2026. 09. 13. (same line, same time) |
| Bottom navigation · live | Haladás lit. Member 5 / coach 6 / admin 7 tabs. | `nav.progress` = "Haladás" | Kezdőlap · Edzés · Étkezés · **Haladás** · Profil |

### SHOULD

| Element · status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|
| Too-few-readings sentence · live | A selected metric with fewer than 3 readings draws NO chart: only this sentence (no name, no value). Two points are not a trend. The wording says "edzésnap" (training day) — it was written for strength charts. | `progress.notEnough` = "Még kevés adat a grafikonhoz ({{count}} nap). Három edzésnap kell hozzá — két pont még nem trend." | pick Mellkas (2 readings) → Még kevés adat a grafikonhoz (2 nap). … |
| Value error · live | Danger edge on the value field, a warning glyph inside it, the sentence under it. Shown for ANY failed save (out of range, offline, rate limit); cleared by the next keystroke. Ranges are typo guards, e.g. weight 20–400 kg, waist 40–200 cm, body fat 1–70 %. | `progress.outOfRange` = "Ez az érték kívül esik a hihető tartományon. Ellenőrizd, nem ütöttél-e el valamit." | Érték (kg): 831 |
| Upload status + failure · live | While uploading, a status word beside the picker; on any failure one danger line with a glyph. | `common.saving` = "Mentés folyamatban"<br>`progress.uploadFailed` = "A feltöltés nem sikerült. Csak JPEG, PNG vagy WebP kép tölthető fel." | — |
| Empty states · live | Test: icon, title, body (record form stays below). Fotók: icon, title, body. Megosztás: two plain lines. None has an action. | `progress.emptyTitle` = "Még nincs mérés"<br>`progress.emptyBody` = "Rögzíts legalább három mérést, és megjelenik a trend."<br>`progress.noPhotosTitle` = "Még nincs fotó"<br>`progress.noPhotosBody` = "Az összehasonlításhoz legalább kettő kell, ugyanabban a pózban."<br>`progress.noShares` = "Nincs edződ, akivel megoszthatnád."<br>`progress.noLooks` = "Még senki nem nézte meg." | Fotók: the sample member's real state |
| Offline strip (app shell) · live | Above the screen. Nothing on this route is queued offline. | `offline.title` = "Nincs internetkapcsolat" | — |
| Tap a summary to switch the chart · planned (spec idea, not built) | The spec offers it as the alternative to the select; in code the summaries are inert. | no key | — |
| First grant for a coach you never shared with · planned (missing) | The list shows only links that ALREADY have a share record; no control creates the first one. A member with a coach and no record sees "Nincs edződ, akivel megoszthatnád." Only the demo seed creates the record. | no key | — |
| Coach-side screen for shared measurements / photos · planned (backend only) | The switches work, nothing on the coach side reads them; the log fills only from the seed / API. The coach's client detail has its own "Haladás" tab (strength charts, records, sessions) — not body data. | `progress.heading` = "Fejlődés" (that coach tab's heading; NOT this screen's title) | — |
| Note on a measurement; pose and note on a photo · planned (API only) | Fields exist in the data (note ≤ 300 chars, pose ≤ 40), no input anywhere. | no key | — |

## States

| State | What is on screen |
|---|---|
| Auth gate (shell) | Full-screen skeleton, then the screen or `/login`. Screen-reader text `common.loading` = "Betöltés". |
| Test · loading | One chart-sized placeholder + two summary placeholders; the record form is already usable below; no entries section. Never a spinner. |
| Test · populated | Chart, other-metric summaries, record form, entries (Frame 1). |
| Test · one metric only | No summaries at all; chart, form, entries. |
| Test · too few readings | The sentence replaces the chart for that metric; summaries, form and entries unchanged. |
| Test · picker moved to a metric never recorded | Same sentence with 0: "Még kevés adat a grafikonhoz (0 nap). Három edzésnap kell hozzá — két pont még nem trend." The value label takes the new unit; every recorded metric is now a summary. Every FIRST reading of a new metric passes through this state. |
| Test · flat series | Line through the middle, one scale value, no delta. |
| Test · long break | The "{{count}} nap kihagyás" marker (≥ 14 days). It follows the selected metric: Testzsír would say 35, Derék 42. |
| Test · empty | "Még nincs mérés" / "Rögzíts legalább három mérést, és megjelenik a trend." + the record form. No entries section. |
| Test · fetch error | Identical to empty (a member with 100 readings is told to record the first). No error copy, no retry. |
| Test · saving / save failed | "Mentés" busy (spinner in place of the label) · then the value error above. A wrong or empty number fails silently. |
| Test · after delete | Toast "Mérés törölve" + "Visszavonás" for 4 s; tapping "Visszavonás" puts the row back and closes the toast. |
| Fotók · loading | Three square placeholders in the grid. |
| Fotók · empty (also on fetch error) | Add block + "Még nincs fotó" / "Az összehasonlításhoz legalább kettő kell, ugyanabban a pózban." |
| Fotók · uploading / failed | "Mentés folyamatban" beside the picker · "A feltöltés nem sikerült. Csak JPEG, PNG vagy WebP kép tölthető fel." |
| Fotók · populated | Grid of dated squares, each with a delete control. |
| Fotók · delete sheet | "Törlöd ezt a fotót?" + body + [Mégse] [Törlés]. Closes on Mégse, the close icon, a tap on the scrim, a swipe down on the handle, Escape. |
| Megosztás · no record / loading / fetch error | "Nincs edződ, akivel megoszthatnád." and "Még senki nem nézte meg." appear at once — this tab has NO loading placeholder and no error state. |
| Megosztás · link active, nothing shared | Name + two controls off; no revoke action. |
| Megosztás · sharing | One or both on + "Minden hozzáférés visszavonása" (Frame 2). |
| Megosztás · link ended | "Lezárult" tag, both controls disabled and off, no revoke action. |
| Megosztás · changing a control | No busy and no optimistic state: the control flips (and the revoke action appears or goes) only once the server has answered. |
| Silent failures (all three tabs) | A failed measurement delete, photo delete, share change or revoke shows NOTHING — no toast, no error line; the row, tile or control just stays as it was. Only a failed save and a failed upload have copy. |
| Offline | Shell strip only. A save attempted offline shows the out-of-range sentence (wrong message, real behaviour). |
| Role / device | No role differences in content; only the bar has 5 / 6 / 7 tabs. Date field, metric picker and file chooser are OS-native controls. No dialogs other than the photo sheet. |

## Frames to draw

Canvas 402 × 874. The Test tab is about two screens tall — the bottom fade cuts the entries list, never a lone label.

**Frame 1 — "Haladás · Test" — returning member, Friday 9 October 2026 (most common view)**
1. Title: Haladás
2. Switch: **Test** · Fotók · Megosztás
3. Chart: label Testsúly · hero figure 83,1 with unit kg · annotation −5,3 (neutral) · scale column kg / 88,6 / 85,8 / 83,0 · line with 26 dots: 9 between 17 Jul and 6 Aug, a 25-day stretch with no dots, 17 between 31 Aug and 8 Oct, falling from 88,4 to 83,1, last dot larger (the code crosses the dot-less stretch with one straight solid segment; the approved Profil sparkline draws the same stretch dotted — follow Profil) · axis row: 2026-07-17 — 25 nap kihagyás — 2026-10-08
4. Other metrics (four): 37,9 cm · Kar (jobb) · 2026-09-11 — 18,6 % · Testzsír · 2026-10-02 — 105,1 cm · Mellkas · 2026-09-11 — 87,5 cm · Derék · 2026-09-25
5. Mérés rögzítése: Mit mérsz → Testsúly · Érték (kg) → empty · Mikor → 2026. okt. 9. · [Mentés] (the one lime pill)
6. Bejegyzések (cut by the fold): Testsúly / 2026-10-08 · 83,1 kg — Testsúly / 2026-10-06 · 83,4 kg — Testsúly / 2026-10-03 · 83,0 kg — Testzsír / 2026-10-02 · 18,6 % — Testsúly / 2026-10-01 · 83,6 kg; each row ends in a delete glyph
7. Tab bar: Kezdőlap · Edzés · Étkezés · Haladás (lit) · Profil

**Frame 2 — "Haladás · Megosztás" — measurements shared, photos private**
Caveat: this is the demo-seed state. Through the live UI a member cannot reach it today (nothing creates the first share and no coach screen writes the log — see the product gaps); what a real member sees now is "Nincs edződ, akivel megoszthatnád." and "Még senki nem nézte meg." Draw this frame as the designed state and keep that pair on the state board.
1. Title: Haladás · Switch: Test · Fotók · **Megosztás**
2. Ki láthatja
3. Külön dönthetsz a mérésekről és a fotókról. Bármikor visszavonhatod, és azonnal érvényes.
4. Kovács Péter — Mérések megosztása: ON — Fotók megosztása: OFF — Minden hozzáférés visszavonása (danger, not lime, no fill)
5. Ki nézte meg
6. Five rows, each: kovacs.peter / Megnézte a méréseidet · date-time: 2026. 10. 07. 14:12:05 — 2026. 10. 01. 14:12:05 — 2026. 09. 25. 14:12:05 — 2026. 09. 19. 14:12:05 — 2026. 09. 13. 14:12:05
7. Tab bar, Haladás lit. No lime pill on this frame.

**Frame 3 — "Haladás · Fotók" — empty (the sample member has no photos, feature-inventory §6.7)**
1. Title: Haladás · Switch: Test · **Fotók** · Megosztás
2. Fotó hozzáadása
3. A fotóidat alapból SENKI nem látja — az edződ sem, amíg te nem engeded meg.
4. Mikor → 2026. okt. 9. · [Fájl választása]
5. Még nincs fotó / Az összehasonlításhoz legalább kettő kell, ugyanabban a pózban.
6. Tab bar, Haladás lit.
State-board extra (NOT in the shared sample set, mark it as a variant): the populated grid — three squares dated 2026-10-02, 2026-08-31, 2026-07-17, each with a backed delete glyph — and over it, on a scrim, the bottom sheet (grab handle, close icon beside the title): Törlöd ezt a fotót? / A fotó véglegesen törlődik, és nem hozható vissza — újra le sem fényképezhető, mert egy adott naphoz tartozik. / [Mégse] [Törlés].

## Images

| Could help | Why / where |
|---|---|
| One graphite or steel object per tab at most, glowing out of the black beside the hero figure (as the fist sits beside 2/4): a bathroom-scale platform or a coiled steel tape measure for Test. | Says "body measurement" before a word is read. Keep it off the plot area; the chart is the anchor. |
| The same object, dimmed, for the Test empty state; a small graphite camera or an empty row of three square frames for the Fotók empty state. | Empty states have no action; an object keeps them from being two grey lines. |
| The approved mannequin with ONE thin lit band where the tape goes (Nyak, Váll, Mellkas, Derék, Csípő, Comb, Vádli, Kar, Alkar; left / right) next to the metric picker. | The one image that makes the screen easier to USE: "where exactly do I measure?". New asset work (13 band positions), and the app has no measuring-guide copy — picture only. Do not change the mannequin itself. |

Must NOT be shown as if it existed: progress photos for the sample member (he has none; photos are also the member's own unpredictable COLOUR snapshots, never graded stills) · any profile photo or avatar for the member or the coach (in code the coach block is a name only, no monogram either) · a thumbnail of "which photo" in the access log · before / after pairs, pose silhouettes or framing guides · a body-scan or body-fat figure · exercise media.

## Do not invent

- Goal weight, target line, "x kg to go", progress ring or percentage — there is deliberately no target.
- Green / red change, up-down arrows as good-bad, congratulation or warning copy about the direction.
- BMI, body-fat categories, "healthy range" bands, calorie or TDEE estimates.
- Time-range switch (1 / 3 / 6 months), zoom, scrub, tooltip, tappable dots, moving-average or forecast line, comparing two metrics.
- Editing an entry, a note field, a time of day, entering several metrics in one form.
- lb / in on this route. The questionnaire does store a unit preference (`onboarding.unit.metric` = "Metrikus (kg / cm)", `onboarding.unit.imperial` = "Angolszász (lb / in)"), but Haladás ignores it: it always reads and writes kg / cm / %. No unit switch here.
- A "starting weight" row, label or first chart point taken from the questionnaire: the weight typed in onboarding is never written to the measurements. The chart starts at the first reading recorded on this screen.
- Reminders to weigh in, streaks, coins or achievements for measuring, a centre "+" in the tab bar.
- Photo viewer / lightbox, before-after slider, side-by-side, pose picker (front / side / back), in-app camera with overlay, multi-upload, captions, export, collage, face blur.
- Per-photo or per-metric sharing, public or timed share links, sharing with friends, a confirm dialog on the switches, a "coach requested access" row, a notification when the coach looks.
- Filters, search or export on the access log.
- Strength progress on this route: PR list, per-exercise charts, workout history, volume — member-side they do not exist.
- Apple Health / Google Fit / smart-scale sync, import, CSV / PDF export.
- A bell, a back arrow, a settings gear or any header action on this screen.

## Notes for the designer

- **Open Field vs the code.** The code is built from boxes and fills: every block sits in a card (chart, each summary, record form, entries, add-photo, each coach block, access log); the switch is a filled track with an accent-filled selected segment; the summaries sit under tinted icon pucks; three section headings (Mérés rögzítése, Ki láthatja, Ki nézte meg) carry a small icon badge (plus / shield-check / eye) while Bejegyzések and Fotó hozzáadása do not; the break marker is a filled warning chip; both empty states sit under a 120 px tinted icon disc (line-chart, camera); the chart line, dots and fade are accent-coloured; Mentés is accent-filled. In V1 only Mentés may be the lime pill: draw the switch as the neutral selection (text-1 label + thin ink underline — the brief's `selected-neutral`; no approved frame contains a segmented control yet, so this is its first appearance), the summaries as bare figures, the break marker as plain warning-toned text, the headings as the kit's eyebrow, and delete / revoke as danger TEXT or glyph actions with no fill. The approved Profil sparkline is neutral ink, not lime — keep the big chart in the same ink so the lime stays with Mentés and the lit tab. On Fotók the only action is "Fájl választása" (a bordered secondary in code) — whether it takes the pill there is a design decision.
- **Keep it one story with the approved Profil.** Profil already shows "TESTSÚLY · sparkline · 83,1 kg ›" with a dotted stretch for the break and an end dot. The chart here is that line grown up: same value, same break treatment, plus the "25 nap kihagyás" label. (That Profil row is also a second door to this screen that the live app does not have.)
- **Fold.** The spec wants the record form above the fold; four summaries in a 2 × 2 block push it under. Four figures across is the same shape as Home's macro row (value + unit, caption) without bars.
- **Metric picker options, in order (15):** Testsúly · Testzsír · Nyak · Váll · Mellkas · Derék · Csípő · Comb (bal) · Comb (jobb) · Vádli (bal) · Vádli (jobb) · Kar (bal) · Kar (jobb) · Alkar (bal) · Alkar (jobb). Units: kg, %, then cm for the other 13. It is a native select today; a custom sheet would be a new component (15 rows).
- **Long strings.** "Minden hozzáférés visszavonása" (30 characters) as one action · the privacy sentence wraps to 2–3 lines and "SENKI" is capitals in the source — keep it · the delete-sheet body is 3–4 lines · the out-of-range sentence is 2–3 lines and sits under a narrow value field in code: give it the full width · the too-few-readings sentence is 3 lines · "Az összehasonlításhoz legalább kettő kell, ugyanabban a pózban." 2 lines.
- **Three date formats on one route**, all without a key: raw ISO (2026-10-08) on the axis, summaries, entries and photo tiles; the phone's own format inside the native date field (iOS 2026. okt. 9. · Android 2026. 10. 09.); device-locale date + time with seconds in the access log. Draw them as they are or flag one format as a cleanup — do not silently invent "okt. 8.".
- **One person, two names on Megosztás:** the coach block prints the display name (Kovács Péter), the log prints the e-mail local part (kovacs.peter).
- **Numbers.** Decimal comma, at most one decimal, a space before the unit (83,1 kg · 18,6 % · 87,5 cm). The code prints the delta through locale formatting (a plain hyphen in Hungarian: -5,3); a true minus (−5,3) is the intended glyph. The scale values are the data's own max / middle / min, so they are never round.
- **Checkbox vs switch.** The two sharing controls are checkboxes on purpose in code ("stays a checkbox until someone chooses otherwise on the record"). Using the kit's Switch matches Profil but is an owner decision — flag it, do not decide it silently.
- **Sample values.** Latest values are feature-inventory §6.9; the dates, counts (26 / 8 / 4 / 2 / 2 readings), the 25-day break, the share (measurements on, photos off) and the five log rows are computed from the demo seed for the reference day. Single weights between the ends are illustrative (the seed adds about ±0,45 kg of noise). The seed has 42 readings; the list shows 30.
- **Product gaps worth a question to the owner** (do not design around them silently): no way to create the first share; nothing on the coach side uses the consent; a failed load looks like an empty account; every failed save says "out of range" and every failed upload (also a too-large file or no network) says "Csak JPEG, PNG vagy WebP kép tölthető fel."; failed deletes and share changes say nothing at all; entries older than the newest 30 cannot be seen or deleted; a member who chose lb / in in the questionnaire still gets kg / cm here.
