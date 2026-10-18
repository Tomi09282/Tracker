#!/usr/bin/env node
/**
 * verify-032 — every guard migration 032 adds, refused once with ITS OWN message, next to the
 * accepted twin of each refused write (a guard that refuses everything cannot pass); then the item
 * caps and the ownership of the habit / task transactions, through the REAL worker modules against
 * a throwaway encrypted database.
 *
 * Run: npm run verify:032
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-verify-032-'));
process.env.DB_PATH = path.join(tmpDir, 'v032.db');

const { getDb } = await import('../src/db/conn.js');
const worker = await import('../src/db/worker.js');
const core = await import('../src/db/tx/lifeos.js');
const habits = await import('../src/db/tx/lifeos-habits.js');
const tasks = await import('../src/db/tx/lifeos-tasks.js');
const dates = await import('../src/lifeos/dates.js');
const { DEFAULT_RULES, RULE_KEYS, LIFEOS_LIMITS } = await import('../src/lifeos/rules.js');

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

const mkUser = (label) => Number(run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'user')`, `${label}@probe.test`).lastInsertRowid);
const alice = mkUser('alice');
const bob = mkUser('bob');
const TODAY = dates.dayKeyFor(Date.now(), 'Europe/Budapest', 4);
const YESTERDAY = dates.addDaysToKey(TODAY, -1);
let k = 0;
const ck = () => `probe-${(k += 1).toString().padStart(4, '0')}`;

const insHabit = (u, o = {}) =>
  Number(
    run(
      `INSERT INTO habits (user_id, name, kind, schedule_type, weekday_mask, times_per_week, target_count, unit,
         points_success, points_penalty, reminder_time, started_on, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u, o.name ?? 'h', o.kind ?? 'good', o.schedule ?? 'daily', o.mask ?? 127, o.tpw ?? null, o.target ?? 1, o.unit ?? null,
      o.success ?? 10, o.penalty ?? 5, o.reminder ?? null, o.started ?? YESTERDAY, o.key ?? ck(),
    ).lastInsertRowid,
  );

console.log('── user_version ───────────────────────────────────────────────────────────────');
check('the schema stands at 32 or later', db.pragma('user_version', { simple: true }) >= 32);

console.log('\n── habits ─────────────────────────────────────────────────────────────────────');
const hA = insHabit(alice);
accepted('a plain good habit is accepted', () => insHabit(alice, { name: 'Víz', target: 8, unit: 'pohár' }));
refused('coins above 50 are refused (the per-item cap)', () => insHabit(alice, { success: 51 }), 'CHECK');
refused('a penalty above 50 is refused', () => insHabit(alice, { penalty: 51 }), 'CHECK');
refused('a name with surrounding spaces is refused', () => insHabit(alice, { name: ' x ' }), 'CHECK');
refused('an 81-character name is refused', () => insHabit(alice, { name: 'x'.repeat(81) }), 'CHECK');
refused('a bad habit with a count is refused', () => insHabit(alice, { kind: 'bad', target: 3 }), 'CHECK');
refused('a bad habit on a weekly quota is refused', () => insHabit(alice, { kind: 'bad', schedule: 'times_per_week', tpw: 3 }), 'CHECK');
refused('a weekly quota without its count is refused', () => insHabit(alice, { schedule: 'times_per_week' }), 'CHECK');
refused('an empty weekday mask is refused', () => insHabit(alice, { schedule: 'weekdays', mask: 0 }), 'CHECK');
refused('a reminder at 24:00 is refused', () => insHabit(alice, { reminder: '24:00' }), 'CHECK');
accepted('a reminder at 23:59 is accepted', () => insHabit(alice, { reminder: '23:59' }));
refused('a client key with a colon (the server namespace) is refused', () => insHabit(alice, { key: 'buy:12345678' }), 'CHECK');
refused('the same client key twice is refused (habits_client_key_uidx)', () => insHabit(alice, { key: 'samekey-0001' }) && insHabit(alice, { key: 'samekey-0001' }), 'UNIQUE');
accepted('the same key under another account is accepted', () => insHabit(bob, { key: 'samekey-0001' }));
refused('a habit cannot change owner (trg_habit_identity_frozen)', () => run('UPDATE habits SET user_id = ? WHERE id = ?', bob, hA), 'keeps its owner');
refused('nor kind', () => run(`UPDATE habits SET kind = 'bad' WHERE id = ?`, hA), 'keeps its owner');
refused('nor start day', () => run(`UPDATE habits SET started_on = '2020-01-01' WHERE id = ?`, hA), 'keeps its owner');
accepted('its name and coins can change', () => run(`UPDATE habits SET name = 'renamed', points_success = 20 WHERE id = ?`, hA));

console.log('\n── habit_logs ─────────────────────────────────────────────────────────────────');
const insLog = (h, u, d, count, status, doneAt = null) =>
  run(`INSERT INTO habit_logs (habit_id, user_id, local_date, count, status, done_at) VALUES (?, ?, ?, ?, ?, ?)`, h, u, d, count, status, doneAt);
refused('a log under another account than the habit is refused (trg_habit_log_owner)', () => insLog(hA, bob, TODAY, 1, 'done', 1), 'owner');
accepted('a log by the owner is accepted', () => insLog(hA, alice, TODAY, 1, 'done', 1));
refused('one log per habit per day (UNIQUE)', () => insLog(hA, alice, TODAY, 0, 'pending'), 'UNIQUE');
refused('done without done_at is refused', () => insLog(hA, alice, YESTERDAY, 1, 'done', null), 'CHECK');
refused('a skip with a count is refused', () => insLog(hA, alice, YESTERDAY, 1, 'skipped'), 'CHECK');
refused('a relapse of zero is refused', () => insLog(hA, alice, YESTERDAY, 0, 'relapse'), 'CHECK');
refused('a log cannot move to another day (trg_habit_log_owner_upd)', () => run('UPDATE habit_logs SET local_date = ? WHERE habit_id = ? AND local_date = ?', YESTERDAY, hA, TODAY), 'keeps its habit');
accepted('its count can change while the day is open', () => run(`UPDATE habit_logs SET count = 0, status = 'pending', done_at = NULL WHERE habit_id = ? AND local_date = ?`, hA, TODAY));
run(`INSERT INTO daily_summaries (user_id, local_date, status) VALUES (?, ?, 'lapsed')`, alice, YESTERDAY);
refused('a settled day refuses a new log (trg_habit_log_settled_insert)', () => insLog(hA, alice, YESTERDAY, 0, 'pending'), 'has settled');
const hB = insHabit(alice, { name: 'b2' });
run(`DELETE FROM daily_summaries WHERE user_id = ? AND local_date = ?`, alice, YESTERDAY);
insLog(hB, alice, YESTERDAY, 0, 'pending');
run(`INSERT INTO daily_summaries (user_id, local_date, status) VALUES (?, ?, 'lapsed')`, alice, YESTERDAY);
refused('a settled day refuses an edit (trg_habit_log_settled_update)', () => run('UPDATE habit_logs SET count = 1 WHERE habit_id = ? AND local_date = ?', hB, YESTERDAY), 'has settled');

console.log('\n── habit_day_results ──────────────────────────────────────────────────────────');
const insRes = (h, u, d, o = {}) =>
  run(
    `INSERT INTO habit_day_results (habit_id, user_id, local_date, outcome, streak_after, best_after, freezes_after)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    h, u, d, o.outcome ?? 'done', o.streak ?? 1, o.best ?? 1, o.freezes ?? 0,
  );
refused('a result for a settled day is refused (trg_habit_result_settled)', () => insRes(hA, alice, YESTERDAY), 'has settled');
accepted('a result for an open day is accepted', () => insRes(hA, alice, TODAY));
refused('a result under another account is refused (trg_habit_result_owner)', () => insRes(hA, bob, dates.addDaysToKey(TODAY, 1)), 'owner');
refused('best below the streak is refused', () => insRes(hB, alice, TODAY, { streak: 5, best: 4 }), 'CHECK');
refused('an unknown outcome is refused', () => insRes(hB, alice, TODAY, { outcome: 'great' }), 'CHECK');
refused('a result is immutable (trg_habit_result_immutable)', () => run('UPDATE habit_day_results SET streak_after = 99 WHERE habit_id = ?', hA), 'cannot be rewritten');

console.log('\n── tasks ──────────────────────────────────────────────────────────────────────');
const insTask = (u, o = {}) =>
  Number(
    run(
      `INSERT INTO tasks (user_id, title, priority, points, due_on, due_time, recurrence, parent_task_id, occurrence_on,
         completed_at, completed_on, client_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u, o.title ?? 't', o.priority ?? 2, o.points ?? null, o.dueOn ?? null, o.dueTime ?? null, o.recurrence ?? null,
      o.parent ?? null, o.occ ?? null, o.completedAt ?? null, o.completedOn ?? null, 'key' in o ? o.key : ck(),
    ).lastInsertRowid,
  );
const tA = insTask(alice, { dueOn: TODAY });
refused('an override above 50 is refused', () => insTask(alice, { points: 51 }), 'CHECK');
refused('priority 4 is refused', () => insTask(alice, { priority: 4 }), 'CHECK');
refused('a due time without a day is refused', () => insTask(alice, { dueTime: '10:00' }), 'CHECK');
refused('a template without a first day is refused', () => insTask(alice, { recurrence: '{"type":"daily"}' }), 'CHECK');
refused('a recurrence that is not one of the three is refused', () => insTask(alice, { dueOn: TODAY, recurrence: '{"type":"yearly"}' }), 'CHECK');
refused('completed_at without completed_on is refused', () => insTask(alice, { completedAt: 1 }), 'CHECK');
const tpl = insTask(alice, { dueOn: TODAY, recurrence: '{"type":"daily"}' });
refused('an instance carries no client key', () => insTask(alice, { parent: tpl, occ: TODAY, dueOn: TODAY }), 'CHECK');
accepted('an instance of the owner\'s template is accepted', () => insTask(alice, { parent: tpl, occ: TODAY, dueOn: TODAY, key: null }));
refused('one instance per template per day (tasks_occurrence_uidx)', () => insTask(alice, { parent: tpl, occ: TODAY, dueOn: TODAY, key: null }), 'UNIQUE');
refused('an instance under another account is refused (trg_task_parent_owner)', () => insTask(bob, { parent: tpl, occ: YESTERDAY, dueOn: YESTERDAY, key: null }), 'template');
refused('a task cannot change owner (trg_task_identity_frozen)', () => run('UPDATE tasks SET user_id = ? WHERE id = ?', bob, tA), 'keeps its owner');
const tDone = insTask(alice, { completedAt: 1, completedOn: YESTERDAY });
refused('a completion on a settled day cannot be undone (trg_task_completion_settled)', () => run('UPDATE tasks SET completed_at = NULL, completed_on = NULL WHERE id = ?', tDone), 'has settled');
refused('nor can a completion be written onto a settled day', () => run('UPDATE tasks SET completed_at = 1, completed_on = ? WHERE id = ?', YESTERDAY, tA), 'has settled');
accepted('a completion on an open day is accepted', () => run('UPDATE tasks SET completed_at = 1, completed_on = ? WHERE id = ?', TODAY, tA));
accepted('and can be undone while the day is open', () => run('UPDATE tasks SET completed_at = NULL, completed_on = NULL WHERE id = ?', tA));
accepted('overdue is written once', () => run('UPDATE tasks SET overdue_on = ? WHERE id = ?', YESTERDAY, tA));
refused('and never moved (trg_task_overdue_once)', () => run('UPDATE tasks SET overdue_on = ? WHERE id = ?', TODAY, tA), 'overdue once');

console.log('\n── the daily cap, recreated: streak milestones are exempt (owner 2026-10-18) ──');
check('streak.milestone is the one cap-exempt reason', one(`SELECT GROUP_CONCAT(key) k FROM coin_reasons WHERE cap_exempt = 1`).k === 'streak.milestone');
const ev = (u, reason, amount, src, d = TODAY) =>
  run(
    `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, request_id)
     VALUES (?, ?, ?, ?, ?, 'habit_day', ?, 'probe')`,
    u, reason, amount, amount, d, src,
  );
const carol = mkUser('carol');
accepted('an earn up to the cap (400 coins) is accepted', () => ev(carol, 'habit.done', 40000, 1));
refused('one more capped coin is refused (trg_coin_event_daily_cap)', () => ev(carol, 'habit.done', 100, 2), 'daily coin cap');
accepted('a milestone above the cap is accepted', () => ev(carol, 'streak.milestone', 50000, 3));
const dan = mkUser('dan');
accepted('a milestone does not count towards the cap (500 milestone, then 400 earned)', () => {
  ev(dan, 'streak.milestone', 50000, 1);
  ev(dan, 'habit.done', 40000, 2);
});

console.log('\n── the transactions: zone, caps, ownership ────────────────────────────────────');
const erin = mkUser('erin');
const input = { kind: 'good', name: 'Olvasás' };
check('a habit cannot be created before the zone is known (TIMEZONE_REQUIRED)', habits.createHabitTx({ userId: erin, input, clientKey: ck() }).outcome === 'timezone_required');
check('nor a task', tasks.createTaskTx({ userId: erin, input: { title: 'x' }, clientKey: ck() }).outcome === 'timezone_required');
core.setUserPrefsTx({ userId: erin, timezone: 'Europe/Budapest', requestId: 'probe' });
const key1 = ck();
const first = habits.createHabitTx({ userId: erin, input, clientKey: key1 });
check('then it is created with the rule defaults (10 / 5)', first.outcome === 'created' && first.habit.pointsSuccess === DEFAULT_RULES.habitSuccess && first.habit.pointsPenalty === DEFAULT_RULES.habitPenalty);
const again = habits.createHabitTx({ userId: erin, input: { kind: 'bad', name: 'other' }, clientKey: key1 });
check('a replayed key answers the first habit, whatever the body says', again.outcome === 'replayed' && again.habit.id === first.habit.id && again.habit.kind === 'good');
const bad = habits.createHabitTx({ userId: erin, input: { kind: 'bad', name: 'Dohányzás' }, clientKey: ck() });
check('a bad habit gets the clean-day default (15)', bad.habit.pointsSuccess === DEFAULT_RULES.badHabitCleanDay);
for (let i = 2; i < LIFEOS_LIMITS.habits; i += 1) habits.createHabitTx({ userId: erin, input: { kind: 'good', name: `h${i}` }, clientKey: ck() });
const over = habits.createHabitTx({ userId: erin, input: { kind: 'good', name: 'one too many' }, clientKey: ck() });
check(`the ${LIFEOS_LIMITS.habits + 1}st live habit is refused (LIMIT_REACHED)`, over.outcome === 'cap' && over.limit === LIFEOS_LIMITS.habits, over.outcome);
habits.archiveHabitTx({ userId: erin, habitId: first.habit.id, archived: true });
check('archiving frees a place', habits.createHabitTx({ userId: erin, input: { kind: 'good', name: 'now fits' }, clientKey: ck() }).outcome === 'created');
check('restoring into a full list is refused', habits.archiveHabitTx({ userId: erin, habitId: first.habit.id, archived: false }).outcome === 'cap');
check('the wrong operation per kind is refused', [
  habits.setHabitCountTx({ userId: erin, habitId: bad.habit.id, count: 1 }).outcome,
  habits.skipHabitTx({ userId: erin, habitId: bad.habit.id }).outcome,
  habits.recordRelapseTx({ userId: erin, habitId: habits.habitsQuery({ userId: erin }).habits.find((x) => x.kind === 'good' && !x.archived).id, count: 1 }).outcome,
].every((o) => o === 'wrong_kind'));
check('an archived habit cannot be logged', habits.setHabitCountTx({ userId: erin, habitId: first.habit.id, count: 1 }).outcome === 'archived');

console.log('\n── IDOR: another account\'s habit or task is a 404 ─────────────────────────────');
const frank = mkUser('frank');
core.setUserPrefsTx({ userId: frank, timezone: 'Europe/Budapest', requestId: 'probe' });
const eH = habits.habitsQuery({ userId: erin }).habits.find((x) => x.kind === 'good' && !x.archived).id;
const eT = tasks.createTaskTx({ userId: erin, input: { title: 'erin only' }, clientKey: ck() }).task.id;
check('frank cannot read erin\'s habit', habits.habitQuery({ userId: frank, habitId: eH }) === null);
check('nor log it, skip it, edit it, archive it', [
  habits.setHabitCountTx({ userId: frank, habitId: eH, count: 1 }).outcome,
  habits.skipHabitTx({ userId: frank, habitId: eH }).outcome,
  habits.updateHabitTx({ userId: frank, habitId: eH, patch: { name: 'x' } }).outcome,
  habits.archiveHabitTx({ userId: frank, habitId: eH, archived: true }).outcome,
].every((o) => o === 'missing'));
check('frank cannot read, edit, complete, reopen or delete erin\'s task', tasks.taskQuery({ userId: frank, taskId: eT }) === null && [
  tasks.updateTaskTx({ userId: frank, taskId: eT, patch: { title: 'x' } }).outcome,
  tasks.completeTaskTx({ userId: frank, taskId: eT, requestId: 'probe' }).outcome,
  tasks.reopenTaskTx({ userId: frank, taskId: eT, requestId: 'probe' }).outcome,
  tasks.deleteTaskTx({ userId: frank, taskId: eT }).outcome,
].every((o) => o === 'missing'));
check('and erin\'s task is untouched', tasks.taskQuery({ userId: erin, taskId: eT })?.title === 'erin only' && tasks.taskQuery({ userId: erin, taskId: eT }).completedAt === null);
check('frank\'s wallet moved nothing', one('SELECT balance_minor b FROM coin_wallets WHERE user_id = ?', frank).b === 0);

console.log('\n── the open-task cap ──────────────────────────────────────────────────────────');
const gina = mkUser('gina');
core.setUserPrefsTx({ userId: gina, timezone: 'Europe/Budapest', requestId: 'probe' });
const ins = db.prepare(`INSERT INTO tasks (user_id, title, client_key) VALUES (?, 'bulk', ?)`);
db.transaction(() => {
  for (let i = 0; i < LIFEOS_LIMITS.openTasks; i += 1) ins.run(gina, `bulk-${i.toString().padStart(6, '0')}`);
})();
check(`the ${LIFEOS_LIMITS.openTasks + 1}st open task is refused (LIMIT_REACHED)`, tasks.createTaskTx({ userId: gina, input: { title: 'one more' }, clientKey: ck() }).outcome === 'cap');
const tplG = (() => {
  run(`UPDATE tasks SET completed_at = 1, completed_on = ? WHERE user_id = ? AND id IN (SELECT id FROM tasks WHERE user_id = ? LIMIT 3)`, TODAY, gina, gina);
  return tasks.createTaskTx({ userId: gina, input: { title: 'daily', dueOn: TODAY, recurrence: { type: 'daily' } }, clientKey: ck() });
})();
check('the materializer stops at the cap too (2 places left after the template)', tplG.outcome === 'created' && tplG.instances === 2, JSON.stringify({ o: tplG.outcome, n: tplG.instances }));

console.log('\n── the rule set the close reads is the one in force ───────────────────────────');
check('version 1 still equals DEFAULT_RULES (032 changed no rule)', JSON.stringify(Object.keys(JSON.parse(one('SELECT rules_json j FROM point_rule_sets WHERE id = 1').j)).sort()) === JSON.stringify([...RULE_KEYS].sort()));

db.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* the OS reclaims it */
}
console.log(`\n${failed ? 'PROBE FAILED' : 'PROBE OK'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
