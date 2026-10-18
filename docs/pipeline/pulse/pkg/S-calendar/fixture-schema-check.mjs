#!/usr/bin/env node
// The schema check of the orchestrator rulings of 2026-10-17 / -18 for this package's fixtures
// (states.json), added by the integrator at merge-S-calendar: no response of the calendar routes is
// recorded (the running dev backend has no migration 034 yet), so every refused body is checked instead
//   GET /calendar        CalendarResponse   (a contract body)
//   GET /events/:id      EventResponse      (a contract body)
//   GET /tasks           TasksResponse      (a contract body)
//   GET /lifeos/today    LifeosToday        (S-ma's edit list over the user@ recording + nextEvent)
//   GET /my-plans/today  the plan day Ma reads (edits over the recording)
//   GET /nutrition-log/* NutritionDay       (built `from` the recorded 2026-10-15)
// against the response types the pages read (lib/lifeos-api.ts with B-calendar's Phase-5 block,
// today/useTodayPlan.ts, nutrition/useNutrition.ts) by tsc, and against the rules B-calendar's API
// states (pkg/B-calendar/api.md): the days run one by one from `from` to `to` (at most 42), every
// occurrence's startAt is its own date + startTime on the wall clock of the user's zone, endAt -
// startAt = durationMinutes, all-day first then by start, overdue only on the logical today, `busy`
// = an event, a non-rest workout or a task due / done that day; an event's reminders ascending,
// distinct, at most four, 0..10080, its next / occurrence of the same event, a recurrence for an
// until date; nextEvent within 7 days of the calendar today; task priority 1..3.
// Product code never reads a fixture.
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-calendar/fixture-schema-check.mjs <main>/.pulse/rec/user <outDir inside frontend/>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext \
//       --moduleResolution bundler --lib ES2023,DOM --jsx react-jsx <outDir>/fx-check-s-calendar.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [, , recDir, outDir] = process.argv;
if (!recDir || !outDir) {
  console.error('usage: fixture-schema-check.mjs <rec/user dir> <outDir inside frontend/>');
  process.exit(2);
}
const states = JSON.parse(fs.readFileSync(path.join(HERE, 'states.json'), 'utf8'));

function recording(apiPath) {
  for (const f of fs.readdirSync(recDir)) {
    if (!f.startsWith('GET_')) continue;
    const r = JSON.parse(fs.readFileSync(path.join(recDir, f), 'utf8'));
    if (r.path === apiPath && !r.query) return r.body;
  }
  return null;
}
const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');
function apply(body, edits = []) {
  const b = structuredClone(body);
  for (const e of edits) {
    const parts = e.pointer.split('/').slice(1).map(unesc);
    const last = parts.pop();
    let o = b;
    for (const p of parts) o = o[p];
    if (e.remove) {
      if (Array.isArray(o)) o.splice(+last, 1);
      else delete o[last];
    } else if (Array.isArray(o) && last === '-') o.push(e.value);
    else o[last] = e.value;
  }
  return b;
}

const TYPES = [
  { re: /^\/api\/v1\/calendar$/, type: 'CalendarResponse' },
  { re: /^\/api\/v1\/events\/\d+$/, type: 'EventResponse' },
  { re: /^\/api\/v1\/tasks$/, type: 'TasksResponse' },
  { re: /^\/api\/v1\/lifeos\/today$/, type: 'LifeosToday' },
  { re: /^\/api\/v1\/my-plans\/today$/, type: 'PlanToday' },
  { re: /^\/api\/v1\/nutrition-log\/\d{4}-\d{2}-\d{2}$/, type: 'NutritionDay' },
];

const problems = [];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** The wall clock of an instant in a zone: [YYYY-MM-DD, HH:MM]. */
function wall(epochSec, zone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(epochSec * 1000))
      .map((x) => [x.type, x.value]),
  );
  return [`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`];
}

function checkOccurrence(where, o, zone) {
  if (!DAY.test(o.date) || !DAY.test(o.occurrenceDate)) problems.push(`${where}: date shape`);
  if (o.allDay) {
    if (o.startTime !== null || o.endTime !== null || o.durationMinutes !== null) problems.push(`${where}: an all-day occurrence with times`);
    const [d, hm] = wall(o.startAt, zone);
    if (d !== o.occurrenceDate || hm !== '00:00') problems.push(`${where}: all-day startAt is ${d} ${hm}, not local midnight of ${o.occurrenceDate}`);
  } else {
    const [d, hm] = wall(o.startAt, zone);
    if (d !== o.occurrenceDate || hm !== o.startTime) problems.push(`${where}: startAt is ${d} ${hm} in ${zone}, the fixture says ${o.occurrenceDate} ${o.startTime}`);
    if (o.durationMinutes !== null && o.endAt - o.startAt !== o.durationMinutes * 60) problems.push(`${where}: endAt - startAt != durationMinutes`);
    if (o.endTime !== null && wall(o.endAt, zone)[1] !== o.endTime) problems.push(`${where}: endAt's wall clock != endTime ${o.endTime}`);
  }
  if (o.endAt < o.startAt) problems.push(`${where}: ends before it starts`);
  if (o.startsBefore !== (o.date > o.occurrenceDate)) problems.push(`${where}: startsBefore disagrees with the dates`);
  if (o.untilDate !== null && o.recurrence === null) problems.push(`${where}: an until date without a recurrence`);
}
const taskPriorities = (where, list) => list.forEach((tk) => ![1, 2, 3].includes(tk.priority) && problems.push(`${where}: task ${tk.id} priority ${tk.priority}`));

