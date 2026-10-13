#!/usr/bin/env node
// docs/pipeline/pulse/pkg/_int/proofs/F1.2/dormant-check.mjs — "installed, dormant" on the BUILT app.
//
// F1.2 (PLAN.md 3.3) adds three font families and claims that nothing changes on screen and nothing
// is downloaded, because no family token names them yet. This script proves both halves on
// `frontend/dist` — so it also proves the assumption of PLAN.md section 10 that a `url()` naming a
// file inside a Fontsource package is resolved by the bundler.
//
//   Leg 1 — the build output (no browser).
//     - each file `fonts.css` names is emitted to `dist/assets` under a hashed name, byte-identical
//       to the installed one, and the built stylesheet's `@font-face` rules point at those files;
//     - no bare package path is left in the built CSS (an unresolved `url()` would 404 at run time);
//     - outside its `@font-face` rules the built CSS never names the three families, and no built
//       script and no HTML does: nothing can ask for them.
//
//   Leg 2 — the built app, booted signed-out in headless Chrome (`--dump-dom`).
//     `dist` is served by a tiny static server (this file; no backend, no login — every `/api`
//     request is answered 404, which is what a signed-out visitor amounts to). The server logs each
//     request. Pass = the app mounted, at least one of TODAY's font files was fetched (so text was
//     really laid out and a font request is visible to the log), and NONE of the six new files was.
//
// Usage (after `npm run build` in frontend/; headless Chrome is heavy — take a heavy lock):
//   node docs/pipeline/pulse/pkg/_int/proofs/F1.2/dormant-check.mjs [--port 5189] [--path /login]
//        [--chrome "<path>"] [--static] [--json]
//
// Exit code 0 = dormant; 1 = not dormant; 2 = the check could not be run.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (args) => execFileSync('git', args, { cwd: HERE, encoding: 'utf8' }).trim();
const ROOT = git(['rev-parse', '--show-toplevel']);
const FRONTEND = path.join(ROOT, 'frontend');
const DIST = path.join(FRONTEND, 'dist');
const ASSETS = path.join(DIST, 'assets');
const FONTS_CSS = path.join(FRONTEND, 'src/ui/tokens/fonts.css');

const flags = process.argv.slice(2);
const flag = (name) => flags.includes(name);
const option = (name) => (flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined);
const PORT = Number(option('--port') ?? 5189);
const START_PATH = option('--path') ?? '/login';

const fail = (code, message) => {
  console.error(`dormant-check: ${message}`);
  process.exit(code);
};
if (!fs.existsSync(path.join(DIST, 'index.html'))) fail(2, `${DIST} holds no build — run npm run build in frontend/ first`);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const problems = [];

/* ── what fonts.css declares ─────────────────────────────────────────────────────────────────── */

const declared = [...stripComments(fs.readFileSync(FONTS_CSS, 'utf8')).matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
  const family = unquote(body.match(/font-family\s*:\s*([^;]+);/)[1]);
  const url = unquote(body.match(/url\(\s*([^)]+?)\s*\)/)[1]);
  const source = path.join(FRONTEND, 'node_modules', ...url.split('/'));
  return { family, url, stem: path.posix.basename(url).replace(/\.woff2$/, ''), source };
});
const families = [...new Set(declared.map((d) => d.family))];

/* ── leg 1: the build output ─────────────────────────────────────────────────────────────────── */

const assetNames = fs.readdirSync(ASSETS);
const builtCss = assetNames.filter((n) => n.endsWith('.css')).map((n) => ({ name: n, text: fs.readFileSync(path.join(ASSETS, n), 'utf8') }));
const allCss = builtCss.map((c) => c.text).join('\n');
const fontFaceBlocks = [...allCss.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
const cssOutsideFontFace = allCss.replace(/@font-face\s*\{[^}]*\}/g, '');

const emitted = declared.map((d) => {
  const escaped = d.stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = assetNames.filter((n) => new RegExp(`^${escaped}-[A-Za-z0-9_-]{8}\\.woff2$`).test(n));
  const file = matches[0] ?? null;
  const identical = Boolean(file) && fs.existsSync(d.source) && sha256(path.join(ASSETS, file)) === sha256(d.source);
  const referenced = Boolean(file) && fontFaceBlocks.some((block) => block.includes(d.family) && block.includes(file));
  if (matches.length !== 1) problems.push(`${d.url}: expected exactly one emitted file, found ${matches.length}`);
  else if (!identical) problems.push(`${file} is not byte-identical to the installed ${d.url}`);
  else if (!referenced) problems.push(`no @font-face rule of the built CSS loads ${file} for "${d.family}"`);
  return { family: d.family, declared: d.url, emitted: file, bytes: file ? fs.statSync(path.join(ASSETS, file)).size : null, identical, referenced };
});

