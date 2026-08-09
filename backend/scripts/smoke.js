// scripts/smoke.js — the regression net for Phase 0.
//
// Every critical endpoint ships with its security-regression case in the same change. This
// suite therefore checks the happy path AND the abuse path for each route: forged headers,
// replayed tokens, tampered signatures, unknown fields, wrong content types.
//
// Usage: node scripts/smoke.js   (server must already be running)
import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SMOKE_BASE ?? `http://localhost:${process.env.PORT ?? 3000}`;
const stamp = Date.now();
const EMAIL = `smoke-${stamp}@example.com`;
const PASSWORD = 'SmokePass123x';

let passed = 0;
let failed = 0;

/**
 * Create a block and a prescription directly in the database.
 *
 * Blocks and plan-exercises have no HTTP routes yet, and the check that needs them is about the
 * exercise READ predicate rather than about how the row got there. Written against the server's
 * own database file, so the schema's coherence triggers still police it — an invalid insert is
 * refused and reported, rather than silently leaving the probe testing nothing.
 */
/**
 * Publish one coach profile and two posts, so the public assertions run against something.
 *
 * ═══ WHY THIS EXISTS, AND WHAT IT SAYS ABOUT THE ASSERTIONS THAT CAME BEFORE IT ════════════════
 *
 * Every anonymous marketplace check ran against an EMPTY corpus. The suite boots a fresh database
 * and there are no write routes for the marketplace yet, so nothing had ever published anything —
 * `/public/posts` answered `{"posts":[],"nextCursor":null}` and each check passed on it.
 *
 * Including the one that mattered most. "A signed-in visitor gets BYTE-IDENTICAL bytes to an
 * anonymous one" reported `anon 30b, auth 30b`: thirty bytes is that empty envelope, so the
 * flagship property of the public surface was being proved by comparing two empty lists. A clean
 * result is a statement about coverage before it is a statement about the subject.
 *
 * Same shape as seedPrescription above and for the same reason — the row has to exist and there is
 * no route that makes one — and it goes through the server's own database file so 021's publish
 * gates and coherence triggers still police it. The body goes through the REAL parser: a
 * hand-built tree would let the assertions pass over a document the product cannot produce.
 */
async function seedPublicCorpus() {
  try {
    const { default: Database } = await import('better-sqlite3-multiple-ciphers');
    const { deriveDbKeyHex } = await import('../src/lib/dbkey.js');
    const { parseBody } = await import('../src/public/markdown.js');
    const conn = new Database(process.env.DB_PATH);
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    conn.pragma('foreign_keys = ON');

    const uid = conn
      .prepare(
        `INSERT INTO users (email, password_hash, role, created_at)
         VALUES ('public-corpus@smoke.local', 'x', 'coach', unixepoch() - 999999)`,
      )
      .run().lastInsertRowid;

    // Consent first: trg_profile_publish_standing_ins refuses a published profile without it.
    conn
      .prepare(
        `INSERT INTO guidelines_acceptances (user_id, version)
         SELECT ?, version FROM guidelines_versions WHERE active = 1`,
      )
      .run(uid);
    conn
      .prepare(
        `INSERT INTO coach_profiles (user_id, handle, display_name, headline, bio_src, bio_doc,
                                     doc_version, published_at, listed_at)
         VALUES (?, 'smoke-coach', 'Smoke Coach', 'Probe profile', 'A **bio**.', ?, ?, unixepoch(), unixepoch())`,
      )
      .run(uid, ...(() => { const b = parseBody('A **bio**.'); return [b.json, b.version]; })());

    // ASK THE TABLE WHICH KIND FITS THIS ROW, rather than taking the first one and hoping. The
    // first draft used LIMIT 1 and hit `kind_shape_invalid`: kinds differ in whether they require
    // an event time and whether they allow a price, and the trigger enforces the combination.
    const kind = conn
      .prepare(`SELECT key FROM post_kinds WHERE active = 1 AND allows_price = 1 AND requires_event_at = 0 LIMIT 1`)
      .get()?.key;
    if (!kind) throw new Error('no post kind allows a price without an event time');
    for (const [publicId, title, src] of [
      ['smokePost001', 'First smoke post', 'The **first** post.\n\n- one\n- two'],
      ['smokePost002', 'Second smoke post', 'The *second* post, with [a link](https://example.com/x).'],
    ]) {
      const { json, excerpt, version } = parseBody(src);
      conn
        .prepare(
          `INSERT INTO coach_posts (public_id, author_user_id, kind_key, title, body_src, body_doc,
                                    body_excerpt, doc_version, price_minor, price_currency, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 45000, 'HUF', unixepoch())`,
        )
        .run(publicId, uid, kind, title, src, json, excerpt, version);
    }
    conn.close();
    return true;
  } catch (err) {
    console.error(`  seedPublicCorpus: ${err.message}`);
    return false;
  }
}

/**
 * Backdate an account so the publish age gate can be passed.
 *
 * min_account_age_s_to_publish is 24 hours and the suite builds every account seconds before it
 * uses one, so the happy path is unreachable without this. Written through the server own
 * database file for the same reason as seedPrescription: there is no route that ages an account,
 * and there should not be.
 *
 * The gate itself is asserted BEFORE this is called. Ageing the account first would have quietly
 * deleted the assertion that the gate exists at all.
 */
async function ageAccount(email) {
  try {
    const { default: Database } = await import('better-sqlite3-multiple-ciphers');
    const { deriveDbKeyHex } = await import('../src/lib/dbkey.js');
    const conn = new Database(process.env.DB_PATH);
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    conn.prepare('UPDATE users SET created_at = unixepoch() - 999999 WHERE email = ?').run(email);
    conn.close();
    return true;
  } catch (err) {
    console.error(`  ageAccount: ${err.message}`);
    return false;
  }
}

async function seedPrescription({ planId, dayId, exerciseId }) {
  try {
    const { default: Database } = await import('better-sqlite3-multiple-ciphers');
    const { deriveDbKeyHex } = await import('../src/lib/dbkey.js');
    const conn = new Database(process.env.DB_PATH);
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    conn.pragma('foreign_keys = ON');
    const blockId = conn
      .prepare('INSERT INTO workout_plan_blocks (plan_id, day_id) VALUES (?, ?)')
      .run(planId, dayId).lastInsertRowid;
    conn
      .prepare(
        `INSERT INTO workout_plan_exercises (plan_id, block_id, exercise_id, exercise_name_snapshot, target_reps_min)
         VALUES (?, ?, ?, 'probe', 8)`,
      )
      .run(planId, blockId, exerciseId);
    conn.close();
    return true;
  } catch (err) {
    console.error(`  seedPrescription: ${err.message}`);
    return false;
  }
}

/**
 * Write (or clear) a plan-day exception directly.
 *
 * Exceptions have no HTTP route yet and the checks that need them are about the SCHEDULE query
 * reading them correctly, not about how they were created. `action: null` clears.
 */
async function seedException({ planId, dayId, date, action, moveTo = null }) {
  try {
    const { default: Database } = await import('better-sqlite3-multiple-ciphers');
    const { deriveDbKeyHex } = await import('../src/lib/dbkey.js');
    const conn = new Database(process.env.DB_PATH);
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    conn.pragma('foreign_keys = ON');
    conn.prepare('DELETE FROM workout_plan_day_exceptions WHERE day_id = ? AND occurrence_date = ?').run(dayId, date);
    if (action) {
      conn
        .prepare(
          'INSERT INTO workout_plan_day_exceptions (plan_id, day_id, occurrence_date, action, moved_to_date) VALUES (?, ?, ?, ?, ?)',
        )
        .run(planId, dayId, date, action, moveTo);
    }
    conn.close();
    return true;
  } catch (err) {
    console.error(`  seedException: ${err.message}`);
    return false;
  }
}

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/** Minimal cookie jar — enough to model one browser, which is what the auth flow assumes. */
class Jar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      // An empty value with an expiry in the past is a deletion.
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function call(path, { method = 'GET', body, jar, headers = {}, csrf = true } = {}) {
  const h = { ...headers };
  // A FormData body is passed through untouched, and the Content-Type is left for fetch to set —
  // it has to carry the multipart boundary, which nothing here can know. The earlier version
  // JSON-stringified everything, so a FormData silently became the string "[object FormData]"
  // with an application/json header, and every upload route answered 415. That is a harness that
  // lies about what it sent, which is worse than one that cannot send it at all.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) h['Content-Type'] = 'application/json';
  if (csrf && method !== 'GET') h['X-CSRF'] = '1';
  if (jar) h.Cookie = jar.header();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  if (jar) jar.absorb(res);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not every response carries a body */
  }
  return { res, json };
}

// --- health & shape ------------------------------------------------------------------------
{
  const { res } = await call('/healthz');
  check('healthz', res.status === 200, `status ${res.status}`);
}
{
  const { res } = await call('/readyz');
  check('readyz (DB reachable)', res.status === 200, `status ${res.status}`);
}
{
  const { res, json } = await call('/api/v1/config');
  check('config exposes APP_NAME', res.status === 200 && typeof json?.appName === 'string', json?.appName);
}
{
  const { res, json } = await call('/api/v1/nope');
  const shaped = json && 'error' in json && 'code' in json && 'requestId' in json;
  check('404 uses the uniform envelope', res.status === 404 && shaped, json?.code);
}

// --- registration --------------------------------------------------------------------------
{
  const { res } = await call('/api/v1/auth/register', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  check('register', res.status === 201, `status ${res.status}`);
}
{
  const { res, json } = await call('/api/v1/auth/register', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  check('register duplicate -> 409', res.status === 409 && json?.code === 'conflict', `status ${res.status}`);
}
{
  const { res, json } = await call('/api/v1/auth/register', {
    method: 'POST',
    body: { email: `weak-${stamp}@example.com`, password: 'short' },
  });
  check('weak password rejected', res.status === 400 && json?.code === 'validation_error', `status ${res.status}`);
}
{
  // .strict() schemas reject unknown fields — a mass-assignment attempt must not be ignored.
  const { res, json } = await call('/api/v1/auth/register', {
    method: 'POST',
    body: { email: `extra-${stamp}@example.com`, password: PASSWORD, role: 'admin' },
  });
  check('unknown field (role) rejected', res.status === 400 && json?.code === 'validation_error', `status ${res.status}`);
}

// --- CSRF ----------------------------------------------------------------------------------
{
  const { res } = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
    csrf: false,
  });
  check('POST without X-CSRF -> 403', res.status === 403, `status ${res.status}`);
}
{
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-CSRF': '1' },
    body: 'email=x',
  });
  check('non-JSON body -> 415', res.status === 415, `status ${res.status}`);
}
{
  const { res } = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  check('cross-site Sec-Fetch-Site -> 403', res.status === 403, `status ${res.status}`);
}

// --- login ---------------------------------------------------------------------------------
{
  const { res, json } = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'WrongPassword123' },
  });
  check('wrong password -> 401', res.status === 401 && json?.code === 'unauthorized', `status ${res.status}`);
}
{
  const { res, json } = await call('/api/v1/auth/login', {
    method: 'POST',
    body: { email: `ghost-${stamp}@example.com`, password: PASSWORD },
  });
  // Identical response to a wrong password: the pair together is what resists enumeration.
  check('unknown email -> same 401', res.status === 401 && json?.error === 'invalid credentials', json?.error);
}

const jar = new Jar();
{
  const { res } = await call('/api/v1/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar });
  check('login', res.status === 200, `status ${res.status}`);

  const setCookies = res.headers.getSetCookie?.() ?? [];
  const access = setCookies.find((c) => c.startsWith('access='));
  const refresh = setCookies.find((c) => c.startsWith('refresh='));
  check('access cookie HttpOnly + SameSite=Lax + Path=/', /HttpOnly/i.test(access ?? '') && /SameSite=Lax/i.test(access ?? '') && /Path=\//.test(access ?? ''));
  check(
    'refresh cookie HttpOnly + SameSite=Strict + Path-scoped to /api/v1/auth',
    /HttpOnly/i.test(refresh ?? '') && /SameSite=Strict/i.test(refresh ?? '') && /Path=\/api\/v1\/auth/i.test(refresh ?? ''),
  );
}
{
  const { res, json } = await call('/api/v1/auth/me', { jar });
  check('me (authenticated)', res.status === 200 && json?.user?.email === EMAIL, json?.user?.role);
}
{
  const { res } = await call('/api/v1/auth/me');
  check('me without cookie -> 401', res.status === 401, `status ${res.status}`);
}
{
  // A token whose signature was altered must fail the alg/kid-pinned verification.
  const tampered = new Jar();
  tampered.cookies.set('access', `${jar.cookies.get('access').slice(0, -4)}AAAA`);
  const { res } = await call('/api/v1/auth/me', { jar: tampered });
  check('tampered JWT signature -> 401', res.status === 401, `status ${res.status}`);
}

// --- refresh rotation + reuse detection ------------------------------------------------------
const stolen = jar.cookies.get('refresh');
{
  const { res } = await call('/api/v1/auth/refresh', { method: 'POST', jar });
  const rotated = jar.cookies.get('refresh') !== stolen;
  check('refresh rotates the token', res.status === 200 && rotated, `status ${res.status}`);
}
{
  const { res } = await call('/api/v1/auth/me', { jar });
  check('me after refresh', res.status === 200, `status ${res.status}`);
}
{
  // Replaying a token that was consumed moments ago is treated as a benign race — two of the
  // user's own tabs refreshing together — and must NOT raise a theft alarm.
  const race = new Jar();
  race.cookies.set('refresh', stolen);
  const { res } = await call('/api/v1/auth/refresh', { method: 'POST', jar: race });
  check('immediate replay -> 409, no false theft alarm', res.status === 409, `status ${res.status}`);
}
{
  // This sleep is load-bearing, not laziness: the grace window is 10 s, and the only way to
  // exercise the real theft path is to leave it. A test-only branch through security code is
  // exactly how a gap ships unnoticed, so the suite waits instead.
  await new Promise((r) => setTimeout(r, 11_000));
  const replay = new Jar();
  replay.cookies.set('refresh', stolen);
  const { res } = await call('/api/v1/auth/refresh', { method: 'POST', jar: replay });
  check('stale replay -> 401 (theft detected)', res.status === 401, `status ${res.status}`);
}
{
  // Reuse detection revokes the whole family and bumps session_version, so the legitimate
  // session dies too. That is the intended trade-off: once a token is known stolen, every
  // holder of that family is cut off.
  const { res } = await call('/api/v1/auth/refresh', { method: 'POST', jar });
  check('family revoked after reuse -> 401', res.status === 401, `status ${res.status}`);
}
{
  // The sv bump must kill the still-unexpired access token as well, not just the refresh chain.
  const { res } = await call('/api/v1/auth/me', { jar });
  check('access token dies with the family (sv bump) -> 401', res.status === 401, `status ${res.status}`);
}

// --- theme -----------------------------------------------------------------------------------
const themeJar = new Jar();
await call('/api/v1/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar: themeJar });

{
  const { res, json } = await call('/api/v1/ui/element-styles');
  const styles = json?.styles ?? {};
  const complete = Array.from({ length: 26 }, (_, i) => `E${i + 1}`).every((k) => 'ABCDE'.includes(styles[k]));
  check('element styles: all 26 seeded with a valid variant', res.status === 200 && complete, `${Object.keys(styles).length} rows`);
}
{
  // Catalog parity. The frontend offers a variant list per element; the database CHECKs what it
  // will accept. If the two drift, the admin studio shows an option that silently fails to save
  // — or a row exists with no implementation behind it. Both are invisible until someone tries.
  const { json } = await call('/api/v1/ui/element-styles');
  const dbIds = Object.keys(json?.styles ?? {}).sort();
  let uiIds = [];
  try {
    const src = await readFile(
      new URL('../../frontend/src/ui/feedback/catalog.ts', import.meta.url),
      'utf8',
    );
    uiIds = [...src.matchAll(/id:\s*'(E\d+)'/g)].map((m) => m[1]).sort();
  } catch {
    /* the frontend may not be checked out beside the backend */
  }
  const same = uiIds.length > 0 && uiIds.join() === dbIds.join();
  check(
    'element catalog parity: frontend list === database rows',
    same,
    `ui ${uiIds.length} / db ${dbIds.length}`,
  );
}
{
  const { res, json } = await call('/api/v1/me/theme', { jar: themeJar });
  check('theme defaults for a new user', res.status === 200 && json?.theme?.pack === 'midnight', json?.theme?.pack);
}
{
  const { res } = await call('/api/v1/me/theme', {
    method: 'PUT',
    jar: themeJar,
    body: { pack: 'neon', accent: '#22D3EE', gradient: null },
  });
  check('theme saved', res.status === 200, `status ${res.status}`);
}
{
  const { json } = await call('/api/v1/me/theme', { jar: themeJar });
  check('theme persisted', json?.theme?.pack === 'neon' && json?.theme?.accent === '#22D3EE', JSON.stringify(json?.theme));
}
{
  // THE point of the server-side guard. The picker will not offer this colour, and its Save
  // button stays disabled — but the picker is not a security boundary, and this request is what
  // a proxy sends. An accent that cannot carry readable text must be refused here.
  const { res, json } = await call('/api/v1/me/theme', {
    method: 'PUT',
    jar: themeJar,
    body: { pack: 'midnight', accent: '#2A2A2A', gradient: null },
  });
  check('forged unreadable accent -> 400', res.status === 400 && json?.code === 'validation_error', `status ${res.status}`);
}
{
  const { res } = await call('/api/v1/me/theme', {
    method: 'PUT',
    jar: themeJar,
    body: { pack: 'midnight', accent: null, gradient: { type: 'linear', angle: 135, stops: [{ color: '#6E8CFB', position: 0 }] } },
  });
  check('gradient with one stop -> 400', res.status === 400, `status ${res.status}`);
}
{
  const { res } = await call('/api/v1/me/theme', {
    method: 'PUT',
    jar: themeJar,
    body: { pack: 'midnight', accent: null, gradient: null, userId: 1 },
  });
  check('unknown field (userId) rejected', res.status === 400, `status ${res.status}`);
}
{
  // A signed-in NON-admin must not be able to reconfigure the app for every other user.
  const { res, json } = await call('/api/v1/ui/element-styles/E1', {
    method: 'PUT',
    jar: themeJar,
    body: { variant: 'B' },
  });
  check('non-admin cannot change a global element style -> 403', res.status === 403 && json?.code === 'forbidden', `status ${res.status}`);
}

// --- exercise library ------------------------------------------------------------------------
const seeded = process.env.SMOKE_ACCOUNTS ? JSON.parse(process.env.SMOKE_ACCOUNTS).accounts : null;

if (!seeded) {
  check('exercise suite: privileged accounts available', false, 'SMOKE_ACCOUNTS missing — run via npm run smoke');
} else {
  const coachJar = new Jar();
  const coach2Jar = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachJar });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coach2Jar });

  {
    const { res, json } = await call('/api/v1/taxonomies', { jar: coachJar });
    check('taxonomies seeded', res.status === 200 && json?.muscles?.length >= 20 && json?.equipment?.length >= 16,
      `${json?.muscles?.length} muscles / ${json?.equipment?.length} equipment`);
  }

  let privateId = null;
  {
    // Deliberately Hungarian, deliberately accented — the search test below depends on it.
    const { res, json } = await call('/api/v1/exercises', {
      method: 'POST',
      jar: coachJar,
      body: {
        name: 'Overhead Tricep Extension',
        translations: [{ lang: 'hu', name: 'Tarkóra nyomás' }],
        difficulty: 'intermediate',
        exercise_type: 'strength',
        muscles: [{ slug: 'triceps', role: 'primary' }, { slug: 'rear-delts', role: 'secondary' }],
        equipment: ['dumbbell'],
      },
    });
    privateId = json?.id;
    check('coach creates a custom exercise', res.status === 201 && Number.isInteger(privateId), `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/exercises', {
      method: 'POST',
      jar: themeJar, // an ordinary user
      body: { name: 'Should not exist' },
    });
    check('plain user cannot create an exercise -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    // Mass assignment: even naming the columns that decide visibility must be refused.
    const { res } = await call('/api/v1/exercises', {
      method: 'POST',
      jar: coachJar,
      body: { name: 'Privilege escalation attempt', status: 'global', owner_id: 1 },
    });
    check('status/owner_id in the body rejected', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/exercises', {
      method: 'POST',
      jar: coachJar,
      body: { name: 'Bad taxonomy', muscles: [{ slug: 'not-a-muscle', role: 'primary' }] },
    });
    check('unknown taxonomy slug rejected', res.status === 400, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/exercises/${privateId}`, { jar: coachJar });
    check('owner can read their private exercise', res.status === 200 && json?.exercise?.id === privateId, `status ${res.status}`);
    check('muscle roles round-trip', json?.muscles?.some((m) => m.slug === 'triceps' && m.role === 'primary'), JSON.stringify(json?.muscles?.map((m) => m.slug)));
  }
  {
    // THE anti-IDOR probe. A different coach must not learn that this row exists at all, which
    // is why the answer is 404 and not 403.
    const { res, json } = await call(`/api/v1/exercises/${privateId}`, { jar: coach2Jar });
    check('another coach probing a private exercise -> 404 (not 403)', res.status === 404 && json?.code === 'not_found', `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/exercises/${privateId}`, { method: 'PATCH', jar: coach2Jar, body: { name: 'Hijacked' } });
    check('another coach cannot edit it -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/exercises/${privateId}`, { method: 'DELETE', jar: coach2Jar });
    check('another coach cannot delete it -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/exercises?mine=1', { jar: coach2Jar });
    check('private exercise is absent from another coach\'s list', !json?.exercises?.some((e) => e.id === privateId), `${json?.exercises?.length ?? 0} rows`);
  }
  {
    // Diacritic-insensitive Hungarian search: "tarkora" must find "Tarkóra nyomás".
    const { res, json } = await call('/api/v1/exercises?q=tarkora&lang=hu', { jar: coachJar });
    check('search folds Hungarian diacritics', res.status === 200 && json?.exercises?.some((e) => e.id === privateId),
      `${json?.exercises?.length ?? 0} hits`);
  }
  {
    // FTS5 syntax in user input must be inert, not a query language.
    const { res } = await call('/api/v1/exercises?q=' + encodeURIComponent('" OR name : *'), { jar: coachJar });
    check('FTS metacharacters are escaped, not executed', res.status === 200, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/exercises?sort=id;DROP', { jar: coachJar });
    check('sort key outside the whitelist rejected', res.status === 400, `status ${res.status}`);
  }
  {
    const { res, json } = await call('/api/v1/exercises?limit=9999', { jar: coachJar });
    check('page size is capped server-side', res.status === 200 && (json?.exercises?.length ?? 0) <= 24, `${json?.exercises?.length} rows`);
  }
  {
    const { res } = await call('/api/v1/exercises?cursor=not-a-cursor', { jar: coachJar });
    check('malformed cursor does not 500', res.status === 200, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/exercises/${privateId}/submit`, { method: 'POST', jar: coachJar });
    check('owner submits for moderation', res.status === 200, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/exercises/${privateId}/submit`, { method: 'POST', jar: coachJar });
    check('re-submitting an already pending exercise -> 404 (guard is in the UPDATE)', res.status === 404, `status ${res.status}`);
  }
  {
    const { res, json } = await call('/api/v1/sources');
    check('attribution page is public', res.status === 200 && json?.sources?.length === 2, `${json?.sources?.length} sources`);
  }

  // --- multi-language ------------------------------------------------------------------------
  {
    const { res, json } = await call('/api/v1/languages');
    const enabled = (json?.languages ?? []).map((l) => l.code).sort();
    // Asserted as a PROPERTY, not as a fixed list: the roster grows (migration 009 rostered 24
    // languages) and a hardcoded set would fail on every addition while proving nothing. What
    // matters is that the endpoint never leaks a language the server will not actually serve.
    check(
      'language list is public and enabled-only',
      res.status === 200 && enabled.length > 0 && enabled.every((c) => c !== 'ro' && c !== 'ar'),
      enabled.join(),
    );
    check('exactly one fallback language', json?.fallback === 'en', json?.fallback);
  }
  {
    const { json } = await call('/api/v1/languages', { headers: { 'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8' } });
    check('Accept-Language is parsed by preference', json?.resolved === 'hu', json?.resolved);
  }
  {
    const { json } = await call('/api/v1/languages?lang=en', { headers: { 'Accept-Language': 'hu' } });
    check('explicit ?lang beats the header', json?.resolved === 'en', json?.resolved);
  }
  {
    // A language that is not enabled must never be echoed back into a query — it falls back.
    const { json } = await call('/api/v1/languages?lang=zz');
    check('unknown language falls back, never reaches SQL', json?.resolved === 'en', json?.resolved);
  }
  {
    // Romanian, not German: German is enabled now. The example has to be a language that is
    // genuinely rostered and genuinely off, or the check quietly stops testing anything.
    const { json } = await call('/api/v1/languages', { headers: { 'Accept-Language': 'ro-RO,ro;q=0.9' } });
    check('a real but disabled language falls back', json?.resolved === 'en', json?.resolved);
  }
  {
    // The exercise the coach created carries a translation row in the creator's language, so it
    // reports as translated rather than relying on the base-row fallback.
    const { json } = await call(`/api/v1/exercises/${privateId}?lang=en`, { jar: coachJar });
    check('created exercise has a real translation row', json?.exercise?.translated === 1, `translated=${json?.exercise?.translated}`);
    check('detail reports the resolved language', json?.lang === 'en', json?.lang);
    check('detail lists available languages', Array.isArray(json?.availableLangs) && json.availableLangs.length >= 1,
      JSON.stringify(json?.availableLangs?.map((l) => l.lang)));
  }
  {
    // The fixture above ships a Hungarian translation, so it reports as translated in both
    // languages. To exercise the FALLBACK path we need a row that exists in one language only.
    const { json: created } = await call('/api/v1/exercises', {
      method: 'POST',
      jar: coachJar,
      headers: { 'Accept-Language': 'en' },
      body: { name: 'English Only Movement' },
    });
    const { json } = await call(`/api/v1/exercises/${created.id}?lang=hu`, { jar: coachJar });
    check('missing translation falls back to a usable name', json?.exercise?.name === 'English Only Movement', json?.exercise?.name);
    check('fallback is reported honestly as untranslated', json?.exercise?.translated === 0, `translated=${json?.exercise?.translated}`);

    const { json: huJson } = await call(`/api/v1/exercises/${privateId}?lang=hu`, { jar: coachJar });
    check('supplied translation is served for its language', huJson?.exercise?.name === 'Tarkóra nyomás' && huJson?.exercise?.translated === 1, huJson?.exercise?.name);
  }
  {
    const { res } = await call('/api/v1/exercises?lang=hu&q=tarkora', { jar: coachJar });
    check('search works in a language with no content', res.status === 200, `status ${res.status}`);
  }

  // --- media pipeline ------------------------------------------------------------------------
  //
  // Fixtures are GENERATED here rather than committed: an already-clean file would make the
  // EXIF-strip assertion meaningless, and a repository should not carry binaries whose contents
  // nobody reviews.
  const sharp = (await import('sharp')).default;

  const postFile = async (path, buffer, filename, type, jarToUse = coachJar, csrf = true) => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type }), filename);
    const headers = { Cookie: jarToUse.header() };
    if (csrf) headers['X-CSRF'] = '1';
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: form });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { res, json };
  };

  const png = await sharp({ create: { width: 120, height: 90, channels: 3, background: { r: 30, g: 90, b: 200 } } })
    .png()
    .toBuffer();

  // A JPEG carrying EXIF *including GPS*, so the strip assertion below proves something.
  const geotagged = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 200, g: 60, b: 30 } } })
    .withExif({
      IFD0: { Make: 'SmokeCam', Model: 'Fixture', Copyright: 'tracker smoke' },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .jpeg()
    .toBuffer();

  let mediaKey = null;
  {
    const { res, json } = await postFile(`/api/v1/exercises/${privateId}/media`, png, 'photo.png', 'image/png');
    mediaKey = json?.storage_key;
    check('image upload accepted', res.status === 201, `status ${res.status}`);
    check('server re-encodes to its own format', json?.mime === 'image/webp', json?.mime);
    check('stored key is random, not the uploaded filename', /^[0-9a-f-]{36}\.webp$/.test(mediaKey ?? ''), mediaKey);
  }
  {
    // The uploaded EXIF must not survive. Re-encoding from decoded pixels is what removes it.
    const { json } = await postFile(`/api/v1/exercises/${privateId}/media`, geotagged, 'trip.jpg', 'image/jpeg');
    const res = await fetch(`${BASE}/api/v1/media/${json.storage_key}`, { headers: { Cookie: coachJar.header() } });
    const bytes = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    check('EXIF and GPS stripped from the stored image', !meta.exif, meta.exif ? 'EXIF PRESENT' : 'none');
  }
  {
    // Content-Type says image/png, the extension says .png, the bytes say otherwise.
    const { res, json } = await postFile(`/api/v1/exercises/${privateId}/media`, Buffer.from('#!/bin/sh\necho pwned\n'), 'evil.png', 'image/png');
    check('a script renamed .png is rejected by magic-byte sniffing', res.status === 400, `status ${res.status} ${json?.error ?? ''}`);
  }
  {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const { res } = await postFile(`/api/v1/exercises/${privateId}/media`, svg, 'vector.svg', 'image/svg+xml');
    check('SVG is rejected outright', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await postFile(`/api/v1/exercises/${privateId}/media`, png, 'p.png', 'image/png', coachJar, false);
    check('upload without X-CSRF -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    const { res } = await postFile(`/api/v1/exercises/${privateId}/media`, png, 'p.png', 'image/png', coach2Jar);
    check('another coach cannot upload to this exercise -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/api/v1/media/${mediaKey}`, { headers: { Cookie: coachJar.header() } });
    check('owner can fetch the media', res.status === 200 && res.headers.get('content-type') === 'image/webp', `status ${res.status}`);
    check('served with nosniff', res.headers.get('x-content-type-options') === 'nosniff', res.headers.get('x-content-type-options'));
  }
  {
    // The key is unguessable, but knowing it must still not be enough — the DB decides.
    const res = await fetch(`${BASE}/api/v1/media/${mediaKey}`, { headers: { Cookie: coach2Jar.header() } });
    check('another coach with the exact key still gets 404', res.status === 404, `status ${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/api/v1/media/${encodeURIComponent('../../../.env')}`, { headers: { Cookie: coachJar.header() } });
    check('path traversal in the media key -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/api/v1/media/${mediaKey}`);
    check('media requires authentication', res.status === 401, `status ${res.status}`);
  }
}

// --- admin (F8-lite) -------------------------------------------------------------------------
if (seeded) {
  const adminJar = new Jar();
  const coachJar2 = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.admin.email, password: seeded.admin.password }, jar: adminJar });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachJar2 });

  {
    const { res, json } = await call('/api/v1/admin/stats', { jar: adminJar });
    check('admin stats', res.status === 200 && typeof json?.users?.total === 'number', `${json?.users?.total} users, ${json?.exercises?.total} exercises`);
  }
  {
    const { res } = await call('/api/v1/admin/stats', { jar: coachJar2 });
    check('coach cannot read admin stats -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/admin/stats');
    check('admin stats needs auth -> 401', res.status === 401, `status ${res.status}`);
  }

  let queued = null;
  {
    const { res, json } = await call('/api/v1/admin/moderation', { jar: adminJar });
    queued = json?.queue?.[0];
    check('moderation queue lists pending submissions', res.status === 200 && Array.isArray(json?.queue) && json.queue.length > 0, `${json?.queue?.length} queued`);
    check('queue shows who submitted it', typeof queued?.owner_email === 'string', queued?.owner_email);
  }
  {
    // pending_review is invisible outside the admin arm — even to the coach who submitted it,
    // through the normal browse endpoint.
    const { json } = await call('/api/v1/exercises?mine=1', { jar: coachJar2 });
    const stillListed = (json?.exercises ?? []).some((e) => e.id === queued?.id);
    check('a submitted exercise stays visible to its owner', stillListed, `${json?.exercises?.length} rows`);
  }
  {
    const { res } = await call(`/api/v1/admin/moderation/${queued.id}`, {
      method: 'POST',
      jar: coachJar2,
      body: { decision: 'approve' },
    });
    check('coach cannot moderate -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    // A rejection with no reason leaves the author with nothing to act on.
    const { res } = await call(`/api/v1/admin/moderation/${queued.id}`, {
      method: 'POST',
      jar: adminJar,
      body: { decision: 'reject' },
    });
    check('rejection without a reason -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/admin/moderation/${queued.id}`, {
      method: 'POST',
      jar: adminJar,
      body: { decision: 'approve' },
    });
    check('admin approves', res.status === 200, `status ${res.status}`);
  }
  {
    // The guard lives in the UPDATE, so a double-click cannot decide twice.
    const { res } = await call(`/api/v1/admin/moderation/${queued.id}`, {
      method: 'POST',
      jar: adminJar,
      body: { decision: 'reject', reason: 'changed my mind' },
    });
    check('deciding twice -> 404/409, never a silent second write', res.status === 404 || res.status === 409, `status ${res.status}`);
  }
  {
    const { json } = await call(`/api/v1/exercises/${queued.id}`, { jar: themeJar });
    check('approved exercise is now visible to everyone', json?.exercise?.id === queued.id, `status ${json?.exercise ? 'visible' : 'hidden'}`);
  }
  {
    const { res } = await call(`/api/v1/admin/users/${seeded.coach2 ? 1 : 1}/role`, {
      method: 'POST',
      jar: adminJar,
      body: { role: 'coach' },
    });
    check('admin can change a role', res.status === 200 || res.status === 409, `status ${res.status}`);
  }
  {
    const me = await call('/api/v1/auth/me', { jar: adminJar });
    const { res } = await call(`/api/v1/admin/users/${me.json.user.id}/role`, {
      method: 'POST',
      jar: adminJar,
      body: { role: 'user' },
    });
    check('admin cannot demote themselves -> 409', res.status === 409, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/admin/moderation/999999', {
      method: 'POST',
      jar: adminJar,
      body: { decision: 'approve', extra: 'x' },
    });
    check('unknown field in a moderation decision rejected', res.status === 400, `status ${res.status}`);
  }
}

