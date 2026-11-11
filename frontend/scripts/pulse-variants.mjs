#!/usr/bin/env node
// scripts/pulse-variants.mjs — the one writer of the element catalogue's `live` flags (PLAN.md 4.4, item 3).
//
// Pulse has one look per feedback element (R11). A component that stops reading its variant letter
// has to say so in two places at once — `live: false` in `ui/feedback/catalog.ts` and a reason in
// `scripts/data/elements-dormant.json` — or `check:elements` fails in one direction or the other.
// Both files are the integrator's, so the change travels as a hand-in file:
//
//   docs/pipeline/pulse/pkg/<id>/variants.json
//   [ { "element": "E21", "live": false, "reason": "one Pulse look; tap, as the database serves" } ]
//
//   node scripts/pulse-variants.mjs check  [<id>] [--ref <ref>] [--json]
//   node scripts/pulse-variants.mjs apply  [<id>] [--ref <ref>] [--merge]
//   node scripts/pulse-variants.mjs revert
//
// `<id>` is a package, a lane or a lane stage; without it the id is read from the branch name.
//
// What `check` refuses:
//   - an element that is not in the unit's `variantElements` in work-packages.json;
//   - a delta whose `useElementVariant` read is not in a file the unit owns (R11) — asked of the
//     gate's own reader scan (`scanElementReads`, exported by check-element-roster.mjs), run over
//     pulse-redesign, where the read still is. The one written exception is a unit whose entry
//     carries a `variantNote` (F2: the gate RULE changes) for elements the scan itself calls
//     playground-only;
//   - an element the catalogue does not list, or that is not live any more (a stale delta);
//   - anything `check:elements` itself rejects: the gate is RUN on a scratch copy of the branch
//     with the delta applied, and its verdict is the verdict (R31 — no rule of it is repeated).
//
// Exit: 0 ok, 1 refused, 2 usage, 3 blocked on the gate export. Not in the build chain.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readGateData, writeGateData } from './data/gate-data.mjs';
import {
  BASE_BRANCH,
  callGateExport,
  gateExports,
  isMain,
  loadModel,
  matchesAny,
  materialize,
  ownersOf,
  readApplied,
  readBlob,
  readHandIn,
  refExists,
  scratchCheckout,
  sha256,
  tree,
  unitFromArgs,
  writeApplied,
  writeFileAtomic,
} from './pulse-owns-check.mjs';

const CATALOG = 'frontend/src/ui/feedback/catalog.ts';
const DORMANT_FILE = 'frontend/scripts/data/elements-dormant.json';
const HAND_IN = 'variants.json';
const TARGETS = [CATALOG, DORMANT_FILE];

/* ── the catalogue, as text ───────────────────────────────────────────────────────────────────── */

/** The span of one element's row: from its `id: 'E…'` to the next row's (or the end of the list). */
function rowSpan(text, element) {
  const start = new RegExp(`id: '${element}'(?!\\d)`).exec(text);
  if (!start) return null;
  const next = /id: 'E\d+'/.exec(text.slice(start.index + 1));
  return { from: start.index, to: next ? start.index + 1 + next.index : text.length };
}

/** `true` / `false` as the catalogue has it, or null when the element has no row. */
export function liveFlag(text, element) {
  const span = rowSpan(text, element);
  const m = span && /\blive: (true|false)\b/.exec(text.slice(span.from, span.to));
  return m ? m[1] === 'true' : null;
}

/** Flip one row to `live: false`, touching nothing else — not a space, not a line ending. */
export function setNotLive(text, element) {
  const span = rowSpan(text, element);
  const row = text.slice(span.from, span.to);
  return text.slice(0, span.from) + row.replace(/\blive: true\b/, 'live: false') + text.slice(span.to);
}

/* ── check ────────────────────────────────────────────────────────────────────────────────────── */

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const toRepoPath = (file) => {
  const f = file.split(path.sep).join('/');
  if (f.startsWith('frontend/')) return f;
  return f.startsWith('src/') ? `frontend/${f}` : `frontend/src/${f}`;
};

