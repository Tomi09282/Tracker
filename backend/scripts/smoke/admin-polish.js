// scripts/smoke/admin-polish.js — package B-admin-polish: the regressions of the independent security
// review of the admin v2 backend (2026-11-04, .pulse/review/security-admin-v2/attacks/out-0*.txt).
// Every check here was RED on pulse-int 966b625 (the code before this package) and is green after it;
// docs/pipeline/pulse/pkg/B-admin-polish/api.md lists the red run.
//
//   H1  re-enabling a disabled ADMIN asked for no password (attack 06): a stolen admin session
//       brought back a second admin that outlived the session's revocation.
//   H2  "sign out everywhere" / "force a password change" answered { replayed: true } and did
//       nothing when the account had no open refresh family (attack 03, S1 / S3): a copied access
//       token of a device that had logged out kept working for its fifteen minutes.
//   M1  the older admin routes read :id with z.coerce.number(): '0x10' reached account 16 and ' 5'
//       account 5 (attack 01).
//   M2  a display name could carry invisible characters (ZWSP, RLM, ALM, tag characters, Hangul
//       fillers, separators, lone surrogates, Zalgo) and read as another name (attack 03).
//   M3  a disable / enable reason and a coin note were stored in audit_log with a NUL, a bidi
//       override or a lone surrogate in them (attacks 03 / 07).
//
// The five passes where they apply: forge (no password, wrong password, a forged id spelling),
// replay (the second call is still a replay, one audit row), race (concurrent sign-outs apply once),
// IDOR (the step-up checks the ACTOR's password, not the target's), extremes (the character sets).
//
// Imported by scripts/smoke.js (SMOKE_ONLY=admin-polish runs just this section).

