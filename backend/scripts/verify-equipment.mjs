/**
 * verify-equipment — the exercise LIST carries each exercise's equipment slugs.
 *
 * ═══ WHAT THIS HAS TO PROVE ════════════════════════════════════════════════════════════════════
 *
 * The library rows (and the plan editor's picker, which reads the same `GET /exercises`) draw an
 * equipment still keyed by slug. The field is only worth having if it is RIGHT on every path the
 * list query takes, so each of them is walked here:
 *
 *   shape      — every row has `equipment: string[]`; an exercise without equipment is `[]`, never
 *                null, so "no key = the empty cell" is a check on an array, not on a type;
 *   order      — slugs come in the taxonomy's sort order (the detail endpoint's order), whatever
 *                order the mapping rows were written in;
 *   vocabulary — every slug is one `GET /taxonomies` lists and `?equipment=` accepts;
 *   paging     — the keyset cursor neither repeats nor skips a row with the new column in the
 *                statement, under both sorts (a one-to-many join here would break exactly this);
 *   search     — the FTS path joins two translation rows per exercise and GROUP BYs them away;
 *                the slugs must not double;
 *   filter     — `?equipment=bench` narrows the ROWS, never the row's own list;
 *   for_client — the coach annotation still arrives next to it;
 *   visibility — another coach's private exercise is still absent.
 *
 * ═══ HERMETIC ══════════════════════════════════════════════════════════════════════════════════
 *
 * A throwaway encrypted database in the OS temp directory, built by the server's own boot
 * migration, and a throwaway server on a random port, both torn down at the end. Every secret the
 * run needs (database key, salt, JWT key, the fixture accounts' password) is generated here with
 * `crypto.randomBytes`, lives only in this process and its child, and is never printed. No `.env`
 * is read for anything this script sets, and the dev database is never opened.
 *
 * Run: npm run verify:equipment
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-verify-equipment-'));
const port = 3500 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${port}`;

// Set BEFORE the database facade is imported: `src/lib/env.js` validates process.env at import,
// and dotenv never overrides a variable that is already set.
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: String(port),
  DB_PATH: path.join(dir, 'verify-equipment.db'),
  DB_MASTER_KEY: randomBytes(32).toString('hex'),
  DB_KEY_SALT: randomBytes(16).toString('hex'),
  JWT_SECRET: randomBytes(32).toString('base64url'),
  JWT_KID: 'verify-equipment',
  LOG_LEVEL: 'warn',
  CORS_ALLOWED_ORIGINS: '',
  DB_POOL_THREADS: '2',
});
for (const k of ['JWT_SECRET_PREV', 'JWT_KID_PREV', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k];

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const server = spawn(process.execPath, ['server.js'], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
let serverErr = '';
server.stderr.on('data', (c) => {
  serverErr += c.toString();
});

let db = null;
const finish = async (code) => {
  try {
    await db?.closePool();
  } catch {
    /* the pool is going away either way */
  }
  server.kill('SIGTERM');
  setTimeout(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the OS reclaims the temp dir either way */
    }
    process.exit(code);
  }, 500);
};

/* ── boot ────────────────────────────────────────────────────────────────────────────────────── */

