# Data patterns & search

Why this design: the transactional core ([transaction-endpoints.md](transaction-endpoints.md)) and the
DB layer ([db-layer.md](db-layer.md)) give correct writes and non-blocking reads, but a real app also
has to *find* rows, evolve state safely, survive concurrent edits, and expose lists without handing an
attacker a memory-exhaustion lever. These patterns all live in `schema.sql` / the worker and reuse the
existing pieces — the Piscina facade, the named-tx-as-value rule, the `.strict()` zod discipline, the
pino logger — rather than bolting on a search engine or an ORM. Because the whole file is encrypted by
better-sqlite3-multiple-ciphers, everything below (including the FTS index) is encrypted at rest for
free. The **migration framework** and **order/transaction state machine** are large enough to own their
own files; this one specifies the smaller patterns and points at those.

## FTS5 full-text search over the encrypted DB `[should]`

External-content FTS5: the virtual table stores only the index, pointing back at `docs` by rowid, so
there is no duplicated plaintext copy. Three triggers keep it in sync. The whole DB is encrypted, so the
index is too — no separate, separately-secured search service.

```sql
-- schema.sql — base table + external-content FTS5 index + sync triggers.
CREATE TABLE IF NOT EXISTS docs (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  deleted_at INTEGER,                                   -- soft delete, see below
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- content='docs' => the index does not store its own copy of title/body; content_rowid ties it to id.
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(title, body, content='docs', content_rowid='id');

-- External-content tables are NOT auto-synced: you MUST maintain them with triggers, or MATCH goes stale.
-- Delete/update use the special 'delete' command row (rowid + old column values) to unindex the old text.
CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
```

Never pass a raw user string to `MATCH` — an unescaped `"` or a bare `NEAR`/`AND`/`OR`/`*` is either an
FTS5 syntax error or an operator the user did not intend. Sanitize into a safe query: split on
whitespace, strip everything but word characters, wrap each surviving term in double quotes (which makes
it a literal phrase token), and append `*` for prefix search.

```js
// src/db/worker.js — full-text search. Ownership-scoped like every read (see transaction-endpoints.md).
// bm25() ranks by relevance; lower is better, so ORDER BY ascending.
export function searchDocs({ query, userId, limit = 20 }) {
  // Turn arbitrary input into a valid FTS5 query: keep word chars, quote each term (literal, so no
  // term is ever interpreted as a MATCH operator), add prefix '*'. Empty after cleaning => no rows.
  const terms = String(query)
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, '')) // Unicode letters/digits only — drops "/*()^:
    .filter(Boolean)
    .slice(0, 16)                                  // bound term count — a 10k-word query is a DoS
    .map((t) => `"${t}"*`);
  if (terms.length === 0) return [];
  const match = terms.join(' AND ');               // all terms must appear; ' OR ' for any-term search

  return stmt(`
    SELECT d.id, d.title, bm25(docs_fts) AS rank
    FROM docs_fts
    JOIN docs d ON d.id = docs_fts.rowid
    WHERE docs_fts MATCH ? AND d.user_id = ? AND d.deleted_at IS NULL
    ORDER BY rank
    LIMIT ?
  `).all(match, userId, Math.max(1, Math.min(limit, 100))); // clamp both ways — cap mirrors MAX_LIMIT,
                                                            // floor at 1 because a NEGATIVE LIMIT means "unlimited" in SQLite
}
```

```js
// src/db/index.js
export const searchDocs = (args) => pool.run(args, { name: 'searchDocs' });
```

## Deliberate indexing + EXPLAIN QUERY PLAN discipline `[must]`

The [db-layer.md](db-layer.md) performance checklist becomes a hard rule: **every column in a
`WHERE`/`JOIN`/`ORDER BY` gets a `CREATE INDEX IF NOT EXISTS` in the schema.** Composite indexes are
ordered equality-first, range/sort last (SQLite can only range-scan the trailing column). Hot read paths
get a *covering* index (all selected columns in the index) so the query never touches the table.

