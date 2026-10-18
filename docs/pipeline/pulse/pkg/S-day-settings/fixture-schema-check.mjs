// INT, merge-S-day-settings (2026-10-18): the schema check the orchestrator ruling of 2026-10-17 asks for
// (a fixture value no recording holds is allowed when it is checked against the endpoint's real response type).
// Usage (from frontend/): node ../docs/pipeline/pulse/pkg/S-day-settings/fixture-schema-check.mjs ../docs/pipeline/pulse/pkg/S-day-settings/states.json <main>/.pulse/rec/user/GET_me_prefs_98d539f772.json <outDir>
// then: npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext --moduleResolution bundler --lib ES2023,DOM <outDir>/fx-check.ts
// (outDir must sit directly inside frontend/ so the import of src/lib/lifeos-api resolves).
// Every GET /me/prefs fixture is rebuilt from the recording plus its edits, written as typed TS
// (satisfies { prefs: UserPrefs }), and checked against the B-core route's invariants.
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
    if (e.remove) { delete o[last]; continue; }
    o[last] = e.value;
  }
  return b;
}
const problems = [];
const ts = ["import type { UserPrefs } from '../src/lib/lifeos-api';"];
const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){1,2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
for (const [k, s] of Object.entries(states.states)) {
  for (const fx of s.fixtures || []) {
    if (fx.method !== 'GET' || fx.path !== '/api/v1/me/prefs' || !fx.edits) continue;
    const body = apply(base, fx.edits);
    const p = body.prefs;
    for (const key of Object.keys(base.prefs)) if (!(key in p)) problems.push(`${k}: prefs lacks ${key}`);
    for (const key of Object.keys(p)) if (!(key in base.prefs)) problems.push(`${k}: prefs has unknown ${key}`);
    if (p.timezone !== null && !ZONE.test(p.timezone)) problems.push(`${k}: timezone ${p.timezone}`);
    // a zone, its offset and the logical today come and go together (api.md "The day")
    if ((p.timezone === null) !== (p.utcOffsetMinutes === null) || (p.timezone === null) !== (p.today === null)) problems.push(`${k}: timezone / utcOffsetMinutes / today disagree on null`);
    if (p.utcOffsetMinutes !== null && !(Number.isInteger(p.utcOffsetMinutes) && p.utcOffsetMinutes >= -720 && p.utcOffsetMinutes <= 840)) problems.push(`${k}: utcOffsetMinutes ${p.utcOffsetMinutes}`);
    if (p.today !== null && !DAY.test(p.today)) problems.push(`${k}: today ${p.today}`);
    if (p.timezoneChangeableAt !== null && !Number.isInteger(p.timezoneChangeableAt)) problems.push(`${k}: timezoneChangeableAt`);
    ts.push(`export const ${k.replace(/[^A-Za-z0-9]/g, '_')} = ${JSON.stringify(body)} satisfies { prefs: UserPrefs };`);
  }
}
fs.writeFileSync(`${outDir}/fx-check.ts`, ts.join('\n') + '\n');
console.log(`${ts.length - 1} fixture(s) written; ` + (problems.length ? problems.join('\n') : 'constraints: OK (zone regex, zone / offset / today null together, offset -720..840 int, DayKey, changeableAt int, every recorded key present and no other)'));
