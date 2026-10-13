#!/usr/bin/env node
// scripts/pulse-owns-check.mjs — who owns which file, proven on the real tree (PLAN.md 2.3).
//
// `docs/pipeline/pulse/work-packages.json` is the ONE source for ownership. It is written by hand,
// by people who cannot see 1 200 paths at once, and every later step of the Pulse effort trusts
// it: the merge check refuses a branch by it, the progress file lists files by it, a slot is
// declared clean by it. So it is checked the way the build checks the tokens — by a script.
//
// What it proves:
//   1. no two packages' `owns` overlap — on every tracked file, and pattern against pattern for
//      files that do not exist yet;
//   2. every file under `frontend/src` is owned by a package, frozen, or the integrator's;
//   3. nothing frozen is owned (revision 1 handed `lib/outbox.ts` to F1 — this is that check);
//   4. every file a package deletes is in its `owns`;
//   5. every pre-claim edit names a later owner that really owns the file;
//   6. every `dependsOn` resolves, stage-qualified ones to a declared stage;
//   7. a hand-in folder belongs to its own package and nobody is told not to touch what it owns;
//   8. no variant element is claimed twice;
//   9. `anchoredBy` agrees with `verify:gates --list-anchors` (once that gate tool is in the tree).
//
// It is also THE shared plumbing of the Pulse tools (R31: "every tool [imports] the glob expander
// of pulse-owns-check.mjs"): the expander, the id grammar, where `.pulse/` lives, the heavy lock.
// A second copy of any of these is how two tools start to disagree about who owns a file.
//
// Usage (cwd anywhere; the tree is the one this file sits in):
//   node scripts/pulse-owns-check.mjs                 the check
//   node scripts/pulse-owns-check.mjs --wp <file>     check another work-packages file (self-test)
//   node scripts/pulse-owns-check.mjs --files <id>    the generated file list of one package
//   node scripts/pulse-owns-check.mjs --owner <path>  who owns a path
//   node scripts/pulse-owns-check.mjs --json          the result as JSON
//
// Exit: 0 clean, 1 problems, 2 usage. Not in the build chain. No dependency, no network.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url)).split(path.sep).join('/');
export const FRONTEND_DIR = path.dirname(SCRIPTS_DIR);
export const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
export const BASE_BRANCH = 'pulse-redesign';

/* ── plumbing ─────────────────────────────────────────────────────────────────────────────────── */

/** True when the module at `metaUrl` is the script node was started with — not an import. */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  const a = pathToFileURL(path.resolve(process.argv[1])).href;
  return process.platform === 'win32' ? a.toLowerCase() === metaUrl.toLowerCase() : a === metaUrl;
}