```sql
-- schema.sql — index for the keyset list "my live docs, newest first" (WHERE user_id + ORDER BY created,id).
-- Equality col (user_id) first, then the ordering cols — this exact prefix serves the seek pagination query.
CREATE INDEX IF NOT EXISTS ix_docs_user_created ON docs(user_id, created_at, id) WHERE deleted_at IS NULL;
```

Ship an EXPLAIN tool and require its output in the PR for any new hot query. Flag any plan line with
`SCAN` (a full table/index scan) versus `SEARCH ... USING INDEX` (a seek) — a `SCAN` on a growing table
is the freeze waiting to happen.

```js
// src/db/worker.js — read-only EXPLAIN QUERY PLAN. Runs the planner, never the query.
export function explainPlan({ sql, params = [] }) {
  const rows = getDb().prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  const plan = rows.map((r) => r.detail);
  return { plan, fullScan: plan.some((d) => /\bSCAN\b/.test(d)) }; // fullScan === true => review it
}
```

```js
// src/db/index.js
export const explainPlan = (args) => pool.run(args, { name: 'explainPlan' });
```

```js
// scripts/explain.js — npm run explain -- "SELECT ... WHERE x = ?" '["val"]'
import 'dotenv/config';                       // env BEFORE the db facade — the standalone-script footgun (db-layer.md)
import * as db from '../src/db/index.js';
const [sql, paramsJson] = process.argv.slice(2);
const { plan, fullScan } = await db.explainPlan({ sql, params: paramsJson ? JSON.parse(paramsJson) : [] });
console.log(plan.join('\n'));
if (fullScan) console.error('\n⚠  plan contains SCAN — add an index or justify it in the PR.');
await db.closePool();
process.exit(fullScan ? 1 : 0);              // non-zero so CI can gate on it
```

## Soft deletes with partial unique indexes `[should]`

User-facing rows get a nullable `deleted_at INTEGER` instead of a hard `DELETE` — reversible, auditable,
and it keeps foreign-key children valid. All reads filter `WHERE deleted_at IS NULL`; a delete is an
ownership-scoped `UPDATE` inside a named worker tx (same anti-IDOR guard-in-the-UPDATE pattern as
`transfer()`). Uniqueness is preserved for *live* rows only via a partial index, so a deleted email can
be re-registered.

```sql
-- schema.sql — uniqueness applies only to live rows; a soft-deleted email frees the address.
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_live ON users(email) WHERE deleted_at IS NULL;
```

```js
// src/db/worker.js — soft delete + restore. The guard lives in the UPDATE (no read-then-write race).
export function softDeleteDoc({ id, userId }) {
  // changes === 1 only if the row exists, is owned, and is currently live — anti-IDOR + idempotent.
  const info = stmt(
    'UPDATE docs SET deleted_at = unixepoch() WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
  ).run(id, userId);
  return info.changes === 1 ? { ok: true } : { ok: false, code: 'NOT_FOUND' };
}

export function restoreDoc({ id, userId }) {
  const info = stmt(
    'UPDATE docs SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
  ).run(id, userId);
  return info.changes === 1 ? { ok: true } : { ok: false, code: 'NOT_FOUND' };
}
```

Past a retention window, a scheduled **hard-purge** job (an outbox drainer / cron, see below) issues the
real `DELETE` for GDPR erasure — soft delete is recoverability, not indefinite retention.

## Optimistic concurrency via version columns `[should]`

For rows edited by multiple tabs or users, add `version INTEGER NOT NULL DEFAULT 0`. The client reads
`version` on load and echoes it on save; the update bumps it and asserts nothing changed underneath. A
lost race changes zero rows and returns a `STALE_WRITE` **value** (never a thrown Error — the
worker_threads boundary does not preserve custom Error fields; same rule as `transfer()` in
[transaction-endpoints.md](transaction-endpoints.md)).

