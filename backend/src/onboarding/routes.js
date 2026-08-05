// src/onboarding/routes.js — F11, the first-login questionnaire.
//
// Two readers, one profile: the client fills it in, the coach reads it on the client detail
// screen, and the plan builder will filter exercises by the equipment and limitations in it.
//
// The single rule that shapes this whole file: the profile belongs to the authenticated user and
// the body never says whose it is. There is no `user_id` in any schema below — it comes from the
// session, so there is no field for an attacker to change. The coach's read is the one place a
// profile is fetched for someone else, and it is gated on an active coach↔client link.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { ERR, sendError, asyncRoute } from '../lib/http.js';
import { requireAuth, requireCoach } from '../auth/middleware.js';
import { resolveLang } from '../lib/lang.js';
import { taxonomyList } from '../lib/taxonomy.js';

const router = Router();

// The questionnaire auto-saves, so this endpoint is hit on a debounce as the client types. The
// limit is generous for that reason, and still far below what a script would need to be useful.
const saveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/* ── vocabulary ─────────────────────────────────────────────────────────────────────────── */
// These lists are duplicated from the CHECK constraints in migration 008 on purpose. zod rejects
// a bad value with a 400 and a field name; the CHECK is the backstop that means a bug in this
// file cannot write nonsense into the table. Two independent guards, not one guard written twice.
const GOALS = ['strength', 'muscle', 'fat-loss', 'endurance', 'mobility', 'health', 'sport'];
const EXPERIENCE = ['none', 'beginner', 'intermediate', 'advanced'];
const LOCATIONS = ['gym', 'home', 'outdoor', 'mixed'];
const SEX = ['female', 'male', 'other', 'undisclosed'];
const BODY_AREAS = [
  'neck', 'shoulder', 'elbow', 'wrist', 'upper-back', 'lower-back',
  'hip', 'knee', 'ankle', 'foot', 'chest', 'abdomen', 'other',
];
const SEVERITY = ['past', 'caution', 'avoid'];

const nullableEnum = (values) => z.enum(values).nullable().optional();

