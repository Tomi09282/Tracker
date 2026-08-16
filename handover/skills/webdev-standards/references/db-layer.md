# DB layer — encrypted SQLite in a Piscina worker pool

Why this design: `better-sqlite3` is deliberately synchronous — every query blocks the Node.js
event loop, which is what freezes an Express server under many concurrent users. Wrapping a sync
call in a Promise fixes nothing. The officially documented fix (better-sqlite3 `docs/threads.md`)
is to run the DB inside worker threads. `piscina` is the standard worker pool;
`better-sqlite3-multiple-ciphers` is the maintained encrypted drop-in fork
(SQLite3MultipleCiphers, ChaCha20-Poly1305 by default).

Packages: `piscina`, `better-sqlite3-multiple-ciphers`.

Rules:
- Each worker owns exactly ONE database connection (connections are not transferable between threads).
- The app imports ONLY `src/db/index.js`. Nothing outside `src/db/` ever touches better-sqlite3 directly.
- A transaction must complete inside a single pool call — it can never span multiple `await`s.
- Simple multi-statement writes use the generic `writeTx`. Business-critical operations that
  need guards or branching (money, inventory) get their OWN named worker function — see
  transaction-endpoints.md; `writeTx` cannot inspect intermediate results.
- Reads fan out across all workers (WAL allows parallel readers). Writes are serialized by SQLite
  itself; `busy_timeout` makes concurrent writers wait instead of throwing SQLITE_BUSY.
- Arguments and results must be structured-cloneable (plain objects, arrays, numbers, strings, BigInt).
- Standalone scripts (seeds, maintenance, rekey) must load the environment BEFORE importing the
  db layer — `import 'dotenv/config';` as the first import — otherwise the workers see no
  DB_PATH/DB_MASTER_KEY and die with a confusing path error.

## src/db/worker.js

```js
// src/db/worker.js — executes inside a Piscina worker thread.
// Each worker lazily opens its own encrypted connection on first use.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../lib/dbkey.js';

let db;

function getDb() {
  if (db) return db;
  // better-sqlite3 does not create missing parent directories — a fresh checkout would
  // otherwise die with SQLITE_CANTOPEN at boot.
  mkdirSync(dirname(process.env.DB_PATH), { recursive: true });
  const conn = new Database(process.env.DB_PATH);
  try {
    // hexkey with a scrypt-derived raw key: no passphrase quoting pitfalls, strong KDF,
    // and one master secret can serve several databases with different salts (see dbkey.js).
    conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
    // busy_timeout BEFORE any statement or the WAL switch: at boot several workers open
    // lazily at once, and the journal_mode change needs a lock — with the default timeout
    // of 0 a contending worker would throw SQLITE_BUSY instead of waiting.
    conn.pragma('busy_timeout = 5000');
    conn.prepare('SELECT 1').get(); // throws SQLITE_NOTADB immediately if the key is wrong
    conn.pragma('journal_mode = WAL');
    conn.pragma('synchronous = NORMAL');
    conn.pragma('foreign_keys = ON');
  } catch (err) {
    conn.close(); // don't leak a file handle; a later call retries with a fresh connection
    throw err;
  }
  // Publish only after every pragma succeeded — caching a half-configured connection
  // (e.g. foreign_keys still OFF) would silently break integrity on subsequent calls.
  db = conn;
  return db;
}

const statements = new Map();
function stmt(sql) {
  let s = statements.get(sql);
  if (!s) {
    s = getDb().prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

export function all({ sql, params = [] }) {
  return stmt(sql).all(...params);
}

export function get({ sql, params = [] }) {
  return stmt(sql).get(...params);
}

export function run({ sql, params = [] }) {
  const info = stmt(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
}

// One logical write = one worker call. IMMEDIATE takes the write lock up front,
// avoiding lock-upgrade SQLITE_BUSY storms under concurrency.
export function writeTx({ steps }) {
  const tx = getDb().transaction((items) =>
    items.map(({ sql, params = [] }) => {
      const info = stmt(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    })
  );
  return tx.immediate(steps);
}

export function migrate({ schemaPath }) {
  getDb().exec(readFileSync(schemaPath, 'utf8'));
}
```

## src/db/index.js

```js
// src/db/index.js — async facade over the worker pool. The ONLY module the app imports for DB access.
import { availableParallelism } from 'node:os';
import Piscina from 'piscina';
import { env } from '../lib/env.js';

// Single-process default: leave one core for the event loop, at least 2 workers so a slow
// query can't starve everything. In clustered mode set DB_POOL_THREADS=2 per process so
// total threads stay ~= core count (see cluster-scaling.md). The value is zod-validated at
// boot — garbage or 0 fails with a named error instead of a Piscina crash.
const threads = env.DB_POOL_THREADS ?? Math.max(2, availableParallelism() - 1);
const pool = new Piscina({
  filename: new URL('./worker.js', import.meta.url).href,
  // Pin min == max: Piscina's default idleTimeout is 0, so idle workers above minThreads
  // are torn down immediately — and every respawn re-runs the scrypt KDF and reopens the DB.
  minThreads: threads,
  maxThreads: threads,
});

export const all = (sql, params = []) => pool.run({ sql, params }, { name: 'all' });
export const get = (sql, params = []) => pool.run({ sql, params }, { name: 'get' });
export const run = (sql, params = []) => pool.run({ sql, params }, { name: 'run' });
export const writeTx = (steps) => pool.run({ steps }, { name: 'writeTx' });
export const migrate = (schemaPath) => pool.run({ schemaPath }, { name: 'migrate' });
export const closePool = () => pool.destroy();
```

## Usage in route handlers

```js
import * as db from '../db/index.js';

const user = await db.get('SELECT id, email, role FROM users WHERE email = ?', [email]);

// writeTx is for SIMPLE multi-statement writes with no guards or branching:
await db.writeTx([
  { sql: 'INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)', params: [userId, title, body] },
  { sql: 'UPDATE users SET post_count = post_count + 1 WHERE id = ?', params: [userId] },
]);
// Money/inventory operations must NOT use writeTx — they need in-UPDATE guards and branching.
// See transaction-endpoints.md `transfer()` for the named-transaction pattern.
```

## Migrations

- Keep the full schema in `src/db/schema.sql` using `CREATE TABLE IF NOT EXISTS` /
  `CREATE INDEX IF NOT EXISTS`; call `await db.migrate(path.resolve('./src/db/schema.sql'))`
  once at startup (see server-skeleton.md).
- For evolving production schemas, switch to numbered migration files gated by
  `PRAGMA user_version` — apply each file in a transaction, then bump `user_version`.

## Performance checklist when queries get slow

1. `EXPLAIN QUERY PLAN` on hot queries — missing indexes cause most "SQLite is slow" freezes.
2. Index every column used in WHERE / JOIN / ORDER BY.
3. Keep write transactions short; never do network/CPU work inside `writeTx` steps.
4. Only consider Postgres when you need multiple app servers, sustained thousands of write TPS,
   or the data outgrows a single machine — the worker pool removes the event-loop bottleneck.