"""Shared helpers of the F15 stage 1 region tracer.

The tracer works on the NEUTRAL production renders (597 x 1261, the canvas every figure still
shares) and on the baked LIT renders the frames were made from. Neither ships: they are read from
the mockup folder by absolute path, and only the vector paths this tool writes (regions.ts) enter
the app. Run with `python -I`.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = os.environ.get(
    'PULSE_FIGURE_SRC',
    'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepek-forras/pulse',
)
W, H = 597, 1261
#: Work resolution = canvas x S. Fine enough for sub-pixel outlines, small enough for scipy.
S = 3

NEUTRAL = {'front': 'app/figure-front-neutral.png', 'back': 'app/figure-back-neutral.png'}
LIT = {
    'chest': ('front', 'muscle-figure-front.png'),
    'cap': ('front', 'app/figure-front-press.png'),
    'quads': ('front', 'app/figure-front-legs.png'),
    'lats': ('back', 'app/figure-back-lats.png'),
}
LIME = np.array([201.0, 252.0, 45.0])
LUMA = np.array([0.2126, 0.7152, 0.0722])


def load_rgb(rel: str) -> np.ndarray:
    return np.asarray(Image.open(os.path.join(SRC, rel)).convert('RGB')).astype(np.float64)


def up(img: np.ndarray, order: int = 3) -> np.ndarray:
    """Canvas -> work resolution (cubic for pictures, nearest for masks)."""
    if img.ndim == 3:
        return np.stack([ndi.zoom(img[..., c], S, order=order) for c in range(img.shape[2])], -1)
    return ndi.zoom(img, S, order=order)


def luminance(rgb: np.ndarray) -> np.ndarray:
    return (rgb * LUMA).sum(-1)


def disk(r: float) -> np.ndarray:
    n = int(np.ceil(r))
    y, x = np.mgrid[-n : n + 1, -n : n + 1]
    return (x * x + y * y) <= r * r + 1e-9


def polygon_mask(points, shape) -> np.ndarray:
    """Filled polygon (canvas coordinates) at work resolution."""
    from PIL import ImageDraw

    im = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([(x * S, y * S) for x, y in points], fill=1)
    return np.asarray(im).astype(bool)


def polyline_mask(points, shape, width: float) -> np.ndarray:
    """A stroked polyline (canvas coordinates, width in canvas px) at work resolution."""
    from PIL import ImageDraw

    im = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    pts = [(x * S, y * S) for x, y in points]
    d.line(pts, fill=1, width=max(1, int(round(width * S))), joint='curve')
    r = width * S / 2
    for x, y in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=1)
    return np.asarray(im).astype(bool)
