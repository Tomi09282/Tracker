#!/usr/bin/env node
// scripts/pulse-fixture-check.mjs — a fixture may only show what the product can produce (PLAN.md R26).
//
// Responses are not validated at run time (`lib/api.ts` returns `body as T`), so a free-hand JSON
// fixture can draw anything: a status the server never sends, a field that does not exist, a
// number where the app gets a string. A frame "matched" on such a fixture proves nothing.
//
// So a fixture is not a document. It is a LIST OF EDITS over a recorded response of the same
// endpoint, and this tool refuses an edit that leaves what the recordings show:
//
//   key    the pointer (or a key inside the value) is one no recording of the endpoint has
//   type   the value's JSON type was never seen at that place
//   enum   the place only ever holds identifier-like words (`planned`, `in_progress`) and the
//          value is not one of the words recorded — record a response that carries it instead
//   remove a key every recording has cannot be removed
//
// WHAT IT READS — two shapes, both documented in docs/pipeline/pulse/pkg/F4/README.md:
//
//   a recording   any JSON file under <main checkout>/.pulse/rec/<account>/ that is (or lists)
//                 { "method": "GET", "path": "/api/v1/my-plans/today", "status": 200, "body": … }
//                 (`url` instead of `path`, and `bodyFile` next to the entry, are accepted; a body
//                 that is not JSON is skipped)
//   a fixture     an entry found under a key named `fixture`, `fixtures` or `stubs`, anywhere in
//                 the states file:
//                 { "method": "GET", "path": "/api/v1/my-plans/today",
//                   "edits": [ { "pointer": "/session/status", "value": "planned" },
//                              { "pointer": "/session/note", "remove": true } ] }
//                 A mutation outcome or a stub has no recording to edit; it is
//                 { "method": "POST", "path": "/api/v1/sets/:id/check", "status": 409, "body": {…} }
//                 and its body must be empty, or — for status >= 400 — hold only the keys of the
//                 API's error envelope.
//
// Usage:
//   node scripts/pulse-fixture-check.mjs <id> [--ref <ref>]     docs/pipeline/pulse/pkg/<id>/states.json
//   node scripts/pulse-fixture-check.mjs --file <a.json> […]    any states / fixture file
//   node scripts/pulse-fixture-check.mjs --all                  pulse-frames.json, scripts/fixtures/**, every pkg
//   --rec <dir> (default <main checkout>/.pulse/rec)   --json
//
// Exit: 0 every fixture holds (or there is none), 1 refused, 2 usage. Not in the build chain.
import fs from 'node:fs';
import path from 'node:path';
import { isMain, loadModel, lsFiles, posix, readHandIn, resolveId, tree } from './pulse-owns-check.mjs';

/* ── endpoints ────────────────────────────────────────────────────────────────────────────────── */

const ID_LIKE = (s) => /^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^[:{]/.test(s) || (s.length >= 10 && /\d/.test(s) && /[a-z]/i.test(s) && !s.includes('-'));
/** `GET /api/v1/clients/:id/plans` — the identity of an endpoint, whatever ids and query a call carried. */
export function endpointOf(method, rawPath) {
  let p = String(rawPath);
  try {
    p = new URL(p, 'http://x').pathname;
  } catch {
    /* not a URL: use it as written */
  }
  return `${String(method ?? 'GET').toUpperCase()} ${p.split('/').map((s) => (s && ID_LIKE(s) ? ':id' : s)).join('/')}`;
}

/* ── the recording store ──────────────────────────────────────────────────────────────────────── */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const looksRecorded = (v) => isObj(v) && typeof (v.path ?? v.url) === 'string' && (typeof v.method === 'string' || 'status' in v) && ('body' in v || 'bodyFile' in v || 'json' in v);

/** Every JSON response recorded under `recDir`: `[{ account, endpoint, status, body, file }]`. */
export function loadRecordings(recDir) {
  const out = [];
  if (!fs.existsSync(recDir)) return out;
  const take = (entry, file) => {
    let body = entry.body ?? entry.json;
    if (body === undefined && typeof entry.bodyFile === 'string') {
      try {
        body = fs.readFileSync(path.resolve(path.dirname(file), entry.bodyFile), 'utf8');
      } catch {
        return;
      }
    }
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return; // an image, a CSV, an empty 204 — nothing a pointer could address
      }
    }
    if (body === undefined) return;
    out.push({
      account: posix(path.relative(recDir, file)).split('/')[0],
      endpoint: endpointOf(entry.method, entry.path ?? entry.url),
      status: Number(entry.status ?? 200),
      body,
      file,
    });
  };
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        let doc;
        try {
          doc = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {
          continue;
        }
        const list = Array.isArray(doc) ? doc : Array.isArray(doc?.entries) ? doc.entries : [doc];
        for (const entry of list) if (looksRecorded(entry)) take(entry, p);
      }
    }
  })(recDir);
  return out;
}

