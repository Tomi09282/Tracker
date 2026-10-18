// S-tasks: the schema check the orchestrator ruling of 2026-10-17 asks for (a fixture value no
// recording holds is allowed when it is checked against the endpoint's real response type).
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-tasks/fixture-schema-check.mjs ../docs/pipeline/pulse/pkg/S-tasks/states.json <outDir>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext --moduleResolution bundler --lib ES2023,DOM <outDir>/fx-check.ts
// (outDir must sit directly inside frontend/ so the import of src/lib/lifeos-api resolves).
//
// Every GET /api/v1/tasks body of a 200 fixture is written as typed TS (`satisfies TasksResponse`,
// B-habits-tasks' type in frontend/src/lib/lifeos-api.ts) and checked against the route's own
// invariants (api.md "GET /tasks", backend/src/db/tx/lifeos-tasks.js taskLists on pulse/B-habits-tasks).
import fs from 'node:fs';

const [, , statesFile, outDir] = process.argv;
if (!statesFile || !outDir) {
  console.error("usage: fixture-schema-check.mjs <states.json> <outDir>");
  process.exit(2);
}
const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'));
const problems = [];
const ts = ["import type { TasksResponse } from '../src/lib/lifeos-api';"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const TASK_KEYS = ['id', 'title', 'notes', 'priority', 'points', 'dueOn', 'dueTime', 'recurrence', 'isTemplate', 'parentTaskId', 'completedAt', 'completedOn', 'overdueOn', 'valueMinor', 'lateNow', 'payoutNowMinor', 'paidMinor', 'overduePenaltyMinor'];
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

function checkTask(where, t, today) {
  const keys = Object.keys(t);
  for (const k of TASK_KEYS) if (!keys.includes(k)) problems.push(`${where}: lacks ${k}`);
  for (const k of keys) if (!TASK_KEYS.includes(k)) problems.push(`${where}: unknown key ${k}`);
  if (!Number.isInteger(t.id) || t.id < 1) problems.push(`${where}: id`);
  if (typeof t.title !== 'string' || t.title.length < 1 || t.title.length > 120) problems.push(`${where}: title 1..120`);
  if (t.notes !== null && (typeof t.notes !== 'string' || t.notes.length > 1000)) problems.push(`${where}: notes`);
  if (![1, 2, 3].includes(t.priority)) problems.push(`${where}: priority 1..3`);
  if (t.points !== null && !(Number.isInteger(t.points) && t.points >= 0 && t.points <= 50)) problems.push(`${where}: points 0..50 | null`);
  if (t.dueOn !== null && !DAY.test(t.dueOn)) problems.push(`${where}: dueOn`);
  if (t.dueTime !== null && (!HHMM.test(t.dueTime) || t.dueOn === null)) problems.push(`${where}: dueTime HH:MM needs dueOn`);
  if (t.recurrence !== null) {
    const r = t.recurrence;
    const ok =
      (r.type === 'daily' && (r.interval === undefined || (Number.isInteger(r.interval) && r.interval >= 1 && r.interval <= 30))) ||
      (r.type === 'weekly' && Number.isInteger(r.weekdayMask) && r.weekdayMask >= 1 && r.weekdayMask <= 127) ||
      (r.type === 'monthly' && Number.isInteger(r.day) && r.day >= 1 && r.day <= 31);
    if (!ok) problems.push(`${where}: recurrence`);
  }
  if (t.isTemplate && (t.recurrence === null || t.parentTaskId !== null || t.completedAt !== null)) problems.push(`${where}: a template has a rule, no parent, no completion`);
  if (t.parentTaskId !== null && t.recurrence === null) problems.push(`${where}: an instance carries its template's rule`);
  const done = t.completedAt !== null;
  if (done !== (t.completedOn !== null)) problems.push(`${where}: completedAt / completedOn together`);
  if (done && (!Number.isInteger(t.completedAt) || !DAY.test(t.completedOn))) problems.push(`${where}: completion shape`);
  if (!Number.isInteger(t.valueMinor) || t.valueMinor < 0) problems.push(`${where}: valueMinor`);
  if (t.points === null && ![500, 1000, 2000].includes(t.valueMinor)) problems.push(`${where}: valueMinor is not a default priority rule (5 / 10 / 20 coins)`);
  if ((done || t.isTemplate) !== (t.payoutNowMinor === null)) problems.push(`${where}: payoutNowMinor null exactly when completed or a template`);
  if (t.payoutNowMinor !== null && t.payoutNowMinor !== (t.lateNow ? Math.floor(t.valueMinor / 2) : t.valueMinor)) problems.push(`${where}: payoutNowMinor = valueMinor, half when late`);
  if (done !== (t.paidMinor !== null)) problems.push(`${where}: paidMinor only on a completed task`);
  if (t.overduePenaltyMinor !== null && !(Number.isInteger(t.overduePenaltyMinor) && t.overduePenaltyMinor < 0 && t.overdueOn !== null)) problems.push(`${where}: overduePenaltyMinor negative with overdueOn`);
  if (t.overdueOn !== null && (!DAY.test(t.overdueOn) || t.overdueOn >= today)) problems.push(`${where}: overdueOn is a settled day before today`);
}

for (const [key, s] of Object.entries(states.states)) {
  for (const fx of s.fixtures || []) {
    if (fx.method !== 'GET' || fx.path !== '/api/v1/tasks' || (fx.status ?? 200) !== 200) continue;
    const b = fx.body;
    const today = b.today;
    if (b.started !== true || !DAY.test(today)) problems.push(`${key}: started / today`);
    for (const list of ['due', 'overdue', 'anytime', 'completedToday', 'upcoming', 'done', 'templates']) {
      if (!Array.isArray(b[list])) { problems.push(`${key}: ${list} is not a list`); continue; }
      b[list].forEach((t, i) => checkTask(`${key}.${list}[${i}]`, t, today));
    }
    const open = (t) => t.completedAt === null && !t.isTemplate;
    b.due.forEach((t, i) => { if (!(open(t) && t.dueOn === today)) problems.push(`${key}.due[${i}]: open, due today`); });
    b.overdue.forEach((t, i) => { if (!(open(t) && t.dueOn < today)) problems.push(`${key}.overdue[${i}]: open, due before today`); });
    b.anytime.forEach((t, i) => { if (!(open(t) && t.dueOn === null)) problems.push(`${key}.anytime[${i}]: open, no deadline`); });
    b.upcoming.forEach((t, i) => { if (!(open(t) && t.dueOn > today && t.dueOn <= addDays(today, 7))) problems.push(`${key}.upcoming[${i}]: open, the next 7 days`); });
    b.completedToday.forEach((t, i) => { if (t.completedOn !== today) problems.push(`${key}.completedToday[${i}]: completed today`); });
    b.done.forEach((t, i) => { if (!(t.completedOn && t.completedOn > addDays(today, -7))) problems.push(`${key}.done[${i}]: completed in the last 7 days`); });
    b.templates.forEach((t, i) => { if (!t.isTemplate) problems.push(`${key}.templates[${i}]: a template`); });
    for (const list of ['due', 'overdue', 'anytime', 'upcoming', 'completedToday']) b[list].forEach((t) => {
      if (t.parentTaskId !== null && !b.templates.some((x) => x.id === t.parentTaskId)) problems.push(`${key}: task ${t.id} names a template that is not listed`);
    });
    const openListed = new Set([...b.due, ...b.overdue, ...b.anytime, ...b.upcoming].map((t) => t.id)).size;
    if (!Number.isInteger(b.openCount) || b.openCount < openListed) problems.push(`${key}: openCount ${b.openCount} < ${openListed} listed open tasks`);
    ts.push(`export const ${key.replace(/[^A-Za-z0-9]/g, '_')} = ${JSON.stringify(b)} satisfies TasksResponse;`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/fx-check.ts`, ts.join('\n') + '\n');
console.log(`${ts.length - 1} fixture(s) written; ` + (problems.length ? `${problems.length} problem(s):\n` + problems.join('\n') : 'constraints: OK (every Task key present and no other, bounds of POST /tasks, the five lists by their rules, payout / paid / penalty shapes, templates and instances, openCount)'));
process.exitCode = problems.length ? 1 : 0;
