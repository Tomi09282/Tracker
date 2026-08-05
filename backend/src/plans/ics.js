// src/plans/ics.js — the calendar feed (F3, T2.7.6).
//
// A subscribable ICS URL, authenticated by an opaque bearer token rather than by a cookie: a
// calendar client is not a browser and will not carry a session. That makes the token the entire
// security boundary, so it is stored HASHED, has a mandatory expiry, and is checked against the
// coach↔client link on every fetch — the token authenticates, the LINK authorises.
//
// The J4 review found this exact object as an unaddressed hole in a candidate design: a durable
// bearer capability that the archive story never mentioned, so archiving a client left a working
// URL to their schedule. Here the fetch predicate carries the link check itself, so an archived
// link stops serving without anything having to remember to revoke.
import { Router } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { localDateFor, occurrencesBetween } from './schedule.js';

const router = Router();

/**
 * The feed URL is public by construction, so it gets its own tight limiter. A leaked token is bad;
 * a leaked token that can also be brute-forced from a neighbouring guess is worse.
 */
const feedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Minting is limited far harder than fetching, and it is the limiter that actually matters.
 *
 * Found by the T2.10.4 route audit: this route had NONE. `feedLimiter` above sat in the same file
 * guarding the read side, which is exactly the kind of near-miss an audit exists to catch — the
 * protection was present, applied to the cheaper of the two paths.
 *
 * Every call here mints a DURABLE BEARER CREDENTIAL to a training schedule, returned once and
 * stored only as a hash. Unlimited, one stolen session could scatter thousands of working URLs
 * that survive the session being revoked, and the victim would have to revoke each by hand.
 * Twenty in a quarter of an hour is far more calendars than a person owns.
 */
const mintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');

