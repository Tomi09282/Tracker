# Pulse implementation — the screens: size of the work

Status: COMPLETE (sections 0–7; written incrementally, the last line of the file repeats the status).
Phase: understand (read-only on the codebase). Branch `pulse-redesign`, nothing committed on it.
Date: 2026-10-11.

## 0. How to read this

- One block per screen of `docs/brain/58-Pulse/0000 Index.md` (24 screens, 59 frames), in the Index order.
- Every block: route -> page component -> owned files with line counts -> shared UI used -> box census -> verdict (RE-SKIN / RE-COMPOSE / NEEDS DATA OR BEHAVIOUR) -> frames that cannot be reached with today's product.
- Line counts are `wc -l` of the working tree on 2026-10-11. Box census numbers come from a regex scan of `frontend/src/features/**/*.tsx` (script kept out of the repo); the vocabulary is the project's real one, measured, not assumed.
- Verdict vocabulary:
  - **RE-SKIN** — the JSX tree stays, classes and shared components change.
  - **RE-COMPOSE** — same data and hooks, but blocks are reordered, merged or replaced by a different shape (card list -> one subject line, tile grid -> ledger rows).
  - **NEEDS** — the frame shows data or behaviour the frontend (or the API) does not have. Backend is frozen in this phase, so every NEEDS item is either a frontend-only addition, a cut, or an owner decision.

## 1. The codebase in numbers

### 1.1 Feature code

`frontend/src/features` holds 55 `.tsx` files, 17 359 lines (plus 23 `.ts` hook/logic files, 3 782 lines, that Pulse does not need to touch). `frontend/src/app` is 5 files, 463 lines.

Box-drawing vocabulary, measured over `features/**/*.tsx`:

| Pattern | Uses | Meaning in Pulse |
|---|---|---|
| `<Surface` | 96 | the card. Pulse has ONE surface (the bottom sheet). Every one of these goes or becomes a ruled section |
| `rounded-card` (+ 2 `rounded-[var(--card-radius)]`) | 97 | card radius, also on skeleton blocks |
| `rounded-chip` | 99 | chip / icon-disc / pill radius |
| `rounded-field` | 57 | boxed input, boxed cell |
| `rounded-full` | 21 | avatar discs, dots, pills |
| `bg-surface-1/2/3`, `bg-[var(--card-bg)]`, `bg-[var(--field-bg)]` | 84 | filled panels and wells |
| `bg-*-subtle`, `bg-[var(--tile-tint)]` | 94 | tinted status chips, tinted tiles, selected chips |
| `border*` classes | 215 | outlines (41 bare `border`, 39 `border-[var(--surface-border)]`, 35 `border-[length:var(--border-width)]`, 23 `border-accent`) |
| `variant="primary"` | 36 | filled accent buttons. Pulse allows one per screen |
| `variant="secondary"` | 54 | outlined buttons. Pulse has none: second actions are text |
| `variant="danger"` | 5 | red filled buttons. Pulse has none: danger is text, confirmed in a sheet |
| `size-icon-*` (lucide glyph call sites) | 228 | icon-at-rest in lists, tiles and headings; most are decoration Pulse removes |
| centred layout (`text-center`, `place-items-center`, `mx-auto`, ...) | 119 | Pulse is left-aligned |
| `shadow-[...]`, `backdrop-blur` | 2 + 1 | only `RestTimer` and two overlays reach for them directly; everything else gets glass through `Surface` |

Type classes in features (1 157 uses of `text-*`): `text-body-s` 141, `text-caption` 134, `text-micro` 54, `text-body` 45, `text-title-3` 33, `text-title-1` 24, `text-body-strong` 24, `text-display` 20, `text-title-2` 13, `text-timer` 3; `font-display` 24. These are role names, so the Pulse ramp can land on them in `tokens.css` without touching call sites — but the ramp is not 1:1 (Pulse has `giant` 124, `num` 48, `displayXL` 48, `eyebrow` 16 upper, `dataL`/`data`/`micro` mono, which have no current class).

### 1.2 Shared UI the screens lean on (`frontend/src/ui`)

| Shared piece | File (lines) | Call sites in features | Pulse fate |
|---|---|---|---|
| `Surface` + `surface()` recipe | `ui/primitives/Surface.tsx` (44), `surfaceRecipe.ts` (119) | 96 JSX uses in 33 files | removed from pages; survives only as the sheet |
| `Pressable` + `control()` / `chip()` | `ui/primitives/Pressable.tsx` (67), `control.ts` (175) | `<Pressable` 166 uses in 39 files; `control(` 6 in 3, `chip(` 3 in 3 | re-cut: primary pill, text link, bare icon button; `secondary`, `danger`, chip tones go |
| `Field` | `ui/primitives/Field.tsx` (179) | 23 in 12 files | becomes the underline field |
| `Switch` / `Toggle` | `Switch.tsx` (84), `Toggle.tsx` (18) | 2 in 2 / 8 in 5 | Switch stays a shape (48x28); Toggle (chip toggle) becomes a word chip with a lime mark |
| `SummaryTile` | `ui/data/SummaryTile.tsx` (196) | 12 in 7 files | the stat tile. Pulse forbids it: becomes `ledgerRow` / `statBlock` / `macroCol` |
| `SectionHeader` | `ui/data/SectionHeader.tsx` (89) | 13 in 8 files (one is the `library/SectionBadge` wrapper) | becomes `sect()` = strong rule + eyebrow + trailing link; the leading icon goes |
| `DataTable` | `ui/data/DataTable.tsx` (168) | 1 (`admin/UserSearch`) | two-line rows on a phone |
| `EmptyState` | `ui/feedback/EmptyState.tsx` (105) | 35 in 24 files | left-aligned title + body + pill or link; the icon disc goes |
| `Gauge` (ring) | `ui/feedback/Gauge.tsx` (158) | 7 in 7 files | no ring anywhere in Pulse: hero numeral + segment bar |
| `CountUp` | `ui/feedback/CountUp.tsx` (81) | 8 in 8 files | kept (count-up is in the motion spec) |
| `TrendChart` / `ProgressChart` | 302 / 53 (+ `chartGeometry.ts` 88) | 2 / 1 | restyled: 1.5 px line, end dot, hairline axes, no area, no box |
| `ScreenSkeleton` / `Skeleton` | `ui/feedback/ScreenSkeleton.tsx` (45) | 37 feature files + `app/router`, `app/RequireAuth` | `s2` blocks radius 2 at text height; today's call sites pass `rounded-card` |
| `ToastHost` | `ui/feedback/ToastHost.tsx` (183) | 6 feature files + `app/providers` | bottom capsule today; Pulse = band dropping from the status zone |
| `Sheet` (bottom sheet) | `ui/feedback/variants/E14E20.tsx` (948; `Sheet` at line 125) | 6 feature files: `ClientDetailPage`, `CoachDashboard`, `ComposePage`, `PostEditorPage`, `PlanEditorPage`, `ProgressPage` | THE one Pulse surface. Today it is one of five style-studio variants of element E14 |
| `BottomNav` | `ui/nav/BottomNav.tsx` (202) | `app/AppLayout`, `playground` | capsule + lucide today; Pulse = no capsule, raster icon set |
| `MuscleMap` | `ui/muscle-map/*` (339 + 249 + 903) | 3 (`library`, `exercise-detail`, `workout`) | owner decision 4 (mannequin kit) — see the library block |
| Element variants `E1..E20` | `ui/feedback/variants/*` (12 files, 7 932 lines) | besides `Sheet`: `CopyButton` (`CoachDashboard`), `Segmented` (`PostEditorPage`), `FeedbackField` (`LibraryPage`); everything in `playground` | the Style Studio's catalogue: five looks per element. Pulse has one look per element — see screen 24 |

### 1.3 Things two features both import that are NOT in `src/ui`

These are the collision points for parallel work. Whoever owns the file has to land first or the two packages must agree on its props.

| File (lines) | Lives in | Imported by | What it is |
|---|---|---|---|
| `features/coaching/Monogram.tsx` (40) | coaching | `coaching/ClientDetailPage`, `coaching/CoachDashboard` only (3 JSX uses) — but Pulse draws a monogram on many more screens (profile hero 176, list rows 28, headers 64) and `lib/person.ts` (131) is already imported by 11 feature files for initials, each drawing its own disc | must move to `src/ui` as the Pulse `Monogram` before screen work |
| `features/chat/NotificationBell.tsx` (63) | chat | `home/HomePage`, `coaching/CoachDashboard` | header bell + badge |
| `features/chat/ChatPanel.tsx` (410), `features/chat/useChat.ts` (223) | chat | `chat/ChatPage`, `coaching/ChatTab` | the thread + composer |
| `features/marketplace/DocRenderer.tsx` (236) | marketplace | `marketplace/PostPage`, `marketplace/CoachProfilePage`, `compose/ProfileEditorPage` (preview), `compose/useCompose.ts` (type), `marketplace/usePublic.ts` (type) | renders the coach's rich text |
| `features/marketplace/usePublic.ts` (188) | marketplace | `compose/PostEditorPage`, `compose/ProfileEditorPage` | types + city list |
| `features/marketplace/PublicChrome.tsx` (254) | marketplace | the three public pages + `DocRenderer` | public header, kind tag, coach line, cover |
| `features/nutrition/useNutrition.ts` (212) | nutrition | `home/HomeNutrition`, `coaching/NutritionTab` | hook only — no JSX collision |
| `features/nutrition/NutritionCard.tsx` (64) + `MacroBars.tsx` (93) | nutrition | **nobody** — `NutritionCard` has no importer; `MacroBars` is imported only by `NutritionCard` | dead code (157 lines). Home draws its own macro block with `SummaryTile` |
| `features/library/useExercises.ts` (150) | library | `workout/WorkoutPlayer`, `plans/PlanEditorPage`, `coaching/ClientEquipmentCard` | hook only |
| `features/plans/usePlans.ts` (208), `plans/useOnline.ts` (27) | plans | `coaching/ClientDetailPage`, `coaching/PlanTab`, `coaching/CoachDashboard` | hooks only |
| `features/coaching/useCoaching.ts` (248) | coaching | `plans/PlanEditorPage` | hook only |
| `features/onboarding/useOnboarding.ts` (154) | onboarding | `settings/EquipmentSection` | hook only |
| `features/workout/cues.ts` (238) | workout | `settings/CueSettings` | logic only |
| `features/workout/useWorkout.ts` (277) | workout | `home/HomePage` | hook only |
| `features/auth/useSession.ts` (103) | auth | `app/*` + 8 feature files | hook only |
| `features/playground/PlaygroundPage.tsx` (469) | playground | `admin/StyleStudioPage` (imports the specimen renderers) | JSX collision: studio preview = playground specimens |
| `features/admin/useElementStyles.ts` (49) | admin | `admin/StyleStudioPage` only | — |

Hook files carry no markup, so a screen package can import them freely without owning them. The JSX collisions are six: `Monogram`, `NotificationBell`, `ChatPanel`, `DocRenderer`, `PublicChrome`, `PlaygroundPage`.

Also unimported (dead) today, verified with a grep for importers: `features/settings/AccentPicker.tsx` (129) and `GradientBuilder.tsx` (140) — the inventory lists the custom-accent builder as "cut: files kept unimported"; `ui/TokenProof.tsx` (259). `features/coaching/ChatTab.tsx` (69) is still imported by `ClientDetailPage`. Nobody should spend Pulse time on the dead files; deleting them is a separate, trivial item (`noUnusedLocals` does not flag unimported modules, so they compile).

### 1.4 Build gates a screen implementer meets (all run inside `npm run build`)

