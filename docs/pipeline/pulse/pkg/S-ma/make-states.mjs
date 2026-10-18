#!/usr/bin/env node
// Writes docs/pipeline/pulse/pkg/S-ma/states.json — the capture states of the Ma page (package S-ma).
//
// Why a generator: the four frames share one seed (README-ma fix rounds 1-2: Monday 19 October,
// then Tuesday and Wednesday following on), and the habits / tasks of GET /lifeos/today are long
// objects. Writing them once here keeps every state's numbers consistent with each other and with
// the response types in frontend/src/lib/lifeos-api.ts (checked by fixture-schema-check.mjs).
//
// Every fixture is an EDIT LIST over a recording of the same endpoint (PLAN R26):
//   GET /lifeos/today     the B-core recording of user@ (no Phase-3 fields yet: the running dev backend
//                         has no migration 032) + the Phase-3 keys `habits` / `tasks` added with
//                         `"add": true` — refused by pulse-fixture-check ("key") until a 032 recording
//                         exists; schema-checked instead (orchestrator rulings of 2026-10-17 / -18:
//                         such a frame is "matched-fixture", never "matched")
//   GET /my-plans/today   the home-1 fixture's edits (the plan day of the frame)
//   GET /my-plans/week    built `from` the recorded week (tomorrow's session on the rest day)
//   GET /nutrition-log/*  built `from` a recorded day, totals and targets edited
//
// Usage: node docs/pipeline/pulse/pkg/S-ma/make-states.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const at = (iso) => Math.round(Date.parse(iso) / 1000);

/* ── the habit and task objects (lib/lifeos-api.ts Habit / Task) ──────────────────────────────── */

const habit = (o) => ({
  id: o.id,
  name: o.name,
  kind: o.kind ?? 'good',
  scheduleType: o.scheduleType ?? 'daily',
  weekdayMask: 127,
  timesPerWeek: null,
  targetCount: o.target ?? 1,
  unit: o.unit ?? null,
  pointsSuccess: o.kind === 'bad' ? 15 : 10,
  pointsPenalty: 5,
  reminderTime: o.reminder ?? null,
  sortOrder: o.id,
  startedOn: '2026-08-03',
  archived: false,
  scheduledToday: true,
  log: o.log ?? null,
  streak: { current: o.streak, best: o.best ?? o.streak, freezes: o.freezes ?? 0, multiplierBp: o.mult ?? 10000, weekStreak: null },
  weekDone: null,
  previewMinor: o.preview ?? 0,
  fullMinor: o.full ?? 1000,
});

const log = (date, count, status, doneAt = null) => ({ date, count, status, doneAt });

const task = (o) => ({
  id: o.id,
  title: o.title,
  notes: null,
  priority: o.priority,
  points: null,
  dueOn: o.dueOn,
  dueTime: o.dueTime ?? null,
  recurrence: o.recurrence ?? null,
  isTemplate: false,
  parentTaskId: o.recurrence ? o.id + 100 : null,
  completedAt: o.completedAt ?? null,
  completedOn: o.completedAt ? o.dueOn : null,
  overdueOn: null,
  valueMinor: o.value,
  lateNow: false,
  payoutNowMinor: o.completedAt ? null : o.value,
  paidMinor: o.completedAt ? o.value : null,
  overduePenaltyMinor: null,
  challengeId: null, // B-rewards-challenges (033): Task.challengeId is required; Ma picks no challenge yet
});

/* ── edit helpers ─────────────────────────────────────────────────────────────────────────────── */

const set = (pointer, value) => ({ pointer, value });
const add = (pointer, value) => ({ pointer, value, add: true });

/** GET /lifeos/today over the B-core recording of user@. */
function lifeos({ today, balance, xp, level, floor, next, earned, due, done, habits, tasks }) {
  return {
    method: 'GET',
    path: '/api/v1/lifeos/today',
    edits: [
      set('/started', true),
      set('/startedOn', '2026-08-03'),
      set('/today', today),
      set('/settledThrough', prevDay(today)),
      set('/wallet/balanceMinor', balance * 100),
      set('/wallet/spendableMinor', Math.max(0, balance) * 100),
      set('/wallet/xp', xp),
      set('/wallet/level', level),
      set('/wallet/bounds/levelFloorXp', floor),
      set('/wallet/bounds/nextLevelXp', next),
      set('/wallet/today', today),
      set('/wallet/todayEarnedMinor', earned),
      set('/workout/date', today),
      set('/workout/due', due),
      set('/workout/done', done),
      add('/habits', habits),
      add('/tasks', tasks),
      add('/challenge', null), // B-rewards-challenges (033): no draw drawn on Ma yet (NAPI DOBÁS is not on the page)
    ],
  };
}

const prevDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** GET /my-plans/today: the recorded rest day of user@, turned into the frame's day (as fixture home-1). */
function planToday(date, day) {
  return {
    method: 'GET',
    path: '/api/v1/my-plans/today',
    edits: [
      set('/date', date),
      set('/days/0/date', date),
      set('/days/0/day_name', day.name),
      set('/days/0/is_rest', day.rest ? 1 : 0),
      set('/days/0/est_minutes', day.rest ? null : 65),
      set('/days/0/start_time', day.rest ? null : '18:00'),
      set('/days/0/exercise_count', day.rest ? 0 : day.exercises),
      ...(day.plan ? [set('/days/0/plan_name', day.plan)] : []),
      set('/days/0/log_id', null),
      set('/days/0/log_status', null),
    ],
  };
}

/** GET /workouts/current with no session (the seed leaves user@ mid-session; fixture home-1 does the same). */
const noSession = {
  method: 'GET',
  path: '/api/v1/workouts/current',
  edits: [set('/log', null), set('/exercises', []), set('/sets', [])],
};

/** GET /nutrition-log/<date> built from the recorded 15 October, totals and targets set. */
function nutrition(date, kcal, protein) {
  return {
    method: 'GET',
    path: `/api/v1/nutrition-log/${date}`,
    from: { path: '/api/v1/nutrition-log/2026-10-15' },
    edits: [
      set('/date', date),
      set('/totals/kcal', kcal),
      set('/totals/protein_g', protein),
      set('/targets/kcal_target', 2600),
      set('/targets/protein_g_target', 180),
    ],
  };
}

const arrivedHero = { text: { key: 'today.hero.label' } };

/* ── ma-1 · Monday 19 October 2026, 13:20: a training day ────────────────────────────────────── */

const MON = '2026-10-19';
const ma1Habits = [
  habit({ id: 1, name: 'Olvasás 20 perc', log: log(MON, 1, 'done', at('2026-10-19T07:40:00+02:00')), streak: 14, mult: 12500, preview: 1300, full: 1300 }),
  habit({ id: 2, name: 'Víz', target: 8, unit: 'pohár', log: log(MON, 5, 'pending'), streak: 9, preview: 500 }),
  habit({ id: 3, name: 'Nyújtás 10 perc', reminder: '21:30', streak: 31, best: 45, freezes: 1, mult: 15000, full: 1500 }),
  habit({ id: 6, name: 'Esti nassolás', kind: 'bad', log: log(MON, 1, 'relapse'), streak: 4, preview: -1000, full: 1500 }),
];
const ma1Tasks = {
  due: [
    task({ id: 11, title: 'Befizetni a villanyszámlát', priority: 3, dueOn: MON, dueTime: '17:00', value: 2000 }),
    task({ id: 12, title: 'Bevásárlás: zab, tojás, túró', priority: 2, dueOn: MON, dueTime: '19:00', value: 1000 }),
    task({ id: 13, title: 'Felhívni anyát', priority: 2, dueOn: MON, dueTime: '20:00', value: 1000, recurrence: { type: 'weekly', weekdayMask: 9 } }),
    task({ id: 14, title: 'Kiválogatni a téli ruhákat', priority: 1, dueOn: MON, value: 500 }),
  ],
  overdue: [],
  completedToday: [
    task({ id: 15, title: 'Kivinni a szemetet', priority: 1, dueOn: MON, value: 500, completedAt: at('2026-10-19T08:10:00+02:00') }),
    task({ id: 16, title: 'Időpontot foglalni a fodrászhoz', priority: 1, dueOn: MON, value: 500, completedAt: at('2026-10-19T09:30:00+02:00') }),
  ],
  anytimeCount: 0,
  openCount: 4,
};
const ma1 = {
  title: 'Ma — edzésnap (a keret)',
  frame: 'lifeos/ma-1',
  account: 'M',
  route: '/',
  height: 2248,
  clock: '2026-10-19T13:20:00+02:00',
  reach: 'fixture',
  why: 'the frame day (Monday 19 October): no session running, the plan day "Felsőtest – húzás", 4 habits and 6 tasks of the README-ma seed. GET /lifeos/today carries no habits / tasks on the running backend (no migration 032), so they are fixture keys: matched-fixture at best',
  fixtures: [
    lifeos({ today: MON, balance: 190, xp: 2158, level: 4, floor: 1600, next: 2500, earned: 1000, due: true, done: false, habits: ma1Habits, tasks: ma1Tasks }),
    planToday(MON, { name: 'Felsőtest – húzás', exercises: 5 }),
    noSession,
    nutrition(MON, 1240, 86),
  ],
  arrived: { role: 'button', name: { key: 'home.start' } },
};

