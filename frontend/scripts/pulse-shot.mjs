#!/usr/bin/env node
/*
 * pulse-shot — the capture tool of the Pulse redesign (PLAN.md 6.0).
 *
 * What it is: headless Chrome driven over raw CDP (no npm dependency), pointed at the BUILT app.
 * One run opens each requested state in its own browser context, at 402 x H, device scale 2, with
 * the safe-area insets of the frames (62 / 34), walks a click script that addresses controls by
 * ACCESSIBLE NAME only, and writes a PNG, a control inventory and a probe report.
 *
 * Three ways to feed the page (see `MODES` below and docs/pipeline/pulse/pkg/F3/README.md):
 *   --replay  (default) every /api request is answered from the freeze under .pulse/rec/
 *   --record            live backend, every /api response is stored into the freeze
 *   --live              live backend, nothing stored, writes fail-closed
 *
 * Rules this file exists to keep:
 *   - A step whose target is missing FAILS the capture. Nothing continues silently (R20).
 *   - A non-GET /api request never reaches the server unless the state names it in `writes`
 *     AND its target is a sandbox object (R25).
 *   - The only automated login is the cookie jar in the OS temp dir (R19). The refresh cookie
 *     never enters a browser profile; a recording never holds a credential.
 *   - No secret is printed, logged or written into the repository.
 */
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────── paths

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_DIR = path.resolve(SCRIPTS_DIR, '..');
export const REPO_DIR = path.resolve(FRONTEND_DIR, '..');
export const FRAMES_FILE = path.join(SCRIPTS_DIR, 'pulse-frames.json');
export const FIXTURES_DIR = path.join(SCRIPTS_DIR, 'fixtures');
export const CHROME =
  process.env.PULSE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const FRAME_PNG_DIR =
  process.env.PULSE_FRAME_PNGS || 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepernyok-2x';
export const DEFAULT_API = process.env.PULSE_API || 'http://localhost:3000';
/** Ports a preview may be started on, and the only ports this tool will ever free. */
export const PREVIEW_PORTS = [5180, 5181, 5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189];

let pulseDirCache = null;
/**
 * `.pulse/` lives in the MAIN checkout only (it is git-ignored, so a worktree has none). Every
 * tree reaches it through the git common dir, which is the same for all worktrees of one repo.
 */
export function pulseDir() {
  if (pulseDirCache) return pulseDirCache;
  if (process.env.PULSE_DIR) return (pulseDirCache = path.resolve(process.env.PULSE_DIR));
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: SCRIPTS_DIR, encoding: 'utf8' }).trim();
  const abs = path.isAbsolute(common) ? common : path.resolve(SCRIPTS_DIR, common);
  return (pulseDirCache = path.join(path.dirname(abs), '.pulse'));
}

// ───────────────────────────────────────────────────────────────────────────── small things

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = !!process.env.PULSE_DEBUG;
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const nowIso = () => new Date().toISOString();

export function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
const writeJson = (file, value) => writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readJsonIf = (file) => (fs.existsSync(file) ? readJson(file) : null);

class CaptureError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

// ───────────────────────────────────────────────────────────────────────────── CDP

/**
 * One headless Chrome, one browser-level WebSocket, any number of flattened page sessions.
 * `--remote-debugging-port=0` and a private profile directory: parallel runs never share a port,
 * a cookie, a service worker or a `localStorage`.
 */
export async function launchChrome({ windowSize = [1300, 1000] } = {}) {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set PULSE_CHROME)`);
  // profiles left behind by a killed run (older than an hour) go first
  try {
    for (const d of fs.readdirSync(os.tmpdir())) {
      if (!d.startsWith('pulse-chrome-')) continue;
      const full = path.join(os.tmpdir(), d);
      if (Date.now() - fs.statSync(full).mtimeMs > 3600 * 1000) fs.rmSync(full, { recursive: true, force: true });
    }
  } catch {
    /* best effort */
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-chrome-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${windowSize[0]},${windowSize[1]}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-extensions',
      '--disable-sync',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      // A capture window is as tall as its frame (up to 2091 pt) and never "in front": without these
      // Chrome treats it as occluded and stops rendering it — measured as requestAnimationFrame
      // never firing on the tall frames.
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,CalculateNativeWinOcclusion',
      // One colour space and no LCD text: the same pixels on every run of this machine.
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      '--font-render-hinting=none',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let wsUrl = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome printed no DevTools url in 20 s')), 20000);
    child.stderr.on('data', (d) => {
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(String(d));
      if (m && !wsUrl) {
        wsUrl = m[1];
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      if (!wsUrl) {
        clearTimeout(timer);
        reject(new Error(`Chrome exited before it listened (code ${code})`));
      }
    });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('cannot connect to the DevTools socket')), { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map(); // sessionId ('' = browser) -> Set<fn(method, params)>
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id !== undefined) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}${m.error.data ? ` (${m.error.data})` : ''}`));
      else p.resolve(m.result);
      return;
    }
    const set = listeners.get(m.sessionId || '');
    if (set) for (const fn of [...set]) fn(m.method, m.params);
  });
  let closed = false;
  ws.addEventListener('close', () => {
    closed = true;
    for (const p of pending.values()) p.reject(new Error(`${p.method}: the DevTools socket closed`));
    pending.clear();
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(new Error(`${method}: the DevTools socket is closed`));
      const id = ++nextId;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  const on = (sessionId, fn) => {
    const key = sessionId || '';
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  };

  const close = async () => {
    try {
      if (!closed) await Promise.race([send('Browser.close'), sleep(2000)]);
    } catch {
      /* already gone */
    }
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    if (child.exitCode === null) {
      await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]);
      if (child.exitCode === null) child.kill();
    }
    // The profile holds nothing worth keeping; Windows may need a moment to let go of it.
    for (let i = 0; i < 10; i++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(200);
      }
    }
  };

  const version = await send('Browser.getVersion');
  return { send, on, close, pid: child.pid, product: version.product };
}

/**
 * The first screenshot of a browser pays for the start of its graphics process (measured: 5 – 13 s,
 * during which no frame is rendered at all). It is paid here, on a blank page, so the first real
 * state is captured under the same conditions as the fifty-ninth.
 */
export async function warmUp(browser) {
  const page = await openPage(browser, { width: 402, height: 874 });
  try {
    await page.send('Page.enable');
    await page.send('Page.captureScreenshot', { format: 'png' }, 60000);
    await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', { timeout: 30000 }).catch(() => {});
    await page.send('Page.captureScreenshot', { format: 'png' }, 60000);
  } catch {
    /* a failed warm-up costs time on the first state, nothing else */
  } finally {
    await page.close();
  }
}

/** A page in its own browser context: its own cookies, storage and cache. */
export async function openPage(browser, { width = 402, height = 874 } = {}) {
  const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
  // Its own WINDOW, as large as the viewport: `position: fixed` is laid out against the window,
  // so a 402 x 2091 emulation inside a 1000 px window docks the tab bar at 1000, not at 2091.
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId, width, height, newWindow: true });
  try {
    const { windowId } = await browser.send('Browser.getWindowForTarget', { targetId });
    await browser.send('Browser.setWindowBounds', { windowId, bounds: { width, height } });
  } catch {
    /* the viewport self-check after loading reports it if the window did not follow */
  }
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  // Every command is bounded: a page that stops answering fails ITS capture, it never hangs the run.
  const send = (method, params, timeout = method === 'Page.captureScreenshot' ? 60000 : 30000) => {
    if (DEBUG) console.error(`[cdp] ${method}`);
    let timer;
    return Promise.race([
      browser.send(method, params, sessionId),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${method} did not answer in ${timeout / 1000} s`)), timeout);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  const handlers = new Map();
  const off = browser.on(sessionId, (method, params) => {
    const set = handlers.get(method);
    if (set) for (const fn of [...set]) fn(params);
  });
  const on = (method, fn) => {
    if (!handlers.has(method)) handlers.set(method, new Set());
    handlers.get(method).add(fn);
    return () => handlers.get(method)?.delete(fn);
  };
  const evaluate = async (expression, { awaitPromise = true, timeout = 15000 } = {}) => {
    // Never wait for ever: under a paused virtual clock a promise that needs a timer does not settle.
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true }),
      sleep(timeout).then(() => {
        throw new Error(`page script did not return in ${timeout / 1000} s: ${expression.slice(0, 80)}`);
      }),
    ]);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page script failed: ${d.exception?.description || d.text}`);
    }
    return r.result.value;
  };
  const close = async () => {
    off();
    try {
      await browser.send('Target.closeTarget', { targetId });
    } catch {
      /* ignore */
    }
    try {
      await browser.send('Target.disposeBrowserContext', { browserContextId });
    } catch {
      /* ignore */
    }
  };
  return { send, on, evaluate, close, targetId, sessionId, browserContextId };
}

// ───────────────────────────────────────────────────────────────────────────── cookie jars (R19)

const JAR_DIR = path.join(os.tmpdir(), 'tracker-pulse-jars');
const jarFile = (email) => path.join(JAR_DIR, `${email.replace(/[^a-z0-9.@_-]/gi, '_')}.json`);

export class LoginRefused extends Error {}

/** The dev fixture password, read at run time from the seed script. Never logged, never written. */
function fixturePassword() {
  const candidates = [
    path.join(REPO_DIR, 'backend', 'scripts', 'seed-dev-users.mjs'),
    path.join(path.dirname(pulseDir()), 'backend', 'scripts', 'seed-dev-users.mjs'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const m = /const PASSWORD = (['"`])([^'"`]+)\1/.exec(fs.readFileSync(file, 'utf8'));
    if (m) return m[2];
  }
  throw new Error('the dev fixture password was not found in backend/scripts/seed-dev-users.mjs');
}

async function withDirLock(lockDir, staleMs, waitMs, fn) {
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  const t0 = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let age = Infinity;
      try {
        age = Date.now() - fs.statSync(lockDir).mtimeMs;
      } catch {
        /* vanished between the two calls */
      }
      if (age > staleMs) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - t0 > waitMs) throw new Error(`lock ${lockDir} is held (waited ${Math.round(waitMs / 1000)} s)`);
      await sleep(250);
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function cookiesFromResponse(res) {
  const out = {};
  const now = Date.now();
  for (const line of res.headers.getSetCookie()) {
    const parts = line.split(';').map((s) => s.trim());
    const eq = parts[0].indexOf('=');
    const name = parts[0].slice(0, eq);
    const value = parts[0].slice(eq + 1);
    let expires = null;
    for (const p of parts.slice(1)) {
      const [k, v] = p.split('=');
      if (/^max-age$/i.test(k)) expires = now + Number(v) * 1000;
      else if (/^expires$/i.test(k) && expires === null) expires = Date.parse(v);
    }
    if (value) out[name] = { value, expires: expires ?? now + 10 * 60 * 1000 };
  }
  return out;
}

/**
 * The access cookie of one fixture account, valid for at least `minRemainingMs` more.
 *
 * Order: the cached cookie -> a refresh (60 per 15 minutes) -> a fresh login (10 per 15 minutes,
 * shared by every agent and the owner). A refused login is an error the caller must WAIT on; this
 * function never retries. The jar is rewritten atomically inside the lock, so one refresh token is
 * never presented twice (a second presentation after 10 s revokes the whole session family).
 */
export async function getAccess(email, { api = DEFAULT_API, minRemainingMs = 3 * 60 * 1000, quiet = false } = {}) {
  const file = jarFile(email);
  return withDirLock(`${file}.lock`, 60 * 1000, 90 * 1000, async () => {
    const jar = readJsonIf(file);
    const now = Date.now();
    if (jar?.access && jar.access.expires - now > minRemainingMs) return { ...jar.access, how: 'cached' };

    const save = (res, how) => {
      const got = cookiesFromResponse(res);
      if (!got.access || !got.refresh) throw new Error(`${how} for ${email} returned no session cookies`);
      writeJson(file, { email, access: got.access, refresh: got.refresh, updated: nowIso() });
      if (!quiet) console.log(`  jar: ${email} ${how}`);
      return { ...got.access, how };
    };

    if (jar?.refresh && jar.refresh.expires > now + 5000) {
      const res = await fetch(`${api}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'X-CSRF': '1', Cookie: `refresh=${jar.refresh.value}` },
      });
      if (res.ok) return save(res, 'refreshed');
      if (res.status === 429) throw new LoginRefused(`refresh for ${email} is rate limited — wait, do not retry`);
      // 401 / 409: the family is gone or another process rotated it — fall through to one login.
    }

    const res = await fetch(`${api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' },
      body: JSON.stringify({ email, password: fixturePassword() }),
    });
    if (res.status === 429) {
      throw new LoginRefused(
        `login for ${email} was refused (HTTP 429, the shared limit of 10 per 15 minutes) — WAIT for the window, never loop`,
      );
    }
    if (!res.ok) throw new LoginRefused(`login for ${email} failed with HTTP ${res.status} — not retried`);
    return save(res, 'logged in');
  });
}

/** A GET against the live API with an account's access cookie (any GET is free, PLAN 4.7). */
export async function apiGet(email, apiPath, { api = DEFAULT_API } = {}) {
  const headers = {};
  if (email) headers.Cookie = `access=${(await getAccess(email, { api, quiet: true })).value}`;
  const res = await fetch(`${api}${apiPath}`, { headers });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, text };
}

// ───────────────────────────────────────────────────────────────────────────── preview server

export function listenersOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/)) {
        const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(line);
        if (m && Number(m[1]) === port) pids.add(Number(m[2]));
      }
    } else {
      const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      for (const s of out.split(/\s+/)) if (s) pids.add(Number(s));
    }
  } catch {
    /* nothing listening, or the tool is missing */
  }
  return [...pids];
}

/** Frees a PREVIEW port. Refuses every other port: 3000 and 5173 belong to the owner's stack. */
export function killListenerOnPort(port) {
  if (!PREVIEW_PORTS.includes(port)) throw new Error(`refusing to free port ${port}: only ${PREVIEW_PORTS[0]}-${PREVIEW_PORTS.at(-1)} are preview ports`);
  const killed = [];
  for (const pid of listenersOnPort(port)) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(pid, 'SIGKILL');
      killed.push(pid);
    } catch {
      /* already gone */
    }
  }
  return killed;
}

/**
 * `vite preview` of one tree's `dist/`, started directly through node (no npm / cmd wrapper, so
 * the pid we hold IS the server and stopping it leaves nothing behind).
 */
export async function startPreview(frontendDir, port, { timeoutMs = 30000 } = {}) {
  if (!PREVIEW_PORTS.includes(port)) throw new Error(`preview port must be one of ${PREVIEW_PORTS.join(', ')}`);
  const vite = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) throw new Error(`no vite in ${frontendDir} (run npm ci there)`);
  if (!fs.existsSync(path.join(frontendDir, 'dist', 'index.html'))) throw new Error(`no build in ${frontendDir}/dist (run the build first)`);
  if (listenersOnPort(port).length) throw new Error(`port ${port} is already in use`);
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], {
    cwd: frontendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://localhost:${port}`;
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite preview exited (code ${child.exitCode}): ${log.trim().slice(-400)}`);
    try {
      const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > timeoutMs) {
      child.kill();
      throw new Error(`vite preview did not answer on ${base} in ${timeoutMs / 1000} s: ${log.trim().slice(-400)}`);
    }
    await sleep(200);
  }
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]);
    }
  };
  return { base, pid: child.pid, stop };
}

// ───────────────────────────────────────────────────────────────────────────── frames file

export function loadFrames(file = FRAMES_FILE) {
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist`);
  const doc = readJson(file);
  const defaults = doc.defaults || {};
  const states = {};
  for (const [key, raw] of Object.entries(doc.states || {})) {
    states[key] = { key, ...raw };
  }
  return { doc, defaults, states, accounts: doc.accounts || {}, resolve: doc.resolve || {} };
}

/** `M` -> `user@tracker.local`; an e-mail stays itself; `null` / `anon` = signed out. */
function accountEmail(frames, account) {
  if (!account || account === 'anon' || account === '-') return null;
  return frames.accounts[account] || account;
}
/** The directory name of an account inside the freeze. */
export function accountDir(email) {
  return email ? email.split('@')[0] : 'anon';
}

// ───────────────────────────────────────────────────────────────────────────── the accessibility tree

const AX_STATE_PROPS = ['selected', 'checked', 'pressed', 'expanded', 'disabled', 'focused', 'required', 'invalid'];
/** Roles that count as a control in the inventory. */
const CONTROL_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'slider',
  'spinbutton', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'PopUpButton', 'ColorWell',
  'Date', 'DateTime', 'InputTime', 'ToggleButton', 'DisclosureTriangle', 'listbox',
]);

async function axTree(page) {
  const { nodes } = await page.send('Accessibility.getFullAXTree', {});
  const byId = new Map();
  for (const n of nodes) {
    const node = {
      id: n.nodeId,
      parentId: n.parentId || null,
      childIds: n.childIds || [],
      ignored: !!n.ignored,
      role: n.role?.value || '',
      name: String(n.name?.value ?? '').replace(/\s+/g, ' ').trim(),
      backendId: n.backendDOMNodeId || null,
      props: {},
    };
    for (const p of n.properties || []) node.props[p.name] = p.value?.value;
    byId.set(node.id, node);
  }
  for (const n of byId.values()) n.parent = n.parentId ? byId.get(n.parentId) || null : null;
  // Document order: a depth-first walk from the roots (the protocol's own order is not it).
  const out = [];
  const seen = new Set();
  const walk = (n) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
    for (const id of n.childIds) {
      const c = byId.get(id);
      if (c) walk(c);
    }
  };
  for (const n of byId.values()) if (!n.parent) walk(n);
  for (const n of byId.values()) walk(n);
  return out;
}

/** `"Mell"`, `{ "re": "^Mell" }`, `{ "hu": …, "en": …, "de": … }` or `{ "key": "nav.home" }`. */
function nameMatcher(spec, ctx) {
  if (spec === undefined || spec === null) return { test: () => true, text: '(any name)' };
  // Case is folded on purpose: Chrome reports an accessible name AFTER `text-transform`, so the
  // old bar says "KEZDŐLAP" and the Pulse bar "Kezdőlap" for the same control and the same string.
  const same = (value) => {
    const want = foldName(value);
    return (s) => foldName(s) === want;
  };
  if (typeof spec === 'string') return { test: same(spec), text: JSON.stringify(spec) };
  if (spec.re) {
    const re = new RegExp(spec.re, spec.flags ?? 'i');
    return { test: (s) => re.test(s), text: `/${spec.re}/${spec.flags ?? 'i'}` };
  }
  if (spec.key) {
    const value = ctx.translate(spec.key);
    return { test: same(value), text: `${JSON.stringify(value)} (${spec.key})` };
  }
  const value = spec[ctx.lang] ?? spec.hu;
  if (typeof value !== 'string') throw new CaptureError('script', `a name needs a string, { re }, { key } or per-language strings: ${JSON.stringify(spec)}`);
  return { test: same(value), text: JSON.stringify(value) };
}
/** The form in which two accessible names are compared: one space, no case. */
export const foldName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('hu');

