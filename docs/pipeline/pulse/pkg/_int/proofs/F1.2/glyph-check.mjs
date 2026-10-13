#!/usr/bin/env node
// docs/pipeline/pulse/pkg/_int/proofs/F1.2/glyph-check.mjs — the glyph and tabular-figure check of
// step F1.2 (PLAN.md 3.3, ruling R8).
//
// The three Pulse faces are installed two commits before anything visible depends on them. This
// script is what the type step (F1.4) is decided on: it shows, in the binaries and in a real
// browser, whether each face carries the Hungarian double-acute letters and whether it can set the
// ten digits on one advance.
//
// ═══ WHAT IT CHECKS ════════════════════════════════════════════════════════════════════════════
//
//   Leg A — the hand-written rules against the installed packages (no browser).
//     Every `@font-face` of `frontend/src/ui/tokens/fonts.css` names a file that exists in the
//     package, with the package's own family name, weight, style, format hint and — the one that
//     drifts silently — `unicode-range`. Only `latin` and `latin-ext` are declared; the display face
//     blocks, the other two swap. The six files are the whole font cost of a Hungarian session.
//
//   Leg B — what the binaries hold (no browser; `font-tables.mjs`).
//     `cmap` of each file for ő ű Ő Ű and 0-9, and whether `GSUB` has the `tnum` feature that
//     `tabular-nums` asks for. Recorded as the second, independent reading of leg C.
//
//   Leg C — the faces in headless Chrome, on a scratch page OUTSIDE `src` (`--dump-dom`).
//     The page carries the text of the stylesheet itself, with each `url()` swapped for a `data:`
//     URL of the installed file — so the rules under test are the shipped ones, not a copy.
//       1. `document.fonts.check` per face and weight: false before a load, true after it.
//       2. ő ű Ő Ű: the canvas width in the face against the width in the fallback alone
//          (equal = the glyph is missing and the browser fell back).
//       3. the ten digits under `font-variant-numeric: tabular-nums`: one advance.
//
// Two verdicts per face, kept apart because the plan gives them different continuations:
// GLYPHS (1 + 2 — nothing can stand in for a missing letter) and TABULAR FIGURES (3 — the plan's
// stand-in is fixed-width digit cells in `Numeral`, PLAN.md section 10).
//
// ═══ WHY TWO FALLBACKS ═════════════════════════════════════════════════════════════════════════
//
// "Differs from the fallback width" has a blind spot: a face whose glyph happens to be as wide as
// the fallback's reads as missing, and a face that never loaded reads as "tabular" whenever the
// fallback's own digits are (Times New Roman and Consolas both are). So every measurement is taken
// over TWO fallbacks of different widths (`serif`, `monospace`). A glyph that comes from the face
// measures the same over both; one that fell back measures as the fallback does, differently in
// each. A character outside every declared `unicode-range` (Ж) is measured too, as the negative
// control: it MUST read as missing, or the method proves nothing.
//
// ═══ USAGE (cwd anywhere inside a worktree of the repository) ══════════════════════════════════
//
//   node docs/pipeline/pulse/pkg/_int/proofs/F1.2/glyph-check.mjs            run, print the tables
//   node …/glyph-check.mjs --write                                            also write result.json
//   node …/glyph-check.mjs --static                                           legs A and B only (no browser)
//   node …/glyph-check.mjs --chrome "<path to chrome>"                        (or env CHROME_PATH)
//   node …/glyph-check.mjs --keep                                             keep the scratch page
//
// Checking a CANDIDATE display family without touching the shipped stylesheet (PLAN.md 3.3, "If the
// glyph check fails … replaced by its successor family … and checked again"):
//   node …/glyph-check.mjs --fonts-css <candidate.css> --display "<family>|<package>" \
//        --modules <a node_modules that holds the candidate package> [--write --out <result file>]
//
// Exit code 0 = every face passed both verdicts; 1 = something failed (the tables say what, and
// PLAN.md 3.3 / section 10 say what follows — nothing is improvised here); 2 = the check could not
// be run.
//
// Headless Chrome is a heavy process on the build machine: take a heavy lock around this script.
// No dependency, no network, no secret. Run it again after any upgrade of the three packages.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describeFont } from './font-tables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (args) => execFileSync('git', args, { cwd: HERE, encoding: 'utf8' }).trim();
const ROOT = git(['rev-parse', '--show-toplevel']);
const FRONTEND = path.join(ROOT, 'frontend');
const relative = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const flags = process.argv.slice(2);
const flag = (name) => flags.includes(name);
const option = (name) => (flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined);