/** Run git; returns `{ ok, status, stdout, stderr }` and never throws on a non-zero exit. */
export function gitTry(args, { cwd = FRONTEND_DIR, input, env } = {}) {
  const r = spawnSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
    windowsHide: true,
  });
  if (r.error) throw r.error;
  return { ok: r.status === 0, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Run git and return its trimmed stdout; throws with git's own words on failure. */
export function git(args, opts = {}) {
  const r = gitTry(args, opts);
  if (!r.ok) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${r.stderr.trim() || r.stdout.trim()}`);
  return opts.raw ? r.stdout : r.stdout.trim();
}

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const posix = (p) => p.split(path.sep).join('/');

let cachedTree;
/**
 * The tree this script sits in, and the places every tool reaches from it.
 *
 * `.pulse/` (locks, status files, the live progress file, recordings) lives in the MAIN checkout
 * only and is shared by every worktree (PLAN.md 2.1), so it is resolved from the git common dir.
 * `local` is this worktree's own ignored `.pulse/` — what a slot remembers about its local applies.
 */
export function tree() {
  if (cachedTree) return cachedTree;
  const root = git(['rev-parse', '--show-toplevel']);
  const common = git(['rev-parse', '--git-common-dir'], { cwd: root });
  const main = posix(path.dirname(path.resolve(root, common)));
  cachedTree = {
    root,
    main,
    // PULSE_DIR overrides it, as it does for the capture tool (a test, a second run directory).
    pulse: process.env.PULSE_DIR ? posix(path.resolve(process.env.PULSE_DIR)) : `${main}/.pulse`,
    local: `${root}/.pulse`,
    docs: `${root}/docs/pipeline/pulse`,
    frontend: `${root}/frontend`,
  };
  return cachedTree;
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const readJsonIfExists = (file) => (fs.existsSync(file) ? readJson(file) : null);

/** Write through a temp file and a rename, so a reader never sees half a file and a kill loses nothing. */
export function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** A blob at a ref, or null when the path does not exist there. Byte-exact: no line-ending filter. */
export function readBlob(ref, file, cwd = tree().root) {
  const r = spawnSync('git', ['cat-file', 'blob', `${ref}:${file}`], { cwd, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  return r.status === 0 ? r.stdout.toString('utf8') : null;
}

export const refExists = (ref) => gitTry(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: tree().root }).ok;
export const lsFiles = (ref) =>
  (ref ? git(['ls-tree', '-r', '--name-only', ref], { cwd: tree().root }) : git(['ls-files'], { cwd: tree().root }))
    .split('\n')
    .filter(Boolean);

/** The tips the i18n and variant rules look at: the published line and every package branch. */
export function branchTips() {
  const out = git(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads/pulse/', `refs/heads/${BASE_BRANCH}`], { cwd: tree().root });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, sha] = line.split(' ');
      return { name, sha };
    });
}

/**
 * Check a ref's files out into a scratch directory (with LF line endings), without touching any
 * worktree or the real index. `paths` are repo-relative directories or
 * files; what a ref does not have is skipped.
 */
export function materialize(ref, paths, dest) {
  const { root } = tree();
  fs.mkdirSync(dest, { recursive: true });
  const env = { GIT_INDEX_FILE: path.join(dest, '.scratch-index') };
  for (const p of paths) {
    const type = gitTry(['cat-file', '-t', `${ref}:${p}`], { cwd: root });
    if (!type.ok) continue;
    if (type.stdout.trim() === 'tree') git(['read-tree', `--prefix=${p.replace(/\/$/, '')}/`, `${ref}:${p}`], { cwd: root, env });
    else {
      const [mode, , sha] = git(['ls-tree', ref, '--', p], { cwd: root }).split(/\s+/);
      git(['update-index', '--add', '--cacheinfo', `${mode},${sha},${p}`], { cwd: root, env });
    }
  }
  if (fs.existsSync(env.GIT_INDEX_FILE)) {
    // LF everywhere, whatever core.autocrlf says: a scratch tree is read by scans and patched by
    // `git apply` outside a repository, and both want the bytes git stores.
    git(['-c', 'core.autocrlf=false', 'checkout-index', '-a', '-f', `--prefix=${posix(dest).replace(/\/$/, '')}/`], { cwd: root, env });
    fs.rmSync(env.GIT_INDEX_FILE, { force: true });
  }
  return dest;
}

/**
 * The 2-slot lock around everything heavy (`npm ci`, a build, a capture). A directory, because
 * `mkdir` is atomic on every filesystem this runs on; the package id is written inside so a
 * person can see who holds it. A lock older than 25 minutes belongs to a run that died.
 * Released in `finally` and on SIGINT / SIGTERM — never held while waiting for anything else.
 */
export async function withHeavyLock(id, fn, { log = console.log } = {}) {
  const dir = `${tree().pulse}/locks`;
  fs.mkdirSync(dir, { recursive: true });
  const STALE_MS = 25 * 60 * 1000;
  let held = null;
  for (let waited = 0; !held; waited += 1) {
    for (const name of ['heavy-1', 'heavy-2']) {
      const p = `${dir}/${name}`;
      for (let attempt = 0; attempt < 2 && !held; attempt += 1) {
        try {
          fs.mkdirSync(p);
          fs.writeFileSync(`${p}/owner`, `${id}\npid ${process.pid}\n${new Date().toISOString()}\n`);
          held = p;
        } catch (err) {
          if (err.code !== 'EEXIST') throw err;
          let age = 0;
          try {
            age = Date.now() - fs.statSync(p).mtimeMs;
          } catch {
            continue; // released between the mkdir and the stat: try again
          }
          if (age <= STALE_MS) break;
          log(`pulse: ${name} is ${Math.round(age / 60000)} minutes old — a dead run; taking it over`);
          fs.rmSync(p, { recursive: true, force: true });
        }
      }
      if (held) break;
    }
    if (held) break;
    if (waited >= 120) throw new Error('pulse: no heavy lock after 40 minutes — both are held; look at .pulse/locks/');
    if (waited % 3 === 0) log('pulse: both heavy locks are taken — waiting 20 s');
    await sleep(20000);
  }
  const release = () => {
    try {
      fs.rmSync(held, { recursive: true, force: true });
    } catch {
      /* a lock that cannot be removed goes stale by its age */
    }
  };
  const onSignal = () => {
    release();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn();
  } finally {
    release();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

/* ── calling a gate's own scan (R31) ──────────────────────────────────────────────────────────── */

/**
 * Does a gate script of THIS tree export `name`? Read from the source text, never by importing:
 * a gate that has not been split into "scan" and "run" yet executes on import and may call
 * `process.exit`. The exports arrive with F2 (`scanKeyConsumers`, `scanElementReads`, the ratchet's
 * counter); until a tree has them, the rules that need them are reported as BLOCKED, never guessed.
 */
export function gateExports(script, name) {
  const file = `${SCRIPTS_DIR}/${script}`;
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  const word = `(?<![\\w$])${name}(?![\\w$])`;
  return new RegExp(`export\\s+(?:async\\s+)?function\\s+${word}|export\\s+const\\s+${word}|export\\s*\\{[^}]*${word}[^}]*\\}`).test(source);
}

/**
 * Run `name({ root })` of a gate script of this tree over ANOTHER frontend directory (a scratch
 * checkout of a branch tip) and return its result as plain JSON (Map -> object, Set -> array).
 * A child process, with its cwd in `root`: the gates resolve `src/` from the cwd, and a scan must
 * never be able to stop the tool that asked for it.
 */
export function callGateExport(script, name, root, args = {}) {
  const code = [
    'const [url, name, payload] = process.argv.slice(1);',
    'const mod = await import(url);',
    'const plain = (v) => v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, plain(x)]))',
    '  : v instanceof Set ? [...v].map(plain) : Array.isArray(v) ? v.map(plain)',
    '  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;',
    'process.stdout.write(JSON.stringify(plain(await mod[name](JSON.parse(payload)))));',
  ].join('\n');
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', code, pathToFileURL(`${SCRIPTS_DIR}/${script}`).href, name, JSON.stringify({ root: posix(root), ...args })],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true },
  );
  if (r.status !== 0) throw new Error(`${script}: ${name}() failed (${r.status}) — ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}`);
  return JSON.parse(r.stdout);
}

/* ── what a slot remembers about its local applies (PLAN.md 2.1, `<slot>/.pulse/applied.json`) ── */

const appliedPath = () => `${tree().local}/applied.json`;
/** `{ i18n?, variants?, shared? }` — one record per hand-in file applied in THIS worktree. */
export const readApplied = () => readJsonIfExists(appliedPath()) ?? {};
export function writeApplied(record) {
  if (Object.keys(record).length === 0) fs.rmSync(appliedPath(), { force: true });
  else writeFileAtomic(appliedPath(), `${JSON.stringify(record, null, 2)}\n`);
}

/* ── the glob expander — the one every tool imports ───────────────────────────────────────────── */

const expandBraces = (glob) => {
  const m = /\{([^{}]*)\}/.exec(glob);
  if (!m) return [glob];
  return m[1].split(',').flatMap((alt) => expandBraces(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)));
};

const regExpCache = new Map();
// Two stars cross directories (and "a/", two stars, "/b" also matches "a/b"); one star and "?" stay
// inside one path segment; "{a,b}" is alternation. That is all the syntax work-packages.json uses.
export function globToRegExp(glob) {
  if (regExpCache.has(glob)) return regExpCache.get(glob);
  const one = (g) => {
    let out = '';
    for (let i = 0; i < g.length; i += 1) {
      if (g.startsWith('**/', i)) {
        out += '(?:.*/)?';
        i += 2;
      } else if (g.startsWith('**', i)) {
        out += '.*';
        i += 1;
      } else if (g[i] === '*') out += '[^/]*';
      else if (g[i] === '?') out += '[^/]';
      else out += g[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return out;
  };
  const re = new RegExp(`^(?:${expandBraces(glob).map(one).join('|')})$`);
  regExpCache.set(glob, re);
  return re;
}

export const isGlob = (pattern) => /[*?{]/.test(pattern);
export const matchesAny = (file, patterns) => patterns.some((p) => globToRegExp(p).test(file));
/** The files of `files` that `patterns` name. */
export const expandOwns = (patterns, files) => files.filter((f) => matchesAny(f, patterns));

/** A path a pattern certainly matches — used to test a pattern against a pattern. */
const representative = (pattern) => expandBraces(pattern)[0].replace(/\*\*/g, 'x/y').replace(/[*?]/g, 'x');
const patternsOverlap = (a, b) => globToRegExp(a).test(representative(b)) || globToRegExp(b).test(representative(a));

/* ── the ownership model ──────────────────────────────────────────────────────────────────────── */

/** work-packages.json, as the tools use it. `file` is for the self-test (a planted copy). */
export function loadModel({ file } = {}) {
  const wpPath = file ?? `${tree().docs}/work-packages.json`;
  const wp = JSON.parse(fs.readFileSync(wpPath, 'utf8').replace(/\r\n/g, '\n'));
  const packages = [
    ...(wp.foundation ?? []).map((p) => ({ ...p, kind: 'foundation' })),
    ...(wp.screens ?? []).map((p) => ({ ...p, kind: 'screen' })),
  ];
  return {
    wp,
    file: wpPath,
    packages,
    byId: new Map(packages.map((p) => [p.id, p])),
    // The same fingerprint the F0 generator wrote into the first progress file.
    hash: sha256(JSON.stringify(wp)).slice(0, 12),
    integrator: wp.integrator?.owns ?? [],
    frozen: wp.frozen?.paths ?? [],
    frozenExcept: wp.frozen?.except ?? [],
  };
}

export const ownersOf = (file, model) => model.packages.filter((p) => matchesAny(file, p.owns ?? [])).map((p) => p.id);
export const isFrozen = (file, model) => matchesAny(file, model.frozen) && !model.frozenExcept.includes(file);
export const isIntegratorPath = (file, model) => matchesAny(file, model.integrator);
/** A package the integrator runs itself, on `pulse-int` — it has no slot, no branch and no hand-in folder. */
export const isIntegratorPackage = (p) => p.kind === 'foundation' && /\bINT\b/.test(p.parallelGroup ?? '');

/**
 * The id grammar. A work unit is a package (`S-home`, `F4`), a lane stage (`F2:a`, written `F2a`
 * in a branch name because a ref cannot hold a colon) or a fix round (`S-home-fix1`, PLAN.md 7.1).
 * All three have the ownership of their package. Returns null for an id that is none of these.
 *
 *   { raw, id, stage, fix, pkg, branch, handInDirs }
 *
 * `branch` is the local branch that exists for it (or the name it would have); `handInDirs` are
 * the folders its hand-in files may sit in, most specific first — a staged lane keeps one folder
 * per stage (`pkg/F2/a/`) when its stages merge separately.
 */
export function resolveId(raw, model) {
  if (typeof raw !== 'string' || raw === '') return null;
  const fixMatch = /^(.*)-fix(\d+)$/.exec(raw);
  const stem = fixMatch ? fixMatch[1] : raw;
  let pkg = model.byId.get(stem);
  let stage = null;
  if (!pkg) {
    const m = /^(F\d+|S-[a-z-]+?)[:.\-/]?([A-Za-z0-9]+)$/.exec(stem);
    const candidate = m && model.byId.get(m[1]);
    const key = candidate?.stages && Object.keys(candidate.stages).find((k) => k.toLowerCase() === m[2].toLowerCase());
    if (key === undefined || key === false) return null;
    pkg = candidate;
    stage = key;
  }
  const names = [`pulse/${raw}`];
  if (stage !== null) names.push(`pulse/${pkg.id}${stage}`, `pulse/${pkg.id}-${stage}`, `pulse/${pkg.id}`);
  const branch = names.find((n) => refExists(`refs/heads/${n}`)) ?? names[0];
  const base = `docs/pipeline/pulse/pkg/${pkg.id}`;
  return {
    raw,
    id: pkg.id,
    stage,
    fix: fixMatch ? Number(fixMatch[2]) : null,
    pkg,
    branch,
    handInDirs: stage !== null ? [`${base}/${stage}`, base] : [base],
  };
}

/** A hand-in file of a work unit at a ref: `{ path, text }`, or null when the ref has none. */
export function readHandIn(unit, name, ref) {
  for (const dir of unit.handInDirs) {
    const text = readBlob(ref, `${dir}/${name}`);
    if (text !== null) return { path: `${dir}/${name}`, text };
  }
  return null;
}

/** The unit named on a command line, or — with no id — the one the current branch `pulse/<id>` belongs to. */
export function unitFromArgs(argv, model, valueFlags = ['--ref', '--base']) {
  const named = argv.find((a, i) => !a.startsWith('--') && !valueFlags.includes(argv[i - 1]));
  if (named) return resolveId(named, model);
  const branch = gitTry(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: tree().root }).stdout.trim();
  return branch.startsWith('pulse/') ? resolveId(branch.slice('pulse/'.length), model) : null;
}

/**
 * A scratch checkout of a ref for a gate dry run: `frontend/src` and `frontend/scripts`, plus the
 * `frontend/src` hunks of the unit's own committed `shared.patch` — a lane may keep the reader of
 * a new key or the demo case of an element there, and a gate run without it would judge a tree
 * that will never exist. Returns `{ dir, front, note, dispose }`.
 */
export function scratchCheckout(unit, ref, label) {
  const dir = posix(fs.mkdtempSync(path.join(os.tmpdir(), `pulse-${label}-`)));
  materialize(ref, ['frontend/src', 'frontend/scripts'], dir);
  let note = null;
  const shared = unit ? readHandIn(unit, 'shared.patch', ref) : null;
  if (shared) {
    const r = spawnSync('git', ['apply', '--include=frontend/src/*', '--whitespace=nowarn', '-'], { cwd: dir, input: shared.text, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) note = `the unit's shared.patch did not apply in the dry run — what it adds is not seen (${r.stderr.trim().split('\n')[0]})`;
  }
  return { dir, front: `${dir}/frontend`, note, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** The file list a progress entry shows — generated, never typed (PLAN.md 2.3). */
export function fileList(pkg, files) {
  const existing = new Set();
  const toCreate = [];
  for (const pattern of pkg.owns ?? []) {
    const hits = files.filter((f) => globToRegExp(pattern).test(f));
    // A pattern that matches nothing is still to be created — unless the package DELETES it:
    // then matching nothing means the deletion is done.
    if (hits.length === 0 && !(pkg.deletes ?? []).includes(pattern)) toCreate.push(pattern);
    for (const h of hits) existing.add(h);
  }
  return { existing: [...existing].sort(), toCreate };
}

/* ── the check ────────────────────────────────────────────────────────────────────────────────── */

const stripStage = (dep) => dep.split(':')[0];

/** `--list-anchors` of the gate prober, or null while that tool is not in this tree (F2:b). */
export function listAnchors() {
  const script = `${SCRIPTS_DIR}/verify-gates.mjs`;
  if (!fs.existsSync(script)) return null;
  const r = spawnSync(process.execPath, [script, '--list-anchors'], { cwd: FRONTEND_DIR, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`verify-gates.mjs --list-anchors failed (${r.status}): ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Run every check. `files` defaults to the tracked files of this tree.
 * Returns `{ problems, pending, notes, stats }`; `pending` are checks whose subject is not in the
 * tree yet — printed on every run, because a check that silently skips passes forever.
 */
export function checkOwnership(model = loadModel(), files = lsFiles()) {
  const problems = [];
  const pending = [];
  const notes = [];
  const { packages, byId } = model;

  // 0 — the file is well-formed enough to check.
  const seen = new Set();
  for (const p of packages) {
    if (seen.has(p.id)) problems.push(`${p.id} is declared twice`);
    seen.add(p.id);
    if (!Array.isArray(p.owns) || p.owns.length === 0) problems.push(`${p.id} owns nothing — every package owns at least its own files`);
  }

  // 1 — overlap, on files that exist …
  const fileOwners = new Map();
  for (const f of files) {
    const ids = ownersOf(f, model);
    if (ids.length) fileOwners.set(f, ids);
    if (ids.length > 1) problems.push(`${f} is owned by ${ids.join(' and ')} — one file, one owner`);
  }
  // … and pattern against pattern, for the files that do not exist yet.
  for (let i = 0; i < packages.length; i += 1) {
    for (let j = i + 1; j < packages.length; j += 1) {
      for (const a of packages[i].owns ?? []) {
        for (const b of packages[j].owns ?? []) {
          if (!patternsOverlap(a, b)) continue;
          // Already reported file by file above when a tracked file sits in the overlap.
          const reported = files.some((f) => globToRegExp(a).test(f) && globToRegExp(b).test(f));
          if (!reported) problems.push(`${packages[i].id} owns ${a} and ${packages[j].id} owns ${b} — the two patterns overlap`);
        }
      }
    }
  }

  // 2 + 3 — coverage of frontend/src, and nothing frozen is owned.
  const src = files.filter((f) => f.startsWith('frontend/src/'));
  const stats = { packages: packages.length, tracked: files.length, src: src.length, owned: 0, frozen: 0, integratorOnly: 0 };
  for (const f of src) {
    const ids = fileOwners.get(f) ?? [];
    const frozen = isFrozen(f, model);
    if (frozen && ids.length) problems.push(`${f} is frozen for everybody, and ${ids.join(', ')} owns it`);
    if (frozen) stats.frozen += 1;
    else if (ids.length) stats.owned += 1;
    else if (isIntegratorPath(f, model)) stats.integratorOnly += 1;
    else problems.push(`${f} has no owner: no package, not frozen, not on the integrator's list`);
  }
  for (const p of packages) {
    for (const pattern of p.owns ?? []) {
      if (!isGlob(pattern) && isFrozen(pattern, model)) problems.push(`${p.id} owns ${pattern}, which is frozen for everybody`);
    }
  }

  // 4 — a package deletes only what it owns.
  for (const p of packages) {
    for (const d of p.deletes ?? []) {
      const owned = (p.owns ?? []).includes(d) || (p.owns ?? []).some((o) => globToRegExp(o).test(representative(d)));
      if (!owned) problems.push(`${p.id} deletes ${d}, which is not in its owns`);
    }
  }

  // 5 — a pre-claim edit names a later owner that really owns the file.
  const dependsOnTransitively = (from, target, trail = new Set()) => {
    for (const dep of byId.get(from)?.dependsOn ?? []) {
      const id = stripStage(dep);
      if (id === target) return true;
      if (trail.has(id) || !byId.has(id)) continue;
      trail.add(id);
      if (dependsOnTransitively(id, target, trail)) return true;
    }
    return false;
  };
  for (const p of packages) {
    for (const c of p.preClaim ?? []) {
      const where = `${p.id} pre-claim ${c.step ?? '?'}`;
      if (c.laterOwner === '*') {
        // A sweep over many files (the F1.4 codemod): every file it can reach must have SOME owner.
        const reach = files.filter((f) => globToRegExp(c.glob ?? c.file ?? '').test(f));
        if (reach.length === 0) notes.push(`${where}: ${c.glob ?? c.file} matches no tracked file`);
        const orphans = reach.filter((f) => !(fileOwners.get(f)?.length || isFrozen(f, model) || isIntegratorPath(f, model)));
        if (orphans.length) problems.push(`${where}: ${orphans.length} file(s) of ${c.glob} have no later owner — ${orphans.slice(0, 4).join(', ')}`);
        continue;
      }
      const later = byId.get(c.laterOwner);
      if (!later) {
        problems.push(`${where}: later owner "${c.laterOwner}" is not a package`);
        continue;
      }
      if (later.id === p.id) problems.push(`${where}: ${c.file} names itself as the later owner`);
      if (!c.file || !matchesAny(c.file, later.owns ?? [])) problems.push(`${where}: ${c.file} is not owned by ${later.id}, the later owner it names`);
      if (dependsOnTransitively(p.id, later.id)) problems.push(`${where}: ${later.id} comes BEFORE ${p.id} (a dependency) — it cannot be the later owner`);
    }
  }

  // 6 — every dependency resolves; a stage-qualified one to a declared stage.
  for (const p of packages) {
    for (const dep of p.dependsOn ?? []) {
      if (dep.endsWith('*')) {
        if (!packages.some((q) => q.id.startsWith(dep.slice(0, -1)))) problems.push(`${p.id} depends on ${dep}, which matches no package`);
        continue;
      }
      const [id, stage] = dep.split(':');
      const target = byId.get(id);
      if (!target) problems.push(`${p.id} depends on ${dep}, which is not a package`);
      else if (stage !== undefined && !(target.stages && stage in target.stages)) problems.push(`${p.id} depends on ${dep}, and ${id} declares no stage "${stage}"`);
      else if (id === p.id) problems.push(`${p.id} depends on itself`);
    }
  }

  // 7 — hand-in folders, and "must not touch" against "owns".
  for (const p of packages) {
    for (const pattern of p.owns ?? []) {
      const m = /^docs\/pipeline\/pulse\/pkg\/([^/]+)\//.exec(pattern);
      if (m && m[1] !== p.id && !(m[1] === '_int' && isIntegratorPackage(p))) problems.push(`${p.id} owns ${pattern} — the hand-in folder of ${m[1]}`);
    }
    if (p.kind === 'screen' && !(p.owns ?? []).includes(`docs/pipeline/pulse/pkg/${p.id}/**`)) problems.push(`${p.id} does not own its hand-in folder docs/pipeline/pulse/pkg/${p.id}/**`);
    for (const pattern of p.owns ?? []) {
      const banned = (p.mustNotTouch ?? []).find((b) => globToRegExp(b).test(representative(pattern)));
      if (banned) problems.push(`${p.id} is told not to touch ${banned}, and owns ${pattern}`);
    }
  }

  // 8 — a variant element is handed in by exactly one package.
  const elementOwner = new Map();
  for (const p of packages) {
    for (const e of p.variantElements ?? []) {
      if (elementOwner.has(e)) problems.push(`variant element ${e} is claimed by ${elementOwner.get(e)} and ${p.id}`);
      elementOwner.set(e, p.id);
    }
  }

  // 9 — `anchoredBy` against the gate prober's own list.
  const anchoredDeclared = new Map(); // repo path -> package id
  for (const p of packages) {
    for (const line of p.anchoredBy ?? []) {
      const name = /([\w.-]+\.(?:tsx|ts|mjs|css|json|html))/.exec(line)?.[1];
      const file = name && (p.owns ?? []).find((o) => !isGlob(o) && o.endsWith(`/${name}`));
      if (!file) problems.push(`${p.id} anchoredBy "${line}" names no file the package owns`);
      else anchoredDeclared.set(file, p.id);
    }
  }
  const anchors = listAnchors();
  if (anchors === null) {
    pending.push('anchors: scripts/verify-gates.mjs is not in this tree yet (F2:b) — anchoredBy was checked against owns only');
  } else {
    // Declared and not (yet) probed is not a defect: an anchor is declared for the whole effort
    // and planted by a later step (WorkoutPlayer's redirect arrives with F16). A brief that says
    // "keep this literal" too early costs nothing — so it is printed on every run, not refused.
    for (const [file, id] of anchoredDeclared) {
      if (!anchors.includes(file)) pending.push(`anchors: ${id} declares an anchor in ${file}, and verify:gates --list-anchors does not list it (yet)`);
    }
    for (const file of anchors) {
      const ids = ownersOf(file, model).filter((id) => !isIntegratorPackage(byId.get(id)));
      const screens = ids.filter((id) => byId.get(id).kind === 'screen');
      if (screens.length && !anchoredDeclared.has(file)) problems.push(`verify:gates anchors on ${file}, and ${screens.join(', ')} has no anchoredBy line for it — its brief cannot say "keep this literal"`);
      else if (ids.length && !anchoredDeclared.has(file)) notes.push(`verify:gates anchors on ${file}, owned by lane ${ids.join(', ')}`);
    }
  }

  return { problems, pending, notes, stats, anchors };
}

/* ── command line ─────────────────────────────────────────────────────────────────────────────── */

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const VALUE = ['--wp', '--files', '--owner'];
  const stray = argv.filter((a, i) => (a.startsWith('--') ? ![...VALUE, '--json'].includes(a) : !VALUE.includes(argv[i - 1])));
  if (stray.length) {
    console.error(`pulse-owns-check: unknown argument ${stray.join(' ')}
usage: node scripts/pulse-owns-check.mjs [--wp <file>] [--files <id>] [--owner <path>] [--json]`);
    process.exit(2);
  }
  const model = loadModel({ file: opt('--wp') && path.resolve(opt('--wp')) });
  const files = lsFiles();

  if (opt('--files') !== undefined) {
    const unit = resolveId(opt('--files'), model);
    if (!unit) {
      console.error(`pulse-owns-check: "${opt('--files')}" is not a package, a lane stage or a fix round`);
      process.exit(2);
    }
    const list = fileList(unit.pkg, files);
    if (argv.includes('--json')) console.log(JSON.stringify(list, null, 2));
    else {
      for (const f of list.existing) console.log(f);
      for (const f of list.toCreate) console.log(`${f}   (to create)`);
    }
    process.exit(0);
  }

  if (opt('--owner') !== undefined) {
    const file = posix(opt('--owner')).replace(/^\.\//, '');
    const ids = ownersOf(file, model);
    const who = isFrozen(file, model) ? 'frozen for everybody' : ids.length ? ids.join(', ') : isIntegratorPath(file, model) ? 'the integrator' : file.startsWith('backend/') ? 'nobody in this effort (backend/)' : 'nobody';
    console.log(`${file}: ${who}`);
    process.exit(0);
  }

  const result = checkOwnership(model, files);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.problems.length ? 1 : 0);
  }
  const { stats } = result;
  for (const n of result.notes) console.log(`  note: ${n}`);
  for (const p of result.pending) console.log(`  PENDING ${p}`);
  if (result.problems.length) {
    console.error(`\npulse-owns-check: ${result.problems.length} problem(s) in ${path.basename(model.file)}\n`);
    for (const p of result.problems) console.error(`  ${p}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `pulse-owns-check: OK — ${stats.packages} packages, no overlap; ${stats.src} files under frontend/src: ` +
      `${stats.owned} owned by one package, ${stats.frozen} frozen, ${stats.integratorOnly} with the integrator only` +
      (result.pending.length ? `; ${result.pending.length} check(s) pending` : ''),
  );
}
