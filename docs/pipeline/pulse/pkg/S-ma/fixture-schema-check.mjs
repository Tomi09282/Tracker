#!/usr/bin/env node
// The schema check the orchestrator rulings of 2026-10-17 (S-workout) and 2026-10-18 (S-coins-xp) ask
// for, for the fixtures pulse-merge-check refuses in this package's states.json:
//   GET /lifeos/today     the Phase-3 keys habits / tasks (no 032 recording of user@ exists: the freeze
//                         was taken at 04:50, before B-habits-tasks) and startedOn / settledThrough
//                         (user@ has not started LifeOS, so every recording has null there)
//   GET /my-plans/today   est_minutes / start_time (user@'s plan day has neither, so the recordings hold null)
//   GET /nutrition-log/*  built `from` the recorded day 2026-10-15 of the same route (the checker keys
//                         the endpoint by its full path, so another date reads as "not recorded")
//
// What it does: rebuilds every refused body exactly as pulse-shot answers it (the recording, or the
// `from` recording, with the state's edits applied), writes them as TypeScript constants typed by the
// response types the page reads (lib/lifeos-api.ts LifeosToday, today/useTodayPlan.ts TodayDay,
// nutrition/useNutrition.ts NutritionDay), and checks the value ranges the database enforces
// (migration 032 CHECKs: habit kind / schedule / log status, task priority 1..3, counts >= 0).
// The TypeScript half is then checked by tsc. Product code never reads a fixture.
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-ma/fixture-schema-check.mjs <main>/.pulse/rec/user <outDir inside frontend/>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext \
//       --moduleResolution bundler --lib ES2023,DOM --jsx react-jsx <outDir>/fx-check-s-ma.ts
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

/** The recording of one GET, found by its path (and query, when the fixture names one). */
function recording(apiPath, query) {
  const want = query ? new URLSearchParams(Object.entries(query).sort()).toString() : null;
  for (const f of fs.readdirSync(recDir)) {
    if (!f.startsWith('GET_')) continue;
    const r = JSON.parse(fs.readFileSync(path.join(recDir, f), 'utf8'));
    if (r.path !== apiPath) continue;
    if (want !== null && new URLSearchParams([...new URLSearchParams(r.query ?? '')].sort()).toString() !== want) continue;
    return r.body;
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
  { re: /^\/api\/v1\/lifeos\/today$/, type: 'LifeosToday' },
  { re: /^\/api\/v1\/my-plans\/today$/, type: 'PlanToday' },
  { re: /^\/api\/v1\/nutrition-log\/\d{4}-\d{2}-\d{2}$/, type: 'NutritionDay' },
];

const problems = [];
const ts = [
  "import type { LifeosToday } from '../src/lib/lifeos-api';",
  "import type { TodayDay } from '../src/features/today/useTodayPlan';",
  "import type { NutritionDay } from '../src/features/nutrition/useNutrition';",
  // the recorded day carries two fields the page does not read (date, log_status): kept, typed as recorded
  'type PlanToday = { date: string; days: (TodayDay & { date: string; log_status: string | null })[] };',
];
let n = 0;
for (const [key, st] of Object.entries(states.states)) {
  for (const fx of st.fixtures ?? []) {
    if (fx.method !== 'GET') continue;
    const t = TYPES.find((x) => x.re.test(fx.path));
    if (!t) continue;
    if (fx.status && fx.status >= 400) continue; // an error answer, not a body of the type
    const srcPath = fx.from?.path ? fx.from.path.split('?')[0] : fx.path;
    const srcQuery = fx.from?.path?.includes('?') ? Object.fromEntries(new URLSearchParams(fx.from.path.split('?')[1])) : fx.query;
    const base = fx.body ?? recording(srcPath, srcQuery);
    if (base === null) {
      problems.push(`${key}: ${fx.path} has no recording to build from (${srcPath})`);
      continue;
    }
    const body = fx.body ?? apply(base, fx.edits);
    // every key the recording carries survives the edits (an edit list may add, never lose a field)
    for (const k of Object.keys(base)) if (!(k in body)) problems.push(`${key}: ${fx.path} lost the recorded key ${k}`);
    if (t.type === 'LifeosToday') {
      for (const h of body.habits ?? []) {
        if (!['good', 'bad'].includes(h.kind)) problems.push(`${key}: habit ${h.id} kind ${h.kind}`);
        if (!['daily', 'weekdays', 'times_per_week'].includes(h.scheduleType)) problems.push(`${key}: habit ${h.id} scheduleType ${h.scheduleType}`);
        if (h.log && !['pending', 'done', 'skipped', 'relapse'].includes(h.log.status)) problems.push(`${key}: habit ${h.id} log status ${h.log.status}`);
        if (h.log && !(Number.isInteger(h.log.count) && h.log.count >= 0)) problems.push(`${key}: habit ${h.id} log count ${h.log.count}`);
        if (!(Number.isInteger(h.targetCount) && h.targetCount >= 1)) problems.push(`${key}: habit ${h.id} targetCount ${h.targetCount}`);
        if (!(Number.isInteger(h.streak?.current) && h.streak.current >= 0)) problems.push(`${key}: habit ${h.id} streak`);
      }
      const tasks = body.tasks ? [...body.tasks.overdue, ...body.tasks.due, ...body.tasks.completedToday] : [];
      for (const tk of tasks) if (![1, 2, 3].includes(tk.priority)) problems.push(`${key}: task ${tk.id} priority ${tk.priority}`);
    }
    ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')} = ${JSON.stringify(body)} satisfies ${t.type};`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fx-check-s-ma.ts'), ts.join('\n') + '\n');
console.log(`${n} fixture bodies written to ${path.join(outDir, 'fx-check-s-ma.ts')}`);
console.log(problems.length ? problems.join('\n') : 'constraints: OK (habit kind / schedule / log status / counts, task priority 1..3, every recorded key kept)');
process.exit(problems.length ? 1 : 0);
