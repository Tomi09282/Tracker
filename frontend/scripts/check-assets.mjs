// scripts/check-assets.mjs — the Pulse images: one list, one door, one canvas, one lamp.
//
// ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════════════════════════
//
// The app ships raster images for the first time, and every one of them is a pair of facts that
// can drift apart without an error:
//
//   the manifest says a slot has a lit raster   ·  the file is not on disk      → a broken tab icon
//   the manifest says 585 x 1236                ·  the file is 597 x 1261       → a box that jumps
//   a still was baked onto the canvas #0B0D0A   ·  --surface-0 moved            → a visible rectangle
//   the lit icons are pixels in the accent      ·  --accent moved               → two limes on a screen
//   images glow out of black by their own alpha ·  somebody adds a blend mode   → a black box under
//                                                                                 7 of 12 parents
//
// None of these breaks tsc, vite or any other gate. Each is found by looking at a phone. So each is
// an assertion here, and each assertion has a probe that plants the defect and watches it go red.
//
// ═══ THE EIGHT ASSERTIONS ══════════════════════════════════════════════════════════════════════
//
//   1 list       assets.json, slots.ts, urls.ts, assets.lock.json and img/ are ONE list: every slot
//                has exactly its files, no orphan, no excluded source, and the files are the ones
//                this manifest built (recipe and content hashes)
//   2 pixels     every file's real pixel size (read from its WebP header) is its width and the
//                slot's aspect ratio; a lit raster has the size of its idle twin
//   3 budget     the folder stays under 1.0 MB and every file under its family's cap
//   4 tabs       every tab icon key has an idle and a lit raster; navIcons.ts maps every bar icon
//                key to a raster on disk (a `raster` light to a slot with a lit twin; a SWITCH key
//                to an idle raster only — it never lights, and a switch master never ships a lit
//                file); every cell of NAV_TABS names such a key — a switch cell a switch key, a
//                destination a destination key
//   5 equipment  EQUIPMENT_STILL decides every equipment slug the database knows, and only ever
//                points at an equipment still
//   6 door       outside src/assets/pulse and src/ui/media nothing imports an image or reaches into
//                the folder; nothing in src uses a blend mode
//   7 canvas     the canvas baked into the stills equals --surface-0
//   8 accent     the accent baked into the lit rasters equals --accent
//
// ═══ AND WHY IT NEEDS NO IMAGE LIBRARY ═════════════════════════════════════════════════════════
//
// A WebP file states its pixel size in its first 30 bytes. Reading that is arithmetic, so this gate
// runs in every worktree with bare Node — `sharp` is only needed to MAKE the files
// (scripts/build-pulse-assets.mjs), never to check them.
//
// Run:    node scripts/check-assets.mjs            (wired into `npm run build`)
// Probe:  node scripts/check-assets.mjs --probe    (plants one defect per assertion in a copy under
//                                                   the OS temp folder; the working tree is never
//                                                   touched)
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LF = String.fromCharCode(10);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The frontend package: this script lives in <frontend>/scripts. */
export const FRONTEND_ROOT = path.resolve(HERE, '..');

export const MANIFEST_REL = 'assets-src/pulse/assets.json';
export const LOCK_REL = 'assets-src/pulse/assets.lock.json';
export const PULSE_REL = 'src/assets/pulse';
export const IMG_REL = 'src/assets/pulse/img';
export const TOKENS_REL = 'src/ui/tokens/tokens.css';

/** The whole folder, in bytes. 1.0 MB — assets note §3.4. */
export const FOLDER_CAP = 1_048_576;

/** Per-file caps by family, in bytes (assets note §3.4). The budget is this gate's opinion, not the manifest's. */
export const FAMILY_CAP = {
  icon: 8 * 1024,
  object: 8 * 1024,
  equipment: 8 * 1024,
  figure: 70 * 1024,
  hero: 100 * 1024,
  texture: 8 * 1024,
};

/** The one object that is drawn large (188 pt on the wallet), so it may weigh more than a medal. */
export const SLOT_CAP = { coin: 40 * 1024 };

export const FAMILIES = Object.keys(FAMILY_CAP);
export const ALPHA_MODES = ['knee', 'keep', 'none'];

/**
 * SOURCES THAT MUST NOT SHIP, written out rather than read from the manifest.
 *
 * If the list lived in assets.json, shipping one of these would be a single edit to a data file:
 * drop the entry, add the slot, green build. Here it takes an edit to the gate itself, which is
 * reviewed as what it is.
 */
export const EXCLUDED_SOURCES = {
  'tab-home': 'superseded steel master — the lit and idle tab2-* icons were tinted from it',
  'tab-training': 'superseded steel master — the lit and idle tab2-* icons were tinted from it',
  'tab-nutrition': 'superseded steel master — the lit and idle tab2-* icons were tinted from it',
  'tab-progress': 'superseded steel master — the lit and idle tab2-* icons were tinted from it',
  'tab-profile': 'superseded steel master — the lit and idle tab2-* icons were tinted from it',
  'muscle-figure-front': 'a baked lit state — the app draws the lime over the neutral figure',
  'figure-front-press': 'a baked lit state — the app draws the lime over the neutral figure',
  'figure-front-legs': 'a baked lit state — the app draws the lime over the neutral figure',
  'figure-back-lats': 'a baked lit state — the app draws the lime over the neutral figure',
  'figure-back-pull': 'another canvas (539 x 1189) and a warmer grade — it cannot swap in place',
  'cover-gym': 'sample content — a real cover is the coach’s own upload',
  'cover-bar': 'sample content — a real cover is the coach’s own upload',
  'cover-track': 'sample content — a real cover is the coach’s own upload',
  'portrait-coach': 'the product has no coach photo',
};

/**
 * EVERY EQUIPMENT SLUG THE DATABASE KNOWS (backend migration 003_exercises.sql).
 *
 * Written out, deliberately: it is the second opinion EQUIPMENT_STILL is held to. Where the backend
 * source is on disk beside this package the list itself is compared with the migrations, so a new
 * slug cannot arrive without somebody deciding "a still, or a text-only row".
 */
export const EQUIPMENT_ROSTER = [
  'bodyweight',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'smith-machine',
  'resistance-band',
  'ez-bar',
  'pull-up-bar',
  'bench',
  'medicine-ball',
  'stability-ball',
  'foam-roller',
  'trx',
  'other',
];

/**
 * A slot name may not start with a word check-tokens reads as a colour utility: `ring-…` for a
 * still of gymnastic rings would be reported as an undeclared colour the first time it is typed.
 */
export const COLOUR_PREFIXES = ['text', 'bg', 'fill', 'stroke', 'ring', 'border', 'outline', 'divide', 'decoration'];

const SLOT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const IMAGE_EXT = 'png|jpe?g|webp|avif|gif|svg|bmp|ico';
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html']);

/** Where an image file may be imported, and where the folder may be reached into. */
const DOOR_DIRS = ['src/assets/pulse/', 'src/ui/media/'];
/** The one file that imports images at all. */
const URLS_FILE = 'src/assets/pulse/urls.ts';

