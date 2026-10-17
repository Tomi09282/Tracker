"""Pair pictures of the built app's figure against the same crop of the Figma frames.

    python -I docs/pipeline/pulse/pkg/F15/trace/pairs.py <kit-s1.png> <out dir>

The proof cells of `specimens.tsx` draw a 1 px `--danger` hairline 4 px outside each figure box,
so the box is found in the capture without any probe. The frame's box is the figure layer's
rectangle in `.pulse/geometry/<frame>.json` (x 2: the frames are exported at scale 2, as the
capture). Each pair: app | frame | 50 % overlay | the lit pixels of both (app magenta, frame
green, both white), plus the numbers: IoU of the lit pixels, the lime of the panels, the bloom
profile outside them, and the body's extent (head top, soles, hands) in the box.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

FRAMES = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x'
GEOM = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/geometry'
DANGER = np.array([248, 113, 113])

#: proof cells in the order specimens.tsx draws them -> (frame, figure-layer name prefix, what)
CELLS = [
    ('rest-front', 'library-1', 'library-1: rest, front'),
    ('rest-back', 'library-3', 'rest, back - against library-3 (no frame draws the back unlit: its lats are lit there)'),
    ('library-2', 'library-2', 'library-2: Mell selected'),
    ('library-3', 'library-3', 'library-3: Széles hátizom selected'),
    ('exercise-detail-1', 'exercise-detail-1', 'exercise-detail-1: Mell primary, Oldalsó vállizom secondary (the data)'),
    ('exercise-detail-1-cap', 'exercise-detail-1', 'exercise-detail-1: Mell primary, both delts secondary (the lit render)'),
    ('exercise-detail-2', 'exercise-detail-2', 'exercise-detail-2: Széles hátizom primary, Bicepsz secondary (front)'),
    ('workout-1', 'workout-1', 'workout-1: Széles hátizom primary'),
    ('workout-2', 'workout-2', 'workout-2: Széles hátizom primary'),
    ('many-front', None, 'several at once, front'),
    ('many-back', None, 'several at once, back'),
]


def font(size):
    try:
        return ImageFont.truetype('arial.ttf', size)
    except OSError:
        return ImageFont.load_default()


def find_boxes(img: np.ndarray):
    red = (np.abs(img[..., :3].astype(int) - DANGER).sum(-1) < 60)
    lab, n = ndi.label(ndi.binary_dilation(red, iterations=1))
    boxes = []
    for sl in ndi.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (x1 - x0) < 60 or (y1 - y0) < 60:
            continue
        # the hairline's outer edge is 5 css px (10 device px) outside the box; dilation added 1
        boxes.append((x0 + 11, y0 + 11, x1 - 11, y1 - 11))
    # reading order: rows (by top, 40 px tolerance), then left to right
    boxes.sort(key=lambda b: (round(b[1] / 40), b[0]))
    return boxes


def frame_box(frame: str):
    g = json.load(open(os.path.join(GEOM, f'{frame}.json'), encoding='utf-8'))
    found = []

    def walk(o):
        if isinstance(o, dict):
            n = str(o.get('name', ''))
            if o.get('image') and ('figure' in n):
                found.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(g)
    f = found[0]
    return (f['x'] * 2, f['y'] * 2, (f['x'] + f['w']) * 2, (f['y'] + f['h']) * 2)


def lit(rgb: np.ndarray, t: float = 150) -> np.ndarray:
    a = rgb.astype(float)
    return (a[..., 1] - a[..., 2]) > t


def body_extent(rgb: np.ndarray):
    lum = (rgb.astype(float) * [0.2126, 0.7152, 0.0722]).sum(-1)
    m = lum > 30
    m = ndi.binary_opening(m, iterations=1)
    ys, xs = np.nonzero(m)
    if not len(ys):
        return None
    h, w = m.shape
    return dict(head=ys.min() / h, soles=ys.max() / h, left=xs.min() / w, right=xs.max() / w)


def bloom_profile(rgb: np.ndarray, solid: np.ndarray):
    if not solid.any():
        return None
    a = rgb.astype(float)
    lim = a[..., 1] - a[..., 2]
    d = ndi.distance_transform_edt(~solid)
    return [round(float(np.median(lim[(d > r - 0.5) & (d <= r + 0.5)])), 1) for r in (2, 4, 8, 12, 16, 24)]


def make_pair(app: Image.Image, frame: Image.Image | None, title: str, out: str, zoom: int = 1):
    w, h = app.size
    if frame is not None and frame.size != app.size:
        frame = frame.resize(app.size, Image.LANCZOS)
    panels = [('app (built)', app)]
    stats = {}
    a = np.asarray(app.convert('RGB'))
    la = lit(a)
    if frame is not None:
        f = np.asarray(frame.convert('RGB'))
        lf = lit(f)
        over = Image.blend(app.convert('RGB'), frame.convert('RGB'), 0.5)
        diff = np.zeros_like(a)
        diff[..., 0] = np.where(la, 255, 0)
        diff[..., 2] = np.where(la, 255, 0)
        diff[..., 1] = np.where(lf, 255, 0)
        diff = (diff * 0.85 + (a.astype(float) * 0.15)).astype(np.uint8)
        panels += [('frame', frame), ('50 % overlay', over), ('lit px: app magenta / frame green / both white', Image.fromarray(diff))]
        union = (la | lf).sum()
        stats['litIoU'] = round(float((la & lf).sum() / union), 4) if union else None
        stats['litPx'] = [int(la.sum()), int(lf.sum())]
        core_a = ndi.binary_erosion(la, iterations=3)
        core_f = ndi.binary_erosion(lf, iterations=3)
        if core_a.any() and core_f.any():
            stats['limeApp'] = np.median(a[core_a], 0).astype(int).tolist()
            stats['limeFrame'] = np.median(f[core_f], 0).astype(int).tolist()
        stats['bloomApp'] = bloom_profile(a, la)
        stats['bloomFrame'] = bloom_profile(f, lf)
        stats['bodyApp'] = body_extent(a)
        stats['bodyFrame'] = body_extent(f)
    else:
        stats['bodyApp'] = body_extent(a)
    pad, head = 12, 46
    W = len(panels) * (w * zoom) + (len(panels) + 1) * pad
    H = h * zoom + head + pad
    sheet = Image.new('RGB', (W, H), (11, 13, 10))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 6), title, fill=(242, 245, 234), font=font(15))
    for i, (name, im) in enumerate(panels):
        x = pad + i * (w * zoom + pad)
        d.text((x, 26), name, fill=(169, 176, 157), font=font(12))
        sheet.paste(im.convert('RGB').resize((w * zoom, h * zoom), Image.NEAREST), (x, head))
    sheet.save(out)
    return stats


def main(capture: str, out: str):
    os.makedirs(out, exist_ok=True)
    img = Image.open(capture).convert('RGB')
    arr = np.asarray(img)
    boxes = find_boxes(arr)
    names = [c[0] for c in CELLS]
    print(f'{len(boxes)} proof boxes found ({len(CELLS)} named + contact sheet)')
    report = {}
    for i, (key, frame, title) in enumerate(CELLS):
        box = boxes[i]
        app = img.crop(box)
        fr = None
        if frame:
            fb = frame_box(frame)
            fr = Image.open(os.path.join(FRAMES, f'{frame}@2x.png')).convert('RGB').crop(fb)
            title = f'{title} - box {app.size[0]}x{app.size[1]} app / {fr.size[0]}x{fr.size[1]} frame (device px)'
        if fr is not None and fr.size != app.size:
            fr = fr.resize(app.size, Image.LANCZOS)
        report[key] = make_pair(app, fr, title, os.path.join(out, f'{key}.pair.png'))
        if fr is not None:
            # the lit area, zoomed: the outline of each panel against the frame's lit pixels
            f = np.asarray(fr)
            m = (f[..., 1].astype(int) - f[..., 2]) > 40
            if m.sum() > 50:
                ys, xs = np.nonzero(m)
                bx = (max(0, xs.min() - 30), max(0, ys.min() - 30), min(fr.size[0], xs.max() + 30), min(fr.size[1], ys.max() + 30))
                z = 3 if (bx[2] - bx[0]) < 160 else 2
                st = make_pair(app.crop(bx), fr.crop(bx), f'{key} - the lit area x{z}', os.path.join(out, f'{key}.zoom.png'), zoom=z)
                report[key]['zoom'] = {k: st[k] for k in ('litIoU', 'litPx')}
                # the secondary step: mean colour difference over the frame's secondary pixels
                sec = ((f[..., 1].astype(int) - f[..., 2]) > 55) & ~ndi.binary_dilation((f[..., 1].astype(int) - f[..., 2]) > 150, iterations=4)
                sec = ndi.binary_opening(sec, iterations=2)
                if sec.sum() > 200:
                    a = np.asarray(app).astype(float)
                    report[key]['secondary'] = dict(px=int(sec.sum()), app=np.median(a[sec], 0).astype(int).tolist(), frame=np.median(f[sec], 0).astype(int).tolist(), meanAbsDiff=round(float(np.abs(a[sec] - f[sec]).mean()), 1))
        report[key]['appBox'] = list(box)
        print(key, json.dumps(report[key]))
    # the contact sheet as one picture
    contact = boxes[len(CELLS):]
    if contact:
        x0 = min(b[0] for b in contact) - 40
        y0 = min(b[1] for b in contact) - 50
        x1 = max(b[2] for b in contact) + 40
        y1 = max(b[3] for b in contact) + 20
        img.crop((x0, y0, x1, y1)).save(os.path.join(out, 'contact-22-regions.png'))
    with open(os.path.join(out, 'pairs.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