const SHIPPED_CSS = path.join(FRONTEND, 'src/ui/tokens/fonts.css');
const FONTS_CSS = path.resolve(option('--fonts-css') ?? SHIPPED_CSS);
const SHEET = path.basename(FONTS_CSS);
// An extra package root is searched first; the faces that are not candidates still come from the app.
const MODULE_ROOTS = [option('--modules') && path.resolve(option('--modules')), path.join(FRONTEND, 'node_modules')].filter(Boolean);
const RESULT_PATH = path.resolve(option('--out') ?? path.join(HERE, 'result.json'));

/** The roster of ruling R8. If the display family is ever replaced, this list changes in the same
 *  commit as `fonts.css`. Weights are the ones the Pulse type ramp uses. */
const ROLES = [
  { role: 'display', family: 'Big Shoulders Display Variable', pkg: '@fontsource-variable/big-shoulders-display', weights: [700, 900], fontDisplay: 'block' },
  { role: 'text', family: 'Geist Variable', pkg: '@fontsource-variable/geist', weights: [400, 500, 600], fontDisplay: 'swap' },
  { role: 'mono', family: 'Geist Mono', pkg: '@fontsource/geist-mono', weights: [500], fontDisplay: 'swap' },
];
const candidate = option('--display');
if (candidate) {
  const [family, pkg] = candidate.split('|');
  if (!family || !pkg) {
    console.error('glyph-check: --display takes "<family>|<package>"');
    process.exit(2);
  }
  ROLES[0] = { ...ROLES[0], family, pkg };
}
const SUBSETS = ['latin', 'latin-ext'];
const HUNGARIAN = ['ő', 'ű', 'Ő', 'Ű'];
const DIGITS = '0123456789'.split('');
const NEGATIVE_CONTROL = 'Ж';
const SESSION_LIMIT_KB = 150;

const fail = (code, message) => {
  console.error(`glyph-check: ${message}`);
  process.exit(code);
};

/* ── CSS: the `@font-face` rules of a stylesheet ─────────────────────────────────────────────── */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const normalizeRange = (value) =>
  value
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .join(',');

/** @returns {{family:string, style:string, display:string, weight:string, range:string, sources:{url:string, format:string}[]}[]} */
const fontFaces = (css) =>
  [...stripComments(css).matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const declarations = Object.fromEntries(
      body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => [d.slice(0, d.indexOf(':')).trim().toLowerCase(), d.slice(d.indexOf(':') + 1).trim()]),
    );
    const sources = [...(declarations.src ?? '').matchAll(/url\(\s*([^)]+?)\s*\)\s*format\(\s*([^)]+?)\s*\)/g)].map(
      ([, url, format]) => ({ url: unquote(url), format: unquote(format) }),
    );
    return {
      family: unquote(declarations['font-family'] ?? ''),
      style: declarations['font-style'] ?? '',
      display: declarations['font-display'] ?? '',
      weight: (declarations['font-weight'] ?? '').replace(/\s+/g, ' '),
      range: normalizeRange(declarations['unicode-range'] ?? ''),
      sources,
    };
  });

/* ── leg A: the hand-written rules against the installed packages ───────────────────────────── */

const problems = [];
if (!fs.existsSync(FONTS_CSS)) fail(2, `${FONTS_CSS} does not exist`);
const fontsCssText = fs.readFileSync(FONTS_CSS, 'utf8');
const ours = fontFaces(fontsCssText);

const packageVersions = {};
const files = [];
/** url() text as written in the stylesheet -> absolute path of the installed file */
const installed = new Map();

