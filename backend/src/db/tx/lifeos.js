// src/db/tx/lifeos.js — the LifeOS core's named worker transactions and reads (migration 031).
//
// Runs INSIDE a Piscina worker: worker.js re-exports this module (`export * from './tx/lifeos.js'`)
// and Piscina resolves a task by export name, so every name the facade passes (src/db/index.js) is
// an `export function` here. check-route-tx proves each facade name resolves; check-worker-tx and
// check-admin-audit read this file through scripts/lib/worker-sources.mjs.
//
// ═══ THE RULES EVERY FUNCTION BELOW KEEPS ══════════════════════════════════════════════════════
//
//   * ONE logical read or write = ONE worker call. A transaction never spans two pool calls.
//   * IMMEDIATE transactions (`tx.immediate()`): the write lock is taken on the first statement,
//     so every read that decides a payout happens under the same lock as the payout.
//   * ADR-0005: better-sqlite3 COMMITS ON RETURN. Every check that can refuse runs BEFORE the first
//     write; after it nothing returns conditionally, and an invariant that fails THROWS.
//   * Prepared statements with bound parameters only; the SQL text never varies with input.
//   * Every coin movement goes through postCoinEvent: cap -> event -> ledger. Nothing else here
//     inserts into coin_events or coin_ledger.
//   * "Now" is the worker's own clock — never a value from a request.
import { getDb, stmt, rethrow } from '../conn.js';
import {
  addDaysToKey,
  calendarKeyFor,
  dayKeyFor,
  dayStartInstant,
  dueDays,
  epochDay,
  offsetMs,
  settledThroughFor,
  weekdayIndex,
  SETTLE_DELAY_MS,
} from '../../lifeos/dates.js';
import {
  evaluateKcal,
  levelProgress,
  parseStoredRules,
  pointRulesSchema,
  pointsToMinor,
  workoutPoints,
  RULE_KEYS,
} from '../../lifeos/rules.js';
import { expandOccurrences, workoutDueOn } from '../../plans/occurrences.js';
import { DAY_KCAL_EATEN_SQL, DAY_TARGETS_SQL } from '../../nutrition/daySql.js';

/* ══ shared reads (helpers, not tasks: NOT exported, so Piscina cannot be asked to run them) ══ */

function readPrefs(userId) {
  return stmt(
    `SELECT p.timezone, p.timezone_set_at AS timezoneSetAt, p.day_start_hour AS dayStartHour,
            p.lifeos_started_on AS startedOn, p.kcal_tolerance_pct AS kcalTolerancePct
       FROM user_prefs p JOIN users u ON u.id = p.user_id AND u.disabled_at IS NULL
      WHERE p.user_id = ?`,
  ).get(userId);
}

/** The rule set in force: the newest row. Parsed with the same schema that admitted it. */
function readRules() {
  const row = stmt('SELECT id, rules_json FROM point_rule_sets ORDER BY id DESC LIMIT 1').get();
  if (!row) throw new Error('lifeos: no point rule set exists (migration 031 seeds version 1)');
  return { version: row.id, rules: parseStoredRules(row.rules_json) };
}

function lastSettled(userId) {
  return stmt('SELECT MAX(local_date) AS d FROM daily_summaries WHERE user_id = ?').get(userId).d;
}

/** Coins EARNED on a logical day: positive originals that have not been reversed. */
function earnedOn(userId, localDate) {
  return stmt(
    `SELECT COALESCE(SUM(e.amount_minor), 0) AS n FROM coin_events e
      WHERE e.user_id = ? AND e.local_date = ? AND e.amount_minor > 0
        AND e.reverses_event_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)`,
  ).get(userId, localDate).n;
}

/** The live (not reversed) original event for one thing, if any. */
function activeEvent(userId, reasonKey, sourceType, sourceId) {
  return stmt(
    `SELECT e.id, e.amount_minor AS amountMinor, e.seq FROM coin_events e
      WHERE e.user_id = ? AND e.reason_key = ? AND e.source_type = ? AND e.source_id = ?
        AND e.reverses_event_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)
      ORDER BY e.seq DESC LIMIT 1`,
  ).get(userId, reasonKey, sourceType, sourceId);
}

