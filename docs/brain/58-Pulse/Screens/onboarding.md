---
type: screen-inventory
title: Onboarding kérdőív — screen inventory
updated: 2026-10-11
route: "/onboarding"
tags: [ux, screen, inventory, pulse]
---

# Onboarding kérdőív — route `/onboarding` · any signed-in role (member, coach, admin; no role gate) · reached ONLY by typing the URL: nothing links or redirects here, register lands on Home · bottom tab lit: Kezdőlap (5 / 6 / 7 tabs by role)

Sources checked 2026-10-10: `frontend/src/features/onboarding/OnboardingPage.tsx`, `useOnboarding.ts`, `app/router.tsx`, `app/navTabs.ts`, `features/settings/EquipmentSection.tsx`, `backend/src/onboarding/routes.js`, `backend/scripts/seed-demo.mjs`, spec `55-Screens/onboarding.md`. Status words: live = in the running code · planned = spec / backend only · cut = deliberately removed. The member has NO title for this screen (no key); the coach side calls the same answers `coaching.profileTitle` = "Kérdőív".

## Purpose

Five short question sets — goal → schedule → place + equipment → body data → injuries — that a member answers once and can revise at any time. The coach reads every answer on the client screen and the coach's exercise picker flags against the equipment and the limitations. Every answer saves itself; there is no save button.

