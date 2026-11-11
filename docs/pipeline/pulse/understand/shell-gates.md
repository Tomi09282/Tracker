# Pulse — app shell, navigation and the gates

Area: `frontend/src/app/*`, `frontend/src/ui/nav/*`, `frontend/src/ui/shell/*`, the toast host, every
script in `frontend/scripts`, and the `build` chain in `frontend/package.json`.
Read-only pass, 2026-10-11, branch `pulse-redesign` at `2829c3a` (no source file differs from that
commit; only `docs/` has modified or untracked files).
Everything below was read from the files named; counts come from grep, from running the gates, or
from read-only replicas of a gate's own collection logic kept outside the repo.

Owner decisions recorded while this pass ran. `docs/pipeline/pulse/understand/00-owner-decisions.md`
(dated 2026-10-11) appeared in this folder during the pass. It is quoted here as a source, and
where it settles something below the section says so:

- D1 — Pulse is the only look; the seven theme packs, the aurora skins, the glass tokens and
  `data-transparency` are removed. New packs come later, so one place where a pack could override
  the accent should stay cheap to add. Element variants were not ruled on; the note's default is
  "Pulse becomes the one variant of each element; the gate that freezes the roster keeps its intent".
- D2 — with no session running, the `Edzés` tab shows the muscle selector / exercise library; Home
  also carries a row that opens the library; no new tab.
- D3 — finish-workout is not built in the screen phase and must not be faked; it is its own package
  at the end.
- D4 — local commits on `pulse-redesign`, no push.

Contents

1. Baseline: what the build runs today, and what it prints
2. How the shell works today
3. What Pulse specifies for the shell (measured from the kit)
4. The gates, one by one
5. The specific questions
6. The two owner decisions, and where they land in code
7. What breaks or contradicts Pulse
8. Hard constraints for implementers
9. Work items
10. Owner questions
11. Limits of this pass

---

## 1. Baseline

`frontend/package.json:9` — the `build` script, in this order:

```
check:tokens → check:i18n → check:nav → check:nav-active → check:interval → check:elements
→ check:autosave → check:type-scale → check:aurora → check:safe-area → verify:outbox → tsc -b → vite build
```

Eleven gates, then the compiler, then the bundler. All eleven were run individually (they only read)
and all are green on the untouched branch:

| Gate (script) | Lines | Baseline output |
|---|---|---|
| `check-tokens.mjs` | 376 | `OK — no raw values outside the token layer` |
| `check-i18n.mjs` | 456 | `OK — 3 language(s) (hu, en, de), 876 keys each` |
| `check-nav.mjs` | 200 | `26 routes, 7 distinct tab targets, 10 exempt … (user 5 · coach 6 · admin 7)` |
| `check-nav-active.mjs` | 128 | `OK — 64 assertions, every route lights exactly one tab` |
| `check-interval.mjs` | 315 | `OK — 50 schedule assertions` |
| `check-element-roster.mjs` | 204 | `27 in the catalogue — 24 with live consumers, 20 previewable, 3 declared dormant` |
| `verify-autosave.mjs` | 268 | `21 passed, 0 failed` |
| `check-type-scale.mjs` | 86 | `OK — 10 step(s), declared and merged alike` |
| `check-aurora.mjs` | 121 | `9 backdrop mount(s), no ancestor paints over any of them` |
| `check-safe-area.mjs` | 173 | `viewport-fit cover, 8 file(s) use an inset, 2 exemption(s)` |
| `verify-outbox.mjs` | 188 | `outbox: 31 passed, 0 failed` |

Not in the chain: `verify-nav-gate.mjs` (`npm run verify:nav-gate`), the mutation probe that proves
`check-nav` fails on the defects it guards. It was NOT run (it writes source files and restores
them), but its six anchors were checked statically against the current source:

| Probe case | Anchor still in the file? |
|---|---|
| a screen with no inbound link | yes (`SettingsPage.tsx`) |
| the clamp coming back | yes (`BottomNav.tsx:79`) |
| a tab count that drifts | yes (`navTabs.ts:146`) |
| a tab pointing at a missing route | **NO** — the anchor expects `{ to: '/settings', icon: User, labelKey: 'nav.profile' },` and the line now ends `, owns: ['/coins'] },` (`navTabs.ts:128`) |
| a label key missing from a bundle | yes |
| dropping the horizontal safe area | yes (`BottomNav.tsx:90`) |

So the only existing "is the gate load-bearing" probe is already red on one case and nothing reports
it, because it is not wired into anything. Five of its six anchors sit in `navTabs.ts` and
`BottomNav.tsx` — the two files Pulse rewrites — so after the Pulse bar lands all of them go stale.
Only `check-nav` has a probe at all; the other ten gates have none in the frontend.

There is no test framework (`package.json` has no vitest / jest), `oxlint` is installed and no script
calls it.

---

## 2. How the shell works today

### 2.1 The tree

```
main.tsx:13-19        <Providers><RouterProvider router/></Providers>
providers.tsx:31-59   QueryClientProvider > ThemeProvider > ElementStyleProvider >
                        LoadingAnnouncer, ToastHost > [ OfflineIndicator, {routes} ]
router.tsx:83-144     /login, /register                     — AuthPage, no layout
                      /m, /m/p/:publicId, /m/c/:handle      — public, no layout, no auth
                      /  → RequireAuth > AppLayout > 21 child routes
                      *  → Navigate to /
AppLayout.tsx:53-67   <div class="min-h-dvh"> AuroraBackdrop, CommandPalette,
                        <main class="pb-[var(--content-pad-b)] lg:pb-[var(--content-pad-b-lg)]"><Outlet/></main>,
                        BottomNav
```

- `RequireAuth.tsx:15-22` — three states: pending → `ScreenSkeleton`, no user → `/login`, else children.
  A UX guard only; says so itself (`:12-13`).
- The public routes sit outside `AppLayout` on purpose (`router.tsx:87-100`): no bottom bar, no
  shared chrome. Each public page therefore brings its own shell pieces — which is how the aurora
  ended up mounted nine times (§5.2) and why `OfflineIndicator` had to be hoisted into `Providers`
  (`providers.tsx:42-55`).
- There is no layout route for the public screens and no shared page scaffold: every page writes its
  own outer `<div className="col-mobile screen-x flex flex-col gap-section py-6">` (or `col-wide`,
  or `py-4`).

### 2.2 Navigation data

`app/navTabs.ts` (168 lines) is the pure table the gates read:

- `NavTabSpec` (`:36-58`): `to`, `icon: LucideIcon`, `labelKey`, `end?`, `owns?`.
- `NAV_TABS` (`:119-149`): user 5, coach 6, admin 7. Order Home · Edzés · Étkezés · Haladás ·
  [Edző] · [Admin] · Profil. Label keys: `nav.home`, `nav.workout`, `nav.nutritionShort`,
  `nav.progress`, `nav.coach`, `nav.admin`, `nav.profile`.
- `owns` today: Home `['/onboarding']`, Edzés `['/library']`, Edző `['/compose', '/m']`,
  Profil `['/coins']`.
- `isTabActive(tab, pathname)` (`:105-117`): boundary-aware prefix match plus `owns`.
- `PILL_MAX_TABS = 5` (`:160`): up to five tabs the bar is a floating pill, above that a slab.
- `tabsForRole(role)` (`:163-167`).
- Its only imports are `lucide-react` (`:23-24`). That matters: `check-nav-active.mjs:27` imports
  this file straight into Node 24 (type stripping, no bundler).

`ui/nav/BottomNav.tsx` (202 lines) renders it:

- `fixed bottom-0 z-[var(--z-nav)]`, `bg-[var(--nav-bg)] backdrop-blur-[var(--nav-blur)]` (`:85-86`).
- Two shapes picked by count (`:79`, `:91-107`): pill (`rounded-chip border`, inset by
  `--nav-dock-offset`, `max-w-md`) or slab (`inset-x-0 border-t`).
- Cells `min-w-0 flex-1` (`:129`), link `h-[var(--nav-h)] min-w-[var(--target-min)]` (`:138`).
- `Link` + `aria-current={active ? 'page' : undefined}` from `isTabActive` (`:130-134`) — a plain
  `Link`, not `NavLink`, so the colour and the attribute come from one expression.
- Active marker by element variant E11 (`useElementVariant('E11')`, `:50`): A accent pill behind the
  icon, B dot, C thicker stroke (`:155-170`). Badge support (`:174-184`) — `AppLayout` never passes a
  badge; the only caller that does is the playground's E11 demo.
- Second consumer: `features/playground/PlaygroundPage.tsx:264-269` renders `<BottomNav>` with two
  lucide icons and a badge. It must keep compiling when the icon type changes.
- Icon 24 px lucide (`:167-173`); label `text-micro … uppercase` via CSS transform (`:194`).
- Horizontal safe area with `max()` (`:90`, `:94`).

`ui/shell/CommandPalette.tsx` — Cmd/Ctrl+K, desktop only (`hidden lg:flex`, `:151`), a centred dialog
with `rounded-card border … shadow-[var(--shadow-overlay)]` and a raw `bg-black/50` scrim. It lists
16 destinations by `nav.*` keys (`:71-97`). It is the only in-app link to `/playground`.

### 2.3 Shell tokens (`ui/tokens/tokens.css`)

| Token | Line | Value | Read by |
|---|---|---|---|
| `--target-min` | 141 | `44px` | everywhere |
| `--nav-h` | 145 | `64px` | `BottomNav:138`, `RestTimer:91,121`, `E14E20:559,566` (FAB) |
| `--content-pad-b` | 154 | `calc(var(--nav-h) + env(safe-area-inset-bottom) + 16px)` | `AppLayout:62`, `WorkoutPlayer:39,260`, `ToastHost:149` |
| `--offline-h` | 169 | `0px` (overwritten at runtime) | `--viewport-h` only |
| `--viewport-h` | 170 | `calc(100dvh - var(--offline-h))` | `WorkoutPlayer:39,260` only |
| `--content-pad-b-lg` | 171 | `calc(var(--nav-h) + 32px)` | `AppLayout:62`, `WorkoutPlayer:39,260` |
| `--nav-dock-offset` | 172 | `16px` | `BottomNav:94-95` |
| `--z-sticky / nav / sheet / toast / tooltip` | 208-212 | 20 / 40 / 50 / 60 / 70 | 1 / 3 / 5 / 3 / 1 call sites |
| `--surface-0` | 227 | `#0B0D10` (default pack) | `body` (`index.css:21`) |
| `--aurora` | 364, 834, 853 | three declarations (default, `aurora`, `ember`) | `AuroraBackdrop:24` only |
| `--nav-bg / --nav-blur / --nav-fg-active / --nav-fg-idle` | 706-709 | glass-2 / blur-lg / accent / text-3 | `BottomNav`, `OfflineIndicator:192`, `surfaceRecipe.ts:41` |