/* ── ma-2 · Tuesday 20 October 2026, 21:10: a rest day, everything done ──────────────────────── */

const TUE = '2026-10-20';
const ma2 = {
  title: 'Ma — pihenőnap, minden kész',
  frame: 'lifeos/ma-2',
  account: 'M',
  route: '/',
  height: 1748,
  clock: '2026-10-20T21:10:00+02:00',
  reach: 'fixture',
  why: 'the rest day after ma-1: 3 good habits done, 2 bad habits clean, the 2 Tuesday tasks done, tomorrow "Alsótest – guggolás 18:00" from the week window. The daily challenge (Phase 4) is not on Ma yet, so "Ma eddig" lacks its +15 and the NAPI DOBÁS block is not drawn',
  fixtures: [
    lifeos({
      today: TUE,
      balance: 245,
      xp: 2239,
      level: 4,
      floor: 1600,
      next: 2500,
      earned: 1500,
      due: false,
      done: false,
      habits: [
        habit({ id: 1, name: 'Olvasás 20 perc', log: log(TUE, 1, 'done', at('2026-10-20T07:35:00+02:00')), streak: 15, mult: 12500, preview: 1300, full: 1300 }),
        habit({ id: 2, name: 'Víz', target: 8, unit: 'pohár', log: log(TUE, 8, 'done', at('2026-10-20T19:40:00+02:00')), streak: 10, preview: 1000 }),
        habit({ id: 3, name: 'Nyújtás 10 perc', reminder: '21:30', log: log(TUE, 1, 'done', at('2026-10-20T21:05:00+02:00')), streak: 33, best: 45, freezes: 1, mult: 15000, preview: 1500, full: 1500 }),
        habit({ id: 5, name: 'Dohányzás', kind: 'bad', streak: 13, preview: 0, full: 1500 }),
        habit({ id: 6, name: 'Esti nassolás', kind: 'bad', streak: 1, preview: 0, full: 1500 }),
      ],
      tasks: {
        due: [],
        overdue: [],
        completedToday: [
          task({ id: 21, title: 'Feladni a csomagot a Foxpostnál', priority: 2, dueOn: TUE, value: 1000, completedAt: at('2026-10-20T12:40:00+02:00') }),
          task({ id: 22, title: 'Kivinni a szelektívet', priority: 1, dueOn: TUE, value: 500, recurrence: { type: 'weekly', weekdayMask: 2 }, completedAt: at('2026-10-20T19:05:00+02:00') }),
        ],
        anytimeCount: 0,
        openCount: 0,
      },
    }),
    planToday(TUE, { name: 'Pihenőnap', rest: true }),
    noSession,
    {
      method: 'GET',
      path: '/api/v1/my-plans/week',
      query: { from: '2026-10-21', days: '1' },
      from: { path: '/api/v1/my-plans/week?days=7&from=2026-10-12' },
      edits: [
        set('/from', '2026-10-21'),
        set('/days', 1),
        set('/occurrences', [
          {
            date: '2026-10-21',
            day_id: 5,
            day_name: 'Alsótest – guggolás',
            slot: 0,
            is_rest: 0,
            est_minutes: 70,
            start_time: '18:00',
            exercise_count: 6,
            plan_id: 1,
            plan_name: 'Felső/alsó szplit – 12 hetes blokk',
            log_id: null,
            log_status: null,
          },
        ]),
      ],
    },
    nutrition(TUE, 2480, 176),
  ],
  arrived: { text: { key: 'today.hero.perfect' } },
};

/* ── ma-3 · Monday 19 October 2026: a brand-new user ─────────────────────────────────────────── */

