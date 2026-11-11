"""F15 stage 1 — trace the 22 muscle regions of the two neutral renders and write regions.ts.

    python -I docs/pipeline/pulse/pkg/F15/trace/build.py [--debug <dir>]

1. `panels.segment` cuts each neutral render into its panels along the render's own grooves
   (seeded watershed, see panels.py).
2. A region is a union of panels. Where a baked LIT render exists for the muscle (chest, the
   shoulder cap, quads, lats — the renders the frames were made from) the outline is taken from
   that render's lime pixels instead, restricted to the same panels.
3. The five muscles the render has no panel of their own for — the front and side delts (one
   shared cap), the front of the neck, the adductors, the abductors — are cut out of the panel
   that contains them along the anatomical lines given below (CUTS).
4. Each mask is smoothed by a fraction of a canvas pixel, traced (marching squares) and
   simplified (Ramer-Douglas-Peucker, 0.3 canvas px), and written as SVG path data in the
   597 x 1261 canvas — the coordinate space of the render and of `FIGURE_BOX`.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import *  # noqa: E402,F401,F403
import panels  # noqa: E402
from vector import loops_to_path, mask_to_loops  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
OUT_TS = os.path.join(REPO, 'frontend', 'src', 'ui', 'muscle-map', 'regions.ts')
MX = panels.MX
#: The bloom of a lit panel: the panel blurred twice and drawn in full accent under it, a tight
#: halo plus a wide one, alpha = k1 * blur(s1) + k2 * blur(s2) (clamped at 1). Fitted per lit
#: render on the lime of the ring 1-40 canvas px outside the panel (least squares over the
#: G - B channel difference, the composite simulated on the neutral render): mean error 11.4 /
#: 7.6 / 12.2 of 255. A single blur fits the near edge or the tail, never both. Regions without a
#: lit render take a middle value. Format: (s1, k1, s2, k2, ceiling), deviations in canvas px.
#: The ceiling caps the summed alpha: the chest's 0.62 (fix round 1, sim.py on library-2 /
#: exercise-detail-1) keeps a continuous 4 device px sternum groove between the two pectorals,
#: as the frames draw it, with the near glow at the frames' strength (2 / 4 / 8 px out).
BLOOM = {'chest': (6, 0.7, 26, 0.8, 0.62), 'lats': (5, 1.2, 14, 0.5, 0.8), 'quads': (8, 1.0, 30, 0.3, 0.8)}
BLOOM_DEFAULT = (6, 0.8, 22, 0.5, 0.65)
INSET = 1.0
#: THE SEAM between the two pectorals. In library-2 / exercise-detail-1 the sternum groove is not
#: grey: it is the accent darkened, (160, 201, 36) at its centre = accent x 0.79, about 4 device px
#: wide, from where the two panels come within SEAM_MAX canvas px of each other; above and below
#: that, where the panels part, the groove opens into the dark render. Written as `seam` (the gap
#: between the two written subpaths, row by row, where it is at most SEAM_MAX wide).
SEAM_MAX = 8.0
OPEN = 2.0


#: the mirror axis of the renders' panels, fitted on the groove maps (correlation of the ridge
#: response with its mirror image, best at x = 595.5 / 2: 0.80 front, 0.79 back)
MX_FIT = 595.5


def mirror_mask(m: np.ndarray) -> np.ndarray:
    """A work-resolution mask mirrored about MX_FIT / 2."""
    yy, xx = np.mgrid[0 : m.shape[0], 0 : m.shape[1]]
    src = MX_FIT * S - xx - 1
    return ndi.map_coordinates(m.astype(np.float32), [yy, src], order=1, cval=0) > 0.5


def mirror_poly(poly):
    return [(MX - x, y) for x, y in poly]


def both(poly):
    return [poly, mirror_poly(poly)]


# ── the region list: drawing order = the roster order of the old map (shapes.ts) ───────────────
#   panels : watershed panels whose union is the region
#   lit    : take the outline from the lime pixels of this baked render (LIT key)
#   clip   : keep only the part inside these polygons (canvas coords; `both` mirrors one half)
#   cut    : remove the part inside these polygons
CAP = both([(138, 250), (228, 250), (214, 300), (194, 333), (168, 356), (132, 372)])

#: the forearm ends on the wrist groove (y ~ 598); the hand is no muscle of the roster
WRIST = both([(30, 430), (215, 430), (215, 597), (30, 597)])

#: the back of the elbow: the V of grooves over the olecranon, read on the ridge map
ELBOW_V = [(100, 430), (115, 432), (126, 451), (148, 470), (154, 466), (173, 445), (186, 438), (215, 438)]
ABOVE_ELBOW = both([(100, 300), (215, 300)] + ELBOW_V[::-1])
BELOW_ELBOW = both(ELBOW_V + [(215, 597), (30, 597), (30, 430)])

REGIONS = [
    # front
    dict(side='front', slug='neck', panels=['neck', 'x.head'], smooth=2.0,
         # the front of the neck: the throat column under the jaw line, its sides along the two
         # sternocleidomastoid lines that meet in the clavicles' notch; the slopes towards the
         # shoulders are trapezius and stay unlit. The chin's shadow (cut into the head panel)
         # belongs to it, so the top follows the jaw instead of dipping under the chin.
         clip=both([(297.5, 207), (286, 207.5), (277, 211), (271, 220), (269, 234), (272, 248), (279, 260), (288, 269), (297.5, 275)])),
    # the sternum groove stays a darker line in the lit render (G - B ~160 against ~207 on the
    # panels): a higher threshold keeps the two pectorals apart, as the frames draw them
    dict(side='front', slug='chest', panels=['chest'], lit='chest', t=185,
         # the sternum: a groove 6.5 canvas px wide between the two pectorals (4 device px at 195 pt,
         # as library-2 draws it); the lime threshold alone leaves 5.5 and the bloom then closes it
         cut=[[(294.5, 250), (301.0, 250), (301.0, 400), (294.5, 400)]],
         # ... and the groove itself, where it is that narrow, is drawn lit as the frames draw it:
         # a darker lime line (`seam`), not the grey render (fix round 1, review finding 1)
         seam=SEAM_MAX,
         within=both([(297.5, 252), (200, 252), (192, 300), (205, 400), (297.5, 400)])),
    dict(side='front', slug='front-delts', panels=['cap'], lit='cap', part='front-delt', within=CAP),
    dict(side='front', slug='side-delts', panels=['cap'], lit='cap', part='side-delt', within=CAP),
    dict(side='front', slug='biceps', panels=['biceps'], seg='ridge', sym='or'),
    # both strips of the forearm and the groove between them, on both arms alike
    dict(side='front', slug='forearms', panels=['forearms'], seg='ridge', bridge=3, sym=True, clip=WRIST),
    dict(side='front', slug='abs', panels=['abs'], minus=['chest'],
         clip=both([(297.5, 372), (244, 376), (238, 600), (297.5, 600)])),
    dict(side='front', slug='obliques', panels=['obliques', 'x.side'],
         # the side strip has no groove between the obliques and the serratus under the armpit:
         # the obliques start under the lower edge of the pectoral
         clip=both([(250, 384), (226, 392), (200, 418), (196, 470), (200, 560), (250, 600), (252, 450)])),
    dict(side='front', slug='quads', panels=['quads'], lit='quads',
         within=both([(180, 600), (297.5, 600), (297.5, 880), (180, 880)])),
    # the inner thigh from the groin crease down along the quads' medial edge (no groove of its own)
    dict(side='front', slug='adductors', panels=['x.thigh-med', 'x.groin', 'quads'], minus=['quads'],
         clip=both([(254, 610), (268, 620), (284, 634), (294, 650), (293, 700), (286, 760), (277, 800), (268, 790), (262, 700), (255, 645)])),
    # the hip's front-side panel above the quads (tensor fasciae latae / gluteus medius): it ends
    # on the quads' top edge, nothing of it runs down the thigh
    dict(side='front', slug='abductors', panels=['x.hip', 'quads', 'x.thigh-lat'], minus=['quads', 'obliques'], smooth=2.0,
         clip=both([(196, 545), (214, 545), (232, 566), (238, 590), (234, 604), (214, 606), (196, 604), (192, 590)])),
    dict(side='front', slug='calves', panels=['calves'], sym=True),
    # back
    dict(side='back', slug='neck', panels=['neck']),
    dict(side='back', slug='traps', panels=['traps'], minus=['neck', 'lats'],
         # the kite ends where the two scapular borders meet the spine
         clip=both([(297.5, 170), (200, 170), (200, 300), (250, 330), (285, 425), (297.5, 432)])),
    dict(side='back', slug='rear-delts', panels=['rear-delts'], seg='ridge', bridge=4, open=3, sym=True),
    dict(side='back', slug='lats', panels=['lats'], lit='lats', close=4,
         within=both([(180, 320), (297.5, 320), (297.5, 560), (180, 560)])),
    # the three heads and the grooves between them, down to the elbow's V
    dict(side='back', slug='triceps', panels=['triceps'], seg='ridge', bridge=3, open=2.5, sym=True, clip=ABOVE_ELBOW),
    # from the elbow's V (the olecranon diamond included) to the wrist
    dict(side='back', slug='forearms', panels=['forearms', 'x.elbow'], seg='ridge', bridge=3, sym=True, clip=BELOW_ELBOW),
    dict(side='back', slug='lower-back', panels=['lower-back', 'lats', 'traps'], minus=['lats', 'traps'],
         clip=both([(297.5, 415), (283, 418), (262, 468), (236, 512), (250, 540), (297.5, 568)])),
    dict(side='back', slug='glutes', panels=['glutes'], seg='ridge', bridge=2, open=3, sym=True, smooth=1.2, minus=['lower-back'],
         # the cleft: the two glutes are two panels
         cut=[[(296.0, 540), (299.5, 540), (299.5, 700), (296.0, 700)]],
         clip=both([(188, 512), (297.5, 512), (297.5, 656), (285, 665), (260, 671), (230, 671), (208, 665), (195, 652), (188, 630)])),  # down to the gluteal fold
    # the column between the lateral thigh strip and the inner (adductor) strip, from the gluteal
    # fold down to the V groove above the knee: the knee-pit diamond between the two tendons is
    # part of the column, so its lower edges are the column's V-shaped end
    dict(side='back', slug='hamstrings', panels=['hamstrings', 'x.knee'], seg='ridge', bridge=4, open=3, smooth=2.4, sym=True,
         clip=both([(180, 668), (297.5, 668), (297.5, 846), (270, 846), (252, 849), (231, 862), (212, 851), (180, 850)])),
    dict(side='back', slug='calves', panels=['calves'],
         # the gastrocnemius' two heads end on the render's diagonal groove; below it the Achilles
         clip=both([(186, 850), (272, 850), (272, 1024), (247, 1024), (226, 993), (186, 998)])),
]

#: The split of the one shoulder cap into the front and the side deltoid (the render draws one
#: panel): the line runs from the top of the cap, where the clavicle groove meets it, down to the
#: tip of the cap above the biceps — the anterior third is the front delt, the rest the side delt.
DELT_SPLIT = [(191, 258), (181, 300), (172, 335), (163, 356)]
#: the opening of the front delt's sliver: its lower end forked round a dark notch of the cap
DELT_OPEN = 2.0


def lime_mask(key: str, primary: bool = True, close: float = 0, t: float = 150) -> np.ndarray:
    side, rel = LIT[key]
    rgb = up(load_rgb(rel), order=1)
    lim = rgb[..., 1] - rgb[..., 2]
    if primary:
        # the solid panel; a closing bridges the faint groove imprint some panels carry near
        # their edge (the left lat), which would otherwise cut a sliver off
        m = ndi.binary_opening(lim > t, disk(1.5 * S))
        if not close:
            return m
        pad = int(3 * close * S)
        return ndi.binary_closing(np.pad(m, pad), disk(close * S))[pad:-pad, pad:-pad]
    prim = ndi.binary_opening(lim > 150, disk(1.5 * S))
    return ndi.binary_opening((lim > 70) & ~ndi.binary_dilation(prim, disk(3 * S)), disk(2 * S))


def seam_mask(loops, shape, wmax: float) -> np.ndarray:
    """The groove between the two written subpaths of a mirrored region, row by row, where the
    two panels come within `wmax` canvas px of each other on the centre line."""
    written = np.zeros(shape, bool)
    for lp in loops:
        written ^= polygon_mask([tuple(p) for p in lp], shape)
    mid = int(round(MX / 2 * S))
    reach = int(12 * S)
    out = np.zeros(shape, bool)
    for y in range(shape[0]):
        row = written[y, mid - reach : mid + reach]
        left = np.nonzero(row[:reach])[0]
        right = np.nonzero(row[reach:])[0]
        if not len(left) or not len(right):
            continue
        a, b = left.max() + 1, reach + right.min()
        if 0 < b - a <= wmax * S:
            out[y, mid - reach + a : mid - reach + b] = True
    # half a canvas px under each panel, so no hairline of render shows at the anti-aliased edges
    return ndi.binary_dilation(out, np.ones((1, int(S)), bool))


def build(debug_dir=None):
    cuts = {}

    def seg(side, mode):
        if (side, mode) not in cuts:
            cuts[(side, mode)] = panels.segment(side, mode)
        return cuts[(side, mode)]

    out = {}
    masks = {}
    panel_masks = {}
    # the lit regions first: the traced ones may be cut against them (`minus`)
    order = sorted(range(len(REGIONS)), key=lambda i: (not REGIONS[i].get('lit'), i))
    for i in order:
        spec = REGIONS[i]
        side = spec['side']
        labels, names, lum, body = seg(side, spec.get('seg', 'groove'))
        want = [names.index(n) + 1 for n in spec['panels']]
        m = np.isin(labels, want)
        if 'clip' in spec:
            clip = np.zeros_like(m)
            for poly in spec['clip']:
                clip |= polygon_mask(poly, m.shape)
            m &= clip
        if spec.get('lit'):
            key = spec['lit']
            lm = lime_mask(key, primary=(key != 'cap'), close=spec.get('close', 0), t=spec.get('t', 150))
            within = np.zeros_like(lm)
            for poly in spec['within']:
                within |= polygon_mask(poly, lm.shape)
            lm &= within
            lab, n = ndi.label(lm)
            if n:
                sizes = ndi.sum(lm, lab, range(1, n + 1))
                lm = np.isin(lab, 1 + np.where(sizes >= 400 * S * S)[0])
            m = ndi.binary_fill_holes(lm)
        else:
            if spec.get('bridge'):
                # one muscle drawn as several panels (the forearm's two strips, the triceps' heads):
                # the closing takes the grooves between them into the region
                pad = int(3 * spec['bridge'] * S)
                m = ndi.binary_closing(np.pad(m, pad), disk(spec['bridge'] * S))[pad:-pad, pad:-pad]
            # The lit renders stop the lime about one canvas pixel short of the groove centre (the
            # groove stays a dark line between two lit panels): measured on the right pectoral, the
            # groove-traced panel matches the lime best (IoU 0.955) inset by 1.0 px.
            m = ndi.binary_erosion(m, disk(INSET * S))
            # watershed fronts that met without a groove leave slivers and steps: open them away
            m = ndi.binary_opening(m, disk(spec.get('open', OPEN) * S))
        if spec.get('sym') == 'or':
            # The two sides agree, the other way: a notch one side's panel has and the other's
            # has not (the inner top of the left biceps, where the torso's shadow meets the arm)
            # is filled from the mirror image; the body mask below still bounds it.
            m |= mirror_mask(m)
        elif spec.get('sym'):
            # The two sides agree: a flood that ran over a faint groove on one side only (the
            # lateral thigh strip on the left, the inner thigh on the right) is a leak, and the
            # mirror image of the other side's panel takes it back out. The silhouette first: where
            # one side's shading drops into the canvas (the right armpit), the other side follows.
            m &= body
            m &= mirror_mask(m)
            m = ndi.binary_opening(m, disk(spec.get('open', OPEN) * S))
        for poly in spec.get('cut', []):
            m &= ~polygon_mask(poly, m.shape)
        if spec.get('part'):
            line = DELT_SPLIT
            medial = np.zeros_like(m)
            for half in (line, mirror_poly(line)):
                far = MX / 2
                poly = list(half) + [(far, half[-1][1] + 40), (far, half[0][1] - 40)]
                medial |= polygon_mask(poly, m.shape)
            cap = m
            front = ndi.binary_opening(cap & medial, disk(DELT_OPEN * S))
            # one shared edge, no overlap: the side delt is the rest of the cap. The lit cap is
            # drawn as ONE panel (`panel`), so the split never shows as a seam across it.
            if spec['part'] == 'front-delt':
                m = front
            else:
                # the rest of the cap, cut along the front delt's PATH as written (rasterised and
                # grown by half a canvas px), so the two hit areas meet without overlapping
                written = panel_masks[(side, 'front-delt-path')]
                m = ndi.binary_opening(cap & ~ndi.binary_dilation(written, disk(0.5 * S)), disk(0.5 * S))
            panel_masks[(side, 'cap')] = cap
        for other in spec.get('minus', []):
            m &= ~ndi.binary_dilation(masks[(side, other)], disk(1.5 * S))
        if not spec.get('lit'):
            # (a lit panel keeps its lime even where it runs over the neutral render's deepest
            # shadow, as the left lat does: that is what the frames show)
            m &= body
        masks[(side, spec['slug'])] = m
        loops = mask_to_loops(m, S, sigma=spec.get('smooth', 0.6 if spec.get('lit') else 1.6) * S, eps=0.3, min_area=200)
        out[i] = dict(side=side, slug=spec['slug'], d=loops_to_path(loops), loops=[l.tolist() for l in loops])
        if spec.get('seam'):
            sm = seam_mask(loops, m.shape, spec['seam'])
            seam_loops = mask_to_loops(sm, S, sigma=0.4 * S, eps=0.3, min_area=20)
            out[i].update(seam=loops_to_path(seam_loops), seam_loops=[l.tolist() for l in seam_loops])
            masks[(side, spec['slug'] + '-seam')] = sm
        if spec.get('part') == 'front-delt':
            written = np.zeros_like(m)
            for lp in loops:
                written ^= polygon_mask([tuple(p) for p in lp], m.shape)
            panel_masks[(side, 'front-delt-path')] = written
        if spec.get('part'):
            # what is drawn when either delt is lit: the render's one cap panel, whole
            cap_loops = mask_to_loops(panel_masks[(side, 'cap')], S, sigma=0.6 * S, eps=0.3, min_area=200)
            out[i].update(group='cap', panel=loops_to_path(cap_loops), panel_loops=[l.tolist() for l in cap_loops])
        print(f"{side:5} {spec['slug']:12} px={int(m.sum() / S / S):6d} loops={len(loops)} pts={sum(len(l) for l in loops)}")
    return [out[i] for i in range(len(REGIONS))], masks, cuts


def write_ts(regions):
    lines = [
        '/*',
        ' * GENERATED by docs/pipeline/pulse/pkg/F15/trace/build.py — do not edit by hand; re-run the tracer.',
        ' *',
        ' * The 22 muscle regions of the two Pulse figure renders (`figure-front` / `figure-back`), traced',
        ' * on the renders themselves: each outline follows the dark groove lines between the render\'s',
        ' * panels (and, for chest, the shoulder cap, quads and lats, the lime pixels of the baked lit',
        ' * renders the frames were made from). Coordinates are the 597 x 1261 canvas every figure still',
        ' * shares (`FIGURE_BOX`), so the paths sit on the render with a viewBox of `0 0 597 1261`.',
        ' */',
        "import type { MuscleSide } from './figure';",
        '',
        'export interface MuscleRegion {',
        '  slug: string;',
        '  /** SVG path data in canvas units; one closed subpath per panel (both sides of the body). */',
        '  d: string;',
        '  /**',
        '   * The bloom: two blurs of the panel, `[s1, k1, s2, k2, ceiling]` (deviations in canvas units,',
        '   * strengths, and the most the summed halo may reach, so it never closes the groove between two',
        '   * panels of one muscle, as the sternum between the pectorals).',
        '   */',
        '  bloom: readonly [number, number, number, number, number];',
        '  /**',
        '   * Regions that share ONE panel of the render (the front and the side delt on the shoulder cap):',
        '   * lit, the group is drawn once as `panel`, at the strongest role any member has; each member',
        '   * keeps its own `d` as its button and hit area.',
        '   */',
        "  group?: 'cap';",
        '  /** The panel drawn when the region is lit, where it differs from the hit area `d`. */',
        '  panel?: string;',
        '  /**',
        '   * The groove between two panels of one lit muscle where the frames draw it as a darker lime',
        '   * line (the sternum between the pectorals): painted as the accent darkened when the region',
        '   * is primary. Never a hit area.',
        '   */',
        '  seam?: string;',
        '}',
        '',
        '/** Drawing order per side; also the order a keyboard walks the regions. */',
        'export const REGIONS: Record<MuscleSide, readonly MuscleRegion[]> = {',
    ]
    for side in ('front', 'back'):
        lines.append(f'  {side}: [')
        for r in regions:
            if r['side'] == side:
                bloom = ', '.join(str(v) for v in BLOOM.get(r['slug'], BLOOM_DEFAULT))
                extra = f", group: '{r['group']}', panel: '{r['panel']}'" if r.get('group') else ''
                if r.get('seam'):
                    extra += f", seam: '{r['seam']}'"
                lines.append(f"    {{ slug: '{r['slug']}', bloom: [{bloom}]{extra}, d: '{r['d']}' }},")
        lines.append('  ],')
    lines.append('};')
    lines.append('')
    with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines))


if __name__ == '__main__':
    regions, masks, seg = build()
    write_ts(regions)
    dbg = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
    if dbg:
        np.save(os.path.join(dbg, 'masks.npy'), {f'{k[0]}:{k[1]}': v for k, v in masks.items()}, allow_pickle=True)
        with open(os.path.join(dbg, 'regions.json'), 'w') as fh:
            json.dump([{k: v for k, v in r.items() if k != 'd'} for r in regions], fh)
    print('wrote', OUT_TS)
