#!/usr/bin/env node
// One-off migration of the LifeOS packages' capture fixtures to the B-lifeos-polish / S-lifeos-polish answers.
//
// Since B-lifeos-polish GET /tasks carries `rulesVersion` + `taskRules` and GET /lifeos/today carries `taskRules`;
// since S-lifeos-polish GET /lifeos/today also carries `dayRules`. The fixture bodies written before them lack the
// keys (their schema checks went red). This adds the admin DEFAULT figures (rules.js DEFAULT_RULES) wherever a fixture
// answers one of the two routes and does not carry them. Idempotent. Run after the generators:
//   node S-ma/make-states.mjs && node S-calendar/make-states.mjs && node S-challenges/make-states.mjs
//   node S-lifeos-polish/migrate-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASK_RULES = { lowMinor: 500, midMinor: 1000, highMinor: 2000, latePct: 50, overdueMinor: 500 };
const DAY_RULES = { habitMinor: 1000, streakTier1Days: 7, streakTier1MultBp: 12500, perfectDayMinor: 2500 };
const EMPTY_FOCUS = { current: null, todayMinutes: 0, todaySessions: 0, todayEarnedMinor: 0, maxMinutesPerDay: 480 };
const PACKAGES = ['S-ma', 'S-tasks', 'S-habits', 'S-challenges', 'S-rewards', 'S-calendar', 'S-focus', 'S-progress-days'];

/** A picked draw gains B-lifeos-polish's picked.title / valueMinor / paidMinor (walks any fixture value). */
function fillPicked(node) {
  let n = 0;
  if (Array.isArray(node)) { for (const x of node) n += fillPicked(x); return n; }
  if (!node || typeof node !== 'object') return 0;
  if (node.state === 'picked' && Array.isArray(node.options) && node.picked && node.picked.title === undefined) {
    const chosen = node.options.find((o) => o.chosen);
    node.picked.title = chosen?.name ?? null;
    node.picked.valueMinor = chosen?.valueMinor ?? null;
    node.picked.paidMinor = node.picked.done ? (chosen?.valueMinor ?? null) : null;
    n++;
  }
  for (const v of Object.values(node)) n += fillPicked(v);
  return n;
}

let changed = 0;
for (const pkg of PACKAGES) {
  const file = path.join(PKG, pkg, 'states.json');
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  let touched = 0;
  for (const state of Object.values(doc.states)) {
    touched += fillPicked(state.fixtures ?? []);
    for (const fx of state.fixtures ?? []) {
      if (fx.path === '/api/v1/tasks' && fx.body && fx.status === undefined && 'started' in fx.body) {
        if (fx.body.rulesVersion === undefined) { fx.body.rulesVersion = 1; touched++; }
        if (fx.body.taskRules === undefined) { fx.body.taskRules = TASK_RULES; touched++; }
      }
      if (fx.path === '/api/v1/lifeos/today' && Array.isArray(fx.edits)) {
        const has = (p) => fx.edits.some((e) => e.pointer === p);
        if (!has('/taskRules')) { fx.edits.push({ pointer: '/taskRules', value: TASK_RULES, add: true }); touched++; }
        // Ma's whole answer carries nextEvent and focus (required by LifeosToday since B-calendar / B-focus): S-challenges' Ma states predate them.
        if (pkg === 'S-challenges' && has('/habits')) {
          if (!has('/nextEvent')) { fx.edits.push({ pointer: '/nextEvent', value: null, add: true }); touched++; }
          if (!has('/focus')) { fx.edits.push({ pointer: '/focus', value: EMPTY_FOCUS, add: true }); touched++; }
        }
        if (!has('/dayRules')) { fx.edits.push({ pointer: '/dayRules', value: DAY_RULES, add: true }); touched++; }
      }
    }
  }
  // S-focus' Ma state is the whole of ma-1 since S-lifeos-polish (NAPI DOBÁS above FÓKUSZ, KÖVETKEZŐ below TÁPLÁLKOZÁS: review S-focus 9):
  // S-ma's ma-1 itself already carries the planned block, so the state is that one with its own title.
  if (pkg === 'S-focus' && doc.states['ma-focus']) {
    const sma = JSON.parse(fs.readFileSync(path.join(PKG, 'S-ma', 'states.json'), 'utf8')).states['ma-1'];
    const mine = doc.states['ma-focus'];
    doc.states['ma-focus'] = { ...structuredClone(sma), title: mine.title, why: `${mine.why} (the whole frame lifeos/ma-1: S-ma's ma-1 fixtures, S-lifeos-polish)` };
    touched++;
  }
  // S-rewards: a missing / foreign reward answers 404 and says so (review S-rewards 6): the state that shows rewards.gone.
  if (pkg === 'S-rewards' && !doc.states['reward-gone']) {
    doc.states['reward-gone'] = {
      title: 'Jutalom — nem érhető el (404)',
      account: 'M',
      route: '/rewards/999999',
      height: 874,
      reach: 'fixture',
      why: 'a reward that is not there, or from another account (the same 404, anti-IDOR): the danger line "Ez a jutalom nem érhető el" with the way back to Jutalmak, nothing to retry (review S-rewards 6, as habit-gone)',
      fixtures: [{ method: 'GET', path: '/api/v1/rewards/999999', status: 404, body: { error: 'not found', code: 'not_found', requestId: 'fixture' } }],
      expect: { requests: [{ path: '/api/v1/rewards/999999', status: 404 }], console: ['404'] },
      arrived: { text: { key: 'rewards.gone' } },
    };
    touched++;
  }
  if (touched) {
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`${pkg}: ${touched} fixture key(s) added`);
    changed += touched;
  }
}
console.log(changed ? `migrated ${changed}` : 'nothing to migrate');
