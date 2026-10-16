# Kit reference — gap lane G-shell (shell, actions and selection additions)

The kit gaps of `.pulse/prep/_kit-gaps.md` section A that belong to the shell (SH1), the actions
(A1) and the selection (SEL) lanes, plus request `R-S-auth-01` (the password reveal eye). Every
addition is ADDITIVE (ruling R6): no existing prop changes meaning, no call site has to change, and
every look that existed before emits exactly the classes it emitted before. The pages
`actions.md`, `shell.md` and `selection.md` stay the reference for everything else; this page is
the reference for what is listed here.

Numbers come from the frames' geometry export (`.pulse/geometry/<frame>.json`) — node names and
boxes are quoted with each addition. Specimens: `frontend/src/features/playground/kit/G-shell.tsx`
(rest, pressed, disabled, busy and keyboard focus where the control has them).

The API below is final. Changes after this page are additive only.

## What a screen writes

```tsx
// ── actions (control.ts / Pressable.tsx / TextLink.tsx) ─────────────────────────────────────
<Pressable variant="primary" size="sm" shape="icon" aria-label={t('workout.check')} busy={busy}><Check /></Pressable>  // the 56 x 44 icon pill
<PressableLink to="/login" variant="primary" size="lg">Belépés</PressableLink>                                // a pill that is a route
<Pressable variant="primary" size="sm" lit={false}>Save</Pressable>                                          // a pill at rest, no glow / pulse
<UnlitPills>{/* specimens drawn by components you do not write */}</UnlitPills>

<Pressable variant="link" shape="icon" glyph="field" aria-label={t('auth.showPassword')} aria-pressed={revealed}><EyeOff /></Pressable> // a field's trailing glyph
<Pressable variant="link" shape="icon" glyph="field" aria-label={t('common.delete')}><X /></Pressable>        // a row's delete cross
<Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="…"><ArrowUp /></Pressable>        // 16 pt cluster glyph
<Pressable variant="link" shape="icon" glyph="sm" tone="danger" aria-label="…"><Trash2 /></Pressable>       // 16 pt trash, full strength
<Pressable variant="link" shape="icon" glyph="sm" tone="dangerQuiet" aria-label="…"><Trash2 /></Pressable>  // 16 pt trash at 60 %

<TextLink text="body" weight="regular" tone={open ? 'default' : 'quiet'} trail={open ? <ChevronUp /> : <ChevronDown />} aria-expanded={open}>@kovacs-peter · Budapest</TextLink>
<TextLink text="body" weight="strong" onClick={rename}>Név módosítása</TextLink>
<TextLink text="data" lead={<Pic name="coin" … />} onClick={buy}>250</TextLink>

// ── shell (Screen.tsx / ScreenHeader.tsx) ───────────────────────────────────────────────────
<Screen top="root" gap="none" fill="fixed" bottom="near">…one inner block scrolls…</Screen>   // the player
<Screen top="push" gap="tight" fill="fixed">…header · rule · <ol className="min-h-0 flex-1 overflow-y-auto"> · Dock</Screen> // the conversation
<ScreenHeader kind="identity" lead={<Monogram person={p} size={28} />} name={p.displayName} handle={`@${p.handle}`} title={t('compose.title')} trailing={status} />

// ── selection (ChipRow.tsx) ─────────────────────────────────────────────────────────────────
<ChipRow label={t('library.muscles')} role="radiogroup" scroll="bleed">{chips}</ChipRow>
```

## `control()` / `Pressable` — new axes

| Axis | Values | What it draws | Frame |
|---|---|---|---|
| `shape: 'icon'` on `variant: 'primary'`, `size: 'sm' \| 'lg'` | — | the icon pill: 56 wide, 44 (sm) or 56 (lg) high, radius full, ONE glyph 24 pt at stroke 2.5, the lamp fill, the glow and the resting pulse; pressed / disabled / busy exactly as the pill. `data-kit="btnPrimary"` | workout-1 `Button/primary · Kész` 322,497 56 x 44 r 28, glyph 338,507 24 |
| `lit` | `true` (default) / `false` | `false`: the glow layer is not drawn, so neither glow nor resting pulse. The fill, label and every state stay | style-studio-1/-2 row stages (`effects = []`) |
| `glyph` (`link` + `shape: 'icon'`) | `m` (default) / `sm` / `field` | `m` 24 pt centred (today) · `sm` 16 pt centred (stroke 1.75 on the 24 grid = 1.17 drawn) · `field` 20 pt in `text-2`, the glyph box against the frame's right edge (1 past it, as the frames draw it; a cross `lucide-x`, whose ink sits 4 inside its box, hangs 4 past it — so the INK ends on the edge for both, as in the frames) | `sm`: plan-editor-1/-2 `Button/Nap törlése` 350,351 44 x 44, glyph 364,365 16 · `field`: auth-1/-2 `Button/reveal` 334,550 44 x 44, glyph 359,562 20; nutrition-1/-2 `Button/delete`, `Button/clear` 334 44 x 44, glyph 362 20; client-detail-2 `Button/delete` |
| `tone` (`link`) | + `quiet` / `faint` / `dangerQuiet` | `quiet` = `text-2`, `faint` = `text-3`, `dangerQuiet` = danger ink with the glyph at 60 % (a danger word stays at 100 %). On a `field` glyph a danger tone wins over its `text-2` | plan-editor-2: arrows / disclosure `#858c79` (text-3); trash `#f87171` at op 1 and op 0.6 |
| `weight` (`link`) | `medium` (default) / `regular` / `strong` | by type role: `body` + `regular` = `body` (Regular 16 / 22), `body` + `strong` = `body-b` (SemiBold 16 / 22), `cap` + `regular` = `cap`, `cap` + `strong` = SemiBold 13 / 18 | compose-profile-1 `Button/identity line` Geist Regular 16/22; compose-profile-2 `Link/Név módosítása` SemiBold 16/22 |
| `text` (`link`) | + `data` | Geist Mono Medium 16 / 20 (`data-l`), 6 between the lead and the figure. The lead can be an image: it is never recoloured | coins-1 `Button/price` 323,511 55 x 44: coin 20 at 323, "250" at 349 |

