// src/public/compose.js — the coach's side of the public marketplace.
//
// Phase 6 shipped the READ surface and nothing else. A coach could not create a profile or publish
// a post; the posts that existed were inserted by a script. This router is where that stops.
//
// ═══ IT IS MOUNTED BELOW csrfProtection, AND NOT IN public/routes.js ═══════════════════════════
//
// `public/routes.js` is mounted ABOVE the CSRF middleware, because every route in it is a GET that
// must answer with no cookie and no header. Putting a write there would silently forfeit all three
// CSRF layers — and `check-routes.mjs` would stay green, because its rule for that file is the
// opposite one: it FAILS the build if `requireAuth`, `requireRole` or `req.user` appears there. A
// write in that file would pass the gate by being in the file the gate exempts.
//
// So the composer is a separate router, below the CSRF middleware, and every route in it is
// authenticated. The two files sit next to each other and mount at opposite ends of the stack.

import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireCoach } from '../auth/middleware.js';
import { MarkdownError } from './markdown.js';
import { buildBio, buildBody, BIO_BODY, POST_BODY, COMPOSE_JSON_LIMIT } from './body.js';
import { displayText } from './text.js';
import { HANDLE_RE, CITY_KEY_RE, SPECIALTY_KEY_RE, KIND_KEY_RE, CURRENCY_RE, PUBLIC_ID_RE, ianaTz } from './shapes.js';
import { AUTHOR_POST_ANY, AUTHOR_POST_COLUMNS, POST_STATE_FILTERS } from './visibility.js';
import { encodeCursor, decodeCursor } from '../lib/cursor.js';

const router = Router();

/* ── product limits ─────────────────────────────────────────────────────────────────────────── */

/**
 * The bounds the EDITOR enforces, which are not the bounds the database enforces.
 *
 * Migration 021 says so in as many words: its column CHECKs are "STORAGE-SAFETY bounds, generous
 * on purpose. The product bounds (title 140, body 20 000)" live here. The two exist for different
 * jobs — the column stops a row that would break something, the product stops a title nobody can
 * read on a card — and conflating them is how a title of 400 characters ends up in a feed.
 *
 * They are exported and served to the client by `GET /compose/context` rather than typed into the
 * editor's counter, because a counter that disagrees with the validator is a form that says "12
 * characters left" and then refuses to save.
 */
export { COMPOSE_JSON_LIMIT };

export const COMPOSE_LIMITS = {
  titleMax: 140,
  headlineMax: 120,
  displayNameMax: 120,
  displayNameMin: 2,
  bodyMax: POST_BODY.maxChars,
  // NOT the same number as bodyMax. coach_profiles.bio_src is CHECKd at 16 384 while a post body is
  // bounded at 20 000, so a bio the editor said was fine would have died on a raw constraint. The
  // counter and the validator now read the same constant.
  bioMax: BIO_BODY.maxChars,
  specialtyMax: 6,
};

/* ── rate limits ────────────────────────────────────────────────────────────────────────────── */

const limiter = (limit, keyGenerator) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...(keyGenerator ? { keyGenerator } : {}),
  });

// Per IP and per ACCOUNT, because they stop different things. An IP limit stops one machine; an
// account limit stops one person with a phone, a laptop and a VPN.
const composeReadLimiter = limiter(600);
const composeWriteIpLimiter = limiter(120);
const composeWriteAccountLimiter = limiter(60, (req) => `compose:${req.user?.id ?? req.ip}`);
// Publishing is limited far ABOVE the database's own daily quota on purpose. The quota is the
// bound that survives a restart and a second cluster worker; a limiter set to the same ceiling
// would let a handful of retries of one publish exhaust the budget for every other one.
const publishIpLimiter = limiter(20);
const publishAccountLimiter = limiter(60, (req) => `pub:${req.user?.id ?? req.ip}`);

/* ── GET /compose/context ───────────────────────────────────────────────────────────────────── */

const emptyQuery = z.object({}).strict();