/** The gate's reader scan over a scratch checkout of a ref: `{ reads, playgroundOnly }`. */
function readsAt(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-variants-scan-')).split(path.sep).join('/');
  try {
    materialize(ref, ['frontend/src'], dir);
    const raw = callGateExport('check-element-roster.mjs', 'scanElementReads', `${dir}/frontend`);
    return { reads: (raw.reads ?? []).map((r) => ({ ...r, file: toRepoPath(r.file) })), playgroundOnly: new Set(raw.playgroundOnly ?? []) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Run `check-element-roster` itself on a scratch copy of the branch with the delta applied. */
async function gateDryRun(unit, ref, deltas) {
  const { front, note, dispose } = scratchCheckout(unit, ref, 'variants-dryrun');
  try {
    const file = `${front}/src/ui/feedback/catalog.ts`;
    let text = fs.readFileSync(file, 'utf8');
    for (const d of deltas) text = setNotLive(text, d.element);
    fs.writeFileSync(file, text);
    const data = await import(pathToFileURL(`${front}/scripts/data/gate-data.mjs`).href);
    const dormant = data.readGateData('elements-dormant');
    for (const d of deltas) dormant.set(d.element, d.reason);
    data.writeGateData('elements-dormant', dormant);
    const r = spawnSync(process.execPath, ['scripts/check-element-roster.mjs'], { cwd: front, encoding: 'utf8', windowsHide: true });
    const lines = `${r.stdout}\n${r.stderr}`.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim() !== '');
    return { ok: r.status === 0, lines, note };
  } finally {
    dispose();
  }
}

/** `{ id, ref, deltas, path, blob, problems, blocked, notes }` for the variants hand-in of a unit at a ref. */
export async function checkDeltas(unit, model, { ref = unit.branch } = {}) {
  const out = { id: unit.raw, ref, deltas: null, path: null, blob: null, problems: [], blocked: [], notes: [] };
  if (!refExists(ref)) {
    out.problems.push(`${ref} does not exist — the hand-in file is read from the branch HEAD (pending means committed)`);
    return out;
  }
  const handIn = readHandIn(unit, HAND_IN, ref);
  if (!handIn) {
    out.notes.push(`${ref} carries no ${HAND_IN} — nothing to apply`);
    return out;
  }
  out.path = handIn.path;
  out.blob = sha256(handIn.text);
  let deltas;
  try {
    deltas = JSON.parse(handIn.text);
  } catch (err) {
    out.problems.push(`${handIn.path} is not valid JSON — ${err.message}`);
    return out;
  }
  if (!Array.isArray(deltas)) {
    out.problems.push(`${handIn.path} must be an array of { element, live: false, reason }`);
    return out;
  }
  out.deltas = deltas;
  if (deltas.length === 0) {
    out.notes.push('the file lists no delta — the catalogue stays byte-identical');
    return out;
  }

  const declared = unit.pkg.variantElements ?? [];
  const seen = new Set();
  deltas.forEach((d, i) => {
    const where = `[${i}]${d?.element ? ` ${d.element}` : ''}`;
    if (!d || typeof d !== 'object' || !/^E\d+$/.test(d.element ?? '')) return out.problems.push(`${where}: "element" must be an id like E21`);
    for (const k of Object.keys(d)) if (!['element', 'live', 'reason'].includes(k)) out.problems.push(`${where}: unknown field "${k}"`);
    if (d.live !== false) out.problems.push(`${where}: "live" must be false — a delta only ever says that an element stopped steering`);
    if (!isText(d.reason)) out.problems.push(`${where}: "reason" is missing — the studio prints it`);
    if (seen.has(d.element)) out.problems.push(`${where}: listed twice`);
    seen.add(d.element);
    if (!declared.includes(d.element)) {
      const owner = model.packages.find((p) => (p.variantElements ?? []).includes(d.element));
      out.problems.push(`${where}: not one of ${unit.id}'s variant elements (${declared.join(', ') || 'none'})${owner ? ` — it belongs to ${owner.id}` : ''} (R11)`);
    }
    return undefined;
  });
  if (out.problems.length) return out;

  // The catalogue the delta will meet: the branch's own, and the published line's at the merge.
  for (const target of [...new Set([ref, refExists(BASE_BRANCH) ? BASE_BRANCH : ref])]) {
    const catalog = readBlob(target, CATALOG) ?? '';
    for (const d of deltas) {
      const flag = liveFlag(catalog, d.element);
      if (flag === null) out.problems.push(`on ${target}: ${d.element} is not in the catalogue`);
      else if (flag === false) out.problems.push(`on ${target}: ${d.element} is not live any more — the delta is stale`);
    }
  }
  if (out.problems.length) return out;

  // R11: the read belongs to the unit — the gate's own reader scan, where the read still is.
  if (!gateExports('check-element-roster.mjs', 'scanElementReads')) {
    out.blocked.push('the ownership of the read (R11) needs the reader scan of the gate: scripts/check-element-roster.mjs does not export scanElementReads in this tree yet (F2:b). Nothing is guessed (R31).');
  } else {
    const where = refExists(BASE_BRANCH) ? BASE_BRANCH : ref;
    const { reads, playgroundOnly } = readsAt(where);
    for (const d of deltas) {
      const files = [...new Set(reads.filter((r) => r.element === d.element).map((r) => r.file))];
      const foreign = files.filter((f) => !matchesAny(f, unit.pkg.owns));
      if (files.length === 0) out.notes.push(`${d.element}: no useElementVariant read on ${where}`);
      if (foreign.length === 0) continue;
      if (unit.pkg.variantNote && playgroundOnly.has(d.element)) {
        out.notes.push(`${d.element}: read in ${foreign.join(', ')} — not ${unit.id}'s files; accepted because the gate calls the element playground-only and work-packages.json carries the exception (variantNote)`);
        continue;
      }
      out.problems.push(`${d.element}: its useElementVariant read is in ${foreign.map((f) => `${f} (${ownersOf(f, model).join(', ') || 'the integrator'})`).join(', ')} — not a file ${unit.id} owns (R11)`);
    }
  }

  if (out.problems.length === 0) {
    const run = await gateDryRun(unit, ref, deltas);
    if (run.note) out.notes.push(run.note);
    if (!run.ok) {
      out.problems.push(`check-element-roster is RED on ${ref} with the delta applied:`);
      for (const line of run.lines.slice(0, 30)) out.problems.push(`    ${line.trim()}`);
    } else out.notes.push(`gate dry run on ${ref} with the delta applied: ${run.lines.at(-1)?.trim()}`);
  }
  return out;
}

/* ── apply / revert ───────────────────────────────────────────────────────────────────────────── */

const backupDir = () => `${tree().local}/applied/variants`;

/** Put back the bytes a previous `apply` replaced. Refuses when the files changed since. */
export function revertApplied({ log = console.log } = {}) {
  const { root } = tree();
  const applied = readApplied();
  const record = applied.variants;
  if (!record) {
    log('pulse-variants revert: no delta is recorded as applied in this worktree');
    return { ok: true, reverted: false };
  }
  const changed = record.files.filter((f) => sha256(fs.readFileSync(`${root}/${f.path}`)) !== f.after);
  if (changed.length) {
    log(`pulse-variants revert: REFUSED — ${changed.map((f) => f.path).join(', ')} changed since the apply. \`node scripts/pulse-sync.mjs ${record.id}\` restores the slot.`);
    return { ok: false, reverted: false };
  }
  for (const f of record.files) fs.copyFileSync(`${backupDir()}/${path.basename(f.path)}`, `${root}/${f.path}`);
  const wrong = record.files.filter((f) => sha256(fs.readFileSync(`${root}/${f.path}`)) !== f.before);
  if (wrong.length) {
    log(`pulse-variants revert: ${wrong.map((f) => f.path).join(', ')} did not come back byte-identical`);
    return { ok: false, reverted: false };
  }
  fs.rmSync(backupDir(), { recursive: true, force: true });
  delete applied.variants;
  writeApplied(applied);
  log(`pulse-variants revert: ${record.id} — catalog.ts and elements-dormant.json are byte-identical to before the apply`);
  return { ok: true, reverted: true };
}

/** `check`, then write catalog.ts and elements-dormant.json. Recorded for `revert` unless `merge`. */
export async function applyDeltas(unit, model, { ref = unit.branch, merge = false, log = console.log } = {}) {
  const { root } = tree();
  const result = await checkDeltas(unit, model, { ref });
  if (result.problems.length || result.blocked.length || !result.deltas?.length) return { ...result, applied: false };

  const applied = readApplied();
  if (applied.variants) {
    if (applied.variants.id === unit.raw && applied.variants.blob === result.blob) {
      result.notes.push('this delta is already applied in this worktree');
      return { ...result, applied: false, already: true };
    }
    if (!revertApplied({ log }).ok) {
      result.problems.push('the delta applied here before could not be reverted — see above');
      return { ...result, applied: false };
    }
  }

  let catalog = fs.readFileSync(`${root}/${CATALOG}`, 'utf8');
  const dormant = readGateData('elements-dormant');
  for (const d of result.deltas) {
    if (liveFlag(catalog, d.element) !== true) result.problems.push(`working copy: ${d.element} is not live in catalog.ts — is another delta applied here?`);
    else catalog = setNotLive(catalog, d.element);
    dormant.set(d.element, d.reason);
  }
  if (result.problems.length) return { ...result, applied: false };

  const before = Object.fromEntries(TARGETS.map((f) => [f, fs.readFileSync(`${root}/${f}`)]));
  if (!merge) {
    fs.mkdirSync(backupDir(), { recursive: true });
    for (const f of TARGETS) fs.writeFileSync(`${backupDir()}/${path.basename(f)}`, before[f]);
  }
  writeFileAtomic(`${root}/${CATALOG}`, catalog);
  writeGateData('elements-dormant', dormant);
  if (!merge) {
    applied.variants = {
      id: unit.raw,
      ref,
      file: result.path,
      blob: result.blob,
      at: new Date().toISOString(),
      files: TARGETS.map((f) => ({ path: f, before: sha256(before[f]), after: sha256(fs.readFileSync(`${root}/${f}`)) })),
    };
    writeApplied(applied);
  }
  return { ...result, applied: true };
}

/* ── command line ─────────────────────────────────────────────────────────────────────────────── */

if (isMain(import.meta.url)) {
  const [command, ...argv] = process.argv.slice(2);
  const usage = 'usage: node scripts/pulse-variants.mjs <check | apply | revert> [<id>] [--ref <ref>] [--merge] [--json]';
  if (!['check', 'apply', 'revert'].includes(command)) {
    console.error(usage);
    process.exit(2);
  }
  if (command === 'revert') process.exit(revertApplied().ok ? 0 : 1);

  const model = loadModel();
  const unit = unitFromArgs(argv, model);
  if (!unit) {
    console.error(`pulse-variants: no package named, and the current branch is not pulse/<id>\n${usage}`);
    process.exit(2);
  }
  const ref = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : unit.branch;
  const result = command === 'check' ? await checkDeltas(unit, model, { ref }) : await applyDeltas(unit, model, { ref, merge: argv.includes('--merge') });

  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`pulse-variants ${command} ${unit.raw} @ ${ref}: ${result.deltas ? `${result.deltas.map((d) => d.element).join(' ') || 'no delta'}` : 'no hand-in file'}`);
    for (const n of result.notes) console.log(`  note: ${n}`);
    for (const b of result.blocked) console.log(`  BLOCKED ${b}`);
    for (const p of result.problems) console.error(`  ${p}`);
    if (result.problems.length) console.error(`pulse-variants ${command}: REFUSED — ${result.problems.filter((p) => !p.startsWith('    ')).length} problem(s)`);
    else if (result.blocked.length) console.log(`pulse-variants ${command}: BLOCKED — the delta could not be fully checked in this tree`);
    else if (command === 'apply') console.log(result.applied ? `pulse-variants apply: written — catalog.ts and elements-dormant.json${argv.includes('--merge') ? '' : ' (never commit them in a slot)'}` : 'pulse-variants apply: nothing to write');
    else console.log('pulse-variants check: OK');
  }
  process.exit(result.problems.length ? 1 : result.blocked.length ? 3 : 0);
}