Not this note's area in depth (see the gates note of this phase), but four of them decide how screen packages may be cut:

| Gate | What it does to screen work | Evidence |
|---|---|---|
| `check:nav` rule 6 "every route has a door" | a route with no `to="..."` / `navigate('...')` literal anywhere in `src` fails the build. A re-composed page that drops a link can take a route's only door with it | `frontend/scripts/check-nav.mjs:128-185`; exemptions at `:39-50` |
| `check:i18n` | all three bundles must hold the same keys; a key no code references fails ("delete it or use it"); a `t('x')` with no bundle entry fails; literal `aria-label` / `sr-only` / `placeholder` text fails | `frontend/scripts/check-i18n.mjs:81-102, 238, 398, 435-441` |
| `check:elements` | the Style Studio catalogue (`ui/feedback/catalog.ts`, `live` flags) must match the measured `useElementVariant('E..')` call sites and the playground's `PREVIEWABLE` list. Removing a variant read from a screen without updating the catalogue fails | `frontend/scripts/check-element-roster.mjs:102-180` |
| `check:tokens` | raw `<button>` outside `src/ui` (`:86-87`), a utility or colour class that `tokens.css` does not declare (`undefined-utility` `:341`, `undefined-color` `:357`, `undeclared-token` `:297`) are refused unless the line is annotated `token-lint-disable` with a reason. So a screen cannot use a Pulse class name before the tokens package has declared it | `frontend/scripts/check-tokens.mjs:86-87, 275-375` |

The doors that exist today (grep of every `to=` / `navigate(` literal outside `router.tsx`), because a screen package must keep the ones it owns:

| Route | Door(s) | Owner package must keep |
|---|---|---|
| `/library` | `home/HomePage.tsx:225` (empty state only) + back links `library/ExerciseDetailPage.tsx:81,108` | Home's `navigate('/library')` is the only real door on a phone |
| `/workout` | tab + `home/HomePage.tsx:62,115` | — |
| `/notifications` | `chat/NotificationBell.tsx:29` | the bell |
| `/coins` | `settings/SettingsPage.tsx:272` | Profil's "Érmék" row |
| `/admin` | tab + `settings/SettingsPage.tsx:335` | — |
| `/admin/styles` | `admin/AdminPage.tsx:221` | the "Stílus stúdió" link in the admin header |
| `/coach/plans` | `coaching/CoachDashboard.tsx:229`, `plans/PlanEditorPage.tsx:332` | the "Tervek" link on the dashboard |
| `/coach/clients/:id/chat` | `coaching/ChatTab.tsx:53` — the ONLY door | the "Üzenetek" tab of the client page |
| `/compose` | only back links: `compose/PostEditorPage.tsx:214,295`, `compose/ProfileEditorPage.tsx:277,278,294` | no forward door exists on a phone (product gap) — the gate passes on the back links |
| `/compose/profile`, `/compose/posts/new` | `compose/ComposePage.tsx:311,535,401` | — |
| `/m` | only back links: `marketplace/PostPage.tsx:71`, `marketplace/CoachProfilePage.tsx:80` | same situation as `/compose` |
| `/nutrition` | tab + `home/HomeNutrition.tsx:65` (+ dead `nutrition/NutritionCard.tsx:54`) | — |

i18n: `frontend/src/i18n/{hu,en,de}.json`, 1 044 lines each, 876 leaf keys in 33 top-level namespaces. The namespaces follow the feature folders (`home` 13, `workout` 68, `library` 22, `muscle` 20, `muscleMap` 9, `nutrition` 20, `progress` 52, `settings` 53, `coins` 24 + 7 `achievement.*`, `notifications` 10, `chat` 18, `onboarding` 86, `coaching` 72, `plans` 56, `compose` 129, `marketplace` 24, `public` 14, `auth` 25, `admin` 66, `adminUsers` 14, `adminMetrics` 14, `studio` 16; shared: `common` 20, `nav` 19, `offline` 2, `palette` 3). So a screen package's bundle edits fall inside its own namespace block and merge line-disjoint; only `common` and `nav` are contested. `adminMetrics` (14 keys) is referenced only by `features/admin/AdminMetrics.tsx`, which nothing imports — see screen 23.

## 2. The screens

Frame references are the 2x PNGs in `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x/` and the per-screen sheets in `.../osszesitok/<screen>.png` (all 24 sheets were looked at for this note).
"BOX" = `<Surface` + `rounded-card|field|chip` + filled `bg-surface-*` / tinted `bg-*-subtle` + `border*` class uses in the listed `.tsx` files — the count of things that draw a box and have to go.

### Tag (member) — 10 screens

#### 1. Kezdőlap — `/` — RE-COMPOSE

