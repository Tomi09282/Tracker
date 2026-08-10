// src/db/index.js — the async facade over the worker pool.
// This is the ONLY module the rest of the app may import for database access. Nothing outside
// src/db/ ever touches better-sqlite3 directly.
import { availableParallelism } from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import Piscina from 'piscina';
import { env } from '../lib/env.js';

// Single-process default: leave one core for the event loop, but never fewer than 2 workers or
// one slow query starves everything. Under cluster.js set DB_POOL_THREADS=2 per process so the
// total thread count stays near the core count.
const threads = env.DB_POOL_THREADS ?? Math.max(2, availableParallelism() - 1);

const pool = new Piscina({
  filename: new URL('./worker.js', import.meta.url).href,
  // Pin min == max. Piscina's default idleTimeout is 0, so workers above minThreads are torn
  // down the moment they go idle — and every respawn re-runs the ~200ms scrypt KDF and reopens
  // the database.
  minThreads: threads,
  maxThreads: threads,
});

export const all = (sql, params = []) => pool.run({ sql, params }, { name: 'all' });
export const get = (sql, params = []) => pool.run({ sql, params }, { name: 'get' });
export const run = (sql, params = []) => pool.run({ sql, params }, { name: 'run' });
export const writeTx = (steps) => pool.run({ steps }, { name: 'writeTx' });

/*
 * The workout log's two critical writes, as NAMED worker transactions.
 *
 * Not `writeTx` steps: that helper cannot inspect an intermediate result, so it cannot enforce a
 * condition — and enforcing a condition is the entire job of both of these. See the comments on
 * each in `worker.js` for the four-layer idempotency argument.
 */
export const startWorkout = (args) => pool.run(args, { name: 'startWorkoutTx' });
export const recordSet = (args) => pool.run(args, { name: 'recordSetTx' });
export const voidSet = (args) => pool.run(args, { name: 'voidSetTx' });
export const sendMessage = (args) => pool.run(args, { name: 'sendMessageTx' });
export const openConversation = (args) => pool.run(args, { name: 'openConversationTx' });
/** Deep-copy a plan. All-or-nothing: a plan with days but no exercises is worse than no plan. */
export const clonePlan = (args) => pool.run(args, { name: 'clonePlanTx' });
/** Copy days within one plan, growing the cycle when the target lands outside it. */
export const copyDays = (args) => pool.run(args, { name: 'copyDaysTx' });

// Coins (019). Every one is a NAMED transaction: the owner's rule is that a business-critical
// write — money, inventory, anything with a guard — never goes through the generic writeTx.
export const purchaseStoreItem = (args) => pool.run(args, { name: 'purchaseStoreItemTx' });
export const unlockAchievement = (args) => pool.run(args, { name: 'unlockAchievementTx' });
export const adminAdjustCoins = (args) => pool.run(args, { name: 'adminAdjustCoinsTx' });

// The composer. Four named transactions rather than one setProfile() with flags — publish carries
// a standing gate that unpublish deliberately does not, and listed_at is written only on the
// publish path, so a shared helper would be correct for exactly one of the two.
export const createCoachProfile = (args) => pool.run(args, { name: 'createCoachProfileTx' });
export const updateCoachProfile = (args) => pool.run(args, { name: 'updateCoachProfileTx' });
export const publishCoachProfile = (args) => pool.run(args, { name: 'publishCoachProfileTx' });
export const unpublishCoachProfile = (args) => pool.run(args, { name: 'unpublishCoachProfileTx' });
// Renaming is its own transaction, and not part of the profile PUT, because it is the one profile
// field with consequences for other people: it retires the old handle for everybody else and it
// spends a 30-day cooldown. See renameCoachHandleTx for the three defects this shape closes.
export const renameCoachHandle = (args) => pool.run(args, { name: 'renameCoachHandleTx' });
// A read, not a transaction — and it answers ONE boolean, because every extra field is information
// about somebody else's account.
export const handleAvailability = (args) => pool.run(args, { name: 'handleAvailabilityQuery' });

