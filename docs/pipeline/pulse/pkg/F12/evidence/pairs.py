"""F12 evidence: pair pictures — Figma | app | difference — from the f12-shot.mjs captures.

    python pairs.py <pulse dir>        (writes <pulse dir>/pairs/F12/*.png)

Every panel is at 2x (the frames' own scale). The component board exists only at 1x, so its crop is
scaled up 2x (nearest) and says so in its header. The difference panel is |frame - app| per channel,
amplified 3x: black = identical.
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

PULSE = sys.argv[1]
RAW = os.path.join(PULSE, 'pairs', 'F12', 'raw')
OUT = os.path.join(PULSE, 'pairs', 'F12')
FRAMES = r'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x'
SHOTS = os.path.join(PULSE, 'shots', 'F12')
BG = (11, 13, 10)
INK = (169, 176, 157)


def font(size):
    for f in ('C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def diff(a, b):
    d = ImageChops.difference(a.convert('RGB'), b.convert('RGB'))
    return d.point(lambda v: min(255, v * 3))


def panel_row(name, title, panels, gap=24, head=56):
    w = sum(p.width for _, p in panels) + gap * (len(panels) + 1)
    h = max(p.height for _, p in panels) + head + gap
    sheet = Image.new('RGB', (w, h + 40), BG)
    d = ImageDraw.Draw(sheet)
    d.text((gap, 10), title, fill=(242, 245, 234), font=font(22))
    x = gap
    for label, p in panels:
        d.text((x, 40), label, fill=INK, font=font(16))
        sheet.paste(p.convert('RGB'), (x, head + 10))
        d.rectangle([x - 1, head + 9, x + p.width, head + 10 + p.height], outline=(60, 62, 58))
        x += p.width + gap
    path = os.path.join(OUT, name)
    sheet.save(path)
    print(path, sheet.size)


def crop2x(img, box):
    return img.crop(tuple(int(v * 2) for v in box))


# 1 · the auth frames: the two fields of the frame and of the real Field at the frame's coordinates
for frame, view, box in (('auth-1', 'auth-1', (0, 436, 402, 610)), ('auth-2', 'auth-2', (0, 436, 402, 634))):
    fig = crop2x(Image.open(os.path.join(FRAMES, f'{frame}@2x.png')), box)
    app = crop2x(Image.open(os.path.join(RAW, f'{view}.png')), box)
    panel_row(f'{frame}.fields.pair.png', f'{frame} - the form band y {box[1]}-{box[3]}: Figma | the real Field at the frame coordinates (built app CSS) | difference x3',
              [('Figma ' + frame + '@2x', fig), ('app ' + view + ' (f12-shot)', app), ('|Figma - app| x3', diff(fig, app))])

# 2 · the component board cell `inputField` (board 473,1645 354x494; _components-2.png starts at board y 1273 — the four tiles overlap by 40, measured on the lime and danger underlines)
board = Image.open(os.path.join(FRAMES, '_components-2.png')).crop((473, 372, 827, 866))
board2 = board.resize((board.width * 2, board.height * 2), Image.NEAREST)
for view in ('board', 'board-focus'):
    app = Image.open(os.path.join(RAW, f'{view}.png')).crop((48, 80, 48 + 708, 80 + 988))
    panel_row(f'inputField.{view}.pair.png', f'kit board cell inputField (idle / focus / error / disabled / empty): Figma board | app specimen ({view}) | difference x3',
              [('Figma _components-2 (1x, shown 2x)', board2), ('app kit/inputs.tsx cell 1 @2x', app), ('|Figma - app| x3', diff(board2, app))])

# 3 · keyboard focus on the auth-1 geometry, next to the board's focus specimen
fig_focus = board2.crop((0, (1805 - 1645) * 2, 708, (1805 - 1645 + 62) * 2))
app_focus = crop2x(Image.open(os.path.join(RAW, 'auth-1-focus.png')), (24, 450, 378, 512))
panel_row('inputField.keyboard-focus.pair.png', 'keyboard focus (Tab into the field): Figma board focus specimen | app auth-1 e-mail field after one Tab',
          [('Figma board "· focus" (1x, shown 2x)', fig_focus), ('app auth-1-focus @2x', app_focus)])

# 4 · the hybrid auth screen in the built app, before F12 and after, next to the frame
before = os.path.join(PULSE, 'shots', 'F1.5', 'auth-login.png')
if os.path.exists(before) and os.path.exists(os.path.join(SHOTS, 'auth-1.live.png')):
    panel_row('auth-1.hybrid.before-after.png', 'auth-1 whole screen: Figma | hybrid before F12 (F1.5 capture) | hybrid with the F12 Field (pulse-verify live) - the layout around the fields is S-auth\'s',
              [('Figma auth-1@2x', Image.open(os.path.join(FRAMES, 'auth-1@2x.png'))), ('before (boxed Field)', Image.open(before)), ('after (underline Field)', Image.open(os.path.join(SHOTS, 'auth-1.live.png')))])
for state in ('F12-register-filled', 'F12-login-error', 'F12-login-focus'):
    p = os.path.join(SHOTS, f'{state}.live.png')
    if os.path.exists(p):
        frame = 'auth-2' if 'register' in state else 'auth-1'
        panel_row(f'{state}.hybrid.png', f'{state}: Figma {frame} | the hybrid auth screen with the F12 Field (pulse-verify live)',
                  [(f'Figma {frame}@2x', Image.open(os.path.join(FRAMES, f'{frame}@2x.png'))), (state, Image.open(p))])

# 5 · the real kit board (/playground, board layout, 1300 x 5094 at scale 1 — the F12-kit-board state) against
#     the stitched Figma board (pkg/_int/kit-board-tiles.mjs writes it to pairs/F12/board/), the inputField cell only
stitched = os.path.join(OUT, 'board', '_components.board.png')
capture = os.path.join(SHOTS, 'F12-kit-board.live.png')
if os.path.exists(stitched) and os.path.exists(capture):
    cell = (473, 1645, 827, 2139)
    fig = Image.open(stitched).crop(cell)
    app = Image.open(capture).crop(cell)
    up = lambda im: im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    panel_row('inputField.kit-board.pair.png', 'kit board /playground (board layout, 1300 x 5094, scale 1): the inputField cell at board 473,1645 — Figma | app | difference x3 (both 1x, shown 2x)',
              [('Figma board (stitched _components-1..4)', up(fig)), ('app /playground board (F12-kit-board, live)', up(app)), ('|Figma - app| x3', up(diff(fig, app)))])
