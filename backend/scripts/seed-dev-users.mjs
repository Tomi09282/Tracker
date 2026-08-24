// scripts/seed-dev-users.mjs — stable local accounts for clicking through the app by hand.
//
// The smoke suite's accounts live in a throwaway temp database and vanish with it, so they are
// no use for manual testing. These are created in the DEV database with fixed addresses.
//
// Refuses to run outside development: fixed credentials are a backdoor anywhere else.
import 'dotenv/config';
import argon2 from 'argon2';
import * as db from '../src/db/index.js';

if (process.env.NODE_ENV === 'production') {
  console.error('refusing to seed fixed-credential accounts in production');
  process.exit(1);
}

const PASSWORD = 'TrackerDev123';
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const USERS = [
  // Named, because the app now shows a name wherever it used to show an address, and a dev fixture
  // that leaves it NULL puts you on the fallback path on every screen without telling you that is
  // what you are looking at. The demo *clients* cover the NULL case on purpose (seed-demo.mjs).
  { email: 'user@tracker.local', role: 'user', displayName: 'Teszt Elek' },
  { email: 'coach@tracker.local', role: 'coach', displayName: 'Kovács Péter' },
  { email: 'admin@tracker.local', role: 'admin', displayName: 'Rendszergazda' },
];

for (const u of USERS) {
  const hash = await argon2.hash(PASSWORD, ARGON2_OPTS);
  // Idempotent: re-running resets the password and role, which is what you want from a dev
  // helper you reach for when you cannot get in.
  // INSERT OR IGNORE, not ON CONFLICT(email): uniqueness here is enforced by an index on
  // `lower(trim(email))`, and an ON CONFLICT target must name a real constraint — a bare column
  // that merely happens to be unique-ish does not qualify.
  await db.run('INSERT OR IGNORE INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)', [
    u.email,
    u.displayName,
    hash,
    u.role,
  ]);
  await db.run(
    'UPDATE users SET password_hash = ?, role = ?, display_name = ?, disabled_at = NULL, failed_logins = 0, next_login_at = 0 WHERE lower(trim(email)) = ?',
    [hash, u.role, u.displayName, u.email],
  );
  console.log(`${u.email.padEnd(24)} ${u.role.padEnd(6)} ${PASSWORD}`);
}

/*
 * ═══ THE SEEDED COACHES GET AN UNLIMITED PLAN ══════════════════════════════════════════════════
 *
 * Found by the seat cap landing: `smoke` links a fresh athlete to the SHARED seeded coach in
 * several sections, and the free tier's cap of 3 refused the second one. Eight assertions went red
 * with codes that named nothing useful — a 404 from `workouts/start` and a 400 from the chat — all
 * of them downstream of one link that was never created.
 *
 * The guard is correct and stays. What was wrong is asking a development fixture to live inside a
 * COMMERCIAL limit: a dev environment where the demo coach can hold three clients is a dev
 * environment nobody can use, and the alternative — raising the free cap so the tests pass — would
 * be letting a test suite set the product's pricing.
 *
 * `verify:seats` is where the cap is proven, with its own fixtures and its own tiers, so nothing is
 * lost by exempting the seed.
 */
for (const u of USERS.filter((x) => x.role === 'coach' || x.role === 'admin')) {
  await db.run(
    `INSERT INTO coach_subscriptions (coach_id, tier_key, status, provider, updated_at)
     SELECT id, 'unlimited', 'active', 'seed', unixepoch() FROM users WHERE lower(trim(email)) = ?
     ON CONFLICT(coach_id) DO UPDATE SET tier_key = 'unlimited', status = 'active', updated_at = unixepoch()`,
    [u.email],
  );
}
console.log('\nseeded coaches are on the unlimited tier — see the note above; the cap is proven in verify:seats');

await db.closePool();
