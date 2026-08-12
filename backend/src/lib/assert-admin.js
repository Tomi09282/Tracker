// src/lib/assert-admin.js — ONE answer to "is this caller still an admin".
//
// ═══ THERE WERE THREE, AND THEY HAD ALREADY DRIFTED ════════════════════════════════════════════
//
// `src/admin/routes.js` and `src/coins/routes.js` each carried a private `assertAdmin`, and
// `src/theme/routes.js` inlined the same five lines a third time. They were identical the day they
// were written, which is the only day copies ever are.
//
// The drift was measured, not predicted: the abuse-signal log line — the one that records somebody
// presenting a valid token whose admin claim the database disagrees with — was added to the admin
// copy and reached neither of the others. So two of the three refusals were still silent, and the
// operator grepping for them after a laptop goes missing would have found a third of the story.
//
// A fourth copy was about to be written for `src/public/moderation.js`, whose reports queue
// authorises from the JWT alone. It got this instead.
//
// ═══ WHY IT IS NOT MIDDLEWARE ══════════════════════════════════════════════════════════════════
//
// `requireRole('admin')` already IS the middleware, and it reads the token — which is right: it is
// the cheap gate that keeps a non-admin off the route without touching the database. This is the
// second, expensive check, and it belongs INSIDE the handler because that is where the work is
// about to happen. As middleware it would run before the route's own validation and turn every
// malformed request into a database read.
import * as db from '../db/index.js';
import { ERR, sendError } from './http.js';

/**
 * Re-read the caller's role from the DATABASE, inside the request.
 *
 * `requireRole` reads the JWT, which is a fast-path hint that can be up to fifteen minutes stale.
 * For an operation that reshapes the product for everyone, publishes content, or reads a moderation
 * queue, the token is not good enough: a role revoked thirty seconds ago must not still work here.
 *
 * Returns false and HAS ALREADY ANSWERED when it refuses, so the caller's line is:
 *
 *     if (!(await assertAdmin(req, res))) return;
 */
export async function assertAdmin(req, res) {
  const actor = await db.get('SELECT role FROM users WHERE id = ? AND disabled_at IS NULL', [
    req.user.id,
  ]);
  if (actor?.role === 'admin') return true;

  /*
   * THE ABUSE SIGNAL. Reaching this line means somebody presented a VALID token whose admin claim
   * the database disagrees with: a role revoked, an account disabled, or a token minted before
   * either. The audit log records what admins DID; nothing recorded what a non-admin TRIED, and a
   * refusal that leaves no trace is one nobody can count.
   *
   * A log line rather than an audit row, deliberately: `audit_log` is append-only and records
   * events in the product's history, and a refused request is not one. This is what an operator
   * greps for.
   */
  req.log?.warn(
    { userId: req.user.id, route: req.originalUrl, dbRole: actor?.role ?? 'gone-or-disabled' },
    'admin route refused: the token says admin and the database does not',
  );
  sendError(res, 403, ERR.FORBIDDEN, 'forbidden');
  return false;
}
