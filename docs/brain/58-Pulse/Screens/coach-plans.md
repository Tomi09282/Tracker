---
type: screen-inventory
title: Edzéstervek — screen inventory
updated: 2026-10-11
route: "/coach/plans"
tags: [ux, screen, inventory, pulse]
---

# Edzéstervek — `/coach/plans` · coach + admin (a member gets a forbidden state) · Edző tab → link "Tervek" under the "Klienseim" heading of the coach dashboard · lit tab: Edző

Sources read: `frontend/src/features/plans/PlanListPage.tsx`, `usePlans.ts`, `useOnline.ts`, `features/coaching/CoachDashboard.tsx`, `app/navTabs.ts`, `backend/src/plans/routes.js`, `backend/scripts/seed-demo.mjs`. Status words: **live** = in code and reachable from the route · **planned** = spec / TODO only · **cut** = decided against.

Doors: (1) on the coach dashboard, the text link `nav.plans` = "Tervek" right under the heading `coaching.title` = "Klienseim"; (2) the back link of the plan editor (`/coach/plans/:id`), labelled with `plans.title`; (3) the desktop-only command palette. The screen has no tab of its own and no back control: the way out is the "Edző" tab.

## Purpose

Every plan this coach has written, in one list: reusable templates and the copies that belong to a named client. The coach comes to reopen a plan they are working on, or to start a new template. Before reading any row they see how much of the library is live.

**The ONE primary action: `plans.newPlan` = "Új terv"** — creates a draft template named `plans.defaultName` = "Új terv" and opens the editor with the name selected for typing over. There is no naming step on this screen.

## Elements

### MUST

