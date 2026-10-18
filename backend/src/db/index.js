// src/db/index.js — the async facade over the worker pool.
// This is the ONLY module the rest of the app may import for database access. Nothing outside
// src/db/ ever touches better-sqlite3 directly.
import { availableParallelism } from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import Piscina from 'piscina';
import { env } from '../lib/env.js';

/*
 * ═══ WHY THE WORKERS WAIT ASYNCHRONOUSLY, AND CLOSE THEIR CONNECTIONS BEFORE THEY GO ══════════
 *
 * Terminating the pool segfaulted the process on Windows (exit 139 / 0xC0000005) once a worker had
 * used its better-sqlite3 connection: `npm run migrate`, the seed scripts, and `npm run smoke`'s
 * setup steps died AFTER finishing their work. Package B-core set
 * `v8.setFlagsFromString('--no-parallel-scavenge')` here for it; package B-habits-tasks measured
 * that this did not hold (with the flag: every teardown after one query against a migrated
 * database crashed, 9 of 9; migrate still crashed on the pre-032 code) — and V8 does not support
 * changing a flag after the VM has started. Bisected instead: the crash is the terminate of a
 * worker that sits blocked in Atomics.wait (Piscina's default `atomics: 'sync'` idle wait).
 * With `atomics: 'async'` (Atomics.waitAsync, the thread is not blocked) every run was clean:
 * migrate -> seed-dev-users -> seed-exercises -> seed-demo, 4 of 4 chains, where seed-exercises
 * had crashed 6 of 6. closePool() also lets every worker close its own connection first (a clean
 * WAL checkpoint, no native handle alive at terminate).
 */

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
  // 'async', not Piscina's default 'sync': see the block above. An idle worker waits for its next
  // task with Atomics.waitAsync instead of blocking its thread in Atomics.wait.
  atomics: 'async',
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
export const pregenerateClient = (args) => pool.run(args, { name: 'pregenerateClientTx' });
export const claimProcessorEvent = (args) => pool.run(args, { name: 'claimProcessorEventTx' });
export const applySubscriptionEvent = (args) => pool.run(args, { name: 'applySubscriptionEventTx' });

// The coach's write onto a client's onboarding profile. Named for the same reason as the two
// above it: the link check is a guard, and a guard belongs in a transaction that can act on it.
export const setClientEquipment = (args) => pool.run(args, { name: 'setClientEquipmentTx' });

// GDPR. The export is a READ and still goes through the pool as a named call, because it must run
// in ONE worker transaction: assembled from thirty pool calls it would be thirty read snapshots
// stitched together, and a legal artefact cannot be internally inconsistent.
export const exportMyData = (args) => pool.run(args, { name: 'exportMyDataQuery' });
export const deleteMyAccount = (args) => pool.run(args, { name: 'deleteMyAccountTx' });

// LifeOS core (migration 031). The transactions live in ./tx/lifeos.js and are re-exported by
// worker.js under these exact names — check-route-tx proves every name below resolves. Every coin
// movement inside them goes through ONE postCoinEvent (cap -> event -> ledger).
export const lifeosSettleState = (args) => pool.run(args, { name: 'lifeosSettleStateQuery' });
export const lifeosToday = (args) => pool.run(args, { name: 'lifeosTodayQuery' });
export const userPrefs = (args) => pool.run(args, { name: 'userPrefsQuery' });
export const wallet = (args) => pool.run(args, { name: 'walletQuery' });
export const pointRules = (args) => pool.run(args, { name: 'pointRulesQuery' });
export const setUserPrefs = (args) => pool.run(args, { name: 'setUserPrefsTx' });
export const setPointRules = (args) => pool.run(args, { name: 'setPointRulesTx' });
export const closeLifeDay = (args) => pool.run(args, { name: 'closeLifeDayTx' });
export const markLapsedDays = (args) => pool.run(args, { name: 'markLapsedDaysTx' });
export const awardWorkout = (args) => pool.run(args, { name: 'awardWorkoutTx' });

