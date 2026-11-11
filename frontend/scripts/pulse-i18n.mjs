#!/usr/bin/env node
// scripts/pulse-i18n.mjs — the one writer of the three language bundles (PLAN.md 4.4, item 2).
//
// `src/i18n/{hu,en,de}.json` are shared by every screen and owned by the integrator. A package
// that needs a string never edits them: it commits `docs/pipeline/pulse/pkg/<id>/i18n.patch.json`,
// this tool applies it in the slot (never committed there), and the integrator applies THE SAME
// FILE at the squash merge. Nothing is typed twice, so key and consumer always land together.
//
//   node scripts/pulse-i18n.mjs check  [<id>] [--ref <ref>] [--json]
//   node scripts/pulse-i18n.mjs apply  [<id>] [--ref <ref>] [--merge]
//   node scripts/pulse-i18n.mjs revert [<id>]
//
// `<id>` is a package, a lane or a lane stage; without it, the id is read from the branch name.
//
// The rules `check` enforces (PLAN.md 4.4 a-f) — and `apply` is `check`, then a write:
//   (a) ADD by namespace: a `set` key lies in a namespace the package may add to, and a file the
//       package owns reads it;
//   (b) CHANGE / REMOVE by consumers: allowed exactly when every reader of the key — on
//       pulse-redesign and on the tip of every pulse/* branch — is a file this package owns;
//   (c) every `set` carries hu, en, de; `copy` is inventory | existing-literal | fix | proposed, and
//       a proposed string says whether it is visible;
//   (d) `untranslated` is REQUIRED when en or de equals the Hungarian string and FORBIDDEN
//       otherwise; apply writes it to scripts/data/i18n-untranslated.json, a removed key drops it;
//   (e) the patch is read from the branch HEAD (pending means committed), and no key may be
//       touched by a patch that is pending on another branch;
//   (f) an empty patch leaves the bundles byte-identical; flat dotted keys stay flat; line endings
//       are kept; a key is inserted at the same place in the three files.
//
// R31 — no rule of the gate is written a second time here. Who reads a key is asked of the gate's
// own scan (`scanKeyConsumers`, exported by check-i18n.mjs), run over a scratch checkout of each
// tip. And whether the result is a valid set of bundles (parity, placeholders, the untranslated
// rule in both directions, dead and missing keys) is decided by RUNNING THE GATE on a scratch
// copy of the branch with the patch applied — the patch is accepted when `check-i18n` is green
// there. While a tree's gate does not export its scan yet, a patch that needs it is BLOCKED
// (exit 3), not waved through.
//
// Exit: 0 ok, 1 refused, 2 usage, 3 blocked on a gate export. Not in the build chain.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readGateData, writeGateData } from './data/gate-data.mjs';
import {
  BASE_BRANCH,
  branchTips,
  callGateExport,
  gateExports,
  git,
  isMain,
  loadModel,
  matchesAny,
  materialize,
  ownersOf,
  readApplied,
  readBlob,
  readHandIn,
  refExists,
  resolveId,
  scratchCheckout,
  sha256,
  tree,
  unitFromArgs,
  writeApplied,
  writeFileAtomic,
} from './pulse-owns-check.mjs';

export const LANGS = ['hu', 'en', 'de'];
const PIVOT = 'hu';
const COPY = ['inventory', 'existing-literal', 'fix', 'proposed'];
const KEY = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/;
const bundlePath = (lang) => `frontend/src/i18n/${lang}.json`;
const UNTRANSLATED_FILE = 'frontend/scripts/data/i18n-untranslated.json';
const PATCH_NAME = 'i18n.patch.json';