const ts = [
  "import type { CalendarResponse, EventResponse, LifeosToday, TasksResponse } from '../src/lib/lifeos-api';",
  "import type { TodayDay } from '../src/features/today/useTodayPlan';",
  "import type { NutritionDay } from '../src/features/nutrition/useNutrition';",
  'type PlanToday = { date: string; days: (TodayDay & { date: string; log_status: string | null })[] };',
];
let n = 0;
for (const [key, st] of Object.entries(states.states)) {
  for (const fx of st.fixtures ?? []) {
    if (fx.method !== 'GET' || (fx.status && fx.status >= 400)) continue;
    const t = TYPES.find((x) => x.re.test(fx.path));
    if (!t) continue;
    const srcPath = fx.from?.path ? fx.from.path.split('?')[0] : fx.path;
    const base = fx.body ?? recording(srcPath);
    if (base === null) {
      problems.push(`${key}: ${fx.path} has no recording to build from (${srcPath})`);
      continue;
    }
    const body = fx.body ?? apply(base, fx.edits);
    if (!fx.body) for (const k of Object.keys(base)) if (!(k in body)) problems.push(`${key}: ${fx.path} lost the recorded key ${k}`);

    if (t.type === 'CalendarResponse') {
      const zone = body.timezone;
      if (body.started !== (zone !== null)) problems.push(`${key}: started / timezone disagree`);
      if (body.days.length < 1 || body.days.length > 42) problems.push(`${key}: ${body.days.length} days`);
      if (body.to !== addDays(body.from, body.days.length - 1)) problems.push(`${key}: to != from + days - 1`);
      body.days.forEach((d, i) => {
        const w = `${key} ${d.date}`;
        if (d.date !== addDays(body.from, i)) problems.push(`${w}: not day ${i} after ${body.from}`);
        d.events.forEach((o, j) => {
          checkOccurrence(`${w} event ${j}`, o, zone);
          if (o.date !== d.date) problems.push(`${w} event ${j}: drawn on ${o.date}`);
          const p = d.events[j - 1];
          if (p && (p.allDay === o.allDay ? p.startAt > o.startAt : !p.allDay)) problems.push(`${w}: events not all-day first, then by start`);
        });
        if (d.date !== body.logicalToday && d.tasks.overdue.length) problems.push(`${w}: overdue tasks off the logical today`);
        taskPriorities(w, [...d.tasks.due, ...d.tasks.completed, ...d.tasks.overdue]);
        const busy = d.events.length > 0 || d.workouts.some((x) => !x.isRest) || d.tasks.due.length > 0 || d.tasks.completed.length > 0;
        if (d.busy !== busy) problems.push(`${w}: busy ${d.busy}, the rule gives ${busy}`);
      });
      taskPriorities(`${key} anytime`, body.anytime);
      if (body.anytime.some((tk) => tk.dueOn !== null)) problems.push(`${key}: a dated task in anytime`);
    }
    if (t.type === 'EventResponse') {
      const e = body.event;
      const id = Number(fx.path.split('/').pop());
      if (e.id !== id) problems.push(`${key}: event.id ${e.id} != path id ${id}`);
      const r = e.reminders;
      if (r.length > 4 || r.some((x, i) => !Number.isInteger(x) || x < 0 || x > 10080 || (i && r[i - 1] >= x))) problems.push(`${key}: reminders ${JSON.stringify(r)}`);
      if (e.untilDate !== null && e.recurrence === null) problems.push(`${key}: an until date without a recurrence`);
      if (e.remaining !== null && e.untilDate === null) problems.push(`${key}: remaining without an until date`);
      if (e.allDay !== (e.startTime === null)) problems.push(`${key}: allDay / startTime disagree`);
      if (!e.allDay) {
        const [d, hm] = wall(e.startAt, e.timezone);
        if (d !== e.date || hm !== e.startTime) problems.push(`${key}: startAt is ${d} ${hm}, the event says ${e.date} ${e.startTime}`);
      }
      for (const [name, o] of [['next', e.next], ['occurrence', e.occurrence]]) {
        if (!o) continue;
        if (o.eventId !== id || o.title !== e.title || o.allDay !== e.allDay) problems.push(`${key}: ${name} is not this event`);
        checkOccurrence(`${key} ${name}`, o, e.timezone);
      }
      if (e.title.length < 1 || e.title.length > 120) problems.push(`${key}: title length`);
    }
    if (t.type === 'TasksResponse') {
      for (const v of Object.values(body)) if (Array.isArray(v)) taskPriorities(`${key} tasks`, v);
    }
    if (t.type === 'LifeosToday') {
      const tasks = body.tasks ? [...body.tasks.overdue, ...body.tasks.due, ...body.tasks.completedToday] : [];
      taskPriorities(`${key} lifeos`, tasks);
      const ne = body.nextEvent;
      if (ne) {
        if (ne.endAt < ne.startAt || ne.date < body.today) problems.push(`${key}: nextEvent shape`);
        if (ne.date > addDays(body.today, 7)) problems.push(`${key}: nextEvent ${ne.date} beyond 7 days of ${body.today}`);
        if (ne.allDay !== (ne.startTime === null)) problems.push(`${key}: nextEvent allDay / startTime disagree`);
      }
    }
    ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')} = ${JSON.stringify(body)} satisfies ${t.type};`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fx-check-s-calendar.ts'), ts.join('\n') + '\n');
console.log(`${n} fixture bodies written to ${path.join(outDir, 'fx-check-s-calendar.ts')}`);
console.log(
  problems.length
    ? problems.join('\n')
    : 'constraints: OK (consecutive days, wall-clock startAt / endAt in the zone, durations, order, overdue on the logical today, busy rule, reminders, until / recurrence, next / occurrence of the same event, nextEvent within 7 days, task priority 1..3, recorded keys kept)',
);
process.exit(problems.length ? 1 : 0);