// ─── small pure helpers (the build script imports these: one rule, one implementation) ─────────

/** `#abc`, `#AABBCC`, `#aabbccff` → `#aabbcc`; anything else → null. */
export function normaliseHex(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(value).trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  if (hex.length === 8) {
    if (!hex.endsWith('ff')) return null;
    hex = hex.slice(0, 6);
  }
  return `#${hex}`;
}

/** `#0B0D0A` → [11, 13, 10]. */
export function hexToRgb(value) {
  const hex = normaliseHex(value);
  if (!hex) return null;
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
};

/**
 * The fingerprint of everything in the manifest that decides a PIXEL or a generated line.
 *
 * `about` and `navTabs` are left out on purpose: the first is prose, the second is a switch of this
 * gate. Flipping it must not claim the images are stale.
 */
export function recipeOf(manifest) {
  const { canvas, accent, knee, slots, equipmentStill } = manifest;
  const body = JSON.stringify(canonical({ canvas: normaliseHex(canvas), accent: normaliseHex(accent), knee, slots, equipmentStill }));
  return createHash('sha256').update(body).digest('hex');
}

/** Every file the manifest promises, in manifest order. */
export function expectedFiles(manifest) {
  const files = [];
  for (const [slot, spec] of Object.entries(manifest.slots ?? {})) {
    for (const width of spec.widths ?? []) {
      files.push({ file: `${slot}-${width}.webp`, slot, width, lit: false });
      if (spec.litSource) files.push({ file: `${slot}-lit-${width}.webp`, slot, width, lit: true });
    }
  }
  return files;
}

/** The tab icon keys, derived the one way both the generator and the gate derive them. */
export function tabIconKeysOf(manifest) {
  return Object.entries(manifest.slots ?? {})
    .filter(([slot, spec]) => spec.family === 'icon' && slot.startsWith('tab-'))
    .map(([slot]) => slot.slice('tab-'.length));
}

/** The height a variant of `width` must have, given the largest variant's size. */
export function variantHeight(width, largestWidth, largestHeight) {
  return Math.round((width * largestHeight) / largestWidth);
}

export function capFor(slot, family) {
  return SLOT_CAP[slot] ?? FAMILY_CAP[family] ?? 0;
}

const stem = (file) => String(file).replace(/\.[a-z0-9]+$/i, '');

/** Everything about the manifest that can be judged without looking at a file. Returns messages. */
export function validateManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') return ['assets.json is not an object'];
  if (!normaliseHex(manifest.canvas)) problems.push(`"canvas" is not a hex colour: ${JSON.stringify(manifest.canvas)}`);
  if (!normaliseHex(manifest.accent)) problems.push(`"accent" is not a hex colour: ${JSON.stringify(manifest.accent)}`);
  if (!Number.isInteger(manifest.knee) || manifest.knee < 1 || manifest.knee > 255) {
    problems.push(`"knee" must be an integer from 1 to 255, found ${JSON.stringify(manifest.knee)}`);
  }
  const slots = manifest.slots;
  if (!slots || typeof slots !== 'object' || Object.keys(slots).length === 0) {
    problems.push('"slots" is empty');
    return problems;
  }
  const seenFiles = new Map();
  for (const [slot, spec] of Object.entries(slots)) {
    if (!SLOT_NAME.test(slot)) problems.push(`slot "${slot}": a slot name is lower-case words joined by single hyphens`);
    if (slot.endsWith('-lit') || /-lit-\d+$/.test(slot)) problems.push(`slot "${slot}": "-lit" is the suffix of the lit raster and cannot end a slot name`);
    const first = slot.split('-')[0];
    if (COLOUR_PREFIXES.includes(first)) {
      problems.push(`slot "${slot}": starts with "${first}-", which check-tokens reads as a colour utility — rename it`);
    }
    if (!FAMILIES.includes(spec.family)) problems.push(`slot "${slot}": unknown family ${JSON.stringify(spec.family)}`);
    if (!ALPHA_MODES.includes(spec.alpha)) problems.push(`slot "${slot}": "alpha" must be one of ${ALPHA_MODES.join(' | ')}`);
    if (!Number.isInteger(spec.quality) || spec.quality < 1 || spec.quality > 100) problems.push(`slot "${slot}": "quality" must be 1-100`);
    const widths = spec.widths;
    if (!Array.isArray(widths) || widths.length === 0 || widths.some((w) => !Number.isInteger(w) || w < 1)) {
      problems.push(`slot "${slot}": "widths" must be a list of positive integers`);
    } else if (widths.some((w, i) => i > 0 && w <= widths[i - 1])) {
      problems.push(`slot "${slot}": "widths" must ascend`);
    }
    for (const field of ['source', 'litSource']) {
      const value = spec[field];
      if (value === undefined && field === 'litSource') continue;
      if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+\.png$/.test(value)) {
        problems.push(`slot "${slot}": "${field}" must be the file name of a PNG master, found ${JSON.stringify(value)}`);
        continue;
      }
      const reason = EXCLUDED_SOURCES[stem(value)];
      if (reason) problems.push(`slot "${slot}": ${field} "${value}" must not ship — ${reason}`);
    }
    if (spec.litSource && spec.alpha !== 'keep') problems.push(`slot "${slot}": a lit raster is a tint of a cut-out, so "alpha" must be "keep"`);
    for (const key of Object.keys(spec)) {
      if (!['source', 'litSource', 'family', 'alpha', 'widths', 'quality'].includes(key)) {
        problems.push(`slot "${slot}": unknown field "${key}"`);
      }
    }
  }
  for (const { file, slot } of expectedFiles(manifest)) {
    if (seenFiles.has(file)) problems.push(`slots "${seenFiles.get(file)}" and "${slot}" would both write ${file}`);
    seenFiles.set(file, slot);
  }
  const still = manifest.equipmentStill;
  if (!still || typeof still !== 'object') problems.push('"equipmentStill" is missing');
  return problems;
}

/**
 * The pixel size a WebP file states about itself, or null when the bytes are not a WebP header.
 *
 * Three containers exist and the export writes two of them: `VP8X` (anything with alpha) and plain
 * `VP8 ` (the opaque texture). `VP8L` is read too, so a lossless file is measured rather than
 * reported as unreadable.
 */
export function readWebpSize(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('latin1', 12, 16);
  if (chunk === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1, chunk };
  }
  if (chunk === 'VP8 ') {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, chunk };
  }
  if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, chunk };
  }
  return null;
}

/**
 * Comments blanked, everything else — strings included — left exactly where it was.
 *
 * Only comments are ever removed, so a quote this scanner misreads (an apostrophe in JSX text) can
 * at worst leave a comment standing. It can never hide a line of code.
 */