/* ── a bundle as an ordered tree ──────────────────────────────────────────────────────────────── */

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
/** Exactly how the bundles are stored: two spaces, one final newline, the file's own line ending. */
export const serializeBundle = (obj, eol) => `${JSON.stringify(obj, null, 2)}\n`.replace(/\n/g, eol);
const flatKeys = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (isObj(v) ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

class PatchError extends Error {}

/**
 * Find a dotted key. Seven top-level keys are FLAT (`"achievement.workout.first": "…"` — the
 * server names them), so at every level the longest dotted property name is tried first.
 * Returns the chain of `{ container, prop }` from the root to the entry, or null.
 */
function locate(obj, parts, chain = []) {
  for (let n = parts.length; n >= 1; n -= 1) {
    const head = parts.slice(0, n).join('.');
    if (!own(obj, head)) continue;
    const here = [...chain, { container: obj, prop: head }];
    if (n === parts.length) return here;
    if (isObj(obj[head])) {
      const hit = locate(obj[head], parts.slice(n), here);
      if (hit) return hit;
    }
  }
  return null;
}
const leaf = (bundle, key) => {
  const chain = locate(bundle, key.split('.'));
  const last = chain?.at(-1);
  return last && typeof last.container[last.prop] === 'string' ? chain : null;
};
export const valueOf = (bundle, key) => {
  const last = leaf(bundle, key)?.at(-1);
  return last ? last.container[last.prop] : undefined;
};

/** Insert a property after a sibling (null = at the end), in place — the parent keeps its reference. */
function insertAfter(container, prop, value, afterProp) {
  const entries = Object.entries(container);
  const at = afterProp === null ? entries.length : entries.findIndex(([k]) => k === afterProp) + 1;
  entries.splice(at, 0, [prop, value]);
  for (const k of Object.keys(container)) delete container[k];
  for (const [k, v] of entries) container[k] = v;
}

function setKey(bundle, key, value, after) {
  const parts = key.split('.');
  if (locate(bundle, parts)) throw new PatchError(`${key} already exists — use "change"`);
  // Go down through the objects that exist; what is left is created.
  let obj = bundle;
  let i = 0;
  for (let moved = true; moved; ) {
    moved = false;
    for (let n = parts.length - i - 1; n >= 1 && !moved; n -= 1) {
      const head = parts.slice(i, i + n).join('.');
      if (!own(obj, head)) continue;
      if (!isObj(obj[head])) throw new PatchError(`${parts.slice(0, i + n).join('.')} is a string — ${key} cannot sit under it`);
      obj = obj[head];
      i += n;
      moved = true;
    }
  }
  const rest = parts.slice(i);
  // A flat family: sibling strings written as dotted property names. A new member stays flat and joins them.
  const family = Object.keys(obj).filter((k) => typeof obj[k] === 'string' && k.startsWith(`${rest[0]}.`));
  const flat = rest.length > 1 && family.length > 0;
  const prop = flat ? rest.join('.') : rest[0];
  if (!flat) {
    // JavaScript moves a property named like an array index to the front of its object, whatever
    // the insertion order — the file would be reordered behind the patch's back.
    const numeric = rest.find((s) => /^(0|[1-9]\d*)$/.test(s));
    if (numeric !== undefined) throw new PatchError(`${key}: the segment "${numeric}" is a number and cannot keep its place in a JSON object — name it otherwise`);
  }
  let node = value;
  if (!flat) for (let j = rest.length - 1; j >= 1; j -= 1) node = { [rest[j]]: node };

  let afterProp = flat ? family.at(-1) : null;
  if (after !== undefined) {
    const anchor = locate(bundle, after.split('.'))?.at(-1);
    if (!anchor || anchor.container !== obj) throw new PatchError(`${key}: "after": "${after}" is not a sibling of the new key`);
    afterProp = anchor.prop;
  }
  insertAfter(obj, prop, node, afterProp);
}

function changeKey(bundle, key, from, to) {
  const last = leaf(bundle, key)?.at(-1);
  if (!last) throw new PatchError(`${key} does not exist — "change" needs an existing key`);
  if (last.container[last.prop] !== from) throw new PatchError(`${key}: "from" is ${JSON.stringify(from)}, the bundle has ${JSON.stringify(last.container[last.prop])} — the patch is stale`);
  last.container[last.prop] = to;
}

function removeKey(bundle, key) {
  const chain = leaf(bundle, key);
  if (!chain) throw new PatchError(`${key} does not exist — nothing to remove`);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    delete chain[i].container[chain[i].prop];
    // An object emptied by the removal goes with it; an empty namespace is never a legitimate key.
    if (Object.keys(chain[i].container).length > 0) break;
  }
}

/** Keys whose predecessor differs between Hungarian and another bundle — the measure of "same order". */
function orderDivergence(bundles) {
  const pred = Object.fromEntries(LANGS.map((l) => [l, new Map(flatKeys(bundles[l]).map((k, i, all) => [k, all[i - 1] ?? null]))]));
  return [...pred[PIVOT].keys()].filter((k) => LANGS.some((l) => pred[l].has(k) && pred[l].get(k) !== pred[PIVOT].get(k)));
}

/**
 * Apply a patch to three parsed bundles, in place. Returns the problems (empty = applied).
 * Order: change, set, remove — an `after` anchor is still there when its sibling is set.
 */