const deadline = Date.now() + 30_000;
let up = false;
while (Date.now() < deadline) {
  try {
    if ((await fetch(`${BASE}/readyz`)).status === 200) {
      up = true;
      break;
    }
  } catch {
    /* not listening yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}
if (!up) {
  // The server's stderr can only hold what the server logs; the env validator names variables,
  // never their values.
  console.error(`verify-equipment: server never became ready on :${port}\n${serverErr.slice(-2000)}`);
  await finish(1);
} else {
  try {
    await run();
  } catch (err) {
    check('the run completed', false, String(err?.message ?? err).slice(0, 200));
  }
  console.log(`\nverify-equipment: ${pass} passed, ${fail} failed`);
  await finish(fail === 0 ? 0 : 1);
}

/* ── the run ─────────────────────────────────────────────────────────────────────────────────── */

async function run() {
  db = await import('../src/db/index.js');
  const { normalizeText } = await import('../src/lib/normalize.js');
  const argon2 = (await import('argon2')).default;

  const password = randomBytes(18).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const stamp = Date.now();

  const mkUser = async (label, role) => {
    const email = `verify-equipment-${label}-${stamp}@example.com`;
    const r = await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, role]);
    return { id: Number(r.lastInsertRowid), email };
  };
  const coach = await mkUser('coach', 'coach');
  const coach2 = await mkUser('coach2', 'coach');
  const client = await mkUser('client', 'user');

  const equipmentId = new Map(
    (await db.all('SELECT id, slug FROM equipment')).map((r) => [r.slug, r.id]),
  );

  /** Inserts one exercise with English (and optionally Hungarian) text and the given equipment. */
  const mkExercise = async (name, equipment, { status = 'global', ownerId = null, hu = null } = {}) => {
    const r = await db.run(
      `INSERT INTO exercises (name, normalized_name, status, owner_id, source, difficulty, exercise_type)
       VALUES (?, ?, ?, ?, 'custom', 'beginner', 'strength')`,
      [name, normalizeText(name), status, ownerId],
    );
    const id = Number(r.lastInsertRowid);
    for (const [lang, text] of [['en', name], ...(hu ? [['hu', hu]] : [])]) {
      await db.run(
        `INSERT INTO exercise_translations (exercise_id, lang, name, normalized_name, origin) VALUES (?, ?, ?, ?, 'human')`,
        [id, lang, text, normalizeText(text)],
      );
    }
    // Written in the order given, which the assertions below deliberately make NOT the sort order.
    for (const slug of equipment) {
      await db.run('INSERT INTO exercise_equipment_map (exercise_id, equipment_id) VALUES (?, ?)', [id, equipmentId.get(slug)]);
    }
    return id;
  };

  const alpha = await mkExercise('Alpha Press', ['bench', 'barbell'], { hu: 'Alpha nyomás' });
  const bravo = await mkExercise('Bravo Curl', ['dumbbell']);
  const charlie = await mkExercise('Charlie Plank', []);
  const foreign = await mkExercise('Delta Swing', ['kettlebell'], { status: 'private', ownerId: coach2.id });
  const own = await mkExercise('Echo Row', ['cable'], { status: 'private', ownerId: coach.id });
  const fillers = [];
  for (let i = 0; i < 30; i += 1) {
    fillers.push(await mkExercise(`Filler ${String(i).padStart(2, '0')}`, i % 2 ? ['machine'] : ['other', 'bodyweight']));
  }
  const expected = new Map([
    [alpha, ['barbell', 'bench']],
    [bravo, ['dumbbell']],
    [charlie, []],
    [own, ['cable']],
    ...fillers.map((id, i) => [id, i % 2 ? ['machine'] : ['bodyweight', 'other']]),
  ]);

  const link = await db.run(
    `INSERT INTO coach_clients (coach_id, client_id, status, origin, accepted_at) VALUES (?, ?, 'active', 'manual', unixepoch())`,
    [coach.id, client.id],
  );
  const linkId = Number(link.lastInsertRowid);

  /* ── HTTP, as the coach ──────────────────────────────────────────────────────────────────── */

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

  const login = await call('/api/v1/auth/login', { method: 'POST', body: { email: coach.email, password } });
  check('coach fixture signs in', login.res.status === 200, `status ${login.res.status}`);

  /** Every row of a listing, following nextCursor to the end. */
  const walk = async (query) => {
    const rows = [];
    let cursor = null;
    let pages = 0;
    do {
      const { res, json } = await call(`/api/v1/exercises?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (res.status !== 200) throw new Error(`GET /exercises?${query} answered ${res.status}`);
      rows.push(...json.exercises);
      cursor = json.nextCursor;
      pages += 1;
    } while (cursor && pages < 20);
    return { rows, pages };
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // shape + order + paging, under both sorts
  for (const sort of ['name', 'newest']) {
    const { rows, pages } = await walk(`sort=${sort}&lang=en`);
    const ids = rows.map((r) => r.id);
    check(`[${sort}] the walk spans more than one page`, pages > 1, `${pages} pages`);
    check(`[${sort}] no row repeated across pages`, new Set(ids).size === ids.length, `${ids.length} rows`);
    check(`[${sort}] every visible fixture listed exactly once`, ids.length === expected.size && [...expected.keys()].every((id) => ids.includes(id)),
      `${ids.length} of ${expected.size}`);
    check(`[${sort}] every row carries equipment as an array of strings`,
      rows.every((r) => Array.isArray(r.equipment) && r.equipment.every((s) => typeof s === 'string')));
    const wrong = rows.filter((r) => !same(r.equipment, expected.get(r.id)));
    check(`[${sort}] every row's slugs are its own, in the taxonomy's sort order`, wrong.length === 0,
      wrong.slice(0, 3).map((r) => `${r.id}:${JSON.stringify(r.equipment)}`).join(' '));
    check(`[${sort}] an exercise without equipment answers []`, same(rows.find((r) => r.id === charlie)?.equipment, []));
    check(`[${sort}] another coach's private exercise is still absent`, !ids.includes(foreign));
  }

  // vocabulary
  const tax = await call('/api/v1/taxonomies?lang=hu');
  const vocabulary = new Set((tax.json?.equipment ?? []).map((t) => t.slug));
  const { rows: all } = await walk('lang=hu');
  const outside = all.flatMap((r) => r.equipment).filter((s) => !vocabulary.has(s));
  check('every slug is one GET /taxonomies lists', vocabulary.size > 0 && outside.length === 0, outside.slice(0, 5).join(', '));
  check('the Hungarian page carries the same slugs (language-independent key)',
    all.every((r) => same(r.equipment, expected.get(r.id))));

  // filter
  const filtered = await walk('equipment=bench&lang=en');
  check('?equipment=bench narrows the rows to the bench exercise', same(filtered.rows.map((r) => r.id), [alpha]));
  check('?equipment=bench leaves that row its whole list', same(filtered.rows[0]?.equipment, ['barbell', 'bench']));

  // search: two translation rows per hit, grouped away
  const searched = await walk(`q=${encodeURIComponent('alpha')}&lang=hu`);
  const hit = searched.rows.find((r) => r.id === alpha);
  check('search finds the fixture through both languages', Boolean(hit), `${searched.rows.length} hits`);
  check('search does not double the slugs', same(hit?.equipment, ['barbell', 'bench']), JSON.stringify(hit?.equipment));

  // mine
  const mine = await walk('mine=1&lang=en');
  check('?mine=1 lists the own private exercise with its equipment', same(mine.rows.map((r) => [r.id, r.equipment]), [[own, ['cable']]]));

  // for_client: the annotation and the new field side by side
  const annotated = await call(`/api/v1/exercises?for_client=${linkId}&lang=en&equipment=bench`);
  const a = annotated.json?.exercises?.[0];
  check('for_client still annotates', annotated.res.status === 200 && Array.isArray(a?.missing_equipment) && Array.isArray(a?.conflicts));
  check('for_client keeps the row\'s own equipment', same(a?.equipment, ['barbell', 'bench']));
  check('for_client: the client ticked nothing, so all of it is missing', same([...(a?.missing_equipment ?? [])].sort(), ['barbell', 'bench']));

  // the input contract is unchanged
  const unknown = await call('/api/v1/exercises?equipment_keys=1');
  check('an unknown query field is still refused', unknown.res.status === 400, `status ${unknown.res.status}`);
  check('the refusal is the generic envelope', typeof unknown.json?.error === 'string' && !/SELECT|sqlite/i.test(JSON.stringify(unknown.json)));

  // a mapping removed is gone from the next read
  await db.run('DELETE FROM exercise_equipment_map WHERE exercise_id = ?', [bravo]);
  const after = await walk('q=bravo&lang=en');
  check('a removed mapping is gone from the next page', same(after.rows.find((r) => r.id === bravo)?.equipment, []));
}