Off-ladder z-index literals that exist anyway: `z-30` three times in `RestTimer.tsx:62,90,120`, and
`-z-10` on the backdrop.

"Above the nav" is computed by hand in five places, with three different expressions and two
different gaps (12 px and 16 px): `RestTimer.tsx:91,121` (`--nav-h + inset + 0.75rem`),
`E14E20.tsx:559,566` (`--nav-h + inset + 16px`), `ToastHost.tsx:149` (`--content-pad-b`).

### 2.4 Offline strip and toast

`ui/shell/OfflineIndicator.tsx` (216 lines) is two things in one component:

1. The outbox drain loop: `/healthz` probe with a JSON-body check (`:66-83`), `online` /
   `offline` / `visibilitychange` listeners (`:92-97`), `flushOutbox` then invalidation of
   `['workout','current']` and `['records']` (`:46-61`).
2. The strip: `sticky top-0 z-[var(--z-toast)]`, a `0fr → 1fr` grid so it animates open and takes
   real space (`:164-166`); nav glass + blur, a 4 px accent rail on the leading edge, a lucide cloud
   glyph, one or two lines (`offline.title`, `offline.queued`) (`:169-211`); pads
   `env(safe-area-inset-top) + 12px`.
3. It measures itself with a `ResizeObserver` and publishes `--offline-h` on `<html>` (`:120-135`).

`ui/feedback/ToastHost.tsx` (183 lines): context API `toast(message, kind?, options?)`, max three
live toasts (`:105`), two `fixed` stacks — bottom (default, padded by `--content-pad-b`, `:149`) and
top (padded by the top inset, `:150`). The `Toast` itself is `variants/E12E16.tsx:478-…`: a
`rounded-card` bordered glass capsule with an icon chip, a 4 s timer hairline, Undo and dismiss.
12 `toast(` call sites in 6 files; exactly one asks for `placement: 'top'`
(`WorkoutPlayer.tsx:296`, the record toast).

### 2.5 Safe areas

`index.html:5` sets `viewport-fit=cover`. Files that mention an inset: 8
(`RestTimer`, `index.css`, `ToastHost`, `E14E20`, `E8E9`, `BottomNav`, `OfflineIndicator`,
`tokens.css`). `.screen-x` (`index.css:101-108`) is the horizontal gutter: 16 px, 24 px from 48 rem,
each `max()`-ed with the left / right inset. `.safe-top` / `.safe-bottom` exist (`index.css:81-82`).
No page pads its own top by the top inset: pages start at `py-6` / `py-4`. The only top-inset users
are the offline strip, the top toast stack and RestTimer variant C.

### 2.6 Screen headers

There is no shared screen header. Measured:

- `<h1` appears in 25 files (24 pages + `TokenProof`).
- 12 page files draw a back control by hand, with two glyphs (`ArrowLeft` in 9 files, `ChevronLeft`
  in 4), three icon sizes (`size-icon-s / -m / -l`), four control styles (bare link, `ghost` icon
  button, `secondary` icon button, one bordered circle in `ChatPage.tsx:55-60`) and four
  mechanisms: `<Link to={parent}>` (ExerciseDetail, ClientDetail, Chat, PlanEditor, PostEditor,
  ProfileEditor), `history.back()` (`SettingsPage.tsx:175`, `CoinsPage.tsx:100`), `navigate(-1)`
  (`NotificationsPage.tsx:291`, `PublicChrome.tsx:138`), `navigate('/login')` (`AuthPage.tsx:113`).
- Three title placements: centred h1 with a 44 px balancing spacer (Coins, Notifications, Settings),
  left h1 under a back link, identity-anchored (ClientDetail, ProfileEditor).
- The one shared piece is `features/marketplace/PublicChrome.tsx:113-153` (`PublicTopBar`), for the
  three public marketplace screens only.
- `ui/data/SectionHeader.tsx` is a SECTION heading (a 44 px tinted icon tile + `h2`), used in 10
  files. Its tile is exactly the "icon disc" Pulse forbids.

---

## 3. What Pulse specifies for the shell

Source: `docs/brain/58-Pulse/Pulse System.md` §2-§4 and `figma-build/app-kit.src.js`
(`scaffold` :147, `screenHead` :153, `tabBar` :163, `chrome` :177, `dockAction` :189,
`noticeLine` :313, `showToast` :315, `bottomSheet` :317). Frame 402 × 874, top inset 62, bottom
inset 34.

| Piece | Kit numbers | Reading for code |
|---|---|---|
| Canvas | `bg #0B0D0A`, no gradient, no blur, no shadow | `body` background only; no backdrop element |
| Tab bar | 56 high at `height − 92` → y 782-838; no surface, no border, no capsule | bar bottom edge is 36 above the screen bottom = bottom inset + 2 |
| Tab cells | equal cells on `402 − 2 × inset`; inset 10 (5 tabs) / 12 (6) / 8 (7) → 76.4 / 63.0 / 55.1 pt | whole cell × 56 is the target |
| Tab icon | raster, 32 pt (28 pt at 7 tabs), 2 pt gap, label under it | 14 PNGs: `tab2-{home,training,nutrition,progress,coach,admin,profile}` + `-active` |
| Tab label | `tab` Geist Medium 11/14 `t2`; active `tabOn` SemiBold `t1` | sentence case, NOT uppercase; active = lit icon + ink label |
| Tab states | pressed: icon 60 %; no badges on tabs | the current badge branch goes |
| Bottom fade | 130 pt tall from the bottom, canvas colour 0 → 100 % over the first 28 %, solid below | sits under the bar, above content |
| Docked action, with tabs | action bottom is 104 above the screen bottom (12 above the bar); own fade `h + 64` tall starting 48 above it, solid from 50 % | coach chat composer, onboarding footer |
| Docked action, no tabs | 50 above the bottom (inset + 16) | login, register |
| Root header | content top 72 (inset + 10); `greet` (title 22 + sub line) or `root` (one `display` line) + ONE trailing icon button; 48 high | Home, coach dashboard / Gyakorlatok, Táplálkozás, Haladás |
| Pushed header | content top 64 (inset + 2); back row 44 (chevron 24 + parent as `eyebrow`), 4 gap, `display` title; optional trailing node in the back row | 23 of the 58 frames call `screenHead('push', …)` (6 use `greet`, 8 use `root`) |
| Category header | same grid as pushed, eyebrow WITHOUT chevron | coach plans (`Tervezés`), admin (`Adminisztráció` + trailing link), style studio (`Megjelenés`) |
| Toast | the page's own black, full width, padding 68 / 24 / 7 / 24, one `noticeLine` (44 min), a strong rule → covers y 0-120; 6 pt semantic dot (or a glyph) + `capM` line + optional trailing link / ✕; drops in `base`, stays 4 s, leaves in `fast` | no capsule, no icon chip, no rail, no timer hairline |
| Offline | `noticeLine('Nincs internetkapcsolat · 3 művelet vár feltöltésre', 'warn')` — amber 6 pt dot, one line, "in flow" | drawn only on the component board, in no screen frame |
| Bottom sheet | the one surface: `s2`, top radius 28, hairline edge, 60 % scrim | confirmations and pickers; no centred dialogs |
| Gutter | 24 (16 below 376 pt wide); supported widths 360-430 | `.screen-x` values change |

Which tab each frame lights (from the `chrome(root, key, role)` calls in the 58 frame scripts):
`home` — Home ×3, onboarding ×3 · `training` — player ×3, library ×3, exercise detail ×2 ·
`nutrition` ×2 · `progress` ×3 · `profile` — settings ×2, coins ×3 · `coach` — dashboard, client
detail, chat, plans, plan editor, compose hub, post editor, profile editor (19 frames) · `admin` —
admin ×3, style studio ×2 · `null` (no bar) — auth ×2, marketplace ×2, post ×2, coach profile ×2 ·
**`'none'` — notifications ×2: a bar with no lit tab.**

---

## 4. The gates, one by one

For each: what it asserts, why it exists, whether Pulse breaks it, how to keep its intent.
"Probe" = the mutation that must be shown to turn the gate red, in the idiom of
`verify-nav-gate.mjs` (plant the defect, run the gate, restore the file byte for byte).

### 4.1 `check-tokens.mjs`

- Asserts. Ten line rules outside `tokens.css`: raw hex, raw `rgb()/hsl()`, Tailwind's stock palette,
  raw duration, raw duration inside `animate-[…]`, raw radius, raw `cubic-bezier`, off-grid spacing
  in arbitrary values, `<button|a>` under the 44 px floor, raw `<button>` outside `src/ui`
  (`:23-90`). Plus four reference rules: every `var(--x)` is declared in `tokens.css` or assigned in
  the same file (`:291-301`); built-in `animate-pulse/spin/…` only if `index.css` pins its duration
  (`:306-317`); `size-icon-*`, `col-*`, `screen-x` must be defined in `index.css` (`:335-345`); a
  colour utility whose first segment is one of this project's stems must resolve to a `--color-*`
  (`:348-361`).
- Why. ADR-0006: raw values drifted from the design one component at a time. The reference rules:
  `max-w-[var(--measure-form)]` and `size-icon-s` both resolved to nothing with a green build.
