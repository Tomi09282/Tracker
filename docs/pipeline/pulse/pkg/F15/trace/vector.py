"""Mask -> closed outlines -> simplified SVG path data (marching squares + Ramer-Douglas-Peucker)."""
from __future__ import annotations

import numpy as np


def marching_squares(f: np.ndarray, level: float = 0.5):
    """Closed iso-lines of `f` at `level`, as lists of (x, y) in pixel-centre coordinates.

    `f` is padded with a border below the level so every line closes.
    """
    f = np.pad(f.astype(np.float64), 1, constant_values=level - 1)
    h, w = f.shape
    a = f[:-1, :-1] > level  # top-left
    b = f[:-1, 1:] > level  # top-right
    c = f[1:, 1:] > level  # bottom-right
    d = f[1:, :-1] > level  # bottom-left
    case = a * 8 + b * 4 + c * 2 + d * 1
    ys, xs = np.nonzero((case > 0) & (case < 15))

    def interp(y0, x0, y1, x1):
        v0, v1 = f[y0, x0], f[y1, x1]
        t = (level - v0) / (v1 - v0) if v1 != v0 else 0.5
        return (x0 + t * (x1 - x0) - 1, y0 + t * (y1 - y0) - 1)  # undo the pad

    # Edge keys: ('h', y, x) = edge between (y,x) and (y,x+1); ('v', y, x) = between (y,x),(y+1,x).
    T, R, B, L = 'T', 'R', 'B', 'L'
    table = {
        1: [(L, B)], 2: [(B, R)], 3: [(L, R)], 4: [(R, T)], 5: None, 6: [(B, T)], 7: [(L, T)],
        8: [(T, L)], 9: [(T, B)], 10: None, 11: [(T, R)], 12: [(R, L)], 13: [(R, B)], 14: [(B, L)],
    }
    nxt = {}
    pts = {}

    def key(edge, y, x):
        if edge == T:
            return ('h', y, x)
        if edge == B:
            return ('h', y + 1, x)
        if edge == L:
            return ('v', y, x)
        return ('v', y, x + 1)

    def point(k):
        if k not in pts:
            kind, y, x = k
            pts[k] = interp(y, x, y, x + 1) if kind == 'h' else interp(y, x, y + 1, x)
        return pts[k]

    for y, x in zip(ys.tolist(), xs.tolist()):
        cs = int(case[y, x])
        segs = table[cs]
        if segs is None:  # saddle: decide by the centre value
            centre = (f[y, x] + f[y, x + 1] + f[y + 1, x] + f[y + 1, x + 1]) / 4 > level
            if cs == 5:
                segs = [(R, T), (L, B)] if not centre else [(L, T), (R, B)]
            else:
                segs = [(T, L), (B, R)] if not centre else [(T, R), (B, L)]
        for e0, e1 in segs:
            nxt[key(e0, y, x)] = key(e1, y, x)

    loops = []
    seen = set()
    for start in list(nxt):
        if start in seen:
            continue
        loop = []
        k = start
        while k not in seen and k in nxt:
            seen.add(k)
            loop.append(point(k))
            k = nxt[k]
        if len(loop) >= 3:
            loops.append(np.array(loop))
    return loops


def area(loop: np.ndarray) -> float:
    x, y = loop[:, 0], loop[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def rdp(points: np.ndarray, eps: float) -> np.ndarray:
    if len(points) < 3:
        return points
    stack = [(0, len(points) - 1)]
    keep = np.zeros(len(points), bool)
    keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p, q = points[i], points[j]
        seg = q - p
        n = np.hypot(*seg)
        rel = points[i + 1 : j] - p
        if n == 0:
            dist = np.hypot(rel[:, 0], rel[:, 1])
        else:
            dist = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / n
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = i + 1 + k
            keep[m] = True
            stack += [(i, m), (m, j)]
    return points[keep]


def simplify_closed(loop: np.ndarray, eps: float) -> np.ndarray:
    # split at the two farthest-apart points so RDP has stable anchors
    i = 0
    j = int(np.argmax(np.hypot(*(loop - loop[0]).T)))
    a = rdp(np.vstack([loop[i : j + 1]]), eps)
    b = rdp(np.vstack([loop[j:], loop[:1]]), eps)
    return np.vstack([a[:-1], b[:-1]])


def mask_to_loops(mask: np.ndarray, scale: float, sigma: float, eps: float, min_area: float):
    """Work-resolution mask -> simplified loops in canvas coordinates (divided by `scale`)."""
    from scipy import ndimage as ndi

    f = ndi.gaussian_filter(mask.astype(np.float64), sigma)
    out = []
    for lp in marching_squares(f, 0.5):
        lp = (lp + 0.5) / scale  # pixel centres -> canvas
        if abs(area(lp)) < min_area:
            continue
        out.append(simplify_closed(lp, eps))
    return out


def loops_to_path(loops) -> str:
    parts = []
    for lp in loops:
        coords = ' '.join(f'{x:.1f} {y:.1f}' for x, y in lp)
        parts.append(f'M{coords}Z')
    return ''.join(parts).replace('.0 ', ' ').replace('.0Z', 'Z')
