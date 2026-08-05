// src/lib/cursor.js — opaque keyset cursors.
//
// Keyset rather than OFFSET: an offset shifts under you when rows are inserted, so a user
// scrolling a list can see the same row twice or miss one entirely, and it gets slower the
// deeper you page. A keyset cursor is stable and costs the same on page 1 and page 100.
//
// The value is base64url of a JSON tuple. It is opaque, NOT secret — it carries only the sort
// key of the last row, which the client already has. Signing it would imply a confidentiality
// it does not need.

export function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

/**
 * Decode a cursor, returning null for anything malformed.
 *
 * A bad cursor must never throw a 500 — it is client input like any other, and the caller
 * treats null as "start from the beginning".
 */
export function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Hard cap on page size. A client asking for 10 000 rows gets 24. */
export const MAX_PAGE = 24;

export function clampLimit(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return MAX_PAGE;
  return Math.min(n, MAX_PAGE);
}
