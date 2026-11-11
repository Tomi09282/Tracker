// src/admin/statistics.js — package B-admin-stats: the numbers behind the Moderation panel and the
// Statistics page (owner decision 2026-11-03: a compact panel at the top of Moderáció with a door
// to a detailed page).
//
//   GET /admin/stats        (routes.js)  gains an additive `panel` built by panelFigures() below
//   GET /admin/statistics   (this file)  ?days=7|30|90 — six sections, every series zero-filled
//
// ═══ COUNTS ONLY, NEVER CONTENT ════════════════════════════════════════════════════════════════
//
// An admin cannot read anybody's health data in this product, and a statistics page must not become
// the back door. Every query below returns a COUNT, a SUM of coin amounts, or a distinct-person
// count. None selects a name, an e-mail, a body, a measurement or a photo, and none returns an id
// that could be turned into one. The page can say "9 people logged something today"; it cannot say
// who.
//
// ═══ THIS IS NOT DAU/MAU, AND THE FIELD IS NAMED SO NOBODY HAS TO READ THIS TO KNOW ═════════════
//
// The product deliberately has no `users.last_seen_at` (migration 025's header: it would be a write
// on every authenticated request, to power one number on one screen). So "daily active users" does
// not exist and nothing here pretends it does. `loggedPeople` is what the product records: the
// number of DISTINCT PEOPLE WHO LOGGED A WORKOUT OR A MEAL on a local day. Someone who opened the app
// and logged nothing is invisible to it, so it is smaller than any DAU would be. The Statistics page
// prints that sentence next to the number (the honesty note in the frame).
//
// ═══ THREE CLOCKS, EACH NAMED ON THE SERIES THAT USES IT ═══════════════════════════════════════
//
//   'local_date'  activity: workouts and meals, bucketed by the PERSON'S OWN day (the column the
//                 streaks and calendar use). Compared here against UTC date keys, so a person
//                 whose local day is already ahead of UTC (Auckland, 10:00 on the 4th, UTC still the
//                 3rd) lands in the bucket for the 4th once UTC reaches it, not before.
//   'utc'         signups and coin movement: events in server time.
//   'epoch'       sessions and audit events: instants, counted over a rolling window.
//
// "Today" and the end of every window is the UTC calendar date at request time. There is no single
// platform timezone and inventing one would put a lie on the page; the clock is returned on the
// payload (`window.today`, `clock` on each series) so the client can label it.
//
// ═══ COST ══════════════════════════════════════════════════════════════════════════════════════
//
// These are range scans across all users. Every one starts from an index (025 added them for the
// first admin dashboard; EXPLAIN QUERY PLAN in the package's api.md), and the results go through a
// short single-flight TTL cache (lib/ttl-cache.js): the work is one computation per key per TTL no
// matter how many admins ask. Reads write NO audit row — the same rule as GET /admin/stats, and
// scripts/check-admin-audit.mjs only demands audits of writes.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { assertAdmin } from '../lib/assert-admin.js';
import { createTtlCache } from '../lib/ttl-cache.js';
import { coinIntegrity } from '../coins/integrity.js';

const router = Router();

/* ── limits ─────────────────────────────────────────────────────────────────────────────────── */

const limiter = (limit, keyGenerator) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...(keyGenerator ? { keyGenerator } : {}),
  });

// Lower than the admin read budget in routes.js (600 / 300): this page is the heavy one. Opening it
// is one request and each window switch is one more, so 120 per admin per 15 minutes is a person
// switching windows every seven seconds without a break.
const statsIpLimiter = limiter(240);
const statsAdminLimiter = limiter(120, (req) => `adm-stat:${req.user?.id ?? ipKeyGenerator(req.ip)}`);

/* ── the cache ──────────────────────────────────────────────────────────────────────────────── */

export const PANEL_TTL_MS = 30_000;
export const STATISTICS_TTL_MS = 45_000;
const cache = createTtlCache();

/** Cap on what the coin integrity row counts per check (see `integrity` below). */
const INTEGRITY_LIMIT = 500;