for (const role of ROLES) {
  const pkgDir = MODULE_ROOTS.map((root) => path.join(root, ...role.pkg.split('/'))).find((dir) => fs.existsSync(path.join(dir, 'package.json')));
  if (!pkgDir) fail(2, `${role.pkg} is not installed (looked in ${MODULE_ROOTS.join(', ')}) — run npm ci in frontend/ first`);
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  packageVersions[role.pkg] = { version: pkgJson.version, license: pkgJson.license };

  // Every rule the package ships, from every stylesheet at its root, keyed by the file it loads.
  const shipped = new Map();
  for (const name of fs.readdirSync(pkgDir).filter((f) => f.endsWith('.css'))) {
    for (const rule of fontFaces(fs.readFileSync(path.join(pkgDir, name), 'utf8'))) {
      for (const source of rule.sources) {
        const base = path.posix.basename(source.url);
        shipped.set(base, [...(shipped.get(base) ?? []), { ...rule, format: source.format, sheet: name }]);
      }
    }
  }

  const mine = ours.filter((rule) => rule.family === role.family);
  const declaredSubsets = [];
  for (const rule of mine) {
    const where = `${SHEET}, ${role.family}`;
    if (rule.sources.length !== 1) {
      problems.push(`${where}: a rule must name exactly one file, found ${rule.sources.length}`);
      continue;
    }
    const [{ url, format }] = rule.sources;
    const prefix = `${role.pkg}/files/`;
    if (!url.startsWith(prefix)) {
      problems.push(`${where}: url('${url}') is not a path inside ${role.pkg}/files/`);
      continue;
    }
    const base = url.slice(prefix.length);
    const absolute = path.join(pkgDir, 'files', base);
    if (!fs.existsSync(absolute)) {
      problems.push(`${where}: ${url} does not exist in the installed package`);
      continue;
    }
    installed.set(url, absolute);
    const subset = SUBSETS.find((s) => base.includes(`-${s}-`) && !(s === 'latin' && base.includes('-latin-ext-')));
    if (!subset) problems.push(`${where}: ${base} is neither the latin nor the latin-ext file`);
    else declaredSubsets.push(subset);

    const theirs = (shipped.get(base) ?? []).filter((r) => r.format === format);
    const agree = (pick, among = theirs) => among.length > 0 && among.every((r) => pick(r) === pick(rule));
    // A static package also ships single-subset sheets (`latin-500.css`) that load the same file
    // with NO range — "use this subset for everything". They say nothing about what the file
    // holds; the range is compared with the sheets that declare one (`500.css`, `index.css`).
    const ranged = theirs.filter((r) => r.range !== '');
    const row = {
      role: role.role,
      family: role.family,
      subset: subset ?? '?',
      file: `${role.pkg}/files/${base}`,
      absolute,
      bytes: fs.statSync(absolute).size,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
      fontDisplay: rule.display,
      packageRules: theirs.length,
      familyEqualsPackage: agree((r) => r.family),
      weightEqualsPackage: agree((r) => r.weight),
      styleEqualsPackage: agree((r) => r.style),
      unicodeRangeEqualsPackage: agree((r) => r.range, ranged),
    };
    files.push(row);
    if (theirs.length === 0) problems.push(`${where}: no rule of ${role.pkg} loads ${base} as format('${format}')`);
    for (const key of ['familyEqualsPackage', 'weightEqualsPackage', 'styleEqualsPackage', 'unicodeRangeEqualsPackage']) {
      if (theirs.length > 0 && !row[key]) problems.push(`${where} (${subset}): ${key.replace('EqualsPackage', '')} differs from the package's rule for ${base}`);
    }
    if (rule.display !== role.fontDisplay) {
      problems.push(`${where} (${subset}): font-display is "${rule.display}", ruling R8 says "${role.fontDisplay}" for the ${role.role} face`);
    }
  }
  if ([...declaredSubsets].sort().join(' ') !== [...SUBSETS].sort().join(' ')) {
    problems.push(`${SHEET}, ${role.family}: declares subsets "${declaredSubsets.join(' ')}", expected exactly "${SUBSETS.join(' ')}"`);
  }
}
const strangers = ours.filter((rule) => !ROLES.some((role) => role.family === rule.family));
if (strangers.length) problems.push(`${SHEET} declares a family outside the roster: ${[...new Set(strangers.map((r) => r.family))].join(', ')}`);

