// src/lib/like.js — a user's search text as a SAFE substring pattern for LIKE ... ESCAPE '\'.
//
// ═══ '_' WAS A WILDCARD AND THE COMMENT SAID IT WAS NOT ════════════════════════════════════════
//
// The admin account search validated its text with /^[\w@.\-+ ]+$/ and explained, above it, that the
// character class "stops a wildcard being smuggled in: `%` and `_` are LIKE metacharacters". `%` is
// outside that class. `_` is INSIDE it — `\w` includes the underscore — so a search for `a_b`
// matched `axb`, and a search for `_` alone matched every account. The class was never the control;
// the escaping below is.
//
// So the text is no longer restricted to a class (a Hungarian name has letters no ASCII class
// admits). It is FOLDED like the stored side (see foldText), then every LIKE metacharacter is
// escaped, and the pattern is bound as a parameter. Nothing about the text reaches the SQL itself.
import { normalizeText } from './normalize.js';

/** The escape character the queries declare: `LIKE ? ESCAPE '\'`. */
export const LIKE_ESCAPE = '\\';

/**
 * The accent-insensitive, case-insensitive fold used on BOTH sides of a name/e-mail search: the query
 * here, and the column through the `fold_text` SQL function the account reads register. One function,
 * so the two can only match if they were folded identically (lib/normalize.js says the same).
 */
export const foldText = (v) => normalizeText(v ?? '');

/** Escape `\`, `%` and `_` so they match themselves. Backslash first, or the escapes get escaped. */
export const escapeLike = (v) => v.replace(/[\\%_]/g, (c) => `${LIKE_ESCAPE}${c}`);

/** `%<escaped folded text>%`, ready to bind. */
export const containsPattern = (q) => `%${escapeLike(foldText(q))}%`;
