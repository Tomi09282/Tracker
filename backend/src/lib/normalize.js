// src/lib/normalize.js — text folding for search.
//
// SQLite cannot fold "tricepsz" and "trícepsz" together on its own, and a Hungarian user will
// type either. So the folded form is computed here at write time, stored on the row, and
// searched instead of the display name.

/**
 * Lowercase, strip diacritics, collapse whitespace.
 *
 * NFKD splits an accented character into base + combining mark, and the range below removes the
 * marks. This is why it must run BEFORE lowercasing is compared — the same function is used on
 * the query and on the stored value, so the two can only match if they were folded identically.
 */
export function normalizeText(input) {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape a user string for an FTS5 MATCH.
 *
 * FTS5 has its own query syntax — quotes, NEAR, column filters, prefix stars. Passing raw user
 * input into MATCH is the FTS equivalent of string-concatenating SQL: at best a syntax error on
 * an apostrophe, at worst a query the user did not intend. Every token is quoted, and a single
 * trailing star is added so search feels incremental as they type.
 */
export function toFtsQuery(input) {
  const tokens = normalizeText(input)
    .split(' ')
    .filter(Boolean)
    .slice(0, 8); // a bounded number of terms; nobody searches with nine words
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}
