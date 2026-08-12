// src/admin/routes.js — F8-lite: stats and the exercise moderation queue.
import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireRole, invalidateSvCache } from '../auth/middleware.js';
import { resolveLang, languages } from '../lib/lang.js';
import { encodeCursor, decodeCursor, MAX_PAGE } from '../lib/cursor.js';
import { assertAdmin } from '../lib/assert-admin.js';
import { DETAIL_COLUMNS, DETAIL_JOINS, exerciseBody, withInstructions } from '../exercises/detail.js';

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

/**
 * ═══ READS AND WRITES DO NOT SHARE A BUDGET ════════════════════════════════════════════════════
 *
 * They used to: one `adminLimiter` at 120 per 15 minutes per IP covered all eight routes here,
 * reads included. Opening the dashboard costs three requests — stats, metrics, users — so a working
 * admin session spends the write budget on looking at things, and the limiter that is supposed to
 * bound damage is exhausted by the page that shows there is none.
 *
 * And it was IP-only. A per-IP limit stops one machine; it does not stop one principal with a
 * laptop, a phone and a VPN, which is the shape of an actual compromised admin session.
 */
const adminReadIpLimiter = limiter(600);
const adminReadLimiter = limiter(300, (req) => `adm-r:${req.user?.id ?? ipKeyGenerator(req.ip)}`);
const adminWriteIpLimiter = limiter(120);
const adminWriteLimiter = limiter(60, (req) => `adm-w:${req.user?.id ?? ipKeyGenerator(req.ip)}`);


