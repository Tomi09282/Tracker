#!/usr/bin/env node
// F12 evidence harness — captures the REAL Field (built with the tree's own vite.config.ts) for the pairs.
//
//   cwd: <slot>/frontend
//   node ../docs/pipeline/pulse/pkg/F12/evidence/f12-shot.mjs [--port 5182] [--out <dir>] [--keep]
//
// 1 copies ./kit-entry to frontend/f12-kit.local/ (git-ignored by `*.local`)
// 2 takes one heavy lock (.pulse/locks/heavy-1|2, mkdir), builds that entry into a scratch folder,
//   serves it with `vite preview` on the slot's port, drives headless Chrome through pulse-shot's own
//   launchChrome / openPage, and releases everything in `finally`
// 3 writes, per view, <view>.png (402 wide, scale 2) and <view>.json (DOM boxes and computed styles of
//   every data-kit="inputField") into --out (default .pulse/pairs/F12/raw)
// 4 deletes frontend/f12-kit.local/ unless --keep
//
// Nothing here talks to the backend: the kit page makes no request but its own files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const slot = path.resolve(here, '..', '..', '..', '..', '..', '..');
const frontend = path.join(slot, 'frontend');
const shot = await import(pathToFileURL(path.join(frontend, 'scripts', 'pulse-shot.mjs')).href);
const { launchChrome, openPage, sleep, pulseDir, listenersOnPort } = shot;

const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const port = Number(arg('--port', 5182));
const outDir = path.resolve(arg('--out', path.join(pulseDir(), 'pairs', 'F12', 'raw')));
const keep = argv.includes('--keep');
const entryDir = path.join(frontend, 'f12-kit.local');
const buildDir = path.join(os.tmpdir(), 'f12-kit-dist');
const vite = path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');

const VIEWS = [
  { name: 'board', height: 1180 },
  { name: 'board-focus', hash: 'board', height: 1180, focus: true },
  { name: 'auth-1', height: 874 },
  { name: 'auth-1-focus', hash: 'auth-1', height: 874, tabTo: 0 },
  { name: 'auth-2', height: 874 },
];

/* ── the heavy lock: the same mkdir mutex pulse-verify uses ─────────────────────────────────────── */
async function takeLock() {
  const dir = path.join(pulseDir(), 'locks');
  fs.mkdirSync(dir, { recursive: true });
  for (;;) {
    for (const n of [1, 2]) {
      const p = path.join(dir, `heavy-${n}`);
      try {
        fs.mkdirSync(p);
        fs.writeFileSync(path.join(p, 'owner'), `F12\nf12-shot ${process.pid} ${new Date().toISOString()}\n`);
        return () => fs.rmSync(p, { recursive: true, force: true });
      } catch {
        const st = fs.statSync(p, { throwIfNoEntry: false });
        if (st && Date.now() - st.mtimeMs > 25 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true });
      }
    }
    console.log('f12-shot: both heavy locks are taken — waiting 20 s');
    await sleep(20000);
  }
}

/* ── what the page measures ──────────────────────────────────────────────────────────────────────── */
const MEASURE = String.raw`(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +(r.left + scrollX).toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const css = (el, ...props) => { if (!el) return null; const c = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)])); };
  const fields = [...document.querySelectorAll('[data-kit="inputField"]')].map((f) => {
    const input = f.querySelector('input');
    const row = input.parentElement;
    const label = f.querySelector('label');
    const marker = f.querySelector('[id$="-marker"]');
    const hint = f.querySelector('[id$="-hint"]');
    const error = f.querySelector('[id$="-error"]');
    const lead = input.previousElementSibling;
    const trail = input.nextElementSibling;
    const rb = box(row);
    const bw = parseFloat(getComputedStyle(row).borderBottomWidth);
    const ic = getComputedStyle(input);
    const lh = parseFloat(ic.lineHeight);
    const ib = box(input);
    return {
      label: label.textContent, value: input.value, placeholder: input.placeholder, type: input.type,
      focused: document.activeElement === input, describedby: input.getAttribute('aria-describedby'), invalid: input.getAttribute('aria-invalid'),
      field: box(f), labelBox: box(label), labelCss: css(label, 'font-family', 'font-size', 'font-weight', 'line-height', 'color'),
      marker: marker ? { text: marker.textContent, box: box(marker), css: css(marker, 'font-family', 'font-size', 'line-height', 'letter-spacing', 'text-transform', 'color') } : null,
      row: rb, underline: { x: rb.x, y: +(rb.y + rb.h - bw).toFixed(2), w: rb.w, h: bw, color: getComputedStyle(row).borderBottomColor },
      input: ib, textBox: { x: ib.x, y: +(ib.y + (ib.h - lh) / 2).toFixed(2), h: lh },
      inputCss: css(input, 'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'caret-color', 'outline-style', 'background-color', 'letter-spacing'),
      placeholderColor: getComputedStyle(input, '::placeholder').color,
      lead: lead ? { box: box(lead), svg: box(lead.querySelector('svg')), color: getComputedStyle(lead).color } : null,
      trail: trail ? { box: box(trail), first: box(trail.firstElementChild), svg: box(trail.querySelector('svg')) } : null,
      hint: hint ? { text: hint.textContent, box: box(hint), css: css(hint, 'font-size', 'font-weight', 'line-height', 'color') } : null,
      error: error ? { text: error.textContent, role: error.getAttribute('role'), box: box(error), css: css(error, 'font-size', 'line-height', 'color') } : null,
    };
  });
  const cv = document.createElement('canvas').getContext('2d');
  const family = fields[0] ? getComputedStyle(document.querySelector('[data-kit="inputField"] input')).fontFamily : '';
  const bullet = (px) => { cv.font = '400 ' + px + 'px ' + family; const m = cv.measureText('•'); return { px, advance: +m.width.toFixed(2), ink: +(m.actualBoundingBoxRight + m.actualBoundingBoxLeft).toFixed(2), up: +m.actualBoundingBoxAscent.toFixed(2), down: +m.actualBoundingBoxDescent.toFixed(2) }; };
  return { url: location.href, fonts: document.fonts.check('16px ' + family), family, bullet: [bullet(16), bullet(32)], scrollHeight: document.documentElement.scrollHeight, fields };
})()`;

