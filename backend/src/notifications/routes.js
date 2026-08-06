// src/notifications/routes.js — F5 notifications, v1 (in-app only, decision D-8A).
//
// THE INBOX AND THE BADGE MUST NEVER DISAGREE. They are the same predicate, written once as
// `VISIBLE` below and used by both. A badge that says 3 over an inbox showing 2 is the defect
// people actually notice, and it happens whenever the two queries are spelled separately — which
// is this codebase's one recurring bug class, applied to a number in the corner of the screen.
//
// The predicate carries the LINK's liveness, not just the recipient's id. A notification about a
// relationship that has been archived must stop being delivered on the very next request, with no
// sweeper and nothing remembering to act. An earlier design's read key was `user_id = ?` alone,
// and a review found that archiving a client left the coach's notifications about them readable
// forever.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * THE predicate. `?` is the caller's id.
 *
 * A notification with no `coach_client_id` is not about a relationship — a system message, a
 * future coin event — and is always the recipient's own. One with a link is delivered only while
 * that link is alive.
 */
const VISIBLE = `
  n.user_id = ?
  AND (n.coach_client_id IS NULL
       OR EXISTS (SELECT 1 FROM coach_clients cc
                   WHERE cc.id = n.coach_client_id AND cc.status = 'active'))`;

const ListQuery = z
  .object({
    // A keyset cursor on the same column the index orders by. Not an OFFSET: new notifications
    // arrive between pages by definition, and an offset would repeat or skip them.
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict();

router.get(
  '/notifications',
  requireAuth,
  asyncRoute(async (req, res) => {
    const qs = ListQuery.parse(req.query);
    const notifications = await db.all(
      `SELECT n.id, n.type, n.title, n.body, n.link_path, n.read_at, n.created_at
         FROM notifications n
        WHERE ${VISIBLE} ${qs.before ? 'AND n.id < ?' : ''}
        ORDER BY n.id DESC
        LIMIT ?`,
      qs.before ? [req.user.id, qs.before, qs.limit] : [req.user.id, qs.limit],
    );
    res.json({
      notifications,
      nextBefore: notifications.length === qs.limit ? notifications.at(-1).id : null,
    });
  }),
);

/**
 * The badge.
 *
 * Capped at 100 and reported as such. Counting past that is work nobody reads — the difference
 * between 100 and 342 unread changes no decision — and an uncapped COUNT over a table that grows
 * without bound is the query that quietly becomes the slowest thing in the app.
 *
 * `LIMIT 100` inside the subquery is what bounds it: the partial index `notifications_unread_idx`
 * yields rows in id order and the scan stops at a hundred.
 */
router.get(
  '/notifications/unread-count',
  requireAuth,
  asyncRoute(async (req, res) => {
    const row = await db.get(
      `SELECT COUNT(*) AS unread FROM (
         SELECT n.id FROM notifications n
          WHERE ${VISIBLE} AND n.read_at IS NULL
          LIMIT 100)`,
      [req.user.id],
    );
    res.json({ unread: row?.unread ?? 0, capped: (row?.unread ?? 0) >= 100 });
  }),
);

const ReadBody = z
  .object({
    // Omitted means "everything I can see". A client that just opened the inbox does not know the
    // ids, and asking it to send them would make the round trip depend on a full page load.
    ids: z.array(z.number().int().positive()).min(1).max(100).optional(),
  })
  .strict();

/**
 * Mark as read.
 *
 * The guard is in the UPDATE and it carries the SAME visibility predicate as the list. A caller
 * cannot mark a notification read that they could not have read — which matters because
 * `read_at` is the only thing that clears the badge, and a forged id would otherwise let one
 * account silently clear another's.
 *
 * `read_at IS NULL` makes a replay report zero changes rather than re-stamping. Marking read twice
 * is the most ordinary thing a client does: the screen opens, the request runs, the user scrolls
 * back up and it runs again.
 */
router.post(
  '/notifications/read',
  requireAuth,
  readLimiter,
  asyncRoute(async (req, res) => {
    const body = ReadBody.parse(req.body ?? {});
    const holes = body.ids?.map(() => '?').join(',');

    const result = await db.run(
      `UPDATE notifications
          SET read_at = unixepoch()
        WHERE id IN (SELECT n.id FROM notifications n
                      WHERE ${VISIBLE} AND n.read_at IS NULL
                        ${holes ? `AND n.id IN (${holes})` : ''})`,
      holes ? [req.user.id, ...body.ids] : [req.user.id],
    );

    res.json({ read: result.changes });
  }),
);

export default router;