const ma3 = {
  title: 'Ma — új felhasználó',
  frame: 'lifeos/ma-3',
  account: 'M',
  route: '/',
  height: 1470,
  clock: '2026-10-19T09:00:00+02:00',
  reach: 'fixture',
  why: 'a brand-new member: 0 coins, level 0, only the onboarding plan\'s workout ("Teljes test – alap"); no habits, no tasks — the two empty sections. The frame\'s pay lines under the empty states quote the admin rules and are not drawn',
  fixtures: [
    lifeos({ today: MON, balance: 0, xp: 0, level: 0, floor: 0, next: 100, earned: 0, due: true, done: false, habits: [], tasks: { due: [], overdue: [], completedToday: [], anytimeCount: 0, openCount: 0 } }),
    planToday(MON, { name: 'Teljes test – alap', exercises: 6, plan: 'Kezdő terv – 1. hét' }),
    noSession,
    nutrition(MON, 0, 0),
  ],
  arrived: { text: { key: 'today.habits.emptyTitle' } },
};

/* ── ma-4 · Wednesday 21 October 2026, 07:30: nothing done yet (the draw is Phase 4) ──────────── */

const WED = '2026-10-21';
const ma4 = {
  title: 'Ma — szerda reggel, még semmi kész',
  frame: 'lifeos/ma-4',
  account: 'M',
  route: '/',
  height: 1790,
  clock: '2026-10-21T07:30:00+02:00',
  reach: 'fixture',
  why: 'the frame\'s day without its subject: the pending daily draw (NAPI DOBÁS above MAI EDZÉS) is Phase 4 and cannot be reached; every other block (hero 0/7, the Wednesday workout, 5 habits, 3 tasks) is drawn. Ma then continues with TÁPLÁLKOZÁS and the library row, which the frame crops',
  fixtures: [
    lifeos({
      today: WED,
      balance: 362,
      xp: 2356,
      level: 4,
      floor: 1600,
      next: 2500,
      earned: 0,
      due: true,
      done: false,
      habits: [
        habit({ id: 1, name: 'Olvasás 20 perc', streak: 15, mult: 12500, full: 1300 }),
        habit({ id: 2, name: 'Víz', target: 8, unit: 'pohár', log: log(WED, 1, 'pending'), streak: 10 }),
        habit({ id: 3, name: 'Nyújtás 10 perc', reminder: '21:30', streak: 33, best: 45, freezes: 1, mult: 15000, full: 1500 }),
        habit({ id: 5, name: 'Dohányzás', kind: 'bad', streak: 14, full: 1500 }),
        habit({ id: 6, name: 'Esti nassolás', kind: 'bad', streak: 2, full: 1500 }),
      ],
      tasks: {
        due: [
          task({ id: 31, title: 'Elküldeni a heti riportot', priority: 3, dueOn: WED, dueTime: '12:00', value: 2000 }),
          task({ id: 32, title: 'Felhívni a szerelőt a kazán miatt', priority: 2, dueOn: WED, dueTime: '16:00', value: 1000 }),
          task({ id: 33, title: 'Megöntözni a növényeket', priority: 1, dueOn: WED, value: 500, recurrence: { type: 'weekly', weekdayMask: 4 } }),
        ],
        overdue: [],
        completedToday: [],
        anytimeCount: 0,
        openCount: 3,
      },
    }),
    planToday(WED, { name: 'Alsótest – guggolás', exercises: 6 }),
    noSession,
    nutrition(WED, 0, 0),
  ],
  arrived: { role: 'button', name: { key: 'home.start' } },
};

/* ── undrawn states (owner answer Q4) ─────────────────────────────────────────────────────────── */

const relapseSheet = {
  title: 'Ma — visszaesés megerősítése',
  account: 'M',
  route: '/',
  height: 874,
  clock: ma1.clock,
  reach: 'fixture',
  why: 'a bad habit\'s row asks before it logs a relapse (it costs coins and ends the streak; f_app confirms it too): the kit ConfirmSheet over Ma',
  fixtures: [
    lifeos({
      today: MON,
      balance: 190,
      xp: 2158,
      level: 4,
      floor: 1600,
      next: 2500,
      earned: 2000,
      due: true,
      done: false,
      habits: [ma1Habits[0], ma1Habits[1], ma1Habits[2], habit({ id: 5, name: 'Dohányzás', kind: 'bad', streak: 12, full: 1500 })],
      tasks: ma1Tasks,
    }),
    planToday(MON, { name: 'Felsőtest – húzás', exercises: 5 }),
    noSession,
    nutrition(MON, 1240, 86),
  ],
  steps: [{ click: { role: 'button', name: { re: '^Dohányzás' } }, arrived: { role: 'dialog' } }],
  arrived: { text: { key: 'today.habit.relapseConfirm' } },
};

