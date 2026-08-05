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

async function make(label, role) {
  const email = `smoke-${label}-${stamp}@example.com`;
  const hash = await argon2.hash(PASSWORD, ARGON2_OPTS);
  await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, role]);
  return { email, password: PASSWORD, role };
}

const accounts = {
  coach: await make('coach', 'coach'),
  coach2: await make('coach2', 'coach'),
  admin: await make('admin', 'admin'),
};

await db.closePool();
process.stdout.write(`${JSON.stringify({ accounts })}\n`);
