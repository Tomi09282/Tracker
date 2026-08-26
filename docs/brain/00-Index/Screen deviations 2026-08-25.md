---
type: audit
title: Screen deviations after the re-comparison
updated: 2026-08-25
tags: [ux, screens, audit, phase-9]
---

# Remaining screen deviations — after the 2026-08-25 re-comparison

26 screens re-compared against their approved mockups AFTER 79 screen fixes and 26 shared-component changes had landed. **289 items confirmed fixed**, 151 remain, 10 looked like regressions — four of those were traced to that same day's own changes and fixed on the spot (the field label that detached when Field grew a marker row, the empty-state action that stretched a plain link, SummaryTile's align prop that centred everything except the figure, and the plan row's identity line the mockup does not draw).

> **`admin-attekintes` was not re-compared** — its agent hit the session limit. It is the one screen with no fresh reading, and its numbers below are absent rather than zero.

> Verification note: 18 of the adversarial verify agents also hit the limit, so some structural findings on `coach-chat`, `register`, `admin-elem-stilus-studio`, `onboarding`, `nutrition`, `compose-post-editor`, `marketplace-post-detail` and `gyakorlat-reszletei` carry no second opinion. Treat those as claims, not as confirmed.

## home (route /)  [CLOSE] — 5 remaining

The screen's skeleton now matches the mockup end to end: header (Szia! over the date, bell with danger badge) → week panel holding the open-bottom ring, its caption and the seven-cell evidence row in ONE Surface → "Mai edzés" SectionHeader with the tinted play-circle tile → live banner with the screen's single filled accent Folytatás (day list outlined, and disabled while a session runs) → Táplálkozás SectionHeader with the accent "Megnyitás ›" link over a three-across macro grid with Zsír wrapping → five-tab bar with Kezdőlap lit. The one-filled-primary rule holds in every branch, and the loading/error/empty behaviours the spec owes are all present and independent. What is left is text and 

### frontend/src/features/home/WeekStrip.tsx:120 — visual

**Built:** The panel caption under the ring is `t('nav.workout')`, which resolves to "Edzés" and renders as "EDZÉS". The Gauge's accessible name at line 107 is the same string, so a screen reader announces the ring as "Edzés" too.

**Mockup:** The caption reads `HETI EDZÉS`. Spec Anchor and block 2 both name it. It is what tells the reader that `2 / 5` counts sessions across the WEEK; "EDZÉS" alone reads as if the ring were about one workout, which is the wrong claim for the screen's anchor.

**Fix:** Add `home.weeklyWorkouts` = "Heti edzés" (en "Weekly workouts", de "Wöchentliches Training") to all three bundles in frontend/src/i18n and point both WeekStrip.tsx:120 and the Gauge `label` at WeekStrip.tsx:107 at it. The `uppercase` class already on the h2 produces the caps; do not hardcode the string. (This is the key the previous pass correctly refused to reference before it existed — see commit 9aa8708's message.)

### frontend/src/features/home/HomePage.tsx:46 — visual

**Built:** `new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })`. Two problems. (a) `undefined` takes the BROWSER's locale, not the app's — a Hungarian UI on an English phone prints "Saturday, August 22" under "Szia!". WeekStrip.tsx:91 already does this correctly with `i18n.language`. (b) Even on a Hungarian locale, Intl's own order is month-first: the string is "augusztus 22., szombat", and the `first-letter:uppercase` at line 67 then capitalises the MONTH — the header renders "Augusztus 22., szombat".

**Mockup:** "Szombat, augusztus 22." — weekday first, capitalised, comma, then month and day with the trailing period. Spec block 1 quotes the exact string.

**Fix:** Pull `i18n` from `useTranslation()` (already imported) and compose two formatters instead of one: `const wd = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(d)` and `const md = new Intl.DateTimeFormat(i18n.language, { month: 'long', day: 'numeric' }).format(d)`, then `const dateLabel = `${wd}, ${md}``. Imposing weekday-first is the point — it is what the spec and both mockups draw. Leave `first-letter:uppercase` on line 67; it then lands on the weekday.

### frontend/src/features/home/HomeNutrition.tsx:78 — visual
Shared: `SummaryTile`

**Built:** The tiles are rendered with SummaryTile's defaults (`layout="stack"`, `align="start"`), which draws a 44px accent-tinted rounded holder on its OWN row above the figure (SummaryTile.tsx:111-119), then figure, caption and bar. In a grid-cols-3 column on a 360px phone that is a tile roughly 155px tall — about two and a half times the mockup's — which is what pushes the nutrition row down the page.

**Mockup:** The glyph sits INLINE, immediately left of the figure on the same line (`🔥 1840`), at icon size and with no 44px tinted holder; the caption and the bar then run the full width of the tile beneath it. Both 01-home.webp and 01b-home-empty.webp draw the tile this way, and the mockup's tile is about 63pt tall — short enough that the whole block clears the bottom bar.

**Fix:** SummaryTile has no prop that expresses this today — `stack` puts the puck above and `row` puts it left of the whole column, which would push the bar out of the tile's left edge. Add a third `layout` value (e.g. `inline`) that renders the icon inside the figure `<p>` at `size-icon-m` with the caption and bar as full-width siblings below, and pass it from HomeNutrition.tsx:78. Note the mockup also draws the glyph in ink rather than in the accent-subtle holder at this size; if the holder is kept, it needs to shrink to the figure's line height or the tile stays over-tall.

### frontend/src/ui/nav/BottomNav.tsx:185 — polish
Shared: `BottomNav`

**Built:** `<span className="text-micro max-w-full truncate">{tab.label}</span>` — no `uppercase`. The labels resolve straight from `nav.*` and render sentence-case: "Kezdőlap  Edzés  Étkezés  Haladás  Profil".

**Mockup:** The bar's labels are set in caps: "KEZDŐLAP  EDZÉS  ÉTKEZÉS  HALADÁS  PROFIL". `--text-micro` carries +0.06em tracking for exactly this (DESIGN.md §2: "Eyebrows and uppercase labels"), so at sentence-case the tracking is currently doing nothing and the row reads looser than it should.

**Fix:** Add `uppercase` to the label span at BottomNav.tsx:185. Transform only — leave the `nav.*` values in the bundles sentence-case, since the same strings are used as accessible names elsewhere. Re-check truncation at 360px for the seven-tab admin bar afterwards; caps are wider and `truncate` is already the expected result there.

### frontend/src/features/home/HomeNutrition.tsx:84 — structural

**Built:** Each macro tile's small line under the figure prints the macro NAME — "Kalória", "Fehérje", "Szénhidrát", "Zsír" — via t(`nutrition.macro.${m.key}`). The target value is read at line 51-54 and used only to compute `progress` and `over`; it is never rendered, so the tile shows `1840` over `Kalória` over an unlabelled bar.

**Mockup:** The line under the figure is the TARGET: `cél 2500`, `cél 160 g`, `cél 250 g`. Spec block 6 names the four parts of the tile as glyph / logged figure large / target small beneath / bar, and SummaryTile's own `caption` docblock gives `cél 2500` as its example. The macro name appears nowhere on the tile — the icon is what says which macro it is.

**Fix:** Change the caption to the target, but fix two things in the proposed version.

1) Round the displayed target. The proposal says "keep the same `round()`" yet interpolates raw `m.target`, so a 2500.4 target would print `cél 2500.4` on Home while `/nutrition`'s MacroBars prints `2500` — exactly the disagreement the file's docblock exists to prevent. Round for DISPLAY only; leave `m.target` raw in the array so `progress` and `over` keep full precision.

2) Put the key outside the `nutrition.macro` object. That object is a macro-key → name map consumed by the dynamic `t(`nutrition.macro.${m.key}`)` in three files; a non-macro sibling named `target` inside it is a trap for the next person. Use `nutrition.macroTarget`.

frontend/src/features/home/HomeNutrition.tsx, replacing line 84:

    caption={
      m.target != null
        ? t('nutrition.macroTarget', {
            value: m.unit ? `${round(m.target)} ${m.unit}` : round(m.target),
          })
        : t(`nutrition.macro.${m.key}`)
    }

The space before the unit matches the mockup (`cél 160 g`) and the tile's own `value` formatting on line 83.

i18n (all three bundles, as a sibling of `macro` under `nutrition`, so check-i18n's key-parity rule passes):
- hu: `"macroTarget": "cél {{value}}"`
- en: `"macroTarget": "target {{value}}"`
- de: `"macroTarget": "Ziel {{value}}"`

The null-target fallback to the macro name is correct and should be kept: it covers the `items.length > 0 && targets == null` day that line 48 lets through, and it also keeps `nutrition.macro.*` dynamically referenced from this file.

One consequence worth accepting knowingly: with the caption showing the target, the tile carries no accessible macro name — SummaryTile's glyph is `aria-hidden`. That is what the mockup and block 6 specify (the icon is what says which macro it is), so do not "fix" it by keeping the name in the caption. If it is to be addressed, it belongs in SummaryTile as an optional screen-reader label prop wired to a `t()` key, not at this call site (a hardcoded `sr-only` string would fail check-i18n's announced-literal rule).

Housekeeping: DESIGN.md states "777 keys" in three places (lines 28, 378, 456). check-i18n does not assert the count, but update the number to 778 so the doc does not drift.

## home-empty  [CLOSE] — 6 remaining

The screen's skeleton is now right. The anchor is the empty panel at `size="anchor"` in the top third, WeekStrip is genuinely gone when `days.length === 0`, `Szia!` keeps the page `h1` while EmptyState defaults to `h2`, the action is the page's only filled control and spans the card, the offline strip is mounted above every route from providers.tsx with its two lines and accent rail, the loading branch is one panel-shaped skeleton and the error branch falls into the same empty panel, the nutrition block self-suppresses when there is nothing to say, and the bottom bar lights Kezdőlap with a real `aria-current`. What is left is four content-level misses, none of them structural. Two are this s

### frontend/src/features/home/HomePage.tsx:206 — visual

**Built:** EmptyState is given only `icon={CalendarDays}`, so the anchor is a bare outline calendar in the tinted circle. `Moon` is already imported on line 3 (the day list uses it for rest days) and the composed-mark slot is unused: `grep -rn "badge=" --include=*.tsx src/` returns nothing app-wide.

**Mockup:** 01b-home-empty.webp draws a calendar glyph with a crescent moon tucked at its lower-right, overlapping the circle's edge. The spec's Anchor section is explicit that the moon is the part carrying the meaning — "nothing is scheduled, and that is fine" — and EmptyState's own `badge` docblock names this file as the reason the prop exists: "A bare calendar is the mark with its message removed."

**Fix:** Add `badge={Moon}` to the EmptyState call between `icon` and `size`. Nothing else changes: EmptyState already positions it (`absolute fill-accent bottom-3 end-3` at 24px in the `anchor` size) and already keeps it inside the mark's `aria-hidden` span.

### frontend/src/features/home/HomeNutrition.tsx:84 — visual

**Built:** Each macro tile's caption is `t(`nutrition.macro.${m.key}`)`, i.e. `Kalória` / `Fehérje` / `Szénhidrát` / `Zsír`. The target number reaches the component only as `progress` (the bar fill), so it never appears as text — the user sees `1840` over `Kalória` and has no denominator.

**Mockup:** Both 01b mockups and 01-home.webp put the TARGET under the figure: `1840 / cél 2500`, `128 g / cél 160 g`, `265 g / cél 250 g`. The spec's block 4 quotes those three strings verbatim, and SummaryTile's own `caption` prop doc gives `cél 2500` as its example of a correct caption.

**Fix:** Caption from the target, not the macro name: `caption={m.target != null ? t('nutrition.card.targetCaption', { value: m.unit ? `${m.target} ${m.unit}` : m.target }) : t(`nutrition.macro.${m.key}`)}`, and add `nutrition.card.targetCaption = "cél {{value}}"` to hu/en/de.json (hu.json currently has no `cél <n>` string at all — check-i18n gates all three bundles). Keep the macro name as the fallback for the no-target case, matching NutritionPage.tsx:214's rule that no target means no `cél` clause. The icon already identifies the macro, which is why the mockup can spend the caption line on the target.

### frontend/src/features/chat/NotificationBell.tsx:32 — visual
Shared: `NotificationBell`

**Built:** The bell is a bare 44px `Link` — `relative grid size-11 place-items-center rounded-field text-text-2` — with no border, no fill, and the glyph at `text-2`. It reads as a floating icon beside the greeting rather than as a control.

**Mockup:** Both 01b mockups draw it as a bordered rounded-square button: dark mode a hairline `--surface-border` edge over a `--surface-1`-ish fill with the bell at `text-1`; light mode the same square filled with the tile tint. The spec's block 2 says it outright — "the bell is drawn as a bordered rounded-square button with a `99+` badge".

**Fix:** Give the link the secondary control's edge and fill, keeping the existing size and radius: add `border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1` to the class list on line 32 and raise the glyph to `text-text-1`. Do not switch it to `variant="primary"` — the page's one filled accent belongs to `Gyakorlatok böngészése`.

### frontend/src/features/chat/NotificationBell.tsx:45 — visual
Shared: `NotificationBell`

**Built:** The unread badge is `bg-danger text-[var(--on-danger)]` — the red `#F87171` reserved for destructive actions — pinned inside the button at `right-1 top-1`.

**Mockup:** 01b-home-empty.webp draws the `99+` pill in the accent (sampled off the dark mockup at the badge: rgb(135,147,240) ≈ `--accent`), with dark ink, overlapping the button's top-trailing corner from outside. 01-home.webp draws its `3` badge the same way. DESIGN.md line 106 independently forbids the current colour: `--danger` is "Destructive and irreversible only" — unread mail is neither.

**Fix:** On line 45 swap `bg-danger text-[var(--on-danger)]` for `bg-accent text-accent-fg`, and move the pill outside the square so it overlaps the corner as drawn — `-right-1 -top-1` instead of `right-1 top-1`. While there, `rounded-full` on line 44 should be the token alias `rounded-chip`, which is what every other pill in the app uses.

### frontend/src/features/home/HomePage.tsx:46 — visual

**Built:** `new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })` — `undefined` resolves to the BROWSER's locale, not the app's. On a device set to en-US the line under `Szia!` renders "Saturday, August 22" while the whole rest of the screen is Hungarian.

**Mockup:** Both 01b mockups show `Szombat, augusztus 22.` under the greeting. This is the only date formatter in the app that ignores the UI language: WeekStrip.tsx:91, ChatPanel.tsx:216, ProgressPage.tsx:223, MarketplacePage.tsx:226 and eleven others all pass `i18n.language`.

**Fix:** Take `i18n` off the existing `useTranslation()` on line 40 (`const { t, i18n } = useTranslation();`) and pass `i18n.language` as the first argument on line 46, matching WeekStrip.tsx:91 in the same folder. The `first-letter:uppercase` on line 67 already handles Hungarian's lowercase weekday, so nothing else moves.

### frontend/src/app/navTabs.ts:69 — polish
Shared: `BottomNav`

**Built:** The Haladás tab uses `TrendingUp` — a rising zig-zag line with an arrowhead.

**Mockup:** Every mockup in the set, 01b-home-empty.webp included, draws the HALADÁS tab as a three-bar column chart of increasing height (lucide `BarChart3` / `ChartColumn`), not an arrow. The four tabs around it match their glyphs exactly (Home, Dumbbell, Salad, User), so this is the one cell in the bar that says something different from the drawing.

**Fix:** Import `ChartColumn` (lucide's current name for the 3-bar glyph; `BarChart3` is the deprecated alias) and use it on line 69 in place of `TrendingUp`, then drop `TrendingUp` from the line 4 import if nothing else in the file needs it. navTabs.ts already documents one deliberate glyph substitution at the top of the file (whistle → UsersRound, because lucide has no whistle); this one has an exact match available, so it needs no such note.

## workout-player  [CLOSE] — 3 remaining

Every block the mockup draws is now on screen and in the right order: full-bleed muscle-map hero with its legend and the Videó/Izomtérkép chip, truncated title with the counter PILL, the four-cell set-list header (#·Előző·kg·ism.) over the only scrolling region, the loose exercise-chip row, and a rest card pinned clear of the nav. The five owed states (loading skeleton in the real geometry, empty with no button, error/conflict chip overlaying the row without reflow, offline chip, interval stage inside the hero) all exist, and all copy resolves in hu/en/de. Three things remain. Two are control treatment: the hero draws the map's Elöl/Hátul as two accent-filled CHIPS instead of the segmented t

### frontend/src/features/workout/WorkoutPlayer.tsx:334 — structural  **REGRESSION**
Shared: `MuscleMap`

**Built:** The hero renders `<MuscleMap highlights={highlights} fill className="h-full p-3" />` with no `sideControl`, so it falls to the prop's default `'chips'`: two separate 44px pills at the top of the hero, the active one a FILLED accent `variant="primary"` pill carrying a Check glyph (MuscleMap.tsx:138-155), the other an outlined secondary.

**Mockup:** 02-workout-player.webp (dark and light both) draws ONE rounded segmented TRACK at the top of the hero with `Elöl` in an inner pill and `Hátul` plain inside the same track, and no check glyph on either label. MuscleMap's own `sideControl` docblock (MuscleMap.tsx:43-53) names this exact mockup as the reason the prop exists — 'while 02-workout-player.webp draws one rounded TRACK with the active label in an inner pill — which is the shared E6 Segmented'. `grep -rn sideControl` finds zero call sites passing it: the prop was added and the player was never switched over.

**Fix:** Pass it: `<MuscleMap highlights={highlights} fill sideControl="segmented" className="h-full p-3" />`. Leave ExerciseDetailPage.tsx:218 and LibraryPage.tsx:139 on the default — their mockups do draw the chip pair. This also removes the accent-filled `Elöl` chip and its Check glyph from the hero, neither of which the mockup draws.

### frontend/src/features/workout/WorkoutPlayer.tsx:472 — structural

**Built:** The exercise switcher marks the current exercise with `variant={i === activeExercise ? 'primary' : 'secondary'}`, and `control.ts:66` makes `primary` `bg-accent text-accent-fg shadow-[var(--shadow-glow)]` — a fully saturated accent fill. The active row's check button (SetRow.tsx:394) is also `variant="primary"`, so two filled-accent controls sit in one view, and the chip is the larger of the two.

**Mockup:** Both 02-workout-player.webp mockups draw `Fekvenyomás 3/4` as a PALE accent pill with an accent hairline — the same treatment as the bottom bar's active `EDZÉS` tab — and reserve the saturated accent fill for the row-3 check button alone. That pale pill is the app's declared selected idiom: DESIGN.md §5.6 ('Selected state is bg-accent-subtle'), BottomNav.tsx:157 (`bg-accent-subtle` active pill), and control.ts:100-106, which already ships a `selected` variant written for 'the selected state of a filter chip / toggle' — and the switcher's own comment at WorkoutPlayer.tsx:456 calls this row 'the filter row this actually is'.

**Fix:** The proposed fix is right; two refinements.

1) Switcher chip, WorkoutPlayer.tsx:468-475 — replace the ternary with the declared idiom. `Pressable` destructures `selected` and passes it into `control({ variant, shape, density, selected })` (Pressable.tsx:26,36), so this needs no plumbing:

    <Pressable
      key={ex.id}
      shape="chip"
      density="compact"
      variant="secondary"
      selected={i === activeExercise}
      aria-current={i === activeExercise ? 'true' : undefined}
      onClick={() => setActiveExercise(i)}
    >

Keep `aria-current` — `selected` is a visual variant only and carries no semantics. Do NOT hand-write `bg-accent-subtle` at the call site: the `selected` variant exists precisely because MarketplacePage and ComposePage had already written it twice, and it is the half-forgotten `hover:bg-accent-subtle` that stops the active chip reverting to neutral grey under the pointer.

2) Hero `Időzítő` toggle, WorkoutPlayer.tsx:361-370 — same change (`variant="secondary" selected={showTimer}`), keeping `aria-pressed`. Flag for the reviewer that this half is rule-derived, not mockup-derived: the mockup does not draw this chip at all (workout-player.md:24,43 — it appears only on a circuit/EMOM/AMRAP block), so the justification is DESIGN.md's "two primaries on a screen means neither is", not the image.

3) One caveat the claim does not mention, worth carrying into the change. `selected` sets `border-transparent`, and DESIGN.md G3 records `--accent-subtle` at 12% measuring 1.15:1 over `surface-0`. On the page background (the switcher row) that is the same signal strength BottomNav already ships, so it is consistent. On the hero overlay chip it sits over the map/media panel and may lose its edge. If it does, the remedy is the accent hairline the MarketplacePage selected chip already carries (`border-[var(--accent-border)]`, which is also what the light mockup draws on the switcher chip) — not a return to `primary`.

Leave SetRow.tsx:394 alone: the check button is the screen's one primary action, which is the whole reason the other two must stop competing with it.

### frontend/src/features/workout/WorkoutPlayer.tsx:39 — structural  **REGRESSION**

**Built:** SHELL is `h-[calc(100dvh-var(--content-pad-b))]` and AppLayout's `<main>` pads by the same token, so the column is exactly one viewport and the page cannot scroll — as long as nothing else is in the document flow. `OfflineIndicator` now is: providers.tsx:55 mounts it as the FIRST CHILD above the router, and OfflineIndicator.tsx:127-133 makes it `sticky top-0` with a `grid-rows-[0fr]→[1fr]` transition, i.e. it takes real vertical space when it opens (one or two lines plus `pt-[calc(env(safe-area-inset-top)+--spacing(3))]` and `pb-3`). Document height then becomes strip + 100dvh, and the workout page scrolls by the strip's height. Nothing on the screen compensates — `grep 100dvh` returns only this file's two calcs.

**Mockup:** The spec's LAW (workout-player.md:14) — 'the page never scrolls. It is a fixed column exactly one viewport tall minus the nav' — with the stated failure mode that the check button lands in a different place and the wrong set gets recorded. It bites precisely in the Offline state the spec owes (workout-player.md:52), i.e. every time the strip is on screen this screen is scrollable.

**Fix:** Reserve the strip's height the way the nav is reserved — with a measured token, and with the arithmetic written once rather than at each call site.

1. tokens.css (next to --content-pad-b, with the same kind of note): declare `--offline-h: 0px;` as the default, and add `--viewport-h: calc(100dvh - var(--offline-h));` — the height a full-height screen actually gets. One definition, for the same reason --content-pad-b has one: every future full-height screen inherits the fix instead of re-deriving it.

2. OfflineIndicator.tsx: publish the strip's real height, do not toggle a constant. The strip is one line or two depending on the queue, it carries `pt-[calc(env(safe-area-inset-top)+--spacing(3))]`, and it animates 0fr→1fr over --duration-base — a value flipped at the `showing` boundary would be wrong for the whole transition and wrong again for the two-line case. Put a ref on the inner `min-h-0` div, observe it with a ResizeObserver, and write `document.documentElement.style.setProperty('--offline-h', h + 'px')` on every callback (this is the precedent ThemeProvider.tsx:84-92 already sets for root-level custom properties). Reset to '0px' on unmount. Guard with `typeof ResizeObserver !== 'undefined'` for the test/SSR path.

3. WorkoutPlayer.tsx:39 and :247: `h-[calc(var(--viewport-h)-var(--content-pad-b))] lg:h-[calc(var(--viewport-h)-var(--content-pad-b-lg))]`, and extend the docblock at lines 33-35 with the second thing being subtracted and why.

Do NOT make the strip `fixed` again — OfflineIndicator.tsx:127 records that being in flow is what stops it covering page headers.

Regression test worth adding alongside the existing player tests: with the outbox holding an entry, assert `document.documentElement.scrollHeight <= window.innerHeight` on /workout.

## workout-states (/workout — set states)  [CLOSE] — 9 remaining

The column matches the mockup block for block: 28dvh hero with the anchor-scale dumbbell mark, title + counter pill, the four state rows (recorded / withdrawn+Visszavonva chip / record / active) in a scroll box that owns all the overflow, the switcher row, the rest-timer card with the draining ring and corner X, and the five-tab bar with Edzés lit. The overlay law holds — nothing takes a line of its own. What is still off: block 1 (the record toast) is raised at the wrong edge and as the wrong kind, so it lands on the rest timer as a green check instead of pinned to the top as a trophy with the accent rail — and the `record` ToastKind and the `top` placement built for exactly this screen hav

### frontend/src/features/workout/WorkoutPlayer.tsx:273 — visual

