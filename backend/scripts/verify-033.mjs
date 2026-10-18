#!/usr/bin/env node
/**
 * verify-033 — every guard migration 033 adds, refused once with ITS OWN message, next to the
 * accepted twin of each refused write (a guard that refuses everything cannot pass); then the draw
 * (weighted, distinct, idempotent per day, one reroll, the pick), the reward redemption (the three
 * refusals, the balance guard, replay, debt) and the item caps, through the REAL worker modules
 * against a throwaway encrypted database.
 *
 * Run: npm run verify:033
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomInt } from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-verify-033-'));
process.env.DB_PATH = path.join(tmpDir, 'v033.db');

const { getDb } = await import('../src/db/conn.js');
const worker = await import('../src/db/worker.js');
const core = await import('../src/db/tx/lifeos.js');
const tasks = await import('../src/db/tx/lifeos-tasks.js');
const rw = await import('../src/db/tx/lifeos-rewards.js');
const dates = await import('../src/lifeos/dates.js');
const { weightedDraw, drawOptions, DRAW_SIZE } = await import('../src/lifeos/challenges.js');
const { availability, progressBp } = await import('../src/lifeos/rewards.js');
const { DEFAULT_RULES, LIFEOS_LIMITS } = await import('../src/lifeos/rules.js');

const db = getDb();
const MIGRATIONS = path.resolve('src/db/migrations');
worker.migrate({
  files: fs
    .readdirSync(MIGRATIONS)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort()
    .map((n) => ({ version: Number(n.match(/^(\d+)_/)[1]), sql: fs.readFileSync(path.join(MIGRATIONS, n), 'utf8') })),
});

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};
const refused = (label, fn, expect) => {
  try {
    fn();
    check(label, false, 'THE WRITE WAS ACCEPTED');
  } catch (e) {
    const msg = String(e.message);
    check(label, msg.includes(expect), msg.slice(0, 100));
  }
};
const accepted = (label, fn) => {
  try {
    fn();
    check(label, true);
  } catch (e) {
    check(label, false, String(e.message).slice(0, 100));
  }
};
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

const TZ = 'Europe/Budapest';
const mkUser = (label, { zone = true } = {}) => {
  const id = Number(run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'user')`, `${label}@probe.test`).lastInsertRowid);
  if (zone) core.setUserPrefsTx({ userId: id, timezone: TZ, requestId: 'probe' });
  return id;
};
const TODAY = dates.dayKeyFor(Date.now(), TZ, 4);
const YESTERDAY = dates.addDaysToKey(TODAY, -1);
let k = 0;
const ck = () => `probe-${(k += 1).toString().padStart(4, '0')}`;
const balance = (u) => one('SELECT balance_minor b FROM coin_wallets WHERE user_id = ?', u).b;
const credit = (u, minor) =>
  run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key, request_id)
     VALUES (?, ?, 'admin.credit', ?, 'probe')`,
    u, minor, `probe:${u}:${ck()}`,
  );

const insChallenge = (u, o = {}) =>
  Number(
    run(
      `INSERT INTO challenges (user_id, name, category, points, weight, client_key) VALUES (?, ?, ?, ?, ?, ?)`,
      u, o.name ?? 'c', o.category === undefined ? 'mind' : o.category, o.points ?? 15, o.weight ?? 1, o.key ?? ck(),
    ).lastInsertRowid,
  );
const insReward = (u, o = {}) =>
  Number(
    run(
      `INSERT INTO rewards (user_id, name, description, cost_minor, repeatable, cooldown_days, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      u, o.name ?? 'r', o.description ?? null, o.cost ?? 8000, o.repeatable ?? 1, o.cooldown ?? null, o.key ?? ck(),
    ).lastInsertRowid,
  );

console.log('── user_version and the reason ────────────────────────────────────────────────');
check('the schema stands at 33 or later', db.pragma('user_version', { simple: true }) >= 33);
const reason = one(`SELECT * FROM coin_reasons WHERE key = 'reward.redeem'`);
check('reward.redeem is a live SPEND: sign -1, ref reward_redemption, spend 1, xp 0, inside the cap rules',
  reason && reason.sign === -1 && reason.ref_type === 'reward_redemption' && reason.spend === 1 && reason.xp === 0 && reason.cap_exempt === 0 && reason.active === 1,
  JSON.stringify(reason));
check('its ceiling is rewardCostMax', reason?.max_minor === LIFEOS_LIMITS.rewardCostMax * 100, `${reason?.max_minor}`);

const alice = mkUser('alice');
const bob = mkUser('bob');

console.log('\n── challenges ─────────────────────────────────────────────────────────────────');
const cA = insChallenge(alice, { name: 'Hideg zuhany, 2 perc', category: 'discipline', points: 20, weight: 3 });
accepted('a challenge with 50 coins, weight 5 and no category is accepted (the caps themselves)', () => insChallenge(alice, { points: 50, weight: 5, category: null }));
refused('coins above 50 are refused (the task override cap)', () => insChallenge(alice, { points: 51 }), 'CHECK');
refused('negative coins are refused', () => insChallenge(alice, { points: -1 }), 'CHECK');
refused('weight 6 is refused (five segments)', () => insChallenge(alice, { weight: 6 }), 'CHECK');
refused('weight 0 is refused', () => insChallenge(alice, { weight: 0 }), 'CHECK');
refused('an unknown category is refused', () => insChallenge(alice, { category: 'chores' }), 'CHECK');
refused('a name with surrounding spaces is refused', () => insChallenge(alice, { name: ' x ' }), 'CHECK');
refused('an 81-character name is refused', () => insChallenge(alice, { name: 'x'.repeat(81) }), 'CHECK');
refused('a replayed client key is refused by the index', () => insChallenge(alice, { key: 'same-key-0001' }) && insChallenge(alice, { key: 'same-key-0001' }), 'UNIQUE');
refused('a challenge cannot change owner', () => run('UPDATE challenges SET user_id = ? WHERE id = ?', bob, cA), 'keeps its owner');
refused('a deleted (not archived) state is refused', () => run('UPDATE challenges SET deleted_at = 1 WHERE id = ?', cA), 'CHECK');
const cDel = insChallenge(alice);
accepted('a delete that also archives is accepted', () => run('UPDATE challenges SET deleted_at = 1, archived_at = 1 WHERE id = ?', cDel));
refused('and a deleted challenge stays deleted', () => run('UPDATE challenges SET deleted_at = NULL, archived_at = NULL WHERE id = ?', cDel), 'cannot be changed');

console.log('\n── tasks.challenge_id ─────────────────────────────────────────────────────────');
const cB = insChallenge(bob, { name: 'bob only' });
accepted('a task of the challenge\'s owner may point at it', () => run(`INSERT INTO tasks (user_id, title, due_on, client_key, challenge_id) VALUES (?, 'x', ?, ?, ?)`, alice, TODAY, ck(), cA));
refused('a task cannot point at another account\'s challenge', () => run(`INSERT INTO tasks (user_id, title, due_on, client_key, challenge_id) VALUES (?, 'x', ?, ?, ?)`, alice, TODAY, ck(), cB), 'challenge task');
refused('a recurring template cannot be a challenge task', () => run(`INSERT INTO tasks (user_id, title, due_on, recurrence, client_key, challenge_id) VALUES (?, 'x', ?, '{"type":"daily"}', ?, ?)`, alice, TODAY, ck(), cA), 'challenge task');
const plainTask = Number(run(`INSERT INTO tasks (user_id, title, client_key) VALUES (?, 'plain', ?)`, alice, ck()).lastInsertRowid);
refused('a task cannot acquire a challenge later', () => run('UPDATE tasks SET challenge_id = ? WHERE id = ?', cA, plainTask), 'keeps the challenge');
run(`DELETE FROM tasks WHERE user_id = ? AND challenge_id IS NOT NULL`, alice);

console.log('\n── challenge_draws ────────────────────────────────────────────────────────────');
const cA2 = insChallenge(alice, { name: 'Olvass el 20 oldalt' });
const cA3 = insChallenge(alice, { name: '10 perc nyújtás' });
const cArch = insChallenge(alice, { name: 'archived' });
run('UPDATE challenges SET archived_at = 1 WHERE id = ?', cArch);
const insDraw = (u, date, o1, o2 = null, o3 = null) =>
  Number(run(`INSERT INTO challenge_draws (user_id, local_date, option1_id, option2_id, option3_id) VALUES (?, ?, ?, ?, ?)`, u, date, o1, o2, o3).lastInsertRowid);
refused('a draw cannot offer another account\'s challenge', () => insDraw(alice, YESTERDAY, cA, cB), 'live challenges');
refused('a draw cannot offer an archived challenge', () => insDraw(alice, YESTERDAY, cA, cArch), 'live challenges');
refused('a draw cannot offer one challenge twice', () => insDraw(alice, YESTERDAY, cA, cA), 'live challenges');
refused('a third option needs a second', () => insDraw(alice, YESTERDAY, cA, null, cA2), 'CHECK');
const dY = insDraw(alice, YESTERDAY, cA, cA2, cA3);
check('a draw of three live own challenges is accepted', dY > 0);
refused('a second draw of the same day is refused (the idempotency index)', () => insDraw(alice, YESTERDAY, cA2), 'UNIQUE');
refused('the options cannot change without the reroll', () => run('UPDATE challenge_draws SET option1_id = ? WHERE id = ?', cA2, dY), 'rerolled once');
refused('a reroll without its key is refused', () => run('UPDATE challenge_draws SET rerolls_used = 1 WHERE id = ?', dY), 'CHECK');
accepted('the one reroll (0 -> 1 with its key) is accepted', () => run(`UPDATE challenge_draws SET option1_id = ?, option2_id = ?, option3_id = ?, rerolls_used = 1, reroll_key = 'reroll-0001' WHERE id = ?`, cA3, cA, cA2, dY));
refused('a second reroll is refused', () => run('UPDATE challenge_draws SET option1_id = ?, option2_id = ?, option3_id = ? WHERE id = ?', cA, cA2, cA3, dY), 'rerolled once');
refused('the reroll cannot be given back', () => run(`UPDATE challenge_draws SET rerolls_used = 0, reroll_key = NULL WHERE id = ?`, dY), 'rerolled once');
const tOther = Number(run(`INSERT INTO tasks (user_id, title, due_on, client_key, challenge_id) VALUES (?, 'x', ?, ?, ?)`, alice, YESTERDAY, ck(), cA2).lastInsertRowid);
const tArch = Number(run(`INSERT INTO tasks (user_id, title, due_on, client_key, challenge_id) VALUES (?, 'x', ?, ?, ?)`, alice, YESTERDAY, ck(), cArch).lastInsertRowid);
refused('a pick that is not one of the options is refused', () => run('UPDATE challenge_draws SET picked_challenge_id = ?, picked_task_id = ?, picked_at = 1 WHERE id = ?', cArch, tArch, dY), 'CHECK');
refused('a pick whose task is another challenge\'s is refused', () => run('UPDATE challenge_draws SET picked_challenge_id = ?, picked_task_id = ?, picked_at = 1 WHERE id = ?', cA, tOther, dY), 'challenge\'s task');
accepted('a pick of an option with its own task of that day is accepted', () => run('UPDATE challenge_draws SET picked_challenge_id = ?, picked_task_id = ?, picked_at = 1 WHERE id = ?', cA2, tOther, dY));
refused('a draw is picked once', () => run('UPDATE challenge_draws SET picked_at = 2 WHERE id = ?', dY), 'picked once');
run('DELETE FROM challenge_draws WHERE user_id = ?', alice);
run('DELETE FROM tasks WHERE id IN (?, ?)', tOther, tArch);

console.log('\n── rewards ────────────────────────────────────────────────────────────────────');
const rA = insReward(alice, { name: 'Kávé a kedvenc helyen', cost: 8000, cooldown: 3 });
accepted('a reward at rewardCostMax is accepted', () => insReward(alice, { cost: LIFEOS_LIMITS.rewardCostMax * 100 }));
refused('a cost above rewardCostMax is refused', () => insReward(alice, { cost: LIFEOS_LIMITS.rewardCostMax * 100 + 100 }), 'CHECK');
refused('a free reward is refused', () => insReward(alice, { cost: 0 }), 'CHECK');
refused('a cost that is not whole coins is refused', () => insReward(alice, { cost: 8050 }), 'CHECK');
refused('a one-time reward with a cooldown is refused', () => insReward(alice, { repeatable: 0, cooldown: 3 }), 'CHECK');
refused('a cooldown of 366 days is refused', () => insReward(alice, { cooldown: 366 }), 'CHECK');
refused('a 281-character description is refused', () => insReward(alice, { description: 'x'.repeat(281) }), 'CHECK');
refused('a reward cannot change owner', () => run('UPDATE rewards SET user_id = ? WHERE id = ?', bob, rA), 'keeps its owner');

console.log('\n── reward_redemptions and the ledger ──────────────────────────────────────────');
const insRedemption = (u, r, o = {}) =>
  Number(
    run(
      `INSERT INTO reward_redemptions (user_id, reward_id, name_snapshot, cost_minor_snapshot, local_date, client_key, request_id)
       VALUES (?, ?, ?, ?, ?, ?, 'probe')`,
      u, r, o.name ?? 'Kávé a kedvenc helyen', o.cost ?? 8000, o.date ?? TODAY, o.key ?? ck(),
    ).lastInsertRowid,
  );
refused('a receipt with a cost other than the reward\'s is refused', () => insRedemption(alice, rA, { cost: 100 }), 'receipt');
refused('a receipt with another name is refused', () => insRedemption(alice, rA, { name: 'free stuff' }), 'receipt');
refused('a receipt for another account\'s reward is refused', () => insRedemption(bob, rA), 'receipt');
const rOnce = insReward(alice, { name: 'Hétvége Tihanyban', cost: 50000, repeatable: 0 });
const rcpt = insRedemption(alice, rOnce, { name: 'Hétvége Tihanyban', cost: 50000 });
refused('a one-time reward cannot be redeemed twice', () => insRedemption(alice, rOnce, { name: 'Hétvége Tihanyban', cost: 50000 }), 'only once');
accepted('the fulfilled mark may change', () => run('UPDATE reward_redemptions SET fulfilled_at = 1 WHERE id = ?', rcpt));
refused('nothing else on a receipt may change', () => run('UPDATE reward_redemptions SET cost_minor_snapshot = 100 WHERE id = ?', rcpt), 'receipt');
const rGone = insReward(alice, { name: 'gone', cost: 100 });
run('UPDATE rewards SET archived_at = 1 WHERE id = ?', rGone);
refused('an archived reward cannot be redeemed', () => insRedemption(alice, rGone, { name: 'gone', cost: 100 }), 'receipt');
const debit = (u, ref, amount, key = ck()) =>
  run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, request_id)
     VALUES (?, ?, 'reward.redeem', 'reward_redemption', ?, ?, 'probe')`,
    u, amount, ref, `reward:${u}:${key}`,
  );
credit(alice, 100000);
refused('a reward debit of the wrong amount is refused (ref-truthful)', () => debit(alice, rcpt, -100), 'does not match');
refused('a reward debit on another account is refused (ref-truthful)', () => { credit(bob, 100000); debit(bob, rcpt, -50000); }, 'does not match');
accepted('the exact debit of the receipt is accepted', () => debit(alice, rcpt, -50000));
refused('a second debit for one receipt is refused (one ledger row per thing)', () => debit(alice, rcpt, -50000), 'UNIQUE');
check('the store-purchase and coin-event clauses survive the recreated trigger',
  /store\.purchase/.test(one(`SELECT sql FROM sqlite_master WHERE name = 'trg_coin_ledger_ref_truthful'`).sql)
  && /coin_event/.test(one(`SELECT sql FROM sqlite_master WHERE name = 'trg_coin_ledger_ref_truthful'`).sql));
{
  // A spend is covered or refused: bring carl into exactly 79 coins and try an 80-coin receipt + debit.
  const carl = mkUser('carl');
  credit(carl, 7900);
  const rC = insReward(carl, { name: 'cake', cost: 8000 });
  const rcC = insRedemption(carl, rC, { name: 'cake' });
  refused('a reward debit the balance does not cover is refused (spend-covered)', () => debit(carl, rcC, -8000), 'enough coins');
}

console.log('\n── the draw (pure) ────────────────────────────────────────────────────────────');
{
  const seq = (values) => { let i = 0; return () => values[i++]; };
  const pool = [{ id: 1, weight: 1 }, { id: 2, weight: 3 }, { id: 3, weight: 1 }];
  check('r = 0 picks the first (weight 1 covers [0,1))', weightedDraw(pool, 1, seq([0]))[0] === 1);
  check('r = 1..3 picks the weight-3 challenge', [1, 2, 3].every((r) => weightedDraw(pool, 1, seq([r]))[0] === 2));
  check('r = 4 picks the last', weightedDraw(pool, 1, seq([4]))[0] === 3);
  check('three draws are distinct (without replacement)', new Set(weightedDraw(pool, 3, seq([4, 0, 0]))).size === 3);
  check('a pool of two offers two', weightedDraw(pool.slice(0, 2), DRAW_SIZE, randomInt).length === 2);
  check('an empty pool offers nothing', weightedDraw([], DRAW_SIZE, randomInt).length === 0);
  let threw = false;
  try { weightedDraw(pool, 1, () => 5); } catch { threw = true; }
  check('a random source out of range throws (never a silent bias)', threw);
  check('the accepted ones are excluded', !drawOptions({ pool, acceptedToday: [2] }, randomInt).includes(2));
  check('a reroll excludes the previous hand while enough remain',
    drawOptions({ pool: [...pool, { id: 4, weight: 1 }, { id: 5, weight: 1 }, { id: 6, weight: 1 }], exclude: [1, 2, 3] }, randomInt).every((id) => id > 3));
  check('and falls back to the whole unaccepted pool when not', drawOptions({ pool, exclude: [1, 2] }, randomInt).length === 3);
  // Weight is honoured: weight 4 against weight 1 over 20000 CSPRNG draws lands near 80 %.
  let heavy = 0;
  for (let i = 0; i < 20000; i += 1) if (weightedDraw([{ id: 1, weight: 1 }, { id: 2, weight: 4 }], 1, randomInt)[0] === 2) heavy += 1;
  check('weight 4 vs 1 is drawn ~80 % of the time (crypto.randomInt, 20000 draws)', heavy > 15400 && heavy < 16600, `${heavy}`);
}

console.log('\n── the draw (worker) ──────────────────────────────────────────────────────────');
{
  const dora = mkUser('dora');
  const noZone = mkUser('nozone', { zone: false });
  check('no zone: the draw is TIMEZONE_REQUIRED', rw.drawChallengeTx({ userId: noZone }).outcome === 'timezone_required');
  check('an empty pool draws nothing (no row)', rw.drawChallengeTx({ userId: dora }).outcome === 'empty_pool' && !one('SELECT 1 FROM challenge_draws WHERE user_id = ?', dora));
  check('the today state of an empty pool is empty_pool', rw.challengeTodayQuery({ userId: dora }).draw.state === 'empty_pool');
  const ids = [1, 2, 3, 4, 5].map((i) => rw.createChallengeTx({ userId: dora, input: { name: `c${i}`, points: 10 + i, weight: i }, clientKey: ck() }).challenge.id);
  check('with a pool the today state is due', rw.challengeTodayQuery({ userId: dora }).draw.state === 'due');
  const d1 = rw.drawChallengeTx({ userId: dora });
  check('the first draw offers three distinct own challenges', d1.outcome === 'drawn' && d1.draw.options.length === 3 && new Set(d1.draw.options.map((o) => o.id)).size === 3 && d1.draw.options.every((o) => ids.includes(o.id)));
  const d2 = rw.drawChallengeTx({ userId: dora });
  check('a second draw answers the first (idempotent per day)', d2.outcome === 'already' && JSON.stringify(d2.draw.options.map((o) => o.id)) === JSON.stringify(d1.draw.options.map((o) => o.id)));
  check('one row for the day', one('SELECT COUNT(*) n FROM challenge_draws WHERE user_id = ?', dora).n === 1);
  const before = d1.draw.options.map((o) => o.id);
  const rr = rw.rerollChallengeTx({ userId: dora, rerollKey: 'reroll-dora-1' });
  // Five in the pool, three shown: excluding them leaves two, so the reroll falls back to the whole
  // unaccepted pool (f_app drawChallenges) - a full hand of three, not a guaranteed-new one. The
  // exclusion itself is proven deterministically on drawOptions above.
  check('the reroll offers a full new hand of three distinct own challenges (fallback: 2 left after excluding the shown 3)', rr.outcome === 'rerolled' && rr.draw.options.length === 3 && new Set(rr.draw.options.map((o) => o.id)).size === 3 && rr.draw.options.every((o) => ids.includes(o.id)) && rr.draw.rerollsLeft === 0, JSON.stringify({ before, after: rr.draw?.options?.map((o) => o.id) }));
  const rrAgain = rw.rerollChallengeTx({ userId: dora, rerollKey: 'reroll-dora-1' });
  check('the same reroll key is a replay of the same hand', rrAgain.outcome === 'replayed' && JSON.stringify(rrAgain.draw.options) === JSON.stringify(rr.draw.options));
  check('a second reroll is REROLL_USED', rw.rerollChallengeTx({ userId: dora, rerollKey: 'reroll-dora-2' }).outcome === 'reroll_used');
  const notOffered = ids.find((id) => !rr.draw.options.some((o) => o.id === id));
  check('a challenge not on the table cannot be picked (NOT_OFFERED)', rw.pickChallengeTx({ userId: dora, challengeId: notOffered, clientKey: ck() }).outcome === 'not_offered');
  const bobsChallenge = insChallenge(bob, { name: 'bob pick' });
  check('IDOR: another account\'s challenge id is NOT_OFFERED', rw.pickChallengeTx({ userId: dora, challengeId: bobsChallenge, clientKey: ck() }).outcome === 'not_offered');
  const chosen = rr.draw.options[1];
  const pickKey = ck();
  const p1 = rw.pickChallengeTx({ userId: dora, challengeId: chosen.id, clientKey: pickKey });
  check('the pick makes a task: the challenge\'s name and coins, priority 2, due today with no time',
    p1.outcome === 'picked' && p1.task.title === chosen.name && p1.task.points === chosen.points && p1.task.priority === 2 && p1.task.dueOn === TODAY && p1.task.dueTime === null,
    JSON.stringify(p1.task));
  check('the task points back at its challenge', one('SELECT challenge_id c FROM tasks WHERE id = ?', p1.task.id).c === chosen.id);
  check('the draw state is picked, the chosen option marked', p1.draw.state === 'picked' && p1.draw.options.find((o) => o.chosen)?.id === chosen.id && p1.draw.picked.taskId === p1.task.id);
  const p2 = rw.pickChallengeTx({ userId: dora, challengeId: chosen.id, clientKey: pickKey });
  check('REPLAY: the same key answers the same task', p2.outcome === 'replayed' && p2.task.id === p1.task.id);
  check('CONFLICT: the same key for another option is refused', rw.pickChallengeTx({ userId: dora, challengeId: rr.draw.options[0].id, clientKey: pickKey }).outcome === 'conflict');
  check('a second pick with a fresh key is ALREADY_PICKED', rw.pickChallengeTx({ userId: dora, challengeId: rr.draw.options[0].id, clientKey: ck() }).outcome === 'already_picked');
  check('a picked draw cannot be rerolled', rw.rerollChallengeTx({ userId: dora, rerollKey: 'reroll-dora-3' }).outcome === 'picked');
  check('one challenge task exists', one('SELECT COUNT(*) n FROM tasks WHERE user_id = ? AND challenge_id IS NOT NULL', dora).n === 1);
  const done = tasks.completeTaskTx({ userId: dora, taskId: p1.task.id, requestId: 'probe' });
  check('completing it pays the challenge\'s coins (through the task path)', done.outcome === 'completed' && done.event.amountMinor === chosen.points * 100 && balance(dora) === chosen.points * 100, JSON.stringify(done.event));
  check('and the draw says teljesítve', rw.challengeTodayQuery({ userId: dora }).draw.picked.done === true);
}
{
  const ed = mkUser('ed');
  const only = rw.createChallengeTx({ userId: ed, input: { name: 'solo' }, clientKey: ck() });
  check('a challenge with no coins given takes the admin rule challengePoints', only.challenge.points === DEFAULT_RULES.challengePoints);
  const d = rw.drawChallengeTx({ userId: ed });
  check('a pool of one offers one', d.outcome === 'drawn' && d.draw.options.length === 1);
  run('UPDATE challenges SET archived_at = 1 WHERE id = ?', only.challenge.id);
  check('an option archived after the draw can no longer be picked', rw.pickChallengeTx({ userId: ed, challengeId: only.challenge.id, clientKey: ck() }).outcome === 'not_offered');
  check('no draw yet: the pick is NO_DRAW', rw.pickChallengeTx({ userId: mkUser('fresh'), challengeId: only.challenge.id, clientKey: ck() }).outcome === 'no_draw');
}

console.log('\n── the redemption (pure) ──────────────────────────────────────────────────────');
{
  const coffee = { costMinor: 8000, repeatable: true, cooldownDays: 3 };
  check('a repeatable reward with enough coins is redeemable', availability(coffee, { count: 0, lastOn: null }, 8000, '2026-10-18').ok);
  check('the cooldown counts logical days (10.14 + 3 -> redeemable from 10.17)',
    availability(coffee, { count: 4, lastOn: '2026-10-14' }, 9000, '2026-10-17').ok
    && availability(coffee, { count: 4, lastOn: '2026-10-14' }, 9000, '2026-10-16').reason === 'COOLDOWN');
  const rest = availability({ ...coffee, cooldownDays: 7 }, { count: 3, lastOn: '2026-10-18' }, 9000, '2026-10-18');
  check('"pihen · még 7 nap" the day it was redeemed', rest.reason === 'COOLDOWN' && rest.daysLeft === 7 && rest.availableOn === '2026-10-25', JSON.stringify(rest));
  check('a one-time reward redeemed once is ALREADY_REDEEMED whatever the balance',
    availability({ costMinor: 50000, repeatable: false, cooldownDays: null }, { count: 1, lastOn: '2026-10-01' }, 0, '2026-10-18').reason === 'ALREADY_REDEEMED');
  const short = availability(coffee, { count: 0, lastOn: null }, 7900, '2026-10-18');
  check('short by one coin is INSUFFICIENT with the missing amount', short.reason === 'INSUFFICIENT' && short.missingMinor === 100);
  check('the bar is basis points of the cost covered, never above full', progressBp(8000, 4000) === 5000 && progressBp(8000, 99999) === 10000 && progressBp(8000, -500) === 0);
}

console.log('\n── the redemption (worker) ────────────────────────────────────────────────────');
{
  const fay = mkUser('fay');
  const noZone = mkUser('nozone2', { zone: false });
  check('no zone: a reward create is TIMEZONE_REQUIRED', rw.createRewardTx({ userId: noZone, input: { name: 'x', cost: 1 }, clientKey: ck() }).outcome === 'timezone_required');
  const coffeeKey = ck();
  const coffee = rw.createRewardTx({ userId: fay, input: { name: 'Kávé', cost: 80, cooldownDays: 3 }, clientKey: coffeeKey });
  check('a reward is created with its cost in minor units', coffee.outcome === 'created' && coffee.reward.costMinor === 8000 && coffee.reward.cooldownDays === 3);
  check('a replayed create answers the same reward', rw.createRewardTx({ userId: fay, input: { name: 'Kávé', cost: 80 }, clientKey: coffeeKey }).reward.id === coffee.reward.id);
  const oneTime = rw.createRewardTx({ userId: fay, input: { name: 'Tihany', cost: 100, repeatable: false, cooldownDays: 0 }, clientKey: ck() });
  check('"0 = nincs korlát" stores no cooldown', oneTime.reward.cooldownDays === null && oneTime.reward.repeatable === false);
  const k1 = ck();
  const poor = rw.redeemRewardTx({ userId: fay, rewardId: coffee.reward.id, clientKey: k1, requestId: 'probe' });
  check('with 0 coins the redeem is INSUFFICIENT and writes nothing', poor.outcome === 'refused' && poor.availability.reason === 'INSUFFICIENT'
    && !one('SELECT 1 FROM reward_redemptions WHERE user_id = ?', fay));
  credit(fay, 20000);
  const xpBefore = core.walletQuery({ userId: fay }).xp;
  const ok = rw.redeemRewardTx({ userId: fay, rewardId: coffee.reward.id, clientKey: k1, requestId: 'probe' });
  check('with 200 coins the redeem lands: a receipt, one debit, 120 left', ok.outcome === 'redeemed' && ok.redemption.costMinor === 8000 && balance(fay) === 12000
    && one(`SELECT COUNT(*) n FROM coin_ledger WHERE user_id = ? AND reason_key = 'reward.redeem'`, fay).n === 1, JSON.stringify(ok));
  check('the receipt is on today\'s logical day', ok.redemption.localDate === TODAY);
  check('XP and level do not move ("A beváltás nem csökkenti az XP-t")', core.walletQuery({ userId: fay }).xp === xpBefore);
  const again = rw.redeemRewardTx({ userId: fay, rewardId: coffee.reward.id, clientKey: k1, requestId: 'probe' });
  check('REPLAY: the same key answers the same receipt and debits nothing', again.outcome === 'replayed' && again.redemption.id === ok.redemption.id && balance(fay) === 12000);
  check('CONFLICT: the same key on another reward', rw.redeemRewardTx({ userId: fay, rewardId: oneTime.reward.id, clientKey: k1, requestId: 'probe' }).outcome === 'conflict');
  const cool = rw.redeemRewardTx({ userId: fay, rewardId: coffee.reward.id, clientKey: ck(), requestId: 'probe' });
  check('a fresh key inside the cooldown is COOLDOWN with the day it opens', cool.outcome === 'refused' && cool.availability.reason === 'COOLDOWN' && cool.availability.availableOn === dates.addDaysToKey(TODAY, 3));
  const t1 = rw.redeemRewardTx({ userId: fay, rewardId: oneTime.reward.id, clientKey: ck(), requestId: 'probe' });
  check('the one-time reward is redeemed once', t1.outcome === 'redeemed' && balance(fay) === 2000);
  const t2 = rw.redeemRewardTx({ userId: fay, rewardId: oneTime.reward.id, clientKey: ck(), requestId: 'probe' });
  check('then ALREADY_REDEEMED (before the balance is even looked at)', t2.outcome === 'refused' && t2.availability.reason === 'ALREADY_REDEEMED');
  check('IDOR: another account redeeming fay\'s reward is a 404 and moves nothing', rw.redeemRewardTx({ userId: bob, rewardId: coffee.reward.id, clientKey: ck(), requestId: 'probe' }).outcome === 'missing' && balance(fay) === 2000);
  check('IDOR: another account reading it is a 404', rw.rewardQuery({ userId: bob, rewardId: coffee.reward.id }) === null);
  const shop = rw.rewardsQuery({ userId: fay });
  check('the shop: spendable 20, sorted by cost, the statuses', shop.spendableMinor === 2000 && shop.items[0].id === coffee.reward.id
    && shop.items[0].availability.reason === 'COOLDOWN' && shop.items[1].availability.reason === 'ALREADY_REDEEMED' && shop.redeemableCount === 0, JSON.stringify(shop.items.map((i) => i.availability)));
  const detail = rw.rewardQuery({ userId: fay, rewardId: coffee.reward.id });
  check('the detail lists its redemptions', detail.redemptions.length === 1 && detail.redemptions[0].id === ok.redemption.id && detail.reward.redeemedCount === 1);
  const f1 = rw.setRedemptionFulfilledTx({ userId: fay, redemptionId: ok.redemption.id, fulfilled: true });
  check('"Teljesítve" marks it and moves no coin', f1.outcome === 'applied' && f1.redemption.fulfilled && balance(fay) === 2000);
  check('IDOR: another account cannot tick it', rw.setRedemptionFulfilledTx({ userId: bob, redemptionId: ok.redemption.id, fulfilled: false }).outcome === 'missing');
  check('and it can be unticked by its owner', rw.setRedemptionFulfilledTx({ userId: fay, redemptionId: ok.redemption.id, fulfilled: false }).redemption.fulfilled === false);
  rw.setRewardArchivedTx({ userId: fay, rewardId: coffee.reward.id, archived: true });
  check('an archived reward cannot be redeemed (404)', rw.redeemRewardTx({ userId: fay, rewardId: coffee.reward.id, clientKey: ck(), requestId: 'probe' }).outcome === 'missing');
  check('and its redemptions stay', rw.redemptionsQuery({ userId: fay }).redemptions.length === 2);
}
{
  // DEBT: a penalty may take the balance below zero (plan L3); a spend may not use it.
  const gus = mkUser('gus');
  const cheap = rw.createRewardTx({ userId: gus, input: { name: 'cheap', cost: 1 }, clientKey: ck() });
  const ev = Number(run(
    `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, request_id)
     VALUES (?, 'task.overdue', -3500, 0, ?, 'task', 1, 'probe')`, gus, TODAY,
  ).lastInsertRowid);
  run(`INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, request_id)
       VALUES (?, -3500, 'task.overdue', 'coin_event', ?, ?, 'probe')`, gus, ev, `evt:${String(ev).padStart(10, '0')}`);
  check('the account is in debt (-35)', balance(gus) === -3500);
  const r = rw.redeemRewardTx({ userId: gus, rewardId: cheap.reward.id, clientKey: ck(), requestId: 'probe' });
  check('in debt nothing is spendable: a 1-coin reward is INSUFFICIENT', r.outcome === 'refused' && r.availability.reason === 'INSUFFICIENT' && balance(gus) === -3500);
}

console.log('\n── the caps ───────────────────────────────────────────────────────────────────');
{
  const hal = mkUser('hal');
  const insC = db.prepare(`INSERT INTO challenges (user_id, name, points, weight, client_key) VALUES (?, 'bulk', 10, 1, ?)`);
  db.transaction(() => { for (let i = 0; i < LIFEOS_LIMITS.challengePool; i += 1) insC.run(hal, `bulk-c-${i.toString().padStart(6, '0')}`); })();
  check(`the ${LIFEOS_LIMITS.challengePool + 1}st live challenge is refused (LIMIT_REACHED)`, rw.createChallengeTx({ userId: hal, input: { name: 'one more' }, clientKey: ck() }).outcome === 'cap');
  const first = one('SELECT id FROM challenges WHERE user_id = ? LIMIT 1', hal).id;
  rw.setChallengeArchivedTx({ userId: hal, challengeId: first, archived: true });
  check('archiving one frees a place', rw.createChallengeTx({ userId: hal, input: { name: 'one more' }, clientKey: ck() }).outcome === 'created');
  check('and restoring over the cap is refused', rw.setChallengeArchivedTx({ userId: hal, challengeId: first, archived: false }).outcome === 'cap');
  const insR = db.prepare(`INSERT INTO rewards (user_id, name, cost_minor, client_key) VALUES (?, 'bulk', 100, ?)`);
  db.transaction(() => { for (let i = 0; i < LIFEOS_LIMITS.rewards; i += 1) insR.run(hal, `bulk-r-${i.toString().padStart(6, '0')}`); })();
  check(`the ${LIFEOS_LIMITS.rewards + 1}st live reward is refused (LIMIT_REACHED)`, rw.createRewardTx({ userId: hal, input: { name: 'one more', cost: 1 }, clientKey: ck() }).outcome === 'cap');
  const total = db.prepare(`INSERT INTO challenges (user_id, name, points, weight, client_key, archived_at, deleted_at) VALUES (?, 'gone', 10, 1, ?, 1, 1)`);
  const ivy = mkUser('ivy');
  db.transaction(() => { for (let i = 0; i < LIFEOS_LIMITS.challengesTotal; i += 1) total.run(ivy, `gone-${i.toString().padStart(6, '0')}`); })();
  check(`a create / delete loop stops at ${LIFEOS_LIMITS.challengesTotal} challenges ever kept`, rw.createChallengeTx({ userId: ivy, input: { name: 'again' }, clientKey: ck() }).outcome === 'cap');
}

db.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* the OS reclaims it */
}
console.log(`\n${failed ? 'PROBE FAILED' : 'PROBE OK'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