function hasAncestor(node, pred) {
  for (let p = node.parent; p; p = p.parent) if (!p.ignored && pred(p)) return true;
  return false;
}

/** Every accessible node that matches `{ role, name, within?, <state>? }`. */
function axFind(tree, target, ctx) {
  const name = nameMatcher(target.name, ctx);
  const roles = rolesOf(target);
  const container = (spec) => {
    const w = nameMatcher(spec.name, ctx);
    const r = rolesOf(spec);
    return (n) => r.includes(n.role) && w.test(n.name);
  };
  const scope = target.within ? container(target.within) : null;
  const excluded = target.outside ? container(target.outside) : null;
  return tree.filter((n) => {
    if (n.ignored || !roles.includes(n.role) || !name.test(n.name)) return false;
    if (scope && !hasAncestor(n, scope)) return false;
    if (excluded && hasAncestor(n, excluded)) return false;
    for (const p of AX_STATE_PROPS) {
      if (target[p] === undefined) continue;
      const have = n.props[p];
      const want = target[p];
      const norm = (v) => (v === undefined || v === null ? false : v === 'true' ? true : v === 'false' ? false : v);
      if (norm(have) !== norm(want)) return false;
    }
    return true;
  });
}

/**
 * A role, or the roles a control may have on the old and on the new markup (a side switch is two
 * pressed buttons today and a radio group in the kit): the NAME is what addresses it.
 */
const rolesOf = (target) => (Array.isArray(target.role) ? target.role : [target.role]);

function describeTarget(target, ctx) {
  const bits = [`${rolesOf(target).join('|')} ${nameMatcher(target.name, ctx).text}`];
  for (const p of AX_STATE_PROPS) if (target[p] !== undefined) bits.push(`${p}=${target[p]}`);
  if (target.within) bits.push(`within ${rolesOf(target.within).join('|')} ${nameMatcher(target.within.name, ctx).text}`);
  if (target.outside) bits.push(`outside ${rolesOf(target.outside).join('|')} ${nameMatcher(target.outside.name, ctx).text}`);
  if (target.nth !== undefined) bits.push(`nth=${target.nth}`);
  return bits.join(' ');
}

/** Exactly one node, or `nth` chosen on purpose. Anything else fails the capture. */
async function axOne(page, target, ctx, what) {
  const tree = await axTree(page);
  const hits = axFind(tree, target, ctx);
  if (!hits.length) {
    const sameRole = tree.filter((n) => !n.ignored && rolesOf(target).includes(n.role)).map((n) => n.name).filter(Boolean);
    throw new CaptureError(
      'target-missing',
      `${what}: no ${describeTarget(target, ctx)} on the page`,
      { target, namesWithThatRole: [...new Set(sameRole)].slice(0, 40) },
    );
  }
  if (target.nth !== undefined) {
    if (!hits[target.nth]) throw new CaptureError('target-missing', `${what}: ${describeTarget(target, ctx)} has ${hits.length} match(es), nth=${target.nth} does not exist`);
    return hits[target.nth];
  }
  if (hits.length > 1) {
    throw new CaptureError('target-ambiguous', `${what}: ${hits.length} controls match ${describeTarget(target, ctx)} — add "within" or "nth"`);
  }
  return hits[0];
}

