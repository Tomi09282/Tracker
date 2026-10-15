// F10 scratch capture: serves ./dist, photographs the board and the frame pages in headless Chrome,
// measures them with the capture tool's own page probes, compares the boxes with the Figma export,
// and writes pairs (Figma | app | difference) under .pulse/pairs/F10/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.F10_FRONT || 'C:/Users/Petike/Documents/Cursor/tracker-wt/slot-5/frontend';
const SHOT = await import(pathToFileURL(path.join(FRONT, 'scripts', 'pulse-shot.mjs')).href);
const { launchChrome, openPage, decodePng, encodePng, compareGeometry, sleep } = SHOT;
const SRC = fs.readFileSync(path.join(FRONT, 'scripts', 'pulse-shot.mjs'), 'utf8');
const rawConst = (name) => {
  const start = SRC.indexOf(`const ${name} = String.raw\``);
  if (start < 0) throw new Error(`${name} not found in pulse-shot.mjs`);
  const from = SRC.indexOf('`', start) + 1;
  const to = SRC.indexOf('`;', from);
  return SRC.slice(from, to);
};
const PAGE_HELPERS = rawConst('PAGE_HELPERS');
const PAGE_PROBES = rawConst('PAGE_PROBES');

const GEO = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/geometry';
const PNG2X = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x';
const OUT = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/pairs/F10';
const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive: true });
const PORT = Number(process.env.F10_PORT || 5185);
const BOARD_Y = 1273; // _components-2.png starts at board y 1273 (lime week segment: board 2021, png row 748)

// ── a static server for ./dist
const DIST = path.join(HERE, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const ROOTS = {
  'home-1': ['Stat/Heti edzés', 'Week bar', 'Macro row'],
  'coins-1': ['Stat/Egyenleged'],
  'progress-1': ['Stat/Testsúly', 'Metric row'],
  'nutrition-1': ['Stat/Kalória', 'Progress', 'Macro row'],
  'workout-2': ['Clock', 'Progress/rest remaining'],
  'coach-dashboard-1': ['Stat/Kliensek'],
  'admin-1': ['Stat/Felhasználó'],
};

function subtree(geo, rootNames) {
  const byParent = new Map();
  for (const n of geo.nodes) {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  }
  const keep = [];
  const roots = [];
  for (const name of rootNames) {
    const r = geo.nodes.find((n) => n.name === name);
    if (!r) throw new Error(`no layer ${name} in ${geo.key}`);
    roots.push(r);
    const walk = (n) => {
      keep.push(n);
      for (const c of byParent.get(n.id) || []) walk(c);
    };
    walk(r);
  }
  return { nodes: keep, roots };
}

const union = (boxes, pad) => {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
};

function crop(img, { x, y, w, h }) {
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j, o = (j * w + i) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { out.data[o] = 11; out.data[o + 1] = 13; out.data[o + 2] = 10; out.data[o + 3] = 255; continue; }
      const s = (sy * img.width + sx) * 4;
      img.data.copy(out.data, o, s, s + 4);
    }
  }
  return out;
}

/** Figma | app | difference (bright = different), 24 px of a mid grey between the panels. */
function pairImage(a, b) {
  const gap = 24;
  const w = a.width * 3 + gap * 2, h = Math.max(a.height, b.height);
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let k = 0; k < w * h; k++) { out.data[k * 4] = 58; out.data[k * 4 + 1] = 58; out.data[k * 4 + 2] = 58; out.data[k * 4 + 3] = 255; }
  const put = (img, dx) => { for (let j = 0; j < img.height; j++) img.data.copy(out.data, (j * w + dx) * 4, j * img.width * 4, (j + 1) * img.width * 4); };
  put(a, 0);
  put(b, a.width + gap);
  let changed = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < a.width; i++) {
      const pa = (j * a.width + i) * 4, pb = (j * b.width + i) * 4, o = (j * w + 2 * (a.width + gap) + i) * 4;
      const d = Math.max(Math.abs(a.data[pa] - b.data[pb]), Math.abs(a.data[pa + 1] - b.data[pb + 1]), Math.abs(a.data[pa + 2] - b.data[pb + 2]));
      if (d > 48) changed++;
      const v = Math.min(255, d * 3);
      out.data[o] = v; out.data[o + 1] = v; out.data[o + 2] = v; out.data[o + 3] = 255;
    }
  }
  return { img: out, changed, total: a.width * a.height };
}

