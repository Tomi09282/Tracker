// scripts/smoke/admin-accounts.js — package B-admin-accounts against the running server: the account
// list (GET /admin/users), the inspect read (GET /admin/users/:id) and the four account writes
// (PATCH name, POST reset-lockout / signout-all / force-password-change), plus the two edits to
// routes that already existed (enable now REQUIRES a reason; the coin adjustment refuses the admin's
// own account).
//
// The five passes - forge / replay / race / IDOR / extremes - for each write and the reads, then
// scripts/verify-admin-accounts.mjs runs this very file against copies of the backend with a defect
// planted in each, and demands that every planted defect turns at least one check red.
//
// Imported by scripts/smoke.js after the LifeOS sections (SMOKE_ONLY=admin-accounts runs just this).
// Accounts the API cannot make (a second admin, a demoted token, a locked account) are planted
// straight into the throwaway smoke database; every ASSERTION goes through the API or reads the rows
// the API wrote.

export async function adminAccountsSmoke({ call, check, Jar, seeded, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const { foldText } = await import('../../src/lib/like.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);
  const all = (sql, ...p) => conn.prepare(sql).all(...p);
  const nowSec = () => Math.floor(Date.now() / 1000);

  const API = '/api/v1';
  const tag = `acc${stamp}`;
  let counter = 0;
  const uniq = (p) => `${p}${stamp}x${(counter += 1)}`;

  /* ── helpers ─────────────────────────────────────────────────────────────────────────────── */
  const login = async (email, password = PASSWORD) => {
    const jar = new Jar();
    const r = await call(`${API}/auth/login`, { method: 'POST', body: { email, password }, jar });
    return r.res.status === 200 ? jar : null;
  };
  /** Register through the API, optionally plant a role, log in. The token carries the PLANTED role. */
  const make = async (label, { role = 'user', name = null } = {}) => {
    const email = `${tag}-${label}-${(counter += 1)}@pelda.hu`.toLowerCase();
    await call(`${API}/auth/register`, { method: 'POST', body: { email, password: PASSWORD } });
    const id = one('SELECT id FROM users WHERE email = ?', email).id;
    if (role !== 'user') run('UPDATE users SET role = ? WHERE id = ?', role, id);
    if (name) run('UPDATE users SET display_name = ? WHERE id = ?', name, id);
    const jar = await login(email);
    return { id, email, jar };
  };
  const audits = (action, targetId) =>
    one("SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND target_type = 'user' AND target_id = ?", action, targetId).n;
  const rowOf = (id) => one('SELECT * FROM users WHERE id = ?', id);
  const U = (path) => `${API}/admin/users${path}`;
  const get = (path, jar) => call(U(path), { jar });
  const send = (method, path, jar, body) => call(U(path), { method, jar, ...(body === undefined ? {} : { body }) });
  const statuses = (rs) => rs.map((r) => r.res.status).join(',');

  const adminA = new Jar();
  await call(`${API}/auth/login`, { method: 'POST', body: { email: seeded.admin.email, password: seeded.admin.password }, jar: adminA });
  const adminAId = one('SELECT id FROM users WHERE email = ?', seeded.admin.email).id;
  const coachJar = new Jar();
  await call(`${API}/auth/login`, { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coachJar });
  const member = await make('member');
  const anon = new Jar();

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 1. THE LIST — a cohort of 30 planted accounts: ties on every sort key, accents, roles, disabled
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: the list (search, filters, five sort keys, keyset paging, total) ──');
  const names = [
    'Árpád Nagy', 'Béla Kiss', 'Éva Tóth', 'Ödön Szabó', 'Ünige Varga', 'Zoltán Éles', 'Anna Fehér', 'Ágnes Kovács',
    'Dóra Molnár', 'Gábor Lakatos', 'Ilona Vörös', 'János Pál', 'Katalin Orbán', 'László Győri', 'Mária Szűcs',
    'Nóra Hegedűs', 'Olga Pap', 'Péter Rácz', 'Réka Sipos', 'Sándor Gál', 'Tamás Fekete', 'Viktor Sárközi',
    'Zsófia Balogh', 'Ábel Nemes', 'Csaba Fodor', 'Edit Máté', 'Flóra Antal', 'Henrik Bíró', 'István Oláh', 'Judit Szél',
  ];
  const baseCreated = nowSec() - 50_000;
  const cohortIds = [];
  for (let i = 0; i < 30; i += 1) {
    const email = `${tag}-c${String(i).padStart(2, '0')}@pelda.hu`;
    // Three created_at values only: 30 accounts, 3 distinct timestamps - the tiebreak is exercised.
    const info = run(
      `INSERT INTO users (email, password_hash, role, display_name, created_at, disabled_at)
       VALUES (?, 'x', ?, ?, ?, ?)`,
      email, i % 7 === 0 ? 'coach' : 'user', i % 11 === 10 ? null : names[i], baseCreated + (i % 3) * 100,
      i % 9 === 0 ? nowSec() - 1000 : null,
    );
    cohortIds.push(Number(info.lastInsertRowid));
  }
  // Active client counts 1, 2, 3, 4 for the coaches at 7, 14, 21, 28 (the rest tie at 0) plus an
  // ARCHIVED link on coach 7 that must not count.
  const link = (coachIdx, clientIdx, status = 'active') =>
    run('INSERT INTO coach_clients (coach_id, client_id, status) VALUES (?, ?, ?)', cohortIds[coachIdx], cohortIds[clientIdx], status);
  link(7, 1); link(7, 20, 'archived');
  link(14, 2); link(14, 3);
  link(21, 4); link(21, 5); link(21, 6);
  link(28, 8); link(28, 9); link(28, 10); link(28, 12);

  const cohort = () =>
    all(
      `SELECT u.id, u.email, u.display_name AS name, u.role, u.created_at AS created, u.disabled_at AS disabled,
              (SELECT COUNT(*) FROM coach_clients k WHERE k.coach_id = u.id AND k.status = 'active') AS clients
         FROM users u WHERE u.email LIKE ?`,
      `${tag}-c%`,
    );
  const keyOf = {
    name: (r) => foldText((r.name ?? '').trim() || r.email),
    created: (r) => r.created,
    email: (r) => r.email.trim().toLowerCase(),
    role: (r) => r.role,
    clients: (r) => r.clients,
  };
  const expectedOrder = (key, dir) => {
    const f = keyOf[key];
    const sign = dir === 'desc' ? -1 : 1;
    return cohort()
      .sort((a, b) => {
        const x = f(a); const y = f(b);
        if (x !== y) return (x < y ? -1 : 1) * sign;
        return (a.id - b.id) * sign;
      })
      .map((r) => r.id);
  };
  const walk = async (params, jar = adminA) => {
    let cursor = null;
    const rows = [];
    const sizes = [];
    const totals = [];
    let pages = 0;
    let last = null;
    do {
      const qs = new URLSearchParams({ ...params, ...(cursor ? { cursor } : {}) });
      const r = await get(`?${qs}`, jar);
      last = r;
      if (r.res.status !== 200) return { status: r.res.status, rows, sizes, totals, pages };
      rows.push(...r.json.users);
      sizes.push(r.json.users.length);
      totals.push(r.json.total);
      cursor = r.json.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    return { status: 200, rows, sizes, totals, pages, last: last.json };
  };

  {
    const first = await get(`?q=${tag}-c`, adminA);
    check('GET /admin/users answers 200 with users[], nextCursor, sort and a total', first.res.status === 200 && Array.isArray(first.json?.users) && typeof first.json.total === 'number' && first.json.sort?.key === 'created', `${first.res.status} ${JSON.stringify(first.json?.sort)}`);
    const row = first.json?.users?.[0] ?? {};
    check('a row carries id, email, displayName (new), role, createdAt, disabledAt, mustChange, hasProfile, clientCount', ['id', 'email', 'displayName', 'role', 'createdAt', 'disabledAt', 'mustChange', 'hasProfile', 'clientCount'].every((k) => k in row), Object.keys(row).join(','));
    check('and nothing beyond that: no hash, no session version, no lockout internals, no sort value', !['password_hash', 'session_version', 'next_login_at', 'failed_logins', 'sortValue'].some((k) => k in row), Object.keys(row).join(','));
    check('the page is capped at 24 rows and the total is the whole filtered set (30)', first.json?.users?.length === 24 && first.json?.total === 30 && typeof first.json?.nextCursor === 'string', `${first.json?.users?.length} of ${first.json?.total}`);
  }

  for (const key of ['name', 'created', 'email', 'role', 'clients']) {
    for (const dir of ['asc', 'desc']) {
      const w = await walk({ q: `${tag}-c`, sort: key, dir });
      const want = expectedOrder(key, dir);
      const got = w.rows.map((r) => r.id);
      check(`sort ${key} ${dir}: a keyset walk returns all 30 once, in the order the data says`, w.status === 200 && got.length === 30 && new Set(got).size === 30 && got.join() === want.join(), `${w.status} pages ${w.pages} sizes ${w.sizes} ${got.length === 30 && got.join() !== want.join() ? 'ORDER DIFFERS' : ''}`);
      check(`sort ${key} ${dir}: pages are 24 + 6 and the total never shrinks with the cursor`, w.sizes.join() === '24,6' && w.totals.every((t) => t === 30), `${w.sizes} / ${w.totals}`);
    }
  }
  {
    const w = await walk({ q: `${tag}-c`, sort: 'clients', dir: 'desc' });
    check('the clients key counts ACTIVE links only (the archived link on coach 7 is not counted)', w.rows.find((r) => r.id === cohortIds[7])?.clientCount === 1 && w.rows[0].clientCount === 4, `top ${w.rows[0]?.clientCount}, coach7 ${w.rows.find((r) => r.id === cohortIds[7])?.clientCount}`);
    const def = await get(`?q=${tag}-c`, adminA);
    check('default sort is created desc and a key\'s natural direction applies when dir is omitted (name -> asc)', def.json?.sort?.direction === 'desc' && (await get(`?q=${tag}-c&sort=name`, adminA)).json?.sort?.direction === 'asc', JSON.stringify(def.json?.sort));
  }

  {
    // 26 accounts whose 120-character names are identical in their first 80 characters, and one
    // address of 200 characters: the cursor stays small and the walk still sees every row once.
    const longName = `Z${'á'.repeat(119)}`;
    const ids = [];
    for (let i = 0; i < 26; i += 1) {
      ids.push(Number(run(`INSERT INTO users (email, password_hash, display_name) VALUES (?, 'x', ?)`, `${tag}-long${String(i).padStart(2, '0')}${'p'.repeat(i === 0 ? 180 : 0)}@pelda.hu`, longName).lastInsertRowid));
    }
    for (const key of ['name', 'email']) {
      const w = await walk({ q: `${tag}-long`, sort: key, dir: 'asc' });
      const got = w.rows.map((r) => r.id);
      check(`sort ${key}: long names and a 200-character address page without a repeat or a gap (the cursor value is bounded)`, w.status === 200 && got.length === 26 && new Set(got).size === 26 && w.sizes.join() === '24,2' && ids.every((id) => got.includes(id)), `${w.status} ${w.sizes}`);
    }
  }
  // filters
  {
    const exp = cohort();
    const coaches = exp.filter((r) => r.role === 'coach').length;
    const disabled = exp.filter((r) => r.disabled !== null).length;
    const a = await walk({ q: `${tag}-c`, role: 'coach' });
    check('role=coach returns exactly the coaches of the cohort', a.rows.length === coaches && a.rows.every((r) => r.role === 'coach') && a.totals[0] === coaches, `${a.rows.length}/${coaches}`);
    const d = await walk({ q: `${tag}-c`, state: 'disabled' });
    check('state=disabled returns exactly the disabled accounts', d.rows.length === disabled && d.rows.every((r) => r.disabledAt !== null) && d.totals[0] === disabled, `${d.rows.length}/${disabled}`);
    const act = await walk({ q: `${tag}-c`, state: 'active' });
    const en = await walk({ q: `${tag}-c`, state: 'enabled' });
    check('state=active returns the rest, and the old spelling state=enabled is the same set', act.rows.length === 30 - disabled && act.rows.every((r) => r.disabledAt === null) && en.rows.length === act.rows.length, `${act.rows.length} / ${en.rows.length}`);
    const both = await walk({ q: `${tag}-c`, role: 'coach', state: 'disabled' });
    check('role and state combine (AND)', both.rows.length === exp.filter((r) => r.role === 'coach' && r.disabled !== null).length && both.totals[0] === both.rows.length, `${both.rows.length}`);
    const none = await get(`?q=${tag}-c&role=admin`, adminA);
    check('a filter with no match is an empty page, total 0, no cursor', none.res.status === 200 && none.json.users.length === 0 && none.json.total === 0 && none.json.nextCursor === null, JSON.stringify(none.json?.total));
  }

  // search
  const sp = {};
  {
    const plant = (key, email, name) => {
      sp[key] = Number(run(`INSERT INTO users (email, password_hash, display_name) VALUES (?, 'x', ?)`, email, name).lastInsertRowid);
    };
    plant('sparpad', `sparpad-${stamp}@pelda.hu`, 'Árpád Szűcs');
    plant('spunder', `un_der-${stamp}@pelda.hu`, null);
    plant('spwild', `unxder-${stamp}@pelda.hu`, null);
    plant('sppct', `pct-${stamp}@pelda.hu`, '100% Rost');
    plant('spslash', `bs-${stamp}@pelda.hu`, 'back\\slash');
    const found = async (q) => (await get(`?q=${encodeURIComponent(q)}`, adminA)).json;
    const ids = (j) => (j?.users ?? []).map((u) => u.id);
    check('search is accent-insensitive on the display name: "arpad szucs" finds Árpád Szűcs', ids(await found('arpad szucs')).includes(sp.sparpad), '');
    check('and case-insensitive with accents typed: "ÁRPÁD" and "szűcs" find it', ids(await found('ÁRPÁD')).includes(sp.sparpad) && ids(await found('szűcs')).includes(sp.sparpad), '');
    check('search matches the e-mail too', ids(await found(`bs-${stamp}`)).includes(sp.spslash), '');
    check('a search for a displayed name finds the account by name when the e-mail does not contain it', ids(await found('Rost')).includes(sp.sppct), '');

    const un = await found(`un_der-${stamp}`);
    check('"_" is a literal: "un_der-..." finds the underscore address and NOT "unxder-..."', ids(un).includes(sp.spunder) && !ids(un).includes(sp.spwild) && un.total === 1, `${un.total} ${ids(un)}`);
    const everyone = (await get('', adminA)).json.total;
    const pct = await found('%');
    check('"%" is a literal: it finds only the account that contains a percent sign, not everyone', pct.total === 1 && ids(pct)[0] === sp.sppct && pct.total < everyone, `${pct.total} of ${everyone}`);
    const us = await found('_');
    const rowsHaveUnderscore = us.users.every((u) => foldText(`${u.email} ${u.displayName ?? ''}`).includes('_'));
    check('"_" alone is not a wildcard: every row contains an underscore and the set is smaller than everyone', us.users.length > 0 && rowsHaveUnderscore && us.total < everyone && ids(us).includes(sp.spunder), `${us.total} of ${everyone}`);
    const bs = await found('\\');
    check('"\\" is a literal: it finds only the display name that contains a backslash', bs.total === 1 && ids(bs)[0] === sp.spslash, `${bs.total}`);
    const esc = await found('\\%');
    check('"\\%" matches nothing (a backslash followed by a percent sign appears nowhere)', esc.total === 0, `${esc.total}`);
    const pp = await found('%%');
    check('"%%" is two literal percent signs, not "match everything"', pp.total === 0, `${pp.total}`);
    const blank = await get('?q=%20%20%20', adminA);
    check('a blank search is no search (the whole list, 200)', blank.res.status === 200 && blank.json.total === everyone, `${blank.res.status} ${blank.json?.total}`);
    const sepaccent = await found('éva');
    check('a decomposed accent in the query folds like a composed one ("e" + U+0301 finds Éva)', sepaccent.users.some((u) => (u.displayName ?? '').startsWith('Éva')), `${sepaccent.total}`);
  }
  {
    const longOk = await get(`?q=${'a'.repeat(80)}`, adminA);
    const longBad = await get(`?q=${'a'.repeat(81)}`, adminA);
    const emoji80 = await get(`?q=${encodeURIComponent('🎉'.repeat(80))}`, adminA);
    const emoji81 = await get(`?q=${encodeURIComponent('🎉'.repeat(81))}`, adminA);
    check('q: 80 characters is fine, 81 is a 400 - counted in code points, not UTF-16 units', longOk.res.status === 200 && longBad.res.status === 400 && emoji80.res.status === 200 && emoji81.res.status === 400, `${longOk.res.status} ${longBad.res.status} ${emoji80.res.status} ${emoji81.res.status}`);
    const ctrl = await get('?q=a%00b', adminA);
    const nl = await get('?q=a%0Ab', adminA);
    const bidi = await get('?q=a%E2%80%AEb', adminA);
    check('q: NUL, newline and a bidi override are refused (400)', ctrl.res.status === 400 && nl.res.status === 400 && bidi.res.status === 400, `${ctrl.res.status} ${nl.res.status} ${bidi.res.status}`);
    const arr = await get('?q=a&q=b', adminA);
    const unk = await get('?limit=1000', adminA);
    const unk2 = await get('?page=2', adminA);
    check('q given twice, and any unknown parameter (limit, page), are 400 - the page cap cannot be argued with', arr.res.status === 400 && unk.res.status === 400 && unk2.res.status === 400, `${arr.res.status} ${unk.res.status} ${unk2.res.status}`);
    const bad = await Promise.all([get('?sort=password_hash', adminA), get('?sort=', adminA), get('?dir=up', adminA), get('?role=root', adminA), get('?role=', adminA), get('?state=banned', adminA), get('?sort=email;DROP', adminA)]);
    check('sort / dir / role / state outside their enums are 400 - a sort key is never SQL', bad.every((r) => r.res.status === 400), statuses(bad));
    const injected = await get(`?q=${encodeURIComponent("'; DROP TABLE users; --")}`, adminA);
    check('an SQL fragment in q is just text: 200, no match, the table is still there', injected.res.status === 200 && injected.json.total === 0 && one('SELECT COUNT(*) AS n FROM users').n > 30, `${injected.res.status}`);
  }
  {
    // cursors
    const page1 = await get(`?q=${tag}-c&sort=name&dir=asc`, adminA);
    const good = page1.json.nextCursor;
    const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
    const cases = {
      'not base64 json': 'x',
      'punctuation': '%%%',
      'an empty array': b64([]),
      'an object': b64({ a: 1 }),
      'not json': b64('not json'),
      'three parts': b64(['name', 'asc', 'a']),
      'another sort key': b64(['email', 'asc', 'a', 1]),
      'another direction': b64(['name', 'desc', 'a', 1]),
      'a number where a name belongs': b64(['name', 'asc', 5, 1]),
      'a string where a time belongs (created)': null,
      'a negative id': b64(['name', 'asc', 'a', -1]),
      'a fractional id': b64(['name', 'asc', 'a', 1.5]),
      'a huge id': b64(['name', 'asc', 'a', 9_999_999_999_999]),
      'an id as a string': b64(['name', 'asc', 'a', '1']),
      'over 512 characters': 'A'.repeat(513),
    };
    const out = [];
    for (const [label, c] of Object.entries(cases)) {
      if (c === null) {
        const r = await get(`?q=${tag}-c&sort=created&dir=desc&cursor=${b64(['created', 'desc', 'soon', 1])}`, adminA);
        out.push([label, r.res.status]);
      } else {
        const r = await get(`?q=${tag}-c&sort=name&dir=asc&cursor=${encodeURIComponent(c)}`, adminA);
        out.push([label, r.res.status]);
      }
    }
    check('a garbage, foreign or mistyped cursor is a 400 - never a 500, never a silent restart', out.every(([, s]) => s === 400), out.filter(([, s]) => s !== 400).map(([l, s]) => `${l}:${s}`).join('; ') || 'all 400');
    const reuse = await get(`?q=${tag}-c&sort=name&dir=desc&cursor=${good}`, adminA);
    check('a cursor minted for name/asc is refused on name/desc', reuse.res.status === 400, `${reuse.res.status}`);
    const ok = await get(`?q=${tag}-c&sort=name&dir=asc&cursor=${good}`, adminA);
    check('the real cursor still works and gives the second page', ok.res.status === 200 && ok.json.users.length === 6, `${ok.res.status} ${ok.json?.users?.length}`);
  }

  // forge / IDOR on the list
  {
    const rs = await Promise.all([get('', anon), get('', member.jar), get('', coachJar)]);
    check('the list: no cookie 401, a member 403, a coach 403 - and no row either way', rs[0].res.status === 401 && rs[1].res.status === 403 && rs[2].res.status === 403 && rs.every((r) => !r.json?.users), statuses(rs));
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 2. THE WOUNDED ADMINS — a token that still says admin while the database no longer agrees
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: forged and stale admin tokens (reads and writes) ───────────────');
  const target = await make('target', { name: 'Fehér Tamás' });
  const demoted = await make('demoted', { role: 'admin' });
  const disabledAdmin = await make('disadm', { role: 'admin' });
  const staleSv = await make('stale', { role: 'admin' });
  // warm each one's session-version cache with a successful admin read, THEN wound the database
  for (const [label, w] of [['demoted', demoted], ['disabled', disabledAdmin], ['stale-version', staleSv]]) {
    const r = await get('?q=zzzzzz', w.jar);
    check(`a planted admin (${label}) starts out working`, r.res.status === 200, `${r.res.status}`);
  }
  run("UPDATE users SET role = 'user' WHERE id = ?", demoted.id);
  run('UPDATE users SET disabled_at = unixepoch() WHERE id = ?', disabledAdmin.id);
  run('UPDATE users SET session_version = session_version + 1 WHERE id = ?', staleSv.id);
  {
    const writes = (jar, tid) => [
      () => send('PATCH', `/${tid}/name`, jar, { displayName: 'Hacked Name' }),
      () => send('POST', `/${tid}/reset-lockout`, jar, {}),
      () => send('POST', `/${tid}/signout-all`, jar, {}),
      () => send('POST', `/${tid}/force-password-change`, jar, {}),
    ];
    const snapshot = () => ({
      name: rowOf(target.id).display_name,
      sv: rowOf(target.id).session_version,
      must: rowOf(target.id).must_change_credentials,
      audit: one("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('user.name.change','user.lockout.reset','user.sessions.revoke','user.password.force')").n,
    });
    const before = snapshot();
    // token says admin, database says user: the reads AND the writes refuse (assertAdmin / the transaction)
    // token of a disabled admin, inside the session-version cache window: the same
    for (const [label, w] of [['demoted (the token says admin, the database says user)', demoted], ['disabled (inside the 30 s session cache)', disabledAdmin]]) {
      const rs = await Promise.all([get(`/${target.id}`, w.jar), get('?q=x', w.jar), ...writes(w.jar, target.id).map((f) => f())]);
      check(`${label}: the inspect read, the list and all four writes are 403 even with a valid body`, rs.every((r) => r.res.status === 403), statuses(rs));
    }
    // a token whose session version is stale while the cache still trusts it: the WRITES refuse (the
    // transaction compares the version under the write lock)
    {
      const rs = await Promise.all(writes(staleSv.jar, target.id).map((f) => f()));
      check('stale session version (inside the 30 s session cache): all four writes are 403 even with a valid body', rs.every((r) => r.res.status === 403), statuses(rs));
    }
    const after = snapshot();
    check('and none of those calls changed anything: name, session version, flag and audit log are as they were', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));

    const lowly = await Promise.all([member.jar, coachJar].flatMap((j) => [get(`/${target.id}`, j), ...writes(j, target.id).map((f) => f())]));
    const anonymous = await Promise.all([get(`/${target.id}`, anon), ...writes(anon, target.id).map((f) => f())]);
    check('a member and a coach get 403 on the inspect read and on all four writes, a stranger 401', lowly.every((r) => r.res.status === 403) && anonymous.every((r) => r.res.status === 401), `${statuses(lowly)} | ${statuses(anonymous)}`);
    check('403 gives nothing away: the body is the plain envelope with no account in it', lowly.every((r) => r.json?.code === 'forbidden' && !r.json?.account && !r.json?.email), '');
    const missing403 = await Promise.all([get('/999999999', member.jar), send('PATCH', '/999999999/name', member.jar, { displayName: 'Abc' })]);
    check('IDOR: a non-admin asking about an id that does not exist gets the same 403 as for one that does', missing403.every((r) => r.res.status === 403), statuses(missing403));
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 3. THE INSPECT READ
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: GET /admin/users/:id (one request, everything) ─────────────────');
  {
    const d = await get(`/${target.id}`, adminA);
    check('the inspect read answers 200 with account, sessions, lockout, coaching, marketplace, coins, activity, audit', d.res.status === 200 && ['account', 'sessions', 'lockout', 'coaching', 'marketplace', 'coins', 'activity', 'audit'].every((k) => k in (d.json ?? {})), Object.keys(d.json ?? {}).join(','));
    const a = d.json?.account ?? {};
    check('identity: id, e-mail (read-only), name, role, createdAt, mustChange, disabledAt', a.id === target.id && a.email === target.email && a.displayName === 'Fehér Tamás' && a.role === 'user' && typeof a.createdAt === 'number' && a.mustChange === false && a.disabledAt === null && a.disabled === null && a.isSelf === false, JSON.stringify(a));
    check('sessions: the one login from setup is open, with a start time', d.json?.sessions?.open === 1 && typeof d.json?.sessions?.lastStartedAt === 'number', JSON.stringify(d.json?.sessions));
    check('lockout: nothing locked', d.json?.lockout?.failedLogins === 0 && d.json?.lockout?.lockedUntil === null, JSON.stringify(d.json?.lockout));
    check('coins: balance 0, no entries', d.json?.coins?.balanceMinor === 0 && Array.isArray(d.json?.coins?.entries) && d.json?.coins?.totalEntries === d.json?.coins?.entries.length, JSON.stringify(d.json?.coins));
    check('activity: four counts, all zero for a new account', JSON.stringify(d.json?.activity) === JSON.stringify({ workouts: 0, nutritionLogs: 0, measurements: 0, photos: 0 }), JSON.stringify(d.json?.activity));
    check('marketplace: null for an account without a profile', d.json?.marketplace === null, '');
    check('own account: isSelf is true', (await get(`/${adminAId}`, adminA)).json?.account?.isSelf === true, '');
  }
  {
    // a second login, then lockout, activity, created_by, subscription, profile, posts, report, coins
    await login(target.email);
    run('UPDATE users SET failed_logins = 4, next_login_at = unixepoch() + 900, created_by = ? WHERE id = ?', member.id, target.id);
    run("INSERT INTO body_measurements (client_user_id, metric_key, measured_on, value_x1000) VALUES (?, 'weight', '2026-10-01', 80000), (?, 'weight', '2026-10-02', 79000)", target.id, target.id);
    run("INSERT INTO workout_logs (client_user_id, local_date, status, source, started_at, completed_at) VALUES (?, '2026-10-30', 'completed', 'freestyle', unixepoch() - 4000, unixepoch() - 400)", target.id);
    run("INSERT INTO workout_logs (client_user_id, local_date, status, source, started_at) VALUES (?, '2026-10-31', 'abandoned', 'freestyle', unixepoch() - 4000)", target.id);
    run("UPDATE users SET role = 'coach' WHERE id = ?", target.id);
    run(`INSERT INTO coach_subscriptions (coach_id, tier_key, status, provider, provider_customer_id, provider_subscription_id, current_period_end, updated_at)
         VALUES (?, 'starter', 'active', 'stripe', 'cus_SECRETXYZ789', 'sub_SECRETXYZ789', unixepoch() + 86400, unixepoch())`, target.id);
    run('INSERT INTO coach_clients (coach_id, client_id, status) VALUES (?, ?, ?), (?, ?, ?)', target.id, cohortIds[1], 'active', target.id, cohortIds[2], 'invited');
    run('INSERT INTO coach_clients (coach_id, client_id, status) VALUES (?, ?, ?)', cohortIds[14], target.id, 'active');
    run("INSERT INTO coach_profiles (user_id, handle, display_name) VALUES (?, ?, 'Fehér Tamás')", target.id, `tamas-${stamp}`.slice(0, 32));
    const kind = one('SELECT key FROM post_kinds WHERE active = 1 AND allows_price = 0 AND requires_event_at = 0 LIMIT 1')?.key
      ?? one('SELECT key FROM post_kinds WHERE active = 1 AND requires_event_at = 0 LIMIT 1').key;
    const post = (pid, extra) =>
      run(`INSERT INTO coach_posts (public_id, author_user_id, kind_key, title, body_src, body_doc, body_excerpt, doc_version ${extra.cols})
           VALUES (?, ?, ?, 'Probe post title', 'body', '{}', 'body', 1 ${extra.vals})`, pid, target.id, kind, ...extra.params);
    let planted = true;
    try {
      post(`dr${stamp}`.slice(0, 12).padEnd(12, 'a'), { cols: '', vals: '', params: [] });
      post(`wd${stamp}`.slice(0, 12).padEnd(12, 'b'), { cols: ', deleted_at', vals: ', unixepoch()', params: [] });
      post(`rm${stamp}`.slice(0, 12).padEnd(12, 'c'), { cols: ', removed_at, removed_by, removal_reason', vals: ', unixepoch(), ?, ?', params: [adminAId, 'probe'] });
      const postId = one('SELECT id FROM coach_posts WHERE author_user_id = ? ORDER BY id LIMIT 1', target.id).id;
      run(`INSERT INTO content_reports (subject_post_id, subject_author_user_id, reporter_user_id, reason_key, note, body_snapshot, request_id)
           VALUES (?, ?, ?, 'spam', 'probe', 'body', 'smoke-probe')`, postId, target.id, member.id);
    } catch (err) {
      planted = false;
      console.error(`  could not plant the marketplace rows: ${err.message}`);
    }
    check('the marketplace probe rows could be planted (profile, three posts, one open report)', planted, '');
    // coin adjustments through the real route, so the ledger has admin entries with notes
    await call(`${API}/admin/users/${target.id}/coins`, { method: 'POST', jar: adminA, body: { amount_minor: 50000, note: 'Teszt jóváírás', idempotency_key: uniq('cadj') } });
    await call(`${API}/admin/users/${target.id}/coins`, { method: 'POST', jar: adminA, body: { amount_minor: -1500, note: 'Levonás', idempotency_key: uniq('cadj') } });

    const d = await get(`/${target.id}`, adminA);
    const j = d.json ?? {};
    check('sessions: two logins are two open sessions', j.sessions?.open === 2, JSON.stringify(j.sessions));
    check('lockout: failed attempts and the time it lifts', j.lockout?.failedLogins === 4 && j.lockout?.lockedUntil > nowSec() + 800, JSON.stringify(j.lockout));
    check('createdBy names the creator (id, name, e-mail)', j.account?.createdBy?.id === member.id && j.account?.createdBy?.email === member.email, JSON.stringify(j.account?.createdBy));
    check('coaching as a coach: 1 active, 1 invited, 0 archived, the starter cap of 10', j.coaching?.asCoach?.activeClients === 1 && j.coaching?.asCoach?.links?.invited === 1 && j.coaching?.asCoach?.links?.archived === 0 && j.coaching?.asCoach?.clientCap === 10 && j.coaching?.asCoach?.capExempt === false, JSON.stringify(j.coaching?.asCoach));
    check('coaching as a client: one active coach link', j.coaching?.asClient?.links?.active === 1, JSON.stringify(j.coaching?.asClient));
    check('subscription: tier, status and period end - and NO provider identifier anywhere in the response', j.coaching?.subscription?.tierKey === 'starter' && j.coaching?.subscription?.status === 'active' && typeof j.coaching?.subscription?.currentPeriodEnd === 'number' && !JSON.stringify(j).includes('SECRETXYZ789'), JSON.stringify(j.coaching?.subscription));
    check('marketplace: handle, unpublished, unverified, posts by state (1 draft, 1 withdrawn, 1 removed), 1 open report', j.marketplace?.handle?.startsWith('tamas-') && j.marketplace?.published === false && j.marketplace?.verified === false && j.marketplace?.removed === false && j.marketplace?.posts?.draft === 1 && j.marketplace?.posts?.withdrawn === 1 && j.marketplace?.posts?.removed === 1 && j.marketplace?.posts?.live === 0 && j.marketplace?.openReports === 1, JSON.stringify(j.marketplace));
    check('coins: balance 485, the last entries newest first with the admin notes, the total count', j.coins?.balanceMinor === 48500 && j.coins?.entries?.[0]?.amountMinor === -1500 && j.coins?.entries?.[0]?.note === 'Levonás' && j.coins?.entries?.[1]?.note === 'Teszt jóváírás' && j.coins?.totalEntries >= 2 && j.coins?.entries?.length <= 3, JSON.stringify(j.coins));
    check('activity: counts only - 1 completed workout (the abandoned one is not counted), 2 measurements', j.activity?.workouts === 1 && j.activity?.measurements === 2 && j.activity?.nutritionLogs === 0 && j.activity?.photos === 0 && Object.values(j.activity).every((v) => typeof v === 'number'), JSON.stringify(j.activity));
    check('audit: at most 5 events with action, time, actor e-mail and request id - and no detail', Array.isArray(j.audit) && j.audit.length >= 2 && j.audit.length <= 5 && j.audit.every((e) => 'action' in e && 'createdAt' in e && 'actorEmail' in e && 'requestId' in e && !('detail' in e)) && j.audit[0].actorEmail === seeded.admin.email && j.audit[0].action === 'coin.admin.adjust', JSON.stringify(j.audit?.[0]));
    const text = JSON.stringify(j);
    const forbidden = [/password/i, /hash/i, /session_?version/i, /token/i, /provider/i, /\$argon2/, /next_?login/i].filter((re) => re.test(text));
    check('the response holds no hash, token, session version or provider id (key or value)', forbidden.length === 0, forbidden.join(' '));
    check('privacy: nothing but counts about health content - no dates, titles, values or notes of any log', !/2026-10-0|measured|weight|local_?date|taken_?on/i.test(text.replace(/"createdAt"|"lastStartedAt"/g, '')), '');
    check('the projection is stable: no key outside the documented set', Object.keys(j).sort().join() === 'account,activity,audit,coaching,coins,lockout,marketplace,sessions', Object.keys(j).sort().join());
    run("UPDATE users SET role = 'user', failed_logins = 0, next_login_at = 0 WHERE id = ?", target.id);
  }
  {
    // The admin cap exemption
    const d = await get(`/${adminAId}`, adminA);
    check('an admin has no seat cap (capExempt, clientCap null)', d.json?.coaching?.asCoach?.capExempt === true && d.json?.coaching?.asCoach?.clientCap === null, JSON.stringify(d.json?.coaching?.asCoach));
    const bad = await Promise.all(['abc', '-1', '0', '01', '1e3', '0x10', '%205', '99999999999', '2147483648', '1.5', '9007199254740993'].map((id) => get(`/${id}`, adminA)));
    check('malformed ids (string, negative, zero, leading zero, exponent, hex, space, over 32 bits, fraction) are 400, never a lookup', bad.every((r) => r.res.status === 400), statuses(bad));
    const gone = await Promise.all([get('/999999999', adminA), get('/2147483647', adminA)]);
    check('a well-formed id that does not exist is 404 with the plain envelope', gone.every((r) => r.res.status === 404 && r.json?.code === 'not_found' && !r.json?.account), statuses(gone));
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 4. PATCH /admin/users/:id/name
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: PATCH name ─────────────────────────────────────────────────────');
  {
    const t = await make('naming');
    const before = audits('user.name.change', t.id);
    const r = await send('PATCH', `/${t.id}/name`, adminA, { displayName: '  Fehér Tamás  ' });
    check('the admin sets a name (trimmed) and gets the account back', r.res.status === 200 && r.json?.account?.displayName === 'Fehér Tamás' && r.json?.replayed === false && r.json?.account?.id === t.id, JSON.stringify(r.json));
    check('the user sees it on GET /auth/me', (await call(`${API}/auth/me`, { jar: t.jar })).json?.user?.display_name === 'Fehér Tamás', '');
    check('one audit row (user.name.change) with the admin as the actor', audits('user.name.change', t.id) === before + 1 && one("SELECT actor_id AS a FROM audit_log WHERE action = 'user.name.change' AND target_id = ? ORDER BY id DESC", t.id).a === adminAId, '');
    const detail = one("SELECT detail FROM audit_log WHERE action = 'user.name.change' AND target_id = ? ORDER BY id DESC", t.id).detail;
    check('the audit row carries no name (it survives erasure)', !detail.includes('Fehér') && !detail.includes('Tamás'), detail);

    const again = await send('PATCH', `/${t.id}/name`, adminA, { displayName: 'Fehér Tamás' });
    check('replay: the same name again is replayed:true and writes no second audit row', again.res.status === 200 && again.json?.replayed === true && audits('user.name.change', t.id) === before + 1, JSON.stringify(again.json?.replayed));
    const clear = await send('PATCH', `/${t.id}/name`, adminA, { displayName: null });
    check('null clears the name', clear.res.status === 200 && clear.json?.account?.displayName === null && rowOf(t.id).display_name === null, '');
    const clearAgain = await send('PATCH', `/${t.id}/name`, adminA, { displayName: null });
    check('clearing a cleared name is a replay', clearAgain.json?.replayed === true && audits('user.name.change', t.id) === before + 2, '');
    const self = await send('PATCH', `/${adminAId}/name`, adminA, { displayName: 'Admin Ádám' });
    check('editing your own name is allowed', self.res.status === 200 && self.json?.account?.id === adminAId, `${self.res.status}`);
    run('UPDATE users SET display_name = NULL WHERE id = ?', adminAId);

    // race: two concurrent identical calls = one effect
    const t2 = await make('naming2');
    const pair = await Promise.all([send('PATCH', `/${t2.id}/name`, adminA, { displayName: 'Közös Név' }), send('PATCH', `/${t2.id}/name`, adminA, { displayName: 'Közös Név' })]);
    const applied = pair.filter((r) => r.res.status === 200 && r.json?.replayed === false).length;
    check('race: two simultaneous identical name sets - exactly one is applied, the other is the replay', applied === 1 && pair.every((r) => r.res.status === 200) && audits('user.name.change', t2.id) === 1, `${statuses(pair)} applied ${applied} audit ${audits('user.name.change', t2.id)}`);
    // two admins, two different names at once: the end state is one of them, one audit row per applied call
    const adminB = await make('namingB', { role: 'admin' });
    const t3 = await make('naming3');
    const dup = await Promise.all([send('PATCH', `/${t3.id}/name`, adminA, { displayName: 'Első Név' }), send('PATCH', `/${t3.id}/name`, adminB.jar, { displayName: 'Második Név' })]);
    const finalName = rowOf(t3.id).display_name;
    check('race: two admins naming the same account at once - both answered, the end state is exactly one of the two names, one audit row each', dup.every((r) => r.res.status === 200) && ['Első Név', 'Második Név'].includes(finalName) && audits('user.name.change', t3.id) === dup.filter((r) => r.json?.replayed === false).length, `${statuses(dup)} ${finalName}`);

    // forge: shape
    const f = async (body) => (await send('PATCH', `/${t.id}/name`, adminA, body)).res.status;
    const shape = {
      'unknown field': await f({ displayName: 'Valaki', role: 'admin' }),
      'email field': await f({ displayName: 'Valaki', email: 'x@y.hu' }),
      'missing field': await f({}),
      'a number': await f({ displayName: 5 }),
      'an array': await f({ displayName: ['A', 'B'] }),
      'an object': await f({ displayName: { a: 1 } }),
      'a boolean': await f({ displayName: true }),
      'undefined-as-string': await f({ displayName: undefined }),
    };
    check('forge: unknown fields, a missing field and wrong types are all 400 (the e-mail cannot be sent at all)', Object.values(shape).every((s) => s === 400), JSON.stringify(shape));
    const ids = await Promise.all(['abc', '-1', '0', '99999999999'].map((id) => send('PATCH', `/${id}/name`, adminA, { displayName: 'Valaki' })));
    check('forge: id as a string, negative, zero, huge -> 400', ids.every((x) => x.res.status === 400), statuses(ids));
    const miss = await send('PATCH', '/999999999/name', adminA, { displayName: 'Valaki' });
    check('IDOR: an unknown account is 404, and nothing was written for it', miss.res.status === 404 && miss.json?.code === 'not_found', `${miss.res.status}`);
    check('the e-mail has no route at all (PATCH /email and PUT /:id are 404)', (await send('PATCH', `/${t.id}/email`, adminA, { email: 'a@b.hu' })).res.status === 404 && (await send('PUT', `/${t.id}`, adminA, { email: 'a@b.hu' })).res.status === 404, '');

    // extremes - and parity with the user's own PATCH /auth/me
    const probes = [
      ['two letters', 'Ab'], ['one letter', 'A'], ['only spaces', '    '], ['120 characters', 'x'.repeat(120)], ['121 characters', 'x'.repeat(121)],
      ['120 emoji (240 UTF-16 units)', '🎉'.repeat(120)], ['121 emoji', '🎉'.repeat(121)], ['one emoji', '🎉'], ['two emoji', '🎉🎉'],
      ['newline', 'A\nB'], ['NUL', 'A\u0000B'], ['tab', 'A\tB'], ['bidi override U+202E', 'A\u202EB'], ['bidi isolate U+2066', 'A\u2066B'], ['DEL', 'A\u007FB'], ['C1 U+0085', 'A\u0085B'],
      ['zero-width joiner between letters (refused since B-admin-polish: renders as "AB")', 'A\u200DB'], ['emoji ZWJ sequence (allowed)', 'Ab \u{1F469}\u200D\u{1F4BB}'], ['decomposed accent', 'Éva'], ['Hebrew', 'דוד כהן'], ['Arabic', 'محمد علي'], ['leading and trailing spaces', '  Ab  '],
    ];
    const mine = await make('parity');
    const rows = [];
    for (const [label, value] of probes) {
      const viaAdmin = (await send('PATCH', `/${mine.id}/name`, adminA, { displayName: value })).res.status;
      const viaSelf = (await call(`${API}/auth/me`, { method: 'PATCH', jar: mine.jar, body: { displayName: value } })).res.status;
      rows.push([label, viaAdmin, viaSelf]);
    }
    const expectOk = new Set(['two letters', '120 characters', '120 emoji (240 UTF-16 units)', 'two emoji', 'emoji ZWJ sequence (allowed)', 'decomposed accent', 'Hebrew', 'Arabic', 'leading and trailing spaces']);
    check('extremes: 120 code points pass and 121 fail; emoji count as one; controls and bidi marks fail; Hebrew, Arabic and accents pass', rows.every(([l, a]) => (expectOk.has(l) ? a === 200 : a === 400)), rows.filter(([l, a]) => (expectOk.has(l) ? a !== 200 : a !== 400)).map((x) => x.join(':')).join('; ') || 'as expected');
    check('and the admin route answers EXACTLY what the user\'s own PATCH /auth/me answers for every one of them (one shared validator)', rows.every(([, a, s]) => a === s), rows.filter(([, a, s]) => a !== s).map((x) => x.join(':')).join('; ') || `${rows.length} probes agree`);
    const ok120 = await send('PATCH', `/${mine.id}/name`, adminA, { displayName: '🎉'.repeat(120) });
    check('120 emoji is stored (the database CHECK counts characters, not UTF-16 units)', ok120.res.status === 200 && [...(rowOf(mine.id).display_name ?? '')].length === 120, `${ok120.res.status}`);
    const trimmed = await send('PATCH', `/${mine.id}/name`, adminA, { displayName: '  Ab  ' });
    check('a name is stored trimmed', trimmed.json?.account?.displayName === 'Ab' && rowOf(mine.id).display_name === 'Ab', '');
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 5. POST /admin/users/:id/reset-lockout
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: POST reset-lockout ─────────────────────────────────────────────');
  {
    const t = await make('locked');
    run('UPDATE users SET failed_logins = 6, next_login_at = unixepoch() + 900 WHERE id = ?', t.id);
    const blocked = await call(`${API}/auth/login`, { method: 'POST', body: { email: t.email, password: PASSWORD } });
    check('setup: the locked account cannot sign in (429)', blocked.res.status === 429, `${blocked.res.status}`);
    const before = audits('user.lockout.reset', t.id);
    const r = await send('POST', `/${t.id}/reset-lockout`, adminA, {});
    check('reset-lockout: 200, replayed:false, the account comes back', r.res.status === 200 && r.json?.replayed === false && r.json?.account?.id === t.id, JSON.stringify(r.json));
    check('the counter and the wait are cleared in the database', rowOf(t.id).failed_logins === 0 && rowOf(t.id).next_login_at === 0, '');
    check('one audit row (user.lockout.reset)', audits('user.lockout.reset', t.id) === before + 1, '');
    check('and the person can sign in again', (await call(`${API}/auth/login`, { method: 'POST', body: { email: t.email, password: PASSWORD } })).res.status === 200, '');
    const again = await send('POST', `/${t.id}/reset-lockout`, adminA, {});
    check('replay: nothing left to reset -> replayed:true, no second audit row', again.json?.replayed === true && audits('user.lockout.reset', t.id) === before + 1, '');
    const noBody = await call(U(`/${t.id}/reset-lockout`), { method: 'POST', jar: adminA });
    check('the body is optional (none at all is fine)', noBody.res.status === 200, `${noBody.res.status}`);

    run('UPDATE users SET failed_logins = 3, next_login_at = unixepoch() + 600 WHERE id = ?', t.id);
    const race = await Promise.all([send('POST', `/${t.id}/reset-lockout`, adminA, {}), send('POST', `/${t.id}/reset-lockout`, adminA, {})]);
    check('race: two simultaneous resets - exactly one applied, one audit row', race.filter((x) => x.json?.replayed === false).length === 1 && race.every((x) => x.res.status === 200) && audits('user.lockout.reset', t.id) === before + 2, `${statuses(race)} ${audits('user.lockout.reset', t.id)}`);
    const expired = await make('expired');
    run('UPDATE users SET failed_logins = 0, next_login_at = unixepoch() - 500 WHERE id = ?', expired.id);
    check('a wait that has already run out (and no failures) is nothing to reset: replay', (await send('POST', `/${expired.id}/reset-lockout`, adminA, {})).json?.replayed === true, '');
    run('UPDATE users SET failed_logins = 2, next_login_at = 0 WHERE id = ?', expired.id);
    check('failures below the backoff threshold still count as a lockout counter and are cleared', (await send('POST', `/${expired.id}/reset-lockout`, adminA, {})).json?.replayed === false && rowOf(expired.id).failed_logins === 0, '');

    const forge = await Promise.all([send('POST', `/${t.id}/reset-lockout`, adminA, { reason: 'x' }), send('POST', `/${t.id}/reset-lockout`, adminA, { id: 1 }), send('POST', '/abc/reset-lockout', adminA, {}), send('POST', '/0/reset-lockout', adminA, {}), send('POST', '/-3/reset-lockout', adminA, {}), send('POST', '/99999999999/reset-lockout', adminA, {})]);
    check('forge: any body field, and an id as a string / zero / negative / huge, is a 400', forge.every((x) => x.res.status === 400), statuses(forge));
    check('IDOR: an unknown account is 404', (await send('POST', '/999999999/reset-lockout', adminA, {})).res.status === 404, '');
    const disabledT = await make('lockdis');
    run('UPDATE users SET failed_logins = 5, disabled_at = unixepoch() WHERE id = ?', disabledT.id);
    check('a disabled account\'s lockout can be reset (it still cannot sign in)', (await send('POST', `/${disabledT.id}/reset-lockout`, adminA, {})).json?.replayed === false, '');
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 6. POST /admin/users/:id/signout-all
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: POST signout-all ───────────────────────────────────────────────');
  {
    const t = await make('signout');
    const second = await login(t.email);
    check('setup: two live sessions, both work', (await call(`${API}/auth/me`, { jar: t.jar })).res.status === 200 && (await call(`${API}/auth/me`, { jar: second })).res.status === 200, '');
    const before = audits('user.sessions.revoke', t.id);
    const svBefore = rowOf(t.id).session_version;
    const r = await send('POST', `/${t.id}/signout-all`, adminA, {});
    check('signout-all: 200, replayed:false, and it reports how many sessions it ended (2)', r.res.status === 200 && r.json?.replayed === false && r.json?.sessions === 2 && r.json?.selfSignedOut === false, JSON.stringify(r.json));
    check('the session version moved and every refresh token is revoked', rowOf(t.id).session_version === svBefore + 1 && one('SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ? AND revoked = 0', t.id).n === 0, '');
    check('both access tokens die on the very next request (401)', (await call(`${API}/auth/me`, { jar: t.jar })).res.status === 401 && (await call(`${API}/auth/me`, { jar: second })).res.status === 401, '');
    check('and the refresh cookie cannot bring them back', (await call(`${API}/auth/refresh`, { method: 'POST', jar: t.jar })).res.status === 401, '');
    check('one audit row (user.sessions.revoke)', audits('user.sessions.revoke', t.id) === before + 1, '');
    const dd = await get(`/${t.id}`, adminA);
    check('the inspect read now shows 0 open sessions', dd.json?.sessions?.open === 0, JSON.stringify(dd.json?.sessions));
    const again = await send('POST', `/${t.id}/signout-all`, adminA, {});
    check('replay: no open session left -> replayed:true, sessions 0, no second audit row, no second version bump', again.json?.replayed === true && again.json?.sessions === 0 && audits('user.sessions.revoke', t.id) === before + 1 && rowOf(t.id).session_version === svBefore + 1, JSON.stringify(again.json));
    check('the person can sign in again afterwards', (await login(t.email)) !== null, '');

    const t2 = await make('signout2');
    const race = await Promise.all([send('POST', `/${t2.id}/signout-all`, adminA, {}), send('POST', `/${t2.id}/signout-all`, adminA, {})]);
    check('race: two simultaneous sign-outs - exactly one applied, one audit row', race.filter((x) => x.json?.replayed === false).length === 1 && race.every((x) => x.res.status === 200) && audits('user.sessions.revoke', t2.id) === 1, `${statuses(race)} ${audits('user.sessions.revoke', t2.id)}`);

    // two admins acting on each other: exactly one effect
    const p = await make('mutualA', { role: 'admin' });
    const q = await make('mutualB', { role: 'admin' });
    const mutual = await Promise.all([send('POST', `/${q.id}/signout-all`, p.jar, {}), send('POST', `/${p.id}/signout-all`, q.jar, {})]);
    const wins = mutual.filter((x) => x.res.status === 200 && x.json?.replayed === false).length;
    const losers = mutual.filter((x) => !(x.res.status === 200 && x.json?.replayed === false));
    check('race: two admins signing each other out at the same instant - exactly one wins, the other is refused (401/403), one audit row in total', wins === 1 && losers.every((x) => x.res.status === 401 || x.res.status === 403) && audits('user.sessions.revoke', p.id) + audits('user.sessions.revoke', q.id) === 1, `${statuses(mutual)}`);

    // yourself
    const me = await make('selfout', { role: 'admin' });
    const own = await send('POST', `/${me.id}/signout-all`, me.jar, {});
    check('signing yourself out is allowed, says so (selfSignedOut) and clears your cookies', own.res.status === 200 && own.json?.selfSignedOut === true && own.res.headers.getSetCookie().some((c) => /^access=;|expires=Thu, 01 Jan 1970/i.test(c)), `${own.res.status} ${own.json?.selfSignedOut}`);
    check('and the admin session is really over (401)', (await get('?q=x', me.jar)).res.status === 401, '');

    const forge = await Promise.all([send('POST', `/${t.id}/signout-all`, adminA, { all: true }), send('POST', '/abc/signout-all', adminA, {}), send('POST', '/99999999999/signout-all', adminA, {})]);
    check('forge: body fields and bad ids are 400', forge.every((x) => x.res.status === 400), statuses(forge));
    check('IDOR: an unknown account is 404', (await send('POST', '/999999999/signout-all', adminA, {})).res.status === 404, '');
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 7. POST /admin/users/:id/force-password-change
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: POST force-password-change ─────────────────────────────────────');
  {
    const t = await make('forcepw');
    const before = audits('user.password.force', t.id);
    const r = await send('POST', `/${t.id}/force-password-change`, adminA, {});
    check('force-password-change: 200, replayed:false', r.res.status === 200 && r.json?.replayed === false && r.json?.account?.mustChange === true, JSON.stringify(r.json));
    check('the flag is set, the version bumped, the refresh tokens revoked', rowOf(t.id).must_change_credentials === 1 && one('SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ? AND revoked = 0', t.id).n === 0, '');
    check('the old session is dead (401)', (await call(`${API}/auth/me`, { jar: t.jar })).res.status === 401, '');
    check('one audit row (user.password.force)', audits('user.password.force', t.id) === before + 1, '');
    const jar = await login(t.email);
    check('the person can still sign in, but reaches nothing except /auth/me, change-credentials and logout', jar !== null && (await call(`${API}/auth/me`, { jar })).res.status === 200 && (await call(`${API}/coins/wallet`, { jar })).res.status === 403, '');
    const list = await get(`?q=${encodeURIComponent(t.email)}`, adminA);
    check('the list shows the flag (mustChange 1)', list.json?.users?.[0]?.mustChange === 1, JSON.stringify(list.json?.users?.[0]?.mustChange));
    // B-admin-polish (security review admin v2, S3): forcing again while the flagged person IS signed
    // in ends that session - it used to be a replay that left it alive. With nothing signed in it is
    // a replay, as before.
    const again = await send('POST', `/${t.id}/force-password-change`, adminA, {});
    check('already flagged but signed in -> applied, that session ends', again.json?.replayed === false && audits('user.password.force', t.id) === before + 2 && (await call(`${API}/auth/me`, { jar })).res.status === 401, JSON.stringify(again.json));
    const third = await send('POST', `/${t.id}/force-password-change`, adminA, {});
    check('replay: already flagged and nothing signed in -> replayed:true, no new audit row', third.json?.replayed === true && audits('user.password.force', t.id) === before + 2, JSON.stringify(third.json));
    const jarAgain = await login(t.email);
    const changed = await call(`${API}/auth/change-credentials`, { method: 'POST', jar: jarAgain, body: { currentPassword: PASSWORD, password: 'BrandNewPass123y' } });
    check('and the person clears the flag by choosing a new password', changed.res.status === 200 && rowOf(t.id).must_change_credentials === 0, `${changed.res.status}`);

    const t2 = await make('forcepw2');
    const race = await Promise.all([send('POST', `/${t2.id}/force-password-change`, adminA, {}), send('POST', `/${t2.id}/force-password-change`, adminA, {})]);
    check('race: two simultaneous forces - exactly one applied, one audit row', race.filter((x) => x.json?.replayed === false).length === 1 && race.every((x) => x.res.status === 200) && audits('user.password.force', t2.id) === 1, `${statuses(race)}`);

    const me = await make('selfforce', { role: 'admin' });
    const own = await send('POST', `/${me.id}/force-password-change`, me.jar, {});
    check('doing it to yourself ends your own session and says so', own.res.status === 200 && own.json?.selfSignedOut === true && (await get('?q=x', me.jar)).res.status === 401, `${own.res.status}`);

    const forge = await Promise.all([send('POST', `/${t.id}/force-password-change`, adminA, { password: 'x' }), send('POST', '/-1/force-password-change', adminA, {}), send('POST', '/1e3/force-password-change', adminA, {})]);
    check('forge: body fields and bad ids are 400', forge.every((x) => x.res.status === 400), statuses(forge));
    check('IDOR: an unknown account is 404', (await send('POST', '/999999999/force-password-change', adminA, {})).res.status === 404, '');
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════════
   * 8. enable needs a reason; disable stays; the coin adjustment refuses your own wallet
   * ═════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── admin accounts: enable with a required reason, disable reason on the page, own coins ──');
  {
    const t = await make('toggle');
    const dis = await send('POST', `/${t.id}/disable`, adminA, { reason: 'Sértő üzenetek' });
    check('disable (existing route, reason required) still works', dis.res.status === 200 && dis.json?.account?.disabledAt > 0, `${dis.res.status}`);
    const d = await get(`/${t.id}`, adminA);
    check('the inspect read shows who disabled the account, when and WHY', d.json?.account?.disabled?.reason === 'Sértő üzenetek' && d.json?.account?.disabled?.by?.email === seeded.admin.email && d.json?.account?.disabled?.at === d.json?.account?.disabledAt, JSON.stringify(d.json?.account?.disabled));
    const listRow = (await get(`?q=${encodeURIComponent(t.email)}`, adminA)).json?.users?.[0];
    check('and the list row of a disabled account has disabledAt set', listRow?.disabledAt > 0, '');

    const noBody = await call(U(`/${t.id}/enable`), { method: 'POST', jar: adminA });
    const empty = await send('POST', `/${t.id}/enable`, adminA, {});
    const blank = await send('POST', `/${t.id}/enable`, adminA, { reason: '   ' });
    const longR = await send('POST', `/${t.id}/enable`, adminA, { reason: 'x'.repeat(2001) });
    const extra = await send('POST', `/${t.id}/enable`, adminA, { reason: 'ok', role: 'admin' });
    const num = await send('POST', `/${t.id}/enable`, adminA, { reason: 5 });
    check('enable WITHOUT a reason is refused: no body, {}, blank, 2001 characters, extra field, wrong type -> 400, and the account stays disabled', [noBody, empty, blank, longR, extra, num].every((x) => x.res.status === 400) && rowOf(t.id).disabled_at !== null, statuses([noBody, empty, blank, longR, extra, num]));
    const before = audits('user.enable', t.id);
    const en = await send('POST', `/${t.id}/enable`, adminA, { reason: 'Bocsánatot kért' });
    check('enable with a reason works', en.res.status === 200 && en.json?.account?.disabledAt === null && rowOf(t.id).disabled_at === null && en.json?.replayed === false, JSON.stringify(en.json));
    const detail = one("SELECT detail FROM audit_log WHERE action = 'user.enable' AND target_id = ? ORDER BY id DESC", t.id).detail;
    check('the audit row carries the reason', audits('user.enable', t.id) === before + 1 && JSON.parse(detail).reason === 'Bocsánatot kért', detail);
    const rep = await send('POST', `/${t.id}/enable`, adminA, { reason: 'újra' });
    check('replay: enabling an enabled account is replayed:true, no second audit row', rep.json?.replayed === true && audits('user.enable', t.id) === before + 1, '');
    check('IDOR: an unknown account is 404; a member is refused 403', (await send('POST', '/999999999/enable', adminA, { reason: 'x' })).res.status === 404 && (await send('POST', `/${t.id}/enable`, member.jar, { reason: 'x' })).res.status === 403, '');
    check('the admin cannot disable themselves (409), as before', (await send('POST', `/${adminAId}/disable`, adminA, { reason: 'x' })).res.status === 409, '');
  }
  {
    const ledger = () => one('SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ?', adminAId).n;
    const before = ledger();
    const own = await call(`${API}/admin/users/${adminAId}/coins`, { method: 'POST', jar: adminA, body: { amount_minor: 1000, note: 'saját', idempotency_key: uniq('selfadj') } });
    check('an admin adjusting their OWN coins is refused: 409 cannot_adjust_own_coins', own.res.status === 409 && own.json?.reason === 'cannot_adjust_own_coins' && own.json?.code === 'conflict', `${own.res.status} ${own.json?.reason}`);
    const debit = await call(`${API}/admin/users/${adminAId}/coins`, { method: 'POST', jar: adminA, body: { amount_minor: -1000, note: 'saját', idempotency_key: uniq('selfadj') } });
    check('in either direction, and nothing is written to the ledger or the audit log', debit.res.status === 409 && ledger() === before && one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'coin.admin.adjust' AND target_id = ?", adminAId).n === 0, `${debit.res.status}`);
    const t = await make('wallet');
    const other = await call(`${API}/admin/users/${t.id}/coins`, { method: 'POST', jar: adminA, body: { amount_minor: 1000, note: 'rendben', idempotency_key: uniq('okadj') } });
    check('and adjusting somebody else\'s wallet still works', other.res.status === 200, `${other.res.status}`);
    const adminB = await make('walletadm', { role: 'admin' });
    const cross = await call(`${API}/admin/users/${adminAId}/coins`, { method: 'POST', jar: adminB.jar, body: { amount_minor: 100, note: 'másik admin', idempotency_key: uniq('okadj') } });
    check('another admin may adjust this admin\'s wallet (the rule is about your own)', cross.res.status === 200, `${cross.res.status}`);
  }

  conn.close();
}