| Element · status | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|
| Eyebrow + title · live | Static screen header (the eyebrow is set in capitals by style, the string is sentence case) | `plans.eyebrow` = "Tervezés" · `plans.title` = "Edzéstervek" | — |
| Total · live | The anchor numeral: count of all the coach's non-archived plans, counts up on load, with its caption | `plans.total` = "Terv összesen" | 6 |
| Status bar · live | One horizontal bar split into segments, one per status that has at least one plan, fixed order active → draft → paused → ended, widths proportional to the counts. Decorative: every number is repeated in the legend | none (not announced) | 4 : 1 : 1 |
| Status legend · live | Under the bar: dot + status word + count for each status present. Static, not tappable | `plans.status.active` = "Aktív" · `plans.status.draft` = "Piszkozat" · `plans.status.paused` = "Szünetel" · `plans.status.ended` = "Lezárva" | Aktív 4 · Piszkozat 1 · Lezárva 1 |
| New plan (primary) · live | Full-width action with a leading plus, directly under the anchor and visually one unit with it. Busy while creating; disabled offline. Goes straight to the editor | `plans.newPlan` = "Új terv" | — |
| Section "templates" · live | Heading + count of templates on the same line. The whole section is absent when the count is 0 | `plans.templates` = "Sablonok" | 3 |
| Template row · live | Line 1: plan name, one line, truncated. Line 2: status, then day count and cycle length. Trailing chevron. The whole row opens the editor | `plans.dayCount` = "{{count}} nap" · `plans.cycle` = "{{days}} napos ciklus", joined by " · " (hard-coded) | Kezdő teljes test – 8 hét · Aktív · 7 nap · 7 napos ciklus |
| Section "client plans" · live | Heading + count. Absent when 0 | `plans.clientPlans` = "Kliens-tervek" | 3 |
| Client-plan row · live | Same as a template row plus a leading client monogram (two letters). The client's name is NOT printed (screen readers only); never the e-mail | no key (computed by `initialsOf`) | TD · Felső/alsó szplit – 12 hetes blokk · Aktív · 7 nap · 7 napos ciklus |
| Tab bar · live | Coach: 6 tabs, "Edző" lit. Admin: 7 tabs, "Edző" lit | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.profile` = "Profil" (admin adds `nav.admin` = "Admin" before Profil) | Edző lit |

### SHOULD

| Element · status | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|
| "Active" mark · live | Only the active status carries a leading check glyph, and besides paused it is the only one with a colour; it is the one status that means a client may be training on it today | `plans.status.active` = "Aktív" | ✓ Aktív |
| Paused · live, conditional | A fourth status: its segment and legend entry (third in the fixed order, between draft and ended) and its row status appear only when a paused plan exists; warning tone | `plans.status.paused` = "Szünetel" | seed row: Nyári rekomp – 14 napos ciklus · Szünetel · 4 nap · 14 napos ciklus |
| Fresh draft row · live | A plan created and never renamed or filled | `plans.defaultName` = "Új terv" | Új terv · Piszkozat · 0 nap · 7 napos ciklus |
| Empty library · live | No anchor at all (a bar of zero segments is decoration); the primary stays; below it mark + title + body, no second action | `plans.emptyTitle` = "Még nincs terved" · `plans.emptyBody` = "Hozz létre egy sablont, és építsd fel egyszer — utána bármelyik kliensnek adhatod." | frame 2 |
| Load error · live | Under the header instead of everything else: alert glyph, one sentence, a retry action. The anchor is never drawn from partial data | `auth.errors.generic` = "Nem sikerült a művelet. Próbáld újra." · `common.retry` = "Újra" | — |
| Loading announcement · live | Screen readers only, over the skeleton | `common.loading` = "Betöltés" | — |
| Forbidden · live | A member who opens the URL: the whole page is one mark + title + body, no header, no list | `coaching.forbiddenTitle` = "Ez a felület edzőknek szól" · `coaching.forbiddenBody` = "Ha edzőként szeretnél belépni, kérj meghívót." | — |
| Name field + "Létrehozás" create card · cut | Merged away in the last redesign. The strings survive: `plans.newName` = "Új terv neve" is now only the screen-reader name of the editor's title field (never visible), `plans.create` = "Létrehozás" is no longer used by any screen | — | do not draw |

## States

- **Loading**: header as normal; skeleton = one anchor block (about 160 pt tall) + two rows (about 88 pt each). `common.loading` for screen readers.
- **Default**: anchor, primary, one or two sections (frame 1).
- **Templates only / client plans only**: the empty section renders nothing — no heading, no zero.
- **With a paused plan**: four segments and four legend entries instead of three.
- **Empty library**: no anchor; primary; `plans.emptyTitle` / `plans.emptyBody` (frame 2).
- **Creating**: the primary is busy (spinner in place of the label, same size) until the editor opens. A failed create has no message: the button simply returns to rest.
- **Load error**: `auth.errors.generic` + `common.retry`; no anchor, no primary, no list.
- **Offline**: shell strip `offline.title` = "Nincs internetkapcsolat" above everything; the primary is disabled; rows stay tappable. Plan edits are never queued (the strip's second line, `offline.queued` = "{{count}} művelet vár feltöltésre", counts workout set checks only). The button follows the device's own network flag: when the strip is up only because the server cannot be reached, the button stays live and a tap ends in the silent failure described under Creating.
- **Forbidden (member)**: `coaching.forbiddenTitle` / `coaching.forbiddenBody` as the page's only content; tab bar = the member's five, none lit.
- **Role variants**: coach = 6-tab bar, admin = 7-tab bar; content identical.
- **Sheets, dialogs, toasts, sub-tabs**: none on this screen. No device variants (same single column on desktop).

## Frames to draw

Sample library for the signed-in coach Kovács Péter (monogram KP). Plan names and clients come from the shared sample set; statuses, day counts and cycle lengths use the shapes of the demo seed (`seed-demo.mjs`): there "Kezdő teljes test – 8 hét" is an active template with 7 day rows on a 7-day cycle, and "Felső/alsó szplit – 12 hetes blokk" is the member's active client plan with 7 day rows (4 training + 3 rest) on a 7-day cycle. Rows inside a section are ordered most recently edited first.

| Section | Monogram (client) | Plan name | Status | Meta |
|---|---|---|---|---|
| Sablonok | — | Push / Pull / Láb – 6 nap | Piszkozat | 6 nap · 7 napos ciklus |
| Sablonok | — | Felső/alsó szplit – 12 hetes blokk | ✓ Aktív | 7 nap · 7 napos ciklus |
| Sablonok | — | Kezdő teljes test – 8 hét | ✓ Aktív | 7 nap · 7 napos ciklus |
| Kliens-tervek | TD (Takács Dániel) | Felső/alsó szplit – 12 hetes blokk | ✓ Aktív | 7 nap · 7 napos ciklus |
| Kliens-tervek | KA (Kiss Anna) | Kezdő teljes test – 8 hét | ✓ Aktív | 7 nap · 7 napos ciklus |
| Kliens-tervek | NE (Nagy Eszter) | Kezdő teljes test – 8 hét — Nagy Eszter | Lezárva | 7 nap · 7 napos ciklus |

Check: total 6 = by status 4 + 1 + 1 = by section 3 + 3. The two cuts are different partitions of the same list and are not meant to line up. The two client-plan name shapes are both real: a template cloned from the client's page keeps its name (rows TD, KA); one cloned from inside the editor is named "plan name — client name" (row NE; the same example the plan-editor inventory uses).

### Frame 1 — "Edzéstervek · könyvtár" (default; what a returning coach sees)

1. Status bar 9:41.
2. Eyebrow "TERVEZÉS"; title "Edzéstervek".
3. Anchor: numeral "6"; caption "TERV ÖSSZESEN"; status bar in three segments 4 : 1 : 1 (active, draft, ended); legend "Aktív 4 · Piszkozat 1 · Lezárva 1".
4. Primary: plus glyph + "Új terv".
5. Section head "Sablonok" with count "3"; three rows from the table, each with a trailing chevron.
6. Section head "Kliens-tervek" with count "3"; three rows from the table, each with a leading monogram and a trailing chevron.
7. Tab bar, 6 cells: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

The frame is taller than one screen; the first screenful should end inside the "Sablonok" rows with the "Kliens-tervek" head close to the fold.

### Frame 2 — "Edzéstervek · üres" (a new coach, nothing written yet)

1. Status bar; eyebrow "TERVEZÉS"; title "Edzéstervek".
2. No anchor.
3. Primary: plus glyph + "Új terv".
4. Empty state: mark; title "Még nincs terved"; body "Hozz létre egy sablont, és építsd fel egyszer — utána bármelyik kliensnek adhatod." No button inside the empty state (the primary above is the action).
5. Tab bar, Edző lit.

### Frame 3 — "Edzéstervek · offline, szünetelő tervvel" (state coverage in one frame)

1. Offline strip: "Nincs internetkapcsolat" (one line).
2. Eyebrow "TERVEZÉS"; title "Edzéstervek".
3. Anchor: numeral "7"; caption "TERV ÖSSZESEN"; bar in four segments 4 : 1 : 1 : 1; legend "Aktív 4 · Piszkozat 1 · Szünetel 1 · Lezárva 1".
4. Primary "Új terv" DISABLED.
5. "Sablonok" count "4": the three template rows of frame 1 plus, last, "Nyári rekomp – 14 napos ciklus · Szünetel · 4 nap · 14 napos ciklus" (a real seed template; also shows a cycle that is not seven days).
6. "Kliens-tervek" count "3": as frame 1.
7. Tab bar, Edző lit.

Not frames, one line each for the state board — **load error**: header, then alert glyph + "Nem sikerült a művelet. Próbáld újra." + "Újra". **Loading**: header, a numeral-sized skeleton block, two row skeletons.

## Images

- **One ambient still, at most, beside the anchor numeral** — the way the chalked fist sits beside "2/4" on the approved Home: a graphite render or low-key black-and-white photograph from the Pulse image family that says "programme" (a loaded bar on a rack, stacked plates, a chalk bucket), graded to the canvas black, containing no lime. The asset run already has a stacked-plates still on disk, `assets/pulse/app/hero-plates.png` (look at it before asking for a new one; the approved fist, `hero-grip`, stays on Home only). Optional; the numeral and the bar already carry the top of the screen.
- **Client rows: monograms only** (TD, KA, NE). No member has a profile photo.
- **Empty state**: one calm object from the same render family may replace the old line clipboard glyph.
- **Must NOT be shown as if it existed**: a cover image or thumbnail per plan; exercise photos or videos (the catalogue has zero media); client photos; per-plan goal icons or colour labels driven by data; a mini week-preview of the plan's days in the row.

## Do not invent

- **Search, filter chips (status, client, goal), a sort control, tappable legend.** The list is whole and static: two sections, newest edit first.
- **Row actions**: overflow menu, swipe to archive or duplicate, long-press, multi-select, drag to reorder, pin / favourite. Clone lives inside the editor. Archive (the product's "delete") has no control on any screen: only an endpoint and an unused hook exist.
- **"Assign to client" from this list.** A client plan is made from the client's page or by cloning inside the editor.
- **Archive or delete control, archived view, "show archived" toggle, restore.** The list leaves archived plans out, and nothing in the UI archives or restores one.
- **Extra row facts.** The payload carries goal, description, experience, start and end date, revision and last-edited time; the row shows none of them. Do not add "updated 2 days ago", "v3", "Izomtömeg", "12 hét", an exercise count or a progress bar.
- **The client's printed name or e-mail on a client row** — monogram only.
- **Usage or adherence**: "3 clients use this template", completion %, last trained. No template-to-copies link is surfaced.
- **A name dialog or sheet before creating** — creation is instant; renaming happens in the editor.
- **Template gallery, presets, import / export, AI-generated plans, plan marketplace or selling for coins.**
- **Folders, tags, colours, cover images.**
- **A top bar, back button or notification bell** on this screen (the bell lives only on Home and on the coach dashboard).
- **"Load more" or pagination** — the whole library arrives in one response.
- **Member-side plan list or plan overview** — members never see this screen.

## Notes for the designer

- **The day count is not "training days".** `plans.dayCount` counts every day row of the plan, rest days included: the four-session upper / lower split reads "7 nap · 7 napos ciklus". The key `plans.trainingDayCount` = "{{count}} edzésnap" exists but is not used on this screen. Do not "correct" the sample to "4 nap".
- **Never hard-code seven.** The cycle is 1–56 days per plan ("14 napos ciklus", "56 napos ciklus"); the day count can be 0. Hungarian does not inflect after a number: "1 nap", "0 nap".
- **Long names.** A plan name may be 120 characters; the build keeps it on one line and truncates. "Felső/alsó szplit – 12 hetes blokk" (34 characters) will not fit a client row beside a 44 pt monogram and a chevron at row-title size on a 354 pt column, and "Kezdő teljes test – 8 hét — Nagy Eszter" (39) is longer still. Decide once: truncate with an ellipsis (as built) or allow two lines.
- **The same name twice is normal.** A client plan is a deep copy of a template; cloned from the client's page it keeps the template's exact name, so "Kezdő teljes test – 8 hét" can sit in both sections. The monogram is then the only thing that tells the copies apart: it has to be legible, not decorative. (Cloned from the editor, the client's name is appended to the plan name — the one case where a client's name is readable in this list.)
- **The status bar is the approved week-bar grammar.** Lit (accent) = "Aktív", pending (text-3) = "Piszkozat", off (track) = "Lezárva"; "Szünetel" is the `warning` colour. Segments differ by tone as well as hue, and the legend carries every number as text.
- **One colour for "Aktív".** The old build paints active with the accent on the bar and with success green on the row status. In Pulse, accent means live and success means saved / done: use the lit level in both places. "Piszkozat" and "Lezárva" share the quiet tone in the rows and are told apart by the word alone.
- **Row status in Open Field.** The build draws the status as a filled chip; V1 allows no enclosed shapes. Set it as a word (check glyph + "Aktív" in the lit colour, the others in text-2 / text-3) on the meta line before "7 nap · 7 napos ciklus".
- **Section heads.** The old build puts a tinted icon tile (clipboard, person) before each heading and the count in a small disc. Both are boxes and basic line icons: use the approved eyebrow with the count as a trailing numeral on the same baseline.
- **Anchor numeral.** "6" with the caption "TERV ÖSSZESEN" is the same lock-up as "HETI EDZÉS 2/4" on the approved Home (giant condensed numeral, eyebrow caption in capitals by style). It must also work at two digits ("12") and one ("1").
- **The lime pill.** "Új terv" is the screen's one filled shape and the only glow. It is short (7 characters); a full-width pill as on Home is consistent. Disabled offline: keep the label readable.
- **Six tabs.** The approved kit has five tab icons; the two staff icons have since been rendered in the same family by the asset run — a whistle for "Edző" and a shield for "Admin": `assets/pulse/app/tab2-coach.png` / `tab2-coach-active.png` and `tab2-admin.png` / `tab2-admin-active.png` (on disk when this file was checked, not yet listed in `assets/pulse/manifest-app.json`; take their image hashes from the manifest once it lists them). Do not generate them again. Cell arithmetic: review brief, section 9.2 (coach: side inset 12, cell 63 pt at 402).
- **Door label vs title.** The link that leads here says "Tervek"; the screen says "Edzéstervek". Both are existing strings; keep each where it is.
- **No back control.** Reached from the dashboard, left through the tab bar. Adding a back link to "Klienseim" would be a small proposal (the string exists), not existing behaviour.
- **Gaps found in the code** (do not design around them silently): a failed "Új terv" shows no error; a plan cannot be archived or deleted from any screen, so every abandoned "Új terv" draft stays in the list; plans of a client whose coaching link was archived stay in this list but open to the editor's missing state (`plans.missingTitle` = "Ez a terv nem érhető el" · `plans.missingBody` = "Vagy nem a tiéd, vagy archiválva lett."); a plan whose scope is neither template nor client would be counted in the total but listed in neither section.
- **Long string.** `plans.emptyBody` is 82 characters with an em dash: two to three lines at body size on a 354 pt column (estimated, not measured in the Pulse faces).