/** The control inventory: `{ role, name, disabled, href }` in document order (5.1 row 6). */
async function controlInventory(page, origin) {
  const tree = await axTree(page);
  const out = [];
  for (const n of tree) {
    if (n.ignored || !CONTROL_ROLES.has(n.role)) continue;
    // An option list inside a closed native select is not something a user can reach.
    if (n.role === 'listbox' && !n.props.focusable) continue;
    let href = null;
    if (n.role === 'link' && typeof n.props.url === 'string') {
      href = n.props.url.startsWith(origin) ? n.props.url.slice(origin.length) || '/' : n.props.url;
    }
    const state = {};
    for (const p of ['selected', 'checked', 'pressed', 'expanded']) {
      if (n.props[p] !== undefined) state[p] = n.props[p];
    }
    const entry = { role: n.role, name: n.name, disabled: n.props.disabled === true, href };
    if (Object.keys(state).length) entry.state = state;
    out.push(entry);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────── driving the page

const KEYS = {
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
};

async function pressKey(page, name, modifiers = 0) {
  const k = KEYS[name];
  if (!k) throw new CaptureError('script', `unknown key "${name}" (known: ${Object.keys(KEYS).join(', ')})`);
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers };
  await page.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

async function nodeCenter(page, backendNodeId, what) {
  try {
    await page.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
  } catch {
    /* a node that cannot scroll into view is caught by the quad lookup below */
  }
  let quad = null;
  try {
    const { quads } = await page.send('DOM.getContentQuads', { backendNodeId });
    quad = quads.find((q) => Math.abs(q[2] - q[0]) > 0.5 && Math.abs(q[5] - q[1]) > 0.5) || null;
  } catch {
    /* fall through */
  }
  if (!quad) throw new CaptureError('target-missing', `${what}: the control exists but has no box on screen (hidden or zero-sized)`);
  return { x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4, y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4 };
}

async function clickNode(page, node, what) {
  if (!node.backendId) throw new CaptureError('target-missing', `${what}: the accessible node has no DOM element`);
  const { x, y } = await nodeCenter(page, node.backendId, what);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

/** In-page helpers, installed once per document. Everything a probe or a wait reads comes from here. */
const PAGE_HELPERS = String.raw`
(() => {
  if (window.__pulse) return;
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    /* "display: contents" has no box of its own (checkVisibility says false, the rectangle is empty),
       yet what is inside it is drawn all the same: the label of every Pressable sits in such a
       span. Measured: the probes and the text assertions did not see those labels. */
    if (getComputedStyle(el).display === 'contents') return el.parentElement ? visible(el.parentElement) : false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /* Visible text, as written in the source (CSS text-transform is NOT applied, unlike innerText). */
  const visibleText = () => {
    const out = [];
    const walk = (root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const s = norm(n.nodeValue);
        if (!s) continue;
        const el = n.parentElement;
        if (!el || el.closest('script,style,noscript,template')) continue;
        if (!visible(el)) continue;
        out.push(s);
      }
    };
    walk(document.body);
    return out;
  };
  const fold = (s) => norm(s).toLocaleLowerCase('hu');
  const hasText = (s) => {
    const want = fold(s);
    const parts = visibleText().map(fold);
    if (parts.some((p) => p.includes(want))) return true;
    return parts.join(' ').includes(want);
  };
  const isFinite_ = (a) => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return !!t && Number.isFinite(t.endTime);
  };
  const settleState = () => {
    const running = document.getAnimations().filter((a) => a.playState === 'running' && isFinite_(a));
    const mut = window.__pulseMut;
    return {
      ready: document.readyState,
      fonts: document.fonts.status,
      finiteAnimations: running.length,
      pendingImages: [...document.images].filter((i) => (i.currentSrc || i.src) && !i.complete).length,
      sinceMutation: mut ? mut.clock() - mut.last : 1e9,
      path: location.pathname + location.search,
    };
  };
  /* A capture is a still: a loop (skeleton sheen, the pill's pulse, a spinner) is held at its first frame. */
  const holdLoops = () => {
    let held = 0;
    for (const a of document.getAnimations()) {
      if (isFinite_(a)) continue;
      try { a.pause(); a.currentTime = 0; held++; } catch {}
    }
    return held;
  };
  const viewport = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.documentElement.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = {
      width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio,
      insetTop: parseFloat(cs.paddingTop) || 0, insetBottom: parseFloat(cs.paddingBottom) || 0,
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    };
    probe.remove();
    return out;
  };
  /* Loaded is not painted: every picture is decoded before the shot, so no capture shows the gap where one will be. */
  const decodeImages = () => {
    window.__pulseDecoded = false;
    const all = [...document.images].filter((i) => (i.currentSrc || i.src) && i.complete && i.naturalWidth > 0);
    Promise.all(all.map((i) => (i.decode ? i.decode().catch(() => {}) : null))).then(() => { window.__pulseDecoded = true; });
    return all.length;
  };
  window.__pulse = { norm, fold, visible, visibleText, hasText, settleState, holdLoops, viewport, decodeImages };
})();
`;

/**
 * Runs before any script of the app: the moment of the last DOM mutation. A count-up or a
 * spring written in JavaScript is not a Web Animation — the only trace it leaves is that the DOM
 * keeps changing, and a capture must wait for that to stop.
 */
const MUTATION_CLOCK = String.raw`
(() => {
  if (window.__pulseMut) return;
  const real = performance.now.bind(performance);
  const mut = (window.__pulseMut = { last: real(), clock: real });
  new MutationObserver(() => { mut.last = real(); }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})();
`;

/**
 * Settled = the document is complete, no request is in flight, the fonts are loaded, no FINITE
 * animation is running and the DOM has not changed for `quiet` ms. A capture is never taken
 * earlier (PLAN 6.0, "Clock"). A page that does not settle fails the capture with what kept it busy.
 */
async function settle(page, net, { timeout = 20000, quiet = 350, clock = null } = {}) {
  const t0 = Date.now();
  let stableSince = null;
  let stableTicks = 0;
  let last = null;
  while (Date.now() - t0 < timeout) {
    let st;
    try {
      st = await page.evaluate(`(${PAGE_HELPERS.trim().replace(/;$/, '')}, window.__pulse.settleState())`);
    } catch {
      st = null; // a navigation is in progress; the document will be back
    }
    last = st;
    const idle = net.inflight.size === 0;
    const ok = st && idle && st.ready === 'complete' && st.fonts === 'loaded' && st.finiteAnimations === 0 && st.pendingImages === 0 && st.sinceMutation >= quiet;
    if (ok) {
      // Idle has to HOLD: a request that starts in the frame after a response is the usual waterfall.
      stableSince ??= Date.now();
      stableTicks++;
      if (clock?.virtual ? stableTicks >= 2 : Date.now() - stableSince >= 120) return st;
    } else {
      stableSince = null;
      stableTicks = 0;
    }
    await (clock ? clock.tick() : sleep(50));
  }
  throw new CaptureError('not-settled', `the page did not settle in ${timeout / 1000} s`, {
    inflight: [...net.inflight.values()].map((r) => `${r.method} ${r.url}`).slice(0, 10),
    page: last,
  });
}

/** One `arrived` clause. Returns null when it holds, or a sentence saying what is missing. */
async function checkArrived(page, clause, ctx) {
  if (Array.isArray(clause)) {
    for (const c of clause) {
      const miss = await checkArrived(page, c, ctx);
      if (miss) return miss;
    }
    return null;
  }
  if (clause.anyOf) {
    const misses = [];
    for (const c of clause.anyOf) {
      const miss = await checkArrived(page, c, ctx);
      if (!miss) return null;
      misses.push(miss);
    }
    return `none of the alternatives holds (${misses.join('; ')})`;
  }
  if (clause.role) {
    const tree = await axTree(page);
    const hits = axFind(tree, clause, ctx);
    return hits.length ? null : `no ${describeTarget(clause, ctx)}`;
  }
  if (clause.absent) {
    const tree = await axTree(page);
    return axFind(tree, clause.absent, ctx).length ? `${describeTarget(clause.absent, ctx)} is still there` : null;
  }
  if (clause.text !== undefined) {
    const text = typeof clause.text === 'string' ? clause.text : nameMatcherValue(clause.text, ctx);
    const ok = await page.evaluate(`window.__pulse.hasText(${JSON.stringify(text)})`);
    return ok ? null : `the visible text ${JSON.stringify(text)} is not on the page`;
  }
  if (clause.noText !== undefined) {
    const ok = await page.evaluate(`window.__pulse.hasText(${JSON.stringify(clause.noText)})`);
    return ok ? `the text ${JSON.stringify(clause.noText)} is still on the page` : null;
  }
  if (clause.url !== undefined) {
    const here = await page.evaluate('location.pathname + location.search');
    const want = ctx.fill(clause.url);
    const pathOnly = here.split('?')[0];
    return here === want || pathOnly === want ? null : `the address is ${here}, expected ${want}`;
  }
  throw new CaptureError('script', `an arrived clause needs role, text, noText, url, absent or anyOf: ${JSON.stringify(clause)}`);
}
function nameMatcherValue(spec, ctx) {
  if (spec.key) return ctx.translate(spec.key);
  return spec[ctx.lang] ?? spec.hu;
}

/** Waits (up to `timeout`) for an `arrived` clause; the page may still be answering a click. */
async function waitArrived(page, net, clause, ctx, what, timeout = 8000) {
  const t0 = Date.now();
  let miss = null;
  for (;;) {
    try {
      await page.evaluate(PAGE_HELPERS);
      miss = await checkArrived(page, clause, ctx);
    } catch (err) {
      if (err instanceof CaptureError) throw err;
      miss = `the page could not be read (${err.message})`;
    }
    if (!miss) return;
    if (Date.now() - t0 > timeout) break;
    if (ctx.settle?.clock) await ctx.settle.clock.tick();
    await sleep(ctx.settle?.clock?.virtual ? 20 : 120);
  }
  throw new CaptureError('not-arrived', `${what}: ${miss}`, { arrived: clause });
}

/**
 * One step of a click script. Every step that acts carries its own `arrived` clause; a step
 * without one is refused when the frames file is loaded (`validateState`).
 */
async function runStep(page, net, step, ctx, index, clock) {
  const what = `step ${index + 1}`;
  if (step.click) {
    const node = await axOne(page, step.click, ctx, `${what} (click)`);
    await clickNode(page, node, `${what} (click ${describeTarget(step.click, ctx)})`);
  } else if (step.type) {
    const node = await axOne(page, step.type, ctx, `${what} (type)`);
    await clickNode(page, node, `${what} (type into ${describeTarget(step.type, ctx)})`);
    if (step.type.clear !== false) {
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await pressKey(page, 'Backspace');
    }
    await page.send('Input.insertText', { text: String(step.type.text ?? '') });
  } else if (step.press) {
    await pressKey(page, step.press);
  } else if (step.advance !== undefined) {
    await clock.advance(Number(step.advance));
  } else if (step.scroll !== undefined) {
    if (step.scroll === 'end') {
      await pumped(clock, page.evaluate('window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })'));
    } else if (step.scroll === 'top') {
      await pumped(clock, page.evaluate('window.scrollTo({ top: 0, behavior: "instant" })'));
    } else if (typeof step.scroll === 'object') {
      const node = await axOne(page, step.scroll, ctx, `${what} (scroll)`);
      await page.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: node.backendId });
    } else {
      throw new CaptureError('script', `${what}: scroll takes "end", "top" or a { role, name } target`);
    }
  } else if (step.offline !== undefined) {
    await net.setOffline(!!step.offline);
  } else if (step.wait !== undefined) {
    /* `wait` is only its arrived clause */
  } else {
    throw new CaptureError('script', `${what}: unknown step ${JSON.stringify(step)}`);
  }
  if (step.settle !== false) await settle(page, net, ctx.settle);
  await waitArrived(page, net, step.arrived, ctx, `${what} did not arrive`);
}

/** Refuses a state the tool could not honestly run. Called for every state before a browser starts. */
export function validateState(state) {
  const problems = [];
  if (!state.route) problems.push('no route');
  if (!state.arrived) problems.push('no state-level "arrived" assertion');
  for (const [i, step] of (state.steps || []).entries()) {
    if (!step.arrived) problems.push(`step ${i + 1} has no "arrived" assertion`);
    for (const k of ['click', 'type']) {
      const t = step[k];
      if (t && (!t.role || t.name === undefined)) problems.push(`step ${i + 1}: ${k} must address a control by { role, name }`);
    }
  }
  return problems;
}

// ───────────────────────────────────────────────────────────────────────────── one state

/** The geometry of one capture: frame defaults, then the state, then the command line. */
function viewportOf(state, defaults, opts) {
  const width = opts.width ?? state.width ?? defaults.width ?? 402;
  let height = opts.height ?? state.height ?? defaults.height ?? 874;
  if (opts.scrollEnd) height = opts.height ?? 874;
  const scale = opts.scale ?? state.scale ?? (width >= 1280 ? 1 : defaults.scale ?? 2);
  const insets = opts.insets ?? state.insets ?? defaults.insets ?? [62, 34];
  const mobile = width < 768;
  return { width, height, scale, insets: mobile ? insets : [0, 0], mobile };
}

function translator(lang, i18nRoot) {
  let bundle = null;
  return (key) => {
    bundle ??= readJson(path.join(i18nRoot, `${lang}.json`));
    if (typeof bundle[key] === 'string') return bundle[key]; // the flat dotted top-level keys
    let cur = bundle;
    for (const part of key.split('.')) cur = cur && typeof cur === 'object' ? cur[part] : undefined;
    if (typeof cur !== 'string') throw new CaptureError('script', `i18n key ${key} is not a string in ${lang}.json`);
    return cur;
  };
}

/**
 * Network bookkeeping of one page: what is in flight (for `settle`), what failed and what the
 * console said (for the probes). Request interception is added on top by the mode (see `feed`).
 */
function watchNetwork(page) {
  const inflight = new Map();
  const requests = []; // { method, url, status, failed, errorText, type }
  const byId = new Map();
  const consoleEntries = [];
  let offline = false;
  page.on('Network.requestWillBeSent', (p) => {
    if (/^(data|blob|about|chrome-extension):/.test(p.request.url)) return;
    const rec = { id: p.requestId, method: p.request.method, url: p.request.url, type: p.type || '', status: null, failed: false, errorText: null };
    byId.set(p.requestId, rec);
    inflight.set(p.requestId, rec);
    requests.push(rec);
  });
  page.on('Network.responseReceived', (p) => {
    const rec = byId.get(p.requestId);
    if (rec) rec.status = p.response.status;
  });
  page.on('Network.loadingFinished', (p) => inflight.delete(p.requestId));
  page.on('Network.loadingFailed', (p) => {
    inflight.delete(p.requestId);
    const rec = byId.get(p.requestId);
    if (rec) {
      rec.failed = !p.canceled;
      rec.canceled = !!p.canceled;
      rec.errorText = p.errorText || p.blockedReason || 'failed';
    }
  });
  // An EventSource or a WebSocket never "finishes"; it must not keep a page from settling.
  page.on('Network.eventSourceMessageReceived', (p) => inflight.delete(p.requestId));
  page.on('Network.webSocketCreated', (p) => inflight.delete(p.requestId));

  page.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'warning' && p.type !== 'assert') return;
    const text = p.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
    consoleEntries.push({ level: p.type === 'warning' ? 'warning' : 'error', source: 'console', text: text.slice(0, 600) });
  });
  page.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    consoleEntries.push({ level: 'error', source: 'exception', text: String(d.exception?.description || d.text).slice(0, 600) });
  });
  page.on('Log.entryAdded', (p) => {
    if (p.entry.level !== 'error' && p.entry.level !== 'warning') return;
    consoleEntries.push({ level: p.entry.level, source: p.entry.source, text: String(p.entry.text).slice(0, 600), url: p.entry.url || null });
  });
  const dialogs = [];
  page.on('Page.javascriptDialogOpening', (p) => {
    dialogs.push({ type: p.type, message: p.message });
    page.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
  });
  const setOffline = async (value) => {
    offline = value;
    await page.send('Network.emulateNetworkConditions', { offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  };
  return { inflight, requests, consoleEntries, dialogs, setOffline, isOffline: () => offline };
}

/** `/api/v1/plans/12?x=1&a=2` -> `{ path: '/api/v1/plans/12', query: 'a=2&x=1' }` (sorted, stable). */
export function splitApiUrl(url) {
  const u = new URL(url, 'http://x');
  const pairs = [...u.searchParams.entries()].sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return { path: u.pathname, query: pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') };
}

/** `/api/v1/plans/*` style patterns: `*` is one path segment, `**` any tail. */
function pathMatches(pattern, pathname) {
  if (pattern === pathname) return true;
  if (!pattern.includes('*')) return false;
  const re = new RegExp(
    '^' + pattern.split('/').map((seg) => (seg === '**' ? '.*' : seg === '*' ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$',
  );
  return re.test(pathname);
}

/**
 * Awaits something the page can only finish when frames are produced (a scroll, measured: the
 * call did not return in 15 s under a paused virtual clock) — the clock is nudged meanwhile.
 */
async function pumped(clock, promise) {
  let done = false;
  promise.then(() => (done = true), () => (done = true));
  while (!done) await (clock?.nudge ? clock.nudge() : sleep(20));
  return promise;
}

/**
 * Lets the page render `count` frames. A decoded picture is only ON the page after the next
 * rendering update, and under a paused virtual clock no update happens by itself (measured: one
 * replay in three captured the marketplace cover before it was painted).
 */
async function waitFrames(page, clock, count = 2) {
  await page.evaluate(
    `(window.__pulseFrames = 0, (function next() { requestAnimationFrame(() => { if (++window.__pulseFrames < ${count}) next(); }); })(), 0)`,
  );
  const t0 = Date.now();
  for (let i = 0; i < 400; i++) {
    if ((await page.evaluate('window.__pulseFrames')) >= count) {
      if (DEBUG) console.error(`[frames] ${count} frames after ${i} waits, ${Date.now() - t0} ms`);
      return true;
    }
    if (i === 30) await page.send('Page.bringToFront').catch(() => {});
    // 4 virtual ms at a time is enough when frames come at 60 Hz; a window Chrome renders lazily
    // needs a longer stretch of (virtual) time before it draws at all
    if (i < 30 || !clock?.virtual) await (clock?.nudge ? clock.nudge() : sleep(20));
    else await clock.tick();
  }
  return false;
}

/**
 * One screenshot. Under a PAUSED virtual clock the compositor may never produce the frame a
 * screenshot waits for (measured: the second capture of a page hung for 60 s), so the clock is
 * nudged forward a few virtual milliseconds at a time until the picture arrives. The wall clock
 * the page reads is pinned separately, so the nudges change nothing a user could see.
 */
async function screenshot(page, clock, timeout = 60000) {
  let done = false;
  const shot = page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, optimizeForSpeed: false }, timeout);
  shot.then(() => (done = true), () => (done = true));
  while (!done) await (clock?.nudge ? clock.nudge() : sleep(20));
  return Buffer.from((await shot).data, 'base64');
}

/**
 * The screenshot, taken twice: a capture is only kept when two consecutive frames are the same
 * bytes. That is the last line of defence against anything still moving that neither the
 * animation list nor the mutation clock can see (a canvas, a late image decode, a font swap).
 */
async function stillShot(page, result, clock) {
  const take = () => screenshot(page, clock);
  const rendered = async () => {
    if (await waitFrames(page, clock, 2)) return;
    // Without a rendered frame a decoded picture may still be missing from the page. With no
    // picture on it, two equal screenshots are proof enough; with one, the capture is not trusted.
    if (DEBUG) console.error('[frames]', await page.evaluate('JSON.stringify({ vis: document.visibilityState, focus: document.hasFocus(), frames: window.__pulseFrames, anims: document.getAnimations().map((a) => a.playState + ":" + (a.animationName || a.constructor.name)).slice(0, 8), dialogs: document.querySelectorAll("dialog[open]").length })'));
    if (result.images > 0) throw new CaptureError('unstable', 'the page rendered no frame (requestAnimationFrame never fired) and holds pictures — capture it again');
    result.framesNotConfirmed = true;
  };
  await rendered();
  let prev = await take();
  for (let attempt = 1; attempt <= 8; attempt++) {
    await sleep(100);
    await rendered();
    const next = await take();
    if (next.equals(prev)) {
      result.stillAfter = attempt;
      return next;
    }
    prev = next;
  }
  result.still = false;
  throw new CaptureError('unstable', 'the page never showed the same pixels twice in a row (something is still moving)');
}

export const MODES = ['replay', 'record', 'live'];

/**
 * Captures ONE state. Returns a result object; never throws for a failed capture (the failure is
 * in `result.failures`) so a sweep goes on to the next state.
 */
async function captureState(browser, state, env) {
  const { opts, frames, outDir } = env;
  const email = accountEmail(frames, opts.account ?? state.account);
  const vp = viewportOf(state, frames.defaults, opts);
  const lang = opts.lang || state.lang || frames.defaults.lang || 'hu';
  const suffix = env.suffix;
  const fileBase = path.join(outDir, `${state.key}${suffix}`);
  const result = {
    key: state.key,
    frame: state.frame ?? null,
    mode: opts.mode,
    account: email || 'signed out',
    route: null,
    viewport: vp,
    lang,
    ok: false,
    failures: [],
    files: {},
    startedAt: nowIso(),
  };
  const fail = (kind, message, detail) => result.failures.push({ kind, message, ...(detail ? { detail } : {}) });

  const problems = validateState(state);
  if (problems.length) {
    for (const p of problems) fail('script', `${state.key}: ${p}`);
    return result;
  }

  let page = null;
  let ctxClock = null;
  try {
    const ids = await env.resolveIds(state);
    const fill = (s) => String(s).replace(/\{([\w.:@-]+)\}/g, (m, k) => {
      if (ids[k] === undefined) throw new CaptureError('script', `${state.key}: no value for {${k}} (declare it under "resolve" or "ids")`);
      return ids[k];
    });
    const route = fill(state.route);
    result.route = route;
    const ctx = { lang, translate: translator(lang, opts.i18nRoot), fill, settle: { timeout: opts.settleTimeout, quiet: opts.quiet } };

    page = await openPage(browser, { width: vp.width, height: vp.height });
    const net = watchNetwork(page);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Log.enable');
    await page.send('DOM.enable');
    await page.send('Accessibility.enable');
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    // A background window is throttled: no frames, no requestAnimationFrame. This one is always "in front".
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await page.send('Page.bringToFront').catch(() => {});
    // The service worker would answer navigations from its own cache; a capture must see the build.
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.scale,
      mobile: vp.mobile,
      screenWidth: vp.width,
      screenHeight: vp.height,
    });
    await page.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: vp.insets[0], bottom: vp.insets[1], left: 0, right: 0 } });
    await page.send('Emulation.setTimezoneOverride', { timezoneId: opts.timezone });
    await page.send('Emulation.setLocaleOverride', { locale: 'hu-HU' }).catch(() => {});
    if (opts.reducedMotion) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    }

    // Storage the app reads before its first paint: language, and (for the D1 proof) stale theme state.
    const storage = { 'tracker.lang': lang, ...(state.localStorage || {}), ...(opts.localStorage || {}) };
    const boot = [
      MUTATION_CLOCK,
      `try { for (const [k, v] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {}`,
      // A never-settling registration: no worker installs, and nothing is logged about it.
      `try { if (window.ServiceWorkerContainer) ServiceWorkerContainer.prototype.register = () => new Promise(() => {}); } catch {}`,
      // A blinking caret is the one pixel that differs between two captures of the same state.
      `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.setAttribute('data-pulse-shot', ''); s.textContent = '*, *::before, *::after { caret-color: transparent !important; }'; document.head.appendChild(s); });`,
    ];
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: boot.join('\n') });

    const clock = await installClock(page, env.clockKind, clockOf(state, env));
    ctx.settle.clock = clock;
    ctxClock = clock;
    result.clock = { kind: clock.kind, instant: clock.t0 ? new Date(clock.t0).toISOString() : null };
    const feed = await env.installFeed(page, net, state, { email, ids, fill, result, fail });

    if (email && opts.mode !== 'replay') {
      const access = await getAccess(email, { api: opts.api, minRemainingMs: 4 * 60 * 1000, quiet: true });
      const host = new URL(opts.base).hostname;
      const set = await page.send('Network.setCookie', {
        name: 'access',
        value: access.value,
        domain: host,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        expires: Math.floor(access.expires / 1000),
      });
      if (!set.success) throw new CaptureError('login', 'the access cookie could not be set in the page');
    }

    const origin = new URL(opts.base).origin;
    const loaded = new Promise((resolve) => {
      const off = page.on('Page.loadEventFired', () => {
        off();
        resolve();
      });
    });
    const mark = Date.now();
    const lap = (name) => {
      result.timing[name] = Date.now() - mark;
    };
    result.timing = {};
    const nav = await page.send('Page.navigate', { url: origin + route });
    if (nav.errorText) throw new CaptureError('navigate', `cannot open ${origin + route}: ${nav.errorText}`);
    // Under virtual time the load itself needs time to pass: pump until the load event (or give up).
    {
      let done = false;
      loaded.then(() => {
        done = true;
      });
      const t = Date.now();
      while (!done && Date.now() - t < 20000) await clock.tick();
    }
    await settle(page, net, ctx.settle);
    await page.evaluate(PAGE_HELPERS);
    await waitArrived(page, net, state.arrived && !(state.steps || []).length ? state.arrived : state.opened || { url: route.split('?')[0] }, ctx, `${state.key} did not open`);

    const steps = state.steps || [];
    for (let i = 0; i < steps.length; i++) await runStep(page, net, steps[i], ctx, i, clock);
    if (steps.length) await waitArrived(page, net, state.arrived, ctx, `${state.key} did not reach its state`);

    if (opts.scrollEnd) {
      await pumped(clock, page.evaluate('window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })'));
      await settle(page, net, ctx.settle);
    }
    await settle(page, net, ctx.settle);
    lap('settled');
    await env.beforeShot(page, state, result);
    lap('probed');

    // The page must really be the size that was asked for — a capture of another viewport proves nothing.
    const seen = await page.evaluate('window.__pulse.viewport()');
    result.page = seen;
    if (seen.width !== vp.width || seen.height !== vp.height || seen.dpr !== vp.scale) {
      throw new CaptureError('viewport', `the page is ${seen.width} x ${seen.height} @${seen.dpr}, asked for ${vp.width} x ${vp.height} @${vp.scale}`);
    }
    if (Math.round(seen.insetTop) !== vp.insets[0] || Math.round(seen.insetBottom) !== vp.insets[1]) {
      throw new CaptureError('viewport', `safe-area insets are ${seen.insetTop} / ${seen.insetBottom}, asked for ${vp.insets[0]} / ${vp.insets[1]}`);
    }

    result.heldLoops = await page.evaluate('window.__pulse.holdLoops()');
    result.images = await page.evaluate('window.__pulse.decodeImages()');
    for (let i = 0; i < 400 && !(await page.evaluate('window.__pulseDecoded')); i++) await clock.nudge();
    lap('decoded');
    const png = await stillShot(page, result, clock);
    lap('shot');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(`${fileBase}.png`, png);
    result.files.png = `${fileBase}.png`;
    result.png = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha1: sha1(png) };

    const inventory = await controlInventory(page, origin);
    writeJson(`${fileBase}.controls.json`, { state: state.key, route, account: result.account, viewport: vp, lang, controls: inventory });
    result.files.controls = `${fileBase}.controls.json`;
    result.controls = inventory.length;

    await env.afterShot(page, net, state, { result, fail, fileBase, ctx, png, vp, clock, origin });
    if (opts.probeWrite) await feed.probeWriteGuard(clock);
    await feed.finish();
    result.reach = state.reach ?? null;
    // A frame that was fed by a fixture can never be more than "matched-fixture" (R26).
    result.verdictCap = feed.usedFixture() ? 'matched-fixture' : state.reach === 'superseded' || state.reach === 'specimen' ? 'structure' : 'matched';

    // Console and requests against what the state declares (5.1 row 4).
    const expect = { ...(frames.defaults.expect || {}), ...(state.expect || {}) };
    const allowedRequest = (r) => {
      const { path: p } = splitApiUrl(r.url);
      return (expect.requests || []).some((e) => pathMatches(e.path, p) && (e.status === undefined || e.status === r.status) && (!e.method || e.method === r.method));
    };
    const isProbe = (url) => /__pulse-write-probe/.test(url || '');
    const badRequests = net.requests.filter((r) => (r.failed || (r.status !== null && r.status >= 400)) && !allowedRequest(r) && !isProbe(r.url));
    const allowedConsole = (c) => (expect.console || []).some((pat) => new RegExp(pat).test(c.text)) ||
      // The browser's own line about a declared failed request is that request, not a second defect.
      (c.source === 'network' && c.url && net.requests.some((r) => r.url === c.url && (r.failed || r.status >= 400) && allowedRequest(r)));
    const badConsole = net.consoleEntries.filter((c) => c.level === 'error' && !allowedConsole(c) && !isProbe(c.url) && !(opts.probeWrite && /ERR_BLOCKED_BY_CLIENT/.test(c.text)));
    result.requests = { total: net.requests.length, failed: badRequests.map((r) => ({ method: r.method, url: r.url.replace(origin, ''), status: r.status, error: r.errorText })) };
    result.console = { errors: badConsole, warnings: net.consoleEntries.filter((c) => c.level === 'warning').length, dialogs: net.dialogs };
    for (const r of result.requests.failed) fail('request', `${r.method} ${r.url} -> ${r.status ?? r.error}`);
    for (const c of badConsole) fail('console', c.text);
    for (const d of net.dialogs) fail('dialog', `a ${d.type} dialog opened: ${d.message}`);
  } catch (err) {
    if (err instanceof CaptureError) fail(err.kind, err.message, err.detail);
    else if (err instanceof LoginRefused) fail('login', err.message);
    else fail('tool', err.stack || String(err));
    // What the page looked like when it failed is the fastest way to see why.
    if (page) {
      try {
        const shot = await screenshot(page, ctxClock, 20000);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(`${fileBase}.FAILED.png`, shot);
        result.files.failedPng = `${fileBase}.FAILED.png`;
        // …and what could have been addressed: the names a click script may use on this page.
        const controls = await controlInventory(page, new URL(opts.base).origin);
        writeJson(`${fileBase}.FAILED.controls.json`, { state: state.key, route: result.route, controls });
        result.files.failedControls = `${fileBase}.FAILED.controls.json`;
      } catch {
        /* the page is gone */
      }
    }
  } finally {
    if (page) await page.close();
  }
  result.ok = result.failures.length === 0;
  result.finishedAt = nowIso();
  return result;
}

// ───────────────────────────────────────────────────────────────────────────── the clock

/** Virtual milliseconds granted per pump while the tool waits for the page. */
const CLOCK_QUANTUM = 100;

/**
 * Pins what the page reads as "now". `Date.now()` and `new Date()` return the recording instant
 * plus what the script advanced — and nothing else, so the wall clock of a capture never depends
 * on how long the page took to load. Timers are NOT touched here; they belong to the clock kind.
 */
function dateShimSource(t0) {
  return String.raw`
(() => {
  if (window.__pulseClock) return;
  const RealDate = Date;
  const state = { t0: ${Number(t0)}, offset: 0 };
  function PulseDate(...args) {
    if (!new.target) return new RealDate(state.t0 + state.offset).toString();
    return args.length ? Reflect.construct(RealDate, args, new.target) : Reflect.construct(RealDate, [state.t0 + state.offset], new.target);
  }
  PulseDate.prototype = RealDate.prototype;
  PulseDate.now = () => state.t0 + state.offset;
  PulseDate.parse = RealDate.parse;
  PulseDate.UTC = RealDate.UTC;
  Object.defineProperty(PulseDate, 'name', { value: 'Date' });
  window.Date = PulseDate;
  window.__pulseClock = state;
})();
`;
}

/**
 * The three clocks (PLAN 6.0, "Clock"):
 *
 *   virtual  CDP virtual time started at the recording instant. Timers, rAF and `performance.now`
 *            run on it; it only moves when the tool grants a budget, and it stands still while a
 *            request is pending — so a slow disk or a busy machine cannot change what a timer saw.
 *            The wall clock is pinned on top of it (see `dateShimSource`).
 *   shim     the plan's fallback: the pinned wall clock alone, timers in real time.
 *   real     nothing is touched (live smoke).
 *
 * `advance(ms)` moves the wall clock AND lets `ms` of timer time pass: a rest countdown, an undo
 * toast and an interval run are reachable and repeatable.
 */
async function installClock(page, kind, t0) {
  if (kind === 'real') {
    return {
      kind, t0: null, virtual: false,
      tick: () => sleep(50),
      nudge: () => sleep(20),
      advance: async () => {
        throw new CaptureError('script', 'an "advance" step needs a pinned clock (replay, record, or --clock virtual|shim)');
      },
    };
  }
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: dateShimSource(t0) });
  let offset = 0;
  const setOffset = () => page.evaluate(`window.__pulseClock && (window.__pulseClock.offset = ${offset})`);
  if (kind === 'shim') {
    return {
      kind, t0, virtual: false,
      tick: () => sleep(50),
      nudge: () => sleep(20),
      advance: async (ms) => {
        offset += ms;
        await setOffset();
        await sleep(1200); // real timers: one tick of a 1 s interval picks the new time up
      },
    };
  }
  let waiter = null;
  page.on('Emulation.virtualTimeBudgetExpired', () => {
    const w = waiter;
    waiter = null;
    if (w) w();
  });
  await page.send('Emulation.setVirtualTimePolicy', { policy: 'pause', initialVirtualTime: t0 / 1000 });
  const grant = async (budget) => {
    const done = new Promise((r) => {
      waiter = r;
    });
    await page.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget });
    const ok = await Promise.race([done.then(() => true), sleep(30000).then(() => false)]);
    if (!ok) throw new CaptureError('clock', `virtual time did not move ${budget} ms in 30 s (a request never finished)`);
  };
  return {
    kind, t0, virtual: true,
    tick: async () => {
      await grant(CLOCK_QUANTUM);
      await sleep(8); // decoding and raster are not on virtual time; give them a breath
    },
    /** The smallest step: lets a frame be produced without letting a timer of any length run out. */
    nudge: async () => {
      await grant(4);
      await sleep(8);
    },
    advance: async (ms) => {
      offset += ms;
      await setOffset();
      await grant(ms);
    },
  };
}

