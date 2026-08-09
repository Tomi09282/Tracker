// src/public/moderation.js — reporting, and the queue that acts on it.
//
// ═══ THIS WAS THE GAP THE COMPOSER OPENED ══════════════════════════════════════════════════════
//
// Migration 021 shipped `content_reports` with a careful shape: exactly one subject, a reporter who
// cannot be the author, a body snapshot so a moderator judges what was actually seen, a daily quota,
// a resolution triple that moves as one, and a rule that the snapshot is DESTROYED when the case
// closes. Nothing in `src/` referenced any of it, and no route anywhere wrote `removed_at`.
//
// Which meant that the moment the composer shipped, a coach could publish to the open internet and
// there was no way to report it and no way to take it down. That is the order these things have to
// be built in, and this file is the second half arriving late rather than not at all.
//
// ═══ TWO AUDIENCES, ONE FILE ═══════════════════════════════════════════════════════════════════
//
// Reporting is for any signed-in reader — `requireAuth` and no role gate, because the person who
// finds something is rarely a coach. The queue is `requireAdmin`. They sit together because they
// are two ends of one process and splitting them would put the vocabulary in two places.

import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { displayText } from './text.js';
import { PUBLIC_ID_RE, HANDLE_RE } from './shapes.js';

const router = Router();
const requireAdmin = requireRole('admin');

const limiter = (limit, keyGenerator) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...(keyGenerator ? { keyGenerator } : {}),
  });

// Reporting is limited well ABOVE the database's own daily quota, for the same reason publishing is:
// the quota survives a restart and a second worker process, and a limiter set to the same ceiling
// would let a few retries of one report exhaust the day's allowance.
const reportIpLimiter = limiter(60);
const reportAccountLimiter = limiter(40, (req) => `rep:${req.user?.id ?? req.ip}`);
const adminReadLimiter = limiter(600);
const adminWriteLimiter = limiter(120);

const REPORT_OUTCOMES = {
  missing: 404,
  self_report: 409,
  reason_unavailable: 409,
  quota_reached: 409,
  already_resolved: 409,
  status_unknown: 409,
  removal_needs_reason: 409,
  not_an_admin: 403,
};

const sendModerationOutcome = (res, result) => {
  const status = REPORT_OUTCOMES[result.outcome];
  if (!status) return sendError(res, 500, ERR.INTERNAL, 'internal error');
  if (status === 404) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
  if (status === 403) return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  const { outcome, ...facts } = result;
  return res.status(409).json({
    error: 'conflict',
    code: ERR.CONFLICT,
    reason: outcome,
    ...facts,
    requestId: res.locals.requestId,
  });
};

/*
 * EXACTLY ONE SUBJECT, enforced by the schema and mirrored here so the refusal is readable.
 *
 * `reason_key` bounds the SHAPE only. Which reasons a member of the public may actually use is a
 * column in `report_reasons` — `legal_order` and `admin_discretion` are marked non-reportable, so
 * they exist as removal reasons an admin can record and are unreachable from this route.
 */
const reportBody = z
  .object({
    post_id: z.string().regex(PUBLIC_ID_RE).nullable(),
    handle: z.string().regex(HANDLE_RE).nullable(),
    reason_key: z.string().regex(/^[a-z_]{3,32}$/),
    note: displayText(1, 2000).nullable(),
  })
  .strict()
  .refine((v) => (v.post_id === null) !== (v.handle === null), 'report exactly one subject');

/**
 * Report a post or a profile.
 *
 * The subject must be something the reporter could actually SEE: the lookup carries the same
 * published-and-not-removed predicate the public reads use. Reporting a draft would confirm that a
 * draft exists behind a guessed id, which no public read discloses — a report form is a poor place
 * to install an oracle.
 */
router.post(
  '/reports',
  requireAuth,
  reportIpLimiter,
  reportAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = reportBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.fileReport({
      reporterId: req.user.id,
      publicId: parsed.data.post_id,
      handle: parsed.data.handle,
      reasonKey: parsed.data.reason_key,
      note: parsed.data.note,
      requestId: res.locals.requestId,
    });

    if (result.outcome !== 'applied') return sendModerationOutcome(res, result);
    // The report id is returned so a reporter can be told "we have this" — but nothing about the
    // subject, the queue or what happens next. A reporter is not a party to the decision.
    res.status(result.replayed ? 200 : 201).json({ reportId: result.reportId, replayed: result.replayed });
  }),
);