/** Every scheduled occurrence in a window, read under the caller's lock and expanded by THE rule. */
function loadOccurrences(userId, fromDate, days) {
  const planFilter = `client_user_id = ? AND archived_at IS NULL AND status = 'active'
                      AND starts_on IS NOT NULL AND (ends_on IS NULL OR ends_on >= ?)`;
  const plans = stmt(
    `SELECT id, name, cycle_days, starts_on, ends_on FROM workout_plans WHERE ${planFilter}`,
  ).all(userId, fromDate);
  if (!plans.length) return [];
  const planDays = stmt(
    `SELECT d.id, d.plan_id, d.day_index, d.slot, d.name, d.is_rest, d.est_minutes, d.start_time,
            (SELECT COUNT(*) FROM workout_plan_exercises px
               JOIN workout_plan_blocks b ON b.id = px.block_id
              WHERE b.day_id = d.id) AS exercise_count
       FROM workout_plan_days d
      WHERE d.plan_id IN (SELECT id FROM workout_plans WHERE ${planFilter})
      ORDER BY d.day_index, d.slot`,
  ).all(userId, fromDate);
  const exceptions = stmt(
    `SELECT day_id, occurrence_date, action, moved_to_date FROM workout_plan_day_exceptions
      WHERE plan_id IN (SELECT id FROM workout_plans WHERE ${planFilter})`,
  ).all(userId, fromDate);
  const logs = stmt(
    `SELECT plan_day_id, occurrence_date, id, status FROM workout_logs
      WHERE client_user_id = ? AND occurrence_date IS NOT NULL AND occurrence_date >= ?`,
  ).all(userId, fromDate);
  return expandOccurrences({ plans, planDays, exceptions, logs }, fromDate, days);
}

function workoutDoneOn(userId, localDate) {
  return stmt(
    `SELECT 1 FROM workout_logs WHERE client_user_id = ? AND local_date = ? AND status = 'completed' LIMIT 1`,
  ).get(userId, localDate)
    ? 1
    : 0;
}

/** The moment the NEXT day settles, for the per-process memo in src/lifeos/settle.js. */
function nextSettleAt(settledThrough, prefs) {
  return dayStartInstant(addDaysToKey(settledThrough, 2), prefs.timezone, prefs.dayStartHour).getTime() + SETTLE_DELAY_MS;
}

/** The wallet as the Érmék screen reads it: balance (may be < 0), spendable, XP, level, the week. */
function walletView(userId, prefs, rules, nowMs) {
  const balanceMinor = stmt('SELECT balance_minor FROM coin_wallets WHERE user_id = ?').get(userId)?.balance_minor ?? 0;
  const xpMinor = stmt('SELECT COALESCE(SUM(xp_minor), 0) AS n FROM coin_events WHERE user_id = ?').get(userId).n;
  const xp = Math.floor(Math.max(0, xpMinor) / 100);
  const { level, floorXp, nextXp } = levelProgress(xp);

  let today = null;
  let week = [];
  let todayEarnedMinor = null;
  if (prefs?.timezone) {
    today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
    todayEarnedMinor = earnedOn(userId, today);
    const monday = addDaysToKey(today, -weekdayIndex(today));
    const sunday = addDaysToKey(monday, 6);
    const rows = stmt(
      `SELECT local_date AS date, SUM(amount_minor) AS netMinor FROM coin_events
        WHERE user_id = ? AND local_date >= ? AND local_date <= ?
        GROUP BY local_date`,
    ).all(userId, monday, sunday);
    const byDate = new Map(rows.map((r) => [r.date, r.netMinor]));
    week = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysToKey(monday, i);
      return { date, netMinor: byDate.get(date) ?? 0, future: date > today };
    });
  }
  const settleHour = ((prefs?.dayStartHour ?? 4) + SETTLE_DELAY_MS / 3600000) % 24;
  return {
    balanceMinor,
    spendableMinor: Math.max(0, balanceMinor),
    xp,
    level,
    bounds: { levelFloorXp: floorXp, nextLevelXp: nextXp },
    dailyEarnCapMinor: pointsToMinor(rules.dailyEarnCap),
    todayEarnedMinor,
    today,
    week,
    settleTime: `${String(settleHour).padStart(2, '0')}:00`,
  };
}

