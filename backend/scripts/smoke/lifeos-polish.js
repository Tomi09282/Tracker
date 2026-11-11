// scripts/smoke/lifeos-polish.js — the LifeOS backend polish round (package B-lifeos-polish) against
// the running server: the regression net for the adversarial security review
// (.pulse/review/security-lifeos, attacks 01 / 02 / 02b / 07 / 11 / 12) and for the open items of the
// round (the lazy LifeOS start, the task point rules, the first reminder on nextEvent, the MAI DOBÁS
// picked state). Every check here FAILS on the code before the round.
//
// Imported by scripts/smoke.js after the focus section. Past days, backfilled zones and archive
// instants cannot be reached over HTTP in seconds, so they are planted straight into the throwaway
// smoke database (lifeos-core.js's technique). Every ASSERTION goes through the API, or reads the
// rows the API wrote.

export async function lifeosPolishSmoke({ call, check, Jar, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const dates = await import('../../src/lifeos/dates.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);
  const all = (sql, ...p) => conn.prepare(sql).all(...p);

  const TZ = 'Europe/Budapest';
  let n = 0;
  const key = (p = 'p') => `${p}-${stamp}-${(n += 1).toString().padStart(4, '0')}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const nowSec = () => Math.floor(Date.now() / 1000);
  const todayIn = (tz, dsh = 4) => dates.dayKeyFor(Date.now(), tz, dsh);

  const register = async (label, { zone = TZ } = {}) => {
    const jar = new Jar();
    const email = `lifeos-polish-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    if (zone) await call('/api/v1/me/prefs', { method: 'PATCH', jar, body: { timezone: zone } });
    return { jar, id };
  };
  /** The shape migration 031's backfill (and the seeded dev accounts) left: a zone, no start day. */
  const backfilled = (u, tz = TZ) =>
    run('UPDATE user_prefs SET timezone = ?, timezone_set_at = unixepoch() - 90000, day_start_hour = 4 WHERE user_id = ?', tz, u.id);
  const startedOn = (u) => one('SELECT lifeos_started_on AS s FROM user_prefs WHERE user_id = ?', u.id).s;
  const currentRules = () => JSON.parse(one('SELECT rules_json FROM point_rule_sets ORDER BY id DESC LIMIT 1').rules_json);

  /* ── 1. the lazy start ─────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos polish: LifeOS starts lazily for an account whose zone was backfilled ──────');
  {
    const reader = await register('lazy-read', { zone: null });
    backfilled(reader);
    check('a backfilled account has a zone and no start day (the planted 031 shape)', startedOn(reader) === null);
    const t = await call('/api/v1/tasks', { jar: reader.jar });
    check('its first LifeOS READ starts LifeOS at its local today (GET /tasks started:true)',
      t.res.status === 200 && t.json?.started === true && t.json?.today === todayIn(TZ), `${t.res.status} started ${t.json?.started} today ${t.json?.today}`);
    check('the start day is that local today, written once', startedOn(reader) === todayIn(TZ), `${startedOn(reader)}`);
    const settled = one('SELECT COUNT(*) AS n FROM daily_summaries WHERE user_id = ?', reader.id).n;
    const coins = one('SELECT COUNT(*) AS n FROM coin_events WHERE user_id = ?', reader.id).n;
    check('a returning user is not buried: no day before the start settles, no coin moves', settled === 0 && coins === 0, `${settled} summaries, ${coins} events`);
    const ma = await call('/api/v1/lifeos/today', { jar: reader.jar });
    check('GET /lifeos/today answers started:true for it', ma.json?.started === true && ma.json?.startedOn === todayIn(TZ), `${ma.json?.started} ${ma.json?.startedOn}`);

    const writer = await register('lazy-write', { zone: null });
    backfilled(writer);
    const c = await call('/api/v1/tasks', { method: 'POST', jar: writer.jar, body: { clientKey: key('t'), title: 'Befizetni a villanyszámlát', priority: 3 } });
    check('its first LifeOS WRITE starts LifeOS in the same transaction (POST /tasks 201, not 409 TIMEZONE_REQUIRED)',
      c.res.status === 201 && startedOn(writer) === todayIn(TZ), `${c.res.status} ${c.json?.code ?? ''} started ${startedOn(writer)}`);

    const repatch = await register('lazy-patch', { zone: null });
    backfilled(repatch);
    const p = await call('/api/v1/me/prefs', { method: 'PATCH', jar: repatch.jar, body: { timezone: TZ } });
    check('PATCH /me/prefs with the already stored zone starts it too (and spends no zone change)',
      p.res.status === 200 && p.json?.prefs?.startedOn === todayIn(TZ) && p.json?.prefs?.timezoneChangeableAt === null,
      `${p.res.status} ${p.json?.prefs?.startedOn} ${p.json?.prefs?.timezoneChangeableAt}`);

    const noZone = await register('lazy-nozone', { zone: null });
    const nz = await call('/api/v1/tasks', { jar: noZone.jar });
    check('without a zone nothing starts (started:false, no start day)', nz.json?.started === false && startedOn(noZone) === null);
  }

  /* ── 2. the point rules the screens print ─────────────────────────────────────────────────── */
  console.log('\n── lifeos polish: the task point rules on GET /tasks and GET /lifeos/today ─────────────');
  {
    const u = await register('rules');
    const r = currentRules();
    const want = { lowMinor: r.taskLow * 100, midMinor: r.taskMid * 100, highMinor: r.taskHigh * 100, latePct: r.taskLatePct, overdueMinor: r.taskOverdue * 100 };
    const t = await call('/api/v1/tasks', { jar: u.jar });
    const ma = await call('/api/v1/lifeos/today', { jar: u.jar });
    check('GET /tasks carries taskRules from the admin rule set in force', JSON.stringify(t.json?.taskRules) === JSON.stringify(want), JSON.stringify(t.json?.taskRules));
    check('GET /lifeos/today carries the same taskRules', JSON.stringify(ma.json?.taskRules) === JSON.stringify(want), JSON.stringify(ma.json?.taskRules));
    const wantDay = { habitMinor: r.habitSuccess * 100, streakTier1Days: r.streakTier1Days, streakTier1MultBp: r.streakTier1MultBp, perfectDayMinor: r.perfectDay * 100 };
    check('GET /lifeos/today carries dayRules (the habit pay, the first streak step, the perfect day)', JSON.stringify(ma.json?.dayRules) === JSON.stringify(wantDay), JSON.stringify(ma.json?.dayRules));
    const noZone = await register('rules-nozone', { zone: null });
    const nz = await call('/api/v1/tasks', { jar: noZone.jar });
    check('the rules are there before a zone too (the picker draws them)', nz.json?.started === false && nz.json?.taskRules?.highMinor === want.highMinor);
  }

  /* ── 3. Ma's KÖVETKEZŐ line: the first reminder ────────────────────────────────────────────── */
  console.log('\n── lifeos polish: nextEvent carries its first reminder (ma-1 "emlékeztető 18:30") ──────');
  {
    const u = await register('remind');
    const tomorrow = dates.addDaysToKey(dates.calendarKeyFor(Date.now(), TZ), 1);
    const e = await call('/api/v1/events', { method: 'POST', jar: u.jar, body: { clientKey: key('e'), title: 'Vacsora Annával', location: 'Trattoria Toscana', date: tomorrow, startTime: '19:30', reminders: [15, 60] } });
    const ma = await call('/api/v1/lifeos/today', { jar: u.jar });
    const ne = ma.json?.nextEvent;
    check('the event is Ma\'s next one', e.res.status === 201 && ne?.title === 'Vacsora Annával', `${e.res.status} ${ne?.title}`);
    check('nextEvent.reminders lists the offsets ascending', JSON.stringify(ne?.reminders) === '[15,60]', JSON.stringify(ne?.reminders));
    check('nextEvent.firstReminder is the one that fires first: 60 minutes before, 18:30 local',
      ne?.firstReminder?.minutesBefore === 60 && ne?.firstReminder?.time === '18:30' && ne?.firstReminder?.at === ne?.startAt - 3600,
      JSON.stringify(ne?.firstReminder));
    const quiet = await register('remind-none');
    await call('/api/v1/events', { method: 'POST', jar: quiet.jar, body: { clientKey: key('e'), title: 'Fodrász', date: tomorrow, startTime: '10:00' } });
    const mq = await call('/api/v1/lifeos/today', { jar: quiet.jar });
    check('an event without reminders answers firstReminder: null', mq.json?.nextEvent?.firstReminder === null && Array.isArray(mq.json?.nextEvent?.reminders), JSON.stringify(mq.json?.nextEvent?.firstReminder));
  }

  /* ── 4. MAI DOBÁS after the pick, from GET /lifeos/today alone ─────────────────────────────── */
  console.log('\n── lifeos polish: the picked challenge on GET /lifeos/today ────────────────────────────');
  {
    const u = await register('pick');
    for (const [name, points] of [['Lift helyett lépcső egész nap', 15], ['10 perc séta ebéd után', 10], ['Nincs telefon az ágyban', 20]]) {
      await call('/api/v1/challenges', { method: 'POST', jar: u.jar, body: { clientKey: key('c'), name, points } });
    }
    const d = await call('/api/v1/challenges/today/draw', { method: 'POST', jar: u.jar, body: {} });
    const opt = d.json?.draw?.options?.[0];
    const p = await call('/api/v1/challenges/today/pick', { method: 'POST', jar: u.jar, body: { clientKey: key('k'), challengeId: opt?.id } });
    const ma = await call('/api/v1/lifeos/today', { jar: u.jar });
    const pk = ma.json?.challenge?.picked;
    check('after the pick Ma reads state "picked" with the task\'s title and full value',
      p.res.status === 201 && ma.json?.challenge?.state === 'picked' && pk?.title === opt?.name && pk?.valueMinor === opt?.points * 100 && pk?.paidMinor === null && pk?.done === false,
      JSON.stringify(pk));
    const task = ma.json?.tasks?.due?.find((t) => t.id === pk?.taskId);
    check('the picked task is in today\'s list with its challengeId (the counters can leave it out)', task?.challengeId === opt?.id, `${task?.challengeId}`);
    await call(`/api/v1/tasks/${pk?.taskId}/complete`, { method: 'POST', jar: u.jar, body: {} });
    const after = (await call('/api/v1/lifeos/today', { jar: u.jar })).json?.challenge?.picked;
    check('done: picked.done and picked.paidMinor = what the task paid', after?.done === true && after?.paidMinor === opt?.points * 100, JSON.stringify(after));
  }

  /* ── 5. streak milestones are rare per account (attack 01) ─────────────────────────────────── */
  console.log('\n── lifeos polish: streak milestones pay once per account per tier window (review 01) ──');
  {
    const FT = 'Asia/Tokyo';
    const u = await register('milestone', { zone: null });
    const through = dates.settledThroughFor(Date.now(), FT, 6);
    const start = dates.addDaysToKey(through, -6);
    run('UPDATE user_prefs SET timezone = ?, day_start_hour = 6, lifeos_started_on = ?, timezone_set_at = unixepoch() WHERE user_id = ?', FT, start, u.id);
    const ins = conn.prepare(`INSERT INTO habits (user_id, name, kind, schedule_type, weekday_mask, target_count, points_success, points_penalty, sort_order, started_on, client_key)
                              VALUES (?, ?, 'bad', 'daily', 127, 1, 50, 0, ?, ?, ?)`);
    for (let i = 0; i < 20; i += 1) ins.run(u.id, `nope ${i}`, i, start, key('h'));
    const t = await call('/api/v1/lifeos/today', { jar: u.jar });
    const m = one(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS s FROM coin_events WHERE user_id = ? AND reason_key = 'streak.milestone'`, u.id);
    const reached = one('SELECT COUNT(*) AS n FROM habit_day_results WHERE user_id = ? AND milestone_days = 7', u.id).n;
    check('twenty habits crossing 7 days together pay ONE 7-day milestone, not twenty', t.res.status === 200 && m.n === 1 && m.s === currentRules().milestone1Bonus * 100, `${m.n} events, ${m.s / 100} coins`);
    check('every habit still records the milestone it reached', reached === 20, `${reached}`);
    const capped = all(`SELECT local_date AS d, SUM(amount_minor) AS s FROM coin_events e JOIN coin_reasons r ON r.key = e.reason_key AND r.cap_exempt = 0
                         WHERE e.user_id = ? AND e.amount_minor > 0 GROUP BY local_date`, u.id);
    check('the capped earn of every day stays at or under the daily cap', capped.every((r) => r.s <= currentRules().dailyEarnCap * 100), JSON.stringify(capped.map((r) => r.s / 100)));
  }

  /* ── 6. never back onto a settled day (attacks 02 / 02b / 11) ──────────────────────────────── */
  console.log('\n── lifeos polish: a zone or day-start change never makes a settled day "today" ───────');
  {
    /** LifeOS started two days ago and the days through TODAY already hold summary rows. */
    const settledThroughToday = async (label) => {
      const u = await register(label, { zone: null });
      const today = todayIn(TZ);
      run('UPDATE user_prefs SET timezone = ?, day_start_hour = 4, lifeos_started_on = ?, timezone_set_at = unixepoch() - 90000 WHERE user_id = ?', TZ, dates.addDaysToKey(today, -2), u.id);
      for (let i = -2; i <= 0; i += 1) run(`INSERT INTO daily_summaries (user_id, local_date, status, rules_version) VALUES (?, ?, 'lapsed', 1)`, u.id, dates.addDaysToKey(today, i));
      return u;
    };
    const west = await settledThroughToday('tz-west');
    const w = await call('/api/v1/me/prefs', { method: 'PATCH', jar: west.jar, body: { timezone: 'America/New_York' } });
    check('a zone switch westwards onto a settled day is refused (409 DAY_SETTLED with changeableAt)',
      w.res.status === 409 && w.json?.code === 'DAY_SETTLED' && Number.isInteger(w.json?.changeableAt) && w.json.changeableAt > Date.now(),
      `${w.res.status} ${w.json?.code} ${w.json?.changeableAt}`);
    check('the refused switch changed nothing', one('SELECT timezone FROM user_prefs WHERE user_id = ?', west.id).timezone === TZ);
    const dsh = await settledThroughToday('dsh');
    const d = await call('/api/v1/me/prefs', { method: 'PATCH', jar: dsh.jar, body: { dayStartHour: 6 } });
    check('a day-start change onto a settled day is refused too (409 DAY_SETTLED)', d.res.status === 409 && d.json?.code === 'DAY_SETTLED', `${d.res.status} ${d.json?.code}`);

    const east = await register('tz-east', { zone: null });
    run('UPDATE user_prefs SET timezone = ?, day_start_hour = 4, lifeos_started_on = ?, timezone_set_at = unixepoch() - 90000 WHERE user_id = ?', TZ, dates.addDaysToKey(todayIn(TZ), -1), east.id);
    const e = await call('/api/v1/me/prefs', { method: 'PATCH', jar: east.jar, body: { timezone: 'Asia/Tokyo' } });
    check('an honest switch (eastwards) still goes through', e.res.status === 200 && e.json?.prefs?.timezone === 'Asia/Tokyo', `${e.res.status} ${e.json?.code ?? ''}`);

    // Defence in depth: an account ALREADY standing on a settled today (switched before this round).
    const stuck = await settledThroughToday('stuck');
    const task = await call('/api/v1/tasks', { method: 'POST', jar: stuck.jar, body: { clientKey: key('t'), title: 'p', priority: 3 } });
    const done = await call(`/api/v1/tasks/${task.json?.task?.id}/complete`, { method: 'POST', jar: stuck.jar, body: {} });
    check('completing a task on a settled today is refused (409 DAY_LOCKED), nothing paid',
      done.res.status === 409 && done.json?.code === 'DAY_LOCKED', `${task.res.status} -> ${done.res.status} ${done.json?.code}`);
    const fid = Number(run(
      `INSERT INTO focus_sessions (user_id, client_key, title, created_on, starts_at, planned_minutes, checkin_minutes, rules_version)
       VALUES (?, ?, 'Mélymunka', ?, ?, 50, 0, 1)`,
      stuck.id, key('f'), todayIn(TZ), nowSec() - 20 * 60,
    ).lastInsertRowid);
    const fin = await call(`/api/v1/focus/${fid}/finish`, { method: 'POST', jar: stuck.jar, body: {} });
    const paid = one('SELECT COUNT(*) AS n FROM coin_events WHERE user_id = ?', stuck.id).n;
    check('finishing a focus block on a settled today is refused (409 DAY_LOCKED), no coin event',
      fin.res.status === 409 && fin.json?.code === 'DAY_LOCKED' && paid === 0, `${fin.res.status} ${fin.json?.code} events ${paid}`);
  }

  /* ── 7. an empty workout is not the day's workout (attack 07) ──────────────────────────────── */
  console.log('\n── lifeos polish: an empty freestyle session does not tick the workout (review 07) ────');
  {
    const u = await register('empty-workout');
    const s = await call('/api/v1/workouts/start', { method: 'POST', jar: u.jar, body: {} });
    const f = await call(`/api/v1/workouts/${s.json?.logId}/finish`, { method: 'POST', jar: u.jar, body: {} });
    const ma = await call('/api/v1/lifeos/today', { jar: u.jar });
    check('start + finish with no set leaves workout.done false', [200, 201].includes(s.res.status) && f.res.status === 200 && ma.json?.workout?.done === false,
      `${s.res.status}/${f.res.status} done ${ma.json?.workout?.done}`);
    // attack 08: the same empty sessions unlocked the workout-count achievements (outside every cap).
    for (let i = 0; i < 2; i += 1) {
      const s2 = await call('/api/v1/workouts/start', { method: 'POST', jar: u.jar, body: {} });
      await call(`/api/v1/workouts/${s2.json?.logId}/finish`, { method: 'POST', jar: u.jar, body: {} });
    }
    await new Promise((r) => setTimeout(r, 600)); // the evaluator runs after the finish has answered
    const ach = one(`SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason_key = 'achievement.reward'`, u.id).n;
    const bal = (await call('/api/v1/coins/wallet', { jar: u.jar })).json?.balanceMinor;
    check('three empty sessions unlock no achievement and pay nothing (review 08)', ach === 0 && bal === 0, `${ach} achievement rows, balance ${bal}`);
  }

  /* ── 8. archiving does not dodge the day's outcome (attack 12) ─────────────────────────────── */
  console.log('\n── lifeos polish: archive before the close does not dodge a relapse or a miss (review 12)');
  {
    const u = await register('dodge', { zone: null });
    const through = dates.settledThroughFor(Date.now(), TZ, 4);
    const start = dates.addDaysToKey(through, -1);
    run('UPDATE user_prefs SET timezone = ?, day_start_hour = 4, lifeos_started_on = ?, timezone_set_at = unixepoch() WHERE user_id = ?', TZ, start, u.id);
    const mk = (name, kind) => Number(run(`INSERT INTO habits (user_id, name, kind, schedule_type, weekday_mask, target_count, points_success, points_penalty, sort_order, started_on, client_key)
      VALUES (?, ?, ?, 'daily', 127, 1, 10, 30, 0, ?, ?)`, u.id, name, kind, start, key('h')).lastInsertRowid);
    const bad = mk('Dohányzás', 'bad');
    const good = mk('Futás', 'good');
    const quiet = mk('Olvasás', 'good');
    run(`INSERT INTO habit_logs (habit_id, user_id, local_date, count, status) VALUES (?, ?, ?, 3, 'relapse')`, bad, u.id, through);
    const dayStart = Math.floor(dates.dayStartInstant(through, TZ, 4).getTime() / 1000);
    // the relapse, then the archive DURING the day; the miss, archived the next morning before the close;
    // a habit archived during the day with nothing logged (the same as Kihagyás).
    run('UPDATE habits SET archived_at = ? WHERE id = ?', dayStart + 3600, bad);
    run('UPDATE habits SET archived_at = ? WHERE id = ?', nowSec(), good);
    run('UPDATE habits SET archived_at = ? WHERE id = ?', dayStart + 3600, quiet);
    await call('/api/v1/lifeos/today', { jar: u.jar });
    const res = (id) => one('SELECT outcome FROM habit_day_results WHERE habit_id = ? AND local_date = ?', id, through)?.outcome ?? null;
    const lost = one(`SELECT COALESCE(SUM(amount_minor), 0) AS s FROM coin_events WHERE user_id = ? AND local_date = ? AND reason_key IN ('habit.relapse', 'habit.missed')`, u.id, through).s;
    check('a habit archived after its relapse still settles that day as a relapse', res(bad) === 'relapse', `${res(bad)}`);
    check('a habit archived after the day ended (before its close) still settles it as missed', res(good) === 'missed', `${res(good)}`);
    check('the penalties of that day were taken', lost < 0, `${lost / 100}`);
    check('a habit archived during the day with nothing logged leaves that day out', res(quiet) === null, `${res(quiet)}`);
    await call(`/api/v1/habits/${bad}/restore`, { method: 'POST', jar: u.jar, body: {} });
    const hv = (await call(`/api/v1/habits/${bad}`, { jar: u.jar })).json?.habit;
    check('restored, its streak is broken (0), not carried over the relapse', hv?.streak?.current === 0, JSON.stringify(hv?.streak));
  }

  conn.close();
}
