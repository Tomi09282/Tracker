// src/lib/display-name.js — what a person's display name may be, stated ONCE.
//
// Two routes write `users.display_name`: PATCH /auth/me (a person naming themselves) and
// PATCH /admin/users/:id/name (an admin naming somebody). They have to agree on what a name is, and
// the moment the rule lived in two files they would have started to drift — the second copy is the
// one that lets the bidi override through. So the rule moved here from auth/routes.js, unchanged,
// and both routes import it.
//
// The bounds are the migration's bounds (029_display_name.sql), restated. The CHECK is what actually
// holds; this is the error message. If the two ever disagree, 029 wins and this is the bug.
import { z } from 'zod';

/**
 * ═══ THE TWO BOUNDS HAVE TO COUNT THE SAME THING ═══════════════════════════════════════════════
 *
 * `z.string().min(2)` counts UTF-16 code units; SQLite's `length()` counts characters. For everything
 * on the basic plane those agree, so it looked right — but a single astral character is two code
 * units and one character, so `"🎉"` passed zod and was then refused by the CHECK. `[...v].length`
 * iterates code points, which is the same unit `length()` uses.
 */
export const codePoints = (v) => [...v].length;

/**
 * Control characters are not part of a name, and two of the ranges are actively dangerous.
 *
 * C0 and C1 include newline and NUL. A name with a newline in it breaks every single-line list this
 * app renders it into, and SQLite's `length()` stops counting at the first NUL — so a name beginning
 * with one would measure 0 to the database and pass a bound it never actually met.
 *
 * The bidi overrides (U+202A–U+202E, U+2066–U+2069) are the spoofing case. They re-order the text
 * AROUND them, so a name containing one can rewrite how the rest of a coach's client row reads.
 * Nobody's name needs them; a name in Hebrew or Arabic gets its direction from its own characters.
 */
export const CONTROLS = new RegExp(
  [
    '[',
    '\u0000-\u001F', // C0, which is where NUL and newline live
    '\u007F-\u009F', // DEL and C1
    '\u202A-\u202E', // the bidi embeddings and overrides
    '\u2066-\u2069', // the bidi isolates
    ']',
  ].join(''),
);

/**
 * The name itself: trimmed, no control characters, 2..120 code points, or `null` to clear it.
 *
 * `null` is an explicit, reachable value: clearing a name is allowed, and it has to be
 * distinguishable from "field omitted" — so callers make the field required and nullable.
 */
export const displayNameValue = z
  .string()
  .trim()
  .refine((v) => !CONTROLS.test(v), 'control characters are not part of a name')
  .refine((v) => codePoints(v) >= 2, 'too short')
  .refine((v) => codePoints(v) <= 120, 'too long')
  .nullable();
