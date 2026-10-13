#!/usr/bin/env node
// scripts/build-pulse-assets.mjs — the PNG masters of the Pulse images → the committed WebP set.
//
// ═══ WHAT IT IS ════════════════════════════════════════════════════════════════════════════════
//
// An AUTHORING step, not a build step. It is run by hand when a master or assets.json changes:
//
//     npm run assets:pulse -- --src <absolute folder of the PNG masters>
//
// It reads   assets-src/pulse/assets.json            the slot table, the canvas, the accent, the knee
// and writes src/assets/pulse/img/<slot>-<w>.webp     every density of every slot (+ `-lit-` twins)
//            src/assets/pulse/slots.ts                pure TypeScript — a gate can import it
//            src/assets/pulse/urls.ts                 the one file that imports the images
//            assets-src/pulse/assets.lock.json        what was written, so the gate can tell
//
// The outputs are committed; `npm run build` never runs this and needs no image library.
// `check:assets` then holds manifest, modules, files and tokens.css to each other.
//
// ═══ WHY THE MASTERS ARE AN ARGUMENT ═══════════════════════════════════════════════════════════
//
// The 49 PNG masters (11 MB) are not in the repository: it is public, and they are AI-generated
// images whose usage terms have not been checked. So `--src` has no default — the folder is
// wherever the person running this keeps the archive (`5-pulse/kepek`).
//
// ═══ WHY SHARP IS BORROWED ═════════════════════════════════════════════════════════════════════
//
// `sharp` is a dependency of the backend, not of this package, and one authoring script does not
// earn a second 30 MB native install. It is loaded with `createRequire` from a checkout whose
// backend/node_modules exists: by default the MAIN checkout (a git worktree has no node_modules of
// its own — it is resolved from the git common dir), or the one named by `--sharp-from`. That is a
// module read. No backend file is run or touched.
//
// ═══ THE TWO OPERATIONS ════════════════════════════════════════════════════════════════════════
//
// 1. KNEE ALPHA, for every still shot on true black (figures, heroes, equipment). Design sets these
//    to "lighten" so no rectangle shows. In a browser a blended image shows its rectangle under any
//    ancestor that forms a stacking context — a transform, an opacity, a sticky header — so the
//    blend is baked into the file instead. Per pixel, with the canvas C and the knee K:
//
//        lit   = max(pixel, C)                          what lighten would show on the canvas
//        alpha = clamp(max over channels of (pixel − C) / K, 0, 1)
//        rgb   = C + (lit − C) / alpha                  (C where alpha is 0)
//
//    Over the canvas, alpha·rgb + (1 − alpha)·C = lit — the approved picture, exactly, before
//    compression. A pixel at or below the canvas is fully transparent, so the source's #000 is never
//    painted; and rgb never exceeds C + K where alpha < 1, so a faint pixel cannot carry a bright
//    colour for a lossy codec to smear into a fringe.
//
// 2. THE LIT RASTER of a tab icon or the medal. It is not a second render: it is the idle icon's
//    master pushed through a one-dimensional ramp of the accent (shadows deep olive, mids the accent
//    itself, highlights almost white). The ramp lives here, `accentRamp`, with the accent of
//    assets.json as its only parameter — and every lit master is CHECKED against it: each visible
//    pixel must be one of the ramp's 256 colours. So "accent" in assets.json is not a label. Change
//    it alone and this script stops, naming the masters that are still in the old colour.
//
//    A future pack therefore needs a re-tint of eight masters (the ramp is invertible: a lit pixel
//    names its own step), not a new render. That re-tint is deliberately not built yet — one look
//    ships (owner decision D1).
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  FOLDER_CAP,
  FRONTEND_ROOT,
  IMG_REL,
  LOCK_REL,
  MANIFEST_REL,
  PULSE_REL,
  capFor,
  expectedFiles,
  hexToRgb,
  recipeOf,
  tabIconKeysOf,
  validateManifest,
  variantHeight,
} from './check-assets.mjs';

const LF = String.fromCharCode(10);
const fmt = (n) => n.toLocaleString('en-US');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function stop(message) {
  console.error(`build-pulse-assets: ${message}`);
  process.exit(1);
}

