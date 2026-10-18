#!/usr/bin/env node
// The schema check of the orchestrator rulings of 2026-10-17 / -18 for this package's fixtures
// (states.json), added by the integrator at merge-S-rewards: no response of the reward routes is
// recorded (the running dev backend has no migration 033), so every body is checked instead
//   GET /rewards        RewardsResponse        (a contract body)
//   GET /rewards/:id    RewardDetailResponse   (a contract body)
// against the response types of lib/lifeos-api.ts (B-rewards-challenges' Phase-4 block) by tsc, and
// against the backend's own pure shop rules (backend/src/lifeos/rewards.js, imported read-only):
// every reward's availability and progressBp are RECOMPUTED from its cost, kind, cooldown, history
// and the spendable balance and must equal the fixture's; plus spendable = max(0, balance),
// balanceAfterMinor = spendable - cost, whole-coin costs within limits.costMaxMinor, one-time
// rewards without a cooldown, archived / archivedAt agreeing, items live and by cost, archived ones
// archived, redeemableCount = the redeemable items, and the redemptions (same reward, newest first,
// at most 100, fulfilled / fulfilledAt agreeing, count and last day matching the reward).
// Product code never reads a fixture.
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-rewards/fixture-schema-check.mjs <outDir inside frontend/>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext \
//       --moduleResolution bundler --lib ES2023,DOM <outDir>/fx-check-s-rewards.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const { availability, progressBp } = await import(pathToFileURL(path.join(ROOT, 'backend/src/lifeos/rewards.js')).href);

const [, , outDir] = process.argv;
if (!outDir) {
  console.error('usage: fixture-schema-check.mjs <outDir inside frontend/>');
  process.exit(2);
}
const states = JSON.parse(fs.readFileSync(path.join(HERE, 'states.json'), 'utf8'));
const problems = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function checkReward(where, r, spendable, today, costMax, history) {
  if (!(Number.isInteger(r.costMinor) && r.costMinor >= 100 && r.costMinor % 100 === 0 && r.costMinor <= costMax)) problems.push(`${where}: costMinor ${r.costMinor}`);
  if (typeof r.name !== 'string' || r.name.length < 1 || r.name.length > 80) problems.push(`${where}: name length`);
  if (!r.repeatable && r.cooldownDays !== null) problems.push(`${where}: one-time with a cooldown`);
  if (r.cooldownDays !== null && !(Number.isInteger(r.cooldownDays) && r.cooldownDays >= 1 && r.cooldownDays <= 365)) problems.push(`${where}: cooldownDays ${r.cooldownDays}`);
  if (r.archived !== (r.archivedAt !== null)) problems.push(`${where}: archived / archivedAt disagree`);
  if (r.redeemedCount === 0 && r.lastRedeemedOn !== null) problems.push(`${where}: a last day without a redemption`);
  if (r.redeemedCount > 0 && r.lastRedeemedOn === null) problems.push(`${where}: redemptions without a last day`);
  if (history) {
    if (history.length < 100 && history.length !== r.redeemedCount) problems.push(`${where}: redeemedCount ${r.redeemedCount} != ${history.length} redemptions`);
    if (history.length && history[0].localDate !== r.lastRedeemedOn) problems.push(`${where}: lastRedeemedOn != the newest redemption`);
  }
  const want = today
    ? availability({ costMinor: r.costMinor, repeatable: r.repeatable, cooldownDays: r.cooldownDays }, { count: r.redeemedCount, lastOn: r.lastRedeemedOn }, spendable, today)
    : { ok: false, reason: 'TIMEZONE_REQUIRED' };
  if (!same(want, r.availability)) problems.push(`${where}: availability ${JSON.stringify(r.availability)}, the backend rule gives ${JSON.stringify(want)}`);
  if (r.progressBp !== progressBp(r.costMinor, spendable)) problems.push(`${where}: progressBp ${r.progressBp} != ${progressBp(r.costMinor, spendable)}`);
  if (r.balanceAfterMinor !== spendable - r.costMinor) problems.push(`${where}: balanceAfterMinor ${r.balanceAfterMinor} != ${spendable - r.costMinor}`);
}

const ts = ["import type { RewardsResponse, RewardDetailResponse } from '../src/lib/lifeos-api';"];
let n = 0;
// The detail has no `today`: take the logical day of the shop fixtures (they all share one).
const shopToday = Object.values(states.states)
  .flatMap((st) => st.fixtures ?? [])
  .find((fx) => fx.method === 'GET' && /\/rewards$/.test(fx.path) && !(fx.status >= 400))?.body?.today ?? null;

for (const [key, st] of Object.entries(states.states)) {
  for (const fx of st.fixtures ?? []) {
    if (fx.method !== 'GET' || (fx.status && fx.status >= 400)) continue;
    const body = fx.body;
    if (/^\/api\/v1\/rewards$/.test(fx.path)) {
      if (body.spendableMinor !== Math.max(0, body.balanceMinor)) problems.push(`${key}: spendable != max(0, balance)`);
      if (body.started !== (body.today !== null)) problems.push(`${key}: started / today disagree`);
      body.items.forEach((r, i) => {
        checkReward(`${key} item ${i}`, r, body.spendableMinor, body.today, body.limits.costMaxMinor);
        if (r.archived) problems.push(`${key}: archived reward in items`);
        if (i && body.items[i - 1].costMinor > r.costMinor) problems.push(`${key}: items not by cost`);
      });
      body.archived.forEach((r, i) => {
        checkReward(`${key} archived ${i}`, r, body.spendableMinor, body.today, body.limits.costMaxMinor);
        if (!r.archived) problems.push(`${key}: live reward in archived`);
      });
      if (body.items.length > body.limits.rewards) problems.push(`${key}: ${body.items.length} over the cap ${body.limits.rewards}`);
      const redeemable = body.items.filter((r) => r.availability.ok).length;
      if (body.redeemableCount !== redeemable) problems.push(`${key}: redeemableCount ${body.redeemableCount} != ${redeemable}`);
      ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')} = ${JSON.stringify(body)} satisfies RewardsResponse;`);
    } else if (/^\/api\/v1\/rewards\/\d+$/.test(fx.path)) {
      const id = Number(fx.path.split('/').pop());
      if (body.reward.id !== id) problems.push(`${key}: reward.id ${body.reward.id} != path id ${id}`);
      if (body.redemptions.length > 100) problems.push(`${key}: more than 100 redemptions`);
      body.redemptions.forEach((x, i) => {
        if (x.rewardId !== id) problems.push(`${key}: redemption ${i} of another reward`);
        if (x.fulfilled !== (x.fulfilledAt !== null)) problems.push(`${key}: redemption ${i} fulfilled / fulfilledAt disagree`);
        if (i && body.redemptions[i - 1].redeemedAt < x.redeemedAt) problems.push(`${key}: redemptions not newest first`);
      });
      checkReward(`${key} reward`, body.reward, body.spendableMinor, shopToday, 1_000_000, body.redemptions);
      ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')} = ${JSON.stringify(body)} satisfies RewardDetailResponse;`);
    }
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fx-check-s-rewards.ts'), ts.join('\n') + '\n');
console.log(`${n} fixture bodies written to ${path.join(outDir, 'fx-check-s-rewards.ts')} (logical day ${shopToday})`);
console.log(problems.length ? problems.join('\n') : 'constraints: OK (availability and progressBp recomputed by the backend rule, spendable, balanceAfter, costs, one-time, archived, order, redeemableCount, redemptions)');
process.exit(problems.length ? 1 : 0);
