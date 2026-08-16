# Data scaling & recovery

Why this design: [db-migrations-backups.md](db-migrations-backups.md) gives point-in-time *snapshots* (a
nightly `VACUUM INTO`); this file adds everything between and beyond them — **continuous** replication
so you can recover to any second, **bounded growth** so the hot DB stays cache-resident, **caching** for
hot reads, a **job queue** so slow work leaves the request path, **scheduled maintenance** so the file
and planner stay healthy, and the **exit ramp to Postgres** when one machine is no longer enough. The
through-line: everything preserves the at-rest encryption from [db-layer.md](db-layer.md), and every scale
lever (Redis, BullMQ, Postgres) is *deferred* until a single box measurably can't cope — the same trigger,
stated once and reused.

## Litestream — continuous replication + point-in-time recovery [must]

Rationale: nightly snapshots lose up to a day; Litestream streams WAL frames to object storage so you can
restore to any second with near-zero data loss and no app code.

Litestream runs as a **sidecar** (its own process/container), tails the SQLite WAL, and ships frames to
S3/B2/local disk. It needs WAL mode (already set in [db-layer.md](db-layer.md)) and does its own
checkpointing — so **leave `wal_autocheckpoint` at its default and let Litestream manage checkpoints**; a
manual `wal_checkpoint(TRUNCATE)` that races Litestream can drop frames it hasn't shipped yet (see the
maintenance section for how to coexist). `busy_timeout=5000` already lets the app wait out Litestream's
brief checkpoint lock instead of throwing `SQLITE_BUSY`.

> **Encrypted-SQLite caveat — read this twice.** Litestream replicates the *physical, already-encrypted*
> pages. It never sees plaintext and never needs your key. The consequence: a restored replica is **usable
> only with the same scrypt-derived key** — i.e. the same `DB_MASTER_KEY` + `DB_KEY_SALT`. If the key is
> lost, the replica is **unrecoverable ciphertext.** Back the key up in a **separate** secret store from the
> replica bucket (co-locating them = shipping a plaintext DB), exactly as in
> [db-migrations-backups.md](db-migrations-backups.md) and [env-and-secrets.md](env-and-secrets.md).

```yaml
# /etc/litestream.yml — one DB, replicated to B2/S3. Litestream authenticates to the bucket
# via env (LITESTREAM_ACCESS_KEY_ID / LITESTREAM_SECRET_ACCESS_KEY), never a value in this file.
dbs:
  - path: /opt/app/data/app.db          # must equal DB_PATH; Litestream opens the SAME file the app uses
    replicas:
      - type: s3
        bucket: app-litestream
        path: app.db
        endpoint: s3.us-west-002.backblazeb2.com   # omit for AWS S3
        # Frames are already-encrypted SQLite pages; bucket-side encryption is defense-in-depth, not required.
        retention: 720h                  # 30d of restore window
        snapshot-interval: 24h           # a fresh full snapshot daily bounds replay length on restore
```

```ini
# /etc/systemd/system/litestream.service — starts BEFORE the app so no early writes are missed.
[Unit]
Description=Litestream
After=network.target
Before=app.service                         # enforce the ordering the comment above promises
[Service]
Restart=always
EnvironmentFile=/etc/app/litestream.env    # bucket creds only — NOT DB_MASTER_KEY (key stays separate)
ExecStart=/usr/bin/litestream replicate -config /etc/litestream.yml
[Install]
WantedBy=multi-user.target
```

Restore runbook — **rehearse it on a spare box before you need it** (an untested restore is a hope):