// Posts. publishPost and restorePost both re-check standing INSIDE their guarded UPDATE, so the
// facade carries no policy of its own — it is a name and a thread hop.
export const createPost = (args) => pool.run(args, { name: 'createPostTx' });
export const updatePost = (args) => pool.run(args, { name: 'updatePostTx' });
export const publishPost = (args) => pool.run(args, { name: 'publishPostTx' });
export const withdrawPost = (args) => pool.run(args, { name: 'withdrawPostTx' });
export const restorePost = (args) => pool.run(args, { name: 'restorePostTx' });

// The cover. There is no updateCover: replacing one is delete-then-post, because a soft-delete
// followed by a guarded write followed by a conditional return COMMITS the delete and answers 404.
export const attachPostCover = (args) => pool.run(args, { name: 'attachPostCoverTx' });
export const deletePostCover = (args) => pool.run(args, { name: 'deletePostCoverTx' });

// Moderation. resolveReport takes the subject down in the SAME transaction when a report is
// upheld: split in two, there is a window where the report reads as handled and the content is
// still public, and that window is exactly when somebody is looking.
export const fileReport = (args) => pool.run(args, { name: 'fileReportTx' });
export const resolveReport = (args) => pool.run(args, { name: 'resolveReportTx' });
export const removeSubject = (args) => pool.run(args, { name: 'removeSubjectTx' });

// Disabling an account. The last-admin guard is read under the write lock rather than pre-checked:
// two admins disabling each other at the same instant would otherwise leave the product with none,
// and enabling an account requires an admin — a state nothing could recover from.
export const setAccountDisabled = (args) => pool.run(args, { name: 'setAccountDisabledTx' });
// A role change is a NAMED transaction rather than a writeTx pair, because its guard has to be read
// under the write lock: two admins demoting each other concurrently both pass a pre-check and leave
// the product with no admin, which nothing can recover from.
export const setUserRole = (args) => pool.run(args, { name: 'setUserRoleTx' });

/*
 * Two writes that used to be `writeTx` step arrays, and were refusing after they had committed.
 *
 * A moderation decision wrote its audit row even when the guarded UPDATE matched nothing, and an
 * exhausted invite code linked the client to the coach before the route answered "used up". In both
 * cases the guard was correctly inside the UPDATE and protected only that one statement.
 *
 * They are NAMED transactions now because that is the house rule for a business-critical write, and
 * because it is the only shape where a guard can decide what happens next. `check-route-tx.mjs`
 * keeps the old shape from coming back.
 */
export const decideExercise = (args) => pool.run(args, { name: 'decideExerciseTx' });
export const redeemInvite = (args) => pool.run(args, { name: 'redeemInviteTx' });
export const closePool = () => pool.destroy();

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

/**
 * Reads every numbered migration off disk, in order, and hands them to a single worker call so
 * the whole run happens on one connection inside one transaction per file.
 * Filenames must be `NNN_name.sql`; the number is the target user_version.
 */
export async function migrate() {
  const dir = path.resolve(MIGRATIONS_DIR.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const entries = (await fs.readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

  const files = [];
  const seen = new Map();
  for (const name of entries) {
    const version = Number(name.match(/^(\d+)_/)[1]);

    // Two files claiming the same version is not a warning, it is a lost migration: the worker
    // applies files whose number is above the current `user_version` and bumps to that number, so
    // the second file with the same number is SILENTLY SKIPPED and its tables never exist.
    //
    // Found by two independent reviewers during the J4 schema design, both of whom noticed that a
    // proposed `009_` collided with `009_language_roster.sql` — and that nothing would have said
    // so. Failing here costs a second; discovering it from a "no such table" in production does
    // not.
    if (seen.has(version)) {
      throw new Error(
        `migrate: two migrations claim version ${version} — ${seen.get(version)} and ${name}. ` +
          'Renumber one of them; a duplicate is skipped without warning, not merged.',
      );
    }
    seen.set(version, name);

    files.push({ version, sql: await fs.readFile(path.join(dir, name), 'utf8') });
  }
  return pool.run({ files }, { name: 'migrate' });
}

/** Liveness of the DB itself, for /readyz. Deliberately the cheapest possible query. */
export async function ping() {
  await get('SELECT 1 AS ok');
  return true;
}
