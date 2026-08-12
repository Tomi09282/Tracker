/**
 * The moderation queue, exercised in BOTH directions — through HTTP, not through a copy of a query.
 *
 * ═══ WHY THIS GOES OVER THE WIRE ═══════════════════════════════════════════════════════════════
 *
 * The first version of this probe imported `VISIBLE` and ran the predicate itself. It reported the
 * defect correctly and then reported the FIX as still broken, because the fix does not live in the
 * predicate — it lives in a fallback arm in the route, which a probe holding its own copy of the
 * query can never reach. An audit must not carry its own copy of what it audits.
 *
 * The two directions:
 *
 *   forward  — the moderator can read the submission and load its media, or they are approving a
 *              movement into the shared library on the strength of its name;
 *   backward — that arm reaches submissions AND NOTHING ELSE. A coach's private exercise stays 404
 *              for an admin, and a decided one goes back to 404 the moment it leaves the queue.
 *
 * Needs the server running. Run: npm run verify:moderation
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MEDIA_DIR } from '../src/lib/media.js';

const BASE = 'http://localhost:3000/api/v1';
const PASSWORD = 'TrackerDev123';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const session = () => {
  let jar = '';
  return async (path_, init = {}) => {
    const headers = { 'x-csrf': '1', 'sec-fetch-site': 'same-origin', ...(jar ? { cookie: jar } : {}) };
    if (init.json !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(BASE + path_, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const set = r.headers.getSetCookie?.() ?? [];
    if (set.length) {
      const m = new Map((jar ? jar.split('; ') : []).map((c) => [c.split('=')[0], c]));
      for (const c of set) m.set(c.split('=')[0], c.split(';')[0]);
      jar = [...m.values()].join('; ');
    }
    let json = null;
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      try {
        json = await r.json();
      } catch { /* empty */ }
    }
    return { status: r.status, json, type: ct };
  };
};

const db = await import('../src/db/index.js');

/* ── fixtures: a queued submission and a private one, both with a real file on disk ───────────── */

