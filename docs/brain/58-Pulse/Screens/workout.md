---
type: screen-inventory
title: Edzéslejátszó — screen inventory
updated: 2026-10-11
route: "/workout"
tags: [ux, screen, inventory, pulse]
---

# Edzéslejátszó — `/workout` · member, coach, admin (identical, no role gate) · from Home "Indítás" / "Folytatás" or the "Edzés" tab · lit tab: Edzés (2nd of 5 / 6 / 7)

"Edzéslejátszó" is the brief's name; the screen prints no title of its own (no key). The tab label is `nav.workout` = "Edzés". The h1 is the current exercise name.
Sources read 2026-10-10: `features/workout/*` (WorkoutPlayer, SetRow, RestTimer, IntervalStage, useWorkout, useIntervalTimer, intervalPlan, cues), `ui/muscle-map/MuscleMap.tsx`, `ui/feedback/ToastHost.tsx`, `ElementStyleProvider.tsx`, `backend/src/logs/routes.js`, `plans/routes.js`, `PlanEditorPage.tsx`, `seed-demo.mjs`, migrations 002 / 012.
Status words: **live** = in code and reachable · **live (variant)** = in code, shown only when the admin's Style Studio variant is switched · **planned** = spec / key / endpoint only · **cut**.

## Purpose

