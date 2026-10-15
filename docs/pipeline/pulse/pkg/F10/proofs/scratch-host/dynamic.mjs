// F10 scratch: the changing states (roll, tick, bar), reduced motion, and the no-text-box fallback.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = 'C:/Users/Petike/Documents/Cursor/tracker-wt/slot-5/frontend';
const { launchChrome, openPage, sleep } = await import(pathToFileURL(path.join(FRONT, 'scripts', 'pulse-shot.mjs')).href);
const OUT = 'C:/Users/Petike/Documents/Cursor/tracker/.pulse/pairs/F10';
const RAW = path.join(OUT, 'raw');
const PORT = 5185;
const DIST = path.join(HERE, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const result = {};
const errors = [];
const browser = await launchChrome({ windowSize: [1300, 1400] });

async function open(hash, { width = 1300, height = 1313, scale = 1, reduced = false, noTrim = false } = {}) {
  const page = await openPage(browser, { width, height });
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  page.on('Runtime.exceptionThrown', (p) => errors.push(`${hash}: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`));
  page.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') errors.push(`${hash} console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`); });
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  if (reduced) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (noTrim) {
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => { const o = CSS.supports.bind(CSS); CSS.supports = (a, b) => (String(a).startsWith('text-box') || String(b ?? '').startsWith('text-box') ? false : b === undefined ? o(a) : o(a, b));
        document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '* { text-box: normal !important; }'; document.head.appendChild(s); }); })();`,
    });
  }
  await page.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#${hash}` });
  await sleep(700);
  await page.evaluate('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))', { timeout: 20000 });
  await sleep(500);
  return page;
}

const BOXES = `[...document.querySelectorAll('[data-kit="numeral"],[data-kit="fraction"],[data-kit="statBlock"]')].map((el) => { const r = el.getBoundingClientRect(); return { kit: el.getAttribute('data-kit'), text: el.textContent.trim().slice(0, 24), x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; })`;

try {
  // 1 — the changing cell: switch on, catch a roll in flight, then let everything settle
  {
    const page = await open('board', { scale: 2 });
    await page.evaluate(`(() => { const s = document.querySelector('[role="switch"]'); s.scrollIntoView({ block: 'center' }); s.click(); return true; })()`);
    const frames = [];
    const t0 = Date.now();
    for (const t of [1050, 1150, 2060, 2160, 2300]) {
      await sleep(Math.max(0, t - (Date.now() - t0)));
      const shot = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(RAW, `changing-${frames.length}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      const state = await page.evaluate(`({ rolling: document.querySelectorAll('[data-roll]').length, out: document.querySelectorAll('[data-roll="out"]').length, anims: document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.effect?.target?.getAttribute?.('data-roll') || a.animationName || a.constructor.name) })`);
      frames.push({ file: path.basename(file), ...state });
    }
    await sleep(2500);
    // stop the cycle and let the last roll land
    await page.evaluate(`document.querySelector('[role="switch"]').click()`);
    await sleep(1500);
    const settled = await page.evaluate(`({ rolling: document.querySelectorAll('[data-roll]').length, numerals: ${BOXES}.filter((b) => b.y > 0) })`);
    result.changing = { frames, settledAfterStop: settled.rolling === 0, numeralsAfterStop: settled.numerals.slice(-6) };
    await page.close();
  }
  // 2 — reduced motion: no animation is ever started
  {
    const page = await open('board', { reduced: true });
    await page.evaluate(`document.querySelector('[role="switch"]').click()`);
    let maxAnims = 0, maxLayers = 0;
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      const s = await page.evaluate(`({ a: document.getAnimations().filter((a) => a.playState === 'running' && !a.animationName).length, l: document.querySelectorAll('[data-roll="out"]').length })`);
      maxAnims = Math.max(maxAnims, s.a); maxLayers = Math.max(maxLayers, s.l);
    }
    result.reducedMotion = { runningScriptAnimations: maxAnims, outgoingLayers: maxLayers };
    await page.close();
  }
  // 3 — the fallback: no text-box support -> the same boxes from the face tokens
  {
    const native = await open('coins-1', { width: 402, height: 874 });
    const a = await native.evaluate(BOXES);
    const b0 = await native.evaluate(`({ trims: CSS.supports('text-box', 'trim-both cap alphabetic') })`);
    await native.close();
    const fb = await open('coins-1', { width: 402, height: 874, noTrim: true });
    const b = await fb.evaluate(BOXES);
    const b1 = await fb.evaluate(`({ trims: CSS.supports('text-box', 'trim-both cap alphabetic'), marginTop: getComputedStyle(document.querySelector('[data-kit="numeral"] > span')).marginTop, marginBottom: getComputedStyle(document.querySelector('[data-kit="numeral"] > span')).marginBottom })`);
    const shot = await fb.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(RAW, 'coins-1.fallback.png'), Buffer.from(shot.data, 'base64'));
    await fb.close();
    const fbHome = await open('home-1', { width: 402, height: 874, noTrim: true });
    const c = await fbHome.evaluate(BOXES);
    await fbHome.close();
    const nativeHome = await open('home-1', { width: 402, height: 874 });
    const d = await nativeHome.evaluate(BOXES);
    await nativeHome.close();
    result.fallback = { native: { ...b0, coins: a, home: d }, withoutTextBox: { ...b1, coins: b, home: c } };
  }
} finally {
  await browser.close();
  server.close();
}
result.errors = errors;
fs.writeFileSync(path.join(OUT, 'dynamic.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