const sessionBytes = files.reduce((sum, f) => sum + f.bytes, 0);
const hungarianSession = {
  note: 'worst case: every declared file of every face (a Hungarian screen needs latin and latin-ext of each face it shows)',
  files: files.length,
  bytes: sessionBytes,
  kB: Math.round(sessionBytes / 100) / 10,
  KiB: Math.round((sessionBytes / 1024) * 10) / 10,
  limitKB: SESSION_LIMIT_KB,
  within: sessionBytes <= SESSION_LIMIT_KB * 1000,
};

const staticOk = problems.length === 0;

/* ── leg B: what the binaries hold ───────────────────────────────────────────────────────────── */

const codePoints = [...HUNGARIAN, ...DIGITS].map((c) => c.codePointAt(0));
for (const file of files) {
  const described = describeFont(file.absolute, codePoints);
  file.axes = described.axes.map((a) => `${a.tag} ${a.min}..${a.max}`);
  file.gsubFeatures = described.gsubFeatures;
  file.mapsHungarian = HUNGARIAN.every((c) => described.mapped[c]);
  file.mapsDigits = DIGITS.every((c) => described.mapped[c]);
  delete file.absolute;
}
/** Per family: the letters live in `latin-ext`, the figures and their features in `latin`. */
const binaryOf = (family) => {
  const mine = files.filter((f) => f.family === family);
  const latin = mine.find((f) => f.subset === 'latin');
  return {
    hungarianInCmap: mine.some((f) => f.mapsHungarian),
    digitsInCmap: mine.some((f) => f.mapsDigits),
    tnumFeature: Boolean(latin?.gsubFeatures.includes('tnum')),
    gsubOfLatinFile: latin?.gsubFeatures ?? [],
  };
};

/* ── leg C: the faces in headless Chrome ─────────────────────────────────────────────────────── */

