# PATTERN-GAP

One work list, consolidated from six independent audit passes over the 73 patterns in
`C:/Users/Petike/Documents/Claude Code/skills/ux-patterns/SKILL.md`.

`ROOT = C:/Users/Petike/Documents/Cursor/tracker/frontend` — every `file:line` below is relative to it.

Nothing in this document was changed in the app. Every verdict carries the citation the audit
produced; where an audit could not cite, it is in section 4 (UNCHECKED), not padded into a verdict.

---

## 1. The headline numbers

| Verdict | Count |
|---|---|
| SATISFIED | **7** |
| VIOLATED | **56** |
| NOT APPLICABLE | **9** |
| UNCHECKED | **1** |
| **Total** | **73** |

**How the six passes sum.** Forms & input 14 · feedback/data-fetch 10 · interaction & feedback
surfaces 12 · information hierarchy 17 · visual system & motion 16 · copy & psychology 5 = **74
verdicts over 72 distinct patterns**. Two patterns were audited twice, by two different passes,
and both times landed VIOLATED on non-overlapping evidence:

- **empty-states** — pass 2 found error/no-results conflation on six list screens; pass 6 found
  the CTA present at only 3 of 26 call sites. Merged below; both findings stand.
- **doherty-threshold** — pass 2 found list-mutation buttons with no `busy`; pass 6 found that
  `busy` itself renders nothing on touch. Merged below; the second subsumes the first's fix.

So 74 verdicts − 2 duplicates = 72 patterns decided, + 1 never assigned = **73**. The numbers add up.

**The one gap in coverage is real and is named in section 4:** `bottom-sheets` was not assigned to
any of the six passes. No audit is short on the patterns it was given.

**SATISFIED (7)** — `hover-trap`, `notification-system`, `behind-the-button`, `proximity-rule`,
`gestalt-laws`, `z-index-mastery`, `easing-curves`. Each is cited in its pass; do not re-implement them.

**Three notes before anyone works this list.**

1. Four VIOLATED entries reduce to **one root cause each**, and fixing the root closes several rows:
   - "every shadow token is a single layer" → `shadow-elevation` + `depth-layers` + one clause of `perfect-card`.
   - "there is no `Card` component" → `design-tokens` (layer 3 has zero consumers) + `perfect-card` + `card-hover-anatomy`.
   - "the richer variant exists but ships only to `/playground`" → `toggle-anatomy`, `range-sliders`, `date-pickers`, `tabs-system`, `depth-layers`.
   - "`useToast` is imported by two files in the whole product" → `error-states`, `undo-ux`, `settings-system`.
2. **`golden-ratio` is VIOLATED and must not be actioned.** The literal 1.618 is absent, but the
   failure the rule prevents (arbitrary proportions) is not present: `tokens.css:84-100` documents a
   4px grid and `check:tokens` red-builds off-grid values. Re-deriving 172 tokens to satisfy a
   number is negative work. It appears in neither section 2 nor section 3 by design.
3. Several VIOLATED labels sit on systems that are otherwise well built — `color-accessibility`,
   `dark-mode`, `autosave-ux`, `easing`-adjacent motion. Each is a single-clause miss. Do not let
   the label send anyone to rebuild a colour layer or an autosave engine.

---

## 2. VIOLATED — VISUAL

Class swaps, token values, strings, attributes, and JSX branch conditions with no state or logic
change. These can ship in one restyle-style pass and are verified by `node scripts/check-tokens.mjs`
plus a visual diff. Ordered by what it costs the user, not by effort.

### V1 · color-picker-ux — the contrast warning asserts the opposite of what it means
`src/features/settings/AccentPicker.tsx:118-120` renders `t('settings.contrastRatio', { ratio })`
whenever `valid`, regardless of `passes`. `i18n/en.json:86` (and `hu.json:86`, `de.json:86`) reads
*"Contrast: {{ratio}}:1 — clears the 4.5:1 minimum."* A failing colour therefore renders, in red,
beside an `AlertTriangle`, with Save disabled: *"Contrast: 2.10:1 — clears the 4.5:1 minimum."*
**Change:** split the key into a passing and a failing string in all three locales; branch on
`passes` at `:118`. Strings only. Highest value-per-character in the entire list.

### V2 · skeleton-loading — onboarding renders a 0px skeleton
`src/features/onboarding/OnboardingPage.tsx:136` — `if (isLoading || !data) return <Skeleton />;`.
`Skeleton` (`src/ui/feedback/ScreenSkeleton.tsx:12-24`) applies only `rounded-field bg-[var(--skeleton-base)]`
plus the caller's `className`; with no `className` it has no height and no content.
**Change:** `return <ScreenSkeleton />`. One token swap.
(The *permanent* blank when the fetch fails is the `!data` half — that is B5, behavioural.)

### V3 · focus-states — two inputs kill their own focus ring
`src/ui/shell/CommandPalette.tsx:177` and `src/ui/feedback/variants/E8E9.tsx:135` both carry
`outline-none` with no replacement. The comment at `CommandPalette.tsx:200-202` states the exact
mechanism — the utilities layer beats the `:focus-visible` backstop in `src/index.css:45-49` — and
applies the fix to the list buttons below while leaving the input above it bare.
**Change:** append `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`
to both.