/**
 * Everything the composer needs to render itself, in ONE statement.
 *
 * ═══ WHY ONE STATEMENT AND NOT THREE READS ═════════════════════════════════════════════════════
 *
 * Each call into the pool is a different worker thread with its own read snapshot. Three calls can
 * therefore answer from three different moments and produce a screen that contradicts itself —
 * "you have no profile" beside "your profile is live" — which is not a race the user can retry
 * their way out of, because nothing is wrong by the time they look.
 *
 * ═══ AND WHY THE USER ID IS BOUND ONCE ═════════════════════════════════════════════════════════
 *
 * The subqueries below reference the caller ten times. Ten positional parameters that must all be
 * the same value, in the right order, is a bug waiting for someone to insert a column in the
 * middle. The CTE binds it once and every subquery reads it by name.
 */
router.get(
  '/compose/context',
  requireAuth,
  requireCoach,
  composeReadLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);

    const [row] = await db.all(
      `WITH me(uid) AS (VALUES (?))
       SELECT
         (SELECT c.handle       FROM coach_profiles c, me WHERE c.user_id = me.uid AND c.removed_at IS NULL) AS handle,
         (SELECT c.display_name FROM coach_profiles c, me WHERE c.user_id = me.uid AND c.removed_at IS NULL) AS displayName,
         (SELECT c.headline     FROM coach_profiles c, me WHERE c.user_id = me.uid AND c.removed_at IS NULL) AS headline,
         (SELECT c.published_at FROM coach_profiles c, me WHERE c.user_id = me.uid AND c.removed_at IS NULL) AS profilePublishedAt,
         EXISTS (SELECT 1 FROM coach_profiles c, me WHERE c.user_id = me.uid AND c.removed_at IS NOT NULL)   AS profileRemoved,

         u.disabled_at IS NULL          AS enabled,
         u.role IN ('coach','admin')    AS roleOk,
         u.created_at + (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish') AS eligibleAt,
         u.created_at <= unixepoch()
           - (SELECT value FROM public_policy WHERE key = 'min_account_age_s_to_publish')            AS oldEnough,

         (SELECT v.version  FROM guidelines_versions v WHERE v.active = 1) AS activeGuidelinesVersion,
         (SELECT v.i18n_key FROM guidelines_versions v WHERE v.active = 1) AS activeGuidelinesI18nKey,
         (SELECT a.accepted_at FROM guidelines_acceptances a, me
            JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
           WHERE a.user_id = me.uid)                                       AS guidelinesAcceptedAt,

         (SELECT value FROM public_policy WHERE key = 'post_publish_daily_max') AS postPublishDailyMax,
         (SELECT COUNT(*) FROM coach_posts q, me
           WHERE q.author_user_id = me.uid AND q.published_at IS NOT NULL
             AND q.published_at > unixepoch() - 86400)                     AS publishedToday,
         -- When the oldest of today's publications falls out of the window, one slot returns. The
         -- client can say WHEN rather than "try again later", which is the difference between a
         -- limit and a wall.
         (SELECT MIN(q.published_at) FROM coach_posts q, me
           WHERE q.author_user_id = me.uid AND q.published_at IS NOT NULL
             AND q.published_at > unixepoch() - 86400)                     AS oldestPublishedAt,

         (SELECT value FROM public_policy WHERE key = 'media_daily_max')   AS mediaDailyMax,
         -- NO deleted_at filter, deliberately: this must count the way trg_post_media_daily_cap_ins
         -- counts, and that trigger counts rows created, not rows surviving. A screen that
         -- subtracted deletions would promise an upload the database then refuses.
         (SELECT COUNT(*) FROM post_media m JOIN coach_posts p ON p.id = m.post_id, me
           WHERE p.author_user_id = me.uid AND m.created_at > unixepoch() - 86400) AS mediaToday,

         unixepoch() AS now
       FROM users u, me WHERE u.id = me.uid`,
      [req.user.id],
    );

    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    res.json({
      profile: row.handle
        ? {
            handle: row.handle,
            displayName: row.displayName,
            headline: row.headline,
            publishedAt: row.profilePublishedAt,
          }
        : null,
      // `profileRemoved` is a moderator's act and it is NOT the same as having no profile. Telling
      // a coach "create your profile" after one was taken down would invite them to try again into
      // a handle they can no longer claim.
      profileRemoved: !!row.profileRemoved,
      standing: {
        enabled: !!row.enabled,
        roleOk: !!row.roleOk,
        oldEnough: !!row.oldEnough,
        eligibleAt: row.eligibleAt,
        guidelinesAcceptedAt: row.guidelinesAcceptedAt,
        activeGuidelinesVersion: row.activeGuidelinesVersion,
        activeGuidelinesI18nKey: row.activeGuidelinesI18nKey,
      },
      quotas: {
        postPublishDailyMax: row.postPublishDailyMax,
        publishedToday: row.publishedToday,
        oldestPublishedAt: row.oldestPublishedAt,
        mediaDailyMax: row.mediaDailyMax,
        mediaToday: row.mediaToday,
      },
      limits: COMPOSE_LIMITS,
      now: row.now,
    });
  }),
);

