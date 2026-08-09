// src/chat/attachments.js — the video form-check (T3.2.5).
//
// A client uploads a set video; the coach replies with timestamped notes. The BYTES reuse the
// Phase 1 media pipeline — quarantine directory, magic-byte sniff, random storage key, gated
// serving — because a second upload path is a second place for every one of those to be got wrong.
//
// ONE THING IS DELIBERATELY DIFFERENT FROM THE EXERCISE UPLOAD: membership is proved BEFORE multer
// is allowed to touch the request.
//
// The exercise route checks ownership in its handler, which runs after `upload.single()` has
// already written the file. For an 8 MB image that is a tolerable cost. For a 128 MB video it is a
// stranger filling the disk of a server they have no account on the other side of — they need only
// a session and a conversation id, and the id is guessable. So the predicate runs as its own
// middleware, where `req.params.id` and `req.user.id` both already exist and nothing has been
// written yet.
import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, multipartCsrf } from '../auth/middleware.js';
import { MEDIA_DIR, QUARANTINE_DIR, resolveStoredPath } from '../lib/media.js';

const router = Router();

/** 128 MiB, matching the column's own CHECK. A minute of phone video sits well inside it. */
export const MAX_ATTACHMENT_BYTES = 128 * 1024 * 1024;

/**
 * Uploads are limited far harder than reads. Ten a quarter-hour is more form-checks than anyone
 * films, and it is the difference between a nuisance and a disk-filling attack.
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const upload = multer({
  dest: QUARANTINE_DIR,
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 4, parts: 8 },
});

/**
 * THE GATE THAT RUNS BEFORE ANY BYTE IS WRITTEN.
 *
 * Same predicate as everywhere else in chat — membership AND a live link — so an ended
 * relationship cannot be used as a place to park files.
 */
const requireMembership = asyncRoute(async (req, res, next) => {
  const conversationId = z.coerce.number().int().positive().parse(req.params.id);
  const conv = await db.get(
    `SELECT c.id, c.blocked_at FROM conversations c
       JOIN coach_clients cc ON cc.id = c.coach_client_id AND cc.status = 'active'
      WHERE c.id = ? AND (c.coach_id = ? OR c.client_id = ?)`,
    [conversationId, req.user.id, req.user.id],
  );
  if (!conv) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
  if (conv.blocked_at != null) return sendError(res, 409, ERR.CONFLICT, 'this conversation is closed');
  req.conversationId = conversationId;
  next();
});

/**
 * Magic bytes, not the filename and not the declared Content-Type.
 *
 * A client controls both of those completely. What it cannot control is what the first bytes of
 * the file actually are — so that is what decides, and anything unrecognised is refused rather
 * than stored "just in case".
 */
const SIGNATURES = [
  { mime: 'video/mp4', at: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ....ftyp
  { mime: 'image/jpeg', at: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', at: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', at: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // RIFF....WEBP
];

async function sniff(filePath) {
  const head = Buffer.alloc(16);
  const stream = createReadStream(filePath, { start: 0, end: 15 });
  let filled = 0;
  for await (const chunk of stream) {
    chunk.copy(head, filled);
    filled += chunk.length;
  }
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => head[sig.at + i] === b)) return sig.mime;
  }
  return null;
}

const AttachBody = z
  .object({
    body: z.string().trim().min(1).max(4000),
    duration_seconds: z.coerce.number().int().min(1).max(3600).optional(),
  })
  .strict();

router.post(
  '/conversations/:id/attachments',
  requireAuth,
  uploadLimiter,
  multipartCsrf,
  // ── nothing above this line has written a byte, and nothing below runs without membership ──
  requireMembership,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return sendError(res, 400, ERR.VALIDATION, 'no file');

    // The quarantined file is removed on EVERY exit from here, including the failures. A rejected
    // upload that leaves its bytes behind is a slower version of the attack the gate above stops.
    const cleanup = () => rm(req.file.path, { force: true }).catch(() => {});

    try {
      const body = AttachBody.parse(req.body);
      const mime = await sniff(req.file.path);
      if (!mime) {
        await cleanup();
        return sendError(res, 400, ERR.VALIDATION, 'unsupported file type');
      }

      const { size } = await stat(req.file.path);
      if (size > MAX_ATTACHMENT_BYTES) {
        await cleanup();
        return sendError(res, 400, ERR.VALIDATION, 'file too large');
      }

      // A random key, never the uploaded name. The filename is attacker-controlled text that would
      // otherwise reach the filesystem, and a predictable key makes the gated read pointless.
      const storageKey = `${randomBytes(24).toString('hex')}${mime === 'video/mp4' ? '.mp4' : ''}`;
      const { rename } = await import('node:fs/promises');
      await rename(req.file.path, path.join(MEDIA_DIR, storageKey));

      // ONE worker call: the message and the recipient's notification are already atomic in
      // `sendMessageTx`, and the attachment rides with them.
      const result = await db.sendMessage({
        conversationId: req.conversationId,
        senderId: req.user.id,
        body: body.body,
        attachment: { storageKey, mime, bytes: size, durationSeconds: body.duration_seconds ?? null },
      });

      if (result.outcome !== 'sent') {
        // The relationship ended between the gate and the write. Take the bytes back out.
        await rm(path.join(MEDIA_DIR, storageKey), { force: true }).catch(() => {});
        return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      }

      res.status(201).json({ id: result.messageId, storage_key: storageKey, mime, bytes: size });
    } catch (err) {
      await cleanup();
      throw err;
    }
  }),
);

/**
 * Serve an attachment.
 *
 * THE KEY IS NOT THE PERMISSION. A storage key is 24 random bytes, which makes it unguessable but
 * not private: it appears in a URL, in a history, in a proxy log. So the read carries the full
 * conversation predicate — the same one the upload carried — and a key belonging to a thread the
 * caller is not in is as invisible as one that never existed.
 */
router.get(
  '/chat-media/:key',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const key = z.string().regex(/^[a-f0-9]{48}(\.mp4)?$/).safeParse(req.params.key);
    // A malformed key is refused before it reaches the database, and it never reaches the
    // filesystem at all — which is what makes path traversal unreachable rather than merely
    // guarded against.
    if (!key.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const row = await db.get(
      `SELECT a.storage_key, a.mime
         FROM message_attachments a
         JOIN messages m ON m.id = a.message_id
         JOIN conversations c ON c.id = m.conversation_id
         JOIN coach_clients cc ON cc.id = c.coach_client_id AND cc.status = 'active'
        WHERE a.storage_key = ? AND (c.coach_id = ? OR c.client_id = ?) AND m.deleted_at IS NULL`,
      [key.data, req.user.id, req.user.id],
    );
    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    res.setHeader('Content-Type', row.mime);
    // No inline rendering of anything the browser might interpret. `attachment` for everything but
    // the types we re-serve deliberately, and `nosniff` so a mislabelled body cannot be promoted
    // to HTML by the browser's own guessing.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    createReadStream(resolveStoredPath(row.storage_key)).pipe(res);
  }),
);

export default router;
