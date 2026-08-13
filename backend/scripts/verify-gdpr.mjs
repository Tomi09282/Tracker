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

// A private exercise and one still under review, so the erasure can be asked the question that
// matters: does asking to be forgotten make your library READABLE?
for (const [name, status] of [
  [`gdpr-private-${me.id}`, 'private'],
  [`gdpr-pending-${me.id}`, 'pending_review'],
]) {
  await db.run('INSERT INTO exercises (name, normalized_name, owner_id, status) VALUES (?, ?, ?, ?)', [
    name,
    name,
    me.id,
    status,
  ]);
}

// The high-water mark of the audit log before this run.
//
// SQLite reuses a rowid once its row is gone, so `target_id` alone matches rows from EVERY previous
// run of this probe. That has now produced a false PASS once — over a deletion the rate limiter had
// refused — and a false FAIL once, on a pre-fix row that still carried an IP. An id floor is the
// only thing available here that is genuinely unique to this run.
const auditFloor = (await db.all('SELECT COALESCE(MAX(id), 0) AS id FROM audit_log'))[0].id;

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

  /*
   * ═══ AND THE SURVIVING ROWS CARRY NO IDENTIFIER ════════════════════════════════════════════
   *
   * Found by the Phase 7 sweep, not by this file. Both rows survive the person — the foreign key
   * anonymises `actor_id` and 018's trigger then freezes every other column FOREVER — and both were
   * storing `req.ip`. An IP is an identifier; a permanent record of an erasure that keeps one is
   * not an erasure.
   *
   * Asserted on the rows this run created, so a legacy row from before the fix cannot mask it.
   */
  const identifying = await db.all(
    `SELECT action, ip, detail FROM audit_log
      WHERE id > ? AND target_id = ? AND action IN ('account.erase', 'account.export')`,
    [auditFloor, me.id],
  );
  check(
    'neither surviving row keeps an IP address',
    identifying.length > 0 && identifying.every((r) => r.ip === null),
    identifying.map((r) => `${r.action}:${JSON.stringify(r.ip)}`).join(' ') || 'no rows',
  );
  check(
    'and the erasure detail carries no email, handle or address',
    identifying.every((r) => !/@|"email"|"handle"|\d+\.\d+\.\d+\.\d+/.test(String(r.detail ?? ''))),
    identifying.map((r) => String(r.detail ?? 'null').slice(0, 44)).join(' | '),
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

  /*
   * ═══ ERASURE MUST NOT PUBLISH WHAT THE PERSON KEPT PRIVATE ═════════════════════════════════
   *
   * The defect this replaces was a chain of three reasonable parts: migration 011's delete trigger
   * orphans every exercise the person authored (so a client's history keeps resolving), `VISIBLE`
   * admitted `owner_id IS NULL` (for the 1653-row public dataset), and therefore a `private` row
   * became world-readable at the exact moment its author asked to be forgotten.
   *
   * Measured then:  BEFORE  a stranger sees global.  AFTER  global, pending_review, private.
   *
   * Asked here through the SHARED predicate rather than a copy of it, so the assertion follows the
   * definition if it ever moves again.
   */
  /*
   * ═══ AND IT ONLY MEANS ANYTHING IF THE ERASURE HAPPENED ════════════════════════════════════
   *
   * The first version of these two assertions did not check that. Written minutes after a commit
   * message about assertions that pass by measuring nothing, and then run against a rate-limited
   * deletion:
   *
   *     FAIL  the erasure answers 200  (RATE LIMITED (429) …)
   *     PASS  the erased account's private library did NOT become world-readable  (nothing visible)
   *
   * Of course nothing was visible. The account was still there, so its private rows were private
   * for the ordinary reason and the assertion would have passed with the defect fully present.
   *
   * A visibility claim about an ERASED account is only a claim once the account is erased.
   */
  const reallyGone = (await db.all('SELECT COUNT(*) AS n FROM users WHERE id = ?', [me.id]))[0].n === 0;

  if (!reallyGone) {
    check(
      "the erased account's private library did NOT become world-readable",
      false,
      'NOT TESTED — the account was never erased (see the failure above), so this proves nothing either way',
    );
  } else {
    // Through the SHARED predicate, not a copy of it, so the assertion follows the definition if it
    // ever moves again.
    const { VISIBLE, visibleParams } = await import('../src/exercises/visibility.js');
    const strangerSees = await db.all(
      `SELECT e.normalized_name AS n, e.status FROM exercises e
        WHERE e.normalized_name IN (?, ?) AND ${VISIBLE}`,
      [`gdpr-private-${me.id}`, `gdpr-pending-${me.id}`, ...visibleParams(1)],
    );
    check(
      "the erased account's private library did NOT become world-readable",
      strangerSees.length === 0,
      strangerSees.map((r) => `${r.n}(${r.status})`).join(', ') || 'nothing visible, and the account IS gone',
    );

    // And the rows still EXIST, because that is what the trigger is for — a client's history keeps
    // resolving after their coach leaves. Invisible is the fix; deleted would have been a different
    // defect.
    const stillThere = await db.all('SELECT COUNT(*) AS n FROM exercises WHERE normalized_name IN (?, ?)', [
      `gdpr-private-${me.id}`,
      `gdpr-pending-${me.id}`,
    ]);
    check('while the rows survive, orphaned, for history to resolve against', stillThere[0].n === 2, `${stillThere[0].n} row(s)`);
  }

  await db.run('DELETE FROM exercises WHERE normalized_name IN (?, ?)', [
    `gdpr-private-${me.id}`,
    `gdpr-pending-${me.id}`,
  ]);

  const after = await call('/auth/me');
  check('and the session is dead', after.status === 401, `status ${after.status}`);
}

await db.closePool();
console.log(`\ngdpr walk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
