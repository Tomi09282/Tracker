// scripts/seed-accounts.mjs — provisions privileged accounts for the smoke suite.
//
// Roles are granted directly in the database rather than through an endpoint, because there is
// no self-service path to `coach` or `admin` by design (decision 7B: coach onboarding is
// invite/approval based). Printing ONE JSON object on stdout lets smoke-run pipe it into the
// suite without a temp file.
import 'dotenv/config';
import argon2 from 'argon2';
import * as db from '../src/db/index.js';

const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const PASSWORD = 'SmokePass123x';
const stamp = Date.now();

/*
 * ═══ THE SUITE'S COACHES GET AN UNLIMITED PLAN ═════════════════════════════════════════════════
 *
 * The seat cap landing turned this file into a fixture that could not run the tests. These coaches
 * are fresh accounts, so they start on the free tier, and the suite links several athletes to each
 * across its sections — the circuit fixture, the chat fixture, the plan-clone fixture. The fourth
 * one was refused and TWENTY-SIX assertions went red, none of them mentioning seats: a 404 from
 * `workouts/start`, a 400 from the chat, and finally a TypeError when a section indexed into a
 * conversation that was never opened.
 *
 * Nothing in that list points at the cause, which is the expensive part. The failures are all
 * downstream of one link that was never created, and `smoke` is deliberately black-box — it has no
 * database access with which to notice.
 *
 * The guard is correct and stays; `verify:seats` proves it with its own fixtures and its own tiers.
 * What was wrong is asking a TEST fixture to live inside a COMMERCIAL limit. The alternative —
 * raising the free cap until the suite goes green — would be letting a test suite set the
 * product's pricing.
 */
async function make(label, role) {
  const email = `smoke-${label}-${stamp}@example.com`;
  const hash = await argon2.hash(PASSWORD, ARGON2_OPTS);
  await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, role]);
  if (role === 'coach' || role === 'admin') {
    await db.run(
      `INSERT INTO coach_subscriptions (coach_id, tier_key, status, provider, updated_at)
       SELECT id, 'unlimited', 'active', 'seed', unixepoch() FROM users WHERE email = ?`,
      [email],
    );
  }
  return { email, password: PASSWORD, role };
}

const accounts = {
  coach: await make('coach', 'coach'),
  coach2: await make('coach2', 'coach'),
  admin: await make('admin', 'admin'),
};

await db.closePool();
process.stdout.write(`${JSON.stringify({ accounts })}\n`);
