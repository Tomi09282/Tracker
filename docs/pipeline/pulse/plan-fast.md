# Pulse implementation — plan FAST (speed through parallelism)

Status: COMPLETE (sections 0-9). Written 2026-10-11 on branch `pulse-redesign` (HEAD `0860942`), read-only on the codebase.
Inputs: the six reader notes in `docs/pipeline/pulse/understand/` (read in full), `00-owner-decisions.md` (D1-D4, final),
`docs/brain/58-Pulse/{0000 Index,Pulse System}.md`, ADR-0020, the frames in `TRACKER-mockups/5-pulse/kepernyok-2x/`.
Paths are relative to `C:/Users/Petike/Documents/Cursor/tracker/` unless absolute. Sizes: S / M / L / XL = one short agent run / one run / one long run / a run that will need a resume.

## 0. The plan in ten lines

1. ONE shared working tree for writing, ONE clean worktree for proving. No per-agent worktrees, no merges: feature folders are file-disjoint, and the machine has 3.1 GB free RAM (one Vite, one backend).
2. ONE integrator (INT) owns every shared file for the whole effort: `tokens.css`, `index.css`, `index.html`, `package.json`, `src/lib/**`, the three i18n bundles, `catalog.ts`, the gate scripts' wiring, and every commit.
3. Phase 0 starts with "the switch" (INT, serial, three commits): theme engine out, Pulse values in, fonts and type ramp in. Every old name stays declared at a neutral value, so the build never goes red. The whole app is black / lime / Big Shoulders after it.
4. Then the foundation lanes in parallel (A actions, B structure and data, C shell, D assets, F charts, G mannequin; the tooling lane E starts during the switch), each owning disjoint files in `src/ui` / `src/app` / `scripts`, each in two stages. Stage 1 is only what Home and Auth need.
5. Shared recipes are restyled IN PLACE (`control.ts`, `Field`, `Switch`, `Sheet`, `Toast`, `BottomNav`, `EmptyState`, `Skeleton`): 161 buttons, 23 fields, 9 sheets and 12 toasts turn Pulse without a feature-file edit. Old button variants become aliases of Pulse looks on day one.
6. Home + Auth are the pilot (Wave 0) and land while stage 2 of the lanes is still running. They are the first real screens the owner opens.
7. Then a rolling queue of 24 screen packages, 6 agents at a time (8 at most), long poles first. Screen agents write only their own feature files plus a package folder with an i18n patch file and request files.
8. Integration is mechanical: one script stages a package's paths + its i18n patch, replays the staged diff in the clean worktree, runs `npm run build` there, commits only on green, then captures the package's frames from the BUILT app.
9. Proof is a headless-Chrome capture at 402 x H, scale 2, safe-area insets 62 / 34, set beside the Figma frame, plus measured probes. Never the in-app Browser pane.
10. Everything is resumable: `progress.json` (one entry per package, written through a locking CLI) + an append-only `handoff.md` per package; work in progress lives in the shared tree and survives a dead session.

### What this plan knowingly trades away

| Traded | For | The cost if it bites |
|---|---|---|
| The owner's review of the pilot BEFORE fan-out | no idle agents | a rejected primitive is one file (recipes are central); a rejected composition habit may need touch-ups in the screens already built |
| A green working tree | zero merge work | agents cannot run `npm run build`; their whole-tree checks are noisy and are filtered by path; only INT's clean-tree build is authoritative |
| A period of dead names (bridge tokens, legacy type steps, alias variants) | no red window, no codemod on files that get rewritten anyway | a ratchet gate is the only thing that finds leftovers; closing must not be skipped |
| Five variants per element | D1's default ("Pulse is the one variant") | the Style Studio lists most elements as "nem használt"; 14 playground-only elements keep their old shapes |
| Design review of undrawn states | every state survives the rewrite | agents compose them from the kit; they are listed in each hand-off for Phase 2 and for the owner |
| A route-parent table, a stricter door rule, the drain-loop extraction | a smaller shell package | header parent and lit tab are kept in agreement by hand; noted for a later package |
| Pixel-exact ink-tight numerals | `text-box-trim` + per-face fallback offsets | +/- 2 pt on numeral positions is accepted in the definition of done |
| Desktop design | 360-430 pt only, as drawn | at 431 pt and wider the column is centred at 430 and nothing else is designed |

---

## 1. Decisions

### 1.1 Taken by this plan (veto at any time; none blocks a start)

| # | Decision | Reason |
|---|---|---|
| P1 | One shared tree + one clean verify worktree at `C:/Users/Petike/Documents/Cursor/tracker-verify` (detached, INT only) | `dev-verify.md` 6.6: N worktrees = N x 184 MB installs, N Vites in 3.1 GB, hard-coded proxy. The verify tree gives a per-commit green without freezing anybody, and is the only place a mutation probe may rewrite source |
| P2 | Restyle shared recipes in place; a new component is a new file; no `ui/pulse/` twin folder | this repo's recurring defect is a second implementation of a solved problem (`primitives.md` 8) |
| P3 | Bridge -> migrate -> delete for NAMES; VALUES switch in the first commit (D1) | `check-tokens` fails every build on an undeclared `var()` (46 glass references in 10 areas); a removed type step is silent |
| P4 | Legacy `control` variants become aliases immediately: `secondary` and `ghost` render the text-link look, `danger` renders danger TEXT, `shape="chip"` renders a word chip | 110 call sites stop drawing boxes and red fills with no feature edit; the names are counted by the ratchet and deleted in closing |
| P5 | Card tokens are neutralised (`--card-bg` transparent, `--card-border` transparent, `--card-radius` 0, sheens `none`) | 96 `<Surface>` are invisible on day one (`primitives.md` 4); padding stays, so unmigrated screens keep their layout |
| P6 | Element variants: D1's default. A component that is restyled stops reading its variant; INT sets `live: false` in `catalog.ts` and adds the id to `DORMANT` in the same commit. Final dormant set: E2, E6, E11, E14, E15, E21, E22, E25, E26 (+ E23, E24, E27 today). E21 = tap (what the database serves and the frames draw). E7's one product use (`LibraryPage` search) moves to `SearchField` in P03; like the 14 playground-only elements, E7 itself is not touched | `noUnusedLocals` and `check:elements` forbid a hook call that steers nothing; the gate's own honest path is `live: false` + `DORMANT` |
| P7 | Images: alpha baked into WebP ("knee alpha", K = 32), `src/assets/pulse/`, one renderer `ui/media/Pic.tsx`, no `mix-blend-` anywhere. 35 of the 49 images ship (0.84 MB, cap 1.0 MB). Lit tab icon = second raster | `assets.md` 5.2: lighten shows a black box under 7 of 12 ordinary parents, including Pulse's own route motion |
| P8 | Type: 16 steps named after the kit roles in kebab case; family and case bound once in a `@layer components` rule; `--text-giant: 7.75rem` is a plain length and `Numeral` applies `--giant-fluid: min(var(--text-giant), 31vw)` | Tailwind 4 cannot bind family or case to a step; a `min()` value is invisible to `check-type-scale` |
| P9 | Fonts: `@fontsource-variable/geist`, `@fontsource-variable/big-shoulders-display`, `@fontsource/geist-mono` (500 only); hand-written `@font-face` for `latin` + `latin-ext`; `font-display: block` for the display face, `swap` for the other two. Three families, as in all 59 frames | Pulse System is the law; the Review Brief's two-family proposal is listed there as not applied |
| P10 | `--text-1/2/3` are the fixed hexes; `--accent-pressed: color-mix(in oklab, var(--accent), black 9%)`; `--shadow-glow` and the focus ring derive from `--accent`; no lime literal outside the one `--accent` declaration | D1: one place where a pack could override the accent |
| P11 | Toast = top band, one visible at a time (queue of 3), optional trailing `Visszavonás` link, countdown drawn as the half-lit rule of `style-studio-2` (not rendered under reduced motion). `toast(message, kind?, options | fn)` is unchanged; `placement` stays in the type and is ignored until closing | Pulse System 4 and the frame agree; 12 raises and the undo contract must survive |
| P12 | Home owns `/notifications` in `navTabs.ts`, with a row in `check-nav-active` | system rule "the owning tab stays lit" + the gate's intent; the frame's parent eyebrow already says Kezdőlap |
| P13 | D2 = redirect: no session at `/workout` -> `<Navigate to="/library" replace />`; a FAILED session read gets an error state with `common.retry`; `workout.noneTitle` / `workout.noneBody` are deleted | one URL per screen (`shell-gates.md` 6.1 B); done in Phase 0 so the owner sees it on first tap |
| P14 | Sub-state goes into the URL through one hook, `src/lib/useUrlState.ts` (`?tab=`, `?view=`, `?muscle=`, `?step=`; replace, not push) | about 20 frames become addressable for capture, and the selection survives Back (a Pulse product gap) |
| P15 | Zero-inset floors in the shell tokens: top `max(env(safe-area-inset-top), 16px)`, bottom `max(env(safe-area-inset-bottom), 8px)`; at the design size nothing moves | the frames are drawn with both insets non-zero; a desktop browser reports 0 |
| P16 | The dev backend keeps its rate limiters ON; the capture tool logs in once per role and caches the ACCESS cookie for 12 minutes outside the repo | 7 fixture accounts x 1 login per 12 minutes stays under the limit of 10 logins per 15 minutes; a refused login makes the capture wait, never retry in a loop; no process setting is changed. `NODE_ENV=test` remains a fallback that needs the owner's yes |
| P17 | `ScreenHeader` takes the back target as a literal prop named `to` | `check-nav`'s door regex (`\bto=`) keeps counting exactly what it counts today; `/compose` and `/m` do not turn red by accident |
| P18 | Dead files are deleted by the package that owns the folder: `NutritionCard.tsx`, `MacroBars.tsx`, `AdminMetrics.tsx` (+ 14 `adminMetrics.*` keys), `SectionBadge.tsx`; `AccentPicker.tsx`, `GradientBuilder.tsx`, `ui/theme/*` go in the switch; `ui/TokenProof.tsx`, `coaching/Monogram.tsx`, `DataTable.tsx` in closing | they hold legacy class sites and keep dead i18n keys alive |
| P19 | Undrawn states are composed from the kit and listed in the hand-off. Home: the first not-yet-trained occurrence is the subject and takes the pill; further occurrences are list rows with a text `Indítás`; rest day / done = same block, no pill, trailing status word; a failed week read = `—` + `Újra` | `screens.md` 1; nothing may become unreachable |
| P20 | Followed as drawn and flagged for veto at review: the marketplace lead post shows title, coach and price; the two sharing controls on Haladás are switches; user covers are plain rectangles, radius 2, desaturated in feeds | Figma is the source (ADR-0020); Pulse System 5 for covers |
| P21 | Deferred, on purpose: route-parent table, stricter door rule, moving the outbox drain loop into a hook, `SelectSheet` as a primitive (a picker is `Sheet` + `RowStack` + `CheckMark`), masked password discs | each is real work that no frame needs to match |

