#!/usr/bin/env node
/**
 * verify-035 — focus sessions (migration 035) and the LifeOS statistics reads, through the REAL
 * named transactions against a throwaway encrypted database.
 *
 * The worker transactions read "now" from Date.now() (never from a request), so this script owns
 * the clock, as verify-day-close does: Date.now is replaced by a settable instant and each scenario
 * walks a focus block minute by minute — design round B's own block ("Szakdolgozat – 3. fejezet",
 * 21:10 -> 22:00 on Wed 2026-10-21, Europe/Budapest, check-ins every 15 minutes: 1 / 3 at 15
 * minutes, +23 at the end = 50 x 20 / 60 = 16.7 -> 17, + 3 x 2).
 *
 * Every 035 guard is refused once with its own message next to its accepted twin, so a guard that
 * silently stopped firing turns this red. The trigger backstops are written to with raw SQL — the
 * shapes every other writer could attempt.
 *
 * Run: npm run verify:035
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-verify-035-'));
process.env.DB_PATH = path.join(tmpDir, 'v035.db');

// THE CLOCK. Set before anything reads it.
let NOW = Date.parse('2026-10-21T19:10:00Z'); // 21:10 CEST
Date.now = () => NOW;
const at = (iso) => {
  NOW = Date.parse(iso);
};
const plusMinutes = (m) => {
  NOW += m * 60000;
};

const { getDb } = await import('../src/db/conn.js');
const worker = await import('../src/db/worker.js');
const core = await import('../src/db/tx/lifeos.js');
const focusTx = await import('../src/db/tx/lifeos-focus.js');
const statsTx = await import('../src/db/tx/lifeos-stats.js');
const tasksTx = await import('../src/db/tx/lifeos-tasks.js');
const habitsTx = await import('../src/db/tx/lifeos-habits.js');
const focus = await import('../src/lifeos/focus.js');
const stats = await import('../src/lifeos/stats.js');
const dates = await import('../src/lifeos/dates.js');
const { DEFAULT_RULES } = await import('../src/lifeos/rules.js');
const { EXPORT_TABLES } = await import('../src/db/gdpr.js');

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
/** A raw write that must be refused by a trigger / constraint whose message contains `msg`. */
const refused = (label, fn, msg) => {
  try {
    fn();
    check(label, false, 'the write was accepted');
  } catch (err) {
    check(label, String(err.message).includes(msg), err.message);
  }
};

const TZ = 'Europe/Budapest';
let seq = 0;
const key = () => `focus-key-${(seq += 1).toString().padStart(6, '0')}`;
const nowSec = () => Math.floor(NOW / 1000);

