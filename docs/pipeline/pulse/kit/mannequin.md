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
  The focus ring on a region: see stage 1 below (two-tone, every panel of the region).
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

## Stage 1 — the inside of the box (done; fix round 1 applied)

Nothing a screen wrote changes: the props, the box, `FIGURE_BOX` and `musclesOnSide` are as above.
What is inside the box:

- **The render.** `<Pic slot="figure-front | figure-back">` stretched over the box (its 585 x 1236
  pixels are the 597 x 1261 canvas scaled by 0.98; the ratio differs by 0.03 %). Its `sizes` follow
  the box's measured width. Note: the box carries `data-kit="pic"` and so does the `<img>` inside it
  (Pic always does) — same rectangle, two nodes.
- **The regions.** One SVG over it, `viewBox="0 0 597 1261"`, with the paths of `regions.ts`
  (generated; 22 regions = 12 front + 10 back for the 19 slugs — neck, forearms and calves are on
  both sides). They were traced on the renders themselves: `docs/pipeline/pulse/pkg/F15/trace/`.
  `build.py` cuts each render into its panels with a seeded watershed on the groove lines
  (`panels.py`, two cuts: "groove" — the local-mean darkness, used where stage 1's outlines held — and
  "ridge" — the Hessian ridge of the luminance plus a seed in every panel, used for the arms, the
  back and the back of the legs); a region is a union of panels, closed over the grooves inside one
  muscle (the forearm's two strips, the triceps' heads), opened and smoothed. Two-sided regions
  traced on the ridge cut keep only what both sides agree on (the mask AND its mirror image about
  x = 297.75), so a one-sided leak over a faint groove cannot survive and the two sides match
  (`symmetry.json`: every pair within 1 % except the delts' anatomical split, 3-7 %). For chest, the
  shoulder cap, quads and lats the outline is the lime of the baked lit render the frames were made
  from; the five groove-less muscles are cut out by anatomy — the cap split into front / side delt,
  the front of the neck (the throat column between the two sternocleidomastoid lines), adductors,
  abductors (the hip panel above the quads, ending on their top edge). The masters stay outside
  the repository.
- **One cap, two muscles.** The render draws the front and the side delt as ONE shoulder-cap panel.
  `regions.ts` gives both `group: 'cap'` and the whole cap as `panel`: lighting either delt (or both)
  paints the whole cap, at the strongest role either has — what exercise-detail-1 draws for a press
  whose data names only the side delt. Each delt keeps its own path as its button and hit area; the
  two paths share one edge (overlap 0.1 units², was 214 per side).
- **Unlit** = the plain render: the path is there (hit area) and paints nothing; hover (pointer
  devices) shows a 30 % accent hint.
- **Primary / selected** = solid `--accent` panel + bloom: the panel blurred twice, a tight and a
  wide halo, summed and held under a ceiling — `bloom: [s1, k1, s2, k2, ceiling]` per region — and
  drawn in accent under it: SVG `feGaussianBlur` x 2 + `feComposite` (arithmetic) +
  `feComponentTransfer` (an alpha table: identity up to the ceiling, flat above). The ceiling is
  what keeps the sternum: between the two pectorals the two halves' halos add up, and without it
  they reached full accent and closed the groove. The sternum itself is the region's **seam**
  (`seam` in `regions.ts`, chest only): where the two written pectorals come within 8 canvas px of
  each other, the gap between them is painted as the accent darkened to 0.78 (accent, then the
  canvas colour at 22 % over it), because that is what the frames draw there — a darker lime line
  about 4 device px wide, (156-168, 195-213, 35-38), not the grey render; above and below, where the
  panels part, the groove opens into the dark render as in the frames. Chest and lats were fitted on the FRAMES
  (`trace/sim.py` draws the map offline at the frames' device size and reports the capture's
  numbers; `search` over the halo against library-2 / exercise-detail-1 and library-3 / workout-1),
  quads on its lit render. Over the solid fill lies the **imprint**: the render clipped to the panel,
  turned into black with alpha rising as its luminance falls under 0.3 (at most 5 %), so the
  render's grooves show through the lime faintly, as in the frames, while the panel's face keeps
  the token. No blend mode anywhere, no raster per muscle.
- **Secondary** = the render itself, clipped to the panel and recoloured by one `feColorMatrix`
  built from `--accent` (accent x (0.438 + 0.428 x luminance)), so the shading shows through as in
  `figure-front-press`. No bloom (the press render has none around the cap).
- **Buttons.** With `onSelect`, every region is ONE button and one tab stop: its first closed
  panel carries `role="button"`, `tabIndex=0`, Enter / Space, `aria-pressed`, `aria-label` =
  `muscle.<slug>`; its other panels (the right pectoral, …) are further hit areas of the same muscle
  — clickable, `tabIndex=-1`, `aria-hidden`. So a screen reader announces each muscle once (12 tab
  stops on the front, 10 on the back), and a pointer or a tool aiming at the middle of the button
  lands on muscle, never on the gap between two halves. Focus-visible: every panel of the focused
  region outlined, two-tone — a 2 px ink stroke over a 4.5 px `--surface-0` edge, non-scaling — on
  an unlit and a lit panel alike, so a focused muscle never looks selected. Read-only: no
  interactive element at all.
- **Legacy column** (`chips` / `segmented`, what the three screens still mount until their
  packages): the same figure; in `fill` mode it is laid over an empty SVG with the canvas viewBox
  that takes exactly the place the vector drawing took.
- Deleted: `shapes.ts`, `landmarks.ts`. `figure.ts` reads the slugs from `regions.ts`.

Evidence (built app, `pulse-verify`): `.pulse/pairs/F15s1/r1/` after fix round 1 (the stage-1
originals one level up) — pairs against library-1..3,
exercise-detail-1..2, workout-1..2 (app | frame | 50 % overlay | lit pixels), zoomed lit areas,
several-at-once, the contact sheet of all 22 regions lit one by one, the keyboard focus
(`focus-tab-onto-mell.png`), the sternum close-ups (`sternum-*.png`: app | frame) and
`regions-outlined.png` (every region outlined on both renders). Fix round 1 numbers (lit IoU against
the frame): library-2 0.979, library-3 0.962, exercise-detail-2 0.962, workout-1 / -2 0.958,
exercise-detail-1 0.943 (the secondary cap's highlight along its top edge passes the lit threshold
where the frame's does not); sternum gap 4 device px over the whole chest, as the frames. Numbers in `pairs.json` / `iou.json`
/ `symmetry.json`.

Still open for the owner: the regions without a lit reference — above all the five groove-less ones
(front / side delt split, neck front, adductors, abductors) — need his sign-off on the contact sheet;
and the cap rule above (either delt lights the whole cap) is the review's proposed default, his to
confirm.

## Not in stage 0 (history)

`regions.ts`, the render inside the box, the lit halo, deleting `shapes.ts` / `landmarks.ts`, the
`--muscle-*` tokens, the region gate and the IoU regression picture — all stage 1 (PLAN 5.2 row 11).