const findChrome = () => {
  const candidates = [
    option('--chrome'),
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
};

/** Runs in the page. Measures only — every judgement is made in Node, from the numbers. */
const pageScript = async (SPEC) => {
  const out = { userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, faces: [] };
  try {
    const SIZE = SPEC.size;
    const quote = (family) => `"${family}"`;
    const plain = (s) => String(s).replace(/^["']|["']$/g, '');
    const fontOf = (weight, family) => `${weight} ${SIZE}px ${quote(family)}`;
    const sample = SPEC.hungarian.join('') + SPEC.digits.join('');
    const statuses = () =>
      [...document.fonts].map((f) => ({ family: plain(f.family), weight: f.weight, range: f.unicodeRange.split(',')[0].trim(), status: f.status }));

    out.declaredFaces = document.fonts.size;
    out.statusBeforeUse = statuses();
    const checkBefore = {};
    for (const face of SPEC.faces) for (const weight of face.weights) checkBefore[`${face.family}|${weight}`] = document.fonts.check(fontOf(weight, face.family), sample);
    for (const face of SPEC.faces) for (const weight of face.weights) await document.fonts.load(fontOf(weight, face.family), sample);
    out.statusAfterLoad = statuses();

    const context = document.createElement('canvas').getContext('2d');
    const canvasWidth = (font, text) => {
      context.font = font;
      return context.measureText(text).width;
    };
    const glyph = (family, weight, character) => {
      const row = {};
      for (const fallback of SPEC.fallbacks) {
        row[`face+${fallback}`] = canvasWidth(`${fontOf(weight, family)}, ${fallback}`, character);
        row[`${fallback} alone`] = canvasWidth(`${weight} ${SIZE}px ${fallback}`, character);
      }
      return row;
    };
    // Digits are measured in the DOM: a canvas `font` shorthand cannot carry `font-variant-numeric`,
    // and the DOM property is the one the `tabular-nums` utility sets.
    const domWidths = (familyList, weight, numeric, texts) => {
      const host = document.createElement('div');
      host.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;line-height:1;font-size:${SIZE}px;font-kerning:auto`;
      host.style.fontFamily = familyList;
      host.style.fontWeight = String(weight);
      host.style.fontVariantNumeric = numeric;
      const cells = texts.map((text) => {
        const cell = document.createElement('span');
        cell.style.display = 'inline-block';
        cell.textContent = text;
        host.appendChild(cell);
        return cell;
      });
      document.body.appendChild(host);
      const widths = cells.map((cell) => cell.getBoundingClientRect().width);
      host.remove();
      return widths;
    };

    for (const face of SPEC.faces) {
      for (const weight of face.weights) {
        const entry = {
          role: face.role,
          family: face.family,
          weight,
          fontsCheckBeforeLoad: checkBefore[`${face.family}|${weight}`],
          fontsCheckAfterLoad: document.fonts.check(fontOf(weight, face.family), sample),
          glyphs: Object.fromEntries(SPEC.hungarian.map((c) => [c, glyph(face.family, weight, c)])),
          negativeControl: { character: SPEC.negativeControl, ...glyph(face.family, weight, SPEC.negativeControl) },
          digits: { tabular: {}, proportional: {}, fallbackAlone: {}, runsTabular: {} },
        };
        for (const fallback of SPEC.fallbacks) {
          const list = `${quote(face.family)}, ${fallback}`;
          entry.digits.tabular[fallback] = domWidths(list, weight, 'tabular-nums', SPEC.digits);
          entry.digits.proportional[fallback] = domWidths(list, weight, 'normal', SPEC.digits);
          entry.digits.fallbackAlone[fallback] = domWidths(fallback, weight, 'tabular-nums', SPEC.digits);
          entry.digits.runsTabular[fallback] = domWidths(list, weight, 'tabular-nums', SPEC.runs);
        }
        out.faces.push(entry);
      }
    }
  } catch (error) {
    out.error = String((error && error.stack) || error);
  }
  const pre = document.getElementById('glyph-check-result');
  pre.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
  pre.dataset.state = 'done';
};

const SPEC = {
  size: 200,
  fallbacks: ['serif', 'monospace'],
  hungarian: HUNGARIAN,
  negativeControl: NEGATIVE_CONTROL,
  digits: DIGITS,
  // Whole runs, as numerals are really set: a kerning pair between two figures would show here.
  runs: ['0000000000', '1111111111', '7474747474', '1010101010', '9876543210'],
  faces: ROLES.map(({ role, family, weights }) => ({ role, family, weights })),
};

const measureInChrome = () => {
  const chrome = findChrome();
  if (!chrome) fail(2, 'no Chrome found — pass --chrome "<path>" or set CHROME_PATH');

  // The rules under test, with the binaries inlined: a file:// page may not load a font from
  // another file:// URL, and nothing here should depend on a server.
  let inlined = stripComments(fontsCssText);
  for (const [url, absolute] of installed) {
    const data = `data:font/woff2;base64,${fs.readFileSync(absolute).toString('base64')}`;
    const before = inlined;
    inlined = inlined.split(`'${url}'`).join(`'${data}'`).split(`"${url}"`).join(`"${data}"`);
    if (inlined === before) fail(2, `could not inline ${url} — is it written unquoted in ${SHEET}?`);
  }
  if (/url\(\s*['"]?@/.test(inlined)) fail(2, `a url() of ${SHEET} was not inlined (it names a file leg A rejected)`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-glyph-check-'));
  const page = path.join(scratch, 'page.html');
  const profile = path.join(scratch, 'profile');
  fs.writeFileSync(
    page,
    `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>Pulse F1.2 glyph check (scratch page, not part of the app)</title>
<style>${inlined}</style>
</head>
<body>
<pre id="glyph-check-result" data-state="pending"></pre>
<script>(${pageScript.toString()})(${JSON.stringify(SPEC)});</script>
</body>
</html>
`,
  );

  const run = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=20000',
      '--dump-dom',
      pathToFileURL(page).href,
    ],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 256 * 1024 * 1024 },
  );
  const dom = run.stdout ?? '';
  if (flag('--keep')) console.error(`glyph-check: scratch page kept at ${page}`);
  else {
    try {
      fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.error(`glyph-check: could not remove ${scratch} (Chrome still held a file) — remove it by hand`);
    }
  }
  if (run.error) fail(2, `Chrome did not run: ${run.error.message}`);
  const match = dom.match(/<pre id="glyph-check-result" data-state="done">([A-Za-z0-9+/=]+)<\/pre>/);
  if (!match) fail(2, `the page did not finish (exit ${run.status}); ${dom.length} bytes of DOM dumped, stderr: ${(run.stderr ?? '').slice(0, 400)}`);
  const measured = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  if (measured.error) fail(2, `the page script threw: ${measured.error}`);
  return { chrome, measured };
};

/* ── judgement ───────────────────────────────────────────────────────────────────────────────── */

const CANVAS_EPSILON = 0.001; // px at 200 px: canvas widths are exact doubles
const DOM_EPSILON = 0.02; // px at 200 px: layout snaps a box to 1/64 px
const round = (n) => Math.round(n * 1000) / 1000;
const spread = (values) => Math.max(...values) - Math.min(...values);
const same = (a, b, epsilon) => Math.abs(a - b) <= epsilon;

const judge = (measured) => {
  const [A, B] = SPEC.fallbacks;
  const fromFace = (row) => same(row[`face+${A}`], row[`face+${B}`], CANVAS_EPSILON);
  const fellBack = (row) => same(row[`face+${A}`], row[`${A} alone`], CANVAS_EPSILON) && same(row[`face+${B}`], row[`${B} alone`], CANVAS_EPSILON);
  const fallbacksDiffer = (row) => !same(row[`${A} alone`], row[`${B} alone`], CANVAS_EPSILON);

  return measured.faces.map((face) => {
    const binary = binaryOf(face.family);
    const glyphReasons = [];
    const tabularReasons = [];
    if (face.fontsCheckBeforeLoad !== false) glyphReasons.push('document.fonts.check was not false before the load (the face was not declared, or was already active)');
    if (face.fontsCheckAfterLoad !== true) glyphReasons.push('document.fonts.check is not true after the load');

    const control = face.negativeControl;
    const controlOk = fellBack(control) && fallbacksDiffer(control) && !fromFace(control);
    if (!controlOk) glyphReasons.push(`the negative control ${control.character} did not read as missing — the measurement is not trustworthy`);

    const glyphs = Object.fromEntries(
      Object.entries(face.glyphs).map(([character, row]) => {
        const present = fromFace(row) && fallbacksDiffer(row) && !fellBack(row);
        if (!present) glyphReasons.push(`${character} (U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) is missing: its width equals the fallback's`);
        return [character, { present, em: round(row[`face+${A}`] / SPEC.size), fallbackEm: { [A]: round(row[`${A} alone`] / SPEC.size), [B]: round(row[`${B} alone`] / SPEC.size) } }];
      }),
    );
    if (!binary.hungarianInCmap) glyphReasons.push('the cmap of the declared files does not map ő ű Ő Ű');

    const d = face.digits;
    const digitsFromFace =
      d.tabular[A].every((w, i) => same(w, d.tabular[B][i], DOM_EPSILON)) &&
      !d.tabular[A].every((w, i) => same(w, d.fallbackAlone[A][i], DOM_EPSILON) && same(d.tabular[B][i], d.fallbackAlone[B][i], DOM_EPSILON));
    const tabularEqual = spread(d.tabular[A]) <= DOM_EPSILON;
    const defaultProportional = spread(d.proportional[A]) > DOM_EPSILON;
    const runsEqual = spread(d.runsTabular[A]) <= DOM_EPSILON * 10 && same(d.runsTabular[A][0], d.tabular[A][0] * 10, DOM_EPSILON * 10);
    if (!digitsFromFace) tabularReasons.push('the digits did not come from the face (their widths follow the fallback)');
    if (!tabularEqual) {
      tabularReasons.push(
        `under tabular-nums the ten digits are NOT on one advance (${round(Math.min(...d.tabular[A]) / SPEC.size)}-${round(Math.max(...d.tabular[A]) / SPEC.size)} em)` +
          (binary.tnumFeature ? '' : ` — the file has no tnum feature (GSUB: ${binary.gsubOfLatinFile.join(' ') || 'none'}), so the CSS cannot change its figures`),
      );
    }

    return {
      role: face.role,
      family: face.family,
      weight: face.weight,
      fontsCheck: { beforeLoad: face.fontsCheckBeforeLoad, afterLoad: face.fontsCheckAfterLoad },
      glyphs,
      negativeControl: { character: control.character, readsAsMissing: controlOk },
      digits: {
        fromFace: digitsFromFace,
        tabularAdvanceEm: tabularEqual ? round(d.tabular[A][0] / SPEC.size) : null,
        tabularEm: d.tabular[A].map((w) => round(w / SPEC.size)),
        tabularEqual,
        tnumFeatureInFile: binary.tnumFeature,
        defaultFigures: defaultProportional ? 'proportional' : 'already tabular',
        defaultEm: d.proportional[A].map((w) => round(w / SPEC.size)),
        // Not part of the verdict (the plan's criterion is the advance); reported because a kerning
        // pair between tabular figures would make a ticking number jitter all the same.
        runsOfTenEqual: runsEqual,
        runsOfTenEm: d.runsTabular[A].map((w) => round(w / SPEC.size)),
      },
      verdict: { glyphs: glyphReasons.length === 0 ? 'pass' : 'fail', tabular: tabularReasons.length === 0 ? 'pass' : 'fail' },
      reasons: [...glyphReasons, ...tabularReasons],
    };
  });
};

