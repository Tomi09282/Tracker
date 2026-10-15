import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const shot = await import(pathToFileURL('C:/Users/Petike/Documents/Cursor/tracker-wt/slot-6/frontend/scripts/pulse-shot.mjs').href);
const [file, ...boxes] = process.argv.slice(2);
const img = shot.decodePng(fs.readFileSync(file));
for (const b of boxes) {
  const [x0, y0, x1, y1] = b.split(',').map(Number);
  let l = 1e9, r = -1, t = 1e9, bo = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; const v = Math.max(img.data[i], img.data[i + 1], img.data[i + 2]); if (v > 90) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); bo = Math.max(bo, y); } }
  console.log(b.padEnd(22), 'ink', l, t, 'w', r + 1 - l, 'h', bo + 1 - t);
}
