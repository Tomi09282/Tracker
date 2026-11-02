#!/usr/bin/env node
// The schema check of the orchestrator rulings of 2026-10-17 / -18 for this package's fixtures
// (states.json), added by the integrator at merge-S-focus: no response of the focus routes is
// recorded (the running dev backend has no migration 035), so every refused body is checked instead
//   GET  /focus/current      FocusCurrentResponse  (a contract body)
//   POST /focus/:id/finish   FocusFinishResponse   (a contract body)
//   GET  /lifeos/today       LifeosToday           (S-ma's edit list over the user@ recording + focus)
//   GET  /my-plans/today     the plan day Ma reads (edits over the recording)
//   GET  /nutrition-log/*    NutritionDay          (built `from` the recorded 2026-10-15)
// against the response types the pages read (lib/lifeos-api.ts with B-focus' Phase-6 block,
// today/useTodayPlan.ts, nutrition/useNutrition.ts) by tsc, and against the rules the focus routes
// state (pkg/B-focus/api.md), recomputed with the backend's OWN pure helpers (backend/src/lifeos/
// focus.js, rules.js, dates.js, imported read-only) the way db/lifeos-focus-views.js assembles a
// session at the answer's `now`:
//   status         focusStatus(row, now) for an open block, the stored one for a closed block
//   times          endsAt = startsAt + 60 * plannedMinutes; startTime / endTime = the wall clock in the zone
//   elapsed        elapsedMinutes(row, now) (closed: to the close, never past the end)
//   remaining      max(0, endsAt - max(now, startsAt)) while open, 0 when closed
//   check-ins      checkinsMax, checkinDue, nextCheckinAt by the helpers; done <= allowed by the clock
//   money          expectedMinor = the whole plan with every check-in; payoutNowMinor = focusPayout(...)
//                  while running / ran out, null planned and closed; a done block's award <= its
//                  paid minutes + check-ins worth, equal unless capped; open blocks carry no paid / award
//   the answer     started false -> today / session null; today = the logical day of `now`;
//                  rules = the admin defaults; the finish outcome repeats its session's award
//   Ma's block     TodayFocus: its block (as above, at the pinned clock), minutes <= the daily limit
// Product code never reads a fixture.
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-focus/fixture-schema-check.mjs <main>/.pulse/rec/user <outDir inside frontend/>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext \
//       --moduleResolution bundler --lib ES2023,DOM --jsx react-jsx <outDir>/fx-check-s-focus.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const F = await imp('backend/src/lifeos/focus.js');
const R = await imp('backend/src/lifeos/rules.js');
const D = await imp('backend/src/lifeos/dates.js');

const [, , recDir, outDir] = process.argv;
if (!recDir || !outDir) {
  console.error('usage: fixture-schema-check.mjs <rec/user dir> <outDir inside frontend/>');
  process.exit(2);
}
const states = JSON.parse(fs.readFileSync(path.join(HERE, 'states.json'), 'utf8'));
const ZONE = 'Europe/Budapest'; // the package's pinned clock zone (states.json about)

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
  { method: 'GET', re: /^\/api\/v1\/focus\/current$/, type: 'FocusCurrentResponse' },
  { method: 'POST', re: /^\/api\/v1\/focus\/\d+\/finish$/, type: 'FocusFinishResponse' },
  { method: 'GET', re: /^\/api\/v1\/lifeos\/today$/, type: 'LifeosToday' },
  { method: 'GET', re: /^\/api\/v1\/my-plans\/today$/, type: 'PlanToday' },
  { method: 'GET', re: /^\/api\/v1\/nutrition-log\/\d{4}-\d{2}-\d{2}$/, type: 'NutritionDay' },
];

