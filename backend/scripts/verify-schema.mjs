// scripts/verify-010-fixes.mjs — proves the three defects the J4 review found are actually fixed.
//
// Each of these was VERIFIED BY EXECUTION in the adversarial review, so a fix claimed and not
// executed is worth nothing. This script reproduces the exact scenario the reviewer ran and asserts
// the opposite outcome.
//
// It works on a throwaway copy of the schema, so it can be run against a live database without
// touching a row of real data.
//
// Usage: node scripts/verify-010-fixes.mjs
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3-multiple-ciphers';

const MIGRATIONS = path.resolve('src/db/migrations');
const tmp = path.join(os.tmpdir(), `tracker-verify-010-${process.pid}.db`);
const db = new Database(tmp);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

for (const f of (await fs.readdir(MIGRATIONS)).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) {
  db.exec(await fs.readFile(path.join(MIGRATIONS, f), 'utf8'));
}

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? passed++ : failed++;
};
/** Runs a statement and reports whether it aborted, and with what message. */
const attempt = (fn) => {
  try {
    fn();
    return { aborted: false, message: null };
  } catch (err) {
    return { aborted: true, message: err.message };
  }
};

/* ── fixture ────────────────────────────────────────────────────────────────────────────────── */

const ins = (sql, ...params) => db.prepare(sql).run(...params).lastInsertRowid;

const coachA = ins("INSERT INTO users (email, password_hash, role) VALUES ('a@t.local', 'x', 'coach')");
const coachB = ins("INSERT INTO users (email, password_hash, role) VALUES ('b@t.local', 'x', 'coach')");
const client = ins("INSERT INTO users (email, password_hash, role) VALUES ('c@t.local', 'x', 'user')");
const client2 = ins("INSERT INTO users (email, password_hash, role) VALUES ('d@t.local', 'x', 'user')");
const link = ins(
  "INSERT INTO coach_clients (coach_id, client_id, status, origin) VALUES (?, ?, 'active', 'manual')",
  coachA,
  client,
);

const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
console.log(`fixture: coachA=${coachA} coachB=${coachB} client=${client} link=${link}\n`);

/* ── FIX 3: the clone-source IDOR ───────────────────────────────────────────────────────────── */
// Reviewer's exact scenario: one coach inserts a template citing another coach's plan as its source.

const planInsert = (author, source) =>
  ins(
    `INSERT INTO workout_plans (author_user_id, scope, name, normalized_name${source != null ? ', source_plan_id' : ''})
     VALUES (?, 'template', ?, ?${source != null ? ', ?' : ''})`,
    ...[author, 'probe', 'probe', ...(source != null ? [source] : [])],
  );

{
  const ownPlan = planInsert(coachA, null);

  const foreign = attempt(() => planInsert(coachB, ownPlan));
  check(
    "a coach cannot cite another coach's plan as a clone source",
    foreign.aborted && /source_plan_id/.test(foreign.message),
    foreign.aborted ? foreign.message.slice(0, 60) : 'INSERT SUCCEEDED — the IDOR is open',
  );

  const own = attempt(() => planInsert(coachA, ownPlan));
  check('a coach CAN cite their own plan', !own.aborted, own.message ?? 'ok');

  // The bypass every INSERT-only trigger in the source designs fell to.
  const viaUpdate = attempt(() => {
    const blank = planInsert(coachB, null);
    db.prepare('UPDATE workout_plans SET source_plan_id = ? WHERE id = ?').run(ownPlan, blank);
  });
  check(
    'and cannot reach it by inserting NULL then updating',
    viaUpdate.aborted,
    viaUpdate.aborted ? 'blocked' : 'UPDATE SUCCEEDED — the INSERT guard is bypassable',
  );
}

/* ── FIX 2: void terminality ────────────────────────────────────────────────────────────────── */
// The reviewer re-voided an already-voided set inside the same wall-clock second and it succeeded,
// silently rewriting voided_reason. One second later the identical statement aborted.

const setCols = cols('workout_log_sets');

/**
 * A logged set, with the whole parent chain the schema insists on.
 *
 * The first attempt inserted a set with just a log_id and got
 * `log_id/client_user_id/exercise_id/local_date must match the parent`. That is the schema working:
 * it is exactly the denormalised-column coherence guard the J4 review demanded of every design, and
 * it refuses a set whose copied ids do not agree with its parent row. Good news, worth stating —
 * the constraint fired before any of this could pretend to test something.
 */
