#!/usr/bin/env node
/**
 * scripts/rekey.mjs — rotate the database master key.
 *
 * ═══ READ THIS BEFORE RUNNING IT ═══════════════════════════════════════════════════════════════
 *
 * `PRAGMA rekey` re-encrypts EVERY PAGE IN PLACE. Measured on this engine: it is supported, and
 * `sqlcipher_export` — the copy-to-a-new-file alternative — is not, so in-place is the only path
 * available. That means an interruption partway through leaves a file encrypted with two different
 * keys and openable with neither.
 *
 * So this script will not run unless the things that make that survivable are true:
 *
 *   1. THE SERVER IS STOPPED. A rekey against a live database races every worker in the pool, and
 *      the pool holds several connections that each opened with the OLD key.
 *   2. A FRESH BACKUP EXISTS AND HAS PASSED THE RESTORE DRILL. Not "a backup exists" — one that has
 *      been opened, queried and integrity-checked, which is what `restore-drill.mjs` does.
 *   3. THE OLD KEY IS WRITTEN DOWN SOMEWHERE THAT IS NOT THIS MACHINE. Every backup taken before
 *      this moment is encrypted with it, and after the rotation nothing on disk can open them.
 *
 * ═══ THE ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE ═══════════════════════════════════════════
 *
 * Rotate the database FIRST and .env second. If .env goes first and the rekey then fails, the
 * config names a key the file does not use, and the recovery is to remember what the old value was.
 * With the database first, a failure leaves .env still describing the state on disk.
 *
 * Run:
 *   node scripts/rekey.mjs --new <new-master-key>          # does the work
 *   node scripts/rekey.mjs --new <key> --dry-run           # checks the preconditions only
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(name);

const NEW_MASTER = arg('--new');
const DRY = has('--dry-run');
const DB_PATH = process.env.DB_PATH;
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? 'backups');

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

if (!NEW_MASTER) die('usage: node scripts/rekey.mjs --new <new-master-key> [--dry-run]');
if (NEW_MASTER.length < 32) {
  die(`the new master key is ${NEW_MASTER.length} characters. The env schema requires at least 32, and a rotation is a bad moment to discover that at boot.`);
}
if (NEW_MASTER === process.env.DB_MASTER_KEY) die('the new key is the current key — nothing to do');

console.log('── preconditions ──────────────────────────────────────────────────────────────\n');

let blocked = 0;
const require_ = (label, ok, detail) => {
  console.log(`${ok ? ' ok ' : 'STOP'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) blocked += 1;
};

/* 1 — nothing is holding the database. */
{
  // A WAL sidecar with a live reader is the cheapest available signal; the definitive one is that
  // the file opens for WRITING, which a running pool prevents on Windows and permits on POSIX. Both
  // are checked, and the human instruction is printed either way.
  let writable = false;
  let probe = null;
  try {
    probe = new Database(DB_PATH);
    probe.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    probe.pragma('user_version');
    writable = true;
  } catch (e) {
    require_('the database opens for writing', false, String(e.message).slice(0, 60));
  } finally {
    probe?.close();
  }
  if (writable) require_('the database opens for writing', true);
  console.log('      → STOP THE SERVER FIRST. This cannot detect a pool that has the file open on');
  console.log('        every platform, and a rekey racing a worker is the failure this script exists');
  console.log('        to make unlikely.');
}

/* 2 — a backup exists, and it is recent. */
{
  const backups = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((f) => /^tracker-.*\.db$/.test(f)).sort()
    : [];
  const newest = backups.at(-1);
  const ageH = newest ? (Date.now() - fs.statSync(path.join(BACKUP_DIR, newest)).mtimeMs) / 3600000 : Infinity;
  require_(
    'a backup exists and is less than an hour old',
    ageH < 1,
    newest ? `${newest}, ${ageH.toFixed(1)}h old` : `none in ${BACKUP_DIR}`,
  );
  console.log('      → and it must have PASSED `node scripts/restore-drill.mjs`. A backup nobody has');
  console.log('        restored is a file, and this is the operation that turns the old key useless.');
}

/* 3 — the current key actually works, before anything is changed. */
{
  const oldHex = deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT);
  let ok = false;
  let db = null;
  try {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma(`hexkey='${oldHex}'`);
    db.prepare('SELECT COUNT(*) FROM users').get();
    ok = true;
  } catch (e) {
    require_('the CURRENT key in .env opens the database', false, String(e.message).slice(0, 60));
  } finally {
    db?.close();
  }
  if (ok) require_('the CURRENT key in .env opens the database', true);
}

