// usage: node pair.mjs <figma.png> <app.png> <out.png> x y w h [scale]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const shot = await import(pathToFileURL('C:/Users/Petike/Documents/Cursor/tracker-wt/slot-6/frontend/scripts/pulse-shot.mjs').href);
const [fig, app, out, x, y, w, h, sc = '1'] = process.argv.slice(2);
const X = +x, Y = +y, W = +w, H = +h, K = +sc;
const a = shot.decodePng(fs.readFileSync(fig)), b = shot.decodePng(fs.readFileSync(app));
const GAP = 8 * K;
const OW = W * K * 3 + GAP * 2, OH = H * K;
const o = Buffer.alloc(OW * OH * 4, 0);
for (let i = 0; i < OW * OH; i++) { o[i * 4] = 60; o[i * 4 + 1] = 60; o[i * 4 + 2] = 60; o[i * 4 + 3] = 255; }
const px = (img, xx, yy) => { const i = (yy * img.width + xx) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
for (let yy = 0; yy < OH; yy++) for (let xx = 0; xx < W * K; xx++) {
  const sx = X + Math.floor(xx / K), sy = Y + Math.floor(yy / K);
  const p = px(a, sx, sy), q = px(b, sx, sy);
  const d = Math.min(255, (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) * 2);
  for (const [off, c] of [[0, p], [W * K + GAP, q], [2 * (W * K + GAP), [d, d, d]]]) {
    const i = (yy * OW + xx + off) * 4; o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
  }
}
fs.writeFileSync(out, shot.encodePng({ width: OW, height: OH, data: o }));
console.log('wrote', out, OW + 'x' + OH, 'figma', a.width + 'x' + a.height, 'app', b.width + 'x' + b.height);
