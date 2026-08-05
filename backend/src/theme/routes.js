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
const PACKS = ['midnight', 'solar', 'forest', 'neon', 'mono'];

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
    pack: z.enum(PACKS),
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
    res.json({
      theme: row
        ? { pack: row.pack, accent: row.accent, gradient: row.gradient ? JSON.parse(row.gradient) : null }
        : { pack: 'midnight', accent: null, gradient: null },
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
      const verdict = checkAccent(body.accent, body.pack);
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
    await db.run(
      `INSERT INTO user_theme_prefs (user_id, pack, accent, gradient)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET pack = excluded.pack,
                                          accent = excluded.accent,
                                          gradient = excluded.gradient`,
      [req.user.id, body.pack, body.accent, body.gradient ? JSON.stringify(body.gradient) : null],
    );
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

const ElementIdSchema = z.string().regex(/^E([1-9]|1[0-9]|2[0-6])$/);
const VariantSchema = z.object({ variant: z.enum(['A', 'B', 'C', 'D', 'E']) }).strict();

router.put(
  '/ui/element-styles/:id',
  requireAuth,
  writeLimiter,
  requireRole('admin'),
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