const problems = [];
const notes = [];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RULES = { focusPointsPerHour: R.DEFAULT_RULES.focusPointsPerHour, focusCheckinPoint: R.DEFAULT_RULES.focusCheckinPoint };
const eq = (where, what, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${where}: ${what} is ${JSON.stringify(got)}, the rule gives ${JSON.stringify(want)}`);
};

/** One FocusSession as db/lifeos-focus-views.js focusView() would draw it at `now` (epoch s). */
function checkSession(where, s, now, paidToday) {
  const open = s.status === 'planned' || s.status === 'active' || s.status === 'ended';
  const row = {
    startsAt: s.startsAt,
    plannedMinutes: s.plannedMinutes,
    checkinMinutes: s.checkinMinutes,
    checkinsDone: s.checkinsDone,
    lastCheckinAt: s.lastCheckinAt,
    status: open ? 'open' : s.status,
    closedAt: s.closedAt,
  };
  const end = F.endsAt(row);
  if (!Number.isInteger(s.id) || s.id < 1) problems.push(`${where}: id`);
  if (typeof s.title !== 'string' || s.title.length < 1 || s.title.length > 120) problems.push(`${where}: title length`);
  if (s.plannedMinutes < F.FOCUS_MIN_MINUTES || s.plannedMinutes > F.FOCUS_MAX_MINUTES) problems.push(`${where}: plannedMinutes ${s.plannedMinutes}`);
  if (s.checkinMinutes !== 0 && (s.checkinMinutes < F.MIN_CHECKIN_GAP_MINUTES || s.checkinMinutes > F.FOCUS_MAX_CHECKIN_MINUTES)) problems.push(`${where}: checkinMinutes ${s.checkinMinutes}`);
  eq(where, 'endsAt', s.endsAt, end);
  eq(where, 'startTime', s.startTime, D.localTime(new Date(s.startsAt * 1000), ZONE));
  eq(where, 'endTime', s.endTime, D.localTime(new Date(end * 1000), ZONE));
  if (open) eq(where, 'status', s.status, F.focusStatus(row, now));
  eq(where, 'elapsedMinutes', s.elapsedMinutes, F.elapsedMinutes(row, open ? now : Math.min(s.closedAt, end)));
  eq(where, 'remainingSeconds', s.remainingSeconds, open ? Math.max(0, end - Math.max(now, s.startsAt)) : 0);
  eq(where, 'checkinsMax', s.checkinsMax, F.checkinsMax(row));
  if (s.checkinsDone < 0 || s.checkinsDone > s.checkinsMax) problems.push(`${where}: checkinsDone ${s.checkinsDone} outside 0..${s.checkinsMax}`);
  if (open && s.checkinsDone > F.checkinsAllowed(row, now)) problems.push(`${where}: ${s.checkinsDone} check-ins done, the clock allows ${F.checkinsAllowed(row, now)}`);
  if ((s.lastCheckinAt === null) !== (s.checkinsDone === 0)) problems.push(`${where}: lastCheckinAt / checkinsDone disagree`);
  if (s.lastCheckinAt !== null && (s.lastCheckinAt < s.startsAt || s.lastCheckinAt > end)) problems.push(`${where}: lastCheckinAt outside the block`);
  const allowed = F.checkinsAllowed(row, now);
  eq(
    where,
    'checkinDue',
    s.checkinDue,
    s.status === 'active' && s.checkinMinutes > 0 && s.checkinsDone < allowed && (s.lastCheckinAt === null || now - s.lastCheckinAt >= F.FOCUS_LIMITS.minCheckinGapMinutes * 60),
  );
  eq(where, 'nextCheckinAt', s.nextCheckinAt, open ? F.nextCheckinAt(row) : null);
  eq(where, 'expectedMinor', s.expectedMinor, R.pointsToMinor(F.focusExpectedPoints(row, RULES)));
  const payout = open && s.status !== 'planned' ? F.focusPayout(row, now, paidToday, RULES) : null;
  eq(where, 'payoutNowMinor', s.payoutNowMinor, payout ? R.pointsToMinor(payout.points) : null);
  if (open) {
    if (s.closedAt !== null || s.closedOn !== null || s.paidMinutes !== null || s.paidCheckins !== null || s.awardedMinor !== null || s.capped !== false) problems.push(`${where}: an open block with closed / paid fields`);
  } else {
    if (typeof s.closedAt !== 'number' || !DAY.test(s.closedOn ?? '')) problems.push(`${where}: a closed block without closedAt / closedOn`);
    else eq(where, 'closedOn', s.closedOn, D.dayKeyFor(new Date(s.closedAt * 1000), ZONE));
    if (s.status === 'done') {
      if (!Number.isInteger(s.paidMinutes) || !Number.isInteger(s.paidCheckins) || s.awardedMinor === null) problems.push(`${where}: done without paid minutes / check-ins / award`);
      else {
        if (s.paidMinutes > s.elapsedMinutes || s.paidCheckins > s.checkinsDone) problems.push(`${where}: paid beyond the minutes spent / check-ins answered`);
        const worth = R.pointsToMinor(F.focusPoints({ minutes: s.paidMinutes, checkins: s.paidCheckins }, RULES));
        if (s.awardedMinor > worth) problems.push(`${where}: awarded ${s.awardedMinor} above the worth ${worth}`);
        if (!s.capped && s.awardedMinor !== worth) problems.push(`${where}: awarded ${s.awardedMinor}, uncapped worth ${worth}`);
      }
    } else if (s.paidMinutes !== null || s.paidCheckins !== null || s.awardedMinor !== null || s.capped !== false) problems.push(`${where}: a cancelled block with paid fields`);
  }
}

const ts = [
  "import type { FocusCurrentResponse, FocusFinishResponse, LifeosToday } from '../src/lib/lifeos-api';",
  "import type { TodayDay } from '../src/features/today/useTodayPlan';",
  "import type { NutritionDay } from '../src/features/nutrition/useNutrition';",
  'type PlanToday = { date: string; days: (TodayDay & { date: string; log_status: string | null })[] };',
];
let n = 0;
for (const [key, st] of Object.entries(states.states)) {
  const clockSec = st.clock ? Math.floor(Date.parse(st.clock) / 1000) : null;
  for (const fx of st.fixtures ?? []) {
    if (fx.status && fx.status >= 400) continue;
    const t = TYPES.find((x) => x.method === fx.method && x.re.test(fx.path));
    if (!t) continue;
    const srcPath = fx.from?.path ? fx.from.path.split('?')[0] : fx.path;
    const base = fx.body ?? recording(srcPath);
    if (base === null) {
      problems.push(`${key}: ${fx.path} has no recording to build from (${srcPath})`);
      continue;
    }
    const body = fx.body ?? apply(base, fx.edits);
    if (!fx.body) for (const k of Object.keys(base)) if (!(k in body)) problems.push(`${key}: ${fx.path} lost the recorded key ${k}`);
    const where = `${key} ${fx.method} ${fx.path}`;

    if (t.type === 'FocusCurrentResponse') {
      if (body.started === false) {
        if (body.today !== null || body.session !== null) problems.push(`${where}: not started but today / session set`);
      } else {
        if (!DAY.test(body.today ?? '') || typeof body.now !== 'number') problems.push(`${where}: started without today / now`);
        else eq(where, 'today', body.today, D.dayKeyFor(new Date(body.now * 1000), ZONE));
        if (clockSec !== null && Math.abs(body.now - clockSec) > 1) notes.push(`${where}: now ${body.now} differs from the state's pinned clock ${clockSec} by ${body.now - clockSec} s`);
      }
      if (!Number.isInteger(body.todayMinutes) || body.todayMinutes < 0 || body.todayMinutes > F.FOCUS_MAX_MINUTES_PER_DAY) problems.push(`${where}: todayMinutes`);
      eq(where, 'rules', body.rules, {
        pointsPerHour: RULES.focusPointsPerHour,
        checkinPoint: RULES.focusCheckinPoint,
        maxMinutesPerDay: F.FOCUS_MAX_MINUTES_PER_DAY,
        minCheckinGapMinutes: F.MIN_CHECKIN_GAP_MINUTES,
        minMinutes: F.FOCUS_MIN_MINUTES,
        maxMinutes: F.FOCUS_MAX_MINUTES,
        maxCheckinMinutes: F.FOCUS_MAX_CHECKIN_MINUTES,
      });
      if (body.session) checkSession(where, body.session, body.now, body.todayMinutes);
    }
    if (t.type === 'FocusFinishResponse') {
      const s = body.session;
      if (s.status !== 'done') problems.push(`${where}: a finish answers a done block`);
      checkSession(where, s, s.closedAt, 0);
      if (body.awardedMinor !== s.awardedMinor || body.capped !== s.capped) problems.push(`${where}: awardedMinor / capped do not repeat the session's`);
    }
    if (t.type === 'LifeosToday') {
      const f = body.focus;
      if (f === undefined) problems.push(`${where}: no focus field (B-focus' Phase-6 type requires it)`);
      else {
        if (f.current) checkSession(`${where} focus.current`, f.current, clockSec, f.todayMinutes);
        if (f.maxMinutesPerDay !== F.FOCUS_MAX_MINUTES_PER_DAY) problems.push(`${where}: focus.maxMinutesPerDay`);
        if (f.todayMinutes < 0 || f.todayMinutes > f.maxMinutesPerDay || f.todaySessions < 0 || f.todayEarnedMinor < 0) problems.push(`${where}: focus counters out of range`);
        if (f.todayMinutes > 0 && f.todaySessions === 0) problems.push(`${where}: focus minutes without a session`);
        if (f.todayEarnedMinor > body.wallet.todayEarnedMinor) notes.push(`${where}: focus.todayEarnedMinor ${f.todayEarnedMinor} is above wallet.todayEarnedMinor ${body.wallet.todayEarnedMinor} (the frame's own numbers; the block draws only focus.todayMinutes and the planned row)`);
      }
      const tasks = body.tasks ? [...body.tasks.overdue, ...body.tasks.due, ...body.tasks.completedToday] : [];
      tasks.forEach((tk) => ![1, 2, 3].includes(tk.priority) && problems.push(`${where}: task ${tk.id} priority ${tk.priority}`));
    }
    ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')}_${t.type} = ${JSON.stringify(body)} satisfies ${t.type};`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fx-check-s-focus.ts'), ts.join('\n') + '\n');
console.log(`${n} fixture bodies written to ${path.join(outDir, 'fx-check-s-focus.ts')}`);
if (notes.length) console.log(notes.map((x) => `note: ${x}`).join('\n'));
console.log(
  problems.length
    ? problems.join('\n')
    : 'constraints: OK (status, times and wall clock in the zone, elapsed, remaining, check-in pacing / due / next, expected and payout money, closed / paid fields, the finish repeating its award, the logical day of now, the admin rules, Ma\'s focus block, task priority 1..3, recorded keys kept)',
);
process.exit(problems.length ? 1 : 0);
