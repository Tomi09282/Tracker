#!/usr/bin/env node
/*
 * pulse-sandbox — the objects verification is allowed to write on (PLAN.md 2.5, R25).
 *
 * The plan editor, the diet editor and the post editor have no save step: every tap is a server
 * write. So captures never touch the member's own plan or a published post; they write on a
 * handful of scratch objects made ONCE, right before the freeze, through the app's own API:
 *
 *   scratchPlan       a template plan with days and exercises      (plan-editor mutations)
 *   emptyPlan         a plan with NO days                          (the editor's empty state)
 *   draftPost         a draft post with a sample cover, never published   (compose-post-1)
 *   intervalPlanOnT   an interval plan assigned to demo.toth.reka@  (the interval player, live)
 *   threadWithN       the empty conversation with demo.nagy.balazs@ (coach-chat-2: opening that
 *                     route would otherwise CREATE the thread during a capture)
 *
 * and it records who may be written at all: demo.toth.reka@ as a member (sessions, food,
 * measurements), demo.kovacs.eszter@ as the coach's client (diet, equipment, chat).
 * The ids go to `.pulse/sandbox.json`; pulse-shot refuses a `writes` list that names anything else.
 *
 *   node scripts/pulse-sandbox.mjs              say what exists and what would be made (reads only)
 *   node scripts/pulse-sandbox.mjs --create     make what is missing, write .pulse/sandbox.json
 *   node scripts/pulse-sandbox.mjs --check      the recorded ids still exist (reads only; exit 1 if not)
 *
 * Integrator only, at the freeze. Re-running is safe: an object that exists (found by its name)
 * is reused, never made twice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_API, apiGet, getAccess, pulseDir, writeFileAtomic } from './pulse-shot.mjs';

const COACH = 'coach@tracker.local';
const WRITE_MEMBER = 'demo.toth.reka@tracker.local';
const WRITE_CLIENT = 'demo.kovacs.eszter@tracker.local';
const EMPTY_THREAD_WITH = 'demo.nagy.balazs@tracker.local';
const NAMES = {
  scratchPlan: 'PULSE homokozó – sablon',
  emptyPlan: 'PULSE homokozó – üres',
  intervalPlanOnT: 'PULSE homokozó – intervallum',
  draftPost: 'PULSE homokozó – piszkozat borítóval',
};
const DEFAULT_COVER = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepek/cover-gym.png';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const CREATE = flag('--create');
const CHECK = flag('--check');
const api = value('--api', DEFAULT_API);
const coverFile = value('--cover', DEFAULT_COVER);
const sandboxFile = path.join(pulseDir(), 'sandbox.json');

const log = (s) => console.log(`pulse-sandbox: ${s}`);
const objects = [];
const note = (key, what, outcome, id, reason) => {
  objects.push({ key, what, outcome, id: id ?? null, ...(reason ? { reason } : {}) });
  log(`${outcome.padEnd(8)} ${key}${id !== null && id !== undefined ? ` = ${id}` : ''} — ${what}${reason ? ` (${reason})` : ''}`);
};

/** A write through the app's own API, as the coach, with the CSRF header the server demands. */
async function send(method, apiPath, body, { multipart = false } = {}) {
  const access = await getAccess(COACH, { api, quiet: true });
  const headers = { Cookie: `access=${access.value}`, 'X-CSRF': '1' };
  if (!multipart && body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${api}${apiPath}`, { method, headers, body: multipart ? body : body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new Error(`${method} ${apiPath} answered ${res.status}${json?.error ? `: ${json.error}` : ''}`);
  return json;
}
const read = async (apiPath, as = COACH) => {
  const r = await apiGet(as, apiPath, { api });
  if (r.status !== 200) throw new Error(`GET ${apiPath} answered ${r.status}`);
  return r.body;
};
const idOf = (json) => json?.id ?? json?.plan?.id ?? json?.day?.id ?? json?.block?.id ?? json?.exercise?.id;

async function exerciseId(query, exact) {
  const { exercises } = await read(`/api/v1/exercises?q=${encodeURIComponent(query)}&lang=en&limit=10`);
  const hit = exact ? exercises.find((e) => e.name === exact) : exercises[0];
  if (!hit) throw new Error(`no catalogue exercise for "${exact || query}"`);
  return hit.id;
}

/** Makes one object unless it exists; a failure is recorded and the next object is still tried. */
async function ensure(key, what, existing, make) {
  if (existing !== null && existing !== undefined) return void note(key, what, 'exists', existing);
  if (!CREATE) return void note(key, what, 'missing', null, 'would be created with --create');
  try {
    note(key, what, 'created', await make());
  } catch (err) {
    note(key, what, 'FAILED', null, err.message);
  }
}

async function addDay(planId, day_index, name, exercises, block = { kind: 'single' }) {
  const day = idOf(await send('POST', `/api/v1/plans/${planId}/days`, exercises ? { day_index, name, est_minutes: 60, start_time: '18:00' } : { day_index, name, is_rest: true }));
  if (!exercises) return;
  let position = 0;
  for (const group of exercises) {
    const blockId = idOf(await send('POST', `/api/v1/plans/${planId}/blocks`, { day_id: day, position: position++, ...block }));
    let row = 0;
    for (const ex of group) await send('POST', `/api/v1/plans/${planId}/exercises`, { block_id: blockId, position: row++, ...ex });
  }
}

async function main() {
  const { clients } = await read('/api/v1/clients');
  const link = (email) => clients.find((c) => c.email === email && c.status === 'active')?.link_id ?? null;
  const links = { writeClientLink: link(WRITE_CLIENT), writeMemberLink: link(WRITE_MEMBER), emptyThreadLink: link(EMPTY_THREAD_WITH) };
  for (const [k, v] of Object.entries(links)) if (v === null) throw new Error(`the coach has no active link for ${k} — were seed:dev-users and seed:demo run?`);

  if (CHECK) {
    const saved = fs.existsSync(sandboxFile) ? JSON.parse(fs.readFileSync(sandboxFile, 'utf8')) : null;
    if (!saved) throw new Error(`${sandboxFile} does not exist`);
    const { plans } = await read('/api/v1/plans');
    const { posts } = await read('/api/v1/compose/posts?state=all');
    const { conversations } = await read('/api/v1/conversations');
    const problems = [];
    for (const k of ['scratchPlan', 'emptyPlan', 'intervalPlanOnT']) {
      if (saved.ids[k] !== null && saved.ids[k] !== undefined && !plans.some((p) => p.id === saved.ids[k])) problems.push(`${k} ${saved.ids[k]} is gone`);
    }
    if (saved.ids.draftPost && !posts.some((p) => p.id === saved.ids.draftPost && p.publishedAt === null)) problems.push(`draftPost ${saved.ids.draftPost} is gone or was published`);
    if (saved.ids.threadWithN && !conversations.some((c) => c.id === saved.ids.threadWithN)) problems.push(`threadWithN ${saved.ids.threadWithN} is gone`);
    for (const p of problems) log(`CHECK FAILED: ${p}`);
    log(problems.length ? 'the sandbox does not match the database — restore app.pulse-baseline.db' : 'every recorded sandbox object exists');
    process.exitCode = problems.length ? 1 : 0;
    return;
  }

  const { plans } = await read('/api/v1/plans');
  const planNamed = (name) => plans.find((p) => p.name === name)?.id ?? null;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date());

  await ensure('scratchPlan', 'template plan with days and exercises', planNamed(NAMES.scratchPlan), async () => {
    const bench = await exerciseId('Barbell Bench Press - Medium Grip', 'Barbell Bench Press - Medium Grip');
    const pull = await exerciseId('Pullups', 'Pullups');
    const squat = await exerciseId('Barbell Squat');
    const id = idOf(await send('POST', '/api/v1/plans', { name: NAMES.scratchPlan, description: 'A Pulse-ellenőrzés írható sablonja. Nem valódi terv.', goal: 'strength', cycle_days: 7 }));
    await addDay(id, 0, 'Homokozó A – nyomás', [[{ exercise_id: bench, target_sets: 4, target_reps_min: 6, target_reps_max: 8, target_weight: 60, rest_seconds: 150 }], [{ exercise_id: squat, target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_weight: 80, rest_seconds: 120 }]]);
    await addDay(id, 1, 'Pihenőnap', null);
    await addDay(id, 2, 'Homokozó B – húzás', [[{ exercise_id: pull, load_mode: 'bodyweight', target_sets: 4, target_reps_min: 5, target_reps_max: 8, rest_seconds: 150 }]]);
    return id;
  });

  await ensure('emptyPlan', 'plan with no days (the editor\'s empty state)', planNamed(NAMES.emptyPlan), async () =>
    idOf(await send('POST', '/api/v1/plans', { name: NAMES.emptyPlan, cycle_days: 7 })));

  await ensure('intervalPlanOnT', `interval plan assigned to ${WRITE_MEMBER}`, planNamed(NAMES.intervalPlanOnT), async () => {
    const squat = await exerciseId('Barbell Squat');
    const id = idOf(await send('POST', '/api/v1/plans', { name: NAMES.intervalPlanOnT, cycle_days: 7, starts_on: today, coach_client_id: links.writeMemberLink }));
    // the same interval day on every day of the cycle: "today" always has one, whatever the weekday
    for (let d = 0; d < 7; d++) {
      await addDay(id, d, 'Homokozó – intervallum', [[{ exercise_id: squat, target_metric: 'time', load_mode: 'bodyweight', target_sets: 1, target_seconds: 30, rest_seconds: 15 }]], { kind: 'emom', rounds: 4, cap_seconds: 240 });
    }
    await send('PATCH', `/api/v1/plans/${id}`, { status: 'active' });
    return id;
  });

  const { posts } = await read('/api/v1/compose/posts?state=all');
  await ensure('draftPost', 'draft post with a sample cover (never published)', posts.find((p) => p.title === NAMES.draftPost)?.id ?? null, async () => {
    if (!fs.existsSync(coverFile)) throw new Error(`the sample cover ${coverFile} is missing (give --cover <file>)`);
    const made = await send('POST', '/api/v1/compose/posts', {
      idempotency_key: 'pulse-sandbox-draft-0001', kind_key: 'program', title: NAMES.draftPost,
      body_src: 'Ide jön a téli blokk leírása. Még nincs kész: hiányzik az ár és a létszám.\n\n- hat hét\n- heti négy edzés',
      city_key: null, event_at: null, event_tz: null, capacity: null, price_minor: null, price_currency: null,
    });
    const publicId = made?.post?.id;
    if (!publicId) throw new Error('POST /compose/posts returned no post id');
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(coverFile)], { type: 'image/png' }), path.basename(coverFile));
    form.append('idempotency_key', 'pulse-sandbox-cover-0001');
    form.append('alt', 'Súlyzós terem lámpafényben');
    await send('POST', `/api/v1/compose/posts/${publicId}/cover`, form, { multipart: true });
    return publicId;
  });

  const { conversations } = await read('/api/v1/conversations');
  await ensure('threadWithN', `empty conversation with ${EMPTY_THREAD_WITH}`, conversations.find((c) => c.coach_client_id === links.emptyThreadLink)?.id ?? null, async () =>
    (await send('POST', '/api/v1/conversations', { coach_client_id: links.emptyThreadLink })).conversation.id);

  const ids = { ...links };
  for (const o of objects) ids[o.key] = o.id;
  if (!CREATE) {
    log('nothing was written (no --create). The file .pulse/sandbox.json is only written by --create.');
    return;
  }
  const failed = objects.filter((o) => o.outcome === 'FAILED');
  writeFileAtomic(sandboxFile, JSON.stringify({
    schema: 1, createdAt: new Date().toISOString(), api, coach: COACH, writeMember: WRITE_MEMBER, writeClient: WRITE_CLIENT, ids, objects,
    rule: 'a live capture may write only through a path that names one of these ids, or as the write member (PLAN R25)',
  }, null, 2) + '\n');
  log(`${sandboxFile} written${failed.length ? ` — ${failed.length} object(s) FAILED and are null; a state that needs one stays fixture-only` : ''}`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(`pulse-sandbox: ${err.message}`);
  process.exitCode = 2;
});
