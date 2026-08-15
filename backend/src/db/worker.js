// src/db/worker.js — runs inside a Piscina worker thread.
//
// better-sqlite3 is deliberately synchronous: every query blocks whichever event loop it runs
// on. Wrapping a sync call in a Promise changes nothing — the work has to leave the main
// thread. Each worker owns exactly one encrypted connection; connections cannot be shared
// across threads.
import { readFileSync, mkdirSync } from 'node:fs';
import { EXPORT_TABLES, UNLINK_BEFORE_DELETE } from './gdpr.js';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../lib/dbkey.js';

let db;

function getDb() {
  if (db) return db;
  // better-sqlite3 does not create missing parent directories — a fresh checkout would
  // otherwise die with SQLITE_CANTOPEN at boot.
  mkdirSync(dirname(process.env.DB_PATH), { recursive: true });
  const conn = new Database(process.env.DB_PATH);
  try {
    // hexkey with a scrypt-derived raw key: no passphrase quoting pitfalls, our own strong KDF
    // instead of the library default, and one master secret can serve several databases by
    // varying the salt.
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    // busy_timeout BEFORE any statement and before the WAL switch: at boot several workers
    // open lazily at once and the journal_mode change needs a lock. With the default timeout
    // of 0 a contending worker throws SQLITE_BUSY instead of waiting.
    conn.pragma('busy_timeout = 5000');
    conn.prepare('SELECT 1').get(); // wrong key surfaces as SQLITE_NOTADB right here
    conn.pragma('journal_mode = WAL');
    conn.pragma('synchronous = NORMAL');
    conn.pragma('foreign_keys = ON');
  } catch (err) {
    conn.close(); // don't leak the handle; a later call retries with a fresh connection
    throw err;
  }
  // Publish only after every pragma succeeded. Caching a half-configured connection (say, with
  // foreign_keys still OFF) would silently corrupt integrity on every subsequent call.
  db = conn;
  return db;
}