```js
// src/db/worker.js — compare-and-set on version. Ownership + expected version both in the WHERE.
export function updateDoc({ id, userId, title, body, expectedVersion }) {
  const info = stmt(`
    UPDATE docs SET title = ?, body = ?, version = version + 1
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL
  `).run(title, body, id, userId, expectedVersion);
  if (info.changes === 1) return { ok: true, version: expectedVersion + 1 };
  // Zero changes: either it never existed/owned (IDOR -> NOT_FOUND) or version moved (concurrent edit).
  const live = stmt('SELECT version FROM docs WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .get(id, userId);
  return live ? { ok: false, code: 'STALE_WRITE', version: live.version } : { ok: false, code: 'NOT_FOUND' };
}
```

The route maps `STALE_WRITE` → **409 CONFLICT** ([api-conventions.md](api-conventions.md) envelope); the
frontend `api()` wrapper surfaces the 409 to the caller, which refetches the current `version` and
retries or shows a merge prompt. Requires `version` in the row's `SELECT` and in the edit form's payload.

## Query-level metrics + slow-query log `[must]`

Wrap the pool facade in `src/db/index.js` so every call records duration and a stable label. Timing the
**facade** (not the worker) is deliberate: it also captures Piscina queue wait — the real symptom when
the pool is saturated, which worker-internal timing would miss. Emit a histogram for the `/metrics`
route ([observability.md](observability.md)) and a pino `warn` over a threshold. **Never log raw params**
— respects the "never log bodies/secrets" rule from [server-skeleton.md](server-skeleton.md) /
[observability.md](observability.md).

```js
// src/db/index.js — instrument the facade. `env.DB_SLOW_MS` (zod-validated, see config-and-topology.md).
import { createHash } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

// label = worker fn name for named tx; for ad-hoc SQL, a normalized+hashed form so per-value literals
// don't explode the histogram cardinality and no literal (which could be a secret) is ever stored.
const labelFor = (name, sql) =>
  name !== 'all' && name !== 'get' && name !== 'run'
    ? name
    : 'sql:' + createHash('sha1').update(String(sql).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);

const hist = new Map(); // label -> { count, totalMs, maxMs } — snapshot()'d by the metrics route
function record(label, ms) {
  const h = hist.get(label) ?? { count: 0, totalMs: 0, maxMs: 0 };
  h.count += 1; h.totalMs += ms; h.maxMs = Math.max(h.maxMs, ms);
  hist.set(label, h);
  if (ms >= env.DB_SLOW_MS) logger.warn({ label, ms: Math.round(ms), params: '<redacted>' }, 'slow query');
}
export function dbMetricsSnapshot() {
  return [...hist.entries()].map(([label, h]) => ({
    label, count: h.count, avgMs: Math.round(h.totalMs / h.count), maxMs: Math.round(h.maxMs),
  }));
}

// Wrap pool.run once; every export below goes through it. The finally block records even on throw,
// so a query that errors after 5 s still shows up as slow.
async function timed(name, payload, sql) {
  const t0 = performance.now();
  try {
    return await pool.run(payload, { name });
  } finally {
    record(labelFor(name, sql), performance.now() - t0);
  }
}

export const all = (sql, params = []) => timed('all', { sql, params }, sql);
export const get = (sql, params = []) => timed('get', { sql, params }, sql);
export const run = (sql, params = []) => timed('run', { sql, params }, sql);
export const transfer = (args) => timed('transfer', args);
```

Expose the snapshot on the internal metrics route (protect it — internal network / bearer, as in
[observability.md](observability.md)): `res.json({ ...snapshot(), db: dbMetricsSnapshot() })`.

## Transactional outbox for reliable side-effects `[should]`

Any side-effect that must happen **iff** a DB change commits — a charge-confirmation email, a webhook, a
cache bust, an FTS reindex of an external system — is written as an `outbox` row **inside the same
IMMEDIATE tx** as the state change (e.g. inside `transfer()`), not fired after the handler returns. This
closes the dual-write gap: fire-after-commit loses the effect if the process dies post-commit;
fire-before-commit sends an email for a transfer that then rolls back. One atomic tx makes the row and
its intent commit together.

