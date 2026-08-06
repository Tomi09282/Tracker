// src/progress/routes.js — body measurements, progress photos and the sharing that gates them.
//
// ═══ THE DEFAULT IS NOBODY ═════════════════════════════════════════════════════════════════════
//
// Every other feature in this product answers "may this coach see this?" with "yes, while the link
// is active" — that is what coaching is. This file answers it with **"only if the client said so,
// and only the part they said."** Health data is a GDPR special category, and a body-fat number
// and a photograph are not the same decision as a set of squats.
//
// Three properties, and each is a predicate rather than a check the routes remember to run:
//
//   1. **Deny by default.** No `progress_shares` row is a NO. `SHARED_WITH_ME` requires the row to
//      exist, to have the relevant flag set, and to have `revoked_at IS NULL` — an absent row
//      fails all three.
//   2. **Revocation is immediate.** The grant is read inside the query that returns the data, so
//      the coach's very next request with the same unexpired token matches zero rows. No cache to
//      bust, no claim in a token to go stale.
//   3. **Every photo READ is logged**, inside the request that serves the bytes. A log written by
//      a job is a log that is wrong whenever the job is behind, and "who has seen my photos" is a
//      question a client is entitled to a true answer to.
//
// THE KEY IS NOT THE PERMISSION. A storage key is 24 random bytes — unguessable but not private,
// because it appears in URLs, histories and proxy logs. The read carries the full predicate, and
// a key belonging to somebody else is as invisible as one that never existed. That sentence is
// copied from chat/attachments.js on purpose: same rule, and it must not acquire a second version.
import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { rm, stat, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { MEDIA_DIR, QUARANTINE_DIR } from '../lib/media.js';

const router = Router();

/**
 * TWO ROUTERS, AND THE SPLIT IS FORCED BY THE CSRF MIDDLEWARE RATHER THAN CHOSEN.
 *
 * `csrfProtection` requires a JSON content type on every state-changing request, which a multipart
 * body cannot have. So the photo UPLOAD is exported separately and mounted above it, exactly as
 * `mediaRoutes` and `attachmentRoutes` already are — and, exactly as they do, it runs its own
 * Sec-Fetch-Site + X-CSRF check so the rule is NARROWED for one route rather than waived.
 *
 * Everything else — measurements, shares, the access log, listing, deletion, serving — stays below
 * the global middleware and gets the full protection. The first version of this file mounted the
 * whole thing below and every upload answered 415, which is the honest failure: the middleware did
 * exactly what it promised and I had not read where it sat.
 */
export const uploadRouter = Router();

/** 25 MiB, matching the column's own CHECK. A phone photo is a tenth of that. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 4, parts: 8 },
});

/* ── the predicates ─────────────────────────────────────────────────────────────────────────── */

/**
 * Data a COACH may see, for one flag.
 *
 * `flag` is the column name and `subject` is how the subject's id is reached — both are literals
 * from this file, never anything a request supplies. **`subject` is a parameter rather than
 * something a call site patches in afterwards**: the media route needs `p.client_user_id` (the
 * owner of the row being joined) where the list routes bind a `?`, and the first draft here did
 * that with `.replaceAll('ps.client_user_id = ?', …)` — string surgery on the privacy predicate,
 * one edit away from silently matching nothing and one from silently matching everything. That is
 * the exact mistake this file's sibling in nutrition already had to have taken out of it.
 *
 * When `subject` is a bound placeholder the caller supplies its parameter; when it is a column
 * reference it supplies none. The doc on each call site says which.
 *
 * The four conditions ARE the privacy model, which is why they are written once:
 *
 *   - the share row EXISTS (absent = denied, and absent is the default)
 *   - the specific flag is set (photos and measurements are separate decisions)
 *   - it has not been revoked
 *   - **and the link is still active** — leaving a coach withdraws access even if the client never
 *     got round to revoking, which is the case a "revoked_at only" design silently gets wrong.
 */
const sharedWithMe = (flag, subject = '?') => `EXISTS (
  SELECT 1 FROM progress_shares ps
    JOIN coach_clients cc ON cc.id = ps.coach_client_id
   WHERE ps.client_user_id = ${subject}
     AND ps.${flag} = 1
     AND ps.revoked_at IS NULL
     AND cc.coach_id = ? AND cc.status = 'active')`;

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) }).strict();

