#!/usr/bin/env node
// The schema check of the orchestrator rulings of 2026-10-17 / -18 for this package's fixtures
// (states.json): no response of the challenge routes is recorded (the running dev backend has no
// migration 033), so every body is checked instead
//   GET /challenges/today   ChallengeTodayResponse   (a contract body)
//   GET /challenges         ChallengesResponse       (a contract body)
//   GET /lifeos/today       LifeosToday              (S-ma's edit list over the user@ recording + challenge)
// against the response types of lib/lifeos-api.ts (B-rewards-challenges' Phase-4 block) by tsc, and
// against the ranges migration 033 and the routes enforce: points 0..50, weight 1..5, the five
// categories, at most three DISTINCT options, rerollsLeft 0 | 1, the state machine (empty_pool / due
// carry no options, picked carries `picked` and exactly one chosen option = picked.challengeId),
// the pool's live count within limits.pool, archived flags matching the list.
// Product code never reads a fixture.
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-challenges/fixture-schema-check.mjs <main>/.pulse/rec/user <outDir inside frontend/>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext \
//       --moduleResolution bundler --lib ES2023,DOM <outDir>/fx-check-s-challenges.ts
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
    } else o[last] = e.value;
  }
  return b;
}

const TYPES = [
  { re: /^\/api\/v1\/challenges\/today$/, type: 'ChallengeTodayResponse' },
  { re: /^\/api\/v1\/challenges$/, type: 'ChallengesResponse' },
  { re: /^\/api\/v1\/lifeos\/today$/, type: 'LifeosToday' },
];
const CATS = ['discipline', 'movement', 'mind', 'connection', 'food', null];
const problems = [];

function checkChallenge(where, c) {
  if (!(Number.isInteger(c.points) && c.points >= 0 && c.points <= 50)) problems.push(`${where}: points ${c.points}`);
  if (!(Number.isInteger(c.weight) && c.weight >= 1 && c.weight <= 5)) problems.push(`${where}: weight ${c.weight}`);
  if (!CATS.includes(c.category)) problems.push(`${where}: category ${c.category}`);
  if (c.valueMinor !== c.points * 100) problems.push(`${where}: valueMinor ${c.valueMinor} != points x 100`);
  if (typeof c.name !== 'string' || c.name.length < 1 || c.name.length > 80) problems.push(`${where}: name length`);
  if (c.archived !== (c.archivedAt !== null)) problems.push(`${where}: archived / archivedAt disagree`);
}
function checkDraw(where, d) {
  if (d === null) return;
  if (!['empty_pool', 'due', 'drawn', 'picked'].includes(d.state)) problems.push(`${where}: state ${d.state}`);
  if (![0, 1].includes(d.rerollsLeft)) problems.push(`${where}: rerollsLeft ${d.rerollsLeft}`);
  if (d.options.length > 3) problems.push(`${where}: ${d.options.length} options`);
  if (new Set(d.options.map((o) => o.id)).size !== d.options.length) problems.push(`${where}: options not distinct`);
  if ((d.state === 'empty_pool' || d.state === 'due') && d.options.length) problems.push(`${where}: ${d.state} with options`);
  if (d.state === 'empty_pool' && d.poolCount !== 0) problems.push(`${where}: empty_pool with poolCount ${d.poolCount}`);
  if (d.options.length > d.poolCount) problems.push(`${where}: more options than the pool holds`);
  const chosen = d.options.filter((o) => o.chosen);
  if (d.state === 'picked') {
    if (!d.picked || chosen.length !== 1 || chosen[0].id !== d.picked.challengeId) problems.push(`${where}: picked state inconsistent`);
  } else if (d.picked || chosen.length) problems.push(`${where}: a pick outside the picked state`);
  d.options.forEach((o, i) => {
    checkChallenge(`${where} option ${i}`, o);
    if (o.archived) problems.push(`${where}: an archived option`);
  });
}

const ts = ["import type { ChallengeTodayResponse, ChallengesResponse, LifeosToday } from '../src/lib/lifeos-api';"];
let n = 0;
for (const [key, st] of Object.entries(states.states)) {
  for (const fx of st.fixtures ?? []) {
    if (fx.method !== 'GET' || (fx.status && fx.status >= 400)) continue;
    const t = TYPES.find((x) => x.re.test(fx.path));
    if (!t) continue;
    const base = fx.body ?? recording(fx.path);
    if (base === null) {
      problems.push(`${key}: ${fx.path} has no recording to build from`);
      continue;
    }
    const body = fx.body ?? apply(base, fx.edits);
    if (t.type === 'ChallengeTodayResponse') checkDraw(`${key} draw`, body.draw);
    if (t.type === 'ChallengesResponse') {
      body.active.forEach((c, i) => {
        checkChallenge(`${key} active ${i}`, c);
        if (c.archived) problems.push(`${key}: archived challenge in active`);
      });
      body.archived.forEach((c, i) => {
        checkChallenge(`${key} archived ${i}`, c);
        if (!c.archived) problems.push(`${key}: live challenge in archived`);
      });
      if (body.active.length > body.limits.pool) problems.push(`${key}: ${body.active.length} live over the cap ${body.limits.pool}`);
    }
    if (t.type === 'LifeosToday') {
      checkDraw(`${key} lifeos challenge`, body.challenge);
      const tasks = body.tasks ? [...body.tasks.overdue, ...body.tasks.due, ...body.tasks.completedToday] : [];
      const picked = body.challenge?.picked;
      if (picked && !tasks.some((tk) => tk.id === picked.taskId && tk.challengeId === picked.challengeId)) problems.push(`${key}: the picked task is not in tasks`);
      for (const tk of tasks) if (![1, 2, 3].includes(tk.priority)) problems.push(`${key}: task ${tk.id} priority ${tk.priority}`);
    }
    ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')} = ${JSON.stringify(body)} satisfies ${t.type};`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fx-check-s-challenges.ts'), ts.join('\n') + '\n');
console.log(`${n} fixture bodies written to ${path.join(outDir, 'fx-check-s-challenges.ts')}`);
console.log(problems.length ? problems.join('\n') : 'constraints: OK (points 0..50, weight 1..5, categories, distinct options <= 3, rerollsLeft, the draw state machine, the picked task, the pool cap)');
process.exit(problems.length ? 1 : 0);