export function applyOps(bundles, patch) {
  const problems = [];
  const before = orderDivergence(bundles);
  const attempt = (lang, fn) => {
    try {
      fn();
    } catch (err) {
      if (!(err instanceof PatchError)) throw err;
      problems.push(`${lang}.json: ${err.message}`);
    }
  };
  for (const c of patch.change ?? []) for (const l of LANGS) if (c[l]) attempt(l, () => changeKey(bundles[l], c.key, c[l].from, c[l].to));
  for (const s of patch.set ?? []) for (const l of LANGS) attempt(l, () => setKey(bundles[l], s.key, s[l], s.after));
  for (const r of patch.remove ?? []) for (const l of LANGS) attempt(l, () => removeKey(bundles[l], r.key));
  if (problems.length === 0) {
    const worse = orderDivergence(bundles).filter((k) => !before.includes(k));
    if (worse.length > 0 && orderDivergence(bundles).length > before.length) {
      problems.push(`the patch would put ${worse.slice(0, 5).join(', ')} at different places in the three bundles — give the entry an "after" that all three have`);
    }
  }
  return problems;
}

/** The untranslated list after the patch (rule d): `{ entries: Map, problems }`. */
export function untranslatedAfter(entries, bundlesAfter, patch) {
  const next = new Map(entries);
  const problems = [];
  const same = (key) => {
    const hu = valueOf(bundlesAfter[PIVOT], key);
    return hu !== undefined && LANGS.some((l) => l !== PIVOT && valueOf(bundlesAfter[l], key) === hu);
  };
  for (const s of patch.set ?? []) if (s.untranslated && same(s.key)) next.set(s.key, s.untranslated.reason);
  for (const c of patch.change ?? []) {
    if (same(c.key)) {
      if (!next.has(c.key)) {
        if (c.untranslated?.reason) next.set(c.key, c.untranslated.reason);
        else problems.push(`${c.key}: after the change en or de equals the Hungarian string — "untranslated": { "reason" } is REQUIRED (rule d)`);
      }
    } else {
      if (c.untranslated) problems.push(`${c.key}: after the change no string equals the Hungarian one — "untranslated" is FORBIDDEN (rule d)`);
      next.delete(c.key); // translated now: the exemption goes with it
    }
  }
  for (const r of patch.remove ?? []) next.delete(r.key);
  return { entries: next, problems };
}

/* ── the patch file ───────────────────────────────────────────────────────────────────────────── */

