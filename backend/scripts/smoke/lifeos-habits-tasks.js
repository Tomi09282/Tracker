// scripts/smoke/lifeos-habits-tasks.js — LifeOS habits, tasks and the full day close (migration 032)
// against the running server.
//
// Imported by scripts/smoke.js after the LifeOS core section. Every coin-moving or day-dependent
// endpoint walks the five passes of the plan's adversarial table:
//
//   FORGE    a body / param the schema must refuse (.strict(), bounded, regex) — and no client
//            amount, date or "late" flag ever reaches a payout
//   REPLAY   the same request twice moves nothing twice
//   RACE     concurrent requests settle on exactly one effect
//   IDOR     another account's habit / task is a 404 and moves nothing on either side
//   EXTREMES the bounds of every number and string, the item caps, the daily coin cap
//
// "LifeOS started three days ago, with a habit and logs on those days" cannot be reached over HTTP
// in a test that must finish in seconds, so it is planted straight into the throwaway smoke
// database (lifeos-core.js's technique). Every ASSERTION goes through the API.

export async function lifeosHabitsTasksSmoke({ call, check, Jar, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const dates = await import('../../src/lifeos/dates.js');
  const { DEFAULT_RULES, LIFEOS_LIMITS } = await import('../../src/lifeos/rules.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);

  const TZ = 'Europe/Budapest';
  let n = 0;
  const key = (p = 'k') => `${p}-${stamp}-${(n += 1).toString().padStart(4, '0')}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

  const register = async (label, { zone = true } = {}) => {
    const jar = new Jar();
    const email = `lifeos-ht-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    if (zone) await call('/api/v1/me/prefs', { method: 'PATCH', jar, body: { timezone: TZ } });
    return { jar, id };
  };
  const wallet = async (u) => (await call('/api/v1/coins/wallet', { jar: u.jar })).json?.balanceMinor;
  const today = () => dates.dayKeyFor(Date.now(), TZ, 4);

  /* ── habits ──────────────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: habits (POST /habits, /habits/:id/log | skip | relapse) ─────────────');
  const noZone = await register('nozone', { zone: false });
  {
    const r = await call('/api/v1/habits', { method: 'POST', jar: noZone.jar, body: { clientKey: key(), kind: 'good', name: 'x' } });
    check('a habit cannot be created before the zone is set (409 TIMEZONE_REQUIRED)', r.res.status === 409 && r.json?.code === 'TIMEZONE_REQUIRED', `${r.res.status} ${r.json?.code}`);
    const t = await call('/api/v1/tasks', { method: 'POST', jar: noZone.jar, body: { clientKey: key(), title: 'x' } });
    check('nor a task', t.res.status === 409 && t.json?.code === 'TIMEZONE_REQUIRED', `${t.res.status}`);
    const anon = await call('/api/v1/habits');
    check('an anonymous caller is refused (401)', anon.res.status === 401, `${anon.res.status}`);
  }

  const hana = await register('hana');
  const hk = key('habit');
  let habitId;
  {
    const bad = await Promise.all([
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x', pointsSuccess: 51 } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x', pointsPenalty: -1 } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'meh', name: 'x' } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: '   ' } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x'.repeat(81) } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x', scheduleType: 'weekdays' } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'bad', name: 'x', targetCount: 3 } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: 'buy:12345678', kind: 'good', name: 'x' } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x', userId: 1 } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x', reminderTime: '24:00' } }),
      call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'x' }, csrf: false }),
    ]);
    check('FORGE / EXTREMES: coins over 50, a negative penalty, an unknown kind, a blank or 81-char name, a schedule without its days, a counted bad habit, a colon key, a user id, 24:00 and a missing X-CSRF are refused',
      bad.slice(0, 10).every((b) => b.res.status === 400) && bad[10].res.status === 403, bad.map((b) => b.res.status).join(','));
  }
  {
    // RACE + REPLAY: five creates with one key at once — exactly one habit exists.
    const raced = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/habits', {
      method: 'POST', jar: hana.jar, body: { clientKey: hk, kind: 'good', name: 'Víz', targetCount: 8, unit: 'pohár', pointsSuccess: 50 },
    })));
    const ids = new Set(raced.map((r) => r.json?.habit?.id));
    const statuses = raced.map((r) => r.res.status).sort();
    habitId = [...ids][0];
    check('RACE / REPLAY: five creates with one clientKey make one habit (one 201, the rest 200 replayed)', ids.size === 1 && statuses.filter((s) => s === 201).length === 1
      && statuses.every((s) => s === 200 || s === 201) && one('SELECT COUNT(*) n FROM habits WHERE user_id = ?', hana.id).n === 1, statuses.join(','));
    check('EXTREMES: 50 coins per completion is accepted (the cap itself)', raced[0].json?.habit?.pointsSuccess === 50);
  }
  {
    const logs = await Promise.all(Array.from({ length: 5 }, () => call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 4 } })));
    check('RACE / REPLAY: five identical count writes land on one log row, count 4', logs.every((l) => l.res.status === 200 && l.json?.log?.count === 4)
      && one('SELECT COUNT(*) n FROM habit_logs WHERE habit_id = ?', habitId).n === 1, logs.map((l) => l.res.status).join(','));
    const max = await call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 100 } });
    check('EXTREMES: a count above the target is clamped to it (8/8, done)', max.res.status === 200 && max.json?.log?.count === 8 && max.json.log.status === 'done', JSON.stringify(max.json?.log));
    check('the answer carries the preview: 8/8 at x1 pays 50 at the close', max.json?.habit?.previewMinor === 5000, `${max.json?.habit?.previewMinor}`);
    const forged = await Promise.all([
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: -1 } }),
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 101 } }),
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: '3' } }),
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 1, date: '2026-02-30' } }),
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 1, amountMinor: 999999 } }),
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 1, date: dates.addDaysToKey(today(), 1) } }),
      call('/api/v1/habits/abc/log', { method: 'POST', jar: hana.jar, body: { count: 1 } }),
    ]);
    check('FORGE: a negative / over-range / string count, an impossible date, an amount, a future day and a non-numeric id are refused (400)',
      forged.every((f) => f.res.status === 400), forged.map((f) => f.res.status).join(','));
    const old = await call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: hana.jar, body: { count: 1, date: dates.addDaysToKey(today(), -3) } });
    check('a day that has settled (or never existed for the habit) is DAY_LOCKED (409)', old.res.status === 409 && old.json?.code === 'DAY_LOCKED', `${old.res.status} ${old.json?.code}`);
    const relapseOnGood = await call(`/api/v1/habits/${habitId}/relapse`, { method: 'POST', jar: hana.jar, body: { count: 1 } });
    check('the wrong operation for the kind is a 409 WRONG_KIND', relapseOnGood.res.status === 409 && relapseOnGood.json?.code === 'WRONG_KIND', `${relapseOnGood.res.status}`);
    const before = await wallet(hana);
    check('no habit write moved a coin (habits pay at the day close)', before === 0, `${before}`);
  }
  {
    const intruder = await register('intruder');
    const tries = await Promise.all([
      call(`/api/v1/habits/${habitId}`, { jar: intruder.jar }),
      call(`/api/v1/habits/${habitId}`, { method: 'PATCH', jar: intruder.jar, body: { name: 'mine' } }),
      call(`/api/v1/habits/${habitId}/log`, { method: 'POST', jar: intruder.jar, body: { count: 0 } }),
      call(`/api/v1/habits/${habitId}/skip`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/habits/${habitId}/archive`, { method: 'POST', jar: intruder.jar, body: {} }),
    ]);
    const mine = await call(`/api/v1/habits/${habitId}`, { jar: hana.jar });
    check('IDOR: another account reads, edits, logs, skips or archives the habit — 404 every time', tries.every((t) => t.res.status === 404), tries.map((t) => t.res.status).join(','));
    check('... and the owner\'s habit and log are untouched', mine.res.status === 200 && mine.json?.habit?.name === 'Víz' && mine.json.habit.log?.count === 8 && !mine.json.habit.archived);
  }
  {
    const bad = await call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'bad', name: 'Dohányzás' } });
    const r1 = await call(`/api/v1/habits/${bad.json?.habit?.id}/relapse`, { method: 'POST', jar: hana.jar, body: { count: 2 } });
    const r2 = await call(`/api/v1/habits/${bad.json?.habit?.id}/relapse`, { method: 'POST', jar: hana.jar, body: { count: 2 } });
    check('relapses are an absolute count: a replay lands on the same state (2), preview -20', r1.res.status === 200 && r2.json?.log?.count === 2 && r2.json.habit.previewMinor === -2000, `${r2.json?.habit?.previewMinor}`);
    const skipBad = await call(`/api/v1/habits/${bad.json?.habit?.id}/skip`, { method: 'POST', jar: hana.jar, body: {} });
    check('a bad habit cannot be skipped (409 WRONG_KIND)', skipBad.res.status === 409);
  }
  {
    const room = LIFEOS_LIMITS.habits - one('SELECT COUNT(*) n FROM habits WHERE user_id = ? AND archived_at IS NULL', hana.id).n;
    for (let i = 0; i < room; i += 1) {
      await call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: `h${i}` } });
    }
    const over = await call('/api/v1/habits', { method: 'POST', jar: hana.jar, body: { clientKey: key(), kind: 'good', name: 'one too many' } });
    check(`EXTREMES: the ${LIFEOS_LIMITS.habits + 1}st live habit is a 409 LIMIT_REACHED`, over.res.status === 409 && over.json?.code === 'LIMIT_REACHED' && over.json.limit === LIFEOS_LIMITS.habits, `${over.res.status}`);
    const list = await call('/api/v1/habits', { jar: hana.jar });
    check('GET /habits lists every habit with its streak and today\'s log', list.res.status === 200 && list.json?.habits?.length === LIFEOS_LIMITS.habits
      && list.json.habits.every((x) => typeof x.streak?.current === 'number' && typeof x.streak.multiplierBp === 'number'), `${list.json?.habits?.length}`);
    const q = await call('/api/v1/habits?all=1', { jar: hana.jar });
    check('FORGE: GET /habits takes no query', q.res.status === 400);
  }

  /* ── tasks ───────────────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: tasks (POST /tasks, /tasks/:id/complete | reopen) ───────────────────');
  const toni = await register('toni');
  {
    const bad = await Promise.all([
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', points: 51 } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', priority: 4 } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', dueTime: '10:00' } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', recurrence: { type: 'daily' } } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', dueOn: today(), recurrence: { type: 'yearly' } } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', dueOn: today(), recurrence: { type: 'weekly', weekdayMask: 0 } } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x', completedAt: 1 } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'x'.repeat(121) } }),
      call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { title: 'no key' } }),
    ]);
    check('FORGE / EXTREMES: coins over 50, priority 4, a time without a day, a template without a day, an unknown or empty rule, a completion, a 121-char title and a missing key are refused (400)',
      bad.every((b) => b.res.status === 400), bad.map((b) => b.res.status).join(','));
  }
  let taskId;
  {
    const tk = key('task');
    const raced = await Promise.all(Array.from({ length: 4 }, () => call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: tk, title: 'Befizetni a villanyszámlát', priority: 3 } })));
    taskId = raced[0].json?.task?.id;
    check('RACE / REPLAY: four creates with one clientKey make one task', new Set(raced.map((r) => r.json?.task?.id)).size === 1
      && one('SELECT COUNT(*) n FROM tasks WHERE user_id = ?', toni.id).n === 1, raced.map((r) => r.res.status).join(','));
    check('the task shows what it is worth (+20 for FONTOS)', raced[0].json?.task?.valueMinor === 2000);
  }
  {
    const forged = await call(`/api/v1/tasks/${taskId}/complete`, { method: 'POST', jar: toni.jar, body: { amountMinor: 999999 } });
    const forged2 = await call(`/api/v1/tasks/${taskId}/complete`, { method: 'POST', jar: toni.jar, body: { late: false, date: '2020-01-01' } });
    check('FORGE: complete takes no amount, date or late flag (400)', forged.res.status === 400 && forged2.res.status === 400, `${forged.res.status} ${forged2.res.status}`);
    const before = await wallet(toni);
    const raced = await Promise.all(Array.from({ length: 5 }, () => call(`/api/v1/tasks/${taskId}/complete`, { method: 'POST', jar: toni.jar, body: {} })));
    const after = await wallet(toni);
    const awards = one(`SELECT COUNT(*) n FROM coin_events WHERE user_id = ? AND reason_key = 'task.done' AND source_id = ?`, toni.id, taskId).n;
    check('RACE: five concurrent completes pay exactly once (+20)', raced.every((r) => r.res.status === 200) && after - before === 2000 && awards === 1
      && raced.filter((r) => r.json?.already).length === 4, `${before} -> ${after}, awards ${awards}`);
    const again = await call(`/api/v1/tasks/${taskId}/complete`, { method: 'POST', jar: toni.jar, body: {} });
    check('REPLAY: completing again pays nothing', again.res.status === 200 && again.json?.already === true && (await wallet(toni)) === after);
    const reopened = await Promise.all(Array.from({ length: 3 }, () => call(`/api/v1/tasks/${taskId}/reopen`, { method: 'POST', jar: toni.jar, body: {} })));
    const reversals = one(`SELECT COUNT(*) n FROM coin_events WHERE user_id = ? AND reason_key = 'reversal.debit' AND source_id = ?`, toni.id, taskId).n;
    check('RACE: three concurrent reopens reverse exactly once (back to the start)', reopened.every((r) => r.res.status === 200) && (await wallet(toni)) === before && reversals === 1, `reversals ${reversals}`);
    const third = await call(`/api/v1/tasks/${taskId}/complete`, { method: 'POST', jar: toni.jar, body: {} });
    check('complete / reopen / complete pays once, not twice', third.json?.awardedMinor === 2000 && (await wallet(toni)) === before + 2000);
    const ledger = await call('/api/v1/coins/ledger', { jar: toni.jar });
    const row = (ledger.json?.entries ?? []).find((e) => e.reasonKey === 'task.done');
    check('the ledger names the task as the source', row?.sourceType === 'task' && row.sourceTitle === 'Befizetni a villanyszámlát' && row.localDate === today(), JSON.stringify(row));
  }
  {
    const intruder = await register('task-intruder');
    const w0 = await wallet(intruder);
    const own0 = await wallet(toni);
    const tries = await Promise.all([
      call(`/api/v1/tasks/${taskId}`, { jar: intruder.jar }),
      call(`/api/v1/tasks/${taskId}`, { method: 'PATCH', jar: intruder.jar, body: { title: 'mine' } }),
      call(`/api/v1/tasks/${taskId}/reopen`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/tasks/${taskId}/complete`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/tasks/${taskId}`, { method: 'DELETE', jar: intruder.jar }),
    ]);
    check('IDOR: another account reads, edits, reopens, completes or deletes the task — 404 every time', tries.every((t) => t.res.status === 404), tries.map((t) => t.res.status).join(','));
    check('... and neither wallet moved', (await wallet(intruder)) === w0 && (await wallet(toni)) === own0);
  }
  {
    // EXTREMES: the daily cap. Tasks worth 50 each: 400 coins a day, then nothing more.
    const big = await register('cap');
    let paid = 0;
    let lastCapped = null;
    for (let i = 0; i < 9; i += 1) {
      const t = await call('/api/v1/tasks', { method: 'POST', jar: big.jar, body: { clientKey: key(), title: `big ${i}`, points: 50 } });
      const c = await call(`/api/v1/tasks/${t.json?.task?.id}/complete`, { method: 'POST', jar: big.jar, body: {} });
      paid += c.json?.awardedMinor ?? 0;
      lastCapped = c.json;
    }
    check(`EXTREMES: nine tasks of 50 pay ${DEFAULT_RULES.dailyEarnCap} in a day, the ninth nothing`, paid === DEFAULT_RULES.dailyEarnCap * 100 && lastCapped?.awardedMinor === 0
      && (await wallet(big)) === DEFAULT_RULES.dailyEarnCap * 100, `${paid}`);
  }
  {
    // The reopen window ends when the completion's day settles.
    const t = await call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'done long ago' } });
    const yesterday = dates.addDaysToKey(today(), -1);
    run(`UPDATE tasks SET completed_at = unixepoch(), completed_on = ? WHERE id = ?`, yesterday, t.json.task.id);
    run(`INSERT OR IGNORE INTO daily_summaries (user_id, local_date, status) VALUES (?, ?, 'lapsed')`, toni.id, yesterday);
    const r = await call(`/api/v1/tasks/${t.json.task.id}/reopen`, { method: 'POST', jar: toni.jar, body: {} });
    check('a completion on a settled day cannot be reopened (409 DAY_LOCKED)', r.res.status === 409 && r.json?.code === 'DAY_LOCKED', `${r.res.status}`);
  }
  {
    const tpl = await call('/api/v1/tasks', { method: 'POST', jar: toni.jar, body: { clientKey: key(), title: 'Vitamin', dueOn: today(), dueTime: '08:00', recurrence: { type: 'daily' } } });
    const list = await call('/api/v1/tasks', { jar: toni.jar });
    check('a recurring template creates today\'s instance and is listed as a template', tpl.res.status === 201 && list.json?.templates?.some((x) => x.id === tpl.json.task.id)
      && [...list.json.due, ...list.json.overdue].some((x) => x.parentTaskId === tpl.json.task.id), `${tpl.res.status}`);
    const c = await call(`/api/v1/tasks/${tpl.json.task.id}/complete`, { method: 'POST', jar: toni.jar, body: {} });
    check('a template itself cannot be completed (409 TEMPLATE)', c.res.status === 409 && c.json?.code === 'TEMPLATE');
    const del = await call(`/api/v1/tasks/${tpl.json.task.id}`, { method: 'DELETE', jar: toni.jar });
    const del2 = await call(`/api/v1/tasks/${tpl.json.task.id}`, { method: 'DELETE', jar: toni.jar });
    check('delete is 204, a second delete 404', del.res.status === 204 && del2.res.status === 404, `${del.res.status} ${del2.res.status}`);
  }

  /* ── the day close over HTTP ─────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: the full day close (GET /lifeos/today settles habits and tasks) ─────');
  {
    const dora = await register('dora', { zone: false });
    const t0 = today();
    const d3 = dates.addDaysToKey(t0, -3);
    const d2 = dates.addDaysToKey(t0, -2);
    run(`UPDATE user_prefs SET timezone = ?, timezone_set_at = unixepoch(), lifeos_started_on = ? WHERE user_id = ?`, TZ, d3, dora.id);
    const hid = Number(run(
      `INSERT INTO habits (user_id, name, kind, points_success, points_penalty, started_on, client_key) VALUES (?, 'Olvasás', 'good', 10, 5, ?, ?)`,
      dora.id, d3, key(),
    ).lastInsertRowid);
    run(`INSERT INTO habit_logs (habit_id, user_id, local_date, count, status, done_at) VALUES (?, ?, ?, 1, 'done', unixepoch())`, hid, dora.id, d3);
    const tid = Number(run(`INSERT INTO tasks (user_id, title, due_on, client_key) VALUES (?, 'left open', ?, ?)`, dora.id, d3, key()).lastInsertRowid);
    const settled = dates.settledThroughFor(Date.now(), TZ, 4);
    const reads = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/lifeos/today', { jar: dora.jar })));
    const days = conn.prepare('SELECT local_date d FROM daily_summaries WHERE user_id = ? ORDER BY d').all(dora.id).map((r) => r.d);
    const expectDays = dates.dayRange(d3, settled);
    check('RACE: five concurrent reads settle each due day exactly once', reads.every((r) => r.res.status === 200) && days.join() === expectDays.join(), `${days.join()} want ${expectDays.join()}`);
    const results = conn.prepare('SELECT local_date d, outcome o FROM habit_day_results WHERE habit_id = ? ORDER BY d').all(hid);
    check('the habit has one settled result per closed day (done on the first, then missed)', results.length === expectDays.length && results[0]?.o === 'done'
      && results.slice(1).every((r) => r.o === 'missed'), JSON.stringify(results));
    const misses = expectDays.length - 1;
    const expectMinor = (10 - 5 * misses - DEFAULT_RULES.taskOverdue) * 100;
    const w = await wallet(dora);
    check('the coins are f_app\'s: +10, -5 per miss, -5 for the overdue task (once)', w === expectMinor, `${w} want ${expectMinor}`);
    const again = await call('/api/v1/lifeos/today', { jar: dora.jar });
    check('REPLAY: reading again settles nothing again', again.json?.wallet?.balanceMinor === expectMinor && one('SELECT COUNT(*) n FROM habit_day_results WHERE habit_id = ?', hid).n === results.length);
    check('the overdue task is marked once, on its due day', one('SELECT overdue_on o FROM tasks WHERE id = ?', tid).o === d3);
    const t = again.json;
    check('GET /lifeos/today carries the habits (streak, multiplier, preview) and the tasks (due / overdue)', Array.isArray(t?.habits) && t.habits[0]?.id === hid
      && typeof t.habits[0].streak?.multiplierBp === 'number' && typeof t.habits[0].previewMinor === 'number'
      && Array.isArray(t.tasks?.due) && t.tasks.overdue.some((x) => x.id === tid && x.overduePenaltyMinor === -DEFAULT_RULES.taskOverdue * 100),
      JSON.stringify({ h: t?.habits?.length, o: t?.tasks?.overdue?.length }));
    const lock = await call(`/api/v1/habits/${hid}/log`, { method: 'POST', jar: dora.jar, body: { count: 1, date: d2 } });
    check('a settled day refuses a habit write (409 DAY_LOCKED)', lock.res.status === 409 && lock.json?.code === 'DAY_LOCKED', `${lock.res.status}`);
    const detail = await call(`/api/v1/habits/${hid}`, { jar: dora.jar });
    check('GET /habits/:id: the settled days with their coins and the 12-week totals', detail.res.status === 200 && detail.json?.days?.length === results.length
      && detail.json.totals?.coinsMinor === (10 - 5 * misses) * 100, JSON.stringify(detail.json?.totals));
  }

  conn.close();
}