export function blankComments(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    const d = text[i + 1];
    if (quote) {
      out += c;
      i += 1;
      if (c === '\\' && i < text.length) {
        out += text[i];
        i += 1;
      } else if (c === quote || (c === LF && quote !== '`')) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < text.length && text[i] !== LF) {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (; i < stop; i += 1) out += text[i] === LF ? LF : ' ';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const posix = (p) => p.split(path.sep).join('/');
const fmt = (n) => n.toLocaleString('en-US');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function walk(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

let importCounter = 0;
/** Import a module fresh every time: the probes rewrite slots.ts between two runs in one process. */
async function importFresh(file) {
  importCounter += 1;
  return import(`${pathToFileURL(file).href}?run=${importCounter}`);
}

/** Every declaration of one custom property in a stylesheet, comments ignored. */
function declarationsOf(css, name) {
  const code = blankComments(css);
  const re = new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;{}]+);`, 'g');
  return [...code.matchAll(re)].map((m) => ({
    value: m[1].trim(),
    line: code.slice(0, m.index).split(LF).length,
  }));
}

/** The equipment slugs the migrations insert, or null when the backend source is not on disk. */
async function databaseRoster(migrationsDir) {
  if (!migrationsDir || !existsSync(migrationsDir)) return null;
  const slugs = new Set();
  for (const name of (await fs.readdir(migrationsDir)).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = await fs.readFile(path.join(migrationsDir, name), 'utf8');
    for (const insert of sql.matchAll(/INSERT[^;]*?\bINTO\s+equipment\s*\(\s*slug\b[^)]*\)\s*VALUES([^;]+);/gi)) {
      for (const row of insert[1].matchAll(/\(\s*'([a-z0-9-]+)'/g)) slugs.add(row[1]);
    }
  }
  return slugs.size ? slugs : null;
}

// ─── the gate ──────────────────────────────────────────────────────────────────────────────────

export const ASSERTIONS = [
  [1, 'list'],
  [2, 'pixels'],
  [3, 'budget'],
  [4, 'tabs'],
  [5, 'equipment'],
  [6, 'door'],
  [7, 'canvas'],
  [8, 'accent'],
];

/**
 * Run the eight assertions over one frontend tree.
 *
 * `navTabs` is the imported NAV_TABS table (role → tabs). It is passed in rather than imported
 * here because app/navTabs.ts imports a package, and a copy of the tree under the OS temp folder
 * (the probes) has no node_modules to resolve it from.
 */
export async function runChecks({ root = FRONTEND_ROOT, navTabs, navTabsError, migrationsDir } = {}) {
  const problems = [];
  const notes = [];
  const fail = (n, message) => problems.push({ n, id: ASSERTIONS[n - 1][1], message });

  const imgDir = path.join(root, IMG_REL);
  const stats = { files: 0, sources: 0, bytes: 0 };

  // ── inputs ────────────────────────────────────────────────────────────────────────────────
  let manifest = null;
  try {
    manifest = await readJson(path.join(root, MANIFEST_REL));
  } catch (error) {
    fail(1, `${MANIFEST_REL} cannot be read: ${error.message}`);
    return { problems, notes, stats };
  }
  const manifestProblems = validateManifest(manifest);
  for (const message of manifestProblems) fail(1, `${MANIFEST_REL}: ${message}`);
  if (manifestProblems.length) return { problems, notes, stats };

  let lock = null;
  try {
    lock = await readJson(path.join(root, LOCK_REL));
  } catch (error) {
    fail(1, `${LOCK_REL} cannot be read (${error.code ?? error.message}) — it is written by \`npm run assets:pulse\``);
  }

  let slotsModule = null;
  try {
    slotsModule = await importFresh(path.join(root, PULSE_REL, 'slots.ts'));
  } catch (error) {
    fail(1, `${PULSE_REL}/slots.ts cannot be imported into bare Node: ${error.message.split(LF)[0]}`);
  }
  const SLOTS = slotsModule?.PULSE_SLOTS ?? {};
  const STILL = slotsModule?.EQUIPMENT_STILL ?? {};
  const TAB_KEYS = slotsModule?.TAB_ICON_KEYS ?? [];

  const expected = expectedFiles(manifest);
  const expectedNames = new Set(expected.map((e) => e.file));
  const sources = new Set();
  for (const spec of Object.values(manifest.slots)) {
    sources.add(spec.source);
    if (spec.litSource) sources.add(spec.litSource);
  }
  stats.sources = sources.size;

  const onDisk = new Map();
  if (existsSync(imgDir)) {
    for (const entry of await fs.readdir(imgDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        fail(1, `${IMG_REL}/${entry.name}/ is a folder — the images are one flat list`);
        continue;
      }
      onDisk.set(entry.name, await fs.readFile(path.join(imgDir, entry.name)));
    }
  } else {
    fail(1, `${IMG_REL}/ does not exist — run \`npm run assets:pulse -- --src <masters folder>\``);
  }
  stats.files = onDisk.size;
  stats.bytes = [...onDisk.values()].reduce((sum, b) => sum + b.length, 0);

  // ── 1 · one list ──────────────────────────────────────────────────────────────────────────
  for (const { file, slot, lit } of expected) {
    if (!onDisk.has(file)) {
      fail(1, `${IMG_REL}/${file} is missing — slot "${slot}" promises ${lit ? 'a lit raster' : 'it'} in ${MANIFEST_REL}`);
    }
  }
  for (const file of onDisk.keys()) {
    if (!expectedNames.has(file)) fail(1, `${IMG_REL}/${file} is an orphan: no slot of ${MANIFEST_REL} writes it`);
  }

  if (slotsModule) {
    const manifestSlots = Object.keys(manifest.slots);
    const moduleSlots = Object.keys(SLOTS);
    for (const slot of manifestSlots) {
      if (!(slot in SLOTS)) fail(1, `slots.ts has no "${slot}" although ${MANIFEST_REL} declares it — re-run \`npm run assets:pulse\``);
    }
    for (const slot of moduleSlots) {
      if (!(slot in manifest.slots)) fail(1, `slots.ts carries "${slot}", which ${MANIFEST_REL} does not declare — re-run \`npm run assets:pulse\``);
    }
    for (const slot of manifestSlots) {
      const meta = SLOTS[slot];
      if (!meta) continue;
      const spec = manifest.slots[slot];
      const same =
        meta.family === spec.family &&
        meta.lit === Boolean(spec.litSource) &&
        Array.isArray(meta.widths) &&
        meta.widths.length === spec.widths.length &&
        meta.widths.every((w, i) => w === spec.widths[i]);
      if (!same) {
        fail(1, `slots.ts and ${MANIFEST_REL} disagree about "${slot}" (family, widths or the lit flag) — re-run \`npm run assets:pulse\``);
      }
    }
    const stillInManifest = JSON.stringify(canonical(manifest.equipmentStill ?? {}));
    if (JSON.stringify(canonical(STILL)) !== stillInManifest) {
      fail(1, `EQUIPMENT_STILL in slots.ts is not the "equipmentStill" table of ${MANIFEST_REL} — re-run \`npm run assets:pulse\``);
    }
    if (JSON.stringify([...TAB_KEYS]) !== JSON.stringify(tabIconKeysOf(manifest))) {
      fail(1, `TAB_ICON_KEYS in slots.ts is not the list of tab-* icon slots of ${MANIFEST_REL} — re-run \`npm run assets:pulse\``);
    }
  }

  if (lock) {
    if (lock.recipe !== recipeOf(manifest)) {
      fail(
        1,
        `${MANIFEST_REL} changed after the images were built (canvas, accent, knee, a slot or the still table): ` +
          `the pixels on disk are from another recipe — run \`npm run assets:pulse -- --src <masters folder>\``,
      );
    }
    for (const { file } of expected) {
      const buffer = onDisk.get(file);
      const entry = lock.files?.[file];
      if (!buffer) continue;
      if (!entry) {
        fail(1, `${LOCK_REL} has no entry for ${file} — the file was not written by the asset script`);
      } else if (entry.sha256 !== sha256(buffer)) {
        fail(1, `${IMG_REL}/${file} is not the file the asset script wrote (content hash differs from ${LOCK_REL}) — images are generated, never edited`);
      }
    }
    for (const file of Object.keys(lock.files ?? {})) {
      if (!expectedNames.has(file)) fail(1, `${LOCK_REL} lists ${file}, which no slot writes — re-run \`npm run assets:pulse\``);
    }
  }

  try {
    const urls = blankComments(await fs.readFile(path.join(root, URLS_FILE), 'utf8'));
    const imported = [...urls.matchAll(/from\s+['"]\.\/img\/([^'"]+)['"]/g)].map((m) => m[1]);
    for (const { file } of expected) {
      const count = imported.filter((name) => name === file).length;
      if (count !== 1) fail(1, `urls.ts imports ./img/${file} ${count} time(s), expected exactly one — re-run \`npm run assets:pulse\``);
    }
    for (const name of imported) {
      if (!expectedNames.has(name)) fail(1, `urls.ts imports ./img/${name}, which no slot writes — re-run \`npm run assets:pulse\``);
    }
  } catch (error) {
    fail(1, `${URLS_FILE} cannot be read: ${error.code ?? error.message}`);
  }

  // ── 2 · pixels ────────────────────────────────────────────────────────────────────────────
  for (const [slot, spec] of Object.entries(manifest.slots)) {
    const meta = SLOTS[slot];
    if (!meta) continue;
    const largest = Math.max(...spec.widths);
    if (meta.width !== largest) {
      fail(2, `slots.ts gives "${slot}" width ${meta.width}, but its largest variant is ${largest} px wide`);
      continue;
    }
    for (const width of spec.widths) {
      const wantHeight = variantHeight(width, meta.width, meta.height);
      const sizes = {};
      for (const variant of spec.litSource ? ['idle', 'lit'] : ['idle']) {
        const file = `${slot}${variant === 'lit' ? '-lit' : ''}-${width}.webp`;
        const buffer = onDisk.get(file);
        if (!buffer) continue;
        const size = readWebpSize(buffer);
        if (!size) {
          fail(2, `${IMG_REL}/${file} is not a WebP file (no RIFF/WEBP header with a readable size)`);
          continue;
        }
        sizes[variant] = size;
        if (size.width !== width || size.height !== wantHeight) {
          fail(
            2,
            `${IMG_REL}/${file} is ${size.width} x ${size.height} px, expected ${width} x ${wantHeight} ` +
              `(the slot is ${meta.width} x ${meta.height}; a wrong size moves the box Pic reserves)`,
          );
        }
      }
      if (sizes.idle && sizes.lit && (sizes.idle.width !== sizes.lit.width || sizes.idle.height !== sizes.lit.height)) {
        fail(2, `"${slot}" at ${width} px: the lit raster is ${sizes.lit.width} x ${sizes.lit.height}, the idle one ${sizes.idle.width} x ${sizes.idle.height} — the pair must overlap exactly`);
      }
    }
  }

  // ── 3 · budget ────────────────────────────────────────────────────────────────────────────
  if (stats.bytes > FOLDER_CAP) {
    fail(3, `${IMG_REL}/ weighs ${fmt(stats.bytes)} B, over the ${fmt(FOLDER_CAP)} B cap by ${fmt(stats.bytes - FOLDER_CAP)} B`);
  }
  for (const { file, slot } of expected) {
    const buffer = onDisk.get(file);
    if (!buffer) continue;
    const family = manifest.slots[slot].family;
    const cap = capFor(slot, family);
    if (buffer.length > cap) {
      fail(3, `${IMG_REL}/${file} weighs ${fmt(buffer.length)} B, over the ${fmt(cap)} B cap of ${SLOT_CAP[slot] ? `slot "${slot}"` : `family "${family}"`}`);
    }
  }

  // ── 4 · tabs ──────────────────────────────────────────────────────────────────────────────
  if (slotsModule) {
    if (TAB_KEYS.length === 0) fail(4, 'TAB_ICON_KEYS is empty — the bar would have no icon to draw');
    for (const key of TAB_KEYS) {
      const slot = `tab-${key}`;
      const meta = SLOTS[slot];
      if (!meta) {
        fail(4, `tab icon key "${key}" has no slot "${slot}"`);
        continue;
      }
      if (meta.family !== 'icon') fail(4, `slot "${slot}" is family "${meta.family}", a tab icon must be "icon"`);
      if (!meta.lit) fail(4, `tab icon key "${key}" has no lit raster — the active tab would have nothing to light`);
      for (const width of meta.widths ?? []) {
        for (const file of [`${slot}-${width}.webp`, `${slot}-lit-${width}.webp`]) {
          if (!onDisk.has(file)) fail(4, `tab icon key "${key}": ${IMG_REL}/${file} is not on disk — both states are rendered on every screen`);
        }
      }
    }

    // The bar's icon keys → rasters (src/assets/pulse/navIcons.ts, hand-written, pure). Until the
    // owner's masters exist, six keys are drawn by PLACEHOLDER rasters that already ship: the two
    // switch cells by the idle profile / coach icon, Tervek / Pult / Fiókok by a photo still and
    // Piactér by the coin. This is the one place that says so, and this leg holds it to the disk.
    let navIcons = null;
    try {
      navIcons = await importFresh(path.join(root, PULSE_REL, 'navIcons.ts'));
    } catch (error) {
      fail(4, `${PULSE_REL}/navIcons.ts cannot be imported into bare Node: ${error.message.split(LF)[0]}`);
    }
    const SOURCES = navIcons?.NAV_ICON_SOURCE ?? {};
    const SWITCH_KEYS = navIcons?.SWITCH_ICON_KEYS ?? [];
    if (navIcons) {
      if (SWITCH_KEYS.length === 0) fail(4, 'navIcons.ts names no SWITCH_ICON_KEYS — the role bars open with switch cells');
      for (const key of TAB_KEYS) {
        if (!SOURCES[key]) fail(4, `tab icon key "${key}" has no row in NAV_ICON_SOURCE — the bar could not draw it`);
      }
      for (const [key, source] of Object.entries(SOURCES)) {
        const meta = SLOTS[source?.slot];
        const isSwitchKey = SWITCH_KEYS.includes(key);
        if (!meta) {
          fail(4, `NAV_ICON_SOURCE.${key} draws slot "${source?.slot}", which is not a slot`);
          continue;
        }
        for (const width of meta.widths ?? []) {
          if (!onDisk.has(`${source.slot}-${width}.webp`)) fail(4, `NAV_ICON_SOURCE.${key}: ${IMG_REL}/${source.slot}-${width}.webp is not on disk`);
        }
        if (!['raster', 'tint', 'none'].includes(source.lit)) fail(4, `NAV_ICON_SOURCE.${key} lights by "${source.lit}" — raster, tint or none`);
        if (source.lit === 'raster' && !meta.lit) {
          fail(4, `NAV_ICON_SOURCE.${key} lights by its raster, and slot "${source.slot}" has no lit raster — the active tab would have nothing to light`);
        }
        if (isSwitchKey && source.lit !== 'none') {
          fail(4, `switch icon key "${key}" asks to light ("${source.lit}") — a switch is a way back, never the current place: an idle raster and nothing else`);
        }
        if (!isSwitchKey && source.lit === 'none') {
          fail(4, `destination icon key "${key}" never lights ("none") — only a switch has no lit state`);
        }
      }
      // The masters to come (checkpoint C2): a switch master ships its idle file ONLY.
      for (const key of SWITCH_KEYS) {
        for (const slot of [key, `tab-${key}`]) {
          if (SLOTS[slot]?.lit) fail(4, `switch master "${slot}" ships a lit raster — a switch never lights; drop its litSource from ${MANIFEST_REL}`);
        }
      }
    }

    const leg = manifest.navTabs?.leg;
    const field = manifest.navTabs?.field ?? 'icon';
    if (leg !== 'pending' && leg !== 'enforced') {
      fail(4, `${MANIFEST_REL}: "navTabs.leg" must be "pending" or "enforced", found ${JSON.stringify(leg)}`);
    } else if (!navTabs) {
      fail(4, `app/navTabs.ts could not be imported, so the tab table cannot be checked${navTabsError ? `: ${navTabsError}` : ''}`);
    } else {
      const tabs = Object.entries(navTabs).flatMap(([view, list]) => list.map((tab) => ({ view, tab })));
      let keyed = 0;
      for (const { view, tab } of tabs) {
        const value = tab[field];
        if (typeof value === 'string') {
          keyed += 1;
          if (tab.kind === 'switch') {
            if (!SWITCH_KEYS.includes(value)) {
              fail(4, `NAV_TABS.${view}: the switch to ${tab.to} names icon "${value}", which is not a switch icon key (${SWITCH_KEYS.join(', ')}) — a switch draws an idle raster only`);
            }
          } else if (SWITCH_KEYS.includes(value)) {
            fail(4, `NAV_TABS.${view}: the tab to ${tab.to} names the switch icon "${value}" — a destination must be able to light`);
          } else if (!Object.hasOwn(SOURCES, value)) {
            fail(4, `NAV_TABS.${view}: the tab to ${tab.to} names icon "${value}", which is not a bar icon key (${Object.keys(SOURCES).join(', ')})`);
          }
        } else if (leg === 'enforced') {
          fail(4, `NAV_TABS.${view}: the tab to ${tab.to} has no string icon key in "${field}" — the bar draws rasters by key, and this file must stay importable by bare Node`);
        }
      }
      if (leg === 'pending') {
        if (tabs.length > 0 && keyed === tabs.length) {
          fail(4, `${MANIFEST_REL}: "navTabs.leg" is still "pending" although every tab of NAV_TABS names an icon key — set it to "enforced" (a switch left off guards nothing)`);
        } else {
          notes.push(`assertion 4, second leg PENDING: ${tabs.length - keyed} of ${tabs.length} tabs of NAV_TABS still carry an icon component, not a key (switched on by "navTabs.leg" in ${MANIFEST_REL})`);
        }
      }
    }
  }

  // ── 5 · equipment ─────────────────────────────────────────────────────────────────────────
  if (slotsModule) {
    const keys = Object.keys(STILL);
    for (const slug of EQUIPMENT_ROSTER) {
      if (!keys.includes(slug)) fail(5, `EQUIPMENT_STILL has no entry for equipment "${slug}" — decide it: a still, or null for a text-only row`);
    }
    for (const slug of keys) {
      if (!EQUIPMENT_ROSTER.includes(slug)) fail(5, `EQUIPMENT_STILL has an entry for "${slug}", which is not an equipment slug the database knows`);
      const target = STILL[slug];
      if (target === null) continue;
      const meta = SLOTS[target];
      if (!meta) fail(5, `EQUIPMENT_STILL["${slug}"] points at "${target}", which is not a slot`);
      else if (meta.family !== 'equipment') fail(5, `EQUIPMENT_STILL["${slug}"] points at "${target}", a ${meta.family} — only an equipment still fits the 48 pt lead slot`);
    }
    const used = new Set(Object.values(STILL).filter(Boolean));
    for (const [slot, meta] of Object.entries(SLOTS)) {
      if (meta.family === 'equipment' && !used.has(slot)) fail(5, `equipment still "${slot}" is shipped but no slug of EQUIPMENT_STILL uses it`);
    }
    const database = await databaseRoster(migrationsDir ?? path.join(root, '..', 'backend', 'src', 'db', 'migrations'));
    if (database) {
      for (const slug of database) {
        if (!EQUIPMENT_ROSTER.includes(slug)) fail(5, `the database has equipment "${slug}" (backend migrations), which EQUIPMENT_ROSTER in this gate does not list`);
      }
      for (const slug of EQUIPMENT_ROSTER) {
        if (!database.has(slug)) fail(5, `EQUIPMENT_ROSTER lists "${slug}", which no backend migration inserts`);
      }
    } else {
      notes.push('assertion 5: the backend migrations are not on disk beside this package — the roster was checked against the list written in this gate only');
    }
  }

  // ── 6 · one door, no blend mode ───────────────────────────────────────────────────────────
  const srcDir = path.join(root, 'src');
  const importsImage = new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\bnew\\s+URL\\s*\\(\\s*|\\bglob\\s*\\(\\s*\\[?\\s*|\\burl\\s*\\(\\s*)(['"\`]?)(?!data:|https?:)([^'"\`)\\s]*\\.(?:${IMAGE_EXT}))(?:\\?[^'"\`)\\s]*)?\\1`,
    'i',
  );
  const typeOnlySlots = /^\s*import\s+type\s+[^;]*?\bfrom\s+['"][^'"]*assets\/pulse\/(?:slots|navIcons)(?:\.ts)?['"]/;
  for (const file of existsSync(srcDir) ? await walk(srcDir) : []) {
    if (!TEXT_EXT.has(path.extname(file))) continue;
    const rel = posix(path.relative(root, file));
    const text = await fs.readFile(file, 'utf8');

    // Literal, comments included: `grep -r mix-blend- src` must stay empty, so a note may not
    // even quote the utility — which is also what keeps a commented-out blend from coming back.
    text.split(LF).forEach((line, index) => {
      if (line.includes('mix-blend-')) {
        fail(6, `${rel}:${index + 1} uses a blend mode (\`mix-blend-\`). A blended image shows its rectangle under any ancestor that forms a stacking context — the stills carry their own alpha, render them with <Pic>`);
      }
    });

    const insideDoor = DOOR_DIRS.some((dir) => rel.startsWith(dir));
    const code = blankComments(text).split(LF);
    code.forEach((line, index) => {
      if (rel !== URLS_FILE) {
        const m = importsImage.exec(line);
        if (m) {
          fail(6, `${rel}:${index + 1} references the image file "${m[2]}". Bundled rasters enter through ${URLS_FILE} only, and are drawn by <Pic>`);
        }
      }
      if (!insideDoor && line.includes('assets/pulse/') && !typeOnlySlots.test(line)) {
        fail(6, `${rel}:${index + 1} reaches into src/assets/pulse/. Import the folder itself (\`…/assets/pulse\`, its index.ts is the API) — or, in a file a gate imports into bare Node, a type from its slots.ts with \`import type\``);
      }
    });
  }

  // ── 7 · canvas, 8 · accent ────────────────────────────────────────────────────────────────
  let tokens = null;
  try {
    tokens = await fs.readFile(path.join(root, TOKENS_REL), 'utf8');
  } catch (error) {
    fail(7, `${TOKENS_REL} cannot be read: ${error.code ?? error.message}`);
    fail(8, `${TOKENS_REL} cannot be read: ${error.code ?? error.message}`);
  }
  if (tokens !== null) {
    const pairs = [
      [7, '--surface-0', 'canvas', 'every still was baked onto it: on another canvas the dark interior of each image shows as a box'],
      [8, '--accent', 'accent', 'the lit tab icons and the lit medal are pixels in that colour: a token cannot reach them, so a second lime would appear beside the first'],
    ];
    for (const [n, name, field, why] of pairs) {
      const baked = normaliseHex(manifest[field]);
      const declarations = declarationsOf(tokens, name);
      if (declarations.length === 0) {
        fail(n, `${TOKENS_REL} declares no ${name}`);
        continue;
      }
      // One line per assertion, however many blocks re-declare the token: every declaration counts
      // (a pack block that moves the canvas moves it under the same baked images).
      const opaque = declarations.filter((d) => !normaliseHex(d.value));
      const other = declarations.filter((d) => normaliseHex(d.value) && normaliseHex(d.value) !== baked);
      const list = (items) => items.map((d) => `${d.value} (line ${d.line})`).join(', ');
      if (opaque.length) {
        fail(n, `${TOKENS_REL} declares ${name} as ${list(opaque)} — not a plain hex colour, so it cannot be held to the "${field}" baked into the images (${manifest[field]})`);
      }
      if (other.length) {
        fail(n, `${TOKENS_REL} declares ${name} as ${list(other)}, but the images were baked with "${field}": "${manifest[field]}" (${MANIFEST_REL}) — ${why}. Change both and re-run \`npm run assets:pulse\``);
      }
    }
  }

  return { problems, notes, stats };
}

// ─── the probes ────────────────────────────────────────────────────────────────────────────────

/** Rewrite the value of a custom property — the first declaration, or all — never a mention in a comment. */
function replaceDeclaration(css, name, value, { all = false } = {}) {
  const code = blankComments(css);
  const re = new RegExp(`(?<![\\w-])${name}(\\s*:\\s*)([^;{}]+);`, 'g');
  const matches = [...code.matchAll(re)];
  let out = css;
  for (const m of (all ? matches : matches.slice(0, 1)).reverse()) {
    const start = m.index + name.length + m[1].length;
    out = `${out.slice(0, start)}${value}${out.slice(start + m[2].length)}`;
  }
  return out;
}

async function editFile(file, edit) {
  const before = await fs.readFile(file, 'utf8');
  const after = edit(before);
  if (after === before) throw new Error(`anchor not found in ${path.basename(file)}`);
  await fs.writeFile(file, after);
}

async function editManifest(root, edit) {
  const file = path.join(root, MANIFEST_REL);
  const manifest = await readJson(file);
  edit(manifest);
  await fs.writeFile(file, JSON.stringify(manifest, null, 2));
}

/**
 * Bring the lock in line with the sandbox, as a real re-export would.
 *
 * Without it every probe that touches a generated file would also trip assertion 1 ("not what the
 * script wrote"), and a probe that turns two assertions red does not prove the second one works.
 */
async function relock(root) {
  const manifest = await readJson(path.join(root, MANIFEST_REL));
  const file = path.join(root, LOCK_REL);
  const lock = await readJson(file);
  lock.recipe = recipeOf(manifest);
  lock.files = {};
  for (const name of (await fs.readdir(path.join(root, IMG_REL))).filter((n) => n.endsWith('.webp')).sort()) {
    const buffer = await fs.readFile(path.join(root, IMG_REL, name));
    lock.files[name] = { bytes: buffer.length, sha256: sha256(buffer) };
  }
  await fs.writeFile(file, JSON.stringify(lock, null, 2));
}

/*
 * The utility the first probe of assertion 6 plants — assembled, never spelled out.
 *
 * Tailwind scans every file of this package for class names, scripts included. Written as one word
 * here, the very utility this gate bans would be generated into the app's stylesheet by the gate
 * that bans it (measured: one `mix-blend-mode` rule in dist/assets/index-*.css, from this file).
 */
const BLEND_UTILITY = ['mix', 'blend', 'lighten'].join('-');

/** A NAV_TABS-shaped table as the shell lane found it: components, not keys. */
const NAV_COMPONENTS = { user: [{ to: '/', icon: () => null }, { to: '/settings', icon: () => null }] };
/** A NAV_TABS-shaped table with destination keys only. */
const navKeys = (...keys) => ({ user: keys.map((icon, i) => ({ key: `k${i}`, to: `/tab-${i}`, icon })) });
/** A NAV_TABS-shaped table in the state the real file is in: views, switch cells first, keys. */
const NAV_VIEWS = {
  user: [{ key: 'home', to: '/', icon: 'home' }, { key: 'profile', to: '/settings', icon: 'profile' }],
  trainer: [
    { kind: 'switch', key: 'switch-user', to: '/', view: 'user', icon: 'switch-user' },
    { key: 'plans', to: '/coach/plans', icon: 'plans' },
  ],
  admin: [
    { kind: 'switch', key: 'switch-user', to: '/', view: 'user', icon: 'switch-user' },
    { kind: 'switch', key: 'switch-trainer', to: '/coach', view: 'trainer', icon: 'switch-trainer' },
    { key: 'market', to: '/admin/marketplace', icon: 'market' },
  ],
};

/**
 * One planted defect per assertion (more where an assertion has several legs).
 *
 * Each runs against a COPY of the five inputs under the OS temp folder, so nothing here can leave
 * the working tree dirty — there is no restore step to get wrong. `plant` receives the sandbox root
 * and may return options for runChecks (a synthetic tab table).
 */
const PROBES = [
  {
    expect: 1,
    name: 'a -lit file deleted',
    plant: async (root) => {
      await fs.rm(path.join(root, IMG_REL, 'tab-home-lit-96.webp'));
    },
    also: [4],
  },
  {
    expect: 1,
    name: 'an orphan file dropped into img/',
    plant: async (root) => {
      await fs.copyFile(path.join(root, IMG_REL, 'coin-72.webp'), path.join(root, IMG_REL, 'coin-64.webp'));
    },
  },
  {
    expect: 1,
    name: 'an excluded source given a slot (portrait-coach.png)',
    plant: (root) =>
      editManifest(root, (manifest) => {
        manifest.slots['hero-portrait'] = { source: 'portrait-coach.png', family: 'hero', alpha: 'knee', widths: [464], quality: 80 };
      }),
  },
  {
    expect: 1,
    name: 'the manifest edited without a re-export (knee 32 -> 16)',
    plant: (root) =>
      editManifest(root, (manifest) => {
        manifest.knee = 16;
      }),
  },
  {
    expect: 1,
    name: 'an image edited by hand (one byte flipped)',
    plant: async (root) => {
      const file = path.join(root, IMG_REL, 'hero-grip-216.webp');
      const buffer = await fs.readFile(file);
      buffer[buffer.length - 1] ^= 0xff;
      await fs.writeFile(file, buffer);
    },
  },
  {
    expect: 2,
    name: 'a wrong height in slots.ts (figure-front)',
    plant: (root) =>
      editFile(path.join(root, PULSE_REL, 'slots.ts'), (text) =>
        text.replace(/('figure-front':\s*\{[^}]*?height:\s*)(\d+)/, (_, head, h) => `${head}${Number(h) + 25}`),
      ),
  },
  {
    expect: 2,
    name: 'a file holding the pixels of another width (coin-72 exported as coin-188)',
    plant: async (root) => {
      await fs.copyFile(path.join(root, IMG_REL, 'coin-72.webp'), path.join(root, IMG_REL, 'coin-188.webp'));
      await relock(root);
    },
  },
  {
    expect: 3,
    name: 'an export that came out too heavy (a hero over 100 kB, the folder over 1.0 MB)',
    plant: async (root) => {
      await fs.appendFile(path.join(root, IMG_REL, 'hero-plates-920.webp'), Buffer.alloc(300 * 1024, 7));
      await relock(root);
    },
  },
  {
    expect: 4,
    name: 'a tab icon that lost its lit flag (tab-coach in slots.ts)',
    plant: (root) =>
      editFile(path.join(root, PULSE_REL, 'slots.ts'), (text) => text.replace(/('tab-coach':\s*\{[^}]*?lit:\s*)true/, '$1false')),
    also: [1],
  },
  {
    expect: 4,
    name: 'enforced leg: a tab that names no raster key ("whistle")',
    plant: async (root) => {
      await editManifest(root, (manifest) => {
        manifest.navTabs.leg = 'enforced';
      });
      return { navTabs: navKeys('home', 'whistle') };
    },
  },
  {
    expect: 4,
    name: 'enforced leg: a tab that still carries a component',
    plant: async (root) => {
      await editManifest(root, (manifest) => {
        manifest.navTabs.leg = 'enforced';
      });
      return { navTabs: NAV_COMPONENTS };
    },
  },
  {
    expect: 4,
    name: 'pending leg left on after every tab took a key',
    plant: async (root) => {
      await editManifest(root, (manifest) => {
        manifest.navTabs.leg = 'pending';
      });
      return { navTabs: navKeys('home', 'training', 'profile') };
    },
  },
  {
    expect: 4,
    name: 'switch-has-lit: a switch key asks to light (navIcons.ts switch-user -> raster)',
    plant: (root) =>
      editFile(path.join(root, PULSE_REL, 'navIcons.ts'), (text) =>
        text.replace(/('switch-user':\s*\{[^}]*?lit:\s*)'none'/, "$1'raster'"),
      ),
  },
  {
    expect: 4,
    name: 'a switch cell that names a destination icon (profile)',
    plant: async () => ({
      navTabs: { ...NAV_VIEWS, trainer: [{ kind: 'switch', key: 'switch-user', to: '/', view: 'user', icon: 'profile' }, ...NAV_VIEWS.trainer.slice(1)] },
    }),
  },
  {
    expect: 4,
    name: 'a placeholder pointed at a slot that does not exist (desk -> hero-desk)',
    plant: (root) =>
      editFile(path.join(root, PULSE_REL, 'navIcons.ts'), (text) => text.replace(/(desk:\s*\{\s*slot:\s*)'hero-stopwatch'/, "$1'hero-desk'")),
  },
  {
    expect: 5,
    name: 'an equipment slug with no decision (kettlebell dropped from the still table)',
    plant: async (root) => {
      await editManifest(root, (manifest) => {
        delete manifest.equipmentStill.kettlebell;
      });
      await editFile(path.join(root, PULSE_REL, 'slots.ts'), (text) => text.replace(/^[ \t]*'?kettlebell'?:\s*'equip-kettlebell',?[ \t]*\r?\n/m, ''));
      await relock(root);
    },
  },
  {
    expect: 5,
    name: 'an equipment slug pointed at a hero (bench -> hero-plates)',
    plant: async (root) => {
      await editManifest(root, (manifest) => {
        manifest.equipmentStill.bench = 'hero-plates';
      });
      await editFile(path.join(root, PULSE_REL, 'slots.ts'), (text) => text.replace(/(^[ \t]*'?bench'?:\s*)'equip-bench'/m, "$1'hero-plates'"));
      await relock(root);
    },
  },
  {
    expect: 5,
    name: 'a new equipment slug in the database (a migration inserts "sled")',
    plant: async (root) => {
      const dir = path.join(root, '..', 'backend', 'src', 'db', 'migrations');
      await fs.mkdir(dir, { recursive: true });
      const rows = [...EQUIPMENT_ROSTER, 'sled'].map((slug, i) => `  ('${slug}','x','x',${(i + 1) * 10})`).join(`,${LF}`);
      await fs.writeFile(path.join(dir, '900_probe.sql'), `INSERT OR IGNORE INTO equipment (slug, name_en, name_hu, sort_order) VALUES${LF}${rows};${LF}`);
    },
  },
  {
    expect: 6,
    name: `${BLEND_UTILITY} added to a feature file`,
    plant: async (root) => {
      const dir = path.join(root, 'src', 'features', 'home');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'HomeProbe.tsx'), `export const Probe = () => <img className="${BLEND_UTILITY}" alt="" />;${LF}`);
    },
  },
  {
    expect: 6,
    name: 'an image file imported by a feature file',
    plant: async (root) => {
      const dir = path.join(root, 'src', 'features', 'home');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'HomeProbe.tsx'), `import hero from './hero.png';${LF}export const Probe = () => <img src={hero} alt="" />;${LF}`);
    },
  },
  {
    expect: 6,
    name: 'a feature file reaching into src/assets/pulse/',
    plant: async (root) => {
      const dir = path.join(root, 'src', 'features', 'home');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'HomeProbe.tsx'), `import { PULSE_URLS } from '../../assets/pulse/urls';${LF}export const probe = PULSE_URLS;${LF}`);
    },
  },
  {
    expect: 6,
    name: 'Pic importing an image itself, past urls.ts',
    plant: async (root) => {
      await fs.appendFile(path.join(root, 'src', 'ui', 'media', 'Pic.tsx'), `${LF}import stray from '../../assets/pulse/img/coin-72.webp';${LF}export const strayUrl = stray;${LF}`);
    },
  },
  {
    expect: 7,
    name: '--surface-0 changed alone',
    plant: (root) => editFile(path.join(root, TOKENS_REL), (css) => replaceDeclaration(css, '--surface-0', '#101010')),
  },
  {
    expect: 8,
    name: '--accent changed alone',
    plant: (root) => editFile(path.join(root, TOKENS_REL), (css) => replaceDeclaration(css, '--accent', '#FF5A1F')),
  },
  {
    expect: 8,
    name: 'the baked accent changed alone (assets.json)',
    plant: (root) =>
      editManifest(root, (manifest) => {
        manifest.accent = '#FF5A1F';
      }),
    also: [1],
  },
];