const touchedKeys = (patch) => [...(patch.set ?? []), ...(patch.change ?? []), ...(patch.remove ?? [])].map((e) => e.key);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Shape and the rules that need nothing but the file and work-packages.json (a first half, c, d, f). */
export function validateShape(patch, unit, model) {
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!isObj(patch)) return ['the patch is not a JSON object'];
  const known = ['package', 'base', 'namespaces', 'set', 'change', 'remove', 'copyQuestions'];
  for (const k of Object.keys(patch)) if (!known.includes(k)) bad(`unknown field "${k}" (known: ${known.join(', ')})`);
  if (resolveId(patch.package, model)?.id !== unit.id) bad(`"package" is ${JSON.stringify(patch.package)} — this is the patch of ${unit.id}`);
  if (!isText(patch.base)) bad('"base" is missing — the sha of pulse-redesign the patch was written against');
  for (const list of ['namespaces', 'set', 'change', 'remove', 'copyQuestions']) {
    if (patch[list] !== undefined && !Array.isArray(patch[list])) bad(`"${list}" must be an array`);
  }
  if (problems.length) return problems;

  const allowed = unit.pkg.i18nNamespaces ?? [];
  const namespaces = patch.namespaces ?? [];
  for (const ns of namespaces) {
    if (!allowed.includes(ns)) bad(`namespace "${ns}": ${unit.id} may add keys in ${allowed.length ? allowed.join(', ') : 'no namespace'} only (rule a)`);
  }
  const fields = (entry, list, where) => {
    for (const k of Object.keys(entry)) if (!list.includes(k)) bad(`${where}: unknown field "${k}"`);
  };
  const seen = new Set();
  const key = (entry, where) => {
    if (!isObj(entry) || !isText(entry.key) || !KEY.test(entry.key)) {
      bad(`${where}: "key" must be a dotted key like nutrition.unitKcal`);
      return false;
    }
    if (seen.has(entry.key)) bad(`duplicate key ${entry.key} — a key appears once in a patch`);
    seen.add(entry.key);
    return true;
  };
  const copy = (entry, where) => {
    if (!COPY.includes(entry.copy)) bad(`${where}: "copy" must be one of ${COPY.join(' | ')} (rule c)`);
    if (entry.copy === 'proposed' && typeof entry.visible !== 'boolean') bad(`${where}: a proposed string says whether it is "visible": true | false (rule c, R22)`);
    if (!isText(entry.source)) bad(`${where}: "source" is missing — the frame, the inventory note or the literal the string comes from (R22)`);
    if (entry.untranslated !== undefined && !(isObj(entry.untranslated) && isText(entry.untranslated.reason))) bad(`${where}: "untranslated" must be { "reason": "…" }`);
  };

  (patch.set ?? []).forEach((s, i) => {
    const where = `set[${i}]${s?.key ? ` ${s.key}` : ''}`;
    if (!key(s, where)) return;
    fields(s, ['key', ...LANGS, 'after', 'copy', 'visible', 'source', 'untranslated'], where);
    const missing = LANGS.filter((l) => !isText(s[l]));
    if (missing.length) {
      bad(`${where}: no ${missing.join(' / ')} string — every "set" carries hu, en and de (rule c)`);
      return;
    }
    copy(s, where);
    if (!namespaces.includes(s.key.split('.')[0])) bad(`${where}: the namespace "${s.key.split('.')[0]}" is not in the patch's "namespaces" (rule a)`);
    const needs = s.en === s.hu || s.de === s.hu;
    if (needs && !s.untranslated) bad(`${where}: en or de equals the Hungarian string — "untranslated": { "reason" } is REQUIRED (rule d)`);
    if (!needs && s.untranslated) bad(`${where}: no string equals the Hungarian one — "untranslated" is FORBIDDEN (rule d)`);
    if (s.after !== undefined && !isText(s.after)) bad(`${where}: "after" must be a key`);
  });
  (patch.change ?? []).forEach((c, i) => {
    const where = `change[${i}]${c?.key ? ` ${c.key}` : ''}`;
    if (!key(c, where)) return;
    fields(c, ['key', ...LANGS, 'copy', 'source', 'untranslated', 'visible'], where);
    let any = false;
    for (const l of LANGS) {
      if (c[l] === null || c[l] === undefined) continue;
      any = true;
      if (!isObj(c[l]) || typeof c[l].from !== 'string' || !isText(c[l].to) || c[l].from === c[l].to) bad(`${where}: "${l}" must be { "from": "<now>", "to": "<then>" } or null`);
    }
    if (!any) bad(`${where}: changes no language`);
    copy(c, where);
  });
  (patch.remove ?? []).forEach((r, i) => {
    const where = `remove[${i}]${r?.key ? ` ${r.key}` : ''}`;
    if (!key(r, where)) return;
    fields(r, ['key', 'reason'], where);
    if (!isText(r.reason)) bad(`${where}: "reason" is missing — why the key has no reader left`);
  });
  (patch.copyQuestions ?? []).forEach((q, i) => {
    if (!isObj(q) || !isText(q.where) || !isText(q.note)) bad(`copyQuestions[${i}]: needs "where" and "note"`);
  });
  return problems;
}

/* ── asking the gate ──────────────────────────────────────────────────────────────────────────── */

const scratch = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `pulse-i18n-${label}-`));
const toRepoPath = (file) => {
  const f = file.split(path.sep).join('/');
  if (f.startsWith('frontend/')) return f;
  return f.startsWith('src/') ? `frontend/${f}` : `frontend/src/${f}`;
};

