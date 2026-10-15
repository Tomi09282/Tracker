# Kit reference — mannequin (lane M1, package F15)

The figure of the muscle selector, exercise detail and the workout player. ONE component,
`MuscleMap` (`frontend/src/ui/muscle-map/MuscleMap.tsx`); screens keep mounting it (R17) and its
props only ever grow. Stage 0 (this page) adds what lets a screen lay the figure out the way the
frames do: the side controlled from outside, no built-in side control, and the figure in a fixed
597 : 1261 box. Stage 1 (own track, Q1 (a)) swaps the INSIDE of that box — the vector drawing
becomes the neutral render with SVG regions over it — and changes nothing a screen wrote against
this page.

Source of the rules: PLAN.md 3.4 row "M1 mannequin", R17, owner answer Q1. Construction in the
Figma file: there is no mannequin function in `figma-build/app-kit.js`; the frames place the
figure as a `pic` (`figma-build/app/library-1.body.js` — "the six figure-* stills share one
597 × 1261 canvas: head top 5.9 %, soles 94.4 %, hands 12 – 87 % of the width" — `workout-1.body.js`,
`exercise-detail-1.body.js`), and the component board shows it in the `pic` cell ("… / the
mannequin", `_components.json` nodes `80:291`, `80:292`, 95 × 200 and 91 × 200).
Specimen: `frontend/src/ui/muscle-map/specimens.tsx` (see "Specimen" below).

The API below is final for stage 0. Changes after this page are additive only (R6).

## What a screen writes

```tsx
import { MuscleMap } from '../../ui/muscle-map/MuscleMap';
import { FIGURE_BOX, musclesOnSide, type MuscleSide } from '../../ui/muscle-map/figure';

const [side, setSide] = useState<MuscleSide>('front');   // every screen opens on the front (Screens/*.md)

// the screen's own switch — kit segSwitch (F8's Segmented), drawn where the frame puts it
<Segmented options={…'muscleMap.front' / 'muscleMap.back'…} value={side} onChange={setSide} label={t('muscleMap.viewLabel')} />

// selector (library-1..3): 195 × 411, head on the stage top, right hand on the content edge
<MuscleMap
  sideControl="none"
  side={side}
  selected={muscle}
  onSelect={(slug) => setMuscle((cur) => (cur === slug ? undefined : slug))}
  className="absolute right-[-24px] top-[-24px] w-[195px]"   /* placement + ONE dimension only */
/>

// read-only (exercise-detail-1/2: 189 × 400 · workout-1/2: 105 × 221)
<MuscleMap sideControl="none" side={side} highlights={highlights} className="h-[221px]" />

// what the map no longer prints in this mode, drawn by the screen:
const offSide = Object.keys(highlights).filter((slug) => !musclesOnSide(side).includes(slug));
{offSide.length > 0 && <p>{t('muscleMap.alsoOnOtherSide', { side: … })}</p>}   // exercise detail only
// the legend "Fő célizom / Segédizom" (muscleMap.primary / .secondary) — workout only
```

The placement numbers in the example are the frames' (`library-1`: the figure at x 207, y 128,
195 × 411 against a stage at x 24, y 152; `workout-1`: x 287, y 111, 105 × 221 against a hero at
y 116; `exercise-detail-1`: x 213, y 264, 189 × 400). Use `FIGURE_BOX` to derive them instead of
re-measuring: the head is `FIGURE_BOX.headTop` of the box height below the box top, the soles
`FIGURE_BOX.soles`, the hands `FIGURE_BOX.handLeft` / `handRight` of the width.

## `MuscleMap` — props

| Prop | Values | Default | Meaning |
|---|---|---|---|
| `highlights` | `Record<slug, 'primary' \| 'secondary'>` | `{}` | lit regions: full accent / the weaker step |
| `onSelect` | `(slug) => void` | — | given: every region is a button (`role="button"`, `tabIndex=0`, Enter / Space, `aria-pressed`, `aria-label` = `muscle.<slug>`). Not given: read-only, no interactive attribute at all |
| `selected` | slug | — | the pressed region (lit, `aria-pressed="true"`) |
| `sideControl` | `'chips'` · `'segmented'` · **`'none'`** | `'chips'` | **`none` (new)**: the screen draws the switch, the legend and the other-side note; the map renders the figure ALONE, and its root element is the fixed box. `chips` / `segmented`: the legacy column (control, figure, note, legend), unchanged |
| **`side`** (new) | `'front'` · `'back'` | — (uncontrolled) | controlled side. Omitted: the map keeps its own state and starts on the front — every call site written before Pulse |
| **`onSideChange`** (new) | `(side) => void` | — | called when the map's OWN control (`chips` / `segmented`) asks for the other side, controlled or not; not called for a tap on the side already shown |
| `fill` | boolean | `false` | legacy column only: height-constrained figure in a hero. Ignored with `sideControl="none"` (the box is sized by its `className`) |
| `legend` | boolean | `true` | legacy column only. Ignored with `sideControl="none"` (the screen draws the legend) |
| `className` | string | — | with `sideControl="none"`: placement and ONE size (`w-[195px]` or `h-[221px]`); never both, never a colour |

