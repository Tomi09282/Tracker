// src/db/tx/lifeos-focus.js — the focus session transactions and reads (migration 035).
//
// Runs INSIDE a Piscina worker (re-exported by worker.js; every `export function` is a task the
// facade may name). The rules of src/db/tx/lifeos.js hold here too: one logical write = one worker
// call in an IMMEDIATE transaction; ADR-0005 (refusals before the first write, nothing returns
// conditionally after it); ownership in the SQL (`WHERE id = ? AND user_id = ?` — another account's
// session is a 404); "now" is the worker's own clock, never a value from a request.
//
// ═══ THE ONE FOCUS WRITE THAT MOVES COINS ══════════════════════════════════════════════════════
//
// finishFocusTx pays — once per session, through postCoinEvent (the 400-coin daily cap trims it).
// The amount is computed HERE from the stored plan, the stored check-in count and the worker clock
// (src/lifeos/focus.js focusPayout: the minutes spent, capped at the plan and at the day's focus
// limit, 20 / hour pro rata, + 2 per check-in). Nothing a client sends reaches it. startFocusTx,
// checkinFocusTx and cancelFocusTx move no coins: a check-in only raises the count the finish pays
// for (paced by the clock), and a cancel pays nothing and has nothing to reverse.
//
// Migration 035's triggers re-prove every one of these rules (the plan frozen, the check-in pace,
// the paid minutes within the clock, the event within the session's worth).
import { getDb, stmt, rethrow } from '../conn.js';
import { isSettledDay, postCoinEvent, readStartedPrefs, readRules } from '../lifeos-ledger.js';
import {
  focusByClientKey,
  focusRow,
  focusRulesView,
  focusView,
  openFocusRow,
  paidMinutesOn,
  sessionsCreatedOn,
} from '../lifeos-focus-views.js';
import { dayKeyFor } from '../../lifeos/dates.js';
import { pointsToMinor } from '../../lifeos/rules.js';
import {
  checkinVerdict,
  focusPayout,
  focusStatus,
  FOCUS_MAX_PLAN_AHEAD_SECONDS,
  FOCUS_MAX_SESSIONS_PER_DAY,
  FOCUS_START_SLACK_SECONDS,
} from '../../lifeos/focus.js';

/** How many closed sessions GET /focus lists (newest first). */
const HISTORY_LIMIT = 50;

function started(prefs) {
  return Boolean(prefs?.timezone && prefs.startedOn);
}

/** The worker clock, read ONCE per call: ms for the logical day, seconds for the session times. */
function clock() {
  const nowMs = Date.now();
  return { nowMs, nowSec: Math.floor(nowMs / 1000) };
}

function viewOf(userId, s, prefs, rules, nowMs, nowSec) {
  const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
  return focusView(userId, s, { nowSec, timezone: prefs.timezone, rules, paidTodayMinutes: paidMinutesOn(userId, today) });
}

/* ══ reads ═══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * GET /focus/current: the open session (null when none), today's paid focus minutes, and the rules
 * the setup screen draws its estimate with. Before a zone is set: started false, no session.
 */
