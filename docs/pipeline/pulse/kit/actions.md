# Kit reference — actions (lane A1, package F6, the keystone)

Pulse has exactly two action looks — the lime pill and the text link — plus the bare icon button,
which is the link's look in a square. All three are `control()`; `Pressable` is the `<button>`,
`TextLink` is the link that can also be an anchor.

Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §2.3, §2.4, §4 (rows "Primary pill",
"Secondary action", "Destructive action"). Construction: `figma-build/app-kit.js` 196-209
(`btnPrimary`, `textLink`, `iconBtn`). Measured boxes: `_components.json`, cells `btnPrimary`,
`textLink`, `iconBtn`. Specimen: `frontend/src/features/playground/kit/actions.tsx`.

The API below is final. Changes after this page are additive only (R6).

## What a screen writes

```tsx
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';

// the ONE primary action of a screen — kit: btnPrimary
<Pressable variant="primary" size="lg" onClick={start}>Indítás</Pressable>                 // 56 high, hugs its label
<Pressable variant="primary" size="lg" className="w-full" type="submit" busy={saving}>Mentés</Pressable>  // docked / full width
<Pressable variant="primary" size="sm">Küldés</Pressable>                                  // 44 high: beside a 44 pt field

// every other action — kit: textLink
<TextLink to="/nutrition" trail={<ChevronRight />}>Megnyitás</TextLink>                    // inline (cap-m), a route
<TextLink text="body" onClick={skip}>Kihagyás</TextLink>                                   // standalone (body-m), an action
<TextLink text="body" tone="danger" onClick={askLogout}>Kijelentkezés</TextLink>           // destructive: danger TEXT
<TextLink lead={<X />} onClick={clear}>Szűrők törlése</TextLink>
<TextLink onClick={retry} busy={retrying}>Újra</TextLink>

// a glyph that is an action — kit: iconBtn
<Pressable variant="link" shape="icon" aria-label={t('common.close')} onClick={close}><X /></Pressable>
```

Rules that are not negotiable (Pulse System §1, §4):

1. **One pill per screen.** The second action is a `TextLink`. No outlined button, no lime icon button.
2. **Destructive = `tone="danger"` text**, confirmed in a bottom sheet (confirm = danger link,
   cancel = plain link, no pill in that sheet). There is no filled red anywhere.
3. **`size` is written at every Pulse pill.** A `variant="primary"` without `size` is today's 44 px
   button with today's 13 px label and is counted by `check:pulse` (rule `pill-size`).
4. **Keep 20 px clear around a pill** — the glow is 20 px wide and an `overflow: hidden` ancestor cuts it.
5. **`className` is placement only** (`w-full`, `self-start`, `ml-auto`, `shrink-0`). Never a colour,
   a size, a radius or a padding.

## `control()` — `frontend/src/ui/primitives/control.ts`

`control(props): string` — the class list. `ControlVariants` is its prop type. Use it directly only
where the element cannot be `Pressable` or `TextLink` (a `<label>`, a `<summary>`); a route is
`<TextLink to>`.

| Prop | Values | Default | Meaning |
|---|---|---|---|
| `variant` | `'primary'` · `'link'` · bridge: `'secondary'` `'ghost'` `'danger'` | `'secondary'` (bridge — always name the variant) | the look |
| `size` | `'md'` · `'lg'` · `'sm'` | `'md'` | height: 44 (legacy metrics) · 56 (the Pulse pill) · 44 (the small Pulse pill). `lg` / `sm` also give a `primary` its Pulse padding (24), gap (6) and label (`body-b`) |
| `shape` | `'button'` · `'icon'` · bridge: `'chip'` `'field'` | `'button'` | `icon` = a 44 × 44 square; with `variant: 'link'` it is the bare glyph |
| `tone` | `'default'` · `'danger'` | — | `link` only: danger text |
| `text` | `'cap'` · `'body'` | `cap` | `link` only: `cap-m` 13 / 18 (inline) or `body-m` 16 / 22 (standalone) |
| `selected`, `density` | bridge | — | legacy chip wash and legacy padding / type. Not for new code |

`kitName({ variant, shape, size })` returns the `data-kit` name of that combination
(`'btnPrimary' | 'textLink' | 'iconBtn' | undefined`). `chip()` (status chip tones) is bridge.

### The three looks, in numbers

