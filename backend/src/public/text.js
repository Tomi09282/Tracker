// src/public/text.js — the SHORT public text fields: display names, headlines, titles.
//
// ═══ MIGRATION 021 PROMISED THIS FUNCTION AND IT HAS NEVER EXISTED ═════════════════════════════
//
// The `display_name` column carries this comment: "Bidi overrides, zero-width characters and
// combining-mark runs are stripped by `sanitizeDisplayText` at the edge — that is a CODE control,
// stated as one, gated by check-public-text.mjs, and not pretended to be a schema control here."
//
// Grepped: zero hits in `src/`, and no `check-public-text.mjs`. The schema named a control, said
// honestly that it was code's job rather than the schema's, and the code was never written. It was
// not exploitable, because until the composer there was no route that wrote a display name — which
// is exactly why it has to exist before that route ships rather than after.
//
// ═══ THIS IS NOT A SHARE OF normaliseSource, AND THE DIFFERENCE IS DELIBERATE ══════════════════
//
// `normaliseSource` handles BODIES and deliberately KEEPS U+200C and U+200D: ZWJ builds every
// profession and gender emoji, ZWNJ is required for Persian and Indic text, and rejecting them
// would refuse ordinary writing over a character the author cannot see.
//
// A short display field is a different problem. A hundred joiners is a legal body and an INVISIBLE
// NAME in the public directory — it passes every length bound because the characters are real.
// So joiners go here and stay there. The two sets the modules DO share are exported once, from
// markdown.js, rather than typed out twice.

import { z } from 'zod';
import { CONTROL_CHARS, INVISIBLE_FORMAT } from './markdown.js';

/** Zero-width joiner and non-joiner: kept in bodies, stripped from short fields. */
const JOINERS = /[‌‍]/g;

/**
 * A base character followed by three or more combining marks.
 *
 * This is the "Zalgo" shape — text that grows vertically out of its line and over everything
 * around it. Two marks is legitimate in several orthographies; the run is what is not.
 */
const COMBINING_RUN = /(\p{M})\p{M}{2,}/gu;

/** Every Unicode whitespace, which is the point — see the note on trim() below. */
const WHITESPACE = /\p{White_Space}+/gu;

export class TextError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'TextError';
    this.reason = reason;
  }
}

/**
 * Normalise a short field that other people will read.
 *
 * ═══ WHY ALL WHITESPACE COLLAPSES TO AN ASCII SPACE ════════════════════════════════════════════
 *
 * SQLite's `trim()` strips ASCII SPACE AND NOTHING ELSE. Measured against the real database:
 * `' a '` trims to 1 character, while NBSP, the ideographic space, TAB and NEWLINE all survive it
 * with the length unchanged.
 *
 * The columns are bounded with `length(trim(x)) BETWEEN 2 AND 120`. So a display name of two
 * non-breaking spaces satisfies that CHECK and renders as nothing at all in the public directory —
 * and, the other way round, a name that JavaScript trims to two characters can fail a CHECK
 * SQLite measures differently, arriving at the composer as an opaque 400 about a length the coach
 * can plainly see is fine.
 *
 * Collapsing here makes the bound zod checks the same bound SQLite trims to. That is the whole
 * job: not "clean the text", but "make two measurements of the same string agree".
 */
export function sanitizeDisplayText(raw) {
  if (typeof raw !== 'string') return '';
  // A lone surrogate is not text. It survives JSON, breaks NFC, and is stored as bytes no reader
  // can render. Node 20 exposes the test directly rather than by round-tripping through Buffer.
  if (!raw.isWellFormed()) throw new TextError('malformed_text');

  return raw
    .normalize('NFC')
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_FORMAT, '')
    .replace(JOINERS, '')
    .replace(COMBINING_RUN, '$1')
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * A zod schema for a short public text field.
 *
 * The OUTER bound is generous and exists only so a megabyte of joiners is rejected before any of
 * the work above runs on it. The bound that means something is applied AFTER sanitising, because
 * validating before you normalise measures a string nobody will ever store.
 */
export const displayText = (min, max) =>
  z
    .string()
    .max(max * 8)
    .transform(sanitizeDisplayText)
    .pipe(z.string().min(min).max(max));
