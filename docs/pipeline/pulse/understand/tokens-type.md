# Pulse — tokens, themes and type: what exists and what changes

Status: COMPLETE (read-only analysis, 2026-10-11, branch `pulse-redesign`, nothing committed on it).
Audience: a planner who has not read the code. Every claim carries a path and line, a grep count or a computed value.

Files read in full: `frontend/src/ui/tokens/tokens.css` (978 lines), `frontend/src/index.css` (202), `frontend/index.html` (54),
`frontend/src/lib/cn.ts` (64), `frontend/src/ui/theme/{ThemeProvider.tsx,contrast.ts,palette.ts}`,
`frontend/src/features/settings/{ThemeStudio.tsx,useThemeSync.ts,AccentPicker.tsx}`, `frontend/src/ui/primitives/{surfaceRecipe.ts,control.ts}`,
`frontend/src/ui/shell/AuroraBackdrop.tsx`, `frontend/scripts/{check-tokens,check-type-scale,check-aurora}.mjs`, `check-safe-area.mjs` (40-150),
`backend/src/theme/routes.js` (240), `backend/src/db/migrations/019_coins.sql` (736-897), `backend/server.js` (CSP, 93-122),
`docs/brain/58-Pulse/{Pulse System,0000 Index}.md`, `Pulse Review Brief.md` (sections 3 and 9-10), ADR-0020, `figma-build/app-kit.js` (tokens `P`, ramp `TY`).

Corrections to the brief I was given: the repo runs **Vite ^8.2.0** and **TypeScript ~6.0.2** (`frontend/package.json`), not Vite 6.
`ThemeStudio`, `AccentPicker` and `useThemeSync` live in `frontend/src/features/settings/`, not in `src/ui/theme/` (which holds only
`ThemeProvider.tsx`, `contrast.ts`, `palette.ts`). There is no `[data-mode]` block anywhere.

> **Decided while this note was being written.** `docs/pipeline/pulse/understand/00-owner-decisions.md` (D1, 2026-10-11) records the
> owner's answer on theme packs: *Pulse is the only look; the seven packs, the aurora skins, the glass tokens and
> `data-transparency` are deleted; keep the mechanism cheap to bring back (one place where a pack could override the accent); ship no
> pack now; the frontend must not break if the API still returns packs or a stored pack id; removing the purchasable items is its own
> backend package.* That is **Option B** of section 6. The three options stay documented below because the task asked for them and
> because "later we add packs" is Option A arriving in the future; sections 0, 6, 10, 11 and 12 are written for D1.

---

## 0. What the planner needs in one screen

1. **Pulse fits the three layers without a new architecture.** 16 of the 18 rows of Pulse's palette table map onto semantic tokens that
   already exist (`--surface-0..3`, `--text-1..3`, `--accent`, `--accent-fg`, `--accent-pressed`, `--success`, `--warning`, `--danger`,
   `--scrim`, `--surface-border`, `--surface-border-strong`). Two are new (`--edge`, `--track`), and `--shadow-glow` gets a real value.
   Motion is identical to the digit: Pulse System section 2.4 and `tokens.css:115-137` carry the same six numbers and the same curve.
2. **What dies is larger than what is new**: 26 glass / aurora / gradient / tint / blur / elevation tokens, the `-subtle` and `-border`
   forms of the semantic colours, the 50-950 accent ramp, three glass-fallback blocks (two of them keyed on `data-transparency`), and
   the structural identity of five packs.
3. **One sequencing rule decides the whole plan.** `check-tokens` fails the build on any `var(--x)` whose token is not declared
   (`check-tokens.mjs:291-301`). So no token can be deleted until its last consumer is gone — and 46 glass-family `var()` references sit in
   10 areas, 97 `<Surface>` tags in 34 files. Deleting first makes the build red for every parallel agent. The opposite failure is
   **silent**: a removed type step or radius name (`text-body-s`, `rounded-card`) is an inert class, no gate sees it, and the element
   renders at the inherited size. The plan therefore has to be **bridge → migrate → delete**, with a new gate rule for the silent half.
4. **The type ramp is 16 steps replacing 10**, and 612 call sites use the old names (463 on names that disappear, 149 on three names —
   `display`, `body`, `micro` — that survive with different values). `check-type-scale` stays true only if `tokens.css` and
   `cn.ts` change in the same commit, and it has one trap: a fluid value (`min(124px, 31vw)`) is invisible to its regex.
5. **Tailwind 4 cannot attach a font family or `uppercase` to a `--text-*` step** (only line-height, weight, tracking). Pulse binds family
   and case to the role, so a second mechanism is required, and it becomes a third copy of the step list unless the gate is extended.
6. **All three fonts exist on npm as Fontsource packages, variable and static, with a `latin-ext` subset** (5.3.0, OFL-1.1). The three
   Pulse faces together are lighter than today's two: 117-148 KB against 209 KB for a Hungarian session.
7. **Theme packs are decided (D1): Pulse only.** In this area that means: six `[data-theme]` blocks deleted (213 lines), the whole
   client theme engine removed (3 files in `ui/theme`, 4 in `features/settings`, one block of `SettingsPage`, the provider mount, the
   pre-paint script, about 20 i18n keys in three bundles), and `--accent` kept as the single source every lit value derives from — so
   a future pack is one `:root[data-theme='x'] { --accent: … }` line. One consequence nobody has planned: **the coin store keeps
   selling Aurora and Ember** (`GET /coins/store`) until the backend package lands, for a pack that can no longer be worn.
8. **Light mode does not exist** (0 hits for `data-mode`, `prefers-color-scheme`, a light block) and Pulse cannot have one as designed.
9. **Six copies of the canvas colour and five copies of the pack roster** exist with no gate linking them; one copy is already wrong
   (`index.html:24` lists 5 packs, `ThemeProvider.tsx:11-19` lists 7). D1 removes the client roster copies; the canvas copies remain.

---

## 1. What exists today

### 1.1 `tokens.css` — layout and size

| Block | Lines | Selector | Holds |
|---|---|---|---|
| Layer 1 primitives | 20-213 | `@theme static` | fonts (23-25), 10 type steps (29-82), spacing names (86-100), radius scale 0-8 + full (103-112), 6 durations + 2 easings (115-138), sizing (141-145), layout metrics (154-189), blur scale (200-203), z ladder (208-212) |
| Layer 2 default pack | 225-375 | `:root, [data-theme='midnight']` | surfaces, borders, ink, accent, 4 semantic pairs, 5 structural radii, border width, control height, 2 shadow stacks, glass set (307-356), aurora (364-368), tile tint (373-374) |
| Layer 2 packs | 377-550 | `[data-theme='solar' / 'forest' / 'neon' / 'mono']` | each redeclares surfaces, ink, accent, semantics, radii, border width, control height, shadows |
| Layer 2 derived | 557-656 | `:root` | `--text-1..3` (571-573), accent ramp 50-950 (577-587), hover/pressed (590-591), washes and borders (599-628), focus ring (630), scrims (639-640), noise (648), brand gradient (655) |
| Layer 3 component | 659-797 | `:root` | `--btn-*`, `--field-*`, `--card-*`, `--radius-inset`, `--sheet-*`, `--nav-*`, `--toast-*`, `--muscle-*`, `--skeleton-*` |
| Purchasable packs | 820-858 | `[data-theme='aurora' / 'ember']` | surfaces, ink, accent, their own `--aurora` |
| Glass fallbacks | 876-917 | `@supports not (backdrop-filter)`, `@media (prefers-reduced-transparency)` with `:root:not([data-transparency='full'])`, `:root[data-transparency='none']` | collapse `--glass-1..3` to opaque surfaces |
| Tailwind mapping | 922-978 | `@theme inline` | 33 `--color-*` names and 6 `--radius-*` self-references |

Counts (script over `frontend/src`, 141 files besides `tokens.css`): **219 declared custom properties**, 195 without the Tailwind
`--text-x--modifier` entries. Seven `[data-theme]` values. No `[data-mode]`.

Two load-bearing comments an implementer must not undo:
- `@theme static` (lines 16-20): without `static`, Tailwind tree-shakes primitives that are only consumed through `var()`.
- `@theme inline` self-references (964-977): `--radius-button: var(--radius-button)` only works because a real declaration exists in
  Layer 2. A self-reference with no backing declaration resolves to nothing.

### 1.2 How a theme reaches the screen

1. `frontend/index.html:19-39` — an inline pre-paint script reads `localStorage['tracker.theme']`, sets `data-theme` if the pack is in a
   hard-coded list of **five** (`line 24`), and writes a custom `--accent` / `--accent-fg` inline.
2. `ThemeProvider.tsx:87-108` `applyToDom` — sets `data-theme`, sets or deletes `data-transparency`, writes a custom `--accent` and
   `--accent-fg` inline (`readableOn`, `contrast.ts:33-37`), writes a custom `--gradient-brand` inline.
