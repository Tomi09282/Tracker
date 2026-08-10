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

    // ═══ THIS USED TO BE A writeTx PAIR, AND IT REFUSED AFTER IT HAD COMMITTED ═════════════════
    //
    // The old shape ran `writeTx([guardedUpdate, auditInsert])` and then checked
    // `updated.changes === 0` to answer 409. writeTx commits every step before it returns, so the
    // audit row was durable by then.
    //
    // THE EXPOSURE WAS CONCURRENCY, not a plain second click. The old SELECT above caught a
    // sequential repeat and answered 404. But two moderators on the queue at the same instant — or
    // one double-click whose requests overlap — both passed that SELECT, both ran the writeTx, and
    // both committed an audit row. One decision, two log entries, the second recording an approval
    // that was refused. The log is the one artefact everybody else is told to trust.
    //
    // Measured after the fix: two concurrent decisions come back `applied / missing` and write ONE
    // audit row. `scripts/check-route-tx.mjs` is the gate that found this shape and keeps it out.
    const result = await db.decideExercise({
      adminId: req.user.id,
      exerciseId: id,
      approve: body.decision === 'approve',
      reason: body.reason ?? null,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    // ONE refusal, and it covers both cases. A submission that was never there and one that another
    // moderator decided a moment ago are the same thing from here: not in the queue. The old route
    // had a 409 'already decided' beside this, and it was unreachable — the SELECT caught the
    // sequential case, and under concurrency the loser's SELECT runs after the winner's commit.
    if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');

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
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    const body = RoleSchema.safeParse(req.body);
    if (!body.success) return sendError(res, 400, ERR.VALIDATION);

    // EVERY guard now lives inside the transaction, including the actor's own role. The pre-checks
    // this replaced could not hold the one that mattered: two admins demoting each other at the
    // same instant both passed, and the product was left with no admin and no way to mint one.
    const result = await db.setUserRole({
      actorId: req.user.id,
      targetId: id.data,
      role: body.data.role,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendDisableOutcome(res, result);
    invalidateSvCache(id.data);

    req.log.info({ targetId: id.data, to: body.data.role }, 'role changed');
    res.json({ ok: true, account: { id: result.id, role: result.role }, replayed: result.replayed });
  }),
);

/* ── disabling an account ───────────────────────────────────────────────────────────────────── */

const DISABLE_OUTCOMES = {
  missing: 404,
  not_an_admin: 403,
  cannot_disable_self: 409,
  cannot_change_own_role: 409,
  needs_reason: 409,
};

const sendDisableOutcome = (res, result) => {
  const status = DISABLE_OUTCOMES[result.outcome];
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

const DisableBody = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
const EnableBody = z.object({}).strict();

/**
 * Stop an account.
 *
 * ═══ EIGHT FILES READ `disabled_at` AND NOTHING COULD SET IT ═══════════════════════════════════
 *
 * Login, every authenticated request, publishing, restoring a withdrawn post, removing content and
 * resolving a report all check it. Until this route existed, a coach posting things that should not
 * be on the internet could have each post taken down one at a time — and keep posting.
 *
 * The revocation is already instant and was already correct: `getSessionVersion` answers -1 for a
 * disabled account, which can never match a token's `sv`, so every live session dies on the next
 * request. `invalidateSvCache` drops the thirty-second read cache so "next request" means the next
 * one rather than the one after half a minute.
 *
 * A reason is REQUIRED. Stopping somebody's account is the heaviest thing this product can do to a
 * person, and an audit row that says only "disabled" is a record of the act without the judgement.
 */
router.post(
  '/admin/users/:id/disable',
  requireAuth,
  requireRole('admin'),
  adminLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    const body = DisableBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.setAccountDisabled({
      actorId: req.user.id,
      targetId: id.data,
      disabled: true,
      reason: body.data.reason,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendDisableOutcome(res, result);
    invalidateSvCache(id.data);
    req.log.warn({ targetId: id.data }, 'account disabled');
    res.json({ account: { id: result.id, disabledAt: result.disabledAt }, replayed: result.replayed });
  }),
);

/**
 * Let an account back in.
 *
 * No reason required, deliberately, and the asymmetry is the point: the heavy act is stopping
 * somebody, and requiring paperwork to undo a mistake makes the mistake likelier to stand.
 */
router.post(
  '/admin/users/:id/enable',
  requireAuth,
  requireRole('admin'),
  adminLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (!EnableBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.setAccountDisabled({
      actorId: req.user.id,
      targetId: id.data,
      disabled: false,
      reason: null,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendDisableOutcome(res, result);
    invalidateSvCache(id.data);
    req.log.info({ targetId: id.data }, 'account enabled');
    res.json({ account: { id: result.id, disabledAt: result.disabledAt }, replayed: result.replayed });
  }),
);

export default router;