/* ── report ──────────────────────────────────────────────────────────────────────────────────── */

const markdown = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const fileTable = () =>
  markdown(
    ['Face', 'Subset', 'File', 'Bytes', 'unicode-range = package', 'font-display', 'cmap: ő ű Ő Ű', 'cmap: 0-9', 'GSUB features'],
    files.map((f) => [
      f.family,
      f.subset,
      path.posix.basename(f.file),
      String(f.bytes),
      f.unicodeRangeEqualsPackage ? 'yes' : 'NO',
      f.fontDisplay,
      f.mapsHungarian ? 'yes' : '-',
      f.mapsDigits ? 'yes' : '-',
      f.gsubFeatures.join(' ') || 'none',
    ]),
  );

const faceTable = (faces) =>
  markdown(
    ['Role', 'Family', 'Weight', 'fonts.check', ...HUNGARIAN.map((c) => `${c} em (fallbacks)`), 'Glyphs', '0-9 under tabular-nums', 'default figures', 'tnum in file', 'Tabular'],
    faces.map((f) => [
      f.role,
      f.family,
      String(f.weight),
      `${f.fontsCheck.beforeLoad} -> ${f.fontsCheck.afterLoad}`,
      ...HUNGARIAN.map((c) => {
        const g = f.glyphs[c];
        return `${g.present ? g.em.toFixed(3) : 'MISSING'} (${Object.values(g.fallbackEm).map((v) => v.toFixed(3)).join(' / ')})`;
      }),
      f.verdict.glyphs.toUpperCase(),
      f.digits.tabularEqual ? `one advance, ${f.digits.tabularAdvanceEm.toFixed(3)} em` : `UNEQUAL ${Math.min(...f.digits.tabularEm).toFixed(3)}-${Math.max(...f.digits.tabularEm).toFixed(3)} em`,
      f.digits.defaultFigures === 'proportional' ? `proportional ${Math.min(...f.digits.defaultEm).toFixed(3)}-${Math.max(...f.digits.defaultEm).toFixed(3)} em` : 'already tabular',
      f.digits.tnumFeatureInFile ? 'yes' : 'no',
      f.verdict.tabular.toUpperCase(),
    ]),
  );

