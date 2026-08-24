// src/chat/routes.js — F6 chat, v1 (polling, decision D-5A).
//
// THE LINK IS THE AUTHORITY, and it is spelled ONCE. `MEMBER_OF` below is the only definition of
// "this conversation is mine", and every read and write here uses it. The alternative — each route
// writing its own WHERE — is the single failure this codebase has spent three phases deleting: two
// spellings of one idea that drift, with neither side wrong on its own.
//
// It carries `cc.status = 'active'` deliberately. Membership is not enough: an archived
// relationship must stop serving on the very next request, with no code remembering to act. That
// is the exact hole a design review found in an earlier draft, whose read key was `user_id = ?`.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { WITHIN_RETENTION } from './retention.js';

const router = Router();

/**
 * Messages are the hottest write in this feature and the easiest to abuse — it is the first place
 * one user's free text reaches another. Generous enough for a real conversation, far below what a
 * flood needs.
 */
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/** THE predicate. `?` is the conversation id, then the caller's id twice. */
const MEMBER_OF = `
  c.id = ? AND (c.coach_id = ? OR c.client_id = ?)
  AND EXISTS (SELECT 1 FROM coach_clients cc WHERE cc.id = c.coach_client_id AND cc.status = 'active')`;
const memberParams = (conversationId, userId) => [conversationId, userId, userId];

const idParam = z.coerce.number().int().positive();

/* ── the conversation list ───────────────────────────────────────────────────────────────────── */

router.get(
  '/conversations',
  requireAuth,
  asyncRoute(async (req, res) => {
    const conversations = await db.all(
      // The unread count is a correlated subquery over `messages_unread_idx`, which is partial —
      // read and deleted messages are not in the B-tree at all, so this cannot count them even by
      // forgetting a term.
      `SELECT c.id, c.coach_client_id, c.coach_id, c.client_id, c.blocked_at, c.blocked_by,
              c.last_message_at,
              (SELECT COUNT(*) FROM messages m
                WHERE m.conversation_id = c.id AND m.sender_id <> ?
                  AND m.read_at IS NULL AND m.deleted_at IS NULL) AS unread,
              (SELECT m.body FROM messages m
                WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                ORDER BY m.id DESC LIMIT 1) AS last_body,
              u.email AS other_email, u.display_name AS other_display_name
         FROM conversations c
         JOIN coach_clients cc ON cc.id = c.coach_client_id AND cc.status = 'active'
         JOIN users u ON u.id = CASE WHEN c.coach_id = ? THEN c.client_id ELSE c.coach_id END
        WHERE (c.coach_id = ? OR c.client_id = ?)
        ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
        LIMIT 100`,
      [req.user.id, req.user.id, req.user.id, req.user.id],
    );
    res.json({ conversations });
  }),
);

const OpenBody = z.object({ coach_client_id: z.number().int().positive() }).strict();

/**
 * Open the conversation for a relationship, or hand back the one that already exists.
 *
 * Idempotent by construction: `conversations.coach_client_id` is UNIQUE, so two people opening a
 * chat at the same moment both get the same row. That is the ordinary case, not a race to guard.
 */
router.post(
  '/conversations',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const body = OpenBody.parse(req.body);
    const result = await db.openConversation({ linkId: body.coach_client_id, userId: req.user.id });
    if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ conversation: result.conversation });
  }),
);

/* ── the thread ──────────────────────────────────────────────────────────────────────────────── */

const ThreadQuery = z
  .object({
    // A keyset cursor on the SAME column the index orders by. A cursor compared against a
    // different key than the rows are sorted on silently skips and repeats — the defect a review
    // found in an earlier draft, on the path that polls every five seconds.
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

router.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncRoute(async (req, res) => {
    const conversationId = idParam.parse(req.params.id);
    const qs = ThreadQuery.parse(req.query);

    const conv = await db.get(
      `SELECT c.id FROM conversations c WHERE ${MEMBER_OF}`,
      memberParams(conversationId, req.user.id),
    );
    if (!conv) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const messages = await db.all(
      // Newest first, paging BACKWARDS — chat is read from the bottom, so that is the natural
      // shape and it matches the keyset pagination used everywhere else here.
      //
      // A deleted message keeps its row and loses its body. The thread must still show that
      // something was there and withdrawn; erasing the row would make it lie about what happened.
      `SELECT m.id, m.sender_id, m.created_at, m.read_at, m.deleted_at,
              CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,
              a.storage_key, a.mime, a.bytes, a.duration_seconds
         FROM messages m
         LEFT JOIN message_attachments a ON a.message_id = m.id
        WHERE m.conversation_id = ? AND ${WITHIN_RETENTION} ${qs.before ? 'AND m.id < ?' : ''}
        ORDER BY m.id DESC
        LIMIT ?`,
      qs.before ? [conversationId, qs.before, qs.limit] : [conversationId, qs.limit],
    );

    res.json({ messages, nextBefore: messages.length === qs.limit ? messages.at(-1).id : null });
  }),
);

const SendBody = z
  .object({
    // Bounded here AND in the column. zod guards this one route; the CHECK guards every writer
    // that will ever exist.
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

router.post(
  '/conversations/:id/messages',
  requireAuth,
  messageLimiter,
  asyncRoute(async (req, res) => {
    const conversationId = idParam.parse(req.params.id);
    const body = SendBody.parse(req.body);

    // ONE worker call: the message and the recipient's notification are a single atomic act. Split
    // in two, a message could exist that nobody was told about, and nothing recomputes a badge.
    const result = await db.sendMessage({ conversationId, senderId: req.user.id, body: body.body });

    if (result.outcome === 'missing') return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    // 409 rather than 403: the conversation is genuinely theirs, it is its STATE that refuses.
    // Saying "not found" here would send them hunting for a bug in the wrong place.
    if (result.outcome === 'blocked') return sendError(res, 409, ERR.CONFLICT, 'this conversation is closed');

    res.status(201).json({ id: result.messageId });
  }),
);

/**
 * Mark everything the OTHER party sent as read.
 *
 * `sender_id <> ?` is what makes this safe to call from a screen that simply opened: a client
 * cannot mark their own messages read on the coach's behalf, so a read receipt can never be
 * manufactured by the person who wants it.
 */
router.post(
  '/conversations/:id/read',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const conversationId = idParam.parse(req.params.id);
    const conv = await db.get(
      `SELECT c.id FROM conversations c WHERE ${MEMBER_OF}`,
      memberParams(conversationId, req.user.id),
    );
    if (!conv) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const result = await db.run(
      `UPDATE messages SET read_at = unixepoch()
        WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL AND deleted_at IS NULL`,
      [conversationId, req.user.id],
    );
    res.json({ read: result.changes });
  }),
);

/* ── withdrawing a message ───────────────────────────────────────────────────────────────────── */

router.delete(
  '/messages/:id',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const messageId = idParam.parse(req.params.id);
    // The guard is in the UPDATE: only the SENDER may withdraw, only once, and only from a live
    // relationship. A second attempt reports zero changes rather than raising.
    const result = await db.run(
      `UPDATE messages SET deleted_at = unixepoch()
        WHERE id = ? AND sender_id = ? AND deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM conversations c
                        JOIN coach_clients cc ON cc.id = c.coach_client_id AND cc.status = 'active'
                       WHERE c.id = messages.conversation_id)`,
      [messageId, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ deleted: true });
  }),
);