```sql
-- schema.sql — the outbox. published_at IS NULL = not yet delivered.
CREATE TABLE IF NOT EXISTS outbox (
  id           INTEGER PRIMARY KEY,
  topic        TEXT NOT NULL,                       -- e.g. 'email.transfer_receipt', 'webhook.transfer'
  payload      TEXT NOT NULL,                       -- JSON; no secrets — this is at-rest and log-adjacent
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,
  attempts     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_outbox_unpublished ON outbox(id) WHERE published_at IS NULL; -- drainer's hot path
```

```js
// Inside a named worker tx (e.g. transfer() in transaction-endpoints.md), enqueue in the SAME tx:
stmt('INSERT INTO outbox (topic, payload) VALUES (?, ?)')
  .run('email.transfer_receipt', JSON.stringify({ transferId, userId }));
```

```js
// src/db/worker.js — the drainer reads a batch, delivers, then marks published. There is no row-level
// claim/lock, so run ONE drainer; overlap only means duplicate delivery — the contract is at-least-once
// anyway, so consumers MUST dedupe (reuse the Idempotency-Key discipline from transaction-endpoints.md).
export function claimOutbox({ limit = 50 }) {
  return stmt('SELECT id, topic, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT ?')
    .all(Math.max(1, Math.min(limit, 500))); // floor at 1 — a negative LIMIT means "unlimited" in SQLite
}
export function markPublished({ id }) {
  return { changes: stmt('UPDATE outbox SET published_at = unixepoch() WHERE id = ?').run(id).changes };
}
export function markFailed({ id }) { // bump attempts for backoff/alerting; leave unpublished to retry
  return { changes: stmt('UPDATE outbox SET attempts = attempts + 1 WHERE id = ?').run(id).changes };
}
```

```js
// scripts/drain-outbox.js — run on a timer (systemd/cron, like backup.js in db-migrations-backups.md).
import 'dotenv/config';
import * as db from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';
const runners = { /* 'email.transfer_receipt': async (p) => { ... } */ };
const batch = await db.claimOutbox({ limit: 50 });
for (const msg of batch) {
  try {
    const runner = runners[msg.topic];
    // An unknown topic must NOT be marked published — that would silently drop the message forever.
    if (!runner) throw new Error(`no runner for topic '${msg.topic}'`);
    await runner(JSON.parse(msg.payload));   // idempotent effect — safe to re-run on retry
    await db.markPublished({ id: msg.id });
  } catch (err) {
    await db.markFailed({ id: msg.id });
    logger.error({ err, id: msg.id, topic: msg.topic }, 'outbox delivery failed'); // stays unpublished, retried
  }
}
await db.closePool();
```

## Seed / fixtures tooling `[must]`

`scripts/seed.js` is idempotent, env-gated against production, and hashes seed passwords through the real
argon2id path ([auth-blueprint.md](auth-blueprint.md)) so dev login actually works. Split **reference
data** (roles, plans, currencies — deterministic, loaded by tests) from **demo data** (fake
users/accounts) so a test can load only the former. `import 'dotenv/config'` is the FIRST line — the
standalone-script footgun called out in [db-layer.md](db-layer.md).

```js
// scripts/seed.js — npm run seed
import 'dotenv/config';                         // BEFORE the db facade, always
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import * as db from '../src/db/index.js';

if (process.env.NODE_ENV === 'production') {    // refuse to touch a prod DB
  console.error('seed.js refuses to run with NODE_ENV=production');
  process.exit(1);
}

// Reference data: stable ids + ON CONFLICT DO NOTHING => running seed twice is a no-op. Tests load ONLY this.
export async function seedReference() {
  await db.writeTx([
    { sql: `INSERT INTO plans (id, name) VALUES (1,'free'),(2,'pro') ON CONFLICT(id) DO NOTHING`, params: [] },
  ]);
}

// Demo data: a factory so dev can scale volume; the real argon2id path so the login flow is exercisable.
export async function seedDemo() {
  // Keep in sync with ARGON2_OPTS (src/auth/routes.js, auth-blueprint.md) — drift means seeded logins
  // exercise different hashing than real registration.
  const hash = await argon2.hash('Passw0rd!dev', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.run(
    `INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user') ON CONFLICT(email) DO NOTHING`,
    ['demo@example.com', hash]);
}

