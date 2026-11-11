#!/usr/bin/env node
/*
 * kit-board-tiles — the kit board capture laid over the Figma component board (PLAN.md 3.4, 5.2 row 2).
 *
 *   node docs/pipeline/pulse/pkg/_int/kit-board-tiles.mjs [<capture.png>] [--out <dir>]
 *
 * The capture is the `kit-board` state of `pkg/F7/states.json` (`/playground`, board layout,
 * 1300 x 5094, scale 1), taken by `pulse-verify --package F7 --live`; by default the newest
 * `kit-board*.png` in `.pulse/shots/F7/`.
 *
 * The Figma board was exported as four slices, `_components-1..4.png`, 1300 wide, each repeating
 * the last rows of the one before it. They are stitched back into the 1300 x 5094 board (the
 * overlap is found, not assumed: the first rows of a slice are matched against the end of the
 * previous one), and the pair is written by the capture tool's own `writeTiles` — frame | app |
 * difference, at most 874 pt per tile — so the board is judged exactly like a frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..', '..');
const shot = await import(pathToFileURL(path.join(REPO, 'frontend', 'scripts', 'pulse-shot.mjs')).href);
const { FRAME_PNG_DIR, decodePng, encodePng, pulseDir, writeTiles } = shot;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\n?/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}
const outAt = args.indexOf('--out');
const outDir = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(pulseDir(), 'shots', 'F7');
const given = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

function newestCapture() {
  const dir = path.join(pulseDir(), 'shots', 'F7');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^kit-board(\.[\w-]+)*\.png$/.test(f) && !/\.(tile-\d+|overview|FAILED)\.png$/.test(f) && !f.includes('.board.'))
    : [];
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  if (!files.length) throw new Error(`no kit-board capture in ${dir} — run: node scripts/pulse-verify.mjs --package F7 --live (cwd frontend/)`);
  return path.join(dir, files[0]);
}

/** How many rows the top of `b` repeats from the bottom of `a` (the largest exact match of 40+ rows). */
function overlapOf(a, b) {
  const rowBytes = a.width * 4;
  const same = (ya, yb) => {
    const oa = ya * rowBytes;
    const ob = yb * rowBytes;
    for (let i = 0; i < rowBytes; i++) if (Math.abs(a.data[oa + i] - b.data[ob + i]) > 2) return false;
    return true;
  };
  let best = 0;
  for (let ov = 8; ov <= Math.min(400, a.height, b.height); ov++) {
    let ok = true;
    for (let r = 0; r < ov && ok; r++) ok = same(a.height - ov + r, r);
    if (ok) best = ov;
  }
  return best;
}

function stitchBoard() {
  const slices = [1, 2, 3, 4].map((n) => {
    const file = path.join(FRAME_PNG_DIR, `_components-${n}.png`);
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    return decodePng(fs.readFileSync(file));
  });
  const width = slices[0].width;
  const rows = [];
  const overlaps = [];
  slices.forEach((pic, i) => {
    if (pic.width !== width) throw new Error(`slice ${i + 1} is ${pic.width} px wide, not ${width}`);
    const skip = i === 0 ? 0 : overlapOf(slices[i - 1], pic);
    if (i > 0) overlaps.push(skip);
    for (let y = skip; y < pic.height; y++) rows.push(pic.data.subarray(y * width * 4, (y + 1) * width * 4));
  });
  const data = Buffer.alloc(width * rows.length * 4);
  rows.forEach((row, y) => data.set(row, y * width * 4));
  return { picture: { width, height: rows.length, data }, overlaps };
}

const capture = given ? path.resolve(given) : newestCapture();
const { picture, overlaps } = stitchBoard();
fs.mkdirSync(outDir, { recursive: true });
const boardFile = path.join(outDir, '_components.board.png');
fs.writeFileSync(boardFile, encodePng(picture));
const base = path.join(outDir, path.basename(capture, '.png') + '.board');
const result = writeTiles(base, boardFile, fs.readFileSync(capture), { scale: 1 });
console.log(JSON.stringify({ capture, board: { file: boardFile, width: picture.width, height: picture.height, overlaps }, ...result }, null, 2));
