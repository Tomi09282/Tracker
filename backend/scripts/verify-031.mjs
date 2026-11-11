#!/usr/bin/env node
/**
 * verify-031 — every guard migration 031 adds, refused once; and the LifeOS named transactions,
 * run through the REAL worker module against a throwaway encrypted database.
 *
 * Two halves:
 *   1. THE SCHEMA. Each trigger / CHECK / index of 031 is handed the one write it exists to refuse,
 *      and must refuse it with ITS OWN message (a refusal for a different reason is not evidence —
 *      verify-022's lesson). The accepted twin of each refused write is run too, so a guard that
 *      refuses everything cannot pass either.
 *   2. THE TRANSACTIONS. src/db/tx/lifeos.js is imported in-process with DB_PATH pointing at the
 *      temp database — the module the pool runs, not a copy of its SQL (019's lesson: an audit must
 *      not carry its own copy of what it audits). The clock is the real one, so days are placed
 *      relative to "today" with src/lifeos/dates.js.
 *
 * Run: npm run verify:031
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-verify-031-'));
process.env.DB_PATH = path.join(tmpDir, 'v031.db');

const { getDb } = await import('../src/db/conn.js');
const tx = await import('../src/db/tx/lifeos.js');
const worker = await import('../src/db/worker.js');
const dates = await import('../src/lifeos/dates.js');
const { DEFAULT_RULES } = await import('../src/lifeos/rules.js');

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
    check(label, msg.includes(expect), msg.slice(0, 90));
  }
};
const accepted = (label, fn) => {
  try {
    fn();
    check(label, true);
  } catch (e) {
    check(label, false, String(e.message).slice(0, 90));
  }
};
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const balanceOf = (u) => one('SELECT balance_minor AS b FROM coin_wallets WHERE user_id = ?', u).b;

const mkUser = (label, role = 'user') =>
  Number(run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', ?)`, `${label}@probe.test`, role).lastInsertRowid);

const alice = mkUser('alice');
const bob = mkUser('bob');
const admin = mkUser('admin', 'admin');

const now = Date.now();
const todayUtc = dates.dayKeyFor(now, 'UTC', 0);

console.log('── user_prefs ─────────────────────────────────────────────────────────────────');
check('a new account gets its prefs row (trg_user_opens_prefs)', !!one('SELECT 1 FROM user_prefs WHERE user_id = ?', alice));
check('the day starts at 04:00 by default', one('SELECT day_start_hour h FROM user_prefs WHERE user_id = ?', alice).h === 4);
refused('a day start the frame does not offer is refused', () => run('UPDATE user_prefs SET day_start_hour = 3 WHERE user_id = ?', alice), 'CHECK');
refused('a timezone without the IANA shape is refused', () => run("UPDATE user_prefs SET timezone = 'Nowhere' WHERE user_id = ?", alice), 'CHECK');
accepted('an IANA zone is accepted', () => run("UPDATE user_prefs SET timezone = 'Europe/Budapest', timezone_set_at = unixepoch() WHERE user_id = ?", bob));
refused(
  'the zone cannot change twice inside 24 h (trg_user_prefs_timezone_daily)',
  () => run("UPDATE user_prefs SET timezone = 'Europe/Vienna' WHERE user_id = ?", bob),
  'once a day',
);
accepted('the first LifeOS day is written once', () => run("UPDATE user_prefs SET lifeos_started_on = '2026-10-01' WHERE user_id = ?", bob));
refused(
  'and cannot be moved (trg_user_prefs_started_once)',
  () => run("UPDATE user_prefs SET lifeos_started_on = '2026-09-01' WHERE user_id = ?", bob),
  'cannot be moved',
);

console.log('\n── point_rule_sets ────────────────────────────────────────────────────────────');
const v1 = one('SELECT id, rules_json FROM point_rule_sets ORDER BY id LIMIT 1');
check('version 1 is seeded', v1?.id === 1);
check('version 1 equals DEFAULT_RULES in src/lifeos/rules.js', JSON.stringify(Object.entries(JSON.parse(v1.rules_json)).sort()) === JSON.stringify(Object.entries(DEFAULT_RULES).sort()));
refused('a rule set cannot be rewritten', () => run("UPDATE point_rule_sets SET note = 'x' WHERE id = 1"), 'cannot be rewritten');
refused('a rule set cannot be deleted', () => run('DELETE FROM point_rule_sets WHERE id = 1'), 'cannot be deleted');
refused('a rule set without an integer dailyEarnCap is refused', () => run(`INSERT INTO point_rule_sets (rules_json) VALUES ('{"dailyEarnCap": 1.5}')`), 'CHECK');

console.log('\n── coin_reasons ───────────────────────────────────────────────────────────────');
const reason = (k) => one('SELECT sign, xp, spend, ref_type FROM coin_reasons WHERE key = ?', k);
check('store.purchase and admin.debit are spends', reason('store.purchase').spend === 1 && reason('admin.debit').spend === 1);
check('workout.completed earns XP and points at a coin_event', reason('workout.completed').xp === 1 && reason('workout.completed').ref_type === 'coin_event');
check('a penalty earns no XP and is not a spend', reason('day.kcal_over').xp === 0 && reason('day.kcal_over').spend === 0 && reason('day.kcal_over').sign === -1);

console.log('\n── coin_events ────────────────────────────────────────────────────────────────');
const D = todayUtc;
const ev = (o) =>
  Number(
    run(
      `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, seq, reverses_event_id, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'probe')`,
      o.user ?? alice, o.reason, o.amount, o.xp ?? 0, o.date ?? D, o.type ?? 'workout_log', o.id ?? 1, o.seq ?? 0, o.reverses ?? null,
    ).lastInsertRowid,
  );
refused('an award with the wrong sign is refused (trg_coin_event_shape)', () => ev({ reason: 'workout.completed', amount: -100, xp: -100 }), 'contradicts the reason');
refused('a non-LifeOS reason is refused', () => ev({ reason: 'admin.credit', amount: 100 }), 'contradicts the reason');
refused('an XP earn that records no XP is refused', () => ev({ reason: 'workout.completed', amount: 100, xp: 0 }), 'contradicts the reason');
refused('a penalty that claims XP is refused', () => ev({ reason: 'day.kcal_over', amount: -100, xp: -100 }), 'contradicts the reason');
refused('a reversal reason on an original is refused', () => ev({ reason: 'reversal.debit', amount: -100 }), 'contradicts the reason');
let e1;
accepted('a well-formed award is accepted', () => { e1 = ev({ reason: 'workout.completed', amount: 3000, xp: 3000, id: 11 }); });
refused('a second live award for the same thing is refused (natural key)', () => ev({ reason: 'workout.completed', amount: 3000, xp: 3000, id: 11 }), 'UNIQUE');
refused('seq 1 while seq 0 is still live is refused (trg_coin_event_seq)', () => ev({ reason: 'workout.completed', amount: 3000, xp: 3000, id: 11, seq: 1 }), 'already been paid');
refused('a reversal with a different amount is refused (trg_coin_event_reversal_truthful)', () => ev({ reason: 'reversal.debit', amount: -100, xp: -3000, id: 11, reverses: e1 }), 'exactly one movement');
refused("a reversal of another account's event is refused", () => ev({ user: bob, reason: 'reversal.debit', amount: -3000, xp: -3000, id: 11, reverses: e1 }), 'exactly one movement');
refused('a reversal that does not take the XP back is refused', () => ev({ reason: 'reversal.debit', amount: -3000, xp: 0, id: 11, reverses: e1 }), 'contradicts the reason');
let r1;
accepted('the exact reversal is accepted', () => { r1 = ev({ reason: 'reversal.debit', amount: -3000, xp: -3000, id: 11, reverses: e1 }); });
refused('a second reversal of the same event is refused (UNIQUE reverses_event_id)', () => ev({ reason: 'reversal.debit', amount: -3000, xp: -3000, id: 11, reverses: e1 }), 'UNIQUE');
refused('a reversal of a reversal is refused', () => ev({ reason: 'reversal.credit', amount: 3000, id: 11, reverses: r1 }), 'exactly one movement');
accepted('after the reversal the thing may pay again as seq 1', () => ev({ reason: 'workout.completed', amount: 3000, xp: 3000, id: 11, seq: 1 }));
refused('a coin event cannot be rewritten', () => run('UPDATE coin_events SET note = ? WHERE id = ?', 'x', e1), 'cannot be rewritten');

console.log('\n── the daily cap (trg_coin_event_daily_cap) ───────────────────────────────────');
const capDay = '2026-01-15';
accepted('earning up to the cap is accepted', () => ev({ reason: 'day.perfect', amount: DEFAULT_RULES.dailyEarnCap * 100, xp: DEFAULT_RULES.dailyEarnCap * 100, type: 'day', id: 1, date: capDay }));
refused('one minor unit over the cap is refused', () => ev({ reason: 'day.kcal_hit', amount: 1, xp: 1, type: 'day', id: 2, date: capDay }), 'daily coin cap');
accepted('a penalty on a capped day is still accepted', () => ev({ reason: 'day.kcal_over', amount: -1000, type: 'day', id: 3, date: capDay }));

console.log('\n── the ledger (spend-covered, ref-truthful) ───────────────────────────────────');
const ledger = (o) =>
  run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, actor_user_id, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'probe')`,
    o.user, o.amount, o.reason, o.refType ?? null, o.refId ?? null, o.key, o.actor ?? null,
  );
const pen = ev({ user: bob, reason: 'day.kcal_over', amount: -1000, type: 'day', id: 9, date: '2026-01-10' });
refused('a ledger row that disagrees with its event is refused', () => ledger({ user: bob, amount: -999, reason: 'day.kcal_over', refType: 'coin_event', refId: pen, key: 'evt:probe-1' }), 'does not match');
refused("a ledger row pointing at another account's event is refused", () => ledger({ user: alice, amount: -1000, reason: 'day.kcal_over', refType: 'coin_event', refId: pen, key: 'evt:probe-2' }), 'does not match');
accepted('a PENALTY may take the balance below zero (no longer never-negative)', () => ledger({ user: bob, amount: -1000, reason: 'day.kcal_over', refType: 'coin_event', refId: pen, key: 'evt:probe-3' }));
check('and the balance is now negative', balanceOf(bob) === -1000, String(balanceOf(bob)));
refused('a SPEND that is not covered is refused (trg_coin_ledger_spend_covered)', () => ledger({ user: bob, amount: -1, reason: 'admin.debit', key: 'adj:probe-1', actor: admin }), 'enough coins');
check('trg_coin_ledger_never_negative is gone', !one("SELECT 1 FROM sqlite_master WHERE name = 'trg_coin_ledger_never_negative'"));
accepted('a credit to an account in debt is accepted', () => ledger({ user: bob, amount: 500, reason: 'admin.credit', key: 'adj:probe-2', actor: admin }));

console.log('\n── daily_summaries ────────────────────────────────────────────────────────────');
accepted('a closed day is accepted', () => run(`INSERT INTO daily_summaries (user_id, local_date, status, workout_due, workout_done, kcal_outcome) VALUES (?, '2026-01-01', 'closed', 0, 0, 'no_data')`, alice));
refused('the same day cannot settle twice (PRIMARY KEY)', () => run(`INSERT INTO daily_summaries (user_id, local_date, status, workout_due, workout_done, kcal_outcome) VALUES (?, '2026-01-01', 'closed', 0, 0, 'no_data')`, alice), 'UNIQUE');
refused('a settled day cannot be rewritten', () => run(`UPDATE daily_summaries SET perfect_day = 1 WHERE user_id = ?`, alice), 'cannot be rewritten');
refused('a lapsed day cannot be a perfect day', () => run(`INSERT INTO daily_summaries (user_id, local_date, status, perfect_day) VALUES (?, '2026-01-02', 'lapsed', 1)`, alice), 'CHECK');
refused('a closed day must record its outcome', () => run(`INSERT INTO daily_summaries (user_id, local_date, status) VALUES (?, '2026-01-03', 'closed')`, alice), 'CHECK');

console.log('\n── erasure still works with all of it ─────────────────────────────────────────');
let erased = true;
try {
  run('DELETE FROM users WHERE id = ?', bob);
} catch (e) {
  erased = String(e.message);
}
check('an account with events, a reversal-free penalty, a negative balance and prefs deletes cleanly', erased === true, erased === true ? '' : erased);
check('and nothing of it is left', !one('SELECT 1 FROM coin_events WHERE user_id = ?', bob) && !one('SELECT 1 FROM user_prefs WHERE user_id = ?', bob));

console.log('\n── the named transactions (src/db/tx/lifeos.js, in-process) ───────────────────');
const carol = mkUser('carol');
let p = tx.setUserPrefsTx({ userId: carol, timezone: 'Europe/Budapest', requestId: 'probe' });
check('setUserPrefsTx sets the zone and starts LifeOS today', p.outcome === 'applied' && p.prefs.timezone === 'Europe/Budapest' && p.prefs.startedOn === dates.dayKeyFor(Date.now(), 'Europe/Budapest', 4), JSON.stringify(p).slice(0, 90));
check('the change is audited', !!one(`SELECT 1 FROM audit_log WHERE action = 'lifeos.prefs.timezone' AND target_id = ?`, carol));
p = tx.setUserPrefsTx({ userId: carol, timezone: 'Europe/Budapest', requestId: 'probe' });
check('the same zone again is a no-op that spends nothing', p.outcome === 'applied' && one(`SELECT COUNT(*) n FROM audit_log WHERE action = 'lifeos.prefs.timezone' AND target_id = ?`, carol).n === 1);
p = tx.setUserPrefsTx({ userId: carol, timezone: 'America/New_York', requestId: 'probe' });
check('a different zone inside 24 h is too_soon, and nothing is written', p.outcome === 'too_soon' && one('SELECT timezone t FROM user_prefs WHERE user_id = ?', carol).t === 'Europe/Budapest');
p = tx.setUserPrefsTx({ userId: carol, dayStartHour: 6, requestId: 'probe' });
check('the day start changes freely', p.outcome === 'applied' && p.prefs.dayStartHour === 6);

// A user whose LifeOS started 4 days ago in UTC with a 00:00 day start: the due days are knowable.
const dave = mkUser('dave');
const started = dates.addDaysToKey(todayUtc, -4);
run("UPDATE user_prefs SET timezone = 'UTC', timezone_set_at = unixepoch(), day_start_hour = 0, lifeos_started_on = ? WHERE user_id = ?", started, dave);
const settledThrough = dates.settledThroughFor(Date.now(), 'UTC', 0);

let c = tx.closeLifeDayTx({ userId: dave, localDate: dates.addDaysToKey(started, 1), requestId: 'probe' });
check('a day cannot close before the day before it (gap)', c.outcome === 'gap', c.outcome);
c = tx.closeLifeDayTx({ userId: dave, localDate: todayUtc, requestId: 'probe' });
check('today cannot close (not_due)', c.outcome === 'not_due', c.outcome);
c = tx.closeLifeDayTx({ userId: dave, localDate: dates.addDaysToKey(started, -1), requestId: 'probe' });
check('a day before the LifeOS start cannot close', c.outcome === 'not_due', c.outcome);

// Day 1: a nutrition target and an over-eaten day -> day.kcal_over (a penalty) and no perfect day.
const food = Number(run(`INSERT INTO foods (name, normalized_name, kcal_per_100g_x10, protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, source, owner_user_id) VALUES ('probe', 'probe', 1000, 0, 0, 0, 'manual', ?)`, dave).lastInsertRowid);
const np = Number(run(`INSERT INTO nutrition_plans (name, normalized_name, scope, client_user_id, author_user_id, status, starts_on, cycle_days) VALUES ('p', 'p', 'personal', ?, ?, 'active', ?, 1)`, dave, dave, started).lastInsertRowid);
run('INSERT INTO nutrition_plan_days (plan_id, day_index, kcal_target_x10) VALUES (?, 0, 20000)', np);
const logFood = (date, grams) =>
  run(
    `INSERT INTO nutrition_log_items (client_user_id, local_date, food_id, grams_x10, food_name_snapshot, kcal_per_100g_x10_snapshot, protein_mg_per_100g_snapshot, carb_mg_per_100g_snapshot, fat_mg_per_100g_snapshot)
     VALUES (?, ?, ?, ?, 'probe', 1000, 0, 0, 0)`,
    dave, date, food, grams * 10,
  );
logFood(started, 3000); // 3000 g x 100 kcal / 100 g = 3000 kcal vs a 2000 target
c = tx.closeLifeDayTx({ userId: dave, localDate: started, requestId: 'probe' });
check('day 1 closes with the kcal outcome over', c.outcome === 'closed' && c.kcalOutcome === 'over' && !c.perfectDay, JSON.stringify(c).slice(0, 90));
check('and costs kcalGoalMissed coins — below zero', balanceOf(dave) === -DEFAULT_RULES.kcalGoalMissed * 100, String(balanceOf(dave)));
c = tx.closeLifeDayTx({ userId: dave, localDate: started, requestId: 'probe' });
check('closing it again is a replay that pays nothing (already)', c.outcome === 'already' && balanceOf(dave) === -DEFAULT_RULES.kcalGoalMissed * 100);

// Day 2: kcal hit -> day.kcal_hit. No workout scheduled -> no perfect day (the economy sheet).
const day2 = dates.addDaysToKey(started, 1);
logFood(day2, 2050);
c = tx.closeLifeDayTx({ userId: dave, localDate: day2, requestId: 'probe' });
check('day 2 closes with the kcal goal hit, and no workout scheduled is no perfect day', c.outcome === 'closed' && c.kcalOutcome === 'hit' && !c.perfectDay, JSON.stringify(c).slice(0, 90));
check('the hit pays kcalGoalHit coins and XP', balanceOf(dave) === (DEFAULT_RULES.kcalGoalHit - DEFAULT_RULES.kcalGoalMissed) * 100
  && one('SELECT SUM(xp_minor) x FROM coin_events WHERE user_id = ?', dave).x === DEFAULT_RULES.kcalGoalHit * 100);
check('every event has exactly one ledger row', one(`SELECT COUNT(*) n FROM coin_events e WHERE e.user_id = ? AND NOT EXISTS (SELECT 1 FROM coin_ledger l WHERE l.ref_type = 'coin_event' AND l.ref_id = e.id)`, dave).n === 0);

// Day 3 (when due): a scheduled workout that was done + kcal hit -> perfect day.
const day3 = dates.addDaysToKey(started, 2);
const wp = Number(run(`INSERT INTO workout_plans (name, normalized_name, scope, client_user_id, author_user_id, status, starts_on, cycle_days) VALUES ('w', 'w', 'personal', ?, ?, 'active', ?, 1)`, dave, dave, day3).lastInsertRowid);
run(`INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, 0, 'Push')`, wp);
logFood(day3, 2000);
if (day3 <= settledThrough) {
  const wl = Number(run(`INSERT INTO workout_logs (client_user_id, local_date, status, started_at, completed_at, title) VALUES (?, ?, 'completed', unixepoch() - 3600, unixepoch(), 'Push')`, dave, day3).lastInsertRowid);
  // B-lifeos-polish (security review LifeOS 07): a completed log with no working set done is not a
  // done workout — an empty freestyle session must not stand in for the scheduled one.
  const { workoutDoneOn } = await import('../src/db/lifeos-calendar.js');
  check("an EMPTY completed log does not count as the day's workout (security review 07)", workoutDoneOn(dave, day3, DEFAULT_RULES.workoutHalfPct) === 0);
  const lex3 = Number(run(`INSERT INTO workout_log_exercises (log_id, client_user_id, exercise_name_snapshot, position) VALUES (?, ?, 'probe', 0)`, wl, dave).lastInsertRowid);
  run(`INSERT INTO workout_log_sets (log_exercise_id, log_id, client_user_id, local_date, set_index, completed_at, reps) VALUES (?, ?, ?, ?, 1, unixepoch(), 8)`, lex3, wl, dave, day3);
  check('the same log with its working set done counts', workoutDoneOn(dave, day3, DEFAULT_RULES.workoutHalfPct) === 1);
  check('a completed workout on a settled day pays nothing (awardWorkoutTx: settled)', tx.awardWorkoutTx({ userId: dave, logId: wl, requestId: 'probe' }).outcome === 'settled');
  c = tx.closeLifeDayTx({ userId: dave, localDate: day3, requestId: 'probe' });
  check('day 3: the scheduled workout was done and the kcal goal hit -> perfect day', c.outcome === 'closed' && c.workoutDue && c.workoutDone && c.perfectDay, JSON.stringify(c).slice(0, 90));
} else {
  check('day 3 is not yet due at this hour (skipped: before 06:00 UTC)', true);
}

// The workout award on an OPEN day: today.
const wlToday = Number(run(`INSERT INTO workout_logs (client_user_id, local_date, status, started_at) VALUES (?, ?, 'in_progress', unixepoch())`, dave, todayUtc).lastInsertRowid);
const lex = Number(run(`INSERT INTO workout_log_exercises (log_id, client_user_id, exercise_name_snapshot, position) VALUES (?, ?, 'probe', 0)`, wlToday, dave).lastInsertRowid);
for (let i = 0; i < 10; i += 1) {
  run(`INSERT INTO workout_log_sets (log_exercise_id, log_id, client_user_id, local_date, set_index, completed_at, reps) VALUES (?, ?, ?, ?, ?, CASE WHEN ? < 7 THEN unixepoch() END, 8)`, lex, wlToday, dave, todayUtc, i + 1, i);
}
check('an unfinished workout pays nothing (missing)', tx.awardWorkoutTx({ userId: dave, logId: wlToday, requestId: 'probe' }).outcome === 'missing');
run(`UPDATE workout_logs SET status = 'completed', completed_at = MAX(unixepoch(), started_at) WHERE id = ?`, wlToday);
check("another user's workout id pays nothing (IDOR: missing)", tx.awardWorkoutTx({ userId: carol, logId: wlToday, requestId: 'probe' }).outcome !== 'awarded');
const before = balanceOf(dave);
let a = tx.awardWorkoutTx({ userId: dave, logId: wlToday, requestId: 'probe' });
check('7 of 10 sets (70 %) pays HALF of workoutComplete', a.outcome === 'awarded' && a.event.amountMinor === Math.floor(DEFAULT_RULES.workoutComplete / 2) * 100 && balanceOf(dave) - before === a.event.amountMinor, JSON.stringify(a).slice(0, 90));
a = tx.awardWorkoutTx({ userId: dave, logId: wlToday, requestId: 'probe' });
check('a replay pays nothing (already)', a.outcome === 'already' && balanceOf(dave) - before === Math.floor(DEFAULT_RULES.workoutComplete / 2) * 100);

// Lapse: a user away for 20 days gets 7 closed days and the rest lapsed, oldest first.
const erin = mkUser('erin');
const erinStart = dates.addDaysToKey(todayUtc, -20);
run("UPDATE user_prefs SET timezone = 'UTC', timezone_set_at = unixepoch(), day_start_hour = 0, lifeos_started_on = ? WHERE user_id = ?", erinStart, erin);
const st = tx.lifeosSettleStateQuery({ userId: erin });
check('the catch-up closes at most 7 days', st.due.close.length === 7 && st.due.lapse.length + 7 === dates.daysBetween(erinStart, st.settledThrough) + 1, `${st.due.close.length} / ${st.due.lapse.length}`);
c = tx.closeLifeDayTx({ userId: erin, localDate: st.due.close[0], requestId: 'probe' });
check('a close inside the window waits for the lapse first (gap)', c.outcome === 'gap', c.outcome);
const lp = tx.markLapsedDaysTx({ userId: erin });
check('markLapsedDaysTx lapses exactly the older days', lp.lapsed.length === st.due.lapse.length && one(`SELECT COUNT(*) n FROM daily_summaries WHERE user_id = ? AND status = 'lapsed'`, erin).n === st.due.lapse.length);
let allClosed = true;
for (const d of st.due.close) allClosed = allClosed && tx.closeLifeDayTx({ userId: erin, localDate: d, requestId: 'probe' }).outcome === 'closed';
check('then the 7 days close in order', allClosed);
check('a second lapse is a no-op', tx.markLapsedDaysTx({ userId: erin }).lapsed.length === 0);

// The admin rules.
const adminSv = one('SELECT session_version sv FROM users WHERE id = ?', admin).sv;
let rs = tx.setPointRulesTx({ actorId: carol, actorSessionVersion: one('SELECT session_version sv FROM users WHERE id = ?', carol).sv, rules: { ...DEFAULT_RULES, perfectDay: 30 }, expectedVersion: 1, requestId: 'probe' });
check('a non-admin cannot publish rules (forbidden, DB re-check)', rs.outcome === 'forbidden');
rs = tx.setPointRulesTx({ actorId: admin, actorSessionVersion: adminSv + 1, rules: { ...DEFAULT_RULES, perfectDay: 30 }, expectedVersion: 1, requestId: 'probe' });
check('a stale session cannot publish rules (forbidden)', rs.outcome === 'forbidden');
rs = tx.setPointRulesTx({ actorId: admin, actorSessionVersion: adminSv, rules: { ...DEFAULT_RULES, workoutHalfPct: 90 }, expectedVersion: 1, requestId: 'probe' });
check('a rule set the engine cannot read is refused (half > full)', rs.outcome === 'invalid');
rs = tx.setPointRulesTx({ actorId: admin, actorSessionVersion: adminSv, rules: { ...DEFAULT_RULES, perfectDay: 30 }, note: 'probe', expectedVersion: 1, requestId: 'probe' });
check('an admin publishes version 2', rs.outcome === 'applied' && rs.view.version === 2 && rs.view.rules.perfectDay === 30);
check('audited with the diff', JSON.parse(one(`SELECT detail FROM audit_log WHERE action = 'lifeos.rules.set' AND target_id = 2`).detail).changed.perfectDay[1] === 30);
rs = tx.setPointRulesTx({ actorId: admin, actorSessionVersion: adminSv, rules: { ...DEFAULT_RULES, perfectDay: 35 }, expectedVersion: 1, requestId: 'probe' });
check('an edit made against version 1 is stale now', rs.outcome === 'stale' && rs.currentVersion === 2);

// hasSeat: an admin acting as a trainer is seat-exempt (the economy sheet). Behaviour, through the
// real transaction: the free tier holds 3 clients; a coach is refused the 4th, an admin is not.
const coachU = mkUser('coach-seat', 'coach');
const pregen = (coachId, n) => worker.pregenerateClientTx({ coachId, email: `seat-${coachId}-${n}@probe.test`, passwordHash: 'x', requestId: 'probe' }).outcome;
const coachOutcomes = [1, 2, 3, 4].map((n) => pregen(coachU, n));
check('a coach on the free tier is refused the 4th client', coachOutcomes.slice(0, 3).every((o) => o === 'created') && coachOutcomes[3] === 'seat_limit', coachOutcomes.join(','));
const adminOutcomes = [1, 2, 3, 4].map((n) => pregen(admin, n));
check('an admin acting as a trainer is seat-exempt (hasSeat reads the role from the database)', adminOutcomes.every((o) => o === 'created'), adminOutcomes.join(','));

db.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* the OS reclaims it */
}
console.log(`\n${failed ? 'PROBE FAILED' : 'PROBE OK'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