// Run only as a CLI — otherwise a test importing seedReference() would also seed demo data and
// destroy the pool as a side-effect of the import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seedReference();
  await seedDemo();
  await db.closePool();
}
```

Add `"seed": "node scripts/seed.js"` and `"db:reset"` (delete DB file → `db.migrate(...)` → seed). Both
carry the same `NODE_ENV !== 'production'` guard — deleting the prod DB file is the worst accident there is.

## Connection & DB health checks (liveness/readiness) `[should]`

[observability.md](observability.md) already ships `/healthz` (process up, no I/O) and `/readyz`
(`SELECT 1` through the pool). Add a richer `checkDb()` worker export for a deeper readiness signal and a
WAL-growth metric, and let the orchestrator gate traffic on `/readyz`.

```js
// src/db/worker.js — cheap health probe. quick_check skips index cross-checks (use integrityCheck weekly).
export function checkDb() {
  const database = getDb();
  database.prepare('SELECT 1').get();                              // wrong key => SQLITE_NOTADB here
  const quick = database.pragma('quick_check', { simple: true });  // 'ok' or the first problem
  // NO simple:true here — wal_checkpoint returns a row; simple would collapse it to the `busy` int only.
  const [wal] = database.pragma('wal_checkpoint(PASSIVE)');        // { busy, log, checkpointed } (log/-1 if no WAL)
  return { ok: quick === 'ok', quick, wal };
}
```

```js
// src/db/index.js
export const checkDb = () => pool.run({}, { name: 'checkDb' });
```

`/readyz` returning **503** (not crashing) when `checkDb()` throws `SQLITE_NOTADB` means a wrong key
takes the box out of rotation instead of crash-looping. Schedule a periodic
`PRAGMA wal_checkpoint(TRUNCATE)` and alert if the WAL fails to shrink (`wal.log` stays high) — an
unbounded `-wal` means a stuck long-running reader or a stalled Litestream, and it will eventually eat
the disk.

## Pagination, filtering & sorting standard (DoS-safe) `[should]`

The full keyset-cursor + whitelisted-sort/filter implementation is **[api-conventions.md](api-conventions.md) §3
(`makeList`)** — do not re-implement it. The load-bearing rules, restated here as data-layer invariants:

- **Server-enforced max page size** (`MAX_LIMIT = 100`). An unbounded `LIMIT` is a memory/pool-exhaustion
  DoS: one request can pull the whole table into RAM and hold a worker.
- **Keyset/seek, not OFFSET.** `WHERE (col, id) < (?, ?) ORDER BY col DESC, id DESC LIMIT n` (newest
  first — the comparison operator must match the sort direction: `>` with ASC) stays O(page) and needs
  an index on `(col, id)`; `OFFSET` scans and discards N rows and degrades linearly with depth — it
  fights the indexing-discipline item above. Back every list's ordering with a composite index (see the
  `ix_docs_user_created` example).
- **Allowlist sort/filter columns**, validated by zod, mapped API-key → real column. A client-supplied
  column name interpolated into `ORDER BY` is SQL-injection-adjacent — `makeList` never lets the raw
  string reach the SQL.
- **Total-count strategy is a per-endpoint decision.** An exact `COUNT(*)` is a full scan on a big table;
  keyset pagination doesn't need one (it uses `nextCursor`). Return an exact count only on small/filtered
  sets; for large tables omit it or serve an approximate count — never pay for a total the UI merely
  *might* show.

Applies uniformly to every implied list endpoint — sessions/devices, audit log, transfers, admin user
lists, exports. Each is one `makeList({ table, select, sortable, filterable })` config; the index it
needs is the paired `CREATE INDEX` in `schema.sql`.

## Larger patterns that own their own files

- **Migration framework & forward/backward-compatible evolution `[must]`** — the ordered, checksummed,
  forward-only `user_version` runner (each migration = up SQL + recorded checksum so an altered applied
  migration is detected), the transactional apply with the version bump atomic to the DDL, the
  expand/contract discipline for zero-downtime rolling deploys (add nullable → backfill in a job → switch
  reads → drop later; never rename/drop while old code runs), the chunked backfill pattern for large
  tables (interacts with `busy_timeout` and Litestream), and SQLite's ALTER limits (no `DROP COLUMN` pre
  3.35, the table-rebuild pattern, and how `VACUUM`/rekey interact with a rebuild) live in
  **[db-migrations-backups.md](db-migrations-backups.md)**. Reuse that runner; do not fork it.
- **Order/transaction state machine `[should]`** — explicit enumerated states
  (`pending → authorized → captured/settled → refunded/reversed/failed/held`), transitions enforced in-DB
  (`CHECK` constraints / guarded `UPDATE ... WHERE status = ?` with `changes === 1`), every transition
  audit-logged and idempotent, terminal-state immutability, refunds/reversals as compensating
  double-entry rows (never mutate history), and a periodic reconciliation job that asserts invariants
  (Σ ledger entries == balance, no orphaned `pending`, no stuck states) and alerts on drift. It builds
  directly on the `transfer()` / audit-log / TxError-as-value patterns in
  **[transaction-endpoints.md](transaction-endpoints.md)**.

## Schema documentation + ERD generation `[nice]`

Treat `schema.sql` as the source of truth and generate an always-current ERD + column dictionary from it
in CI, so docs can never drift from the DDL. A read-only worker connection reads `PRAGMA table_info`,
`PRAGMA foreign_key_list`, and `PRAGMA index_list` per table and emits a Mermaid `erDiagram` plus a
Markdown table into `docs/schema.md`, checked in and diffed on PRs.

```js
// src/db/worker.js — introspect via PRAGMAs on a read-only view of the schema.
export function describeSchema() {
  const database = getDb();
  const q = (n) => `"${n.replace(/"/g, '""')}"`; // SQL identifier quoting — doubles embedded quotes
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((t) => t.name);
  return tables.map((name) => ({
    name,
    columns: database.pragma(`table_info(${q(name)})`),      // name/type/notnull/pk
    foreignKeys: database.pragma(`foreign_key_list(${q(name)})`),
    indexes: database.pragma(`index_list(${q(name)})`),
  }));
}
```

A `scripts/gen-schema-doc.js` (env-first, per the db-layer footgun) walks `describeSchema()` into a
Mermaid `erDiagram` + a per-table column/index/FK table and writes `docs/schema.md`; CI runs it and fails
if the working tree changed, so a schema edit that skips the doc is caught in review.

Annotate the invariants that DDL cannot express, as comments harvested into the doc: **money is INTEGER
minor units**, **`deleted_at IS NULL` = live**, **idempotency is scoped per user
(`UNIQUE(created_by, idempotency_key)`)**, **outbox is at-least-once**. These are the rules a new
contributor will otherwise violate because the schema alone doesn't state them.

## New env var

Add to `.env.example` and the zod object in `src/lib/env.js` (schema owned by
[config-and-topology.md](config-and-topology.md), per integration-notes.md):

```ini
# Slow-query threshold in ms: DB facade calls at or above this log a pino 'slow query' warn (params redacted).
DB_SLOW_MS=50
```

```js
// src/lib/env.js — add to EnvSchema
DB_SLOW_MS: z.coerce.number().int().positive().default(50),
```