**Built:** Kind is `'success'`, so `TOAST_ICON.success` draws a green Check in a `--success-subtle` circle behind a `--success-border` hairline, and `TOAST_TONE.success` has no `rail` — the leading accent stripe is not drawn at all. The message is also the kind-qualified string `Új rekord: becsült 1RM`, duplicating the row caption verbatim.

**Mockup:** A TROPHY on a neutral near-white circular mark, a neutral box with no tone border, an accent rail down the leading edge, the bare words `Új rekord`, and the dismiss X. The `record` kind in E12E16.tsx:400-473 was built to this drawing — trophy icon, `surface-2` chip, `--surface-border`, `rail: 'bg-accent'` — and has no caller.

**Fix:** Change the kind argument from `'success'` to `'record'` (same line as the placement fix), and raise the toast with `t('workout.recordSpoken')` (`Új rekord`) rather than `workout.newRecord`; the kind-qualified sentence is the ROW's caption, and the spec's rule is that the toast is not a second permanent statement of the same fact.

### frontend/src/features/workout/WorkoutPlayer.tsx:417 — visual

**Built:** The set-list header is `text-micro uppercase text-text-3`, so it renders `# ELŐZŐ KG ISM.` at 11px with the +0.06em tracking `--text-micro` carries for caps.

**Mockup:** Sentence case at the caption step — `#  Előző   kg   ism.` — with normal tracking. Verified on a 2x crop of the header band: capital E, lowercase `lőző`, lowercase `kg` and `ism.`. The mockup does use caps elsewhere (the bottom-nav labels), so the case in this row is a deliberate difference, not a rendering artefact.

