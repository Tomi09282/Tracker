#!/usr/bin/env node
/**
 * verify-import-translations — the exercise-translation importer, end to end, on a throwaway DB.
 *
 * ═══ WHAT THIS HAS TO PROVE ════════════════════════════════════════════════════════════════════
 *
 *   refusal      — an unmigrated database is refused (exit 1, says "migrate", writes nothing); a
 *                  malformed file, an unknown source, an extra key and an out-of-bounds value are
 *                  refused before a single row is written;
 *   dry run      — plans and reports the real counts but the table is byte-identical afterwards;
 *   counts       — inserted / updated / skipped-protected / skipped-no-name / unknown-exercise on a
 *                  fixture that holds exactly one of each case;
 *   protection   — a 'human' row and a 'dataset' row are untouched, every column including
 *                  updated_at; a nameless entry refines a machine row without renaming it;
 *   FTS          — the new name is searchable and the old one is gone (the triggers did it), and
 *                  FTS5's own integrity-check passes;
 *   idempotence  — a second run reports 0 inserted / 0 updated and leaves the whole table
 *                  byte-identical (no updated_at bump either);
 *   --limit      — bounds the entries read;
 *   the API      — GET /exercises and GET /exercises/:id answer in Hungarian (and German) with
 *                  `translated = 1`, an exercise without a row still falls back to English with
 *                  `translated = 0`, search by the Hungarian name finds it, and GET /sources still
 *                  serves the CC-BY-SA attribution the translations rely on.
 *
 * ═══ HERMETIC ══════════════════════════════════════════════════════════════════════════════════
 *
 * A throwaway encrypted database in the OS temp directory, the importer run as a CHILD PROCESS (the
 * real script, not a reimplementation), and a throwaway server on a random port. Every secret is
 * generated here with crypto.randomBytes, lives in this process and its children, and is never
 * printed. The shipped data files are not read: the fixtures are written to the temp directory.
 *
 * Run: npm run verify:import-translations
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(tmpdir(), 'tracker-verify-import-translations-'));
const port = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${port}`;
const DB_FILE = path.join(dir, 'verify-import.db');

const SECRETS = {
  DB_MASTER_KEY: randomBytes(32).toString('hex'),
  DB_KEY_SALT: randomBytes(16).toString('hex'),
  JWT_SECRET: randomBytes(32).toString('base64url'),
};
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: String(port),
  DB_PATH: DB_FILE,
  JWT_KID: 'verify-import',
  LOG_LEVEL: 'warn',
  CORS_ALLOWED_ORIGINS: '',
  DB_POOL_THREADS: '2',
  ...SECRETS,
});
for (const k of ['JWT_SECRET_PREV', 'JWT_KID_PREV', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k];

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (ok) pass += 1;
  else fail += 1;
};

let server = null;
let db = null;
const cleanup = (code) => {
  try {
    server?.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      db?.close();
    } catch {
      /* the OS reclaims it */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the OS reclaims the temp dir either way */
    }
    process.exit(code);
  }, 500);
};