- Route `router.tsx:112` (`index`, eager import `:7`) -> `features/home/HomePage.tsx`.
- Files: `home/HomePage.tsx` 247 · `home/WeekStrip.tsx` 180 · `home/HomeNutrition.tsx` 107 · `home/useToday.ts` 27 (untouched) — 534 lines of JSX. Uses `chat/NotificationBell.tsx` 63 (shared with the coach dashboard) and hooks `workout/useWorkout`, `nutrition/useNutrition`.
- Shared UI: `Surface` x4, `SectionHeader` x2, `SummaryTile` (4 tiles from one JSX site, `HomeNutrition.tsx:78`), `EmptyState` (anchor size), `Gauge` + `CountUp` (`WeekStrip.tsx:105-111`), `Pressable` primary x2 / secondary x1, `Skeleton`. BOX 19 (+4 in the bell).
- Frames: `home-1` training day · `home-2` session running · `home-3` nothing planned.
- What changes in structure:
  - Week panel: a card holding a 160 px ring + a 7-cell bordered grid (`WeekStrip.tsx:94-177`) becomes the hero `statBlock` — eyebrow "HETI EDZÉS", `giant` fraction `2/4`, `segBar` of 7 with mono weekday letters and a today dot — with the `hero-grip` photograph bleeding off the right edge. Same query, same numbers.
  - Today: a `ul` of day cards each with its own outlined "Indítás" (`HomePage.tsx:121-201`) becomes ONE subject line (`displayXL` day name, plan name as body, mono meta "18:00 · 5 gyakorlat" in the section head) and ONE lime pill. The running-session card (`:105-119`, accent-tinted Surface) becomes the same block with a live dot + "Edzés folyamatban" in the section head and "Folytatás".
  - Nutrition: `SectionHeader` + 4 `SummaryTile`s become `sect()` + 4 `macroCol`s (name, mono value + unit, 4 pt bar, "cél 180 g").
  - Empty: `Surface` + centred `EmptyState` with icon + badge becomes the `hero-plates` still, a left-aligned `display` title, body, pill "Gyakorlatok böngészése" (keeps `navigate('/library')`, the library's only real door).
- Data: nothing missing for what is drawn. `TodayDay` (`useToday.ts:4-17`) carries every field in frame 1.
- Decisions the code has and the frames do not show (do not drop silently):
  - **Several plan occurrences today** (two slots or two active plans; `days.map`, inventory §1.4). The frame draws one. A rule is needed: first not-yet-trained occurrence is the subject and takes the pill, the others follow as plain list rows with a text "Indítás" — otherwise a second session becomes unreachable.
  - **Rest day** (`is_rest`, `HomePage.tsx:132`) and **already trained** (`log_id != null`, `:134`) have no frame. Proposal: same subject block, no pill, trailing status word ("Pihenőnap" / "Kész"), numeral and bar stay.
  - **Week query failed** -> "Újra" (`WeekStrip.tsx:98-103`): keep as a `textLink` in the numeral's place; failed = "—", never 0.
- Not reachable / do not implement as drawn: none of the three frames is a mock. Frame 2's "3/4" is honest only because a started session already counts (inventory open decision 3). Product gap: after the first "Indítás" frame 2 is permanent (no finish action) — owner decision 2.
- Size: **M**. First thing the owner looks at; one of the two approved V1 screens (`_jovahagyott-v1-home@2x.png`).

#### 2. Edzéslejátszó — `/workout` — RE-COMPOSE + NEEDS (mannequin asset)

- Route `router.tsx:139` -> `features/workout/WorkoutPlayer.tsx`.
- Files (JSX): `WorkoutPlayer.tsx` 556 · `SetRow.tsx` 598 · `RestTimer.tsx` 181 · `IntervalStage.tsx` 214 = 1 549. Logic, untouched: `useWorkout.ts` 277, `useIntervalTimer.ts` 359, `intervalPlan.ts` 207, `cues.ts` 238, `wakeLock.ts` 61 (`check:interval` reads the interval logic; `verify:outbox` covers the set-check queue).
- Shared UI: `Surface` x4 (hero `finish="glass"` `WorkoutPlayer.tsx:312`, set-list frame `:458`, skeleton `:238`, rest timer `elevation="sheet" finish="glass"` `RestTimer.tsx:129`), `MuscleMap` (`:362`, `sideControl="segmented"`), `EmptyState`, `Pressable` secondary x3 (switcher chips) + 4 in `IntervalStage`, `ToastHost` (`placement: 'top'` at `:296` — the only top toast in the app). BOX 44. Style-studio reads: `useElementVariant('E21')` `SetRow.tsx:136` (set row, 5 variants in 598 lines) and `('E22')` `RestTimer.tsx:41`.
- Frames: `workout-1` set 3 of 4 · `workout-2` record + rest · `workout-3` no session.
- What changes in structure:
  - Hero: today a glass panel 34dvh tall holding the SVG map at full bleed, then a separate title row with a counter pill (`:441-449`). Pulse: counter "1 / 5" (mono) and the "Videó" text toggle on top, `display` title (two lines reserved) on the left with the Elöl/Hátul `segSwitch` and legend under it, the graphite figure small on the right. No panel.
  - Set list: a framed Surface with 56 px rows of boxed inputs (`SetRow.tsx:382`, `:434-444`) becomes hairline-divided rows with `num` 48 pt values on underlines, mono "previous", a ring / lime tick `setCheck`; the active row's check is the screen's one lime shape. Row height changes from 56 to about 65 — the no-scroll height budget (`WorkoutPlayer.tsx:50-86`) has to be re-derived.
  - Switcher: outlined chips (`:505-545`) become words with a mono count above and a 2 pt ink mark under the current one.
  - Rest timer: a pinned glass sheet (`RestTimer.tsx:129`) becomes an in-flow block that takes the switcher's place: `giant` clock, "Pihenő átugrása" text with x, "Következik:" + name, a draining lime line.
  - Record: caption "Új rekord: becsült 1RM" over the index + previous cells, trophy glyph instead of the tick; toast becomes the top band.
- Needs:
  - **Mannequin**: the frames use a rendered graphite figure; stills exist only for back-lats (`kepek/figure-back-lats.png`), not for this exercise's front view or any half-lit secondary level (Product gaps, workout bullet 1). The code's `MuscleMap` is an SVG that can light any of 19 regions. This is owner decision 4 and the same blocker as screens 3 and 4 — one shared piece.
  - Printed "Pihenő átugrása" is today only an accessible name (`workout.skipRest`); the key exists, so no new string.
  - The `E21` / `E22` variant sets: Pulse draws one set row and one rest timer. Either the five variants are re-drawn in Pulse (5x the work in the two largest files of this screen) or the variant switch is retired with the catalogue updated in the same change (`check:elements`). Owner decision — see screen 24.
- States with no frame that exist in code and must survive: loading skeleton, failed-check chips with "Újra" / "Visszavonás", withdrawn row, the whole interval stage (idle / work / interrupted / not configured — `IntervalStage.tsx`, 4 sections), the stand-in hero for an exercise without a map. The screen doc lists them as "system-page states", not frames.
- Not reachable: none of the three. Frame 2 is a one-second coincidence (toast 4 s, caption 1.4 s, clock at 2:59) but real. The frames print Hungarian exercise names; the live player prints the English `exercise_name_snapshot` (`:443`) — do not "fix" in the screen package, it is a data question.
- Size: **XL** (largest behavioural risk: the fixed-viewport law, three timers, offline queue).

#### 3. Gyakorlatok (izomválasztó) — `/library` — RE-COMPOSE + NEEDS

- Route `router.tsx:114` -> `features/library/LibraryPage.tsx` 368 (+ `useExercises.ts` 150, untouched).
- Shared UI: `Surface` x3 (map card `:141`, rows as `Surface as={Link}` `:298`, row skeleton `:47`), `MuscleMap` interactive (`:142`), `SectionHeader icon={Funnel}` (`:204`), `FeedbackField` (the E7 style-studio field) for search, `EmptyState`, `Pressable` chips. BOX 11.
- Frames: `library-1` default (hint) · `library-2` Mell selected, front · `library-3` Széles hátizom selected, back. (The Index names five states; three PNGs exist.)
- What changes in structure: header `display` title + search `iconBtn`; hero = eyebrow "IZOMCSOPORT", the selected muscle as `displayXL` (or the hint "Koppints egy izomra a szűréshez"), "x Szűrők törlése" text link, Elöl/Hátul `segSwitch`, and the large mannequin on the right; then a `chipRow` bleeding off the right edge; then `listRow`s with a 48 px equipment glow thumb, title, "Kezdő · Erő" sub, "EN" mono tag when untranslated, chevron.
- Needs:
  - **Mannequin as an interface** (owner decision 4): lit stills exist for Mell, Négyfejű combizom, Széles hátizom only; 16 mapped muscles have none; the render's panels do not match the 19-region roster. Until decided the only shippable figure is the existing SVG, re-toned.
  - **Row thumbnails**: `ExerciseRow` (`useExercises.ts:4-18`) has `thumb_key` but no equipment key, and the backend is frozen. Rows are text-only in this phase (the system allows it: "a text-only list is always acceptable; a grey placeholder square is not"). Do not fake thumbs.
  - **Behaviour changes the frames assume and the code lacks** (Product gaps, library): chips scoped to the visible side with auto-flip (today all 20 chips on both views); selection surviving Back (today component state — the review brief proposes URL state); the chip strip scrolling the selected chip to the gutter; the hint string `muscleMap.filterHint` exists as a key and is rendered nowhere.
  - **Search open state** is not designed (only the header glyph is). Keep today's field, drawn as `searchField`, revealed by the glyph.
- Not reachable: all three frames are reachable from Home's empty state only; "Edzés" is lit here but the tab opens `/workout` (owner decision 1).
- Size: **L** (M for the page, the rest is the selector behaviour).

#### 4. Gyakorlat részletei — `/library/:id` — RE-COMPOSE + NEEDS (same mannequin)

- Route `router.tsx:115` -> `features/library/ExerciseDetailPage.tsx` 393 · `library/SectionBadge.tsx` 33 (only importer is this page).
- Shared UI: `Surface` x4 (status notices `:131,146,158`, substitute cards `:373`), `MuscleMap` read-only (`:282`), `chip()` x1, `SectionBadge` (icon + heading) x2, `Skeleton`. BOX 27.
- Frames: `exercise-detail-1` front view (Közepes fogású fekvenyomás rúddal) · `exercise-detail-2` back view (Húzódzkodás).
- What changes: pushed header (chevron + "GYAKORLATOK" eyebrow, `display` name, "Kezdő · Erő"); section "IZOMCSOPORT" with the `segSwitch` as trailing node, muscle names as a dot list (lime dot primary, dim dot secondary), "További célizmok a hátul nézetben." caption, mannequin on the right, "ESZKÖZ" with a glow still + name; "VÉGREHAJTÁS" as numbered steps with `num` numerals and hairlines; "HELYETTESÍTŐ GYAKORLATOK" as a horizontal strip of text columns divided by vertical hairlines (not cards).
- Needs: mannequin renders for arbitrary primary/secondary sets (stills cover a handful of the 1 652 exercises); equipment stills for 8 of 16 kinds only (`kepek/equip-*.png` = 8 files) — fall back to the name alone; the caption template yields "a elöl" (needs an article fix = a string change in 3 bundles); h1 needs `text-wrap: balance`.
- Not reachable as drawn: the lit figure for most exercises; "Hátul" of frame 1 and "Elöl" of frame 2 have no render at all. Step text is English in the catalogue (drawn honestly in the frames).
- Size: **M**.

#### 5. Étkezés — `/nutrition` — RE-COMPOSE

- Route `router.tsx:116` -> `features/nutrition/NutritionPage.tsx` 454 (+ `useNutrition.ts` 212, untouched). Dead neighbours: `nutrition/NutritionCard.tsx` 64 and `MacroBars.tsx` 93 have no importer — ignore or delete, do not restyle.
- Shared UI: `Gauge` + `CountUp` (`:145-174`), `Surface` x3, `SummaryTile` (3 macro tiles, `:211`), `SectionHeader icon={Plus}` (`:247`), `EmptyState`, raw `<input type="date">` in a bordered pill (`:126-139`), raw search `<input>` (`:257`), grams `<input>` (`:335`). BOX 29 (5 `rounded-field`).
- Frames: `nutrition-1` today (full scroll) · `nutrition-2` a food picked.
- What changes: root header "TÁPLÁLKOZÁS" with the date as a text trigger + chevron ("Péntek, október 9."); hero "KALÓRIA" `giant` 1840 with the `hero-bowl` still, a 4 pt lime progress bar, plan-day name left and "/ 2600 kcal" right; three `num` macro columns; "HOZZÁADÁS" `searchField`; picked food as title + underline grams field + `num` kcal + the one lime pill "Hozzáadás"; "NAPLÓZVA" grouped by mono meal labels with rows "name / grams" + mono kcal + x.
- Data: complete — `DayTargets.day_name`, targets, `LogItem.meal_label` all exist (`useNutrition.ts:19-48`).
- Needs (frontend only): a custom date trigger over the native picker using Home's formatter; grams and kcal as separate values (today one caption string); unit spacing "128 g"; `kcal` / `g` / `/` are hard-coded literals today; scroll the picked block clear of the tab bar. No error/undo states exist and none are drawn.
- Not reachable: none.
- Size: **M**.

#### 6. Haladás — `/progress` — RE-COMPOSE

- Route `router.tsx:117` -> `features/progress/ProgressPage.tsx` 751 (three tab components in one file: `BodyTab` `:147`, `PhotosTab` `:423`, `SharingTab` `:569`) + `useProgress.ts` 180.
- Shared UI: `Surface` x7, `SummaryTile` (other-metric summaries `:275`), `TrendChart` (`:263`), `Field` x3, native `<select>` (`:299`), `Sheet` (photo delete confirm `:538`), `EmptyState` x2, `ToastHost`, a LOCAL `Toggle` that is a checkbox (`:721`), `Pressable danger` x2. BOX 40.
- Frames: `progress-1` Test (full scroll) · `progress-2` Megosztás · `progress-3` Fotók, empty. (The Index also names an "üres" state; three PNGs exist.)
- What changes: `display` title; page-level `segSwitch` on a hairline (Test · Fotók · Megosztás) instead of the pill tablist (`:92`); Test = `giant` latest value + unit with the `hero-tape` still, unlabeled change figure, full-width chart with hairline axes and mono labels and a "25 nap kihagyás" warn note, a 4-column row of other metrics (mono values, no tiles), the form as underline fields + pill "Mentés", entries as rows with x; Megosztás = "KI LÁTHATJA" + coach name `displayXL`, two rows with switches, danger text "Minden hozzáférés visszavonása", access log rows; Fotók = empty state + "FOTÓ HOZZÁADÁSA" form + pill "Fájl választása".
- Needs: checkbox vs switch for the two sharing controls is an open owner decision (code keeps checkboxes on purpose, design draws switches). No string for the heading over other metrics or for the change figure. The metric picker stays the native select drawn as an underline row (a Pulse picker sheet would be a new component).
- **Not reachable outside the demo seed: `progress-2` (Megosztás with a coach, switches and five log rows).** Nothing in the live UI creates the first share and no coach screen reads the consent or writes the log; a real member sees "Nincs edződ, akivel megoszthatnád." and "Még senki nem nézte meg." Implement the tab against the hook's real shape, verify it with the seed account, and make sure the two empty sentences are the designed default.
- Size: **L** (three sub-screens, a chart, uploads, a form).

#### 7. Profil (Beállítások) — `/settings` — RE-COMPOSE + NEEDS (three reads) + open decisions

- Route `router.tsx:122` -> `features/settings/SettingsPage.tsx` 402 · `ThemeStudio.tsx` 206 · `CueSettings.tsx` 144 · `EquipmentSection.tsx` 92 · `useThemeSync.ts` 54. Dead: `AccentPicker.tsx` 129, `GradientBuilder.tsx` 140.
- Shared UI: `Surface` x6, a LOCAL `SectionHeader` (`SettingsPage.tsx:60`, icon + micro heading), `Field`, `Switch` x1 (in `CueSettings`), `Toggle` (equipment chips), `LanguageToggle` (`ui/nav`), `ThemeProvider` hooks. BOX 37.
- Frames: `settings-1` first view · `settings-2` full scroll. Approved V1 reference: `_jovahagyott-v1-profile@2x.png`.
- What changes: no back header and no centred "Beállítások" title (`SettingsPage.tsx:170-180`) — Profil is a root tab; hero = `monogramMark` 176 with the light texture and lime dot, name (`title`), e-mail, mono role tag; three `ledgerRow`s (Érmék 190, Eredmények 4/7, Testsúly 83,1 kg + sparkline); in-page `display` heading "BEÁLLÍTÁSOK"; display-name underline field; sections Felszerelés (wrapping `chipRow`, trailing status "Felszerelés mentve"), Hangok és rezgés (three rows with switches), Megjelenés (packs as chips, "Áttetsző felületek" as a hug `segSwitch`, trailing "Téma mentése"), Nyelv (trailing `segSwitch`), danger text "Kijelentkezés". Section order changes (equipment moves up from last).
- Needs:
  - The three ledger rows need `GET /coins/wallet`, `/coins/achievements`, `/measurements` on this screen — hooks exist (`coins/useCoins`, `progress/useProgress`), nothing in `settings` calls them today. Frontend-only. Failure renders "—", never 0.
  - "feloldva" alone is not a key (the key is `{{done}} / {{total}} feloldva`) -> one new key in 3 bundles.
  - **Open owner decisions that block two sections**: theme packs in Pulse (decision 3: "a pack changes the colour of the light only" is the proposal) and the "Áttetsző felületek" setting, whose hint describes glass that no longer exists. The frame draws both as they are today. Implement as drawn only after the owner answers; otherwise the tokens work and this screen disagree.
  - Admin link section (`SettingsPage.tsx:331-345`, a second door to `/admin` besides the tab) is not in the frames; admins have the tab, so it can go, but that is a removal to state.
- Not reachable: none (frame content is real once the three reads exist).
- Size: **L**.

#### 8. Érmék — `/coins` — RE-COMPOSE

- Route `router.tsx:118` -> `features/coins/CoinsPage.tsx` 501 (tabs `StoreTab` `:237`, `AchievementsTab` `:366`, `StatementTab` `:448`) · `CoinBalance.tsx` 110 · `useCoins.ts` 175.
- Shared UI: `Gauge` (share-of-lifetime arc `:110`), `SummaryTile` x2 ("Ezen a héten", "Elköltve" `:139-156`), `Surface` x4, `SectionHeader icon={Store}`, `EmptyState` x2, pill tablist (`:164`). BOX 19. Style-studio reads: `'E25'` (`CoinBalance.tsx:53`, balance count-up) and `'E26'` (`CoinsPage.tsx:369`, achievement unlock).
- Frames: `coins-1` Bolt · `coins-2` Eredmények · `coins-3` Kimutatás.
- What changes: pushed header ("PROFIL" eyebrow, "ÉRMÉK"); hero "EGYENLEGED" `giant` 190 with the coin-stack render; the arc and both tiles are NOT drawn (Product gaps, coins: no honest server data behind them) and go; page `segSwitch`; Bolt = rows "name / description" with trailing "✓ Megvan" or coin glyph + price; Eredmények = rows with a medal render (lit lime / dark, `kepek/medal-active.png`, `medal.png`), sub line, lock glyph; Kimutatás = rows with mono signed amounts (lime for credits).
- Needs: the one-lime-pill rule vs two affordable unowned items (today each price gets the primary style) — owner rule; in the frame prices are text, which resolves it if buying is a row tap -> confirm sheet (a behaviour to state: the confirm sheet does not exist today). Statement reasons arrive in English from the server ("Store purchase") — drawn as is, a backend/i18n gap; do not translate client-side by string matching. `E25` / `E26` as in screen 2.
- Not reachable: none; the "Megvan" row needs a purchase (possible with the seed's balance).
- Size: **M**.

#### 9. Értesítések — `/notifications` — RE-COMPOSE

- Route `router.tsx:113` -> `features/chat/NotificationsPage.tsx` 416 (+ `chat/useChat.ts` 223 shared with chat).
- Shared UI: `Surface` x2 (each row is a Surface, `:230-234`), a LOCAL `BellAnchor` (`:85`), `Pressable` primary + secondary x2, `Skeleton`. BOX 15. Centred header with back button (`:282-297`).
- Frames: `notifications-1` 2 unread · `notifications-2` empty.
- What changes: pushed header ("KEZDŐLAP" eyebrow); hero = `giant` unread count with caption "olvasatlan értesítés" (0 drawn in `t3`), pill "Összes olvasottnak jelölése", unread rows (glyph, title, sub, lime dot + mono age), then section "KORÁBBIAK" with read rows; empty = `display` "NINCS ÉRTESÍTÉS" + body under a rule.
- Needs: the parent label depends on which bell was tapped (Home or `/coach`); the header needs a rule ("Kezdőlap" is wrong for a coach arriving from `/coach`). No tab owns this route in `navTabs.ts`, and the `check:nav-active` route table (`check-nav-active.mjs:53-70`) has no row for it — so the frame's unlit bar matches the code; do not add ownership without adding the row.
- Honest limits to keep: chat rows carry only the sender's e-mail local part and link to `/chat/<id>`, which is not a route (lands on Home). The pill is on screen for about one round trip because the page auto-marks on arrival. Implement the layout; do not invent names, bodies or a read mark.
- Not reachable without a coach acting on the member (or the seed): `notifications-1` — only two event types are emitted (chat message, equipment change), both coach-triggered.
- Size: **S/M**.

#### 10. Onboarding kérdőív — `/onboarding` — RE-COMPOSE + NEEDS (no way in)

- Route `router.tsx:138` -> `features/onboarding/OnboardingPage.tsx` 840 (one file: `Holder` `:109`, `GroupHeading` `:142`, `Choice` `:174`, `NumberRow` `:233`, `SaveState` `:346`, page `:386`) + `useOnboarding.ts` 154 (also imported by `settings/EquipmentSection`).
- Shared UI: `Gauge` as step ring (`:505`), `Field` x5, `Toggle` x3 (chips), `Surface` x1 (per-limitation card `:759`), `Pressable` primary x2 / secondary x3. BOX 11 — low because the boxes come from `Choice` / `Toggle` / `Field` internals.
- Frames: `onboarding-1` step 5/5, returning member · `onboarding-2` step 1/5, first open · `onboarding-3` step 2/5, missing answer.
- What changes: centred ring header (`:497-523`) becomes eyebrow "5 LÉPÉSBŐL" + `giant` step number + the `hero-plates` still + a 5-segment `stepper`; question as `display` (2 lines) + body; single-choice lists as rows with a ring / lime tick (`setCheck` as radio); multi-select as wrapping word chips; number inputs as minus / plus `iconBtn` steppers with a 48 pt numeral value; footer "Vissza" text + lime pill, docked above the tab bar, with a save-state `noticeLine` ("Elmentve" / "Hiányzik még: heti edzésszám").
- Needs (frontend only): multi-line textarea for the note (single-line `Field` today, `:784`); sticky footer with scroll padding (not sticky today, `:796`); the number field in the display face at 48 pt (the system otherwise fixes input text at 16); the field-level error line "Ez a mező kell a befejezéshez" is drawn and its key exists (`onboarding.requiredField`, `hu.json:390`).
- **No way in**: nothing links to `/onboarding` (it is on the `NO_INBOUND_BY_DESIGN` list, `check-nav.mjs:48`); a member reaches it only by a URL the coach sends. All three frames are reachable by URL. Do not add a redirect or a Home prompt in the screen package — product gap, owner decision.
- Size: **L** (840 lines, five steps, autosave draft, many control types — the widest consumer of the form primitives).

### Edző (coach) — 8 screens

#### 11. Edzői kezdőlap — `/coach` — RE-COMPOSE (section order changes)

- Route `router.tsx:128` -> `features/coaching/CoachDashboard.tsx` 639 · `coaching/Monogram.tsx` 40 · `coaching/useCoaching.ts` 248 (hooks; also imported by `plans/PlanEditorPage`).
- Shared UI: `Surface` x7, `Gauge` + `CountUp` (`:249-260`), `SummaryTile` x2 (teams, live codes `:307,324`), `SectionHeader` x2, `EmptyState` x3, `Field` x2 (team form, pregenerate form), `Sheet` x4 (code ready `:495`, teams `:506`, pregenerate `:534`, archive confirm `:605`), `CopyButton` (E2 variant), `NotificationBell`, `Monogram`. `Pressable` primary x3 / secondary x3 / danger x2. BOX 28.
- Frames: `coach-dashboard-1` base (full scroll) · `coach-dashboard-2` "A kód elkészült" sheet · `coach-dashboard-3` an account waiting for handover.
- What changes: greeting-style header ("Klienseim" `title` + "Edzői felület", bell with badge, "Tervek >" text link — keep it, it is a door to `/coach/plans`); hero "KLIENSEK" `giant` count with a segment bar split by team + a 2x2 text legend, the `hero-stopwatch` photograph; **the roster moves directly under the hero** (today: counts and join codes come first, roster last — `:359` codes section, `:406` roster section); roster rows = monogram 28, name, mono "11 edzés / 28 nap" (warn tone at 0), mono tag "ÁTADÁSRA VÁR", bare archive glyph, chevron; then `ledgerRow`s "CSAPATOK 3 >" and "ÉLŐ KÓDOK 2"; "CSATLAKOZÁSI KÓDOK" with a small lime pill "+ Új kód" (the screen's one pill); code rows "3 / 20 felhasználva" + danger text "Visszavonás"; row "Előre létrehozott fiókok >". Handover notice = `noticeLine` (warn dot) instead of a tinted warning card (`:338`).
- Data: complete — `ClientRow.sessions_28d`, `must_change_credentials`, `team_name` exist (`useCoaching.ts:5-19`).
- Needs: a rule for the team bar when every client is "Csapat nélkül" (hide it or draw one ink segment); the four sheets become the Pulse sheet (shared piece). Revoke fires with no confirmation today; Pulse wants destructive actions confirmed in a sheet — that would be new behaviour and new copy, so draw as is.
- Not reachable: none strictly. Frame 3 needs a pre-generated account (the coach can create one from "Előre létrehozott fiókok"); the state then never clears because no set-your-own-password screen exists. A minted code cannot be redeemed from the member UI (nothing calls the redeem endpoint) — the sheet works, the code only works through the API.
- Size: **L**.

#### 12. Kliens adatlap — `/coach/clients/:id` — RE-COMPOSE (largest coach screen)

- Route `router.tsx:129` -> `features/coaching/ClientDetailPage.tsx` 549 · `PlanTab.tsx` 187 · `NutritionTab.tsx` 354 · `ProgressTab.tsx` 188 · `ClientEquipmentCard.tsx` 140 · `ChatTab.tsx` 69 = 1 487 lines. Hooks from `plans/usePlans`, `plans/useOnline`, `nutrition/useNutrition`, `library/useExercises`.
- Shared UI: `Surface` x10, `SummaryTile` x3 (`ClientDetailPage.tsx:306-329`), `Monogram size="lg"`, `Sheet` (questionnaire `:471`), `control()` / `chip()`, `Toggle` (equipment), `ProgressChart` (`ProgressTab.tsx:54`), `EmptyState` x4, `ChatPanel` embedded in `ChatTab.tsx:59`, hand-written cards in `NutritionTab` and `ProgressTab` (`rounded-card border border-[var(--surface-border)] bg-surface-1 p-4`, 8 sites). BOX 84 — the highest of any screen.
- Frames: `client-detail-1` Terv · `client-detail-2` Táplálkozás (abridged) · `client-detail-3` Haladás (abridged). The fourth tab, Üzenetek, has no frame.
- What changes: pushed header ("KLIENSEIM"); hero monogram 176 + name `display` + "Erőemelő csapat · meghívóval"; three stat columns (eyebrow + `num`) instead of three tiles; `ledgerRow`s "CÉL Izomtömeg" and "KÍMÉLENDŐ Térd — Óvatosan" (warn dot + note) instead of `AnswerTile` cards (`:73-110`); row "Teljes kérdőív >" (opens the sheet); "FELSZERELÉS" wrapping chips with trailing "Mentés"; view switch as words on a hairline; Terv = plan rows (lime dot + mono "AKTÍV" meta) + pill "Új terv a kliensnek" + "Klónozás" disclosure; Táplálkozás = collapsible diet header, 1–7 day `segSwitch`, per-meal eyebrow + `num` kcal total, item rows with x, one `searchField` per meal, "+ Étkezés hozzáadása", "+ Új étrend"; Haladás = "FEJLŐDÉS" one chart per exercise with a `num` latest value and mono change, "REKORDOK" rows, "EDZÉSEK" rows.
- Needs:
  - **"Edzés / 28 nap" reads 0 on this page in the running app** (the detail endpoint does not return `sessions_28d`; the tile reads `c.sessions_28d ?? 0`, `ClientDetailPage.tsx:310`). The frame shows the intended 15. Frontend-only fix exists: the roster query (`useClients`, same cache key family) already carries the number — read it from there, or render "—". Never ship the 0.
  - The account state is carried by the monogram dot colour alone in the design — needs an accessible label (new key).
  - The Üzenetek tab is undrawn; it holds the only door to the chat screen (`ChatTab.tsx:53`) and embeds `ChatPanel`. Compose it from the chat screen's Pulse pieces: last messages + "open full" link.
  - Locale defects drawn as-is (raw ISO dates, decimal points, "60g", "8.1g P", "1h 6m", English exercise names and units on Haladás) — owner decision before build; do not fix ad hoc in one tab.
- Not reachable as drawn: the "15" above; a third progress chart in the sample has no data. Everything else is real with a seeded client.
- Size: **XL**.

#### 13. Csevegés — `/coach/clients/:id/chat` — RE-COMPOSE + NEEDS (layout behaviour)

- Route `router.tsx:135` -> `features/chat/ChatPage.tsx` 104 · `chat/ChatPanel.tsx` 410 (also embedded by `coaching/ChatTab`) · `chat/useChat.ts` 223.
- Shared UI: `Surface` x2 (blocked notice `ChatPanel.tsx:240`, the bubble `:349`), `EmptyState`, `Pressable` primary (send) / secondary, `<textarea>` (`:263`). BOX 19.
- Frames: `coach-chat-1` conversation · `coach-chat-2` empty with a draft.
- What changes: back row with a trailing "Letiltás" text action; identity = monogram (large) + name `title` + rule; **no bubbles** — alignment says who speaks (theirs left `t1`, mine right `t2`, max 280 wide), one mono stamp per group ("12:30 · ✓ OLVASVA"), mono date separators; composer = labelled underline field + small lime pill with a send glyph, hint "Küldés a repülő ikonnal" and counter "0 / 4000"; disabled pill when empty.
- Needs (frontend behaviour the code lacks — Product gaps, coach-chat): composer docked above the tab bar with the newest message in view (today the page scrolls as a whole and the composer sits after the last message); sticky identity header; auto-growing field (today 44 pt floor, 128 pt ceiling, no grow logic). Block fires on one tap — a confirm sheet would be new behaviour, not drawn. Report has no touch affordance — not drawn.
- **Not reachable outside the demo seed: the two-sided thread of `coach-chat-1`.** The member has no chat screen, so a real thread holds only the coach's messages, all "Kézbesítve"; an incoming message and "Olvasva" exist only through the seed. Build against the hook's shape, verify with the seed.
- Size: **M** (410-line panel, but the docking work is real).

#### 14. Edzéstervek — `/coach/plans` — RE-COMPOSE

- Route `router.tsx:136` -> `features/plans/PlanListPage.tsx` 344 (+ `usePlans.ts` 208, `useOnline.ts` 27 — hooks shared with coaching).
- Shared UI: `Surface` x3 (anchor card `:247`, plan row `:137`, error `:224`), `CountUp`, `control()`, `EmptyState` x2, `Pressable` primary. BOX 16.
- Frames: `coach-plans-1` library · `coach-plans-2` empty.
- What changes: eyebrow "TERVEZÉS" + `display` "EDZÉSTERVEK"; hero "TERV ÖSSZESEN" `giant` 6 + `hero-plates` + a 3-part segment bar with legend (Aktív 4 · Piszkozat 1 · Lezárva 1); pill "+ Új terv"; "SABLONOK" and "KLIENS-TERVEK" sections with counts; rows = two-line balanced `title` name, mono meta ("✓ Aktív · 7 nap · 7 napos ciklus"), client rows lead with a monogram; empty = big still + `display` title + body + pill BELOW the text (today the button is above the message).
- Needs: two-line names (`text-wrap: balance`, max 2 lines; today one line truncated `:121`); status as one lit level (lime tick + word) instead of a filled chip in two colours; `hero-plates` shipped as an app asset.
- Not reachable: none. (A "Lezárva" plan and client plans come with the seed; both are creatable.)
- Size: **S/M**.

#### 15. Tervszerkesztő — `/coach/plans/:id` — RE-COMPOSE

- Route `router.tsx:137` -> `features/plans/PlanEditorPage.tsx` 926 — the largest single file among the screens. Hooks: `usePlans` (10 mutations used, `:61-70`), `library/useExercises`, `coaching/useCoaching`.
- Shared UI: `Surface` x4, `Field` (search), `Sheet` (status picker `:903`), `EmptyState` x2, `ToastHost` (undo toasts), `Pressable` x23 (secondary x10 — arrows, add buttons, trash). 23 lucide glyph sites. BOX 36.
- Frames: `plan-editor-1` base · `plan-editor-2` a day open (full scroll) · `plan-editor-3` exercise picker.
- What changes: back row ("EDZÉSTERVEK") with a trailing "Mentés" pill (drawn in the disabled `s2` state = nothing to save); plan name `title` (single-line input today, `:355`), status "● Aktív ⌄" (opens the sheet) and mono "52. változat"; cycle strip "7 NAPOS CIKLUS" as seven `num` numerals over a segment bar (rest days dim, open day lime); day rows = numeral lead + name + mono time, chevron, danger trash glyph; open day = eyebrow "5. NAP 18:00" + `displayXL` name, blocks as ruled sections with eyebrow kind ("EGYSZERŰ" / "SZUPERSZETT") and bare arrow / collapse / trash glyphs, exercise rows with mono prescription ("4 × 6-8 · 70 kg"), superset members joined by a left rule, "+ Gyakorlat" text, the add-block row "+ Egyszerű + Szuperszett + Kör"; picker = labelled underline field with lime focus underline, result rows with mono warn tags ("TÉRD", "1 eszköz hiányzik"), "Mégse" text; footer rows "Klónozás" and "A teljes 7 napos ciklus másolása előre".
- Needs: no rest-day render in the icon family (typographic strip — as drawn); no label string for the add-block group or the day list; no selected-row visual in code; delete toasts sit at the bottom in code while Pulse's toast is a top band; picker has no "no results" / loading text. Plan name longer than one line needs a two-line or shrinking title (code change).
- Not reachable: none of the three frames. Caveat in the frame: a client plan can show "Aktiváláshoz kell egy kezdődátum" and no control sets the date — not drawn, do not invent a date field.
- Size: **XL** (926 lines, 10 mutations, reorder + undo + offline-disabled states; high regression risk).

#### 16. Piactéri pult — `/compose` — RE-COMPOSE

- Route `router.tsx:119` -> `features/compose/ComposePage.tsx` 570 (+ `useCompose.ts` 386, `kindIcons.ts` 17 shared with the post editor).
- Shared UI: `Surface` x5 (gate / notice sections `:269-318`, anchor `:320`), `Gauge` + `CountUp` (`:326-342`), `control()` x3, `Sheet` (profile sheet `:528`), `EmptyState` x3, kind icon tiles (`:479`). BOX 48 (10 `rounded-card`, 11 tinted backgrounds).
- Frames: `compose-hub-1` base · `compose-hub-2` profile sheet.
- What changes: identity row (monogram 28, name, mono @handle, status "● Élő ⌄" opening the sheet); `display` "PIACTÉRI PULT"; hero `giant` post count + "bejegyzés" with four count rows beside it (Élő 4 · Piszkozat 1 · Levett 0 · Eltávolított 0, zeros in `t3`), a quota progress bar + "Ma még 9 publikálás a 10-ből."; pill "+ Új bejegyzés"; "BEJEGYZÉSEK" with a `chipRow` filter (Mind · Piszkozat · Élő · Több); rows = title + "● Program · Élő" + chevron (no kind tiles); sheet = "Profil szerkesztése >" + danger text "Profil levétele".
- Needs: the gate states (removed profile, guidelines to accept, account too new — the four `Surface` sections at `:269-318`) have no frame; compose them as `noticeLine` / ruled sections. Two refusal strings print raw `{{version}}` / `{{when}}` placeholders in the running app (live bug, fix belongs with whoever owns `compose` strings). "Több" has no disclosure affordance in the product.
- **No door on a phone**: nothing links forward to `/compose` (only the editors' back links and the desktop command palette). The screen is reachable by URL. Owner decision, not a screen-package change.
- Not reachable: none by content.
- Size: **L**.

#### 17. Edzői profil szerkesztő — `/compose/profile` — RE-COMPOSE

- Route `router.tsx:120` -> `features/compose/ProfileEditorPage.tsx` 589 · `compose/HandleField.tsx` 140 · `compose/useComposeFlow.ts` 112 (shared with the post editor). Imports `marketplace/DocRenderer` (preview) and `marketplace/usePublic` (city list).
- Shared UI: `Surface` x6, `Field` x2 + `HandleField`, native `<select>` (`CityPicker` `:147`), `<textarea>` (`:475`), `Switch` (`:513`), `Pressable` chips (specialties), `DocRenderer` (`:581`). BOX 34.
- Frames: `compose-profile-1` editing · `compose-profile-2` name and city disclosure open.
- What changes: back row "VISSZA A PULTHOZ"; hero monogram 176 + name + "@handle · Budapest ⌄" (the disclosure trigger); **the public switch moves above the form** (today it is a card near the bottom, `:497-528`); fields with mono "KÖTELEZŐ" / "NEM KÖTELEZŐ" tags; "SZAKTERÜLETEK" chips with "4 / 6 kiválasztva" + "Több ⌄"; "BEMUTATKOZÁS" raw-markdown textarea with a remaining counter; pill "Mentés"; "Előnézet" text link; disclosure = "NYILVÁNOS NÉV MÓDOSÍTÁSA" with the handle field (lime focus underline), ok-dot "Szabad", a warn-dot paragraph instead of a tinted warning box (`:94`), text actions "Név módosítása" / "Mégse", then "Város  Budapest >".
- Needs: city as a sheet list instead of the native select (10 cities + "Bárhol"); pitch as an auto-growing field; preview stays `DocRenderer` -> depends on its Pulse restyle (screen 21). Known live behaviour to keep in mind: flipping the public switch or renaming reloads the profile and drops unsaved edits.
- Not reachable: none.
- Size: **L**.

#### 18. Poszt szerkesztő — `/compose/posts/:publicId` — RE-COMPOSE

- Route `router.tsx:121` -> `features/compose/PostEditorPage.tsx` 674 · `compose/useAutosave.ts` 127 (read by the `check:autosave` gate, `verify-autosave.mjs:49` — logic, do not touch).
- Shared UI: `Surface` x3 (status notice `:319`, cover block `:332`, error `:512`), `Field` x2, `Segmented` (the E6 style-studio control, kind choice), `Sheet` (stale-save `:650`), `<textarea>`, file `<input>` (`:392`), `EmptyState`. BOX 28.
- Frames: `compose-post-1` draft with a cover · `compose-post-2` new post.
- What changes: back row with a trailing save status ("Mentve"); `display` title; cover as a frameless image with "BORÍTÓKÉP" + "× Kép eltávolítása" + alt text; "TÍPUS" as a ledger line with hint (existing post) or a `chipRow` (new post); title and body as underline fields with remaining counters; autosave `noticeLine` ("● Automatikus mentés · Mentve 09:40"); one pill ("Közzététel" / "Piszkozat létrehozása"); "Levétel" text + hint.
- Needs: no placeholder copy for the two fields; "Mentve" shown three times at once today (save control, autosave line, toast) — the frame keeps two, drop the toast.
- **Do not implement as a working path: "Esemény" in the type choice of `compose-post-2`.** It is offered and cannot be created (no date field, the server refuses and leaks `event_at`). Draw the chip because the product offers it; do not add a date field. The cover in frame 1 is graded monochrome with feathered edges — an arbitrary coach upload is a colour photo cropped 16:9; grading uploads is an owner decision (see screen 21).
- Size: **L**.

### Nyilvános + admin — 6 screens

#### 19. Belépés és regisztráció — `/login`, `/register` — RE-COMPOSE (small)

- Routes `router.tsx:84-85` (eager import) -> `features/auth/AuthPage.tsx` 298 (+ `useSession.ts` 103; `react-hook-form` + zod).
- Shared UI: `Surface finish="glass"` x1 (the form card `:169`), `Field` x2, `Pressable` primary, `LanguageToggle`, `AuroraBackdrop` (`:101`). Centred layout (`:100`). BOX 11.
- Frames: `auth-1` Belépés · `auth-2` Regisztráció. (`_auth-swap-409@1x.png` is a state study, not a frame of the 59.)
- What changes: no card, left-aligned; `hero-chalk` photograph on top; wordmark from `useAppName()` as `displayXL`, sub line; two underline fields (e-mail with a validity tick, password with an eye toggle and the rule as hint); pill docked ("Belépek" / "Létrehozom a fiókom"); "Még nincs fiókod? Regisztráció" with an ink link; language as a `segSwitch`; register adds a back chevron.
- Needs: `hero-chalk` shipped as an asset; a masked field with visible ~6 pt discs (Geist's bullet at 16 px is a 3 pt speck); `AuroraBackdrop` removal here is coupled to the `check:aurora` gate (shared shell work). Wordmark is blank on an offline cold start (no cached app name) — product gap.
- Not reachable: none.
- Size: **S**. High value: it is the first screen anyone sees.

#### 20. Piactér — `/m` — RE-COMPOSE + NEEDS (owner approval for the lead)

- Route `router.tsx:101` (public, outside `AppLayout`) -> `features/marketplace/MarketplacePage.tsx` 382 · `marketplace/PublicChrome.tsx` 254 (`PublicTopBar`, `KindTile`, `VerifiedBadge`, `InitialsAvatar`, `metaLine` — shared by the three public pages) · `usePublic.ts` 188.
- Shared UI: `Surface` x2 (`FeedHero` `:296`, `PostCard` `:345`), `EmptyState` x2, `Pressable` secondary x3 (kind chips), raw search `<input>` (`:138`), `AuroraBackdrop`. BOX 16 (+4 in `PublicChrome`).
- Frames: `marketplace-1` base · `marketplace-2` search.
- What changes: top row back chevron + small lime pill "Belépés"; `display` "PIACTÉR"; lead post = frameless cover + mono meta "PROGRAM · ONLINE" + `title` + coach name with tick + mono price; `searchField`; `chipRow` (Minden · Program · Esemény · Közlemény); feed rows = mono meta line (kind · city · date), title, coach + tick, mono price; search note as caption text.
- Needs:
  - **The live screen never shows the lead post's title, coach or price** (cover only, and the lead is removed from the list). The design shows them — a visible content change the owner must approve (Product gaps, marketplace).
  - City printed as the raw key today (`budapest`); design uses native names — needs the same mapping the coach profile uses (frontend-only).
  - "Belépés" is drawn three ways across the public screens (lime pill here, text link on the other two) — one rule needed; also shown to signed-in visitors.
  - Cover grading rule for coach uploads (owner decision).
- Not reachable through the product, seed only: rows with a city, an event date or a price (no authoring UI in the post editor), the "Esemény" kind, and the verified tick (no admin screen or endpoint sets it). A post written today renders as kind · publication date / title / coach.
- Size: **M**.

#### 21. Poszt részletei — `/m/p/:publicId` — RE-COMPOSE

- Route `router.tsx:102` -> `features/marketplace/PostPage.tsx` 249 · `marketplace/DocRenderer.tsx` 236 (shared with the coach profile and the profile editor's preview).
- Shared UI: `Surface` x2 (coach card `:150`, price card `:183`), `EmptyState`, `AuroraBackdrop` x3, cover `<img>` `aspect-video rounded-card` (`:102`). BOX 14.
- Frames: `post-detail-1` event · `post-detail-2` programme · `post-detail-3` text-element specimen (`post-detail-2-specimen@2x.png` is the same image).
- What changes: top row chevron + "Belépés" text; cover bleeding from the top, 4:3, no frame; eyebrow kind + mono meta (city · date · seats); `displayXL`-sized title, balanced; coach as a `listRow` (monogram, name + tick, "Ellenőrzött edző", chevron) between rules; body through `DocRenderer` in Pulse type (check list, numbered list with `num` numerals, quote with a mono mark, heading level 2 as an eyebrow); price as `num` + "Ft" with a caption under a rule.
- Needs: `DocRenderer` Pulse styles (shared piece: headings, lists, quote, links "ink underlined + host in cap, never lime"); italic runs — Geist has no italic cut (owner decision; the specimen proposes regular + `t2`); title size step for long titles (up to 140 chars).
- **`post-detail-3` is not a screen** — it is a specimen sheet of the document blocks no sample post contains. Use it as the spec for `DocRenderer`; do not build a route or a state for it.
- Seed-shaped: both real frames show city, date, seats and price, which no authoring UI can set; the real page today is tag + title + coach + body. Seed bug: price 1200000 renders as 1 200 000 Ft.
- Size: **M** (S for the page, the rest is `DocRenderer`).

#### 22. Edzői profil (nyilvános) — `/m/c/:handle` — RE-COMPOSE

- Route `router.tsx:103` -> `features/marketplace/CoachProfilePage.tsx` 350.
- Shared UI: `Surface` x2, `EmptyState`, `InitialsAvatar` (from `PublicChrome`), `DocRenderer` inside a height-clamped `Bio` (`:258-300`), `AuroraBackdrop` x3. Centred header (`:123`). BOX 13.
- Frames: `coach-profile-1` verified coach · `coach-profile-2` bio expanded.
- What changes: hero monogram 176 with lime dot, left-aligned; name `display`; pitch body; "✓ Ellenőrzött edző · Budapest"; specialties as one eyebrow line joined by middle dots (not chips); bio collapsed to the first paragraph with "Több ⌄" / "Kevesebb ⌃"; "BEJEGYZÉSEI" rows with a mono meta line and a two-line title.
- Needs: collapsed bio as a text clamp on the first paragraph with headings skipped (today a height clamp that shows only the heading for the demo coach); two-line post titles (one line + ellipsis today). No label strings for the specialties or bio blocks (none drawn). `kepek/portrait-coach.png` exists in the manifest for this page, but the product has no coach photo field — do not use it; the frames use the monogram.
- Not reachable through the product: the verified tick (seed only).
- Size: **S/M**.

#### 23. Admin áttekintés — `/admin` — RE-COMPOSE + NEEDS (phone table)

- Route `router.tsx:124` -> `features/admin/AdminPage.tsx` 318 · `AdminShell.tsx` 124 (tab strip) · `ModerationQueue.tsx` 480 · `MarketplaceQueue.tsx` 216 · `UserSearch.tsx` 154 = 1 292 lines. `admin/AdminMetrics.tsx` 188 has no importer (dead, with 14 `adminMetrics.*` keys only it uses).
- Shared UI: `Gauge` + `CountUp` (`UserDonut` `AdminPage.tsx:48-110`), `SummaryTile` x2 (`:253,259`), `Surface` x6, `DataTable` (`UserSearch.tsx:78` — its only use in the app), `Field` x4, `EmptyState` x6, `Pressable` primary x2 / secondary x4 / danger x1. BOX 52.
- Frames: `admin-1` Moderáció, 3 waiting · `admin-2` a submission open (full scroll) · `admin-3` Fiókok.
- What changes: eyebrow "ADMINISZTRÁCIÓ" + `display` "ÁTTEKINTÉS", trailing "Stílus stúdió >" link (keep — the only door to `/admin/styles`); hero "FELHASZNÁLÓ" `giant` 19 with three legend rows and a segment bar instead of the donut; "GYAKORLAT 1656 · MÉDIAFÁJL 3" as two `num` readouts on one line instead of two tiles; page `segSwitch` (Fiókok · Moderáció 3 · Piactér); queue rows with mono meta and a chevron disclosure; an open submission in the exercise-detail grammar (display title, image, muscles as a dot list, equipment with stills, numbered steps), pill "Jóváhagyás" + text "Elutasítás"; Fiókok = `searchField`, a mono sort-key row, two-line rows (e-mail / mono role · date · state tag) with a trailing client count; foot line "3 aktív munkamenet · 14 naplóesemény az elmúlt 24 órában".
- Needs: the account list is a 640 px table that scrolls sideways on a phone (`DataTable`) — the two-line row layout and a sort row outside a table header do not exist (new shared or local component); queue ages and dates come from `Intl` in the browser locale; failure states have no UI at all; the section switch does not change the URL. The Piactér tab (`MarketplaceQueue`, 216 lines) has **no frame** — compose it in the same grammar as the moderation queue.
- Not reachable as drawn: the submission's photograph in `admin-2` (the seed's media file is a blank 320x180 placeholder). Everything else is real with the seed.
- Size: **L**.

#### 24. Elem-stílus stúdió — `/admin/styles` — RE-SKIN of the page, but its SUBJECT is an open question

- Route `router.tsx:127` -> `features/admin/StyleStudioPage.tsx` 436 · `admin/useElementStyles.ts` 49. It imports specimen renderers from `features/playground/PlaygroundPage.tsx` 469 (route `/playground`, an internal QA page that is not among the 24 screens), which in turn imports all 12 files of `ui/feedback/variants/` (7 932 lines).
- Shared UI: `Surface` x4, `EmptyState`, `ToastHost`, `Pressable`, 30 lucide glyphs (the element list icons). BOX 27 (+17 in the playground).
- Frames: `style-studio-1` E1 Button, D active · `style-studio-2` E1 switched to C, saved.
- What changes on the page: eyebrow "MEGJELENÉS" + `display` title + body; hero = element eyebrow "BUTTON · E1", the active variant letter as `giant` with a lime dot, variant name, live specimen on the right; element chooser as a `chipRow` rail (27 items); "VÁLTOZATOK" rows = letter numeral, mono name, live specimen, trailing "Legyen ez" text or "✓ Ez az aktív" + mono "AKTÍV"; toast as the top band ("E1 mostantól C változatot használ").
- The real question (owner + planner): the studio lets an admin pick one of **five looks for each of 27 elements**; the variants are the pre-Pulse component set (press-spring buttons, ripple, capsule tab bars, "Active-pill" / "Center-FAB" nav items...). Pulse defines ONE look per component. Three consistent options:
  1. Variants become **motion-only** differences on the single Pulse look (what the frames suggest: five identical lime "Save" pills that differ in behaviour). Then every `variants/E*.tsx` file needs its five branches re-skinned to Pulse — 7 932 lines, the biggest hidden cost in the whole redesign.
  2. The studio and catalogue are **frozen** behind the admin route with their old look until a later phase; Pulse primitives ignore `useElementVariant`. Then `check:elements` must be told (catalogue `live` flags) in the same change that removes each read.
  3. The studio is **cut**. Removes 27 keys, 8 000+ lines, one route, one gate.
  The frames exist, so option 1 or a reduced option 1 (only the elements Pulse still has: button, copy button, icon button, toggle, checkbox, segmented, field, tabs, sheet, toast, set row, rest timer, coin balance, achievement) is what was designed; E11 "Bottom nav item" variants have no meaning on the capsule-less bar (Product gaps, style-studio).
- Needs: six glowing, pulsing primary pills on one screen breaks "one lime pill" and "max one loop per screen" — specimens need a no-glow / no-pulse rendering; element names and specimen copy are hard-coded English; no back control (pushed screen without a back header).
- Not reachable: none.
- Size: **M** for the page alone; **XL+** if option 1 is taken for all 27 elements. Lowest owner-visible value of the 24 (admin-only).

## 3. Verdict table

| # | Screen | Route | JSX lines owned | BOX | Verdict | Size |
|---|---|---|---|---|---|---|
| 1 | Kezdőlap | `/` | 534 | 19 | re-compose | M |
| 2 | Edzéslejátszó | `/workout` | 1 549 | 44 | re-compose + mannequin | XL |
| 3 | Gyakorlatok | `/library` | 368 | 11 | re-compose + mannequin + selector behaviour | L |
| 4 | Gyakorlat részletei | `/library/:id` | 426 | 27 | re-compose + mannequin | M |
| 5 | Étkezés | `/nutrition` | 454 | 29 | re-compose | M |
| 6 | Haladás | `/progress` | 751 | 40 | re-compose | L |
| 7 | Profil | `/settings` | 844 | 37 | re-compose + 3 new reads + 2 owner decisions | L |
| 8 | Érmék | `/coins` | 611 | 19 | re-compose | M |
| 9 | Értesítések | `/notifications` | 416 | 15 | re-compose | S/M |
| 10 | Onboarding | `/onboarding` | 840 | 11 | re-compose + form controls | L |
| 11 | Edzői kezdőlap | `/coach` | 639 | 28 | re-compose (order) | L |
| 12 | Kliens adatlap | `/coach/clients/:id` | 1 487 | 84 | re-compose | XL |
| 13 | Csevegés | `/coach/clients/:id/chat` | 514 | 19 | re-compose + docking behaviour | M |
| 14 | Edzéstervek | `/coach/plans` | 344 | 16 | re-compose | S/M |
| 15 | Tervszerkesztő | `/coach/plans/:id` | 926 | 36 | re-compose | XL |
| 16 | Piactéri pult | `/compose` | 570 | 48 | re-compose | L |
| 17 | Edzői profil szerkesztő | `/compose/profile` | 729 | 34 | re-compose | L |
| 18 | Poszt szerkesztő | `/compose/posts/:publicId` | 674 | 28 | re-compose | L |
| 19 | Belépés / regisztráció | `/login`, `/register` | 298 | 11 | re-compose (small) | S |
| 20 | Piactér | `/m` | 382 (+254 chrome) | 20 | re-compose + lead-post content change | M |
| 21 | Poszt részletei | `/m/p/:publicId` | 249 (+236 doc) | 14 | re-compose | M |
| 22 | Edzői profil | `/m/c/:handle` | 350 | 13 | re-compose | S/M |
| 23 | Admin áttekintés | `/admin` | 1 292 | 52 | re-compose + phone account list | L |
| 24 | Elem-stílus stúdió | `/admin/styles` | 436 (+469 playground, +7 932 variants) | 27 | re-skin; subject undecided | M … XL+ |

**No screen is a pure re-skin.** Every one of the 24 loses its cards, tiles and ring and gains a hero and ruled sections, so the JSX tree changes on every page. What does NOT change anywhere: routes, hooks, query keys, mutations, zod schemas, the i18n keys already in use (new keys are additions). The honest unit of work is "rewrite the render function of each page against the new primitives, keep everything above the `return`".

Sum of JSX the screen packages rewrite: 16 276 lines across 49 files (the 55 feature `.tsx` files, 17 359 lines, minus the 5 dead files = 614 lines and the playground = 469). The 23 feature `.ts` hook and logic files (3 782 lines) stay untouched.

## 4. Frames that today's product cannot reach — nobody implements these as paths

"Seed only" means the state exists in the demo database and nowhere in the UI creates it. The layout is still built (the data shape is real), but it is verified with the seed account and the real default state must be the designed one.

| Frame | What cannot be reached | Why (evidence) | What to do |
|---|---|---|---|
| `post-detail-3` (= `post-detail-2-specimen`) | the whole frame | it is a specimen of document blocks, not a screen | use as the `DocRenderer` spec; no route, no state |
| `progress-2` Megosztás | coach block, two switches on, five access-log rows | no UI creates the first share; no coach screen reads consent or writes the log (Product gaps, progress) | build; default view is the two empty sentences |
| `coach-chat-1` | the client's incoming message, "Olvasva" | members have no chat screen (inventory §0 "Chat: live, coach side only") | build both alignments; verify with seed |
| `client-detail-1` | "Edzés / 28 nap 15" | `/clients/:id` does not return `sessions_28d`; tile reads `?? 0` (`ClientDetailPage.tsx:310`) | read from the roster cache or print "—" |
| `client-detail-3` | third progress chart | no series in the sample | none — renders what the API returns |
| `marketplace-1/2`, `post-detail-1/2`, `coach-profile-1/2` | city, event date, seats, price, kind "Esemény", verified tick | no authoring UI for any of them; verified has no admin endpoint (Product gaps, marketplace / post-detail / coach-profile) | build the slots; a post written today shows kind · date / title / coach only — that reduced row must look right |
| `marketplace-1` lead block | lead title, coach, price | live screen shows the cover only | owner approval needed before showing them |
| `compose-post-2` | choosing "Esemény" and saving | no date field; server refuses | draw the chip, add nothing |
| `compose-post-1`, `post-detail-*`, `marketplace-*` covers | monochrome, feathered-edge covers | real uploads are colour photos cropped 16:9; seed covers are blank 320x180 | owner decision on grading; until then plain rectangle, radius 2, per Pulse System §5 "user photos" |
| `admin-2` | the submission photograph | seed media is a blank placeholder | none |
| `exercise-detail-1/2`, `workout-1/2`, `library-2/3` | the lit graphite mannequin for an arbitrary exercise; "Hátul" of detail-1, "Elöl" of detail-2 and workout | stills exist for chest, chest+shoulders, lats, quads, neutral front/back only (Product gaps, exercise-detail) | owner decision 4; see §5 M1 |
| `library-1..3` rows | equipment thumbnails | `ExerciseRow` has no equipment key (`useExercises.ts:4-18`); 8 of 16 kinds have a still | text-only rows |
| `exercise-detail-*` "ESZKÖZ" still | a still for 8 of the 16 equipment kinds | `kepek/equip-*.png` = 8 files | name alone when there is no still |
| `coach-dashboard-2` | using the minted code | nothing in the member UI calls the redeem endpoint | sheet is real; nothing to add |
| `coach-dashboard-3` | the state ever clearing | no set-your-own-password screen | none |
| `onboarding-1..3` | arriving there | no inbound link (`check-nav.mjs:48`) | reachable by URL only; add no redirect |
| `compose-hub-1/2` | arriving there on a phone | no forward door to `/compose` | owner decision |
| `home-2` | leaving it | no finish / abandon action in the UI | owner decision 2 |
| `settings-2` "Megjelenés" | meaning of 7 theme packs and "Áttetsző felületek" in a one-black one-lime system | open decision 3; the hint describes glass | implement after the owner answers |
| `notifications-1` chat rows | sender name, message body, a working link | payload has the e-mail local part only; `/chat/<id>` is not a route | draw the bare row; no invented text |
| `coins-3` | Hungarian reasons, item names on spend rows | server sends English, stores no note | as drawn |

States that exist in code and have NO frame — they must survive the rewrite, composed from the kit: Home rest day / done / several occurrences / week-query retry; workout interval stage (4 states), failed-check chips, withdrawn row, stand-in hero; nutrition no-target and over-target; progress photos grid with photos, photo delete sheet; coins purchase flow; coach dashboard teams sheet, pre-generate sheet and its result list, archive confirm, empty roster; client detail Üzenetek tab, questionnaire sheet, archived / missing client; plan editor status sheet, no-days empty state, offline-disabled controls, undo toasts; compose hub gate states (removed, guidelines, too new); post editor stale-save sheet, read-only (taken down) state; admin Piactér tab (`MarketplaceQueue`), queue empty, "submission gone"; every loading skeleton and every `EmptyState` (35 call sites).

## 5. Shared pieces the screens need BEFORE or WHILE they are built

Counted from the 24 blocks above. "Consumers" = screens that cannot be finished without the piece.

| # | Piece | Replaces today | Consumers | Blocks screens? |
|---|---|---|---|---|
| S1 | Tokens + fonts + type ramp (Big Shoulders Display, Geist, Geist Mono; palette; radii; spacing; `.screen-x` gutter 24 / 16; `--gap-section` 32) | `tokens.css`, `index.css` (`.screen-x`, `.col-mobile` used by 25 / 22 feature files; `gap-section` 47 uses, `gap-group` 152, `gap-tight` 247), `lib/cn.ts` TYPE_STEPS | all 24 | yes — first |
| S2 | Screen head (`greet` / `root` / `push`) + `Section` (rule + eyebrow + trailing) | 13 `SectionHeader` sites, 2 local copies (`SettingsPage.tsx:60`, `ProgressPage.tsx:699`), ~20 hand-written headers (centred titles with back buttons) | all 24 | yes |
| S3 | Action set: primary pill (56 / 44, glow, busy dots), text link, bare icon button + badge | `Pressable` variants (36 primary, 54 secondary, 5 danger) | all 24 | yes |
| S4 | Rows: `ListRow` + `RowStack` (lead slot, sub, trailing value / node / chevron, hairlines) | `Surface`-as-row and hand-written cards | 16 screens (3, 6, 7, 8, 9, 11, 12, 14, 15, 16, 20, 21, 22, 23, + nutrition log 5, chooser 24) | yes |
| S5 | Numerals: `StatBlock`, `Numeral`, `Fraction`, `LedgerRow`, stat columns, `MacroCol` | `Gauge` (7 sites), `SummaryTile` (12 sites / 7 files) | 1, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 23, 24 | yes |
| S6 | Bars: `SegBar`, `Stepper`, `ProgressBar` | ring arcs, 7-cell grid, legends | 1, 5, 10, 11, 14, 15, 16, 23 | yes |
| S7 | Selection: `ChipRow` (single / multi / wrap, lime mark), `SegSwitch` (hug / page-level, ink mark), `SetCheck` (check + radio) | `Toggle` (8 sites / 5 files), chip `Pressable`s, 4 hand-rolled `role="tablist"` strips (`ProgressPage.tsx:92`, `CoinsPage.tsx:164`, `ClientDetailPage.tsx:412`, `AdminShell.tsx:66`), `LanguageToggle`, E6 `Segmented` (also inside `MuscleMap.tsx:6`) | 2, 3, 4, 6, 7, 8, 10, 12, 16, 17, 18, 19, 20, 23, 24 | yes |
| S8 | Input: underline `Field`, `SearchField`, textarea (auto-grow), number stepper, date trigger, masked field | `Field` (23 sites / 12 files) + 17 raw `<input>` in 9 files, 3 `<textarea>`, 2 `<select>`, 3 `type="date"` | 5, 6, 7, 10, 11, 12, 13, 15, 17, 18, 19, 20, 23 | yes |
| S9 | `Switch` 48x28 | `ui/primitives/Switch.tsx` (2 sites) + progress's local checkbox toggle | 6, 7, 17 | small |
| S10 | `Monogram` (28 / 64 / 176, light texture, state dot) in `src/ui` | `coaching/Monogram.tsx` (40 lines, discs), `marketplace/PublicChrome.tsx` `InitialsAvatar`, ad-hoc initials via `lib/person.ts` in 11 files | 7, 11, 12, 13, 14, 16, 17, 21, 22 | yes — and it removes the coaching/marketplace duplication |
| S11 | The one bottom sheet | `Sheet` in `ui/feedback/variants/E14E20.tsx:125` — 9 uses in 6 feature files (4 of them in `CoachDashboard`), today one of five E14 variants | 6, 11, 12, 15, 16, 18 (+ confirmations) | yes |
| S12 | Toast band (top) + `NoticeLine` | `ToastHost` (7 importers; bottom capsule, `Toast` from `variants/E12E16`), tinted warning cards | 2, 6, 10, 11, 12, 15, 17, 18, 24 + offline strip | yes |
| S13 | `EmptyState` (left-aligned title + body + action) and text-height `Skeleton` | `EmptyState` 35 sites / 24 files; `Skeleton` in 37 feature files, mostly `rounded-card` blocks at card heights | all | yes (API-compatible swap is possible; skeleton call sites are per-screen work) |
| S14 | `Pic` (lighten-blended still, cutout mode) + the 49 images shipped as app assets (`kepek/` + `manifest-app.json`) | none — the app ships no raster imagery today | 1, 2, 5, 6, 8, 10, 11, 14, 19, 20, 21 + tab bar | yes for heroes |
| S15 | Shell: `BottomNav` without capsule + raster icon pairs, bottom fade, `AppLayout` without `AuroraBackdrop`, public pages without it | `ui/nav/BottomNav.tsx` 202 (reads E11), `AuroraBackdrop` in `AppLayout` + 4 public/auth files (9 mounts), `check:aurora`, `check:nav` rule 5, `OfflineIndicator` | all 24 | yes — every screenshot shows it |
| S16 | Charts: `TrendChart`, `ProgressChart`, sparkline in Pulse (1.5 px line, end dot, hairline axes, mono labels, dotted gap) | `ui/feedback/TrendChart.tsx` 302, `ProgressChart.tsx` 53 | 6, 7, 12 | parallel-safe |
| S17 | `DocRenderer` in Pulse type | `marketplace/DocRenderer.tsx` 236 | 17 (preview), 21, 22 | owned by the public package; 17 depends on it |
| M1 | Mannequin / `MuscleMap` | `ui/muscle-map/*` 1 491 lines (SVG, 19 regions) vs a rendered figure with 6 lit stills | 2, 3, 4, 23 (review) | **owner decision 4**; screens keep the `MuscleMap` props and proceed |
| G1 | Glyph policy | 228 `size-icon-*` sites, lucide everywhere | all | decide once: lucide at stroke 1.75 as the bare-glyph source, decoration icons removed |

Production reads of the style-studio variant system (so the planner sees the real coupling, not the catalogue's 27): `E2` CopyButton (`CoachDashboard`), `E6` Segmented (`PostEditorPage`, `MuscleMap`), `E7` FeedbackField (`LibraryPage`), `E11` (`BottomNav.tsx:50`), `E14` Sheet (6 files), `E15` Toast (`ToastHost.tsx:3`), `E21` (`SetRow.tsx:136`), `E22` (`RestTimer.tsx:41`), `E25` (`CoinBalance.tsx:53`), `E26` (`CoinsPage.tsx:369`). `Pressable`, `Field`, `Switch`, `Surface` do NOT read variants. The other 14 live elements are visible only in `/playground` and the studio.

## 6. Work packages for the parallel phase

Rules that make them parallel-safe:

1. A package owns the listed files and nobody else edits them. Hooks and logic files (`use*.ts`, `cues.ts`, `intervalPlan.ts`, `useAutosave.ts`, `kindIcons.ts`) are frozen for everyone — import, never edit.
2. Shared JSX outside `src/ui` has exactly one owner: `chat/NotificationBell.tsx` -> P1, `chat/ChatPanel.tsx` -> P9, `marketplace/PublicChrome.tsx` + `DocRenderer.tsx` -> P12. Consumers keep the current props.
3. `src/ui/**`, `src/app/**`, `src/index.css`, `tokens.css`, `frontend/scripts/**`, `public/**` belong to the foundation packages. A screen agent that needs a primitive changed files a request, it does not patch `src/ui`.
4. i18n bundles are the one unavoidable shared file. Each package edits only its own namespace block(s) in `hu.json` / `en.json` / `de.json` (always all three, same key order). `common.*` and `nav.*` are foundation-owned. Separate worktrees + merge is safer than six agents editing one JSON in one tree.
5. Every package must leave `npm run build` green on its own (all gates). The doors table in §1.4 lists the links each package must keep.
6. No package implements a row of §4 as a working path, and none invents copy: a missing string is reported, not written.

### Foundation (sequential, before any screen)

| Pkg | Scope | Owns | Size | Depends on |
|---|---|---|---|---|
| F1 | Tokens, fonts, type ramp, spacing, `.screen-x` | `src/ui/tokens/**`, `src/index.css`, `src/lib/cn.ts`, font deps, `scripts/check-type-scale.mjs`, `check-tokens.mjs` adjustments | L | — |
| F2 | Pulse primitives S2–S13 | `src/ui/primitives/**`, `src/ui/data/**`, `src/ui/feedback/{EmptyState,ScreenSkeleton,ToastHost,Gauge,CountUp}.tsx`, new files; moves `coaching/Monogram.tsx` to `src/ui` | XL | F1 |
| F3 | Shell S15 + assets S14 | `src/app/**`, `src/ui/nav/**`, `src/ui/shell/**`, `public/` or `src/assets/pulse/**`, `scripts/check-aurora.mjs`, `check-nav.mjs` rule 5 | L | F1 |
| F4 | Charts S16 | `src/ui/feedback/{TrendChart,ProgressChart,chartGeometry}.tsx` | M | F1 — parallel with screens |
| M1 | Mannequin | `src/ui/muscle-map/**` (+ figure assets) | L–XL | owner decision 4 — parallel with screens if props are frozen |

Calibration step before fan-out: build **Home (P1) and Profil (P6)** first, against F1–F3, and show the owner screenshots next to `_jovahagyott-v1-home@2x.png` and `_jovahagyott-v1-profile@2x.png`. These are the only two frames he approved pixel by pixel; every primitive except the sheet, chat and the chart is exercised by them. Fan out after that review, not before — otherwise a wrong primitive is copied into ten screens.

### Screen packages (parallel; file-disjoint)

Order = order of value (what the owner opens first: the member's tab bar, left to right, then the coach's, then public, then admin).

| Order | Pkg | Screens | Owns (exact) | i18n namespaces | Size | Needs first |
|---|---|---|---|---|---|---|
| 1 | **P1 Home** | 1, 9 | `features/home/**`, `features/chat/NotificationBell.tsx`, `features/chat/NotificationsPage.tsx` | `home`, `notifications` | M + S/M | F1–F3 (S2, S3, S5, S6, S13, S14) |
| 2 | **P6 Profil** | 7 | `features/settings/**` (dead `AccentPicker.tsx`, `GradientBuilder.tsx` may be deleted here) | `settings` | L | F1–F3 (S5, S7, S8, S9, S10); owner answers on packs + translucency |
| 3 | **P2 Workout** | 2 | `features/workout/*.tsx` | `workout` | XL | F2 (S3, S7, S12); M1 optional; owner answer on E21 / E22 |
| 4 | **P4 Nutrition** | 5 | `features/nutrition/**` (deletes dead `NutritionCard.tsx`, `MacroBars.tsx`) | `nutrition` | M | F2 (S5, S6, S8), S14 |
| 5 | **P5 Progress** | 6 | `features/progress/**` | `progress` | L | F2, F4, S11 |
| 6 | **P3 Library** | 3, 4 | `features/library/**` | `library`, `muscle`, `muscleMap` | L + M | F2 (S4, S7); M1 for the hero (can ship first with the SVG map) |
| 7 | **P8 Auth** | 19 | `features/auth/AuthPage.tsx` | `auth` | S | F1–F3 (S8), S14 |
| 8 | **P7 Coins** | 8 | `features/coins/**` | `coins`, `achievement.*` | M | F2 (S4, S5, S7), S14; owner answer on E25 / E26 |
| 9 | **P10 Onboarding** | 10 | `features/onboarding/OnboardingPage.tsx` | `onboarding` | L | F2 (S7, S8 incl. stepper + textarea, S12) |
| 10 | **P9 Coach desk** | 11, 13 | `features/coaching/CoachDashboard.tsx`, `features/chat/ChatPage.tsx`, `features/chat/ChatPanel.tsx` | `coaching` (dashboard keys), `chat` | L + M | F2 (S4, S5, S6, S10, S11) |
| 11 | **P11 Client** | 12 | `features/coaching/{ClientDetailPage,PlanTab,NutritionTab,ProgressTab,ClientEquipmentCard,ChatTab}.tsx` | `coaching` (client keys) | XL | F2, F4, S10, S11; `ChatPanel` props from P9 |
| 12 | **P12 Plans** | 14, 15 | `features/plans/*.tsx` | `plans` | S/M + XL | F2 (S4, S6, S8, S11, S12) |
| 13 | **P13 Public** | 20, 21, 22 | `features/marketplace/*.tsx` | `marketplace`, `public` | M + M + S/M | F2, S10, S14; owner answers on the lead block and cover grading |
| 14 | **P14 Compose** | 16, 17, 18 | `features/compose/*.tsx` | `compose` | L + L + L (= XL; split hub+post / profile across two agents if capacity allows — same namespace, so merge in order) | F2, S10, S11; `DocRenderer` from P13 |
| 15 | **P15 Admin** | 23 | `features/admin/{AdminPage,AdminShell,ModerationQueue,MarketplaceQueue,UserSearch}.tsx` (dead `AdminMetrics.tsx` + `adminMetrics.*` keys: delete or leave, decide once) | `admin`, `adminUsers`, `adminMetrics` | L | F2 (S4, S5, S6, S7, S8) |
| 16 | **P16 Studio** | 24 | `features/admin/StyleStudioPage.tsx`, `features/playground/**`, `src/ui/feedback/variants/**`, `src/ui/feedback/catalog.ts`, `scripts/check-element-roster.mjs` | `studio` | M … XL+ | owner decision on the variant system (screen 24, options 1–3); last |

Contested spots that remain after this cut, and how to handle them:

- `coaching.*` keys are shared by P9 and P11 (72 keys in one block): merge P9 before P11, or run both in one worktree.
- `features/chat/` holds files of P1 and P9 — file-level ownership, no overlap (`useChat.ts` frozen).
- `features/admin/` holds files of P15 and P16 — file-level ownership.
- P11's Üzenetek tab renders P9's `ChatPanel`; P14's preview renders P13's `DocRenderer`: visual dependency only, props frozen.
- P2 / P7 / P16 all touch the meaning of `useElementVariant`: if the owner chooses "freeze" or "cut", P2 and P7 remove their reads and P16 (or F2) updates `catalog.ts` in the same merge, or `check:elements` fails.
- P6 reads `coins/useCoins` and `progress/useProgress` (hooks, frozen) — no overlap with P7 / P5.

Capacity sketch: after the calibration pair, eight packages can run at once without touching each other (P2, P3, P4, P5, P7, P8, P9, P10); then P11, P12, P13, P14, P15; P16 last. XL packages (P2, P11, P12 editor, P14) are the long poles — start them in the first wave after calibration even though their value rank is lower, or they set the finish date.

## 7. Open questions for the owner (only the ones that change screen work)

1. Mannequin (Index decision 4): restyle the existing SVG map in graphite (lights any of the 19 muscles today) or commission a real render kit (neutral front/back + per-muscle regions)? Three screens and the admin review wait on it.
2. Style Studio: keep five variants per element in Pulse (re-skin 7 932 lines of variants), freeze the studio as is, or cut it? Decides P16 and the E21 / E22 / E25 / E26 reads in the player and coins.
3. Theme packs and "Áttetsző felületek" in Profil (Index decision 3): what do seven packs mean in a one-black one-lime system? Blocks the "Megjelenés" section.
4. Home with several sessions today, a rest day, an already-trained day: confirm the proposed composition (one subject + pill, the rest as rows).
5. Sharing controls on Haladás: checkbox (code, on purpose) or switch (design)?
6. Marketplace lead post: may its title, coach and price be shown (design) although the live screen shows the cover only?
7. Coach-uploaded covers: grade to monochrome with feathered edges, or show as plain rectangles?
8. Locale defects drawn as-is on the client page and elsewhere (ISO dates, decimal points, "60g", English exercise names in the player): fix during the redesign or keep 1:1?
9. Dead code found (`NutritionCard`, `MacroBars`, `AccentPicker`, `GradientBuilder`, `AdminMetrics`, `ui/TokenProof`): delete during the redesign?
10. Doors that do not exist (`/compose`, `/onboarding`, `/library` on a plan day, finishing a workout): in scope for this redesign or a later phase? The frames are drawn either way.

Status: COMPLETE.
