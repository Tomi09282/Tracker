#!/usr/bin/env node
/**
 * verify-rekey — the rotation mechanism, on a database nobody needs.
 *
 * ═══ WHY THIS EXISTS SEPARATELY FROM rekey.mjs ═════════════════════════════════════════════════
 *
 * `rekey.mjs` has a `--dry-run` that checks its preconditions, and preconditions passing is not the
 * same as the rotation working. The rotation itself can only be proved by doing it — and doing it to
 * the real database means changing the operator's key, which is not something a verification script
 * gets to decide.
 *
 * So the MECHANISM is proved here on a scratch file: create, key, fill, rotate, and then assert both
 * directions — the new key opens it and the old one does not. If `PRAGMA rekey` ever stops working
 * on this engine, or silently no-ops, this is what says so, before somebody finds out on the
 * production database with the old key already deleted.
 *
 * Measured on the way in: `PRAGMA rekey` is supported by better-sqlite3-multiple-ciphers and
 * `sqlcipher_export` is NOT, so in-place rotation is the only path available. That is why rekey.mjs
 * insists on a fresh, drill-tested backup: an interrupted in-place rekey leaves a file encrypted
 * with two keys and openable with neither.
 *
 * Run: npm run verify:rekey
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

const SALT = process.env.DB_KEY_SALT;
const OLD = 'verify-rekey-old-master-key-padded-to-length';
const NEW = 'verify-rekey-new-master-key-padded-to-length';
const oldHex = deriveDbKeyHex(OLD, SALT);
const newHex = deriveDbKeyHex(NEW, SALT);

check('the two derived keys differ', oldHex !== newHex, `${oldHex.slice(0, 8)}… vs ${newHex.slice(0, 8)}…`);

const file = path.join(os.tmpdir(), `verify-rekey-${process.pid}.db`);
const sidecars = [file, `${file}-wal`, `${file}-shm`];
for (const f of sidecars) fs.rmSync(f, { force: true });

const open = (key, opts = {}) => {
  const d = new Database(file, opts);
  d.pragma(`hexkey='${key}'`);
  return d;
};

try {
  /* ── a database with something in it ────────────────────────────────────────────────────── */
  {
    const d = open(oldHex);
    d.pragma('journal_mode = WAL');
    d.exec('CREATE TABLE secrets (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    const ins = d.prepare('INSERT INTO secrets (body) VALUES (?)');
    for (let i = 0; i < 50; i += 1) ins.run(`row-${i}-with-recognisable-plaintext`);
    d.pragma('user_version = 99');
    d.close();
    check('a scratch database was created and keyed', fs.existsSync(file));
  }

  /* ── it is genuinely encrypted before anything else is claimed ──────────────────────────── */
  {
    const head = fs.readFileSync(file).subarray(0, 16).toString('latin1');
    check('it does not carry the plaintext SQLite header', !head.startsWith('SQLite format 3'), JSON.stringify(head.slice(0, 8)));
    const raw = fs.readFileSync(file).toString('latin1');
    check('and the row text is not sitting in the file', !raw.includes('recognisable-plaintext'));
  }

  /* ── rotate ─────────────────────────────────────────────────────────────────────────────── */
  {
    /*
     * ═══ REKEYING IS NOT SUPPORTED IN WAL MODE, AND EVERY CONNECTION HERE SETS WAL ═══════════
     *
     * Found by running this probe rather than by reading anything:
     *
     *     SqliteError: Rekeying is not supported in WAL journal mode.
     *
     * `journal_mode = WAL` is one of this project's four mandatory pragmas, so the production
     * database is ALWAYS in the one mode `PRAGMA rekey` refuses. A rekey script that did not know
     * this would fail on the real database at the worst possible moment — after the operator had
     * stopped the server, taken a backup and committed to a rotation.
     *
     * The journal mode has to be switched to DELETE for the rotation and back to WAL afterwards.
     * Both switches are asserted below: leaving a production database in DELETE mode would quietly
     * cost every concurrent reader in the product, and nothing would announce it.
     */
    const d = open(oldHex);
    const before = d.prepare('SELECT COUNT(*) AS n FROM secrets').get().n;

    const wasMode = d.pragma('journal_mode', { simple: true });
    check('the scratch database starts in WAL, like production', wasMode === 'wal', wasMode);

    d.pragma('journal_mode = DELETE');
    check('journal_mode switched to DELETE for the rotation', d.pragma('journal_mode', { simple: true }) === 'delete');

    d.pragma(`hexrekey='${newHex}'`);

    d.pragma('journal_mode = WAL');
    check('and back to WAL afterwards', d.pragma('journal_mode', { simple: true }) === 'wal');

    d.close();
    check('PRAGMA rekey completed', true, `${before} rows before`);
  }

  /* ── BOTH directions, because only one of them is loud ──────────────────────────────────── */
  {
    let n = -1;
    let version = -1;
    let integrity = '';
    try {
      const d = open(newHex, { readonly: true });
      n = d.prepare('SELECT COUNT(*) AS n FROM secrets').get().n;
      version = d.pragma('user_version', { simple: true });
      integrity = d.pragma('integrity_check', { simple: true });
      d.close();
    } catch (e) {
      check('the NEW key opens it', false, String(e.message).slice(0, 60));
    }
    check('the NEW key opens it', n === 50, `${n} rows`);
    check('with the schema version intact', version === 99, `user_version ${version}`);
    check('and integrity_check passes', integrity === 'ok', integrity);
  }

  {
    // The assertion that catches a rekey that silently did nothing — the failure mode where
    // everything looks fine until the old key is deleted.
    let stillOpens = false;
    let d = null;
    try {
      d = open(oldHex, { readonly: true });
      d.prepare('SELECT COUNT(*) FROM secrets').get();
      stillOpens = true;
    } catch { /* expected */ } finally {
      d?.close();
    }
    check('and the OLD key does NOT — the rotation actually took', !stillOpens);
  }
} finally {
  for (const f of sidecars) {
    try {
      fs.rmSync(f, { force: true });
    } catch { /* Windows holds a handle briefly after a failed open; the temp dir sweeps it */ }
  }
}

console.log(`\nverify-rekey: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