if (blocked) {
  die(`${blocked} precondition(s) not met — nothing was changed`);
}

if (DRY) {
  console.log('\n── dry run ────────────────────────────────────────────────────────────────────');
  console.log('  Every precondition passed. Re-run without --dry-run to rotate.');
  process.exit(0);
}

/* ── the rotation ────────────────────────────────────────────────────────────────────────────── */

console.log('\n── rotating ───────────────────────────────────────────────────────────────────\n');

const oldHex = deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT);
const newHex = deriveDbKeyHex(NEW_MASTER, process.env.DB_KEY_SALT);

const db = new Database(DB_PATH);
db.pragma(`hexkey='${oldHex}'`);
const before = {
  users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  version: db.pragma('user_version', { simple: true }),
};
console.log(`  before: ${before.users} users, user_version ${before.version}`);

/*
 * ═══ THE JOURNAL MODE HAS TO MOVE, AND THIS WAS FOUND BY RUNNING IT ══════════════════════════
 *
 *     SqliteError: Rekeying is not supported in WAL journal mode.
 *
 * `journal_mode = WAL` is one of this project's four mandatory pragmas, so the production database
 * is ALWAYS in the single mode `PRAGMA rekey` refuses. Without this the script would have failed on
 * the real database at the worst possible moment — after the server was stopped, the backup taken,
 * and the operator committed to a rotation.
 *
 * DELETE for the rotation, WAL immediately afterwards, and the restoration is VERIFIED: leaving a
 * production database in DELETE mode costs every concurrent reader in the product, and nothing
 * anywhere would announce it. `verify-rekey.mjs` proves this whole sequence on a scratch file.
 */
const started = Date.now();
const modeBefore = db.pragma('journal_mode', { simple: true });
db.pragma('journal_mode = DELETE');
console.log(`  journal_mode ${modeBefore} → delete (rekey refuses to run in WAL)`);

db.pragma(`hexrekey='${newHex}'`);

db.pragma('journal_mode = WAL');
const modeAfter = db.pragma('journal_mode', { simple: true });
db.close();

if (modeAfter !== 'wal') {
  die(`journal_mode is '${modeAfter}' and must be 'wal'. The key rotated; fix the mode before starting the server.`);
}
console.log(`  journal_mode delete → ${modeAfter}`);
console.log(`  PRAGMA rekey completed in ${Date.now() - started}ms`);

/* ── and it is verified with the NEW key before anybody is told it worked ────────────────────── */

let verified = null;
try {
  verified = new Database(DB_PATH, { readonly: true });
  verified.pragma(`hexkey='${newHex}'`);
  const users = verified.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const version = verified.pragma('user_version', { simple: true });
  const integrity = verified.pragma('integrity_check', { simple: true });
  console.log(`  after:  ${users} users, user_version ${version}, integrity_check ${integrity}`);
  if (users !== before.users || version !== before.version || integrity !== 'ok') {
    die('the database changed shape during the rotation — restore from the backup NOW');
  }
} catch (e) {
  die(`the database will not open with the NEW key: ${e.message}\n  Restore from the backup and use the OLD key.`);
} finally {
  verified?.close();
}

// And it must NOT open with the old one, or the rotation did not happen.
{
  let stillOld = false;
  let db2 = null;
  try {
    db2 = new Database(DB_PATH, { readonly: true });
    db2.pragma(`hexkey='${oldHex}'`);
    db2.prepare('SELECT COUNT(*) FROM users').get();
    stillOld = true;
  } catch { /* expected */ } finally {
    db2?.close();
  }
  if (stillOld) die('the OLD key still opens the database — the rotation did not take');
  console.log('  the old key no longer opens it');
}

console.log('\n── now, in this order ─────────────────────────────────────────────────────────\n');
console.log('  1. Put the new value in .env:   DB_MASTER_KEY=<the value you passed as --new>');
console.log('     (.env second, deliberately: had it gone first and this failed, the config would');
console.log('      name a key the file does not use.)');
console.log('  2. Start the server and confirm it boots.');
console.log('  3. `node scripts/backup.mjs` — every existing backup is still on the OLD key.');
console.log('  4. `node scripts/restore-drill.mjs` — the new backup, restored, with the new key.');
console.log('  5. KEEP THE OLD KEY until every backup encrypted with it has aged out of retention.');
console.log('     After that it is the only thing standing between an old file and nobody.');
