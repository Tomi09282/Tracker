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
 * ═══ INVISIBLE CHARACTERS (security review admin v2, 2026-11-04, attack 03) ════════════════════
 *
 * CONTROLS alone let a name through that renders as somebody else's: measured, the admin rename
 * route stored "Admin" + RLM, "Ad" + ZWSP + "min", "Ad" + ALM + "min", tag characters (U+E0041),
 * "a" + INVISIBLE TIMES + "b", LINE / PARAGRAPH SEPARATOR inside a name, a lone surrogate, a name
 * made of two Hangul fillers (blank on screen, two letters to every length bound) and a base letter
 * carrying 119 combining marks. Each one is a name that looks like another name, or like nothing.
 *
 * Refused (a 400, never silently rewritten - the person should see their name was not accepted):
 *   * malformed UTF-16 (a lone surrogate);
 *   * every FORMAT character (\p{Cf}: ZWSP, the marks, BOM, soft hyphen, invisible operators, tag
 *     characters, ...) EXCEPT a ZWJ inside an emoji sequence (between two pictographs, a VS16 may
 *     precede it), a ZWJ after a virama (Indic conjuncts) and a ZWNJ between two letters (Persian,
 *     Indic). A ZWJ between two Latin letters ("Ad<ZWJ>min") renders as "Admin" and is refused - it
 *     used to be allowed;
 *   * the line and paragraph separators (\p{Zl}, \p{Zp});
 *   * the characters that are letters to Unicode and blank on screen: the Hangul fillers
 *     (U+115F, U+1160, U+3164, U+FFA0) and the braille blank (U+2800);
 *   * a run of four or more combining marks (Zalgo; real orthographies stay well below that).
 */
const FORMAT = /\p{Cf}/u;
const EMOJI_ZWJ = /(?<=[\p{Extended_Pictographic}\uFE0F])\u200D(?=\p{Extended_Pictographic})/gu;
// Indic conjuncts and chillus: a ZWJ right after a virama (a letter followed by its marks).
const INDIC_ZWJ = /(?<=\p{L}\p{M}+)\u200D/gu;
const LETTER_ZWNJ = /(?<=\p{L}\p{M}*)\u200C(?=\p{L})/gu;
const SEPARATORS = /[\p{Zl}\p{Zp}]/u;
const BLANK_LETTERS = /[\u115F\u1160\u3164\uFFA0\u2800]/u;
const MARK_RUN = /\p{M}{4,}/u;

/** True when the name carries a character that makes it read as another name, or as nothing. */
export function hasInvisible(v) {
  if (!v.isWellFormed()) return true;
  if (SEPARATORS.test(v) || BLANK_LETTERS.test(v) || MARK_RUN.test(v)) return true;
  // Take out the two joiners that are legitimate where they stand; any format character left over
  // is one the name does not need.
  return FORMAT.test(v.replace(EMOJI_ZWJ, '').replace(INDIC_ZWJ, '').replace(LETTER_ZWNJ, ''));
}

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
  .refine((v) => !hasInvisible(v), 'invisible characters are not part of a name')
  .refine((v) => codePoints(v) >= 2, 'too short')
  .refine((v) => codePoints(v) <= 120, 'too long')
  .nullable();