- Pulse breaks it? No. Its intent ("only the token file carries a value; a name that resolves to
  nothing is a build failure") is exactly what a re-skin needs.
- What it does to the migration. It turns token removal into a build-wide tripwire: removing
  `--aurora`, `--nav-bg`, `--nav-blur`, `--nav-dock-offset`, `--glass-*`, `--tile-tint` or any
  `--color-*` mapping while one consumer remains fails every agent's build with
  `undeclared-token` / `undefined-color`. Current reach of the names Pulse retires (all files under
  `src`): `<Surface` 97 hits / 34 files · `rounded-card` 113 / 46 · `rounded-chip` 192 / 57 ·
  `bg-surface-2` 78 / 42 · `bg-accent-subtle` 83 / 41 · `border-[var(--surface-border)]` 60 / 34 ·
  `backdrop-blur` 9 / 7 · `tile-tint` 22 / 7.
- Keep its intent. Tokens are added first and removed last. No rule is relaxed. `.screen-x` must stay
  defined in `index.css` (re-valued to 24 / 16) or every page fails `undefined-utility`.
- What it cannot see, and Pulse needs. The Pulse law is structural ("no boxes"), not a value: a
  card rebuilt from legal tokens (`bg-surface-2 rounded-… border …`) passes this gate. That is a new
  gate (§4.12), not a change to this one.
- Probe. None exists. Minimum: plant `#CBFF2E` in a component → `raw-hex`; plant
  `var(--nav-fade-h)` before declaring it → `undeclared-token`.

### 4.2 `check-i18n.mjs`

- Asserts. Registry ↔ bundle files; key parity against `hu` in both directions; identical
  placeholders; a bundle that is a copy of another; any key equal in `hu` and another language unless
  listed in `UNTRANSLATED_BY_DESIGN` (16 entries, with a stale-entry check, `:131-182`); keys no code
  references (`:196-240`, with the `public.specialty.` server prefix exempt); keys the code references
  that no bundle has, directly (`t('…')`) and through lookup tables (`:262-400`); literal
  `aria-label`, `sr-only` text, `placeholder`, `title` (`:416-445`).
- Why. A missing key renders the key path; a dead key claims a feature exists; an announced literal
  is invisible to visual review.
- Pulse breaks it? Not by design, but it constrains how the work is split:
  1. A key cannot land before its consumer (dead-key rule) and a consumer cannot land before its key
     (missing-key rule). Copy and screen ship in one commit; copy cannot be pre-seeded.
  2. Every Pulse rewrite that drops an element leaves dead keys that fail the build until they are
     deleted from all three bundles (for the shell: `workout.noneTitle` / `workout.noneBody` if the
     idle player goes, see §6.1).
  3. `hu.json`, `en.json`, `de.json` are three shared files every screen agent must edit. They are
     the merge hot spot of a parallel run. Keys are grouped by feature namespace, so conflicts stay
     local if each agent edits only its own namespace; `nav`, `common`, `offline`, `palette` belong
     to the shell agent alone.
  4. A new Hungarian string that is identical in English or German needs an
     `UNTRANSLATED_BY_DESIGN` entry with a reason.
- Shell copy needs. None new for the tab bar or headers: all seven tab labels and every parent /
  category label the frames draw already have keys (`nav.home/workout/nutritionShort/progress/coach/
  admin/profile`, `common.back`, `nav.library`, `coaching.title`, `plans.title`, `compose.backToDesk`,
  `plans.eyebrow`, `admin.eyebrow`, `studio.eyebrow`, `coaching.eyebrow`). The Pulse offline line is
  `offline.title` + ` · ` + `offline.queued` — two existing keys.
- Keep its intent. Unchanged. One rule to respect in the new header and tab components: display-face
  UPPERCASE is a CSS transform, never an uppercase string (the reason is in `BottomNav.tsx:186-193`:
  the same string is the accessible name).
- Probe. None exists. Minimum: delete one `nav.*` key from `de.json` → "missing 1 key(s)".

### 4.3 `check-nav.mjs`

- Asserts (six things): (1) `navTabs.ts` declares `user` / `coach` / `admin` lists with 5 / 6 / 7
  entries, counted by regex over the source text (`:57-74`); (2) every tab `to` is a router path
  (`:78-90`); (3) every `labelKey` resolves in hu / en / de (`:94-102`); (4) `BottomNav.tsx` contains
  no `.slice(0, N)` (`:106-113`); (5) `BottomNav.tsx` mentions `safe-area-inset-left` and `-right`
  (`:117-126`); (6) every route has a door — some `to="…"`, ``to={`…`}`` or `navigate('…')` outside
  `router.tsx` — unless listed in `NO_INBOUND_BY_DESIGN` (10 entries) (`:130-185`).
- Why. Six finished features (`/progress`, `/coins`, `/compose`, `/compose/profile`, `/m`,
  `/playground`) had no way in on a phone; a clamp once swallowed the admin tab silently.
- Pulse breaks it?
  - (1) No: Pulse keeps 5 / 6 / 7. But the count is read by a regex that needs the literal shape
    `role: [ … \n ]` with `{ to:` per entry. Building the lists by composition
    (`[...BASE, COACH]`) breaks the gate.
  - (2) (3) (4) No.
  - (5) The Pulse bar is still edge-to-edge, so the intent holds. The check itself is weak: it reads
    the raw file, comments included, so a comment containing the string satisfies it.
  - (6) Yes, indirectly. The door rule counts a child's back-link as a door to its parent. Measured
    by replicating the gate's collection:
    - `/compose` has 5 "doors", all of them back-links inside its own children
      (`PostEditorPage.tsx:214,295`, `ProfileEditorPage.tsx:277,278,294`). Nothing else links to it.
      `Product gaps.md:61` confirms a coach cannot reach it on a phone. The gate is green.
    - `/m` has 2, both back-links from its children (`CoachProfilePage.tsx:80`, `PostPage.tsx:71`).
    - `/library` has 3: one real door (`HomePage.tsx:225`, shown only in the empty state) and two
      back-links (`ExerciseDetailPage.tsx:81,108`). So `navTabs.ts:80-81` ("`check-nav.mjs` asserts
      both links exist. If you remove one, the build fails") is not true: remove Home's door and the
      build stays green.
    - A shared Pulse header changes how back-links are spelled. If it takes `backTo="/compose"`, the
      regex `\bto=` no longer matches (capital T) and `/compose` and `/m` turn red the day the header
      lands. That would be the gate finally telling the truth, but it will look like the header broke
      the build.
- Keep its intent.
  - Keep assertions 1-4 as they are; keep the literal list shape in `navTabs.ts`.
  - (5): strip comments before the `includes` test (the same two-line strip
    `check-safe-area.mjs:101` uses).
  - (6): a door is a link from OUTSIDE the route's own subtree. Map route → page file from the
    `lazy(() => import('…'))` lines in `router.tsx`, and ignore a link to route R found in the page
    file of any route under `R/`. This must not be switched on until `/compose` and `/m` have a real
    door or a written exemption (owner question 4), because it is red on today's code.
  - New (7): every tab's icon key has both raster files and a map entry (§5.1).
  - Rewrite `verify-nav-gate.mjs` anchors after the Pulse bar lands (five of six go stale; one
    already is).
- Probes (extend `verify-nav-gate.mjs`): existing six, re-anchored; plus: remove the
  `CoachDashboard.tsx:229` link → "/coach/plans is a route nobody links to" although
  `PlanEditorPage.tsx:332` still links back; rename one tab icon file → "tab icon … has no active
  asset"; move the safe-area classes into a comment → "never mentions safe-area-inset".

### 4.4 `check-nav-active.mjs`

- Asserts. Imports `NAV_TABS`, `isTabActive`, `tabsForRole` from `src/app/navTabs.ts` and runs a
  hand-written table of 21 `[role, pathname, owner]` rows: exactly one tab lit, and it is the named
  one (`:51-85`); each tab's own route is lit only by itself (`:94-103`); four near-miss paths light
  nothing (`:111-119`). 64 assertions.
- Why. `/library/:id` and `/onboarding` rendered a bar with nothing lit; an OR-ed `NavLink` showed a
  lit tab while announcing no current page.
- Pulse breaks it? One direct contradiction and one silent gap:
  - The notifications frames draw the bar with NO lit tab (`chrome(root, 'none', 'member')`,
    `notifications-1.body.js:41`, `-2:25`) while their header names a parent (`Kezdőlap`). Pulse's
    own rule says a pushed screen keeps "the owning tab lit" (`Pulse System.md` §3). The gate's intent
    says every screen lights exactly one.
  - The table is hand-written and incomplete. Computed with the real function: `/notifications` and
    `/playground` light nothing for every role today, and neither is in the table, so the gate has
    been green over two dark screens. A new route added during the Pulse work is equally invisible.
- Keep its intent.
  - Keep the table hand-written (it is deliberately a second opinion, `:44-50`), and add a
    completeness assertion: every child path of the authenticated layout in `router.tsx` must appear
    in the table for each role that has a door to it, or in a named `NO_TAB_BY_DESIGN` map with a
    reason. Deriving the LIST of paths from the router is not deriving the ANSWER.
  - Decide `/notifications` (owner question 2). Recommended: Home owns it (the bell is in Home's
    header, `HomePage.tsx:73`; the frame's parent eyebrow already says `Kezdőlap`). The bell is also
    mounted on the coach dashboard (`CoachDashboard.tsx:236`); one owner per route keeps the rule
    simple, and a coach who came from the dashboard then sees Home lit.
  - New consistency assertion once routes declare a parent for the pushed header (§5.3): the tab that
    owns a pushed route must be the tab that owns its parent. Header and bar then cannot disagree.
- Probe. None exists today. Plant: delete `owns: ['/library']` from the user list → "user on
  /library lights exactly one tab (lit 0: nothing)"; add a route to `router.tsx` without a table row
  → the completeness failure.
- What it still cannot check. That the bar renders what the function returns, and that
  `aria-current` follows (stated in the gate, `:22-24`). The Pulse bar must keep one expression
  feeding both the lit icon and `aria-current`.

### 4.5 `check-interval.mjs`

- Asserts. 50 assertions over `features/workout/intervalPlan.ts` (schedule building, resume, holes,
  EMOM, not-runnable, ragged members, `segmentAt` boundaries, voided rounds) and
  `ui/feedback/chartGeometry.ts` (time-true x positions, flat series, zero span, y direction).
- Why. Timer arithmetic drift; a chart that drew a two-month break as one step.
- Pulse breaks it? No. Pure logic.
- Constraint it places on Pulse. Both files are imported into Node directly. They must stay pure
  TypeScript with erasable syntax: no JSX, no asset or CSS import, no extension-less relative
  runtime import (a type-only import is erased and is fine — `intervalPlan.ts:1` has one).
  The Pulse chart (`sparkline`: 1.5 px line, 3 pt end dot, dotted gaps) must keep using
  `chartGeometry.plot()` for positions; a second position function is the defect this half guards.
- Probe. None; not needed for Pulse.

### 4.6 `check-element-roster.mjs` (`check:elements`)

- Asserts. The four frontend copies of the element roster agree: the provider derives its fallback
  from `CATALOG` (`:96-113`); the playground's `PREVIEWABLE` equals its demo switch (`:116-132`);
  `catalog.live` equals the measured set of `useElementVariant('E..')` call sites, both directions
  (`:147-165`); every catalogued element nothing reads is listed in `DORMANT` with a reason, and no
  `DORMANT` entry has a consumer (`:168-185`).
- Why. E27 could not be set; four shipped elements were listed as pending; the studio offered a
  switch that changed nothing.
- Pulse breaks it? Yes, the moment a Pulse component stops reading its variant. In the shell:
  `BottomNav.tsx:50` reads E11, `E12E16.tsx:479` (Toast) reads E15, `RestTimer.tsx:41` reads E22.
  The Pulse bar has one look; E11's variants are "Active-pill, Bounce-dot, Icon-morph, Badge-bubble,
  Center-FAB" (`catalog.ts:126`), written for the capsule bar (`Product gaps.md:253`). Removing the
  call without touching the catalogue fails twice ("marks E11 live, and no component calls
  useElementVariant", then "exist in the catalogue and NO component reads them").
- Keep its intent. The gate already has the honest path: set `live: false` on E11 in `catalog.ts`
  and add E11 to `DORMANT` with the reason, in the same commit as the bar. The style studio then
  labels it inert instead of offering a switch that does nothing. Same decision for E15 (toast) and
  E12 (card — Pulse has none). Owner note D1's default ("Pulse becomes the one variant of each
  element") is this path applied to every element: each component that stops reading its variant
  moves to `live: false` + `DORMANT` in the commit that changes it. The gate needs no rule change;
  only its `DORMANT` map and the catalogue move. Whether the studio then keeps showing 27 inert
  elements is question 7.
- Probe. None exists. Plant: remove the `useElementVariant('E11')` call only → the two messages
  above.

### 4.7 `verify-autosave.mjs` (`check:autosave`)

- Asserts. Eight literal lines of `features/compose/useAutosave.ts` still exist (`:52-64`), then 13
  behavioural checks on a transcription of the hook (single flight, one coalesced follow-up, newest
  payload, adopt, untouched document saves nothing, failure reported).
- Why. RACE-7: a second trigger during a save.
- Pulse breaks it? Only if somebody reformats or refactors `useAutosave.ts` while restyling the post
  editor. The eight mirrored lines are matched as exact strings including indentation.
- Keep its intent. Treat `useAutosave.ts` as out of scope for the visual work.
- Probe. Built in (the CONTROL case, `:235-247`).

### 4.8 `check-type-scale.mjs`

- Asserts. The set of `--text-<name>` steps in `tokens.css` whose value is a plain length equals
  `TYPE_STEPS` in `lib/cn.ts`, both directions (`:42-60`). Today 10 steps.
- Why. ADR-0019: `tailwind-merge` filed custom type steps under text-colour and dropped them; 41
  call sites rendered at the inherited size.
- Pulse breaks it? Yes, in a specific way. Pulse replaces the ramp (16 roles, 7 sizes) and one role
  is not a plain length: `giant = min(124px, 31vw)` (`Pulse System.md` §3 "Widths"). The gate only
  counts values matching `^[\d.]+(rem|px|em)$` (`:48`). So `--text-giant: min(124px, 31vw)` is not
  counted as declared. Then either `giant` is listed in `cn.ts` and the gate fails with a misleading
  "no --text-giant exists … stale or a typo", or it is left out and the gate is green while
  `cn('text-giant', 'text-text-1')` silently drops the size — the original defect, on the one numeral
  each screen is built around.
- Keep its intent. Widen the value test to any size expression (`min(` / `max(` / `clamp(` /
  `calc(` as well as a length), still excluding the ink tokens and the `--text-x--modifier` lines.
  Every Pulse step the token work adds must be added to `TYPE_STEPS` in the same commit.
- Probe. None exists. Plant: add `--text-giant: min(124px, 31vw);` to `tokens.css` without touching
  `cn.ts` → must fail with "declared … but not listed".

### 4.9 `check-aurora.mjs`

See §5.2 for the full answer. Short form: its subject disappears (Pulse has no backdrop); a gate
whose subject has gone passes forever (`0 backdrop mount(s)`), which is the failure
`check-i18n.mjs:64-73` records about `NATIVE_LABELS`. Its intent — a silent, source-invisible
compositing fault that deletes the visual foundation — moves to the images that glow out of black.

### 4.10 `check-safe-area.mjs`

- Asserts. (1) `index.html` has `viewport-fit=cover` (`:42-54`). (2) every `.screen-x` rule in
  `index.css` names both horizontal insets and combines them with `max()`, never `+` (`:57-80`).
  (3) any `.tsx` whose code (comments stripped) has `fixed` within 400 characters of `top-0` /
  `bottom-0` must mention the matching inset, or `--content-pad-b`, or any `pt-[var(--` /
  `pb-[var(--` (`:95-147`); two exemptions with reasons; an exemption whose file is gone fails
  (`:151-156`).
- Why. Every inset use was vertical and the gutter put text under a landscape notch; the bottom
  sheet was never examined because its classes sat in two string literals.
- What part 3 actually examines today (measured with a read-only replica of the rule): six
  file / edge pairs. `top-0`: `RestTimer.tsx`, `ToastHost.tsx` (both name the inset). `bottom-0`:
  `BottomNav.tsx`, `E14E20.tsx`, `E8E9.tsx` (name the inset) and `ToastHost.tsx` — the only file
  that passes through the `--content-pad-b` escape. Nothing passes through `p?-[var(--`. Neither
  `EXEMPT` entry matches anything any more (`E14E20.tsx` has no `top-0` near a `fixed`,
  `OfflineIndicator.tsx` has no `fixed` and no `bottom-0` in code): the "2 exemption(s)" the gate
  prints exempt nothing, and its stale check cannot tell, because it only tests that the file exists.
  `sticky … top-0` occurs twice and is outside the rule: `OfflineIndicator.tsx` (names the inset by
  its own care) and `DataTable.tsx`'s table head (inside a scroll container).
- Pulse breaks it? Not structurally. Every new edge-pinned Pulse element (bar + fade, toast band,
  dock) naturally needs its inset. Three weak points become live under Pulse:
  1. `sticky top-0` is outside the rule (it looks for `fixed`). Today's offline strip is sticky and
     is only compliant by its own care. Pulse adds more top-zone furniture (band, status-bar mask,
     a pinned chat header per `Product gaps.md:71`).
  2. The escape `pb-[var(--` accepts ANY token, and `--content-pad-b` is a name typed into the gate.
     Pulse needs to split that token (§5.5); a renamed token leaves a dead branch in the gate that
     nobody notices.
  3. Nothing checks the top of an ordinary page. Pulse puts the header at inset + 10 with no top bar,
     so the page scaffold has to carry the top inset itself, and a scrolled list will run under the
     status bar unless something masks it (`Product gaps.md:134`).
- Keep its intent.
  - Treat `sticky` as `fixed` for `top-0`.
  - Read the inset-carrying tokens from `tokens.css` (every token whose value contains
    `safe-area-inset-bottom` / `-top`) instead of typing `--content-pad-b`, and accept
    `p[tb]-[var(--X)]` only when X is one of them.
  - Add: the shared screen scaffold file mentions `safe-area-inset-top`.
  - Keep (1) and (2); `.screen-x` is re-valued to 24 / 16 and keeps both `max()` forms.
  - `EXEMPT` names `ui/shell/OfflineIndicator.tsx` and `ui/feedback/variants/E14E20.tsx`. If either
    file is renamed or replaced the gate fails loudly; update the map in the same commit. Better:
    make an exemption fail when the rule would not have flagged its file anyway, so a dead entry
    cannot sit there waving through the next thing written into that file.
- Probes. None exist. Plant: remove `safe-area-inset-bottom` from the Pulse bar → "pins a fixed
  element to bottom-0 and never mentions"; write `pb-[var(--card-pad)]` on a `fixed bottom-0`
  element with no inset → must fail after the tightening (it passes today).

### 4.11 `verify-outbox.mjs`

- Asserts. 31 checks on the real `lib/outbox.ts` with a `localStorage` shim: the allowlist is
  enforced (only `/sets/:id/check` and `/sets/:id/void` queue; a coin transfer and a post do not;
  enqueueing anything else throws), the idempotency key survives storage, a corrected set replaces,
  network failure keeps the queue and stops at the first entry, oldest first, a 4xx drops and is
  reported, 429 / 503 keep, queues are per user, `clearOutbox` empties everything.
- Why. A queue that accepts anything eventually replays something irreversible days late.
- Pulse breaks it? No. It becomes relevant through the finish-workout decision (§6.2): a finish must
  never be queued, and must not be sent while this user's queue is non-empty.
- Keep its intent. Add two lines if the finish action is built: `!isQueueable('/workouts/7/finish')`
  and `!isQueueable('/workouts/7/abandon')`.

### 4.12 Missing gate: the Pulse law itself

None of the eleven gates can see a card. A rounded, filled, bordered container built from legal
tokens passes all of them, and "the five ways a builder slides back into generic cards"
(`Pulse System.md` §6) is exactly the recurring-defect class of this redesign. Proposed
`check-pulse.mjs`, in the build chain, with a ratchet so that parallel work is possible:

- Rules (per `.tsx`, comments stripped): no `backdrop-blur`; no `shadow-` other than the one glow
  token on the primary pill; no `<Surface`; no `rounded-card` / `rounded-field`; `bg-surface-1`
  nowhere, `bg-surface-2` / `-3` only in an allowlisted handful of `src/ui` files (sheet, skeleton,
  disabled pill, switch track); no four-sided `border` utility on a container; at most one primary
  pill per page file.
- Ratchet: a committed list of files still on the old language. A file not on the list must be
  clean. A file on the list that is already clean fails the gate ("delete the entry") — the same
  stale-exemption rule `check-safe-area`, `check-i18n` and `check-element-roster` already use. Each
  screen agent's done-signal is deleting its own files from the list. The gate is finished when the
  list is empty and the list mechanism is deleted.
- Probe: plant `<Surface>` in a migrated page → fail; leave a migrated page on the list → fail.

The exact rule set belongs to whoever owns the component mapping; the mechanism and its place in the
chain belong here. `primitives.md` (W19) proposes the same gate as `check-pulse-boxes.mjs` with a
per-file budget that may only go down — the same ratchet seen from the other side.

### 4.13 Two more "must agree" pairs with no gate

- The canvas colour is hand-copied five times: `tokens.css:227` (`--surface-0: #0B0D10`),
  `index.html:9` (`theme-color`), `manifest.webmanifest:11,12` (`theme_color`, `background_color`),
  and `backend/scripts/build-icons.mjs:35` (`BACKGROUND = { r: 0x0b, g: 0x0d, b: 0x10 }`, baked into
  the three committed icons that have a background: the two maskable ones and the apple touch
  icon). Pulse changes it to `#0B0D0A`. Miss one and the browser chrome, the splash screen or the
  icon tile flashes the old blue-black. A ten-line check (read the default `--surface-0`, compare
  with the meta tag and the two manifest fields) belongs in `check-tokens` or a small `check-canvas`.
- `index.html:24` lists five theme packs for the pre-paint script; `ThemeProvider.tsx:11-19` has
  seven. An owner of `aurora` or `ember` gets a flash of the default pack on every cold start today.
  Owner note D1 removes the packs, so the whole inline script (`index.html:11-40`) can go rather
  than be kept in step. Two things to carry: a stored pack id in `localStorage` (`tracker.theme`)
  must be ignored, not crash; and `backend/server.js:99-100` allows `scriptSrc 'self'` only, with a
  comment that the inline script's hash is added "when it lands" — deleting the script closes that
  open end.

---

## 5. The specific questions

### 5.1 The Pulse tab bar: 5 / 6 / 7 raster tabs, no capsule

What changes in `BottomNav.tsx`:

- Goes: the pill / slab split (`:79`, `:91-107`, `:116`, `:129`, `:144`) and the `PILL_MAX_TABS`
  import (`:7`); `bg-[var(--nav-bg)] backdrop-blur-[var(--nav-blur)]` (`:86`); the border and
  `rounded-chip` (`:96`, `:102`); the E11 markers (`:155-166`) and the stroke-width variant (`:170`);
  the badge (`:174-184`, Pulse: no badges on tabs); `uppercase` on the label (`:194`); the lucide
  icon (`:167-173`) and `LucideIcon` in the `NavTab` type (`:4`, `:11`).
- Stays, and is load-bearing: `<nav aria-label={t('nav.primary')}>`; `ul` / `li`; a plain `Link`
  with `aria-current` and the lit state both read from the one `isTabActive` result (`:77`,
  `:121`, `:134`); `min-w-0 flex-1` equal cells (`:129`); the whole cell as the target at
  `min-w-[var(--target-min)]`; the horizontal insets with `max()` (`:90`); `fixed bottom-0`
  and `z-[var(--z-nav)]` (`:85`); no clamp.
- New: the count picks an inset (10 / 12 / 8) and an icon size (32, or 28 at seven), nothing else;
  the bar's bottom offset is the bottom inset (+ 2); the bottom fade is drawn by the same component,
  behind the bar; the outer layer is `pointer-events-none` and only the bar takes taps, because the
  fade's upper part overlaps content the user must still be able to press.
- Icon rendering: both images of a tab (idle and lit) are in the DOM at all times, stacked, with the
  lit one's opacity switched. Two reasons. It is Pulse's "ignite" motion (fill 0 → 100 % in `fast`,
  nothing slides). And it makes the service worker cache all fourteen files on the first online
  paint: `public/sw.js:31-32` caches hashed assets on first use only, so a lit icon first requested
  while offline would be a hole in the bar. Each `<img>` needs explicit `width` / `height`
  (`index.css:76` sets `height: auto; max-width: 100%` globally), `alt=""`, and no drag.
- Pressed state: icon at 60 % opacity.

What changes in `navTabs.ts`:

- `icon: LucideIcon` (`:38`) becomes a string key (`'home' | 'training' | 'nutrition' | 'progress' |
  'coach' | 'admin' | 'profile'`); the `lucide-react` imports (`:23-24`) go. The key → image map
  lives in a separate module under `ui/nav/`. `navTabs.ts` must not import the images itself:
  `check-nav-active.mjs:27` imports this file into bare Node, and a `.png` import there fails with
  an unknown-extension error before a single assertion runs.
- `PILL_MAX_TABS` and its docblock (`:151-160`) go.
- The two long docblocks about lucide stand-ins (`:1-22`) are obsolete: Pulse has a rendered whistle
  and rendered bars.
- `owns`: `/m` in the coach and admin lists (`:137`, `:145`) is dead data — the bar never renders on
  `/m` (`router.tsx:101-103` are outside `AppLayout`). `/notifications` needs an owner (§4.4).
- The docblock claim at `:80-81` about `check-nav` asserting the two library doors is false (§4.3)
  and should not be carried forward.

The assets: 14 PNGs, 512 × 512, transparent, 78-186 kB each, 1.76 MB together
(`TRACKER-mockups/5-pulse/kepek/tab2-*.png`). Shown at 32 pt, a 96 px or 128 px WebP is enough —
a few kB each. The precedent for an authoring script that writes committed frontend assets is
`backend/scripts/build-icons.mjs` ("because `sharp` is" in the backend, `:19-22`). The CSP allows it
(`backend/server.js:102`: `imgSrc 'self' data: blob:`).

What changes in the gates: `check-nav` (§4.3: comment-stripped safe-area test, icon files ↔ keys ↔
map, re-anchored probe), `check-nav-active` (§4.4: completeness, `/notifications`),
`check-safe-area` (§4.10: nothing specific to the bar beyond the general tightening),
`check-element-roster` (§4.6: E11).

Width risk the design names itself: at 360 pt a seventh cell is 49.1 pt and the widest label
(`Kezdőlap`) measures 49 pt. The current bar handles this with `truncate` (`:194`). The design's own
fallback is "admin loses its tab (owner's call)". If that is ever taken, `EXPECTED_COUNT.admin`
changes and `check-nav` assertion 6 then demands a door to `/admin` — which exists
(`SettingsPage.tsx:335`).

Desktop is undefined by Pulse ("402 pt wide only", Index, Honest limits). Today the pill is centred
and content-width at `lg`. See owner question 6.

### 5.2 No aurora: what becomes of `AuroraBackdrop` and `check-aurora`

`AuroraBackdrop` is deleted, with its nine mounts in five files — `AppLayout.tsx:58`,
`AuthPage.tsx:101`, `CoachProfilePage.tsx:71,120,313`, `MarketplacePage.tsx:102`,
`PostPage.tsx:62,89,228` — and the three `--aurora` declarations (`tokens.css:364,834,853`). The
canvas is `body`'s background (`index.css:21`), which already exists. The long comment in
`AppLayout.tsx:36-52` ("no background on the wrapper, and that is load-bearing") stops being true
and must go with it.

`check-aurora` must not be left in the chain reporting `0 backdrop mount(s)`, and must not simply be
deleted. Its intent is: one class on an ancestor silently removes the thing the whole design stands
on, with no error anywhere. Pulse has an exact heir.

Pulse images are "a true-black-edged still set to LIGHTEN, so no rectangle shows"
(`Pulse System.md` §5; kit `pic()`, `app-kit.src.js:104`). In CSS that is `mix-blend-mode: lighten`,
and it only works while the image blends against the canvas. An element blends with the content of
the stacking context it belongs to, and anything that creates a stacking context isolates the group:
`transform`, `opacity` below 1, `filter`, `will-change`, `isolation`, a positioned element with a
`z-index`, `position: fixed` or `sticky`. Put a hero image under such an ancestor with no canvas
fill of its own and the image blends against nothing: a true-black rectangle appears on the
`#0B0D0A` canvas. The route transition Pulse specifies ("content rises 8 px with a `base` fade",
§2.4) animates exactly `transform` and `opacity` on a wrapper around the hero. Correct in source,
wrong on screen, no warning — the same shape as the wrapper that painted over the aurora.

The replacement depends on one implementation decision that has to be made before screens start:

- Option A — keep the blend. `check-aurora` is re-pointed at the Pulse image component: the same
  ancestor walk (`check-aurora.mjs:68-110` can be reused almost verbatim), failing on an ancestor in
  the same file that isolates (`isolate`, `opacity-*`, `transform` / `translate-*` / `scale-*`,
  `filter` / `blur-*`, `will-change-*`, `sticky`, `fixed`, a `motion.` element) and keeping the
  existing rule for a non-canvas `bg-*`. Like today's gate it sees one file at a time; the shell
  wrappers (`AppLayout`, the scaffold, any route-transition wrapper) are few and can be named in the
  gate and checked explicitly.
- Option B — pre-composite every still onto the canvas colour in the asset script and feather the
  edge with a CSS mask; no blend mode at all. Nothing can isolate what is not blended. The gate then
  becomes: no ancestor of an image paints a background other than the canvas (the literal old rule),
  plus the baked colour equals `--surface-0` (one more copy for §4.13). This is the sturdier choice
  and `Product gaps.md:44` already names it as acceptable ("or pre-composited on the canvas black").
  Its cost: the canvas colour is then fixed in the files, which matters only if a theme pack may
  change the black. Owner note D1 removes the packs and describes a future pack as an accent
  override, so the black is fixed and this cost is nil for the stills. (The LIT tab icons are a
  different matter: their lime is baked into the raster, so a future accent pack needs its own
  renders or a tint — Index, Honest limits.)

Recommended: Option B for the stills, the transparent cut-outs (tab icons, coin) as they are, and
the re-pointed gate in the Option B form. Either way the new gate needs its probe: plant
`bg-surface-2` (Option B) or `opacity-90` (Option A) on the wrapper above the Home hero image and
watch it fail.

Sequencing: `check-aurora` stays in the chain, unchanged and green, until the last
`<AuroraBackdrop` mount is removed; the commit that removes the last mount replaces the script and
the `check:aurora` entry in `package.json:9,19`.

### 5.3 Pushed-screen headers: shared today, or each page its own?

Each page its own (§2.6: 25 files with an `h1`, 12 hand-drawn back controls, two glyphs, three
sizes, four mechanisms). Pulse needs one component — the single largest "second implementation of a
solved problem" in the shell's neighbourhood. From the frame scripts, four kinds cover 18 of the 24
screens:

| Kind | Anatomy | Screens |
|---|---|---|
| `greet` | title 22 + sub line; one trailing icon button | Home, coach dashboard |
| `root` | one `display` line; one optional trailing icon button | Gyakorlatok, Táplálkozás, Haladás |
| `push` | back chevron + PARENT NAME as eyebrow (44 row), `display` title; optional trailing node in the row (text link, small `Mentés` pill, `Belépés`) | exercise detail, coins, notifications, client detail, chat, plan editor, post editor, profile editor, marketplace, post detail |
| `section` | category eyebrow WITHOUT chevron, `display` title; optional trailing link | coach plans, admin, style studio |

Custom, not the component (6): the player (counter + `Videó` row), onboarding (eyebrow + giant step
numeral), Profil (monogram hero), auth, compose hub (identity row in the back-row slot), the public
coach profile (bare back glyph + `Belépés`, then the monogram).

Two consequences for navigation data:

- A pushed header names its parent, so "back" stops being history. Six pages already link to a fixed
  parent; four use history (`SettingsPage.tsx:175`, `CoinsPage.tsx:100`,
  `NotificationsPage.tsx:291`, `PublicChrome.tsx:138`). Parent per route is static data: it belongs
  in a pure table beside the tab table (route → parent path + parent label key), where a gate can
  check that the parent is a real route, the key resolves in three languages, and the owning tab of
  the child equals the owning tab of the parent (§4.4). From the frames:
  `/library/:id` → `/library` (`nav.library`) · `/coins` → `/settings` (`nav.profile`) ·
  `/notifications` → `/` (`nav.home`) · `/coach/clients/:id` and `…/chat` → `/coach`
  (`coaching.title`) · `/coach/plans/:id` → `/coach/plans` (`plans.title`) ·
  `/compose/profile`, `/compose/posts/:id` → `/compose` (`compose.backToDesk`) ·
  `/m/p/:id`, `/m/c/:handle` → `/m` (default `common.back`).
- The back prop's spelling decides what `check-nav` counts as a door (§4.3). Decide the door rule
  first, then name the prop.

The chevron is a 24 px glyph in a 44 × 44 target with the eyebrow as its label; the label must be
real text inside the link (it is the accessible name), uppercase by CSS.

Undrawn and needing a decision: `/admin/styles` has no back control in the frame because the code
has none (`Product gaps.md:246`); Profil is drawn as a root tab with `Beállítások` as an in-page
heading while the code has a back control and a centred title (`Product gaps.md:56`).

### 5.4 The offline strip and the toast band, in Pulse terms

Pulse gives one component for both: a notice line — 6 pt semantic dot, one `capM` line, an optional
trailing link — and, when it must sit over the page, "the page's own black" behind it with a strong
rule underneath. No rail, no cloud glyph, no glass, no capsule, no timer hairline.

- Offline: amber (`warn`) dot + `Nincs internetkapcsolat · 3 művelet vár feltöltésre`; while only
  draining, the count alone. In flow, so it still pushes the header down — which keeps the reason
  `--offline-h` exists. It needs an opaque canvas background and the top inset, because it stays
  pinned while content scrolls under it. One line instead of today's two.
- Toast: the same line as a band over the header zone (0-120 at the design size): top padding
  inset + 6, a 44 pt row, 7 below, a strong rule. Kinds `danger` / `warn` / `ok` / ink. Drops in
  `base`, 4 s, leaves in `fast` (`--duration-toast` already exists, `tokens.css:135`).
- Conflict that has to be designed out: both now live at the top. `ToastHost.tsx:37-40` records why
  toasts are bottom-first today — a top toast lands on the offline strip, on the same z layer. Pulse
  moves every toast to the top. The clean answer is one host for the top zone that renders the
  offline line first and the toast line under it, publishes one height, and owns the single
  live-region policy. The drain loop is not presentation and should leave the component for a hook
  mounted in the same place (`providers.tsx:55`), so the public routes keep it.
- What the product has that the design does not: three stacked toasts (`ToastHost.tsx:105`), an Undo
  action with a morph (`E12E16.tsx` variant D; `useComposeFlow` passes an undo callback), a hover
  pause, a visible countdown. A one-line band can carry a trailing `Visszavonás` link; it cannot
  carry three toasts without covering the header and first block. `Product gaps.md:159,247` flag the
  bottom placement; the design has no bottom variant. Owner question 5.
- "No celebration toasts" (`Pulse System.md` §4) yet `workout-2` draws the record toast (trophy glyph,
  `Új rekord`, ✕). The inventory resolves it: "the record toast is the only celebration"
  (`Screens/workout.md:144`). The band needs a leading-glyph slot in place of the dot for that one.
- 12 call sites pass `'success' | 'error' | 'info' | 'record'`; they map to `ok` / `danger` / ink /
  ink + trophy. The `placement` option (`ToastHost.tsx:44-51`) disappears; its one user is
  `WorkoutPlayer.tsx:296`.

### 5.5 Safe areas, `--viewport-h` and `--offline-h`

Keep the machinery. Its reason survives the redesign unchanged: the offline line is in flow, the
player is exactly one viewport tall by law, and without the subtraction the check control leaves the
screen the moment the network drops (`tokens.css:156-170`, `OfflineIndicator.tsx:107-119`). If the
top-zone host of §5.4 is built, it is the one that publishes `--offline-h` — and only the in-flow
height counts, never the height of an overlaying toast.

What changes is `--content-pad-b`. Today one token serves two readers on purpose
(`tokens.css:147-154`): what the layout pads, and what a full-height screen subtracts. In Pulse those
are two different distances:

- a full-height screen ends at the top of the tab bar: bar height + bottom inset (92 at the design
  size);
- a scrolling page must be able to bring its last block clear of the fade: the kit's long-scroll
  rule is `contentEnd + 140`.

Two tokens, both derived from `--nav-h` and the inset in `tokens.css` and nowhere else, or the
original 16 px scroll bug returns on the player. `check-safe-area` names `--content-pad-b`
literally (§4.10), so the split and the gate change travel together.

Derived values at the design size, for the token block (names are a proposal; the numbers are the
kit's):

| Meaning | At 402 × 874 | Expression |
|---|---|---|
| bar height | 56 | `--nav-h: 56px` (was 64) |
| bar bottom offset | 36 | bottom inset + 2 |
| what a full-height screen subtracts | 92 | `--nav-h` + bar bottom offset |
| bottom fade height | 130 | the above + 38 |
| scrolling page bottom padding | 140 | the above + 48 |
| docked action bottom, with tabs | 104 | the above + 12 |
| docked action bottom, no tabs | 50 | bottom inset + 16 |
| root header top | 72 | top inset + 10 |
| pushed header top | 64 | top inset + 2 |
| toast band top padding | 68 | top inset + 6 |

The design is drawn on one phone with both insets non-zero. On a device where an inset is 0 (a
desktop browser, Android with the system bars outside the web view, Safari with its own chrome) the
literal formulas give a header 2-10 px from the top edge and a tab bar 2 px from the bottom. Each of
these needs a floor (`max(inset, n)`); the floor values are not in the design. Owner question 6.

The top: with no app bar, the header is ordinary content at inset + 10, so the page scaffold must
carry the top inset — today no page does (§2.5) — and a scrolled list will run under the status bar.
A fixed strip of canvas colour exactly as tall as the top inset (zero-height where there is none)
is the smallest fix and belongs to the shell. `Product gaps.md:134` asks for it.

Horizontal: `.screen-x` moves from 16 / 24-at-48rem to 24 / 16-below-376 and keeps both `max()`
forms, or `check-safe-area` part 2 fails.

### 5.6 Where the fade above the tab bar and a docked primary action live

- The fade belongs to the bar: one fixed, `pointer-events-none` layer at the bottom of the screen
  that contains the gradient and the bar, in `ui/nav` (or `ui/shell`), mounted once by `AppLayout`.
  It is part of the chrome in the kit too (`chrome()`, `app-kit.src.js:179`). The gradient is a
  token (canvas colour, transparent → solid over the first 28 %), because a raw `rgb()` or hex in a
  class fails `check-tokens`.
- The docked action is a shell slot, not a screen's own `fixed` element. Today five hand-written
  "above the nav" offsets exist with three different gaps (§2.3). The dock is the same problem with
  a higher price: it has its own, taller fade; the page under it must pad by its height or the last
  field hides behind it (`Product gaps.md:105`); and it must work with tabs (coach chat composer,
  onboarding footer) and without (login, register). One primitive in `ui/shell` that renders the
  action at the token offset, draws its fade, and publishes its height the way the offline line
  does. Screens hand it a node.
- Because the public screens have no layout, each would have to mount the dock layer, the status-bar
  mask and (today) the backdrop by hand. A layout route for `/login`, `/register`, `/m…` in
  `router.tsx:84-103` removes that — the per-page shell copies are how the aurora defect survived
  review (`check-aurora.mjs:15-18`).
- What moves into the page and out of the "floating above the nav" family: the rest timer. `workout-2`
  draws it as an in-flow block of the player (giant clock, `Pihenő átugrása`, `Következik: …`, a
  draining lime line) in place of the switcher row, not as a card over it. `RestTimer.tsx:91,121`
  (`fixed … bottom-[calc(var(--nav-h)+…)]`, `z-30`) goes away with the player rewrite; the shell does
  not need to host it. The FAB (`E14E20.tsx:558-567`) has one user, the playground.

### 5.7 Smaller shell items

- `CommandPalette` is a centred dialog with a card, a border, a shadow and a raw `bg-black/50`.
  Pulse: "no centred dialogs". It is desktop-only and the design is phone-only; restyle minimally
  (sheet surface, hairline, token scrim) or decide its fate with the desktop question.
- `ScreenSkeleton` (used by `RequireAuth` and as the route `Suspense` fallback, `router.tsx:81`)
  draws `rounded-card` blocks; Pulse skeletons are `s2` blocks, radius 2, in place of each text line.
- `manifest.webmanifest` has a home-screen shortcut `Edzés → /workout`: it lands on the idle player
  unless decision 6.1 is taken.

---

## 6. The two owner decisions, and where they land

Both are answered in `00-owner-decisions.md`: D2 says yes to 6.1 and adds a library row on Home;
D3 defers 6.2 to its own package after the screens. The landing maps below stand either way.

### 6.1 "Edzés" shows the exercise library when no session runs

Today: the tab is `to: '/workout'` with `owns: ['/library']` (`navTabs.ts:125,132,142`). With no
live session `WorkoutPlayer.tsx:255-263` renders a text-only empty state ("NO ACTION HERE,
DELIBERATELY", `:257-259`). The library's only real phone door is Home's empty state
(`HomePage.tsx:225`); on a day with a plan it cannot be reached at all (`Product gaps.md:15,171`).

Three ways to build "yes":

| | How | Gates | Verdict |
|---|---|---|---|
| A. Render the library inside `/workout` | the no-session branch returns the library screen | none change | Two URLs for one screen: detail pages link back to `/library`, the tab opens `/workout`. A second home for a solved screen. No. |
| B. Redirect | the no-session branch returns `<Navigate to="/library" replace />` | `check-nav`: `to="/library"` in `WorkoutPlayer.tsx` is collected as a door, so the library gains a permanent one; `check-nav-active`: `/library` already expects the Edzés tab (`:56-57`, `:70`) | Recommended. One URL per screen, three lines, no table change. |
| C. Dynamic tab target | `AppLayout` asks for the current session and sets the tab's `to` | `check-nav` reads a literal `to:`; the shell gains a feature query on every screen | No. The table stops being static. |

Landing for B:

- `features/workout/WorkoutPlayer.tsx:255-263` — the branch. It must separate three cases the code
  merges today: loading (skeleton), a FAILED `GET /workouts/current` (today it shows the same empty
  state, `Screens/workout.md:70`; redirecting a failure to the library would hide it — it needs an
  error state with `common.retry`), and "no session" (redirect).
- `app/navTabs.ts` — no data change; fix the docblock (`:74-81`).
- `app/router.tsx` — no change.
- `scripts/check-nav.mjs` — no change needed to pass. To make the decision un-removable, add a named
  required door: `/library` must be linked from `WorkoutPlayer.tsx`, reason "the Edzés tab lands
  here when nothing runs". Probe: delete the `Navigate` → that message.
- `scripts/check-nav-active.mjs` — nothing; the rows exist.
- `i18n/{hu,en,de}.json` — `workout.noneTitle` and `workout.noneBody` lose their only consumer and
  must be deleted in the same commit (dead-key rule). Frame `workout-3` (the kettlebell still) is
  then not built.
- `public/manifest.webmanifest` — the `Edzés` shortcut keeps working through the redirect.
- After a finish (6.2) the player has no session: navigate to Home explicitly rather than falling
  into this redirect.
- D2's second half, "Home also carries a row that opens the library": a permanent link in
  `features/home/HomePage.tsx` (today the only one is inside the empty state, `:225`). With it and
  the redirect the library has two doors that are not its own child's back-links, which is what
  lets the door rule of §4.3 be tightened without `/library` turning red.

D2 says "shows", not "redirects". Variant A satisfies the words too; B is recommended for the
one-URL reason above, and it is the planner's call.

### 6.2 A finish-workout action

Owner note D3: not in the screen phase, no placeholder control, its own package at the end "under
the backend rules". Until then Home keeps showing "Edzés folyamatban" after the first start, by
decision. What that package will find:

Backend, already there (`backend/src/logs/routes.js:444-519`), not to be touched in this phase:

- `POST /api/v1/workouts/:id/finish` — strict body, all optional: `duration_seconds` int 0-86400,
  `perceived_effort` int 1-10, `notes` string ≤ 2000. `POST /api/v1/workouts/:id/abandon` — no body.
- One guarded `UPDATE … WHERE id = ? AND client_user_id = ? AND status = 'in_progress'`
  (ownership-scoped). Answer `{ status }`; `404` for not yours / never existed / already closed — so
  a retry after a lost response gets 404, which the client must read as "closed", refetch, and not
  show as an error. Rate-limited with the set limiter. A finish triggers achievement evaluation in
  the background.
- Closing is irreversible (`trg_log_frozen`). Note for the backend owner, outside this phase: by the
  owner's own standard an irreversible transition is a critical endpoint (named worker transaction,
  idempotency key, audit); this one is a bare guarded update, by a written argument (`:464-467`).

Frontend landing:

- Hook: `useFinishWorkout()` / `useAbandonWorkout()` in `features/workout/useWorkout.ts`, beside
  `useStartWorkout` (`:107-117`). On success invalidate `['workout','current']` (`:68`), `['today']`
  (`useToday.ts:21`), `['week', …]` (`WeekStrip.tsx:68`), `['records']`, and after a finish
  `['coin-wallet']` / `['coin-achievements']` (`useCoins.ts:81,102`).
- The outbox race, which is the real risk: set checks made offline wait in the outbox
  (`lib/outbox.ts:48`). If a finish reaches the server first, the log freezes, the queued checks
  come back 4xx, and `flushOutbox` DROPS a 4xx (`verify-outbox.mjs:136-144`) — sets the lifter did
  are lost. So: finish is never queueable (keep it off `QUEUEABLE`), and the control is disabled
  while this user's queue is non-empty or the app is offline, saying why with the existing
  `offline.queued` / `offline.title`. Add the two `isQueueable` lines to `verify-outbox.mjs` (§4.11).
- Where the control goes: not a second lime pill — the player's one pill is the set check
  (`Screens/workout.md:18`). A text link in the player, and a confirmation in a bottom sheet (Pulse
  §4: irreversible actions are confirmed in a sheet). Possibly also a text link beside `Folytatás` on
  Home's "Edzés folyamatban" block. Nothing is drawn for any of this (`Screens/workout.md:60,134`
  lists a finish button under "Do not invent"), so the placement is a design task before it is a
  code task.
- Copy keys, all in the `workout` namespace, all three bundles, in the same commit as their
  consumer. Proposed keys with PROPOSED Hungarian — the owner approves the wording:

  | Key | hu (proposed) | Used by |
  |---|---|---|
  | `workout.finish` | Edzés befejezése | the link, the sheet title |
  | `workout.finishBody` | `{{done}} / {{total}} sorozat rögzítve. Befejezés után már nem módosítható.` | sheet body |
  | `workout.finishConfirm` | Befejezés | sheet confirm |
  | `workout.abandon` | Edzés elvetése | sheet secondary, danger text |
  | `workout.abandonBody` | Az edzés nem kerül be az előzményekbe. | abandon confirmation |
  | `workout.finishFailed` | Nem sikerült befejezni. Próbáld újra. | notice line |
  | `workout.finished` | Edzés befejezve | `ok` notice |

  Cancel reuses `common.cancel`. `{{done}}` / `{{total}}` must appear identically in en / de.
- Gates touched: `check-i18n` (keys ↔ consumers), `verify-outbox` (two lines). `check-nav`: none.
- If 6.1 is also yes, the empty-state body "…vagy csinálj szabad edzést." disappears with the idle
  player; if 6.1 is no, that sentence still promises a freestyle workout nobody can start
  (`Screens/workout.md:156`).

---

## 7. What breaks or contradicts Pulse

| # | What | Why | Recommended answer |
|---|---|---|---|
| 1 | Notifications is drawn with no lit tab; the system rule and `check-nav-active` both say one tab is always lit | `chrome(root,'none')` in both frames; no tab owns `/notifications` in code either, and the gate's table omits it | Home owns `/notifications`; add the row and the completeness assertion (§4.4) |
| 2 | `check-aurora` loses its subject and would pass forever | Pulse has no backdrop | Replace with the image gate in the same commit that removes the last mount (§5.2) |
| 3 | Images on `mix-blend-mode: lighten` show a black rectangle under any isolating ancestor | route transition animates transform / opacity | Pre-composite onto the canvas (Option B) and gate the ancestors |
| 4 | `check-type-scale` cannot see `giant = min(124px, 31vw)` | value test accepts plain lengths only | Widen the value test; probe it (§4.8) |
| 5 | Dropping `useElementVariant('E11')` from the bar fails `check:elements` twice | catalogue says E11 is live | `live: false` + `DORMANT` entry in the same commit (§4.6) |
| 6 | Pulse toasts are a top band; the product has bottom toasts, three at once, Undo, a countdown | `ToastHost` + `E12E16` | One top-zone host; band carries one line + optional trailing link; owner decides stacking and Undo (§5.4) |
| 7 | Top band and offline line collide at the top | both `--z-toast`, both top | One host renders both in order and publishes one height |
| 8 | One token (`--content-pad-b`) can no longer serve the layout and the full-height player | fade zone ≠ bar zone | Two derived tokens; update `check-safe-area` with them (§5.5) |
| 9 | A shared header may turn `/compose` and `/m` red in `check-nav` | their only "doors" are their children's back-links | Decide door or exemption first (owner question 4), then tighten the rule deliberately |
| 10 | The tab-bar PNG import cannot live in `navTabs.ts` | the file is imported by bare Node in a gate | Icon keys in the table, image map in a separate UI module (§5.1) |
| 11 | Parallel agents plus `verify-nav-gate.mjs` in one working tree | the probe rewrites `navTabs.ts` / `BottomNav.tsx` on disk while it runs | Probes run only in a serial step or in their own worktree; never inside `build` |
| 12 | Removing an old token early reddens every agent's build | `undeclared-token` / `undefined-color` are global | Tokens: add first, remove last, in one closing work item |
| 13 | Seven tabs at 360 pt: a 49.1 pt cell for a 49 pt label | the design says so itself | Keep `truncate` as the net; owner decides whether admin keeps its tab on narrow phones |
| 14 | The canvas colour lives in five files, one of them in the backend icon script | no gate | Small agreement check; regenerate the four app icons (§4.13) |
| 15 | `Áttetsző felületek` setting and the `data-transparency` machinery describe glass that no longer exists | `ThemeProvider`, `tokens.css:860-917` | Removed by owner note D1; out of shell scope except `index.html`'s pre-paint script, which goes with the packs (§4.13) |
| 16 | The playground's E11 demo renders the old bar with two lucide icons and a badge | `PlaygroundPage.tsx:264-269` is the bar's second consumer | Rewrite or drop the demo in the same commit as the bar; if the `case 'E11'` goes, `PREVIEWABLE` must lose `E11` too or `check:elements` fails |

---

## 8. Hard constraints for implementers

1. `src/app/navTabs.ts` stays importable by bare Node: package or type-only imports, erasable
   syntax, no asset import, no extension-less relative runtime import. Enforced by
   `scripts/check-nav-active.mjs:27` (the import itself).
2. The three role lists keep their literal shape (`role: [` … `{ to: '…'` per entry … `]`) and their
   counts 5 / 6 / 7. Enforced by `scripts/check-nav.mjs:57-74`.
3. Every tab target is a router path and every `labelKey` exists in hu / en / de.
   `scripts/check-nav.mjs:78-102`.
4. The bar never clamps its list (`.slice(0, n)`). `scripts/check-nav.mjs:106-113`.
5. The bar file carries both horizontal insets. `scripts/check-nav.mjs:117-126`.
6. Every route keeps a door or a written exemption. `scripts/check-nav.mjs:130-185`.
7. Exactly one tab is lit on every route in the table; a tab's own route is lit only by itself; the
   prefix test stays boundary-aware. `scripts/check-nav-active.mjs:51-119`.
8. The lit state and `aria-current` come from one expression. Not gated (no DOM harness); stated in
   `ui/nav/BottomNav.tsx:65-77` and `scripts/check-nav-active.mjs:22-24`.
9. No raw colour, radius, duration, easing or off-grid spacing outside `ui/tokens/tokens.css`; every
   `var(--x)` is declared there; no raw `<button>` outside `src/ui`.
   `scripts/check-tokens.mjs:23-90,291-361`.
10. `.screen-x` stays defined in `src/index.css`, with both horizontal insets and `max()`.
    `scripts/check-tokens.mjs:335-345`, `scripts/check-safe-area.mjs:57-80`.
11. `viewport-fit=cover` stays in `index.html`; every `fixed … top-0 / bottom-0` element accounts for
    its inset. `scripts/check-safe-area.mjs:42-147`.
12. Every type step in `tokens.css` is listed in `lib/cn.ts` `TYPE_STEPS`, and nothing else is.
    `scripts/check-type-scale.mjs:42-60`.
13. `catalog.live` equals the real `useElementVariant` call sites; anything unread is in `DORMANT`.
    `scripts/check-element-roster.mjs:147-185`.
14. Copy: three bundles in parity, no dead key, no missing key, no pasted Hungarian, no literal
    `aria-label` / `placeholder` / `title` / `sr-only` text. `scripts/check-i18n.mjs`.
15. `features/compose/useAutosave.ts` keeps its eight mirrored lines verbatim.
    `scripts/verify-autosave.mjs:52-64`.
16. `features/workout/intervalPlan.ts` and `ui/feedback/chartGeometry.ts` stay pure and keep their
    exports. `scripts/check-interval.mjs:9,246`.
17. Only `/sets/:id/check` and `/sets/:id/void` may be queued offline. `lib/outbox.ts:48`,
    `scripts/verify-outbox.mjs:42-54`.
18. Nothing from `/api/` or `/healthz` is cached by the service worker. `public/sw.js:70`.
19. The offline line stays in flow and its height keeps reaching the full-height player through
    `--offline-h` / `--viewport-h`. `ui/tokens/tokens.css:156-170`,
    `ui/shell/OfflineIndicator.tsx:120-135`, `features/workout/WorkoutPlayer.tsx:37-40`. Not gated.
20. The offline probe keeps checking `/healthz`'s JSON body, not its status.
    `ui/shell/OfflineIndicator.tsx:66-83`. Not gated.
21. Public routes stay outside `RequireAuth` and never probe the session to draw their chrome.
    `app/router.tsx:87-103`, `features/marketplace/PublicChrome.tsx:144-147`. Not gated in the
    frontend.
22. The nav is never a permission; every route and endpoint re-checks the role.
    `app/navTabs.ts:162`, `app/RequireAuth.tsx:12-13`.
23. Images and fonts are self-hosted: `imgSrc 'self' data: blob:`, `fontSrc 'self'`,
    `styleSrc 'self'`. `backend/server.js:95-104`.
24. A gate is never removed to get a green build; a replaced gate ships with a probe that shows it
    failing. Project rule (task brief); the idiom is `scripts/verify-nav-gate.mjs`.

---

## 9. Work items

Sizes: S under half a day, M about a day, L two to three days, XL more. "Parallel-safe" = can run
while screen agents work, given its dependencies are met.

| # | Work item | Files | Size | Depends on | Parallel-safe |
|---|---|---|---|---|---|
| S1 | Shell tokens for Pulse (bar height, bar offset, full-height reserve, fade height, page bottom padding, dock offsets, header tops, band padding, fade gradients), added beside the old ones | `ui/tokens/tokens.css`, `index.css` (`.screen-x`) | S | the Pulse token block (palette, type) from the token work | No — every other shell item reads these; do it first |
| S2 | Tab icon assets: resize the 14 PNGs to 2x / 3x WebP, commit them, authoring script | `backend/scripts/` (new script, beside `build-icons.mjs`), `frontend/src/ui/nav/tab-icons/*` | S | — | Yes |
| S3 | Pulse tab bar: icon keys in the table, image map module, new `BottomNav` with the fade layer; E11 → dormant; playground demo | `app/navTabs.ts`, `ui/nav/BottomNav.tsx`, `ui/nav/tabIcons.ts` (new), `app/AppLayout.tsx`, `ui/feedback/catalog.ts`, `scripts/check-element-roster.mjs`, `features/playground/PlaygroundPage.tsx` | M | S1, S2 | Yes (touches no product page) |
| S4 | `check-nav` update: comment-stripped inset test, icon files ↔ keys ↔ map, re-anchored and extended probe | `scripts/check-nav.mjs`, `scripts/verify-nav-gate.mjs` | S | S3 | Yes, but the probe must run alone (it rewrites source files while it runs) |
| S5 | `check-nav-active`: completeness against the router, `/notifications` owner, first probe | `scripts/check-nav-active.mjs`, `app/navTabs.ts`, new probe script | S | owner question 2 | Yes |
| S6 | Screen scaffold + shared header (`greet` / `root` / `push` / `section`), status-bar mask, route parent table | `ui/shell/Screen.tsx`, `ui/shell/ScreenHeader.tsx`, `app/routeMeta.ts` (all new), `app/AppLayout.tsx` | M | S1, type roles from the token work | No — every screen agent needs it before starting |
| S7 | Top-zone host: offline line + toast band in one place, drain loop moved to a hook, single placement | `ui/shell/OfflineIndicator.tsx`, `ui/feedback/ToastHost.tsx`, `ui/feedback/variants/E12E16.tsx` (Toast), `app/providers.tsx`, `lib/` (new hook), `features/workout/WorkoutPlayer.tsx:296`, `scripts/check-safe-area.mjs` (`EXEMPT`), `ui/feedback/catalog.ts` (E15) | L | S1, owner question 5 | Yes for most screens; coordinate with the player and the compose agents (they call `toast`) |
| S8 | Dock primitive (action above the bar or above the home indicator, own fade, published height) and a public layout route | `ui/shell/Dock.tsx` (new), `app/router.tsx`, `app/PublicLayout.tsx` (new), `app/AppLayout.tsx` | M | S1, S3 | No for auth, onboarding, chat (they need it); yes for the rest |
| S9 | Remove the aurora: nine mounts, the component, three token declarations; replace `check-aurora` with the image gate and its probe | `app/AppLayout.tsx`, `features/auth/AuthPage.tsx`, `features/marketplace/{MarketplacePage,PostPage,CoachProfilePage}.tsx`, `ui/shell/AuroraBackdrop.tsx`, `ui/tokens/tokens.css`, `scripts/check-aurora.mjs` → new script, `package.json` | M | the image component and the blend-or-bake decision (owner question 3) | The mount removals collide with the auth and marketplace screen agents — give each removal to the agent that owns the page; the gate swap is the last step |
| S10 | `check-type-scale`: accept size expressions; probe | `scripts/check-type-scale.mjs`, new probe | S | — | Yes; must land before the type ramp does |
| S11 | `check-safe-area`: sticky as fixed, inset tokens read from `tokens.css`, scaffold top inset; probes | `scripts/check-safe-area.mjs`, new probe | S | S1, S6 | Yes |
| S12 | `check-pulse` with the legacy-file ratchet, in the build chain; probe | `scripts/check-pulse.mjs`, `scripts/pulse-legacy.json` (new), `package.json` | M | the component mapping (which utilities are illegal) | No — screen agents use the list as their done-signal; land it before they start |
| S13 | Canvas colour in one step: token, `theme-color`, manifest, icon script constant, regenerated icons; agreement check | `ui/tokens/tokens.css`, `index.html`, `public/manifest.webmanifest`, `public/icon-*.png`, `backend/scripts/build-icons.mjs`, `scripts/check-tokens.mjs` or a new small script | S | the Pulse palette | Yes |
| S14 | A probe runner for all gates, outside `build` | `scripts/verify-gates.mjs` (new), `package.json` | S | S4, S5, S9-S12 | Yes; run serially only |
| S15 | Restyle the leftovers of the shell: `CommandPalette`, `ScreenSkeleton` | `ui/shell/CommandPalette.tsx`, `ui/feedback/ScreenSkeleton.tsx` | S | S1, owner question 6 | Yes |
| S16 | Owner note D2: idle `Edzés` lands on the library; permanent library row on Home; error state for a failed session read; dead keys out; named door in the gate | `features/workout/WorkoutPlayer.tsx`, `features/home/HomePage.tsx`, `i18n/{hu,en,de}.json`, `app/navTabs.ts` (docblock), `scripts/check-nav.mjs`, `scripts/verify-nav-gate.mjs` | S | the player and Home rewrites | No — same files as the player and Home screens; hand the two page edits to those agents, the gate edit to the shell |
| S17 | Owner note D3, after every screen: finish / abandon hooks, sheet, copy, outbox guard (and the backend half under the backend rules) | `features/workout/useWorkout.ts`, `features/workout/WorkoutPlayer.tsx`, `features/home/HomePage.tsx`, `i18n/{hu,en,de}.json`, `scripts/verify-outbox.mjs`, `backend/src/logs/routes.js` | M | all screens done, a drawn design, approved copy, the bottom sheet component | No — a closing package of its own |
| S18 | Closing sweep: delete retired shell tokens (`--nav-bg`, `--nav-blur`, `--nav-fg-*`, `--nav-dock-offset`, `--content-pad-b-lg` if unused, `--toast-*`), `PILL_MAX_TABS`, the `badge-pop` keyframes, the pre-paint pack list fix | `ui/tokens/tokens.css`, `index.css`, `index.html` | S | every screen migrated | No — last |

Order that unblocks parallel screen work: S10 → S1 → (S2, S13 in parallel) → S3 → S6 → S12 → then
screens, with S4, S5, S7, S8, S11, S15 alongside; S9's gate swap, S14 and S18 at the end.

Overlap with the sibling note `primitives.md` in this folder, which lists the same ground from the
component side — the planner must merge these, not staff them twice: S3 ↔ its W14 (tab bar),
S6 ↔ W9 (`ScreenHeader`), S7 ↔ W13 (status zone), S9 ↔ W15 / W21 (`GlowImage`, aurora
retirement), S12 ↔ W19 (it names the gate `check-pulse-boxes.mjs` with a per-file budget; one gate,
one name). The gate scripts themselves (S4, S5, S10, S11, S13, S14) appear only here.

Working-tree rule for the parallel run: every gate reads the whole of `src`, so one agent's
half-finished file reddens every other agent's `npm run build` in a shared tree, and the mutation
probe rewrites `navTabs.ts` / `BottomNav.tsx` / `SettingsPage.tsx` on disk for the seconds it runs.
One worktree per agent, merged through a serial step that runs the full chain, is the only layout
in which a red build means "my change".

---

## 10. Owner questions

1. Answered in `00-owner-decisions.md` (D2, D3): `Edzés` shows the library when idle, Home gets a
   library row, finish-workout is a separate package at the end. Still open inside it: the finish
   action has no drawn design and its Hungarian copy needs approval before that package starts
   (§6.2).
2. Which tab is lit on Értesítések? The frames draw none; the system rule says the parent's
   (`Kezdőlap`). For a coach the bell is also on the coach dashboard.
3. Stills on a blend mode, or baked onto the canvas black? Baked is sturdier and freezes the canvas
   colour into the image files. With the packs removed (D1) nothing argues against baking; this is
   now a planner decision more than an owner one, but it must be made before the first screen with
   an image.
4. `/compose` (the coach's marketplace desk) has no way in on a phone, and `/m` (the public
   marketplace) is linked only from its own child pages. Where is the door to each — coach
   dashboard, Profil — or are they deliberately link-less?
5. Toasts: top band only, one at a time, with a trailing `Visszavonás` where an undo exists? That
   drops the three-toast stack, the bottom position and the visible countdown.
6. Outside the one drawn phone: what is the minimum distance from the top and bottom edge when the
   device reports no safe-area inset, and what does the tab bar do on a desktop-width window
   (centred column, or full width)? Does the desktop command palette stay?
7. Element variants were not ruled on (D1 gives only a default: one Pulse look per element). With
   that default the style studio — a screen that IS drawn in Pulse, switching E1 from D to C — ends
   up listing 27 elements that all say "inert". Keep the studio as drawn with a few live elements,
   or accept an inert studio until variants are redesigned?
8. At seven tabs on a 360 pt phone the labels touch. Truncate, or does the admin lose the tab on
   narrow phones (the design's own suggestion)?
9. `/admin/styles` has no back control in code or in the frame, and Profil is drawn as a root tab
   while the code gives it a back arrow and a centred title. Follow the frames in both cases?

---

## 11. Limits of this pass

- Nothing was rendered. Geometry comes from the kit source and the 2x PNGs
  (`home-1`, `admin-1`, `exercise-detail-1`, `onboarding-1`, `workout-1`, `workout-2`,
  `coach-chat-1` were looked at); no browser measurement was taken.
- `verify-nav-gate.mjs` was analysed statically, not run, because it rewrites source files.
- The door list in §4.3 and the examined-files list in §4.10 come from replicas of the two gates'
  collection loops, not from the gates' own output (the gates print totals, not the per-route or
  per-file detail). The replicas use the same regular expressions; they were not kept in the repo.
- No proposed gate change was written or tried. Each "probe" above is the mutation that should be
  planted; none has been planted.
- `npm run build` was not run as a whole (it writes `dist/`); the eleven gates were run one by one,
  `tsc -b` and `vite build` were not.
- The stacking-context behaviour of `mix-blend-mode` in §5.2 is from the compositing rules, not from
  a test in this app; it should be confirmed on the first hero image before Option A is considered.
- Line numbers are from the files as they are on `pulse-redesign` at commit `2829c3a`.
- The backend was read only where the finish endpoints and the CSP live; nothing else in it was
  examined.
