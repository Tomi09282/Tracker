#!/usr/bin/env node
// Writes docs/pipeline/pulse/pkg/S-challenges/states.json — the capture states of MAI DOBÁS
// (/challenges, frame lifeos/challenges-1), KIHÍVÁSOK (/challenges/pool, lifeos/challenges-2), the
// challenge sheet, and Ma's NAPI DOBÁS block (lifeos/ma-4 pending draw, ma-1 picked, ma-2 done).
//
// The running dev backend has no migration 033 (B-rewards-challenges is not merged), so nothing of
// the challenge routes is recorded:
//   GET /challenges/today, GET /challenges   contract BODIES typed by lib/lifeos-api.ts (the Phase-4
//                                            block of B-rewards-challenges' shared.patch) and checked
//                                            by fixture-schema-check.mjs
//   GET /lifeos/today (Ma)                   S-ma's own edit lists for ma-1 / ma-2 / ma-4 (its
//                                            states.json, read here, never copied by hand) + the
//                                            Phase-4 key `challenge` added with `"add": true`, and
//                                            for ma-1 / ma-2 the task the pick became
// Every state is therefore "matched-fixture" at best (orchestrator rulings of 2026-10-17 / -18).
// Nothing is written: no state fires a write (the draw, the reroll and the pick are not tapped).
//
// Usage: node docs/pipeline/pulse/pkg/S-challenges/make-states.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const at = (iso) => Math.round(Date.parse(iso) / 1000);
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ── the pool of challenges-2 (lib/lifeos-api.ts Challenge) ──────────────────────────────────── */

const ch = (id, name, category, points, weight, archivedAt = null) => ({
  id,
  name,
  category,
  points,
  weight,
  valueMinor: points * 100,
  archived: archivedAt !== null,
  archivedAt: archivedAt === null ? null : at(archivedAt),
});

// challenges-2's AKTÍV rows, in the frame's order (the server lists by name; see deviations.md).
const ACTIVE = [
  ch(1, 'Hideg zuhany, 2 perc', 'discipline', 20, 3),
  ch(2, '10 perc nyújtás lefekvés előtt', 'movement', 15, 4),
  ch(3, 'Olvass el 20 oldalt', 'mind', 15, 3),
  ch(4, '10 000 lépés', 'movement', 25, 2),
  ch(5, 'Nincs telefon vacsoránál', 'discipline', 10, 3),
  ch(6, 'Írj köszönő üzenetet valakinek', 'connection', 10, 2),
  ch(7, '30 fekvőtámasz', 'movement', 15, 4),
  ch(8, 'Főzz magadnak ebédet', 'food', 20, 1),
];
const ARCHIVED = [ch(9, 'Futás, 5 km', 'movement', 15, 2, '2026-10-02T19:00:00+02:00'), ch(10, '10 perc meditáció', 'mind', 15, 2, '2026-10-09T08:00:00+02:00')];

const option = (c, chosen = false) => ({ ...c, chosen });

const draw = (o) => ({
  date: o.date,
  state: o.state,
  poolCount: o.poolCount ?? ACTIVE.length,
  options: o.options ?? [],
  rerollsLeft: o.rerollsLeft ?? 1,
  picked: o.picked ?? null,
});

// challenges-1 (Wednesday 21 October): Hideg zuhany, 2 perc · 10 perc nyújtás · Olvass el 20 oldalt.
const DAY = '2026-10-21';
const DRAWN = draw({ date: DAY, state: 'drawn', options: [option(ACTIVE[0]), option(ACTIVE[1]), option(ACTIVE[2])] });
const PICKED = draw({
  date: DAY,
  state: 'picked',
  options: [option(ACTIVE[0]), option(ACTIVE[1], true), option(ACTIVE[2])],
  picked: { challengeId: 2, taskId: 950, pickedAt: at('2026-10-21T07:36:00+02:00'), done: false, taskDeleted: false },
});

/* ── Ma (S-ma's frame states + the Phase-4 key) ───────────────────────────────────────────────── */

const MA = JSON.parse(fs.readFileSync(path.join(HERE, '../S-ma/states.json'), 'utf8')).states;

/** The task a pick became (lib/lifeos-api.ts Task): title = the challenge's name, priority 2, due today with no time. */
const challengeTask = (id, c, day, done) => ({
  id,
  title: c.name,
  notes: null,
  priority: 2,
  points: c.points,
  dueOn: day,
  dueTime: null,
  recurrence: null,
  isTemplate: false,
  parentTaskId: null,
  completedAt: done ? at(`${day}T08:10:00+02:00`) : null,
  completedOn: done ? day : null,
  overdueOn: null,
  valueMinor: c.valueMinor,
  lateNow: false,
  payoutNowMinor: c.valueMinor,
  paidMinor: done ? c.valueMinor : null,
  overduePenaltyMinor: null,
  challengeId: c.id,
});