/** The ink of one figure measured in PIXELS: every pixel brighter than the canvas inside the window. */
function pixelInk(img, win, scale = 2) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const X0 = Math.max(0, Math.floor(win.x * scale)), Y0 = Math.max(0, Math.floor(win.y * scale));
  const X1 = Math.min(img.width, Math.ceil((win.x + win.w) * scale)), Y1 = Math.min(img.height, Math.ceil((win.y + win.h) * scale));
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const o = (y * img.width + x) * 4;
    if (Math.max(img.data[o], img.data[o + 1], img.data[o + 2]) > 70) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return { x: +(x0 / scale).toFixed(1), y: +(y0 / scale).toFixed(1), w: +((x1 + 1 - x0) / scale).toFixed(1), h: +((y1 + 1 - y0) / scale).toFixed(1) };
}
const isNumeralText = (t) => t && /Big Shoulders/i.test(t.fontFamily) && /^[\d\s.,:%+\-−–\/×x]+$/.test(t.characters) && t.ink;
function pixelNumerals(nodes, figma, app, scale = 2) {
  const out = [];
  for (const n of nodes) {
    if (n.type !== 'TEXT' || !isNumeralText(n.text)) continue;
    const ink = n.text.ink;
    const win = { x: ink.x - 4, y: ink.y - 4, w: ink.w + 8, h: ink.h + 8 };
    const f = pixelInk(figma, win, scale), a = pixelInk(app, win, scale);
    out.push({ text: n.text.characters, figmaExport: ink, figmaPixels: f, appPixels: a, delta: f && a ? { dx: +(a.x - f.x).toFixed(1), dy: +(a.y - f.y).toFixed(1), dw: +(a.w - f.w).toFixed(1), dh: +(a.h - f.h).toFixed(1) } : null });
  }
  return out;
}
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
function rootPairs(key, roots, figma, app) {
  const out = [];
  for (const r of roots) {
    const region = union([r], 12);
    const r2 = { x: region.x * 2, y: region.y * 2, w: region.w * 2, h: region.h * 2 };
    const pair = pairImage(crop(figma, r2), crop(app, r2));
    const file = path.join(OUT, `${key}.${slug(r.name)}.pair.png`);
    fs.writeFileSync(file, encodePng(pair.img));
    out.push({ layer: r.name, file: path.basename(file), pixelsDifferent: `${((100 * pair.changed) / pair.total).toFixed(2)} %` });
  }
  return out;
}

async function capture(browser, hash, { width, height, scale }) {
  const page = await openPage(browser, { width, height });
  try {
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await page.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#${hash}` });
    await sleep(600);
    await page.evaluate('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))', { timeout: 20000 });
    await sleep(900); // a roll-on-mount or a bar FLIP would be long over
    const fonts = await page.evaluate(`[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight)`);
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
    await page.evaluate(PAGE_HELPERS);
    const facts = await page.evaluate(PAGE_PROBES);
    const giant = await page.evaluate(`[...document.querySelectorAll('.text-giant')].map((el) => { const cs = getComputedStyle(el); return { kit: el.getAttribute('data-kit'), text: el.textContent, family: cs.fontFamily.split(',')[0], weight: cs.fontWeight, lineHeight: cs.lineHeight, fontSize: cs.fontSize, letterSpacing: cs.letterSpacing, inlineFontSize: el.style.fontSize, classes: el.className }; })`);
    return { png: Buffer.from(shot.data, 'base64'), facts, fonts, giant };
  } finally {
    await page.close();
  }
}