const makeSet = (extra = {}, who = client) => {
  // One live session per client is enforced by a partial unique index, so each probe that needs a
  // session of its own gets its own client. That index is open question #5 in the synthesis notes
  // — it kills the two-phones bug, and it also means a forgotten "Finish" blocks tomorrow.
  const logId = ins("INSERT INTO workout_logs (client_user_id, local_date) VALUES (?, '2026-08-05')", who);
  const logExId = ins(
    "INSERT INTO workout_log_exercises (log_id, client_user_id, exercise_name_snapshot) VALUES (?, ?, 'probe')",
    logId,
    who,
  );
  const keys = ['log_exercise_id', 'log_id', 'client_user_id', 'local_date', 'set_index', ...Object.keys(extra)];
  const values = [logExId, logId, who, '2026-08-05', 1, ...Object.values(extra)];
  return {
    logId,
    setId: ins(
      `INSERT INTO workout_log_sets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      ...values,
    ),
  };
};

if (!setCols.includes('voided_at')) {
  check('void terminality', false, 'workout_log_sets has no voided_at');
} else {
  const { setId } = makeSet();
  db.prepare("UPDATE workout_log_sets SET voided_at = 1700000000, voided_reason = 'first' WHERE id = ?").run(setId);

  // The bug: the same timestamp made NEW = OLD, the WHEN was false, and the write went through.
  const reVoidSameSecond = attempt(() =>
    db.prepare("UPDATE workout_log_sets SET voided_at = 1700000000, voided_reason = 'rewritten' WHERE id = ?").run(setId),
  );
  check(
    're-voiding within the same second is refused',
    reVoidSameSecond.aborted,
    reVoidSameSecond.aborted ? 'blocked' : 'SUCCEEDED — terminality depends on the clock',
  );

  const reason = db.prepare('SELECT voided_reason FROM workout_log_sets WHERE id = ?').get(setId).voided_reason;
  check('and the original reason survives', reason === 'first', `reason = ${reason}`);

  const unVoid = attempt(() =>
    db.prepare('UPDATE workout_log_sets SET voided_at = NULL WHERE id = ?').run(setId),
  );
  check('un-voiding is refused', unVoid.aborted, unVoid.aborted ? 'blocked' : 'SUCCEEDED');
}

/* ── FIX 1: the FK-action trap ──────────────────────────────────────────────────────────────── */
// The reviewer executed four consequences of the missing IS NOT NULL carve-out. The most ordinary
// is a coach deleting an exercise from a plan day after a client has trained a set from it.

if (!setCols.includes('plan_set_target_id')) {
  check('FK-action carve-out', false, 'workout_log_sets has no plan_set_target_id');
} else {
  // The full chain the reviewer's scenario needs: plan → day → block → exercise → set target, then
  // a logged set that points at that target. Column names taken from the applied schema, not
  // guessed — the first attempt at this probe used `title` and `plan_day_id`, and neither exists.
  const chain = attempt(() => {
    const planId = planInsert(coachA, null);
    const dayId = ins(
      "INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, 1, 'day')",
      planId,
    );
    const blockId = ins('INSERT INTO workout_plan_blocks (plan_id, day_id) VALUES (?, ?)', planId, dayId);
    // The prescription lives on the exercise row; `workout_plan_set_targets` is only the per-set
    // override for ramps and waves. `target_metric` defaults to 'reps' and a CHECK then requires a
    // rep count — an exercise cannot be prescribed in reps without saying how many.
    const exRowId = ins(
      `INSERT INTO workout_plan_exercises (plan_id, block_id, exercise_name_snapshot, target_reps_min)
       VALUES (?, ?, 'probe', 8)`,
      planId,
      blockId,
    );
    const targetId = ins(
      'INSERT INTO workout_plan_set_targets (plan_id, exercise_row_id, set_index) VALUES (?, ?, 1)',
      planId,
      exRowId,
    );

    makeSet({ plan_set_target_id: targetId }, client2);
    return planId;
  });

  if (chain.aborted) {
    // Reported, not skipped: an unrunnable probe is not a passing one.
    check('a logged set materialised from a plan target', false, chain.message.slice(0, 110));
  } else {
    const planId = db.prepare('SELECT MIN(plan_id) AS id FROM workout_plan_set_targets').get().id;
    check('a logged set materialised from a plan target', true, `plan ${planId}`);

    // THE scenario: the coach edits the plan after the client has trained from it. Before the fix
    // this aborted with "the prescription snapshot and load context are server-owned".
    const del = attempt(() => db.prepare('DELETE FROM workout_plans WHERE id = ?').run(planId));
    check(
      'deleting that plan no longer aborts on the FK action',
      !del.aborted,
      del.aborted ? del.message.slice(0, 90) : 'deleted',
    );

    // And the set survives with its target detached, which is the point of ON DELETE SET NULL.
    if (!del.aborted) {
      const row = db.prepare('SELECT plan_set_target_id FROM workout_log_sets WHERE plan_set_target_id IS NULL').get();
      check('the logged set survives with its target detached', !!row, row ? 'history intact' : 'set vanished');
    }
  }
}

/* ── the four gaps closed after the review ──────────────────────────────────────────────────── */
// Each of these was a requirement the roadmap makes and the first cut of the schema could not
// express. They are checked here rather than trusted, because a CHECK that permits what it was
// written to forbid looks exactly like one that works.

{
  // Every record except session_volume must point at the SET that earned it — enforced by
  // trg_pr_event_session_shape, and correct: a per-set achievement with no set behind it cannot be
  // invalidated when that set is voided. So the probe needs a real set, not a NULL.
  const prClient = ins("INSERT INTO users (email, password_hash, role) VALUES ('e@t.local', 'x', 'user')");
  const { setId: prSetId } = makeSet({}, prClient);

  const prRow = (kind, extra = {}) => {
    const keys = [
      'client_user_id',
      'exercise_name_snapshot',
      'kind',
      'value',
      'local_date',
      'source_set_id',
      ...Object.keys(extra),
    ];
    const vals = [prClient, 'probe', kind, 42, '2026-08-05', prSetId, ...Object.values(extra)];
    return () =>
      db.prepare(`INSERT INTO workout_pr_events (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...vals);
  };

  // A calisthenics client's only possible record.
  const hold = attempt(prRow('max_hold', { value_unit: 'seconds' }));
  check('a duration record is storable', !hold.aborted, hold.message?.slice(0, 70) ?? 'stored');

  // The one kind that compares downward. Storing the direction wrong must be impossible.
  const wrongDirection = attempt(prRow('best_time', { value_unit: 'seconds', higher_is_better: 1 }));
  check(
    'a best_time record cannot claim higher-is-better',
    wrongDirection.aborted,
    wrongDirection.aborted ? 'blocked' : 'STORED — the direction can disagree with the kind',
  );

  const wrongUnit = attempt(prRow('max_hold', { value_unit: 'kg' }));
  check(
    'a duration record cannot be labelled kilograms',
    wrongUnit.aborted,
    wrongUnit.aborted ? 'blocked' : 'STORED — the unit can disagree with the kind',
  );
}

{
  // Every occurrence is starts_on + k*cycle_days + day_index. Without a start date the generator
  // emits nothing and the client sees a plan they can never do, with no error anywhere.
  const noStart = attempt(() =>
    ins(
      `INSERT INTO workout_plans (author_user_id, scope, status, name, normalized_name)
       VALUES (?, 'client', 'active', 'no start', 'no start')`,
      coachA,
    ),
  );
  check(
    'an active client plan without a start date is refused',
    noStart.aborted,
    noStart.aborted ? 'blocked' : 'STORED — an invisible plan',
  );

  const template = attempt(() =>
    ins(
      `INSERT INTO workout_plans (author_user_id, scope, status, name, normalized_name)
       VALUES (?, 'template', 'active', 'tpl', 'tpl')`,
      coachA,
    ),
  );
  check('but a template still needs none', !template.aborted, template.message?.slice(0, 60) ?? 'ok');
}

{
  const dayCols = cols('workout_plan_days');
  const feedCols = cols('workout_calendar_feeds');
  check(
    'the ICS feed can express a time of day in a real timezone',
    dayCols.includes('start_time') && feedCols.includes('timezone'),
    `plan_days.start_time=${dayCols.includes('start_time')}, feeds.timezone=${feedCols.includes('timezone')}`,
  );
  // The patch that added this first landed on the wrong table, because the anchor line it matched
  // appears twice in the file and String.replace takes the first. Asserted so it cannot recur.
  check(
    'and the timezone column is not on workout_plan_blocks',
    !cols('workout_plan_blocks').includes('timezone'),
    'placement verified',
  );
}

/* ── migration 011: a departing coach does not take their clients' history ──────────────────── */
//
// The chain the review traced: users → exercises.owner_id ON DELETE CASCADE (003), and every log
// table's exercise_id is ON DELETE SET NULL. Delete a coach and the custom exercises they authored
// are destroyed, so every log row that referenced one loses its link. The rows survive — they
// snapshot the name — but nothing GROUPS any more: the progress graph, the record book and the
// "previous" column all silently stop resolving. Months of a client's training, unlinked, with no
// error and nobody told.

{
  const departing = ins("INSERT INTO users (email, password_hash, role) VALUES ('gone@t.local', 'x', 'coach')");
  const trainee = ins("INSERT INTO users (email, password_hash, role) VALUES ('stays@t.local', 'x', 'user')");
  const custom = ins(
    `INSERT INTO exercises (name, normalized_name, status, owner_id, source)
     VALUES ('Coach Movement', 'coach movement', 'private', ?, 'custom')`,
    departing,
  );

  // The client must legitimately have access before they can log it — `trg_log_exercise_visible_ins`
  // refuses otherwise, which is the write-side half of the same rule the read predicate enforces.
  // So the full chain: link, active plan, day, block, prescription. This is the honest setup, and
  // building it here proved the trigger works before this probe could test anything else.
  const traineeLink = ins(
    "INSERT INTO coach_clients (coach_id, client_id, status, origin) VALUES (?, ?, 'active', 'manual')",
    departing,
    trainee,
  );
  const histPlan = ins(
    `INSERT INTO workout_plans (author_user_id, scope, status, coach_client_id, client_user_id,
                                starts_on, name, normalized_name)
     VALUES (?, 'client', 'active', ?, ?, '2026-08-01', 'history probe', 'history probe')`,
    departing,
    traineeLink,
    trainee,
  );
  const histDay = ins(
    "INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, 0, 'day')",
    histPlan,
  );
  const histBlock = ins('INSERT INTO workout_plan_blocks (plan_id, day_id) VALUES (?, ?)', histPlan, histDay);
  ins(
    `INSERT INTO workout_plan_exercises (plan_id, block_id, exercise_id, exercise_name_snapshot, target_reps_min)
     VALUES (?, ?, ?, 'Coach Movement', 8)`,
    histPlan,
    histBlock,
    custom,
  );

  const logId = ins("INSERT INTO workout_logs (client_user_id, local_date) VALUES (?, '2026-08-05')", trainee);
  const logExId = ins(
    `INSERT INTO workout_log_exercises (log_id, client_user_id, exercise_id, exercise_name_snapshot)
     VALUES (?, ?, ?, 'Coach Movement')`,
    logId,
    trainee,
    custom,
  );
  ins(
    `INSERT INTO workout_log_sets (log_exercise_id, log_id, client_user_id, local_date, set_index, exercise_id)
     VALUES (?, ?, ?, '2026-08-05', 1, ?)`,
    logExId,
    logId,
    trainee,
    custom,
  );

  const gdpr = attempt(() => db.prepare('DELETE FROM users WHERE id = ?').run(departing));
  check(
    "deleting a coach's account still succeeds",
    !gdpr.aborted,
    gdpr.aborted ? gdpr.message.slice(0, 80) : 'deleted',
  );

  const survived = db.prepare('SELECT owner_id, status FROM exercises WHERE id = ?').get(custom);
  check(
    'the exercise survives, orphaned rather than destroyed',
    !!survived && survived.owner_id === null,
    survived ? `owner_id=${survived.owner_id}, status=${survived.status}` : 'the row is gone',
  );
  check(
    'and it is NOT published to everyone in the process',
    survived?.status === 'private',
    `status=${survived?.status} — 'global' here would leak a departing coach's library`,
  );

  const set = db.prepare('SELECT exercise_id FROM workout_log_sets WHERE client_user_id = ?').get(trainee);
  check(
    "the client's logged set keeps its exercise link",
    set?.exercise_id === custom,
    set?.exercise_id === null ? 'NULL — the history is unlinked, the graph is broken' : `exercise_id=${set?.exercise_id}`,
  );

  // The hard-delete guard. Nothing in the product issues one today; the point is that if anything
  // ever does, it aborts rather than quietly unlinking somebody's year of training.
  const hard = attempt(() => db.prepare('DELETE FROM exercises WHERE id = ?').run(custom));
  check(
    'hard-deleting an exercise with history is refused',
    hard.aborted && /training history/.test(hard.message),
    hard.aborted ? hard.message.slice(0, 70) : 'DELETED — history silently unlinked',
  );
}

db.close();
await fs.rm(tmp, { force: true });
await fs.rm(`${tmp}-wal`, { force: true });
await fs.rm(`${tmp}-shm`, { force: true });

console.log(`\n${failed === 0 ? 'VERIFY OK' : 'VERIFY FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