/* ── dates ──────────────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key, n) => dayKey(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS);
const startSec = (key) => Date.parse(`${key}T00:00:00Z`) / 1000;
const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** `days` consecutive UTC date keys ending at (and including) `today`. */
const windowKeys = (today, days) => Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));

/**
 * Lay sparse SQL rows over the full window, zero where nothing happened.
 *
 * The client draws these as curves and bar rows; a series that skips quiet days draws a lie (the
 * line connects Monday to Thursday as if Tuesday were Monday). Dense by construction means the
 * client never has to know which days are missing. A row outside the window (a local_date a day
 * ahead of UTC, say) is ignored rather than extending the array.
 */
function dense(keys, rows, fields) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return keys.map((day) => {
    const r = byDay.get(day);
    const point = { day };
    for (const f of fields) point[f] = n0(r?.[f]);
    return point;
  });
}

const sumOf = (daily, field) => daily.reduce((acc, p) => acc + p[field], 0);

/* ── the panel (GET /admin/stats → `panel`) ─────────────────────────────────────────────────── */

const PANEL_DAYS = 30;

/**
 * The part of the panel that is a scan: the 30-day curve of people who logged something and the
 * workout counts. Cached for PANEL_TTL_MS. Everything an admin ACTS on is read live in
 * panelFigures(), so a decision on the queue below the panel moves its number at once.
 */
async function computeActivity(today) {
  const keys = windowKeys(today, PANEL_DAYS);
  const from = keys[0];
  const week = addDays(today, -6); // 7 local days: today and the six before

  const [logged, people, workouts] = await Promise.all([
    db.all(LOGGED_PER_DAY, [from, today, from, today]),
    db.get(LOGGED_DISTINCT, [from, today, from, today]),
    db.get(
      `SELECT COALESCE(SUM(local_date = ?), 0) AS today, COUNT(*) AS last7d
         FROM workout_logs
        WHERE status = 'completed' AND local_date BETWEEN ? AND ?`,
      [today, week, today],
    ),
  ]);

  const daily = dense(keys, logged, ['n']);
  return {
    loggedPeople: {
      clock: 'local_date',
      daily,
      today: daily[daily.length - 1].n,
      inWindow: n0(people?.n),
    },
    workouts: { clock: 'local_date', today: n0(workouts?.today), last7d: n0(workouts?.last7d) },
  };
}

// Somebody who logged a workout AND a meal on one day is one person: UNION (not UNION ALL), and the
// DISTINCT sits over the union rather than over each half. Same rule as /admin/metrics.
const LOGGED_PER_DAY = `
  SELECT d AS day, COUNT(DISTINCT uid) AS n FROM (
    SELECT local_date AS d, client_user_id AS uid FROM workout_logs
     WHERE local_date BETWEEN ? AND ?
    UNION
    SELECT local_date AS d, client_user_id AS uid FROM nutrition_log_items
     WHERE local_date BETWEEN ? AND ?
  ) GROUP BY d`;

const LOGGED_DISTINCT = `
  SELECT COUNT(DISTINCT uid) AS n FROM (
    SELECT client_user_id AS uid FROM workout_logs        WHERE local_date BETWEEN ? AND ?
    UNION
    SELECT client_user_id AS uid FROM nutrition_log_items WHERE local_date BETWEEN ? AND ?
  )`;

/**
 * Everything the Moderation panel shows, for GET /admin/stats.
 *
 * LIVE (cheap indexed counts, read on every request): the user totals, the active coaches, the
 * pending-moderation count and the open-report count — the last two sit directly above the lists
 * they count, and a number that disagrees with the list under it for thirty seconds after a
 * decision reads as a bug.
 * CACHED (PANEL_TTL_MS): the workout counts and the 30-day curve.
 *
 * `moderationPending` counts exactly what the queue lists, so it excludes an orphaned submission
 * (owner erased their account): the existing `moderation.pending` on the same payload does not,
 * and the panel must agree with the queue rather than with that older number.
 */