/**
 * `--self-test`: the two controls of the pinned clock, proven on a blank page of the app's origin.
 * "Set": the page reads the instant it was given. "Advance": the wall clock moves by exactly what
 * the script asked AND a timer of that length fires — no earlier, no later.
 */
async function selfTestClock(browser, base, kind) {
  const page = await openPage(browser);
  const t0 = Date.parse('2026-10-09T15:00:00+02:00');
  const out = { kind, checks: [], ok: false };
  const check = (name, got, want) => out.checks.push({ name, got, want, ok: got === want });
  try {
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    const clock = await installClock(page, kind, t0);
    let loaded = false;
    page.on('Page.loadEventFired', () => (loaded = true));
    await page.send('Page.navigate', { url: `${base}/favicon.svg` });
    for (let i = 0; i < 400 && !loaded; i++) await clock.tick();
    check('the page clock starts at the given instant', await page.evaluate('Date.now()'), t0);
    check('new Date() agrees', await page.evaluate('new Date().toISOString()'), new Date(t0).toISOString());
    await page.evaluate('(window.__fired = 0, setTimeout(() => { window.__fired = Date.now(); }, 30000), 0)');
    for (let i = 0; i < 20; i++) await clock.tick(); // waiting for the page never moves the wall clock
    check('waiting does not move the wall clock', await page.evaluate('Date.now()'), t0);
    if (kind === 'virtual') {
      await clock.advance(25000);
      check('after advance 25 s the wall clock is +25 s', await page.evaluate('Date.now()'), t0 + 25000);
      check('a 30 s timer has not fired within 25 s (plus the waiting above)', await page.evaluate('window.__fired'), 0);
      await clock.advance(10000);
      check('after 10 s more the wall clock is +35 s', await page.evaluate('Date.now()'), t0 + 35000);
      check('the 30 s timer fired, and saw the advanced clock', await page.evaluate('window.__fired'), t0 + 35000);
    } else {
      await clock.advance(25000);
      check('after advance 25 s the wall clock is +25 s (timers stay on real time with this clock)', await page.evaluate('Date.now()'), t0 + 25000);
    }
    out.ok = out.checks.every((c) => c.ok);
  } catch (err) {
    out.error = err.message;
  } finally {
    await page.close();
  }
  return out;
}

/** Both pinned clocks, on a page of `base`. Used by `--self-test` and by `pulse-verify --package F3`. */
export async function selfTest(base) {
  const browser = await launchChrome();
  try {
    const results = [await selfTestClock(browser, base, 'virtual'), await selfTestClock(browser, base, 'shim')];
    return { ok: results.every((r) => r.ok), browser: browser.product, results };
  } finally {
    await browser.close();
  }
}

// ───────────────────────────────────────────────────────────────────────────── the freeze (recordings)

/**
 * The store of recorded responses: `.pulse/rec/<account>/<METHOD>_<path>_<hash>.json`, one file
 * per method + path + sorted query, and `_meta.json` with the recording instant.
 *
 * An entry holds the status, the content type and the body — parsed when it is JSON (so a fixture
 * can edit it and a human can read it), text or base64 otherwise. It never holds a header that
 * carries a credential: only the content type is kept.
 */
export function recStore(dir = path.join(pulseDir(), 'rec')) {
  const metaFile = path.join(dir, '_meta.json');
  const fileOf = (account, method, apiPath, query = '') => {
    const slug = apiPath.replace(/^\/api\/v1\//, '').replace(/[^a-zA-Z0-9.-]+/g, '_').slice(0, 70);
    return path.join(dir, account, `${method}_${slug}_${sha1(`${method} ${apiPath}?${query}`).slice(0, 10)}.json`);
  };
  let tokens = null;
  let tokensAt = 0;
  const credentialIn = (text) => {
    if (!tokens || Date.now() - tokensAt > 5000) {
      tokens = [];
      tokensAt = Date.now();
      if (fs.existsSync(JAR_DIR)) {
        for (const f of fs.readdirSync(JAR_DIR)) {
          if (!f.endsWith('.json')) continue;
          const jar = readJsonIf(path.join(JAR_DIR, f));
          for (const k of ['access', 'refresh']) if (jar?.[k]?.value) tokens.push(jar[k].value);
        }
      }
    }
    return tokens.some((t) => text.includes(t));
  };
  return {
    dir,
    meta: () => readJsonIf(metaFile),
    writeMeta: (meta) => {
      writeJson(metaFile, meta);
      return meta;
    },
    fileOf,
    has: (account, method, apiPath, query) => fs.existsSync(fileOf(account, method, apiPath, query)),
    get: (account, method, apiPath, query) => readJsonIf(fileOf(account, method, apiPath, query)),
    /** `buf` is the raw body. Returns the entry that was written. */
    put: (account, { method, path: apiPath, query = '', status, contentType = '', buf, state = null }) => {
      const type = String(contentType || '');
      let encoding = 'base64';
      let body = buf.toString('base64');
      const text = /json|^text\/|xml|javascript|calendar/i.test(type) || !buf.length ? buf.toString('utf8') : null;
      if (text !== null) {
        if (credentialIn(text)) throw new CaptureError('credential', `${method} ${apiPath} carries a session token in its body — not stored`);
        encoding = 'utf8';
        body = text;
        if (/json/i.test(type)) {
          try {
            body = JSON.parse(text);
            encoding = 'json';
          } catch {
            /* a body that says JSON and is not stays text */
          }
        }
      }
      const entry = { method, path: apiPath, query, status, contentType: type, encoding, body, recordedAt: nowIso(), state };
      writeJson(fileOf(account, method, apiPath, query), entry);
      return entry;
    },
  };
}

/** The bytes of a stored entry, as the browser should receive them. */
function entryBuffer(entry, body = entry.body) {
  if (entry.encoding === 'json') return Buffer.from(JSON.stringify(body), 'utf8');
  if (entry.encoding === 'base64') return Buffer.from(body, 'base64');
  return Buffer.from(String(body), 'utf8');
}

// ───────────────────────────────────────────────────────────────────────────── fixtures (R26)

/**
 * JSON pointers with two additions a list of rows needs:
 *   `/clients/[email=user@tracker.local]/link_id`   the first row whose field has that value
 *   `/clients/STAR/must_change_credentials`         every row (STAR = `*`; edits only)
 * and `-` after an array appends (RFC 6902).
 */
function pointerParts(pointer) {
  if (pointer === '' || pointer === '/') return [];
  if (!pointer.startsWith('/')) throw new CaptureError('fixture', `a pointer starts with "/": ${pointer}`);
  return pointer.slice(1).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
}
function selectChildren(node, part) {
  // -> [[key, child], …] of `node` addressed by one pointer part
  const sel = /^\[([^=\]]+)=(.*)\]$/.exec(part);
  if (sel) {
    if (!Array.isArray(node)) return [];
    const i = node.findIndex((row) => row && String(row[sel[1]]) === sel[2]);
    return i < 0 ? [] : [[i, node[i]]];
  }
  if (part === '*') return Array.isArray(node) ? node.map((v, i) => [i, v]) : node && typeof node === 'object' ? Object.entries(node) : [];
  if (Array.isArray(node)) {
    const i = Number(part);
    return Number.isInteger(i) && i >= 0 && i < node.length ? [[i, node[i]]] : [];
  }
  return node && typeof node === 'object' && part in node ? [[part, node[part]]] : [];
}
export function pointerGet(doc, pointer) {
  let cur = doc;
  for (const part of pointerParts(pointer)) {
    const hit = selectChildren(cur, part)[0];
    if (!hit) return undefined;
    cur = hit[1];
  }
  return cur;
}
/**
 * Applies `[{ pointer, value } | { pointer, remove: true }]` to a copy of `doc`.
 * A pointer that addresses nothing is an error: an edit that silently does nothing would leave a
 * "fixture" that is really the recording.
 */
export function applyEdits(doc, edits) {
  const out = structuredClone(doc);
  for (const edit of edits) {
    const parts = pointerParts(edit.pointer);
    if (!parts.length) throw new CaptureError('fixture', 'an edit cannot replace the whole document — give the body instead');
    let parents = [out];
    for (const part of parts.slice(0, -1)) {
      parents = parents.flatMap((n) => selectChildren(n, part).map(([, child]) => child));
    }
    const last = parts.at(-1);
    let touched = 0;
    for (const parent of parents) {
      if (last === '-' && Array.isArray(parent)) {
        parent.push(structuredClone(edit.value));
        touched++;
        continue;
      }
      if (edit.insert) {
        // `"insert": true` puts a new row BEFORE the index the pointer names (a list that is newest first)
        const at = Number(last);
        if (!Array.isArray(parent) || !Number.isInteger(at) || at < 0 || at > parent.length) continue;
        parent.splice(at, 0, structuredClone(edit.value));
        touched++;
        continue;
      }
      const targets = selectChildren(parent, last);
      if (edit.remove) {
        // highest index first, so removing several rows of one array keeps the others in place
        for (const [key] of targets.sort((a, b) => (typeof b[0] === 'number' ? b[0] - a[0] : 0))) {
          if (Array.isArray(parent)) parent.splice(key, 1);
          else delete parent[key];
          touched++;
        }
        continue;
      }
      if (targets.length) {
        for (const [key] of targets) {
          parent[key] = structuredClone(edit.value);
          touched++;
        }
      } else if (parent && typeof parent === 'object' && !Array.isArray(parent) && !/^\[|^\*$/.test(last) && edit.add) {
        // a NEW key only when the edit says so (`"add": true`) — pulse-fixture-check then checks it against the recordings
        parent[last] = structuredClone(edit.value);
        touched++;
      }
    }
    if (!touched) throw new CaptureError('fixture', `the edit ${edit.pointer} addresses nothing in the response`);
  }
  return out;
}

export function loadFixture(name) {
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new CaptureError(
      'fixture',
      `fixture "${name}" is named by the state but ${path.relative(REPO_DIR, file).replace(/\\/g, '/')} does not exist yet (the fixture of a frame state is written by the package that owns the frame)`,
    );
  }
  const doc = readJson(file);
  // "fixtures" is the key pulse-fixture-check (F4) looks for; "responses" is read for older files
  doc.fixtures = doc.fixtures ?? doc.responses;
  if (!Array.isArray(doc.fixtures)) throw new CaptureError('fixture', `${name}.json has no "fixtures" list`);
  return doc;
}

/** Fixture responses of the state first, then its stubs, then the stubs every state gets. */
function collectRules(state, env) {
  const out = [];
  if (state.fixture && env.opts.fixtures !== false) {
    for (const r of loadFixture(state.fixture).fixtures) out.push({ ...r, source: `fixture ${state.fixture}` });
  }
  // a package's extra state carries its fixture inline (states.json), checked by the same pulse-fixture-check
  if (env.opts.fixtures !== false) for (const r of state.fixtures || state.responses || []) out.push({ ...r, source: 'fixture (inline)' });
  for (const r of state.stubs || []) out.push({ ...r, source: 'state stub' });
  for (const r of env.frames.defaults.stubs || []) out.push({ ...r, source: 'default stub' });
  for (const r of out) {
    if (!r.path) throw new CaptureError('fixture', `a ${r.source} has no "path"`);
    r.method = String(r.method || 'GET').toUpperCase();
  }
  return out;
}

function subsetOf(want, have) {
  if (want === null || typeof want !== 'object') return want === have;
  if (!have || typeof have !== 'object') return false;
  return Object.entries(want).every(([k, v]) => subsetOf(v, have[k]));
}

function findRule(rules, { method, apiPath, query, reqBody, fired, fill }) {
  return rules.find((r) => {
    if (r.method !== method || !pathMatches(fill(r.path), apiPath)) return false;
    if (r.after && !fired.has(r.after)) return false;
    if (r.query) {
      const have = Object.fromEntries(new URLSearchParams(query));
      if (!Object.entries(r.query).every(([k, v]) => have[k] === String(v))) return false;
    }
    if (r.whenBody && !subsetOf(r.whenBody, reqBody)) return false;
    return true;
  });
}

/** A rule that answers by itself (the request never leaves the browser), as opposed to edits over the real answer. */
const answersAlone = (rule, method) => rule.body !== undefined || rule.from !== undefined || (method !== 'GET' && method !== 'HEAD');

/**
 * The feed of one page: what every /api request of a capture is answered with.
 *
 *   replay  GET -> the recording (plus the edits of a fixture); anything unrecorded FAILS the capture.
 *   record  GET -> the live server, stored; with --only-missing, what is recorded is replayed.
 *   live    GET -> the live server.
 *   any     a non-GET is answered by a fixture or a stub, or it is stopped in the browser — the one
 *           exception is a live state whose `writes` name it on a sandbox object (R25).
 */
function makeFeed(env) {
  const { opts, store } = env;
  return async (page, net, state, { email, fill, result, fail }) => {
    const origin = new URL(opts.base).origin;
    const account = accountDir(email);
    const mode = opts.mode;
    const rules = collectRules(state, env);
    const writes = mode === 'live' ? allowedWrites(state, env, email, fill) : [];
    if ((state.writes || []).length && mode !== 'live') {
      throw new CaptureError('writes', `${state.key} declares live writes: it can only run with --live (in ${mode} a write is a fixture)`);
    }
    result.writes = [];
    result.unrecorded = [];
    result.fixtureHits = [];
    result.recorded = 0;
    const fired = new Set();
    const jobs = new Set();
    const jsonHeaders = [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }];

    const t0 = clockOf(state, env) ?? Date.now();
    const expandCtx = (req) => ({
      t0,
      timezone: opts.timezone,
      fill: (s) =>
        fill(
          String(s)
            .replace(/\{\$body\.([\w.]+)\}/g, (m, k) => {
              const v = k.split('.').reduce((o, p) => o?.[p], req.reqBody);
              if (v === undefined) throw new CaptureError('fixture', `the request body has no "${k}"`);
              return String(v);
            })
            // {$path.3} = the fourth segment of the request path: the id a mutation was fired at
            .replace(/\{\$path\.(\d+)\}/g, (m, i) => req.apiPath.split('/').filter(Boolean)[Number(i)] ?? '')
            .replace(/\{\$today(?::(-?\d+))?\}/g, (m, d) => localDate(t0 + Number(d || 0) * 86400000, opts.timezone))
            .replace(/\{\$monday\}/g, () => mondayOf(t0, opts.timezone)),
        ),
      read: (apiPathWithQuery) => env.readApi(email, apiPathWithQuery),
    });

    const answer = async (rule, req) => {
      const ctx = expandCtx(req);
      let status = rule.status ?? 200;
      let body;
      if (rule.body !== undefined) {
        body = await expandTemplate(rule.body, ctx);
      } else if (rule.from) {
        // built from another answer of the API: recorded in a replay, freshly read on a live run
        body = await ctx.read(ctx.fill(rule.from.path));
        if (rule.from.pointer) body = pointerGet(body, ctx.fill(rule.from.pointer));
        if (body === undefined) throw new CaptureError('fixture', `${rule.source}: ${rule.from.path} has nothing at ${rule.from.pointer}`);
      }
      if (rule.edits) body = applyEdits(body, await expandTemplate(rule.edits, ctx));
      const buf = status === 204 || body === undefined || body === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), 'utf8');
      return { status, buf };
    };

    const handle = async (p) => {
      const id = { requestId: p.requestId };
      const method = p.request.method;
      const { path: apiPath, query } = splitApiUrl(p.request.url);
      const label = `${method} ${apiPath}${query ? `?${query}` : ''}`;
      const atResponse = p.responseStatusCode !== undefined || p.responseErrorReason !== undefined;
      if (DEBUG) console.error(`[feed] ${atResponse ? 'response' : 'request '} ${label}`);
      const fulfill = (status, headers, buf) =>
        page.send('Fetch.fulfillRequest', { ...id, responseCode: status, responseHeaders: headers, body: buf.toString('base64') });

      if (net.isOffline()) return page.send('Fetch.failRequest', { ...id, errorReason: 'InternetDisconnected' });
      if (apiPath === '/healthz') {
        // the offline indicator's probe: "the network is real" is true by definition in a replay
        return mode === 'replay' ? fulfill(200, jsonHeaders, Buffer.from('{"ok":true}')) : page.send('Fetch.continueRequest', id);
      }

      let reqBody = null;
      if (p.request.postData) {
        try {
          reqBody = JSON.parse(p.request.postData);
        } catch {
          /* multipart or text: a rule can still match by path */
        }
      }
      const req = { method, apiPath, query, reqBody, fired, fill };
      const isRead = method === 'GET' || method === 'HEAD';

      if (atResponse) {
        // only live / record get here, and only for requests that were let through
        if (!isRead || p.responseErrorReason) return page.send('Fetch.continueRequest', id);
        let got;
        try {
          got = await page.send('Fetch.getResponseBody', id);
        } catch {
          return page.send('Fetch.continueRequest', id); // a redirect has no body to read
        }
        const buf = Buffer.from(got.body, got.base64Encoded ? 'base64' : 'utf8');
        const contentType = (p.responseHeaders || []).find((h) => h.name.toLowerCase() === 'content-type')?.value || '';
        if (mode === 'record') env.record(account, { method, path: apiPath, query, status: p.responseStatusCode, contentType, buf, state: state.key }, result);
        const rule = findRule(rules, req);
        if (rule?.edits && !answersAlone(rule, method)) {
          const edited = applyEdits(JSON.parse(buf.toString('utf8')), await expandTemplate(rule.edits, expandCtx(req)));
          if (rule.label) fired.add(rule.label);
          result.fixtureHits.push({ request: label, by: rule.source });
          return fulfill(rule.status ?? p.responseStatusCode, jsonHeaders, Buffer.from(JSON.stringify(edited), 'utf8'));
        }
        return page.send('Fetch.continueRequest', id);
      }

      const rule = findRule(rules, req);
      if (rule && answersAlone(rule, method)) {
        const a = await answer(rule, req);
        if (rule.label) fired.add(rule.label);
        result.fixtureHits.push({ request: label, by: rule.source, status: a.status });
        return fulfill(a.status, jsonHeaders, a.buf);
      }

      if (isRead) {
        const replayed = mode === 'replay' || (mode === 'record' && opts.onlyMissing && store.has(account, method, apiPath, query));
        if (!replayed) return page.send('Fetch.continueRequest', id);
        const entry = store.get(account, method, apiPath, query);
        if (!entry) {
          result.unrecorded.push(label);
          fail('unrecorded', `${label} (as ${account}) is not in the freeze — record it with --record --only-missing`);
          return page.send('Fetch.failRequest', { ...id, errorReason: 'Failed' });
        }
        let body = entry.body;
        if (rule?.edits) {
          if (entry.encoding !== 'json') throw new CaptureError('fixture', `${label}: only a JSON answer can be edited`);
          body = applyEdits(body, await expandTemplate(rule.edits, expandCtx(req)));
          if (rule.label) fired.add(rule.label);
          result.fixtureHits.push({ request: label, by: rule.source });
        }
        const headers = [{ name: 'Content-Type', value: entry.contentType || 'application/octet-stream' }, { name: 'Cache-Control', value: 'no-store' }];
        return fulfill(rule?.status ?? entry.status, headers, entryBuffer(entry, body));
      }

      const allowed = writes.find((w) => w.method === method && pathMatches(w.path, apiPath));
      if (allowed) {
        result.writes.push({ method, path: apiPath, target: allowed.target });
        return page.send('Fetch.continueRequest', id);
      }
      fail('blocked-write', `${label} was stopped: a capture may not write (answer it with a fixture or a stub, or — live only — name it in "writes" on a sandbox object)`);
      return page.send('Fetch.failRequest', { ...id, errorReason: 'BlockedByClient' });
    };

    const patterns = [
      { urlPattern: `${origin}/api/*`, requestStage: 'Request' },
      { urlPattern: `${origin}/healthz*`, requestStage: 'Request' },
    ];
    if (mode !== 'replay') patterns.push({ urlPattern: `${origin}/api/*`, requestStage: 'Response' });
    await page.send('Fetch.enable', { patterns });
    page.on('Fetch.requestPaused', (p) => {
      const job = handle(p).catch((err) => {
        if (err instanceof CaptureError) fail(err.kind, err.message, err.detail);
        else if (!/Invalid InterceptionId|Session with given id not found|socket (is )?closed/i.test(err.message)) fail('tool', `request handler: ${err.message}`);
        page.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }).catch(() => {});
      });
      jobs.add(job);
      job.finally(() => jobs.delete(job));
    });

    /** The write guard, proven on purpose: a POST the tool itself fires must not get out. */
    const probeWriteGuard = async (clock) => {
      const before = result.failures.length;
      await page.evaluate(
        `(window.__pulseProbe = 'pending', fetch('/api/v1/__pulse-write-probe', { method: 'POST', headers: { 'X-CSRF': '1', 'Content-Type': 'application/json' }, body: '{}' }).then((r) => { window.__pulseProbe = 'answered ' + r.status; }, () => { window.__pulseProbe = 'stopped'; }), 0)`,
      );
      let out = 'pending';
      for (let i = 0; i < 60 && out === 'pending'; i++) {
        await clock.tick();
        out = await page.evaluate('window.__pulseProbe');
      }
      await Promise.all([...jobs]);
      const blocked = result.failures.slice(before).filter((f) => f.kind === 'blocked-write' && /__pulse-write-probe/.test(f.message));
      result.failures = result.failures.filter((f) => !blocked.includes(f));
      result.writeGuard = out === 'stopped' && blocked.length === 1 ? 'held' : `BROKEN (${out})`;
      if (result.writeGuard !== 'held') fail('write-guard', `a POST fired from the page was not stopped (${out})`);
    };

    return {
      finish: async () => {
        await Promise.all([...jobs]);
      },
      probeWriteGuard,
      usedFixture: () => result.fixtureHits.some((h) => h.by.startsWith('fixture')),
    };
  };
}