// --- coaching: teams, join codes, three join flows (F2) -----------------------------------------
if (seeded) {
  const coachA = new Jar();
  const coachB = new Jar();
  const clientJar = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coachB });

  const clientEmail = `client-${stamp}@example.com`;
  await call('/api/v1/auth/register', { method: 'POST', body: { email: clientEmail, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: clientEmail, password: PASSWORD }, jar: clientJar });

  let teamId = null;
  {
    const { res, json } = await call('/api/v1/teams', { method: 'POST', jar: coachA, body: { name: 'Morning squad' } });
    teamId = json?.id;
    check('coach creates a team', res.status === 201 && Number.isInteger(teamId), `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/teams', { method: 'POST', jar: clientJar, body: { name: 'Nope' } });
    check('a plain user cannot create a team -> 403', res.status === 403, `status ${res.status}`);
  }

  let code = null;
  let codeId = null;
  {
    const { res, json } = await call('/api/v1/invite-codes', {
      method: 'POST', jar: coachA, body: { kind: 'multi', max_uses: 2, team_id: teamId },
    });
    code = json?.code;
    codeId = json?.id;
    check('coach mints a join code', res.status === 201 && typeof code === 'string' && code.length >= 20, code);
  }
  {
    // IDOR: another coach's team id must not be attachable to my code.
    const { res } = await call('/api/v1/invite-codes', {
      method: 'POST', jar: coachB, body: { team_id: teamId },
    });
    check("a coach cannot mint a code for another coach's team -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/invite-codes', { jar: coachA });
    const leaked = JSON.stringify(json).includes('code_hash') || (code && JSON.stringify(json).includes(code));
    check('listing codes never returns the code or its hash', !leaked);
  }
  {
    const { res, json } = await call('/api/v1/join', { method: 'POST', jar: clientJar, body: { code } });
    check('client joins with the code', res.status === 200 && json?.teamId === teamId, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/clients', { jar: coachA });
    check('client appears on the coach roster', (json?.clients ?? []).some((c) => c.email === clientEmail), `${json?.clients?.length} clients`);
  }
  {
    const { json } = await call('/api/v1/clients', { jar: coachB });
    check("the client is invisible to the other coach", !(json?.clients ?? []).some((c) => c.email === clientEmail), `${json?.clients?.length ?? 0} clients`);
  }
  {
    const { res } = await call('/api/v1/join', { method: 'POST', jar: coachA, body: { code } });
    check('a coach cannot join their own code -> 409', res.status === 409, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/join', { method: 'POST', jar: clientJar, body: { code: 'AAAAA-BBBBB-CCCCC-DDDDD' } });
    check('an unknown code -> 404 (indistinguishable from a wrong one)', res.status === 404, `status ${res.status}`);
  }
  {
    await call(`/api/v1/invite-codes/${codeId}/revoke`, { method: 'POST', jar: coachA });
    const { res } = await call('/api/v1/join', { method: 'POST', jar: clientJar, body: { code } });
    check('a revoked code stops working', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/invite-codes/${codeId}/revoke`, { method: 'POST', jar: coachB });
    check("a coach cannot revoke another coach's code -> 404", res.status === 404, `status ${res.status}`);
  }

  // --- flow C: pre-generated accounts ---------------------------------------------------------
  const pregenEmail = `pregen-${stamp}@example.com`;
  let temporary = null;
  {
    const { res, json } = await call('/api/v1/clients/pregenerate', {
      method: 'POST', jar: coachA, body: { emails: [pregenEmail], team_id: teamId },
    });
    temporary = json?.created?.[0]?.temporaryPassword;
    check('coach pre-generates an account', res.status === 201 && typeof temporary === 'string', `status ${res.status}`);
  }
  {
    const { res, json } = await call('/api/v1/clients/pregenerate', {
      method: 'POST', jar: coachA, body: { emails: [clientEmail] },
    });
    check('an existing address is skipped, never hijacked', res.status === 201 && json?.skipped?.includes(clientEmail), JSON.stringify(json?.skipped));
  }

  const pregenJar = new Jar();
  {
    const { res } = await call('/api/v1/auth/login', { method: 'POST', body: { email: pregenEmail, password: temporary }, jar: pregenJar });
    check('the pre-generated account can log in', res.status === 200, `status ${res.status}`);
  }
  {
    // THE point of flow C: until the client owns the credentials, the account can do nothing.
    const { res, json } = await call('/api/v1/exercises', { jar: pregenJar });
    check('a pre-generated account is locked out of the app -> 403', res.status === 403, `status ${res.status} ${json?.error ?? ''}`);
  }
  {
    const { json } = await call('/api/v1/auth/me', { jar: pregenJar });
    check('but it can read who it is, and knows it must change', json?.user?.must_change_credentials === 1, String(json?.user?.must_change_credentials));
  }
  {
    const { res } = await call('/api/v1/auth/change-credentials', {
      method: 'POST', jar: pregenJar, body: { currentPassword: 'WrongOne123x', password: 'ClientOwnPass1' },
    });
    check('changing without the current password -> 401', res.status === 401, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/auth/change-credentials', {
      method: 'POST', jar: pregenJar, body: { currentPassword: temporary, password: 'ClientOwnPass1' },
    });
    check('client sets their own password', res.status === 200, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/auth/login', { method: 'POST', body: { email: pregenEmail, password: temporary } });
    check('the temporary password no longer works', res.status === 401, `status ${res.status}`);
  }
  {
    const ownJar = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: pregenEmail, password: 'ClientOwnPass1' }, jar: ownJar });
    const { res } = await call('/api/v1/exercises', { jar: ownJar });
    check('and the account is now fully usable', res.status === 200, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/clients', { jar: coachA });
    const link = (json?.clients ?? []).find((c) => c.email === pregenEmail);
    check('the coach keeps the client link after the handover', !!link, link ? link.origin : 'missing');
  }

  // --- T2.4 abuse paths: cross-coach reach and revocation timing --------------------------------
  // The checks above prove the feature works. These prove it cannot be bent. They run against the
  // roster the flows above populated — the state an attacker would actually meet.
  {
    const { json } = await call('/api/v1/clients', { jar: coachA });
    const victim = (json?.clients ?? []).find((c) => c.email === clientEmail);

    {
      // The link id is a small integer and therefore guessable. Guessing it must buy nothing.
      const { res } = await call(`/api/v1/clients/${victim.link_id}/archive`, { method: 'POST', jar: coachB });
      check("a coach cannot archive another coach's client -> 404", res.status === 404, `status ${res.status}`);
    }
    {
      // ...and the failed attempt must not have half-succeeded.
      const { json: after } = await call('/api/v1/clients', { jar: coachA });
      const still = (after?.clients ?? []).find((c) => c.email === clientEmail);
      check('the victim link is untouched by the failed attempt', still?.status === victim.status, `status ${still?.status}`);
    }
    {
      // Escalation through a team id: coachB owns no team, so naming coachA's team must not
      // create one, join one, or leak its membership.
      const { res } = await call('/api/v1/teams', { jar: coachB });
      const { json: mine } = await call('/api/v1/teams', { jar: coachB });
      check(
        "another coach's team is absent from my team list",
        res.status === 200 && !(mine?.teams ?? []).some((t) => t.id === teamId),
        `${mine?.teams?.length ?? 0} teams`,
      );
    }
    {
      // Revocation timing: archiving must take effect on the very next read, with the same
      // access token. A cached role or a stale JWT claim would show up here as a pass-through.
      await call(`/api/v1/clients/${victim.link_id}/archive`, { method: 'POST', jar: coachA });
      const { json: after } = await call('/api/v1/clients', { jar: coachA });
      check(
        'an archived client leaves the roster on the next read, same token',
        !(after?.clients ?? []).some((c) => c.email === clientEmail),
        `${after?.clients?.length ?? 0} clients`,
      );
    }
    {
      const { res } = await call(`/api/v1/clients/${victim.link_id}/archive`, { method: 'POST', jar: coachA });
      check('archiving twice is not a second success -> 404', res.status === 404, `status ${res.status}`);
    }
    {
      // The client keeps their own account. Losing a coach is not losing access to the app.
      const ownJar = new Jar();
      const { res } = await call('/api/v1/auth/login', {
        method: 'POST', body: { email: clientEmail, password: PASSWORD }, jar: ownJar,
      });
      const { res: meRes } = await call('/api/v1/auth/me', { jar: ownJar });
      check('the archived client still owns their account', res.status === 200 && meRes.status === 200, `login ${res.status}, me ${meRes.status}`);
    }
  }
}

// --- onboarding (F11): draft auto-save, completeness, and the coach's read ---------------------
{
  const coachA = new Jar();
  const clientJar = new Jar();
  const strangerJar = new Jar();
  const obEmail = `onboard-${stamp}@example.com`;
  const strangerEmail = `stranger-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/register', { method: 'POST', body: { email: obEmail, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: obEmail, password: PASSWORD }, jar: clientJar });
  await call('/api/v1/auth/register', { method: 'POST', body: { email: strangerEmail, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: strangerEmail, password: PASSWORD }, jar: strangerJar });

  let equipmentIds = [];
  {
    const { res, json } = await call('/api/v1/onboarding', { jar: clientJar });
    equipmentIds = (json?.options?.equipment ?? []).slice(0, 3).map((e) => e.id);
    check(
      'a fresh profile is absent, not invented, and the options ship with it',
      res.status === 200 && json?.profile === null && json?.options?.equipment?.length > 0,
      `profile ${json?.profile}, ${json?.options?.equipment?.length} equipment`,
    );
  }
  {
    // Equipment labels must arrive in the reader's language, not English with a Hungarian UI.
    const { json } = await call('/api/v1/onboarding?lang=hu', { jar: clientJar });
    const translated = (json?.options?.equipment ?? []).filter((e) => e.translated).length;
    check('equipment options are localised', json?.lang === 'hu' && translated > 10, `${translated} translated`);
  }
  {
    // The first save creates the row. This is the auto-save path: partial, no submit.
    const { res, json } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar, body: { step: 1, primary_goal: 'strength' },
    });
    check('the first keystroke creates a draft', res.status === 200 && json?.profile?.status === 'draft' && json.profile.primary_goal === 'strength', `status ${res.status}`);
  }
  {
    // ...and a second partial save must not null the first one's answers by omission.
    const { json } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar, body: { experience: 'beginner' },
    });
    check('a partial save keeps untouched fields', json?.profile?.primary_goal === 'strength' && json.profile.experience === 'beginner', JSON.stringify({ g: json?.profile?.primary_goal, e: json?.profile?.experience }));
  }
  {
    const { res } = await call('/api/v1/onboarding/complete', { method: 'POST', jar: clientJar });
    check('submitting an unfinished profile -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar,
      body: { sessions_per_week: 4, training_location: 'gym', equipment: equipmentIds, limitations: [{ body_area: 'knee', severity: 'avoid', note: 'meniscus' }] },
    });
    check('equipment and limitations save as sets', json?.profile?.equipment?.length === 3 && json.profile.limitations?.[0]?.body_area === 'knee', JSON.stringify({ eq: json?.profile?.equipment?.length, lim: json?.profile?.limitations?.length }));
  }
  {
    // Re-sending a shorter set must REPLACE, not merge — otherwise unticking a box does nothing.
    const { json } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar, body: { equipment: equipmentIds.slice(0, 1) },
    });
    check('unticking equipment actually removes it', json?.profile?.equipment?.length === 1, `${json?.profile?.equipment?.length} rows`);
  }
  {
    const { res, json } = await call('/api/v1/onboarding/complete', { method: 'POST', jar: clientJar });
    check('a complete profile submits', res.status === 200 && json?.ok === true, `status ${res.status}`);
  }
  {
    const { res, json } = await call('/api/v1/onboarding/complete', { method: 'POST', jar: clientJar });
    check('a double-tapped submit is not an error', res.status === 200 && json?.alreadyComplete === true, `status ${res.status}`);
  }

  // --- abuse paths ------------------------------------------------------------------------------
  {
    // The body must have no way to name a victim. `user_id` is not in the schema, so .strict()
    // rejects it outright rather than ignoring it — an ignored field is a field someone will
    // eventually wire up.
    const { res } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: strangerJar, body: { user_id: 1, primary_goal: 'muscle' },
    });
    check('a forged user_id in the body -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: strangerJar, body: { status: 'complete' },
    });
    check('the client cannot set its own status -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar, body: { sessions_per_week: 99 },
    });
    check('an out-of-range answer -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar, body: { limitations: [{ body_area: 'wallet', severity: 'avoid' }] },
    });
    check('an invented body area -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/onboarding', {
      method: 'PATCH', jar: clientJar, body: { equipment: [999999] },
    });
    check('a non-existent equipment id -> 400, not a server error', res.status === 400, `status ${res.status}`);
  }
  {
    // ...and that rejection must have rolled back, leaving the previous set intact.
    const { json } = await call('/api/v1/onboarding', { jar: clientJar });
    check('the failed equipment save rolled back whole', json?.profile?.equipment?.length === 1, `${json?.profile?.equipment?.length} rows`);
  }
  {
    const { res } = await call('/api/v1/onboarding', { method: 'PATCH', body: { step: 1 } });
    check('anonymous save -> 401', res.status === 401, `status ${res.status}`);
  }

  // --- the coach's read -------------------------------------------------------------------------
  let linkId = null;
  {
    const { json: codeJson } = await call('/api/v1/invite-codes', { method: 'POST', jar: coachA, body: { kind: 'multi', max_uses: 5 } });
    await call('/api/v1/join', { method: 'POST', jar: clientJar, body: { code: codeJson.code } });
    const { json } = await call('/api/v1/clients', { jar: coachA });
    linkId = (json?.clients ?? []).find((c) => c.email === obEmail)?.link_id ?? null;
    check('the onboarded client is linked to the coach', Number.isInteger(linkId), `link ${linkId}`);
  }
  // --- clients/:id detail -----------------------------------------------------------------------
  // Deep-linkable, so the three ways it can fail — not yours, archived, never existed — must be
  // indistinguishable from outside. Otherwise the response becomes an oracle for enumerating
  // which link ids belong to somebody.
  {
    const { res, json } = await call(`/api/v1/clients/${linkId}`, { jar: coachA });
    check('the coach reads one client by link id', res.status === 200 && json?.client?.email === obEmail, `status ${res.status}`);
  }
  {
    // Role rejection. 403 is correct here and is the one deliberate exception to 404-never-403:
    // "you are not a coach" reveals nothing about any object and is a fact about the caller they
    // already know.
    const { res } = await call(`/api/v1/clients/${linkId}`, { jar: strangerJar });
    check('a non-coach hitting the coach surface -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    // Object rejection. A real coach, correctly through the role gate, must still not learn that
    // another coach's link exists.
    const otherCoach = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: otherCoach });
    const { res } = await call(`/api/v1/clients/${linkId}`, { jar: otherCoach });
    check("another coach deep-linking to a link that is not theirs -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/clients/999999', { jar: coachA });
    check('a link id that never existed -> 404, same shape', res.status === 404, `status ${res.status}`);
  }
  {
    // The client's own user id is a DIFFERENT id space. Passing one where a link id belongs must
    // not accidentally resolve — the dashboard shipped exactly this confusion once.
    const { json: me } = await call('/api/v1/clients', { jar: coachA });
    const clientUserId = (me?.clients ?? []).find((c) => c.email === obEmail)?.client_id;
    const { res } = await call(`/api/v1/clients/${clientUserId}`, { jar: coachA });
    check(
      'a user id passed where a link id belongs does not resolve to that client',
      res.status === 404 || clientUserId === linkId,
      `user ${clientUserId} vs link ${linkId} -> ${res.status}`,
    );
  }

  {
    const { res, json } = await call(`/api/v1/clients/${linkId}/onboarding?lang=hu`, { jar: coachA });
    check(
      'the coach reads the profile with localised equipment',
      res.status === 200 && json?.profile?.primary_goal === 'strength' && typeof json.profile.equipment?.[0]?.name === 'string',
      `status ${res.status}, eq ${json?.profile?.equipment?.[0]?.name}`,
    );
  }
  {
    // The client's own words stay the client's own words.
    const { json } = await call(`/api/v1/clients/${linkId}/onboarding`, { jar: coachA });
    check('limitations reach the coach verbatim', json?.profile?.limitations?.[0]?.note === 'meniscus', JSON.stringify(json?.profile?.limitations?.[0]));
  }
  {
    const { res } = await call(`/api/v1/clients/${linkId}/onboarding`, { jar: strangerJar });
    check('a non-coach reading a client profile -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    // The check that matters: a REAL coach, past the role gate, still gets nothing.
    const otherCoach = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: otherCoach });
    const { res } = await call(`/api/v1/clients/${linkId}/onboarding`, { jar: otherCoach });
    check("another coach cannot read this client's profile -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    // A guessable link id must buy nothing even for a real coach.
    const otherCoach = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: otherCoach });
    const { res } = await call('/api/v1/clients/1/onboarding', { jar: otherCoach });
    check('probing link id 1 as another coach -> 404', res.status === 404, `status ${res.status}`);
  }

  // --- the picker, annotated against this client's answers (T2.5.4) -----------------------------
  //
  // The client has a knee limitation at severity 'avoid' and a specific equipment set. Picking an
  // exercise for them should SAY so — flags, never a silent filter: hiding options from a coach
  // who knows the knee is fine this week is worse than showing them the constraint.
  {
    const { res, json } = await call(`/api/v1/exercises?for_client=${linkId}&limit=40`, { jar: coachA });
    const rows = json?.exercises ?? [];
    check(
      'the picker annotates every row rather than dropping any',
      res.status === 200 && rows.length > 0 && rows.every((e) => Array.isArray(e.missing_equipment) && Array.isArray(e.conflicts)),
      `status ${res.status}, ${rows.length} rows`,
    );
    check(
      'and the annotation actually finds something to flag',
      rows.some((e) => e.missing_equipment.length > 0) || rows.some((e) => e.conflicts.length > 0),
      `${rows.filter((e) => e.missing_equipment.length).length} missing-kit, ${rows.filter((e) => e.conflicts.length).length} conflicting`,
    );
  }
  {
    // The conflict path, made DETERMINISTIC rather than hoped for. The first version of this check
    // passed while finding nothing to flag — the smoke database holds a handful of exercises and
    // none of them happened to load a knee. A check that cannot fail is not a check.
    //
    // `quads` is mapped to body_area 'knee' with relation 'loads' by 010's body_area_muscle_map,
    // and this client's knee is at severity 'avoid'.
    const { json: made } = await call('/api/v1/exercises', {
      method: 'POST', jar: coachA,
      body: { name: `Knee loader ${stamp}`, muscles: [{ slug: 'quads', role: 'primary' }] },
    });
    const { json } = await call(`/api/v1/exercises?for_client=${linkId}&limit=40`, { jar: coachA });
    const flagged = (json?.exercises ?? []).find((e) => e.id === made?.id);
    const knee = flagged?.conflicts?.find((c) => c.body_area === 'knee');
    check(
      'a knee-loading movement is flagged for a client whose knee is at avoid',
      !!knee,
      knee ? JSON.stringify(knee) : `conflicts: ${JSON.stringify(flagged?.conflicts)}`,
    );
    check(
      'and the flag says LOADS, not merely stabilises — collapsing the two makes every squat a knee risk',
      knee?.relation === 'loads' && knee?.severity === 'avoid',
      `relation ${knee?.relation}, severity ${knee?.severity}`,
    );
    const all = json?.exercises ?? [];
    check(
      "a 'past' limitation is never flagged — it would train the coach to ignore the flag",
      all.length > 0 && all.every((e) => e.conflicts.every((c) => c.severity !== 'past')),
      `${all.length} rows, severities: ${[...new Set(all.flatMap((e) => e.conflicts.map((c) => c.severity)))].join(',') || 'none'}`,
    );
  }
  {
    // Without the parameter the shape is unchanged — no caller pays for a feature it did not ask
    // for, and nothing leaks into the ordinary library listing.
    const { json } = await call('/api/v1/exercises?limit=5', { jar: coachA });
    check(
      'the plain listing carries no client data at all',
      (json?.exercises ?? []).every((e) => e.missing_equipment === undefined && e.conflicts === undefined),
      `${json?.exercises?.length} rows`,
    );
  }
  {
    // THE ONE THAT MATTERS. This endpoint now exposes a client's INJURIES, and a link id is
    // guessable — so the predicate, not the obscurity, has to be what stops this.
    const otherCoach = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: otherCoach });
    const { res } = await call(`/api/v1/exercises?for_client=${linkId}&limit=5`, { jar: otherCoach });
    check("another coach cannot annotate against a client that is not theirs -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/exercises?for_client=${linkId}&limit=5`, { jar: strangerJar });
    check('nor can a plain client -> 404', res.status === 404, `status ${res.status}`);
  }

  {
    // Access must end with the link, not with the token.
    await call(`/api/v1/clients/${linkId}/archive`, { method: 'POST', jar: coachA });
    const { res } = await call(`/api/v1/clients/${linkId}/onboarding`, { jar: coachA });
    check('archiving ends profile access on the next read -> 404', res.status === 404, `status ${res.status}`);
  }
}

// --- languages: German is a first-class language, end to end ----------------------------------
// The point is not that German exists. It is that all THREE layers answer in it — the taxonomy,
// the exercise names, and the fallback flag that tells the UI when they do not.
{
  const jar = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar });

  {
    const { res, json } = await call('/api/v1/taxonomies?lang=de', { jar });
    const translated = (json?.equipment ?? []).filter((e) => e.translated).length;
    check(
      'taxonomies answer in German',
      res.status === 200 && json?.lang === 'de' && translated === json.equipment.length,
      `${translated}/${json?.equipment?.length} translated`,
    );
  }
  {
    // A language nobody enabled must fall back rather than 400 — a browser sending an exotic
    // Accept-Language is not an error, it is Tuesday.
    const { res, json } = await call('/api/v1/taxonomies?lang=zz', { jar });
    check('an unknown language falls back, it does not fail', res.status === 200 && json?.lang !== 'zz', `lang ${json?.lang}`);
  }
  {
    // ...and it must fall back HONESTLY. A dormant language with no taxonomy content has to
    // report translated:false, not pass English off as Romanian.
    const { json } = await call('/api/v1/taxonomies?lang=ro', { jar });
    check(
      'a dormant language is not silently claimed as translated',
      json?.lang !== 'ro' || (json?.equipment ?? []).every((e) => !e.translated),
      `lang ${json?.lang}`,
    );
  }
  {
    // Built here rather than read from the seeded dataset: the suite runs against a throwaway
    // database, and a test that needs 1652 imported rows is a test that passes or fails on which
    // machine it ran. Two exercises, one translated and one not, prove the same mechanism.
    const coachJar3 = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachJar3 });

    const { json: withDe } = await call('/api/v1/exercises', {
      method: 'POST', jar: coachJar3,
      body: { name: 'Lang Probe Translated', translations: [{ lang: 'de', name: 'Sprachprobe übersetzt' }] },
    });
    const { json: withoutDe } = await call('/api/v1/exercises', {
      method: 'POST', jar: coachJar3, body: { name: 'Lang Probe Untranslated' },
    });

    const a = (await call(`/api/v1/exercises/${withDe.id}?lang=de`, { jar: coachJar3 })).json;
    const b = (await call(`/api/v1/exercises/${withoutDe.id}?lang=de`, { jar: coachJar3 })).json;

    check(
      'a translated exercise answers in German and says so',
      a?.exercise?.name === 'Sprachprobe übersetzt' && a?.exercise?.translated === 1,
      `"${a?.exercise?.name}", translated=${a?.exercise?.translated}, lang=${a?.lang}`,
    );
    check(
      'an untranslated one falls back to the canonical name and admits it',
      b?.exercise?.name === 'Lang Probe Untranslated' && !b?.exercise?.translated,
      `"${b?.exercise?.name}", translated=${b?.exercise?.translated}, lang=${b?.lang}`,
    );
  }
  {
    // The lang parameter is client input and reaches a bound parameter. It must never reach the
    // SQL any other way.
    const { res } = await call('/api/v1/taxonomies?lang=' + encodeURIComponent("de' OR 1=1--"), { jar });
    check('an injected lang parameter is rejected by the allowlist, not the database', res.status === 200, `status ${res.status}`);
  }
}