### The fixed box (`sideControl="none"`)

```html
<div data-kit="pic" data-side="front" class="relative shrink-0 …className" style="aspect-ratio: 597 / 1261">
  <svg role="img" aria-labelledby="…" class="absolute inset-0 size-full" viewBox="…">…</svg>
</div>
```

- **The box is the contract.** 597 : 1261 is the canvas of every figure still, and the body sits on
  it at fixed fractions (`FIGURE_BOX`). Stage 1 puts the render (`<Pic slot="figure-front | back">`,
  585 × 1236 = the same ratio) and an SVG overlay in the image's own pixel space into this same box,
  so a screen laid out against the box today does not move then.
- Stage 0 draws the existing vector figure inside it, scaled so that its skull is on
  `FIGURE_BOX.headTop` and its soles on `FIGURE_BOX.soles` (the stage top and the table rule the
  frames hang the figure on), centred across. Measured on the built app: the drawing's ink is
  88.5 % of the box height at every size (353 / 354 px at 200 pt, 726 / 727.5 at 411, 707 / 708 at
  400, 391 / 391.2 at 221 — device px at scale 2), head on the 5.9 % line. Its arms reach wider than
  the render's (≈ 88 % of the box width against 75 %): visible, accepted until stage 1 — the box
  does not change.
- `data-kit="pic"`: the Figma kit draws the mannequin as a `pic`, and the capture tool's geometry
  probe maps the frames' `Image/figure-…` layers (workout, exercise detail) to `data-kit="pic"`.
- Accessibility is the map's, unchanged: `role="img"` named by `muscleMap.frontTitle` /
  `backTitle`; regions as above. The documented 44 pt exception holds (regions are smaller; the
  screen's chip row is the accessible path — `MuscleMap.tsx`, the comment above the component).
  The focus ring on a region is the stroke `--focus-ring`, 3 wide, on `:focus-visible`.
- No motion of its own beyond the region fill transition (`--duration-base`, off under reduced
  motion, as before).

## `figure.ts` — what a screen lays out with

| Export | Type | Meaning |
|---|---|---|
| `MuscleSide` | `'front' \| 'back'` | the two views (also re-exported by `MuscleMap.tsx`) |
| `FIGURE_BOX` | `{ width: 597, height: 1261, headTop: 0.059, soles: 0.944, handLeft: 0.12, handRight: 0.87 }` | the canvas and where the body sits on it (fractions) |
| `musclesOnSide(side)` | `readonly string[]` | the slugs that have a region on that side, in drawing order. For the other-side note (a highlighted slug not in the list is on the other side) and for a chip row scoped to the visible side. `full-body` is on neither side |

## Specimen

`frontend/src/ui/muscle-map/specimens.tsx` — `specimens` (one entry per cell) and a default
component. Cells: the mannequin row of the component board (front / back, 200 tall); the selector
at 195 × 411 (rest, selected "Mell", keyboard focus by Tab); read-only at 189 × 400 (Mell primary,
Oldalsó vállizom secondary) and 105 × 221 (back, lats); the controlled side (one state, the map's
own control asks, the boxed figure follows). The map has no disabled and no busy state.

The kit host collects `features/playground/kit/*.tsx`, a folder this lane does not own; the
one-line `features/playground/kit/mannequin.tsx` that lists this file is a request to the
integrator (`pkg/F15/requests/`).

## Not in stage 0

`regions.ts`, the render inside the box, the lit halo, deleting `shapes.ts` / `landmarks.ts`, the
`--muscle-*` tokens, the region gate and the IoU regression picture — all stage 1 (PLAN 5.2 row 11).
