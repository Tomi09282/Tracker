---
type: screen-inventory
title: Tervszerkesztő — screen inventory
updated: 2026-10-11
route: "/coach/plans/:id"
tags: [ux, screen, inventory, pulse]
---

# Tervszerkesztő — `/coach/plans/:id` · coach and admin · from the plan list, a client's "Terv" tab, or automatically after "Új terv" / a clone · bottom tab lit: Edző

"Tervszerkesztő" is the brain spec's name only: it has no key in hu.json and never appears on screen. The visible title is the plan's own name. Sources: `frontend/src/features/plans/PlanEditorPage.tsx`, `usePlans.ts`, `useOnline.ts`, `app/navTabs.ts`, `backend/src/plans/routes.js`, `backend/scripts/seed-demo.mjs`.

| Fact | Value |
|---|---|
| Roles | coach (6 tabs), admin (7 tabs) — tab `nav.coach` = "Edző" is lit in both (it owns every `/coach/…` path). A member who opens the URL gets the "not available" state below, not a forbidden screen. |
| Door 1 | Coach dashboard link `nav.plans` = "Tervek" → plan list `/coach/plans` → tap a plan row |
| Door 2 | Plan list button `plans.newPlan` = "Új terv" → creates a draft named `plans.defaultName` = "Új terv" and lands here with the name focused and fully selected |
| Door 3 | Client detail → tab `coaching.tab.plan` = "Terv" → tap a plan |
| Door 4 | Inside this screen: choosing a clone target navigates to the new copy's editor |
| Way out | The back link always goes to `/coach/plans`, wherever the coach came from |

## Purpose

The coach builds the programme here: days inside a repeating cycle, blocks inside a day, exercises inside a block — and hands a plan to a client as an independent deep copy. Every structural edit (add, delete, reorder) is sent the moment it is tapped; nothing waits for a save.

**The ONE primary action (the only primary-style control in the code):** `common.save` = "Mentés", a small pill top right. It commits only the plan name and the status, and it is disabled whenever neither differs from the server. At rest this screen therefore has NO lit lime pill — that is honest and should stay so.

## Elements

### MUST

