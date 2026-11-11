// src/lifeos/dates.js — the LifeOS day boundary. A port of f_app `src/domain/dates.ts`.
//
// ═══ PURE, AND IMPORTED BY THE WORKER ══════════════════════════════════════════════════════════
//
// No database, no pool, no date library: `Intl.DateTimeFormat` with an IANA zone is the only
// timezone source, and it ships with Node's full ICU. The named worker transactions import this
// file to decide, under the write lock, whether a day may settle; the routes import it to answer
// "which day is it for this user". One implementation for both, so the two cannot disagree.
//
// ═══ THE ONE DELIBERATE DIFFERENCE FROM f_app: WALL-CLOCK, NOT ELAPSED, HOURS ══════════════════
//
// f_app computes the logical day as `format(subHours(local, dayStartHour))`. date-fns subtracts
// ELAPSED hours, so on the two DST Sundays the boundary drifts: on 2026-03-29 in Europe/Budapest
// 04:00 CEST minus four elapsed hours is 23:00 CET on the 28th, and the new day would only begin
// at 05:00. Here the boundary is the WALL CLOCK: an instant belongs to its local calendar date
// when its local hour is >= dayStartHour, otherwise to the date before. Every f_app vector agrees
// (none of them lands on a DST day); the DST vectors in verify-lifeos-rules.mjs pin the rest.
//
// A day key is 'YYYY-MM-DD' in the user's own calendar; arithmetic on keys is pure UTC date math,
// which has no DST at all.

const formatters = new Map();

/** One cached formatter per zone; constructing them is the expensive part. */
function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Bounded shape first, then the runtime's own verdict: a zone the ICU data does not know is refused. */
export const TIMEZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]{0,29}(?:\/[A-Za-z0-9_+-]{1,30}){1,2}$|^UTC$/;

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !TIMEZONE_RE.test(timeZone)) return false;
  try {
    formatterFor(timeZone).format(0);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock fields of an instant in a zone. */
function localParts(instant, timeZone) {
  const out = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out; // { year, month, day, hour, minute, second }
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const keyOf = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Offset of the zone from UTC at an instant, in milliseconds (east positive). */
export function offsetMs(instant, timeZone) {
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Calendar day key of an instant in the zone (NOT the logical day). */
export function calendarKeyFor(instant, timeZone) {
  const p = localParts(instant, timeZone);
  return keyOf(p.year, p.month, p.day);
}

/** Wall-clock 'HH:MM' of an instant in the zone. */
export function localTime(instant, timeZone) {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The user's LOGICAL day for an instant. With dayStartHour = 4, 02:30 local on the 10th still
 * belongs to the 9th. Wall-clock hours — see the header for why this differs from f_app on DST days.
 */
export function dayKeyFor(instant, timeZone, dayStartHour = 4) {
  const p = localParts(instant, timeZone);
  const key = keyOf(p.year, p.month, p.day);
  return p.hour < dayStartHour ? addDaysToKey(key, -1) : key;
}

const keyToUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDaysToKey(key, days) {
  const t = new Date(keyToUtc(key) + days * 86400000);
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from, to) {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86400000);
}

/** ISO weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key) {
  return (new Date(keyToUtc(key)).getUTCDay() + 6) % 7;
}

export function isBitSet(mask, weekday) {
  return (mask & (1 << weekday)) !== 0;
}

/** Every day key in [from, to], inclusive, ascending. */
export function dayRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDaysToKey(k, 1)) out.push(k);
  return out;
}

/**
 * The instant at 'HH:MM' local time on a calendar day, in the zone.
 *
 * DST, decided rather than left to chance — the same rule as Temporal's 'compatible':
 *   * a wall time that happens TWICE (the autumn overlap) resolves to the EARLIER instant;
 *   * a wall time that never happens (the spring gap) is read with the offset in force BEFORE the
 *     gap, which lands the same distance after it (02:30 on 2026-03-29 in Budapest -> 03:30 CEST).
 */
export function instantFor(key, time, timeZone) {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetMs(wall - 86400000, timeZone);
  const after = offsetMs(wall + 86400000, timeZone);
  const hits = [];
  for (const o of new Set([before, after])) {
    const t = wall - o;
    const p = localParts(t, timeZone);
    if (p.year === y && p.month === m && p.day === d && p.hour === hh && p.minute === mm) hits.push(t);
  }
  if (hits.length) return new Date(Math.min(...hits));
  return new Date(wall - before);
}

/** How long after a logical day ENDS it stays editable before it settles (economy sheet: 6 h). */
export const SETTLE_DELAY_MS = 6 * 3600 * 1000;
/** At most this many past days are settled with coins on one catch-up; older gaps lapse. */
export const CATCH_UP_DAYS = 7;

/** The instant a logical day begins: its own date at dayStartHour:00, wall clock. */
export function dayStartInstant(key, timeZone, dayStartHour = 4) {
  return instantFor(key, `${pad(dayStartHour)}:00`, timeZone);
}

/**
 * The newest logical day that has SETTLED at `now`: day D settles at start(D + 1) + 6 h.
 * With a 04:00 start, yesterday settles at 10:00 today; before 10:00 the newest settled day is the
 * day before yesterday.
 */
export function settledThroughFor(now, timeZone, dayStartHour = 4) {
  const today = dayKeyFor(now, timeZone, dayStartHour);
  const settleYesterdayAt = dayStartInstant(today, timeZone, dayStartHour).getTime() + SETTLE_DELAY_MS;
  const ms = typeof now === 'number' ? now : now.getTime();
  return addDaysToKey(today, ms >= settleYesterdayAt ? -1 : -2);
}

/**
 * Which days a catch-up settles, and how.
 *
 * `lastClosed` is the newest day with a summary row (or null), `startedOn` the first LifeOS day.
 * The newest CATCH_UP_DAYS due days close with coins; anything older than that lapses (a row, no
 * coins, no penalty) so a returning user is not buried in a month of penalties.
 */
export function dueDays({ lastClosed, startedOn, settledThrough }) {
  if (!startedOn) return { close: [], lapse: [] };
  const first = lastClosed && lastClosed >= startedOn ? addDaysToKey(lastClosed, 1) : startedOn;
  if (first > settledThrough) return { close: [], lapse: [] };
  const all = dayRange(first, settledThrough);
  const cut = Math.max(0, all.length - CATCH_UP_DAYS);
  return { lapse: all.slice(0, cut), close: all.slice(cut) };
}

/** 'YYYY-MM-DD' shape AND a real date (2026-02-30 is refused). */
export function isDayKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return addDaysToKey(key, 0) === key;
}

/** Integer day number since 1970-01-01, used as the natural source id of a day-level coin event. */
export function epochDay(key) {
  return Math.round(keyToUtc(key) / 86400000);
}