export async function panelFigures() {
  const nowMs = Date.now();
  const today = dayKey(nowMs);
  const nowSec = Math.floor(nowMs / 1000);

  const [users, coaches, pending, reports, activity] = await Promise.all([
    db.get(
      `SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ?), 0) AS new7d FROM users`,
      [nowSec - 7 * 86400],
    ),
    // An ACTIVE coach is one with the coach role, an enabled account and at least one active client.
    // Accounts that merely hold the role answer a different, flattering question.
    db.get(
      `SELECT COUNT(*) AS n FROM users u
        WHERE u.role = 'coach' AND u.disabled_at IS NULL
          AND EXISTS (SELECT 1 FROM coach_clients c WHERE c.coach_id = u.id AND c.status = 'active')`,
    ),
    db.get(
      `SELECT COUNT(*) AS n FROM exercises
        WHERE status = 'pending_review' AND deleted_at IS NULL AND owner_id IS NOT NULL`,
    ),
    db.get(`SELECT COUNT(*) AS n FROM content_reports WHERE status_key = 'open'`),
    cache.get(`activity:${today}`, PANEL_TTL_MS, () => computeActivity(today)),
  ]);

  return {
    today,
    users: { total: n0(users?.total), new7d: n0(users?.new7d) },
    activeCoaches: n0(coaches?.n),
    workouts: activity.value.workouts,
    moderationPending: n0(pending?.n),
    openReports: n0(reports?.n),
    loggedPeople: activity.value.loggedPeople,
    // When the CACHED half (workouts, loggedPeople) was computed, and whether this response served
    // it from the store. The live counters above are always current.
    activityAsOf: Math.floor(activity.at / 1000),
    activityCached: activity.cached,
    activityTtlSeconds: PANEL_TTL_MS / 1000,
  };
}

/* ── the statistics page ────────────────────────────────────────────────────────────────────── */

const statisticsQuery = z
  .object({
    // A string pattern, not z.coerce.number(): coercion accepts '7.0', ' 7', '0x7' and '7e0', each of
    // which is a different spelling of the same cache key. Three exact strings, nothing else.
    days: z.string().regex(/^(7|30|90)$/).optional(),
  })
  .strict();

