// src/db/lifeos-ledger.js — the LifeOS helpers every named transaction shares: the stored prefs and
// rules, the edit window, and the ONE writer of coin events (postCoinEvent / reverseCoinEvent).
//
// ═══ WORKER SIDE ONLY, AND DELIBERATELY NOT A tx/ FILE ═════════════════════════════════════════
//
// Moved out of src/db/tx/lifeos.js (package B-habits-tasks) because three tx files now need them —
// lifeos.js (the day close), lifeos-habits.js and lifeos-tasks.js. A tx/ file is re-exported by
// worker.js, and every `export function` there is a task Piscina can be asked to run by name; these
// are fragments of a transaction, not transactions, so they live HERE, where nothing re-exports
// them. They run inside the caller's transaction and never open one of their own. Like conn.js,
// this module must never be imported from the main thread (it would open the database there).
import { stmt } from './conn.js';
import { settledThroughFor } from '../lifeos/dates.js';
import { parseStoredRules, pointsToMinor } from '../lifeos/rules.js';

/** The user's day boundary (null for a disabled or unknown account). */
export function readPrefs(userId) {
  return stmt(
    `SELECT p.timezone, p.timezone_set_at AS timezoneSetAt, p.day_start_hour AS dayStartHour,
            p.lifeos_started_on AS startedOn, p.kcal_tolerance_pct AS kcalTolerancePct
       FROM user_prefs p JOIN users u ON u.id = p.user_id AND u.disabled_at IS NULL
      WHERE p.user_id = ?`,
  ).get(userId);
}

/** The rule set in force: the newest row. Parsed with the same schema that admitted it. */
export function readRules() {
  const row = stmt('SELECT id, rules_json FROM point_rule_sets ORDER BY id DESC LIMIT 1').get();
  if (!row) throw new Error('lifeos: no point rule set exists (migration 031 seeds version 1)');
  return { version: row.id, rules: parseStoredRules(row.rules_json) };
}

export function lastSettled(userId) {
  return stmt('SELECT MAX(local_date) AS d FROM daily_summaries WHERE user_id = ?').get(userId).d;
}

export function isSettledDay(userId, localDate) {
  return Boolean(stmt('SELECT 1 FROM daily_summaries WHERE user_id = ? AND local_date = ?').get(userId, localDate));
}

/**
 * THE EDIT WINDOW (plan L4): a logical day can be written while it has not settled — on or after
 * the LifeOS start, not in the future, after the newest settled day by the clock (start(D+1) + 6 h),
 * and without a summary row. 'future' | 'before_start' | 'settled' | 'open'.
 */
export function editWindow(userId, prefs, localDate, nowMs, today) {
  if (localDate > today) return 'future';
  if (prefs.startedOn && localDate < prefs.startedOn) return 'before_start';
  if (localDate <= settledThroughFor(nowMs, prefs.timezone, prefs.dayStartHour)) return 'settled';
  if (isSettledDay(userId, localDate)) return 'settled';
  return 'open';
}

/**
 * Coins EARNED on a logical day against the cap: positive originals that have not been reversed,
 * of reasons that count towards the cap (streak milestones do not — owner, 2026-10-18).
 */
export function earnedOn(userId, localDate) {
  return stmt(
    `SELECT COALESCE(SUM(e.amount_minor), 0) AS n FROM coin_events e
       JOIN coin_reasons r ON r.key = e.reason_key AND r.cap_exempt = 0
      WHERE e.user_id = ? AND e.local_date = ? AND e.amount_minor > 0
        AND e.reverses_event_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)`,
  ).get(userId, localDate).n;
}

/** The live (not reversed) original event for one thing, if any. */
export function activeEvent(userId, reasonKey, sourceType, sourceId) {
  return stmt(
    `SELECT e.id, e.amount_minor AS amountMinor, e.seq, e.local_date AS localDate FROM coin_events e
      WHERE e.user_id = ? AND e.reason_key = ? AND e.source_type = ? AND e.source_id = ?
        AND e.reverses_event_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)
      ORDER BY e.seq DESC LIMIT 1`,
  ).get(userId, reasonKey, sourceType, sourceId);
}

