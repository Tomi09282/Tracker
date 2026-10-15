#!/usr/bin/env node
// F13 evidence harness — captures the REAL status-zone specimens (built with the tree's own
// vite.config.ts) for the pairs. Modelled on F12's f12-shot.mjs.
//
//   cwd: <slot>/frontend
//   node ../docs/pipeline/pulse/pkg/F13/evidence/f13-shot.mjs [--port 5187] [--out <dir>] [--keep]
//
// 1 copies ./kit-entry to frontend/f13-kit.local/ (git-ignored by `*.local`)
// 2 takes one heavy lock (.pulse/locks/heavy-1|2, mkdir), builds that entry into a scratch folder,
//   serves it with `vite preview` on the slot's port, drives headless Chrome through pulse-shot's own
//   launchChrome / openPage, and releases everything in `finally`
// 3 writes, per view, <view>.png (scale 2) and <view>.json (DOM boxes and computed colours of every
//   data-kit="toastBand" / "toast" / "offlineLine" / "commandPalette") into --out
//   (default .pulse/pairs/F13/raw)
// 4 deletes frontend/f13-kit.local/ unless --keep
//
// Nothing here talks to the backend: the page's one request (the palette's session read) has no
// proxy behind it and simply fails, which leaves the palette with the signed-out command list.
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
const port = Number(arg('--port', 5187));
const outDir = path.resolve(arg('--out', path.join(pulseDir(), 'pairs', 'F13', 'raw')));
const keep = argv.includes('--keep');
const entryDir = path.join(frontend, 'f13-kit.local');
const buildDir = path.join(os.tmpdir(), 'f13-kit-dist');
const vite = path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');

const VIEWS = [
  { name: 'bands', width: 402, height: 640 },
  { name: 'states', width: 402, height: 640 },
  { name: 'palette', width: 640, height: 760 },
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
        fs.writeFileSync(path.join(p, 'owner'), `F13\nf13-shot ${process.pid} ${new Date().toISOString()}\n`);
        return () => fs.rmSync(p, { recursive: true, force: true });
      } catch {
        const st = fs.statSync(p, { throwIfNoEntry: false });
        if (st && Date.now() - st.mtimeMs > 25 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true });
      }
    }
    console.log('f13-shot: both heavy locks are taken — waiting 20 s');
    await sleep(20000);
  }
}

/* ── what the page measures ──────────────────────────────────────────────────────────────────────── */
const MEASURE = String.raw`(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +(r.left + scrollX).toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const css = (el, ...props) => { if (!el) return null; const c = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)])); };
  const part = (el) => {
    const line = el.querySelector('[data-kit="noticeLine"]');
    const text = line ? line.querySelector('.text-cap-m') : null;
    const slot = line ? line.firstElementChild.firstElementChild : null;
    const dot = slot ? slot.querySelector('span') : null;
    const glyph = slot ? slot.querySelector('svg') : null;
    const rule = el.querySelector('[data-kit="rule"]');
    const count = el.querySelector('[data-kit="toastCountdown"]');
    const buttons = [...el.querySelectorAll('button')].map((b) => ({ name: b.getAttribute('aria-label') || b.textContent, box: box(b), svg: box(b.querySelector('svg')), color: getComputedStyle(b).color }));
    return {
      kit: el.dataset.kit, kind: el.dataset.kind || null, box: box(el), line: box(line),
      text: text ? { s: text.textContent, box: box(text), css: css(text, 'font-family', 'font-size', 'font-weight', 'line-height', 'color') } : null,
      dot: dot ? { box: box(dot), bg: getComputedStyle(dot).backgroundColor } : null,
      glyph: glyph ? { box: box(glyph), color: getComputedStyle(glyph).color } : null,
      rule: rule ? { box: box(rule), bg: getComputedStyle(rule).backgroundColor } : null,
      countdown: count ? { box: box(count), bg: getComputedStyle(count).backgroundColor, transform: getComputedStyle(count).transform } : null,
      buttons,
    };
  };
  return {
    url: location.href,
    fonts: document.fonts.status,
    bands: [...document.querySelectorAll('[data-kit="toastBand"]')].map((b) => ({ box: box(b), bg: getComputedStyle(b).backgroundColor, pt: getComputedStyle(b).paddingTop, pb: getComputedStyle(b).paddingBottom })),
    toasts: [...document.querySelectorAll('[data-kit="toast"]')].map(part),
    offline: [...document.querySelectorAll('[data-kit="offlineLine"]')].map(part),
    palette: (() => { const p = document.querySelector('[data-kit="commandPalette"]'); return p ? { box: box(p), css: css(p, 'background-color', 'border-top-color', 'border-top-width', 'border-top-left-radius') } : null; })(),
    scrollHeight: document.documentElement.scrollHeight,
  };
})()`;

async function main() {
  fs.rmSync(entryDir, { recursive: true, force: true });
  fs.cpSync(path.join(here, 'kit-entry'), entryDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const release = await takeLock();
  let preview = null;
  let browser = null;
  try {
    const env = { ...process.env, F13_KIT_OUT: buildDir };
    const b = spawnSync(process.execPath, [vite, 'build', '--config', 'f13-kit.local/vite.config.mjs', '--logLevel', 'warn'], { cwd: frontend, env, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`scratch build failed: ${(b.stderr || b.stdout).slice(-1500)}`);
    console.log('f13-shot: scratch build green');
    if (listenersOnPort(port).length) throw new Error(`port ${port} is in use`);
    preview = spawn(process.execPath, [vite, 'preview', '--config', 'f13-kit.local/vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: frontend, env, stdio: 'ignore' });
    const url = `http://localhost:${port}/f13-kit.local/index.html`;
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) break;
      } catch {
        /* not yet */
      }
      if (i > 100) throw new Error('the scratch preview did not come up');
      await sleep(200);
    }
    browser = await launchChrome({ windowSize: [640, 1200] });
    for (const v of VIEWS) {
      const page = await openPage(browser, { width: v.width, height: v.height });
      try {
        await page.send('Page.enable');
        await page.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: 2, mobile: false });
        await page.send('Page.navigate', { url: `${url}#${v.name}` });
        for (let i = 0; i < 100; i++) {
          if (await page.evaluate('document.readyState === "complete" && !!document.querySelector("[data-kit]")').catch(() => false)) break;
          await sleep(100);
        }
        await page.evaluate('document.fonts.ready.then(() => true)');
        await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 600))))');
        const facts = await page.evaluate(MEASURE);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }, 60000);
        fs.writeFileSync(path.join(outDir, `${v.name}.png`), Buffer.from(data, 'base64'));
        fs.writeFileSync(path.join(outDir, `${v.name}.json`), `${JSON.stringify(facts, null, 2)}\n`);
        console.log(`f13-shot: ${v.name} — ${facts.toasts.length} toast line(s), ${facts.offline.length} offline line(s), palette ${facts.palette ? 'drawn' : 'none'}, fonts ${facts.fonts}`);
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
  console.error(`f13-shot: ${err.message}`);
  process.exitCode = 1;
});