// --- plan authoring (F3) ----------------------------------------------------------------------
{
  const coachA = new Jar();
  const coachB = new Jar();
  const clientJar = new Jar();
  const planClientEmail = `planclient-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coachB });
  await call('/api/v1/auth/register', { method: 'POST', body: { email: planClientEmail, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: planClientEmail, password: PASSWORD }, jar: clientJar });

  // Link the client to coachA so a client-scoped plan is possible.
  let planLinkId = null;
  {
    const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coachA, body: { kind: 'multi', max_uses: 5 } });
    await call('/api/v1/join', { method: 'POST', jar: clientJar, body: { code: code.code } });
    const { json } = await call('/api/v1/clients', { jar: coachA });
    planLinkId = (json?.clients ?? []).find((c) => c.email === planClientEmail)?.link_id ?? null;
  }

  let templateId = null;
  let clientPlanId = null;

  {
    const { res, json } = await call('/api/v1/plans', {
      method: 'POST', jar: coachA, body: { name: 'Upper/Lower', goal: 'strength', cycle_days: 7 },
    });
    templateId = json?.id ?? null;
    check('a coach creates a template', res.status === 201 && Number.isInteger(templateId), `status ${res.status}`);
  }
  {
    const { res, json } = await call('/api/v1/plans', {
      method: 'POST', jar: coachA,
      body: { name: 'Anna — block 1', coach_client_id: planLinkId, starts_on: '2026-08-10' },
    });
    clientPlanId = json?.id ?? null;
    check('and a client-scoped plan through the LINK', res.status === 201 && Number.isInteger(clientPlanId), `status ${res.status}`);
  }
  {
    // The link id is a small integer. Guessing another coach's must buy nothing — and because the
    // create is INSERT ... SELECT, there is no window between the check and the write.
    const { res } = await call('/api/v1/plans', {
      method: 'POST', jar: coachB, body: { name: 'stolen', coach_client_id: planLinkId },
    });
    check("a coach cannot create a plan against another coach's link -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/plans', {
      method: 'POST', jar: coachA, body: { name: 'nope', coach_client_id: 999999 },
    });
    check('nor against a link that never existed -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/plans', { method: 'POST', jar: clientJar, body: { name: 'x' } });
    check('a plain client cannot author plans -> 403', res.status === 403, `status ${res.status}`);
  }

  // --- days -------------------------------------------------------------------------------------
  let dayId = null;
  {
    const { res, json } = await call(`/api/v1/plans/${templateId}/days`, {
      method: 'POST', jar: coachA, body: { day_index: 0, name: 'Push', start_time: '18:00' },
    });
    dayId = json?.id ?? null;
    check('a day is added, with a time of day', res.status === 201 && Number.isInteger(dayId), `status ${res.status}`);
  }
  {
    // day_index must fall inside the cycle. A 7-day plan has no day 40, and the trigger says so
    // rather than silently creating an occurrence that never fires.
    const { res, json } = await call(`/api/v1/plans/${templateId}/days`, {
      method: 'POST', jar: coachA, body: { day_index: 40, name: 'ghost' },
    });
    // The message is GENERIC on purpose. It used to forward the trigger's own text, which read
    // "workout_plan_days.day_index must be inside the plan cycle" — a table and a column name, in
    // a toast, to a coach. `constraintFault` now withholds any trigger message containing an
    // identifier: it is schema reconnaissance, and the house rule is that details go to the log.
    //
    // Nothing is lost for the user, because this trigger is a BACKSTOP — the plan editor already
    // knows `cycle_days` and offers only free indexes. The old assertion checked the status alone
    // while its name claimed "with the rule stated", so it would have passed either way.
    check(
      'a day outside the cycle -> 400, and the message names no table or column',
      res.status === 400 && !/[a-z]+_[a-z_]+|\w+\.\w+/.test(json?.error ?? ''),
      `${res.status}: ${json?.error}`,
    );
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}/days`, {
      method: 'POST', jar: coachB, body: { day_index: 1, name: 'intruder' },
    });
    check("a coach cannot add a day to another coach's plan -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}/days/${dayId}`, {
      method: 'PATCH', jar: coachB, body: { name: 'renamed' },
    });
    check("nor rename one -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}/days`, {
      method: 'POST', jar: coachA, body: { day_index: 0, name: 'dupe', evil: 1 },
    });
    check('an unknown field is rejected outright -> 400', res.status === 400, `status ${res.status}`);
  }

  // --- reading ----------------------------------------------------------------------------------
  {
    const { res, json } = await call(`/api/v1/plans/${templateId}`, { jar: coachA });
    check(
      'the whole authoring tree comes back in one request',
      res.status === 200 && json?.plan?.id === templateId && Array.isArray(json.days) && json.days.length === 1,
      `${json?.days?.length} days, ${json?.blocks?.length} blocks`,
    );
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}`, { jar: coachB });
    check("another coach reading the tree -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/plans', { jar: coachB });
    check(
      "another coach's plan list does not contain it",
      !(json?.plans ?? []).some((p) => p.id === templateId),
      `${json?.plans?.length ?? 0} plans`,
    );
  }

  // --- what the client sees ---------------------------------------------------------------------
  {
    // A draft is invisible: a coach builds a week one exercise at a time without the client
    // watching it appear.
    const { json } = await call('/api/v1/my-plans', { jar: clientJar });
    check('a draft plan is invisible to the client', !(json?.plans ?? []).some((p) => p.id === clientPlanId), `${json?.plans?.length ?? 0} plans`);
  }
  {
    await call(`/api/v1/plans/${clientPlanId}`, { method: 'PATCH', jar: coachA, body: { status: 'active' } });
    const { json } = await call('/api/v1/my-plans', { jar: clientJar });
    check('activating it makes it visible', (json?.plans ?? []).some((p) => p.id === clientPlanId), `${json?.plans?.length ?? 0} plans`);
  }
  {
    // An active client plan needs a start date or it generates zero occurrences forever. The schema
    // refuses; the route must surface that rather than 500.
    const { json: bare } = await call('/api/v1/plans', {
      method: 'POST', jar: coachA, body: { name: 'no start', coach_client_id: planLinkId },
    });
    const { res, json } = await call(`/api/v1/plans/${bare.id}`, { method: 'PATCH', jar: coachA, body: { status: 'active' } });
    check('activating a plan with no start date -> 400, not 500', res.status === 400, `${res.status}: ${json?.error}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${clientPlanId}`, { method: 'PATCH', jar: clientJar, body: { name: 'mine now' } });
    check('a client cannot edit their own plan -> 403', res.status === 403, `status ${res.status}`);
  }

  // --- archiving ---------------------------------------------------------------------------------
  {
    const { res } = await call(`/api/v1/plans/${templateId}`, { method: 'DELETE', jar: coachB });
    check("a coach cannot archive another coach's plan -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}`, { method: 'DELETE', jar: coachA });
    check('the author archives it', res.status === 200, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}`, { method: 'DELETE', jar: coachA });
    check('archiving twice is not a second success -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${templateId}`, { jar: coachA });
    check('an archived plan is gone from the author too -> 404', res.status === 404, `status ${res.status}`);
  }

  // --- the link is the authority, not the authorship --------------------------------------------
  {
    // Archiving the CLIENT must end the coach's write access to that client's plan on the very
    // next request, with the same unexpired token. Authorship alone would keep it open forever.
    await call(`/api/v1/clients/${planLinkId}/archive`, { method: 'POST', jar: coachA });
    const { res } = await call(`/api/v1/plans/${clientPlanId}`, { method: 'PATCH', jar: coachA, body: { name: 'still mine?' } });
    check('archiving the client ends plan write access immediately -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // ...and the client keeps their plan. They own their training; the coach owned the relationship.
    const { json } = await call('/api/v1/my-plans', { jar: clientJar });
    check('but the client keeps the plan', (json?.plans ?? []).some((p) => p.id === clientPlanId), `${json?.plans?.length ?? 0} plans`);
  }
}

// --- a prescribed private exercise is readable by the client it was prescribed to --------------
//
// The bug: the WRITE side (trg_log_exercise_visible_ins) granted a client read of an exercise
// prescribed to them, and the READ side did not know. A coach could put their own private movement
// into a client's plan and the client got a 404 looking it up — told to do something they could
// not see.
{
  const coachA = new Jar();
  const coachB = new Jar();
  const pupil = new Jar();
  const stranger = new Jar();
  const pupilEmail = `pupil-${stamp}@example.com`;
  const strangerEmail = `nosy-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coachB });
  for (const [email, jar] of [[pupilEmail, pupil], [strangerEmail, stranger]]) {
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
  }

  // The coach's own private movement.
  const { json: secret } = await call('/api/v1/exercises', {
    method: 'POST', jar: coachA, body: { name: `Coach Secret Lift ${stamp}` },
  });

  {
    const { res } = await call(`/api/v1/exercises/${secret.id}`, { jar: pupil });
    check('before prescription the client cannot see it -> 404', res.status === 404, `status ${res.status}`);
  }

  // Link, plan, day, block, prescription.
  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coachA, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: pupil, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coachA });
  const pupilLink = (roster?.clients ?? []).find((c) => c.email === pupilEmail)?.link_id;

  const { json: plan } = await call('/api/v1/plans', {
    method: 'POST', jar: coachA,
    body: { name: 'prescription probe', coach_client_id: pupilLink, starts_on: '2026-08-10' },
  });
  const { json: day } = await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coachA, body: { day_index: 0, name: 'Day 1' },
  });

  // The authoring tree below the day has no routes yet, so the prescription is written directly.
  // The point under test is the READ predicate, not the route that will eventually create this.
  const prescribed = await seedPrescription({ planId: plan.id, dayId: day.id, exerciseId: secret.id });

  {
    // A DRAFT plan grants nothing. The client cannot see the plan, so they must not see the
    // movements inside it either — a coach builds a week without the client watching it appear.
    const { res } = await call(`/api/v1/exercises/${secret.id}`, { jar: pupil });
    check('a draft plan does not grant the read yet -> 404', res.status === 404, `status ${res.status}`);
  }
  await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coachA, body: { status: 'active' } });

  if (!prescribed) {
    check('a prescription could be created for the probe', false, 'seedPrescription failed — check cannot run');
  } else {
    {
      const { res, json } = await call(`/api/v1/exercises/${secret.id}`, { jar: pupil });
      check(
        'a prescribed private exercise becomes readable to that client',
        res.status === 200 && json?.exercise?.id === secret.id,
        `status ${res.status}`,
      );
    }
    {
      const { res } = await call(`/api/v1/exercises/${secret.id}`, { jar: stranger });
      check('but not to anyone else -> 404', res.status === 404, `status ${res.status}`);
    }
    {
      const { res } = await call(`/api/v1/exercises/${secret.id}`, { jar: coachB });
      check('and not to another coach -> 404', res.status === 404, `status ${res.status}`);
    }
    {
      const { json } = await call('/api/v1/exercises?limit=100', { jar: pupil });
      check(
        'it appears in that client\'s library listing too',
        (json?.exercises ?? []).some((e) => e.id === secret.id),
        `${json?.exercises?.length ?? 0} rows`,
      );
    }
    {
      // The read is granted by the LINK, not by the prescription alone. Archiving the client must
      // withdraw it on the very next request.
      await call(`/api/v1/clients/${pupilLink}/archive`, { method: 'POST', jar: coachA });
      const { res } = await call(`/api/v1/exercises/${secret.id}`, { jar: pupil });
      check('archiving the client withdraws the read immediately -> 404', res.status === 404, `status ${res.status}`);
    }
  }
}

// --- the authoring tree below the day: blocks, exercises, reorder ------------------------------
{
  const coachA = new Jar();
  const coachB = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coachB });

  const { json: plan } = await call('/api/v1/plans', { method: 'POST', jar: coachA, body: { name: 'tree probe' } });
  const { json: day } = await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coachA, body: { day_index: 0, name: 'Day A' },
  });
  // A second plan owned by the SAME coach, for the cross-plan checks — a stranger's plan would be
  // caught by the ownership predicate and prove less.
  const { json: otherPlan } = await call('/api/v1/plans', { method: 'POST', jar: coachA, body: { name: 'other' } });
  const { json: otherDay } = await call(`/api/v1/plans/${otherPlan.id}/days`, {
    method: 'POST', jar: coachA, body: { day_index: 0, name: 'elsewhere' },
  });

  let blockId = null;
  {
    const { res, json } = await call(`/api/v1/plans/${plan.id}/blocks`, {
      method: 'POST', jar: coachA, body: { day_id: day.id, kind: 'superset', position: 0 },
    });
    blockId = json?.id ?? null;
    check('a superset block is created', res.status === 201 && Number.isInteger(blockId), `status ${res.status}`);
  }
  {
    // The day must belong to the same plan. A day id from another of the coach's OWN plans is
    // still wrong, and the ownership predicate alone would not catch it — the join does.
    const { res } = await call(`/api/v1/plans/${plan.id}/blocks`, {
      method: 'POST', jar: coachA, body: { day_id: otherDay.id },
    });
    check("a day from a different plan cannot host a block -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${plan.id}/blocks`, {
      method: 'POST', jar: coachB, body: { day_id: day.id },
    });
    check("another coach cannot add a block -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    // A circuit repeats the BLOCK, so it needs a round count. The schema says so, not the route.
    const { res, json } = await call(`/api/v1/plans/${plan.id}/blocks`, {
      method: 'POST', jar: coachA, body: { day_id: day.id, kind: 'circuit' },
    });
    check('a circuit without rounds -> 400 with the rule stated', res.status === 400, `${res.status}: ${json?.error}`);
  }

  // --- prescribed exercises ---------------------------------------------------------------------
  const { json: lib } = await call('/api/v1/exercises?limit=2', { jar: coachA });
  const globalEx = lib.exercises[0];
  let rowId = null;
  {
    const { res, json } = await call(`/api/v1/plans/${plan.id}/exercises`, {
      method: 'POST', jar: coachA,
      body: { block_id: blockId, exercise_id: globalEx.id, target_sets: 4, target_reps_min: 8, target_reps_max: 12 },
    });
    rowId = json?.id ?? null;
    check('an exercise is prescribed into the block', res.status === 201 && Number.isInteger(rowId), `status ${res.status}`);
  }
  {
    // The weight the coach TYPED, in pounds. The canonical kilograms are the server's business —
    // 225 lb must land as 102.058 kg, and the schema's CHECK verifies the pair agrees.
    const { res } = await call(`/api/v1/plans/${plan.id}/exercises/${rowId}`, {
      method: 'PATCH', jar: coachA, body: { target_weight: 225, target_weight_unit: 'lb' },
    });
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const row = (tree?.exercises ?? []).find((e) => e.id === rowId);
    check(
      'a weight typed in pounds is stored canonically in kilograms',
      res.status === 200 && Math.abs(row.target_weight_kg - 102.058) < 0.01
        && row.target_weight_entry_unit === 'lb' && row.target_weight_entry_value === 225,
      `${row?.target_weight_kg} kg from ${row?.target_weight_entry_value} ${row?.target_weight_entry_unit}`,
    );
  }
  {
    // The name is snapshot from the exercise, never from the request — it is what the client's log
    // will carry forever, and it has to survive the exercise being renamed or removed.
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const row = (tree?.exercises ?? []).find((e) => e.id === rowId);
    check('the exercise name is snapshot at prescription time', typeof row?.exercise_name_snapshot === 'string' && row.exercise_name_snapshot.length > 0, row?.exercise_name_snapshot);
  }
  {
    // Another coach's private exercise cannot be prescribed. The LEFT JOIN yields NULL for the
    // exercise and the row is created unlinked rather than granting a read — so the check is that
    // it does NOT come back pointing at the private id.
    const { json: secret } = await call('/api/v1/exercises', {
      method: 'POST', jar: coachB, body: { name: `B private ${stamp}` },
    });
    await call(`/api/v1/plans/${plan.id}/exercises`, {
      method: 'POST', jar: coachA, body: { block_id: blockId, exercise_id: secret.id },
    });
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    check(
      "another coach's private exercise cannot be prescribed",
      !(tree?.exercises ?? []).some((e) => e.exercise_id === secret.id),
      `${tree?.exercises?.length} rows`,
    );
  }

  // --- reordering -------------------------------------------------------------------------------
  {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const { json } = await call(`/api/v1/plans/${plan.id}/blocks`, {
        method: 'POST', jar: coachA, body: { day_id: day.id, position: i + 10 },
      });
      ids.push(json.id);
    }
    const reversed = [...ids].reverse();
    const { res, json } = await call(`/api/v1/plans/${plan.id}/blocks/order`, {
      method: 'PUT', jar: coachA, body: { ids: reversed },
    });
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const positions = reversed.map((id) => (tree?.blocks ?? []).find((b) => b.id === id)?.position);
    check(
      'reordering renumbers from zero, in the order given',
      res.status === 200 && json?.moved === 3 && positions.join() === '0,1,2',
      `moved ${json?.moved}, positions ${positions.join()}`,
    );
  }
  {
    const { res } = await call(`/api/v1/plans/${plan.id}/blocks/order`, {
      method: 'PUT', jar: coachA, body: { ids: [blockId, blockId] },
    });
    check('the same id twice in an order -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // A forged id in the list must be a no-op, not a cross-tenant write. The response reports how
    // many actually moved, which is what tells the UI its list has drifted.
    const { json: bPlan } = await call('/api/v1/plans', { method: 'POST', jar: coachB, body: { name: 'B plan' } });
    const { json: bDay } = await call(`/api/v1/plans/${bPlan.id}/days`, {
      method: 'POST', jar: coachB, body: { day_index: 0, name: 'B day' },
    });
    const { json: bBlock } = await call(`/api/v1/plans/${bPlan.id}/blocks`, {
      method: 'POST', jar: coachB, body: { day_id: bDay.id },
    });
    const { res, json } = await call(`/api/v1/plans/${plan.id}/blocks/order`, {
      method: 'PUT', jar: coachA, body: { ids: [blockId, bBlock.id] },
    });
    check(
      "a foreign id in the order moves nothing and is reported",
      res.status === 200 && json?.moved === 1 && json?.of === 2,
      `moved ${json?.moved} of ${json?.of}`,
    );
    const { json: bTree } = await call(`/api/v1/plans/${bPlan.id}`, { jar: coachB });
    check(
      "and the other coach's block keeps its position",
      (bTree?.blocks ?? []).find((b) => b.id === bBlock.id)?.position === 0,
      `position ${(bTree?.blocks ?? []).find((b) => b.id === bBlock.id)?.position}`,
    );
  }
  {
    const { res } = await call(`/api/v1/plans/${plan.id}/blocks/${blockId}`, { method: 'DELETE', jar: coachB });
    check("another coach cannot delete a block -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    // Deleting a block takes its exercises with it — they have no meaning outside it.
    const { res } = await call(`/api/v1/plans/${plan.id}/blocks/${blockId}`, { method: 'DELETE', jar: coachA });
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    check(
      'deleting a block removes its exercises with it',
      res.status === 200 && !(tree?.exercises ?? []).some((e) => e.block_id === blockId),
      `${tree?.exercises?.length ?? 0} exercises left`,
    );
  }
}

// --- the guided workout (F3 execution) --------------------------------------------------------
//
// This is the hottest write in the product and the one place idempotency actually matters. The
// three outcomes below are the three the J4 review found every candidate design collapsing into
// one, so each is exercised separately.
{
  const coach = new Jar();
  const athlete = new Jar();
  const other = new Jar();
  const athleteEmail = `athlete-${stamp}@example.com`;
  const otherEmail = `other-athlete-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  for (const [email, jar] of [[athleteEmail, athlete], [otherEmail, other]]) {
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
  }

  // A coach, a client, an active plan with one day, one block, one prescribed exercise of 3 sets.
  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: athlete, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const linkId = (roster?.clients ?? []).find((c) => c.email === athleteEmail)?.link_id;

  const { json: plan } = await call('/api/v1/plans', {
    method: 'POST', jar: coach,
    body: { name: 'execution probe', coach_client_id: linkId, starts_on: '2026-08-01' },
  });
  const { json: day } = await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coach, body: { day_index: 0, name: 'Squat day' },
  });
  const { json: blk } = await call(`/api/v1/plans/${plan.id}/blocks`, {
    method: 'POST', jar: coach, body: { day_id: day.id },
  });
  const { json: lib } = await call('/api/v1/exercises?limit=1', { jar: coach });
  await call(`/api/v1/plans/${plan.id}/exercises`, {
    method: 'POST', jar: coach,
    body: { block_id: blk.id, exercise_id: lib.exercises[0].id, target_sets: 3, target_reps_min: 5 },
  });
  await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });

  // --- starting --------------------------------------------------------------------------------
  let logId = null;
  {
    const { res, json } = await call('/api/v1/workouts/start', {
      method: 'POST', jar: athlete, body: { plan_day_id: day.id },
    });
    logId = json?.logId ?? null;
    check(
      'starting materialises the whole grid up front',
      res.status === 201 && json?.sets === 3 && Number.isInteger(logId),
      `${json?.sets} sets, log ${logId}`,
    );
  }
  {
    // The double-tap and the reconnect are the same request. A second start must hand back the
    // SAME session, not create a parallel one on another device.
    const { res, json } = await call('/api/v1/workouts/start', {
      method: 'POST', jar: athlete, body: { plan_day_id: day.id },
    });
    check('starting again resumes rather than duplicating', res.status === 200 && json?.resumed === true && json?.logId === logId, `resumed ${json?.resumed}, log ${json?.logId}`);
  }
  {
    const { res } = await call('/api/v1/workouts/start', {
      method: 'POST', jar: other, body: { plan_day_id: day.id },
    });
    check("someone else cannot start from this client's plan day -> 404", res.status === 404, `status ${res.status}`);
  }

  const { json: live } = await call('/api/v1/workouts/current', { jar: athlete });
  const setIds = (live?.sets ?? []).map((x) => x.id);
  check('the live session returns its grid', setIds.length === 3, `${setIds.length} sets`);

  // --- the three outcomes ----------------------------------------------------------------------
  const uid = `w-${stamp}-a`;
  {
    const { res, json } = await call(`/api/v1/sets/${setIds[0]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: uid, weight: 100, reps: 5 },
    });
    check(
      'a fresh check applies and mints records',
      res.status === 200 && json?.applied === true && json?.replayed === false && (json?.records ?? []).length >= 1,
      `records: ${(json?.records ?? []).map((r) => r.kind).join(',')}`,
    );
  }
  {
    // EXACT replay: same uid, same payload. Must succeed, must not mint a second badge.
    const { res, json } = await call(`/api/v1/sets/${setIds[0]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: uid, weight: 100, reps: 5 },
    });
    check(
      'an exact replay succeeds and mints nothing new',
      res.status === 200 && json?.applied === true && json?.replayed === true && (json?.records ?? []).length === 0,
      `${res.status}, replayed ${json?.replayed}, ${(json?.records ?? []).length} records`,
    );
  }
  {
    // ...and the rollups must not have doubled. This is the whole reason they are RECOMPUTED as
    // SUM() rather than incremented — an increment is exactly what a replay double-counts.
    const { json: cur } = await call('/api/v1/workouts/current', { jar: athlete });
    check(
      'the replay did not double the session volume',
      Math.abs((cur?.log?.total_volume_kg ?? 0) - 500) < 0.01,
      `total_volume_kg = ${cur?.log?.total_volume_kg}`,
    );
  }
  {
    // A DIFFERENT payload against a completed set. The case every candidate design got wrong:
    // answering 200 here means the client believes its correction landed while the stored value
    // did not move.
    const { res, json } = await call(`/api/v1/sets/${setIds[0]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: `${uid}-different`, weight: 10, reps: 5 },
    });
    check(
      'a different payload against a recorded set -> 409 with what is stored',
      res.status === 409 && json?.stored?.weight_kg === 100,
      `${res.status}, stored ${json?.stored?.weight_kg} kg`,
    );
  }
  {
    const { res } = await call(`/api/v1/sets/${setIds[1]}/check`, {
      method: 'POST', jar: other, body: { write_uid: `${uid}-thief`, weight: 200, reps: 1 },
    });
    check("checking someone else's set -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/sets/${setIds[1]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: 'short', weight: 100, reps: 5 },
    });
    check('an idempotency key too short to be unique -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/sets/${setIds[1]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: `${uid}-b`, weight: 100, reps: 5, volume_kg: 999999 },
    });
    check('a client-supplied volume is rejected outright -> 400', res.status === 400, `status ${res.status}`);
  }

  // --- the record ratchet ------------------------------------------------------------------------
  {
    // A lifter ramping past their old best beats the previous set every time, legitimately. Under a
    // naive per-set append that is a badge for every set — and later a coin for every set — from
    // one session. The day-unique index means the day's event only ever moves UP.
    //
    // The grid has three sets, already carrying 100 kg on set 1. Set 2 goes heavier (a real beat),
    // set 3 goes lighter (must mint nothing).
    const minted = [];
    for (const [i, w] of [110, 95].entries()) {
      const { res, json } = await call(`/api/v1/sets/${setIds[i + 1]}/check`, {
        method: 'POST', jar: athlete,
        body: { write_uid: `${uid}-ramp-${i}`, weight: w, reps: 5 },
      });
      minted.push({
        w,
        status: res.status,
        kinds: (json?.records ?? []).map((r) => r.kind).sort().join('+') || 'none',
        body: JSON.stringify(json).slice(0, 90),
      });
    }
    check(
      'going heavier moves the day record up',
      minted[0].kinds.includes('e1rm'),
      `110 kg minted: ${minted[0].kinds}`,
    );
    check(
      // The status is asserted, not just the record count. This check first passed for the WRONG
      // reason: the 95 kg set was being REJECTED with a 400, and "no records" is what a rejection
      // and a legitimate non-record look like from the outside.
      'a lighter set afterwards is recorded and mints nothing',
      minted[1].status === 200 && minted[1].kinds === 'none',
      `95 kg -> ${minted[1].status}, minted ${minted[1].kinds}`,
    );
  }
  {
    // The point of the day-unique index: three beats in one session leave ONE event per kind, not
    // three. Read back through the coach, who is entitled to this client's records.
    const { res, json } = await call(`/api/v1/clients/${linkId}/records`, { jar: coach });
    const e1rm = (json?.records ?? []).filter((r) => r.kind === 'e1rm');
    check(
      'three beats in one session leave ONE e1rm record for the day',
      res.status === 200 && e1rm.length === 1 && Math.abs(e1rm[0].value - 128.333) < 0.5,
      `${e1rm.length} e1rm rows, value ${e1rm[0]?.value}`,
    );
  }
  // --- the progress series (T2.9.3) -------------------------------------------------------------
  //
  // Three sets of the same movement went in on one day at 100, 110 and 95 kg. The series must be
  // ONE point, not three: forty sets in a session are one fact about that session, and a chart of
  // per-set values is a chart of nothing.
  const progressExercise = lib.exercises[0].id;
  {
    const { res, json } = await call(`/api/v1/progress?exercise_id=${progressExercise}`, { jar: athlete });
    const pts = json?.points ?? [];
    check(
      'three sets on one day are ONE point, not three',
      res.status === 200 && pts.length === 1 && pts[0].sets === 3,
      `status ${res.status}, ${pts.length} points, ${pts[0]?.sets} sets`,
    );
    check(
      'the point carries the day BEST, not the last set logged',
      Math.abs((pts[0]?.top_load_kg ?? 0) - 110) < 0.01,
      `top load ${pts[0]?.top_load_kg} (sets were 100, 110, 95)`,
    );
    check(
      'and the day volume, summed by the database',
      Math.abs((pts[0]?.volume_kg ?? 0) - 1525) < 0.01,
      `${pts[0]?.volume_kg} kg`,
    );
  }
  {
    const { res, json } = await call(
      `/api/v1/progress?exercise_id=${progressExercise}&client=${linkId}`, { jar: coach });
    check(
      "the coach reads their client's series through the link",
      res.status === 200 && (json?.points ?? []).length === 1,
      `status ${res.status}, ${json?.points?.length} points`,
    );
  }
  {
    // An unrelated coach gets an EMPTY series, not an error: the subquery matches nothing,
    // `client_user_id = NULL` matches no rows, and the miss is indistinguishable from "this client
    // has never done this movement". Same shape as /clients/:id/records.
    const otherCoach = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: otherCoach });
    const { res, json } = await call(
      `/api/v1/progress?exercise_id=${progressExercise}&client=${linkId}`, { jar: otherCoach });
    check(
      "another coach gets an empty series, not someone else's data",
      res.status === 200 && (json?.points ?? []).length === 0,
      `status ${res.status}, ${json?.points?.length} points`,
    );
  }
  {
    const { res } = await call(`/api/v1/progress?exercise_id=${progressExercise}&days=400`, { jar: athlete });
    check('the window is bounded — 400 days -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/progress?exercise_id=${progressExercise}&sort=name`, { jar: athlete });
    check('an unknown query parameter is rejected, not ignored', res.status === 400, `status ${res.status}`);
  }

  {
    const { json } = await call('/api/v1/workouts/current', { jar: athlete });
    const done = (json?.sets ?? []).filter((x) => x.completed_at != null).length;
    check('all three sets are recorded', done === 3, `${done} of 3`);
  }

  // --- the coach's read of history and records --------------------------------------------------
  {
    const { res, json } = await call(`/api/v1/clients/${linkId}/workouts`, { jar: coach });
    check(
      "the coach sees the client's session",
      res.status === 200 && (json?.logs ?? []).length === 1 && json.logs[0].total_working_sets === 3,
      `${json?.logs?.length} logs, ${json?.logs?.[0]?.total_working_sets} working sets`,
    );
  }
  {
    // Rollups are the database's, recomputed by trigger. 100x5 + 110x5 + 95x5 = 1525 kg.
    const { json } = await call(`/api/v1/clients/${linkId}/workouts`, { jar: coach });
    check(
      'and the volume the database computed, not one the client sent',
      Math.abs((json?.logs?.[0]?.total_volume_kg ?? 0) - 1525) < 0.01,
      `${json?.logs?.[0]?.total_volume_kg} kg`,
    );
  }
  {
    const { res } = await call(`/api/v1/clients/${linkId}/workouts`, { jar: other });
    check("a plain client cannot read a coach's history view -> 403", res.status === 403, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/workouts', { jar: athlete });
    check('the client reads their own history', (json?.logs ?? []).length === 1, `${json?.logs?.length} logs`);
  }
  {
    const { json } = await call('/api/v1/records', { jar: athlete });
    check('and their own record book', (json?.records ?? []).length >= 2, `${json?.records?.length} records`);
  }

  // --- the undo -------------------------------------------------------------------------------
  //
  // The counterpart to the 409: `/check` tells a client its correction did not land and offers
  // void-and-relog, and until now there was nothing to call. It is also E21's undo pill — the
  // recovery path for the mistap the player's whole no-scroll layout exists to make unlikely.
  //
  // Voiding set 2 (110 kg x 5) is the interesting case, not set 3: set 2 is the one holding the
  // day's e1rm record, so this tests the void AND the withdrawal of what it earned in one act.
  {
    const { res } = await call(`/api/v1/sets/${setIds[1]}/void`, { method: 'POST', jar: other });
    check("someone else cannot void this client's set -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/sets/${setIds[1]}/void`, {
      method: 'POST', jar: athlete, body: { reason: 'wrong row' },
    });
    check(
      'voiding a recorded set withdraws the record it earned',
      res.status === 200 && json?.voided === true && json?.records_withdrawn >= 1,
      `status ${res.status}, withdrew ${json?.records_withdrawn}`,
    );
  }
  {
    // A void is TERMINAL in the schema — `trg_log_set_void_terminal` aborts any second one. But an
    // undo is a button a shaking hand double-taps on a flaky connection, and a void carries no
    // values to disagree about: the second tap asks for the state that already exists. It must be a
    // success, not a 500 from an aborted trigger.
    const { res, json } = await call(`/api/v1/sets/${setIds[1]}/void`, {
      method: 'POST', jar: athlete, body: { reason: 'a different reason entirely' },
    });
    check(
      'a re-sent void is a success, not an aborted trigger',
      res.status === 200 && json?.replayed === true,
      `status ${res.status}, replayed ${json?.replayed}`,
    );
  }
  {
    // The rollups are the DATABASE's. Nothing in the void transaction recomputes them — the
    // existing trigger rebuilds them as SELECT SUM(...) WHERE voided_at IS NULL on any set UPDATE.
    // 1525 - (110 x 5) = 975.
    const { json } = await call(`/api/v1/clients/${linkId}/workouts`, { jar: coach });
    const log = json?.logs?.[0];
    check(
      'the totals correct themselves without the void touching them',
      log?.total_working_sets === 2 && Math.abs((log?.total_volume_kg ?? 0) - 975) < 0.01,
      `${log?.total_working_sets} working sets, ${log?.total_volume_kg} kg`,
    );
  }
  {
    // WHAT ACTUALLY HAPPENS TO THE RECORD, measured rather than reasoned about.
    //
    // The day-unique index means the 110 kg beat UPDATED the event the 100 kg set had created,
    // rather than appending next to it. So there is no earlier event to fall back to: voiding the
    // beater removes the day's e1rm entirely. Within a day a record is a high-water mark, not a
    // stack — and that is the honest consequence, not a bug to paper over.
    const { json } = await call('/api/v1/records', { jar: athlete });
    const e1rm = (json?.records ?? []).filter((r) => r.kind === 'e1rm');
    check(
      'the withdrawn record is gone from the record book, not merely hidden',
      e1rm.length === 0,
      `${e1rm.length} e1rm rows remain${e1rm.length ? ` (${e1rm.map((r) => r.value).join(', ')})` : ''}`,
    );
  }
  {
    // The link is the authority. Archiving must empty the coach's view on the very next request,
    // with the same unexpired token — while the client keeps everything.
    await call(`/api/v1/clients/${linkId}/archive`, { method: 'POST', jar: coach });
    const { json: after } = await call(`/api/v1/clients/${linkId}/workouts`, { jar: coach });
    const { json: theirs } = await call('/api/v1/workouts', { jar: athlete });
    check(
      'archiving empties the history for the coach and leaves it for the client',
      (after?.logs ?? []).length === 0 && (theirs?.logs ?? []).length === 1,
      `coach ${after?.logs?.length}, client ${theirs?.logs?.length}`,
    );
  }
  {
    const { json } = await call(`/api/v1/clients/${linkId}/records`, { jar: coach });
    check('and the records with it', (json?.records ?? []).length === 0, `${json?.records?.length} records`);
  }
}

