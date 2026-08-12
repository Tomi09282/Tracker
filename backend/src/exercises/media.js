// src/exercises/media.js — upload, serve and delete exercise media.
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, multipartCsrf } from '../auth/middleware.js';
import { VISIBLE, visibleParams } from './visibility.js';
import {
  QUARANTINE_DIR,
  MAX_IMAGE_BYTES,
  MediaError,
  ingestImage,
  resolveStoredPath,
} from '../lib/media.js';

const router = Router();

// Uploads get their own, much tighter budget: they cost disk, CPU and bandwidth, so the read
// tier's allowance would be far too generous.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const mediaReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Multipart lands on disk in QUARANTINE, never in memory and never in the served tree.
 *
 * Disk rather than memory because an in-memory buffer means a concurrent upload burst is an
 * out-of-memory crash; quarantine rather than the media directory because a file that has not
 * been sniffed and re-encoded yet must not be reachable by any URL.
 */
const upload = multer({
  dest: QUARANTINE_DIR,
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 4,
    // A multipart body with thousands of tiny parts is a cheap denial of service.
    parts: 8,
  },
});

/**
 * CSRF for multipart.
 *
 * The global middleware enforces `Content-Type: application/json`, which a file upload cannot
 * satisfy. The other two layers still apply — the custom header a browser cannot forge
 * cross-origin, and the Fetch-Metadata check — so this narrows the content-type rule for this
 * one route rather than dropping CSRF protection for it.
 */
router.post(
  '/exercises/:id/media',
  requireAuth,
  uploadLimiter,
  multipartCsrf,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    if (!req.file) return sendError(res, 400, ERR.VALIDATION, 'no file');

    // Ownership BEFORE ingest: re-encoding a 8 MB image for a row the caller does not own is
    // free CPU for an attacker.
    const owned = await db.get(
      'SELECT id FROM exercises WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
      [id, req.user.id],
    );
    if (!owned) {
      return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    }

    const count = await db.get(
      'SELECT COUNT(*) AS n FROM exercise_media WHERE exercise_id = ? AND deleted_at IS NULL',
      [id],
    );
    if (count.n >= 6) return sendError(res, 409, ERR.CONFLICT, 'media limit reached');

    let stored;
    try {
      stored = await ingestImage(req.file.path);
    } catch (err) {
      if (err instanceof MediaError) {
        req.log.warn({ reason: err.reason, exerciseId: id }, 'upload rejected');
        return sendError(res, 400, ERR.VALIDATION, err.reason);
      }
      throw err;
    }

    const created = await db.run(
      `INSERT INTO exercise_media (exercise_id, kind, storage_key, mime, width, height, bytes, position)
       VALUES (?, 'image', ?, ?, ?, ?, ?, ?)`,
      [id, stored.storageKey, stored.mime, stored.width, stored.height, stored.bytes, count.n],
    );

    res.status(201).json({
      id: created.lastInsertRowid,
      storage_key: stored.storageKey,
      mime: stored.mime,
      width: stored.width,
      height: stored.height,
    });
  }),
);

router.delete(
  '/media/:id',
  requireAuth,
  uploadLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    // Ownership is joined in, so a media id belonging to someone else simply does not match.
    // The file itself is left on disk: a soft delete that hard-deletes the bytes cannot be
    // undone, and orphan sweeping is a scheduled job's problem, not a request handler's.
    const result = await db.run(
      `UPDATE exercise_media SET deleted_at = unixepoch()
        WHERE id = ? AND deleted_at IS NULL
          AND exercise_id IN (SELECT id FROM exercises WHERE owner_id = ?)`,
      [id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

router.get(
  '/media/:key',
  requireAuth,
  mediaReadLimiter,
  asyncRoute(async (req, res) => {
    const key = String(req.params.key);

    // The DB decides, not the filesystem. A key that exists on disk but whose owning exercise
    // is private to somebody else must be as invisible as one that was never uploaded.
    let row = await db.get(
      // The SHARED predicate, not a copy of it. This query used to inline its own version, and it
      // is exactly the sort of duplicate that gets left behind: the prescription arm was added to
      // the library's copy and a client would still have been unable to load the picture of the
      // exercise their plan told them to do.
      `SELECT m.storage_key, m.mime
         FROM exercise_media m
         JOIN exercises e ON e.id = m.exercise_id
        WHERE m.storage_key = ? AND m.deleted_at IS NULL
          AND ${VISIBLE}`,
      [key, ...visibleParams(req.user.id)],
    );

    /*
     * ═══ THE MODERATOR'S ARM, AND WHY IT IS NOT PART OF `VISIBLE` ══════════════════════════════
     *
     * Measured before it was written: an admin opening the moderation queue got 404 on every image
     * in it. `VISIBLE` has four arms — global, ownerless, owned by the caller, prescribed to the
     * caller — and a coach's `pending_review` submission matches none of them. So the queue asked
     * somebody to approve a movement into the shared library while serving them a broken image.
     *
     * The obvious fix is a fifth arm on `VISIBLE` for admins. That would be wrong: `VISIBLE` also
     * governs the library and every private exercise in it, and an admin arm there is a button that
     * reads any coach's private library. `privacy/routes.js` makes the same argument about exports.
     *
     * This arm is scoped to what moderation actually requires: a submission the author VOLUNTEERED
     * for review, and only while it is still in the queue. A decision moves it to `global` (which
     * arm one already covers) or `rejected` (which nothing covers), so the moderator's read expires
     * the moment they no longer need it.
     *
     * It runs only after the normal predicate has missed, so nothing changes for anybody else, and
     * the role comes from the DATABASE — a JWT still carrying `admin` after a demotion opens
     * nothing.
     */
    if (!row && req.user.role === 'admin') {
      const live = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
      if (live?.role === 'admin') {
        row = await db.get(
          `SELECT m.storage_key, m.mime
             FROM exercise_media m
             JOIN exercises e ON e.id = m.exercise_id
            WHERE m.storage_key = ? AND m.deleted_at IS NULL
              AND e.status = 'pending_review' AND e.deleted_at IS NULL`,
          [key],
        );
        if (row) req.log.info({ storageKey: key }, 'moderation media read');
      }
    }

    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const full = resolveStoredPath(row.storage_key);
    if (!full) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // nosniff so a browser cannot be talked into treating the bytes as something executable;
    // an explicit inline disposition so it is never offered as a download with a guessed name.
    res.setHeader('Content-Type', row.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${row.storage_key}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) sendError(res, 404, ERR.NOT_FOUND, 'not found');
    });
  }),
);

export default router;