export async function adminPolishSmoke({ call, check, Jar, seeded, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);

  const API = '/api/v1';
  const tag = `pol${stamp}`;
  let counter = 0;
  const uniq = (p) => `${p}${stamp}x${(counter += 1)}`;

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
  const audits = (action, targetId) =>
    one("SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND target_type = 'user' AND target_id = ?", action, targetId).n;
  const U = (path) => `${API}/admin/users${path}`;
  const send = (method, path, jar, body) => call(U(path), { method, jar, ...(body === undefined ? {} : { body }) });
  /** A jar holding ONLY the access cookie of `jar` - the copied token an attacker walked away with. */
  const accessOnly = (jar) => {
    const j = new Jar();
    for (const [k, v] of jar.cookies) if (!/refresh/i.test(k)) j.cookies.set(k, v);
    return j;
  };

  // The owner (the seeded admin) and a second admin whose session is the "stolen" one.
  const owner = await login(seeded.admin.email, seeded.admin.password);
  check('polish: owner admin signs in', owner !== null);
  const B = await make('stolen-b', { role: 'admin' });
  check('polish: second admin signs in', B.jar !== null);

  /* ══ H1 re-enabling a disabled admin carries the grant's step-up ══════════════════════════════ */
  {
    const X = await make('x-admin', { role: 'admin' });
    const dis = await send('POST', `/${X.id}/disable`, owner, { reason: 'compromised' });
    check('H1 setup: owner disables admin X -> 200', dis.res.status === 200, `status ${dis.res.status}`);

    // forge: a stolen session of B re-enables X with a reason and nothing else
    const noPw = await send('POST', `/${X.id}/enable`, B.jar, { reason: 'mistake' });
    check(
      'H1 forge: enabling a disabled ADMIN without a password -> 401 step_up_required',
      noPw.res.status === 401 && noPw.json?.reason === 'step_up_required',
      `status ${noPw.res.status} ${JSON.stringify(noPw.json)}`,
    );
    check('H1 forge: X is still disabled', one('SELECT disabled_at FROM users WHERE id = ?', X.id).disabled_at !== null);
    check('H1 forge: no user.enable audit row', audits('user.enable', X.id) === 0, `rows ${audits('user.enable', X.id)}`);
    check('H1 forge: X cannot sign in', (await login(X.email)) === null);

    // forge: the wrong password
    const wrong = await send('POST', `/${X.id}/enable`, B.jar, { reason: 'mistake', password: 'NotThePassword123' });
    check('H1 forge: wrong password -> 401 invalid credentials', wrong.res.status === 401 && wrong.json?.error === 'invalid credentials', `status ${wrong.res.status} ${JSON.stringify(wrong.json)}`);
    check('H1 forge: still disabled after a wrong password', one('SELECT disabled_at FROM users WHERE id = ?', X.id).disabled_at !== null);

    // IDOR: the step-up is the ACTOR's password - the owner typing X's password (not their own) fails
    if (seeded.admin.password !== PASSWORD) {
      const theirs = await send('POST', `/${X.id}/enable`, owner, { reason: 'mistake', password: PASSWORD });
      check("H1 IDOR: the TARGET's password does not step the actor up -> 401", theirs.res.status === 401, `status ${theirs.res.status}`);
    }

    // extremes: a password field that is not a string / is empty is a 400, never a 200
    for (const [label, pw] of [['empty', ''], ['number', 123], ['huge', 'x'.repeat(201)]]) {
      const r = await send('POST', `/${X.id}/enable`, B.jar, { reason: 'mistake', password: pw });
      check(`H1 extremes: password ${label} -> 400`, r.res.status === 400, `status ${r.res.status}`);
    }

    // the honest path: the actor's own password
    const ok = await send('POST', `/${X.id}/enable`, owner, { reason: 'cleared after review', password: seeded.admin.password });
    check('H1: enable with the actor\'s own password -> 200', ok.res.status === 200 && ok.json?.replayed === false, `status ${ok.res.status} ${JSON.stringify(ok.json)}`);
    check('H1: exactly one user.enable audit row', audits('user.enable', X.id) === 1, `rows ${audits('user.enable', X.id)}`);

    // replay: enabling the now-enabled admin again hands over nothing - a replay, no password asked
    const again = await send('POST', `/${X.id}/enable`, B.jar, { reason: 'again' });
    check('H1 replay: enabling an enabled admin -> 200 replayed, no new audit row', again.res.status === 200 && again.json?.replayed === true && audits('user.enable', X.id) === 1, `status ${again.res.status} ${JSON.stringify(again.json)}`);

    // non-admin accounts keep the old contract (reason only)
    const plain = await make('plain-user');
    await send('POST', `/${plain.id}/disable`, owner, { reason: 'spam' });
    const plainOn = await send('POST', `/${plain.id}/enable`, B.jar, { reason: 'appeal accepted' });
    check('H1: enabling a non-admin needs no password -> 200', plainOn.res.status === 200 && plainOn.json?.replayed === false, `status ${plainOn.res.status}`);

    // race: demote X to user while disabled, enable without a password, promote needs a password -
    // the chain cannot rebuild an admin without one
    await send('POST', `/${X.id}/disable`, owner, { reason: 'again' });
    const dem = await send('POST', `/${X.id}/role`, B.jar, { role: 'user' });
    const en = await send('POST', `/${X.id}/enable`, B.jar, { reason: 'as a user' });
    const pro = await send('POST', `/${X.id}/role`, B.jar, { role: 'admin' });
    check(
      'H1 race/chain: demote -> enable -> promote without a password ends with X NOT an admin',
      dem.res.status === 200 && en.res.status === 200 && pro.res.status === 401 && one('SELECT role FROM users WHERE id = ?', X.id).role === 'user',
      `demote ${dem.res.status} enable ${en.res.status} promote ${pro.res.status} role ${one('SELECT role FROM users WHERE id = ?', X.id).role}`,
    );
  }

  /* ══ H2 sign-out-all / force-password-change end a live ACCESS token ══════════════════════════ */
  {
    // S1: the victim logs out on their own device; the attacker's copy of the access token remains.
    const V = await make('victim');
    const stolen = accessOnly(V.jar);
    const lo = await call(`${API}/auth/logout`, { method: 'POST', jar: V.jar });
    check('H2 setup: victim logs out -> 200', lo.res.status === 200, `status ${lo.res.status}`);
    const before = await call(`${API}/auth/me`, { jar: stolen });
    check('H2 setup: the copied access token still works before the admin acts', before.res.status === 200, `status ${before.res.status}`);

    const so = await send('POST', `/${V.id}/signout-all`, owner, {});
    check('H2 S1: signout-all with no open refresh family is APPLIED (not a replay)', so.res.status === 200 && so.json?.replayed === false, `status ${so.res.status} ${JSON.stringify(so.json)}`);
    const after = await call(`${API}/auth/me`, { jar: stolen });
    check('H2 S1: the copied access token is dead after "sign out everywhere"', after.res.status === 401, `status ${after.res.status}`);
    check('H2 S1: one user.sessions.revoke audit row', audits('user.sessions.revoke', V.id) === 1, `rows ${audits('user.sessions.revoke', V.id)}`);

    // replay: nothing new was minted, so the next sign-out is a replay with no second audit row
    const so2 = await send('POST', `/${V.id}/signout-all`, owner, {});
    check('H2 replay: a second signout-all -> replayed, still one audit row', so2.json?.replayed === true && audits('user.sessions.revoke', V.id) === 1, `${JSON.stringify(so2.json)} rows ${audits('user.sessions.revoke', V.id)}`);

    // race: the victim signs in again, then twelve concurrent sign-outs apply exactly once
    const V2 = await login(V.email);
    const stolen2 = accessOnly(V2);
    const rs = await Promise.all(Array.from({ length: 12 }, () => send('POST', `/${V.id}/signout-all`, owner, {})));
    const applied = rs.filter((r) => r.res.status === 200 && r.json?.replayed === false).length;
    check('H2 race: 12 concurrent sign-outs after a new login apply exactly once', applied === 1 && audits('user.sessions.revoke', V.id) === 2, `applied ${applied} rows ${audits('user.sessions.revoke', V.id)}`);
    check('H2 race: the new access token is dead', (await call(`${API}/auth/me`, { jar: stolen2 })).res.status === 401);

    // S3: forcing a password change on an account ALREADY flagged ends the session it has now
    const W = await make('flagged');
    const f1 = await send('POST', `/${W.id}/force-password-change`, owner, {});
    check('H2 S3 setup: first force -> applied', f1.json?.replayed === false, JSON.stringify(f1.json));
    const W2 = await login(W.email);
    check('H2 S3 setup: a flagged account can still sign in (to change its password)', W2 !== null);
    const f2 = await send('POST', `/${W.id}/force-password-change`, owner, {});
    check('H2 S3: force on a flagged account WITH a session -> applied', f2.res.status === 200 && f2.json?.replayed === false, `status ${f2.res.status} ${JSON.stringify(f2.json)}`);
    const refreshed = await call(`${API}/auth/refresh`, { method: 'POST', jar: W2 });
    check('H2 S3: its refresh token is revoked', refreshed.res.status === 401, `status ${refreshed.res.status}`);
    const f3 = await send('POST', `/${W.id}/force-password-change`, owner, {});
    check('H2 S3 replay: force again with nothing signed in -> replayed, two audit rows total', f3.json?.replayed === true && audits('user.password.force', W.id) === 2, `${JSON.stringify(f3.json)} rows ${audits('user.password.force', W.id)}`);
  }

  /* ══ M1 a canonical decimal id or nothing ════════════════════════════════════════════════════ */
  {
    const T = await make('hex-target');
    const T2 = await make('hex-target2');
    const hex = `0x${T.id.toString(16)}`;
    const spaced = encodeURIComponent(` ${T2.id}`);
    const role = await send('POST', `/${hex}/role`, owner, { role: 'coach' });
    check(`M1 forge: role on '${hex}' -> 404, account ${T.id} unchanged`, role.res.status === 404 && one('SELECT role FROM users WHERE id = ?', T.id).role === 'user', `status ${role.res.status}`);
    const role2 = await send('POST', `/${spaced}/role`, owner, { role: 'coach' });
    check(`M1 forge: role on ' ${T2.id}' -> 404, unchanged`, role2.res.status === 404 && one('SELECT role FROM users WHERE id = ?', T2.id).role === 'user', `status ${role2.res.status}`);
    const dis = await send('POST', `/${hex}/disable`, owner, { reason: 'x' });
    check(`M1 forge: disable on '${hex}' -> 404, not disabled`, dis.res.status === 404 && one('SELECT disabled_at FROM users WHERE id = ?', T.id).disabled_at === null, `status ${dis.res.status}`);
    run('UPDATE users SET disabled_at = unixepoch() WHERE id = ?', T2.id);
    const en = await send('POST', `/${spaced}/enable`, owner, { reason: 'x' });
    check(`M1 forge: enable on ' ${T2.id}' -> 404, still disabled`, en.res.status === 404 && one('SELECT disabled_at FROM users WHERE id = ?', T2.id).disabled_at !== null, `status ${en.res.status}`);
    // coins: a fresh, enabled account (T was disabled through '0xNN' on the old code, which made the
    // old route's answer a 404 for another reason)
    const C = await make('hex-coins');
    const chex = `0x${C.id.toString(16)}`;
    const coins = await call(`${API}/admin/users/${chex}/coins`, { method: 'POST', jar: owner, body: { amount_minor: 100, note: 'hex', idempotency_key: uniq('hexadj') } });
    const ledger = one('SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ?', C.id).n;
    check(`M1 forge: coins on '${chex}' -> 400, no ledger entry`, coins.res.status === 400 && ledger === 0, `status ${coins.res.status} ledger ${ledger}`);
    for (const bad of [`+${T.id}`, `0${T.id}`, `${T.id}.0`, `${T.id}e0`, '2147483648']) {
      const r = await send('POST', `/${encodeURIComponent(bad)}/role`, owner, { role: 'coach' });
      check(`M1 extremes: role on '${bad}' -> 404`, r.res.status === 404, `status ${r.res.status}`);
    }
    check(`M1 extremes: account ${T.id} is still a user after every spelling`, one('SELECT role FROM users WHERE id = ?', T.id).role === 'user');
    const good = await send('POST', `/${T.id}/role`, owner, { role: 'coach' });
    check('M1: the canonical id still works -> 200', good.res.status === 200, `status ${good.res.status}`);
    await send('POST', `/${T.id}/role`, owner, { role: 'user' });
  }

  /* ══ M2 a display name cannot be invisible or read as another name ═══════════════════════════ */
  {
    const N = await make('names');
    const bad = {
      'RLM U+200F': 'Admin\u200F',
      'ZWSP U+200B': 'Ad\u200Bmin',
      'ALM U+061C': 'Ad\u061Cmin',
      'tag U+E0041': 'Ad\u{E0041}min',
      'invisible times U+2062': 'a\u2062b',
      'LINE SEP U+2028': 'Line\u2028Break',
      'PARA SEP U+2029': 'Para\u2029Break',
      'lone surrogate': 'ab\uD800',
      'Hangul filler U+3164': '\u3164\u3164',
      'Zalgo 1+119 marks': `a${'\u0301'.repeat(119)}`,
      'interior BOM': 'Ad\uFEFFmin',
      'bare ZWJ': 'Ad\u200Dmin',
    };
    for (const [label, v] of Object.entries(bad)) {
      const r = await send('PATCH', `/${N.id}/name`, owner, { displayName: v });
      check(`M2 extremes: admin rename to ${label} -> 400`, r.res.status === 400, `status ${r.res.status}`);
    }
    const self = await call(`${API}/auth/me`, { method: 'PATCH', jar: N.jar, body: { displayName: 'Ad\u200Bmin' } });
    check('M2 extremes: the user\'s own PATCH /auth/me refuses ZWSP too -> 400', self.res.status === 400, `status ${self.res.status}`);
    check('M2: nothing invisible was stored', one('SELECT display_name FROM users WHERE id = ?', N.id).display_name === null);
    const good = {
      accents: 'Fehér Anna',
      'emoji ZWJ sequence': 'Anna 👩\u200D💻',
      'emoji with VS16 + ZWJ': '🏋\uFE0F\u200D♀\uFE0F Edző',
      'Persian ZWNJ': 'می\u200Cخواهم',
      Vietnamese: 'Nguyễn Văn',
    };
    for (const [label, v] of Object.entries(good)) {
      const r = await send('PATCH', `/${N.id}/name`, owner, { displayName: v });
      check(`M2: a real name (${label}) is still accepted -> 200`, r.res.status === 200, `status ${r.res.status}`);
    }
  }

  /* ══ M3 reasons and notes: no NUL, no bidi control, no lone surrogate ═════════════════════════ */
  {
    const R = await make('reasons');
    const cases = { NUL: 'a\u0000b', 'RLO U+202E': 'ok \u202E reversed', 'RLM U+200F': 'ok\u200F', 'lone surrogate': 'x\uD800' };
    for (const [label, v] of Object.entries(cases)) {
      const d = await send('POST', `/${R.id}/disable`, owner, { reason: v });
      check(`M3 extremes: disable reason with ${label} -> 400`, d.res.status === 400, `status ${d.res.status}`);
      if (d.res.status === 200) await send('POST', `/${R.id}/enable`, owner, { reason: 'undo' });
    }
    run('UPDATE users SET disabled_at = unixepoch() WHERE id = ?', R.id);
    const e = await send('POST', `/${R.id}/enable`, owner, { reason: 'ok \u202E reversed' });
    check('M3 extremes: enable reason with RLO -> 400', e.res.status === 400, `status ${e.res.status}`);
    run('UPDATE users SET disabled_at = NULL WHERE id = ?', R.id);
    const coin = await call(`${API}/admin/users/${R.id}/coins`, { method: 'POST', jar: owner, body: { amount_minor: 100, note: 'bonus \u202E 001', idempotency_key: uniq('rlo') } });
    check('M3 extremes: coin note with RLO -> 400', coin.res.status === 400, `status ${coin.res.status}`);
    const stored = one(
      "SELECT COUNT(*) AS n FROM audit_log WHERE target_type = 'user' AND target_id = ? AND (instr(detail, char(8238)) > 0 OR instr(detail, char(8207)) > 0 OR detail LIKE '%\\u0000%')",
      R.id,
    ).n;
    check('M3: no audit row of the account carries a NUL or an override', stored === 0, `rows ${stored}`);

    // what a reason MAY carry: line breaks and a pasted zero-width space (stripped, not refused)
    const ml = await send('POST', `/${R.id}/disable`, owner, { reason: 'line one\r\nline two\u200B' });
    check('M3: a multi-line reason is accepted -> 200', ml.res.status === 200, `status ${ml.res.status}`);
    const row = one("SELECT json_extract(detail, '$.reason') AS r FROM audit_log WHERE action = 'user.disable' AND target_id = ? ORDER BY id DESC LIMIT 1", R.id);
    check('M3: the stored reason is normalised (LF, no ZWSP)', row?.r === 'line one\nline two', JSON.stringify(row?.r));
    await send('POST', `/${R.id}/enable`, owner, { reason: 'done' });
  }

  conn.close();
}
