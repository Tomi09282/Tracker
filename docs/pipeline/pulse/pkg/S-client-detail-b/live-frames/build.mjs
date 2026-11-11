#!/usr/bin/env node
// The live-height twins of the two SHORTENED frames of S-client-detail-b.
//
// client-detail-2 and client-detail-3 leave out the profile block that stands between the view
// switch and the identity header on the live page (their board notes: "Rövidített képernyő" — the
// part of client-detail-1 between y 327 and 1013 is not repeated). The capture tool compares the
// rendered page with the frame at absolute y, so a capture of the live page can never line up with
// them. This script writes, for each frame, a twin that is the SAME frame with everything from the
// view switch down (y >= 327: the switch, the tab body, the fade and the tab bar) moved down by the
// measured profile height DELTA (live-frames/delta.txt):
//
//   <pulse>/geometry/client-detail-<n>.live.json      the geometry, every box (and ink box) of a
//                                                      layer at y >= 327 moved by DELTA; the frame
//                                                      DELTA taller; source.derivedFrom says so
//   <pulse>/pairs/S-client-detail-b/live-frames/client-detail-<n>.live@2x.png
//                                                      the PNG: rows above 327 of the frame, then a
//                                                      DELTA-high band cut from client-detail-1 at
//                                                      327 (the profile block itself, for the eye
//                                                      only - the states mask it), then the rest
//
// The header and the band belong to S-client-detail-a and are masked by the *-live states; nothing
// of this package is compared against anything but its own frame.
//
// Run from the slot: node docs/pipeline/pulse/pkg/S-client-detail-b/live-frames/build.mjs
// and capture with PULSE_FRAME_PNGS=<pulse>/pairs/S-client-detail-b/live-frames.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..', '..', '..');
const shot = await import(pathToFileURL(path.join(REPO, 'frontend', 'scripts', 'pulse-shot.mjs')).href);
const { decodePng, encodePng, pulseDir, geometryFile, FRAME_PNG_DIR } = shot;

const CUT = 327; // the view switch's top in both frames
const DELTA = Number(fs.readFileSync(path.join(HERE, 'delta.txt'), 'utf8').trim());
if (!Number.isFinite(DELTA) || Math.round(DELTA * 2) !== DELTA * 2) throw new Error(`delta ${DELTA} must be a multiple of 0.5 (whole 2x rows)`);
const pngOut = path.join(pulseDir(), 'pairs', 'S-client-detail-b', 'live-frames');
fs.mkdirSync(pngOut, { recursive: true });
const ORIGINAL_PNGS = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x';
const pngDir = fs.existsSync(path.join(FRAME_PNG_DIR, 'client-detail-1@2x.png')) ? FRAME_PNG_DIR : ORIGINAL_PNGS;

// client-detail-3 draws two charts; the page draws up to three (one per distinct exercise with a record, cap 3)
// and the frame's own board note says the third is left out for want of sample data. Its twin therefore also
// opens a band of one chart (197) + the gap (32) above Rekordok (frame y 881), painted in the canvas colour:
// what the app draws there is the third chart, and nothing below it is judged out of place for it.
const EXTRA = { 3: { at: 881, h: 229 } };
const shiftOf = (n, y) => (y < CUT ? 0 : DELTA + (EXTRA[n] && y >= EXTRA[n].at ? EXTRA[n].h : 0));

for (const n of [2, 3]) {
  const key = `client-detail-${n}`;
  const geo = JSON.parse(fs.readFileSync(geometryFile(key), 'utf8'));
  const live = {
    ...geo,
    key: `${key}.live`,
    frame: { ...geo.frame, height: +(geo.frame.height + DELTA + (EXTRA[n]?.h ?? 0)).toFixed(2) },
    source: { ...geo.source, derivedFrom: `${key} (S-client-detail-b live-frames/build.mjs): every layer at y >= ${CUT} moved down by ${DELTA} pt, the measured height of the profile block the shortened frame leaves out${EXTRA[n] ? `; from y ${EXTRA[n].at} a further ${EXTRA[n].h} pt for the third chart the frame leaves out` : ''}` },
    nodes: geo.nodes.map((node) => {
      const d = shiftOf(n, node.y);
      if (!d) return node;
      const move = (b) => (b && typeof b.y === 'number' ? { ...b, y: +(b.y + shiftOf(n, b.y)).toFixed(2) } : b);
      const out = { ...node, y: +(node.y + d).toFixed(2) };
      if (node.visibleBox) out.visibleBox = move(node.visibleBox);
      if (node.text && node.text.ink) out.text = { ...node.text, ink: move(node.text.ink) };
      return out;
    }),
  };
  fs.writeFileSync(path.join(pulseDir(), 'geometry', `${key}.live.json`), `${JSON.stringify(live, null, 1)}\n`);

  const frame = decodePng(fs.readFileSync(path.join(pngDir, `${key}@2x.png`)));
  const profile = decodePng(fs.readFileSync(path.join(pngDir, 'client-detail-1@2x.png')));
  const cut = CUT * 2;
  const band = DELTA * 2;
  const extra = EXTRA[n] ? { at: EXTRA[n].at * 2, h: EXTRA[n].h * 2 } : null;
  const W = frame.width;
  const H = frame.height + band + (extra ? extra.h : 0);
  const data = Buffer.alloc(W * H * 4);
  const row = W * 4;
  frame.data.copy(data, 0, 0, cut * row);
  for (let y = 0; y < band; y++) {
    const src = Math.min(profile.height - 1, cut + y);
    profile.data.copy(data, (cut + y) * row, src * row, (src + 1) * row);
  }
  if (!extra) frame.data.copy(data, (cut + band) * row, cut * row, frame.height * row);
  else {
    frame.data.copy(data, (cut + band) * row, cut * row, extra.at * row);
    const bg = frame.data.subarray((extra.at - 4) * row, (extra.at - 4) * row + 4); // the canvas, 2 pt above the rule
    for (let y = 0; y < extra.h; y++) for (let x = 0; x < W; x++) bg.copy(data, ((extra.at + band + y) * W + x) * 4);
    frame.data.copy(data, (extra.at + band + extra.h) * row, extra.at * row, frame.height * row);
  }
  fs.writeFileSync(path.join(pngOut, `${key}.live@2x.png`), encodePng({ width: W, height: H, data }));
  console.log(`${key}.live: ${live.nodes.filter((x, i) => x.y !== geo.nodes[i].y).length} layers moved, frame ${W / 2} x ${H / 2}`);
}
