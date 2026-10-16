"""G-inputs — pair pictures: Figma frame | the built app | difference, per component region.

    python pairs.py <raw dir> <out dir>

Reads the 2x frame PNGs of the Figma export (kepernyok-2x) and the 2x captures of gi-shot.mjs
(<raw>/<view>.png, the components at the frame's own coordinates), crops the same band of both and
writes <out>/<pair>.pair.png: the frame on the left, the app in the middle, the absolute difference
on the right (brightened x3). A band is in pt; everything is drawn at 2x.
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

FRAMES = Path('C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x')
RAW, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

# pair name: (frame file, app view, top pt, bottom pt, what)
PAIRS = {
    'numeralField.workout-1': ('workout-1', 'wk1', 352, 622, 'NumeralField - rows 1-2 locked + lock, rows 3-4 placeholder on the row rule'),
    'numeralField.workout-1.focus': ('workout-1', 'wk1-focus', 352, 622, 'NumeralField - row 3 weight with keyboard focus (2 px lime line)'),
    'inputField-unit.nutrition-2': ('nutrition-2', 'nu2', 692, 768, 'Field unit - 180 + g + valid tick (kcal numeral is not this lane)'),
    'inputField-unit.nutrition-2.focus': ('nutrition-2', 'nu2-focus', 692, 768, 'Field unit - keyboard focus'),
    'inputField-title.plan-editor-1': ('plan-editor-1', 'pe1', 112, 160, 'Field variant=title - plan name, no line at rest'),
    'inputField-title.plan-editor-1.focus': ('plan-editor-1', 'pe1-focus', 112, 160, 'Field variant=title - keyboard focus (lime line under the 28 line box)'),
    'textArea-labelTrailing.compose-post-1': ('compose-post-1', 'cpo1', 652, 862, 'TextArea minRows 7 + labelTrailing counter'),
    'textArea-singleLine.compose-profile-1': ('compose-profile-1', 'cpr1', 543, 666, 'TextArea singleLine headline (wraps to 66) + marker + hint'),
    'textArea-singleLine.compose-profile-1.focus': ('compose-profile-1', 'cpr1-focus', 543, 666, 'TextArea singleLine - keyboard focus'),
    'textArea-bio.compose-profile-1': ('compose-profile-1', 'cpr1', 930, 1132, 'TextArea labelHidden 8-row window (section header not drawn)'),
}


def label(img, text):
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype('arial.ttf', 22)
    except OSError:
        f = ImageFont.load_default()
    d.rectangle((0, 0, img.width, 34), fill=(255, 0, 255))
    d.text((10, 5), text, fill=(0, 0, 0), font=f)
    return img


for name, (frame, view, top, bottom, what) in PAIRS.items():
    fp, ap = FRAMES / f'{frame}@2x.png', RAW / f'{view}.png'
    if not ap.exists():
        print(f'skip {name}: {ap.name} missing')
        continue
    box = (0, top * 2, 804, bottom * 2)
    a = Image.open(fp).convert('RGB').crop(box)
    b = Image.open(ap).convert('RGB').crop(box)
    diff = ImageChops.difference(a, b).point(lambda v: min(255, v * 3))
    gap = 16
    out = Image.new('RGB', (804 * 3 + gap * 2, a.height + 34), (255, 0, 255))
    out.paste(a, (0, 34))
    out.paste(b, (804 + gap, 34))
    out.paste(diff, (2 * (804 + gap), 34))
    label(out, f'{name} — {what} · Figma {frame} | app (built) | difference x3 · y {top}-{bottom} pt @2x')
    out.save(OUT / f'{name}.pair.png')
    print(f'wrote {name}.pair.png')
