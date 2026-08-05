---
type: ux-concept
title: Muscle map
updated: 2026-08-04
tags: [ux, muscle-map, f1]
---

# Muscle map

A hand-built SVG figure, not a licensed anatomical asset — the shapes must be addressable one
muscle at a time, keyed by the same slugs `muscle_groups` uses, and filled from theme tokens.
A downloaded illustration gives none of those.

## Shape

- `frontend/src/ui/muscle-map/shapes.ts` — geometry, symmetrical about x=100 in a 200×420 box.
  Paired muscles are two paths sharing one slug, so highlighting "biceps" lights both arms.
- `frontend/src/ui/muscle-map/MuscleMap.tsx` — the component. Front/back toggle.

## Both directions (owner requirement 21)

- **Read**: the exercise detail screen passes `highlights` (slug → role) and the map shows what
  the exercise targets.
- **Write**: the library screen passes `onSelect` and the same component becomes a filter —
  tapping a muscle narrows the list, tapping again clears it.

## Rules

- Primary target = full accent, secondary = 12% subtle, idle = surface-2. That distinction is
  the point: "works your chest, and incidentally your triceps" is information a chip list
  conveys far less directly.
- Every region is a real `role="button"` with `tabIndex=0` and Enter/Space handling. An SVG
  shape with only an `onClick` is unreachable by keyboard.
- The fill is a plain style with a CSS transition, NOT a JS animation: the highlight IS the
  information, so it must be correct even where no animation frame runs.
- A highlighted muscle on the other view is called out in text, or the map would look broken
  when nothing lights up.

## Not built

Gender and body-type variants, and 3D rotation — explicitly deferred as later upgrades.


## Rebuild, 2026-08-05 — the figure was rejected on sight

The owner's verdict on the first figure was that it was badly skewed and needed far more detail.
It was correct. What was actually wrong, measured rather than guessed:

- **10.9 heads tall.** The head was 46 units against a 502-unit body. That is not a stylisation,
  it is a stretched stick figure. The canon is 8. Fixed by making HEAD the unit the whole layout
  derives from — every landmark is now `TOP + n × HEAD`.
- **The arms had no axis.** Both edges were measured from the body centre, so the arm's inner edge
  fell inside the ribcage and arm and torso fused into one blob.
- **The legs had no axis either, and it was worse.** The knee measured ELEVEN units wide on a
  figure with a 136-unit shoulder span, and both legs sat almost on the centre line.
- **The head was one continuous outline with the neck and jaw**, so any error anywhere deformed
  all three — which is why it rendered as a martini glass.
- **Two muscles were unusable slivers**: adductors 6.7 units, abs 13.2.

### What replaced it

`landmarks.ts` holds the skeleton: an 8-head vertical canon, half-widths measured from the centre
line, and separate axes for the arm and the leg. Nothing in `shapes.ts` carries its own
coordinates — a muscle cannot sit in the wrong place because it references the same ribcage and
hip crease the silhouette uses.

Symmetry is arithmetic, not typing. `mirror()` reflects a path about the centre line and **throws
on a relative command**, because a mirror that is quietly off by one segment is invisible until
someone looks at a rendered body and says it is skewed — which is exactly how this started.
Measured symmetry error after the rebuild: **0.00 on all three limb pairs.**

Silhouette is 8 parts (head, neck, torso ×2, arm ×2, leg ×2) rather than one path, so a part that
is wrong is obvious on its own.

Verified: 8.02 heads tall, 24 front / 20 back muscle shapes, **0 shapes outside the body outline**
in either view, no horizontal overflow.

### The 44 px exception, stated so it is not "fixed" later

Widest region ≈ 33 px at the component's 280 px width; narrowest ≈ 9 px. Twelve anatomically
placed regions cannot each be 44 px without a metre-tall figure. The map is therefore a SECONDARY
affordance and is never the only path: on the library screen it sits in a collapsed `<details>`
and the taxonomy chips below it do the same filtering at full target size; the exercise detail
screen passes no `onSelect` at all. If the map ever becomes the only way to pick a muscle, the fix
is to restore the chip row — not to inflate these regions.

### Not a cut-out image, and why

Asked whether a picture from the web could be traced instead. No, for three reasons: a bitmap
cannot take a per-muscle fill from a theme token, cannot be addressed one slug at a time, and an
anatomy plate of unknown provenance has no place in a bundle whose one third-party dataset is
carefully attributed under CC-BY-SA.


### Internal segmentation — where the detail actually came from

The figure still read as flat after the proportions were fixed, and the reason was not a missing
muscle: it was that every muscle was ONE undifferentiated blob.

`MuscleShape.d` is already an array and every path in it takes the same fill, so a muscle can be
several shapes while remaining one slug — it lights as a unit and reports as a unit. Split:

  - rectus abdominis → three segments per side, divided at the tendinous inscriptions;
  - quadriceps → vastus lateralis, rectus femoris, vastus medialis;
  - pectoralis major → clavicular head above the sternal mass;
  - gastrocnemius → lateral and medial heads.

Front view went from 24 shapes to 34, back from 20 to 22. The gaps between segments carry as much
of the reading as the segments do.

An earlier note in this file argued against segmenting the abdominals because the pieces would be
"four-pixel slivers". That was an assumption about size, and it was wrong: the column measures 73
units tall, so a third of it renders at roughly 26 px. Measure before deciding something is too
small to draw.

Final audit, both views: **0 shapes outside the body outline, symmetry error 0.00, no horizontal
overflow.**


### Overlap between different slugs is a functional bug, not a cosmetic one

Two shapes with DIFFERENT slugs occupying the same pixels means a click there selects whichever
was painted last. The user gets the wrong muscle and nothing indicates it.

Bounding boxes are useless for finding this — a curved muscle's box contains a lot of area it does
not fill, so a box test reports overlaps that are not there and misses ones that are. The measure
that works is **point sampling**: take a grid inside shape A, keep the points `isPointInFill`
confirms are really inside A, then ask B how many of those it also contains. That gives a true
percentage.

What it found, none of which was visible by eye:

| pair | before | after |
|---|---|---|
| neck ∩ traps (back) | **42%** | 0 |
| abs ∩ chest | 18% | 0 |
| abs ∩ obliques | 16% | 0 |

The worst was the back view reusing the **sternocleidomastoid** — a front-of-neck muscle — for the
back. Wrong anatomically and wrong functionally at the same time. It now has its own shape: the
strip between the skull and where the trapezius begins.

Two overlaps remain and are kept deliberately: **front-delt ∩ chest at 9%** and **traps ∩ lats at
10–11%**. Those muscles genuinely run over one another at their junction; a boundary a few units
wide where a click could go either way is anatomy, not a defect. The threshold this check is worth
acting on is around 12%.

A trap worth recording separately: a `sed` pass over the obliques silently matched nothing, because
an earlier edit had already changed the text it was looking for. The abdominal edits in the same
batch applied and the oblique ones did not, so the overlap went 13% → 16% and looked like the fix
had made things worse. It had not been applied at all. **A batch edit that reports success without
reporting WHICH replacements landed is a batch edit that will lie to you.**