/** S-ma's state with `challenge` added to GET /lifeos/today (and the picked task put into `tasks`). */
function maWith(key, challenge, task, extra) {
  const base = clone(MA[key]);
  const fx = base.fixtures.find((f) => f.path === '/api/v1/lifeos/today');
  fx.edits.push({ pointer: '/challenge', value: challenge, add: true });
  const tasks = fx.edits.find((e) => e.pointer === '/tasks');
  // Phase 4: every Task carries challengeId (null for a task that was not picked from the draw).
  for (const list of [tasks.value.overdue, tasks.value.due, tasks.value.completedToday]) for (const tk of list) tk.challengeId ??= null;
  if (task) (task.completedAt ? tasks.value.completedToday : tasks.value.due).push(task);
  return { ...base, ...extra };
}

// ma-4's own demo texts (they differ from challenges-1's; README-ma). The sub line is the category: the
// API carries no time of day ("reggel", "bármikor") and "Test" / "Pihenés" are not categories.
const M4 = [ch(21, 'Hideg zuhany 2 percig', 'discipline', 15, 2), ch(22, '30 fekvőtámasz a nap folyamán', 'movement', 15, 2), ch(23, 'Egy óra képernyő nélkül', 'mind', 20, 2)];
// ma-1 (Monday 19): "Lift helyett lépcső egész nap", +15, elvállalva. ma-2 (Tuesday 20): "Hideg zuhany" ticked.
const M1 = ch(31, 'Lift helyett lépcső egész nap', 'movement', 15, 2);
const M2 = ch(32, 'Hideg zuhany 2 percig', 'discipline', 15, 2);
const others = [ch(33, 'Olvass el 20 oldalt', 'mind', 15, 3), ch(34, '10 000 lépés', 'movement', 25, 2)];

const pickedDraw = (date, c, taskId, done) =>
  draw({
    date,
    state: 'picked',
    options: [option(c, true), ...others.map((o) => option(o))],
    picked: { challengeId: c.id, taskId, pickedAt: at(`${date}T07:40:00+02:00`), done, taskDeleted: false },
  });

/* ── the states ───────────────────────────────────────────────────────────────────────────────── */

const todayBody = (d) => ({ method: 'GET', path: '/api/v1/challenges/today', body: { started: d !== null, draw: d } });
const poolBody = (active, archived) => ({ method: 'GET', path: '/api/v1/challenges', body: { active, archived, limits: { pool: 50 } } });
const WHY = 'GET /challenges* is answered by a contract body (the running dev backend has no migration 033 yet) -> matched-fixture at best';

