---
type: screen-inventory
title: Gyakorlat részletei — screen inventory
updated: 2026-10-11
route: "/library/:id"
tags: [ux, screen, inventory, pulse]
---

# Gyakorlat részletei — `/library/:id` · Tag, Edző, Admin (any signed-in account, same screen) · opened from a row of "Gyakorlatok" (`/library`) or from a substitute card on another detail · lit tab: "Edzés"

Status words: **live** = rendered by `ExerciseDetailPage.tsx` on this route · **planned** = spec or dead branch only · **cut** = removed on purpose.
Read for this file: `frontend/src/features/library/ExerciseDetailPage.tsx`, `useExercises.ts`, `SectionBadge.tsx`, `ui/muscle-map/{MuscleMap.tsx,shapes.ts}`, `app/navTabs.ts`, `backend/src/exercises/{routes,detail,visibility,media}.js`, `backend/scripts/{seed-demo,seed-exercises,translate-exercises-hu}.mjs` (the name composer was re-run on every sample name below), the brain spec.

"Gyakorlat részletei" is only the spec's name for the screen: hu.json has no such string and nothing on screen says it. The h1 is the exercise's own name. Nothing personal is on this screen: no greeting, bell, monogram, coins, plan, date or history.

## Purpose

Read how ONE movement is done and exactly which muscles it works (main target vs assisting), see what kit it needs, and, if it does not suit today, jump to a similar exercise.
**Primary action: none.** The screen is read-only. Its only controls are navigation: back to "Gyakorlatok", the "Elöl / Hátul" view switch, a tap on a substitute. In Pulse V1 terms there is NO lime pill on this screen; the only lime is the lit muscles (and their role dots). (The live build does paint one filled accent shape here: the selected view chip. That is the old skin, not a primary action; see the view-switch row.)

## Elements

### MUST (all live)

