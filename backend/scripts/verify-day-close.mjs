#!/usr/bin/env node
/**
 * verify-day-close — the FULL LifeOS day close (migration 032), scenario by scenario, through the
 * REAL named transactions against a throwaway encrypted database.
 *
 * The worker transactions read "now" from Date.now() (never from a request), so this script owns
 * the clock: Date.now is replaced by a settable instant and every scenario places itself on the
 * calendar it needs — f_app's own test world (Wed 2026-09-09, Europe/Budapest), the two DST Sundays
 * of 2026, and a user who comes back after twelve days. src/db/tx/*.js are imported in-process with
 * DB_PATH pointing at the temp database: the modules the pool runs, not a copy of their SQL.
 *
 * The f_app scenarios are tests/domain/dayClose.test.ts, streakFreeze.test.ts, tasks.test.ts and
 * recurringTasks.test.ts, translated to the one deliberate difference (plan L5): a habit pays when
 * its day settles, not when it is ticked — so where f_app reads the balance right after a tap, this
 * reads it after the day closes, and the figures are f_app's.
 *
 * Run: npm run verify:day-close
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-verify-day-close-'));
process.env.DB_PATH = path.join(tmpDir, 'vdc.db');

// THE CLOCK. Set before anything reads it.
let NOW = Date.parse('2026-09-08T10:00:00Z');
Date.now = () => NOW;
const at = (iso) => {
  NOW = Date.parse(iso);
};
const advanceDays = (n) => {
  NOW += n * 86400000;
};

const { getDb } = await import('../src/db/conn.js');
const worker = await import('../src/db/worker.js');
const core = await import('../src/db/tx/lifeos.js');
const habits = await import('../src/db/tx/lifeos-habits.js');
const tasks = await import('../src/db/tx/lifeos-tasks.js');
const dates = await import('../src/lifeos/dates.js');
const { DEFAULT_RULES, RULE_KEYS } = await import('../src/lifeos/rules.js');

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
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

const TZ = 'Europe/Budapest';
let seq = 0;
const key = () => `key-${(seq += 1).toString().padStart(6, '0')}`;

/** A fresh account whose LifeOS starts on the logical day of NOW. */
function account(label) {
  const id = Number(run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'user')`, `${label}-${seq += 1}@probe.test`).lastInsertRowid);
  const p = core.setUserPrefsTx({ userId: id, timezone: TZ, requestId: 'probe' });
  if (p.outcome !== 'applied') throw new Error(`prefs: ${p.outcome}`);
  return id;
}
const habit = (userId, input) => {
  const r = habits.createHabitTx({ userId, input, clientKey: key() });
  if (r.outcome !== 'created') throw new Error(`createHabit: ${r.outcome}`);
  return r.habit.id;
};
const task = (userId, input) => {
  const r = tasks.createTaskTx({ userId, input, clientKey: key() });
  if (r.outcome !== 'created') throw new Error(`createTask: ${r.outcome}`);
  return r.task.id;
};
const tap = (userId, habitId, date, count = 1) => habits.setHabitCountTx({ userId, habitId, localDate: date, count });
/** "Simulate a streak already settled by day close" (f_app's UPDATE habits SET current_streak = n). */
function seedState(userId, habitId, beforeDate, { current, best = current, freezes = 0 }) {
  run(
    `INSERT INTO habit_day_results (habit_id, user_id, local_date, outcome, count, target_count, multiplier_bp,
       streak_after, best_after, freezes_after) VALUES (?, ?, ?, 'done', 1, 1, 10000, ?, ?, ?)`,
    habitId, userId, dates.addDaysToKey(beforeDate, -1), current, best, freezes,
  );
}
const state = (userId, habitId) =>
  one(
    `SELECT streak_after AS current, best_after AS best, freezes_after AS freezes, outcome, local_date AS date
       FROM habit_day_results WHERE habit_id = ? AND user_id = ? ORDER BY local_date DESC LIMIT 1`,
    habitId, userId,
  );
const balance = (u) => one('SELECT balance_minor AS b FROM coin_wallets WHERE user_id = ?', u).b / 100;
const earned = (u, d) => one('SELECT COALESCE(SUM(amount_minor), 0) AS n FROM coin_events WHERE user_id = ? AND local_date = ? AND amount_minor > 0', u, d).n / 100;
const lost = (u, d) => -one('SELECT COALESCE(SUM(amount_minor), 0) AS n FROM coin_events WHERE user_id = ? AND local_date = ? AND amount_minor < 0', u, d).n / 100;
const eventsOf = (u, reason) => all('SELECT amount_minor AS a, local_date AS d, note FROM coin_events WHERE user_id = ? AND reason_key = ? ORDER BY id', u, reason);
const close = (u, d) => core.closeLifeDayTx({ userId: u, localDate: d, requestId: 'probe' });

/** settle.js ensureSettled, synchronously: lapse, close the due days in order, materialize. */
function settleNow(userId) {
  const st = core.lifeosSettleStateQuery({ userId });
  if (!st.started) return [];
  if (st.due.lapse.length) core.markLapsedDaysTx({ userId });
  const closed = [];
  for (const d of st.due.close) {
    const r = close(userId, d);
    if (r.outcome === 'closed') closed.push(d);
    else if (r.outcome !== 'already') break;
  }
  tasks.materializeRecurringTasksTx({ userId });
  return closed;
}

const D8 = '2026-09-08';
const D9 = '2026-09-09';

console.log('── closeDay: never today, idempotent (f_app dayClose.test) ─────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('idem');
  habit(u, { kind: 'good', name: 'x' });
  check('the day being lived does not settle', close(u, D8).outcome === 'not_due');
  at('2026-09-09T07:59:00Z'); // 09:59 CEST: the 8th settles at 10:00 (04:00 start + 6 h)
  check('nor before start(D+1) + 6 h', close(u, D8).outcome === 'not_due');
  at('2026-09-09T08:00:00Z');
  const s = close(u, D8);
  check('at start(D+1) + 6 h it settles', s.outcome === 'closed' && s.localDate === D8, s.outcome);
  check('and a second close answers already', close(u, D8).outcome === 'already');
  check('the summary row exists once', one('SELECT COUNT(*) n FROM daily_summaries WHERE user_id = ? AND local_date = ?', u, D8).n === 1);
}

console.log('\n── missed / done / clean, streaks ─────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('mix');
  const missed = habit(u, { kind: 'good', name: 'missed' });
  const done = habit(u, { kind: 'good', name: 'done' });
  const smoke = habit(u, { kind: 'bad', name: 'smoke' });
  check('a tap answers the log as done', tap(u, done, D8).log.status === 'done');
  advanceDays(1);
  const s = close(u, D8);
  check('3 scheduled, 2 done, not perfect', s.habitsScheduled === 3 && s.habitsDone === 2 && s.perfectDay === false, JSON.stringify({ a: s.habitsScheduled, b: s.habitsDone, p: s.perfectDay }));
  check('earned 25 (10 done + 15 clean day)', earned(u, D8) === 25, `${earned(u, D8)}`);
  check('lost 5 (the missed habit)', lost(u, D8) === 5, `${lost(u, D8)}`);
  check('missed: streak 0 / best 0', state(u, missed).current === 0 && state(u, missed).best === 0);
  check('done: streak 1 / best 1', state(u, done).current === 1 && state(u, done).best === 1);
  check('clean bad habit: streak 1', state(u, smoke).current === 1 && state(u, smoke).outcome === 'clean');
  check('the summary row holds the habit counts', one('SELECT habits_scheduled a, habits_done b FROM daily_summaries WHERE user_id = ? AND local_date = ?', u, D8).a === 3);
}

console.log('\n── relapse ────────────────────────────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('relapse');
  const smoke = habit(u, { kind: 'bad', name: 'smoke' });
  seedState(u, smoke, D8, { current: 12, best: 12 });
  check('relapse count 1 is recorded', habits.recordRelapseTx({ userId: u, habitId: smoke, localDate: D8, count: 1 }).log.status === 'relapse');
  advanceDays(1);
  close(u, D8);
  check('relapse resets the streak and keeps the best', state(u, smoke).current === 0 && state(u, smoke).best === 12);
  check('one relapse costs 10 (5 x factor 2)', eventsOf(u, 'habit.relapse')[0]?.a === -1000);
}
{
  at('2026-09-08T10:00:00Z');
  const u = account('relapse-cap');
  const h = habit(u, { kind: 'bad', name: 'smoke' });
  habits.recordRelapseTx({ userId: u, habitId: h, localDate: D8, count: 4 });
  advanceDays(1);
  close(u, D8);
  check('four relapses are capped at 30 (badHabitRelapseDailyCap)', eventsOf(u, 'habit.relapse')[0]?.a === -3000);
}

console.log('\n── skipped ────────────────────────────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('skip');
  const h = habit(u, { kind: 'good', name: 'h' });
  seedState(u, h, D8, { current: 3 });
  habits.skipHabitTx({ userId: u, habitId: h, localDate: D8 });
  advanceDays(1);
  const s = close(u, D8);
  check('a skipped habit is excluded from the perfect day', s.habitsScheduled === 0 && s.habitsDone === 0 && s.perfectDay === false);
  check('and costs nothing', lost(u, D8) === 0);
  check('and keeps the streak', state(u, h).current === 3 && state(u, h).outcome === 'skipped');
}

console.log('\n── milestones (outside the daily cap, owner 2026-10-18) ───────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('milestone');
  const h = habit(u, { kind: 'good', name: 'h' });
  seedState(u, h, D8, { current: 6 });
  tap(u, h, D8);
  advanceDays(1);
  close(u, D8);
  check('the streak reaches 7', state(u, h).current === 7);
  const bonus = eventsOf(u, 'streak.milestone');
  check('the 7-day bonus of 25 is paid once', bonus.length === 1 && bonus[0].a === 2500, JSON.stringify(bonus));
  check('the result row names the milestone', one('SELECT milestone_days m FROM habit_day_results WHERE habit_id = ? AND local_date = ?', h, D8).m === 7);
}
{
  // A rule set whose daily cap is 10 coins: the habit fills the cap, the milestone still lands.
  const capped = { ...DEFAULT_RULES, dailyEarnCap: 10 };
  run('INSERT INTO point_rule_sets (rules_json, note) VALUES (?, ?)', JSON.stringify(Object.fromEntries(RULE_KEYS.map((k) => [k, capped[k]]))), 'probe: cap 10');
  at('2026-09-08T10:00:00Z');
  const u = account('milestone-cap');
  const h = habit(u, { kind: 'good', name: 'h' });
  seedState(u, h, D8, { current: 99 });
  const t = task(u, { title: 'a task after the cap', priority: 3 });
  tap(u, h, D8);
  advanceDays(1);
  close(u, D8);
  check('the habit is paid up to the cap of 10', eventsOf(u, 'habit.done')[0]?.a === 1000, JSON.stringify(eventsOf(u, 'habit.done')));
  check('the 100-day milestone (500) is paid in full above the cap', eventsOf(u, 'streak.milestone')[0]?.a === 50000);
  // The milestone does not use up room either: a task on D9 still meets the cap of 10, not 0.
  const c = tasks.completeTaskTx({ userId: u, taskId: t, requestId: 'probe' });
  check('a task completed the next day pays (cap room is per day)', c.outcome === 'completed' && c.event?.amountMinor === 1000, JSON.stringify(c.event));
  const t2 = task(u, { title: 'second' });
  const c2 = tasks.completeTaskTx({ userId: u, taskId: t2, requestId: 'probe' });
  check('a second task the same day is trimmed to nothing (cap reached)', c2.outcome === 'completed' && c2.event === null);
  const back = { ...DEFAULT_RULES };
  run('INSERT INTO point_rule_sets (rules_json, note) VALUES (?, ?)', JSON.stringify(Object.fromEntries(RULE_KEYS.map((k) => [k, back[k]]))), 'probe: defaults again');
}

console.log('\n── overdue tasks: once ────────────────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('overdue');
  const t = task(u, { title: 't', dueOn: D8, dueTime: '14:00' });
  advanceDays(1);
  close(u, D8);
  check('an open task due on the day costs 5 at its close', balance(u) === -5, `${balance(u)}`);
  check('and is marked overdue on that day', one('SELECT overdue_on o FROM tasks WHERE id = ?', t).o === D8);
  advanceDays(1);
  close(u, D9);
  check('the next close does not charge it again', balance(u) === -5);
  check('a negative balance is debt, not a refusal (plan L3)', one('SELECT balance_minor b FROM coin_wallets WHERE user_id = ?', u).b === -500);
}

console.log('\n── the perfect day ────────────────────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('perfect');
  const h = habit(u, { kind: 'good', name: 'h' });
  const t = task(u, { title: 't', dueOn: D8, dueTime: '14:00' });
  tap(u, h, D8);
  const c = tasks.completeTaskTx({ userId: u, taskId: t, requestId: 'probe' });
  check('a task completed on time pays its priority (10)', c.event?.amountMinor === 1000 && c.late === false);
  advanceDays(1);
  const s = close(u, D8);
  check('every habit and task done = perfect day', s.perfectDay === true && s.tasksDue === 1 && s.tasksDone === 1, JSON.stringify({ p: s.perfectDay, d: s.tasksDue, x: s.tasksDone }));
  check('earned 10 + 10 + 25', earned(u, D8) === 45, `${earned(u, D8)}`);
}
{
  at('2026-09-08T10:00:00Z');
  const u = account('not-perfect');
  const h = habit(u, { kind: 'good', name: 'h' });
  task(u, { title: 'left open', dueOn: D8 });
  tap(u, h, D8);
  advanceDays(1);
  const s = close(u, D8);
  check('an open task due that day spoils the perfect day', s.perfectDay === false && s.tasksDue === 1 && s.tasksDone === 0);
}

console.log('\n── times-per-week: the Sunday quota ───────────────────────────────────────────');
{
  at('2026-09-07T10:00:00Z'); // Monday
  const u = account('weekly');
  const h = habit(u, { kind: 'good', name: 'gym', scheduleType: 'times_per_week', timesPerWeek: 3 });
  tap(u, h, '2026-09-07');
  at('2026-09-14T10:00:00Z'); // next Monday
  const closed = settleNow(u);
  check('the whole week settles on the next Monday', closed.length === 7 && closed[0] === '2026-09-07' && closed[6] === '2026-09-13', closed.join(','));
  // f_app's world never settled that Monday (its install day was the 8th); here it settles, and a
  // day whose one counted habit was done is a perfect day (+25). The quota arithmetic is f_app's.
  check('+10 for the session and +25 for the Monday perfect day, -5 once for the quota (net +30)', balance(u) === 30, `${balance(u)}`);
  check('one habit.missed, on Sunday', eventsOf(u, 'habit.missed').length === 1 && eventsOf(u, 'habit.missed')[0].d === '2026-09-13');
  check('the streak is 0 after the missed quota', state(u, h).current === 0);
  check('Sunday row says the quota was not met', one('SELECT quota_met q, week_streak_after w FROM habit_day_results WHERE habit_id = ? AND local_date = ?', h, '2026-09-13').q === 0);
  check('weekdays without a session were open, not missed', one(`SELECT COUNT(*) n FROM habit_day_results WHERE habit_id = ? AND outcome = 'open'`, h).n === 5);
}
{
  at('2026-09-07T10:00:00Z');
  const u = account('weekly-met');
  const h = habit(u, { kind: 'good', name: 'gym', scheduleType: 'times_per_week', timesPerWeek: 2 });
  tap(u, h, '2026-09-07');
  at('2026-09-10T10:00:00Z');
  tap(u, h, '2026-09-10');
  at('2026-09-14T10:00:00Z');
  settleNow(u);
  const sun = one('SELECT quota_met q, week_streak_after w FROM habit_day_results WHERE habit_id = ? AND local_date = ?', h, '2026-09-13');
  check('a met quota counts one week ("1 HÉT") and charges nothing', sun.q === 1 && sun.w === 1 && eventsOf(u, 'habit.missed').length === 0, JSON.stringify(sun));
}

console.log('\n── closePendingDays: from the start, up to the settled day ─────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('pending');
  check('nothing is due on the first day', settleNow(u).length === 0);
  habit(u, { kind: 'good', name: 'h' });
  advanceDays(3); // the 11th, 12:00 CEST: the 10th settled at 10:00
  check('three days close, oldest first', settleNow(u).join(',') === `${D8},${D9},2026-09-10`);
  check('and nothing on a second pass', settleNow(u).length === 0);
  advanceDays(1);
  check('one more the next day', settleNow(u).join(',') === '2026-09-11');
}

console.log('\n── streak freezes (f_app streakFreeze.test) ───────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('freeze-earn');
  const h = habit(u, { kind: 'good', name: 'h' });
  seedState(u, h, D8, { current: 29 });
  tap(u, h, D8);
  advanceDays(1);
  close(u, D8);
  const s = state(u, h);
  check('the 30th day earns a freeze', s.current === 30 && s.freezes === 1, JSON.stringify(s));
}
{
  at('2026-09-08T10:00:00Z');
  const u = account('freeze-spend');
  const h = habit(u, { kind: 'good', name: 'h' });
  seedState(u, h, D8, { current: 31, freezes: 1 });
  advanceDays(1);
  const s = close(u, D8);
  check('a miss spends the freeze: streak kept, no penalty', state(u, h).current === 31 && state(u, h).freezes === 0 && balance(u) === 0);
  check('the excused day is excluded from the perfect day', s.habitsScheduled === 0);
  check('and is recorded as frozen', state(u, h).outcome === 'frozen');
  advanceDays(1);
  close(u, D9);
  check('the next miss without a freeze resets and costs 5', state(u, h).current === 0 && balance(u) === -5);
}
{
  at('2026-09-08T10:00:00Z');
  const u = account('freeze-zero');
  const h = habit(u, { kind: 'good', name: 'h' });
  seedState(u, h, D8, { current: 0, freezes: 1 });
  advanceDays(1);
  close(u, D8);
  check('a freeze is never spent on a zero streak', state(u, h).current === 0 && state(u, h).freezes === 1 && balance(u) === -5);
}

console.log('\n── counted habits: partial >= 50 % ────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('partial');
  const water = habit(u, { kind: 'good', name: 'Víz', targetCount: 8, unit: 'pohár' });
  const low = habit(u, { kind: 'good', name: 'low', targetCount: 8 });
  tap(u, water, D8, 4);
  tap(u, low, D8, 3);
  check('a count above the target is clamped', tap(u, low, D8, 20).log.count === 8 && tap(u, low, D8, 3).log.count === 3);
  advanceDays(1);
  close(u, D8);
  const paid = eventsOf(u, 'habit.done').map((e) => e.a);
  check('4 of 8 pays half (5), 3 of 8 pays nothing', paid.length === 1 && paid[0] === 500, JSON.stringify(paid));
  check('both partial days still count as missed (-5 each, f_app)', eventsOf(u, 'habit.missed').length === 2);
}

console.log('\n── the multiplier (the streak BEFORE the day) ─────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('mult');
  const a = habit(u, { kind: 'good', name: 'a' });
  const b = habit(u, { kind: 'good', name: 'b' });
  seedState(u, a, D8, { current: 7 });
  seedState(u, b, D8, { current: 30 });
  tap(u, a, D8);
  tap(u, b, D8);
  advanceDays(1);
  close(u, D8);
  const paid = eventsOf(u, 'habit.done').map((e) => e.a).sort((x, y) => x - y);
  check('x1.25 at 7 days pays 13, x1.5 at 30 days pays 15', paid.join(',') === '1300,1500', paid.join(','));
}

console.log('\n── the edit window (plan L4) ──────────────────────────────────────────────────');
{
  at('2026-09-08T10:00:00Z');
  const u = account('window');
  const h = habit(u, { kind: 'good', name: 'h' });
  check('the future is refused', tap(u, h, D9).outcome === 'future');
  at('2026-09-09T07:00:00Z'); // 09:00 CEST on the 9th: the 8th is still open
  check('yesterday is editable until it settles', tap(u, h, D8).outcome === 'applied');
  at('2026-09-09T08:30:00Z');
  check('after its settle time it is locked (even before the close ran)', tap(u, h, D8).outcome === 'locked');
  close(u, D8);
  check('a settled day refuses a direct log write (trg_habit_log_settled_update)', (() => {
    try {
      run('UPDATE habit_logs SET count = 0 WHERE habit_id = ? AND local_date = ?', h, D8);
      return false;
    } catch (e) {
      return /settled/.test(e.message);
    }
  })());
  check('and a direct insert (trg_habit_log_settled_insert)', (() => {
    const h2 = habit(u, { kind: 'good', name: 'h2' });
    try {
      run(`INSERT INTO habit_logs (habit_id, user_id, local_date, count, status) VALUES (?, ?, ?, 0, 'pending')`, h2, u, D8);
      return false;
    } catch (e) {
      return /settled/.test(e.message);
    }
  })());
  check('a day before the habit existed is locked', tap(u, h, '2026-09-07').outcome === 'locked');
}

console.log('\n── tasks (f_app tasks.test) ───────────────────────────────────────────────────');
{
  at('2026-09-09T10:00:00Z');
  const u = account('tasks');
  const t = task(u, { title: 'Számla', priority: 3, dueOn: D9, dueTime: '18:00' });
  const c = tasks.completeTaskTx({ userId: u, taskId: t, requestId: 'probe' });
  check('completing on time pays by priority (20)', c.outcome === 'completed' && balance(u) === 20);
  check('completing again pays nothing', tasks.completeTaskTx({ userId: u, taskId: t, requestId: 'probe' }).outcome === 'already' && balance(u) === 20);
  const late = task(u, { title: 'Késő', priority: 2, dueOn: '2026-09-09', dueTime: '08:00' });
  tasks.completeTaskTx({ userId: u, taskId: late, requestId: 'probe' });
  check('late completion pays half (5)', balance(u) === 25, `${balance(u)}`);
  const custom = task(u, { title: 'Nagy', points: 50 });
  tasks.completeTaskTx({ userId: u, taskId: custom, requestId: 'probe' });
  check('the override is respected (50)', balance(u) === 75);
  const x = task(u, { title: 'x' });
  tasks.completeTaskTx({ userId: u, taskId: x, requestId: 'probe' });
  const r = tasks.reopenTaskTx({ userId: u, taskId: x, requestId: 'probe' });
  check('reopen reverses exactly', r.outcome === 'reopened' && r.reversal.amountMinor === -1000 && balance(u) === 75);
  check('award + reversal, nothing deleted', all(`SELECT 1 FROM coin_events WHERE user_id = ? AND source_type = 'task' AND source_id = ?`, u, x).length === 2);
  const again = tasks.completeTaskTx({ userId: u, taskId: x, requestId: 'probe' });
  check('a completion after a reopen pays once more (seq 1), not twice', again.event?.amountMinor === 1000 && balance(u) === 85);
  advanceDays(3);
  check('after its day settles the completion is locked', tasks.reopenTaskTx({ userId: u, taskId: x, requestId: 'probe' }).outcome === 'locked');
  const tpl = task(u, { title: 'tpl', dueOn: '2026-09-12', recurrence: { type: 'daily' } });
  check('a template cannot be completed', tasks.completeTaskTx({ userId: u, taskId: tpl, requestId: 'probe' }).outcome === 'template');
}
{
  at('2026-09-09T10:00:00Z');
  const u = account('buckets');
  const due = task(u, { title: 'due', dueOn: D9, dueTime: '20:00' });
  const dueEarly = task(u, { title: 'dueEarly', dueOn: D9, dueTime: '08:00', priority: 1 });
  const overdue = task(u, { title: 'overdue', dueOn: D9 });
  run(`UPDATE tasks SET due_on = '2026-09-07' WHERE id = ?`, overdue);
  const anytime = task(u, { title: 'anytime', priority: 3 });
  const tomorrow = task(u, { title: 'tomorrow', dueOn: '2026-09-10' });
  const doneToday = task(u, { title: 'done' });
  tasks.completeTaskTx({ userId: u, taskId: doneToday, requestId: 'probe' });
  const gone = task(u, { title: 'gone' });
  tasks.deleteTaskTx({ userId: u, taskId: gone });
  const l = tasks.tasksQuery({ userId: u });
  check('due today, by time', l.due.map((t) => t.id).join() === `${dueEarly},${due}`, l.due.map((t) => t.title).join());
  check('overdue', l.overdue.map((t) => t.id).join() === `${overdue}`);
  check('anytime', l.anytime.map((t) => t.id).join() === `${anytime}`);
  check('completed today', l.completedToday.map((t) => t.id).join() === `${doneToday}`);
  check('tomorrow is upcoming, not due; deleted is nowhere', l.upcoming.some((t) => t.id === tomorrow) && ![...l.due, ...l.overdue, ...l.anytime].some((t) => t.id === tomorrow || t.id === gone));
}

console.log('\n── recurring tasks (f_app recurringTasks.test) ────────────────────────────────');
{
  at('2026-09-09T10:00:00Z'); // Wednesday
  const u = account('recur');
  const tpl = task(u, { title: 'Vitamin', dueOn: D9, dueTime: '08:00', recurrence: { type: 'daily' } });
  const inst = (day) => all('SELECT id, due_time t FROM tasks WHERE parent_task_id = ? AND due_on = ? AND deleted_at IS NULL', tpl, day);
  const l = tasks.tasksQuery({ userId: u });
  check('the template is listed as a template, never as a due task', l.templates.some((t) => t.id === tpl) && !l.due.some((t) => t.id === tpl));
  check('today has one instance, at the template time', inst(D9).length === 1 && inst(D9)[0].t === '08:00' && l.due[0]?.parentTaskId === tpl);
  check('today + 7 has one, today + 8 none', inst('2026-09-16').length === 1 && inst('2026-09-17').length === 0);
  check('materializing again creates nothing', tasks.materializeRecurringTasksTx({ userId: u }).created === 0);
  tasks.completeTaskTx({ userId: u, taskId: inst(D9)[0].id, requestId: 'probe' });
  check('due 08:00, completed 12:00 local: late, half of 10', balance(u) === 5);
  advanceDays(3);
  settleNow(u);
  check('the horizon moved to today + 7', inst('2026-09-19').length === 1);
  check('the 10th and 11th went overdue (-5 each), the 12th is today', balance(u) === -5, `${balance(u)}`);
}
{
  at('2026-09-09T10:00:00Z');
  const u = account('recur-weekly');
  const tpl = task(u, { title: 'Szemét', dueOn: '2026-09-10', dueTime: '19:00', recurrence: { type: 'weekly', weekdayMask: 0b0001000 } });
  const n = (day) => one('SELECT COUNT(*) n FROM tasks WHERE parent_task_id = ? AND due_on = ?', tpl, day).n;
  check('weekly respects the mask and the anchor (Thursdays from the 10th)', n(D9) === 0 && n('2026-09-10') === 1 && n('2026-09-11') === 0 && n('2026-09-17') === 0);
}
{
  at('2026-09-09T10:00:00Z');
  const u = account('recur-delete');
  const tpl = task(u, { title: 'x', dueOn: D9, dueTime: '22:00', recurrence: { type: 'daily' } });
  const today = one('SELECT id FROM tasks WHERE parent_task_id = ? AND due_on = ?', tpl, D9).id;
  tasks.completeTaskTx({ userId: u, taskId: today, requestId: 'probe' });
  tasks.deleteTaskTx({ userId: u, taskId: tpl });
  const l = tasks.tasksQuery({ userId: u });
  check('deleting a template keeps the completed instance', l.completedToday.some((t) => t.id === today) && l.templates.length === 0);
  check('and removes the future open ones', one('SELECT COUNT(*) n FROM tasks WHERE parent_task_id = ? AND due_on > ? AND deleted_at IS NULL', tpl, D9).n === 0);
}
{
  at('2026-09-09T10:00:00Z');
  const u = account('recur-change');
  const tpl = task(u, { title: 'x', dueOn: D9, dueTime: '22:00', recurrence: { type: 'daily' } });
  tasks.updateTaskTx({ userId: u, taskId: tpl, patch: { recurrence: { type: 'weekly', weekdayMask: 0b0000100 } } });
  const n = (day) => one('SELECT COUNT(*) n FROM tasks WHERE parent_task_id = ? AND due_on = ? AND deleted_at IS NULL', tpl, day).n;
  check('a changed rule regenerates without duplicates (Wednesdays)', n(D9) === 1 && n('2026-09-10') === 0 && n('2026-09-16') === 1, `${n(D9)} ${n('2026-09-10')} ${n('2026-09-16')}`);
  check('materializing again creates nothing', tasks.materializeRecurringTasksTx({ userId: u }).created === 0);
  check('a template cannot stop recurring (delete it instead)', tasks.updateTaskTx({ userId: u, taskId: tpl, patch: { recurrence: null } }).outcome === 'conflict');
}

console.log('\n── DST: spring forward, 2026-03-29, Europe/Budapest ───────────────────────────');
{
  at('2026-03-25T10:00:00Z');
  const u = account('dst-spring');
  const h = habit(u, { kind: 'good', name: 'daily' });
  const days = [];
  for (let d = '2026-03-25'; d <= '2026-03-31'; d = dates.addDaysToKey(d, 1)) {
    // Tap at 12:00 local of each day, then let the day settle the next day.
    at(`${d}T10:00:00Z`);
    tap(u, h, d);
    days.push(d);
  }
  // The 28th settles at start(29th) + 6 h: 04:00 CEST (the clocks jumped at 02:00) + 6 h = 10:00 CEST = 08:00Z.
  at('2026-03-29T07:59:00Z');
  settleNow(u);
  check('before 10:00 CEST on the 29th, the 28th is still open', !one('SELECT 1 x FROM daily_summaries WHERE user_id = ? AND local_date = ?', u, '2026-03-28'));
  at('2026-03-29T08:00:00Z');
  settleNow(u);
  check('at 10:00 CEST it settles', !!one('SELECT 1 x FROM daily_summaries WHERE user_id = ? AND local_date = ?', u, '2026-03-28'));
  at('2026-04-01T09:00:00Z');
  settleNow(u);
  const rows = all('SELECT local_date d, streak_after s FROM habit_day_results WHERE habit_id = ? ORDER BY local_date', h);
  check('seven days, one row each, across the short day', rows.length === 7 && rows.map((r) => r.d).join() === days.join(), rows.map((r) => r.d).join());
  check('the streak counts 1..7 without a gap', rows.map((r) => r.s).join() === '1,2,3,4,5,6,7');
  check('the 7-day milestone lands on the 31st', eventsOf(u, 'streak.milestone')[0]?.d === '2026-03-31');
}

console.log('\n── DST: fall back, 2026-10-25, Europe/Budapest ────────────────────────────────');
{
  at('2026-10-23T10:00:00Z');
  const u = account('dst-fall');
  const h = habit(u, { kind: 'good', name: 'night owl' });
  // 02:30 local happens twice on the 25th; with a 04:00 start both belong to the 24th.
  check('02:30 CEST (00:30Z) is the 24th', dates.dayKeyFor(Date.parse('2026-10-25T00:30:00Z'), TZ, 4) === '2026-10-24');
  check('02:30 CET (01:30Z) is still the 24th', dates.dayKeyFor(Date.parse('2026-10-25T01:30:00Z'), TZ, 4) === '2026-10-24');
  at('2026-10-25T01:30:00Z');
  check('a tap in the repeated hour lands on the 24th', tap(u, h, null).log.date === '2026-10-24');
  // The 24th settles at 04:00 CET (after the fall-back) + 6 h = 10:00 CET = 09:00Z.
  at('2026-10-25T08:59:00Z');
  settleNow(u);
  check('before 10:00 CET the 24th is open', !one('SELECT 1 x FROM daily_summaries WHERE user_id = ? AND local_date = ?', u, '2026-10-24'));
  at('2026-10-25T09:00:00Z');
  settleNow(u);
  check('at 10:00 CET it settles, the tap paid', !!one('SELECT 1 x FROM daily_summaries WHERE user_id = ? AND local_date = ?', u, '2026-10-24') && eventsOf(u, 'habit.done').some((e) => e.d === '2026-10-24'));
  const t = task(u, { title: 'at 02:30', dueOn: '2026-10-25', dueTime: '02:30' });
  at('2026-10-26T00:45:00Z'); // 01:45 CET on the 26th: before 02:30, still the logical 25th
  const c = tasks.completeTaskTx({ userId: u, taskId: t, requestId: 'probe' });
  check('a 02:30 due time on the logical 25th falls on the 26th: 01:45 is on time', c.late === false, JSON.stringify({ late: c.late }));
}

console.log('\n── a returning user, twelve days away (plan L6) ───────────────────────────────');
{
  at('2026-09-01T10:00:00Z');
  const u = account('returning');
  const h = habit(u, { kind: 'good', name: 'h' });
  const early = task(u, { title: 'due in the gap', dueOn: '2026-09-08' });
  const late = task(u, { title: 'due in the window', dueOn: '2026-09-15' });
  for (let d = '2026-09-01'; d <= '2026-09-05'; d = dates.addDaysToKey(d, 1)) {
    at(`${d}T10:00:00Z`);
    settleNow(u);
    tap(u, h, d);
  }
  at('2026-09-06T10:00:00Z');
  settleNow(u);
  check('five settled days build a streak of 5', state(u, h).current === 5);
  const before = balance(u);
  at('2026-09-18T10:00:00Z'); // twelve days later; the 17th has settled
  settleNow(u);
  const lapsed = all(`SELECT local_date d FROM daily_summaries WHERE user_id = ? AND status = 'lapsed' ORDER BY local_date`, u).map((r) => r.d);
  const closed = all(`SELECT local_date d FROM daily_summaries WHERE user_id = ? AND status = 'closed' AND local_date > '2026-09-05' ORDER BY local_date`, u).map((r) => r.d);
  check('the days beyond the 7-day catch-up lapse', lapsed.join() === '2026-09-06,2026-09-07,2026-09-08,2026-09-09,2026-09-10', lapsed.join());
  check('the newest seven close', closed.join() === '2026-09-11,2026-09-12,2026-09-13,2026-09-14,2026-09-15,2026-09-16,2026-09-17', closed.join());
  const lapseRow = one(`SELECT streak_after s, best_after b FROM habit_day_results WHERE habit_id = ? AND outcome = 'lapsed'`, h);
  check('the gap resets the streak and keeps the best', lapseRow?.s === 0 && lapseRow?.b === 5, JSON.stringify(lapseRow));
  check('no coin moved on a lapsed day', one(`SELECT COUNT(*) n FROM coin_events WHERE user_id = ? AND local_date BETWEEN '2026-09-06' AND '2026-09-10'`, u).n === 0);
  check('a task overdue inside the gap is marked without a penalty', one('SELECT overdue_on o FROM tasks WHERE id = ?', early).o === '2026-09-10' && eventsOf(u, 'task.overdue').every((e) => e.d !== '2026-09-10'));
  check('a task overdue inside the window costs 5 on its day', eventsOf(u, 'task.overdue').some((e) => e.d === '2026-09-15' && e.a === -500) && one('SELECT overdue_on o FROM tasks WHERE id = ?', late).o === '2026-09-15');
  check('the seven closed days charge seven misses (-35) and the one task (-5)', balance(u) === before - 40, `${before} -> ${balance(u)}`);
}

console.log('\n── every coin event has its ledger row ────────────────────────────────────────');
{
  const orphan = one(`SELECT COUNT(*) n FROM coin_events e WHERE NOT EXISTS (SELECT 1 FROM coin_ledger l WHERE l.ref_type = 'coin_event' AND l.ref_id = e.id)`).n;
  check('no event without its ledger row', orphan === 0, `${orphan}`);
  const drift = one(`SELECT COUNT(*) n FROM coin_wallets w WHERE w.balance_minor <> (SELECT COALESCE(SUM(amount_minor), 0) FROM coin_ledger l WHERE l.user_id = w.user_id)`).n;
  check('every wallet equals its ledger', drift === 0, `${drift}`);
}

db.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* the OS reclaims it */
}
console.log(`\n${failed ? 'PROBE FAILED' : 'PROBE OK'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