```bash
# 1. Stop the app AND Litestream so nothing writes the target path during restore.
systemctl stop app litestream
# 2. Move the live DB aside — never delete until the restore is verified.
mv /opt/app/data/app.db /opt/app/data/app.db.pre-restore
# 3. Restore. -timestamp gives PITR to any second in the retention window (omit for latest).
litestream restore -config /etc/litestream.yml \
  -timestamp 2026-07-04T02:59:00Z /opt/app/data/app.db
# 4. Prove it opens with THIS environment's key BEFORE booting (same probe as db-migrations-backups.md).
node -e "import('dotenv/config').then(async()=>{ \
  const {default:D}=await import('better-sqlite3-multiple-ciphers'); \
  const {deriveDbKeyHex}=await import('./src/lib/dbkey.js'); \
  const dbc=new D(process.env.DB_PATH); \
  dbc.pragma(\`hexkey='\${deriveDbKeyHex(process.env.DB_MASTER_KEY,process.env.DB_KEY_SALT)}'\`); \
  console.log('select:',dbc.prepare('SELECT 1 AS ok').get()); \
  console.log('integrity:',dbc.pragma('integrity_check',{simple:true})); });"
# 5. Start Litestream first (normal boot order), then the app. Litestream snapshots the restored
#    file as a fresh generation, so nothing the app writes afterwards goes untailed.
systemctl start litestream && systemctl start app
# 6. After a soak period, delete app.db.pre-restore.
```

If step 4 throws `SQLITE_NOTADB`, the key here does not match the replica's era — find the matching
`DB_MASTER_KEY`/`DB_KEY_SALT`; do **not** overwrite `app.db.pre-restore`.

## Data archival / time-partitioning for unbounded tables [should]

Rationale: append-only tables (`audit_log`, `transfers`, `sessions`, `jobs` history) grow without bound;
moving cold rows to a separate encrypted archive file keeps the live DB small so hot indexes stay in page
cache and VACUUM stays cheap.

