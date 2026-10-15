#!/usr/bin/env node
/*
 * F13 pairs — the status zone next to its Figma source, as pictures the owner can look at.
 * (F11's pairs.mjs, with F13's regions.)
 *
 * Each pair is one region cut from a Figma picture (a frame at 2x, or the component board at 1x)
 * and the SAME region cut from a capture of the built app, laid out as
 *
 *     Figma | app | difference (x4, over 8)
 *
 * at 2x, with the board's 1x cuts doubled pixel for pixel so the three panels line up. The
 * region is given in points of the frame or board, so a pair reads the same numbers as the
 * geometry export (`.pulse/geometry/*.json`).
 *
 *   node docs/pipeline/pulse/pkg/F13/pairs.mjs            (cwd: the slot's frontend folder)
 *
 * Output: C:/Users/Petike/Documents/Cursor/tracker/.pulse/pairs/F13/<name>.png and index.json
 * (the share of pixels that differ by more than 8, and the bounding box of the difference, per pair).
 * It reads only pictures; it builds nothing and opens no browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, diffPictures, encodePng, pulseDir } from '../../../../../frontend/scripts/pulse-shot.mjs';

const MOCKUPS = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x';
const SHOTS = path.join(pulseDir(), 'shots');
const OUT = path.join(pulseDir(), 'pairs', 'F13');

/**
 * The component board (1300 x 5094 pt) is four tiles at 1x that OVERLAP by 40: tile k starts at
 * board y (k - 1) x 1273 (measured on the section rules: Components 1576, Tab bar 4080, Screens
 * 4341 in `_components.json` sit at 1616, 4200, 4461 when the tiles are merely stacked).
 */
const BOARD_TILE_STEP = 1273;
let board = null;
function boardPicture() {
  if (board) return board;
  const tiles = [1, 2, 3, 4].map((i) => decodePng(fs.readFileSync(`${MOCKUPS}/_components-${i}.png`)));
  const height = BOARD_TILE_STEP * 3 + tiles[3].height;
  const data = Buffer.alloc(1300 * height * 4);
  tiles.forEach((t, k) => t.data.copy(data, k * BOARD_TILE_STEP * 1300 * 4));
  board = { width: 1300, height, data };
  return board;
}

/** Cut `r` (points) out of `pic` drawn at `scale`, and bring it to 2x. */
function cut(pic, scale, r) {
  const k = 2 / scale;
  const w = Math.round(r.w * 2);
  const h = Math.round(r.h * 2);
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(r.x * scale + x / k);
      const sy = Math.floor(r.y * scale + y / k);
      const o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= pic.width || sy >= pic.height) {
        out.data[o + 3] = 255;
        continue;
      }
      pic.data.copy(out.data, o, (sy * pic.width + sx) * 4, (sy * pic.width + sx) * 4 + 4);
    }
  }
  return out;
}

function sideBySide(panels, gap = 16) {
  const width = panels.reduce((s, p) => s + p.width, 0) + gap * (panels.length - 1);
  const height = Math.max(...panels.map((p) => p.height));
  const out = { width, height, data: Buffer.alloc(width * height * 4) };
  for (let i = 0; i < out.data.length; i += 4) out.data.set([40, 40, 40, 255], i);
  let x0 = 0;
  for (const p of panels) {
    for (let y = 0; y < p.height; y++) p.data.copy(out.data, (y * width + x0) * 4, y * p.width * 4, (y + 1) * p.width * 4);
    x0 += p.width + gap;
  }
  return out;
}

const frame = (key) => ({ file: `${MOCKUPS}/${key}@2x.png`, scale: 2 });
const shot = (dir, key) => ({ file: path.join(SHOTS, dir, `${key}.png`), scale: 2 });
const raw = (view) => ({ file: path.join(pulseDir(), 'pairs', 'F13', 'raw', `${view}.png`), scale: 2 });
const BOARD = { board: true, scale: 1 };
const KIT1 = { file: path.join(SHOTS, 'F13', 'F13-kit-board.png'), scale: 1 };

/** name → [figma source, app source, region in points, (app region when it differs)] — y 62+ skips the status bar the frames draw */
const PAIRS = [
  // the band as a kit specimen (the real ToastBand, the frame's own words, insets 62 / 34)
  ['band-style-studio-2', frame('style-studio-2'), raw('bands'), { x: 0, y: 62, w: 402, h: 58 }],
  ['band-record-workout-2', frame('workout-2'), raw('bands'), { x: 0, y: 62, w: 402, h: 58 }, { x: 0, y: 262, w: 402, h: 58 }],
  // the band raised by a real page of the built app (client page, equipment saved; replay + fixture)
  ['app-band-equipment-vs-style-studio-2', frame('style-studio-2'), shot('F13', 'F13-equipment-toast'), { x: 0, y: 62, w: 402, h: 58 }],
  // the offline line against the board's warn noticeLine (906, 3650) — same words
  ['offline-line-vs-board-warn', BOARD, raw('states'), { x: 906, y: 3650, w: 354, h: 44 }, { x: 24, y: 436, w: 354, h: 44 }],
  // the board's demo screen: the band before the chrome (F11's root-screen cell, the band handed in by F13)
  ['kit-board-root-screen-band', BOARD, KIT1, { x: 40, y: 4438, w: 402, h: 130 }],
];

fs.mkdirSync(OUT, { recursive: true });
const cache = new Map();
const load = (src) => {
  if (src.board) return boardPicture();
  if (!cache.has(src.file)) cache.set(src.file, fs.existsSync(src.file) ? decodePng(fs.readFileSync(src.file)) : null);
  return cache.get(src.file);
};
const only = process.argv.slice(2);
const index = {};
for (const [name, figSrc, appSrc, region, appRegion] of PAIRS) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const fig = load(figSrc);
  const app = load(appSrc);
  if (!fig || !app) {
    index[name] = { skipped: `missing ${!fig ? figSrc.file : appSrc.file}` };
    continue;
  }
  const a = cut(fig, figSrc.scale, region);
  const b = cut(app, appSrc.scale, appRegion ?? region);
  const d = diffPictures(a, b, { threshold: 8 });
  fs.writeFileSync(path.join(OUT, `${name}.png`), encodePng(sideBySide([a, b, d.picture])));
  index[name] = {
    panels: 'Figma | app | difference',
    region,
    figma: figSrc.board ? 'kepernyok-2x/_components-1..4.png (1x, doubled)' : figSrc.file,
    app: appSrc.file,
    differOver8: +(d.changed / d.total).toFixed(4),
    box: d.box ? { x: +(region.x + d.box.x / 2).toFixed(1), y: +(region.y + d.box.y / 2).toFixed(1), w: d.box.w / 2, h: d.box.h / 2 } : null,
  };
  console.log(`${name.padEnd(34)} differ ${(index[name].differOver8 * 100).toFixed(2)} %`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`pairs: ${OUT}`);