/** YYYY-MM-DD of an instant in the capture's time zone. */
function localDate(ms, timezone) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function mondayOf(ms, timezone) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date(ms));
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[day];
  return localDate(ms - back * 86400000, timezone);
}
/**
 * The instant a state's page clock starts at: its own `clock` (a frame drawn for a named day —
 * "Péntek, október 9." — is captured ON that day), else the recording instant. Null = real time.
 */
function clockOf(state, env) {
  if (env.clockKind === 'real') return null;
  return state.clock ? Date.parse(state.clock) : env.t0;
}

/**
 * A literal body may hold values that only exist at run time:
 *   `{$today}` `{$today:-1}` `{$monday}` in a string   local dates of the capture clock
 *   `{$body.field}` `{$path.3}` in a string            taken from the request being answered
 *   { "$from": { "path": "/api/v1/conversations", "pointer": "/conversations/[coach_client_id={$body.coach_client_id}]" } }
 *   { "$now": -720000 }                 ISO instant of the capture clock plus ms   ("as": "epoch" -> seconds)
 *   { "$today": -1 }                    local date of the capture clock plus days (YYYY-MM-DD)
 * and `{name}` placeholders in strings are ids, as in routes.
 */
async function expandTemplate(value, ctx) {
  if (Array.isArray(value)) return Promise.all(value.map((v) => expandTemplate(v, ctx)));
  if (value && typeof value === 'object') {
    if (value.$from) {
      const src = value.$from;
      const body = await ctx.read(ctx.fill(src.path));
      const got = src.pointer ? pointerGet(body, ctx.fill(src.pointer)) : body;
      if (got === undefined) throw new CaptureError('fixture', `$from ${src.path} has nothing at ${ctx.fill(src.pointer)}`);
      return structuredClone(got);
    }
    if (value.$now !== undefined) {
      const t = ctx.t0 + Number(value.$now);
      return value.as === 'epoch' ? Math.floor(t / 1000) : new Date(t).toISOString();
    }
    if (value.$today !== undefined) return localDate(ctx.t0 + Number(value.$today) * 86400000, ctx.timezone);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await expandTemplate(v, ctx);
    return out;
  }
  if (typeof value === 'string' && value.includes('{')) return ctx.fill(value);
  return value;
}

// ───────────────────────────────────────────────────────────────────────────── writes (R25)

/** The `writes` list of a state, checked against `.pulse/sandbox.json`. A list that is not sandboxed is refused. */
function allowedWrites(state, env, email, fill) {
  const list = state.writes || [];
  if (!list.length) return [];
  const sandbox = readJsonIf(path.join(pulseDir(), 'sandbox.json'));
  if (!sandbox) throw new CaptureError('writes', `${state.key} declares writes but .pulse/sandbox.json does not exist (run pulse-sandbox first)`);
  return list.map((w) => {
    if (!w.method || !w.path) throw new CaptureError('writes', `${state.key}: a write needs { method, path }`);
    if (/\/auth\//.test(w.path)) throw new CaptureError('writes', `${state.key}: an auth route can never be written from a capture (${w.path})`);
    const keys = [...w.path.matchAll(/\{([\w.:@-]+)\}/g)].map((m) => m[1]);
    const sandboxKeys = keys.filter((k) => sandbox.ids && sandbox.ids[k] !== undefined);
    const asWriteMember = email && sandbox.writeMember === email;
    if (!sandboxKeys.length && !asWriteMember) {
      throw new CaptureError('writes', `${state.key}: ${w.method} ${w.path} does not target a sandbox object ({key} of .pulse/sandbox.json) and the account is not the sandbox write member`);
    }
    const resolved = w.path.replace(/\{([\w.:@-]+)\}/g, (m, k) => (sandbox.ids && sandbox.ids[k] !== undefined ? sandbox.ids[k] : fill(m)));
    return { method: w.method, path: resolved, target: sandboxKeys.length ? sandboxKeys.join(',') : `account ${email}` };
  });
}

// ───────────────────────────────────────────────────────────────────────────── ids

/**
 * Surrogate ids change with every seed, so a route never carries one. A state names what it
 * needs (`{linkOfMember}`) and `resolve` in pulse-frames.json says where it comes from: a GET,
 * a list inside the answer, a row matched by field values, and the field to take.
 */
function makeIdResolver(env) {
  const cache = new Map();
  const fetchList = async (spec) => {
    const email = accountEmail(env.frames, spec.as);
    const cacheKey = `${email}|${spec.get}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, env.readApi(email, spec.get));
    return cache.get(cacheKey);
  };
  const lookup = (obj, pointer) => {
    if (!pointer) return obj;
    let cur = obj;
    for (const part of pointer.split('/').filter(Boolean)) cur = cur?.[part];
    return cur;
  };
  const matches = (row, where) =>
    Object.entries(where || {}).every(([k, v]) => {
      const have = lookup(row, k.includes('/') ? k : `/${k}`);
      if (v && typeof v === 'object' && v.re) return new RegExp(v.re, v.flags || '').test(String(have ?? ''));
      return have === v;
    });
  return async (state) => {
    const sandbox = readJsonIf(path.join(pulseDir(), 'sandbox.json'));
    const ids = { ...(sandbox?.ids || {}), ...(env.frames.doc.ids || {}), ...(state.ids || {}) };
    const needed = new Set();
    const scan = (v) => {
      if (typeof v === 'string') for (const m of v.matchAll(/\{([\w.:@-]+)\}/g)) needed.add(m[1]);
      else if (v && typeof v === 'object') Object.values(v).forEach(scan);
    };
    scan(state.route);
    scan(state.steps);
    scan(state.arrived);
    scan(state.opened);
    scan(state.expect);
    for (const key of needed) {
      if (ids[key] !== undefined) continue;
      const spec = env.frames.resolve[key];
      if (!spec) continue; // a sandbox key or a mistake — `fill` reports it where it is used
      const body = await fetchList(spec);
      const list = lookup(body, spec.list || '');
      if (!Array.isArray(list)) throw new CaptureError('ids', `{${key}}: ${spec.get} has no list at "${spec.list || '/'}"`);
      const row = list.find((r) => matches(r, spec.where));
      if (!row) throw new CaptureError('ids', `{${key}}: no row of ${spec.get} matches ${JSON.stringify(spec.where)}`);
      const value = lookup(row, spec.take.includes('/') ? spec.take : `/${spec.take}`);
      if (value === undefined || value === null) throw new CaptureError('ids', `{${key}}: the matched row of ${spec.get} has no "${spec.take}"`);
      ids[key] = String(value);
    }
    return ids;
  };
}

// ───────────────────────────────────────────────────────────────────────────── pictures (PNG, no dependency)

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decodes an 8-bit, non-interlaced PNG (what Chrome and the Figma export write) into RGBA. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8) throw new Error(`PNG bit depth ${data[8]} is not supported (8 only)`);
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`PNG colour type ${colorType} is not supported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 255;
    }
    prev = out;
  }
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    if (colorType === 6) {
      data[o] = px[i * 4]; data[o + 1] = px[i * 4 + 1]; data[o + 2] = px[i * 4 + 2]; data[o + 3] = px[i * 4 + 3];
    } else if (colorType === 2) {
      data[o] = px[i * 3]; data[o + 1] = px[i * 3 + 1]; data[o + 2] = px[i * 3 + 2]; data[o + 3] = 255;
    } else if (colorType === 0) {
      data[o] = data[o + 1] = data[o + 2] = px[i]; data[o + 3] = 255;
    } else if (colorType === 4) {
      data[o] = data[o + 1] = data[o + 2] = px[i * 2]; data[o + 3] = px[i * 2 + 1];
    } else {
      const k = px[i];
      data[o] = palette[k * 3]; data[o + 1] = palette[k * 3 + 1]; data[o + 2] = palette[k * 3 + 2];
      data[o + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

const canvas = (width, height, rgba = [11, 13, 10, 255]) => {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
  }
  return { width, height, data };
};
/** Copies `src` (or the rectangle sx, sy, sw, sh of it) onto `dst` at dx, dy. Out-of-range parts are skipped. */
function paste(dst, src, dx, dy, sx = 0, sy = 0, sw = src.width, sh = src.height) {
  const w = Math.min(sw, src.width - sx, dst.width - dx);
  const h = Math.min(sh, src.height - sy, dst.height - dy);
  for (let y = 0; y < h; y++) {
    if (dy + y < 0) continue;
    src.data.copy(dst.data, ((dy + y) * dst.width + dx) * 4, ((sy + y) * src.width + sx) * 4, ((sy + y) * src.width + sx + w) * 4);
  }
}
function fillRect(img, x, y, w, h, rgba) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.width, Math.round(x + w));
  const y1 = Math.min(img.height, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const o = (yy * img.width + xx) * 4;
      img.data[o] = rgba[0]; img.data[o + 1] = rgba[1]; img.data[o + 2] = rgba[2]; img.data[o + 3] = rgba[3] ?? 255;
    }
  }
}
/** Area-average downscale by a whole factor (2 -> half size). */
function shrink(img, factor) {
  if (factor <= 1) return img;
  const width = Math.floor(img.width / factor);
  const height = Math.floor(img.height / factor);
  const data = Buffer.alloc(width * height * 4);
  const n = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = 0; yy < factor; yy++) {
        let o = ((y * factor + yy) * img.width + x * factor) * 4;
        for (let xx = 0; xx < factor; xx++, o += 4) {
          r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; a += img.data[o + 3];
        }
      }
      const o = (y * width + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = a / n;
    }
  }
  return { width, height, data };
}

/**
 * The difference of two pictures of the same width: per pixel, the largest channel difference.
 * Returns the picture of it (amplified so a 1-level change is visible), how many pixels differ
 * by more than `threshold`, and the box that holds them.
 */