**The ONE primary action:** `common.next` = "Tovább" on steps 1–4, `onboarding.finish` = "Kész" on step 5 (marks the questionnaire complete, then goes Home).

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data (Takács Dániel) |
|---|---|---|---|---|
| Step progress (the anchor) | live | Current step number, large, with the total as a caption; a 5-step countable goal. In the code the numeral sits inside a ring that fills one fifth per step (1/5 … 5/5) — the proportion is real data, the ring shape is old skin. Display-only (steps are not tappable). The sentence form is read to screen readers only. | `onboarding.stepsTotal` = "{{total}} lépésből"<br>`onboarding.stepOf` = "{{current}} / {{total}}. lépés" (screen-reader text today) | 5 · 5 lépésből |
| Step title (the only h1) + one body line | live | Changes per step. On steps 1 and 5 the h1 IS the question. | `onboarding.step.goal.title` = "Mi a célod?" · `onboarding.step.goal.body` = "Egy fő célt válassz — erre épül az egész terv."<br>`onboarding.step.schedule.title` = "Mennyit tudsz edzeni?" · `onboarding.step.schedule.body` = "Az őszinte szám a jó szám."<br>`onboarding.step.equipment.title` = "Hol és mivel edzel?" · `onboarding.step.equipment.body` = "Csak olyan gyakorlatot kapsz, amit el is tudsz végezni."<br>`onboarding.step.body.title` = "Pár adat rólad" · `onboarding.step.body.body` = "Ezek segítenek a súlyok és a haladás becslésében."<br>`onboarding.step.limitations.title` = "Van sérülésed vagy korlátod?" · `onboarding.step.limitations.body` = "Amit itt megadsz, azt a terv és az edződ is figyelembe veszi." | step 5 |
| 1 · Goal — REQUIRED | live | Single choice, 7 options in server order, each a label + a one-line hint. Tap selects and saves. | `onboarding.goal.strength` = "Erő" · `onboarding.goalHint.strength` = "Nagy súly, kevés ismétlés, hosszú pihenő."<br>`onboarding.goal.muscle` = "Izomtömeg" · `onboarding.goalHint.muscle` = "Közepes ismétlés, nagy össztérfogat."<br>`onboarding.goal.fat-loss` = "Zsírvesztés" · `onboarding.goalHint.fat-loss` = "Erőedzés megtartott izommal, sűrűbb ütemben."<br>`onboarding.goal.endurance` = "Állóképesség" · `onboarding.goalHint.endurance` = "Sok ismétlés, rövid pihenő, keringési terhelés."<br>`onboarding.goal.mobility` = "Mozgékonyság" · `onboarding.goalHint.mobility` = "Mozgástartomány és kontroll."<br>`onboarding.goal.health` = "Egészség" · `onboarding.goalHint.health` = "Általános erőnlét, fenntartható terhelés."<br>`onboarding.goal.sport` = "Sportspecifikus" · `onboarding.goalHint.sport` = "Egy adott sport igényeihez igazítva." | Izomtömeg |
| 2 · Experience — REQUIRED | live | Question heading with a required mark ("*"), then single choice, 4 options, no hints. | `onboarding.experience` = "Mennyi edzéstapasztalatod van?"<br>`onboarding.exp.none` = "Még nem edzettem"<br>`onboarding.exp.beginner` = "Kezdő — kevesebb mint egy éve"<br>`onboarding.exp.intermediate` = "Haladó — 1–3 év"<br>`onboarding.exp.advanced` = "Rutinos — 3 év felett" | Haladó — 1–3 év |
| 2 · Sessions per week — REQUIRED | live | Whole number 1–14: typed, or stepped with − / + (− off at 1, + off at 14). Hint under it. No visible required mark today. | `onboarding.sessionsPerWeek` = "Hetente hány edzés?"<br>`onboarding.sessionsPerWeekHint` = "Ennyi napra osztjuk szét a heti terhelést."<br>stepper names: `common.less` = "Kevesebb" · `common.more` = "Több" (accessible names only) | 4 |
| 2 · Session length — optional | live | Minutes, 10–240, − / + in steps of 5. Hint under it. | `onboarding.sessionMinutes` = "Egy edzés hossza (perc)"<br>`onboarding.sessionMinutesHint` = "Nagyjából — ebből számoljuk a terv terjedelmét." | 70 |
| 3 · Location — REQUIRED | live | Question heading with "*", single choice, 4 options, no hints. | `onboarding.location` = "Hol edzel?"<br>`onboarding.loc.gym` = "Edzőterem" · `onboarding.loc.home` = "Otthon" · `onboarding.loc.outdoor` = "Szabadban" · `onboarding.loc.mixed` = "Vegyesen" | Edzőterem |
| 3 · Equipment — optional | live | Heading + hint, then MULTI-select over 16 server options (fixed order). The same answer is editable later in Profil → "Felszerelés". | `onboarding.equipment` = "Milyen eszközöd van?"<br>`onboarding.equipmentHint` = "Csak azt jelöld, amihez tényleg hozzáférsz. A terv ehhez igazodik."<br>option names: no key (server taxonomy) — Saját testsúly · Rúd · Kézisúlyzó · Kettlebell · Gép · Kábel · Smith-gép · Gumiszalag · EZ-rúd · Húzódzkodó rúd · Pad · Medicinlabda · Fitneszlabda · Hengerelő · TRX · Egyéb | selected: Rúd, Kézisúlyzó, Gép, Kábel, Húzódzkodó rúd, Pad |
| 4 · Body data — all optional | live | Opening note; unit choice (2 options, metric by default — it also re-labels and converts the two fields below; values are stored metric); height, weight, birth year as number fields; sex as a single choice of 4 with its own hint. | `onboarding.bodyOptional` = "Ez a rész opcionális. Nélküle is működik minden — a terhelésbecslés lesz pontatlanabb."<br>`onboarding.units` = "Mértékegység" · `onboarding.unit.metric` = "Metrikus (kg / cm)" · `onboarding.unit.imperial` = "Angolszász (lb / in)"<br>`onboarding.heightCm` = "Magasság (cm)" · `onboarding.weightKg` = "Testsúly (kg)" · `onboarding.birthYear` = "Születési év"<br>imperial labels: `onboarding.heightIn` = "Magasság (hüvelyk)" · `onboarding.weightLb` = "Testsúly (font)"<br>`onboarding.sex` = "Nem" · `onboarding.sexHint` = "Az erőnormák és az 1RM-becslés miatt kérdezzük. Kihagyható."<br>`onboarding.sexOpt.female` = "Nő" · `onboarding.sexOpt.male` = "Férfi" · `onboarding.sexOpt.other` = "Egyéb" · `onboarding.sexOpt.undisclosed` = "Nem adom meg" | Metrikus (kg / cm) · 181 · 88,4 · 1994 · Férfi |
| 5 · Body areas to spare — optional | live | Hint, then MULTI-select over 13 areas (fixed order). | `onboarding.limitationsHint` = "Van olyan testtájad, amit kímélni kell? Jelöld be — az edződ látni fogja, és a terv kerüli."<br>`onboarding.area.neck` = "Nyak" · `onboarding.area.shoulder` = "Váll" · `onboarding.area.elbow` = "Könyök" · `onboarding.area.wrist` = "Csukló" · `onboarding.area.upper-back` = "Felső hát" · `onboarding.area.lower-back` = "Derék" · `onboarding.area.hip` = "Csípő" · `onboarding.area.knee` = "Térd" · `onboarding.area.ankle` = "Boka" · `onboarding.area.foot` = "Lábfej" · `onboarding.area.chest` = "Mellkas" · `onboarding.area.abdomen` = "Has" · `onboarding.area.other` = "Egyéb" | Térd |
| 5 · Severity per ticked area | live | For EVERY ticked area one block appears under the chips: the area's name, then a single choice of 3. A fresh tick starts on "Óvatosan". Un-ticking the area removes its block. Block order is NOT the chip order: while the person is ticking, blocks stack in the order ticked; after a reload they come back in the server's order (alphabetical by the English key: Has, Boka, Mellkas, Könyök, Lábfej, Csípő, Térd, Derék, Nyak, Egyéb, Váll, Felső hát, Csukló). | `onboarding.sev.past` = "Régi, már nem fáj" · `onboarding.sev.caution` = "Óvatosan" · `onboarding.sev.avoid` = "Kerülendő" | Térd → Óvatosan |
| 5 · Free-text note — optional | live | One text field (max 2000 characters) with a hint; the coach reads it word for word. | `onboarding.notes` = "Bármi más, amit tudnunk kell"<br>`onboarding.notesHint` = "A saját szavaiddal. Az edződ pontosan ezt fogja olvasni." | Térdsérülés után óvatosan a mély guggolásokkal. |
| Footer — back + primary | live | Back is ALWAYS drawn (disabled on step 1) so the primary never moves. The primary is NEVER disabled: a step can be passed unanswered; required answers are checked only at "Kész". "Kész" first sends any answer still waiting (that shows as "Mentés…" on the status line — the button is NOT busy yet), then turns busy only while the completion itself posts. In the code the footer scrolls with the content (not docked), "Vissza" carries a leading chevron and "Tovább" a trailing one ("Kész" has none) — old-skin glyphs, not content. | `common.back` = "Vissza"<br>`common.next` = "Tovább"<br>`onboarding.finish` = "Kész" | step 5: Vissza · Kész |
| Autosave status line | live | One quiet line above the footer buttons; its height is reserved even when empty. Empty → saving (on every answer, and the first time a further step is reached) → saved, or the error. | `onboarding.saving` = "Mentés…"<br>`onboarding.saved` = "Elmentve"<br>`onboarding.saveError` = "A mentés nem sikerült — a válasz megmarad, újrapróbáljuk" | Elmentve |
| Rejected-finish message | live | If "Kész" is refused, the screen jumps to the first step that holds a missing required answer and prints one alert line under the footer naming what is missing (only the missing ones, in this order). The sessions-per-week field also gets its own inline error (it replaces that field's hint). Answering removes that item at once. | `onboarding.missing` = "Hiányzik még: {{fields}}"<br>`onboarding.field.primary_goal` = "cél" · `onboarding.field.experience` = "tapasztalat" · `onboarding.field.sessions_per_week` = "heti edzésszám" · `onboarding.field.training_location` = "helyszín"<br>`onboarding.requiredField` = "Ez a mező kell a befejezéshez" | Hiányzik még: heti edzésszám |
| Bottom navigation | live | The normal tab bar, fully working — the person can walk out mid-flow; answers are already saved and the furthest step is remembered. | `nav.home` = "Kezdőlap" (lit) · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.profile` = "Profil" | member: 5 tabs |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| Bounds tick on the two steppers | live | A success mark inside the number field while the value is within its range. It means "valid number", never "good answer". | no key (decorative) | shown for 4 and 70 |
| Required mark "*" | live | Accent asterisk after the two question headings that are required (experience, location). Goal and sessions-per-week are required too but carry no visible mark today. | no key (literal "*") | Mennyi edzéstapasztalatod van? * |
| A door into the questionnaire (first-run redirect, Home prompt, or Profil row "edit my answers") | planned (spec calls this "the member entry path"; nothing implements it) | Today only the equipment answer has a door (Profil → Felszerelés). | no key for any prompt or row | — |
| Tabs inert during a first run | planned (spec warning, undecided) | Today the bar works and leaving is allowed. | — | — |
| A note per limitation | planned on this screen (the field exists in the API; the coach's client screen already prints it) | The API stores up to 500 characters per ticked area. The member has no field to write it — only seeded / API-written notes exist. | no key | seed value: Régi meniszkusz-sérülés, 90 fok alatt kellemetlen. |
| Completion feedback | planned (never specified) | "Kész" just goes Home: no toast, no summary, no reward. | no key | — |
| Error state for a failed load, and for a "Kész" that fails for a non-answer reason | planned (not built, no copy) | See States — both are silent today. | no key (`common.retry` = "Újra" exists as a generic label) | — |

## States

- **Loading** — full-screen skeleton (screen-reader text `common.loading` = "Betöltés"); the tab bar is already there. Never a spinner.
- **Load failed** — the skeleton simply stays (no message, no retry). Gap.
- **First run** (no saved profile) — step 1, nothing selected, "Vissza" disabled, status line empty.
- **Resume** — opens on the FURTHEST step ever reached, with every earlier answer filled in. Going back with "Vissza" never rewinds that point.
- **Completed, revisited** — identical form, still editable, opens on step 5 with everything filled; "Kész" again is harmless.
- **Saving / saved** — `onboarding.saving` = "Mentés…" then `onboarding.saved` = "Elmentve" (about 0.7 s after the last change).
- **Save failed (offline, out-of-range number, rate limit)** — `onboarding.saveError` = "A mentés nem sikerült — a válasz megmarad, újrapróbáljuk"; the answer stays on screen and is re-sent with the next change or on leaving. There is NO field-level message for an out-of-range height / weight / year.
- **Offline** — the shell strip above the screen (`offline.title` = "Nincs internetkapcsolat") plus the save-error line. Answers are not queued in the offline outbox.
- **Finish in flight** — two beats: the last pending answer is sent first (status line "Mentés…", button not busy), then "Kész" is busy while the completion posts; "Vissza" stays live throughout.
- **Finish refused (missing answers)** — jump to the step + `onboarding.missing` line + `onboarding.requiredField` = "Ez a mező kell a befejezéshez" on sessions-per-week. Full text when all four are missing: Hiányzik még: cél, tapasztalat, heti edzésszám, helyszín.
- **Finish failed for another reason (network)** — silent: the button stops being busy, nothing is printed. Gap.
- **Finished** — replaced by Home; no message.
- **Stepper edges** — field empty until answered; − disabled at the minimum, + disabled at the maximum.
- **Unit variant (step 4)** — metric labels "Magasság (cm)" / "Testsúly (kg)" or imperial "Magasság (hüvelyk)" / "Testsúly (font)"; the same stored value shown converted — height in whole inches, weight to one decimal. For the sample member: 181 → 71 · 88,4 → 194,9 (birth year and sex unchanged).
- **Step 5 growth** — 0 to 13 severity blocks; the step gets longer with every ticked area.
- **Role variant** — content identical; the tab bar has 5 (member), 6 (coach) or 7 (admin) tabs, Kezdőlap lit in all three.
- **Sheets / dialogs / toasts** — none.

## Frames to draw

All three: status bar on top; member tab bar at the bottom — **Kezdőlap** (lit) · Edzés · Étkezés · Haladás · Profil. Signed-in member: Takács Dániel.

### 1. `Kérdőív 5/5 — visszatérő tag` — a member who finished it earlier opens it again (the form resumes on the last step, so THIS is what a returning person sees)

1. Step progress: numeral **5**, caption: 5 lépésből
2. h1: Van sérülésed vagy korlátod?
3. Body: Amit itt megadsz, azt a terv és az edződ is figyelembe veszi.
4. Hint: Van olyan testtájad, amit kímélni kell? Jelöld be — az edződ látni fogja, és a terv kerüli.
5. Multi-select, 13 options in this order: Nyak · Váll · Könyök · Csukló · Felső hát · Derék · Csípő · **Térd** (selected, with check) · Boka · Lábfej · Mellkas · Has · Egyéb
6. Severity block — title: Térd · options: Régi, már nem fáj · **Óvatosan** (selected) · Kerülendő
7. Field — label: Bármi más, amit tudnunk kell · value: Térdsérülés után óvatosan a mély guggolásokkal. · hint: A saját szavaiddal. Az edződ pontosan ezt fogja olvasni.
8. Status line: empty on arrival (keep its height); after any edit: Elmentve
9. Footer: Vissza · primary pill **Kész**
10. Tab bar.

### 2. `Kérdőív 1/5 — első megnyitás` — a new member's first step, one answer just given

1. Step progress: numeral **1**, caption: 5 lépésből
2. h1: Mi a célod?
3. Body: Egy fő célt válassz — erre épül az egész terv.
4. Single choice, 7 rows (label — hint):
   - Erő — Nagy súly, kevés ismétlés, hosszú pihenő.
   - **Izomtömeg** — Közepes ismétlés, nagy össztérfogat. (selected)
   - Zsírvesztés — Erőedzés megtartott izommal, sűrűbb ütemben.
   - Állóképesség — Sok ismétlés, rövid pihenő, keringési terhelés.
   - Mozgékonyság — Mozgástartomány és kontroll.
   - Egészség — Általános erőnlét, fenntartható terhelés.
   - Sportspecifikus — Egy adott sport igényeihez igazítva.
5. Status line: Elmentve
6. Footer: Vissza (disabled) · primary pill **Tovább**
7. Tab bar. (Seven two-line rows do not fit one screen: this frame scrolls.)

### 3. `Kérdőív 2/5 — hiányzó válasz` — sent back after "Kész" was refused because sessions per week is empty

1. Step progress: numeral **2**, caption: 5 lépésből
2. h1: Mennyit tudsz edzeni?
3. Body: Az őszinte szám a jó szám.
4. Question: Mennyi edzéstapasztalatod van? * — single choice, 4 rows: Még nem edzettem · Kezdő — kevesebb mint egy éve · **Haladó — 1–3 év** (selected) · Rutinos — 3 év felett
5. Number field — label: Hetente hány edzés? · value: empty · − and + · error line in place of the hint (danger colour + icon): Ez a mező kell a befejezéshez
6. Number field — label: Egy edzés hossza (perc) · value: 70 with the bounds tick · − and + · hint: Nagyjából — ebből számoljuk a terv terjedelmét.
7. Status line: empty
8. Footer: Vissza · primary pill **Tovább**
9. Alert line under the footer: Hiányzik még: heti edzésszám
10. Tab bar.

Answered variant of row 5 (the normal step 2): value 4 with the bounds tick, hint: Ennyi napra osztjuk szét a heti terhelést.; no alert line.

Steps 3 and 4 are not framed (limit of three) — their full content is in the MUST table; sample values: Edzőterem + the six selected equipment items; Metrikus (kg / cm) · 181 · 88,4 · 1994 · Férfi.

## Images

What could help:

- **One still per step, not per option** (5 images, same low-key family as Home's `hero-grip`), glowing out of the black beside the big step numeral — it gives each of five look-alike steps its own face: 1 a loaded bar or plate; 2 chalk / a gym clock; 3 an empty rack or bench; 4 a measuring tape or scale platform; 5 a taped knee or a foam roller.
- Step 3 can reuse the two graphite stills the asset manifest (`assets/pulse/manifest-app.json`) lists today: `equip-barbell` (Rúd) and `equip-machine` (Gép). Six more were being generated in this run and were not on the shelf yet at verification (raw files for Kézisúlyzó, Kettlebell, Kábel, Saját testsúly, Pad, Gumiszalag); the remaining eight — Smith-gép, EZ-rúd, Húzódzkodó rúd, Medicinlabda, Fitneszlabda, Hengerelő, TRX, Egyéb — have NO image. So never a thumbnail per chip: 16 thumbnails cannot be completed. Read the manifest for what is finally available.
- For the one-still-per-step idea the same run produced raw candidates (`hero-plates`, `hero-chalk`, `hero-stopwatch`, `hero-tape` under `assets/pulse/app/raw`); use only those the manifest finally lists. Do not reuse `hero-grip` — the manifest reserves it for Home.
- The old screen used a line glyph per option (goal, experience, location), plus a tinted glyph holder before every question heading and a leading glyph inside every field — all decoration, none of it content. The owner rejected basic line icons as main visuals, so the options should be typographic rows, or get rendered objects in the tab-icon family — that would be 7 + 4 + 4 new renders, a budget decision.
- Step 5 could show the approved graphite mannequin as a read-only illustration — in its NEUTRAL state only (the shelf's `muscle-figure-front` has the chest lit, which on this step would read as "chest injury"; the manifest's figure set names a `figure-front-neutral` on the same canvas). Body areas are picked with chips only: a tappable body-area figure does not exist, and the 13 areas (joints and regions) are not the muscle map's 19 muscles.

What must NOT be shown as if it existed: exercise photos or videos (zero media in the catalogue) · a profile photo or avatar of the member, or a photo of the coach (monograms only: TD, KP) · gender / body-type figure choices or a rotating 3D body (cut) · before / after body photos · a "your plan is being built" visual, a plan preview or a projected-result chart · a celebration image at the end.

## Do not invent

- Welcome / intro slides, a "skip" or "later" link, a review / summary step, an "all set" success screen, confetti, a coin reward for finishing (not among the seven achievements).
- An automatic or AI-generated plan, a "building your plan…" loader, a recommended plan or calorie target at the end — plans and nutrition targets are written by the coach.
- A step to enter a coach's join code, find a coach, or see "your coach" (backend only, no member UI).
- More questions: name, profile photo, full birth date (only the YEAR is asked), goal weight or deadline, body-fat %, activity level, diet / allergies, sleep, medical conditions list, preferred training days or time of day (only a count per week and minutes per session).
- Several goals or a goal ranking (exactly one primary goal); several equipment profiles (gym / home / travel); "add custom equipment".
- A tappable body map for injuries, a pain slider, an injury photo or document upload, a note per area as existing UI.
- A percentage ("40 %"), a time estimate ("kb. 2 perc"), tappable step dots that jump between steps.
- A "Tovább" that is disabled until the step is answered (it never is); an error under goal / experience / location choices (only the footer line exists; only sessions-per-week has an inline error).
- A save button, a "discard changes?" dialog, an exit confirmation, a close (X) control.
- Permission prompts (notifications, health data, camera), language or theme questions, a units switch living elsewhere (units exist ONLY here).
- A visible screen title such as "Kérdőív" or "Onboarding" for the member — no such copy exists on this screen.

## Notes for the designer

- **Open Field:** no option cards, no boxed inputs, no chip capsules, no card around a severity block. Choice rows are type on hairlines; selection is carried by light (lime mark or check + ink text) and never by colour alone; the lime pill ("Tovább" / "Kész") is the only filled shape. "Vissza" is a quiet text control beside it, not a second button shape. Fields follow the approved Profile field (label, value, hairline, hint).
- **The step numeral is a natural Pulse hero** (same family as Home's 2/4). Existing strings for it: the numeral itself, "5 lépésből", and "2 / 5. lépés". No stand-alone word like "LÉPÉS" exists as copy.
- **Three control types to keep apart:** single choice (goal, experience, location, sex, units, severity), multi-select (equipment 16, body areas 13), number with − / + (two fields). Every option needs a 44 pt target; 16 and 13 options wrap over several lines.
- **Keep the primary reachable.** In the code the footer scrolls away under long steps (step 1 has seven two-line rows; step 5 grows). Docking it above the tab bar is a layout choice, not a new feature — but the status line and the alert line must stay next to it.
- **Long strings (reserve two lines at the content width):** the save error (56 characters; German 81), "Hiányzik még: cél, tapasztalat, heti edzésszám, helyszín" (56), the step-5 hint (91), the step-4 opening note (86), the equipment hint (66), the step-5 body line (61). In display capitals "Van sérülésed vagy korlátod?" (28) will not fit one line at h1 size — plan a clean two-line break, no orphan.
- **Verbatim oddities — do not "fix":** "Nem" is the label for sex (it also means "no") and sits right above the option "Nem adom meg"; "Derék" here is the lower-back body area (elsewhere it is the waist measurement); en and em dashes in "Haladó — 1–3 év"; "Egyéb" appears as an equipment item, a sex option and a body area.
- **Numbers:** show the decimal comma (88,4). The questionnaire weight is the START weight 88,4 kg, not Haladás' current 83,1 kg — both are right.
- **Sample data source:** the answers mirror the demo seed's member profile (`seed-demo.mjs`: muscle · intermediate · 4 × 70 min · gym · 181 cm · 88.4 kg · 1994 · male · knee / caution · the note quoted above · six equipment items). The seed's coach account, shown under the name Kovács Péter, also has answers if a coach-role frame is ever needed: Erő · Rutinos — 3 év felett · 5 · 90 · Edzőterem · 178 · 84 · 1988 · Férfi — with no equipment and no body area ticked. (The seed copies the member's knee sentence into the coach's free-text note as well; that is a seed shortcut, leave the note empty in a coach frame.)
- **Hungarian glyphs to check at display size:** ő in "Erő", "Kezdő", "Edzőterem", "Csípő", "Kerülendő", "Nő", "Felső hát"; ű in "sűrűbb"; the "…" in "Mentés…" is a single ellipsis character.
- **Gaps worth telling the owner** (not to be papered over in the design): no way into the screen; a failed load is an endless skeleton; a failed "Kész" can be silent; goal and sessions-per-week are required without a visible mark; the note field is a single-line input for up to 2000 characters (design it multi-line).
