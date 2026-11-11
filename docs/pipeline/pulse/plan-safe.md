# Pulse implementation plan — SAFE (gate-first, regression-averse)

Status: COMPLETE (sections 0–9; the last line of the file repeats the status).
Written 2026-10-11, branch `pulse-redesign` at `0860942`. Read-only on the codebase; this file is the only output.

Inputs read in full: `docs/pipeline/pulse/understand/{00-owner-decisions,tokens-type,primitives,shell-gates,screens,assets,dev-verify}.md`,
`docs/brain/58-Pulse/{0000 Index,Pulse System}.md`; frames looked at: `home-1@2x.png`, `_jovahagyott-v1-profile@2x.png`.
Owner decisions D1–D4 (`understand/00-owner-decisions.md`) are final and are not re-opened here.

Vocabulary used below

- **Integrator** — the one agent that owns the main checkout (`C:/Users/Petike/Documents/Cursor/tracker`), every shared file, every merge and `progress.json`. Exactly one at a time.
- **Lane** — a Phase 0 slice of shared code with a file list no other lane touches.
- **Package** — a Phase 1 slice of feature code (`Pnn`) with a file list no other package touches.
- **Bridge** — legacy token / class / variant NAMES kept declared so unmigrated files still build and still work. Values are Pulse; only names linger.
- **Ratchet** — `check:pulse`, a new gate that counts every legacy construct per file against a committed budget that may only go down.
- **Hybrid** — what an unmigrated screen looks like between Phase 0 and its own package: Pulse colour, type and shell, old structure.

---

## 0. The plan in one screen

1. **Gates and eyes first, pixels second.** Before one token changes: four existing gates are tightened (`check-type-scale`, `check-safe-area`, `check-nav`, `check-nav-active`), every gate gets a mutation probe that is seen failing, three new gates land green on today's code (`check:pulse` ratchet, `check:assets`, `check:canvas`), a headless capture tool exists, and all 59 frame states are captured on the OLD look together with a machine-readable inventory of every control on them. That inventory is the regression net this project does not otherwise have (there is no test framework).
2. **Hard switch of values, bridge of names (D1).** There is no second look and no per-screen opt-in. One serial step re-values the tokens, swaps the fonts and removes the theme engine; every legacy name stays declared, so the build is green after every commit and every unmigrated screen keeps working. The old look lives on `master` only.
3. **Restyle shared recipes in place, but never change geometry behind a screen's back.** Colour and shape move centrally (all 161 buttons, 23 fields at once). Anything that changes a control's HEIGHT (the 56 pt pill) is opt-in per call site until the owning screen migrates, because the workout player is exactly one viewport tall by law.
4. **Every commit on `pulse-redesign` is green and revertible.** There is no window in which the app does not build. The one deliberate discontinuity is visual: after step 0.B the whole app is hybrid.
5. **One worktree per agent, one integrator, squash-merge per package.** A red build then always means "my change"; gate probes (which rewrite source files for seconds) run only in the integrator's checkout; `git revert <sha>` undoes exactly one package.
6. **Shared files have one writer.** Tokens, `src/ui`, `src/app`, `src/lib`, the three i18n bundles, scripts and `package.json` belong to the integrator. Screen agents hand in an i18n patch file and request files; a script applies the patch, the integrator commits key and consumer together.
7. **Two screens before twenty-two.** Home and Profil (the two frames the owner approved pixel by pixel) are built first and reviewed; only then do the other packages fan out, at most **4 screen agents at once**.
8. **Done means compared, probed and inventoried** — never "looks right in source". A frame is matched only with a capture at 402 × H @2x with real safe-area insets, the probe output, zero console errors and an explained diff of the control inventory.

### 0.1 How Pulse and the old look coexist — they do not, and what that costs

D1 rules out coexistence ("hard switch on the `pulse-redesign` branch, no per-screen opt-in"). The alternatives were still weighed, because this plan's angle asks for it:

| Alternative | Why it is not taken |
|---|---|
| `[data-theme='pulse']` block + per-screen opt-in wrapper | Contradicts D1. Fonts and the type ramp live in Layer 1 (`@theme static`), which is theme-independent. Pulse is not a re-value: it removes cards, boxed inputs, chips and the nav capsule from the JSX, so shared components would need two trees for 24 screens. The backend cannot store a `pulse` pack (`user_theme_prefs.pack` → `theme_packs(key)`, backend frozen). |
| Runtime feature flag per route | Same two component trees; doubles the review surface; a flag is one more thing that must agree with something else. |
| Parallel `src/ui/pulse/` folder, old `src/ui` untouched | A second implementation of every solved problem — this repo's named defect class. `check-tokens` already forces every button through `Pressable`; a parallel folder would need its own exemptions. |

What gives the safety that coexistence would have given:

| Safety wanted | Mechanism in this plan |
|---|---|
| The old app keeps working somewhere | `master` is never touched and never merged into (D4). `pulse-redesign` is never pushed. |
| Unmigrated screens keep working | The bridge (§2.3): no `var()` goes undeclared, no type size is dropped by `tailwind-merge`, state-carrying washes stay visible, the fixed nav stays opaque. |
| A central restyle cannot break a screen nobody is looking at | API-compatible restyles only; geometry opt-in (`size` axis); hybrid sweep of all 59 states after every Phase 0 merge. |
| Leftovers are found | `check:pulse` ratchet; budgets may only go down; the gate is finished when the budget folder is empty. |
| Any step can be undone | One squash commit per step / package (D4), `git revert`. |
| "Before" can still be seen | Baseline captures of all 59 states on the old look, kept in `.pulse/baseline/`. |

The cost, stated plainly:

- **Hybrid screens.** From step 0.B until its package lands, a screen shows Pulse black, lime, Big Shoulders / Geist, the new tab bar and toast band — over the old structure: invisible cards that still pad, bordered secondary buttons, 12 / 17 / 20 / 26 px legacy type sizes, 30 mixed-case `font-display` words, tinted status washes. Legible and working, not Pulse. The owner must be told not to judge a hybrid screen.
- **Bridge upkeep.** About 60 legacy token names, 7 legacy type steps (in `tokens.css` AND `TYPE_STEPS`), 3 legacy button variants and 3 optional-but-unrendered props live until the closing cleanup. Each is counted by the ratchet.
- **An opt-in prop to clean up.** `size="lg"` on the primary pill is written at every migrated call site and the default flips at cleanup.
- **No A/B in the running app.** Old versus new can be compared only by checking out `master` or by opening the baseline captures.
- **Integration is serial.** One integrator, ~16 s per full build plus captures per merge. That is the throughput ceiling, by design.

### 0.2 Operating model (applies to Phase 0 lanes and Phase 1 packages alike)

**Working trees**

| Tree | Path | Branch | Who | Runs |
|---|---|---|---|---|
| Main checkout | `C:/Users/Petike/Documents/Cursor/tracker` | `pulse-redesign` | integrator only | the ONE backend (`:3000`), the owner's dev server (`:5173`), `npm run build`, `npm run preview` (`:4173`), gate probes, seeds, `npm install`, every commit on `pulse-redesign` |
| Agent worktree | `C:/Users/Petike/Documents/Cursor/tracker-wt/<id>` | `pulse/<id>` (local, never pushed) | one agent | its own `npm ci`, its own `npm run build`, its own preview on its assigned port |

- Worktrees live beside the repo, **not** under `%TEMP%` (a temp clean would delete work). Create: `git worktree add ../tracker-wt/<id> -b pulse/<id> pulse-redesign`, then `npm ci` in `<wt>/frontend` (184 MB each). **No junction or symlink to the main `node_modules`**: removing a worktree would follow it and delete the shared install.
- Ports: slot 1–4 → preview `5181`–`5184`; lanes that need HMR use `5185`/`5186`. `5173`/`4173` are the integrator's. `3000` is the one backend for everybody (`vite.config.ts` proxies `/api` and `/healthz` to it in dev and preview).
- Backend (integrator starts it once, from the main checkout, cwd `backend/`): `NODE_ENV=test DB_POOL_THREADS=4 npm run dev`. `NODE_ENV=test` only skips the rate limiters and stdout logging (dev-verify §2.3); no backend file is edited. The DB is shared: the rules of dev-verify §6.5 apply (no mutation of the fixture accounts; states that need a mutation come from request-interception fixtures).
- An agent's verification loop is one command (built in 0.A): `node scripts/pulse-verify.mjs --package <id> --port <port>` = `npm run build` → `vite preview --port <port> --strictPort` → captures + probes → stop the preview. A two-slot semaphore (`.pulse/build.lock.d/`) keeps at most two builds running at once (3.1 GB free RAM on this machine).
- Never run in an agent worktree: `npm install <pkg>`, any `backend/` script, `npm run verify:gates` / `verify:nav-gate`, `git push`, `git merge` INTO `pulse-redesign`, `git add -A`.

**Ownership**