const browser = await launchChrome({ windowSize: [1300, 1400] });
const summary = { generated: new Date().toISOString(), chrome: browser.product, frames: {}, board: null, widths: {} };
try {
  // ── frames at 402, scale 2
  for (const [key, rootNames] of Object.entries(ROOTS)) {
    const geo = JSON.parse(fs.readFileSync(path.join(GEO, `${key}.json`), 'utf8'));
    const { nodes, roots } = subtree(geo, rootNames);
    const shot = await capture(browser, key, { width: 402, height: 874, scale: 2 });
    fs.writeFileSync(path.join(RAW, `${key}.app@2x.png`), shot.png);
    const g = compareGeometry({ ...geo, nodes }, shot.facts, {});
    const figma = decodePng(fs.readFileSync(path.join(PNG2X, `${key}@2x.png`)));
    const app = decodePng(shot.png);
    const pairs = rootPairs(key, roots, figma, app);
    const pixels = pixelNumerals(nodes, figma, app);
    summary.frames[key] = {
      pairs,
      pixels,
      pass: g.pass,
      counts: g.counts,
      deviating: g.deviating.map((d) => ({ name: d.name, text: d.text, delta: d.delta, measured: d.measured })),
      style: g.style.map((s) => ({ name: s.name, text: s.text, wrong: s.wrong })),
      unmatched: g.unmatched.map((u) => ({ name: u.name, text: u.text, kit: u.kit, inside: u.inside })),
      numerals: g.matched.filter((m) => m.measured === 'ink').map((m) => ({ text: m.text, figma: m.box && undefined, delta: m.delta })),
      fontsProbe: shot.facts.fonts.numerals,
      giant: shot.giant,
    };
    fs.writeFileSync(path.join(RAW, `${key}.geometry.json`), JSON.stringify(g, null, 2));
  }
  // ── the giant at 360 (acceptance: computed family, weight, line height equal the step)
  for (const key of ['coins-1', 'home-1']) {
    const shot = await capture(browser, key, { width: 360, height: 874, scale: 2 });
    fs.writeFileSync(path.join(RAW, `${key}.app-360@2x.png`), shot.png);
    summary.widths[`${key}@360`] = shot.giant;
  }
  summary.widths['coins-1@402'] = summary.frames['coins-1'].giant;
  summary.widths['home-1@402'] = summary.frames['home-1'].giant;
  // the static countdown, for the record
  {
    const shot = await capture(browser, 'workout-2-static', { width: 402, height: 874, scale: 2 });
    fs.writeFileSync(path.join(RAW, 'workout-2-static.app@2x.png'), shot.png);
    const geo = JSON.parse(fs.readFileSync(path.join(GEO, 'workout-2.json'), 'utf8'));
    const { nodes, roots } = subtree(geo, ['Clock']);
    const g = compareGeometry({ ...geo, nodes }, shot.facts, {});
    const figma = decodePng(fs.readFileSync(path.join(PNG2X, 'workout-2@2x.png')));
    const app = decodePng(shot.png);
    const pairs = rootPairs('workout-2-static', roots, figma, app);
    summary.frames['workout-2-static'] = { pass: g.pass, counts: g.counts, pairs, pixels: pixelNumerals(nodes, figma, app), deviating: g.deviating.map((d) => ({ text: d.text, delta: d.delta })) };
  }
  // ── the board, scale 1, against _components-2.png
  {
    const shot = await capture(browser, 'board', { width: 1300, height: 1313, scale: 1 });
    fs.writeFileSync(path.join(RAW, 'board.app.png'), shot.png);
    const geo = JSON.parse(fs.readFileSync(path.join(GEO, '_components.json'), 'utf8'));
    const col = geo.nodes.find((n) => n.name === 'Column 3');
    const cells = geo.nodes.filter((n) => n.parentId === col.id).slice(0, 4);
    const { nodes } = subtree({ ...geo, key: '_components' }, []);
    void nodes;
    const keep = [];
    const byParent = new Map();
    for (const n of geo.nodes) { if (!byParent.has(n.parentId)) byParent.set(n.parentId, []); byParent.get(n.parentId).push(n); }
    const walk = (n) => { keep.push(n); for (const c of byParent.get(n.id) || []) walk(c); };
    for (const c of cells) for (const k of byParent.get(c.id) || []) walk(k);
    const shift = (n) => ({ ...n, y: n.y - BOARD_Y, visibleBox: undefined, text: n.text ? { ...n.text, ink: n.text.ink ? { ...n.text.ink, y: n.text.ink.y - BOARD_Y } : null } : undefined });
    const g = compareGeometry({ ...geo, nodes: keep.map(shift) }, shot.facts, {});
    const region = union(cells.map((c) => ({ x: c.x, y: c.y - BOARD_Y, w: c.w, h: c.h })), 12);
    const figma = decodePng(fs.readFileSync(path.join(PNG2X, '_components-2.png')));
    const pair = pairImage(crop(figma, region), crop(decodePng(shot.png), region));
    fs.writeFileSync(path.join(OUT, 'board-column3.pair.png'), encodePng(pair.img));
    // the whole board shot (column 3 at the board's place, the extra cells in columns 1 and 2)
    summary.board = {
      region,
      pass: g.pass,
      counts: g.counts,
      deviating: g.deviating.map((d) => ({ name: d.name, text: d.text, delta: d.delta, measured: d.measured, kit: d.kit })),
      style: g.style.map((s) => ({ name: s.name, text: s.text, wrong: s.wrong })),
      unmatched: g.unmatched.map((u) => ({ name: u.name, text: u.text, kit: u.kit, inside: u.inside })),
      pixelsDifferent: `${pair.changed} of ${pair.total} (${((100 * pair.changed) / pair.total).toFixed(2)} %)`,
      pixels: pixelNumerals(keep.map(shift), figma, decodePng(shot.png), 1),
    };
    fs.writeFileSync(path.join(RAW, 'board.geometry.json'), JSON.stringify(g, null, 2));
    // scale 2 for detail
    const shot2 = await capture(browser, 'board', { width: 1300, height: 1313, scale: 2 });
    fs.writeFileSync(path.join(RAW, 'board.app@2x.png'), shot2.png);
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
const brief = Object.fromEntries(Object.entries(summary.frames).map(([k, v]) => [k, { pass: v.pass, deviating: v.deviating.length, style: v.style?.length, unmatched: v.unmatched?.length, pairs: v.pairs.map((p) => p.layer + ' ' + p.pixelsDifferent).join(' | '), ink: v.pixels.map((p) => p.text + ' ' + JSON.stringify(p.delta)).join(' | ') }]));
console.log(JSON.stringify({ frames: brief, board: summary.board && { ink: summary.board.pixels.map((p) => p.text + ' ' + JSON.stringify(p.delta)).join(' | '), pass: summary.board.pass, deviating: summary.board.deviating.length, style: summary.board.style.length, unmatched: summary.board.unmatched.length, px: summary.board.pixelsDifferent } }, null, 1));
