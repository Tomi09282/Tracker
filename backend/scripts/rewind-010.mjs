/*
 * scripts/rewind-010.mjs — un-apply migration 010 so a corrected version can take its place.
 *
 * This is legitimate exactly once and only here: 010 landed on a solo development database minutes
 * ago, every table it created is EMPTY (asserted below, not assumed), and no application code
 * references it yet. Editing the file and re-applying beats shipping an 011 that rebuilds five
 * tables to widen two CHECK constraints on day one.
 *
 * It would NOT be legitimate against a database another machine has migrated. A migration that has
 * left this laptop is immutable, and the assertion below is what stops this script being reached
 * for later out of habit.
 *
 * Usage: node scripts/rewind-010.mjs
 */
import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

const db = new Database(process.env.DB_PATH);
// The same derivation the worker uses. The file is encrypted; an unkeyed open reads as corrupt.
db.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
db.pragma('foreign_keys = OFF');

/** Children before parents, so the drops succeed even with foreign keys re-enabled. */
const TABLES = [
  'workout_pr_events',
  'workout_log_sets',
  'workout_log_exercises',
  'workout_logs',
  'workout_calendar_feeds',
  'workout_plan_day_exceptions',
  'workout_plan_set_targets',
  'workout_plan_exercises',
  'workout_plan_blocks',
  'workout_plan_days',
  'workout_plans',
  'body_area_muscle_map',
];

const populated = [];
for (const t of TABLES) {
  // Reference data the migration re-inserts on the way back in; its presence is not user data.
  if (t === 'body_area_muscle_map') continue;
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  if (!exists) continue;
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
  if (n > 0) populated.push(`${t}: ${n} rows`);
}

if (populated.length) {
  console.error(`rewind refused — these tables hold data: ${populated.join(', ')}`);
  console.error('Write an 011 migration instead. Rewinding is only honest on an empty schema.');
  process.exit(1);
}

const before = db.pragma('user_version', { simple: true });

db.exec('BEGIN IMMEDIATE');
try {
  for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);

  // The one non-table change 010 made. `ADD COLUMN` has no `IF NOT EXISTS` in SQLite, so leaving
  // this behind would abort the re-run on "duplicate column name" — after the drops had already
  // committed, which is the worst possible half-state.
  const cols = db.prepare('PRAGMA table_info(onboarding_profiles)').all().map((c) => c.name);
  if (cols.includes('timezone')) db.exec('ALTER TABLE onboarding_profiles DROP COLUMN timezone');

  db.pragma('user_version = 9');
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error(`rewind failed, nothing changed: ${err.message}`);
  process.exit(1);
}

const after = db.pragma('user_version', { simple: true });
const left = db
  .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'workout%' OR name LIKE 'body_area%'")
  .get().n;
db.close();

console.log(`rewind: user_version ${before} → ${after}, ${left} workout objects remaining`);
