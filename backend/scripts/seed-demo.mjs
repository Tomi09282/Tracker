// scripts/seed-demo.mjs — fills the three dev accounts with enough realistic content that every
// screen in the app has something to draw.
//
// WHY THIS EXISTS. The 27 screens were restyled against approved mockups, and an empty screen
// renders its EMPTY STATE — correct behaviour, and useless for judging a design. A week strip with
// no trained days, a progress chart with no points and a coach dashboard with no clients cannot be
// compared to anything. This script makes them non-empty.
//
// ═══ HOW IT TALKS TO THE DATABASE ══════════════════════════════════════════════════════════════
//
// Through `src/db/index.js` and nothing else, exactly like `seed-dev-users.mjs`. Every statement
// runs in the Piscina worker pool; no better-sqlite3 handle is opened on this thread. Bulk inserts
// go through `db.writeTx`, which is the same pool with one IMMEDIATE transaction around a list of
// steps — a session's ~20 set rows land atomically instead of as twenty separate round trips.
// Prepared statements with `?` placeholders throughout; no SQL is built by string interpolation.
//
// ═══ IDEMPOTENCY: CLEAR FIRST, THEN INSERT ═════════════════════════════════════════════════════
//
// CHOSEN APPROACH: delete every row this seeder owns, then insert from scratch.
//
// `INSERT OR IGNORE` with natural keys was the alternative and it does not work here. Most of the
// tables involved have surrogate ids and no natural-key unique index to conflict on — a workout log
// for a given day, a set inside it, a ledger entry, a message — so `OR IGNORE` would silently
// duplicate everything on the second run. Adding unique indexes to production tables to make a
// development fixture re-runnable is the tail wagging the dog.
//
// Deleting is safe because everything here belongs to accounts that exist only for development:
// the three `*@tracker.local` fixtures and the `demo.*@tracker.local` clients this script creates.
// Deleting the demo users cascades most of their content; the three fixed accounts survive and
// have their content deleted by owner id.
//
// THE ONE EXCEPTION IS `audit_log`, which carries `audit_log_no_delete` — an append-only trigger
// that refuses DELETE outright, deliberately, because an audit trail nobody can prune is the point
// of having one. Its rows therefore use a GUARDED INSERT (`INSERT ... SELECT ... WHERE NOT
// EXISTS`) keyed on a deterministic `request_id`, which is the natural key the table happens to
// have. Re-running adds nothing.
//
// ═══ DETERMINISTIC, NOT RANDOM ═════════════════════════════════════════════════════════════════
//
// A seeded LCG, never `Math.random()`. Two runs on the same day produce byte-identical content, so
// a screenshot taken today can be compared with a screenshot taken after a restyle. Dates are
// anchored on TODAY (a plan that started 12 weeks ago, logs that stop yesterday, a client who last
// trained 31 days ago), so running on a later day shifts the window forward as a whole — which is
// what makes "last trained 31 days ago" stay true instead of ageing into "last trained 90 days ago".
//
// The only non-deterministic value is the argon2 password hash shared by the demo clients: argon2
// salts randomly by design, and the hash appears on no screen.
//
// Usage:  npm run seed:demo        (run `npm run seed:dev-users` first)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import * as db from '../src/db/index.js';
import { buildBody, buildBio, POST_BODY } from '../src/public/body.js';
import { MEDIA_DIR, PUBLIC_MEDIA_DIR } from '../src/lib/media.js';
import { normalizeText } from '../src/lib/normalize.js';

/*
 * Fixed credentials are a backdoor anywhere but a developer's machine, and this script writes far
 * more of them than seed-dev-users does. Same refusal, same reason.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('refusing to seed demo content in production');
  process.exit(1);
}

const PASSWORD = 'TrackerDev123';
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const TZ = 'Europe/Budapest';
const REQ = 'seed-demo';

/* ═══ DETERMINISM ═══════════════════════════════════════════════════════════════════════════════ */

/** A 32-bit LCG (Numerical Recipes constants). Small, fast, and the same sequence every run. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rng = makeRng(20260824);
/** Integer in [lo, hi]. */
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
/** Deterministic pick from an array. */
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
/** True with probability p. */
const chance = (p) => rng() < p;

/** Deterministic hex, so storage keys and public ids are stable across runs. */
const hex32 = (label) => crypto.createHash('sha256').update(`demo:${label}`).digest('hex').slice(0, 32);
const uuidKey = (label) => {
  const h = hex32(label);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const publicId = (label) =>
  crypto.createHash('sha256').update(`demo:pid:${label}`).digest('base64url').slice(0, 12);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ═══ DATES ═════════════════════════════════════════════════════════════════════════════════════
 *
 * Civil dates are TEXT 'YYYY-MM-DD' and timestamps are epoch seconds — the 010 rule. The two are
 * never derived from one another at read time, so they are built separately here too.
 */
const DAY_MS = 86400000;
const isoOf = (d) => d.toISOString().slice(0, 10);
const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso, n) => isoOf(new Date(dateOf(iso).getTime() + n * DAY_MS));
const daysBetween = (a, b) => Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / DAY_MS);
/** Epoch seconds for a wall-clock time on a civil date, in the demo timezone (+02:00 in summer). */
const at = (iso, hhmm) => Math.floor(Date.parse(`${iso}T${hhmm}:00+02:00`) / 1000);

const TODAY = isoOf(new Date());
const YESTERDAY = addDays(TODAY, -1);
/** Monday of the current week, so day_index 0 of a 7-day cycle lands on a Monday. */
const MONDAY = (() => {
  const d = dateOf(TODAY);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(TODAY, -dow);
})();
const PLAN_START = addDays(MONDAY, -84); // twelve whole weeks ago
const NUTRITION_START = addDays(MONDAY, -56); // eight whole weeks ago
const NOW = Math.floor(Date.now() / 1000);

/* ═══ COUNTERS ══════════════════════════════════════════════════════════════════════════════════ */

const stats = new Map();
const bump = (key, n = 1) => stats.set(key, (stats.get(key) ?? 0) + n);

/* ═══ SMALL SQL HELPERS ═════════════════════════════════════════════════════════════════════════ */

const insert = async (sql, params) => {
  const { lastInsertRowid } = await db.run(sql, params);
  return lastInsertRowid;
};
/** `IN (?, ?, ...)` with the right number of placeholders. Never string-built values. */
const marks = (n) => Array.from({ length: n }, () => '?').join(', ');

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 0. THE THREE ACCOUNTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const REQUIRED = ['user@tracker.local', 'coach@tracker.local', 'admin@tracker.local'];
const found = await db.all(
  `SELECT id, email, role, created_at FROM users WHERE lower(trim(email)) IN (${marks(REQUIRED.length)})`,
  REQUIRED,
);
const byEmail = new Map(found.map((u) => [u.email.toLowerCase().trim(), u]));
const missing = REQUIRED.filter((e) => !byEmail.has(e));
if (missing.length) {
  console.error(`\nseed-demo: these accounts do not exist: ${missing.join(', ')}`);
  console.error('Run `npm run seed:dev-users` first — this script fills accounts, it does not create them.\n');
  await db.closePool();
  process.exit(1);
}

const MEMBER = byEmail.get('user@tracker.local').id;
const COACH = byEmail.get('coach@tracker.local').id;
const ADMIN = byEmail.get('admin@tracker.local').id;
const FIXED = [MEMBER, COACH, ADMIN];

console.log(`seed-demo: member=${MEMBER} coach=${COACH} admin=${ADMIN}`);
console.log(`           today=${TODAY}  plan starts ${PLAN_START}  nutrition starts ${NUTRITION_START}\n`);

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 1. CLEANUP — every row this seeder owns, in foreign-key-safe order
 *
 * Children before parents wherever an FK is RESTRICT or where a trigger reads the child; elsewhere
 * the parent delete cascades and doing it by hand would only be slower.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('clearing previous demo rows…');

const demoUsers = await db.all("SELECT id, email FROM users WHERE email LIKE 'demo.%@tracker.local'");
const demoIds = demoUsers.map((u) => u.id);
const owners = [...FIXED, ...demoIds];
const O = marks(owners.length);

// Moderation and marketplace first: content_reports cascades from posts and profiles, but the rows
// filed BY a demo reporter against something else must go too.
await db.run(
  `DELETE FROM content_reports
    WHERE reporter_user_id IN (${O}) OR subject_author_user_id IN (${O})`,
  [...owners, ...owners],
);
await db.run(`DELETE FROM message_reports WHERE reporter_id IN (${O})`, owners);
await db.run(`DELETE FROM coach_posts WHERE author_user_id IN (${O})`, owners); // cascades post_media
await db.run(`DELETE FROM coach_follows WHERE follower_user_id IN (${O}) OR coach_user_id IN (${O})`, [
  ...owners,
  ...owners,
]);
await db.run(`DELETE FROM coach_profile_specialties WHERE user_id IN (${O})`, owners);
await db.run(`DELETE FROM coach_profiles WHERE user_id IN (${O})`, owners);
// trg_profile_handle_retire_del has just parked those handles in retired_handles with a one-year
// cooldown. Re-claiming is permitted for the SAME user, but clearing them keeps the table honest.
await db.run(`DELETE FROM retired_handles WHERE prev_user_id IN (${O})`, owners);

// Training history. Records first — they reference sets, and the FK would only SET NULL them.
await db.run(`DELETE FROM workout_pr_events WHERE client_user_id IN (${O})`, owners);
await db.run(`DELETE FROM workout_logs WHERE client_user_id IN (${O})`, owners); // cascades exercises + sets
await db.run(`DELETE FROM workout_calendar_feeds WHERE user_id IN (${O})`, owners);
await db.run(
  `DELETE FROM workout_plans WHERE author_user_id IN (${O}) OR client_user_id IN (${O})`,
  [...owners, ...owners],
);

// Nutrition.
await db.run(`DELETE FROM nutrition_log_items WHERE client_user_id IN (${O})`, owners);
await db.run(
  `DELETE FROM nutrition_plans WHERE author_user_id IN (${O}) OR client_user_id IN (${O})`,
  [...owners, ...owners],
);
await db.run(`DELETE FROM foods WHERE owner_user_id IN (${O})`, owners);

// Progress.
await db.run(`DELETE FROM body_measurements WHERE client_user_id IN (${O})`, owners);
await db.run(`DELETE FROM progress_photos WHERE client_user_id IN (${O})`, owners);
await db.run(`DELETE FROM progress_shares WHERE client_user_id IN (${O})`, owners);
await db.run(`DELETE FROM progress_access_log WHERE subject_user_id IN (${O})`, owners);

// Chat and notifications.
await db.run(`DELETE FROM conversations WHERE client_id IN (${O}) OR coach_id IN (${O})`, [
  ...owners,
  ...owners,
]);
await db.run(`DELETE FROM notifications WHERE user_id IN (${O})`, owners);

// Money. The ledger has no BEFORE DELETE trigger, but the wallet it feeds is a derived column
// guarded by trg_coin_wallet_truthful — so the balance is recomputed from the (now empty) ledger
// immediately afterwards, which is the only value that trigger will accept.
await db.run(`DELETE FROM coin_ledger WHERE user_id IN (${O})`, owners);
await db.run(`DELETE FROM coin_purchases WHERE user_id IN (${O})`, owners); // cascades entitlements
await db.run(`DELETE FROM user_achievements WHERE user_id IN (${O})`, owners);
// An entitlement-gated theme with its entitlement deleted would leave a preference nothing backs.
await db.run(
  `UPDATE user_theme_prefs SET pack = 'midnight'
    WHERE user_id IN (${O})
      AND pack IN (SELECT key FROM theme_packs WHERE entitlement_key IS NOT NULL)`,
  owners,
);
for (const id of owners) {
  await db.run(
    `UPDATE coin_wallets
        SET balance_minor = (SELECT COALESCE(SUM(l.amount_minor), 0) FROM coin_ledger l WHERE l.user_id = coin_wallets.user_id),
            updated_at = unixepoch()
      WHERE user_id = ?`,
    [id],
  );
}

// Coaching relationships. Redemptions reference codes with ON DELETE SET NULL, so they would
// survive as orphans; they are demo rows too and go with the codes.
await db.run(
  `DELETE FROM invite_redemptions WHERE user_id IN (${O})
      OR code_id IN (SELECT id FROM invite_codes WHERE coach_id IN (${O}))`,
  [...owners, ...owners],
);
await db.run(`DELETE FROM invite_codes WHERE coach_id IN (${O})`, owners);
await db.run(`DELETE FROM referrals WHERE coach_id IN (${O}) OR referred_user_id IN (${O})`, [
  ...owners,
  ...owners,
]);
await db.run(`DELETE FROM teams WHERE coach_id IN (${O})`, owners);
await db.run(`DELETE FROM coach_clients WHERE coach_id IN (${O}) OR client_id IN (${O})`, [
  ...owners,
  ...owners,
]);

// Submitted exercises. After the logs, because trg_exercise_hard_delete_guard refuses to delete
// anything with training history hanging off it.
const oldMedia = await db.all(
  `SELECT m.storage_key FROM exercise_media m JOIN exercises e ON e.id = m.exercise_id
    WHERE e.owner_id IN (${O}) AND e.name LIKE 'Demó %'`,
  owners,
);
for (const m of oldMedia) fs.rmSync(path.join(MEDIA_DIR, m.storage_key), { force: true });
await db.run(`DELETE FROM exercises WHERE owner_id IN (${O}) AND name LIKE 'Demó %'`, owners);

// Finally the demo accounts themselves; everything still attached to them cascades away.
if (demoIds.length) {
  await db.run(`DELETE FROM users WHERE id IN (${marks(demoIds.length)})`, demoIds);
}
console.log(`cleared ${demoIds.length} demo account(s) and the fixed accounts' demo content\n`);

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 2. FOUNDATION — profiles, guidelines, subscription, theme
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/*
 * Publishing to the open internet requires an account older than `min_account_age_s_to_publish`
 * (86 400 s). A freshly seeded fixture is minutes old, so the coach and admin are aged backwards
 * by a week. Not a hack around the rule: the rule is about the age of a real account, and these
 * three exist to stand in for accounts that have been around.
 */
const AGE_FLOOR = NOW - 14 * 86400;
for (const id of FIXED) {
  await db.run('UPDATE users SET created_at = ? WHERE id = ? AND created_at > ?', [AGE_FLOOR, id, AGE_FLOOR]);
}

const [guidelines] = await db.all('SELECT version FROM guidelines_versions WHERE active = 1 LIMIT 1');
if (!guidelines) {
  console.error('seed-demo: no active guidelines version — the marketplace cannot be published');
  await db.closePool();
  process.exit(1);
}