**Fix:** Drop `uppercase` and move the step to `text-caption` (12/16/500, DESIGN.md's 'metadata under a thing: counts, hints'). `text-micro` exists for uppercase eyebrows and its tracking is wrong for sentence case; the header keeps `text-text-3` and the shared `SET_ROW_COLS` track.

### frontend/src/features/workout/WorkoutPlayer.tsx:387 — polish

**Built:** The `Izomtérkép` chip is pinned `bottom-9` (36px) unconditionally — the offset that keeps it off the muscle map's `Fő célizom` / `Segédizom` legend. On THIS state there is no map and no legend, so the chip floats 36px (≈16% of the 28dvh hero) above the panel's bottom edge with dead space under it. It is also `disabled={!mapAvailable}`, so the control recipe washes it to `opacity-45` over a glass panel.

**Mockup:** The chip sits just inside the panel's bottom-right corner — measured off the image, ~7% of the panel height from the bottom edge, i.e. about `bottom-3` — and is drawn at full strength: bright white hairline, legible label, clear anatomy glyph.

**Fix:** Make the offset follow the contents that need clearing: `className={cn('absolute right-3', mapShown ? 'bottom-9' : 'bottom-3')}` (same for the `Időzítő` chip's `bottom-9 left-3` at line 367). If the inert-when-no-map semantics must stay, prefer `aria-disabled` plus a no-op handler over `disabled`, so the chip stays as readable as the mockup draws it while still refusing the press.

### frontend/src/ui/nav/BottomNav.tsx:185 — polish
Shared: `BottomNav`

**Built:** Tab labels render `text-micro` with no `uppercase`, so the bar reads `Kezdőlap Edzés Étkezés Haladás Profil` in sentence case while carrying the +0.06em tracking `--text-micro` exists to give caps — letter-spaced sentence case, which is the one pairing that step is not for.

**Mockup:** `KEZDŐLAP EDZÉS ÉTKEZÉS HALADÁS PROFIL`, all caps, tracked — confirmed on a 1.6x crop of the bar. The active-tab treatment beside it (accent-subtle pill behind a 24px icon, accent label) already matches E24 variant A exactly.

**Fix:** Add `uppercase` to the label span in BottomNav.tsx:185. It is the shared bar, so this lands on every authenticated screen at once — check the seven-tab admin bar still truncates rather than wraps, since caps are wider.

### frontend/src/features/workout/SetRow.tsx:363 — polish

**Built:** The weight field strips everything but digits and a DOT (`/[^0-9.]/g`) and the value is seeded with `set.entry_value.toString()`, so a recorded set prints `62.5`. A Hungarian numeric keypad offers a comma, and a lifter typing `62,5` gets the comma deleted — the field silently becomes `625`, a ten-fold weight, on the one control that is used mid-set without looking.

**Mockup:** Rows 1 and 2 print `62,5` — the Hungarian decimal comma, in a locale where the whole UI is Hungarian.

**Fix:** Accept both separators on input (`replace(/[^0-9.,]/g, '')`, normalise `,`→`.` before `Number()`), and render the locked/done value through the locale formatter the app already uses for one-decimal numbers rather than `String(value)`. Keep `inputMode="decimal"`.

### frontend/src/features/workout/WorkoutPlayer.tsx:273 — structural

**Built:** The record toast is raised with no options, so `ToastHost` falls back to `placement: 'bottom'` (ToastHost.tsx:103) and the toast renders in the bottom stack at `pb-[var(--content-pad-b)]` — the same strip the RestTimer card occupies. A record is earned by the same tap that starts the rest, so the celebration lands on top of the timer and directly over the thumb path to the next check button. No call site anywhere passes `placement` (grep: only ToastHost's own declaration).

**Mockup:** Block 1: the toast is pinned at the TOP of the viewport, under the status bar, clear of the set list, the timer and the nav. ToastHost.tsx:27-44 documents `ToastPlacement` as existing solely because `workout-states.md` block 1 and `02b-workout-states.webp` put it there — 'one screen has a reason; one screen opts in'. This is the screen, and it never opted in.

**Fix:** In frontend/src/features/workout/WorkoutPlayer.tsx, replace line 273:

  toast(t('workout.newRecord', { kind: t(`workout.record.${records[0].kind}`) }), 'success');

with:

  toast(t('workout.newRecord', { kind: t(`workout.record.${records[0].kind}`) }), 'record', {
    placement: 'top',
  });

Two deliberate changes, both already supported by the components:
1. `{ placement: 'top' }` moves the toast to ToastHost's top stack (ToastHost.tsx:150), which already clears `env(safe-area-inset-top)`. This is the opt-in ToastPlacement was built for (ToastHost.tsx:27-44) and it stops the toast covering the RestTimer card, which is fixed in the bottom strip at z-30 (RestTimer.tsx:119-122) and starts from the very same tap (WorkoutPlayer.tsx:261).
2. `'record'` instead of `'success'` for the kind. This is not optional polish: the mockup draws a neutral box with a trophy and an accent leading rail, which is exactly the `record` entry in TOAST_TONE (E12E16.tsx), documented there as "the mockup verbatim". Leaving `'success'` keeps a green check on the one event the lifter came for.

No other change is required — the comment block at WorkoutPlayer.tsx:269-272 (raised once, self-dismissing) still describes the behaviour accurately.

### frontend/src/features/workout/WorkoutPlayer.tsx:472 — structural

**Built:** The current exercise's switcher chip is `variant="primary"` → `bg-accent text-accent-fg shadow-[var(--shadow-glow)]`: a ~140px saturated accent pill with a glow. The active row's check button (SetRow.tsx:394) is also `variant="primary"`. Two filled accent controls in one view, and the larger of the two is a navigation chip, so the screen's only real action is no longer the most prominent thing on it.

**Mockup:** `Fekvenyomás 4/6` is a pale accent-wash pill with accent ink and no glow — the selected-filter treatment. The one saturated accent object on the whole screen is the row-4 check button. DESIGN.md §5.6 ('Selected state is bg-accent-subtle + accent text') and rule 47 ('Exactly one primary per screen') say the same thing, and control.ts:100-106 already ships the `selected` variant for exactly this, with MarketplacePage/ComposePage named as the hand-rolled call sites.

**Fix:** WorkoutPlayer.tsx:472 — replace `variant={i === activeExercise ? 'primary' : 'secondary'}` with:

    variant="secondary"
    selected={i === activeExercise}

Keep `aria-current={i === activeExercise ? 'true' : undefined}` unchanged — the visual change carries no semantics. Do not add any `text-*` class at the call site: `cn` is twMerge and a call-site `text-*` would swallow `density="compact"`'s `text-body-s`, rendering the selected chip a different size from its neighbours (the reason ClientDetailPage.tsx:405-412 documents for passing no ink class).

WorkoutPlayer.tsx:364 (`Időzítő`) — same change: `variant="secondary" selected={showTimer}`, keeping `aria-pressed={showTimer}`. Flag this one as rule-47/§5.6 driven rather than mockup-verified: 02b-workout-states.webp is a straight-set block and shows no `Időzítő` chip at all, so the image neither confirms nor contradicts it.

Do not copy ClientDetailPage's hand-rolled `className={cn(..., 'border-accent bg-accent-subtle')}` here — the `selected` variant is the canonical route now and additionally supplies the `hover:bg-accent-subtle` half that a hand-rolled call site forgets (without it the selected chip reverts to surface-2 under the pointer and reads as "you are about to deselect").

### backend/src/db/migrations/002_theming.sql:42 — structural

**Built:** The seed serves `('E21','A')`. `useElementVariant('E21')` returns 'B' only until `/ui/element-styles` resolves, then flips to 'A' — so the active row records on a bare TAP, the hold-fill sweep never runs, and `isActive && variant === 'B'` (SetRow.tsx:430) is false, so `Tartsd nyomva a rögzítéshez` is never printed. On a cold load the label paints and then disappears a few hundred ms later.

**Mockup:** Row 4 carries `Tartsd nyomva a rögzítéshez` under its values, and the spec's Components section names 'the hold gesture with its fill and the `Tartsd nyomva a rögzítéshez` label' as part of what this screen reuses. ElementStyleProvider.tsx:23-28 already states the conclusion: hold-to-confirm is the design of record for the set-check row, 'the seed still says A and the server therefore still serves A — that row has to change with it'.

**Fix:** Add `backend/src/db/migrations/030_e21_hold_to_confirm.sql`, but scope the UPDATE so it only moves the row that is still at its seeded default and was never changed by an admin (the studio route sets `updated_by`, so `updated_by IS NULL` identifies an untouched seed row):

```sql
-- 030_e21_hold_to_confirm.sql — the set-check row's design of record becomes B (hold-to-confirm).
-- Applies on top of user_version 29.
--
-- DATA ONLY. Both 02b-workout-states mockups draw `Tartsd nyomva a rögzítéshez` on the active row,
-- and that instruction only renders under E21-B (SetRow.tsx gates it on `variant === 'B'`), so
-- hold-to-confirm is what the screen spec describes. 002_theming.sql seeded E21 inert at 'A'
-- because the component had not landed yet; it has.
--
-- Guarded rather than unconditional: `element_style_config` is a LIVE ADMIN SETTING, editable at
-- runtime through PUT /ui/element-styles/:id. That route stamps `updated_by`, so `updated_by IS
-- NULL AND variant = 'A'` is "still the untouched 002 seed". An admin who has already chosen a
-- variant for this row keeps their choice — the same reason 002 used INSERT OR IGNORE.

UPDATE element_style_config
   SET variant = 'B'
 WHERE element_id = 'E21' AND variant = 'A' AND updated_by IS NULL;

PRAGMA user_version = 30;
```

Leave `E21: 'B'` in `CURATED` in `frontend/src/ui/feedback/ElementStyleProvider.tsx:39` and leave the label gated on the variant in `SetRow.tsx:429-437` — both are already correct.

Also update the now-stale comment at `ElementStyleProvider.tsx:23-28`: it currently reads "E21 is the one entry that intentionally LEADS the seed ... The seed still says A and the server therefore still serves A — that row has to change with it, and until it does this only fixes the first paint." After migration 030 that is false; E21 mirrors the seed like every other entry, so the paragraph should be reduced to a note that E21's B comes from 030 and that the instruction stays gated on the variant because printing "hold to record" on a tap-to-record row is a false instruction.

### frontend/src/features/workout/SetRow.tsx:106 — structural

**Built:** `records` is component state, seeded empty and written only by the check response. The row unmounts on every exercise switch (the cleanup effect at line 133 says so outright), and `/workouts/current` returns raw `workout_log_sets` rows with no record marker (backend/src/logs/routes.js:216, LogSet in useWorkout.ts:7-23). So leaving Fekvenyomás and coming back — or a reload, or an app resume — redraws set 3 as an ordinary done row: green `--success-subtle` fill, plain index, Check glyph. The warning fill, the warning ring, the bronze circled index and the trophy are all gone.

**Mockup:** Row 3 is warning-filled with a warning ring, a ringed index and a trophy where the check glyph goes — a standing fact about the session, not a transient. The spec is explicit: 'Held in state rather than as an animation, so a refetch can neither replay the celebration nor erase the fact.' It currently erases it.

**Fix:** Carry the record with the set, and DERIVE it in the row rather than seeding state once.

1. Backend — `/workouts/current` (backend/src/logs/routes.js:206-218). Add a third parallel query and attach the events to their sets:

   SELECT source_set_id, kind, rep_bucket, value, previous_value
     FROM workout_pr_events
    WHERE log_id = ? AND client_user_id = ?
      AND invalidated_at IS NULL AND source_set_id IS NOT NULL

   `workout_pr_events_source_idx` (010_plans_and_logs.sql:1532) covers it. Group by `source_set_id` and map to the exact shape `recordSetTx` already returns at worker.js:412 — `{ kind, repBucket: rep_bucket, value, previous: previous_value }` — so the client has ONE PrRecord shape, not two. Attach as `set.records` (omit or `[]` when none). `invalidated_at IS NULL` is what makes a withdrawn set drop its trophy for free: worker.js:501-507 already tombstones the event on void.

2. `LogSet` (useWorkout.ts:7-23) gains `records?: PrRecord[]`. Nothing else in the fetch layer changes — WorkoutPlayer already passes the whole `set` through.

3. SetRow.tsx:106 — replace the seeded state with a derivation:

     const [earned, setEarned] = useState<PrRecord[]>([]);   // what THIS check just returned
     const records = voided ? [] : (set.records?.length ? set.records : earned);

   `submit()` calls `setEarned(earned)`; `undo()` calls `setEarned([])`. Do NOT use a lazy `useState(() => set.records ?? [])`: it runs once per mount, and the row stays mounted for the whole exercise. The offline check resolves with `records: []` (useWorkout.ts:169), so an outbox-queued PR has no local value; when the outbox drains and the refetch lands with `set.records`, a mount-time seed never re-reads it and the trophy stays missing for the rest of the session. Deriving each render fixes the remount case AND the offline-then-synced case with the same line.

   The `voided ? []` guard matters: `hasRecord` also paints the row fill and the index ring, so a stale `set.records` arriving alongside `voided_at` would draw a struck-through row in warning fill. It also makes `undo()`'s local clear correct even before the invalidation refetch returns.

4. Keep `flashing` purely local and untouched — the flash is the moment, the trophy is the fact, which is exactly what SetRow.tsx:84 and 170-171 already claim.

## nutrition  [CLOSE] — 4 remaining

Structurally the screen is now the mockup: ring anchor with flame + 1840 + "/ 2400 kcal" + day name inside it, three centred macro tiles with the fat tile in warning tone, badge-marked "Hozzáadás" and "Naplózva" sections, flat result rows with food pucks, the picked-item card with a filled primary, one grouped log card per meal with hairline dividers and a ghost trash, and a five-tab member bar with ÉTKEZÉS present. No table, no missing block, no untranslated key, no e-mail address, no second filled primary. What is left is four things, two of which are freshly broken by today's shared-component work: the Gauge applies BOTH a Tailwind `-rotate-90` (which in Tailwind v4 emits the standalone `

### frontend/src/ui/data/SummaryTile.tsx:125 — visual  **REGRESSION**
Shared: `SummaryTile`

**Built:** With `align="center"` the Surface gets `items-center text-center` (line 94), but the inner column is `flex flex-col gap-tight w-full` with default `align-items: stretch`, and the figure is rendered by a `<p>` whose class string starts with `flex items-center gap-tight` (line 87) and never sets `justify-center`. `text-align` does not position flex items, so the figure's anonymous flex item ("128g", or the TriangleAlert + "84g" pair on the over-target tile) is packed at flex-start and renders against the tile's left padding edge, while the caption below it and the puck above it are centred.

**Mockup:** All three tiles are a single centred axis: puck centred at the top, the big figure centred under it, the caption centred under that, the bar full width. On the fat tile the warning triangle and "84g" are centred together as one group.

**Fix:** Add the centring to the figure row, e.g. change line 87 to build the class with a conditional `justify-center` when `stacked && align === 'center'`, or add `align === 'center' && 'items-center'` to the inner column's cn() on line 125 and give the figure `w-full justify-center`. Do not solve it with `text-center` alone -- the p is a flex container.

### frontend/src/features/nutrition/NutritionPage.tsx:215 — visual

**Built:** caption={m.target != null ? `${label} · ${round(m.target)}g` : label} renders "Fehérje · 180g", "Szénhidrát · 250g", "Zsír · 70g" -- two bare quantities separated by a middot, with nothing saying the second one is the target. The comment directly above (line 214) still calls it "the `· cél` clause", so the word was intended and was lost.

**Mockup:** "Fehérje · cél 180g", "Szénhidrát · cél 250g", "Zsír · cél 70g" -- exactly as spec block 3 spells them. DESIGN.md §6.6 ("Numbers get their meaning, not just their value") is the rule behind it.

**Fix:** Add a short target word to all three i18n bundles (e.g. `nutrition.macroTargetShort` = "cél" / "target" / "Ziel" in hu.json, en.json, de.json -- there is no existing key for it; `nutrition.noTargetToday` is a full sentence and cannot be reused) and build the caption as `${label} · ${t('nutrition.macroTargetShort')} ${round(m.target)}g`. Leave the no-target branch as the bare label.

### frontend/src/features/nutrition/NutritionPage.tsx:145 — visual

**Built:** The Gauge call passes `label`, `segments` and `className` only, so it inherits Gauge's default `gap = 36`: the grey track is a 324-degree arc with a 36-degree hole punched in it, and the sweep starts half a gap off twelve even once the double-rotation above is fixed.

**Mockup:** The ring is a closed circle. The grey track runs unbroken from the accent's end cap at 9 o'clock all the way round the upper left back to the accent's start cap at twelve -- there is no hole anywhere in the track, and the 1840/2400 fill is a fraction of a full 360-degree circle, not of a shortened one.

**Fix:** Pass `gap={0}` on the Gauge at line 145. With gap 0 the inline rotation is a plain -90deg, so the arc starts at twelve o'clock and the track closes, which is what the image draws. Round caps are still correct here (Gauge only switches to butt caps in donut mode).

### frontend/src/features/nutrition/NutritionPage.tsx:334 — polish

**Built:** The grams-validity mark is a bare lucide `Check` stroke glyph tinted `var(--success)` -- a green tick floating on the field background.

**Mockup:** A filled green disc with a white tick knocked out of it, sitting inside the grams field between the `g` suffix and the primary button.

**Fix:** Swap `Check` for lucide `CircleCheck` at the same `size-icon-s`, filled rather than stroked: `<CircleCheck className="size-icon-s shrink-0 fill-[var(--success)] text-[var(--field-bg)]" aria-hidden />`. Keep it hidden (not crossed out) when the value is invalid, as it is today.

## library  [CLOSE] — 3 remaining

The library screen is structurally the redesign now: the muscle map is an open bordered card at the top with the Elöl/Hátul pill pair (check on the active one), the ESZKÖZ strip is gone, the funnel badge opens IZOMCSOPORT, the count row's Szűrők törlése is a filled compact chip, rows carry a landscape thumbnail with a difficulty dot / type / EN meta line, the skeleton and the real row share one ROW/THUMB constant, and /library lights the EDZÉS tab. One regression: the visible `Keresés` label the spec deleted is back on screen, because the screen hides it with `[&>label]:sr-only` and today's `marker` slot wrapped Field's label in a row div, so the selector no longer matches. Two polish items 

### frontend/src/features/library/LibraryPage.tsx:166 — polish

**Built:** The clear-search control is `Pressable shape="icon" variant="ghost"`. `ghost` is `text-text-2` with a background only on hover (control.ts:78), so at rest it is a bare 20px stroked × floating on the field's translucent fill — over the aurora backdrop there is nothing behind it.

**Mockup:** The clear control is the filled-disc affordance: a solid neutral circle inset from the field's trailing edge with a darker × centred in it, clearly readable as a button before it is touched.

**Fix:** Give the icon Pressable a resting fill so the disc exists without a pointer — e.g. keep `shape="icon"` (it is already `rounded-chip`, so the fill renders as a circle) and add `className="bg-surface-2 text-text-2"`, or swap to a variant that carries a resting surface. Also replace `aria-label={t('common.cancel')}` on line 167 — it resolves to `Mégse` ('cancel'), which names the wrong action for a control that empties the search box.

### frontend/src/features/library/LibraryPage.tsx:335 — polish

**Built:** The paging tail renders `<RowSkeleton meta={false} />`, so the three appended rows show a thumbnail box and a title bar but no meta bar — a different silhouette from the six loading skeletons above them, which do render it (line 241).

**Mockup:** library.md block 7: 'three skeleton rows of the identical geometry appear at the bottom while it loads', and States/Paging repeats 'three extra skeleton rows appended at the tail'. Identical geometry means the same three bars, not the same height.

**Fix:** Render `<RowSkeleton key={i} />` in the `isFetchingNextPage` branch (drop `meta={false}`). The `meta` prop then has no call site and can go with it, leaving one skeleton shape for both the initial load and the tail.

### frontend/src/features/library/LibraryPage.tsx:154 — structural  **REGRESSION**

**Built:** A visible `Keresés` label renders in text-body-s/text-2 between the muscle-map card and the search input. The screen hides the label with `className="[&>label]:sr-only"`, a child-combinator selector that only matches a `<label>` that is a DIRECT child of Field's wrapper div. Commit 9aa8708 added the `marker` slot to `frontend/src/ui/primitives/Field.tsx` and wrapped the label in `<div className="flex items-baseline gap-2 justify-between">` (Field.tsx:87-101), so the label is now a grandchild and `[&>label]:sr-only` silently stops applying. The word is now on screen four times in the top third: h1 `Gyakorlatok`, the label `Keresés`, the magnifier glyph, and the placeholder.

**Mockup:** No label above the search field. The field sits directly under the map card, magnifier inset left, placeholder `Gyakorlat neve…`, X clear at the right. library.md's 'What was merged away' cuts the visible `Keresés` label by name: 'a label saying Keresés above a field with a magnifier in it is the third time the screen says the same word'.

**Fix:** In frontend/src/features/library/LibraryPage.tsx, in the FeedbackField call, replace line 154

    className="[&>label]:sr-only"

with

    labelHidden

Keep `label={t('library.search')}` unchanged so the input keeps its accessible name. `labelHidden` is declared on FieldProps (Field.tsx:43) and reaches Field through FeedbackField's `...rest` spread, so no change to E7Field.tsx is needed. Because `marker` is undefined here, Field.tsx:84 takes the `labelHidden && !marker` branch and renders the bare `sr-only` label with no flex row, so the wrapper's `gap-tight` does not open 8px of empty space above the input — which a raw `className="[&_label]:sr-only"` (descendant combinator) would NOT fix, since the empty marker row would still be rendered and still collect the gap. The existing comment block at lines 147-153 stays accurate as written; optionally add one line noting that `labelHidden` is the mechanism, since a call-site selector is what silently broke when Field gained the marker row.

## gyakorlat-reszletei (/library/:id)  [DEVIATES] — 3 remaining

Most of the screen now matches: the back link, both moderation banners above the hero, the reserved 16:9 hero with its dumbbell empty variant, the h1 + meta pill row with the language-fallback pill, the two section badges, the conditional equipment section, the numbered steps, the substitution strip and the skeleton/not-found states are all in place, and the legend duplication under the figure is gone. Two block-level things still miss: the mockup's full-width primary `Hozzáadás az edzéshez` (block 6) is not rendered at all, so the screen has no primary action, and the muscle map is rendered at its natural 260x560 aspect capped only in width (220px wide -> 474px tall), which is roughly four 

### frontend/src/features/library/ExerciseDetailPage.tsx:149 — visual

**Built:** The hero is either a bare `<img>` (no affordance, correct for a photograph) or a `<video controls>` that hands the whole frame to the browser's default player chrome — a control bar pinned to the bottom edge of the 16:9 box, not a centred button.

**Mockup:** One large circular play button centred on the hero, translucent fill with a white outline and a white triangle, filling roughly a fifth of the frame's height. The spec calls it 'the anchor's whole argument: a still photograph of a bench press is a decoration, a frame with a play button on it is a promise.'

**Fix:** Keep the image branch exactly as it is — the spec forbids a play button over a still. In the `heroIsVideo` branch only, drop `controls` for the resting state, render the poster frame (`preload="metadata"` already gives the first frame) and overlay a centred circular `Pressable shape="icon"` with a `Play` glyph and an `aria-label` (new key, all three bundles); on activation call `play()` and switch `controls` on so the native player takes over from there. If the media contract is judged not ready for this, the spec's Components section says so explicitly and the honest answer is to record it — but as built, the anchor the whole screen is designed around never shows the affordance the mockup makes its argument from.

### frontend/src/ui/muscle-map/MuscleMap.tsx:109 — visual
Shared: `MuscleMap (fillFor + legend swatch)`

**Built:** Secondary muscles are painted `var(--accent-subtle)` — the accent at 20% alpha. Composited over the near-black dark surfaces that is a dark, desaturated purple, barely separable from the `var(--surface-2)` idle fill next to it. Meanwhile this screen's own key, the chip dot at ExerciseDetailPage.tsx:237, uses `var(--accent-300)` (accent mixed 50% with white) for the same role — so the key points at a colour the figure never paints.

**Mockup:** In both frames the secondary regions (delts and upper arms) are a pale, clearly lighter accent tint — visibly brighter than the grey idle muscles and unmistakably a lighter step of the same hue as the solid chest. It matches the `Tricepsz` chip's pale dot exactly. The spec makes this the map's entire argument: 'works your chest, and incidentally your triceps'.

**Fix:** In `fillFor`, return `var(--accent-300)` for `role === 'secondary'` instead of `var(--accent-subtle)`, and update the legend swatch at MuscleMap.tsx:255 (`bg-accent-subtle`) to match so the opt-in legend keeps agreeing with the figure. That makes the map, the legend and this screen's chip dots one key rather than three colours. Check the two other call sites (LibraryPage hero, WorkoutPlayer) against their mockups in the same pass — the change is theirs too.

### frontend/src/features/library/ExerciseDetailPage.tsx:199 — structural

**Built:** Nothing between the meta pill row and the IZOMCSOPORT section. The screen renders no `primary` control at all — the only filled-accent control on the page is the `Elöl` toggle inside MuscleMap, so the most prominent accent object on the screen is a view switch.

**Mockup:** Block 6: a full-width filled-accent button reading `Hozzáadás az edzéshez`, sitting directly under the `Haladó` / `Erő` pills and above the IZOMCSOPORT badge, in both the dark and the light frame. It is the screen's single primary action.

**Fix:** Three edits, not one — the claim's version would trip DESIGN.md rule 47.

1. `frontend/src/features/library/ExerciseDetailPage.tsx` — between the hero block's closing `</div>` (line 199) and the anatomy `<section>` (line 202), render Block 6:

```tsx
<Pressable variant="primary" density="large" className="w-full" onClick={...}>
  {t('library.addToWorkout')}
</Pressable>
```

`Pressable` is not currently imported in this file (only `control` is) — add `import { Pressable } from '../../ui/primitives/Pressable';`.

2. `frontend/src/ui/muscle-map/MuscleMap.tsx:144` — REQUIRED, or the screen ends up with two `primary` controls. That line currently reads `variant={side === s ? 'primary' : 'secondary'}`, and this screen uses the default `sideControl = 'chips'` (line 88), so the `Elöl` chip is a filled-accent `primary` today. Change it to the selection idiom DESIGN §5.6 prescribes:

```tsx
variant="secondary"
selected={side === s}
```

The `selected` variant already exists in `control.ts` and yields `bg-accent-subtle` + `text-on-accent-subtle`, which also satisfies rule 63. Both `04-gyakorlat-reszletei.webp` frames and `04-library.webp` draw this chip as the same selected-chip wash as `Mell ✓`, not as the button's saturated fill, so this is what the mockups actually show. `LibraryPage.tsx:139` is the only other `chips` call site and is unaffected in intent — it has no competing `primary`. Leave `WorkoutPlayer.tsx:334` alone (it passes no side control UI).

3. i18n — add `library.addToWorkout` to all three of `frontend/src/i18n/hu.json`, `en.json`, `de.json` (hu: `Hozzáadás az edzéshez`). No existing key carries this string.

On the open question: do NOT ship it `disabled`. The spec's own words are "a primary button that is dead most of the time is worse than no button", and rule 45 makes disabled inert — a disabled primary is the failure mode the spec named, not a mitigation. Give the button a target that always resolves: navigate to the workout / plan-day picker (the `workout` and `plans` features already exist), which turns "there is no active session" into a choice instead of a dead end. If that target cannot be decided in this pass, the correct outcome is to leave Block 6 unbuilt and record why — the spec calls it "the single largest open question on the screen", and edit 2 stands on its own regardless (it is a §5.6 conformance fix).

## coins  [DEVIATES] — 5 remaining

The anchor is now a real ring in the top third with the coin glyph, the display-weight figure and the roll-from-previous behaviour, the header has been emptied of the old coin cluster, the tab tray is one rounded tray with three equal pills, store rows carry icon holders and coin-glyph price buttons, the statement is one hairlined surface with accent credits and plain-grey debits, both empty states and all three skeleton shapes are in place, and the bottom bar lights Profil for /coins via `owns`. What is still missing is everything between the ring and the store list: block 3 (the two flow tiles) does not exist at all, the ring's `Egyenleged` caption never renders — the caption slot in `Coin

### frontend/src/features/coins/CoinsPage.tsx:240 — visual

**Built:** `{item.title}` and `{item.description}` are printed verbatim from the API. The catalogue is seeded in English — backend/src/db/migrations/019_coins.sql:795-796 inserts `('theme.aurora', 'Aurora', 'A cold northern gradient set.', …)` and `('theme.ember', 'Ember', 'Near-black with a single warm accent.', …)` — so every store row on this Hungarian screen carries an English sentence.

**Mockup:** `Aurora` / `Hideg, északi fényű színátmenet.` and `Ember` / `Egyetlen meleg kiemelés.` — Hungarian product copy throughout the store list.

**Fix:** Resolve the SKU to a local string in the client rather than trusting the API: render `t(`coins.item.${item.sku}.title`, { defaultValue: item.title })` and the same for `.description`, with the literal `coins.item.` prefix written inline so check-i18n can still see the keys — the same technique AchievementsTab already uses at CoinsPage.tsx:350 and defends in its comment. Add `coins.item.theme.aurora.title/description` and `coins.item.theme.ember.*` to hu/en/de.json with the mockup's Hungarian strings. The `defaultValue` fallback is what keeps an unknown SKU rendering its server title instead of a raw key. (The alternative the spec allows — localised columns on `coin_store_items` — is a backend change and a larger call.)

### frontend/src/features/coins/CoinsPage.tsx:183 — polish

**Built:** `itemIcon` returns `Palette` for any `theme.*` SKU and `Sparkles` for everything else, so both theme rows get the same palette glyph and every non-theme row gets a sparkle.

**Mockup:** Three visibly different, item-specific glyphs: an aurora arc for `Aurora`, a flame for `Ember`, a document sheet for `Heti jelentés`. Under the current mapping `Ember` would show a palette where the mockup shows a flame, and `Heti jelentés` a sparkle where the mockup shows a document.

**Fix:** Add an explicit SKU→icon map ahead of the family fallback, e.g. `{ 'theme.aurora': Rainbow, 'theme.ember': Flame, 'feature.weekly_report': FileText }`, keeping the existing family branch as the default so an unlisted SKU still gets a glyph — that is the property the current docblock is defending, and a lookup table preserves it. Lowest priority of the five; the family rule is a deliberate, documented choice and only the glyph identity is off.

### frontend/src/features/coins/CoinsPage.tsx:117 — structural

**Built:** Nothing sits between the ring wrapper (closes at line 117) and the tab tray (opens at line 119). The ring is followed immediately by `gap-section` and then the Bolt/Eredmények/Kimutatás tray.

**Mockup:** Two flow tiles side by side directly under the ring, before the tab tray. Left: circular flame puck, figure `+180`, caption `Ezen a héten`. Right: circular tag puck, figure `250`, caption `Elköltve`. Puck on the LEFT of a figure-over-caption column in both light and dark images.

**Fix:** Same placement and components as proposed, with the sign and skeleton details made exact.

1. `useCoins.ts` — extend `Wallet` (lines 50-68) with two optional server-computed fields alongside `balanceMinor`, documented the same way `lifetimeEarnedMinor` is (optional because `/coins/wallet` does not send them yet, and the spec's `[!important]` forbids deriving them from the capped `useLedger` page):
   `weekEarnedMinor?: number;` and `spentMinor?: number;`

2. `CoinsPage.tsx` — insert between the ring wrapper (closes line 117) and the tab-tray block (opens line 119), inside the existing `gap-section` column so no wrapper spacing is invented:

```tsx
<div className="grid grid-cols-2 gap-group">
  {wallet.isLoading || wallet.data?.weekEarnedMinor === undefined ? (
    <>
      <Skeleton className="h-22 rounded-card" />
      <Skeleton className="h-22 rounded-card" />
    </>
  ) : (
    <>
      <SummaryTile
        icon={Flame}
        layout="row"
        value={`+${toCoins(wallet.data.weekEarnedMinor)}`}
        caption={t('coins.weekCaption')}
      />
      <SummaryTile
        icon={Tag}
        layout="row"
        value={toCoins(wallet.data.spentMinor ?? 0)}
        caption={t('coins.spentCaption')}
      />
    </>
  )}
</div>
```

Key correction: the left figure MUST be a string template, not the raw number. `SummaryTile` routes a numeric `value` through `CountUp`, which would render `180` and drop the `+` the mockup and spec both draw. A string renders verbatim (the component explicitly supports this — "a numeric tile animates and a `128 g` one simply renders"). The right tile stays numeric so the spent figure still counts up, and it carries no minus sign — the mockup draws a bare `250`.

`captionCase` is left at its `sentence` default rather than passed explicitly (the mockup's `Ezen a héten` / `Elköltve` are sentence case), no `progress`, no `over`, and neither tile is wrapped in `Pressable` — the spec states they are readouts and that a filter behind them would turn a summary into navigation.

3. Imports in CoinsPage.tsx: add `Flame` and `Tag` to the existing lucide-react import, and `import { SummaryTile } from '../../ui/data/SummaryTile';`. `Skeleton` and `toCoins` are already imported.

4. i18n — add to the `coins` namespace in all three of `src/i18n/hu.json`, `en.json`, `de.json` (check-i18n requires parity across hu/en/de):
   hu: `weekCaption: "Ezen a héten"`, `spentCaption: "Elköltve"`
   en: `weekCaption: "This week"`, `spentCaption: "Spent"`
   de: `weekCaption: "Diese Woche"`, `spentCaption: "Ausgegeben"`

The `h-22 rounded-card` skeleton height is not invented — it is the measured height of a `layout="row"` tile already used for the identical two-up grid in `frontend/src/features/admin/AdminPage.tsx:224-230` (card pad 16x2 + the 32/8/16 figure-caption column).

### frontend/src/features/coins/CoinBalance.tsx:99 — structural

**Built:** The caption slot under the balance figure renders `{delta !== null ? … : ''}` — an empty 16px-tall spacer whenever no purchase has just settled, which is the screen's normal resting state. The ring therefore shows a coin glyph and a bare number with an unlabelled gap beneath it.

**Mockup:** `Egyenleged` in muted grey caption type directly under `1 450`, inside the ring, in both the dark and the light image. The spec's Anchor and block 2 both name it: the delta appears in that slot transiently, "then the caption returns to `Egyenleged`".

**Fix:** In frontend/src/features/coins/CoinBalance.tsx, change ONLY the slot's content (line 103) — the className at line 100 already resolves to `text-text-3` whenever `delta === null`, so leave it, and leave `h-4`, `tabular-nums` and `aria-hidden` untouched:

  {delta !== null ? `${delta > 0 ? '+' : ''}${toCoins(delta)}` : t('coins.balanceCaption')}

Add the key next to the existing `coins.balanceLabel` (line 699 in each bundle):
- frontend/src/i18n/hu.json → "balanceCaption": "Egyenleged"
- frontend/src/i18n/en.json → "balanceCaption": "Your balance"
- frontend/src/i18n/de.json → "balanceCaption": "Dein Guthaben"

Also amend the docblock paragraph at lines 39-41 ("The slot keeps its height when it is empty…"), which now describes behaviour the component no longer has: the slot is never empty — it holds `Egyenleged` at rest and the delta for 2.6 s after a change, and the fixed `h-4` exists so that swap causes no layout shift.

Two notes the original fix did not cover: `tabular-nums` is now applied to a word as well as a number (harmless, but it is the delta that needs it); and negative deltas render with an ASCII hyphen from `toCoins`, while the spec writes `−250` with a minus sign — out of scope for this finding, but worth a separate look.

### frontend/src/features/coins/CoinsPage.tsx:225 — structural

**Built:** `StoreTab` returns the `<ul>` of item cards directly. There is no heading of any kind between the tab tray and the first store card.

**Mockup:** A section header immediately under the tray and above the first card: a rounded-square tinted icon holder containing a storefront glyph, followed by the label `MEGVÁSÁROLHATÓ`. Present in both images.

**Fix:** In frontend/src/features/coins/CoinsPage.tsx, import SectionHeader alongside the other ui imports:

    import { SectionHeader } from '../../ui/data/SectionHeader';

Then render it as the first child of the fragment in StoreTab's populated branch, immediately before the `<ul>` at line 225:

    return (
      <>
        <SectionHeader icon={Store} title={t('coins.storeSection')} />
        <ul className="flex flex-col gap-group">
        ...

`Store` is already imported at line 6 (it feeds the empty state at line 220), so no new icon import is needed. Do NOT hand-roll the holder — SectionHeader already emits the identical `inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-accent-subtle text-accent` span that CoinsPage.tsx:234 and 326-328 each rebuild, and its docblock exists because three files were separately deciding that fill.

Casing: pass the title SENTENCE CASE, not pre-uppercased. The mockup draws MEGVÁSÁROLHATÓ in caps, but that is the mockup showing the pre-redesign eyebrow treatment the design system has since retired: SectionHeader's docblock ("The tiny uppercase eyebrow this replaces was a LABEL"), HomePage.tsx:30 ("The uppercase eyebrow, which became a heading with a mark (`SectionHeader`)"), and DESIGN.md:155 (uppercase belongs to `text-micro` and its +0.06em tracking, never to `text-title-2`) all point the same way, and all five live SectionHeader titles are sentence case. Uppercasing here would render 20px/600 caps with no tracking — a casing rule invented for one screen.

Add the key to all three locales, keyed off each file's existing `coins.tab.store` wording:
  src/i18n/hu.json → "storeSection": "Megvásárolható"
  src/i18n/en.json → "storeSection": "Available"
  src/i18n/de.json → "storeSection": "Verfügbar"

Placement note: leave the early returns above untouched. The loading branch (lines 207-216) and the empty branch (lines 219-221) return before the fragment, which is correct — the mockup shows the header only over a populated list, and EmptyState already carries the same Store glyph plus its own title, so a header above it would state the section name twice.

No `titleId`/`aria-labelledby` wrapper is needed: the list already sits inside `role="tabpanel"` labelled by its tab (CoinsPage.tsx:158-163), and SectionHeader's `h2` is the correct level under the page `h1` at line 97.

## haladas  [CLOSE] — 5 remaining

Structurally the screen now matches 05-haladas.webp block for block: h1, the three-segment filter tab bar with a filled selected chip, one wide TrendChart card with a real y-scale, gridlines, a dot per reading and a warning chip for the gap, two centred SummaryTiles, the badged `Mérés rögzítése` card with the inline range-check error, and one dividered `Bejegyzések` card. The `Mit mérsz` select is back full-width exactly as the spec's [!important] note requires, `pct` and raw float values no longer reach the screen, `personLabel` is used in both sharing lists, and /progress owns its own nav tab. What is left is one coupled type-hierarchy problem and two glyph-treatment details, and four of t

### frontend/src/ui/data/SummaryTile.tsx:87 — visual  **REGRESSION**
Shared: `SummaryTile`

**Built:** The tile figure is `text-title-1` (26/32/700). On this screen that puts `84 cm` and `18,5 %` at exactly the same size as the chart headline `82,4 kg` (TrendChart.tsx:144, also text-title-1) and as the page h1 `Haladás` (ProgressPage.tsx:75, also text-title-1). Three sizes are one size, so the top third has no hierarchy at all. The component's own docblock records that this is unresolved: 'whether the figure should drop to text-title-3 is an open decision paired with TrendChart's headline (haladas review)'.

**Mockup:** The mockup steps down three times. Measured cap heights in 05-haladas.webp: `Haladás` 49px, `82,4 kg` 40px (0.82x), `84 cm` / `18,5 %` 35px (0.71x). Against a 26px h1 that puts the tile figures at roughly 17-18px. DESIGN.md §2 agrees independently — `text-title-3` is defined as 'Card heading, and the value inside a stat block'.

**Fix:** Drop the tile figure a step. Either change `const figure` on SummaryTile.tsx:87 from `text-title-1` to `text-title-3`, or add a `figureStep?: 'title-1' | 'title-3'` prop and pass `title-3` from the two calls in ProgressPage.tsx:271-279. Keep the ternary-over-whole-strings pattern the docblock explains; do not route the step through `cn()`. This edit is half of one decision — see the TrendChart.tsx:144 finding for the other half. Marked as a regression because the figure only reached 26px recently: the docblock notes it 'has been rendering at inherited 15px body, not 26px', so the hierarchy the mockup draws was accidentally intact before the type-scale fix and is flat now.

### frontend/src/ui/feedback/TrendChart.tsx:144 — visual
Shared: `TrendChart`

**Built:** The headline span is `text-title-1 font-display tabular-nums text-text-1` — 26px, the same step DESIGN.md §2 reserves for 'the screen's own title', and the same step ProgressPage.tsx:75 gives `Haladás`. The comment above it explains the escalation honestly: it was raised to title-1 specifically because the SummaryTiles below it were title-1, i.e. it was sized to win a race it should not have been in.

**Mockup:** `82,4 kg` is clearly smaller than `Haladás` in the image — 40px vs 49px cap height, about 0.82x, which lands on `text-title-2` (20px) against a 26px h1. It is still the largest number inside its own card, which is what the spec asks for; it just does not tie the screen title.

**Fix:** Step the headline to `text-title-2` in the same edit that drops SummaryTile's figure to `text-title-3`. Order matters: with the tiles at title-3 (17px) a title-2 (20px) headline is still the card's largest number and the h1 is still the largest thing on the screen, restoring the mockup's 26 > 20 > 17 ladder. Fixing only one of the two leaves the headline either tying the h1 or losing to the tiles it anchors. Leave `font-display tabular-nums` and the grey delta alone.

### frontend/src/ui/primitives/Field.tsx:136 — visual
Shared: `Field`

**Built:** The `leading` slot's wrapper span hard-codes `text-text-3`, so the `<AlertCircle>` that ProgressPage.tsx:335 puts inside the value field on a range-check failure renders in the 42%-ink chrome colour — the same grey as the calendar glyph in the `Mikor` field next to it. The field's border turns danger, the message line under it turns danger, and the mark inside the field stays grey, so the one element the eye lands on first says nothing is wrong.

**Mockup:** The mockup draws a filled danger-red disc with a white exclamation inside the leading edge of the `Érték (kg)` field, sitting on the danger-outlined field with the two-line danger message beneath. The spec's Components list names this treatment explicitly: 'danger outline plus a leading warning glyph inside the field, paired with the existing message line'.

**Fix:** In Field.tsx move the leading span's ink onto the error state: replace `text-text-3` on line 136 with `error ? 'text-[var(--danger)]' : 'text-text-3'` (via `cn`, which is already imported). This keeps every non-error leading glyph unchanged across the other callers and makes the error treatment carry colour in all three places at once. Optionally also swap the message-line glyph on Field.tsx:163 from `AlertCircle` to `TriangleAlert`, which is what the mockup draws beside the sentence — but the colour is the load-bearing half.

### frontend/src/ui/feedback/TrendChart.tsx:136 — polish
Shared: `TrendChart`

**Built:** The figcaption prints the unit next to the metric name as `Testsúly (kg)` on the left, and the headline on the right prints it again as `82,4 kg`. Two `kg` on one line, eight characters apart. The scale gutter (lines 168-179) carries only the three tick numbers and no unit at all.

**Mockup:** The caption row reads `Testsúly` on the left and `82,4 kg −2,1` on the right — the unit appears once, in the headline. `kg` appears a second time only at the head of the value scale, above `84`, which is what the spec enumerates in block 3: 'a value scale down the left edge (`kg`, `84`, `82`, `80`)'.

**Fix:** Drop the `({unit})` span on TrendChart.tsx:136 so the caption is just `{label}`, and render the unit as a fourth entry at the top of the gutter instead — a `<span className="absolute end-0">` sibling above the tick map on lines 170-178, offset clear of the topmost tick (the topmost tick sits at `at: 0`, so put the unit one line above it or shift the tick set down). Every other TrendChart caller inherits this, which is correct — the unit belongs to the axis, not to the series name.

### frontend/src/features/progress/ProgressPage.tsx:292 — polish

**Built:** The `+` badge before the `Mérés rögzítése` h2 is `size-11 rounded-chip bg-accent-subtle text-accent` — `rounded-chip` resolves to the pill radius in every pack except Mono, so on a square box it renders as a full circle with a 12% accent wash. It is pixel-identical to the icon puck inside `SummaryTile` (SummaryTile.tsx:114), which sits 60px above it on the same screen. The same inline markup is repeated for the shield-check badge at line 528 and the eye badge at line 594.

**Mockup:** The mockup deliberately separates the two marks. The tile pucks are circles on an accent wash (confirmed in the tile crop: both are round). The `+` section badge is a rounded SQUARE — corner radius roughly 30% of the side, so clearly a squircle and not a circle — on a neutral fill about one surface step above the card, with a hairline edge and an accent-coloured glyph. Two different shapes saying two different things: a puck labels a number, a badge opens a section.

**Fix:** Give the section badge its own shape and fill: change `rounded-chip bg-accent-subtle` on ProgressPage.tsx:292 to `rounded-card border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-2`, keeping `size-11 text-accent` and the `Plus` glyph. Apply the same three-class change at lines 528 and 594 so all three section badges on the route stay one thing. The spec lists 'the section badge glyph before Mérés rögzítése' as a new component — this is the moment to extract those three identical spans into one, rather than editing the same markup a third time.

## coach-dashboard  [CLOSE] — 9 remaining

Structurally the screen is now the mockup: header (eyebrow + h1 + bell), segmented donut with 12/KLIENSEK and the three-item legend, two row-layout summary tiles, the amber handover banner, the `Csatlakozási kódok` section with the screen's single filled primary, then the flat `Névsor` roster in a card — in that order, with the anchor comfortably inside the top third. Names print through `personLabel` (no e-mail addresses on the roster), the monogram comes from `personInitials`, the bar carries all six coach tabs with a real `aria-current`, the tiles adopt `layout="row"` + `captionCase="upper"` and their skeleton matches the new geometry, the donut draws per-segment seams, and every mutating

### frontend/src/i18n/hu.json:335 — visual

**Built:** The handover banner's body reads `Ezek a kliensek még nem tudnak belépni.` (rendered at CoachDashboard.tsx:380 via `coaching.handoverShort`).

**Mockup:** Both mockups print `Amíg nem állítanak be saját jelszót, nem tudnak belépni` under the headline `2 fiók átadásra vár` — the spec quotes that exact sentence in Block 4 as the consequence the long paragraph was cut down to.

**Fix:** Change `coaching.handoverShort` to `Amíg nem állítanak be saját jelszót, nem tudnak belépni` in hu.json:335, and re-translate the en/de siblings at en.json:335 (`Until they set their own password they cannot sign in`) and de.json:335 to match that clause rather than the current generic one. The cut of the long `handoverBody` paragraph is correct and stays; only the replacement wording is off.

### frontend/src/features/coaching/CoachDashboard.tsx:63 — visual

**Built:** `SectionHead`'s icon holder is `inline-grid size-11 … rounded-chip bg-accent-subtle text-accent`. `--radius-chip` is `--radius-full` (tokens.css:249), so the 44px holder in front of `Csatlakozási kódok` and `Névsor` renders as a perfect circle.

**Mockup:** Both mockups draw those holders as rounded SQUARES — a 44px squircle with roughly 14–16px corners (verified by cropping the key holder at 1080×1935 px, x 90–190 / y 1080–1180). The mockups keep circles for the things that stand in for a person: the monogram and the bell. The code renders both families identically, so the object/person distinction the image makes is lost.

**Fix:** Swap `rounded-chip` for `rounded-card` on the holder span at line 63 (16px on a 44px box is the radius the crop measures; `rounded-button` at 12px is the next-closest). The banner's triangle holder at line 368 carries the same class and the dark mockup draws it as a squircle too — change it with this one. Leave the Monogram (Monogram.tsx:30) and the icon-only `Pressable` shape alone: those are circles in the image.

### frontend/src/ui/data/SummaryTile.tsx:114 — visual
Shared: `SummaryTile`

**Built:** The tile's icon puck is `inline-flex size-11 … rounded-chip`, so the `CSAPATOK` ticket and `ÉLŐ KÓDOK` key pucks — the two largest glyph holders on the screen — render as circles.

**Mockup:** Both mockups draw the pair as rounded squares with ~30% corner radius (crop x 120–260 / y 740–880 in the dark webp shows a clear squircle, not a circle). Same shape language as the section headers above.

**Fix:** In SummaryTile.tsx:114 replace `rounded-chip` with `rounded-card` on the puck span. It is a shared component (Home, nutrition, progress, admin, client-detail all draw these), so make the change there rather than per screen — every one of those mockups draws the same squircle.

### frontend/src/features/chat/NotificationBell.tsx:32 — polish
Shared: `NotificationBell`

**Built:** The bell is a bare 44px glyph: `relative grid size-11 place-items-center rounded-field text-text-2` with no background and no border, and the unread badge sits INSIDE that box at `right-1 top-1` (line 44) filled with `bg-danger`.

**Mockup:** The bell sits in a filled circular holder — a translucent light disc with a soft rim, clearly separated from the aurora behind it — and the badge is an ACCENT-filled disc overlapping the holder's top-right corner from outside, not tucked over the glyph. Same treatment in the light mockup.

**Fix:** Give the link a resting surface: `rounded-chip bg-surface-2 border border-[var(--surface-border)]` in place of `rounded-field` (the holder is circular in the image, so `rounded-chip` is right here — unlike the decorative pucks above). Move the badge out to the corner (`-right-1 -top-1`) so it overlaps the holder edge, and use the accent fill (`bg-accent text-accent-fg`) the mockup draws instead of `bg-danger`. Home renders the same component, and 01-home.webp draws it the same way.

### frontend/src/features/coaching/CoachDashboard.tsx:504 — visual

**Built:** The roster row's archive control is `Pressable shape="icon" variant="ghost"` — a transparent glyph with no fill and no border until hover.

**Mockup:** Every roster row in the dark mockup ends with a visibly contained control: a 44px surface-2 rounded square holding the archive glyph (crop x 100–1000 / y 1400–1560). The light mockup contains it too, as a hairline-bordered circle. Either way the control has a resting container, which is what tells the coach the row has an action on it; the built row reads as a decorative icon until touched.

**Fix:** Change `variant="ghost"` to `variant="secondary"` on the Pressable at lines 502–510 (bordered on surface-1, hover to surface-2 — the light mockup's reading and the one the `control` recipe already ships). The spec's Components line lists this separately from the "ghost row buttons", so it is not bound to ghost. Keep `shape="icon"` and the `aria-label`.

### frontend/src/ui/nav/BottomNav.tsx:185 — polish
Shared: `BottomNav`

**Built:** The tab label renders `<span className="text-micro max-w-full truncate">{tab.label}</span>` — no `uppercase`, and `--text-micro` sets only size/line-height/weight/tracking, so the bar reads `Kezdőlap · Edzés · Étkezés · Haladás · Edző · Profil`.

**Mockup:** Both mockups print the six tabs in caps — `KEZDŐLAP · EDZÉS · ÉTKEZÉS · HALADÁS · EDZŐ · PROFIL` — and the spec's Navigation section names them in caps as well. DESIGN §2 describes `text-micro` as the step for "eyebrows and uppercase labels", with the +0.06em tracking that only pays off in caps; this screen's own eyebrow already pairs the two.

**Fix:** Add `uppercase` to the label span at BottomNav.tsx:185 (`text-micro uppercase max-w-full truncate`). Shared across every route — the member and admin mockups draw caps too. Watch the six-tab slab at 360px: the labels already truncate there, and caps are marginally wider.

### frontend/src/features/coaching/CoachDashboard.tsx:523 — polish

**Built:** The `A kód elkészült` sheet's copy control is `<CopyButton value={mintedCode ?? ''} label={t('common.save')} />` — `common.save` is `Mentés` ("Save"). `E2CopyButton` uses `label` as the button's `aria-label` in every variant and as its visible text after a successful copy, so the one control whose whole job is putting an unrecoverable join code on the clipboard announces and then displays "Mentés". The pre-gen sheet's per-account copy button at line 607 does the same.

**Mockup:** Not drawn (both are sheets), but the spec Components list names `CopyButton` "for the code and for each `email / password` pair", and DESIGN §6.7 requires a button to be the verb of its own action. "Mentés" is a different action from copying, and the body text directly above it says `Másold ki most`.

**Fix:** Add `common.copy` (`Másolás` / `Copy` / `Kopieren`) to the three bundles beside `common.save` (hu.json:6) and pass `label={t('common.copy')}` at CoachDashboard.tsx:523 and :607. These are the app's only two product call sites of CopyButton, so nothing else moves.

### frontend/src/features/coaching/CoachDashboard.tsx:638 — polish

**Built:** The archive confirmation sheet's `Archiválás` button carries `busy={archiveClient.isPending}` but no `disabled={offline}`, while every other mutating control on the screen got one in the last pass (mint 224, revoke 411, the row's archive icon 506, both sheet forms 547 and 590).

**Mockup:** The spec's Offline state names `Új kód`, `Visszavonás`, `Archiválás` and both sheet forms as the controls that must be disabled, because there is no queued-write store behind the coaching endpoints. The row icon is guarded, but the control that actually fires the mutation is not: open the sheet online, lose the network, press it, and the archive is silently dropped with a confirmation that looked like it worked.

**Fix:** Add `disabled={offline}` to the `Pressable variant="danger"` at lines 638–647, alongside the existing `busy`.

### frontend/src/features/coaching/CoachDashboard.tsx:202 — polish

**Built:** The folded legend tail is labelled with `t('coaching.teams')` — `Csapatok` — the same string the summary tile below it uses as its caption. A coach with four or more teams sees `Csapatok 5` in the legend and `CSAPATOK 3` in the tile eight pixels below, two different numbers under one word.

**Mockup:** Not drawn (three teams fit), but the spec's `The donut is not a chart of everything` note requires the tail to fold into "a single 'other' segment" — an other-bucket, not a repeat of the collective noun that already labels a different quantity on the same screen.

**Fix:** Give the tail its own key next to `coaching.unassigned` — e.g. `coaching.otherTeams` = `Egyéb csapatok` (`Other teams` / `Weitere Teams`) — and use it at line 202 instead of `t('coaching.teams')`.

## settings  [CLOSE] — 13 remaining

The skeleton of the screen is now right: person anchor in the top third with a conditional badge, outlined full-width sign-out with no card and no confirmation, four icon-holder section headers in the mockup's order (MEGJELENÉS / HANGOK ÉS REZGÉS / NYELV / ADMIN), the preview tile reduced from a card, the cue card as one card of three hairline-divided switch rows with the unavailable channel dimmed rather than hidden, and the Profil tab lit through navTabs `owns`. The accent picker and gradient builder are gone from the render and kept on disk. What is left is almost entirely inside the appearance card and the string bundle. The theme chip row is the worst of it: it maps the raw `THEME_PACKS

### frontend/src/features/settings/ThemeStudio.tsx:154 — visual

**Built:** The commit button label is `{save.isPending ? t('common.saving') : t('common.save')}` — it reads `Mentés` at rest and `Mentés folyamatban` while saving. There is no `settings.saveTheme` key in any of the three bundles.

**Mockup:** The button reads `Téma mentése`. Spec block 5: 'a full-width filled `Téma mentése`.'

**Fix:** Add `settings.saveTheme` = `Téma mentése` / `Save theme` / `Theme speichern` to hu/en/de.json and use `t('settings.saveTheme')` for the idle label, keeping `common.saving` for the busy label.

### frontend/src/features/settings/SettingsPage.tsx:35 — visual

**Built:** `ROLE_LABEL.user` points at `adminUsers.role.user`, which is `Felhasználó` in hu.json. A member's own chip therefore reads `Felhasználó` — the admin user-table's word for them, borrowed from the admin namespace.

**Mockup:** The chip under the address reads `Tag`. Spec block 2 and the 'What was merged away' note: 'The role is now rendered in Hungarian — `Tag` / `Edző` / `Admin`'.

**Fix:** Add a settings-owned key group (`settings.role.user` = `Tag`, `.coach` = `Edző`, `.admin` = `Admin`) in all three bundles and point `ROLE_LABEL` at it, leaving `adminUsers.role.*` to the admin table. Coach and admin keep their current words.

### frontend/src/i18n/hu.json:94 — visual

**Built:** `settings.previewBody` is 'Ez nem makett — a teljes app átszíneződik, amint választasz.' — the pre-cut two-clause sentence, which wraps onto a second caption line inside the tile and pushes the hairline and chip row down.

**Mockup:** One line under `Élő előnézet`: 'Az egész app átszíneződik, amint választasz.'

**Fix:** Set `settings.previewBody` to 'Az egész app átszíneződik, amint választasz.' and shorten the en/de equivalents to match ('The whole app repaints as you choose.' / 'Die ganze App färbt sich um, während du wählst.').

### frontend/src/i18n/hu.json:110 — visual

**Built:** All three cue hints are still the two-sentence versions: speechHint 'A gépi hang bemondja a kört és a pihenőt. Kikapcsolva a sípszó és a rezgés megmarad.', toneHint 'Rövid hang a 3-2-1 visszaszámláláshoz és a fázisváltáshoz. iPhone-on ez az egyetlen hallható jelzés.', hapticsHint 'Rezgés a sorozat pipálásakor, rekordnál és körváltáskor.' Each wraps to two caption lines, so the three-row card is roughly a third taller than the mockup's and NYELV lands well below the fold.

**Mockup:** One short line per row: 'Bemondja a kört és a pihenőt.' · 'Rövid hang a visszaszámláláshoz.' · 'Rezgés a sorozat pipálásakor.' Spec: 'the cue hints went from two lines to one.'

**Fix:** Replace the three hu hints with the mockup's sentences (and trim en/de to one clause each). The iPhone sentence dropped from `toneHint` does not disappear — it becomes the `Rezgés` unavailable hint (see the CueSettings finding).

### frontend/src/features/settings/ThemeStudio.tsx:109 — visual

**Built:** Unselected chips get `variant="ghost"` plus `border-transparent`, so `Aurora` and `Ember` render as bare text on the card with no edge and no fill — they do not read as chips until you know they are tappable. Only the selected chip has a visible outline.

**Mockup:** All three chips are outlined boxes of equal size; the selected one is distinguished by an accent border, a tinted fill and the green corner check, not by being the only one with an edge at all.

**Fix:** Give every chip `variant="secondary"` (which carries `border-[length:var(--border-width)] border-[var(--surface-border)]` and `bg-surface-1`) and keep the `on` branch's `border-accent bg-accent-subtle text-on-accent-subtle` override. The width-stability comment at lines 118-121 still holds — the border width is declared on both states either way.

### frontend/src/features/settings/SettingsPage.tsx:278 — visual

**Built:** `<TransparencyChoice />` renders between the MEGJELENÉS section header and the theme card, so the first thing under the section header is a control the mockup does not show, and the live-preview tile — the section's visual anchor — starts a whole card lower.

**Mockup:** The appearance card (flame tile → hairline → chips → save) begins immediately under the MEGJELENÉS header. The transparency control is a later, accepted addition (ADR-0018) with no place in the mockup, so it should not displace what the mockup anchors.

**Fix:** Render `<TransparencyChoice />` after the `<Surface><ThemeStudio /></Surface>` block inside the same section, so the appearance card keeps the position the mockup gives it and the transparency card reads as the secondary appearance setting it is.

### frontend/src/features/settings/ThemeStudio.tsx:76 — polish

**Built:** The flame holder is painted with `style={{ background: 'var(--gradient-brand)' }}` and `text-accent-fg`, making it the one saturated multi-colour square on the screen and the second consumer of `--gradient-brand`, which DESIGN.md G6 assigns to a single home (the workout player's hero box).

**Mockup:** The flame sits in a flat, neutral rounded holder of the same shape and weight as the section-header holders — an orange glyph on a quiet tint, not a gradient block.

**Fix:** Drop the inline gradient and use the same holder treatment as `SectionHeader`: `bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]` (or `bg-surface-2` with a warm glyph colour if the flame should stay orange), keeping `grid size-11 rounded-field`.

### frontend/src/features/settings/CueSettings.tsx:67 — polish

**Built:** The cue-row icon holders use `rounded-card`, while every other 44px glyph square on this screen (`SectionHeader` at SettingsPage.tsx:58, the coins row at :266, the flame tile at ThemeStudio.tsx:76) uses `rounded-field`. `--radius-card` and `--radius-field` differ in every pack and diverge sharply in Neon (`radius-6` vs `radius-full`), so the same square renders as a rounded box in one place and a pill in another.

**Mockup:** Every glyph holder on the screen carries one corner radius — the cue-row holders and the section-header holders are the same shape, differing only in tint.

**Fix:** Change `rounded-card` to `rounded-field` on the holder span in `Row`, leaving `bg-surface-2 text-text-2` (the neutral tint the mockup shows for these rows) untouched.

### frontend/src/features/settings/ThemeStudio.tsx:101 — structural

**Built:** The chip row maps `THEME_PACKS` from ThemeProvider.tsx:5 — five packs — and prints the pack id itself (`{pack}` at line 126, dressed with `capitalize`). The screen renders five English chips: Midnight / Solar / Forest / Neon / Mono. They are `shrink-0` inside `overflow-x-auto`, so they pack to the left and the last one or two scroll off the card edge.

**Mockup:** Exactly three chips filling the card width evenly — `Éjfél` (selected), `Aurora`, `Ember` — in Hungarian, with no horizontal scroll. The spec (blocks 5, and the 'Three packs, not five' note) says the row is entitlement-driven: the packs this account owns plus the free default.

**Fix:** Drive the row from the server roster, not from `THEME_PACKS`, and localize the label with a client map that falls back to the server's.

1. Stop discarding the roster. In `frontend/src/features/settings/useThemeSync.ts`, extend the response type to what the endpoint already returns and expose it:
   `interface ThemePackRow { key: string; label: string; surfaceHex: string; locked: 0 | 1 }`
   `interface ThemeResponse { theme: SyncedTheme; packs: ThemePackRow[] }`
   and return `packs: query.data?.packs ?? []` from the hook. No backend change is needed — `backend/src/theme/routes.js` GET `/me/theme` already sends `key, label, surfaceHex, locked`.

2. In `ThemeStudio.tsx:101`, map `packs.filter((p) => !p.locked)` instead of `THEME_PACKS`. That satisfies the spec's "owns plus the free default" and cannot show a paid pack the account lacks nor hide one it bought. `THEME_PACKS` stays as the client-side validation vocabulary only.

3. Label: add `settings.themePack.midnight = "Éjfél"` (plus solar/forest/neon/mono, and aurora/ember which stay proper nouns) to hu/en/de.json — all three bundles or `check-i18n` fails the build (DESIGN.md:454-456). Render `t(\`settings.themePack.${p.key}\`, { defaultValue: p.label })` so a pack seeded later than the bundle still prints its DB label rather than a raw key. Drop `capitalize`.

4. Before any of this can ship, `aurora` and `ember` must become real on the client, or the two chips the mockup shows will select a theme that paints nothing: add `[data-theme='aurora']` and `[data-theme='ember']` blocks to `frontend/src/ui/tokens/tokens.css` (with their own structural identity — radius/border/shadow — per DESIGN.md rule 24, and `surface_hex` matching the migration: `#080B14` / `#140A08`), and add both keys to `THEME_PACKS` so `ThemeProvider.tsx:102` stops falling back to `midnight` on hydrate.

5. Layout: replace `shrink-0` with `flex-1 basis-0 min-w-0` on the chip and swap `overflow-x-auto` for `flex-wrap` on the row — three chips then span the card as in the mockup, and a member owning both paid packs (up to seven entries) wraps to a second row instead of clipping. Keep the `p-1` on the row and the `pt-3` above it: per the comment at ThemeStudio.tsx:87-94 those two guard the selected chip's `-right-1 -top-1` badge and the `outline-offset-2` focus ring and together add back up to the card's 16px rhythm.

6. Loading: while `packs` is empty the row should render skeleton chips, not an empty card — settings.md "States" already asks for card-shaped skeletons.

### frontend/src/features/settings/SettingsPage.tsx:232 — structural

**Built:** `DisplayNameRow` renders between the identity cluster and the sign-out button, so a full `Surface` card (label, hint, text input, and a second primary Save when dirty) separates them. `Kijelentkezés` is roughly a card-height lower than the identity it belongs to, and everything below it — including HANGOK ÉS REZGÉS, which the mockup keeps above the fold — moves down with it.

**Mockup:** The role chip is immediately followed by the full-width outlined `Kijelentkezés`, with nothing between them. Spec block 3: 'sitting directly under the identity block with no section card around it.'

**Fix:** Move `{user ? <DisplayNameRow user={user} /> : null}` from line 232 to directly after the `Kijelentkezés` `Pressable` closing tag (currently line 245) and before the `/coins` `Surface`, giving the order: identity cluster -> Kijelentkezés -> display-name card -> coins row. Keep the section's `gap-group` spacing and change nothing else structurally. Additionally — and this is the part the proposed fix omits — rewrite the comment block at lines 227-231, which currently justifies the wrong placement with the premise that argues against it ("and above the sign-out because the spec anchors the sign-out directly under the identity cluster"). Replace that clause so it matches the `/coins` comment's correct reading, e.g. "...and BELOW the sign-out, because the screen spec anchors `Kijelentkezés` directly under the identity block — same reason the coins row sits there." Leaving the old comment in place would preserve the inverted rule for the next editor to re-apply.

### frontend/src/features/settings/SettingsPage.tsx:115 — structural
Shared: `LanguageToggle (frontend/src/ui/nav/LanguageToggle.tsx:27 — same `variant={active ? 'primary' : 'ghost'}` pattern)`

**Built:** The selected transparency chip uses `variant={transparency === value ? 'primary' : 'ghost'}` — the filled-accent variant. `LanguageToggle` does the same for the active locale. At rest the screen therefore carries two solid accent blocks (`Rendszer`, `Magyar`) while the one real primary, `Téma mentése`, is `disabled` at 45% opacity — so the primary action is the least prominent filled thing on the screen.

**Mockup:** One filled accent control in the whole view: the `Téma mentése` button. Selected chips are shown as a tinted, accent-bordered state, not as a filled accent block. DESIGN.md rule 47 ('exactly one `primary` per screen') and §5.6 say the same.

**Fix:** Do the proposed swap, plus three precisions the proposal omits.

1. `SettingsPage.tsx` `TransparencyChoice` — replace `variant={transparency === value ? 'primary' : 'ghost'}` with `variant="ghost"` + `selected={transparency === value}`, and REWRITE the comment on lines 112–114. As written it argues for the accent fill; leaving it in place makes the file contradict its own code. The replacement reason is: the fill is DESIGN §5.6's selected wash, not `primary`, because rule 47 scopes the one filled accent to the SCREEN, not to this track, and that one belongs to `Téma mentése`.

2. `ui/nav/LanguageToggle.tsx` — same swap. Note this component also renders on `AuthPage` (line 197), whose single `primary` is the submit button (line 177), so the swap fixes a second screen rather than regressing one.

3. If you want the transparency segment to match its sibling in the same `MEGJELENÉS` card (ThemeStudio's chips carry `border-accent bg-accent-subtle`, which is what the mockup draws), add the accent edge at the call site — but you must repeat it on hover: `className="flex-1 border-[var(--accent-border)] hover:border-[var(--accent-border)]"`. The `selected` variant ships `hover:border-transparent`, and `cn` is twMerge, which keeps a `hover:` it has no conflict for — the exact gotcha `ComposePage.tsx`'s `SELECTED_CHIP` documents. Do not add any `text-*` class: `--on-accent-subtle` is already the inherited ink, and a `text-*` here would collapse the chip's `text-body-s` (twMerge holds size and colour in one group).

Leave `ThemeStudio`'s `Téma mentése` as the screen's only `primary`; its `disabled={!dirty}` at rest is correct and is not the defect.

### frontend/src/features/settings/ThemeStudio.tsx:58 — structural

**Built:** `commit()` calls `theme.setTheme(...)`, fires `save.mutate(...)` and then `setDraft(null)` unconditionally. `save.isError` is read nowhere and no toast is raised (unlike StyleStudioPage, which toasts both outcomes). When the PUT to `/me/theme` fails, the draft clears, `dirty` goes false, the button greys out — the screen is pixel-identical to a successful save, and the choice silently never leaves the device.

**Mockup:** Spec, States → Error: 'a failed theme save leaves the chip selection where the user put it and surfaces the failure inline, because silently reverting a colour choice reads as the tap not registering.'

**Fix:** The proposed fix is incomplete: keeping the draft on error does NOT keep the button enabled, because `theme.setTheme({ pack: shown })` runs synchronously in `commit()` before the mutation, so `dirty = shown !== theme.pack` is already false regardless of `draft`. The local commit has to be deferred too.

In frontend/src/features/settings/ThemeStudio.tsx, make the commit conditional on the server round-trip and leave the preview in place while it runs (the chip tap already repainted the app via `theme.preview`, so nothing flickers):

```js
const commit = () => {
  save.mutate(
    { pack: shown, accent: theme.accent, gradient: theme.gradient },
    {
      onSuccess: () => {
        theme.setTheme({ pack: shown }); // persist locally only once the server has it
        setDraft(null);
      },
      // no onError body needed to keep state: draft stays, theme.pack is untouched,
      // so the chip stays selected and `dirty` stays true — the button stays live for a retry
    },
  );
};
```

Then surface the failure. Either is legal under DESIGN.md; pick one:
- Inline (what settings.md:59 literally asks for): render `save.isError` as a `text-caption text-danger` line with `role="alert"` immediately under the `Pressable`, inside the same card.
- Or match StyleStudioPage.tsx: `const { toast } = useToast();` and add `onError: () => toast(t('settings.themeSaveError'), 'error')`.

Add the copy key — there is no `settings.themeSaveError` in src/i18n/{hu,en,de}.json today, and `settings.contrastRatio*` are dead keys from the cut accent block. The string must follow DESIGN.md §6.3 (what happened / what survived / what to do), e.g. hu: „A téma mentése nem sikerült — a választásod megmaradt, próbáld újra." Never "Hiba történt."

Keep `useEffect(() => cancelPreview, [cancelPreview])` as is: with the commit deferred, leaving the screen after a failed save correctly drops the unsaved colour instead of carrying it into other screens.

### frontend/src/features/settings/CueSettings.tsx:129 — structural

**Built:** The `Rezgés` row is given one static hint, `settings.cues.hapticsHint` ('Rezgés a sorozat pipálásakor, rekordnál és körváltáskor.'), regardless of `hapticsAvailable()`. The row dims when haptics are absent but never says why. The iPhone fact is welded into `toneHint` instead ('iPhone-on ez az egyetlen hallható jelzés.').

**Mockup:** Spec, the [!important] note under 'What it costs': when `hapticsAvailable()` is false the `Rezgés` row renders dimmed and non-tappable — never hidden — 'and its hint becomes the explanation of why'. The mockup shows the short hint for the available case.

**Fix:** Two steps, both required by the same [!important] note (settings.md:46) — the fact MOVES, it is not copied.

1) Add `settings.cues.hapticsUnavailable` next to `hapticsHint` in all three bundles (after line 114 in each), and shorten `toneHint` (line 112 in each) so the iPhone sentence lives in exactly one place:

frontend/src/i18n/hu.json
  "toneHint": "Rövid hang a 3-2-1 visszaszámláláshoz és a fázisváltáshoz.",
  "hapticsHint": "Rezgés a sorozat pipálásakor, rekordnál és körváltáskor.",
  "hapticsUnavailable": "Ez a készülék nem tud rezegni — iPhone-on a sípszó marad az egyetlen nem vizuális jelzés."

frontend/src/i18n/en.json
  "toneHint": "A short tone for the 3-2-1 countdown and every phase change.",
  "hapticsHint": "A buzz when a set is checked, on a record, and at every round change.",
  "hapticsUnavailable": "This device cannot vibrate — on iPhone the beep is the only non-visual cue left."

frontend/src/i18n/de.json
  "toneHint": "Ein kurzer Ton für den 3-2-1-Countdown und jeden Phasenwechsel.",
  "hapticsHint": "Ein Vibrieren beim Abhaken eines Satzes, bei einem Rekord und bei jedem Rundenwechsel.",
  "hapticsUnavailable": "Dieses Gerät kann nicht vibrieren — auf dem iPhone bleibt der Signalton der einzige nicht-visuelle Hinweis."

2) frontend/src/features/settings/CueSettings.tsx — hoist the availability check so it is evaluated once and both props read from it (the row must stay rendered and dimmed, never hidden):

  const haptics = hapticsAvailable();
  ...
  <Row
    channel="haptics"
    icon={Vibrate}
    label={t('settings.cues.haptics')}
    hint={haptics ? t('settings.cues.hapticsHint') : t('settings.cues.hapticsUnavailable')}
    available={haptics}
    onPreview={() => vibrate('intervalWork')}
  />

Leave the `Row` dim/disabled logic (lines 61-64, 85-87) untouched — it already implements 'dimmed and non-tappable, never hidden'; only the hint was missing. Run `node scripts/check-i18n.mjs` afterwards to confirm key parity.

(Out of scope for this claim, but the identical gap exists on the `speech` row at line 110: `speechHint` is static while `available={speechAvailable()}`, and settings.md:61 covers 'no speech voice installed' too.)

## coach-client-detail  [CLOSE] — 7 remaining

Every block the spec lists is now on the screen in the mockup's order: back link, ringed monogram anchor with badge, name-as-h1 through personLabel (no address anywhere), team chip + origin word, the pending-only handover banner, three SummaryTiles, the two answer tiles with the two severity tones and the +N remainder chip, the ghost `Kérdőív` disclosure row with its Hiányos chip and chevron, the four-chip tablist with real role/arrow-key semantics, plan cards with status chip and needs-start line, and one full-width primary with Klónozás expanding inline underneath. No label/value table, no raw keys, no second filled primary, all six states implemented. What is left is one regression and a 

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/ui/data/SummaryTile.tsx:126 — visual  **REGRESSION**
Shared: `SummaryTile`

**Built:** With align="center" the Surface gets `items-center text-center`, but the inner column is `w-full` (line 125) and the figure is a `<p>` with `flex items-center` (line 87) and no justify class. `text-align` does not position flex items, so the big number sits flush against the left card padding while the icon puck above it and the caption below it are centred. On this screen that is all three tiles: 6, 4 and 3 hang left under centred pucks.

**Mockup:** 07-coach-client-detail-terv.webp draws one centred axis per tile — puck, then figure, then eyebrow, all on the tile's centre line.

**Fix:** Thread the align decision into the figure row: build it as `const figure = ['flex items-center gap-tight text-title-1 font-display tabular-nums', stacked && align === 'center' && 'justify-center'].filter(Boolean).join(' ')` (keep it a plain string, not cn(), so the type step survives twMerge), or add `justify-center` to the `<p>` at line 126 under the same condition. NutritionPage.tsx:212 and ProgressPage.tsx:276 pass align="center" too and are hanging the same way.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/coaching/ClientDetailPage.tsx:364 — visual

**Built:** The disclosure row renders `Kérdőív`. `coaching.profileFull` was split off from `coaching.profileTitle` (the code comment at 361-363 says exactly why) but was never given its own copy: hu.json:333 is `"Kérdőív"`, byte-identical to hu.json:300, and en/de repeat the duplication (`Questionnaire` / `Fragebogen`). So the row and the sheet it opens are still the same word, which is the defect the key split was meant to remove.

**Mockup:** The row reads `Teljes kérdőív` — spec block 7 names it that too. It matters because the row's job is to say it holds the WHOLE questionnaire, while the sheet's title is just `Kérdőív`.

**Fix:** Set `coaching.profileFull` to `Teljes kérdőív` in src/i18n/hu.json:333, and to the matching wording in en.json (`Full questionnaire`) and de.json (`Vollständiger Fragebogen`) — check-i18n requires all three bundles to carry the key.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/coaching/ClientDetailPage.tsx:295 — visual

**Built:** The three tile captions are borrowed from keys that name other things, so they resolve one word too long each: `coaching.sessions` ("Edzések") gives `EDZÉSEK / 28 NAP`; `onboarding.field.sessions_per_week` ("heti edzésszám") gives `HETI EDZÉSSZÁM` (line 304); `nav.plans` ("Tervek", the nav label) gives `TERVEK` (line 311). At 11px micro in a one-third-of-375px tile the first two no longer fit one line, so two of the three tiles grow a second caption line and the row loses its even baseline.

**Mockup:** `EDZÉS / 28 NAP`, `HETI EDZÉS`, `TERV` — three single-line eyebrows of equal height.

**Fix:** Add three caption-only keys and use them here, the same move PlanListPage.tsx:211 already made when it stopped captioning its anchor with `nav.plans`: e.g. `coaching.tile.sessions` = "Edzés", `coaching.tile.weekly` = "Heti edzés", `coaching.tile.plans` = "Terv", in hu/en/de. Keep the `/ ${t('plans.dayCount', {count: 28})}` suffix on the first one.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/coaching/ClientDetailPage.tsx:416 — visual

**Built:** The selected tab is hand-rolled as `cn('shrink-0', tab === key && 'border-accent bg-accent-subtle')` on a `secondary` Pressable. Two consequences: the chip keeps a hard accent-coloured edge the design system does not draw on a selected chip, and `secondary`'s `hover:border-[var(--surface-border-strong)] hover:bg-surface-2` is never overridden (different modifier, twMerge cannot see through it), so pointing at the already-selected tab turns it grey — it reads as "you are about to deselect".

**Mockup:** The `Terv` chip is a plain filled pill with no contrasting outline; the other three carry the hairline.

**Fix:** Pass the recipe's own state instead: `selected={tab === key}` and drop the conditional className, leaving `className="shrink-0"`. control.ts:100-106 already supplies `bg-accent-subtle text-on-accent-subtle`, the transparent border that preserves the chip's width, and the hover lock — it was written for exactly this and MarketplacePage/ComposePage already use it.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/coaching/ClientDetailPage.tsx:95 — visual

**Built:** On the `strong` tone the icon holder is `bg-[var(--warning-subtle)]` while the card it sits on is also `bg-warning-subtle` (line 93). Two 12% amber washes stacked: the shield's disc composites about 10 points of amber above its own card and barely reads as an object at all, so the alert tile's glyph loses the mass the neutral tile's puck has against surface-1.

**Mockup:** The KÍMÉLENDŐ tile draws a solid amber disc with a dark shield cut into it — the one element that pops out of the amber card.

**Fix:** Split the holder by tone at line 94-95: keep `bg-[var(--warning-subtle)] text-warning` for `soft`, and give `strong` a filled puck — `bg-warning text-on-warning` (`--on-warning` exists for exactly this, DESIGN.md §1.4). The card fill and border stay as they are.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/coaching/ClientDetailPage.tsx:372 — polish

**Built:** The `Hiányos` chip is hand-written as `text-caption rounded-chip bg-warning-subtle px-2 py-0.5 text-warning`, and PlanTab's status chips (PlanTab.tsx:44-45 with the STATUS_TONE map at 25-30) are hand-written the same way. 8px/2px padding renders a 16px-tall pill — tighter than every other status chip in the app and than the mockup's.

**Mockup:** `Hiányos`, `Aktív ✓`, `Piszkozat` and `Szünetel` are all comfortable pills with roughly the padding of `chip`'s px-3 py-1.

**Fix:** Use the `chip` recipe from ui/primitives/control.ts:154 — `<span className={chip({ tone: 'warning' })}>` here, and in PlanTab map the four statuses onto `chip({ tone })` (active→success, paused→warning, draft→quiet, ended→quiet), deleting STATUS_TONE. It is the recipe's stated purpose; the comment at control.ts:143-146 names the coaching screens as the copies it was meant to absorb.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/coaching/PlanTab.tsx:66 — polish

**Built:** A plan with no start date shows `plans.needsStart`, whose hu value is the two-clause sentence "Aktiváláshoz kell egy kezdődátum — enélkül a kliens kezdőlapja üres marad." At text-caption inside the card it wraps to two lines, so the draft card stands taller than the two dated cards around it.

**Mockup:** The `Téli erő blokk` card carries the one-line alert `Aktiváláshoz kell egy kezdődátum`, on the same single meta line the dated cards use.

**Fix:** Shorten `plans.needsStart` in the three bundles to the line the spec quotes (`Aktiváláshoz kell egy kezdődátum`). If the consequence clause is worth keeping, move it to the plan editor where the date is actually set, not onto a list row whose height is shared with its siblings.

## coach-plans  [CLOSE] — 6 remaining

The skeleton of the redesign is in place: the create form is gone, the stacked-segment anchor with its total, caption and three-item legend is drawn, one full-width filled primary sits under it, both sections render as icon-tile heads with a trailing count, rows carry the monogram + chevron shape, `Tervek` is off the nav and EDZŐ owns /coach/plans. Six things are still off. The most visible: the primary reads `Létrehozás` ("Create"), not `Új terv` — the label survived from the create card that was merged away, and it is the one string on the screen a coach reads before acting. Second, every client row now prints a third line (`personLabel`, i.e. the local part of the address when no display_

### frontend/src/features/plans/PlanListPage.tsx:251 — visual

**Built:** The full-width filled primary renders `{t('plans.create')}`, which is "Létrehozás" in hu.json, "Create" in en.json, "Erstellen" in de.json — a leftover from the submit button of the create card the redesign merged away.

**Mockup:** The button reads `+ Új terv` (mockup, anchor crop; spec Blocks §3 and the merge note both name it `Új terv`).

**Fix:** Add a new key `plans.newPlan` — hu "Új terv", en "New plan", de "Neuer Plan" — to src/i18n/{hu,en,de}.json and render `{t('plans.newPlan')}` at line 251. Do not repurpose `plans.create`: it is also the generic create label elsewhere.

### frontend/src/features/plans/PlanListPage.tsx:151 — visual  **REGRESSION**

**Built:** Client rows render a third text line — `<span className="text-caption block truncate text-text-3">{clientLabel}</span>` — between the bold plan name and the chip+meta line. With no display_name, personLabel returns the address local part (e.g. `demo.kovacs.anna`), so the row shows a raw account handle. The row grows from 88px to ~112px, while the loading skeleton at line 183-184 is fixed at h-[88px], so the skeleton→data swap shifts the list — the exact thing the spec's Loading state forbids.

**Mockup:** Client rows are exactly two lines: circular monogram (`AN`, `BE`) + bold plan name, then the status chip beside `4 nap · 7 napos ciklus`. No identity line. The spec's merge note ("The client email left the row") records the removal and its reason: the monogram identifies the client, the full address is one tap away.

**Fix:** Delete the `{clientLabel ? <span …>{clientLabel}</span> : null}` block at lines 151-153. Keep `clientLabel` for the monogram at line 134-140 and add it back for assistive tech on the avatar span (swap `aria-hidden` for `aria-label={clientLabel}`, or keep the avatar decorative and append an `sr-only` span) so the row still announces whose plan it is without printing a handle.

### frontend/src/features/plans/PlanListPage.tsx:187 — visual

**Built:** There is no role gate. A member who opens /coach/plans gets the 403 through `plans.isError` and lands on the generic red alert Surface with an `Újra` (Retry) button that will fail on every press. The comment at 189-190 asserts this is intended, but the spec owes a different state.

**Mockup:** Spec States: "Role-gated — coach-only route. A member who reaches the URL gets the forbidden empty state, and the server enforces it regardless of what the nav shows."

**Fix:** Copy the pattern from features/coaching/CoachDashboard.tsx:138-151: read `useSession()`, and before the query branches return `<div className="col-mobile screen-x py-6"><EmptyState icon={ClipboardList} title={t('coaching.forbiddenTitle')} body={t('coaching.forbiddenBody')} heading="h1" /></div>` when `user && user.role !== 'coach' && user.role !== 'admin'`. Leave the generic error card for real request failures.

### frontend/src/features/plans/PlanListPage.tsx:100 — polish

**Built:** `StatusChip` renders the label first and the `Check` glyph after it, so the chip reads `Aktív ✓`.

**Mockup:** Both `Aktív` chips in the mockup (template row 1 and the Anna client row) draw the check LEADING: `✓ Aktív`, glyph then word.

**Fix:** Move the `{status === 'active' ? <Check … /> : null}` expression above `{t(`plans.status.${status}`)}` on lines 99-100. While there, the chip is hand-rolled at `text-micro px-2 py-1` while the shared `chip` recipe in ui/primitives/control.ts is `text-caption px-3 py-1` with the same success/warning/quiet tones — the mockup's pill is the roomier one, and `cn()` no longer eats the type step, so the reason this call site hand-rolls the class string is gone.

### frontend/src/features/plans/PlanListPage.tsx:81 — polish

**Built:** `startPlan` creates the draft with `name: t('plans.newName')`, and `plans.newName` is "Új terv neve" / "New plan name" / "Name des neuen Plans" — the FIELD LABEL of the create card that was merged away (it is still correctly used as the editor input's aria-label at PlanEditorPage.tsx:209). A coach who does not type over the selected field leaves a row in the library literally reading "Új terv neve".

**Mockup:** Spec: "`Új terv` creates a draft template with a default name and goes straight to the editor." A default name, not a form label.

**Fix:** Add `plans.defaultName` — hu "Új terv", en "New plan", de "Neuer Plan" — and use it at line 81 and at features/coaching/PlanTab.tsx:125, which makes the same substitution. Leave `plans.newName` as the input's aria-label.

### frontend/src/features/plans/PlanListPage.tsx:243 — polish

**Built:** The page column is `flex flex-col gap-section` (32px) at line 170, so the anchor card, the primary and both sections are all separated by the same section-level gap — the token DESIGN.md §3 defines as "between two things that are not each other's business".

**Mockup:** The mockup's rhythm is hierarchical: the button hugs the anchor card (roughly a group-level gap), and the air opens up again before the `Sablonok` head. Spec Blocks §3: "a full-width filled primary, directly under the anchor".

**Fix:** Wrap the anchor Surface (lines 207-240) and the primary Pressable (243-252) in one `<div className="flex flex-col gap-group">` so they read as one unit, leaving `gap-section` between that unit and the sections. This also buys back ~16px toward the fold; with it the `Kliens-tervek` head and its first row come back into the first screenful.

## coach-plan-editor  [CLOSE] — 5 remaining

The screen is structurally the redesign now: the cycle strip is the anchor in its own card in the top third, the status pills are gone into a Sheet behind a word in the meta line, `Mentés` is the single filled primary in the header and is disabled until a plan-level field is actually pending, the exercise-row chevrons are revealed on focus with the ends disabled, every state the spec owes (loading / not-found / empty / cycle-full / cycle-grew / offline) renders with the exact copy, and the clone list prints `personLabel` rather than e-mail addresses. Four things still differ. The largest is that the open day no longer steps up a surface level at all — the spec's "steps up to the highest surf

### frontend/src/features/plans/PlanEditorPage.tsx:383 — visual

**Built:** The open day's body is `<div className="flex flex-col gap-group border-t border-[var(--surface-border)] p-[var(--card-pad)]">` with no fill of its own, so it stays on the day card's own `--card-bg` veil. The block card inside it (line 387-389) is a transparent box with a hairline only, and the exercise rows (line 453) carry `bg-surface-2`. That is one 4% step across the whole edited region: day card, open panel and block card are all the same tone, and in Midnight the rows (#181C22) are barely separable from the card (#12151A) they sit on.

**Mockup:** The open day inverts against the page: the panel holding `Szuperszett` is a distinctly brighter surface than the collapsed dark day card behind it, and the two exercise rows are brighter again — the brightest elements on the screen. Three readable levels, so the area being edited reads as foreground. The spec states it outright: "Open day — steps up to the highest surface level, inverting against the page so the area being edited reads as foreground."

**Fix:** Let the ladder keep rising instead of flattening at one step. On line 383 add `bg-surface-2` to the open panel; leave the block card's hairline at line 389 as the divider it already is; and raise the exercise rows at line 453 from `bg-surface-2` to `bg-surface-3` so they land on the highest surface level the spec asks for. That keeps the ladder monotonic (card → 2 → 3), never drops a child below its parent (the failure the comment at 373-382 was written about), and uses only declared surface tokens.

### frontend/src/features/plans/PlanEditorPage.tsx:248 — visual

**Built:** The strip is a default `Surface` (`pad="card"` → `p-[var(--card-pad)]`, 16px each side) wrapping `<ul className="flex gap-1 overflow-x-auto">` of seven `<li className="flex min-w-11 flex-1">` tiles. `min-w-11` (44px) plus `Pressable`'s own `min-w-[var(--target-min)]` means the tiles cannot shrink below the 44px floor, so the row needs 7×44 + 6×4 = 332px. Available inner width is 329px at 393pt, 326px at 390pt and 311px at 375pt — the row overflows and scrolls at every common phone width, leaving the last day tile clipped at rest with no scroll affordance.

**Mockup:** All seven day tiles sit across the full content width in one unscrolled row, edge to edge inside the card. That is the anchor's entire job — the spec calls it "the only element that shows the whole of it at once", and a strip whose seventh slot is off-screen cannot answer "is a slot still empty".

**Fix:** Take the horizontal card padding off the strip so the tile row spans the card's full width: change line 248 to `<Surface as="section" pad="none" ...>` and move the vertical air onto the children (e.g. `py-tight` on the `ul` at line 252 and on the caption `<p>` at line 296). Inner width then becomes 343px at 375pt against the 332px the seven tiles need, so the row fits on every supported phone without touching the 44px floor.

### frontend/src/features/plans/PlanEditorPage.tsx:613 — polish

**Built:** The below-the-fold section renders `Nap hozzáadása` (or the cycle-full line) first at line 613-634, then the `Klónozás` button and its client list at 639-691, then the cycle-copy card at 695-723.

**Mockup:** The spec's block 9 orders this region "the block-add chips ... the `Klónozás` button with its client list and `Másolat sablonként`, the cycle-copy card, and `Nap hozzáadása`" — the day-add is last. The merge note depends on that order: `Mentés` moved to the header "so the commit is reachable without scrolling to the end of a long plan", which only reads as an argument if `Nap hozzáadása` is what sits at that end.

**Fix:** Move the `nextFreeIndex` block (lines 613-634, including the `plans.cycleFull` fallback) to the bottom of the same `<section>`, after the cycle-copy `Surface` that closes at line 723.

### frontend/src/features/plans/PlanEditorPage.tsx:180 — polish

**Built:** The back-link/`Mentés` row (line 180), the `<header>` carrying the title and meta line (line 199) and the cycle-strip `Surface` (line 248) are three separate children of the root `flex flex-col gap-section`, so 32px of air falls between each pair.

**Mockup:** The masthead reads as one group: roughly a `--spacing-group` step (16px) between the back link and the title, and again between the meta line and the top of the strip card. The doubled gaps push the strip and the first day card down by ~64px, which costs the screen most of the fourth day card the mockup leaves peeking at the fold. `--spacing-section` is documented as "between two things that are not each other's business", and these three are one masthead.

**Fix:** Wrap lines 180-245 (the back-link row and the `<header>`) in a `<div className="flex flex-col gap-group">` and give the strip `Surface` the same relationship — the pattern `ExerciseDetailPage.tsx:91` already uses for its back-link-plus-hero group. Leave `gap-section` on the root for the real boundaries (strip → warning row → day list → below-the-fold).

### frontend/src/features/plans/PlanEditorPage.tsx:366 — structural

**Built:** `deleteDay` (line 366), `deleteBlock` (line 439) and `deleteExercise` (line 485) all call `mutateAsync` and nothing else. No toast is raised and no undo is offered anywhere on the screen — the file never imports `useToast`, and there is no `feedback`/undo helper. A trash tap on a day card removes the day and every block and exercise inside it, irreversibly, with no acknowledgement that anything happened.

**Mockup:** The spec's `[!important]` callout: "A day card can hold a dozen exercises and its trash button fires straight away... The right answer is an undo toast on delete, not a confirm sheet." The Components section names the mechanism by name — "the toast host (E15) for the delete undo". This is owed behaviour, not a cut.

**Fix:** Raise an undo toast on all three deletes, but the replay mapping in the proposed fix is wrong.

1. WIRING. `import { useToast } from '../../ui/feedback/ToastHost'` + `const { toast } = useToast();`. The host is already mounted app-wide at `app/providers.tsx:41`; nothing else to wire. Keep the default `bottom` placement — `placement: 'top'` is the player's documented one-screen exception.

2. `common.undo` ALREADY EXISTS (hu.json:20 "Visszavonás", en.json:20, de.json:20), and `ui/feedback/variants/E12E16.tsx:562` renders `t('common.undo')` itself. The caller passes only `onUndo`, never a label. What IS new is the message copy: `plans.dayDeleted` / `plans.blockDeleted` / `plans.exerciseDeleted` / `plans.undoFailed` — and each must land in hu.json, en.json AND de.json, or the `check-i18n` gate fails the build (DESIGN.md: "All 777 keys must exist in all three bundles").

3. SNAPSHOT BEFORE THE MUTATION — correct as claimed, and load-bearing: `usePlanMutation` invalidates `['plans']` on success, so a lazy read of `data` inside `onUndo` finds nothing. Capture the day, `blocksOf(day.id)`, and `exercisesOf(b.id)` for each of those blocks into locals first.

4. REPLAY PAYLOADS — the proposed "replay the rows through useCreateDay/useCreateBlock/useAddExercise" fails as written, because all three POST schemas in `backend/src/plans/routes.js` are `.strict()` and none of them takes the row shape the GET returns:
   - Day (`DayCreate`, line 118): `is_rest` is `z.boolean()`, but `PlanDay.is_rest` is `0 | 1` — send `is_rest: Boolean(day.is_rest)`. Also replay `day_index` and `slot` or the day returns to the wrong cycle position.
   - Block (`BlockCreate`, line 505): `{ day_id: newDayId, kind, position, rounds, rest_seconds, cap_seconds, label }`.
   - Exercise (`ExerciseCreate`, line 593): it accepts `target_weight` + `target_weight_unit` and REJECTS `target_weight_kg` / `target_weight_entry_*` — the server computes canonical kg itself via `toKilograms` (a CHECK enforces the pair agrees). Map it: `target_weight: ex.target_weight_entry_value, target_weight_unit: ex.target_weight_entry_unit ?? 'kg'`. Echoing the row verbatim is a 400 on every single exercise undo.

5. WIDEN THE FRONTEND TYPES. The API sends `SELECT *` for blocks and `SELECT px.*` for exercises, so the wire carries fields `usePlans.ts` does not declare: `cap_seconds` on `PlanBlock`, and `load_mode`, `target_distance_m`, `target_percent_1rm`, `tempo` on `PlanExercise`. Add them to the interfaces and include them in the snapshot — otherwise an EMOM cap, a tempo string, or an `assisted` load_mode comes back silently changed, and an undo that restores something different from what was deleted is worse than no undo at all.

6. SEQUENTIAL REPLAY, WITH A FAILURE PATH. Day undo is day → its blocks → each block's exercises, awaited in order because each child needs the parent's fresh `lastInsertRowid` from the `{ id }` response. Wrap the whole chain in try/catch and raise `toast(t('plans.undoFailed'), 'error')` on failure — a half-restored day that says nothing is the same bug this fix exists to remove.

7. TWO GUARDS the proposal misses:
   - `exercise_name_snapshot` is server-derived from the joined `exercises` row (`COALESCE(e.name, 'Exercise')`) and is never client-supplied. A row whose `exercise_id` is `null` (source exercise deleted) cannot be faithfully restored — it returns named "Exercise". If the snapshot contains such a row, raise the toast WITHOUT `onUndo` rather than offering an undo that quietly renames the exercise.
   - Gate the undo on `online`. Every trash button on this screen is already `disabled={offline}`; an undo tapped after the connection drops must hit the error toast, not fail silently.

8. Accept the host's documented limits rather than fighting them: 4s dwell (`--duration-toast`) and a hard cap of three toasts, so a burst of deletes pushes the oldest undo off screen. That is `ToastHost`'s recorded decision, not something to special-case here.

## piacter (/m)  [CLOSE] — 6 remaining

Every block the spec lists now renders, in the mockup's order, with the right shapes: the public top bar with its lone accent `Belépés` pill, the display-type h1, a 5:2 photographic hero in the top third, the pill search field with its inset magnifier and no clear-x, one masked scrolling chip row with `aria-pressed` and a check on the selected chip, and three-line cards with the kind tile, meta line, medium-weight title and a coach/price footer. The chip fill is correctly `accent-subtle` rather than a second filled primary, `--text-body-strong` and the `size-icon-*` utilities all resolve, the skeleton's `h-26` matches the card's real 104px, the price now formats from per-currency minor units

### frontend/src/features/marketplace/MarketplacePage.tsx:275 — visual

**Built:** FeedHero renders only the cover image (or the brand-gradient fallback with the kind glyph). Nothing sits on top of it — no overlay mark of any kind.

**Mockup:** Both the dark and the light mockup centre one large circular play button on the hero, a filled disc with a ring around it, roughly a third of the tile's height. The spec's Anchor section names it as load-bearing: it 'is what stops the page reading as a search-results list — it says the marketplace holds video and coaches, not records.'

**Fix:** This is the one mockup element the spec does NOT record as a cut — the warning callout covers only the `Kiemelt` pill and the `42` badge. The Components section makes it conditional instead: 'decide whether it opens a sheet, a native player, or simply the post detail before it is drawn.' So make that decision first, then draw the disc as an absolutely-positioned overlay inside the `Surface` in FeedHero (the Surface is already `overflow-hidden`; add `relative` and an `aria-hidden` centred span). If the answer is 'the post detail', it must not be a play triangle — use no overlay at all rather than promising a player that does not exist, and record that decision in the code comment at line 260 so this stops being re-litigated on every pass.

### frontend/src/i18n/hu.json:739 — visual

**Built:** `marketplace.noResultsBody` reads 'Próbálj más szót, vagy vedd le a városszűrőt.' and is rendered by MarketplacePage.tsx:221 whenever a search returns nothing. The same string exists at en.json:739 ('clear the city filter') and de.json:739 ('entferne den Stadtfilter').

**Mockup:** There is no city filter anywhere on the screen. The spec's 'What was merged away' section cut the entire `Bárhol` + eight-city chip row, and its States section flags this exact string: 'That body copy names a city filter. If the city row stays cut, this string changes with it, or it tells the reader to use a control that is not on the screen.'

**Fix:** Rewrite the body in all three bundles to point at the control that does exist — the search box — and drop the reference to the filter. Hungarian: 'Próbálj más szót, vagy írd be a város nevét.' English: 'Try different words, or type the city name.' German: 'Versuche andere Wörter oder gib den Städtenamen ein.' This matches the advice `marketplace.searchCapped` already gives ('Szűkíts a szavakkal vagy a várossal'), so the two strings stop contradicting each other.

### frontend/src/features/marketplace/MarketplacePage.tsx:203 — visual

**Built:** The error branch renders `EmptyState` with the `WifiOff` icon, `title={t('offline.title')}` — 'Nincs internetkapcsolat' — and no `body` at all, just the `Újra` retry.

**Mockup:** Not in the mockup; this is the state the spec's States section owes. The branch itself is correct and new (a failed fetch used to fall into 'Még nincs itt semmi'), but the copy claims a network outage for any failure — a 500, a 404, a malformed payload. And now that `OfflineIndicator` is hoisted into `Providers` and covers this route, a genuinely offline visitor sees the sticky strip saying 'Nincs internetkapcsolat' with this panel repeating it underneath, while an online visitor hitting a server error is told their phone has no internet. `EmptyState`'s own contract (ScreenSkeleton-era docblock: 'the user is told what is missing, why, and what to do about it') is also unmet with `body` omitted.

**Fix:** Add `marketplace.errorTitle` / `marketplace.errorBody` to the three bundles next to the existing marketplace keys — e.g. hu 'Nem sikerült betölteni a piacteret' / 'A szerver most nem válaszolt. Próbáld meg újra.' — and pass both here. Swap `WifiOff` for `TriangleAlert` (already imported elsewhere in the app, e.g. ExerciseDetailPage.tsx:3). Leave the network claim to `OfflineIndicator`, which is the only thing on the page that actually probes the connection.

### frontend/src/features/marketplace/MarketplacePage.tsx:218 — polish
Shared: `EmptyState (frontend/src/ui/feedback/EmptyState.tsx)`

**Built:** The resting empty state renders `EmptyState` with `icon={Compass}` at its default `size="inline"` — a 120px mark with a 48px glyph.

**Mockup:** When the feed is genuinely empty, `lead` is null, so the hero at line 113 renders nothing either — the screen's whole top third becomes the h1, the search field and the chip row, with no anchor at all. `EmptyState`'s own docblock (EmptyState.tsx:38-47) names the `anchor` size for exactly this case: 'for the screens where the empty state IS the screen and the mark has to carry the top third the way a ring or a chart would: the redesigned Home with no plan today, an empty marketplace.' The size prop shipped app-wide today and this screen does not pass it.

**Fix:** Pass `size={searching ? 'inline' : 'anchor'}`. Not-searching means the marketplace itself is empty and the mark is the screen; a search that returns nothing still has a populated hero and chip row above it, so `inline` stays right there.

### frontend/src/features/marketplace/PublicChrome.tsx:175 — polish
Shared: `VerifiedBadge (frontend/src/features/marketplace/PublicChrome.tsx) — also used by PostPage and CoachProfilePage`

**Built:** `VerifiedBadge` renders lucide `BadgeCheck` at `size-icon-s` (16px) with `text-accent` — an open 1.5–2px stroke of the scalloped badge outline with a check inside it, no fill.

**Mockup:** Both mockups draw the tick beside 'Kovács Péter' and 'Nagy Anita' as a SOLID accent-filled scalloped badge with a light check knocked out of it. At 16px the difference is legible: the filled version reads as a badge, the outline version reads as a smudge next to the name.

**Fix:** Give the glyph a fill and invert its ink: `className={cn('size-icon-s shrink-0 fill-accent text-accent-fg', className)}`. `fill-*` paints the badge body, `currentColor` keeps the outline and the check on `--accent-fg`, which is the same trick `EmptyState`'s `badge` slot already documents at EmptyState.tsx:69-80 ('at a third of the main icon's size a 1.5px open stroke is a smudge'). The `aria-label` stays as is.

### frontend/src/features/marketplace/MarketplacePage.tsx:280 — polish

**Built:** The hero cover comes from a SECOND request — `usePost(lead?.id)` at line 96 — so while that detail fetch is in flight `leadCover` is undefined and FeedHero takes the `else` branch at line 285: the brand gradient with the kind glyph. The `<img>` also carries `loading="lazy"`.

**Mockup:** The anchor is a photograph of a gym floor. On a cold load the built screen shows the feed skeleton, then a gradient tile with an icon on it, then the photograph — the top third pops twice before it settles, and `loading="lazy"` on the single most important above-the-fold image defers it further. The geometry is stable (both branches are `aspect-[5/2]`), so this is a content flash rather than a layout shift, but it is the one element the spec says must not read as a placeholder: 'an empty box in the top third is worse than no image at all.'

**Fix:** Two changes. (1) On the img at lines 278-282, replace `loading="lazy"` with `loading="eager"` and add `fetchPriority="high"` — this image is never below the fold. (2) Distinguish 'no cover' from 'not yet': keep the `Skeleton className="aspect-[5/2] w-full rounded-card"` from line 112 while `leadDetail.isLoading` is true, i.e. change the guard at line 108 to `feed.isLoading || leadDetail.isLoading`, and let the gradient branch mean only what its comment says it means — a post that genuinely has no cover.

## compose-profile  [CLOSE] — 8 remaining

The skeleton of this screen is now right: person-as-anchor (monogram ring, name as the h1, `@handle · Város` line that is a real disclosure carrying handle + city), the two-field stack, the specialties card, the pencil-headed bio, the publish switch, and a two-track button row with exactly one filled primary — all in the mockup's order, with the bottom bar lighting EDZŐ via `owns: ['/compose']`. The camera badge and `Kép cseréje` are correctly absent (spec's recorded cut). What is left is a cluster of copy and label-row gaps, all in the same shape: strings that were never added to the bundles, so the code carries a comment instead of the text. `Kötelező` is missing from the name field's labe

### frontend/src/features/compose/ProfileEditorPage.tsx:375 — visual

**Built:** One string does both jobs: `t('compose.specialties', { n, max })` resolves to `Szakterületek (2/6)`, rendered in `text-title-3 text-text-1` immediately after the medal glyph, left-aligned. There is no counter element and nothing at the card's right edge.

**Mockup:** A two-part header row: medal + `Szakterületek` in full-strength title ink on the left, and `2 / 6 kiválasztva` in small muted ink hard against the card's right edge.

**Fix:** Split the key. Set `compose.specialties` to the bare noun (`Szakterületek` / `Specialties` / `Schwerpunkte`) and add `compose.specialtiesCount` = `{{n}} / {{max}} kiválasztva` (`{{n}} / {{max}} selected`, `{{n}} / {{max}} ausgewählt`) to all three bundles. In the header row built by the previous fix, put the title span on the left and `<span className="text-body-s shrink-0 text-text-3">{t('compose.specialtiesCount', { n: specialties.length, max: specialtyMax })}</span>` on the right.

### frontend/src/features/compose/ProfileEditorPage.tsx:343 — visual

**Built:** `<Field label={t('compose.displayName')} aria-required … />` — no `marker` prop, so the label row renders `Megjelenített név` alone with the right half of the row empty. The obligation is only in the accessibility tree.

**Mockup:** The label row is `Megjelenített név` on the left and `Kötelező` right-aligned in small muted ink — the visible counterpart to the `Nem kötelező` on the field directly below it.

**Fix:** Add `compose.required` to hu/en/de (`Kötelező` / `Required` / `Erforderlich`) — `check-i18n.mjs` requires the same key set in all three — then pass `marker={t('compose.required')}` on this Field. `Field` already implements the slot (`marker` renders right-aligned at `text-caption text-text-3` and is wired into `aria-describedby`), so nothing else changes.

### frontend/src/features/compose/ProfileEditorPage.tsx:357 — visual

**Built:** The headline Field passes `marker={t('compose.optional')}` but no `hint`, so nothing is rendered under the input — the specialties card starts straight after it.

**Mockup:** A muted helper line under the headline input reading `Ez jelenik meg a neved alatt a piactéren.` The spec calls it out by name: it earns its line because it says WHERE the text lands, which is the one thing the label cannot.

**Fix:** Add `compose.headlineHint` to hu/en/de — hu: `Ez jelenik meg a neved alatt a piactéren.`, en: `This appears under your name on the marketplace.`, de: `Das erscheint unter deinem Namen auf dem Marktplatz.` — then pass `hint={t('compose.headlineHint')}`. `Field` renders it at `text-caption text-text-3` beneath the input and ties it into `aria-describedby`.

### frontend/src/features/compose/ProfileEditorPage.tsx:440 — visual

**Built:** The switch row's label is `t('compose.publishProfile')` = `Profil közzététele` — the same string the desk uses on its publish BUTTON (ComposePage.tsx:489). A switch row labelled with a verb phrase reads as a pending action rather than as a state the toggle reflects.

**Mockup:** The row is labelled `Nyilvános profil` — a noun phrase naming the state the toggle beside it shows.

**Fix:** Add `compose.publicProfile` to hu/en/de (`Nyilvános profil` / `Public profile` / `Öffentliches Profil`) and use it here. Leave `compose.publishProfile` alone — the desk's button still needs the verb.

### frontend/src/features/compose/ProfileEditorPage.tsx:443 — visual

**Built:** The sub-line under the label prints `profile.publishedAt !== null ? t('compose.live') : t('compose.hidden')` — the single words `Élő` / `Rejtve`. It restates what the toggle's own position already shows and explains nothing.

**Mockup:** A fixed explanatory sub-line: `A piactéren bárki megtalál.` — it tells the coach what turning this on actually does, which is the consequence (the whole back catalogue going dark) the toggle carries.

**Fix:** Add `compose.publicProfileHint` to hu/en/de — hu: `A piactéren bárki megtalál.`, en: `Anyone can find you on the marketplace.`, de: `Auf dem Marktplatz findet dich jeder.` — and render it unconditionally in the `text-caption block text-text-3` span, replacing the live/hidden ternary.

### frontend/src/features/compose/ProfileEditorPage.tsx:423 — polish

**Built:** The `karakter maradt` counter is a bare `<span>` inside `flex flex-col gap-tight`, so it stretches the full column width and its text sits flush LEFT under the textarea.

**Mockup:** The counter is right-aligned, its last character level with the textarea's trailing edge — the standard counter position, and the only thing on that line.

**Fix:** Add `self-end` to the span's class list (or `text-right` — `self-end` is better, it shrinks the box to the text so the muted line does not span the column). `PostEditorPage.tsx:484` carries the identical left-aligned span; fix both so the two compose editors keep agreeing.

### frontend/src/features/compose/ProfileEditorPage.tsx:373 — structural  **REGRESSION**

**Built:** The specialties card is `<Surface as="fieldset">` with a `<legend className="text-title-3 flex items-center gap-tight text-text-1">` as its first child. A rendered `<legend>` is positioned by the browser over the fieldset's block-start border and the border is drawn with a gap behind it, so the card's top edge is cut open on both sides of `Szakterületek`. The legend also shrink-to-fits its inline size, which is why no `justify-between` can push a counter to the card's right edge. The cut was small while the legend rendered at `text-body-s text-text-2`; promoting it to `text-title-3` (17px/600) this pass widened and heightened the gap into the card's most visible edge.

**Mockup:** An unbroken, fully-closed bordered box. `Szakterületek` sits INSIDE the box below an intact top border, with the card's normal padding above it.

**Fix:** Drop fieldset/legend for the card shell and use the same section+heading shell every other card on this screen uses.

At line 367 change the shell to:

  <Surface as="section" aria-labelledby="compose-specialties" className="flex w-full min-w-0 flex-col gap-group">

and replace the `<legend>` (373-376) with a header row whose left half is the heading:

  <div className="flex w-full items-baseline justify-between gap-2">
    <h2 id="compose-specialties" className="text-title-3 flex items-center gap-tight text-text-1">
      <Medal className="size-icon-m shrink-0 text-text-2" aria-hidden />
      {t('compose.specialties', { n: specialties.length, max: specialtyMax })}
    </h2>
  </div>

Keep the existing `compose.specialties` key in the `h2` — it is "Szakterületek ({{n}}/{{max}})" in all three bundles, so the count still shows; do not invent a `specialtiesCount` string here. The `justify-between` row is what lets the mockup's right-aligned `2 / 6 kiválasztva` land later without another structural change, once a separate counter string exists in hu/en/de.

Label the chip set on the list rather than relying on the removed legend:

  <ul role="group" aria-labelledby="compose-specialties" className="flex flex-wrap gap-tight">

(`role="group"` rather than a bare `ul` + `aria-labelledby`: the chips are `Pressable`s with `aria-pressed`, i.e. toggle buttons, so there is no form-control grouping to preserve, and `role="group"` is what actually gets the name announced.)

Do NOT take the `float-left w-full` + compensating-pad escape hatch on the legend: it re-creates the top-padding value by hand, and it would leave this the only fieldset in the frontend for no semantic gain.

### frontend/src/features/compose/ProfileEditorPage.tsx:204 — structural

**Built:** `useComposeProfile()` returns `removedAt` on the profile (useCompose.ts:131) and this page never reads it. A profile a moderator took down renders exactly like a live one: every Field, the chips, the bio textarea and the publish switch are all editable, and `Mentés` fires a PUT the server will refuse.

**Mockup:** The spec's `Taken down` state: a moderator-removed profile is READ-ONLY on this screen. The desk's takedown card (`compose.removedTitle` / `compose.removedBody`) is the explanation; this screen just stops accepting edits.

**Fix:** In `frontend/src/features/compose/ProfileEditorPage.tsx`, after line 204/205 add the house-form derivation copied from `PostEditorPage.tsx:222`:

`const readOnly = !!profile && profile.removedAt !== null;`

(not the `!== null && !== undefined` pair — on create `profile` is null and `!!profile` already answers it, and this keeps the two compose editors reading identically.)

Then thread it exactly as `PostEditorPage` does:
- `disabled={readOnly}` on the `Megjelenített név` Field (343-349) and the `Egysoros bemutatkozás` Field (357-363) — `Field` spreads `...rest` onto the input, so this needs no prop change.
- `disabled={readOnly}` on the bio `<textarea>` (417-422) AND append `disabled:pointer-events-none disabled:opacity-45` to its class string — `PostEditorPage.tsx:475` carries those utilities and the bio textarea currently does not, so without them the disabled bio would look identical to an editable one (DESIGN.md rule 45).
- `disabled={readOnly}` on the specialty toggle `Pressable` (382-392). Leave the `Továbbiak` overflow chip (397) live — expanding the list is not an edit.
- `disabled={setLive.isPending || readOnly}` on the `Switch` (446-451).
- `disabled={readOnly}` on the primary submit `Pressable` (475-482). Leave `Előnézet` (483-486) live, as proposed.

Identity line — do NOT drop it. Keep `@{profile?.handle} · {cityName}` rendered; when `readOnly`, render it as plain non-interactive text instead of the `Pressable` (e.g. `<span className="text-body-s text-text-2">`), and change the disclosure guard at 327 to `!readOnly && identityOpen` so it cannot be open. Removing the trigger outright would remove the anchor's identity line, which the mockup draws and the spec calls the live preview of the marketplace card.

Banner: one line, in the shape of `PostEditorPage.tsx:318-326` (`<Surface as="p" className="text-body-s border-[var(--danger-border)] bg-danger-subtle text-text-1" role="status">`), placed under the back link. Use the profile's OWN existing key `compose.removedTitle` ("A profilodat levették" / "Your profile was taken down"), which is already in hu/en/de at line 754 — not `compose.postRemoved`, whose copy says "this post". Do not also print `compose.removedBody`: that full explanation is the desk card's job per the spec.

`isNew` is unaffected — `readOnly` is false whenever `profile` is null, so the create form keeps every control live.

## edzoi-profil  [DEVIATES] — 3 remaining

The screen's skeleton, anchor, header stack, chip row, bio clamp, section heading and post list all match the mockup now — the ring is a complete decorative frame (never a meter), the badge rides its lower-right, the `@handle` slot really does carry `Ellenőrzött edző`, the post rows are kind-tile + grey meta + title, and the gone/no-posts states read as the spec writes them. Two of the mockup's eleven blocks are still absent: the three summary tiles (block 6) and the full-width `Kapcsolatfelvétel` primary (block 9). Both are deliberately deferred in the component's docblock pending an owner decision on where the numbers come from and what the button does — but the spec's "what was merged awa

### frontend/src/features/marketplace/CoachProfilePage.tsx:150 — visual

**Built:** `{coach.city}` prints the value straight through. The backend selects `c.city_key AS city` (backend/src/public/visibility.js line 120) and `public_cities.key` is CHECK-constrained to lowercase ASCII (`key NOT GLOB '*[^a-z0-9-]*'`), so the caption row renders `Ellenőrzött edző · 📍 budapest`, and for the other seeded cities `pecs`, `gyor`, `nyiregyhaza`, `szekesfehervar` — slugs with the Hungarian accents stripped.

**Mockup:** `Ellenőrzött edző · 📍 Budapest` — the city's native name, properly capitalised and accented.

**Fix:** Map the key to its display name the way ProfileEditorPage.tsx line 280 already does: call `useTaxonomy()` (exported from ./usePublic, line 62) and resolve `taxonomy.data?.cities.find(c => c.key === coach.city)?.name`, falling back to `coach.city` while the taxonomy query is still in flight so the row never renders empty. The endpoint already serves the pair — backend/src/public/routes.js line 419 selects `name_native AS name` alongside `key` — and the query has a one-hour staleTime, so this costs at most one extra request per session.

### frontend/src/features/marketplace/PublicChrome.tsx:109 — visual
Shared: `PublicTopBar (frontend/src/features/marketplace/PublicChrome.tsx) — shared by /m, /m/p/:id and /m/c/:handle`

**Built:** `<Link to="/login" className={control({ variant: 'primary', shape: 'chip' })}>` — `primary` is the only filled-accent variant in the recipe (control.ts line 66-67: `bg-accent text-accent-fg shadow-[var(--shadow-glow)]`), so the `Belépés` pill renders as a glowing solid periwinkle button and is currently the loudest thing on the whole profile.

**Mockup:** `Belépés` is a translucent pill with a thin light border and white ink — a secondary control, the same weight as the back chevron beside it. Verified in both 09-edzoi-profil.webp and 11-marketplace-post-detail.webp, so all three public screens agree. The spec reserves the one filled control on this page for `Kapcsolatfelvétel`.

**Fix:** Change line 109 to `control({ variant: 'secondary', shape: 'chip' })`. That is the bordered translucent pill the mockup draws (control.ts lines 73-77: `border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1 text-text-1`) and it matches the back chevron's `variant: 'secondary'` on line 90. Do this together with adding `Kapcsolatfelvétel`, so the page ends up with exactly one primary rather than zero or two.

### frontend/src/features/marketplace/CoachProfilePage.tsx:179 — structural

**Built:** `{t(s.i18nKey, { defaultValue: s.key })}` where `s.i18nKey` is `public.specialty.strength`, `public.specialty.powerlifting`, `public.specialty.mobility`, `public.specialty.nutrition` (seeded in backend/src/db/migrations/021_public_marketplace.sql lines 174-188). Grepping hu.json, en.json and de.json for `specialty` returns exactly one hit each — `compose.reason.specialty_unknown` at line 823. The `public` namespace does not exist in any bundle, so every chip falls through to `defaultValue` and the Hungarian screen renders the raw English keys: `strength`, `powerlifting`, `mobility`, `nutrition`.

**Mockup:** One row of four Hungarian labels: `Erő`, `Erőemelés`, `Mobilitás`, `Táplálkozás`.

**Fix:** Add a nested `public.specialty.*` block to all three of frontend/src/i18n/hu.json, en.json and de.json, covering all fourteen seeded keys.

Nesting matters: i18next is initialised in frontend/src/i18n/index.ts with the default keySeparator '.', and check-i18n.mjs flattens bundles with the same assumption. Write it as a real nested object

  "public": { "specialty": { "strength": "...", ... } }

not as a flat `"public.specialty.strength"` top-level key. (The bundle does contain flat dotted `achievement.*` keys, so the wrong shape is an easy mistake to copy.)

All fourteen keys, not just the mockup's four — any coach can select any of them, and an unwritten key renders its own English slug. Hungarian:
strength Erő · hypertrophy Izomtömeg · powerlifting Erőemelés · olympic_lifting Súlyemelés · endurance Állóképesség · running Futás · mobility Mobilitás · rehabilitation Rehabilitáció · nutrition Táplálkozás · weight_loss Fogyás · prenatal Kismama · senior Szenior · youth Ifjúsági · calisthenics Saját testsúlyos

en.json and de.json must receive the same fourteen keys with English/German labels in the same commit — check-i18n.mjs compares flattened key sets across bundles and fails the build on any asymmetry.

Second call site: frontend/src/features/compose/ProfileEditorPage.tsx line 390 (path is features/compose, not features/marketplace as originally stated) reads the same keys, so the one bundle edit fixes both screens; no component change is needed at CoachProfilePage.tsx:179 — the `defaultValue: s.key` fallback is correct defensive behaviour for a DB-driven taxonomy and should stay.

Also update the prose count in frontend/DESIGN.md lines 28 and 456, which currently say "777 keys × hu/en/de"; adding fourteen keys makes it 791. The number is prose only — check-i18n.mjs does not hardcode it — but leaving it stale makes the document lie about its own gate.

## compose-post-editor (/compose/posts/:publicId)  [CLOSE] — 6 remaining

The screen's skeleton now matches the mockup: the cover really is a full-width hero in the top third with the icon/accent-label/alt/action caption row under it, the save moved out of the action row into the header as a secondary control so `Közzététel` is the only filled primary, the autosave line carries a clock time, the stale conflict is a Sheet, and the preview card, event-date field, metadata line and quota line are all gone. `Címkék` is correctly absent — the spec permits the row to come out and the backend has no post tags. What remains is one structural item and a handful of missing copy. The `Típus` block still prints a sentence where both mockups show the three-segment control with

### frontend/src/features/compose/PostEditorPage.tsx:453 — visual

**Built:** The `Cím` field passes `aria-required` only. Its label row shows the bare word `Cím`; the inline comment at lines 448–452 records the visible marker as blocked on a missing string.

**Mockup:** The label row reads `Cím` on the left and `Kötelező` in grey caption type against the field's trailing edge (unambiguous in the light mockup, where it sits flush right above the input).

**Fix:** Add a `required` string to the compose namespace in all three bundles — `check-i18n.mjs` requires identical key sets, so hu.json `"required": "Kötelező"`, en.json `"required": "Required"`, de.json `"required": "Pflichtfeld"`, alongside the existing `compose.optional` — then pass `marker={t('compose.required')}` on the `Field` at line 453. `Field` already lays the marker out right-aligned on the label row and ties it into `aria-describedby`; keep `aria-required` as well.

### frontend/src/features/compose/PostEditorPage.tsx:546 — visual

**Built:** The saved autosave line renders check glyph + `Mentve` + `14:07` — `compose.autosave.saved` is the single word "Mentve".

**Mockup:** The line reads `Automatikus mentés · Mentve 14:07`. The leading phrase is what tells the coach WHY there is no save button on the screen; without it the row is just a timestamp.

**Fix:** Either change `compose.autosave.saved` to `Automatikus mentés · Mentve` (en: `Autosave · Saved`, de: `Automatisches Speichern · Gespeichert`) so the existing `<span className="tnum">` time still follows it, or add a separate `compose.autosave.label` (`Automatikus mentés`) and render it plus a `·` separator ahead of the state word at line 546. Keep the state word last so the `.tnum` time stays adjacent to `Mentve`.

### frontend/src/features/compose/PostEditorPage.tsx:621 — visual

**Built:** The lifecycle section renders a caption only in the withdrawn state (`post.deletedAt !== null` → `compose.restoreKeepsPosition`). In the normal published/draft state the `Közzététel` + `Levétel` row is followed by nothing.

**Mockup:** A grey caption sits directly under the button row: `A levétel bármikor visszavonható.` It is the sentence that makes taking a post down feel safe, and the spec's Blocks list names it as part of the lifecycle row.

**Fix:** Add `compose.withdrawUndoable` to hu/en/de (`"A levétel bármikor visszavonható."` / `"Taking it down can be undone at any time."` / `"Das Zurückziehen lässt sich jederzeit rückgängig machen."`) and render it as the else branch of the existing ternary at lines 621–623, so exactly one caption shows in either state: `{post.deletedAt !== null ? <p …>{t('compose.restoreKeepsPosition')}</p> : <p className="text-caption text-text-3">{t('compose.withdrawUndoable')}</p>}`.

### frontend/src/features/compose/PostEditorPage.tsx:484 — polish

**Built:** The body character counter is a plain `<span>` in the `flex flex-col` body group, so it sits flush LEFT under the textarea.

**Mockup:** `19 431 karakter maradt` is right-aligned, flush with the textarea's trailing edge — deliberately different from the title counter (`128 karakter maradt`), which the mockup does leave flush left under the input.

**Fix:** Add `self-end` to the counter span's class list at line 485: `cn('text-caption self-end', limits ? COUNTER_CLASS[...] : 'text-text-3')`. Leave the `Field` hint counter on the title alone.

### frontend/src/features/compose/PostEditorPage.tsx:469 — polish

**Built:** The pencil tile beside the `Szöveg` label is `size-8` (32px), while the image tile in the cover caption row (line 351) is `size-11` (44px). The two accent tiles on the same screen are different sizes.

**Mockup:** Both mockups draw the pencil tile and the cover's image tile at the same size, and the pencil tile visibly matches the field height rather than sitting smaller than the label text beside it.

**Fix:** Change `size-8` to `size-11` on the span at line 469 so it matches the cover tile at line 351, and keep `size-icon-s` on the `Pencil` glyph or step it to `size-icon-m` to match the `ImageIcon` at line 353.

### frontend/src/features/compose/PostEditorPage.tsx:358 — polish

**Built:** When a cover exists with no alt text, the caption row's description slot falls back to `compose.coverAltHint` — the sentence `Mit ábrázol a kép? Aki nem látja, ezt fogja hallani.` renders in grey under the accent `Borítókép` label, as if it were the image's description.

**Mockup:** That slot holds the image's own alt text (`Súlyzós terem reggeli fényben`). A question addressed to the coach reads as broken copy where a description belongs, and it silently hides the fact that this cover has no alt text at all.

**Fix:** Give the empty case its own string rather than reusing the upload field's hint — add e.g. `compose.coverAltMissing` (`Nincs képleírás`) to hu/en/de and use it at line 358: `{cover.alt || t('compose.coverAltMissing')}`. Use `||` not `??` so an empty-string alt is caught too.

## onboarding  [CLOSE] — 6 remaining

The screen is recognisably the mockup now: the step ring replaced the hairline bar and inherited the full progressbar semantics, the icon holders, the required `*`, the radio circle, the −/+ stepper, the green validity tick, the always-rendered outlined `Vissza`, the restored save-error line, `exp.none` and `session_minutes` are all in place, and `ScreenSkeleton` is the load branch. What is left is one missing block and one tone decision. Block 6 — the calendar holder plus `Hetente hány edzés? *` as a heading — is not rendered at all: the question survives only as `Field`'s 13px grey label with the calendar buried in the input's leading slot, and the required `*` is invisible there. `Field.l

### frontend/src/features/onboarding/OnboardingPage.tsx:520 — visual

**Built:** Inside the ring, under the `2`, the second line reads `/ 5` in `text-body-s tabular-nums text-text-2` — a fraction denominator hanging off a numeral that has no numerator beside it.

**Mockup:** The caption inside the ring reads `5 lépésből` — a word, not a fraction. Spec Anchor names it explicitly: "the caption `5 lépésből` beneath it *inside* the ring".

**Fix:** Add a key (e.g. `onboarding.stepsTotal` = `{{total}} lépésből` / `of {{total}} steps` / `von {{total}} Schritten`) to hu/en/de — `check-i18n` requires all three — and render `{t('onboarding.stepsTotal', { total: STEPS.length })}` in place of `/ {STEPS.length}`. The span stays `aria-hidden`; the announced sentence is still `onboarding.stepOf` on the progressbar wrapper.

### frontend/src/app/navTabs.ts:66 — visual
Shared: `BottomNav / navTabs`

**Built:** The member home tab is `{ to: '/', icon: Home, labelKey: 'nav.home', end: true }` with no `owns`. On `/onboarding` the `end` flag makes `pathname === '/'` false and no other tab prefix-matches, so `isActive` (BottomNav.tsx:75) is false for all five cells — the bar renders entirely idle and emits no `aria-current` anywhere.

**Mockup:** KEZDŐLAP is lit in the bar in both mockups, and the spec's Navigation section states it: "Member bar, five tabs, `Kezdőlap` shown active".

**Fix:** Add `owns: ['/onboarding']` to the `to: '/'` tab in all three role tables (lines 66, 73, 83) — the same mechanism `/library` and `/compose` already use. That lights the tab and restores a real `aria-current="page"` without changing where the tab navigates.

### frontend/src/features/onboarding/OnboardingPage.tsx:800 — visual

**Built:** `flex items-center justify-between gap-group` with two content-width `Pressable`s: `Vissza` and `Tovább` are each roughly 110px on a 390px viewport, pinned to the far edges with about 150px of dead space between them.

**Mockup:** The two buttons split the footer row — each about 42% of the screen width with one gap between them, so the pair reads as one bar and the primary is a large target rather than a small pill in the corner.

**Fix:** Give both footer `Pressable`s `className="flex-1"` (or put `flex-1` on wrappers) and keep `gap-group`; `justify-between` then becomes redundant. The 44px floor and the disabled-on-step-one behaviour are unaffected.

### frontend/src/i18n/hu.json:371 — polish

**Built:** `onboarding.step.schedule.body` = "Az őszinte szám a jó szám. Ehhez igazítjuk a terjedelmet." — two sentences, so the centred subtitle wraps to two lines under the title. `en.json` ("It sets the volume.") and `de.json` ("Sie bestimmt den Umfang.") carry the same second clause.

**Mockup:** One short centred line: `Az őszinte szám a jó szám.` The spec records the trim under "What was merged away": "The subtitle lost its second clause."

**Fix:** Trim the second sentence from `onboarding.step.schedule.body` in hu.json:371 and the matching keys in en.json and de.json. Nothing else reads the key, and the volume explanation already lives on `onboarding.sessionMinutesHint`.

### frontend/src/features/onboarding/OnboardingPage.tsx:316 — polish

**Built:** Both stepper buttons use `shape="icon"`, which is `rounded-chip px-0` — and `--radius-chip` is `--radius-full`, so `−` and `+` render as two 44px circles beside a 12px-radius rounded-rectangle field.

**Mockup:** The `−` / `+` buttons are rounded squares whose corner radius matches the field they sit next to, so the three boxes read as one row of controls.

**Fix:** Add `className="rounded-field"` to the two stepper `Pressable`s (lines 316 and 325). It is a token class, so the radius gate stays green, and `shape="icon"` keeps the square 44×44 min-width.

### frontend/src/features/onboarding/OnboardingPage.tsx:596 — polish

**Built:** The sessions `NumberRow` is given no `hint`, so nothing renders under the field — the next thing below the input is 32px of section gap and the `Egy edzés hossza (perc)` field, which is the one carrying the "…ebből számoljuk a terv terjedelmét" line.

**Mockup:** A hint line sits directly beneath the numeric field (spec block 7), explaining what the number is used for before the eye moves on.

**Fix:** Add a distinct `onboarding.sessionsPerWeekHint` in hu/en/de saying why the weekly count is asked (voice rule §6.5) — not a copy of `sessionMinutesHint`, which now belongs to the field below — and pass it as `hint` on the sessions `NumberRow`. `NumberRow` already renders and wires `hint`/`hintId`.

## piacteri-pult (/compose)  [CLOSE] — 6 remaining

Every block the spec names is present, in order, with the right anchor: identity row with a real (sheet-opening) status pill, h1, one portfolio card holding the four-arc donut + four-entry legend + quota caption + fill bar, the posts header with its kind tile and single accent-filled + Új bejegyzés, three chips plus a Több overflow, and two-line icon rows with a success tint and check badge on live ones. The ladder renders at most one card, the takedown card carries no button, the loading skeleton matches the real geometry, and the EDZŐ tab owns /compose so the bar lights. Six things are still off: the donut's centre caption prints the section heading ("Bejegyzések") instead of the unit the 

### frontend/src/features/compose/ComposePage.tsx:313 — visual

**Built:** The caption under the donut's number renders t('compose.posts') = "Bejegyzések" — the plural, capitalised section heading, reused as the unit label. The screen therefore reads "18 / Bejegyzések" in the anchor and "Bejegyzések" again as the h2 forty pixels below.

**Mockup:** The mockup sets "18" over the lowercase singular "bejegyzés", and the spec's Anchor section names the word verbatim: "the total set very large and tabular in the middle (18) over the word bejegyzés". Hungarian counts take the singular, so "18 bejegyzések" is also wrong grammar.

**Fix:** Add a unit key (e.g. hu.json compose.postsUnit = "bejegyzés", en "posts", de "Beiträge") and use it for the donut centre only: <span className="text-body-s text-text-2">{t('compose.postsUnit')}</span>. Leave t('compose.posts') on the h2 (line 363) and on the Gauge's aria label (line 296), where the plural heading is correct.

### frontend/src/features/compose/ComposePage.tsx:193 — visual

**Built:** The page column is `flex flex-col gap-section py-6`, so 32px sits between the identity row and the h1, between the h1 and the portfolio card, and between the card and the posts section — the same step everywhere. Measured against the token stack (44 row + 32 + 32 h1 + 32 + ~306 card + 32 + 44 header + 16 + 44 chips + 16), the first post row starts ~600px down; rows are 78px + 8px gaps, and --content-pad-b reserves --nav-h 64 + safe inset + 16. On a 852px viewport the second row is already clipped and the third never appears.

**Mockup:** The mockup's header stack is tight — the identity row, the title and the card read as one header group, roughly a group-sized gap apart, not a section gap — and it caps the list at three post rows with the third deliberately half-visible above the bar. The spec makes that explicit: "the next row is deliberately half-visible — the scroll affordance is the clipped card, not a scrollbar."

**Fix:** Split the stack: keep `gap-section` only between the portfolio card and the posts <section>, and wrap the identity row + h1 + ladder card + portfolio card in an inner `flex flex-col gap-group` div. That returns ~32-48px, which is what the mandated fourth legend entry (the legend now wraps to two lines, +32px on the card) took away after the Gauge was already shrunk from size-56 to size-40 for exactly this budget. Do not buy the space back by shrinking the gauge again or by dropping the fourth legend entry — the spec's warning requires all four arcs named.

### frontend/src/features/compose/ComposePage.tsx:366 — visual

**Built:** `+ Új bejegyzés` is `control({ variant: 'primary', density: 'compact' })` and is always rendered, while the gate ladder above it also renders a filled accent primary — `Elfogadom ({version})` at line 251 (Pressable variant="primary") and `Profil létrehozása` at line 280 (control({variant:'primary'})). In the guidelines and no-profile states two filled accent buttons sit in one scroll view, roughly one card apart.

**Mockup:** The mockup spends the screen's single accent fill on `+ Új bejegyzés` alone; every other control is outlined or a wash. DESIGN.md §5.1: primary is "the ONE primary action on the screen — two primaries on a screen means neither is." The same reasoning is already written into this file's SELECTED_CHIP comment, which demoted the selected filter chip off `primary` for exactly this reason.

**Fix:** While a ladder card is on screen, demote the standing action: `const blocked = blocker !== null && blocker !== 'publish';` then render the link as `control({ variant: blocked ? 'secondary' : 'primary', density: 'compact' })`. The gate CTA is the one thing the coach must do next, so it keeps the fill; drafting stays reachable as a secondary. Do not demote the ladder CTAs instead — a gate card whose only action is outlined stops reading as the thing to resolve.

### frontend/src/features/compose/ComposePage.tsx:217 — polish

**Built:** The status pill overrides `secondary`'s resting colours (`border-[var(--success-border)] bg-success-subtle text-success`) but not its hover pair. `secondary` ships `hover:border-[var(--surface-border-strong)] hover:bg-surface-2`, twMerge has nothing to conflict them with, so pointing at the live pill drops the success tint and it turns into a plain grey chip.

**Mockup:** The pill is the one thing on the screen that reports whether the profile is live; the mockup draws it as a distinct tinted state. A tint that disappears under the pointer reads as "you are about to turn this off" on a control that merely opens a sheet.

**Fix:** Add the hover half to the same conditional: `isLive && 'border-[var(--success-border)] bg-success-subtle text-success hover:border-[var(--success-border)] hover:bg-success-subtle'`. This is the identical trap the SELECTED_CHIP constant at line 108 already documents and handles.

### frontend/src/features/compose/ComposePage.tsx:386 — polish

**Built:** The check on the selected chip is passed as Pressable's `icon` prop, and Pressable renders `{icon}{children}` — so the chip reads "✓ Mind", with the glyph leading the label.

**Mockup:** The mockup draws "Mind ✓": the label first, the check trailing it, which is what makes the chip read as a label that has been ticked rather than as an icon button.

**Fix:** Drop the `icon` prop and put the glyph after the label in children: `<Pressable …>{t(`compose.state.${s}`)}{state === s ? <Check className="size-icon-s" aria-hidden /> : null}</Pressable>`. `control`'s base is `inline-flex … gap-2`, so the spacing is unchanged.

### frontend/src/features/compose/ComposePage.tsx:462 — polish

**Built:** The empty branch is reached whenever `posts.data.posts` is empty, including when a filter chip is active, and it always prints compose.noPostsTitle / compose.noPostsBody — "Még nincs bejegyzésed" / "Írj egy piszkozatot…". Select `Élő` on a desk with no live posts and the screen says the coach has none while the donut directly above reads 18.

**Mockup:** The spec's Empty post list state is the no-posts-at-all case ("The donut renders 0 rather than disappearing"), which is the only case that copy is true for. A screen contradicting its own anchor in one view is worse than a bare list.

**Fix:** Branch on the filter: when `state !== 'all'` (or when `counts.total > 0`), render an EmptyState with filter-specific copy — a new key pair such as compose.noPostsInFilterTitle ("Ebben a nézetben nincs bejegyzés") / compose.noPostsInFilterBody, and pass `action` as a Pressable that resets the chip to `all`. Keep the existing copy for the genuinely empty desk.

## login  [CLOSE] — 6 remaining

Structurally the screen now matches the mockup. Every block the spec lists top-to-bottom is present and in order: oversized accent disc with a dumbbell and a separate outer ring (a real circle — `--radius-chip` is `--radius-full` in every pack except Mono), Display-type app name from `useAppName()` with `min-h-10` so the column cannot jump, muted subtitle, glass form card holding label-above-input e-mail and password fields with leading envelope/lock glyphs, a `role="alert"` error banner with icon, one full-width accent-filled primary, the switch line using its own keys, and the language pill. The two rows the mockup draws that the code omits — `Elfelejtetted a jelszavad?` and the legal foot

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/ui/nav/LanguageToggle.tsx:34 — visual
Shared: `LanguageToggle`

**Built:** The active chip renders only the locale label — `{LOCALES[code].label}` — so it reads `Magyar` with nothing beside it. Selection is carried by fill colour alone.

**Mockup:** The active chip reads `Magyar ✓` — the native name followed by a check glyph inside the same filled pill. Spec block 6 names it explicitly: "`Magyar` (active, with a check glyph)".

**Fix:** Render a check after the label when `active`: pass `icon` or append `{active ? <Check className="size-icon-s" aria-hidden /> : null}` after `{LOCALES[code].label}` in the Pressable body (lucide `Check`, same import the auth page already uses). `aria-pressed` already carries the state for assistive tech, so the glyph is `aria-hidden` decoration — do not add a second label.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/auth/AuthPage.tsx:112 — visual

**Built:** `busy` is passed only to the submit Pressable (line 177), which disables that one button. The `Surface as="form"` wrapper is untouched, so while the login mutation is in flight the e-mail and password inputs stay editable and the reveal toggle stays live.

**Mockup:** Spec block 4 and the States section both say the busy state "makes the whole form inert" / "The whole form is inert for the duration."

**Fix:** Gate the whole form on `busy`: add `inert={busy || undefined}` and `aria-busy={busy || undefined}` to the `<Surface as="form">` at line 112 (or wrap the field group in a `<fieldset disabled={busy} className="contents">`). The button keeps its own `busy` prop for the label/announcement.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/auth/AuthPage.tsx:129 — polish

**Built:** The e-mail success mark is a bare lucide `Check` tinted `text-[var(--success)]` — a green tick floating on the field fill, no container.

**Mockup:** A filled green disc roughly 24px across with a dark check drawn inside it, sitting at the field's trailing edge. The catalog component the spec points at (E7 `FeedbackField`) also draws its verdict inside a round badge (`size-8 rounded-full border`, E7Field.tsx:428), so the badge shape is the defined treatment, not an image-model flourish.

**Fix:** Wrap the glyph in the disc: inside the existing 44px trailing box render `<span className="flex size-6 items-center justify-center rounded-full bg-success text-on-success"><Check className="size-icon-s" strokeWidth={3} aria-hidden /></span>`. Both `bg-success` and `text-on-success` already exist as theme colours (tokens.css:794, :797). Keep the `sr-only` text and the format-check-only semantics unchanged.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/features/auth/AuthPage.tsx:155 — polish

**Built:** The reveal toggle shows the plain `Eye` glyph while the password is masked and `EyeOff` once revealed — `{revealed ? <EyeOff/> : <Eye/>}`.

**Mockup:** The password row is masked (dots) and the trailing glyph is the slashed eye — `EyeOff` — i.e. the glyph reports the CURRENT state (hidden) rather than the action.

**Fix:** Swap the two branches at lines 155-159 so masked renders `EyeOff` and revealed renders `Eye`. Leave the `aria-label` mapping as it is (it correctly names the ACTION: `showPassword` when hidden), and leave `aria-pressed={revealed}` alone — the label and the glyph are deliberately answering different questions.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/ui/nav/LanguageToggle.tsx:26 — polish
Shared: `LanguageToggle`

**Built:** Inactive chips use `variant="ghost"`, which has no border and no fill (control.ts:78) — `English` and `Deutsch` render as bare words inside the container pill.

**Mockup:** All three chips are pill-shaped objects: the active one filled accent, the other two outlined with their own visible border inside the bordered container. The row reads as three chips, not one chip and two labels.

**Fix:** Use `variant={active ? 'primary' : 'secondary'}` at line 26. `secondary` already carries `border-[length:var(--border-width)] border-[var(--surface-border)]` plus the surface-1 fill and the hover edge, which is exactly the outlined pill the mockup draws.

### C:/Users/Petike/Documents/Cursor/tracker/frontend/src/ui/primitives/Pressable.tsx:40 — polish
Shared: `Pressable`

**Built:** `busy` sets `aria-busy` and `disabled` and nothing else — the body still renders `{icon}{children}`, so a busy `Belépek` is just a dimmed button with its label still on it. `control.ts:48` adds only `pointer-events-none` and `cursor-progress`.

**Mockup:** Spec block 4: the busy state "keeps the button's size, swaps the label for a spinner". The catalog's own E1 machine does this (E1Button.tsx swaps the leading glyph for `Loader2`), so the intended behaviour is defined — the plain primitive the login screen is told to use just never got it.

**Fix:** In Pressable, when `busy` is true render a spinner in place of the children while holding the box: keep the children in the flow with `invisible` and overlay `<Loader2 className="absolute size-icon-m animate-spin" aria-hidden />` (the recipe base is already `relative`). That preserves the no-layout-shift requirement without every call site hand-rolling it.

## marketplace-post-detail (/m/p/:publicId)  [DEVIATES] — 5 remaining

The screen is substantially rebuilt and most of the block list now lands: public top bar, cover anchor, meta row without the event time, display-size h1, the bordered tap-through coach row with badge and chip, icon-led list rows inside DocRenderer, the price card with the FULL disclaimer string, and a skeleton in the new geometry. One whole block is still missing — the three-up summary tile row (spec block 6) — and its data, capacity, is still sitting in the meta row that the spec explicitly emptied, so the "what does it cost me in commitment" question is not answered above the fold at all. Beyond that: the cover has no play overlay, DocRenderer's h2 is not icon-led, the top bar's Belépés is

### frontend/src/features/marketplace/PostPage.tsx:68 — visual  **REGRESSION**
Shared: `EmptyState (frontend/src/ui/feedback/EmptyState.tsx:92) — the full-width action is correct for the controls it was added for; the fix belongs at this call site.`

**Built:** The gone/error state's action is a bare `<Link className="text-body-s flex min-h-[var(--target-min)] items-center gap-tight text-accent">`. EmptyState now wraps the action in `mt-5 w-full [&>*]:w-full` (ui/feedback/EmptyState.tsx:92), so this Link is stretched to the full column width; being `display:flex` with no justify-content it packs the arrow and 'Vissza a piactérre' hard against the left edge, under a centred mark, centred h1 and centred body.

**Mockup:** One centred action beneath a centred empty-state column. Before today the wrapper was a plain `<div className="mt-5">` inside `flex flex-col items-center`, which shrink-wrapped and centred it.

**Fix:** Add `justify-center` to the Link's className on line 68. Controls built from `control.ts` already carry `justify-center` in the recipe base, which is why only the hand-rolled links are affected — CoachProfilePage's gone state has the identical shape and needs the same word.

### frontend/src/features/marketplace/PostPage.tsx:89 — visual

**Built:** The cover renders as a bare <img> (lines 89–100). No overlay of any kind; the file comment at lines 26–28 states the omission is deliberate because the product has no video player.

**Mockup:** One bold circular play button centred on the cover — a filled accent disc with a white triangle in both the dark and light images. The spec names it three times: in Anchor, in block 2 ('with the play overlay on top') and in Components → Genuinely new ('the play overlay on the cover'), and it is not listed among the deliberate cuts in 'What was merged away, and why'.

**Fix:** Either draw it — wrap the img in a `relative` container and centre an absolutely-positioned accent disc on it — or, if the 'no video player' argument stands, move that reasoning out of the component comment and into the spec's 'What was merged away, and why' section so the mockup stops asking for it. As written the code and the design of record disagree in the one place a cold visitor's eye lands first, and nothing outside the source file records which one won.

### frontend/src/features/marketplace/DocRenderer.tsx:158 — visual
Shared: `DocRenderer (frontend/src/features/marketplace/DocRenderer.tsx) — shared with the coach profile bio; fix it there once.`

**Built:** A level-2 heading renders as a plain `<h2 className="text-title-2 mt-2 text-text-1">` with no glyph.

**Mockup:** `Kinek szól?` is an icon-led h2 — a target/bullseye glyph in a tinted rounded holder sits to the left of the heading text. Spec block 8 says 'an icon-led h2, then three icon-led rows'. The rows got their holder; the heading did not, so the section it opens has less visual entry point than the sentences beneath it.

**Fix:** Wrap the h2 in a `flex items-center gap-tight` row with a `TileHolder size="sm"` glyph, the same holder CoachProfilePage.tsx:190 already uses beside its own section h2 ('the same holder the post rows below use, not a second hand-built copy of it'). The node grammar carries no per-heading icon, so pick one glyph for h2 in the renderer rather than authoring it per post — one shared answer beats a second markup path in PostPage, which is the thing the spec's third warning forbids.

### frontend/src/features/marketplace/PublicChrome.tsx:109 — polish
Shared: `PublicTopBar (frontend/src/features/marketplace/PublicChrome.tsx:80) — shared by all three public routes, so this needs a prop rather than a call-site className.`

**Built:** `Belépés` renders as `control({ variant: 'primary', shape: 'chip' })` — a filled accent pill with the glow shadow, identical on all three public routes.

**Mockup:** On this screen Belépés is quiet: a dark bordered pill in the dark image, plain accent-free text in the light one. The filled accent pill belongs to /m (08-piacter.webp draws it filled) because there the login is the only call to action; here the mockup's filled accent is spent on Jelentkezem, and the top bar steps back. With Jelentkezem correctly not drawn, the loudest control on a post detail page is currently a login pill in the corner.

**Fix:** Give PublicTopBar a `cta` prop — `'primary' | 'secondary'`, defaulting to 'primary' so /m is unchanged — and pass `cta="secondary"` from PostPage.tsx:86 and its skeleton/gone-state siblings (lines 59, 215). DESIGN.md:287 reserves the filled accent for the one primary action on a screen; on this screen that is not the login.

### frontend/src/features/marketplace/PostPage.tsx:105 — polish

**Built:** The meta row is a flex row of spans separated by `gap-tight` only — `Program  Szeged  2026. 09. 12.` with whitespace between the groups.

**Mockup:** Middle dots between the groups: `Program · Szeged · 2026. 09. 12.` The dot is what stops the pill, the city and the date reading as three unrelated fragments when the row wraps.

**Fix:** Insert an `aria-hidden` `·` span between the rendered groups — only between present ones, since the city, date and pill are each conditional. PublicChrome.tsx:58 already owns this rule for the card meta line ('the separator belongs to the pair it sits between, and a `·` rendered next to an absent city is the shape that leaves a meta row starting with a dot'); this row needs the same behaviour with the icons kept.

## admin-elem-stilus-studio  [DEVIATES] — 6 remaining

The skeleton is right and matches the spec's block order: eyebrow + h1 + intro, a hero preview Surface as the anchor in the top third, a horizontally scrolling element rail (a real radiogroup), a palette-tile section header, one stacked row-card per variant with stage / label / commit button, the toast, and a seven-tab bottom bar with ADMIN lit. The three things the 79-fix pass touched here are all correct now (lowercase state chips, full-width rule under the variant label, accent as the single meaning of "active" with green left to the toast), and the nav clamp and the cn() type-scale defect no longer affect this screen.

What is still open is almost entirely the one piece of work the spec'

### frontend/src/features/admin/StyleStudioPage.tsx:209 — visual

**Built:** The palette tile is followed by `<h2 className="text-title-3 truncate text-text-1">{entry.name}</h2>` plus a `{entry.id}` caption underneath — so the section header reads "Button" / "E1", repeating the identity the hero label two blocks above already states.

**Mockup:** The palette tile sits beside a single h2 reading "Változatok". The element's identity is the hero's job ("GOMB · E1"); this header names the section that follows it. Spec block 5: "a palette icon tile and the h2 `Változatok`".

**Fix:** Add `studio.variants: "Változatok"` (en: "Variants", de equivalent) and render `{t('studio.variants')}` as the h2 at line 209. Drop the `{entry.id}` caption at line 210 with it; keep the inert chip at lines 212-216 in the same row, since the spec's inert state owes a marker beside this heading.

### frontend/src/features/admin/StyleStudioPage.tsx:116 — visual

**Built:** The hero stage renders `<Demo id={entry.id} />` bare inside `grid min-h-32 place-items-center`. The variant rows at line 258 render the identical `<Demo id={entry.id} />`, so the live component on the anchor is exactly the same size as the five thumbnails below it — the hero is distinguished only by having more empty space around it.

**Mockup:** The hero's Mentés button is drawn markedly larger than the demo instances inside the variant-row stages (roughly half again as wide and tall, with visibly larger label type), filling the middle of the stage. The spec's Anchor section: "drawn several times the size of an ordinary control", and gives the reason — "these variants are differences in motion, and a small demo of a sheen sweep is a rectangle that flickers".

**Fix:** Scale the hero instance up rather than the component: wrap line 115-117's `VariantOverride` in a `<div className="origin-center scale-150">` (or a token-driven equivalent) and raise the stage from `min-h-32` to something that fits the scaled control without clipping. Scaling the wrapper keeps the demo the real, pressable component the spec insists on rather than a second sized variant of it.

### frontend/src/features/admin/StyleStudioPage.tsx:168 — visual

**Built:** The 32px holder above each chip's label carries the element's currently active variant LETTER (`styles.data?.styles[e.id] ?? '·'`, line 175), or an EyeOff glyph for the three inert elements. No chip shows anything that identifies what the element IS.

**Mockup:** Each chip carries a small glyph of its own element above the label — a hand-tap glyph on "E1 Gomb", a toggle switch on "E4 Kapcsoló", a card outline on "E12 Kártya". Spec block 4: "Each chip carries a small glyph of its own element." The spec's inert-state note assumes this slot is taken by the element glyph, which is why it asks for "their own muted treatment rather than dropping the signal" on inert chips instead of a crossed-out eye.

**Fix:** Add an icon per catalogue entry (a lucide map keyed by element id next to CATALOG, so catalog.ts itself stays parity-checked data) and render it in the holder at lines 168-179. Move the active-letter signal elsewhere on the chip or drop it — the hero and the active card already say which letter is live. Keep inert chips distinguishable by muting the whole chip (text-text-3 plus a quieter holder), as the spec asks.

### frontend/src/features/admin/StyleStudioPage.tsx:152 — visual

**Built:** The selected chip is `variant="secondary"` (control.ts line 73: `bg-surface-1 text-text-1` plus a border) with `border-accent` added at line 160; unselected chips are `ghost` (no background) with a `--surface-border` edge. In dark mode a surface-1 fill against the page behind a ghost chip is a near-invisible difference — the accent hairline is doing all the work of showing which element is selected.

**Mockup:** The selected "E1 Gomb" chip is drawn with an inverted fill — a near-white panel with dark ink — inside its accent border, unmistakable against the three dark unselected chips beside it. Spec block 4: "selected: inverted fill, accent border, glyph above the label".

**Fix:** At line 152 give the selected chip a filled treatment instead of `secondary`: either pass control's `selected` variant (`bg-accent-subtle text-on-accent-subtle`, which also fixes the hover-reverts-to-surface-2 problem) or an inverted surface token, and keep the `border-accent` override from line 160. Leave the unselected chips as they are.

### frontend/src/features/admin/StyleStudioPage.tsx:83 — visual

**Built:** The intro paragraph renders `studio.intro`, which in i18n/hu.json line 882 is two sentences: "Minden elem öt változata, élő komponenssel. Amit itt kiválasztasz, az a következő betöltésnél minden felhasználónál érvényes lesz — kódmódosítás és újratelepítés nélkül." On a phone that wraps to three or four lines above the fold, pushing the anchor down.

**Mockup:** One line under the h1: "Minden elem öt változata, élő komponenssel." — and nothing else before the hero card.

**Fix:** Cut `studio.intro` back to the single sentence in all three bundles. The cut sentence must not simply vanish: the spec requires the every-user/next-load consequence to sit "where the consequence is, next to or inside the confirmation". Add it as a new key rendered beside the commit buttons (a one-line hint under the variant list, or in the confirmation copy) rather than deleting it outright.

### frontend/src/features/playground/PlaygroundPage.tsx:106 — visual
Shared: `Demo / PREVIEWABLE (frontend/src/features/playground/PlaygroundPage.tsx)`

**Built:** The E1 demo — the component on the hero stage and inside all five variant stages, i.e. the largest piece of text on this screen — renders the hardcoded English string "Save", with a Share2 icon beside it. The rest of the Demo harness is hardcoded English too ("Copied", "Demo toggle", "Demo field", "Interactive card", "Swipe me").

**Mockup:** The hero control reads "Mentés", centred, and so does every demo inside the variant stages. The spec's Anchor section names it outright: "one real, live, pressable `Mentés` button". DESIGN.md line 378: never hardcode visible text.

**Fix:** Route the Demo harness's visible strings through t() (a `playground.demo.*` block in hu/en/de.json), starting with `Save` -> "Mentés" at PlaygroundPage.tsx line 106. Shared file: this is the same Demo the playground renders, so fix it there rather than forking a studio-local copy — the whole point of the export is that the admin previews what ships.

## coach-chat  [DEVIATES] — 4 remaining

ChatPanel itself is now very close to the mockup — the anchor is a person, the name comes from `personLabel` (no e-mail), the day divider is locale-formatted, the meta line sits inside the bubble with `Kézbesítve`/`Olvasva`, `Letiltás` left the composer, report chips only paint on hover, and every state in the spec (empty, loading, failure, withdrawn, blocked, unavailable) is implemented verbatim. What has NOT happened is the change the spec exists for: the route `/coach/clients/:id/chat` does not exist. The conversation is still the fourth tab of `ClientDetailPage`, so the screen renders under a whole client-detail page — with a second monogram anchor and a second name above it, no `Kliense

### frontend/src/features/chat/ChatPanel.tsx:136 — visual

**Built:** The screen has no top bar of its own. `ChatPanel` opens with a bare `flex min-h-11 items-start justify-end` row holding only the `Letiltás` ghost chip, which lands inside the tab panel — roughly six blocks and a tablist below the page's `Klienseim` back link (ClientDetailPage.tsx:222-228). The left half of the bar is empty on this row, and the back link belongs to a different screen.

**Mockup:** One top bar across the top of the screen: a circular back button with a chevron plus the word `Klienseim` on the left, the outlined `Letiltás` chip with its block glyph on the right, on the same baseline. The spec puts `Letiltás` in a corner precisely so it is nowhere near the composer.

**Fix:** In the new route component, render a single `flex items-center justify-between` bar as the first child: on the left a `Link to="/coach"` with `ArrowLeft` + `t('coaching.title')` (already 'Klienseim'), on the right the existing `Letiltás` `Pressable`. Delete the placeholder row at ChatPanel.tsx:136-143 and pass the block/unblock handlers up, so the panel stops owning a bar it can only half draw.

### frontend/src/features/coaching/ChatTab.tsx:54 — visual  **REGRESSION**

**Built:** The thread is still a scrolling box inside a scrolling page: `ChatTab` caps the panel with `className="max-h-[60vh]"` and `ChatPanel`'s `<ol>` carries `overflow-y-auto` with a `min-h-32` floor (ChatPanel.tsx:179). Worse, the panel's own content — 44px chip row + 112px monogram + name + a 128px thread floor + label/textarea/footer — is taller than 60vh on a phone, and the capped element has no overflow rule of its own, so the composer and its counter render outside the cap and run into the page's bottom-nav padding.

**Mockup:** The thread runs in the page's own column from the chips down to the composer, with the composer and its footer sitting above the bottom bar. The spec: 'The bordered scrolling box with its own scrollbar and clipped top bubble is gone. The page scrolls; the thread does not scroll inside a box inside a page.'

**Fix:** Drop the `max-h-[60vh]` prop at ChatTab.tsx:54 when the panel moves to its own route, and let the route be a `flex min-h-[100dvh] flex-col` page whose `<ol>` is the flex-1 child — the `column-reverse` trick still pins it to the bottom without a cap. Keep `overflow-y-auto` on the `ol` only for the history above the fold; remove the `min-h-32` floor at ChatPanel.tsx:179, which only exists to survive the host cap that is going away.

### frontend/src/i18n/hu.json:658 — polish

**Built:** The composer footer's left slot reads `Enter küld, Shift+Enter új sor` (`chat.composeHint`, rendered at ChatPanel.tsx:292-294; same key at en.json:658 and de.json:658). The ChatPanel comment directly above it calls the string 'the plane-button affordance', so the copy and its own rationale disagree — and on a phone the on-screen return key inserts a newline, which the hint denies.

**Mockup:** `Küldés a repülő ikonnal` on the left, `41 / 4000` on the right. The spec's Composer footer block names that exact string.

**Fix:** Change `chat.composeHint` to 'Küldés a repülő ikonnal' (hu), 'Send with the plane icon' (en), 'Senden mit dem Flugzeug-Symbol' (de). The Enter/Shift+Enter behaviour stays (ChatPanel.tsx:257-262); it is a desktop shortcut, not the affordance the footer is describing.

### frontend/src/app/router.tsx:109 — visual

**Built:** `ChatPanel`'s only mount in the app is `ChatTab` (frontend/src/features/coaching/ChatTab.tsx:48), which is coach-only. `HomePage` neither imports `useConversations` nor links to any thread, so a client has no route into their conversation at all — the panel's 'ONE COMPONENT FOR BOTH SIDES' comment (ChatPanel.tsx:45) describes a second side that is never rendered.

**Mockup:** Not drawn in the image, but owed by the spec's States section: 'Role-gated — the client side reaches the same panel from Home with one conversation and no Klienseim back link; the coach side is the only one with the context chips.'

**Fix:** After the chat route exists, give the client an entry: on Home, when `useConversations()` returns the single conversation whose `coach_id` is set, render a row/link into the same chat route (or a `/chat` route resolving that one conversation). Reuse the same page component and gate the two coach-only pieces on role — the `Klienseim` back link and the context chip row.

## register  [DEVIATES] — 6 remaining

`/register` is rendered by `AuthPage mode="register"` (frontend/src/features/auth/AuthPage.tsx), and git shows that file was NOT part of the 79-fix commit (last touched in bcaad88 "Liquid glass…"), so the register-specific findings all still stand. What is right: the aurora backdrop, the brand hero circle with the halo ring and the server-configured wordmark (`useAppName`), the glass form card, the Hungarian copy on every visible string (`Létrehozom a fiókom`, `Van már fiókod?` + `Belépés`, `Hozz létre egy fiókot`), one filled primary in the form itself, and the switch link that navigates rather than submits. What is missing is exactly the structural difference the spec says makes `/register

### frontend/src/features/auth/AuthPage.tsx:177 — visual

**Built:** The submit Pressable is the last child INSIDE <Surface as="form" finish="glass"> (opened line 112, closed line 180), so the accent button sits on the glass card with only the card's gap-4 above it and the card's padding around it.

**Mockup:** The card ends after the requirement rows; the full-width accent button is its own block below the card, separated by the section step, edge-to-edge with the card rather than inset by its padding.

**Fix:** Move the Pressable out of Surface. Keep <form onSubmit> as the outer element (or lift the form element to wrap both) so the button still submits: e.g. <form onSubmit> containing <Surface as="div" …>fields</Surface> then the button, with gap-section between them.

### frontend/src/features/auth/AuthPage.tsx:119 — visual

**Built:** leading={<Mail className="size-icon-m" />} on the e-mail field and leading={<Lock className="size-icon-m" />} on the password field (line 144). Field.tsx:120 then insets the text by --target-min, so the value starts 44px in.

**Mockup:** Both inputs are plain: 'te@pelda.hu' and the password dots start at the input's normal left padding, with nothing on the leading edge. The only glyphs inside a field are trailing — the alert on the e-mail, the reveal eye on the password.

**Fix:** Remove both `leading` props. The labels 'E-mail' and 'Jelszó' already name the fields, and dropping the glyphs restores the left text inset the mockup shows.

### frontend/src/features/auth/AuthPage.tsx:155 — polish

**Built:** revealed ? <EyeOff/> : <Eye/> — while the password is masked (the default, and the state both mockups draw) the toggle shows a plain open eye.

**Mockup:** The masked field shows the CROSSED-OUT eye, in both the dark and the light mockup; the spec block calls it 'a crossed-out-eye reveal toggle'.

**Fix:** Swap the two branches: revealed ? <Eye/> : <EyeOff/>. Leave the aria-label mapping as it is — it already switches with state and stays correct.

### frontend/src/features/auth/AuthPage.tsx:85 — polish

**Built:** The main element starts with <AuroraBackdrop/> and then the centred column; there is no control above the hero. The only way back to /login is the 'Belépés' link at the bottom.

**Mockup:** A circular ghost icon button with a back chevron in the top-left, above the hero (dark mockup only; the light mockup has none). The spec's Navigation section lists it as one of the three ways off this screen.

**Fix:** Render a Pressable variant='ghost' shape='icon' with <ChevronLeft/> positioned top-left above the column (register mode only), navigating to '/login', with an aria-label from a new i18n key. It is dark-mockup-only framing, so it is the lowest-value item here — but it is a block the spec lists and the code does not have.

### frontend/src/features/auth/AuthPage.tsx:102 — polish

**Built:** <h1 className="text-display mt-4 min-h-10 text-center text-accent">{appName}</h1> — the wordmark is painted in --accent (#7C94ED in Midnight, orange/green/cyan in the other packs).

**Mockup:** 'Tracker' is rendered in the primary ink — white on dark, near-black on light — with the accent reserved for the submit button and the 'Belépés' link. Painting the wordmark accent puts a third accent-coloured element in the column and weakens the button's claim to being the accent thing.

**Fix:** Change text-accent to text-text-1 on the h1. The subtitle below it already uses text-text-2, which matches.

### frontend/src/features/auth/AuthPage.tsx:134 — polish

**Built:** error={errors.email && t('auth.errors.generic')} on the e-mail field and the same on the password field (line 162), so a malformed address or an empty password renders 'Nem sikerült a művelet. Próbáld újra.' under the input — a message about a failed network operation attached to a field the user simply mistyped.

**Mockup:** Field-level copy in the mockup is specific to the field ('Ezzel az e-mail címmel már van fiók.'). A generic 'the operation failed' sentence under an input tells the user nothing about what to change.

**Fix:** Add per-field validation keys (e.g. auth.errors.emailFormat 'Ez nem tűnik érvényes e-mail címnek.', auth.errors.passwordRequired 'Add meg a jelszavad.') in hu/en/de and map errors.email / errors.password to those instead of auth.errors.generic. Keep auth.errors.generic for the form-level failure only.

## notifications  [CLOSE] — 6 remaining

The structure now matches the mockup end to end: back-icon header with centred h1, the frozen bell anchor (tinted circle + dot badge + 48px numeral + caption), the full-width filled `Összes olvasottnak jelölése` above the list, type-mapped icon holders, unread rows with accent border/fill and a right-edge dot, the `KORÁBBIAK` history-icon divider, and read rows with a green check. No chevrons, no header pill, one primary, press state only on rows with `link_path`. What is left is copy and state: the anchor caption is missing its noun, the divider label is the wrong word, the bottom bar lights no tab at all on this route, and both the empty and error branches stack a second — larger — circled

### frontend/src/i18n/hu.json:670 — visual

**Built:** `notifications.unreadLabel` is "olvasatlan", so the line under the numeral reads just "olvasatlan" — an adjective with nothing to modify. Consumed at frontend/src/features/chat/NotificationsPage.tsx:295.

**Mockup:** The caption under the `3` reads "olvasatlan értesítés" — the numeral is the count, the caption names what is counted.

**Fix:** Change the value of `notifications.unreadLabel` to "olvasatlan értesítés" (and mirror it in the en/de bundles). No `{{count}}` — the numeral is already drawn above the line, which is what the existing comment at NotificationsPage.tsx:292-294 defends; that argument covers the interpolation, not the missing noun.

### frontend/src/app/navTabs.ts:66 — visual
Shared: `navTabs.ts / BottomNav`

**Built:** The member home tab is `{ to: '/', icon: Home, labelKey: 'nav.home', end: true }` with no `owns`. `end: true` stops `/` prefix-matching, and no other tab claims `/notifications`, so every cell in the bottom bar renders idle while this screen is open.

**Mockup:** The bottom bar shows KEZDŐLAP lit — accent pill behind the house glyph, accent label. The spec's Navigation section states it outright: "Member bar, five tabs, `Kezdőlap` active".

**Fix:** Add `owns: ['/notifications']` to the home tab in all three role arrays (user line 66, coach line 73, admin line 83), the same mechanism `/library` and `/coins` already use. Home keeps `end: true` for its own match; `owns` supplies the ownership.

### frontend/src/features/chat/NotificationsPage.tsx:338 — visual

**Built:** The empty branch renders `EmptyState icon={BellOff}` directly beneath the `BellAnchor`, which is itself already showing a struck-through bell at count 0. Two struck-through bells in tinted circles stack — and EmptyState's `inline` mark is `size-[120px]` (EmptyState.tsx:65) against the anchor's `size-28` (112px), so the duplicate is the LARGER of the two and the anchor stops being the anchor. The error branch at line 325 does the same, pairing the anchor's grey no-numeral bell with a second accent BellOff circle.

**Mockup:** There is one bell on this screen and it is the anchor. The spec's Empty state says the anchor renders at 0 with the struck-through bell and "the list is replaced by `Nincs értesítés` / `Ha üzenetet kapsz vagy változik a terved, itt jelenik meg.`" — the two strings replace the list, not a second mark.

**Fix:** In both branches drop the repeated glyph: render the title/body (and, for the error branch, the retry Pressable) as a plain centred text block under the anchor instead of a second `EmptyState` mark — e.g. a `flex flex-col items-center gap-tight py-12 text-center` div with `text-title-3 text-text-1` title, `text-body-s measure text-text-2` body, and the existing secondary retry button. If EmptyState is kept, it needs a mark-less mode; today `icon` is required (EmptyState.tsx:21).

### frontend/src/i18n/hu.json:671 — polish

**Built:** `notifications.earlier` is "Korábbi"; NotificationsPage.tsx:370 renders it `text-micro uppercase`, so the divider reads "KORÁBBI" — a singular adjective.

**Mockup:** The divider beside the history-icon holder reads "KORÁBBIAK" — the plural noun, "the earlier ones".

**Fix:** Change `notifications.earlier` to "Korábbiak" (the `uppercase` class supplies the casing; do not hardcode caps in the bundle). Mirror in the other bundles.

### frontend/src/features/chat/NotificationsPage.tsx:255 — polish
Shared: `control recipe (shape="icon" radius only)`

**Built:** The back control is `variant="ghost"`, which is `text-text-2` with no resting background (control.ts:78) — an invisible chevron until hover.

**Mockup:** The back control sits in a visible filled rounded holder to the left of the title, a lighter slab against the near-black ground, so it reads as a button at rest. `CoinsPage.tsx:91` already draws its back control this way.

**Fix:** Change `variant="ghost"` to `variant="secondary"` on the header Pressable, matching CoinsPage. (The holder's radius comes from `shape="icon"` → `rounded-chip`, which is `--radius-full` in Midnight; the mockup draws a rounded square, but that is the shared control recipe's shape token and not this screen's to change.)

### frontend/src/features/chat/NotificationsPage.tsx:170 — polish

**Built:** The row's body line uses `text-caption` (12/16/500) — the same step as the relative time on line 174. Preview text and metadata render identically sized, so the row has two ranks where it should have three.

**Mockup:** In the rows the preview line ("Szia! A tegnapi guggolásnál fájt a térdem a harm…", "Alsótest A · 4 nap · 7 napos ciklus") is visibly a step larger than the timestamp beside it ("12 perce", "3 órája") and sits just under the title in size; the timestamp is the smallest text in the row.

**Fix:** Give the body line `text-body-s` (13/18/400 — DESIGN.md's "dense secondary lines") and leave the timestamp on `text-caption` ("metadata under a thing: dates, counts, hints"). Title stays `text-body-strong`.
