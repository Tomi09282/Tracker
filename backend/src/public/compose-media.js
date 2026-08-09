// src/public/compose-media.js — the post cover image.
//
// ═══ A SEPARATE ROUTER, MOUNTED ABOVE csrfProtection ═══════════════════════════════════════════
//
// `csrfProtection` requires a JSON content type on every state-changing request, which a multipart
// body cannot have. So this router sits above it and runs `multipartCsrf` instead: the same
// Sec-Fetch-Site check, the same X-CSRF requirement, and the content-type requirement changed from
// JSON to multipart rather than dropped. The rule is NARROWED for one route, not waived — the same
// arrangement exercise media, chat attachments and progress photos already use, and now literally
// the same function, since all four used to carry their own copy of it.
//
// Only the UPLOAD lives here. The DELETE has no body at all, so csrfProtection handles it
// correctly — its JSON requirement is skipped when there is nothing to parse — and it stays with
// the rest of the composer, below the middleware, with the full protection.
//
// ═══ AND ONE COVER PER POST, WITH NO REPLACE ═══════════════════════════════════════════════════
//
// The adversarial review put 40% of the entire defect corpus in the media surface, including its
// only FATAL finding. Replacing a cover is DELETE then POST: two operations that are each already
// atomic. There is no UPDATE of `post_media` anywhere in this product, and every UPDATE not
// written is an IDOR that cannot exist.

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { rm } from 'node:fs/promises';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireCoach, multipartCsrf } from '../auth/middleware.js';
import {
  QUARANTINE_DIR,
  MAX_IMAGE_BYTES,
  MediaError,
  ingestPublicImage,
  removePublicImage,
} from '../lib/media.js';
import { displayText } from './text.js';
import { PUBLIC_ID_RE } from './shapes.js';

const router = Router();

const limiter = (limit, keyGenerator) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...(keyGenerator ? { keyGenerator } : {}),
  });

const coverUploadIpLimiter = limiter(30);
const coverUploadAccountLimiter = limiter(20, (req) => `cover:${req.user?.id ?? req.ip}`);

const upload = multer({
  dest: QUARANTINE_DIR,
  // `parts` and `fields` are bounded too: a multipart body with ten thousand empty fields is a
  // parser cost that never reaches the file-size limit.
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 4, parts: 8 },
});

const publicIdParam = z.object({ publicId: z.string().regex(PUBLIC_ID_RE) }).strict();

const coverFields = z
  .object({
    idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    // Sanitised like every other short public field. An alt text of joiners is invisible to a
    // sighted reader and worse than nothing to a screen reader.
    alt: displayText(1, 200).optional(),
  })
  .strict();

const COVER_OUTCOMES = {
  missing: 404,
  cover_exists: 409,
  key_reused: 409,
  media_quota: 409,
};

const sendCoverOutcome = (res, result) => {
  const status = COVER_OUTCOMES[result.outcome];
  if (!status) return sendError(res, 500, ERR.INTERNAL, 'internal error');
  if (status === 404) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
  const { outcome, ...facts } = result;
  return res.status(409).json({
    error: 'conflict',
    code: ERR.CONFLICT,
    reason: outcome,
    ...facts,
    requestId: res.locals.requestId,
  });
};

/**
 * Upload the cover for one post.
 *
 * ═══ THE FILE IS WRITTEN BEFORE THE TRANSACTION, AND THAT IS DELIBERATE ════════════════════════
 *
 * Re-encoding an 8 MiB photo takes a sharp pass, and doing it inside a write lock would hold the
 * database for its duration while every other writer waits. So the ingest runs first and the
 * transaction is short.
 *
 * The consequence is stated rather than hidden: if the transaction refuses — the post is not
 * yours, a cover already exists, the daily cap is spent — the files this route just wrote are
 * removed on the way out. A file with no row is invisible and would be swept anyway; a row with no
 * file renders as a broken image on a published page, which is why the order is this way round.
 */
router.post(
  '/compose/posts/:publicId/cover',
  requireAuth,
  requireCoach,
  coverUploadIpLimiter,
  coverUploadAccountLimiter,
  multipartCsrf,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const id = publicIdParam.safeParse(req.params);
    if (!id.success) {
      if (req.file) await rm(req.file.path, { force: true }).catch(() => {});
      return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    }
    if (!req.file) return sendError(res, 400, ERR.VALIDATION, 'no file');

    const fields = coverFields.safeParse(req.body);
    if (!fields.success) {
      await rm(req.file.path, { force: true }).catch(() => {});
      return sendError(res, 400, ERR.VALIDATION);
    }

    let image;
    try {
      // Sniffs the magic bytes, refuses SVG, stats before decode, re-encodes both variants and
      // removes the quarantined original on every path. The client's filename never touches disk.
      image = await ingestPublicImage(req.file.path);
    } catch (err) {
      if (err instanceof MediaError) {
        return res.status(400).json({
          error: 'invalid image',
          code: ERR.VALIDATION,
          reason: err.reason,
          requestId: res.locals.requestId,
        });
      }
      throw err;
    }

    const result = await db.attachPostCover({
      userId: req.user.id,
      publicId: id.data.publicId,
      ...image,
      // An alt that sanitises to nothing is stored as NULL: the column CHECKs a trimmed length of
      // at least one, so an empty string would be an opaque 400 about a field left blank.
      alt: fields.data.alt && fields.data.alt.length > 0 ? fields.data.alt : null,
      idempotencyKey: fields.data.idempotency_key,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') {
      await removePublicImage(image.storageKey, image.thumbKey);
      return sendCoverOutcome(res, result);
    }
    // A REPLAY attached nothing, so the freshly written pair is orphaned and goes too — the row
    // already points at the first upload's files.
    if (result.replayed) await removePublicImage(image.storageKey, image.thumbKey);

    res.status(result.replayed ? 200 : 201).json({ cover: result, replayed: result.replayed });
  }),
);

export default router;
