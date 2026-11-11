// scripts/smoke/admin-polish-2.js — package B-admin-polish, round 2: the backend items of the
// independent screen review of S-admin-accounts (.pulse/review/S-admin-accounts/REVIEW.md), plus the
// ledger query's ids (the M1 class of round 1). Every check marked RED here failed on pulse-int
// a7df161 (the code before this round); docs/pipeline/pulse/pkg/B-admin-polish/api.md lists the run.
//
//   A1  (review #2, blocking) the account page's NAPLO listed every audit row whose target was the
//       account - a timezone sync on every app start, a seeded `auth.login` - so the admin-set events
//       were pushed out of the last five and the page printed raw machine codes. The read now lists
//       only the account actions (what an admin set, plus the person's own password change).
//   A2  (review #9c) a wrong step-up password (admin grant, re-enabling an admin, deleting one's
//       own account) answered a bare 401; the client took it for an expired session, refreshed and
//       POSTed the same wrong password again. The 401 now carries reason 'step_up_failed' (the
//       client's apiWithRefresh does not refresh on a step-up reason). A REAL expired session still
//       answers a 401 without that reason, so the refresh keeps working where it should.
//   A3  (review #11) GET /admin/coins/ledger?user_id=<no such account> answered an empty statement;
//       now 404, like the account page. user_id / actor_id are canonical decimal ids (0x10 was 16).
//   (L3 of the security review - a posts cursor with negative keys - is NOT changed: the closed
//   B-admin-posts smoke asserts on purpose that a well-formed cursor at the numeric extremes is an
//   ordinary page; the keys are bound parameters and only select a different, empty page.)
//
// Passes: forge (wrong password, forged id spellings), replay (the second wrong password is
// answered the same way, nothing written), IDOR (a non-admin asking for a ghost's ledger gets the
// 403, no existence oracle), extremes (a flood of routine rows, huge / zero ids).
//
// Imported by scripts/smoke.js (SMOKE_ONLY=admin-polish runs it with the round-1 section).

