#!/usr/bin/env node
// G-inputs evidence harness — captures the REAL G-inputs components (built with the tree's own
// vite.config.ts) at the coordinates of the frames they are compared with, for the pairs.
//
//   cwd: <slot>/frontend
//   node ../docs/pipeline/pulse/pkg/G-inputs/evidence/gi-shot.mjs [--port 5182] [--out <dir>] [--only a,b] [--keep]
//
// 1 copies ./entry to frontend/gi.local/ (git-ignored by `*.local`)
// 2 takes one heavy lock (.pulse/locks/heavy-1|2, mkdir), builds that entry into a scratch folder,
//   serves it with `vite preview` on the slot's port, drives headless Chrome through pulse-shot's own
//   launchChrome / openPage, and releases everything in `finally`
// 3 writes, per view, <view>.png (402 wide, scale 2) and <view>.json (DOM boxes and computed styles of
//   every [data-kit] element and its parts) into --out (default .pulse/pairs/G-inputs/raw)
// 4 deletes frontend/gi.local/ unless --keep
//
// Nothing here talks to the backend: the page makes no request but its own files.
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
const outDir = path.resolve(arg('--out', path.join(pulseDir(), 'pairs', 'G-inputs', 'raw')));
const only = arg('--only', '')?.split(',').filter(Boolean) ?? [];
const keep = argv.includes('--keep');
const entryDir = path.join(frontend, 'gi.local');
const buildDir = path.join(os.tmpdir(), 'gi-dist');
const vite = path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');

/** view: hash, viewport height, settle (ms), keyboard steps (Tab count, then extra keys). */
const VIEWS = [
  { name: 'wk1', height: 874 },
  { name: 'wk1-focus', hash: 'wk1', height: 874, tabs: 1 },
  { name: 'nu2', height: 874 },
  { name: 'nu2-focus', hash: 'nu2', height: 874, tabs: 1 },
  { name: 'pe1', height: 874 },
  { name: 'pe1-focus', hash: 'pe1', height: 874, tabs: 1 },
  { name: 'cpo1', height: 960 },
  { name: 'cpr1', height: 1416 },
  { name: 'cpr1-focus', hash: 'cpr1', height: 1416, tabs: 1 },
  { name: 'kit', height: 874, full: true },
  { name: 'kit-focus', hash: 'kit', height: 874, full: true, tabs: 1 },
].filter((v) => !only.length || only.includes(v.name));

/* ── the heavy lock: the same mkdir mutex pulse-verify uses ─────────────────────────────────────── */
async function takeLock() {
  const dir = path.join(pulseDir(), 'locks');
  fs.mkdirSync(dir, { recursive: true });
  for (;;) {
    for (const n of [1, 2]) {
      const p = path.join(dir, `heavy-${n}`);
      try {
        fs.mkdirSync(p);
        fs.writeFileSync(path.join(p, 'owner'), `G-inputs\ngi-shot ${process.pid} ${new Date().toISOString()}\n`);
        return () => fs.rmSync(p, { recursive: true, force: true });
      } catch {
        const st = fs.statSync(p, { throwIfNoEntry: false });
        if (st && Date.now() - st.mtimeMs > 25 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true });
      }
    }
    console.log('gi-shot: both heavy locks are taken — waiting 20 s');
    await sleep(20000);
  }
}