/* ── POST /compose/guidelines/accept ────────────────────────────────────────────────────────── */

const acceptBody = z
  .object({
    // The client ECHOES the version it displayed; it does not choose it. What gets STORED is
    // derived from `active = 1` inside the statement, so this field can only ever cause a refusal
    // — it can never make the server record consent to a version the coach was not shown.
    version: z.string().regex(/^[0-9.]{3,12}$/),
  })
  .strict();

/**
 * Record that this coach has read the community guidelines now in force.
 *
 * ═══ THIS IS THE ROUTE WITHOUT WHICH NOTHING CAN BE PUBLISHED ══════════════════════════════════
 *
 * `guidelines_versions`, `guidelines_acceptances` and `public_policy` shipped in migration 021 and
 * NOTHING IN src/ HAS EVER TOUCHED THEM — grepped before this file was written, not assumed. Three
 * separate triggers refuse a publication by an account with no acceptance of the active version,
 * so until this route existed the publish gate would have denied every coach in the product, and
 * the failure would have arrived as an opaque `publish_denied` with no way to clear it.
 *
 * ═══ INSERT OR IGNORE, NEVER OR REPLACE ════════════════════════════════════════════════════════
 *
 * The table is append-only and a trigger enforces it. A replay must return the ORIGINAL
 * `accepted_at`, because that timestamp is evidence of when somebody agreed to something —
 * rewriting it on a double-click would move a legal fact to suit a UI event.
 */
router.post(
  '/compose/guidelines/accept',
  requireAuth,
  requireCoach,
  composeWriteIpLimiter,
  composeWriteAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = acceptBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    const [active] = await db.all(`SELECT version, i18n_key AS i18nKey FROM guidelines_versions WHERE active = 1`);
    // No active version is a server misconfiguration, not something the coach did wrong. It must
    // not read as a validation failure, because there is nothing they could change to fix it.
    if (!active) return sendError(res, 500, ERR.INTERNAL, 'internal error');

    if (parsed.data.version !== active.version) {
      // The guidelines changed while the page was open. Answer with the version now in force so the
      // client can re-render the text before asking again — consent to text nobody displayed is not
      // consent.
      return res.status(409).json({
        error: 'conflict',
        code: ERR.CONFLICT,
        reason: 'stale_version',
        activeVersion: active.version,
        activeI18nKey: active.i18nKey,
        requestId: res.locals.requestId,
      });
    }

    // ONE call, ONE statement. The natural primary key (user_id, version) is the idempotency key —
    // no separate keys table, which is the form 010 and 019 both explicitly refuse.
    await db.run(
      `INSERT OR IGNORE INTO guidelines_acceptances (user_id, version)
       SELECT ?, version FROM guidelines_versions WHERE active = 1`,
      [req.user.id],
    );

    const [saved] = await db.all(
      `SELECT a.version, a.accepted_at AS acceptedAt
         FROM guidelines_acceptances a
         JOIN guidelines_versions v ON v.version = a.version AND v.active = 1
        WHERE a.user_id = ?`,
      [req.user.id],
    );

    res.json({ version: saved.version, acceptedAt: saved.acceptedAt });
  }),
);


/**
 * A cursor arrives opaque and is used as an integer keyset internally — the same shape the public
 * feed uses, and deliberately the same helper. A manage list that handed back raw row ids would be
 * the leak the public side has already been fixed for.
 */