export async function adminPolish2Smoke({ call, check, Jar, seeded, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);

  const API = '/api/v1';
  const tag = `pl2${stamp}`;
  let counter = 0;

  const login = async (email, password = PASSWORD) => {
    const jar = new Jar();
    const r = await call(`${API}/auth/login`, { method: 'POST', body: { email, password }, jar });
    return r.res.status === 200 ? jar : null;
  };
  const make = async (label, { role = 'user' } = {}) => {
    const email = `${tag}-${label}-${(counter += 1)}@pelda.hu`.toLowerCase();
    await call(`${API}/auth/register`, { method: 'POST', body: { email, password: PASSWORD } });
    const id = one('SELECT id FROM users WHERE email = ?', email).id;
    if (role !== 'user') run('UPDATE users SET role = ? WHERE id = ?', role, id);
    const jar = await login(email);
    return { id, email, jar };
  };
  const U = (path) => `${API}/admin/users${path}`;
  const send = (method, path, jar, body) => call(U(path), { method, jar, ...(body === undefined ? {} : { body }) });
  const auditCount = (action, targetId) =>
    one("SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND target_type = 'user' AND target_id = ?", action, targetId).n;

  const owner = await login(seeded.admin.email, seeded.admin.password);
  check('polish-2: owner admin signs in', owner !== null);

  /* ══ A1 the NAPLO lists account events only ═══════════════════════════════════════════════════ */
  {
    const ACCOUNT_ACTIONS = new Set([
      'user.role.change', 'user.disable', 'user.enable', 'user.name.change', 'user.lockout.reset',
      'user.sessions.revoke', 'user.password.force', 'user.credentials.change', 'coin.admin.adjust',
    ]);
    const T = await make('naplo');
    const dis = await send('POST', `/${T.id}/disable`, owner, { reason: 'review' });
    check('A1 setup: disable -> 200', dis.res.status === 200, `status ${dis.res.status}`);
    const en = await send('POST', `/${T.id}/enable`, owner, { reason: 'cleared' });
    check('A1 setup: enable -> 200', en.res.status === 200, `status ${en.res.status}`);

    // extremes: the person's own routine rows after the admin events - what every app start writes
    // (the timezone sync) and what the demo seed writes (auth.login) - more than the page's five.
    const noise = conn.prepare(
      "INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id) VALUES (?, ?, 'user', ?, NULL, ?)",
    );
    for (let i = 0; i < 6; i += 1) noise.run(T.id, i % 2 ? 'lifeos.prefs.timezone' : 'auth.login', T.id, `${tag}-noise-${i}`);

    const d = await call(U(`/${T.id}`), { jar: owner });
    check('A1: account detail -> 200', d.res.status === 200, `status ${d.res.status}`);
    const audit = Array.isArray(d.json?.audit) ? d.json.audit : [];
    const foreign = audit.filter((a) => !ACCOUNT_ACTIONS.has(a.action)).map((a) => a.action);
    check('A1 RED: no routine / machine action in the NAPLO', foreign.length === 0, `got ${JSON.stringify(foreign)}`);
    check(
      'A1 RED: the admin-set events are still there under the noise (enable, disable)',
      audit[0]?.action === 'user.enable' && audit[1]?.action === 'user.disable',
      JSON.stringify(audit.map((a) => a.action)),
    );
    check('A1: at most five lines', audit.length <= 5, `len ${audit.length}`);
    check(
      'A1: an event names its actor, carries no detail JSON',
      audit[0]?.actorEmail === seeded.admin.email && !('detail' in (audit[0] ?? {})),
      JSON.stringify(audit[0]),
    );

    // a coin adjustment is an account event too
    const coin = await call(`${API}/admin/users/${T.id}/coins`, {
      method: 'POST', jar: owner, body: { amount_minor: 100, note: 'review bonus', idempotency_key: `${tag}-coin-1` },
    });
    check('A1 setup: coin adjustment -> 200', coin.res.status === 200, `status ${coin.res.status} ${JSON.stringify(coin.json)}`);
    const d2 = await call(U(`/${T.id}`), { jar: owner });
    check('A1: the coin adjustment is the newest NAPLO line', d2.json?.audit?.[0]?.action === 'coin.admin.adjust', JSON.stringify(d2.json?.audit?.map((a) => a.action)));
  }

  /* ══ A2 a wrong step-up password is not a session failure ═════════════════════════════════════ */
  {
    const T = await make('grant');
    // forge: the admin grant with a password that is not the actor's
    for (const attempt of [1, 2]) {
      const r = await send('POST', `/${T.id}/role`, owner, { role: 'admin', password: 'NotThePassword123' });
      check(
        `A2 RED: grant with a wrong password (try ${attempt}) -> 401 reason step_up_failed`,
        r.res.status === 401 && r.json?.reason === 'step_up_failed' && r.json?.error === 'invalid credentials',
        `status ${r.res.status} ${JSON.stringify(r.json)}`,
      );
    }
    check('A2: the target is still a user', one('SELECT role FROM users WHERE id = ?', T.id).role === 'user');
    check('A2: no role audit row', auditCount('user.role.change', T.id) === 0);

    const noPw = await send('POST', `/${T.id}/role`, owner, { role: 'admin' });
    check('A2: grant without a password keeps step_up_required', noPw.res.status === 401 && noPw.json?.reason === 'step_up_required', JSON.stringify(noPw.json));

    // re-enabling a disabled admin with the wrong password
    const X = await make('x-admin', { role: 'admin' });
    await send('POST', `/${X.id}/disable`, owner, { reason: 'compromised' });
    const en = await send('POST', `/${X.id}/enable`, owner, { reason: 'back', password: 'NotThePassword123' });
    check(
      'A2 RED: re-enable an admin with a wrong password -> 401 reason step_up_failed',
      en.res.status === 401 && en.json?.reason === 'step_up_failed',
      `status ${en.res.status} ${JSON.stringify(en.json)}`,
    );
    check('A2: X is still disabled', one('SELECT disabled_at FROM users WHERE id = ?', X.id).disabled_at !== null);

    // deleting one's own account with a wrong password
    const V = await make('delete');
    const del = await call(`${API}/me/delete`, { method: 'POST', jar: V.jar, body: { password: 'NotThePassword123', confirm: 'DELETE' } });
    check(
      'A2 RED: own deletion with a wrong password -> 401 reason step_up_failed',
      del.res.status === 401 && del.json?.reason === 'step_up_failed',
      `status ${del.res.status} ${JSON.stringify(del.json)}`,
    );
    check('A2: the account still exists', one('SELECT COUNT(*) AS n FROM users WHERE id = ?', V.id).n === 1);

    // the honest grant still works
    const ok = await send('POST', `/${T.id}/role`, owner, { role: 'admin', password: seeded.admin.password });
    check('A2: grant with the actor\'s own password -> 200', ok.res.status === 200, `status ${ok.res.status} ${JSON.stringify(ok.json)}`);
    await send('POST', `/${T.id}/role`, owner, { role: 'user' });

    // a REAL session failure carries no step-up reason, so the client still refreshes on it
    const anon = await call(U(`/${T.id}/role`), { method: 'POST', body: { role: 'admin', password: 'x' } });
    check(
      'A2: no session -> 401 WITHOUT a step-up reason (the refresh path is intact)',
      anon.res.status === 401 && anon.json?.reason === undefined,
      `status ${anon.res.status} ${JSON.stringify(anon.json)}`,
    );
  }

  /* ══ A3 the ledger of an account that does not exist ══════════════════════════════════════════ */
  {
    const L = (qs) => call(`${API}/admin/coins/ledger?${qs}`, { jar: owner });
    const maxId = one('SELECT MAX(id) AS m FROM users').m;
    const ghost = maxId + 100000;
    const r = await L(`user_id=${ghost}`);
    check('A3 RED: ledger of an account that does not exist -> 404', r.res.status === 404, `status ${r.res.status} ${JSON.stringify(r.json)}`);

    // an account that existed and was erased (its rows cascade with it)
    const E = await make('erased');
    await call(`${API}/admin/users/${E.id}/coins`, { method: 'POST', jar: owner, body: { amount_minor: 50, note: 'x', idempotency_key: `${tag}-coin-e` } });
    run('DELETE FROM users WHERE id = ?', E.id);
    const er = await L(`user_id=${E.id}`);
    check('A3 RED: ledger of an erased account -> 404', er.res.status === 404, `status ${er.res.status}`);

    const fresh = await make('empty-ledger');
    const em = await L(`user_id=${fresh.id}`);
    check('A3: an existing account with no entries -> 200 []', em.res.status === 200 && Array.isArray(em.json?.entries) && em.json.entries.length === 0, `status ${em.res.status} ${JSON.stringify(em.json)}`);

    const all = await L('limit=5');
    check('A3: the statement without user_id still answers -> 200', all.res.status === 200 && Array.isArray(all.json?.entries), `status ${all.res.status}`);

    // forge: the spellings z.coerce read as an id
    for (const raw of ['0x10', '%205', '1e1', '05', '-1', '0', '2147483648', '1.0']) {
      const f = await L(`user_id=${raw}`);
      check(`A3 forge: user_id=${raw} -> 400`, f.res.status === 400, `status ${f.res.status}`);
    }
    const fa = await L('actor_id=0x1');
    check('A3 forge: actor_id=0x1 -> 400', fa.res.status === 400, `status ${fa.res.status}`);
    const twice = await L(`user_id=${fresh.id}&user_id=${fresh.id}`);
    check('A3 forge: user_id given twice -> 400', twice.res.status === 400, `status ${twice.res.status}`);

    // the gate is still admin-only (a user asking for a ghost gets 403, not a 404 oracle)
    const plain = await make('plain');
    const nope = await call(`${API}/admin/coins/ledger?user_id=${ghost}`, { jar: plain.jar });
    check('A3: a non-admin -> 403 (no existence oracle)', nope.res.status === 403, `status ${nope.res.status}`);
  }

  conn.close();
}