3. `useThemeSync.ts:36-51` — `GET /me/theme` once (server wins on first load), `PUT /me/theme` on save. Synced: `pack`, `accent`,
   `gradient`. Device-only: `transparency`.
4. `ThemeStudio.tsx:127` renders one chip per entry of the static `THEME_PACKS` (seven); tap previews, a button commits.
5. Server, `backend/src/theme/routes.js`: `PUT` body is `{pack, accent, gradient}` `.strict()` (57-63); the pack must exist in
   `theme_packs`, be active and be entitled, in one `INSERT … SELECT` (140-159); a custom accent is contrast-checked against the pack's
   `surface_hex` (111-129). `GET` returns `{theme, packs}` where `packs` carries `locked` per pack (76-93) — **the client ignores
   `packs`** (`useThemeSync.ts:20-22` types only `theme`).
6. Store: `019_coins.sql:774-781` seeds seven `theme_packs` rows (five free, `aurora` and `ember` behind `theme.aurora` /
   `theme.ember`); `794-796` seeds exactly two store items at 25000 minor (250 coins). Triggers enforce entitlement on write (853-879)
   and reset a revoked pack to `'midnight'` (887-895).

ADR-0015 says "Four free packs are retired. The two purchasable packs survive as skins." **That was never implemented**: all seven are
in `THEME_PACKS`, in the DB seed and in the picker, and four of them still carry full structural blocks.

### 1.3 Type today

- 10 steps in `tokens.css:29-82`: `display` 34/40/700, `timer` 48/48/700, `title-1` 26/32/700, `title-2` 20/26/600, `title-3`
  17/24/600, `body` 15/22/400, `body-strong` 15/22/500, `body-s` 13/18/400, `caption` 12/16/500, `micro` 11/14/600 +6 %.
- `cn.ts:34-45` `TYPE_STEPS` lists the same 10; `extendTailwindMerge` puts them in the `font-size` group (47-55). Without that entry
  `cn('text-title-1', 'text-text-1')` silently drops the size (ADR-0019, 41 sites were affected).
- `check-type-scale.mjs:43-60` compares the two lists **in both directions** and exits 1 on any difference.
- Family: two families, `--font-display` Space Grotesk and `--font-body` Inter (`tokens.css:23-25`). The display face is applied by
  `index.css:31-34` to `.font-display, h1, h2, h3`. There is no mono family; `font-mono` is used 0 times.

Call sites (exact-class grep, `frontend/src`, `.ts/.tsx/.css`, excluding `tokens.css`):

| Class | Sites | Files | | Class | Sites | Files |
|---|---|---|---|---|---|---|
| `text-body-s` | 178 | 50 | | `text-title-1` | 30 | 26 |
| `text-caption` | 163 | 56 | | `text-body-strong` | 25 | 17 |
| `text-micro` | 72 | 33 | | `text-display` | 22 | 18 |
| `text-body` | 55 | 31 | | `text-title-2` | 19 | 13 |
| `text-title-3` | 45 | 26 | | `text-timer` | 3 | 3 |

Total 612. Also: `font-display` 30 sites / 23 files, `<h1>`-`<h3>` 69 elements, `uppercase` 63 sites (49 of them beside `text-micro`),
`tabular-nums` 96 sites / 48 files, ad-hoc weight utilities 10 sites, `tracking-*` 0, arbitrary `text-[…]` font sizes 0 (all 18
`text-[…]` hits are colours).

### 1.4 Fonts today

`index.css:6-9` imports `@fontsource-variable/inter/index.css` and `@fontsource/space-grotesk/{500,600,700}.css`. No preload link in
`index.html`. Fontsource CSS hard-codes `font-display: swap` and declares every subset. Measured in `node_modules`:
Inter variable `latin` 48.3 KB + `latin-ext` 85.1 KB; Space Grotesk 3 weights `latin` 39.4 KB + `latin-ext` 36.6 KB. A Hungarian
session needs both subsets of both families: **209.3 KB**. `dist/assets` currently holds 16 `.woff2` files, 307 KB.

### 1.5 The gates that guard this area

| Gate | What it enforces here |
|---|---|
| `check-tokens.mjs` | raw values outside `tokens.css`; undeclared `var(--x)`; undefined owned-stem colour utilities; undefined `size-icon-*` / `col-*` / `screen-x`; unpinned built-in animations; raw `<button>`; sub-44 targets (section 5) |
| `check-type-scale.mjs` | `--text-<step>` in `tokens.css` == `TYPE_STEPS` in `cn.ts`, both directions |
| `check-aurora.mjs` | no ancestor of `<AuroraBackdrop` paints a background (9 mounts in 5 files today) |
| `check-safe-area.mjs:56-80` | `.screen-x` exists in `index.css`; every `.screen-x` block uses `max()` with the left and right safe-area insets |
| `check-i18n.mjs` | hu/en/de carry identical keys **and a key no source file names is a failure** — removing a UI means removing its keys in all three bundles in the same change |
| `tsc -b` (`noUnusedLocals`) | removing a consumer leaves unused imports that fail the build |

---

## 2. How the Pulse token set fits the three layers

Naming rule used below: the kit's token on the left (`P.*` in `figma-build/app-kit.js:67-72`), the CSS name on the right. Where the
existing name is kept, call sites written against today's utilities (`bg-surface-0`, `text-text-2`) stay valid.

### 2.1 Layer 1 — primitives (`@theme static`)

| Token | Today | Pulse | Verdict |
|---|---|---|---|
| `--font-display` | Space Grotesk | Big Shoulders Display | re-valued |
| `--font-body`, `--font-sans` | Inter Variable | Geist | re-valued |
| `--font-mono` | not declared (Tailwind default) | Geist Mono | **new** |
| `--text-*` | 10 steps | 16 steps | replaced (section 3) |
| `--spacing` 4px, `--spacing-tight` 8, `--spacing-group` 16, `--spacing-section` 32 | — | Pulse rhythm: label→value 8, rule→eyebrow 16, eyebrow→content 16, between blocks 32 | **kept as is** — the three named steps are exactly Pulse's three named distances. 464 sites keep working. 4 / 12 / 20 / 24 / 48 are plain grid multiples |
| `--radius-0..8`, `--radius-full` | scale | only 0, 2 (skeleton, user photos), 28 (sheet top), full (pill, switch, badge) are used; bars and segments are **1 px**, which the scale lacks | scale kept; **new** `--radius-bar: 1px`. `raw-radius` forbids `rounded-[1px]`, so the step has to exist |
| `--duration-instant/fast/base/slow/ambient/toast`, `--ease-standard`, `--ease-linear` | 100 / 150 / 250 / 400 / 1200 / 4000 ms, `cubic-bezier(0.16, 1, 0.3, 1)` | identical (Pulse System 2.4) | **unchanged**. The JS duplicates (`useMotionSafe.ts:42`, `E10Tabs.tsx:46`, `E12E16.tsx:30`) stay correct |
| `--target-min` 44px | — | every target ≥ 44 | unchanged |
| `--icon-sm/md/lg` 16 / 20 / 24 | — | glyph 20, icon button 24 | unchanged; tab icon box 32 (28 with seven tabs) is **new** (`--tab-icon`, `--tab-icon-dense`) |
| `--nav-h` 64px | — | tab bar 56 | re-valued; `--content-pad-b`, `--content-pad-b-lg` derive from it (5 + 5 + 3 `var()` refs) |
| `--offline-h`, `--viewport-h`, `--col-mobile`, `--col-wide`, `--table-*`, `--admin-sidebar-w`, `--nav-dock-offset` | — | not addressed by Pulse | unchanged (shell and admin decide) |
| `--blur-sm/md/lg/xl` | 8 / 16 / 28 / 40 | "no blur anywhere" | **die** (3 external refs, 3 internal) |
| `--z-*` | 20 / 40 / 50 / 60 / 70 | same overlays (sheet, toast band) | unchanged |
| component metrics | — | row heights 56 / 64 / 76, primary pill 56 (small 44), switch 48 × 28, selection mark 2, segment 6, bar 4, status dot 6, thumb 48, bottom fade 130, gutter 24 (16 below 376 px) | **new**, as plain primitives: `--row-h`, `--row-h-sub`, `--row-h-ledger`, `--control-h-primary`, `--switch-w`, `--switch-h`, `--mark-h`, `--seg-h`, `--bar-h`, `--dot`, `--thumb`, `--fade-h`. Consumed as `min-h-[var(--row-h)]` — the spelling `min-h-[var(--target-min)]` already uses 66 times |

### 2.2 Layer 2 — semantics