const states = {
  'challenges-1': {
    title: 'Mai dobás — a keret (szerda, október 21., egy lehetőség kiválasztva)',
    frame: 'lifeos/challenges-1',
    account: 'M',
    route: '/challenges?option=2',
    height: 874,
    clock: '2026-10-21T07:35:00+02:00',
    reach: 'fixture',
    why: `the frame state: three options, "10 perc nyújtás lefekvés előtt" chosen (reached from Ma's NAPI DOBÁS, ?option=2), one reroll left, the pill. ${WHY}`,
    fixtures: [todayBody(DRAWN), poolBody(ACTIVE, ARCHIVED)],
    arrived: { text: { key: 'challenges.noPick' } },
  },
  'challenges-1-open': {
    title: 'Mai dobás — még nincs választás',
    account: 'M',
    route: '/challenges',
    height: 874,
    clock: '2026-10-21T07:35:00+02:00',
    reach: 'fixture',
    why: `nothing chosen yet: every "+N" in text-2, the pill off. ${WHY}`,
    fixtures: [todayBody(DRAWN)],
    arrived: { text: { key: 'challenges.noPick' } },
  },
  'challenges-1-picked': {
    title: 'Mai dobás — elvállalva',
    account: 'M',
    route: '/challenges',
    height: 874,
    clock: '2026-10-21T07:40:00+02:00',
    reach: 'fixture',
    why: `after "Ezt vállalom": the chosen option ticked with "elvállalva", the others in text-3, no reroll, no pill. ${WHY}`,
    fixtures: [todayBody(PICKED)],
    arrived: { text: { key: 'challenges.state.accepted' } },
  },
  'challenges-empty': {
    title: 'Mai dobás — üres a kihívások listája',
    account: 'M',
    route: '/challenges',
    height: 874,
    clock: '2026-10-21T07:35:00+02:00',
    reach: 'fixture',
    why: `state empty_pool: the empty state leads to the pool. ${WHY}`,
    fixtures: [todayBody(draw({ date: DAY, state: 'empty_pool', poolCount: 0, rerollsLeft: 1 }))],
    arrived: { text: { key: 'challenges.emptyTitle' } },
  },
  'challenges-no-zone': {
    title: 'Mai dobás — nincs még időzóna',
    account: 'M',
    route: '/challenges',
    height: 874,
    reach: 'fixture',
    why: `draw null before the zone is set: the line leads to "Nap és időzóna". ${WHY}`,
    fixtures: [todayBody(null)],
    arrived: { text: { key: 'challenges.noZone' } },
  },
  'challenges-failed': {
    title: 'Mai dobás — a lekérés nem sikerült',
    account: 'M',
    route: '/challenges',
    height: 874,
    reach: 'fixture',
    why: 'a failed read: the danger line with "Újra" (GET /challenges/today answered 500)',
    fixtures: [{ method: 'GET', path: '/api/v1/challenges/today', status: 500, body: { error: 'internal error', code: 'internal', requestId: 'fixture' } }],
    expect: { requests: [{ path: '/api/v1/challenges/today', status: 500 }], console: ['500'] },
    arrived: { role: 'button', name: { key: 'common.retry' } },
  },
  'challenges-2': {
    title: 'Kihívások — a keret (8 / 50, két archivált)',
    frame: 'lifeos/challenges-2',
    account: 'M',
    route: '/challenges/pool',
    height: 1126,
    clock: '2026-10-21T07:40:00+02:00',
    reach: 'fixture',
    why: `the frame state: eight live challenges with weight and coins, two archived. The frame's mid-swipe row ("30 fekvőtámasz" with Archiválás revealed) is not a state the kit row has (no swipe): it is drawn at rest. ${WHY}`,
    fixtures: [poolBody(ACTIVE, ARCHIVED)],
    arrived: { text: { key: 'challenges.poolRule' } },
  },
  'challenges-pool-empty': {
    title: 'Kihívások — még nincs kihívás',
    account: 'M',
    route: '/challenges/pool',
    height: 874,
    reach: 'fixture',
    why: `an empty pool: the empty state with "+ Új kihívás". ${WHY}`,
    fixtures: [poolBody([], [])],
    arrived: { text: { key: 'challenges.emptyTitle' } },
  },
  'challenge-sheet-new': {
    title: 'Új kihívás — a lap',
    account: 'M',
    route: '/challenges/pool?new=1',
    height: 874,
    reach: 'fixture',
    why: `the header plus opens the sheet (round B does not draw it: built from the kit as habit-form / task-form). ${WHY}`,
    fixtures: [poolBody(ACTIVE, ARCHIVED)],
    arrived: { role: 'dialog' },
  },
  'challenge-sheet-edit': {
    title: 'Kihívás szerkesztése — Hideg zuhany, 2 perc',
    account: 'M',
    route: '/challenges/pool',
    height: 874,
    reach: 'fixture',
    why: `a row opens the same sheet in edit mode: Mentés, Archiválás, Törlés. ${WHY}`,
    fixtures: [poolBody(ACTIVE, ARCHIVED)],
    steps: [{ click: { role: 'button', name: { re: '^Hideg zuhany, 2 perc' } }, arrived: { role: 'dialog' } }],
    arrived: { role: 'dialog' },
  },
  'ma-4-draw': maWith('ma-4', draw({ date: DAY, state: 'drawn', options: M4.map((c) => option(c)), poolCount: 8 }), null, {
    title: 'Ma — szerda reggel, a napi dobás vár',
    why: `ma-4's subject: NAPI DOBÁS above MAI EDZÉS with three options and "Újradobás · 1". S-ma's ma-4 edit list + the Phase-4 key challenge (add) -> matched-fixture. ${WHY}`,
    arrived: { text: { key: 'challenges.today.hint' } },
  }),
  'ma-1-picked': maWith('ma-1', pickedDraw('2026-10-19', M1, 951, false), challengeTask(951, M1, '2026-10-19', false), {
    title: 'Ma — edzésnap, a napi kihívás elvállalva',
    why: `ma-1's NAPI DOBÁS teaser: "Lift helyett lépcső egész nap", "Mai kihívás · +15 érme", ELVÁLLALVA, after FELADATOK (FÓKUSZ and KÖVETKEZŐ are later phases). S-ma's ma-1 edit list + challenge (add) + the picked task -> matched-fixture`,
    arrived: { text: { key: 'challenges.state.accepted' } },
  }),
  'ma-2-done': maWith('ma-2', pickedDraw('2026-10-20', M2, 952, true), challengeTask(952, M2, '2026-10-20', true), {
    title: 'Ma — pihenőnap, a napi kihívás teljesítve',
    why: `ma-2's challenge ticked ("teljesítve"), and "Ma eddig" now carries its +15 (+68 as drawn). S-ma's ma-2 edit list + challenge (add) + the completed task -> matched-fixture`,
    arrived: { text: { key: 'challenges.state.done' } },
  }),
};

const out = {
  about:
    'S-challenges - MAI DOBÁS (/challenges), KIHÍVÁSOK (/challenges/pool), the challenge sheet and Ma\'s NAPI DOBÁS (design round B frames lifeos/challenges-1, challenges-2, ma-4; ma-1 / ma-2 for the picked teaser). Account M = user@tracker.local. Written by make-states.mjs (edit that file, not this one). The running dev backend has no migration 033: the challenge reads are contract bodies typed by lib/lifeos-api.ts (B-rewards-challenges\' Phase-4 block), checked by fixture-schema-check.mjs; Ma\'s GET /lifeos/today is S-ma\'s edit list + the Phase-4 key challenge. Nothing is written live.',
  states,
};
fs.writeFileSync(path.join(HERE, 'states.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${Object.keys(states).length} states -> ${path.join(HERE, 'states.json')}`);
