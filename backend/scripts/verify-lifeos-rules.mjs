#!/usr/bin/env node
/**
 * verify-lifeos-rules — the f_app test vectors, run against the port.
 *
 * src/lifeos/dates.js and src/lifeos/rules.js port kytrack/f_app src/domain/{dates,points/*}.ts.
 * The vectors below are f_app's own tests/domain/{dates,rules,streak}.test.ts expectations, with
 * the two fractional rules in basis points (x1.25 -> 12500). On top of them: the DST days the
 * plan names (2026-03-29 and 2026-10-25, Europe/Budapest), where the port deliberately differs
 * from f_app (wall-clock day start, see dates.js), the settle moment of the economy sheet, the
 * level curve, the zod schema, and the seeded rule set in migration 031 against DEFAULT_RULES.
 * Phase 3 adds f_app's habits / dayClose (settleHabit) / streakFreeze / recurrence /
 * recurringTasks / tasks vectors against src/lifeos/{habits,recurrence,tasks}.js.
 *
 * Pure: no database. Run: npm run verify:lifeos-rules
 */
import fs from 'node:fs';
import * as d from '../src/lifeos/dates.js';
import * as r from '../src/lifeos/rules.js';

let passed = 0;
let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  ok ? (passed += 1) : (failed += 1);
};
const at = (iso) => new Date(iso);
const TZ = 'Europe/Budapest';

console.log('── f_app tests/domain/dates.test.ts ───────────────────────────────────────────');
eq('a normal daytime instant stays on its calendar day', d.dayKeyFor(at('2026-09-09T12:00:00Z'), TZ), '2026-09-09');
eq('02:30 local belongs to the previous logical day when the day starts at 04:00', d.dayKeyFor(at('2026-09-10T00:30:00Z'), TZ, 4), '2026-09-09');
eq('... and to its own day when the day starts at 00:00', d.dayKeyFor(at('2026-09-10T00:30:00Z'), TZ, 0), '2026-09-10');
eq('flips exactly at the day start hour', d.dayKeyFor(at('2026-09-10T02:00:00Z'), TZ, 4), '2026-09-10');
eq('one second before it is still the previous day', d.dayKeyFor(at('2026-09-10T01:59:59Z'), TZ, 4), '2026-09-09');
eq('addDaysToKey crosses a month', d.addDaysToKey('2026-01-31', 1), '2026-02-01');
eq('addDaysToKey crosses a year', d.addDaysToKey('2026-12-31', 1), '2027-01-01');
eq('addDaysToKey goes back over February', d.addDaysToKey('2026-03-01', -1), '2026-02-28');
eq('dayRange is inclusive', d.dayRange('2026-09-07', '2026-09-09'), ['2026-09-07', '2026-09-08', '2026-09-09']);
eq('an inverted dayRange is empty', d.dayRange('2026-09-09', '2026-09-08'), []);
eq('weekdayIndex: Monday = 0', d.weekdayIndex('2026-09-07'), 0);
eq('weekdayIndex: Sunday = 6', d.weekdayIndex('2026-09-13'), 6);
eq('isBitSet reads the schedule mask', [d.isBitSet(0b0011111, 0), d.isBitSet(0b0011111, 5), d.isBitSet(127, 6)], [true, false, true]);

