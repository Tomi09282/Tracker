// src/db/worker.js — runs inside a Piscina worker thread.
//
// better-sqlite3 is deliberately synchronous: every query blocks whichever event loop it runs
// on. Wrapping a sync call in a Promise changes nothing — the work has to leave the main
// thread. Each worker owns exactly one encrypted connection; connections cannot be shared
// across threads.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
 * Numbered migrations gated by PRAGMA user_version.
 *
 * The version bump happens INSIDE the same transaction as the migration body: if the process
 * dies mid-file, the whole file rolls back together with the bump, so the next boot re-applies
 * it cleanly. A bump outside the transaction can leave a schema that claims to be newer than
 * it is — which is unrecoverable without manual surgery.
 */
export function migrate({ files }) {
  const conn = getDb();
  const applied = [];
  let currentFile = null;
  for (const { version, sql } of files) {
    currentFile = version;
    const current = conn.pragma('user_version', { simple: true });
    if (version <= current) continue;
    const tx = conn.transaction(() => {
      conn.exec(sql);
      // pragma cannot be parameterized; `version` comes from the filename, validated by the
      // caller against /^\d+/ before it ever reaches here.
      conn.pragma(`user_version = ${version}`);
    });
    try { tx.immediate(); } catch (err) { return rethrow(err, `migration ${currentFile}`); }
    applied.push(version);
  }
  return { applied, version: conn.pragma('user_version', { simple: true }) };
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
              ua.id, 'ach:' || ua.id, NULL, ?
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