| Pulse role (kit) | Value | Existing token | Today (default pack) | Verdict |
|---|---|---|---|---|
| `bg` | `#0B0D0A` | `--surface-0` | `#0B0D10` | re-valued. `body` already paints it (`index.css:21`) |
| `s1` (reserved, do not use) | `#141712` | `--surface-1` | `#12151A` | re-valued, then unused. `bg-surface-1` has 30 sites today; Pulse forbids every one |
| `s2` sheet · skeleton · disabled pill | `#1E2219` | `--surface-2` | `#181C22` | re-valued; 78 sites today, 3 legal uses in Pulse |
| `s3` switch track (off) | `#2A2F24` | `--surface-3` | `#20252D` | re-valued |
| `t1` | `#F2F5EA` | `--text-1` | `rgb(ink / 0.92)` | re-valued **and re-constructed**: Pulse draws fixed hexes, not ink alphas. `--text-1` goes from 92 % to 100 % |
| `t2` | `#A9B09D` | `--text-2` | `rgb(ink / 0.70)` | fixed hex (the alpha would give `#ADAFA7`) |
| `t3` | `#858C79` | `--text-3` | `rgb(ink / 0.52)` | fixed hex (the alpha would give `#83867E`) |
| ink | 242 245 234 | `--ink` | 242 245 247 | re-valued; still needed by `--edge` and `--skeleton-sheen` |
| `accent` | `#CBFF2E` | `--accent` | `#7C94ED` | re-valued |
| `onAccent` | `#0B0D0A` | `--accent-fg` | `#0B0D10` | re-valued. Keep the name: `text-accent-fg` has 21 sites, and `check-tokens.mjs:144-153` documents `text-on-accent` as the guess that resolved to nothing |
| `accentDown` | `#B4E61F` | `--accent-pressed` | `var(--accent-600)` | **re-derived** — today's formula gives the wrong colour (see 2.5) |
| `edge` | `#5E615B` = ink 36 % | — | — | **new** `--edge: rgb(var(--ink) / 0.36)` (computed composite on `bg`: `#5E615B`, matches) |
| `hair` | white 8 % | `--surface-border` | white 12 % | re-valued. 67 `var()` refs / 38 files + 7 `border-border-token` — all are box borders that die with their box |
| `hairS` | white 14 % | `--surface-border-strong` | white 22 % | re-valued, **meaning changes**: today it is the hover edge (12 refs), in Pulse it is the rule that opens a section and the sheet edge |
| `track` | white 10 % | — | — | **new** `--track` (meter track, blank day, locked segment) |
| `danger` | `#F87171` | `--danger` | `#F87171` | **identical** |
| `warn` | `#FBBF24` | `--warning` | `#FBBF24` | **identical** |
| `ok` | `#34D399` | `--success` | `#34D399` | **identical** |
| — | — | `--info` `#60A5FA` | — | no Pulse role (7 + 6 utility sites). Dies unless a screen proves a need |
| scrim | black 60 % | `--scrim` | black 50 % (`--scrim-strong` 65 %) | one value; `--scrim-strong` dies (6 `bg-scrim*` sites in 3 files) |
| glow | `0 0 20px accent 38 %` + `0 4px 10px -2px accent 30 %` | `--shadow-glow` | `none` (Neon only: `0 0 12px accent 45 %`) | re-valued with `color-mix` from `--accent`, so it follows a lamp. `control.ts:67` already puts it on the primary variant |
| radii | pill full · sheet top 28 · nothing else | `--radius-button / field / card / sheet / chip` | 12 / 12 / 16 / 24 / full | `button` → full, `sheet` → `--radius-8`, `field` → 0, `card` → 0, `chip` → full (badge, switch). Utility sites: `rounded-chip` 192, `rounded-card` 113, `rounded-field` 77, `rounded-button` 4, `rounded-sheet` 0 |
| rule weight | 1 px | `--border-width` | 1px (Mono 2px) | 1px, pack-independent (61 refs) |
| control height | 44 (pill 56) | `--control-h` | 44 (Solar 48) | 44, pack-independent; the 56 pill is the new `--control-h-primary` |
| elevation | none | `--shadow-overlay`, `--shadow-overlay-strong`, `--overlay-border` | 3-layer stacks | shadows **die** (11 + 3 refs); the sheet edge is `hairS` |

Tokens with no Pulse role at all (Layer 2): `--glass-1/2/3`, `--glass-rim`, `--glass-lip`, `--glass-underside`, `--glass-sheen`,
`--glass-sheen-angle`, `--card-saturate`, `--aurora` (three definitions: 364, 834, 853), `--noise-overlay`, `--gradient-brand`,
`--tile-tint`, `--tile-tint-fg`, `--accent-50 … -950` (11 names, 2 external refs), `--accent-hover` (Pulse defines press, not hover),
`--accent-subtle` (82 `bg-accent-subtle` sites — Pulse has no wash: selection is a 2 pt mark), `--accent-border`,
`--on-accent-subtle`, the four `*-subtle`, the four `*-border`, the four `--on-*` (38 `text-on-*` sites — Pulse never fills a surface
with a semantic colour), `--scrim-strong`.

### 2.3 Layer 3 — component tokens

| Token | Today | Pulse | External `var()` refs |
|---|---|---|---|
| `--btn-bg/fg/bg-hover/bg-pressed/radius` | accent family | same roles (lime, `#0B0D0A`, `accentDown`, full) | 0 — declared, never consumed; `control.ts` uses utilities. Delete or start using; do not leave a second, unused definition of the pill |
| `--field-bg` | `--surface-2` | transparent (underline field) | 19 / 12 files |
| `--field-border` | hairline | `--edge` (1 px idle), accent 2 px focus, danger 2 px error, hairline disabled | 11 / 8 |
| `--field-radius` | 12 | 0 | 0 |
| `--card-bg`, `--card-blur`, `--card-rim`, `--card-border`, `--card-radius`, `--card-pad`, `--radius-inset` | glass card | **no card exists** | 2, 0, 1, 7, 6, 11, 0 |
| `--sheet-bg` | `--glass-3` | `--surface-2` | 6 / 4 |
| `--sheet-blur`, `--sheet-shadow` | blur-lg, overlay stack | none | 1, 2 |
| `--sheet-radius` | 24 | 28 (top only) | 0 (`--radius-sheet` is read directly, 5 refs) |
| `--nav-bg`, `--nav-blur` | `--glass-2`, blur-lg | no surface; a bottom fade of `bg` instead (new `--nav-fade`) | 3, 2 |
| `--nav-fg-active` | accent | `--text-1` (label; the icon is the lit raster) | 1 |
| `--nav-fg-idle` | `--text-3` | `--text-2` | 1 |
| `--toast-bg`, `--toast-blur` | `--glass-3`, blur-lg | `--surface-0` ("the page's own black"), none | 1, 0 |
| `--skeleton-base` | `--surface-2` | `s2` | same token, same meaning (7 refs) |
| `--skeleton-sheen` | surface-3 + 8 % ink | sheen on `ambient` | kept |
| `--muscle-body/idle/edge/secondary` | vector anatomy fills | the figure is a raster; the vector drawing was rejected by the owner (ADR-0020) | 8 refs, 1 file — owned by the muscle-map area |

### 2.4 Utilities a no-box design needs declared in `@theme inline` / `@theme static`

`check-tokens` only lets a colour utility through if its `--color-*` exists, and it forbids raw radii and durations, so every recurring
Pulse value needs a name before the first screen is written.

- **Colours (new):** `--color-edge`, `--color-hair`, `--color-hair-strong`, `--color-track` → `border-edge`, `border-hair`,
  `divide-hair`, `bg-hair-strong` (a rule drawn as a 1 px element), `bg-track`. Either add these as aliases of the re-valued
  `--surface-border*`, or rename; do not keep both names permanently (two names for one line is the drift this repo keeps finding).
- **Colours (kept):** `surface-0..3`, `text-1..3`, `accent`, `accent-fg`, `accent-pressed`, `success`, `warning`, `danger`, `scrim`.
- **Half-lit level** (`t1` 50 %): no token needed — `bg-text-1/50` resolves (Tailwind opacity modifier on an inline theme colour) and
  passes the owned-stem rule because `text-1` is declared.
- **Glow:** `--shadow-glow` self-referenced in `@theme inline` gives `shadow-glow`; today's spelling `shadow-[var(--shadow-glow)]`
  (3 sites) is equally legal.
- **Radii:** `rounded-button` (pill), `rounded-t-sheet` (needs `--radius-sheet` mapped, it already is), `rounded-chip` (badge,
  switch), new `rounded-bar` (1 px), `rounded-1` (2 px — generated today from `--radius-1`).
- **Type:** 16 `--text-*` steps and three `--font-*` families (section 3).
- **Animation:** the resting pulse of the idle pill and the skeleton sheen as `--animate-*` entries whose duration is
  `var(--duration-ambient)`; a literal inside `animate-[…]` is rejected by `raw-duration-in-animate`.
- **Blend mode:** `mix-blend-lighten` is a Tailwind built-in (0 uses today) — no token.
- **Stem warning:** every `--color-<stem>-…` makes `<stem>` an owned stem (`check-tokens.mjs:169`). After adding `edge`, `hair`,
  `track`, any class `border-hair-x` that does not resolve fails the build — which is the intended behaviour, but pick stems that are
  not the first segment of a Tailwind utility after a colour prefix.

