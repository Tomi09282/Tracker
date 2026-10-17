#!/usr/bin/env node
// Writes ../states.json (S-client-detail-b). The fixture edit lists of client-detail-3 are long and
// regular (records trimmed to the four drawn rows, the drawn sessions, two weekly series), so they are
// generated here instead of typed by hand. Run: node docs/pipeline/pulse/pkg/S-client-detail-b/live-frames/make-states.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'states.json');

/** Measured on the built page: the live view-switch top minus 327 (the profile block the shortened frames leave out). */
export const DELTA = Number(fs.readFileSync(path.join(HERE, 'delta.txt'), 'utf8').trim());

const opt = (key) => ({ role: ['tab', 'radio', 'button'], name: { key } });
const tab = (key) => ({
  click: opt(key),
  arrived: { anyOf: [{ ...opt(key), checked: true }, { ...opt(key), selected: true }] },
});
const tabN = tab('coaching.tab.nutrition');
const tabP = tab('coaching.tab.progress');
const addMeal = { role: 'button', name: { key: 'coaching.nutrition.addMeal' } };
const openDiet = { click: { role: 'button', name: { re: '^Rekomp étrend' } }, arrived: addMeal };
const search = { role: ['searchbox', 'textbox'], name: { key: 'nutrition.searchPlaceholder' }, nth: 0 };
const firstHit = { role: 'button', name: { re: '^Csirkemell' }, nth: 0 };
const typeCsirke = { type: { ...search, text: 'csirke' }, arrived: firstHit };
const day = (n, arrived) => ({ click: { role: ['radio', 'button'], name: String(n) }, arrived });
// undrawn states are taken tall: on the old page (the baseline) the view switch sits so low that at 874 / 1394 pt a click
// on it lands on the fixed tab bar
const TALL = 2200;
const base = { account: 'C', route: '/coach/clients/{linkOfMember}' };
const removeAll = (list, n) => Array.from({ length: n }, (_, i) => ({ pointer: `/${list}/${n - 1 - i}`, remove: true }));

// client-detail-3, the drawn data as edits over the recordings
const week = (start, vals) => {
  const d0 = Date.parse(`${start}T00:00:00Z`);
  const out = [];
  vals.forEach((v, i) => {
    if (v == null) return;
    out.push({
      date: new Date(d0 + i * 7 * 86400000).toISOString().slice(0, 10),
      e1rm_kg: v,
      top_load_kg: Math.round(v * 0.9 * 2) / 2,
      best_seconds: null,
      best_distance_m: null,
      volume_kg: 1500,
      sets: 3,
    });
  });
  return out;
};
const bench = week('2026-07-15', [96, 97.5, 99, 92.5, 100, 101.5, null, 100.5, 102.5, 104, 98.5, 106, 108]);
const squat = week('2026-07-13', [116.7, 119, 117.5, 121, 114, 122.5, null, 121, 124.5, 126, 128.5, 123, 131.3]);
const recRow = (i, id, name, value, date) => [
  { pointer: `/records/${i}/exercise_id`, value: id },
  { pointer: `/records/${i}/exercise_name_snapshot`, value: name },
  { pointer: `/records/${i}/value`, value },
  { pointer: `/records/${i}/local_date`, value: date },
];
const recEdits = [
  ...Array.from({ length: 14 }, (_, i) => ({ pointer: `/records/${17 - i}`, remove: true })),
  // four distinct exercises: the page charts the first three (its cap); the frame draws two (its board note: the
  // third has no sample data), so the live twin of client-detail-3 carries a third-chart band (build.mjs)
  ...recRow(0, 1518, 'Bench Press', 108, '2026-10-07'),
  ...recRow(1, 1619, 'Barbell Squat', 131.3, '2026-10-05'),
  ...recRow(2, 973, 'Barbell Hip Thrust', 133.33, '2026-09-26'),
  ...recRow(3, 80, 'Bent Over Barbell Row', 98.17, '2026-09-25'),
];
const logRow = (i, dayName, date, reps, vol, secs) => [
  { pointer: `/logs/${i}/title`, value: null },
  { pointer: `/logs/${i}/plan_name_snapshot`, value: 'Felső/alsó szplit – 12 hetes blokk' },
  { pointer: `/logs/${i}/day_name_snapshot`, value: dayName },
  { pointer: `/logs/${i}/local_date`, value: date },
  { pointer: `/logs/${i}/completed_at`, value: 1791996960 },
  { pointer: `/logs/${i}/status`, value: 'completed' },
  { pointer: `/logs/${i}/total_working_sets`, value: 15 },
  { pointer: `/logs/${i}/total_reps`, value: reps },
  { pointer: `/logs/${i}/total_volume_kg`, value: vol },
  { pointer: `/logs/${i}/duration_seconds`, value: secs },
];
const logEdits = [
  ...logRow(0, 'Felsőtest – nyomás', '2026-10-07', 154, 6400, 3960),
  ...logRow(1, 'Alsótest – erő', '2026-10-05', 115, 11500, 4320),
  ...logRow(2, 'Alsótest – volumen', '2026-10-03', 195, 15300, 3480),
];
const cd3Fixtures = [
  { method: 'GET', path: '/api/v1/clients/1/records', edits: recEdits },
  { method: 'GET', path: '/api/v1/clients/1/workouts', edits: logEdits },
  { method: 'GET', path: '/api/v1/progress', query: { exercise_id: 1518 }, edits: [{ pointer: '/points', value: bench }] },
  { method: 'GET', path: '/api/v1/progress', query: { exercise_id: 1619 }, edits: [{ pointer: '/points', value: squat }] },
];
// the header and the profile block (S-client-detail-a's, judged there) are masked in the live twins
const mask = [{ x: 0, y: 0, w: 402, h: Math.round(327 + DELTA) }];

