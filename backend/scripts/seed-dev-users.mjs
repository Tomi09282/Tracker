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
  { email: 'user@tracker.local', role: 'user' },
  { email: 'coach@tracker.local', role: 'coach' },
  { email: 'admin@tracker.local', role: 'admin' },
];

for (const u of USERS) {
  const hash = await argon2.hash(PASSWORD, ARGON2_OPTS);
  // Idempotent: re-running resets the password and role, which is what you want from a dev
  // helper you reach for when you cannot get in.
  // INSERT OR IGNORE, not ON CONFLICT(email): uniqueness here is enforced by an index on
  // `lower(trim(email))`, and an ON CONFLICT target must name a real constraint — a bare column
  // that merely happens to be unique-ish does not qualify.
  await db.run('INSERT OR IGNORE INTO users (email, password_hash, role) VALUES (?, ?, ?)', [
    u.email,
    hash,
    u.role,
  ]);
  await db.run(
    'UPDATE users SET password_hash = ?, role = ?, disabled_at = NULL, failed_logins = 0, next_login_at = 0 WHERE lower(trim(email)) = ?',
    [hash, u.role, u.email],
  );
  console.log(`${u.email.padEnd(24)} ${u.role.padEnd(6)} ${PASSWORD}`);
}

await db.closePool();
