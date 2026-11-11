#!/usr/bin/env node
// Writes states.json of package S-calendar: the capture states of its four round-B frames
// (lifeos/calendar-1, calendar-2, event-detail, event-form) and the undrawn states, plus the
// two hand-in states (capture's Esemény half, Ma's KÖVETKEZŐ).
//
// The running dev backend has no migration 034 (B-calendar is not merged), so GET /calendar and
// GET /events/:id are answered by CONTRACT BODIES typed by frontend/src/lib/lifeos-api.ts
// (B-calendar's Phase-5 block) carrying the frames' seed; GET /tasks (no recording for account M)
// likewise by a TasksResponse. Every other GET replays the freeze of account M. No state writes.
//
// Usage: node make-states.mjs   (reads ../S-ma/states.json, the integrated ma-1, for the Ma state)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ZONE = 'Europe/Budapest';
/** Epoch seconds of a Budapest wall clock (October 2026 before the 25th is CEST, +02:00; after, CET). */
const at = (date, time) => Math.floor(Date.parse(`${date}T${time}:00${date >= '2026-10-25' ? '+01:00' : '+02:00'}`) / 1000);
const minutes = (a, b) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

/* ── the seed of the frames (round B "b2": Wednesday 21 October 2026 is today) ─────────────────── */

const timed = (eventId, date, start, end, title, location, recurrence = null, untilDate = null) => ({
  eventId,
  date,
  occurrenceDate: date,
  title,
  location,
  allDay: false,
  startAt: at(date, start),
  endAt: at(date, end),
  startTime: start,
  endTime: end,
  durationMinutes: minutes(start, end),
  startsBefore: false,
  endsAfter: false,
  recurrence,
  untilDate,
});
const allDay = (eventId, date, title, location, recurrence = null) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const after = next.toISOString().slice(0, 10);
  return {
    eventId,
    date,
    occurrenceDate: date,
    title,
    location,
    allDay: true,
    startAt: at(date, '00:00'),
    endAt: at(after, '00:00'),
    startTime: null,
    endTime: null,
    durationMinutes: null,
    startsBefore: false,
    endsAfter: false,
    recurrence,
    untilDate: null,
  };
};
const task = (id, title, priority, valueMinor, dueOn, dueTime, recurrence = null) => ({
  id,
  title,
  notes: null,
  priority,
  points: null,
  dueOn,
  dueTime,
  recurrence,
  isTemplate: false,
  parentTaskId: recurrence ? id + 100 : null,
  completedAt: null,
  completedOn: null,
  overdueOn: null,
  valueMinor,
  lateNow: false,
  payoutNowMinor: valueMinor,
  paidMinor: null,
  overduePenaltyMinor: null,
  challengeId: null, // B-rewards-challenges (033): Task.challengeId is required (added at merge-S-calendar)
});
const workout = (date, startTime, rest = false) => ({
  date,
  planId: 3,
  planName: 'PPL',
  dayId: 9,
  dayName: rest ? 'Pihenőnap' : 'Felsőtest – húzás',
  isRest: rest,
  estMinutes: rest ? null : 60,
  startTime: rest ? null : startTime,
  exerciseCount: rest ? 0 : 5,
  logId: null,
  logStatus: null,
});