// ─── arguments ─────────────────────────────────────────────────────────────────────────────────

const USAGE = [
  'Usage: node scripts/build-pulse-assets.mjs --src <absolute folder of the PNG masters> [--sharp-from <checkout>]',
  '',
  '  --src         REQUIRED. The folder that holds the PNG masters named in assets-src/pulse/assets.json',
  '                (the archive folder 5-pulse/kepek). The masters are not in the repository.',
  '  --sharp-from  A checkout whose backend/node_modules is installed — the folder that CONTAINS',
  '                backend/. Default: the main checkout of this repository (found through git).',
].join(LF);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--src' || arg === '--sharp-from') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) stop(`${arg} needs a folder after it.${LF}${LF}${USAGE}`);
      args[arg === '--src' ? 'src' : 'sharpFrom'] = value;
      i += 1;
    } else stop(`unknown argument "${arg}".${LF}${LF}${USAGE}`);
  }
  return args;
}

/** The main checkout of this repository: a worktree's `--git-common-dir` is <main>/.git. */
function mainCheckout() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: FRONTEND_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return common ? path.dirname(common) : null;
  } catch {
    return null;
  }
}

function loadSharp(sharpFrom) {
  const checkout = sharpFrom ? path.resolve(sharpFrom) : mainCheckout();
  const how = sharpFrom ? '--sharp-from' : 'the main checkout of this repository (found through git)';
  const hint =
    `${LF}  sharp is not a dependency of the frontend. This script borrows it from a checkout whose` +
    `${LF}  backend/node_modules is installed. Pass --sharp-from <the folder that contains backend/>,` +
    `${LF}  or run \`npm ci\` in that checkout's backend/ folder.`;
  if (!checkout) stop(`sharp was not found: this is not a git checkout, so there is no main checkout to borrow it from.${hint}`);
  const manifest = path.join(checkout, 'backend', 'package.json');
  if (!existsSync(manifest)) stop(`sharp was not found: ${how} is ${checkout}, and it has no backend/package.json.${hint}`);
  try {
    return createRequire(manifest)('sharp');
  } catch (error) {
    return stop(`sharp was not found in ${path.join(checkout, 'backend', 'node_modules')} (${error.code ?? error.message}).${hint}`);
  }
}

// ─── the two operations ────────────────────────────────────────────────────────────────────────

/** True-black still (RGB, 3 bytes a pixel) → RGBA whose composite over the canvas equals `lighten`. */
function kneeAlpha(rgb, canvas, knee) {
  const out = Buffer.alloc((rgb.length / 3) * 4);
  for (let i = 0, o = 0; i < rgb.length; i += 3, o += 4) {
    let over = 0;
    for (let c = 0; c < 3; c += 1) over = Math.max(over, rgb[i + c] - canvas[c]);
    const alpha = Math.min(1, Math.max(0, over / knee));
    for (let c = 0; c < 3; c += 1) {
      const lit = Math.max(rgb[i + c], canvas[c]);
      out[o + c] = alpha > 0 ? Math.min(255, Math.round(canvas[c] + (lit - canvas[c]) / alpha)) : canvas[c];
    }
    out[o + 3] = Math.round(alpha * 255);
  }
  return out;
}