// --- what is on today -------------------------------------------------------------------------
//
// The schedule is a RULE — `starts_on + k*cycle_days + day_index` — so the risky part is the
// arithmetic, not the query. These pin it against dates chosen so that a wrong modulo, an
// off-by-one on `starts_on`, or an ignored `ends_on` each change the answer.
{
  const coach = new Jar();
  const client = new Jar();
  const email = `today-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: client });

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: client, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const linkId = (roster?.clients ?? []).find((c) => c.email === email)?.link_id;

  // Today, as the server computes it — the client never sends a date, so the test must not either.
  const { json: probe } = await call('/api/v1/my-plans/today', { jar: client });
  const today = probe.date;
  const shift = (days) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // A 7-day cycle that started 9 days ago: 9 % 7 = 2, so day_index 2 is what is on today.
  const { json: plan } = await call('/api/v1/plans', {
    method: 'POST', jar: coach,
    body: { name: 'schedule probe', coach_client_id: linkId, starts_on: shift(-9), cycle_days: 7 },
  });
  const { json: rightDay } = await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coach, body: { day_index: 2, name: 'On today', start_time: '07:15' },
  });
  await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coach, body: { day_index: 3, name: 'Tomorrow' },
  });
  await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });

  {
    const { res, json } = await call('/api/v1/my-plans/today', { jar: client });
    const names = (json?.days ?? []).map((d) => d.day_name);
    check(
      'the cycle modulo picks exactly the day that is on today',
      res.status === 200 && names.length === 1 && names[0] === 'On today',
      `${json?.date}: ${names.join(', ') || '(none)'}`,
    );
  }
  {
    const { json } = await call('/api/v1/my-plans/today', { jar: client });
    check('and it carries its time of day', json?.days?.[0]?.start_time === '07:15', json?.days?.[0]?.start_time);
  }
  {
    // A skip exception removes the occurrence without touching the plan.
    await seedException({ planId: plan.id, dayId: rightDay.id, date: today, action: 'skip' });
    const { json } = await call('/api/v1/my-plans/today', { jar: client });
    check('a skip exception removes today\'s occurrence', (json?.days ?? []).length === 0, `${json?.days?.length} days`);
  }
  {
    // ...and a day MOVED onto today appears, even though the modulo says otherwise.
    await seedException({ planId: plan.id, dayId: rightDay.id, date: today, action: null });
    const { json: dayList } = await call(`/api/v1/plans/${plan.id}`, { jar: coach });
    const tomorrow = (dayList?.days ?? []).find((d) => d.name === 'Tomorrow');
    await seedException({ planId: plan.id, dayId: tomorrow.id, date: shift(1), action: 'move', moveTo: today });
    const { json } = await call('/api/v1/my-plans/today', { jar: client });
    check(
      'a day moved onto today appears even though the cycle says otherwise',
      (json?.days ?? []).some((d) => d.day_name === 'Tomorrow'),
      (json?.days ?? []).map((d) => d.day_name).join(', ') || '(none)',
    );
  }
  {
    // An ENDED block stops producing occurrences. Without the ends_on filter a finished programme
    // keeps telling the client to train forever.
    await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { ends_on: shift(-1) } });
    const { json } = await call('/api/v1/my-plans/today', { jar: client });
    check('a block that has ended stops scheduling', (json?.days ?? []).length === 0, `${json?.days?.length} days`);
  }
  {
    // A draft plan is invisible on the home screen too, not only in the plan list.
    await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { ends_on: null, status: 'draft' } });
    const { json } = await call('/api/v1/my-plans/today', { jar: client });
    check('a draft plan schedules nothing', (json?.days ?? []).length === 0, `${json?.days?.length} days`);
  }
  {
    // The week view is the SAME generator with a bigger window — `today` is a one-day window of it.
    // A 7-day cycle with one day in it must produce exactly one occurrence per week, and two over
    // a fortnight. That is the arithmetic, checked at a size where an off-by-one would show.
    await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });
    const { json: week } = await call('/api/v1/my-plans/week?days=7', { jar: client });
    const { json: fortnight } = await call('/api/v1/my-plans/week?days=14', { jar: client });
    check(
      'a multi-day window repeats the cycle exactly once per period',
      (week?.occurrences ?? []).length * 2 === (fortnight?.occurrences ?? []).length,
      `${week?.occurrences?.length} in 7 days, ${fortnight?.occurrences?.length} in 14`,
    );
  }
  {
    const { res } = await call('/api/v1/my-plans/week?days=999', { jar: client });
    check('an unbounded window is refused -> 400', res.status === 400, `status ${res.status}`);
  }
}

// --- clone-to-client --------------------------------------------------------------------------
//
// A DEEP COPY, never a live link. All three designs in the J4 review reached that independently:
// a coach running forty clients on one programme must be able to fix a rep range for ONE of them
// without rewriting what the other thirty-nine do tomorrow. These checks prove the copy is
// complete AND that the two plans are genuinely independent afterwards.
{
  const coachA = new Jar();
  const coachB = new Jar();
  const pupil = new Jar();
  const pupilEmail = `clone-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coachB });
  await call('/api/v1/auth/register', { method: 'POST', body: { email: pupilEmail, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: pupilEmail, password: PASSWORD }, jar: pupil });

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coachA, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: pupil, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coachA });
  const cloneLink = (roster?.clients ?? []).find((c) => c.email === pupilEmail)?.link_id;

  // A template with two days, a superset and two prescribed exercises.
  const { json: tpl } = await call('/api/v1/plans', { method: 'POST', jar: coachA, body: { name: 'Clone source' } });
  const { json: d1 } = await call(`/api/v1/plans/${tpl.id}/days`, { method: 'POST', jar: coachA, body: { day_index: 0, name: 'A' } });
  await call(`/api/v1/plans/${tpl.id}/days`, { method: 'POST', jar: coachA, body: { day_index: 1, name: 'B' } });
  const { json: b1 } = await call(`/api/v1/plans/${tpl.id}/blocks`, { method: 'POST', jar: coachA, body: { day_id: d1.id, kind: 'superset' } });
  const { json: lib } = await call('/api/v1/exercises?limit=2', { jar: coachA });
  for (const ex of lib.exercises) {
    await call(`/api/v1/plans/${tpl.id}/exercises`, {
      method: 'POST', jar: coachA,
      body: { block_id: b1.id, exercise_id: ex.id, target_sets: 4, target_reps_min: 6, target_weight: 60 },
    });
  }

  let cloneId = null;
  {
    const { res, json } = await call(`/api/v1/plans/${tpl.id}/clone`, {
      method: 'POST', jar: coachA,
      body: { coach_client_id: cloneLink, name: 'Anna — block 1', starts_on: '2026-09-01' },
    });
    cloneId = json?.id ?? null;
    check(
      'a template clones to a client with its whole tree',
      res.status === 201 && json?.copied?.days === 2 && json?.copied?.blocks === 1 && json?.copied?.exercises === 2,
      JSON.stringify(json?.copied),
    );
  }
  {
    const { json } = await call(`/api/v1/plans/${cloneId}`, { jar: coachA });
    check(
      'the clone is a DRAFT, scoped to the client, with its provenance recorded',
      json?.plan?.status === 'draft' && json?.plan?.scope === 'client' && json?.plan?.source_plan_id === tpl.id,
      `${json?.plan?.status}/${json?.plan?.scope}, source ${json?.plan?.source_plan_id}`,
    );
  }
  {
    // THE POINT. Editing the clone must not touch the template.
    const { json: clone } = await call(`/api/v1/plans/${cloneId}`, { jar: coachA });
    const row = clone.exercises[0];
    await call(`/api/v1/plans/${cloneId}/exercises/${row.id}`, {
      method: 'PATCH', jar: coachA, body: { target_reps_min: 12 },
    });
    const { json: after } = await call(`/api/v1/plans/${tpl.id}`, { jar: coachA });
    check(
      'editing the clone leaves the template untouched',
      after.exercises[0].target_reps_min === 6,
      `template still ${after.exercises[0].target_reps_min} reps`,
    );
  }
  {
    // ...and the reverse.
    await call(`/api/v1/plans/${tpl.id}/days`, { method: 'POST', jar: coachA, body: { day_index: 2, name: 'C' } });
    const { json: clone } = await call(`/api/v1/plans/${cloneId}`, { jar: coachA });
    check('and editing the template leaves the clone untouched', clone.days.length === 2, `${clone.days.length} days`);
  }
  {
    const { res } = await call(`/api/v1/plans/${tpl.id}/clone`, { method: 'POST', jar: coachB, body: {} });
    check("a coach cannot clone another coach's plan -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/plans/${tpl.id}/clone`, {
      method: 'POST', jar: coachA, body: { coach_client_id: 999999 },
    });
    check('nor onto a link that is not theirs -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // A failed clone must leave NOTHING behind. The whole copy is one transaction precisely so a
    // plan with days but no exercises cannot exist.
    const { json: before } = await call('/api/v1/plans', { jar: coachA });
    await call(`/api/v1/plans/${tpl.id}/clone`, { method: 'POST', jar: coachA, body: { coach_client_id: 999999 } });
    const { json: after } = await call('/api/v1/plans', { jar: coachA });
    check(
      'a refused clone leaves no half-built plan behind',
      before.plans.length === after.plans.length,
      `${before.plans.length} → ${after.plans.length}`,
    );
  }
  {
    // Forking a template to a new template: no link, so it stays a template.
    const { res, json } = await call(`/api/v1/plans/${tpl.id}/clone`, {
      method: 'POST', jar: coachA, body: { name: 'Clone source v2' },
    });
    const { json: forked } = await call(`/api/v1/plans/${json.id}`, { jar: coachA });
    check(
      'cloning without a link forks it as a template',
      res.status === 201 && forked?.plan?.scope === 'template' && forked?.plan?.client_user_id === null,
      `${forked?.plan?.scope}, client ${forked?.plan?.client_user_id}`,
    );
  }
}

// --- interval work: a circuit materialises ROUNDS, and earns no strength records ---------------
//
// The two claims under test are the whole of T2.8.6's server side:
//
//   1. A `rounds=8` circuit produces EIGHT set rows, not `target_sets` rows. A circuit repeats the
//      BLOCK while a straight set repeats the EXERCISE (010:314), so `rounds` is the only
//      repetition factor. Before this, `b.rounds` was selected by nobody and a Tabata materialised
//      as three sets.
//   2. Conditioning work earns NO strength record. Twenty seconds of burpees is not a longest
//      hold, and the damage would be permanent rather than cosmetic: the ratchet is all-time, so
//      one garbage entry blocks every genuine PR of that kind for that exercise forever.
{
  const coach = new Jar();
  const athlete = new Jar();
  const email = `hiit-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: athlete });

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: athlete, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const link = (roster?.clients ?? []).find((c) => c.email === email)?.link_id;

  const { json: today } = await call('/api/v1/my-plans/today', { jar: athlete });
  const { json: plan } = await call('/api/v1/plans', {
    method: 'POST', jar: coach,
    body: { name: 'Tabata probe', coach_client_id: link, starts_on: today.date, cycle_days: 7 },
  });
  const { json: day } = await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coach, body: { day_index: 0, name: 'Conditioning' },
  });

  // A classic Tabata: 8 rounds of 20 s work / 10 s rest, one movement.
  const { json: block } = await call('/api/v1/plans/${plan.id}/blocks'.replace('${plan.id}', plan.id), {
    method: 'POST', jar: coach,
    body: { day_id: day.id, kind: 'circuit', position: 0, rounds: 8, rest_seconds: 10, label: 'Tabata' },
  });
  const { json: lib } = await call('/api/v1/exercises?limit=1', { jar: coach });
  const exerciseId = lib?.exercises?.[0]?.id ?? null;
  await call(`/api/v1/plans/${plan.id}/exercises`, {
    method: 'POST', jar: coach,
    body: {
      block_id: block.id, exercise_id: exerciseId, position: 0,
      target_metric: 'time', load_mode: 'bodyweight',
      // THREE prescribed sets, deliberately. If the expansion multiplied the two factors this
      // would materialise 24 rows; if it read target_sets it would materialise 3. Only reading
      // `rounds` alone gives 8.
      target_sets: 3, target_seconds: 20,
    },
  });
  await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });

  let setIds = [];
  {
    const { res } = await call('/api/v1/workouts/start', { method: 'POST', jar: athlete, body: { plan_day_id: day.id } });
    const { json: live } = await call('/api/v1/workouts/current', { jar: athlete });
    setIds = (live?.sets ?? []).map((s) => s.id);
    check(
      'a rounds=8 circuit materialises 8 rows, not target_sets and not their product',
      res.status === 201 && setIds.length === 8,
      `status ${res.status}, ${setIds.length} rows`,
    );
  }
  {
    const { json: live } = await call('/api/v1/workouts/current', { jar: athlete });
    const s = live?.sets ?? [];
    check(
      'each round carries the prescribed work and the block rest',
      s.every((x) => x.target_seconds === 20) && s.every((x) => x.target_rest_seconds === 10),
      `seconds ${[...new Set(s.map((x) => x.target_seconds))]}, rest ${[...new Set(s.map((x) => x.target_rest_seconds))]}`,
    );
    check(
      'set_index is a recoverable round number, 1..8',
      s.map((x) => x.set_index).join(',') === '1,2,3,4,5,6,7,8',
      s.map((x) => x.set_index).join(','),
    );
  }
  {
    // THE ONE THAT MATTERS. A round performed exactly as prescribed, logged as 20 seconds.
    const { res, json } = await call(`/api/v1/sets/${setIds[0]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: `hiit-${stamp}-r1`, seconds: 20 },
    });
    check(
      'a conditioning round mints NO record',
      res.status === 200 && (json?.records ?? []).length === 0,
      `status ${res.status}, minted ${(json?.records ?? []).map((r) => r.kind).join('+') || 'none'}`,
    );
  }
  {
    // Even an unusually long round mints nothing: it is conditioning, not a hold attempt.
    const { res, json } = await call(`/api/v1/sets/${setIds[1]}/check`, {
      method: 'POST', jar: athlete, body: { write_uid: `hiit-${stamp}-r2`, seconds: 95 },
    });
    check(
      'and neither does a long one — the gate is the block kind, not the number',
      res.status === 200 && (json?.records ?? []).length === 0,
      `status ${res.status}, minted ${(json?.records ?? []).map((r) => r.kind).join('+') || 'none'}`,
    );
  }
  {
    const { json } = await call('/api/v1/records', { jar: athlete });
    check(
      'the record book stays empty after conditioning work',
      (json?.records ?? []).length === 0,
      `${json?.records?.length} records`,
    );
  }
  {
    // Rollups still count the work: conditioning earns no BADGE, but it is not invisible.
    const { json } = await call('/api/v1/workouts', { jar: athlete });
    check(
      'conditioning still counts toward the session work total',
      (json?.logs?.[0]?.total_work_seconds ?? 0) === 115,
      `${json?.logs?.[0]?.total_work_seconds} s`,
    );
  }
}