const statements = new Map();
function stmt(sql) {
  let s = statements.get(sql);
  if (!s) {
    s = getDb().prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

/**
 * Re-throw a SQLite error in a form that survives the worker boundary.
 *
 * better-sqlite3 attaches its detail to `code` and to non-enumerable Error fields, and the
 * structured clone that carries an error out of a worker keeps almost none of it — the caller
 * sees a bare `{ code: 'SQLITE_ERROR' }` with no message and no statement. That turns a typo in
 * a query into a blind hunt, which cost real time three separate times before this existed.
 */
function rethrow(err, sql) {
  const wrapped = new Error(
    `${err?.code ?? 'SQLITE_ERROR'}: ${err?.message ?? 'unknown'}${sql ? ` — while running: ${sql.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
  );
  wrapped.code = err?.code ?? 'SQLITE_ERROR';
  throw wrapped;
}

export function all({ sql, params = [] }) {
  try {
    return stmt(sql).all(...params);
  } catch (err) {
    return rethrow(err, sql);
  }
}

export function get({ sql, params = [] }) {
  try {
    return stmt(sql).get(...params);
  } catch (err) {
    return rethrow(err, sql);
  }
}

export function run({ sql, params = [] }) {
  try {
    const info = stmt(sql).run(...params);
    return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
  } catch (err) {
    return rethrow(err, sql);
  }
}

// One logical write = one worker call. IMMEDIATE takes the write lock up front, which avoids
// lock-upgrade SQLITE_BUSY storms under concurrency.
//
// writeTx is for SIMPLE multi-statement writes only. Anything with a guard or a branch — money,
// inventory, anything irreversible — gets its own NAMED worker function, because writeTx cannot
// inspect an intermediate result and therefore cannot enforce a condition.
export function writeTx({ steps }) {
  let current = null;
  const tx = getDb().transaction((items) =>
    items.map(({ sql, params = [] }) => {
      current = sql;
      const info = stmt(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    }),
  );
  try {
    return tx.immediate(steps);
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ── the workout log: two named transactions ────────────────────────────────────────────────────
 *
 * These are the product's most critical writes, so they are NAMED worker functions rather than
 * `writeTx` steps — `writeTx` cannot inspect an intermediate result and therefore cannot enforce a
 * condition, which is the entire job here.
 *
 * Both use `tx.immediate()`. That takes the single write lock on the FIRST statement, so there is
 * no window between a read and the write that depends on it. The same code under a DEFERRED
 * transaction would be a TOCTOU: the lock would be taken at the first WRITE, after the reads.
 */

/**
 * Start a session, materialising the whole grid as pending rows.
 *
 * LAYER 0 of the idempotency design, and the cheapest layer by far: because every set already
 * exists as a row, checking one is an UPDATE. There is no INSERT to duplicate, so the entire
 * double-tap duplicate-row class is gone before any dedupe logic runs.
 *
 * It also means the player needs no network while the client trains: the grid it renders is the
 * grid the server already holds.
 */
export function startWorkoutTx({ clientUserId, localDate, plan, exercises }) {
  const conn = getDb();
  let current = null;
  const tx = conn.transaction(() => {
    // One live session per client is a partial unique index, so a second start collides rather
    // than silently creating a parallel session on another device. Reported, not thrown: a client
    // that lost its connection mid-workout reconnects and must be handed back the SAME session,
    // not an error.
    current = 'SELECT live session';
    const live = stmt(
      `SELECT id FROM workout_logs WHERE client_user_id = ? AND status = 'in_progress'`,
    ).get(clientUserId);
    if (live) return { logId: live.id, resumed: true, sets: 0 };

    current = 'INSERT workout_logs';
    const log = stmt(
      `INSERT INTO workout_logs
         (client_user_id, coach_client_id, plan_id, plan_day_id, plan_revision,
          plan_name_snapshot, day_name_snapshot, occurrence_date, title, source, status,
          started_at, local_date, tz_name, bodyweight_kg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', unixepoch(), ?, ?, ?)`,
    ).run(
      clientUserId, plan.coachClientId, plan.planId, plan.planDayId, plan.planRevision,
      plan.planName, plan.dayName, plan.occurrenceDate, plan.title, plan.source,
      localDate, plan.tzName, plan.bodyweightKg,
    );
    const logId = Number(log.lastInsertRowid);

    let sets = 0;
    for (const ex of exercises) {
      current = 'INSERT workout_log_exercises';
      const row = stmt(
        `INSERT INTO workout_log_exercises
           (log_id, client_user_id, exercise_id, exercise_name_snapshot, plan_exercise_id, origin,
            block_kind, block_ordinal, position, target_metric, load_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        logId, clientUserId, ex.exerciseId, ex.nameSnapshot, ex.planExerciseId, ex.origin,
        ex.blockKind, ex.blockOrdinal, ex.position, ex.targetMetric, ex.loadMode,
      );
      const logExerciseId = Number(row.lastInsertRowid);

      // The PRESCRIPTION is copied onto every set, not referenced. A log is a historical fact:
      // the coach editing the plan tomorrow must not rewrite what the client was told to do today.
      for (const target of ex.sets) {
        current = 'INSERT workout_log_sets';
        stmt(
          `INSERT INTO workout_log_sets
             (log_exercise_id, log_id, client_user_id, exercise_id, local_date, plan_set_target_id,
              set_index, set_kind, target_reps, target_seconds, target_distance_m, target_weight_kg,
              target_rpe, target_rest_seconds, load_mode, bodyweight_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          logExerciseId, logId, clientUserId, ex.exerciseId, localDate, target.planSetTargetId,
          target.setIndex, target.setKind, target.targetReps, target.targetSeconds,
          target.targetDistanceM, target.targetWeightKg, target.targetRpe, target.targetRestSeconds,
          ex.loadMode, plan.bodyweightKg,
        );
        sets += 1;
      }
    }
    return { logId, resumed: false, sets };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Check one set. The hottest write in the product, and where idempotency is decided.
 *
 * LAYER 1 — THE GUARD IS THE UPDATE, and the key is REQUEST IDENTITY (`write_uid`), never row
 * state. Three outcomes, all decided by the database with no preceding SELECT to race against:
 *
 *   fresh check        → changes = 1. Proceed to the record upsert.
 *   exact replay       → the same uid matches, identical values are rewritten, still one row.
 *                        Everything downstream is idempotent, so the net effect is nil.
 *   different payload
 *   against a completed
 *   set                → matches nothing, changes = 0. No write happened, so re-reading and
 *                        answering 409 is safe under the commit-on-return law.
 *
 * That third case is the one every candidate design in the J4 review got wrong. Keying on
 * `completed_at` alone makes "the same request twice" and "a corrected value" indistinguishable:
 * an offline queue flushing a 100 kg typo AND its 10 kg correction then persists whichever the
 * network happened to deliver last, and answers 200 either way. The user's screen and their
 * history disagree permanently, and the freeze trigger makes it uncorrectable.
 *
 * LAYER 2 is the schema's: `effective_load_kg`, `volume_kg` and `e1rm_canonical_kg` are STORED
 * GENERATED columns with no write surface, so nothing here — forged through a proxy or refactored
 * in a hurry — can put a client-supplied volume or 1RM into the database.
 *
 * LAYER 3 is also the schema's: the rollup triggers RECOMPUTE the parent's totals as
 * `SET x = (SELECT SUM(...))`, which is idempotent. `SET x = x + ?` is what a replay double-counts.
 */
export function recordSetTx({ setId, clientUserId, writeUid, values }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // Read the prior state BEFORE the guard runs, so "applied" and "replayed" can be told apart
    // afterwards. This is not a TOCTOU: `tx.immediate()` takes the single write lock at BEGIN, not
    // at the first write, so nothing can change between this SELECT and the UPDATE below. Under a
    // DEFERRED transaction the same two statements would be a genuine race.
    current = 'SELECT prior state';
    const prior = stmt(
      'SELECT completed_at, write_uid FROM workout_log_sets WHERE id = ? AND client_user_id = ?',
    ).get(setId, clientUserId);
    const wasComplete = prior?.completed_at != null;

    current = 'UPDATE workout_log_sets (the guard)';
    const updated = stmt(
      `UPDATE workout_log_sets
          SET completed_at = COALESCE(completed_at, unixepoch()),
              weight_kg = ?, entry_unit = ?, entry_value = ?, reps = ?,
              seconds = ?, distance_m = ?, rpe = ?, rest_taken_seconds = ?,
              write_uid = ?
        WHERE id = ? AND client_user_id = ? AND voided_at IS NULL
          AND (completed_at IS NULL OR write_uid = ?)`,
    ).run(
      values.weightKg, values.entryUnit, values.entryValue, values.reps,
      values.seconds, values.distanceM, values.rpe, values.restTakenSeconds,
      writeUid, setId, clientUserId, writeUid,
    );

    if (updated.changes === 0) {
      // Nothing was written, so returning a result here cannot leave a half-committed state.
      // The row is re-read so the client can be shown what IS stored and offered void-and-relog.
      current = 'SELECT the conflicting set';
      const existing = stmt(
        `SELECT id, completed_at, voided_at, weight_kg, entry_unit, entry_value, reps, seconds,
                distance_m, rpe
           FROM workout_log_sets WHERE id = ? AND client_user_id = ?`,
      ).get(setId, clientUserId);
      return existing ? { outcome: 'conflict', existing } : { outcome: 'missing' };
    }

    current = 'SELECT the written row';
    const row = stmt(
      // `target_seconds` and `block_kind` are read so the record gate below can tell conditioning
      // work from strength work, and a performed-as-prescribed hold from a genuine one. The join
      // already existed, so both are free.
      `SELECT s.id, s.log_id, s.exercise_id, s.set_kind, s.reps, s.seconds, s.distance_m,
              s.effective_load_kg, s.volume_kg, s.e1rm_canonical_kg, s.local_date,
              s.target_seconds, s.target_rest_seconds,
              x.exercise_name_snapshot, x.block_kind
         FROM workout_log_sets s
         JOIN workout_log_exercises x ON x.id = s.log_exercise_id
        WHERE s.id = ?`,
    ).get(setId);

    // LAYER 4 — the record is a GUARDED UPSERT, and every value comes from the row's own generated
    // columns. Nothing the client sent reaches a record.
    //
    // Warm-ups are excluded here AND nowhere else is enough: the review found one design filtering
    // them in the PR layer only, so a warm-up still moved the session's top weight and total reps.
    // The rollup triggers handle those; this handles the badge.
    // A REPLAY MINTS NOTHING, and it must not even TRY.
    //
    // The design assumed the upsert's own guard would make a replay a no-op: `excluded.value` would
    // equal the stored value, the `DO UPDATE ... WHERE` would be false, changes = 0. That reasoning
    // covers the DAY-unique index it names as the conflict target — and misses the second one.
    //
    // `workout_pr_events_source_unique (source_set_id, kind, rep_bucket)` fires FIRST, because the
    // replay is inserting a second event for a set that already has one. `ON CONFLICT` names only
    // the day index, so a conflict on the source index is unhandled: SQLITE_CONSTRAINT_UNIQUE, and
    // a perfectly ordinary double-tap comes back as an error. Found by running it.
    //
    // Skipping is also the semantically correct answer, not merely the working one: the records for
    // this set were minted in the SAME transaction that completed it, so if the set is complete the
    // badges already exist. There is nothing a replay could add.
    const records = [];
    if (!wasComplete && row.exercise_id && row.set_kind !== 'warmup') {
      const candidates = [];

      // CONDITIONING WORK EARNS NO STRENGTH RECORD.
      //
      // Without this gate every Tabata round mints one. Twenty seconds of burpees enters the book
      // as a longest HOLD, a bodyweight circuit round mints `e1rm = bodyweight × (1 + reps/30)`,
      // and a 13-rep round mints a rep_max at bucket 13. None of those is a strength record, and
      // the damage is permanent rather than cosmetic: the ratchet is all-time, so one garbage
      // entry blocks every genuine PR of that kind for that exercise forever.
      //
      // `superset` and `single` are deliberately NOT in the gate. Heavy paired work is real
      // strength work and must keep earning records.
      const conditioning =
        row.block_kind === 'circuit' || row.block_kind === 'emom' || row.block_kind === 'amrap';

      if (!conditioning && row.e1rm_canonical_kg != null) {
        candidates.push({ kind: 'e1rm', bucket: 0, value: row.e1rm_canonical_kg, unit: 'kg', higher: 1 });
      }
      if (!conditioning && row.effective_load_kg != null && row.reps != null && row.reps >= 1) {
        // 1..12 exact, 13+ collapses to 13. A bucket per rep count past a dozen is noise.
        candidates.push({
          kind: 'rep_max',
          bucket: Math.min(row.reps, 13),
          value: row.effective_load_kg,
          unit: 'kg',
          higher: 1,
        });
      }
      // `max_hold` needs the `conditioning` gate as well as the target comparison, not instead of
      // it: an EMOM member is `target_metric='reps'`, so its `target_seconds` is NULL, the second
      // disjunct below is vacuously true, and every minute of an EMOM would mint a hold record.
      // The target comparison is what stops a PRESCRIBED 30-second plank from minting a record
      // merely for being performed as written.
      if (
        !conditioning &&
        row.seconds != null && row.seconds > 0 && row.reps == null &&
        (row.target_seconds == null || row.seconds > row.target_seconds)
      ) {
        candidates.push({ kind: 'max_hold', bucket: 0, value: row.seconds, unit: 'seconds', higher: 1 });
      }
      if (row.distance_m != null && row.distance_m > 0) {
        candidates.push({ kind: 'max_distance', bucket: 0, value: row.distance_m, unit: 'metres', higher: 1 });
      }

      for (const c of candidates) {
        current = `UPSERT workout_pr_events (${c.kind})`;
        // THE COMPARISON LIVES INSIDE THE UPDATE. No preceding SELECT, no race. `changes = 1`
        // means and can only mean a genuinely better value; a replay produces
        // `excluded.value = the stored value`, the guard is false, and no badge is minted.
        //
        // The epsilon is deliberate: lb→kg conversion means the same physical lift does not
        // produce bit-identical floats, and a bare `>` mints a phantom record for repeating
        // 225 lb after a client-side rounding change.
        // The all-time best for this exercise and bucket, not the day's — a record has to beat
        // everything, not just today.
        const prev = stmt(
          `SELECT value FROM workout_pr_events
            WHERE client_user_id = ? AND exercise_id = ? AND kind = ? AND rep_bucket = ?
              AND invalidated_at IS NULL
            ORDER BY value DESC LIMIT 1`,
        ).get(clientUserId, row.exercise_id, c.kind, c.bucket);

        // NOT A RECORD → DO NOT ATTEMPT THE INSERT.
        //
        // The design put the whole comparison inside the upsert's `DO UPDATE ... WHERE` and relied
        // on it evaluating to false. It never gets that far: the table carries
        // `CHECK (previous_value IS NULL OR value > previous_value)`, which is evaluated on the row
        // being INSERTED. A worse set therefore aborts the entire transaction — the set itself is
        // rejected, and a lifter doing a lighter back-off set after a heavy one cannot log it.
        // Found by running it: 110 kg then 95 kg, and the 95 came back 400.
        //
        // Comparing here is not the race the design was avoiding. `tx.immediate()` holds the single
        // write lock from BEGIN, so nothing can interleave between this read and the write below.
        // The rule "no preceding SELECT" applies to a DEFERRED transaction, where the lock is taken
        // at the first WRITE and the read really is unprotected.
        //
        // The epsilon is the design's, and it is right: lb→kg means the same physical lift does not
        // produce bit-identical floats, and a bare `>` mints a phantom record for repeating 225 lb
        // after a client-side rounding change.
        if (prev != null && c.value <= prev.value + 0.005) continue;

        const info = stmt(
          `INSERT INTO workout_pr_events
             (client_user_id, exercise_id, exercise_name_snapshot, source_set_id, log_id,
              kind, rep_bucket, value, previous_value, local_date, higher_is_better, value_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (client_user_id, exercise_id, kind, rep_bucket, local_date)
             WHERE invalidated_at IS NULL
           DO UPDATE SET value = excluded.value, source_set_id = excluded.source_set_id,
                         log_id = excluded.log_id, achieved_at = unixepoch()
                   WHERE excluded.value > workout_pr_events.value + 0.005`,
        ).run(
          clientUserId, row.exercise_id, row.exercise_name_snapshot, setId, row.log_id,
          c.kind, c.bucket, c.value, prev?.value ?? null, row.local_date, c.higher, c.unit,
        );

        if (info.changes === 1) {
          records.push({ kind: c.kind, repBucket: c.bucket, value: c.value, previous: prev?.value ?? null });
        }
      }
    }

    // A replay is a set that was ALREADY complete and matched on `write_uid`. The data is
    // identical either way — the flag exists so the player can tell "checked" from "re-sent" and
    // not flash a PR badge twice for the same set.
    return { outcome: 'applied', replayed: wasComplete, logId: row.log_id, records };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Void a completed set — the "I tapped the wrong row" recovery path.
 *
 * The whole no-scroll law of the player exists to make a mistap unlikely; this is what happens when
 * one gets through anyway. `recordSetTx` already tells a conflicted client it may "void and relog",
 * and until now there was nothing to call.
 *
 * A NAMED transaction, not `writeTx`, for the reason every other one is named: the void and the
 * withdrawal of the records it earned must be ONE atomic act. Split across two pool calls there is
 * a window in which the set is gone from the totals but its personal record still sits on the
 * records screen — and since a void is terminal, that window is not self-healing.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *  - It does not recompute the session rollups. `trg_log_rollup_recompute_upd` fires on any UPDATE
 *    of a set row and rebuilds them as `SELECT SUM(...) WHERE voided_at IS NULL`, so the totals
 *    correct themselves. Recomputing here would be a second implementation of an invariant the
 *    schema already owns — the exact drift this codebase keeps eliminating.
 *  - It does not restore the previous record holder. `workout_pr_events` is append-only with an
 *    `invalidated_at` tombstone, and every records query already reads
 *    `WHERE invalidated_at IS NULL`. Across DAYS that is enough: tombstoning today's event makes
 *    the previous day's the top one again by arithmetic.
 *
 *    WITHIN a day it is not, and the honest statement of the consequence is this: the day-unique
 *    index means a same-session beat UPDATES the day's event rather than appending beside it, so
 *    the earlier value is not stored anywhere. Voiding the set that beat it therefore removes the
 *    day's record outright rather than reverting to the earlier number. Measured, not reasoned
 *    about — the smoke check asserts zero e1rm rows remain after voiding the beater.
 *
 *    That is the correct behaviour, not a gap to paper over. Within a day a record is a high-water
 *    mark, not a stack, and inventing a replacement event would mean writing a row claiming an
 *    achievement happened at a moment it did not.
 *
 * IDEMPOTENCY. `trg_log_set_void_terminal` aborts any second void, so a retried request would raise
 * rather than return. But an undo is a button a shaking hand double-taps on a flaky connection, and
 * a void carries no values to disagree about: the state it asks for is the state that already
 * exists. So an already-voided set reports `replayed` and the route answers 200. The FIRST reason
 * is kept, because a withdrawal is itself history and the second tap is not new information.
 */
export function voidSetTx({ setId, clientUserId, reason }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // Read before the guard so `applied` and `replayed` can be told apart afterwards. Not a TOCTOU:
    // `tx.immediate()` takes the single write lock at BEGIN, not at the first write.
    current = 'SELECT prior state';
    const prior = stmt(
      'SELECT id, completed_at, voided_at FROM workout_log_sets WHERE id = ? AND client_user_id = ?',
    ).get(setId, clientUserId);

    // Not this client's set, or no such set. One answer for both — the route turns it into a 404.
    if (!prior) return { outcome: 'missing' };
    if (prior.voided_at != null) return { outcome: 'replayed' };
    // A set that was never checked has nothing to undo. Allowing it would let a client tombstone
    // rows out of the prescribed grid, which is the coach's object, not theirs.
    if (prior.completed_at == null) return { outcome: 'not_completed' };

    current = 'UPDATE workout_log_sets (the void)';
    const voided = stmt(
      `UPDATE workout_log_sets
          SET voided_at = unixepoch(), voided_reason = ?
        WHERE id = ? AND client_user_id = ? AND voided_at IS NULL AND completed_at IS NOT NULL`,
    ).run(reason, setId, clientUserId);

    // The predicate is repeated in the UPDATE rather than trusted from the SELECT above. It costs
    // nothing and it means the write is safe even if this function is later called from somewhere
    // that skipped the read.
    if (voided.changes === 0) return { outcome: 'missing' };

    current = 'UPDATE workout_pr_events (withdraw the records)';
    // Scoped by client_user_id as well as source_set_id. The set id alone would be enough today
    // because the set was just ownership-checked, but every write in this codebase carries its own
    // ownership predicate rather than inheriting one from a statement above it.
    const withdrawn = stmt(
      `UPDATE workout_pr_events
          SET invalidated_at = unixepoch(), invalidated_reason = 'the set that earned it was voided'
        WHERE source_set_id = ? AND client_user_id = ? AND invalidated_at IS NULL`,
    ).run(setId, clientUserId);

    return { outcome: 'applied', recordsWithdrawn: withdrawn.changes };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Clone a plan — a template to a client, or a plan to a fresh template.
 *
 * A NAMED transaction because it is a deep copy with a guard at the top and four dependent inserts
 * below it, and `writeTx` cannot look at an intermediate id. It is also all-or-nothing by nature: a
 * plan with days but no exercises is worse than no plan at all.
 *
 * COPY, DO NOT REFERENCE. All three independent designs in the J4 review reached this on their own,
 * and it is the reason templates are worth having: a coach running forty clients on one programme
 * can fix a rep range for ONE of them without silently rewriting what the other thirty-nine are
 * doing tomorrow. `source_plan_id` records where it came from — provenance for a previewable
 * re-clone — and is trigger-guarded so it can only ever name a plan the author already owns.
 *
 * Ownership is enforced by the first statement and nothing proceeds without it: the SELECT carries
 * the full coach predicate, and a miss returns `{ ok: false }` for the route to turn into a 404.
 */
export function clonePlanTx({ sourcePlanId, coachUserId, coachClientId, name, startsOn }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the source plan (ownership)';
    const source = stmt(
      `SELECT p.* FROM workout_plans p
        WHERE p.id = ? AND p.author_user_id = ? AND p.archived_at IS NULL
          AND (p.coach_client_id IS NULL OR EXISTS (
                SELECT 1 FROM coach_clients cc
                 WHERE cc.id = p.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))`,
    ).get(sourcePlanId, coachUserId, coachUserId);
    if (!source) return { ok: false, reason: 'source' };

    // The destination link, when cloning TO a client. Checked in the same transaction as the write
    // for the same reason every create in this codebase is: there is no window to archive in.
    let clientUserId = null;
    if (coachClientId != null) {
      current = 'SELECT the destination link';
      const link = stmt(
        "SELECT client_id FROM coach_clients WHERE id = ? AND coach_id = ? AND status = 'active'",
      ).get(coachClientId, coachUserId);
      if (!link) return { ok: false, reason: 'link' };
      clientUserId = link.client_id;
    }

    current = 'INSERT the clone';
    const clone = stmt(
      `INSERT INTO workout_plans
         (scope, author_user_id, coach_client_id, client_user_id, source_plan_id, source_revision,
          name, normalized_name, description, goal, experience, cycle_days, starts_on, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    ).run(
      coachClientId != null ? 'client' : 'template',
      coachUserId,
      coachClientId,
      clientUserId,
      source.id,
      source.revision,
      name,
      name.toLowerCase(),
      source.description,
      source.goal,
      source.experience,
      source.cycle_days,
      startsOn,
    );
    const planId = Number(clone.lastInsertRowid);

    // The tree, level by level, carrying an old-id → new-id map down. A recursive copy would be
    // shorter and would also have to re-query at every level; the depth here is fixed at four.
    const dayMap = new Map();
    current = 'copy days';
    for (const d of stmt('SELECT * FROM workout_plan_days WHERE plan_id = ? ORDER BY id').all(source.id)) {
      const row = stmt(
        `INSERT INTO workout_plan_days (plan_id, day_index, slot, name, notes, is_rest, est_minutes, start_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(planId, d.day_index, d.slot, d.name, d.notes, d.is_rest, d.est_minutes, d.start_time);
      dayMap.set(d.id, Number(row.lastInsertRowid));
    }

    const blockMap = new Map();
    current = 'copy blocks';
    for (const b of stmt('SELECT * FROM workout_plan_blocks WHERE plan_id = ? ORDER BY id').all(source.id)) {
      const row = stmt(
        `INSERT INTO workout_plan_blocks (plan_id, day_id, kind, position, rounds, rest_seconds, cap_seconds, label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(planId, dayMap.get(b.day_id), b.kind, b.position, b.rounds, b.rest_seconds, b.cap_seconds, b.label);
      blockMap.set(b.id, Number(row.lastInsertRowid));
    }

    const exerciseMap = new Map();
    current = 'copy exercises';
    for (const x of stmt('SELECT * FROM workout_plan_exercises WHERE plan_id = ? ORDER BY id').all(source.id)) {
      const row = stmt(
        `INSERT INTO workout_plan_exercises
           (plan_id, block_id, exercise_id, exercise_name_snapshot, position, target_metric, load_mode,
            target_sets, target_reps_min, target_reps_max, target_seconds, target_distance_m,
            target_weight_kg, target_weight_entry_unit, target_weight_entry_value,
            target_percent_1rm, target_rpe, rest_seconds, tempo, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        planId, blockMap.get(x.block_id), x.exercise_id, x.exercise_name_snapshot, x.position,
        x.target_metric, x.load_mode, x.target_sets, x.target_reps_min, x.target_reps_max,
        x.target_seconds, x.target_distance_m, x.target_weight_kg, x.target_weight_entry_unit,
        x.target_weight_entry_value, x.target_percent_1rm, x.target_rpe, x.rest_seconds,
        x.tempo, x.notes,
      );
      exerciseMap.set(x.id, Number(row.lastInsertRowid));
    }

    current = 'copy set targets';
    let targets = 0;
    for (const s of stmt('SELECT * FROM workout_plan_set_targets WHERE plan_id = ? ORDER BY id').all(source.id)) {
      stmt(
        `INSERT INTO workout_plan_set_targets
           (plan_id, exercise_row_id, set_index, set_kind, target_reps, target_seconds,
            target_distance_m, target_weight_kg, target_weight_entry_unit, target_weight_entry_value,
            target_percent_1rm, target_rpe, rest_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        planId, exerciseMap.get(s.exercise_row_id), s.set_index, s.set_kind, s.target_reps,
        s.target_seconds, s.target_distance_m, s.target_weight_kg, s.target_weight_entry_unit,
        s.target_weight_entry_value, s.target_percent_1rm, s.target_rpe, s.rest_seconds,
      );
      targets += 1;
    }

    return {
      ok: true,
      planId,
      copied: { days: dayMap.size, blocks: blockMap.size, exercises: exerciseMap.size, targets },
    };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Copy days within one plan — "duplicate this day", or "copy week 1 into week 2".
 *
 * THE TRAP, recorded before this was written: `trg_plan_day_in_cycle_ins` requires
 * `day_index < cycle_days`, so copying a 7-day week into "week 2" is NOT an insert — it is a CYCLE
 * CHANGE to 14 days, which re-dates every future occurrence of the plan. The transaction therefore
 * grows the cycle itself when it has to, and REPORTS that it did, so the route can tell the coach
 * rather than letting them discover it from a shifted calendar.
 *
 * One transaction for the same reason the clone is: a copied day whose exercises did not make it is
 * worse than no copy at all.
 */
export function copyDaysTx({ planId, coachUserId, dayIds, targetOffset }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the plan (ownership)';
    const plan = stmt(
      `SELECT p.id, p.cycle_days FROM workout_plans p
        WHERE p.id = ? AND p.author_user_id = ? AND p.archived_at IS NULL
          AND (p.coach_client_id IS NULL OR EXISTS (
                SELECT 1 FROM coach_clients cc
                 WHERE cc.id = p.coach_client_id AND cc.coach_id = ? AND cc.status = 'active'))`,
    ).get(planId, coachUserId, coachUserId);
    if (!plan) return { ok: false, reason: 'plan' };

    current = 'SELECT the source days';
    const placeholders = dayIds.map(() => '?').join(',');
    const sources = stmt(
      `SELECT * FROM workout_plan_days WHERE plan_id = ? AND id IN (${placeholders}) ORDER BY day_index, slot`,
    ).all(planId, ...dayIds);
    // A day id from another plan simply is not in the result. Reporting the mismatch rather than
    // silently copying fewer days means the UI can say so instead of showing a partial week.
    if (sources.length !== dayIds.length) return { ok: false, reason: 'days' };

    const highest = Math.max(...sources.map((d) => d.day_index + targetOffset));
    let cycleDays = plan.cycle_days;
    let cycleGrewTo = null;

    // EVERY CHECK THAT CAN RETURN AN ERROR RUNS BEFORE THE FIRST WRITE. That is ADR-0005, and this
    // function used to break it: the cycle grew FIRST, then the occupied-slot loop below could
    // `return { ok: false }` — and better-sqlite3 COMMITS ON RETURN, so the cycle growth persisted
    // while the route reported a failure and copied nothing.
    //
    // The consequence was not cosmetic. Growing a plan's cycle from 7 to 14 RE-DATES EVERY FUTURE
    // OCCURRENCE for that client (the schedule is `starts_on + k*cycle_days + day_index`), so a
    // refused copy silently moved the client's whole schedule. Found by `check-worker-tx`, the gate
    // written to enforce this ADR rather than remember it.
    const needed = highest >= cycleDays ? highest + 1 : null;
    if (needed !== null && needed > 56) return { ok: false, reason: 'cycle-too-long' };

    // Any target slot that is already occupied. Refusing beats overwriting: a coach copying a week
    // onto a week they had already written would otherwise lose the second one with no warning.
    current = 'check the destination slots';
    for (const d of sources) {
      const taken = stmt(
        'SELECT 1 FROM workout_plan_days WHERE plan_id = ? AND day_index = ? AND slot = ?',
      ).get(planId, d.day_index + targetOffset, d.slot);
      if (taken) return { ok: false, reason: 'occupied', at: d.day_index + targetOffset };
    }

    // ── from here on, nothing may conditionally return ──────────────────────────────────────────
    if (needed !== null) {
      current = 'grow the cycle';
      stmt('UPDATE workout_plans SET cycle_days = ?, updated_at = unixepoch() WHERE id = ?').run(needed, planId);
      cycleDays = needed;
      cycleGrewTo = needed;
    }

    let copied = 0;
    for (const d of sources) {
      current = 'copy the day';
      const newDay = stmt(
        `INSERT INTO workout_plan_days (plan_id, day_index, slot, name, notes, is_rest, est_minutes, start_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(planId, d.day_index + targetOffset, d.slot, d.name, d.notes, d.is_rest, d.est_minutes, d.start_time);
      const newDayId = Number(newDay.lastInsertRowid);

      const blockMap = new Map();
      current = 'copy the blocks';
      for (const b of stmt('SELECT * FROM workout_plan_blocks WHERE day_id = ? ORDER BY id').all(d.id)) {
        const row = stmt(
          `INSERT INTO workout_plan_blocks (plan_id, day_id, kind, position, rounds, rest_seconds, cap_seconds, label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(planId, newDayId, b.kind, b.position, b.rounds, b.rest_seconds, b.cap_seconds, b.label);
        blockMap.set(b.id, Number(row.lastInsertRowid));
      }

      current = 'copy the exercises';
      for (const [oldBlock, newBlock] of blockMap) {
        for (const x of stmt('SELECT * FROM workout_plan_exercises WHERE block_id = ? ORDER BY id').all(oldBlock)) {
          stmt(
            `INSERT INTO workout_plan_exercises
               (plan_id, block_id, exercise_id, exercise_name_snapshot, position, target_metric, load_mode,
                target_sets, target_reps_min, target_reps_max, target_seconds, target_distance_m,
                target_weight_kg, target_weight_entry_unit, target_weight_entry_value,
                target_percent_1rm, target_rpe, rest_seconds, tempo, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            planId, newBlock, x.exercise_id, x.exercise_name_snapshot, x.position, x.target_metric,
            x.load_mode, x.target_sets, x.target_reps_min, x.target_reps_max, x.target_seconds,
            x.target_distance_m, x.target_weight_kg, x.target_weight_entry_unit,
            x.target_weight_entry_value, x.target_percent_1rm, x.target_rpe, x.rest_seconds,
            x.tempo, x.notes,
          );
        }
      }
      copied += 1;
    }

    return { ok: true, copied, cycleGrewTo, cycleDays };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Numbered migrations, gated by A LEDGER OF WHAT HAS ACTUALLY BEEN APPLIED.
 *
 * The version bump happens INSIDE the same transaction as the migration body: if the process
 * dies mid-file, the whole file rolls back together with the bump, so the next boot re-applies
 * it cleanly. A bump outside the transaction can leave a schema that claims to be newer than
 * it is — which is unrecoverable without manual surgery.
 *
 * ═══ WHY A LEDGER AND NOT `user_version` ═══════════════════════════════════════════════════════
 *
 * This loop used to be `if (version <= current) continue` — a HIGH-WATER MARK. It tracks one
 * number, so it cannot tell "already applied" apart from "numbered below something that was".
 *
 * That is not theoretical. Phase 5's review cut the coach marketplace and RESERVED 020 for it;
 * Phase 6 would ship 021. The moment 021 committed, the 020 file written afterwards would be
 * `20 <= 21` and skipped FOREVER — no error, no log line, no failure until the first query hit a
 * table that was never created.
 *
 * MEASURED, NOT INFERRED. A throwaway database was given 019 and 021, then 020 was added:
 *
 *     first run:  applied 19, 21 → user_version 21
 *     second run: applied (nothing) → user_version 21
 *     t20_marketplace exists: false
 *
 * The ledger fixes the class rather than the instance. A file is applied when its version is not
 * in `schema_migrations`, whatever its number, so reserving a number is safe again and so is
 * inserting a migration into a gap.
 *
 * OUT-OF-ORDER APPLICATION IS REPORTED, NOT REFUSED. A file numbered below the highest applied one
 * is applied — silently skipping it is strictly worse — but it comes back in `outOfOrder` so the
 * caller can say so out loud. Refusing would recreate the original problem wearing an error
 * message: the operator's only move would be renumbering, which is exactly the manual discipline
 * that failed here.
 *
 * `user_version` is still bumped, because verify-schema and the probes read it and because a
 * database should still be able to say how far along it is without a join.
 */
export function migrate({ files }) {
  const conn = getDb();
  const applied = [];
  const outOfOrder = [];
  let currentFile = null;

  // The ledger is RUNNER INFRASTRUCTURE, not schema, so it is created here rather than in a
  // numbered file — a migration that creates the thing that decides which migrations run has an
  // ordering problem of its own. It also leaves 020 genuinely free.
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  // BACKFILL, ONCE. An existing database has no ledger but a truthful `user_version`, so every
  // file at or below it is already applied and must not run again. Reading the mark for THIS and
  // nothing else is the last thing it is trusted with.
  const mark = conn.pragma('user_version', { simple: true });
  if (conn.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n === 0 && mark > 0) {
    const seed = conn.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)');
    for (const { version } of files) if (version <= mark) seed.run(version);
  }

  const isApplied = conn.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const record = conn.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)');

  for (const { version, sql } of files) {
    currentFile = version;
    if (isApplied.get(version)) continue;
    const current = conn.pragma('user_version', { simple: true });
    if (version < current) outOfOrder.push(version);
    // READ THE MARK BEFORE THE BODY RUNS, and this line is a bug fix rather than a style choice.
    //
    // Every migration file in this project ends with its own `PRAGMA user_version = N;`, so
    // `conn.exec(sql)` sets the mark itself. Reading it AFTER exec therefore reads what the FILE
    // just wrote, not what the database was at — so `Math.max` compared 20 against 20 and the
    // late-020 case reported `user_version 20` on a schema that was at 21.
    //
    // Caught by running it: the probe applied a real 020 to the real database and the CLI printed
    // `applied 20 → user_version 20`. Two mechanisms were setting one value and I had guarded the
    // wrong one.
    const before = conn.pragma('user_version', { simple: true });

    const tx = conn.transaction(() => {
      conn.exec(sql);
      // The ledger row goes in the SAME transaction as the body, for the reason the version bump
      // does: a file that ran but was not recorded would run again next boot, against a schema it
      // has already changed.
      record.run(version);
      // pragma cannot be parameterized; `version` comes from the filename, validated by the
      // caller against /^\d+/ before it ever reaches here.
      //
      // MAX of what the database was and what this file claims — never assignment. An out-of-order
      // file must not drag the mark BACKWARDS, or every probe that reads `user_version` believes
      // the schema regressed.
      conn.pragma(`user_version = ${Math.max(before, version)}`);
    });
    try { tx.immediate(); } catch (err) { return rethrow(err, `migration ${currentFile}`); }
    applied.push(version);
  }
  return { applied, outOfOrder, version: conn.pragma('user_version', { simple: true }) };
}

/**
 * Send a message, and tell the other party — as ONE act.
 *
 * A NAMED transaction because these two writes must not be separable. Split across two pool calls
 * there is a window in which a message exists that nobody has been told about, and the recipient's
 * badge never catches up: nothing recomputes it, because a notification is an event rather than a
 * derived count. A message that arrives silently is worse than one that fails to send.
 *
 * THE CONVERSATION IS RE-READ INSIDE THE TRANSACTION, not trusted from the route. Not because the
 * route's check is wrong — it is the same predicate — but because this is where the sender, the
 * block state and the recipient are all decided, and deciding them twice in two places is the
 * drift this codebase keeps deleting. `tx.immediate()` takes the write lock at BEGIN, so the read
 * and the insert cannot be interleaved.
 *
 * EVERY early return happens BEFORE the first write (ADR-0005): better-sqlite3 commits on return,
 * so a conditional return after an insert would leave the message sent and the caller told it
 * failed. `check-worker-tx` now enforces that, after it caught a live violation elsewhere.
 */
export function sendMessageTx({ conversationId, senderId, body, attachment }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the conversation (ownership + block state)';
    // The LINK's status is what authorises, not the denormalised pair: an archived relationship
    // must stop accepting messages on the very next request, with nothing having to remember.
    const conv = stmt(
      `SELECT c.id, c.coach_id, c.client_id, c.blocked_at
         FROM conversations c
         JOIN coach_clients cc ON cc.id = c.coach_client_id
        WHERE c.id = ? AND (c.coach_id = ? OR c.client_id = ?) AND cc.status = 'active'`,
    ).get(conversationId, senderId, senderId);

    // Not yours, never existed, or the relationship is over. One answer for all three.
    if (!conv) return { outcome: 'missing' };
    if (conv.blocked_at != null) return { outcome: 'blocked' };

    const recipientId = conv.coach_id === senderId ? conv.client_id : conv.coach_id;

    // ── from here on, nothing may conditionally return ─────────────────────────────────────────
    current = 'INSERT the message';
    const message = stmt(
      'INSERT INTO messages (conversation_id, sender_id, sender_is_coach, body) VALUES (?, ?, ?, ?)',
    ).run(conversationId, senderId, conv.coach_id === senderId ? 1 : 0, body);
    const messageId = Number(message.lastInsertRowid);

    if (attachment) {
      current = 'INSERT the attachment';
      stmt(
        `INSERT INTO message_attachments (message_id, storage_key, mime, bytes, duration_seconds)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(messageId, attachment.storageKey, attachment.mime, attachment.bytes, attachment.durationSeconds ?? null);
    }

    current = 'INSERT the recipient notification';
    // The title is written HERE, by the server, from the sender's own name. Nothing the sender
    // typed reaches the notification — that is the leak defence, and it is a property of this code
    // path rather than a promise, because no route accepts notification text.
    const senderName = stmt('SELECT email FROM users WHERE id = ?').get(senderId)?.email ?? '';
    stmt(
      `INSERT INTO notifications (user_id, coach_client_id, type, title, link_path)
       SELECT ?, c.coach_client_id, 'chat.message', ?, '/chat/' || c.id
         FROM conversations c WHERE c.id = ?`,
    ).run(recipientId, senderName.split('@')[0], conversationId);

    return { outcome: 'sent', messageId, recipientId };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Open the conversation for a link, or hand back the one that exists.
 *
 * `INSERT ... SELECT ... WHERE` rather than a check followed by a write: `VALUES` admits no
 * ownership predicate, and the check-then-write pair has a window this does not. The same shape as
 * every other create in this codebase.
 *
 * Idempotent by construction — `conversations.coach_client_id` is UNIQUE, so the second caller
 * inserts nothing and reads the same row. Two people opening a chat at once is the ordinary case,
 * not an error.
 */
export function openConversationTx({ linkId, userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'INSERT the conversation through the link';
    stmt(
      // The coach's name is SNAPSHOTTED at creation, so the thread still says who it was with
      // after they delete their account — see 014, which exists because a departing coach was
      // otherwise taking the client's entire history with them.
      `INSERT OR IGNORE INTO conversations (coach_client_id, coach_id, client_id, coach_name_snapshot)
       SELECT cc.id, cc.coach_id, cc.client_id, (SELECT u.email FROM users u WHERE u.id = cc.coach_id)
         FROM coach_clients cc
        WHERE cc.id = ? AND (cc.coach_id = ? OR cc.client_id = ?) AND cc.status = 'active'`,
    ).run(linkId, userId, userId);

    current = 'SELECT the conversation';
    const conv = stmt(
      `SELECT c.id, c.coach_id, c.client_id, c.blocked_at, c.last_message_at
         FROM conversations c
         JOIN coach_clients cc ON cc.id = c.coach_client_id
        WHERE c.coach_client_id = ? AND (c.coach_id = ? OR c.client_id = ?) AND cc.status = 'active'`,
    ).get(linkId, userId, userId);

    // The link was not theirs, or not active. Indistinguishable from one that never existed.
    return conv ? { outcome: 'ok', conversation: conv } : { outcome: 'missing' };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

export function readMigration({ path }) {
  return readFileSync(path, 'utf8');
}


/* ═══ COINS (019) ═══════════════════════════════════════════════════════════════════════════════
 *
 * Three named transactions, because every one of them is a money movement and the owner's rule is
 * that business-critical writes never go through the generic `writeTx`.
 *
 * They share one shape, and the shape is ADR-0005:
 *
 *   1. Everything that can produce an ERROR RESULT happens before the first write. A
 *      `.transaction()` COMMITS ON RETURN — only a throw rolls back — so a function that writes
 *      and then decides it should not have has already committed.
 *   2. After the first write there is at most one conditional return, and it is a
 *      `changes === 0` probe on a guarded INSERT, which `check-worker-tx.mjs` exempts precisely
 *      because nothing was written.
 *   3. Anything genuinely impossible after that is a THROW, which rolls back.
 *
 * And one more, which is the answer to the defect the adversarial review found in every candidate:
 * THE RESULT IS READ BACK OFF THE STORED ROWS BY ONE CLOSURE THAT BOTH THE FRESH AND THE REPLAY
 * PATH CALL. A replayed response is byte-identical to the original by construction rather than by
 * discipline. One design's fresh path reported a number from a JS variable it had never SELECTed
 * while its replay path reported the true value off the row — same key, two different receipts,
 * and the wrong one written to an append-only audit log.
 *
 * The guard is always INSIDE the INSERT. The read above it exists only so the client gets a 409
 * with real numbers instead of a rolled-back generic 400; `tx.immediate()` takes the single write
 * lock at BEGIN, so the read and the write cannot disagree.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Buy one store item.
 *
 * WHAT THE CLIENT SENDS: an item id, an idempotency key, and the price it was SHOWN. It does not
 * send an amount, a balance, a user id or an entitlement, and none is accepted. The price it does
 * send can only make the purchase FAIL — it is an agreement assertion, never the amount. It is
 * MANDATORY: a candidate design made it optional and the reviewer's finding stands, that an
 * omitted agreement field is a surprise charge waiting for the first price change.
 *
 * THE KEY IS COMPOSED BY THE SERVER: `buy:<userId>:<clientKey>`. ':' is excluded by the route's
 * zod regex, so a client can never occupy a server-minted slot; the `buy:` scope means the same
 * client string used on the admin endpoint is a DIFFERENT operation rather than a false replay or
 * an unexplained 400; and the actor segment means one principal cannot squat another's key.
 *
 * ONE CONSTRUCTION SITE FOR THE ANSWER. `receipt()` reads the stored rows and is called by BOTH
 * the fresh path and the replay path, so a replayed response is byte-identical to the original by
 * construction rather than by discipline. This is the direct fix for the defect where one design's
 * fresh path reported commission 0 from a JS variable that was never SELECTed while its replay
 * path reported the true value off the row — same key, two different receipts, and the wrong one
 * written to an append-only audit log.
 *
 * ADR-0005. Every check that can produce an error RESULT runs before the first write. After the
 * marker there is exactly one conditional return — the `changes === 0` probe on the guarded
 * receipt insert, which is the exemption check-worker-tx.mjs:68-70 grants because nothing was
 * written. Everything after that is unconditional or a THROW, which rolls back.
 *
 * THE GUARD IS INSIDE THE INSERT. `w.balance_minor >= i.price_minor`, on the balance the database
 * holds. The pre-read above it exists only so the client gets a 409 with real numbers instead of a
 * rolled-back generic 400; under tx.immediate() the write lock is taken at BEGIN, so the two
 * cannot disagree (worker.js:236-239).
 */
export function purchaseStoreItemTx({
  userId, itemId, expectedPriceMinor, idempotencyKey, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;
  const writeUid = `buy:${userId}:${idempotencyKey}`;

  const tx = conn.transaction(() => {
    // Defined before anything else so its `return` is textually above the first write and the
    // ADR-0005 gate never has to reason about it. It only reads.
    const receipt = (purchaseId, replayed) => {
      current = 'SELECT the receipt';
      const row = stmt(
        `SELECT p.id AS purchaseId, p.item_id AS itemId, p.sku_snapshot AS sku,
                p.title_snapshot AS title, p.entitlement_key AS entitlementKey,
                p.price_minor_snapshot AS pricePaidMinor, p.created_at AS purchasedAt,
                l.id AS ledgerId,
                (SELECT e.id FROM coin_entitlements e
                  WHERE e.purchase_id = p.id AND e.revoked_at IS NULL) AS entitlementId,
                (SELECT w.balance_minor FROM coin_wallets w
                  WHERE w.user_id = p.user_id) AS balanceMinor
           FROM coin_purchases p
           JOIN coin_ledger l ON l.reason_key = 'store.purchase'
                            AND l.ref_type = 'coin_purchase' AND l.ref_id = p.id
          WHERE p.id = ?`,
      ).get(purchaseId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error runs BEFORE the first write (ADR-0005) ────────────

    // THE REPLAY PROBE, against the ONE key namespace. Because the stored key encodes the scope
    // and the actor, a hit here is necessarily this user's own prior purchase — so the only
    // remaining question is whether it bought the same thing.
    current = 'SELECT the prior attempt (idempotency)';
    const prior = stmt(
      `SELECT l.ref_id AS purchaseId, p.item_id AS itemId
         FROM coin_ledger l
         LEFT JOIN coin_purchases p ON p.id = l.ref_id
        WHERE l.user_id = ? AND l.idempotency_key = ?`,
    ).get(userId, writeUid);
    if (prior && prior.itemId !== itemId) {
      // Same key, different intent — the third case of the write_uid trichotomy, and the one the
      // review found every candidate design getting wrong. 409, never a second effect.
      return { outcome: 'key_reused', storedPurchaseId: prior.purchaseId, storedItemId: prior.itemId };
    }
    if (prior) return receipt(prior.purchaseId, true);

    // Availability is in the predicate, so a miss is ONE answer for every reason: never existed,
    // inactive, delisted. Object-level miss is 404, never 403.
    current = 'SELECT the item';
    const item = stmt(
      `SELECT id, sku, title, price_minor, entitlement_key
         FROM coin_store_items
        WHERE id = ? AND active = 1 AND delisted_at IS NULL`,
    ).get(itemId);
    if (!item) return { outcome: 'missing' };

    // The agreement check. It can ONLY cause a failure; it is never used as the amount.
    if (expectedPriceMinor !== item.price_minor) {
      return { outcome: 'price_changed', priceMinor: item.price_minor };
    }

    current = 'SELECT a live entitlement';
    const owned = stmt(
      `SELECT id FROM coin_entitlements
        WHERE user_id = ? AND entitlement_key = ? AND revoked_at IS NULL`,
    ).get(userId, item.entitlement_key);
    // The authoritative control is coin_entitlements_live_uidx, which makes two concurrent buys
    // impossible; this read only turns the constraint into a sentence.
    if (owned) return { outcome: 'already_owned', entitlementId: owned.id };

    current = 'SELECT the wallet';
    const wallet = stmt('SELECT balance_minor FROM coin_wallets WHERE user_id = ?').get(userId);
    if (!wallet) return { outcome: 'missing' };
    if (wallet.balance_minor < item.price_minor) {
      return { outcome: 'insufficient', balanceMinor: wallet.balance_minor, priceMinor: item.price_minor };
    }

    // ── from here on, nothing may conditionally return ─────────────────────────────────────────

    // Price, sku and title are read from the item INSIDE the statement (015's nutrition rule: the
    // client sends an id, the server copies its own numbers in) and `trg_coin_purchase_truthful`
    // re-derives them. `w.balance_minor >= i.price_minor` is the funds guard.
    current = 'INSERT coin_purchases (the guard)';
    const bought = stmt(
      `INSERT INTO coin_purchases
         (user_id, item_id, sku_snapshot, title_snapshot, entitlement_key,
          price_minor_snapshot, request_id)
       SELECT w.user_id, i.id, i.sku, i.title, i.entitlement_key, i.price_minor, ?
         FROM coin_store_items i
         JOIN coin_wallets w ON w.user_id = ?
        WHERE i.id = ? AND i.active = 1 AND i.delisted_at IS NULL
          AND w.balance_minor >= i.price_minor`,
    ).run(requestId, userId, itemId);
    if (bought.changes === 0) {
      // Nothing was written, so returning here cannot leave a half-committed state. Every other
      // predicate in that WHERE was established above under the same write lock and none of them
      // can move, so this means the funds guard and nothing else. (Note there is no availability
      // WINDOW on an item in this migration — a candidate design had one, evaluated unixepoch()
      // per statement, and answered `insufficient` to a full wallet whose item had just expired.)
      return { outcome: 'insufficient', balanceMinor: wallet.balance_minor, priceMinor: item.price_minor };
    }
    const purchaseId = Number(bought.lastInsertRowid);

    // The debit. Amount read from the receipt, guard repeated in its own WHERE rather than
    // inherited from the statement above.
    current = 'INSERT coin_ledger (the debit)';
    const paid = stmt(
      `INSERT INTO coin_ledger
         (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key,
          actor_user_id, request_id)
       SELECT p.user_id, -p.price_minor_snapshot, 'store.purchase', 'coin_purchase', p.id, ?,
              p.user_id, p.request_id
         FROM coin_purchases p
         JOIN coin_wallets w ON w.user_id = p.user_id
        WHERE p.id = ? AND w.balance_minor >= p.price_minor_snapshot`,
    ).run(writeUid, purchaseId);
    // Impossible: the receipt insert proved the funds one statement ago under the same lock. A
    // THROW rather than a return, because a return would COMMIT a receipt with no payment behind
    // it — which is the exact ADR-0005 bug this project already paid for once.
    if (paid.changes !== 1) throw new Error('the debit did not match the receipt that authorised it');

    current = 'INSERT coin_entitlements';
    stmt(
      `INSERT INTO coin_entitlements (user_id, item_id, purchase_id, entitlement_key)
       SELECT p.user_id, p.item_id, p.id, p.entitlement_key
         FROM coin_purchases p WHERE p.id = ?`,
    ).run(purchaseId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'coin.store.purchase', 'coin_purchase', ?, ?, ?, ?)`,
    ).run(
      userId, purchaseId,
      // Read back off the stored row, never rebuilt from a JS variable — the audit trail and the
      // ledger must not be able to disagree.
      JSON.stringify(
        stmt(
          `SELECT item_id AS itemId, sku_snapshot AS sku, entitlement_key AS entitlementKey,
                  price_minor_snapshot AS priceMinor
             FROM coin_purchases WHERE id = ?`,
        ).get(purchaseId),
      ),
      requestId, ip,
    );

    return receipt(purchaseId, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Award an achievement and pay for it.
 *
 * THERE IS NO CLIENT-FACING CLAIM ENDPOINT, and that is the design rather than an omission.
 * Earning is never client-initiated: this is called from the server's own paths, so "claim a badge
 * I did not earn" has no request to forge. The strongest anti-mint control in this subsystem is
 * the endpoint that does not exist.
 *
 * IDEMPOTENT WITHOUT A CLIENT TOKEN, and that is the house test rather than laziness: a token is
 * needed when a request carries VALUES two attempts could disagree about (worker.js:461-465).
 * This one carries none — the reward comes from the catalogue and the natural key is
 * (user, achievement). voidSetTx and openConversationTx are idempotent on the same grounds.
 *
 * The ledger key is SERVER-MINTED as `ach:<unlock id>`. It contains ':', which every route's zod
 * regex forbids, so a client cannot pre-register it — the defect where a user squatted
 * 'ach-0000000123' with a purchase and made their own future payout abort forever, deterministically,
 * with no recovery path. It is also derived from a numeric id rather than the achievement key, so
 * no reference-table string can ever collide with the key column's length bound.
 *
 * TWO INDEPENDENT DOUBLE-AWARD GUARDS, both in the database: user_achievements_once_uidx on
 * (user, achievement) and coin_ledger_ref_uidx on (reason, ref_type, ref_id). One constraint per
 * requirement — the workout_pr_events discipline, no third mechanism invented here.
 *
 * A ZERO-REWARD ACHIEVEMENT IS A PREDICATE, NOT A BRANCH. The payment statement carries
 * `reward_minor_snapshot > 0`, and its row count is ASSERTED against the reward read before the
 * first write. A candidate design had the predicate and never read `changes`, so a wallet in the
 * wrong state consumed the natural key, paid nothing, returned 200 with the reward it had not
 * paid, and made the coins unrecoverable forever. An unread `changes` on a money statement is the
 * bug; the assertion is the fix.
 */
export function unlockAchievementTx({ userId, achievementKey, sourceType = null, sourceId = null, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const result = (unlockId, replayed) => {
      current = 'SELECT the unlock';
      const row = stmt(
        `SELECT ua.id AS unlockId, ua.achievement_key AS achievementKey,
                ua.reward_minor_snapshot AS rewardMinor, ua.unlocked_at AS unlockedAt,
                (SELECT l.id FROM coin_ledger l
                  WHERE l.reason_key = 'achievement.reward'
                    AND l.ref_type = 'user_achievement' AND l.ref_id = ua.id) AS ledgerId,
                (SELECT w.balance_minor FROM coin_wallets w
                  WHERE w.user_id = ua.user_id) AS balanceMinor
           FROM user_achievements ua WHERE ua.id = ?`,
      ).get(unlockId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error runs BEFORE the first write (ADR-0005) ────────────

    current = 'SELECT the prior award (replay)';
    const prior = stmt(
      'SELECT id FROM user_achievements WHERE user_id = ? AND achievement_key = ?',
    ).get(userId, achievementKey);
    if (prior) return result(prior.id, true);

    current = 'SELECT the achievement (catalogue)';
    const achievement = stmt(
      'SELECT key, reward_minor FROM achievements WHERE key = ? AND active = 1',
    ).get(achievementKey);
    if (!achievement) return { outcome: 'missing' };

    current = 'SELECT the wallet';
    const wallet = stmt('SELECT user_id FROM coin_wallets WHERE user_id = ?').get(userId);
    if (!wallet) return { outcome: 'missing' };

    const expectedPaidRows = achievement.reward_minor > 0 ? 1 : 0;

    // ── from here on, nothing may conditionally return ─────────────────────────────────────────

    // The reward is copied from the catalogue INSIDE the statement, so no caller can name an
    // amount, and trg_user_achievement_truthful proves it again. A plain INSERT, not OR IGNORE:
    // under a concurrent unlock the unique index must ABORT so the whole transaction rolls back —
    // swallowing the conflict would leave a paid ledger row with no achievement behind it.
    current = 'INSERT user_achievements';
    const unlocked = stmt(
      `INSERT INTO user_achievements
         (user_id, achievement_key, source_type, source_id, reward_minor_snapshot)
       SELECT ?, a.key, ?, ?, a.reward_minor
         FROM achievements a WHERE a.key = ? AND a.active = 1`,
    ).run(userId, sourceType, sourceId, achievementKey);
    if (unlocked.changes !== 1) throw new Error('the achievement was retired under the write lock');
    const unlockId = Number(unlocked.lastInsertRowid);

    current = 'INSERT coin_ledger (the reward)';
    const paid = stmt(
      `INSERT INTO coin_ledger
         (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key,
          actor_user_id, request_id)
       SELECT ua.user_id, ua.reward_minor_snapshot, 'achievement.reward', 'user_achievement',
              -- PADDED TO TEN DIGITS, and the story of this line is the point.
              --
              -- The column's CHECK demands 8..96 characters. The unpadded form was FIVE, so the first
              -- achievement anybody unlocked aborted. That was found once, in the migration
              -- comment, and fixed there — and in verify-019, which carries its own copy of this
              -- SQL. Both copies were corrected and THIS ONE, the only one that runs, was not.
              --
              -- So the probe passed while the production path was broken, which is the exact rule
              -- written down one phase earlier: an audit must not carry its own copy of what it
              -- audits. It was caught by the evaluator failing silently in a fire-and-forget
              -- catch, which is the second lesson in one line.
              ua.id, 'ach:' || printf('%010d', ua.id), NULL, ?
         FROM user_achievements ua
        WHERE ua.id = ? AND ua.reward_minor_snapshot > 0`,
    ).run(requestId, unlockId);
    // THE ASSERTION, and it is the whole reason a zero reward is allowed to exist. A throw rolls
    // the unlock back too, so a later evaluation retries cleanly instead of finding the natural
    // key spent and the coins gone.
    if (paid.changes !== expectedPaidRows) throw new Error('the reward did not follow its unlock');

    // actor NULL — 001:71's "NULL = the system itself". Nobody did this; the training did.
    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (NULL, 'coin.achievement.award', 'user_achievement', ?, ?, ?, NULL)`,
    ).run(
      unlockId,
      JSON.stringify({ userId, achievementKey, rewardMinor: achievement.reward_minor }),
      requestId,
    );

    return result(unlockId, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Move a wallet by hand. The most heavily gated write in the product, because it is the only one
 * where a human chooses an amount.
 *
 * THE ROLE RE-CHECK LIVES HERE, TWICE, AND IT FAILS CLOSED. requireRole('admin') reads a JWT claim
 * that can be fifteen minutes stale. assertAdmin() (admin/routes.js:27-36) reads the database but
 * in a SEPARATE pool call, which is a TOCTOU against a concurrent demotion — fine for approving an
 * exercise, not fine for minting currency. So the role AND `session_version` are read under the
 * same write lock as the movement, before the first write, and the guarded INSERT's own JOIN
 * repeats both so the WRITE is gated rather than merely preceded by a check that passed.
 *
 * NOTE THE MISSING `!= null`. A candidate design wrote
 * `if (actorSessionVersion != null && actor.session_version !== actorSessionVersion)` — which
 * SKIPS THE ENTIRE CHECK when the argument is absent, on the one endpoint that creates currency
 * from nothing, silently, with the audit row still written. Here an omitted argument is
 * `undefined !== <number>` and the answer is forbidden.
 *
 * THE REPLAY PROBE IS SCOPED TO THIS OPERATION, and that is not paranoia. The composed key is
 * `adj:<adminId>:<clientKey>` and it is stored on the TARGET's row, so it cannot collide with the
 * target's own purchase keys (`buy:<userId>:...`) — the defect where a support clawback keyed on a
 * ticket id matched the victim's own store debit, returned 200 replayed, moved nothing, and wrote
 * NO audit row because the return preceded it. The intent comparison includes the NOTE as well as
 * the amount: two different corrections of the same size are two operations.
 *
 * THE SIGN IS NOT A JS DECISION. The reason is chosen in SQL by a CASE and
 * trg_coin_ledger_reason_shape then refuses the row if the sign and the reason disagree, so a
 * caller that passes a negative amount cannot land on 'admin.credit'.
 *
 * A DEBIT IS GUARDED LIKE ANY OTHER. `w.balance_minor + ? >= 0` covers both directions in one
 * expression. Correcting an over-grant that has already been spent is a business conversation,
 * not a negative balance — and because that rule is a droppable TRIGGER rather than a CHECK, the
 * day it changes is a DROP TRIGGER and not a rebuild of the money table.
 */
export function adminAdjustCoinsTx({
  actorUserId, actorSessionVersion, targetUserId, amountMinor, note,
  idempotencyKey, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;
  const writeUid = `adj:${actorUserId}:${idempotencyKey}`;

  const tx = conn.transaction(() => {
    const result = (entryId, replayed) => {
      current = 'SELECT the entry';
      const row = stmt(
        `SELECT l.id AS entryId, l.amount_minor AS amountMinor, l.note AS note,
                l.created_at AS movedAt,
                (SELECT w.balance_minor FROM coin_wallets w
                  WHERE w.user_id = l.user_id) AS balanceMinor
           FROM coin_ledger l WHERE l.id = ?`,
      ).get(entryId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error runs BEFORE the first write (ADR-0005) ────────────

    current = 'SELECT the actor (DB-side role + session re-check)';
    const actor = stmt(
      'SELECT id, role, session_version FROM users WHERE id = ? AND disabled_at IS NULL',
    ).get(actorUserId);
    if (!actor || actor.role !== 'admin') return { outcome: 'forbidden' };
    if (actor.session_version !== actorSessionVersion) return { outcome: 'forbidden' };

    current = 'SELECT the prior adjustment (idempotency)';
    const prior = stmt(
      `SELECT id, amount_minor, note FROM coin_ledger
        WHERE user_id = ? AND idempotency_key = ?
          AND reason_key IN ('admin.credit', 'admin.debit')`,
    ).get(targetUserId, writeUid);
    if (prior && (prior.amount_minor !== amountMinor || (prior.note ?? null) !== (note ?? null))) {
      return { outcome: 'key_reused', storedAmountMinor: prior.amount_minor, storedNote: prior.note };
    }
    if (prior) return result(prior.id, true);

    current = 'SELECT the target wallet';
    const wallet = stmt(
      `SELECT w.balance_minor FROM coin_wallets w
         JOIN users u ON u.id = w.user_id AND u.disabled_at IS NULL
        WHERE w.user_id = ?`,
    ).get(targetUserId);
    // 404, never 403: an admin probing for account existence still gets the object-level rule.
    if (!wallet) return { outcome: 'missing' };

    const reasonKey = amountMinor > 0 ? 'admin.credit' : 'admin.debit';

    current = 'SELECT the reason ceiling';
    const reason = stmt('SELECT max_minor FROM coin_reasons WHERE key = ? AND active = 1').get(reasonKey);
    if (!reason) return { outcome: 'out_of_bounds' };
    if (amountMinor === 0 || Math.abs(amountMinor) > reason.max_minor) {
      return { outcome: 'out_of_bounds', maxMinor: reason.max_minor };
    }

    if (wallet.balance_minor + amountMinor < 0) {
      return { outcome: 'insufficient', balanceMinor: wallet.balance_minor, amountMinor };
    }

    // ── from here on, nothing may conditionally return ─────────────────────────────────────────

    current = 'INSERT coin_ledger (role, session and balance guards all inside the statement)';
    const moved = stmt(
      `INSERT INTO coin_ledger
         (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key,
          actor_user_id, request_id, note)
       SELECT w.user_id, ?, CASE WHEN ? > 0 THEN 'admin.credit' ELSE 'admin.debit' END,
              NULL, NULL, ?, a.id, ?, ?
         FROM coin_wallets w
         JOIN users a ON a.id = ? AND a.role = 'admin'
                     AND a.session_version = ? AND a.disabled_at IS NULL
        WHERE w.user_id = ? AND w.balance_minor + ? >= 0`,
    ).run(
      amountMinor, amountMinor, writeUid, requestId, note ?? null,
      actorUserId, actorSessionVersion, targetUserId, amountMinor,
    );
    if (moved.changes === 0) {
      // Nothing was written, so committing nothing is a no-op. Every predicate was established
      // above under the same write lock; this is the balance guard.
      return { outcome: 'insufficient', balanceMinor: wallet.balance_minor, amountMinor };
    }
    const entryId = Number(moved.lastInsertRowid);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'coin.admin.adjust', 'user', ?, ?, ?, ?)`,
    ).run(
      actorUserId, targetUserId,
      // READ BACK, NOT RECOMPUTED. The first version of this line built balanceAfterMinor as
      // `wallet.balance_minor + amountMinor` in JavaScript — a second arithmetic of the balance,
      // written into an append-only table, able to disagree with the ledger the moment anything
      // about the recompute changes. It is the same rule the purchase path already followed and
      // the same rule contract 6 states; the admin path simply had not been held to it.
      JSON.stringify({
        ...stmt(
          `SELECT l.id AS entryId, l.amount_minor AS amountMinor, l.note AS note,
                  (SELECT w.balance_minor FROM coin_wallets w WHERE w.user_id = l.user_id)
                    AS balanceAfterMinor
             FROM coin_ledger l WHERE l.id = ?`,
        ).get(entryId),
        balanceBeforeMinor: wallet.balance_minor,
      }),
      requestId, ip,
    );

    return result(entryId, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE COMPOSER — the coach's own profile.
 *
 * Four named transactions rather than one setProfile() with flags, because the four differ in ways
 * a shared helper would have to branch on anyway: publish carries a standing gate and unpublish
 * deliberately does not, listed_at is written only on the publish path and never cleared, and
 * create must leave published_at out of the column list entirely so the publish trigger cannot
 * fire on an INSERT.
 *
 * ADR-0005 governs all four: conn.transaction() COMMITS ON RETURN, so every check that can produce
 * an error result runs above the marker comment, and the only conditional return below it is a
 * changes === 0 probe on the FIRST write.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** The placeholders a specialty list is checked with, padded so the SQL text never varies. */
const SPECIALTY_SLOTS = 6;

/**
 * IS THIS HANDLE FREE FOR THIS ACCOUNT — asked once, in one place.
 *
 * Three questions collapsed into ONE answer on purpose. Reserved, taken and cooling are told apart
 * by nothing the caller can see, because distinguishing them enumerates unpublished profiles and
 * leaks another account's rename timestamp: "unavailable, but not reserved and not taken" is a
 * sentence that means "somebody renamed away from this recently, and here is roughly when".
 *
 * It lives here as a constant because it now has THREE readers — create, rename, and the
 * availability probe the composer calls on every keystroke. Written out three times it would agree
 * on the day it was copied, and the copy that drifted would be the one that says YES.
 *
 * Bind order: handle, handle, handle, userId.
 */
const HANDLE_AVAILABILITY_SQL = `
  SELECT EXISTS (SELECT 1 FROM reserved_handles WHERE handle = ?) AS reserved,
         EXISTS (SELECT 1 FROM coach_profiles   WHERE handle = ?) AS taken,
         EXISTS (SELECT 1 FROM retired_handles t
                  WHERE t.handle = ?
                    AND (t.prev_user_id IS NULL OR t.prev_user_id <> ?)
                    AND t.released_at > unixepoch()
                        - (SELECT value FROM public_policy WHERE key = 'handle_cooldown_s')) AS cooling`;

/** True when the handle cannot be claimed by this account, for any of the three reasons. */
const handleUnavailable = (handle, userId) => {
  const a = stmt(HANDLE_AVAILABILITY_SQL).get(handle, handle, handle, userId);
  return Boolean(a.reserved || a.taken || a.cooling);
};

/**
 * The availability probe the composer's handle field calls as the coach types.
 *
 * Answers ONE boolean and nothing else. Not a reason, not a timestamp, not a suggestion — every
 * additional field is a bit of information about somebody else's account, and this endpoint is
 * reachable by any authenticated coach as fast as the limiter allows.
 *
 * A read, so no transaction: there is nothing here to commit.
 */
export function handleAvailabilityQuery({ userId, handle }) {
  return { available: !handleUnavailable(handle, userId) };
}

/**
 * Create the coach's public profile.
 *
 * published_at, listed_at, verified_at, verified_by, removed_at, removed_by and removal_reason are
 * ABSENT from the INSERT's column list, and that absence is the control: the publish-standing and
 * verified-pair INSERT triggers cannot fire on a row that never sets the columns they watch, so a
 * profile cannot be born published or born verified.
 */
export function createCoachProfileTx({
  userId, handle, displayName, headline, bio, city, specialties, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // (0) ONE response builder, declared first so its return sits textually above every write, and
    //     reading the STORED row rather than the arguments — a view rebuilt from JS variables is a
    //     second account of what was written.
    const view = (replayed) => {
      current = 'SELECT the profile back';
      const row = stmt(
        `SELECT handle, display_name AS displayName, headline, bio_src AS bioSrc, bio_doc AS bioDoc,
                doc_version AS docVersion, city_key AS city, published_at AS publishedAt,
                listed_at AS listedAt, created_at AS createdAt
           FROM coach_profiles WHERE user_id = ?`,
      ).get(userId);
      const keys = stmt(
        'SELECT specialty_key AS key FROM coach_profile_specialties WHERE user_id = ? ORDER BY specialty_key',
      ).all(userId).map((r) => r.key);
      return { outcome: 'applied', replayed, ...row, specialties: keys };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    // (1) REPLAY. coach_profiles.user_id IS the primary key, so the natural key is the idempotency
    //     key and no token is needed — a validated-and-discarded one would be a promise this API
    //     does not keep.
    current = 'SELECT any existing profile';
    const existing = stmt('SELECT handle FROM coach_profiles WHERE user_id = ?').get(userId);
    if (existing && existing.handle === handle) return view(true);
    if (existing) return { outcome: 'profile_exists', handle: existing.handle };

    // (2) THE HANDLE, as ONE outcome from three questions. Reserved, taken and cooling answer
    //     identically on purpose: distinguishing them enumerates unpublished profiles and leaks
    //     another account's rename timestamp.
    current = 'SELECT handle availability';
    if (handleUnavailable(handle, userId)) return { outcome: 'handle_unavailable' };

    // (3) Reference membership. public_cities has no active-flag trigger, so an unknown or retired
    //     key would otherwise surface as an opaque foreign-key failure.
    current = 'SELECT the city';
    if (city !== null) {
      const ok = stmt('SELECT 1 AS ok FROM public_cities WHERE key = ? AND active = 1').get(city);
      if (!ok) return { outcome: 'city_unknown', key: city };
    }

    // (4) Specialties, through a FIXED six-placeholder list padded with NULL. The SQL text never
    //     varies, so one prepared statement is cached forever and no IN clause is ever assembled
    //     from request data.
    current = 'SELECT the specialties';
    if (specialties.length > 0) {
      const padded = [...specialties, ...Array(SPECIALTY_SLOTS - specialties.length).fill(null)];
      const found = stmt(
        'SELECT key FROM coach_specialties WHERE active = 1 AND key IN (?, ?, ?, ?, ?, ?)',
      ).all(...padded).map((r) => r.key);
      const unknown = specialties.find((k) => !found.includes(k));
      if (unknown) return { outcome: 'specialty_unknown', key: unknown };
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'INSERT the profile';
    // INSERT ... SELECT rather than VALUES: the role is re-read from the DATABASE at write time, so
    // an account whose coach role was revoked thirty seconds ago cannot squat a handle on the
    // strength of a token it still holds. VALUES admits no such predicate.
    const created = stmt(
      `INSERT INTO coach_profiles (user_id, handle, display_name, headline,
                                   bio_src, bio_doc, doc_version, city_key)
       SELECT u.id, ?, ?, ?, ?, ?, ?, ?
         FROM users u
        WHERE u.id = ? AND u.disabled_at IS NULL AND u.role IN ('coach','admin')`,
    ).run(handle, displayName, headline, bio.src, bio.doc, bio.version, city, userId);
    if (created.changes === 0) return { outcome: 'not_a_coach' };

    current = 'INSERT the specialties';
    for (const key of specialties) {
      stmt('INSERT INTO coach_profile_specialties (user_id, specialty_key) VALUES (?, ?)').run(userId, key);
    }

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.profile.create', 'coach_profile', ?, ?, ?, ?)`,
    ).run(userId, userId, JSON.stringify({ handle, city, specialties }), requestId, ip);

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Edit the profile. Every field is required and NULL means cleared — a PUT, not a PATCH.
 *
 * That removes absent-versus-null merge semantics from the whole surface, which is where "I
 * cleared my headline and it came back" lives. The handle is NOT here: renaming is its own route
 * with its own cooldown, because it is the one field with consequences for other people.
 */
export function updateCoachProfileTx({
  userId, displayName, headline, bio, city, specialties, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the profile back';
      const row = stmt(
        `SELECT handle, display_name AS displayName, headline, bio_src AS bioSrc, bio_doc AS bioDoc,
                doc_version AS docVersion, city_key AS city, published_at AS publishedAt,
                listed_at AS listedAt, updated_at AS updatedAt
           FROM coach_profiles WHERE user_id = ?`,
      ).get(userId);
      const keys = stmt(
        'SELECT specialty_key AS key FROM coach_profile_specialties WHERE user_id = ? ORDER BY specialty_key',
      ).all(userId).map((r) => r.key);
      return { outcome: 'applied', replayed, ...row, specialties: keys };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────
    //
    // The city and specialty checks in particular MUST be here. They are natural to write after the
    // DELETE that clears the old set, and a conditional return there would COMMIT a profile
    // stripped of its specialties while answering with an error.

    current = 'SELECT the profile';
    const profile = stmt(
      'SELECT user_id FROM coach_profiles WHERE user_id = ? AND removed_at IS NULL',
    ).get(userId);
    if (!profile) return { outcome: 'missing' };

    current = 'SELECT the city';
    if (city !== null) {
      const ok = stmt('SELECT 1 AS ok FROM public_cities WHERE key = ? AND active = 1').get(city);
      if (!ok) return { outcome: 'city_unknown', key: city };
    }

    current = 'SELECT the specialties';
    if (specialties.length > 0) {
      const padded = [...specialties, ...Array(SPECIALTY_SLOTS - specialties.length).fill(null)];
      const found = stmt(
        'SELECT key FROM coach_specialties WHERE active = 1 AND key IN (?, ?, ?, ?, ?, ?)',
      ).all(...padded).map((r) => r.key);
      const unknown = specialties.find((k) => !found.includes(k));
      if (unknown) return { outcome: 'specialty_unknown', key: unknown };
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the profile';
    // All three bio columns move together or none do — two column CHECKs enforce the pairing, and
    // buildBio is what guarantees the triple is coherent before it arrives here.
    const updated = stmt(
      `UPDATE coach_profiles
          SET display_name = ?, headline = ?, bio_src = ?, bio_doc = ?, doc_version = ?,
              city_key = ?, updated_at = unixepoch()
        WHERE user_id = ? AND removed_at IS NULL`,
    ).run(displayName, headline, bio.src, bio.doc, bio.version, city, userId);
    if (updated.changes === 0) return { outcome: 'missing' };

    current = 'DELETE the old specialties';
    stmt('DELETE FROM coach_profile_specialties WHERE user_id = ?').run(userId);

    current = 'INSERT the specialties';
    for (const key of specialties) {
      stmt('INSERT INTO coach_profile_specialties (user_id, specialty_key) VALUES (?, ?)').run(userId, key);
    }

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.profile.update', 'coach_profile', ?, ?, ?, ?)`,
    ).run(userId, userId, JSON.stringify({ city, specialties }), requestId, ip);

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Rename the handle.
 *
 * ═══ THE OWNER KEPT THIS AGAINST THE REVIEW'S ADVICE, SO IT IS FIXED RATHER THAN AVOIDED ═══════
 *
 * Three defects were named. Each is closed by something structural, not by care:
 *
 * IDOR-1 — one account locking thousands of handles a day into a year-long global cooldown while
 *   keeping an exclusive claim on all of them. Closed in the SCHEMA by 023: retirement now keys on
 *   `listed_at`, so an unpublished profile releases its handle immediately and the cheap bulk move
 *   is gone. To lock a handle you must publish under it first, which costs an accepted guidelines
 *   version, an old enough account and a quota slot. The 30-day rename cooldown caps the rest.
 *
 * RACE-5 / REPLAY-10 — a stale tab reverting a rename and burning BOTH handles. Closed twice over.
 *   First, structurally: the handle is ABSENT from the profile PUT, so an ordinary headline edit
 *   cannot carry a handle at all. Second, here: the caller must send the handle it BELIEVES it
 *   currently has. A tab whose belief is out of date is refused with the true current handle, so a
 *   revert is impossible rather than merely unlikely — and a replay of the same rename returns the
 *   original result without writing anything, so it costs no cooldown and leaves no second audit
 *   row.
 *
 * ═══ AND THERE IS NO `changes === 0` PROBE ON THE UPDATE ═══════════════════════════════════════
 *
 * The obvious shape is `UPDATE ... WHERE handle = ?` followed by a probe. It would be dead code.
 * This is an IMMEDIATE transaction, so the write lock is held from the first statement; the row was
 * read INSIDE it, and nothing else can have moved between the read and the write. The probe could
 * not fire under any input.
 *
 * This project deleted a "last admin" count for exactly that reason a week ago. A guard that cannot
 * fire still reads like a safety net, and the next person to relax the check above it will believe
 * something is behind them. The `AND handle = ?` stays in the WHERE clause — it costs nothing and
 * states the intent — but nothing branches on its result.
 */
export function renameCoachHandleTx({ userId, from, to, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the profile back';
      const row = stmt(
        `SELECT handle, listed_at AS listedAt, handle_renamed_at AS handleRenamedAt,
                published_at AS publishedAt
           FROM coach_profiles WHERE user_id = ?`,
      ).get(userId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the profile and its rename eligibility';
    // Read from the VIEW 024 created, which is also what the cooldown TRIGGER reads. One predicate,
    // two readers: when it is wrong it is wrong in both places, rather than the route saying yes
    // and the trigger aborting on a coach who was told to go ahead.
    const p = stmt(
      `SELECT e.handle, e.listed_at AS listedAt, e.too_soon AS tooSoon, e.eligible_at AS eligibleAt,
              c.removed_at AS removedAt
         FROM coach_handle_rename_eligibility e
         JOIN coach_profiles c ON c.user_id = e.user_id
        WHERE e.user_id = ?`,
    ).get(userId);
    if (!p || p.removedAt !== null) return { outcome: 'missing' };

    // REPLAY. Renaming to the handle you already hold is a no-op, not a rename: no write, no
    // cooldown burned, no second audit row. This sits above the staleness check on purpose — the
    // second delivery of a successful request must succeed, and by then `from` is out of date.
    if (p.handle === to) return view(true);

    // STALE. The caller told us which handle it thinks it is renaming FROM. If that is not the
    // handle on the row, this request was composed against a world that has since changed, and
    // applying it would revert somebody's rename and burn both names for a year.
    if (p.handle !== from) return { outcome: 'handle_changed', handle: p.handle };

    // COOLDOWN, asked before availability so a coach who cannot rename at all learns nothing about
    // the handle they were reaching for.
    if (p.tooSoon === 1) return { outcome: 'rename_too_soon', eligibleAt: p.eligibleAt };

    current = 'SELECT handle availability';
    if (handleUnavailable(to, userId)) return { outcome: 'handle_unavailable' };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the handle';
    // The retirement of the OLD handle and the stamping of `handle_renamed_at` are both TRIGGERS.
    // Neither is written here, and that is deliberate: a route that forgot the stamp would silently
    // disable the cooldown, and the route is the thing most likely to be rewritten.
    stmt(
      `UPDATE coach_profiles SET handle = ?, updated_at = unixepoch()
        WHERE user_id = ? AND handle = ? AND removed_at IS NULL`,
    ).run(to, userId, from);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.handle.rename', 'coach_profile', ?, ?, ?, ?)`,
    ).run(userId, userId, JSON.stringify({ from, to, listed: p.listedAt !== null }), requestId, ip);

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Put the profile on the open internet.
 *
 * The standing gate is branched HERE, in a fixed order, so the coach gets a sentence they can act
 * on. The triggers enforce the same rules and would answer publish_denied — every RAISE string in
 * 021 is snake_case exactly so none of them is ever shown to a person.
 *
 * sessionVersion is compared against the token's claim because requireAuth caches it for 30
 * seconds, and a publish is an irreversible push to the open internet. Thirty seconds is nothing
 * for a profile read and everything for the one write a scraper cannot be asked to undo.
 */
export function publishCoachProfileTx({ userId, tokenSv = null, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the profile back';
      const row = stmt(
        `SELECT handle, published_at AS publishedAt, listed_at AS listedAt
           FROM coach_profiles WHERE user_id = ?`,
      ).get(userId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the profile';
    const profile = stmt(
      'SELECT published_at FROM coach_profiles WHERE user_id = ? AND removed_at IS NULL',
    ).get(userId);
    if (!profile) return { outcome: 'missing' };
    if (profile.published_at !== null) return view(true);

    current = 'SELECT publish standing';
    const s = stmt(
      `SELECT
         u.disabled_at IS NULL       AS enabled,
         u.role IN ('coach','admin') AS roleOk,
         u.session_version           AS sessionVersion,
         u.created_at <= unixepoch()
           - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS oldEnough,
         u.created_at
           + (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS eligibleAt,
         EXISTS (SELECT 1 FROM guidelines_acceptances a
                   JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                  WHERE a.user_id = u.id) AS guidelinesOk,
         (SELECT v.version  FROM guidelines_versions v WHERE v.active = 1) AS activeVersion,
         (SELECT v.i18n_key FROM guidelines_versions v WHERE v.active = 1) AS activeI18nKey
       FROM users u WHERE u.id = ?`,
    ).get(userId);

    if (!s) return { outcome: 'missing' };
    if (!s.roleOk) return { outcome: 'not_a_coach' };
    if (!s.enabled) return { outcome: 'account_disabled' };
    if (tokenSv !== null && s.sessionVersion !== tokenSv) return { outcome: 'session_stale' };
    if (!s.guidelinesOk) {
      return { outcome: 'needs_guidelines', activeVersion: s.activeVersion, activeI18nKey: s.activeI18nKey };
    }
    if (!s.oldEnough) return { outcome: 'too_new', eligibleAt: s.eligibleAt };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the profile to published';
    // listed_at is write-once by COALESCE: the directory position a coach earns at their first
    // publish survives every later unpublish, so taking yourself down for a week is not a way to
    // buy the front page back.
    const published = stmt(
      `UPDATE coach_profiles
          SET published_at = unixepoch(),
              listed_at = COALESCE(listed_at, unixepoch()),
              updated_at = unixepoch()
        WHERE user_id = ? AND removed_at IS NULL AND published_at IS NULL`,
    ).run(userId);
    // Every predicate above was established under this same write lock, so zero rows is not a
    // state — it is a contradiction. Returning a cheerful view(true) here would report "already
    // published" with a null publishedAt, which is RACE-8 in the review that produced this file.
    if (published.changes === 0) throw new Error('publishCoachProfileTx: guarded update matched nothing');

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.profile.publish', 'coach_profile', ?, ?, ?, ?)`,
    ).run(userId, userId, JSON.stringify({ published: true }), requestId, ip);

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Take the profile back down.
 *
 * NO STANDING GATE, deliberately. A coach who has lost standing — disabled, role revoked, or who
 * simply has not accepted the guidelines now in force — must still be able to remove themselves
 * from the open internet. Gating the exit on the same conditions as the entrance means the people
 * most likely to want out are the ones who cannot leave.
 *
 * listed_at is untouched, so re-publishing later returns to the same directory position rather
 * than to the top of it.
 */
export function unpublishCoachProfileTx({ userId, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (replayed, wentDark) => {
      current = 'SELECT the profile back';
      const row = stmt(
        `SELECT handle, published_at AS publishedAt, listed_at AS listedAt
           FROM coach_profiles WHERE user_id = ?`,
      ).get(userId);
      return { outcome: 'applied', replayed, postsWentDark: wentDark, ...row };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the profile';
    const profile = stmt(
      'SELECT published_at FROM coach_profiles WHERE user_id = ? AND removed_at IS NULL',
    ).get(userId);
    if (!profile) return { outcome: 'missing' };
    if (profile.published_at === null) return view(true, 0);

    // How many live posts this is about to hide. PUBLIC_POST requires a live profile, so they go
    // dark on the next read with no sweep and no fan-out — and a coach pressing this button
    // deserves to be told it takes their whole catalogue with it.
    current = 'COUNT the posts about to go dark';
    const live = stmt(
      `SELECT COUNT(*) AS n FROM coach_posts
        WHERE author_user_id = ? AND published_at IS NOT NULL
          AND deleted_at IS NULL AND removed_at IS NULL`,
    ).get(userId).n;

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the profile to unpublished';
    const hidden = stmt(
      `UPDATE coach_profiles
          SET published_at = NULL, updated_at = unixepoch()
        WHERE user_id = ? AND removed_at IS NULL AND published_at IS NOT NULL`,
    ).run(userId);
    if (hidden.changes === 0) throw new Error('unpublishCoachProfileTx: guarded update matched nothing');

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.profile.unpublish', 'coach_profile', ?, ?, ?, ?)`,
    ).run(userId, userId, JSON.stringify({ postsWentDark: live }), requestId, ip);

    return view(false, live);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE COMPOSER — posts.
 *
 * Five transactions. The recurring shape: look the OBJECT up first and answer 404 before anything
 * is said about the caller, then branch the standing gate into sentences a coach can act on, then
 * one guarded write whose WHERE repeats every predicate so the database is the thing enforcing it.
 *
 * The pre-checks are NOT the security boundary — the WHERE clauses are. The pre-checks exist so a
 * refusal arrives as `needs_guidelines` rather than as the trigger's nine snake_case words, which
 * http.js withholds from clients on purpose.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Read a post the way its author sees it: markdown source and row_version included. */
const AUTHOR_POST_SELECT = `
  SELECT public_id AS id, kind_key AS kind, title, body_src AS bodySrc, body_doc AS doc,
         body_excerpt AS excerpt, doc_version AS docVersion, city_key AS city,
         event_at AS eventAt, event_tz AS eventTz, capacity,
         price_minor AS priceMinor, price_currency AS priceCurrency,
         published_at AS publishedAt, deleted_at AS deletedAt, removed_at AS removedAt,
         row_version AS rowVersion, created_at AS createdAt, updated_at AS updatedAt
    FROM coach_posts WHERE id = ?`;

/**
 * The standing every publish and every restore is measured against, as one row of flags.
 *
 * Repeated as EXISTS terms inside each guarded UPDATE as well. That is not redundancy: the flags
 * produce the sentence, the WHERE produces the guarantee, and the two are read under the same write
 * lock so they cannot disagree.
 */
const STANDING_SELECT = `
  SELECT u.disabled_at IS NULL       AS enabled,
         u.role IN ('coach','admin') AS roleOk,
         u.session_version           AS sessionVersion,
         u.created_at <= unixepoch()
           - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS oldEnough,
         u.created_at
           + (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS eligibleAt,
         EXISTS (SELECT 1 FROM guidelines_acceptances a
                   JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                  WHERE a.user_id = u.id) AS guidelinesOk,
         (SELECT v.version  FROM guidelines_versions v WHERE v.active = 1) AS activeVersion,
         (SELECT v.i18n_key FROM guidelines_versions v WHERE v.active = 1) AS activeI18nKey,
         EXISTS (SELECT 1 FROM coach_profiles c
                  WHERE c.user_id = u.id AND c.removed_at IS NULL) AS hasProfile,
         EXISTS (SELECT 1 FROM coach_profiles c
                  WHERE c.user_id = u.id AND c.removed_at IS NULL
                    AND c.published_at IS NOT NULL) AS profileLive
    FROM users u WHERE u.id = ?`;

/** Branch standing into ONE named reason, in a fixed order, or null when it is clear. */
function standingRefusal(s, tokenSv) {
  if (!s) return { outcome: 'missing' };
  if (!s.roleOk) return { outcome: 'not_a_coach' };
  if (!s.enabled) return { outcome: 'account_disabled' };
  if (tokenSv !== null && tokenSv !== undefined && s.sessionVersion !== tokenSv) {
    return { outcome: 'session_stale' };
  }
  if (!s.hasProfile) return { outcome: 'profile_required' };
  if (!s.profileLive) return { outcome: 'profile_not_published' };
  if (!s.guidelinesOk) {
    return { outcome: 'needs_guidelines', activeVersion: s.activeVersion, activeI18nKey: s.activeI18nKey };
  }
  if (!s.oldEnough) return { outcome: 'too_new', eligibleAt: s.eligibleAt };
  return null;
}

/**
 * Create a draft.
 *
 * `published_at` is ABSENT from the column list, so neither the publish-standing twin nor the
 * quota twin can fire: a draft is free, and writing one costs nothing a coach has to save up for.
 */
export function createPostTx({
  userId, kindKey, title, body, city, eventAt, eventTz, capacity,
  priceMinor, priceCurrency, idempotencyKey, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (postId, replayed) => {
      current = 'SELECT the post back';
      return { outcome: 'applied', replayed, ...stmt(AUTHOR_POST_SELECT).get(postId) };
    };

    // The colon is excluded from the client key's own regex, so this prefix cannot be forged by
    // sending a key that already contains one.
    const writeUid = `post:${userId}:${idempotencyKey}`;

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    // (1) REPLAY, owner-scoped in the WHERE itself rather than by trusting the prefix convention.
    current = 'SELECT the prior attempt';
    const prior = stmt(
      'SELECT id, title, body_src AS bodySrc FROM coach_posts WHERE author_user_id = ? AND write_uid = ?',
    ).get(userId, writeUid);
    // A key reused for DIFFERENT content is a client bug, and answering with the old post would
    // hide it. Answering with a second post would be the effect the key exists to prevent.
    if (prior && (prior.title !== title || prior.bodySrc !== body.src)) {
      return { outcome: 'key_reused' };
    }
    if (prior) return view(prior.id, true);

    current = 'SELECT the profile';
    const profile = stmt(
      'SELECT user_id FROM coach_profiles WHERE user_id = ? AND removed_at IS NULL',
    ).get(userId);
    if (!profile) return { outcome: 'profile_required' };

    // (2) THE KIND'S OWN RULES, read from the stored row. Never a z.enum and never a second copy:
    //     adding a kind stays an INSERT, and the shape rules live where the kind lives.
    current = 'SELECT the kind';
    const kind = stmt(
      `SELECT requires_event_at AS requiresEventAt, allows_capacity AS allowsCapacity,
              allows_price AS allowsPrice
         FROM post_kinds WHERE key = ? AND active = 1`,
    ).get(kindKey);
    if (!kind) return { outcome: 'kind_unknown', key: kindKey };
    if (kind.requiresEventAt === 1 && eventAt === null) {
      return { outcome: 'kind_shape', field: 'event_at', reason_detail: 'required' };
    }
    if (kind.allowsCapacity === 0 && capacity !== null) {
      return { outcome: 'kind_shape', field: 'capacity', reason_detail: 'not_allowed' };
    }
    if (kind.allowsPrice === 0 && priceMinor !== null) {
      return { outcome: 'kind_shape', field: 'price_minor', reason_detail: 'not_allowed' };
    }

    // (3) Reference membership. Neither table has an active-flag trigger, so an unknown or retired
    //     key would otherwise arrive as an opaque foreign-key failure.
    current = 'SELECT the reference rows';
    const refs = stmt(
      `SELECT (? IS NULL OR EXISTS (SELECT 1 FROM public_cities WHERE key = ? AND active = 1)) AS cityOk,
              (? IS NULL OR EXISTS (SELECT 1 FROM public_currencies WHERE code = ? AND active = 1)) AS currencyOk`,
    ).get(city, city, priceCurrency, priceCurrency);
    if (!refs.cityOk) return { outcome: 'city_unknown', key: city };
    if (!refs.currencyOk) return { outcome: 'currency_unknown', key: priceCurrency };

    // (4) Mint the public id under the write lock. A UNIQUE collision after the INSERT would be an
    //     opaque 400; drawing here means the only failure is exhaustion, which is an error.
    current = 'SELECT the public_id probe';
    let publicId = null;
    for (let i = 0; i < 5 && publicId === null; i += 1) {
      const candidate = randomBytes(9).toString('base64url');
      if (!stmt('SELECT 1 FROM coach_posts WHERE public_id = ?').get(candidate)) publicId = candidate;
    }
    if (publicId === null) throw new Error('createPostTx: public_id space exhausted after five draws');

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'INSERT the post';
    // An INSERT has no WHERE, so the SELECT is the guard: author_user_id is projected out of the
    // row the SERVER matched, never bound from the request, and the role is re-read here.
    const created = stmt(
      `INSERT INTO coach_posts (public_id, author_user_id, kind_key, title,
                                body_src, body_doc, body_excerpt, doc_version,
                                city_key, event_at, event_tz, capacity,
                                price_minor, price_currency, write_uid)
       SELECT ?, c.user_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM coach_profiles c
         JOIN users u ON u.id = c.user_id AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
        WHERE c.user_id = ? AND c.removed_at IS NULL`,
    ).run(
      publicId, kindKey, title, body.src, body.doc, body.excerpt, body.version,
      city, eventAt, eventTz, capacity, priceMinor, priceCurrency, writeUid, userId,
    );
    if (created.changes === 0) return { outcome: 'profile_required' };

    current = 'SELECT the new row id';
    const postId = stmt('SELECT id FROM coach_posts WHERE public_id = ?').get(publicId).id;

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.post.create', 'coach_post', ?, ?, ?, ?)`,
    ).run(userId, postId, JSON.stringify({ publicId, kindKey }), requestId, ip);

    return view(postId, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Edit a post. ONE statement, no branch, all four body columns always in the SET list.
 *
 * That is only safe because 023 replaced 021's exclusive-or trigger. Under the original rule a
 * source-only edit — reflowing a paragraph, changing a bullet marker — aborted, and after a grammar
 * bump every edit would have aborted.
 *
 * `kind_key` is ABSENT and frozen, which makes `trg_post_kind_shape_upd`'s missing `active = 1`
 * clause unreachable from this surface rather than something to argue about.
 */
export function updatePostTx({
  userId, publicId, expectedRowVersion, title, body, city, eventAt, eventTz,
  capacity, priceMinor, priceCurrency, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (postId, replayed) => {
      current = 'SELECT the post back';
      return { outcome: 'applied', replayed, ...stmt(AUTHOR_POST_SELECT).get(postId) };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    // THE OBJECT FIRST, and one answer for not-yours, never-existed and removed. A moderated post
    // answering differently from a stranger's post is an oracle for what was taken down.
    current = 'SELECT the post';
    const post = stmt(
      `SELECT id, kind_key AS kindKey, row_version AS rowVersion
         FROM coach_posts
        WHERE public_id = ? AND author_user_id = ? AND removed_at IS NULL`,
    ).get(publicId, userId);
    if (!post) return { outcome: 'missing' };

    if (post.rowVersion !== expectedRowVersion) {
      current = 'SELECT the current row for the conflict answer';
      return { outcome: 'stale', post: stmt(AUTHOR_POST_SELECT).get(post.id) };
    }

    // The kind is frozen, so its rules are checked against the STORED kind and the new values.
    current = 'SELECT the kind';
    const kind = stmt(
      `SELECT requires_event_at AS requiresEventAt, allows_capacity AS allowsCapacity,
              allows_price AS allowsPrice
         FROM post_kinds WHERE key = ?`,
    ).get(post.kindKey);
    if (kind) {
      if (kind.requiresEventAt === 1 && eventAt === null) {
        return { outcome: 'kind_shape', field: 'event_at', reason_detail: 'required' };
      }
      if (kind.allowsCapacity === 0 && capacity !== null) {
        return { outcome: 'kind_shape', field: 'capacity', reason_detail: 'not_allowed' };
      }
      if (kind.allowsPrice === 0 && priceMinor !== null) {
        return { outcome: 'kind_shape', field: 'price_minor', reason_detail: 'not_allowed' };
      }
    }

    current = 'SELECT the reference rows';
    const refs = stmt(
      `SELECT (? IS NULL OR EXISTS (SELECT 1 FROM public_cities WHERE key = ? AND active = 1)) AS cityOk,
              (? IS NULL OR EXISTS (SELECT 1 FROM public_currencies WHERE code = ? AND active = 1)) AS currencyOk`,
    ).get(city, city, priceCurrency, priceCurrency);
    if (!refs.cityOk) return { outcome: 'city_unknown', key: city };
    if (!refs.currencyOk) return { outcome: 'currency_unknown', key: priceCurrency };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the post';
    // `removed_at IS NULL` is load-bearing here even though it was checked above:
    // trg_post_frozen_while_removed_upd has NO value comparison and fires on the mere presence of
    // these column names in the SET list, so without it a moderated post aborts as a generic 400
    // instead of the 404 this surface answers everywhere else.
    const updated = stmt(
      `UPDATE coach_posts
          SET title = ?, body_src = ?, body_doc = ?, body_excerpt = ?, doc_version = ?,
              city_key = ?, event_at = ?, event_tz = ?, capacity = ?,
              price_minor = ?, price_currency = ?,
              row_version = row_version + 1, updated_at = unixepoch()
        WHERE id = ? AND author_user_id = ?
          AND deleted_at IS NULL AND removed_at IS NULL
          AND row_version = ?`,
    ).run(
      title, body.src, body.doc, body.excerpt, body.version,
      city, eventAt, eventTz, capacity, priceMinor, priceCurrency,
      post.id, userId, expectedRowVersion,
    );
    // The row was proved to exist and to carry this row_version under the same lock, so zero rows
    // means it was withdrawn between the two statements — a state, not a contradiction.
    if (updated.changes === 0) return { outcome: 'stale', post: stmt(AUTHOR_POST_SELECT).get(post.id) };

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.post.update', 'coach_post', ?, ?, ?, ?)`,
    ).run(userId, post.id, JSON.stringify({ publicId }), requestId, ip);

    return view(post.id, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Publish a post.
 *
 * The object is looked up FIRST, before a word is said about the caller's standing. A post that is
 * not yours must answer 404 without revealing whether your guidelines are current — otherwise the
 * error text distinguishes "somebody else's post" from "no such post".
 */
export function publishPostTx({ userId, publicId, tokenSv = null, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (postId, replayed) => {
      current = 'SELECT the post back';
      return { outcome: 'applied', replayed, ...stmt(AUTHOR_POST_SELECT).get(postId) };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the post';
    const post = stmt(
      `SELECT id, published_at AS publishedAt, deleted_at AS deletedAt
         FROM coach_posts
        WHERE public_id = ? AND author_user_id = ? AND removed_at IS NULL`,
    ).get(publicId, userId);
    if (!post) return { outcome: 'missing' };
    if (post.publishedAt !== null) return view(post.id, true);
    // A withdrawn post is restored, not published: published_at is write-once and a restore returns
    // it to its original feed position for free.
    if (post.deletedAt !== null) return { outcome: 'withdrawn' };

    current = 'SELECT publish standing';
    const refusal = standingRefusal(stmt(STANDING_SELECT).get(userId), tokenSv);
    if (refusal) return refusal;

    // The quota is counted exactly as trg_post_publish_quota_upd counts it — INCLUDING posts since
    // withdrawn or removed. A screen that counted only live ones would promise a slot the database
    // then refuses.
    current = 'SELECT the publish quota';
    const q = stmt(
      `SELECT (SELECT COUNT(*) FROM coach_posts q
                WHERE q.author_user_id = ? AND q.published_at IS NOT NULL
                  AND q.published_at > unixepoch() - 86400) AS used,
              (SELECT MIN(q.published_at) FROM coach_posts q
                WHERE q.author_user_id = ? AND q.published_at IS NOT NULL
                  AND q.published_at > unixepoch() - 86400) AS oldest,
              (SELECT value FROM public_policy WHERE key = 'post_publish_daily_max') AS max`,
    ).get(userId, userId);
    if (q.used >= q.max) {
      // 409 rather than 429 at the route: this is a business rule, and every 429 in this product
      // comes from the rate limiter. Conflating them would make a quota look like throttling.
      return { outcome: 'quota_reached', used: q.used, max: q.max, nextSlotAt: q.oldest + 86400 };
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the post to published';
    // Every predicate above is repeated here as a term. The pre-checks produce the sentence; THIS
    // produces the guarantee, and the two run under one write lock so they cannot disagree.
    const published = stmt(
      `UPDATE coach_posts
          SET published_at = unixepoch(), row_version = row_version + 1, updated_at = unixepoch()
        WHERE id = ? AND author_user_id = ?
          AND published_at IS NULL AND deleted_at IS NULL AND removed_at IS NULL
          AND EXISTS (SELECT 1 FROM users u
                       WHERE u.id = coach_posts.author_user_id
                         AND u.disabled_at IS NULL AND u.role IN ('coach','admin')
                         AND u.created_at <= unixepoch()
                             - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish'))
          AND EXISTS (SELECT 1 FROM coach_profiles p
                       WHERE p.user_id = coach_posts.author_user_id
                         AND p.published_at IS NOT NULL AND p.removed_at IS NULL)
          AND EXISTS (SELECT 1 FROM guidelines_acceptances a
                        JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
                       WHERE a.user_id = coach_posts.author_user_id)
          AND (SELECT COUNT(*) FROM coach_posts q
                WHERE q.author_user_id = coach_posts.author_user_id
                  AND q.published_at IS NOT NULL
                  AND q.published_at > unixepoch() - 86400)
              < (SELECT value FROM public_policy WHERE key = 'post_publish_daily_max')`,
    ).run(post.id, userId);
    if (published.changes === 0) throw new Error('publishPostTx: guarded update matched nothing');

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.post.publish', 'coach_post', ?, ?, ?, ?)`,
    ).run(userId, post.id, JSON.stringify({ publicId }), requestId, ip);

    return view(post.id, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Withdraw a post — the author taking their own content back.
 *
 * NO `removed_at` term, deliberately. `deleted_at` is absent from
 * `trg_post_frozen_while_removed_upd`'s column list precisely so an author can always take down
 * their own post, even one a moderator has already removed. The two states stay distinct in the
 * row, which is what lets an appeal tell "I changed my mind" from "we took this down".
 */
export function withdrawPostTx({ userId, publicId, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (postId, replayed) => {
      current = 'SELECT the post back';
      return { outcome: 'applied', replayed, ...stmt(AUTHOR_POST_SELECT).get(postId) };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the post';
    const post = stmt(
      'SELECT id, deleted_at AS deletedAt FROM coach_posts WHERE public_id = ? AND author_user_id = ?',
    ).get(publicId, userId);
    if (!post) return { outcome: 'missing' };
    // A replay must answer with the ORIGINAL deleted_at, not a fresh one. Moving that timestamp on
    // a double-click would rewrite when the author says they took it down.
    if (post.deletedAt !== null) return view(post.id, true);

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the post to withdrawn';
    const withdrawn = stmt(
      `UPDATE coach_posts
          SET deleted_at = unixepoch(), row_version = row_version + 1, updated_at = unixepoch()
        WHERE id = ? AND author_user_id = ? AND deleted_at IS NULL`,
    ).run(post.id, userId);
    if (withdrawn.changes === 0) throw new Error('withdrawPostTx: guarded update matched nothing');

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.post.withdraw', 'coach_post', ?, ?, ?, ?)`,
    ).run(userId, post.id, JSON.stringify({ publicId }), requestId, ip);

    return view(post.id, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Restore a withdrawn post.
 *
 * A restore IS a publication event even though `published_at` never moves, which is exactly why no
 * 021 trigger watched it and why 022 added one. The standing gate is repeated here as EXISTS terms
 * so the database enforces what the branch above only explains.
 *
 * Account age and quota are deliberately NOT re-checked: the post was published once, its
 * `published_at` does not move, and charging a quota slot to un-hide something that was already
 * public would make withdrawal a punishment. The post returns to its ORIGINAL feed position, which
 * is the anti-bump property working.
 */
export function restorePostTx({ userId, publicId, tokenSv = null, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (postId, replayed) => {
      current = 'SELECT the post back';
      return { outcome: 'applied', replayed, ...stmt(AUTHOR_POST_SELECT).get(postId) };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the post';
    const post = stmt(
      `SELECT id, deleted_at AS deletedAt, published_at AS publishedAt
         FROM coach_posts
        WHERE public_id = ? AND author_user_id = ? AND removed_at IS NULL`,
    ).get(publicId, userId);
    if (!post) return { outcome: 'missing' };
    if (post.deletedAt === null) return view(post.id, true);

    // A never-published draft coming out of the bin is not a publication event, so it carries no
    // standing gate. Gating it would make a coach's own drafts depend on their public standing.
    if (post.publishedAt !== null) {
      current = 'SELECT restore standing';
      const refusal = standingRefusal(stmt(STANDING_SELECT).get(userId), tokenSv);
      if (refusal) return refusal;
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the post to restored';
    const restored = stmt(
      `UPDATE coach_posts
          SET deleted_at = NULL, row_version = row_version + 1, updated_at = unixepoch()
        WHERE id = ? AND author_user_id = ?
          AND deleted_at IS NOT NULL AND removed_at IS NULL`,
    ).run(post.id, userId);
    if (restored.changes === 0) throw new Error('restorePostTx: guarded update matched nothing');

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.post.restore', 'coach_post', ?, ?, ?, ?)`,
    ).run(userId, post.id, JSON.stringify({ publicId }), requestId, ip);

    return view(post.id, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE COMPOSER — the cover image.
 *
 * ONE cover per post, and there is no replace. The adversarial review put 40% of the whole
 * corpus's defect weight in the media surface, including its only FATAL finding: a soft-delete
 * followed by a guarded write followed by `return {outcome:'missing'}` destroys the coach's image
 * and answers 404, because the transaction COMMITS ON RETURN.
 *
 * Replacing a cover is therefore DELETE then POST — two operations that are each already atomic,
 * with no window between them that matters, and no UPDATE of post_media anywhere in the product.
 * Every UPDATE not written is an IDOR that cannot exist.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

const COVER_SELECT = `
  SELECT m.id, m.storage_key AS storageKey, m.thumb_key AS thumbKey, m.mime,
         m.width, m.height, m.bytes, m.alt, m.created_at AS createdAt
    FROM post_media m WHERE m.id = ?`;

/**
 * Attach the cover to a post.
 *
 * The file is ALREADY on disk when this runs — it was written by the ingest before the transaction
 * opened, because re-encoding an 8 MiB photo inside a write lock would hold the database for the
 * length of a sharp pass. The consequence is stated rather than hidden: if this transaction
 * refuses, the route removes the files it just wrote.
 */
export function attachPostCoverTx({
  userId, publicId, storageKey, thumbKey, mime, width, height, bytes,
  sha256, alt, idempotencyKey, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (mediaId, replayed) => {
      current = 'SELECT the cover back';
      return { outcome: 'applied', replayed, ...stmt(COVER_SELECT).get(mediaId) };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the post';
    const post = stmt(
      `SELECT id FROM coach_posts
        WHERE public_id = ? AND author_user_id = ?
          AND deleted_at IS NULL AND removed_at IS NULL`,
    ).get(publicId, userId);
    if (!post) return { outcome: 'missing' };

    // REPLAY, scoped to the post and comparing the BYTES. Two uploads under one key are a retry
    // only if they carry the same image; answering the second with the first one's row whatever
    // was sent would put the wrong picture on a published post and report success.
    current = 'SELECT the prior attempt';
    const prior = stmt(
      'SELECT id, content_sha256 AS sha FROM post_media WHERE post_id = ? AND write_uid = ?',
    ).get(post.id, idempotencyKey);
    if (prior && prior.sha !== sha256) return { outcome: 'key_reused' };
    if (prior) return view(prior.id, true);

    current = 'SELECT the live cover';
    const live = stmt(
      "SELECT id FROM post_media WHERE post_id = ? AND role_key = 'cover' AND deleted_at IS NULL",
    ).get(post.id);
    // No replace. Delete the old one first — see the header.
    if (live) return { outcome: 'cover_exists' };

    // The daily cap counts rows CREATED, with no deleted_at filter, because that is how
    // trg_post_media_daily_cap_ins counts. Subtracting deletions here would promise an upload the
    // database then refuses, with a trigger message nobody may see.
    current = 'SELECT the daily media count';
    const cap = stmt(
      `SELECT (SELECT COUNT(*) FROM post_media m JOIN coach_posts p ON p.id = m.post_id
                WHERE p.author_user_id = ? AND m.created_at > unixepoch() - 86400) AS used,
              (SELECT value FROM public_policy WHERE key = 'media_daily_max') AS max`,
    ).get(userId);
    if (cap.used >= cap.max) return { outcome: 'media_quota', used: cap.used, max: cap.max };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'INSERT the cover';
    // `mime` is a server-side literal and `sort_order` a constant: the gallery was cut, so the only
    // media a post can have is one cover at position zero. An INSERT has no WHERE, so the SELECT
    // carries the ownership and liveness predicates.
    const created = stmt(
      `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime,
                               width, height, bytes, alt, sort_order, content_sha256, write_uid)
       SELECT p.id, 'cover', ?, ?, 'image/webp', ?, ?, ?, ?, 0, ?, ?
         FROM coach_posts p
        WHERE p.id = ? AND p.author_user_id = ?
          AND p.deleted_at IS NULL AND p.removed_at IS NULL`,
    ).run(storageKey, thumbKey, width, height, bytes, alt, sha256, idempotencyKey, post.id, userId);
    if (created.changes === 0) return { outcome: 'missing' };

    current = 'SELECT the new media id';
    const mediaId = stmt('SELECT id FROM post_media WHERE storage_key = ?').get(storageKey).id;

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.media.attach', 'coach_post', ?, ?, ?, ?)`,
    ).run(userId, post.id, JSON.stringify({ publicId, bytes }), requestId, ip);

    return view(mediaId, false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Take the cover off a post.
 *
 * Soft-delete only. The files are removed by the ROUTE after this returns, and in that order: a
 * row pointing at a missing file renders as a broken image, while a file with no row is invisible
 * and gets swept. If the two must disagree for a moment, this is the harmless direction.
 *
 * Deliberately NOT written as `UPDATE ... RETURNING`: `.run()` discards the returned rows and
 * `.all()` reports no `.changes`, so the shape that reads naturally is the one that cannot tell
 * whether it changed anything.
 */
export function deletePostCoverTx({ userId, publicId, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the cover';
    const cover = stmt(
      `SELECT m.id, m.storage_key AS storageKey, m.thumb_key AS thumbKey, m.deleted_at AS deletedAt
         FROM post_media m
         JOIN coach_posts p ON p.id = m.post_id
        WHERE p.public_id = ? AND p.author_user_id = ? AND m.role_key = 'cover'
        ORDER BY m.id DESC`,
    ).get(publicId, userId);
    if (!cover) return { outcome: 'missing' };
    // Already gone is not an error, and the files are named again so a retry can finish a delete
    // that failed halfway through its file removal.
    if (cover.deletedAt !== null) {
      return { outcome: 'applied', replayed: true, storageKey: cover.storageKey, thumbKey: cover.thumbKey };
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the cover to deleted';
    const removed = stmt(
      'UPDATE post_media SET deleted_at = unixepoch() WHERE id = ? AND deleted_at IS NULL',
    ).run(cover.id);
    // The row was proved present and live under this same write lock.
    if (removed.changes === 0) throw new Error('deletePostCoverTx: guarded update matched nothing');

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.media.delete', 'coach_post',
               (SELECT id FROM coach_posts WHERE public_id = ?), ?, ?, ?)`,
    ).run(userId, publicId, JSON.stringify({ publicId }), requestId, ip);

    return { outcome: 'applied', replayed: false, storageKey: cover.storageKey, thumbKey: cover.thumbKey };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * MODERATION — the path that was missing.
 *
 * The composer opened a public writing surface. Before this, `content_reports` existed in migration
 * 021 and NOTHING in src/ referenced it, and no route anywhere wrote `removed_at`: a coach could
 * publish to the open internet and nobody could take it down or even report it.
 *
 * Every rule below is already enforced by a trigger — the resolver's admin role is re-read from the
 * database at write time, a removal without a reason is refused, the resolution triple moves
 * together, and the reported snapshot MUST be cleared when a case closes. These transactions exist
 * so the refusal is a sentence rather than nine snake_case words, and so the whole act is atomic.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * File a report.
 *
 * `subject_author_user_id` is copied from the SERVER's own row inside the INSERT ... SELECT, never
 * sent by the client — which is what makes "you cannot report yourself" a one-column test the
 * database can enforce rather than a join the route has to remember.
 *
 * The body snapshot is taken HERE, at report time, so a moderator judges what the reporter actually
 * saw rather than what the author has since edited it into.
 */
export function fileReportTx({
  reporterId, publicId, handle, reasonKey, note, requestId,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    // The subject must be something the reporter could actually SEE. Reporting a draft would
    // confirm that a draft exists under a guessed id, which no public read discloses.
    current = 'SELECT the subject';
    const subject = publicId
      ? stmt(
          `SELECT p.id AS postId, NULL AS profileId, p.author_user_id AS authorId,
                  substr(p.body_src, 1, 4000) AS snapshot,
                  CASE WHEN length(p.body_src) > 4000 THEN 1 ELSE 0 END AS truncated
             FROM coach_posts p
             JOIN coach_profiles c ON c.user_id = p.author_user_id
            WHERE p.public_id = ?
              AND p.published_at IS NOT NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL
              AND c.published_at IS NOT NULL AND c.removed_at IS NULL`,
        ).get(publicId)
      : stmt(
          `SELECT NULL AS postId, c.user_id AS profileId, c.user_id AS authorId,
                  substr(c.bio_src, 1, 4000) AS snapshot,
                  CASE WHEN length(c.bio_src) > 4000 THEN 1 ELSE 0 END AS truncated
             FROM coach_profiles c
            WHERE c.handle = ? AND c.published_at IS NOT NULL AND c.removed_at IS NULL`,
        ).get(handle);
    if (!subject) return { outcome: 'missing' };
    if (subject.authorId === reporterId) return { outcome: 'self_report' };

    current = 'SELECT the reason';
    const reason = stmt(
      'SELECT key FROM report_reasons WHERE key = ? AND reportable = 1 AND active = 1',
    ).get(reasonKey);
    // `legal_order` and `admin_discretion` are marked non-reportable: they are removal reasons an
    // admin uses, not something a member of the public can claim.
    if (!reason) return { outcome: 'reason_unavailable' };

    // A DUPLICATE from the same reporter is answered as a replay rather than as a second row. The
    // queue measures how many DIFFERENT people objected; letting one person file five times would
    // make severity a function of persistence.
    current = 'SELECT an existing open report by this reporter';
    const prior = stmt(
      `SELECT r.id FROM content_reports r
        JOIN report_statuses s ON s.key = r.status_key AND s.is_terminal = 0
       WHERE r.reporter_user_id = ?
         AND ((? IS NOT NULL AND r.subject_post_id = ?) OR (? IS NOT NULL AND r.subject_profile_id = ?))`,
    ).get(reporterId, subject.postId, subject.postId, subject.profileId, subject.profileId);
    if (prior) return { outcome: 'applied', replayed: true, reportId: prior.id };

    current = 'SELECT the reporter quota';
    const quota = stmt(
      `SELECT (SELECT COUNT(*) FROM content_reports x
                WHERE x.reporter_user_id = ? AND x.created_at > unixepoch() - 86400) AS used,
              (SELECT value FROM public_policy WHERE key = 'report_daily_max') AS max`,
    ).get(reporterId);
    if (quota.used >= quota.max) return { outcome: 'quota_reached', used: quota.used, max: quota.max };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'INSERT the report';
    const created = stmt(
      `INSERT INTO content_reports
         (subject_post_id, subject_profile_id, subject_author_user_id, reporter_user_id,
          reason_key, note, body_snapshot, snapshot_truncated, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      subject.postId, subject.profileId, subject.authorId, reporterId,
      reasonKey, note, subject.snapshot, subject.truncated, requestId,
    );
    if (created.changes === 0) return { outcome: 'missing' };

    return { outcome: 'applied', replayed: false, reportId: Number(created.lastInsertRowid) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Resolve a report, and take the subject down in the SAME transaction when it is upheld.
 *
 * ═══ ONE ACT, ONE TRANSACTION ══════════════════════════════════════════════════════════════════
 *
 * "Uphold this and remove it" is a single decision. Split across two calls it has a window in which
 * the report reads as handled and the content is still on the open internet — and the window is
 * exactly the moment somebody is looking.
 *
 * Removing a PROFILE takes that coach's entire back catalogue off the marketplace on the next read,
 * because `PUBLIC_POST` requires a live profile. There is no sweep to run and none to forget.
 */
export function resolveReportTx({
  reportId, adminId, statusKey, note, removeSubject, removalReason, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the report';
    const report = stmt(
      `SELECT r.id, r.subject_post_id AS postId, r.subject_profile_id AS profileId,
              r.status_key AS statusKey, s.is_terminal AS isTerminal
         FROM content_reports r
         JOIN report_statuses s ON s.key = r.status_key
        WHERE r.id = ?`,
    ).get(reportId);
    if (!report) return { outcome: 'missing' };
    if (report.isTerminal === 1) return { outcome: 'already_resolved', statusKey: report.statusKey };

    current = 'SELECT the target status';
    const status = stmt('SELECT key, is_terminal AS isTerminal FROM report_statuses WHERE key = ?').get(statusKey);
    if (!status) return { outcome: 'status_unknown', key: statusKey };

    // The DB re-reads the admin role at write time anyway; checking here turns `resolver_not_admin`
    // into an answer somebody can read.
    current = 'SELECT the resolver';
    const admin = stmt(
      "SELECT 1 AS ok FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL",
    ).get(adminId);
    if (!admin) return { outcome: 'not_an_admin' };

    // A removal with no reason is refused by a trigger. Catch it here so the moderator is told what
    // is missing rather than shown nine snake_case words.
    if (removeSubject && (!removalReason || removalReason.trim().length === 0)) {
      return { outcome: 'removal_needs_reason' };
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    if (removeSubject) {
      current = 'UPDATE the subject to removed';
      // The triple moves together: a trigger refuses `removed_at` without `removed_by`, another
      // refuses it without a reason, and a third re-reads the remover's role from the database.
      if (report.postId !== null) {
        stmt(
          `UPDATE coach_posts
              SET removed_at = unixepoch(), removed_by = ?, removal_reason = ?,
                  row_version = row_version + 1, updated_at = unixepoch()
            WHERE id = ? AND removed_at IS NULL`,
        ).run(adminId, removalReason, report.postId);
      } else {
        stmt(
          `UPDATE coach_profiles
              SET removed_at = unixepoch(), removed_by = ?, removal_reason = ?,
                  updated_at = unixepoch()
            WHERE user_id = ? AND removed_at IS NULL`,
        ).run(adminId, removalReason, report.profileId);
      }
    }

    current = 'UPDATE the report';
    // `body_snapshot` is CLEARED on a terminal status, and a trigger refuses the write otherwise.
    // The copy of somebody's reported content exists to be judged, not to be kept.
    stmt(
      `UPDATE content_reports
          SET status_key = ?,
              resolved_at = CASE WHEN ? = 1 THEN unixepoch() ELSE NULL END,
              resolved_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
              resolution_note = ?,
              body_snapshot = CASE WHEN ? = 1 THEN NULL ELSE body_snapshot END
        WHERE id = ?`,
    ).run(statusKey, status.isTerminal, status.isTerminal, adminId, note, status.isTerminal, reportId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.moderation.resolve', ?, ?, ?, ?, ?)`,
    ).run(
      adminId,
      report.postId !== null ? 'coach_post' : 'coach_profile',
      report.postId !== null ? report.postId : report.profileId,
      JSON.stringify({ reportId, statusKey, removed: !!removeSubject, removalReason: removalReason ?? null }),
      requestId,
      ip,
    );

    current = 'SELECT the report back';
    const view = stmt(
      `SELECT id, status_key AS statusKey, resolved_at AS resolvedAt, resolved_by AS resolvedBy,
              body_snapshot AS snapshot
         FROM content_reports WHERE id = ?`,
    ).get(reportId);
    return { outcome: 'applied', removed: !!removeSubject, ...view };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Take something down with no report behind it.
 *
 * A court order does not arrive as a user report, and neither does an admin noticing something at
 * three in the morning. `report_reasons` carries two keys marked NOT reportable for exactly this —
 * `legal_order` and `admin_discretion` — so the vocabulary already distinguishes "somebody
 * complained" from "we decided", and the audit row records which.
 */
export function removeSubjectTx({
  adminId, publicId, handle, removalReason, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the resolver';
    const admin = stmt(
      "SELECT 1 AS ok FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL",
    ).get(adminId);
    if (!admin) return { outcome: 'not_an_admin' };

    if (!removalReason || removalReason.trim().length === 0) return { outcome: 'removal_needs_reason' };

    current = 'SELECT the subject';
    const subject = publicId
      ? stmt('SELECT id, removed_at AS removedAt FROM coach_posts WHERE public_id = ?').get(publicId)
      : stmt('SELECT user_id AS id, removed_at AS removedAt FROM coach_profiles WHERE handle = ?').get(handle);
    if (!subject) return { outcome: 'missing' };
    // Already down is not an error, and a second takedown must not overwrite who did the first one.
    if (subject.removedAt !== null) return { outcome: 'applied', replayed: true, id: subject.id };

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the subject to removed';
    if (publicId) {
      stmt(
        `UPDATE coach_posts
            SET removed_at = unixepoch(), removed_by = ?, removal_reason = ?,
                row_version = row_version + 1, updated_at = unixepoch()
          WHERE id = ? AND removed_at IS NULL`,
      ).run(adminId, removalReason, subject.id);
    } else {
      stmt(
        `UPDATE coach_profiles
            SET removed_at = unixepoch(), removed_by = ?, removal_reason = ?, updated_at = unixepoch()
          WHERE user_id = ? AND removed_at IS NULL`,
      ).run(adminId, removalReason, subject.id);
    }

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'marketplace.moderation.remove', ?, ?, ?, ?, ?)`,
    ).run(
      adminId,
      publicId ? 'coach_post' : 'coach_profile',
      subject.id,
      JSON.stringify({ publicId: publicId ?? null, handle: handle ?? null, removalReason }),
      requestId,
      ip,
    );

    return { outcome: 'applied', replayed: false, id: subject.id };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * DISABLING AN ACCOUNT — the switch eight predicates were already waiting for.
 *
 * `disabled_at` gates login, every authenticated request, publishing, restoring a withdrawn post,
 * removing content and resolving a report. Eight files read it. NOTHING could set it: a coach
 * posting things that should not be on the internet could have each post taken down one at a time,
 * and could keep posting.
 *
 * The enforcement was already complete and correct — `getSessionVersion` answers -1 for a disabled
 * account, which can never match a token's `sv`, so every live session dies on the next request.
 * Only the switch was missing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Disable or re-enable an account.
 *
 * ═══ EVERY GUARD IS READ INSIDE THE WRITE LOCK ═════════════════════════════════════════════════
 *
 * Including the ACTOR's own role. A pre-check on that cannot hold: an admin demoted or disabled a
 * moment ago would still be acting on a token that says otherwise, and the operations here decide
 * who may do everything else.
 */
export function setAccountDisabledTx({ actorId, targetId, disabled, reason, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the account back';
      const row = stmt(
        `SELECT id, email, role, disabled_at AS disabledAt, session_version AS sessionVersion
           FROM users WHERE id = ?`,
      ).get(targetId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    // The ACTOR's role is re-read from the database, not taken from the token. A role revoked
    // thirty seconds ago must not still be able to disable somebody.
    current = 'SELECT the actor';
    const actor = stmt(
      "SELECT 1 AS ok FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL",
    ).get(actorId);
    if (!actor) return { outcome: 'not_an_admin' };

    if (actorId === targetId) return { outcome: 'cannot_disable_self' };

    current = 'SELECT the target';
    const target = stmt('SELECT id, role, disabled_at AS disabledAt FROM users WHERE id = ?').get(targetId);
    if (!target) return { outcome: 'missing' };

    // Already in the requested state is a replay, and the ORIGINAL timestamp is kept — a second
    // disable must not rewrite when the account was actually stopped.
    if (disabled === (target.disabledAt !== null)) return view(true);

    if (disabled && (!reason || reason.trim().length === 0)) return { outcome: 'needs_reason' };

    // No last-admin count here either, for the same reason and with the same evidence — see the
    // note in setUserRoleTx. An admin cannot disable themselves, and a disabled account is refused
    // by the actor check on its next call, so the product cannot be emptied of admins from here.

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the account';
    // The session_version bump rides in the SAME statement. Disabling already forces `sv` to -1 on
    // every read, so the bump is belt and braces for the enable direction: an account coming back
    // must not resume with tokens minted before it was stopped.
    stmt(
      `UPDATE users
          SET disabled_at = ${disabled ? 'unixepoch()' : 'NULL'},
              -- updated_at is left alone: a users_updated_at trigger maintains it, and writing
              -- it here would be a second author of the same value.
              session_version = session_version + 1
        WHERE id = ?`,
    ).run(targetId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, ?, 'user', ?, ?, ?, ?)`,
    ).run(
      actorId,
      disabled ? 'user.disable' : 'user.enable',
      targetId,
      JSON.stringify({ role: target.role, reason: reason ?? null }),
      requestId,
      ip,
    );

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Change an account's role, without the product ever reaching zero admins.
 *
 * ═══ THE RACE THIS EXISTS FOR ══════════════════════════════════════════════════════════════════
 *
 * The route this replaces guarded one thing: you cannot change your OWN role. That stops the
 * obvious mistake and misses the one that matters. Two admins, A and B. A demotes B; B demotes A;
 * at the same moment. Each passes the self-check, because each is demoting the other. Both writes
 * land. The product is left with NO admin, and nothing in it can ever mint one again — every route
 * that could is behind `requireRole('admin')`.
 *
 * That is not a state anybody recovers from through the API, which is what makes it worth a
 * transaction rather than a bigger pre-check. Under one write lock the second caller reads the
 * first one's effect and is refused.
 *
 * The count that was going to enforce this is gone. It could not fire — see the note in the body —
 * and what actually holds the invariant is the actor's role being re-read from the database inside
 * the write lock, which was measured doing exactly that.
 */
export function setUserRoleTx({ actorId, targetId, role, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const view = (replayed) => {
      current = 'SELECT the account back';
      const row = stmt(
        'SELECT id, email, role, disabled_at AS disabledAt, session_version AS sessionVersion FROM users WHERE id = ?',
      ).get(targetId);
      return { outcome: 'applied', replayed, ...row };
    };

    // ── every check that can return an error result runs BEFORE the first write ──────────────

    // The actor's role is re-read from the DATABASE. `requireRole` reads the JWT, which can be
    // fifteen minutes stale, and this operation decides who may do everything else.
    current = 'SELECT the actor';
    const actor = stmt(
      "SELECT 1 AS ok FROM users WHERE id = ? AND role = 'admin' AND disabled_at IS NULL",
    ).get(actorId);
    if (!actor) return { outcome: 'not_an_admin' };

    if (actorId === targetId) return { outcome: 'cannot_change_own_role' };

    current = 'SELECT the target';
    const target = stmt('SELECT id, role FROM users WHERE id = ?').get(targetId);
    if (!target) return { outcome: 'missing' };
    if (target.role === role) return view(true);

    // ═══ THERE IS NO LAST-ADMIN COUNT HERE, AND ITS ABSENCE IS THE POINT ═══════════════════════
    //
    // The first version of this transaction carried one: count the enabled admins other than the
    // target, refuse at zero. It was written to stop two admins demoting each other at the same
    // instant and leaving the product with none — a state nothing recovers from, because every
    // route that could mint an admin is behind requireRole('admin').
    //
    // Exercised, it never fired. Two concurrent demotions were issued straight at the transaction,
    // and the loser came back `not_an_admin`: the first write had already demoted it, and the actor
    // check above re-reads the role from the DATABASE. The count could not fire in that case, and
    // it cannot fire in any other — the actor is always an enabled admin and can never be the
    // target, so the number of other admins is at least one by construction.
    //
    // Two real things hold the invariant, and both were seen to hold it:
    //   * an admin cannot change their own role
    //   * a demoted account loses the power on its very next call, because the role is re-read
    //     inside the write lock rather than taken from a token
    //
    // The count was deleted rather than kept as belt and braces. A guard that cannot fire still
    // reads like a safety net, and the next person to relax one of the two real checks will believe
    // something is behind them.

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UPDATE the role';
    // The session_version bump rides in the SAME statement: without it the old access token keeps
    // its old role for up to fifteen minutes, and the instant-revocation promise of `sv` is untrue.
    stmt('UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ?').run(role, targetId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'user.role.change', 'user', ?, ?, ?, ?)`,
    ).run(actorId, targetId, JSON.stringify({ from: target.role, to: role }), requestId, ip);

    return view(false);
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO WRITES THAT WERE REFUSING AFTER THEY HAD ALREADY COMMITTED.
 *
 * Both routes below used to run `db.writeTx([guardedWrite, consequence])` and then branch on
 * `changes === 0` to send a 409. `writeTx` commits every step before it returns, so the guard
 * protected its own statement and NOTHING ELSE — the consequence was durable by the time the route
 * decided to refuse.
 *
 * `check-worker-tx` could not see either one. It walks THIS file for a conditional return after a
 * write inside a transaction body, and neither defect was in this file. They were four lines of
 * route code that read like careful work: the guard really is inside the UPDATE, and the comment
 * above one of them says in as many words that two racing callers cannot both win.
 *
 * Both were measured before being touched. `scripts/check-route-tx.mjs` is the gate that finds
 * the shape, and it is what brought these two here.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Approve or reject a submitted exercise.
 *
 * MEASURED BEFORE: deciding the same exercise twice produced ONE status change and TWO audit rows —
 * the second saying an admin approved it, committed alongside the 409 that told them it was already
 * decided. An audit trail that records events which were refused is worse than no audit trail,
 * because it is the thing everybody else is told to trust.
 *
 * The `changes === 0` probe here IS sound, and it is the ADR's own exemption: it sits on the FIRST
 * write, the guard lives in the WHERE clause, and committing a statement that wrote nothing is a
 * no-op. What makes it sound is that the audit INSERT is BELOW it and therefore never runs.
 */
export function decideExerciseTx({
  adminId, exerciseId, approve, reason = null, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the submission';
    const target = stmt(
      `SELECT id, owner_id AS ownerId, name
         FROM exercises
        WHERE id = ? AND status = 'pending_review' AND deleted_at IS NULL
          -- The queue hides orphaned submissions; this refuses to DECIDE one, which is the half
          -- that matters. Hiding a row from a list does not stop a POST at its id, and the id of a
          -- submission that was in the queue yesterday is not a secret. An author who erased their
          -- account cannot be published on behalf of, and cannot be sent a rejection reason.
          AND owner_id IS NOT NULL`,
    ).get(exerciseId);
    if (!target) return { outcome: 'missing' };

    // ── from here on, nothing may conditionally return except the changes === 0 probe ────────

    current = 'UPDATE the submission';
    // ONE `.run(`, deliberately. The obvious form is a ternary between two prepared statements, and
    // check-worker-tx counts writes TEXTUALLY, so it read that as two writes. Choosing the statement
    // and running it once is clearer anyway.
    stmt(
      approve
        ? `UPDATE exercises SET status = 'global', rejection_reason = NULL
            WHERE id = ? AND status = 'pending_review'`
        : `UPDATE exercises SET status = 'rejected', rejection_reason = ?
            WHERE id = ? AND status = 'pending_review'`,
    ).run(...(approve ? [exerciseId] : [reason, exerciseId]));

    // ═══ AND THERE IS NO `changes === 0` PROBE, FOR THE THIRD TIME THIS WEEK ═══════════════════
    //
    // The first draft had one, returning `already_decided` so the route could answer 409. It was
    // written straight after the last-admin count was deleted for being unreachable, and it was
    // unreachable in the same way.
    //
    // Exercised rather than assumed: two decisions fired together at this transaction came back
    // `applied / missing`. The SELECT above and this UPDATE are inside ONE IMMEDIATE transaction,
    // so the write lock is held from the first statement — the loser's SELECT runs after the
    // winner has committed, sees a row that is no longer `pending_review`, and returns `missing`
    // before reaching here. Nothing can make the UPDATE match zero rows.
    //
    // So an already-decided submission is a 404, which is also the honest answer: it is not in the
    // moderation queue. The old route's 409 was dead too — its own SELECT caught the sequential
    // case first, and the concurrent case never reached the branch either.


    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, ?, 'exercise', ?, ?, ?, ?)`,
    ).run(
      adminId,
      approve ? 'exercise.moderation.approve' : 'exercise.moderation.reject',
      exerciseId,
      JSON.stringify({ name: target.name, ownerId: target.ownerId, reason }),
      requestId,
      ip,
    );

    return { outcome: 'applied', id: target.id, name: target.name };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * ═══ THE SEAT CAP, WRITTEN ONCE ════════════════════════════════════════════════════════════════
 *
 * Called by BOTH paths that create a coach-client link — `redeemInviteTx` and
 * `pregenerateClientTx` — because a cap enforced on one of two paths is a cap with a hole, and the
 * bulk pregeneration is the path where a coach could add fifty in a single request.
 *
 * ═══ IT ASKS "MAY THIS LINK BE ADDED", NEVER "IS THIS COACH OVER THE CAP" ══════════════════════
 *
 * The distinction is the whole design. A coach's tier can drop WITHOUT their consent — a card
 * expires, a payment fails, the processor moves them to `canceled` — and a rule phrased as "a
 * coach on Starter may not HAVE more than ten clients" turns a bank's fraud heuristic into
 * dissolved coaching relationships. Enforcing at the moment a link is ADDED means a downgrade
 * freezes growth and touches nothing that already exists.
 *
 * Three rules, each of which had to be decided rather than defaulted:
 *
 *   1. A link that is ALREADY active consumes no new seat. Re-redeeming a live link is a no-op for
 *      the count, and charging it a seat would refuse an idempotent repeat.
 *   2. `canceled` resolves to FREE, not to the tier the row still names. The row keeps `pro` after
 *      cancellation so the history is legible; the entitlement does not survive it.
 *   3. `past_due` KEEPS the tier. That is a dunning window, not a decision — see 026's comment.
 *
 * `client_cap IS NULL` is unlimited, and it is the only spelling of unlimited in the schema.
 */
function hasSeat(coachId, clientId) {
  const alreadyActive = stmt(
    `SELECT 1 FROM coach_clients WHERE coach_id = ? AND client_id = ? AND status = 'active'`,
  ).get(coachId, clientId);
  if (alreadyActive) return true;

  const tier = stmt(
    `SELECT t.client_cap AS cap
       FROM subscription_tiers t
      WHERE t.key = COALESCE(
        (SELECT s.tier_key FROM coach_subscriptions s
          WHERE s.coach_id = ? AND s.status IN ('trialing', 'active', 'past_due')),
        'free')`,
  ).get(coachId);

  // A missing tier row is a broken install, not a case to have a policy about: 026 inserts `free`
  // and a foreign key guards every other reference. Failing OPEN here would silently hand every
  // coach an unlimited plan the first time somebody deleted a row; failing closed would refuse
  // every client in the product. Neither is a thing to do quietly.
  if (!tier) throw new Error(`seat cap: no subscription tier resolves for coach ${coachId}`);

  if (tier.cap === null) return true;

  const used = stmt(
    `SELECT COUNT(*) AS n FROM coach_clients WHERE coach_id = ? AND status = 'active'`,
  ).get(coachId).n;
  return used < tier.cap;
}

/**
 * Pre-generate ONE client account and link it to the coach.
 *
 * ═══ THIS WAS A writeTx WITH THE USER CREATED OUTSIDE IT ═══════════════════════════════════════
 *
 * The route inserted the `users` row on its own, then ran a `writeTx` holding the link and the
 * audit row. That shape had no failure mode while nothing could refuse the link — and the seat cap
 * is exactly something that can. A refused link would have left an account behind that belongs to
 * nobody: an email address consumed, a password hash on disk, a row the coach cannot see and the
 * client was never told about. The next attempt for that address would then be told it is taken.
 *
 * So the user, the link and the audit row are one named transaction, and the cap is decided before
 * the first write — ADR-0005's law, which is what makes "refused" mean nothing happened at all.
 *
 * The argon2 hash arrives as an argument rather than being computed here. It costs ~50 ms of CPU by
 * design, and doing that inside a held write lock would stall every other writer in the process for
 * the duration, fifty times over on a full batch.
 *
 * The email check moved INSIDE too. Outside, two requests for the same address could both pass it
 * and the second would fail on the unique index — a 500 where the route already knows how to say
 * "skipped".
 */
export function pregenerateClientTx({ coachId, email, passwordHash, teamId = null, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── everything that can refuse, before anything is written ────────────────────────────────

    current = 'SELECT the email';
    const taken = stmt('SELECT id FROM users WHERE lower(trim(email)) = ?').get(email);
    // Never silently attach an account that already belongs to somebody: that would hand a coach a
    // live account they did not create, password unknown to them but access granted.
    if (taken) return { outcome: 'email_taken' };

    current = 'CHECK the seat';
    // `clientId` is null — the account does not exist yet, so it cannot already hold a seat.
    if (!hasSeat(coachId, null)) return { outcome: 'seat_limit' };

    // ── from here on nothing may conditionally return ─────────────────────────────────────────

    current = 'INSERT the user';
    const user = stmt(
      'INSERT INTO users (email, password_hash, must_change_credentials, created_by) VALUES (?, ?, 1, ?)',
    ).run(email, passwordHash, coachId);

    current = 'INSERT the link';
    stmt(
      `INSERT INTO coach_clients (coach_id, client_id, team_id, status, origin, accepted_at)
       VALUES (?, ?, ?, 'active', 'pregenerated', unixepoch())`,
    ).run(coachId, user.lastInsertRowid, teamId);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'client.pregenerate', 'user', ?, ?, ?, ?)`,
    ).run(coachId, user.lastInsertRowid, JSON.stringify({ email, teamId }), requestId, ip);

    return { outcome: 'created', userId: Number(user.lastInsertRowid) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Redeem an invite code.
 *
 * MEASURED BEFORE: an EXHAUSTED code was refused with "this code has been used up" and the client
 * was linked to the coach anyway — `status = 'active'`, which is a coach reading somebody's logs,
 * assigning them plans and opening a chat with them. The person who redeemed it was told it did
 * not work.
 *
 * ═══ THERE IS EXACTLY ONE RETURN, AND THAT IS THE WHOLE DESIGN ═════════════════════════════════
 *
 * The redemption RECORD has to be written on every path — a refused attempt is precisely what
 * `invite_redemptions` exists to remember, so the writes here are not all conditional on success.
 * That makes the usual shape ("check, refuse, write") unavailable: a conditional return after the
 * record would be a return after a write, and the reader could not tell an intended commit from
 * the accidental kind without reading every branch.
 *
 * So the outcome is COMPUTED first, the writes are chosen from it, and the function returns once at
 * the bottom. The consequence — the link, the referral — is written only on the accepted path,
 * which is the entire fix. Nothing branches on a result after a write.
 *
 * `own_team` deliberately writes no record: `invite_redemptions.outcome` is CHECKd against five
 * values and that is not one of them, because a coach fumbling their own code is not an event
 * anybody needs to audit.
 */
export function redeemInviteTx({ userId, digest, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── everything is decided before anything is written ──────────────────────────────────────

    current = 'SELECT the code';
    // The lookup IS the constant-time comparison: SQLite matches the digest through an index, and
    // the route hashed the user's input before it got here. The old code re-compared the same two
    // values in JS afterwards, described in its own comment as belt and braces — a re-comparison of
    // a row selected BY equality can only ever agree.
    const code = stmt(
      `SELECT id, coach_id AS coachId, team_id AS teamId, max_uses AS maxUses, uses,
              expires_at AS expiresAt, revoked_at AS revokedAt
         FROM invite_codes WHERE code_hash = ?`,
    ).get(digest);

    const now = stmt('SELECT unixepoch() AS t').get().t;
    let outcome = 'accepted';
    if (!code) outcome = 'unknown';
    else if (code.revokedAt) outcome = 'revoked';
    else if (code.expiresAt && code.expiresAt <= now) outcome = 'expired';
    else if (code.coachId === userId) outcome = 'own_team';
    else if (!hasSeat(code.coachId, userId)) outcome = 'seat_limit';

    // ── the writes, chosen from the outcome, with no return between them ──────────────────────

    if (outcome === 'accepted') {
      current = 'UPDATE the use count';
      // The guard is in the WHERE clause and it is the arbiter of the race: two clients redeeming
      // the last seat at the same instant cannot both win. What is new is that losing it now
      // prevents the link below, rather than merely changing the status code.
      const consumed = stmt(
        `UPDATE invite_codes SET uses = uses + 1
          WHERE id = ? AND uses < max_uses AND revoked_at IS NULL`,
      ).run(code.id);
      if (consumed.changes === 0) outcome = 'exhausted';
    }

    if (outcome === 'accepted') {
      current = 'INSERT the link';
      stmt(
        `INSERT INTO coach_clients (coach_id, client_id, team_id, status, origin, accepted_at)
         VALUES (?, ?, ?, 'active', 'team_code', unixepoch())
         ON CONFLICT(coach_id, client_id) DO UPDATE SET
           status = 'active',
           team_id = excluded.team_id,
           accepted_at = unixepoch(),
           archived_at = NULL`,
      ).run(code.coachId, userId, code.teamId);

      current = 'INSERT the referral';
      stmt(
        'INSERT OR IGNORE INTO referrals (coach_id, referred_user_id, code_id) VALUES (?, ?, ?)',
      ).run(code.coachId, userId, code.id);
    }

    if (outcome !== 'own_team') {
      current = 'INSERT the redemption record';
      stmt(
        'INSERT INTO invite_redemptions (code_id, user_id, outcome, ip) VALUES (?, ?, ?, ?)',
      ).run(code?.id ?? null, userId, outcome, ip);
    }

    current = 'SELECT the link back';
    const link = outcome === 'accepted'
      ? stmt(
          'SELECT id, team_id AS teamId FROM coach_clients WHERE coach_id = ? AND client_id = ?',
        ).get(code.coachId, userId)
      : null;

    return { outcome, coachId: code?.coachId ?? null, link };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * GDPR — the two operations a person may perform on their own record.
 *
 * The table list lives in ./gdpr.js and is shared by both, because an export is a claim about which
 * tables hold somebody's data and a deletion is a claim that the same list is complete. Two lists
 * would drift, and the drift would be invisible: a table in neither is data the subject cannot see
 * and that survives their erasure.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Everything the product holds about one person.
 *
 * ═══ IT IS ONE TRANSACTION, AND THAT IS NOT PEDANTRY ═══════════════════════════════════════════
 *
 * Each call into the pool is a different worker thread with its own read snapshot. An export
 * assembled from thirty pool calls is thirty moments stitched together: a workout that appears in
 * the log and not in its sets, because it was written between two of them. A DEFERRED transaction
 * takes one read snapshot and every statement below sees the same database.
 *
 * Read-only, so nothing here can commit anything wrongly — the ADR's hazard does not apply.
 */
export function exportMyDataQuery({ userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    const out = {};
    for (const [key, sql] of EXPORT_TABLES) {
      current = key;
      // Two placeholders in the coach-links statement, one everywhere else. Counting the `?`s is
      // how the binding stays right without a per-table argument list to keep in step.
      const arity = (sql.match(/\?/g) ?? []).length;
      out[key] = stmt(sql).all(...Array(arity).fill(userId));
    }
    return out;
  });

  try {
    return { exportedAt: Math.floor(Date.now() / 1000), data: tx.deferred() };
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Erase an account, at the person's own request.
 *
 * ═══ THE LAST-ADMIN GUARD HERE CAN ACTUALLY FIRE ═══════════════════════════════════════════════
 *
 * Two other transactions in this file had a last-admin count deleted for being unreachable: their
 * actor is always an enabled admin and can never be the target, so the number of OTHER admins is at
 * least one by construction.
 *
 * That argument does not hold here, because the actor IS the target. The sole admin deleting their
 * own account leaves the product with none and no way to mint one — every route that could is
 * behind requireRole('admin'). Described firing: log in as the only admin, call this, get
 * `last_admin`. It is refused rather than warned about, and the way out is to promote somebody
 * first, which is a decision a person should make deliberately.
 *
 * ═══ AND THE AUDIT ROW IS WRITTEN BEFORE THE DELETE, ON PURPOSE ════════════════════════════════
 *
 * 018 made `audit_log.actor_id` the one column an FK may set to NULL, so writing the row first and
 * deleting the user second leaves a permanent, ANONYMOUS record that an account was erased. It
 * carries the role and the account's age and nothing else — an erasure record that names the person
 * is not an erasure.
 */
/*
 * ═══ NO `ip` PARAMETER, AND ITS ABSENCE IS THE CONTROL ═════════════════════════════════════════
 *
 * This took one and passed it to the audit row. Measured on the dev database:
 *
 *     account.erase   actor=null  ip="::1"  detail={"role":"user","accountAgeDays":0}
 *
 * `actor_id` is NULL because the foreign key anonymised it, exactly as 018 designed — and 018's
 * trigger permits that ONE update and freezes every other column. So the IP address of the person
 * who asked to be erased is permanent, on the row that records their erasure, and no code path in
 * the product can ever remove it. An IP is an identifier; a record that keeps one is not an erasure.
 *
 * Removing the PARAMETER rather than passing null at the call site: a null argument is one edit away
 * from being filled in again by somebody adding "just a bit more context to the audit row".
 */
export function deleteMyAccountTx({ userId, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── every check that can return an error result runs BEFORE the first write ──────────────

    current = 'SELECT the account';
    const me = stmt('SELECT id, role, created_at AS createdAt FROM users WHERE id = ?').get(userId);
    if (!me) return { outcome: 'missing' };

    current = 'COUNT the remaining admins';
    if (me.role === 'admin') {
      const others = stmt(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> ?",
      ).get(userId).n;
      if (others === 0) return { outcome: 'last_admin' };
    }

    // ── from here on, nothing may conditionally return ────────────────────────────────────────

    current = 'UNLINK what outlives them';
    const unlinked = {};
    for (const [label, sql] of UNLINK_BEFORE_DELETE) {
      unlinked[label] = stmt(sql).run(userId).changes;
    }

    current = 'INSERT audit_log';
    // Written FIRST so the FK can anonymise it when the user goes. Nothing identifying: the role
    // and the account's age are facts about a deletion, not about a person.
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'account.erase', 'user', ?, ?, ?, ?)`,
    ).run(userId, userId, JSON.stringify({ role: me.role, accountAgeDays: Math.floor((Math.floor(Date.now() / 1000) - me.createdAt) / 86400) }), requestId, null);

    current = 'DELETE the account';
    // 39 foreign keys cascade from here and 16 set null, measured with pragma_foreign_key_list.
    // Nothing is deleted by hand: a hand-written cascade is a list that goes stale the first time
    // somebody adds a table, and it goes stale silently.
    stmt('DELETE FROM users WHERE id = ?').run(userId);

    return { outcome: 'erased', unlinked };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Claim a processor event, exactly once.
 *
 * The INSERT is the claim. A `SELECT` first would let two concurrent deliveries of the same event
 * both see nothing and both proceed — and a retry arriving while the first is still in flight is
 * the documented behaviour of every webhook sender, not an edge case.
 *
 * Returns `{ fresh: false }` for a duplicate rather than throwing, because a replay is a normal
 * outcome and not an error: the caller answers 200 to stop the sender retrying something that
 * already happened.
 */
export function claimProcessorEventTx({ eventId, eventType, eventAt, requestId = null, provider = 'stripe' }) {
  const conn = getDb();
  let current = 'INSERT the event claim';
  const tx = conn.transaction(() => {
    // `OR IGNORE` against the unique index, then read `changes`. One statement, no race.
    const r = stmt(
      `INSERT OR IGNORE INTO processor_events (provider, event_id, event_type, event_at, request_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(provider, eventId, eventType, eventAt, requestId);
    return { fresh: r.changes === 1 };
  });
  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Apply a verified subscription event.
 *
 * ═══ THE OUT-OF-ORDER GUARD IS THE WHOLE DIFFICULTY ════════════════════════════════════════════
 *
 * Webhooks arrive out of order by documented design — a retry of Monday's `canceled` can land
 * after Tuesday's `active`, and applying it would cancel a paying customer. So `provider_event_at`
 * is compared INSIDE the UPDATE: an event no newer than the row we hold changes nothing, and
 * `changes === 0` is how the caller learns it was stale rather than lost.
 *
 * ═══ AND EQUAL TIMESTAMPS APPLY, WHICH IS A CORRECTION ═════════════════════════════════════════
 *
 * This first refused them, reasoning that two events sharing a second are indistinguishable and the
 * safe reading of "I cannot tell which came first" is to keep what is stored. `verify:subscription`
 * refuted it within a minute: a `pro → unpaid` transition sent in the same second as the event
 * before it was silently dropped, and the coach kept a plan they had stopped paying for.
 *
 * The reasoning was wrong because this guard is not the defence against replay. A stale event
 * cannot get here at all — `verifyWebhook` refuses anything outside a five-minute window, and
 * `processor_events` refuses a repeat of one inside it. What this guard defends against is
 * LEGITIMATE out-of-order delivery, where the timestamps genuinely differ and Monday's cancellation
 * arrives after Tuesday's renewal. Those it still catches.
 *
 * Same-second events are genuinely concurrent, and Stripe's clock has no finer resolution to offer.
 * Refusing them loses real updates to defend against an attack two other layers have already
 * closed; letting the later arrival win costs nothing that was not already ambiguous.
 *
 * ═══ FINDING THE COACH ═════════════════════════════════════════════════════════════════════════
 *
 * Three ways, in the order they are trustworthy: a subscription we have seen, a customer we have
 * seen, and — only for the first event of a new subscription — the coach id the Checkout Session
 * put in metadata. The hint is verified against `users` before it is used, because it round-trips
 * through a third party.
 *
 * An event that resolves to nobody is NOT applied and NOT swallowed: `unattributed` goes back to
 * the route, which logs it at error level. Silently dropping it would mean a coach who paid gets
 * nothing and no line anywhere says why.
 */
export function applySubscriptionEventTx({
  subscriptionId, customerId, priceId, status, currentPeriodEnd = null, coachIdHint = null,
  eventAt, provider = 'stripe',
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    // ── everything that can refuse runs before the first write ────────────────────────────────

    current = 'RESOLVE the tier';
    // A price this product does not sell is a configuration mistake, not a plan. Applying it would
    // have to invent a tier; refusing names the price so somebody can add the row.
    const tier = priceId
      ? stmt('SELECT key FROM subscription_tiers WHERE provider_price_id = ?').get(priceId)
      : null;
    if (priceId && !tier) return { outcome: 'unknown_price', priceId };

    current = 'RESOLVE the coach';
    let row =
      stmt('SELECT coach_id AS id, provider_event_at AS at FROM coach_subscriptions WHERE provider = ? AND provider_subscription_id = ?')
        .get(provider, subscriptionId) ??
      stmt('SELECT coach_id AS id, provider_event_at AS at FROM coach_subscriptions WHERE provider = ? AND provider_customer_id = ?')
        .get(provider, customerId) ??
      null;

    let coachId = row?.id ?? null;
    if (coachId === null && coachIdHint !== null) {
      // Verified against the table, never trusted from the payload.
      const hinted = stmt("SELECT id FROM users WHERE id = ? AND role IN ('coach', 'admin')").get(coachIdHint);
      if (hinted) coachId = hinted.id;
    }
    if (coachId === null) return { outcome: 'unattributed', subscriptionId, customerId };

    // A cancellation for a price we no longer sell must still land — otherwise a retired plan
    // becomes uncancellable. The tier only changes when the event names a price we know.
    const tierKey = tier?.key ?? null;

    // ── from here on nothing may conditionally return ─────────────────────────────────────────

    current = 'UPSERT the subscription';
    const r = stmt(
      `INSERT INTO coach_subscriptions
         (coach_id, tier_key, status, provider, provider_customer_id, provider_subscription_id,
          current_period_end, provider_event_at, updated_at)
       VALUES (?, COALESCE(?, 'free'), ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(coach_id) DO UPDATE SET
         tier_key                 = COALESCE(excluded.tier_key, coach_subscriptions.tier_key),
         status                   = excluded.status,
         provider_customer_id     = excluded.provider_customer_id,
         provider_subscription_id = excluded.provider_subscription_id,
         current_period_end       = excluded.current_period_end,
         provider_event_at        = excluded.provider_event_at,
         updated_at               = unixepoch()
       WHERE coach_subscriptions.provider_event_at IS NULL
          OR coach_subscriptions.provider_event_at <= excluded.provider_event_at`,
    ).run(coachId, tierKey, status, provider, customerId, subscriptionId, currentPeriodEnd, eventAt);

    return r.changes === 1
      ? { outcome: 'applied', coachId, tierKey: tierKey ?? 'unchanged', status }
      : { outcome: 'stale', coachId };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