const queueQuery = z
  .object({
    status: z.enum(['open', 'triaged', 'upheld', 'rejected', 'duplicate']).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

/**
 * The queue, ordered by how bad the reason is and then by age.
 *
 * `severity_rank` lives in `report_reasons`, so re-ordering the queue is an UPDATE rather than a
 * deploy — and the number of DISTINCT reporters is counted here rather than the number of reports,
 * because one person filing five times is one person.
 */
router.get(
  '/admin/marketplace/reports',
  requireAuth,
  requireAdmin,
  adminReadLimiter,
  asyncRoute(async (req, res) => {
    const parsed = queueQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { status = 'open', limit = 25 } = parsed.data;

    const reports = await db.all(
      `SELECT r.id, r.reason_key AS reason, r.note, r.body_snapshot AS snapshot,
              r.snapshot_truncated AS snapshotTruncated, r.status_key AS status,
              r.created_at AS createdAt,
              p.public_id AS postId, p.title AS postTitle,
              c.handle AS profileHandle, c.display_name AS profileName,
              author.handle AS authorHandle,
              rr.severity_rank AS severity,
              (SELECT COUNT(DISTINCT x.reporter_user_id) FROM content_reports x
                WHERE (x.subject_post_id IS NOT NULL AND x.subject_post_id = r.subject_post_id)
                   OR (x.subject_profile_id IS NOT NULL AND x.subject_profile_id = r.subject_profile_id)
              ) AS distinctReporters
         FROM content_reports r
         JOIN report_reasons rr ON rr.key = r.reason_key
         LEFT JOIN coach_posts p ON p.id = r.subject_post_id
         LEFT JOIN coach_profiles c ON c.user_id = r.subject_profile_id
         LEFT JOIN coach_profiles author ON author.user_id = r.subject_author_user_id
        WHERE r.status_key = ?
        ORDER BY rr.severity_rank DESC, r.created_at ASC
        LIMIT ?`,
      [status, limit],
    );

    // NO reporter identity in this projection, deliberately. A moderator judging content does not
    // need to know who objected, and a queue that shows it invites the decision to be about them.
    res.json({ reports });
  }),
);

const resolveBody = z
  .object({
    status: z.enum(['triaged', 'upheld', 'rejected', 'duplicate']),
    note: displayText(1, 2000).nullable(),
    remove: z.boolean(),
    removal_reason: displayText(1, 2000).nullable(),
  })
  .strict()
  // Removing something requires saying why, in writing, at the moment it is done. A trigger refuses
  // it too — this is so the refusal names the missing field.
  .refine((v) => !v.remove || (v.removal_reason !== null), 'a removal needs a reason');

/**
 * Resolve a report, taking the subject down in the same transaction when it is upheld.
 *
 * Removing a PROFILE takes that coach's whole back catalogue off the marketplace on the next read,
 * because `PUBLIC_POST` requires a live profile. Nothing sweeps and nothing has to remember.
 */
router.post(
  '/admin/marketplace/reports/:id/resolve',
  requireAuth,
  requireAdmin,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    const id = z.object({ id: z.coerce.number().int().min(1) }).strict().safeParse(req.params);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    const parsed = resolveBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.resolveReport({
      reportId: id.data.id,
      adminId: req.user.id,
      statusKey: parsed.data.status,
      note: parsed.data.note,
      removeSubject: parsed.data.remove,
      removalReason: parsed.data.removal_reason,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendModerationOutcome(res, result);
    res.json({ report: result });
  }),
);

const removeBody = z
  .object({
    post_id: z.string().regex(PUBLIC_ID_RE).nullable(),
    handle: z.string().regex(HANDLE_RE).nullable(),
    removal_reason: displayText(1, 2000),
  })
  .strict()
  .refine((v) => (v.post_id === null) !== (v.handle === null), 'remove exactly one subject');

/**
 * Take something down with no report behind it.
 *
 * A court order does not arrive as a user report, and neither does an admin noticing something at
 * three in the morning. Every one of these lands in `audit_log` with the reason attached, which is
 * the difference between a moderation system and a delete button.
 */
router.post(
  '/admin/marketplace/remove',
  requireAuth,
  requireAdmin,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    const parsed = removeBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.removeSubject({
      adminId: req.user.id,
      publicId: parsed.data.post_id,
      handle: parsed.data.handle,
      removalReason: parsed.data.removal_reason,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendModerationOutcome(res, result);
    res.json({ removed: true, replayed: result.replayed });
  }),
);

export default router;