/** Who reads each key at a ref — the gate's own scan over a scratch checkout. Cached by source tree. */
function consumersAt(ref, cache) {
  const srcTree = git(['rev-parse', `${ref}:frontend/src`], { cwd: tree().root });
  if (!cache.has(srcTree)) {
    const dir = scratch('scan');
    try {
      materialize(ref, ['frontend/src'], dir);
      const raw = callGateExport('check-i18n.mjs', 'scanKeyConsumers', `${dir.split(path.sep).join('/')}/frontend`);
      cache.set(srcTree, new Map(Object.entries(raw).map(([k, files]) => [k, [...new Set(files.map(toRepoPath))]])));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return cache.get(srcTree);
}

/**
 * Run `check-i18n` itself on a scratch copy of the branch with the patch applied. Whatever the
 * gate says about parity, placeholders, the untranslated list, dead keys and missing keys is the
 * verdict — none of it is decided here.
 */
async function gateDryRun(unit, ref, patch) {
  // With the unit's own shared.patch: a lane may keep the reader of a new key there (a playground
  // demo case), and without it the gate would call the key dead.
  const { front, note: sharedNote, dispose } = scratchCheckout(unit, ref, 'i18n-dryrun');
  try {
    const bundles = {};
    const eol = {};
    for (const l of LANGS) {
      const text = fs.readFileSync(`${front}/src/i18n/${l}.json`, 'utf8');
      eol[l] = eolOf(text);
      bundles[l] = JSON.parse(text);
    }
    const problems = applyOps(bundles, patch);
    if (problems.length) return { ok: false, lines: problems, sharedNote };
    for (const l of LANGS) fs.writeFileSync(`${front}/src/i18n/${l}.json`, serializeBundle(bundles[l], eol[l]));
    // The scratch copy's own gate-data module: it resolves the list next to itself.
    const data = await import(pathToFileURL(`${front}/scripts/data/gate-data.mjs`).href);
    const list = untranslatedAfter(data.readGateData('i18n-untranslated'), bundles, patch);
    if (list.problems.length) return { ok: false, lines: list.problems, sharedNote };
    data.writeGateData('i18n-untranslated', list.entries);
    const r = spawnSync(process.execPath, ['scripts/check-i18n.mjs'], { cwd: front, encoding: 'utf8', windowsHide: true });
    const lines = `${r.stdout}\n${r.stderr}`.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim() !== '');
    const readers = gateExports('check-i18n.mjs', 'scanKeyConsumers') ? callGateExport('check-i18n.mjs', 'scanKeyConsumers', front) : null;
    // A reader that the unit's own shared.patch adds (a playground demo case) is the unit's reader.
    const shared = readHandIn(unit, 'shared.patch', ref);
    const sharedFiles = shared ? [...shared.text.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]) : [];
    return { ok: r.status === 0, lines, sharedNote, readers, sharedFiles };
  } finally {
    dispose();
  }
}

/** Patches that are committed on another branch and not yet in pulse-redesign (rule e). */
function pendingElsewhere(unit, ref) {
  const { root } = tree();
  const out = [];
  const seen = new Set();
  const mine = git(['rev-parse', ref], { cwd: root });
  for (const tip of branchTips()) {
    if (tip.name === BASE_BRANCH || tip.sha === mine || tip.name === unit.branch) continue;
    const files = git(['ls-tree', '-r', '--name-only', tip.name, '--', 'docs/pipeline/pulse/pkg'], { cwd: root }).split('\n').filter((f) => f.endsWith(`/${PATCH_NAME}`));
    for (const file of files) {
      if (unit.handInDirs.some((d) => file.startsWith(`${d}/`))) continue;
      const text = readBlob(tip.name, file);
      if (text === readBlob(BASE_BRANCH, file)) continue; // merged already: not pending
      if (seen.has(`${file}\n${text}`)) continue;
      seen.add(`${file}\n${text}`);
      try {
        out.push({ branch: tip.name, file, keys: touchedKeys(JSON.parse(text)) });
      } catch {
        out.push({ branch: tip.name, file, keys: [], broken: true });
      }
    }
  }
  return out;
}

const bundlesAt = (ref) => Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readBlob(ref, bundlePath(l)))]));

/* ── check ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Everything `check` knows about the patch of a work unit at a ref.
 * `{ ref, patch, patchPath, blob, problems, blocked, notes }` — `blocked` are rules that could not
 * be evaluated in this tree; a patch with any is not accepted.
 */
