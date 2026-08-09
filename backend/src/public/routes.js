// src/public/routes.js — the reads an anonymous visitor may make. The widest surface here.
//
// ═══ THIS ROUTER NEVER READS `req.user` ════════════════════════════════════════════════════════
//
// Not "does not need to" — MUST NOT. Every response is a pure function of the database, so the
// same request produces the same bytes for everybody, and there is no cache-correctness question,
// no `Vary: Cookie`, no block oracle, no two query shapes to keep in step. `verify:public` greps
// this file for `req.user` and fails if it appears.
//
// That property is what cutting comments bought, and it is why the cut was worth more than the
// feature: all four FATAL defects in the review lived in a subsystem whose reads had to know who
// was asking.
//
// ═══ WHAT NEVER LEAVES THIS FILE ═══════════════════════════════════════════════════════════════
//
// No integer id, no email, no user id. A post is addressed by its 12-character `public_id` and a
// coach by their handle. An enumerable id plus a public profile endpoint is a directory of every
// account in the product — the defect that killed the 019 marketplace on a narrower surface.
//
// The markdown SOURCE never leaves either. The public reads `body_doc`, the closed node tree;
// `body_src` goes only to its author, on the edit form.
//
// ═══ AND THE RATE TIER IS ITS OWN ══════════════════════════════════════════════════════════════
//
// A public limiter cannot key on an account, because there is no account. It keys on the IP alone,
// which is weaker — so the limits are lower and the page sizes are hard-capped, because "how much
// can one stranger take per minute" is the only lever left.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { toFtsQuery } from '../lib/normalize.js';
import { resolveStoredPath } from '../lib/media.js';
import { encodeCursor, decodeCursor } from '../lib/cursor.js';
import {
  PUBLIC_POST,
  PUBLIC_PROFILE,
  PUBLIC_POST_COLUMNS,
  PUBLIC_PROFILE_COLUMNS,
  POST_SORTS,
  PROFILE_SORTS,
} from './visibility.js';

const router = Router();

/**
 * The public tier. Lower than anything behind auth, because it cannot key on an account.
 *
 * 240 per 15 minutes is a person browsing hard; it is not a scraper walking a catalogue. The page
 * cap below matters more than this number: a limiter bounds requests, a page cap bounds what one
 * request can be worth.
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/* ── validation ─────────────────────────────────────────────────────────────────────────────── */

/** 12 characters of [A-Za-z0-9_-] — 72 bits, which is not a space anybody walks. */
const publicId = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
const handle = z.string().regex(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/);

const feedQuery = z
  .object({
    // The vocabulary lives in `post_kinds`; this bounds the SHAPE and the database decides the
    // rest, so adding a kind stays an INSERT.
    kind: z.string().regex(/^[a-z][a-z_]{1,30}$/).optional(),
    city: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/).optional(),
    // A CLOSED MAP, never a column name from a query string.
    sort: z.enum(['recent', 'soonest']).optional(),
    // KEYSET, not offset: an offset over a table people insert into skips rows as it pages.
    // OPAQUE, because the keyset value is an internal row id and this endpoint is anonymous.
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(24).optional(),
  })
  .strict();

const searchQuery = z
  .object({
    q: z.string().trim().min(2).max(80),
    city: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/).optional(),
    limit: z.coerce.number().int().min(1).max(24).optional(),
  })
  .strict();

const directoryQuery = z
  .object({
    city: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/).optional(),
    sort: z.enum(['recommended', 'recent']).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(24).optional(),
  })
  .strict();

/**
 * A cursor arrives opaque and is used as an integer keyset internally.
 *
 * ═══ WHY IT IS ENCODED AT ALL ══════════════════════════════════════════════════════════════════
 *
 * It was not. The feed handed back `p.id` and the directory handed back `c.user_id`, and the
 * comment above the feed's cursor claimed it "names no account" — true of the feed, false of the
 * directory, in the same file. `PUBLIC_PROFILE_COLUMNS` omits `user_id` precisely so an anonymous
 * reader cannot collect account ids, and the cursor put them back one page at a time.
 *
 * The post cursor is the milder half of the same mistake: `public_id` is a 12-character opaque
 * handle exactly so the rowid is not an address, and verify-021 asserts that a post is "addressed
 * by a 12-char opaque public_id, never its rowid" — while the endpoint returned the rowid.
 *
 * `src/lib/cursor.js` already existed, already did this, and was already used by the exercise
 * routes. Nothing new was written here; the ninth instance of this project's second defect class
 * is once again a convention that existed and was not reached for.
 */