function insertLedgerFor(eventId) {
  const led = stmt(
    `INSERT INTO coin_ledger
       (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key, actor_user_id,
        request_id, note)
     SELECT e.user_id, e.amount_minor, e.reason_key, 'coin_event', e.id,
            'evt:' || printf('%010d', e.id), NULL, e.request_id, e.note
       FROM coin_events e WHERE e.id = ?`,
  ).run(eventId);
  if (led.changes !== 1) throw new Error('lifeos-ledger: the ledger row did not follow its event');
}

/**
 * cap -> event -> ledger, inside the caller's transaction. Returns the event, or null when nothing
 * was written (a zero amount, or an earn with no room left under the daily cap).
 *
 *   * THE CAP: an earn (positive, not a reversal) of a capped reason is trimmed to the room left
 *     today under the rule set in force. A cap-exempt reason (streak.milestone) is never trimmed.
 *     trg_coin_event_daily_cap is the backstop; it never fires on this path.
 *   * ONE LIVE AWARD PER THING: if the thing already has a live original, that is a caller defect
 *     (every caller checks first, under the same lock) — THROW, so the transaction rolls back.
 *   * THE LEDGER ROW IS READ FROM THE EVENT, not from the arguments, so the two cannot disagree;
 *     trg_coin_ledger_ref_truthful proves it again. A ledger insert that writes no row THROWS.
 *
 * Penalties are NOT capped and may take the balance below zero (plan L3); they are not spends, so
 * trg_coin_ledger_spend_covered lets them through.
 */
export function postCoinEvent({
  userId, reasonKey, amountMinor, localDate, sourceType, sourceId,
  rules, rulesVersion, requestId, note = null,
}) {
  if (!Number.isInteger(amountMinor) || amountMinor === 0) return null;

  let amount = amountMinor;
  let capped = false;
  if (amount > 0) {
    const exempt = stmt('SELECT cap_exempt FROM coin_reasons WHERE key = ?').get(reasonKey)?.cap_exempt === 1;
    if (!exempt) {
      const room = pointsToMinor(rules.dailyEarnCap) - earnedOn(userId, localDate);
      if (room <= 0) return null;
      if (amount > room) {
        amount = room;
        capped = true;
      }
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
  insertLedgerFor(eventId);
  return { eventId, reasonKey, amountMinor: amount, capped };
}

/**
 * UNDO IS A NEW EVENT (plan L3): the exact negation of a live original, on the original's day and
 * thing, through the same ledger. reversal.debit undoes an earn, reversal.credit a penalty. The
 * balance may go below zero (a reversal is not a spend). trg_coin_event_reversal_truthful and the
 * UNIQUE reverses_event_id prove it again; a reversal that does not land THROWS.
 */
export function reverseCoinEvent({ userId, eventId, requestId, note = null }) {
  const o = stmt(
    `SELECT e.id, e.amount_minor AS amountMinor, e.local_date AS localDate, e.source_type AS sourceType,
            e.source_id AS sourceId, e.rules_version AS rulesVersion
       FROM coin_events e
      WHERE e.id = ? AND e.user_id = ? AND e.reverses_event_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)`,
  ).get(eventId, userId);
  if (!o) throw new Error(`reverseCoinEvent: event ${eventId} is not a live original of this account`);
  const reasonKey = o.amountMinor > 0 ? 'reversal.debit' : 'reversal.credit';
  const ev = stmt(
    `INSERT INTO coin_events
       (user_id, reason_key, amount_minor, xp_minor, local_date, source_type, source_id, seq,
        reverses_event_id, rules_version, request_id, note)
     SELECT o.user_id, ?, -o.amount_minor, -o.xp_minor, o.local_date, o.source_type, o.source_id, 0,
            o.id, o.rules_version, ?, ?
       FROM coin_events o WHERE o.id = ?`,
  ).run(reasonKey, requestId, note, o.id);
  if (ev.changes !== 1) throw new Error('reverseCoinEvent: the reversal did not land');
  const reversalId = Number(ev.lastInsertRowid);
  insertLedgerFor(reversalId);
  return { eventId: reversalId, reversesEventId: o.id, amountMinor: -o.amountMinor };
}