const onboarding = [
  { id: MEMBER, goal: 'muscle', exp: 'intermediate', spw: 4, min: 70, loc: 'gym', h: 181, bw: 88.4, by: 1994, sex: 'male' },
  { id: COACH, goal: 'strength', exp: 'advanced', spw: 5, min: 90, loc: 'gym', h: 178, bw: 84.0, by: 1988, sex: 'male' },
  { id: ADMIN, goal: 'health', exp: 'beginner', spw: 3, min: 45, loc: 'mixed', h: 172, bw: 71.5, by: 1990, sex: 'female' },
];
for (const p of onboarding) {
  await db.run(
    `INSERT INTO onboarding_profiles
       (user_id, status, step, primary_goal, experience, sessions_per_week, session_minutes,
        training_location, units, height_cm, bodyweight_kg, birth_year, sex, notes, timezone, completed_at)
     VALUES (?, 'complete', 8, ?, ?, ?, ?, ?, 'metric', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       status = 'complete', primary_goal = excluded.primary_goal, experience = excluded.experience,
       sessions_per_week = excluded.sessions_per_week, session_minutes = excluded.session_minutes,
       training_location = excluded.training_location, height_cm = excluded.height_cm,
       bodyweight_kg = excluded.bodyweight_kg, birth_year = excluded.birth_year, sex = excluded.sex,
       notes = excluded.notes, timezone = excluded.timezone, completed_at = excluded.completed_at`,
    [
      p.id, p.goal, p.exp, p.spw, p.min, p.loc, p.h, p.bw, p.by, p.sex,
      'Térdsérülés után óvatosan a mély guggolásokkal.',
      TZ,
      NOW - 90 * 86400,
    ],
  );
  bump('onboarding_profiles');
}

await db.run(
  `INSERT OR IGNORE INTO onboarding_limitations (user_id, body_area, severity, note)
   VALUES (?, 'knee', 'caution', 'Régi meniszkusz-sérülés, 90 fok alatt kellemetlen.')`,
  [MEMBER],
);
await db.run(
  `INSERT OR IGNORE INTO onboarding_equipment (user_id, equipment_id)
   SELECT ?, id FROM equipment WHERE slug IN ('barbell', 'dumbbell', 'bench', 'cable', 'pull-up-bar', 'machine')`,
  [MEMBER],
);

for (const id of [COACH, ADMIN]) {
  await db.run(
    'INSERT OR IGNORE INTO guidelines_acceptances (user_id, version, accepted_at, request_id) VALUES (?, ?, ?, ?)',
    [id, guidelines.version, NOW - 10 * 86400, REQ],
  );
}
await db.run(
  `INSERT INTO coach_subscriptions (coach_id, tier_key, status, provider, updated_at)
   VALUES (?, 'unlimited', 'active', 'seed', unixepoch())
   ON CONFLICT(coach_id) DO UPDATE SET tier_key = 'unlimited', status = 'active', updated_at = unixepoch()`,
  [COACH],
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 3. EXERCISE PICKS
 *
 * By NAME PATTERN, never by literal id: exercise ids are assignment order and differ between a
 * freshly migrated database and one that has been upgraded. A pattern that finds nothing falls back
 * to a deterministic global row and SAYS SO, so a plan is never silently built on the wrong movement.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const fallbacks = [];
let fallbackCursor = 0;
async function ex(pattern) {
  const [row] = await db.all(
    `SELECT id, name FROM exercises
      WHERE status = 'global' AND deleted_at IS NULL AND normalized_name LIKE ?
      ORDER BY length(name), id LIMIT 1`,
    [`%${normalizeText(pattern)}%`],
  );
  if (row) return row;
  const [alt] = await db.all(
    `SELECT id, name FROM exercises WHERE status = 'global' AND deleted_at IS NULL
      ORDER BY id LIMIT 1 OFFSET ?`,
    [fallbackCursor++],
  );
  fallbacks.push(`${pattern} -> ${alt?.name ?? '(none)'}`);
  return alt;
}

const EX = {
  squat: await ex('squats'),
  bench: await ex('bench press'),
  deadlift: await ex('deadlifts'),
  ohp: await ex('overhead press'),
  row: await ex('bent over barbell row'),
  pullup: await ex('pull-ups'),
  pulldown: await ex('wide-grip lat pulldown'),
  legpress: await ex('leg press'),
  rdl: await ex('romanian deadlift'),
  curl: await ex('biceps curl'),
  pushdown: await ex('pushdown'),
  plank: await ex('plank'),
  legcurl: await ex('leg curl'),
  lateral: await ex('lateral raises'),
  facepull: await ex('face pull'),
  hipthrust: await ex('hip thrust'),
  pushup: await ex('push-up'),
  dips: await ex('dips'),
  calf: await ex('seated calf raise'),
  crunch: await ex('crunches'),
};
if (fallbacks.length) {
  console.log(`note: ${fallbacks.length} exercise pattern(s) fell back to an arbitrary global row:`);
  for (const f of fallbacks) console.log(`      ${f}`);
  console.log('');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 4. THE COACH'S ROSTER — demo accounts, teams, links, invite codes
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding the coach roster…');

/*
 * ONE hash for all the demo accounts. argon2 salts randomly, so this is the single value in the
 * whole script that differs between runs — and it is a credential, visible on no screen. Hashing
 * fourteen times would cost a second of wall clock and buy nothing.
 */
const DEMO_HASH = await argon2.hash(PASSWORD, ARGON2_OPTS);

/**
 * kind:
 *   'active'   — training regularly, sessions inside the 28-day window
 *   'lapsed'   — active link, last session `lastTrained` days ago, so the dashboard colours it amber
 *   'invited'  — has not accepted yet
 *   'pregen'   — coach-created account awaiting handover (must_change_credentials = 1)
 *   'coach'    — a second marketplace coach, not a client at all
 */
const PEOPLE = [
  { slug: 'kovacs.eszter', name: 'Kovács Eszter', kind: 'active', team: 0, origin: 'invite', sessions: 9, plan: true },
  { slug: 'nagy.balazs', name: 'Nagy Balázs', kind: 'active', team: 0, origin: 'team_code', sessions: 7 },
  { slug: 'toth.reka', name: 'Tóth Réka', kind: 'active', team: 1, origin: 'team_code', sessions: 11, plan: true },
  { slug: 'szabo.gergo', name: 'Szabó Gergő', kind: 'active', team: 1, origin: 'invite', sessions: 6 },
  { slug: 'horvath.anna', name: 'Horváth Anna', kind: 'active', team: 2, origin: 'invite', sessions: 8, plan: true },
  { slug: 'varga.mate', name: 'Varga Máté', kind: 'active', team: null, origin: 'manual', sessions: 5 },
  { slug: 'kiss.dora', name: 'Kiss Dóra', kind: 'active', team: 2, origin: 'team_code', sessions: 10 },
  { slug: 'molnar.zsolt', name: 'Molnár Zsolt', kind: 'lapsed', team: null, origin: 'invite', sessions: 4, lastTrained: 31 },
  { slug: 'farkas.nora', name: 'Farkas Nóra', kind: 'lapsed', team: 3, origin: 'invite', sessions: 3, lastTrained: 47 },
  { slug: 'balogh.tamas', name: 'Balogh Tamás', kind: 'invited', team: null, origin: 'invite', sessions: 0 },
  { slug: 'papp.viktoria', name: 'Papp Viktória', kind: 'invited', team: 3, origin: 'team_code', sessions: 0 },
  { slug: 'lukacs.adam', name: 'Lukács Ádám', kind: 'pregen', team: 0, origin: 'pregenerated', sessions: 0 },
  { slug: 'nemeth.zsofia', name: 'Németh Zsófia', kind: 'pregen', team: null, origin: 'pregenerated', sessions: 0 },
  { slug: 'coach.szilagyi.reka', name: 'Szilágyi Réka', kind: 'coach', handle: 'szilagyi-reka' },
  { slug: 'coach.feher.tamas', name: 'Fehér Tamás', kind: 'coach', handle: 'feher-tamas' },
];

for (const p of PEOPLE) {
  p.email = `demo.${p.slug}@tracker.local`;
  p.role = p.kind === 'coach' ? 'coach' : 'user';
  p.id = await insert(
    `INSERT INTO users (email, password_hash, role, must_change_credentials, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      p.email,
      DEMO_HASH,
      p.role,
      p.kind === 'pregen' ? 1 : 0,
      p.kind === 'pregen' ? COACH : null,
      NOW - ri(40, 300) * 86400,
      NOW,
    ],
  );
  bump('users (demo)');
  if (p.kind === 'coach') {
    await db.run(
      `INSERT INTO coach_subscriptions (coach_id, tier_key, status, provider, updated_at)
       VALUES (?, 'starter', 'active', 'seed', unixepoch())
       ON CONFLICT(coach_id) DO UPDATE SET tier_key = 'starter', status = 'active'`,
      [p.id],
    );
    await db.run(
      'INSERT OR IGNORE INTO guidelines_acceptances (user_id, version, accepted_at, request_id) VALUES (?, ?, ?, ?)',
      [p.id, guidelines.version, NOW - 20 * 86400, REQ],
    );
  }
}

const TEAM_DEFS = [
  { name: 'Reggeli csoport', desc: 'Hétköznap 6:30-as edzések a belvárosi teremben.' },
  { name: 'Erőemelő csapat', desc: 'Versenyre készülő haladók, heti négy alkalom.' },
  { name: 'Online kliensek', desc: 'Táv-edzésterv, heti videós visszajelzéssel.' },
  { name: 'Kezdő tábor', desc: 'Nyolchetes bevezető program teljesen kezdőknek.' },
];
const teams = [];
for (const [i, t] of TEAM_DEFS.entries()) {
  teams.push(
    await insert(
      'INSERT INTO teams (coach_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [COACH, t.name, t.desc, NOW - (200 - i * 30) * 86400, NOW],
    ),
  );
  bump('teams');
}

/** The member is the coach's client too — that is what makes the chat and the client detail real. */
const memberLink = await insert(
  `INSERT INTO coach_clients (coach_id, client_id, team_id, status, origin, invited_at, accepted_at, created_at, updated_at)
   VALUES (?, ?, ?, 'active', 'invite', ?, ?, ?, ?)`,
  [COACH, MEMBER, teams[1], NOW - 90 * 86400, NOW - 89 * 86400, NOW - 90 * 86400, NOW],
);
bump('coach_clients');

for (const p of PEOPLE) {
  if (p.kind === 'coach') continue;
  const invited = NOW - ri(35, 260) * 86400;
  p.link = await insert(
    `INSERT INTO coach_clients (coach_id, client_id, team_id, status, origin, invited_at, accepted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      COACH,
      p.id,
      p.team === null ? null : teams[p.team],
      p.kind === 'invited' ? 'invited' : 'active',
      p.origin,
      invited,
      p.kind === 'invited' ? null : invited + 86400,
      invited,
      NOW,
    ],
  );
  bump('coach_clients');
}

// One archived link, so "archived" is a state the roster query can be seen to exclude.
const archivedUser = await insert(
  'INSERT INTO users (email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ['demo.simon.laszlo@tracker.local', DEMO_HASH, 'user', NOW - 400 * 86400, NOW],
);
bump('users (demo)');
await db.run(
  `INSERT INTO coach_clients (coach_id, client_id, status, origin, invited_at, accepted_at, archived_at, created_at, updated_at)
   VALUES (?, ?, 'archived', 'invite', ?, ?, ?, ?, ?)`,
  [COACH, archivedUser, NOW - 400 * 86400, NOW - 399 * 86400, NOW - 60 * 86400, NOW - 400 * 86400, NOW],
);
bump('coach_clients');

/*
 * INVITE CODES. The plaintext is derived from a fixed label and only its SHA-256 is stored — the
 * same treatment the product gives a real code, so nothing here teaches a bad habit. The plaintexts
 * are printed at the end so they can actually be redeemed by hand.
 */
const CODES = [
  { label: 'REGGELI', team: 0, kind: 'multi', max: 10, uses: 7 },
  { label: 'EROEMELO', team: 1, kind: 'multi', max: 20, uses: 3 },
  { label: 'ONLINE24', team: 2, kind: 'multi', max: 5, uses: 5 },
  { label: 'EGYSZERI', team: null, kind: 'single', max: 1, uses: 1 },
  { label: 'VISSZAVONT', team: 3, kind: 'multi', max: 10, uses: 2, revoked: 30 },
  { label: 'LEJART', team: null, kind: 'multi', max: 10, uses: 0, expired: 14 },
  { label: 'UJKODUJEV', team: 0, kind: 'multi', max: 25, uses: 0 },
];
const codeIds = [];
for (const c of CODES) {
  const plaintext = `DEMO-${c.label}`;
  const id = await insert(
    `INSERT INTO invite_codes (code_hash, label, coach_id, team_id, kind, max_uses, uses, expires_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sha256(plaintext),
      c.label,
      COACH,
      c.team === null ? null : teams[c.team],
      c.kind,
      c.max,
      c.uses,
      c.expired ? NOW - c.expired * 86400 : NOW + 180 * 86400,
      c.revoked ? NOW - c.revoked * 86400 : null,
      NOW - 210 * 86400,
    ],
  );
  codeIds.push({ id, ...c, plaintext });
  bump('invite_codes');
}

const clientsWithLink = PEOPLE.filter((p) => p.link);
for (const [i, p] of clientsWithLink.entries()) {
  const code = codeIds[i % 3];
  await db.run(
    'INSERT INTO invite_redemptions (code_id, user_id, outcome, ip, created_at) VALUES (?, ?, ?, ?, ?)',
    [code.id, p.id, 'accepted', '192.0.2.10', NOW - ri(30, 250) * 86400],
  );
  bump('invite_redemptions');
}
for (const [outcome, codeIdx] of [['exhausted', 2], ['revoked', 4], ['expired', 5], ['seat_limit', 1]]) {
  await db.run(
    'INSERT INTO invite_redemptions (code_id, user_id, outcome, ip, created_at) VALUES (?, ?, ?, ?, ?)',
    [codeIds[codeIdx].id, null, outcome, '198.51.100.7', NOW - ri(2, 20) * 86400],
  );
  bump('invite_redemptions');
}
for (const p of clientsWithLink.slice(0, 4)) {
  await db.run('INSERT INTO referrals (coach_id, referred_user_id, code_id, awarded_at, created_at) VALUES (?, ?, ?, ?, ?)', [
    COACH,
    p.id,
    codeIds[0].id,
    NOW - 40 * 86400,
    NOW - 45 * 86400,
  ]);
  bump('referrals');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 5. PLANS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding plans…');

/** One prescribed exercise. `w` is the target load in kg (null for bodyweight / timed work). */
const P = (e, sets, lo, hi, w, opts = {}) => ({ e, sets, lo, hi, w, ...opts });

/**
 * Writes a whole plan tree: days -> blocks -> exercises -> per-set targets.
 * Returns { planId, days: [{ id, dayIndex, isRest, name, exercises: [{ id, ...spec }] }] }.
 */
async function writePlan(plan) {
  const planId = await insert(
    `INSERT INTO workout_plans
       (scope, author_user_id, coach_client_id, client_user_id, name, normalized_name, description,
        goal, experience, cycle_days, starts_on, ends_on, status, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      plan.scope,
      plan.author,
      plan.link ?? null,
      plan.client ?? null,
      plan.name,
      normalizeText(plan.name),
      plan.description ?? null,
      plan.goal ?? null,
      plan.experience ?? null,
      plan.cycle,
      plan.startsOn ?? null,
      plan.endsOn ?? null,
      plan.status,
      plan.archivedAt ?? null,
      plan.createdAt ?? NOW - 90 * 86400,
      NOW,
    ],
  );
  bump('workout_plans');

  const days = [];
  for (const d of plan.days) {
    const dayId = await insert(
      `INSERT INTO workout_plan_days (plan_id, day_index, slot, name, notes, is_rest, est_minutes, start_time, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [
        planId, d.index, d.name, d.notes ?? null, d.rest ? 1 : 0,
        d.rest ? null : (d.minutes ?? 65), d.rest ? null : (d.time ?? '18:00'),
        NOW - 90 * 86400, NOW,
      ],
    );
    bump('workout_plan_days');
    const day = { id: dayId, dayIndex: d.index, isRest: !!d.rest, name: d.name, exercises: [] };
    days.push(day);
    if (d.rest) continue;

    for (const [bi, block] of (d.blocks ?? []).entries()) {
      const blockId = await insert(
        `INSERT INTO workout_plan_blocks (plan_id, day_id, kind, position, rounds, rest_seconds, cap_seconds, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          planId, dayId, block.kind ?? 'single', bi,
          block.kind === 'circuit' || block.kind === 'emom' ? (block.rounds ?? 3) : null,
          block.rest ?? 120, null, block.label ?? null, NOW - 90 * 86400,
        ],
      );
      bump('workout_plan_blocks');

      for (const [pi, spec] of block.items.entries()) {
        const timed = spec.metric === 'time';
        const rowId = await insert(
          `INSERT INTO workout_plan_exercises
             (plan_id, block_id, exercise_id, exercise_name_snapshot, position, target_metric, load_mode,
              target_sets, target_reps_min, target_reps_max, target_seconds, target_weight_kg,
              target_weight_entry_unit, target_weight_entry_value, target_rpe, rest_seconds, tempo, notes,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planId, blockId, spec.e.id, spec.e.name, pi,
            timed ? 'time' : 'reps',
            spec.load ?? 'external',
            spec.sets,
            timed ? null : spec.lo,
            timed ? null : spec.hi,
            timed ? spec.seconds : null,
            spec.w ?? null,
            spec.w == null ? null : 'kg',
            spec.w ?? null,
            spec.rpe ?? null,
            spec.rest ?? 120,
            spec.tempo ?? null,
            spec.notes ?? null,
            NOW - 90 * 86400, NOW,
          ],
        );
        bump('workout_plan_exercises');
        const entry = { id: rowId, ...spec, blockKind: block.kind ?? 'single', blockOrdinal: bi, position: pi, timed };
        day.exercises.push(entry);

        // A per-set ladder where the coach wrote one: a warm-up plus a descending wave. Rows here
        // WIN over the uniform expansion, which is why only the main lifts get them.
        if (spec.ladder) {
          for (const [si, rung] of spec.ladder.entries()) {
            await insert(
              `INSERT INTO workout_plan_set_targets
                 (plan_id, exercise_row_id, set_index, set_kind, target_reps, target_weight_kg,
                  target_weight_entry_unit, target_weight_entry_value, target_rpe, rest_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                planId, rowId, si + 1, rung.kind, rung.reps, rung.w,
                rung.w == null ? null : 'kg', rung.w ?? null, rung.rpe ?? null, rung.rest ?? 150,
              ],
            );
            bump('workout_plan_set_targets');
          }
        }
      }
    }
  }
  return { planId, days };
}

