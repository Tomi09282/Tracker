"""Debug pictures of the tracer: every region outlined on both renders, and the lit references.

    python -I docs/pipeline/pulse/pkg/F15/trace/debug.py <out dir>
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: E402,F401,F403
from PIL import ImageDraw, ImageFont  # noqa: E402
import build  # noqa: E402

PAL = [(255, 64, 64), (64, 200, 255), (255, 200, 0), (200, 90, 255), (0, 230, 140), (255, 120, 200),
       (255, 150, 40), (120, 160, 255), (180, 255, 60), (255, 255, 255), (0, 200, 200), (255, 90, 120)]


def outlines(side, regions, z=2, label=True):
    im = Image.open(os.path.join(SRC, NEUTRAL[side])).convert('RGB').resize((W * z, H * z), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('arial.ttf', 11 * z // 2 + 4)
    except OSError:
        font = None
    i = 0
    for r in regions:
        if r['side'] != side:
            continue
        col = PAL[i % len(PAL)]
        i += 1
        for lp in r['loops']:
            pts = [(x * z, y * z) for x, y in lp]
            d.line(pts + pts[:1], fill=col, width=2)
        if label and r['loops']:
            lp = max(r['loops'], key=len)
            xs = [p[0] for p in lp]
            ys = [p[1] for p in lp]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            d.text((cx * z, cy * z), r['slug'], fill=col, font=font, anchor='mm', stroke_width=2, stroke_fill=(0, 0, 0))
    return im


def iou_report(regions):
    """IoU of the traced PATHS (rasterised, so the vectorising is checked too) against the lime of
    every lit reference render, in the canvas."""
    from PIL import ImageDraw as _D

    def raster(loops, shape):
        acc = np.zeros(shape, bool)
        for lp in loops:
            im = Image.new('L', (shape[1], shape[0]), 0)
            _D.Draw(im).polygon([(x * S, y * S) for x, y in lp], fill=1)
            acc ^= np.asarray(im).astype(bool)
        return acc

    out = {}
    specs = {s['slug'] + ':' + s['side']: s for s in build.REGIONS}
    for key, side, slugs in [('chest', 'front', ['chest']), ('quads', 'front', ['quads']), ('lats', 'back', ['lats']), ('cap', 'front', ['front-delts', 'side-delts'])]:
        spec = specs[slugs[0] + ':' + side]
        ref = build.lime_mask(key, primary=(key != 'cap'), close=spec.get('close', 0), t=spec.get('t', 150))
        within = np.zeros_like(ref)
        for poly in spec['within']:
            within |= polygon_mask(poly, ref.shape)
        ref &= within
        lab, n = ndi.label(ref)
        sizes = ndi.sum(ref, lab, range(1, n + 1))
        ref = ndi.binary_fill_holes(np.isin(lab, 1 + np.where(sizes >= 400 * S * S)[0]))
        got = np.zeros_like(ref)
        for r in regions:
            if r['side'] == side and r['slug'] in slugs:
                got |= raster(r['loops'], ref.shape)
        out[key] = round(float((got & ref).sum() / (got | ref).sum()), 4)
    return out


if __name__ == '__main__':
    out = sys.argv[1]
    regions, masks, seg = build.build()
    build.write_ts(regions)
    f = outlines('front', regions)
    b = outlines('back', regions)
    sheet = Image.new('RGB', (f.width + b.width, f.height), (0, 0, 0))
    sheet.paste(f, (0, 0))
    sheet.paste(b, (f.width, 0))
    sheet.save(os.path.join(out, 'regions-outlined.png'))
    np.save(os.path.join(out, 'masks.npy'), {f'{k[0]}:{k[1]}': v for k, v in masks.items()}, allow_pickle=True)
    # the lit references against the traced outline
    refs = [('chest', 'front', ['chest']), ('cap', 'front', ['front-delts', 'side-delts']), ('quads', 'front', ['quads']), ('lats', 'back', ['lats'])]
    for key, side, slugs in refs:
        side_, rel = LIT[key]
        im = Image.open(os.path.join(SRC, rel)).convert('RGB').resize((W * 2, H * 2), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        for r in regions:
            if r['side'] == side and r['slug'] in slugs:
                for lp in r['loops']:
                    pts = [(x * 2, y * 2) for x, y in lp]
                    d.line(pts + pts[:1], fill=(255, 0, 200), width=1)
        im.save(os.path.join(out, f'ref-{key}.png'))
    rep = iou_report(regions)
    import json as _j
    with open(os.path.join(out, 'iou.json'), 'w') as fh:
        _j.dump(rep, fh)
    print('IoU of the traced paths against the lit renders:', rep)
    print('debug pictures in', out)

