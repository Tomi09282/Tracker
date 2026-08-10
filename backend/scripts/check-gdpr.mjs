// scripts/check-gdpr.mjs — an export is a claim that the list is complete.
//
// ═══ THE FAILURE THIS PREVENTS IS SILENT AND IT IS LEGAL ═══════════════════════════════════════
//
// `src/db/gdpr.js` lists the tables an export reads. The claim it makes is not "these tables have
// data in them" — it is "there is no OTHER table holding this person's data". A table added to the
// product and to neither the export nor the exemption list below is data the subject cannot see and
// that nobody has thought about erasing. Nothing fails. No test goes red. The export just quietly
// stops being complete, and the first person to find out is the one who asked for their record.
//
// So the schema is the source of truth: every table with a foreign key into `users` is either read
// by the export, or named in EXEMPT with a reason somebody had to write down.
//
// Run: node scripts/check-gdpr.mjs
import fs from 'node:fs';
import 'dotenv/config';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';
import { EXPORT_TABLES, UNLINK_BEFORE_DELETE } from '../src/db/gdpr.js';

/**
 * Tables that reference a user and are NOT the subject's personal data.
 *
 * Each needs a reason, because the reason is the whole argument. "It has a user_id in it" is not
 * enough to put something in an export, and "it seemed like plumbing" is not enough to leave it out.
 */
const EXEMPT = new Map([
  ['refresh_tokens', 'session credentials — a hash and a family id, useless to the subject and dangerous in a file they email themselves'],
  ['audit_log', 'exported as `audit_of_my_actions`, filtered to actor_id; rows where they are the TARGET are an admin\'s record of a decision'],
  ['users', 'exported as `account`, minus password_hash'],
  ['element_style_config', 'one global admin setting; updated_by names an admin, not a subject'],
  ['exercise_media', 'reached through exercises_authored; the files are on disk, not in the database'],
  ['post_media', 'same — reached through coach_posts'],
  ['coach_profile_specialties', 'reached through coach_profile'],
  ['invite_codes', 'a coach\'s codes are exported nowhere and cascade on erasure; the CODE is a secret'],
  ['invite_redemptions', 'a log of attempts against somebody else\'s code, set null on erasure'],
  ['referrals', 'the coach\'s attribution record, not the referred person\'s data'],
  ['content_reports', 'a report names its reporter AND its subject; exporting either half hands over the other'],
  ['message_reports', 'the same'],
  ['progress_shares', 'a grant to another person; exporting it would name who they shared with'],
  ['progress_access_log', 'a record of who VIEWED — that is the viewer\'s activity'],
  ['coach_follows', 'who follows whom; one side\'s export would name the other'],
  ['conversations', 'the thread is two people; `messages_sent` exports only the subject\'s half'],
  ['message_attachments', 'reached through messages_sent'],
  ['workout_plan_blocks', 'reached through plans_owned'],
  ['workout_plan_days', 'reached through plans_owned'],
  ['workout_plan_exercises', 'reached through plans_owned'],
  ['workout_plan_set_targets', 'reached through plans_owned'],
  ['workout_plan_day_exceptions', 'reached through plans_owned'],
  ['nutrition_plan_days', 'reached through nutrition_plans_owned'],
  ['workout_calendar_feeds', 'exported as `calendar_feeds`, minus the token'],
  ['push_devices', 'exported as `push_devices`, minus the token hash'],
  ['progress_photos', 'exported as `progress_photos_metadata`; the image bytes are not in the database'],
  ['meals', 'plan content, not a personal log — a meal belongs to a nutrition plan DAY and has no user column; reached through nutrition_plans'],
  ['meal_items', 'the same'],
  ['foods', 'a shared food library; owner_user_id marks who contributed one, and it is not personal data'],
  ['schema_migrations', 'not user data at any level'],
]);

const db = new Database(process.env.DB_PATH);
db.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);

const problems = [];

/* ── 1. every table referencing users is accounted for ───────────────────────────────────────── */

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((r) => r.name);

const referencing = tables.filter((name) =>
  db.prepare(`SELECT * FROM pragma_foreign_key_list('${name}')`).all().some((f) => f.table === 'users'),
);