`kitName()` names the icon pill `btnPrimary` (it is the pill). Nothing else changes name.

### `PressableLink` — `Pressable.tsx` · `data-kit` as `Pressable`

A control that navigates, in any `Pressable` look: the router's `<Link>` with `control()` classes and
the same inside (`ControlBody`). Props: every `control()` axis, `to` and the router `Link` props,
`icon`, `trail`, `disabled`, `className` (placement only). `disabled` makes the anchor inert
(`aria-disabled`, `tabIndex -1`, the click swallowed) and draws the disabled look (the pill: `surface-2`
fill, `text-3` label, no glow). There is no busy state: a navigation does not wait. Use `TextLink to`
for a link look — it is the same thing with the link's API.

### `UnlitPills` — `Pressable.tsx`

A context provider: every pill inside it is drawn as `lit={false}` unless the pill says `lit` itself.
For specimens drawn by components the page does not write (the style studio's `Demo` renders
`FeedbackButton` → `Pressable`). Never around a screen's real action.

## `TextLink` — new props

`text?: 'cap' | 'body' | 'data'`, `tone?: 'default' | 'danger' | 'quiet' | 'faint' | 'dangerQuiet'`,
`weight?: 'regular' | 'medium' | 'strong'` — the `control()` axes above, on all three forms (route,
href, button). `weight` is ignored with `text="data"` (a figure is Mono Medium).

## `Screen` — `fill="fixed"` and `bottom`

| Prop | Values | What it does |
|---|---|---|
| `fill` | `false` / `true` / **`'fixed'`** | `'fixed'`: the height IS the viewport minus the bar (`calc(var(--viewport-h) - var(--content-pad-b))`; `var(--viewport-h)` without tabs) and never grows: `overflow-y: clip`, every direct child `min-h-0`. Put `min-h-0 flex-1 overflow-y-auto` on the ONE block that scrolls. The offline strip already shrinks `--viewport-h`, so the column follows it. |
| `bottom` | `'page'` (default) / **`'near'`** | the air under the last block above the bar: 48 (today) or 28 — workout-1/-2: the switcher and the rest band end at y 754, the bar starts at 782. Without tabs: the home indicator + 28. A mounted `Dock` adds its reserve to both. |

The arithmetic at 402 x 874 with tabs: the column is 874 - 92 = 782 tall; `top="root"` puts the first
block at 72; `bottom="near"` leaves 28; so the blocks share 782 - 72 - 28 = 682.

## `ScreenHeader kind="identity"`

```ts
{ kind: 'identity'; lead?: ReactNode; name: ReactNode; handle?: ReactNode; title: ReactNode;
  trailing?: ReactNode; children?: ReactNode; titleId?: string; className?: string }
```

compose-hub-1 / -2: `Header` 24,64 354 x 82 → `Identity` row 24,64 354 x 44: `Monogram/KP` ink
24,70 25 x 22 · 12 · name 61,75 (`body-m`, `text-1`) · 8 · handle 168,78 (`cap`, `text-2`) — one
baseline at y 92 — the trailing control (`Button/profile status · Élő` 331,65 47 x 44) centred in the
row; 4 under the row the display title (`text-display`, the `h1`) at 24,112. `Screen top="push"`.
The handle truncates first; the name does not shrink. `data-kit="screenHead"`, `data-kind="identity"`,
the name group `data-part="identity"`.

## `ChipRow scroll` — the rail

| Prop | Values | What it does |
|---|---|---|
| `scroll` | `false` (default) / `true` / `'bleed'` | `true`: `scroll-snap-type: x proximity`, each chip snaps with its WORD on the gutter, and the line follows the chosen chip (rule below). `'bleed'`: also runs past the right gutter to the screen edge (`-mr-6`, `-mr-4` under 376 pt) and keeps that gutter as air at its end. Ignored with `wrap`. |

The follow rule (library-3): when the chosen chip changes — a tap, or the muscle map choosing one —
and its word is not inside [left gutter, right gutter], the line scrolls to the smallest chip
boundary (a word on the left gutter) at which the chosen word ends inside the right gutter; a chosen
word left of the view is brought to the left gutter. A chosen chip already in view scrolls nothing.
Smooth, instant under reduced motion. The chosen chip is the one with `aria-pressed="true"` or
`aria-checked="true"` (what `Chip` writes). library-3: back side, "Széles hátizom" chosen → the line
scrolls 135, "Tricepsz" on the gutter, the chosen word at x 175-290.

## Not in this lane (named so nobody waits for it)

- The workout exercise switcher's second look (count ABOVE the name, ink mark, 32 apart,
  `aria-current`): that face is `Segment`'s (`ui/feedback/variants/E6Segmented.tsx`, lane SEL) —
  `_kit-gaps.md` item 7 allows it to stay local on the `Segment` face; a `ChipRow scroll` rail with
  `Chip`s is the lime-mark single-select only.
- The SearchField's own clear cross belongs to SearchField (F12 stage 2).