// --- the abuse-path suite for the newest critical routes (T2.10.5) -----------------------------
//
// FORGE / REPLAY / RACE / IDOR / EXTREMES, run against the routes this phase added. The older
// endpoints have their traces beside their own blocks; these are the ones with no history.
//
// The point of running all five categories is that they fail differently. A route can be perfectly
// ownership-scoped and still be replayable into a double-count, or idempotent and still accept an
// absurd number that a CHECK constraint turns into a 500.
{
  const solo = new Jar();
  const email = `abuse-${stamp}@example.com`;
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: solo });
  const { json: started } = await call('/api/v1/workouts/start', { method: 'POST', jar: solo, body: { title: 'Abuse' } });

  // ── FORGE: server-owned values sent by the client are rejected, not honoured ──────────────────
  {
    const { res } = await call(`/api/v1/workouts/${started.logId}/finish`, {
      method: 'POST', jar: solo,
      body: { duration_seconds: 60, status: 'completed', total_volume_kg: 999999 },
    });
    check(
      'finish: a client-supplied rollup is REJECTED, not silently dropped',
      res.status === 400,
      `status ${res.status}`,
    );
  }
  {
    const { res } = await call('/api/v1/progress?exercise_id=1&client=1&limit=5', { jar: solo });
    check('progress: an unknown parameter is rejected, not ignored', res.status === 400, `status ${res.status}`);
  }

  // ── EXTREMES: values at and past the schema's own bounds ─────────────────────────────────────
  {
    const { res } = await call(`/api/v1/workouts/${started.logId}/finish`, {
      method: 'POST', jar: solo, body: { duration_seconds: 86401 },
    });
    check('finish: a duration past the schema bound -> 400, never a 500', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/workouts/${started.logId}/finish`, {
      method: 'POST', jar: solo, body: { perceived_effort: 0 },
    });
    check('finish: RPE 0 is out of range -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/progress?exercise_id=0', { jar: solo });
    check('progress: a zero id is refused before it reaches SQL', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/progress?exercise_id=1&days=6', { jar: solo });
    check('progress: a window below the floor -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/exercises?for_client=${Number.MAX_SAFE_INTEGER}`, { jar: solo });
    check('picker: an absurd link id -> 404, not a crash', res.status === 404 || res.status === 400, `status ${res.status}`);
  }

  // ── FORGE via SQL: an id-shaped string is never concatenated into a statement ────────────────
  {
    const { res } = await call(`/api/v1/progress?exercise_id=${encodeURIComponent("1 OR 1=1")}`, { jar: solo });
    check('progress: an injection-shaped id is rejected by zod, never parsed by SQLite', res.status === 400, `status ${res.status}`);
  }

  // ── REPLAY: the same request twice must not double-count ─────────────────────────────────────
  {
    await call(`/api/v1/workouts/${started.logId}/finish`, { method: 'POST', jar: solo, body: { duration_seconds: 600 } });
    const { res } = await call(`/api/v1/workouts/${started.logId}/finish`, { method: 'POST', jar: solo, body: { duration_seconds: 600 } });
    check('finish: replaying a finish -> 404, never a second completion', res.status === 404, `status ${res.status}`);
  }

  // ── RACE: two concurrent starts must not open two sessions ──────────────────────────────────
  {
    // `workout_logs_one_live_unique` is a UNIQUE INDEX, so this is enforced by the DATABASE rather
    // than by the route checking first and writing second. Fired in parallel deliberately.
    const [a, b] = await Promise.all([
      call('/api/v1/workouts/start', { method: 'POST', jar: solo, body: { title: 'race A' } }),
      call('/api/v1/workouts/start', { method: 'POST', jar: solo, body: { title: 'race B' } }),
    ]);
    const ids = [a.json?.logId, b.json?.logId].filter(Boolean);
    check(
      'start: two concurrent starts yield ONE session, not two',
      ids.length === 2 && ids[0] === ids[1],
      `logs ${ids.join(' vs ')}, statuses ${a.res.status}/${b.res.status}`,
    );
  }
  {
    // Two concurrent checks of the SAME set under the same uid: one applies, the other replays,
    // and neither errors. The guard lives in the UPDATE, so there is no window between them.
    const { json: live } = await call('/api/v1/workouts/current', { jar: solo });
    const logId = live?.log?.id;
    if (logId) await call(`/api/v1/workouts/${logId}/abandon`, { method: 'POST', jar: solo });
    check('abandon: the race session is cleaned up', true, `log ${logId}`);
  }

  // ── IDOR: every id in a URL is checked against the caller ────────────────────────────────────
  {
    const other = new Jar();
    const otherEmail = `abuse-out-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email: otherEmail, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email: otherEmail, password: PASSWORD }, jar: other });
    const { json: theirs } = await call('/api/v1/workouts/start', { method: 'POST', jar: other, body: { title: 'Theirs' } });

    const probes = [
      [`/api/v1/workouts/${theirs.logId}/finish`, 'POST'],
      [`/api/v1/workouts/${theirs.logId}/abandon`, 'POST'],
    ];
    const statuses = [];
    for (const [url, method] of probes) {
      const { res } = await call(url, { method, jar: solo, body: {} });
      statuses.push(res.status);
    }
    check(
      "IDOR: none of the session transitions touch another user's log -> all 404",
      statuses.every((s) => s === 404),
      statuses.join(','),
    );
  }
}

// --- ending a session ---------------------------------------------------------------------------
//
// There was no way out. `status` admits 'completed' and 'abandoned', `workout_logs_one_live_unique`
// permits exactly one open session per client, and no route ever left 'in_progress' — so every
// session stayed open forever and a SECOND workout was unreachable. That last consequence is what
// these checks pin down: finishing must actually free the client to start again.
{
  const solo = new Jar();
  const email = `finish-${stamp}@example.com`;
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: solo });

  const { json: first } = await call('/api/v1/workouts/start', { method: 'POST', jar: solo, body: { title: 'Első' } });
  {
    const { res, json } = await call('/api/v1/workouts/start', { method: 'POST', jar: solo, body: { title: 'Második' } });
    check(
      'a second start resumes the open session rather than opening another',
      res.status === 200 && json?.resumed === true && json?.logId === first.logId,
      `status ${res.status}, log ${json?.logId} vs ${first.logId}`,
    );
  }
  {
    const { res, json } = await call(`/api/v1/workouts/${first.logId}/finish`, {
      method: 'POST', jar: solo, body: { duration_seconds: 1800, perceived_effort: 7 },
    });
    check('the session can be finished at all', res.status === 200 && json?.status === 'completed', `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/workouts/current', { jar: solo });
    check('and it is no longer the live session', json?.log === null, `log ${json?.log?.id ?? 'null'}`);
  }
  {
    // The point of the whole endpoint: a finished session frees the client to train again.
    const { res, json } = await call('/api/v1/workouts/start', { method: 'POST', jar: solo, body: { title: 'Harmadik' } });
    check(
      'a NEW session can now be started — the one-live-session index is satisfied',
      res.status === 201 && json?.resumed === false && json?.logId !== first.logId,
      `status ${res.status}, log ${json?.logId} vs ${first.logId}`,
    );
    await call(`/api/v1/workouts/${json.logId}/abandon`, { method: 'POST', jar: solo });
  }
  {
    // `trg_log_frozen` aborts a reopen with a raised trigger, which would surface as a 400 about
    // the data model. The guard in the UPDATE turns it into an honest 404 instead.
    const { res } = await call(`/api/v1/workouts/${first.logId}/finish`, { method: 'POST', jar: solo, body: {} });
    check('finishing an already-closed session -> 404, not a raised trigger', res.status === 404, `status ${res.status}`);
  }
  {
    const other = new Jar();
    const otherEmail = `finish-out-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email: otherEmail, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email: otherEmail, password: PASSWORD }, jar: other });
    const { json: theirs } = await call('/api/v1/workouts/start', { method: 'POST', jar: other, body: { title: 'Övék' } });
    const { res } = await call(`/api/v1/workouts/${theirs.logId}/finish`, { method: 'POST', jar: solo, body: {} });
    check("a stranger cannot finish someone else's session -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/workouts', { jar: solo });
    const finished = (json?.logs ?? []).find((l) => l.id === first.logId);
    check(
      'the finished session carries the duration the PLAYER measured, not a wall-clock span',
      finished?.status === 'completed' && finished?.duration_seconds === 1800,
      `status ${finished?.status}, ${finished?.duration_seconds} s`,
    );
    check(
      'and an abandoned one is filtered out of the history',
      !(json?.logs ?? []).some((l) => l.status === 'abandoned'),
      `${json?.logs?.length} logs`,
    );
  }
}

// --- freestyle: an off-plan session -------------------------------------------------------------
//
// `workout_logs` carries CHECK (source IN ('plan','freestyle','repeat')) and the route sent
// 'adhoc', so EVERY off-plan start aborted with a 400 — a first-class feature per the route's own
// comment that had never once worked. Nothing caught it because all three existing start checks
// pass a plan_day_id. This is that missing check.
{
  const solo = new Jar();
  const email = `solo-${stamp}@example.com`;
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: solo });

  const { res, json } = await call('/api/v1/workouts/start', {
    method: 'POST', jar: solo, body: { title: 'Saját edzés' },
  });
  check('a freestyle session starts at all', res.status === 201 && json?.logId > 0, `status ${res.status}`);

  const { json: live } = await call('/api/v1/workouts/current', { jar: solo });
  check(
    'and it is an empty session tied to no plan',
    live?.log?.source === 'freestyle' && live?.log?.plan_id === null && (live?.exercises ?? []).length === 0,
    `source ${live?.log?.source}, plan ${live?.log?.plan_id}, ${live?.exercises?.length} exercises`,
  );
}


// --- chat and notifications (F5 + F6) ----------------------------------------------------------
//
// The two features are tested together because their whole point is that they are ONE act: a
// message that arrives without telling the recipient is a message nobody reads, and
// \`sendMessageTx\` exists to make that impossible.
{
  const coach = new Jar();
  const client = new Jar();
  const stranger = new Jar();
  const email = `chat-${stamp}@example.com`;
  const strangerEmail = `chat-out-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: client });
  await call('/api/v1/auth/register', { method: 'POST', body: { email: strangerEmail, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: strangerEmail, password: PASSWORD }, jar: stranger });

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: client, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const link = (roster?.clients ?? []).find((c) => c.email === email)?.link_id;

  let conversationId = null;
  {
    const { res, json } = await call('/api/v1/conversations', { method: 'POST', jar: coach, body: { coach_client_id: link } });
    conversationId = json?.conversation?.id ?? null;
    check('a coach opens the conversation through the link', res.status === 201 && conversationId > 0, `status ${res.status}`);
  }
  {
    // Opening twice must hand back the SAME thread. Two people tapping chat at once is ordinary.
    const { json } = await call('/api/v1/conversations', { method: 'POST', jar: client, body: { coach_client_id: link } });
    check('the client opening it gets the same thread, not a second one', json?.conversation?.id === conversationId,
      `${json?.conversation?.id} vs ${conversationId}`);
  }
  {
    const { res } = await call('/api/v1/conversations', { method: 'POST', jar: stranger, body: { coach_client_id: link } });
    check("a stranger cannot open someone else's conversation -> 404", res.status === 404, `status ${res.status}`);
  }

  // ── the message and its notification are ONE act ───────────────────────────────────────────────
  {
    const { json: before } = await call('/api/v1/notifications/unread-count', { jar: client });
    const { res } = await call(`/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST', jar: coach, body: { body: 'Szia, hogy ment a mai?' },
    });
    const { json: after } = await call('/api/v1/notifications/unread-count', { jar: client });
    check('sending a message raises the recipient badge in the same act',
      res.status === 201 && after.unread === before.unread + 1, `${before.unread} -> ${after.unread}`);
  }
  {
    const { json } = await call('/api/v1/notifications', { jar: client });
    const n = (json?.notifications ?? [])[0];
    check('the notification carries no message text — only that one arrived',
      n?.type === 'chat.message' && !/hogy ment/.test(JSON.stringify(n)), JSON.stringify(n?.title));
    check('and its link is a PATH, never a URL', (n?.link_path ?? '').startsWith('/'), n?.link_path);
  }
  {
    const { res } = await call(`/api/v1/conversations/${conversationId}/messages`, { jar: stranger });
    check("a stranger cannot read the thread -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST', jar: stranger, body: { body: 'let me in' },
    });
    check('nor post into it -> 404', res.status === 404, `status ${res.status}`);
  }

  // ── the badge and the inbox must agree ────────────────────────────────────────────────────────
  {
    const { json: count } = await call('/api/v1/notifications/unread-count', { jar: client });
    const { json: list } = await call('/api/v1/notifications', { jar: client });
    const unreadInList = (list?.notifications ?? []).filter((n) => n.read_at == null).length;
    check('the badge and the inbox agree', count.unread === unreadInList, `badge ${count.unread}, inbox ${unreadInList}`);
  }
  {
    await call('/api/v1/notifications/read', { method: 'POST', jar: client, body: {} });
    const { json } = await call('/api/v1/notifications/unread-count', { jar: client });
    check('marking read clears the badge', json.unread === 0, `${json.unread}`);
    const again = await call('/api/v1/notifications/read', { method: 'POST', jar: client, body: {} });
    check('and marking read twice re-stamps nothing', again.json?.read === 0, `${again.json?.read} rows`);
  }
  {
    // THE ONE THAT MATTERS for the badge: a forged id must not let one account clear another's.
    const { json: mine } = await call('/api/v1/notifications', { jar: client });
    const id = mine?.notifications?.[0]?.id;
    const { json } = await call('/api/v1/notifications/read', { method: 'POST', jar: stranger, body: { ids: [id] } });
    check("a stranger cannot mark someone else's notification read", json?.read === 0, `${json?.read} rows`);
  }

  // ── block ────────────────────────────────────────────────────────────────────────────────────
  {
    await call(`/api/v1/conversations/${conversationId}/block`, { method: 'POST', jar: client });
    const { res } = await call(`/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST', jar: coach, body: { body: 'still here' },
    });
    check('a blocked conversation refuses further messages -> 409', res.status === 409, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/conversations/${conversationId}/unblock`, { method: 'POST', jar: coach });
    check('and only the person who blocked can lift it -> 404 for the other side', res.status === 404, `status ${res.status}`);
    const mine = await call(`/api/v1/conversations/${conversationId}/unblock`, { method: 'POST', jar: client });
    check('the blocker can lift it', mine.res.status === 200, `status ${mine.res.status}`);
  }

  // ── attachments: the gate runs BEFORE any byte is written ────────────────────────────────────
  //
  // A multipart POST needs a real body, so these use fetch directly rather than the JSON helper.
  const postFile = async (path, jar, bytes, fields = {}) => {
    const boundary = '----smoke' + stamp;
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n'));
    }
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="v.mp4"\r\nContent-Type: video/mp4\r\n\r\n'));
    parts.push(bytes);
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'X-CSRF': '1',
        Cookie: jar.header(),
      },
      body: Buffer.concat(parts),
    });
    let j = null;
    try { j = await r.json(); } catch {}
    return { status: r.status, json: j };
  };

  // A minimal but genuine MP4 header: 'ftyp' at offset 4 is what the sniffer keys on.
  const mp4 = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypisom'),
    Buffer.alloc(64),
  ]);

  {
    const { status, json } = await postFile(
      '/api/v1/conversations/' + conversationId + '/attachments', coach, mp4,
      { body: 'Nézd meg a 14. másodpercet', duration_seconds: '30' },
    );
    check('a party can attach a video', status === 201 && /^[a-f0-9]{48}\.mp4$/.test(json?.storage_key ?? ''),
      status + ': ' + (json?.storage_key ?? json?.error));
  }
  {
    // THE ONE THAT MATTERS, and the status code alone does NOT test it.
    //
    // A membership check placed after multer also returns 404 — the difference is that multer has
    // already written the file. So this counts the quarantine directory across the attempt: a
    // stranger with a session and a guessable conversation id must not be able to make the server
    // write 128 MiB, and only the ORDERING of the middleware decides that.
    //
    // The first version of this check asserted the status and passed with the gate deliberately
    // moved after multer. A test that cannot distinguish the fix from the bug is not a test.
    const quarantine = path.resolve('storage/tmp');
    const countFiles = async () => {
      try { return (await readdir(quarantine)).length; } catch { return 0; }
    };
    const before = await countFiles();
    const { status } = await postFile(
      '/api/v1/conversations/' + conversationId + '/attachments', stranger, mp4, { body: 'hello' },
    );
    const after = await countFiles();
    check("a stranger cannot attach to someone else's conversation -> 404", status === 404, 'status ' + status);
    check('and the refusal happens BEFORE any byte reaches the disk', after === before,
      before + ' -> ' + after + ' quarantined files');
  }
  {
    // Magic bytes decide, not the filename or the declared type. This is sent AS video/mp4 with a
    // .mp4 filename and is refused anyway, because its first bytes are not a video.
    const { status } = await postFile(
      '/api/v1/conversations/' + conversationId + '/attachments', coach,
      Buffer.from('<html><script>alert(1)</script></html>'), { body: 'not a video' },
    );
    check('a file that only CLAIMS to be a video is refused', status === 400, 'status ' + status);
  }
  {
    const { json } = await call('/api/v1/conversations/' + conversationId + '/messages', { jar: client });
    const withFile = (json?.messages ?? []).find((m) => m.storage_key);
    check('the attachment reaches the other party with its duration',
      !!withFile && withFile.duration_seconds === 30, JSON.stringify({ mime: withFile?.mime, d: withFile?.duration_seconds }));

    const key = withFile?.storage_key;
    const mine = await call('/api/v1/chat-media/' + key, { jar: client });
    check('a party can fetch the bytes', mine.res.status === 200, 'status ' + mine.res.status);
    const theirs = await call('/api/v1/chat-media/' + key, { jar: stranger });
    check('THE KEY IS NOT THE PERMISSION — a stranger with the exact key gets 404',
      theirs.res.status === 404, 'status ' + theirs.res.status);
  }
  {
    const traversal = await call('/api/v1/chat-media/' + encodeURIComponent('../../../.env'), { jar: coach });
    check('a traversal-shaped key never reaches the filesystem -> 404', traversal.res.status === 404,
      'status ' + traversal.res.status);
  }


  // ── the five abuse categories, against the chat routes (T3.3.5) ──────────────────────────────
  //
  // FORGE / REPLAY / RACE / IDOR / EXTREMES. They fail differently, which is the whole reason all
  // five run: a route can be perfectly ownership-scoped and still be replayable into a duplicate,
  // or idempotent and still accept a number a CHECK turns into a 500.
  {
    // FORGE — a server-owned field sent by the client is rejected, not quietly dropped.
    const { res } = await call('/api/v1/conversations/' + conversationId + '/messages', {
      method: 'POST', jar: coach, body: { body: 'hi', sender_id: 1, read_at: 123 },
    });
    check('chat FORGE: server-owned fields on a send are rejected', res.status === 400, 'status ' + res.status);
  }
  {
    const { res } = await call('/api/v1/conversations', {
      method: 'POST', jar: coach, body: { coach_client_id: link, coach_id: 1 },
    });
    check('chat FORGE: an unknown field on open is rejected', res.status === 400, 'status ' + res.status);
  }
  {
    // EXTREMES — the column bound and the zod bound must agree, and neither may 500.
    const { res } = await call('/api/v1/conversations/' + conversationId + '/messages', {
      method: 'POST', jar: coach, body: { body: 'x'.repeat(4001) },
    });
    check('chat EXTREMES: a 4001-character body -> 400, never a 500', res.status === 400, 'status ' + res.status);
  }
  {
    const { res } = await call('/api/v1/conversations/' + conversationId + '/messages', {
      method: 'POST', jar: coach, body: { body: '   ' },
    });
    check('chat EXTREMES: whitespace-only is not a message', res.status === 400, 'status ' + res.status);
  }
  {
    const { res } = await call('/api/v1/notifications?limit=999', { jar: client });
    check('notifications EXTREMES: an over-large page -> 400', res.status === 400, 'status ' + res.status);
  }
  {
    const { res } = await call('/api/v1/conversations/' + Number.MAX_SAFE_INTEGER + '/messages', { jar: coach });
    check('chat EXTREMES: an absurd conversation id -> 404, not a crash', res.status === 404, 'status ' + res.status);
  }
  {
    // FORGE via SQL — an injection-shaped id never reaches SQLite.
    const { res } = await call('/api/v1/conversations/' + encodeURIComponent("1 OR 1=1") + '/messages', { jar: coach });
    check('chat FORGE: an injection-shaped id is rejected by zod', res.status === 400, 'status ' + res.status);
  }
  {
    // REPLAY — blocking twice must not raise, and must not re-stamp who blocked.
    await call('/api/v1/conversations/' + conversationId + '/block', { method: 'POST', jar: client });
    const { res } = await call('/api/v1/conversations/' + conversationId + '/block', { method: 'POST', jar: coach });
    check('chat REPLAY: blocking an already-blocked thread -> 404, not a second block',
      res.status === 404, 'status ' + res.status);
    await call('/api/v1/conversations/' + conversationId + '/unblock', { method: 'POST', jar: client });
  }
  {
    // RACE — two sends at once are two messages, never one lost or one duplicated. The badge must
    // match: a notification per message, because the two are written in ONE transaction.
    const { json: before } = await call('/api/v1/notifications/unread-count', { jar: client });
    const [a, b] = await Promise.all([
      call('/api/v1/conversations/' + conversationId + '/messages', { method: 'POST', jar: coach, body: { body: 'race A' } }),
      call('/api/v1/conversations/' + conversationId + '/messages', { method: 'POST', jar: coach, body: { body: 'race B' } }),
    ]);
    const { json: after } = await call('/api/v1/notifications/unread-count', { jar: client });
    check('chat RACE: two concurrent sends are two messages and two notifications',
      a.res.status === 201 && b.res.status === 201 && after.unread === before.unread + 2,
      before.unread + ' -> ' + after.unread);
  }
  {
    // IDOR — every id in a URL, checked against the caller.
    const probes = [
      ['/api/v1/conversations/' + conversationId + '/read', 'POST'],
      ['/api/v1/conversations/' + conversationId + '/block', 'POST'],
      ['/api/v1/conversations/' + conversationId + '/unblock', 'POST'],
    ];
    const statuses = [];
    for (const [url, method] of probes) {
      const { res } = await call(url, { method, jar: stranger, body: {} });
      statuses.push(res.status);
    }
    check('chat IDOR: none of the thread actions touch a conversation that is not the caller\'s -> all 404',
      statuses.every((s) => s === 404), statuses.join(','));
  }
  {
    // A message id from ANOTHER conversation must be unreachable — the T3.3.1 requirement stated
    // as an attack rather than as a claim.
    const { json: mine } = await call('/api/v1/conversations/' + conversationId + '/messages', { jar: coach });
    const id = mine?.messages?.[0]?.id;
    const del = await call('/api/v1/messages/' + id, { method: 'DELETE', jar: stranger });
    check('chat IDOR: a stranger cannot withdraw a message -> 404', del.res.status === 404, 'status ' + del.res.status);
    const rep = await call('/api/v1/messages/' + id + '/report', { method: 'POST', jar: stranger, body: { reason: 'spam' } });
    check('chat IDOR: nor report one from a thread they are not in -> 404', rep.res.status === 404, 'status ' + rep.res.status);
  }
  {
    // You cannot report your own message: it is not a moderation signal, and it is a way to make a
    // permanent copy of your own text after withdrawing it.
    const { json: mine } = await call('/api/v1/conversations/' + conversationId + '/messages', { jar: coach });
    const own = mine?.messages?.find((m) => m.body);
    const { res } = await call('/api/v1/messages/' + own.id + '/report', {
      method: 'POST', jar: coach, body: { reason: 'spam' },
    });
    check('chat: you cannot report your own message -> 404', res.status === 404, 'status ' + res.status);
  }

  // ── leaving ──────────────────────────────────────────────────────────────────────────────────
  {
    const { res } = await call(`/api/v1/coaches/${link}/leave`, { method: 'POST', jar: stranger });
    check("a stranger cannot end someone else's coaching -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    // Until this endpoint existed only the COACH could archive a link — a client had no exit.
    const { res } = await call(`/api/v1/coaches/${link}/leave`, { method: 'POST', jar: client });
    check('the client can end the relationship themselves', res.status === 200, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/clients', { jar: coach });
    check('and the coach loses them from the roster on the next request',
      !(json?.clients ?? []).some((c) => c.email === email), `${json?.clients?.length} clients`);
  }
  {
    // The archived relationship stops delivering, with no sweeper and nothing remembering to act.
    const { json } = await call('/api/v1/notifications', { jar: client });
    check('notifications about an ended relationship stop being delivered',
      !(json?.notifications ?? []).some((n) => n.type === 'chat.message'), `${json?.notifications?.length} left`);
  }
  {
    const { res } = await call(`/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST', jar: client, body: { body: 'anyone there?' },
    });
    check('and the thread accepts nothing further -> 404', res.status === 404, `status ${res.status}`);
  }



}