/* ── the member's live plan: a 7-day cycle, four training days, three prescribed rest days ─────── */

const memberPlanSpec = {
  scope: 'client',
  author: COACH,
  link: memberLink,
  client: MEMBER,
  name: 'Felső/alsó szplit – 12 hetes blokk',
  description:
    'Négy edzés hetente, felső/alsó bontásban. A fő gyakorlatoknál hetente kis terhelésemelés, ' +
    'a negyedik hét mindig könnyebb. A pihenőnapokon 20-30 perc séta.',
  goal: 'muscle',
  experience: 'intermediate',
  cycle: 7,
  startsOn: PLAN_START,
  status: 'active',
  createdAt: at(PLAN_START, '09:00'),
  days: [
    {
      index: 0, name: 'Alsótest – erő', minutes: 70, time: '18:00',
      notes: 'A guggolásnál a térd miatt ne menj párhuzamos alá.',
      blocks: [
        {
          kind: 'single', rest: 180, items: [
            P(EX.squat, 4, 5, 5, 100, {
              rpe: 8, rest: 210,
              ladder: [
                { kind: 'warmup', reps: 8, w: 60, rest: 90 },
                { kind: 'straight', reps: 5, w: 100, rpe: 7.5, rest: 210 },
                { kind: 'straight', reps: 5, w: 100, rpe: 8, rest: 210 },
                { kind: 'straight', reps: 5, w: 100, rpe: 8.5, rest: 210 },
              ],
            }),
          ],
        },
        { kind: 'single', rest: 150, items: [P(EX.rdl, 3, 8, 10, 80, { rpe: 7.5, rest: 150 })] },
        { kind: 'single', rest: 90, items: [P(EX.legpress, 3, 10, 12, 150, { rest: 120 })] },
        { kind: 'single', rest: 90, items: [P(EX.legcurl, 3, 12, 15, 40, { rest: 90 })] },
        { kind: 'single', rest: 60, items: [P(EX.plank, 3, null, null, null, { metric: 'time', seconds: 45, load: 'bodyweight', rest: 60 })] },
      ],
    },
    { index: 1, name: 'Pihenőnap', rest: true, notes: '20-30 perc laza séta.' },
    {
      index: 2, name: 'Felsőtest – nyomás', minutes: 65, time: '18:00',
      blocks: [
        {
          kind: 'single', rest: 180, items: [
            P(EX.bench, 4, 5, 6, 80, {
              rpe: 8, rest: 180,
              ladder: [
                { kind: 'warmup', reps: 8, w: 50, rest: 90 },
                { kind: 'straight', reps: 6, w: 80, rpe: 7.5, rest: 180 },
                { kind: 'straight', reps: 6, w: 80, rpe: 8, rest: 180 },
                { kind: 'straight', reps: 5, w: 80, rpe: 9, rest: 180 },
              ],
            }),
          ],
        },
        { kind: 'single', rest: 150, items: [P(EX.ohp, 3, 8, 10, 45, { rpe: 8, rest: 150 })] },
        { kind: 'single', rest: 90, items: [P(EX.dips, 3, 8, 12, 10, { load: 'weighted_bodyweight', rest: 120 })] },
        {
          kind: 'superset', rest: 75, label: 'Váll + tricepsz',
          items: [
            P(EX.lateral, 3, 12, 15, 10, { rest: 45 }),
            P(EX.pushdown, 3, 12, 15, 30, { rest: 75 }),
          ],
        },
      ],
    },
    { index: 3, name: 'Pihenőnap', rest: true, notes: 'Mobilizálás, csípő és mellkas.' },
    {
      index: 4, name: 'Felsőtest – húzás', minutes: 65, time: '18:00',
      blocks: [
        { kind: 'single', rest: 180, items: [P(EX.row, 4, 6, 8, 70, { rpe: 8, rest: 180 })] },
        { kind: 'single', rest: 150, items: [P(EX.pullup, 4, 5, 8, null, { load: 'bodyweight', rest: 150 })] },
        { kind: 'single', rest: 90, items: [P(EX.pulldown, 3, 10, 12, 55, { rest: 120 })] },
        {
          kind: 'superset', rest: 75, label: 'Bicepsz + hátsó váll',
          items: [
            P(EX.curl, 3, 10, 12, 15, { rest: 45 }),
            P(EX.facepull, 3, 15, 20, 20, { rest: 75 }),
          ],
        },
      ],
    },
    {
      index: 5, name: 'Alsótest – volumen', minutes: 60, time: '10:00',
      blocks: [
        { kind: 'single', rest: 150, items: [P(EX.hipthrust, 4, 8, 10, 90, { rpe: 8, rest: 150 })] },
        { kind: 'single', rest: 120, items: [P(EX.legpress, 4, 12, 15, 130, { rest: 120 })] },
        { kind: 'single', rest: 90, items: [P(EX.calf, 4, 12, 15, 60, { rest: 75 })] },
        { kind: 'single', rest: 60, items: [P(EX.crunch, 3, 15, 20, null, { load: 'bodyweight', rest: 60 })] },
      ],
    },
    { index: 6, name: 'Pihenőnap', rest: true, notes: 'Teljes pihenő.' },
  ],
};

const memberPlan = await writePlan(memberPlanSpec);

/* ── the coach's library: five templates in four different states ─────────────────────────────── */

const simpleDay = (index, name, items, opts = {}) => ({
  index, name, minutes: opts.minutes ?? 55, time: opts.time ?? '17:30',
  blocks: [{ kind: 'single', rest: 120, items }],
});

const TEMPLATES = [
  {
    name: 'Erő alapok – 4 hetes blokk', status: 'active', cycle: 7, goal: 'strength', experience: 'beginner',
    description: 'Három teljes testes edzés hetente, guggolás–nyomás–húzás gerinccel.',
    days: [
      simpleDay(0, 'A nap – guggolás', [P(EX.squat, 5, 5, 5, 80, { rpe: 7 }), P(EX.bench, 3, 8, 8, 60), P(EX.row, 3, 8, 10, 50)]),
      { index: 1, name: 'Pihenő', rest: true },
      simpleDay(2, 'B nap – felhúzás', [P(EX.deadlift, 3, 5, 5, 110, { rpe: 8 }), P(EX.ohp, 3, 8, 10, 35), P(EX.pulldown, 3, 10, 12, 45)]),
      { index: 3, name: 'Pihenő', rest: true },
      simpleDay(4, 'C nap – vegyes', [P(EX.legpress, 4, 10, 12, 120), P(EX.dips, 3, 6, 10, null, { load: 'bodyweight' }), P(EX.curl, 3, 10, 12, 12)]),
      { index: 5, name: 'Pihenő', rest: true },
      { index: 6, name: 'Pihenő', rest: true },
    ],
  },
  {
    name: 'Hipertrófia push / pull / láb', status: 'draft', cycle: 7, goal: 'muscle', experience: 'intermediate',
    description: 'Hatnapos push/pull/láb, még szerkesztés alatt.',
    days: [
      simpleDay(0, 'Push', [P(EX.bench, 4, 8, 10, 70), P(EX.ohp, 3, 10, 12, 35), P(EX.lateral, 4, 12, 15, 8)]),
      simpleDay(1, 'Pull', [P(EX.row, 4, 8, 10, 60), P(EX.pulldown, 3, 10, 12, 50), P(EX.curl, 3, 12, 15, 12)]),
      simpleDay(2, 'Láb', [P(EX.squat, 4, 8, 10, 85), P(EX.legcurl, 3, 12, 15, 35), P(EX.calf, 4, 15, 20, 50)]),
      { index: 3, name: 'Pihenő', rest: true },
    ],
  },
  {
    name: 'Kezdő teljes test – 8 hét', status: 'active', cycle: 7, goal: 'health', experience: 'none',
    description: 'Gépes és saját testsúlyos bevezető program.',
    days: [
      simpleDay(0, 'Teljes test A', [P(EX.legpress, 3, 12, 15, 60), P(EX.pushup, 3, 8, 12, null, { load: 'bodyweight' }), P(EX.pulldown, 3, 10, 12, 30)]),
      { index: 1, name: 'Pihenő', rest: true },
      simpleDay(2, 'Teljes test B', [P(EX.hipthrust, 3, 12, 15, 40), P(EX.ohp, 3, 10, 12, 20), P(EX.plank, 3, null, null, null, { metric: 'time', seconds: 30, load: 'bodyweight' })]),
      { index: 3, name: 'Pihenő', rest: true },
      { index: 4, name: 'Pihenő', rest: true },
      { index: 5, name: 'Pihenő', rest: true },
      { index: 6, name: 'Pihenő', rest: true },
    ],
  },
  {
    name: 'Nyári rekomp – 14 napos ciklus', status: 'paused', cycle: 14, goal: 'fat-loss', experience: 'intermediate',
    description: 'Kéthetes rotáció, szünetel amíg a nyári szabadságok tartanak.',
    days: [
      simpleDay(0, 'Erő nap', [P(EX.squat, 4, 6, 8, 90), P(EX.bench, 4, 6, 8, 72.5)]),
      simpleDay(3, 'Kondi nap', [P(EX.hipthrust, 3, 12, 15, 70), P(EX.crunch, 3, 20, 25, null, { load: 'bodyweight' })]),
      simpleDay(7, 'Erő nap 2', [P(EX.deadlift, 4, 4, 6, 120), P(EX.row, 4, 8, 10, 62.5)]),
      simpleDay(10, 'Kondi nap 2', [P(EX.legpress, 4, 15, 20, 100), P(EX.facepull, 3, 15, 20, 18)]),
    ],
  },
  {
    name: 'Téli tömegelő (archív)', status: 'ended', cycle: 7, goal: 'muscle', experience: 'advanced',
    description: 'Tavalyi téli blokk. Archiválva, referenciának megtartva.',
    archivedAt: NOW - 30 * 86400,
    days: [
      simpleDay(0, 'Nehéz alsó', [P(EX.squat, 5, 3, 5, 120, { rpe: 9 }), P(EX.rdl, 4, 6, 8, 100)]),
      simpleDay(2, 'Nehéz felső', [P(EX.bench, 5, 3, 5, 95, { rpe: 9 }), P(EX.row, 4, 6, 8, 80)]),
      { index: 4, name: 'Pihenő', rest: true },
    ],
  },
];

for (const t of TEMPLATES) {
  await writePlan({ scope: 'template', author: COACH, createdAt: NOW - ri(120, 400) * 86400, ...t });
}

/* ── three demo clients get their own live plan, so the client-detail plan tab is not empty ────── */

const clientPlans = new Map();
for (const p of PEOPLE.filter((x) => x.plan)) {
  const built = await writePlan({
    scope: 'client',
    author: COACH,
    link: p.link,
    client: p.id,
    name: `${p.name.split(' ')[0]} – személyre szabott terv`,
    description: 'Heti három edzés, a felmérés alapján összeállítva.',
    goal: 'muscle',
    experience: 'beginner',
    cycle: 7,
    startsOn: addDays(MONDAY, -56),
    status: 'active',
    createdAt: NOW - 60 * 86400,
    days: [
      simpleDay(0, 'Teljes test A', [P(EX.squat, 3, 8, 10, 60), P(EX.bench, 3, 8, 10, 40), P(EX.pulldown, 3, 10, 12, 35)]),
      { index: 1, name: 'Pihenő', rest: true },
      simpleDay(2, 'Teljes test B', [P(EX.rdl, 3, 8, 10, 50), P(EX.ohp, 3, 8, 10, 25), P(EX.row, 3, 10, 12, 35)]),
      { index: 3, name: 'Pihenő', rest: true },
      simpleDay(4, 'Teljes test C', [P(EX.legpress, 3, 12, 15, 80), P(EX.dips, 3, 6, 10, null, { load: 'bodyweight' }), P(EX.curl, 3, 12, 15, 10)]),
      { index: 5, name: 'Pihenő', rest: true },
      { index: 6, name: 'Pihenő', rest: true },
    ],
  });
  clientPlans.set(p.id, built);
}