export async function checkPatch(unit, model, { ref = unit.branch } = {}) {
  const out = { id: unit.raw, ref, patch: null, patchPath: null, blob: null, problems: [], blocked: [], notes: [] };
  if (!refExists(ref)) {
    out.problems.push(`${ref} does not exist — the patch is read from the branch HEAD (rule e: pending means committed)`);
    return out;
  }
  const handIn = readHandIn(unit, PATCH_NAME, ref);
  if (!handIn) {
    out.notes.push(`${ref} carries no ${PATCH_NAME} — nothing to apply`);
    return out;
  }
  out.patchPath = handIn.path;
  out.blob = sha256(handIn.text);
  try {
    out.patch = JSON.parse(handIn.text);
  } catch (err) {
    out.problems.push(`${handIn.path} is not valid JSON — ${err.message}`);
    return out;
  }
  const patch = out.patch;
  out.problems.push(...validateShape(patch, unit, model));
  if (out.problems.length) return out;

  const working = `${tree().root}/${handIn.path}`;
  if (fs.existsSync(working) && fs.readFileSync(working, 'utf8').replace(/\r\n/g, '\n') !== handIn.text.replace(/\r\n/g, '\n')) {
    out.notes.push(`the working copy of ${handIn.path} differs from the committed one — the tool reads ${ref}; commit the file`);
  }
  if (!refExists(patch.base)) out.notes.push(`"base" ${patch.base} is not a commit of this repository`);

  const keys = touchedKeys(patch);
  if (keys.length === 0) {
    out.notes.push('the patch touches no key — the bundles stay byte-identical');
    return out;
  }

  // The bundles the patch will meet: the branch's own, and the published line's at the merge.
  for (const target of [...new Set([ref, refExists(BASE_BRANCH) ? BASE_BRANCH : ref])]) {
    for (const p of applyOps(bundlesAt(target), patch)) out.problems.push(`on ${target}: ${p}`);
  }

  // (e) a key is touched by one pending patch only.
  for (const other of pendingElsewhere(unit, ref)) {
    if (other.broken) out.notes.push(`${other.file} on ${other.branch} is not valid JSON — it cannot be compared`);
    const clash = keys.filter((k) => other.keys.includes(k));
    if (clash.length) out.problems.push(`${clash.join(', ')}: also touched by ${other.file} on ${other.branch} — one pending patch per key (rule e)`);
  }

  // (a) and (b): who reads the keys — the gate's own scan.
  if (!gateExports('check-i18n.mjs', 'scanKeyConsumers')) {
    out.blocked.push('rules (a) and (b) need the consumer scan of the gate: scripts/check-i18n.mjs does not export scanKeyConsumers in this tree yet (F2:b). Nothing is guessed (R31).');
  } else {
    const cache = new Map();
    const owned = (file) => matchesAny(file, unit.pkg.owns);
    const who = (file) => ownersOf(file, model).join(', ') || 'the integrator';
    const tips = [...new Map(branchTips().map((t) => [t.name, t])).values()];
    for (const entry of [...(patch.change ?? []), ...(patch.remove ?? [])]) {
      const foreign = new Map(); // file -> [branches]
      for (const tip of tips) {
        for (const file of consumersAt(tip.name, cache).get(entry.key) ?? []) {
          if (!owned(file)) foreign.set(file, [...(foreign.get(file) ?? []), tip.name]);
        }
      }
      for (const [file, branches] of foreign) {
        out.problems.push(`${entry.key}: also read by ${file} (${who(file)}) on ${branches.join(', ')} — only a key whose every reader ${unit.id} owns may be changed or removed (rule b)`);
      }
    }
  }

  // The gate's own verdict on the branch with the patch applied — and, on that same patched copy,
  // who reads each NEW key (rule a): the scan only knows keys the bundles hold.
  if (out.problems.length === 0) {
    const run = await gateDryRun(unit, ref, patch);
    if (run.sharedNote) out.notes.push(run.sharedNote);
    for (const s of run.readers ? (patch.set ?? []) : []) {
      const readers = (run.readers[s.key] ?? []).map(toRepoPath);
      if (readers.length === 0) out.notes.push(`${s.key}: the scan finds no literal reader on ${ref} — it stands only if the gate accepts it (a dynamic or server-named key)`);
      else if (!readers.some((f) => matchesAny(f, unit.pkg.owns) || (run.sharedFiles ?? []).includes(f))) out.problems.push(`${s.key}: read by ${readers.join(', ')} — none is a file ${unit.id} owns (rule a)`);
    }
    if (!run.ok) {
      out.problems.push(`check-i18n is RED on ${ref} with the patch applied:`);
      for (const line of run.lines.slice(0, 30)) out.problems.push(`    ${line.trim()}`);
    } else out.notes.push(`gate dry run on ${ref} with the patch applied: ${run.lines.at(-1)?.trim()}`);
  }
  return out;
}

/* ── apply / revert ───────────────────────────────────────────────────────────────────────────── */

const backupDir = () => `${tree().local}/applied/i18n`;
const TARGETS = [...LANGS.map(bundlePath), UNTRANSLATED_FILE];

