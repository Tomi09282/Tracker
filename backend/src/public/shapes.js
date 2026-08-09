// src/public/shapes.js — the shapes of the identifiers the public surface and the composer share.
//
// ═══ WHY THESE ARE HERE AND NOT WHERE THEY WERE ════════════════════════════════════════════════
//
// They were module-private in `public/routes.js`, which was correct while that file was the only
// thing that used them. The composer validates the same identifiers on the way IN that the public
// routes validate on the way OUT, and a second copy of `HANDLE_RE` is a second answer to "what is
// a handle" — this project's most common defect, and the one it keeps paying for.
//
// The city shape was already written out THREE times in that one file before this module existed.
//
// `HANDLE_RE` in particular must agree with a FOUR-CLAUSE column CHECK. That agreement is asserted
// by `verify-022`, exhaustively rather than by reading both and nodding.

import { z } from 'zod';

/** A post's public address. 12 characters, opaque, never the rowid. */
export const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{12}$/;

/**
 * A coach's handle: 3–32 characters, lowercase alphanumeric and hyphens, never starting or ending
 * in a hyphen. The column enforces the same rule in four GLOB clauses.
 */
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** Taxonomy keys. These bound the SHAPE; the database decides what actually exists. */
export const CITY_KEY_RE = /^[a-z][a-z0-9-]{1,30}$/;
export const KIND_KEY_RE = /^[a-z][a-z_]{1,30}$/;
export const SPECIALTY_KEY_RE = /^[a-z][a-z_]{1,30}$/;

/** ISO 4217, as an alphabetic code. The database decides which ones are active. */
export const CURRENCY_RE = /^[A-Z]{3}$/;

/** A public image key: `pub_` + 32 lowercase hex + `.webp`, exactly 41 characters. */
export const PUB_MEDIA_KEY_RE = /^pub_[a-f0-9]{32}\.webp$/;

/**
 * An IANA time zone, checked against the RUNTIME'S OWN TABLE.
 *
 * Not a list in this file. A hardcoded set of zone names is a copy of a database that changes
 * several times a year — Node already ships the current one, and asking it is both shorter and
 * right for longer. An event with no zone is ambiguous to anybody reading from another country,
 * and this is a public surface.
 */
export const ianaTz = (schema = z.string().max(64)) =>
  schema.refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'unknown_time_zone');
