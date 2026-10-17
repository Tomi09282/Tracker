"""Fit of the bloom of a lit panel on the baked lit renders (fix round 1).

    python -I docs/pipeline/pulse/pkg/F15/trace/bloom.py

The app draws a lit panel as solid accent over a bloom: the panel blurred twice and drawn in
accent, alpha = min(ceiling, k1 * blur(s1) + k2 * blur(s2)). Stage 1 fitted (s1, k1, s2, k2)
without the ceiling; between the two pectorals the summed blooms then reach alpha ~1 and the
sternum groove disappears, which the frames keep as a dark line. With the ceiling the near halo
can be strong where it is alone (the frames' 2-4 px) and still never close a groove between two
panels of the same muscle.

Observed alpha outside the panel: the lit render is the neutral one with the accent laid over it,
so per pixel a = (GB_lit - GB_neutral) / (GB_accent - GB_neutral), GB = green minus blue (the
channel difference the accent has most of and the graphite none). Fitted in canvas px over the
ring 1-30 px outside the panel, every distance band weighted alike (so the many far pixels do not
outvote the few near ones), the sternum gap included for the chest.
"""
from __future__ import annotations

import itertools
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F401,F403
import build  # noqa: E402

GB_ACCENT = 255.0 - 46.0  # the token #CBFF2E


def observed(key: str):
    side, rel = LIT[key]
    lit = load_rgb(rel)
    neu = load_rgb(NEUTRAL[side])
    gb_l = lit[..., 1] - lit[..., 2]
    gb_n = neu[..., 1] - neu[..., 2]
    spec = next(r for r in build.REGIONS if r.get('lit') == key)
    panel = gb_l > spec.get('t', 150)
    panel = ndi.binary_opening(panel, iterations=1)
    within = np.zeros(panel.shape, bool)
    from PIL import ImageDraw

    for poly in spec['within']:
        im = Image.new('L', (W, H), 0)
        ImageDraw.Draw(im).polygon(poly, fill=1)
        within |= np.asarray(im).astype(bool)
    lab, n = ndi.label(panel & within)
    sizes = ndi.sum(lab > 0, lab, range(1, n + 1))
    panel = ndi.binary_fill_holes(np.isin(lab, 1 + np.where(sizes >= 400)[0]))
    # other lime in the picture (a secondary region) is not this panel's bloom
    other = ndi.binary_dilation((gb_l > 60) & ~ndi.binary_dilation(panel, iterations=40), iterations=4)
    a = np.clip((gb_l - gb_n) / np.maximum(GB_ACCENT - gb_n, 1), 0, 1)
    d = ndi.distance_transform_edt(~panel)
    return panel, a, d, other


def model(panel, s1, k1, s2, k2, c):
    p = panel.astype(float)
    return np.minimum(c, k1 * ndi.gaussian_filter(p, s1) + k2 * ndi.gaussian_filter(p, s2))


def fit(key):
    panel, a, d, other = observed(key)
    ring = (d >= 1) & (d <= 30) & ~other
    bands = np.clip(np.round(d), 1, 30).astype(int)
    w = np.zeros_like(d)
    for b in range(1, 31):
        sel = ring & (bands == b)
        if sel.any():
            w[sel] = 1.0 / sel.sum()
    best = None
    blurs = {}
    for s in (3, 4, 5, 6, 7, 8, 10, 14, 18, 22, 26, 30):
        blurs[s] = ndi.gaussian_filter(panel.astype(float), s)
    for s1, s2 in itertools.product((3, 4, 5, 6, 7, 8), (10, 14, 18, 22, 26, 30)):
        b1, b2 = blurs[s1][ring], blurs[s2][ring]
        y, ww = a[ring], w[ring]
        for c in (0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 1.0):
            # least squares for k1, k2 with the ceiling: a few fixed-point rounds on the unclamped set
            k = np.array([1.0, 0.4])
            for _ in range(4):
                pred = k[0] * b1 + k[1] * b2
                free = pred < c
                A = np.vstack([b1[free], b2[free]]).T * np.sqrt(ww[free])[:, None]
                k = np.linalg.lstsq(A, y[free] * np.sqrt(ww[free]), rcond=None)[0]
                k = np.clip(k, 0, 4)
            pred = np.minimum(c, k[0] * b1 + k[1] * b2)
            err = float(np.sqrt((ww * (pred - y) ** 2).sum() / ww.sum()))
            if best is None or err < best[0]:
                best = (err, s1, round(float(k[0]), 2), s2, round(float(k[1]), 2), c)
    return best, panel, a, d


def profile(a, d, panel, dists=(3, 6, 12, 18, 24, 36)):
    return [round(float(np.median(a[(d > r - 0.5) & (d <= r + 0.5)])), 3) for r in dists]


if __name__ == '__main__':
    out = {}
    for key in ('chest', 'lats', 'quads'):
        best, panel, a, d = fit(key)
        err, s1, k1, s2, k2, c = best
        m = model(panel, s1, k1, s2, k2, c)
        out[key] = dict(bloom=[s1, k1, s2, k2, c], rmsAlpha=round(err, 4), observed=profile(a, d, panel), model=profile(m, d, panel))
        print(key, json.dumps(out[key]))
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bloom.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