/** Copy the five inputs of the gate — and nothing else — into a fresh folder. */
async function buildSandbox(sourceRoot, sandbox) {
  const copies = ['assets-src/pulse', PULSE_REL, 'src/ui/media'];
  for (const rel of copies) {
    await fs.cp(path.join(sourceRoot, rel), path.join(sandbox, rel), { recursive: true });
  }
  await fs.mkdir(path.dirname(path.join(sandbox, TOKENS_REL)), { recursive: true });
  await fs.copyFile(path.join(sourceRoot, TOKENS_REL), path.join(sandbox, TOKENS_REL));
}

/**
 * The sandbox must start green, or a probe proves nothing. Where the real tokens.css is not yet on
 * the Pulse canvas and accent (a tree before the colour switch), the COPY is brought there and the
 * run says so — the probes test the gate, not the state of the branch.
 */
async function alignSandboxTokens(sandbox) {
  const manifest = await readJson(path.join(sandbox, MANIFEST_REL));
  const file = path.join(sandbox, TOKENS_REL);
  const before = await fs.readFile(file, 'utf8');
  let after = before;
  for (const [name, value] of [['--surface-0', manifest.canvas], ['--accent', manifest.accent]]) {
    after = replaceDeclaration(after, name, value, { all: true });
  }
  if (after !== before) await fs.writeFile(file, after);
  return after !== before;
}

