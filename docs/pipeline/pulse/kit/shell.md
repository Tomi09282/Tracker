# Kit reference — the shell (lane SH1, package F11)

The chrome every screen stands in: the tab bar and its fade, the screen scaffold, the four headers,
the docked action, and the two layout routes that mount them. Screens compose these; they never draw
a bar, a top inset, a back arrow or a "fixed above the nav" element of their own.

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §3 (shell), rulings R12, R13, R21 of
`docs/pipeline/pulse/PLAN.md`, owner answers Q5 / Q6. Construction: `figma-build/app-kit.js`
(`scaffold` 147, `screenHead` 153, `tabBar` 163, `chrome` 177, `dockAction` 189). Measured boxes:
`.pulse/geometry/home-1.json`, `exercise-detail-1.json`, `coach-plans-1.json`, `admin-1.json`,
`coach-chat-1.json`, `auth-1.json`, `_components.json` (row "Tab bar", cell `screenHead`). Specimen:
`frontend/src/features/playground/kit/shell.tsx`.

The API below is final. Changes after this page are additive only (R6).

## What a screen writes

```tsx
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Dock } from '../../ui/shell/Dock';

// a tab root — Home, the coach dashboard
<Screen top="root">
  <ScreenHeader kind="greet" title={t('home.greeting')} sub={today} trailing={<NotificationBell />} />
  …blocks, 32 apart…
</Screen>

// a tab root with one display line — Gyakorlatok, Táplálkozás, Haladás
<Screen top="root">
  <ScreenHeader kind="root" title={t('nav.library')} trailing={<Pressable variant="link" shape="icon" aria-label={…}><Search /></Pressable>} />
</Screen>

// a pushed screen — the parent comes from app/routeMeta.ts, never from a prop
<Screen top="push">
  <ScreenHeader kind="push" title={exercise.name} />
</Screen>

// a category screen — Tervezés, Adminisztráció, Megjelenés
<Screen top="push">
  <ScreenHeader kind="section" eyebrow={t('…')} title={t('…')} trailing={<TextLink to="/admin/styles">…</TextLink>} />
</Screen>

// a flow with its one action docked (sign-in, onboarding, the chat composer)
<Screen top="push" fill>
  …
  <Dock as="footer"><Pressable variant="primary" size="lg" className="w-full" type="submit">Tovább</Pressable></Dock>
</Screen>
```

Rules that are not negotiable:

1. **One `Screen` per page, directly under the layout.** It owns the top inset, the gutter, the
   bottom air and the sideways clip. A page adds no `screen-x`, no `py-*`, no `min-h-dvh`, no
   `safe-area` padding of its own.