/* The two sheets Ma opens from its empty sections (fix round: "Rögzítés" was a door to /tasks, "Első
   szokás" a door to Szokások). Both open over ma-3's page. */
const captureSheet = {
  title: 'Ma — Rögzítés: a gyors rögzítés lapja Ma fölött',
  account: 'M',
  route: '/',
  height: 874,
  clock: ma3.clock,
  reach: 'fixture',
  why: 'FELADATOK "+ Rögzítés" opens the S-tasks capture sheet (frame lifeos/capture) over Ma (request R-S-ma-02, applied in the fix round). The sheet reads GET /tasks for the logical today: an empty TasksResponse, schema-checked like the rest',
  fixtures: [
    ...ma3.fixtures,
    {
      method: 'GET',
      path: '/api/v1/tasks',
      body: { started: false, today: MON, due: [], overdue: [], anytime: [], completedToday: [], upcoming: [], done: [], templates: [], openCount: 0 },
    },
  ],
  steps: [{ click: { role: 'button', name: { key: 'today.tasks.capture' } }, arrived: { role: 'dialog' } }],
  arrived: { text: { key: 'capture.title' } },
};

const habitSheet = {
  title: 'Ma — Első szokás: az új szokás lapja Ma fölött',
  account: 'M',
  route: '/',
  height: 874,
  clock: ma3.clock,
  reach: 'fixture',
  why: 'SZOKÁSOK "+ Első szokás" opens the S-habits new-habit sheet (frame lifeos/habit-form) over Ma in one tap (fix round; it was a door to the Szokások list)',
  fixtures: ma3.fixtures,
  // At 874 pt the link sits under the fixed tab bar (inside the viewport, so the tool would not
  // scroll and its click would land on the bar): scroll to the end first, as a thumb would.
  steps: [
    { scroll: 'end', arrived: { role: 'button', name: { key: 'today.habits.first' } } },
    { click: { role: 'button', name: { key: 'today.habits.first' } }, arrived: { role: 'dialog' } },
  ],
  arrived: { role: 'dialog' },
};

const failed = {
  title: 'Ma — a LifeOS-olvasás nem sikerült',
  account: 'M',
  route: '/',
  height: 874,
  clock: ma1.clock,
  reach: 'fixture',
  why: 'GET /lifeos/today answers 500: the ledger line and the hero print the dash, "Újra" under the hero; the session, the food and the library row still work',
  fixtures: [
    { method: 'GET', path: '/api/v1/lifeos/today', status: 500, body: {} },
    planToday(MON, { name: 'Felsőtest – húzás', exercises: 5 }),
    noSession,
    nutrition(MON, 1240, 86),
  ],
  expect: { requests: [{ path: '/api/v1/lifeos/today', status: 500 }], console: ['500'] },
  arrived: { text: { key: 'common.retry' } },
};

const liveSession = {
  title: 'Ma — futó edzés (Folytatás)',
  account: 'M',
  route: '/',
  height: 874,
  reach: 'seed',
  why: 'the seed leaves user@ mid-session: MAI EDZÉS shows the running session with "Folytatás"; GET /lifeos/today as recorded from the B-core backend (no habits / tasks yet), so SZOKÁSOK / FELADATOK are not drawn and the hero counts the workout alone',
  arrived: { role: 'button', name: { key: 'home.resume' } },
};

const states = {
  about:
    'S-ma - the Ma page (TodayPage at /, design round B frames lifeos/ma-1..ma-4) and its undrawn states. Account M = user@tracker.local. Written by make-states.mjs (edit that file, not this one). GET /lifeos/today is the B-core recording; its Phase-3 keys habits / tasks are fixture additions (no 032 recording yet), schema-checked by fixture-schema-check.mjs against lib/lifeos-api.ts. Nothing is written live: every tap of the frames is a capture of a still state.',
  states: {
    'ma-1': ma1,
    'ma-2': ma2,
    'ma-3': ma3,
    'ma-4': ma4,
    'ma-relapse-sheet': relapseSheet,
    'ma-capture-sheet': captureSheet,
    'ma-habit-sheet': habitSheet,
    'ma-failed': failed,
    'ma-live-session': liveSession,
  },
};

fs.writeFileSync(path.join(HERE, 'states.json'), `${JSON.stringify(states, null, 2)}\n`);
console.log(`states.json: ${Object.keys(states.states).length} states`);