// Every numeric bound matches the CHECK. A body outside them is a forged request, not a typo in
// the UI, because the UI's own inputs are bounded to the same range.
const ProfilePatch = z
  .object({
    step: z.number().int().min(0).max(20).optional(),
    primary_goal: nullableEnum(GOALS),
    experience: nullableEnum(EXPERIENCE),
    sessions_per_week: z.number().int().min(1).max(14).nullable().optional(),
    session_minutes: z.number().int().min(10).max(240).nullable().optional(),
    training_location: nullableEnum(LOCATIONS),
    units: z.enum(['metric', 'imperial']).optional(),
    height_cm: z.number().min(90).max(260).nullable().optional(),
    bodyweight_kg: z.number().min(25).max(400).nullable().optional(),
    birth_year: z.number().int().min(1900).max(2100).nullable().optional(),
    sex: nullableEnum(SEX),
    notes: z.string().max(2000).nullable().optional(),
    // Sent whole, not as add/remove deltas: a checkbox grid has no natural delta, and replacing
    // the set means a dropped request cannot leave the client with equipment they unticked.
    equipment: z.array(z.number().int().positive()).max(64).optional(),
    limitations: z
      .array(
        z
          .object({
            body_area: z.enum(BODY_AREAS),
            severity: z.enum(SEVERITY).default('caution'),
            note: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

// Columns this endpoint is allowed to write, as an explicit list. Spreading the request body into
// an UPDATE is how `status` or `completed_at` ends up client-controlled.
const WRITABLE = [
  'step', 'primary_goal', 'experience', 'sessions_per_week', 'session_minutes',
  'training_location', 'units', 'height_cm', 'bodyweight_kg', 'birth_year', 'sex', 'notes',
];

// What "complete" means. Kept here rather than in the UI so that a client posting straight to the
// API cannot declare itself finished with an empty profile — the coach would then see a profile
// that claims to be answered and is not.
const REQUIRED_TO_COMPLETE = ['primary_goal', 'experience', 'sessions_per_week', 'training_location'];

/* ── reading ─────────────────────────────────────────────────────────────────────────────── */

async function loadProfile(userId) {
  const profile = await db.get('SELECT * FROM onboarding_profiles WHERE user_id = ?', [userId]);
  if (!profile) return null;
  const [equipment, limitations] = await Promise.all([
    db.all('SELECT equipment_id FROM onboarding_equipment WHERE user_id = ?', [userId]),
    db.all(
      'SELECT body_area, severity, note FROM onboarding_limitations WHERE user_id = ? ORDER BY body_area',
      [userId],
    ),
  ]);
  return { ...profile, equipment: equipment.map((r) => r.equipment_id), limitations };
}

router.get(
  '/onboarding',
  requireAuth,
  asyncRoute(async (req, res) => {
    const lang = await resolveLang(req);
    // The options travel with the profile. The alternative — the client fetching the taxonomy
    // separately — means a first render with unlabelled checkboxes, which reads as broken.
    const [profile, equipment] = await Promise.all([
      loadProfile(req.user.id),
      taxonomyList('equipment', lang),
    ]);
    res.json({
      lang,
      profile,
      options: { equipment, goals: GOALS, experience: EXPERIENCE, locations: LOCATIONS, sex: SEX, bodyAreas: BODY_AREAS, severity: SEVERITY },
      required: REQUIRED_TO_COMPLETE,
    });
  }),
);

/* ── writing ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Draft auto-save. Partial by design: the questionnaire sends whatever the client has touched, and
 * an untouched field must keep its value rather than being nulled by omission.
 *
 * The whole save is ONE transaction. A half-saved profile — equipment written, limitations lost —
 * is worse than a failed save, because the client has no way to tell it happened.
 */
router.patch(
  '/onboarding',
  requireAuth,
  saveLimiter,
  asyncRoute(async (req, res) => {
    const body = ProfilePatch.parse(req.body ?? {});
    const userId = req.user.id;

    const statements = [
      // The row may not exist yet — the first keystroke creates it. INSERT OR IGNORE rather than
      // a SELECT-then-branch, so two debounced saves racing each other cannot both decide to
      // insert.
      { sql: 'INSERT OR IGNORE INTO onboarding_profiles (user_id) VALUES (?)', params: [userId] },
    ];

    const fields = WRITABLE.filter((k) => body[k] !== undefined);
    if (fields.length) {
      statements.push({
        // Scoped to the session's own user and nothing else. A completed profile stays editable
        // on purpose: bodyweight changes, injuries happen, and forcing a client to redo the whole
        // questionnaire to correct one number is how a profile goes stale and stops being usable.
        // `status` is not in WRITABLE, so editing cannot quietly reopen a submitted profile.
        sql: `UPDATE onboarding_profiles SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = unixepoch()
               WHERE user_id = ?`,
        params: [...fields.map((f) => body[f]), userId],
      });
    }

    if (body.equipment) {
      const wanted = [...new Set(body.equipment)];
      if (wanted.length) {
        // Checked here so an unknown id is a 400 with a reason. The foreign key already makes it
        // impossible to STORE one, but relying on the FK alone surfaces client error as a 500:
        // it blames the server for a bad request and files it in the log as a server fault, which
        // is how a noisy log stops being read.
        //
        // The placeholder list is built from the array's LENGTH, never from its contents — the
        // ids themselves are bound.
        const known = await db.all(
          `SELECT id FROM equipment WHERE id IN (${wanted.map(() => '?').join(',')})`,
          wanted,
        );
        if (known.length !== wanted.length) {
          const valid = new Set(known.map((r) => r.id));
          return sendError(
            res,
            400,
            ERR.VALIDATION,
            `unknown equipment: ${wanted.filter((id) => !valid.has(id)).join(', ')}`,
          );
        }
      }
      // Replace-in-place: delete then insert, inside the same transaction, so the set is never
      // momentarily empty for a concurrent reader.
      statements.push({ sql: 'DELETE FROM onboarding_equipment WHERE user_id = ?', params: [userId] });
      for (const id of wanted) {
        statements.push({
          // The FK stays as the backstop: the check above is about the error message, this is
          // about the guarantee.
          sql: 'INSERT INTO onboarding_equipment (user_id, equipment_id) VALUES (?, ?)',
          params: [userId, id],
        });
      }
    }

    if (body.limitations) {
      statements.push({ sql: 'DELETE FROM onboarding_limitations WHERE user_id = ?', params: [userId] });
      const seen = new Set();
      for (const l of body.limitations) {
        if (seen.has(l.body_area)) continue; // UNIQUE would abort the whole save over a UI dupe.
        seen.add(l.body_area);
        statements.push({
          sql: 'INSERT INTO onboarding_limitations (user_id, body_area, severity, note) VALUES (?, ?, ?, ?)',
          params: [userId, l.body_area, l.severity, l.note ?? null],
        });
      }
    }

    await db.writeTx(statements);
    res.json({ profile: await loadProfile(userId) });
  }),
);

/**
 * Submit. Separate from the auto-save because completing is a decision, not a side effect of
 * typing — and because the completeness rule has to run somewhere the client cannot skip.
 */
router.post(
  '/onboarding/complete',
  requireAuth,
  saveLimiter,
  asyncRoute(async (req, res) => {
    const profile = await db.get('SELECT * FROM onboarding_profiles WHERE user_id = ?', [req.user.id]);
    if (!profile) return sendError(res, 400, ERR.VALIDATION, 'nothing to submit');

    const missing = REQUIRED_TO_COMPLETE.filter((f) => profile[f] === null || profile[f] === undefined);
    // The field names are safe to return: they are this file's own constants, not anything the
    // request supplied, and the client needs them to point at the step that is unfinished.
    if (missing.length) return sendError(res, 400, ERR.VALIDATION, `incomplete: ${missing.join(', ')}`);

    const result = await db.run(
      `UPDATE onboarding_profiles SET status = 'complete', completed_at = unixepoch(), updated_at = unixepoch()
        WHERE user_id = ? AND status <> 'complete'`,
      [req.user.id],
    );
    // Already complete is not an error — a double-tapped submit button is the client's most
    // ordinary mistake and must not read as a failure.
    res.json({ ok: true, alreadyComplete: result.changes === 0 });
  }),
);

/* ── the coach's view ────────────────────────────────────────────────────────────────────── */

router.get(
  '/clients/:id/onboarding',
  requireAuth,
  // The same gate the rest of the coach surface uses. Without it this route answered 404 where
  // its neighbour answered 403 — same caller, same intent, two different stories.
  requireCoach,
  asyncRoute(async (req, res) => {
    const linkId = z.coerce.number().int().positive().parse(req.params.id);

    // The link, not the user id, is the key: it carries the proof that this coach is entitled to
    // read this client. An archived link matches nothing, so access ends the moment it is archived
    // rather than at the next token refresh.
    const link = await db.get(
      `SELECT client_id FROM coach_clients
        WHERE id = ? AND coach_id = ? AND status = 'active'`,
      [linkId, req.user.id],
    );
    // 404 for "not yours" as well as "not there" — a 403 would confirm the link exists.
    if (!link) return sendError(res, 404, ERR.NOT_FOUND, 'not found');

    const lang = await resolveLang(req);
    const [profile, equipment] = await Promise.all([
      loadProfile(link.client_id),
      taxonomyList('equipment', lang),
    ]);
    // Labels resolved in the COACH's language, not the client's: this is the coach reading. The
    // one field that stays in the client's words is `notes`, deliberately.
    const byId = new Map(equipment.map((e) => [e.id, e]));
    res.json({
      profile: profile
        ? { ...profile, equipment: profile.equipment.map((id) => byId.get(id)).filter(Boolean) }
        : null,
    });
  }),
);

export default router;
