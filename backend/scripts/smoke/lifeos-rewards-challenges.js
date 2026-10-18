// scripts/smoke/lifeos-rewards-challenges.js — the daily challenge draw and the reward shop
// (migration 033) against the running server.
//
// Imported by scripts/smoke.js after the habits / tasks section. Every coin-moving or day-dependent
// endpoint walks the five passes of the plan's adversarial table:
//
//   FORGE    a body / param the schema must refuse (.strict(), bounded, regex) — and no client
//            amount, cost, option list or date ever reaches a draw, a pick or a spend
//   REPLAY   the same request twice moves nothing twice (draw per day, reroll key, pick key, redeem key)
//   RACE     concurrent requests settle on exactly one effect (draw, reroll, pick, redeem)
//   IDOR     another account's challenge / reward / redemption is a 404 (or not on the table) and
//            moves nothing on either side
//   EXTREMES the bounds of every number and string, a balance in debt, the item caps
//
// Coins for the redeem passes are planted straight into the throwaway smoke database as an
// administrative credit (lifeos-core.js's technique); every ASSERTION goes through the API.

export async function lifeosRewardsChallengesSmoke({ call, check, Jar, stamp, PASSWORD }) {
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
    const email = `lifeos-rc-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    if (zone) await call('/api/v1/me/prefs', { method: 'PATCH', jar, body: { timezone: TZ } });
    return { jar, id };
  };
  const wallet = async (u) => (await call('/api/v1/coins/wallet', { jar: u.jar })).json?.balanceMinor;
  const credit = (u, minor) =>
    run(`INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key, request_id)
         VALUES (?, ?, 'admin.credit', ?, 'smoke')`, u.id, minor, `smoke:${u.id}:${key('cr')}`);
  const today = () => dates.dayKeyFor(Date.now(), TZ, 4);

  /* ── the challenge pool ──────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: the challenge pool (POST /challenges) ───────────────────────────────');
  const noZone = await register('nozone', { zone: false });
  {
    const r = await call('/api/v1/challenges', { method: 'POST', jar: noZone.jar, body: { clientKey: key(), name: 'x' } });
    check('a challenge cannot be created before the zone is set (409 TIMEZONE_REQUIRED)', r.res.status === 409 && r.json?.code === 'TIMEZONE_REQUIRED', `${r.res.status} ${r.json?.code}`);
    const rw = await call('/api/v1/rewards', { method: 'POST', jar: noZone.jar, body: { clientKey: key(), name: 'x', cost: 10 } });
    check('nor a reward', rw.res.status === 409 && rw.json?.code === 'TIMEZONE_REQUIRED', `${rw.res.status}`);
    const anon = await Promise.all(['/api/v1/challenges', '/api/v1/challenges/today', '/api/v1/rewards'].map((p) => call(p)));
    check('an anonymous caller is refused (401)', anon.every((a) => a.res.status === 401), anon.map((a) => a.res.status).join(','));
  }

  const hana = await register('hana');
  const pool = [];
  {
    const bad = await Promise.all([
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', points: 51 } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', points: -1 } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', weight: 6 } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', weight: 0 } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', category: 'chores' } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: '   ' } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x'.repeat(81) } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: 'buy:12345678', name: 'x' } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', userId: 1 } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x', points: 1.5 } }),
      call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'x' }, csrf: false }),
    ]);
    check('FORGE / EXTREMES: coins over 50 or negative or fractional, weight 0 / 6, an unknown category, a blank or 81-char name, a colon key, a user id and a missing X-CSRF are refused',
      bad.slice(0, 10).every((b) => b.res.status === 400) && bad[10].res.status === 403, bad.map((b) => b.res.status).join(','));
  }
  {
    const ck = key('chal');
    const raced = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/challenges', {
      method: 'POST', jar: hana.jar, body: { clientKey: ck, name: 'Hideg zuhany, 2 perc', category: 'discipline', points: 20, weight: 3 },
    })));
    const ids = new Set(raced.map((r) => r.json?.challenge?.id));
    const statuses = raced.map((r) => r.res.status);
    check('RACE / REPLAY: five creates with one clientKey make one challenge (one 201, the rest 200 replayed)',
      ids.size === 1 && statuses.filter((s) => s === 201).length === 1 && statuses.every((s) => s === 200 || s === 201), statuses.join(','));
    pool.push([...ids][0]);
    for (const [name, category, points, weight] of [
      ['10 perc nyújtás lefekvés előtt', 'movement', 15, 4], ['Olvass el 20 oldalt', 'mind', 15, 3],
      ['10 000 lépés', 'movement', 25, 2], ['Nincs telefon vacsoránál', 'discipline', 10, 3], ['Főzz magadnak ebédet', 'food', 50, 1],
    ]) {
      const r = await call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name, category, points, weight } });
      pool.push(r.json?.challenge?.id);
    }
    const list = await call('/api/v1/challenges', { jar: hana.jar });
    check('GET /challenges: six active, the pool cap is 50, coins as minor values', list.res.status === 200 && list.json?.active?.length === 6
      && list.json.limits?.pool === LIFEOS_LIMITS.challengePool && list.json.active.every((c) => c.valueMinor === c.points * 100), `${list.json?.active?.length}`);
    const dflt = await call('/api/v1/challenges', { method: 'POST', jar: hana.jar, body: { clientKey: key(), name: 'no coins given' } });
    check('a challenge without coins takes the rule challengePoints', dflt.res.status === 201 && dflt.json?.challenge?.points === DEFAULT_RULES.challengePoints);
    const arch = await call(`/api/v1/challenges/${dflt.json.challenge.id}/archive`, { method: 'POST', jar: hana.jar, body: {} });
    check('"Archiválás" moves it to ARCHIVÁLT', arch.res.status === 200 && arch.json?.challenge?.archived === true);
  }

  /* ── the daily draw ──────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: the daily draw (POST /challenges/today/draw | reroll | pick) ─────────');
  let draw;
  {
    const before = await call('/api/v1/lifeos/today', { jar: hana.jar });
    check('GET /lifeos/today carries the draw state: due', before.res.status === 200 && before.json?.challenge?.state === 'due' && before.json.challenge.date === today(), JSON.stringify(before.json?.challenge));
    const forged = await Promise.all([
      call('/api/v1/challenges/today/draw', { method: 'POST', jar: hana.jar, body: { options: [pool[0], pool[1], pool[2]] } }),
      call('/api/v1/challenges/today/draw', { method: 'POST', jar: hana.jar, body: { date: dates.addDaysToKey(today(), 1) } }),
      call('/api/v1/challenges/today/draw', { method: 'POST', jar: hana.jar, body: {}, csrf: false }),
    ]);
    check('FORGE: a client option list or date is refused (400), and so is a missing X-CSRF (403)',
      forged[0].res.status === 400 && forged[1].res.status === 400 && forged[2].res.status === 403, forged.map((f) => f.res.status).join(','));
    const raced = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/challenges/today/draw', { method: 'POST', jar: hana.jar, body: {} })));
    const statuses = raced.map((r) => r.res.status);
    const hands = new Set(raced.map((r) => JSON.stringify(r.json?.draw?.options?.map((o) => o.id))));
    check('RACE / REPLAY: five concurrent draws make ONE draw (one 201, four 200 already) and all see the same hand',
      statuses.filter((s) => s === 201).length === 1 && statuses.filter((s) => s === 200).length === 4 && hands.size === 1
      && one('SELECT COUNT(*) n FROM challenge_draws WHERE user_id = ?', hana.id).n === 1, statuses.join(','));
    draw = raced.find((r) => r.res.status === 201).json.draw;
    check('the hand is three distinct challenges of the caller\'s live pool', draw.options.length === 3 && new Set(draw.options.map((o) => o.id)).size === 3
      && draw.options.every((o) => pool.includes(o.id)) && draw.rerollsLeft === 1 && draw.state === 'drawn', JSON.stringify(draw.options.map((o) => o.id)));
  }
  {
    const forged = await Promise.all([
      call('/api/v1/challenges/today/reroll', { method: 'POST', jar: hana.jar, body: {} }),
      call('/api/v1/challenges/today/reroll', { method: 'POST', jar: hana.jar, body: { rerollKey: 'short' } }),
      call('/api/v1/challenges/today/reroll', { method: 'POST', jar: hana.jar, body: { rerollKey: key(), exclude: [] } }),
    ]);
    check('FORGE: a reroll without a key, with a short key or an extra field is refused (400)', forged.every((f) => f.res.status === 400), forged.map((f) => f.res.status).join(','));
    const k1 = key('rr');
    const k2 = key('rr');
    const raced = await Promise.all([k1, k2].map((rk) => call('/api/v1/challenges/today/reroll', { method: 'POST', jar: hana.jar, body: { rerollKey: rk } })));
    const won = raced.filter((r) => r.res.status === 200);
    const lost = raced.filter((r) => r.res.status === 409);
    check('RACE: two rerolls with two keys at once — exactly one rerolls, the other is REROLL_USED',
      won.length === 1 && lost.length === 1 && lost[0].json?.code === 'REROLL_USED' && won[0].json?.draw?.rerollsLeft === 0, raced.map((r) => `${r.res.status}:${r.json?.code ?? ''}`).join(','));
    const wonKey = raced[0].res.status === 200 ? k1 : k2;
    const replay = await call('/api/v1/challenges/today/reroll', { method: 'POST', jar: hana.jar, body: { rerollKey: wonKey } });
    check('REPLAY: the winning key again answers the same hand (200 replayed)', replay.res.status === 200 && replay.json?.replayed === true
      && JSON.stringify(replay.json.draw.options) === JSON.stringify(won[0].json.draw.options));
    draw = won[0].json.draw;
  }
  let pickedTask;
  {
    const intruder = await register('intruder');
    const target = draw.options[0];
    const noDraw = await call('/api/v1/challenges/today/pick', { method: 'POST', jar: intruder.jar, body: { challengeId: target.id, clientKey: key() } });
    check('IDOR: another account picking hana\'s option has no draw (409 NO_DRAW) — nothing of hana\'s moves', noDraw.res.status === 409 && noDraw.json?.code === 'NO_DRAW', `${noDraw.res.status} ${noDraw.json?.code}`);
    await call('/api/v1/challenges', { method: 'POST', jar: intruder.jar, body: { clientKey: key(), name: 'mine' } });
    await call('/api/v1/challenges/today/draw', { method: 'POST', jar: intruder.jar, body: {} });
    const notOffered = await call('/api/v1/challenges/today/pick', { method: 'POST', jar: intruder.jar, body: { challengeId: target.id, clientKey: key() } });
    check('IDOR: with a draw of its own, hana\'s challenge is NOT_OFFERED (409)', notOffered.res.status === 409 && notOffered.json?.code === 'NOT_OFFERED', `${notOffered.res.status}`);
    const peek = await Promise.all([
      call(`/api/v1/challenges/${target.id}`, { jar: intruder.jar }),
      call(`/api/v1/challenges/${target.id}`, { method: 'PATCH', jar: intruder.jar, body: { points: 50 } }),
      call(`/api/v1/challenges/${target.id}/archive`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/challenges/${target.id}`, { method: 'DELETE', jar: intruder.jar }),
    ]);
    check('IDOR: another account cannot read, edit, archive or delete hana\'s challenge (404)', peek.every((p) => p.res.status === 404), peek.map((p) => p.res.status).join(','));

    const forged = await Promise.all([
      call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: String(target.id), clientKey: key() } }),
      call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: target.id, clientKey: key(), points: 500 } }),
      call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: target.id, clientKey: key(), dueOn: '2030-01-01' } }),
      call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: -1, clientKey: key() } }),
      call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: target.id } }),
    ]);
    check('FORGE: a string id, a client coin value, a client due day, a negative id and a missing key are refused (400)',
      forged.every((f) => f.res.status === 400), forged.map((f) => f.res.status).join(','));
    const offTable = pool.find((id) => !draw.options.some((o) => o.id === id));
    const off = await call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: offTable, clientKey: key() } });
    check('a challenge of the pool that is not on the table is NOT_OFFERED (409)', off.res.status === 409 && off.json?.code === 'NOT_OFFERED');

    const keys = [key('pick'), key('pick'), key('pick')];
    const raced = await Promise.all(keys.map((pk, i) => call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: draw.options[i].id, clientKey: pk } })));
    const won = raced.filter((r) => r.res.status === 201);
    check('RACE: three picks of three options at once — exactly one task, the others ALREADY_PICKED',
      won.length === 1 && raced.filter((r) => r.res.status === 409 && r.json?.code === 'ALREADY_PICKED').length === 2
      && one('SELECT COUNT(*) n FROM tasks WHERE user_id = ? AND challenge_id IS NOT NULL', hana.id).n === 1, raced.map((r) => `${r.res.status}:${r.json?.code ?? ''}`).join(','));
    const wi = raced.findIndex((r) => r.res.status === 201);
    const chosen = draw.options[wi];
    pickedTask = won[0].json.task;
    check('the task is the challenge: its name and coins, priority 2, due today with no time', pickedTask.title === chosen.name && pickedTask.points === chosen.points
      && pickedTask.priority === 2 && pickedTask.dueOn === today() && pickedTask.dueTime === null && pickedTask.challengeId === chosen.id, JSON.stringify(pickedTask));
    const replay = await call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: chosen.id, clientKey: keys[wi] } });
    check('REPLAY: the same pick again answers the same task (200 replayed)', replay.res.status === 200 && replay.json?.replayed === true && replay.json.task?.id === pickedTask.id);
    const other = draw.options[(wi + 1) % 3];
    const conflict = await call('/api/v1/challenges/today/pick', { method: 'POST', jar: hana.jar, body: { challengeId: other.id, clientKey: keys[wi] } });
    check('CONFLICT: the same key for another option is refused (409)', conflict.res.status === 409 && conflict.json?.code === 'conflict', `${conflict.res.status} ${conflict.json?.code}`);
    const reroll = await call('/api/v1/challenges/today/reroll', { method: 'POST', jar: hana.jar, body: { rerollKey: key() } });
    check('a picked draw cannot be rerolled (409 ALREADY_PICKED)', reroll.res.status === 409 && reroll.json?.code === 'ALREADY_PICKED');
    const t = await call('/api/v1/lifeos/today', { jar: hana.jar });
    check('GET /lifeos/today: state picked, the chosen option marked, not done yet', t.json?.challenge?.state === 'picked'
      && t.json.challenge.options.find((o) => o.chosen)?.id === chosen.id && t.json.challenge.picked?.taskId === pickedTask.id && t.json.challenge.picked.done === false);
    check('the pick moved no coin (the task pays on completion)', (await wallet(hana)) === 0);
    const done = await call(`/api/v1/tasks/${pickedTask.id}/complete`, { method: 'POST', jar: hana.jar, body: {} });
    check('completing the challenge task pays its coins', done.res.status === 200 && done.json?.awardedMinor === chosen.points * 100 && (await wallet(hana)) === chosen.points * 100, `${done.json?.awardedMinor}`);
    const after = await call('/api/v1/challenges/today', { jar: hana.jar });
    check('GET /challenges/today: teljesítve', after.res.status === 200 && after.json?.draw?.picked?.done === true);
  }
  {
    const empty = await register('empty');
    const e = await call('/api/v1/challenges/today/draw', { method: 'POST', jar: empty.jar, body: {} });
    check('EXTREMES: an empty pool draws nothing (409 EMPTY_POOL) and today says empty_pool', e.res.status === 409 && e.json?.code === 'EMPTY_POOL'
      && (await call('/api/v1/lifeos/today', { jar: empty.jar })).json?.challenge?.state === 'empty_pool');
    const nd = await call('/api/v1/challenges/today/reroll', { method: 'POST', jar: empty.jar, body: { rerollKey: key() } });
    check('a reroll with no draw is NO_DRAW (409)', nd.res.status === 409 && nd.json?.code === 'NO_DRAW');
  }

  /* ── the reward shop ─────────────────────────────────────────────────────────────────────── */
  console.log('\n── lifeos: the reward shop (POST /rewards, /rewards/:id/redeem) ────────────────');
  const rita = await register('rita');
  {
    const bad = await Promise.all([
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: 0 } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: LIFEOS_LIMITS.rewardCostMax + 1 } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: 1.5 } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: '80' } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: 80, repeatable: false, cooldownDays: 3 } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: 80, cooldownDays: 366 } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: 80, description: 'x'.repeat(281) } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x', cost: 80, costMinor: 1 } }),
      call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'x' } }),
    ]);
    check('FORGE / EXTREMES: a free, over-max, fractional or string cost, a one-time cooldown, 366 days, a 281-char description, a costMinor field and a missing cost are refused (400)',
      bad.every((b) => b.res.status === 400), bad.map((b) => b.res.status).join(','));
    const max = await call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'Új futócipő', cost: LIFEOS_LIMITS.rewardCostMax } });
    check(`EXTREMES: a reward at rewardCostMax (${LIFEOS_LIMITS.rewardCostMax} coins) is accepted`, max.res.status === 201 && max.json?.reward?.costMinor === LIFEOS_LIMITS.rewardCostMax * 100);
  }
  let coffee;
  {
    const r = await call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'Kávé a kedvenc helyen', description: 'A sarki helyen.', cost: 80 } });
    coffee = r.json?.reward;
    check('a reward is created: cost in minor, repeatable, no cooldown, INSUFFICIENT at 0 coins', r.res.status === 201 && coffee.costMinor === 8000 && coffee.repeatable === true
      && coffee.cooldownDays === null && coffee.availability?.reason === 'INSUFFICIENT' && coffee.availability.missingMinor === 8000, JSON.stringify(coffee));
    credit(rita, 10000); // 100 coins: enough for ONE 80-coin coffee
    const k1 = key('redeem');
    const k2 = key('redeem');
    const raced = await Promise.all([k1, k2].map((rk) => call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: rk } })));
    const won = raced.filter((x) => x.res.status === 201);
    const lost = raced.filter((x) => x.res.status === 409);
    check('RACE: two redeems with two keys and coins for one — exactly one receipt, the other INSUFFICIENT',
      won.length === 1 && lost.length === 1 && lost[0].json?.code === 'INSUFFICIENT'
      && one('SELECT COUNT(*) n FROM reward_redemptions WHERE user_id = ?', rita.id).n === 1, raced.map((x) => `${x.res.status}:${x.json?.code ?? ''}`).join(','));
    check('one debit, the balance never below zero (20 left)', (await wallet(rita)) === 2000
      && one(`SELECT COUNT(*) n FROM coin_ledger WHERE user_id = ? AND reason_key = 'reward.redeem'`, rita.id).n === 1, `${await wallet(rita)}`);
    const wonKey = raced[0].res.status === 201 ? k1 : k2;
    const replays = await Promise.all(Array.from({ length: 4 }, () => call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: wonKey } })));
    check('REPLAY: the winning key four times more answers the same receipt and debits nothing',
      replays.every((x) => x.res.status === 200 && x.json?.replayed === true && x.json.redemption?.id === won[0].json.redemption.id) && (await wallet(rita)) === 2000,
      replays.map((x) => x.res.status).join(','));
    const forged = await Promise.all([
      call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key(), costMinor: 1 } }),
      call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: {} }),
      call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: 'a:b:c:d:e' } }),
      call('/api/v1/rewards/abc/redeem', { method: 'POST', jar: rita.jar, body: { clientKey: key() } }),
      call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key() }, csrf: false }),
    ]);
    check('FORGE: a client cost, a missing or colon key and a non-numeric id are refused (400), a missing X-CSRF (403)',
      forged.slice(0, 4).every((f) => f.res.status === 400) && forged[4].res.status === 403, forged.map((f) => f.res.status).join(','));
    const ledger = await call('/api/v1/coins/ledger', { jar: rita.jar });
    const row = ledger.json?.entries?.find((e) => e.reasonKey === 'reward.redeem');
    check('GET /coins/ledger: "Jutalom beváltva · Kávé a kedvenc helyen −80" on today\'s logical day', row && row.amountMinor === -8000
      && row.sourceType === 'reward' && row.sourceId === coffee.id && row.sourceTitle === 'Kávé a kedvenc helyen' && row.localDate === today(), JSON.stringify(row));
    const w = await call('/api/v1/coins/wallet', { jar: rita.jar });
    check('the spend is not an earn: today\'s earnings and XP are untouched', w.json?.todayEarnedMinor === 0 && w.json?.xp === 0, JSON.stringify({ e: w.json?.todayEarnedMinor, xp: w.json?.xp }));
  }
  {
    const intruder = await register('intruder2');
    credit(intruder, 100000);
    const redemptionId = one('SELECT id FROM reward_redemptions WHERE user_id = ?', rita.id).id;
    const tries = await Promise.all([
      call(`/api/v1/rewards/${coffee.id}`, { jar: intruder.jar }),
      call(`/api/v1/rewards/${coffee.id}`, { method: 'PATCH', jar: intruder.jar, body: { cost: 1 } }),
      call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: intruder.jar, body: { clientKey: key() } }),
      call(`/api/v1/rewards/${coffee.id}/archive`, { method: 'POST', jar: intruder.jar, body: {} }),
      call(`/api/v1/rewards/redemptions/${redemptionId}/fulfilled`, { method: 'POST', jar: intruder.jar, body: { fulfilled: true } }),
    ]);
    check('IDOR: another account cannot read, reprice, redeem, archive or tick rita\'s reward (404)', tries.every((t) => t.res.status === 404), tries.map((t) => t.res.status).join(','));
    check('and neither wallet moved', (await wallet(intruder)) === 100000 && (await wallet(rita)) === 2000);
    const mine = await call('/api/v1/rewards/redemptions', { jar: intruder.jar });
    check('the intruder\'s redemption list is empty', mine.res.status === 200 && mine.json?.redemptions?.length === 0);
  }
  {
    const tick = await call(`/api/v1/rewards/redemptions/${one('SELECT id FROM reward_redemptions WHERE user_id = ?', rita.id).id}/fulfilled`, { method: 'POST', jar: rita.jar, body: { fulfilled: true } });
    check('"Teljesítve" is bookkeeping: marked, no coin moved', tick.res.status === 200 && tick.json?.redemption?.fulfilled === true && (await wallet(rita)) === 2000);
    credit(rita, 30000);
    const rest = await call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'Desszert a cukrászdában', cost: 80, cooldownDays: 7 } });
    const r1 = await call(`/api/v1/rewards/${rest.json.reward.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key() } });
    const r2 = await call(`/api/v1/rewards/${rest.json.reward.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key() } });
    check('a reward with a 7-day pihenő: the second redeem is COOLDOWN with the day it opens ("még 7 nap")', r1.res.status === 201 && r2.res.status === 409
      && r2.json?.code === 'COOLDOWN' && r2.json.daysLeft === 7 && r2.json.availableOn === dates.addDaysToKey(today(), 7), `${r2.res.status} ${JSON.stringify(r2.json)}`);
    const once = await call('/api/v1/rewards', { method: 'POST', jar: rita.jar, body: { clientKey: key(), name: 'Hétvége Tihanyban', cost: 50, repeatable: false } });
    const o1 = await call(`/api/v1/rewards/${once.json.reward.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key() } });
    const o2 = await call(`/api/v1/rewards/${once.json.reward.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key() } });
    check('a one-time reward: redeemed once, then ALREADY_REDEEMED', o1.res.status === 201 && o2.res.status === 409 && o2.json?.code === 'ALREADY_REDEEMED', `${o1.res.status} ${o2.json?.code}`);
    const shop = await call('/api/v1/rewards', { jar: rita.jar });
    check('GET /rewards: sorted by cost, the statuses, the redeemable count', shop.res.status === 200
      && shop.json.items.map((i) => i.costMinor).every((c, i, a) => i === 0 || a[i - 1] <= c)
      && shop.json.items.find((i) => i.id === once.json.reward.id)?.availability?.reason === 'ALREADY_REDEEMED'
      && typeof shop.json.redeemableCount === 'number', JSON.stringify(shop.json?.items?.map((i) => [i.costMinor, i.availability?.reason])));
    const detail = await call(`/api/v1/rewards/${coffee.id}`, { jar: rita.jar });
    check('GET /rewards/:id: the reward and its redemptions (BEVÁLTÁSOK)', detail.res.status === 200 && detail.json?.redemptions?.length === 1 && detail.json.reward?.redeemedCount === 1);
    const archived = await call(`/api/v1/rewards/${coffee.id}/archive`, { method: 'POST', jar: rita.jar, body: {} });
    const gone = await call(`/api/v1/rewards/${coffee.id}/redeem`, { method: 'POST', jar: rita.jar, body: { clientKey: key() } });
    check('an archived reward cannot be redeemed (404), its redemptions stay', archived.res.status === 200 && gone.res.status === 404
      && (await call('/api/v1/rewards/redemptions', { jar: rita.jar })).json?.redemptions?.length === 3);
  }
  {
    // EXTREMES: a balance in debt has nothing spendable (plan L3).
    const debtor = await register('debtor');
    const cheap = await call('/api/v1/rewards', { method: 'POST', jar: debtor.jar, body: { clientKey: key(), name: 'cheap', cost: 1 } });
    const ev = Number(run(
      `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, request_id)
       VALUES (?, 'task.overdue', -3500, 0, ?, 'task', 1, 'smoke')`, debtor.id, today(),
    ).lastInsertRowid);
    run(`INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, request_id)
         VALUES (?, -3500, 'task.overdue', 'coin_event', ?, ?, 'smoke')`, debtor.id, ev, `evt:${String(ev).padStart(10, '0')}`);
    const r = await call(`/api/v1/rewards/${cheap.json.reward.id}/redeem`, { method: 'POST', jar: debtor.jar, body: { clientKey: key() } });
    check('EXTREMES: in debt (−35) a 1-coin reward is INSUFFICIENT and the balance stays −35', r.res.status === 409 && r.json?.code === 'INSUFFICIENT' && (await wallet(debtor)) === -3500, `${r.res.status} ${r.json?.code}`);
  }

  conn.close();
}