The archive is its own encrypted DB file, **same key** (so one restore path covers both), opened by a
maintenance worker. `ATTACH` it and move rows older than the retention window with an **idempotent
copy-then-delete in two IMMEDIATE transactions** — not one. Why not one: with the main DB in WAL mode,
SQLite commits each attached file *separately*, so a transaction spanning both files is **not**
crash-atomic — a crash mid-COMMIT can land the delete in `main` without the insert in `archive`
([sqlite.org/lang_attach](https://sqlite.org/lang_attach.html)). Instead, the copy dedupes on `id` and the
delete touches only rows already present in the archive: the worst crash outcome is a duplicate the next
run reconciles, never a lost row.

```js
// src/db/worker.js — archive rows older than `beforeTs` from a whitelisted table into a sibling file.
// The archive is keyed via the URI hexkey, exactly like the VACUUM INTO backup in db-migrations-backups.md.
import { deriveDbKeyHex } from '../lib/dbkey.js';

// Whitelist: `table` names an identifier we interpolate, so it MUST come from code, never a request.
// Every archivable table has an `id` primary key — the dedup below depends on it.
const ARCHIVABLE = new Set(['audit_log', 'transfers', 'sessions']);

export function archiveOldRows({ table, beforeTs, archivePath }) {
  if (!ARCHIVABLE.has(table)) throw new Error(`table not archivable: ${table}`);
  const database = getDb();
  const hexkey = deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT);
  // ATTACH keys the archive via URI; single-quotes in the path are escaped, hexkey is our own 64-hex string.
  database.exec(`ATTACH DATABASE 'file:${archivePath.replace(/'/g, "''")}?hexkey=${hexkey}' AS archive`);
  try {
    // Mirror the live schema on first use (idempotent); the unique index makes dedup cheap and enforced.
    database.exec(`CREATE TABLE IF NOT EXISTS archive.${table} AS SELECT * FROM main.${table} WHERE 0`);
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS archive.idx_${table}_id ON ${table} (id)`);
    // Step 1 — copy. Re-runnable: already-archived rows are skipped, so a crash after this commit is safe.
    const copy = database.transaction(() =>
      database.prepare(
        `INSERT INTO archive.${table}
           SELECT * FROM main.${table}
            WHERE created_at < ? AND id NOT IN (SELECT id FROM archive.${table})`
      ).run(beforeTs).changes
    );
    copy.immediate();
    // Step 2 — delete ONLY rows step 1 provably landed. Loss is impossible; dupes self-heal next run.
    const prune = database.transaction(() =>
      database.prepare(
        `DELETE FROM main.${table} WHERE created_at < ? AND id IN (SELECT id FROM archive.${table})`
      ).run(beforeTs).changes
    );
    const moved = prune.immediate();
    // Reclaim the freed pages in the live file incrementally (auto_vacuum=INCREMENTAL, see maintenance).
    database.pragma('incremental_vacuum');
    return { table, moved };
  } finally {
    database.exec('DETACH DATABASE archive'); // always detach, even if the move threw
  }
}
```

```js
// src/db/index.js
export const archiveOldRows = (args) => pool.run(args, { name: 'archiveOldRows' });
```

For the rare historical query, ATTACH the archive **read-only** (`?hexkey=…&mode=ro`) and `UNION ALL`
across `main` + `archive` — cheap because it's occasional, and the live table stays lean for the 99% hot path.

## In-process / Redis caching with explicit invalidation [should]

Rationale: hot, rarely-changing reads (config, product catalog, feature flags) shouldn't hit the pool
every request; a bounded TTL cache in front of the facade absorbs them — **opt-in per query**, never
transparent.

Invalidation is by a **per-table generation counter** bumped inside the named write tx that touches the
table, so a stale entry can never outlive a write. **Never cache money/balance reads or ownership checks** —
those re-read inside the tx by rule ([transaction-endpoints.md](transaction-endpoints.md)); a cached balance
is a correctness bug, not a perf win.

```js
// src/lib/cache.js — bounded TTL cache, opt-in, keyed by normalized SQL+params + the table's generation.
import * as db from '../db/index.js';

const MAX = 500;                         // hard bound: eviction, not unbounded memory growth
const store = new Map();                 // key -> { value, expires }
const generation = new Map();            // table -> counter; bumped on write invalidates every prior key

const genOf = (table) => generation.get(table) ?? 0;
export function bumpGeneration(table) { generation.set(table, genOf(table) + 1); } // call from write paths

// Cache a read that belongs to exactly ONE table. TTL is a safety net; generation is the real invalidator.
export async function cachedGet(table, sql, params = [], ttlMs = 30_000) {
  const key = `${table}#${genOf(table)}#${sql}#${JSON.stringify(params)}`;
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await db.get(sql, params);
  if (store.size >= MAX) store.delete(store.keys().next().value); // evict oldest (insertion order)
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}
```

Bump the generation in the **same write path** that mutates the table — for a named worker tx, do it in the
route after the tx commits (the worker runs in another thread and can't touch this process's Map):

```js
// after a successful write that changed feature_flags:
import { bumpGeneration } from '../lib/cache.js';
await db.run('UPDATE feature_flags SET enabled = ? WHERE key = ?', [enabled, key]);
bumpGeneration('feature_flags'); // every cachedGet('feature_flags', …) now misses and re-reads
```

**Tier 2 — Redis, only when clustering.** [cluster-scaling.md](cluster-scaling.md) already notes that
per-process caches (sv, rate-limit) diverge across workers: this in-process cache has the *same* staleness.
For anything authority-bearing it MUST be invalidatable cluster-wide, so under `node:cluster` back the store
with Redis and publish invalidations on a channel every worker subscribes to (`ioredis` pub/sub bumping a
shared generation key). Until you cluster, the in-process Map is simpler and enough.

## Background job queue on worker_threads (SQLite-backed) [should]

Rationale: email, soft-delete GC, archival, and outbox draining are slow and retryable — they belong off the
request path in a durable queue, not in the handler. Default to a SQLite-backed queue (one less moving part
than Redis); escalate to BullMQ only for cross-machine workers or high throughput — same trigger as Postgres.

The claim is atomic via the **guard-in-UPDATE** idiom from [transaction-endpoints.md](transaction-endpoints.md):
select-and-lock in one statement, then check `changes === 1`. Two drainers racing for the same job — one wins,
one sees `changes === 0` and moves on.

```sql
-- add to a migration (see db-migrations-backups.md). unixepoch() timestamps match the rest of the schema.
CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL,                         -- JSON; the handler parses it
  status        TEXT NOT NULL DEFAULT 'pending',       -- pending | done | dead
  run_at        INTEGER NOT NULL DEFAULT (unixepoch()),-- delayed/backoff scheduling
  attempts      INTEGER NOT NULL DEFAULT 0,
  locked_by     TEXT,
  locked_until  INTEGER,                               -- lease expiry; a crashed worker's job is re-claimable
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs (status, run_at);
```

```js
// src/db/worker.js — claim one due job atomically. The guard lives in the UPDATE: no read-then-write race.
export function claimJob({ workerId, now, leaseMs }) {
  const database = getDb();
  const claim = database.transaction(() => {
    // A job is claimable if pending & due, OR previously locked but the lease expired (worker crashed).
    // NB: `now` and locked_until are unixepoch SECONDS (like run_at) — convert the ms lease before adding.
    const upd = database.prepare(
      `UPDATE jobs SET locked_by = ?, locked_until = ?, status = 'pending', attempts = attempts + 1
         WHERE id = (
           SELECT id FROM jobs
            WHERE status = 'pending' AND run_at <= ?
              AND (locked_until IS NULL OR locked_until < ?)
            ORDER BY id LIMIT 1
         )
         AND status = 'pending'`                       // re-assert inside the UPDATE — the anti-race guard
    ).run(workerId, now + Math.ceil(leaseMs / 1000), now, now);
    if (upd.changes !== 1) return null;                // lost the race, or nothing due
    return database.prepare('SELECT id, type, payload, attempts FROM jobs WHERE locked_by = ? AND status = \'pending\' ORDER BY id LIMIT 1').get(workerId);
  });
  return claim.immediate();
}

