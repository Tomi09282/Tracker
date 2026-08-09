/**
 * What stops the product being emptied of admins, seen to work.
 *
 * The HTTP walk could not show it. When two admins demote each other, the first write bumps the
 * loser's `session_version`, so the loser's request is thrown out by `requireAuth` before it ever
 * reaches a transaction. The invariant held — but it held by session invalidation, and the guard
 * written to hold it was never consulted.
 *
 * So it is exercised HERE, at the transaction boundary. Two concurrent pool calls land in two
 * worker threads on one database; the IMMEDIATE transactions serialise, and the second one reads
 * the first one's effect — including the fact that it is no longer an admin.
 */
import * as db from '../src/db/index.js';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const admins = async () =>
  (await db.all("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled_at IS NULL"))[0].n;

const [seeded] = await db.all("SELECT id FROM users WHERE email = 'admin@tracker.local'");
await db.run("UPDATE users SET role = 'user' WHERE id = ?", [seeded.id]);

for (const email of ['guard-a@probe.local', 'guard-b@probe.local']) {
  await db.run('DELETE FROM users WHERE email = ?', [email]);
  await db.run("INSERT INTO users (email, password_hash, role) VALUES (?, 'x', 'admin')", [email]);
}
const [a] = await db.all("SELECT id FROM users WHERE email = 'guard-a@probe.local'");
const [b] = await db.all("SELECT id FROM users WHERE email = 'guard-b@probe.local'");

check('two admins to start', (await admins()) === 2, `${await admins()}`);

// Both demotions issued together, straight at the transaction. No middleware in between, so
// neither can be thrown out before the guard is consulted.
const [ra, rb] = await Promise.all([
  db.setUserRole({ actorId: a.id, targetId: b.id, role: 'user', requestId: 'probe-a' }),
  db.setUserRole({ actorId: b.id, targetId: a.id, role: 'user', requestId: 'probe-b' }),
]);

console.log(`    A demotes B -> ${ra.outcome}`);
console.log(`    B demotes A -> ${rb.outcome}`);

const outcomes = [ra.outcome, rb.outcome];
// WHAT ACTUALLY HOLDS THE INVARIANT, measured rather than assumed.
//
// The first version of this file asserted a last-admin count and failed: the loser came back
// 'not_an_admin'. The first write had already demoted it, and the actor check re-reads the role
// from the DATABASE inside the write lock. The count could never have fired — the actor is always
// an enabled admin and never the target — so it was deleted rather than kept as a safety net that
// is not one.
check(
  'exactly one demotion applies; the loser is refused because it is no longer an admin',
  outcomes.filter((o) => o === 'applied').length === 1 && outcomes.includes('not_an_admin'),
  outcomes.join(' / '),
);
check('and an admin survives', (await admins()) === 1, `${await admins()}`);

// The other refusal the transaction owns, since the route's pre-check is gone.
{
  const survivor = (await db.all("SELECT id FROM users WHERE role='admin' AND disabled_at IS NULL"))[0];
  const self = await db.setUserRole({ actorId: survivor.id, targetId: survivor.id, role: 'user', requestId: 'probe-self' });
  check('an admin cannot change their own role, refused inside the transaction', self.outcome === 'cannot_change_own_role', self.outcome);

  const notAdmin = await db.setUserRole({ actorId: b.id === survivor.id ? a.id : b.id, targetId: survivor.id, role: 'user', requestId: 'probe-x' });
  check('a demoted account cannot demote anybody — the actor role is re-read from the database', notAdmin.outcome === 'not_an_admin', notAdmin.outcome);
}

await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [seeded.id]);
await db.run("DELETE FROM users WHERE email IN ('guard-a@probe.local','guard-b@probe.local')");
check('dev database restored to one seeded admin', (await admins()) === 1, `${await admins()}`);

await db.closePool();
console.log(`\nlast-admin guard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