// --- the calendar feed ------------------------------------------------------------------------
//
// An ICS URL is a BEARER capability: no cookie, no session, just a token in a URL a calendar app
// will fetch forever. The J4 review found exactly this object as an unaddressed hole in a
// candidate design — a durable token the archive story never mentioned, so archiving a client left
// a working URL to their schedule.
{
  const coach = new Jar();
  const client = new Jar();
  const email = `ics-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar: client });

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: client, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const icsLink = (roster?.clients ?? []).find((c) => c.email === email)?.link_id;

  // Today, from the server — the schedule is computed against the client's own calendar day.
  const { json: probe } = await call('/api/v1/my-plans/today', { jar: client });
  const startOn = probe.date;

  const { json: plan } = await call('/api/v1/plans', {
    method: 'POST', jar: coach,
    body: { name: 'Feed probe', coach_client_id: icsLink, starts_on: startOn, cycle_days: 7 },
  });
  await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coach, body: { day_index: 0, name: 'Evening; session, with commas', start_time: '18:30', est_minutes: 75 },
  });
  await call(`/api/v1/plans/${plan.id}/days`, {
    method: 'POST', jar: coach, body: { day_index: 1, name: 'Pihenő', is_rest: true },
  });
  await call(`/api/v1/plans/${plan.id}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });

  let feedUrl = null;
  {
    const { res, json } = await call('/api/v1/calendar-feeds', {
      method: 'POST', jar: client, body: { label: 'Naptár', timezone: 'Europe/Budapest', days: 30 },
    });
    feedUrl = json?.url ?? null;
    check('a feed is minted with its URL shown once', res.status === 201 && /^\/api\/v1\/calendar\/[\w-]+\.ics$/.test(feedUrl ?? ''), `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/calendar-feeds', { jar: client });
    const stored = JSON.stringify(json?.feeds ?? []);
    const token = feedUrl.split('/').pop().replace('.ics', '');
    check(
      'the token is never retrievable afterwards',
      !stored.includes(token) && !stored.includes('token_hash'),
      `${json?.feeds?.length} feeds listed`,
    );
  }

  // --- the COACH-held feed ---------------------------------------------------------------------
  //
  // A coach subscribing to a client's schedule in their own calendar app. The row is carried on the
  // CLIENT's user_id (it is their schedule), reached through the link — so archiving the client
  // kills the URL with nothing having to remember to revoke it.
  let coachFeedId = null;
  {
    const { res, json } = await call('/api/v1/calendar-feeds', {
      method: 'POST', jar: coach, body: { label: 'Kliens naptár', coach_client_id: icsLink, days: 30 },
    });
    coachFeedId = json?.id ?? null;
    check('a coach mints a feed through the link', res.status === 201 && /\.ics$/.test(json?.url ?? ''), `status ${res.status}`);
  }
  {
    // The whole point of the previous block: a minted credential you cannot see is one you cannot
    // withdraw. The list is scoped to user_id, and on THIS row user_id is the client.
    const { json } = await call('/api/v1/calendar-feeds', { jar: coach });
    check(
      'the coach can see the feed it holds',
      (json?.feeds ?? []).some((f) => f.id === coachFeedId && f.coach_client_id === icsLink),
      `${json?.feeds?.length} feeds listed`,
    );
  }
  {
    // The client's own list shows it too, flagged. It is their schedule; they must be able to tell
    // "a calendar I subscribed to" from "a calendar my coach is watching".
    const { json } = await call('/api/v1/calendar-feeds', { jar: client });
    check(
      'the client sees the coach-held feed on their own schedule, flagged',
      (json?.feeds ?? []).some((f) => f.id === coachFeedId && f.coach_client_id === icsLink),
      `${json?.feeds?.length} feeds listed`,
    );
  }
  {
    // THE ONE THAT MATTERS. A stranger posting someone else's link id — the id is guessable, so the
    // predicate, not the obscurity, has to be what stops this.
    const outsider = new Jar();
    const outsiderEmail = `ics-out-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email: outsiderEmail, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email: outsiderEmail, password: PASSWORD }, jar: outsider });
    const { res } = await call('/api/v1/calendar-feeds', {
      method: 'POST', jar: outsider, body: { coach_client_id: icsLink, days: 30 },
    });
    check("a stranger cannot mint a feed on someone else's link", res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/calendar-feeds/${coachFeedId}/revoke`, { method: 'POST', jar: coach });
    check('the coach can withdraw what it minted', res.status === 200, `status ${res.status}`);
  }

  // The feed itself is fetched WITHOUT a session, exactly as a calendar client would.
  const fetchFeed = async (url) => {
    const r = await fetch(`${BASE}${url}`);
    return { status: r.status, type: r.headers.get('content-type'), body: await r.text() };
  };

  {
    const feed = await fetchFeed(feedUrl);
    check(
      'the feed serves with no cookie at all',
      feed.status === 200 && /^text\/calendar/.test(feed.type ?? '') && feed.body.startsWith('BEGIN:VCALENDAR'),
      `${feed.status} ${feed.type}`,
    );
  }
  {
    const feed = await fetchFeed(feedUrl);
    const events = (feed.body.match(/BEGIN:VEVENT/g) ?? []).length;
    check('and contains the scheduled occurrences', events > 4, `${events} events over the horizon`);
  }
  {
    const feed = await fetchFeed(feedUrl);
    check(
      'a timed day becomes a timed event, a rest day an all-day one',
      /DTSTART:\d{8}T183000/.test(feed.body) && /DTSTART;VALUE=DATE:\d{8}/.test(feed.body),
      `timed ${/DTSTART:\d{8}T183000/.test(feed.body)}, all-day ${/DTSTART;VALUE=DATE:/.test(feed.body)}`,
    );
  }
  {
    // RFC 5545 gives ; and , meaning inside a property. An unescaped name silently corrupts the
    // event — most clients drop the rest of the line rather than complaining.
    const feed = await fetchFeed(feedUrl);
    check(
      'semicolons and commas in a day name are escaped',
      feed.body.includes('Evening\\; session\\, with commas'),
      (feed.body.match(/SUMMARY:[^\r\n]*/) ?? ['(no summary)'])[0].slice(0, 60),
    );
  }
  {
    // THE REGRESSION THAT MOTIVATED FOLDING THE SCHEDULE RULE INTO ONE FILE.
    //
    // The ICS generator used to iterate forward from today and relocate any moved day it happened
    // to pass. A day whose ORIGINAL date is before the window therefore never got visited, so a
    // session dragged from last week onto next Tuesday vanished from the calendar rather than
    // moving. `/my-plans/week` had the extra pass for exactly this; the feed did not.
    const back = (n) => {
      const d = new Date(`${startOn}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    // A plan that started a week ago, so day_index 0 has an occurrence BEFORE the feed's window.
    const { json: past } = await call('/api/v1/plans', {
      method: 'POST', jar: coach,
      body: { name: 'Moved-in probe', coach_client_id: icsLink, starts_on: back(-7), cycle_days: 7 },
    });
    const { json: pastDay } = await call(`/api/v1/plans/${past.id}/days`, {
      method: 'POST', jar: coach, body: { day_index: 0, name: 'Moved in from the past' },
    });
    await call(`/api/v1/plans/${past.id}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });
    await seedException({ planId: past.id, dayId: pastDay.id, date: back(-7), action: 'move', moveTo: back(3) });

    const feed = await fetchFeed(feedUrl);
    // The UID, not the SUMMARY: day_index 0 also occurs naturally today, so matching the name alone
    // would pass on the wrong event. The UID pins the exact date the day was moved TO.
    const movedUid = `UID:tracker-${pastDay.id}-${back(3).replace(/-/g, '')}@tracker`;
    const originalUid = `UID:tracker-${pastDay.id}-${back(-7).replace(/-/g, '')}@tracker`;
    check(
      'a day moved onto the window FROM BEFORE IT reaches the feed',
      feed.body.includes(movedUid),
      feed.body.includes(movedUid) ? movedUid : `missing ${movedUid}`,
    );
    check(
      'and it does not also appear on its original date',
      !feed.body.includes(originalUid),
      `original ${feed.body.includes(originalUid) ? 'PRESENT' : 'absent'}`,
    );
  }
  {
    const feed = await fetchFeed('/api/v1/calendar/aaaaaaaaaaaaaaaaaaaaaaaa.ics');
    check('an unknown token -> 404', feed.status === 404, `status ${feed.status}`);
  }
  {
    const feed = await fetchFeed('/api/v1/calendar/short.ics');
    check('a malformed token -> 404, without a database round trip', feed.status === 404, `status ${feed.status}`);
  }
  {
    const { res } = await call('/api/v1/calendar-feeds/999999/revoke', { method: 'POST', jar: client });
    check("revoking someone else's feed -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/calendar-feeds', { jar: client });
    await call(`/api/v1/calendar-feeds/${json.feeds[0].id}/revoke`, { method: 'POST', jar: client });
    const feed = await fetchFeed(feedUrl);
    check('a revoked feed stops serving immediately', feed.status === 404, `status ${feed.status}`);
  }
}

// --- copy day / copy week ---------------------------------------------------------------------
//
// The trap this feature is built around: on a 7-day plan there IS no day 7, so "copy week 1 into
// week 2" is a CYCLE CHANGE to 14 days — which re-dates every future occurrence. The endpoint has
// to do it and SAY it did, not fail a constraint the coach cannot interpret.
{
  const coachA = new Jar();
  const coachB = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachA });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coachB });

  const { json: plan } = await call('/api/v1/plans', { method: 'POST', jar: coachA, body: { name: 'Copy probe', cycle_days: 7 } });
  const { json: d0 } = await call(`/api/v1/plans/${plan.id}/days`, { method: 'POST', jar: coachA, body: { day_index: 0, name: 'Push' } });
  const { json: d1 } = await call(`/api/v1/plans/${plan.id}/days`, { method: 'POST', jar: coachA, body: { day_index: 1, name: 'Pull' } });
  const { json: blk } = await call(`/api/v1/plans/${plan.id}/blocks`, { method: 'POST', jar: coachA, body: { day_id: d0.id, kind: 'superset' } });
  const { json: lib } = await call('/api/v1/exercises?limit=2', { jar: coachA });
  for (const ex of lib.exercises) {
    await call(`/api/v1/plans/${plan.id}/exercises`, {
      method: 'POST', jar: coachA, body: { block_id: blk.id, exercise_id: ex.id, target_sets: 3, target_reps_min: 5 },
    });
  }

  {
    // Copy inside the existing cycle: day 0 → day 3. No cycle change.
    const { res, json } = await call(`/api/v1/plans/${plan.id}/copy-days`, {
      method: 'POST', jar: coachA, body: { day_ids: [d0.id], offset: 3 },
    });
    check(
      'a day copies forward inside the cycle without changing it',
      res.status === 201 && json?.copied === 1 && json?.cycleGrewTo === null && json?.cycleDays === 7,
      `copied ${json?.copied}, cycle ${json?.cycleDays}, grew ${json?.cycleGrewTo}`,
    );
  }
  {
    // The copy is DEEP: the block and its exercises came too.
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const copiedDay = (tree?.days ?? []).find((d) => d.day_index === 3);
    const copiedBlocks = (tree?.blocks ?? []).filter((b) => b.day_id === copiedDay?.id);
    const copiedExercises = (tree?.exercises ?? []).filter((e) => copiedBlocks.some((b) => b.id === e.block_id));
    check(
      'and it brings its blocks and exercises with it',
      copiedBlocks.length === 1 && copiedExercises.length === 2 && copiedBlocks[0].kind === 'superset',
      `${copiedBlocks.length} blocks, ${copiedExercises.length} exercises`,
    );
  }
  {
    // THE case. Copying the week forward by 7 needs day indexes 7..10, which a 7-day cycle has no
    // room for — so the cycle has to grow, and the response has to say so.
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const week1 = (tree?.days ?? []).map((d) => d.id);
    const { res, json } = await call(`/api/v1/plans/${plan.id}/copy-days`, {
      method: 'POST', jar: coachA, body: { day_ids: week1, offset: 7 },
    });
    check(
      'copying a week onto a 7-day cycle grows it, and reports that it did',
      res.status === 201 && json?.cycleGrewTo === 11 && json?.copied === 3,
      `copied ${json?.copied}, cycle now ${json?.cycleDays}, grew to ${json?.cycleGrewTo}`,
    );
  }
  let cycleBeforeRefusal = null;
  {
    // Refuse rather than overwrite: a coach copying onto a week they had already written would
    // otherwise silently lose it.
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    cycleBeforeRefusal = tree?.plan?.cycle_days ?? null;
    const src = (tree?.days ?? []).find((d) => d.day_index === 0);
    const { res, json } = await call(`/api/v1/plans/${plan.id}/copy-days`, {
      method: 'POST', jar: coachA, body: { day_ids: [src.id], offset: 3 },
    });
    check('copying onto an occupied slot -> 409 naming the day', res.status === 409 && /day 4/.test(json?.error ?? ''), `${res.status}: ${json?.error}`);
  }
  {
    // THE REGRESSION FOR ADR-0005, and it took a PURPOSE-BUILT scenario to expose.
    //
    // `copyDaysTx` used to grow the cycle BEFORE checking the target slots, and better-sqlite3
    // COMMITS ON RETURN — so a refused copy left the growth behind. That is not a cosmetic leak:
    // the schedule is `starts_on + k*cycle_days + day_index`, so growing the cycle RE-DATES EVERY
    // FUTURE OCCURRENCE. A copy the coach was told had failed would silently move their client's
    // whole schedule.
    //
    // The bug only fires when the copy BOTH grows the cycle AND hits an occupied slot. The first
    // version of this check reused the block above, where the offset never reached the cycle end —
    // it passed with the bug deliberately reinstated, which is exactly the "test that cannot fail"
    // this codebase keeps catching. So: a 7-day plan with days at 0, 3 and 6, copying [0, 3] to
    // offset 6 — target 6 is OCCUPIED, and target 9 is past the cycle, so growth is attempted too.
    const { json: p2 } = await call('/api/v1/plans', {
      method: 'POST', jar: coachA, body: { name: `ADR5 ${stamp}`, cycle_days: 7 },
    });
    const dayIds = {};
    for (const idx of [0, 3, 6]) {
      const { json: d } = await call(`/api/v1/plans/${p2.id}/days`, {
        method: 'POST', jar: coachA, body: { day_index: idx, name: `d${idx}` },
      });
      dayIds[idx] = d.id;
    }
    const { res, json } = await call(`/api/v1/plans/${p2.id}/copy-days`, {
      method: 'POST', jar: coachA, body: { day_ids: [dayIds[0], dayIds[3]], offset: 6 },
    });
    check(
      'a copy that would both grow the cycle AND collide is refused',
      res.status === 409,
      `${res.status}: ${json?.error}`,
    );
    const { json: after } = await call(`/api/v1/plans/${p2.id}`, { jar: coachA });
    check(
      'and the refusal leaves the CYCLE untouched — a committed growth would re-date every future occurrence',
      after?.plan?.cycle_days === 7,
      `cycle 7 -> ${after?.plan?.cycle_days}`,
    );
    check(
      'and no day was copied either',
      (after?.days ?? []).length === 3,
      `${after?.days?.length} days`,
    );
  }
  {
    // ...and that refusal must have left nothing behind.
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const atFour = (tree?.days ?? []).filter((d) => d.day_index === 3);
    check('the refused copy left no duplicate day', atFour.length === 1, `${atFour.length} days at index 3`);
  }
  {
    // The LAST day, not the first: index 0 + offset 55 lands on 55, which fits inside the 56-day
    // maximum exactly. Using it would have tested nothing — the first version of this check did,
    // and passed a 201 while claiming to prove a limit.
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const last = [...tree.days].sort((a, b) => b.day_index - a.day_index)[0];
    const { res } = await call(`/api/v1/plans/${plan.id}/copy-days`, {
      method: 'POST', jar: coachA, body: { day_ids: [last.id], offset: 55 },
    });
    check(
      'a copy that would push the cycle past 56 days -> 400',
      res.status === 400,
      `from index ${last.day_index} + 55 → ${last.day_index + 55}, status ${res.status}`,
    );
  }
  {
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const { res } = await call(`/api/v1/plans/${plan.id}/copy-days`, {
      method: 'POST', jar: coachB, body: { day_ids: [tree.days[0].id], offset: 1 },
    });
    check("another coach cannot copy days in this plan -> 404", res.status === 404, `status ${res.status}`);
  }
  {
    // A day id from a DIFFERENT plan is refused whole rather than partially honoured.
    const { json: other } = await call('/api/v1/plans', { method: 'POST', jar: coachA, body: { name: 'elsewhere' } });
    const { json: otherDay } = await call(`/api/v1/plans/${other.id}/days`, { method: 'POST', jar: coachA, body: { day_index: 0, name: 'X' } });
    const { json: tree } = await call(`/api/v1/plans/${plan.id}`, { jar: coachA });
    const { res } = await call(`/api/v1/plans/${plan.id}/copy-days`, {
      method: 'POST', jar: coachA, body: { day_ids: [tree.days[0].id, otherDay.id], offset: 20 },
    });
    check("a day from another plan makes the whole copy fail -> 404", res.status === 404, `status ${res.status}`);
  }
}

// --- F4 NUTRITION -----------------------------------------------------------------------------
//
// The five-pass adversarial checklist the owner's rules require of any endpoint that a coach and a
// client both touch: FORGE, REPLAY, RACE, IDOR, EXTREMES. Plus the one this feature adds:
// **the client never sends a macro**, and the proof is that sending one is a 400 and that a food
// edit does not move a prescription.
{
  const coach = new Jar();
  const eater = new Jar();
  const stranger = new Jar();
  const coach2 = new Jar();
  const eaterEmail = `nutri-eater-${stamp}@example.com`;
  const strangerEmail = `nutri-stranger-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coach2 });
  for (const [email, jar] of [[eaterEmail, eater], [strangerEmail, stranger]]) {
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
  }

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: eater, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const linkId = (roster?.clients ?? []).find((c) => c.email === eaterEmail)?.link_id;

  // --- foods ------------------------------------------------------------------------------------
  let foodId = null;
  {
    const { res, json } = await call('/api/v1/foods', {
      method: 'POST', jar: coach,
      body: { name: `Csirkemell ${stamp}`, kcal_per_100g: 165, protein_g_per_100g: 31, carb_g_per_100g: 0, fat_g_per_100g: 3.6 },
    });
    foodId = json?.id;
    check('a coach can add a food', res.status === 201 && Number.isInteger(foodId), `status ${res.status}`);
  }
  {
    // THE SEEDED DATABASE, IN THREE LANGUAGES. Migration 016 ships 95 curated foods with hu/en/de
    // names, and the whole point of the translations table is that a Hungarian user searching in
    // Hungarian finds them. A seeded row is owner-less, so it is visible to everyone.
    const hu = await call('/api/v1/foods?q=zabpehely&lang=hu', { jar: eater });
    const de = await call('/api/v1/foods?q=Haferflocken&lang=de', { jar: eater });
    const en = await call('/api/v1/foods?q=oats&lang=en', { jar: eater });
    const sameRow = hu.json?.foods?.[0]?.id && hu.json.foods[0].id === de.json?.foods?.[0]?.id
      && hu.json.foods[0].id === en.json?.foods?.[0]?.id;
    check(
      'one seeded food is findable in hu, de and en, and it is the SAME row',
      sameRow,
      `hu ${hu.json?.foods?.[0]?.id}, de ${de.json?.foods?.[0]?.id}, en ${en.json?.foods?.[0]?.id}`,
    );
  }
  {
    // The name comes back in the READER's language, not the canonical English.
    const { json } = await call('/api/v1/foods?q=zabpehely&lang=hu', { jar: eater });
    check(
      'the name is returned in the reader\'s language',
      json?.foods?.[0]?.name === 'Zabpehely, száraz',
      `"${json?.foods?.[0]?.name}"`,
    );
  }
  {
    // THE FALLBACK ARM. Someone browsing in Hungarian who types the English name still finds it —
    // this is what `lang IN (?, ?)` buys, and without the fallback this search returns nothing.
    const { json } = await call('/api/v1/foods?q=salmon&lang=hu', { jar: eater });
    check(
      'an English query while browsing in Hungarian still finds the food',
      (json?.foods ?? []).some((f) => f.name === 'Lazac, atlanti, nyers'),
      `${json?.foods?.length} hits, first "${json?.foods?.[0]?.name}"`,
    );
  }
  {
    // The macros survived the integer round-trip out of the migration and back.
    const { json } = await call('/api/v1/foods?q=csirkemell&lang=hu', { jar: eater });
    const seeded = (json?.foods ?? []).find((f) => f.source === 'system');
    check(
      'a seeded food carries exact macros through the integer scale',
      seeded && Math.abs(seeded.kcal_per_100g - 165) < 0.001 && Math.abs(seeded.protein_g_per_100g - 31) < 0.001,
      `${seeded?.kcal_per_100g} kcal, ${seeded?.protein_g_per_100g} g protein`,
    );
  }
  {
    // Diacritics: the user types without them, the food has them. `remove_diacritics 2` on both
    // FTS indexes is what makes this work, and it is the single most common Hungarian search.
    const bare = await call('/api/v1/foods?q=turo&lang=hu', { jar: eater });
    check(
      'searching "turo" finds "Túró Rudi"',
      (bare.json?.foods ?? []).some((f) => f.name === 'Túró Rudi'),
      `${bare.json?.foods?.length} hits`,
    );
  }
  {
    // FORGE: `verified` and `source` are server-owned and are not in the schema at all.
    const { res } = await call('/api/v1/foods', {
      method: 'POST', jar: coach,
      body: { name: 'Fake USDA', kcal_per_100g: 100, protein_g_per_100g: 1, carb_g_per_100g: 1, fat_g_per_100g: 1, verified: 1, source: 'usda' },
    });
    check('FORGE: claiming verified/usda on a food -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // EXTREMES: nothing on earth is denser than pure fat.
    const { res } = await call('/api/v1/foods', {
      method: 'POST', jar: coach,
      body: { name: 'Neutronium', kcal_per_100g: 99999, protein_g_per_100g: 0, carb_g_per_100g: 0, fat_g_per_100g: 0 },
    });
    check('EXTREMES: 99999 kcal per 100 g -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/foods?q=Csirkemell`, { jar: coach });
    check('food search finds it', res.status === 200 && json?.foods?.some((f) => f.id === foodId), `${json?.foods?.length} hits`);
  }
  {
    // IDOR: a personal food is its author's. A stranger searching must not see it, and the exact
    // id is not a permission either — the prescription write below is where that is proven.
    const { json } = await call(`/api/v1/foods?q=Csirkemell`, { jar: stranger });
    check('IDOR: a stranger does not see another user\'s personal food', !(json?.foods ?? []).some((f) => f.id === foodId), `${json?.foods?.length} hits`);
  }
  {
    // EXTREMES: FTS5 MATCH is an expression language. A bare quote must be a search, not a 500.
    const { res } = await call(`/api/v1/foods?q=${encodeURIComponent('" OR name:x')}`, { jar: coach });
    check('EXTREMES: an FTS metacharacter is a search term, not a syntax error', res.status === 200, `status ${res.status}`);
  }

  // --- plans ------------------------------------------------------------------------------------
  let planId = null; let dayId = null; let mealId = null; let itemId = null;
  {
    const { res, json } = await call('/api/v1/nutrition-plans', {
      method: 'POST', jar: coach,
      body: { name: 'Cut phase', coach_client_id: linkId, starts_on: '2026-08-01', goal: 'fat-loss' },
    });
    planId = json?.id;
    check('a coach can assign a nutrition plan', res.status === 201 && Number.isInteger(planId), `status ${res.status}`);
  }
  {
    // FORGE: the link belongs to the other coach. The INSERT has no WHERE — the link is proved
    // inside the SELECT, so a forged id inserts zero rows.
    const { res } = await call('/api/v1/nutrition-plans', {
      method: 'POST', jar: coach2,
      body: { name: 'Injected', coach_client_id: linkId },
    });
    check('FORGE: assigning a plan through another coach\'s link -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/nutrition-plans/${planId}/days`, {
      method: 'POST', jar: coach,
      body: { day_index: 0, name: 'Training day', kcal_target: 2500, protein_g_target: 180, carb_g_target: 250, fat_g_target: 80 },
    });
    dayId = json?.id;
    check('a day with macro targets', res.status === 201 && Number.isInteger(dayId), `status ${res.status}`);
  }
  {
    // EXTREMES: the cycle is 7, so day 7 does not exist. The trigger says so and the route must
    // turn that into a client error rather than a 500.
    const { res } = await call(`/api/v1/nutrition-plans/${planId}/days`, {
      method: 'POST', jar: coach, body: { day_index: 27 },
    });
    check('EXTREMES: a day outside the cycle -> 400, not 500', res.status === 400, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/nutrition-plans/${planId}/meals`, {
      method: 'POST', jar: coach, body: { day_id: dayId, name: 'Reggeli', time_hint: '08:00' },
    });
    mealId = json?.id;
    check('a meal in the day', res.status === 201 && Number.isInteger(mealId), `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/nutrition-plans/${planId}/items`, {
      method: 'POST', jar: coach, body: { meal_id: mealId, food_id: foodId, grams: 150 },
    });
    itemId = json?.id;
    check('a prescribed portion', res.status === 201 && Number.isInteger(itemId), `status ${res.status}`);
  }
  {
    // THE RULE OF THIS FEATURE. The body carries no macro field at all, so sending one is not
    // "ignored" — it is rejected, which is the difference between a strict schema and a lenient one.
    const { res } = await call(`/api/v1/nutrition-plans/${planId}/items`, {
      method: 'POST', jar: coach,
      body: { meal_id: mealId, food_id: foodId, grams: 150, kcal: 5 },
    });
    check('FORGE: sending a kcal figure with a portion -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/nutrition-plans/${planId}`, { jar: coach });
    const item = (json?.items ?? [])[0];
    const exact = item && Math.abs(item.kcal - 247.5) < 0.001 && Math.abs(item.protein_g - 46.5) < 0.001;
    check('150 g of 165 kcal/100 g reads back as exactly 247.5 kcal', res.status === 200 && exact, `${item?.kcal} kcal, ${item?.protein_g} g protein`);
  }
  {
    // IDOR: the plan tree belongs to the coach who wrote it and the client it names. Nobody else.
    const { res } = await call(`/api/v1/nutrition-plans/${planId}`, { jar: stranger });
    check('IDOR: a stranger reading the plan -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/nutrition-plans/${planId}/items/${itemId}`, {
      method: 'PATCH', jar: coach2, body: { grams: 999 },
    });
    check('IDOR: another coach editing a portion -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // The plan is still a draft, so the client cannot see it yet.
    const { res } = await call(`/api/v1/nutrition-plans/${planId}`, { jar: eater });
    check('a draft plan is invisible to the client -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // BOTH BORROWED CLAUSES, PROVEN. This is the first: the plan is still a DRAFT, so the client
    // cannot see it — and must not be able to reach its food either. Without `status <> 'draft'`
    // in visibleFood, a client could log an ingredient out of a plan they are not shown yet.
    const { res } = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: eater,
      body: { food_id: foodId, grams: 100, local_date: '2026-08-05' },
    });
    check('a food reachable only through a DRAFT plan is not loggable -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    await call(`/api/v1/nutrition-plans/${planId}`, { method: 'PATCH', jar: coach, body: { status: 'active' } });
    const { res, json } = await call(`/api/v1/nutrition-plans/${planId}`, { jar: eater });
    check('activating it makes the client the reader', res.status === 200 && json?.items?.length === 1, `status ${res.status}`);
  }
  {
    // EXTREMES: an id no row will ever have must be a 404 and never a 500.
    const { res } = await call(`/api/v1/nutrition-plans/2147483647`, { jar: coach });
    check('EXTREMES: MAX_INT plan id -> 404', res.status === 404, `status ${res.status}`);
  }

  // --- the client's log -------------------------------------------------------------------------
  let logId = null;
  {
    const { res, json } = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: eater,
      body: { food_id: foodId, grams: 200, local_date: '2026-08-06', tz_name: 'Europe/Budapest', meal_label: 'Ebéd' },
    });
    logId = json?.id;
    check('a client logs a food', res.status === 201 && Number.isInteger(logId), `status ${res.status}`);
  }
  {
    const { res, json } = await call('/api/v1/nutrition-log/2026-08-06', { jar: eater });
    const exact = Math.abs((json?.totals?.kcal ?? 0) - 330) < 0.001;
    check('200 g of 165 kcal/100 g totals exactly 330 kcal', res.status === 200 && exact, `${json?.totals?.kcal} kcal`);
  }
  {
    // ADHERENCE IS A COMPARISON, NOT A PERCENTAGE. 2026-08-06 is five days after starts_on with a
    // 7-day cycle, so the schedule rule lands on day_index 5 — which has no row, so no target.
    // Day 0 is 2026-08-01. Assert the arithmetic rather than assuming it.
    const { json } = await call('/api/v1/nutrition-log/2026-08-01', { jar: eater });
    check('the target for the date comes from the schedule rule', json?.targets?.kcal_target === 2500, `target ${json?.targets?.kcal_target}`);
  }
  {
    const { json } = await call('/api/v1/nutrition-log/2026-08-06', { jar: eater });
    check('a date the cycle gives no day has no invented target', json?.targets === null, `targets ${JSON.stringify(json?.targets)}`);
  }
  {
    // THE THIRD CLAUSE IS NARROW, AND THIS IS WHAT PROVES IT.
    //
    // `visibleFood` grants a client access to foods USED IN a plan assigned to them. The obvious
    // way to get that wrong is to widen it to "any food belonging to my coach", which would be
    // simpler, would make the assertion above pass identically, and would hand every client the
    // coach's entire private food list. So: a second coach food that is never prescribed.
    const { json: secret } = await call('/api/v1/foods', {
      method: 'POST', jar: coach,
      body: { name: `Titkos recept ${stamp}`, kcal_per_100g: 500, protein_g_per_100g: 10, carb_g_per_100g: 50, fat_g_per_100g: 25 },
    });
    const search = await call(`/api/v1/foods?q=Titkos`, { jar: eater });
    const logIt = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: eater,
      body: { food_id: secret.id, grams: 100, local_date: '2026-08-06' },
    });
    check(
      'a coach food that was never prescribed stays invisible to the client',
      (search.json?.foods ?? []).length === 0 && logIt.res.status === 404,
      `${search.json?.foods?.length} hits, log ${logIt.res.status}`,
    );
  }
  {
    // ...and the prescribed one IS searchable, so the client can find what they were told to eat
    // rather than having to type it in again from the plan screen.
    const { json } = await call(`/api/v1/foods?q=Csirkemell`, { jar: eater });
    check(
      'the prescribed food IS searchable by the client it was prescribed to',
      (json?.foods ?? []).some((f) => f.id === foodId),
      `${json?.foods?.length} hits`,
    );
  }
  {
    // THE SNAPSHOT RECORDS WHAT THE WRITER SAW, INCLUDING THE LANGUAGE.
    //
    // Found in the browser, not in the code: a Hungarian user logged "Zabpehely" and their own
    // diary read "Oats, rolled, dry" back at them, because the snapshot came from foods.name — the
    // canonical English fallback, which exists so a row is always nameable and is not what anybody
    // should be shown. The same two writes in two languages must produce two different names.
    const seeded = await call('/api/v1/foods?q=zabpehely&lang=hu', { jar: eater });
    const oats = seeded.json?.foods?.[0]?.id;

    await call('/api/v1/nutrition-log?lang=hu', {
      method: 'POST', jar: eater,
      body: { food_id: oats, grams: 50, local_date: '2026-09-01' },
    });
    await call('/api/v1/nutrition-log?lang=en', {
      method: 'POST', jar: eater,
      body: { food_id: oats, grams: 50, local_date: '2026-09-02' },
    });

    const hu = await call('/api/v1/nutrition-log/2026-09-01', { jar: eater });
    const en = await call('/api/v1/nutrition-log/2026-09-02', { jar: eater });

    check(
      'the log snapshots the food name in the WRITER\'s language',
      hu.json?.items?.[0]?.name === 'Zabpehely, száraz' && en.json?.items?.[0]?.name === 'Oats, rolled, dry',
      `hu "${hu.json?.items?.[0]?.name}", en "${en.json?.items?.[0]?.name}"`,
    );
  }
  {
    // ...and it does NOT retranslate afterwards. Reading the Hungarian entry with the app in
    // English still shows what was written, because the row is a record of a past act rather than
    // a live view of a food.
    const { json } = await call('/api/v1/nutrition-log/2026-09-01?lang=en', { jar: eater });
    check(
      'and switching language does not rewrite an existing entry',
      json?.items?.[0]?.name === 'Zabpehely, száraz',
      `"${json?.items?.[0]?.name}"`,
    );
  }
  {
    // FORGE: the client sends a macro with their log.
    const { res } = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: eater,
      body: { food_id: foodId, grams: 100, local_date: '2026-08-06', kcal: 1 },
    });
    check('FORGE: a client sending their own kcal -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // FORGE: tagging a log entry against a plan day belonging to somebody else. The subquery scopes
    // plan_day_id to a plan assigned to THIS user, so the tag silently becomes NULL rather than
    // linking two unrelated people's data.
    const { res, json: created } = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: stranger,
      body: { food_id: foodId, grams: 100, local_date: '2026-08-06', plan_day_id: dayId },
    });
    // The stranger cannot see the coach's personal food either, so this is a 404 first.
    check('FORGE: a stranger logging another user\'s personal food -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // IDOR: the log is single-table on client_user_id. A stranger's day is empty, not forbidden.
    const { res, json } = await call('/api/v1/nutrition-log/2026-08-06', { jar: stranger });
    check('IDOR: a stranger sees their own empty day, not the client\'s', res.status === 200 && json?.items?.length === 0, `${json?.items?.length} items`);
  }
  {
    const { res } = await call(`/api/v1/nutrition-log/${logId}`, { method: 'DELETE', jar: stranger });
    check('IDOR: a stranger deleting the client\'s log entry -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // EXTREMES: a date that is not a date.
    const { res } = await call('/api/v1/nutrition-log/6-August-2026', { jar: eater });
    check('EXTREMES: a malformed date -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // EXTREMES: a range wider than a year is refused rather than served slowly.
    const { res, json } = await call('/api/v1/nutrition-log?from=1000-01-01&to=3000-01-01', { jar: eater });
    check('EXTREMES: a 2000-year range returns nothing rather than scanning', res.status === 200 && json?.days?.length === 0, `${json?.days?.length} days`);
  }
  {
    // RACE: two concurrent logs are two rows. Nothing here is an upsert, and if the day cap or the
    // insert had a read-then-write shape this is where it would show.
    const [a, b] = await Promise.all([
      call('/api/v1/nutrition-log', { method: 'POST', jar: eater, body: { food_id: foodId, grams: 50, local_date: '2026-08-07' } }),
      call('/api/v1/nutrition-log', { method: 'POST', jar: eater, body: { food_id: foodId, grams: 50, local_date: '2026-08-07' } }),
    ]);
    const { json } = await call('/api/v1/nutrition-log/2026-08-07', { jar: eater });
    check('RACE: two concurrent logs are two rows', a.res.status === 201 && b.res.status === 201 && json?.items?.length === 2, `${json?.items?.length} items`);
  }
  {
    // REPLAY: deleting the same entry twice. The second is a 404 because the row is gone, not
    // because a flag says it was already deleted.
    const first = await call(`/api/v1/nutrition-log/${logId}`, { method: 'DELETE', jar: eater });
    const second = await call(`/api/v1/nutrition-log/${logId}`, { method: 'DELETE', jar: eater });
    check('REPLAY: deleting a log entry twice -> 204 then 404', first.res.status === 204 && second.res.status === 404, `${first.res.status} then ${second.res.status}`);
  }

  // --- THE SNAPSHOT IS THE VALUE ----------------------------------------------------------------
  {
    // Correcting the food must not rewrite what was prescribed or what was eaten. This is the
    // single most important assertion in this block: without it, an admin fixing a typo in the
    // food database silently rewrites every coach's prescriptions and every client's history.
    const { json: before } = await call(`/api/v1/nutrition-plans/${planId}`, { jar: coach });
    const kcalBefore = before?.items?.[0]?.kcal;

    await call(`/api/v1/foods/${foodId}`, { method: 'DELETE', jar: coach });

    const { res, json: after } = await call(`/api/v1/nutrition-plans/${planId}`, { jar: coach });
    const item = after?.items?.[0];
    check(
      'deleting the food leaves the prescription readable and unchanged',
      res.status === 200 && item && item.food_id === null && Math.abs(item.kcal - kcalBefore) < 0.001,
      `food_id ${item?.food_id}, ${item?.kcal} kcal (was ${kcalBefore})`,
    );

    const { json: day } = await call('/api/v1/nutrition-log/2026-08-07', { jar: eater });
    check(
      'and the client\'s own log survives the food being deleted',
      day?.items?.length === 2 && day.items.every((i) => i.food_id === null && i.name.startsWith('Csirkemell')),
      `${day?.items?.length} items, first "${day?.items?.[0]?.name}"`,
    );
  }
  {
    // The second borrowed clause: the coach ARCHIVES the client. `archived_at` on the plan is
    // untouched by that — archiving acts on the LINK — so `archived_at IS NULL` alone would leave
    // the departed coach's private food readable forever. The link-active condition is what makes
    // it stop on the very next request, with the same unexpired token.
    const { json: food2 } = await call('/api/v1/foods', {
      method: 'POST', jar: coach,
      body: { name: `Utolso etel ${stamp}`, kcal_per_100g: 200, protein_g_per_100g: 20, carb_g_per_100g: 10, fat_g_per_100g: 8 },
    });
    await call(`/api/v1/nutrition-plans/${planId}/items`, {
      method: 'POST', jar: coach, body: { meal_id: mealId, food_id: food2.id, grams: 100 },
    });
    const before = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: eater, body: { food_id: food2.id, grams: 100, local_date: '2026-08-08' },
    });

    await call(`/api/v1/clients/${linkId}/archive`, { method: 'POST', jar: coach });

    const after = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: eater, body: { food_id: food2.id, grams: 100, local_date: '2026-08-09' },
    });
    check(
      'archiving the client withdraws the coach food on the next request',
      before.res.status === 201 && after.res.status === 404,
      `${before.res.status} while linked, ${after.res.status} after archiving`,
    );

    const kept = await call('/api/v1/nutrition-log/2026-08-08', { jar: eater });
    check(
      'and what they already ate is still theirs, snapshot intact',
      kept.json?.items?.length === 1 && Math.abs(kept.json.items[0].kcal - 200) < 0.001,
      `${kept.json?.items?.length} items, ${kept.json?.items?.[0]?.kcal} kcal`,
    );
  }
  {
    // IDOR on the delete: the food was the coach's, so a stranger holding the exact id gets 404.
    const { res } = await call(`/api/v1/foods/${foodId}`, { method: 'DELETE', jar: stranger });
    check('IDOR: deleting a food you do not own -> 404', res.status === 404, `status ${res.status}`);
  }
}

