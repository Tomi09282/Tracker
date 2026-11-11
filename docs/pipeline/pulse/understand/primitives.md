# Pulse — shared components and the element-variant system (understand phase)

> Scope: `frontend/src/ui/{primitives,feedback,data,nav,shell}`, `frontend/scripts/check-element-roster.mjs`,
> `frontend/src/features/admin/StyleStudioPage.tsx`, read against `docs/brain/58-Pulse/Pulse System.md` section 4,
> `TRACKER-mockups/5-pulse/figma-build/app-kit.js` and the frames `_components-1..4.png`, `style-studio-1/2@2x.png`,
> `workout-2@2x.png`.
> Branch `pulse-redesign`, READ-ONLY pass on the code, 2026-10-11. No source file was changed.
>
> **How the numbers were made.** "JSX sites" = opening tags `<Name` counted by a script over `frontend/src/**/*.ts(x)`
> with comments stripped, multi-line JSX included (a plain line grep under-counts: `<Pressable[\s>]` finds 119, the real
> number is 207). "Product" = `src/features/**` minus `features/playground`. Line numbers are from the files as they
> are on this branch. Reproduction commands are in the appendix.

---

## 1. Ten things a planner must know first

1. **There is no Pulse component in the code today.** Every one of the 25 Pulse components in the task list is either a
   restyle of something boxed, or does not exist as a shared component at all (list row, ledger row, numeral, segment
   bar, macro column, monogram, notice line, screen header, chat message are all hand-rolled per screen).
2. **Three shared primitives carry almost every box in the product:** `Surface` (97 JSX sites, 34 files),
   `Pressable` (207 sites, 52 files — 161 of them in product screens) and `Field` (24 sites). Restyling `control.ts`
   and `Field.tsx` in place changes every button and input at once without touching a feature file. `Surface` cannot be
   "restyled into Pulse" — Pulse has no card — so its 96 feature sites are real per-screen migration work.
3. **Fourteen of the twenty "previewable" element components are not used by any product screen.** `FeedbackButton`
   (E1), `IconButton` (E3), E4 `Toggle`, `Checkbox` (E5), `Select` (E8), `DatePicker` (E9), `Tabs` (E10),
   `InteractiveCard` (E12), `SwipeItem` (E13), `Progress` (E16), `Slider` (E17), `SkeletonBlock` (E18),
   `PullToRefresh` (E19) and `Fab` (E20) are imported only by `features/playground/PlaygroundPage.tsx`. The product's
   real buttons are `Pressable`, its real skeleton is `ScreenSkeleton.tsx`'s `Skeleton`, its real switch is
   `primitives/Switch.tsx`. Switching those fourteen elements in the admin studio changes the playground and nothing a
   user sees. `check:elements` still counts them as "live", because it greps for `useElementVariant('E..')` call
   sites, not for consumers of the component that makes the call.
4. **Only ten elements reach a user:** E2 (2 sites), E6 (2), E7 (1), E11 (the tab bar), E14 (9 sheets), E15 (12 toast
   raises), E21 (set row), E22 (rest timer), E25 (coin balance), E26 (achievements).
5. **The variant letters are owned by the backend, and the backend is off limits in this phase.** The server serves
   the active letter per element (`GET /ui/element-styles`), the table has `CHECK (variant IN ('A','B','C','D','E'))`
   (`backend/src/db/migrations/002_theming.sql:29`) and the route validates `z.enum(['A','B','C','D','E'])`
   (`backend/src/theme/routes.js:192`). So a sixth "Pulse" variant cannot be added, and the frontend cannot change
   which letter is active. **Pulse has to look right under whatever letter the database currently holds** (today: E6 A,
   E7 A, E11 A, E14 A, E15 C, E2 A, E21 A, E22 A, E25 B, E26 A).
6. **Several active variants are, by definition, a box or a slide** — E6-A is a filled thumb travelling inside a filled
   track, E11-A is an accent pill behind the tab icon, E14-B/C are centred dialogs, E7-A is a glow ring around an input
   box. Pulse forbids every one of those shapes, and Pulse section 2.4 also says "nothing slides". The variant system
   and Pulse collide here, not at the gate.
7. **The approved design keeps the Style Studio.** `style-studio-1@2x.png` and `-2@2x.png` draw the screen with five
   variants A–E for E1, "Legyen ez" as a text link, and the active letter as a monogram with a lime dot. Retiring the
   variant system contradicts two approved frames.
8. **Two required props block a central restyle:** `EmptyState.icon` (35 sites) and `SectionHeader.icon` (13 sites +
   2 through the `SectionBadge` shim) are required `LucideIcon` props that render the tinted icon disc Pulse deletes.
   `SummaryTile.icon` (12 sites) is the same, but the whole tile is deleted.
9. **Skeletons defeat a central restyle at 94 call sites:** 71 `<Skeleton … rounded-card>`, 18 `rounded-chip/full`,
   5 `rounded-button/field` pass their own radius and box size, because they imitate the card they stand in for.
10. **One merger file silently decides whether Pulse type sizes survive.** `lib/cn.ts:34-45` lists the type steps
    `tailwind-merge` must treat as font sizes. A Pulse step (`giant`, `num`, `eyebrow` …) that is added to
    `tokens.css` and not to that list is dropped at runtime whenever it is composed with an ink colour in one `cn()`
    call. No gate catches it (the file says so itself, line 26).

---

## 2. What exists today (shared UI inventory)

| File | Lines | What it is | Product JSX sites | Draws a box? |
|---|---|---|---|---|
| `ui/primitives/Surface.tsx` + `surfaceRecipe.ts` | 44 + 119 | The card. cva recipe: `elevation` card/inset/sheet/bar, `finish` veil/glass/solid, `rim`, `interactive`, `pad` | 96 in 33 files (+1 in `SummaryTile`) | yes — radius, border, fill, sheen, rim |
| `ui/primitives/control.ts` | 175 | cva recipes `control` (variant primary/secondary/ghost/danger, `selected`, shape button/icon/chip/field, density) and `chip` (status tones) | via `Pressable`; `control(` called directly 6× in 3 feature files; `chip(` 3× | yes — secondary has border + fill, chip tones have fills |
| `ui/primitives/Pressable.tsx` | 67 | The one button. Busy = `Loader2` spinner over invisible label (lines 54-64) | 161 in 38 files | depends on variant |
| `ui/primitives/Field.tsx` | 179 | Labelled input: `rounded-field bg-[var(--field-bg)] px-3` + border (lines 110-130), marker, hint, error with `AlertCircle` | 23 in 12 files | yes |
| `ui/primitives/Switch.tsx` | 84 | `role="switch"`, track `h-6 w-11` (44 × 24), knob `size-5 bg-surface-1 shadow` | 2 (`CueSettings`, `ProfileEditorPage`) | a shape Pulse keeps |
| `ui/primitives/Toggle.tsx` | 18 | Multi-select chip = `Pressable` primary/secondary + check icon | 5 in 3 files | yes |
| `ui/feedback/ElementStyleProvider.tsx` | 84 | Loads the global variant map, `useElementVariant`, `VariantOverride` | 1 mount (`app/providers.tsx`) | — |
| `ui/feedback/catalog.ts` | 148 | 27 elements × 5 variant labels, `live` flag | read by studio, playground, gate | — |
| `ui/feedback/variants/E1…E20` (12 files) | 7 932 | The variant-aware components | see section 5.2 | most variants do |
| `ui/feedback/EmptyState.tsx` | 105 | Centred column, 120/160 px accent-tinted icon disc, title, body, stretched action | 35 in 24 files | yes — icon disc |
| `ui/feedback/ToastHost.tsx` | 183 | Context + two fixed stacks (bottom default, top opt-in), max 3 | 6 `useToast()` hooks, 12 `toast(…)` raises | renders E15 `Toast` (a card) |
| `ui/feedback/ScreenSkeleton.tsx` | 45 | `Skeleton` (shimmer block, `rounded-field`) + `ScreenSkeleton` | `Skeleton` 124 in 36 files; `ScreenSkeleton` 3 | yes — 94 sites pass a card/chip radius |
| `ui/feedback/TrendChart.tsx` + `chartGeometry.ts` | 302 + 88 | The one line chart: accent line 2 px, area gradient, 3 gridlines, dot per reading, gap chip, sr-only table | 2 (+1 via `ProgressChart`) | gap chip only |
| `ui/feedback/ProgressChart.tsx` | 53 | Mapper onto `TrendChart` | 1 | — |
| `ui/feedback/Gauge.tsx` | 158 | Ring / donut | 7 in 7 files | no (but Pulse has no ring) |
| `ui/feedback/CountUp.tsx` | 81 | Odometer number, locale-aware | 8 (+1 in `SummaryTile`) | no |
| `ui/feedback/LoadingAnnouncer.tsx`, `useMotionSafe.ts` | 44 + 52 | a11y announcer; reduced-motion hook, `SPRING`, `EASE_STANDARD` | 1 mount; used by every variant file | — |
| `ui/data/SummaryTile.tsx` | 196 | Stat tile: `Surface` + tinted icon puck + figure + caption + bar | 12 in 7 files | yes — the "stat tile grid" |
| `ui/data/SectionHeader.tsx` | 89 | 44 px tinted icon tile + `h2` (or children) + action | 13 in 8 files (+2 via `features/library/SectionBadge.tsx`) | yes — icon tile |
| `ui/data/DataTable.tsx` | 168 | Dense sortable table, `rounded-card border`, sticky header | 1 (`admin/UserSearch.tsx`) | yes |
| `ui/nav/BottomNav.tsx` | 202 | The tab bar (E11): floating pill ≤ 5 tabs, edge-to-edge slab at 6–7, Lucide icons | 1 (`app/AppLayout.tsx`) + playground | yes — capsule, blur, border |
| `ui/nav/LanguageToggle.tsx` | 52 | Bordered capsule of three chips | 2 (`AuthPage`, `SettingsPage`) | yes |
| `ui/shell/AuroraBackdrop.tsx` | 27 | Fixed gradient layer behind everything | 9 mounts in 5 files | background, not a box |
| `ui/shell/CommandPalette.tsx` | 227 | Cmd+K centred dialog, desktop only (`hidden … lg:flex`, line 151) | 1 | yes — centred card |
| `ui/shell/OfflineIndicator.tsx` | 216 | Sticky strip + outbox drain + publishes `--offline-h` | 1 (`app/providers.tsx`) | yes — bar with rail, blur |
| `ui/TokenProof.tsx` | 259 | Token demo page | **0 references anywhere — dead file** | — |