function account(label, { zone = true } = {}) {
  const id = Number(run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'user')`, `${label}-${seq += 1}@probe.test`).lastInsertRowid);
  if (zone) {
    const p = core.setUserPrefsTx({ userId: id, timezone: TZ, requestId: 'probe' });
    if (p.outcome !== 'applied') throw new Error(`prefs: ${p.outcome}`);
  }
  return id;
}
const balance = (u) => one('SELECT balance_minor AS b FROM coin_wallets WHERE user_id = ?', u).b;
const focusEvents = (u) => all(`SELECT id, amount_minor AS a, local_date AS d, source_id AS s, note FROM coin_events WHERE user_id = ? AND reason_key = 'focus.finish' ORDER BY id`, u);
const start = (u, input, k = key()) => focusTx.startFocusTx({ userId: u, input, clientKey: k });
const checkin = (u, id) => focusTx.checkinFocusTx({ userId: u, sessionId: id });
const finish = (u, id) => focusTx.finishFocusTx({ userId: u, sessionId: id, requestId: 'probe' });
const cancel = (u, id) => focusTx.cancelFocusTx({ userId: u, sessionId: id });

/* ══ the schema ══════════════════════════════════════════════════════════════════════════════════ */
console.log('── 035: the schema ───────────────────────────────────────────────────────────');
{
  check('user_version is at least 35', one('PRAGMA user_version').user_version >= 35, `${one('PRAGMA user_version').user_version}`);
  const idx = all(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'focus_sessions'`).map((r) => r.name);
  check('the one-open-session unique partial index exists', idx.includes('focus_sessions_one_open_uidx'), idx.join(','));
  const trg = all(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND (tbl_name = 'focus_sessions' OR name = 'trg_coin_event_focus_truthful')`).map((r) => r.name).sort();
  check('the five 035 triggers exist', ['trg_coin_event_focus_truthful', 'trg_focus_checkin_paced', 'trg_focus_close_truthful', 'trg_focus_closed_immutable', 'trg_focus_plan_frozen'].every((t) => trg.includes(t)), trg.join(','));
  const reason = one(`SELECT sign, ref_type AS refType, xp, active FROM coin_reasons WHERE key = 'focus.finish'`);
  check('the focus.finish reason (031) is live: an XP earn pointing at a coin event', reason?.sign === 1 && reason.refType === 'coin_event' && reason.xp === 1 && reason.active === 1, JSON.stringify(reason));
  check('the GDPR export reads focus_sessions', EXPORT_TABLES.some(([name, sql]) => name === 'focus_sessions' && /FROM focus_sessions WHERE user_id = \?/.test(sql)));
}

/* ══ the pure rules ══════════════════════════════════════════════════════════════════════════════ */
console.log('\n── the focus rules (f_app focus.ts) and the stats helpers ─────────────────────');
{
  const s = { startsAt: 1000, plannedMinutes: 50, checkinMinutes: 15, checkinsDone: 0, lastCheckinAt: null, status: 'open' };
  check('focus-3: 50 minutes x 20 / h = 16.7 -> 17, + 3 check-ins x 2 = 23', focus.focusPoints({ minutes: 50, checkins: 3 }, DEFAULT_RULES) === 23);
  check('25 minutes = 8.33 -> 8 (Ma: "25 perc · +8 érme")', focus.focusExpectedPoints({ plannedMinutes: 25, checkinMinutes: 0 }, DEFAULT_RULES) === 8);
  check('focus-1: the 50-minute block every 15 minutes is expected to pay +23', focus.focusExpectedPoints(s, DEFAULT_RULES) === 23);
  check('50 / 15 holds 3 check-ins (15, 30, 45); 50 / 25 holds 1 (the 50th minute is the end); none without an interval',
    focus.checkinsMax(s) === 3 && focus.checkinsMax({ ...s, checkinMinutes: 25 }) === 1 && focus.checkinsMax({ ...s, checkinMinutes: 0 }) === 0);
  check('elapsed: 0 before the start, whole minutes while running, the plan after the end',
    focus.elapsedMinutes(s, 900) === 0 && focus.elapsedMinutes(s, 1000 + 15 * 60 + 59) === 15 && focus.elapsedMinutes(s, 1000 + 999 * 60) === 50);
  check('status: planned / active / ended', focus.focusStatus(s, 999) === 'planned' && focus.focusStatus(s, 1000) === 'active' && focus.focusStatus(s, 1000 + 3000) === 'ended');
  check('the check-in pace: none before 15 minutes, one at 15, a second only at 30',
    focus.checkinVerdict(s, 1000 + 14 * 60) === 'not_due' && focus.checkinVerdict(s, 1000 + 15 * 60) === 'ok'
      && focus.checkinVerdict({ ...s, checkinsDone: 1, lastCheckinAt: 1000 + 900 }, 1000 + 29 * 60) === 'not_due');
  check('two check-ins closer than 5 minutes count once (catching up at 45 minutes)',
    focus.checkinVerdict({ ...s, checkinsDone: 1, lastCheckinAt: 1000 + 45 * 60 }, 1000 + 49 * 60) === 'too_soon');
  check('the day limit trims the minutes and the check-ins they cover: 10 of 50 minutes left -> 10 min, 0 check-ins, 3 coins',
    JSON.stringify(focus.focusPayout({ ...s, checkinsDone: 3 }, 1000 + 3000, 470, DEFAULT_RULES)) === JSON.stringify({ minutes: 10, checkins: 0, points: 3 }));
  check('ISO weeks: 2026-10-12..18 is week 42; 2026-01-01 (Thu) week 1 of 2026; 2027-01-01 (Fri) week 53 of 2026',
    stats.isoWeek('2026-10-12').week === 42 && stats.isoWeek('2026-10-18').week === 42
      && JSON.stringify(stats.isoWeek('2026-01-01')) === JSON.stringify({ year: 2026, week: 1 })
      && JSON.stringify(stats.isoWeek('2027-01-01')) === JSON.stringify({ year: 2026, week: 53 }));
  check('habit cells: done / clean -> done, a partial miss -> partial, a plain miss -> missed, no row -> none',
    stats.habitCellState({ outcome: 'clean', count: 0 }) === 'done' && stats.habitCellState({ outcome: 'missed', count: 1 }) === 'partial'
      && stats.habitCellState({ outcome: 'missed', count: 0 }) === 'missed' && stats.habitCellState(undefined) === 'none'
      && stats.habitCellState({ outcome: 'frozen', count: 0 }) === 'frozen');
}

/* ══ the round-B block, minute by minute ═════════════════════════════════════════════════════════ */
console.log('\n── design round B: 21:10 -> 22:00, check-ins every 15 minutes ─────────────────');
const dani = account('dani');
let blockId;
{
  at('2026-10-21T19:10:00Z');
  const k = key();
  const r = start(dani, { title: 'Szakdolgozat – 3. fejezet', minutes: 50, checkinMinutes: 15 }, k);
  blockId = r.session?.id;
  check('POST /focus: created, running, 21:10 -> 22:00, expected +23', r.outcome === 'created' && r.session.status === 'active'
    && r.session.startTime === '21:10' && r.session.endTime === '22:00' && r.session.expectedMinor === 2300 && r.session.checkinsMax === 3,
  JSON.stringify(r.session));
  const again = start(dani, { title: 'whatever', minutes: 25, checkinMinutes: 0 }, k);
  check('REPLAY: the same clientKey answers the same session (whatever the body)', again.outcome === 'replayed' && again.session.id === blockId);
  const other = start(dani, { title: 'Másik', minutes: 25, checkinMinutes: 0 });
  check('ONE OPEN SESSION: a second start is refused (FOCUS_OPEN) and names the open one', other.outcome === 'busy' && other.session.id === blockId);
  check('... and no second row exists', one(`SELECT COUNT(*) n FROM focus_sessions WHERE user_id = ? AND status = 'open'`, dani).n === 1);

  plusMinutes(1);
  check('a check-in at 1 minute is not due (0 allowed)', checkin(dani, blockId).outcome === 'not_due');
  at('2026-10-21T19:25:18Z'); // 21:25:18 — focus-2's "34:42" left, "15 / 50 perc"
  const v = focusTx.focusCurrentQuery({ userId: dani });
  check('focus-2: 34:42 left, 15 / 50 minutes, a check-in due', v.session.remainingSeconds === 34 * 60 + 42 && v.session.elapsedMinutes === 15 && v.session.checkinDue === true,
    JSON.stringify({ rem: v.session.remainingSeconds, el: v.session.elapsedMinutes, due: v.session.checkinDue }));
  const c1 = checkin(dani, blockId);
  check('"Rajta vagyok" at 15 minutes counts: 1 / 3', c1.outcome === 'counted' && c1.session.checkinsDone === 1 && c1.session.checkinDue === false);
  check('a double tap does not count twice (not due: 1 allowed at 15 minutes)', checkin(dani, blockId).outcome === 'not_due' && focusTx.focusQuery({ userId: dani, sessionId: blockId }).session.checkinsDone === 1);
  check('a check-in moves no coin', balance(dani) === 0 && focusEvents(dani).length === 0);
  at('2026-10-21T19:40:00Z');
  check('at 30 minutes the second one counts', checkin(dani, blockId).outcome === 'counted');
  at('2026-10-21T19:55:30Z');
  const c3 = checkin(dani, blockId);
  check('at 45 minutes the third: 3 / 3, none left (nextCheckinAt null)', c3.outcome === 'counted' && c3.session.checkinsDone === 3 && c3.session.nextCheckinAt === null);
  check('at 45 minutes Befejezés would pay 15 + 3 x 2 = 21 (payoutNowMinor)', c3.session.payoutNowMinor === pointsMinor(45, 3), `${c3.session.payoutNowMinor}`);
  at('2026-10-21T20:00:00Z'); // 22:00, the end
  check('a check-in after the end is refused (FOCUS_NOT_ACTIVE)', checkin(dani, blockId).outcome === 'not_active');
  const f = finish(dani, blockId);
  check('Befejezés pays +23 on the logical today (focus-3)', f.outcome === 'finished' && f.event?.amountMinor === 2300 && f.session.status === 'done'
    && f.session.paidMinutes === 50 && f.session.paidCheckins === 3 && f.session.awardedMinor === 2300 && f.session.capped === false, JSON.stringify(f.event));
  check('... through ONE focus.finish event on 2026-10-21, source = the session', focusEvents(dani).length === 1 && focusEvents(dani)[0].d === '2026-10-21' && focusEvents(dani)[0].s === blockId);
  check('... and the wallet moved exactly +23 (its ledger row follows the event)', balance(dani) === 2300
    && one(`SELECT COUNT(*) n FROM coin_ledger WHERE user_id = ? AND ref_type = 'coin_event' AND reason_key = 'focus.finish'`, dani).n === 1);
  check('XP rose by 23 (focus.finish is an XP reason)', core.walletQuery({ userId: dani }).xp === 23);
  const f2 = finish(dani, blockId);
  check('REPLAY: a second finish answers already, with the same award, and pays nothing', f2.outcome === 'already' && f2.session.awardedMinor === 2300 && focusEvents(dani).length === 1 && balance(dani) === 2300);
  check('a finished session cannot be cancelled into a free one (FOCUS_CLOSED)', cancel(dani, blockId).outcome === 'closed');
  check('after the finish a new block can start', start(dani, { title: 'Következő', minutes: 25, checkinMinutes: 0 }).outcome === 'created');
}
function pointsMinor(minutes, checkins) {
  return focus.focusPoints({ minutes, checkins }, DEFAULT_RULES) * 100;
}

/* ══ cancel, planned, past, no check-ins ═════════════════════════════════════════════════════════ */
console.log('\n── Feladás, planned blocks, back-dating, no check-ins ─────────────────────────');
{
  at('2026-10-22T08:00:00Z');
  const u = account('cancel');
  const s = start(u, { title: 'Olvasás', minutes: 60, checkinMinutes: 10 }).session;
  plusMinutes(30);
  checkin(u, s.id);
  const c = cancel(u, s.id);
  check('Feladás after 30 minutes and a check-in pays nothing', c.outcome === 'cancelled' && c.session.status === 'cancelled' && balance(u) === 0 && focusEvents(u).length === 0);
  check('a second cancel answers already; a finish of a cancelled block is FOCUS_CLOSED', cancel(u, s.id).outcome === 'already' && finish(u, s.id).outcome === 'closed');

  const plan = start(u, { title: 'Mélymunka – szakdolgozat', minutes: 25, checkinMinutes: 0, startAt: nowSec() + 3600 });
  check('a block planned an hour ahead is "planned" (Ma: "Következő blokk · 25 perc · +8 érme")', plan.outcome === 'created' && plan.session.status === 'planned' && plan.session.expectedMinor === 800);
  check('it cannot be finished before it starts (FOCUS_NOT_STARTED), nor checked in (FOCUS_NOT_ACTIVE)', finish(u, plan.session.id).outcome === 'not_started' && checkin(u, plan.session.id).outcome === 'not_active');
  const today = core.lifeosTodayQuery({ userId: u });
  check('GET /lifeos/today carries the FÓKUSZ block: the planned session, today\'s minutes', today.focus?.current?.id === plan.session.id && today.focus.current.status === 'planned' && today.focus.todayMinutes === 0, JSON.stringify(today.focus));
  check('a planned block can be given up', cancel(u, plan.session.id).outcome === 'cancelled');

  check('FORGE: a start 10 minutes in the past is refused (no back-dated minutes)', start(u, { title: 'x', minutes: 25, checkinMinutes: 0, startAt: nowSec() - 600 }).outcome === 'invalid');
  check('EXTREMES: a start more than 24 h ahead is refused', start(u, { title: 'x', minutes: 25, checkinMinutes: 0, startAt: nowSec() + 86401 }).outcome === 'invalid');
  const slack = start(u, { title: 'lassú kérés', minutes: 25, checkinMinutes: 0, startAt: nowSec() - 60 });
  check('a start a minute in the past (a slow request) is read as now', slack.outcome === 'created' && slack.session.startsAt === nowSec());
  check('a block without check-ins refuses one (FOCUS_NO_CHECKINS)', checkin(u, slack.session.id).outcome === 'no_checkins');
  cancel(u, slack.session.id);

  const noZone = account('nozone', { zone: false });
  check('TIMEZONE_REQUIRED before the zone is set', start(noZone, { title: 'x', minutes: 25, checkinMinutes: 0 }).outcome === 'timezone_required');
  check('GET /focus/current before the zone: started false, no session', focusTx.focusCurrentQuery({ userId: noZone }).started === false);
}

/* ══ the 5-minute de-dup with a short interval ═══════════════════════════════════════════════════ */
console.log('\n── the 5-minute de-dup ────────────────────────────────────────────────────────');
{
  at('2026-10-22T10:00:00Z');
  const u = account('dedup');
  const s = start(u, { title: 'Sprint', minutes: 60, checkinMinutes: 5 }).session;
  plusMinutes(20); // 4 allowed, none answered
  check('catching up at 20 minutes: the first counts', checkin(u, s.id).outcome === 'counted');
  check('the next tap is too soon (within 5 minutes), though 3 more are "allowed"', checkin(u, s.id).outcome === 'too_soon');
  plusMinutes(4);
  check('still too soon at 4 minutes', checkin(u, s.id).outcome === 'too_soon');
  plusMinutes(1);
  check('5 minutes later the second counts', checkin(u, s.id).outcome === 'counted');
  cancel(u, s.id);
}

/* ══ the daily focus limit and the daily coin cap ════════════════════════════════════════════════ */
console.log('\n── the day limits: 480 paid focus minutes, the 400-coin earn cap ───────────────');
{
  at('2026-10-23T08:00:00Z');
  const u = account('limit');
  const today = dates.dayKeyFor(NOW, TZ, 4);
  // Plant 470 paid minutes finished today (as earlier sessions would have left them).
  run(`INSERT INTO focus_sessions (user_id, client_key, title, created_on, starts_at, planned_minutes, checkin_minutes,
         status, closed_at, closed_on, paid_minutes, paid_checkins)
       VALUES (?, ?, 'korábbi', ?, ?, 470, 0, 'done', ?, ?, 470, 0)`, u, key(), today, nowSec() - 9 * 3600, nowSec() - 3600, today);
  const s = start(u, { title: 'Még egy', minutes: 50, checkinMinutes: 15 }).session;
  plusMinutes(15); checkin(u, s.id); plusMinutes(15); checkin(u, s.id); plusMinutes(15); checkin(u, s.id); plusMinutes(5);
  const f = finish(u, s.id);
  check('beyond 480 minutes a day the finish pays for the 10 minutes left and no check-in (10 x 20 / 60 = 3)',
    f.outcome === 'finished' && f.session.paidMinutes === 10 && f.session.paidCheckins === 0 && f.event?.amountMinor === 300, JSON.stringify({ p: f.session.paidMinutes, c: f.session.paidCheckins, a: f.event?.amountMinor }));
  check('the session still closes (done) and shows its real 50 minutes', f.session.status === 'done' && f.session.elapsedMinutes === 50);
  const s2 = start(u, { title: 'Túl a limiten', minutes: 25, checkinMinutes: 0 }).session;
  plusMinutes(25);
  const f2 = finish(u, s2.id);
  check('with the limit used up a finish pays nothing and writes no event', f2.outcome === 'finished' && f2.session.paidMinutes === 0 && f2.event === null && focusEvents(u).length === 1);

  at('2026-10-24T08:00:00Z');
  const v = account('cap');
  // 390 coins earned today through real task completions (8 x 50 would be the cap).
  for (const pts of [50, 50, 50, 50, 50, 50, 50, 40]) {
    const t = tasksTx.createTaskTx({ userId: v, input: { title: `t${pts}`, points: pts }, clientKey: key() });
    tasksTx.completeTaskTx({ userId: v, taskId: t.task.id, requestId: 'probe' });
  }
  check('the account earned 390 coins today', balance(v) === 39000, `${balance(v)}`);
  const b = start(v, { title: 'Cap', minutes: 50, checkinMinutes: 0 }).session;
  plusMinutes(50);
  const fc = finish(v, b.id);
  check('the daily cap trims the focus award to the 10 coins left (17 -> 10), marked capped', fc.event?.amountMinor === 1000 && fc.event.capped === true && fc.session.capped === true && balance(v) === 40000,
    JSON.stringify(fc.event));
}

/* ══ IDOR ════════════════════════════════════════════════════════════════════════════════════════ */
console.log('\n── IDOR ───────────────────────────────────────────────────────────────────────');
{
  at('2026-10-25T09:00:00Z');
  const owner = account('owner');
  const intruder = account('intruder');
  const s = start(owner, { title: 'Privát', minutes: 30, checkinMinutes: 10 }).session;
  plusMinutes(12);
  const tries = [checkin(intruder, s.id), finish(intruder, s.id), cancel(intruder, s.id)];
  check('another account checks in, finishes or cancels the session: missing every time', tries.every((t) => t.outcome === 'missing'), tries.map((t) => t.outcome).join(','));
  check('... reads it: null (a 404), and its own current is empty', focusTx.focusQuery({ userId: intruder, sessionId: s.id }) === null && focusTx.focusCurrentQuery({ userId: intruder }).session === null);
  const mine = focusTx.focusQuery({ userId: owner, sessionId: s.id }).session;
  check('... and the owner\'s session is untouched (open, 0 check-ins, no coin either side)', mine.status === 'active' && mine.checkinsDone === 0 && balance(owner) === 0 && balance(intruder) === 0);
  cancel(owner, s.id);
}

/* ══ the trigger backstops ═══════════════════════════════════════════════════════════════════════ */
console.log('\n── the 035 backstops (raw writes every other writer could attempt) ────────────');
{
  at('2026-10-26T09:00:00Z');
  const u = account('backstop');
  const today = dates.dayKeyFor(NOW, TZ, 4);
  const s = start(u, { title: 'Védett', minutes: 60, checkinMinutes: 10 }).session;
  refused('the plan is frozen: a start cannot move', () => run('UPDATE focus_sessions SET starts_at = starts_at - 3600 WHERE id = ?', s.id), 'keeps its plan');
  refused('... nor the length grow', () => run('UPDATE focus_sessions SET planned_minutes = 720 WHERE id = ?', s.id), 'keeps its plan');
  refused('ONE OPEN SESSION: a second open row cannot be stored', () => run(
    `INSERT INTO focus_sessions (user_id, client_key, title, created_on, starts_at, planned_minutes, checkin_minutes) VALUES (?, ?, 'x', ?, ?, 25, 0)`,
    u, key(), today, nowSec()), 'UNIQUE');
  refused('a check-in before it is due (0 allowed at 5 minutes)', () => run('UPDATE focus_sessions SET checkins_done = 1, last_checkin_at = ? WHERE id = ?', s.startsAt + 300, s.id), 'not due');
  run('UPDATE focus_sessions SET checkins_done = 1, last_checkin_at = ? WHERE id = ?', s.startsAt + 1800, s.id);
  check('... its accepted twin: one (late) check-in at 30 minutes', one('SELECT checkins_done n FROM focus_sessions WHERE id = ?', s.id).n === 1);
  refused('two check-ins at once', () => run('UPDATE focus_sessions SET checkins_done = 3, last_checkin_at = ? WHERE id = ?', s.startsAt + 3000, s.id), 'not due');
  refused('a check-in 4 minutes after the last, though 3 are allowed by then (the 5-minute de-dup)', () => run('UPDATE focus_sessions SET checkins_done = 2, last_checkin_at = ? WHERE id = ?', s.startsAt + 1800 + 240, s.id), 'not due');
  refused('a check-in after the end', () => run('UPDATE focus_sessions SET checkins_done = 2, last_checkin_at = ? WHERE id = ?', s.startsAt + 3600, s.id), 'not due');
  refused('a finish paying more minutes than passed (40 paid at 30 minutes)', () => run(
    `UPDATE focus_sessions SET status = 'done', closed_at = ?, closed_on = ?, paid_minutes = 40, paid_checkins = 1 WHERE id = ?`,
    s.startsAt + 1800, today, s.id), 'cannot be closed');
  refused('a finish paying a check-in that was not answered', () => run(
    `UPDATE focus_sessions SET status = 'done', closed_at = ?, closed_on = ?, paid_minutes = 30, paid_checkins = 2 WHERE id = ?`,
    s.startsAt + 1800, today, s.id), 'cannot be closed');
  refused('a focus award for an OPEN session', () => run(
    `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, rules_version, request_id)
     VALUES (?, 'focus.finish', 300, 300, ?, 'focus', ?, 1, 'probe')`, u, today, s.id), 'does not match the session');
  run(`UPDATE focus_sessions SET status = 'done', closed_at = ?, closed_on = ?, paid_minutes = 30, paid_checkins = 1 WHERE id = ?`, s.startsAt + 1800, today, s.id);
  check('... the accepted close: 30 minutes and the one check-in', one('SELECT status FROM focus_sessions WHERE id = ?', s.id).status === 'done');
  refused('a focus award above what the session is worth (30 min + 1 check-in = 10 + 2 = 12 coins; 13 claimed)', () => run(
    `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, rules_version, request_id)
     VALUES (?, 'focus.finish', 1300, 1300, ?, 'focus', ?, 1, 'probe')`, u, today, s.id), 'does not match the session');
  refused('a focus award on another day than the close', () => run(
    `INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, rules_version, request_id)
     VALUES (?, 'focus.finish', 1200, 1200, ?, 'focus', ?, 1, 'probe')`, u, dates.addDaysToKey(today, 1), s.id), 'does not match the session');
  run(`INSERT INTO coin_events (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, rules_version, request_id)
       VALUES (?, 'focus.finish', 1200, 1200, ?, 'focus', ?, 1, 'probe')`, u, today, s.id);
  check('... its accepted twin: exactly the worth (12 coins)', focusEvents(u).length === 1);
  refused('a closed session is history', () => run(`UPDATE focus_sessions SET closed_on = ? WHERE id = ?`, dates.addDaysToKey(today, 1), s.id), 'cannot be changed');
}

/* ══ GET /lifeos/days and GET /lifeos/stats ══════════════════════════════════════════════════════ */
console.log('\n── the statistics: days, weeks, habit bars, kcal, overview ────────────────────');
{
  // Sunday 2026-10-18 10:24 (progress-days' clock): yesterday settled at 10:00.
  at('2026-10-05T08:00:00Z');
  const u = account('stats');
  const h = habitsTx.createHabitTx({ userId: u, input: { kind: 'good', name: 'Reggeli nyújtás' }, clientKey: key() }).habit.id;
  // Days 5..17: the habit done on every day but the 7th (missed) and the 9th (half of a 2-count target is not possible here: target 1).
  const settleNow = () => {
    const st = core.lifeosSettleStateQuery({ userId: u });
    if (st.due.lapse.length) core.markLapsedDaysTx({ userId: u });
    for (const d of st.due.close) core.closeLifeDayTx({ userId: u, localDate: d, requestId: 'probe' });
  };
  for (let i = 0; i < 13; i += 1) {
    const day = dates.addDaysToKey('2026-10-05', i);
    at(`${day}T08:00:00Z`);
    settleNow();
    if (day !== '2026-10-07') habitsTx.setHabitCountTx({ userId: u, habitId: h, localDate: day, count: 1 });
    if (day === '2026-10-15') {
      const t = tasksTx.createTaskTx({ userId: u, input: { title: 'nagy nap', points: 50 }, clientKey: key() });
      tasksTx.completeTaskTx({ userId: u, taskId: t.task.id, requestId: 'probe' });
    }
  }
  at('2026-10-18T08:24:00Z');
  settleNow();
  const r = statsTx.lifeosStatsQuery({ userId: u, days: 14, weeks: 4 });
  check('stats: started, today = 2026-10-18 (a Sunday), 14 day columns ending today', r.started && r.today === '2026-10-18' && r.days.length === 14 && r.days[13].date === '2026-10-18' && r.days[0].date === '2026-10-05');
  check('the 7th (missed) is a negative column: -5', r.days.find((d) => d.date === '2026-10-07').netMinor === -500, `${r.days.find((d) => d.date === '2026-10-07').netMinor}`);
  const weekNet = r.days.filter((d) => d.date >= '2026-10-12').reduce((n, d) => n + d.netMinor, 0);
  check('EZEN A HÉTEN = the sum of Mon..Sun, average over 7 days', r.week.netMinor === weekNet && r.week.daysElapsed === 7 && r.week.avgPerDayMinor === Math.round(weekNet / 7) && r.week.from === '2026-10-12');
  check('previous week = the sum of 5..11', r.week.prevWeekNetMinor === r.days.filter((d) => d.date <= '2026-10-11').reduce((n, d) => n + d.netMinor, 0));
  check('HETEK: 4 rows, newest first, week 42 = okt. 12–18, the current one', r.weeks.length === 4 && r.weeks[0].isoWeek === 42 && r.weeks[0].weekStart === '2026-10-12' && r.weeks[0].weekEnd === '2026-10-18' && r.weeks[0].current && r.weeks[1].isoWeek === 41);
  check('week 41 counts its penalty (the miss on the 7th)', r.weeks[1].penalties === 1, `${r.weeks[1].penalties}`);
  const bar = r.habits.rows.find((x) => x.id === h);
  check('SZOKÁSOK: the window is okt. 5–17 (13 settled days)', r.habits.from === '2026-10-05' && r.habits.to === '2026-10-17' && bar.cells.length === 13);
  check('the bar: done everywhere but the 7th (missed)', bar.cells.filter((c) => c.state === 'done').length === 12 && bar.cells.find((c) => c.date === '2026-10-07').state === 'missed', bar.cells.map((c) => c.state[0]).join(''));
  check('the streak after the miss: 10 days (8..17), x1.25 from 7', bar.streak.current === 10 && bar.streak.multiplierBp === 12500, JSON.stringify(bar.streak));
  check('KALÓRIA without a nutrition plan: 13 days, no target, nothing tracked, the penalty is the rule', r.kcal.days.length === 13 && r.kcal.targetKcal === null && r.kcal.trackedDays === 0 && r.kcal.penaltyMinor === 1000);
  check('overview: days tracked 13, the best streak 10 and its name', r.overview.daysTracked === 13 && r.overview.bestStreak?.days === 10 && r.overview.bestStreak.name === 'Reggeli nyújtás' && r.overview.activeStreaks.length === 1,
    JSON.stringify(r.overview));
  const wallet = core.walletQuery({ userId: u });
  check('overview agrees with the wallet (XP, level, balance)', r.overview.xp === wallet.xp && r.overview.level === wallet.level && r.overview.balanceMinor === wallet.balanceMinor);

  const days = statsTx.lifeosDaysQuery({ userId: u, from: null, to: null });
  check('GET /lifeos/days (no range): the last 14 logical days, today open, the rest closed', days.days.length === 14 && days.to === '2026-10-18'
    && days.days[13].status === 'open' && days.days.slice(0, 13).every((d) => d.status === 'closed'), days.days.map((d) => d.status[0]).join(''));
  const ranged = statsTx.lifeosDaysQuery({ userId: u, from: '2026-10-01', to: '2026-10-20' });
  check('a range across the start and into the future: before_start, closed, open, future', ranged.days[0].status === 'before_start' && ranged.days.find((d) => d.date === '2026-10-05').status === 'closed'
    && ranged.days.find((d) => d.date === '2026-10-19').status === 'future');
  check('a closed row carries the settled facts (habits 1/1 on the 6th, the task day earns +50)', ranged.days.find((d) => d.date === '2026-10-06').habitsDone === 1
    && ranged.days.find((d) => d.date === '2026-10-15').earnedMinor >= 5000);
  check('days are private: another account reads its own (empty) rows', statsTx.lifeosDaysQuery({ userId: account('stranger'), from: '2026-10-05', to: '2026-10-17' }).days.every((d) => d.netMinor === 0));
  const before = statsTx.lifeosStatsQuery({ userId: account('fresh', { zone: false }), days: 14, weeks: 4 });
  check('before the zone is set: started false, the overview still answers', before.started === false && before.overview.xp === 0 && before.days.length === 0);
}

db.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* the OS reclaims it */
}
console.log(`\n${failed ? 'PROBE FAILED' : 'PROBE OK'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