const unresolved = (allCss.match(/url\(\s*['"]?@[^)]*\)/g) ?? []).length;
if (unresolved) problems.push(`${unresolved} url() of the built CSS still names a bare package path (it would 404 in a browser)`);

const namedOutside = (text) => families.filter((family) => text.includes(family));
const users = {
  cssOutsideFontFace: namedOutside(cssOutsideFontFace),
  scripts: assetNames.filter((n) => n.endsWith('.js')).filter((n) => namedOutside(fs.readFileSync(path.join(ASSETS, n), 'utf8')).length > 0),
  html: namedOutside(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')),
};
if (users.cssOutsideFontFace.length) problems.push(`the built CSS names ${users.cssOutsideFontFace.join(', ')} outside an @font-face rule — the face is NOT dormant`);
if (users.scripts.length) problems.push(`built scripts name a new family: ${users.scripts.join(', ')}`);
if (users.html.length) problems.push(`index.html names ${users.html.join(', ')}`);

/* ── leg 2: the built app, signed out, in headless Chrome ────────────────────────────────────── */

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

const portBusy = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

const findChrome = () =>
  [
    option('--chrome'),
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
    .filter(Boolean)
    .find((p) => fs.existsSync(p));

const bootSignedOut = async () => {
  const chrome = findChrome();
  if (!chrome) fail(2, 'no Chrome found — pass --chrome "<path>" or set CHROME_PATH');
  if (await portBusy(PORT)) fail(2, `port ${PORT} is in use — pass --port <free port>`);

  const requests = [];
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    requests.push(pathname);
    // No backend stands behind this server: a signed-out visitor is all the check needs.
    if (pathname.startsWith('/api/') || pathname === '/healthz' || pathname === '/readyz') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"not found","code":"NOT_FOUND"}');
      return;
    }
    const candidate = path.join(DIST, pathname);
    const inside = candidate.startsWith(DIST) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    if (!inside && path.extname(pathname)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const file = inside ? candidate : path.join(DIST, 'index.html'); // the SPA fallback
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dormant-check-'));
  let dom = '';
  try {
    dom = await new Promise((resolve, reject) => {
      const child = spawn(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        `--user-data-dir=${path.join(scratch, 'profile')}`,
        '--window-size=402,874',
        '--virtual-time-budget=15000',
        '--dump-dom',
        `http://127.0.0.1:${PORT}${START_PATH}`,
      ]);
      let out = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Chrome did not finish within 120 s'));
      }, 120_000);
      child.stdout.on('data', (chunk) => (out += chunk));
      child.on('error', reject);
      child.on('close', () => {
        clearTimeout(timer);
        resolve(out);
      });
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.error(`dormant-check: could not remove ${scratch} — remove it by hand`);
    }
  }

  const fontRequests = [...new Set(requests.filter((r) => /\.woff2?$/.test(r)))].map((r) => path.posix.basename(r));
  const newFiles = new Set(emitted.map((e) => e.emitted).filter(Boolean));
  const rootMarkup = dom.match(/<div id="root">([\s\S]*)/)?.[1] ?? '';
  return {
    url: `http://127.0.0.1:${PORT}${START_PATH}`,
    appMounted: /<(main|form|h1|button)\b/.test(rootMarkup),
    requests: requests.length,
    apiRequestsAnswered404: [...new Set(requests.filter((r) => r.startsWith('/api/')))],
    fontRequests,
    todaysFontsRequested: fontRequests.filter((f) => !newFiles.has(f)),
    newFontsRequested: fontRequests.filter((f) => newFiles.has(f)),
  };
};

const boot = flag('--static') ? null : await bootSignedOut();
if (boot) {
  if (!boot.appMounted) problems.push('the app did not mount (no markup under #root) — the run proves nothing about fonts');
  if (boot.todaysFontsRequested.length === 0) problems.push('no font file at all was requested — text was not laid out, so the run proves nothing');
  if (boot.newFontsRequested.length) problems.push(`the signed-out app fetched ${boot.newFontsRequested.join(', ')} — the new faces are NOT dormant`);
}

const result = {
  step: 'F1.2',
  what: 'the three Pulse faces are emitted by the build and dormant in the built app',
  checkedAt: new Date().toISOString(),
  onCommit: `${git(['rev-parse', '--short', 'HEAD'])} + the F1.2 working tree`,
  emitted,
  unresolvedUrls: unresolved,
  familiesNamedOutsideFontFace: users,
  boot,
  verdict: problems.length === 0 ? 'dormant' : 'NOT dormant',
  problems,
};

if (flag('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`dormant-check: ${emitted.filter((e) => e.identical && e.referenced).length} of ${emitted.length} declared file(s) emitted byte-identical and loaded by a built @font-face rule; ${unresolved} unresolved url()`);
  for (const e of emitted) console.log(`  ${e.emitted ?? '(missing)'}  ${e.bytes ?? '-'} bytes  <- ${e.declared}`);
  console.log(`dormant-check: families named outside @font-face — built CSS: ${users.cssOutsideFontFace.length}, built scripts: ${users.scripts.length}, index.html: ${users.html.length}`);
  if (boot) {
    console.log(`dormant-check: ${boot.url} signed out — app mounted: ${boot.appMounted}; ${boot.requests} request(s); /api answered 404: ${boot.apiRequestsAnswered404.join(', ') || 'none'}`);
    console.log(`dormant-check: fonts fetched — today's: ${boot.todaysFontsRequested.join(', ') || 'none'}; new: ${boot.newFontsRequested.join(', ') || 'NONE'}`);
  }
  for (const p of problems) console.error(`dormant-check: ${p}`);
  console.log(`dormant-check: ${result.verdict.toUpperCase()}`);
}
process.exit(problems.length === 0 ? 0 : 1);
