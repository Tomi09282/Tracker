// scripts/smoke/lifeos-core.js — the LifeOS core (migration 031) against the running server.
//
// Imported by scripts/smoke.js and run last, before logout. One section per Phase-2 endpoint, each
// walked through the five passes of the plan's adversarial table:
//
//   FORGE    a body / query the schema must refuse (.strict(), bounded, regex + runtime checks)
//   REPLAY   the same request twice moves nothing twice
//   RACE     concurrent requests settle on exactly one effect
//   IDOR     there is no id to forge; another account's object pays nothing
//   EXTREMES the bounds of every number and string
//
// Some states cannot be reached over HTTP in a test that must finish in seconds — "LifeOS started
// four days ago", "a nutrition plan with a 2000 kcal target", "a workout with ten logged sets" — so
// they are planted straight into the throwaway smoke database (the same technique as smoke.js
// seedPublicCorpus). Every ASSERTION goes through the API.

export async function lifeosCoreSmoke({ call, check, Jar, seeded, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const dates = await import('../../src/lifeos/dates.js');
  const { DEFAULT_RULES } = await import('../../src/lifeos/rules.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);

  const register = async (label) => {
    const jar = new Jar();
    const email = `lifeos-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    return { jar, email, id };
  };

  /* ── PATCH /me/prefs ─────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: the day boundary (GET / PATCH /me/prefs) ───────────────────────────');
  const ann = await register('ann');
  {
    const { res, json } = await call('/api/v1/me/prefs', { jar: ann.jar });
    check('GET /me/prefs: a new account has no zone, a 04:00 day start and has not started', res.status === 200
      && json?.prefs?.timezone === null && json.prefs.dayStartHour === 4 && json.prefs.startedOn === null,
      `status ${res.status} ${JSON.stringify(json?.prefs)}`);
  }
  {
    const t = await call('/api/v1/lifeos/today', { jar: ann.jar });
    check('GET /lifeos/today before a zone: started false, no logical day, a wallet anyway', t.res.status === 200
      && t.json?.started === false && t.json.today === null && typeof t.json.wallet?.balanceMinor === 'number',
      `status ${t.res.status}`);
  }
  {
    const anon = await call('/api/v1/me/prefs');
    const anonToday = await call('/api/v1/lifeos/today');
    check('both refuse an anonymous caller (401)', anon.res.status === 401 && anonToday.res.status === 401, `${anon.res.status} / ${anonToday.res.status}`);
  }
  {
    const bad = await Promise.all([
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: {} }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Mars/Olympus' } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Europe/../etc' } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: `Europe/${'x'.repeat(80)}` } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { dayStartHour: 3 } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { dayStartHour: '4' } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Europe/Budapest', startedOn: '2020-01-01' } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Europe/Budapest', userId: 1 } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Europe/Budapest' }, csrf: false }),
    ]);
    check('FORGE / EXTREMES: an empty body, an unknown zone, a path-like zone, an over-long zone, a day start the frame does not offer, a string hour, a forged start day, a user id and a missing X-CSRF are all refused',
      bad.slice(0, 8).every((b) => b.res.status === 400) && bad[8].res.status === 403,
      bad.map((b) => b.res.status).join(','));
  }
  {
    const first = await call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Europe/Budapest' } });
    const today = dates.dayKeyFor(Date.now(), 'Europe/Budapest', 4);
    check('setting the zone starts LifeOS on the logical today', first.res.status === 200 && first.json?.prefs?.timezone === 'Europe/Budapest'
      && first.json.prefs.startedOn === today && typeof first.json.prefs.utcOffsetMinutes === 'number',
      `${first.res.status} ${JSON.stringify(first.json?.prefs)}`);
    const again = await call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'Europe/Budapest' } });
    const audits = one(`SELECT COUNT(*) n FROM audit_log WHERE action = 'lifeos.prefs.timezone' AND target_id = ?`, ann.id).n;
    check('REPLAY: the same zone again is a 200 no-op, audited once', again.res.status === 200 && audits === 1, `${again.res.status}, ${audits} audit row(s)`);
    const moved = await call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { timezone: 'America/New_York' } });
    check('a different zone inside 24 h is a 409 TIMEZONE_TOO_SOON with the moment it may change', moved.res.status === 409
      && moved.json?.code === 'TIMEZONE_TOO_SOON' && moved.json.changeableAt > Date.now(),
      `${moved.res.status} ${moved.json?.code}`);
    const dsh = await call('/api/v1/me/prefs', { method: 'PATCH', jar: ann.jar, body: { dayStartHour: 6 } });
    check('the day start changes, and the zone and start day do not move with it', dsh.res.status === 200 && dsh.json?.prefs?.dayStartHour === 6
      && dsh.json.prefs.timezone === 'Europe/Budapest' && dsh.json.prefs.startedOn === today, `${dsh.res.status}`);
  }
  {
    const bea = await register('bea');
    const raced = await Promise.all([
      call('/api/v1/me/prefs', { method: 'PATCH', jar: bea.jar, body: { timezone: 'Europe/Berlin' } }),
      call('/api/v1/me/prefs', { method: 'PATCH', jar: bea.jar, body: { timezone: 'Asia/Tokyo' } }),
    ]);
    const statuses = raced.map((r) => r.res.status).sort();
    const stored = one('SELECT timezone t FROM user_prefs WHERE user_id = ?', bea.id).t;
    check('RACE: two different first zones at once — one lands, the other is told too soon, never both', statuses.join() === '200,409'
      && raced.find((r) => r.res.status === 200)?.json?.prefs?.timezone === stored,
      `${statuses.join()} -> ${stored}`);
  }

  /* ── the lazy day close, through GET /lifeos/today and GET /coins/wallet ─────────────────── */
  console.log('\n── lifeos: the day close (GET /lifeos/today, GET /coins/wallet) ────────────────');
  const cal = await register('cal');
  await call('/api/v1/me/prefs', { method: 'PATCH', jar: cal.jar, body: { timezone: 'UTC', dayStartHour: 0 } });
  // Plant: LifeOS started 3 days ago, a 2000 kcal nutrition target, 3000 kcal eaten 3 days ago and
  // 2000 kcal two days ago — one 'over' (a penalty) and one 'hit' (an award) once both are due.
  const todayUtc = dates.dayKeyFor(Date.now(), 'UTC', 0);
  const d1 = dates.addDaysToKey(todayUtc, -3);
  const d2 = dates.addDaysToKey(todayUtc, -2);
  conn.prepare('DELETE FROM user_prefs WHERE user_id = ?').run(cal.id);
  run(`INSERT INTO user_prefs (user_id, timezone, timezone_set_at, day_start_hour, lifeos_started_on) VALUES (?, 'UTC', unixepoch(), 0, ?)`, cal.id, d1);
  const np = Number(run(`INSERT INTO nutrition_plans (name, normalized_name, scope, client_user_id, author_user_id, status, starts_on, cycle_days)
                         VALUES ('smoke', 'smoke', 'personal', ?, ?, 'active', ?, 1)`, cal.id, cal.id, d1).lastInsertRowid);
  run('INSERT INTO nutrition_plan_days (plan_id, day_index, kcal_target_x10) VALUES (?, 0, 20000)', np);
  const food = one(`SELECT id FROM foods WHERE source = 'system' AND kcal_per_100g_x10 > 0 ORDER BY id LIMIT 1`);
  const foodKcal10 = one('SELECT kcal_per_100g_x10 k FROM foods WHERE id = ?', food.id).k;
  const grams10For = (kcal) => Math.round((kcal * 10 * 1000) / foodKcal10); // grams_x10 for `kcal`
  for (const [date, kcal] of [[d1, 3000], [d2, 2000]]) {
    const { res } = await call('/api/v1/nutrition-log', {
      method: 'POST', jar: cal.jar, body: { food_id: food.id, grams: grams10For(kcal) / 10, local_date: date },
    });
    check(`a past day (${date}) can still be logged`, res.status === 201, `status ${res.status}`);
  }
  {
    const tomorrow = dates.addDaysToKey(todayUtc, 1);
    const { res } = await call('/api/v1/nutrition-log', { method: 'POST', jar: cal.jar, body: { food_id: food.id, grams: 100, local_date: tomorrow } });
    check('FORGE: POST /nutrition-log refuses a future local date (the kcal outcome cannot be pre-loaded)', res.status === 400, `status ${res.status}`);
  }
  const settled = dates.settledThroughFor(Date.now(), 'UTC', 0);
  const expectMinor = (DEFAULT_RULES.kcalGoalHit * (d2 <= settled ? 1 : 0) - DEFAULT_RULES.kcalGoalMissed) * 100;
  {
    // RACE: five wallet reads at once on a user with due days — every one may try to settle.
    const reads = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/coins/wallet', { jar: cal.jar })));
    const w = await call('/api/v1/coins/wallet', { jar: cal.jar });
    check('RACE: five concurrent wallet reads settle the due days exactly once', reads.every((r) => r.res.status === 200)
      && w.json?.balanceMinor === expectMinor, `${w.json?.balanceMinor} (want ${expectMinor})`);
    check('the wallet answers balance (below zero allowed), spendable, XP, level and bounds', typeof w.json?.spendableMinor === 'number'
      && w.json.spendableMinor === Math.max(0, w.json.balanceMinor) && Number.isInteger(w.json.xp) && Number.isInteger(w.json.level)
      && w.json.bounds?.nextLevelXp > w.json.bounds?.levelFloorXp - 1 && w.json.dailyEarnCapMinor === DEFAULT_RULES.dailyEarnCap * 100
      && w.json.week?.length === 7 && w.json.settleTime === '06:00', JSON.stringify(w.json).slice(0, 120));
  }
  {
    const t1 = await call('/api/v1/lifeos/today', { jar: cal.jar });
    const t2 = await call('/api/v1/lifeos/today', { jar: cal.jar });
    check('REPLAY: GET /lifeos/today twice moves nothing twice', t1.res.status === 200 && t2.json?.wallet?.balanceMinor === expectMinor
      && t1.json.settledThrough === settled && t1.json.started === true && t1.json.today === todayUtc,
      `${t2.json?.wallet?.balanceMinor}, settledThrough ${t1.json?.settledThrough}`);
    const days = conn.prepare(`SELECT local_date d, kcal_outcome k FROM daily_summaries WHERE user_id = ? ORDER BY d`).all(cal.id);
    check('the settled days hold their outcomes (over, then hit)', days[0]?.k === 'over' && (d2 > settled || days[1]?.k === 'hit'), JSON.stringify(days));
    const bad = await call('/api/v1/lifeos/today?date=2020-01-01', { jar: cal.jar });
    check('FORGE: GET /lifeos/today takes no query (a client cannot pick the day)', bad.res.status === 400, `status ${bad.res.status}`);
  }
  {
    const ledger = await call('/api/v1/coins/ledger', { jar: cal.jar });
    const pen = (ledger.json?.entries ?? []).find((e) => e.reasonKey === 'day.kcal_over');
    check('the ledger shows the penalty with its logical day and source', pen?.amountMinor === -DEFAULT_RULES.kcalGoalMissed * 100
      && pen.refType === 'coin_event' && pen.localDate === d1 && pen.sourceType === 'day', JSON.stringify(pen));
  }
  if (expectMinor < 0) {
    const store = await call('/api/v1/coins/store', { jar: cal.jar });
    const item = (store.json?.items ?? [])[0];
    if (item) {
      const buy = await call(`/api/v1/coins/store/${item.id}/purchase`, {
        method: 'POST', jar: cal.jar, body: { idempotency_key: `lifeos-debt-${stamp}`, expected_price_minor: item.priceMinor },
      });
      check('EXTREMES: an account in debt cannot spend (a spend must be covered)', buy.res.status === 409, `status ${buy.res.status}`);
    }
  }

  /* ── the workout award ───────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: workout.completed (POST /workouts/:id/finish) ───────────────────────');
  {
    const plantLog = (userId, done, total) => {
      const logId = Number(run(`INSERT INTO workout_logs (client_user_id, local_date, status, started_at, title) VALUES (?, ?, 'in_progress', unixepoch(), 'LifeOS probe')`, userId, todayUtc).lastInsertRowid);
      const lex = Number(run(`INSERT INTO workout_log_exercises (log_id, client_user_id, exercise_name_snapshot, position) VALUES (?, ?, 'probe', 0)`, logId, userId).lastInsertRowid);
      for (let i = 0; i < total; i += 1) {
        run(`INSERT INTO workout_log_sets (log_exercise_id, log_id, client_user_id, local_date, set_index, completed_at, reps)
             VALUES (?, ?, ?, ?, ?, CASE WHEN ? < ? THEN unixepoch() END, 8)`, lex, logId, userId, todayUtc, i + 1, i, done);
      }
      return logId;
    };
    const before = (await call('/api/v1/coins/wallet', { jar: cal.jar })).json?.balanceMinor;
    const logId = plantLog(cal.id, 9, 10);
    const fin = await call(`/api/v1/workouts/${logId}/finish`, { method: 'POST', jar: cal.jar, body: {} });
    await new Promise((r) => setTimeout(r, 900));
    const after = (await call('/api/v1/coins/wallet', { jar: cal.jar })).json;
    // The first finished session also unlocks the 'workout.first' achievement (019) — a separate
    // movement through its own reason, so the LifeOS award is measured on its own ledger row.
    const achMinor = (await call('/api/v1/coins/ledger', { jar: cal.jar })).json?.entries
      ?.filter((e) => e.reasonKey === 'achievement.reward').reduce((a, e) => a + e.amountMinor, 0) ?? 0;
    check('finishing a 90 % workout pays workoutComplete coins, after the finish', fin.res.status === 200
      && after.balanceMinor - before - achMinor === DEFAULT_RULES.workoutComplete * 100,
      `${before} -> ${after.balanceMinor} (achievements ${achMinor})`);
    const again = await call(`/api/v1/workouts/${logId}/finish`, { method: 'POST', jar: cal.jar, body: {} });
    await new Promise((r) => setTimeout(r, 500));
    const after2 = (await call('/api/v1/coins/wallet', { jar: cal.jar })).json?.balanceMinor;
    check('REPLAY: finishing it again is a 404 and pays nothing', again.res.status === 404 && after2 === after.balanceMinor, `${again.res.status}, ${after2}`);
    const ledger = await call('/api/v1/coins/ledger', { jar: cal.jar });
    const award = (ledger.json?.entries ?? []).find((e) => e.reasonKey === 'workout.completed');
    check('the ledger names the workout it paid for', award?.sourceType === 'workout_log' && award.sourceId === logId && award.sourceTitle === 'LifeOS probe',
      JSON.stringify(award));

    // IDOR: another account finishing cal's log id gets the uniform 404 and nobody is paid.
    const dan = await register('dan');
    await call('/api/v1/me/prefs', { method: 'PATCH', jar: dan.jar, body: { timezone: 'UTC' } });
    const foreign = plantLog(cal.id, 10, 10);
    const steal = await call(`/api/v1/workouts/${foreign}/finish`, { method: 'POST', jar: dan.jar, body: {} });
    await new Promise((r) => setTimeout(r, 500));
    const danWallet = (await call('/api/v1/coins/wallet', { jar: dan.jar })).json?.balanceMinor;
    check('IDOR: finishing another account\'s workout is a 404 and pays nobody', steal.res.status === 404 && danWallet === 0
      && !one(`SELECT 1 FROM coin_events WHERE source_type = 'workout_log' AND source_id = ?`, foreign), `${steal.res.status}, ${danWallet}`);

    // EXTREMES: under half the sets pays nothing; the daily cap trims the award.
    const low = plantLog(dan.id, 4, 10);
    await call(`/api/v1/workouts/${low}/finish`, { method: 'POST', jar: dan.jar, body: {} });
    await new Promise((r) => setTimeout(r, 700));
    const danLedger = (await call('/api/v1/coins/ledger', { jar: dan.jar })).json?.entries ?? [];
    check('EXTREMES: a 40 % workout pays no workout coins (below workoutHalfPct)', !danLedger.some((e) => e.reasonKey === 'workout.completed'),
      danLedger.map((e) => e.reasonKey).join(','));
  }

  /* ── GET / PUT /admin/rules ──────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: the point rules (GET / PUT /admin/rules) ────────────────────────────');
  {
    const admin = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.admin.email, password: seeded.admin.password }, jar: admin });
    const coach = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email: seeded.coach.email, password: seeded.coach.password }, jar: coach });

    const got = await call('/api/v1/admin/rules', { jar: admin });
    const version = got.json?.current?.version;
    check('GET /admin/rules answers the rules in force, the defaults and the ranges', got.res.status === 200 && version >= 1
      && got.json.current.rules?.dailyEarnCap === DEFAULT_RULES.dailyEarnCap && got.json.defaults?.perfectDay === DEFAULT_RULES.perfectDay
      && Array.isArray(got.json.ranges?.dailyEarnCap), `status ${got.res.status}`);
    const asCoach = await call('/api/v1/admin/rules', { jar: coach });
    const asMember = await call('/api/v1/admin/rules', { method: 'PUT', jar: ann.jar, body: { expectedVersion: version, rules: DEFAULT_RULES } });
    check('a coach cannot read them and a member cannot write them (403)', asCoach.res.status === 403 && asMember.res.status === 403,
      `${asCoach.res.status} / ${asMember.res.status}`);

    const rules = got.json.current.rules;
    const put = (body) => call('/api/v1/admin/rules', { method: 'PUT', jar: admin, body });
    const forged = await Promise.all([
      put({ expectedVersion: version, rules: { ...rules, bonus: 5 } }),
      put({ expectedVersion: version, rules: { ...rules, streakTier1MultBp: 1.25 } }),
      put({ expectedVersion: version, rules: { ...rules, workoutHalfPct: 95 } }),
      put({ expectedVersion: version, rules: { ...rules, dailyEarnCap: 10001 } }),
      put({ expectedVersion: version, rules: { ...rules, perfectDay: -1 } }),
      put({ expectedVersion: 0, rules }),
      put({ rules }),
      put({ expectedVersion: version, rules, note: 'x'.repeat(281) }),
      put({ expectedVersion: version, rules, createdBy: 1 }),
    ]);
    check('FORGE / EXTREMES: an unknown rule, a fractional multiplier, half > full, a cap over the range, a negative value, version 0, no version, an over-long note and a forged author are all 400',
      forged.every((f) => f.res.status === 400), forged.map((f) => f.res.status).join(','));

    const same = await put({ expectedVersion: version, rules });
    check('REPLAY: the same rules again change nothing (no empty version)', same.res.status === 200 && same.json?.unchanged === true
      && same.json.current?.version === version, `${same.res.status}`);

    const raced = await Promise.all([
      put({ expectedVersion: version, rules: { ...rules, perfectDay: rules.perfectDay + 1 }, note: 'race a' }),
      put({ expectedVersion: version, rules: { ...rules, perfectDay: rules.perfectDay + 2 }, note: 'race b' }),
    ]);
    const st = raced.map((r) => r.res.status).sort();
    check('RACE: two edits of the same version — one lands, the other is a 409 RULES_STALE with the new version', st.join() === '200,409'
      && raced.find((r) => r.res.status === 409)?.json?.code === 'RULES_STALE'
      && raced.find((r) => r.res.status === 409).json.currentVersion === version + 1, st.join());
    const audit = one(`SELECT actor_id a, detail FROM audit_log WHERE action = 'lifeos.rules.set' ORDER BY id DESC LIMIT 1`);
    check('the new version is audited with its author and the changed keys', audit && JSON.parse(audit.detail).changed?.perfectDay, audit?.detail?.slice(0, 80));

    const back = await put({ expectedVersion: version + 1, rules: DEFAULT_RULES, note: 'smoke: back to the defaults' });
    check('and the defaults are restored as a further version (history is append-only)', back.res.status === 200 && back.json?.current?.version === version + 2
      && back.json.current.rules.perfectDay === DEFAULT_RULES.perfectDay, `${back.res.status}`);
  }

  conn.close();
}