### V4 · dropdown-design — the metric picker has no focus ring at all
`src/features/progress/ProgressPage.tsx:116-119` carries `min-h-[var(--target-min)] w-full` and
nothing else — no focus ring, no hover, no transition. This is the control touched on every
measurement log. `PostEditorPage.tsx:289-291` and `ProfileEditorPage.tsx:257-259` have the ring but
no `hover:`.
**Change:** bring `ProgressPage.tsx:118` up to the same class string the other two carry; add
`hover:border-[var(--surface-border-strong)]` to all three. (Do **not** change 44 → 48px; 44 is the
project's documented a11y floor at `src/ui/primitives/control.ts:20-30`.)

### V5 · color-accessibility — accent badges measure 4.42:1 at 11px
`--accent-subtle` is `color-mix(in srgb, var(--accent) 20%, transparent)` (`tokens.css:402`).
Measured, `text-accent` on `bg-accent-subtle` over surface-0/1/2/3 in the default Midnight pack:
**4.82 / 4.42 / 4.08 / 3.67**. Two live sites sit on surface-1 with `text-micro` (11px):
`src/features/admin/AdminShell.tsx:87` and `src/features/admin/StyleStudioPage.tsx:151`.
The app's own constant is 4.5 (`src/ui/theme/contrast.ts:39`).
**Change:** `text-text-1` on `bg-accent-subtle` badges (measures 10.78:1), or add an
`--on-accent-subtle` token. ~4 sites.

### V6 · destructive-actions — the destructive button sits in the primary-confirm slot
`src/features/coaching/CoachDashboard.tsx:351-365` — the `variant="danger"` Archive button is the
**first** child of the flex row, Cancel second.
**Change:** swap the order. One line. (The label is already the verb, and the trigger is already
out of the primary position — both correct, leave them.)

### V7 · peak-end-rule — the personal-record message is `sr-only`
`src/features/workout/SetRow.tsx:118-124` flashes for 1400ms (`bg-warning-subtle ring-2` at `:247`)
and swaps in a `Trophy` (`:316-320`); `WorkoutPlayer.tsx:155-156` fires haptics and speech. The copy
that says *what was beaten* — `t('workout.newRecord', { kind })` — is rendered
`className="sr-only"` at `SetRow.tsx:342-348`. A sighted lifter gets a yellow flash and no explanation.
**Change:** remove `sr-only` and give the string a positioned visible node inside the existing flash
window. The string, the timer and the record data all already exist; no new state.

### V8 · shadow-elevation + depth-layers + perfect-card (shadow clause) — one edit, three patterns
Every shadow in the app is a single layer: `tokens.css:217` (Midnight `0 8px 24px`), `:249` (Solar),
`:280` (Forest), `:313` (Neon glow), `:348` (Mono `none`). `DESIGN.md:204` states it outright:
"there is no shadow scale." Sheets, the floating rest timer and the command palette all float at
identical apparent height.
**Change:** redefine `--shadow-overlay` per pack as a three-part list (contact ≈`0 1px 3px` +
mid + wide ambient) and add a second, stronger token for the topmost element. Token file only —
every consumer already reads the token.

### V9 · tabs-system — the focus ring and the active tab are the same colour
`tokens.css:420` `--focus-ring: var(--accent)`; `control.ts:66` `primary: 'bg-accent …'`;
`control.ts:41` `focus-visible:outline-[var(--focus-ring)]`. On
`src/features/coaching/ClientDetailPage.tsx:217` the active tab is accent-filled and its focus ring
is the same accent — "which tab am I on" and "which tab is focused" read as one signal.
**Change:** declare `--focus-ring` as a distinct hue in each of the five `[data-theme]` blocks in
`tokens.css`. One token, five values — **verify contrast on all five packs before landing**.

### V10 · von-restorff — three filled primaries on the landing screen
`src/features/home/HomePage.tsx:100` maps over `days` and emits `variant="primary"` per untrained
row at `:146-147`; `:76` adds a second filled primary ("Resume") inside a
`border-[var(--accent)] bg-accent-subtle` hero card. `control.ts:58-59` states the intent —
"Exactly one primary action per screen" — and the call sites break it.
**Change:** row-level Start buttons → `variant="secondary"`; keep the filled primary for Resume
(or, statically, for the first row). VISUAL if the choice is static; see B18 if the app must pick
which row earns it.

### V11 · form-field-states — the error has no icon; disabled is faked with opacity
`src/ui/primitives/Field.tsx:79-83` renders `role="alert"` in `--danger` with **no glyph**; the rule
requires colour + icon + message simultaneously. `Field.tsx:62` is `disabled:opacity-45`, the
pattern's named anti-value, with no `cursor-not-allowed` and no fill change.
**Change:** `<AlertCircle size={16}/>` inside the `<p>` at `:80`, matching `AccentPicker.tsx:117`;
swap opacity for a `--field-bg-disabled` token + `disabled:cursor-not-allowed`. Note
`control.ts:45` and `Switch.tsx:62` carry the same 45 — fix all three or none.

### V12 · toast-notifications — anchored bottom-centre on every viewport
`src/ui/feedback/ToastHost.tsx:84` — `fixed inset-x-0 bottom-0 … flex flex-col items-center`.
The rule asks bottom-right on desktop, top edge on mobile.
**Change:** container classes only. (The 4s-timer-on-errors defect is B7.)

### V13 · undo-ux — the countdown exists only under one style variant
The draining hairline is inside the `variant === 'B'` branch at
`src/ui/feedback/variants/E12E16.tsx:231-240`, with the variant chosen at runtime from
`element_style_config`. Four fifths of the configuration space ships an undo window with no
indication of how long it lasts.
**Change:** move the hairline out of the variant branch so the countdown is unconditional.

### V14 · icon-design-rules — nine icon sizes and four stroke weights
Counted across `src/**/*.tsx`: rendered sizes **12, 14, 16, 20, 22, 24, 28, 48px** against a declared
set of three (`--icon-sm/md/lg` = 16/20/24, `tokens.css:131-133`, exposed at `index.css:125-127`).
Stroke weights **1.5 ×3, 2 ×48, 2.5 ×11, 3 ×7** (excluding the progress ring at `E12E16.tsx:260,267`
and the anatomical SVG at `MuscleMap.tsx:100`, neither of which is an icon). The same glyph renders
at 12px on `MarketplacePage.tsx:155`, 14px at `:176`, 16px at `PostPage.tsx:117`.
**Change:** replace the 24 raw `size-N` classes and the 14/22/28/48 `size={N}` props with
`size-icon-s/m/l`; collapse the stroke overrides to one weight. Worth adding a `check-tokens` rule
for raw `size-N` on capitalized JSX tags so it cannot drift back.

### V15 · visual-hierarchy — accent spent on decoration; three page titles at 1.33× body
`src/features/home/HomePage.tsx:62` puts `text-accent` on a section eyebrow and `:120` on a
decorative per-row icon, alongside the real primary buttons at `:76/:91/:146`. Page titles: 19
screens at `text-title-1` (26px = 1.73× the 15px body), three at `text-title-2` (20px = 1.33×) —
`MarketplacePage.tsx:47`, `CoinsPage.tsx:45`, `NotificationsPage.tsx:57`.
**Change:** `HomePage.tsx:62` → `text-text-3`, `:120` → `text-text-2`; the three titles → `text-title-1`.
Leave the caption/micro weights alone — the rule's 300 is illegible at 11px.

### V16 · border-radius — nested cards are not concentric
`src/features/progress/ProgressPage.tsx:327` opens a `rounded-card p-4` card and `:339` nests
another `rounded-card` directly inside it. Outer radius 16px, outer padding 16px, so the inner
should be 0. It is 16. Nothing in the codebase computes `outer − padding`.
**Change:** add a `--radius-inset` alias per pack, `calc(var(--radius-card) - var(--card-pad))`
clamped at 0, and use it on nested surfaces.

### V17 · filter-chips — no overflow fade, no `aria-pressed` on Marketplace, wrapping chip wall
`src/features/library/LibraryPage.tsx:50` hides the scrollbar (`[scrollbar-width:none]`) on an
`overflow-x-auto` row and replaces it with nothing; a repo-wide search for `mask-image` returns zero
hits. `src/features/marketplace/MarketplacePage.tsx:65` and `:86` are `flex flex-wrap` — up to 9
kind chips plus 9 city chips stacked as two wrapping groups above the results, the multi-row wall
the rule forbids — and none of the four chip sites (`:67,76,88,97`) carries `aria-pressed`.
**Change:** `mask-image: linear-gradient(...)` on the Library row; `overflow-x-auto flex-nowrap` +
the same mask on both Marketplace groups; `aria-pressed` at the four sites.

### V18 · accordion-disclosure — missing `aria-controls`, and one header with no indicator at all
`src/features/plans/PlanEditorPage.tsx:196` and `src/features/coaching/ClientDetailPage.tsx:74` both
carry `aria-expanded` and neither carries `aria-controls`. `src/features/library/LibraryPage.tsx:150`
puts `list-none` on a `<summary>`, removing the native triangle with no replacement, so the control
has no open/closed affordance.
**Change:** `aria-controls={panelId}` + `id` on the two panels; a chevron on the `<summary>`.
(The shared timing curve is B16.)

### V19 · microcopy — system verbs where the reward belongs
`i18n/hu.json:30-31` — `"login": "Bejelentkezés"`, `"register": "Regisztráció"`, rendered at
`AuthPage.tsx:122`. Bare nouns; the pattern's own pair is "Create my free account" vs "Submit".
**Change:** reward-shaped strings in all three locales. String-only, no logic.
(The `auth.errors.generic` defect is B9 — that one is behavioural.)

### V20 · grid-system — the two admin panes split at different ratios
`src/features/admin/AdminShell.tsx:53,62,103` is a clean 3:9 on `lg:grid-cols-12` at `gap-6`.
`src/features/admin/ModerationQueue.tsx:101` is `lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]`
≈ 31%/69%, so the content column's left edge shifts between admin sections.
**Change:** `lg:grid-cols-12` + `lg:col-span-4` / `lg:col-span-8` at `gap-6`. Class-only.
Do **not** put a 12-column refactor of all 23 screens on this list — the max-width column system
(`index.css:112-113`) works.

### V21 · dark-mode — accents ship fully saturated
No code desaturates an accent. Measured HSL: midnight `#6E8CFB` S=95%, solar `#FB9E3A` S=96%,
forest `#3FCF8E` S=60%, neon `#00E0FF` S=**100%**. `tokens.css:401` notes the app's actual
environment is an OLED phone.
**Change:** one desaturation step on each pack's `--accent` (five values). The ceiling on
*user-chosen* accents is B22.

### V22 · gradient-design — no noise layer
`--gradient-brand` (`tokens.css:425`) is well-formed — both stops derived from one accent, ~0° hue
travel, monotonic lightness — but grepping `src/` for `noise|grain|feTurbulence` returns only
unrelated prose. Visible banding on 6-bit panels.
**Change:** a 2-3% noise overlay (inline SVG `feTurbulence` data-URI) on the gradient surface.

### V23 · design-system-kit — four scrims and two durations outside the token layer
`E12E16.tsx:236` `'toast-timer 4s linear forwards'` and `:302` `'stripe-flow 1s linear infinite'` —
raw durations in JS style strings, invisible to `check-tokens.mjs` because it only inspects Tailwind
class syntax. `bg-black/50` at `E14E20.tsx:53`, `bg-black/65` at `:57`, plus `E8E9.tsx:100` and
`CommandPalette.tsx:151` — `black` is absent from the gate's `TW_PALETTE` (`check-tokens.mjs:20-21`).
**Change (visual half):** add `--duration-toast`, a stripe duration (or reuse `--duration-ambient`),
and a `--scrim` token, and consume them. Extending the gate to scan JS style strings and to include
`black|white` is B24 — a new lint rule can red-build the repo.

### V24 · perfect-card — padding and border below the rule's figures
`--card-pad: --spacing(4)` = 16px (`tokens.css:444`) against the rule's 40px; `--surface-border`
alpha 0.07 (`tokens.css:190`) against ~12%; `--radius-card` 16px against 24px.
**Change:** raise `--card-pad` toward 20-24px and `--surface-border` alpha toward 0.12. Three token
values — and note this moves all 171 `rounded-card` sites at once, which is both the point of the
token and the risk. The "two shadows on a card" clause is a **documented counter-decision**
(`DESIGN.md:214`, "border OR shadow, never both") — re-litigate it as a decision, do not patch it blind.

### V25 · serial-position — the least-used destination holds the recency slot
`src/app/AppLayout.tsx:20-31` — for a plain user the 3-tab nav is Home, Library, **Settings**, so the
daily-loop destination sits mid-sequence and Settings closes. (For the 5-item coach/admin nav the
order is correct and should not be touched.)
**Change:** reorder the array to Home, Settings, Library for the 3-tab case.
**Assumption to reject if wrong:** that Library outranks Settings in use. That was inferred from the
repo, not from analytics. If Settings genuinely outranks Library, strike this row.

### Not in this section, deliberately
`golden-ratio` — VIOLATED, **do not action**. See section 1, note 3.

---

## 3. VIOLATED — BEHAVIOURAL

These change logic, state, timing or focus. Each names what has to be **tested** to land it safely.
This is the list that needs slicing, not sweeping. Ordered by what it costs the user.

### B1 · navigation-patterns — two finished features are unreachable on a phone
There is **no link to `/progress` and no link to `/coins` anywhere in the app**. Their sole entry
points are `src/ui/shell/CommandPalette.tsx:75` and `:78`, and the palette is
`hidden … lg:flex` (`:151`) — so under 1024px both screens have no route in at all, on a product
whose own layout comments call it mobile-first. Both are built, translated, and invisible.
**Change:** add entries to `SettingsPage` (the pattern already exists at `:62-70`), or better, link
progress from `WeekStrip`/the Home header and coins from the balance chip.
`BottomNav.tsx:26` is at its 5-slot cap, so this is a real IA choice, not a paste.
**Test:** route-reachability assertion — for every route in `router.tsx`, at least one in-app link
or nav entry exists at viewport width 375. Run it as a unit test over the route table so the next
feature cannot ship unreachable.

### B2 · undo-ux + destructive-actions — six deletes with no confirm, no undo, and silent failure
`ProgressPage.tsx:212` (measurement), `:300` (**progress photo**), `NutritionPage.tsx:199`,
`PlanEditorPage.tsx:213` (a whole training **day**, cascading its blocks and exercises), `:234`,
`:258`. Each is a bare `Pressable shape="icon" variant="ghost"` whose only warning is a red `Trash2`;
the verb lives in `aria-label` where no sighted user reads it. None passes `onError`, so a failed
delete is also silent. The friction mechanism already exists in this codebase — the hold-to-confirm
at `SetRow.tsx:153-166` + `:305-312`, `HOLD_MS = 550`, with `pointercancel` correctly aborting —
applied to *recording a set*, which is constructive.
**Change:** route all six through `useToast(message, kind, onUndo)` (`ToastHost.tsx:29` already
supports it) with a restore mutation per resource, or apply the `SetRow` hold gesture.
**Test:** per resource — (a) delete then undo restores the row *and its original list position*;
(b) undo after the window has closed is a no-op, not a 500; (c) a rejected delete surfaces an error
and leaves the row on screen; (d) double-tapping delete does not fire two requests.
Add the set-row undo out of its `variant === 'E'` guard (`SetRow.tsx:125`) and test that a recorded
set is reversible under all five element variants.

### B3 · error-states — writes fail silently across the product
`ToastHost` is reached by exactly two files: `useComposeFlow.ts:90` and `StyleStudioPage.tsx:56`.
Everything else fails mute. Worst case: `NutritionPage.tsx:51-60` — `await log.mutateAsync({…})`
inside an async `submit` with **no try/catch**, wired to `onClick` at `:162`. A rejected add throws
an unhandled rejection, `setPicked(null)` never runs, the button un-busies, and nothing is said.
`NutritionPage.tsx:199`, `ProgressPage.tsx:212`, `:300` — `mutate` with no `onError`.
`providers.tsx:16-21` retries 5xx twice and nothing consumes the terminal failure. There is no React
error boundary anywhere in the tree, so a render throw is a white screen.
**Change:** a shared `onError` that raises a toast (the host is mounted app-wide); try/catch on
`NutritionPage.submit`; one error boundary at `AppLayout`.
**Test:** with the network forced to fail, every mutation call site produces a visible message —
enumerate them from `useMutation` usages so the test fails when a new one is added without a handler.
Boundary test: a component that throws renders the fallback, not a blank document.

### B4 · autosave-ux — offline edits are not queued, and the post editor debounces at 1500ms
`useAutosave.ts:3` — the state union is `'idle' | 'dirty' | 'saving' | 'saved' | 'failed'`; there is
no `'offline'`. The app **has** an outbox (`src/lib/outbox.ts`, oldest-first replay) whose only
producer is `useWorkout.ts:141`. A post edited on a dead connection goes to `failed` and stays there;
the text lives only in React state, and `beforeunload` (`useComposeFlow.ts:57-68`) is the only thing
between the user and losing it. `useAutosave.ts:37` — `delay = 1500`, nearly double the ~800ms rule
(onboarding's 700ms at `useOnboarding.ts:101` is in range).
Separately, `useOnboarding.ts:136` calls `setState('saving')` *before* `setTimeout(flush, delay)` at
`:138`, so `OnboardingPage.tsx:92` spins a `Loader2` for the whole 700ms debounce with no request in
flight.
**Protect, do not touch:** `useAutosave.ts:76` — `setState(serialiseRef.current() === sending ? 'saved' : 'dirty')`.
That is the rule's core (never claim "Saved" for content the server did not receive) enforced in
code. Also `:62-65`/`:81-86` single-flight + one coalesced follow-up, and the
`expected_row_version` conflict UI at `PostEditorPage.tsx:250,402-418`.
**Change:** `delay={800}` at `PostEditorPage.tsx:114`; add a `'typing'` state to `useDraftSave` and
move `'saving'` into `flush`; route compose saves through `lib/outbox.ts` and add an `'offline'` state.
**Test:** offline → edit → close tab → reopen → the text is still there and replays; a queued save
that fails on replay does not report "Saved"; the pill never shows `saving` while no request is in
flight; and the existing single-flight/coalesce behaviour still holds under a burst of keystrokes.
Also fix the stale docblock at `useComposeFlow.ts:46-56`, which still claims autosave was cut —
`PostEditorPage.tsx:175` already flags the contradiction.

### B5 · empty-states — a server outage renders as "you have nothing"
No list screen has an error branch. `useExercises.ts:71-81` has none, so a 500 leaves
`isPending=false`, `data=undefined`, `rows=[]` → `LibraryPage.tsx:198-230` shows *"No results — try a
different search term"* for a search that never ran. Same chain at `HomePage.tsx:82-100`
(*"Nothing scheduled today"*), `ProgressPage.tsx:161-168`, `NutritionPage.tsx:172-179`,
`MarketplacePage.tsx:107-118`, `PlanListPage.tsx:103`, `CoinsPage.tsx:112,267`,
`NotificationsPage.tsx:62`. Six detail routes merge error into not-found — `PostPage.tsx:41`,
`CoachProfilePage.tsx:42`, `PlanEditorPage.tsx:66`, `ClientDetailPage.tsx:157`, `ComposePage.tsx:48`,
`PostEditorPage.tsx:194` — so an offline user is told the coach's profile was taken down.
The two genuine error states ship the named anti-copy with no `action`: `StyleStudioPage.tsx:191-194`
("The server did not answer. Reload the page.") and `ComposePage.tsx:48-54`.
CTA coverage is 3 of 26 call sites; `MarketplacePage.tsx:114-118` even *instructs* the user to remove
the city filter without giving them a control, while `LibraryPage.tsx:216-224` already ships exactly
that button.
**Change:** an `isError` branch ahead of `length === 0` on each list screen and split each
`isError || !data` condition, both with a `refetch()` action; port the clear-filters action to
Marketplace; rewrite the two "reload the page" strings.
**Test:** with the API stubbed to 500, each of those screens renders the error state and its retry
control, and the retry re-issues the query; with the API stubbed to an empty array, each renders the
empty state. That pair of assertions is what stops the two from re-merging.

### B6 · doherty-threshold — `busy` produces nothing perceptible on touch
`src/ui/primitives/Pressable.tsx:34-37` — `busy` sets `aria-busy` and `disabled` and nothing else;
the render body is `{icon}{children}`, so **the label never changes and no spinner is inserted**.
`control.ts:48` is the whole busy affordance: `aria-busy:pointer-events-none aria-busy:cursor-progress`
— a cursor state, in a mobile-first app. The buttons that pay for it have the longest round-trips:
`AuthPage.tsx:121-123`, `HomePage.tsx:146-155`, `CoinsPage.tsx:139-149`, `PlanTab.tsx:109-113`.
`active:scale-[0.97]` answers the press in 100ms; nothing answers the wait after it.
Separately, three list deletes carry no `busy` at all — `NutritionPage.tsx:196-203`,
`ProgressPage.tsx:209-216`, `:296-303` — and `useDeleteLogItem` invalidates two queries, so the row
disappears only after a second round trip.
**Change:** give `Pressable` a busy presentation *inside the primitive* — an inline spinner slot or
an optional `busyLabel` — so no call site has to remember; `check-tokens.mjs` already rejects raw
`<button>` outside `src/ui/`, so one edit reaches every button. Add `busy` to the three deletes.
The pure-copy subset (swapping the existing `common.saving` in at four call sites) can ship first as
visual work.
**Test:** with a 2s-delayed mutation, every primary action shows a visible change within 400ms on a
touch viewport; the button's box does not resize when busy (layout-shift assertion); and — see B7 —
the element stays focusable.

### B7 · disabled-buttons — `busy` maps onto native `disabled`, and one in-flight check freezes a whole list
`Pressable.tsx:36` — `disabled={disabled || busy}`. The native attribute drops the button out of the
tab order and the browser blurs it, while the style layer (`control.ts:47-48`) is written as though
busy were a separate, still-focusable state; the docblock at `Pressable.tsx:9` claims the
pattern-correct behaviour. Worse: `WorkoutPlayer.tsx:282` passes `disabled={check.isPending}` to
**every** `SetRow`, forwarded to both number inputs (`SetRow.tsx:271`, `:284`), so a lifter typing
into row 3 while row 2 posts loses focus and their caret.
Six submit buttons are disabled-until-valid with no reachable blocker text: `ChatPanel.tsx:192`,
`PlanListPage.tsx:90`, `CoachDashboard.tsx:205`, `ProfileEditorPage.tsx:111`,
`ModerationQueue.tsx:299`, `MarketplaceQueue.tsx:174`. The model to copy is already in the repo:
`AccentPicker.tsx:103` + `:110-121`, and `StyleStudioPage.tsx:175` + `:124`.
**Change:** stop mapping `busy` onto `disabled` — keep `aria-busy`, guard the click; scope
`WorkoutPlayer`'s pending flag to the row that is posting; replace disabled-until-valid with
validate-on-click into the existing `role="alert"` slot.
**Test:** a busy button remains in the tab order and keeps focus across the pending→settled
transition; a click while busy fires exactly one request; typing in row 3 survives a check posting
from row 2; clicking a blocked submit surfaces the reason and moves focus to it.

### B8 · focus-states — no skip link, and modals do not trap Tab
`AppLayout.tsx:46-56` renders `OfflineIndicator`, `CommandPalette`, `<main>`, `BottomNav` — nothing
focusable precedes `<main>`, so every screen costs a keyboard user a walk through the whole nav.
`E14E20.tsx:33-41` (Sheet) handles Escape and calls `panel.current?.focus()` and nothing else: no Tab
wrap, no `inert`/`aria-hidden` on the background, so Tab walks out of an `aria-modal="true"` dialog
onto the page behind it — including the row the archive dialog is confirming about. The Sheet also
captures nothing to restore focus to, so closing it drops focus to `<body>`.
`CommandPalette.tsx:132-140` does the restore correctly — the codebase already has the fix in one of
its two dialogs.
**Change:** a `sr-only focus:not-sr-only` skip anchor as the first child of `AppLayout`; a Tab
handler + `returnFocusTo` ref on `Sheet` (copy `CommandPalette.tsx:132-140`); background `inert`.
**Test:** keyboard-only walk — Tab from page load reaches "skip to content" first; inside an open
Sheet, Tab from the last focusable wraps to the first and never reaches a background control;
Escape and backdrop-click both return focus to the element that opened it.

### B9 · form-validation-timing + microcopy — the auth screen validates on submit and says "the operation failed"
`AuthPage.tsx:42` — `useForm({ resolver: zodResolver(schema) })` with no `mode`, so react-hook-form
defaults to `onSubmit`. First feedback on any field is the submit click, and `:98`/`:107` then render
**the same string under both fields**: `t('auth.errors.generic')` = *"Nem sikerült a művelet. Próbáld
újra."* — "the operation failed", under a field where nothing was operated on yet.
`AuthPage.tsx:17` — `password: z.string().min(1)`, so the 12-char rule shown two lines above at
`hint` is enforced server-side only and comes back as that same generic sentence.
`hu.json:38` `emailTaken` states the fact and offers no next step, while the login link sits at
`:128-133` unreferenced.
Two more surfaces map *every* error to one specific message: `ProgressPage.tsx:152-157` tells a
user with a dropped connection that their measurement is implausible, and `:267-271` tells them a
network failure is a wrong file type. `AuthPage.tsx:48-54` already branches on `ApiError.status` —
the shape to copy is in the same file.
**Protect:** `HandleField.tsx:50-54,68-83` — 350ms debounce, live checking/free/taken/malformed with
a green `Check` at `:122-127`. It is the one field in the app that gets this right.
**Change:** `mode: 'onBlur', reValidateMode: 'onChange'`; field-specific i18n keys ×3 locales; the
12-char rule in the client schema; branch on status before choosing a string at the two Progress sites.
**Test:** blur an invalid email → that field's own message appears and the password field stays
clean; fix it → the message clears on change, not on submit; a 503 on measurement save renders a
network message, not the range message; a wrong-type upload still renders the type message.

### B10 · charts-that-lie — the y axis is min–max normalized and never labelled
`chartGeometry.ts:40-44,62` — `min`/`max` from the data, `span = max - min || 1`, so **every** series
fills the full 82px of drawing height regardless of its actual range, and `TrendChart.tsx:124-150`
renders no y tick, no axis label and no baseline. An admin signups series of 12,13,12,14 is a
full-height sawtooth; a bodyweight series of 80.0 → 80.4 kg is a full-height climb — in a fitness
app, to a user reading their own body. `TrendChart.tsx:125-128` compounds it:
`viewBox="0 0 300 90"` with `preserveAspectRatio="none"` and `className="w-full"`, so the same data
reads at two different slopes on a 480px column and half a 1120px admin grid.
**Protect:** no gridlines/3D/legend box, direct labelling in the `figcaption` (`:103-122`), real-time
x axis (`chartGeometry.ts:56-61`), the ≥3-point refusal (`:73-78`), the ≥14-day gap callout (`:157`).
**Change:** pad the y domain — floor at 0 for count series, symmetric padded range for body
measurements — and render min/max y labels. It is arithmetic in `chartGeometry.ts:38-63` plus two
text nodes; that module is already pure and testable for exactly this reason.
**Test:** unit tests on `chartGeometry` — a flat-ish series does not span full height; a count series
includes 0 in its domain; a single-value series does not divide by zero; the rendered y labels match
the domain. Then a visual check of the same series at both container widths.

### B11 · optimistic-ui — the rollback was designed and never wired
`useChat.ts:133-165` — `mutationFn`, `onMutate`, `onSuccess`, and **no `onError`, no `onSettled`**.
`onMutate` returns `{ previous, optimisticId }` at `:158` and nothing ever reads it: dead context
documenting an intended rollback. On failure the optimistic bubble stays in cache rendering
`chat.sending` at `opacity-60` (`ChatPanel.tsx:241,250`) until the 5s poll happens to replace it —
and when the failure was the network, that poll fails too, so the phantom persists while
`ChatPanel.tsx:83` has already put the same text back in the composer.
**Protect:** the applicability judgement is right in both directions — optimistic on send and on the
theme toggle, deliberately withheld from set recording (`WorkoutPlayer.tsx:148`) and the unread badge.
**Change:** `onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous)`. ~2 lines.
**Test:** a failed send removes the optimistic bubble immediately (not after 5s), the text is in the
composer exactly once, and re-sending produces one message, not two.

### B12 · stepper-wizard — five screens, then thrown back to screen two
`OnboardingPage.tsx:151-156` — `go()` advances with no validation at all. `FIELD_STEP` (`:25-30`)
exists solely to jump backwards *after* `/onboarding/complete` is rejected (`:158-172`). That is the
pattern's own first "Don't", verbatim.
**Protect:** the draft persistence is genuinely well built — `useDraftSave` merges rather than
replaces the pending patch (`useOnboarding.ts:135`), flushes on `pagehide` and unmount (`:143-151`),
and restores the patch on failure (`:128`); Back does not rewind the saved resume point.
**Change:** a per-step required check inside `go()` that refuses to advance and sets `missing`
locally, reusing the `<Field error>` wiring already at `:265`. `data.required` is already client-side
(`useOnboarding.ts:50`).
**Test:** each step blocks advance with the missing field named inline; Back never triggers
validation; the draft still saves and resumes across a reload mid-flow; the server rejection path
still works as the last line of defence.

### B13 · file-upload-ux — a 4MB photo uploads under the word "Saving" with no way back
`PostEditorPage.tsx:482-500` and `ProgressPage.tsx:253-266` are bare file inputs inside labels.
No dropzone exists anywhere (`onDrop|onDragOver|dataTransfer` returns nothing in `src/`). Progress is
a word, not a percentage. Retry is an error paragraph with no control — and
`ProgressPage.tsx:264` sets `e.target.value = ''`, **discarding the selection**, so retry means
re-opening the picker. Size and dimensions appear only *after* success
(`PostEditorPage.tsx:458-460`) — proof the wrong file uploaded, not a check before it did.
**Protect:** `PostEditorPage.tsx:493` mints a fresh idempotency key per file choice (documented at
`:52-54`); `ProgressPage.tsx:238-240` states the privacy consequence before the picker opens.
**Change:** object-URL preview with name/type/size before firing the mutation; stop clearing the
input on failure. Determinate progress additionally needs `XMLHttpRequest.upload.onprogress` or a
fetch stream — `lib/api.ts` uses plain `fetch`.
**Test:** a failed upload leaves the selection intact and one tap retries it; the retry reuses the
same idempotency key (or mints a new one — decide, then assert it) and does not create a duplicate;
the preview releases its object URL on unmount.

### B14 · zeigarnik-effect + peak-end-rule — the return mechanism is behind a keyboard shortcut, and no flow has an ending
`CoinsPage.tsx:196-239` is a correctly-shaped open loop — `{{done}} / {{total}} feloldva`, locked
achievements with a `Lock` icon and the reward they would pay — on the screen B1 says a phone cannot
reach. Home (`HomePage.tsx:44-166`) carries no streak, no weekly meter, no completion figure.
An abandoned questionnaire is tracked (`useOnboarding.ts:19-20`, `status: 'draft'`, `step`) and
never mentioned again; nothing links to `/onboarding`.
Endings: `useWorkout.ts` has start / check-set / undo and **no finish** — `WorkoutPlayer.tsx:160-322`
just stops, and the last interaction of the app's central flow is navigating away.
`OnboardingPage.tsx:158-172` ends on `navigate('/', { replace: true })` — an unannounced route swap.
`useComposeFlow.ts:70-93` is titled "Confirm, congratulate, and buzz" and fires
`"Közzétéve"` / `"Mentve"` — single past participles. A successful purchase has no string at all
(`CoinsPage.tsx:159-167` has copy only for failures).
**Change (slice it):** (a) surface the achievement/streak figure on Home — the hook, the string and
the reward data all exist; (b) an onboarding completion panel before the redirect; (c) a workout
summary screen — largest, and it needs a server-side finish concept first.
**Test:** for (a), the Home figure matches the coins screen for the same account and does not fetch
on every render; for (b), completing onboarding shows the panel and the redirect still happens on
dismiss, and a resumed draft still lands on the right step.

### B15 · pagination — back from a detail view loses the filters and the scroll position
`useSearchParams` returns **zero hits** across `src/`. `LibraryPage.tsx:82-84` holds `search`,
`muscle`, `equipment` in `useState`; navigating to `/library/:id` unmounts the page and coming back
re-mounts it empty. `ScrollRestoration` also returns zero hits — `router.tsx:80` mounts
`createBrowserRouter` without it. A filtered library view also cannot be shared or bookmarked.
**Protect:** cursor pagination is correct everywhere (`useExercises.ts:71-81`, `usePublic.ts:86,121`,
`useCoins.ts:60`, `useCompose.ts:256`) — no offset drift. Caps are stated, not hidden
(`UserSearch.tsx:145-147`, `MarketplacePage.tsx:129-134`).
**Change:** move the three Library filters to `useSearchParams`; add `<ScrollRestoration />` in
`AppLayout`.
**Test:** filter → scroll → open a detail → back restores filters, pages and scroll offset; a pasted
filtered URL renders the same list; the infinite query does not refetch every page on return.

### B16 · accordion-disclosure (animation) + animation-timing — nothing has an exit
There is **not one exit-specific transition in the codebase**: every `exit=` shares the entrance
`transition`, so dismissing costs exactly as long as opening — `E12E16.tsx:163-166` (toast),
`E14E20.tsx:78-83` (sheet), `:59-62` (scrim), `E8E9.tsx:118-121` (select). `SPRING.soft`
(`useMotionSafe.ts:51`, stiffness 300 / damping 17) is underdamped at ζ≈0.49 — ~470ms to settle,
past the ~300ms entrance cap, and the sheet exit inherits it. Stagger is 30ms (`E8E9.tsx:154`) and
40ms (`E14E20.tsx:243`) against ~50ms. Separately, the three disclosure panels
(`PlanEditorPage.tsx:219`, `ClientDetailPage.tsx:74`, `LibraryPage.tsx:149-159`) mount and unmount
with no transition at all, so content below jumps under the thumb.
**Protect:** `easing-curves` is SATISFIED — do not touch the curve set. Entrance durations and the
100ms press are correct.
**Change:** a faster per-`exit` transition (~40% of the entrance); raise `SPRING.soft` damping so it
settles inside 300ms; stagger to 0.05; a `grid-template-rows: 0fr → 1fr` wrapper on the three panels
sharing `--duration-base`/`--ease-standard` with a chevron rotation (`E8E9.tsx:83-91` has the idiom).
**Test:** `prefers-reduced-motion` still short-circuits every one of these (`useMotionSafe`); the
sheet's exit completes before its unmount so nothing pops; the accordion wrapper does not clip
focus rings or break the scroll position of a long plan.

### B17 · settings-system — a theme save that fails looks identical to one that succeeds
`ThemeStudio.tsx:27` is `save.mutate(merged)` — no `onSuccess`, no `onError`; `useThemeSync.ts:34-37`
defines the mutation with no error handling and returns it raw. The app repaints locally, says
nothing, and the choice does not follow the user to the next device. Also: pack and accent commit
instantly (`:63`, `:85`) while gradient needs an explicit Save (`:100-107`, because `:93-97` calls
`preview`+`setTheme` and never `save`) — two apply models in one section, unlabelled. No search box,
no per-setting changed indicator, no per-setting reset (only two global escapes:
`AccentPicker.tsx:60-62`, `GradientBuilder.tsx:134-136`).
**Change:** `save.mutate(merged, { onSuccess: … , onError: … })` with toasts — `ToastHost`/`useToast`
already exist. Search and per-setting reset are larger and can wait.
**Test:** a 500 on the theme PUT raises an error toast and either reverts the local paint or marks it
unsaved; a success toast fires exactly once per commit, not per re-render; the gradient's explicit
Save still works.

### B18 · von-restorff (dynamic half) — which row earns the emphasis
Only if the answer is not static (see V10): the app must decide which single Home row is *next* and
give it the filled primary. That is a product rule, not a class swap.
**Test:** exactly one `variant="primary"` renders on Home for any fixture — zero, one, and three
scheduled slots, with and without a live session.

### B19 · command-palette — substring matching, no recent, desktop-only
`CommandPalette.tsx:104` — `.includes(q)`. `"stg"` returns nothing for "Settings", the rule's exact
counter-example. `:184-219` is one flat listbox from a static array (`:60-99`); nothing records or
ranks prior use, and there are no Recent/Actions/Pages sections. `:151` is `lg:flex`, so the palette
does not exist below 1024px — which is what makes B1 fatal rather than merely inconvenient.
**Protect:** it opens prefilled (`:103`), the keyboard contract is complete (`:171-173`, `:119`), and
focus is returned on close (`:132-140`).
**Change:** a subsequence scan sorted by match position (~15 lines, self-contained, no new state).
Recent-command tracking is a further change (persistence).
**Test:** `"stg"` matches Settings; `"gst"` does not match Settings (order is preserved); ranking is
stable for equal scores; the existing Arrow/Enter/Escape/restore behaviour is unchanged.

### B20 · tabs-system — two tablists are keyboard-dead
`ProgressPage.tsx:48-62` and `CoinsPage.tsx:54-68`: no `onKeyDown`, no roving `tabIndex`, no
`aria-controls`, and the panels at `:64-66` / `:70-72` carry **no `role="tabpanel"`**.
`ClientDetailPage.tsx:197-226` already has Arrow-key navigation and roving `tabIndex` (missing only
Home/End) — copy it. All four tablists are colour flips; the spring-slid indicator exists at
`E10Tabs.tsx:75-90` and is imported only by `PlaygroundPage.tsx:16`.
**Change:** port the `ClientDetailPage` treatment to the two dead tablists; optionally route all
four through `E10Tabs`.
**Test:** arrow keys move selection and focus together on all four; Home/End jump to the ends; the
panel is announced as a tabpanel; the active tab is still distinguishable from the focused tab (V9).

### B21 · loading-states-system — no 300ms gate anywhere
Repo-wide, the only timers guarding anything are the three search debounces
(`LibraryPage.tsx:19-27,85`; `UserSearch.tsx:45-48`) and the two autosave delays. Every loading
branch paints on frame 0, including `router.tsx:78` `<Suspense fallback={<ScreenSkeleton />}>` on 24
lazy routes — a warm chunk resolves in ~10ms and still flashes a full-screen skeleton, which reads
as a glitch rather than as speed. ~15 branch sites.
**Protect:** the *selection* of indicator is mostly right (skeleton for known shapes, inline spinner
for short unknown waits, `busy` for actions), and spinners never co-occur with skeletons.
**Change:** one `useDelayedFlag(isPending, 300)` next to `ScreenSkeleton`, substituted at the branch sites.
**Test:** a resolve under 300ms renders no indicator at all and does not flash; a resolve over 300ms
renders the skeleton and keeps it for a minimum visible duration so it does not strobe; the
`LoadingAnnouncer` live region still announces first loads.

### B22 · dark-mode (enforcement half) + gradient-design (builder half) — user input is unconstrained
`palette.ts:16-25` picks the eight presets for contrast only; there is no saturation ceiling on them
or on the custom picker. `GradientBuilder.tsx:7,35-42,75-83` allows 6 arbitrary stops with a free
`<input type="color">` each and no hue-travel or lightness-monotonicity check — the only contrast
call (`:98`) styles the swatch's own icon. A user can assemble an orange→blue mud gradient with no
warning.
**Change:** a chroma ceiling beside the existing contrast check in `contrast.ts`, and a
hue-travel + lightness warning beside the gradient preview.
**Test:** a saturated accent is rejected or clamped with a message, and **the server copy agrees** —
`contrast.ts:5-7` states the rule is re-run server-side, so a client-only ceiling will diverge.
Round-trip a rejected value through the API in the test.

### B23 · data-table — sort cannot return to the original order, and the identity column scrolls away
`DataTable.tsx:165-168` `nextSort` toggles asc/desc forever, with a docblock at `:161-163` explicitly
rejecting the third state, so an admin who sorts by role cannot get back to newest-first without
reloading. `:81` `min-w-[640px]` inside an `overflow-auto` wrapper with no `sticky left-0`, so the
email column — the only thing identifying a row — scrolls out while role and date stay readable.
One row height (`tokens.css:153`), no density control.
**Protect:** right-aligned tabular numerics (`:143-145`), a sticky header that actually sticks
(`:76-78` + `:85`, the `max-h` is what makes the wrapper a scroll container), `aria-sort` at `:94`.
**Change:** `nextSort` returns `undefined` on the third click and the consumer drops the `sort`
param; `sticky left-0 bg-surface-2 z-[1]` + an edge shadow on the first column (visual once the sort
work lands). Density is optional.
**Test:** three clicks return the server's default order and the URL/query reflects it;
`aria-sort="none"` in the third state; the frozen column does not overlap the sticky header at the
corner.

### B24 · design-tokens + card-hover-anatomy + perfect-card — there is no Card component
Layer 3 of the token architecture has **almost no consumers**: grepping all 84 `.tsx` files returns
zero hits for `--card-bg`, `--card-border`, `--card-radius`, `--btn-bg`, `--btn-fg`, `--btn-radius`,
`--field-radius`, `--sheet-radius`. The canonical card is instead written out at 171 `rounded-card`
call sites as layer-2 utilities (`NutritionCard.tsx:41`), and `control.ts:67` uses `bg-accent
text-accent-fg` rather than `--btn-bg`/`--btn-fg`. `DESIGN.md:573` (GAPS G4) admits this in writing.
Editing the layer the docs point at cascades to nothing.
Consequently the clickable cards have no hover state: `MarketplacePage.tsx:147` and
`CoachProfilePage.tsx:113` are whole-card `<Link>`s with no `hover:`, no transition, no lift — on the
app's public browsing surface, nothing indicates the cards are tappable. Where hover exists it is a
background swap (`PlanListPage.tsx:47`, 7 sites against 171). The photo grid
(`ProgressPage.tsx:283-303`) has no `overflow-hidden` image frame and keeps its delete action
permanently visible at the top-right instead of revealed at the bottom edge.
**Change (pick one, do not do both):** extract a `Card` primitive reading
`var(--card-bg)`/`var(--card-border)`/`p-[var(--card-pad)]` with the hover recipe from
`E12E16.tsx:55` (corrected from 2px to ~8px lift, ~200ms, plus ~1.03 image scale) and migrate the
171 sites — **or** delete the eight dead aliases so the declared architecture matches the built one.
**Test:** if extracting — a visual-regression pass over a representative screen per feature before
and after migration; `check-tokens.mjs` still passes; changing `--card-bg` in one theme block
demonstrably repaints every card (that assertion is the whole point).

### B25 · design-system-kit (gate half) — the gate reports clean while values sit outside the layer
`check-tokens.mjs` inspects Tailwind `duration-[…]`/`animate-[…]` class syntax only, so the raw `4s`
and `1s` in JS style strings (`E12E16.tsx:236`, `:302`) are invisible to it, and `black` is absent
from `TW_PALETTE` (`:20-21`) so four raw scrims pass. It prints "no raw values outside the token
layer" while six are.
**Change:** extend the gate to scan JS style strings and to include `black|white`.
**Test:** run the extended gate on the current tree — it must red-build until V23's tokens land, and
must not produce false positives on `MuscleMap.tsx` or the progress-ring `strokeWidth`. New lint
rules can block the repo; land the token additions first, the rule second.

### B26 · search-experience-system + filter-chips (facet half) — dead ends and an undebounced query
`CommandPalette.tsx:214-218` and `NutritionPage.tsx:136-138` both render "No matches" as a bare line:
no suggestion, no category jump, no way out. `LibraryPage.tsx:212-230` does it right — the shape is
already in the repo. No search surface stores recent queries (`LibraryPage.tsx:82-85`,
`NutritionPage.tsx:29`, `MarketplacePage.tsx:33`, `CommandPalette.tsx:45` are all bare `useState`).
`MarketplacePage.tsx:56` feeds `q` straight into `useSearch` with **no debounce**, so every keystroke
past 2 characters is a network request, while the other two search surfaces debounce at 300ms.
Library chips have no disabled state because options (`useExercises.ts:99-109`) are never intersected
with the result set, and `LibraryPage.tsx:182` swaps the result count for the word "Loading" on every
chip tap.
**Change:** `EmptyState` + clear-query action at the two dead ends; 300ms debounce on Marketplace;
keep the previous count visible while refetching. Recent searches, popularity ranking and per-facet
counts need new persistence and a server change — separate slice.
**Test:** typing 10 characters into Marketplace issues one request, not eight; the zero-result state
offers a control that actually clears the query; the Library count does not flicker to "Loading" on
a filter change.

### B27 · modal-hierarchy — the overlay type is chosen by a global style setting, not by intent
`E14E20.tsx:43` — `const isDialog = variant === 'B';` where `variant = useElementVariant('E14')`.
Both call sites get whatever the admin's element-style pack currently is, and both get the same
`bg-black/50 backdrop-blur-sm` scrim with `aria-modal="true"`. Their intents are opposite:
`CoachDashboard.tsx:335-341` displays a generated invite code (informational, blocks nothing) and
`:343-366` confirms a destructive archive.
**Change:** render the minted code inline (there is a card slot at `:244-257`), or give `Sheet` an
explicit `blocking` prop that decides `isDialog` and the scrim instead of reading `useElementVariant`.
**Test:** the informational surface no longer traps focus or locks body scroll; the destructive
confirm still does both, under every element variant.

### B28 · date-pickers — logging yesterday is three taps into an OS overlay
`NutritionPage.tsx:64-71`, `ProgressPage.tsx:140-146`, `:245-251` are bare `<input type="date">` with
the 44px floor and an `aria-label` — and **not one preset chip**. `E8E9.tsx:229-233` already computes
the quick array (today / tomorrow / next week) and ships only to `/playground`.
(The two-months-side-by-side and drag-the-edges clauses are N/A — there is no date-*range* picker.)
**Change:** two or three `Pressable shape="chip"` presets beside each date input, setting the ISO
string directly.
**Test:** a preset writes the same value the native picker would for the same day, in the user's
timezone, across a DST boundary. That is the only interesting case here and it is worth an actual test.

### B29 · password-field-ux — 11 characters behind dots and a generic rejection
`AuthPage.tsx:101-109` — a static sentence (`en.json:35`) instead of a live checklist, no strength
meter anywhere (`strength|entropy|zxcvbn` returns zero), and no visibility toggle even though `Field`
already has a `trailing` slot (`Field.tsx:10,67-69`). Paste is allowed — that clause holds.
**Change:** an eye-toggle `Pressable` in the existing `trailing` slot (one boolean of state); the
live checklist + meter is a new component and a separate slice.
**Test:** the toggle does not submit the form, does not break `autoComplete`
(`current-password`/`new-password`), and the field type reverts on unmount; the typed value is never
logged.

### B30 · range-sliders — the number is 100px from the thumb
`GradientBuilder.tsx:75-83` (angle) and `:100-108` (stop position) get step snapping, a 44px target,
native keyboard support and a `tabular-nums` readout — but the readout sits beside the slider, not
above the thumb, so on a wide row the eye leaves the thumb to read it and the user overshoots.
`E17E19.tsx:32,82-95` already computes the `pct` and `grabbing` pair.
**Change:** an `onPointerDown/Up` grabbing flag plus an absolutely-positioned bubble at `left: ${pct}%`.
**Test:** the bubble tracks the thumb at both ends without clipping at 0% and 100%, and disappears on
pointer cancel (not just pointer up).

### B31 · form-field-states (states half) — no success, no loading
`Field` has four of six states. Success exists only at `E7Field.tsx:34-45` gated on
`variant === 'C' && valid`, and no call site passes `valid` (`LibraryPage.tsx:119-126` does not).
Loading exists only as a caption spinner below `HandleField.tsx:116-121`, and the input is never
disabled during the probe. A user who fixes an error gets no confirmation that it is now correct.
**Change:** new props on `Field` plus call-site wiring.
**Test:** the success state clears on re-edit; the loading state does not steal focus or reflow the
field; screen-reader output announces the transition once, not on every keystroke.

### B32 · toggle-anatomy — two properties morph, and there is no state label
`Switch.tsx:70` transitions rail colour and `:77` transitions `left`; the knob shadow at `:76` is
static and never transitions, and no state label is rendered. In a colour-vision-deficient reading
the switch changes only knob position. `E4Toggle.tsx:71-79` already implements the label (variant C)
and an in-knob pending spinner (E) and ships only to `/playground`.
**Protect:** duration, easing, `role="switch"`, `aria-checked`, real `<button>` keyboard support —
all correct (`Switch.tsx:43-47,59,70,77`).
**Change:** add `shadow` to the knob's transition list with a checked/unchecked pair, plus an
`aria-hidden` on/off label inside the rail. Also worth moving `left` → `translateX` so it runs on the
compositor.
**Test:** the label does not leak into the accessible name (already provided by
`CueSettings.tsx:63-65`); the knob lands on the same pixel after the `translateX` change at both
states and at both densities.

### B33 · toast-notifications (timer half) — critical errors auto-dismiss in 4 seconds
`E12E16.tsx:151-155` — `setTimeout(() => onDismiss(toast.id), 4000)` for **every** kind, including
`error`, which `useComposeFlow.ts:90` raises for a failed publish, save or cover upload. The one
channel that reports whether a save landed erases its own error before a user who looked away can
read it. Hover-pause also *restarts* rather than resumes (`paused` is in the effect's dependency
array, so leaving mints a fresh 4000ms), while the variant-B hairline genuinely resumes — so the bar
empties while the toast stays, or the reverse. Overflow past 3 is dropped (`ToastHost.tsx:62`
`.slice(-3)`), not queued.
**Protect:** the cap of 3, `role="status"` + `aria-live="polite"`, severity by icon *and* border
*and* colour, the 44px close button.
**Change:** branch the timeout on kind (error → no timer, close button only; info/success → 4000;
a `warning` kind at 7000); store the deadline in a ref so un-hovering resumes the remainder; queue
toasts 4+ instead of destroying them.
**Test:** an error toast survives 30s untouched and dismisses only on click; hovering at t=3s and
leaving at t=5s dismisses at t=1s-remaining, not 4s; a burst of 5 shows 3 and then the other 2.

### B34 · tooltip-design — the two most useful numbers on their screens exist only in a `title=`
`SetRow.tsx:262` puts the previous-set value — whose own comment calls it "the single most useful
number on the screen" — in a `title` on a `truncate`d span. `PlanEditorPage.tsx:301-303` puts
conflicts 2..n in a `title` on a chip that visibly renders only `conflicts[0]`. On touch, a `title`
on a non-focusable `<span>` is unreachable by any input method, on this product's primary platform.
**Change (cheapest path):** make the content reachable without hover — the full previous value in the
row's `aria-label` and on a second line, the full conflict list in visible text or an expandable
detail. Building a real tooltip primitive is the larger option and would also serve the unlabelled
icon rows at `PlanEditorPage.tsx:228/231/234`.
**Test:** the previous-set value is readable at 320px width without hover, and the row's accessible
name is not duplicated by the visible text.

### B35 · scroll-driven-animations — a React re-render per scroll event
`E14E20.tsx:212-221` hand-rolls `window.addEventListener('scroll', …)` driving `setHidden`, which
flips a CSS transform at `:231` to hide a FAB. `animation-timeline`, `scroll()`, `view()` and
`animation-range` appear nowhere in `src/`. Scope is small — this is the only scroll-driven motion in
the app; the `IntersectionObserver` at `LibraryPage.tsx:104-110` is data fetching and is correct.
**Change:** since a directional hide cannot be expressed by `scroll()` alone, at minimum move the
read into `requestAnimationFrame` and toggle a class rather than React state.
**Test:** scrolling a long list produces no re-render of the subtree (React profiler assertion), and
the FAB still hides on scroll-down past 120px and returns on scroll-up.

### B36 · swipe-actions — shipped library code that deletes on a thumb-drag
`E14E20.tsx:137-145` — `if (offset > THRESHOLD && onComplete) onComplete(); else if (offset < -THRESHOLD && onDelete) onDelete();`
with `THRESHOLD = 96`. A full swipe fires the delete instantly: no revealed button, no undo, no
confirmation. There is no keyboard, button or long-press fallback (`:171-185`), and the catalog
advertises variants the component does not implement — `catalog.ts:128` declares E13-C as
"Long-press menu" with `live: true`, but `SwipeItem` branches on `variant` exactly once (`:165`, a
background tint), so the fallback that would rescue non-gesture users does not exist. Left/right
semantics also disagree with the app's other horizontal-drag surface (`SetRow.tsx:183-193`, where
right increases weight).
**Scope, stated so this is not overread:** the only call site today is the admin QA screen
(`PlaygroundPage.tsx:140`, `onDelete={() => undefined}`). This is a trap for the first team that
wires it to real data, not a live data-loss bug.
**Change:** latch a revealed button requiring a second tap instead of committing on release (or
commit + raise the undo toast from B2); implement E13-C as the non-gesture fallback; document one
left/right convention.
**Test:** a 200px drag reveals and does not delete; the revealed action is reachable by keyboard;
`pointercancel` mid-drag leaves the row untouched; and — before any of it — a test that fails if
`SwipeItem` gains a production call site while `onDelete` still fires from `end()`.

---

## 4. UNCHECKED

One pattern of 73 was never decided. This section exists so the coverage gap is visible rather than
absorbed into a total.

### bottom-sheets — UNCHECKED
**Reason.** It was not assigned to any of the six audit passes. No pass claimed it, and none of them
gathered the evidence its rule needs (snap points, drag-to-dismiss, scrim, body-scroll lock,
background visibility). It is not N/A by default: the app ships a `Sheet`
(`src/ui/feedback/variants/E14E20.tsx`) with two live call sites (`CoachDashboard.tsx:335` and
`:343`), and the pattern's own "Applies to" clause — mobile and tall-phone layouts, menus and
secondary flows, anywhere a full modal is used for a partial task — matches this product directly.
**What deciding it requires.** Read `E14E20.tsx` for snap points and a drag-to-dismiss gesture (the
audits saw a scrim at `:53-56` and Escape handling at `:33-41`, but neither was checked against this
rule), and check whether body scroll is locked while it is open. Note that two adjacent findings
already touch the same component — B8 (no Tab trap, focus not restored) and B27 (overlay type chosen
by a style variant, not by intent) — so whoever verifies this should read it once and settle all three.

Everything else on the 73 was decided with a citation. No verdict in sections 2, 3 or 5 rests on an
unread file.

---

## 5. NOT APPLICABLE

Nine patterns, each with the surface that would make it apply. Revisit the day that surface is built.

| Pattern | Surface that would trigger it |
|---|---|
| **input-masking** | A payment/card-entry, phone-number or IBAN field. The coins feature (`src/features/coins/`) has no card entry today; revisit when a real purchase flow lands. |
| **otp-input** | Email verification, SMS 2FA, or a magic-code login on `AuthPage` — i.e. when `useSession.ts` grows a verify step. (The coach temp passwords at `CoachDashboard.tsx:242-252` are displayed and copied, never typed into boxes.) |
| **inline-editing** | Any display→input transition: an editable plan name in `PlanListPage`, an exercise nickname, or an editable cell in `DataTable`. Today every editable value is a permanently-rendered input. |
| **live-cursors** | Two accounts editing one document — realistically `PlanEditorPage.tsx` if teams (`CoachDashboard.tsx:205`) let two coaches open one plan, or `PostEditorPage.tsx` with co-authoring. Chat is polled at 5s with one author per message. |
| **star-rating** | Coach reviews or post ratings on `CoachProfilePage`/`PostPage`, or an exercise difficulty score. Revisit for the read-only aggregate (fractional fill) as well as the input. |
| **drag-and-drop** | The plan editor when drag is layered onto the existing up/down reorder — `PlanEditorPage.tsx:21-24` says this is planned — or a drop zone beside either file picker. |
| **bulk-actions** | Row selection on the admin user table (`UserSearch.tsx:77`) or either moderation queue. The `Checkbox` primitive already implements the indeterminate state (`E5Checkbox.tsx:47`), so the header tri-state is ready when the selection model arrives. |
| **context-menu** | Any list row growing past two actions and moving them behind a trigger — the roster rows, notifications, or library rows. Then viewport-flip, destructive-last-in-red, the safe triangle and a long-press bottom-sheet equivalent all apply. |
| **landing-page-skeleton** | A public marketing page at `/` for signed-out visitors, or a CTA on `CoachProfilePage` (which today has a hero, a verified badge correctly placed in it, chips and a bio — and nothing to book, contact or subscribe). The moment a coach can be contacted from that page, the five-section order and the CTA rules become enforceable, and the page as it stands would fail most of them. |

Two half-patterns are also N/A and are noted here so they are not re-audited: the **date-range** half
of `date-pickers` (no range picker exists anywhere) and the **irreversible-delete** clause of
`settings-system` (Settings has Logout and no delete-account or delete-resource action).

---

*Generated from six read-only audit passes. No file in the app was modified.*
