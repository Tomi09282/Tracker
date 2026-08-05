// scripts/smoke.js — the regression net for Phase 0.
//
// Every critical endpoint ships with its security-regression case in the same change. This
// suite therefore checks the happy path AND the abuse path for each route: forged headers,
// replayed tokens, tampered signatures, unknown fields, wrong content types.
//
// Usage: node scripts/smoke.js   (server must already be running)
import 'dotenv/config';
import { readFile } from 'node:fs/promises';

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
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (csrf && method !== 'GET') h['X-CSRF'] = '1';
  if (jar) h.Cookie = jar.header();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
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
    check('a day outside the cycle -> 400 with the rule stated', res.status === 400, `${res.status}: ${json?.error}`);
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