async function runProbes() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'check-assets-probe-'));
  const rows = [];
  let ok = true;
  let aligned = false;
  try {
    // The control: an untouched copy must pass, with a tab table in the shape the real one has.
    const control = path.join(base, 'control', 'frontend');
    await buildSandbox(FRONTEND_ROOT, control);
    aligned = await alignSandboxTokens(control);
    const green = await runChecks({ root: control, navTabs: NAV_VIEWS });
    rows.push(['control', 'an untouched copy', 'green', green.problems.length === 0 ? 'green' : `RED: ${green.problems[0].message}`]);
    if (green.problems.length) ok = false;

    for (const [index, probe] of PROBES.entries()) {
      const root = path.join(base, `probe-${index + 1}`, 'frontend');
      await buildSandbox(FRONTEND_ROOT, root);
      await alignSandboxTokens(root);
      let result;
      try {
        const options = (await probe.plant(root)) ?? {};
        const run = await runChecks({ root, navTabs: NAV_VIEWS, ...options });
        const red = [...new Set(run.problems.map((p) => p.n))].sort();
        const allowed = new Set([probe.expect, ...(probe.also ?? [])]);
        const stray = red.filter((n) => !allowed.has(n));
        if (!red.includes(probe.expect)) result = `NOT CAUGHT (red: ${red.join(', ') || 'nothing'})`;
        else if (stray.length) result = `caught, but assertion ${stray.join(', ')} went red too`;
        else result = `red: ${red.join(' + ')}`;
        if (!result.startsWith('red')) ok = false;
      } catch (error) {
        result = `PROBE BROKEN: ${error.message}`;
        ok = false;
      }
      rows.push([`${probe.expect} ${ASSERTIONS[probe.expect - 1][1]}`, probe.name, `red: ${probe.expect}`, result]);
    }
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }

  const width = (i) => Math.max(...rows.map((r) => r[i].length));
  console.log(`check-assets --probe: ${PROBES.length} planted defects + 1 control, each in its own copy under the OS temp folder${LF}`);
  for (const row of rows) {
    console.log(`  ${row[0].padEnd(width(0))}  ${row[1].padEnd(width(1))}  ${row[3]}`);
  }
  if (aligned) {
    console.log(`${LF}  note: tokens.css of this tree is not on the baked canvas / accent yet; the COPIES were aligned first, so the probes start from green.`);
  }
  const covered = new Set(PROBES.map((p) => p.expect));
  const uncovered = ASSERTIONS.filter(([n]) => !covered.has(n));
  if (uncovered.length) {
    ok = false;
    console.log(`${LF}  assertion(s) with no probe: ${uncovered.map(([n, id]) => `${n} ${id}`).join(', ')}`);
  }
  console.log(`${LF}check-assets --probe: ${ok ? 'OK — every planted defect turned its assertion red, the control stayed green, the working tree was never touched' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}

// ─── main ──────────────────────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--probe')) {
    await runProbes();
    return;
  }

  let navTabs;
  let navTabsError;
  try {
    ({ NAV_TABS: navTabs } = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'src', 'app', 'navTabs.ts')).href));
  } catch (error) {
    navTabsError = error.message.split(LF)[0];
  }

  const { problems, notes, stats } = await runChecks({ root: FRONTEND_ROOT, navTabs, navTabsError });

  if (problems.length) {
    console.error(`check-assets: ${problems.length} problem(s)${LF}`);
    for (const p of problems) console.error(`  [${p.n} ${p.id}] ${p.message}`);
    console.error(LF);
    process.exit(1);
  }

  const share = ((stats.bytes / FOLDER_CAP) * 100).toFixed(1);
  console.log(
    `check-assets: OK — ${stats.files} files from ${stats.sources} sources, ${fmt(stats.bytes)} B of ${fmt(FOLDER_CAP)} (${share} %), ` +
      `${ASSERTIONS.length} assertions`,
  );
  for (const note of notes) console.log(`  ${note}`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked && (process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self)) {
  await main();
}