// Terminal states. Backoff reschedules; max attempts dead-letters (kept for inspection, never silently dropped).
export function finishJob({ id, ok, retryDelayMs, maxAttempts }) {
  const database = getDb();
  const row = database.prepare('SELECT attempts FROM jobs WHERE id = ?').get(id);
  if (!row) return { changes: 0 };
  if (ok) return database.prepare("UPDATE jobs SET status = 'done', locked_by = NULL WHERE id = ?").run(id);
  if (row.attempts >= maxAttempts)
    return database.prepare("UPDATE jobs SET status = 'dead', locked_by = NULL WHERE id = ?").run(id);
  // Retry: unlock and push run_at out by the backoff so it isn't re-claimed immediately.
  return database.prepare(
    "UPDATE jobs SET status = 'pending', locked_by = NULL, locked_until = NULL, run_at = ? WHERE id = ?"
  ).run(Math.floor(Date.now() / 1000) + Math.ceil(retryDelayMs / 1000), id);
}
```

```js
// src/db/index.js — the drainer goes through the facade like everything else.
export const claimJob        = (args) => pool.run(args, { name: 'claimJob' });
export const finishJob       = (args) => pool.run(args, { name: 'finishJob' });
export const tryBecomeLeader = (args) => pool.run(args, { name: 'tryBecomeLeader' });
```

```js
// src/jobs/drainer.js — a dedicated poll loop. Handlers are pure functions of (payload) -> Promise.
import { randomUUID } from 'node:crypto';
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';

const WORKER_ID = `${process.pid}:${randomUUID()}`;
const handlers = { email: sendEmail, purge: purgeSoftDeleted, archive: runArchive }; // register your job types

export async function drainOnce() {
  const now = Math.floor(Date.now() / 1000);
  const job = await db.claimJob({ workerId: WORKER_ID, now, leaseMs: 60_000 });
  if (!job) return false;
  try {
    await handlers[job.type](JSON.parse(job.payload));
    await db.finishJob({ id: job.id, ok: true, maxAttempts: 5 });
  } catch (err) {
    logger.error({ jobId: job.id, type: job.type, attempts: job.attempts, err }, 'job failed');
    await db.finishJob({ id: job.id, ok: false, retryDelayMs: 1000 * 2 ** job.attempts, maxAttempts: 5 });
  }
  return true;
}

