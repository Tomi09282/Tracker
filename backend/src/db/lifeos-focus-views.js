// src/db/lifeos-focus-views.js — focus session reads shared by the focus transactions
// (tx/lifeos-focus.js), GET /lifeos/today (tx/lifeos.js) and the stats reads (tx/lifeos-stats.js).
//
// WORKER SIDE ONLY, and deliberately not a tx/ file (as lifeos-ledger.js / lifeos-items.js): a
// tx/ file is re-exported by worker.js and every `export function` there is a Piscina task; these
// are read fragments that run inside the caller's transaction or read snapshot. Nothing here writes.
import { stmt } from './conn.js';
import { dayKeyFor, localTime } from '../lifeos/dates.js';
import { pointsToMinor } from '../lifeos/rules.js';
import {
  checkinsAllowed,
  checkinsMax,
  elapsedMinutes,
  endsAt,
  focusExpectedPoints,
  focusPayout,
  focusPoints,
  focusStatus,
  nextCheckinAt,
  FOCUS_LIMITS,
  FOCUS_MAX_MINUTES_PER_DAY,
} from '../lifeos/focus.js';

const FOCUS_COLS = `f.id, f.title, f.created_on AS createdOn, f.starts_at AS startsAt,
  f.planned_minutes AS plannedMinutes, f.checkin_minutes AS checkinMinutes,
  f.checkins_done AS checkinsDone, f.last_checkin_at AS lastCheckinAt, f.status,
  f.closed_at AS closedAt, f.closed_on AS closedOn, f.paid_minutes AS paidMinutes,
  f.paid_checkins AS paidCheckins, f.created_at AS createdAt`;

/** One session of this account (null for another account's id — indistinguishable from missing). */
export function focusRow(userId, sessionId) {
  return stmt(`SELECT ${FOCUS_COLS} FROM focus_sessions f WHERE f.id = ? AND f.user_id = ?`).get(sessionId, userId);
}

/** The account's one unfinished session (planned, running, or ran out without an answer). */
export function openFocusRow(userId) {
  return stmt(`SELECT ${FOCUS_COLS} FROM focus_sessions f WHERE f.user_id = ? AND f.status = 'open'`).get(userId);
}

export function focusByClientKey(userId, clientKey) {
  return stmt(`SELECT ${FOCUS_COLS} FROM focus_sessions f WHERE f.user_id = ? AND f.client_key = ?`).get(userId, clientKey);
}

/** Focus minutes already PAID on a logical day (the daily focus limit counts these). */
export function paidMinutesOn(userId, localDate) {
  return stmt(
    `SELECT COALESCE(SUM(paid_minutes), 0) AS n FROM focus_sessions
      WHERE user_id = ? AND closed_on = ? AND status = 'done'`,
  ).get(userId, localDate).n;
}

/** Sessions created on a logical day (the per-day start limit). */
export function sessionsCreatedOn(userId, localDate) {
  return stmt('SELECT COUNT(*) AS n FROM focus_sessions WHERE user_id = ? AND created_on = ?').get(userId, localDate).n;
}

/**
 * A session as the focus screens draw it at `nowSec` (epoch seconds):
 *   focus-1  expectedMinor ("Várhatóan +23 érme"), startTime / endTime ("21:10 -> 22:00")
 *   focus-2  status 'active', remainingSeconds (the countdown), elapsedMinutes / plannedMinutes
 *            ("15 / 50 perc"), checkinsDone / checkinsMax ("1 / 3"), checkinDue (the pill),
 *            nextCheckinAt, payoutNowMinor (what "Befejezés" would pay now)
 *   focus-3  status 'done', paidMinutes ("50 PERC"), paidCheckins, awardedMinor ("+23"), capped
 * Amounts are minor units (1 coin = 100). Times are epoch seconds; startTime / endTime are the
 * user's wall clock.
 */