console.log('\n── DST: 2026-03-29, Europe/Budapest (02:00 CET -> 03:00 CEST) ───────────────────');
eq('the day starts at 04:00 CEST = 02:00Z (wall clock, not 05:00 as elapsed hours would give)', d.dayStartInstant('2026-03-29', TZ, 4).toISOString(), '2026-03-29T02:00:00.000Z');
eq('03:59:59 CEST is still the 28th', d.dayKeyFor(at('2026-03-29T01:59:59Z'), TZ, 4), '2026-03-28');
eq('04:00 CEST is the 29th', d.dayKeyFor(at('2026-03-29T02:00:00Z'), TZ, 4), '2026-03-29');
eq('the logical 28th is 23 hours long', (d.dayStartInstant('2026-03-29', TZ, 4) - d.dayStartInstant('2026-03-28', TZ, 4)) / 3600000, 23);
eq('a 02:00 start falls in the gap and resolves to 03:00 CEST = 01:00Z', d.dayStartInstant('2026-03-29', TZ, 2).toISOString(), '2026-03-29T01:00:00.000Z');
eq('with a 02:00 start, 01:59:59 CET is the 28th', d.dayKeyFor(at('2026-03-29T00:59:59Z'), TZ, 2), '2026-03-28');
eq('with a 02:00 start, 03:00 CEST is the 29th', d.dayKeyFor(at('2026-03-29T01:00:00Z'), TZ, 2), '2026-03-29');
eq('the 28th settles at 10:00 CEST (08:00Z): one second before, the 27th is the newest', d.settledThroughFor(at('2026-03-29T07:59:59Z'), TZ, 4), '2026-03-27');
eq('... and at 08:00Z the 28th has settled', d.settledThroughFor(at('2026-03-29T08:00:00Z'), TZ, 4), '2026-03-28');
eq('the UTC offset is +60 before and +120 after', [d.offsetMs(at('2026-03-29T00:30:00Z'), TZ) / 60000, d.offsetMs(at('2026-03-29T01:30:00Z'), TZ) / 60000], [60, 120]);

console.log('\n── DST: 2026-10-25, Europe/Budapest (03:00 CEST -> 02:00 CET) ───────────────────');
eq('the day starts at 04:00 CET = 03:00Z', d.dayStartInstant('2026-10-25', TZ, 4).toISOString(), '2026-10-25T03:00:00.000Z');
eq('03:59:59 CET is still the 24th', d.dayKeyFor(at('2026-10-25T02:59:59Z'), TZ, 4), '2026-10-24');
eq('04:00 CET is the 25th', d.dayKeyFor(at('2026-10-25T03:00:00Z'), TZ, 4), '2026-10-25');
eq('the logical 24th is 25 hours long', (d.dayStartInstant('2026-10-25', TZ, 4) - d.dayStartInstant('2026-10-24', TZ, 4)) / 3600000, 25);
eq('a 02:00 start happens twice and resolves to the EARLIER one (02:00 CEST = 00:00Z)', d.dayStartInstant('2026-10-25', TZ, 2).toISOString(), '2026-10-25T00:00:00.000Z');
eq('the repeated 02:30 (CET, 01:30Z) stays on the 25th', d.dayKeyFor(at('2026-10-25T01:30:00Z'), TZ, 2), '2026-10-25');
eq('the 24th settles at 10:00 CET (09:00Z)', [d.settledThroughFor(at('2026-10-25T08:59:59Z'), TZ, 4), d.settledThroughFor(at('2026-10-25T09:00:00Z'), TZ, 4)], ['2026-10-23', '2026-10-24']);
eq('the calendar key and the wall clock are read in the zone', [d.calendarKeyFor(at('2026-10-24T22:30:00Z'), TZ), d.localTime(at('2026-10-24T22:30:00Z'), TZ)], ['2026-10-25', '00:30']);

console.log('\n── the catch-up window ─────────────────────────────────────────────────────────');
eq('nothing is due before LifeOS starts', d.dueDays({ lastClosed: null, startedOn: null, settledThrough: '2026-10-10' }), { close: [], lapse: [] });
eq('the start day itself is the first due day', d.dueDays({ lastClosed: null, startedOn: '2026-10-09', settledThrough: '2026-10-10' }), { lapse: [], close: ['2026-10-09', '2026-10-10'] });
const long = d.dueDays({ lastClosed: '2026-09-30', startedOn: '2026-09-01', settledThrough: '2026-10-10' });
eq('ten due days: the newest 7 close, the 3 older lapse', [long.lapse, long.close.length, long.close[0]], [['2026-10-01', '2026-10-02', '2026-10-03'], 7, '2026-10-04']);
eq('zones are validated by the runtime, not only the shape', [d.isValidTimeZone(TZ), d.isValidTimeZone('UTC'), d.isValidTimeZone('Mars/Olympus'), d.isValidTimeZone('Europe/../etc')], [true, true, false, false]);
eq('isDayKey refuses an impossible date', [d.isDayKey('2026-02-28'), d.isDayKey('2026-02-30')], [true, false]);