// A pair of schedule exceptions on the member's plan: one skipped session and one moved one.
await db.run(
  `INSERT INTO workout_plan_day_exceptions (plan_id, day_id, occurrence_date, action, moved_to_date, reason, created_by, created_at)
   VALUES (?, ?, ?, 'skip', NULL, ?, ?, ?)`,
  [
    memberPlan.planId,
    memberPlan.days.find((d) => d.dayIndex === 2).id,
    addDays(MONDAY, -37),
    'Megfázás miatt kihagyva.',
    COACH,
    NOW - 38 * 86400,
  ],
);
await db.run(
  `INSERT INTO workout_plan_day_exceptions (plan_id, day_id, occurrence_date, action, moved_to_date, reason, created_by, created_at)
   VALUES (?, ?, ?, 'move', ?, ?, ?, ?)`,
  [
    memberPlan.planId,
    memberPlan.days.find((d) => d.dayIndex === 5).id,
    addDays(MONDAY, -16),
    addDays(MONDAY, -15),
    'Családi program, egy nappal később.',
    MEMBER,
    NOW - 17 * 86400,
  ],
);
bump('workout_plan_day_exceptions', 2);

const [{ revision: memberPlanRevision }] = await db.all('SELECT revision FROM workout_plans WHERE id = ?', [
  memberPlan.planId,
]);

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 6. TRAINING HISTORY
 *
 * A session is written as three pool calls — the log, then its exercises, then all of its sets in
 * ONE `writeTx`. The rollup triggers recompute `total_*` from the set rows themselves on every
 * insert, so nothing here writes an aggregate; `trg_log_rollup_truthful` would refuse it anyway.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding training history…');

/** Rounds to the nearest 2.5 kg, the way a real barbell forces you to. */
const plate = (kg) => Math.round(kg / 2.5) * 2.5;

/**
 * Materialises one session and returns { logId, setIds } where setIds is keyed by exercise key.
 */
