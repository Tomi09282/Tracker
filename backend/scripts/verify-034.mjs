#!/usr/bin/env node
/**
 * verify-034 — the calendar (migration 034), through the REAL modules against a throwaway
 * encrypted database:
 *
 *   1. every guard the migration adds, refused once with ITS OWN message, next to the accepted twin
 *      of each refused write (a guard that refuses everything cannot pass);
 *   2. the occurrence engine (src/lifeos/occurrences.js) on f_app's events vectors and on the DST
 *      days that f_app never tests: 2026-03-29 (spring forward) and 2026-10-25 (fall back) in
 *      Europe/Budapest — a weekly event keeps its LOCAL time, a nonexistent 02:30 resolves after the
 *      gap, a doubled 02:30 resolves to the earlier instant, an all-day event is one day however
 *      long the day is;
 *   3. the event transactions: zone required, replay, bounds, the item cap, ownership (IDOR);
 *   4. GET /calendar's merge of event occurrences, tasks and scheduled workouts;
 *   5. materializeRemindersTx: event offsets, habit reminder times, tasks due within 60 min, the
 *      6 h window, the superseded offsets and THE DEDUPE (a second run delivers nothing).
 *
 * Run: npm run verify:034
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-verify-034-'));
process.env.DB_PATH = path.join(tmpDir, 'v034.db');

// THE CLOCK. Set before anything reads it: the transactions read "now" from Date.now().
let NOW = Date.parse('2026-10-21T08:00:00Z'); // Wednesday 10:00 CEST
Date.now = () => NOW;
const at = (iso) => {
  NOW = Date.parse(iso);
};

const { getDb } = await import('../src/db/conn.js');
const worker = await import('../src/db/worker.js');
const core = await import('../src/db/tx/lifeos.js');
const habitsTx = await import('../src/db/tx/lifeos-habits.js');
const tasksTx = await import('../src/db/tx/lifeos-tasks.js');
const ev = await import('../src/db/tx/lifeos-events.js');
const dates = await import('../src/lifeos/dates.js');
const occ = await import('../src/lifeos/occurrences.js');
const events = await import('../src/lifeos/events.js');

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
    check(label, msg.includes(expect), msg.slice(0, 110));
  }
};
const accepted = (label, fn) => {
  try {
    fn();
    check(label, true);
  } catch (e) {
    check(label, false, String(e.message).slice(0, 110));
  }
};
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

const TZ = 'Europe/Budapest';
let seq = 0;
const key = () => `key-${(seq += 1).toString().padStart(6, '0')}`;
const iso = (s) => new Date(s * 1000).toISOString();

function account(label, { zone = true } = {}) {
  const id = Number(run(`INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'user')`, `${label}-${(seq += 1)}@probe.test`).lastInsertRowid);
  if (zone) {
    const p = core.setUserPrefsTx({ userId: id, timezone: TZ, requestId: 'probe' });
    if (p.outcome !== 'applied') throw new Error(`prefs: ${p.outcome}`);
  }
  return id;
}
const create = (userId, input) => ev.createEventTx({ userId, input, clientKey: key() });
const made = (userId, input) => {
  const r = create(userId, input);
  if (r.outcome !== 'created') throw new Error(`createEvent: ${r.outcome}`);
  return r.event;
};

const version = one('PRAGMA user_version').user_version;
check('migration 034 applied (user_version >= 34)', version >= 34, `user_version ${version}`);

/* ══ 1. the schema guards ═══════════════════════════════════════════════════════════════════════ */
console.log('\n── 1. migration 034 guards ──────────────────────────────────────────────────────');
const owner = account('owner');
const other = account('other');
const ins = (over = {}) => {
  const r = {
    user_id: owner, title: 'Fogorvos', notes: null, location: null, all_day: 0,
    start_at: 1_800_000_000, end_at: 1_800_002_700, start_local: '2027-01-15T09:00', tz: TZ,
    recurrence_json: null, until_date: null, client_key: key(), ...over,
  };
  return Number(run(
    `INSERT INTO events (user_id, title, notes, location, all_day, start_at, end_at, start_local, tz, recurrence_json, until_date, client_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.user_id, r.title, r.notes, r.location, r.all_day, r.start_at, r.end_at, r.start_local, r.tz, r.recurrence_json, r.until_date, r.client_key,
  ).lastInsertRowid);
};
let probeId;
accepted('a well-formed event row is accepted (the twin of every refusal below)', () => {
  probeId = ins();
});
refused('a blank title is refused', () => ins({ title: '' }), 'CHECK');
refused('an untrimmed title is refused', () => ins({ title: ' x' }), 'CHECK');
refused('a 121-character title is refused', () => ins({ title: 'x'.repeat(121) }), 'CHECK');
accepted('a 120-character title is accepted', () => ins({ title: 'x'.repeat(120) }));
refused('a 161-character location is refused', () => ins({ location: 'x'.repeat(161) }), 'CHECK');
refused('1001 characters of notes are refused', () => ins({ notes: 'x'.repeat(1001) }), 'CHECK');
refused('all_day = 2 is refused', () => ins({ all_day: 2 }), 'CHECK');
refused('a fractional start instant is refused', () => ins({ start_at: 1.5 }), 'CHECK');
refused('an end before the start is refused', () => ins({ end_at: 1_799_999_999 }), 'CHECK');
refused('an event of 14 days + 1 h + 1 s is refused', () => ins({ end_at: 1_800_000_000 + 14 * 86400 + 3601 }), 'CHECK');
accepted('an event of exactly 14 days + 1 h is accepted (a DST change inside an all-day run)', () => ins({ end_at: 1_800_000_000 + 14 * 86400 + 3600 }));
refused('a malformed start_local is refused', () => ins({ start_local: '2027-01-15 09:00' }), 'CHECK');
refused('an impossible date in start_local is refused', () => ins({ start_local: '2027-02-30T09:00' }), 'CHECK');
refused('a 24:00 start_local is refused', () => ins({ start_local: '2027-01-15T24:00' }), 'CHECK');
refused('a zone with a forbidden character is refused', () => ins({ tz: "Europe/Bu'dapest" }), 'CHECK');
refused('recurrence that is not JSON is refused', () => ins({ recurrence_json: '{type:daily' }), 'CHECK');
refused('an unknown recurrence type is refused', () => ins({ recurrence_json: '{"type":"hourly"}' }), 'CHECK');
accepted('a yearly rule is accepted', () => ins({ recurrence_json: '{"type":"yearly"}' }));
refused('an until date without a rule is refused', () => ins({ until_date: '2027-03-01' }), 'CHECK');
refused('an until date before the first day is refused', () => ins({ recurrence_json: '{"type":"daily"}', until_date: '2027-01-14' }), 'CHECK');
accepted('an until date on the first day is accepted', () => ins({ recurrence_json: '{"type":"daily"}', until_date: '2027-01-15' }));
refused('an all-day event that does not start at 00:00 is refused', () => ins({ all_day: 1, end_at: 1_800_000_000 + 86400 }), 'CHECK');
refused('an all-day event shorter than 23 h is refused', () => ins({ all_day: 1, start_local: '2027-01-15T00:00', end_at: 1_800_000_000 + 3600 }), 'CHECK');
accepted('an all-day day of 23 h (spring forward) is accepted', () => ins({ all_day: 1, start_local: '2027-01-15T00:00', end_at: 1_800_000_000 + 82800 }));
refused('a client key with a colon is refused', () => ins({ client_key: 'buy:12345678' }), 'CHECK');
refused('a reused client key is refused', () => ins({ client_key: one('SELECT client_key k FROM events WHERE id = ?', probeId).k }), 'UNIQUE');
refused('an event cannot change owner', () => run('UPDATE events SET user_id = ? WHERE id = ?', other, probeId), 'keeps its owner');
accepted('an event can change its title', () => run(`UPDATE events SET title = 'Fogorvos 2' WHERE id = ?`, probeId));

console.log('\n── event_reminders ──');
const rem = (eventId, offset, userId = owner) => run('INSERT INTO event_reminders (event_id, user_id, offset_minutes) VALUES (?, ?, ?)', eventId, userId, offset);
refused('a reminder addressed to another account is refused', () => rem(probeId, 15, other), 'owner');
accepted('four reminders are accepted', () => [0, 15, 60, 1440].forEach((o) => rem(probeId, o)));
refused('a fifth reminder is refused', () => rem(probeId, 30), 'at most four');
const probe2 = ins();
refused('the same offset twice is refused', () => {
  rem(probe2, 15);
  rem(probe2, 15);
}, 'UNIQUE');
refused('an offset over a week is refused', () => rem(probe2, 10081), 'CHECK');
refused('a reminder is not edited', () => run('UPDATE event_reminders SET offset_minutes = 5 WHERE event_id = ?', probe2), 'replaced');

console.log('\n── reminder_deliveries ──');
const habitId = habitsTx.createHabitTx({ userId: owner, input: { kind: 'good', name: 'Nyújtás', reminderTime: '21:30' }, clientKey: key() }).habit.id;
const nid = (userId = owner, link = null) => Number(run(`INSERT INTO notifications (user_id, coach_client_id, type, title) VALUES (?, ?, 'lifeos.event', 't')`, userId, link).lastInsertRowid);
const deliver = (over = {}) => {
  const r = { user_id: owner, kind: 'event', event_id: probeId, habit_id: null, task_id: null, occurrence_at: 1_800_000_000, offset_minutes: 15, fire_at: 1_800_000_000 - 900, notification_id: null, ...over };
  return run(
    `INSERT INTO reminder_deliveries (user_id, kind, event_id, habit_id, task_id, occurrence_at, offset_minutes, fire_at, notification_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.user_id, r.kind, r.event_id, r.habit_id, r.task_id, r.occurrence_at, r.offset_minutes, r.fire_at, r.notification_id,
  );
};
let deliveryId;
accepted('a well-formed delivery is accepted', () => {
  deliveryId = Number(deliver({ notification_id: nid() }).lastInsertRowid);
});
refused('THE DEDUPE: the same (event, occurrence, offset) twice is refused', () => deliver(), 'UNIQUE');
accepted('another offset of the same occurrence is its own delivery', () => deliver({ offset_minutes: 60, fire_at: 1_800_000_000 - 3600 }));
// The owner trigger runs before the row CHECKs: a 'habit' row that names an event finds no habit of its owner.
refused('a kind that does not match its subject is refused', () => deliver({ kind: 'habit', occurrence_at: 1 }), "subject's owner");
refused('two subjects at once are refused', () => deliver({ habit_id: habitId, occurrence_at: 2 }), 'CHECK');
refused('a fire time that is not occurrence − offset is refused', () => deliver({ occurrence_at: 3, fire_at: 3 }), 'CHECK');
refused("a delivery about another account's event is refused", () => deliver({ user_id: other, occurrence_at: 4, fire_at: 4 - 900 }), "subject's owner");
accepted('a habit delivery is accepted', () => deliver({ kind: 'habit', event_id: null, habit_id: habitId, occurrence_at: 5, offset_minutes: 0, fire_at: 5 }));
refused("a notification addressed to someone else is refused", () => deliver({ occurrence_at: 6, fire_at: 6 - 900, notification_id: nid(other) }), 'addressed to its owner');
refused('a delivery is immutable', () => run('UPDATE reminder_deliveries SET fire_at = fire_at - 1 WHERE id = ?', deliveryId), 'already happened');
accepted('deleting the event takes its reminders and deliveries with it (FK cascade)', () => {
  run('DELETE FROM events WHERE id = ?', probeId);
  if (one('SELECT COUNT(*) n FROM event_reminders WHERE event_id = ?', probeId).n !== 0) throw new Error('reminders left');
  if (one('SELECT COUNT(*) n FROM reminder_deliveries WHERE event_id = ?', probeId).n !== 0) throw new Error('deliveries left');
});
run('DELETE FROM events WHERE user_id = ?', owner);
run('DELETE FROM reminder_deliveries WHERE user_id = ?', owner);
run('DELETE FROM notifications WHERE user_id IN (?, ?)', owner, other);

/* ══ 2. the occurrence engine ═══════════════════════════════════════════════════════════════════ */
console.log('\n── 2. occurrences (f_app events.test vectors + DST) ──────────────────────────────');
let pid = 0;
const mk = (input, extra = {}) => {
  const t = events.resolveEventTimes({ allDay: false, endTime: null, endDate: null, ...input }, TZ);
  if (!t) return null;
  return { id: (pid += 1), title: input.title ?? 'x', location: extra.location ?? null, allDay: Boolean(input.allDay), ...t, tz: TZ, recurrence: extra.recurrence ?? null, untilDate: extra.untilDate ?? null };
};
const on = (list, day) => occ.expandCalendar(list, day, 1, TZ).get(day);

{
  const e = mk({ title: 'Fogorvos', date: '2026-09-10', startTime: '09:30', endTime: '10:00' });
  check('f_app: 09:30 CEST is 07:30Z, listed on its calendar day only', iso(e.startAt) === '2026-09-10T07:30:00.000Z' && iso(e.endAt) === '2026-09-10T08:00:00.000Z' && on([e], '2026-09-10').length === 1 && on([e], '2026-09-09').length === 0);
  const late = mk({ date: '2026-09-10', startTime: '01:00' });
  check('f_app: a 01:00 event belongs to its CALENDAR day, not the logical day', on([late], '2026-09-10').length === 1 && on([late], '2026-09-09').length === 0);
  const trip = mk({ allDay: true, date: '2026-09-12', endDate: '2026-09-13' });
  check('f_app: a multi-day all-day event is on every day it spans (exclusive end: not on the 14th)', ['11', '12', '13', '14'].map((d) => on([trip], `2026-09-${d}`).length).join('') === '0110');
  const w = mk({ date: '2026-09-07', startTime: '18:00', endTime: '19:00' }, { recurrence: { type: 'weekly', weekdayMask: 0b101 } });
  const wed = on([w], '2026-09-09')[0];
  check('f_app: weekly Mon+Wed keeps its local start time (16:00Z on Wednesday)', wed && iso(wed.startAt) === '2026-09-09T16:00:00.000Z' && iso(wed.endAt) === '2026-09-09T17:00:00.000Z');
  check('f_app: not on Thursday, not before the anchor', on([w], '2026-09-10').length === 0 && on([w], '2026-09-02').length === 0);
  const after = on([w], '2026-10-26')[0];
  check('DST 2026-10-25: the weekly 18:00 is 17:00Z on Monday 26 October (still 18:00 local, still an hour)', after && iso(after.startAt) === '2026-10-26T17:00:00.000Z' && after.startTime === '18:00' && after.durationMinutes === 60);
  const before = on([w], '2026-03-30')[0];
  check('DST 2026-03-29 seen from a 2026-09 anchor: nothing before the anchor', before === undefined);
  const spring = mk({ date: '2026-03-23', startTime: '18:00', endTime: '19:00' }, { recurrence: { type: 'weekly', weekdayMask: 1 } });
  const s1 = on([spring], '2026-03-23')[0];
  const s2 = on([spring], '2026-03-30')[0];
  check('DST 2026-03-29: the weekly Monday 18:00 moves from 17:00Z to 16:00Z', iso(s1.startAt) === '2026-03-23T17:00:00.000Z' && iso(s2.startAt) === '2026-03-30T16:00:00.000Z' && s2.startTime === '18:00');
  const B = mk({ title: 'B', date: '2026-09-10', startTime: '14:00' });
  const A = mk({ title: 'A', date: '2026-09-10', startTime: '10:00' });
  const U = mk({ title: 'Ünnep', allDay: true, date: '2026-09-10' });
  check('f_app: all-day first, then by time', on([B, A, U], '2026-09-10').map((o) => o.title).join(',') === 'Ünnep,A,B');
}
{
  const gap = mk({ date: '2026-03-29', startTime: '02:30' });
  check('DST gap: 02:30 on 2026-03-29 does not exist and resolves to 03:30 CEST (01:30Z)', iso(gap.startAt) === '2026-03-29T01:30:00.000Z');
  const daily = mk({ date: '2026-03-27', startTime: '02:30', endTime: '03:00' }, { recurrence: { type: 'daily' } });
  const g = ['2026-03-28', '2026-03-29', '2026-03-30'].map((d) => on([daily], d)[0]);
  check('DST gap: a daily 02:30 is 01:30Z, then 01:30Z (03:30 CEST) on the 29th, then 00:30Z; 30 minutes each',
    iso(g[0].startAt) === '2026-03-28T01:30:00.000Z' && iso(g[1].startAt) === '2026-03-29T01:30:00.000Z' && g[1].startTime === '03:30'
      && iso(g[2].startAt) === '2026-03-30T00:30:00.000Z' && g.every((o) => o.durationMinutes === 30));
  const ov = mk({ date: '2026-10-23', startTime: '02:30', endTime: '03:00' }, { recurrence: { type: 'daily' } });
  const o = ['2026-10-24', '2026-10-25', '2026-10-26'].map((d) => on([ov], d)[0]);
  check('DST overlap: the doubled 02:30 on 2026-10-25 is the EARLIER instant (00:30Z, CEST); the day after is 01:30Z',
    iso(o[0].startAt) === '2026-10-24T00:30:00.000Z' && iso(o[1].startAt) === '2026-10-25T00:30:00.000Z' && iso(o[2].startAt) === '2026-10-26T01:30:00.000Z');
  check('DST overlap: the elapsed length is kept (30 min), so the wall clock reads 02:30-02:00', o[1].durationMinutes === 30 && o[1].endTime === '02:00');
  const ad = mk({ allDay: true, date: '2026-10-25' });
  check('DST: the all-day 25 October is 25 hours long and still one day', (ad.endAt - ad.startAt) === 25 * 3600 && on([ad], '2026-10-25').length === 1 && on([ad], '2026-10-26').length === 0 && on([ad], '2026-10-24').length === 0);
  const adr = mk({ allDay: true, date: '2026-03-28' }, { recurrence: { type: 'daily' } });
  const hours = ['2026-03-28', '2026-03-29', '2026-03-30'].map((d) => (on([adr], d)[0].endAt - on([adr], d)[0].startAt) / 3600);
  check('DST: a daily all-day event is 24 / 23 / 24 h around 2026-03-29, one occurrence per day', hours.join() === '24,23,24', hours.join());
}
{
  const y = mk({ allDay: true, date: '2028-02-29' }, { recurrence: { type: 'yearly' } });
  check('yearly: a 29 February birthday is on the 28th in a common year, on the 29th in a leap year',
    on([y], '2029-02-28').length === 1 && on([y], '2029-03-01').length === 0 && on([y], '2032-02-29').length === 1 && on([y], '2032-02-28').length === 0);
  const bea = mk({ allDay: true, title: 'Bea születésnapja', date: '2025-10-24' }, { recurrence: { type: 'yearly' } });
  check('yearly: calendar-2\'s birthday is on 24 October 2026', on([bea], '2026-10-24')[0]?.title === 'Bea születésnapja' && on([bea], '2026-10-23').length === 0);
  const m = mk({ date: '2026-01-31', startTime: '09:00' }, { recurrence: { type: 'monthly', day: 31 } });
  check('monthly 31: clamped to 28 February and 30 April', on([m], '2026-02-28').length === 1 && on([m], '2026-04-30').length === 1 && on([m], '2026-04-29').length === 0);
  const d3 = mk({ date: '2026-10-01', startTime: '07:00' }, { recurrence: { type: 'daily', interval: 3 } });
  check('daily every 3 days from the anchor', on([d3], '2026-10-04').length === 1 && on([d3], '2026-10-05').length === 0);
  const swim = mk({ title: 'Úszás', date: '2026-10-24', startTime: '09:00', endTime: '10:00' }, { recurrence: { type: 'weekly', weekdayMask: 1 << 5 }, untilDate: '2026-12-19' });
  check('until date: inclusive (19 December is the last Saturday, 26 December is not)', on([swim], '2026-12-19').length === 1 && on([swim], '2026-12-26').length === 0);
  check('event-detail\'s "még 9 alkalom": nine Saturdays left from Wednesday 21 October', occ.remainingOccurrences(swim, '2026-10-21') === 9);
  check('a one-off or open-ended event counts nothing down', occ.remainingOccurrences(mk({ date: '2026-10-24', startTime: '09:00' }), '2026-10-21') === null);
  const party = mk({ date: '2026-10-24', startTime: '22:00', endTime: '01:00' });
  const sat = on([party], '2026-10-24')[0];
  const sun = on([party], '2026-10-25')[0];
  check('an end time before the start ends after midnight: 3 h, on both days, the second marked startsBefore',
    (party.endAt - party.startAt) === 3 * 3600 && sat.endsAfter && !sat.startsBefore && sun.startsBefore && !sun.endsAfter);
  check('nothing longer than 14 days resolves', events.resolveEventTimes({ allDay: true, date: '2026-01-01', endDate: '2026-01-15' }, TZ) === null
    && events.resolveEventTimes({ allDay: true, date: '2026-01-01', endDate: '2026-01-14' }, TZ) !== null);
  check('an end before the start on a named end date does not resolve', events.resolveEventTimes({ allDay: false, date: '2026-10-24', startTime: '10:00', endTime: '09:00', endDate: '2026-10-24' }, TZ) === null);
  {
    // The worker's hand-written rule reader (event-times.js) and the route's zod schema (events.js)
    // must agree on every stored shape: the worker may not load zod schemas (event-times.js header).
    const rules = [
      { type: 'daily' }, { type: 'daily', interval: 1 }, { type: 'daily', interval: 30 }, { type: 'daily', interval: 0 },
      { type: 'daily', interval: 31 }, { type: 'daily', interval: 1.5 }, { type: 'daily', interval: '2' }, { type: 'daily', extra: 1 },
      { type: 'weekly', weekdayMask: 1 }, { type: 'weekly', weekdayMask: 127 }, { type: 'weekly', weekdayMask: 0 }, { type: 'weekly', weekdayMask: 128 },
      { type: 'weekly' }, { type: 'weekly', weekdayMask: 5, day: 3 }, { type: 'monthly', day: 1 }, { type: 'monthly', day: 31 },
      { type: 'monthly', day: 32 }, { type: 'monthly' }, { type: 'yearly' }, { type: 'yearly', day: 24 }, { type: 'hourly' }, {},
      [], null, 7, 'daily',
    ];
    const zodSays = (r) => {
      const p = events.eventRecurrenceSchema.safeParse(r);
      return p.success ? events.serializeEventRecurrence(p.data) : null;
    };
    const disagree = rules.filter((r) => {
      const mine = events.parseEventRecurrence(JSON.stringify(r));
      return (mine ? events.serializeEventRecurrence(mine) : null) !== zodSays(r);
    });
    check(`the worker's rule reader accepts exactly what the zod schema accepts (${rules.length} shapes)`, disagree.length === 0, JSON.stringify(disagree));
    check('a stored rule that is not JSON reads as no rule', events.parseEventRecurrence('{nope') === null && events.parseEventRecurrence(null) === null);
  }
  const meet = mk({ date: '2026-09-10', startTime: '09:30', endTime: '10:00' });
  const moved = events.mergeEventTimes(meet, { startTime: '11:00' }, TZ);
  check('a move that names no end keeps the length (11:00-11:30)', iso(moved.startAt) === '2026-09-10T09:00:00.000Z' && iso(moved.endAt) === '2026-09-10T09:30:00.000Z');
  const now = Date.parse('2026-10-21T08:00:00Z');
  const dinner = mk({ title: 'Vacsora Annával', date: '2026-10-21', startTime: '19:30' });
  const running = mk({ title: 'running', date: '2026-10-21', startTime: '09:00', endTime: '11:00' });
  check('next: the first occurrence that STARTS after now (a running one is not "next")', occ.nextOccurrence([swim, dinner, running], now, TZ)?.title === 'Vacsora Annával');
  check('next: within 7 days only', occ.nextOccurrence([mk({ date: '2026-11-21', startTime: '09:00' })], now, TZ) === null);
}

/* ══ 3. the transactions ════════════════════════════════════════════════════════════════════════ */
console.log('\n── 3. createEventTx / updateEventTx / deleteEventTx / eventQuery ─────────────────');
at('2026-10-21T08:00:00Z');
{
  const nz = account('nozone', { zone: false });
  check('no zone yet: TIMEZONE_REQUIRED, nothing written', create(nz, { title: 'x', date: '2026-10-21', startTime: '10:00' }).outcome === 'timezone_required'
    && one('SELECT COUNT(*) n FROM events WHERE user_id = ?', nz).n === 0);
  const u = account('cal');
  const k = key();
  const first = ev.createEventTx({ userId: u, input: { title: 'Fodrász', date: '2026-10-21', startTime: '16:00', endTime: '16:45', location: 'Hajszalon · Király utca 26.', reminders: [1440, 15] }, clientKey: k });
  check('create: 16:00-16:45 Budapest = 14:00Z-14:45Z, the reminders sorted', first.outcome === 'created' && iso(first.event.startAt) === '2026-10-21T14:00:00.000Z'
    && first.event.durationMinutes === 45 && first.event.reminders.join() === '15,1440' && first.event.timezone === TZ, JSON.stringify(first.event).slice(0, 120));
  const replay = ev.createEventTx({ userId: u, input: { title: 'Más', date: '2026-10-22', startTime: '09:00' }, clientKey: k });
  check('REPLAY: the same clientKey answers the first event whatever the body', replay.outcome === 'replayed' && replay.event.id === first.event.id && replay.event.title === 'Fodrász'
    && one('SELECT COUNT(*) n FROM events WHERE user_id = ?', u).n === 1);
  check('EXTREMES: a start more than ~10 years away is refused', create(u, { title: 'x', date: '2037-01-01', startTime: '10:00' }).outcome === 'invalid');
  check('EXTREMES: an until date more than ~10 years after the start is refused', create(u, { title: 'x', date: '2026-10-21', startTime: '10:00', recurrence: { type: 'daily' }, untilDate: '2036-12-01' }).outcome === 'invalid');
  check('EXTREMES: a 15-day event is refused', create(u, { title: 'x', date: '2026-10-21', allDay: true, endDate: '2026-11-04' }).outcome === 'invalid');
  const id = first.event.id;
  const intruder = account('intruder');
  check('IDOR: another account reads a 404 (null)', ev.eventQuery({ userId: intruder, eventId: id }) === null);
  check('IDOR: another account cannot edit it', ev.updateEventTx({ userId: intruder, eventId: id, patch: { title: 'pwned' } }).outcome === 'missing'
    && one('SELECT title FROM events WHERE id = ?', id).title === 'Fodrász');
  check('IDOR: another account cannot delete it', ev.deleteEventTx({ userId: intruder, eventId: id }).outcome === 'missing' && one('SELECT COUNT(*) n FROM events WHERE id = ?', id).n === 1);
  const moved = ev.updateEventTx({ userId: u, eventId: id, patch: { startTime: '17:00', reminders: [0] } });
  check('update: a move keeps the length; reminders are replaced', moved.outcome === 'applied' && moved.event.startTime === '17:00' && moved.event.endTime === '17:45' && moved.event.reminders.join() === '0');
  const rec = ev.updateEventTx({ userId: u, eventId: id, patch: { recurrence: { type: 'weekly', weekdayMask: 1 << 2 }, untilDate: '2026-11-18' } });
  check('update: a weekly rule with an until date counts its occurrences', rec.outcome === 'applied' && rec.event.remaining === 5, `remaining ${rec.event?.remaining}`);
  const dropped = ev.updateEventTx({ userId: u, eventId: id, patch: { recurrence: null } });
  check('update: dropping the rule drops its until date', dropped.outcome === 'applied' && dropped.event.untilDate === null && dropped.event.recurrence === null);
  check('update: an until date without a rule is refused', ev.updateEventTx({ userId: u, eventId: id, patch: { untilDate: '2026-12-01' } }).outcome === 'invalid');
  const allDay = ev.updateEventTx({ userId: u, eventId: id, patch: { allDay: true } });
  check('update: timed -> all-day', allDay.outcome === 'applied' && allDay.event.allDay && allDay.event.startTime === null && allDay.event.endDate === '2026-10-21');
  check('update: all-day -> timed without a start time is refused', ev.updateEventTx({ userId: u, eventId: id, patch: { allDay: false } }).outcome === 'invalid');
  const q = ev.eventQuery({ userId: u, eventId: id, on: '2026-10-21' });
  check('detail: the occurrence on ?on= is returned', q && q.occurrence?.date === '2026-10-21' && q.occurrence.allDay);
  check('delete: 204 once, then missing', ev.deleteEventTx({ userId: u, eventId: id }).outcome === 'applied' && ev.deleteEventTx({ userId: u, eventId: id }).outcome === 'missing');

  // The item cap: 500 planted, the 501st refused before any write.
  const capU = account('cap');
  const stmtIns = db.prepare(`INSERT INTO events (user_id, title, start_at, end_at, start_local, tz, client_key) VALUES (?, 'p', 1800000000, 1800000000, '2027-01-15T09:00', ?, ?)`);
  db.transaction(() => {
    for (let i = 0; i < events.EVENT_LIMITS.events; i += 1) stmtIns.run(capU, TZ, `cap-${i.toString().padStart(8, '0')}`);
  })();
  const capped = create(capU, { title: 'x', date: '2026-10-21', startTime: '10:00' });
  check('EXTREMES: the 501st event is LIMIT_REACHED and writes nothing', capped.outcome === 'cap' && capped.limit === 500 && one('SELECT COUNT(*) n FROM events WHERE user_id = ?', capU).n === 500);
}

/* ══ 4. GET /calendar ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── 4. calendarQuery: events + tasks + workouts ──────────────────────────────────');
{
  at('2026-10-21T08:00:00Z'); // Wednesday 10:00 local
  const u = account('week');
  made(u, { title: 'Fogorvos', date: '2026-10-21', startTime: '10:00', endTime: '10:45', location: 'Dr. Kiss Anna · Bartók Béla út 12.' });
  made(u, { title: 'Ebéd Zsófival', date: '2026-10-21', startTime: '12:30', endTime: '13:30' });
  made(u, { title: 'Úszás', date: '2026-10-24', startTime: '09:00', endTime: '10:00', recurrence: { type: 'weekly', weekdayMask: 1 << 5 }, untilDate: '2026-12-19' });
  made(u, { title: 'Bea születésnapja', allDay: true, date: '2026-10-24', recurrence: { type: 'yearly' } });
  tasksTx.createTaskTx({ userId: u, input: { title: 'Közös költség befizetése', dueOn: '2026-10-21', dueTime: '15:00' }, clientKey: key() });
  tasksTx.createTaskTx({ userId: u, input: { title: 'Felhívni anyát' }, clientKey: key() });
  const wp = Number(run(`INSERT INTO workout_plans (name, normalized_name, scope, client_user_id, author_user_id, status, starts_on, cycle_days) VALUES ('w', 'w', 'personal', ?, ?, 'active', '2026-10-19', 2)`, u, u).lastInsertRowid);
  run(`INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, 0, 'Felsőtest – húzás')`, wp);
  run(`INSERT INTO workout_plan_days (plan_id, day_index, name, is_rest) VALUES (?, 1, 'Pihenő', 1)`, wp);
  const r = ev.calendarQuery({ userId: u, from: '2026-10-19', days: 7 });
  const day = (d) => r.calendar.days.find((x) => x.date === d);
  check('the week has seven days, Monday 19 .. Sunday 25', r.outcome === 'ok' && r.calendar.days.length === 7 && r.calendar.from === '2026-10-19' && r.calendar.to === '2026-10-25');
  check('calendar-1 Wednesday: Fogorvos 10:00-10:45 and Ebéd 12:30-13:30, by time', day('2026-10-21').events.map((e) => `${e.title} ${e.startTime}-${e.endTime}`).join(' | ') === 'Fogorvos 10:00-10:45 | Ebéd Zsófival 12:30-13:30');
  check('calendar-1 Wednesday: the scheduled workout (day 2 of a 2-day cycle from Monday)', day('2026-10-21').workouts.length === 1 && day('2026-10-21').workouts[0].dayName === 'Felsőtest – húzás' && !day('2026-10-21').workouts[0].isRest);
  check('calendar-1 Wednesday: the task due at 15:00, and "Bármikor" once', day('2026-10-21').tasks.due.map((t) => t.title).join() === 'Közös költség befizetése' && r.calendar.anytime.map((t) => t.title).join() === 'Felhívni anyát');
  check('calendar-2 Saturday: the birthday (all-day) first, then Úszás 09:00', day('2026-10-24').events.map((e) => e.title).join() === 'Bea születésnapja,Úszás' && day('2026-10-24').events[0].allDay);
  check('a rest day is listed as a rest day', day('2026-10-22').workouts.length === 1 && day('2026-10-22').workouts[0].isRest);
  check('busy: an event, a workout or a task; a rest day alone is not busy', day('2026-10-21').busy && day('2026-10-24').busy && !day('2026-10-22').busy);
  check('the workout pays what the rules say', r.calendar.workoutPointsFull === 30);
  check('from out of range is refused', ev.calendarQuery({ userId: u, from: '2040-01-01', days: 7 }).outcome === 'invalid');
  const intruder = account('peek');
  check('IDOR: another account sees none of it', ev.calendarQuery({ userId: intruder, from: '2026-10-19', days: 7 }).calendar.days.every((d) => d.events.length === 0 && d.tasks.due.length === 0 && d.workouts.length === 0));
  const today = core.lifeosTodayQuery({ userId: u });
  check('GET /lifeos/today: nextEvent is the next start after now (Ebéd 12:30; Fogorvos is running)', today.nextEvent?.title === 'Ebéd Zsófival' && today.nextEvent.startTime === '12:30', JSON.stringify(today.nextEvent));
  check('GET /lifeos/today keeps its workout block', today.workout.due === true && today.workout.occurrences[0].dayName === 'Felsőtest – húzás');
  // Optional: the answers above as files, to lay beside the round-B frames they feed (calendar-1 /
  // calendar-2, Ma's KÖVETKEZŐ). Off unless VERIFY_034_DUMP names a directory.
  if (process.env.VERIFY_034_DUMP) {
    fs.mkdirSync(process.env.VERIFY_034_DUMP, { recursive: true });
    fs.writeFileSync(path.join(process.env.VERIFY_034_DUMP, 'calendar-week-2026-10-19.json'), `${JSON.stringify(r.calendar, null, 2)}\n`);
    fs.writeFileSync(path.join(process.env.VERIFY_034_DUMP, 'lifeos-today-nextEvent.json'), `${JSON.stringify(today.nextEvent, null, 2)}\n`);
  }
}

/* ══ 5. materializeRemindersTx ═════════════════════════════════════════════════════════════════ */
console.log('\n── 5. reminders: window, supersede, dedupe ─────────────────────────────────────');
{
  at('2026-10-21T08:00:00Z');
  const u = account('remind');
  const inbox = () => all(`SELECT type, title, body, link_path AS link FROM notifications WHERE user_id = ? ORDER BY id`, u);
  const fod = made(u, { title: 'Fodrász', date: '2026-10-21', startTime: '16:00', endTime: '16:45', location: 'Hajszalon', reminders: [0, 15, 60, 1440] });
  let r = ev.materializeRemindersTx({ userId: u });
  check('10:00 local: nothing is due yet (the 1-day reminder fired yesterday 16:00 — outside the 6 h window)', r.outcome === 'ok' && r.delivered === 0 && inbox().length === 0, JSON.stringify(r));
  at('2026-10-21T13:50:00Z'); // 15:50 local
  r = ev.materializeRemindersTx({ userId: u });
  const n1 = inbox();
  check('15:50: ONE notification (the 15-minute reminder), the 60-minute one recorded as superseded', r.delivered === 1 && r.superseded === 1 && n1.length === 1
    && n1[0].type === 'lifeos.event' && n1[0].title === 'Fodrász' && n1[0].body === '16:00–16:45 · Hajszalon' && n1[0].link === `/calendar/events/${fod.id}`, JSON.stringify(n1));
  r = ev.materializeRemindersTx({ userId: u });
  check('THE DEDUPE: a second run delivers nothing', r.delivered === 0 && inbox().length === 1);
  at('2026-10-21T14:00:30Z'); // 16:00:30
  r = ev.materializeRemindersTx({ userId: u });
  check('16:00: the at-start reminder is delivered once', r.delivered === 1 && inbox().length === 2);
  at('2026-10-21T15:00:00Z'); // 17:00, the event is over
  r = ev.materializeRemindersTx({ userId: u });
  check('after the event ended nothing more is delivered', r.delivered === 0 && inbox().length === 2);

  // A late opener: the 1-day reminder of tomorrow's event fired 2 h ago -> delivered; one that fired 7 h ago -> not.
  at('2026-10-21T08:00:00Z');
  const u2 = account('late');
  made(u2, { title: 'Holnapi', date: '2026-10-22', startTime: '08:00', reminders: [1440] }); // fires 2026-10-21 08:00 local = 06:00Z
  made(u2, { title: 'Régi', date: '2026-10-22', startTime: '03:00', reminders: [1440] }); // fired 01:00Z, 7 h ago
  r = ev.materializeRemindersTx({ userId: u2 });
  const n2 = all('SELECT title FROM notifications WHERE user_id = ?', u2).map((x) => x.title);
  check('the 6 h window: a reminder 2 h late is delivered, one 7 h late is not', n2.join() === 'Holnapi', n2.join());

  // Habit reminder times: a live good habit, scheduled, not done; a done one gets nothing.
  at('2026-10-21T08:00:00Z');
  const u3 = account('habit');
  const h1 = habitsTx.createHabitTx({ userId: u3, input: { kind: 'good', name: 'Olvasás', reminderTime: '21:30' }, clientKey: key() }).habit.id;
  const h2 = habitsTx.createHabitTx({ userId: u3, input: { kind: 'good', name: 'Víz', reminderTime: '21:00' }, clientKey: key() }).habit.id;
  habitsTx.createHabitTx({ userId: u3, input: { kind: 'bad', name: 'Nassolás', reminderTime: '21:00' }, clientKey: key() });
  habitsTx.setHabitCountTx({ userId: u3, habitId: h2, localDate: '2026-10-21', count: 1 });
  at('2026-10-21T19:31:00Z'); // 21:31 local
  r = ev.materializeRemindersTx({ userId: u3 });
  const n3 = all('SELECT type, title, body, link_path AS link FROM notifications WHERE user_id = ?', u3);
  check('habit 21:30: the open habit is reminded; the done one and the bad habit are not', n3.length === 1 && n3[0].type === 'lifeos.habit' && n3[0].title === 'Olvasás' && n3[0].body === '21:30' && n3[0].link === `/habits/${h1}`, JSON.stringify(n3));
  r = ev.materializeRemindersTx({ userId: u3 });
  check('habit: the dedupe holds', r.delivered === 0 && one('SELECT COUNT(*) n FROM notifications WHERE user_id = ?', u3).n === 1);

  // Tasks due within 60 minutes.
  at('2026-10-21T08:00:00Z');
  const u4 = account('task');
  const t1 = tasksTx.createTaskTx({ userId: u4, input: { title: 'Közös költség befizetése', dueOn: '2026-10-21', dueTime: '15:00' }, clientKey: key() }).task.id;
  const t2 = tasksTx.createTaskTx({ userId: u4, input: { title: 'Kész', dueOn: '2026-10-21', dueTime: '15:10' }, clientKey: key() }).task.id;
  tasksTx.completeTaskTx({ userId: u4, taskId: t2, requestId: 'probe' });
  tasksTx.createTaskTx({ userId: u4, input: { title: 'Dátum nélkül' }, clientKey: key() });
  at('2026-10-21T12:30:00Z'); // 14:30 local, due in 30 min
  r = ev.materializeRemindersTx({ userId: u4 });
  const n4 = all('SELECT type, title, body, link_path AS link FROM notifications WHERE user_id = ?', u4);
  check('task due 15:00, at 14:30: reminded once ("15:00", /tasks); the completed and the undated are not', n4.length === 1 && n4[0].type === 'lifeos.task' && n4[0].title === 'Közös költség befizetése' && n4[0].body === '15:00' && n4[0].link === '/tasks', JSON.stringify(n4));
  at('2026-10-21T13:30:00Z'); // past due
  const u5 = account('task-late');
  tasksTx.createTaskTx({ userId: u5, input: { title: 'Lejárt', dueOn: '2026-10-21', dueTime: '15:00' }, clientKey: key() });
  r = ev.materializeRemindersTx({ userId: u5 });
  check('a task already past its due time is not "due within 60 min"', r.delivered === 0);
  check('every reminder notification is a self-notification (no relationship)', one(`SELECT COUNT(*) n FROM notifications WHERE type LIKE 'lifeos.%' AND coach_client_id IS NOT NULL`).n === 0);
  check('a delivery row per notification, all deduplicated', one(`SELECT COUNT(*) n FROM notifications WHERE type LIKE 'lifeos.%'`).n === one('SELECT COUNT(*) n FROM reminder_deliveries WHERE notification_id IS NOT NULL').n);
  void t1;
  const nz = account('nz2', { zone: false });
  check('no zone: nothing to do, nothing written', ev.materializeRemindersTx({ userId: nz }).outcome === 'skipped');
}

console.log(`\nverify-034: ${passed} passed, ${failed} failed`);
try {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* the OS reclaims the temp dir either way */
}
process.exit(failed ? 1 : 0);