console.log(`glyph-check: legs A and B — ${files.length} @font-face rule(s) of ${relative(FONTS_CSS)} against ${ROLES.length} installed package(s)${candidate ? ` — CANDIDATE display family "${ROLES[0].family}"` : ''}`);
console.log(fileTable());
console.log(
  `glyph-check: fonts of a Hungarian session, worst case: ${hungarianSession.bytes} bytes = ${hungarianSession.kB} kB (${hungarianSession.KiB} KiB) in ${hungarianSession.files} files — ${hungarianSession.within ? 'within' : 'OVER'} the ${SESSION_LIMIT_KB} KB of PLAN.md 3.3`,
);

if (flag('--static')) {
  for (const p of problems) console.error(`glyph-check: ${p}`);
  console.log(`glyph-check: leg A ${staticOk ? 'OK' : 'FAILED'} (leg C not run: --static)`);
  process.exit(staticOk ? 0 : 1);
}
if (!staticOk) {
  for (const p of problems) console.error(`glyph-check: ${p}`);
  fail(2, `leg A failed — the rules of ${SHEET} do not describe the installed files, so measuring them proves nothing`);
}

const { chrome, measured } = measureInChrome();
const faces = judge(measured);
const dormantBeforeUse = measured.statusBeforeUse.length === files.length && measured.statusBeforeUse.every((f) => f.status === 'unloaded');
if (measured.declaredFaces !== files.length) problems.push(`the browser sees ${measured.declaredFaces} face(s), ${SHEET} declares ${files.length}`);

