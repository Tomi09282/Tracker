---
type: screen-inventory
title: Kliens adatlap — screen inventory
updated: 2026-10-11
route: "/coach/clients/:id"
tags: [ux, screen, inventory, pulse]
---

# Kliens adatlap — `/coach/clients/:id` · coach + admin (own clients only) · reached ONLY by tapping a roster row on "Klienseim" (`/coach`) · lit tab: **Edző**

`:id` is the coach–client LINK id, not a user id. "Kliens adatlap" is a working name with no string behind it; the visible heading is the client's own name. Sources read: `frontend/src/features/coaching/ClientDetailPage.tsx`, `PlanTab.tsx`, `NutritionTab.tsx`, `ProgressTab.tsx`, `ChatTab.tsx`, `ClientEquipmentCard.tsx`, `Monogram.tsx`, `useCoaching.ts`, `features/chat/ChatPanel.tsx`, `ui/feedback/TrendChart.tsx`, `backend/src/coaching/routes.js`, `onboarding/routes.js`, `logs/routes.js`, `nutrition/routes.js`, `backend/scripts/seed-demo.mjs`, brain spec `55-Screens/coach-client-detail.md` (intent only; its look is discarded). Status words: **live** · **planned** (spec / API only) · **cut**.

| Fact | Value |
|---|---|
| Roles | coach = 6 tabs, admin = 7; content identical. A stranger, a member, an archived or unknown link all get the same "not available" page. |
| Way out | Back link `coaching.title` = "Klienseim" → `/coach`. |
| Doors onward | a plan row → `/coach/plans/:planId` (plan editor) · `chat.openFull` = "Teljes beszélgetés" → `/coach/clients/:id/chat` |
| Sub-views | 4 tabs inside the page (not routes): Terv (default on every visit) · Táplálkozás · Haladás · Üzenetek. One sheet: the questionnaire. |

## Purpose

One client in full: who they are, the two answers that change what gets written for them (goal, what to spare), their equipment, and four working surfaces — training plans, the prescribed diet, training history and records, messages. The coach arrives to write or fix a plan.

