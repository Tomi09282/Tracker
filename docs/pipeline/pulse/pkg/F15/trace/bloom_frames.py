"""Fit of the bloom on the FRAMES themselves (fix round 1), for the two lit muscles they draw.

    python -I docs/pipeline/pulse/pkg/F15/trace/bloom_frames.py

The review measured the frames' glow 10-30 % stronger near the panel than the app's, which was
fitted on the baked lit renders (bloom.py): the frames are what the owner approved, so chest and
lats are fitted on them. Per frame: the figure layer's box (geometry, scale 2), the neutral render
resized into it (what the app draws), the frame's lime panel (G - B > 150, holes filled), and the
observed alpha a = (GB_frame - GB_neutral) / (GB_accent - GB_neutral) on the ring 1-40 device px
outside the panel, every distance band weighted alike. The model is the app's filter at that
size: alpha = min(c, k1 * blur(s1) + k2 * blur(s2)), deviations in canvas units scaled to device
px by box width / 597.
"""
from __future__ import annotations

import itertools
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F401,F403
import pairs  # noqa: E402

GB_ACCENT = 255.0 - 46.0
FITS = {'chest': ['library-2', 'exercise-detail-1'], 'lats': ['library-3', 'workout-1']}


def load(frame: str, side: str):
    x0, y0, x1, y1 = (int(round(v)) for v in pairs.frame_box(frame))
    fr = np.asarray(Image.open(os.path.join(pairs.FRAMES, f'{frame}@2x.png')).convert('RGB').crop((x0, y0, x1, y1))).astype(float)
    neu_img = Image.open(os.path.join(SRC, NEUTRAL[side])).convert('RGBA').resize((x1 - x0, y1 - y0), Image.LANCZOS)
    # the render as the app shows it: laid on the canvas colour
    bg = Image.new('RGBA', neu_img.size, (11, 13, 10, 255))
    neu = np.asarray(Image.alpha_composite(bg, neu_img).convert('RGB')).astype(float)
    gb_f = fr[..., 1] - fr[..., 2]
    gb_n = neu[..., 1] - neu[..., 2]
    panel = ndi.binary_fill_holes(ndi.binary_opening(gb_f > 150, iterations=1))
    lab, n = ndi.label(panel)
    sizes = ndi.sum(panel, lab, range(1, n + 1))
    panel = np.isin(lab, 1 + np.where(sizes >= 300)[0])
    # a secondary region (the cap of exercise-detail-1) is not this panel's bloom
    other = ndi.binary_dilation((gb_f > 60) & ~ndi.binary_dilation(panel, iterations=45), iterations=5)
    a = np.clip((gb_f - gb_n) / np.maximum(GB_ACCENT - gb_n, 1), 0, 1)
    d = ndi.distance_transform_edt(~panel)
    scale = (x1 - x0) / W
    return dict(panel=panel, a=a, d=d, other=other, scale=scale)


def prepared(data):
    ring = (data['d'] >= 1) & (data['d'] <= 40) & ~data['other']
    bands = np.clip(np.round(data['d']), 1, 40).astype(int)
    w = np.zeros(data['d'].shape)
    for b in range(1, 41):
        sel = ring & (bands == b)
        if sel.any():
            # the near halo is what the eye reads as "glow": bands up to 12 px count double
            w[sel] = (2.0 if b <= 12 else 1.0) / sel.sum()
    return ring, w


def fit(frames):
    data = [load(f, 'front' if f in ('library-2', 'exercise-detail-1') else 'back') for f in frames]
    preps = [prepared(dd) for dd in data]
    best = None
    S1 = (2, 3, 4, 5, 6, 7, 8)
    S2 = (9, 11, 13, 16, 20, 24, 28, 32)
    cache = {}
    for i, dd in enumerate(data):
        for s in S1 + S2:
            cache[(i, s)] = ndi.gaussian_filter(dd['panel'].astype(float), s * dd['scale'])[preps[i][0]]
    for s1, s2 in itertools.product(S1, S2):
        b1 = np.concatenate([cache[(i, s1)] for i in range(len(data))])
        b2 = np.concatenate([cache[(i, s2)] for i in range(len(data))])
        y = np.concatenate([dd['a'][p[0]] for dd, p in zip(data, preps)])
        ww = np.concatenate([p[1][p[0]] for p in preps])
        for c in (0.5, 0.55, 0.58, 0.6, 0.62, 0.65, 0.7, 0.75, 0.8, 1.0):
            k = np.array([1.0, 0.4])
            for _ in range(5):
                pred = k[0] * b1 + k[1] * b2
                free = pred < c
                A = np.vstack([b1[free], b2[free]]).T * np.sqrt(ww[free])[:, None]
                k = np.clip(np.linalg.lstsq(A, y[free] * np.sqrt(ww[free]), rcond=None)[0], 0, 4)
            pred = np.minimum(c, k[0] * b1 + k[1] * b2)
            err = float(np.sqrt((ww * (pred - y) ** 2).sum() / ww.sum()))
            if best is None or err < best[0]:
                best = (err, s1, round(float(k[0]), 2), s2, round(float(k[1]), 2), c)
    return best, data


def profile(a, d, dists=(2, 4, 8, 12, 16, 24)):
    return [round(float(np.median(a[(d > r - 0.5) & (d <= r + 0.5)])) * GB_ACCENT, 1) for r in dists]


if __name__ == '__main__':
    out = {}
    for key, frames in FITS.items():
        best, data = fit(frames)
        err, s1, k1, s2, k2, c = best
        out[key] = dict(bloom=[s1, k1, s2, k2, c], rmsAlpha=round(err, 4), frames={})
        for f, dd in zip(frames, data):
            p = dd['panel'].astype(float)
            m = np.minimum(c, k1 * ndi.gaussian_filter(p, s1 * dd['scale']) + k2 * ndi.gaussian_filter(p, s2 * dd['scale']))
            out[key]['frames'][f] = dict(observedGB=profile(dd['a'], dd['d']), modelGB=profile(m, dd['d']))
        print(key, json.dumps(out[key]))
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bloom-frames.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
