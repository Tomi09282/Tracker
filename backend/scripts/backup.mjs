#!/usr/bin/env node
/**
 * scripts/backup.mjs — an encrypted snapshot, taken while the server is running.
 *
 * ═══ VACUUM INTO, NOT db.backup() ══════════════════════════════════════════════════════════════
 *
 * The house rule names both, and the reason is the encryption. `db.backup()` copies pages; with
 * SQLCipher that path has to be told about the key separately, and getting it wrong produces a file
 * that looks like a backup and is a plaintext copy of every user's health data. `VACUUM INTO` runs
 * inside the SOURCE connection, which is already keyed, and writes the result through the same
 * cipher.
 *
 * MEASURED, not assumed — nothing in this repo had established that SQLCipher carries the key
 * through a VACUUM INTO:
 *
 *     first 16 bytes: "1ç39Ì_ýwx5"   (a plaintext file starts "SQLite format 3")
 *     opened with the key: 19 users, user_version 25 — matches the source
 *     opened without it:   refused, "file is not a database"
 *
 * ═══ AND IT IS SAFE TO RUN AGAINST A LIVE DATABASE ═════════════════════════════════════════════
 *
 * `VACUUM INTO` takes a read transaction. In WAL mode — which every connection here sets — readers
 * do not block writers, so the server keeps serving while this runs. The snapshot is the database as
 * of the moment the read began: internally consistent, and possibly a few seconds behind by the time
 * the file is closed. That is what a backup is.
 *
 * Run: node scripts/backup.mjs [--dir <path>] [--keep <n>]
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const DIR = path.resolve(arg('--dir', process.env.BACKUP_DIR ?? 'backups'));
const KEEP = Number(arg('--keep', '14'));

fs.mkdirSync(DIR, { recursive: true });

// ISO, colons stripped so the name is a valid filename on Windows. Sorting the names sorts the
// backups, which is what the retention sweep below relies on.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(DIR, `tracker-${stamp}.db`);

if (fs.existsSync(target)) {
  console.error(`refusing to overwrite ${target}`);
  process.exit(1);
}

const key = deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT);
const src = new Database(process.env.DB_PATH, { readonly: true });
src.pragma(`hexkey='${key}'`);

const started = Date.now();
const users = src.prepare('SELECT COUNT(*) AS n FROM users').get().n;
const version = src.pragma('user_version', { simple: true });

// The `?` is bound, not interpolated — the path comes from an argument and a filename with a quote
// in it would otherwise be a SQL injection into a maintenance script.
src.prepare('VACUUM INTO ?').run(target);
src.close();

const bytes = fs.statSync(target).size;

/*
 * ═══ THE SNAPSHOT IS VERIFIED BEFORE THIS SCRIPT CALLS ITSELF SUCCESSFUL ══════════════════════
 *
 * An unverified backup is a file. The three questions that make it a backup are asked here, on the
 * artefact that was just written, and a failure deletes it rather than leaving something that will
 * be trusted at three in the morning.
 */
const problems = [];
{
  const head = fs.readFileSync(target).subarray(0, 16).toString('latin1');
  if (head.startsWith('SQLite format 3')) {
    problems.push('the file is PLAINTEXT — it has the unencrypted SQLite header');
  }

  let check = null;
  try {
    check = new Database(target, { readonly: true });
    check.pragma(`hexkey='${key}'`);
    const n = check.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const v = check.pragma('user_version', { simple: true });
    if (n !== users) problems.push(`row count differs: source ${users}, backup ${n}`);
    if (v !== version) problems.push(`user_version differs: source ${version}, backup ${v}`);
    const integrity = check.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') problems.push(`integrity_check says: ${integrity}`);
  } catch (e) {
    problems.push(`cannot be opened with the key: ${e.message}`);
  } finally {
    check?.close();
  }
}

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  fs.rmSync(target, { force: true });
  console.error('\nbackup FAILED — the file was deleted rather than left to be trusted');
  process.exit(1);
}

/* ── retention ───────────────────────────────────────────────────────────────────────────────── */

const all = fs
  .readdirSync(DIR)
  .filter((f) => /^tracker-.*\.db$/.test(f))
  .sort();
const pruned = all.slice(0, Math.max(0, all.length - KEEP));
for (const f of pruned) fs.rmSync(path.join(DIR, f), { force: true });

console.log(
  `backup: ${path.basename(target)} — ${(bytes / 1024 / 1024).toFixed(1)} MB, ` +
    `${users} users, user_version ${version}, ${Date.now() - started}ms`,
);
console.log(`        encrypted, opens with the key, integrity_check ok`);
console.log(`        ${all.length - pruned.length} kept in ${DIR}${pruned.length ? `, ${pruned.length} pruned` : ''}`);
console.log('');
console.log('        THE KEY IS NOT IN THIS DIRECTORY, and must never be: a backup beside its key');
console.log('        is a plaintext backup with extra steps. DB_MASTER_KEY lives in .env, which is');
console.log('        gitignored — store it somewhere this directory is not.');