/** Put back the bytes a previous `apply` replaced. Refuses when the files changed since. */
export function revertApplied({ log = console.log } = {}) {
  const { root } = tree();
  const applied = readApplied();
  const record = applied.i18n;
  if (!record) {
    log('pulse-i18n revert: no patch is recorded as applied in this worktree');
    return { ok: true, reverted: false };
  }
  const changed = record.files.filter((f) => sha256(fs.readFileSync(`${root}/${f.path}`)) !== f.after);
  if (changed.length) {
    log(`pulse-i18n revert: REFUSED — ${changed.map((f) => f.path).join(', ')} changed since the apply. \`node scripts/pulse-sync.mjs ${record.id}\` restores the slot.`);
    return { ok: false, reverted: false };
  }
  for (const f of record.files) fs.copyFileSync(`${backupDir()}/${path.basename(f.path)}`, `${root}/${f.path}`);
  const wrong = record.files.filter((f) => sha256(fs.readFileSync(`${root}/${f.path}`)) !== f.before);
  if (wrong.length) {
    log(`pulse-i18n revert: ${wrong.map((f) => f.path).join(', ')} did not come back byte-identical`);
    return { ok: false, reverted: false };
  }
  fs.rmSync(backupDir(), { recursive: true, force: true });
  delete applied.i18n;
  writeApplied(applied);
  log(`pulse-i18n revert: ${record.id} — ${record.files.length} file(s) are byte-identical to before the apply`);
  return { ok: true, reverted: true };
}