/** Python's `round`: half to even. The approved lit masters were made with it, and are held to it. */
const roundHalfEven = (x) => {
  const floor = Math.floor(x);
  const rest = x - floor;
  if (rest > 0.5) return floor + 1;
  if (rest < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
};

/**
 * Luminance step (0-255) → the lit colour, for one accent.
 *
 *   t < 0.6   accent × (0.22 + 0.78 · (t / 0.6)^0.85)            shadows deep olive → the accent
 *   t ≥ 0.6   accent + (255 − accent) · 0.75 · (t − 0.6) / 0.4   highlights → almost white
 */
function accentRamp(accent) {
  const ramp = [];
  for (let step = 0; step < 256; step += 1) {
    const t = step / 255;
    ramp.push(
      accent.map((channel) =>
        t < 0.6
          ? roundHalfEven(channel * (0.22 + 0.78 * (t / 0.6) ** 0.85))
          : roundHalfEven(channel + (255 - channel) * 0.75 * ((t - 0.6) / 0.4)),
      ),
    );
  }
  return ramp;
}

// ─── generated modules ─────────────────────────────────────────────────────────────────────────

const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

function slotsModule(manifest, sizes) {
  const lines = [];
  lines.push('// GENERATED by scripts/build-pulse-assets.mjs from assets-src/pulse/assets.json — do not edit.');
  lines.push('//');
  lines.push('// Pure TypeScript on purpose: no image import and no colour literal. So a build gate can import');
  lines.push('// it into bare Node (check-assets does), and app/navTabs.ts — which gates import too — can take');
  lines.push('// its icon key type from here with `import type`.');
  lines.push('');
  lines.push("export type PulseFamily = 'icon' | 'object' | 'equipment' | 'figure' | 'hero' | 'texture';");
  lines.push('');
  lines.push('export interface PulseSlotMeta {');
  lines.push('  family: PulseFamily;');
  lines.push('  /** Intrinsic pixel size of the LARGEST variant; every variant has this aspect ratio. */');
  lines.push('  width: number;');
  lines.push('  height: number;');
  lines.push('  /** Pixel widths that exist on disk, ascending: img/<slot>-<width>.webp */');
  lines.push('  widths: readonly number[];');
  lines.push('  /** True when a second, lit raster exists: img/<slot>-lit-<width>.webp */');
  lines.push('  lit: boolean;');
  lines.push('}');
  lines.push('');
  lines.push('export const PULSE_SLOTS = {');
  for (const [slot, spec] of Object.entries(manifest.slots)) {
    const { width, height } = sizes[slot];
    lines.push(
      `  '${slot}': { family: '${spec.family}', width: ${width}, height: ${height}, widths: [${spec.widths.join(', ')}], lit: ${Boolean(spec.litSource)} },`,
    );
  }
  lines.push('} as const satisfies Record<string, PulseSlotMeta>;');
  lines.push('');
  lines.push('export type PulseSlot = keyof typeof PULSE_SLOTS;');
  lines.push('');
  lines.push('/** The slots that have a lit raster — the only ones `<Pic lit>` accepts. */');
  lines.push('export type PulseLitSlot = {');
  lines.push("  [K in PulseSlot]: (typeof PULSE_SLOTS)[K]['lit'] extends true ? K : never;");
  lines.push('}[PulseSlot];');
  lines.push('');
  lines.push('/** The tab bar keys: `tab-<key>` is the slot. app/navTabs.ts names one per tab. */');
  lines.push(`export const TAB_ICON_KEYS = [${tabIconKeysOf(manifest).map((k) => `'${k}'`).join(', ')}] as const;`);
  lines.push('export type TabIconKey = (typeof TAB_ICON_KEYS)[number];');
  lines.push('');
  lines.push('/**');
  lines.push(' * Every equipment slug the database knows → its still, or null (a text-only row).');
  lines.push(' * One table: a list row never guesses, and never draws a placeholder.');
  lines.push(' */');
  lines.push('export const EQUIPMENT_STILL: Readonly<Record<string, PulseSlot | null>> = {');
  for (const [slug, slot] of Object.entries(manifest.equipmentStill)) {
    lines.push(`  '${slug}': ${slot === null ? 'null' : `'${slot}'`},`);
  }
  lines.push('};');
  lines.push('');
  return lines.join(LF);
}

function urlsModule(manifest) {
  const lines = [];
  lines.push('// GENERATED by scripts/build-pulse-assets.mjs from assets-src/pulse/assets.json — do not edit.');
  lines.push('//');
  lines.push('// The ONE file that imports the Pulse images (check:assets holds that). Vite gives every import');
  lines.push('// a hashed URL, so a changed image is a new URL and the service worker can never serve a stale');
  lines.push('// one. Vite-only: a gate that runs in bare Node imports slots.ts, never this file.');
  lines.push("import type { PulseSlot } from './slots';");
  for (const { file } of expectedFiles(manifest)) {
    lines.push(`import ${camel(file.replace(/\.webp$/, ''))} from './img/${file}';`);
  }
  lines.push('');
  lines.push('/** [pixel width, URL], ascending by width. */');
  lines.push('export type PulseVariants = readonly (readonly [width: number, url: string])[];');
  lines.push('');
  lines.push('export const PULSE_URLS = {');
  for (const [slot, spec] of Object.entries(manifest.slots)) {
    const list = (lit) => `[${spec.widths.map((w) => `[${w}, ${camel(`${slot}${lit ? '-lit' : ''}-${w}`)}]`).join(', ')}]`;
    lines.push(`  '${slot}': { idle: ${list(false)}${spec.litSource ? `, lit: ${list(true)}` : ''} },`);
  }
  lines.push('} as const satisfies Record<PulseSlot, { idle: PulseVariants; lit?: PulseVariants }>;');
  lines.push('');
  return lines.join(LF);
}

// ─── main ──────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!args.src) {
    stop(
      `--src is missing: the folder of the PNG masters.${LF}` +
        `  The masters are not in the repository (11 MB, AI-generated, terms unchecked); they live in the${LF}` +
        `  design archive, folder 5-pulse/kepek. Nothing was written.${LF}${LF}${USAGE}`,
    );
  }
  if (!path.isAbsolute(args.src)) stop(`--src must be an absolute folder, found "${args.src}". Nothing was written.`);
  if (!existsSync(args.src)) stop(`--src "${args.src}" does not exist. Nothing was written.`);

  const manifestFile = path.join(FRONTEND_ROOT, MANIFEST_REL);
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  const invalid = validateManifest(manifest);
  if (invalid.length) stop(`${MANIFEST_REL} is not valid:${LF}${invalid.map((m) => `  ${m}`).join(LF)}`);

  const missing = [];
  for (const [slot, spec] of Object.entries(manifest.slots)) {
    for (const file of [spec.source, spec.litSource].filter(Boolean)) {
      if (!existsSync(path.join(args.src, file))) missing.push(`  ${file}  (slot "${slot}")`);
    }
  }
  if (missing.length) stop(`${missing.length} master(s) named in ${MANIFEST_REL} are not in ${args.src}:${LF}${missing.join(LF)}${LF}Nothing was written.`);

  const sharp = loadSharp(args.sharpFrom);
  // One image at a time and no cache: this runs on the machine somebody is working on.
  sharp.cache(false);
  sharp.concurrency(1);

  const canvas = hexToRgb(manifest.canvas);
  const accent = hexToRgb(manifest.accent);
  const ramp = new Set(accentRamp(accent).map(([r, g, b]) => (r << 16) | (g << 8) | b));

  const outputs = new Map(); // file name → Buffer
  const sizes = {}; // slot → { width, height } of the largest variant
  const sourceInfo = {};
  const problems = [];

  const describe = async (file) => {
    const buffer = await fs.readFile(path.join(args.src, file));
    sourceInfo[file] = { bytes: buffer.length, sha256: sha256(buffer) };
    return buffer;
  };

  for (const [slot, spec] of Object.entries(manifest.slots)) {
    const master = await describe(spec.source);
    const meta = await sharp(master).metadata();
    const largest = Math.max(...spec.widths);
    if (largest > meta.width) {
      problems.push(`slot "${slot}": widest variant ${largest} px is wider than its master ${spec.source} (${meta.width} px) — never upscale`);
      continue;
    }
    const height = variantHeight(largest, meta.width, meta.height);
    sizes[slot] = { width: largest, height };

    if (spec.alpha === 'keep' && !meta.hasAlpha) problems.push(`slot "${slot}": alpha is "keep" but ${spec.source} has no alpha channel`);

    let litMaster = null;
    if (spec.litSource) {
      litMaster = await describe(spec.litSource);
      const idle = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const lit = await sharp(litMaster).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (idle.info.width !== lit.info.width || idle.info.height !== lit.info.height) {
        problems.push(`slot "${slot}": ${spec.litSource} is ${lit.info.width} x ${lit.info.height}, ${spec.source} is ${idle.info.width} x ${idle.info.height} — the pair must overlap exactly`);
      } else {
        let offRamp = 0;
        let alphaDiffers = 0;
        let visible = 0;
        for (let i = 0; i < lit.data.length; i += 4) {
          if (lit.data[i + 3] !== idle.data[i + 3]) alphaDiffers += 1;
          if (lit.data[i + 3] === 0) continue;
          visible += 1;
          if (!ramp.has((lit.data[i] << 16) | (lit.data[i + 1] << 8) | lit.data[i + 2])) offRamp += 1;
        }
        if (offRamp > 0) {
          problems.push(
            `slot "${slot}": ${fmt(offRamp)} of ${fmt(visible)} visible pixels of ${spec.litSource} are not on the ramp of the accent ${manifest.accent}. ` +
              `The lit raster is pixels in the accent: either "accent" in ${MANIFEST_REL} is not the colour this master was tinted with, or the master must be re-tinted`,
          );
        }
        if (alphaDiffers > 0) {
          problems.push(`slot "${slot}": ${spec.litSource} and ${spec.source} differ in ${fmt(alphaDiffers)} alpha values — a lit raster is a tint of the SAME cut-out`);
        }
      }
    }

    for (const width of spec.widths) {
      const h = variantHeight(width, largest, height);
      const resize = { width, height: h, fit: 'fill', kernel: 'lanczos3' };
      const webp = { quality: spec.quality, alphaQuality: 100, effort: 6 };

      if (spec.alpha === 'knee') {
        const { data, info } = await sharp(master).removeAlpha().resize(resize).raw().toBuffer({ resolveWithObject: true });
        const rgba = kneeAlpha(data, canvas, manifest.knee);
        // The whole point of the bake: the outer ring must be fully transparent, or the still has
        // an edge — and an edge on a canvas of the same colour is exactly the box nobody may see.
        let ring = 0;
        for (let x = 0; x < info.width; x += 1) {
          ring = Math.max(ring, rgba[x * 4 + 3], rgba[((info.height - 1) * info.width + x) * 4 + 3]);
        }
        for (let y = 0; y < info.height; y += 1) {
          ring = Math.max(ring, rgba[y * info.width * 4 + 3], rgba[(y * info.width + info.width - 1) * 4 + 3]);
        }
        if (ring > 0) {
          problems.push(`slot "${slot}" at ${width} px: the outer pixel ring is not fully transparent (alpha up to ${ring} of 255) — ${spec.source} does not fade to black at its edge and would show as a rectangle`);
        }
        outputs.set(
          `${slot}-${width}.webp`,
          await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).webp(webp).toBuffer(),
        );
      } else if (spec.alpha === 'keep') {
        outputs.set(`${slot}-${width}.webp`, await sharp(master).ensureAlpha().resize(resize).webp(webp).toBuffer());
        if (litMaster) {
          outputs.set(`${slot}-lit-${width}.webp`, await sharp(litMaster).ensureAlpha().resize(resize).webp(webp).toBuffer());
        }
      } else {
        outputs.set(`${slot}-${width}.webp`, await sharp(master).removeAlpha().resize(resize).webp({ quality: spec.quality, effort: 6 }).toBuffer());
      }
    }
  }

  if (problems.length) stop(`${problems.length} problem(s), nothing was written:${LF}${problems.map((p) => `  ${p}`).join(LF)}`);

  // Everything is in memory and judged; only now does the tree change.
  const expected = expectedFiles(manifest);
  const imgDir = path.join(FRONTEND_ROOT, IMG_REL);
  await fs.mkdir(imgDir, { recursive: true });
  const removed = [];
  for (const name of await fs.readdir(imgDir)) {
    if (name.endsWith('.webp') && !outputs.has(name)) {
      await fs.rm(path.join(imgDir, name));
      removed.push(name);
    }
  }
  for (const [name, buffer] of outputs) await fs.writeFile(path.join(imgDir, name), buffer);
  await fs.writeFile(path.join(FRONTEND_ROOT, PULSE_REL, 'slots.ts'), slotsModule(manifest, sizes));
  await fs.writeFile(path.join(FRONTEND_ROOT, PULSE_REL, 'urls.ts'), urlsModule(manifest));

  const total = [...outputs.values()].reduce((sum, b) => sum + b.length, 0);
  const lock = {
    about:
      'GENERATED by scripts/build-pulse-assets.mjs — do not edit. What the last export read and wrote: check:assets uses "recipe" to tell that assets.json has not changed since, and "files" to tell that no image was replaced by hand. "sources" records which masters (they are not in the repository) the files came from.',
    recipe: recipeOf(manifest),
    tool: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, webp: sharp.versions.webp },
    totalBytes: total,
    sources: Object.fromEntries(Object.keys(sourceInfo).sort().map((k) => [k, sourceInfo[k]])),
    files: Object.fromEntries(expected.map(({ file }) => [file, { bytes: outputs.get(file).length, sha256: sha256(outputs.get(file)) }])),
  };
  await fs.writeFile(path.join(FRONTEND_ROOT, LOCK_REL), `${JSON.stringify(lock, null, 2)}${LF}`);

  // ── the table (assets note §3.2) ──────────────────────────────────────────────────────────
  const families = new Map();
  const overCap = [];
  for (const { file, slot } of expected) {
    const family = manifest.slots[slot].family;
    const bytes = outputs.get(file).length;
    const row = families.get(family) ?? { files: 0, bytes: 0, largest: ['', 0] };
    row.files += 1;
    row.bytes += bytes;
    if (bytes > row.largest[1]) row.largest = [file, bytes];
    families.set(family, row);
    if (bytes > capFor(slot, family)) overCap.push(`${file} ${fmt(bytes)} B > ${fmt(capFor(slot, family))} B`);
  }
  console.log(`build-pulse-assets: ${Object.keys(sourceInfo).length} sources -> ${outputs.size} files, ${fmt(total)} B of ${fmt(FOLDER_CAP)} (${((total / FOLDER_CAP) * 100).toFixed(1)} %)${LF}`);
  console.log(`  ${'family'.padEnd(10)} ${'files'.padStart(5)} ${'bytes'.padStart(9)}   largest`);
  for (const [family, row] of families) {
    console.log(`  ${family.padEnd(10)} ${String(row.files).padStart(5)} ${fmt(row.bytes).padStart(9)}   ${row.largest[0]} ${fmt(row.largest[1])} B`);
  }
  console.log('');
  for (const { file, slot, width } of expected) {
    const { width: w, height: h } = sizes[slot];
    console.log(`  ${file.padEnd(34)} ${String(width).padStart(4)} x ${String(variantHeight(width, w, h)).padEnd(5)} ${fmt(outputs.get(file).length).padStart(8)} B`);
  }
  console.log('');
  console.log(`  canvas ${manifest.canvas} · accent ${manifest.accent} · knee ${manifest.knee} · sharp ${sharp.versions.sharp} (libvips ${sharp.versions.vips}, libwebp ${sharp.versions.webp})`);
  console.log('  lit rasters: every visible pixel of every lit master is on the ramp of the accent; each shares its idle twin’s alpha');
  console.log('  knee stills: the outer pixel ring of every variant is fully transparent');
  if (removed.length) console.log(`  removed ${removed.length} file(s) no slot writes any more: ${removed.join(', ')}`);
  if (overCap.length || total > FOLDER_CAP) {
    console.log(`${LF}  OVER BUDGET — check:assets will fail:${LF}${overCap.map((o) => `    ${o}`).join(LF)}${total > FOLDER_CAP ? `${LF}    folder ${fmt(total)} B > ${fmt(FOLDER_CAP)} B` : ''}`);
  }
  console.log(`${LF}  wrote ${IMG_REL}/, ${PULSE_REL}/slots.ts, ${PULSE_REL}/urls.ts, ${LOCK_REL}`);
  console.log('  next: npm run check:assets — then LOOK at the files over the canvas before committing them.');
}

await main();
