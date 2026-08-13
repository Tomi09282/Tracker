// src/coaching/routes.js — coach↔client links, teams and the three join flows (F2).
import { Router } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireCoach, invalidateSvCache } from '../auth/middleware.js';

const router = Router();

const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Redeeming a code is the brute-force surface of the whole product: it is the one endpoint where
 * guessing right hands you into somebody's team. So it gets its own tight limiter keyed on BOTH
 * the IP and the submitted code — a distributed attempt still converges on one code, and a
 * single host still cannot walk the space.
 */
const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) =>
    typeof req.body?.code === 'string'
      ? `${ipKeyGenerator(req.ip)}:${req.body.code.slice(0, 4)}`
      : ipKeyGenerator(req.ip),
});

/** 160 bits, base32-ish alphabet without look-alikes: no O/0, no I/1/l. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode() {
  const bytes = randomBytes(20);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  // Grouped for reading aloud — a coach will dictate this over a gym floor.
  return out.match(/.{1,5}/g).join('-');
}

const hashCode = (code) => createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

/*
 * `sameHash` used to live here — a constant-time compare of two hex digests, called on a row that
 * had just been SELECTed `WHERE code_hash = ?`. Its own comment said it was belt and braces.
 *
 * It went with the redemption into `redeemInviteTx`, and it did not come back: a re-comparison of a
 * value the database matched by equality can only ever agree, and the timing it was protecting is
 * the index lookup's, not JavaScript's. Dead code that looks like a security control is worse than
 * no code — the next person to touch this reads it as the defence and stops looking for the real
 * one, which is that the code is hashed before it is ever used as a key.
 */

/* ── teams ─────────────────────────────────────────────────────────────────────────────── */

const TeamBody = z
  .object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).nullable().optional() })
  .strict();

router.get(
  '/teams',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    const teams = await db.all(
      `SELECT t.id, t.name, t.description, t.archived_at,
              (SELECT COUNT(*) FROM coach_clients c
                WHERE c.team_id = t.id AND c.status = 'active') AS member_count
         FROM teams t
        WHERE t.coach_id = ? AND t.archived_at IS NULL
        ORDER BY t.name`,
      [req.user.id],
    );
    res.json({ teams });
  }),
);

router.post(
  '/teams',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const body = TeamBody.parse(req.body);
    const created = await db.run(
      'INSERT INTO teams (coach_id, name, description) VALUES (?, ?, ?)',
      [req.user.id, body.name, body.description ?? null],
    );
    res.status(201).json({ id: created.lastInsertRowid });
  }),
);

/* ── clients ───────────────────────────────────────────────────────────────────────────── */

router.get(
  '/clients',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    // Scoped to the caller by construction. There is no coach_id in the query string to forge.
    const clients = await db.all(
      // ADHERENCE, COMPUTED AT READ TIME rather than stored or digested by a job.
      //
      // This column used to be deliberately absent, and the dashboard said why: "nothing logs a
      // workout yet, so a 0% adherence column would be a lie about every client on the screen".
      // That reason expired when Phase 2 shipped the player — the comment outlived the condition
      // it described, which is its own small lesson about comments that assert a state of the
      // world rather than a rule.
      //
      // Read time, not a digest: this product has no scheduler, and a stored figure is one that is
      // accurate exactly as often as the job runs. `sessions_28d` is the honest raw number and the
      // UI renders it as a count, never as a percentage — a percentage needs a denominator, and
      // "how many sessions were PRESCRIBED" is the schedule rule, which is arithmetic over a
      // window rather than a column this query can join.
      `SELECT c.id AS link_id, c.status, c.origin, c.team_id, c.invited_at, c.accepted_at,
              u.id AS client_id, u.email, u.must_change_credentials,
              t.name AS team_name,
              (SELECT COUNT(*) FROM workout_logs l
                WHERE l.client_user_id = u.id AND l.status = 'completed'
                  AND l.local_date >= date('now', '-28 days')) AS sessions_28d,
              (SELECT MAX(l.local_date) FROM workout_logs l
                WHERE l.client_user_id = u.id AND l.status = 'completed') AS last_session_on
         FROM coach_clients c
         JOIN users u ON u.id = c.client_id
         LEFT JOIN teams t ON t.id = c.team_id
        WHERE c.coach_id = ? AND c.status <> 'archived'
        ORDER BY t.name IS NULL, t.name, u.email`,
      [req.user.id],
    );
    res.json({ clients });
  }),
);

/**
 * One client, for the detail screen.
 *
 * A separate endpoint rather than the roster row the list already has, because the detail screen
 * is deep-linkable: arriving at /coach/clients/12 directly must work, and it must fail the same
 * way for a stranger as for a link that does not exist.
 */
