---
type: todo-phase
phase: 9
title: TODO — Phase 9 (liquid glass redesign)
status: pending
updated: 2026-08-23
tags: [todo, phase-9, design, glass]
---

# Phase 9 TODO — liquid glass redesign

Parent: [[TODO Master]] · Previous: [[TODO Phase-8]] · Specs: [[55-Screens/0000 Index]]

Twenty-seven approved mockups exist at `C:\Users\Petike\Documents\TRACKER-mockups\v4-vegleges\`
(dark and light), and the shipped UI does not look like them. This phase implements them.

> [!important] The specs are written; this is the build
> [[55-Screens/0000 Index|55-Screens]] holds one design note per screen — anchor, blocks, what was
> merged away and why, states, components. Those notes are the input to T9.5. **Read the note
> before touching the screen**, not after.

> [!warning] Two of these tasks overturn recorded decisions
> `DESIGN.md` §7 is titled "DECISIONS — do not undo", and T9.2 and T9.4 undo two of them
> deliberately. Neither may be built before its ADR exists (T9.6.2, T9.6.3) — otherwise the
> reversal survives only as a diff, which is how the admin-tab decision in `AppLayout.tsx:45-57`
> is about to vanish.

## Owner decisions carried in

- Liquid glass **replaces** the five theme packs. One visual language, two modes.
- The navigation change goes **first** — every screen is drawn against it.
- The two paid packs (`aurora`, `ember`) **survive as aurora skins**. Mode owns everything
  structural; a "theme" is one gradient. No refund, no money movement.
- Bottom bar shape is role-dependent: floating pill up to 5 tabs, edge-to-edge at 6–7.
- Light mode is a **real, selectable mode** (dark / light / system).

## T9.0 — Preflight

- [ ] **T9.0.1** Write `frontend/scripts/csp-hashes.mjs` — `pending` · **the file `index.html:18` claims exists and does not.** It reads the built `dist/index.html`, hashes each inline script and emits the directive value
- [ ] **T9.0.2** Wire the hash into `backend/server.js:100` `scriptSrc` — `pending` · today it is `["'self'"]` with no hash, so **the pre-paint theme script is blocked in production right now**. Invisible so far because a flash between five dark packs is nothing; a flash between light and dark is not
- [ ] **T9.0.3** Assert in `security-checklist.mjs` that the served CSP hash matches the shipped `index.html` — `pending` · without it the two drift the first time anyone edits the block, and the failure is silent: the script simply stops running

## T9.1 — Role-dependent navigation

- [x] **T9.1.1** Extract `src/app/navTabs.ts` — `done` · `src/app/navTabs.ts` holds `NAV_TABS` as a `Record<NavRole, NavTabSpec[]>` plus `tabsForRole()` and `PILL_MAX_TABS`. `labelKey` rather than a resolved label is the point: a gate can look a key up in three bundles without rendering React
- [x] **T9.1.2** Split the `admin` branch from `coach` — `done` · three shapes now, not two. **The member bar lost `/library` and the coach bar lost `/coach/plans`** to make room for Étkezés and Haladás, which the mockups put there
- [x] **T9.1.3** Remove the clamp in `BottomNav.tsx:27` — `done` · `slice(0, 5)` gone. The count is declared in `navTabs.ts` and asserted by `check:nav`, so a seventh tab now breaks the build instead of vanishing
- [x] **T9.1.4** Two bar geometries — `done` · `PILL_MAX_TABS = 5`: a detached pill at five or fewer, an edge-to-edge slab at six and seven. Both approved mockups were drawing different roles, not disagreeing
- [x] **T9.1.5** Horizontal safe-area inset on the bar — `done` · `ps-[max(0px,env(safe-area-inset-left))]` and the matching `pe-`. **This was a defect the change itself created**: `max-w-md` + `mx-auto` had been keeping the outer tabs off the cutout by accident, and removing the cap removed the accident
- [x] **T9.1.6** Add `nav.profile` to hu/en/de — `done` · `nav.profile` in hu/en/de. `check-i18n` then flagged hu "Profil" = de "Profil" as a suspected paste — correctly, by its own rule — so it joins `nav.admin` in `UNTRANSLATED_BY_DESIGN`: the same Latin borrowing, with no native alternative either language would recognise on a tab
- [x] **T9.1.7** Add `nav.nutritionShort` — `done` · `nav.nutritionShort` = `Étkezés` / `Food` / `Essen`. `nav.nutrition` stays `Táplálkozás` because it is also the Home section heading, where the long form is right
- [x] **T9.1.8** New gate `frontend/scripts/check-nav.mjs` — `done` · `frontend/scripts/check-nav.mjs`, six rules, wired into `npm run build` after `check:i18n`. **It found a live defect on its first run**: `/coins` had no inbound link at all — wallet, ledger, store and achievements, all finished, all unreachable below 1024px. Fixed with a row under Account in Settings. Every rule is proven load-bearing by `scripts/verify-nav-gate.mjs`, 7/7, files restored byte-for-byte
- [ ] **T9.1.9** Measure by hand at 320 / 360 / 393 / 430 portrait and 844 landscape — `blocked` · needs a browser. The geometry is arithmetic — 7 × 44px = 308px fits 320px — but that is a calculation, not a measurement, and this project's rule is that a screenshot is evidence of a frame while a measurement is evidence of a fact · a gate cannot prove that seven cells fit. Record the numbers in the ADR, the way `BottomNav.tsx:46` already records `79+95+89+53+65 = 381px`

## T9.2 — Glass token layer

- [x] **T9.2.1** Blur scale in Layer 1 — `done` · `--blur-sm/md/lg/xl` (8/16/28/40) in Layer 1. All four hand-written `backdrop-blur-*` call sites now name a token; zero raw blur values remain anywhere in `src/`
- [x] **T9.2.2** Translucency in Layer 2 as an alpha axis over the existing surfaces — `done` · `--glass-1/2/3` as `color-mix` over surface-1/2/3 at 62/70/84%. Alpha rises with elevation. **The three percentages are a starting point, not a measurement** — an attempt to sample them back out of the mockup returned 0%, 94% and 100% for the same material, which measured the sampling rather than the design, and the comment says so
- [x] **T9.2.3** Specular rim tokens — `done` · `--glass-rim` at 20% ink, rendered as an inset top-edge highlight. Recorded in [[60-Decisions/0016-glass-rim-is-not-a-shadow|ADR-0016]] as a material property rather than an elevation cue, which is why F-09 is untouched
- [x] **T9.2.4** Aurora as a token, and `src/ui/shell/AuroraBackdrop.tsx` — `done` · `--aurora` (grain first, three radial washes) plus `src/ui/shell/AuroraBackdrop.tsx`. **Verified in the browser, not asserted**: fixed, covers the viewport exactly at 375x812, `pointer-events: none`, `aria-hidden`, five layers, and does not scroll with the page
- [x] **T9.2.5** Mount the backdrop separately on the four public screens — `done` · mounted on `AuthPage`, `MarketplacePage`, `PostPage` and `CoachProfilePage`. The login screen was measurably flat before this — the gap was visible on the first screenshot
- [x] **T9.2.6** `@supports not (backdrop-filter)` and `prefers-reduced-transparency` fallbacks — `done` · `@supports not (backdrop-filter)` and `prefers-reduced-transparency: reduce`, three declarations each. **Proven live**: the verification browser has reduced-transparency ON, so `--glass-1` resolved to the opaque `#12151A` rather than the mix — the fallback engaged before anyone asked it to
- [x] **T9.2.7** Blur only on surfaces that float over moving content — `done` · `--card-blur: 0px` is the default. Only the nav, sheets, toasts, the rest timer and the sheet scrim opt in. A card in a scrolling list gets alpha and no blur: `backdrop-filter` forces its own compositing layer and re-samples every frame, and blurring an already-soft gradient buys nothing
- [x] **T9.2.8** Do **not** declare a `glass` colour stem in `@theme inline` — `done` · no `--color-glass-*` declared. `Surface` will write `bg-[var(--card-bg)]`, which `undeclared-token` already checks — zero new stems, full gate coverage, no permanent namespace obligation
- [ ] **T9.2.9** Close the `black`/`white` hole in `check-tokens.mjs` — `pending` · `TW_PALETTE` omits both, so five raw scrim values shipped while the gate printed clean. `--scrim` and `--scrim-strong` already exist and nothing uses them. A glass restyle is the moment raw alphas multiply
- [ ] **T9.2.10** Delete the four pack blocks; fold midnight into `:root` — `pending` · **this is the sequencing that makes the phase safe.** A stored `data-theme="neon"` then matches nothing and falls to `:root`, which is glass. Zero data migration, zero client-server deploy coordination
- [ ] **T9.2.11** Handle the four orphaned pack tokens — `pending` · `--shadow-glow` (Neon's identity, consumed at `control.ts:67`) is best **repurposed** as the primary button's glass bloom, which the mockups show; `--overlay-border` finally means something; `--border-width` stays at 1px; `--control-h` needs sampling from the mockups before it collapses to `--target-min`

## T9.3 — Light/dark axis

- [ ] **T9.3.1** `data-mode` on the root, orthogonal to `data-theme` — `pending` · mode owns every structural token; `data-theme` shrinks to declaring `--aurora` **only**. This is what makes "one visual language in dark and light" literally true
- [ ] **T9.3.2** CSS media default underneath the attribute — `pending` · three states: `system` (no attribute, CSS decides) / `light` / `dark`. **A cold boot with no storage and no JavaScript then paints the OS preference correctly**, which also gets the four anonymous public screens right for free
- [ ] **T9.3.3** Extend the pre-paint script for mode — `pending` · depends on T9.0. Every edit to that block changes the CSP hash; say so **inside** the block or someone ships a white screen
- [ ] **T9.3.4** `color-scheme` and `theme-color` per mode — `pending` · `index.html:6` and `index.css:16` both force dark; `theme-color` is hard-wired to midnight's surface. Reverses `DESIGN.md` DECISION 28
- [ ] **T9.3.5** `ThemeProvider` gains `mode`, and follows a mid-session OS switch — `pending` · `matchMedia` subscription when mode is `system`. Small, and its absence reads as a bug
- [ ] **T9.3.6** Author the light semantic set — `pending` · **not derived from dark.** `--success #34D399` at 12% is invisible on near-white and the dark `--on-*` foregrounds are wrong. The light aurora is a different palette too: periwinkle + peach + mint, not a lightened dark one. `06-coach-dashboard` (amber callout + three-colour donut) is the forcing screen
- [ ] **T9.3.7** Decide the custom accent picker's fate — `blocked` · **owner input.** If it survives, the server's guard has a hole: `theme/routes.js:105-127` validates an accent against `theme_packs.surface_hex`, **one column**. An accent legible on near-black can be illegible on white. Surviving means migration 029 adds `surface_hex_light` and `checkAccent` runs twice
- [ ] **T9.3.8** Capacitor status bar — `pending` · `@capacitor/status-bar` is not installed, and the native bar does not follow a web `theme-color`. Both mockup sets show it inverting. Add the plugin or accept it is wrong in one mode — but decide it rather than discover it

## T9.4 — Retiring the four free packs

- [ ] **T9.4.1** `UPDATE user_theme_prefs SET pack = 'midnight'` for the four retired packs — `pending` · **before** the deactivation, same transaction. `theme_packs` uses `ON DELETE RESTRICT`, so deactivation is the designed path and this UPDATE is what makes it legal
- [ ] **T9.4.2** `UPDATE theme_packs SET active = 0` for solar/forest/neon/mono — `pending` · `trg_theme_pack_frozen` freezes `key` and `entitlement_key` only; `active` and `label` are mutable
- [ ] **T9.4.3** Fix the 404 a retired pack causes — `pending` · `theme/routes.js:112` looks up `WHERE key = ? AND active = 1` and 404s. **A user still on `neon` who changes their accent gets a "not found" that means nothing to them**, and `GET /me/theme` returns a pack absent from its own roster, so the picker shows nothing selected
- [ ] **T9.4.4** Add `[data-theme='aurora']` and `[data-theme='ember']`, gradient only — `pending` · **the two paid packs have never rendered.** There is no CSS block for either, anywhere. This is the task that makes 250 coins buy something
- [ ] **T9.4.5** `ThemeStudio.tsx:56` renders the **server** roster, not the client constant — `pending` · and `useThemeSync.ts:7` must declare `packs` in `ThemeResponse`; the roster with its `locked` flags is fetched and thrown away today. **This is why nobody has ever seen the paid packs in the picker**
- [ ] **T9.4.6** Update `theme_packs.surface_hex` for the three survivors — `pending` · the column the accent guard reads
- [ ] **T9.4.7** Pack labels come from i18n, keyed on `key` — `pending` · the mockup shows `Éjfél`. Returning a Hungarian `label` from the database gives a German user a Hungarian picker

## T9.5 — The 27 screens

Per screen: read the note → **subtract in its own commit** → swap card strings for `Surface` →
add the anchor → add tiles → cover the six states → `npm run build` → verify at four widths in
both modes.

- [ ] **T9.5.1** `src/ui/primitives/Surface.tsx` + `surface.ts` — `pending` · **`DESIGN.md` G4 already specifies this by name**, built like `control.ts`. Not a new idea: implement the recorded proposal. Today a card is two properties hand-written 92 times; after this it is six, and six copied 92 times is the failure ADR-0006 was written about. G4 also measures the drift that already happened — `p-3` beats `p-4` **121:62**, and `--card-bg`, `--card-border`, `--card-radius`, `--card-pad` have **zero consumers**
- [ ] **T9.5.2** `src/ui/data/SummaryTile.tsx` — `pending` · the tinted circle holding an icon over a big number appears three to six times on **every** mockup. It is the single most repeated new element in the set, so it gets a component on day one, not on screen twelve
- [ ] **T9.5.3** New gate `check-surface.mjs` with a `MAX_RAW_CARDS` ratchet starting at 92 — `pending` · monotonically decreasing, modelled on how `check-element-roster.mjs` freezes a roster. A new hand-written card fails the build; a migrated one lets you lower the constant in the same commit
- [ ] **T9.5.4** Group A — member shell (9 screens) — `pending` · **`home` first**: it contains a ring, a week strip, a status card, tiles and the bar, so one screen exercises the whole new layer
- [ ] **T9.5.5** Group E — the workout player (2) — `pending` · **second, not last.** The highest-risk screen; finding its problems on day three is cheaper than on day thirty. Its set list is an **internal** scroller with a deliberate half-cut row — the page must not scroll while sets are checked, because a check button that moves records the wrong set
- [ ] **T9.5.6** Group B — coach (7) — `pending` · start with `coach-dashboard`: it forces the complete light semantic set into existence before the other six
- [ ] **T9.5.7** Group C — admin (2) — `pending` · `col-wide` plus the one `DataTable` in the product (`UserSearch.tsx:77` is its only consumer, so "tables become tiles" is a one-screen change)
- [ ] **T9.5.8** Group D — no shell (7) — `pending` · aurora mounted per page; mode from `prefers-color-scheme` alone since an anonymous visitor has no stored preference
- [ ] **T9.5.9** Update every `ScreenSkeleton` shape to the new geometry — `pending` · the rule is that a skeleton causes no layout shift on swap, and **every anchor added breaks that until its skeleton follows**
- [ ] **T9.5.10** Re-wire `ui/TokenProof.tsx` as the glass proof sheet under `/playground` — `pending` · 259 lines rendered by **nothing** today. With no test runner and no screenshot harness, one page a reviewer can hold against the mockups is the highest-value verification artefact available — and it is already written

## T9.6 — Brain and decisions

- [x] **T9.6.1** 27 screen-spec notes + index in `55-Screens/` — `done` · 69–99 lines each, inside the vault's 29–200 band. **Zero design values**: checked before writing, not asserted after. A sibling folder rather than a subfolder of `50-UX-Concepts`, because index membership is by folder and 27 per-screen notes would bury the five per-concern ones
- [x] **T9.6.2** ADR — liquid glass replaces the theme packs — `done` · [[60-Decisions/0015-liquid-glass-replaces-the-packs|ADR-0015]]. **The measurement contradicted the argument I was about to make**: DECISION 24 is RIGHT about solar/neon/mono — they differ by 7-9 non-colour tokens each, and `rounded-card` alone appears 171 times, so the structure reaches screens. Only `forest` is notional (7 tokens differ, zero of them structural). The ADR records this as a trade, not a correction
- [x] **T9.6.3** ADR — a glass rim is an inset highlight, not a shadow — `done` · [[60-Decisions/0016-glass-rim-is-not-a-shadow|ADR-0016]]. Also records the mode-dependent half the light mockups show — light separates by fill, dark by edge — as one separator per surface per mode, which is what F-09 was protecting
- [ ] **T9.6.4** ADR — light mode is a second attribute, not a sixth pack — `pending` · records why `light-dark()` was rejected: it makes `--surface-0` unreadable to `contrast.ts` and to `theme_packs.surface_hex`, breaking the server's accent guard
- [ ] **T9.6.5** ADR — the bottom bar is role-dependent, 5 / 6 / 7 — `pending` · overturns a decision that **exists only as a code comment** (`AppLayout.tsx:45-57`, "ADMIN IS NOT A BOTTOM-NAV DESTINATION, and used to be one by accident"). A recorded decision living in a comment vanishes in a diff nobody reads
- [ ] **T9.6.6** `50-UX-Concepts/Liquid Glass.md` — `pending` · one concern note holding the single pointer to `frontend/DESIGN.md`, so the 27 screen notes link to *that* rather than each carrying its own pointer. Mark `Theme Engine.md` superseded a second time
- [ ] **T9.6.7** New gate `check-brain-screens.mjs` — `pending` · every note linked from the index; every `route` exists in `router.tsx`; every `component` path exists; the count matches. **This is the decisions-index bug fixed in advance** — eleven decisions went invisible from their own index, and a hand-written list has the same failure mode
- [ ] **T9.6.8** Copy the mockups into the vault, downsampled — `pending` · the originals are 3072×5504 and Obsidian resolves embeds only inside the vault. Fifty-four of those is a repo-weight decision nobody should make by accident
- [ ] **T9.6.9** Fix two stale lines — `pending` · `Home.md:12-14` and `TODO Master.md:41` still describe `brain-sync.mjs` mirroring into a separate vault, which commit `43cbd6a` superseded. Both currently tell the reader to *"edit in the repo, never here"* about a folder that **is** the repo

## Not in this phase

- The audit's three broken features — the dead `prev` column, `npm audit` high:1. **The unusable premium themes are fixed here** by T9.4.4, not deferred
- The Master TODO status board's 60-item drift. Adding a Phase 9 row to a board that is already wrong on five of nine rows would make it wronger — the board needs its own repair first
- Implementing E11-E (Center-FAB). It is in the catalog and unbuilt, the mockups show no FAB, and adding it here mixes a feature into a restyle and touches a frozen roster

## Related

[[TODO Master]] · [[55-Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[60-Decisions/0000 Index]]