console.log('\n── f_app tests/domain/rules.test.ts ───────────────────────────────────────────');
eq('habit: full base when the target is reached', [r.habitPoints({ count: 1, target: 1 }), r.habitPoints({ count: 9, target: 8 })], [10, 10]);
eq('habit: the streak multiplier, rounded (x1.25 = 12500 bp, x1.5 = 15000 bp)', [r.habitPoints({ count: 1, target: 1, multiplierBp: 12500 }), r.habitPoints({ count: 1, target: 1, multiplierBp: 15000 })], [13, 15]);
eq('habit: proportional from 50 %, floored', [r.habitPoints({ count: 4, target: 8 }), r.habitPoints({ count: 5, target: 8 })], [5, 6]);
eq('habit: nothing below 50 %', [r.habitPoints({ count: 3, target: 8 }), r.habitPoints({ count: 0, target: 1 })], [0, 0]);
eq('habit: a zero target is tolerated', r.habitPoints({ count: 1, target: 0 }), 10);
eq('relapse: double the habit penalty', [r.relapsePenalty({ alreadyLostToday: 0 }), r.relapsePenalty({ penalty: 8, alreadyLostToday: 0 })], [10, 16]);
eq('relapse: the daily loss is capped at 30', [20, 25, 30].map((x) => r.relapsePenalty({ alreadyLostToday: x })), [10, 5, 0]);
eq('relapseTotal is capped', [r.relapseTotal(1, 5), r.relapseTotal(9, 5)], [10, 30]);
eq('task: priority maps to 5 / 10 / 20', [1, 2, 3].map((priority) => r.taskPoints({ priority, late: false })), [5, 10, 20]);
eq('task: late halves, and an override is respected', [r.taskPoints({ priority: 3, late: true }), r.taskPoints({ priority: 1, override: 15, late: true })], [10, 7]);
eq('workout: full at >= 80 %, half at 50-79 %, none below', [100, 80, 79, 50, 49].map((completionPct) => r.workoutPoints({ completionPct })), [30, 30, 15, 15, 0]);
eq('kcal: hit within tolerance, over above, under below, no_data when empty', [
  r.evaluateKcal({ eaten: 2050, target: 2000, tolerancePct: 10 }),
  r.evaluateKcal({ eaten: 2200, target: 2000, tolerancePct: 10 }),
  r.evaluateKcal({ eaten: 2201, target: 2000, tolerancePct: 10 }),
  r.evaluateKcal({ eaten: 1500, target: 2000, tolerancePct: 10 }),
  r.evaluateKcal({ eaten: 0, target: 2000, tolerancePct: 10 }),
  r.evaluateKcal({ eaten: 1800, target: null, tolerancePct: 10 }),
], ['hit', 'hit', 'over', 'under', 'no_data', 'no_data']);
eq('kcal works the same in x10 units (the worker passes kcal x10)', r.evaluateKcal({ eaten: 22010, target: 20000, tolerancePct: 10 }), 'over');
eq('applyMultiplier never goes negative', r.applyMultiplierBp(-10, 15000), 0);

