// INT, merge-S-workout (2026-10-17): the schema check the orchestrator ruling of 2026-10-17 asks for.
// Usage (from frontend/): node ../docs/pipeline/pulse/pkg/S-workout/fixture-schema-check.mjs ../docs/pipeline/pulse/pkg/S-workout/states.json <main>/.pulse/rec/user/GET_workouts_current_dc8781770d.json <outDir>
// then: npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext --moduleResolution bundler --lib ES2023,DOM <outDir>/fx-check.ts
// (outDir must sit inside frontend/ so the import of src/features/workout/useWorkout resolves).
// Rebuild the refused S-workout fixtures from the recording, write them as typed TS, and check the DB constraints.
import fs from 'node:fs';
const [,, statesFile, recFile, outDir] = process.argv;
const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'));
const base = JSON.parse(fs.readFileSync(recFile, 'utf8')).body;
const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');
function apply(body, edits) {
  const b = structuredClone(body);
  for (const e of edits) {
    const parts = e.pointer.split('/').slice(1).map(unesc);
    const last = parts.pop();
    let o = b; for (const p of parts) o = o[p];
    if (e.remove) { Array.isArray(o) ? o.splice(+last, 1) : delete o[last]; continue; }
    if (Array.isArray(o) && last === '-') o.push(e.value); else o[last] = e.value;
  }
  return b;
}
const problems = [];
const ts = ["import type { LogSet, LogExercise, WorkoutLog, CheckOutcome } from '../src/features/workout/useWorkout';",
  "type Loose<T> = T & Record<string, unknown>; type Current = { log: Loose<WorkoutLog> | null; exercises: Loose<LogExercise>[]; sets: Loose<LogSet & { voided_reason: string | null }>[] };"];
for (const k of ['workout-withdrawn', 'workout-interval-idle']) {
  const fx = states.states[k].fixtures.find((f) => f.method === 'GET' && f.path === '/api/v1/workouts/current');
  const body = apply(base, fx.edits);
  // backend constraints (migration 010): block_kind CHECK, target_seconds integer 1..7200, voided_reason <= 200 and set when voided
  for (const ex of body.exercises) if (!['single','superset','circuit','emom','amrap', null].includes(ex.block_kind)) problems.push(`${k}: block_kind ${ex.block_kind}`);
  for (const s of body.sets) {
    if (s.target_seconds != null && !(Number.isInteger(s.target_seconds) && s.target_seconds >= 1 && s.target_seconds <= 7200)) problems.push(`${k}: target_seconds ${s.target_seconds}`);
    if (s.voided_at != null && (typeof s.voided_reason !== 'string' || s.voided_reason.length > 200)) problems.push(`${k}: voided_reason`);
    if (s.voided_at != null && !Number.isInteger(s.voided_at)) problems.push(`${k}: voided_at`);
    for (const key of Object.keys(base.sets[0])) if (!(key in s)) problems.push(`${k}: set ${s.id} lacks ${key}`);
  }
  for (const ex of body.exercises) for (const key of Object.keys(base.exercises[0])) if (!(key in ex)) problems.push(`${k}: exercise ${ex.id} lacks ${key}`);
  ts.push(`export const ${k.replace(/-/g, "_")}: Current = ${JSON.stringify(body)};`);
}
const post = states.overrides['workout-2'].fixtures.find((f) => f.method === 'POST');
ts.push(`export const workout_2_check = ${JSON.stringify(post.body)} satisfies CheckOutcome;`);
fs.writeFileSync(`${outDir}/fx-check.ts`, ts.join('\n') + '\n');
console.log(problems.length ? problems.join('\n') : 'constraints: OK (block_kind enum, target_seconds 1..7200 int, voided_reason, every recorded column present)');
