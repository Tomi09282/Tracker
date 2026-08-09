// src/public/body.js — the ONE producer of the four columns that must agree.
//
// `body_src`, `body_doc`, `body_excerpt` and `doc_version` are four representations of one text.
// This project's most common defect is two things that must agree drifting apart, and no trigger
// can catch this particular drift: SQLite has no markdown parser, so nothing in the database ever
// verifies that `body_doc` is the parse of `body_src`. 021 says as much about the display-name
// strip and then nobody wrote it, so this file states the control AND is the control.
//
// The rule: every write of those columns, anywhere in the product, gets its values from
// `buildBody`. `check-body-writes.mjs` fails the build if a statement writes one without the rest,
// or if the parser is called anywhere but here.

import { normaliseSource, parseBody, assertDocShape, MarkdownError, LIMITS } from './markdown.js';

/**
 * The product bound for each surface, which is NOT the storage bound.
 *
 * `LIMITS.chars` is 20 000 and `coach_profiles.bio_src` is CHECK'd at 16 384, so a 17 000-character
 * bio parses perfectly and then dies on a raw constraint the coach cannot act on. Each surface
 * carries its own number here and nowhere else.
 */
export const POST_BODY = { maxChars: LIMITS.chars, column: 'body' };
export const BIO_BODY = { maxChars: 8_000, column: 'bio' };

/**
 * The JSON body limit for the composer, and the assertion that ties it to the bound above.
 *
 * The global parser is 64 KB, which a legal 20 000-character body of accented or CJK text exceeds
 * — UTF-8 gives those up to four bytes each, and JSON escaping adds more. That request would be a
 * 413 fired by the parser BEFORE zod or any route saw it, with an error the composer cannot
 * explain because nothing it sent was out of bounds.
 *
 * Two numbers that must agree, so they are checked at module load rather than described in a
 * comment. A comment asserting a guarantee the code does not provide is exactly what this file
 * exists to stop.
 */
export const COMPOSE_JSON_LIMIT = '176kb';
const COMPOSE_JSON_LIMIT_BYTES = 176 * 1024;
if (POST_BODY.maxChars * 8 + 16_384 > COMPOSE_JSON_LIMIT_BYTES) {
  throw new Error(
    `compose JSON limit ${COMPOSE_JSON_LIMIT} cannot admit a ${POST_BODY.maxChars}-character body`,
  );
}

/**
 * Turn an author's markdown into the four values that get stored together.
 *
 * ═══ SIX PROPERTIES, EACH CLOSING ONE WAY THE COLUMNS COME APART ═══════════════════════════════
 *
 * 1. `src` is `normaliseSource(raw)`, NOT the request string. `parseBody` normalises internally and
 *    builds its tree from the normalised text, so storing the raw input means the stored source is
 *    not the source the stored tree came from.
 *
 * 2. Lone surrogates are refused. `JSON.parse` accepts an unpaired `\ud83d`, `normaliseSource`
 *    keeps it, `JSON.stringify` escapes it into `body_doc` as text, and the UTF-8 conversion on the
 *    way into `body_src` replaces it with U+FFFD — a doc that is not the parse of its source, in
 *    the exact column pair this file protects, and invisible to every check.
 *
 * 3. `doc` is `parsed.json` — the string `parseBody` already serialised and byte-checked against
 *    `LIMITS.bytes`. Re-stringifying the tree stores bytes that limit never saw.
 *
 * 4. `excerpt` comes from the DOC. Derived from the source it would carry markdown punctuation into
 *    a feed card.
 *
 * 5. An empty excerpt is refused. A body of a single backslash parses to one paragraph containing
 *    one line break: a legal publish that spends one of ten daily slots and renders a blank card
 *    on the open internet forever.
 *
 * 6. `version` is read off the return value. The literal `1` lives in exactly one place in this
 *    product, and a route writing `doc_version = 1` mints the second one.
 */
export function buildBody(raw, profile) {
  if (typeof raw !== 'string' || !raw.isWellFormed()) throw new MarkdownError('malformed_text');

  const parsed = parseBody(raw);
  // The structural half zod cannot express: node kinds, nesting depth, the shape of every child.
  assertDocShape(parsed.doc);

  const src = normaliseSource(raw);
  if (src.length > profile.maxChars) throw new MarkdownError('too_long');
  if (parsed.excerpt.length === 0) throw new MarkdownError('no_visible_text');

  return { src, doc: parsed.json, excerpt: parsed.excerpt, version: parsed.version };
}

/**
 * A bio is optional, and "cleared" is a real state the columns are built to hold.
 *
 * The three bio columns are bound together by two CHECKs — `(bio_src IS NULL) = (bio_doc IS NULL)`
 * and `(bio_doc IS NULL) = (doc_version IS NULL)` — so all three move to NULL together or none do.
 * Returning the null triple from here rather than branching at each call site is what stops one
 * caller clearing two of the three.
 */
export function buildBio(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { src: null, doc: null, excerpt: null, version: null };
  }
  return buildBody(raw, BIO_BODY);
}