Feature-level components that are shared in practice and map to a Pulse component: `features/coaching/Monogram.tsx`
(3 sites, a disc), `features/nutrition/MacroBars.tsx` (1 site), `features/home/WeekStrip.tsx` (1 site, uses `Gauge`),
`features/chat/NotificationBell.tsx` (2 sites, a bordered disc with a count), `features/chat/ChatPanel.tsx`
(bubbles, lines 342-370), `features/coins/CoinBalance.tsx` (E25), `features/workout/SetRow.tsx` (E21),
`features/workout/RestTimer.tsx` (E22).

---

## 3. THE MAPPING TABLE — Pulse component → existing code → change → call sites

Legend for "Change": **RESTYLE** = same file, same public API, new look · **VARIANT** = a new option on an existing
recipe/component · **NEW** = a shared component that does not exist today · **DELETE** = removed once its call sites
have moved. Kit = function in `app-kit.js` (line).

| # | Pulse component (kit fn, line) | Becomes it today | Exact change | Call sites (product) |
|---|---|---|---|---|
| 1 | **Tab bar** `tabBar` (163-174), `chrome` (177-187) | `ui/nav/BottomNav.tsx` (E11) + `app/navTabs.ts` + `app/AppLayout.tsx` | RESTYLE, structural. Remove the surface (`bg-[var(--nav-bg)] backdrop-blur`, line 86), the pill/slab split (`PILL_MAX_TABS`, `navTabs.ts:160`; lines 79, 91-107), border and `rounded-chip`. Equal cells on `402 − 2×inset` (inset 10 / 12 / 8 for 5 / 6 / 7 tabs), bar 56 high (now `--nav-h`, "64px"), raster icon 32 (28 at 7 tabs) + 2 + label 11 pt sentence case Medium / SemiBold active (now `text-micro uppercase`, line 194). Active = the lime-lit image + `t1` label; idle = steel image + `t2`. `NavTabSpec.icon: LucideIcon` (`navTabs.ts:38`) must become an icon KEY (`'home' \| 'training' \| …`) resolved to an image pair inside the bar — `check-nav-active.mjs:27` imports `navTabs.ts` in plain Node, so the table cannot import image files. Add the bottom fade (130 pt, solid from 28 %). Drop `badge` (Pulse: no badges on tabs; `AppLayout` never passes one — only the playground demo does). All four implemented E11 variants conflict (A accent pill line 155-160, B dot, C stroke-width — meaningless on a raster, D badge pop); E is not implemented at all | 1 mount; 18 tab specs (5 + 6 + 7) over 7 distinct icons; 1 playground demo |
| 2 | **Primary pill** + sm `btnPrimary` (196-202) | `control({variant:'primary'})` (`control.ts:66-67`) through `Pressable`; E1 `FeedbackButton` (0 product sites) | RESTYLE of the recipe. Height 56 (sm 44) — today `min-h-[var(--control-h)]` = 44/48; radius full (28); label `bodyB` 16 SemiBold on `onAccent`; glow on idle only (`--shadow-glow` already wired, line 67); pressed = `accentDown`, glow off, scale 0.98 (now 0.97, line 36); disabled = `s2` fill + `t3` label (now `opacity-45`, line 45); busy = three dots, no glow (now a `Loader2` spinner, `Pressable.tsx:54-60`). Needs a size axis: `density` today only changes padding and type, never height (`control.ts:116-125`) | 34 static `variant="primary"` in 23 files + 17 dynamic. **9 files hold 2–3 static primaries** (ComposePage 3, NutritionTab 3, CoachDashboard 3, IntervalStage 2, OnboardingPage 2, LibraryPage 2, HomePage 2, ProfileEditorPage 2, PostEditorPage 2) — "one pill per screen" is screen work. Most dynamic ones are SELECTION (`on ? 'primary' : 'secondary'`: `Toggle.tsx:11`, `LanguageToggle.tsx:33`, Onboarding ×3) and must become row 5, not a pill |
| 3 | **Text link / destructive link** `textLink` (203-207) | Nothing matches. Nearest: `variant="ghost"` (46 sites — but it has `px-4`, min-width 44, centred, hover wash), `variant="secondary"` used as a second action (53 + 6 default = 59 bordered buttons), `variant="danger"` (5 sites — a FILLED red button, which Pulse forbids outright) | NEW variant `link` on `control` (or `ui/primitives/TextLink.tsx`): bare text in a 44 pt frame on the left edge, `capM` (in a section head) or `bodyM` (standalone), optional 16 px lead / trail glyph in `t2`, `t1` text, `off` = 40 %, pressed 60 %, `danger` = danger TEXT. Must also render as a router link: features write `<Link className={control(…)}>` today (6 `control(` calls: ComposePage 3, PublicChrome 2, ExerciseDetailPage 1). Then DELETE `secondary` and `danger` fills | up to 110 sites (59 secondary + 46 ghost + 5 danger) are candidates; the 5 danger sites: `ModerationQueue.tsx:438`, `CoachDashboard.tsx:592,622`, `ProgressPage.tsx:552,624` |
| 4 | **Icon button + count badge** `iconBtn` (209), `badgeCount` (208) | `Pressable shape="icon"` (`control.ts:112`), E3 `IconButton` (0 product sites), `features/chat/NotificationBell.tsx` | RESTYLE `shape: icon` to a bare 24 px glyph (stroke 1.75) in 44 × 44 with no fill, border or radius. NEW `BadgeCount` (lime fill, 18 high, min-width 18, radius 9, 2 px `bg` ring, `tabOn` figure, hidden at 0, "99+"). `NotificationBell` today is a bordered `bg-surface-2` disc (lines 37-38) with an accent count (54-55) | 33 icon-shape sites; bell 2 sites (`HomePage`, `CoachDashboard`) |
| 5 | **Text chips row** `chipRow` (211-220) | `Pressable shape="chip"` (40 sites, 10 with `selected`), `primitives/Toggle.tsx` (5 sites), `control`'s `selected` wash (`control.ts:100-106`), `LanguageToggle` (2 sites), status `chip()` recipe (`control.ts:154-173`; 3 calls) and 44 hand-rolled pill/tag `<span>`s | NEW `ChipRow` / `Chip`: words 24 apart, 44 high, `bodyM`, idle `t2`, selected `t1` + 2 pt lime mark under the word, horizontal bleed past the right edge, `wrap` mode for multi-select. `Toggle` is rebuilt on it (keeps `role="checkbox"`). Status chips become a plain mono caps tag (`micro`, `t2`, no outline) or a `noticeLine` dot — the seven tinted `chip` tones are DELETED. Note Product gaps line 206: the kit has no selected-chip check glyph, the live UI has one for colour-blind users | 40 chip-shape sites + 5 `Toggle` + 2 `LanguageToggle` + 3 `chip()` + 44 hand-rolled tags |
| 6 | **Segmented text switch** `segSwitch` (221) | E6 `Segmented` (`variants/E6Segmented.tsx`; 2 product sites: `PostEditorPage`, `ui/muscle-map/MuscleMap.tsx`), E10 `Tabs` (0 product sites), and FOUR hand-rolled `role="tablist"` strips built from `Pressable` chips (`AdminShell`, `ClientDetailPage`, `CoinsPage`, `ProgressPage`) | RESTYLE E6 to the two Pulse forms: hug (words 24 apart) and equal cells on a row hairline; selected = `t1` + 2 pt INK mark (neutral, not lime). Variants A (filled thumb in a `bg-surface-2` track, lines 191, 248), C (raised chip with shadow), E (accent fill cascade) are boxes; B (underline) is the Pulse shape but it SWEEPS and Pulse says nothing slides. Keep the radiogroup + roving tabindex + async busy/done/failed layer. Then the four hand-rolled tablists move onto it (second implementation of a solved problem) | 2 + 4 hand-rolled tablists |
| 7 | **Underline field** `inputField` (223-236) and **search field** `searchField` (237) | `ui/primitives/Field.tsx` (23 sites, 12 files), E7 `FeedbackField` (1 site: `LibraryPage` search), raw `<input>` 17 in 9 feature files, `<textarea>` 3, `<select>` 2, `SetRow.tsx:354` numeric inputs, `CommandPalette` input | RESTYLE `Field.tsx`: delete `rounded-field bg-[var(--field-bg)] px-3` and the 4-side border (lines 111, 124-125); 1 px `edge` underline; focus = 2 px lime underline + lime caret; error = 2 px danger underline + hint in danger; disabled = `t3` text + hairline; label `capM t2` (now `text-body-s`); input text 16; leading glyph 20 px `t2` with a 10 px gap (now a 44 px inset, line 120); hint 8 below. NEW `SearchField` (no visible label, search glyph, clear `x`). NEW underline `TextArea` and a sheet-based select (Pulse: "pickers are sheets") — neither exists as a shared component, which is why 5 screens hand-roll them. All five E7 variants conflict: A glow ring (only the pill may glow), B tinted input background, C/D status chips with fills, E gradient border | 23 + 1 + 22 raw form controls (17 + 3 + 2) |
| 8 | **Switch** `uiSwitch` (238) | `ui/primitives/Switch.tsx` (2 sites), E4 `Toggle` (0 product sites), a THIRD local `Toggle` in `ProgressPage.tsx:721` (2 sites) | RESTYLE: track 48 × 28 radius 14 (now 44 × 24), on = accent + `onAccent` knob, off = `s3` + `t2` knob, knob 22 with no shadow (now `bg-surface-1 shadow-[var(--shadow-overlay)]`, line 76), disabled 40 % (now 45 % — the file argues for 45 on purpose, line 60-62; one of the two must give). The 44 pt hit area stays | 2 + 2 local |
| 9 | **Set check / radio mark** `setCheck` (239) | `features/workout/SetRow.tsx` check button (E21, lines 463-490), E5 `Checkbox` (0 product sites), Onboarding's local `Choice` (`OnboardingPage.tsx:174`, 3 sites) | NEW `ui/primitives/CheckMark.tsx`: 44 pt frame; to do = 24 px ring, 1.5 px `edge`; done = bare lime tick, stroke 2.5. Used as the set check and as the radio mark of a single-choice list. E5's five variants all draw a filled/bordered `rounded-field` box (lines 120-128, 276) | 1 + 3 |
| 10 | **List row** `listRow` (251-263) + `rowStack` (145) | No shared component. Hand-rolled per screen: `Surface as="li"` 8, `Surface as={Link}` 11, `Surface interactive` 11, boxed `<li>` 8, `ChevronRight` in 9 files | NEW `ui/data/ListRow.tsx` + `RowStack`: min 56 (64 with a sub line), title `bodyM` 1–2 lines, sub `cap t2`, lead slot 48 (glow thumb / 28 pt monogram / 20 px glyph), trailing value (`data` if it contains a digit, else `cap`) / node / 16 px chevron `t3`, hairline between rows, destructive colour, pressed 60 %, skeleton form | every list in the product (≈ 30 Surface-as-row sites) |
| 11 | **Ledger row** `ledgerRow` (264-273) | `ui/data/SummaryTile.tsx` | NEW `ui/data/LedgerRow.tsx`: 76 high, ONE baseline — eyebrow label at x 0, note at x 112, `num` value right-aligned by ink (+ unit, + sparkline), chevron; failed = "—", never 0. `SummaryTile` is DELETED | 12 in 7 files (`ClientDetailPage` 3, `AdminPage` 2, `CoachDashboard` 2, `CoinsPage` 2, `HomeNutrition` 1, `NutritionPage` 1, `ProgressPage` 1) |
| 12 | **Numeral / fraction / stat block** `numeral` (118), `fraction` (119-127), `statBlock` (274) | `CountUp` (8 sites) for the animation; no component for the typography — figures are hand-written `text-display` / `text-title-1 tabular-nums`; `Gauge` is today's hero anchor (7 sites) | NEW `Numeral`, `Fraction` (denominator and slash in `t3`), `StatBlock` (eyebrow → 8 → numeral → caption). `CountUp` stays as the digit roller inside them. Risk: the kit places numerals by measured INK ("ink-tight"), which CSS only does with `text-box-trim` or hand-tuned negative margins | 7 `Gauge` anchors + every big figure |
| 13 | **Segment bar / stepper** `segBar` (276-284), `stepper` (285) | `features/home/WeekStrip.tsx` (ring via `Gauge`, 1 site), Onboarding progress (`Gauge` + 2 `role="progressbar"`), `CoinsPage` achievements (E26) | NEW `SegmentBar` (n square-ended 6 pt segments 8 apart, radius 1; on = lime, half = `t1` 50 %, off = `track`; optional mono label + 4 pt today dot) and `Stepper` (4 pt segments + mono "cur / n") | 3 screens |
| 14 | **Progress bar** `progressBar` (286) | E16 `Progress` (0 product sites), the inline bar in `SummaryTile.tsx:182-192`, `MacroBars.tsx`, Onboarding ×2 — all `h-1.5 rounded-chip bg-surface-2` with an accent fill | NEW `ui/data/ProgressBar.tsx`: 4 pt, `track` + `t1` fill, radius 1, lime only when it is the screen's live datum, `warn` when over. E16's five variants (stripes, ring odometer, colour ramp info→accent→success, milestone discs) have no Pulse counterpart | 3 hand-rolled + tile bars |
| 15 | **Macro column** `macroCol` (287-295) | `features/nutrition/MacroBars.tsx` (1 site, stacked rows) + `SummaryTile progress` on `NutritionPage` / `HomeNutrition` | NEW `MacroColumns`: 4 across, 16 apart — name `cap t2` · mono value `dataL` + unit · 4 pt bar · target `cap t3`; over = `warn` value + bar; no target = no bar | 1 + 2 |
| 16 | **Sparkline / line chart** `sparkline` (296-304) | `ui/feedback/TrendChart.tsx` + `chartGeometry.ts`; `ProgressChart` mapper | RESTYLE `TrendChart`: remove the area gradient (lines 204-209, 224) and the three gridlines → hairline axes; line 1.5 px in `t1`/`t2` (now 2 px accent, 225-235); one 3 pt END dot, lime only when live (now a dot per reading, 245-253); a gap becomes a DOTTED segment (now a `bg-warning-subtle` chip, 271-275); tick and date labels in mono `data`. The headline value leaves the chart and becomes a `Numeral`. NEW compact `Sparkline` (140 × 32) for ledger rows. Keep: time-based x, refusal below 3 points, the sr-only table, `emptyKey` | 2 + 1 |
| 17 | **Monogram** `monogramMark` (241-249) | `features/coaching/Monogram.tsx` (a `rounded-chip bg-surface-2` disc, 3 sites), `SettingsPage.tsx:165` (`personInitials`), `ChatPanel.tsx:163-164` (accent-ringed disc) | NEW `ui/data/Monogram.tsx`: Big Shoulders Black initials, ink-tight, sizes 28 / 64 / 176, optional lime dot (size / 8), optional light texture (image clipped to the glyphs). DELETE the feature-level disc. `lib/person.ts:95 personInitials` stays the one source of the letters | 3 + 2 hand-rolled |
| 18 | **Badge / tag** `badgeCount` (208), `tx(s,'micro')` | `NotificationBell` count, `BottomNav` badge (`bg-danger`, line 178), `chip()` tones | NEW `BadgeCount` (row 4). A tag is plain mono caps text, no outline — no component needed, only the `micro` type step | see rows 4, 5 |
| 19 | **Empty / error state** `emptyState` (306-311) | `ui/feedback/EmptyState.tsx` | RESTYLE + API change. Left-aligned (now centred, line 58), `display` title, `body t2`, then the pill (full width, only if it is the screen's one action) or a left-aligned link; NO icon disc. `icon` is a REQUIRED prop at all 35 sites (`badge` at 1, `size="anchor"` at 1). Step 1: make `icon`/`badge`/`size` optional and unrendered (no call site changes). Step 2: remove them at the call sites — `noUnusedLocals` will then force removing each orphaned Lucide import. The `[&>*]:w-full [&>*]:justify-center` action wrapper (line 99) must stop centring links | 35 in 24 files (8 pass an `action`) |
| 20 | **Skeleton** `skel` (312) | `Skeleton` in `ui/feedback/ScreenSkeleton.tsx` (124 product sites, 36 files), `ScreenSkeleton` (3), E18 `SkeletonBlock` (0 product sites) | RESTYLE the block: `s2`, radius 2, 16 / 12 high per text line, sheen on `ambient` (already a token). **94 sites override the shape** (`rounded-card` 71, `rounded-chip/full` 18, `rounded-button/field` 5) to imitate cards and discs — those class names must be stripped per screen. Note: the docblock calls it "E18-A shimmer" (line 5) but `Skeleton` never reads the variant; E18 only steers the unused `SkeletonBlock` | 124 + 3 |
| 21 | **Notice line / toast band** `noticeLine` (313), `showToast` (315) | `ui/feedback/ToastHost.tsx` + E15 `Toast` (`variants/E12E16.tsx:477-608`), `ui/shell/OfflineIndicator.tsx`, 20 inline `role="alert"` lines in 12 feature files, `Field`'s error line | NEW `ui/feedback/NoticeLine.tsx`: 6 pt semantic dot (`danger` / `warn` / `ok` / ink) + `capM` + optional trailing link, min-height 44. RESTYLE `Toast` into a BAND: the page's own black dropping over the header zone (0–120) with one notice line and a strong rule — no capsule, border, shadow, icon chip (`TOAST_TONE`, lines 448-475, is deleted). `ToastHost` default placement flips from `'bottom'` to top (line 103; only `WorkoutPlayer.tsx:296` asks for top today). `OfflineIndicator` renders a `warn` notice line; its rail, blur and nav surface go; its logic stays untouched. Keep: `toast(message, kind, options \| fn)` signature, `ToastKind`, undo, 4 s timer with pause, cap of 3, `role="status"`. Frames: `style-studio-2@2x.png` (ok dot, close ×, a half-lit rule as the countdown) and `workout-2@2x.png` (trophy glyph for `record`) | 12 raises in 6 files; 1 offline mount; 20 inline alerts |
| 22 | **Bottom sheet** `bottomSheet` (317-327) | E14 `Sheet` (`variants/E14E20.tsx:125-478`) | RESTYLE: `s2` fill, top radius 28, 1 px `hairS` edge, 60 % scrim with NO blur (now `backdrop-blur-[var(--blur-sm)]`, line 342), grabber 36 × 4 white 24 %, header = title 22 (`title`) + close icon button, body gap 16, padding 12 / 24 / 50, no shadow (now `shadow-[var(--sheet-shadow)]`, lines 363, 403). Variants B and C are CENTRED DIALOGS (line 245, 354-397) — Pulse: "no centred dialogs"; D floats inset with a stacked deck; E hands the panel to a filled success / danger disc (`STATUS_TONE`, lines 47-51) — Pulse: semantic colour is never a filled surface. NEW thin `ConfirmSheet` recipe for destructive actions (danger text + `t1` cancel, no pill) — there is no `confirm()` in the code today, destructive buttons act directly or open a hand-built sheet | 9 in 6 files (CoachDashboard 4, ClientDetailPage, ComposePage, PostEditorPage, PlanEditorPage, ProgressPage). None passes `status` / `onRetry` — only the playground does |
| 23 | **Chat message** `chatMsg` (328-333) | `features/chat/ChatPanel.tsx:342-370` — bubbles (`max-w-[80%] px-3 py-2`, mine = `bg-accent-subtle` + accent border) | NEW `ChatMessage` (shared or kept in the feature): no bubble; theirs left in `t1`, mine right in `t2`, max 280 wide, 4 within a group / 20 between, one mono `micro` stamp per group. Composer = underline field + sm pill (now a `rounded-field` textarea + a round button, lines 279-291) | 1 definition, used by `ChatPage` and `coaching/ChatTab` |
| 24 | **Screen headers** `screenHead` greet / root / push (153-160) | No shared component. 23 `<h1>` in 23 feature files (15 at `text-title-1`, 6 at `text-display`, 1 `sr-only`, 1 multi-line in `AuthPage`; some centred, some with `font-display`); back links hand-rolled with `ChevronLeft` / `ArrowLeft` in 14 files; `features/marketplace/PublicChrome.tsx` for public pages | NEW `ui/shell/ScreenHeader.tsx`: `greet` (title 22 + date line, Home only), `root` (one `display` line + ONE optional trailing icon button), `push` (44 pt back row: chevron + parent name as eyebrow, then the `display` title). The default parent label "Vissza" in the kit must be an i18n key. The Review Brief (3.7) maps this to `ui/data/SectionHeader` — that is wrong, `SectionHeader` is a section head | 23 files |
| 25 | **Section head + rules** `sect` (139-144), `secHead` (130-138), `rule` (129) | `ui/data/SectionHeader.tsx` (13 sites, 8 files) + `features/library/SectionBadge.tsx` shim (2 sites); 32 `<h2>` in 20 feature files; hairlines written as `h-px bg-border-token` or `border-t` | REWRITE `SectionHeader`: strong rule → 16 → eyebrow (Big Shoulders Bold 16, upper, `t2`) with ONE trailing meta or link on the same baseline → 16 → content. The 44 px tinted icon tile is deleted; `icon` is a REQUIRED prop at 15 sites (same two-step as row 19). NEW `Rule` (`strong` = white 14 %, row = white 8 %). DELETE the `SectionBadge` shim | 15 + 32 hand-written `h2` |

### 3.1 Shared components with NO Pulse counterpart

| Component | Product sites | What happens |
|---|---|---|
| `Surface` + `surfaceRecipe` | 96 in 33 files | DELETE after migration. Each site becomes a section (rule + eyebrow), a row stack or nothing. Only `elevation="sheet"` (1 site) has an heir: the bottom sheet |
| `SummaryTile` | 12 in 7 files | DELETE → ledger rows / stat blocks |
| `Gauge` | 7 in 7 files (2 are donuts: `CoachDashboard`, `ComposePage`) | No ring exists in Pulse. Replace per screen by a giant numeral + segment bar / stepper; DELETE when the last one is gone |
| `AuroraBackdrop` | 9 mounts in 5 files | DELETE (Pulse: no gradients). `check-aurora` then passes with "0 backdrop mount(s)" — it does not fail on zero — so the gate becomes vacuous and should be retired with it |
| `DataTable` | 1 (`admin/UserSearch`) | A bordered `rounded-card` table. Pulse draws admin lists as row stacks; either rebuild as rows or keep as a desktop-only exception (owner question) |
| `CommandPalette` | 1 | A centred dialog, desktop only. Pulse is drawn at 402 pt only and bans centred dialogs; not designed (owner question) |
| `LanguageToggle` | 2 | Becomes a `ChipRow` / hug `Segmented`; the capsule goes. Keep `lang=` and `aria-pressed` |
| `InteractiveCard` (E12), `Fab` (E20), `SwipeItem` (E13), `Slider` (E17), `PullToRefresh` (E19), `Select` (E8), `DatePicker` (E9), `Tabs` (E10), `Progress` (E16), `SkeletonBlock` (E18), `FeedbackButton` (E1), `IconButton` (E3), E4 `Toggle`, `Checkbox` (E5) | 0 each | Playground-only. See section 5 for what their fate does to the gate |
| `ui/TokenProof.tsx` | 0 references | Dead file, 259 lines; delete |

---

## 4. The "no boxes" migration — everything that draws a box today, with counts

This is the size of the job. "Central" = fixed once in a shared file; "per screen" = a feature file must be edited.

| What draws the box | Where it is defined | Product sites | Fix |
|---|---|---|---|
| **Card** — `Surface` (radius + border + fill + sheen + rim) | `ui/primitives/surfaceRecipe.ts:25-117` | **96 in 33 files**. Props in use: `pad="none"` 25, `as="section"` 16, `as={Link}` 11, `interactive` 11, `as="li"` 8, `elevation="inset"` 7, `rim={false}` 4, `finish="glass"` 3, `elevation="sheet"` 1 | per screen. Top files: CoachDashboard 7, ProgressPage 7, ProfileEditorPage 6, ClientDetailPage 5, ComposePage 5, SettingsPage 5, StyleStudioPage 4, CoinsPage 4, ExerciseDetailPage 4, PlanEditorPage 4 |
| **Stat tile** — `SummaryTile` (a `Surface` + tinted icon puck) | `ui/data/SummaryTile.tsx:108-194` | 12 in 7 files | per screen → `LedgerRow` / `StatBlock` |
| **Bordered button** — `Pressable` `secondary` (border + `bg-surface-1`) | `ui/primitives/control.ts:73-77` | 53 explicit + 6 by default = **59** | per screen: each becomes a text link or disappears; the variant is then deleted centrally |
| **Filled red button** — `Pressable` `danger` | `control.ts:80` | 5 | per screen → danger text link + confirm sheet |
| **Ghost button with hover wash** | `control.ts:78` | 46 | central (becomes the link look) + per-screen check of alignment |
| **Chip pill** — `Pressable shape="chip"` (`rounded-chip px-4`, bordered via `secondary`, washed via `selected`) | `control.ts:100-106, 113` | 40 (10 with `selected`) + 5 `Toggle` + 2 `LanguageToggle` | per screen → `ChipRow`; `Toggle` central |
| **Icon disc button** — `Pressable shape="icon"` with `secondary` | `control.ts:112` | 33 | central (bare glyph) once `secondary` is not the default for icon shape |
| **Boxed input** — `Field` | `ui/primitives/Field.tsx:110-130` | 23 in 12 files | central |
| **Hand-rolled boxed inputs** — raw `<input>` / `<textarea>` / `<select>` | feature files | 17 + 3 + 2 = **22** in 11 files (NutritionPage 3, GradientBuilder 3, SetRow 2, AccentPicker 2, ProgressPage 2 + 1 select, NutritionTab 2, ProfileEditorPage textarea + select, PostEditorPage input + textarea, ChatPanel textarea, PlanEditorPage, MarketplacePage) | per screen → shared underline `Field` / `TextArea` / sheet picker |
| **Hand-rolled boxed elements** (a radius together with a fill or a border, not through a primitive) | feature files | **139 in 42 files**: 44 pills / tags, 38 discs / pucks / dots, 38 field-radius tiles, 18 card-radius panels, 1 other. By tag: `span` 87, `div` 20, `li` 8, `input` 8, `textarea` 3, `label` 3, `p` 3, `Link` 2, `select` 2 | per screen. Top files: PlanEditorPage 8, StyleStudioPage 7, ComposePage 7, NutritionPage 6, ProgressPage 6, SettingsPage 6, SetRow 6 |
| **Tinted icon tile in section heads** — `SectionHeader` | `ui/data/SectionHeader.tsx:75-80` | 13 + 2 via shim | central (API change, two steps) |
| **Tinted icon disc in empty states** — `EmptyState` | `ui/feedback/EmptyState.tsx:59-82` | 35 in 24 files | central (API change, two steps) |
| **Card- and disc-shaped skeletons** | call-site `className` on `<Skeleton>` | 94 of 124 sites (`rounded-card` 71, `rounded-chip/full` 18, `rounded-button/field` 5) | per screen (strip the shape) + central base restyle |
| **Monogram discs** | `features/coaching/Monogram.tsx`, `ChatPanel.tsx:163-164` | 3 + 1 | central once `ui/data/Monogram` exists |
| **Bell disc** | `features/chat/NotificationBell.tsx:37-38` | 2 | one file |
| **Chat bubbles** | `features/chat/ChatPanel.tsx:355-357` | 1 definition (2 screens) | one file |
| **Toast capsule** | `ui/feedback/variants/E12E16.tsx:504-508` | 1 definition, 12 raises | central |
| **Tab-bar capsule / slab** | `ui/nav/BottomNav.tsx:85-107` | 1 | central |
| **Offline strip** (bar with rail + blur) | `ui/shell/OfflineIndicator.tsx:183-193` | 1 | central |
| **Language capsule** | `ui/nav/LanguageToggle.tsx:20` | 2 | central |
| **Bordered table** | `ui/data/DataTable.tsx:76` | 1 | owner question |
| **Centred dialogs** — `CommandPalette`; `Sheet` variants B / C | `ui/shell/CommandPalette.tsx:151-160`; `E14E20.tsx:354-397` | 1; 0 while E14 stays on A | owner question; variant policy |
| **Variant-drawn boxes inside element components** (tracks, thumbs, rings, tinted badges) | `ui/feedback/variants/*` — `rounded-chip` 76×, `border` utilities 86×, `bg-surface-2/3` 32×, `bg-accent-subtle` 22×, semantic `-subtle` fills 19×, `shadow-*` 11× | reach a user only through E2, E6, E7, E14, E15 | variant policy (section 5) |

Raw utility totals over the whole of `src` (for scale, comments stripped): `rounded-card` 109 (92 in features),
`rounded-chip` 185 (92 in features, 76 in variants), `rounded-field` 66, `rounded-full` 25, border utilities 308
(170 in features), `bg-surface-2` 71, `bg-accent-subtle` 72, semantic `-subtle` fills 65, `shadow-*` 19,
`backdrop-blur` 7.

**A token-level lever worth knowing.** `Surface` paints only through component tokens — `--card-bg`, `--card-border`,
`--card-radius`, `--glass-sheen`, `--glass-lip`, `--glass-underside` (`surfaceRecipe.ts:27-29, 35, 53, 88`). A Pulse token
block that sets those to transparent / none makes all 96 cards invisible on day one without editing a feature file.
It does not remove their padding (`--card-pad`) or their place in the layout, and it makes a leftover card invisible
rather than gone — so it needs a ratchet gate beside it (work item W19) or the leftovers will never be found.

---

## 5. The element-variant system, honestly

### 5.1 How it works

1. **Storage (backend, not to be touched in this phase).** Table `element_style_config(element_id, variant, updated_by,
   updated_at)`, `variant` constrained to `'A'…'E'` (`backend/src/db/migrations/002_theming.sql:27-32`), seeded with 26
   rows (lines 37-42) plus E27 by migration 012. One row per element, GLOBAL for every user ("owner requirement 24").
2. **Read.** `GET /ui/element-styles` is public and returns `{ styles: { E1: 'D', … } }` (`backend/src/theme/routes.js:166-172`).
   `ElementStyleProvider` (`ui/feedback/ElementStyleProvider.tsx:58-67`) loads it once (`staleTime` 5 min) and merges it
   over a client fallback: `'A'` for every catalogue entry, overridden by a hand-written `CURATED` map of ten
   (lines 30-41). The server value always wins once it arrives.
3. **Use.** A component calls `useElementVariant('E6')` (line 80-84) and branches on the letter. `VariantOverride`
   (69-73) forces letters for a subtree — the studio and the playground use it to show all five side by side.
4. **Write.** `PUT /ui/element-styles/:id` — `requireAuth`, `requireRole('admin')`, rate-limited, zod-validated
   (`^E[1-9][0-9]{0,2}$`, enum A–E), re-checked with `assertAdmin`, written with an audit row in one transaction
   (`routes.js:191-238`). The frontend hook is `features/admin/useElementStyles.ts`.
5. **The studio** (`features/admin/StyleStudioPage.tsx`, 436 lines) picks one of the 27 elements, shows it live under
   its active letter, lists the five variants each with a live specimen, and commits on one tap. The specimens are
   NOT its own: it imports `Demo` and `PREVIEWABLE` from `features/playground/PlaygroundPage.tsx` (line 39).

### 5.2 What an admin can actually switch today

"Reaches a user" = a product screen renders the component that reads the letter. Seed = the letter in migration 002/012
(what a fresh database serves).

| El. | Name | Seed | Component that reads it | Reaches a user? | Distinct behaviours in code | Pulse conflict in the variants |
|---|---|---|---|---|---|---|
| E1 | Button | D | `FeedbackButton` (`E1Button.tsx:125`) | **no** — playground only; product buttons are `Pressable` | 5 | B ripple blob, D progress fill, E badge |
| E2 | Copy button | A | `CopyButton` (`E2CopyButton.tsx:166`) | yes — `CoachDashboard` ×2 (join code) | 5 | B tooltip bubble, C confetti, done/failed tint the button (481-482) |
| E3 | Icon button | A | `IconButton` (`E3IconButton.tsx:101`) | **no** | 5 | D/E rings and fills |
| E4 | Toggle | A | E4 `Toggle` (`E4Toggle.tsx:84`) | **no** — product uses `primitives/Switch`, which reads nothing | 5 | D glow ring, C text in track |
| E5 | Checkbox | A | `Checkbox` (`E5Checkbox.tsx:70`) | **no** | 5 | all five draw a bordered / filled box |
| E6 | Segmented control | A | `Segmented` (`E6Segmented.tsx:99`) | yes — `PostEditorPage`, and `MuscleMap` (on Library, Exercise detail, Workout) | 5 | A thumb in track (the ACTIVE one), C raised chip, E fill; B sweeps |
| E7 | Text input | A | `FeedbackField` (`E7Field.tsx:141`) | yes — `LibraryPage` search only; the other 23 fields are plain `Field` | 5 | A glow ring (ACTIVE), B tinted fill, C/D chips, E gradient border |
| E8 | Select | D | `Select` (`E8E9.tsx:215`) | **no** | 5 | — |
| E9 | Date picker | A | `DatePicker` (`E8E9.tsx:714`) | **no** | 5 | — |
| E10 | Tabs | A | `Tabs` (`E10Tabs.tsx:97`) | **no** — four screens hand-roll their tablists instead | 5 | A pill in track, D/E fills |
| E11 | Bottom nav item | A | `BottomNav` (`BottomNav.tsx:50`) | yes — every signed-in screen | **3 visible**: A pill, B dot, C stroke-width. D only animates a badge nobody passes; E has no code at all | A accent pill (ACTIVE), C needs a vector icon |
| E12 | Card | D | `InteractiveCard` (`E12E16.tsx:72`) | **no** — product cards are `Surface` | 5 | the element itself is a box |
| E13 | List item + swipe | B | `SwipeItem` (`E14E20.tsx:491`) | **no** | 5 | — |
| E14 | Modal / sheet | A | `Sheet` (`E14E20.tsx:146`) | yes — 9 sheets | 5 | B and C are centred dialogs; D inset deck; E filled status disc |
| E15 | Toast | C | `Toast` (`E12E16.tsx:479`) | yes — 12 raises | **3**: C animates the icon chip (532), D morphs on undo (558); A, B and E render identically | the icon chip C animates is deleted in Pulse |
| E16 | Progress / ring | D | `Progress` (`E12E16.tsx:662`) | **no** | 5 | stripes, colour ramp, ring |
| E17 | Slider | A | `Slider` (`E17E19.tsx:258`) | **no** | 5 | — |
| E18 | Skeleton | A | `SkeletonBlock` (`E17E19.tsx:704`) | **no** — the product's 124 skeletons are `ScreenSkeleton.tsx`'s `Skeleton`, which reads nothing | 5 | — |
| E19 | Pull to refresh | C | `PullToRefresh` (`E17E19.tsx:792`) | **no** | 5 | — |
| E20 | FAB | B | `Fab` (`E14E20.tsx:598`) | **no** — no product screen mounts a FAB; Pulse has none | 5 | the element does not exist in Pulse |
| E21 | Set-check row | A (client fallback says **B**, `ElementStyleProvider.tsx:39`) | `SetRow` (`features/workout/SetRow.tsx:136`) | yes — workout player | **4**: B hold, C swipe, E undo pill; D has no branch and equals A | row tints `bg-success-subtle` / `bg-accent-subtle` + ring (387, 402) |
| E22 | Rest timer | A | `RestTimer` (`features/workout/RestTimer.tsx:41`) | yes | **3**: B (86), C (59); D and E equal A | ring vs the giant numeral + bar in `workout-2@2x.png` |
| E23 | Like / reaction | A | — | dormant (declared) | 0 | — |
| E24 | Follow button | A | — | dormant (declared) | 0 | — |
| E25 | Coin balance | B | `CoinBalance` (`features/coins/CoinBalance.tsx:53`) | yes | **3**: A = B roll, C pulse, D = E static (74-75) | — |
| E26 | Streak / achievement | A | `CoinsPage.tsx:369` | yes | **2**: A adds `animate-pulse` (406); B–E identical | — |
| E27 | Interval stage | A | — | dormant (declared) | 0 | — |

Summary: 27 in the catalogue · 24 "live" by the gate's definition · **10 reach a user** · 14 change only the QA
playground · 3 dormant. Of the 10 that reach a user, five have fewer than five real behaviours.

### 5.3 What `check:elements` freezes (and what it does not)

`frontend/scripts/check-element-roster.mjs` (204 lines), wired into `npm run build` as `check:elements`. Current
output: `27 in the catalogue — 24 with live consumers, 20 previewable, 3 declared dormant` /
`live with no playground demo: E21 E22 E25 E26` / `OK`.

It asserts four things:

1. **The fallback is derived, not typed** (lines 96-113): `ElementStyleProvider.tsx` must contain `CATALOG.map(`.
2. **`PREVIEWABLE` equals the demo switch** (115-132): the set literal in `PlaygroundPage.tsx` must list exactly the
   `case 'E..':` labels of `Demo`. If the literal disappears the gate reports itself blind.
3. **`catalog.live` equals the measured call sites** (147-165): the ids matched by
   `/id: '(E\d+)',[\s\S]{0,160}?live: true,/` in `catalog.ts` must be exactly the ids found by
   `/useElementVariant\(\s*'(E\d+)'/` anywhere under `src`. Both directions fail the build.
4. **Nothing inert is undeclared** (167-185): a catalogue id with no call site must be in the script's own `DORMANT`
   map (lines 47-51: E23, E24, E27), and a `DORMANT` id that gains a call site must be removed from it.

It hard-codes three paths (lines 37-39): `src/ui/feedback/catalog.ts`, `src/ui/feedback/ElementStyleProvider.tsx`,
`src/features/playground/PlaygroundPage.tsx`. Moving or deleting any of them throws.

What it does NOT see — the parts that matter for Pulse:

- whether the component holding the call is rendered by any product screen (14 are not);
- whether the letter is branched on at all, or whether five letters produce five behaviours (E15, E21, E22, E25, E26
  have fewer);
- a call written with a variable (`PlaygroundPage.tsx:315` `useElementVariant(id)`) — invisible to the regex;
- the database: seed parity is asserted by the backend smoke suite against a running server, not here;
- `CURATED` versus the seed: E21 is `B` on the client and `A` on the server, on purpose and documented
  (`ElementStyleProvider.tsx:23-28`), so the set row changes behaviour between first paint and the server's answer.
- Fragility: check 3's regex allows 160 characters between `id:` and `live: true`. A new field or a longer `name`
  inserted between them in `catalog.ts` makes a live element read as not live and fails the build with a misleading
  message.

### 5.4 The options for Pulse

Facts that bound every option: the backend cannot change in this phase, so the letters stay A–E and the active letter
stays whatever the database holds; `tsconfig.app.json:20-21` sets `noUnusedLocals` and `noUnusedParameters`, so `const variant = useElementVariant('E6')`
followed by code that ignores `variant` does not compile; the approved design draws the studio as a working screen.

**Option A — Pulse is the skin; the variants stay selectable and are narrowed to motion and feedback.** (recommended)

- Shape, colour and layout come from Pulse and are the same under all five letters. A variant may only change HOW a
  state change happens — timing, spring, order, which glyph confirms — inside Pulse's own rule (transform and opacity
  only). That is what the catalogue already claims the variants are ("differences in motion and feedback, not in
  colour", `Screens/style-studio.md` Purpose).
- `check:elements`: unchanged as long as every `useElementVariant('E..')` call stays where it is — still 27 / 24 / 20 / 3.
  No backend change, no database write.
- Style Studio: rebuilt to the two frames (section 5.5); keeps working.
- Cost: every branch that draws a container has to be rewritten or aliased. For the ten elements that reach a user:
  E6 (A, C, E), E7 (all five), E11 (A, B, C, D), E14 (B, C, D, E), E15 (C), E2 (B, C and the state tints), E21 (row
  tints), E22 (ring vs numeral). For the fourteen playground-only ones it is optional — they are not user-facing.
- The honesty gap it opens: when two letters are made to render the same (an alias), the gate cannot see it and the
  studio would again offer a switch that changes nothing. The project already has the pattern for this — `live`,
  `DORMANT`, the "nem használt" label. Add a declared, gate-checked field for aliased variants so the studio can label
  them.
- Collision to settle with the owner: Pulse 2.4 says "nothing slides", and E6-A is literally "Sliding-thumb", E6-B
  "Underline-sweep", E10-A "Motion-highlight". Either 2.4 binds only the default letter, or those variants are renamed
  and redefined.

**Option B — collapse to one behaviour per element.**

- B1, keep the hook call and ignore the value: does not compile under `noUnusedLocals` unless the call is written as a
  bare statement — and then the gate passes while the studio lists 24 "live" elements whose switch changes nothing.
  That is precisely the defect `check-element-roster.mjs` was written to stop, in a form it cannot detect.
- B2, remove the hook calls: gate check 3 fails until each element is set `live: false`, and check 4 fails until each
  is added to `DORMANT` with a reason. The studio then shows every element as "nem használt" with disabled controls.
  Contradicts the approved studio frames (E1 live, "Legyen ez" active) and owner requirement 24.
- Saves the variant rewrite. Leaves 27 database rows and a settable endpoint that do nothing.

**Option C — retire the system.**

- Delete `ui/feedback/catalog.ts`, `ElementStyleProvider.tsx` (and its mount in `app/providers.tsx`),
  `ui/feedback/variants/` (7 932 lines — after moving `Sheet`, `Toast`, `Segmented`, `CopyButton`, `FeedbackField` out,
  because product screens import them from there), `features/playground/`, `features/admin/StyleStudioPage.tsx`,
  `useElementStyles.ts`; remove `check:elements` from the `build` script in `frontend/package.json` and delete the gate;
  remove the routes `playground` and `admin/styles` (`app/router.tsx:123, 127`), the two command-palette entries
  (`CommandPalette.tsx:94-95`), the `admin.styleStudio` link and the `studio.*` / `nav.styleStudio` / `nav.playground`
  i18n keys in three bundles (then re-run `check:i18n` and `check:nav`, whose "every route has a door" rule reads the
  router). The backend keeps a public endpoint nobody calls.
- Contradicts two approved frames, the 24-screen list in `0000 Index.md` and Review Brief X-13.

**Recommendation.** Option A, in two steps so it does not block screen work:

1. Foundation (before screens): make the Pulse look variant-independent in the five shared components that reach users
   (`BottomNav`, `Sheet`, `Toast`, `Segmented`, `FeedbackField`) plus `CopyButton`. Where a letter cannot exist in Pulse,
   alias it to the Pulse default and declare the alias in the catalogue; the studio labels it.
2. Later (parallel to screens, not blocking): re-author the motion differences one element at a time, and decide the
   fate of the fourteen playground-only elements (owner question 2).

### 5.5 What Pulse does to the Style Studio screen

Measured in today's file: 4 `Surface`, 2 `Pressable` call sites (27 chooser chips, 5 commit buttons at runtime),
3 `Skeleton`, 1 `EmptyState`, 7 hand-rolled boxed elements, a 27-entry `ELEMENT_ICON` map of Lucide glyphs
(lines 101-129). The code renders four "Legyen ez" as PRIMARY buttons (line 409) next to six E1 specimens that are
primary buttons too — ten filled accent shapes on one screen.

The frames (`style-studio-1@2x.png`, `style-studio-2@2x.png`) draw:

- header: eyebrow "MEGJELENÉS" in `t2` (today `text-accent`, line 156 — Pulse has no lime headings), display title, intro;
- hero with no surface: "BUTTON · E1" eyebrow left, "AKTÍV" mono tag right, the ACTIVE LETTER as a giant monogram with
  a lime dot ("D."), the variant name under it, the live specimen on the right;
- chooser: a text `ChipRow` — "E1 Button · E2 Copy button · …" with the lime mark under the selected one. The icon discs
  and the whole `ELEMENT_ICON` map go;
- "VÁLTOZATOK" section head on a strong rule, then the consequence note;
- five rows divided by hairlines: letter as a `num` numeral (`t3`; active = `t1` + lime dot), variant name as an
  eyebrow, the specimen, and on the right "Legyen ez" as a TEXT LINK or "✓ Ez az aktív" (lime tick, `t2` text) with an
  "AKTÍV" tag;
- the result toast as a top band: ok dot, sentence, close ×, a half-lit rule as the countdown (frame 2).

Dependencies: `ChipRow`, `TextLink`, `Numeral` / `Monogram`, `SectionHead` / `Rule` / `RowStack`, the toast band, and
the variant policy. The specimens are real components, so they turn Pulse exactly as far as the components do: E1's
specimen is `FeedbackButton` → `Pressable` → `control.ts`, so it becomes the lime pill centrally.

Conflict to note: `Screens/style-studio.md` (Notes, "The toast") says the toast sits at the BOTTOM because that is what
the code does; frame 2 draws it at the TOP, which is also what Pulse System section 4 specifies. The frame and the law
agree; the note describes the old code.

---

## 6. Hard constraints for whoever implements this

Each is enforced by a file. Breaking one fails `npm run build` unless marked "(no gate)".

1. **Raw `<button>` only inside `src/ui/`** — `scripts/check-tokens.mjs:82-89` (`raw-button`, `uiExempt`). Every new
   Pulse control (pill, link, chip, check mark, pressable row) lives in `src/ui` or composes `Pressable`.
2. **44 px floor on `<button>` / `<a>`** — `check-tokens.mjs:75-81` (`tiny-target`) and `control.ts:30`. The 18 px badge
   and the 24 px ring are graphics inside a 44 pt frame, never the target.
3. **No raw hex, `rgb()`, Tailwind palette, `duration-[…ms]`, `rounded-[…px]`, `cubic-bezier(`, off-grid `p-[13px]`
   outside `tokens.css`** — `check-tokens.mjs:23-74`. Pulse's radii 1 / 2 / 9 / 14 / 28, the 1.5 px ring and the glow all
   need tokens first; `rounded-[2px]` fails the build.
4. **A `var(--x)` or project utility that is not declared fails** — `check-tokens.mjs:109` onwards (rule set two). A Pulse
   component cannot land before its tokens.
5. **Type steps must be registered in the class merger** — `src/lib/cn.ts:34-45` (no gate). Unregistered, the size is
   silently dropped when composed with an ink colour.
6. **Roster parity** — `scripts/check-element-roster.mjs` (section 5.3): keep `CATALOG.map(` in the provider, keep
   `PREVIEWABLE` equal to the `Demo` cases, keep `live` equal to the literal `useElementVariant('E..')` call sites, keep
   `DORMANT` honest, do not move the three files.
7. **`StyleStudioPage` depends on the playground** — `StyleStudioPage.tsx:39` imports `Demo, PREVIEWABLE`. Every `Demo`
   case must keep compiling when a component's props change (e.g. `BottomNav`'s icon type, `EmptyState`'s `icon`).
8. **Tab table stays a plain-Node module** — `scripts/check-nav-active.mjs:27` imports `src/app/navTabs.ts` directly;
   `scripts/check-nav.mjs:60-66, 85, 97` parses it with regexes (`{ to:`, `labelKey: '…'`). No image imports, no JSX,
   keep the `to:` / `labelKey:` literals.
9. **The bar may not clamp and must reserve both horizontal insets** — `check-nav.mjs:107` (no `.slice(0, n)` in
   `BottomNav.tsx`) and `116-126` (the file must contain `safe-area-inset-left` and `safe-area-inset-right`).
10. **Edge-pinned fixed / absolute elements account for the safe area** — `scripts/check-safe-area.mjs`. Applies to the
    new tab bar, bottom fade, docked action, toast band (`top-0`) and bottom sheet.
11. **Nothing paints over a mounted `AuroraBackdrop`** — `scripts/check-aurora.mjs`. Removing all nine mounts is legal
    (the gate prints `0 backdrop mount(s)` and passes); leaving one under a filled wrapper is not.
12. **`BottomNav` owns `aria-current`** from `isTabActive` (`BottomNav.tsx:77, 134`; rule in `navTabs.ts:105-117`,
    asserted by `check-nav-active.mjs`). The Pulse bar keeps a plain `Link` + computed `aria-current`.
13. **Toast contract** — `ToastHost.tsx:53-63`: `toast(message, kind?, options | (() => void))`; a bare function as
    the third argument still means undo (`features/compose/useComposeFlow.ts` passes it that way). `ToastKind` =
    `'success' | 'error' | 'info' | 'record'` (`E12E16.tsx:413`). 12 raises depend on it.
14. **Sheet contract** — `E14E20.tsx:125-144`: `open, onClose, title, children, status?, onRetry?`; Escape closes, focus
    moves in, `role="dialog" aria-modal`. 9 product sites.
15. **`OfflineIndicator` is logic, not only a strip** — it drains the outbox (`OfflineIndicator.tsx:46-61`), confirms
    connectivity through `/healthz` (66-83) and publishes its measured height as `--offline-h` (120-135), which
    `WorkoutPlayer` subtracts to stay one viewport tall. Restyle the markup only.
16. **Accessibility that is structural today and must survive the restyle (no gate):** `Switch` is `role="switch"`
    (`Switch.tsx:46`); `Segmented` is a radiogroup with roving tabindex (`E6Segmented.tsx:177-224`); `Field` always
    renders its label and wires hint / error / marker through `aria-describedby` (`Field.tsx:67-109`); `TrendChart`
    carries the data as an sr-only table (280-298); `DataTable` puts `aria-sort` on the `th`; every `Skeleton` is
    `aria-hidden` and `LoadingAnnouncer` speaks for all of them; every control redraws `focus-visible`
    (`control.ts:40-41`). Pulse System section 4 defines no focus state — the ring stays.
17. **Reduced motion keeps the state change** — `useMotionSafe.ts`; the toast countdown is not rendered at all under
    reduced motion (`E12E16.tsx:596`), because a frozen full bar lies.
18. **Backend contract (out of scope to change)** — letters A–E only: `002_theming.sql:29`, `theme/routes.js:192`.
19. **TypeScript `noUnusedLocals` / `noUnusedParameters`** (`tsconfig.app.json:20-21`) — removing an icon prop or a variant branch leaves imports and locals that fail
    `tsc -b`; every API change has to be followed through its call sites in the same change. A prop kept only for compatibility must stay in the props TYPE and not be destructured, or the component itself fails to compile.
20. **No hard-coded copy** — `check-i18n` covers hu / en / de. The kit's default back label "Vissza"
    (`app-kit.js:156`) and `TABS` labels (line 161) are Figma conveniences; in code they are keys.

---

## 7. What will break or contradict Pulse, and the recommended answer

| # | What | Why | Recommended answer |
|---|---|---|---|
| 1 | The database's active letters draw boxes (E6-A track + thumb, E11-A accent pill, E7-A glow ring) | The frontend cannot change the letter; Pulse bans those shapes | Make the Pulse shape letter-independent; variants only modulate motion (Option A) |
| 2 | "Nothing slides" (Pulse 2.4) vs variants named Sliding-thumb / Underline-sweep / Motion-highlight | The motion law contradicts the variant's identity | Owner question 1; until answered, alias those letters to the Pulse default and declare it |
| 3 | Ignoring a variant silently | `noUnusedLocals` rejects the unused local; a bare call passes the gate while the studio lies | Never keep a hook call that does not steer anything; alias + declare instead |
| 4 | Fourteen "live" elements are playground-only | The gate measures hook calls, not consumers | Tell the owner (question 2); optionally extend the gate to require a product import per live element |
| 5 | Raster tab icons vs `icon: LucideIcon`; E11-C (stroke-width) cannot act on an image | `navTabs.ts:38`, `BottomNav.tsx:167-173`; Review Brief X-13 | Icon KEY in `navTabs.ts`, image pair resolved in `BottomNav`; E11-C redefined (scale 1 → 1.12) or aliased |
| 6 | Pill / slab duality and `PILL_MAX_TABS` | Pulse has one bar shape for 5, 6 and 7 tabs | Delete the split; insets 10 / 12 / 8 and icon 32 / 32 / 28 by count |
| 7 | "One lime pill per screen" vs 9 files with 2–3 static primaries, selection states painted `primary`, and the studio's four | `control.ts:66` is the only filled accent, used for three different meanings | Selection → chip mark; second actions → text link; the per-screen audit belongs to screen work, the recipes to the foundation |
| 8 | No Pulse heir for `secondary` (59), `danger` fill (5), `ghost` wash (46) | Pulse has exactly two action looks: pill and text | Add `link` first, migrate, then delete the old variants so they cannot come back |
| 9 | Required `icon` props on `EmptyState` (35), `SectionHeader` (15), `SummaryTile` (12) | The prop renders the tinted disc Pulse deletes | Two steps: optional + unrendered now; removed at call sites with the screens |
| 10 | 94 skeleton call sites carry a card / disc shape | A central restyle cannot reach a call-site class | Base restyle centrally; strip overrides per screen; add to the ratchet gate |
| 11 | Toast position and the offline strip | Code default is bottom (`ToastHost.tsx:103`); Pulse is a top band. The offline strip is `sticky top-0` on the same `--z-toast` layer — the file itself warns a top toast lands on it (`ToastHost.tsx:37-40`) | One top status zone: the offline notice line in flow, the toast band over the header zone, both built from `NoticeLine`; flip the default placement and drop the per-call `placement` |
| 12 | Disabled opacity: 45 % in `control.ts:45` and `Switch.tsx:62` (argued in a comment) vs Pulse 40 %, and the disabled pill is a fill change, not opacity | Two things that must agree | One token (`--disabled-opacity`) at Pulse's 40 %; the pill gets its own disabled fill |
| 13 | Control height: Pulse pill 56, sm 44; everything today reads `--control-h` (44, 48 in Solar) so a field and the button beside it match | `control.ts:20-30`, `Field.tsx:112-115`, `Switch.tsx:54-58` | A real size axis on `control` (`size: 'lg' \| 'sm'`); the field stays 44; the composer pairs a 44 field with the sm pill |
| 14 | Ink-tight numerals and baseline placement (`numeral`, `fraction`, `ledgerRow`, `secHead` measure rendered ink in Figma) | CSS has no ink metrics; "correct in source, renders wrong" | Use `text-box-trim` where supported plus per-face fallback constants as tokens; verify by screenshot against `_components-2/3.png`, not by reading the source |
| 15 | Images on LIGHTEN need every ancestor to be unfilled (Pulse section 5) | Same defect class as the aurora (an opaque wrapper silently covers it) | `GlowImage` component + a gate modelled on `check-aurora` |
| 16 | Theme packs: recipes read pack-owned `--control-h`, `--border-width`, `--radius-*`, `--shadow-glow` | Pulse is one dark look; packs are sold in the product | Index open decision 3; until decided, keep reading semantic tokens so a pack can still re-point the accent |
| 17 | `Sheet` variants B / C (centred dialogs), `CommandPalette` (centred, desktop), `DataTable` (bordered, desktop) | Pulse: no centred dialogs, drawn at 402 pt only | Sheet: alias B / C to the bottom sheet. Palette and table: owner question 5 |
| 18 | `record` toast vs "no celebration toasts" | `workout-2@2x.png` draws "Új rekord" as a plain band with a trophy glyph | Keep the kind; it is a notice, not a celebration |
| 19 | The Review Brief's component inventory (3.7) lists a secondary button, a SaveBar, a Dialog, half-lit = accent 40 % and drops Geist Mono | It predates the law; Pulse System's appendix keeps Mono, has no secondary button and no dialog, half = `t1` 50 % | Implement from `Pulse System.md` and `app-kit.js`; treat the Brief as history |
| 20 | E21: client fallback `B` (hold) vs seed `A` (tap); the Pulse workout frames draw tap | `ElementStyleProvider.tsx:39`; Product gaps line 181 | Owner question 4; align `CURATED` with the answer |
| 21 | `EmptyState` stretches and centres any action (`[&>*]:w-full [&>*]:justify-center`, line 99) | A Pulse link sits on the left edge at its own width | Stretch only a pill; leave links alone |
| 22 | `Skeleton`'s docblock says "E18-A shimmer" but never reads E18 | The admin's E18 switch changes nothing in the product | Either read it or stop claiming it (covered by break 4) |

---

## 8. Work items for this area

Sizes: S ≤ half a day · M ≈ 1 day · L ≈ 2–3 days · XL more. "Blocks screens" = screen agents need it before they can
finish. "Parallel-safe" = can run at the same time as screen work without touching the same files.

| ID | Work item | Files | Size | Depends on | Blocks screens? | Parallel-safe with screens |
|---|---|---|---|---|---|---|
| W1 | Register Pulse type steps in the class merger | `src/lib/cn.ts` | S | tokens (type ramp) | yes | no — must land first |
| W2 | Variant policy: letter-independent Pulse skin, alias field in the catalogue, gate rule for aliases, `CURATED` aligned | `ui/feedback/catalog.ts`, `ElementStyleProvider.tsx`, `scripts/check-element-roster.mjs` | M | owner questions 1, 2, 4 | no | yes |
| W3 | Action recipes: primary pill (56 / sm 44, glow, pressed, disabled fill, three-dot busy), `link` variant incl. danger text and router-link form, bare icon shape, size axis | `ui/primitives/control.ts`, `ui/primitives/Pressable.tsx`, new `ui/primitives/TextLink.tsx` | L | tokens | yes | no |
| W4 | Chips: `ChipRow` / `Chip`, rebuild `Toggle` and `LanguageToggle` on it, replace `chip()` tones by the mono tag | new `ui/primitives/ChipRow.tsx`, `ui/primitives/Toggle.tsx`, `ui/nav/LanguageToggle.tsx`, `control.ts` | M | W3 | yes | no |
| W5 | Underline field, `SearchField`, underline `TextArea`, sheet picker; E7 skin | `ui/primitives/Field.tsx`, new `SearchField.tsx`, `TextArea.tsx`, `SelectSheet.tsx`, `variants/E7Field.tsx` | L | tokens, W12 (picker) | yes | no |
| W6 | Switch restyle (48 × 28) and one disabled-opacity token | `ui/primitives/Switch.tsx`, `control.ts` | S | tokens | no | yes |
| W7 | `CheckMark` (set check / radio mark) | new `ui/primitives/CheckMark.tsx` | S | tokens | yes (workout, onboarding) | no |
| W8 | Segmented text switch (hug + equal cells), E6 skin; E10 `Tabs` aligned or aliased | `variants/E6Segmented.tsx`, `variants/E10Tabs.tsx` | M | tokens, W2 | yes (4 hand-rolled tablists move onto it) | no |
| W9 | Structure kit: `ScreenHeader` (greet / root / push), `SectionHeader` rewrite (eyebrow + rule + trailing; `icon` optional), `Rule`, `RowStack`, `ListRow` | new `ui/shell/ScreenHeader.tsx`, `ui/data/SectionHeader.tsx`, new `ui/data/Rule.tsx`, `ui/data/ListRow.tsx`, `features/library/SectionBadge.tsx` | L | tokens, W3 | yes | no |
| W10 | Data kit: `Numeral`, `Fraction`, `StatBlock`, `LedgerRow`, `SegmentBar`, `Stepper`, `ProgressBar`, `MacroColumns` | new files under `ui/data/`, `ui/feedback/CountUp.tsx` | L | tokens, W1 | yes | no |
| W11 | Charts: `TrendChart` restyle, dotted gap segment, new `Sparkline` | `ui/feedback/TrendChart.tsx`, `ui/feedback/chartGeometry.ts`, new `ui/feedback/Sparkline.tsx` | M | tokens | partly (progress, ledger rows) | yes |
| W12 | Bottom sheet restyle, B / C / D / E aliased, `ConfirmSheet` recipe | `ui/feedback/variants/E14E20.tsx`, new `ui/feedback/ConfirmSheet.tsx` | M | tokens, W2, W3 | no (API unchanged) | yes |
| W13 | Status zone: `NoticeLine`, toast band at the top, offline strip as a notice line | new `ui/feedback/NoticeLine.tsx`, `ui/feedback/ToastHost.tsx`, `ui/feedback/variants/E12E16.tsx`, `ui/shell/OfflineIndicator.tsx` | L | tokens, W3 | no (API unchanged) | yes |
| W14 | Tab bar: no surface, equal cells, raster icon pairs by key, bottom fade, E11 skin | `ui/nav/BottomNav.tsx`, `app/navTabs.ts`, `app/AppLayout.tsx`, `features/playground/PlaygroundPage.tsx` (E11 demo), tokens for `--nav-h` / `--content-pad-b` | L | tokens, tab-icon assets, W2 | no | yes |
| W15 | `Monogram`, `BadgeCount`, `GlowImage`; bell on `BadgeCount` | new `ui/data/Monogram.tsx`, `ui/primitives/BadgeCount.tsx`, `ui/media/GlowImage.tsx`, `features/chat/NotificationBell.tsx`, `features/coaching/Monogram.tsx` | M | tokens, image assets | yes | no |
| W16 | `EmptyState` restyle (left-aligned; `icon` / `badge` / `size` optional and unrendered) | `ui/feedback/EmptyState.tsx` | S | W3 | no | yes |
| W17 | `Skeleton` base restyle | `ui/feedback/ScreenSkeleton.tsx` | S | tokens | no | yes |
| W18 | `ChatMessage` + composer | `features/chat/ChatPanel.tsx` (or new `ui/data/ChatMessage.tsx`) | M | W5, W3 | chat screens only | yes — may be given to the chat screen agent |
| W19 | Box ratchet gate: per-file budget of `<Surface`, `SummaryTile`, `variant="secondary"`, shaped `<Skeleton>`, raw form controls that may only go down | new `scripts/check-pulse-boxes.mjs`, `frontend/package.json` | M | — | no | yes |
| W20 | Style Studio rebuilt to the two frames; playground demos kept compiling | `features/admin/StyleStudioPage.tsx`, `features/playground/PlaygroundPage.tsx` | M | W2, W3, W4, W9, W10, W13 | no | yes — it is a screen |
| W21 | Retirement, after the last screen: `Surface` + `surfaceRecipe`, `SummaryTile`, `Gauge`, `AuroraBackdrop` + `check-aurora`, `SectionBadge`, `coaching/Monogram`, `TokenProof`, the `secondary` / `danger` / `ghost` variants and `chip` tones, required-prop removal on `EmptyState` / `SectionHeader` | those files, `scripts/check-aurora.mjs`, `frontend/package.json` | L | every screen | no | no — strictly last |

Suggested order: tokens (other area) → W1 → {W3, W9, W10} → {W4, W5, W7, W8, W15} — that is the blocking foundation —
while W6, W11, W12, W13, W14, W16, W17, W19 run beside it and beside the screens; W2 as soon as the owner answers;
W20 with the admin screens; W21 last.

Why "restyle in place" for the shared recipes instead of a parallel `ui/pulse/` folder: this project's recurring defect
is a second implementation of a solved problem, and `check-tokens` already forces every button through `Pressable`.
An in-place restyle moves all 161 buttons and 23 fields at once and leaves screen agents nothing to merge. New
components are new files, so they do not conflict with anything either.

---

## 9. Questions for the owner

1. **Variants in Pulse.** The studio stays in the approved design, but Pulse's shapes and its "nothing slides" rule
   make several variants impossible as named. Keep the five letters and narrow them to motion and feedback (some
   letters will look the same until re-authored, and the studio will say so) — or collapse each element to one Pulse
   behaviour and show the studio as inert — or retire the studio although it is drawn?
2. **The fourteen elements that only exist in the playground** (E1, E3, E4, E5, E8, E9, E10, E12, E13, E16, E17, E18,
   E19, E20). The studio lists them as live, but no screen uses them. Wire the real controls to them (so the switch
   means something), mark them "nem használt", or delete them?
3. **Theme packs** (Index open decision 3). The shared recipes still read pack-owned size / radius / border tokens.
   Does a pack change only the colour of the light in Pulse, as proposed?
4. **Set check: tap or hold?** The client falls back to hold (E21-B), the database serves tap (A), the Pulse frames
   draw tap.
5. **Desktop-only pieces Pulse does not draw:** the Cmd+K palette (a centred dialog) and the admin user table (a
   bordered table). Leave them in the old look, restyle them freely in Pulse's grammar, or remove the palette?
6. **Selected chip check glyph.** The live UI marks a selected multi-select chip with a check so the state does not
   depend on colour; the Pulse kit has only the 2 pt mark. Is the mark enough?

---

## Appendix — how to reproduce the numbers

Run from `frontend/`. All read-only.

- Roster gate baseline: `node scripts/check-element-roster.mjs`
- Every variant read: `grep -rnE "useElementVariant\(" --include=*.ts --include=*.tsx src`
- Who imports a variant component: `grep -rnE "from '.*variants/[A-Za-z0-9]+'" --include=*.tsx src`
- JSX sites of a component (multi-line safe): count matches of `<Name(?![A-Za-z0-9_.])` over `src/**/*.ts(x)` after
  stripping `/* … */` and `//` comments. A line grep such as `<Pressable[\s>]` under-counts (119 vs 207) because the
  props usually start on the next line.
- `Pressable` props: for each opening tag (scan to the first `>` at brace depth 0) read `variant=`, `shape=`,
  `density=`, `selected`. Product features: 161 tags — variant primary 34, secondary 53, ghost 46, danger 5,
  dynamic 17, default 6; shape button 82, chip 40, icon 33, field 6; density compact 61.
- Hand-rolled boxes: opening tags in `src/features` (playground excluded; `Surface`, `Pressable`, `Skeleton`,
  `SummaryTile`, `Field`, `FeedbackField` excluded) whose `className` holds a `rounded-*` token together with a
  `bg-*` (not `bg-transparent`) or a `border` utility → 139 in 42 files.
- Shaped skeletons: `grep -rnE "<Skeleton[^>]*rounded-card" --include=*.tsx src | wc -l` → 71 (same for
  `rounded-(chip|full)` → 18, `rounded-(button|field)` → 5).
- Dead file: `grep -rn "TokenProof" --include=*.ts --include=*.tsx src` returns only the file itself.