const doc = {
  about:
    'S-client-detail-b - the Táplálkozás and Haladás tab bodies of the client page (/coach/clients/:id). Account C = coach@ on the link of M (user@, {linkOfMember}), replay. client-detail-2 / -3 are SHORTENED frames (their board notes: the profile block of client-detail-1, y 327-1013, is not repeated), so the frame states themselves are cut by the live page; each is judged by a *-live twin whose frame is the same frame with everything from the view switch down moved by the measured profile height (delta; live-frames/build.mjs writes client-detail-<n>.live.json and .live@2x.png) and whose header + profile band (S-client-detail-a) is masked. Nothing is written live: every mutation is a stub answered in the browser (live diet writes need a sandbox diet, R-S-client-detail-b-01). Generated by live-frames/make-states.mjs.',
  delta: DELTA,
  states: {
    'cd2-live': {
      ...base,
      title: 'Kliens adatlap — Táplálkozás, Rekomp étrend, 1. nap (élő magasság)',
      frame: 'client-detail-2.live',
      height: Math.round(2091 + DELTA),
      reach: 'seed',
      why: 'client-detail-2 at the live page height: the recording is the drawn diet (the seed prescription), so the body is matched on recorded data',
      steps: [tabN, openDiet],
      arrived: addMeal,
      mask,
    },
    'cd3-live': {
      ...base,
      title: 'Kliens adatlap — Haladás, rajzolt adatok (élő magasság)',
      frame: 'client-detail-3.live',
      height: Math.round(1542 + DELTA + 229),
      reach: 'fixture',
      why: 'client-detail-3 at the live page height on the drawn data: four records over four exercises (the page draws three charts - its cap - where the frame draws two; the twin carries a band for the third chart), the drawn sessions, the two drawn series (13 weekly slots, the 14-day pause after the 6th)',
      fixtures: cd3Fixtures,
      steps: [tabP],
      arrived: { text: { key: 'coaching.records' } },
      mask,
    },
    'cdb-nut-closed': {
      ...base,
      title: 'Táplálkozás — az étrend sora zárva',
      height: TALL,
      reach: 'seed',
      why: 'the tab as it opens: the diet row closed (chevron down), the create block',
      steps: [tabN],
      arrived: { role: 'button', name: { re: '^Rekomp étrend' } },
    },
    'cdb-nut-day3': {
      ...base,
      title: 'Táplálkozás — 3. nap (nincs étkezés)',
      height: TALL,
      reach: 'seed',
      why: 'a day that exists and has no meals: only Étkezés hozzáadása under the picker',
      steps: [tabN, openDiet, day(3, addMeal)],
      arrived: addMeal,
    },
    'cdb-nut-day-missing': {
      ...base,
      title: 'Táplálkozás — a 6. nap még nincs létrehozva',
      height: TALL,
      reach: 'fixture',
      why: 'a cycle day the diet has not created yet: Nap hozzáadása',
      fixtures: [{ method: 'GET', path: '/api/v1/nutrition-plans/1', edits: [{ pointer: '/days/5', remove: true }] }],
      steps: [tabN, openDiet, day(6, { role: 'button', name: { key: 'coaching.nutrition.addDay' } })],
      arrived: { role: 'button', name: { key: 'coaching.nutrition.addDay' } },
    },
    'cdb-nut-empty': {
      ...base,
      title: 'Táplálkozás — nincs étrend',
      height: TALL,
      reach: 'fixture',
      why: 'no diet for this link: the empty state with the one pill Új étrend',
      fixtures: [{ method: 'GET', path: '/api/v1/nutrition-plans', edits: [{ pointer: '/plans/0', remove: true }] }],
      steps: [{ click: tabN.click, arrived: { role: 'button', name: { key: 'coaching.nutrition.create' } } }],
      arrived: { role: 'button', name: { key: 'coaching.nutrition.create' } },
    },
    'cdb-nut-search': {
      ...base,
      title: 'Táplálkozás — ételkeresés („csirke”)',
      height: TALL,
      reach: 'seed',
      why: 'the food search under the first meal: up to five results (name + kcal / 100 g)',
      steps: [tabN, openDiet, typeCsirke],
      arrived: firstHit,
    },
    'cdb-nut-picked': {
      ...base,
      title: 'Táplálkozás — kiválasztott étel, gramm, Hozzáadás',
      height: TALL,
      reach: 'seed',
      why: 'a food picked from the results: its name, the grams field and Hozzáadás (the add is not clicked)',
      steps: [tabN, openDiet, typeCsirke, { click: firstHit, arrived: { role: 'button', name: { key: 'common.add' } } }],
      arrived: { role: ['textbox', 'spinbutton'], name: { key: 'nutrition.grams' } },
    },
    'cdb-nut-add-stub': {
      ...base,
      title: 'Táplálkozás — Hozzáadás (a POST csonkkal megválaszolva)',
      height: TALL,
      reach: 'fixture',
      why: 'Hozzáadás fires POST /nutrition-plans/1/items with the picked food and the grams; a stub answers it in the browser (nothing reaches the server) and the picked row closes',
      fixtures: [{ method: 'POST', path: '/api/v1/nutrition-plans/1/items', status: 200, body: {} }],
      expect: { requests: [{ method: 'POST', path: '/api/v1/nutrition-plans/1/items', status: 200 }] },
      steps: [
        tabN,
        openDiet,
        typeCsirke,
        { click: firstHit, arrived: { role: 'button', name: { key: 'common.add' } } },
        { click: { role: 'button', name: { key: 'common.add' } }, arrived: addMeal },
      ],
      arrived: addMeal,
    },
    'cdb-nut-delete-stub': {
      ...base,
      title: 'Táplálkozás — tétel törlése (a DELETE csonkkal megválaszolva)',
      height: TALL,
      reach: 'fixture',
      why: 'the row cross fires DELETE /nutrition-plans/1/items/:id at once (no confirm, as today); a stub answers it in the browser',
      fixtures: [{ method: 'DELETE', path: '/api/v1/nutrition-plans/1/items/1', status: 200, body: {} }],
      expect: { requests: [{ method: 'DELETE', path: '/api/v1/nutrition-plans/1/items/1', status: 200 }] },
      steps: [tabN, openDiet, { click: { role: 'button', name: { key: 'common.delete' }, nth: 0 }, arrived: addMeal }],
      arrived: addMeal,
    },
    'cdb-prog-recorded': {
      ...base,
      title: 'Haladás — a felvett adatokkal (három grafikon, folyamatban lévő edzés)',
      height: TALL,
      reach: 'seed',
      why: 'the recording as it is: three charts (cap 3), eight records, twenty sessions, the first one still running (folyamatban in the accent)',
      steps: [tabP],
      arrived: { text: { key: 'coaching.records' } },
    },
    'cdb-prog-empty': {
      ...base,
      title: 'Haladás — nincs előzmény',
      height: TALL,
      reach: 'fixture',
      why: 'no records and no sessions: the empty state',
      fixtures: [
        { method: 'GET', path: '/api/v1/clients/1/records', edits: removeAll('records', 18) },
        { method: 'GET', path: '/api/v1/clients/1/workouts', edits: removeAll('logs', 20) },
      ],
      steps: [{ click: tabP.click, arrived: { text: { key: 'coaching.noHistoryTitle' } } }],
      arrived: { text: { key: 'coaching.noHistoryTitle' } },
    },
    'cdb-prog-thin': {
      ...base,
      title: 'Haladás — kevés adat egy gyakorlathoz',
      height: TALL,
      reach: 'fixture',
      why: 'a charted exercise with two readings: its name over the not-enough sentence, no box',
      fixtures: [{ method: 'GET', path: '/api/v1/progress', query: { exercise_id: 1619 }, edits: removeAll('points', 12).slice(0, 10) }],
      steps: [{ click: tabP.click, arrived: { text: { hu: 'Még kevés adat a grafikonhoz (2 nap). Három edzésnap kell hozzá — két pont még nem trend.', en: 'Not enough data to chart yet (2 day(s)). Three training days are needed — two points are not a trend.', de: 'Noch zu wenig Daten für ein Diagramm (2 Tag(e)). Drei Trainingstage sind nötig — zwei Punkte sind kein Trend.' } } }],
      arrived: { text: { hu: 'Még kevés adat a grafikonhoz (2 nap). Három edzésnap kell hozzá — két pont még nem trend.', en: 'Not enough data to chart yet (2 day(s)). Three training days are needed — two points are not a trend.', de: 'Noch zu wenig Daten für ein Diagramm (2 Tag(e)). Drei Trainingstage sind nötig — zwei Punkte sind kein Trend.' } },
    },
    'cdb-prog-sessions-only': {
      ...base,
      title: 'Haladás — csak edzések (nincs rekord)',
      height: TALL,
      reach: 'fixture',
      why: 'no records: Fejlődés and Rekordok drop out, Edzések keeps its section rule',
      fixtures: [{ method: 'GET', path: '/api/v1/clients/1/records', edits: removeAll('records', 18) }],
      steps: [{ click: tabP.click, arrived: { text: { key: 'coaching.sessions' } } }],
      arrived: { text: { key: 'coaching.sessions' } },
    },
  },
  notCapturable: {
    'draft diet (draft note + Aktiválás)':
      'pulse-fixture-check refuses status "draft" on GET /nutrition-plans and /nutrition-plans/:id (no recording holds it; the type NutritionPlan allows it) - code only, structure; reachable live once K has a sandbox draft diet (R-S-client-detail-b-01)',
    'nutrition-loading / editor-loading / progress-loading':
      'replay answers instantly; the ListRowSkeleton placeholders are code-only - structure',
    'live diet writes on K (add day / meal / item, delete, activate)':
      "the capture tool admits a live write only on a path naming a .pulse/sandbox.json id; K's diet has none (only writeClientLink 2, which no diet route carries) - request R-S-client-detail-b-01 (sandbox). Meanwhile each fired write is proven in replay by a stub that answers it (cdb-nut-add-stub, cdb-nut-delete-stub)",
    'two or more diets on one link':
      'needs a second plan row in GET /nutrition-plans with ids no recording holds - code only (the open editor follows its own row)',
  },
};

fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`states.json written (delta ${DELTA})`);
