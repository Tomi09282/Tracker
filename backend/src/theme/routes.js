// src/theme/routes.js — per-user theme preferences and the global element-style config.
import { Router } from 'express';
import { z } from 'zod';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { checkAccent, AA_NORMAL } from '../lib/contrast.js';
import rateLimit from 'express-rate-limit';

const router = Router();

/**
 * Theme writes are cheap, but "cheap" is not "free" and an unbounded write is a write amplifier
 * for anyone holding a stolen session. Found by the T2.10.4 route audit, which listed every
 * non-GET route with no limiter rather than relying on anyone remembering.
 */
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const HEX = /^#[0-9A-Fa-f]{6}$/;
/**
 * THE PACK VOCABULARY IS A TABLE, NOT A LIST IN THIS FILE.
 *
 * It used to be `['midnight', 'solar', 'forest', 'neon', 'mono']` here and a CHECK in migration
 * 002 — two copies, and migration 019 needed a sixth. The regex below bounds the SHAPE only; which
 * packs exist, whether one is active and whether the caller may wear it are all decided by the
 * database, in one statement, at write time.
 */
const PACK_KEY = /^[a-z][a-z0-9_]{1,31}$/;

const GradientSchema = z
  .object({
    type: z.enum(['linear', 'radial']),
    angle: z.number().int().min(0).max(360),
    // Two stops minimum is what makes it a gradient; six is a practical ceiling that also
    // bounds the stored blob so a forged request cannot post a megabyte of stops.
    stops: z
      .array(
        z
          .object({
            color: z.string().regex(HEX),
            position: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();

const ThemeSchema = z
  .object({
    pack: z.string().regex(PACK_KEY),
    accent: z.string().regex(HEX).nullable(),
    gradient: GradientSchema.nullable(),
  })
  .strict();

router.get(
  '/me/theme',
  requireAuth,
  asyncRoute(async (req, res) => {
    const row = await db.get(
      'SELECT pack, accent, gradient FROM user_theme_prefs WHERE user_id = ?',
      [req.user.id],
    );
    // The roster travels with the preference so the client does not carry its own copy of the
    // surfaces either — the same second-copy this commit deleted from contrast.js. `locked` is
    // UX for greying the picker; trg_theme_pack_entitled_* is the control.
    const packs = await db.all(
      `SELECT t.key, t.label, t.surface_hex AS surfaceHex,
              CASE WHEN t.entitlement_key IS NULL THEN 0
                   WHEN EXISTS (SELECT 1 FROM coin_entitlements e
                                 WHERE e.user_id = ? AND e.entitlement_key = t.entitlement_key
                                   AND e.revoked_at IS NULL) THEN 0
                   ELSE 1 END AS locked
         FROM theme_packs t
        WHERE t.active = 1
        ORDER BY t.sort_order, t.key`,
      [req.user.id],
    );
    res.json({
      theme: row
        ? { pack: row.pack, accent: row.accent, gradient: row.gradient ? JSON.parse(row.gradient) : null }
        : { pack: 'midnight', accent: null, gradient: null },
      packs,
    });
  }),
);

router.put(
  '/me/theme',
  requireAuth,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const body = ThemeSchema.parse(req.body);

    // The contrast guard again, server-side. The picker enforces it live for the user's sake;
    // this enforces it for the product's sake, because a request can be forged with a proxy.
    //
    // The check is the accent AS TEXT on the chosen pack's darkest surface — links, the active
    // nav item and eyebrow labels are all drawn in the accent directly. Checking only whether
    // black or white reads on the accent would be vacuous: those two curves cross at 4.58, so
    // the better of the pair can never fall below 4.5 for any colour at all.
    if (body.accent) {
      // The surface comes from the pack's own row. A pack that does not exist has no surface, so
      // there is nothing to fall back to and the write below answers 404 — which is strictly
      // better than validating against a guessed background and then refusing for another reason.
      const packRow = await db.get(
        'SELECT surface_hex FROM theme_packs WHERE key = ? AND active = 1',
        [body.pack],
      );
      if (!packRow) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
      const verdict = checkAccent(body.accent, packRow.surface_hex);
      if (!verdict.ok) {
        return sendError(
          res,
          400,
          ERR.VALIDATION,
          `accent is not legible on this theme's background (${verdict.asText.toFixed(2)}:1, needs ${AA_NORMAL}:1)`,
        );
      }
    }

    // The write is scoped to the caller's own row by construction — there is no user_id in the
    // body to forge, and none is accepted (`.strict()` would reject it anyway).
    // ONE STATEMENT, WITH THE ENTITLEMENT GUARD INSIDE ITS OWN SELECT. `changes === 0` IS the
    // 404 — there is no preceding ownership read for a concurrent revocation to slip past.
    //
    // AN UNKNOWN PACK AND AN UNOWNED ONE ANSWER IDENTICALLY, and that is the point: a 403 here
    // would confirm the pack is real, which is enough to enumerate the paid catalogue for free.
    // It is also 404 and not 403 because this is an OBJECT-level miss, and the rule this codebase
    // follows has exactly one exception, which is the admin coin adjustment.
    const wrote = await db.run(
      `INSERT INTO user_theme_prefs (user_id, pack, accent, gradient)
       SELECT ?, t.key, ?, ?
         FROM theme_packs t
        WHERE t.key = ? AND t.active = 1
          AND (t.entitlement_key IS NULL
            OR EXISTS (SELECT 1 FROM coin_entitlements e
                        WHERE e.user_id = ? AND e.entitlement_key = t.entitlement_key
                          AND e.revoked_at IS NULL))
       ON CONFLICT(user_id) DO UPDATE SET pack = excluded.pack,
                                          accent = excluded.accent,
                                          gradient = excluded.gradient`,
      [
        req.user.id,
        body.accent,
        body.gradient ? JSON.stringify(body.gradient) : null,
        body.pack,
        req.user.id,
      ],
    );
    if (wrote.changes === 0) return sendError(res, 404, ERR.NOT_FOUND, 'not found');
    res.json({ ok: true });
  }),
);

// Public: the shell needs the active variants before anyone signs in, and they are not secret.
router.get(
  '/ui/element-styles',
  asyncRoute(async (req, res) => {
    const rows = await db.all('SELECT element_id, variant FROM element_style_config');
    res.json({ styles: Object.fromEntries(rows.map((r) => [r.element_id, r.variant])) });
  }),
);

/**
 * ═══ THE ROSTER HAD FOUR READERS AND TWO OF THEM SAID 26 ═══════════════════════════════════════
 *
 * This used to be `/^E([1-9]|1[0-9]|2[0-6])$/` — an enumeration of which elements exist, written
 * out in a regex. Migration 012 added E27. The database has 27 rows, `catalog.ts` has 27 entries,
 * the fallback map has 27, and this line capped at 26, so **E27 could not be set by anybody**. The
 * smoke suite agreed with the wrong copy: `Array.from({ length: 26 })` against a 27-row table,
 * under an assertion labelled "all 26 seeded".
 *
 * That is the project's most common defect in its purest form — two things that must agree, and the
 * copy that drifted is the one that says NO.
 *
 * So this no longer answers "which elements exist". It answers "is this shaped like an element id",
 * which is the only question a REGEX can keep true. Existence is the database's question, and the
 * route below already asks it: a row that is not there is a 404, whether the id is E27 or E900.
 * One definition, in the table, with every other reader downstream of it.
 */
const ElementIdSchema = z.string().regex(/^E[1-9][0-9]{0,2}$/);
const VariantSchema = z.object({ variant: z.enum(['A', 'B', 'C', 'D', 'E']) }).strict();

router.put(
  '/ui/element-styles/:id',
  requireAuth,
  // ═══ THE ROLE GATE COMES BEFORE THE LIMITER, AND IT USED TO COME AFTER ═════════════════════
  //
  // `writeLimiter` is 120 per 15 minutes PER IP and it is shared with `PUT /me/theme`. With the
  // limiter first, every signed-in non-admin's rejected attempt spent from that budget — so any
  // ordinary user could empty the bucket the admin needs, and their own theme writes with it, by
  // firing 120 requests at an endpoint they were never allowed to call.
  //
  // `requireRole` reads a claim off the already-verified token: no database, no hashing, cheaper
  // than the limiter's own store lookup. There is nothing to protect by putting the limiter first.
  requireRole('admin'),
  writeLimiter,
  asyncRoute(async (req, res) => {
    const id = ElementIdSchema.parse(req.params.id);
    const { variant } = VariantSchema.parse(req.body);

    // Admin actions re-check the role against the database at execution time. The JWT claim is
    // a fast-path hint; a role revoked thirty seconds ago must not still be able to reconfigure
    // the app for every user in the system.
    const actor = await db.get('SELECT role FROM users WHERE id = ? AND disabled_at IS NULL', [
      req.user.id,
    ]);
    if (actor?.role !== 'admin') return sendError(res, 403, ERR.FORBIDDEN, 'forbidden');

    const before = await db.get('SELECT variant FROM element_style_config WHERE element_id = ?', [id]);
    if (!before) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    // The config change and its audit row commit together: an unaudited privileged change is
    // exactly the kind of gap the append-only log exists to close.
    await db.writeTx([
      {
        sql: 'UPDATE element_style_config SET variant = ?, updated_by = ?, updated_at = unixepoch() WHERE element_id = ?',
        params: [variant, req.user.id, id],
      },
      {
        sql: `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id)
              VALUES (?, 'ui.element_style.update', 'element_style_config', NULL, ?, ?)`,
        params: [
          req.user.id,
          JSON.stringify({ elementId: id, from: before.variant, to: variant }),
          res.locals.requestId,
        ],
      },
    ]);

    req.log.info({ elementId: id, from: before.variant, to: variant }, 'element style changed');
    res.json({ ok: true });
  }),
);

export default router;