### 1.2 Left to the owner (four; each has a default, so nothing waits)

| # | Question | Options | Recommended | Default if unanswered |
|---|---|---|---|---|
| Q1 | The mannequin (`ui/muscle-map`, 3 screens, and since D2 the idle Edzés tab) | (a) keep the vector map, re-toned graphite — the look he rejected; (b) the two neutral renders + SVG regions drawn over them, the five groove-less regions (front / side delts, neck front, adductors, abductors) drawn by anatomy; (c) first generate one lit reference per muscle, then derive the regions from them | (b) | lane G builds (b); until it lands the screens show the existing SVG on Pulse tokens. No package waits: `MuscleMap` props are frozen |
| Q2 | The coin store still sells Aurora and Ember for 250 coins, and after D1 a pack does nothing | (a) hide `theme.*` items on the client now and show the existing empty-store state; (b) leave them visible until the backend package; (c) do the backend delisting first | (a) — a display filter only; the server still sells to a forged request, so the backend package stays on the list | (a), inside P08 |
| Q3 | "Megjelenés" in Profil: with packs and translucency gone the section drawn in the approved frame has no content | (a) drop the section and its keys; (b) keep the heading with a line of new copy | (a) — (b) would be invented copy | (a); `settings-2` is then compared without that block |
| Q4 | Style Studio under D1's default: it stays a working screen but most elements read "nem használt" | (a) accept that; the studio page is restyled last (P24); (b) keep motion-only variants for the ten user-facing elements (about one extra L package plus rework in the player and coins); (c) cut studio, playground, catalogue and gate | (a) | (a) |

Asked once, at the start, as four option prompts. An answer that differs from the default becomes an INT request and a package note; it never rewinds finished packages silently.

---

## 2. Phase 0 — foundation

### 2.1 Roles, trees, ownership

| Role | Count | Writes | Never |
|---|---|---|---|
| INT (integrator) | exactly 1 | `frontend/src/ui/tokens/**`, `src/index.css`, `index.html`, `package.json`, lockfile, `vite.config.ts`, `public/**`, `src/lib/**`, `src/i18n/*.json`, `src/ui/feedback/catalog.ts`, `ElementStyleProvider.tsx`, the `build` chain, `scripts/pulse-budgets.json`, `progress.json` (through the CLI), every commit, seeds, dev servers, the verify tree | parallel with a second INT |
| Lane agent (A-G) | up to 8 (lanes B and E are two agents each) | the lane's files in `src/ui`, `src/app`, `src/assets`, `scripts` (table 2.3) + `docs/pipeline/pulse/pkg/<lane>/` | another lane's file, a feature file, a shared file above |
| Screen agent | up to 6 (8) | its package's feature files + `docs/pipeline/pulse/pkg/<PKG>/` | anything else — a need outside is a request file |
| Reviewer (Phase 2) | 4-6 | `docs/pipeline/pulse/review/` only | source |

- Shared tree: `C:/Users/Petike/Documents/Cursor/tracker` on `pulse-redesign`. One `npm run dev` (5173), one backend (3000, `DB_POOL_THREADS=4`).
- Verify tree: `git worktree add ../tracker-verify --detach pulse-redesign`, `npm ci` in its `frontend/` once after the font install. Only INT uses it: `npm run build`, `npm run preview` (4173), `node scripts/verify-gates.mjs`.
- Ownership is data: `frontend/scripts/pulse-owners.json` maps path globs to an owner id. `pulse-check` filters by it, `pulse-integrate` refuses a dirty path nobody owns.
- API-first rule for lanes: within its first minutes a lane writes compiling stubs of every export with final prop types, and its section of the kit reference `docs/pipeline/pulse/kit/<lane>.md` (component -> import -> props -> kit function -> frame that shows it). Other lanes and all screen agents code against that file, not against `src/ui` internals. Prop changes after that are additive only.

### 2.2 Order

| Step | Who | Parallel with | What | Committed state |
|---|---|---|---|---|
| INT-0 prep | INT | — | commit `docs/pipeline/pulse/**`; `npm run seed:dev-users && npm run seed:demo` in `backend/`, then with the backend stopped copy `data/app.db` to `data/app.pulse-baseline.db`; copy the asset production folder from the session temp dir to `TRACKER-mockups/5-pulse/kepek-forras/` (outside the repo, `assets.md` 2.5); write `progress.json` and one `pkg/<id>/brief.md` per package from section 3; ask Q1-Q4 | docs only |
| F1a theme engine out | INT | LE1, LD1 (script only), LG (research) | section 2.4 | `npm run build` green |
| F1b Pulse values + bridge | INT | same | section 2.4 | green |
| F1c fonts + type ramp | INT | same | section 2.4 | green; then create the verify tree |
| F1d proof | INT | same | built-app capture of `/`, `/login`, `/settings` with a stale `tracker.theme` in `localStorage` (with `pulse-shot` if lane E has delivered it, else the CDP probe of `dev-verify.md` Appendix A); font probes; recorded in `pkg/F1/handoff.md` | — |
| LA1 LB1 LC1 LD1 | 5 agents (lane B is two) | LE1/LE2, LF, LG | stage 1 of table 2.3 — exactly what Home and Auth need | integrated in the order D1, A1, B1, C1 |
| F2 | INT | lanes | D2 redirect in `features/workout/WorkoutPlayer.tsx` + dead keys (P13); `check-pulse --init` (budgets from the bridged tree), then `check:pulse` and `check:assets` wired into `build`; aurora retired: the eight remaining `<AuroraBackdrop` mounts in `AuthPage`, `MarketplacePage`, `PostPage`, `CoachProfilePage` removed (mount line + import only), `ui/shell/AuroraBackdrop.tsx`, `--aurora`, `--noise-overlay` and `check:aurora` deleted in the same commit as its heir lands (2.6) | green |
| Wave 0 | 2 screen agents | LA2 LB2 LC2 LD2 LE2 LF LG | P01 Home, P11 Auth | first two real screens |
| Stage 2 integrations | INT | Wave 0 | A2, B2, C2, D2, E2, F as they report ready | queue of section 3 opens per package as its `needs` are met |

Sequential, and why: F1a-F1c share `tokens.css`, `index.css`, `index.html`, `package.json`, `cn.ts`, `src/i18n/*.json` and run `npm install`. Everything else is parallel because no two lanes own the same file.
Buildable after each step: yes. There is NO deliberate red window in the commit history — every commit is built green before it is made: in the shared tree while INT is the only writer of `src` (F1), in the verify tree from then on. The shared working tree may be red between integrations, by design (section 5). Lane stages are integrated through the same `pulse-integrate <id>` as screen packages.

### 2.3 The lanes (who owns which file)