async function writeSession({
  client, link, planId, planDayId, planRevision, planName, dayName, occurrence,
  localDate, startTime, exercises, bodyweight, effort, notes, source = 'plan', title = null,
  status = 'completed', durationMin,
}) {
  const startedAt = at(localDate, startTime);
  const duration = durationMin * 60;
  const logId = await insert(
    `INSERT INTO workout_logs
       (client_user_id, coach_client_id, plan_id, plan_day_id, plan_revision, plan_name_snapshot,
        day_name_snapshot, occurrence_date, title, source, status, started_at, completed_at,
        last_activity_at, local_date, tz_name, bodyweight_kg, duration_seconds, perceived_effort, notes,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client, link, planId, planDayId, planRevision, planName, dayName, occurrence, title, source, status,
      startedAt,
      status === 'completed' ? startedAt + duration : null,
      startedAt + duration,
      localDate, TZ, bodyweight, status === 'completed' ? duration : null,
      status === 'completed' ? effort : null,
      notes ?? null,
      startedAt, startedAt + duration,
    ],
  );
  bump('workout_logs');

  const exSteps = exercises.map((x, i) => ({
    sql: `INSERT INTO workout_log_exercises
            (log_id, client_user_id, exercise_id, exercise_name_snapshot, plan_exercise_id, origin,
             block_kind, block_ordinal, position, target_metric, load_mode, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      logId, client, x.spec.e.id, x.spec.e.name, x.spec.planExerciseId ?? null, x.origin ?? 'plan',
      x.spec.blockKind ?? 'single', x.spec.blockOrdinal ?? i, x.spec.position ?? i,
      x.spec.timed ? 'time' : 'reps', x.spec.load ?? 'external', x.notes ?? null, startedAt,
    ],
  }));
  const exResults = await db.writeTx(exSteps);
  bump('workout_log_exercises', exSteps.length);

  const setSteps = [];
  const setIndex = [];
  for (const [i, x] of exercises.entries()) {
    const logExerciseId = exResults[i].lastInsertRowid;
    for (const [si, s] of x.sets.entries()) {
      const bodyweightRelevant = x.spec.load && x.spec.load !== 'external';
      setSteps.push({
        sql: `INSERT INTO workout_log_sets
                (log_exercise_id, log_id, client_user_id, exercise_id, local_date, set_index, set_kind,
                 target_reps, target_seconds, target_weight_kg, target_rpe, target_rest_seconds,
                 weight_kg, entry_unit, entry_value, reps, seconds, rpe, rest_taken_seconds,
                 load_mode, bodyweight_kg, completed_at, write_uid, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          logExerciseId, logId, client, x.spec.e.id, localDate, si + 1, s.kind,
          s.targetReps ?? null, s.targetSeconds ?? null, s.targetWeight ?? null, s.targetRpe ?? null,
          x.spec.rest ?? 120,
          s.weight ?? null,
          s.weight == null ? null : 'kg',
          s.weight ?? null,
          s.reps ?? null, s.seconds ?? null, s.rpe ?? null, s.rest ?? null,
          x.spec.load ?? 'external',
          bodyweightRelevant ? bodyweight : null,
          s.done ? startedAt + 300 * (setSteps.length + 1) : null,
          s.done ? `demo-${logId}-${logExerciseId}-${si + 1}` : null,
          startedAt,
        ],
      });
      setIndex.push({ key: x.key, setIdx: si + 1, spec: s });
    }
  }
  const setResults = await db.writeTx(setSteps);
  bump('workout_log_sets', setSteps.length);

  const setIds = new Map();
  setResults.forEach((r, i) => {
    const meta = setIndex[i];
    setIds.set(`${meta.key}:${meta.setIdx}`, { id: r.lastInsertRowid, ...meta.spec });
  });
  return { logId, setIds };
}

/*
 * THE MEMBER'S TWELVE WEEKS.
 *
 * Progression is a straight ramp with a deload every fourth week and a deliberately missed week —
 * a real training block, not a monotone line, because a monotone line tells you nothing about
 * whether the chart renders a plateau correctly.
 */
const MISSED_WEEK = 6; // the flu week — no sessions at all
const memberSessionKeys = ['squat', 'bench', 'row', 'hipthrust'];
const prTracker = new Map(); // exercise key -> best canonical e1rm so far
const prRows = [];
let memberSessionCount = 0;

/** The most recent non-rest occurrence on or before today — reserved for the live session. */
const trainingDayIndexes = memberPlan.days.filter((d) => !d.isRest).map((d) => d.dayIndex);
const todayCycleIndex = ((daysBetween(PLAN_START, TODAY) % 7) + 7) % 7;
const todayPlanDay = memberPlan.days.find((d) => d.dayIndex === todayCycleIndex && !d.isRest) ?? null;

for (let week = 0; week < 13; week += 1) {
  if (week === MISSED_WEEK) continue;
  for (const dayIndex of trainingDayIndexes) {
    const localDate = addDays(PLAN_START, week * 7 + dayIndex);
    if (localDate > YESTERDAY) continue;
    // Two individual sessions skipped, so adherence is not a perfect 100%.
    if ((week === 2 && dayIndex === 5) || (week === 9 && dayIndex === 2)) continue;

    const day = memberPlan.days.find((d) => d.dayIndex === dayIndex);
    const bodyweight = Math.round((88.4 - week * 0.42 + (chance(0.5) ? 0.3 : -0.3)) * 10) / 10;
    // 4-week waves: weeks 3, 7, 11 are deloads.
    const deload = week % 4 === 3;
    const ramp = 1 + week * 0.011 - (deload ? 0.09 : 0);

    const exercises = day.exercises.map((spec, i) => {
      const key = `${spec.e.id}`;
      const sets = [];
      const nSets = spec.sets;
      for (let si = 0; si < nSets; si += 1) {
        const isWarmup = !!spec.ladder && si === 0;
        if (spec.timed) {
          sets.push({
            kind: 'straight',
            targetSeconds: spec.seconds,
            seconds: Math.round(spec.seconds * ramp) + ri(-3, 6),
            rest: spec.rest ?? 60,
            done: true,
          });
          continue;
        }
        const targetReps = spec.lo + (si >= nSets - 1 ? 0 : ri(0, Math.max(0, (spec.hi ?? spec.lo) - spec.lo)));
        const reps = Math.max(1, targetReps + (deload ? 1 : 0) - (si === nSets - 1 && chance(0.25) ? 1 : 0));
        let weight = null;
        if (spec.load === 'bodyweight') {
          weight = null;
        } else if (spec.w != null) {
          const base = isWarmup ? spec.w * 0.6 : spec.w;
          weight = plate(base * ramp);
        }
        sets.push({
          kind: isWarmup ? 'warmup' : 'straight',
          targetReps,
          targetWeight: spec.w ?? null,
          targetRpe: spec.rpe ?? null,
          weight,
          reps,
          rpe: isWarmup ? null : pick([7, 7.5, 8, 8.5, 9]),
          rest: (spec.rest ?? 120) + ri(-15, 45),
          done: true,
        });
      }
      return { key: `${key}`, spec: { ...spec, planExerciseId: spec.id }, sets, origin: 'plan' };
    });

    const session = await writeSession({
      client: MEMBER,
      link: memberLink,
      planId: memberPlan.planId,
      planDayId: day.id,
      planRevision: memberPlanRevision,
      planName: memberPlanSpec.name,
      dayName: day.name,
      occurrence: localDate,
      localDate,
      startTime: dayIndex === 5 ? '10:00' : '18:00',
      exercises,
      bodyweight,
      effort: deload ? ri(5, 6) : ri(7, 9),
      notes: chance(0.2)
        ? pick([
            'Jól ment, a fő gyakorlatnál még volt tartalék.',
            'Fáradt nap, a segédgyakorlatoknál levettem a súlyból.',
            'Térd rendben volt végig.',
            'Zsúfolt terem, hosszabb pihenők.',
          ])
        : null,
      durationMin: ri(52, 78),
    });
    memberSessionCount += 1;

    // PERSONAL RECORDS. Only the main lift of the day, only when the canonical Epley scale actually
    // beat the previous best — the same comparison the product uses, so the badge is earned.
    const main = day.exercises[0];
    if (!main.timed && main.w != null && main.load !== 'bodyweight') {
      const top = [...session.setIds.entries()]
        .filter(([k]) => k.startsWith(`${main.e.id}:`))
        .map(([, v]) => v)
        .filter((s) => s.kind !== 'warmup' && s.reps >= 1 && s.reps <= 12 && s.weight)
        .sort((a, b) => b.weight * (1 + b.reps / 30) - a.weight * (1 + a.reps / 30))[0];
      if (top) {
        const value = Math.round(top.weight * (top.reps === 1 ? 1 : 1 + top.reps / 30) * 100) / 100;
        const prev = prTracker.get(main.e.id) ?? null;
        if (prev == null || value > prev + 0.4) {
          prRows.push({
            client: MEMBER,
            exerciseId: main.e.id,
            name: main.e.name,
            sourceSetId: [...session.setIds.entries()].find(([, v]) => v === top)?.[1]
              ? [...session.setIds.entries()].find(([, v]) => v === top)[1].id
              : null,
            logId: session.logId,
            value,
            previous: prev,
            localDate,
          });
          prTracker.set(main.e.id, value);
        }
      }
    }
  }
}

for (const r of prRows) {
  if (!r.sourceSetId) continue;
  await db.run(
    `INSERT INTO workout_pr_events
       (client_user_id, exercise_id, exercise_name_snapshot, source_set_id, log_id, kind,
        higher_is_better, value_unit, rep_bucket, value, previous_value, local_date, achieved_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'e1rm', 1, 'kg', 0, ?, ?, ?, ?, ?)`,
    [
      MEMBER, r.exerciseId, r.name, r.sourceSetId, r.logId, r.value, r.previous, r.localDate,
      at(r.localDate, '19:30'), at(r.localDate, '19:30'),
    ],
  );
  bump('workout_pr_events');
}

/* ── the live session, so /workout always has something to play ────────────────────────────────
 *
 * `workout_logs_one_live_unique` allows exactly one open session per client, which is the whole
 * point — a human cannot be in two gyms. It is a plan session when today's cycle position is a
 * training day, and a freestyle one otherwise, because "off-plan is first-class" is the schema's
 * own rule and a player with nothing in it is not reviewable.
 */
{
  const bodyweight = 83.1;
  const liveDay = todayPlanDay ?? memberPlan.days.find((d) => d.dayIndex === 4);
  const exercises = liveDay.exercises.slice(0, 4).map((spec) => {
    const sets = [];
    for (let si = 0; si < spec.sets; si += 1) {
      const isWarmup = !!spec.ladder && si === 0;
      // The first two sets are done, the rest are still pending — a session mid-flight.
      const done = si < 2;
      if (spec.timed) {
        sets.push({ kind: 'straight', targetSeconds: spec.seconds, seconds: done ? spec.seconds + 5 : null, done, rest: 60 });
        continue;
      }
      sets.push({
        kind: isWarmup ? 'warmup' : 'straight',
        targetReps: spec.lo,
        targetWeight: spec.w ?? null,
        targetRpe: spec.rpe ?? null,
        weight: done && spec.w != null ? plate(spec.w * (isWarmup ? 0.6 : 1.13)) : null,
        reps: done ? spec.lo : null,
        rpe: done && !isWarmup ? 8 : null,
        rest: done ? (spec.rest ?? 120) : null,
        done,
      });
    }
    return { key: `${spec.e.id}`, spec: { ...spec, planExerciseId: spec.id }, sets, origin: 'plan' };
  });

  await writeSession({
    client: MEMBER,
    link: memberLink,
    planId: todayPlanDay ? memberPlan.planId : null,
    planDayId: todayPlanDay ? liveDay.id : null,
    planRevision: todayPlanDay ? memberPlanRevision : null,
    planName: todayPlanDay ? memberPlanSpec.name : null,
    dayName: todayPlanDay ? liveDay.name : null,
    occurrence: todayPlanDay ? TODAY : null,
    localDate: TODAY,
    startTime: '18:00',
    exercises,
    bodyweight,
    effort: null,
    notes: null,
    source: todayPlanDay ? 'plan' : 'freestyle',
    title: todayPlanDay ? null : 'Szabad edzés',
    status: 'in_progress',
    durationMin: 22,
  });
}

/* ── the demo clients' history ────────────────────────────────────────────────────────────────── */

const FREESTYLE_MENU = [
  [EX.squat, EX.legpress, EX.legcurl],
  [EX.bench, EX.ohp, EX.pushdown],
  [EX.row, EX.pulldown, EX.curl],
  [EX.deadlift, EX.rdl, EX.calf],
];

for (const p of PEOPLE) {
  if (!p.link || !p.sessions) continue;
  const built = clientPlans.get(p.id) ?? null;
  const lastOffset = p.lastTrained ?? 2;
  for (let s = 0; s < p.sessions; s += 1) {
    const localDate = addDays(TODAY, -(lastOffset + s * ri(2, 4)));
    if (localDate < addDays(TODAY, -220)) break;
    const bodyweight = Math.round((62 + ri(0, 30) + rng()) * 10) / 10;

    let planId = null, planDayId = null, planRevision = null, planName = null, dayName = null, occurrence = null;
    let menu;
    if (built) {
      const day = built.days.filter((d) => !d.isRest)[s % 3];
      const [{ revision }] = await db.all('SELECT revision FROM workout_plans WHERE id = ?', [built.planId]);
      planId = built.planId;
      planDayId = day.id;
      planRevision = revision;
      planName = `${p.name.split(' ')[0]} – személyre szabott terv`;
      dayName = day.name;
      occurrence = localDate;
      menu = day.exercises.map((spec) => ({ spec, planExerciseId: spec.id }));
    } else {
      menu = pick(FREESTYLE_MENU).map((e, i) => ({
        spec: { e, sets: 3, lo: 8, hi: 12, w: plate(20 + ri(0, 24) * 2.5), rest: 120, blockOrdinal: i, position: 0 },
      }));
    }

    const exercises = menu.map(({ spec, planExerciseId }) => {
      const sets = [];
      for (let si = 0; si < (spec.sets ?? 3); si += 1) {
        if (spec.timed) {
          sets.push({ kind: 'straight', targetSeconds: spec.seconds, seconds: spec.seconds + ri(-5, 10), rest: 60, done: true });
          continue;
        }
        const reps = (spec.lo ?? 8) + ri(0, Math.max(0, (spec.hi ?? spec.lo ?? 10) - (spec.lo ?? 8)));
        sets.push({
          kind: 'straight',
          targetReps: spec.lo ?? 8,
          targetWeight: spec.w ?? null,
          weight: spec.load === 'bodyweight' ? null : plate((spec.w ?? 30) * (1 + (p.sessions - s) * 0.006)),
          reps,
          rpe: pick([7, 7.5, 8, 8.5]),
          rest: 120,
          done: true,
        });
      }
      return { key: `${spec.e.id}`, spec: { ...spec, planExerciseId: planExerciseId ?? null }, sets, origin: 'plan' };
    });

    await writeSession({
      client: p.id,
      link: p.link,
      planId, planDayId, planRevision, planName, dayName, occurrence,
      localDate,
      startTime: pick(['07:00', '17:30', '18:30', '19:00']),
      exercises,
      bodyweight,
      effort: ri(6, 9),
      notes: null,
      source: built ? 'plan' : 'freestyle',
      title: built ? null : pick(['Láb nap', 'Nyomás nap', 'Húzás nap', 'Vegyes edzés']),
      durationMin: ri(40, 70),
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 7. NUTRITION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding nutrition…');

/*
 * A Hungarian personal food library. `foods_fts` indexes the canonical row, which is the arm of the
 * search query that finds a hand-typed food — so no translation rows are needed for these, exactly
 * as when a user types one in through the app.
 *
 * Macros are per 100 g, integers, in the schema's scaled units: kcal×10, grams×1000 (mg).
 */
const HU_FOODS = [
  ['Túró, félzsíros', null, 1010, 13000, 3400, 4000, 0, 250, '1 csomag (250 g)'],
  ['Görög joghurt, natúr', 'Milli', 1330, 5500, 4000, 10000, 0, 150, '1 pohár (150 g)'],
  ['Kefir, 1,5%', null, 500, 3300, 4000, 1500, 0, 250, '1 pohár (250 g)'],
  ['Trappista sajt', null, 3300, 25000, 1000, 26000, 0, 30, '1 szelet (30 g)'],
  ['Csirkemell filé, nyers', null, 1100, 23000, 0, 1500, 0, 150, '1 filé (150 g)'],
  ['Sertés karaj, nyers', null, 1430, 21000, 0, 6500, 0, 150, '1 szelet (150 g)'],
  ['Marha lábszár, nyers', null, 1600, 21000, 0, 8000, 0, 200, '1 adag (200 g)'],
  ['Pulykamell sonka', 'Pick', 1050, 18000, 1500, 3000, 0, 25, '1 szelet (25 g)'],
  ['Gyulai kolbász', 'Gyulai', 4100, 20000, 1000, 36000, 0, 40, '1 karika (40 g)'],
  ['Tojás, egész', null, 1430, 12500, 700, 10000, 0, 60, '1 db (60 g)'],
  ['Teljes kiőrlésű kenyér', null, 2470, 9000, 41000, 3500, 7000, 40, '1 szelet (40 g)'],
  ['Fehér kenyér', null, 2650, 8500, 49000, 3200, 2500, 50, '1 szelet (50 g)'],
  ['Basmati rizs, főtt', null, 1300, 2700, 28000, 300, 400, 180, '1 adag (180 g)'],
  ['Burgonya, főtt', null, 870, 2000, 20000, 100, 1800, 200, '1 adag (200 g)'],
  ['Édesburgonya, sült', null, 900, 2000, 20700, 100, 3300, 150, '1 adag (150 g)'],
  ['Tészta, durum, főtt', null, 1580, 5800, 30900, 900, 1800, 200, '1 adag (200 g)'],
  ['Zabpehely', null, 3700, 13500, 58000, 7000, 10000, 60, '1 adag (60 g)'],
  ['Bulgur, főtt', null, 830, 3100, 18600, 200, 4500, 180, '1 adag (180 g)'],
  ['Vörös lencse, főtt', null, 1160, 9000, 20000, 400, 8000, 150, '1 adag (150 g)'],
  ['Csicseriborsó, konzerv', null, 1200, 7000, 17000, 2600, 6000, 150, '1 adag (150 g)'],
  ['Alma, Jonatán', null, 520, 300, 13800, 200, 2400, 180, '1 db (180 g)'],
  ['Banán', null, 890, 1100, 22800, 300, 2600, 120, '1 db (120 g)'],
  ['Paradicsom', null, 180, 900, 3900, 200, 1200, 120, '1 db (120 g)'],
  ['Uborka, kígyó', null, 150, 700, 3600, 100, 500, 100, '1 adag (100 g)'],
  ['Paprika, tv', null, 260, 1000, 6000, 300, 2100, 100, '1 db (100 g)'],
  ['Brokkoli, párolt', null, 350, 2800, 7000, 400, 3300, 150, '1 adag (150 g)'],
  ['Olívaolaj', null, 8840, 0, 0, 100000, 0, 10, '1 evőkanál (10 g)'],
  ['Mogyoróvaj, cukormentes', 'Vitaking', 5880, 25000, 20000, 50000, 6000, 20, '1 evőkanál (20 g)'],
  ['Dió, bél', null, 6540, 15000, 14000, 65000, 7000, 25, '1 marék (25 g)'],
  ['Tejsavó fehérjepor, vanília', 'Scitec', 3800, 76000, 8000, 4000, 1000, 30, '1 adag (30 g)'],
  ['Rizstej, cukrozatlan', 'Alpro', 470, 300, 9500, 1000, 0, 200, '1 pohár (200 g)'],
  ['Méz, akác', null, 3040, 300, 82000, 0, 0, 20, '1 teáskanál (20 g)'],
];

const foodIds = [];
for (const [name, brand, kcal, prot, carb, fat, fiber, servG, servLabel] of HU_FOODS) {
  foodIds.push(
    await insert(
      `INSERT INTO foods
         (source, source_ref, owner_user_id, name, normalized_name, brand,
          kcal_per_100g_x10, protein_mg_per_100g, carb_mg_per_100g, fat_mg_per_100g, fiber_mg_per_100g,
          serving_g_x10, serving_label, verified, created_at, updated_at)
       VALUES ('manual', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [MEMBER, name, normalizeText(name), brand, kcal, prot, carb, fat, fiber, servG * 10, servLabel, NOW - 70 * 86400, NOW],
    ),
  );
  bump('foods');
}
const foodByName = new Map(HU_FOODS.map((f, i) => [f[0], { id: foodIds[i], macros: f }]));

/* ── the nutrition plan ───────────────────────────────────────────────────────────────────────── */

const nutritionPlanId = await insert(
  `INSERT INTO nutrition_plans
     (scope, author_user_id, coach_client_id, client_user_id, name, normalized_name, description,
      goal, cycle_days, starts_on, status, created_at, updated_at)
   VALUES ('client', ?, ?, ?, ?, ?, ?, 'fat-loss', 7, ?, 'active', ?, ?)`,
  [
    COACH, memberLink, MEMBER,
    'Rekomp étrend – 7 napos ciklus',
    normalizeText('Rekomp étrend – 7 napos ciklus'),
    'Edzésnapokon több szénhidrát, pihenőnapokon kevesebb. A fehérje minden nap ugyanannyi.',
    NUTRITION_START, NOW - 60 * 86400, NOW,
  ],
);
bump('nutrition_plans');

/** kcal×10, protein/carb/fat in mg. Training days (0, 2, 4, 5) get more carbohydrate. */
const NUTRITION_DAYS = [
  { index: 0, name: 'Edzésnap – hétfő', kcal: 26000, p: 180000, c: 290000, f: 70000 },
  { index: 1, name: 'Pihenőnap – kedd', kcal: 22000, p: 180000, c: 190000, f: 75000 },
  { index: 2, name: 'Edzésnap – szerda', kcal: 26000, p: 180000, c: 290000, f: 70000 },
  { index: 3, name: 'Pihenőnap – csütörtök', kcal: 22000, p: 180000, c: 190000, f: 75000 },
  { index: 4, name: 'Edzésnap – péntek', kcal: 26000, p: 180000, c: 290000, f: 70000 },
  { index: 5, name: 'Edzésnap – szombat', kcal: 25000, p: 175000, c: 275000, f: 70000 },
  { index: 6, name: 'Pihenőnap – vasárnap', kcal: 21000, p: 170000, c: 180000, f: 72000 },
];
const nutritionDayIds = [];
for (const d of NUTRITION_DAYS) {
  nutritionDayIds.push(
    await insert(
      `INSERT INTO nutrition_plan_days
         (plan_id, day_index, name, kcal_target_x10, protein_mg_target, carb_mg_target, fat_mg_target, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nutritionPlanId, d.index, d.name, d.kcal, d.p, d.c, d.f, null, NOW - 60 * 86400, NOW],
    ),
  );
  bump('nutrition_plan_days');
}

/** Prescribed meals, on the two days a coach would actually write out. */
const MEAL_PLAN = [
  {
    dayIdx: 0,
    meals: [
      { name: 'Reggeli', time: '07:00', items: [['Zabpehely', 60], ['Tejsavó fehérjepor, vanília', 30], ['Banán', 120]] },
      { name: 'Ebéd', time: '12:30', items: [['Csirkemell filé, nyers', 180], ['Basmati rizs, főtt', 220], ['Brokkoli, párolt', 150]] },
      { name: 'Edzés utáni', time: '19:30', items: [['Görög joghurt, natúr', 200], ['Méz, akác', 20]] },
      { name: 'Vacsora', time: '21:00', items: [['Túró, félzsíros', 250], ['Paradicsom', 120], ['Teljes kiőrlésű kenyér', 40]] },
    ],
  },
  {
    dayIdx: 1,
    meals: [
      { name: 'Reggeli', time: '07:30', items: [['Tojás, egész', 180], ['Teljes kiőrlésű kenyér', 80], ['Paprika, tv', 100]] },
      { name: 'Ebéd', time: '13:00', items: [['Sertés karaj, nyers', 160], ['Burgonya, főtt', 200], ['Uborka, kígyó', 150]] },
      { name: 'Vacsora', time: '20:00', items: [['Kefir, 1,5%', 250], ['Dió, bél', 25]] },
    ],
  },
];

for (const dayPlan of MEAL_PLAN) {
  for (const [mi, meal] of dayPlan.meals.entries()) {
    const mealId = await insert(
      'INSERT INTO meals (plan_id, day_id, position, name, time_hint, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nutritionPlanId, nutritionDayIds[dayPlan.dayIdx], mi, meal.name, meal.time, null, NOW - 60 * 86400, NOW],
    );
    bump('meals');
    const steps = meal.items.map(([name, grams], ii) => {
      const f = foodByName.get(name);
      const [fname, , kcal, prot, carb, fat, fiber] = f.macros;
      return {
        sql: `INSERT INTO meal_items
                (plan_id, meal_id, food_id, position, grams_x10, food_name_snapshot,
                 kcal_per_100g_x10_snapshot, protein_mg_per_100g_snapshot, carb_mg_per_100g_snapshot,
                 fat_mg_per_100g_snapshot, fiber_mg_per_100g_snapshot, note, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [nutritionPlanId, mealId, f.id, ii, grams * 10, fname, kcal, prot, carb, fat, fiber, null, NOW - 60 * 86400, NOW],
      };
    });
    await db.writeTx(steps);
    bump('meal_items', steps.length);
  }
}

/* ── eight weeks of daily logs ─────────────────────────────────────────────────────────────────
 *
 * Portions are jittered around the prescription, so most days land near the target and a handful
 * go over it — which is the state the amber ring exists to show and cannot be judged without.
 */
const LOG_MENU = {
  Reggeli: [['Zabpehely', 55, 75], ['Tejsavó fehérjepor, vanília', 25, 35], ['Banán', 100, 140], ['Görög joghurt, natúr', 120, 200]],
  Ebéd: [['Csirkemell filé, nyers', 140, 220], ['Basmati rizs, főtt', 150, 260], ['Brokkoli, párolt', 100, 200], ['Olívaolaj', 8, 15]],
  Uzsonna: [['Alma, Jonatán', 150, 220], ['Mogyoróvaj, cukormentes', 15, 35], ['Dió, bél', 20, 35], ['Kefir, 1,5%', 200, 300]],
  Vacsora: [['Túró, félzsíros', 200, 280], ['Tojás, egész', 110, 180], ['Teljes kiőrlésű kenyér', 40, 90], ['Paradicsom', 100, 200]],
  Nasi: [['Gyulai kolbász', 30, 60], ['Trappista sajt', 30, 60], ['Méz, akác', 15, 30], ['Fehér kenyér', 50, 100]],
};

let nutritionDays = 0;
for (let offset = 0; offset < 56; offset += 1) {
  const localDate = addDays(NUTRITION_START, offset);
  if (localDate > YESTERDAY) break;
  // Six days in seven get logged; a real person misses some.
  if (chance(0.12)) continue;

  const cycleIndex = ((daysBetween(NUTRITION_START, localDate) % 7) + 7) % 7;
  const overshoot = chance(0.22); // the amber days
  const meals = ['Reggeli', 'Ebéd', 'Uzsonna', 'Vacsora'];
  if (overshoot) meals.push('Nasi');

  const steps = [];
  for (const label of meals) {
    const options = LOG_MENU[label];
    const count = label === 'Nasi' ? 2 : ri(2, 3);
    for (let i = 0; i < count; i += 1) {
      const [name, lo, hi] = options[(i + offset) % options.length];
      const f = foodByName.get(name);
      const [fname, , kcal, prot, carb, fat, fiber] = f.macros;
      const grams = Math.round((lo + rng() * (hi - lo)) * (overshoot ? 1.18 : 1));
      steps.push({
        sql: `INSERT INTO nutrition_log_items
                (client_user_id, local_date, tz_name, meal_label, plan_day_id, food_id, grams_x10,
                 food_name_snapshot, kcal_per_100g_x10_snapshot, protein_mg_per_100g_snapshot,
                 carb_mg_per_100g_snapshot, fat_mg_per_100g_snapshot, fiber_mg_per_100g_snapshot,
                 created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          MEMBER, localDate, TZ, label, nutritionDayIds[cycleIndex], f.id, grams * 10,
          fname, kcal, prot, carb, fat, fiber, at(localDate, '20:00'), at(localDate, '20:00'),
        ],
      });
    }
  }
  await db.writeTx(steps);
  bump('nutrition_log_items', steps.length);
  nutritionDays += 1;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 8. BODY MEASUREMENTS
 *
 * Values are stored as value × 1000 in the metric's canonical unit and are bounded by
 * `trg_measurement_in_range_*`, which reads `measurement_metrics`. A THREE-WEEK GAP is deliberate:
 * `TrendChart` prints its "gap" caption at 14 days or more, and a caption with nothing to caption
 * cannot be reviewed.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding measurements…');

const GAP_FROM = 40; // days ago, inclusive — the stretch with no measurements at all
const GAP_TO = 63;
const measurementSteps = [];

for (let back = 84; back >= 1; back -= 1) {
  const localDate = addDays(TODAY, -back);
  if (back <= GAP_TO && back >= GAP_FROM) continue;
  const weekProgress = (84 - back) / 84;

  // Weight: every third or fourth morning, trending down with real noise.
  if (back % 3 === 0 || back % 7 === 1) {
    const kg = 88.4 - weekProgress * 5.3 + (rng() - 0.5) * 0.9;
    measurementSteps.push({ metric: 'weight', date: localDate, value: Math.round(kg * 1000) });
  }
  // Body fat: weekly.
  if (back % 7 === 0) {
    const pct = 22.4 - weekProgress * 4.1 + (rng() - 0.5) * 0.4;
    measurementSteps.push({ metric: 'body_fat', date: localDate, value: Math.round(pct * 1000) });
  }
  // Waist: fortnightly.
  if (back % 14 === 0) {
    const cm = 92.5 - weekProgress * 6.0 + (rng() - 0.5) * 0.6;
    measurementSteps.push({ metric: 'waist', date: localDate, value: Math.round(cm * 1000) });
  }
  // Chest and right arm: monthly, going the other way.
  if (back % 28 === 0) {
    measurementSteps.push({ metric: 'chest', date: localDate, value: Math.round((104.0 + weekProgress * 1.6) * 1000) });
    measurementSteps.push({ metric: 'arm_right', date: localDate, value: Math.round((37.2 + weekProgress * 1.1) * 1000) });
  }
}

for (let i = 0; i < measurementSteps.length; i += 40) {
  const chunk = measurementSteps.slice(i, i + 40).map((m) => ({
    sql: `INSERT INTO body_measurements (client_user_id, metric_key, measured_on, value_x1000, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [MEMBER, m.metric, m.date, m.value, null, at(m.date, '07:00'), at(m.date, '07:00')],
  }));
  await db.writeTx(chunk);
  bump('body_measurements', chunk.length);
}

// The client shares measurements with the coach, so the coach's progress tab is not an empty state.
await db.run(
  `INSERT INTO progress_shares (coach_client_id, client_user_id, share_measurements, share_photos, granted_at, updated_at)
   VALUES (?, ?, 1, 0, ?, ?)`,
  [memberLink, MEMBER, NOW - 70 * 86400, NOW],
);
bump('progress_shares');
for (let i = 0; i < 5; i += 1) {
  await db.run(
    `INSERT INTO progress_access_log (subject_user_id, viewer_user_id, viewer_email_snapshot, coach_client_id, kind, target_id, at)
     VALUES (?, ?, ?, ?, 'measurements', NULL, ?)`,
    [MEMBER, COACH, 'coach@tracker.local', memberLink, NOW - (i * 6 + 2) * 86400],
  );
  bump('progress_access_log');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 9. COINS
 *
 * Every movement goes through `coin_ledger`; `coin_wallets.balance_minor` is derived and refuses
 * any value that is not the ledger's own sum. The order below is forced by the guards, not chosen:
 * an unlock must exist before the reward that references it, and the balance must cover a purchase
 * before `trg_coin_ledger_never_negative` will let it through.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding coins…');

const ledger = async (user, amount, reason, refType, refId, note, actor, key, when) =>
  db.run(
    `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key,
                              actor_user_id, request_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user, amount, reason, refType, refId, key, actor, REQ, note, when],
  );

const UNLOCKS = [
  { key: 'workout_first', achievement: 'workout.first', daysAgo: 84 },
  { key: 'workout_sessions_10', achievement: 'workout.sessions.10', daysAgo: 62 },
  { key: 'pr_first', achievement: 'pr.first', daysAgo: 80 },
  { key: 'streak_workout_7', achievement: 'streak.workout.7', daysAgo: 55 },
];
for (const u of UNLOCKS) {
  const [row] = await db.all('SELECT key, reward_minor FROM achievements WHERE key = ? AND active = 1', [u.achievement]);
  if (!row) continue;
  const when = NOW - u.daysAgo * 86400;
  const uaId = await insert(
    `INSERT INTO user_achievements (user_id, achievement_key, source_type, source_id, reward_minor_snapshot, unlocked_at)
     VALUES (?, ?, NULL, NULL, ?, ?)`,
    [MEMBER, row.key, row.reward_minor, when],
  );
  bump('user_achievements');
  if (row.reward_minor > 0) {
    await ledger(MEMBER, row.reward_minor, 'achievement.reward', 'user_achievement', uaId, null, null, `demo:seed:ach:${u.key}`, when);
    bump('coin_ledger');
  }
}

// An administrative top-up, so the balance can actually afford something in the store.
await ledger(MEMBER, 30000, 'admin.credit', null, null, 'Demó feltöltés a bemutatóhoz.', ADMIN, 'demo:seed:credit:member', NOW - 40 * 86400);
bump('coin_ledger');

const [storeItem] = await db.all(
  "SELECT id, sku, title, price_minor, entitlement_key FROM coin_store_items WHERE active = 1 AND delisted_at IS NULL ORDER BY id LIMIT 1",
);
if (storeItem) {
  const purchasedAt = NOW - 35 * 86400;
  const purchaseId = await insert(
    `INSERT INTO coin_purchases (user_id, item_id, sku_snapshot, title_snapshot, entitlement_key,
                                 price_minor_snapshot, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [MEMBER, storeItem.id, storeItem.sku, storeItem.title, storeItem.entitlement_key, storeItem.price_minor, REQ, purchasedAt],
  );
  bump('coin_purchases');
  await db.run(
    `INSERT INTO coin_entitlements (user_id, item_id, purchase_id, entitlement_key, granted_at)
     VALUES (?, ?, ?, ?, ?)`,
    [MEMBER, storeItem.id, purchaseId, storeItem.entitlement_key, purchasedAt],
  );
  bump('coin_entitlements');
  await ledger(MEMBER, -storeItem.price_minor, 'store.purchase', 'coin_purchase', purchaseId, storeItem.title, MEMBER, 'demo:seed:buy:member', purchasedAt);
  bump('coin_ledger');

  // And the theme they paid for is the one they are wearing.
  const [pack] = await db.all('SELECT key FROM theme_packs WHERE entitlement_key = ? AND active = 1', [storeItem.entitlement_key]);
  if (pack) {
    await db.run(
      `INSERT INTO user_theme_prefs (user_id, pack, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET pack = excluded.pack, updated_at = unixepoch()`,
      [MEMBER, pack.key, NOW, NOW],
    );
  }
}

await ledger(MEMBER, -1000, 'admin.debit', null, null, 'Téves jóváírás korrekciója.', ADMIN, 'demo:seed:debit:member', NOW - 12 * 86400);
bump('coin_ledger');
await ledger(COACH, 12500, 'admin.credit', null, null, 'Edzői indulócsomag.', ADMIN, 'demo:seed:credit:coach', NOW - 30 * 86400);
bump('coin_ledger');

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 10. CHAT
 *
 * `trg_message_needs_live_link` refuses a message on anything but an ACTIVE link, and
 * `trg_message_sender_is_a_party` refuses a sender who is not one of the two people — so
 * conversations only exist for active links and every message names a real party.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding chat…');

const THREADS = [
  {
    who: 'member',
    messages: [
      [1, 'Szia Bence! Feltöltöttem a heti edzésnaplót, a guggolás jól ment.', 12, true],
      [0, 'Szia! Láttam, szép munka. A harmadik szettnél viszont picit előrébb dőlsz, figyelj a törzsfeszítésre.', 12, true],
      [1, 'Rendben, jövő héten videót is küldök róla.', 11, true],
      [0, 'Tökéletes. A pénteki napon nyugodtan emelj 2,5 kg-ot a húzáson.', 3, true],
      [0, 'Ja és a hétvégi edzést tedd át szombat délelőttre, ha tudod.', 1, false],
    ],
  },
  { who: 'kovacs.eszter', messages: [
    [1, 'Szia! A térdem ma kicsit fájt a lábtolásnál.', 5, true],
    [0, 'Vedd le a súlyból 20%-ot és szűkítsd a lábállást. Ha nem múlik, hagyd ki a hét végét.', 5, true],
    [1, 'Köszi, kipróbálom!', 4, false],
  ] },
  { who: 'toth.reka', messages: [
    [0, 'Szia Réka, feltöltöttem az új tervet a jövő hétre.', 8, true],
    [1, 'Szuper, köszönöm! A szerdai nap belefér 45 percbe?', 7, true],
    [0, 'Igen, hagyd ki az utolsó két segédgyakorlatot, ha szorít az idő.', 7, true],
  ] },
  { who: 'horvath.anna', messages: [
    [1, 'Elértem a 10 húzódzkodást! 🎉', 2, false],
    [0, 'Ez nagyon jó hír, gratulálok! Jövő héten súlyt teszünk rá.', 2, false],
  ] },
  { who: 'kiss.dora', messages: [
    [1, 'Szia! Tudnál küldeni egy alternatívát a felhúzásra? Nincs rúd a teremben.', 1, false],
  ] },
];

for (const thread of THREADS) {
  const person = thread.who === 'member'
    ? { id: MEMBER, link: memberLink }
    : PEOPLE.find((p) => p.slug === thread.who);
  if (!person?.link) continue;

  const convId = await insert(
    `INSERT INTO conversations (coach_client_id, client_id, coach_id, coach_name_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [person.link, person.id, COACH, 'Kovács Péter (edző)', NOW - 100 * 86400],
  );
  bump('conversations');

  for (const [isClient, body, daysAgo, read] of thread.messages) {
    const created = NOW - daysAgo * 86400 - ri(0, 20000);
    await db.run(
      `INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [convId, isClient ? person.id : COACH, isClient ? 0 : 1, body, read ? created + 3600 : null, created],
    );
    bump('messages');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 11. NOTIFICATIONS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const NOTIFS = [
  [MEMBER, memberLink, 'coach.message', 'Új üzenet az edződtől', 'Kovács Péter: „Ja és a hétvégi edzést tedd át…”', '/notifications', 1, false],
  [MEMBER, memberLink, 'plan.updated', 'Frissült az edzéstervedet', 'A pénteki nap két gyakorlata változott.', '/coach/plans', 3, true],
  [MEMBER, null, 'pr.new', 'Új személyes csúcs!', 'Guggolás – becsült 1RM rekord.', '/progress', 5, true],
  [MEMBER, null, 'achievement.unlocked', 'Teljesítmény feloldva', 'Hét napos edzéssorozat – 5 000 érmét kaptál.', '/coins', 9, true],
  [MEMBER, null, 'nutrition.reminder', 'Ma még nem naplóztál', 'Két órája nem került étel a naplóba.', '/nutrition', 1, false],
  [MEMBER, memberLink, 'coach.plan.assigned', 'Új terv érkezett', 'Felső/alsó szplit – 12 hetes blokk.', '/', 84, true],
  [MEMBER, null, 'coins.spent', 'Téma feloldva', 'Aurora témát vásároltál 25 000 érméért.', '/settings', 35, true],
  [MEMBER, null, 'streak.risk', 'A sorozatod veszélyben', 'Két napja nem edzettél.', '/', 20, true],

  [COACH, null, 'client.joined', 'Új kliens csatlakozott', 'Kiss Dóra elfogadta a meghívót.', '/coach', 6, false],
  [COACH, null, 'client.inactive', 'Inaktív kliens', 'Molnár Zsolt 31 napja nem edzett.', '/coach', 2, false],
  [COACH, null, 'client.logged', 'Kliens edzést zárt', 'Tóth Réka befejezte a szerdai edzést.', '/coach', 1, true],
  [COACH, null, 'marketplace.post.published', 'Bejegyzés közzétéve', 'Az „Őszi erőblokk” bejegyzésed elérhető.', '/compose', 14, true],
  [COACH, null, 'invite.exhausted', 'Elfogyott egy meghívókód', 'Az ONLINE24 kód elérte a maximumot.', '/coach', 25, true],

  [ADMIN, null, 'moderation.pending', 'Új elem a moderációs sorban', '3 gyakorlat vár jóváhagyásra.', '/admin', 1, false],
  [ADMIN, null, 'moderation.report', 'Új bejelentés', 'Egy piactéri bejegyzést bejelentettek.', '/admin', 2, false],
  [ADMIN, null, 'system.backup', 'Mentés elkészült', 'A napi titkosított mentés lefutott.', '/admin', 1, true],
];
for (const [user, link, type, title, body, linkPath, daysAgo, read] of NOTIFS) {
  const created = NOW - daysAgo * 86400 - ri(0, 30000);
  await db.run(
    `INSERT INTO notifications (user_id, coach_client_id, type, title, body, link_path, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user, link, type, title, body, linkPath, read ? created + 7200 : null, created],
  );
  bump('notifications');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 12. THE PUBLIC MARKETPLACE
 *
 * A profile must be published before any of its posts can be, because `trg_post_publish_standing_*`
 * requires a live profile — so the order here is forced. `published_at` is backdated so
 * `trg_post_publish_quota_*` (10 per rolling day) never sees more than a couple of today's posts.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding the marketplace…');

/** A 320×180 WebP, so a card shows a picture rather than a broken-image icon. */
const TINY_WEBP = Buffer.from(
  'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAPwAAswAAQUxQSAsAAAABBxAREYiI6P8DAABWUDggGAAAADABAJ0BKkAAtAA+bTaZSaQjIqEoCACADAWJaQAA/vuUAAA=',
  'base64',
);
fs.mkdirSync(PUBLIC_MEDIA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

async function writeProfile({ userId, handle, displayName, headline, bio, city, specialties, verified, listedDaysAgo }) {
  const built = buildBio(bio);
  const listedAt = NOW - listedDaysAgo * 86400;
  await db.run(
    `INSERT INTO coach_profiles
       (user_id, handle, display_name, headline, bio_src, bio_doc, doc_version, city_key,
        verified_at, verified_by, published_at, listed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, handle, displayName, headline, built.src, built.doc, built.version, city,
      verified ? listedAt : null, verified ? ADMIN : null, listedAt, listedAt, listedAt, NOW,
    ],
  );
  bump('coach_profiles');
  for (const s of specialties) {
    await db.run('INSERT OR IGNORE INTO coach_profile_specialties (user_id, specialty_key) VALUES (?, ?)', [userId, s]);
    bump('coach_profile_specialties');
  }
}

await writeProfile({
  userId: COACH,
  handle: 'kovacs-peter',
  displayName: 'Kovács Péter',
  headline: 'Erőnléti edző · 12 év tapasztalat · Budapest és online',
  bio:
    '## Kinek szól\n\n' +
    'Olyan felnőtteknek, akik **komolyan** akarnak erősödni, de a hetük nem edzőterem köré épül.\n\n' +
    '- heti 3-4 edzés, 60-75 perc\n' +
    '- minden hétre írásos terv és videós visszajelzés\n' +
    '- táplálkozási keret, nem diéta\n\n' +
    '## Hogyan dolgozom\n\n' +
    'Az első hónap felmérés és technika. Utána négyhetes blokkokban haladunk, a negyedik hét mindig könnyebb.\n\n' +
    '> Aki minden héten rekordot akar dönteni, három hónap múlva sérült lesz.\n\n' +
    'Írj bátran, ha kérdésed van.',
  city: 'budapest',
  specialties: ['strength', 'hypertrophy', 'nutrition', 'rehabilitation'],
  verified: true,
  listedDaysAgo: 240,
});

const otherCoaches = PEOPLE.filter((p) => p.kind === 'coach');
await writeProfile({
  userId: otherCoaches[0].id,
  handle: otherCoaches[0].handle,
  displayName: 'Szilágyi Réka',
  headline: 'Futóedző és mobilitás · Szeged',
  bio:
    'Félmaratonra és maratonra készítek fel kezdőket és haladókat.\n\n' +
    '- heti terv, tempóedzésekkel\n' +
    '- futóelemzés videó alapján\n' +
    '- mobilitás minden edzés után',
  city: 'szeged',
  specialties: ['running', 'endurance', 'mobility'],
  verified: false,
  listedDaysAgo: 120,
});
await writeProfile({
  userId: otherCoaches[1].id,
  handle: otherCoaches[1].handle,
  displayName: 'Fehér Tamás',
  headline: 'Kalisztenika és saját testsúly · Online',
  bio:
    'Saját testsúlyos programok, felszerelés nélkül vagy egy rúddal.\n\n' +
    '1. alapok: húzódzkodás, tolódzkodás, guggolás\n' +
    '2. statikus elemek: planche, front lever\n' +
    '3. kombinációk',
  city: 'online',
  specialties: ['calisthenics', 'mobility'],
  verified: false,
  listedDaysAgo: 60,
});

const POSTS = [
  {
    author: COACH, kind: 'program', title: 'Őszi erőblokk – 8 hetes csoportos program',
    body:
      'Nyolc hét, heti három edzés, kis csoportban.\n\n' +
      '## Mit tartalmaz\n\n' +
      '- heti három vezetett edzés\n' +
      '- egyéni terhelés a felmérés alapján\n' +
      '- havi mérés és fotó\n\n' +
      'A létszám tizenkét fő, hogy mindenkire jusson idő.',
    city: 'budapest', price: 6900000, currency: 'HUF', published: 21,
  },
  {
    author: COACH, kind: 'event', title: 'Guggolás-technika műhely – szeptember 14.',
    body:
      'Háromórás gyakorlati műhely a guggolás technikájáról.\n\n' +
      '- állásszélesség és lábfejállás\n' +
      '- törzsfeszítés és légzés\n' +
      '- gyakori hibák videóelemzéssel\n\n' +
      'Hozz magaddal edzőcipőt és kényelmes ruhát.',
    city: 'budapest', eventDaysAhead: 21, capacity: 16, price: 1200000, currency: 'HUF', published: 10,
  },
  {
    author: COACH, kind: 'announcement', title: 'Szeptembertől két új időpont',
    body:
      'Szeptembertől kedden és csütörtökön 6:30-kor is indul csoport.\n\n' +
      'A jelentkezés a szokásos módon, üzenetben megy. Az online kliensek időpontja nem változik.',
    city: 'budapest', published: 4,
  },
  {
    author: COACH, kind: 'program', title: 'Online edzésterv – 12 hét, heti visszajelzéssel',
    body:
      'Táv-edzésterv azoknak, akik saját termükben edzenek.\n\n' +
      '## Így működik\n\n' +
      '1. felmérő beszélgetés és mozgásvizsgálat videón\n' +
      '2. tizenkét hetes terv, négyhetes blokkokban\n' +
      '3. heti videós visszajelzés a fő gyakorlatokra\n\n' +
      '> A terv annyit ér, amennyit végre is hajtasz belőle.',
    city: 'online', price: 4500000, currency: 'HUF', published: 1,
  },
  {
    author: COACH, kind: 'program', title: 'Téli tömegelő – piszkozat', draft: true,
    body:
      'Ide jön a téli blokk leírása. Még nincs kész: hiányzik az ár és a létszám.\n\n' +
      '- hat hét\n' +
      '- heti négy edzés',
    city: 'budapest',
  },
  {
    author: otherCoaches[0].id, kind: 'program', title: 'Félmaraton 12 hét alatt – kezdőknek',
    body:
      'Tizenkét hetes futóterv, heti négy futással.\n\n' +
      '- alapozó hetek séta-futás váltással\n' +
      '- heti egy tempóedzés\n' +
      '- vasárnapi hosszú futás',
    city: 'szeged', price: 3200000, currency: 'HUF', published: 30,
  },
  {
    author: otherCoaches[1].id, kind: 'announcement', title: 'Ingyenes kalisztenika bemelegítő sorozat',
    body: 'Öt rövid videó a csuklóról, a vállról és a törzsről. Kezdés előtt mindegyiket érdemes végigcsinálni.',
    city: 'online', published: 45,
  },
];

const postIds = [];
for (const [i, p] of POSTS.entries()) {
  const built = buildBody(p.body, POST_BODY);
  const createdAt = NOW - (p.published ?? 2) * 86400 - 3600;
  const eventAt = p.eventDaysAhead ? NOW + p.eventDaysAhead * 86400 : null;
  const id = await insert(
    `INSERT INTO coach_posts
       (public_id, author_user_id, kind_key, title, body_src, body_doc, body_excerpt, doc_version,
        city_key, event_at, event_tz, capacity, price_minor, price_currency, published_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      publicId(`post-${i}-${p.title}`),
      p.author, p.kind, p.title, built.src, built.doc, built.excerpt, built.version,
      p.city ?? null,
      eventAt, eventAt ? TZ : null,
      p.capacity ?? null,
      p.price ?? null, p.price ? p.currency : null,
      p.draft ? null : NOW - p.published * 86400,
      createdAt, NOW,
    ],
  );
  postIds.push({ id, ...p });
  bump('coach_posts');

  // A cover image on the published posts, with a real file behind the key.
  if (!p.draft) {
    const storageKey = `pub_${hex32(`cover-${i}`)}.webp`;
    const thumbKey = `pub_${hex32(`thumb-${i}`)}.webp`;
    fs.writeFileSync(path.join(PUBLIC_MEDIA_DIR, storageKey), TINY_WEBP);
    fs.writeFileSync(path.join(PUBLIC_MEDIA_DIR, thumbKey), TINY_WEBP);
    await db.run(
      `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime, width, height, bytes, alt, sort_order, created_at)
       VALUES (?, 'cover', ?, ?, 'image/webp', 320, 180, ?, ?, 0, ?)`,
      [id, storageKey, thumbKey, TINY_WEBP.length, `${p.title} – borítókép`, createdAt],
    );
    bump('post_media');
  }
}

// Follows, so a profile has a number under it.
for (const p of PEOPLE.filter((x) => x.link).slice(0, 7)) {
  await db.run('INSERT OR IGNORE INTO coach_follows (follower_user_id, coach_user_id, created_at) VALUES (?, ?, ?)', [
    p.id, COACH, NOW - ri(10, 200) * 86400,
  ]);
  bump('coach_follows');
}
await db.run('INSERT OR IGNORE INTO coach_follows (follower_user_id, coach_user_id, created_at) VALUES (?, ?, ?)', [
  MEMBER, otherCoaches[0].id, NOW - 20 * 86400,
]);
bump('coach_follows');

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 13. MODERATION — the admin's queue
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('seeding the moderation queue…');

const SUBMISSIONS = [
  {
    name: 'Demó – Bolgár kitörés',
    owner: COACH,
    description: 'Egylábas guggolás, a hátsó láb padra emelve.',
    steps: [
      'Állj a paddal háttal, egy lépés távolságra, és tedd a hátsó lábfejed a padra.',
      'Ereszkedj le, amíg az első comb nagyjából párhuzamos a talajjal, a törzs maradjon egyenes.',
      'Nyomd magad vissza az első sarkadon keresztül. A térd a lábfej vonalában maradjon.',
    ],
    difficulty: 'intermediate', type: 'strength', muscles: ['quads', 'glutes'], equipment: ['bench', 'dumbbell'],
    daysAgo: 3,
  },
  {
    name: 'Demó – Kötélhúzás ülve, széles fogás',
    owner: COACH,
    description: 'Hátközépre célzó evezés kábelen, széles fogással.',
    steps: [
      'Ülj le, támaszd meg a lábad, és fogd meg a széles rudat.',
      'Húzd a rudat a hasad felé, a lapockákat hátra és le.',
      'Engedd vissza kontrolláltan, ne hagyd, hogy a súly előre rántson.',
    ],
    difficulty: 'beginner', type: 'strength', muscles: ['lats', 'rear-delts'], equipment: ['cable'],
    daysAgo: 8,
  },
  {
    name: 'Demó – Csípőemelés egy lábon',
    owner: otherCoaches[1].id,
    description: 'Saját testsúlyos farizom-gyakorlat, egy lábon.',
    steps: [
      'Feküdj hanyatt, egyik talpad a földön, a másik lábad nyújtva a levegőben.',
      'Told a csípőd a plafon felé, a farizmot szorítsd össze a tetején.',
      'Ereszkedj vissza lassan, a csípő maradjon vízszintes.',
    ],
    difficulty: 'beginner', type: 'strength', muscles: ['glutes', 'hamstrings'], equipment: ['bodyweight'],
    daysAgo: 1,
  },
];

for (const [i, s] of SUBMISSIONS.entries()) {
  const exId = await insert(
    `INSERT INTO exercises
       (name, normalized_name, description, instructions, status, owner_id, submitted_at,
        source, difficulty, exercise_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending_review', ?, ?, 'custom', ?, ?, ?, ?)`,
    [
      s.name, normalizeText(s.name), s.description, JSON.stringify(s.steps), s.owner,
      NOW - s.daysAgo * 86400, s.difficulty, s.type, NOW - (s.daysAgo + 1) * 86400, NOW,
    ],
  );
  bump('exercises (pending)');
  for (const [mi, slug] of s.muscles.entries()) {
    await db.run(
      `INSERT OR IGNORE INTO exercise_muscle_map (exercise_id, muscle_group_id, role)
       SELECT ?, id, ? FROM muscle_groups WHERE slug = ?`,
      [exId, mi === 0 ? 'primary' : 'secondary', slug],
    );
  }
  for (const slug of s.equipment) {
    await db.run(
      'INSERT OR IGNORE INTO exercise_equipment_map (exercise_id, equipment_id) SELECT ?, id FROM equipment WHERE slug = ?',
      [exId, slug],
    );
  }
  const key = `${uuidKey(`submission-${i}`)}.webp`;
  fs.writeFileSync(path.join(MEDIA_DIR, key), TINY_WEBP);
  await db.run(
    `INSERT INTO exercise_media (exercise_id, kind, storage_key, mime, width, height, bytes, position, created_at)
     VALUES (?, 'image', ?, 'image/webp', 320, 180, ?, 0, ?)`,
    [exId, key, TINY_WEBP.length, NOW - s.daysAgo * 86400],
  );
  bump('exercise_media');
}

// One already-rejected submission, so the queue is not the only state visible.
await db.run(
  `INSERT INTO exercises (name, normalized_name, description, instructions, status, owner_id,
                          rejection_reason, submitted_at, source, difficulty, exercise_type, created_at, updated_at)
   VALUES (?, ?, ?, ?, 'rejected', ?, ?, ?, 'custom', 'beginner', 'strength', ?, ?)`,
  [
    'Demó – Névtelen gépes gyakorlat',
    normalizeText('Demó – Névtelen gépes gyakorlat'),
    'Hiányos leírás, a gép típusa nem derül ki.',
    JSON.stringify(['Ülj a gépbe.', 'Told el.']),
    COACH,
    'A leírás nem elég részletes, és nincs kép a kiindulási helyzetről.',
    NOW - 20 * 86400, NOW - 21 * 86400, NOW,
  ],
);
bump('exercises (pending)');

/* ── content reports ──────────────────────────────────────────────────────────────────────────── */

const reporters = PEOPLE.filter((p) => p.link).slice(0, 6);
const REPORTS = [
  { subjectPost: 0, reason: 'spam', note: 'Szerintem ez csak reklám, nincs benne konkrétum.', status: 'open', daysAgo: 2 },
  { subjectPost: 5, reason: 'scam', note: 'Az ár nem szerepel sehol, de fizetést kér üzenetben.', status: 'open', daysAgo: 4 },
  { subjectPost: 1, reason: 'other', note: 'A helyszín nem stimmel a leírásban.', status: 'open', daysAgo: 1 },
  { subjectProfile: otherCoaches[1].id, reason: 'impersonation', note: 'Szerintem más edző fotóit használja.', status: 'open', daysAgo: 6 },
  { subjectPost: 6, reason: 'dangerous_advice', note: 'Sérülés utáni tanácsot ad orvosi háttér nélkül.', status: 'upheld', daysAgo: 30 },
  { subjectPost: 3, reason: 'spam', note: 'Duplikált bejegyzés.', status: 'rejected', daysAgo: 25 },
];

for (const [i, r] of REPORTS.entries()) {
  const reporter = reporters[i % reporters.length];
  const subjectPost = r.subjectPost != null ? postIds[r.subjectPost] : null;
  const subjectAuthor = subjectPost ? subjectPost.author : r.subjectProfile;
  if (reporter.id === subjectAuthor) continue; // trg_report_not_self_ins
  const created = NOW - r.daysAgo * 86400;
  const terminal = r.status !== 'open';
  await db.run(
    `INSERT INTO content_reports
       (subject_post_id, subject_profile_id, subject_author_user_id, reporter_user_id, reason_key, note,
        body_snapshot, snapshot_truncated, status_key, resolved_at, resolved_by, resolution_note, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      subjectPost ? subjectPost.id : null,
      r.subjectProfile ?? null,
      subjectAuthor,
      reporter.id,
      r.reason,
      r.note,
      // Terminal rows carry no snapshot: the report survives as the fact that it happened, the
      // copy of someone else's text does not.
      terminal ? null : (subjectPost ? subjectPost.body.slice(0, 4000) : null),
      r.status,
      terminal ? created + 86400 : null,
      terminal ? ADMIN : null,
      terminal ? (r.status === 'upheld' ? 'Eltávolítva, a szerző értesítve.' : 'Nem sérti a szabályzatot.') : null,
      REQ,
      created,
    ],
  );
  bump('content_reports');
}

// A reported chat message, for the other half of the moderation surface.
const [reportableMessage] = await db.all(
  `SELECT m.id, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.sender_is_coach = 0 ORDER BY m.id DESC LIMIT 1`,
);
if (reportableMessage) {
  await db.run(
    `INSERT INTO message_reports (message_id, reporter_id, reason, note, body_snapshot, status, created_at)
     VALUES (?, ?, 'other', ?, ?, 'open', ?)`,
    [reportableMessage.id, COACH, 'Ellenőrzésre jelölve a demóhoz.', reportableMessage.body, NOW - 3 * 86400],
  );
  bump('message_reports');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 14. AUDIT LOG
 *
 * The one table that cannot be cleared: `audit_log_no_delete` refuses DELETE, deliberately. So
 * these are GUARDED inserts keyed on a deterministic `request_id` — re-running adds nothing.
 *
 * `trg_audit_log_coin_complete` and `trg_audit_log_marketplace_complete` demand a request id, a
 * target type (and for marketplace, a target id), plus an actor for the admin-facing actions, so
 * the rows below are shaped to satisfy them rather than to look pretty.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const AUDIT = [
  [ADMIN, 'admin.user.role_changed', 'user', COACH, { from: 'user', to: 'coach' }, 40],
  [ADMIN, 'admin.exercise.approved', 'exercise', EX.squat.id, { status: 'global' }, 30],
  [ADMIN, 'admin.exercise.rejected', 'exercise', EX.bench.id, { reason: 'incomplete' }, 22],
  [COACH, 'coach.client.invited', 'coach_client', memberLink, { origin: 'invite' }, 90],
  [COACH, 'coach.client.archived', 'coach_client', memberLink, { reason: 'ended' }, 60],
  [COACH, 'coach.plan.assigned', 'workout_plan', memberPlan.planId, { client: MEMBER }, 84],
  [MEMBER, 'auth.login', 'user', MEMBER, { method: 'password' }, 1],
  [COACH, 'auth.login', 'user', COACH, { method: 'password' }, 1],
  [ADMIN, 'auth.login', 'user', ADMIN, { method: 'password' }, 0],
  [MEMBER, 'auth.password_changed', 'user', MEMBER, {}, 45],
  [ADMIN, 'coin.admin.credit', 'coin_ledger', MEMBER, { amount_minor: 30000 }, 40],
  [ADMIN, 'coin.admin.debit', 'coin_ledger', MEMBER, { amount_minor: -1000 }, 12],
  [MEMBER, 'coin.store.purchase', 'coin_purchase', MEMBER, { sku: 'theme.aurora' }, 35],
  [COACH, 'marketplace.profile.published', 'coach_profile', COACH, { handle: 'kovacs-peter' }, 240],
  [COACH, 'marketplace.post.published', 'coach_post', postIds[0].id, { kind: 'program' }, 21],
  [COACH, 'marketplace.post.published', 'coach_post', postIds[3].id, { kind: 'program' }, 1],
  [ADMIN, 'marketplace.moderation.report_resolved', 'content_report', 1, { outcome: 'upheld' }, 30],
  [ADMIN, 'admin.backup.completed', 'system', null, { bytes: 4194304 }, 0],
  [ADMIN, 'admin.metrics.viewed', 'system', null, { window: 30 }, 0],
  [COACH, 'coach.invite.created', 'invite_code', codeIds[0].id, { max_uses: 10 }, 210],
  [COACH, 'coach.invite.revoked', 'invite_code', codeIds[4].id, {}, 30],
  [MEMBER, 'workout.completed', 'workout_log', memberPlan.planId, { sets: 16 }, 2],
];

for (const [i, [actor, action, targetType, targetId, detail, daysAgo]] of AUDIT.entries()) {
  const requestId = `seed-demo-audit-${i}`;
  await db.run(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE request_id = ?)`,
    [
      actor, action, targetType, targetId, JSON.stringify(detail), requestId, '192.0.2.1',
      NOW - daysAgo * 86400 - ri(0, 40000), requestId,
    ],
  );
  bump('audit_log');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 15. VERIFY — read back what landed
 *
 * Counts are QUERIED, not taken from the insert counters, so the summary reports what the database
 * actually holds rather than what this script believes it wrote.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

console.log('\nverifying…\n');

const O2 = marks(owners.length + 1);
const scope = [...owners, archivedUser];

const CHECKS = [
  ['Member', 'workout plans (active/all)',
    `SELECT (SELECT COUNT(*) FROM workout_plans WHERE client_user_id = ? AND status = 'active') || ' / ' ||
            (SELECT COUNT(*) FROM workout_plans WHERE client_user_id = ?) AS v`, [MEMBER, MEMBER]],
  ['Member', 'plan days / exercises / set targets',
    `SELECT (SELECT COUNT(*) FROM workout_plan_days WHERE plan_id = ?) || ' / ' ||
            (SELECT COUNT(*) FROM workout_plan_exercises WHERE plan_id = ?) || ' / ' ||
            (SELECT COUNT(*) FROM workout_plan_set_targets WHERE plan_id = ?) AS v`,
    [memberPlan.planId, memberPlan.planId, memberPlan.planId]],
  ['Member', 'completed sessions', "SELECT COUNT(*) AS v FROM workout_logs WHERE client_user_id = ? AND status = 'completed'", [MEMBER]],
  ['Member', 'live session', "SELECT COUNT(*) AS v FROM workout_logs WHERE client_user_id = ? AND status = 'in_progress'", [MEMBER]],
  ['Member', 'logged sets', 'SELECT COUNT(*) AS v FROM workout_log_sets WHERE client_user_id = ?', [MEMBER]],
  ['Member', 'first / last training day',
    "SELECT MIN(local_date) || ' … ' || MAX(local_date) AS v FROM workout_logs WHERE client_user_id = ? AND status = 'completed'", [MEMBER]],
  ['Member', 'personal records', 'SELECT COUNT(*) AS v FROM workout_pr_events WHERE client_user_id = ?', [MEMBER]],
  ['Member', 'nutrition days logged', 'SELECT COUNT(DISTINCT local_date) AS v FROM nutrition_log_items WHERE client_user_id = ?', [MEMBER]],
  ['Member', 'nutrition log items', 'SELECT COUNT(*) AS v FROM nutrition_log_items WHERE client_user_id = ?', [MEMBER]],
  ['Member', 'days over the kcal target',
    `SELECT COUNT(*) AS v FROM (
       SELECT i.local_date, SUM(i.grams_x10 * i.kcal_per_100g_x10_snapshot) / 10000.0 AS kcal,
              (SELECT d.kcal_target_x10 / 10.0 FROM nutrition_plans p JOIN nutrition_plan_days d
                 ON d.plan_id = p.id AND d.day_index = CAST((julianday(i.local_date) - julianday(p.starts_on)) AS INTEGER) % p.cycle_days
                WHERE p.client_user_id = ? AND p.status = 'active' LIMIT 1) AS target
         FROM nutrition_log_items i WHERE i.client_user_id = ?
        GROUP BY i.local_date)
      WHERE target IS NOT NULL AND kcal > target`, [MEMBER, MEMBER]],
  ['Member', 'personal foods', 'SELECT COUNT(*) AS v FROM foods WHERE owner_user_id = ?', [MEMBER]],
  ['Member', 'body measurements / metrics',
    `SELECT COUNT(*) || ' / ' || COUNT(DISTINCT metric_key) AS v FROM body_measurements WHERE client_user_id = ?`, [MEMBER]],
  ['Member', 'longest measurement gap (days)',
    `SELECT MAX(d) AS v FROM (
       SELECT CAST(julianday(measured_on) - julianday(LAG(measured_on) OVER (ORDER BY measured_on)) AS INTEGER) AS d
         FROM body_measurements WHERE client_user_id = ? AND metric_key = 'weight')`, [MEMBER]],
  ['Member', 'coin balance (minor)', 'SELECT balance_minor AS v FROM coin_wallets WHERE user_id = ?', [MEMBER]],
  ['Member', 'ledger entries (+ / -)',
    `SELECT SUM(amount_minor > 0) || ' / ' || SUM(amount_minor < 0) AS v FROM coin_ledger WHERE user_id = ?`, [MEMBER]],
  ['Member', 'achievements unlocked / total',
    `SELECT (SELECT COUNT(*) FROM user_achievements WHERE user_id = ?) || ' / ' ||
            (SELECT COUNT(*) FROM achievements WHERE active = 1) AS v`, [MEMBER]],
  ['Member', 'notifications unread / total',
    `SELECT SUM(read_at IS NULL) || ' / ' || COUNT(*) AS v FROM notifications WHERE user_id = ?`, [MEMBER]],

  ['Coach', 'clients (active / invited / archived)',
    `SELECT SUM(status = 'active') || ' / ' || SUM(status = 'invited') || ' / ' || SUM(status = 'archived') AS v
       FROM coach_clients WHERE coach_id = ?`, [COACH]],
  ['Coach', 'clients with 0 sessions in 28d',
    `SELECT COUNT(*) AS v FROM coach_clients c
       WHERE c.coach_id = ? AND c.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM workout_logs l WHERE l.client_user_id = c.client_id
                           AND l.status = 'completed' AND l.local_date >= date('now', '-28 days'))`, [COACH]],
  ['Coach', 'pregenerated clients',
    `SELECT COUNT(*) AS v FROM coach_clients WHERE coach_id = ? AND origin = 'pregenerated'`, [COACH]],
  ['Coach', 'teams', 'SELECT COUNT(*) AS v FROM teams WHERE coach_id = ?', [COACH]],
  ['Coach', 'invite codes (live / revoked)',
    `SELECT SUM(revoked_at IS NULL) || ' / ' || SUM(revoked_at IS NOT NULL) AS v FROM invite_codes WHERE coach_id = ?`, [COACH]],
  ['Coach', 'invite redemptions', 'SELECT COUNT(*) AS v FROM invite_redemptions WHERE code_id IN (SELECT id FROM invite_codes WHERE coach_id = ?)', [COACH]],
  ['Coach', 'plans by status',
    `SELECT group_concat(s, ', ') AS v FROM (
       SELECT status || '=' || COUNT(*) AS s FROM workout_plans WHERE author_user_id = ? GROUP BY status ORDER BY status)`, [COACH]],
  ['Coach', 'marketplace posts (published / draft)',
    `SELECT SUM(published_at IS NOT NULL) || ' / ' || SUM(published_at IS NULL) AS v FROM coach_posts WHERE author_user_id = ?`, [COACH]],
  ['Coach', 'conversations / messages / unread',
    `SELECT (SELECT COUNT(*) FROM conversations WHERE coach_id = ?) || ' / ' ||
            (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.coach_id = ?) || ' / ' ||
            (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
              WHERE c.coach_id = ? AND m.read_at IS NULL) AS v`, [COACH, COACH, COACH]],
  ['Coach', 'followers', 'SELECT COUNT(*) AS v FROM coach_follows WHERE coach_user_id = ?', [COACH]],

  ['Admin', 'pending exercise submissions', "SELECT COUNT(*) AS v FROM exercises WHERE status = 'pending_review' AND deleted_at IS NULL", []],
  ['Admin', 'open content reports', "SELECT COUNT(*) AS v FROM content_reports WHERE status_key = 'open'", []],
  ['Admin', 'resolved content reports', "SELECT COUNT(*) AS v FROM content_reports WHERE status_key <> 'open'", []],
  ['Admin', 'open message reports', "SELECT COUNT(*) AS v FROM message_reports WHERE status = 'open'", []],
  ['Admin', 'users total / coaches', "SELECT COUNT(*) || ' / ' || SUM(role = 'coach') AS v FROM users", []],
  ['Admin', 'exercise media rows', 'SELECT COUNT(*) AS v FROM exercise_media WHERE deleted_at IS NULL', []],
  ['Admin', 'audit rows / last 24h',
    "SELECT COUNT(*) || ' / ' || SUM(created_at >= unixepoch() - 86400) AS v FROM audit_log", []],
  ['Admin', 'published coach profiles', 'SELECT COUNT(*) AS v FROM coach_profiles WHERE published_at IS NOT NULL AND removed_at IS NULL', []],
  ['Admin', 'published posts (all coaches)', 'SELECT COUNT(*) AS v FROM coach_posts WHERE published_at IS NOT NULL AND deleted_at IS NULL', []],
  ['Admin', 'demo accounts', `SELECT COUNT(*) AS v FROM users WHERE email LIKE 'demo.%@tracker.local'`, []],
];

const width = Math.max(...CHECKS.map((c) => c[1].length));
let currentGroup = null;
for (const [group, label, sql, params] of CHECKS) {
  const [row] = await db.all(sql, params);
  if (group !== currentGroup) {
    console.log(`\n  ${group}`);
    console.log(`  ${'─'.repeat(width + 12)}`);
    currentGroup = group;
  }
  console.log(`  ${label.padEnd(width)}  ${String(row?.v ?? 0)}`);
}

console.log('\n\n  Rows written this run');
console.log(`  ${'─'.repeat(46)}`);
for (const [k, v] of [...stats.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(32)} ${String(v).padStart(6)}`);
}

console.log('\n  Invite codes (plaintext — shown once, only the hash is stored)');
console.log(`  ${'─'.repeat(46)}`);
for (const c of codeIds) {
  const state = c.revoked ? 'revoked' : c.expired ? 'expired' : `${c.uses}/${c.max} used`;
  console.log(`  ${c.plaintext.padEnd(20)} ${state}`);
}

console.log(`\n  Demo client password: ${PASSWORD}  (every demo.*@tracker.local account)`);
console.log('  Done.\n');

await db.closePool();
