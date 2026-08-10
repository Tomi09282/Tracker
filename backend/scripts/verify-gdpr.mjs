/**
 * verify-gdpr — export and erase a real account, through HTTP, the way a person would.
 *
 * The account is created for this and is gone by the end, which is the point: an erasure route that
 * has never erased anybody is a route nobody has watched work. It leaves TWO audit rows behind, both
 * anonymous, and that is not litter — it is the artefact 018 exists to guarantee.
 *
 * Needs the server running. Run: npm run verify:gdpr
 */
import 'dotenv/config';
import argon2 from 'argon2';

const BASE = 'http://localhost:3000/api/v1';
const PASSWORD = 'GdprProbe123x';
const EMAIL = `gdpr-probe-${Date.now()}@example.com`;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

let jar = '';
const call = async (path, init = {}) => {
  const headers = { 'x-csrf': '1', 'sec-fetch-site': 'same-origin', ...(jar ? { cookie: jar } : {}) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const m = new Map((jar ? jar.split('; ') : []).map((c) => [c.split('=')[0], c]));
    for (const c of set) m.set(c.split('=')[0], c.split(';')[0]);
    jar = [...m.values()].join('; ');
  }
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* not json */ }
  return { status: r.status, json, text, headers: r.headers };
};

const db = await import('../src/db/index.js');

/* ── a person, with data ─────────────────────────────────────────────────────────────────────── */

const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
await db.run("INSERT INTO users (email, password_hash, role, must_change_credentials) VALUES (?, ?, 'user', 0)", [EMAIL, hash]);
const [me] = await db.all('SELECT id FROM users WHERE email = ?', [EMAIL]);

// Health data, which is the special category this whole surface exists for.
await db.run(
  "INSERT INTO body_measurements (client_user_id, metric_key, value_x1000, measured_on) VALUES (?, 'body_fat', 18500, date('now'))",
  [me.id],
);
await db.run("INSERT INTO user_theme_prefs (user_id, pack) VALUES (?, 'midnight')", [me.id]);

const erasesBefore = (await db.all("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.erase' AND target_id = ?", [me.id]))[0].n;
const exportsBefore = (await db.all("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.export' AND target_id = ?", [me.id]))[0].n;

await call('/auth/login', { method: 'POST', json: { email: EMAIL, password: PASSWORD } });

/* ── export ──────────────────────────────────────────────────────────────────────────────────── */

{
  const r = await call('/me/export');
  check('the export answers 200', r.status === 200, `status ${r.status}`);
  check(
    'as a download, not a page',
    /attachment/.test(r.headers.get('content-disposition') ?? ''),
    r.headers.get('content-disposition') ?? 'no header',
  );
  check('and is never cached', (r.headers.get('cache-control') ?? '').includes('no-store'), r.headers.get('cache-control') ?? '');

  const keys = Object.keys(r.json?.data ?? {});
  check('it carries every declared section', keys.length === 30, `${keys.length} sections`);
  check(
    'the health data is actually in it',
    (r.json?.data?.body_measurements ?? []).length === 1,
    `${(r.json?.data?.body_measurements ?? []).length} measurement(s)`,
  );
  check(
    'the account section carries no password hash',
    !JSON.stringify(r.json?.data?.account ?? {}).includes('password'),
  );
  // The whole file, checked once: a hash anywhere in an export is a hash in a file people email.
  check(
    'and NO hash or token appears anywhere in the payload',
    !/\$argon2|password_hash|token_hash/.test(r.text),
  );
  check(
    'it contains only THIS person — no other account id appears in the account row',
    (r.json?.data?.account ?? [])[0]?.id === me.id,
  );
}

/* ── deletion: the refusals first ────────────────────────────────────────────────────────────── */

{
  const bad = await call('/me/delete', { method: 'POST', json: { password: 'wrong-password', confirm: 'DELETE' } });
  check('a wrong password cannot erase an account', bad.status === 401, `status ${bad.status}`);

  const noConfirm = await call('/me/delete', { method: 'POST', json: { password: PASSWORD } });
  check('and neither can a request without the typed confirmation', noConfirm.status === 400, `status ${noConfirm.status}`);

  const stillThere = await db.all('SELECT COUNT(*) AS n FROM users WHERE id = ?', [me.id]);
  check('the account is still there after both refusals', stillThere[0].n === 1);
}

/* ── deletion: for real ──────────────────────────────────────────────────────────────────────── */

{
  const r = await call('/me/delete', { method: 'POST', json: { password: PASSWORD, confirm: 'DELETE' } });

  /*
   * ═══ A 429 HERE IS THE LIMITER, NOT A DEFECT — AND IT MUST SAY SO ═════════════════════════════
   *
   * `/me/delete` is limited to 20 an hour per IP because it verifies a password and would otherwise
   * be an oracle. Running this probe four times in an hour exhausts that, and the first version
   * reported five confusing failures with no hint of the cause. Naming it costs one branch and
   * saves somebody twenty minutes.
   */
  if (r.status === 429) {
    check(
      'the erasure answers 200',
      false,
      'RATE LIMITED (429) — /me/delete allows 20/hour per IP and this probe spends 3. Wait, or run the server with NODE_ENV=test, where the limiters skip.',
    );
  } else {
    check('the erasure answers 200', r.status === 200 && r.json?.erased === true, `status ${r.status}`);
  }

  const gone = await db.all('SELECT COUNT(*) AS n FROM users WHERE id = ?', [me.id]);
  check('the account row is gone', gone[0].n === 0);

  const health = await db.all('SELECT COUNT(*) AS n FROM body_measurements WHERE client_user_id = ?', [me.id]);
  check('and the health data went with it, by cascade', health[0].n === 0, `${health[0].n} left`);

  const theme = await db.all('SELECT COUNT(*) AS n FROM user_theme_prefs WHERE user_id = ?', [me.id]);
  check('as did the preferences', theme[0].n === 0);

  /*
   * ═══ SCOPED BY A DELTA, BECAUSE SQLite REUSES A ROWID ═════════════════════════════════════════
   *
   * What 018 exists for — but the first version of these two assertions counted rows matching
   * `target_id` alone and asserted `=== 1`. A previous run of this probe had erased an account whose
   * id was then handed to a later one, so both went PASS over a run where the deletion had been
   * REFUSED and the account was still sitting in the database. Two green lines about a subject that
   * had not moved.
   *
   * The counts are taken before and compared as a delta, so an inherited id proves nothing either
   * way.
   */
  const audit = await db.all(
    "SELECT actor_id, action FROM audit_log WHERE action = 'account.erase' AND target_id = ?",
    [me.id],
  );
  check(
    'the erasure is permanently recorded',
    audit.length === erasesBefore + 1,
    `${audit.length} row(s), was ${erasesBefore}`,
  );
  check(
    'and the record names NOBODY — actor_id was set to NULL by the foreign key',
    audit.length > 0 && audit.every((a) => a.actor_id === null),
    audit.map((a) => `actor_id=${a.actor_id}`).join(', ') || 'no rows',
  );

  const exportRow = await db.all(
    "SELECT actor_id FROM audit_log WHERE action = 'account.export' AND target_id = ?",
    [me.id],
  );
  check(
    'the export they asked for is still on record, also anonymous',
    exportRow.length === exportsBefore + 1 && exportRow.every((r) => r.actor_id === null),
    `${exportRow.length} row(s), was ${exportsBefore}`,
  );

  const after = await call('/auth/me');
  check('and the session is dead', after.status === 401, `status ${after.status}`);
}

await db.closePool();
console.log(`\ngdpr walk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