router.get(
  '/admin/stats',
  requireAuth,
  requireRole('admin'),
  adminReadIpLimiter,
  adminReadLimiter,
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
  adminReadIpLimiter,
  adminReadLimiter,
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

/**
 * ═══ THE SUBMISSION ITSELF, BECAUSE THE QUEUE ROW IS NOT ENOUGH TO DECIDE ON ═══════════════════
 *
 * The lite queue listed a name, an owner's email and a media count, and offered Approve. Approving
 * puts a movement into the shared library that every user in the product can find and follow, and
 * the only thing the moderator had read was its name.
 *
 * This returns exactly what the library's own detail route returns — same columns, same body
 * assembly, from `exercises/detail.js` — so what the moderator reviews IS what everybody else will
 * see, and a field added to one appears on the other.
 *
 * NO `VISIBLE` here, and no id from the caller beyond this one lookup: the WHERE is pinned to
 * `pending_review`, so this route reaches submissions their author volunteered for review and
 * nothing else. An admin cannot read a coach's private library through it — the same boundary the
 * media route's moderation arm draws.
 */
router.get(
  '/admin/moderation/:id',
  requireAuth,
  requireRole('admin'),
  adminReadIpLimiter,
  adminReadLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const lang = await resolveLang(req);
    const { fallback } = await languages();

    const exercise = await db.get(
      `SELECT ${DETAIL_COLUMNS}, u.email AS owner_email
         ${DETAIL_JOINS}
         LEFT JOIN users u ON u.id = e.owner_id
        WHERE e.id = ? AND e.status = 'pending_review' AND e.deleted_at IS NULL`,
      [lang, fallback, id],
    );
    // A submission somebody else decided a moment ago is not in the queue, and 404 is the honest
    // answer for that as well as for an id that never existed — the same rule the decision route
    // applies.
    if (!exercise) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const { availableLangs, muscles, equipment, media } = await exerciseBody(id, lang, fallback);

    res.json({ exercise: withInstructions(exercise), lang, availableLangs, muscles, equipment, media });
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
  adminWriteIpLimiter,
  adminWriteLimiter,
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

/**
 * ═══ STEP-UP, ON THE ONE ACTION THAT HANDS OVER THE PRODUCT ════════════════════════════════════
 *
 * Enumerated first, because "step up on destructive operations" needs to know which those are:
 *
 *   exercise approve/reject   reversible — re-moderate; status is a column
 *   account disable           reversible — /admin/users/:id/enable
 *   role change               reversible — demote through this same route
 *   coin adjust               reversible — adjust back; the ledger keeps both entries
 *   marketplace takedown      reversible — removed_at is a column and restore exists
 *   element style variant     reversible — set it back
 *
 * NO admin action in this product is irreversible. The only irreversible thing is a person erasing
 * their own account, and that already asks for a password.
 *
 * So the question step-up answers here is not "can this be undone" but "what does this HAND OVER".
 * Granting `admin` is the one move that gives somebody else the ability to do everything else,
 * including everything on that list, forever — and it is precisely what a stolen admin session
 * would do first, because a second admin it controls SURVIVES the original session being revoked.
 *
 * Demotion is not stepped up. Requiring a password to take power away, when it is not required to
 * exercise it, gets the incentive backwards.
 */
const RoleSchema = z
  .object({
    role: z.enum(['user', 'coach', 'admin']),
    // Only read when granting admin. Optional here so demotions and coach grants keep working with
    // the body they already send.
    password: z.string().min(1).max(200).optional(),
  })
  .strict();

router.post(
  '/admin/users/:id/role',
  requireAuth,
  requireRole('admin'),
  adminWriteIpLimiter,
  adminWriteLimiter,
  asyncRoute(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    const body = RoleSchema.safeParse(req.body);
    if (!body.success) return sendError(res, 400, ERR.VALIDATION);

    // The step-up, and ONLY on the grant. See the note on RoleSchema for why this one action and
    // not the others: it is the move that hands over the ability to do everything else, and it is
    // what a stolen session does first because the second admin outlives the first one's revocation.
    if (body.data.role === 'admin') {
      if (!body.data.password) {
        return res.status(401).json({
          error: 'granting admin requires your password',
          code: ERR.UNAUTHORIZED,
          reason: 'step_up_required',
          requestId: res.locals.requestId,
        });
      }
      const actor = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      if (!actor || !(await argon2.verify(actor.password_hash, body.data.password))) {
        req.log.warn({ actorId: req.user.id, targetId: id.data }, 'admin grant refused: step-up failed');
        return sendError(res, 401, ERR.UNAUTHORIZED, 'invalid credentials');
      }
    }

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
  adminWriteIpLimiter,
  adminWriteLimiter,
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
  adminWriteIpLimiter,
  adminWriteLimiter,
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

/* ── user search ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The columns an admin may sort by, as a MAP from a client key to SQL.
 *
 * The client never sends SQL and never sends a column name that reaches a query. It sends a key,
 * and a key that is not in this object is a 400 — so there is no interpolation to get wrong and no
 * "sanitise the sort parameter" step that somebody later relaxes.
 *
 * `email` sorts on the same expression its unique index is built on, so the sort is answered from
 * the index rather than by a temp b-tree.
 */
const USER_SORTS = {
  created: { sql: 'u.created_at', tiebreak: 'u.id' },
  email: { sql: 'lower(trim(u.email))', tiebreak: 'u.id' },
  role: { sql: 'u.role', tiebreak: 'u.id' },
};

const userQuery = z
  .object({
    // Bounded and regex-shaped. This is fed to a LIKE, so the bound is what stops a pathological
    // pattern, and the character class is what stops a wildcard being smuggled in: `%` and `_` are
    // LIKE metacharacters, and a search for `%` would match every account in the product.
    q: z.string().trim().min(1).max(80).regex(/^[\w@.\-+ ]+$/u).optional(),
    sort: z.enum(['created', 'email', 'role']).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    role: z.enum(['user', 'coach', 'admin']).optional(),
    state: z.enum(['all', 'enabled', 'disabled']).optional(),
    cursor: z.string().max(200).optional(),
  })
  .strict();

/**
 * Find an account.
 *
 * ═══ THE PROJECTION IS THE SMALLEST THING THAT ANSWERS THE QUESTION ════════════════════════════
 *
 * An admin looking up a user needs to identify them, see their standing, and act. They do not need
 * the person's measurements, their food log, their photos or their conversations, and this endpoint
 * cannot reach any of it. The columns below are the whole projection, and `password_hash`,
 * `session_version` and `next_login_at` are deliberately absent — a support screen that leaks a
 * hash is a support screen that has to be treated as a credential store.
 *
 * ═══ AND THE PAGINATION IS THE ONE THE CODEBASE ALREADY HAS ════════════════════════════════════
 *
 * `lib/cursor.js` encodes an opaque keyset tuple and caps the page at MAX_PAGE. It had zero admin
 * callers: the three existing admin list routes use three different dialects — a raw integer
 * cursor, a hardcoded LIMIT 50 with no cursor at all, and a limit with no cursor. A fourth would
 * have been the eleventh time this project reimplemented something it already had.
 */
router.get(
  '/admin/users',
  requireAuth,
  requireRole('admin'),
  adminReadIpLimiter,
  adminReadLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const parsed = userQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { q, role, state = 'all' } = parsed.data;
    const sortKey = parsed.data.sort ?? 'created';
    const desc = (parsed.data.dir ?? 'desc') === 'desc';
    const order = USER_SORTS[sortKey];

    // The keyset cursor carries the SORTED value and the tiebreak id, so a page boundary cannot
    // skip or repeat a row when two accounts share a timestamp — which every seeded batch does.
    const after = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
    const cursorOk = Array.isArray(after) && after.length === 2;

    // Every fragment below is a FIXED string chosen by a key, never assembled from request text.
    const cmp = desc ? '<' : '>';
    const dir = desc ? 'DESC' : 'ASC';
    const rows = await db.all(
      `SELECT u.id, u.email, u.role, u.created_at AS createdAt, u.disabled_at AS disabledAt,
              u.must_change_credentials AS mustChange,
              EXISTS (SELECT 1 FROM coach_profiles c WHERE c.user_id = u.id) AS hasProfile,
              (SELECT COUNT(*) FROM coach_clients k
                WHERE k.coach_id = u.id AND k.status = 'active')            AS clientCount
         FROM users u
        WHERE (? IS NULL OR lower(trim(u.email)) LIKE '%' || lower(?) || '%')
          AND (? IS NULL OR u.role = ?)
          AND (? = 'all'
            OR (? = 'enabled'  AND u.disabled_at IS NULL)
            OR (? = 'disabled' AND u.disabled_at IS NOT NULL))
          AND (? = 0 OR (${order.sql}, ${order.tiebreak}) ${cmp} (?, ?))
        ORDER BY ${order.sql} ${dir}, ${order.tiebreak} ${dir}
        LIMIT ?`,
      [
        q ?? null, q ?? '',
        role ?? null, role ?? null,
        state, state, state,
        cursorOk ? 1 : 0, cursorOk ? after[0] : null, cursorOk ? after[1] : null,
        MAX_PAGE + 1,
      ],
    );

    const page = rows.slice(0, MAX_PAGE);
    const last = page[page.length - 1];
    res.json({
      users: page,
      // The cursor encodes the SORT VALUE, not the row id — a cursor built from the id would walk
      // the wrong order the moment the sort key is anything but `created`.
      nextCursor:
        rows.length > MAX_PAGE && last
          ? encodeCursor([sortKey === 'email' ? String(last.email).trim().toLowerCase() : sortKey === 'role' ? last.role : last.createdAt, last.id])
          : null,
      sort: { key: sortKey, direction: desc ? 'desc' : 'asc' },
    });
  }),
);

/* ── metrics ─────────────────────────────────────────────────────────────────────────────────── */

const metricsQuery = z
  .object({
    // Bounded, and low. Every series below groups a date range across EVERY user, so the cost is
    // linear in the window — an unbounded window is a one-request denial of service wearing the
    // clothes of a chart control. 90 is a quarter, which is as far back as a trend line is read.
    days: z.coerce.number().int().min(7).max(90).optional(),
  })
  .strict();

/**
 * The dashboard's time series.
 *
 * ═══ THIS DOES NOT RETURN DAU/MAU, BECAUSE THE PRODUCT CANNOT MEASURE IT ═══════════════════════
 *
 * There is no session table, no events table and no `users.last_seen_at` — checked against
 * `pragma_table_info`, not assumed. Every candidate proxy means something different from "daily
 * active users":
 *
 *   * `refresh_tokens` counts TOKENS. Rotation mints a new row on every refresh, so one tab open
 *     all afternoon looks like a dozen people.
 *   * `audit_log` records notable events, which ordinary use is not.
 *
 * Adding `last_seen_at` would mean a write on every authenticated request — a write amplifier on
 * the hottest path in the product, to power one number on one screen.
 *
 * So this returns what the product actually records: PEOPLE WHO LOGGED SOMETHING. That is a real
 * engagement number, and it is smaller than DAU by however many people opened the app and logged
 * nothing. The field is called `loggedPeople` rather than `dau` so nobody has to read this comment
 * to avoid the mistake.
 *
 * ═══ TWO CLOCKS, KEPT APART ════════════════════════════════════════════════════════════════════
 *
 * Activity buckets on `local_date` — the user's own day, the same column the streaks and calendar
 * use, and 010 says in terms why `date(started_at,'unixepoch')` mis-buckets everyone outside UTC.
 * Signups and coin movement bucket on UTC, because a registration and a ledger entry are events in
 * server time. Each series carries its `clock`, and the client charts them separately: a UTC bar
 * beside a local-date one on one axis claims a shared day boundary they do not have.
 */
router.get(
  '/admin/metrics',
  requireAuth,
  requireRole('admin'),
  adminReadIpLimiter,
  adminReadLimiter,
  asyncRoute(async (req, res) => {
    if (!(await assertAdmin(req, res))) return;
    const parsed = metricsQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const days = parsed.data.days ?? 30;
    const since = `-${days} days`;

    // One pool call per series, in parallel. They are independent reads, each answered from its own
    // index, and there is no consistency requirement between them that a few milliseconds of skew
    // could violate.
    const [logged, signups, workouts, coins, coaches, totals] = await Promise.all([
      // Somebody who logged a workout AND a meal on the same day is one person: UNION, not UNION
      // ALL, and the DISTINCT is over the union rather than over each half.
      db.all(
        `SELECT d AS day, COUNT(DISTINCT uid) AS people FROM (
           SELECT local_date AS d, client_user_id AS uid FROM workout_logs
            WHERE local_date >= date('now', ?)
           UNION
           SELECT local_date AS d, client_user_id AS uid FROM nutrition_log_items
            WHERE local_date >= date('now', ?)
         )
         GROUP BY d ORDER BY d`,
        [since, since],
      ),
      db.all(
        `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS n
           FROM users WHERE created_at >= unixepoch() - ? GROUP BY day ORDER BY day`,
        [days * 86400],
      ),
      db.all(
        `SELECT local_date AS day, COUNT(*) AS n
           FROM workout_logs WHERE local_date >= date('now', ?) AND status = 'completed'
          GROUP BY day ORDER BY day`,
        [since],
      ),
      // Velocity is how much MOVED, so the sign is dropped: a 500 grant and a 500 spend are a
      // thousand minor units of movement, not zero. Integer minor units throughout — nothing here
      // divides, because HUF has minor_units = 0 and dividing by a hardcoded 100 is a defect this
      // project already shipped once.
      db.all(
        `SELECT date(created_at, 'unixepoch') AS day,
                SUM(ABS(amount_minor)) AS movedMinor,
                COUNT(*) AS entries
           FROM coin_ledger WHERE created_at >= unixepoch() - ? GROUP BY day ORDER BY day`,
        [days * 86400],
      ),
      // An "active coach" is one somebody is actually linked to. Counting accounts that hold the
      // coach role answers a different question, and it is the flattering one.
      db.get(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE role = 'coach' AND disabled_at IS NULL) AS withRole,
           (SELECT COUNT(DISTINCT c.coach_id) FROM coach_clients c
             JOIN users u ON u.id = c.coach_id
            WHERE c.status = 'active' AND u.disabled_at IS NULL)                     AS withClients`,
      ),
      db.get(
        `SELECT
           (SELECT COUNT(DISTINCT uid) FROM (
              SELECT client_user_id AS uid FROM workout_logs        WHERE local_date >= date('now','-30 days')
              UNION
              SELECT client_user_id AS uid FROM nutrition_log_items WHERE local_date >= date('now','-30 days')
            )) AS loggedPeople30d,
           (SELECT COUNT(DISTINCT uid) FROM (
              SELECT client_user_id AS uid FROM workout_logs        WHERE local_date >= date('now','-1 days')
              UNION
              SELECT client_user_id AS uid FROM nutrition_log_items WHERE local_date >= date('now','-1 days')
            )) AS loggedPeople1d`,
      ),
    ]);

    res.json({
      window: { days },
      loggedPeople: {
        clock: 'local_date',
        daily: logged,
        last30d: totals.loggedPeople30d,
        last1d: totals.loggedPeople1d,
      },
      signups: { clock: 'utc', daily: signups },
      completedWorkouts: { clock: 'local_date', daily: workouts },
      coinVelocity: { clock: 'utc', daily: coins },
      coaches,
    });
  }),
);

export default router;
