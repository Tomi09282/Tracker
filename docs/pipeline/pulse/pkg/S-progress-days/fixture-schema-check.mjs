#!/usr/bin/env node
// The schema check of the orchestrator rulings of 2026-10-17 / -18 for this package's fixtures
// (states.json), added by the integrator at merge-S-progress-days: GET /lifeos/stats is not recorded
// (the running dev backend has no migration 035 yet), so every body is checked instead
//   GET /lifeos/stats   LifeosStatsResponse   (a contract body)
// against the response type of lib/lifeos-api.ts (B-focus' Phase-6 block) by tsc, and against the
// assembly rules of backend/src/db/tx/lifeos-stats.js, using the backend's own pure helpers
// (backend/src/lifeos/stats.js, dates.js, rules.js, imported read-only):
//   week     from = Monday of today, to = Sunday, daysElapsed = weekday + 1,
//            avgPerDayMinor = round(net / elapsed), net and prevWeekNet = the sums of the day columns
//   days     consecutive, oldest first, the last one today and 'open', net = earned - lost
//   weeks    newest first, 7 days apart from this Monday, ISO week / year by isoWeek(), only the
//            first one current, sums and perfect days equal to the columns wherever the columns cover the week
//   habits   the settled window (first column .. yesterday), every row one cell per window day
//   kcal     the same window, targetKcal = the newest non-null target, over / hit / tracked /
//            window counts recomputed, penalty / reward = the default rules' kcalGoalMissed / kcalGoalHit
//   not started: today, week, habits, kcal null and no days / weeks
// Product code never reads a fixture.
//
// Usage (from frontend/):
//   node ../docs/pipeline/pulse/pkg/S-progress-days/fixture-schema-check.mjs <outDir inside frontend/>
//   npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module esnext \
//       --moduleResolution bundler --lib ES2023,DOM <outDir>/fx-check-s-progress-days.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { mondayOf, isoWeek } = await imp('backend/src/lifeos/stats.js');
const { addDaysToKey, weekdayIndex } = await imp('backend/src/lifeos/dates.js');
const rulesMod = await imp('backend/src/lifeos/rules.js');
const defaults = rulesMod.DEFAULT_RULES ?? rulesMod.defaultRules ?? rulesMod.RULE_DEFAULTS;
if (!defaults) throw new Error('rules.js: no default rule set export found');

const [, , outDir] = process.argv;
if (!outDir) {
  console.error('usage: fixture-schema-check.mjs <outDir inside frontend/>');
  process.exit(2);
}
const states = JSON.parse(fs.readFileSync(path.join(HERE, 'states.json'), 'utf8'));
const problems = [];

function range(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDaysToKey(d, 1)) out.push(d);
  return out;
}