// Which tables the export actually reads, taken from the SQL rather than from a second list.
const exported = new Set(
  EXPORT_TABLES.flatMap(([, sql]) => [...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/gi)].map((m) => m[1])),
);

for (const name of referencing) {
  if (exported.has(name) || EXEMPT.has(name)) continue;
  problems.push(
    `${name} has a foreign key into users and is neither exported nor exempt.\n` +
      '      Somebody\'s data lives there that they cannot see and that nobody has decided how to\n' +
      '      erase. Add it to EXPORT_TABLES, or to EXEMPT with the reason it is not personal data.',
  );
}

// A stale exemption is how a table quietly loses its place in the export.
for (const name of EXEMPT.keys()) {
  if (!referencing.includes(name) && !tables.includes(name)) {
    problems.push(`EXEMPT names ${name}, which is not a table any more — delete the entry`);
  }
}

/* ── 2. the export's statements are all bound and all scoped ─────────────────────────────────── */

for (const [key, sql] of EXPORT_TABLES) {
  if (!sql.includes('?')) {
    problems.push(`the '${key}' export statement binds no parameter — it would export EVERYBODY`);
  }
  if (/\$\{|\+\s*userId|'\s*\+/.test(sql)) {
    problems.push(`the '${key}' export statement interpolates instead of binding`);
  }

  /*
   * ═══ AND IT HAS TO ACTUALLY PREPARE ══════════════════════════════════════════════════════════
   *
   * The first version of this check verified that each statement BOUND a parameter and stopped
   * there. It went green over `SELECT * FROM body_measurements WHERE user_id = ?` — a table whose
   * column is `client_user_id`, not `user_id`. The statement was well-formed, correctly bound, and
   * would have thrown for every person who ever asked for their data.
   *
   * `prepare` compiles the SQL against the real schema and costs nothing. Checking that a query is
   * SHAPED right while never asking whether it RUNS is the same mistake as a test whose subject is
   * absent.
   */
  try {
    db.prepare(sql);
  } catch (e) {
    problems.push(
      `the '${key}' export statement does not compile against the schema:\n` +
        `      ${String(e.message).slice(0, 96)}\n` +
        '      It would throw for every person who asked for their data.',
    );
  }
}

/* ── 3. what the deletion unlinks still matches the schema ───────────────────────────────────── */

for (const [label, sql] of UNLINK_BEFORE_DELETE) {
  const table = /UPDATE\s+([a-z_]+)/i.exec(sql)?.[1];
  const column = /SET\s+([a-z_]+)\s*=\s*NULL/i.exec(sql)?.[1];
  if (!table || !column) {
    problems.push(`the unlink step "${label}" is not a recognisable UPDATE ... SET <col> = NULL`);
    continue;
  }
  const col = db.prepare(`SELECT * FROM pragma_table_info('${table}')`).all().find((c) => c.name === column);
  if (!col) {
    problems.push(`the unlink step "${label}" targets ${table}.${column}, which does not exist`);
  } else if (col.notnull === 1) {
    problems.push(
      `the unlink step "${label}" sets ${table}.${column} to NULL, and that column is NOT NULL.\n` +
        '      The erasure would abort on the last thing it does, after the audit row is written.',
    );
  }
  // The whole reason the step exists: without it the FK would destroy the row instead of freeing it.
  const fk = db
    .prepare(`SELECT * FROM pragma_foreign_key_list('${table}')`)
    .all()
    .find((f) => f.from === column && f.table === 'users');
  if (fk && fk.on_delete !== 'CASCADE') {
    problems.push(
      `the unlink step "${label}" is unnecessary: ${table}.${column} is ON DELETE ${fk.on_delete},\n` +
        '      so the database already frees it. An unnecessary step reads like a load-bearing one.',
    );
  }
}

db.close();

console.log(
  `check-gdpr: ${referencing.length} tables reference users — ` +
    `${referencing.filter((t) => exported.has(t)).length} exported, ${EXEMPT.size} exempt by design, ` +
    `${EXPORT_TABLES.length} export statements, ${UNLINK_BEFORE_DELETE.length} unlink step(s)`,
);

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\ncheck-gdpr FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-gdpr: OK — every table holding a person\'s data is exported or exempt with a reason');
