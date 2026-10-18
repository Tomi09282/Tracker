// scripts/smoke/lifeos-focus.js — focus sessions (migration 035) and the LifeOS statistics against
// the running server.
//
// Imported by scripts/smoke.js after the habits / tasks section. The two coin-relevant focus
// endpoints — POST /focus/:id/finish (pays) and POST /focus/:id/checkin (raises the bonus the
// finish pays) — walk the five passes of the plan's adversarial table:
//
//   FORGE    a body / param the schema must refuse (.strict(), bounded, regex) — no client amount,
//            minute count or finish time ever reaches a payout, and no start can be back-dated
//   REPLAY   the same request twice moves nothing twice
//   RACE     concurrent requests settle on exactly one effect
//   IDOR     another account's session is a 404 and moves nothing on either side
//   EXTREMES the bounds of every number and string, one open session, planned / closed blocks
//
// "A block that started 46 minutes ago" cannot be reached over HTTP in a test that must finish in
// seconds, so it is planted straight into the throwaway smoke database (lifeos-core.js's
// technique). Every ASSERTION goes through the API.

export async function lifeosFocusSmoke({ call, check, Jar, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const dates = await import('../../src/lifeos/dates.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);

  const TZ = 'Europe/Budapest';
  let n = 0;
  const key = (p = 'f') => `${p}-${stamp}-${(n += 1).toString().padStart(4, '0')}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const nowSec = () => Math.floor(Date.now() / 1000);
  const today = () => dates.dayKeyFor(Date.now(), TZ, 4);

  const register = async (label, { zone = true } = {}) => {
    const jar = new Jar();
    const email = `lifeos-focus-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    if (zone) await call('/api/v1/me/prefs', { method: 'PATCH', jar, body: { timezone: TZ } });
    return { jar, id };
  };
  const wallet = async (u) => (await call('/api/v1/coins/wallet', { jar: u.jar })).json?.balanceMinor;
  const focusEvents = (u) => one(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS s FROM coin_events WHERE user_id = ? AND reason_key = 'focus.finish'`, u.id);
  /** A block that started `minutesAgo` minutes ago, planted as the start transaction would write it. */
  const plant = (u, { minutesAgo, minutes = 50, checkinMinutes = 15 }) => Number(run(
    `INSERT INTO focus_sessions (user_id, client_key, title, created_on, starts_at, planned_minutes, checkin_minutes, rules_version)
     VALUES (?, ?, 'Szakdolgozat – 3. fejezet', ?, ?, ?, ?, 1)`,
    u.id, key('plant'), today(), nowSec() - minutesAgo * 60 - 5, minutes, checkinMinutes,
  ).lastInsertRowid);

  /* ── POST /focus ─────────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: focus sessions (POST /focus, /focus/:id/checkin | finish | cancel) ───');
  {
    const noZone = await register('nozone', { zone: false });
    const r = await call('/api/v1/focus', { method: 'POST', jar: noZone.jar, body: { clientKey: key(), title: 'x', minutes: 25, checkinMinutes: 0 } });
    check('a focus block cannot start before the zone is set (409 TIMEZONE_REQUIRED)', r.res.status === 409 && r.json?.code === 'TIMEZONE_REQUIRED', `${r.res.status} ${r.json?.code}`);
    const anon = await call('/api/v1/focus/current');
    check('an anonymous caller is refused (401)', anon.res.status === 401, `${anon.res.status}`);
  }

  const fia = await register('fia');
  {
    const body = (extra) => ({ clientKey: key(), title: 'Mélymunka', minutes: 50, checkinMinutes: 15, ...extra });
    const bad = await Promise.all([
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ minutes: 4 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ minutes: 721 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ minutes: 25.5 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ checkinMinutes: 3 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ checkinMinutes: 181 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ title: '   ' }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ title: 'x'.repeat(121) }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ title: 'a\u0007b' }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ amountMinor: 99999 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ startAt: 'now' }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ clientKey: 'buy:12345678' }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ startAt: nowSec() - 600 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({ startAt: nowSec() + 25 * 3600 }) }),
      call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: body({}), csrf: false }),
    ]);
    check('FORGE / EXTREMES: 4 / 721 / fractional minutes, a 3- or 181-minute interval, a blank / 121-char / control-char title, an amount, a string start, a colon key, a back-dated start, a start 25 h ahead and a missing X-CSRF are refused',
      bad.slice(0, 13).every((b) => b.res.status === 400) && bad[13].res.status === 403, bad.map((b) => b.res.status).join(','));
    check('... and none of them made a session', one('SELECT COUNT(*) n FROM focus_sessions WHERE user_id = ?', fia.id).n === 0);
  }
  {
    // RACE + REPLAY: five starts with one key at once — exactly one session.
    const k = key();
    const raced = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/focus', {
      method: 'POST', jar: fia.jar, body: { clientKey: k, title: 'Szakdolgozat – 3. fejezet', minutes: 50, checkinMinutes: 15 },
    })));
    const ids = new Set(raced.map((r) => r.json?.session?.id));
    const statuses = raced.map((r) => r.res.status).sort();
    check('RACE / REPLAY: five starts with one clientKey make one session (one 201, the rest 200 replayed)', ids.size === 1
      && statuses.filter((s) => s === 201).length === 1 && statuses.every((s) => s === 200 || s === 201)
      && one('SELECT COUNT(*) n FROM focus_sessions WHERE user_id = ?', fia.id).n === 1, statuses.join(','));
    const first = raced.find((r) => r.res.status === 201)?.json?.session;
    check('the answer is focus-1 / focus-2\'s block: running, 50 minutes, 0 / 3, expected +23', first?.status === 'active' && first.plannedMinutes === 50
      && first.checkinsMax === 3 && first.expectedMinor === 2300, JSON.stringify(first));
    const cancelled = await call(`/api/v1/focus/${first.id}/cancel`, { method: 'POST', jar: fia.jar, body: {} });
    check('Feladás pays nothing (200, cancelled, no coin)', cancelled.res.status === 200 && cancelled.json?.session?.status === 'cancelled' && (await wallet(fia)) === 0);
    const again = await call(`/api/v1/focus/${first.id}/cancel`, { method: 'POST', jar: fia.jar, body: {} });
    check('a second Feladás answers already', again.res.status === 200 && again.json?.already === true);

    // RACE across keys: five different starts at once — one open session, four FOCUS_OPEN.
    const many = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/focus', {
      method: 'POST', jar: fia.jar, body: { clientKey: key(), title: 'Párhuzamos', minutes: 25, checkinMinutes: 0 },
    })));
    const created = many.filter((r) => r.res.status === 201);
    const busy = many.filter((r) => r.res.status === 409 && r.json?.code === 'FOCUS_OPEN');
    check('RACE: five different starts at once — exactly one session opens, four are FOCUS_OPEN', created.length === 1 && busy.length === 4
      && one(`SELECT COUNT(*) n FROM focus_sessions WHERE user_id = ? AND status = 'open'`, fia.id).n === 1, many.map((r) => r.res.status).join(','));
    const fin = await call(`/api/v1/focus/${created[0].json.session.id}/finish`, { method: 'POST', jar: fia.jar, body: {} });
    check('a finish within the first minute pays 0 and writes no coin event', fin.res.status === 200 && fin.json?.awardedMinor === 0 && focusEvents(fia).n === 0, `${fin.res.status} ${fin.json?.awardedMinor}`);
  }

  /* ── check-in and finish: the five passes ─────────────────────────────────────────────────── */
  const intruder = await register('intruder');
  {
    const id = plant(fia, { minutesAgo: 46 }); // 46 of 50 minutes, 3 check-ins allowed, 0 answered
    const forged = await Promise.all([
      call(`/api/v1/focus/${id}/checkin`, { method: 'POST', jar: fia.jar, body: { count: 3 } }),
      call(`/api/v1/focus/${id}/finish`, { method: 'POST', jar: fia.jar, body: { minutes: 600 } }),
      call(`/api/v1/focus/${id}/finish`, { method: 'POST', jar: fia.jar, body: { amountMinor: 999999 } }),
      call('/api/v1/focus/abc/finish', { method: 'POST', jar: fia.jar, body: {} }),
      call(`/api/v1/focus/${id}?x=1`, { jar: fia.jar }),
    ]);
    check('FORGE: a check-in count, a minute count, an amount, a non-numeric id and a query key are refused (400)', forged.every((f) => f.res.status === 400), forged.map((f) => f.res.status).join(','));
    check('... and the session is untouched (0 check-ins, open)', one('SELECT checkins_done c, status s FROM focus_sessions WHERE id = ?', id).c === 0 && one('SELECT status s FROM focus_sessions WHERE id = ?', id).s === 'open');

    const idor = await Promise.all([
      call(`/api/v1/focus/${id}`, { jar: intruder.jar }),
      call(`/api/v1/focus/${id}/checkin`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/focus/${id}/finish`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/focus/${id}/cancel`, { method: 'POST', jar: intruder.jar, body: {} }),
    ]);
    check('IDOR: another account reads, checks in, finishes or cancels the session — 404 every time', idor.every((t) => t.res.status === 404), idor.map((t) => t.res.status).join(','));
    check('... nothing moved on either side', one('SELECT checkins_done c FROM focus_sessions WHERE id = ?', id).c === 0
      && focusEvents(fia).n === 0 && focusEvents(intruder).n === 0 && (await wallet(intruder)) === 0);

    const taps = await Promise.all(Array.from({ length: 5 }, () => call(`/api/v1/focus/${id}/checkin`, { method: 'POST', jar: fia.jar, body: {} })));
    const counted = taps.filter((t) => t.json?.counted === true);
    check('RACE / REPLAY: five "Rajta vagyok" taps at once count ONCE (the rest: too soon, 200 counted false)', counted.length === 1
      && taps.every((t) => t.res.status === 200) && taps.filter((t) => t.json?.reason === 'too_soon').length === 4
      && one('SELECT checkins_done c FROM focus_sessions WHERE id = ?', id).c === 1, taps.map((t) => `${t.res.status}:${t.json?.counted}`).join(','));
    check('a check-in moves no coin', (await wallet(fia)) === 0 && focusEvents(fia).n === 0);

    const fins = await Promise.all(Array.from({ length: 5 }, () => call(`/api/v1/focus/${id}/finish`, { method: 'POST', jar: fia.jar, body: {} })));
    const paid = fins.filter((f) => f.res.status === 200 && !f.json?.already);
    const ev = focusEvents(fia);
    const expected = Math.round((paid[0]?.json?.session?.paidMinutes * 20) / 60) + 2; // 46 min -> 15, + 1 check-in x 2
    check('RACE: five finishes at once pay ONCE (one finished, four already) — one focus.finish event', paid.length === 1
      && fins.filter((f) => f.json?.already === true).length === 4 && ev.n === 1, fins.map((f) => `${f.res.status}:${f.json?.already ?? 'paid'}`).join(','));
    check('FORGE-proof amount: the award is the server\'s (46 min x 20 / 60 = 15, + 1 check-in x 2 = 17)', paid[0]?.json?.awardedMinor === expected * 100
      && paid[0].json.session.paidCheckins === 1 && ev.s === expected * 100, `${paid[0]?.json?.awardedMinor} ${paid[0]?.json?.session?.paidMinutes}`);
    check('the wallet moved exactly once, by the award', (await wallet(fia)) === ev.s, `${await wallet(fia)}`);
    const replay = await call(`/api/v1/focus/${id}/finish`, { method: 'POST', jar: fia.jar, body: {} });
    check('REPLAY: a later finish answers already with the same award and pays nothing', replay.res.status === 200 && replay.json?.already === true
      && replay.json.awardedMinor === ev.s && focusEvents(fia).n === 1);
    const late = await call(`/api/v1/focus/${id}/checkin`, { method: 'POST', jar: fia.jar, body: {} });
    const undo = await call(`/api/v1/focus/${id}/cancel`, { method: 'POST', jar: fia.jar, body: {} });
    check('EXTREMES: a finished block cannot be checked in (409 FOCUS_NOT_ACTIVE) or cancelled into a free one (409 FOCUS_CLOSED)',
      late.res.status === 409 && late.json?.code === 'FOCUS_NOT_ACTIVE' && undo.res.status === 409 && undo.json?.code === 'FOCUS_CLOSED', `${late.json?.code} ${undo.json?.code}`);
    const get = await call(`/api/v1/focus/${id}`, { jar: fia.jar });
    check('GET /focus/:id re-opens focus-3: done, the minutes, the award', get.res.status === 200 && get.json?.session?.status === 'done' && get.json.session.awardedMinor === ev.s);
  }
  {
    const planned = await call('/api/v1/focus', { method: 'POST', jar: fia.jar, body: { clientKey: key(), title: 'Mélymunka – szakdolgozat', minutes: 25, checkinMinutes: 0, startAt: nowSec() + 3600 } });
    check('a block planned an hour ahead (Ma: "Következő blokk · 25 perc · +8 érme")', planned.res.status === 201 && planned.json?.session?.status === 'planned' && planned.json.session.expectedMinor === 800);
    const early = await call(`/api/v1/focus/${planned.json.session.id}/finish`, { method: 'POST', jar: fia.jar, body: {} });
    check('EXTREMES: it cannot be finished before it starts (409 FOCUS_NOT_STARTED)', early.res.status === 409 && early.json?.code === 'FOCUS_NOT_STARTED');
    const noCheckins = await call(`/api/v1/focus/${planned.json.session.id}/checkin`, { method: 'POST', jar: fia.jar, body: {} });
    check('... nor checked in (409 FOCUS_NOT_ACTIVE)', noCheckins.res.status === 409);
    const cur = await call('/api/v1/focus/current', { jar: fia.jar });
    check('GET /focus/current: the planned block, today\'s paid minutes, the rules (20 / h, +2)', cur.res.status === 200 && cur.json?.session?.id === planned.json.session.id
      && cur.json.todayMinutes > 0 && cur.json.rules?.pointsPerHour === 20 && cur.json.rules.checkinPoint === 2, JSON.stringify(cur.json?.rules));
    const todayR = await call('/api/v1/lifeos/today', { jar: fia.jar });
    check('GET /lifeos/today carries the FÓKUSZ block', todayR.res.status === 200 && todayR.json?.focus?.current?.id === planned.json.session.id && todayR.json.focus.todaySessions >= 1);
    const list = await call('/api/v1/focus', { jar: fia.jar });
    check('GET /focus lists the open block first, then the closed ones', list.res.status === 200 && list.json?.sessions?.[0]?.id === planned.json.session.id && list.json.sessions.length >= 4);
    await call(`/api/v1/focus/${planned.json.session.id}/cancel`, { method: 'POST', jar: fia.jar, body: {} });
  }

  /* ── GET /lifeos/days, GET /lifeos/stats ──────────────────────────────────────────────────── */
  console.log('\n── lifeos: statistics (GET /lifeos/days, GET /lifeos/stats) ────────────────────');
  {
    const t = today();
    const bad = await Promise.all([
      call('/api/v1/lifeos/stats?days=6', { jar: fia.jar }),
      call('/api/v1/lifeos/stats?days=29', { jar: fia.jar }),
      call('/api/v1/lifeos/stats?weeks=0', { jar: fia.jar }),
      call('/api/v1/lifeos/stats?days=1e1', { jar: fia.jar }),
      call('/api/v1/lifeos/stats?userId=1', { jar: fia.jar }),
      call(`/api/v1/lifeos/days?from=${t}`, { jar: fia.jar }),
      call(`/api/v1/lifeos/days?from=${dates.addDaysToKey(t, -92)}&to=${t}`, { jar: fia.jar }),
      call(`/api/v1/lifeos/days?from=${t}&to=${dates.addDaysToKey(t, -1)}`, { jar: fia.jar }),
      call('/api/v1/lifeos/days?from=2026-02-30&to=2026-03-01', { jar: fia.jar }),
    ]);
    check('FORGE / EXTREMES: out-of-range or non-digit windows, a user id, a half range, 93 days, a reversed range and an impossible date are refused (400)',
      bad.every((b) => b.res.status === 400), bad.map((b) => b.res.status).join(','));
    const anon = await call('/api/v1/lifeos/stats');
    check('anonymous statistics are refused (401)', anon.res.status === 401);
    const s = await call('/api/v1/lifeos/stats', { jar: fia.jar });
    check('GET /lifeos/stats: 14 day columns ending today, 4 week rows, the habit and kcal windows, the overview',
      s.res.status === 200 && s.json?.days?.length === 14 && s.json.days[13].date === t && s.json.weeks?.length === 4
        && s.json.habits?.rows && s.json.kcal?.days && typeof s.json.overview?.xp === 'number', `${s.res.status}`);
    check('... today\'s column carries today\'s focus coins', s.json?.days?.[13]?.netMinor === (await wallet(fia)));
    check('... the overview counts the finished focus block', s.json?.overview?.focusSessions >= 1 && s.json.overview.focusMinutes >= 46);
    const d = await call(`/api/v1/lifeos/days?from=${dates.addDaysToKey(t, -91)}&to=${t}`, { jar: fia.jar });
    check('GET /lifeos/days: 92 days is the longest range; days before the start are before_start, today open', d.res.status === 200 && d.json?.days?.length === 92
      && d.json.days[0].status === 'before_start' && d.json.days[91].status === 'open' && d.json.days[91].focusMinutes >= 46, `${d.res.status} ${d.json?.days?.length}`);
    const other = await call(`/api/v1/lifeos/days?from=${t}&to=${t}`, { jar: intruder.jar });
    check('IDOR: the same range for another account is its own (no focus minutes, no coins)', other.res.status === 200 && other.json?.days?.[0]?.focusMinutes === 0 && other.json.days[0].netMinor === 0);
  }

  conn.close();
}
