// F10 stage-2 scratch capture: serves ./dist, photographs the board cells and the frame pages in
// headless Chrome, measures them with the capture tool's own page probes and compareGeometry, measures
// the INK of every text and glyph in pixels (frame PNG against app capture), and writes pairs
// (Figma | app | difference) under .pulse/pairs/F10/.
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
  return SRC.slice(from, SRC.indexOf('`;', from));
};
const PAGE_HELPERS = rawConst('PAGE_HELPERS');
const PAGE_PROBES = rawConst('PAGE_PROBES');

const GEO = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/geometry';
const PNG2X = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x';
const BOARD_PNG = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/pairs/F10/kit-board/_components.board.png'; // the four slices stitched, 1300 x 5094, board y = png y
const OUT = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/pairs/F10';
const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive: true });
const PORT = Number(process.env.F10_PORT || 5185);
const BOARD_Y0 = 2080;

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
  'settings-1': ['Ledger'],
  'coach-dashboard-1': ['Counts'],
  'client-detail-2': ['Ledger row/Reggeli', 'Ledger row/Ebéd', 'Ledger row/Edzés utáni', 'Ledger row/Vacsora'],
  'onboarding-3': ['Step bar'],
};

const byParentOf = (nodes) => {
  const m = new Map();
  for (const n of nodes) {
    if (!m.has(n.parentId)) m.set(n.parentId, []);
    m.get(n.parentId).push(n);
  }
  return m;
};
function subtree(geo, roots) {
  const byParent = byParentOf(geo.nodes);
  const keep = [];
  const walk = (n) => {
    keep.push(n);
    for (const c of byParent.get(n.id) || []) walk(c);
  };
  for (const r of roots) walk(r);
  return keep;
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
      img.data.copy(out.data, o, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
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

/** The ink inside a window, in pt: every pixel clearly brighter than the canvas. */
function pixelInk(img, win, scale, threshold = 60) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const X0 = Math.max(0, Math.floor(win.x * scale)), Y0 = Math.max(0, Math.floor(win.y * scale));
  const X1 = Math.min(img.width, Math.ceil((win.x + win.w) * scale)), Y1 = Math.min(img.height, Math.ceil((win.y + win.h) * scale));
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const o = (y * img.width + x) * 4;
    if (Math.max(img.data[o], img.data[o + 1], img.data[o + 2]) > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return { x: +(x0 / scale).toFixed(1), y: +(y0 / scale).toFixed(1), w: +((x1 + 1 - x0) / scale).toFixed(1), h: +((y1 + 1 - y0) / scale).toFixed(1) };
}

/**
 * Ink of every TEXT (its exported ink box) and every glyph / segment (its box), measured in the
 * frame's PNG and in the app capture inside the same window: dx / dy / dw / dh in pt.
 */
function inkTable(nodes, figma, app, scale, dy0 = 0) {
  const out = [];
  for (const n of nodes) {
    let box = null, what = null;
    if (n.type === 'TEXT' && n.text?.ink) { box = n.text.ink; what = n.text.characters; }
    else if (/^glyph\//.test(n.name) || /^Segment\//.test(n.name) || n.name === 'Image/coin' || n.name === 'Sparkline') { box = { x: n.x, y: n.y, w: n.w, h: n.h }; what = n.name; }
    if (!box) continue;
    const win = { x: box.x - 3, y: box.y - dy0 - 3, w: box.w + 6, h: box.h + 6 };
    const f = pixelInk(figma, win, scale), a = pixelInk(app, win, scale);
    out.push({ what, figma: f, app: a, delta: f && a ? { dx: +(a.x - f.x).toFixed(1), dy: +(a.y - f.y).toFixed(1), dw: +(a.w - f.w).toFixed(1), dh: +(a.h - f.h).toFixed(1) } : null });
  }
  return out;
}
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

async function capture(browser, hash, { width, height, scale }) {
  const page = await openPage(browser, { width, height });
  try {
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await page.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#${hash}` });
    await sleep(600);
    await page.evaluate('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))', { timeout: 20000 });
    await sleep(700);
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
    await page.evaluate(PAGE_HELPERS);
    const facts = await page.evaluate(PAGE_PROBES);
    return { png: Buffer.from(shot.data, 'base64'), facts };
  } finally {
    await page.close();
  }
}

const browser = await launchChrome({ windowSize: [1300, 1700] });
const summary = { generated: new Date().toISOString(), chrome: browser.product, frames: {}, board: null };
try {
  for (const [key, rootNames] of Object.entries(ROOTS)) {
    const geo = JSON.parse(fs.readFileSync(path.join(GEO, `${key}.json`), 'utf8'));
    const roots = rootNames.map((name) => {
      const r = geo.nodes.find((n) => n.name === name);
      if (!r) throw new Error(`no layer ${name} in ${key}`);
      return r;
    });
    const nodes = subtree(geo, roots);
    const shot = await capture(browser, key, { width: 402, height: geo.frame.height, scale: 2 });
    fs.writeFileSync(path.join(RAW, `${key}.s2.app@2x.png`), shot.png);
    const g = compareGeometry({ ...geo, nodes }, shot.facts, {});
    const figma = decodePng(fs.readFileSync(path.join(PNG2X, `${key}@2x.png`)));
    const app = decodePng(shot.png);
    const pairs = [];
    const region = union(roots, 12);
    const r2 = { x: region.x * 2, y: region.y * 2, w: region.w * 2, h: region.h * 2 };
    if (roots.length > 1 && region.h > 400) {
      for (const r of roots) {
        const one = union([r], 12);
        const p = pairImage(crop(figma, { x: one.x * 2, y: one.y * 2, w: one.w * 2, h: one.h * 2 }), crop(app, { x: one.x * 2, y: one.y * 2, w: one.w * 2, h: one.h * 2 }));
        const file = `${key}.${slug(r.name)}.pair.png`;
        fs.writeFileSync(path.join(OUT, file), encodePng(p.img));
        pairs.push({ layer: r.name, file, pixelsDifferent: `${((100 * p.changed) / p.total).toFixed(2)} %` });
      }
    } else {
      const p = pairImage(crop(figma, r2), crop(app, r2));
      const file = `${key}.${slug(rootNames.join(' '))}.pair.png`;
      fs.writeFileSync(path.join(OUT, file), encodePng(p.img));
      pairs.push({ layer: rootNames.join(' + '), file, pixelsDifferent: `${((100 * p.changed) / p.total).toFixed(2)} %` });
    }
    summary.frames[key] = {
      pairs,
      ink: inkTable(nodes, figma, app, 2),
      pass: g.pass,
      counts: g.counts,
      deviating: g.deviating.map((d) => ({ name: d.name, text: d.text, delta: d.delta, measured: d.measured })),
      style: g.style.map((s) => ({ name: s.name, text: s.text, wrong: s.wrong })),
      unmatched: g.unmatched.map((u) => ({ name: u.name, text: u.text, kit: u.kit })),
    };
    fs.writeFileSync(path.join(RAW, `${key}.s2.geometry.json`), JSON.stringify(g, null, 2));
  }
  // ── the board, scale 1: the count cell (stepper) and the ledgerRow cell against the stitched board
  {
    const shot = await capture(browser, 'board', { width: 1300, height: 1700, scale: 1 });
    fs.writeFileSync(path.join(RAW, 'board-s2.app.png'), shot.png);
    const geo = JSON.parse(fs.readFileSync(path.join(GEO, '_components.json'), 'utf8'));
    const cells = ['80:567', '80:486'].map((id) => geo.nodes.find((n) => n.id === id));
    const nodes = subtree(geo, cells);
    const shift = (n) => ({ ...n, y: n.y - BOARD_Y0, visibleBox: undefined, text: n.text ? { ...n.text, ink: n.text.ink ? { ...n.text.ink, y: n.text.ink.y - BOARD_Y0 } : null } : undefined });
    const g = compareGeometry({ ...geo, nodes: nodes.map(shift) }, shot.facts, {});
    const board = decodePng(fs.readFileSync(BOARD_PNG));
    const figma = crop(board, { x: 0, y: BOARD_Y0, w: 1300, h: 1700 });
    const app = decodePng(shot.png);
    const pairs = [];
    for (const c of cells) {
      const region = union([{ ...c, y: c.y - BOARD_Y0 }], 12);
      const p = pairImage(crop(figma, region), crop(app, region));
      const file = `board.${slug(c.name)}-cell.pair.png`;
      fs.writeFileSync(path.join(OUT, file), encodePng(p.img));
      pairs.push({ cell: c.name, file, pixelsDifferent: `${((100 * p.changed) / p.total).toFixed(2)} %` });
    }
    // the states cell (not on the Figma board) for the record
    fs.writeFileSync(path.join(OUT, 'board.ledgerrow-states.app.png'), encodePng(crop(app, { x: 28, y: 8, w: 380, h: 760 })));
    summary.board = {
      pairs,
      ink: inkTable(nodes.map(shift), figma, app, 1),
      pass: g.pass,
      counts: g.counts,
      deviating: g.deviating.map((d) => ({ name: d.name, text: d.text, delta: d.delta, measured: d.measured, kit: d.kit })),
      style: g.style.map((s) => ({ name: s.name, text: s.text, wrong: s.wrong })),
      unmatched: g.unmatched.map((u) => ({ name: u.name, text: u.text, kit: u.kit })),
    };
    fs.writeFileSync(path.join(RAW, 'board-s2.geometry.json'), JSON.stringify(g, null, 2));
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(OUT, 'summary-s2.json'), JSON.stringify(summary, null, 2));
const brief = (v) => ({
  pass: v.pass,
  counts: v.counts,
  deviating: v.deviating.map((d) => `${d.text ?? d.name} ${JSON.stringify(d.delta)}`),
  style: v.style.length,
  pairs: v.pairs.map((p) => `${p.file} ${p.pixelsDifferent}`),
  ink: v.ink.map((p) => `${String(p.what).slice(0, 18)} ${p.delta ? `${p.delta.dx},${p.delta.dy},${p.delta.dw},${p.delta.dh}` : 'n/a'}`),
});
console.log(JSON.stringify({ frames: Object.fromEntries(Object.entries(summary.frames).map(([k, v]) => [k, brief(v)])), board: brief(summary.board) }, null, 1));