const measurementBody = z
  .object({
    // The vocabulary is a table, not an enum here — a metric added by an INSERT must not need a
    // deploy. The FK is what rejects an unknown key, and the regex only bounds the shape.
    metric_key: z.string().regex(/^[a-z][a-z_]{0,30}$/),
    measured_on: isoDate,
    // Human units in, integer scale stored. The x1000 conversion happens ONCE, here.
    value: z.coerce.number().finite().min(0.001).max(1000),
    note: z.string().max(300).nullish(),
  })
  .strict();

const shareBody = z
  .object({
    share_measurements: z.boolean().optional(),
    share_photos: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to change' });

const trendQuery = z
  .object({
    metric_key: z.string().regex(/^[a-z][a-z_]{0,30}$/).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    client_id: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  })
  .strict();

/* ═══ METRICS ═════════════════════════════════════════════════════════════════════════════════ */

/** The vocabulary, so the client can render inputs it did not have to hardcode. */
router.get(
  '/measurement-metrics',
  requireAuth,
  asyncRoute(async (_req, res) => {
    const metrics = await db.all(
      `SELECT key, unit, min_x1000 / 1000.0 AS min, max_x1000 / 1000.0 AS max, sort_order
         FROM measurement_metrics WHERE active = 1 ORDER BY sort_order, key`,
    );
    res.json({ metrics });
  }),
);

/* ═══ MEASUREMENTS ════════════════════════════════════════════════════════════════════════════ */

/**
 * Record a measurement.
 *
 * An UPSERT on the natural key, so weighing yourself twice on one morning replaces rather than
 * making the chart show two points for one day. `client_user_id` is `req.user.id` and is not in
 * the body schema at all — there is no id to forge, because none is accepted.
 */
router.post(
  '/measurements',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const parsed = measurementBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    const r = await db.run(
      `INSERT INTO body_measurements (client_user_id, metric_key, measured_on, value_x1000, note)
            VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (client_user_id, metric_key, measured_on) DO UPDATE SET
            value_x1000 = excluded.value_x1000,
            note = excluded.note,
            updated_at = unixepoch()`,
      [req.user.id, b.metric_key, b.measured_on, Math.round(b.value * 1000), b.note ?? null],
    );
    res.status(201).json({ id: r.lastInsertRowid });
  }),
);

router.delete(
  '/measurements/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(`DELETE FROM body_measurements WHERE id = ? AND client_user_id = ?`, [
      p.data.id,
      req.user.id,
    ]);
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/**
 * The trend series.
 *
 * Two callers, ONE query, and the difference is a single parameter set: without `client_id` the
 * subject is the caller and the guard is `client_user_id = ?`; with it the subject is someone else
 * and the guard additionally requires the share. Writing these as two routes is how the client
 * path and the coach path drift, and the coach path is the one where drift is a breach.
 *
 * The x axis is a DATE, which is 4aa's lesson: a chart positioned by index renders five weigh-ins
 * in a week identically to five across a year, and destroys the only question a progress chart
 * answers. The rows carry `measured_on` and the geometry is the client's `chartGeometry.ts`.
 */