2. **A pushed screen does not name its parent.** `ScreenHeader kind="push"` reads the row of the
   current route in `app/routeMeta.ts`. A pushed route with no row is a missing row: add it there
   (it is the shell's file — a request to INT / F11), not a `back` prop. `back` exists for the two
   cases a table cannot express: a public root whose way back is the history (`/m`), and an outcome
   state that leaves somewhere else.
3. **Nothing is `fixed` above the tab bar except a `Dock`.** A screen that needs an action to stay in
   reach docks it. The dock measures itself; `Screen` pads by it; the last field never hides under it.
4. **No surface, ever.** The scaffold, the header, the dock and the bar paint nothing but the canvas
   fades. A background here would be the first card.

## `Screen` — `frontend/src/ui/shell/Screen.tsx` · `data-kit="scaffold"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `top` | `'root' \| 'push' \| 'none'` | `'root'` | where the first thing starts: inset + 10 (`--head-top-root`, y 72 on the frames) · inset + 2 (`--head-top-push`, y 64) · the inset alone (`--safe-t`), for a screen that draws its own top (Profil's monogram at 88, onboarding) |
| `gap` | `'block' \| 'tight' \| 'none'` | `'block'` | between the blocks of the screen: 32 · 24 · 0 |
| `width` | `'mobile' \| 'wide'` | `'mobile'` | one centred column of at most `--screen-max` (430) · the 1120 desktop column, only for the screens that have a desktop layout today (R21) |
| `fill` | `boolean` | `false` | at least one viewport tall (minus the bar), as a flex column, so a block can take the free height (`flex-1`) |
| `as` | `'div' \| 'main' \| 'section' \| 'form'` | `'div'` | `main` on a public screen — `PublicLayout` draws no landmark; inside `AppLayout` the `<main>` is the layout's |
| `className` | `string` | — | placement only |
| …every `<div>` attribute | | | `id`, `aria-*`, `onSubmit` (with `as="form"`), … |

What it does, in numbers (402 x 874, insets 62 / 34):

- **top**: 72 or 64, from a token that carries the top inset and its zero-inset floor (12): a desktop
  browser gets 22 / 14 instead of a header on the window edge. `check:safe-area` holds this file to
  a top-inset token.
- **sides**: `.screen-x` — 24 (16 below 376 pt), each `max()`-ed with its landscape inset.
- **bottom**: inside `AppLayout` the content can scroll to 140 above the edge (`--page-pad-b`: the bar
  92 + 48 of air, so the last block leaves the fade), plus `--dock-reserve` when a `Dock` is mounted.
  Inside `PublicLayout`: `--page-pad-b-bare` (inset + 32 = 66).
- **clip**: `overflow-x: clip` — a bleeding hero or chip row is cut by the screen edge; the page never
  scrolls sideways; `position: sticky` inside still works (no scroll container).

`ShellProvider` / `useShell()` (same file) carry `{ tabs: boolean }` from the layout to `Screen` and
`Dock`. A screen never sets it. `StatusBarMask` (same file) is mounted by `Screen` itself, beside the scaffold:
a strip of canvas exactly as tall as the top inset, pinned over the page, so content scrolled up never runs under the
clock. It arrives screen by screen with the top inset it protects — a screen that is not on the scaffold yet keeps
the top it had, unmasked.

## `ScreenHeader` — `frontend/src/ui/shell/ScreenHeader.tsx` · `data-kit="screenHead"`

The screen's `h1`, in the four forms the frames draw. No top app bar, no centred title, no surface:
ordinary content on the gutter that scrolls away with the page.

| `kind` | Row | Title | Use under |
|---|---|---|---|
| `greet` | 48: `title` (22 / 28 SemiBold) over `sub` (`cap`, text-2), one `trailing` node | in the row | `Screen top="root"` |
| `root` | 48: one `display` line (32 / 34, upper case), one `trailing` node | in the row | `Screen top="root"` |
| `push` | 44: the back control (chevron 24 + the parent's name as `eyebrow`), one `trailing` node | `display`, 4 under the row (y 112) | `Screen top="push"` |
| `section` | 44: the category `eyebrow` (not a way back), one `trailing` node; `tight`: the row hugs the eyebrow (20) and starts 12 lower (y 76, title at 100 — `coach-plans-1`) | `display`, 4 under the row | `Screen top="push"` |

| Prop | Type | Kinds | Meaning |
|---|---|---|---|
| `kind` | see above | all | the form |
| `title` | `ReactNode` | all (optional on `push`) | the `h1`. Omit it on `push` when the screen draws its own title block under the back row (client detail: the monogram) |
| `sub` | `ReactNode` | `greet` | the quiet line under the greeting |
| `eyebrow` | `ReactNode` | `section` | the category name |
| `tight` | `boolean` | `section` | see above. Only where the row holds no control |
| `back` | `ScreenHeaderBack` | `push` | overrides the `routeMeta` row: `{ to, label, bare? }` or `{ onClick, label, bare? }`. `bare` draws the chevron alone in a 44 x 44 square (the public pages); `label` stays the accessible name. `force?: 'pressed' \| 'focus'` is for kit specimens only |
| `trailing` | `ReactNode` | all | ONE node at the right end of the row: an icon button, a text link, the small pill (`size="sm"`) |
| `children` | `ReactNode` | all | lines that belong to the header, 4 under the title |
| `titleId` | `string` | all | `id` of the `h1`, for `aria-labelledby` |
| `className` | `string` | all | placement only |

The back control is a real link (`data-kit="iconBtn"`, `data-part="back"`): the chevron is a 12 x 24
slot with the 24 pt glyph hung 8 to its left, then 6, then the parent's name — real text, upper-cased
by CSS, so it IS the accessible name. 44 high; pressed 60 %; the global focus ring.

## `app/routeMeta.ts` — the way back, as data

```ts
export const ROUTE_META = {
  '/library/:id': { parent: '/library', parentLabelKey: 'nav.library' },
  '/coins': { parent: '/settings', parentLabelKey: 'nav.profile' },
  '/notifications': { parent: '/', parentLabelKey: 'nav.home' },
  '/coach/clients/:id': { parent: '/coach', parentLabelKey: 'coaching.title' },
  '/coach/clients/:id/chat': { parent: '/coach', parentLabelKey: 'coaching.title' },
  '/coach/plans/:id': { parent: '/coach/plans', parentLabelKey: 'plans.title' },
  '/compose/profile': { parent: '/compose', parentLabelKey: 'compose.backToDesk' },
  '/compose/posts/:publicId': { parent: '/compose', parentLabelKey: 'compose.backToDesk' },
  '/m/p/:publicId': { parent: '/m', parentLabelKey: 'common.back', bare: true },
  '/m/c/:handle': { parent: '/m', parentLabelKey: 'common.back', bare: true },
};
export function routeMetaFor(pathname: string): MatchedRouteMeta | null;
```

Every parent and every name is what the approved frames draw and what the pages already linked to.
`check:nav` holds every row to the router and the three bundles; `check:nav-active` holds every
signed-in row to the bar (the screen lights its parent's tab). Pure data, importable by bare Node.

## `Dock` — `frontend/src/ui/shell/Dock.tsx` · `data-kit="dockAction"`

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `children` | `ReactNode` | — | what is docked: the screen's one pill, a composer, a footer with a status line |
| `as` | `'div' \| 'footer'` | `'div'` | `footer` when it closes a form or a flow |
| `className` | `string` | — | placement of the CONTENT box only (a gap between its rows) |
| `tabs` | `boolean` | from the layout | specimens only |
| `inline` | `boolean` | `false` | specimens only: at the bottom of the nearest positioned ancestor, no reserve published |

In numbers: the action ends 12 above the bar (`--dock-b`, 104 above the edge) or, without tabs, 16
above the inset (`--dock-b-bare`, 50); it is the content column wide (354); its own fade starts 48
above it, is solid from half way, and ends 16 under it. It stands over the bar's fade
(`--z-dock` 45: above the bar, under every sheet). It publishes `--dock-reserve` (its height + 12,
or + 32 without tabs) on the root element while mounted; `Screen` adds it to its bottom padding, so the
page ends exactly where the dock's fade begins.

## `BottomNav` — `frontend/src/ui/nav/BottomNav.tsx` · `data-kit="tabBar"` (the `<ul>`)

Mounted once by `AppLayout`. A screen never renders it.

| Prop | Type | Meaning |
|---|---|---|
| `tabs` | `readonly NavTab[]` | `{ to, icon: TabIconKey, label, end?, owns? }` — the icon is a KEY (`'home' \| 'training' \| 'nutrition' \| 'progress' \| 'coach' \| 'admin' \| 'profile'`); the raster pair is resolved here. `badge` is deprecated and not rendered (no badges on tabs) |
| `inline` | `boolean` | specimens only: positioned in the nearest positioned ancestor instead of the viewport |
| `at` | `string` | specimens only: the pathname to answer for |
| `force` | `{ pressed?: string; focus?: string }` | specimens only: the `to` of the tab to hold pressed / focused |
| `className` | `string` | placement of the `<nav>` |

In numbers: 56 high (`--nav-h`), 36 above the edge (`--tabbar-offset` = inset + 2): y 782-838;
side inset 10 / 12 / 8 for 5 / 6 / 7 tabs (`--tabbar-inset-*`, `max()`-ed with the landscape inset):
cells 76.4 / 63 / 55.1; icon 32 (28 at seven), 2 above the label; label `tab` (Geist Medium 11 / 14,
text-2), lit: `tab-on` (SemiBold, text-1) + the lit raster; pressed: icon 60 %. The fade is a sibling
layer, 130 tall (`--fade-h`), canvas from 0 to solid over its first 28 %. The `<nav>` paints nothing.
From `lg` the same cells form a centred, content-width dock (R21). `isTabActive` is the one answer
for the lit raster, the label weight and `aria-current`.

## Layouts and routes — `app/`

- `AppLayout` (signed in): `ShellProvider tabs`, `CommandPalette`, `<main>` padded by
  `--content-pad-b` (the bar: 92), `BottomNav`. No backdrop.
- `PublicLayout` (`/login`, `/register`, `/m`, `/m/p/:publicId`, `/m/c/:handle`): a layout route
  with no path — `ShellProvider tabs={false}`, `<Outlet />`. It reads no session and
  draws no landmark.
- `router.tsx`: every page is lazy, `HomePage` and `AuthPage` included; the router's existing
  error handling is unchanged (no new error screen).

## Tokens this lane uses or adds (`tokens.css`, handed in as `pkg/F11/shared.patch`)

| Token | Value | Meaning |
|---|---|---|
| `--nav-h` | 56px (was 64) | the bar |
| `--content-pad-b` | `--nav-h` + `--tabbar-offset` (92) | what the layout pads and a full-height screen subtracts — meaning unchanged |
| `--tabbar-inset-5/6/7` | 10 / 12 / 8 px | the bar's side inset by tab count |
| `--screen-max` | 430px | the mobile column (R21) |
| `--status-bar-h` | `env(safe-area-inset-top)` | the status-bar mask |
| `--page-pad-b-bare` | `--safe-b` + 32 | a scrolling page without tabs |
| `--dock-reserve` | 0px, set at run time by `Dock` | the room a mounted dock takes |
| `--z-dock` | 45 | the dock's layer |
| (existing, F1.3) `--safe-t`, `--safe-b`, `--tabbar-offset`, `--page-pad-b`, `--fade-h`, `--dock-b`, `--dock-b-bare`, `--head-top-root`, `--head-top-push`, `--nav-fade`, `--dock-fade` | | read as declared |