console.log('\n── f_app tests/domain/streak.test.ts ──────────────────────────────────────────');
eq('multiplier tiers at 7 and 30 days', [0, 6, 7, 29, 30, 365].map((s) => r.multiplierBpFor(s)), [10000, 10000, 12500, 12500, 15000, 15000]);
eq('done / clean increment and track the best', [r.nextStreak({ current: 0, best: 0 }, 'done'), r.nextStreak({ current: 4, best: 10 }, 'clean')], [{ current: 1, best: 1 }, { current: 5, best: 10 }]);
eq('missed / relapse reset and keep the best', [r.nextStreak({ current: 12, best: 12 }, 'missed'), r.nextStreak({ current: 3, best: 40 }, 'relapse')], [{ current: 0, best: 12 }, { current: 0, best: 40 }]);
eq('skipped leaves the streak alone', r.nextStreak({ current: 5, best: 9 }, 'skipped'), { current: 5, best: 9 });
eq('milestones pay exactly at 7 / 30 / 100', [7, 30, 100, 8, 0].map((s) => r.milestoneBonus(s)), [25, 100, 500, 0, 0]);
eq('a freeze is earned every 30 days', [29, 30, 60].map((s) => r.freezeEarned(s)), [0, 1, 1]);

console.log('\n── levels, the economy sheet, the schema ──────────────────────────────────────');
eq('level = floor(sqrt(xp / 100)); the Érmék frame: 2158 XP is level 4, next at 2500', [r.levelFor(2158), r.levelProgress(2158)], [4, { level: 4, floorXp: 1600, nextXp: 2500 }]);
eq('the economy sheet: 1 point = 1 coin = 100 minor, daily cap 400 coins', [r.pointsToMinor(1), r.DEFAULT_RULES.dailyEarnCap], [100, 400]);
eq('the settle delay is 6 h and the catch-up 7 days', [d.SETTLE_DELAY_MS / 3600000, d.CATCH_UP_DAYS], [6, 7]);
eq('DEFAULT_RULES passes its own schema', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES }).success, true);
eq('an unknown key is refused (.strict())', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES, bonus: 1 }).success, false);
eq('a missing key is refused', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES, perfectDay: undefined }).success, false);
eq('a fractional value is refused (basis points are integers)', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES, streakTier1MultBp: 12500.5 }).success, false);
eq('an out-of-range value is refused', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES, dailyEarnCap: 10001 }).success, false);
eq('half > full is refused', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES, workoutHalfPct: 90 }).success, false);
eq('tier 2 < tier 1 is refused', r.pointRulesSchema.safeParse({ ...r.DEFAULT_RULES, streakTier2Days: 5 }).success, false);