const cursorId = (raw) => {
  if (raw === undefined) return null;
  const parts = decodeCursor(raw);
  const n = Array.isArray(parts) ? parts[0] : null;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ── the coach's own profile ─────────────────────────────────────────────────────────────────── */

/**
 * Translate a worker outcome into an HTTP answer.
 *
 * ONE mapping for all five profile routes. Written out at each of them, the routes would
 * eventually disagree about whether a missing profile is a 404 or a 409, and the reason a coach
 * cannot publish would be phrased two ways on two screens.
 *
 * The shape of a refusal a caller can ACT ON is a 409 with a snake_case `reason`, which the client
 * maps to a translated sentence. No trigger message ever reaches a person: every RAISE string in
 * 021 is snake_case precisely so `http.js` can withhold all of them, and each one a coach can
 * actually hit is pre-checked in the transaction so it arrives as this instead.
 */
const PROFILE_OUTCOMES = {
  missing: { status: 404, code: ERR.NOT_FOUND },
  not_a_coach: { status: 403, code: ERR.FORBIDDEN },
  account_disabled: { status: 403, code: ERR.FORBIDDEN },
  session_stale: { status: 401, code: ERR.UNAUTHORIZED },
  profile_exists: { status: 409, code: ERR.CONFLICT },
  handle_unavailable: { status: 409, code: ERR.CONFLICT },
  city_unknown: { status: 409, code: ERR.CONFLICT },
  specialty_unknown: { status: 409, code: ERR.CONFLICT },
  needs_guidelines: { status: 409, code: ERR.CONFLICT },
  too_new: { status: 409, code: ERR.CONFLICT },
};

const sendOutcome = (res, result) => {
  const map = PROFILE_OUTCOMES[result.outcome];
  if (!map) return sendError(res, 500, ERR.INTERNAL, 'internal error');
  if (map.status === 404) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
  if (map.status === 403) return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  if (map.status === 401) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
  // A 409 carries the facts the coach needs to fix it — which version to accept, when they become
  // eligible, which key was not recognised. `outcome` is the reason; everything else is context.
  const { outcome, ...facts } = result;
  return res.status(map.status).json({
    error: 'conflict',
    code: map.code,
    reason: outcome,
    ...facts,
    requestId: res.locals.requestId,
  });
};

/**
 * Turn a markdown failure into something the composer can render.
 *
 * `MarkdownError` carries a snake_case reason and it is the ONE error class the body pipeline
 * throws, so a 400 from here always names what was wrong with the text rather than saying
 * "validation_error" about a field the coach can see is fine.
 */
const sendBodyError = (res, err) => {
  if (!(err instanceof MarkdownError)) throw err;
  return res.status(400).json({
    error: 'invalid body',
    code: ERR.VALIDATION,
    // MarkdownError carries its reason on .code, not .reason. Reading the wrong field made every
    // body failure arrive as a generic invalid_body — losing precisely the information the class
    // exists to carry, and silently, because the status was right.
    reason: err.code ?? 'invalid_body',
    requestId: res.locals.requestId,
  });
};

const specialtyList = z.array(z.string().regex(SPECIALTY_KEY_RE)).max(COMPOSE_LIMITS.specialtyMax);

const profileCreateBody = z
  .object({
    handle: z.string().regex(HANDLE_RE),
    display_name: displayText(COMPOSE_LIMITS.displayNameMin, COMPOSE_LIMITS.displayNameMax),
    headline: displayText(2, COMPOSE_LIMITS.headlineMax).nullable(),
    bio_src: z.string().max(BIO_BODY.maxChars * 8).nullable(),
    city_key: z.string().regex(CITY_KEY_RE).nullable(),
    specialties: specialtyList,
  })
  .strict()
  // `.strict()` comes FIRST because check-routes matches /^\}\)\s*\.strict\(\)/ on the text right
  // after the closing brace — `.refine().strict()` is invisible to it and fails the build.
  //
  // Duplicates are refused here rather than at the primary key: ['strength','strength'] would
  // otherwise reach PRIMARY KEY (user_id, specialty_key) as an opaque 400.
  .refine((v) => new Set(v.specialties).size === v.specialties.length, 'duplicate specialty');

/*
 * WHAT IS ABSENT FROM THESE SCHEMAS IS THE CONTROL.
 *
 * `verified_at`, `verified_by`, `published_at`, `listed_at`, `removed_at`, `removed_by`,
 * `removal_reason`, `user_id` and `created_at` never appear, so `.strict()` REJECTS each of them as
 * an unknown key rather than ignoring it. A forged body asking to be verified gets a 400 naming
 * the field, and the badge stays what the schema says it is: something only an admin can grant.
 */
const profileUpdateBody = z
  .object({
    display_name: displayText(COMPOSE_LIMITS.displayNameMin, COMPOSE_LIMITS.displayNameMax),
    headline: displayText(2, COMPOSE_LIMITS.headlineMax).nullable(),
    bio_src: z.string().max(BIO_BODY.maxChars * 8).nullable(),
    city_key: z.string().regex(CITY_KEY_RE).nullable(),
    specialties: specialtyList,
  })
  .strict()
  // The handle is ABSENT. Renaming is its own route with its own cooldown, because it is the only
  // profile field whose change takes something away from other people.
  .refine((v) => new Set(v.specialties).size === v.specialties.length, 'duplicate specialty');

const emptyBody = z.object({}).strict();

/**
 * The coach's own profile, including the markdown source no public read returns.
 *
 * A REMOVED profile is returned, with `removedAt` set. It is the coach's own row, and hiding it
 * produces a support ticket rather than security — they need to see that it was taken down, which
 * is exactly the distinction `removed_at` exists to keep separate from `deleted_at`.
 */
router.get(
  '/compose/profile',
  requireAuth,
  requireCoach,
  composeReadLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyQuery.safeParse(req.query).success) return sendError(res, 400, ERR.VALIDATION);

    const [profile] = await db.all(
      `SELECT c.handle, c.display_name AS displayName, c.headline, c.bio_src AS bioSrc,
              c.bio_doc AS bioDoc, c.doc_version AS docVersion, c.city_key AS city,
              c.published_at AS publishedAt, c.listed_at AS listedAt, c.removed_at AS removedAt,
              c.handle_renamed_at AS handleRenamedAt,
              CASE WHEN c.verified_at IS NULL THEN 0 ELSE 1 END AS verified
         FROM coach_profiles c WHERE c.user_id = ?`,
      [req.user.id],
    );

    // No profile is a STATE, not a miss — the composer renders a create form from it.
    if (!profile) return res.json({ profile: null, specialties: [] });

    const specialties = await db.all(
      'SELECT specialty_key AS key FROM coach_profile_specialties WHERE user_id = ? ORDER BY specialty_key',
      [req.user.id],
    );
    res.json({
      profile: { ...profile, doc: profile.bioDoc ? JSON.parse(profile.bioDoc) : null },
      specialties: specialties.map((s) => s.key),
    });
  }),
);

