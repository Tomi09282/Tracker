// scripts/lib/worker-sources.mjs — WHERE the worker's code lives, answered once for every gate.
//
// Until package B0 every named transaction sat in src/db/worker.js, and three gates read that one
// file by name: check-worker-tx (ADR-0005, no conditional return after a write), check-admin-audit
// (an admin route's delegated transaction writes its audit row) and check-route-tx. The LifeOS
// transactions live in src/db/tx/<domain>.js, re-exported from worker.js. A gate that kept reading
// only worker.js would report OK over every one of them — the "OK printed under a zero" this
// codebase has already been bitten by twice. So the file list is defined HERE, once, and each gate
// asks this module instead of naming a file.
import fs from 'node:fs';
import path from 'node:path';

export const WORKER = 'src/db/worker.js';
export const TX_DIR = 'src/db/tx';
export const FACADE = 'src/db/index.js';

/** worker.js first, then every tx/*.js in name order. Paths are repo-relative to backend/. */
export function workerFiles() {
  const files = [WORKER];
  if (fs.existsSync(TX_DIR)) {
    for (const f of fs.readdirSync(TX_DIR).filter((n) => n.endsWith('.js')).sort()) {
      files.push(`${TX_DIR}/${f}`);
    }
  }
  return files;
}

/**
 * Every worker-side module, tx files AND the helper modules they share (src/db/*.js except the
 * facade): the helpers hold no transaction of their own, but they WRITE inside their callers'
 * (package B-habits-tasks: lifeos-ledger.js postCoinEvent, lifeos-items.js settleHabitsOn, ...).
 */
export function workerHelperFiles() {
  const files = workerFiles();
  for (const f of fs.readdirSync('src/db').filter((n) => n.endsWith('.js')).sort()) {
    const rel = `src/db/${f}`;
    if (rel !== FACADE && !files.includes(rel)) files.push(rel);
  }
  return files;
}

/**
 * The names of worker-side functions that WRITE: their body runs a statement (`.run(`) or calls
 * another function that does (transitively). A transaction that calls one has written as surely
 * as one that runs the INSERT itself — check-worker-tx counts the call as a write.
 * `blank` removes comments first (the caller passes the shared blankComments).
 */
export function writingFunctions(blank = (t) => t) {
  const bodies = new Map();
  for (const file of workerHelperFiles()) {
    const src = blank(fs.readFileSync(path.resolve(file), 'utf8'));
    for (const m of src.matchAll(/(?:^|\n)(?:export\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
      const start = m.index + m[0].length - 1;
      let depth = 0;
      let end = src.length;
      for (let i = start; i < src.length; i += 1) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      bodies.set(m[1], src.slice(start, end));
    }
  }
  const writers = new Set([...bodies].filter(([, b]) => /\.run\(/.test(b)).map(([n]) => n));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, body] of bodies) {
      if (writers.has(name)) continue;
      if ([...writers].some((w) => new RegExp(`\\b${w}\\(`).test(body))) {
        writers.add(name);
        grew = true;
      }
    }
  }
  // A transaction's own export is not a helper; only what a body CALLS matters, so the exported
  // transactions stay in the set harmlessly (no transaction calls another).
  return writers;
}

/** [{ file, src }] — the raw text of each worker-side file. */
export function workerSources() {
  return workerFiles().map((file) => ({ file, src: fs.readFileSync(path.resolve(file), 'utf8') }));
}

/**
 * The tx files worker.js actually re-exports. A tx file that exists but is not re-exported is a
 * transaction Piscina cannot find by name — the facade's call would fail at run time with
 * "not a function", on the first request that needed it.
 */
export function reexportedTxFiles() {
  const src = fs.readFileSync(path.resolve(WORKER), 'utf8');
  return new Set(
    [...src.matchAll(/export\s*\*\s*from\s*'\.\/tx\/([\w-]+\.js)'/g)].map((m) => `${TX_DIR}/${m[1]}`),
  );
}

/** Every `export function <name>` across the worker side: name -> file. */
export function workerExports() {
  const out = new Map();
  for (const { file, src } of workerSources()) {
    for (const m of src.matchAll(/export\s+function\s+(\w+)/g)) out.set(m[1], file);
  }
  return out;
}

/** The facade's mapping `export const x = (args) => pool.run(args, { name: 'xTx' })`: x -> xTx. */
export function facadeToTx() {
  const src = fs.readFileSync(path.resolve(FACADE), 'utf8');
  const map = new Map();
  for (const m of src.matchAll(/export const (\w+)\s*=\s*\([^)]*\)\s*=>\s*pool\.run\([^;]*?name:\s*'(\w+)'/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}
