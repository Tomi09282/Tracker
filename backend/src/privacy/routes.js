// src/privacy/routes.js — a person's two rights over their own record: see it, and end it.
//
// ═══ NEITHER ROUTE TAKES AN ID ═════════════════════════════════════════════════════════════════
//
// Not a path parameter, not a body field, not a query string. The subject is `req.user.id` and
// nothing else, so there is no id to forge and no ownership check to get wrong — the anti-IDOR
// argument here is that the object-level question is never asked, because there is only ever one
// object. An admin cannot export somebody else's data through these, and that is deliberate: an
// export is a right the SUBJECT exercises, and a support tool that produces one on demand is a
// tool for reading people's health data with a legitimate-sounding button.
import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, invalidateSvCache, clearAuthCookies } from '../auth/middleware.js';

const router = Router();

const limiter = (limit, keyGenerator) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...(keyGenerator ? { keyGenerator } : {}),
  });

/**
 * An hour-long window, not fifteen minutes.
 *
 * An export reads thirty tables in one transaction and serialises the lot. It is the most expensive
 * read in the product, and nobody needs their own data six times a minute — but somebody who has
 * lost a download does need it twice. Six an hour is generous for a person and useless as an
 * amplifier.
 */
const exportIpLimiter = limiter(30);
const exportAccountLimiter = limiter(6, (req) => `exp:${req.user?.id ?? ipKeyGenerator(req.ip)}`);
// Deletion is rate-limited on the PASSWORD attempt, not on the deletion: the endpoint is a password
// oracle otherwise, and the same tier the login uses is the one that already thinks about that.
const deleteIpLimiter = limiter(20);
const deleteAccountLimiter = limiter(5, (req) => `del:${req.user?.id ?? ipKeyGenerator(req.ip)}`);

const emptyQuery = z.object({}).strict();

/**
 * Everything the product holds about the caller.
 *
 * ═══ IT IS A DOWNLOAD, NOT A SCREEN ════════════════════════════════════════════════════════════
 *
 * `Content-Disposition: attachment` and `no-store`. An export that renders in a tab is an export
 * that sits in the browser cache and in the back button, on a machine that may not be the person's
 * — and this file contains their training history and their measurements.
 */
router.get(
  '/me/export',
  requireAuth,
  exportIpLimiter,
  exportAccountLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);

    const payload = await db.exportMyData({ userId: req.user.id });

    // Recorded, and it has to be: an export is a copy of somebody's health data leaving the
    // system, and the one thing worse than not knowing it happened is being unable to prove it
    // did. No detail beyond the fact and the moment.
    await db.run(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id, ip)
       VALUES (?, 'account.export', 'user', ?, ?, ?)`,
      [req.user.id, req.user.id, res.locals.requestId, req.ip ?? null],
    );

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tracker-export-${req.user.id}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  }),
);

const DeleteBody = z
  .object({
    // Re-typing the password is the step-up. The session already proves identity; what it does not
    // prove is that the person at the keyboard is the account holder, and this is the one action in
    // the product that cannot be undone by anybody, including the operator.
    password: z.string().min(1).max(200),
    // A typed confirmation, checked against a constant the CLIENT is told. Not a translated word:
    // the server would then need the client's language to validate, and a mismatched locale would
    // make the account undeletable.
    confirm: z.literal('DELETE'),
  })
  .strict();

const DELETE_OUTCOMES = {
  missing: 404,
  last_admin: 409,
};

/**
 * End the account.
 *
 * ═══ WHAT SURVIVES, AND WHY EACH ONE DOES ══════════════════════════════════════════════════════
 *
 * The audit log survives with `actor_id` set to NULL — 018 made that the single UPDATE its
 * append-only trigger permits, and the erasure row is written BEFORE the delete so the fact that an
 * account ended is permanent and anonymous.
 *
 * Exercises an admin PROMOTED to the shared library survive, unlinked. They carry the author's id
 * because approval never cleared it, and `exercises.owner_id` is ON DELETE CASCADE — so without
 * this a coach with one approved exercise would take it out of the library for everybody on their
 * way out, leaving a null exercise in every plan that used it. Promotion is the moment content
 * stops being the coach's and becomes the product's; erasure unlinks it rather than destroying it,
 * which is what erasure means.
 *
 * Everything else goes: 39 foreign keys cascade and 16 set null, measured rather than listed, so
 * adding a table cannot leave a forgotten row behind.
 */
router.post(
  '/me/delete',
  requireAuth,
  deleteIpLimiter,
  deleteAccountLimiter,
  asyncRoute(async (req, res) => {
    const body = DeleteBody.safeParse(req.body);
    if (!body.success) return sendError(res, 400, ERR.VALIDATION);

    const me = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!me) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
    if (!(await argon2.verify(me.password_hash, body.data.password))) {
      return sendError(res, 401, ERR.UNAUTHORIZED, 'invalid credentials');
    }

    const result = await db.deleteMyAccount({
      userId: req.user.id,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'erased') {
      const status = DELETE_OUTCOMES[result.outcome];
      if (status === 404) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      return res.status(409).json({
        error: 'conflict',
        code: ERR.CONFLICT,
        // The sole admin erasing themselves would leave the product with no admin and no route that
        // could mint one. Refused rather than warned about — the way out is to promote somebody
        // first, which should be a deliberate act.
        reason: result.outcome,
        requestId: res.locals.requestId,
      });
    }

    invalidateSvCache(req.user.id);
    clearAuthCookies(res);
    req.log.warn({ userId: req.user.id }, 'account erased at the account holder\'s request');
    res.json({ erased: true });
  }),
);

export default router;