router.get(
  '/measurements',
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = trendQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { metric_key: metric, from, to, client_id: clientId } = parsed.data;

    const subject = clientId ?? req.user.id;
    const isSelf = subject === req.user.id;

    const rows = await db.all(
      `SELECT m.id, m.metric_key, m.measured_on, m.value_x1000 / 1000.0 AS value, m.note,
              mm.unit
         FROM body_measurements m
         JOIN measurement_metrics mm ON mm.key = m.metric_key
        WHERE m.client_user_id = ?
          ${isSelf ? '' : `AND ${sharedWithMe('share_measurements')}`}
          AND (? IS NULL OR m.metric_key = ?)
          AND (? IS NULL OR m.measured_on >= ?)
          AND (? IS NULL OR m.measured_on <= ?)
        ORDER BY m.metric_key, m.measured_on`,
      isSelf
        ? [subject, metric ?? null, metric ?? null, from ?? null, from ?? null, to ?? null, to ?? null]
        : [subject, subject, req.user.id, metric ?? null, metric ?? null, from ?? null, from ?? null, to ?? null, to ?? null],
    );

    // A coach reading somebody else's body data is logged, exactly as a photo read is. The list is
    // one entry rather than one per row: what happened was one look at one person's measurements.
    if (!isSelf) {
      await logAccess(req, subject, 'measurements', null);
    }

    res.json({ client_id: subject, measurements: rows });
  }),
);

/* ═══ SHARING ═════════════════════════════════════════════════════════════════════════════════ */

/** What I am sharing, and with whom. The client's own view of their consents. */
router.get(
  '/progress-shares',
  requireAuth,
  asyncRoute(async (req, res) => {
    const shares = await db.all(
      `SELECT ps.id, ps.coach_client_id, ps.share_measurements, ps.share_photos,
              ps.granted_at, ps.revoked_at, u.email AS coach_email, cc.status AS link_status
         FROM progress_shares ps
         JOIN coach_clients cc ON cc.id = ps.coach_client_id
         JOIN users u ON u.id = cc.coach_id
        WHERE ps.client_user_id = ?
        ORDER BY ps.id DESC`,
      [req.user.id],
    );
    res.json({ shares });
  }),
);

/**
 * Grant or change a share.
 *
 * ONLY THE CLIENT MAY CALL THIS, and the INSERT proves it rather than a preceding role check: the
 * SELECT reads `cc.client_id` and binds it as the row's client, then requires it to equal the
 * caller. A coach POSTing to their own client's link inserts zero rows and gets a 404.
 */