const roleVerdict = (role, part) => (faces.filter((f) => f.role === role).every((f) => f.verdict[part] === 'pass') ? 'pass' : 'fail');
const verdict = {
  glyphs: Object.fromEntries(ROLES.map((r) => [r.role, roleVerdict(r.role, 'glyphs')])),
  tabular: Object.fromEntries(ROLES.map((r) => [r.role, roleVerdict(r.role, 'tabular')])),
};
verdict.overall = problems.length === 0 && [...Object.values(verdict.glyphs), ...Object.values(verdict.tabular)].every((v) => v === 'pass') ? 'pass' : 'fail';

console.log(`\nglyph-check: leg C — ${measured.userAgent}`);
console.log(`glyph-check: ${measured.declaredFaces} declared face(s); before any text used them: ${dormantBeforeUse ? 'all "unloaded" (a declared face costs nothing until text asks for it)' : JSON.stringify(measured.statusBeforeUse)}`);
console.log(faceTable(faces));
console.log(`glyph-check: negative control ${NEGATIVE_CONTROL} read as missing in ${faces.filter((f) => f.negativeControl.readsAsMissing).length} of ${faces.length} measurement(s)`);
for (const f of faces) for (const reason of f.reasons) console.error(`glyph-check: ${f.family} ${f.weight}: ${reason}`);
for (const p of problems) console.error(`glyph-check: ${p}`);
const line = (part) => ROLES.map((r) => `${r.role} ${verdict[part][r.role].toUpperCase()}`).join(', ');
console.log(`glyph-check: GLYPHS (fonts.check + ő ű Ő Ű) — ${line('glyphs')}`);
console.log(`glyph-check: TABULAR FIGURES (0-9 on one advance under tabular-nums) — ${line('tabular')}`);
console.log(`glyph-check: overall ${verdict.overall.toUpperCase()}`);

if (flag('--write')) {
  const result = {
    step: 'F1.2',
    what: 'glyph and tabular-figure check of the three Pulse faces (PLAN.md 3.3, R8)',
    subject: candidate
      ? `a CANDIDATE display family, "${ROLES[0].family}" from ${ROLES[0].pkg} — not what the app ships`
      : 'the shipped stylesheet, frontend/src/ui/tokens/fonts.css',
    stylesheet: relative(FONTS_CSS),
    checkedAt: new Date().toISOString(),
    onCommit: `${git(['rev-parse', '--short', 'HEAD'])} + the F1.2 working tree`,
    browser: { userAgent: measured.userAgent, executable: path.basename(chrome), mode: 'headless, --dump-dom, a scratch page in the OS temp directory' },
    method: {
      sizePx: SPEC.size,
      fallbacks: SPEC.fallbacks,
      glyph: 'canvas measureText in "<face>, <fallback>" against "<fallback>" alone, over two fallbacks; present = the same width over both fallbacks and not the fallback width',
      digits: 'DOM box width of each digit under font-variant-numeric: tabular-nums; one advance = spread within 1/64 px at 200 px',
      negativeControl: `${NEGATIVE_CONTROL} lies outside every declared unicode-range and must read as missing`,
      binary: 'cmap and the GSUB feature list read from the WOFF2 files (font-tables.mjs)',
    },
    packages: packageVersions,
    files,
    hungarianSession,
    dormantBeforeUse,
    faces,
    verdict,
    problems,
  };
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`glyph-check: wrote ${relative(RESULT_PATH)}`);
}

process.exit(verdict.overall === 'pass' ? 0 : 1);