**The ONE primary action (default tab): `plans.newForClient` = "Új terv a kliensnek"** — creates an empty draft plan for this client. Other controls the code fills: every SELECTED equipment chip (six of them at rest on Dániel's page, above the plan list — a selection, see Notes), "Mentés" under the chips (dead until a chip changes), and in their own context the selected day number, "Új étrend" (empty state only), "Aktiválás" and "Hozzáadás" on Táplálkozás, and the send button on Üzenetek.

## Elements

### MUST

| Element | Data shown + action | Exact copy | Sample (client: Takács Dániel) |
|---|---|---|---|
| Back link | live. → `/coach`. | `coaching.title` = "Klienseim" | — |
| Identity | live. Large monogram + a status mark: "owns the account" (accent + check) or "handover pending" (warning + alert glyph). Name as h1, wraps, never truncated. No e-mail. | none (name = display name, else e-mail local part) | TD · Takács Dániel · owns the account |
| Team + how they joined | live. Team name (only if in a team) + one plain word. All four words render, but the live flows write only two: "csapatkóddal" for every join by code and "általad létrehozva" for a pre-made account; "meghívóval", "kézzel" and team membership itself reach the screen only through the demo seed (Dániel's seeded link is exactly that: Erőemelő csapat, "meghívóval"). | team = coach's free text · `coaching.origin.invite` = "meghívóval" · `coaching.origin.team_code` = "csapatkóddal" · `coaching.origin.pregenerated` = "általad létrehozva" · `coaching.origin.manual` = "kézzel" | Erőemelő csapat · meghívóval |
| Three numbers | live. (1) completed sessions in the last 28 days · (2) sessions per week the client said they can do ("—" when no questionnaire) · (3) number of plans for this client ("—" while loading). Read-only. | (1) `coaching.tile.sessions` = "Edzés" + " / " + `plans.dayCount` = "{{count}} nap" → "Edzés / 28 nap" · (2) `coaching.tile.weekly` = "Heti edzés" · (3) `coaching.tile.plans` = "Terv" — all three rendered upper-case | 15 · 4 · 1 |
| Goal | live. The client's one main goal. Full width when nothing is flagged. | `onboarding.field.primary_goal` = "cél" (upper-case) · value e.g. `onboarding.goal.muscle` = "Izomtömeg" | CÉL · Izomtömeg |
| What to spare | live. Only if the client flagged a body area: the WORST one as "area — severity" + the client's own note + "+N" when more are flagged. Two weights of one warning tone: strong for `onboarding.sev.avoid` = "Kerülendő", soft for `onboarding.sev.caution` = "Óvatosan". `onboarding.sev.past` = "Régi, már nem fáj" never shows. | `coaching.limitations` = "Kímélendő" · `onboarding.area.knee` = "Térd" | KÍMÉLENDŐ · Térd — Óvatosan · "Régi meniszkusz-sérülés, 90 fok alatt kellemetlen." |
| Equipment editor | live. 16 multi-select chips (selected = check + lit). Explicit save, no autosave: saving rewrites the client's own answer and sends them a notification. Save is disabled until the set really differs. Success = toast. | `settings.equipment` = "Felszerelés" · `coaching.equipmentHint` = "A kliens elérhető eszközei. A módosításról értesítést kap." · `common.save` = "Mentés" · toast `coaching.equipmentSaved` = "Felszerelés mentve" · chip names come from the server (no key) | chips below |
| Questionnaire door | live. Full-width row with chevron → sheet. Trailing warning tag when the client has not finished; the row itself takes the warning tone when more than one area is flagged. | `coaching.profileFull` = "Teljes kérdőív" · `coaching.profileIncomplete` = "Hiányos" | no tag |
| View switch (4) | live. Single choice, horizontally scrollable, each with a small glyph. A selection, not an action. | `coaching.tab.plan` = "Terv" · `coaching.tab.nutrition` = "Táplálkozás" · `coaching.tab.progress` = "Haladás" · `coaching.tab.chat` = "Üzenetek" (group name `coaching.tabs` = "Kliens nézetek") | Terv selected |
| Terv: plan row | live. Name · status tag (check on the active one) · chevron · meta line "days · cycle · dates". A plan with no start date shows a warning line INSTEAD of the meta line. Tap → plan editor. | `plans.status.active` = "Aktív" · `plans.status.draft` = "Piszkozat" · `plans.status.paused` = "Szünetel" · `plans.status.ended` = "Lezárva" · `plans.dayCount` = "{{count}} nap" · `plans.cycle` = "{{days}} napos ciklus" · `plans.needsStart` = "Aktiváláshoz kell egy kezdődátum" | Felső/alsó szplit – 12 hetes blokk · Aktív ✓ · 7 nap · 7 napos ciklus · 2026-07-13 |
| Terv: primary + clone | live. Primary creates a draft named `plans.defaultName` = "Új terv" in place (no navigation). Clone (only if the coach has templates) toggles an inline list of ALL the coach's templates, drafts included, in the plan library's order (most recently edited first): name + day count; tap = a copy for this client (same name, lands as a draft with no start date), the list closes. | `plans.newForClient` = "Új terv a kliensnek" (plus glyph) · `plans.cloneOpen` = "Klónozás" (copy glyph) | templates, in the order of `coach-plans.md`: Push / Pull / Láb – 6 nap · 6 nap / Felső/alsó szplit – 12 hetes blokk · 7 nap / Kezdő teljes test – 8 hét · 7 nap |
| Tab bar | live. 6 cells, Edző lit. | `nav.coach` = "Edző" | — |

Equipment chips, in server order (migration 003 names; no hu.json key): Saját testsúly · **Rúd** · **Kézisúlyzó** · Kettlebell · **Gép** · **Kábel** · Smith-gép · Gumiszalag · EZ-rúd · **Húzódzkodó rúd** · **Pad** · Medicinlabda · Fitneszlabda · Hengerelő · TRX · Egyéb (bold = selected for Dániel).

### SHOULD

| Element | Data shown + action | Exact copy | Sample |
|---|---|---|---|
| Handover notice | live. Under the identity, only while the client still has the coach-made password. | `coaching.handoverBody` = "Ezeknek a fiókoknak még te ismered a jelszavát, ezért a kliens addig nem tud belépni az appba, amíg sajátot nem állít be." | not shown for Dániel |
| Questionnaire sheet | live. Title + close. Optional warning line (unfinished). Ten label / value rows — the labels are the questions the member was asked. Then every flagged area, then the free-text note in the client's own words. Read-only. | title `coaching.profileTitle` = "Kérdőív" · `coaching.profileDraft` = "Még nincs befejezve — hiányos válaszokra ne építs tervet." · rows: `onboarding.step.goal.title` = "Mi a célod?" · `onboarding.sessionsPerWeek` = "Hetente hány edzés?" · `onboarding.location` = "Hol edzel?" · `onboarding.experience` = "Mennyi edzéstapasztalatod van?" · `onboarding.sessionMinutes` = "Egy edzés hossza (perc)" · `onboarding.heightCm` = "Magasság (cm)" · `onboarding.weightKg` = "Testsúly (kg)" · `onboarding.birthYear` = "Születési év" · `onboarding.sex` = "Nem" · `onboarding.equipment` = "Milyen eszközöd van?" · block `coaching.limitations` = "Kímélendő" · `onboarding.notes` = "Bármi más, amit tudnunk kell" | Izomtömeg · 4 · Edzőterem · Haladó — 1–3 év · 70 perc · 181 cm · 88.4 kg · 1994 · Férfi · Rúd, Kézisúlyzó, Gép, Kábel, Húzódzkodó rúd, Pad · Térd — Óvatosan · Régi meniszkusz-sérülés, 90 fok alatt kellemetlen. · "Térdsérülés után óvatosan a mély guggolásokkal." |
| Táplálkozás: diet row | live. Name + "status · cycle". Tap opens / closes the editor under it. Below the list a quiet create control. | `coaching.nutrition.cycle` = "{{count}} napos ciklus" · `coaching.nutrition.create` = "Új étrend" (new ones are named `coaching.nutrition.defaultName` = "Étrend") | Rekomp étrend – 7 napos ciklus · Aktív · 7 napos ciklus |
| Táplálkozás: editor | live. Day picker = numbers 1…cycle length (selected / day exists / day not created yet — "exists" says nothing about meals). A day that was never created offers "add day". A day lists meals: name + kcal sum; items: food · grams · kcal · protein · delete; under every meal a food search (up to 5 results: name + the kcal per 100 g as a bare number with no unit; while it searches and when nothing matches, nothing shows — no copy) → grams field (default 100) → add. Draft diets end with a note + activate. | `coaching.nutrition.addDay` = "Nap hozzáadása" · `coaching.nutrition.addMeal` = "Étkezés hozzáadása" (new meals are named `coaching.nutrition.mealDefault` = "Étkezés") · `nutrition.searchPlaceholder` = "Étel keresése…" · `nutrition.grams` = "gramm" (field name) · `common.add` = "Hozzáadás" · `common.delete` = "Törlés" (icon name) · `coaching.nutrition.draftNote` = "Ez az étrend még vázlat — a kliens nem látja, amíg nem aktiválod." · `coaching.nutrition.activate` = "Aktiválás" · item line is hard-coded: "60g · 222 kcal · 8.1g P" | Frame 2 |
| Haladás: charts | live. Heading + up to 3 line charts, one per exercise the client has a record on (newest record first): exercise name · latest value + change over the window · 3 scale ticks with the unit · first and last date · a warning chip naming a break of 14+ days. Fewer than 3 training days → a sentence instead of the chart. | `progress.heading` = "Fejlődés" · `progress.gap` = "{{count}} nap kihagyás" · `progress.notEnough` = "Még kevés adat a grafikonhoz ({{count}} nap). Három edzésnap kell hozzá — két pont még nem trend." · units "kg", `workout.seconds` = "mp", `workout.metres` = "m" | Frame 3 |
| Haladás: records | live. Up to 8 rows, newest first: exercise · kind · (for "ismétléses csúcs" only: the rep count, "13+" for thirteen or more) · date · value + unit. Rows are record EVENTS, not one row per exercise — the same exercise repeats each time it is beaten, and in the live app one good set can write two rows (a "becsült 1RM" and an "ismétléses csúcs"); the demo seed writes "becsült 1RM" rows only. The unit is the stored word, printed raw: "kg", but "seconds" and "metres" in English for holds and distances. Not tappable. | `coaching.records` = "Rekordok" · `workout.record.e1rm` = "becsült 1RM" · `workout.record.rep_max` = "ismétléses csúcs" · `workout.record.max_hold` = "leghosszabb tartás" · `workout.record.max_distance` = "leghosszabb táv" | Frame 3 |
| Haladás: sessions | live. Up to 20 rows, newest first: day name (or title, or `workout.freestyle` = "Szabad edzés") · date · sets · reps · volume · duration; an unfinished one adds a word in the accent. Not tappable. | `coaching.sessions` = "Edzések" · `coaching.setsCount` = "{{count}} sorozat" · `coaching.repsCount` = "{{count}} ismétlés" · `coaching.stillRunning` = "folyamatban" · volume and duration are hard-coded: "6.4 t", "850 kg", "58m", "1h 6m" | Frame 3 |
| Üzenetek | live. Link to the full-screen chat · "block" corner action · the client's monogram + name AGAIN · the thread in a height-capped box (60 % of the screen) · composer with label, send button, hint and counter. Fully specified in `screens/coach-chat.md`. | `chat.openFull` = "Teljes beszélgetés" · `chat.block` = "Letiltás" · `chat.compose` = "Írj üzenetet" · `chat.send` = "Küldés" · `chat.composeHint` = "Küldés a repülő ikonnal" | last message: "Ja és a hétvégi edzést tedd át szombat délelőttre, ha tudod." · Kézbesítve |

## States

| State | What shows (copy) |
|---|---|
| Loading (page) | Placeholders only: back-link bar · monogram block + name bar · three number blocks. Never a spinner. |
| Not available | Whole page: `coaching.clientMissingTitle` = "Ez a kliens nem érhető el" + `coaching.clientMissingBody` = "Vagy nem hozzád tartozik, vagy archiválva lett." + button `common.back` = "Vissza". One message for "not yours", "archived", "never existed" and for a member. |
| Default | Frame 1. |
| Handover pending | Status mark in the warning tone + the notice sentence. The name is then usually an e-mail local part ("horvath.gabor"); origin "általad létrehozva". No screen lets the client set their own password yet (see `auth.md`), so through the app this state never ends: for a pre-made account it is the normal look, not a passing one. |
| No questionnaire | One quiet line replaces goal + spare: `coaching.noProfile` = "A kliens még nem töltötte ki a kérdőívet." The same line replaces the equipment chips and is the whole content of the sheet. Second number shows "—". |
| Unfinished questionnaire | "Hiányos" tag on the door row; the full warning sentence on top of the sheet. |
| Nothing to spare | Goal alone, full width. |
| Several areas flagged | Worst one shown + "+1" (count of the rest); the door row in the warning tone; the sheet lists all. |
| Equipment: loading / saving / saved / failed | block placeholder · "Mentés" busy, chips stay tappable · toast "Felszerelés mentve" · inline danger line under the button: `onboarding.saveError` = "A mentés nem sikerült — a válasz megmarad, újrapróbáljuk" (or the "Vagy nem hozzád tartozik…" line if the link vanished); the chosen chips are kept. |
| Invited client who has not accepted yet (demo seed only — no live flow creates an "invited" link; low priority) | Page opens, but the questionnaire read fails: the "no questionnaire" line shows, and the equipment area reads "Vagy nem hozzád tartozik, vagy archiválva lett." (misleading, as live). History is empty; the chat cannot be opened for a link that is not active and ends on `chat.unavailable` = "Ez a beszélgetés már nem elérhető." |
| Terv: loading / empty / new draft | two row placeholders · `plans.noneForClient` = "Ennek a kliensnek még nincs terve" + `plans.noneForClientBody` = "Készíts egy újat, vagy klónozz rá egy sablont." with both buttons still under it · a fresh plan appears as "Új terv · Piszkozat · Aktiváláshoz kell egy kezdődátum". |
| Terv: clone list open | Inline list under "Klónozás" (never a dialog). No templates → no "Klónozás" control at all. |
| Táplálkozás: loading / empty | two row placeholders · `coaching.nutrition.emptyTitle` = "Nincs étrend" + `coaching.nutrition.emptyBody` = "Készíts egy étrendet ehhez a klienshez. Amíg vázlat, ő nem látja." + filled button "Új étrend". |
| Táplálkozás: editor loading / day not created / day without meals / draft | one block placeholder under the open row · "Nap hozzáadása" alone · "Étkezés hozzáadása" alone (in the seed, days 3–7 of Dániel's diet look like this) · draft note + "Aktiválás" at the bottom. |
| Haladás: loading / empty / thin | two block placeholders · `coaching.noHistoryTitle` = "Még nincs edzéselőzmény" + `coaching.noHistoryBody` = "Amint a kliens elvégzi az első edzést, itt jelenik meg." · an exercise with under 3 days shows its name + the "Még kevés adat…" sentence. Sessions without records → no charts, no records block. |
| Üzenetek: loading / empty / blocked / failed / gone | two bubble placeholders · `chat.emptyTitle` = "Még nincs üzenet" + `chat.emptyBody` = "Írj elsőként — a másik fél értesítést kap róla." · `chat.blocked` = "Ez a beszélgetés le van zárva." + `chat.unblock` = "Feloldás" · `chat.sendFailed` = "Az üzenetet nem sikerült elküldeni. A szöveg megmaradt." · `chat.unavailable` = "Ez a beszélgetés már nem elérhető." |
| Offline | Shell strip `offline.title` = "Nincs internetkapcsolat". Disabled: "Új terv a kliensnek", "Klónozás", every template row. NOT guarded (they fail): equipment "Mentés", every Táplálkozás control, chat send. |
| Admin | Same content, 7-tab bar. |

## Frames to draw

Words in CAPS are hu.json strings set in the display face (upper-case by style) — never retype the source. Canvas 402 wide; Frame 1 is about two screens tall: draw it whole and mark the fold. Frames 2 and 3 start at the view switch (everything above is Frame 1 unchanged).

### Frame 1 — "Kliens · Takács Dániel · Terv" — what the coach sees after tapping the roster row

1. Status bar 9:41.
2. Back link: left chevron + "Klienseim".
3. Identity: monogram "TD" with the "owns the account" mark · name "Takács Dániel" · line "Erőemelő csapat" · "meghívóval".
4. Three numbers on one line: "15" "EDZÉS / 28 NAP" · "4" "HETI EDZÉS" · "1" "TERV".
5. Hairline. Two answers side by side: "CÉL" "Izomtömeg" · "KÍMÉLENDŐ" (warning tone, soft) "Térd — Óvatosan" + note "Régi meniszkusz-sérülés, 90 fok alatt kellemetlen."
6. Hairline. "FELSZERELÉS" · hint "A kliens elérhető eszközei. A módosításról értesítést kap." · the 16 chips in the order listed above, six selected (Rúd, Kézisúlyzó, Gép, Kábel, Húzódzkodó rúd, Pad) · "Mentés" in its disabled form (nothing changed).
7. Hairline row: list glyph · "Teljes kérdőív" · chevron.
8. View switch: "Terv" (selected) · "Táplálkozás" · "Haladás" · "Üzenetek".
9. Plan row: "Felső/alsó szplit – 12 hetes blokk" · tag "Aktív" with a check · chevron · meta "7 nap · 7 napos ciklus · 2026-07-13".
10. The one lime pill, full width: "+ Új terv a kliensnek".
11. Secondary control under it: copy glyph + "Klónozás" (closed).
12. Bottom fade + tab bar, 6 cells: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

### Frame 2 — "Kliens · Táplálkozás · étrend nyitva" — the prescribed diet, day 1 open

1. View switch: "Táplálkozás" selected.
2. Diet row (open): "Rekomp étrend – 7 napos ciklus" · "Aktív · 7 napos ciklus".
3. Day picker: "1" (selected) "2" "3" "4" "5" "6" "7" — all seven days exist, so none is drawn in the "not created yet" form (in the seed only days 1 and 2 carry meals).
4. Meal "REGGELI" · right "443 kcal". Items, each with a trailing delete glyph: "Zabpehely" "60g · 222 kcal · 8.1g P" · "Tejsavó fehérjepor, vanília" "30g · 114 kcal · 23g P" · "Banán" "120g · 107 kcal · 1.3g P". Search field "Étel keresése…".
5. Meal "EBÉD" · "537 kcal". Items: "Csirkemell filé, nyers" "180g · 198 kcal · 41g P" · "Basmati rizs, főtt" "220g · 286 kcal · 5.9g P" · "Brokkoli, párolt" "150g · 53 kcal · 4.2g P". Search field "Étel keresése…".
6. Cut by the fold: "EDZÉS UTÁNI" · "327 kcal" … then "VACSORA" · "373 kcal", then "+ Étkezés hozzáadása", then below the list "+ Új étrend".
7. Tab bar, Edző lit. No draft note (this diet is active). No lime pill in this frame.

Numbers are the demo seed's prescription for cycle day 1, computed with the screen's own rounding.

### Frame 3 — "Kliens · Haladás" — charts, records, sessions

1. View switch: "Haladás" selected.
2. "FEJLŐDÉS". Chart 1: "Bench Press" · "108 kg" + "+12" (success tone) · scale "kg" 108 / 100,3 / 92,5 · line with a dot per training day, the last one larger · under it "2026-07-15" · chip "14 nap kihagyás" (warning) · "2026-10-07".
3. Chart 2: "Barbell Squat" · "131,3 kg" + "+14,6" · scale 131,3 / 122,6 / 114 · "2026-07-13" · "14 nap kihagyás" · "2026-10-05". (A third chart, "Barbell Hip Thrust", follows off-frame.)
4. "REKORDOK". Rows (trophy glyph each): "Bench Press" · "becsült 1RM · 2026-10-07" · "108 kg" / "Barbell Squat" · "becsült 1RM · 2026-10-05" · "131.3 kg" / "Barbell Hip Thrust" · "becsült 1RM · 2026-09-26" · "133.3 kg" / "Bent Over Barbell Row" · "becsült 1RM · 2026-09-25" · "98.2 kg".
5. "EDZÉSEK". Rows: "Felsőtest – nyomás" · "2026-10-07" · "15 sorozat · 154 ismétlés · 6.4 t · 1h 6m" / "Alsótest – erő" · "2026-10-05" · "15 sorozat · 115 ismétlés · 11.5 t · 1h 12m" / "Alsótest – volumen" · "2026-10-03" · "15 sorozat · 195 ismétlés · 15.3 t · 58m" (cut by the fold).
6. Tab bar, Edző lit. No lime pill in this frame.

Day names and dates follow the shared reference week; values are illustrative, sized like the seed's progression (deload weeks, one missed week → the 14-day chip). Exercise names are real catalogue names, shown in English exactly as this tab shows them.

## Images

| Idea | Note |
|---|---|
| Monogram as the anchor | Type only. The approved Profile uses the giant "TD." with the lime full stop; here the same two letters at a smaller size, and the dot can carry the account state (lime = owns the account, warning tone = handover pending) in place of the old ring and badge. |
| "Edző" tab icon | Required, and now made: `assets/pulse/app/tab2-coach.png` + `tab2-coach-active.png` (a steel whistle; `tab2-admin` + `-active`, a shield, exist too — all 7 tab icons now exist). They are in `assets/pulse/manifest-app.json` (rebuilt 10 Oct) with image hash and shelf node. |
| Equipment stills beside chips | 8 of the 16 kinds have a still: `equip-barbell` (Rúd), `equip-machine` (Gép) and, in `assets/pulse/app/`, `equip-dumbbell` (Kézisúlyzó), `equip-kettlebell`, `equip-cable` (Kábel), `equip-bodyweight` (Saját testsúly), `equip-bench` (Pad), `equip-band` (Gumiszalag). None for Smith-gép, EZ-rúd, Húzódzkodó rúd, Medicinlabda, Fitneszlabda, Hengerelő, TRX, Egyéb. The conclusion stands: chips are text-only — no partial set. |
| Coach-side photograph | Manifest slot `hero-stopwatch` exists (`assets/pulse/app/hero-stopwatch.png`: a coach's hand holding a stopwatch, the `hero-grip` family); its manifest entry names the coach dashboard first and this screen second. Optional here, and only away from the monogram, which stays the anchor. `portrait-coach.png` is the coach's own public face for the marketplace — never on this screen. |
| Empty Terv / Táplálkozás / Haladás | At most one dim graphite still per empty state from the existing family (e.g. the barbell for "no plan"). Optional; text alone is valid. |

Must NOT be shown as if it existed: a client photo or avatar · progress photos, body measurements or a weight curve (the member's sharing switches are live, the coach screen is not built) · the client's food diary or food pictures · exercise photos, thumbnails or video on chart, record or session rows (zero media in the catalogue) · a body map with the knee lit (limitations are body AREAS such as knee or lower back; the mannequin has muscle panels only, no joints) · images or video in chat.

## Do not invent

- **Contact and identity data**: e-mail address (deliberately hidden on coach screens), phone, age, city, "member since", last seen / online, a call or e-mail button.
- **Client management here**: archive, move to another team, rename, edit the questionnaire answers (only equipment is editable), private coach notes, tags, reminders. Archive exists only on the dashboard row.
- **Body data**: weight, measurements, photos, before / after, a body summary — planned (backend only).
- **Adherence**: percent, rings, streaks, a calendar or heat map of sessions, "next session", missed-session flags, weekly bars. The 28-day count is the only figure.
- **Drill-downs**: session rows, record rows and charts are not tappable; no session detail, no set list, no exercise picker for charts, no date-range switch, no "show all" (limits: 3 charts, 8 records, 20 sessions).
- **Diet beyond the prescription**: what the client ate, target-vs-eaten bars, macro rings. Also not in the UI: setting or showing the day's kcal / macro targets, a day total, renaming a diet, a day or a meal, deleting a meal, a day or a diet, pausing a diet, carbohydrate and fat on the item line, serving sizes, a barcode scanner.
- **Plan actions on the row**: start-date picker, activate / pause, duplicate, delete, reorder, assign-from-library other than cloning a template. A plan row only opens the editor.
- **Chat extras**: unread badge on the "Üzenetek" chip, typing or presence, attachments, voice, video form-check, deleting a message.
- A share / export / print button, a "report" of the client, PDF.
- A top app bar, a floating action button, a sticky footer action.

## Notes for the designer

- **Two screens of content before the reason to come here.** The plan list starts below identity, numbers, answers, 16 equipment chips and the questionnaire row — more than one full screen down. The order is live code; if you want the plans higher (e.g. the equipment block collapsed to a one-line summary), flag it as a proposal, do not silently reorder.
- **One lime pill at rest.** The code styles "Mentés" as primary too, but it is disabled until a chip changes; draw it unlit at rest so "Új terv a kliensnek" is the only filled shape. The code also fills every SELECTED equipment chip with the primary style (six filled chips with a check on Dániel's page) and, in the diet editor, the selected day number — treat both as neutral selections, not as lime.
- **The view switch is a selection, not navigation**: four chips, one chosen, it must not compete with the tab bar below it. It always resets to "Terv".
- **The first number reads 0 in the running app.** The detail endpoint does not return the 28-day count, so "Edzés / 28 nap" shows 0 for every client; the roster row shows the right figure. Draw the intended value (15); the build has to fix the query.
- **Locale defects that ship today** (all hard-coded, no key): dates are raw ISO ("2026-10-07") in plan rows, charts, records and sessions; decimals use a point in records, volume, the diet item line and the questionnaire weight ("131.3 kg", "6.4 t", "8.1g P", "88.4 kg") while chart headlines use the Hungarian comma ("131,3 kg"); duration is "1h 6m"; the unit sticks to the number ("60g"); "P" stands for protein; a record's unit is the stored English word for holds and distances ("seconds", "metres"), while the chart above it prints "mp" and "m". The frames quote them as they ship — decide with the owner whether to draw the corrected Hungarian forms.
- **Exercise names on Haladás are English** (the stored canonical name), even where the library shows a Hungarian one ("Bench Press", not "Fekvenyomás").
- **The questionnaire sheet speaks to the wrong person**: its labels are the member's questions ("Mi a célod?", "Hol edzel?", "Milyen eszközöd van?") and two repeat the unit ("Egy edzés hossza (perc)" · "70 perc"). Quoted exactly; new coach-side labels would be new copy.
- **Long strings**: "Felső/alsó szplit – 12 hetes blokk" + tag + chevron needs two lines at 354 pt · "Rekomp étrend – 7 napos ciklus" sits directly above "Aktív · 7 napos ciklus" (same phrase twice) · `coaching.handoverBody` is 121 characters (4 lines) · `progress.notEnough` is 89 characters with a one-digit count · the limitation note is free text in the client's words, never translated, any length · "Tejsavó fehérjepor, vanília" and "Bent Over Barbell Row" need ellipsis or two lines · `onboarding.experience` (30 characters) against "Haladó — 1–3 év" in one label / value row · names up to 120 characters wrap in the heading.
- **"7 nap" counts rest days too** (it is the number of day entries in the plan), so most weekly plans read "7 nap · 7 napos ciklus".
- **Plans made here cannot be dated**: no control anywhere in the app sets a training plan's start date (checked in the plan editor and the plan list), so a plan created or cloned on this tab keeps the warning line "Aktiváláshoz kell egy kezdődátum" for good. Dániel's dated plan comes from the seed.
- **Meal names**: "Reggeli", "Ebéd", "Edzés utáni", "Vacsora" are seed data; a meal added in the UI is always called "Étkezés" and cannot be renamed. A diet with status "completed" prints the raw English word (no string).
- **Üzenetek repeats the identity** (monogram + name a second time, one scroll below the first) and puts a scrolling thread inside a scrolling page; the full-screen chat is the real surface. In the tab, a short preview plus the "Teljes beszélgetés" link would be a proposal, not live behaviour.
- **Sample-data sources**: questionnaire answers, the knee limitation and its note, equipment, plan, diet and meal contents mirror the demo seed's member account. The seed's limitation note ("Régi meniszkusz-sérülés, 90 fok alatt kellemetlen.") and its free-text note ("Térdsérülés után óvatosan a mély guggolásokkal.") are two different fields; feature-inventory §6.7 merged them.