// Drain until empty, then idle. Backpressure-friendly: never more than one in-flight per loop.
// The try/catch matters: a transient DB error rejecting drainOnce() would otherwise kill the
// loop silently and jobs would sit unprocessed until the next restart.
export function startDrainer({ idleMs = 2000 } = {}) {
  let stop = false;
  (async () => {
    while (!stop) {
      let busy = false;
      try { busy = await drainOnce(); }
      catch (err) { logger.error({ err }, 'drainer tick failed'); }
      if (!busy) await new Promise((r) => setTimeout(r, idleMs));
    }
  })();
  return () => { stop = true; };
}
```

Delivery is **at-least-once**: a handler that outlives its lease can be re-claimed and run again by
another drainer. Write handlers idempotent (keyed sends, upserts) — the same discipline
[integrations-webhooks.md](integrations-webhooks.md) already requires of webhook handlers.

**Under `node:cluster`, exactly ONE process may run the drainer** — otherwise every worker double-runs jobs.
The lease + `changes === 1` guard already prevents *two workers running the same job*, but you still want a
single owner to avoid N pollers hammering the DB. Elect a leader with a claim row (same guard idiom):

```js
// src/db/worker.js — leader lock: only the process that flips the row to its id starts the drainer.
// The current holder renews by re-running the same call before expiry; everyone else retries periodically.
// `now`/`expires` are unixepoch seconds, same convention as the jobs table.
export function tryBecomeLeader({ workerId, now, leaseMs }) {
  return getDb().prepare(
    `UPDATE leader_lock SET holder = ?, expires = ?
       WHERE id = 1 AND (holder IS NULL OR expires < ? OR holder = ?)`  // steal only an expired lease
  ).run(workerId, now + Math.ceil(leaseMs / 1000), now, workerId).changes === 1;
}
```

The lock is a single-row table the drainer processes contend for — add it in a migration alongside `jobs`:

```sql
-- add to a migration: a single-row lock the drainer processes contend for.
CREATE TABLE IF NOT EXISTS leader_lock (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  holder  TEXT,
  expires INTEGER
);
INSERT OR IGNORE INTO leader_lock (id, holder, expires) VALUES (1, NULL, 0);
```

**Scale-out path:** when workers must span machines or throughput outgrows one poller, move the queue to
**BullMQ/Redis** — same reasoning as the Postgres trigger below. The handler functions (`sendEmail`, …) stay
identical; only the claim/finish plumbing changes.

## Scheduled VACUUM / ANALYZE / wal_checkpoint maintenance [should]

Rationale: without maintenance the query planner runs on stale stats, the `-wal` grows unbounded, and the
file fragments — cheap periodic upkeep keeps every hot query fast.

Run these from the background drainer (register an `archive`/`maintain` job type) or a cron/systemd timer
calling a `import 'dotenv/config'` script (see [db-migrations-backups.md](db-migrations-backups.md) for the
timer template). Cadence:

- **`PRAGMA optimize`** on an interval / connection close — cheap, refreshes stats the planner actually needs.
- **`ANALYZE`** after bulk writes and after each migration — so a new index is used immediately, not eventually.
- **`PRAGMA wal_checkpoint(TRUNCATE)`** periodically to cap `-wal` size. **With Litestream running, prefer
  letting Litestream checkpoint** and skip this, or run it well-spaced from Litestream's own cycle — a manual
  TRUNCATE that races the replicator can truncate frames it hasn't shipped. If you run both, let a checkpoint
  settle before/after (a minute of quiet) so Litestream's snapshot stays consistent.
- **`VACUUM`** only occasionally, in a low-traffic window: it **rewrites the whole file**, needs ~2× the DB
  size free on disk, and briefly takes a write lock. Because it rewrites every page it also produces a large
  Litestream delta — schedule it off-peak and let a checkpoint settle around it.

**Prefer incremental vacuum.** `auto_vacuum` can only be switched on while the database file is still
uninitialized — and `getDb()` initializes the file's header the moment it runs `journal_mode = WAL` at
connection open. So the pragma **must live in `getDb()`'s pragma block, before the WAL line** — *not* in a
migration: by the time migrations run the header is already written and the pragma silently no-ops (verified
against SQLite — no error, just `auto_vacuum` stuck at 0). Then reclaim freed pages in small bites via
`PRAGMA incremental_vacuum` (already called after archival above) instead of a big-bang full `VACUUM`.

```js
// src/db/worker.js getDb() — first pragmas after keying; ORDER MATTERS, WAL initializes the header:
db.pragma('auto_vacuum = INCREMENTAL'); // takes effect only on a brand-new file — hence before WAL
db.pragma('journal_mode = WAL');
```

On an already-initialized database this is a harmless no-op every open; converting an existing file
requires this pragma **plus a full off-peak `VACUUM`** to rewrite it.

```js
// src/db/worker.js — the maintenance routine, run from a scheduled 'maintain' job or a cron script.
// `litestream` is passed explicitly by the caller (it knows whether the sidecar is running) rather
// than read from process.env — LITESTREAM_ENABLED is not part of the validated env schema, and a
// missing/misspelled var must NOT silently flip a checkpoint that could race the replicator.
export function maintain({ full = false, litestream = false } = {}) {
  const database = getDb();
  database.pragma('optimize');                 // refresh planner stats (cheap, frequent)
  database.exec('ANALYZE');                     // deeper stats — after bulk writes / migrations
  database.pragma('incremental_vacuum');        // reclaim freed pages without a full rewrite
  // Skip when co-running Litestream (it owns checkpoints) — see the caveat above.
  if (!litestream) database.pragma('wal_checkpoint(TRUNCATE)');
  if (full) database.exec('VACUUM');            // off-peak only: whole-file rewrite, needs ~2x disk free
  return { ok: true };
}
```

```js
// src/db/index.js
export const maintain = (opts) => pool.run(opts ?? {}, { name: 'maintain' });
```

## When and how to migrate to Postgres [nice]

Rationale: this makes [db-layer.md](db-layer.md)'s one-line trigger concrete. Postgres is the answer to
*specific* limits, not a default — SQLite + the worker pool already removes the event-loop bottleneck and
`cluster.js` already gives multi-process on one box.

**WHEN — any one of these, sustained (not a spike):**

- You need **more than one physical app server.** SQLite is a single-file, single-machine DB; two boxes can't
  share it safely. Note this is *physical* servers — `cluster.js` already gives you N processes on one machine.
- **Sustained thousands of write TPS** against the single global writer. SQLite serializes writes; past a few
  thousand small commits/sec on one box, the single-writer lock is the wall.
- **Per-IP / per-`sv` state that must be cluster-wide-instant** across machines — Postgres (or Redis) as the
  shared source of truth, rather than the ≤30 s convergence [cluster-scaling.md](cluster-scaling.md) accepts.
- **Data larger than a single machine's disk**, or you need concurrent multi-writer throughput SQLite's
  single-writer model can't give.

**HOW — the Piscina facade is the seam.** The app imports only `src/db/index.js` (`all`/`get`/`run`/`writeTx`
+ named worker tx). Reimplement *those exports* against `pg`; nothing upstream changes.

- Swap the transaction primitive: SQLite's `BEGIN IMMEDIATE` (grab the write lock up front) becomes
  `BEGIN` + explicit `SELECT … FOR UPDATE` on the rows you guard. Postgres uses **row-level** locks, not a
  DB-wide writer lock, so contention semantics differ — see the checklist note.
- **Keep the same worker-function names** (`transfer`, `claimJob`, …) so routes don't move; only the body
  changes from `better-sqlite3` calls to `pg` calls.
- **Port money as `bigint`** — integer minor units stay integers ([transaction-endpoints.md](transaction-endpoints.md));
  Postgres `BIGINT` maps cleanly, no floats ever.
- **Translate SQLite-isms:** `unixepoch()` → `extract(epoch from now())::bigint` or a `timestamptz` column;
  `PRAGMA user_version` migrations → a `schema_migrations` table (or a tool like `node-pg-migrate`); the
  guard-in-UPDATE idiom still works (`UPDATE … WHERE … AND balance >= ?` + `rowCount === 1`).
- **Re-run the full 5-pass adversarial checklist** ([transaction-endpoints.md](transaction-endpoints.md)) —
  RACE especially. Row-locking + `SELECT FOR UPDATE` changes exactly the concurrency semantics those passes
  probe; a guard that was safe under SQLite's single writer is not automatically safe under Postgres MVCC.

**What you LOSE (plan for it, don't discover it in production):**

- **Transparent file encryption.** `better-sqlite3-multiple-ciphers` encrypts the whole file for free;
  Postgres does not. Replace it deliberately — column-level `pgcrypto`, TDE (managed offerings), or full-disk
  encryption — and update [env-and-secrets.md](env-and-secrets.md)'s key story and the Litestream/backup key
  caveats accordingly.
- **Single-file backup simplicity.** `VACUUM INTO` one encrypted file and Litestream-tails-the-WAL become
  `pg_dump`/`pg_basebackup` + WAL archiving (`wal-g`/`pgBackRest`) — more powerful, more moving parts. The
  restore drill must be re-written and re-rehearsed against the new tooling.