router.post(
  '/progress-shares/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    const parsed = shareBody.safeParse(req.body);
    if (!p.success || !parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const b = parsed.data;

    const r = await db.run(
      `INSERT INTO progress_shares (coach_client_id, client_user_id, share_measurements, share_photos)
       SELECT cc.id, cc.client_id, ?, ?
         FROM coach_clients cc
        WHERE cc.id = ? AND cc.client_id = ? AND cc.status = 'active'
       ON CONFLICT (coach_client_id) DO UPDATE SET
            share_measurements = CASE WHEN ? THEN ? ELSE share_measurements END,
            share_photos       = CASE WHEN ? THEN ? ELSE share_photos END,
            -- Granting again after a revocation re-opens it, with a fresh grant timestamp. The
            -- alternative is a client who revokes once and can never share with that coach again.
            revoked_at = NULL,
            granted_at = unixepoch(),
            updated_at = unixepoch()`,
      [
        b.share_measurements ? 1 : 0,
        b.share_photos ? 1 : 0,
        p.data.id,
        req.user.id,
        'share_measurements' in b ? 1 : 0,
        b.share_measurements ? 1 : 0,
        'share_photos' in b ? 1 : 0,
        b.share_photos ? 1 : 0,
      ],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/**
 * Revoke.
 *
 * Sets `revoked_at` and clears BOTH flags. Clearing the flags as well is belt and braces on
 * purpose: `revoked_at` is the audit trail and the flags are what the predicate reads, and a
 * revocation that left `share_photos = 1` behind would be one predicate edit away from silently
 * un-revoking.
 */
router.delete(
  '/progress-shares/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);
    const r = await db.run(
      `UPDATE progress_shares
          SET revoked_at = unixepoch(), share_measurements = 0, share_photos = 0
        WHERE coach_client_id = ? AND client_user_id = ? AND revoked_at IS NULL`,
      [p.data.id, req.user.id],
    );
    if (r.changes === 0) return sendError(res, 404, ERR.NOT_FOUND);
    res.status(204).end();
  }),
);

/* ═══ THE ACCESS LOG ══════════════════════════════════════════════════════════════════════════ */

/**
 * Record that someone looked at someone else's health data.
 *
 * The viewer's email is SNAPSHOT into the row rather than joined at read time, because the whole
 * value of this table is that it survives the viewer deleting their account. 011 made that
 * decision for workout history and 014 for chat; this is the case where it matters most.
 */
async function logAccess(req, subjectUserId, kind, targetId) {
  await db.run(
    `INSERT INTO progress_access_log (subject_user_id, viewer_user_id, viewer_email_snapshot,
                                      coach_client_id, kind, target_id)
     SELECT ?, u.id, u.email,
            (SELECT cc.id FROM coach_clients cc
              WHERE cc.coach_id = u.id AND cc.client_id = ? AND cc.status = 'active'
              LIMIT 1),
            ?, ?
       FROM users u WHERE u.id = ?`,
    [subjectUserId, subjectUserId, kind, targetId, req.user.id],
  );
}

/** Who has looked at my health data. The client's own read, and only ever their own. */
router.get(
  '/progress-access-log',
  requireAuth,
  asyncRoute(async (req, res) => {
    const entries = await db.all(
      `SELECT id, viewer_email_snapshot AS viewer, kind, target_id, at
         FROM progress_access_log
        WHERE subject_user_id = ?
        ORDER BY at DESC, id DESC
        LIMIT 200`,
      [req.user.id],
    );
    res.json({ entries });
  }),
);

/* ═══ PHOTOS ══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Magic bytes, not the filename and not the declared Content-Type — a client controls both of
 * those completely. Images only here: a progress photo is a photo, and admitting video would put
 * a 128 MiB path behind a 25 MiB limit's assumptions.
 */
const SIGNATURES = [
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

function multipartCsrf(req, res, next) {
  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  if (req.get('X-CSRF') !== '1') return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  const ct = (req.get('Content-Type') ?? '').split(';')[0].trim();
  if (ct !== 'multipart/form-data') return sendError(res, 415, ERR.UNSUPPORTED_MEDIA_TYPE, 'unsupported media type');
  next();
}

const PhotoBody = z
  .object({
    taken_on: isoDate,
    pose: z.string().trim().min(1).max(40).optional(),
    note: z.string().max(300).optional(),
  })
  .strict();

/**
 * Upload a progress photo.
 *
 * No membership gate is needed BEFORE multer here, unlike chat attachments — and the reason is
 * worth stating rather than leaving as an omission. There, the id in the URL named a conversation
 * a stranger could guess, so the gate had to run before a byte was written. Here the photo is
 * always the caller's own: there is no id in the URL at all, so `requireAuth` plus the upload
 * limiter IS the gate. An authenticated user filling their own quota is a rate-limit problem, not
 * an authorisation one.
 */
uploadRouter.post(
  '/progress-photos',
  requireAuth,
  uploadLimiter,
  multipartCsrf,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return sendError(res, 400, ERR.VALIDATION, 'no file');

    // The quarantined file is removed on EVERY exit, including the failures. A rejected upload
    // that leaves its bytes behind is a slower version of the attack the limiter stops.
    const cleanup = () => rm(req.file.path, { force: true }).catch(() => {});

    try {
      const body = PhotoBody.parse(req.body);
      const mime = await sniff(req.file.path);
      if (!mime) {
        await cleanup();
        return sendError(res, 400, ERR.VALIDATION, 'unsupported file type');
      }

      const { size } = await stat(req.file.path);
      if (size > MAX_PHOTO_BYTES) {
        await cleanup();
        return sendError(res, 400, ERR.VALIDATION, 'file too large');
      }

      // A random key, never the uploaded name. The filename is attacker-controlled text that would
      // otherwise reach the filesystem.
      const storageKey = randomBytes(24).toString('hex');
      await rename(req.file.path, path.join(MEDIA_DIR, storageKey));

      const r = await db.run(
        `INSERT INTO progress_photos (client_user_id, taken_on, pose, storage_key, mime, bytes, note)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, body.taken_on, body.pose ?? null, storageKey, mime, size, body.note ?? null],
      );

      res.status(201).json({ id: r.lastInsertRowid, storage_key: storageKey, mime, bytes: size });
    } catch (err) {
      await cleanup();
      throw err;
    }
  }),
);

/**
 * List photos — the caller's own, or a client's if they shared.
 *
 * Listing is NOT logged; serving is. The distinction is deliberate: a coach opening the tab
 * produces one list request whether or not they look at anything, and logging that would fill the
 * client's "who saw my photos" view with noise that hides the real events.
 */
router.get(
  '/progress-photos',
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = trendQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { from, to, client_id: clientId } = parsed.data;

    const subject = clientId ?? req.user.id;
    const isSelf = subject === req.user.id;

    const photos = await db.all(
      `SELECT id, taken_on, pose, storage_key, mime, bytes, note, created_at
         FROM progress_photos
        WHERE client_user_id = ?
          ${isSelf ? '' : `AND ${sharedWithMe('share_photos')}`}
          AND (? IS NULL OR taken_on >= ?)
          AND (? IS NULL OR taken_on <= ?)
        ORDER BY taken_on DESC, id DESC
        LIMIT 200`,
      isSelf
        ? [subject, from ?? null, from ?? null, to ?? null, to ?? null]
        : [subject, subject, req.user.id, from ?? null, from ?? null, to ?? null, to ?? null],
    );
    res.json({ client_id: subject, photos });
  }),
);

router.delete(
  '/progress-photos/:id',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(res, 400, ERR.VALIDATION);

    // Read the key back from the DELETE so the file removal cannot act on a row the predicate did
    // not match. A preceding SELECT would be a race; RETURNING is the same statement.
    const rows = await db.all(
      `DELETE FROM progress_photos WHERE id = ? AND client_user_id = ? RETURNING storage_key`,
      [p.data.id, req.user.id],
    );
    if (rows.length === 0) return sendError(res, 404, ERR.NOT_FOUND);

    await rm(path.join(MEDIA_DIR, rows[0].storage_key), { force: true }).catch(() => {});
    res.status(204).end();
  }),
);

/**
 * Serve a photo.
 *
 * THE KEY IS NOT THE PERMISSION. The predicate is the whole point of this route: the row is
 * readable if it is the caller's own, OR if its owner shared photos with the caller through a live
 * link. A stranger holding the exact 48-hex key gets 404.
 *
 * AND THE READ IS LOGGED BEFORE THE BYTES GO OUT. Not after — a stream that fails halfway was
 * still a look at the picture, and a log that only records successful transfers is a log that can
 * be defeated by disconnecting.
 */
router.get(
  '/progress-media/:key',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const key = z.string().regex(/^[a-f0-9]{48}$/).safeParse(req.params.key);
    // A malformed key is refused before it reaches the database, and it never reaches the
    // filesystem at all — which makes path traversal unreachable rather than merely guarded.
    if (!key.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const row = await db.get(
      `SELECT p.id, p.client_user_id, p.mime, p.bytes, p.storage_key
         FROM progress_photos p
        WHERE p.storage_key = ?
          AND (p.client_user_id = ?
               -- The subject is the ROW's owner rather than a bound id, so this arm consumes only
               -- the caller's own id, for the coach_id condition inside the share predicate.
               OR ${sharedWithMe('share_photos', 'p.client_user_id')})`,
      [key.data, req.user.id, req.user.id],
    );
    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    if (row.client_user_id !== req.user.id) {
      await logAccess(req, row.client_user_id, 'photo', row.id);
    }

    res.setHeader('Content-Type', row.mime);
    res.setHeader('Content-Length', String(row.bytes));
    // Health data must not sit in a shared cache, and must not be sniffed into something else.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(path.join(MEDIA_DIR, row.storage_key)).pipe(res);
  }),
);

export default router;