### 2.5 Values verified (WCAG formula from `contrast.ts`, composites computed)

| Check | Result |
|---|---|
| `t1` / `t2` / `t3` on `bg` | 17.68 / 8.72 / 5.60 — Pulse System's 17.7 / 8.7 / 5.6 confirmed |
| `t2` / `t3` on `s2` | 7.23 / 4.64 — confirmed |
| lime on `bg`; `onAccent` on lime | 16.62 / 16.62 |
| ink 36 % on `bg` | `#5E615B` — equals `edge` |
| white 8 % / 14 % / 10 % on `bg` | `#1F201E` / `#2D2F2C` / `#232523` — equal `hair` / `hairS` / `track` (the note prints `#232522`, a rounding difference) |
| `--accent-pressed` as built today (`--accent-600` = `color-mix(in oklab, accent, black 14%)`) for lime | `#A6D124` — **not** `#B4E61F` |
| `color-mix(in oklab, #CBFF2E, black 9%)` | `#B3E127` — within 1-8/255 per channel of `#B4E61F`; use this derivation if lamps are kept, or the literal if lime is the only accent |
| every pack accent on `bg` (the `checkAccent` rule, ≥ 4.5) | solar `#E89D4D` 8.70 · forest `#4DC18D` 8.67 · neon `#19CDE6` 10.14 · mono `#FAFAFA` 18.70 · aurora `#4FD1C5` 10.46 · ember `#F0803C` 7.30 — all pass; `#0B0D0A` on each has the same ratio, so one `--accent-fg` serves every lamp |
| Mono accent `#FAFAFA` against `t1` `#F2F5EA` | 1.06 : 1 — "lit" and "ink" cannot be told apart by colour |

---

## 3. The type ramp

### 3.1 The 16 steps (Pulse System section 2.2 = `TY` in `app-kit.js:87-92`)

Proposed step names are the kit's role names in kebab case, so a builder reading `tx(str, 'capM', P.t2)` in
`figma-build/app/<screen>.body.js` writes `text-cap-m text-text-2` without a lookup table.

| Step (`text-…`) | Family | Size | Line height | Weight | Tracking | Case |
|---|---|---|---|---|---|---|
| `giant` | display | 7.75rem (124) | 6.75rem (108) | 900 | −0.01em | digits, `/`, `:` only |
| `num` | display | 3rem (48) | 3rem | 900 | 0 | — |
| `display-xl` | display | 3rem (48) | 3rem | 700 | 0.01em | UPPER |
| `display` | display | 2rem (32) | 2.125rem (34) | 700 | 0.01em | UPPER |
| `eyebrow` | display | 1rem (16) | 1.25rem (20) | 700 | 0.06em | UPPER |
| `title` | body | 1.375rem (22) | 1.75rem (28) | 600 | −0.01em | sentence |
| `body` | body | 1rem (16) | 1.375rem (22) | 400 | 0 | sentence |
| `body-m` | body | 1rem | 1.375rem | 500 | 0 | sentence |
| `body-b` | body | 1rem | 1.375rem | 600 | 0 | sentence |
| `cap` | body | 0.8125rem (13) | 1.125rem (18) | 400 | 0 | sentence |
| `cap-m` | body | 0.8125rem | 1.125rem | 500 | 0 | sentence |
| `tab` | body | 0.6875rem (11) | 0.875rem (14) | 500 | 0.01em | sentence |
| `tab-on` | body | 0.6875rem | 0.875rem | 600 | 0.01em | sentence |
| `data-l` | mono | 1rem (16) | 1.25rem (20) | 500 | −0.01em | — |
| `data` | mono | 0.8125rem (13) | 1.125rem (18) | 500 | 0 | — |
| `micro` | mono | 0.6875rem (11) | 1rem (16) | 500 | 0.10em | UPPER |

