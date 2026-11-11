// src/db/conn.js — the worker thread's one encrypted connection, its statement cache, and the
// error re-throw that survives the worker boundary.
//
// Moved out of worker.js (package B0) so the named transactions can live in src/db/tx/<domain>.js
// and still share ONE connection and ONE statement cache per worker thread: an ES module is
// evaluated once per thread, so every importer of this file in a worker gets the same `db`.
//
// IMPORTED ONLY BY THE WORKER SIDE (worker.js, tx/*.js). Importing it from the main thread would
// open a database connection on the event loop, which the owner's rules forbid — the facade
// (src/db/index.js) is the only thing the rest of the app may import.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../lib/dbkey.js';

let db;

export function getDb() {
  if (db) return db;
  // better-sqlite3 does not create missing parent directories — a fresh checkout would
  // otherwise die with SQLITE_CANTOPEN at boot.
  mkdirSync(dirname(process.env.DB_PATH), { recursive: true });
  const conn = new Database(process.env.DB_PATH);
  try {
    // hexkey with a scrypt-derived raw key: no passphrase quoting pitfalls, our own strong KDF
    // instead of the library default, and one master secret can serve several databases by
    // varying the salt.
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    // busy_timeout BEFORE any statement and before the WAL switch: at boot several workers
    // open lazily at once and the journal_mode change needs a lock. With the default timeout
    // of 0 a contending worker throws SQLITE_BUSY instead of waiting.
    conn.pragma('busy_timeout = 5000');
    conn.prepare('SELECT 1').get(); // wrong key surfaces as SQLITE_NOTADB right here
    conn.pragma('journal_mode = WAL');
    conn.pragma('synchronous = NORMAL');
    conn.pragma('foreign_keys = ON');
  } catch (err) {
    conn.close(); // don't leak the handle; a later call retries with a fresh connection
    throw err;
  }
  // Publish only after every pragma succeeded. Caching a half-configured connection (say, with
  // foreign_keys still OFF) would silently corrupt integrity on every subsequent call.
  db = conn;
  return db;
}

/**
 * Close this worker's connection (and drop its statement cache) — called by the pool's shutdown on
 * EVERY worker before Piscina terminates it (db/index.js closePool): a clean WAL checkpoint, and no
 * native handle left alive when the thread is torn down.
 */
export function closeDb() {
  statements.clear();
  if (!db) return false;
  const conn = db;
  db = undefined;
  conn.close();
  return true;
}

const statements = new Map();
export function stmt(sql) {
  let s = statements.get(sql);
  if (!s) {
    s = getDb().prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

/**
 * Re-throw a SQLite error in a form that survives the worker boundary.
 *
 * better-sqlite3 attaches its detail to `code` and to non-enumerable Error fields, and the
 * structured clone that carries an error out of a worker keeps almost none of it — the caller
 * sees a bare `{ code: 'SQLITE_ERROR' }` with no message and no statement. That turns a typo in
 * a query into a blind hunt, which cost real time three separate times before this existed.
 */
export function rethrow(err, sql) {
  const wrapped = new Error(
    `${err?.code ?? 'SQLITE_ERROR'}: ${err?.message ?? 'unknown'}${sql ? ` — while running: ${sql.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
  );
  wrapped.code = err?.code ?? 'SQLITE_ERROR';
  throw wrapped;
}