const FeedBody = z
  .object({
    label: z.string().trim().max(40).nullable().optional(),
    /** IANA only. "+02:00" and "CET" both lose the daylight-saving rule; the schema rejects them. */
    timezone: z.string().trim().min(3).max(64).regex(/\//).nullable().optional(),
    days: z.number().int().min(7).max(365).default(90),
    /**
     * Present when a COACH wants a feed of one client's schedule. The LINK id, never the client's
     * user id — the link is what carries the proof, and it is also what the fetch predicate
     * re-checks on every request, so archiving the client stops the feed without anything having
     * to remember to revoke it.
     */
    coach_client_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

router.post(
  '/calendar-feeds',
  requireAuth,
  mintLimiter,
  asyncRoute(async (req, res) => {
    const body = FeedBody.parse(req.body ?? {});
    // 160 bits, base64url. Shown ONCE — the row keeps only the hash, exactly like a join code.
    const token = randomBytes(20).toString('base64url');

    // A coach feed is created THROUGH the link, in one statement, so there is no window between
    // checking the link and writing the row. Same shape as every other create in this codebase:
    // `INSERT ... SELECT ... WHERE`, because `VALUES` admits no ownership predicate.
    const created = body.coach_client_id
      ? await db.run(
          `INSERT INTO workout_calendar_feeds (user_id, coach_client_id, token_hash, label, timezone, expires_at)
           SELECT cc.client_id, cc.id, ?, ?, ?, unixepoch() + ?
             FROM coach_clients cc
            WHERE cc.id = ? AND cc.coach_id = ? AND cc.status = 'active'`,
          [
            hashToken(token), body.label ?? null, body.timezone ?? null, body.days * 86400,
            body.coach_client_id, req.user.id,
          ],
        )
      : await db.run(
          `INSERT INTO workout_calendar_feeds (user_id, token_hash, label, timezone, expires_at)
           VALUES (?, ?, ?, ?, unixepoch() + ?)`,
          [req.user.id, hashToken(token), body.label ?? null, body.timezone ?? null, body.days * 86400],
        );

    // The link was not this coach's, or not active. Indistinguishable from one that never existed.
    if (created.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    res.status(201).json({
      id: created.lastInsertRowid,
      // The only time this is ever returned. A feed URL that can be re-read from the API is a feed
      // URL that leaks with a single stolen session.
      url: `/api/v1/calendar/${token}.ics`,
      expiresInDays: body.days,
    });
  }),
);

/**
 * Who may see and revoke a feed row: the person whose schedule it exposes, OR the coach who holds
 * it through a still-active link.
 *
 * Written once and used by both the list and the revoke, because the alternative — a coach able to
 * MINT a feed it can then neither see nor withdraw — is worse than not having coach feeds at all.
 * The client keeps their own power to revoke either way: it is their schedule, and the row is
 * carried on their user_id.
 */
const OWN_OR_HELD = `(
  user_id = ?
  OR EXISTS (SELECT 1 FROM coach_clients cc
              WHERE cc.id = workout_calendar_feeds.coach_client_id
                AND cc.coach_id = ? AND cc.status = 'active'))`;
const ownOrHeld = (userId) => [userId, userId];

router.get(
  '/calendar-feeds',
  requireAuth,
  asyncRoute(async (req, res) => {
    const feeds = await db.all(
      // `coach_client_id` is selected so the UI can say WHOSE feed this is. A client looking at
      // their own list must be able to tell "a calendar I subscribed to" from "a calendar my coach
      // is watching" — those are different things to consent to.
      `SELECT id, coach_client_id, label, timezone, expires_at, revoked_at, last_used_at, created_at
         FROM workout_calendar_feeds WHERE ${OWN_OR_HELD} ORDER BY created_at DESC`,
      ownOrHeld(req.user.id),
    );
    res.json({ feeds });
  }),
);

router.post(
  '/calendar-feeds/:id/revoke',
  requireAuth,
  mintLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    // The guard is in the UPDATE, and `revoked_at IS NULL` means revoking twice reports zero
    // changes rather than succeeding a second time.
    const result = await db.run(
      `UPDATE workout_calendar_feeds SET revoked_at = unixepoch()
        WHERE id = ? AND revoked_at IS NULL AND ${OWN_OR_HELD}`,
      [id, ...ownOrHeld(req.user.id)],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/* ── the feed itself ─────────────────────────────────────────────────────────────────────────── */

/** Escape per RFC 5545: backslash, semicolon, comma and newline all carry meaning in a property. */
const esc = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/**
 * Fold long lines to 75 octets, per RFC 5545.
 *
 * Not decoration: several clients silently truncate an over-long line, and the property that gets
 * truncated is usually SUMMARY — so the event shows up with half a name and no obvious cause.
 */
const fold = (line) => {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  while (start < bytes.length) {
    const take = start === 0 ? 75 : 74;
    let end = Math.min(start + take, bytes.length);
    // Never split a multi-byte character: back off until this byte is not a continuation byte.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push((start === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return out.join('\r\n');
};

const stampUtc = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

router.get(
  '/calendar/:token.ics',
  feedLimiter,
  asyncRoute(async (req, res) => {
    const raw = String(req.params.token ?? '');
    // Shape-checked before it reaches a query. Not a security control — the hash comparison is —
    // but it keeps a garbage URL from costing a database round trip.
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // The token authenticates; the LINK authorises. Expiry and revocation are in the same WHERE, so
    // there is no branch anyone can forget.
    const feed = await db.get(
      `SELECT f.id, f.user_id, f.plan_id, f.coach_client_id, f.timezone
         FROM workout_calendar_feeds f
        WHERE f.token_hash = ? AND f.revoked_at IS NULL AND f.expires_at > unixepoch()
          AND (f.coach_client_id IS NULL OR EXISTS (
                SELECT 1 FROM coach_clients cc
                 WHERE cc.id = f.coach_client_id AND cc.status = 'active'))`,
      [hashToken(raw)],
    );
    // Wrong, expired, revoked, or belonging to an archived link: one answer for all four.
    if (!feed) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // A bounded horizon. The schedule is a rule, so "generate the next year" would otherwise be an
    // unbounded loop driven by a client-supplied cycle length.
    const HORIZON_DAYS = 120;
    // THE SHARED RULE, not a fourth copy of the arithmetic. This file used to carry its own loop,
    // and it had drifted twice: it started the horizon at the SERVER's date rather than the
    // subscriber's, and it never emitted a day moved ONTO the window from before it — so a session
    // dragged from yesterday to next Tuesday vanished from the calendar instead of moving.
    const from = await localDateFor(feed.user_id);
    const occurrences = await occurrencesBetween(feed.user_id, from, HORIZON_DAYS);
    const iso = (d) => d.toISOString().slice(0, 10);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TRACKER//Workout schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc('TRACKER')}`,
    ];
    if (feed.timezone) lines.push(`X-WR-TIMEZONE:${esc(feed.timezone)}`);

    const stamp = stampUtc();
    for (const occ of occurrences) {
      const compact = occ.date.replace(/-/g, '');

      lines.push('BEGIN:VEVENT');
      // Stable across regenerations: a calendar client updates an existing event rather than
      // creating a duplicate every time it refreshes.
      lines.push(`UID:tracker-${occ.day_id}-${compact}@tracker`);
      lines.push(`DTSTAMP:${stamp}`);

      if (occ.start_time) {
        const [h, m] = occ.start_time.split(':');
        const end = new Date(Date.parse(`${occ.date}T${occ.start_time}:00Z`) + (occ.est_minutes ?? 60) * 60000);
        // A FLOATING local time — no Z, no offset. It means "18:00 wherever the viewer is",
        // which is what "evenings" means to a person and what survives a daylight-saving change.
        // Naming a timezone here would require shipping a VTIMEZONE block; the calendar's own
        // X-WR-TIMEZONE above is the hint, and floating is the honest fallback.
        lines.push(`DTSTART:${compact}T${h}${m}00`);
        lines.push(
          `DTEND:${end.toISOString().slice(0, 10).replace(/-/g, '')}T${String(end.getUTCHours()).padStart(2, '0')}${String(end.getUTCMinutes()).padStart(2, '0')}00`,
        );
      } else {
        // No time set → an all-day event. The honest rendering of an unscheduled session,
        // rather than an invented 09:00.
        const next = new Date(Date.parse(`${occ.date}T00:00:00Z`) + 86400000);
        lines.push(`DTSTART;VALUE=DATE:${compact}`);
        lines.push(`DTEND;VALUE=DATE:${iso(next).replace(/-/g, '')}`);
      }

      lines.push(fold(`SUMMARY:${esc(occ.is_rest ? `${occ.day_name} 🌙` : occ.day_name)}`));
      lines.push(fold(`DESCRIPTION:${esc(occ.plan_name)}`));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    // Best-effort, and deliberately not awaited into the response: a feed that fails to record its
    // own last-used timestamp should still serve the calendar.
    void db.run('UPDATE workout_calendar_feeds SET last_used_at = unixepoch() WHERE id = ?', [feed.id]);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=900');
    // The URL is a bearer capability; nothing should index it or keep a copy.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.send(`${lines.join('\r\n')}\r\n`);
  }),
);

export default router;