const SWIM_RULE = { type: 'weekly', weekdayMask: 32 };
const days = (overrides = {}) => {
  const base = {
    '2026-10-19': { events: [], workouts: [workout('2026-10-19', '18:00')], due: [] },
    '2026-10-20': { events: [timed(3, '2026-10-20', '17:00', '18:00', 'Szülői értekezlet', 'Kölcsey Gimnázium')], workouts: [], due: [] },
    '2026-10-21': {
      events: [
        timed(1, '2026-10-21', '10:00', '10:45', 'Fogorvos', 'Dr. Kiss Anna · Bartók Béla út 12.'),
        timed(2, '2026-10-21', '12:30', '13:30', 'Ebéd Zsófival', 'Kőleves vendéglő'),
      ],
      workouts: [workout('2026-10-21', '18:00')],
      due: [task(21, 'Közös költség befizetése', 2, 1000, '2026-10-21', '15:00')],
    },
    '2026-10-22': { events: [], workouts: [], due: [] },
    '2026-10-23': { events: [], workouts: [workout('2026-10-23', '18:00')], due: [] },
    '2026-10-24': {
      events: [
        allDay(8, '2026-10-24', 'Bea születésnapja', null, { type: 'yearly' }),
        timed(7, '2026-10-24', '09:00', '10:00', 'Úszás', 'Hajós Alfréd uszoda', SWIM_RULE, '2026-12-19'),
        timed(9, '2026-10-24', '19:00', '22:00', 'Születésnapi vacsora', 'Pomo D’oro · Arany János utca 9.'),
      ],
      workouts: [workout('2026-10-24', null, true)],
      due: [task(24, 'Ajándék Beának', 2, 1000, '2026-10-24', '18:00'), task(25, 'Heti bevásárlás', 1, 500, '2026-10-24', null, { type: 'weekly', weekdayMask: 32 })],
    },
    '2026-10-25': { events: [], workouts: [], due: [] },
    ...overrides,
  };
  return Object.entries(base).map(([date, d]) => ({
    date,
    events: d.events,
    workouts: d.workouts.map(({ date: _d, ...w }) => w),
    tasks: { due: d.due, completed: [], overdue: [] },
    busy: d.events.length > 0 || d.workouts.some((w) => !w.isRest) || d.due.length > 0,
  }));
};
const calendarBody = (anytime) => ({
  started: true,
  timezone: ZONE,
  today: '2026-10-21',
  logicalToday: '2026-10-21',
  from: '2026-10-19',
  to: '2026-10-25',
  days: days(),
  anytime,
  workoutPointsFull: 30,
});
// The frames show the 19th and 20th busy too (README b2): the 19th's workout and the 20th's event above;
// the 23rd's workout; the 22nd and 25th empty — calendar-1's dots [1,1,1,0,1,1,0].

const ANYTIME_CALL = task(31, 'Felhívni anyát', 1, 500, null, null);

const TASK_RULES = { lowMinor: 500, midMinor: 1000, highMinor: 2000, latePct: 50, overdueMinor: 500 };
const tasksBody = {
  started: true,
  rulesVersion: 1, // B-lifeos-polish: GET /tasks carries the rule set and the priority figures
  taskRules: TASK_RULES,
  today: '2026-10-21',
  due: [task(21, 'Közös költség befizetése', 2, 1000, '2026-10-21', '15:00')],
  overdue: [],
  anytime: [ANYTIME_CALL],
  completedToday: [],
  upcoming: [task(24, 'Ajándék Beának', 2, 1000, '2026-10-24', '18:00')],
  done: [],
  templates: [],
  openCount: 3,
};
// Közepes pays 10, Alacsony 5 (task-form's "Közepes · 10"); a Fontos task would show 20.
tasksBody.upcoming.push(task(41, 'Befizetni a villanyszámlát', 3, 2000, '2026-10-26', '17:00'));

const swimOccurrence = timed(7, '2026-10-24', '09:00', '10:00', 'Úszás', 'Hajós Alfréd Nemzeti Sportuszoda · Budapest, Margitsziget', SWIM_RULE, '2026-12-19');
const swim = {
  id: 7,
  title: 'Úszás',
  notes: 'Úszószemüveg, papucs, törölköző. 1000 m gyors, utána 4 × 50 m hát.',
  location: 'Hajós Alfréd Nemzeti Sportuszoda · Budapest, Margitsziget',
  allDay: false,
  date: '2026-09-05',
  startTime: '09:00',
  endDate: '2026-09-05',
  endTime: '10:00',
  durationMinutes: 60,
  timezone: ZONE,
  recurrence: SWIM_RULE,
  untilDate: '2026-12-19',
  reminders: [15, 1440],
  startAt: at('2026-09-05', '09:00'),
  endAt: at('2026-09-05', '10:00'),
  next: swimOccurrence,
  // Saturdays 24 Oct .. 19 Dec: 24, 31, 7, 14, 21, 28, 5, 12, 19
  remaining: 9,
  occurrence: swimOccurrence,
  createdAt: at('2026-09-01', '20:00'),
  updatedAt: at('2026-09-01', '20:00'),
};
const birthdayOccurrence = allDay(8, '2026-10-24', 'Bea születésnapja', null, { type: 'yearly' });
const birthday = {
  id: 8,
  title: 'Bea születésnapja',
  notes: null,
  location: null,
  allDay: true,
  date: '2025-10-24',
  startTime: null,
  endDate: '2025-10-24',
  endTime: null,
  durationMinutes: null,
  timezone: ZONE,
  recurrence: { type: 'yearly' },
  untilDate: null,
  reminders: [1440],
  startAt: at('2025-10-24', '00:00'),
  endAt: at('2025-10-25', '00:00'),
  next: birthdayOccurrence,
  remaining: null,
  occurrence: birthdayOccurrence,
  createdAt: at('2025-10-01', '20:00'),
  updatedAt: at('2025-10-01', '20:00'),
};