const sql = fs.readFileSync('src/db/migrations/031_lifeos_core.sql', 'utf8');
const seeded = JSON.parse(/VALUES \(1, json\('([\s\S]*?)'\)/.exec(sql)[1]);
eq('migration 031 seeds exactly DEFAULT_RULES as version 1', Object.entries(seeded).sort(), Object.entries(r.DEFAULT_RULES).sort());
eq('every rule key has a range, and only those', Object.keys(r.RULE_RANGES).sort(), Object.keys(r.DEFAULT_RULES).sort());

/* ══ Phase 3 (package B-habits-tasks): habits, the day-close settlement, recurrence, tasks ══════ */
const h = await import('../src/lifeos/habits.js');
const rec = await import('../src/lifeos/recurrence.js');
const tk = await import('../src/lifeos/tasks.js');
const R = r.DEFAULT_RULES;
const good = (o = {}) => ({ kind: 'good', scheduleType: 'daily', weekdayMask: 127, timesPerWeek: null, targetCount: 1, pointsSuccess: 10, pointsPenalty: 5, ...o });
const bad = (o = {}) => ({ kind: 'bad', scheduleType: 'daily', weekdayMask: 127, timesPerWeek: null, targetCount: 1, pointsSuccess: 15, pointsPenalty: 5, ...o });
const S = (current = 0, best = current, freezes = 0, weekStreak = 0) => ({ current, best, freezes, weekStreak });
const settle = (habit, log, state, date = '2026-09-09', weekDone = 0) => h.settleHabitDay({ habit, log, state, date, weekDone }, R);
const coins = (x) => x.coins.map((c) => `${c.reason}:${c.points}`);

console.log('\n── f_app tests/domain/habits.test.ts ──────────────────────────────────────────');
eq('schedules by type and weekday mask (Wed 2026-09-09, Sat the 12th)', [
  h.isScheduledOn({ scheduleType: 'daily', weekdayMask: 0 }, '2026-09-09'),
  h.isScheduledOn({ scheduleType: 'weekdays', weekdayMask: 0b0011111 }, '2026-09-09'),
  h.isScheduledOn({ scheduleType: 'weekdays', weekdayMask: 0b0011111 }, '2026-09-12'),
  h.isScheduledOn({ scheduleType: 'times_per_week', weekdayMask: 0 }, '2026-09-12'),
], [true, true, false, true]);
eq('a ticked simple habit pays 10 at its close', coins(settle(good(), { count: 1, status: 'done' }, S())), ['habit.done:10']);
eq('a counted habit pays proportionally: 3/8 nothing, 4/8 five, 8/8 ten', [3, 4, 8].map((count) => h.goodHabitPreview({ count, target: 8, base: 10, streak: 0 }, R)), [0, 5, 10]);
eq('the log status follows the count', [h.goodStatusFor(7, 8), h.goodStatusFor(8, 8)], ['pending', 'done']);
eq('the streak multiplier at a 7-day streak: 13', coins(settle(good(), { count: 1, status: 'done' }, S(7))), ['habit.done:13']);
const sk = settle(good(), { count: 0, status: 'skipped' }, S(3));
eq('skip: no coins, no penalty, streak kept', [sk.outcome, coins(sk), sk.state.current], ['skipped', [], 3]);
eq('relapse: -10 per event, capped at -30', [1, 3, 4].map((count) => coins(settle(bad(), { count, status: 'relapse' }, S()))[0]), ['habit.relapse:-10', 'habit.relapse:-30', 'habit.relapse:-30']);
eq('a clean day adds one to the bad habit streak (the clean-day count)', settle(bad(), null, S(12)).state.current, 13);

console.log('\n── f_app tests/domain/dayClose.test.ts (settleHabit) ──────────────────────────');
const ms = settle(good(), null, S(4, 9));
eq('missed good habit: -5, streak 0, best kept', [coins(ms), ms.state], [['habit.missed:-5'], { current: 0, best: 9, freezes: 0, weekStreak: 0 }]);
const cl = settle(bad(), null, S());
eq('clean bad habit: +15, streak +1, counted as done', [coins(cl), cl.counted], [['habit.clean_day:15'], 'done']);
eq('relapse resets the bad-habit streak and keeps the best', settle(bad(), { count: 1, status: 'relapse' }, S(12)).state, { current: 0, best: 12, freezes: 0, weekStreak: 0 });
eq('skipped is excluded from the perfect day', sk.counted, 'excluded');
eq('the 7-day milestone pays 25 (its own reason, outside the cap)', coins(settle(good(), { count: 1, status: 'done' }, S(6))), ['habit.done:10', 'streak.milestone:25']);
eq('the 30-day milestone pays 100 and the day pays x1.25 (streak 29 before it)', coins(settle(good(), { count: 1, status: 'done' }, S(29))), ['habit.done:13', 'streak.milestone:100']);
eq('the 100-day milestone pays 500', coins(settle(good(), { count: 1, status: 'done' }, S(99))).at(-1), 'streak.milestone:500');
eq('a partial count pays its share and is still a miss (f_app keeps the tap credit)', coins(settle(good({ targetCount: 8 }), { count: 4, status: 'pending' }, S())), ['habit.done:5', 'habit.missed:-5']);
const tpw = good({ scheduleType: 'times_per_week', timesPerWeek: 3 });
const op = settle(tpw, null, S());
eq('times-per-week, weekday, not done: open, no penalty, excluded', [op.outcome, coins(op), op.counted], ['open', [], 'excluded']);
const sun = settle(tpw, null, S(1), '2026-09-13', 1);
eq('times-per-week, Sunday, 1 of 3: -5 once, streak 0, quota 0', [coins(sun), sun.state.current, sun.quotaMet], [['habit.missed:-5'], 0, 0]);
const met = settle(tpw, { count: 1, status: 'done' }, S(2, 2, 0, 3), '2026-09-13', 3);
eq('times-per-week, Sunday, quota met: a week is counted', [met.quotaMet, met.weekStreakAfter], [1, 4]);

console.log('\n── f_app tests/domain/streakFreeze.test.ts ────────────────────────────────────');
const f30 = settle(good(), { count: 1, status: 'done' }, S(29));
eq('the 30th day grants a freeze', [f30.state.freezes, f30.freezeEarned], [1, 1]);
eq('freezes are capped at maxFreezes (2)', settle(good(), { count: 1, status: 'done' }, S(59, 59, 2)).state.freezes, 2);
const fz = settle(good(), null, S(31, 31, 1));
eq('a miss spends the freeze: no penalty, streak kept, excluded', [fz.outcome, coins(fz), fz.state, fz.counted], ['frozen', [], { current: 31, best: 31, freezes: 0, weekStreak: 0 }, 'excluded']);
const f0 = settle(good(), null, S(0, 0, 1));
eq('never spends a freeze on a zero streak', [coins(f0), f0.state.freezes], [['habit.missed:-5'], 1]);

console.log('\n── f_app tests/domain/recurrence.test.ts ──────────────────────────────────────');
eq('parses and rejects rules', [
  rec.parseRecurrence('{"type":"daily"}'),
  rec.parseRecurrence('{"type":"weekly","weekdayMask":31}'),
  rec.parseRecurrence('{"type":"monthly","day":31}'),
  rec.parseRecurrence('{"type":"weekly","weekdayMask":0}'),
  rec.parseRecurrence('{"type":"monthly","day":0}'),
  rec.parseRecurrence('{"type":"daily","interval":0}'),
  rec.parseRecurrence('not json'),
  rec.parseRecurrence(null),
], [{ type: 'daily' }, { type: 'weekly', weekdayMask: 31 }, { type: 'monthly', day: 31 }, null, null, null, null, null]);
eq('serializes canonically', [rec.serializeRecurrence({ type: 'daily', interval: 3 }), rec.serializeRecurrence(null)], ['{"type":"daily","interval":3}', null]);
eq('an unknown key in a rule is refused (.strict())', rec.recurrenceSchema.safeParse({ type: 'daily', every: 2 }).success, false);
const r3 = { type: 'daily', interval: 3 };
eq('daily with interval counts from the anchor', [rec.occursOn(r3, '2026-09-01', '2026-09-01'), rec.occursOn(r3, '2026-09-01', '2026-09-02'), rec.occursOn(r3, '2026-09-01', '2026-09-04'), rec.occursOn(r3, '2026-09-01', '2026-08-29')], [true, false, true, false]);
eq('... occurrencesBetween respects the anchor', rec.occurrencesBetween(r3, '2026-09-01', '2026-08-30', '2026-09-08'), ['2026-09-01', '2026-09-04', '2026-09-07']);
const mw = { type: 'weekly', weekdayMask: 0b0000101 };
eq('weekly uses the Monday-based mask', [rec.occurrencesBetween(mw, '2026-09-07', '2026-09-07', '2026-09-13'), rec.nextOccurrence(mw, '2026-09-07', '2026-09-09')], [['2026-09-07', '2026-09-09'], '2026-09-14']);
const m31 = { type: 'monthly', day: 31 };
eq('monthly clamps to short months', [rec.occursOn(m31, '2026-01-31', '2026-02-28'), rec.occursOn(m31, '2026-01-31', '2026-03-31'), rec.occursOn(m31, '2026-01-31', '2026-04-30'), rec.occursOn(m31, '2026-01-31', '2026-04-29'), rec.nextOccurrence(m31, '2026-01-31', '2026-01-31')], [true, true, true, false, '2026-02-28']);

console.log('\n── f_app tests/domain/recurringTasks.test.ts (the materializer plan) ──────────');
eq('a daily template owes today .. today + 7', tk.daysToMaterialize({ rule: { type: 'daily' }, anchor: '2026-09-09', today: '2026-09-09', existingDays: [] }).length, 8);
eq('... and nothing once they exist (idempotent)', tk.daysToMaterialize({ rule: { type: 'daily' }, anchor: '2026-09-09', today: '2026-09-09', existingDays: ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'] }), []);
eq('weekly respects the mask and the anchor (Thursdays from the 10th)', tk.daysToMaterialize({ rule: { type: 'weekly', weekdayMask: 0b0001000 }, anchor: '2026-09-10', today: '2026-09-09', existingDays: [] }), ['2026-09-10']);
eq('a deleted occurrence is not re-created (it still has its day)', tk.daysToMaterialize({ rule: { type: 'daily' }, anchor: '2026-09-09', today: '2026-09-12', existingDays: ['2026-09-12'] })[0], '2026-09-13');

console.log('\n── f_app tests/domain/tasks.test.ts ───────────────────────────────────────────');
const T = (o) => ({ id: 1, priority: 2, points: null, dueOn: null, dueTime: null, recurrence: null, completedOn: null, ...o });
eq('on time by priority, late halves, the override is respected', [tk.taskPayout(T({ priority: 3 }), false, R), tk.taskPayout(T({}), true, R), tk.taskPayout(T({ points: 50 }), false, R)], [20, 5, 50]);
eq('a 02:30 due time on the logical 9th falls on the calendar 10th (00:30Z)', new Date(tk.taskDueInstant({ dueOn: '2026-09-09', dueTime: '02:30' }, TZ, 4)).toISOString(), '2026-09-10T00:30:00.000Z');
eq('late after the due instant, on time before', [tk.isLate(T({ dueOn: '2026-09-09', dueTime: '16:00' }), Date.parse('2026-09-09T10:00:00Z'), TZ, 4), tk.isLate(T({ dueOn: '2026-09-08', dueTime: '10:00' }), Date.parse('2026-09-09T10:00:00Z'), TZ, 4)], [false, true]);
eq('a date-only task is late from the next logical day; an undated one never', [tk.isLate(T({ dueOn: '2026-09-09' }), Date.parse('2026-09-09T21:00:00Z'), TZ, 4), tk.isLate(T({ dueOn: '2026-09-09' }), Date.parse('2026-09-10T03:00:00Z'), TZ, 4), tk.isLate(T({}), Date.parse('2030-01-01T00:00:00Z'), TZ, 4)], [false, true, false]);
const list = [
  T({ id: 1, dueOn: '2026-09-09', dueTime: '18:00' }),
  T({ id: 2, dueOn: '2026-09-09', dueTime: '06:00', priority: 1 }),
  T({ id: 3, dueOn: '2026-09-07', dueTime: '12:00' }),
  T({ id: 4, priority: 3 }),
  T({ id: 5, dueOn: '2026-09-10' }),
  T({ id: 6, completedOn: '2026-09-09' }),
  T({ id: 7, dueOn: '2026-09-09', recurrence: '{"type":"daily"}' }),
  T({ id: 8, dueOn: '2026-09-09' }),
];
const bk = tk.bucketTasks(list, '2026-09-09');
eq('buckets a day: due by time (date-only last), overdue, anytime, completed; templates never', [bk.due.map((t) => t.id), bk.overdue.map((t) => t.id), bk.anytime.map((t) => t.id), bk.completed.map((t) => t.id)], [[2, 1, 8], [3], [4], [6]]);
eq('the item caps (plan L8): 20 live habits, 300 open tasks', [r.LIFEOS_LIMITS.habits, r.LIFEOS_LIMITS.openTasks], [20, 300]);

console.log(`\n${failed ? 'PROBE FAILED' : 'PROBE OK'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
