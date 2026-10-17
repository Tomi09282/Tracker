"""An offline stand-in for the built map, to tune the bloom before a build (fix round 1).

    python -I docs/pipeline/pulse/pkg/F15/trace/sim.py [s1 k1 s2 k2 c  (chest)]  [s1 k1 s2 k2 c (lats)]

Draws what MuscleMap draws for a lit region — the shipped render (WebP) in the frame's box, the
bloom min(c, k1 * blur(s1) + k2 * blur(s2)) of the region's paths in accent, the solid accent
panel — at the frame's device size, and reports the numbers pairs.py reports on a capture (lit
IoU, the G - B profile at 2 / 4 / 8 / 12 / 16 / 24 device px from the lit edge) plus the sternum
gap (rows through the chest: how many px between the pectorals stay under green 205). Only a
proxy: the capture is the proof.
"""
from __future__ import annotations

import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pairs  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
TS = os.path.join(REPO, 'frontend', 'src', 'ui', 'muscle-map', 'regions.ts')
IMG = os.path.join(REPO, 'frontend', 'src', 'assets', 'pulse', 'img')
ACCENT = np.array([203.0, 255.0, 46.0])
CANVAS = np.array([11.0, 13.0, 10.0])
W, H = 597, 1261


def regions():
    out = {}
    side = None
    for line in open(TS, encoding='utf-8'):
        m = re.match(r'\s+(front|back): \[', line)
        if m:
            side = m.group(1)
        m = re.search(r"slug: '([^']+)'.*?d: '([^']+)'", line)
        if m and side:
            out[(side, m.group(1))] = m.group(2)
    return out


def raster(d: str, w: int, h: int, ss: int = 4) -> np.ndarray:
    im = Image.new('L', (w * ss, h * ss), 0)
    dr = ImageDraw.Draw(im)
    for sub in re.findall(r'M([^MZ]+)Z', d):
        v = [float(t) for t in sub.split()]
        pts = [(v[i] * w / W * ss, v[i + 1] * h / H * ss) for i in range(0, len(v), 2)]
        dr.polygon(pts, fill=255)
    return np.asarray(im.resize((w, h), Image.BOX)).astype(float) / 255


def draw(frame, side, lit, blooms):
    x0, y0, x1, y1 = (int(round(v)) for v in pairs.frame_box(frame))
    w, h = x1 - x0, y1 - y0
    src = 'figure-front' if side == 'front' else 'figure-back'
    width = 390 if w <= 390 else 585
    rend = Image.open(os.path.join(IMG, f'{src}-{width}.webp')).convert('RGBA').resize((w, h), Image.LANCZOS)
    bg = Image.new('RGBA', (w, h), (11, 13, 10, 255))
    base = np.asarray(Image.alpha_composite(bg, rend).convert('RGB')).astype(float)
    reg = regions()
    scale = w / W
    for slug in lit:
        p = raster(reg[(side, slug)], w, h)
        s1, k1, s2, k2, c = blooms[slug]
        a = np.minimum(c, k1 * ndi.gaussian_filter(p, s1 * scale) + k2 * ndi.gaussian_filter(p, s2 * scale))
        base = base * (1 - a[..., None]) + ACCENT * a[..., None]
    for slug in lit:
        p = raster(reg[(side, slug)], w, h)
        base = base * (1 - p[..., None]) + ACCENT * p[..., None]
    fr = np.asarray(Image.open(os.path.join(pairs.FRAMES, f'{frame}@2x.png')).convert('RGB').crop((x0, y0, x1, y1))).astype(float)
    return np.clip(base, 0, 255).astype(np.uint8), fr.astype(np.uint8)


def sternum(img: np.ndarray):
    """Per row through the pectorals: the run of px between the two lit panels with green <= 205."""
    lit = pairs.lit(img)
    ys = np.nonzero(lit.any(1))[0]
    if not len(ys):
        return None
    w = img.shape[1]
    mid = w // 2
    out = []
    for y in np.linspace(ys.min() + 4, ys.max() - 4, 16).astype(int):
        row = img[y, mid - 12 : mid + 12, 1].astype(int)
        lr = lit[y, mid - 12 : mid + 12]
        if not lr.any():
            out.append(None)
            continue
        dark = row <= 205
        # the longest run of dark px with lit px on both sides
        best = 0
        run = 0
        for v in dark:
            run = run + 1 if v else 0
            best = max(best, run)
        out.append(best)
    return out


def report(app, fr):
    la, lf = pairs.lit(app), pairs.lit(fr)
    return dict(
        litIoU=round(float((la & lf).sum() / max(1, (la | lf).sum())), 4),
        bloomApp=pairs.bloom_profile(app, la),
        bloomFrame=pairs.bloom_profile(fr, lf),
    )


if __name__ == '__main__':
    args = [float(v) for v in sys.argv[1:]]
    chest = tuple(args[0:5]) if len(args) >= 5 else (6, 0.6, 26, 0.8, 1.0)
    lats = tuple(args[5:10]) if len(args) >= 10 else (5, 1.0, 18, 0.4, 1.0)
    rep = {}
    for frame, side, slug, b in [('library-2', 'front', 'chest', chest), ('exercise-detail-1', 'front', 'chest', chest),
                                 ('library-3', 'back', 'lats', lats), ('workout-1', 'back', 'lats', lats)]:
        app, fr = draw(frame, side, [slug], {slug: b})
        r = report(app, fr)
        if slug == 'chest':
            r['sternumApp'] = sternum(app)
            r['sternumFrame'] = sternum(fr)
        rep[frame] = r
        print(frame, json.dumps(r))
        if '--save' in os.environ.get('SIM_FLAGS', ''):
            Image.fromarray(np.hstack([app, fr])).save(os.path.join(os.environ.get('SIM_OUT', '.'), f'sim-{frame}.png'))