/* ── the shape of an endpoint, learned from its recordings ────────────────────────────────────── */

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const WORD = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
/** A key that is data, not schema (a date, an id): every such sibling shares one place in the shape. */
const dataKey = (k) => /^\d/.test(k);
const seg = (k) => (dataKey(k) ? '*' : k.replace(/~/g, '~0').replace(/\//g, '~1'));

/** `Map<pointer pattern, { types, strings, count }>` over every recorded body of one endpoint. */
export function buildShape(bodies) {
  const shape = new Map();
  const visit = (value, at) => {
    const node = shape.get(at) ?? { types: new Set(), strings: new Set(), count: 0 };
    shape.set(at, node);
    node.count += 1;
    const t = typeOf(value);
    node.types.add(t);
    if (t === 'string') node.strings.add(value);
    else if (t === 'array') for (const item of value) visit(item, `${at}/*`);
    else if (t === 'object') for (const [k, v] of Object.entries(value)) visit(v, `${at}/${seg(k)}`);
  };
  for (const body of bodies) visit(body, '');
  return shape;
}

/** A place that only ever held identifier-like words is an enum: its values are a closed set. */
const isEnum = (node) => node.strings.size > 0 && node.types.size === 1 && [...node.strings].every((s) => WORD.test(s));

const patternOf = (pointer) =>
  pointer === ''
    ? ''
    : `/${pointer
        .slice(1)
        .split('/')
        .map((s) => (s === '-' || dataKey(s.replace(/~1/g, '/').replace(/~0/g, '~')) ? '*' : s))
        .join('/')}`;

/** Problems of one value at one place: unknown keys, unseen types, values outside an enum. */
function judge(value, at, shape, shown, problems) {
  const node = shape.get(at);
  if (!node) {
    problems.push(`key: ${shown || '(the whole body)'} — no recording of this endpoint has it`);
    return;
  }
  const t = typeOf(value);
  if (!node.types.has(t)) {
    problems.push(`type: ${shown || '(the whole body)'} is ${t === 'string' || t === 'number' || t === 'boolean' ? `${t} ${JSON.stringify(value)}` : t}, the recordings have ${[...node.types].join(' | ')}`);
    return;
  }
  if (t === 'string' && isEnum(node) && !node.strings.has(value)) {
    problems.push(`enum: ${shown} = ${JSON.stringify(value)} — the recordings only ever have ${[...node.strings].sort().map((s) => JSON.stringify(s)).join(', ')}; record a response that carries it`);
  } else if (t === 'array') value.forEach((item, i) => judge(item, `${at}/*`, shape, `${shown}/${i}`, problems));
  else if (t === 'object') for (const [k, v] of Object.entries(value)) judge(v, `${at}/${seg(k)}`, shape, `${shown}/${k}`, problems);
}

/** Check the edit list of one fixture against the shape of its endpoint. */
export function checkEdits(shape, edits) {
  const problems = [];
  if (!Array.isArray(edits)) return ['"edits" must be a list of { pointer, value } or { pointer, remove: true }'];
  edits.forEach((edit, i) => {
    if (!isObj(edit) || typeof edit.pointer !== 'string' || (edit.pointer !== '' && !edit.pointer.startsWith('/'))) {
      problems.push(`edits[${i}]: "pointer" must be a JSON pointer ("/session/status")`);
      return;
    }
    const at = patternOf(edit.pointer);
    if (edit.remove === true) {
      const node = shape.get(at);
      const parent = shape.get(at.slice(0, at.lastIndexOf('/')));
      if (!node) problems.push(`key: ${edit.pointer} — no recording of this endpoint has it`);
      else if (at.endsWith('/*')) return; // one element fewer in a list is always a possible response
      else if (parent && node.count >= parent.count) problems.push(`remove: ${edit.pointer} — every recording of this endpoint has it; the product never sends the object without it`);
      return;
    }
    if (!('value' in edit)) {
      problems.push(`edits[${i}] ${edit.pointer}: needs "value" (or "remove": true)`);
      return;
    }
    judge(edit.value, at, shape, edit.pointer, problems);
  });
  return problems;
}

/* ── fixtures in a states file ────────────────────────────────────────────────────────────────── */

const FIXTURE_KEYS = ['fixture', 'fixtures', 'stubs'];
const asEntries = (value) => {
  if (Array.isArray(value)) return value;
  if (!isObj(value)) return [];
  if ('path' in value || 'edits' in value) return [value];
  // the map form: { "GET /api/v1/x": [ …edits ] | { …entry } }
  return Object.entries(value).map(([k, v]) => {
    const [method, ...rest] = k.trim().split(/\s+/);
    const where = rest.length ? { method, path: rest.join(' ') } : { path: method };
    return Array.isArray(v) ? { ...where, edits: v } : { ...where, ...(isObj(v) ? v : {}) };
  });
};

/** Every fixture entry of a document, with the path that leads to it (for the message). */
export function extractFixtures(doc) {
  const found = [];
  (function walk(node, trail) {
    if (Array.isArray(node)) node.forEach((item, i) => walk(item, `${trail}[${i}]`));
    else if (isObj(node)) {
      for (const [k, v] of Object.entries(node)) {
        const where = trail ? `${trail}.${k}` : k;
        if (FIXTURE_KEYS.includes(k)) asEntries(v).forEach((entry, i) => found.push({ where: `${where}[${i}]`, entry }));
        else walk(v, isObj(v) && typeof (v.key ?? v.name ?? v.frame) === 'string' ? `${trail ? `${trail}.` : ''}${v.key ?? v.name ?? v.frame}` : where);
      }
    }
  })(doc, '');
  return found;
}

/**
 * Check every fixture of one parsed document. `recordings` is the result of `loadRecordings`.
 * Returns `{ fixtures, problems }`.
 */
export function checkDocument(doc, recordings, label) {
  const problems = [];
  const fixtures = extractFixtures(doc);
  const byEndpoint = new Map();
  for (const r of recordings) byEndpoint.set(r.endpoint, [...(byEndpoint.get(r.endpoint) ?? []), r]);
  const shapes = new Map();
  const shapeOf = (endpoint) => {
    if (!shapes.has(endpoint)) shapes.set(endpoint, buildShape((byEndpoint.get(endpoint) ?? []).map((r) => r.body)));
    return shapes.get(endpoint);
  };
  // The error envelope, as the recordings show it; the API's documented one when none was recorded.
  const errorKeys = new Set(recordings.filter((r) => r.status >= 400 && isObj(r.body)).flatMap((r) => Object.keys(r.body)));
  if (errorKeys.size === 0) for (const k of ['error', 'code', 'requestId']) errorKeys.add(k);

  for (const { where, entry } of fixtures) {
    const at = `${label}: ${where}`;
    if (!isObj(entry) || typeof entry.path !== 'string' || !entry.path.startsWith('/')) {
      problems.push(`${at} — a fixture names its endpoint: { "method", "path": "/api/v1/…" }`);
      continue;
    }
    const endpoint = endpointOf(entry.method, entry.path);
    const known = byEndpoint.has(endpoint);
    const say = (p) => problems.push(`${at} (${endpoint}) — ${p}`);
    if ('edits' in entry) {
      if (!known) say('no recording of this endpoint: a fixture is an edit of a recorded response (R26). Record it first (pulse-shot --record --only-missing).');
      else for (const p of checkEdits(shapeOf(endpoint), entry.edits)) say(p);
    }
    if ('body' in entry && entry.body !== null && !(isObj(entry.body) && Object.keys(entry.body).length === 0)) {
      if (known) {
        const inner = [];
        judge(entry.body, '', shapeOf(endpoint), '', inner);
        for (const p of inner) say(p);
      } else if (Number(entry.status ?? 200) >= 400 && isObj(entry.body)) {
        const extra = Object.keys(entry.body).filter((k) => !errorKeys.has(k));
        if (extra.length) say(`key: ${extra.join(', ')} — not part of the API's error envelope (${[...errorKeys].join(', ')})`);
      } else {
        say('a free-hand body for an endpoint that was never recorded cannot be checked (R26): record the response and edit it, or keep the outcome to a status');
      }
    }
  }
  return { fixtures: fixtures.length, problems };
}

/** The states file of a work unit (working tree, or a ref) against the recording store. For pulse-merge-check. */
export function checkFixturesOf(unit, { ref = null, recDir = `${tree().pulse}/rec` } = {}) {
  let text = null;
  let file = null;
  if (ref) {
    const hit = readHandIn(unit, 'states.json', ref);
    text = hit?.text ?? null;
    file = hit?.path ?? null;
  } else {
    for (const dir of unit.handInDirs) {
      const p = `${tree().root}/${dir}/states.json`;
      if (fs.existsSync(p)) {
        text = fs.readFileSync(p, 'utf8');
        file = `${dir}/states.json`;
        break;
      }
    }
  }
  if (text === null) return { file: null, fixtures: 0, recordings: 0, problems: [] };
  return checkFiles([{ label: file, text }], recDir);
}

function checkFiles(files, recDir) {
  const recordings = loadRecordings(recDir);
  const out = { file: files.map((f) => f.label).join(', '), fixtures: 0, recordings: recordings.length, problems: [] };
  for (const f of files) {
    let doc;
    try {
      doc = JSON.parse(f.text);
    } catch (err) {
      out.problems.push(`${f.label} is not valid JSON — ${err.message}`);
      continue;
    }
    const r = checkDocument(doc, recordings, f.label);
    out.fixtures += r.fixtures;
    out.problems.push(...r.problems);
  }
  // Fail closed: fixtures that cannot be held against anything are not "fine".
  if (out.fixtures > 0 && recordings.length === 0) {
    out.problems.unshift(`${recDir} holds no recording — ${out.fixtures} fixture(s) cannot be checked against anything (the freeze comes first, PLAN.md 2.5)`);
  }
  return out;
}

/* ── command line ─────────────────────────────────────────────────────────────────────────────── */

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
  const recDir = values('--rec')[0] ? path.resolve(values('--rec')[0]) : `${tree().pulse}/rec`;
  const { root } = tree();
  let result;
  let what;

  if (values('--file').length) {
    what = values('--file').join(', ');
    result = checkFiles(values('--file').map((f) => ({ label: f, text: fs.readFileSync(path.resolve(f), 'utf8') })), recDir);
  } else if (argv.includes('--all')) {
    what = 'every frame and package fixture';
    const tracked = lsFiles().filter((f) => f === 'frontend/scripts/pulse-frames.json' || (f.startsWith('frontend/scripts/fixtures/') && f.endsWith('.json')) || /^docs\/pipeline\/pulse\/pkg\/.+\/states\.json$/.test(f));
    result = checkFiles(tracked.filter((f) => fs.existsSync(`${root}/${f}`)).map((f) => ({ label: f, text: fs.readFileSync(`${root}/${f}`, 'utf8') })), recDir);
  } else {
    const model = loadModel();
    const unit = resolveId(argv.find((a, i) => !a.startsWith('--') && !['--ref', '--rec', '--file'].includes(argv[i - 1])), model);
    if (!unit) {
      console.error('usage: node scripts/pulse-fixture-check.mjs <id> [--ref <ref>] | --file <states.json> | --all   [--rec <dir>] [--json]');
      process.exit(2);
    }
    what = unit.raw;
    result = checkFixturesOf(unit, { ref: values('--ref')[0] ?? null, recDir });
  }

  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else if (result.problems.length) {
    console.error(`pulse-fixture-check ${what}: ${result.problems.length} problem(s) in ${result.fixtures} fixture(s)\n`);
    for (const p of result.problems) console.error(`  ${p}`);
    console.error('');
  } else {
    console.log(`pulse-fixture-check ${what}: OK — ${result.fixtures} fixture(s)${result.file ? ` in ${result.file}` : ' (no states file)'}, held against ${result.recordings} recorded response(s)`);
  }
  process.exit(result.problems.length ? 1 : 0);
}