| | Pill `primary` + `lg` / `sm` | Link `link` | Icon `link` + `icon` |
|---|---|---|---|
| Box | 56 / 44 high, radius full, padding 0 24, min width 44 | 44 high, as wide as its content, no padding | 44 × 44 |
| Content | `body-b` 16 / 22 SemiBold, `accent-fg` (#0B0D0A); gap 6 | `cap-m` 13 / 18 or `body-m` 16 / 22 Medium, `text-1`; glyphs 16 px stroke 1.75 `text-2`, gap 4 | glyph 24 px, stroke 1.75, `text-1` |
| Rest | `accent` fill + the glow (`--shadow-glow`) | — | — |
| Pressed | `accent-pressed`, glow off, scale 0.98, in `--duration-instant` | opacity 60 % (`--pressed-opacity`) | opacity 60 % |
| Disabled | `surface-2` fill, `text-3` label, no glow | opacity 40 % (`--disabled-opacity`) | opacity 40 % |
| Busy | lamp stays on, no glow, three 6 pt dots (100 / 60 / 30 %) in place of the label | three dots in the link's ink, full opacity | three dots |
| Keyboard focus | 2 px `--focus-ring` (lime) outline, 2 px off the box | the same line on the link's `::before`: the 44 pt frame widened by 8 either side, radius 4 (on the element it would touch the first and last letter) | 2 px off the 44 × 44 box, round |
| Danger | — | `danger` text; a lead glyph takes the danger colour, the trail stays `text-2` | — |

- **Glow**: its own layer (`::before`), so it can breathe. On `lg` / `sm` it does: opacity
  100 → 65 → 100 % on `--duration-ambient`, alternate, starting `--delay-rest` (1.5 s) after the
  pill appears — the "resting pulse". A `md` primary has the still glow only. Reduced motion: the
  loop goes, the glow stays.
- **Busy dots** ripple left to right on `--duration-ambient` (opacity only). Their first frame is
  exactly the drawn 100 / 60 / 30 %. Reduced motion: the still drawing.
- **Hit floor**: a link's frame hugs its words ("Újra" is 25 pt wide), so the link carries an
  invisible layer, centred, at least 44 wide and 44 high. The target is 44 × 44; the layout box is not.
- **No hover look.** Pulse is drawn for a finger; the pointer gets `cursor: pointer`.
- A glyph inside a link or an icon button is sized and stroked by the recipe (16 / 24 px, 1.75):
  pass a bare Lucide icon, `<ChevronRight />`, with no size class.

### Bridge — unchanged, and going away

`secondary` (bordered button), `ghost` (hover wash), `danger` (filled red), `selected`,
`shape: 'chip' | 'field'`, `density` and `chip()` render exactly what they rendered before F6:
the same class set, so the same pixels and the same 44 px geometry. They are counted by
`check:pulse` (`legacy-variant`, `pressable-no-variant`, `legacy-chip-call`) and deleted in the
closing cleanup. Their Pulse heirs: `secondary` / `ghost` → `TextLink`; `danger` →
`TextLink tone="danger"` + a confirm sheet; a selected chip → `ChipRow` (F8).

What F6 did change for a `primary` that is still `md` (every unmigrated screen): pressed and
disabled now follow Pulse (glow off and scale 0.98 on press; `surface-2` + `text-3` when disabled,
where it used to be the lime at 45 %), the pointer hover (`accent-hover`) is gone, the glow moved
from the pill's own shadow to its `::before` layer (same two shadows, same pixels at rest), and
busy is three dots instead of a spinner — on every variant. Height, padding and type did not move.
Measured: of the 600 combinations of `variant` × `shape` × `density` × `selected` × `size: md`,
the 480 that are not `primary` emit the class set of `pulse-redesign` before F6 plus ONE class,
`focus-visible:outline-solid`; the 120 `primary` ones differ only in that class and the state
classes listed here.

**The keyboard focus ring was invisible on every control before F6, and is drawn now.** Tailwind
4's `outline-none` sets `--tw-outline-style: none`, and `focus-visible:outline-2` draws with
`outline-style: var(--tw-outline-style)` — a ring with a width, a colour and no style (both rules
are in the built CSS of 0860942; a Tab-focused control computed `outline-style: none`; the global
`:focus-visible` rule of `index.css` is in `@layer base` and loses to any utility).
`focus-visible:outline-solid` in the base of the recipe repairs it for every look, bridged ones
included: a keyboard user now sees a 2 px lime ring, 2 px off the box, on every `Pressable`. That is
the one visible change F6 makes on an unmigrated screen besides the `primary` states, and only under
keyboard focus. The same defect sits in 19 other files that pair `outline-none` with
`focus-visible:outline-*` (their lanes own them).

## `Pressable` — `frontend/src/ui/primitives/Pressable.tsx`

The `<button>`. `data-kit`: `btnPrimary` (primary + `lg` / `sm`), `textLink` (link), `iconBtn`
(link + icon); none on a bridged look. A `data-kit` passed by the caller wins.

| Prop | Type | Default | Meaning |
|---|---|---|---|
| …`ControlVariants` | | | `variant`, `size`, `shape`, `tone`, `text` (+ bridge `selected`, `density`) |
| `busy` | `boolean` | `false` | three dots, `aria-busy`, and the button is `disabled` — it cannot fire twice. The box keeps its size |
| `icon` | `ReactNode` | — | leading glyph. On a link: 16 px, `text-2` (danger colour on a danger link) |
| `trail` | `ReactNode` | — | trailing glyph. On a link: 16 px, `text-2` |
| `type` | button types | `'button'` | never submits a form by accident — write `type="submit"` |
| `className` | `string` | — | placement only |
| …every `<button>` attribute | | | `disabled`, `onClick`, `aria-*`, `role`, `ref`, … |

An icon button needs an accessible name: `aria-label`. A `BadgeCount` (F8) goes inside it as a
child and positions itself; the button is `position: relative`. The board puts the badge's LEFT
edge at 26 and its top at 0 of the 44 × 44 frame, and a wide count grows to the right, out of the
frame ("99+" is 31 wide: 26 → 57) — `_components.json` `Badge/count`, `app-kit.js` 209.

`ControlBody` (same file) is the inside of a control — lead, label, trail, busy dots — for the
rare element that wears `control()` and is neither `Pressable` nor `TextLink`.

`ANCHOR_DISABLED_PILL` (exported by `control.ts`, applied by `PressableLink` only): the disabled pill on an
anchor, keyed on `aria-disabled` because an anchor cannot be `disabled`. A button never gets it (a busy pill is
`aria-busy` + `disabled`).

## `TextLink` — `frontend/src/ui/primitives/TextLink.tsx` · `data-kit="textLink"`

One look, three elements, chosen by what the link DOES:

| You pass | It renders | For |
|---|---|---|
| `to` | the router's `<Link>` (an anchor) | a route of the app. All `Link` props pass through (`replace`, `state`, `reloadDocument`, …) |
| `href` | `<a>` | a download, `mailto:`, an external page (`target`, `rel`, `download` pass through) |
| neither | `<button>` via `Pressable` | an action (`onClick`, `type`, `busy`) |

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `text` | `'cap' \| 'body'` | `'cap'` | inline (`cap-m`: a section head's "Megnyitás ›", a notice line's "Újra") or standalone (`body-m`: under a pill, in a confirm sheet, in an empty state) |
| `tone` | `'default' \| 'danger'` | `'default'` | danger text |
| `lead` / `trail` | `ReactNode` | — | a bare Lucide icon |
| `disabled` | `boolean` | `false` | button: disabled. Anchor forms: inert, out of the tab order, `aria-disabled="true"`, 40 % |
| `busy` | `boolean` | `false` | button form only |
| `className` | `string` | — | placement only |

In a section head the link's 44 pt frame is taller than the 20 pt head: the structure lane's
`SectionHeader` places it (the frame overflows the row symmetrically; the words sit on the
eyebrow's baseline). A screen does not correct that with margins.

## Tokens this lane added (`tokens.css`, block `lane:F6`, handed in as `pkg/F6/shared.patch`)

| Token / utility | Value | Used by |
|---|---|---|
| `--delay-rest` | 1500 ms | the start delay of the resting pulse |
| `animate-pulse-rest` | `pulse-glow` on `--duration-ambient`, alternate, after `--delay-rest` | the glow layer of a `lg` / `sm` pill |
| `animate-busy-1` / `-2` / `-3` | `busy-dot` (opacity 100 → 30 → 100 %) on `--duration-ambient`, the 2nd and 3rd started mid-cycle | the three busy dots |

Tokens it reads: `--control-h` (44), `--control-h-primary` (56), `--target-min`, `--accent`,
`--accent-fg`, `--accent-pressed`, `--shadow-glow`, `--surface-2`, `--text-1/2/3`, `--danger`,
`--focus-ring`, `--pressed-opacity`, `--disabled-opacity`, `--duration-instant`, `--ease-standard`.

## For the kit specimen and for captures only

`features/playground/kit/actions.tsx` exports `specimens: KitSpecimen[]` (`{ kit, label, node,
gap? }`) and a default component. `gap` is the board's label-to-nodes gap of that cell (12 when
absent, 24 in the pill cells) — a host that lays the cells out as `app-components.body.js` does
reads it.

`data-force="pressed"` and `data-force="focus"` on a `primary` or `link` control show the pressed
look and the focus ring without a finger or a keyboard — the recipe answers to them with the same
declarations as `:active` and `:focus-visible`. Nothing in the product sets the attribute.