router.post(
  '/compose/profile',
  requireAuth,
  requireCoach,
  composeWriteIpLimiter,
  composeWriteAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = profileCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    let bio;
    try {
      // ONE parse, on the main thread, before the worker is called. The worker receives opaque
      // values and never parses — a second producer would be a second answer to "what is the doc
      // for this source", and CPU work on the SQL thread besides.
      bio = buildBio(parsed.data.bio_src);
    } catch (err) {
      return sendBodyError(res, err);
    }

    const result = await db.createCoachProfile({
      userId: req.user.id,
      handle: parsed.data.handle,
      displayName: parsed.data.display_name,
      headline: parsed.data.headline,
      bio,
      city: parsed.data.city_key,
      specialties: parsed.data.specialties,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendOutcome(res, result);
    res.status(result.replayed ? 200 : 201).json({ profile: result, replayed: result.replayed });
  }),
);

router.put(
  '/compose/profile',
  requireAuth,
  requireCoach,
  composeWriteIpLimiter,
  composeWriteAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = profileUpdateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    let bio;
    try {
      bio = buildBio(parsed.data.bio_src);
    } catch (err) {
      return sendBodyError(res, err);
    }

    const result = await db.updateCoachProfile({
      userId: req.user.id,
      displayName: parsed.data.display_name,
      headline: parsed.data.headline,
      bio,
      city: parsed.data.city_key,
      specialties: parsed.data.specialties,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendOutcome(res, result);
    res.json({ profile: result });
  }),
);

