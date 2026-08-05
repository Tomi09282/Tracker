// src/admin/routes.js — F8-lite: stats and the exercise moderation queue.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireRole, invalidateSvCache } from '../auth/middleware.js';
import { resolveLang, languages } from '../lib/lang.js';

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Re-read the caller's role from the DATABASE, inside the request.
 *
 * `requireRole` reads the JWT, which is a fast-path hint that can be up to 15 minutes stale.
 * For an operation that reshapes the product for everyone, or that publishes content, the token
 * is not good enough: a role revoked thirty seconds ago must not still work here.
 */
async function assertAdmin(req, res) {
  const actor = await db.get('SELECT role FROM users WHERE id = ? AND disabled_at IS NULL', [
    req.user.id,
  ]);
  if (actor?.role !== 'admin') {
    sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
    return false;
  }
  return true;
}

router.get(
  '/admin/stats',
  requireAuth,
  requireRole('admin'),
  adminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;

    // One round trip per metric would be several worker hops; these are cheap indexed counts,
    // so they run in parallel across the pool.
    const [users, exercises, media, moderation, translations, sessions, audit] = await Promise.all([
      db.get(`SELECT COUNT(*) AS total,
                     SUM(role = 'coach') AS coaches,
                     SUM(role = 'admin') AS admins,
                     SUM(disabled_at IS NOT NULL) AS disabled,
                     SUM(created_at >= unixepoch() - 604800) AS new_7d
                FROM users`),
      db.get(`SELECT COUNT(*) AS total,
                     SUM(status = 'global') AS global,
                     SUM(status = 'private') AS private,
                     SUM(source = 'custom') AS custom
                FROM exercises WHERE deleted_at IS NULL`),
      db.get('SELECT COUNT(*) AS total, COALESCE(SUM(bytes), 0) AS bytes FROM exercise_media WHERE deleted_at IS NULL'),
      db.get("SELECT COUNT(*) AS pending FROM exercises WHERE status = 'pending_review' AND deleted_at IS NULL"),
      db.get('SELECT COUNT(*) AS rows, COUNT(DISTINCT lang) AS langs FROM exercise_translations'),
      db.get('SELECT COUNT(*) AS active FROM refresh_tokens WHERE revoked = 0 AND expires_at > unixepoch()'),
      db.get('SELECT COUNT(*) AS events_24h FROM audit_log WHERE created_at >= unixepoch() - 86400'),
    ]);

    res.json({ users, exercises, media, moderation, translations, sessions, audit });
  }),
);

router.get(
  '/admin/moderation',
  requireAuth,
  requireRole('admin'),
  adminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const lang = await resolveLang(req);
    const { fallback } = await languages();

    // The admin arm of the visibility rule: pending_review rows are invisible to everyone else,
    // and this is the only place they are listed.
    const queue = await db.all(
      `SELECT e.id, e.submitted_at, e.difficulty, e.exercise_type, e.owner_id,
              COALESCE(t.name, tf.name, e.name) AS name,
              u.email AS owner_email,
              (SELECT COUNT(*) FROM exercise_media m WHERE m.exercise_id = e.id AND m.deleted_at IS NULL) AS media_count
         FROM exercises e
         LEFT JOIN exercise_translations t  ON t.exercise_id  = e.id AND t.lang  = ?
         LEFT JOIN exercise_translations tf ON tf.exercise_id = e.id AND tf.lang = ?
         LEFT JOIN users u ON u.id = e.owner_id
        WHERE e.status = 'pending_review' AND e.deleted_at IS NULL
        ORDER BY e.submitted_at ASC
        LIMIT 50`,
      [lang, fallback],
    );
    res.json({ queue });
  }),
);

const DecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((d) => d.decision !== 'reject' || (d.reason && d.reason.length > 0), {
    // A rejection with no reason leaves the coach guessing what to fix, which turns moderation
    // into a black box and guarantees the same submission comes back unchanged.
    message: 'a rejection must carry a reason',
    path: ['reason'],
  });

router.post(
  '/admin/moderation/:id',
  requireAuth,
  requireRole('admin'),
  adminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = DecisionSchema.parse(req.body);

    const target = await db.get(
      "SELECT id, owner_id, name FROM exercises WHERE id = ? AND status = 'pending_review' AND deleted_at IS NULL",
      [id],
    );
    if (!target) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const approving = body.decision === 'approve';

    // The decision and its audit row commit together. An approval that publishes content to
    // every user, with no record of who approved it, is exactly what the append-only log exists
    // to prevent — and the guard stays inside the UPDATE so a double-click cannot double-decide.
    const [updated] = await db.writeTx([
      {
        sql: approving
          ? `UPDATE exercises SET status = 'global', owner_id = owner_id, rejection_reason = NULL
              WHERE id = ? AND status = 'pending_review'`
          : `UPDATE exercises SET status = 'rejected', rejection_reason = ?
              WHERE id = ? AND status = 'pending_review'`,
        params: approving ? [id] : [body.reason, id],
      },
      {
        sql: `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
              VALUES (?, ?, 'exercise', ?, ?, ?, ?)`,
        params: [
          req.user.id,
          approving ? 'exercise.moderation.approve' : 'exercise.moderation.reject',
          id,
          JSON.stringify({ name: target.name, ownerId: target.owner_id, reason: body.reason ?? null }),
          res.locals.requestId,
          req.ip ?? null,
        ],
      },
    ]);

    if (updated.changes === 0) return sendError(res, 409, ERR.CONFLICT, 'already decided');

    req.log.info({ exerciseId: id, decision: body.decision }, 'moderation decision');
    res.json({ ok: true });
  }),
);

const RoleSchema = z.object({ role: z.enum(['user', 'coach', 'admin']) }).strict();

router.post(
  '/admin/users/:id/role',
  requireAuth,
  requireRole('admin'),
  adminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { role } = RoleSchema.parse(req.body);

    const target = await db.get('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!target) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    // An admin demoting themselves can lock the last admin out of the system.
    if (id === req.user.id) return sendError(res, 409, ERR.CONFLICT, 'cannot change your own role');

    // The session_version bump rides in the SAME transaction as the role change. Without it the
    // old access token keeps its old role for up to fifteen minutes, and the instant-revocation
    // promise of the sv claim is simply untrue.
    await db.writeTx([
      { sql: 'UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ?', params: [role, id] },
      {
        sql: `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
              VALUES (?, 'user.role.change', 'user', ?, ?, ?, ?)`,
        params: [req.user.id, id, JSON.stringify({ from: target.role, to: role }), res.locals.requestId, req.ip ?? null],
      },
    ]);
    invalidateSvCache(id);

    req.log.info({ targetId: id, from: target.role, to: role }, 'role changed');
    res.json({ ok: true });
  }),
);

export default router;
