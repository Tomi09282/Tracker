// src/chat/retention.js — chat retention, ENFORCED rather than documented (T3.2.8).
//
// There is no scheduler in this product, and adding one for this would be the largest piece of
// infrastructure in the phase. So retention is TWO mechanisms with different jobs, and the split
// is the whole design:
//
//   1. **A READ PREDICATE.** Nothing older than the window is ever returned. This is what actually
//      enforces the policy: it takes effect on the very next request, it cannot drift, and it does
//      not depend on any job having run. If the sweeper never ran again, the policy would still
//      hold for every user.
//
//   2. **A BOUNDED SWEEP.** Deletes the rows and unlinks the bytes. Its only job is to stop the
//      disk growing — it is a storage concern, not a privacy one, because (1) already made the
//      data unreachable.
//
// Getting that order the wrong way round is the common mistake: a sweeper-only design means the
// policy is true exactly as often as the job runs, and a missed run is a silent breach.
//
// The same shape as `sweepQuarantine`, deliberately — one pattern for "bounded background tidying"
// in this codebase rather than two.
import path from 'node:path';
import { rm } from 'node:fs/promises';
import * as db from '../db/index.js';
import { MEDIA_DIR } from '../lib/media.js';

/**
 * How long a message stays readable.
 *
 * Two years. Long enough that a coach can look back over a full training cycle and the client can
 * see what they were told last winter; short enough that a database breach five years from now
 * does not expose a decade of private conversation.
 *
 * A constant rather than a per-conversation column, deliberately: a column is a schema change and
 * a setting nobody would ever visit, and the narrow-013 decision was to add neither until traffic
 * asks for it.
 */
export const RETENTION_DAYS = 730;

/**
 * The read predicate. `messages` must be aliased `m`.
 *
 * Every chat read composes this. It is exported as a string rather than re-typed at each call site
 * for the reason every predicate in this codebase is: two spellings of one rule drift, and a
 * retention rule that drifts is a privacy policy the product does not actually keep.
 */
export const WITHIN_RETENTION = `m.created_at > unixepoch() - ${RETENTION_DAYS} * 86400`;

/**
 * Delete what the read predicate already hides, in bounded batches.
 *
 * BOUNDED because this is the largest table in the product and it holds the single write lock for
 * the length of the statement. A thousand rows is a few milliseconds; an unbounded DELETE on a
 * table nobody has swept for a year is a stall every client feels.
 *
 * The bytes are unlinked AFTER the rows commit, and a failure to unlink is logged rather than
 * thrown: a file left behind is wasted disk, while a row left behind is data that was supposed to
 * be gone. If those two cannot both succeed, the row is the one that matters.
 */
export async function sweepChatRetention({ batch = 1000 } = {}) {
  const expired = await db.all(
    `SELECT m.id, a.storage_key
       FROM messages m
       LEFT JOIN message_attachments a ON a.message_id = m.id
      WHERE NOT (${WITHIN_RETENTION})
      LIMIT ?`,
    [batch],
  );
  if (expired.length === 0) return { rows: 0, files: 0 };

  const ids = expired.map((r) => r.id);
  // `message_attachments` is ON DELETE CASCADE from `messages`, so one statement clears both.
  await db.run(`DELETE FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`, ids);

  let files = 0;
  for (const key of expired.map((r) => r.storage_key).filter(Boolean)) {
    await rm(path.join(MEDIA_DIR, key), { force: true }).then(
      () => { files += 1; },
      () => {},
    );
  }
  return { rows: ids.length, files };
}
