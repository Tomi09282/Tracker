"""F12 stage 2 — the kit specimen cells next to the Figma component board.

    python board-pairs.py <raw dir> <board png> <out dir>

<board png> is the stitched component board at scale 1 (1300 x 5094, `_components-1..4.png`, as the
stage-1 tiler wrote it to .pulse/pairs/F12/board/_components.board.png). The app side is the kit page
captured by s2-shot.mjs (`kit.png`, 402 wide, scale 2) with `kit.json` giving each cell's boxes.
The board side is upscaled x2 (nearest) so both are compared at 2x.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

RAW, BOARD, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
kit = json.loads((RAW / 'kit.json').read_text(encoding='utf-8'))
app = Image.open(RAW / 'kit.png').convert('RGB')
board = Image.open(BOARD).convert('RGB')

boxes = {}
for k in kit['kits']:
    boxes.setdefault(k['kit'], []).append(k['box'])

search = boxes['searchField'][0]
sheet = boxes['bottomSheet'][0]
phone_top = sheet['y'] + sheet['h'] - 600

# name: (board box x, y, w, h at scale 1), (app box x, y in pt), what
PAIRS = {
    'searchField.board': ((473, 2215, 354, 100), (search['x'], search['y']), 'searchField cell: empty / focus + clear (app: rest; the focus capture is mk1-focus)'),
    'bottomSheet.board': ((449, 4454, 402, 600), (0, phone_top), 'pushed screen + ConfirmSheet over the scrim (SheetStatic, the same panel as Sheet)'),
}


def label(img, text):
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype('arial.ttf', 22)
    except OSError:
        f = ImageFont.load_default()
    d.rectangle((0, 0, img.width, 34), fill=(255, 0, 255))
    d.text((10, 5), text, fill=(0, 0, 0), font=f)


OUT.mkdir(parents=True, exist_ok=True)
for name, ((bx, by, bw, bh), (ax, ay), what) in PAIRS.items():
    a = board.crop((bx, by, bx + bw, by + bh)).resize((bw * 2, bh * 2), Image.NEAREST)
    b = app.crop((round(ax * 2), round(ay * 2), round(ax * 2) + bw * 2, round(ay * 2) + bh * 2))
    diff = ImageChops.difference(a, b).point(lambda v: min(255, v * 3))
    gap = 16
    out = Image.new('RGB', (bw * 6 + gap * 2, bh * 2 + 34), (255, 0, 255))
    out.paste(a, (0, 34))
    out.paste(b, (bw * 2 + gap, 34))
    out.paste(diff, (2 * (bw * 2 + gap), 34))
    label(out, f'{name} — {what} · Figma board | app (built) | difference x3 @2x')
    out.save(OUT / f'{name}.pair.png')
    print(f'wrote {name}.pair.png')
