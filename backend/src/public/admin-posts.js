// src/public/admin-posts.js — the ADMIN side of marketplace posts (package B-admin-posts).
//
// ═══ WHAT THIS FILE IS, AND WHAT IT IS NOT ═════════════════════════════════════════════════════
//
// Before this file the admin could see exactly one thing about the marketplace: the reports queue
// (public/moderation.js). A moderator who wanted to look at a POST had to wait for somebody to
// report it, and a post taken down by mistake could not be put back at all (the 021 comment said
// "restore exists"; no route did). The owner decided (2026-11-03): the admin can VIEW every post,
// TAKE IT DOWN with a required reason, and RESTORE it. The admin does NOT edit post text.
//
//   GET  /admin/marketplace/posts                 the list: search, state / kind filter, sort, keyset
//   GET  /admin/marketplace/posts/:publicId       the inspect page, ONE request
//   POST /admin/marketplace/posts/:publicId/restore   lift a take-down
//   GET  /admin/marketplace/media/:key            a post picture, for the admin page only
//
// The take-down is NOT here: it is POST /admin/marketplace/remove in moderation.js, reused as it is
// (it takes the 12-character public id as `post_id`).
//
// ═══ EVERY ROUTE HERE IS requireAuth + requireRole('admin') + A DB RE-CHECK ═══════════════════════
//
// The role claim in the token is a hint that can be fifteen minutes stale, so a read re-reads the
// role from the database (`assertAdmin`) and the one write re-reads it again UNDER THE WRITE LOCK
// inside the named transaction. Two limiters guard each route - one per IP and one per ADMIN
// ACCOUNT - because a per-IP limit stops a machine and not a principal with a phone and a laptop.
//
// ═══ A DRAFT STAYS PRIVATE ═════════════════════════════════════════════════════════════════════
//
// A post that was never published shows metadata only: `bodyWithheld: true`, `mediaWithheld: true`
// (see db/tx/admin-posts.js). The picture route below refuses the key of a never-published post for
// the same reason; to the admin it is as invisible as it is to the public.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { assertAdmin } from '../lib/assert-admin.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { resolveStoredPath } from '../lib/media.js';
import { toFtsQuery } from '../lib/normalize.js';
import { encodeCursor, decodeCursor } from '../lib/cursor.js';
import { displayText } from './text.js';
import { PUBLIC_ID_RE, KIND_KEY_RE, PUB_MEDIA_KEY_RE } from './shapes.js';

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

// Reads and writes do not share a budget (admin/routes.js, the same argument), and each has an
// IP tier and an ACCOUNT tier. The picture route has its own, higher pair: one inspect page loads
// up to nine images.
const readIpLimiter = limiter(600);
const readAdminLimiter = limiter(300, (req) => `adm-post-r:${req.user?.id ?? ipKeyGenerator(req.ip)}`);
const writeIpLimiter = limiter(120);
const writeAdminLimiter = limiter(60, (req) => `adm-post-w:${req.user?.id ?? ipKeyGenerator(req.ip)}`);
const mediaIpLimiter = limiter(1500);
const mediaAdminLimiter = limiter(900, (req) => `adm-post-m:${req.user?.id ?? ipKeyGenerator(req.ip)}`);

const publicIdParam = z.object({ publicId: z.string().regex(PUBLIC_ID_RE) }).strict();

/* ── the list ───────────────────────────────────────────────────────────────────────────────── */

const SORT_WIDTH = { newest: 2, oldest: 2, reports: 3 };

const listQuery = z
  .object({
    // Printable text only: no control characters, no lone surrogates. `%` and `_` ARE allowed - they
    // are escaped before they reach the LIKE (below), so a search for `%` finds titles that contain
    // a percent sign instead of every post in the product.
    q: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((v) => v.isWellFormed() && !/\p{Cc}/u.test(v)),
    state: z.enum(['all', 'draft', 'live', 'withdrawn', 'removed']),
    kind: z.string().regex(KIND_KEY_RE),
    sort: z.enum(['newest', 'oldest', 'reports']),
    cursor: z.string().max(200),
    limit: z.coerce.number().int().min(1).max(50),
  })
  .strict()
  .partial();

/** `%`, `_` and the escape character itself are LIKE metacharacters. */
const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Every marketplace post in any state.
 *
 * ═══ SEARCH ═══════════════════════════════════════════════════════════════════════════════════
 * Substring over the title, the author's handle and display names (escaped LIKE), OR token prefix
 * over the TITLE through the existing FTS index (accent- and case-insensitive). The FTS arm is
 * column-filtered to the title: the index also holds draft bodies. Decision and reasons: the header
 * of adminPostListQuery.
 *
 * ═══ PAGING ═══════════════════════════════════════════════════════════════════════════════════
 * Keyset (lib/cursor.js), one tuple per sort, stable under inserts; a cursor that is not exactly the
 * tuple this sort produces is a 400 (an admin tool has no stale public link to be forgiving of).
 * `total` is the count of the FILTERED set, not of the page, so the screen can say "7 / 31 poszt".
 */