// A real file, because `sendFile` answers 404 for a missing file too — and a probe that cannot tell
// "the predicate refused" from "the bytes are not there" proves nothing about either.
const A_REAL_WEBP = Buffer.from('UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
const keyFor = () => `${crypto.randomUUID()}.webp`;

const [coach] = await db.all("SELECT id FROM users WHERE email = 'coach@tracker.local'");
const [client] = await db.all("SELECT id FROM users WHERE email = 'user@tracker.local'");

const made = { exercises: [], files: [] };

const makeExercise = async (label, status) => {
  const name = `Moderation Probe ${label} ${Date.now()}`;
  await db.run(
    `INSERT INTO exercises (name, normalized_name, description, instructions, owner_id, status, difficulty,
                            exercise_type, submitted_at)
     VALUES (?, ?, 'probe description', ?, ?, ?, 'intermediate', 'strength', datetime('now'))`,
    [name, name.toLowerCase(), JSON.stringify(['Step one', 'Step two']), coach.id, status],
  );
  const [row] = await db.all('SELECT id FROM exercises WHERE normalized_name = ?', [name.toLowerCase()]);
  const key = keyFor();
  fs.writeFileSync(path.join(MEDIA_DIR, key), A_REAL_WEBP);
  await db.run(
    `INSERT INTO exercise_media (exercise_id, kind, storage_key, mime, position)
     VALUES (?, 'image', ?, 'image/webp', 0)`,
    [row.id, key],
  );
  // One muscle, so "the moderator sees the muscles" is a claim with something behind it.
  await db.run(
    `INSERT INTO exercise_muscle_map (exercise_id, muscle_group_id, role)
     VALUES (?, (SELECT id FROM muscle_groups ORDER BY sort_order LIMIT 1), 'primary')`,
    [row.id],
  );
  made.exercises.push(row.id);
  made.files.push(key);
  return { id: row.id, key, name };
};

const queued = await makeExercise('QUEUED', 'pending_review');
const priv = await makeExercise('PRIVATE', 'private');

const admin = session();
await admin('/auth/login', { method: 'POST', json: { email: 'admin@tracker.local', password: PASSWORD } });

/* ── forward: the moderator can actually review ──────────────────────────────────────────────── */

{
  const r = await admin(`/admin/moderation/${queued.id}`);
  check('the moderator can open the submission', r.status === 200, `status ${r.status}`);
  check(
    'and it carries the INSTRUCTIONS, which is what they are judging',
    Array.isArray(r.json?.exercise?.instructions) && r.json.exercise.instructions.length === 2,
    JSON.stringify(r.json?.exercise?.instructions ?? null),
  );
  check('the muscles it claims to work', (r.json?.muscles ?? []).length === 1, `${(r.json?.muscles ?? []).length}`);
  check('the media it ships with', (r.json?.media ?? []).length === 1, `${(r.json?.media ?? []).length}`);
  check('and the author, so a pattern of submissions is visible', Boolean(r.json?.exercise?.owner_email));

  /*
   * The anti-drift assertion, and the reason `exercises/detail.js` exists.
   *
   * Two routes answer "show me this exercise" and they must answer with the SAME fields, or the
   * moderation screen silently becomes a subset of the library screen and somebody approves what
   * they could not see. Compared against a global exercise, which both routes can reach.
   */
  const [globalEx] = await db.all("SELECT id FROM exercises WHERE status = 'global' ORDER BY id LIMIT 1");
  const lib = await admin(`/exercises/${globalEx.id}`);
  const libKeys = Object.keys(lib.json?.exercise ?? {}).sort();
  const modKeys = Object.keys(r.json?.exercise ?? {}).filter((k) => k !== 'owner_email').sort();
  check(
    'the moderation view shows the same fields as the library view',
    JSON.stringify(libKeys) === JSON.stringify(modKeys),
    JSON.stringify(modKeys.filter((k) => !libKeys.includes(k))) + ' extra / ' +
      JSON.stringify(libKeys.filter((k) => !modKeys.includes(k))) + ' missing',
  );

  const media = await admin(`/media/${queued.key}`);
  check(
    'and the picture LOADS — the measured defect that started this',
    media.status === 200,
    `status ${media.status}`,
  );
}

/* ── backward: the arm reaches the queue and nothing else ────────────────────────────────────── */

{
  const detail = await admin(`/admin/moderation/${priv.id}`);
  check(
    "a coach's PRIVATE exercise is not reachable through the moderation route",
    detail.status === 404,
    `status ${detail.status}`,
  );

  const media = await admin(`/media/${priv.key}`);
  check(
    "nor is its media — the admin arm is scoped to pending_review, not to 'admin sees everything'",
    media.status === 404,
    `status ${media.status}`,
  );

  const asClient = session();
  await asClient('/auth/login', { method: 'POST', json: { email: 'user@tracker.local', password: PASSWORD } });
  const nonAdmin = await asClient(`/admin/moderation/${queued.id}`);
  check('a non-admin is refused at the role gate', nonAdmin.status === 403, `status ${nonAdmin.status}`);
  const nonAdminMedia = await asClient(`/media/${queued.key}`);
  check('and cannot load queued media either', nonAdminMedia.status === 404, `status ${nonAdminMedia.status}`);
}

/* ── and the read expires with the decision ──────────────────────────────────────────────────── */

{
  const decided = await admin(`/admin/moderation/${queued.id}`, {
    method: 'POST',
    json: { decision: 'reject', reason: 'probe rejection — not a real decision' },
  });
  check('the decision goes through', decided.status === 200, `status ${decided.status}`);

  const after = await admin(`/media/${queued.key}`);
  check(
    'and the moderator loses the read the moment it leaves the queue',
    after.status === 404,
    `status ${after.status}`,
  );

  const reason = await db.all('SELECT status, rejection_reason FROM exercises WHERE id = ?', [queued.id]);
  check(
    'the reason is stored where the AUTHOR can read it',
    reason[0].status === 'rejected' && reason[0].rejection_reason?.startsWith('probe rejection'),
    `${reason[0].status} / ${JSON.stringify(reason[0].rejection_reason)}`,
  );

  // The other half of that claim: the author's own detail route must actually hand it over, or the
  // mandatory reason is a column nobody reads. It was, until this feature.
  const asCoach = session();
  await asCoach('/auth/login', { method: 'POST', json: { email: 'coach@tracker.local', password: PASSWORD } });
  const mine = await asCoach(`/exercises/${queued.id}`);
  check(
    'and the author can read it back through their own exercise',
    mine.status === 200 && String(mine.json?.exercise?.rejection_reason ?? '').startsWith('probe rejection'),
    `status ${mine.status} / ${JSON.stringify(mine.json?.exercise?.rejection_reason ?? null)}`,
  );
}

/* ── cleanup ─────────────────────────────────────────────────────────────────────────────────── */

for (const id of made.exercises) {
  await db.run('DELETE FROM exercise_media WHERE exercise_id = ?', [id]);
  await db.run('DELETE FROM exercise_muscle_map WHERE exercise_id = ?', [id]);
  // The audit row is NOT cleaned up, and the attempt to is what taught this comment: 018's trigger
  // refuses the DELETE. A moderation decision that can be tidied away afterwards is not a record of
  // anything, so the probe's rejection stays on the log next to every real one — anonymous once the
  // exercise is gone, permanent either way.
  await db.run('DELETE FROM exercises WHERE id = ?', [id]);
}
for (const key of made.files) fs.rmSync(path.join(MEDIA_DIR, key), { force: true });

const left = await db.all(
  `SELECT COUNT(*) AS n FROM exercises WHERE id IN (${made.exercises.map(() => '?').join(',')})`,
  made.exercises,
);
check('the probe left nothing behind', left[0].n === 0, `${left[0].n} row(s)`);

await db.closePool();
console.log(`\nmoderation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