export function focusCurrentQuery({ userId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    const { rules } = readRules();
    if (!started(prefs)) return { started: false, today: null, session: null, todayMinutes: 0, rules: focusRulesView(rules) };
    const { nowMs, nowSec } = clock();
    const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
    const paidTodayMinutes = paidMinutesOn(userId, today);
    const open = openFocusRow(userId);
    return {
      started: true,
      today,
      now: nowSec,
      session: open ? focusView(userId, open, { nowSec, timezone: prefs.timezone, rules, paidTodayMinutes }) : null,
      todayMinutes: paidTodayMinutes,
      rules: focusRulesView(rules),
    };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /focus/:id — one session of this account (focus-3 re-opened, or any history row). */
export function focusQuery({ userId, sessionId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return null;
    const s = focusRow(userId, sessionId);
    if (!s) return null;
    const { rules } = readRules();
    const { nowMs, nowSec } = clock();
    return { now: nowSec, session: viewOf(userId, s, prefs, rules, nowMs, nowSec) };
  } catch (err) {
    return rethrow(err);
  }
}

/** GET /focus — the open session and the newest closed ones (at most 50). */
export function focusListQuery({ userId }) {
  try {
    const prefs = readStartedPrefs(userId);
    if (!prefs) return null;
    if (!started(prefs)) return { started: false, sessions: [] };
    const { rules } = readRules();
    const { nowMs, nowSec } = clock();
    const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
    const paidTodayMinutes = paidMinutesOn(userId, today);
    const rows = stmt(
      `SELECT id FROM focus_sessions WHERE user_id = ?
        ORDER BY (status = 'open') DESC, starts_at DESC, id DESC LIMIT ?`,
    ).all(userId, HISTORY_LIMIT + 1);
    const sessions = rows
      .map((r) => focusRow(userId, r.id))
      .filter(Boolean)
      .map((s) => focusView(userId, s, { nowSec, timezone: prefs.timezone, rules, paidTodayMinutes }));
    return { started: true, today, now: nowSec, sessions };
  } catch (err) {
    return rethrow(err);
  }
}

/* ══ startFocusTx ════════════════════════════════════════════════════════════════════════════════ */

/**
 * Start (or plan) a focus block: "Fókusz indítása". `startAt` (epoch seconds) is optional — absent
 * means now; up to 2 minutes in the past is read as now, further back is refused (a client cannot
 * back-date a block into minutes it did not spend), at most 24 h ahead.
 *
 * Refusals, all before the first write: no zone yet (409 TIMEZONE_REQUIRED); a replayed clientKey
 * answers the session it made; another session is still open (409 FOCUS_OPEN — one unfinished
 * session per user, the unique partial index is the backstop); 48 sessions already started today.
 */
export function startFocusTx({ userId, input, clientKey }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT prefs';
    const prefs = readStartedPrefs(userId);
    if (!prefs) return { outcome: 'missing' };
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const { version, rules } = readRules();
    const { nowMs, nowSec } = clock();
    const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);

    current = 'SELECT the replay';
    const prior = focusByClientKey(userId, clientKey);
    if (prior) return { outcome: 'replayed', session: viewOf(userId, prior, prefs, rules, nowMs, nowSec) };

    let startsAt = nowSec;
    if (input.startAt !== undefined) {
      if (input.startAt < nowSec - FOCUS_START_SLACK_SECONDS) return { outcome: 'invalid' };
      if (input.startAt > nowSec + FOCUS_MAX_PLAN_AHEAD_SECONDS) return { outcome: 'invalid' };
      startsAt = Math.max(nowSec, input.startAt);
    }

    current = 'SELECT the open session';
    const open = openFocusRow(userId);
    if (open) return { outcome: 'busy', session: viewOf(userId, open, prefs, rules, nowMs, nowSec) };
    current = 'SELECT the day\'s starts';
    if (sessionsCreatedOn(userId, today) >= FOCUS_MAX_SESSIONS_PER_DAY) return { outcome: 'cap', limit: FOCUS_MAX_SESSIONS_PER_DAY };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'INSERT focus_sessions';
    const ins = stmt(
      `INSERT INTO focus_sessions
         (user_id, client_key, title, created_on, starts_at, planned_minutes, checkin_minutes, rules_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, clientKey, input.title, today, startsAt, input.minutes, input.checkinMinutes, version);
    const id = Number(ins.lastInsertRowid);
    return { outcome: 'created', session: viewOf(userId, focusRow(userId, id), prefs, rules, nowMs, nowSec) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ checkinFocusTx ══════════════════════════════════════════════════════════════════════════════ */

/**
 * "Rajta vagyok" — answer a check-in. Moves no coin: it raises the count the finish pays +2 for.
 *
 *   forge    — no body; the count and the time come from the row and the worker clock;
 *   replay   — a second tap within 5 minutes is 'too_soon' (200, counted: false), never a second count;
 *   race     — IMMEDIATE: two taps serialise; the guarded UPDATE matches the count it read;
 *   IDOR     — WHERE id = ? AND user_id = ?;
 *   extremes — at most floor(elapsed / interval) check-ins ('not_due' beyond), only while running.
 */
export function checkinFocusTx({ userId, sessionId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the session (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const s = focusRow(userId, sessionId);
    if (!s) return { outcome: 'missing' };
    const { rules } = readRules();
    const { nowMs, nowSec } = clock();
    const verdict = checkinVerdict(s, nowSec);
    if (verdict === 'not_active') return { outcome: 'not_active', session: viewOf(userId, s, prefs, rules, nowMs, nowSec) };
    if (verdict === 'no_checkins') return { outcome: 'no_checkins' };
    if (verdict !== 'ok') return { outcome: verdict, session: viewOf(userId, s, prefs, rules, nowMs, nowSec) };

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE focus_sessions (check-in, guarded)';
    const upd = stmt(
      `UPDATE focus_sessions SET checkins_done = checkins_done + 1, last_checkin_at = ?
        WHERE id = ? AND user_id = ? AND status = 'open' AND checkins_done = ?`,
    ).run(nowSec, sessionId, userId, s.checkinsDone);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'counted', session: viewOf(userId, focusRow(userId, sessionId), prefs, rules, nowMs, nowSec) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ finishFocusTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * "Befejezés" — finish a running (or ran-out) session and pay for it (f_app finishFocus), on the
 * user's logical today. Idempotent: finishing a finished session answers 'already' with its award.
 *
 *   forge    — no body; the minutes are the worker clock's, capped at the stored plan and at the
 *              day's focus limit (480 paid minutes); the check-ins are the stored, clock-paced count;
 *   replay   — the second call finds status 'done' ('already'); the guarded UPDATE is the gate, and
 *              the coin_events natural key allows one live focus.finish per session;
 *   race     — IMMEDIATE: two finishes serialise, the second sees the first;
 *   IDOR     — WHERE id = ? AND user_id = ?;
 *   extremes — a not-yet-started block is refused (409 FOCUS_NOT_STARTED), a cancelled one is
 *              closed (409 FOCUS_CLOSED); every earn is trimmed by the 400-coin daily cap.
 */
export function finishFocusTx({ userId, sessionId, requestId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the session (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const s = focusRow(userId, sessionId);
    if (!s) return { outcome: 'missing' };
    const { version, rules } = readRules();
    const { nowMs, nowSec } = clock();
    const status = focusStatus(s, nowSec);
    if (status === 'done') return { outcome: 'already', session: viewOf(userId, s, prefs, rules, nowMs, nowSec) };
    if (status === 'cancelled') return { outcome: 'closed' };
    if (status === 'planned') return { outcome: 'not_started' };
    const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
    // Never onto a settled day (security review LifeOS 02b): see setUserPrefsTx.
    if (isSettledDay(userId, today)) return { outcome: 'locked' };
    const pay = focusPayout(s, nowSec, paidMinutesOn(userId, today), rules);

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    // The session closes FIRST: trg_coin_event_focus_truthful accepts the award only for a DONE
    // session on this day, worth at least the amount.
    current = 'UPDATE focus_sessions (finish, guarded)';
    const upd = stmt(
      `UPDATE focus_sessions
          SET status = 'done', closed_at = ?, closed_on = ?, paid_minutes = ?, paid_checkins = ?, rules_version = ?
        WHERE id = ? AND user_id = ? AND status = 'open' AND checkins_done = ?`,
    ).run(nowSec, today, pay.minutes, pay.checkins, version, sessionId, userId, s.checkinsDone);
    if (upd.changes === 0) return { outcome: 'missing' };
    current = 'postCoinEvent (focus.finish)';
    const event = postCoinEvent({
      userId,
      reasonKey: 'focus.finish',
      amountMinor: pointsToMinor(pay.points),
      localDate: today,
      sourceType: 'focus',
      sourceId: sessionId,
      rules,
      rulesVersion: version,
      requestId,
      // The note stays free for postCoinEvent's 'capped' (the daily coin cap); a trim by the daily
      // focus limit is visible on the session itself (paidMinutes < elapsedMinutes).
      note: null,
    });
    return { outcome: 'finished', event, session: viewOf(userId, focusRow(userId, sessionId), prefs, rules, nowMs, nowSec) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}

/* ══ cancelFocusTx ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * "Feladás" — give up on a planned, running or ran-out session (f_app cancelFocus). Pays nothing
 * and has nothing to reverse. A cancelled session answers 'already'; a finished one is closed
 * (409 FOCUS_CLOSED — a paid block cannot be un-done into a free one).
 */
export function cancelFocusTx({ userId, sessionId }) {
  const conn = getDb();
  let current = null;

  const tx = conn.transaction(() => {
    current = 'SELECT the session (owned)';
    const prefs = readStartedPrefs(userId);
    if (!started(prefs)) return { outcome: 'timezone_required' };
    const s = focusRow(userId, sessionId);
    if (!s) return { outcome: 'missing' };
    const { rules } = readRules();
    const { nowMs, nowSec } = clock();
    if (s.status === 'cancelled') return { outcome: 'already', session: viewOf(userId, s, prefs, rules, nowMs, nowSec) };
    if (s.status === 'done') return { outcome: 'closed' };
    const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);

    // ── from here on, nothing may conditionally return (ADR-0005) ──────────────────────────────
    current = 'UPDATE focus_sessions (cancel, guarded)';
    const upd = stmt(
      `UPDATE focus_sessions SET status = 'cancelled', closed_at = ?, closed_on = ?
        WHERE id = ? AND user_id = ? AND status = 'open'`,
    ).run(nowSec, today, sessionId, userId);
    if (upd.changes === 0) return { outcome: 'missing' };
    return { outcome: 'cancelled', session: viewOf(userId, focusRow(userId, sessionId), prefs, rules, nowMs, nowSec) };
  });

  try {
    return tx.immediate();
  } catch (err) {
    return rethrow(err, current);
  }
}