const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** At the merge: proposed strings go to copy-to-approve.md, copy questions to deviations.md (R22). */
function recordCopy(unit, patch, log) {
  const { docs } = tree();
  const proposed = (patch.set ?? []).filter((s) => s.copy === 'proposed');
  if (proposed.length) {
    const file = `${docs}/copy-to-approve.md`;
    const text = fs.readFileSync(file, 'utf8');
    const eol = eolOf(text);
    const rows = proposed
      .filter((s) => !text.includes(`| \`${s.key}\` |`))
      .map((s) => `| \`${s.key}\` | ${mdCell(s.hu)} | ${mdCell(s.en)} | ${mdCell(s.de)} | ${s.visible ? 'yes' : 'no'} | ${unit.raw} | ${mdCell(s.source)} | [ ] |`);
    if (rows.length) fs.writeFileSync(file, `${text.replace(/\s*$/, '')}${eol}${rows.join(eol)}${eol}`);
    log(`pulse-i18n: ${rows.length} proposed string(s) appended to copy-to-approve.md (${proposed.filter((s) => s.visible).length} visible)`);
  }
  const questions = patch.copyQuestions ?? [];
  if (questions.length) {
    const file = `${docs}/deviations.md`;
    const text = fs.readFileSync(file, 'utf8');
    const eol = eolOf(text);
    let n = Math.max(0, ...[...text.matchAll(/^## DEV-(\d+)/gm)].map((m) => Number(m[1])));
    const blocks = questions
      .filter((q) => !text.includes(`${unit.raw}: ${q.where}`))
      .map((q) => {
        n += 1;
        return [
          `## DEV-${String(n).padStart(3, '0')} — ${unit.raw}: ${q.where}`,
          '',
          `- Source: PLAN.md R22 — a \`copyQuestions\` entry of \`${unit.handInDirs[0]}/${PATCH_NAME}\``,
          `- Package: ${unit.raw}`,
          `- The frames show: ${q.frame ? `\`${q.frame}\` — ` : ''}no string is drawn at this place.`,
          `- What the app does: ${q.note}`,
          '- Status: open — a copy question; nothing was invented.',
        ].join(eol);
      });
    if (blocks.length) fs.writeFileSync(file, `${text.replace(/\s*$/, '')}${eol}${eol}${blocks.join(`${eol}${eol}`)}${eol}`);
    log(`pulse-i18n: ${blocks.length} copy question(s) appended to deviations.md`);
  }
}

/**
 * `check`, then write the working copies. In a slot the previous bytes are kept under
 * `<slot>/.pulse/applied/` so `revert` restores them exactly. With `merge` (the integrator, on the
 * squashed tree) nothing is recorded — the commit is the record — and the two owner lists grow.
 */
export async function applyPatch(unit, model, { ref = unit.branch, merge = false, log = console.log } = {}) {
  const { root } = tree();
  const result = await checkPatch(unit, model, { ref });
  if (result.problems.length || result.blocked.length) return { ...result, applied: false };
  if (!result.patch) return { ...result, applied: false };
  const patch = result.patch;

  const applied = readApplied();
  if (applied.i18n) {
    if (applied.i18n.id === unit.raw && applied.i18n.blob === result.blob) {
      result.notes.push('this patch is already applied in this worktree');
      return { ...result, applied: false, already: true };
    }
    if (!revertApplied({ log }).ok) {
      result.problems.push('the patch applied here before could not be reverted — see above');
      return { ...result, applied: false };
    }
  }

  let wrote = false;
  if (touchedKeys(patch).length > 0) {
    const texts = Object.fromEntries(LANGS.map((l) => [l, fs.readFileSync(`${root}/${bundlePath(l)}`, 'utf8')]));
    const bundles = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(texts[l])]));
    for (const l of LANGS) {
      // Writing a bundle that is not in canonical form would reformat lines the patch never touched.
      if (serializeBundle(bundles[l], eolOf(texts[l])) !== texts[l]) result.problems.push(`${bundlePath(l)} is not in the canonical form the tool writes (two-space JSON, one final newline) — it would be reformatted`);
    }
    result.problems.push(...applyOps(bundles, patch).map((p) => `working copy: ${p} — is another patch applied here?`));
    const list = untranslatedAfter(readGateData('i18n-untranslated'), bundles, patch);
    result.problems.push(...list.problems);
    if (result.problems.length) return { ...result, applied: false };

    const before = Object.fromEntries(TARGETS.map((f) => [f, fs.readFileSync(`${root}/${f}`)]));
    if (!merge) {
      fs.mkdirSync(backupDir(), { recursive: true });
      for (const f of TARGETS) fs.writeFileSync(`${backupDir()}/${path.basename(f)}`, before[f]);
    }
    for (const l of LANGS) writeFileAtomic(`${root}/${bundlePath(l)}`, serializeBundle(bundles[l], eolOf(texts[l])));
    writeGateData('i18n-untranslated', list.entries);
    if (!merge) {
      applied.i18n = {
        id: unit.raw,
        ref,
        patch: result.patchPath,
        blob: result.blob,
        at: new Date().toISOString(),
        files: TARGETS.map((f) => ({ path: f, before: sha256(before[f]), after: sha256(fs.readFileSync(`${root}/${f}`)) })),
      };
      writeApplied(applied);
    }
    wrote = true;
  }
  if (merge) recordCopy(unit, patch, log);
  return { ...result, applied: wrote };
}

/* ── command line ─────────────────────────────────────────────────────────────────────────────── */

if (isMain(import.meta.url)) {
  const [command, ...argv] = process.argv.slice(2);
  const usage = 'usage: node scripts/pulse-i18n.mjs <check | apply | revert> [<id>] [--ref <ref>] [--merge] [--json]';
  if (!['check', 'apply', 'revert'].includes(command)) {
    console.error(usage);
    process.exit(2);
  }
  if (command === 'revert') process.exit(revertApplied().ok ? 0 : 1);

  const model = loadModel();
  const unit = unitFromArgs(argv, model);
  if (!unit) {
    console.error(`pulse-i18n: no package named, and the current branch is not pulse/<id>\n${usage}`);
    process.exit(2);
  }
  const ref = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : unit.branch;
  const result = command === 'check' ? await checkPatch(unit, model, { ref }) : await applyPatch(unit, model, { ref, merge: argv.includes('--merge') });

  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    const patch = result.patch;
    const counts = patch ? `set ${patch.set?.length ?? 0}, change ${patch.change?.length ?? 0}, remove ${patch.remove?.length ?? 0}, copy questions ${patch.copyQuestions?.length ?? 0}` : 'no patch';
    console.log(`pulse-i18n ${command} ${unit.raw} @ ${ref}: ${counts}`);
    for (const n of result.notes) console.log(`  note: ${n}`);
    for (const b of result.blocked) console.log(`  BLOCKED ${b}`);
    for (const p of result.problems) console.error(`  ${p}`);
    if (result.problems.length) console.error(`pulse-i18n ${command}: REFUSED — ${result.problems.filter((p) => !p.startsWith('    ')).length} problem(s)`);
    else if (result.blocked.length) console.log(`pulse-i18n ${command}: BLOCKED — the patch could not be fully checked in this tree`);
    else if (command === 'apply') console.log(result.applied ? `pulse-i18n apply: written — ${LANGS.map((l) => `${l}.json`).join(', ')} and the untranslated list${argv.includes('--merge') ? '' : ' (never commit them in a slot)'}` : 'pulse-i18n apply: nothing to write');
    else console.log('pulse-i18n check: OK');
  }
  process.exit(result.problems.length ? 1 : result.blocked.length ? 3 : 0);
}