/* ── block and report ────────────────────────────────────────────────────────────────────────── */

/**
 * Blocking closes the CONVERSATION, not the relationship.
 *
 * A blocked client keeps their plan, their history and their records — those are their data, and
 * taking them away would make "block" a punishment rather than a boundary. What stops is messages,
 * which is the thing that was unwanted.
 */
router.post(
  '/conversations/:id/block',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const conversationId = idParam.parse(req.params.id);
    const result = await db.run(
      `UPDATE conversations SET blocked_at = unixepoch(), blocked_by = ?
        WHERE id = ? AND (coach_id = ? OR client_id = ?) AND blocked_at IS NULL`,
      [req.user.id, conversationId, req.user.id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ blocked: true });
  }),
);

/** Only the person who blocked may lift it. Being blocked is not a state you can undo yourself. */
router.post(
  '/conversations/:id/unblock',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const conversationId = idParam.parse(req.params.id);
    const result = await db.run(
      `UPDATE conversations SET blocked_at = NULL, blocked_by = NULL
        WHERE id = ? AND blocked_by = ? AND blocked_at IS NOT NULL`,
      [conversationId, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ blocked: false });
  }),
);

const ReportBody = z
  .object({
    reason: z.enum(['abuse', 'spam', 'inappropriate', 'other']),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/**
 * Report a message.
 *
 * The body is SNAPSHOTTED, because the sender can withdraw it the moment after a report is filed
 * and a moderator looking at an empty row cannot act. The privacy cost is real and is stated in
 * the migration: the snapshot is cleared when the report is resolved, leaving the row as the
 * historical fact that a report happened.
 *
 * `INSERT ... SELECT ... WHERE` so the reporter's membership is part of the write. A separate
 * check would be a second place for the predicate to live.
 */
router.post(
  '/messages/:id/report',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const messageId = idParam.parse(req.params.id);
    const body = ReportBody.parse(req.body);

    const result = await db.run(
      `INSERT OR IGNORE INTO message_reports (message_id, reporter_id, reason, note, body_snapshot)
       SELECT m.id, ?, ?, ?, m.body
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = ?
          AND (c.coach_id = ? OR c.client_id = ?)
          -- You cannot report yourself. It is not a moderation signal, and it is a way to make a
          -- permanent copy of your own text after withdrawing it.
          AND m.sender_id <> ?`,
      [req.user.id, body.reason, body.note ?? null, messageId, req.user.id, req.user.id, req.user.id],
    );

    // Not a message they can see, their own, or already reported by them. One answer for all.
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.status(201).json({ reported: true });
  }),
);

/* ── leaving a coach ─────────────────────────────────────────────────────────────────────────── */

/**
 * THE CLIENT ENDS THE RELATIONSHIP.
 *
 * Until now only the coach could archive a link, so a client who wanted out had no exit — they
 * could block the conversation and still be somebody's client. Blocking is a boundary; this is a
 * door, and a product that offers the first without the second is one a person cannot leave.
 *
 * Archiving rather than deleting: their plans, history and records are their data and survive. The
 * COACH's access is what ends, on the very next request, because every coach-side predicate in
 * this codebase carries `cc.status = 'active'`.
 */
router.post(
  '/coaches/:linkId/leave',
  requireAuth,
  actionLimiter,
  asyncRoute(async (req, res) => {
    const linkId = idParam.parse(req.params.linkId);
    const result = await db.run(
      `UPDATE coach_clients SET status = 'archived', archived_at = unixepoch(), updated_at = unixepoch()
        WHERE id = ? AND client_id = ? AND status <> 'archived'`,
      [linkId, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    await db.run(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, request_id)
       VALUES (?, 'coach_client.left', 'coach_client', ?, ?)`,
      // res.locals.requestId, NOT req.id — nothing sets req.id, so this row landed with a
      // NULL request_id and could not be correlated with the server log. The one audit call site
      // in the product that had invented its own accessor was also the only one that was wrong.
      [req.user.id, linkId, res.locals.requestId],
    );
    res.json({ left: true });
  }),
);

export default router;