/* ── what the page measures ──────────────────────────────────────────────────────────────────────── */
const MEASURE = String.raw`(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +(r.left + scrollX).toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const css = (el, ...props) => { if (!el) return null; const c = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)])); };
  const TEXT = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color'];
  const line = (el) => {
    if (!el) return null;
    const b = box(el), c = getComputedStyle(el), bw = parseFloat(c.borderBottomWidth);
    if (bw > 0) return { x: b.x, y: +(b.y + b.h - bw).toFixed(2), w: b.w, h: bw, color: c.borderBottomColor };
    const a = getComputedStyle(el, '::after'), ah = parseFloat(a.height);
    if (a.content !== 'none' && ah > 0) return { x: b.x, y: +(b.y + b.h - ah).toFixed(2), w: b.w, h: ah, color: a.backgroundColor };
    return null;
  };
  const kits = [...document.querySelectorAll('[data-kit]')].map((el) => {
    const kit = el.getAttribute('data-kit');
    const q = (s) => el.querySelector(s);
    const label = q('[id$="-label"]') || q('label');
    const control = q('input:not([type=hidden]), textarea, button[aria-haspopup]');
    const lineEl = control ? (control.closest('[class*="border-b"]') || (control.tagName === 'TEXTAREA' ? control.parentElement : null)) : null;
    const svgs = [...el.querySelectorAll('svg')].map((s) => ({ box: box(s), color: getComputedStyle(s).color, stroke: getComputedStyle(s).strokeWidth }));
    const buttons = [...el.querySelectorAll('button')].map((b) => ({ name: b.getAttribute('aria-label') || b.textContent.trim(), box: box(b), disabled: b.disabled }));
    return {
      kit, box: box(el), focusedInside: el.contains(document.activeElement), active: document.activeElement === el ? 'self' : (document.activeElement && el.contains(document.activeElement) ? document.activeElement.tagName + (document.activeElement.getAttribute('aria-label') ? '[' + document.activeElement.getAttribute('aria-label') + ']' : '') : null),
      label: label ? { text: label.textContent, box: box(label), css: css(label, ...TEXT) } : null,
      control: control ? { tag: control.tagName, type: control.type, value: control.value, box: box(control), css: css(control, ...TEXT, 'caret-color', 'outline-style'), describedby: control.getAttribute('aria-describedby'), role: control.getAttribute('role') } : null,
      line: line(lineEl) || line(control ? control.parentElement : null) || line(el),
      hint: q('[id$="-hint"]') ? { text: q('[id$="-hint"]').textContent, box: box(q('[id$="-hint"]')), css: css(q('[id$="-hint"]'), 'font-size', 'line-height', 'color') } : null,
      error: q('[id$="-error"]') ? { text: q('[id$="-error"]').textContent, box: box(q('[id$="-error"]')), color: getComputedStyle(q('[id$="-error"]')).color } : null,
      counter: q('[id$="-counter"]') ? { text: q('[id$="-counter"]').textContent, box: box(q('[id$="-counter"]')), css: css(q('[id$="-counter"]'), 'font-size', 'color') } : null,
      marker: q('[id$="-marker"]') ? { box: box(q('[id$="-marker"]')) } : null,
      grabber: q('[data-kit-part="grabber"]') ? { box: box(q('[data-kit-part="grabber"]')), color: getComputedStyle(q('[data-kit-part="grabber"]')).backgroundColor } : null,
      title: q('h2') ? { text: q('h2').textContent, box: box(q('h2')), css: css(q('h2'), ...TEXT) } : null,
      panel: kit === 'bottomSheet' ? css(el, 'background-color', 'border-top-color', 'border-top-width', 'border-top-left-radius', 'box-shadow', 'backdrop-filter', 'padding-top', 'padding-left', 'padding-bottom') : null,
      ring: css(el, 'outline-style', 'outline-width', 'outline-color', 'outline-offset'),
      svgs, buttons,
    };
  });
  const scrim = [...document.querySelectorAll('div[aria-hidden]')].find((d) => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).backgroundColor.startsWith('rgba(0, 0, 0'));
  const active = document.activeElement;
  return {
    url: location.href, scrollHeight: document.documentElement.scrollHeight, htmlOverflow: getComputedStyle(document.documentElement).overflow,
    scrim: scrim ? { box: box(scrim), color: getComputedStyle(scrim).backgroundColor, backdrop: getComputedStyle(scrim).backdropFilter } : null,
    dialog: (() => { const d = document.querySelector('[role=dialog]'); return d ? { modal: d.getAttribute('aria-modal'), labelledby: d.getAttribute('aria-labelledby'), name: d.getAttribute('aria-labelledby') ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent : null, focusInside: d.contains(active) } : null; })(),
    active: active ? { tag: active.tagName, name: active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 40), focusVisible: active.matches(':focus-visible') } : null,
    kits,
  };
})()`;

async function main() {
  fs.rmSync(entryDir, { recursive: true, force: true });
  fs.cpSync(path.join(here, 'entry'), entryDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const release = await takeLock();
  let preview = null;
  let browser = null;
  try {
    const env = { ...process.env, GI_OUT: buildDir };
    const b = spawnSync(process.execPath, [vite, 'build', '--config', 'gi.local/vite.config.mjs', '--logLevel', 'warn'], { cwd: frontend, env, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`scratch build failed: ${(b.stderr || b.stdout).slice(-1500)}`);
    console.log('gi-shot: scratch build green');
    if (listenersOnPort(port).length) throw new Error(`port ${port} is in use`);
    preview = spawn(process.execPath, [vite, 'preview', '--config', 'gi.local/vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: frontend, env, stdio: 'ignore' });
    const url = `http://localhost:${port}/gi.local/index.html`;
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
          if (await page.evaluate('document.readyState === "complete" && !!document.querySelector("[data-kit]")').catch(() => false)) break;
          await sleep(100);
        }
        await page.evaluate('document.fonts.ready.then(() => true)');
        await sleep(v.settle ?? 200);
        const key = async (k, code, vk, text) => {
          await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
          await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        };
        for (let i = 0; i < (v.tabs ?? 0); i++) await key('Tab', 'Tab', 9);
        for (const k of v.keys ?? []) await key(k, k, k === 'Enter' ? 13 : 0, k === 'Enter' ? '\r' : undefined);
        if (v.type) await page.send('Input.insertText', { text: v.type });
        await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, ${v.keys ? 900 : 300}))))`);
        if (v.full) {
          const h = await page.evaluate('document.documentElement.scrollHeight');
          await page.send('Emulation.setDeviceMetricsOverride', { width: 402, height: h, deviceScaleFactor: 2, mobile: false });
          await sleep(400);
        }
        const facts = await page.evaluate(MEASURE);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!v.full }, 120000);
        fs.writeFileSync(path.join(outDir, `${v.name}.png`), Buffer.from(data, 'base64'));
        fs.writeFileSync(path.join(outDir, `${v.name}.json`), `${JSON.stringify(facts, null, 2)}\n`);
        console.log(`gi-shot: ${v.name} — ${facts.kits.length} kit element(s), active ${facts.active?.tag}${facts.active?.focusVisible ? ' (focus-visible)' : ''}`);
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
  console.error(`gi-shot: ${err.message}`);
  process.exitCode = 1;
});