function check(key, b) {
  const p = (m) => problems.push(`${key}: ${m}`);
  if (!b.started) {
    if (b.today !== null || b.week !== null || b.habits !== null || b.kcal !== null) p('not started but today / week / habits / kcal set');
    if (b.days.length || b.weeks.length) p('not started but days / weeks');
    return;
  }
  const today = b.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) return p(`today ${today}`);
  if (b.startedOn && b.startedOn > today) p('startedOn after today');
  const cols = b.days;
  const first = cols[0]?.date;
  if (cols.length < 7 || cols.length > 28) p(`${cols.length} day columns (7..28)`);
  cols.forEach((d, i) => {
    if (i && d.date !== addDaysToKey(cols[i - 1].date, 1)) p(`column ${i} not consecutive`);
    if (d.netMinor !== d.earnedMinor - d.lostMinor) p(`column ${d.date}: net != earned - lost`);
    if (d.lostMinor < 0 || d.earnedMinor < 0) p(`column ${d.date}: negative earned / lost`);
    if (d.date === today ? d.status !== 'open' : !['closed', 'lapsed', 'before_start'].includes(d.status)) p(`column ${d.date}: status ${d.status}`);
    if (d.perfect && d.status !== 'closed') p(`column ${d.date}: perfect but not closed`);
  });
  if (cols.at(-1)?.date !== today) p('the last column is not today');
  const by = new Map(cols.map((d) => [d.date, d]));
  const covered = (a, z) => range(a, z).every((d) => by.has(d));
  const sum = (a, z, f) => range(a, z).reduce((n, d) => n + (by.get(d)?.[f] ?? 0), 0);

  const monday = mondayOf(today);
  const elapsed = weekdayIndex(today) + 1;
  const w = b.week;
  if (w.from !== monday || w.to !== addDaysToKey(monday, 6)) p('week from / to');
  if (w.daysElapsed !== elapsed) p(`week daysElapsed ${w.daysElapsed} != ${elapsed}`);
  if (w.avgPerDayMinor !== Math.round(w.netMinor / elapsed)) p('week avgPerDayMinor != round(net / elapsed)');
  if (covered(monday, today) && w.netMinor !== sum(monday, today, 'netMinor')) p('week netMinor != the columns');
  const prev = addDaysToKey(monday, -7);
  if (covered(prev, addDaysToKey(prev, 6)) && w.prevWeekNetMinor !== sum(prev, addDaysToKey(prev, 6), 'netMinor')) p('prevWeekNetMinor != the columns');

  if (b.weeks.length < 1 || b.weeks.length > 12) p(`${b.weeks.length} weeks (1..12)`);
  b.weeks.forEach((x, i) => {
    const ws = addDaysToKey(monday, -7 * i);
    const we = addDaysToKey(ws, 6);
    if (x.weekStart !== ws || x.weekEnd !== we) p(`week row ${i}: ${x.weekStart}..${x.weekEnd} != ${ws}..${we}`);
    const iso = isoWeek(ws);
    if (x.isoYear !== iso.year || x.isoWeek !== iso.week) p(`week row ${i}: iso ${x.isoYear}-${x.isoWeek} != ${iso.year}-${iso.week}`);
    if (x.current !== (i === 0)) p(`week row ${i}: current`);
    if (x.netMinor !== x.earnedMinor - x.lostMinor) p(`week row ${i}: net != earned - lost`);
    const last = we < today ? we : today;
    if (covered(ws, last)) {
      for (const f of ['netMinor', 'earnedMinor', 'lostMinor']) if (x[f] !== sum(ws, last, f)) p(`week row ${i}: ${f} != the columns`);
      const perfect = range(ws, last).filter((d) => by.get(d).perfect).length;
      if (x.perfectDays !== perfect) p(`week row ${i}: perfectDays ${x.perfectDays} != ${perfect}`);
    }
    if (x.perfectDays < 0 || x.perfectDays > 7 || x.penalties < 0) p(`week row ${i}: perfect / penalties out of range`);
  });
  if (b.weeks[0] && w.netMinor !== b.weeks[0].netMinor) p('week netMinor != the current week row');

  const winTo = addDaysToKey(today, -1);
  const win = range(first, winTo);
  for (const [name, blk] of [['habits', b.habits], ['kcal', b.kcal]]) {
    if (blk.from !== first || blk.to !== winTo) p(`${name} window ${blk.from}..${blk.to} != ${first}..${winTo}`);
  }
  b.habits.rows.forEach((r) => {
    if (r.cells.map((c) => c.date).join() !== win.join()) p(`habit ${r.id}: cells are not the window`);
    if (!r.name || r.name.length > 80) p(`habit ${r.id}: name`);
  });
  if (new Set(b.habits.rows.map((r) => r.id)).size !== b.habits.rows.length) p('duplicate habit ids');
  const k = b.kcal;
  if (k.days.map((d) => d.date).join() !== win.join()) p('kcal days are not the window');
  const withT = k.days.filter((d) => d.targetKcal !== null);
  if (k.targetKcal !== (withT.length ? withT.at(-1).targetKcal : null)) p('kcal targetKcal != the newest target');
  const cnt = (f) => k.days.filter(f).length;
  if (k.overDays !== cnt((d) => d.outcome === 'over')) p('kcal overDays');
  if (k.hitDays !== cnt((d) => d.outcome === 'hit')) p('kcal hitDays');
  if (k.trackedDays !== cnt((d) => ['hit', 'over', 'under'].includes(d.outcome))) p('kcal trackedDays');
  if (k.windowDays !== k.days.length) p('kcal windowDays');
  k.days.forEach((d) => {
    if (d.outcome === 'hit' || d.outcome === 'over' || d.outcome === 'under') {
      if (d.targetKcal === null || d.eatenKcal === null) p(`kcal ${d.date}: an outcome without target / intake`);
      if (d.outcome === 'over' && !(d.eatenKcal > d.targetKcal)) p(`kcal ${d.date}: over but not above the target`);
    }
  });
  if (k.penaltyMinor !== rulesMod.pointsToMinor(defaults.kcalGoalMissed)) p(`kcal penaltyMinor ${k.penaltyMinor} != the default rule ${rulesMod.pointsToMinor(defaults.kcalGoalMissed)}`);
  if (k.rewardMinor !== rulesMod.pointsToMinor(defaults.kcalGoalHit)) p(`kcal rewardMinor ${k.rewardMinor} != the default rule ${rulesMod.pointsToMinor(defaults.kcalGoalHit)}`);
  const o = b.overview;
  if (o.spendableMinor !== Math.max(0, o.balanceMinor)) p('overview spendable != max(0, balance)');
}

const ts = ["import type { LifeosStatsResponse } from '../src/lib/lifeos-api';"];
let n = 0;
for (const [key, st] of Object.entries(states.states)) {
  for (const fx of st.fixtures ?? []) {
    if (fx.method !== 'GET' || (fx.status && fx.status >= 400)) continue;
    if (!/^\/api\/v1\/lifeos\/stats(\?|$)/.test(fx.path)) continue;
    check(key, fx.body);
    ts.push(`export const fx_${n++}_${key.replace(/[^a-z0-9]/gi, '_')} = ${JSON.stringify(fx.body)} satisfies LifeosStatsResponse;`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fx-check-s-progress-days.ts'), ts.join('\n') + '\n');
console.log(`${n} fixture bodies written to ${path.join(outDir, 'fx-check-s-progress-days.ts')}`);
console.log(problems.length ? problems.join('\n') : 'constraints: OK (week, day columns, weeks, habit cells, kcal window and counts, rule figures, overview)');
process.exit(problems.length ? 1 : 0);
