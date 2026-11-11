"""F12 stage 2 — pair pictures: Figma frame | the built app | difference, per component region.

    python pairs-s2.py <raw dir> <out dir>

Reads the 2x frame PNGs of the Figma export (kepernyok-2x) and the 2x captures of s2-shot.mjs
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
    'sheet.coach-dashboard-2': ('coach-dashboard-2', 'cd2', 600, 874, 'Sheet — the code sheet (live Sheet, open)'),
    'sheet.compose-hub-2': ('compose-hub-2', 'ch2', 600, 874, 'Sheet — actions as rows (live Sheet, open)'),
    'numberStepper.onboarding-3': ('onboarding-3', 'ob3', 745, 1000, 'NumberStepper — empty + error / 70 + tick + hint'),
    'textArea.compose-post-1': ('compose-post-1', 'cp1', 540, 870, 'Field (marker + counter hint) / TextArea 7 rows + counter'),
    'textArea.coach-chat-2': ('coach-chat-2', 'cc2', 650, 754, 'TextArea composer grown to 2 rows + the sm send pill'),
    'textArea.onboarding-1': ('onboarding-1', 'ob1', 915, 1045, 'TextArea note (2 rows) + hint'),
    'dateTrigger.nutrition-1': ('nutrition-1', 'nu1', 95, 155, 'DateTrigger inline (header date control)'),
    'searchField.nutrition-1': ('nutrition-1', 'nu1', 583, 643, 'SearchField — food search'),
    'selectSheet+dateTrigger.progress-1': ('progress-1', 'pr1', 795, 955, 'SelectSheet trigger / Field / DateTrigger field'),
    'dateTrigger+filePick.progress-3': ('progress-3', 'pr3', 445, 600, 'DateTrigger field / FilePick (lime pill)'),
    'searchField.marketplace-1': ('marketplace-1', 'mk1', 518, 582, 'SearchField — placeholder'),
    'maskedField.auth-1': ('auth-1', 'auth1', 524, 604, 'MaskedField — empty, struck eye'),
    'maskedField.auth-2': ('auth-2', 'auth2', 524, 628, 'MaskedField — 14 discs, rule hint, struck eye'),
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
