#!/usr/bin/env node
/**
 * scripts/restore-drill.mjs — the half of a backup that people skip.
 *
 * ═══ AN UNTESTED BACKUP IS NOT A BACKUP ════════════════════════════════════════════════════════
 *
 * `backup.mjs` verifies the file it just wrote, which proves the WRITE worked. It does not prove
 * that anybody can get the product back, and those are different claims — the second one involves
 * a key that may have rotated, a schema the current code may no longer expect, and a person doing
 * this for the first time under pressure.
 *
 * So this restores the newest backup into a scratch copy and asks the questions that matter:
 *
 *   1. does it open with the key that is in .env RIGHT NOW?
 *   2. is its `user_version` one the migrations in this checkout can still run against?
 *   3. is the data actually there — not "a file exists", but rows in the tables the product needs?
 *   4. does a real product query run against it?
 *   5. is it internally consistent, including its foreign keys?
 *
 * Nothing is written to the live database and the scratch copy is removed at the end. The drill can
 * be run any time, including on a laptop, which is the point: a drill nobody dares run is a drill
 * nobody has run.
 *
 * Run: node scripts/restore-drill.mjs [--dir <path>] [--file <path>]
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

const DIR = path.resolve(arg('--dir', process.env.BACKUP_DIR ?? 'backups'));
let source = arg('--file', null);

if (!source) {
  const all = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => /^tracker-.*\.db$/.test(f)).sort()
    : [];
  if (all.length === 0) {
    console.error(`no backups in ${DIR} — run \`node scripts/backup.mjs\` first`);
    process.exit(1);
  }
  source = path.join(DIR, all[all.length - 1]);
}

const ageHours = (Date.now() - fs.statSync(source).mtimeMs) / 3600000;
console.log(`restoring ${path.basename(source)} (${ageHours.toFixed(1)}h old, ${(fs.statSync(source).size / 1024 / 1024).toFixed(1)} MB)\n`);

/*
 * A COPY is restored, not the file itself. Opening a backup read-write is how a drill quietly
 * becomes the only copy: SQLite writes a journal beside it, and a crash mid-drill leaves the backup
 * in a state nobody planned for.
 */
const scratch = path.join(os.tmpdir(), `tracker-restore-drill-${process.pid}.db`);
fs.copyFileSync(source, scratch);

const key = deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT);
let db = null;

try {
  /* 1 — the key in .env today opens the backup taken then. */
  try {
    db = new Database(scratch);
    db.pragma(`hexkey='${key}'`);
    db.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    check('it opens with the key that is in .env right now', true);
  } catch (e) {
    check(
      'it opens with the key that is in .env right now',
      false,
      `${String(e.message).slice(0, 60)} — the key rotated since this backup and the old one is needed`,
    );
    throw e;
  }

  /* 2 — the schema is one this checkout can still work with. */
  {
    const version = db.pragma('user_version', { simple: true });
    const migrations = fs
      .readdirSync(new URL('../src/db/migrations/', import.meta.url))
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .map((f) => Number(f.slice(0, 3)));
    const latest = Math.max(...migrations);
    check(
      'its schema version is one this checkout knows',
      version <= latest,
      `backup v${version}, migrations go to v${latest}${version < latest ? ` — restoring would need ${latest - version} migration(s)` : ''}`,
    );
  }

  /* 3 — the data is there. Not "the file is non-empty": rows, in the tables the product needs. */
  {
    const expect = [
      ['users', 1],
      ['exercises', 100],
      ['measurement_metrics', 1],
      ['languages', 1],
      ['coin_reasons', 1],
    ];
    for (const [table, min] of expect) {
      let n = -1;
      try {
        n = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      } catch { /* missing table reports as -1 */ }
      check(`${table} has at least ${min} row(s)`, n >= min, `${n}`);
    }
  }

  /* 4 — a real product query, not a SELECT 1. */
  {
    try {
      const row = db
        .prepare(
          `SELECT u.id, u.email, u.role,
                  (SELECT COUNT(*) FROM workout_logs l WHERE l.client_user_id = u.id) AS logs
             FROM users u ORDER BY u.id LIMIT 1`,
        )
        .get();
      check('a real product query runs against the restored copy', !!row, row ? `first user id ${row.id}` : 'no rows');
    } catch (e) {
      check('a real product query runs against the restored copy', false, String(e.message).slice(0, 60));
    }
  }

  /* 5 — consistency, including the foreign keys the live database enforces. */
  {
    const integrity = db.pragma('integrity_check', { simple: true });
    check('integrity_check passes', integrity === 'ok', integrity);

    db.pragma('foreign_keys = ON');
    const violations = db.pragma('foreign_key_check');
    check(
      'no foreign key violations',
      violations.length === 0,
      violations.length ? `${violations.length}, first in ${violations[0].table}` : '',
    );
  }

  /* 6 — and the copy is genuinely independent of the live database. */
  {
    const live = new Database(process.env.DB_PATH, { readonly: true });
    live.pragma(`hexkey='${key}'`);
    const liveUsers = live.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    live.close();
    const backupUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    // Not asserted EQUAL: the live database moves on after a backup is taken, and a drill that
    // demanded equality would go red for the most ordinary reason there is.
    console.log(`\n      live database has ${liveUsers} users, this backup has ${backupUsers}`);
    check('the restored copy is readable independently of the live database', backupUsers > 0);
  }
} finally {
  db?.close();
  for (const f of [scratch, `${scratch}-wal`, `${scratch}-shm`]) fs.rmSync(f, { force: true });
}

console.log(`\nrestore drill: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('This backup can be restored. Run the drill after every key rotation and every');
  console.log('migration — those are the two things that turn a good backup into an unusable one.');
}
process.exit(failed ? 1 : 0);