Seven sizes: 124, 48, 32, 22, 16, 13, 11. Figma tracking in per cent equals em / 100. Nothing below 11 px; input text is 16 px
(WebKit zooms under 16 — today's `body` is 15, so the fix arrives with the ramp).

`timer` (48/48/700, 3 sites: `IntervalStage.tsx:147`, `NotificationsPage.tsx:133`, `OnboardingPage.tsx:511`) has the same metrics as
`num` and disappears into it.

### 3.2 Family and case cannot ride on the step — the Tailwind limit

Tailwind 4 reads exactly three modifiers per `--text-*` step: `--line-height`, `--letter-spacing`, `--font-weight` (the file uses all
three, lines 29-82). There is no family or `text-transform` modifier. In Pulse the family **is** part of the role (an eyebrow in Geist
is not an eyebrow), so writing `font-display text-eyebrow uppercase` at every call site re-creates the defect `tokens.css:62-66`
describes ("a role patched at the call site is a role the next screen re-decides").

Two honest ways to bind them once:

- **(a) A component-layer rule keyed on the step classes**, in `index.css` or `tokens.css`:
  `@layer components { .text-giant, .text-num, .text-display-xl, .text-display, .text-eyebrow { font-family: var(--font-display) }`
  `.text-data-l, .text-data, .text-micro { font-family: var(--font-mono) }`
  `.text-display-xl, .text-display, .text-eyebrow, .text-micro { text-transform: uppercase } }`.
  In `components`, so an explicit `font-body` or `normal-case` utility still wins. Protects raw class usage, which agents will write.
  Cost: a **third** home of the step list — `check-type-scale` must grow a leg that reads it, or it will drift.
- **(b) A typed recipe** (`src/ui/primitives/type.ts`, a `cva` like `control.ts`): `type('eyebrow')` returns the three classes;
  TypeScript makes an unknown role a compile error. Cost: nothing stops a raw `text-eyebrow` without the family.

Recommendation: (a) plus the gate leg; (b) may sit on top as a convenience. Either way the existing global rule
`index.css:31-34` (`.font-display, h1, h2, h3 { font-family: var(--font-display) }`) **must lose `h1, h2, h3`**: 69 heading elements
would otherwise switch to Big Shoulders the moment `--font-display` changes, and Pulse sets sheet titles, person names and the
greeting in Geist (`title`).

`text-transform: uppercase` handles ő → Ő and ű → Ű without locale tailoring; `document.documentElement.lang` is kept current by
`src/i18n/index.ts:59-62`. German ß becomes SS.

### 3.3 `cn.ts` and `check-type-scale` — what keeps the gate true

The gate (`check-type-scale.mjs:43-50`) counts a declaration as a step when: the name after `--text-` contains no `--`, is not all
digits (that excludes the ink tokens `--text-1/2/3`), and **the value matches `^[\d.]+(rem|px|em)$`**.

1. `tokens.css` and `cn.ts` change in **one commit**. A step in only one of them is a build failure in either direction (59-60).
2. **The `giant` trap.** Pulse specifies `giant = min(124px, 31vw)` (Pulse System section 3, "Widths"). Declared as
   `--text-giant: min(7.75rem, 31vw)` it fails the value regex, is not counted, and `'giant'` in `TYPE_STEPS` is then reported as
   "listed in cn.ts but no --text-giant exists" — build red. Left out of `TYPE_STEPS`, the merger drops `text-giant` beside an ink
   class and the hero numeral renders at 16 px with no error. Two fixes: keep `--text-giant: 7.75rem` a plain length and apply the
   viewport cap in the one numeral component through a token **outside** the `--text-` namespace (for example
   `--giant-fluid: min(var(--text-giant), 31vw)`); or widen the gate's value regex to accept `min(` / `clamp(` / `calc(`. The first
   needs no gate change; the second removes a blind spot. Never name the fluid token `--text-…`: Tailwind would generate a second
   utility that is not in `TYPE_STEPS`.
3. `TYPE_STEPS` at the end state, exactly:
   `'giant', 'num', 'display-xl', 'display', 'eyebrow', 'title', 'body', 'body-m', 'body-b', 'cap', 'cap-m', 'tab', 'tab-on', 'data-l', 'data', 'micro'`
   — the gate then prints `OK — 16 step(s)`.
4. Families need no `cn.ts` change: `tailwind-merge` already files `font-display` / `font-body` / `font-mono` under `font-family`.
5. During the bridge (section 10) both files carry the 16 new steps **plus** the seven legacy-only names, 23 in total.

Run against the installed `tailwind-merge` (^3.6.0) with the proposed list, to prove the names behave:

| Call | Result |
|---|---|
| unconfigured `twMerge('text-cap-m text-text-2')` | `text-text-2` — the size is deleted; this is ADR-0019's defect, alive for every new name until it is listed |
| configured `cn('text-cap-m text-text-2')` | `text-cap-m text-text-2` |
| configured `cn('text-giant tabular-nums', 'text-text-1')` | `text-giant tabular-nums text-text-1` |
| configured `cn('text-data-l text-data text-accent')` | `text-data text-accent` — sizes conflict with each other, not with the colour |
| configured, legacy name **not** in the list: `cn('text-body-s text-text-2')` | `text-text-2` — a legacy step dropped from `TYPE_STEPS` too early loses its size at every remaining call site, even while `tokens.css` still declares it |
| `twMerge('font-body font-display')` | `font-display` |
| `twMerge('font-display font-mono font-bold')` | `font-mono font-bold` |

### 3.4 Old step → Pulse role (the bridge table)

| Legacy step | Sites | Nearest Pulse role | Mechanical? |
|---|---|---|---|
| `display` 34/40/700 | 22 | `display` 32/34 Bold UPPER — same name, new value | yes, but it now uppercases and condenses |
| `timer` 48/48/700 | 3 | `num` | yes |
| `title-1` 26/32/700 | 30 | `display` (in-page heading) **or** `num` (a figure, e.g. the 26 px stat) **or** `title` (a name) | **no — per site** |
| `title-2` 20/26/600 | 19 | `title` 22/28 SemiBold | mostly |
| `title-3` 17/24/600 | 45 | `body-b` 16/22 SemiBold (Pulse retired the 17 px `headline`) | yes |
| `body` 15/22/400 | 55 | `body` 16/22 — same name, +1 px | yes |
| `body-strong` 15/22/500 | 25 | `body-m` | yes |
| `body-s` 13/18/400 | 178 | `cap` | yes |
| `caption` 12/16/500 | 163 | `cap-m` or `cap` (12 px is retired) or `data` when it holds a figure | **no — per site** |
| `micro` 11/14/600 +6 % | 72 | `eyebrow` (49 sites are `text-micro uppercase` section labels → 16 px display) · `micro` (tags) · `tab` (labels) | **no — per site** |

Per area (legacy-only names / same-name names): admin 40/25, coaching 51/23, compose 59/9, plans 28/4, marketplace 25/10, workout
23/3, progress 21/3, chat 20/6, settings 18/6, nutrition 18/4, coins 15/2, library 15/9, onboarding 13/2, home 9/4, auth 2/3,
`ui/feedback` 39/9, `ui/primitives` 11/1, `ui/data` 8/3, `ui/TokenProof.tsx` 21/11, `features/playground` 15/6.

### 3.5 Consequences in `index.css`

- `body { font-size: var(--text-body); line-height: var(--text-body--line-height) }` (24-25) stays and moves the global base 15 → 16.
- The `h1, h2, h3` display rule goes (3.2).
- `.tnum` and Tailwind `tabular-nums` (96 sites) stay. Geist ships tabular figures; **Big Shoulders Display's `tnum` feature is
  unverified** (the Review Brief flags it too) — the interval countdown ticks in that face, so check it on the first build.
- `::selection` (51-54) reads `--accent-subtle`; if that token dies the rule needs another source.

---

## 4. Fonts

### 4.1 The packages (npm registry, queried 2026-10-11)

| Family | Variable package | Static package | Version | Licence | Subsets | Styles |
|---|---|---|---|---|---|---|
| Big Shoulders Display | `@fontsource-variable/big-shoulders-display` | `@fontsource/big-shoulders-display` | 5.3.0 | OFL-1.1 | latin, latin-ext, vietnamese | normal, 100-900 |
| Geist | `@fontsource-variable/geist` | `@fontsource/geist` | 5.3.0 | OFL-1.1 | latin, latin-ext, cyrillic, cyrillic-ext, vietnamese | normal **and italic**, 100-900 |
| Geist Mono | `@fontsource-variable/geist-mono` | `@fontsource/geist-mono` | 5.3.0 | OFL-1.1 | latin, latin-ext, cyrillic, cyrillic-ext, symbols2, vietnamese | normal and italic, 100-900 |

Traps: `@fontsource/geist-sans` also exists (an older packaging of the same family) and `@fontsource-variable/geist-sans` does
**not** (404); `@fontsource/big-shoulders` / `@fontsource-variable/big-shoulders` are a different, newer family name — the kit uses
"Big Shoulders Display". Vercel's own `geist` package (1.7.2) is built for `next/font` and is not the right tool here.

CSS family names follow the convention the repo already relies on (`'Inter Variable'`, `tokens.css:24`): variable packages register
`'Big Shoulders Display Variable'`, `'Geist Variable'`, `'Geist Mono Variable'`; static packages register the plain family name.

### 4.2 Hungarian glyphs (ő U+0151, ű U+0171, Ő U+0150, Ű U+0170)

- All four code points fall in the `latin-ext` subset, whose declared range for all three packages is `U+0100-02BA, …` (Fontsource
  API metadata).
- Direct evidence that the fonts contain the glyphs: the Figma component sheet renders "ŐŰ" in every role of all three faces —
  `TRACKER-mockups/5-pulse/kepernyok-2x/_components-1.png` (Big Shoulders Black and Bold, Geist Regular/Medium/SemiBold) and
  `_components-2.png` (Geist Mono `dataL`, `data`, `micro`). Figma and Fontsource both serve the Google Fonts builds.
- Not verified here: the binary `cmap` of the exact 5.3.0 files (nothing was installed in this read-only phase). A one-line check
  after install closes it; so does opening any screen with "Kezdőlap".
- Consequence for loading: a Hungarian UI **always** needs `latin` and `latin-ext` of Geist ("Kezdőlap" is in the tab bar) and
  nearly always of Big Shoulders ("EDZŐ", "ELŐZŐ"). Preload both subsets, not just `latin`.

### 4.3 Variable or static

Weights Pulse uses: Big Shoulders 700 and 900; Geist 400, 500, 600; Geist Mono 500 only. File sizes (bytes, from the package listings):

| Family | Variable `latin` + `latin-ext` | Static, needed weights only, both subsets |
|---|---|---|
| Big Shoulders Display | 35 504 + 28 688 = **64.2 KB**, 2 files | 700: 14 424 + 12 936; 900: 14 016 + 12 472 = **53.8 KB**, 4 files |
| Geist | 29 400 + 16 512 = **45.9 KB**, 2 files | 400/500/600: 39 624 + 23 764 = **63.4 KB**, 6 files |
| Geist Mono | 23 128 + 14 696 = **37.8 KB**, 2 files | 500: 10 116 + 7 156 = **17.3 KB**, 2 files |

All variable: 147.9 KB / 6 files. Smallest mix (Geist variable, Big Shoulders static 700 + 900, Geist Mono static 500): 117.0 KB /
8 files. Today: 209.3 KB. Recommendation: **Geist variable, Geist Mono static 500**, and for Big Shoulders either — variable costs
10 KB more and saves two requests and gives the monogram ("Black, any size") the same file. If Geist Mono is later dropped (the
Review Brief argues for it; Pulse System's appendix records it as an open owner decision and keeps it), it is one import and one
`--font-mono` line.

### 4.4 Loading: `font-display`, preload, subsets

- Fontsource's shipped CSS is fixed to `font-display: swap` and declares every subset (a `@font-face` descriptor cannot take `var()`).
  With `swap`, the condensed display face first paints in a much wider system fallback and then reflows — and Pulse places numerals
  by measured ink (Review Brief H-14 asks for `font-display: block` on the display face and a preload of both subsets).
- To control that, write the `@font-face` rules by hand in one CSS file next to the tokens (`src/ui/tokens/fonts.css`), with `url()`
  pointing at the package's `files/*.woff2` for `latin` and `latin-ext` only, `font-display: block` for Big Shoulders and `swap`
  for Geist and Geist Mono. The packages stay the source of the binaries; nothing is copied into the repo. `unicode-range` values do
  not trip `check-tokens` (no `#`, no `rgb(`).
- Preload: Vite hashes asset names, so a literal `<link rel="preload">` in `index.html` cannot name the built file by hand. Either
  point the link's `href` at the source path and let Vite's HTML asset handling rewrite it, or inject the tags from
  `vite.config.ts` with a small `transformIndexHtml` hook over the emitted bundle. **Verify in the build output**, this is not proven
  here. The tag needs `as="font" type="font/woff2" crossorigin` even on the same origin.
- CSP (`backend/server.js:95-116`): `font-src 'self'`, `style-src 'self'`, `script-src 'self'`. Bundled CSS and Vite-emitted woff2
  satisfy all three; a Google Fonts `<link>` or an inline `<style>` would be blocked.

### 4.5 Inter and Space Grotesk

Both leave. Pulse System section 2.2: "Inter exists only in the status-bar clock" — that is the phone frame drawn in Figma, not app
UI. Remove both `@import`s (`index.css:6-9`) and both dependencies (`package.json`, lockfile) in the same commit that re-points
`--font-display` and `--font-body`; there is no reason for a period with two body faces, because every consumer reads the variable
(`font-display` 30 sites, `font-body` in `control.ts:18`, `body` in `index.css:23`). Geist italic exists in 5.3.0
(`wght-italic.css` is in the package), which contradicts `Product gaps.md:263` ("Geist has no italic cut") — the post renderer's
emphasis question may already be answered.

---

## 5. `check-tokens` — what it forbids, what it cannot see

**Forbidden outside `tokens.css`** (`check-tokens.mjs:23-90`): a hex colour; `rgb(` / `hsl(` with a number; any Tailwind palette
utility (`bg-lime-400` included — `lime` is in the list); `duration-[150ms]`; a duration literal inside `animate-[…]`;
`rounded-[4px]`; `cubic-bezier(`; arbitrary spacing in px that is not a multiple of 4 (`gap-[6px]`); `<button>` / `<a>` with
`size-` / `h-` / `min-h-` below 11; a raw `<button>` outside `src/ui`.

**Must resolve** (123-190, 285-361): every `var(--x)` (declared in `tokens.css`, or assigned in the same file as `'--x':`); every
colour utility whose first name segment is an owned stem (today: `surface`, `border`, `text`, `accent`, `on`, `scrim`, `success`,
`warning`, `danger`, `info`); `size-icon-*`, `col-*`, `screen-x` (must be defined in `index.css`); `animate-pulse` / `animate-spin`
only while `index.css:192-193` pins their duration.

**Cannot see — and Pulse walks straight into these:**

| Blind spot | Pulse consequence |
|---|---|
| A class that names a removed type step, radius or spacing token (`text-body-s`, `rounded-card`) — Tailwind ignores it silently | the single biggest risk of the migration: text at the inherited size, no error. Needs a new rule (section 9) |
| Arbitrary font sizes, tracking, leading (`text-[7.75rem]`, `tracking-[0.06em]`) | a builder can hand-set a role and bypass the ramp |
| Built-in shape utilities (`rounded-lg`, `border-2`, `shadow-lg`, `backdrop-blur-xl`) | 12 bare `rounded*` sites exist today; nothing stops a new card |
| `bg-black`, `bg-white` (not in the palette list) | Pulse's canvas is `#0B0D0A`, not `#000`; a `bg-black` panel shows as a rectangle |
| The no-box law itself | nothing fails on `bg-surface-1` (reserved), on `<Surface>`, on a second primary pill |
| Scale utilities that are off the 4 pt grid (`gap-1.5`, `gap-0.5`) | allowed — and needed: the kit uses 2 and 6 px gaps |

Pulse-legal spellings that already pass: `h-[2px]` / `h-[6px]` (height is not a spacing prefix), `min-h-[var(--row-h)]`,
`shadow-[var(--shadow-glow)]`, `bg-text-1/50`, `mix-blend-lighten`.

---

## 6. The seven theme packs — three options and their exact code consequences

**Decided: Option B** (owner decision D1, see the box at the top). What D1 means in code, precisely:

| Where | Under D1 |
|---|---|
| `tokens.css` | `:root, [data-theme='midnight']` becomes `:root`; the six other pack blocks (377-550, 820-858) and the three glass-fallback blocks (876-917) are deleted. `--accent-pressed`, `--shadow-glow` and `--focus-ring` stay **derived** from `--accent` (`color-mix`), never typed as lime literals — that is the "one place a pack could override" the owner asked to keep cheap |
| `src/ui/theme/` | `ThemeProvider.tsx` has no state left (pack, custom accent, gradient, transparency all go). `useTheme` has exactly three consumers, all in `features/settings` (`SettingsPage.tsx:95`, `ThemeStudio.tsx:44`, `useThemeSync.ts:33`). `contrast.ts` and `palette.ts` are imported only by the provider and by two unimported files. The folder can be removed whole; no backend script reads it |
| `src/app/providers.tsx:32-59` | the `ThemeProvider` mount goes |
| `features/settings` | `ThemeStudio.tsx`, `useThemeSync.ts`, `AccentPicker.tsx`, `GradientBuilder.tsx` deleted; `TransparencyChoice` (`SettingsPage.tsx:93-138`) and the `<ThemeStudio />` mount (`:298`) removed. The "Megjelenés" section of the approved frame then has no content and is not drawn — the decision is newer than the frame |
| `index.html:11-40` | the pre-paint script is deleted. With one look there is nothing to flash; it removes the only inline script (the CSP has no hash for it) and the 5-versus-7 roster drift |
| "must not break if the API still returns packs or a stored pack id" | satisfied by not asking: nothing calls `GET /me/theme` once `useThemeSync` is gone. A stale `localStorage['tracker.theme']` is never read. A stored custom accent (`user_theme_prefs.accent`) is never applied — today it is written inline and would override lime |
| i18n (dead-key rule) | delete from hu, en and de together: `settings.themePacks`, `settings.themePack.*` (7), `previewTitle`, `previewBody`, `saveTheme`, `themeSaveError`, `transparency`, `transparencyHint`, `transparencySystem`, `transparencyFull`, `transparencyNone`, `accentDefault`, `accentCustom`, `contrastRatioPass`, `contrastRatioFail`, `contrastInvalid`, and `settings.appearance` if the section disappears |
| Coin store | **Not covered by D1's frontend half.** `/coins` renders whatever `GET /coins/store` returns: two items, both theme packs, 250 coins each, with a live purchase control. Until the backend package delists them, a member can spend coins on a pack with no effect. Either the backend package goes first, or the store screen hides `theme.*` SKUs (a display filter, not a control — the server still sells them to a forged request) and shows its existing empty state (`coins.storeEmptyTitle`) |
| Backend package (separate, later) | delist `theme.aurora` / `theme.ember`, decide what owners get back (a ledger write: named worker transaction, idempotency, the 5-pass checklist), retire `/me/theme`; `theme_packs` rows cannot be dropped while `user_theme_prefs.pack` references them (`ON DELETE RESTRICT`, `019_coins.sql:810`) |

The analysis that led there — facts common to all three options: the approved settings frame
(`kepernyok-2x/settings-2@2x.png`) **draws** "Témacsomagok" as seven words (Éjfél · Napfény · Erdő · Neon · Mono · Aurora · Ember,
Aurora marked), a "Téma mentése" link and the "Áttetsző felületek" segmented choice. The coins store frame lists Aurora and Ember by
name. Index, open decision 3, proposed lamps. Backend changes are out of scope for this phase.

### Option A — packs are lamps (accent only) on the Pulse base

| Where | Change |
|---|---|
| `tokens.css` | One base block holds every Pulse semantic. Each of the seven `[data-theme]` blocks shrinks to one line, `--accent`. Lines 377-550 and 820-858 (213 lines) collapse to seven declarations. `midnight` keeps its key and becomes lime. Derived tokens (`--accent-pressed`, `--shadow-glow`, focus ring) already recompute from `--accent` |
| Cascade trap | `:root` and `[data-theme='x']` have equal specificity; a base `:root` block placed **after** a pack block silently wins. Write lamps as `:root[data-theme='x']` |
| `ThemeProvider.tsx` | `THEME_PACKS` unchanged (7). Drop `transparency` and `gradient` (section 7). A stored custom `accent` becomes an eighth, arbitrary lamp unless it is ignored |
| `index.html:24` | The 5-item list must become 7 — or better, a shape test (`/^[a-z][a-z0-9_]{1,31}$/`, the server's own `PACK_KEY`), because an unknown `data-theme` simply matches no block and the roster then has one copy fewer |
| `ThemeStudio.tsx` | Rewritten as a Pulse `chipRow` (seven words, neutral 2 pt mark) — screen work. Owned / price state for Aurora and Ember needs client state and one new string in three languages; the data is already served (`routes.js:76-87`, `locked`) and ignored |
| Backend | None required to ship. Dormant inconsistency: `theme_packs.surface_hex` holds seven old surfaces; it is read only when a custom accent is saved (`routes.js:111-129`). A later migration should set all seven to `#0B0D0A` (`trg_theme_pack_frozen` freezes only `key` and `entitlement_key`) |
| Imagery (other areas) | The active tab icons are pre-rendered **lime** PNGs (`kepek/tab2-*-active.png`). A lamp needs them tinted from `--accent` (mask or blend over a neutral render) or re-rendered 7 × 7. Same for the lit muscle regions and the monogram dot |
| Copy | `coins.item.theme.aurora.description` promises a gradient ("Hideg, északi fényű színátmenet." / "A cold northern gradient set.", `hu.json:785`, `en.json:785`); Pulse forbids gradients. One string in three bundles |
| Risk | Mono (`#FAFAFA`) is 1.06 : 1 against `t1` — lit and ink merge. Ember sits between `danger` and `warning` in hue, Forest next to `success`; Pulse never carries state by hue alone, so they hold, but Mono needs a test frame |

### Option B — Pulse is the only look

| Where | Change |
|---|---|
| `tokens.css` | Delete all six other pack blocks; one `:root` block |
| `ThemeProvider.tsx`, `useThemeSync.ts`, `ThemeStudio.tsx` | The pack concept leaves the client: `THEME_PACKS`, `ThemeState.pack`, the sync hook and the picker go. `SettingsPage.tsx:298` loses the section — **which the approved frame draws** |
| `index.html` | The whole pre-paint script can be deleted: with one look there is nothing to flash. (It is also the only inline script, and the CSP has no hash for it — `server.js:98-100` says the hash "will ship … when it lands", and `scripts/csp-hashes.mjs`, named in `index.html:18`, does not exist) |
| i18n | `check-i18n` fails on unused keys: `settings.themePacks`, `themePack.*` (7), `previewTitle`, `previewBody`, `saveTheme`, `themeSaveError`, and with them the transparency keys (5) must be deleted from hu, en and de together |
| Backend (later phase) | The store's only two items are theme packs: the store is empty and coins have nothing to buy. Owners of Aurora / Ember hold a worthless entitlement; a refund is a ledger write, i.e. a critical endpoint under the owner's own rules (named worker transaction, idempotency, the 5-pass checklist). `user_theme_prefs` and `/me/theme` stay as dead weight until removed |

### Option C — Pulse as an eighth pack

| Where | Change |
|---|---|
| `tokens.css` | A `[data-theme='pulse']` block with the full semantic and structural set; the other seven keep glass, aurora and their radii. Fonts and the type ramp live in Layer 1 (theme-independent) and would have to move into the pack block to differ |
| Components | Pulse is not a re-valuing: it removes cards, boxed inputs, chips and the nav capsule from the JSX. Under the other seven packs a rebuilt screen either renders boxless in periwinkle with tokens nothing consumes (which is Option A with dead weight) or the app keeps two component trees for 24 screens |
| Backend | **Blocked in this phase.** `user_theme_prefs.pack` references `theme_packs(key)` (`019_coins.sql:810`) and `PUT /me/theme` writes through a `SELECT … FROM theme_packs` (`routes.js:140-159`): saving `'pulse'` returns 404 until a migration adds the row |
| The default | "midnight is the default" is written in six places: `tokens.css:225-226`, `ThemeProvider.tsx:58` and `:116`, `routes.js:91`, `019_coins.sql:810` and `:892`. Making Pulse what a user sees means changing all of them, half in the backend |
| Verdict | Contradicts ADR-0020 ("the design of record for the whole app") and the Review Brief ("cannot be guaranteed to look like Pulse") |

**For the plan:** B is decided. Option A is what "we add packs later" will look like, and the only thing B must do today to keep that
cheap is keep `--accent` the single source (no lime literal outside the one declaration) and remember two costs A brings back: the
active tab icons are pre-rendered lime rasters, and a white accent is indistinguishable from primary text.

---

## 7. `data-transparency`, the aurora tokens, the glass tokens

| Thing | Where | Consumers | Under Pulse |
|---|---|---|---|
| `--glass-1/2/3` | `tokens.css:307-309` + three fallback blocks 876-917 | 0 direct; via `--card-bg`, `--nav-bg`, `--sheet-bg`, `--toast-bg` | die. Sheet and skeleton are opaque `s2`; nothing is translucent |
| `--glass-rim`, `-lip`, `-underside`, `-sheen`, `-sheen-angle`, `--card-saturate`, `--card-rim`, `--card-blur` | 315-356, 679-681 | `surfaceRecipe.ts:53-88`, `E12E16.tsx:151,299` | die with `Surface` |
| `Surface` / `surfaceRecipe.ts` | `src/ui/primitives` | `<Surface` 97 tags in 34 files | no Pulse equivalent except the bottom sheet |
| `--blur-*`, `--sheet-blur`, `--nav-blur`, `--toast-blur`, `backdrop-blur-*` | 200-203, 700-712 | 7 `backdrop-blur` sites in 6 files | die ("no blur") |
| `--shadow-overlay`, `-strong`, `--sheet-shadow`, `--overlay-border` | 274-287, 702 | 11 + 3 + 2 + 2 refs | die ("no shadow"); `--shadow-glow` is the one survivor |
| `--aurora`, `--noise-overlay` | 364-368, 648, 834-838, 853-857 | `AuroraBackdrop.tsx:24`; mounted 9 times in 5 files (`AppLayout.tsx:58`, `AuthPage.tsx:101`, `CoachProfilePage.tsx:71,120,313`, `MarketplacePage.tsx:102`, `PostPage.tsx:62,89,228`) | die ("no gradients"). Remove the mounts, then the component, then the tokens |
| `check-aurora.mjs` | build script, `package.json` | — | with zero mounts it prints "0 backdrop mount(s)" and passes for ever: a gate that cannot fail. Retire it from the `build` script when the component goes. Pulse has a cousin of the same defect (an ancestor that isolates a `mix-blend-lighten` image and turns its true-black edge into a visible rectangle on the `#0B0D0A` canvas) — a candidate for the gate that replaces it, owned by imagery |
| `--gradient-brand` | 655; written inline by `ThemeProvider.tsx:106` | 4 sites (`MarketplacePage.tsx:321`, `E12E16.tsx:388`, `E17E19.tsx:498`, `TokenProof.tsx:246`) | dies; `ThemeState.gradient`, `gradientCss`, `GradientBuilder.tsx` (unimported), `DEFAULT_GRADIENT` go with it. Under D1 the client sends no theme `PUT` at all, so the `.strict()` body shape (`routes.js:57-63`) is no longer its concern |
| `--tile-tint`, `--tile-tint-fg` | 373-374 | 6 + 6 refs in 5 files | die ("no icon disc") |
| `data-transparency` | `tokens.css:901-917`; `ThemeProvider.tsx:35-36, 54, 94-95, 121-123`; UI `SettingsPage.tsx:93-138` (`TransparencyChoice`); 5 i18n keys × 3 bundles (`hu.json:130-134`) | — | has nothing left to switch. The approved frame still draws the control with the hint "Az üveghatás a kártyákon és a sávokon…"; the Review Brief lists "hidden under Pulse" as assumed unless vetoed. Decided (D1): removed, with its keys in all three bundles. `prefers-reduced-transparency` needs no handling once nothing is translucent |

Dead files this area already carries: `AccentPicker.tsx` and `GradientBuilder.tsx` are unimported "on purpose" (`ThemeStudio.tsx:21-22`);
`ui/TokenProof.tsx` (259 lines) is imported by nothing and holds 32 legacy type-step class sites. The settings files' i18n keys
(`accentDefault`, `accentCustom`, `contrastRatioPass`, `contrastRatioFail`, `contrastInvalid`) survive `check-i18n` only because the
dead files still name them — delete the files and the keys together. `palette.ts:16-25` `ACCENT_PRESETS[0]` is already stale
(`#6E8CFB`, "the Midnight default"; the token is `#7C94ED`).

---

## 8. Light mode

- **Does not exist.** `grep -rnE "data-mode|prefers-color-scheme|color-scheme: light"` over `frontend/src`, `index.html`, `public`,
  `scripts`: 0 hits. `index.css:16` sets `color-scheme: dark`; `index.html:6` declares it. ADR-0015 says a light mode "is arriving
  (ADR-0017 light-mode-is-a-second-attribute)" — no such ADR exists (0017 is "a person has a name") and no `[data-mode]` was built.
  The feature inventory lists it as planned, not built.
- **Pulse cannot have one as designed.** Pulse System 2.1: "Pulse is dark-only". Lime on white is 1.17 : 1; every image is a
  true-black-edged still set to lighten, which disappears on a light surface; the Review Brief (9.1) says a light mode would need a
  second accent and a second grade of all 49 images, and does not promise it.
- Code consequence: keep `color-scheme: dark` in both places; add nothing.

---

## 9. Things that must agree, and the gates that would hold them

| Fact | Copies today | Linked by a gate? |
|---|---|---|
| The canvas colour | `tokens.css:227` (`--surface-0`), `tokens.css:252` (`--accent-fg`), `index.html:9` (`theme-color`), `public/manifest.webmanifest` (`theme_color`, `background_color`), `backend/scripts/build-icons.mjs:35`, `019_coins.sql:775` | no — and all six become `#0B0D0A`, two of them in the backend |
| The pack roster | `019_coins.sql:774-781` (source), `ThemeProvider.tsx:11-19` (7), `index.html:24` (**5 — already wrong**: an Aurora or Ember owner gets a flash of Midnight on every cold load), `[data-theme]` blocks in `tokens.css` (7), `settings.themePack.*` in three bundles (7) | no |
| The type-step list | `tokens.css`, `cn.ts` | yes (`check-type-scale`) — plus the family binding once it exists (3.2) |
| The default pack | six places (section 6, option C) | no — the client copies disappear with D1; the server ones stay until the backend package |
| Motion numbers | `tokens.css:115-137`, `useMotionSafe.ts:42`, `E10Tabs.tsx:46`, `E12E16.tsx:21-30` | no; unchanged by Pulse |

Gate work Pulse needs, cheapest first:

1. **Legacy-name rule in `check-tokens`** — a list of banned class names (`text-title-1/2/3`, `text-body-strong`, `text-body-s`,
   `text-caption`, `text-timer`, `rounded-card`, `rounded-field`, `bg-accent-subtle`, …) that prints a per-file count while screens
   are migrating and fails once the bridge is removed. Without it the last step of the migration is unverifiable.
2. **`check-type-scale` third leg** — every step whose family is not the body face appears in the family binding.
3. **Canvas agreement** — `index.html` `theme-color` and the manifest colours equal `--surface-0`.
4. **Retire `check:aurora`** from the `build` script together with `AuroraBackdrop` (the shell note proposes re-pointing its
   ancestor walk at the glow-image component instead of deleting it).
5. A roster-agreement gate (`[data-theme]` selectors == pack list == i18n keys) is **not needed under D1** — there is no roster on
   the client. It becomes item 1 of the work the day packs return.
6. Optional, the law itself: fail on `bg-surface-1`, `<Surface`, `backdrop-blur`, `shadow-` outside the primary pill.

---

## 10. Sequencing: bridge → migrate → delete

Why not delete first: 46 glass-family `var()` references in 10 areas (`ui/feedback` 14, `ui/primitives` 10, settings 6, marketplace 5,
workout 3, `ui/shell` 3, `ui/data` 2, compose 1, `ui/nav` 1, `TokenProof` 1) would turn `check-tokens` red at once, for everyone.
Why not leave it to each screen: `tokens.css`, `cn.ts`, `index.css`, `index.html`, `package.json` and the gate scripts
are single files that every screen depends on — they need one writer.

**Step 1 — foundation (one agent, lands before any screen starts).**
- Re-value in place every semantic token that keeps its name (2.2), so the running app turns Pulse-coloured without a call-site edit.
- Add the new tokens, the 16 type steps, the three families, the fonts, the family binding, the Pulse utilities (2.4).
- Keep every legacy name **declared**, collapsed to a neutral value, so no `var()` goes undeclared: `--glass-*` and `--card-bg`
  → transparent or the opaque surface; `--nav-bg` → `--surface-0` (opaque — a transparent fixed nav over scrolling content is
  unreadable until the nav is rebuilt); `--aurora`, `--gradient-brand`, `--glass-sheen` → `none`; blur tokens → `0px`;
  `--shadow-overlay*` → `none`; `--glass-lip` / `--glass-underside` → a transparent zero shadow (two `none`s in one `box-shadow` list
  are invalid). Legacy type steps stay, re-pointed at the nearest Pulse size (3.4), and stay in `TYPE_STEPS`.
- Delete the six other pack blocks and stop writing `data-theme` (D1). Leaving Solar / Neon / Mono in place would show their
  surfaces, radii and shadows over the Pulse base to anyone whose stored pack is not Midnight. The pre-paint script and
  `applyToDom` must stop in the same commit, or a stored custom accent keeps overriding lime.
- `index.html`: `theme-color`, pre-paint script removed. `manifest.webmanifest`: both colours.

This is still the hard switch D1 asks for: every value is Pulse from the first commit and no old look stays selectable. What the
bridge keeps alive is **names**, not a second design — a legacy name with a neutral value exists only so that a file nobody has
rewritten yet does not fail the build.

**Step 2 — screens, in parallel.** Each agent rewrites its own files against the new names and never edits the single-writer files.
A missing token is a request to the foundation owner, not a local `text-[…]`.

**Step 3 — cleanup (after the last screen).** Delete legacy tokens, the three glass-fallback blocks, `Surface`, `AuroraBackdrop`,
`check-aurora`, the legacy type steps (from both files), `TokenProof` (or rewrite it as the Pulse specimen page). The settings
theme files and their i18n keys already went in the foundation (T4). `check-tokens` proves the `var()` half; the legacy-name rule proves the class half; `tsc` proves imports.

The legacy `-subtle` / `-border` / `on-*` colour utilities are verified by the owned-stem rule: removing `--color-accent-subtle`
from `@theme inline` fails the build while any `bg-accent-subtle` remains (82 sites today). Good for step 3, fatal in step 1.

---

## 11. Work items for this area

T1-T6 are the blocking foundation and are best done by one agent in this order (they share four files). Sizes: S under half a day,
M about a day, L more.

| # | Item | Files | Size | Depends on | Parallel with screens |
|---|---|---|---|---|---|
| T1 | Pulse semantic, component and primitive tokens; legacy names kept declared at neutral values (the bridge); six pack blocks and three glass-fallback blocks deleted; `--accent` the single source of every lit value | `src/ui/tokens/tokens.css` | L | — | no (blocks them) |
| T2 | 16-step ramp + 7 bridged legacy steps, `TYPE_STEPS` in the same commit, family and case binding, drop the `h1-h3` display rule, `giant` handling, body base 16 | `src/ui/tokens/tokens.css`, `src/lib/cn.ts`, `src/index.css`, `scripts/check-type-scale.mjs` | M | T1 (same file) | no |
| T3 | Self-host the three families (hand-written `@font-face`, `latin` + `latin-ext`, `block` for the display face), remove Inter and Space Grotesk, preload, verify ő/ű and Big Shoulders `tnum` in the built app | `package.json`, `package-lock.json`, `src/index.css`, new `src/ui/tokens/fonts.css`, `index.html`, `vite.config.ts` | M | T2 | no |
| T4 | Remove the client theme engine (D1): provider, sync hook, picker, the two unimported builders, the transparency choice, the provider mount, the pre-paint script, their i18n keys in three bundles | `src/ui/theme/*` (3 files), `src/features/settings/{ThemeStudio,useThemeSync,AccentPicker,GradientBuilder}.tsx`, `src/features/settings/SettingsPage.tsx` (lines 24, 93-138, 298), `src/app/providers.tsx`, `index.html`, `src/i18n/{hu,en,de}.json` | M | T1 | no — the Settings screen package starts after it |
| T5 | Canvas colour in its client copies; `.screen-x` gutter 24 (16 below 376 px) keeping both safe-area `max()` blocks | `index.html`, `public/manifest.webmanifest`, `src/index.css` | S | T1 | no |
| T6 | Gate rules: legacy-name report (non-failing during migration), type-scale third leg for the family binding, canvas agreement | `scripts/check-tokens.mjs`, `scripts/check-type-scale.mjs`, `package.json` | M | T1, T2 | yes (scripts only; no screen agent edits `scripts/`) |
| T7 | Token and type specimen page for eyeballing the foundation in a browser (rewrite the unimported `TokenProof`, or delete it) | `src/ui/TokenProof.tsx` | S | T1-T3 | yes |
| T8 | Coin store must not sell a pack that cannot be worn: hide `theme.*` SKUs on the client until the backend package lands, or schedule that package first | `src/features/coins/CoinsPage.tsx`, `src/i18n/{hu,en,de}.json` | S | owner answer (question 1) | belongs to the Coins screen package |
| T9 | Cleanup after the last screen: delete the bridged legacy tokens and type steps (both files), aurora and gradient tokens, `-subtle` / `-border` / `on-*` forms with no consumer left, switch the legacy-name rule to failing, retire or re-point `check:aurora` | `src/ui/tokens/tokens.css`, `src/lib/cn.ts`, `src/index.css`, `package.json`, `scripts/check-aurora.mjs`, `scripts/check-tokens.mjs` | M | every screen package, the primitives retirement (`Surface`, `AuroraBackdrop`) | no |
| T10 | Docs: rewrite `frontend/DESIGN.md` (678 lines, describes glass and "33 colour names"); strip the numbers from `Pulse System.md` once `tokens.css` holds them (its own header asks for this); record D1 as an ADR | `frontend/DESIGN.md`, `docs/brain/58-Pulse/Pulse System.md`, `docs/brain/60-Decisions/` | M | T1, T2 | yes |
| T11 | Backend package, **not this phase**: delist the two pack items, compensate owners (ledger write under the transaction-endpoint rules), retire `/me/theme`, icon background `#0B0D0A` | new numbered migration in `backend/src/db/migrations/`, `backend/src/theme/routes.js`, `backend/src/coins/routes.js`, `backend/scripts/build-icons.mjs` | L | owner answer (question 1) | separate track |

## 12. Questions only the owner can answer

Answered by D1 and no longer open: what a pack is (nothing, for now), the "Áttetsző felületek" control (removed with
`data-transparency`), stored custom accents and gradients (not applied — one look), the Mono lamp and Aurora's gradient copy (no
packs ship).

1. **The coin store between now and the backend package.** It still sells Aurora and Ember for 250 coins each and the purchase
   works; after the redesign the pack does nothing. Hide the two items on the client now, or do the backend package before the
   Coins screen ships?
2. **Geist Mono.** Pulse System keeps it and lists it among the open owner decisions; the Review Brief drops it for tabular Geist.
   Three families (as drawn in all 59 frames) or two? It is one import and one token either way, but 3 of the 16 steps depend on it.
3. **`accentDown`.** The drawn pressed lime is `#B4E61F`; a derivation that follows a future pack gives `#B3E127` (1-8/255 per
   channel). Derived (keeps "one place to override the accent") or the literal?
4. **"Megjelenés" in Profil.** With packs and translucency gone the section drawn in the approved frame is empty. Dropping it changes
   an approved frame — confirm.