router.get(
  '/clients/:id',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    const linkId = z.coerce.number().int().positive().parse(req.params.id);
    const client = await db.get(
      `SELECT c.id AS link_id, c.status, c.origin, c.team_id, c.invited_at, c.accepted_at,
              u.id AS client_id, u.email, u.must_change_credentials, u.created_at AS joined_at,
              t.name AS team_name
         FROM coach_clients c
         JOIN users u ON u.id = c.client_id
         LEFT JOIN teams t ON t.id = c.team_id
        WHERE c.id = ? AND c.coach_id = ? AND c.status <> 'archived'`,
      [linkId, req.user.id],
    );
    // 404 for "not yours", "archived" and "never existed" alike — three different truths that
    // must be indistinguishable from outside, or the response becomes an oracle.
    if (!client) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ client });
  }),
);

router.post(
  '/clients/:id/archive',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    // The guard is in the UPDATE: a link that is not this coach's simply does not match, and a
    // second archive of the same link reports zero changes rather than succeeding twice.
    const result = await db.run(
      `UPDATE coach_clients SET status = 'archived', archived_at = unixepoch()
        WHERE id = ? AND coach_id = ? AND status <> 'archived'`,
      [id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

/* ── join codes (flows A and B) ────────────────────────────────────────────────────────── */

const CodeBody = z
  .object({
    kind: z.enum(['single', 'multi']).default('multi'),
    max_uses: z.number().int().min(1).max(500).default(1),
    team_id: z.number().int().positive().nullable().optional(),
    expires_in_days: z.number().int().min(1).max(365).default(30),
    label: z.string().trim().max(40).optional(),
  })
  .strict();

router.post(
  '/invite-codes',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const body = CodeBody.parse(req.body);

    // A team id from the body is a classic IDOR vector: it must belong to the caller.
    if (body.team_id) {
      const team = await db.get('SELECT id FROM teams WHERE id = ? AND coach_id = ?', [
        body.team_id,
        req.user.id,
      ]);
      if (!team) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    }

    const code = generateCode();
    const created = await db.run(
      `INSERT INTO invite_codes (code_hash, label, coach_id, team_id, kind, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, unixepoch() + ?)`,
      [
        hashCode(code),
        body.label ?? null,
        req.user.id,
        body.team_id ?? null,
        body.kind,
        body.kind === 'single' ? 1 : body.max_uses,
        body.expires_in_days * 86400,
      ],
    );

    // The ONLY time the plaintext code exists in a response. It is not stored anywhere.
    res.status(201).json({ id: created.lastInsertRowid, code });
  }),
);

router.get(
  '/invite-codes',
  requireAuth,
  requireCoach,
  asyncRoute(async (req, res) => {
    const codes = await db.all(
      `SELECT id, label, team_id, kind, max_uses, uses, expires_at, revoked_at, created_at
         FROM invite_codes WHERE coach_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id],
    );
    // Deliberately no code_hash: it is not useful to the client and it is the thing we protect.
    res.json({ codes });
  }),
);

router.post(
  '/invite-codes/:id/revoke',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const result = await db.run(
      'UPDATE invite_codes SET revoked_at = unixepoch() WHERE id = ? AND coach_id = ? AND revoked_at IS NULL',
      [id, req.user.id],
    );
    if (result.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

const RedeemBody = z.object({ code: z.string().trim().min(4).max(40) }).strict();

router.post(
  '/join',
  requireAuth,
  redeemLimiter,
  asyncRoute(async (req, res) => {
    const { code } = RedeemBody.parse(req.body);
    const digest = hashCode(code);

    // ═══ AN EXHAUSTED CODE USED TO LINK THE CLIENT ANYWAY ══════════════════════════════════════
    //
    // The old shape read the code, ran a series of checks, then `writeTx([consumeGuarded,
    // insertLink])` and finally branched on `consumed.changes === 0` to answer 409 'this code has
    // been used up'. writeTx commits every step before it returns.
    //
    // Measured on the dev database: the guarded UPDATE changed 0 rows, the route sent its 409 —
    // and `coach_clients` held a row with `status = 'active'`. That is a coach reading somebody's
    // logs, assigning them plans and opening a chat with them, off a code the product had just told
    // that person did not work. The comment above the old transaction said two racing callers could
    // not both win; the guard was real, and it protected exactly one of the two statements.
    //
    // Everything is one named transaction now: the outcome is decided before anything is written,
    // the link is written ONLY on the accepted path, and the redemption record still lands for the
    // refusals it exists to remember.
    const r = await db.redeemInvite({
      userId: req.user.id,
      digest,
      ip: req.ip ?? null,
    });

    // A code that does not exist, was revoked, or has expired all answer identically. Telling them
    // apart would confirm which codes are real to somebody feeding the endpoint guesses.
    if (r.outcome === 'unknown' || r.outcome === 'revoked' || r.outcome === 'expired') {
      return sendError(res, 404, ERR.NOT_FOUND, 'invalid code');
    }
    if (r.outcome === 'own_team') {
      return sendError(res, 409, ERR.CONFLICT, 'you cannot join your own team');
    }
    if (r.outcome === 'exhausted') {
      return sendError(res, 409, ERR.CONFLICT, 'this code has been used up');
    }
    /*
     * ═══ THE ONE REFUSAL THAT IS NOT ABOUT THE PERSON HOLDING THE CODE ═══════════════════════
     *
     * Their code is valid. The coach has no seat left. Every other refusal above is deliberately
     * vague — telling a stranger which codes are real is an enumeration oracle — but this one has
     * nobody to protect: it reveals nothing about the code, and leaving it as "invalid code" would
     * send somebody to their coach reporting a broken link that is not broken.
     *
     * The redemption row is written with `outcome = 'seat_limit'`, so the coach's own view can
     * eventually show that somebody tried and bounced off the plan limit. That is the single most
     * useful thing to tell a coach who is about to upgrade.
     */
    if (r.outcome === 'seat_limit') {
      return sendError(res, 409, ERR.CONFLICT, 'this coach has no free client seat');
    }

    req.log.info({ coachId: r.coachId, teamId: r.link.teamId }, 'join code redeemed');
    res.json({ ok: true, linkId: r.link.id, teamId: r.link.teamId });
  }),
);

/* ── flow C: pre-generated accounts ────────────────────────────────────────────────────── */

const PregenBody = z
  .object({
    emails: z.array(z.string().trim().toLowerCase().pipe(z.email().max(254))).min(1).max(50),
    team_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

router.post(
  '/clients/pregenerate',
  requireAuth,
  requireCoach,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const body = PregenBody.parse(req.body);

    if (body.team_id) {
      const team = await db.get('SELECT id FROM teams WHERE id = ? AND coach_id = ?', [
        body.team_id,
        req.user.id,
      ]);
      if (!team) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    }

    const created = [];
    const skipped = [];

    /*
     * ═══ THE BATCH STOPS AT THE SEAT LIMIT, IT DOES NOT SKIP PAST IT ═════════════════════════
     *
     * `skipped` already means "this address belongs to somebody else, try another" — a per-address
     * fact the coach can act on. Running out of seats is not that: every remaining address fails
     * for the same reason, and folding them into `skipped` would report fifty addresses as
     * individually unusable when the truth is one plan limit.
     *
     * The accounts created before the limit was hit are real and are returned. Discarding work that
     * succeeded in order to report a clean failure would throw away passwords that exist nowhere
     * else — they are shown once and stored only as a hash.
     */
    let seatLimited = false;

    for (const email of body.emails) {
      // A temporary password the coach reads out once. `must_change_credentials` is what makes
      // this safe: until the client sets their own, the coach knows the password, so the account
      // is not yet theirs — and requireAuth refuses everything except the change endpoint.
      //
      // Hashed HERE rather than in the worker: argon2 at these parameters costs ~50 ms of CPU by
      // design, and spending that inside a held write lock would stall every other writer in the
      // process, fifty times over on a full batch.
      const temp = generateCode().replace(/-/g, '').slice(0, 12);
      const hash = await argon2.hash(temp, ARGON2_OPTS);

      /*
       * ONE named transaction for the account, the link and the audit row.
       *
       * This used to be a bare INSERT for the user followed by a `writeTx` for the rest — a shape
       * with no failure mode until the seat cap gave it one. A refused link would have left an
       * account behind that belongs to nobody: the address consumed, a password hash on disk, a
       * row the coach cannot see and the client was never told about. The next attempt for that
       * address would then be told it is taken.
       *
       * The email check moved inside for the same reason: outside, two requests for one address
       * could both pass it and the second would hit the unique index as a 500, where the route
       * already knows how to say "skipped".
       */
      const r = await db.pregenerateClient({
        coachId: req.user.id,
        email,
        passwordHash: hash,
        teamId: body.team_id ?? null,
        requestId: res.locals.requestId,
        ip: req.ip ?? null,
      });

      if (r.outcome === 'email_taken') {
        skipped.push(email);
        continue;
      }
      if (r.outcome === 'seat_limit') {
        seatLimited = true;
        break;
      }

      // The temporary password is returned exactly once and stored nowhere in plaintext.
      created.push({ email, temporaryPassword: temp, userId: r.userId });
    }

    // `seatLimited` is reported, not inferred. A client counting `created.length` against what it
    // sent would have to guess whether the shortfall was seats or taken addresses, and those need
    // different actions from the coach: upgrade, or pick another address.
    res.status(201).json({ created, skipped, seatLimited });
  }),
);

export default router;