router.get(
  '/admin/marketplace/posts',
  requireAuth,
  requireAdmin,
  readIpLimiter,
  readAdminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { q, kind, cursor: rawCursor } = parsed.data;
    const state = parsed.data.state ?? 'all';
    const sort = parsed.data.sort ?? 'newest';
    const limit = parsed.data.limit ?? 20;

    let cursor = null;
    if (rawCursor !== undefined) {
      const parts = decodeCursor(rawCursor);
      const ok =
        Array.isArray(parts) &&
        parts.length === SORT_WIDTH[sort] &&
        parts.every((n) => Number.isSafeInteger(n));
      if (!ok) return sendError(res, 400, ERR.VALIDATION);
      cursor = parts;
    }

    // "@handle" is how a moderator thinks of an author; the stored handle has no @.
    const needle = q !== undefined && q.startsWith('@') && q.length > 1 ? q.slice(1) : q;
    const like = needle === undefined ? null : `%${escapeLike(needle)}%`;
    const fts = needle === undefined ? null : toFtsQuery(needle);

    const result = await db.adminPostList({
      state, kind: kind ?? null, like, fts, sort, cursor, limit,
    });

    res.json({
      posts: result.posts,
      total: result.total,
      nextCursor: result.next ? encodeCursor(result.next) : null,
      query: { q: q ?? null, state, kind: kind ?? null, sort },
    });
  }),
);

/* ── the inspect page ───────────────────────────────────────────────────────────────────────── */

const detailQuery = z.object({ body: z.enum(['excerpt', 'full']) }).strict().partial();

const mediaUrl = (key) => `/api/v1/admin/marketplace/media/${key}`;

/**
 * One post, everything the page draws, in one request and one database snapshot.
 *
 * `?body=full` adds the rendered document tree (`post.body.doc`); without it only the excerpt
 * travels. A post that was never published has no body and no pictures (`bodyWithheld`,
 * `mediaWithheld`). Reports carry NO reporter identity. An unknown public id, and a malformed one,
 * are the same 404.
 */
router.get(
  '/admin/marketplace/posts/:publicId',
  requireAuth,
  requireAdmin,
  readIpLimiter,
  readAdminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;
    const p = publicIdParam.safeParse(req.params);
    if (!p.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    const q = detailQuery.safeParse(req.query);
    if (!q.success) return sendError(res, 400, ERR.VALIDATION);

    const view = await db.adminPostDetail({
      publicId: p.data.publicId,
      fullBody: q.data.body === 'full',
    });
    if (!view) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    view.post.media = view.post.media.map((m) => ({
      ...m,
      url: mediaUrl(m.key),
      thumbUrl: mediaUrl(m.thumbKey),
    }));
    res.json(view);
  }),
);

/* ── restore ────────────────────────────────────────────────────────────────────────────────── */

const restoreBody = z.object({ note: displayText(1, 500).nullable().optional() }).strict();

/**
 * Lift a moderator's take-down.
 *
 * 404 unknown post · 403 not an admin (database truth, not the token) · 409 `not_removed` when the
 * post is not currently removed (a second restore, or the loser of a race) · 200 on success.
 * Audit action `marketplace.moderation.restore`, one row, written in the same transaction.
 */
router.post(
  '/admin/marketplace/posts/:publicId/restore',
  requireAuth,
  requireAdmin,
  writeIpLimiter,
  writeAdminLimiter,
  asyncRoute(async (req, res) => {
    const p = publicIdParam.safeParse(req.params);
    if (!p.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    // Express 5 leaves req.body undefined when no body was sent; the note is optional.
    const body = restoreBody.safeParse(req.body ?? {});
    if (!body.success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.restoreRemovedPost({
      adminId: req.user.id,
      publicId: p.data.publicId,
      note: body.data.note ?? null,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (result.outcome === 'not_an_admin') return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
    if (result.outcome === 'not_removed') {
      return res.status(409).json({
        error: 'conflict',
        code: ERR.CONFLICT,
        reason: 'not_removed',
        requestId: res.locals.requestId,
      });
    }
    if (result.outcome !== 'applied') return sendError(res, 500, ERR.INTERNAL, 'internal error');
    res.json({ restored: true, replayed: result.replayed, post: result.post });
  }),
);

/* ── pictures ───────────────────────────────────────────────────────────────────────────────── */

/**
 * A post picture for the admin page.
 *
 * The public route (GET /public/media/:key) gates on PUBLIC_POST, so a withdrawn or removed post's
 * cover would be a 404 on the very page that exists to review it. THE KEY IS NOT THE PERMISSION
 * here either: the lookup carries its own rule - the picture must belong to a post that was EVER
 * PUBLISHED (a draft's pictures are private to its author) and must not be deleted. Everything else
 * is the same single 404. The response is `private` and short-cached: it is for one signed-in
 * admin, never a shared cache.
 */
router.get(
  '/admin/marketplace/media/:key',
  requireAuth,
  requireAdmin,
  mediaIpLimiter,
  mediaAdminLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return undefined;
    const key = z.string().regex(PUB_MEDIA_KEY_RE).safeParse(req.params.key);
    if (!key.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const row = await db.get(
      `SELECT m.storage_key AS storageKey
         FROM post_media m
         JOIN coach_posts p ON p.id = m.post_id
        WHERE (m.storage_key = ? OR m.thumb_key = ?)
          AND m.deleted_at IS NULL
          AND p.published_at IS NOT NULL`,
      [key.data, key.data],
    );
    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    const full = resolveStoredPath(key.data, 'public');
    if (!full) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) sendError(res, 404, ERR.NOT_FOUND, 'not found');
    });
    return undefined;
  }),
);

export default router;