/** Runs the REAL importer as a child; returns { code, stdout, stderr }. */
const importer = (args, { dbPath = DB_FILE } = {}) => {
  const r = spawnSync(process.execPath, ['scripts/import-exercise-translations.mjs', ...args], {
    env: { ...process.env, DB_PATH: dbPath },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const report = (args) => {
  const r = importer([...args, '--json']);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* reported by the caller's check */
  }
  return { ...r, json };
};

try {
  await main();
} catch (err) {
  check('the run completed', false, String(err?.stack ?? err).slice(0, 400));
}
console.log(`\nverify-import-translations: ${pass} passed, ${fail} failed`);
cleanup(fail === 0 ? 0 : 1);

/* ── the run ─────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  const { getDb } = await import('../src/db/conn.js');
  const worker = await import('../src/db/worker.js');
  const { normalizeText } = await import('../src/lib/normalize.js');
  const argon2 = (await import('argon2')).default;

  /* ── refusal: an unmigrated schema ───────────────────────────────────────────────────────── */

  const fixtureDir = path.join(dir, 'fixture');
  const write = (folder, name, value) => {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, name), typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  };
  const huFile = {
    'free-exercise-db': {
      vfy_a: { name: 'Alfa fekvenyomás', description: 'Hosszabb leírás.', instructions: ['Első lépés.', 'Második lépés.'] },
      vfy_b: { description: 'Csak leírás a gépi sorra.', instructions: ['Egyetlen lépés.'] },
      vfy_g: { name: 'Golf nyújtás újrafordítva' },
    },
    wger: {
      9001: { name: 'Charlie gépi evezés', description: 'gépi szöveg' },
      9003: { description: 'Név nélküli bejegyzés' },
      424242: { name: 'Ismeretlen gyakorlat' },
    },
  };
  const deFile = {
    'free-exercise-db': { vfy_a: { name: 'Alpha Bankdrücken', instructions: ['Erster Schritt.'] } },
    wger: {
      9002: { name: 'Delta Fliegende (maschinell)' },
      9003: { name: 'Echo Kniebeuge', description: 'Eine Beschreibung.' },
    },
  };
  write(fixtureDir, 'hu.json', huFile);
  write(fixtureDir, 'de.json', deFile);

  const bare = importer(['--dir', fixtureDir], { dbPath: path.join(dir, 'never-migrated.db') });
  check('an unmigrated database is refused with exit 1', bare.code === 1, `exit ${bare.code}`);
  check('the refusal says to run the migration', /migrat/i.test(bare.stderr) && /npm run migrate/.test(bare.stderr), bare.stderr.slice(0, 120));
  check('the refusal prints no report', bare.stdout === '', `stdout ${bare.stdout.length} bytes`);

  /* ── a migrated scratch database with a handful of exercises ─────────────────────────────── */

  db = getDb();
  const MIGRATIONS = path.resolve('src/db/migrations');
  worker.migrate({
    files: fs
      .readdirSync(MIGRATIONS)
      .filter((n) => /^\d+_.*\.sql$/.test(n))
      .sort()
      .map((n) => ({ version: Number(n.match(/^(\d+)_/)[1]), sql: fs.readFileSync(path.join(MIGRATIONS, n), 'utf8') })),
  });
  // `de` is rostered but disabled by default; the API check below needs it served.
  db.prepare("UPDATE languages SET enabled = 1 WHERE code = 'de'").run();

  const insertExercise = db.prepare(
    `INSERT INTO exercises (name, normalized_name, status, source, source_uid, difficulty, exercise_type)
     VALUES (?, ?, 'global', ?, ?, 'beginner', 'strength')`,
  );
  const insertTranslation = db.prepare(
    `INSERT INTO exercise_translations (exercise_id, lang, name, normalized_name, description, instructions, origin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const mk = (name, source, uid) => Number(insertExercise.run(name, normalizeText(name), source, uid).lastInsertRowid);
  const tr = (id, lang, name, origin, description = null, instructions = null) =>
    insertTranslation.run(id, lang, name, normalizeText(name), description, instructions, origin);

  const A = mk('Verify Alpha Press', 'free-exercise-db', 'vfy_a'); // no translation yet            -> hu + de INSERT
  const B = mk('Verify Bravo Curl', 'free-exercise-db', 'vfy_b'); // machine hu name only           -> hu REFINE
  const C = mk('Verify Charlie Row', 'wger', '9001'); //           human hu row                    -> hu PROTECTED
  const D = mk('Verify Delta Fly', 'wger', '9002'); //             dataset de row                  -> de PROTECTED
  const E = mk('Verify Echo Squat', 'wger', '9003'); //            nothing                          -> hu NO-NAME, de INSERT
  const F = mk('Verify Foxtrot Plank', 'free-exercise-db', 'vfy_f'); // in no file                  -> stays English
  const G = mk('Verify Golf Stretch', 'free-exercise-db', 'vfy_g'); // machine hu "old" name         -> hu NAME REPLACED
  for (const [id, name] of [[A, 'Verify Alpha Press'], [B, 'Verify Bravo Curl'], [C, 'Verify Charlie Row'], [D, 'Verify Delta Fly'], [E, 'Verify Echo Squat'], [F, 'Verify Foxtrot Plank'], [G, 'Verify Golf Stretch']]) {
    tr(id, 'en', name, 'dataset');
  }
  tr(B, 'hu', 'Bravo hajlítás gépen', 'machine');
  tr(C, 'hu', 'Charlie evezés (edző javította)', 'human', 'Az edző saját leírása.', JSON.stringify(['Edzői lépés.']));
  tr(D, 'de', 'Delta Fliegende (wger)', 'dataset', 'wger Beschreibung.');
  tr(G, 'hu', 'Golfozó nyújtás régi', 'machine');

  const snapshot = () => JSON.stringify(db.prepare('SELECT * FROM exercise_translations ORDER BY id').all());
  const rowOf = (id, lang) => db.prepare('SELECT * FROM exercise_translations WHERE exercise_id = ? AND lang = ?').get(id, lang);
  const countRows = () => db.prepare('SELECT COUNT(*) AS n FROM exercise_translations').get().n;

  /* ── refusal: bad files (before any write) ──────────────────────────────────────────────── */

  const before = snapshot();
  const rejects = [
    ['a file that is not JSON', 'this is not json'],
    ['an unknown source', { 'some-other-db': { x: { name: 'Valami' } } }],
    ['an unknown field on an entry', { wger: { 9001: { name: 'Valami', origin: 'human' } } }],
    ['a name beyond the 120-character bound', { wger: { 9001: { name: 'x'.repeat(121) } } }],
    ['an empty entry', { wger: { 9001: {} } }],
    ['an array where the steps object belongs', { wger: [] }],
    ['more than 30 steps', { wger: { 9001: { instructions: Array.from({ length: 31 }, () => 'lépés') } } }],
  ];
  for (const [label, body] of rejects) {
    const badDir = path.join(dir, `bad-${rejects.findIndex((r) => r[0] === label)}`);
    write(badDir, 'hu.json', body);
    const r = importer(['--dir', badDir]);
    check(`refused before any write: ${label}`, r.code === 1 && snapshot() === before, `exit ${r.code}`);
  }
  // One bad file refuses the whole run, even when the other language is fine.
  const mixed = path.join(dir, 'mixed');
  write(mixed, 'hu.json', huFile);
  write(mixed, 'de.json', { wger: { 9002: { name: 'x' } } });
  const m = importer(['--dir', mixed]);
  check('one malformed language refuses the whole run (the good one is not half-applied)', m.code === 1 && snapshot() === before, `exit ${m.code}`);
  check('an unknown argument is refused (exit 2)', importer(['--bogus']).code === 2);
  check('--lang with a language that has no file is refused', importer(['--dir', fixtureDir, '--lang', 'fr']).code === 1);

  /* ── dry run ────────────────────────────────────────────────────────────────────────────── */

  const dry = report(['--dir', fixtureDir, '--dry']);
  check('the dry run exits 0', dry.code === 0, `exit ${dry.code} ${dry.stderr.slice(0, 120)}`);
  check('the dry run leaves the table byte-identical', snapshot() === before);
  check('the dry run reports the real plan (hu: 1 insert, 2 updates)', dry.json?.languages?.hu?.inserted === 1 && dry.json?.languages?.hu?.updated === 2, JSON.stringify(dry.json?.languages?.hu));

  /* ── the real run ───────────────────────────────────────────────────────────────────────── */

  const humanBefore = rowOf(C, 'hu');
  const datasetBefore = rowOf(D, 'de');
  const enBefore = JSON.stringify([A, B, C, D, E, F, G].map((id) => rowOf(id, 'en')));

  const run1 = report(['--dir', fixtureDir]);
  check('the first run exits 0', run1.code === 0, `exit ${run1.code} ${run1.stderr.slice(0, 160)}`);
  const hu = run1.json?.languages?.hu;
  const de = run1.json?.languages?.de;
  check('hu counts: 6 entries -> 1 inserted, 2 updated, 0 unchanged, 1 protected, 1 no-name, 1 unknown',
    hu && hu.entries === 6 && hu.inserted === 1 && hu.updated === 2 && hu.unchanged === 0 && hu.skippedProtected === 1 && hu.skippedNoName === 1 && hu.unknownExercise === 1,
    JSON.stringify(hu && { ...hu, coverage: undefined }));
  check('de counts: 3 entries -> 2 inserted, 0 updated, 1 protected',
    de && de.entries === 3 && de.inserted === 2 && de.updated === 0 && de.skippedProtected === 1 && de.skippedNoName === 0 && de.unknownExercise === 0,
    JSON.stringify(de && { ...de, coverage: undefined }));

  // Inserted row: every column filled, origin machine, folded name.
  const a = rowOf(A, 'hu');
  check('inserted hu row has name, folded name, description, steps and origin machine',
    a && a.name === 'Alfa fekvenyomás' && a.normalized_name === normalizeText('Alfa fekvenyomás') && a.normalized_name === 'alfa fekvenyomas' &&
      a.description === 'Hosszabb leírás.' && a.instructions === JSON.stringify(['Első lépés.', 'Második lépés.']) && a.origin === 'machine');
  check('the hu text survives byte-for-byte (accents intact)', a?.name === huFile['free-exercise-db'].vfy_a.name);

  // A nameless entry refines the machine row and keeps its name.
  const b = rowOf(B, 'hu');
  check('a nameless entry fills description + steps and keeps the existing name',
    b && b.name === 'Bravo hajlítás gépen' && b.description === 'Csak leírás a gépi sorra.' && b.instructions === JSON.stringify(['Egyetlen lépés.']) && b.origin === 'machine');

  // A machine name is replaced by a newer machine name.
  const g = rowOf(G, 'hu');
  check('an existing machine row is updated to the new name', g && g.name === 'Golf nyújtás újrafordítva' && g.normalized_name === normalizeText('Golf nyújtás újrafordítva') && !/[^ -]/.test(g.normalized_name) && g.origin === 'machine');

  // Protection.
  check('the HUMAN row is untouched (every column, updated_at included)', JSON.stringify(rowOf(C, 'hu')) === JSON.stringify(humanBefore) && humanBefore.origin === 'human');
  check('the DATASET row is untouched (every column, updated_at included)', JSON.stringify(rowOf(D, 'de')) === JSON.stringify(datasetBefore) && datasetBefore.origin === 'dataset');
  check('a nameless entry with no existing row creates nothing', rowOf(E, 'hu') === undefined);
  check('the unknown exercise created nothing (no row for it anywhere)', db.prepare("SELECT COUNT(*) AS n FROM exercise_translations WHERE name = 'Ismeretlen gyakorlat'").get().n === 0);
  check('the exercise in no file has no hu/de row', rowOf(F, 'hu') === undefined && rowOf(F, 'de') === undefined);
  check('the English rows are untouched', JSON.stringify([A, B, C, D, E, F, G].map((id) => rowOf(id, 'en'))) === enBefore);
  check('de inserts landed (A, E) with origin machine',
    rowOf(A, 'de')?.origin === 'machine' && rowOf(A, 'de')?.name === 'Alpha Bankdrücken' && rowOf(E, 'de')?.origin === 'machine' && rowOf(E, 'de')?.description === 'Eine Beschreibung.');

  // FTS, maintained by the triggers.
  const ftsHit = (term) => db.prepare('SELECT rowid FROM exercise_translations_fts WHERE exercise_translations_fts MATCH ?').all(`"${term}"`).map((r) => r.rowid);
  check('FTS finds the new Hungarian name (folded, by the triggers)', ftsHit('fekvenyomas').includes(a.id), JSON.stringify(ftsHit('fekvenyomas')));
  check('FTS finds the replaced name and no longer the old one', ftsHit('ujrafordítva').includes(g.id) && !ftsHit('regi').includes(g.id));
  let integrity = true;
  try {
    db.prepare("INSERT INTO exercise_translations_fts (exercise_translations_fts) VALUES ('integrity-check')").run();
  } catch {
    integrity = false;
  }
  check('FTS5 integrity-check passes after the import', integrity);

  /* ── idempotence ────────────────────────────────────────────────────────────────────────── */

  const afterFirst = snapshot();
  const rowsAfterFirst = countRows();
  const run2 = report(['--dir', fixtureDir]);
  const hu2 = run2.json?.languages?.hu;
  const de2 = run2.json?.languages?.de;
  check('second run exits 0', run2.code === 0, `exit ${run2.code}`);
  check('second run: hu inserted 0, updated 0, unchanged 3', hu2 && hu2.inserted === 0 && hu2.updated === 0 && hu2.unchanged === 3 && hu2.skippedProtected === 1, JSON.stringify(hu2 && { ...hu2, coverage: undefined }));
  check('second run: de inserted 0, updated 0, unchanged 2', de2 && de2.inserted === 0 && de2.updated === 0 && de2.unchanged === 2 && de2.skippedProtected === 1, JSON.stringify(de2 && { ...de2, coverage: undefined }));
  check('second run leaves the whole table byte-identical (no row, no updated_at bump)', snapshot() === afterFirst && countRows() === rowsAfterFirst);

  const limited = report(['--dir', fixtureDir, '--lang', 'hu', '--limit', '2', '--dry']);
  check('--lang + --limit bound the entries read', limited.json && Object.keys(limited.json.languages).join() === 'hu' && limited.json.languages.hu.entries === 2, JSON.stringify(limited.json && Object.keys(limited.json.languages)));

  /* ── through the API ────────────────────────────────────────────────────────────────────── */

  const password = randomBytes(18).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const email = `verify-import-${Date.now()}@example.com`;
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(email, hash, 'user');

  server = spawn(process.execPath, ['server.js'], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  let serverErr = '';
  server.stderr.on('data', (c) => {
    serverErr += c.toString();
  });
  const deadline = Date.now() + 30_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      up = (await fetch(`${BASE}/readyz`)).status === 200;
    } catch {
      /* not listening yet */
    }
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) {
    check('the server booted', false, serverErr.slice(-300));
    return;
  }

  const jar = new Map();
  const call = async (p, { method = 'GET', body } = {}) => {
    const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF'] = '1';
    const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const value = pair.slice(i + 1).trim();
      if (value === '') jar.delete(pair.slice(0, i).trim());
      else jar.set(pair.slice(0, i).trim(), value);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* not every response carries a body */
    }
    return { res, json };
  };

  const login = await call('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  check('the fixture user signs in', login.res.status === 200, `status ${login.res.status}`);

  const list = async (query) => (await call(`/api/v1/exercises?${query}`)).json?.exercises ?? [];
  const huList = await list('lang=hu&limit=100');
  const byId = (rows, id) => rows.find((r) => r.id === id);
  check('GET /exercises?lang=hu returns the Hungarian name with translated=1', byId(huList, A)?.name === 'Alfa fekvenyomás' && byId(huList, A)?.translated === 1, JSON.stringify(byId(huList, A)));
  check('a refined machine row still shows its Hungarian name', byId(huList, B)?.name === 'Bravo hajlítás gépen' && byId(huList, B)?.translated === 1);
  check('the human row is what the API serves (the importer did not replace it)', byId(huList, C)?.name === 'Charlie evezés (edző javította)');
  check('an exercise with no hu row falls back to English with translated=0', byId(huList, F)?.name === 'Verify Foxtrot Plank' && byId(huList, F)?.translated === 0);
  check('an exercise whose hu entry was skipped (no name) also falls back honestly', byId(huList, E)?.name === 'Verify Echo Squat' && byId(huList, E)?.translated === 0);

  const search = await list(`lang=hu&q=${encodeURIComponent('fekvenyomas')}`);
  check('searching the folded Hungarian name finds the exercise', search.some((r) => r.id === A), `${search.length} hits`);

  const detail = await call(`/api/v1/exercises/${A}?lang=hu`);
  const ex = detail.json?.exercise;
  check('GET /exercises/:id?lang=hu returns the Hungarian name, description and steps',
    detail.res.status === 200 && ex?.name === 'Alfa fekvenyomás' && ex?.description === 'Hosszabb leírás.' &&
      JSON.stringify(ex?.instructions) === JSON.stringify(['Első lépés.', 'Második lépés.']) && ex?.translated === 1, `status ${detail.res.status}`);
  check('the detail lists hu and de as machine translations',
    (detail.json?.availableLangs ?? []).some((l) => l.lang === 'hu' && l.origin === 'machine') && (detail.json?.availableLangs ?? []).some((l) => l.lang === 'de' && l.origin === 'machine'));
  const detailB = (await call(`/api/v1/exercises/${B}?lang=hu`)).json?.exercise;
  check('a refined row serves its Hungarian description and steps', detailB?.description === 'Csak leírás a gépi sorra.' && JSON.stringify(detailB?.instructions) === JSON.stringify(['Egyetlen lépés.']));
  const detailF = (await call(`/api/v1/exercises/${F}?lang=hu`)).json?.exercise;
  check('an untranslated exercise serves its English name with translated=0', detailF?.name === 'Verify Foxtrot Plank' && detailF?.translated === 0);

  const deDetail = (await call(`/api/v1/exercises/${E}?lang=de`)).json?.exercise;
  check('GET /exercises/:id?lang=de returns the German text', deDetail?.name === 'Echo Kniebeuge' && deDetail?.description === 'Eine Beschreibung.' && deDetail?.translated === 1, JSON.stringify(deDetail && { n: deDetail.name, t: deDetail.translated }));

  const sources = (await call('/api/v1/sources')).json?.sources ?? [];
  const wger = sources.find((s) => s.id === 'wger');
  check('GET /sources still serves the wger CC-BY-SA 4.0 attribution the translations rely on', wger?.license === 'CC-BY-SA 4.0' && /creativecommons\.org\/licenses\/by-sa\/4\.0/.test(wger?.licenseUrl ?? '') && wger?.url === 'https://wger.de');

  /* ── a human edit made AFTER an import still wins on the next one ───────────────────────── */

  db.prepare("UPDATE exercise_translations SET origin = 'human', name = 'Alfa (edző javította)', normalized_name = ? WHERE exercise_id = ? AND lang = 'hu'").run(normalizeText('Alfa (edző javította)'), A);
  const edited = JSON.stringify(rowOf(A, 'hu'));
  const run3 = report(['--dir', fixtureDir, '--lang', 'hu']);
  check('a row a human took over after the first import is protected on the next one',
    run3.json?.languages?.hu?.skippedProtected === 2 && JSON.stringify(rowOf(A, 'hu')) === edited, JSON.stringify(run3.json?.languages?.hu && { p: run3.json.languages.hu.skippedProtected }));
}