export function diffPictures(a, b, { threshold = 0 } = {}) {
  const width = Math.min(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const out = canvas(width, height, [0, 0, 0, 255]);
  let changed = 0;
  let max = 0;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const inA = y < a.height;
    const inB = y < b.height;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let d;
      if (inA && inB) {
        const oa = (y * a.width + x) * 4;
        const ob = (y * b.width + x) * 4;
        d = Math.max(Math.abs(a.data[oa] - b.data[ob]), Math.abs(a.data[oa + 1] - b.data[ob + 1]), Math.abs(a.data[oa + 2] - b.data[ob + 2]));
      } else d = 255; // one picture is taller: the rest differs by definition
      if (d > threshold) {
        changed++;
        if (d > max) max = d;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const v = Math.min(255, d * 4);
      out.data[o] = v; out.data[o + 1] = v; out.data[o + 2] = inA && inB ? v : 80;
    }
  }
  return { picture: out, changed, total: width * height, max, box: changed ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

/** `--compare a.png b.png`: are two captures the same pixels, and if not, where do they differ. */
export function comparePngFiles(fileA, fileB, outFile = null) {
  const bufA = fs.readFileSync(fileA);
  const bufB = fs.readFileSync(fileB);
  if (bufA.equals(bufB)) return { identical: true, bytes: true };
  const a = decodePng(bufA);
  const b = decodePng(bufB);
  if (a.width === b.width && a.height === b.height && a.data.equals(b.data)) return { identical: true, bytes: false };
  const d = diffPictures(a, b);
  if (outFile) fs.writeFileSync(outFile, encodePng(d.picture));
  return { identical: false, sizeA: [a.width, a.height], sizeB: [b.width, b.height], changedPixels: d.changed, share: d.changed / d.total, maxChannelDelta: d.max, box: d.box, diff: outFile };
}

// ───────────────────────────────────────────────────────────────────────────── probes (5.1 row 4)

/**
 * Everything a probe reads from the page, in one script. It returns facts; the verdicts are
 * decided in Node (`judgeProbes`), so a rule can change without touching what is measured.
 */
const PAGE_PROBES = String.raw`
(() => {
  const P = window.__pulse;
  const rgba = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : null);
  const resolveColor = (value) => {
    const el = document.createElement('i');
    el.style.cssText = 'position:fixed;visibility:hidden;color:' + value;
    document.documentElement.appendChild(el);
    const c = rgba(getComputedStyle(el).color);
    el.remove();
    return c;
  };
  const root = getComputedStyle(document.documentElement);
  const token = (name) => root.getPropertyValue(name).trim();
  const firstFamily = (ff) => (ff || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  const box = (r) => ({ x: +(r.left + scrollX).toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
  const kitOf = (el) => { const k = el.closest('[data-kit]'); return k ? k.getAttribute('data-kit') : null; };
  const label = (el) => {
    const name = el.getAttribute('aria-label') || P.norm(el.textContent || '').slice(0, 40);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (name ? ' "' + name + '"' : '');
  };
  const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('[data-pulse-shot]'));
  const shown = all.filter((el) => P.visible(el));

  /* ── fonts */
  const used = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!P.norm(n.nodeValue)) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript,template') || !P.visible(el)) continue;
    textNodes.push(n);
    const fam = firstFamily(getComputedStyle(el).fontFamily);
    used.set(fam, (used.get(fam) || 0) + 1);
  }
  const fonts = {
    status: document.fonts.status,
    tokens: { display: firstFamily(token('--font-display')), sans: firstFamily(token('--font-sans') || token('--font-body')), mono: firstFamily(token('--font-mono')) },
    // a web face counts as loaded when one of its faces is; a face the page does not declare is a system font
    used: [...used].map(([family, count]) => {
      const declared = [...document.fonts].filter((f) => f.family.replace(/^["']|["']$/g, '') === family);
      return { family, count, declared: declared.length > 0, loaded: declared.length ? declared.some((f) => f.status === 'loaded') : document.fonts.check('16px "' + family + '"') };
    }),
    faces: [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), weight: f.weight, status: f.status })).filter((f) => f.status === 'loaded'),
    numerals: shown.filter((el) => /^(numeral|statBlock|fraction)$/i.test(el.getAttribute('data-kit') || '')).map((el) => ({ kit: el.getAttribute('data-kit'), family: firstFamily(getComputedStyle(el).fontFamily), text: P.norm(el.textContent).slice(0, 20) })),
  };

  /* ── the one lime pill: a button or a link with the accent background, at least 44 tall */
  const accent = resolveColor('var(--accent)');
  const canvasColor = resolveColor('var(--surface-0)') || rgba(getComputedStyle(document.body).backgroundColor);
  const same = (a, b) => a && b && Math.abs(a.r - b.r) < 2 && Math.abs(a.g - b.g) < 2 && Math.abs(a.b - b.b) < 2;
  const pills = shown.filter((el) => {
    if (!el.matches('button, a[href], [role="button"], [role="link"]')) return false;
    if (el.getAttribute('role') === 'switch') return false;
    const cs = getComputedStyle(el);
    const bg = rgba(cs.backgroundColor);
    return bg && bg.a > 0.5 && same(bg, accent) && el.getBoundingClientRect().height >= 44;
  }).map((el) => ({ what: label(el), ...box(el.getBoundingClientRect()) }));

  /* ── boxed surfaces: a visible fill AND a shape (radius or border), outside the allow-list */
  const boxed = [];
  for (const el of shown) {
    if (el === document.body) continue;
    const cs = getComputedStyle(el);
    const bg = rgba(cs.backgroundColor);
    const filled = (bg && bg.a > 0.02 && !same(bg, canvasColor)) || (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^url\(/.test(cs.backgroundImage));
    const border = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs['border' + s + 'Width']) > 0 && (rgba(cs['border' + s + 'Color']) || { a: 0 }).a > 0.02).length;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) continue;
    if (!(filled && (radius > 0 || border >= 3)) && !(border === 4 && radius > 0)) continue;
    boxed.push({ what: label(el), kit: kitOf(el), bg: hex(bg), alpha: bg ? bg.a : 0, radius, border, ...box(r) });
  }

  /* ── horizontal overflow */
  const vw = window.innerWidth;
  const scrollsX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const overflow = {
    viewport: vw,
    scrollWidth: document.documentElement.scrollWidth,
    // a 1 px box is a screen-reader-only node, not content that hangs out of the screen
    past: shown.filter((el) => { const r = el.getBoundingClientRect(); return (r.right > vw + 0.5 || r.left < -0.5) && r.width > 2 && r.height > 2 && !scrollsX(el) && getComputedStyle(el).position !== 'fixed'; }).slice(0, 12).map((el) => ({ what: label(el), ...box(el.getBoundingClientRect()) })),
  };

  /* ── targets: what a thumb can hit must be 44 x 44 */
  const chipRowShown = shown.some((el) => /^(chipRow|segSwitch)$/.test(el.getAttribute('data-kit') || ''));
  const targets = [];
  for (const el of shown) {
    if (!el.matches('a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"]')) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    let r = el.getBoundingClientRect();
    if ((r.width <= 2 || r.height <= 2) && el.labels && el.labels[0]) r = el.labels[0].getBoundingClientRect(); // a visually hidden input: its label is the target
    if (r.width >= 43.5 && r.height >= 43.5) continue;
    const region = !!el.closest('svg') && (el.getAttribute('role') === 'button' || el.tagName.toLowerCase() !== 'a');
    const inline = getComputedStyle(el).display === 'inline' && el.tagName.toLowerCase() === 'a';
    targets.push({ what: label(el), kit: kitOf(el), exempt: region ? (chipRowShown ? 'muscle region (a chip row is on screen)' : 'muscle region') : null, inlineLink: inline, ...box(r) });
  }

  /* ── animations still running (read BEFORE the loops are held for the picture) */
  const loops = document.getAnimations().filter((a) => {
    if (a.playState !== 'running') return false;
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return t && !Number.isFinite(t.endTime);
  }).map((a) => ({ name: a.animationName || a.id || a.constructor.name, on: a.effect && a.effect.target ? label(a.effect.target) : '' }));

  /* ── boxes and text for the geometry comparison */
  const cv = document.createElement('canvas').getContext('2d');
  const lines = (rects) => {
    const out = [];
    for (const r of rects) {
      if (r.width <= 0 || r.height <= 0) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.top - r.top) < r.height / 2) { last.left = Math.min(last.left, r.left); last.right = Math.max(last.right, r.right); last.bottom = Math.max(last.bottom, r.bottom); last.top = Math.min(last.top, r.top); }
      else out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return out;
  };
  const textItem = (str, range, el) => {
    const ls = lines([...range.getClientRects()]);
    if (!ls.length) return null;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
    const left = Math.min(...ls.map((l) => l.left));
    const right = Math.max(...ls.map((l) => l.right));
    const top = ls[0].top;
    const bottom = ls[ls.length - 1].bottom;
    const glyphH = ls[0].bottom - ls[0].top;
    // the LINE box (what Figma calls the text box): the glyph area plus half the leading on each side
    const lead = lh ? (lh - glyphH) / 2 : 0;
    let ink = null;
    if (ls.length === 1) {
      try {
        cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        cv.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
        const shownStr = cs.textTransform === 'uppercase' ? str.toLocaleUpperCase('hu') : cs.textTransform === 'lowercase' ? str.toLocaleLowerCase('hu') : str;
        const m = cv.measureText(shownStr);
        const base = top + (glyphH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
        ink = { x: +(left - m.actualBoundingBoxLeft + scrollX).toFixed(2), y: +(base - m.actualBoundingBoxAscent + scrollY).toFixed(2), w: +(m.actualBoundingBoxLeft + m.actualBoundingBoxRight).toFixed(2), h: +(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent).toFixed(2) };
      } catch (e) { ink = null; }
    }
    const color = rgba(cs.color);
    return {
      t: str, x: +(left + scrollX).toFixed(2), y: +(top - lead + scrollY).toFixed(2), w: +(right - left).toFixed(2), h: +(bottom - top + 2 * lead).toFixed(2),
      lines: ls.length, lh, fs, ff: firstFamily(cs.fontFamily), fw: Number(cs.fontWeight) || cs.fontWeight, ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
      color: hex(color), alpha: color ? color.a : 1, upper: cs.textTransform === 'uppercase', ink, kit: kitOf(el),
    };
  };
  const texts = [];
  const range = document.createRange();
  for (const n of textNodes) {
    range.selectNodeContents(n);
    const item = textItem(P.norm(n.nodeValue), range, n.parentElement);
    if (item) texts.push(item);
  }
  // what a field shows (its value, else its placeholder) is text to the eye, but not a text node
  for (const el of shown) {
    if (!el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea')) continue;
    const str = P.norm(el.value || el.getAttribute('placeholder') || '');
    if (!str) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight);
    const single = el.tagName.toLowerCase() === 'input';
    const x = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const innerTop = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const innerH = r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const y = single ? innerTop + (innerH - lh) / 2 : innerTop;
    const color = rgba(el.value ? cs.color : getComputedStyle(el, '::placeholder').color);
    texts.push({
      t: str, x: +(x + scrollX).toFixed(2), y: +(y + scrollY).toFixed(2), w: +(r.width - (x - r.left)).toFixed(2), h: +lh.toFixed(2), lines: 1, lh, fs,
      ff: firstFamily(cs.fontFamily), fw: Number(cs.fontWeight) || cs.fontWeight, ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
      color: hex(color), alpha: color ? color.a : 1, upper: cs.textTransform === 'uppercase', ink: null, kit: kitOf(el), field: el.value ? 'value' : 'placeholder',
    });
  }
  // a string React wrote as several text nodes ("7 nap", " · ", "7 napos ciklus") is ONE text to the eye
  for (const el of shown) {
    const kids = [...el.childNodes];
    if (kids.length < 2 || !kids.some((k) => k.nodeType === 3 && P.norm(k.nodeValue))) continue;
    const str = P.norm(el.textContent || '');
    if (!str || str.length > 240) continue;
    range.selectNodeContents(el);
    const item = textItem(str, range, el);
    if (item) texts.push({ ...item, joined: true });
  }
  const boxes = [];
  for (const el of shown) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const kit = el.getAttribute('data-kit');
    const bg = rgba(cs.backgroundColor);
    const tag = el.tagName.toLowerCase();
    const visual = kit || (bg && bg.a > 0.02) || (cs.backgroundImage && cs.backgroundImage !== 'none') || /^(img|svg|canvas|video|input|textarea|select|button|a|nav|hr)$/.test(tag) || parseFloat(cs.borderTopLeftRadius) > 0;
    if (visual) boxes.push({ ...box(r), kit: kit || null, tag, bg: hex(bg), alpha: bg ? bg.a : 0 });
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs['border' + side + 'Width']);
      const c = rgba(cs['border' + side + 'Color']);
      if (!(w > 0) || !c || c.a <= 0.02 || cs['border' + side + 'Style'] === 'none') continue;
      const b = box(r);
      const edge = side === 'Top' ? { x: b.x, y: b.y, w: b.w, h: w } : side === 'Bottom' ? { x: b.x, y: b.y + b.h - w, w: b.w, h: w } : side === 'Left' ? { x: b.x, y: b.y, w, h: b.h } : { x: b.x + b.w - w, y: b.y, w, h: b.h };
      boxes.push({ ...edge, kit: null, tag: tag + ':border-' + side.toLowerCase(), bg: hex(c), alpha: c.a });
    }
  }
  return { fonts, accent: hex(accent), canvas: hex(canvasColor), pills, boxed, overflow, targets, loops, chipRowShown, texts, boxes, scrollHeight: document.documentElement.scrollHeight };
})()
`;

const DEFAULT_BOXED_ALLOW = ['btnPrimary', 'pill', 'uiSwitch', 'sheet', 'badgeCount', 'skel', 'segBar', 'progressBar', 'macroCol', 'stepper', 'toast', 'noticeLine', 'monogramMark', 'pic', 'tabBar'];

/** The verdict of each probe. `pass: null` = not applicable to this capture. */
function judgeProbes(facts, state, env, extra) {
  const cfg = { ...(env.frames.defaults.probes || {}), ...(state.probes || {}) };
  const allow = new Set(cfg.boxedAllow || DEFAULT_BOXED_ALLOW);
  const out = {};
  const want = facts.fonts.tokens;
  const notLoaded = facts.fonts.used.filter((f) => !f.loaded && !/^(system-ui|sans-serif|serif|monospace|ui-|-apple-system|BlinkMacSystemFont)/i.test(f.family));
  const wrongNumerals = want.display ? facts.fonts.numerals.filter((n) => n.family !== want.display) : [];
  out.fonts = { pass: facts.fonts.status === 'loaded' && !notLoaded.length && !wrongNumerals.length, tokens: want, used: facts.fonts.used, notLoaded, wrongNumerals };
  out.pill = { pass: facts.pills.length <= 1, count: facts.pills.length, accent: facts.accent, pills: facts.pills };
  const boxed = facts.boxed.filter((b) => !b.kit || !allow.has(b.kit));
  out.boxed = { pass: boxed.length === 0, count: boxed.length, allowed: facts.boxed.length - boxed.length, surfaces: boxed.slice(0, 40) };
  out.overflow = { pass: facts.overflow.scrollWidth <= facts.overflow.viewport && !facts.overflow.past.length, ...facts.overflow };
  const small = facts.targets.filter((t) => !(t.exempt && facts.chipRowShown));
  out.targets = { pass: small.length === 0, count: small.length, exempted: facts.targets.length - small.length, small: small.slice(0, 40) };
  out.reducedMotion = env.opts.reducedMotion ? { pass: facts.loops.length === 0, runningLoops: facts.loops } : { pass: null, runningLoops: facts.loops.length };
  if (extra.mustSee) out.inView = extra.mustSee;
  if (extra.scrollEnd) out.scrollEnd = extra.scrollEnd;
  if (extra.focusWalk) out.focusWalk = extra.focusWalk;
  if (extra.geometry) out.geometry = { pass: extra.geometry.pass, ...extra.geometry.counts, file: extra.geometry.file };
  return out;
}

// ── geometry (R27): the rendered boxes against the boxes exported from Figma

/** Layer-name prefix -> `data-kit` (the table of .pulse/geometry/_README.md). */
const KIT_LAYERS = [
  [/^Button\/primary/, 'btnPrimary'], [/^Link\//, 'textLink'], [/^Button\/(icon|back)/, 'iconBtn'], [/^Badge\/count/, 'badgeCount'],
  [/^Chips$/, 'chipRow'], [/^Segmented$/, 'segSwitch'], [/^Switch\//, 'uiSwitch'], [/^Set check\//, 'setCheck'], [/^Image\//, 'pic'],
  [/^Field\//, 'inputField'], [/^Section\//, 'sect'], [/^Row\//, 'listRow'], [/^Ledger row\//, 'ledgerRow'], [/^Stat\//, 'statBlock'],
  [/^(Week bar|Segment bar|Stepper)$/, 'segBar'], [/^Macro\//, 'macroCol'], [/^Progress$/, 'progressBar'], [/^Sparkline$/, 'sparkline'],
  [/^Monogram\//, 'monogramMark'], [/^Empty state$/, 'emptyState'], [/^Skeleton$/, 'skel'], [/^Notice\//, 'noticeLine'], [/^Message\//, 'chatMsg'],
  [/^Tab bar$/, 'tabBar'], [/^Sheet\//, 'sheet'], [/^Toast$/, 'toast'],
];
const DEVICE_CHROME = /^(StatusBar|time|DynamicIsland|signal-wifi-battery|HomeIndicator)$/;
const FIGMA_WEIGHT = { thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const isNumeral = (t) => /Big Shoulders/i.test(t.fontFamily) && /^[\d\s.,:%+\-−–\/×x]+$/.test(t.characters);

export function geometryFile(frame) {
  for (const dir of [path.join(SCRIPTS_DIR, 'pulse-geometry'), path.join(pulseDir(), 'geometry')]) {
    const file = path.join(dir, `${frame}.json`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * Compares what the page rendered with one frame's geometry file.
 *
 *   text      matched by its string (case folded). Numerals in the display face: the INK box within
 *             3 pt. Other text: left edge, top and height of the line box within 2 pt (the right edge
 *             only when the text wraps — the README of the export explains why), and face, size,
 *             weight, case, tracking and colour exactly.
 *   kit layer `<Kind>/<label>` -> the nearest element carrying that `data-kit`, all four edges, 2 pt.
 *   shapes    a filled or stroked layer -> the nearest rendered box (an element or one of its borders).
 *   chrome    the status bar and the home indicator are not the app's: ignored.
 *
 * A layer with no counterpart is LISTED (`unmatched`), never forced onto something near it: it is
 * either sample data the recording does not hold or a defect, and a person has to say which.
 */
export function compareGeometry(geo, facts, { tolerance = 2, numeralTolerance = 3, masks = [] } = {}) {
  const byId = new Map(geo.nodes.map((n) => [n.id, n]));
  const chrome = new Set();
  for (const n of geo.nodes) if (DEVICE_CHROME.test(n.name) || chrome.has(n.parentId)) chrome.add(n.id);
  const kitRoots = new Map(); // node id -> kit name of the nearest kit layer above (or itself)
  for (const n of geo.nodes) {
    const own = KIT_LAYERS.find(([re]) => re.test(n.name))?.[1] || null;
    kitRoots.set(n.id, own ? { kit: own, root: n.id } : kitRoots.get(n.parentId) || null);
  }
  const masked = (b) => masks.some((m) => b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y);
  const dev = (a, b) => ({ dx: +(b.x - a.x).toFixed(1), dy: +(b.y - a.y).toFixed(1), dw: +(b.w - a.w).toFixed(1), dh: +(b.h - a.h).toFixed(1) });
  const worst = (d, keys = ['dx', 'dy', 'dw', 'dh']) => Math.max(...keys.map((k) => Math.abs(d[k])));
  const edges = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.x + a.w - b.x - b.w), Math.abs(a.y + a.h - b.y - b.h));
  const nearest = (list, target, score) => {
    let best = null;
    let bestScore = Infinity;
    for (const item of list) {
      const s = score(item, target);
      if (s < bestScore) {
        bestScore = s;
        best = item;
      }
    }
    return best ? { item: best, score: bestScore } : null;
  };

  const textsByFold = new Map();
  for (const t of facts.texts) {
    const k = foldName(t.t);
    if (!textsByFold.has(k)) textsByFold.set(k, []);
    textsByFold.get(k).push(t);
  }
  const report = { matched: [], deviating: [], unmatched: [], style: [], slot: [] };
  const counts = { layers: geo.nodes.length, chrome: 0, structural: 0, vectors: 0, clipped: 0, masked: 0, compared: 0 };

  for (const n of geo.nodes) {
    if (chrome.has(n.id)) { counts.chrome++; continue; }
    if (n.clippedOut) { counts.clipped++; continue; }
    if (n.type === 'VECTOR') { counts.vectors++; continue; }
    const fig = n.visibleBox || { x: n.x, y: n.y, w: n.w, h: n.h };
    if (masked(fig)) { counts.masked++; continue; }
    const where = { id: n.id, name: n.name, type: n.type, box: { x: n.x, y: n.y, w: n.w, h: n.h } };

    if (n.type === 'TEXT') {
      const t = n.text;
      if (!t || !String(t.characters).trim()) { counts.structural++; continue; }
      counts.compared++;
      const numeral = isNumeral(t) && t.ink;
      const figBox = numeral ? t.ink : { x: n.x, y: n.y, w: n.w, h: n.h };
      const domBox = (d) => (numeral && d.ink ? d.ink : d);
      const candidates = textsByFold.get(foldName(t.characters)) || [];
      let hit = nearest(candidates, figBox, (d, f) => Math.hypot(domBox(d).x - f.x, domBox(d).y - f.y));
      let slot = false;
      if (!hit) {
        // sample data: another string may stand in the same slot, set in the same size
        hit = nearest(facts.texts.filter((d) => Math.abs(d.fs - t.fontSize) < 0.6 && !d.joined), figBox, (d, f) => Math.hypot(domBox(d).x - f.x, domBox(d).y - f.y));
        if (hit && hit.score > tolerance) hit = null;
        slot = !!hit;
      }
      if (!hit) { report.unmatched.push({ ...where, text: t.characters }); continue; }
      const d = hit.item;
      const delta = dev(figBox, domBox(d));
      const keys = numeral ? ['dx', 'dy', 'dw', 'dh'] : slot ? ['dx', 'dy', 'dh'] : t.autoResize === 'HEIGHT' ? ['dx', 'dy', 'dw', 'dh'] : ['dx', 'dy', 'dh'];
      const limit = numeral ? numeralTolerance : tolerance;
      const entry = { ...where, text: t.characters, rendered: domBox(d), delta, measured: numeral ? 'ink' : 'line box', within: limit };
      if (slot) entry.renderedText = d.t;
      (worst(delta, keys) <= limit ? (slot ? report.slot : report.matched) : report.deviating).push(entry);
      // computed style, exactly
      const wrong = [];
      const family = d.ff.replace(/ Variable$/i, '');
      if (foldName(family) !== foldName(t.fontFamily)) wrong.push(`face ${d.ff} (frame: ${t.fontFamily})`);
      if (Math.abs(d.fs - t.fontSize) > 0.05) wrong.push(`size ${d.fs} (frame: ${t.fontSize})`);
      const weight = FIGMA_WEIGHT[String(t.fontStyle).toLowerCase().replace(/[\s-]|italic/g, '')];
      if (weight && Number(d.fw) !== weight) wrong.push(`weight ${d.fw} (frame: ${t.fontStyle} = ${weight})`);
      const looksUpper = (str, forced) => forced || (str === str.toLocaleUpperCase('hu') && str !== str.toLocaleLowerCase('hu'));
      if (!slot && looksUpper(t.characters, t.case === 'UPPER') !== looksUpper(d.t, d.upper)) wrong.push(`case ${d.upper ? 'uppercase' : 'as written'} (frame: ${t.case})`);
      if (Math.abs(d.ls - (t.letterSpacing || 0)) > 0.06) wrong.push(`tracking ${d.ls}px (frame: ${t.letterSpacing}px)`);
      if (t.lineHeightPx && d.lh && Math.abs(d.lh - t.lineHeightPx) > 0.05) wrong.push(`line height ${d.lh} (frame: ${t.lineHeightPx})`);
      if (t.color && d.color && (d.color.toLowerCase() !== t.color.toLowerCase() || Math.abs((d.alpha ?? 1) - (t.colorOpacity ?? 1)) > 0.02)) wrong.push(`colour ${d.color}${d.alpha < 1 ? ` @${d.alpha}` : ''} (frame: ${t.color}${t.colorOpacity < 1 ? ` @${t.colorOpacity}` : ''})`);
      if (wrong.length) report.style.push({ ...where, text: t.characters, renderedText: slot ? d.t : undefined, wrong });
      continue;
    }

    const kit = KIT_LAYERS.find(([re]) => re.test(n.name))?.[1] || null;
    const visual = n.fill || n.gradient || n.image || n.strokeWeight !== undefined || n.type !== 'FRAME' || /^glyph\//.test(n.name);
    if (!kit && !visual) { counts.structural++; continue; }
    counts.compared++;
    const pool = kit ? facts.boxes.filter((b) => b.kit === kit) : [];
    let hit = pool.length ? nearest(pool, fig, edges) : null;
    const viaKit = !!hit;
    if (!hit || hit.score > tolerance) {
      const any = nearest(facts.boxes, fig, edges);
      if (any && any.score <= tolerance) hit = any;
    }
    if (!hit) {
      // `inside`: the anatomy of a kit component (a knob, a dot, a mark) — judged on the kit board, listed here
      report.unmatched.push({ ...where, kit, inside: kitRoots.get(n.parentId)?.kit });
      continue;
    }
    const entry = { ...where, kit, rendered: { x: hit.item.x, y: hit.item.y, w: hit.item.w, h: hit.item.h, tag: hit.item.tag, kit: hit.item.kit }, delta: dev(fig, hit.item), within: tolerance };
    (hit.score <= tolerance ? report.matched : report.deviating).push(entry);
    void viaKit;
  }
  void byId;
  return {
    pass: report.deviating.length === 0 && report.style.length === 0,
    counts: { ...counts, matched: report.matched.length, sameSlotOtherString: report.slot.length, deviating: report.deviating.length, styleMismatches: report.style.length, unmatched: report.unmatched.length },
    ...report,
  };
}

// ── the focus walk (5.1 row 4): Tab through the state, every stop must SHOW that it has the focus

const FOCUS_SNAPSHOT = String.raw`
(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const sig = (n) => { const c = getComputedStyle(n); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderBottomColor, c.borderBottomWidth, c.backgroundColor, c.color, c.textDecorationLine].join('|'); };
  const chain = [];
  for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) chain.push(n);
  if (!el.__pulseId) el.__pulseId = 'f' + Math.random().toString(36).slice(2);
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    id: el.__pulseId,
    what: el.tagName.toLowerCase() + ' "' + (el.getAttribute('aria-label') || (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)) + '"',
    outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
    focusVisible: el.matches(':focus-visible'),
    sig: chain.map(sig),
    box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
  };
})()
`;
const BLURRED_SIGNATURE = String.raw`
((id) => {
  const el = [...document.querySelectorAll('*')].find((n) => n.__pulseId === id);
  if (!el) return null;
  const sig = (n) => { const c = getComputedStyle(n); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderBottomColor, c.borderBottomWidth, c.backgroundColor, c.color, c.textDecorationLine].join('|'); };
  const chain = [];
  for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) chain.push(n);
  return chain.map(sig);
})
`;
async function focusWalk(page, clock, limit = 80) {
  const stops = [];
  const seen = new Set();
  for (let i = 0; i < limit; i++) {
    await pressKey(page, 'Tab');
    await clock.nudge();
    const snap = await page.evaluate(FOCUS_SNAPSHOT);
    if (!snap) break;
    if (seen.has(snap.id)) break; // back at the first stop
    seen.add(snap.id);
    stops.push(snap);
  }
  // what each stop looks like WITHOUT the focus: the difference is the ring (or the underline, the tint…)
  await page.evaluate('document.activeElement && document.activeElement.blur()');
  await clock.nudge();
  const silent = [];
  for (const s of stops) {
    const rest = await page.evaluate(`${BLURRED_SIGNATURE.trim()}(${JSON.stringify(s.id)})`);
    const changed = !rest || s.sig.some((v, i) => v !== rest[i]);
    if (!s.outline && !changed) silent.push({ what: s.what, box: s.box });
  }
  return { pass: stops.length > 0 && silent.length === 0, stops: stops.length, withoutVisibleFocus: silent };
}

// ───────────────────────────────────────────────────────────────────────────── tiles, overview, contact sheet

const MASK_FILL = [58, 58, 58, 255];

/** A state's masks as rectangles in frame points: `{x,y,w,h}` as given, or the layers whose NAME matches a pattern. */
function maskRects(state, geo) {
  const out = [];
  for (const m of state.mask || []) {
    if (m && typeof m === 'object') out.push(m);
    else if (geo) {
      const re = new RegExp(m, 'i');
      for (const n of geo.nodes) {
        if (!re.test(n.name) || n.clippedOut) continue;
        const b = n.visibleBox || n;
        const x = Math.max(0, b.x);
        const y = Math.max(0, b.y);
        out.push({ x, y, w: Math.min(geo.frame.width, b.x + b.w) - x, h: Math.min(geo.frame.height, b.y + b.h) - y, layer: n.name });
      }
    }
  }
  return out.filter((r) => r.w > 0 && r.h > 0);
}

/**
 * The pair of one frame: tiles of at most 874 pt — frame | app | difference, left to right — so an
 * agent reads every tile at full size, plus one overview of the whole height. Masked areas are
 * painted the same flat grey in all three panels.
 */
export function writeTiles(fileBase, framePngFile, appPng, { scale = 2, masks = [] } = {}) {
  const frame = decodePng(fs.readFileSync(framePngFile));
  const app = decodePng(appPng);
  if (frame.width !== app.width) return { skipped: `the frame is ${frame.width} px wide, the capture ${app.width} px` };
  for (const pic of [frame, app]) for (const m of masks) fillRect(pic, m.x * scale, m.y * scale, m.w * scale, m.h * scale, MASK_FILL);
  const diff = diffPictures(frame, app, { threshold: 8 });
  const W = frame.width;
  const H = Math.max(frame.height, app.height);
  const gap = 12;
  const tilePx = 874 * scale;
  const tiles = [];
  for (let i = 0, y = 0; y < H; i++, y += tilePx) {
    const h = Math.min(tilePx, H - y);
    const tile = canvas(W * 3 + gap * 2, h, [40, 40, 40, 255]);
    if (y < frame.height) paste(tile, frame, 0, 0, 0, y, W, Math.min(h, frame.height - y));
    if (y < app.height) paste(tile, app, W + gap, 0, 0, y, W, Math.min(h, app.height - y));
    paste(tile, diff.picture, (W + gap) * 2, 0, 0, y, W, h);
    const file = `${fileBase}.tile-${i + 1}.png`;
    fs.writeFileSync(file, encodePng(tile));
    tiles.push(file);
  }
  const factor = Math.max(2, Math.ceil(H / 1700));
  const f = shrink(frame, factor);
  const a = shrink(app, factor);
  const d = shrink(diff.picture, factor);
  const over = canvas(f.width * 3 + gap * 2, Math.max(f.height, a.height, d.height), [40, 40, 40, 255]);
  paste(over, f, 0, 0);
  paste(over, a, f.width + gap, 0);
  paste(over, d, (f.width + gap) * 2, 0);
  const overview = `${fileBase}.overview.png`;
  fs.writeFileSync(overview, encodePng(over));
  return {
    tiles, overview, panels: 'frame | app | difference', heights: { frame: frame.height / scale, app: app.height / scale },
    difference: { pixelsOver8: diff.changed, share: +(diff.changed / diff.total).toFixed(4), box: diff.box ? { x: diff.box.x / scale, y: diff.box.y / scale, w: diff.box.w / scale, h: diff.box.h / scale } : null },
  };
}

/**
 * The contact sheet of a run: every capture as a thumbnail with its key, account and outcome, so
 * a person can check "is each sub-state really that sub-state" in one look. Drawn by the same
 * Chrome (it has the fonts for the captions); 30 captures per sheet.
 */
async function writeContactSheets(browser, outDir, results, suffix) {
  const items = results.filter((r) => r.files.png || r.files.failedPng);
  const sheets = [];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  for (let i = 0, n = 1; i < items.length; i += 30, n++) {
    const cells = items.slice(i, i + 30).map((r) => {
      const file = r.files.png || r.files.failedPng;
      const note = r.ok ? (r.verdictCap === 'matched' ? '' : r.verdictCap) : `FAILED: ${r.failures[0]?.kind}`;
      return `<figure class="${r.ok ? '' : 'bad'}"><div><img src="${pathToFileURL(file).href}"></div><figcaption><b>${esc(r.key)}</b> ${esc(r.account.split('@')[0])}<br>${esc(r.title || '')}<br><i>${esc(note)}</i></figcaption></figure>`;
    });
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:16px;background:#1b1b1b;color:#ddd;font:12px/1.35 system-ui,sans-serif;width:1348px;box-sizing:border-box}
      main{display:grid;grid-template-columns:repeat(6,201px);gap:20px 22px}
      figure{margin:0} figure div{width:201px;height:437px;overflow:hidden;background:#000;outline:1px solid #444}
      figure.bad div{outline:3px solid #ff5a4f} img{width:201px;display:block}
      figcaption{padding-top:6px;height:52px;overflow:hidden} b{color:#fff} i{color:#ffb84a;font-style:normal}
    </style><main>${cells.join('')}</main>`;
    const htmlFile = path.join(outDir, `_contact${suffix}-${n}.html`);
    fs.writeFileSync(htmlFile, html);
    const page = await openPage(browser, { width: 1348, height: 900 });
    try {
      await page.send('Page.enable');
      const loaded = new Promise((r) => page.on('Page.loadEventFired', r));
      await page.send('Page.navigate', { url: pathToFileURL(htmlFile).href });
      await Promise.race([loaded, sleep(15000)]);
      await page.evaluate('Promise.all([...document.images].map((i) => i.decode().catch(() => {})))');
      const size = await page.evaluate('({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })');
      const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 } });
      const file = path.join(outDir, `_contact${suffix}-${n}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      sheets.push(file);
    } finally {
      await page.close();
      fs.rmSync(htmlFile, { force: true });
    }
  }
  return sheets;
}

// ───────────────────────────────────────────────────────────────────────────── the inventory against the baseline (5.1 row 6)

/**
 * "No behaviour lost": the controls of a state against the controls the same state had before the
 * redesign. Compared as a multiset of role + name (case folded) + href + disabled; a control that
 * changed role or name shows up once as removed and once as added, and the package explains it.
 */
export function inventoryDiff(before, after) {
  const key = (c) => `${c.role}|${foldName(c.name)}|${c.href ?? ''}|${c.disabled ? 'disabled' : ''}`;
  const count = (list) => {
    const m = new Map();
    for (const c of list) m.set(key(c), [...(m.get(key(c)) || []), c]);
    return m;
  };
  const a = count(before);
  const b = count(after);
  const removed = [];
  const added = [];
  for (const [k, list] of a) for (let i = (b.get(k) || []).length; i < list.length; i++) removed.push(list[i]);
  for (const [k, list] of b) for (let i = (a.get(k) || []).length; i < list.length; i++) added.push(list[i]);
  const strip = (c) => ({ role: c.role, name: c.name, disabled: c.disabled, href: c.href });
  return { equal: !removed.length && !added.length, before: before.length, after: after.length, removed: removed.map(strip), added: added.map(strip) };
}

// ───────────────────────────────────────────────────────────────────────────── what a capture adds to a state (probes, pairs)

/** A control that must be fully inside the viewport and above the bottom bar (the player law, 5.2 row 8). */
async function probeMustSee(page, state, ctx, vp) {
  const tree = await axTree(page);
  const rectOf = async (node) => {
    try {
      const { quads } = await page.send('DOM.getContentQuads', { backendNodeId: node.backendId });
      const q = quads[0];
      if (!q) return null;
      const xs = [q[0], q[2], q[4], q[6]];
      const ys = [q[1], q[3], q[5], q[7]];
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    } catch {
      return null;
    }
  };
  let barTop = vp.height - vp.insets[1];
  for (const nav of tree.filter((n) => !n.ignored && n.role === 'navigation' && n.backendId)) {
    const r = await rectOf(nav);
    if (r && r.y > vp.height / 2) barTop = Math.min(barTop, r.y);
  }
  const controls = [];
  for (const target of state.mustSee) {
    const hits = axFind(tree, target, ctx);
    const node = hits[target.nth ?? 0];
    const r = node?.backendId ? await rectOf(node) : null;
    controls.push({ control: describeTarget(target, ctx), box: r, inside: !!r && r.y >= vp.insets[0] && r.y + r.h <= barTop && r.x >= 0 && r.x + r.w <= vp.width });
  }
  return { pass: controls.every((c) => c.inside), barTop, topInset: vp.insets[0], controls };
}

const SCROLL_END_PROBE = String.raw`
(() => {
  const fixed = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  // the lowest thing the page itself draws: any leaf element that is not part of a fixed layer
  let last = 0;
  let lowest = null;
  const range = document.createRange();
  for (const el of document.body.querySelectorAll('*')) {
    const ownText = [...el.childNodes].some((k) => k.nodeType === 3 && k.nodeValue.trim());
    if ((el.childElementCount && !ownText) || el.closest('[data-pulse-shot]')) continue;
    if (!window.__pulse.visible(el) || fixed(el)) continue;
    let r = el.getBoundingClientRect();
    if (r.height < 1 && ownText) { range.selectNodeContents(el); r = range.getBoundingClientRect(); } // display: contents
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom > last) { last = r.bottom; lowest = el.tagName.toLowerCase() + ' "' + (el.textContent || '').replace(/s+/g, ' ').trim().slice(0, 30) + '"'; }
  }
  let barTop = window.innerHeight;
  for (const nav of document.querySelectorAll('nav, [data-kit="tabBar"]')) {
    const r = nav.getBoundingClientRect();
    if (getComputedStyle(nav).position === 'fixed' && r.top > window.innerHeight / 2) barTop = Math.min(barTop, r.top);
  }
  return { lastContentBottom: +last.toFixed(1), lowest, barTop: +barTop.toFixed(1), atEnd: Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 2 };
})()
`;

/** Wires probes, the geometry comparison, tiles and the inventory diff into `captureState`. */
function installCaptureExtras(env) {
  const { opts } = env;
  const facts = new Map();
  env.beforeShot = async (page, state) => {
    if (opts.probes === false) return;
    facts.set(state.key, await page.evaluate(PAGE_PROBES, { timeout: 30000 }));
  };
  env.afterShot = async (page, net, state, { result, fail, fileBase, ctx, png, vp, clock }) => {
    result.title = state.title || null;
    // the inventory against the baseline of the same state
    const baselineDir = opts.baselineDir || path.join(pulseDir(), 'baseline');
    const baseFile = path.join(baselineDir, `${state.key}${env.suffix}.controls.json`);
    if (!opts.baseline && path.resolve(baselineDir) !== path.resolve(env.outDir) && fs.existsSync(baseFile)) {
      const d = inventoryDiff(readJson(baseFile).controls, readJson(result.files.controls).controls);
      writeJson(`${fileBase}.controls.diff.json`, { state: state.key, baseline: baseFile, ...d });
      result.files.controlsDiff = `${fileBase}.controls.diff.json`;
      result.inventory = { equal: d.equal, removed: d.removed.length, added: d.added.length };
    }
    const f = facts.get(state.key);
    if (!f) return;
    const extra = {};
    if (state.mustSee) extra.mustSee = await probeMustSee(page, state, ctx, vp);
    if (opts.scrollEnd) {
      const s = await page.evaluate(SCROLL_END_PROBE);
      extra.scrollEnd = { pass: s.atEnd && s.lastContentBottom <= s.barTop, ...s };
    }
    // geometry and the pair are only meaningful at the frame's own viewport
    const atFrameSize = state.frame && vp.width === 402 && vp.scale === 2 && !opts.scrollEnd && vp.insets[0] === 62;
    const geoFile = state.frame && opts.geometry !== false ? geometryFile(state.frame) : null;
    const geo = geoFile ? readJson(geoFile) : null;
    const masks = maskRects(state, geo);
    if (geo && atFrameSize) {
      const g = compareGeometry(geo, f, { masks });
      writeJson(`${fileBase}.geometry.json`, { state: state.key, frame: state.frame, source: geoFile, viewport: vp, tolerance: { boxes: 2, numerals: 3 }, masks, ...g });
      result.files.geometry = `${fileBase}.geometry.json`;
      extra.geometry = { pass: g.pass, counts: g.counts, file: `${fileBase}.geometry.json` };
    }
    const framePng = state.frame ? path.join(FRAME_PNG_DIR, `${state.frame}@2x.png`) : null;
    if (opts.tiles !== false && atFrameSize && framePng && fs.existsSync(framePng)) {
      const t = writeTiles(fileBase, framePng, png, { scale: vp.scale, masks });
      result.files.tiles = t.tiles;
      result.files.overview = t.overview;
      result.pair = { difference: t.difference, heights: t.heights, masks: masks.length, skipped: t.skipped };
    }
    if (opts.focusWalk) extra.focusWalk = await focusWalk(page, clock);
    const probes = judgeProbes(f, state, env, extra);
    const { texts, boxes, ...kept } = f;
    void texts;
    void boxes;
    writeJson(`${fileBase}.probe.json`, { state: state.key, viewport: vp, lang: result.lang, reducedMotion: !!opts.reducedMotion, probes, facts: { accent: kept.accent, canvas: kept.canvas, scrollHeight: kept.scrollHeight, chipRowShown: kept.chipRowShown } });
    result.files.probe = `${fileBase}.probe.json`;
    result.probes = Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, v.pass]));
    if (opts.strict) {
      for (const [name, v] of Object.entries(probes)) if (v.pass === false) fail('probe', `${name} probe failed (see ${path.basename(fileBase)}.probe.json)`);
      if (result.inventory && !result.inventory.equal) fail('inventory', `${result.inventory.removed} control(s) of the baseline are gone, ${result.inventory.added} new (see ${path.basename(fileBase)}.controls.diff.json)`);
    }
  };
}

// ───────────────────────────────────────────────────────────────────────────── a run

export function parseArgs(argv) {
  const opts = {
    mode: 'replay', states: [], all: false, pkg: null, base: null, serve: null, port: null, api: DEFAULT_API,
    out: null, width: undefined, height: undefined, scale: undefined, insets: undefined, scrollEnd: false,
    lang: null, reducedMotion: false, localStorage: null, account: undefined, onlyMissing: false,
    settleTimeout: 20000, quiet: 350, timezone: 'Europe/Budapest', i18nRoot: path.join(FRONTEND_DIR, 'src', 'i18n'),
    framesFile: FRAMES_FILE, failFast: false, json: false, list: false, help: false,
    rec: null, rerecord: false, clock: null, probeWrite: false, fixtures: true, smoke: false, baseline: false,
    probes: true, geometry: true, tiles: true, contact: true, focusWalk: false, strict: false, baselineDir: null,
  };
  const need = (i, flag) => {
    if (argv[i + 1] === undefined) throw new Error(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--replay': opts.mode = 'replay'; break;
      case '--live': opts.mode = 'live'; break;
      case '--record': opts.mode = 'record'; break;
      case '--only-missing': opts.onlyMissing = true; break;
      case '--rerecord': opts.rerecord = true; break;
      case '--rec': opts.rec = path.resolve(need(i, a)); i++; break;
      case '--clock': opts.clock = need(i, a); i++; break;
      case '--probe-write': opts.probeWrite = true; break;
      case '--no-fixtures': opts.fixtures = false; break;
      case '--smoke': opts.smoke = true; break;
      case '--baseline': opts.baseline = true; opts.tiles = false; opts.geometry = false; break;
      case '--inventory': break; // the inventory is always written; the flag is accepted for the plan's command lines
      case '--baseline-dir': opts.baselineDir = path.resolve(need(i, a)); i++; break;
      case '--no-probes': opts.probes = false; break;
      case '--no-geometry': opts.geometry = false; break;
      case '--no-tiles': opts.tiles = false; break;
      case '--no-contact': opts.contact = false; break;
      case '--focus-walk': opts.focusWalk = true; break;
      case '--strict': opts.strict = true; break;
      case '--all': case '--sweep': opts.all = true; break;
      case '--package': opts.pkg = need(i, a); i++; break;
      case '--overrides': opts.overrides = true; break;
      case '--base': opts.base = need(i, a).replace(/\/$/, ''); i++; break;
      case '--serve': opts.serve = path.resolve(need(i, a)); i++; break;
      case '--port': opts.port = Number(need(i, a)); i++; break;
      case '--api': opts.api = need(i, a).replace(/\/$/, ''); i++; break;
      case '--out': opts.out = path.resolve(need(i, a)); i++; break;
      case '--width': opts.width = Number(need(i, a)); i++; break;
      case '--height': opts.height = Number(need(i, a)); i++; break;
      case '--scale': opts.scale = Number(need(i, a)); i++; break;
      case '--insets': { const v = need(i, a); i++; opts.insets = v === '0' ? [0, 0] : v.split(',').map(Number); break; }
      case '--scroll-end': opts.scrollEnd = true; break;
      case '--lang': opts.lang = need(i, a); i++; break;
      case '--reduced-motion': opts.reducedMotion = true; break;
      case '--local-storage': opts.localStorage = JSON.parse(need(i, a)); i++; break;
      case '--account': opts.account = need(i, a); i++; break;
      case '--frames': opts.framesFile = path.resolve(need(i, a)); i++; break;
      case '--i18n-root': opts.i18nRoot = path.resolve(need(i, a)); i++; break;
      case '--settle-timeout': opts.settleTimeout = Number(need(i, a)); i++; break;
      case '--fail-fast': opts.failFast = true; break;
      case '--json': opts.json = true; break;
      case '--list': opts.list = true; break;
      case '--self-test': opts.selfTest = true; break;
      case '--compare': opts.compare = [path.resolve(need(i, a)), path.resolve(need(i + 1, a))]; i += 2; break;
      case '--diff-out': opts.diffOut = path.resolve(need(i, a)); i++; break;
      case '-h': case '--help': opts.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        opts.states.push(a);
    }
  }
  return opts;
}

const HELP = `pulse-shot — capture states of the built app in headless Chrome

  node scripts/pulse-shot.mjs <state…> | --all | --package <id>   [options]

Feed      --replay (default) | --live | --record [--only-missing | --rerecord]
          --rec <dir>                the freeze (default .pulse/rec)
          --clock virtual|shim|real  default: virtual when the feed is replay or record, real when live
          --no-fixtures              ignore the fixture of a state (its stubs still answer)
          --overrides                apply every package's frame overrides (states.json) to the frame states:
                                     the final sweep of the new build; never for the base build
          --probe-write              prove the write guard: a POST fired by the tool must be stopped
          --smoke                    only states with no click script and no fixture (the live smoke)
Where     --base <origin>            the app (default http://localhost:<port>)
          --serve <frontend dir>     start "vite preview" of that tree on --port for this run
          --port <5180-5189>         default 5180
          --api <origin>             the backend, for the login (default ${DEFAULT_API})
Viewport  --width 402|360|430|1280|1300  --height <pt>  --scale <n>  --insets 0 | <top>,<bottom>
          --scroll-end               402 x 874, scrolled to the end (tall frames)
Variants  --lang hu|en|de  --reduced-motion  --local-storage '<json>'  --account <letter|e-mail>
Output    --out <dir>                default .pulse/shots/<package | adhoc>;  --baseline = .pulse/baseline
          per state: <key>.png .controls.json .probe.json .geometry.json .tile-<n>.png .overview.png
                     .controls.diff.json (against --baseline-dir, default .pulse/baseline)
          per run:   _run.json, _contact-<n>.png
Probes    --focus-walk               Tab through the state: every stop must show the focus
          --strict                   a probe that does not pass, or an inventory that differs, fails the capture
          --no-probes --no-geometry --no-tiles --no-contact
Other     --frames <file>  --list  --fail-fast  --json
          --compare <a.png> <b.png> [--diff-out <png>]   are two captures the same pixels
          --self-test                the pinned clock proves its two controls (set, advance)
`;

function suffixOf(opts) {
  const bits = [];
  if (opts.width && opts.width !== 402) bits.push(`w${opts.width}`);
  if (opts.insets && opts.insets[0] === 0 && opts.insets[1] === 0) bits.push('i0');
  if (opts.scrollEnd) bits.push('end');
  if (opts.lang && opts.lang !== 'hu') bits.push(opts.lang);
  if (opts.reducedMotion) bits.push('rm');
  if (opts.mode === 'live') bits.push('live');
  return bits.length ? `.${bits.join('.')}` : '';
}

/**
 * Runs the captures of one invocation. Returns `{ results, outDir }`.
 * `hooks` lets a later section (replay, record, probes) add its behaviour without this function
 * knowing about it.
 */
/**
 * Which states an invocation means, and which accounts they need. Shared with pulse-verify, which
 * has to fetch the cookies BEFORE it takes a lock.
 */
export function planRun(opts) {
  const frames = loadFrames(opts.framesFile);
  if (opts.pkg) mergePackageStates(frames, opts.pkg);
  if (opts.overrides) mergeAllOverrides(frames, opts.pkg);
  let keys = opts.states.slice();
  if (opts.all) keys = Object.keys(frames.states).filter((k) => frames.states[k].frame);
  if (opts.pkg) keys.push(...Object.keys(frames.states).filter((k) => frames.states[k].package === opts.pkg && !keys.includes(k)));
  if (!keys.length) throw new Error('no state named (give state keys, --all or --package <id>)');
  for (const k of keys) if (!frames.states[k]) throw new Error(`unknown state "${k}" (see --list)`);
  if (opts.smoke) keys = keys.filter((k) => !(frames.states[k].steps || []).length && !frames.states[k].fixture);
  const emails = [...new Set(keys.map((k) => accountEmail(frames, opts.account ?? frames.states[k].account)).filter(Boolean))];
  return { frames, keys, emails };
}

/**
 * A package's own states: `docs/pipeline/pulse/pkg/<id>/states.json` =
 * `{ "states": { "<key>": { …a state… } }, "overrides": { "<frame key>": { …fields to replace… } } }`.
 * Extra states (loading, empty, error, a sheet) get the package's id; an override replaces fields
 * of a frame state for this package's runs only (a click script that differs on the new markup).
 */
function mergePackageStates(frames, pkg) {
  const file = path.join(REPO_DIR, 'docs', 'pipeline', 'pulse', 'pkg', pkg, 'states.json');
  if (!fs.existsSync(file)) return;
  const doc = readJson(file);
  for (const [key, st] of Object.entries(doc.states || {})) {
    if (frames.states[key]) throw new Error(`${path.relative(REPO_DIR, file)}: "${key}" is a frame state — change it under "overrides"`);
    frames.states[key] = { key, package: pkg, frame: null, ...st };
  }
  for (const [key, patch] of Object.entries(doc.overrides || {})) {
    if (!frames.states[key]) throw new Error(`${path.relative(REPO_DIR, file)}: override of unknown state "${key}"`);
    if (frames.states[key].package !== pkg) throw new Error(`${path.relative(REPO_DIR, file)}: "${key}" belongs to ${frames.states[key].package}, not to ${pkg}`);
    frames.states[key] = { ...frames.states[key], ...patch };
  }
}

/**
 * Every package's overrides of its own frame states, without the packages' extra states: what the
 * final sweep (PLAN 7.2 row 2) captures, since each frame is reached on the rebuilt markup only
 * through its package's override. The package named by --package was merged already.
 */
function mergeAllOverrides(frames, except) {
  const dir = path.join(REPO_DIR, 'docs', 'pipeline', 'pulse', 'pkg');
  if (!fs.existsSync(dir)) return;
  for (const pkg of fs.readdirSync(dir)) {
    if (pkg === except) continue;
    const file = path.join(dir, pkg, 'states.json');
    if (!fs.existsSync(file)) continue;
    const doc = readJson(file);
    for (const [key, patch] of Object.entries(doc.overrides || {})) {
      if (!frames.states[key]) throw new Error(`${path.relative(REPO_DIR, file)}: override of unknown state "${key}"`);
      if (frames.states[key].package !== pkg) throw new Error(`${path.relative(REPO_DIR, file)}: "${key}" belongs to ${frames.states[key].package}, not to ${pkg}`);
      frames.states[key] = { ...frames.states[key], ...patch };
    }
  }
}

export async function run(opts) {
  const { frames, keys } = planRun(opts);

  const mode = opts.mode;
  const outDir = opts.out || path.join(pulseDir(), opts.baseline ? 'baseline' : path.join('shots', opts.pkg || 'adhoc'));
  const port = opts.port || 5180;
  if (!opts.base) opts.base = `http://localhost:${port}`;

  // ── the freeze: where the recordings are, and the instant every pinned clock starts at
  const store = recStore(opts.rec || path.join(pulseDir(), 'rec'));
  let meta = store.meta();
  if (mode === 'replay' && !meta) {
    throw new Error(`there is no freeze in ${store.dir} — record one first (--record), or capture with --live`);
  }
  if (mode === 'record') {
    if (meta && !opts.onlyMissing && !opts.rerecord) {
      throw new Error(
        `a freeze already exists in ${store.dir} (instant ${meta.instant}). Use --only-missing to append the GETs it lacks; ` +
          '--rerecord overwrites entries, belongs to the integrator alone and invalidates the baseline',
      );
    }
    if (!meta || (opts.rerecord && opts.all)) {
      const instant = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
      meta = store.writeMeta({ schema: 1, instant, timezone: opts.timezone, startedAt: nowIso(), base: opts.base, api: opts.api, note: 'the page clock of every replay starts here' });
      console.log(`freeze: instant ${instant} -> ${store.dir}`);
    }
  }
  if (meta?.timezone) opts.timezone = meta.timezone;
  const clockKind = opts.clock || (mode === 'live' ? 'real' : 'virtual');
  if (!['virtual', 'shim', 'real'].includes(clockKind)) throw new Error('--clock takes virtual, shim or real');
  const t0 = clockKind === 'real' ? null : meta ? Date.parse(meta.instant) : Math.floor(Date.now() / 1000) * 1000;

  const writtenThisRun = new Set();
  const env = {
    opts, frames, outDir, store, clockKind, t0, suffix: suffixOf(opts),
    beforeShot: async () => {},
    afterShot: async () => {},
    /** Stores one live answer. Inside one run the first answer of a key wins; across runs only --rerecord overwrites. */
    record: (account, item, result) => {
      const file = store.fileOf(account, item.method, item.path, item.query);
      if (writtenThisRun.has(file)) return;
      if (fs.existsSync(file) && !opts.rerecord) return;
      store.put(account, item);
      writtenThisRun.add(file);
      if (result) result.recorded++;
    },
    /** A GET the TOOL needs (an id, a `$from` of a stub): the recording in a replay, the live API otherwise. */
    readApi: async (email, apiPath) => {
      const account = accountDir(email);
      const { path: p, query } = splitApiUrl(apiPath);
      if (mode === 'replay' || (mode === 'record' && opts.onlyMissing && store.has(account, 'GET', p, query))) {
        const entry = store.get(account, 'GET', p, query);
        if (!entry || entry.status !== 200 || entry.encoding !== 'json') {
          throw new CaptureError('unrecorded', `GET ${apiPath} (as ${account}) is not in the freeze — the tool needs it to resolve an id or a stub`);
        }
        return entry.body;
      }
      const r = await apiGet(email, apiPath, { api: opts.api });
      if (r.status !== 200) throw new CaptureError('ids', `GET ${apiPath} as ${email || 'nobody'} answered ${r.status}`);
      if (mode === 'record') {
        env.record(account, { method: 'GET', path: p, query, status: 200, contentType: 'application/json; charset=utf-8', buf: Buffer.from(r.text, 'utf8'), state: '(tool)' });
      }
      return r.body;
    },
  };
  env.resolveIds = makeIdResolver(env);
  env.installFeed = makeFeed(env);
  installCaptureExtras(env);

  // Cookies first: a wait for the login window must never happen while a server or a lock is held.
  if (mode !== 'replay') {
    const emails = [...new Set(keys.map((k) => accountEmail(frames, opts.account ?? frames.states[k].account)).filter(Boolean))];
    for (const email of emails) await getAccess(email, { api: opts.api });
  }

  let preview = null;
  let browser = null;
  let contact = [];
  let chrome = null;
  const results = [];
  try {
    if (opts.serve) preview = await startPreview(opts.serve, port);
    browser = await launchChrome();
    await warmUp(browser);
    for (const key of keys) {
      const started = Date.now();
      const r = await captureState(browser, frames.states[key], env);
      r.ms = Date.now() - started;
      results.push(r);
      if (!opts.json) {
        const extra = [];
        if (r.recorded) extra.push(`${r.recorded} recorded`);
        if (r.fixtureHits?.length) extra.push(`${r.fixtureHits.length} answered by fixture/stub`);
        if (r.writeGuard) extra.push(`write guard ${r.writeGuard}`);
        if (r.inventory) extra.push(r.inventory.equal ? 'inventory = baseline' : `inventory -${r.inventory.removed} +${r.inventory.added}`);
        const failedProbes = Object.entries(r.probes || {}).filter(([, v]) => v === false).map(([k]) => k);
        if (failedProbes.length) extra.push(`probes not passing: ${failedProbes.join(', ')}`);
        console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${key}${env.suffix}  ${r.png ? `${r.png.width}x${r.png.height}` : '-'}  ${r.controls ?? '-'} controls  ${r.ms} ms${extra.length ? `  [${extra.join(', ')}]` : ''}`);
        for (const f of r.failures) {
          console.log(`       ${f.kind}: ${f.message}`);
          const names = f.detail?.namesWithThatRole;
          if (names?.length) console.log(`         names with that role here: ${names.map((n) => JSON.stringify(n)).join(', ').slice(0, 900)}`);
        }
      }
      if (!r.ok && opts.failFast) break;
    }
    if (opts.contact !== false && results.length > 1) contact = await writeContactSheets(browser, outDir, results, env.suffix);
    chrome = browser.product;
  } finally {
    if (browser) await browser.close();
    if (preview) await preview.stop();
  }
  fs.mkdirSync(outDir, { recursive: true });
  const unrecorded = [...new Set(results.flatMap((r) => (r.unrecorded || []).map((u) => `${r.account}: ${u}`)))];
  writeJson(path.join(outDir, `_run${env.suffix}.json`), {
    tool: 'pulse-shot', mode, base: opts.base, chrome, clock: clockKind, instant: t0 ? new Date(t0).toISOString() : null,
    finishedAt: nowIso(), contact, unrecorded, results,
  });
  if (contact.length && !opts.json) console.log(`contact sheet: ${contact.join(', ')}`);
  if (unrecorded.length && !opts.json) {
    console.log(`unrecorded (${unrecorded.length}) — add them with: node scripts/pulse-shot.mjs ${keys.length > 6 ? '--all' : keys.join(' ')} --record --only-missing`);
    for (const u of unrecorded.slice(0, 40)) console.log(`  ${u}`);
  }
  return { results, outDir, contact, chrome };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return void console.log(HELP);
  if (opts.compare) {
    const r = comparePngFiles(opts.compare[0], opts.compare[1], opts.diffOut || null);
    console.log(JSON.stringify(r, null, 2));
    if (!r.identical) process.exitCode = 1;
    return;
  }
  if (opts.selfTest) {
    const port = opts.port || 5180;
    const base = opts.base || `http://localhost:${port}`;
    let preview = null;
    try {
      if (opts.serve) preview = await startPreview(opts.serve, port);
      const out = await selfTest(base);
      console.log(JSON.stringify(out, null, 2));
      if (!out.ok) process.exitCode = 1;
    } finally {
      if (preview) await preview.stop();
    }
    return;
  }
  if (opts.list) {
    const frames = loadFrames(opts.framesFile);
    for (const s of Object.values(frames.states)) console.log(`${s.key.padEnd(22)} ${String(s.account ?? '-').padEnd(3)} ${s.route}${s.reach ? `   [${s.reach}]` : ''}`);
    return;
  }
  const { results, outDir } = await run(opts);
  const failed = results.filter((r) => !r.ok);
  if (opts.json) console.log(JSON.stringify({ outDir, results }, null, 2));
  else console.log(`${results.length - failed.length} of ${results.length} captured -> ${outDir}`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((err) => {
    console.error(`pulse-shot: ${err.message}`);
    process.exitCode = 2;
  });
}