// LifeOS habits and tasks (migration 032): ./tx/lifeos-habits.js and ./tx/lifeos-tasks.js, re-exported
// by worker.js. Habits pay at the day close (closeLifeDayTx), tasks on completion (completeTaskTx).
export const habits = (args) => pool.run(args, { name: 'habitsQuery' });
export const habit = (args) => pool.run(args, { name: 'habitQuery' });
export const createHabit = (args) => pool.run(args, { name: 'createHabitTx' });
export const updateHabit = (args) => pool.run(args, { name: 'updateHabitTx' });
export const archiveHabit = (args) => pool.run(args, { name: 'archiveHabitTx' });
export const setHabitCount = (args) => pool.run(args, { name: 'setHabitCountTx' });
export const skipHabit = (args) => pool.run(args, { name: 'skipHabitTx' });
export const recordRelapse = (args) => pool.run(args, { name: 'recordRelapseTx' });
export const tasks = (args) => pool.run(args, { name: 'tasksQuery' });
export const task = (args) => pool.run(args, { name: 'taskQuery' });
export const createTask = (args) => pool.run(args, { name: 'createTaskTx' });
export const updateTask = (args) => pool.run(args, { name: 'updateTaskTx' });
export const deleteTask = (args) => pool.run(args, { name: 'deleteTaskTx' });
export const completeTask = (args) => pool.run(args, { name: 'completeTaskTx' });
export const reopenTask = (args) => pool.run(args, { name: 'reopenTaskTx' });
export const materializeRecurringTasks = (args) => pool.run(args, { name: 'materializeRecurringTasksTx' });

// LifeOS challenges and rewards (migration 033): ./tx/lifeos-rewards.js, re-exported by worker.js.
// The draw is made in the worker (crypto.randomInt); a pick creates a task, which pays on completion;
// a redemption is the one LifeOS spend (redeemRewardTx: the balance guard is inside the INSERT).
export const challenges = (args) => pool.run(args, { name: 'challengesQuery' });
export const challenge = (args) => pool.run(args, { name: 'challengeQuery' });
export const challengeToday = (args) => pool.run(args, { name: 'challengeTodayQuery' });
export const createChallenge = (args) => pool.run(args, { name: 'createChallengeTx' });
export const updateChallenge = (args) => pool.run(args, { name: 'updateChallengeTx' });
export const setChallengeArchived = (args) => pool.run(args, { name: 'setChallengeArchivedTx' });
export const deleteChallenge = (args) => pool.run(args, { name: 'deleteChallengeTx' });
export const drawChallenge = (args) => pool.run(args, { name: 'drawChallengeTx' });
export const rerollChallenge = (args) => pool.run(args, { name: 'rerollChallengeTx' });
export const pickChallenge = (args) => pool.run(args, { name: 'pickChallengeTx' });
export const rewards = (args) => pool.run(args, { name: 'rewardsQuery' });
export const reward = (args) => pool.run(args, { name: 'rewardQuery' });
export const redemptions = (args) => pool.run(args, { name: 'redemptionsQuery' });
export const createReward = (args) => pool.run(args, { name: 'createRewardTx' });
export const updateReward = (args) => pool.run(args, { name: 'updateRewardTx' });
export const setRewardArchived = (args) => pool.run(args, { name: 'setRewardArchivedTx' });
export const redeemReward = (args) => pool.run(args, { name: 'redeemRewardTx' });
export const setRedemptionFulfilled = (args) => pool.run(args, { name: 'setRedemptionFulfilledTx' });
// LifeOS calendar (migration 034): ./tx/lifeos-events.js, re-exported by worker.js. The calendar
// moves no coins; materializeRemindersTx is the one write a read triggers (src/lifeos/reminders.js).
export const calendar = (args) => pool.run(args, { name: 'calendarQuery' });
export const event = (args) => pool.run(args, { name: 'eventQuery' });
export const createEvent = (args) => pool.run(args, { name: 'createEventTx' });
export const updateEvent = (args) => pool.run(args, { name: 'updateEventTx' });
export const deleteEvent = (args) => pool.run(args, { name: 'deleteEventTx' });
export const materializeReminders = (args) => pool.run(args, { name: 'materializeRemindersTx' });

/**
 * Drain and destroy the pool — but every worker closes its own connection FIRST (worker.js
 * closeConnection): terminating a worker with an open better-sqlite3 handle segfaulted the process
 * (conn.js closeDb has the measurement). One call per thread, all at once, held together by a
 * shared counter so each worker runs exactly one. A failure there never blocks the shutdown.
 */
export async function closePool() {
  const shared = new SharedArrayBuffer(4);
  try {
    await Promise.all(Array.from({ length: threads }, () => pool.run({ shared, threads }, { name: 'closeConnection' })));
  } catch {
    /* a worker that could not close is terminated below all the same */
  }
  return pool.destroy();
}

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