| Paths | Owner |
|---|---|
| `frontend/src/ui/**`, `src/app/**`, `src/lib/**`, `src/i18n/**`, `src/assets/**`, `src/index.css`, `src/main.tsx`, `frontend/index.html`, `frontend/public/**`, `frontend/scripts/**` (except the two per-package files below), `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `.gitignore`, `.claude/launch.json`, `docs/pipeline/pulse/progress.json` | integrator (in Phase 0 a lane may be granted a sub-list; the grant is recorded in `progress.json`) |
| `frontend/src/features/**/use*.ts`, `features/workout/{cues,intervalPlan,wakeLock}.ts`, `features/compose/{useAutosave,kindIcons}.ts`, `src/lib/outbox.ts` | **frozen for everybody** (three gates mirror or import them) |
| `backend/**` | nobody in this effort |
| The `.tsx` files listed for a package in §3.1; `frontend/scripts/pulse-budget/<id>.json`; `frontend/scripts/pulse-frames/<id>.json`; `docs/pipeline/pulse/handoff/<id>/**` | that package's agent |

`node scripts/pulse-merge-check.mjs <id>` (integrator, before every merge) refuses a branch whose diff against its merge base touches a path its `progress.json` entry does not own.

**Commits** (D4): one squash commit per finished step or package on `pulse-redesign`, message `pulse(<id>): <what changed for the user>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never touch `master`. Work-in-progress commits are allowed and encouraged on `pulse/<id>` (they are what a resumed agent continues from).

---

## 1. Decisions

### 1.1 Decisions this plan takes itself

| # | Decision | Reason |
|---|---|---|
| K1 | **Hard switch of values with a bridge of names**; no `[data-theme='pulse']`, no flag (§0.1). | D1; the build stays green for every parallel agent (`check-tokens` fails on any undeclared `var()`; 46 glass-family references in 10 areas). |
| K2 | **Bridge rule: a legacy token that carries STATE keeps a visible value; only DECORATION is neutralised.** `--accent-subtle`, the four `*-subtle`, `*-border`, `--on-*`, `--focus-ring` stay derived and visible; glass, blur, shadow, aurora, sheen, tile tint go to `transparent` / `none` / `0px`. | A selected chip is drawn with `bg-accent-subtle` at 82 sites today; neutralising it would hide selection on every unmigrated screen with a green build. |
| K3 | **Legacy type steps keep their OLD metrics** (`title-1/2/3`, `body-strong`, `body-s`, `caption`, `timer`); only the family changes. They are not re-pointed at the nearest Pulse size. | Zero reflow on 463 call sites nobody is looking at yet. They are counted by the ratchet and deleted from `tokens.css` and `TYPE_STEPS` together at cleanup. |
| K4 | **Geometry is opt-in during migration.** `control()` gets a `size` axis: `md` (44, today's height, the default until cleanup), `lg` (56, the Pulse pill), `sm` (44, the small pill). Migrated call sites pass `size`; a `variant="primary"` without `size` is a ratchet count. | A central 44 → 56 change would push `IntervalStage`'s buttons out of the one-viewport player (`WorkoutPlayer.tsx:50-86`). |
| K5 | **Shared recipes are restyled in place with their public API intact**; legacy variants (`secondary`, `ghost`, `danger`, chip tones) and props (`EmptyState.icon`, `SectionHeader.icon`, `ToastOptions.placement`) keep compiling — optional and unrendered — until their last caller migrates. New components are new files. No `src/ui/pulse/` folder. | Second implementations are this repo's recurring defect; API-compatible restyles need no feature-file edit in Phase 0. |
| K6 | **Worktree per agent + one integrator + squash merge** (§0.2), not one shared tree. | Every gate walks the whole of `src`; in a shared tree one agent's half-written file reddens everyone, and `verify-nav-gate.mjs` rewrites `navTabs.ts` / `BottomNav.tsx` / `SettingsPage.tsx` on disk while it runs. dev-verify prefers one tree for cost reasons; this plan pays the cost (184 MB and a preview port per agent) for isolation. |
| K7 | **i18n bundles are written only by a script from patch files** (§3.3); screen agents never commit `src/i18n/*.json`. | Three bundles must hold identical key sets; a key and its consumer must land in one commit; one malformed JSON breaks every screen. |
| K8 | **Images: baked knee alpha, WebP, `src/assets/pulse/`, one component `Pic`** (assets note §0). No `mix-blend-mode` anywhere; `check:assets` bans it. `check-aurora` stays in the chain until the last `<AuroraBackdrop` mount is gone and is deleted in that same commit — its heir is already in the chain by then. | `lighten` shows a black rectangle under 7 of 12 ordinary parents, including Pulse's own route transition (measured, assets §5.2). This supersedes the `GlowImage` / re-pointed-aurora proposals of the sibling notes. |
| K9 | **Fonts: hand-written `@font-face` in `src/ui/tokens/fonts.css`** over the Fontsource files, `latin` + `latin-ext` only; Big Shoulders Display variable (`font-display: block`), Geist variable, Geist Mono static 500 (`swap`); both subsets of the display and body faces preloaded. **Geist Mono stays** (Pulse System keeps it; 3 of 16 steps and all 59 frames use it). Fonts are installed dormant one commit BEFORE the families are switched. | Fontsource's own CSS is fixed to `swap` and declares every subset; numerals are placed by ink and must not reflow from a wide fallback. Pulse System is the law; the Review Brief is history. |
| K10 | **Text tiers are the fixed hexes** `#F2F5EA` / `#A9B09D` / `#858C79`, not ink alphas. **Pressed lime is derived**: `color-mix(in oklab, var(--accent), black 9%)` (= `#B3E127`, 1–8/255 off the drawn `#B4E61F`). `--shadow-glow` and `--focus-ring` derive from `--accent` too. No lime literal exists outside the one `--accent` declaration. | Pulse System's values and contrast numbers; D1 asks to keep "one place where a pack could override the accent". |
| K11 | **`giant`: `--text-giant: 7.75rem` (a plain length) plus `--giant-fluid: min(var(--text-giant), 31vw)` outside the `--text-` namespace, AND the gate's value test is widened** to `min(` / `max(` / `clamp(` / `calc(`. | Belt and braces: the first keeps the step visible to the gate as written today, the second removes the blind spot for the next person. |
| K12 | **Family and case are bound to the step once**, in `src/index.css` inside `@layer components` between `/* type-binding:start */` and `/* type-binding:end */`; `check-type-scale` gets a third leg that reads the block. `h1, h2, h3` leave the global display-face rule in the same commit that changes `--font-display`. | Tailwind 4 cannot attach a family or `uppercase` to a `--text-*` step; 69 headings would otherwise turn into Big Shoulders. |
| K13 | **The client theme engine is removed first, as its own commit, before any token changes** (provider, sync hook, picker, the two unimported builders, `TransparencyChoice`, the pre-paint script, ~20 keys × 3 bundles). The "Megjelenés" section of `settings-2` is not drawn. | D1. Order matters: a stored custom accent is written inline today and would override lime. The frame predates the decision. |
| K14 | **Element variants follow the owner's stated default** (`00-owner-decisions.md`, D1 last bullet): a shared component that reaches users renders ONE Pulse look with the behaviour of the letter the database serves today; when it stops reading its letter it becomes `live: false` + a `DORMANT` entry with the reason, in the same commit. `CURATED` E21 is aligned to `A` (tap). The 14 playground-only elements are not re-skinned. Never a hook call that steers nothing. | No backend change is possible (letters A–E only, server-owned); `check:elements` keeps its intent with no rule change. Owner question Q1 can widen this later. |
| K15 | **Toasts: one top band, the existing contract untouched** — `toast(message, kind?, options \| fn)`, `ToastKind`, Undo, 4 s timer with pause, cap of 3 (rendered as up to three notice lines in the one band, newest first), the countdown as the half-lit rule frame `style-studio-2` draws. The offline line is rendered by the same top zone, first, in flow; only its height reaches `--offline-h`. `OfflineIndicator`'s drain / probe / measure logic is not moved or refactored. | 12 raise sites and two undo flows depend on the contract; "restyle the markup only" (primitives constraint 15). |
| K16 | **Tab bar**: icon KEY in `navTabs.ts` (`import type { TabIconKey }` only), image pairs resolved in `BottomNav` through `src/assets/pulse`, both states always in the DOM (opacity switch), one bar for 5 / 6 / 7 tabs, labels sentence case with `truncate` kept. `--nav-h` and `--content-pad-b` are re-valued in the SAME commit as the bar. `--content-pad-b` keeps its name and its meaning "what a full-height screen subtracts"; a new `--page-pad-b` is what `AppLayout` pads. | `check-nav-active` imports `navTabs.ts` into bare Node; the service worker caches hashed assets on first use only; the player reads `--content-pad-b` and must stay one viewport tall without a feature edit. |
| K17 | **`/notifications` is owned by the Home tab** (all three role lists) and the gate's table gains the row plus a completeness assertion; `/playground` goes on a named `NO_TAB_BY_DESIGN` list. | Pulse's own rule ("the owning tab stays lit") and the gate's intent agree; the frame's unlit bar matches a gap in the code, not a decision. |
| K18 | **D2 is built as a redirect**: `WorkoutPlayer`'s no-session branch returns `<Navigate to="/library" replace />`; a FAILED `GET /workouts/current` gets its own error state with `common.retry`; `workout.noneTitle` / `noneBody` are removed in the same commit; `check-nav` gains a named required door (`/library` from `WorkoutPlayer.tsx`). Home gets a permanent library row. | One URL per screen; no nav-table change; frame `workout-3` is superseded. |
| K19 | **`/compose` and `/m` get written exemptions in `NO_INBOUND_BY_DESIGN`, and the door rule is tightened in the same commit** (a link from a route's own descendant page is not a door). No new door is invented. | Today the gate is green only because back-links count as doors; a shared header would turn both routes red "by accident". Telling the truth first, on purpose, is the gate-first order. |
| K20 | **Mannequin**: screens keep mounting `<MuscleMap>` with frozen props; Phase 0 only re-tones its four tokens. Option (b) of the assets note (neutral renders + SVG regions) runs as lane M1 in parallel and swaps the inside of `ui/muscle-map` when ready. | No screen waits on it; ADR-0020 rejects the vector drawing as the end state, not as an interim. |
| K21 | **Dead code is deleted by the step that owns the folder**: `AccentPicker`, `GradientBuilder` (0.B.1), `ui/TokenProof.tsx` (0.C, replaced by the kit specimen), `NutritionCard` + `MacroBars` (P04), `AdminMetrics` + `adminMetrics.*` (P15), `public/icons.svg` (0.B.3). | Each survives `check-i18n` only because the dead file still names its keys; deleting file and keys together is the only green order. |
| K22 | **Dev tooling**: backend runs with `NODE_ENV=test`; captures inject only the access cookie; the fixture password is read at run time from `backend/scripts/seed-dev-users.mjs` and never written anywhere; sub-state is reached by click scripts and request fixtures — **no `?tab=` URL state is added**. | Limiters are per IP and every agent is one IP; a copied refresh cookie revokes the token family; URL state would be new product behaviour that no frame asks for. |
| K23 | **Backend-adjacent copies of the canvas colour are left alone** (`backend/scripts/build-icons.mjs:35`, `019_coins.sql:775`, the baked icon PNGs). `check:canvas` covers the three client copies only. | Backend is frozen in this phase; the difference is 6/255 in one channel on an icon tile. |

### 1.2 Decisions left to the owner (four; work never waits — the default applies until he answers)

| # | Question | Options | Recommendation = default |
|---|---|---|---|
| Q1 | **Element variants and the Style Studio.** Pulse has one look per component; several variants are by definition a box or a slide; the backend cannot gain a sixth letter. | (a) One Pulse look per element; the studio page is re-skinned to its two frames and honestly shows the elements whose switch no longer steers anything as "nem használt". (b) Keep five letters, narrowed to motion and feedback, and re-author them (≈ 8 000 lines of variants, XL+). (c) Cut the studio, the catalogue and the gate. | **(a)** — it is the default already written in D1, costs nothing extra, and (b) can be done later element by element without redoing anything. |
| Q2 | **The coin store still sells Aurora and Ember** (250 coins each, the purchase works) for a pack that can no longer be worn, until the backend package lands. | (a) The Coins screen hides `theme.*` items and shows its existing empty state. (b) Do the backend delisting + compensation package BEFORE the Coins screen ships. (c) Leave them visible. | **(a)** now, and schedule (b) as the first backend package. (a) is a display filter, not a control: the server still sells to a forged request, so (b) stays mandatory. |
| Q3 | **The mannequin.** Five regions have no panel on the render (front and side delts share one cap; neck front; adductors; abductors). | (a) Neutral renders + drawn SVG regions, the five drawn by anatomy. (b) Wait for a new neutral render whose panels match the 19-muscle roster. (c) Keep the re-toned vector map for good. | **(a)**; until M1 lands the re-toned vector map stays, which is (c) as an interim only. |
| Q4 | **When an approved frame and what the app can do today disagree, which wins?** Cases: three stacked toasts and Undo (frame: one line); Home with a rest day / a finished day / two sessions (frame: one subject); the sharing controls (code: checkbox on purpose, frame: switch); the marketplace lead post (code: cover only, frame: title, coach, price); the admin link on Profil; desktop width and devices with no safe-area inset (not drawn at all). | (a) Behaviour wins: nothing a user can do today disappears; the look follows the frame as far as the behaviour allows; every such case is written to `docs/pipeline/pulse/deviations.md` for him to rule on afterwards. (b) The frame wins; undrawn behaviour is cut. (c) Ask each time. | **(a)**. Exception already settled: the two pixel-approved screens (Home, Profil) follow their frames for chrome (Profil is a tab root, no back arrow). |

### 1.3 For the owner's information — decided above, visible to him

- The "Megjelenés" section and "Áttetsző felületek" disappear from Profil (K13, D1).
- Értesítések lights the Kezdőlap tab (K17); the frames draw no lit tab.
- Frame `workout-3` (empty player) is never built (K18, D2); `/workout` with no session opens the library.
- No "finish workout" control appears anywhere in this effort (D3); Home keeps saying "Edzés folyamatban" after the first start.
- Proposed Hungarian copy that is not in `hu.json` or the inventory is shipped flagged `proposed` and listed in `docs/pipeline/pulse/copy-to-approve.md`; nothing waits for the approval.
- Not asked, defaulted, listed in `deviations.md`: inset floors on devices with no safe area (top 12 px, bottom 8 px), the tab bar on a desktop-width window (centred on the content column), the Cmd+K palette (kept, minimally restyled on the sheet surface), covers shown as plain rectangles with radius 2 (no grading), locale defects drawn 1:1.

---

## 2. Phase 0 — Foundation (before any screen)

Four steps. **0.A** and **0.C** are parallel inside themselves; **0.B** and **0.D** are serial. `npm run build` is green after every commit of every step; nothing is ever committed red.

```
0.A  gates + eyes + asset pipeline      3 agents in parallel   no visual change
0.B  the value switch                   1 agent (integrator)   the app turns hybrid  ← the one deliberate visual discontinuity
0.C  shared components + shell          1 keystone, then ≤ 4   components land one lane at a time
0.D  foundation acceptance              integrator + 1 reviewer
```

### 2.1 Step 0.A — gates, eyes and the asset pipeline (parallel, file-disjoint)

Everything in 0.A is green on TODAY's code. That is the point: each gate is re-pointed before the code it guards changes.

**Lane G — Gatekeeper (the integrator).** Owns `frontend/scripts/check-*.mjs`, `verify-*.mjs`, `frontend/package.json`, `.gitignore`, `src/app/navTabs.ts`, `src/app/router.tsx`. One commit per row.

| ID | Work | Files | Green today because |
|---|---|---|---|
| G0 | Pre-flight, no source change: commit `docs/pipeline/pulse/**`; add `.pulse/` to `.gitignore`; record the 11 baseline gate outputs in `progress.json`; **re-seed today** (`npm run seed:dev-users && npm run seed:demo` in `backend/`; run before Monday 2026-10-12 it reproduces the exact week the frames were drawn in, reference Friday 2026-10-09), then with the backend stopped `cp data/app.db data/app.pulse-baseline.db`; start the backend as in §0.2 | `.gitignore`, `docs/pipeline/pulse/**` | no code |
| G1 | `check-type-scale`: value test accepts a length OR `min(`/`max(`/`clamp(`/`calc(`; third leg reads the `type-binding` block of `index.css` (skipped with a printed note while no Pulse step exists; mandatory once `--text-giant` is declared) | `scripts/check-type-scale.mjs` | 10 plain-length steps |
| G2 | Fix the one stale anchor of `verify-nav-gate.mjs` (`navTabs.ts:128` now ends `, owns: ['/coins'] },`); add `scripts/verify-gates.mjs` + `npm run verify:gates` — a serial probe runner that refuses to start on a dirty tree, takes a lock, plants one defect at a time, expects the named failure, restores byte for byte in `finally`, and on start restores any `.probe-backup` a killed run left behind. Not in `build`. | `scripts/verify-nav-gate.mjs`, `scripts/verify-gates.mjs`, `package.json` | probe only |
| G3 | `check-safe-area`: `sticky` counts as `fixed` for `top-0`; inset-carrying tokens are READ from `tokens.css` (any token whose value contains `safe-area-inset-top` / `-bottom`) instead of the typed name `--content-pad-b`; `p[tb]-[var(--X)]` is accepted only for such a token; an `EXEMPT` entry the rule would not have flagged fails ("delete the entry"). Remove the two dead exemptions; add `ui/data/DataTable.tsx` (sticky head inside a scroll container) with its reason. | `scripts/check-safe-area.mjs` | after the exemption edit |
| G4 | `check-nav-active`: completeness — every child path of the authenticated layout in `router.tsx` is in the hand-written table for each role, or in `NO_TAB_BY_DESIGN` with a reason (`/playground`). Add `/notifications` → Home: `owns: ['/onboarding', '/notifications']` in the three role lists, three table rows (K17). | `scripts/check-nav-active.mjs`, `src/app/navTabs.ts` | one data line per role |
| G5 | `check-nav`: strip comments before the safe-area `includes` test; door rule = a link from OUTSIDE the route's own subtree (route → page file map from the `lazy(() => import(…))` lines); add `/compose` and `/m` to `NO_INBOUND_BY_DESIGN` with the reason "no forward door on a phone — product gap, owner decision pending" (K19); add an empty `REQUIRED_DOORS` map (filled by P02). If any other route turns red under the tightened rule it is a real missing door: written exemption + a line in `deviations.md`, never a relaxed rule. | `scripts/check-nav.mjs` | with the two exemptions |
| G6 | **`check:pulse`** — the ratchet (§2.6) — and its budgets measured from today's code, split by owner: `scripts/pulse-budget/<id>.json`. Wired into `build` after `check:tokens`. | `scripts/check-pulse.mjs`, `scripts/pulse-budget/*.json`, `package.json` | budgets = today's counts |
| G7 | **`check:canvas`** — `--surface-0` in `tokens.css` == `theme-color` in `index.html` == `theme_color` and `background_color` in `public/manifest.webmanifest`. Wired into `build`. | `scripts/check-canvas.mjs`, `package.json` | all four are `#0B0D10` today |
| G8 | Integration tools (not in `build`): `scripts/pulse-merge-check.mjs` (ownership, protected paths, budget monotonic against the merge base), `scripts/pulse-i18n.mjs` (`check` / `apply` / `revert` of i18n patch files, §3.3), `scripts/pulse-variants.mjs` (`apply` / `revert` of variant deltas: sets `live: false` in `catalog.ts` and adds the `DORMANT` entry with its reason) | those three files | tools |
| G9 | Router resilience: `HomePage` and `AuthPage` become lazy like every other page; one route error boundary (`src/app/RouteError.tsx`) so a broken page shows a retry line instead of a blank app during review. Copy from existing `common.*` keys; a new key, if needed, lands in the three bundles in this commit. | `src/app/router.tsx`, `src/app/RouteError.tsx`, bundles if needed | behaviour-neutral on success paths |

Probes added to `verify:gates` in the same commits (each must be SEEN failing once, in the integrator's checkout): `--text-giant: min(124px, 31vw)` declared without a `cn.ts` entry → type-scale red · safe-area classes moved into a comment in `BottomNav.tsx` → check-nav red · `pb-[var(--card-pad)]` on a `fixed bottom-0` element → safe-area red · `owns: ['/library']` deleted → nav-active red · a route added with no table row → nav-active red · the `CoachDashboard.tsx:229` link removed → check-nav red although `PlanEditorPage.tsx:332` links back · `<Surface>` planted in a zero-budget file → check:pulse red · a budget raised → `pulse-merge-check` red · the manifest colour changed alone → check:canvas red · `#CBFF2E` planted in a component → check-tokens red · a `nav.*` key deleted from `de.json` → check-i18n red · the `useElementVariant('E11')` call removed alone → check:elements red.

**Lane V — Toolsmith.** Owns `frontend/scripts/pulse-shot.mjs`, `pulse-verify.mjs`, `scripts/pulse-frames/*.json`, `scripts/fixtures/**`, root `scripts/dev-stack.mjs`, `.claude/launch.json`. The integrator adds the `package.json` script lines.

| ID | Work | Detail |
|---|---|---|
| V1 | `scripts/dev-stack.mjs` + a backend entry in `.claude/launch.json` | one command starts the backend as in §0.2 and waits for `/readyz` |
| V2 | **`pulse-shot.mjs`** — headless Chrome 154 over raw CDP, no npm dependency (the probe in dev-verify Appendix A is the starting point) | 402 × H, device scale 2, `Emulation.setSafeAreaInsetsOverride` top 62 / bottom 34; a fresh `--user-data-dir` and `--remote-debugging-port=0` per run; logs in once per role with a Node `fetch` (`X-CSRF: 1`), caches ONLY the access cookie in the OS temp dir for 12 min, injects it with `Network.setCookie`; waits for network idle + `document.fonts.ready`; click scripts; collects console errors and failed requests |
| V3 | Flags | `--frame <key>` · `--package <id>` · `--sweep` · `--baseline` · `--pair` (frame PNG \| app \| difference, one image) · `--inventory` · `--lang hu\|en\|de` · `--width 360\|402\|430` · `--insets 0` · `--reduced-motion` · `--storage <json>` (pre-loads `localStorage`, for the stale-theme proof of D1) · `--offline` · `--base <url>` |
| V4 | Fixtures: CDP `Fetch` fulfils chosen `GET /api/v1/…` from `scripts/fixtures/*.json`; `Page.addScriptToEvaluateOnNewDocument` pins `Date` to Friday 2026-10-09 | makes `home-1`, `workout-2`, `nutrition-1`, `notifications-1` reproducible on any day, and renders loading / 500 / offline for every screen. No backend or DB change. |
| V5 | **Control inventory** (`--inventory`): for a state, a sorted JSON list of `{role, accessible name, disabled, href}` for every button, link, input, switch, checkbox, radio, tab, plus headings and `role=status/alert` regions | this is the "no behaviour lost" evidence: after a rewrite the diff must be explained line by line |
| V6 | Probes (`Runtime.evaluate`) | fonts loaded (`document.fonts.check` for the three families) · computed `font-family` of the numeral · at most one visible element with accent background and full radius · zero elements with a non-transparent background AND a radius AND a non-zero box outside the allow-list (pill, switch, sheet, badge, skeleton, bars) · `scrollWidth === innerWidth` · every `button` / `a` ≥ 44 × 44 · tab bar rect and background · zero console errors · zero failed requests |
| V7 | `scripts/pulse-frames/_frames.json` — the 59 frames: account, route (ids resolved at run time from `GET /api/v1/clients` / `/plans`, never hard-coded), height in pt (dev-verify §5.1), click steps, reachability class, masked rows (dev-verify §3.5). Per-package extra states live in `scripts/pulse-frames/<id>.json`, written by the package's agent. | — |
| V8 | **Baseline run on the old look**: `pulse-shot --sweep --baseline --inventory` → `.pulse/baseline/<state>.png` + `.controls.json` for the 59 frame states | the "before" pictures and the regression reference; run against `npm run preview`, backend up |
| V9 | `pulse-verify.mjs` (the agent loop of §0.2) and `pulse-shot --all` for the integrator's build-proof pass, writing `.pulse/review/index.html` (an index of pairs the owner can open) | — |

**Lane E — Assets.** Owns `frontend/assets-src/pulse/**`, `scripts/build-pulse-assets.mjs`, `scripts/check-assets.mjs`, `src/assets/pulse/**`, `src/ui/media/**`.

| ID | Work | Detail |
|---|---|---|
| E0 | **Archive first, today**: copy the asset production folder (grading scripts, prompts, raws, the coach / admin icon masters) from `%LOCALAPPDATA%/Temp/claude/C--Users-Petike-Documents-Claude-Code/04ce6da3-…/scratchpad/uikit/assets/pulse/` to `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepek-forras/` | it exists only in a session temp folder; nothing in the repo |
| E1 | Pipeline: `assets-src/pulse/assets.json` (slot table, canvas `#0B0D0A`, accent, knee 32), `scripts/build-pulse-assets.mjs` (sharp borrowed from `backend/node_modules` through `createRequire`; no backend file touched), the 49 committed WebP files (35 images, 0.84 MB) in `src/assets/pulse/img/`, generated `slots.ts` (pure, Node-importable) and `urls.ts`, hand-written `index.ts` (`pulseSrcSet`, `TabIconKey`, `EQUIPMENT_STILL`) | the 11 MB masters stay outside the public repo |
| E2 | **`check:assets`** (7 assertions, assets §4.4) + its probes | assertion 4 (every tab names a `TabIconKey` with a lit pair) is switched on in the tab-bar commit (0.C SH1); assertion 7 (baked canvas == `--surface-0`) makes this lane merge AFTER commit 0.B.3 |
| E3 | `src/ui/media/Pic.tsx` (reserved box from the manifest, `srcSet` + `sizes`, `bleed`, lights-on fade, `lit` pair) and `src/ui/media/UserPhoto.tsx` (required `ratio`, radius 2, optional static `desaturate`) | no blend, no mask, no wrapper |
| E4 | Shared-file lines the integrator applies at this lane's merge: `package.json` scripts `assets:pulse` and `check:assets` (+ the `build` chain), `vite.config.ts` `build.assetsInlineLimit` callback (no inlining under `assets/pulse/`) | — |
| M1 | Continues into Phase 1 as its own long lane: mannequin option (b) inside `src/ui/muscle-map/**` — `regions.ts`, new inside of `MuscleMap` with frozen props, delete `shapes.ts` + `landmarks.ts`, region gate (every roster slug has a region, viewBox == figure size, `muscle.<slug>` key in three locales), IoU ≥ 0.95 against the four approved lit renders | default of Q3 |

Exit of 0.A: all 11 + 2 gates green (`check:assets` joins at E's merge), `verify:gates` shows every probe failing and restoring, baseline captures and inventories exist for the 59 states, `progress.json` records it.

### 2.2 Step 0.B — the value switch (serial, the integrator, six commits)

The order is chosen so that each commit is internally consistent and green.

| # | Commit | Files | After it |
|---|---|---|---|
| 0.B.1 | **Remove the client theme engine** (K13): delete `src/ui/theme/{ThemeProvider,contrast,palette}.tsx/.ts`, `features/settings/{ThemeStudio,useThemeSync,AccentPicker,GradientBuilder}.tsx`; in `SettingsPage.tsx` remove the import, `TransparencyChoice` (lines 93–138) and the `<ThemeStudio />` mount (298); remove the `ThemeProvider` mount in `src/app/providers.tsx`; delete the pre-paint script in `index.html:11-40`; delete from hu / en / de together: `settings.themePacks`, `settings.themePack.*` (7), `previewTitle`, `previewBody`, `saveTheme`, `themeSaveError`, `transparency`, `transparencyHint`, `transparencySystem`, `transparencyFull`, `transparencyNone`, `accentDefault`, `accentCustom`, `contrastRatioPass`, `contrastRatioFail`, `contrastInvalid`, `settings.appearance` | those + the three bundles | Everyone sees plain Midnight; nothing reads `localStorage['tracker.theme']` or calls `GET /me/theme`; no inline script remains. Tokens untouched. |
| 0.B.2 | **Fonts installed, dormant**: `npm install @fontsource-variable/big-shoulders-display @fontsource-variable/geist @fontsource/geist-mono` (5.3.0, OFL); new `src/ui/tokens/fonts.css` with hand-written `@font-face` rules (`latin` + `latin-ext`, `block` for Big Shoulders, `swap` for the other two), imported from `index.css`. No family token references them yet, so no browser downloads them. | `package.json`, lockfile, `fonts.css`, `index.css` | No visual change. |
| 0.B.3 | **Colour, radius and bridge tokens + canvas** (§2.3): one `:root` block; six pack blocks (377–550, 820–858) and three glass-fallback blocks (876–917) deleted; kept semantics re-valued in place; new `--edge`, `--track`, `--radius-bar`, component metrics, shell tokens ADDED beside the old ones; `--color-edge / -hair / -hair-strong / -track` in `@theme inline`; legacy names declared per the bridge table; `index.html` `theme-color` and both manifest colours → `#0B0D0A` (forced by `check:canvas`); `public/sw.js` `VERSION` → `tracker-shell-v2`; delete `public/icons.svg`. **No layout metric changes in this commit** (`--nav-h`, `--content-pad-b`, `--control-h` keep their values). | `tokens.css`, `index.html`, `manifest.webmanifest`, `sw.js` | Black, lime, hairlines; cards invisible but still padding; old fonts. Lane E merges right after this commit. |
| 0.B.4 | **Type ramp and families**: 16 Pulse steps + 7 legacy steps in `tokens.css`; `TYPE_STEPS` in `src/lib/cn.ts` = the same 23, same commit; `--font-display` → Big Shoulders Display Variable, `--font-body` / `--font-sans` → Geist Variable, new `--font-mono` → Geist Mono; the `type-binding` block; `h1, h2, h3` removed from the display rule (`index.css:31-34`); remove the Inter and Space Grotesk imports and both dependencies; font preload for the four `latin` / `latin-ext` files of the display and body faces through a `transformIndexHtml` hook in `vite.config.ts` | `tokens.css`, `cn.ts`, `index.css`, `vite.config.ts`, `package.json`, lockfile | Pulse type everywhere the role names exist; `check:type-scale` prints `OK — 23 step(s)`. |
| 0.B.5 | **Gutter**: `.screen-x` 24 px, 16 px below 376 px, both safe-area `max()` forms kept | `index.css` | Left edge at 24. |
| 0.B.6 | **Hybrid sweep** (no commit unless a fix is needed): `pulse-shot --sweep --inventory` against the built app. Pass = for all 59 states: zero console errors, zero failed requests, no horizontal overflow at 360 / 402 / 430, the control inventory equals the baseline except the removed theme UI. Fixes go into tokens, never into feature files. The result is stored as `.pulse/hybrid/` — the reference for every later sweep. | — | Recorded in `progress.json`. |

Verified in the BUILT app during 0.B.4 (unverified today, each has a fallback): the binary `cmap` of the installed files contains ő ű Ő Ű in all three faces (fallback: none needed — Figma renders them from the same builds; if it fails the commit is not made); Big Shoulders Display has tabular figures (fallback: the interval clock and `giant` fractions get fixed-width digit cells in `Numeral`); the preload `href`s point at the hashed files (fallback: preload tags emitted from the bundle manifest in the same hook); a Hungarian session downloads ≤ 150 KB of fonts.

### 2.3 The token block (what 0.B.3 and 0.B.4 declare)

Layer 1 — `@theme static` (must stay `static`)

| Token | Value |
|---|---|
| `--font-display` / `--font-body`, `--font-sans` / `--font-mono` | `'Big Shoulders Display Variable'` / `'Geist Variable'` / `'Geist Mono'`, each with a metric-near system fallback |
| 16 steps (`--text-<step>` + `--line-height` / `--letter-spacing` / `--font-weight` modifiers) | `giant` 7.75rem/6.75rem/900/−0.01em · `num` 3rem/3rem/900 · `display-xl` 3rem/3rem/700/0.01em · `display` 2rem/2.125rem/700/0.01em · `eyebrow` 1rem/1.25rem/700/0.06em · `title` 1.375rem/1.75rem/600/−0.01em · `body` 1rem/1.375rem/400 · `body-m` …/500 · `body-b` …/600 · `cap` 0.8125rem/1.125rem/400 · `cap-m` …/500 · `tab` 0.6875rem/0.875rem/500/0.01em · `tab-on` …/600 · `data-l` 1rem/1.25rem/500/−0.01em · `data` 0.8125rem/1.125rem/500 · `micro` 0.6875rem/1rem/500/0.10em |
| 7 legacy steps, old metrics (K3) | `timer`, `title-1`, `title-2`, `title-3`, `body-strong`, `body-s`, `caption` |
| `--giant-fluid` | `min(var(--text-giant), 31vw)` — consumed by `Numeral` only |
| `--radius-bar` | `1px` (the scale lacks it; `rounded-[1px]` is refused by `check-tokens`) |
| Component metrics | `--row-h: 56px` · `--row-h-sub: 64px` · `--row-h-ledger: 76px` · `--control-h-primary: 56px` · `--switch-w: 48px` · `--switch-h: 28px` · `--switch-knob: 22px` · `--mark-h: 2px` · `--seg-h: 6px` · `--bar-h: 4px` · `--dot: 6px` · `--thumb: 48px` · `--tab-icon: 32px` · `--tab-icon-dense: 28px` · `--badge-h: 18px` · `--mono-sm: 28px` · `--mono-md: 64px` · `--mono-lg: 176px` · `--grabber-w: 36px` |
| State | `--disabled-opacity: 0.4` · `--pressed-opacity: 0.6` |
| Shell, added beside the old names | `--inset-floor-t: 12px` · `--inset-floor-b: 8px` · `--safe-t: max(env(safe-area-inset-top), var(--inset-floor-t))` · `--safe-b: max(env(safe-area-inset-bottom), var(--inset-floor-b))` · `--tabbar-offset: calc(var(--safe-b) + 2px)` · `--page-pad-b: calc(var(--nav-h) + var(--tabbar-offset) + 48px)` · `--fade-h: calc(var(--nav-h) + var(--tabbar-offset) + 38px)` · `--dock-b: calc(var(--nav-h) + var(--tabbar-offset) + 12px)` · `--dock-b-bare: calc(var(--safe-b) + 16px)` · `--head-top-root: calc(var(--safe-t) + 10px)` · `--head-top-push: calc(var(--safe-t) + 2px)` · `--band-pad-t: calc(var(--safe-t) + 6px)` · `--nav-fade`, `--dock-fade` (canvas gradients, transparent → solid at 28 % / 50 %) |
| Unchanged | spacing names, the radius scale, the six durations and two easings (identical to Pulse 2.4), `--target-min`, `--icon-*`, the z ladder |

Layer 2 — one `:root` block

| Token | Value |
|---|---|
| `--surface-0 / -1 / -2 / -3` | `#0B0D0A` / `#141712` (reserved) / `#1E2219` / `#2A2F24` |
| `--ink` | `242 245 234` |
| `--text-1 / -2 / -3` | `#F2F5EA` / `#A9B09D` / `#858C79` |
| `--accent` / `--accent-fg` / `--accent-pressed` | `#CBFF2E` / `var(--surface-0)` / `color-mix(in oklab, var(--accent), black 9%)` |
| `--edge` / `--track` | `rgb(var(--ink) / 0.36)` / white 10 % |
| `--surface-border` / `--surface-border-strong` | white 8 % / white 14 % |
| `--success` / `--warning` / `--danger` | unchanged (`#34D399` / `#FBBF24` / `#F87171`) |
| `--scrim` | black 60 % |
| `--shadow-glow` | `0 0 20px color-mix(in srgb, var(--accent) 38%, transparent), 0 4px 10px -2px color-mix(in srgb, var(--accent) 30%, transparent)` |
| `--radius-button` / `-chip` / `-sheet` / `-field` / `-card` | full / full / `var(--radius-8)` (28) / `0px` / `var(--radius-1)` (2 px — a card-shaped skeleton becomes a radius-2 block on its own) |
| `--border-width` / `--control-h` | `1px` / `44px`, no longer pack-owned |

`@theme inline` additions: `--color-edge`, `--color-hair`, `--color-hair-strong`, `--color-track` (new owned stems — any `border-hair-x` that does not resolve now fails the build), `--shadow-glow`, `--radius-bar`, `--animate-pulse-glow` and `--animate-sheen` with `var(--duration-ambient)`.

The bridge — legacy names kept declared (deleted in §6.2)

| Kind | Names | Value during the bridge |
|---|---|---|
| Decoration (neutralised) | `--glass-1/2/3`, `--glass-rim`, `--card-bg`, `--card-rim`, `--card-border`, `--tile-tint` | `transparent` |
| | `--glass-lip`, `--glass-underside` | `0 0 0 0 transparent` (two `none`s in one `box-shadow` list are invalid) |
| | `--glass-sheen`, `--aurora`, `--noise-overlay`, `--gradient-brand`, `--shadow-overlay`, `--shadow-overlay-strong`, `--sheet-shadow` | `none` |
| | `--blur-sm/md/lg/xl`, `--card-blur`, `--sheet-blur`, `--nav-blur`, `--toast-blur` | `0px` |
| | `--card-saturate` | `1` |
| Must stay opaque | `--nav-bg`, `--toast-bg` | `var(--surface-0)` (a transparent fixed nav over scrolling content is unreadable) |
| | `--sheet-bg` | `var(--surface-2)` |
| State (kept visible, K2) | `--accent-subtle`, `--accent-border`, `--on-accent-subtle`, the four `*-subtle`, the four `*-border`, the four `--on-*`, `--info`, `--focus-ring`, `--accent-50…-950`, `--accent-hover`, `--tile-tint-fg`, `--overlay-border`, `--scrim-strong` | their existing derivations from the re-valued sources (`--scrim-strong` = `--scrim`, `--accent-hover` = `--accent`) |
| Layout (unchanged until its consumer goes) | `--card-pad`, `--radius-inset`, `--nav-dock-offset`, `--content-pad-b-lg` | today's values |
| Component tokens that stay, re-valued | `--field-bg`, `--field-border`, `--sheet-bg`, `--skeleton-base`, `--skeleton-sheen` | `transparent`, `var(--edge)`, `var(--surface-2)`, `var(--surface-2)`, kept |
| Muscle map | `--muscle-body / -idle / -edge / -secondary` | graphite tones from the surface ladder; lit = `--accent` (interim, K20) |

### 2.4 Step 0.C — shared components and the shell

Rules for every lane: restyle = same file, same exports, same props (K5); a variant read that stops steering becomes a **variant delta** (`handoff/<id>/variants.json`: `{element, live:false, reason}`) — the lane applies it in its own worktree with `node scripts/pulse-variants.mjs apply` to keep `check:elements` green and never commits the result; the integrator applies the same file to `ui/feedback/catalog.ts` and the `DORMANT` map of `check-element-roster.mjs` in the lane's merge commit; a token the lane needs and §2.3 lacks is a request, never a local literal; each lane adds its components' specimens to its own file `features/playground/kit/<lane>.tsx`; `PulseKit.tsx` collects them with `import.meta.glob('./kit/*.tsx', { eager: true })`, so no lane edits a shared file to be listed.

**Wave C0 — the keystone, one agent (everything else composes it), and the kit shell**

| Lane | Work | Files |
|---|---|---|
| A1 Actions | `control()`: `primary` = lime pill (full radius, `body-b` on `accent-fg`, glow at rest via an opacity-animated pseudo-element, pressed = `accent-pressed` + no glow + scale 0.98, disabled = `surface-2` fill + `text-3` label, busy = three dots); `size` axis `md` / `lg` / `sm` (K4); new `link` variant (bare text in a 44 pt frame on the left edge, `cap-m` or `body-m`, lead / trail glyph, `tone="danger"`, off = `--disabled-opacity`, pressed = `--pressed-opacity`); `shape="icon"` with `link` = bare 24 px glyph in 44 × 44. `secondary`, `ghost`, `danger` keep compiling with their bridged look. `Pressable.tsx`: three-dot busy. `TextLink.tsx`: the router-link form of the `link` look. | `ui/primitives/{control.ts,Pressable.tsx,TextLink.tsx}` |
| KIT (the integrator, same wave) | `features/playground/PulseKit.tsx` — the code twin of the Figma boards `_components-1..4.png` — mounted as the first section of `/playground`; it renders every file under `features/playground/kit/`. Delete `ui/TokenProof.tsx` (imported by nothing). Same wave, same hand: `CURATED.E21` → `'A'` in `ui/feedback/ElementStyleProvider.tsx` (K14 — the client fallback must not differ from what the server serves and the frames draw). | `features/playground/{PulseKit.tsx,PlaygroundPage.tsx}`, `ui/TokenProof.tsx`, `ui/feedback/ElementStyleProvider.tsx` |

**Wave C1 — four lanes at once (after A1 and lane E are merged)**

| Lane | Work (mapping-table rows of `primitives.md` §3) | Files (exclusive) |
|---|---|---|
| A2 Selection | `ChipRow` / `Chip` (row 5; single, multi, wrap; lime mark) · `Toggle` and `LanguageToggle` rebuilt on it (roles and `lang=` kept) · `Switch` 48 × 28 (row 8, `role="switch"` kept) · `CheckMark` (row 9) · `BadgeCount` (row 4) · `Segmented` in the two Pulse forms, hug and equal cells, ink mark, radiogroup + roving tabindex + async layer kept (row 6; delta E6) | `ui/primitives/{ChipRow,Toggle,Switch,CheckMark,BadgeCount}.tsx`, `ui/nav/LanguageToggle.tsx`, `ui/feedback/variants/E6Segmented.tsx` |
| ST Structure | `SectionHeader` rewritten: strong rule → eyebrow + one trailing node on one baseline; `icon` optional and unrendered (row 25) · `Rule` · `RowStack` + `ListRow` (row 10; lead slot, sub, trailing value / node / chevron, pressed, skeleton form) · `EmptyState` left-aligned, `icon` / `badge` / `size` optional and unrendered, only a pill is stretched (row 19) · `Skeleton` base = `surface-2`, radius 2, text-line heights (row 20) · `Monogram` 28 / 64 / 176 with the texture as a text fill over an ink `background-color`, optional lime dot (row 17) | `ui/data/{SectionHeader,Rule,RowStack,ListRow,Monogram}.tsx`, `ui/feedback/{EmptyState,ScreenSkeleton}.tsx` |
| DA Data | `Numeral`, `Fraction`, `StatBlock` (row 12; ink-tight via `text-box-trim` with per-face fallback offsets as tokens — requested from the integrator, verified by capture against `_components-2/3.png`) · `LedgerRow` (row 11; failed = "—") · `SegmentBar`, `Stepper` (row 13) · `ProgressBar` (row 14) · `MacroColumns` (row 15) · `TrendChart` restyle: no area, hairline axes, 1.5 px line, one end dot, dotted gap, sr-only table kept, positions still from `chartGeometry.plot()` (row 16) · `Sparkline` · `CountUp` as the digit roller | `ui/data/{Numeral,StatBlock,LedgerRow,SegmentBar,ProgressBar,MacroColumns}.tsx`, `ui/feedback/{TrendChart,ProgressChart,Sparkline,CountUp}.tsx` (`chartGeometry.ts`: additive, pure, exports kept) |
| SH1 Shell | Tab bar (row 1, K16): `navTabs.ts` icon keys, `PILL_MAX_TABS` and the lucide imports removed; `BottomNav.tsx` — no surface, equal cells, inset 10 / 12 / 8 and icon 32 / 32 / 28 by count, both rasters stacked, `pointer-events-none` fade layer, `aria-current` and the lit state from the one `isTabActive` result, both horizontal insets with `max()`; delta E11; the playground's E11 demo rewritten (`PlaygroundPage.tsx` is granted to this lane for that one `Demo` case) · `ui/shell/Screen.tsx` (scaffold: top inset, status-bar mask, `overflow-x: clip`, `--page-pad-b`) · `ui/shell/ScreenHeader.tsx` (`greet` / `root` / `push` / `section`, row 24) reading the parent from a new pure table `app/routeMeta.ts` · `ui/shell/Dock.tsx` (docked action with its own fade and a published height) · `app/PublicLayout.tsx` as a layout route for `/login`, `/register`, `/m…` in `router.tsx` · `AppLayout.tsx`: the `AuroraBackdrop` mount and its load-bearing comment removed, padding from `--page-pad-b` | `app/{navTabs.ts,routeMeta.ts,AppLayout.tsx,PublicLayout.tsx,router.tsx}`, `ui/nav/BottomNav.tsx`, `ui/shell/{Screen,ScreenHeader,Dock}.tsx`, `features/playground/PlaygroundPage.tsx` (the E11 case only), two declarations in `ui/tokens/tokens.css` |

SH1 is granted two declarations in `tokens.css` for this wave — `--nav-h: 56px` and `--content-pad-b: calc(var(--nav-h) + var(--tabbar-offset))` — because the bar and the reserve it publishes must change in one commit (K16). Its merge commit also carries, applied by the integrator: `check:assets` assertion 4 on; `check-nav-active` assertion "the tab that owns a pushed route owns its parent" and `check-nav` assertions "every `routeMeta` parent is a router path and its label key resolves in three bundles"; `check-safe-area` assertion "`Screen.tsx` mentions `safe-area-inset-top`"; the six anchors of `verify-nav-gate.mjs` re-anchored to the new bar.

**Wave C2 — two lanes, after C1**

| Lane | Work | Files (exclusive) |
|---|---|---|
| IN Inputs + sheet | Underline `Field` (row 7; label always rendered, `aria-describedby` wiring kept, 16 px input text, focus / error / disabled underlines) · `SearchField` · auto-growing `TextArea` · `NumberStepper` (minus · `Numeral` · plus) · `MaskedField` · `DateTrigger` over the native picker · `SelectSheet` · `FeedbackField` skinned to the same look (delta E7) · the bottom `Sheet`: `surface-2`, top radius 28, hairline edge, token scrim, no blur, no shadow; contract `open, onClose, title, children, status?, onRetry?` kept; variants B–E render as A (row 22; delta E14) · `ConfirmSheet` (danger text + ink cancel, no pill) | `ui/primitives/{Field,SearchField,TextArea,NumberStepper,MaskedField,DateTrigger,SelectSheet}.tsx`, `ui/feedback/variants/{E7Field,E14E20}.tsx`, `ui/feedback/ConfirmSheet.tsx` |
| SH2 Status zone | `NoticeLine` (6 pt dot or glyph + `cap-m` + trailing link, min 44) · the toast band (K15; row 21; delta E15; `ToastOptions.placement` stays in the type, ignored) · `OfflineIndicator` markup → a `warn` notice line on the opaque canvas with the top inset; logic lines untouched; `--offline-h` still published from the in-flow height only · `check-safe-area` `EXEMPT` map updated in the same commit · `CommandPalette` minimal restyle (sheet surface, hairline, `--scrim`; the raw `bg-black/50` goes) | `ui/feedback/{NoticeLine,ToastHost}.tsx`, `ui/feedback/variants/E12E16.tsx`, `ui/shell/{OfflineIndicator,CommandPalette}.tsx`, `app/providers.tsx` |

Agents in 0.C: 1 (wave C0) → 4 (wave C1) → 2 (wave C2), plus M1 in the background. No two lanes of one wave share a file; `catalog.ts`, `check-element-roster.mjs`, `tokens.css`, `package.json` and the bundles are changed only by the integrator inside a lane's merge commit.

After EVERY lane merge the integrator runs: `npm run build` → `npm run preview` → `pulse-shot --sweep --inventory` (the hybrid sweep: same pass criteria as 0.B.6, with the lane's intended changes listed up front, e.g. "toasts now at the top", "tab labels sentence case") → kit specimen capture → `npm run verify:gates` if a gate or an anchored file changed → commit.

### 2.5 Step 0.D — foundation acceptance

Integrator + one independent reviewer. The pass criteria are §4.2. Nothing of Phase 1 starts before it, except M1.

### 2.6 `check:pulse` — the ratchet

`frontend/scripts/check-pulse.mjs`, in `build`. Per file under `src` (comments stripped; `ui/tokens/tokens.css` excluded, as in `check-tokens`) it counts:

| Rule id | Counts |
|---|---|
| `surface` · `summary-tile` · `gauge` · `aurora` | `<Surface` · `<SummaryTile` · `<Gauge` · `<AuroraBackdrop` |
| `legacy-type` | `text-(title-1\|title-2\|title-3\|body-strong\|body-s\|caption\|timer)` |
| `font-display-class` | an explicit `font-display` (the family comes from the role) |
| `legacy-radius` | `rounded-card`, `rounded-field`, bare built-in `rounded`, `rounded-(sm\|md\|lg\|xl\|2xl\|3xl)` |
| `wash` | `bg-*-subtle`, `text-on-*`, `border-*-border`, `bg-[var(--tile-tint)]` |
| `legacy-variant` | `variant="secondary"`, `"ghost"`, `"danger"`, a `<Pressable` with no `variant`, `chip(` |
| `pill-size` | `variant="primary"` without `size=` |
| `shaped-skeleton` | `<Skeleton` carrying a `rounded-*` class |
| `raw-form` | `<input`, `<textarea`, `<select` outside `src/ui` |
| `blur-shadow` | `backdrop-blur`, `blur-`, `shadow-` other than the glow token |
| `reserved-surface` | `bg-surface-1` anywhere; `bg-surface-2` / `-3` outside the allow-list (sheet, skeleton, disabled pill, switch track) |
| `black-white` | `bg-black`, `bg-white`, `text-black`, `text-white` |
| `legacy-var` | `var(--<any bridged name of §2.3>)` |
| `heading-icon` | `icon=` on `<EmptyState` or `<SectionHeader` |

Budgets: `frontend/scripts/pulse-budget/<id>.json` → `{ "files": { "<path>": { "<rule>": n } } }`, one file per lane or package, owned by it. The entries for `src/ui` and `src/app` live in `pulse-budget/ui.json`, owned by the integrator, and fall as lanes land; what remains there after Phase 0 is exactly the bridge (legacy variants and optional props kept for unmigrated callers).

- A file with any non-zero count must appear in exactly one budget file.
- **count > budget** fails ("regression"). **count < budget** fails ("lower the budget — that is your done signal"; `node scripts/check-pulse.mjs --fix-down <id>` rewrites it, and can only lower).
- An all-zero entry, an entry for a deleted file and an empty budget file each fail until deleted (the stale-exemption rule this repo already uses in three gates).
- `pulse-merge-check` adds the ratchet proper: no number is higher than at the merge base.
- The gate prints the totals per rule; the integrator copies them into `progress.json` (the burn-down).
- Report-only (never failing, for the reviewer): page files with more than one static `variant="primary"`, and `text-center` / `mx-auto` / `place-items-center` in page files. The real check for "one lime pill" is the runtime probe of V6.

The gate is finished when `pulse-budget/` is empty; the closing step (§6.2) then turns the rules into unconditional bans.

---

## 3. Phase 1 — Screens in parallel

The unit of work: **rewrite the render function of each page against the Phase 0 components; keep everything above the `return`** (routes, hooks, query keys, mutations, zod schemas, existing i18n keys). 16 276 lines of JSX in 49 files; the 23 hook / logic files are not opened for writing.

### 3.1 Work packages

Common to every package — **must NOT touch**: every integrator path of §0.2, every frozen file, every other package's files, `backend/**`. Inputs common to all: `Pulse System.md`, `figma-build/app-kit.js`, `Product gaps.md`, the "states with NO frame" paragraph of `understand/screens.md` §4, dev-verify §3.5 (differences not to chase) and §7 (account + URL + steps per frame). Frame PNGs are `C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x/<frame>@2x.png`; composition scripts are `figma-build/app/<frame>.body.js`.

| ID | Screens (route) | Owns — exact files under `frontend/src/features/` | Frames | Inventory note | i18n namespaces | Size |
|---|---|---|---|---|---|---|
| **P01** Home | Kezdőlap (`/`), Értesítések (`/notifications`) | `home/{HomePage,WeekStrip,HomeNutrition}.tsx`, `chat/NotificationBell.tsx`, `chat/NotificationsPage.tsx` | `home-1..3`, `notifications-1..2` | `Feature inventory.md` (1), `Screens/notifications.md` | `home`, `notifications` | M + S |
| **P06** Profil | Profil (`/settings`) | `settings/{SettingsPage,CueSettings,EquipmentSection}.tsx` | `settings-1..2` (without the pack rows — D1), `_jovahagyott-v1-profile@2x.png` | `Feature inventory.md` (3) | `settings` | L |
| **P02** Workout | Edzéslejátszó (`/workout`) | `workout/{WorkoutPlayer,SetRow,RestTimer,IntervalStage}.tsx` | `workout-1..2` (`workout-3` superseded — K18) | `Screens/workout.md` | `workout` | XL |
| **P03** Library | Gyakorlatok (`/library`), Gyakorlat részletei (`/library/:id`) | `library/{LibraryPage,ExerciseDetailPage,SectionBadge}.tsx` (the last is deleted) | `library-1..3`, `exercise-detail-1..2` | `Feature inventory.md` (2), `Screens/exercise-detail.md` | `library`, `muscle`, `muscleMap` | L + M |
| **P04** Nutrition | Étkezés (`/nutrition`) | `nutrition/NutritionPage.tsx`; deletes `nutrition/{NutritionCard,MacroBars}.tsx` | `nutrition-1..2` | `Screens/nutrition.md` | `nutrition` | M |
| **P05** Progress | Haladás (`/progress`) | `progress/ProgressPage.tsx` | `progress-1..3` | `Screens/progress.md` | `progress` | L |
| **P07** Coins | Érmék (`/coins`) | `coins/{CoinsPage,CoinBalance}.tsx` | `coins-1..3` | `Screens/coins.md` | `coins`, `achievement` | M |
| **P08** Auth | Belépés, Regisztráció (`/login`, `/register`) | `auth/AuthPage.tsx` | `auth-1..2` | `Screens/auth.md` | `auth` | S |
| **P10** Onboarding | Onboarding (`/onboarding`) | `onboarding/OnboardingPage.tsx` | `onboarding-1..3` | `Screens/onboarding.md` | `onboarding` | L |
| **P09** Coach desk | Edzői kezdőlap (`/coach`), Csevegés (`/coach/clients/:id/chat`) | `coaching/CoachDashboard.tsx`, `chat/{ChatPage,ChatPanel}.tsx` | `coach-dashboard-1..3`, `coach-chat-1..2` | `Screens/coach-dashboard.md`, `Screens/coach-chat.md` | `coaching` (dashboard keys), `chat` | L + M |
| **P11** Client | Kliens adatlap (`/coach/clients/:id`) | `coaching/{ClientDetailPage,PlanTab,NutritionTab,ProgressTab,ClientEquipmentCard,ChatTab}.tsx`; deletes `coaching/Monogram.tsx` | `client-detail-1..3` | `Screens/client-detail.md` | `coaching` (client keys) | XL |
| **P12** Plans | Edzéstervek (`/coach/plans`), Tervszerkesztő (`/coach/plans/:id`) | `plans/{PlanListPage,PlanEditorPage}.tsx` | `coach-plans-1..2`, `plan-editor-1..3` | `Screens/coach-plans.md`, `Screens/plan-editor.md` | `plans` | S + XL |
| **P13** Public | Piactér (`/m`), Poszt (`/m/p/:publicId`), Edzői profil (`/m/c/:handle`) | `marketplace/{MarketplacePage,PostPage,CoachProfilePage,PublicChrome,DocRenderer}.tsx` | `marketplace-1..2`, `post-detail-1..2` (`post-detail-3` is the `DocRenderer` spec, not a screen), `coach-profile-1..2` | `Screens/{marketplace,post-detail,coach-profile}.md` | `marketplace`, `public` | M + M + S |
| **P14** Compose | Piactéri pult (`/compose`), profil- és posztszerkesztő | `compose/{ComposePage,ProfileEditorPage,PostEditorPage,HandleField}.tsx` | `compose-hub-1..2`, `compose-profile-1..2`, `compose-post-1..2` | `Screens/{compose-hub,compose-profile,compose-post}.md` | `compose` | XL |
| **P15** Admin | Admin áttekintés (`/admin`) | `admin/{AdminPage,AdminShell,ModerationQueue,MarketplaceQueue,UserSearch}.tsx`; deletes `admin/AdminMetrics.tsx` | `admin-1..3` | `Screens/admin.md` | `admin`, `adminUsers`, `adminMetrics` (removed) | L |
| **P16** Studio | Elem-stílus stúdió (`/admin/styles`) | `admin/StyleStudioPage.tsx` (page skin only under the default of Q1) | `style-studio-1..2` | `Screens/style-studio.md` | `studio` | M |
| **M1** Mannequin | inside `<MuscleMap>` on three screens | `src/ui/muscle-map/**` (granted lane, started in 0.A) | the figure in `library-*`, `exercise-detail-*`, `workout-*` | assets note §9 | `muscle`, `muscleMap` (via requests) | L |

Package-specific obligations (each is a line in that package's Definition of Done)

| Pkg | Must keep / must do / must not do |
|---|---|
| P01 | Keep the doors `navigate('/library')`, the two `/workout` links, the `/nutrition` link, the bell → `/notifications`. Add the permanent library row (D2). Several sessions today, rest day, already trained, week-query retry: compose from the kit per Q4(a); failed = "—", never 0. `home-1` is verified through the fixture + pinned clock (the seed always leaves a live session). Do not add a finish control (D3). |
| P06 | Three new reads through the existing hooks `coins/useCoins`, `progress/useProgress` (import, never edit); failure renders "—". No "Megjelenés" section. The admin row to `/admin` stays (Q4a). One new key (`feloldva` alone). |
| P02 | The one-viewport law: re-derive the height budget (`WorkoutPlayer.tsx:50-86`) for the new row heights; probe that the active check control's bottom is inside `innerHeight − --content-pad-b` at 402 × 874 and 360 × 640, with and without the offline line. No-session branch → `<Navigate to="/library" replace />`; failed session read → its own error state; remove `workout.noneTitle` / `noneBody` (patch). E21 / E22: one Pulse look, tap behaviour (K14) → variant deltas. Rest timer becomes in-flow. Interval stage (4 states), failed-check chips, withdrawn row and the stand-in hero survive. `intervalPlan.ts`, `useIntervalTimer.ts`, `cues.ts`, `useWorkout.ts`, `outbox` untouched. English `exercise_name_snapshot` stays as is. |
| P03 | `MuscleMap` props frozen. Rows are text-only (the list API has no equipment key) — no placeholder squares. `FeedbackField` → `SearchField` (delta E7). The filter-hint key `muscleMap.filterHint` gets its consumer. No URL state (K22). Equipment stills on detail only through `EQUIPMENT_STILL`; `null` → the name alone. |
| P04 | `kcal` / `g` / `/` literals become keys; custom date trigger over the native picker; no new error / undo states. |
| P05 | `progress-2` is seed-only: the default view is the two empty sentences. Sharing controls keep their code semantics (Q4a). Photo delete keeps its sheet. `useProgress.ts` untouched. |
| P07 | Hide `theme.*` store items (default of Q2) and show the existing empty state `coins.storeEmptyTitle` — display only; the purchase flow and the server contract are untouched. The arc and the two tiles are not drawn. E25 / E26 → variant deltas. Statement reasons stay as the server sends them. |
| P08 | Remove the `AuroraBackdrop` mount; use `PublicLayout` + `Dock`. `react-hook-form` + zod validation, every error state the page has today and the language switch survive. Frames are captured signed out; the register form is never submitted while verifying (5 registrations / 15 min per IP, and it creates accounts). |
| P10 | No inbound link is added (`NO_INBOUND_BY_DESIGN`). Autosave draft, five steps, required-field refusal survive. Sticky footer through `Dock`. |
| P09 | Keep the "Tervek" link (door to `/coach/plans`) and the bell. Four sheets on the Pulse `Sheet`. Revoke and block keep today's one-tap behaviour (no new confirm, no new copy). `CopyButton` → variant delta E2. `ChatPanel` props frozen for P11. Merge BEFORE P11 (shared `coaching` namespace). |
| P11 | `sessions_28d`: read from the roster cache or print "—"; never ship the 0. Keep `ChatTab`'s link — the ONLY door to the chat route. The undrawn Üzenetek tab is composed from P09's pieces. Locale defects stay 1:1. |
| P12 | Ten mutations, reorder, undo toasts, offline-disabled controls, the status sheet and the no-days empty state survive. No date field is invented. |
| P13 | Remove seven `AuroraBackdrop` mounts. Public routes never read the session to draw chrome. Lead post shows the cover only (Q4a). `DocRenderer` follows `post-detail-3`; props frozen for P14. Covers through `UserPhoto`. |
| P14 | `useAutosave.ts` is not opened (eight lines are mirrored by `verify-autosave.mjs`). The "Esemény" chip is drawn and no date field added. The gate states (removed, guidelines, too new) are composed from `NoticeLine`. After P13. |
| P15 | Keep the "Stílus stúdió" link (only door to `/admin/styles`). The account list becomes two-line rows on a phone (request for a shared row form); never approve or reject a pending exercise while verifying. The undrawn Piactér tab follows the moderation grammar. |
| P16 | Last. Saving a variant is a global DB write: only the integrator does it, and restores the previous letter. |

### 3.2 Order and the maximum number of agents

**At most 4 screen agents at once**, plus the integrator, plus M1 in the background. Reasons: 3.1 GB of free RAM (a build, a preview and a headless Chrome per agent); one serial integrator who also reads every pair of captures; one shared dev database; and this machine's history of runs cut by sleep or usage limits — a small wave loses little.

| Wave | Packages | Gate to the next wave |
|---|---|---|
| 1 — calibration (2 agents) | P01, P06 | Both merged, both pass an independent review against `_jovahagyott-v1-home@2x.png` and `_jovahagyott-v1-profile@2x.png`; every primitive defect found is fixed in `src/ui` BEFORE fan-out (a wrong primitive must not be copied into twenty screens). The owner is shown the two screens; his answer is not waited for. |
| 2 — rolling, 4 slots | queue, long poles first: **P02, P03, P04, P08** → P05, P07, P10, P09 → P12, P13, P11 (after P09), P14 (after P13), P15 → P16 | A slot is refilled when its package is merged or blocked. |

### 3.3 How shared files are protected

1. **Path ownership is checked by a script, not by trust**: `pulse-merge-check.mjs` reads the package's `files` from `progress.json` and refuses any other path in the branch diff — in particular `src/i18n/**`, `src/ui/**`, `src/app/**`, `src/lib/**`, `scripts/**` (except the package's own budget and frames files) and every `use*.ts`.
2. **i18n goes through a patch file** — `docs/pipeline/pulse/handoff/<id>/i18n.patch.json`, committed on the package branch:

```json
{
  "package": "P04",
  "base": "<sha of pulse-redesign the patch was written against>",
  "set": [
    { "key": "nutrition.unitKcal", "hu": "kcal", "en": "kcal", "de": "kcal",
      "after": "nutrition.addCta", "copy": "existing-literal",
      "source": "NutritionPage.tsx:412 literal; frame nutrition-1",
      "untranslated": { "langs": ["en", "de"], "reason": "unit symbol" } },
    { "key": "nutrition.dateTrigger", "hu": "Dátum választása", "en": "Choose date", "de": "Datum wählen",
      "copy": "proposed", "source": "frame nutrition-1, header trigger" }
  ],
  "change": [
    { "key": "library.backCaption", "hu": { "from": "…a elöl…", "to": "…az elöl…" },
      "en": null, "de": null, "copy": "fix", "source": "Screens/exercise-detail.md" }
  ],
  "remove": [
    { "key": "workout.noneTitle", "reason": "consumer removed — D2 redirect" }
  ]
}
```

   (Key names, line numbers and strings in both examples are illustrative; real keys follow the namespace's existing naming.)
   Rules, enforced by `node scripts/pulse-i18n.mjs check <patch>`: keys only in the package's namespaces (`common`, `nav`, `offline`, `palette` are integrator-only — ask by request); every `set` carries all three languages with identical placeholders; `copy` is one of `inventory` (the string is in `hu.json` or the screen's inventory note), `existing-literal`, `fix`, `proposed`; a string equal in `hu` and another language needs `untranslated` with a reason; every `set` key is named by a file the package owns and every `remove` key by none.
   - The agent runs `node scripts/pulse-i18n.mjs apply <patch>` in its own worktree to get a green build, and never commits the bundles.
   - The integrator, at merge: `git merge --squash pulse/<id>` → `pulse-i18n apply` on `pulse-redesign` → adds `untranslated` entries to `UNTRANSLATED_BY_DESIGN` in `check-i18n.mjs` → `npm run build` → one commit. Key and consumer land together; the three bundles keep identical key order because one script wrote them.
   - Every `proposed` string is appended to `docs/pipeline/pulse/copy-to-approve.md`.
   - **Variant deltas travel the same way** (`handoff/<id>/variants.json`, applied locally with `pulse-variants.mjs`, never committed by the agent, applied again by the integrator at merge): P02 (E21, E22), P03 (E7 if its last reader goes), P07 (E25, E26), P09 (E2).
3. **Requests to the integrator** — one JSON file per request, dropped into `C:/Users/Petike/Documents/Cursor/tracker/.pulse/inbox/R-<id>-<nn>.json` (the live channel, gitignored) and copied to `docs/pipeline/pulse/handoff/<id>/requests/` (the record):

```json
{
  "id": "R-P05-02",
  "from": "P05",
  "kind": "ui-prop",
  "blocking": true,
  "target": "frontend/src/ui/data/LedgerRow.tsx",
  "need": "A trailing unit slot that aligns to the numeral's baseline (kg after 83,1).",
  "evidence": "progress-1@2x.png, y 260-330; app-kit.js ledgerRow({ unit }); capture .pulse/shots/P05/progress-1.pair.png",
  "proposedPatch": "docs/pipeline/pulse/handoff/P05/requests/R-P05-02.patch",
  "workaround": "none — the row is built without the unit until this lands",
  "status": "open",
  "resolution": null
}
```

   `kind` ∈ `token` · `ui-component` · `ui-prop` · `shell` · `nav` · `gate` · `asset` · `copy-shared` · `variant-delta` · `bug`. A `proposedPatch` must pass `git apply --check` and is a suggestion, not a merge. The integrator answers within its next loop tick: `accepted` (lands as its own commit `pulse(ui): …` on `pulse-redesign`, with a kit specimen and a hybrid sweep), `rejected` (with the reason and the component to use instead) or `deferred`. The agent then runs `git merge pulse-redesign` in its worktree — conflict-free by construction, because it owns no file the integrator writes.
   - **Never** a local copy of a shared component, a local `text-[…]` size, a `token-lint-disable` or a raised budget to get unblocked. A blocked agent moves to its next state or screen and says so in its status file.
4. **Budgets and frame lists are one file per package** (`scripts/pulse-budget/<id>.json`, `scripts/pulse-frames/<id>.json`), so the only shared files a screen agent ever writes are its own.
5. **The first act of every package, before a line of JSX changes**: add the package's undrawn states to `scripts/pulse-frames/<id>.json` (click script or fixture) and capture their baseline + inventory on the still-unmigrated (hybrid) screen. A state that was never captured cannot be proven to have survived.

### 3.4 Handoff (what "I am done" consists of)

`docs/pipeline/pulse/handoff/<id>/handoff.json` on the package branch: the frames and extra states with capture paths and verdicts, probe outputs, the explained inventory diff, the budget before / after, open requests, deviations taken under Q4(a), `proposed` copy, states reported "structure compared, state not reproduced", and the last green `npm run build` output line. Then the agent sets its status to `handoff`. The integrator's merge procedure is §5.2.

---

## 4. Definition of done

### 4.1 A screen (package) is done when ALL of these hold

| # | Criterion | Evidence |
|---|---|---|
| 1 | **Gates**: `npm run build` is green in the package worktree and again on `pulse-redesign` after the squash merge (11 old gates + `check:pulse`, `check:assets`, `check:canvas`, `tsc -b`, `vite build`). `npx tsc --noEmit` without `-p` is not evidence (it checks 0 files). | the last line of each build |
| 2 | **Budget**: the package's `pulse-budget/<id>.json` is deleted (every rule is zero in every owned file). A remaining count needs an open request that explains it; the package is then `merged` but not `accepted`. | `check:pulse` totals |
| 3 | **Visual**: every frame of the package is captured from the BUILT app at 402 × the frame's height, scale 2, insets 62 / 34, and compared as a pair in this order: left edge and hairlines → type (face, size, case, tracking) → vertical rhythm (header top 72 / 64, first block 152 / 178, 32 between blocks) → the one lime pill → tab bar (count, lit icon, y 782–838) → imagery (present, unframed). Tolerance: edges, rules, header and bar within 2 pt; type roles exact by computed style. Ignored: the status-bar band, the home indicator, the 52 pt corners, every row of dev-verify §3.5, and what D1 / D2 / D3 removed. | `.pulse/shots/<id>/<frame>.pair.png` |
| 4 | **Probes** on every captured state: fonts loaded and the numeral's computed family is the display face; at most one visible lime pill; zero boxed surfaces outside the allow-list; no horizontal overflow at 360, 402 and 430; every target ≥ 44 × 44; zero console errors; zero failed requests. | probe JSON |
| 5 | **States still working**: every state in the screen's inventory note and in `understand/screens.md` §4 ("states with NO frame") is reached — by the seed, another account, or a fixture — and captured: loading (skeleton), empty, error with retry, offline-disabled, each sheet, each destructive path. A state that could not be produced is reported "structure compared, state not reproduced", never as matched. | captures listed in `handoff.json` |
| 6 | **No behaviour lost**: the control inventory of every state equals its baseline, or each difference is explained in `handoff.json` (removed by D1 / D2 / D3; renamed with the reason; moved). The doors of dev-verify / screens §1.4 that the package owns still exist. `git diff --stat` shows no frozen file. Structural accessibility kept: roles, labels, `aria-describedby`, roving tabindex, sr-only tables, focus-visible ring. | inventory diff, `pulse-merge-check` output |
| 7 | **Three languages**: the patch passes `pulse-i18n check`; `check:i18n` is green after apply; the base state of each screen is captured in `hu`, `en` and `de` with no overflow and no truncated label; no literal copy, `aria-label`, `placeholder` or `title`; display-face uppercase is a CSS transform, never an uppercase string. | three captures per screen |
| 8 | **Reduced motion**: one capture per screen with `--reduced-motion` — the state change is still visible, no loop runs, no countdown is drawn frozen. | capture |
| 9 | **Honesty**: no frame of `understand/screens.md` §4 implemented as a working path; no invented feature, badge, photo or stand-in image; every deviation under Q4(a) written to `deviations.md`; every `proposed` string listed. | `handoff.json` |
| 10 | **Independent review passed** (§6.1) with no blocking finding open. | `review/<id>.json` |

### 4.2 The foundation is done when ALL of these hold

| # | Criterion |
|---|---|
| 1 | `npm run build` green on `pulse-redesign`; `npm run verify:gates` shows every probe of §2.1 turning its gate red and the tree restored byte for byte (`git status` clean afterwards). |
| 2 | The kit specimen (`/playground`, first section) matches `_components-1.png … _components-4.png` component by component and state by state — reviewed by an agent that did not build it. Ink-tight numerals, the single-baseline ledger row and the section head are judged on the capture, not on the source. |
| 3 | Fonts in the built app: `document.fonts.check` true for the three families; ő ű Ő Ű measured in each face; tabular figures in Big Shoulders verified or the fixed-width fallback in place; the preload tags name the hashed files; ≤ 150 KB of fonts for a Hungarian session; no Inter / Space Grotesk file left in `dist/assets`. |
| 4 | Assets: 49 files ≤ 1.0 MB; `check:assets` green; no `mix-blend-` in `src`; no Pulse image inlined as base64 in a JS chunk. |
| 5 | Hybrid sweep (0.B.6 criteria) passes for all 59 baseline states on the built app after the last lane; the only inventory differences are the listed, intended ones (theme UI gone; tab labels; toast position). |
| 6 | D1 proof: with a stale `localStorage['tracker.theme']` (pack id, custom accent, gradient, transparency) and `user@` (server pref `aurora`), every sampled screen is plain Pulse; no request to `/me/theme` is made. |
| 7 | The player law holds on the hybrid player: at 402 × 874 and 360 × 640, with and without the offline line, the active check control is inside the viewport above the bar. |
| 8 | Shell: the bar is captured for the three roles (5 / 6 / 7 tabs) against the frames; with `--insets 0` nothing touches an edge; `aria-current` sits on exactly one link per route of the gate's table; offline line and a toast shown together do not overlap; an Undo toast (plan editor delete) still undoes; a sheet opens, traps focus and closes on Escape. |
| 9 | `check:pulse` totals for `src/ui` + `src/app` are down to the documented bridge remainder (legacy variants and optional props kept for unmigrated callers) and recorded in `progress.json`. |
| 10 | `progress.json` holds a commit sha for every lane; `.pulse/hybrid/` is the stored reference. |

---

## 5. Verification — who runs what, when

### 5.1 Per agent, in its own worktree (any number in parallel)

| When | Command (cwd `<wt>/frontend`) | Looks at |
|---|---|---|
| on start / resume | `git checkout -- src/i18n src/ui/feedback/catalog.ts scripts/check-element-roster.mjs` (locally applied patches are never committed on a lane or package branch) · `git merge pulse-redesign` · `node scripts/pulse-i18n.mjs apply <own patch>` and `node scripts/pulse-variants.mjs apply <own deltas>` (both idempotent) | conflict-free by ownership |
| before the first JSX edit | `node scripts/pulse-shot.mjs --package <id> --baseline --inventory --base http://localhost:<port>` (after a `pulse-verify` build) | §3.3 rule 5 |
| while working (seconds) | `npx tsc -p tsconfig.app.json --noEmit --pretty false` (6.7 s) · `npm run -s check:tokens` · `npm run -s check:pulse` · `npm run -s check:i18n` | fast feedback |
| per state finished | `node scripts/pulse-verify.mjs --package <id> --port <port>` = `npm run build` → `vite preview --port <port> --strictPort` → captures, pairs, probes, inventory diff | the pair image (with the Read tool) and the probe JSON |
| before handoff | the same with `--lang en`, `--lang de`, `--width 360`, `--width 430`, `--reduced-motion`; `node scripts/check-pulse.mjs --fix-down <id>` | §4.1 rows 4, 7, 8 |

The in-app Browser pane is for clicking around only; it does not composite reliably on this machine and cannot set safe-area insets. A pane screenshot is never the proof.

### 5.2 Per integration, the integrator, serially, in the main checkout

0. `git status` in the main checkout is clean (apart from `.pulse/`); if not, stop and find out why before anything else.
1. `node scripts/pulse-merge-check.mjs <id>` — ownership, protected paths, budgets not raised.
2. `git merge --squash pulse/<id>` (nothing committed yet).
3. `node scripts/pulse-i18n.mjs apply docs/pipeline/pulse/handoff/<id>/i18n.patch.json`; `node scripts/pulse-variants.mjs apply docs/pipeline/pulse/handoff/<id>/variants.json` (`catalog.ts` + `DORMANT`); apply accepted token / gate deltas.
4. `npm run build`.
5. `npm run preview` (4173) → `pulse-shot --package <id> --pair` (the package's frames against the BUILT app — the only run that sees the production CSS, hashed font and image URLs and the service worker) → `pulse-shot --sweep --inventory` (every OTHER screen's inventory must equal its stored reference: no collateral change).
6. `npm run verify:gates` if a gate, `navTabs.ts`, `BottomNav.tsx` or another anchored file changed.
7. Any red step: `git reset --hard HEAD` (nothing was committed), write the reason into the package's status, send it back. Green: one commit (D4 message), update `progress.json` in the same commit, refresh `.pulse/review/index.html`.
8. At a wave boundary only: restore the baseline DB or re-seed (Mondays), `npm install`, restart of the backend or the owner's dev server.

### 5.3 Shared-database rules (from dev-verify §6.5)

Read-only viewing is free. Forbidden on `user@`, `coach@`, `admin@`: log out everywhere, change credentials, delete the account, approve / reject a pending exercise, save a studio variant, mint join codes, publish or withdraw posts. States that need a mutation (`home-1`, `workout-2`, `nutrition-1`, `coach-dashboard-2`, `compose-post-1`, `style-studio-2`) and single-use states (`notifications-1`, `onboarding-2/3`) are rendered from fixtures; `style-studio-2` live is integrator-only and restored.

---

## 6. Phase 2 — review, cleanup, regression sweep

### 6.1 2A — independent comparison of every screen (rolling, starts when a package is merged)

- Reviewers are agents that did not build the screen, read-only on the code, at most 3 at once. Inputs: the frame PNGs, `figma-build/app/<frame>.body.js`, the `Screens/` note, `Pulse System.md` §6, the package's `handoff.json`.
- They take their OWN captures from `pulse-redesign` at HEAD (`npm run preview` in the main checkout is shared; captures are separate processes) — the builder's pictures are not trusted.
- Checklist per frame: the six comparison steps of §4.1 row 3; the five ways back into cards (`Pulse System.md` §6); one hero only; lime only for action / selected / live; text never on a lit area; display-face words uppercase; mono only for figures; left-aligned; every undrawn state of §4.1 row 5; three languages; 360 and 430.
- Output: `docs/pipeline/pulse/review/<id>.json` — findings with severity (`blocking` / `major` / `minor`), frame, region, the violated rule, capture path. `blocking` = wrong structure, lost behaviour, a box, a second pill, unreadable text, a broken state.
- Fixes: a new branch `pulse/<id>-fix<n>` from `pulse-redesign` (never the squashed branch), same ownership, same merge procedure. Two rounds at most; what is still open goes to the owner's list instead of a third round.

### 6.2 2B — closing cleanup (serial, the integrator, after every package is accepted)

One commit per row; each deletion is proven by a gate, not by a search.

| # | Delete / flip | Proven by |
|---|---|---|
| 1 | Bridged legacy tokens of §2.3 and the `-subtle` / `-border` / `on-*` / `info` forms with their `--color-*` mappings | `check-tokens` (`undeclared-token`, `undefined-color` fail while a consumer remains) |
| 2 | The 7 legacy type steps from `tokens.css` AND `TYPE_STEPS` (16 remain) | `check:type-scale` prints `OK — 16 step(s)`; `check:pulse` `legacy-type` is zero |
| 3 | `Surface` + `surfaceRecipe`, `SummaryTile`, `Gauge`, `DataTable` if unused, `features/library/SectionBadge`, the `secondary` / `ghost` / `danger` variants and `chip()` tones, the optional `icon` / `badge` / `size` / `placement` props | `tsc -b` (`noUnusedLocals`), `check:pulse` |
| 4 | Confirm only: `AuroraBackdrop.tsx`, `scripts/check-aurora.mjs` and its `build` entry were already deleted by the integrator inside the merge commit of whichever of P08 / P13 removed the last mount (K8) — the gate never sits in the chain printing `0 backdrop mount(s)`. The three `--aurora` declarations go here. | `check:assets` assertion 6 is its heir and has been in the chain since 0.A; `check-tokens` for the token |
| 5 | `control()` default `size` → `lg` for `primary`; the `pill-size` rule removed | sweep |
| 6 | `check:pulse`: the budget folder is empty → delete the budget mechanism, the rules become unconditional failures; its probes stay in `verify:gates` | probe |
| 7 | Retired shell tokens (`--nav-bg`, `--nav-blur`, `--nav-fg-*`, `--nav-dock-offset`, `--content-pad-b-lg`, `--toast-*`), the `badge-pop` keyframes, variant files with no importer left | `check-tokens`, `tsc -b` |
| 8 | Docs: `frontend/DESIGN.md` rewritten for Pulse; the numbers removed from `Pulse System.md` (its own header asks for it once `tokens.css` holds them); an ADR recording D1–D4 and K1–K23 | — |

### 6.3 2C — the regression sweep (on the built app, after 6.2)

| Sweep | How |
|---|---|
| All 59 frames | `pulse-shot --all --pair`; a reviewer reads every pair once more after cleanup (a deleted token must not have moved anything) |
| Behaviour | control inventory of every state against the ORIGINAL baseline of 0.A; every difference must already be in `deviations.md` or a `handoff.json` |
| Languages and widths | base state of each screen × `hu` / `en` / `de` × 360 / 402 / 430; `--insets 0`; a desktop-width capture of five screens |
| Roles | member (5 tabs), coach (6), admin (7); role gates of `/admin`, `/coach`, `/compose` still refuse |
| Offline | preview + service worker: load online, go offline (`Network.emulateNetworkConditions`), reload — shell renders, both states of every tab icon are present, the offline line shows; check a set offline → the queued count shows → online → it drains (integrator only; the baseline DB is restored afterwards); `verify:outbox` green |
| D1 | stale `localStorage` + `aurora` account → plain Pulse |
| Gates | `npm run build`; `npm run verify:gates` |
| Untouched backend | `git diff --stat master...pulse-redesign -- backend/` is empty; `npm run smoke` in `backend/` (hermetic) still passes |
| Weight | `dist/` JS / CSS / fonts / images against the 2.3 MB baseline; fonts ≤ 150 KB per Hungarian session; images ≤ 1.0 MB |
| Dependencies | `npm audit --omit=dev` in `frontend/` (three font packages added, two removed) |

Result: `docs/pipeline/pulse/review/final.json` + the refreshed `.pulse/review/index.html`.

---

## 7. Resumability

Earlier long runs on this machine were cut by sleep, an app close or a usage limit. The rule: **anything not on disk in one of the four places below does not exist.**

| Place | Path | Tracked? | Written by | Holds |
|---|---|---|---|---|
| The progress file | `C:/Users/Petike/Documents/Cursor/tracker/docs/pipeline/pulse/progress.json` | yes — committed with every integration | **the integrator only** (single writer; a second writer would corrupt it and stop everyone) | one entry per lane / package; owner answers; baseline; burn-down |
| Status files | `…/tracker/.pulse/status/<id>.json` | no (gitignored) | the agent that owns `<id>` | the live heartbeat between integrations |
| The package branch | `pulse/<id>` in `…/tracker-wt/<id>` | local branch | the agent | work-in-progress commits, the handoff folder, the i18n patch |
| Evidence | `…/tracker/.pulse/{baseline,hybrid,shots/<id>,review}` | no | capture tool | PNGs, inventories, probe JSON |

### 7.1 `progress.json`

```json
{
  "schema": 1,
  "branch": "pulse-redesign",
  "updated": "2026-10-11T20:00:00Z",
  "integrator": { "owner": "<agent id>", "heartbeat": "<ISO>", "step": "0.A/G3" },
  "baseline": { "commit": "0860942", "seededOn": "2026-10-11", "dbCopy": "backend/data/app.pulse-baseline.db",
                "gates": { "check:i18n": "876 keys", "check:type-scale": "10 steps", "check:elements": "27/24/20/3" } },
  "ownerQuestions": { "Q1": { "default": "a", "answer": null }, "Q2": { "default": "a", "answer": null },
                      "Q3": { "default": "a", "answer": null }, "Q4": { "default": "a", "answer": null } },
  "burnDown": { "surface": 97, "legacy-type": 463, "legacy-variant": 110 },
  "packages": {
    "P04": {
      "phase": 1, "title": "Nutrition", "status": "in_progress",
      "owner": "<agent id>", "branch": "pulse/P04", "worktree": "C:/Users/Petike/Documents/Cursor/tracker-wt/P04", "port": 5183,
      "dependsOn": ["0.D"],
      "files": ["frontend/src/features/nutrition/NutritionPage.tsx", "frontend/src/features/nutrition/NutritionCard.tsx",
                "frontend/src/features/nutrition/MacroBars.tsx", "frontend/scripts/pulse-budget/P04.json",
                "frontend/scripts/pulse-frames/P04.json", "docs/pipeline/pulse/handoff/P04/**"],
      "frames": { "nutrition-1": "matched", "nutrition-2": "in_progress" },
      "extraStates": { "nutrition-no-target": "baseline-captured", "nutrition-over-target": "todo" },
      "budget": { "before": 61, "now": 14 },
      "requests": { "R-P04-01": "accepted" },
      "commit": null, "review": null,
      "lastStep": "nutrition-2: picked-food block built, pair not yet compared",
      "notes": "",
      "updated": "<ISO>"
    }
  }
}
```

`status` ∈ `todo` → `claimed` → `in_progress` → `handoff` → `integrating` → `merged` → `in_review` → (`changes_requested` → `in_progress`) → `accepted`; plus `blocked` (with the request id). Phase 0 lanes and the steps of 0.B use the same entry shape (ids `G0…G9`, `V`, `E`, `0.B.1…0.B.6`, `A1`, `A2`, `ST`, `DA`, `SH1`, `IN`, `SH2`, `KIT`, `M1`, `0.D`, `2B.1…8`, `2C`).

### 7.2 What each agent writes, and when

| Who | Writes | When |
|---|---|---|
| Screen / lane agent | `.pulse/status/<id>.json` — `{ status, lastStep, frames, extraStates, budgetNow, blockedOn, updated }` | on claim; after every state reaches a new verdict; when a request is filed; when blocked; at handoff. At least once per finished state — never only at the end. |
| Screen / lane agent | a WIP commit on `pulse/<id>` (`git add` of owned paths only) | after every state that builds green in its worktree |
| Screen / lane agent | `handoff/<id>/handoff.json`, `i18n.patch.json`, `requests/*` | as they come into being, not at the end; the handoff file is grown state by state |
| Integrator | `progress.json` | when it assigns a claim (owner, worktree, port); at every loop tick in which a status file changed (copy `status`, `lastStep`, `frames`, `budget`); when a request is resolved; inside every integration commit (`commit` sha, `merged`); when a review file appears |
| Integrator | `integrator.heartbeat` | every loop tick |
| Reviewer | `docs/pipeline/pulse/review/<id>.json` (new file per package, appended finding by finding) | during 2A |

### 7.3 Resuming after an interruption

1. Read `progress.json`. If `integrator.heartbeat` is older than 30 minutes, the new integrator takes the role and first makes the main checkout sane: `git status` — a half-applied squash is discarded with `git reset --hard HEAD` (nothing is ever left uncommitted on purpose); a `.probe-backup` left by a killed `verify:gates` is restored by running `npm run verify:gates -- --restore`; `npm run build` must be green before anything else.
2. `git worktree list` and `git branch --list "pulse/*"`. For every entry not `accepted`: read `.pulse/status/<id>.json` and `git log pulse-redesign..pulse/<id>`. The worktree and its branch are the truth; the status file says where inside the package the agent was.
3. A package in `in_progress` is CONTINUED in its existing worktree by a new agent given: the entry, the status file, `handoff.json` so far, and the instruction "run `git merge pulse-redesign`, `pulse-i18n apply`, `pulse-verify`, then continue from `lastStep`". It is never restarted from the frame.
4. A package in `integrating` is re-run from §5.2 step 1 (the merge procedure is idempotent because nothing is committed before step 7).
5. Backend not running or the DB changed: the integrator restores `app.pulse-baseline.db` (or re-seeds on a Monday) and restarts the stack; captures that depend on dates use the pinned-clock fixtures, so they do not move.
6. Before a long run: keep the machine awake for its duration and close the apps that hold memory; each wave is at most four packages, so the most an interruption can strand is four half-finished, resumable worktrees.

---

## 8. Out of scope, and the order in which the owner sees results

### 8.1 Explicitly out of scope for this effort

| Out | Why / where it goes |
|---|---|
| Any change under `backend/` — delisting the two pack items, compensating owners through a named worker transaction, retiring `/me/theme`, the icon background constant, a state seed | D1 / D3: its own backend package under the backend rules (migration, idempotency, 5-pass checklist). First on the list after this effort, because of Q2. |
| **Finish / abandon workout** (hook, sheet, copy, outbox guard) | D3: a separate package after every screen is accepted; it needs a drawn design and approved copy first. No placeholder control is built. |
| Re-authoring the five variants per element; wiring the 14 playground-only elements to real controls | Q1 default (a) |
| New doors: `/compose` on a phone, `/onboarding`, a member chat screen; redeeming a join code; a set-your-own-password screen; a first-share flow for Haladás | product gaps, not redesign; written exemptions keep the gates honest |
| New behaviour the frames merely suggest: confirm sheets for revoke / block, an event date field, equipment thumbnails in library rows (needs an API key), a coach photo, grading uploaded covers, the verified tick, URL state for tabs | "do not invent" lists of the inventories; K22 |
| Light mode; theme packs; a custom accent | D1; Pulse is dark-only |
| A desktop design | Pulse is drawn at 402 pt only; desktop gets floors and a centred bar, nothing more |
| A new app icon / favicon mark; missing renders (8 equipment stills, bell, camera) | no source art exists; those places stay typographic |
| Locale fixes (ISO dates, decimal points, units, English exercise names and statement reasons) | drawn 1:1; listed in `deviations.md` |
| Native Capacitor projects; AVIF; a test framework | not present today; not introduced here |
| `git push`, any merge to or from `master` | D4. Recommended once a week, read-only: `git merge --no-commit --no-ff master` followed by `git merge --abort`, to MEASURE the drift from Krisz's commits; when to merge for real is the owner's call. |

### 8.2 What the owner can open, in order

How: the integrator keeps the main checkout on the last green commit of `pulse-redesign` with the stack running — `http://localhost:5173`, accounts `user@` / `coach@` / `admin@tracker.local` (the dev fixture password in `backend/scripts/seed-dev-users.mjs`). Side-by-side pairs: `C:/Users/Petike/Documents/Cursor/tracker/.pulse/review/index.html`.

| # | After | He can open | What he should and should not judge |
|---|---|---|---|
| 1 | 0.A | nothing new — the app looks exactly as before | `.pulse/baseline/` holds the "before" pictures |
| 2 | 0.B | every screen, hybrid: black canvas, lime, Big Shoulders / Geist, 24 pt gutter, no theme picker | **not to be judged as Pulse** — structure is still the old one |
| 3 | 0.C, lane SH1 | the new tab bar on every signed-in screen (5 / 6 / 7 tabs by account) | the first finished Pulse piece: compare with any frame's bar |
| 4 | 0.C, rest | `/playground` → "Pulse kit": every shared component in every state; the toast band and the bottom sheet live in the app | compare with the Figma component boards |
| 5 | Wave 1 | **Kezdőlap (`/`) and Profil (`/settings`)** as `user@` | the first two real screens — against the two frames he approved pixel by pixel. His corrections here change the primitives for all the rest. |
| 6 | Wave 2, first four | the **Edzés** tab (opens Gyakorlatok when idle — D2; the player with `user@`'s live session), **Gyakorlat részletei**, **Étkezés**, **Belépés / Regisztráció** (signed out) | member tab bar, left to right |
| 7 | Wave 2, next | **Haladás**, **Érmék**, **Értesítések** (already with Home), **Onboarding** (by URL), then as `coach@`: **Edzői kezdőlap**, **Csevegés** | — |
| 8 | Wave 2, last | **Edzéstervek**, **Tervszerkesztő**, **Kliens adatlap**, public **Piactér / Poszt / Edzői profil**, **Piactéri pult** and its two editors, as `admin@` **Admin**, then **Stílus stúdió** | — |
| 9 | 2B + 2C | the same app with the bridge gone, plus `review/final.json`, `deviations.md` and `copy-to-approve.md` | the three lists that need his word |

---

## 9. Assumptions not yet verified, and risks

Unverified assumptions (each is checked at the step named; each has a fallback)

| Assumption | Checked in | Fallback |
|---|---|---|
| `vite preview --port <p> --strictPort` overrides the configured 4173 and keeps the `/api` proxy | 0.A V9 | a `PULSE_PORT` env read in `vite.config.ts` (integrator-owned, one line) |
| CSS `url()` in the hand-written `fonts.css` resolves a file inside a Fontsource package | 0.B.2 | a relative path into `node_modules`, or `?url` imports feeding `@font-face` through a tiny CSS-in-TS module |
| The headless capture can log in and render the real app (only a `data:` page was exercised) | 0.A V2 | `*.localhost` host names in the pane for exploration; the proof channel is not replaceable — fix the tool first |
| Big Shoulders Display ships tabular figures; all three faces carry ő / ű | 0.B.4 | fixed-width digit cells in `Numeral`; the commit is not made if a glyph is missing |
| The tightened door rule is green with only `/compose` and `/m` exempted | 0.A G5 | a further written exemption + `deviations.md` line per route |
| `text-box-trim` is usable for ink-tight numerals in the target WebViews | 0.C DA | per-face offset tokens, judged on captures |
| `seed:demo` can run while the backend is up, and how long it takes | 0.A G0 | run it with the backend stopped |
| Safari / WKWebView render baked-alpha WebP, the font stack and the fade like Chromium | not verifiable on this machine | reported as "not verified on WebKit" in `final.json` |

Risks

1. **The hybrid window is long.** Between 0.B and the last package, unmigrated screens are neither old nor Pulse. If the effort stops halfway, the branch is not shippable as a design, although it builds and works.
2. **The bridge hides leftovers by construction** (a neutralised card is invisible, not gone). Only `check:pulse` finds them; if its rules have a hole, leftovers survive to 2B, where the deletion gates catch `var()` and owned-stem classes but not, for example, a hand-built box made of legal tokens. The runtime "boxed surface" probe is the second net.
3. **A central restyle can still break a screen nobody is looking at** (font metrics, the 15 → 16 px base, toast position). The hybrid sweep compares inventories and overflow, not beauty; a subtle clipped label can pass it.
4. **The integrator is a single point of failure and the throughput ceiling.** Mitigated by the heartbeat takeover and by idempotent merges, not removed.
5. **Memory.** 3.1 GB free; four worktrees with builds, previews and headless Chrome can exhaust it. The two-slot build semaphore and the cap of four are the guard; a fifth agent is not.
6. **Shared dev database.** One careless click (approve an exercise, log out everywhere) changes what every agent sees. Fixtures cover the frames; the rules of §5.3 cover the rest only if followed.
7. **The control inventory is as good as the states it was captured in.** A state nobody listed before the rewrite has no baseline. §3.3 rule 5 exists for this and depends on the agent doing it first.
8. **`master` moves.** Krisz commits to `master`; every week of divergence makes the eventual merge of a 16 000-line JSX rewrite harder. The weekly dry-run merge only measures it.
9. **Owner defaults may be overturned late.** Q1 (b) or Q4 (b) chosen after wave 2 means rework in the player, coins and every screen that kept an undrawn behaviour. The deviations list keeps that rework findable, not free.
10. **The coin store filter (Q2 a) is cosmetic.** Until the backend package lands a forged request can still buy a pack that does nothing; coins are user value, so that package should not slip.
11. **Design gaps become implementation guesses**: ink-tight numerals in CSS, inset floors, desktop width, multi-line toasts, the five groove-less muscle regions. Each is a recorded default, each can be judged wrong on sight.
12. **AI-generated imagery in a public repository**: 0.84 MB of WebP derived from images whose usage terms are unchecked (Index, "Honest limits"). Nothing is pushed in this effort (D4), so the commits stay local; the terms must be checked before the FIRST push, and the owner is told so when lane E lands. It is not one of the four questions because no work waits on it.

Status: COMPLETE (sections 0–9).