const cursorId = (raw) => {
  if (raw === undefined) return null;
  const parts = decodeCursor(raw);
  const n = Array.isArray(parts) ? parts[0] : null;
  // A cursor that does not decode is not an error — it is a stale link or a truncated copy-paste,
  // and starting from the top is the answer a reader can actually use.
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * The doc arrives from the database as a JSON string and leaves as a parsed tree.
 *
 * PARSED HERE RATHER THAN BY THE CLIENT, so a row whose JSON is somehow malformed produces a
 * missing post rather than a client-side exception that blanks the whole feed for every visitor.
 * The column has `json_valid()` on it, so this should be unreachable — "should be" is why it
 * returns null instead of throwing.
 */
const withDoc = (row) => {
  if (!row) return row;
  let doc = null;
  try {
    doc = JSON.parse(row.doc ?? row.bioDoc ?? 'null');
  } catch {
    doc = null;
  }
  const { doc: _d, bioDoc: _b, ...rest } = row;
  return { ...rest, doc };
};

/* ── the feed ───────────────────────────────────────────────────────────────────────────────── */

/**
 * The latest, optionally by city or kind.
 *
 * ONE STATEMENT, ONE PREDICATE. The filters are `(? IS NULL OR col = ?)` rather than an assembled
 * WHERE, so there is no string built from request keys and the plan is stable.
 */
router.get(
  '/public/posts',
  publicLimiter,
  asyncRoute(async (req, res) => {
    const parsed = feedQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { kind, city, sort = 'recent', limit = 12 } = parsed.data;
    const cursor = cursorId(parsed.data.cursor);

    // The sort fragment comes from a CLOSED MAP keyed by an enum zod already validated. There is
    // no path by which a query string becomes SQL.
    const order = POST_SORTS[sort];

    const rows = await db.all(
      `SELECT ${PUBLIC_POST_COLUMNS}, p.id AS _cursor
         FROM coach_posts p
         JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE ${PUBLIC_POST}
          AND (? IS NULL OR p.kind_key = ?)
          AND (? IS NULL OR p.city_key = ?)
          AND (? IS NULL OR p.id < ?)
          ${sort === 'soonest' ? 'AND p.event_at IS NOT NULL AND p.event_at >= unixepoch()' : ''}
        ORDER BY ${order}
        LIMIT ?`,
      [kind ?? null, kind ?? null, city ?? null, city ?? null, cursor ?? null, cursor ?? null, limit],
    );

    const posts = rows.map((r) => {
      const { _cursor, ...rest } = r;
      return withDoc(rest);
    });
    res.json({
      posts,
      // Encoded, so the internal row id never crosses the boundary. The client echoes the value
      // back and never reads it, which is what makes the change invisible to it.
      nextCursor: rows.length === limit ? encodeCursor([rows.at(-1)._cursor]) : null,
    });
  }),
);

/** One post, addressed by its opaque public id. */
router.get(
  '/public/posts/:publicId',
  publicLimiter,
  asyncRoute(async (req, res) => {
    const p = z.object({ publicId }).strict().safeParse(req.params);
    if (!p.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const row = await db.get(
      `SELECT ${PUBLIC_POST_COLUMNS}
         FROM coach_posts p
         JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE p.public_id = ? AND ${PUBLIC_POST}`,
      [p.data.publicId],
    );
    // A draft, a removed post and one that never existed are ONE answer. Anything else makes the
    // endpoint an oracle for the existence of unpublished content.
    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const media = await db.all(
      `SELECT m.role_key AS role, m.storage_key AS storageKey, m.thumb_key AS thumbKey,
              m.width, m.height, m.alt
         FROM post_media m
         JOIN coach_posts p ON p.id = m.post_id
         JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE p.public_id = ? AND m.deleted_at IS NULL AND ${PUBLIC_POST}
        ORDER BY m.sort_order, m.id`,
      [p.data.publicId],
    );

    res.json({ post: withDoc(row), media });
  }),
);

/* ── the directory and one profile ──────────────────────────────────────────────────────────── */

router.get(
  '/public/coaches',
  publicLimiter,
  asyncRoute(async (req, res) => {
    const parsed = directoryQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { city, sort = 'recommended', limit = 12 } = parsed.data;
    const cursor = cursorId(parsed.data.cursor);

    const rows = await db.all(
      `SELECT ${PUBLIC_PROFILE_COLUMNS}, c.user_id AS _cursor
         FROM coach_profiles c
        WHERE ${PUBLIC_PROFILE}
          AND (? IS NULL OR c.city_key = ?)
          AND (? IS NULL OR c.user_id < ?)
        ORDER BY ${PROFILE_SORTS[sort]}
        LIMIT ?`,
      [city ?? null, city ?? null, cursor ?? null, cursor ?? null, limit],
    );

    res.json({
      coaches: rows.map((r) => {
        const { _cursor, ...rest } = r;
        return withDoc(rest);
      }),
      // This one carried users.id. See cursorId above.
      nextCursor: rows.length === limit ? encodeCursor([rows.at(-1)._cursor]) : null,
    });
  }),
);

router.get(
  '/public/coaches/:handle',
  publicLimiter,
  asyncRoute(async (req, res) => {
    const p = z.object({ handle }).strict().safeParse(req.params);
    if (!p.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const coach = await db.get(
      `SELECT ${PUBLIC_PROFILE_COLUMNS} FROM coach_profiles c
        WHERE c.handle = ? AND ${PUBLIC_PROFILE}`,
      [p.data.handle],
    );
    if (!coach) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const specialties = await db.all(
      `SELECT s.key, s.i18n_key AS i18nKey
         FROM coach_profile_specialties ps
         JOIN coach_specialties s ON s.key = ps.specialty_key
         JOIN coach_profiles c ON c.user_id = ps.user_id
        WHERE c.handle = ? AND ${PUBLIC_PROFILE}
        ORDER BY s.sort_order`,
      [p.data.handle],
    );

    const posts = await db.all(
      `SELECT ${PUBLIC_POST_COLUMNS}
         FROM coach_posts p
         JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE c.handle = ? AND ${PUBLIC_POST}
        ORDER BY p.published_at DESC, p.id DESC
        LIMIT 24`,
      [p.data.handle],
    );

    res.json({ coach: withDoc(coach), specialties, posts: posts.map(withDoc) });
  }),
);

/* ── search ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Full text over titles and bodies.
 *
 * `toFtsQuery` rather than a hand-rolled escape — the same function the exercise and food searches
 * use. FTS5 MATCH is its own expression language, and this is the fourth place in the product
 * where writing a second escaper would have been the obvious move.
 *
 * NO CURSOR. Search is capped at one page, deliberately: a paginated public search over every post
 * in the product is a scraping API with a nice interface, and the value of page 3 of a text search
 * to a person is close to zero.
 */
router.get(
  '/public/search',
  publicLimiter,
  asyncRoute(async (req, res) => {
    const parsed = searchQuery.safeParse(req.query);
    if (!parsed.success) return sendError(res, 400, ERR.VALIDATION);
    const { q, city, limit = 12 } = parsed.data;

    const fts = toFtsQuery(q);
    if (!fts) return res.json({ posts: [] });

    const rows = await db.all(
      `SELECT ${PUBLIC_POST_COLUMNS}
         FROM coach_posts_fts f
         JOIN coach_posts p ON p.id = f.rowid
         JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE coach_posts_fts MATCH ?
          AND ${PUBLIC_POST}
          AND (? IS NULL OR p.city_key = ?)
        ORDER BY rank
        LIMIT ?`,
      [fts, city ?? null, city ?? null, limit],
    );

    res.json({ posts: rows.map(withDoc) });
  }),
);

/* ── media ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Serve a post image.
 *
 * THE KEY IS NOT THE PERMISSION — the same rule as chat attachments and progress photos, and the
 * third time this file's family has had to say it. A storage key is unguessable and NOT private:
 * it appears in a page source, a browser history, a proxy log and every "copy image address".
 *
 * So the read carries the SAME `PUBLIC_POST` predicate the feed does. A key belonging to a draft,
 * to a removed post, or to a post whose author was removed is as invisible as one that never
 * existed — which is what makes "remove this coach" actually remove their pictures, on the next
 * request, with no sweep to be behind.
 *
 * The key regex is checked BEFORE the database and long before the filesystem, so path traversal
 * is unreachable rather than guarded against.
 */
router.get(
  '/public/media/:key',
  publicLimiter,
  asyncRoute(async (req, res) => {
    // `pub_` + 32 hex + `.webp`, exactly 41 characters. The shape is a fact about the bytes: every
    // stored file was re-encoded by the ingest, so the extension is not a claim anybody made.
    const key = z
      .string()
      .regex(/^pub_[a-f0-9]{32}\.webp$/)
      .safeParse(req.params.key);
    if (!key.success) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const row = await db.get(
      `SELECT m.storage_key AS storageKey, m.bytes
         FROM post_media m
         JOIN coach_posts p ON p.id = m.post_id
         JOIN coach_profiles c ON c.user_id = p.author_user_id
        WHERE (m.storage_key = ? OR m.thumb_key = ?)
          AND m.deleted_at IS NULL
          AND ${PUBLIC_POST}`,
      [key.data, key.data],
    );
    if (!row) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // PUBLIC and cacheable, which is only safe because the predicate binds no viewer: the same URL
    // is the same bytes for everybody, so there is no `Vary` question and no way for one reader's
    // response to reach another. An immutable key means the cache never needs to revalidate.
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    // A stream with no 'error' listener throws an UNCAUGHT EXCEPTION when the file is missing,
    // and it sits outside asyncRoute's promise chain, so the process restarts instead of the
    // reader getting a 404. Nothing could create such a row before the composer; something can now.
    // The handled form already ships in exercises/media.js — this is that, not a new idea.
    // The PUBLIC namespace, which is a different directory. 021 asked for this and nothing
    // implemented it: a flat MEDIA_DIR holds exercise media, chat attachments and progress
    // photos, and a public route joining onto it is safe only while two key regexes happen not
    // to overlap. Disjoint namespaces make a progress photo unreachable from here rather than
    // merely unmatched.
    const full = resolveStoredPath(key.data, 'public');
    if (!full) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) sendError(res, 404, ERR.NOT_FOUND, 'not found');
    });
  }),
);

/* ── the vocabularies a client renders from ─────────────────────────────────────────────────── */

/**
 * Cities, kinds and specialties, so the filter UI does not carry its own copy.
 *
 * Public because the discovery screen renders before anyone signs in, and because none of it is
 * secret — it is the same list the filters offer.
 */
router.get(
  '/public/taxonomy',
  publicLimiter,
  asyncRoute(async (_req, res) => {
    const [cities, kinds, specialties, currencies] = await Promise.all([
      db.all(`SELECT key, country_code AS country, name_native AS name FROM public_cities ORDER BY sort_order, key`),
      db.all(
        `SELECT key, requires_event_at AS requiresEventAt, allows_capacity AS allowsCapacity,
                allows_price AS allowsPrice
           FROM post_kinds ORDER BY sort_order, key`,
      ),
      db.all(`SELECT key, i18n_key AS i18nKey FROM coach_specialties WHERE active = 1 ORDER BY sort_order, key`),
      db.all(`SELECT code, minor_units AS minorUnits FROM public_currencies WHERE active = 1 ORDER BY code`),
    ]);
    res.json({ cities, kinds, specialties, currencies });
  }),
);

export default router;