export function focusView(userId, s, { nowSec, timezone, rules, paidTodayMinutes }) {
  const status = focusStatus(s, nowSec);
  const end = endsAt(s);
  const open = s.status === 'open';
  const award = s.status === 'done' ? focusAward(userId, s.id) : null;
  const payout = open && status !== 'planned' ? focusPayout(s, nowSec, paidTodayMinutes, rules) : null;
  const allowed = checkinsAllowed(s, nowSec);
  return {
    id: s.id,
    title: s.title,
    status,
    startsAt: s.startsAt,
    endsAt: end,
    startTime: timezone ? localTime(new Date(s.startsAt * 1000), timezone) : null,
    endTime: timezone ? localTime(new Date(end * 1000), timezone) : null,
    plannedMinutes: s.plannedMinutes,
    elapsedMinutes: elapsedMinutes(s, open ? nowSec : Math.min(s.closedAt, end)),
    remainingSeconds: open ? Math.max(0, end - Math.max(nowSec, s.startsAt)) : 0,
    checkinMinutes: s.checkinMinutes,
    checkinsDone: s.checkinsDone,
    checkinsMax: checkinsMax(s),
    checkinDue: status === 'active' && s.checkinMinutes > 0 && s.checkinsDone < allowed
      && (s.lastCheckinAt === null || nowSec - s.lastCheckinAt >= FOCUS_LIMITS.minCheckinGapMinutes * 60),
    nextCheckinAt: open ? nextCheckinAt(s) : null,
    lastCheckinAt: s.lastCheckinAt,
    expectedMinor: pointsToMinor(focusExpectedPoints(s, rules)),
    payoutNowMinor: payout ? pointsToMinor(payout.points) : null,
    closedAt: s.closedAt,
    closedOn: s.closedOn,
    paidMinutes: s.paidMinutes,
    paidCheckins: s.paidCheckins,
    awardedMinor: s.status === 'done' ? award?.amountMinor ?? 0 : null,
    // Trimmed by the 400-coin daily cap: the event says so ('capped'), or the cap left no room at
    // all and no event was written although the paid minutes were worth something.
    capped: s.status === 'done'
      && (award ? award.note === 'capped' : focusPoints({ minutes: s.paidMinutes, checkins: s.paidCheckins }, rules) > 0),
  };
}

/** The live focus.finish award of a session (a focus award is never reversed, but read it so). */
function focusAward(userId, sessionId) {
  return stmt(
    `SELECT e.amount_minor AS amountMinor, e.note FROM coin_events e
      WHERE e.user_id = ? AND e.reason_key = 'focus.finish' AND e.source_type = 'focus' AND e.source_id = ?
        AND e.reverses_event_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM coin_events x WHERE x.reverses_event_id = e.id)
      ORDER BY e.seq DESC LIMIT 1`,
  ).get(userId, sessionId);
}

/** The rules a focus screen needs to draw its own estimates (focus-1's hint line). */
export function focusRulesView(rules) {
  return {
    pointsPerHour: rules.focusPointsPerHour,
    checkinPoint: rules.focusCheckinPoint,
    maxMinutesPerDay: FOCUS_MAX_MINUTES_PER_DAY,
    minCheckinGapMinutes: FOCUS_LIMITS.minCheckinGapMinutes,
    minMinutes: FOCUS_LIMITS.minMinutes,
    maxMinutes: FOCUS_LIMITS.maxMinutes,
    maxCheckinMinutes: FOCUS_LIMITS.maxCheckinMinutes,
  };
}

/**
 * The FÓKUSZ block of GET /lifeos/today (Ma: "Mélymunka – szakdolgozat · Következő blokk ·
 * 25 perc · +8 érme · 14:00"): the open session, if any, and today's paid focus. Before a zone is
 * set there is no logical today and no session can exist: an empty block.
 */
export function todayFocusFor(userId, prefs, rules, nowMs) {
  if (!prefs?.timezone || !prefs.startedOn) {
    return { current: null, todayMinutes: 0, todaySessions: 0, todayEarnedMinor: 0, maxMinutesPerDay: FOCUS_MAX_MINUTES_PER_DAY };
  }
  const nowSec = Math.floor(nowMs / 1000);
  const today = dayKeyFor(nowMs, prefs.timezone, prefs.dayStartHour);
  const paidTodayMinutes = paidMinutesOn(userId, today);
  const open = openFocusRow(userId);
  const done = stmt(
    `SELECT COUNT(*) AS n FROM focus_sessions WHERE user_id = ? AND closed_on = ? AND status = 'done'`,
  ).get(userId, today).n;
  const earned = stmt(
    `SELECT COALESCE(SUM(e.amount_minor), 0) AS n FROM coin_events e
      WHERE e.user_id = ? AND e.local_date = ? AND e.source_type = 'focus'`,
  ).get(userId, today).n;
  return {
    current: open ? focusView(userId, open, { nowSec, timezone: prefs.timezone, rules, paidTodayMinutes }) : null,
    todayMinutes: paidTodayMinutes,
    todaySessions: done,
    todayEarnedMinor: earned,
    maxMinutesPerDay: FOCUS_MAX_MINUTES_PER_DAY,
  };
}