| Element | Data shown + action | Exact Hungarian copy | Sample (shared set, §6.6 "Detail to open") |
|---|---|---|---|
| Back link | Always goes to `/library` (a link to the list, not history-back; the muscle filter chosen there is not restored). 44 pt target. The label is the destination's name, not "Vissza". | `nav.library` = "Gyakorlatok" | Gyakorlatok |
| Media slot | Reserved landscape slot (16:9 in code). Shows the exercise's FIRST media item if it is an image; otherwise a placeholder (in the live build: one centred dumbbell line glyph in an inset box, nothing else). Up to 6 images can be stored, only the first is shown, no gallery. None of the 1652 catalogue exercises has media, so the placeholder is the normal case. | no copy (image alt = the exercise name) | no media |
| Exercise name (h1) | Server-resolved name: Hungarian if it exists, else the English name. API limit 120 characters; never truncated. | no key (server data) | Közepes fogású fekvenyomás rúddal |
| Difficulty (nullable) | One word. Missing on every wger-sourced row (about 47 % of the catalogue). | `library.difficulty.beginner` = "Kezdő" · `library.difficulty.intermediate` = "Haladó" · `library.difficulty.advanced` = "Profi" | Kezdő |
| Type (nullable) | One word. | `library.type.strength` = "Erő" · `library.type.stretching` = "Nyújtás" · `library.type.cardio` = "Kardió" · `library.type.mobility` = "Mobilitás" · `library.type.plyometrics` = "Pliometria" | Erő |
| Muscles heading | Section label. Whole section is absent when the exercise has no muscles. | `library.muscle` = "Izomcsoport" | Izomcsoport |
| View switch | Two options, front is selected on every mount (local state, not in the URL). The ONLY interactive part of the figure here. Live build: two chips above the figure, the selected one a filled accent chip with a tick, the other outlined (the code itself records this as a defect of the shared component). Not a radiogroup here: two toggle buttons, no group label (`muscleMap.viewLabel` is used only by the workout player's variant). | `muscleMap.front` = "Elöl" · `muscleMap.back` = "Hátul" | Elöl (selected) · Hátul |
| Read-only muscle figure | One body, one view at a time. Three levels: primary target (full accent), secondary / assisting (a clearly weaker step of the same accent), everything else idle. Regions are NOT tappable and not focusable. Accessible name only: | `muscleMap.frontTitle` = "Izomtérkép, elülső nézet" · `muscleMap.backTitle` = "Izomtérkép, hátsó nézet" | Elöl: Mell lit as primary, Oldalsó vállizom as secondary |
| Other-side caption | Shown under the figure whenever at least one highlighted muscle is not drawn on the visible view. `{{side}}` = the OTHER view's label, lower-cased. | `muscleMap.alsoOnOtherSide` = "További célizmok a {{side}} nézetben." | on Elöl: További célizmok a hátul nézetben. |
| Muscle-name chips with role dot | One label per muscle: primary first, then secondary, each in roster order. A leading dot in the role's colour step is the only key to the figure's two levels. Labels, not buttons: they do not filter anything. Text comes from the server taxonomy and equals the `muscle.<slug>` strings. | `muscle.chest` = "Mell" · `muscle.side-delts` = "Oldalsó vállizom" · `muscle.triceps` = "Tricepsz" | Mell (primary) · Oldalsó vállizom (secondary) · Tricepsz (secondary) |
| Equipment | Heading + plain labels. Rendered ONLY when the media slot is the placeholder (so: on every catalogue exercise that has equipment attached). Read-only. Labels: no key (server taxonomy). | `library.equipment` = "Eszköz" | Rúd |
| How-to steps | Heading + numbered list (typically 2–7 steps; API limit 30 steps × 600 characters). If there are no steps but a description exists: ONE prose paragraph with NO heading (up to 4000 characters; this is what every wger-sourced row shows, about 47 % of the catalogue). If neither: nothing. A description is never shown when steps exist. Step and description text of catalogue exercises is English even when the name is Hungarian; nothing marks that. | `library.howTo` = "Végrehajtás" | 5 English steps (frame 1) |
| Substitute exercises | Heading + a horizontally scrolling strip of up to 8 entries: name (max 2 lines) + difficulty word (omitted when null). Tap opens that exercise's detail. No image, no type, no language mark on an entry. Section absent when there are none. For a catalogue exercise with a large primary muscle group (chest, lats, quads …) the strip is always full: the server returns the first eight visible exercises that share a primary muscle. | `library.substitutions` = "Helyettesítő gyakorlatok" | Fekvenyomás kézisúlyzóval — Kezdő · Fekvenyomás gépen — Kezdő · Fekvőtámasz — Kezdő · Ferde nyomás kézisúlyzóval — Kezdő |
| Bottom tab bar | Fixed; "Edzés" lit (it owns `/library/…`). 5 tabs for a member, 6 for a coach, 7 for an admin. | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.admin` = "Admin" · `nav.profile` = "Profil" | member: Kezdőlap · Edzés (lit) · Étkezés · Haladás · Profil |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|---|
| Language mark beside difficulty / type | live | Appears when the NAME is not available in the reader's language (and the UI is not English): the codes of ALL the languages the exercise has a translation row in (enabled in the app or not), A–Z, joined with " / ", upper-cased. About 48 % of catalogue names. A free-exercise-db row reads "EN"; a wger-sourced row lists every language wger publishes for it, so the mark can be a long run of codes that has to wrap (the library holds 22 languages). Warning-toned in the live build, never accent. | no key (literal code; falls back to the hard-coded "en") | EN · long variant (illustrative): DE / EN / ES / FR / IT |
| Rejected-submission notice | live | ABOVE the media slot. A warning glyph, a bold line, and under it the moderator's free text (max 500 characters, verbatim, never truncated). The moderation route refuses a rejection without a reason, so the title-only form is a defensive branch (reachable only by a direct database write), not a state to design. Driven by the exercise's status only, so the author sees it and so does a client to whom the coach prescribed that exercise. | `library.rejectedTitle` = "Ezt a beküldést elutasították" | reason (demo seed): A leírás nem elég részletes, és nincs kép a kiindulási helyzetről. |
| Pending-review notice | live | Same place, an info glyph and one line. | `library.pendingReview` = "Beküldve — moderálásra vár." | — |
| Image in the media slot | live, rare | Only a coach- or admin-authored exercise can have one (API only: no upload screen exists). When an image is shown, the equipment section disappears. | — | — |
| Offline strip | live (app shell) | The screen has no network state of its own. | `offline.title` = "Nincs internetkapcsolat" | — |
| Demonstration video + play control | planned | A frontend branch exists (poster + one centred play control, then the native player) but uploads ingest images only, so no exercise can have a video. | `library.playVideo` = "Videó lejátszása" | none |
| "Add to workout" button | planned, deliberately not built | No API verb appends an exercise to a running session; the code documents the omission. | no key (spec wording only: "Hozzáadás az edzéshez") | — |
| Distinct error state with retry | planned (known defect) | Today a failed request looks like "not found". | `common.retry` = "Újra" exists, unused here | — |
| Two-item legend under the figure | cut on this screen | Renders only in the workout player. | `muscleMap.primary` = "Fő célizom" · `muscleMap.secondary` = "Segédizom" | — |

## States

- **Loading** — skeleton in the real geometry: back-link bar, media block, title bar at two-thirds width, meta bar at one-third, one large block. No spinner. Screen-reader text only: `common.loading` = "Betöltés". (A generic shell skeleton shows first while the route's code loads.)
- **Not found / failed request / not allowed** — one state for all three (a row the viewer may not see answers 404): the line `library.emptyTitle` = "Nincs találat" and under it a secondary link with a left arrow, `nav.library` = "Gyakorlatok". No retry, no toast, no h1. Tab bar stays, "Edzés" lit.
- **No media** (the whole public catalogue) — placeholder in the media slot, never a play control; the "Eszköz" section is shown.
- **With image** — first image fills the slot; "Eszköz" hidden.
- **With video** — planned only (see SHOULD).
- **Meta variants** — difficulty + type · type only (wger rows) · neither · any of these + the language mark (one code, or a run of codes on a wger row).
- **Muscles** — section absent · Elöl / Hátul · caption present or not · a view on which nothing is lit, only the caption (any exercise whose muscles all sit on the other view; seed example: "Demó – Kötélhúzás ülve, széles fogás" = Széles hátizom + Hátsó vállizom, both back-only, so Elöl opens dark).
- **How-to** — numbered steps · description paragraph without heading · nothing.
- **Substitutes** — absent (also always absent when the exercise has no primary muscle) · 1–8 entries.
- **Submission notice** — rejected with reason · pending · none (a published exercise, and also the author's own private exercise that was never submitted). Rejected without a reason (title line alone) exists in code only as a defensive branch.
- **Role** — no role variant of the content; only the tab count differs (5 / 6 / 7).
- **Language** — name, muscle and equipment labels are re-fetched per UI language.
- **Offline** — the shell strip only.
- **Sheets, dialogs, toasts** — none on this screen.

## Frames to draw

Draw each as the 402 × 874 viewport at scroll 0; frame 1 additionally as the full scroll height, because the page is longer than one screen. Order below is the code's top-to-bottom order.

### Frame 1 — "Exercise detail · default" — published catalogue exercise, no media, Elöl view (member, 5 tabs)

1. Back link: Gyakorlatok
2. Media slot: no media (see Images for what may stand here; no play control)
3. h1: Közepes fogású fekvenyomás rúddal
4. Meta: Kezdő · Erő (no language mark: the name is Hungarian)
5. Section label: Izomcsoport
6. View switch: Elöl (selected) · Hátul
7. Figure, front view: Mell = primary (full lime) · Oldalsó vállizom = secondary (weaker lime step) · everything else idle
8. Caption: További célizmok a hátul nézetben.
9. Muscle labels with role dots, in this order: Mell (primary dot) · Oldalsó vállizom (secondary dot) · Tricepsz (secondary dot)
10. Section label: Eszköz — one label: Rúd
11. Section title: Végrehajtás — five numbered steps, English:
    1. Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movement between the forearms and the upper arms), lift the bar from the rack and hold it straight over you with your arms locked. This will be your starting position.
    2. From the starting position, breathe in and begin coming down slowly until the bar touches your middle chest.
    3. After a brief pause, push the bar back to the starting position as you breathe out. Focus on pushing the bar using your chest muscles. Lock your arms and squeeze your chest in the contracted position at the top of the motion, hold for a second and then start coming down slowly again. Tip: Ideally, lowering the weight should take about twice as long as raising it.
    4. Repeat the movement for the prescribed amount of repetitions.
    5. When you are done, place the bar back in the rack.
12. Section title: Helyettesítő gyakorlatok — a strip that runs off the right edge (the product returns eight for a chest exercise). Name the shared set's four, the last one drawn cut by the edge: Fekvenyomás kézisúlyzóval / Kezdő · Fekvenyomás gépen / Kezdő · Fekvőtámasz / Kezdő · Ferde nyomás kézisúlyzóval / Kezdő
13. Tab bar: Kezdőlap · Edzés (lit) · Étkezés · Haladás · Profil

### Frame 2 — "Exercise detail · back view" — the catalogue's "Húzódzkodás" (free-exercise-db "Pullups", shared set §2.5 row 4), the movement named second in today's "Felsőtest – húzás"; Hátul selected (member, 5 tabs)

The link to today's session is by name only: no screen leads from the session to this page, and the demo seed picks the session's pull-up with the name pattern `pull-ups`, which cannot match "Pullups" (no hyphen), so the row behind the seeded session is a different one that was not identified. The values below are the "Pullups" row.

1. Back link: Gyakorlatok
2. Media slot: no media
3. h1: Húzódzkodás
4. Meta: Kezdő · Erő
5. Section label: Izomcsoport
6. View switch: Elöl · Hátul (selected)
7. Figure, back view: Széles hátizom = primary (full lime); nothing else lit (the secondary, Bicepsz, is on the front)
8. Caption, exactly as the app prints it: További célizmok a elöl nézetben.
9. Muscle labels: Széles hátizom (primary dot) · Bicepsz (secondary dot)
10. Section label: Eszköz — Saját testsúly
11. Section title: Végrehajtás — five English steps; the first: "Grab the pull-up bar with the palms facing forward using the prescribed grip. …" (step 3 is the longest, about 420 characters); the last: "Repeat this motion for the prescribed amount of repetitions."
12. Section title: Helyettesítő gyakorlatok — a strip of eight that runs off the right edge, in this order: Váltott evezés kettlebellel / Haladó · Alternating Renegade Row / Profi · Segített húzódzkodás gumiszalaggal / Kezdő · Előredőlt evezés rúddal / Kezdő · Előredőlt egykaros hosszú evezés rúdon / Kezdő · Előredőlt kétkaros hosszú evezés rúdon / Haladó · Bent Over Two-Dumbbell Row / Kezdő · Bent Over Two-Dumbbell Row With Palms In / Kezdő. Only the first two or three fit the viewport.
    This replaces the earlier hand-picked set (Előredőlt evezés rúddal · Húzódzkodás alsó fogással · V-Bar Pulldown · Széles fogású hátlehúzás), which the product could not show: the server returns only the FIRST eight exercises sharing the primary muscle, A–Z by the ENGLISH name, and this muscle has more than eight such exercises under A and B, so names from C onward never reach the strip. The eight above are the upstream free-exercise-db rows mapped to Széles hátizom as primary that sort first (Alternating Kettlebell Row, Alternating Renegade Row, Band Assisted Pull-Up, Bent Over Barbell Row, Bent Over One-Arm Long Bar Row, Bent Over Two-Arm Long Bar Row, Bent Over Two-Dumbbell Row, … With Palms In; muscles and levels read from the upstream files on 10 Oct, names from the repo's composer). Three have no Hungarian name and show in English; entries carry no language mark. Each of the eight was confirmed one by one; what was NOT proven is that nothing else sorts in between (the full upstream list was not walked, wger-sourced rows of the same muscle carry no difficulty word and may slot in, and the app database was not opened).
13. Tab bar: Kezdőlap · Edzés (lit) · Étkezés · Haladás · Profil

### Frame 3 — "Exercise detail · rejected submission" — the coach's own exercise, sparse content (Kovács Péter, 6 tabs)

Values are the demo seed's rejected row (`seed-demo.mjs`, section 13), used as they are.

1. Back link: Gyakorlatok
2. Notice, above the media slot: Ezt a beküldést elutasították — and under it the reason: A leírás nem elég részletes, és nincs kép a kiindulási helyzetről.
3. Media slot: no media
4. h1: Demó – Névtelen gépes gyakorlat
5. Meta: Kezdő · Erő
6. (no Izomcsoport section, no Eszköz section: the row has neither)
7. Section title: Végrehajtás — 1. Ülj a gépbe. · 2. Told el.
8. (no Helyettesítő gyakorlatok section)
9. Tab bar: Kezdőlap · Edzés (lit) · Étkezés · Haladás · Edző · Profil

Pending variant of the same frame (swap, do not add): notice = Beküldve — moderálásra vár. · h1 Demó – Bolgár kitörés · Haladó · Erő · section Izomcsoport with Elöl selected: primary Négyfejű combizom lit, caption További célizmok a hátul nézetben., labels Négyfejű combizom (primary dot) · Farizom (secondary dot) · Végrehajtás with three Hungarian steps: "Állj a paddal háttal, egy lépés távolságra, és tedd a hátsó lábfejed a padra." / "Ereszkedj le, amíg az első comb nagyjából párhuzamos a talajjal, a törzs maradjon egyenes." / "Nyomd magad vissza az első sarkadon keresztül. A térd a lábfej vonalában maradjon." · unlike the rejected row, this one HAS the Helyettesítő gyakorlatok strip (it has a primary muscle, so the server returns eight catalogue exercises for Négyfejű combizom; which eight was not checked; a real member of that group is Guggolás rúddal / Kezdő, §2.5 row 1). (The seed attaches a blank 320 × 180 placeholder image to this row, so "Eszköz" is hidden there, although the row carries Pad and Kézisúlyzó; it is not a real photo and must not be drawn as one.)

## Images

| Could help | Why it is truthful | Exists today |
|---|---|---|
| The mannequin with THIS exercise's muscles lit (primary full lime, secondary the weaker step; brief M-15 keeps 100 % / 40 %) | It is the product's only picture that is also data, and the catalogue has nothing else to show. With no media it can carry the top of the screen instead of an empty slot. | In `assets/pulse/manifest-app.json` (uploaded, with hash): `muscle-figure-front` (chest baked in lime: fits frame 1's primary; the shoulder secondary needs an overlay) · `figure-back-pull` (back view, but lats + traps + rear shoulders all lit: more than frame 2 needs; look reference). Generated on 10 Oct, raw only (`assets/pulse/app/raw/`, not yet in the manifest, no hash): `figure-front-press` (chest bright, both shoulder caps dimmer: frame 1 as specified) · `figure-back-lats` (only the two lats lit: frame 2 as specified) · `figure-front-legs` (quads only: the pending variant's Elöl view) · `figure-front-neutral`, `figure-back-neutral` (nothing lit). Read the manifest when drawing; use a raw one only once it has been processed and uploaded. |
| An equipment still keyed by the exercise's equipment (the detail payload carries equipment, unlike the list rows) | Answers "what do I need", next to "Eszköz". A reusable object shot, not a picture of the movement. | In the manifest: `equip-barbell` (Rúd), `equip-machine` (Gép). Raw only since 10 Oct: `equip-bodyweight` (a pair of gymnastic rings, for Saját testsúly), `equip-dumbbell`, `equip-cable`, `equip-bench`, `equip-kettlebell`, `equip-band`. |
| Nothing at all: a typographic top | Honest about a catalogue without media. | — |

Must NOT be shown as if it existed: a photo, GIF or video of the movement · a play control over anything · gallery dots or a carousel · step illustrations · thumbnails on substitute entries (their payload is id, name, difficulty only) · an author / coach avatar. The old vector anatomy drawing is rejected by the owner.

## Do not invent

- Any primary button: "Hozzáadás az edzéshez", "start", "add to plan", "log this", "swap into my workout". No lime pill here.
- Favourite / bookmark, share, report, rating, reviews, comments.
- Sets / reps / weight suggestions, "last time", personal records, 1RM, charts or history for this exercise; calories; duration.
- Tappable muscle regions, or muscle / equipment labels that filter the library.
- The legend "Fő célizom / Segédizom", activation percentages, more than two muscle roles, a muscles-as-text list with role words.
- "You have this / you are missing this" marks on equipment for a member.
- Source or attribution line, author name, created / submitted date (the date is in the payload and not rendered).
- Edit, delete, submit-for-review, resubmit or "fix and send again" controls on one's own exercise (API only).
- A "translate" or "show original" control; Hungarian step text for catalogue exercises.
- Extra content sections: tips, common mistakes, safety, breathing, variations, tags; a difficulty meter graphic beyond the one word.
- Previous / next exercise pager, breadcrumb, "back to results" that restores the filter.
- Substitute entries with pictures, muscle tags, a language mark or a swap action; a "see all" link (8 is the cap).
- A retry button or an "offline" illustration on this screen as an existing feature (planned only; label it planned if drawn).
- An on-screen title "Gyakorlat részletei", a top app bar with actions, a kebab menu.

## Notes for the designer

- **No filled shape on this screen.** With no primary action, V1's single lime pill is absent. Keep the view switch neutral (text + underline), so the only light is the muscles.
- **The title is long.** 33 characters in frame 1; composed catalogue names run past 40, e.g. "Negatív döntésű fekvenyomás kézisúlyzóval" (41) and "Váltott ferde bicepszhajlítás kézisúlyzóval" (43, upstream "Alternate Incline Dumbbell Curl"); the longest in the catalogue was not measured, and the API allows 120. It must wrap to 2–3 lines and may not be truncated; pick the display size for that, and keep the back link (44 pt) above it as the sub-screen header.
- **ő / ű at display size**: Helyettesítő, Fekvőtámasz, Négyfejű combizom, Elülső vállizom, Előredőlt.
- **English body under a Hungarian name.** Steps are English, long (279 and 365 characters in frame 1, about 420 in frame 2) and unmarked; the language mark reacts to the name only. The step text in frames 1–2 is the upstream public-domain dataset's wording. It was compared with the upstream files on 10 Oct (free-exercise-db `Barbell_Bench_Press_-_Medium_Grip.json`: 5 steps, all five as printed in frame 1; `Pullups.json`: 5 steps, first sentence and last step as quoted, step 3 the longest); level, muscles and equipment agree too. The comparison was read through a fetch tool, not a byte diff, and the app database is encrypted and was not opened, so treat a stray character as possible.
- **Caption grammar.** On the back view the app prints "További célizmok a elöl nézetben." ("a elöl"). It is the live output of the template; flag it to the owner, do not silently correct it in the mockup.
- **The role key is colour only.** Primary vs secondary is carried by the figure's two lime steps and the dots on the labels; no word says which is which. Keep the dot and the lit region the same two values.
- **Notices without a box.** V1 has no cards: the rejected / pending notice needs an open-field form (semantic colour, a rule, type). Use the brief's `danger` #F87171 and `info` #60A5FA, never lime. The reason can be 500 characters.
- **Substitutes are weaker than the heading promises.** Ranking is "shares a primary muscle", then A–Z by the ENGLISH name, capped at 8. In practice the entries are the alphabetically first exercises of that muscle, in an order that looks random in Hungarian, with English names mixed in (for a chest exercise e.g. "Around The Worlds / Haladó", "Barbell Guillotine Bench Press / Haladó") and no difficulty word on wger-sourced rows. Frame 2 shows that honestly. The four Hungarian entries of frame 1 are the shared sample set (§6.6), kept verbatim and in its order: they are real chest exercises, but they are not what the live strip would hold (their English names start with D, I, M and P, and at least ten chest exercises sort before them), and the product's own sort would put them Fekvenyomás kézisúlyzóval · Ferde nyomás kézisúlyzóval · Fekvenyomás gépen · Fekvőtámasz. The honest strip for frame 1, built the same way as frame 2's (upstream rows confirmed one by one, composer names, same caveats): Váltott padlós nyomás / Kezdő · Around The Worlds / Haladó · Barbell Guillotine Bench Press / Haladó · Ferde közepes fogású fekvenyomás rúddal / Kezdő · Hát mögötti fejmellnyújtás / Profi · Fekvenyomás gumiszalaggal / Kezdő · Bent-Arm Dumbbell Pullover / Haladó · Tárogatás saját testsúllyal / Haladó. Whether the mockup shows the tidy set or the real mix is the owner's open decision (feature inventory §2.8, item 11); until he decides, frame 1 keeps the shared set and frame 2 shows the real one.
- **Equipment shows because media is missing.** It is conditional in code; for the catalogue it is always there. Hungarian equipment labels: Rúd, Kézisúlyzó, Gép, Kábel, Pad, Saját testsúly, …
- **Demo-seed artefact.** The seeded submissions (frame 3 and its pending variant) have no translation row, so the running demo prints "EN" beside "Kezdő · Erő" (and beside "Haladó · Erő") although the text is Hungarian. An exercise created through the API does not; draw frame 3 without it.
- **Glyphs the live screen draws that are not content.** A left arrow in the back link; an icon tile before "Izomcsoport" (standing figure) and before "Végrehajtás" (numbered list), none before "Eszköz" or "Helyettesítő gyakorlatok"; a tick on the selected view chip; the step numbers in small accent-tinted discs; a warning / info glyph in the two notices; the dumbbell in the empty media slot. The icons are line icons of the old skin. Only the step numbers and the back affordance carry meaning; the rest need not survive, and none should come back as a basic line icon (the owner rejected those).
- **Known defects, not states to design:** a failed request reads "Nincs találat"; a non-numeric id (`/library/abc`) leaves the skeleton up forever.
- **Reach.** The only doors are a library row and a substitute entry; the workout player, the plan and Home's today block do not link here, and the library itself has one door on a phone (Home's empty state). The back link drops the user on an unfiltered list.
- **Scroll.** Long page, fixed tab bar: the last section must clear the bar and its fade.
- **Frame 3 needs the six-tab bar.** The V1 kit holds five tab icons (`tab2-home` … `tab2-profile`); an "Edző" icon in the same lime-lit 3D family has to exist before the coach frame can be drawn. A whistle ("Edző") and a shield ("Admin") were generated on 10 Oct but exist only as two raw candidate sheets (`assets/pulse/app/raw/icons-staff-a.png`, `-b.png`): not sliced into icons and not in the manifest. If they are still not there, draw frame 3 last.