| Element | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|
| Back link | Left arrow + label → `/coach/plans` | `plans.title` = "Edzéstervek" | Edzéstervek |
| Save pill | Enabled only when name or status is pending; busy while the PATCH runs; disabled offline | `common.save` = "Mentés" | Mentés (disabled) |
| Plan name | The title IS a single-line text input (max 120 chars); typing over it renames the plan after "Mentés". Not announced visually as a field at rest | aria-label `plans.newName` = "Új terv neve" (not visible) | Felső/alsó szplit – 12 hetes blokk |
| Meta line | Status word (tap → status sheet) · revision counter (read-only). The counter is a change token, not a count of saved versions: it starts at 1 and a DB trigger adds 1 for every day, block, exercise row or per-set target that is added, changed or deleted — so any built plan shows a two- or three-digit number | `plans.status.active` = "Aktív" · `plans.revision` = "{{n}}. változat" | Aktív · 52. változat (the seed's real value for this plan: 1 + 7 days + 17 blocks + 19 exercise rows + 8 per-set targets) |
| Cycle strip | One slot per cycle position (`cycle_days`, 1–56, default 7), numbered 1…N. Three slot kinds: training day (dumbbell glyph today), rest day (moon), empty (plus, dashed). Tap a filled slot = open / close that day in the list below (slot lights in accent); tap an empty slot = create the day at once, named "N. nap" | slot numerals hard-coded; slot aria `plans.addDay` = "Nap hozzáadása" + `plans.dayIndex` = "{{n}}. nap" | 1 train · 2 rest · 3 train · 4 rest · 5 train · 6 train · 7 rest |
| Strip caption | Cycle length · count of non-rest days | `plans.cycle` = "{{days}} napos ciklus" · `plans.trainingDayCount` = "{{count}} edzésnap" | 7 napos ciklus · 4 edzésnap |
| Day row | Glyph (training / rest) · day name · caption "N. nap · start time" · chevron (down closed, up open) · trash. Tap row = open / close (one day open at a time). Trash = delete the day with everything in it, immediately, then an undo toast | `plans.dayIndex` = "{{n}}. nap" · `plans.noTime` = "nincs időpont" · aria `plans.deleteDay` = "Nap törlése" | Felsőtest – húzás / 5. nap · 18:00 — Pihenőnap / 2. nap · nincs időpont |
| Block header (inside an open day) | Kind label (+ rounds when set) and four icon controls, always visible: collapse / expand, move up, move down, delete. First block: up disabled; last: down disabled | `plans.blockKind.single` = "Egyszerű" · `plans.blockKind.superset` = "Szuperszett" · `plans.blockKind.circuit` = "Kör" · `plans.rounds` = "{{n}} kör" · aria: `plans.collapseBlock` = "Blokk össze- és kinyitása", `plans.moveUp` = "Feljebb", `plans.moveDown` = "Lejjebb", `plans.deleteBlock` = "Blokk törlése" | three separate headers: "Egyszerű" — "Szuperszett" — "Kör · 3 kör" |
| Exercise row | Name (one line, truncates) over the target line `sets × reps[–max][ · load unit]` (format hard-coded, no key). Trash always visible. Tap or focus the row = "selected": two reorder arrows appear before the trash (first item: up disabled; last: down disabled) | aria `plans.removeExercise` = "Gyakorlat eltávolítása", `plans.moveUp` = "Feljebb", `plans.moveDown` = "Lejjebb" | Előredőlt evezés rúddal / 4 × 6–8 · 70 kg — Húzódzkodás / 4 × 5–8 |
| Add exercise | Full-width quiet control with a plus, at the foot of every expanded block. Tap = it is REPLACED in place by the picker | `plans.addExercise` = "Gyakorlat" | + Gyakorlat |
| Exercise picker (inline, not a sheet) | Search field with its label printed above it (autofocus; no placeholder, no magnifier, no clear control) · up to 12 results inside their own scroll area, at most 432 pt tall (27 rem) — about four and a half rows show, the rest scroll inside it. **Each result is led by a read-only mannequin (72 pt tall, 34 wide, the back view when most of the primary muscles are on the back, otherwise the front) with the exercise's primary muscles lit and its secondary ones in the weaker step, and carries two lines: the name, and the muscle names (primary in `text-2`, secondary dimmer after a dot; "Nincs izom megadva" when none are recorded). The figure mounts only when its row is near the visible part of the box (performance). OWNER OVERRIDE 2026-11-03, DEV-093.** Result names follow the interface language; the query goes out 300 ms after the last keystroke. States: first load = three row skeletons; no match = a notice line "Nincs találat" + a hint; load failure = a notice line + "Újra"; while the next answer is on its way the previous list stays, dimmed · tap a result = added at once as 3 × 8 with no load, picker closes · cancel | `plans.findExercise` = "Gyakorlat keresése" · `common.cancel` = "Mégse" · `plans.pickerNoMuscles` · `plans.pickerEmpty` · `plans.pickerEmptyHint` · `plans.pickerError` · `muscle.<slug>` · `common.retry` | query "guggolás" |
| Add block | Three small plus-chips under the blocks of the open day; tap = new block at the end ("Kör" is created with 3 rounds) | `plans.blockKind.single` = "Egyszerű" · `plans.blockKind.superset` = "Szuperszett" · `plans.blockKind.circuit` = "Kör" | + Egyszerű · + Szuperszett · + Kör |
| Add day (end of the scroll) | Creates a day in the first free slot, named "N. nap". When no slot is free the button is replaced by a plain sentence | `plans.addDay` = "Nap hozzáadása" · `plans.cycleFull` = "A {{days}} napos ciklus minden napja foglalt." | A 7 napos ciklus minden napja foglalt. |
| Tab bar | Coach: 6 tabs, Edző lit | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.profile` = "Profil" (admin adds `nav.admin` = "Admin" before Profil) | KP's shell |

### SHOULD

| Element | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|
| Status sheet | Bottom sheet over a scrim: grab handle, title, close icon, four single-choice chips; the current one is marked. Picking one closes the sheet and makes "Mentés" pending — nothing is sent until "Mentés". Close icon, scrim tap or dragging the sheet down closes it with nothing changed | `plans.statusTitle` = "Állapot" · `plans.status.draft` = "Piszkozat" · `plans.status.active` = "Aktív" · `plans.status.paused` = "Szünetel" · `plans.status.ended` = "Lezárva" · aria `common.close` = "Bezárás" | Aktív selected |
| Start-date warning | One alert line between the strip and the day list, only on a client plan that has no start date: a warning-triangle glyph (danger tone in the code) + the sentence. No control to set the date — here or anywhere else in the app | `plans.needsStart` = "Aktiváláshoz kell egy kezdődátum" | absent on Dániel's plan (starts 2026-07-13) |
| Picker flags (client plans only) | After a result's name: a body-area chip when the movement touches an area the client flagged (danger tone = area marked "avoid" and the movement loads it; warning tone otherwise; only the first area is printed), and a neutral chip counting kit the client did not tick. Flags never hide a result | `onboarding.area.knee` = "Térd" · `plans.missingKit` = "{{count}} eszköz hiányzik" | Térd (warning tone: Dániel's knee is "Óvatosan") · 1 eszköz hiányzik |
| Delete toasts | Bottom of the screen above the tab bar, 4 s, max three stacked: kind glyph (info mark for a delete, warning triangle for a failed undo) · message · undo · dismiss ×, with a thin countdown line along the toast's bottom edge (absent under reduced motion). Undo rebuilds the deleted day / block / row. No undo button when a deleted row's source exercise no longer exists | `plans.dayDeleted` = "Nap törölve" · `plans.blockDeleted` = "Blokk törölve" · `plans.exerciseDeleted` = "Gyakorlat törölve" · `common.undo` = "Visszavonás" · aria `common.dismiss` = "Bezárás" · failure `plans.undoFailed` = "A visszavonás nem sikerült" · in one toast variant the message turns into `common.undone` = "Visszavonva" after the tap | Gyakorlat törölve · Visszavonás |
| Clone | Secondary control with a copy glyph; tap toggles an inline panel: hint, the coach's clients by name (tap = deep copy for that client, named "plan name — client name", lands as a draft and opens it), and a second control that copies it as a template ("plan name (2)") | `plans.cloneOpen` = "Klónozás" · `plans.cloneHint` = "Mély másolat készül. A két terv ettől kezdve független — az egyik módosítása a másikat nem érinti." · `plans.cloneAsTemplate` = "Másolat sablonként" | Takács Dániel · Nagy Eszter · Szabó Bence · Tóth Lilla · Varga Márk · Kiss Anna |
| Duplicate cycle (only when the plan has days) | Copies every day forward by one cycle length; the cycle grows and the strip re-renders at the new length. A warning-toned line then stays under the control | `plans.duplicateCycle` = "A teljes {{days}} napos ciklus másolása előre" · `plans.cycleGrew` = "A ciklus {{days}} naposra nőtt — ezzel minden jövőbeli alkalom időpontja eltolódott." | A teljes 7 napos ciklus másolása előre → A ciklus 14 naposra nőtt — … |
| Empty-plan message | Shown in place of the day list when the plan has no days; the strip still shows N empty slots | `plans.noDaysTitle` = "A terv még üres" · `plans.noDaysBody` = "Vegyél fel egy napot, aztán tegyél bele blokkokat és gyakorlatokat." | new draft |
| EMOM / AMRAP block labels | Display only (API / seed data); the UI cannot create these kinds | `plans.blockKind.emom` = "EMOM" · `plans.blockKind.amrap` = "AMRAP" | not in the sample plan |

## States

| State | What is on screen |
|---|---|
| Loading | Half-width title skeleton + ONE block skeleton where the strip will be (never seven fake slots); `common.loading` = "Betöltés" for screen readers only. No back link, no pill. (Quirk: a non-numeric id in the URL never leaves this skeleton.) |
| Not available | Icon + `plans.missingTitle` = "Ez a terv nem érhető el" + `plans.missingBody` = "Vagy nem a tiéd, vagy archiválva lett." One state for: a plan number that does not exist, someone else's plan, an archived plan, a client plan whose client is no longer an active client of this coach, any load error, and a member opening the URL. No retry and no back link — only the tab bar leads out. |
| Default | All days closed, "Mentés" disabled (Frame 1). |
| New draft (from "Új terv") | Title "Új terv" focused with all text selected, keyboard up · "Piszkozat · 1. változat" (real: the counter starts at 1) · 7 empty plus-slots · "7 napos ciklus · 0 edzésnap" · empty-plan message · "Klónozás" · "Nap hozzáadása". No duplicate-cycle control. |
| Pending save | Name or status differs → "Mentés" enabled (the lime pill); busy indicator while saving; if the write fails the typed value stays and nothing is announced. A title cleared to nothing (or to spaces) does not count as a change: the field is empty and "Mentés" stays disabled. |
| Busy | A control waiting for the server keeps its size, swaps its label / glyph for a spinner and refuses taps: "Mentés"; the empty strip slots (all of them at once while a day is being created); "Nap hozzáadása"; the three add-block chips (together); the clone rows and "Másolat sablonként" (together); the duplicate-cycle control. Deletes, reorders and adding an exercise show no busy state — the list simply updates when the server answers. |
| Day open | Chevron up; its strip slot lit; blocks, add-exercise controls and the three add-block chips below the row. A rest day or a new day opens to just the three chips. |
| Block collapsed | Header only (chevron down); several blocks can be collapsed at once. |
| Exercise row selected | Reorder arrows revealed on that row only. |
| Picker open | One block at a time. Template plan: names + muscle figure and muscle line. Client plan: the same + flags. An empty query shows the first 12 of the catalogue. Loading, no-match and failed states are drawn (DEV-093; the original frames show none of them). |
| Status sheet open | See SHOULD. |
| Client plan without start date | The warning line (every plan created or cloned for a client starts in this state). Such a plan cannot be made "Aktív" from this screen: the server refuses the save and nothing is announced — the status word keeps showing the picked "Aktív" and "Mentés" stays enabled. |
| Clone panel open | Hint + client list + "Másolat sablonként"; rows show busy while copying. No clients → hint and the template control only. |
| After duplicate cycle | Strip at the new length (14 slots scroll sideways) + the warning line. |
| Cycle full / not full | Sentence vs. the "Nap hozzáadása" control. |
| Toasts | Delete with undo · delete without undo · undo failed (error tone). |
| Offline | Shell strip above everything: `offline.title` = "Nincs internetkapcsolat". Disabled: Mentés, empty strip slots, every trash, block move arrows, exercise move arrows, + Gyakorlat, picker results, add-block chips, Klónozás and its rows, duplicate cycle, Nap hozzáadása, the status chips. Still live: back link, typing the name, opening / closing days, collapsing blocks, selecting a row, opening the status sheet. |
| Admin | Identical, with the 7-tab bar. |

## Frames to draw

**F1 — "Plan editor / default"** — returning coach, Takács Dániel's live client plan, all days closed, nothing pending. 402 × 874, scrolled to top.
1. Status bar 9:41.
2. Top row: ← "Edzéstervek" (left) · pill "Mentés" in its disabled style (right).
3. Title, editable, one line: "Felső/alsó szplit – 12 hetes blokk".
4. Meta line: "Aktív" (tappable word) · "52. változat".
5. Cycle strip, 7 slots, none selected, numerals 1–7: 1 training · 2 rest · 3 training · 4 rest · 5 training · 6 training · 7 rest. Caption centred: "7 napos ciklus · 4 edzésnap".
6. Day list — each row: glyph · name over caption · chevron-down · red trash:
   "Alsótest – erő" / "1. nap · 18:00" · "Pihenőnap" / "2. nap · nincs időpont" · "Felsőtest – nyomás" / "3. nap · 18:00" · "Pihenőnap" / "4. nap · nincs időpont" · "Felsőtest – húzás" / "5. nap · 18:00" · "Alsótest – volumen" / "6. nap · 10:00" · "Pihenőnap" / "7. nap · nincs időpont". Four or five rows fit above the tab bar; the rest scroll.
7. End of scroll (below the fold): "Klónozás" (copy glyph) · "A teljes 7 napos ciklus másolása előre" (copy glyph) · plain line "A 7 napos ciklus minden napja foglalt." (no "Nap hozzáadása": the cycle is full). No warning line (the plan has a start date).
8. Tab bar, 6 tabs: Kezdőlap · Edzés · Étkezés · Haladás · Edző (lit) · Profil.

**F2 — "Plan editor / day open"** — same plan, 5. nap open, one row selected. Tall frame (about 1 500 pt of content) or scrolled so the strip is still in view; nothing is sticky except the tab bar.
1. Rows 2–4 of F1 unchanged.
2. Strip: slot 5 lit (accent), others as F1. Caption "7 napos ciklus · 4 edzésnap".
3. Day rows 1–4 closed as in F1.
4. Day row "Felsőtest – húzás" / "5. nap · 18:00", chevron-up, trash — open, containing:
   - Block "Egyszerű" [collapse · up (disabled) · down · trash]: row "Előredőlt evezés rúddal" / "4 × 6–8 · 70 kg" [trash] · "+ Gyakorlat"
   - Block "Egyszerű" [collapse · up · down · trash]: row "Húzódzkodás" / "4 × 5–8" [trash] · "+ Gyakorlat"
   - Block "Egyszerű" [collapse · up · down · trash]: row "Széles fogású hátlehúzás" / "3 × 10–12 · 55 kg" [trash] · "+ Gyakorlat"
   - Block "Szuperszett" [collapse · up · down (disabled) · trash]: row "Bicepszhajlítás kézisúlyzóval" / "3 × 10–12 · 15 kg" [trash]; row "Arcig húzás" / "3 × 15–20 · 20 kg" — SELECTED: [up · down (disabled) · trash] · "+ Gyakorlat"
   - Chips: "+ Egyszerű" · "+ Szuperszett" · "+ Kör"
5. Day rows 6–7 closed, then the F1 footer and the tab bar.

**F3 — "Plan editor / picker with flags"** — same plan, 1. nap open, picker open in its first block. 402 × 874, scrolled so the day row sits under the status bar; on a device the keyboard is up (the field autofocuses).
1. Day row "Alsótest – erő" / "1. nap · 18:00", chevron-up, trash. (Strip slot 1 is lit, off-screen above.)
2. Block "Egyszerű" [collapse · up (disabled) · down · trash]: row "Guggolás" / "4 × 5 · 100 kg" [trash].
3. Picker in place of "+ Gyakorlat": field label "Gyakorlat keresése" above the field, value "guggolás"; results — the first rows of a longer list that scrolls inside its own box (which rows match and their order are illustrative): "Guggolás rúddal" [Térd] · "Fej fölötti guggolás" [Térd] · "Goblet guggolás" [Térd] [1 eszköz hiányzik] — "Térd" in the warning tone, the kit chip neutral; then "Mégse".
4. Next block "Egyszerű": row "Román felhúzás" / "3 × 8–10 · 80 kg" [trash] · "+ Gyakorlat"; then "Egyszerű": "Lábtolás" / "3 × 10–12 · 150 kg".
5. Tab bar as F1 (hidden behind the keyboard if the keyboard is drawn).

Overlay variants worth a component state each (not full frames): the "Állapot" sheet over F1 (chips Piszkozat · Aktív selected · Szünetel · Lezárva) and the toast "Gyakorlat törölve · Visszavonás · ×" over F2.

## Images

| Could help | Notes |
|---|---|
| Strip slot glyphs | The Pulse bar already lights a graphite 3D icon in lime. The strip's "training" and "rest" marks can use the same idea at small size: reuse `assets/pulse/tab2-training.png` / `tab2-training-active.png` for training; a rest mark (moon) would be one new render in the same steel. Line icons here would repeat what the owner rejected in the nav. A purely typographic strip (numerals + a lime tick) is the other clean option. |
| One quiet object by the title | `assets/pulse/equip-barbell.png` (exists) glowing out of the dark at the masthead's right edge, as the fist does on Home. Optional — this is a dense working screen; do not let it push the strip down. |
| Empty-plan state | The same barbell render, larger and dim, above "A terv még üres". |

Must NOT be shown as if it existed: exercise photos, thumbnails or video in exercise rows or picker results (the catalogue has zero media); a client photo (members have a monogram only — and this screen does not show the client at all); a muscle map / heat map of the day or plan (the per-result mannequin of the picker is the one exception, DEV-093); a coach portrait.

## Do not invent

- **Editing an exercise's prescription.** There is no UI for sets, reps, load, RPE, tempo, rest or notes. Every exercise added here is 3 × 8 with no load; the richer target lines in the sample come from seed / API data. No steppers, no set table, no per-set ladder.
- **Editing a day.** No rename, no start-time picker, no duration, no notes, no rest-day switch. A day made here is named "N. nap", has "nincs időpont" and is a training day; rest days exist only in seeded / API-made plans.
- **Editing a block.** No rounds stepper, rest, time cap or label field; no EMOM / AMRAP / "Tabata" creation.
- **Plan-level fields other than name and status:** no start / end date picker (despite the warning line), no cycle-length control, no goal, description or level.
- Drag handles or drag-and-drop (reordering is up / down controls; blocks and exercises only). Days cannot be reordered or moved to another slot at all.
- The client's name, monogram or an "assigned to" line; a "Sablon" / "Kliens-terv" scope badge. The editor does not show whose plan it is.
- Archive / delete-plan control, duplicate-a-single-day, copy day to another plan.
- Confirm dialogs on delete (deletes are immediate; the undo toast is the safety net).
- An autosave indicator ("minden mentve"), an unsaved-changes dialog, error banners for failed edits — no such copy exists (only "A visszavonás nem sikerült").
- A sticky header, floating save bar or FAB.
- Picker extras: muscle / equipment filters, difficulty tags, thumbnails, a language pill on English-only names, a magnifier, placeholder or clear control in the field, "load more", recents, favourites, a link to the exercise detail. (Since 2026-11-03 the picker DOES show a muscle figure and a muscle line on every result, and a "no results" line: owner override, DEV-093.)
- A notification bell on this screen (the shared sample's "bell 2" lives on Home and on the coach dashboard only).
- Weekday letters or calendar dates on strip slots — slots are cycle positions (1…N), not H K Sze Cs P Szo V.
- Week tabs, periodisation or progression rules, volume / sets-per-muscle summaries, total-duration figures.
- Preview-as-client, publish / send / notify-client buttons, plan-change notifications, AI plan generation, selling templates.

## Notes for the designer

- **Open Field vs. three levels of nesting.** Day → block → exercise was drawn as cards inside cards. Without boxes it needs indentation, hairlines and type weight. A superset must still read as ONE group of two or more rows (for example one continuous hairline in the left margin); that is the designer's call.
- **The title is an `<input>`: one line, no wrap.** "Felső/alsó szplit – 12 hetes blokk" is 34 characters; a clone is longer: "Kezdő teljes test – 8 hét — Nagy Eszter" (39). At 354 pt content width this cannot be a giant condensed numeral-size line — pick a size where about 34 characters fit, and show how overflow ends. A two-line title would need a code change (flag it, do not assume it).
- **No lit pill at rest.** "Mentés" is disabled almost always; its disabled style must not be lime. Lime at rest = the lit tab and (when a day is open) the lit strip slot.
- Control density: an open block header carries four 44 pt icon targets plus its label; an exercise row carries one to three. The code keeps them always reachable for keyboard / screen-reader users — quiet them visually, do not remove them. Trash stays in the danger colour.
- Overlays: the status picker is a bottom sheet with a title and a close icon; the toast sits at the BOTTOM, above the tab bar, on this screen (the review brief places toasts at the top — the code does not, here). Semantic colours stay semantic: danger = trash, the "avoid" flag and the start-date warning's glyph; warning = the "caution" flag and the cycle-grew line; lime is never used for either.
- Strip arithmetic: 7 slots × 44 pt minimum + gaps fits 354 pt. After "duplicate cycle" there are 14 slots (cycles go up to 56) and the row scrolls sideways — design the cut-off cue. The seed has a real 14-day plan: "Nyári rekomp – 14 napos ciklus".
- Long strings: "A teljes 7 napos ciklus másolása előre" (a control label, 38 characters); the cycle-grew sentence and the clone hint wrap to 2–3 lines; exercise names truncate to one line ("Közepes fogású fekvenyomás rúddal").
- `plans.needsStart` in hu.json is the short sentence above. The longer wording in the brain spec ("… enélkül a kliens kezdőlapja üres marad.") is not in the bundle.
- Days created in the editor repeat themselves: name "3. nap" over caption "3. nap · nincs időpont". Rest days always end in "· nincs időpont".
- Known quirk: a time-based exercise (the seed's "Plank", 3 × 45 s) prints "3 × ?" because the row only knows reps. Do not design a seconds format as if it existed; avoid that row in frames (it is the last block of "Alsótest – erő").
- Block labels exist in the data ("Bicepsz + hátsó váll" on the sample superset) but the screen prints only the kind.
- The clone list is every client the coach has (invited ones too, archived ones not), names only. A tap on a client who has not accepted yet does nothing visible — the server only copies onto an accepted client and no error is shown. "Klónozás" also shows on client plans.
- The revision number is not a version the coach chose: it rises with every row touched (see the meta line). Leave room for a three-digit number and do not style it as a milestone.
- Numbers in the target line are printed as stored, with a decimal POINT: the seed's 14-day plan has "4 × 6–8 · 72.5 kg" and "4 × 8–10 · 62.5 kg". Do not draw "72,5 kg" here.
- About half of the catalogue has no Hungarian name. Those exercises appear in English in rows and in picker results (an empty search lists the catalogue alphabetically, so English names are normal there), with no language pill on this screen.
- The 6-tab bar needs the coach icon: `assets/pulse` holds five tab renders (home, training, nutrition, progress, profile); "Edző" (and "Admin" for the 7-tab bar) are not made yet.
- Sample provenance: the day names, start times, block kinds and target lines are the demo seed's real tree for "Felső/alsó szplit – 12 hetes blokk" (`seed-demo.mjs`). Hungarian exercise names are what the repo's composer (`translate-exercises-hu.mjs`) yields for the seed's English picks; the encrypted database was not opened, so exact row names and the picker results in F3 are illustrative. One pick is narrowed by the seed itself: the squat is chosen as the shortest catalogue name containing "squats", which "Barbell Squat" → "Guggolás rúddal" cannot match; the row it does match is the one the plan route's own comment names, "Squats", shown in Hungarian as "Guggolás". So the plan row is "Guggolás", and "Guggolás rúddal" is a different catalogue exercise that may appear among the picker results. The revision numbers are the seed's real ones (52 for this plan, 1 for a new draft). Client names are the shared coach-side set, not the seed's.