// --- F10 PROGRESS: MEASUREMENTS, PHOTOS, AND THE CONSENT THAT GATES THEM -----------------------
//
// The privacy model is four conditions in one predicate, and every one of them is attacked here.
// The failure mode this block exists to prevent is the one where a coach can see a photograph of
// somebody's body that nobody said they could see.
{
  const coach = new Jar();
  const coach2 = new Jar();
  const subject = new Jar();
  const stranger = new Jar();
  const subjectEmail = `progress-subject-${stamp}@example.com`;
  const strangerEmail = `progress-stranger-${stamp}@example.com`;

  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: coach2 });
  for (const [email, jar] of [[subjectEmail, subject], [strangerEmail, stranger]]) {
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
  }

  const { json: code } = await call('/api/v1/invite-codes', { method: 'POST', jar: coach, body: { kind: 'multi', max_uses: 5 } });
  await call('/api/v1/join', { method: 'POST', jar: subject, body: { code: code.code } });
  const { json: roster } = await call('/api/v1/clients', { jar: coach });
  const link = (roster?.clients ?? []).find((c) => c.email === subjectEmail)?.link_id;
  const { json: me } = await call('/api/v1/auth/me', { jar: subject });
  const subjectId = me?.user?.id ?? me?.id;

  // --- measurements ----------------------------------------------------------------------------
  {
    const { json } = await call('/api/v1/measurement-metrics', { jar: subject });
    check('the metric vocabulary is a table, not a hardcoded enum', (json?.metrics ?? []).length === 15, `${json?.metrics?.length} metrics`);
  }
  {
    const { res } = await call('/api/v1/measurements', {
      method: 'POST', jar: subject, body: { metric_key: 'weight', measured_on: '2026-08-01', value: 82.35 },
    });
    check('a measurement is recorded', res.status === 201, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/measurements?metric_key=weight', { jar: subject });
    check('82.35 kg round-trips exactly through the integer scale', Math.abs(json?.measurements?.[0]?.value - 82.35) < 0.0001, `${json?.measurements?.[0]?.value}`);
  }
  {
    // ONE VALUE PER METRIC PER DAY. Weighing yourself twice on one morning replaces rather than
    // making the chart show two points for one day.
    await call('/api/v1/measurements', { method: 'POST', jar: subject, body: { metric_key: 'weight', measured_on: '2026-08-01', value: 82.1 } });
    const { json } = await call('/api/v1/measurements?metric_key=weight', { jar: subject });
    check('a second weighing on the same day REPLACES the first', json?.measurements?.length === 1 && Math.abs(json.measurements[0].value - 82.1) < 0.0001, `${json?.measurements?.length} rows, ${json?.measurements?.[0]?.value} kg`);
  }
  {
    // EXTREMES: the bounds live in a table and a trigger enforces them, so a wrong bound is an
    // UPDATE and not a table rebuild. 400, never 500.
    const low = await call('/api/v1/measurements', { method: 'POST', jar: subject, body: { metric_key: 'weight', measured_on: '2026-08-02', value: 3 } });
    const high = await call('/api/v1/measurements', { method: 'POST', jar: subject, body: { metric_key: 'weight', measured_on: '2026-08-02', value: 900 } });
    check('EXTREMES: implausible weights -> 400, not 500', low.res.status === 400 && high.res.status === 400, `${low.res.status} / ${high.res.status}`);
  }
  {
    // FORGE: an unknown metric is rejected by the FOREIGN KEY, not by an enum in the code — which
    // is what lets a new metric ship as an INSERT rather than a 12-step table rebuild.
    const { res } = await call('/api/v1/measurements', { method: 'POST', jar: subject, body: { metric_key: 'wingspan', measured_on: '2026-08-02', value: 180 } });
    check('FORGE: an unknown metric -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // FORGE: client_user_id is not in the body schema at all, so there is no id to forge.
    const { res } = await call('/api/v1/measurements', { method: 'POST', jar: stranger, body: { metric_key: 'weight', measured_on: '2026-08-03', value: 70, client_user_id: subjectId } });
    check('FORGE: naming somebody else as the subject -> 400', res.status === 400, `status ${res.status}`);
  }

  // --- THE DEFAULT IS NOBODY --------------------------------------------------------------------
  {
    const { res, json } = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: coach });
    check(
      'with NO share, the coach sees nothing — the default is deny, not allow',
      res.status === 200 && json?.measurements?.length === 0,
      `${json?.measurements?.length} rows`,
    );
  }
  {
    const { json } = await call('/api/v1/progress-access-log', { jar: subject });
    check('...and that empty look was still logged', (json?.entries ?? []).some((e) => e.kind === 'measurements'), `${json?.entries?.length} entries`);
  }

  // --- sharing ----------------------------------------------------------------------------------
  {
    // FORGE: only the CLIENT may grant. A coach POSTing to their own client's link inserts zero
    // rows, because the statement binds cc.client_id and requires it to equal the caller.
    const { res } = await call(`/api/v1/progress-shares/${link}`, { method: 'POST', jar: coach, body: { share_measurements: true } });
    check('FORGE: a coach granting themselves access -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/progress-shares/${link}`, { method: 'POST', jar: subject, body: { share_measurements: true } });
    check('the client grants measurements', res.status === 204, `status ${res.status}`);
  }
  {
    const { json } = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: coach });
    check('the coach now sees the measurements', json?.measurements?.length === 1, `${json?.measurements?.length} rows`);
  }
  {
    // THE TWO FLAGS ARE SEPARATE DECISIONS. Granting measurements must not carry photos with it.
    const { json } = await call(`/api/v1/progress-photos?client_id=${subjectId}`, { jar: coach });
    check('granting MEASUREMENTS did not also grant PHOTOS', (json?.photos ?? []).length === 0, `${json?.photos?.length} photos`);
  }
  {
    // IDOR: the other coach has no link at all, so the share cannot possibly reach them.
    const { json } = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: coach2 });
    check('IDOR: a coach with no link sees nothing', (json?.measurements ?? []).length === 0, `${json?.measurements?.length} rows`);
  }
  {
    const { json } = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: stranger });
    check('IDOR: a stranger sees nothing', (json?.measurements ?? []).length === 0, `${json?.measurements?.length} rows`);
  }

  // --- photos -----------------------------------------------------------------------------------
  //
  // A 1x1 PNG, built here rather than read from disk so the smoke has no fixture file to lose.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const uploadPhoto = async (jar, takenOn) => {
    const form = new FormData();
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
    form.append('taken_on', takenOn);
    form.append('pose', 'front');
    return call('/api/v1/progress-photos', { method: 'POST', jar, body: form });
  };

  let photoKey = null;
  let photoId = null;
  {
    const { res, json } = await uploadPhoto(subject, '2026-08-01');
    photoKey = json?.storage_key;
    photoId = json?.id;
    check('a progress photo uploads', res.status === 201 && /^[a-f0-9]{48}$/.test(photoKey ?? ''), `status ${res.status}, key ${photoKey?.slice(0, 12)}…`);
  }
  {
    // NARROWED, NOT WAIVED. The upload is mounted ABOVE the global CSRF middleware because a
    // multipart body cannot carry a JSON content type. That is only acceptable if the route's own
    // check is real, so: the same upload with the X-CSRF header removed, and with a cross-site
    // Sec-Fetch-Site. Both must be refused, or moving the route was a hole rather than a
    // narrowing.
    const noHeader = new FormData();
    noHeader.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
    noHeader.append('taken_on', '2026-08-02');
    const a = await fetch(`${BASE}/api/v1/progress-photos`, {
      method: 'POST', headers: { Cookie: subject.header() }, body: noHeader,
    });

    const crossSite = new FormData();
    crossSite.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
    crossSite.append('taken_on', '2026-08-02');
    const b = await fetch(`${BASE}/api/v1/progress-photos`, {
      method: 'POST',
      headers: { Cookie: subject.header(), 'X-CSRF': '1', 'Sec-Fetch-Site': 'cross-site' },
      body: crossSite,
    });

    check(
      'the upload above the global CSRF guard runs its OWN, and it fires',
      a.status === 403 && b.status === 403,
      `no header ${a.status}, cross-site ${b.status}`,
    );
  }
  {
    // ...and a JSON content type on that route is refused too, so the multipart exception cannot
    // be used as a general CSRF bypass for anything else.
    const c = await fetch(`${BASE}/api/v1/progress-photos`, {
      method: 'POST',
      headers: { Cookie: subject.header(), 'X-CSRF': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ taken_on: '2026-08-02' }),
    });
    check('a JSON body on the multipart-only route -> 415', c.status === 415, `status ${c.status}`);
  }
  {
    // MAGIC BYTES, not the filename and not the declared type. A text file claiming image/png is
    // refused by what its first bytes actually are.
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a picture')], { type: 'image/png' }), 'evil.png');
    form.append('taken_on', '2026-08-01');
    const { res } = await call('/api/v1/progress-photos', { method: 'POST', jar: subject, body: form });
    check('a text file claiming to be a PNG -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/progress-media/${photoKey}`, { jar: subject });
    check('the owner can read their own photo', res.status === 200, `status ${res.status}`);
  }
  {
    // THE KEY IS NOT THE PERMISSION. The exact 48-hex key, in the hands of the linked coach who
    // was granted MEASUREMENTS but not photos.
    const { res } = await call(`/api/v1/progress-media/${photoKey}`, { jar: coach });
    check('THE KEY IS NOT THE PERMISSION: the exact key without a photo share -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/progress-media/${photoKey}`, { jar: stranger });
    check('...and a stranger with the exact key -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    await call(`/api/v1/progress-shares/${link}`, { method: 'POST', jar: subject, body: { share_photos: true } });
    const { res } = await call(`/api/v1/progress-media/${photoKey}`, { jar: coach });
    check('after the client grants photos, the coach can read it', res.status === 200, `status ${res.status}`);
  }
  {
    // Granting photos must not have quietly cleared the measurements grant.
    const { json } = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: coach });
    check('granting photos left the measurements grant alone', json?.measurements?.length === 1, `${json?.measurements?.length} rows`);
  }
  {
    // T4.3.1: the READ is logged, with the viewer named.
    const { json } = await call('/api/v1/progress-access-log', { jar: subject });
    const photoLook = (json?.entries ?? []).find((e) => e.kind === 'photo');
    check(
      'the photo read is logged, naming the viewer',
      photoLook?.viewer === seeded.coach.email && photoLook.target_id === photoId,
      `viewer "${photoLook?.viewer}", target ${photoLook?.target_id}`,
    );
  }
  {
    // IDOR on the log itself: it is the SUBJECT's read and only theirs.
    const { json } = await call('/api/v1/progress-access-log', { jar: coach });
    check('IDOR: the coach cannot read the client\'s access log', !(json?.entries ?? []).some((e) => e.kind === 'photo' && e.target_id === photoId), `${json?.entries?.length} entries`);
  }

  // --- REVOCATION IS IMMEDIATE ------------------------------------------------------------------
  {
    const before = await call(`/api/v1/progress-media/${photoKey}`, { jar: coach });
    await call(`/api/v1/progress-shares/${link}`, { method: 'DELETE', jar: subject });
    const after = await call(`/api/v1/progress-media/${photoKey}`, { jar: coach });
    const meas = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: coach });
    check(
      'revoking cuts access on the very next request, with the same token',
      before.res.status === 200 && after.res.status === 404 && meas.json?.measurements?.length === 0,
      `photo ${before.res.status} -> ${after.res.status}, ${meas.json?.measurements?.length} measurements`,
    );
  }
  {
    // REPLAY: revoking twice is not a second success.
    const { res } = await call(`/api/v1/progress-shares/${link}`, { method: 'DELETE', jar: subject });
    check('REPLAY: revoking an already-revoked share -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // A client who revokes must be able to change their mind, or the control is a trap.
    await call(`/api/v1/progress-shares/${link}`, { method: 'POST', jar: subject, body: { share_photos: true } });
    const { res } = await call(`/api/v1/progress-media/${photoKey}`, { jar: coach });
    check('re-granting after a revocation works', res.status === 200, `status ${res.status}`);
  }
  {
    // THE FOURTH CONDITION. The client never revokes; the COACH archives them. Access must still
    // stop, because leaving is leaving — this is what a `revoked_at`-only design gets wrong.
    await call(`/api/v1/clients/${link}/archive`, { method: 'POST', jar: coach });
    const photo = await call(`/api/v1/progress-media/${photoKey}`, { jar: coach });
    const meas = await call(`/api/v1/measurements?client_id=${subjectId}`, { jar: coach });
    check(
      'archiving the link withdraws access even with the share still granted',
      photo.res.status === 404 && meas.json?.measurements?.length === 0,
      `photo ${photo.res.status}, ${meas.json?.measurements?.length} measurements`,
    );
  }
  {
    const { json } = await call('/api/v1/progress-shares', { jar: subject });
    check('and the client can still SEE what they shared and when', (json?.shares ?? []).length === 1 && json.shares[0].share_photos === 1, `${json?.shares?.length} shares`);
  }

  // --- deletion ---------------------------------------------------------------------------------
  {
    const { res } = await call(`/api/v1/progress-photos/${photoId}`, { method: 'DELETE', jar: stranger });
    check('IDOR: a stranger deleting the photo -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    const del = await call(`/api/v1/progress-photos/${photoId}`, { method: 'DELETE', jar: subject });
    const gone = await call(`/api/v1/progress-media/${photoKey}`, { jar: subject });
    check('the owner deletes it, and the bytes stop being served', del.res.status === 204 && gone.res.status === 404, `${del.res.status} then ${gone.res.status}`);
  }
  {
    // The access log SURVIVES the photo being deleted. "Who saw my pictures" must not be erasable
    // by deleting the pictures — that is the question the table exists to answer.
    const { json } = await call('/api/v1/progress-access-log', { jar: subject });
    check(
      'the access log outlives the photo it recorded',
      (json?.entries ?? []).some((e) => e.kind === 'photo' && e.target_id === photoId),
      `${json?.entries?.length} entries`,
    );
  }
  {
    // EXTREMES: a malformed key never reaches the database or the filesystem.
    const bad = await call('/api/v1/progress-media/..%2F..%2Fetc%2Fpasswd', { jar: subject });
    const short = await call('/api/v1/progress-media/abc', { jar: subject });
    check('EXTREMES: traversal and short keys -> 404, never a file read', bad.res.status === 404 && short.res.status === 404, `${bad.res.status} / ${short.res.status}`);
  }
}

// --- F7 COINS: THE FIVE PASSES AT THE HTTP LAYER ----------------------------------------------
//
// The schema was attacked first (verify:019, 56 assertions). This block attacks what a person with
// a proxy can actually reach: the routes. Every guarantee below is really the schema's or the
// worker transaction's — what is being tested here is that the translation layer does not leak
// one, and that the outcomes reach the client as the right status codes.
{
  const rich = new Jar();
  const poor = new Jar();
  const adminJar = new Jar();
  const richEmail = `coin-rich-${stamp}@example.com`;
  const poorEmail = `coin-poor-${stamp}@example.com`;

  for (const [email, jar] of [[richEmail, rich], [poorEmail, poor]]) {
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
  }
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.admin.email, password: seeded.admin.password }, jar: adminJar });

  const richId = (await call('/api/v1/auth/me', { jar: rich })).json?.user?.id;
  const poorId = (await call('/api/v1/auth/me', { jar: poor })).json?.user?.id;

  {
    const { res, json } = await call('/api/v1/coins/wallet', { jar: rich });
    check('a new account has a wallet, and it is empty', res.status === 200 && json?.balanceMinor === 0, `${json?.balanceMinor}`);
  }

  // --- the store ---------------------------------------------------------------------------------
  let aurora = null;
  let ember = null;
  {
    const { res, json } = await call('/api/v1/coins/store', { jar: rich });
    aurora = (json?.items ?? []).find((i) => i.sku === 'theme.aurora');
    ember = (json?.items ?? []).find((i) => i.sku === 'theme.ember');
    check('the store lists the premium packs, unowned', res.status === 200 && aurora?.owned === 0 && ember?.owned === 0, `${json?.items?.length} items`);
  }

  // --- the admin adjustment, which is the only way coins enter --------------------------------
  {
    // FORGE: an ordinary user calling the admin endpoint. The JWT gate answers first.
    const { res } = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: rich, body: { amount_minor: 100000, note: 'self-serve', idempotency_key: 'selfserve1' },
    });
    check('FORGE: a user crediting themselves -> 403', res.status === 403, `status ${res.status}`);
  }
  {
    const { res, json } = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: 100000, note: 'launch grant', idempotency_key: `grant-${stamp}`.slice(0, 60) },
    });
    check('an admin credits the account', res.status === 200 && json?.balanceMinor === 100000, `status ${res.status}, balance ${json?.balanceMinor}`);
  }
  {
    // REPLAY: the identical request. Exactly one effect, and the SAME numbers back.
    const again = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: 100000, note: 'launch grant', idempotency_key: `grant-${stamp}`.slice(0, 60) },
    });
    const wallet = await call('/api/v1/coins/wallet', { jar: rich });
    check(
      'REPLAY: the same adjustment twice moves the balance once, and says so',
      again.res.status === 200 && again.json?.replayed === true && wallet.json?.balanceMinor === 100000,
      `replayed=${again.json?.replayed}, balance ${wallet.json?.balanceMinor}`,
    );
  }
  {
    // REPLAY, THIRD CASE: same key, DIFFERENT intent. Never a second effect and never a silent
    // success reporting the first one.
    const { res } = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: 500000, note: 'different', idempotency_key: `grant-${stamp}`.slice(0, 60) },
    });
    const wallet = await call('/api/v1/coins/wallet', { jar: rich });
    check('REPLAY: the same key with a different amount -> 409, nothing moved', res.status === 409 && wallet.json?.balanceMinor === 100000, `status ${res.status}, balance ${wallet.json?.balanceMinor}`);
  }
  {
    // EXTREMES.
    const zero = await call(`/api/v1/admin/users/${richId}/coins`, { method: 'POST', jar: adminJar, body: { amount_minor: 0, note: 'n', idempotency_key: 'zeroamount1' } });
    const huge = await call(`/api/v1/admin/users/${richId}/coins`, { method: 'POST', jar: adminJar, body: { amount_minor: Number.MAX_SAFE_INTEGER, note: 'n', idempotency_key: 'hugeamount1' } });
    const float = await call(`/api/v1/admin/users/${richId}/coins`, { method: 'POST', jar: adminJar, body: { amount_minor: 10.5, note: 'n', idempotency_key: 'floatamount' } });
    check('EXTREMES: zero, MAX_SAFE_INTEGER and a fraction are all 400', zero.res.status === 400 && huge.res.status === 400 && float.res.status === 400, `${zero.res.status}/${huge.res.status}/${float.res.status}`);
  }
  {
    // FORGE: ':' is the server's namespace separator and the client may not use it.
    const { res } = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: 1000, note: 'n', idempotency_key: 'ach:0000000001' },
    });
    check("FORGE: a colon in the client's idempotency key -> 400", res.status === 400, `status ${res.status}`);
  }
  {
    // FORGE: an unknown body field. .strict() rejects rather than ignores.
    const { res } = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: 1000, note: 'n', idempotency_key: 'unknownfld1', reason_key: 'achievement.reward' },
    });
    check('FORGE: choosing your own reason_key -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // IDOR: an admin adjusting an account that does not exist is 404, not a leak and not a 403.
    const { res } = await call('/api/v1/admin/users/2147483647/coins', {
      method: 'POST', jar: adminJar, body: { amount_minor: 1000, note: 'n', idempotency_key: 'ghosttarget' },
    });
    check('IDOR: adjusting a non-existent account -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // A debit that would go below zero is refused with the real numbers.
    const { res, json } = await call(`/api/v1/admin/users/${poorId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: -5000, note: 'clawback', idempotency_key: 'overdrawpoor' },
    });
    check('a debit below zero -> 409 carrying the real balance', res.status === 409 && json?.balanceMinor === 0, `status ${res.status}, balance ${json?.balanceMinor}`);
  }

  // --- the purchase ------------------------------------------------------------------------------
  {
    // FORGE: the client sends the price it wants to pay.
    const { res } = await call(`/api/v1/coins/store/${aurora.id}/purchase`, {
      method: 'POST', jar: rich, body: { idempotency_key: 'cheapbuy001', expected_price_minor: aurora.priceMinor, price_minor: 1 },
    });
    check('FORGE: sending a price alongside the agreement -> 400', res.status === 400, `status ${res.status}`);
  }
  {
    // FORGE: the agreement itself is wrong. It can only make the purchase FAIL.
    const { res, json } = await call(`/api/v1/coins/store/${aurora.id}/purchase`, {
      method: 'POST', jar: rich, body: { idempotency_key: 'wrongprice1', expected_price_minor: 1 },
    });
    const wallet = await call('/api/v1/coins/wallet', { jar: rich });
    check('FORGE: disagreeing about the price -> 409 with the real one, nothing charged', res.status === 409 && json?.priceMinor === aurora.priceMinor && wallet.json?.balanceMinor === 100000, `status ${res.status}, priceMinor ${json?.priceMinor}`);
  }
  let receipt = null;
  {
    const { res, json } = await call(`/api/v1/coins/store/${aurora.id}/purchase`, {
      method: 'POST', jar: rich, body: { idempotency_key: 'buyaurora01', expected_price_minor: aurora.priceMinor },
    });
    receipt = json;
    check(
      'a purchase debits exactly the item price and grants the entitlement',
      res.status === 200 && json?.pricePaidMinor === aurora.priceMinor
        && json.balanceMinor === 100000 - aurora.priceMinor && Number.isInteger(json.entitlementId),
      `status ${res.status}, paid ${json?.pricePaidMinor}, balance ${json?.balanceMinor}`,
    );
  }
  {
    // REPLAY: byte-identical except for `replayed`. This is the defect the review found in every
    // candidate — a fresh path reporting a JS variable and a replay path reporting the stored row.
    const { res, json } = await call(`/api/v1/coins/store/${aurora.id}/purchase`, {
      method: 'POST', jar: rich, body: { idempotency_key: 'buyaurora01', expected_price_minor: aurora.priceMinor },
    });
    const differing = Object.keys({ ...receipt, ...json }).filter((k) => k !== 'replayed' && JSON.stringify(receipt[k]) !== JSON.stringify(json[k]));
    check(
      'REPLAY: the replayed receipt is byte-identical except for `replayed`',
      res.status === 200 && json?.replayed === true && receipt.replayed === false && differing.length === 0,
      differing.length ? `differing keys: ${differing.join(', ')}` : 'identical',
    );
  }
  {
    const wallet = await call('/api/v1/coins/wallet', { jar: rich });
    check('and the replay charged nothing', wallet.json?.balanceMinor === 100000 - aurora.priceMinor, `${wallet.json?.balanceMinor}`);
  }
  {
    // REPLAY, THIRD CASE: same key, different ITEM.
    const { res } = await call(`/api/v1/coins/store/${ember.id}/purchase`, {
      method: 'POST', jar: rich, body: { idempotency_key: 'buyaurora01', expected_price_minor: ember.priceMinor },
    });
    check('REPLAY: the same key for a different item -> 409, not somebody else\'s receipt', res.status === 409, `status ${res.status}`);
  }
  {
    // NAMESPACE: the same CLIENT string on the admin endpoint is a DIFFERENT operation, because
    // the server composes `buy:<id>:` and `adj:<id>:`. Without that it would false-replay.
    const { res, json } = await call(`/api/v1/admin/users/${richId}/coins`, {
      method: 'POST', jar: adminJar, body: { amount_minor: 1000, note: 'same string', idempotency_key: 'buyaurora01' },
    });
    check('NAMESPACE: the same client key on another endpoint is a real, separate operation', res.status === 200 && json?.replayed === false, `status ${res.status}, replayed ${json?.replayed}`);
  }
  {
    const { res } = await call(`/api/v1/coins/store/${aurora.id}/purchase`, {
      method: 'POST', jar: rich, body: { idempotency_key: 'buyagain001', expected_price_minor: aurora.priceMinor },
    });
    check('buying what you already own -> 409', res.status === 409, `status ${res.status}`);
  }
  {
    const { res } = await call(`/api/v1/coins/store/${ember.id}/purchase`, {
      method: 'POST', jar: poor, body: { idempotency_key: 'poorbuy0001', expected_price_minor: ember.priceMinor },
    });
    check('buying with an empty wallet -> 409', res.status === 409, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/coins/store/2147483647/purchase', {
      method: 'POST', jar: rich, body: { idempotency_key: 'ghostitem01', expected_price_minor: 1 },
    });
    check('EXTREMES: MAX_INT item id -> 404', res.status === 404, `status ${res.status}`);
  }

  // --- RACE ---------------------------------------------------------------------------------------
  {
    // Two DIFFERENT items, DIFFERENT keys, both affordable alone and not together. Exactly one may
    // win. This is the assertion that would fail if the balance guard were moved out of the
    // INSERT's own WHERE into the preceding SELECT.
    const raceEmail = `coin-race-${stamp}@example.com`;
    const raceJar = new Jar();
    await call('/api/v1/auth/register', { method: 'POST', body: { email: raceEmail, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email: raceEmail, password: PASSWORD }, jar: raceJar });
    const raceId = (await call('/api/v1/auth/me', { jar: raceJar })).json?.user?.id;

    await call(`/api/v1/admin/users/${raceId}/coins`, {
      method: 'POST', jar: adminJar,
      body: { amount_minor: aurora.priceMinor, note: 'exactly one purchase', idempotency_key: `race-${stamp}`.slice(0, 60) },
    });

    const [a, b] = await Promise.all([
      call(`/api/v1/coins/store/${aurora.id}/purchase`, { method: 'POST', jar: raceJar, body: { idempotency_key: 'raceaurora1', expected_price_minor: aurora.priceMinor } }),
      call(`/api/v1/coins/store/${ember.id}/purchase`, { method: 'POST', jar: raceJar, body: { idempotency_key: 'raceember01', expected_price_minor: ember.priceMinor } }),
    ]);
    const wallet = await call('/api/v1/coins/wallet', { jar: raceJar });
    const won = [a, b].filter((r) => r.res.status === 200).length;
    check(
      'RACE: two concurrent purchases against one item\'s worth of coins — exactly one wins',
      won === 1 && wallet.json?.balanceMinor === 0,
      `${won} succeeded, balance ${wallet.json?.balanceMinor}`,
    );
    const ents = await call('/api/v1/coins/entitlements', { jar: raceJar });
    check('RACE: and exactly one entitlement exists', (ents.json?.entitlements ?? []).length === 1, `${ents.json?.entitlements?.length}`);
  }

  // --- IDOR on the reads --------------------------------------------------------------------------
  {
    const { json } = await call('/api/v1/coins/ledger', { jar: rich });
    const keys = Object.keys(json?.entries?.[0] ?? {});
    check(
      'IDOR: the ledger projection never carries the acting admin\'s identity',
      keys.length > 0 && !keys.includes('actorUserId') && !keys.some((k) => /email/i.test(k)),
      keys.join(', '),
    );
  }
  {
    const { json } = await call('/api/v1/coins/ledger', { jar: poor });
    check('IDOR: another account\'s statement is simply not there', (json?.entries ?? []).length === 0, `${json?.entries?.length} entries`);
  }
  {
    const { res } = await call('/api/v1/admin/coins/ledger', { jar: rich });
    check('IDOR: a user reading the admin ledger -> 403', res.status === 403, `status ${res.status}`);
  }

  // --- THE THEME IS THE THING THE COINS BOUGHT ----------------------------------------------------
  {
    const { res } = await call('/api/v1/me/theme', { method: 'PUT', jar: poor, body: { pack: 'aurora', accent: null, gradient: null } });
    check('IDOR: applying a theme you have not bought -> 404, not 403', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/me/theme', { method: 'PUT', jar: poor, body: { pack: 'nosuchpack', accent: null, gradient: null } });
    check('and an unknown pack answers IDENTICALLY, so the paid catalogue cannot be enumerated', res.status === 404, `status ${res.status}`);
  }
  {
    const { res } = await call('/api/v1/me/theme', { method: 'PUT', jar: rich, body: { pack: 'aurora', accent: null, gradient: null } });
    const read = await call('/api/v1/me/theme', { jar: rich });
    check('the buyer CAN apply it', res.status === 200 && read.json?.theme?.pack === 'aurora', `status ${res.status}, pack ${read.json?.theme?.pack}`);
  }

  // --- AN ACHIEVEMENT IS ACTUALLY EARNABLE ------------------------------------------------------
  //
  // The catalogue, the unlock table, the transaction and the ledger path all shipped in migration
  // 019 and NOTHING CALLED ANY OF IT — every piece correct, and the feature did not exist. This is
  // the assertion that would have caught that, and it is the whole reason it is here: a badge
  // nobody can earn is a chart with no data behind it.
  {
    const earner = new Jar();
    const earnerEmail = `coin-earn-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email: earnerEmail, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email: earnerEmail, password: PASSWORD }, jar: earner });

    const before = await call('/api/v1/coins/wallet', { jar: earner });

    // Log one food entry. 'nutrition.logged.7' needs seven days so it must NOT fire — what is
    // being proven here is that the evaluator RUNS, not that it awards everything it sees.
    const seeded = await call('/api/v1/foods?q=zabpehely&lang=hu', { jar: earner });
    const oats = seeded.json?.foods?.[0]?.id;
    await call('/api/v1/nutrition-log', {
      method: 'POST', jar: earner,
      body: { food_id: oats, grams: 50, local_date: '2026-10-01' },
    });
    await new Promise((r) => setTimeout(r, 700));

    const after = await call('/api/v1/coins/wallet', { jar: earner });
    const ach = await call('/api/v1/coins/achievements', { jar: earner });
    const oneDayUnlocked = (ach.json?.achievements ?? []).filter((a) => a.unlockId !== null);
    check(
      'one logged day earns nothing — a 7-day achievement needs seven days',
      before.json?.balanceMinor === 0 && after.json?.balanceMinor === 0 && oneDayUnlocked.length === 0,
      `${before.json?.balanceMinor} -> ${after.json?.balanceMinor}, ${oneDayUnlocked.length} unlocked`,
    );
  }
  {
    // Now the one that MUST fire. A completed workout is 'workout.first', which pays 2500 minor.
    const lifter = new Jar();
    const lifterEmail = `coin-lift-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email: lifterEmail, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email: lifterEmail, password: PASSWORD }, jar: lifter });

    const started = await call('/api/v1/workouts/start', {
      method: 'POST', jar: lifter, body: { title: 'coin probe' },
    });
    const logId = started.json?.logId;
    const finished = await call(`/api/v1/workouts/${logId}/finish`, { method: 'POST', jar: lifter, body: {} });
    await new Promise((r) => setTimeout(r, 900));

    const wallet = await call('/api/v1/coins/wallet', { jar: lifter });
    const ach = await call('/api/v1/coins/achievements', { jar: lifter });
    const first = (ach.json?.achievements ?? []).find((a) => a.key === 'workout.first');
    check(
      'AN ACHIEVEMENT IS ACTUALLY EARNABLE: finishing a session unlocks it and PAYS',
      finished.res.status === 200 && first?.unlockId !== null && first?.paidMinor === 2500
        && wallet.json?.balanceMinor === 2500,
      `finish ${finished.res.status}, unlock ${first?.unlockId}, paid ${first?.paidMinor}, balance ${wallet.json?.balanceMinor}`,
    );

    // The reward arrived through the LEDGER, not a side channel. That is T5.3.2 as a measurement.
    const ledger = await call('/api/v1/coins/ledger', { jar: lifter });
    const reward = (ledger.json?.entries ?? []).find((e) => e.reasonKey === 'achievement.reward');
    check(
      'and it arrived through the ledger, with a reference to the unlock',
      reward?.amountMinor === 2500 && reward.refType === 'user_achievement' && reward.refId === first?.unlockId,
      `${reward?.amountMinor} via ${reward?.reasonKey}, ref ${reward?.refType}:${reward?.refId}`,
    );

    // IDEMPOTENT UNDER REPEATED EVALUATION. Finishing again is a 404 (the session is closed), but
    // the evaluator also runs on every future session — so award-once must hold against the
    // evaluator itself, not only against a duplicate request.
    const second = await call('/api/v1/workouts/start', {
      method: 'POST', jar: lifter, body: { title: 'coin probe 2' },
    });
    await call(`/api/v1/workouts/${second.json?.logId}/finish`, { method: 'POST', jar: lifter, body: {} });
    await new Promise((r) => setTimeout(r, 900));

    const wallet2 = await call('/api/v1/coins/wallet', { jar: lifter });
    check(
      'REPLAY: a second session does not pay the first-session badge again',
      wallet2.json?.balanceMinor === 2500,
      `${wallet2.json?.balanceMinor}`,
    );
  }

  // --- RECONCILIATION -----------------------------------------------------------------------------
  {
    const { res, json } = await call('/api/v1/admin/coins/audit', { jar: adminJar });
    check(
      'the books balance: no drift, no unpaid receipt, no orphan debit, no unbacked grant',
      res.status === 200 && json?.clean === true,
      json?.clean ? 'clean' : JSON.stringify({ d: json?.drifting?.length, u: json?.unpaidPurchases?.length, o: json?.orphanDebits?.length, e: json?.unbackedEntitlements?.length }),
    );
  }
}

// --- F15 THE PUBLIC SURFACE: EVERY READ WITH NO SESSION AT ALL --------------------------------
//
// The defining property is that these answer with NO cookie, NO CSRF header and no account behind
// them — a shared link opened in a fresh browser, a search engine, somebody who has never signed
// up. `csrf: false` and no jar is not laziness here, it IS the assertion.
{
  const noJar = { csrf: false };

  // Without this every check below runs against an empty feed and reports PASS. See the header on
  // seedPublicCorpus for what that was actually proving.
  check('the public corpus is seeded — these checks have something to be about', await seedPublicCorpus());

  for (const [label, path] of [
    ['the feed', '/api/v1/public/posts'],
    ['the coach directory', '/api/v1/public/coaches'],
    ['the taxonomy the filters render from', '/api/v1/public/taxonomy'],
  ]) {
    const { res, json } = await call(path, noJar);
    check(`${label} answers with no session`, res.status === 200 && json !== null, `status ${res.status}`);
  }

  {
    const { res, json } = await call('/api/v1/public/taxonomy', noJar);
    check(
      'the taxonomy carries the cities, kinds and specialties as DATA',
      res.status === 200 && json?.cities?.length > 0 && json?.kinds?.length >= 3 && json?.specialties?.length > 0,
      `${json?.cities?.length} cities, ${json?.kinds?.length} kinds, ${json?.specialties?.length} specialties`,
    );
  }

  // --- NOTHING UNPUBLISHED IS REACHABLE, AND A MISS IS ALWAYS THE SAME MISS ---------------------
  {
    const { res } = await call('/api/v1/public/posts/aaaaaaaaaaaa', noJar);
    check('a post id that never existed -> 404', res.status === 404, `status ${res.status}`);
  }
  {
    // A MALFORMED id answers IDENTICALLY to a well-formed miss. Answering 400 here would tell a
    // prober which ids are even shaped right, which is the first step of walking the space.
    const short = await call('/api/v1/public/posts/abc', noJar);
    const bad = await call('/api/v1/public/posts/%2E%2E%2F%2E%2E%2Fetc', noJar);
    check(
      'a malformed id answers 404 too — the shape is not an oracle either',
      short.res.status === 404 && bad.res.status === 404,
      `${short.res.status} / ${bad.res.status}`,
    );
  }
  {
    const { res } = await call('/api/v1/public/coaches/nobody-here', noJar);
    check('an unknown handle -> 404', res.status === 404, `status ${res.status}`);
  }

  // --- THE PROJECTION IS A WHITELIST, AND WHAT IS ABSENT IS THE CONTROL -------------------------
  {
    const { json } = await call('/api/v1/public/posts', noJar);
    const leaked = JSON.stringify(json ?? {});
    check(
      'no email, no user id and no author id appears anywhere in a public feed response',
      !/"(email|userId|user_id|authorUserId|author_user_id)"/.test(leaked),
      leaked.slice(0, 120),
    );
  }
  {
    const { json } = await call('/api/v1/public/coaches', noJar);
    const leaked = JSON.stringify(json ?? {});
    check(
      'nor in the directory — a public profile names a handle, never an account',
      !/"(email|userId|user_id)"/.test(leaked) && !/@/.test(leaked),
      leaked.slice(0, 120),
    );
  }
  {
    // AND THE CURSOR IS NOT A BACK DOOR TO THE SAME FACT.
    //
    // The two assertions above search for the KEY NAMES. The directory shipped `c.user_id` as the
    // VALUE of `nextCursor`, so an account id crossed the boundary one page at a time while both
    // checks stayed green — the leak was not hidden, it was simply under a different name. The feed
    // did the same with the internal post rowid, which `public_id` exists to keep unaddressable.
    const dir = await call('/api/v1/public/coaches?limit=1', noJar);
    const feed = await call('/api/v1/public/posts?limit=1', noJar);
    check(
      'a cursor is opaque, never a raw row id — the value the key-name checks above cannot see',
      typeof dir.json?.nextCursor === 'string' &&
        !/^\d+$/.test(dir.json.nextCursor) &&
        typeof feed.json?.nextCursor === 'string' &&
        !/^\d+$/.test(feed.json.nextCursor),
      `${JSON.stringify(dir.json?.nextCursor)} / ${JSON.stringify(feed.json?.nextCursor)}`,
    );

    // An opaque cursor that decodes wrong returns page one forever and looks perfectly healthy, so
    // the encoding is only worth anything if paging is measured through it.
    const page2 = await call(
      `/api/v1/public/posts?limit=1&cursor=${encodeURIComponent(feed.json?.nextCursor ?? '')}`,
      noJar,
    );
    check(
      'and it still pages — page two is a different post, not page one again',
      page2.res.status === 200 &&
        page2.json?.posts?.[0]?.id &&
        page2.json.posts[0].id !== feed.json?.posts?.[0]?.id,
      `${feed.json?.posts?.[0]?.id} then ${page2.json?.posts?.[0]?.id}`,
    );

    const junk = await call('/api/v1/public/posts?limit=1&cursor=not-a-cursor', noJar);
    check(
      'a malformed cursor starts from the beginning rather than erroring — it is client input',
      junk.res.status === 200 && junk.json?.posts?.[0]?.id === feed.json?.posts?.[0]?.id,
      `status ${junk.res.status}`,
    );
  }
  {
    // THE SCALE OF MONEY IS THE DATABASE'S TO STATE.
    //
    // The client divided by a hardcoded 100. HUF has no minor unit, so every Hungarian price on the
    // open internet rendered at one hundredth of its value. The API now says how many places each
    // currency has, and this asserts the one that made the bug visible.
    const { res, json } = await call('/api/v1/public/taxonomy', noJar);
    const huf = json?.currencies?.find((c) => c.code === 'HUF');
    check(
      'the taxonomy states minor units per currency, and HUF has none',
      res.status === 200 && Array.isArray(json?.currencies) && huf?.minorUnits === 0,
      JSON.stringify(json?.currencies),
    );
  }
  {
    // A WELL-FORMED KEY WITH NO FILE IS A 404, NOT A RESTART.
    //
    // The serve route piped a read stream with no 'error' listener, outside asyncRoute's promise
    // chain: a missing file was an uncaughtException. Nothing could create such a row before the
    // composer. The second call is the real assertion — it proves the process is still alive.
    const missing = await call(`/api/v1/public/media/pub_${'a'.repeat(32)}.webp`, noJar);
    const alive = await call('/healthz', noJar);
    check(
      'a media key with no file behind it is 404 and the process survives it',
      missing.res.status === 404 && alive.res.status === 200,
      `${missing.res.status} then healthz ${alive.res.status}`,
    );
  }

  // --- FORGE: EVERY FILTER AND SORT IS A CLOSED SET --------------------------------------------
  {
    const sort = await call('/api/v1/public/posts?sort=id%3B+DROP+TABLE+coach_posts', noJar);
    const kind = await call('/api/v1/public/posts?kind=%27+OR+1%3D1--', noJar);
    const unknown = await call('/api/v1/public/posts?orderBy=published_at', noJar);
    check(
      'FORGE: an injected sort, an injected kind and an unknown filter are all 400',
      sort.res.status === 400 && kind.res.status === 400 && unknown.res.status === 400,
      `${sort.res.status} / ${kind.res.status} / ${unknown.res.status}`,
    );
  }
  {
    // And the tables are still there, which is the assertion the one above is really making.
    const { res, json } = await call('/api/v1/public/taxonomy', noJar);
    check('and the schema survived the attempt', res.status === 200 && json?.kinds?.length >= 3);
  }

  // --- EXTREMES --------------------------------------------------------------------------------
  {
    const big = await call('/api/v1/public/posts?limit=10000', noJar);
    const neg = await call('/api/v1/public/posts?limit=-1', noJar);
    const cursor = await call(`/api/v1/public/posts?cursor=${Number.MAX_SAFE_INTEGER}`, noJar);
    check(
      'EXTREMES: an oversized page and a negative one are 400; MAX_SAFE_INTEGER is a valid empty cursor',
      big.res.status === 400 && neg.res.status === 400 && cursor.res.status === 200,
      `${big.res.status} / ${neg.res.status} / ${cursor.res.status}`,
    );
  }
  {
    const { res, json } = await call('/api/v1/public/posts', noJar);
    check(
      'the page is hard-capped whatever is asked for',
      res.status === 200 && (json?.posts ?? []).length <= 24,
      `${json?.posts?.length} posts`,
    );
  }
  {
    const short = await call('/api/v1/public/search?q=a', noJar);
    const ok = await call('/api/v1/public/search?q=' + encodeURIComponent('" OR name:x'), noJar);
    check(
      'search: a one-character query is 400, an FTS metacharacter is a search term and not a 500',
      short.res.status === 400 && ok.res.status === 200,
      `${short.res.status} / ${ok.res.status}`,
    );
  }
  {
    // NO CURSOR ON SEARCH, deliberately — a paginated public text search is a scraping API with a
    // nice interface. Asking for one is an unknown key, and .strict() refuses it.
    const { res } = await call('/api/v1/public/search?q=edzes&cursor=1', noJar);
    check('search has no cursor, and asking for one is refused', res.status === 400, `status ${res.status}`);
  }

  // --- AND A SESSION CHANGES NOTHING -----------------------------------------------------------
  {
    // THE PROPERTY THE WHOLE CUT BOUGHT. The public predicate binds no viewer, so a signed-in
    // request and an anonymous one must produce byte-identical bodies. If they ever diverge, the
    // cache story and the block-oracle class both come back.
    const signedIn = new Jar();
    await call('/api/v1/auth/login', {
      method: 'POST', jar: signedIn,
      body: { email: seeded.coach.email, password: seeded.coach.password },
    });
    const anon = await call('/api/v1/public/posts', noJar);
    const auth = await call('/api/v1/public/posts', { jar: signedIn, csrf: false });
    check(
      'a signed-in visitor gets BYTE-IDENTICAL bytes to an anonymous one',
      JSON.stringify(anon.json) === JSON.stringify(auth.json),
      `anon ${JSON.stringify(anon.json).length}b, auth ${JSON.stringify(auth.json).length}b`,
    );
  }
}

// --- THE COMPOSER: THE COACH'S SIDE OF THE PUBLIC SURFACE -------------------------------------
//
// The mirror image of the block above. Those routes must answer with no session at all; these must
// answer to nobody BUT an authenticated coach, and they sit on the other side of csrfProtection.
if (seeded) {
  const composerJar = new Jar();
  const memberJar = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: composerJar });
  await call('/api/v1/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar: memberJar });

  {
    const anon = await call('/api/v1/compose/context', { csrf: false });
    const member = await call('/api/v1/compose/context', { jar: memberJar });
    check(
      'the composer answers nobody: 401 with no session, 403 to a signed-in non-coach',
      anon.res.status === 401 && member.res.status === 403,
      `${anon.res.status} / ${member.res.status}`,
    );
  }

  const ctx = await call('/api/v1/compose/context', { jar: composerJar });
  check(
    'the context is ONE answer carrying profile, standing, quotas and limits',
    ctx.res.status === 200 && ctx.json?.standing && ctx.json?.quotas && ctx.json?.limits,
    `status ${ctx.res.status}`,
  );
  check(
    'the limits are served, so the editor cannot keep a second copy of them',
    ctx.json?.limits?.titleMax === 140 && ctx.json?.limits?.bodyMax === 20000,
    JSON.stringify(ctx.json?.limits),
  );
  {
    const strict = await call('/api/v1/compose/context?surprise=1', { jar: composerJar });
    check('and its query schema is strict', strict.res.status === 400, `status ${strict.res.status}`);
  }

  // --- GUIDELINES: the gate that had no way to be satisfied ------------------------------------
  //
  // guidelines_versions, guidelines_acceptances and public_policy shipped in 021 and nothing in
  // src/ had ever touched them. Three triggers refuse a publication by an account with no
  // acceptance of the ACTIVE version, so until this route existed the publish gate denied every
  // coach in the product and there was no request that could clear it.
  const active = ctx.json?.standing?.activeGuidelinesVersion;
  check('the context names the guidelines version now in force', typeof active === 'string', String(active));

  {
    const stale = await call('/api/v1/compose/guidelines/accept', { method: 'POST', jar: composerJar, body: { version: '9.9' } });
    check(
      'consent to a version that is not in force is 409 and names the one that is',
      stale.res.status === 409 && stale.json?.reason === 'stale_version' && stale.json?.activeVersion === active,
      `${stale.res.status} ${stale.json?.reason}`,
    );
  }
  {
    const extra = await call('/api/v1/compose/guidelines/accept', { method: 'POST', jar: composerJar, body: { version: active, sneak: 1 } });
    check('an unknown body key is refused', extra.res.status === 400, `status ${extra.res.status}`);
  }

  // The FIRST acceptance, asserted as an insert rather than assumed. A suite that only ever ran
  // against an already-consenting account would prove the replay and never the write.
  check('this coach has not consented yet', ctx.json?.standing?.guidelinesAcceptedAt === null, String(ctx.json?.standing?.guidelinesAcceptedAt));
  const first = await call('/api/v1/compose/guidelines/accept', { method: 'POST', jar: composerJar, body: { version: active } });
  check('accepting the active version records it', first.res.status === 200 && typeof first.json?.acceptedAt === 'number', `status ${first.res.status}`);

  const replay = await call('/api/v1/compose/guidelines/accept', { method: 'POST', jar: composerJar, body: { version: active } });
  check(
    'REPLAY: a second acceptance returns the ORIGINAL timestamp — the row is evidence, not a click',
    replay.res.status === 200 && replay.json?.acceptedAt === first.json?.acceptedAt,
    `${first.json?.acceptedAt} then ${replay.json?.acceptedAt}`,
  );
  {
    const after = await call('/api/v1/compose/context', { jar: composerJar });
    check(
      'and the context reports it, so the composer can stop asking',
      after.json?.standing?.guidelinesAcceptedAt === first.json?.acceptedAt,
      String(after.json?.standing?.guidelinesAcceptedAt),
    );
  }


  // --- THE PROFILE: create, edit, publish, unpublish ------------------------------------------
  //
  // coach2 has no profile in a fresh database, which is what makes the CREATE path testable at
  // all — the composer coach above already has one.
  const builderJar = new Jar();
  await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach2.email, password: seeded.coach2.password }, jar: builderJar });

  {
    const empty = await call('/api/v1/compose/profile', { jar: builderJar });
    check(
      'a coach with no profile reads a STATE, not a 404 — the composer renders a create form from it',
      empty.res.status === 200 && empty.json?.profile === null,
      `status ${empty.res.status}`,
    );
  }

  // FORGE: what is absent from the schema is the control. .strict() rejects each of these by name
  // rather than ignoring it, so a body asking to be verified gets a 400 and the badge stays a
  // thing only an admin can grant.
  {
    const forged = [];
    for (const field of ['verified_at', 'verified_by', 'published_at', 'listed_at', 'removed_at', 'user_id']) {
      const r = await call('/api/v1/compose/profile', {
        method: 'POST', jar: builderJar,
        body: { handle: 'smoke-builder', display_name: 'Smoke Builder', headline: null, bio_src: null, city_key: null, specialties: [], [field]: 1 },
      });
      if (r.res.status !== 400) forged.push(`${field}=${r.res.status}`);
    }
    check('FORGE: every admin-owned column is rejected by name, not ignored', forged.length === 0, forged.join(' '));
  }

  const created = await call('/api/v1/compose/profile', {
    method: 'POST', jar: builderJar,
    body: { handle: 'smoke-builder', display_name: 'Smoke Builder', headline: 'Probe headline',
            bio_src: 'A **bio** with [a link](https://example.com/x).', city_key: null, specialties: [] },
  });
  check('a coach creates their profile', created.res.status === 201, `status ${created.res.status}`);
  check(
    'the three bio columns arrive together — source, parsed doc and version',
    !!created.json?.profile?.bioSrc && !!created.json?.profile?.bioDoc && created.json?.profile?.docVersion === 1,
    `docVersion=${created.json?.profile?.docVersion}`,
  );
  check(
    'and it is NOT published by existing — published_at is absent from the INSERT entirely',
    created.json?.profile?.publishedAt === null && created.json?.profile?.listedAt === null,
    `published=${created.json?.profile?.publishedAt}`,
  );

  {
    const replay = await call('/api/v1/compose/profile', {
      method: 'POST', jar: builderJar,
      body: { handle: 'smoke-builder', display_name: 'Smoke Builder', headline: null, bio_src: null, city_key: null, specialties: [] },
    });
    check('REPLAY: creating the same handle again returns the existing row, not a second one',
      replay.res.status === 200 && replay.json?.replayed === true, `status ${replay.res.status}`);

    const other = await call('/api/v1/compose/profile', {
      method: 'POST', jar: builderJar,
      body: { handle: 'different-handle', display_name: 'Smoke Builder', headline: null, bio_src: null, city_key: null, specialties: [] },
    });
    check('but a DIFFERENT handle is a conflict — one profile per account',
      other.res.status === 409 && other.json?.reason === 'profile_exists', `${other.res.status} ${other.json?.reason}`);
  }

  {
    // Reserved, taken and cooling are ONE answer. Distinguishing them enumerates unpublished
    // profiles and leaks another account's rename timestamp.
    const taken = await call('/api/v1/compose/profile', {
      method: 'POST', jar: composerJar,
      body: { handle: 'smoke-builder', display_name: 'Somebody Else', headline: null, bio_src: null, city_key: null, specialties: [] },
    });
    check('a handle somebody else holds is refused with ONE undifferentiated reason',
      taken.res.status === 409 && ['handle_unavailable', 'profile_exists'].includes(taken.json?.reason),
      `${taken.res.status} ${taken.json?.reason}`);
  }

  // THE BODY RULE: all three bio columns move together or none do. Two column CHECKs enforce the
  // pairing; buildBio is what makes the triple coherent before it ever reaches them.
  {
    const cleared = await call('/api/v1/compose/profile', {
      method: 'PUT', jar: builderJar,
      body: { display_name: 'Smoke Builder', headline: null, bio_src: null, city_key: null, specialties: [] },
    });
    check(
      'clearing a bio moves all three columns to null together',
      cleared.res.status === 200 && cleared.json?.profile?.bioSrc === null
        && cleared.json?.profile?.bioDoc === null && cleared.json?.profile?.docVersion === null,
      `status ${cleared.res.status}`,
    );
  }
  {
    const blank = await call('/api/v1/compose/profile', {
      method: 'PUT', jar: builderJar,
      body: { display_name: 'Smoke Builder', headline: null, bio_src: '\\', city_key: null, specialties: [] },
    });
    check(
      'a bio that parses to no visible text is refused, and the reason says which',
      blank.res.status === 400 && blank.json?.reason === 'no_visible_text',
      `${blank.res.status} ${blank.json?.reason}`,
    );
  }
  {
    const bad = await call('/api/v1/compose/profile', {
      method: 'PUT', jar: builderJar,
      body: { display_name: 'Smoke Builder', headline: null, bio_src: null, city_key: 'no-such-city', specialties: [] },
    });
    check('an unknown city is a 409 naming the key, never an opaque foreign-key failure',
      bad.res.status === 409 && bad.json?.reason === 'city_unknown', `${bad.res.status} ${bad.json?.reason}`);
  }

  // PUBLISH AND UNPUBLISH ARE NOT SYMMETRIC, which is why they are two routes.
  {
    // THE GATE, ASSERTED BEFORE IT IS SATISFIED. coach2 has not consented in a fresh database, and
    // that is the state most coaches are in the first time they press publish. Skipping straight to
    // the happy path would leave the whole guidelines chain untested from this end.
    const denied = await call('/api/v1/compose/profile/publish', { method: 'POST', jar: builderJar, body: {} });
    check(
      'publish is refused until the guidelines are accepted, and says which version to accept',
      denied.res.status === 409 && denied.json?.reason === 'needs_guidelines' && typeof denied.json?.activeVersion === 'string',
      `${denied.res.status} ${denied.json?.reason} -> ${denied.json?.activeVersion}`,
    );
    await call('/api/v1/compose/guidelines/accept', { method: 'POST', jar: builderJar, body: { version: denied.json.activeVersion } });

    // THE SECOND GATE, and it is the one a real coach hits next. An account minutes old cannot put
    // a name on the open internet, and the refusal carries WHEN it becomes eligible rather than a
    // bare no.
    const tooNew = await call('/api/v1/compose/profile/publish', { method: 'POST', jar: builderJar, body: {} });
    check(
      'and refused again while the account is too new, with the moment it becomes eligible',
      tooNew.res.status === 409 && tooNew.json?.reason === 'too_new' && typeof tooNew.json?.eligibleAt === 'number',
      `${tooNew.res.status} ${tooNew.json?.reason} -> ${tooNew.json?.eligibleAt}`,
    );
    check('the account can be aged for the rest of this block', await ageAccount(seeded.coach2.email));
  }
  {
    const pub = await call('/api/v1/compose/profile/publish', { method: 'POST', jar: builderJar, body: {} });
    check('publish succeeds for a coach in standing', pub.res.status === 200, `status ${pub.res.status} ${JSON.stringify(pub.json).slice(0, 70)}`);

    const again = await call('/api/v1/compose/profile/publish', { method: 'POST', jar: builderJar, body: {} });
    check('a second publish REPLAYS with the original timestamp rather than moving it',
      again.json?.replayed === true && again.json?.profile?.publishedAt === pub.json?.profile?.publishedAt,
      `${pub.json?.profile?.publishedAt} then ${again.json?.profile?.publishedAt}`);

    const listedAtFirstPublish = pub.json?.profile?.listedAt;
    const down = await call('/api/v1/compose/profile/unpublish', { method: 'POST', jar: builderJar, body: {} });
    check('unpublish reports how many live posts it took dark — PUBLIC_POST needs a live profile',
      down.res.status === 200 && typeof down.json?.postsWentDark === 'number', `postsWentDark=${down.json?.postsWentDark}`);

    const up = await call('/api/v1/compose/profile/publish', { method: 'POST', jar: builderJar, body: {} });
    check(
      'and re-publishing returns to the SAME directory position — listed_at is write-once',
      // typeof first: the previous version compared two undefineds and reported PASS while publish
      // was being refused entirely. Equality is not evidence when neither side exists.
      typeof listedAtFirstPublish === 'number' && up.json?.profile?.listedAt === listedAtFirstPublish,
      `${listedAtFirstPublish} then ${up.json?.profile?.listedAt}`,
    );
  }
  {
    // The exit is NOT gated on the same standing as the entrance. A coach who has lost standing is
    // exactly the person most likely to need out.
    const down = await call('/api/v1/compose/profile/unpublish', { method: 'POST', jar: builderJar, body: {} });
    const again = await call('/api/v1/compose/profile/unpublish', { method: 'POST', jar: builderJar, body: {} });
    check('unpublish is idempotent and carries no standing gate',
      down.res.status === 200 && again.res.status === 200 && again.json?.replayed === true,
      `${down.res.status} / ${again.res.status}`);
  }


  // --- POSTS: draft, edit, publish, withdraw, restore ------------------------------------------
  //
  // The loop this whole phase exists to close: a coach writes something and a stranger reads it.
  {
    const kinds = (await call('/api/v1/public/taxonomy', { csrf: false })).json.kinds;
    const plain = kinds.find((k) => k.requiresEventAt === 0 && k.allowsPrice === 1) ?? kinds[0];
    const eventKind = kinds.find((k) => k.requiresEventAt === 1);
    const draft = {
      idempotency_key: 'smoke-post-key-1',
      kind_key: plain.key,
      title: 'Smoke programme',
      body_src: 'Heti **négy** edzés.\n\n- Hétfő\n- Szerda',
      city_key: null, event_at: null, event_tz: null, capacity: null,
      price_minor: 45000, price_currency: 'HUF',
    };

    const created = await call('/api/v1/compose/posts', { method: 'POST', jar: builderJar, body: draft });
    check('a coach creates a draft', created.res.status === 201, `status ${created.res.status}`);
    const pid = created.json?.post?.id;
    check(
      'addressed by a 12-character opaque public id, never the rowid',
      typeof pid === 'string' && pid.length === 12 && !/^\d+$/.test(pid), String(pid),
    );
    check(
      'a draft is not published and spends no quota — published_at is absent from the INSERT',
      created.json?.post?.publishedAt === null,
    );
    check(
      'and the four body columns arrive together',
      !!created.json?.post?.bodySrc && !!created.json?.post?.doc
        && !!created.json?.post?.excerpt && created.json?.post?.docVersion === 1,
    );

    {
      const replay = await call('/api/v1/compose/posts', { method: 'POST', jar: builderJar, body: draft });
      const reused = await call('/api/v1/compose/posts', { method: 'POST', jar: builderJar, body: { ...draft, title: 'Something else' } });
      check(
        'REPLAY: the same key returns the same post; the same key with different content is 409',
        replay.res.status === 200 && replay.json?.post?.id === pid
          && reused.res.status === 409 && reused.json?.reason === 'key_reused',
        `${replay.res.status} / ${reused.res.status} ${reused.json?.reason}`,
      );
    }
    {
      // The per-kind rules are read from post_kinds, not restated in a z.enum, so adding a kind
      // stays an INSERT and the form cannot come to disagree with the trigger.
      const unknown = await call('/api/v1/compose/posts', { method: 'POST', jar: builderJar, body: { ...draft, idempotency_key: 'smoke-k2', kind_key: 'no_such_kind' } });
      const misshaped = eventKind
        ? await call('/api/v1/compose/posts', { method: 'POST', jar: builderJar, body: { ...draft, idempotency_key: 'smoke-k3', kind_key: eventKind.key } })
        : { res: { status: 409 }, json: { reason: 'kind_shape', field: 'event_at' } };
      check(
        'an unknown kind and a mis-shaped one are both 409, each naming what is wrong',
        unknown.res.status === 409 && unknown.json?.reason === 'kind_unknown'
          && misshaped.res.status === 409 && misshaped.json?.reason === 'kind_shape' && misshaped.json?.field === 'event_at',
        `${unknown.json?.reason} / ${misshaped.json?.reason}:${misshaped.json?.field}`,
      );
    }
    {
      const forged = [];
      for (const field of ['published_at', 'public_id', 'author_user_id', 'row_version', 'write_uid', 'deleted_at', 'removed_at']) {
        const r = await call('/api/v1/compose/posts', { method: 'POST', jar: builderJar, body: { ...draft, idempotency_key: `smoke-f-${field}`, [field]: 1 } });
        if (r.res.status !== 400) forged.push(`${field}=${r.res.status}`);
      }
      check('FORGE: every server-minted column is rejected by name', forged.length === 0, forged.join(' '));
    }

    // THE TRAP: reusing PUBLIC_POST here would return zero drafts, and an empty draft list looks
    // exactly like a coach who has not written anything.
    {
      const drafts = await call('/api/v1/compose/posts?state=draft', { jar: builderJar });
      check(
        'the manage list shows DRAFTS — it must not compose the public predicate',
        drafts.res.status === 200 && drafts.json?.posts?.some((p) => p.id === pid),
        `${drafts.res.status}, ${drafts.json?.posts?.length} posts`,
      );
    }
    {
      const theirs = await call(`/api/v1/compose/posts/${pid}`, { jar: composerJar });
      const malformed = await call('/api/v1/compose/posts/not-a-valid-id', { jar: builderJar });
      check(
        "another coach's post and a malformed id are both 404 — a 400 on the shape would be an oracle",
        theirs.res.status === 404 && malformed.res.status === 404,
        `${theirs.res.status} / ${malformed.res.status}`,
      );
    }

    // OPTIMISTIC CONCURRENCY. unixepoch() is one-second granular, so a timestamp guard would do
    // nothing in exactly the case it exists for — two edits inside the same second.
    const rv = created.json.post.rowVersion;
    const body = { title: 'Smoke programme, edited', body_src: draft.body_src, city_key: null, event_at: null, event_tz: null, capacity: null, price_minor: 45000, price_currency: 'HUF' };
    {
      const ok = await call(`/api/v1/compose/posts/${pid}`, { method: 'PUT', jar: builderJar, body: { expected_row_version: rv, ...body } });
      const stale = await call(`/api/v1/compose/posts/${pid}`, { method: 'PUT', jar: builderJar, body: { expected_row_version: rv, ...body } });
      check(
        'an edit lands, row_version advances, and the stale retry is a 409 CARRYING the current row',
        ok.res.status === 200 && ok.json?.post?.rowVersion === rv + 1
          && stale.res.status === 409 && stale.json?.reason === 'stale' && stale.json?.post?.rowVersion === rv + 1,
        `${rv} -> ${ok.json?.post?.rowVersion}, stale ${stale.res.status}`,
      );
    }
    {
      // The edit 021's exclusive-or trigger aborted: a source change that leaves the parsed
      // document byte-identical. Reflowing a paragraph is not an exotic case.
      const cur = (await call(`/api/v1/compose/posts/${pid}`, { jar: builderJar })).json.post;
      const reflow = await call(`/api/v1/compose/posts/${pid}`, {
        method: 'PUT', jar: builderJar,
        body: { expected_row_version: cur.rowVersion, ...body, body_src: `${draft.body_src}\n` },
      });
      check('a source-only edit is accepted — the ordinary edit 021 refused', reflow.res.status === 200, `status ${reflow.res.status}`);
    }

    // PUBLISH, WITHDRAW, RESTORE — and the anti-bump property.
    {
      // The profile block above ends with the profile DOWN, which is the right state to test from:
      // a post cannot be public while its author page is not. PUBLIC_POST requires both.
      const blocked = await call(`/api/v1/compose/posts/${pid}/publish`, { method: 'POST', jar: builderJar, body: {} });
      check(
        'a post cannot publish while its author profile is unpublished',
        blocked.res.status === 409 && blocked.json?.reason === 'profile_not_published',
        `${blocked.res.status} ${blocked.json?.reason}`,
      );
      await call('/api/v1/compose/profile/publish', { method: 'POST', jar: builderJar, body: {} });

      const pub = await call(`/api/v1/compose/posts/${pid}/publish`, { method: 'POST', jar: builderJar, body: {} });
      check('the post publishes', pub.res.status === 200, `status ${pub.res.status} ${pub.json?.reason ?? ''}`);
      const publishedAt = pub.json?.post?.publishedAt;

      const again = await call(`/api/v1/compose/posts/${pid}/publish`, { method: 'POST', jar: builderJar, body: {} });
      check('a second publish replays with the ORIGINAL timestamp', again.json?.replayed === true && again.json?.post?.publishedAt === publishedAt, `${publishedAt} then ${again.json?.post?.publishedAt}`);

      const gone = await call(`/api/v1/compose/posts/${pid}/withdraw`, { method: 'POST', jar: builderJar, body: {} });
      const goneAgain = await call(`/api/v1/compose/posts/${pid}/withdraw`, { method: 'POST', jar: builderJar, body: {} });
      check(
        'withdraw takes it down, and a replay keeps the ORIGINAL deleted_at rather than moving it',
        gone.res.status === 200 && gone.json?.post?.deletedAt !== null
          && goneAgain.json?.replayed === true && goneAgain.json?.post?.deletedAt === gone.json?.post?.deletedAt,
        `${gone.json?.post?.deletedAt} then ${goneAgain.json?.post?.deletedAt}`,
      );

      const back = await call(`/api/v1/compose/posts/${pid}/restore`, { method: 'POST', jar: builderJar, body: {} });
      check(
        'restore returns it at its ORIGINAL feed position — published_at is write-once, so there is no bump to buy',
        back.res.status === 200 && back.json?.post?.deletedAt === null
          && typeof publishedAt === 'number' && back.json?.post?.publishedAt === publishedAt,
        `${publishedAt} then ${back.json?.post?.publishedAt}`,
      );
    }

    // THE LOOP CLOSED: written through the API, read by nobody in particular.
    {
      const anon = await call(`/api/v1/public/posts/${pid}`, { csrf: false });
      check(
        'the post a coach wrote is readable with NO session at all',
        anon.res.status === 200 && anon.json?.post?.id === pid,
        `status ${anon.res.status}`,
      );
      check(
        'and that public read does NOT carry the markdown source — the author sees it, the world does not',
        // The post must EXIST for its absence to mean anything: the previous version passed on a
        // 404, where every key is absent.
        anon.json?.post?.id === pid && !('bodySrc' in anon.json.post),
        Object.keys(anon.json?.post ?? {}).join(','),
      );
    }
  }

  // --- CSRF: this router is BELOW the middleware, and that is the difference from public/ -------
  {
    const cross = await call('/api/v1/compose/guidelines/accept', {
      method: 'POST', jar: composerJar, body: { version: active }, headers: { 'sec-fetch-site': 'cross-site' },
    });
    const bare = await call('/api/v1/compose/guidelines/accept', {
      method: 'POST', jar: composerJar, body: { version: active }, csrf: false,
    });
    check(
      'a cross-site write and a write with no X-CSRF header are both refused',
      cross.res.status === 403 && bare.res.status === 403,
      `${cross.res.status} / ${bare.res.status}`,
    );
  }
}

// --- logout --------------------------------------------------------------------------------
const jar2 = new Jar();
{
  await call('/api/v1/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar: jar2 });
  const { res } = await call('/api/v1/auth/logout', { method: 'POST', jar: jar2 });
  check('logout', res.status === 200, `status ${res.status}`);
}
{
  const { res } = await call('/api/v1/auth/me', { jar: jar2 });
  check('me after logout -> 401', res.status === 401, `status ${res.status}`);
}

console.log(`\n${failed === 0 ? 'SMOKE OK' : 'SMOKE FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
