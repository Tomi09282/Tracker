// src/admin/params.js — the numeric :id of the admin routes, defined ONCE (package B-admin-polish).
//
// ═══ WHY NOT z.coerce.number() ═════════════════════════════════════════════════════════════════
//
// The independent security review of the admin v2 backend (2026-11-04, attack 01) sent the same
// ids to every admin route. GET /admin/users/:id and the B-admin-accounts writes refused '0x10' and
// ' 5' with a 400; POST /admin/users/:id/role and /enable answered 200 and acted on accounts 16 and
// 5. `z.coerce.number()` is `Number(value)`, and Number() reads hex, binary, octal, exponents and
// surrounding whitespace: one account has eight spellings, and a route that logs or rate-limits by
// the raw parameter sees eight different things.
//
// An id here is a canonical decimal: digits only, no sign, no leading zero, no exponent, no
// whitespace, at most a signed 32-bit integer. Anything else is not an id, whatever the route then
// answers for it (the older routes keep the status they always had for a bad id).
import { z } from 'zod';

export const ID_MAX = 2_147_483_647;

/** The raw string form of an id: canonical decimal, 1..2^31-1. */
export const idString = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(z.number().int().max(ID_MAX));

/** `req.params` of a route whose only parameter is `:id`. */
export const idParams = z.object({ id: idString }).strict();

/** The id as a number, or null when the raw value is not a canonical id. */
export function parseId(raw) {
  const r = idString.safeParse(raw);
  return r.success ? r.data : null;
}