The screen a lifter holds one-handed between sets: record what was just lifted (kg × reps), see what was done last time, see which muscles the movement works, rest, move to the next exercise. Layout law from the spec that is behaviour, not styling: **the page never scrolls** — hero, title, set list, switcher are one fixed viewport; only the set list scrolls, and no state may change a row's height.
**The ONE primary action: check the active set** (`workout.check` = "Kész", icon-only button on the first pending row). It is the screen's only lime-filled shape.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Hero: read-only muscle figure | live | Current exercise's muscles from `GET /exercises/:id`: primary = lit, secondary = half-lit, rest idle. Never tappable. Fixed height (34 % of the viewport) on every exercise, also when empty. Opens on the FRONT view; no auto-switch to the side that holds the primary muscle, and no "other side" caption here. | accessible title `muscleMap.frontTitle` = "Izomtérkép, elülső nézet" · `muscleMap.backTitle` = "Izomtérkép, hátsó nézet" | Back view: Széles hátizom lit. Front view: Bicepsz + Oldalsó vállizom half-lit |
| View switch | live | Two options, one track; local state | `muscleMap.front` = "Elöl" · `muscleMap.back` = "Hátul" · group name `muscleMap.viewLabel` = "Nézet" | Hátul selected |
| Legend | live | Two keys, shown only when at least one muscle is lit | `muscleMap.primary` = "Fő célizom" · `muscleMap.secondary` = "Segédizom" | both |
| Hero toggle chip | live | Swaps figure ↔ a neutral stand-in mark (there is NO exercise media). Label names the OTHER view and carries a small leading glyph in code: a play triangle beside "Videó", a standing figure beside "Izomtérkép". Inert (not faded) when the movement has no linked exercise. Hidden while an interval timer runs. | `workout.showMedia` = "Videó" · `workout.showMuscles` = "Izomtérkép" | Videó |
| Exercise title (h1) | live | `exercise_name_snapshot`, one line, truncated. Fallback only when the session has no exercise. The session / plan name is NOT shown anywhere. | fallback `workout.freestyle` = "Szabad edzés" | Előredőlt evezés rúddal |
| Exercise counter | live | current index / exercise count; no action | no key (hard-coded "n / N") | 1 / 5 |
| Set list header | live | 5 columns: index · previous · weight · reps · (check) | "#" (no key) · `workout.previous` = "Előző" · `workout.kg` = "kg" · `workout.reps` = "ism." · list name `workout.sets` = "Sorozatok" | # · Előző · kg · ism. |
| Set row — pending | live | Index; previous session's value for this exercise + set index (warm-ups excluded; "—" when none, "× 6" when it had no weight); weight field (decimal, comma or dot accepted); reps field (digits). The prescription is a PLACEHOLDER only, never a pre-filled value; with no target the placeholder is the unit word. Check button (secondary look). | field names `workout.weight` = "Súly", `workout.reps` = "ism." · button `workout.check` = "Kész" · "kg", "×", "—" in the previous cell are hard-coded | 4 · 72,5 kg × 7 · [70] · [6] · ✓ |
| Set row — active | live | The first pending row: marked as "the one you are on" (ring, circled index) and its check is the primary. Tap = `POST /sets/:id/check` with what was TYPED (the placeholder is never sent). The button is never disabled for empty fields, but the server refuses a set without reps, so a tap on a row still showing only placeholders ends as a failed check (see Notes). Busy state on the button; every row is disabled while one check is in flight. | `workout.check` = "Kész" | 3 · 72,5 kg × 7 · [70] · [6] · lime ✓ |
| Set row — recorded | live | Values as recorded, both fields locked, a lock glyph in the weight field (= frozen on the server), a check glyph instead of the button. No action. | sr `workout.recorded` = "Rögzítve" | 1 · 72,5 kg × 8 · 80 · 6 · ✓ |
| Exercise switcher | live | One horizontally scrolling row, one item per exercise: name (truncated at 128 px) + done/total of non-voided sets + a tick when complete. Tap = show that exercise. Current one marked. The only way to change exercise (no swipe, no auto-advance). | row name `workout.exercises` = "Gyakorlatok" · counts hard-coded "d/t" | Előredőlt evezés rúddal 2/4 · Húzódzkodás 0/4 · Széles fogású hátlehúzás 0/3 · Bicepszhajlítás 0/3 · Arcig húzás 0/3 |
| Rest timer | live | Starts by itself after a successful check, from that set's prescribed rest (nothing starts when the set has none). Pinned above the tab bar, never over it. Clock m:ss from a wall-clock deadline, draining ring, the NEXT EXERCISE's name (absent on the last exercise), one skip control. Gone when not running. | `workout.nextUp` = "Következik" (rendered "Következik: {name}") · skip `workout.skipRest` = "Pihenő átugrása" | 2:47 · Következik: Húzódzkodás · ✕ |
| Empty state (no session) | live | One centred mark, h1, body. Deliberately NO action — starting lives on Home. | `workout.noneTitle` = "Most nincs futó edzés" · `workout.noneBody` = "Indíts egyet a mai napból, vagy csinálj szabad edzést." | as copy |
| Bottom navigation | live | Edzés lit. Rest timer and toast must clear it. | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.profile` = "Profil" | member, 5 tabs |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Personal record on a row | live | When a check earns a record: the row keeps a trophy in place of the check glyph for good (survives reload); for 1.4 s a caption floats over the index + previous cells saying which record (one kind only: the first earned, e1rm before rep_max). Kinds the server can emit: e1rm, rep_max, max_hold, max_distance — but from the UI only e1rm and rep_max are reachable (the row sends kg + reps only, never seconds or distance, and interval rounds earn no records), so "leghosszabb tartás" / "leghosszabb táv" appear only for API-written sets. Also a haptic pattern and a spoken line. | `workout.newRecord` = "Új rekord: {{kind}}" · `workout.record.e1rm` = "becsült 1RM" · `workout.record.rep_max` = "ismétléses csúcs" · `workout.record.max_hold` = "leghosszabb tartás" · `workout.record.max_distance` = "leghosszabb táv" | 3 · 82,5 · 6 · trophy · "Új rekord: becsült 1RM" |
| Record toast | live | One toast at the TOP of the viewport (the bottom is the rest timer and the thumb path), trophy, self-dismissing, dismiss X. Message is the bare phrase. | `workout.recordSpoken` = "Új rekord" · dismiss `common.dismiss` = "Bezárás" | Új rekord |
| Failed check | live | A danger chip floats over the trailing end of the row (never a new line) + one action: retry, or undo for a conflict. Announced as an alert. | `workout.checkFailed.conflict` = "Már rögzítve, más értékkel" · `workout.checkFailed.offline` = "Nincs kapcsolat" · `workout.checkFailed.failed` = "Nem sikerült rögzíteni" · `common.retry` = "Újra" · `workout.undo` = "Visszavonás" | Nincs kapcsolat · [Újra] |
| Withdrawn row | live (reached only through undo: the conflict chip's "Visszavonás", or the variant-E pill) | A voided set: dimmed, a rule through the full row, fields locked (they keep the recorded values, no lock glyph), the "Előző" cell stays, no check control, a word at the trailing end. Terminal — it can never be checked again; its trophy goes with it. | `workout.withdrawn` = "Visszavonva" | 2 · 72,5 kg × 9 · 80 · 6 · Visszavonva |
| Undo pill | live (variant E21-E; server default is A) | For 6 s after a check a pill over the row's trailing end takes the set back (`POST /sets/:id/void`) and stops the rest. | `workout.undo` = "Visszavonás" | — |
| Hold-to-confirm hint | live (variant E21-B) | The check needs a 0.55 s hold with a fill sweep; the instruction straddles the active row's bottom edge. | `workout.holdToCheck` = "Tartsd nyomva a rögzítéshez" | — |
| Swipe-weight | live (variant E21-C) | Dragging a pending row sideways changes the weight by 2,5 kg per 18 px. No copy. | — | — |
| Rest timer variants | live (variant E22-B / C) | B: a centred chip with only the clock + ✕. C: a draining hairline under the status bar, no skip, NO printed text at all. | C's screen-reader name only (never printed): `workout.restRemaining` = "Pihenő: {{time}}" | sr: Pihenő: 2:47 |
| Interval timer chip | live (interval blocks only) | Bottom-left of the hero, only when the current exercise is in a circuit / EMOM / AMRAP block; swaps the hero for the interval stage. Hidden while the timer runs. | `workout.showTimer` = "Időzítő" | Időzítő |
| Interval stage (inside the hero, never full-screen) | live (see Notes: a RUNNABLE block exists only with API-authored prescriptions — the demo seed has no circuit / EMOM / AMRAP block, so the sample here is illustrative; through the UI only the "not configured" state below is reachable) | Phase word in its phase colour, countdown m:ss, progress bar, info line (round + next member), three icon controls (pause / resume, skip, stop). A finished work segment records that round's set by itself. 10 s prepare before the first round. | `workout.interval.title` = "Intervallum" · `workout.interval.start` = "Indítás" · `workout.interval.prepare` = "Felkészülés" · `workout.interval.work` = "Hajrá" · `workout.interval.rest` = "Pihenő" · `workout.interval.pause` = "Szünet" · `workout.interval.resume` = "Folytatás" · `workout.interval.skip` = "Átugrás" · `workout.interval.stop` = "Leállítás" · `workout.interval.done` = "Kész" · `workout.interval.round` = "{{round}}. kör / {{total}}" · `workout.interval.nextExercise` = "Következik: {{name}}" · region `workout.interval.stageLabel` = "Intervallum-időzítő" | Hajrá · 0:32 · 2. kör / 3 · Következik: Fekvőtámasz |
| Interval warnings | live | Under the controls: screen may lock; rounds whose upload failed (the block does not stop). | `workout.interval.wakeLockLost` = "A képernyő elalhat" · `workout.interval.unsent` = "{{count}} kör nem ment el" | 1 kör nem ment el |
| Interval interrupted prompt | live | Replaces the stage when the phone suspended the app across whole rounds: the lifter decides. Left = credit the rounds and continue (primary), right = record nothing and stay paused. | `workout.interval.interrupted` = "Az időzítő megszakadt" · `workout.interval.interruptedBody` = "A telefon {{count}} kör idejére felfüggesztette az appot. Ezeket nem rögzítettük." · `workout.interval.confirmRounds` = "Végigcsináltam" · `workout.interval.discardRounds` = "Itt megállok" | count 2 |
| Interval not configured | live | A block with no durations says so instead of guessing. | `workout.interval.notConfigured` = "Ehhez a blokkhoz nincs megadva időtartam" | — |
| Offline strip (app shell) | live | Above the screen; set checks are the only writes that queue. | `offline.title` = "Nincs internetkapcsolat" · `offline.queued` = "{{count}} művelet vár feltöltésre" | 3 művelet vár feltöltésre |
| Non-visual cues | live | Per event: set check = vibration only · record = vibration + speech · rest over = vibration + speech · interval work / rest / block end = vibration + beep + speech · interval prepare = speech only · interval 3-2-1 = vibration + beep. The beep exists ONLY in interval blocks. Each channel is switched in Profil. Not drawable, but the reason no state relies on being watched. | spoken: `workout.recordSpoken` = "Új rekord" · `workout.restOverSpoken` = "Pihenő vége" · `workout.interval.spokenPrepare` = "Felkészülés" · `workout.interval.spokenWork` = "Hajrá, {{round}}. kör" · `workout.interval.spokenRest` = "Pihenő" · `workout.interval.spokenDone` = "Blokk kész" | — |
| Finish / abandon the session | planned (backend only) | `POST /workouts/:id/finish` (duration, effort 1–10, notes) and `/abandon` exist; no hook, no button, no key. A started session can never be closed from the UI. | no key | — |
| Seconds / distance entry on a set | planned | Timed and distance sets (e.g. Plank 45 s) still get the kg + ism. fields; seconds are only written by the interval timer, so by hand such a set can only be recorded as a number typed into "ism.". | `workout.seconds` = "mp" · `workout.metres` = "m" (used only on the coach's client screen) | — |
| EMOM / AMRAP / set-break extras | planned (keys only, nothing renders) | — | `workout.interval.emomDone` = "Kör kész" · `workout.interval.amrapCap` = "Időkeret: {{total}}" · `workout.interval.amrapEnter` = "Írd be a teljesített körök számát" · `workout.interval.setBreak` = "Blokkszünet" · `workout.interval.setBreakLength` = "Blokkszünet hossza" · `workout.interval.retry` = "Újraküldés" · `workout.interval.failed` = "A(z) {{round}}. kört nem lehet rögzíteni" · `workout.interval.blockTooLong` = "Ez a blokk túl sok kört tartalmaz (max. 50)" · spoken, never called: `workout.interval.spokenSetBreak` = "Blokkszünet" · `workout.interval.spokenResume` = "Folytatjuk" | — |
| Removed on purpose | cut | (1) The "muscles on the other side" caption — never shown in the player. (2) The "Időzítő" chip on straight-set exercises. (3) An undo control drawn permanently on every recorded row. (4) A session-volume record on a row (key exists, the server attaches no such trophy to a set). (5) A best-time record (key and schema value exist, no code emits it). | `muscleMap.alsoOnOtherSide` = "További célizmok a {{side}} nézetben." · `workout.record.session_volume` = "edzés-össztérfogat" · `workout.record.best_time` = "legjobb idő" | — |

## States

| State | What is on screen |
|---|---|
| Loading | The SAME four-part geometry as the loaded screen, as blocks: hero block, title bar + counter block, four 56 pt row blocks, three chip blocks. Never a spinner. sr text `common.loading` = "Betöltés". |
| No session | Empty state: "Most nincs futó edzés" + body, no action. Also what a failed `GET /workouts/current` shows (no error copy, no retry). |
| Session without exercises (API-only freestyle) | h1 "Szabad edzés", counter "1 / 0", stand-in hero with an inert "Izomtérkép" chip, empty list, empty switcher. |
| Hero = figure (default) | Front view first. Chip reads "Videó". |
| Hero = stand-in | After tapping "Videó", or when the movement has no linked exercise: a neutral mark at hero scale; chip reads "Izomtérkép" (inert in the second case). |
| Hero = interval stage | Sub-states: idle ("Intervallum" · "3. kör / 3" · [Indítás]) · prepare "Felkészülés" · work "Hajrá" · rest "Pihenő" · paused "Szünet" (skip disabled) · done ("Kész" · [Indítás]) · interrupted · not configured. Both hero chips disappear while it counts. |
| Row states | pending · active · busy · recorded · recorded-blank · record (flash, then permanent trophy) · withdrawn · failed-offline · failed-conflict · failed-other. One problem per row; overlays float, the list never reflows. Recorded-blank is real but narrow: every round the interval timer records by itself is a locked row whose kg / ism. fields show only the grey placeholder (the seconds it stored are shown nowhere), and a set recorded with reps only has a blank kg field. A HAND check with the reps field empty is never recorded: the placeholder is not sent, the server refuses a completed set without reps, and the row lands in failed-other ("Nem sikerült rögzíteni" + "Újra") until reps are typed — no copy says why. |
| Rest running | Timer above the tab bar; it covers the switcher row in the live build. |
| Rest over | Timer disappears; vibration + "Pihenő vége" spoken; the next pending row is scrolled into view (never focused — no keyboard pops up). |
| Offline | Shell strip; a check is queued and the row shows "Nincs kapcsolat" + "Újra" until the queue drains, then turns recorded. |
| Opening the screen again | Always opens on exercise 1 (the selected exercise is not remembered), with no rest timer. |
| Role / device | No role variant. An iPhone PWA has no vibration: speech is then the only non-visual cue in a straight-set session (check itself is silent), speech + beep in an interval block. |

## Frames to draw

Shared session (real plan-day values from `seed-demo.mjs`; the seed's own live session has only the first four exercises, a real start materialises all five). Decimal comma everywhere.
The row values are the seed's too: rows 1–2 are the two sets the seed pre-records (80 × 6, written without record events, hence plain checks), "Előző" is the previous Friday's deload session (72,5 kg; reps 8 · 9 · 7 · 7 are one valid draw of the seed's random range), and 82,5 × 6 (estimated 1RM 99 kg) beats every best the seed can produce (at most 77,5 × 8 ≈ 98,2 kg), so frame 2's record is earned.

| # | Exercise (as displayed in the library · English snapshot) | Sets | Placeholder kg / ism. | Rest | Muscles (importer mapping, DB not opened) |
|---|---|---|---|---|---|
| 1 | Előredőlt evezés rúddal · Bent Over Barbell Row | 4 | 70 / 6 | 3:00 | primary Széles hátizom · secondary Bicepsz, Oldalsó vállizom |
| 2 | Húzódzkodás · English snapshot not verified (the seed picks the shortest catalogue name containing "pull-ups", which "Pullups" does not; "Pull-ups" also composes to Húzódzkodás) | 4 | kg / 5 (bodyweight: no target weight) | 2:30 | not verified (the catalogue's "Pullups" row would be primary Széles hátizom · secondary Bicepsz; the row the seed really picks may differ) |
| 3 | Széles fogású hátlehúzás · Wide-Grip Lat Pulldown | 3 | 55 / 10 | 1:30 | primary Széles hátizom (secondaries not recorded) |
| 4 | Bicepszhajlítás · English snapshot not verified (the seed picks the shortest catalogue name containing "biceps curl"; a longer match would add an equipment word, e.g. "Bicepszhajlítás rúddal") | 3 | 15 / 10 | 0:45 | not verified (expected primary Bicepsz) |
| 5 | Arcig húzás · Face Pull | 3 | 20 / 15 | 1:15 | not verified — draw the stand-in or skip |

**Frame 1 — "Player · set 3 of 4"** (session running, no rest timer: what a member sees on coming back, plus ONE tap on "Hátul" — the screen itself always opens on "Elöl"). Top to bottom:
1. Status bar 9:41. No header, no back control, no session title.
2. Hero: the mannequin, BACK view, only the lats lit. View switch "Elöl" · "Hátul" (Hátul selected). Legend "Fő célizom" · "Segédizom". Trailing control "Videó".
3. Title row: "Előredőlt evezés rúddal" (display face → upper-case) · counter "1 / 5".
4. Column header: "#" · "Előző" · "kg" · "ism." · (blank).
5. Row 1 recorded: 1 · 72,5 kg × 8 · 80 (lock) · 6 · check glyph.
6. Row 2 recorded: 2 · 72,5 kg × 9 · 80 (lock) · 6 · check glyph.
7. Row 3 ACTIVE: 3 · 72,5 kg × 7 · placeholder 70 · placeholder 6 · the lime check button (the only filled lime shape).
8. Row 4 pending: 4 · 72,5 kg × 7 · placeholder 70 · placeholder 6 · quiet check control. (A fifth row would be cut by the fold; here there are only four.)
9. Switcher: "Előredőlt evezés rúddal 2/4" (current) · "Húzódzkodás 0/4" · "Széles fogású hátlehúzás 0/3" cut by the right edge (the cut says it scrolls).
10. Tab bar: Kezdőlap · Edzés (lit) · Étkezés · Haladás · Profil.

**Frame 2 — "Player · record + rest"** (one second after checking set 3 with 82,5 × 6):
1. Toast under the status bar: trophy · "Új rekord" · ✕.
2. Hero, title row, column header as frame 1.
3. Rows 1–2 as frame 1.
4. Row 3 RECORD: trophy instead of the check glyph, 82,5 (lock) · 6, caption over the index + previous cells: "Új rekord: becsült 1RM".
5. Row 4 ACTIVE: 4 · 72,5 kg × 7 · placeholder 70 · placeholder 6 · lime check button.
6. Switcher: "Előredőlt evezés rúddal 3/4" · "Húzódzkodás 0/4" · …
7. Rest timer above the tab bar: "2:59" (of 3:00, ring still practically full) · "Következik: Húzódzkodás" · ✕. The three things in this frame only coexist in its first second: the row caption lives 1.4 s and the toast 4 s, so a visibly drained clock such as "2:47" belongs to a later moment that has neither.
8. Tab bar, Edzés lit.

**Frame 3 — "Player · no session"** (the "Edzés" tab before any start):
1. Status bar. 2. Centred: one calm mark or still · h1 "Most nincs futó edzés" · body "Indíts egyet a mai napból, vagy csinálj szabad edzést." · NO button, NO link. 3. Tab bar, Edzés lit.

Not frames but needed on the system page's state board (70:2): the loading skeleton, the three failed-check chips with "Újra" / "Visszavonás", the withdrawn row ("Visszavonva"), the interval stage (idle, work, interrupted, not configured).

## Images

| Could help | Why / constraint |
|---|---|
| The mannequin, back view, with ONLY the lats lit; front view with Bicepsz + Oldalsó vállizom half-lit | It is the hero and the only non-number on the screen. Existing `assets/pulse/figure-back-pull.png` lights traps + rear delts + lats together at full lime — that is three muscles, not this exercise's one primary. Needs the neutral base + per-muscle light, two levels (lit / half-lit). |
| A neutral stand-in for "no figure" (hero-sized, graphite, on-family) | Replaces the old dumbbell glyph; must read as "nothing to show", not as a broken image or as exercise media. |
| Empty-state still (e.g. empty rack hooks, monochrome) | Optional; the brief ties it to an owner decision. Text alone is acceptable. |

Must NOT be shown as if it existed: any exercise photo, video, GIF, thumbnail or play button over the hero (the catalogue has zero media; "Videó" only reveals the stand-in; the play glyphs that do exist in code are control labels, never media: inside the "Videó" chip, on the interval stage's "Indítás" / resume controls, and as the no-session mark) · a coach photo or member avatar · equipment photos keyed to the exercise (the session payload has no equipment) · the old vector anatomy drawing (rejected by the owner).

## Do not invent

- Finish / "end workout" button, summary or celebration screen, abandon confirm, close ✕ or back arrow, a top bar. You leave through the tab bar; the session stays open.
- Session title, plan name, elapsed session clock, total volume, calories, heart rate, a whole-session progress bar or percentage.
- Add / remove a set, add / swap / reorder an exercise — no API on a running session.
- RPE or notes per set, tempo, coach notes, a rep RANGE ("6–8": only the lower bound reaches the player), warm-up badges (set kind is not rendered), superset grouping or the block label ("Bicepsz + hátsó váll" is not in the payload; a superset is two ordinary exercises).
- Rest controls beyond skip: no +15 s / −15 s, pause, restart or manual start.
- kg / lb switch, plate calculator, 1RM figures, per-exercise charts or history beyond the "Előző" cell.
- "Tabata" as a block type; an AMRAP round counter or time-cap line; an EMOM "round done" button.
- Tappable muscles, muscle-name chips, or a link to the exercise detail from the player.
- A start button, freestyle start or library link on the empty state.
- Swipe between exercises, auto-advance to the next exercise, remembering the last exercise.
- Confetti, coin or achievement toasts — the record toast is the only celebration.

## Notes for the designer

- **Exercise names are English in the live player.** The title and switcher print the plan's name snapshot, which is the catalogue's canonical English name ("Bent Over Barbell Row"), not the Hungarian name the library shows. The frames above use the Hungarian names; keep one English variant to test length. Decision for the owner / a frontend fix.
- **Tap or hold is undecided in code.** The server seed serves E21 = A (tap, no hint); the client fallback and the old mockups say B (hold + "Tartsd nyomva a rögzítéshez"). Frames 1–2 draw A. With A there is also NO undo after a check (undo is variant E, or the conflict chip).
- **The rest timer needs seed / API prescriptions; a running interval stage needs API ones.** The live coach plan editor adds every exercise as 3 × 8 with no weight, no rest and no seconds, and offers only Egyszerű / Szuperszett / Kör blocks. A plan built in the UI therefore gives rows with placeholders "kg" and "8", never starts a rest, and its circuit shows "Ehhez a blokkhoz nincs megadva időtartam". EMOM and AMRAP exist through the API only, and the demo seed contains no interval block of any kind (its rests, weights and rep targets are real).
- **The lime check fails on an untouched row.** Targets are placeholders, the check sends only typed values, and the database refuses a completed set that has no reps: tapping the check on frame 1's row 3 exactly as drawn (placeholders 70 / 6, nothing typed) gives "Nem sikerült rögzíteni" + "Újra", and "Újra" keeps failing until reps are typed. Same result when a kg value is typed on a bodyweight movement (Húzódzkodás in this session: its kg field is drawn and editable, but the server accepts no weight there). No empty-field hint or copy exists. Frames stay faithful (the lifter types, then taps); flag both to the owner.
- **"Következik" names the next EXERCISE, not the next set.** In code the rest card always prints the following exercise in the list, even while sets of the current one remain — frame 2 shows exactly that ("Következik: Húzódzkodás" with set 4 of the row still to do). Faithful to live; flag to the owner.
- **Two things want the lime at once.** In code the active row's check AND the stage's "Indítás" / "Végigcsináltam" are both primary. Pulse allows one lamp: pick one rule (suggested: the stage owns it while the stage is on screen).
- **Semantic colours in code:** recorded = success, record = warning (gold), failures = danger, interval phases prepare = warning · work = accent · rest = success · set-break = info · paused = text-2. Every one of these also differs by shape or word (check / trophy / rule + "Visszavonva" / chip) — keep that; never hue alone.
- **Long strings:** "Közepes fogású fekvenyomás rúddal" (33) and "Széles fogású hátlehúzás" as a one-line h1 beside the counter; "Már rögzítve, más értékkel" + "Visszavonás" must fit over one 56 pt row at 354 pt; "A telefon 2 kör idejére felfüggesztette az appot. Ezeket nem rögzítettük." + two buttons inside the hero; "Következik: Széles fogású hátlehúzás" beside the clock; the record caption — the live pill is capped at 128 pt and cuts even "Új rekord: becsült 1RM", so size it for the longest reachable phrase "Új rekord: ismétléses csúcs" (27) without covering the weight field.
- **The empty-state body promises a freestyle workout nobody can start** ("…vagy csinálj szabad edzést."). Copy of record, quote as is; flag to the owner.
- **Decimal marks disagree in the live row:** recorded weights print "62,5", the "Előző" cell and the placeholder print "62.5". Draw the comma everywhere.
- **Default view vs a pull day:** the figure opens on "Elöl", where a row or pull-up lights only the assisting muscles. Frame 1 draws "Hátul" deliberately; an auto-pick of the side with the primary muscle would be new behaviour.
- **Fixed-height budget:** live values are hero 34 % of the viewport, rows 56 pt with 44 pt fields and a 44 pt check, switcher chips 44 pt. At 402 × 874 that leaves three to four rows; the rest timer must sit above the tab bar without covering the active row's check.
- **Coach / admin:** same screen with 6 / 7 tabs (Edzés stays second). Coach persona Kovács Péter has no session of his own in the sample set — draw the member only.