| Lane | Stage 1 (blocks Wave 0) | Stage 2 (blocks the queue) | Owns | Size |
|---|---|---|---|---|
| A — actions, inputs, selection | `control.ts` (variant `primary` / `link` + aliases P4, `size: 'lg' \| 'sm'` = 56 / 44, `tone: 'default' \| 'danger'`, bare icon shape, pressed scale 0.98, `--disabled-opacity`, disabled pill = `s2` fill + `t3` label); `Pressable.tsx` (busy = three dots, no glow); new `TextLink.tsx` (button or router link, lead / trail glyph, `role: 'cap' \| 'body'`, danger); new `BadgeCount.tsx`; `Field.tsx` (underline, focus 2 px lime, error 2 px danger, label `cap-m`, text 16, lead / trail slots, label + `aria-describedby` kept); `variants/E6Segmented.tsx` (`layout: 'hug' \| 'equal'`, ink mark, radiogroup + roving tabindex and the async busy / done / failed layer kept, variant read removed); `nav/LanguageToggle.tsx` on Segmented | new `ChipRow.tsx` (single / multi / wrap / bleed, 2 pt lime mark); `Toggle.tsx` rebuilt on it (`role="checkbox"` kept); new `SearchField.tsx`, `TextArea.tsx` (auto-grow, counter), `NumberStepper.tsx`, `CheckMark.tsx` (set check + radio mark), `DateTrigger.tsx`; `Switch.tsx` (48 x 28, `role="switch"` kept); `variants/E2CopyButton.tsx` (link look + check glyph, variant read removed) | `src/ui/primitives/**` except `Surface*`; `src/ui/nav/LanguageToggle.tsx`; the two variant files named | L |
| B — structure and data | new `shell/Screen.tsx` (gutter, top inset, 32 gap, `overflow-x: clip`, status-bar mask); new `shell/ScreenHeader.tsx` (`kind: 'greet' \| 'root' \| 'push' \| 'section'`, back target prop `to`, one trailing node); `data/SectionHeader.tsx` rewritten (strong rule -> eyebrow + one trailing node; `icon` optional and unrendered) + new `data/Section.tsx`, `data/Rule.tsx`; new `data/ListRow.tsx` (+ `RowStack`); new `data/Numeral.tsx` (`Numeral`, `Fraction`), `data/StatBlock.tsx`; new `data/SegmentBar.tsx`; new `data/MacroColumns.tsx`; `feedback/EmptyState.tsx` (left-aligned, `icon` / `badge` / `size` optional and unrendered, only a pill is stretched); `feedback/ScreenSkeleton.tsx` (`s2`, radius 2); new `feedback/NoticeLine.tsx` | new `data/LedgerRow.tsx`, `data/ProgressBar.tsx`, `Stepper` (in `SegmentBar.tsx`), `data/Monogram.tsx` (28 / 64 / 176, dot, texture with an ink fallback); `feedback/CountUp.tsx` inside `Numeral` | `src/ui/data/**` except `SummaryTile.tsx`, `DataTable.tsx`; `src/ui/shell/Screen*.tsx`; the three `feedback` files named | L |
| C — shell | `app/navTabs.ts` (icon KEY, `import type { TabIconKey }` only, `PILL_MAX_TABS` gone, `/notifications` owned by Home); `nav/BottomNav.tsx` (no surface, equal cells, inset 10 / 12 / 8 and icon 32 / 32 / 28 by count, both rasters of every tab always in the DOM with opacity switched, sentence-case label, bottom fade in the same `pointer-events-none` layer, one `isTabActive` expression feeding lit state and `aria-current`, both horizontal insets, no clamp, E11 read removed); `app/AppLayout.tsx` (no aurora mount, padding from the new tokens); new `app/PublicLayout.tsx` + `app/router.tsx` (public layout route, `HomePage` / `AuthPage` lazy, a route error boundary); the kit specimen as `/playground?view=kit` (no new route, so no new gate exemption); new `shell/Dock.tsx` (with / without tabs, own fade, published height); new `lib/useUrlState.ts` (handed to INT for commit); the E11 demo and the `view=kit` branch in `features/playground/PlaygroundPage.tsx` | status zone: `feedback/ToastHost.tsx` + the `Toast` in `variants/E12E16.tsx` as the top band (P11), `shell/OfflineIndicator.tsx` markup as a `warn` `NoticeLine` in flow — drain loop, `/healthz` body check and `--offline-h` untouched; `Sheet` in `variants/E14E20.tsx` (`s2`, top radius 28, hairline edge, 60 % scrim, no blur or shadow, contract unchanged, variant read removed); new `feedback/ConfirmSheet.tsx`; `shell/CommandPalette.tsx` on sheet tokens (desktop only) | `src/app/**`; `src/ui/nav/BottomNav.tsx`; `src/ui/shell/{Dock,OfflineIndicator,CommandPalette}.tsx`; `ToastHost.tsx`; the two variant files named; the playground demo until P24 starts | L |
| D — assets and media | `frontend/assets-src/pulse/assets.json`; `scripts/build-pulse-assets.mjs` (sharp resolved from `backend/node_modules` with `createRequire`, no backend file touched; masters dir is an argument); generated and committed `src/assets/pulse/img/*.webp` (49 files), `slots.ts`, `urls.ts`; hand-written `src/assets/pulse/index.ts`; new `ui/media/Pic.tsx` (box reserved from the manifest, `srcSet` + `sizes`, `bleed`, lights-on fade, lit pair); `scripts/check-assets.mjs` + probe | new `ui/media/UserPhoto.tsx` (required `ratio`, radius 2, optional `desaturate`) | `frontend/assets-src/**`, `src/assets/pulse/**`, `src/ui/media/**`, the two scripts | M |
| E — tooling and gates (starts during F1) | agent E-t: `scripts/pulse-progress.mjs`, `pulse-owners.json`, `pulse-check.mjs`, `pulse-i18n.mjs`, `pulse-shot.mjs` + `pulse-frames.json`, `pulse-integrate.mjs` (section 5); agent E-g: `scripts/check-pulse.mjs` (budgets are initialised by INT in F2), `--dir` for `check-i18n.mjs` | E-g: the other gate changes of 2.6, `scripts/verify-gates.mjs`; E-t: fixtures and the pinned clock in `pulse-shot` | `frontend/scripts/**` except lane D's two files; E-t the `pulse-*` files, E-g the `check-*` and `verify-*` files | L + M |
| F — charts | — | `feedback/TrendChart.tsx` (no area, hairline axes, 1.5 px line, one end dot, dotted gap, mono labels, sr-only table kept, positions still from `chartGeometry.plot()`), `ProgressChart.tsx`, new `feedback/Sparkline.tsx`; `chartGeometry.ts` stays pure | those four files | M |
| G — mannequin (Q1) | — | new `muscle-map/regions.ts`; the inside of `MuscleMap.tsx` (base `Pic` + SVG overlay in the image's pixel space, regions as buttons exactly as today, lit by `var(--accent)` at 1 / 0.4); `shapes.ts` + `landmarks.ts` deleted; regression picture against the four lit renders (IoU >= 0.95) | `src/ui/muscle-map/**` | L, own track |

Lane B is also run by two agents with disjoint files (structure: `Screen`, `ScreenHeader`, `Section*`, `Rule`, `ListRow`, `EmptyState`, `ScreenSkeleton`, `NoticeLine`; data: `Numeral`, `StatBlock`, `SegmentBar`, `MacroColumns`, `LedgerRow`, `ProgressBar`, `Monogram`). Each lane also owns one specimen file, `src/ui/specimen/<lane>.tsx`, which the kit page composes. The cap of 8 writers holds in Phase 0 too. Priority when slots are short: Wave 0, then A2 / B2 / C2, then E, then D2, F and G.

Two rules keep the lanes apart: every change to an existing export is additive (old props keep compiling at all 300+ call sites), and a lane that needs a token asks INT (request file) instead of typing a value — `tokens.css` is frozen for everybody but INT after F1b.

### 2.4 The switch (F1a-F1c), file by file

F1a — theme engine out (D1). Delete `src/ui/theme/{ThemeProvider,contrast,palette}.tsx|ts`, `features/settings/{ThemeStudio,useThemeSync,AccentPicker,GradientBuilder}.tsx|ts`; remove `TransparencyChoice` and the `<ThemeStudio />` mount from `SettingsPage.tsx`, the provider mount from `app/providers.tsx`, the inline pre-paint script from `index.html`; delete from hu / en / de together: `settings.themePacks`, `settings.themePack.*`, `previewTitle`, `previewBody`, `saveTheme`, `themeSaveError`, the five `transparency*` keys, `accentDefault`, `accentCustom`, `contrastRatioPass`, `contrastRatioFail`, `contrastInvalid`, `settings.appearance` (Q3 default). In `tokens.css`: `:root, [data-theme='midnight']` becomes `:root`; the six other pack blocks and the three glass-fallback blocks are deleted. Nothing reads `localStorage['tracker.theme']` or `GET /me/theme` afterwards, which is how "must not break on a stored pack" is met.

F1b — Pulse values and the bridge, all in `tokens.css` (+ `index.css` `.screen-x` at 24 px, 16 px below 376 px, both safe-area `max()` forms kept; `index.html` `theme-color`; `public/manifest.webmanifest` two colours):

| Layer | Tokens |
|---|---|
| 1 primitives (`@theme static`) | `--radius-bar: 1px`; component metrics `--row-h: 56px`, `--row-h-sub: 64px`, `--row-h-ledger: 76px`, `--control-h-primary: 56px`, `--switch-w: 48px`, `--switch-h: 28px`, `--mark-h: 2px`, `--seg-h: 6px`, `--bar-h: 4px`, `--dot: 6px`, `--thumb: 48px`, `--tab-icon: 32px`, `--tab-icon-dense: 28px`, `--disabled-opacity: 0.4`, `--pressed-opacity: 0.6`; shell metrics `--nav-h: 56px`, `--inset-top: max(env(safe-area-inset-top), 16px)`, `--inset-bottom: max(env(safe-area-inset-bottom), 8px)`, `--nav-bottom: calc(var(--inset-bottom) + 2px)`, `--nav-reserve: calc(var(--nav-h) + var(--nav-bottom))` (92 — what a full-height screen subtracts), `--fade-h: calc(var(--nav-reserve) + 38px)` (130), `--content-pad-b: calc(var(--nav-reserve) + 48px)` (140 — what a scrolling page pads), `--dock-bottom: calc(var(--nav-reserve) + 12px)` (104), `--dock-bottom-bare: calc(var(--inset-bottom) + 16px)` (50), `--header-top-root: calc(var(--inset-top) + 10px)` (72), `--header-top-push: calc(var(--inset-top) + 2px)` (64), `--band-pad-top: calc(env(safe-area-inset-top) + 6px)`; motion, spacing names, z ladder, `--target-min`: unchanged |
| 2 semantics (`:root`) | `--surface-0: #0B0D0A`, `-1: #141712`, `-2: #1E2219`, `-3: #2A2F24`; `--ink: 242 245 234`; `--text-1: #F2F5EA`, `-2: #A9B09D`, `-3: #858C79`; `--accent: #CBFF2E`; `--accent-fg: var(--surface-0)`; `--accent-pressed` (P10); new `--edge: rgb(var(--ink) / 0.36)`, `--track: rgb(255 255 255 / 0.10)`; `--surface-border` white 8 %, `--surface-border-strong` white 14 %; `--scrim` black 60 %; `--shadow-glow: 0 0 20px color-mix(in srgb, var(--accent) 38%, transparent), 0 4px 10px -2px color-mix(in srgb, var(--accent) 30%, transparent)`; `--radius-button` full, `--radius-chip` full, `--radius-sheet` 28px, `--radius-field` 0, `--radius-card` 0; `--border-width: 1px`; `--control-h: 44px`; `--danger` / `--warning` / `--success` unchanged |
| 3 component | `--field-bg: transparent`, `--field-border: var(--edge)`; `--sheet-bg: var(--surface-2)`; `--toast-bg: var(--surface-0)`; `--nav-fg-active: var(--text-1)`, `--nav-fg-idle: var(--text-2)`; new `--nav-fade` and `--dock-fade` (canvas colour, transparent -> solid at 28 % / 50 %); `--skeleton-base: var(--surface-2)`; new `--giant-fluid`; `--animate-pill-rest` and `--animate-sheen` on `var(--duration-ambient)` |
| `@theme inline` | new `--color-edge`, `--color-hair`, `--color-hair-strong`, `--color-track`; `--shadow-glow` self-reference; `--radius-bar` |
| Bridge (declared, neutral, deleted in closing) | `--glass-1/2/3`, `--card-bg`, `--card-border`, `--card-rim` -> transparent; `--nav-bg` -> `var(--surface-0)` (opaque until the bar is rebuilt); `--aurora`, `--noise-overlay`, `--gradient-brand`, `--glass-sheen` -> `none`; every `--blur-*`, `--*-blur` -> `0px`; `--shadow-overlay*`, `--sheet-shadow` -> `none`; `--glass-lip` / `--glass-underside` -> a transparent zero shadow; `--tile-tint*`, `--accent-50..950`, `--accent-hover`, all `-subtle` / `-border` / `--on-*` forms, `--info`, `--scrim-strong`, `--nav-dock-offset`, `--content-pad-b-lg` stay declared with Pulse-neutral values. `--surface-border` / `--surface-border-strong` carry the same values as `--color-hair` / `--color-hair-strong` and are the legacy spelling |

F1c — fonts and type. `npm install @fontsource-variable/geist @fontsource-variable/big-shoulders-display @fontsource/geist-mono` and `npm uninstall @fontsource-variable/inter @fontsource/space-grotesk` (the only `npm install` of Phase 0; dev server restarted after). New `src/ui/tokens/fonts.css` (hand-written `@font-face`, package `files/*.woff2`, `latin` + `latin-ext`). `tokens.css`: `--font-display`, `--font-body` / `--font-sans`, `--font-mono`; the 16 steps `giant num display-xl display eyebrow title body body-m body-b cap cap-m tab tab-on data-l data micro` with the metrics of `tokens-type.md` 3.1; the seven legacy-only steps stay, re-pointed (`title-1` -> 32/34/700, `title-2` -> 22/28/600, `title-3` -> 16/22/600, `body-strong` -> 16/22/500, `body-s` -> 13/18/400, `caption` -> 13/18/500, `timer` -> 48/48/900). `src/lib/cn.ts` `TYPE_STEPS` lists all 23 in the same commit. `index.css`: the `@layer components` binding rule (display face: `giant num display-xl display eyebrow timer`; mono: `data-l data micro`; uppercase: `display-xl display eyebrow micro`); `h1, h2, h3` leave the display-face rule; the two old `@import`s go. `vite.config.ts`: `build.assetsInlineLimit` callback (no inlining under `assets/pulse`). A font preload is attempted and checked in `dist/`; if the hashed URL is not rewritten it moves to closing — not a blocker.

What the owner can open after F1: the whole app on the Pulse canvas, lime accent, three Pulse faces, every card invisible. Rough, and deliberately so.

### 2.5 The mapping table (Pulse component -> code)

| Pulse component (kit fn) | Code | Change | Lane.stage |
|---|---|---|---|
| Tab bar (`tabBar`, `chrome`) | `ui/nav/BottomNav.tsx`, `app/navTabs.ts`, `app/AppLayout.tsx` | restyle, structural | C1 |
| Primary pill (`btnPrimary`) | `control.ts` + `Pressable.tsx` | restyle + `size` axis | A1 |
| Text link / destructive link (`textLink`) | new `TextLink.tsx`; `variant: 'link'`, `tone: 'danger'` | new | A1 |
| Icon button + badge (`iconBtn`, `badgeCount`) | `control` icon shape, new `BadgeCount.tsx` | restyle + new | A1 |
| Chips (`chipRow`) | new `ChipRow.tsx`; `Toggle.tsx` | new + rebuild | A2 |
| Segmented switch (`segSwitch`) | `variants/E6Segmented.tsx`; replaces 4 hand-rolled tablists (in their packages) | restyle | A1 |
| Underline / search field (`inputField`, `searchField`) | `Field.tsx`; new `SearchField.tsx`, `TextArea.tsx`, `NumberStepper.tsx`, `DateTrigger.tsx` | restyle + new | A1 / A2 |
| Switch (`uiSwitch`) | `Switch.tsx` | restyle | A2 |
| Set check / radio mark (`setCheck`) | new `CheckMark.tsx` | new | A2 |
| Screen headers (`scaffold`, `screenHead`) | new `shell/Screen.tsx`, `shell/ScreenHeader.tsx` | new | B1 |
| Section, rules (`sect`, `secHead`, `rule`) | `data/SectionHeader.tsx`, new `Section.tsx`, `Rule.tsx` | rewrite + new | B1 |
| List row (`listRow`, `rowStack`) | new `data/ListRow.tsx` | new | B1 |
| Numeral, fraction, stat block | new `data/Numeral.tsx`, `StatBlock.tsx` (+ `CountUp`) | new | B1 |
| Ledger row (`ledgerRow`) | new `data/LedgerRow.tsx` (replaces `SummaryTile`) | new | B2 |
| Segment bar, stepper (`segBar`, `stepper`) | new `data/SegmentBar.tsx` | new | B1 / B2 |
| Progress bar, macro columns | new `data/ProgressBar.tsx`, `data/MacroColumns.tsx` | new | B2 / B1 |
| Monogram (`monogramMark`) | new `data/Monogram.tsx` | new | B2 |
| Empty / error state, skeleton | `feedback/EmptyState.tsx`, `ScreenSkeleton.tsx` | restyle | B1 |
| Notice line, toast band (`noticeLine`, `showToast`) | new `feedback/NoticeLine.tsx`; `ToastHost.tsx`, `E12E16.tsx`, `OfflineIndicator.tsx` | new + restyle | B1 / C2 |
| Bottom sheet (`bottomSheet`) | `Sheet` in `E14E20.tsx`; new `ConfirmSheet.tsx` | restyle + new | C2 |
| Docked action, bottom fade (`dockAction`) | new `shell/Dock.tsx`; fade inside `BottomNav.tsx` | new | C1 |
| Image (`pic`) | new `ui/media/Pic.tsx`, `UserPhoto.tsx`, `src/assets/pulse/**` | new | D1 / D2 |
| Sparkline / chart | `TrendChart.tsx`, new `Sparkline.tsx` | restyle + new | F |
| Chat message (`chatMsg`) | `features/chat/ChatPanel.tsx` | package P13 | — |
| No Pulse heir | `Surface`, `surfaceRecipe`, `SummaryTile`, `Gauge`, `AuroraBackdrop`, `DataTable`, legacy variants | invisible or aliased now, deleted in closing | F1b / Z |

### 2.6 Gates, re-pointed (lane E writes, INT wires; every new or changed gate ships a probe)

| Gate | Change | When | Probe (run by `verify-gates` in the verify tree) |
|---|---|---|---|
| `check-pulse.mjs` (NEW, `check:pulse`) | the one ratchet for the no-box law and the legacy names. Counts per file: `<Surface`, `<SummaryTile`, `<Gauge`, `variant="secondary" / "ghost" / "danger"`, `shape="chip"`, `rounded-card`, `rounded-field`, shaped `<Skeleton>`, `bg-surface-1`, `bg-*-subtle`, `backdrop-blur`, `shadow-` other than the glow, raw `<input>` / `<textarea>` / `<select>` in features, the seven legacy type classes. `pulse-budgets.json` holds today's count per file (`--init` after F1); a file may not exceed its budget and an unlisted file must be zero. INT lowers budgets at each integration (`--tighten <paths>`); closing switches to `--strict` and deletes the budget file | LE1 (E-g), wired in F2 | plant `<Surface>` in a zero-budget file; exceed a budget by one |
| `check-assets.mjs` (NEW, `check:assets`) | the seven assertions of `assets.md` 4.4, including "every tab key has both rasters" and "no `mix-blend-` in `src`" | LD1, wired in F2 | delete one `-lit` file; add `mix-blend-lighten` to a feature file |
| `check-aurora.mjs` | retired in the F2 commit that removes the last of the nine mounts, the component and its tokens; its heir is assertion 6 of `check-assets` (the same defect class, without an ancestor walk because nothing blends) | F2 | the heir's probe |
| `check-type-scale.mjs` | value test accepts `min(` / `max(` / `clamp(` / `calc(`; third leg: the binding rule in `index.css` covers exactly the steps declared display / mono / uppercase in `tokens.css` | LE2 | declare a step without listing it; drop `.text-eyebrow` from the binding |
| `check-tokens.mjs` | + canvas agreement: `theme-color` and the two manifest colours equal `--surface-0` | LE2 | change one manifest colour |
| `check-nav.mjs` + `verify-nav-gate.mjs` | comment-stripped safe-area test; named required door `/library` from `WorkoutPlayer.tsx`; the six probe anchors re-written for the new bar | LE2 after C1 | the six cases + delete the `Navigate` |
| `check-nav-active.mjs` | rows for `/notifications` (Home, three roles); completeness: every child route of the authenticated layout is in the table or in `NO_TAB_BY_DESIGN` (`/playground`) | LE2 after C1 | add a route with no row |
| `check-safe-area.mjs` | `sticky top-0` treated as `fixed`; an `EXEMPT` entry fails when the rule would not have flagged its file; the scaffold file must mention `safe-area-inset-top` | LE2 after B1, C1 | remove the bottom inset from the bar |
| `check-element-roster.mjs` | no rule change; INT edits `DORMANT` and `catalog.ts` per integration (P6) | every integration that removes a read | remove one hook call only |
| `check-i18n.mjs` | `--dir <path>` for dry runs; default unchanged | LE1 | delete one key from `de.json` |
| `verify-gates.mjs` (NEW, not in `build`) | runs every probe serially, restores each file byte for byte | LE2 | — |

The `build` chain at the end of Phase 0: `check:tokens, check:i18n, check:nav, check:nav-active, check:interval, check:elements, check:autosave, check:type-scale, check:pulse, check:assets, check:safe-area, verify:outbox, tsc -b, vite build`.

---

## 3. Phase 1 — screens in parallel

### 3.1 Rules every package inherits

1. A package owns exactly the files in its row. It writes there and in `docs/pipeline/pulse/pkg/<PKG>/`, nowhere else.
2. Must NOT touch, ever: `frontend/src/ui/**`, `src/app/**`, `src/lib/**`, `src/assets/**`, `src/i18n/**`, `src/index.css`, `index.html`, `package.json`, `vite.config.ts`, `public/**`, `frontend/scripts/**`, `backend/**`, another package's files, and every hook / logic file: `use*.ts`, `cues.ts`, `intervalPlan.ts`, `wakeLock.ts`, `kindIcons.ts`, `useAutosave.ts` (its eight mirrored lines are a gate), `lib/outbox.ts`.
3. The unit of work is "rewrite the render of each owned page against the kit; keep everything above the `return`". Routes, query keys, mutations, zod schemas and existing i18n keys do not change.
4. Six JSX files are imported across packages and keep their exported names and props: `chat/NotificationBell.tsx` (P01), `chat/ChatPanel.tsx` (P13), `marketplace/PublicChrome.tsx` + `DocRenderer.tsx` (P21), `playground/PlaygroundPage.tsx` (P24), `coaching/Monogram.tsx` (nobody — deleted in closing once P12 and P14 use `ui/data/Monogram`).
5. Nothing of `screens.md` section 4 is implemented as a working path, no copy is invented (a string that is not in the frame, the inventory or `hu.json` is a `copyQuestions` entry), no "finish workout" control (D3), no new door except Home's library row (D2).
6. Every door in `screens.md` 1.4 that lives in an owned file survives, spelled so `check-nav` still sees it (`to="…"`, a template `to={…}`, or `navigate('…')`).
7. A package starts only when every lane stage in its `needs` is `done` in `progress.json`.

### 3.2 The packages

Inputs for every row: the listed frames at `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x/<frame>@2x.png`, the sheet `osszesitok/<screen>.png`, `figma-build/app/<frame>.body.js` for exact sizes, the inventory note named, `docs/pipeline/pulse/kit/*.md`, and the screen's block in `understand/screens.md`. Accounts: M `user@`, C `coach@`, A `admin@`, N `demo.nagy.balazs@`, R `demo.coach.szilagyi.reka@`, K `demo.kovacs.eszter@` and T `demo.toth.reka@` (clients with a plan and no live session) — all `@tracker.local`.

| ID | Screens — frames | Owns (under `frontend/src/features/`) | i18n namespaces | Inventory note (`docs/brain/58-Pulse/`) | Needs | Accounts | Size |
|---|---|---|---|---|---|---|---|
| P01 | Kezdőlap — `home-1` `home-2` `home-3` | `home/{HomePage,WeekStrip,HomeNutrition}.tsx`, `chat/NotificationBell.tsx` | `home` | `Feature inventory.md` (1) + `_jovahagyott-v1-home@2x.png` | A1 B1 C1 D1 | M (`home-2`), K on one of her plan days or the pinned clock (`home-1`), N (`home-3`) | M |
| P02 | Edzéslejátszó — `workout-1` `workout-2` (`workout-3` is superseded by D2: N at `/workout` must show `library-1`) | `workout/{WorkoutPlayer,SetRow,RestTimer,IntervalStage}.tsx` | `workout` | `Screens/workout.md` | A2 B2 C2 D1 | M read-only; mutations on T only; `workout-2` by fixture | XL |
| P03 | Gyakorlatok — `library-1` `library-2` `library-3` | `library/LibraryPage.tsx` | `library` (list keys), `muscle`, `muscleMap` | `Feature inventory.md` (2) | A2 B1 | M | L |
| P04 | Gyakorlat részletei — `exercise-detail-1` `-2` | `library/ExerciseDetailPage.tsx`; deletes `library/SectionBadge.tsx` | `library` (detail keys) | `Screens/exercise-detail.md` | A1 B1 D1 | M | M |
| P05 | Étkezés — `nutrition-1` `-2` | `nutrition/NutritionPage.tsx`; deletes `NutritionCard.tsx`, `MacroBars.tsx` | `nutrition` | `Screens/nutrition.md` | A2 B2 D1 | M (food logged stays; say so) | M |
| P06 | Haladás — `progress-1` `-2` `-3` | `progress/ProgressPage.tsx` | `progress` | `Screens/progress.md` | A2 B2 C2 F | M | L |
| P07 | Profil — `settings-1` `-2` | `settings/{SettingsPage,CueSettings,EquipmentSection}.tsx` | `settings` | `Feature inventory.md` (3) + `_jovahagyott-v1-profile@2x.png` | A2 B2 F | M, A (admin row) | L |
| P08 | Érmék — `coins-1` `-2` `-3` | `coins/{CoinsPage,CoinBalance}.tsx` | `coins`, `achievement` | `Screens/coins.md` | A1 B2 C2 D1 | M | M |
| P09 | Értesítések — `notifications-1` `-2` | `chat/NotificationsPage.tsx` | `notifications` | `Screens/notifications.md` | A1 B1 | N; `-1` by fixture (single-use on M) | S |
| P10 | Onboarding — `onboarding-1` `-2` `-3` | `onboarding/OnboardingPage.tsx` | `onboarding` | `Screens/onboarding.md` | A2 B2 C1 | C (5/5); `-2` `-3` by fixture | L |
| P11 | Belépés, regisztráció — `auth-1` `auth-2` | `auth/AuthPage.tsx` | `auth` | `Screens/auth.md` | A1 C1 D1 | signed out | S |
| P12 | Edzői kezdőlap — `coach-dashboard-1` `-2` `-3` | `coaching/CoachDashboard.tsx` | `coaching` (dashboard keys) | `Screens/coach-dashboard.md` | A2 B2 C2 | C; `-2` by fixture (a real mint cannot be undone) | L |
| P13 | Csevegés — `coach-chat-1` `-2` | `chat/{ChatPage,ChatPanel}.tsx` | `chat` | `Screens/coach-chat.md` | A2 B2 C1 | C | M |
| P14 | Kliens adatlap, frame + Terv — `client-detail-1` | `coaching/{ClientDetailPage,PlanTab,ClientEquipmentCard,ChatTab}.tsx` | `coaching` (client keys) | `Screens/client-detail.md` | A2 B2 C2 | C | L |
| P15 | Kliens adatlap, Táplálkozás + Haladás — `client-detail-2` `-3` | `coaching/{NutritionTab,ProgressTab}.tsx` | `coaching` (tab keys) | `Screens/client-detail.md` | A2 B2 F | C | L |
| P16 | Edzéstervek — `coach-plans-1` `-2` | `plans/PlanListPage.tsx` | `plans` (list keys) | `Screens/coach-plans.md` | A1 B2 D1 | C, R | S |
| P17 | Tervszerkesztő — `plan-editor-1` `-2` `-3` | `plans/PlanEditorPage.tsx` | `plans` (editor keys) | `Screens/plan-editor.md` | A2 B2 C2 | C (open, never save) | XL |
| P18 | Piactéri pult — `compose-hub-1` `-2` | `compose/ComposePage.tsx` | `compose` (hub keys) | `Screens/compose-hub.md` | A2 B2 C2 | C | L |
| P19 | Edzői profil szerkesztő — `compose-profile-1` `-2` | `compose/{ProfileEditorPage,HandleField}.tsx` | `compose` (profile keys) | `Screens/compose-profile.md` | A2 B2 C2; P21 for the preview | C | L |
| P20 | Poszt szerkesztő — `compose-post-1` `-2` | `compose/PostEditorPage.tsx` | `compose` (post keys) | `Screens/compose-post.md` | A2 B1 C2 D2 | C; `-1` structure only (no seeded cover) | L |
| P21 | Poszt részletei + nyilvános edzői profil — `post-detail-1` `-2`, `coach-profile-1` `-2`; `post-detail-3` is the spec of `DocRenderer`, not a screen | `marketplace/{PublicChrome,DocRenderer,PostPage,CoachProfilePage}.tsx` | `public`, `marketplace` (post, profile keys) | `Screens/post-detail.md`, `Screens/coach-profile.md` | A1 B2 C1 D2 | signed out | L |
| P22 | Piactér — `marketplace-1` `-2` | `marketplace/MarketplacePage.tsx` | `marketplace` (feed keys) | `Screens/marketplace.md` | A2 B1 D2; P21 integrated | signed out | M |
| P23 | Admin — `admin-1` `-2` `-3` | `admin/{AdminPage,AdminShell,UserSearch,ModerationQueue,MarketplaceQueue}.tsx`; deletes `AdminMetrics.tsx` | `admin`, `adminUsers`, `adminMetrics` | `Screens/admin.md` | A2 B2 D2 | A (open a row, never decide) | L |
| P24 | Elem-stílus stúdió — `style-studio-1` `-2` | `admin/StyleStudioPage.tsx`, `playground/PlaygroundPage.tsx` | `studio` | `Screens/style-studio.md` | every lane; Q4 | A; `-2` by fixture (a save is global) | M |

Per-package musts that are easy to lose (each also stands in the package's `brief.md`):

| Package | Must |
|---|---|
| P01 | keep `navigate('/library')` as a permanent row (D2), both `/workout` links, the `/nutrition` link, the bell's `/notifications` link; failed week read = `—` + `Újra`, never 0 |
| P02 | keep the D2 redirect and the error state from F2; the one-viewport height now subtracts `--nav-reserve` and `--offline-h`; rest timer in flow; failed-check `Újra` / `Visszavonás`, withdrawn row, the four interval-stage states and the stand-in hero survive; remove the E21 / E22 reads and say so; only `/sets/:id/check` and `/void` stay queueable |
| P03 | text-only rows (the list API has no equipment key); `FeedbackField` -> `SearchField`; selection in `?view=` / `?muscle=`; render `muscleMap.filterHint` |
| P04 | equipment still only through `EQUIPMENT_STILL`, name alone when it is `null` |
| P07 | three ledger rows read `useCoins` / `useProgress`; a failed read prints `—`; the `/coins` row and the admin row stay (the admin row is `/admin`'s second door) |
| P08 | Q2 default: filter `theme.*` items, show `coins.storeEmptyTitle`; the arc and the two tiles go (no honest data); remove the E25 / E26 reads and say so |
| P09 | the bar lights Home; no invented sender names or bodies |
| P12 | keep the `Tervek` link (door to `/coach/plans`); the roster moves under the hero; revoke stays unconfirmed (as today — a confirm sheet would be new behaviour) |
| P13 | `ChatPanel` props frozen; composer through `Dock`; no bubbles |
| P14 | `ChatTab`'s link is the ONLY door to the chat screen; "Edzés / 28 nap" from the roster cache or `—`, never 0; the account state on the monogram dot gets an accessible label (new key) |
| P17 | all ten mutations, reorder, undo toasts and offline-disabled controls survive; no date field is invented |
| P19, P20 | their back links are `/compose`'s only doors; `useAutosave.ts` untouched; "Esemény" is drawn, no date field added |
| P21 | its back links are `/m`'s only doors; `DocRenderer` exports and props frozen (P19's preview) |
| P23 | keep the `Stílus stúdió` link (only door to `/admin/styles`); the account list becomes two-line rows built from `ListRow`; the undrawn Piactér tab is composed in the moderation grammar |

### 3.3 How shared files are protected

**i18n.** The three bundles are written only by `frontend/scripts/pulse-i18n.mjs`, run only by INT. A screen agent hands in `docs/pipeline/pulse/pkg/<PKG>/i18n.patch.json`:

```json
{
  "package": "P07",
  "namespaces": ["settings"],
  "add": {
    "settings.unlockedLabel": { "hu": "feloldva", "en": "unlocked", "de": "freigeschaltet", "source": "settings-1@2x.png, ledger row Eredmények" }
  },
  "change": {
    "settings.someKey": { "hu": "…", "en": "…", "de": "…", "why": "…" }
  },
  "remove": ["settings.oldHint"],
  "identicalByDesign": { "settings.kgUnit": "unit symbol, the same in every language" },
  "copyQuestions": [
    { "where": "heading over the other metrics", "frame": "progress-1", "note": "no string is drawn; left out" }
  ]
}
```

Rules the tool enforces before it writes anything: every `add` / `change` carries `hu`, `en` and `de`; `{{placeholders}}` are identical in the three; keys sit inside the package's `namespaces` (a `common.*`, `nav.*`, `offline.*` or `palette.*` key is an INT request); a key equal in two languages needs an `identicalByDesign` reason (the tool adds it to `UNTRANSLATED_BY_DESIGN`); an `add` has a consumer in the package's files and a `remove` has none left anywhere in `src`; no key is also touched by another pending patch. `source` must name the frame, the inventory line or the existing key the Hungarian came from.

- Agent: `node scripts/pulse-i18n.mjs check P07` — read-only; builds the merged bundles in a temp dir and runs `check-i18n.mjs --dir` on them.
- INT, on request or at integration: `apply P07` writes the working-tree bundles (so the agent's dev captures show real strings, not key paths).
- INT, at integration: `stage P07` writes HEAD's bundles + this one patch straight into the git index, so the commit carries this package's keys and no other package's early-applied keys (a clean-tree build would call those dead).

**Everything else shared.** A screen agent that needs a token, a prop, a new primitive, a shell change, a `common.*` key or a decision writes `docs/pipeline/pulse/pkg/<PKG>/requests/<NN>-<slug>.md`:

```markdown
---
id: P10-R02
from: P10
kind: primitive-change        # token | primitive-change | primitive-new | shell | lib | gate | asset | copy | decision
blocking: false               # true only when no frame of the package can be finished without it
files: [frontend/src/ui/primitives/NumberStepper.tsx]
status: open                  # INT sets: accepted | rejected | done
---
## Need
The 48 pt numeral value of the stepper must accept a unit suffix ("x / hét").
## Evidence
onboarding-3@2x.png; figma-build/app/onboarding-3.body.js:41; kit: numeral + iconBtn recipe (Pulse System 4, "number stepper").
## Proposed API
`<NumberStepper value onChange min max unit?: string />`
## Interim
Rendering the unit as a `cap` text node after the stepper; replace when the prop lands.
```

INT answers in the same file (`## Decision`, status), commits the change as its own step (`INT-nnn`), and the kit reference is updated in the same commit. A screen agent never waits idle on a request: it builds the interim from existing kit parts, never a local re-implementation of a primitive, and never an arbitrary value (`text-[…]`, `rounded-[…]`, a hex).

**Catalogue and budgets.** A package that removes a `useElementVariant('E..')` call lists the id in `result.json`; INT flips `catalog.ts` and `DORMANT` in the same commit. INT lowers `pulse-budgets.json` for the package's files to the counts found (zero is the target; any remainder needs a reason in the hand-off).

### 3.4 Queue and concurrency

- Order: `P02 P17` (long poles) `P03 P05 P06 P07` (the member's tabs) — the first six — then, as slots free: `P14 P13 P04 P08 P09 P10 P12 P15 P16 P18 P21 P20 P19 P22 P23 P24`. P13 before P14 finishes (its `ChatPanel` is embedded there), P21 before P19 and P22.
- Maximum sensible: **6 screen agents + INT; 8 only if free RAM is at least 1.5 GB when the slot opens.** What sets the limit: memory (one `tsc --noEmit` is a 6.7 s burst, a headless Chrome a 2-4 s burst — `pulse-check` and `pulse-shot` hold a semaphore of 2 and 3), the shared tree's noise, which grows with every writer, and the usage limit that has killed long runs on this machine. Not the limit: file overlap (none), INT's throughput (about 16 s of build per package).
- Phase 0 after the switch: the same cap of 8 — A, B (two agents), C, D and E (two agents, already running) fill it; F and G take the first free slots.

### 3.5 Shared database and accounts

| Action | Rule |
|---|---|
| Reading with any account | free |
| Starting or checking sets | P02 only, on T — never on M (M's live session is `home-2` and `workout-1`) and never on K (her idle plan day is `home-1`) |
| Logging food, adding a measurement | P05 / P06 on M; listed in `result.json` |
| Opening `/notifications` on M, onboarding first open on N, minting a code, saving a variant, approving a submission, `logout-all`, changing a password | never; those frames are captured through fixtures (request interception + pinned clock in `pulse-shot`) |
| Re-seed, restoring `app.pulse-baseline.db`, any backend restart | INT only, between integrations, never mid-capture; re-seed again each Monday |
| Cookies | the capture tool injects only the ACCESS cookie; a refresh cookie is never copied between jars (it would revoke the family) |

---

## 4. Definition of done

Tolerances for "matches the frame": colours, faces, sizes, case and tracking exact; positions within 2 pt (ink-tight numerals within 3 pt); ignore the status bar band, the home indicator, the 52 pt corners and every row of `dev-verify.md` 3.5 (names, dates, counts, placeholder photographs, the D1 / D2 / D3 differences).

### 4.1 A screen package is done when

| # | Criterion | Evidence |
|---|---|---|
| 1 | `node scripts/pulse-check.mjs <PKG>` is clean: no type error under owned paths; `check:tokens`, `check:nav`, `check:nav-active`, `check:safe-area`, `check:type-scale`, `check:assets` show nothing in owned paths; `check:pulse` counts for owned files are zero (or reasoned) | the command's output, saved to `pkg/<PKG>/check.txt` |
| 2 | `node scripts/pulse-i18n.mjs check <PKG>` passes | same |
| 3 | every frame of the package is captured at 402 x frame height, scale 2, insets 62 / 34 and compared in the order of `dev-verify.md` 5.5 (left edge and hairlines, type, rhythm, the one lime pill, tab bar, imagery) | `<frame>.pair.png` + one line per frame in `result.json`: `matched` or `structure` (state not reproduced — with the reason) |
| 4 | probes per frame: three fonts loaded, `scrollWidth === 402`, at most one filled lime pill, zero boxed surfaces outside pill / switch / sheet, zero console errors, zero failed requests | `<frame>.probe.json` |
| 5 | the five slide-back checks of Pulse System 6 answered "no" on the agent's own captures | hand-off |
| 6 | states: every state the inventory note lists and every undrawn state of `screens.md` section 4 (last paragraph) for this screen is listed with how it was reached (account, fixture, click script) and a capture, or "code only" with the reason | `result.json` `states` |
| 7 | three languages: the first frame captured in `en` and `de`; no overflow, no cut label, no key path on screen | two captures + probes |
| 8 | no behaviour lost: the behaviour ledger printed by `pulse-check` (hook calls, mutation calls, `to=` / `navigate(` literals, `role=` / `aria-*` attributes present at HEAD and missing now) is empty or every line has a reason | `result.json` `removed` |
| 9 | only owned paths are dirty for this package; `result.json` and `handoff.md` are written; `progress.json` says `ready` | `pulse-integrate` preflight |
| 10 | INT's integration is green: clean-tree `npm run build`, commit, built-app capture of the package's frames | `progress.json` `done` + commit hash |

### 4.2 The foundation is done when

| # | Criterion |
|---|---|
| 1 | `npm run build` green in the verify tree at every Phase 0 commit; the chain is the 12 gates of 2.6 + `tsc -b` + `vite build` |
| 2 | `verify-gates` shows every new or changed gate FAILING on its planted defect and restoring the tree byte for byte |
| 3 | fonts, measured in the built app: `document.fonts.check` true for the three families; a word with ő / ű rendered in each face; Big Shoulders tabular figures confirmed on the interval clock or the fallback written down; `dist/` holds no Inter, no Space Grotesk, no `.woff` |
| 4 | a browser with a stale `localStorage['tracker.theme']` (pack, custom accent, gradient, transparency) and the account whose server pack is `aurora` (M) renders plain Pulse |
| 5 | the kit specimen at `/playground?view=kit` set beside `_components-1..4.png`: every component in every drawn state, compared by capture, not by reading source |
| 6 | shell, measured at 402 x 874 with insets: bar at y 782-838 with no computed background, 5 / 6 / 7 tabs with M / C / A, exactly one lit tab on every route of the gate table, fade solid from y 780, a pushed header at 64, the toast band over 0-120 with the offline line above it; the same at 360 and 430 wide and with zero insets |
| 7 | assets: 49 WebP files, folder under 1.0 MB, `check:assets` green, no image inlined into JS (`dist/`), no `mix-blend-` in `src` |
| 8 | contracts intact: `toast()` signature and kinds, `Sheet` props, `Switch` `role="switch"`, `Segmented` radiogroup, `Field` label wiring, `TrendChart` sr-only table, focus-visible ring, reduced-motion behaviour — checked by a second agent that did not write the lane |
| 9 | `docs/pipeline/pulse/kit/*.md` describes every export; `pulse-budgets.json` initialised; every lane `done` in `progress.json` |

Wave 0 may start at criterion 1 + the stage-1 parts of 5-7; the queue opens per package by `needs`.

---

## 5. Verification — who runs what, when

### 5.1 The tools (lane E)

| Tool | Does |
|---|---|
| `pulse-check.mjs <PKG>` | under a 2-slot semaphore: `npx tsc -p tsconfig.app.json --noEmit --pretty false` (never the bare `tsc --noEmit`, which checks 0 files) and the read-only gates; prints only lines whose path the package owns, plus the expected-noise classes named (a missing i18n key that is in the package's patch, an element in its `variantReadsRemoved`); prints the `check:pulse` counts and the behaviour ledger |
| `pulse-shot.mjs --frame <id> [--base URL] [--lang en] [--width 360]` | headless Chrome over CDP, own profile and port per run, `setDeviceMetricsOverride` 402 x H x 2, `setSafeAreaInsetsOverride` 62 / 34, access cookie from the per-role cache in the OS temp dir, optional `localStorage` preload, click script and fixtures from `pulse-frames.json`, waits for network idle and `document.fonts.ready`; writes `<frame>.app.png`, `<frame>.pair.png` (frame, app, difference), `<frame>.probe.json` into `frontend/.pulse-shots/<PKG>/` (git-ignored). The fixture password is read from the seed script, never copied into a file |
| `pulse-integrate.mjs <PKG>` (INT) | 1 preflight: status `ready`, every dirty path has an owner, the package's paths match `result.json`; 2 `pulse-i18n stage`; 3 `git add -- <owned paths>` + INT's side edits (catalogue, `DORMANT`, budgets); 4 `git diff --cached --binary` applied in the verify tree after `git reset --hard pulse-redesign`; 5 `npm run build` there; 6 on green: commit (message ends with the co-author line of D4), reset the verify tree to the new HEAD, `npm run preview`, `pulse-shot --base http://localhost:4173` for the package's frames; 7 `progress.json` -> `done` + hash. On red: unstage, save the log to `pkg/<PKG>/integration-<n>.log`, status `changes_requested`. Never `git add -A`, never a push |
| `verify-gates.mjs` (INT, verify tree only) | every gate probe, serially |

### 5.2 Who runs what

| When | Who | Runs | Must not run |
|---|---|---|---|
| while building | lane / screen agent | `pulse-check`, `pulse-i18n check`, `pulse-shot` against `http://localhost:5173`, single gates (`npm run -s check:tokens` …) | `npm run build`, `tsc -b`, `vite build`, `npm run preview`, `npm run verify:nav-gate`, `verify-gates`, `npm install`, a second `npm run dev`, any backend script, any git write |
| a package reports `ready` | INT | `pulse-integrate <PKG>` | — |
| a request is accepted | INT | the edit, `npm run build` in the verify tree through `pulse-integrate INT-nnn` | — |
| after every 6 integrations and at the end of a session | INT | built-app capture of every screen already `done` (regression against its own earlier capture), `verify-gates` if a gate changed | — |
| Mondays, and before Phase 2 | INT | re-seed, new baseline copy, restart the dev stack | — |

A red line is an agent's own only if its path is. The Browser pane may be used to click around; no "done" depends on a pane screenshot (it does not composite on this machine).

---

## 6. Phase 2 — review

Starts when all 24 packages are `done`. Reviewers read and capture; they write only under `docs/pipeline/pulse/review/`.

### 6.1 Independent comparison of every screen with its frame

- Five reviewers in parallel, none reviewing a package it built: member A (P01 P02 P03 P04 P09), member B (P05 P06 P07 P08 P10), coach A (P12 P13 P14 P15), coach B (P16 P17 P18 P19 P20), public + admin (P11 P21 P22 P23 P24).
- Subject: the BUILT app at HEAD, served by `npm run preview` from the verify tree — production CSS, hashed fonts and images, the service worker. Fresh captures, not the builders' files.
- Per screen: every frame at 402 (59 in all); the first frame also at 360 and 430 and in `en` and `de`; one frame with `prefers-reduced-motion`.
- Checklist per screen: the comparison order of `dev-verify.md` 5.5; the five non-negotiables of Pulse System 1 and the five slide-backs of section 6; exact Hungarian copy against the inventory note; one lime pill; the lit tab; the states table re-run for loading, empty and error; the behaviour ledger over `git diff 0860942..HEAD -- <owned paths>` (every removed hook call, mutation, door, role or `aria-*` has a recorded reason); the accessibility structure of section 4.2 row 8; every undrawn state the builder composed (these also go on the owner's list).
- Output `docs/pipeline/pulse/review/<PKG>.md`: verdict (pass / pass with minors / fail) and a table `id | severity (blocker / major / minor / owner) | frame | what | evidence (capture + measurement) | file | suggested fix`. `owner` = a question, not a defect.
- Fix round: one fix agent per package with blockers or majors, under the same ownership rules; INT integrates; the reviewer re-checks only its own findings. Minors are batched into one last package per area.

### 6.2 Regression sweep (INT + two agents, after the fix round)

| # | Check | How |
|---|---|---|
| 1 | Build and gates | `npm run build` and `verify-gates` in the verify tree |
| 2 | All 59 frames | built-app captures + probes into `review/sweep.md`, one row per frame |
| 3 | What no gate sees | `check-pulse --report` all zero; grep of `src` for `text-[`, `tracking-[`, `leading-[`, `rounded-(sm\|md\|lg\|xl\|2xl\|3xl)`, `bg-black`, `bg-white`, `shadow-(sm\|md\|lg\|xl)`, `border-2`; `rg "useElementVariant\("` against `catalog.ts` |
| 4 | Roles and widths | M / C / A bars (5 / 6 / 7 tabs) at 360, 402, 430 and with zero insets; one lit tab on every route of `router.tsx` |
| 5 | Flows, by click script on the built app (behaviour, not looks) | sign in -> Home -> start on T -> check a set -> rest timer -> go offline (CDP) -> check a set (queued, offline line shown, player still one viewport) -> online (drained); log a food; add a measurement; coach: client -> four tabs -> send a chat message; plan editor: open a day, reorder, undo; post editor: autosave a draft; signed-out read of `/m`, a post, a coach profile; admin: open a submission. Baseline database restored afterwards |
| 6 | Service worker | `npm run preview` in a persistent profile: load, reload offline, the shell and all tab icons render |
| 7 | Weight | `dist/` against the 2026-10-05 build (JS 1.25 MB, CSS 91 kB, fonts 307 kB): fonts at most 150 kB, images under 1.0 MB, no `.woff`, no base64 image in a chunk |
| 8 | Leftovers of D1 | stale `tracker.theme`; language switch; M (server pack `aurora`) renders Pulse; `/coins` shows no theme item |

### 6.3 Closing package Z (INT, strictly last)

Delete: the bridge tokens and the seven legacy type steps (from `tokens.css` AND `cn.ts`, one commit), `--muscle-*` if lane G landed; `Surface.tsx`, `surfaceRecipe.ts`, `SummaryTile.tsx`, `Gauge.tsx`, `DataTable.tsx`, `ui/TokenProof.tsx`, `features/coaching/Monogram.tsx`; the `secondary` / `ghost` / `danger` / `chip` aliases, the chip tones, the ignored `placement` option, the unrendered `icon` / `badge` / `size` props (and their call-site arguments); `public/icons.svg`; the kit specimen (`src/ui/specimen/**` and its playground branch) unless the owner wants it kept; `pulse-budgets.json` with `check:pulse` switched to `--strict`. Bump `VERSION` in `public/sw.js` to `tracker-shell-v2`. Rewrite `frontend/DESIGN.md` for Pulse, strip the numbers from `Pulse System.md` (its own header asks for it), record this plan's decisions P1-P21 and the answers to Q1-Q4 as an ADR. Then the owner's walkthrough.

---

## 7. Resumability

Runs on this machine die on sleep, app close and the usage limit, so nothing important lives only in an agent's context.

### 7.1 `docs/pipeline/pulse/progress.json`

One entry per work package (INT-0, F1, F2, LA1 … LG, P01 … P24, review R-…, Z). Written only through `node frontend/scripts/pulse-progress.mjs` (lock directory + write-to-temp + rename), so parallel writers cannot lose each other's update. Until lane E delivers the CLI, INT is alone and edits the file by hand.

```json
{
  "version": 1,
  "branch": "pulse-redesign",
  "updated": "2026-10-11T20:14:00+02:00",
  "packages": {
    "P05": {
      "title": "Étkezés",
      "phase": 1,
      "status": "in_progress",
      "owner": "screen-agent-3",
      "attempt": 2,
      "needs": ["LA2", "LB2", "LD1"],
      "files": ["frontend/src/features/nutrition/NutritionPage.tsx"],
      "deletes": ["frontend/src/features/nutrition/NutritionCard.tsx", "frontend/src/features/nutrition/MacroBars.tsx"],
      "frames": { "nutrition-1": "structure", "nutrition-2": "todo" },
      "requests": ["P05-R01"],
      "heartbeat": "2026-10-11T20:12:31+02:00",
      "commit": null,
      "notes": "hero + macro columns done; picked-food block next; nutrition-1 needs the pinned-clock fixture"
    }
  }
}
```

Statuses: `pending` -> `in_progress` -> `ready` -> `integrating` -> `done`; side states `blocked` (a blocking request is open) and `changes_requested` (integration or review sent it back). Frame results: `todo`, `structure`, `matched`.

### 7.2 Who writes what, when

| Moment | Writer | Writes |
|---|---|---|
| a package starts or is resumed | its agent | `status=in_progress`, `owner`, `attempt` + 1; first lines of `pkg/<PKG>/handoff.md` (append-only log) |
| after every finished file and every captured frame | its agent | `heartbeat`, `frames.<id>`, one line in `handoff.md` (what is done, what is next, anything odd) |
| a request is filed | its agent | the request file; `requests`; `status=blocked` only if `blocking: true` |
| the definition of done is met | its agent | `pkg/<PKG>/result.json` (files changed and deleted, `variantReadsRemoved`, `removed` with reasons, frames with capture paths, `states`, languages, `dbMutations`, open requests, `ownerNotes`), `i18n.patch.json`, `status=ready` |
| integration | INT (through `pulse-integrate`) | `integrating`, then `done` + `commit`, or `changes_requested` + the log path |
| a request is answered | INT | the `## Decision` in the request file; the package's `requests`; `blocked` -> `in_progress` |
| review | reviewer / INT | `review/<PKG>.md`; `changes_requested` where needed |

### 7.3 Continuing instead of restarting

- Work in progress is the shared working tree itself; a dead agent leaves its files where they are. The next agent on a package with `status=in_progress` and a `heartbeat` older than 20 minutes reads `brief.md`, `handoff.md`, any partial `result.json`, then `git status -- <owned paths>` and `git diff -- <owned paths>`, and continues from the first frame that is not `matched`. It never runs `git checkout`, `git restore` or `git stash` on anything.
- INT resumes from `progress.json`: anything `integrating` is re-run from step 1 of `pulse-integrate` (the script is idempotent: it unstages first); the verify tree is rebuilt with `git reset --hard pulse-redesign`.
- The switch is three commits, each a resume point; each lane stage and each package is its own commit (D4: local commits on `pulse-redesign`, never a push, never `master`).
- Every tool writes its output file as it goes (`check.txt`, `*.probe.json`, `integration-<n>.log`), and this plan's own files are continued, not overwritten, when they already exist.
- Suggested run boundaries, each starting by reading `progress.json`: (1) INT-0 + F1 + LE1; (2) stage 1 lanes + F2; (3) Wave 0 + stage 2; (4…) the queue, six packages per run; then review; then fixes, sweep and closing. Ask for keep-awake at the start of each run.

---

## 8. Out of scope, and the order the owner sees results

### 8.1 Out of scope for this effort

- Any backend change: delisting the two pack items and compensating owners (a ledger write — its own package under the backend rules: named worker transaction, numbered `user_version` migration, idempotency, the 5-pass checklist), retiring `/me/theme`, the icon background constant in `backend/scripts/build-icons.mjs` (so the committed app icons keep the old canvas until then), an equipment key on the exercise list, `sessions_28d` on the client detail endpoint, Hungarian statement reasons, any seed change.
- Finishing or abandoning a workout (D3): after all screens, as its own package with design, approved copy, the outbox guard and the backend half.
- New doors and flows the product lacks: `/compose` and `/m` on a phone, an entrance to onboarding, redeeming a code, a member chat screen, a first share on Haladás, authoring city / date / price for a post.
- Theme packs, custom accents, light mode. Only the mechanism stays cheap: every lit value derives from `--accent`.
- Desktop design (above 430 pt); the command palette gets tokens only.
- New imagery: eight missing equipment stills, a bell or camera render, a Pulse app icon and favicon, grading of coach uploads (lit reference renders only if Q1 = c).
- Motion variants for the Style Studio; the 14 playground-only elements.
- Locale and data defects drawn as they are: ISO dates, decimal points, `60g`, English exercise names and step text.
- A test framework, user testing, a native Capacitor project, production hosting headers, pushing the branch.

### 8.2 What the owner can open, in order (`http://localhost:5173`)

| # | After | He sees |
|---|---|---|
| 1 | F1 (the switch) | the whole app on the Pulse canvas with lime and the three Pulse faces, all cards gone — rough on purpose |
| 2 | stage 1 + F2 | the real tab bar (rendered icons, the active one lit, no capsule), lime pills, text links and underline fields on every screen; the Edzés tab opens the muscle selector when nothing runs (D2) |
| 3 | Wave 0 | `/login`, `/register` and Home in its three states — the first screens that match their frames; he gets the five pair images (`auth-1/2`, `home-1/2/3`) |
| 4 | first six of the queue | Gyakorlatok, Étkezés, Haladás, Profil — with Home, all five member tabs; the player and the plan editor as soon as their long runs finish |
| 5 | next slots | Gyakorlat részletei, Érmék, Értesítések, Onboarding; the coach's Klienseim, kliens adatlap, csevegés, edzéstervek |
| 6 | last slots | piactéri pult and its two editors, the public marketplace (three screens), admin, the style studio |
| 7 | whenever lane G lands | the graphite mannequin on the selector, exercise detail and the player at once |
| 8 | Phase 2 + Z | the review report, the list of composed undrawn states and open product gaps, then the cleaned-up branch |

Each milestone is reported to him in Hungarian, short, with pictures; anything that needs his decision is asked as an option prompt.

---

## 9. Risks this plan carries

| Risk | Why it is real | Answer |
|---|---|---|
| One broken shared file stops every agent | one dev server, one tree | only INT writes shared files, in small commits; pages are lazy behind a route error boundary; `pulse-integrate` refuses a dirty path with no owner |
| The kit turns out incomplete once 6 screens lean on it | 24 screens, about 30 components, one review round in Figma | Home + Auth and the kit specimen exercise most of it before the queue opens; requests are non-blocking by rule; INT stays free of screen work |
| Unmigrated screens look broken for a while | aliases and invisible cards change layouts they were not written for | local branch, nothing ships before closing; the queue order puts what he opens first at the front |
| "Correct in source, renders wrong" | ink-tight numerals, font loading, hashed asset URLs, safe-area insets | proof is always a capture of the BUILT app with insets and measured probes; `text-box-trim` with fallback offsets as tokens |
| Unverified font facts | Big Shoulders tabular figures, the binary `cmap`, preload URL rewriting | checked in F1d on the first build; the interval clock gets fixed-width digit cells if `tnum` is missing |
| Region authoring for the mannequin | 3 of 22 region instances are machine-derivable today | own lane, own track, frozen props; Q1 (c) is the fallback |
| The integration tooling is new code | index staging, diff replay, lock files | lane E delivers it before any parallel write; INT falls back to "apply the patch at integration, plain `git add` of owned paths, build in the verify tree" if a tool misbehaves |
| "No behaviour lost" rests on a regex ledger and a reviewer | there is no test framework | the ledger, the states table, the flow scripts of 6.2 row 5 and the frozen hook files; anything above the `return` is not edited |
| Frames the seed cannot reach | about 10 frames need a fixture or a mutation | fixtures and the pinned clock are lane E stage 2; until then those frames are honestly `structure`, never `matched` |
| D1's backend half is not done | the server still sells packs to a forged request and keeps `/me/theme` | stated in 8.1; the client filter is a display rule, not a control |
| Runs die mid-wave | sleep, usage limit | section 7; six packages per run; keep-awake |