/**
 * Publish and unpublish are SEPARATE routes, not one endpoint taking a boolean.
 *
 * They are not symmetric: publish carries a standing gate and unpublish carries none, publish
 * writes `listed_at` and unpublish leaves it alone, and only unpublish reports how many posts it
 * took dark. A shared handler would be correct for exactly one of the two and would have to branch
 * on the flag for everything that matters.
 */
router.post(
  '/compose/profile/publish',
  requireAuth,
  requireCoach,
  publishIpLimiter,
  publishAccountLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.publishCoachProfile({
      userId: req.user.id,
      // The token's session version, re-checked against the database inside the transaction.
      // requireAuth caches it for 30 seconds, which is nothing for a read and everything for the
      // one write that puts a name on the open internet.
      tokenSv: req.user.sv ?? null,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendOutcome(res, result);
    res.json({ profile: result, replayed: result.replayed });
  }),
);

router.post(
  '/compose/profile/unpublish',
  requireAuth,
  requireCoach,
  publishIpLimiter,
  publishAccountLimiter,
  asyncRoute(async (req, res) => {
    if (!emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.unpublishCoachProfile({
      userId: req.user.id,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendOutcome(res, result);
    // The count is the point of the answer: PUBLIC_POST requires a live profile, so unpublishing
    // takes the whole back catalogue dark on the next read, with no sweep anywhere to watch.
    res.json({ profile: result, replayed: result.replayed, postsWentDark: result.postsWentDark });
  }),
);


/* ── posts ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * The post outcome map. Same shape as the profile one, extended with the states only a post has.
 *
 * `quota_reached` is a 409, NOT a 429. It is a business rule, and every 429 in this product comes
 * from express-rate-limit — conflating them would make a daily allowance look like throttling and
 * send the client into a retry loop against a wall that only opens tomorrow.
 */
const POST_OUTCOMES = {
  missing: { status: 404 },
  not_a_coach: { status: 403 },
  account_disabled: { status: 403 },
  session_stale: { status: 401 },
  profile_required: { status: 409 },
  profile_not_published: { status: 409 },
  needs_guidelines: { status: 409 },
  too_new: { status: 409 },
  quota_reached: { status: 409 },
  kind_unknown: { status: 409 },
  kind_shape: { status: 409 },
  city_unknown: { status: 409 },
  currency_unknown: { status: 409 },
  key_reused: { status: 409 },
  stale: { status: 409 },
  withdrawn: { status: 409 },
};

const sendPostOutcome = (res, result) => {
  const map = POST_OUTCOMES[result.outcome];
  if (!map) return sendError(res, 500, ERR.INTERNAL, 'internal error');
  if (map.status === 404) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
  if (map.status === 403) return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  if (map.status === 401) return sendError(res, 401, ERR.UNAUTHORIZED, 'unauthorized');
  const { outcome, ...facts } = result;
  return res.status(409).json({
    error: 'conflict',
    code: ERR.CONFLICT,
    reason: outcome,
    ...facts,
    requestId: res.locals.requestId,
  });
};

/** The doc is stored as a JSON string and leaves as a tree, parsed HERE so a bad row is a 500. */
const withPostDoc = (post) => (post ? { ...post, doc: post.doc ? JSON.parse(post.doc) : null } : post);

// The colon is EXCLUDED so the server-side `post:${userId}:` prefix cannot be forged from inside a
// client-supplied key.
const clientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const publicIdParam = z.object({ publicId: z.string().regex(PUBLIC_ID_RE) }).strict();

const manageQuery = z
  .object({
    state: z.enum(['all', 'draft', 'live', 'withdrawn', 'removed']).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(24).optional(),
  })
  .strict();

/*
 * The per-kind rules are NOT restated in these schemas. `post_kinds` is a TABLE, and the shape
 * rules are read from the stored row inside the transaction — so adding a kind stays an INSERT
 * rather than a deploy, and the form and the trigger cannot come to disagree.
 *
 * Absent and therefore rejected by `.strict()`: published_at, deleted_at, removed_at, public_id,
 * author_user_id, write_uid, row_version, created_at. Every one of them is server-minted.
 */
const postFields = {
  title: displayText(3, COMPOSE_LIMITS.titleMax),
  body_src: z.string().min(1).max(POST_BODY.maxChars * 8),
  city_key: z.string().regex(CITY_KEY_RE).nullable(),
  // The bounds are the year 2000 and the year 2100: a timestamp outside them is a unit error, not
  // an event.
  event_at: z.number().int().min(946_684_800).max(4_102_444_800).nullable(),
  event_tz: ianaTz(z.string().max(64)).nullable(),
  capacity: z.number().int().min(1).max(100_000).nullable(),
  price_minor: z.number().int().min(0).max(100_000_000).nullable(),
  price_currency: z.string().regex(CURRENCY_RE).nullable(),
};

const postCreateBody = z
  .object({ idempotency_key: clientKey, kind_key: z.string().regex(KIND_KEY_RE), ...postFields })
  .strict()
  // A price with no currency is a number nobody can read, and a currency with no price is nothing.
  .refine((v) => (v.price_minor === null) === (v.price_currency === null), 'price needs a currency')
  // An event time with no zone is ambiguous to anybody reading from another country, and this is a
  // public surface.
  .refine((v) => v.event_at === null || v.event_tz !== null, 'an event time needs a time zone');

const postUpdateBody = z
  .object({
    expected_row_version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    ...postFields,
  })
  .strict()
  // `kind_key` is ABSENT and frozen. That makes trg_post_kind_shape_upd's missing `active = 1`
  // clause unreachable from this surface rather than something to argue about.
  .refine((v) => (v.price_minor === null) === (v.price_currency === null), 'price needs a currency')
  .refine((v) => v.event_at === null || v.event_tz !== null, 'an event time needs a time zone');

/**
 * The coach's own posts, in every state including the ones no public read returns.
 *
 * MUST NOT compose `PUBLIC_POST`. That predicate requires `published_at IS NOT NULL`, so reusing it
 * would return zero drafts — and an empty draft list is indistinguishable from a coach who has not
 * written anything. The bug would report itself as an empty state.
 */
router.get(
  '/compose/posts',
  requireAuth,
  requireCoach,
  composeReadLimiter,
  asyncRoute(async (req, res) => {
    const parsed = manageQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { state = 'all', limit = 12 } = parsed.data;
    const cursor = cursorId(parsed.data.cursor);

    const rows = await db.all(
      `SELECT ${AUTHOR_POST_COLUMNS}, p.id AS _cursor
         FROM coach_posts p
        WHERE ${AUTHOR_POST_ANY}
          AND (? IS NULL OR p.id < ?)
          AND ${POST_STATE_FILTERS[state]}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?`,
      [req.user.id, cursor, cursor, limit],
    );

    res.json({
      posts: rows.map((r) => {
        const { _cursor, ...rest } = r;
        return withPostDoc(rest);
      }),
      nextCursor: rows.length === limit ? encodeCursor([rows.at(-1)._cursor]) : null,
    });
  }),
);

router.post(
  '/compose/posts',
  requireAuth,
  requireCoach,
  composeWriteIpLimiter,
  composeWriteAccountLimiter,
  asyncRoute(async (req, res) => {
    const parsed = postCreateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    let body;
    try {
      body = buildBody(parsed.data.body_src, POST_BODY);
    } catch (err) {
      return sendBodyError(res, err);
    }

    const result = await db.createPost({
      userId: req.user.id,
      kindKey: parsed.data.kind_key,
      title: parsed.data.title,
      body,
      city: parsed.data.city_key,
      eventAt: parsed.data.event_at,
      eventTz: parsed.data.event_tz,
      capacity: parsed.data.capacity,
      priceMinor: parsed.data.price_minor,
      priceCurrency: parsed.data.price_currency,
      idempotencyKey: parsed.data.idempotency_key,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendPostOutcome(res, result);
    res.status(result.replayed ? 200 : 201).json({ post: withPostDoc(result), replayed: result.replayed });
  }),
);

/**
 * One post, as its author sees it.
 *
 * A malformed id answers 404 rather than 400. A 400 on a bad shape plus a 404 on an unknown one is
 * together an oracle for what a valid id looks like, and the shape is the only thing standing
 * between an attacker and enumeration.
 *
 * A REMOVED post IS returned, with `removedAt` set, so an appeal is possible. `removal_reason` is
 * not: a moderator's note is written for the queue, and handing it back verbatim turns an internal
 * record into a message nobody chose to send.
 */
router.get(
  '/compose/posts/:publicId',
  requireAuth,
  requireCoach,
  composeReadLimiter,
  asyncRoute(async (req, res) => {
    const parsed = publicIdParam.safeParse(req.params);
    if (!parsed.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const [post] = await db.all(
      `SELECT ${AUTHOR_POST_COLUMNS} FROM coach_posts p
        WHERE p.public_id = ? AND ${AUTHOR_POST_ANY}`,
      [parsed.data.publicId, req.user.id],
    );
    if (!post) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ post: withPostDoc(post) });
  }),
);

router.put(
  '/compose/posts/:publicId',
  requireAuth,
  requireCoach,
  composeWriteIpLimiter,
  composeWriteAccountLimiter,
  asyncRoute(async (req, res) => {
    const id = publicIdParam.safeParse(req.params);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    const parsed = postUpdateBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);

    let body;
    try {
      body = buildBody(parsed.data.body_src, POST_BODY);
    } catch (err) {
      return sendBodyError(res, err);
    }

    const result = await db.updatePost({
      userId: req.user.id,
      publicId: id.data.publicId,
      expectedRowVersion: parsed.data.expected_row_version,
      title: parsed.data.title,
      body,
      city: parsed.data.city_key,
      eventAt: parsed.data.event_at,
      eventTz: parsed.data.event_tz,
      capacity: parsed.data.capacity,
      priceMinor: parsed.data.price_minor,
      priceCurrency: parsed.data.price_currency,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    // A stale save carries the CURRENT row, which the client can show beside the draft the coach
    // still has in front of them. A bare 409 would leave them with two texts and no way to tell
    // which one the server holds.
    if (result.outcome === 'stale') {
      return res.status(409).json({
        error: 'conflict',
        code: ERR.CONFLICT,
        reason: 'stale',
        post: withPostDoc(result.post),
        requestId: res.locals.requestId,
      });
    }
    if (result.outcome !== 'applied') return sendPostOutcome(res, result);
    res.json({ post: withPostDoc(result) });
  }),
);

router.post(
  '/compose/posts/:publicId/publish',
  requireAuth,
  requireCoach,
  publishIpLimiter,
  publishAccountLimiter,
  asyncRoute(async (req, res) => {
    const id = publicIdParam.safeParse(req.params);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (!emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.publishPost({
      userId: req.user.id,
      publicId: id.data.publicId,
      tokenSv: req.user.sv ?? null,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendPostOutcome(res, result);
    res.json({ post: withPostDoc(result), replayed: result.replayed });
  }),
);

/**
 * Withdraw and restore. There is NO unpublish for a post.
 *
 * `published_at` is write-once, so a restored post returns at its ORIGINAL feed position and spends
 * no quota. That is the anti-bump property doing its job: withdrawing and restoring cannot be used
 * to climb the feed, and the coach loses nothing by taking something down for a day.
 */
router.post(
  '/compose/posts/:publicId/withdraw',
  requireAuth,
  requireCoach,
  composeWriteIpLimiter,
  composeWriteAccountLimiter,
  asyncRoute(async (req, res) => {
    const id = publicIdParam.safeParse(req.params);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (!emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.withdrawPost({
      userId: req.user.id,
      publicId: id.data.publicId,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendPostOutcome(res, result);
    res.json({ post: withPostDoc(result), replayed: result.replayed });
  }),
);

router.post(
  '/compose/posts/:publicId/restore',
  requireAuth,
  requireCoach,
  publishIpLimiter,
  publishAccountLimiter,
  asyncRoute(async (req, res) => {
    const id = publicIdParam.safeParse(req.params);
    if (!id.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    if (!emptyBody.safeParse(req.body ?? {}).success) return sendError(res, 400, ERR.VALIDATION);

    const result = await db.restorePost({
      userId: req.user.id,
      publicId: id.data.publicId,
      tokenSv: req.user.sv ?? null,
      requestId: res.locals.requestId,
      ip: req.ip ?? null,
    });

    if (result.outcome !== 'applied') return sendPostOutcome(res, result);
    res.json({ post: withPostDoc(result), replayed: result.replayed });
  }),
);

export default router;