async function computeStatistics(days, today, nowSec) {
  const keys = windowKeys(today, days);
  const from = keys[0];
  const fromSec = startSec(from);
  const toSec = startSec(addDays(today, 1)); // exclusive: the end of today (UTC)
  const week = addDays(today, -6);

  const [
    userTotals,
    signups,
    logged,
    loggedPeople,
    workouts,
    nutrition,
    coins,
    integrity,
    posts,
    reports,
    coachTotals,
    coachSpread,
    sessions,
    audit,
    exercises,
    media,
    translations,
    pending,
    weekWorkouts,
  ] = await Promise.all([
    db.get(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(role = 'user'), 0)  AS members,
              COALESCE(SUM(role = 'coach'), 0) AS coaches,
              COALESCE(SUM(role = 'admin'), 0) AS admins,
              COALESCE(SUM(disabled_at IS NOT NULL), 0) AS disabled,
              COALESCE(SUM(must_change_credentials = 1), 0) AS mustChange,
              COALESCE(SUM(created_at >= ?), 0) AS new7d
         FROM users`,
      [nowSec - 7 * 86400],
    ),
    db.all(
      `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n
         FROM users WHERE created_at >= ? AND created_at < ? GROUP BY day`,
      [fromSec, toSec],
    ),
    db.all(LOGGED_PER_DAY, [from, today, from, today]),
    db.get(LOGGED_DISTINCT, [from, today, from, today]),
    db.all(
      `SELECT local_date AS day, COUNT(*) AS n
         FROM workout_logs
        WHERE status = 'completed' AND local_date BETWEEN ? AND ?
        GROUP BY local_date`,
      [from, today],
    ),
    db.all(
      `SELECT local_date AS day, COUNT(DISTINCT client_user_id) AS people, COUNT(*) AS entries
         FROM nutrition_log_items WHERE local_date BETWEEN ? AND ?
        GROUP BY local_date`,
      [from, today],
    ),
    // MINTED and SPENT come from the REASON's sign, not from the amount's: the reason is the
    // business meaning ("a credit"), the amount is its consequence, and a ledger row whose two
    // disagree is exactly what the integrity check exists to catch. `spent` is every DEBIT — a store
    // purchase, a reward, an admin debit AND a LifeOS penalty — because the page's job is to show
    // how much coin left circulation, not to classify why. Integer minor units; nothing divides.
    db.all(
      `SELECT date(l.created_at, 'unixepoch') AS day,
              COALESCE(SUM(CASE WHEN r.sign =  1 THEN ABS(l.amount_minor) END), 0) AS mintedMinor,
              COALESCE(SUM(CASE WHEN r.sign = -1 THEN ABS(l.amount_minor) END), 0) AS spentMinor,
              COUNT(*) AS entries
         FROM coin_ledger l JOIN coin_reasons r ON r.key = l.reason_key
        WHERE l.created_at >= ? AND l.created_at < ?
        GROUP BY day`,
      [fromSec, toSec],
    ),
    // The reconciliation scans the whole wallet and ledger tables (the audit page's own queries), and
    // it does not depend on the window — so it has its OWN cache entry, shared by 7 / 30 / 90, rather
    // than being recomputed once per window. The verdict can therefore be up to two TTLs old.
    cache.get('coin-integrity', STATISTICS_TTL_MS, () => coinIntegrity(INTEGRITY_LIMIT)).then((r) => r.value),
    // The state of a post is DERIVED, never stored (migration 021): removal by a moderator wins over
    // the author's withdrawal, which wins over publication. `scheduled` is published_at in the
    // future — public.js's feed predicate hides it, so it is neither a draft nor live.
    db.get(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(removed_at IS NOT NULL), 0) AS removed,
              COALESCE(SUM(removed_at IS NULL AND deleted_at IS NOT NULL), 0) AS withdrawn,
              COALESCE(SUM(removed_at IS NULL AND deleted_at IS NULL AND published_at IS NULL), 0) AS draft,
              COALESCE(SUM(removed_at IS NULL AND deleted_at IS NULL AND published_at > ?), 0) AS scheduled,
              COALESCE(SUM(removed_at IS NULL AND deleted_at IS NULL AND published_at <= ?), 0) AS live
         FROM coach_posts`,
      [nowSec, nowSec],
    ),
    db.get(
      `SELECT COALESCE(SUM(r.status_key = 'open'), 0)    AS open,
              COALESCE(SUM(r.status_key = 'triaged'), 0) AS triaged,
              COALESCE(SUM(r.status_key = 'open' AND rr.severity_rank >= 80), 0) AS openHigh,
              COALESCE(SUM(r.status_key = 'open' AND rr.severity_rank >= 50 AND rr.severity_rank < 80), 0) AS openMedium,
              COALESCE(SUM(r.status_key = 'open' AND rr.severity_rank < 50), 0) AS openLow,
              COALESCE(SUM(s.is_terminal = 1 AND r.resolved_at >= ? AND r.resolved_at < ?), 0) AS resolvedInWindow
         FROM content_reports r
         JOIN report_reasons rr ON rr.key = r.reason_key
         JOIN report_statuses s ON s.key = r.status_key`,
      [fromSec, toSec],
    ),
    // Coaches and their rosters. Same definition as the panel's "active coach": the coach role, an
    // enabled account, an ACTIVE link. Links held by an admin acting as a trainer are not counted
    // here, so the numbers read the same on the panel and on the page.
    db.get(
      `SELECT (SELECT COUNT(*) FROM users WHERE role = 'coach' AND disabled_at IS NULL) AS withRole,
              COUNT(DISTINCT c.coach_id) AS withClients,
              COUNT(*) AS activeLinks
         FROM coach_clients c JOIN users u ON u.id = c.coach_id
        WHERE c.status = 'active' AND u.role = 'coach' AND u.disabled_at IS NULL`,
    ),
    db.all(
      `SELECT CASE WHEN n = 1 THEN '1' WHEN n <= 3 THEN '2-3' WHEN n <= 5 THEN '4-5'
                   WHEN n <= 10 THEN '6-10' ELSE '11+' END AS bucket,
              COUNT(*) AS coaches
         FROM (SELECT c.coach_id, COUNT(*) AS n
                 FROM coach_clients c JOIN users u ON u.id = c.coach_id
                WHERE c.status = 'active' AND u.role = 'coach' AND u.disabled_at IS NULL
                GROUP BY c.coach_id)
        GROUP BY bucket`,
    ),
    // A LIVE session is a login the server would still honour: an unrevoked, unconsumed (not rotated
    // away), unexpired refresh token of an enabled account. COUNT(DISTINCT user) is people; the
    // families are logins (one person on a phone and a laptop is two). The older `sessions.active`
    // on GET /admin/stats counts TOKEN ROWS including rotated ones, which overstates.
    db.get(
      `SELECT COUNT(DISTINCT t.user_id) AS people, COUNT(DISTINCT t.family_id) AS logins
         FROM refresh_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.revoked = 0 AND t.consumed_at IS NULL AND t.expires_at > ? AND u.disabled_at IS NULL`,
      [nowSec],
    ),
    db.get('SELECT COUNT(*) AS n FROM audit_log WHERE created_at >= ?', [nowSec - 86400]),
    // The counts GET /admin/stats fetched and no screen used.
    db.get(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'global'), 0)  AS global,
              COALESCE(SUM(status = 'private'), 0) AS private,
              COALESCE(SUM(source = 'custom'), 0)  AS custom
         FROM exercises WHERE deleted_at IS NULL`,
    ),
    db.get('SELECT COUNT(*) AS total, COALESCE(SUM(bytes), 0) AS bytes FROM exercise_media WHERE deleted_at IS NULL'),
    db.get('SELECT COUNT(*) AS rows, COUNT(DISTINCT lang) AS langs FROM exercise_translations'),
    db.get(
      `SELECT COUNT(*) AS n FROM exercises
        WHERE status = 'pending_review' AND deleted_at IS NULL AND owner_id IS NOT NULL`,
    ),
    db.get(
      `SELECT COALESCE(SUM(local_date = ?), 0) AS today, COUNT(*) AS last7d
         FROM workout_logs WHERE status = 'completed' AND local_date BETWEEN ? AND ?`,
      [today, week, today],
    ),
  ]);

  const signupDaily = dense(keys, signups, ['n']);
  const loggedDaily = dense(keys, logged, ['n']);
  const workoutDaily = dense(keys, workouts, ['n']);
  const nutritionDaily = dense(keys, nutrition, ['people', 'entries']);
  const coinDaily = dense(keys, coins, ['mintedMinor', 'spentMinor', 'entries']);

  const mintedMinor = sumOf(coinDaily, 'mintedMinor');
  const spentMinor = sumOf(coinDaily, 'spentMinor');

  const buckets = ['1', '2-3', '4-5', '6-10', '11+'];
  const spread = new Map(coachSpread.map((r) => [r.bucket, r.coaches]));
  const withClients = n0(coachTotals?.withClients);
  const activeLinks = n0(coachTotals?.activeLinks);

  const integrityCounts = {
    drifting: integrity.drifting.length,
    unpaidPurchases: integrity.unpaidPurchases.length,
    orphanDebits: integrity.orphanDebits.length,
    unbackedEntitlements: integrity.unbackedEntitlements.length,
  };

  return {
    window: { days, from, to: today, today, clock: 'utc' },

    users: {
      total: n0(userTotals?.total),
      byRole: { user: n0(userTotals?.members), coach: n0(userTotals?.coaches), admin: n0(userTotals?.admins) },
      disabled: n0(userTotals?.disabled),
      mustChange: n0(userTotals?.mustChange),
      new7d: n0(userTotals?.new7d),
      signups: { clock: 'utc', daily: signupDaily, total: sumOf(signupDaily, 'n') },
    },

    activity: {
      // NOT daily active users: see the header. `inWindow` is DISTINCT people across the window (a
      // person active on ten days counts once), which is NOT the sum of `daily`.
      loggedPeople: {
        clock: 'local_date',
        daily: loggedDaily,
        today: loggedDaily[loggedDaily.length - 1].n,
        inWindow: n0(loggedPeople?.n),
      },
      completedWorkouts: {
        clock: 'local_date',
        daily: workoutDaily,
        total: sumOf(workoutDaily, 'n'),
        today: n0(weekWorkouts?.today),
        last7d: n0(weekWorkouts?.last7d),
      },
      nutritionLog: {
        clock: 'local_date',
        daily: nutritionDaily,
        totalEntries: sumOf(nutritionDaily, 'entries'),
      },
    },

    coins: {
      clock: 'utc',
      daily: coinDaily,
      mintedMinor,
      spentMinor,
      // The frame's "forgalom": how much moved, both directions. minted + spent, never a net.
      movedMinor: mintedMinor + spentMinor,
      entries: sumOf(coinDaily, 'entries'),
      integrity: {
        ok: integrity.clean,
        ...integrityCounts,
        // True when a check hit INTEGRITY_LIMIT: the counts are then "at least", not exact. The
        // verdict (`ok`) is unaffected — one row is already "not ok".
        capped: Object.values(integrityCounts).some((c) => c >= INTEGRITY_LIMIT),
      },
    },

    marketplace: {
      clock: 'epoch',
      posts: {
        total: n0(posts?.total),
        draft: n0(posts?.draft),
        scheduled: n0(posts?.scheduled),
        live: n0(posts?.live),
        withdrawn: n0(posts?.withdrawn),
        removed: n0(posts?.removed),
      },
      reports: {
        open: n0(reports?.open),
        triaged: n0(reports?.triaged),
        // OPEN reports by the severity_rank of their reason: high >= 80, medium 50..79, low < 50.
        openBySeverity: { high: n0(reports?.openHigh), medium: n0(reports?.openMedium), low: n0(reports?.openLow) },
        // Cases CLOSED (a terminal status) inside the window, by resolved_at.
        resolvedInWindow: n0(reports?.resolvedInWindow),
      },
    },

    coaches: {
      withRole: n0(coachTotals?.withRole),
      withClients,
      activeLinks,
      // null, not 0, when no coach has a client: an average over nothing is not zero.
      clientsPerCoach: withClients > 0 ? Math.round((activeLinks / withClients) * 10) / 10 : null,
      distribution: buckets.map((bucket) => ({ bucket, coaches: n0(spread.get(bucket)) })),
    },

    system: {
      clock: 'epoch',
      liveSessions: { people: n0(sessions?.people), logins: n0(sessions?.logins) },
      auditEvents24h: n0(audit?.n),
      exercises: {
        total: n0(exercises?.total),
        global: n0(exercises?.global),
        private: n0(exercises?.private),
        custom: n0(exercises?.custom),
        pendingReview: n0(pending?.n),
      },
      media: { total: n0(media?.total), bytes: n0(media?.bytes) },
      translations: { rows: n0(translations?.rows), langs: n0(translations?.langs) },
    },
  };
}

/**
 * The detailed Statistics page.
 *
 * Same authorisation as the rest of the admin reads — the token's role is the cheap gate,
 * assertAdmin re-reads it from the database — and NO audit row: a read changes nothing, and
 * check-admin-audit.mjs demands audits of writes only.
 *
 * The cache key carries the UTC day as well as the window: a response computed just before midnight
 * must not be served after it with a window that still ends yesterday.
 */
router.get(
  '/admin/statistics',
  requireAuth,
  requireRole('admin'),
  statsIpLimiter,
  statsAdminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;
    const parsed = statisticsQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION, 'invalid request');
    const days = Number(parsed.data.days ?? 30);

    const nowMs = Date.now();
    const today = dayKey(nowMs);
    const result = await cache.get(`statistics:${days}:${today}`, STATISTICS_TTL_MS, () =>
      computeStatistics(days, today, Math.floor(nowMs / 1000)),
    );

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...result.value,
      meta: {
        generatedAt: Math.floor(result.at / 1000),
        cached: result.cached,
        cacheTtlSeconds: STATISTICS_TTL_MS / 1000,
      },
    });
  }),
);

export default router;