/* ══ postCoinEvent — the ONLY writer of coin_events and of LifeOS ledger rows ════════════════════ */

/**
 * cap -> event -> ledger, inside the caller's transaction. Returns the event, or null when nothing
 * was written (a zero amount, or an earn with no room left under the daily cap).
 *
 *   * THE CAP: an earn (positive, not a reversal) is trimmed to the room left today under the rule
 *     set in force. trg_coin_event_daily_cap is the backstop; it never fires on this path.
 *   * ONE LIVE AWARD PER THING: if the thing already has a live original, that is a caller defect
 *     (every caller checks first, under the same lock) — THROW, so the transaction rolls back.
 *   * THE LEDGER ROW IS READ FROM THE EVENT, not from the arguments, so the two cannot disagree;
 *     trg_coin_ledger_ref_truthful proves it again. A ledger insert that writes no row THROWS.
 *
 * Penalties are NOT capped and may take the balance below zero (plan L3); they are not spends, so
 * trg_coin_ledger_spend_covered lets them through.
 */
function postCoinEvent({
  userId, reasonKey, amountMinor, localDate, sourceType, sourceId,
  rules, rulesVersion, requestId, note = null,
}) {
  if (!Number.isInteger(amountMinor) || amountMinor === 0) return null;

  let amount = amountMinor;
  let capped = false;
  if (amount > 0) {
    const room = pointsToMinor(rules.dailyEarnCap) - earnedOn(userId, localDate);
    if (room <= 0) return null;
    if (amount > room) {
      amount = room;
      capped = true;
    }
  }

  if (activeEvent(userId, reasonKey, sourceType, sourceId)) {
    throw new Error(`postCoinEvent: ${reasonKey} for ${sourceType} ${sourceId} is already live`);
  }
  const seq = stmt(
    `SELECT COALESCE(MAX(seq) + 1, 0) AS n FROM coin_events
      WHERE user_id = ? AND reason_key = ? AND source_type = ? AND source_id = ?
        AND reverses_event_id IS NULL`,
  ).get(userId, reasonKey, sourceType, sourceId).n;

  const ev = stmt(
    `INSERT INTO coin_events
       (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, seq,
        rules_version, request_id, note)
     SELECT ?, r.key, ?, CASE WHEN r.xp = 1 THEN ? ELSE 0 END, ?, ?, ?, ?, ?, ?, ?
       FROM coin_reasons r WHERE r.key = ? AND r.active = 1`,
  ).run(
    userId, amount, amount, localDate, sourceType, sourceId, seq,
    rulesVersion, requestId, capped ? (note ?? 'capped') : note, reasonKey,
  );
  if (ev.changes !== 1) throw new Error(`postCoinEvent: reason ${reasonKey} is not live`);
  const eventId = Number(ev.lastInsertRowid);

  const led = stmt(
    `INSERT INTO coin_ledger
       (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, actor_user_id,
        request_id, note)
     SELECT e.user_id, e.amount_minor, e.reason_key, 'coin_event', e.id,
            'evt:' || printf('%010d', e.id), NULL, e.request_id, e.note
       FROM coin_events e WHERE e.id = ?`,
  ).run(eventId);
  if (led.changes !== 1) throw new Error('postCoinEvent: the ledger row did not follow its event');

  return { eventId, reasonKey, amountMinor: amount, capped };
}

/* ══ reads ═══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * What ensureSettled needs to decide which days are due: one read, one snapshot.
 */