/* ── the states ──────────────────────────────────────────────────────────────────────────────── */

const WHY_FIXTURE =
  'GET /calendar and GET /events/:id are answered by contract bodies typed by lib/lifeos-api.ts (B-calendar Phase-5 block), and GET /tasks by a TasksResponse: the running dev backend has no migration 034 -> matched-fixture at best';
const CLOCK = '2026-10-21T09:41:00+02:00';
const cal = (anytime = [ANYTIME_CALL]) => ({ method: 'GET', path: '/api/v1/calendar', body: calendarBody(anytime) });
const tasks = { method: 'GET', path: '/api/v1/tasks', body: tasksBody };
// The DayRail cell is named by the platform's full date (headless Chrome: 'október 24., szombat, van program'): matched by the date.
const dayRadio = (re) => ({ role: 'radio', name: { re } });

const states = {
  'calendar-1': {
    title: 'Naptár — szerda, október 21. (a keret)',
    frame: 'lifeos/calendar-1',
    account: 'M',
    route: '/calendar',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `the frame state: the week of 19-25 October, Wednesday 21 chosen (today), Fogorvos, Ebéd Zsófival, the plan's 18:00 workout, two open tasks. ${WHY_FIXTURE}`,
    arrived: { text: 'Fogorvos' },
    fixtures: [cal(), tasks],
  },
  'calendar-2': {
    title: 'Naptár — szombat, október 24. (a keret)',
    frame: 'lifeos/calendar-2',
    account: 'M',
    route: '/calendar',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `the frame state: Saturday 24 chosen on the DayRail: the all-day yearly birthday, the weekly swim, the dinner, the rest-day line, two tasks (the weekly one under the fade). The frame's anytime "Heti bevásárlás · Bármikor · Hetente" cannot exist (api.md: a rule needs a due day), so it is a weekly task due that Saturday with no time. ${WHY_FIXTURE}`,
    steps: [
      {
        click: dayRadio('(^|[^0-9])24([^0-9]|$)'),
        arrived: { text: 'Bea születésnapja' },
      },
    ],
    arrived: { text: 'Születésnapi vacsora' },
    fixtures: [cal([]), tasks],
  },
  'event-detail': {
    title: 'Úszás — az esemény (a keret)',
    frame: 'lifeos/event-detail',
    account: 'M',
    route: '/calendar/events/7?on=2026-10-24',
    height: 898,
    clock: CLOCK,
    reach: 'fixture',
    why: `the frame state: the Saturday occurrence of the weekly swim, the place, the rule with "December 19-ig · még 9 alkalom", the two reminders, the note, the delete link. ${WHY_FIXTURE}`,
    arrived: { text: { key: 'calendar.detail.bell' } },
    fixtures: [{ method: 'GET', path: '/api/v1/events/7', body: { event: swim } }],
  },
  'event-form': {
    title: 'Új esemény — a lap (Fodrász, 45 perc, 15 perc + 1 nap)',
    frame: 'lifeos/event-form',
    account: 'M',
    route: '/calendar',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `the frame state: "+ Esemény" on Wednesday 21 opens the sheet over Naptár; Megnevezés typed, 16:00 typed into the native time field, 45 perc chosen (Vége 16:45), Helyszín typed, reminders 15 perc and 1 nap. ${WHY_FIXTURE}`,
    steps: [
      { click: { role: 'button', name: { key: 'calendar.addEvent' } }, arrived: { role: 'dialog' } },
      // 16:00 into the native time field: a click on Kezdés's hour segment (the first one in the sheet), then six arrow presses from the first start 10:00 (the clock is 09:41); the capture tool's ArrowDown steps the native hour segment up here (measured: six ArrowUp gave 04:00).
      { click: { role: 'spinbutton', name: { re: '^(óra|Hours|Stunden)' }, within: { role: 'dialog' }, nth: 0 }, arrived: { role: 'dialog' } },
      ...Array.from({ length: 6 }, () => ({ press: 'ArrowDown', arrived: { role: 'dialog' } })),
      {
        type: { role: 'textbox', name: { key: 'calendar.form.location' }, text: 'Hajszalon · Király utca 26.' },
        arrived: { role: 'textbox', name: { key: 'calendar.form.location' } },
      },
      {
        click: { role: 'radio', name: { hu: '45 perc', en: '45 min', de: '45 Min.' }, within: { role: 'dialog' } },
        arrived: { role: 'radio', name: { hu: '45 perc', en: '45 min', de: '45 Min.' }, checked: true },
      },
      {
        click: { role: 'checkbox', name: { hu: '15 perc', en: '15 min', de: '15 Min.' }, within: { role: 'dialog' } },
        arrived: { role: 'checkbox', name: { hu: '15 perc', en: '15 min', de: '15 Min.' }, checked: true },
      },
      {
        click: { role: 'checkbox', name: { hu: '1 nap', en: '1 d', de: '1 T.' }, within: { role: 'dialog' } },
        arrived: { role: 'checkbox', name: { hu: '1 nap', en: '1 d', de: '1 T.' }, checked: true },
      },
      {
        type: { role: 'textbox', name: { key: 'calendar.form.name' }, text: 'Fodrász' },
        arrived: { role: 'textbox', name: { key: 'calendar.form.name' }, focused: true },
      },
    ],
    arrived: { role: 'dialog' },
    fixtures: [cal(), tasks],
  },
  'calendar-empty-day': {
    title: 'Naptár — csütörtök, üres nap',
    account: 'M',
    route: '/calendar',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `a day with nothing on it: the quiet line in the rest-day grammar, TEENDŐK with the anytime task only. ${WHY_FIXTURE}`,
    steps: [{ click: dayRadio('(^|[^0-9])22([^0-9]|$)'), arrived: { text: { key: 'calendar.nothing' } } }],
    arrived: { text: { key: 'calendar.nothing' } },
    fixtures: [cal(), tasks],
  },
  'calendar-failed': {
    title: 'Naptár — a lekérés nem sikerült',
    account: 'M',
    route: '/calendar',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: 'a failed read: the header, the week line and the rail without dots, the danger line with "Újra" (GET /calendar answered 500)',
    arrived: { role: 'button', name: { key: 'common.retry' } },
    expect: { requests: [{ path: '/api/v1/calendar', status: 500 }], console: ['500'] },
    fixtures: [{ method: 'GET', path: '/api/v1/calendar', status: 500, body: { error: 'Internal error', code: 'internal', requestId: 'fixture' } }, tasks],
  },
  'event-detail-allday': {
    title: 'Bea születésnapja — egész napos, évente',
    account: 'M',
    route: '/calendar/events/8?on=2026-10-24',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `an all-day yearly event: EGÉSZ NAP as the figure, no place, the rule "Minden évben, október 24-én", one reminder, no note. ${WHY_FIXTURE}`,
    arrived: { text: { key: 'calendar.detail.delete' } },
    fixtures: [{ method: 'GET', path: '/api/v1/events/8', body: { event: birthday } }],
  },
  'event-edit': {
    title: 'Úszás — szerkesztés',
    account: 'M',
    route: '/calendar/events/7?on=2026-10-24',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `"Szerkesztés" opens the same sheet in edit mode with the event's values (Esemény szerkesztése, Mentés). ${WHY_FIXTURE}`,
    steps: [{ click: { role: 'button', name: { key: 'calendar.detail.edit' } }, arrived: { role: 'dialog' } }],
    arrived: { role: 'dialog' },
    fixtures: [{ method: 'GET', path: '/api/v1/events/7', body: { event: swim } }],
  },
  'event-delete-confirm': {
    title: 'Úszás — törlés megerősítése',
    account: 'M',
    route: '/calendar/events/7?on=2026-10-24',
    height: 874,
    clock: CLOCK,
    reach: 'fixture',
    why: `"Esemény törlése" asks first; a recurring event says every occurrence goes (api.md: no single-occurrence delete). ${WHY_FIXTURE}`,
    steps: [{ click: { role: 'button', name: { key: 'calendar.detail.delete' } }, arrived: { role: 'dialog' } }],
    arrived: { role: 'dialog' },
    fixtures: [{ method: 'GET', path: '/api/v1/events/7', body: { event: swim } }],
  },
};

