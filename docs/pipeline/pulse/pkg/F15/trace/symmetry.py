"""Left / right areas of every two-sided region in regions.ts (canvas units^2), and the overlap of
the front and side delt paths. The review asked for mirrored areas within ~10 %.

    python -I docs/pipeline/pulse/pkg/F15/trace/symmetry.py
"""
from __future__ import annotations

import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim  # noqa: E402


def loops(d):
    out = []
    for sub in re.findall(r'M([^MZ]+)Z', d):
        v = [float(t) for t in sub.split()]
        out.append(np.array(v).reshape(-1, 2))
    return out


def area(p):
    x, y = p[:, 0], p[:, 1]
    return abs(0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))


def raster(d, ss=4):
    im = Image.new('1', (sim.W * ss, sim.H * ss), 0)
    dr = ImageDraw.Draw(im)
    for p in loops(d):
        dr.polygon([(x * ss, y * ss) for x, y in p], fill=1)
    return np.asarray(im), ss


if __name__ == '__main__':
    reg = sim.regions()
    rep = {}
    for (side, slug), d in reg.items():
        ls = loops(d)
        left = sum(area(p) for p in ls if p[:, 0].mean() < 297.75)
        right = sum(area(p) for p in ls if p[:, 0].mean() >= 297.75)
        if left and right:
            rep[f'{side}:{slug}'] = dict(left=round(left), right=round(right), diffPct=round(100 * (right - left) / max(left, right), 1), subpaths=len(ls))
        else:
            rep[f'{side}:{slug}'] = dict(single=round(left + right), subpaths=len(ls))
    a, ss = raster(reg[('front', 'front-delts')])
    b, _ = raster(reg[('front', 'side-delts')])
    rep['delt overlap units^2'] = round(float((a & b).sum()) / ss / ss, 1)
    for k, v in rep.items():
        print(k, json.dumps(v))
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'symmetry.json'), 'w') as fh:
        json.dump(rep, fh, indent=1)