export function lifeosSettleStateQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { started: false };
    const now = Date.now();
    const settledThrough = settledThroughFor(now, prefs.timezone, prefs.dayStartHour);
    const lastClosed = lastSettled(userId);
    return {
      started: true,
      startedOn: prefs.startedOn,
      lastClosed,
      settledThrough,
      nextSettleAt: nextSettleAt(settledThrough, prefs),
      due: dueDays({ lastClosed, startedOn: prefs.startedOn, settledThrough }),
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /me/prefs and the PATCH answer. */
function prefsView(userId) {
  const prefs = readPrefs(userId);
  if (!prefs) return null;
  const now = Date.now();
  const tz = prefs.timezone;
  return {
    timezone: tz,
    dayStartHour: prefs.dayStartHour,
    startedOn: prefs.startedOn,
    utcOffsetMinutes: tz ? Math.round(offsetMs(now, tz) / 60000) : null,
    today: tz ? dayKeyFor(now, tz, prefs.dayStartHour) : null,
    // The next moment the zone may change (null = it may change now).
    timezoneChangeableAt:
      tz && prefs.timezoneSetAt && now / 1000 - prefs.timezoneSetAt < 86400
        ? (prefs.timezoneSetAt + 86400) * 1000
        : null,
  };
}

export function userPrefsQuery({ userId }) {
  try {
    return prefsView(userId);
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /lifeos/today (Phase-2 fields). One read snapshot. */
export function lifeosTodayQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    if (!prefs) return null;
    const { version, rules } = readRules();
    const now = Date.now();
    const tz = prefs.timezone;
    // The date a workout started NOW is logged on (workout_logs.local_date is the calendar date in
    // the user's zone, src/plans/schedule.js localDateFor) — UTC while no zone is stored.
    const workoutDate = tz ? calendarKeyFor(now, tz) : new Date(now).toISOString().slice(0, 10);
    const occurrences = loadOccurrences(userId, workoutDate, 1).filter((o) => o.date === workoutDate);
    const settledThrough = tz ? settledThroughFor(now, tz, prefs.dayStartHour) : null;
    return {
      started: Boolean(tz && prefs.startedOn),
      timezone: tz,
      dayStartHour: prefs.dayStartHour,
      startedOn: prefs.startedOn,
      today: tz ? dayKeyFor(now, tz, prefs.dayStartHour) : null,
      settledThrough: prefs.startedOn && settledThrough && settledThrough >= prefs.startedOn ? settledThrough : null,
      rulesVersion: version,
      wallet: walletView(userId, prefs, rules, now),
      workout: {
        date: workoutDate,
        due: workoutDueOn(occurrences, workoutDate),
        done: Boolean(workoutDoneOn(userId, workoutDate)),
        pointsFull: rules.workoutComplete,
        occurrences: occurrences.map((o) => ({
          planId: o.plan_id,
          planName: o.plan_name,
          dayId: o.day_id,
          dayName: o.day_name,
          isRest: Boolean(o.is_rest),
          estMinutes: o.est_minutes,
          startTime: o.start_time,
          exerciseCount: o.exercise_count,
          logId: o.log_id,
          logStatus: o.log_status,
        })),
      },
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /coins/wallet. */
export function walletQuery({ userId }) {
  try {
    const prefs = readPrefs(userId);
    const { rules } = readRules();
    return walletView(userId, prefs, rules, Date.now());
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /admin/rules: the rule set in force, who wrote it and when. */
export function pointRulesQuery() {
  try {
    const row = stmt(
      `SELECT s.id AS version, s.rules_json, s.note, s.created_at AS createdAt,
              u.display_name AS createdByName
         FROM point_rule_sets s LEFT JOIN users u ON u.id = s.created_by
        ORDER BY s.id DESC LIMIT 1`,
    ).get();
    if (!row) return null;
    const { rules_json: json, ...rest } = row;
    return { ...rest, rules: parseStoredRules(json) };
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ setUserPrefsTx — PATCH /me/prefs ════════════════════════════════════════════════════════════ */

/**
 * The timezone and the day start.
 *
 *   * The zone changes at most once per 24 h (trg_user_prefs_timezone_daily is the backstop): a
 *     zone switch moves "today", and switching back and forth is a way to live one day twice.
 *     Every change is AUDITED (plan: "tz change <= 1/24 h, audited").
 *   * The first time a zone is known, LifeOS starts: lifeos_started_on = the logical today. Days
 *     before it never settle. Written once (trg_user_prefs_started_once).
 *   * The same zone again is a no-op for the zone (the client re-sends the browser zone on every
 *     open), so it never spends the 24 h allowance.
 */
export function setUserPrefsTx({ userId, timezone, dayStartHour, requestId, ip = null }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs) return { outcome: 'missing' };

    const tzChanged = timezone !== undefined && timezone !== prefs.timezone;
    const dshChanged = dayStartHour !== undefined && dayStartHour !== prefs.dayStartHour;
    const now = Date.now();
    if (tzChanged && prefs.timezone && prefs.timezoneSetAt && now / 1000 - prefs.timezoneSetAt < 86400) {
      return { outcome: 'too_soon', changeableAt: (prefs.timezoneSetAt + 86400) * 1000 };
    }

    const nextTz = tzChanged ? timezone : prefs.timezone;
    const nextDsh = dshChanged ? dayStartHour : prefs.dayStartHour;
    const startOn = !prefs.startedOn && nextTz ? dayKeyFor(now, nextTz, nextDsh) : null;

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE user_prefs';
    const upd = stmt(
      `UPDATE user_prefs
          SET timezone = ?,
              timezone_set_at = CASE WHEN ? THEN unixepoch() ELSE timezone_set_at END,
              day_start_hour = ?,
              lifeos_started_on = COALESCE(lifeos_started_on, ?),
              updated_at = unixepoch()
        WHERE user_id = ?`,
    ).run(nextTz, tzChanged ? 1 : 0, nextDsh, startOn, userId);
    if (upd.changes !== 1) throw new Error('setUserPrefsTx: the prefs row vanished under the lock');

    if (tzChanged) {
      current = 'INSERT audit_log (timezone)';
      stmt(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
         VALUES (?, 'lifeos.prefs.timezone', 'user', ?, ?, ?, ?)`,
      ).run(userId, userId, JSON.stringify({ from: prefs.timezone, to: nextTz }), requestId, ip);
    }
    if (dshChanged) {
      current = 'INSERT audit_log (day start)';
      stmt(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
         VALUES (?, 'lifeos.prefs.day_start', 'user', ?, ?, ?, ?)`,
      ).run(userId, userId, JSON.stringify({ from: prefs.dayStartHour, to: nextDsh }), requestId, ip);
    }

    current = 'SELECT the view';
    return { outcome: 'applied', prefs: prefsView(userId) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ setPointRulesTx — PUT /admin/rules ══════════════════════════════════════════════════════════ */

/**
 * Append a new rule set. The most consequential admin write in LifeOS: it decides what every user
 * earns from the next day close on.
 *
 *   * THE ROLE AND SESSION ARE RE-READ HERE, under the write lock (adminAdjustCoinsTx's shape): a
 *     JWT that says admin is a fifteen-minute-old hint; assertAdmin in the route is a separate pool
 *     call. The guarded INSERT repeats both, so the WRITE is gated, not just preceded by a check.
 *   * expectedVersion is an optimistic lock: two admins editing at once — the second is told the
 *     rules moved under them (409 with the current version), never silently overwrites.
 *   * The rules are validated again with the route's schema: a worker never trusts its caller.
 *   * Audited with the per-key diff.
 */
export function setPointRulesTx({
  actorId, actorSessionVersion, rules, note = null, expectedVersion, requestId, ip = null,
}) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the actor (DB-side role + session re-check)';
    const actor = stmt(
      'SELECT id, role, session_version FROM users WHERE id = ? AND disabled_at IS NULL',
    ).get(actorId);
    if (!actor || actor.role !== 'admin') return { outcome: 'forbidden' };
    if (actor.session_version !== actorSessionVersion) return { outcome: 'forbidden' };

    const parsed = pointRulesSchema.safeParse(rules);
    if (!parsed.success) return { outcome: 'invalid' };

    current = 'SELECT the rule set in force';
    const { version, rules: before } = readRules();
    if (version !== expectedVersion) return { outcome: 'stale', currentVersion: version };

    // Canonical key order, so equal rule sets are equal strings.
    const next = Object.fromEntries(RULE_KEYS.map((k) => [k, parsed.data[k]]));
    const changed = Object.fromEntries(
      RULE_KEYS.filter((k) => before[k] !== next[k]).map((k) => [k, [before[k], next[k]]]),
    );
    if (Object.keys(changed).length === 0) return { outcome: 'unchanged', version };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT point_rule_sets (role, session and version guards inside the statement)';
    const ins = stmt(
      `INSERT INTO point_rule_sets (rules_json, note, created_by)
       SELECT ?, ?, a.id FROM users a
        WHERE a.id = ? AND a.role = 'admin' AND a.session_version = ? AND a.disabled_at IS NULL
          AND (SELECT MAX(id) FROM point_rule_sets) = ?`,
    ).run(JSON.stringify(next), note, actorId, actorSessionVersion, expectedVersion);
    // The ADR-0005 exemption: the first and only write so far matched nothing, so committing
    // commits nothing. Every predicate was read above under the same lock; this cannot fire.
    if (ins.changes === 0) return { outcome: 'stale', currentVersion: version };
    const newVersion = Number(ins.lastInsertRowid);

    current = 'INSERT audit_log';
    stmt(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'lifeos.rules.set', 'point_rule_set', ?, ?, ?, ?)`,
    ).run(actorId, newVersion, JSON.stringify({ from: version, changed, note }), requestId, ip);

    current = 'SELECT the view';
    return { outcome: 'applied', view: pointRulesQuery() };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ the day close ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Settle ONE logical day (Phase 2 skeleton: kcal outcome, workout due / done, perfect day; habits
 * and tasks join in Phase 3 — their columns already exist and stay 0).
 *
 * Idempotent per (user, day): daily_summaries' PRIMARY KEY. Due-ness is decided HERE, from the
 * worker's clock and the stored prefs — never from the caller's say-so: the day must be settled
 * (start of the next day + 6 h has passed), on or after the LifeOS start, and the previous day must
 * already be settled, so days close in order and a gap cannot be skipped over.
 *
 * Perfect day = something was scheduled, all of it was done, and the kcal goal held when meals
 * were tracked against a target (perfectDayNeedsKcal). The owner's economy sheet: the perfect day
 * NEEDS the scheduled workout. With no habits yet (Phase 2), a day with no workout scheduled has
 * nothing to be perfect about.
 */
export function closeLifeDayTx({ userId, localDate, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'not_started' };
    if (localDate < prefs.startedOn) return { outcome: 'not_due' };
    const settledThrough = settledThroughFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    if (localDate > settledThrough) return { outcome: 'not_due' };

    current = 'SELECT the summary (idempotency)';
    const existing = stmt(
      'SELECT status FROM daily_summaries WHERE user_id = ? AND local_date = ?',
    ).get(userId, localDate);
    if (existing) return { outcome: 'already', status: existing.status };
    if (localDate > prefs.startedOn) {
      const prev = stmt(
        'SELECT 1 FROM daily_summaries WHERE user_id = ? AND local_date = ?',
      ).get(userId, addDaysToKey(localDate, -1));
      if (!prev) return { outcome: 'gap' };
    }

    current = 'SELECT the rules';
    const { version, rules } = readRules();

    current = 'SELECT the workout';
    const workoutDue = workoutDueOn(loadOccurrences(userId, localDate, 1), localDate) ? 1 : 0;
    const workoutDone = workoutDoneOn(userId, localDate);

    current = 'SELECT the nutrition';
    const target = stmt(DAY_TARGETS_SQL).get(localDate, userId, localDate);
    const eaten = stmt(DAY_KCAL_EATEN_SQL).get(userId, localDate);
    const targetX10 = target?.kcal_target_x10 ?? null;
    const kcalOutcome = evaluateKcal({
      eaten: eaten.kcal_eaten_x10,
      target: targetX10,
      tolerancePct: prefs.kcalTolerancePct,
    });

    const mealsTracked = targetX10 !== null && eaten.entries > 0;
    const kcalOk = rules.perfectDayNeedsKcal !== 1 || !mealsTracked || kcalOutcome === 'hit';
    const scheduled = workoutDue;
    const perfect = scheduled > 0 && (!workoutDue || workoutDone === 1) && kcalOk ? 1 : 0;

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT daily_summaries';
    stmt(
      `INSERT INTO daily_summaries
         (user_id, local_date, status, workout_due, workout_done, kcal_target_x10, kcal_eaten_x10,
          kcal_outcome, perfect_day, rules_version)
       VALUES (?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, localDate, workoutDue, workoutDone, targetX10,
      kcalOutcome === 'no_data' ? null : eaten.kcal_eaten_x10, kcalOutcome, perfect, version,
    );

    const day = { localDate, sourceType: 'day', sourceId: epochDay(localDate), rules, rulesVersion: version, requestId, userId };
    const events = [];
    current = 'postCoinEvent (kcal)';
    if (kcalOutcome === 'hit') {
      events.push(postCoinEvent({ ...day, reasonKey: 'day.kcal_hit', amountMinor: pointsToMinor(rules.kcalGoalHit) }));
    } else if (kcalOutcome === 'over') {
      events.push(postCoinEvent({ ...day, reasonKey: 'day.kcal_over', amountMinor: -pointsToMinor(rules.kcalGoalMissed) }));
    }
    current = 'postCoinEvent (perfect day)';
    if (perfect === 1) {
      events.push(postCoinEvent({ ...day, reasonKey: 'day.perfect', amountMinor: pointsToMinor(rules.perfectDay) }));
    }

    return {
      outcome: 'closed',
      localDate,
      workoutDue: workoutDue === 1,
      workoutDone: workoutDone === 1,
      kcalOutcome,
      perfectDay: perfect === 1,
      events: events.filter(Boolean),
    };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/**
 * Lapse every day OLDER than the catch-up window (plan L6): a row, no coins, no penalty. Which days
 * is decided here from the stored state, not taken from the caller. At most 3660 rows per call.
 */
export function markLapsedDaysTx({ userId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'not_started', lapsed: [] };
    const settledThrough = settledThroughFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    const { lapse } = dueDays({ lastClosed: lastSettled(userId), startedOn: prefs.startedOn, settledThrough });
    const days = lapse.slice(0, 3660);
    const { version } = readRules();

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT daily_summaries (lapsed)';
    const ins = stmt(
      `INSERT INTO daily_summaries (user_id, local_date, status, rules_version) VALUES (?, ?, 'lapsed', ?)`,
    );
    for (const d of days) ins.run(userId, d, version);
    return { outcome: 'applied', lapsed: days };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ awardWorkoutTx — after POST /workouts/:id/finish ════════════════════════════════════════════ */

/**
 * Pay a completed workout (f_app workoutPoints: full at >= workoutFullPct of the sets, half at
 * >= workoutHalfPct). Fire-and-forget after the finish has committed, like the achievement
 * evaluator: a coin that did not land must never fail the workout.
 *
 *   * Owned: the log is read WHERE id = ? AND client_user_id = ?.
 *   * Once: the event's natural key (workout_log, id) — a replay answers 'already'.
 *   * Only while the day is open: a workout dated on a day that has settled pays nothing (L4).
 *   * Completion is counted from the stored sets (working sets, not voided), never from a client
 *     figure.
 */
export function awardWorkoutTx({ userId, logId, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readPrefs(userId);
    if (!prefs?.timezone || !prefs.startedOn) return { outcome: 'not_started' };

    current = 'SELECT the log';
    const log = stmt(
      `SELECT id, local_date AS localDate, status FROM workout_logs WHERE id = ? AND client_user_id = ?`,
    ).get(logId, userId);
    if (!log || log.status !== 'completed') return { outcome: 'missing' };
    if (log.localDate < prefs.startedOn) return { outcome: 'before_start' };
    const settledThrough = settledThroughFor(Date.now(), prefs.timezone, prefs.dayStartHour);
    const summary = stmt('SELECT 1 FROM daily_summaries WHERE user_id = ? AND local_date = ?').get(userId, log.localDate);
    if (summary || log.localDate <= settledThrough) return { outcome: 'settled' };

    const live = activeEvent(userId, 'workout.completed', 'workout_log', log.id);
    if (live) return { outcome: 'already', eventId: live.id, amountMinor: live.amountMinor };

    current = 'SELECT the sets';
    const sets = stmt(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS done
         FROM workout_log_sets
        WHERE log_id = ? AND client_user_id = ? AND voided_at IS NULL AND set_kind <> 'warmup'`,
    ).get(log.id, userId);
    const completionPct = sets.total > 0 ? Math.floor(((sets.done ?? 0) * 100) / sets.total) : 0;

    const { version, rules } = readRules();
    const points = workoutPoints({ completionPct }, rules);
    if (points <= 0) return { outcome: 'nothing', completionPct };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'postCoinEvent (workout)';
    const ev = postCoinEvent({
      userId,
      reasonKey: 'workout.completed',
      amountMinor: pointsToMinor(points),
      localDate: log.localDate,
      sourceType: 'workout_log',
      sourceId: log.id,
      rules,
      rulesVersion: version,
      requestId,
    });
    return { outcome: ev ? 'awarded' : 'capped', completionPct, event: ev };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