/*
 * The capture frame and Ma's KÖVETKEZŐ are states of MA now (S-lifeos-polish): S-ma's ma-1 carries the whole frame
 * (the picked challenge, FÓKUSZ, KÖVETKEZŐ with its reminder), so ma-next is that state itself and no longer lives here.
 * What stays here is the capture sheet with Esemény chosen, opened OVER Ma from Ma (frame lifeos/capture): S-tasks'
 * own steps for the native date and time (the keyboard, as the tool cannot open a native picker) after Hova? Esemény.
 */
try {
  const sma = JSON.parse(fs.readFileSync(path.join(here, '../S-ma/states.json'), 'utf8'));
  const stasks = JSON.parse(fs.readFileSync(path.join(here, '../S-tasks/states.json'), 'utf8'));
  const ma1 = structuredClone(sma.states['ma-1']);
  const steps = structuredClone(stasks.states.capture.steps);
  // The sheet opens from Ma's FELADATOK head; the words are typed first, then Hova? Esemény.
  steps.unshift({ scroll: 'top', arrived: { role: 'dialog' } });
  steps.unshift({ click: { role: 'button', name: { key: 'today.tasks.capture' } }, arrived: { role: 'dialog' } });
  steps.splice(2, 0, {
    click: { role: 'radio', name: { key: 'calendar.capture.event' } },
    arrived: { role: 'radio', name: { key: 'calendar.capture.event' }, checked: true },
  });
  ma1.fixtures.push({ method: 'GET', path: '/api/v1/tasks', body: { ...tasksBody, today: '2026-10-19', due: [], upcoming: [], anytime: [], openCount: 0 } });
  states['capture-event'] = {
    ...ma1,
    title: 'Rögzítés — esemény, Ma fölött (hand-in R-S-calendar-02)',
    frame: 'lifeos/capture',
    height: 874,
    why: 'lifeos/capture with Esemény chosen, OVER Ma opened from its "Rögzítés +": the words typed, Hova? Esemény, Mikor? Dátum (Wednesday 21 October), Időpontban, Kezdés 10:00 and "Emlékeztető 1 órával előtte". Behind the sheet stands the frame day of Ma (ma-1). GET /tasks is a contract body -> matched-fixture at best',
    steps,
    arrived: { text: { key: 'calendar.capture.reminderHint' } },
  };
} catch (err) {
  console.warn(`capture-event skipped: ${String(err.message).split(String.fromCharCode(10))[0]}`);
}

const out = {
  about:
    'S-calendar - Naptár (/calendar), one event (/calendar/events/:id) and the event sheet, design round B frames lifeos/calendar-1, calendar-2, event-detail, event-form, their undrawn states and the two hand-in states (capture Esemény, Ma KÖVETKEZŐ). The running dev backend has no migration 034 (B-calendar is not merged), so GET /calendar and GET /events/:id are answered by contract bodies typed by lib/lifeos-api.ts carrying the round-B seed (Wednesday 21 October 2026); GET /tasks (unrecorded for account M) likewise. Every other request replays the freeze of account M. Nothing is written. Generated by make-states.mjs.',
  states,
};
fs.writeFileSync(path.join(here, 'states.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`states.json: ${Object.keys(states).length} states`);
