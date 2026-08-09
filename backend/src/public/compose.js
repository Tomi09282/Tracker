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
import { buildBio, BIO_BODY, POST_BODY, COMPOSE_JSON_LIMIT } from './body.js';
import { displayText } from './text.js';
import { HANDLE_RE, CITY_KEY_RE, SPECIALTY_KEY_RE } from './shapes.js';

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

export default router;