async function main() {
  fs.rmSync(entryDir, { recursive: true, force: true });
  fs.cpSync(path.join(here, 'kit-entry'), entryDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const release = await takeLock();
  let preview = null;
  let browser = null;
  try {
    const env = { ...process.env, F12_KIT_OUT: buildDir };
    const b = spawnSync(process.execPath, [vite, 'build', '--config', 'f12-kit.local/vite.config.mjs', '--logLevel', 'warn'], { cwd: frontend, env, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`scratch build failed: ${(b.stderr || b.stdout).slice(-1500)}`);
    console.log('f12-shot: scratch build green');
    if (listenersOnPort(port).length) throw new Error(`port ${port} is in use`);
    preview = spawn(process.execPath, [vite, 'preview', '--config', 'f12-kit.local/vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: frontend, env, stdio: 'ignore' });
    const url = `http://localhost:${port}/f12-kit.local/index.html`;
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) break;
      } catch {
        /* not yet */
      }
      if (i > 100) throw new Error('the scratch preview did not come up');
      await sleep(200);
    }
    browser = await launchChrome({ windowSize: [402, 1200] });
    for (const v of VIEWS) {
      const page = await openPage(browser, { width: 402, height: v.height });
      try {
        await page.send('Page.enable');
        await page.send('Emulation.setDeviceMetricsOverride', { width: 402, height: v.height, deviceScaleFactor: 2, mobile: false });
        await page.send('Page.navigate', { url: `${url}#${v.hash || v.name}` });
        for (let i = 0; i < 100; i++) {
          if (await page.evaluate('document.readyState === "complete" && !!document.querySelector("[data-kit=inputField]")').catch(() => false)) break;
          await sleep(100);
        }
        await page.evaluate('document.fonts.ready.then(() => true)');
        const key = async (k, code, vk) => {
          await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
          await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        };
        if (v.focus) {
          // keyboard focus: focus the field BEFORE the specimen, then Tab into it, then End (Tab selects the value)
          await page.evaluate(`(() => { const all = [...document.querySelectorAll('input')]; const i = all.indexOf(document.querySelector('[data-specimen="focus"]')); all[i - 1].focus(); return i; })()`);
          await key('Tab', 'Tab', 9);
          await key('End', 'End', 35);
        }
        if (v.tabTo !== undefined) {
          for (let i = 0; i <= v.tabTo; i++) await key('Tab', 'Tab', 9);
        }
        await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300))))');
        const facts = await page.evaluate(MEASURE);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }, 60000);
        fs.writeFileSync(path.join(outDir, `${v.name}.png`), Buffer.from(data, 'base64'));
        fs.writeFileSync(path.join(outDir, `${v.name}.json`), `${JSON.stringify(facts, null, 2)}\n`);
        console.log(`f12-shot: ${v.name} — ${facts.fields.length} field(s), fonts ${facts.fonts ? 'loaded' : 'NOT loaded'}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (preview && preview.exitCode === null) {
      preview.kill();
      await sleep(500);
    }
    release();
    if (!keep) fs.rmSync(entryDir, { recursive: true, force: true });
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`f12-shot: ${err.message}`);
  process.exitCode = 1;
});
