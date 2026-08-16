# DB migrations & encrypted backups

Why this design: the database is encrypted at rest (see [db-layer.md](db-layer.md), [env-and-secrets.md](env-and-secrets.md)), so every operational tool must preserve encryption — a plaintext copy of the DB defeats the entire cipher. Two gaps get closed here. **Migrations**: `CREATE TABLE IF NOT EXISTS` in `schema.sql` bootstraps a fresh DB but cannot evolve one that already holds data; numbered files gated by `PRAGMA user_version` give ordered, transactional, forward-only schema changes. **Backups**: a plain file copy of a WAL-mode DB can be torn (uncheckpointed pages live in `-wal`), and — the trap — better-sqlite3's online `db.backup()` opens the **target** connection *unkeyed*, so it writes a **plaintext** copy of an encrypted DB (better-sqlite3 exposes no way to key the destination; the SQLite3MultipleCiphers author confirms a backup into an unkeyed target is exactly how you get an unencrypted copy). The only encryption-preserving copy is `VACUUM INTO 'file:dest?hexkey=…'`, which keys the target via URI — and better-sqlite3 only parses `file:` URIs when `SQLITE_USE_URI=1` is set in the environment (see the backup section). Everything runs inside the worker (it owns the only keyed connection); nothing outside `src/db/` touches better-sqlite3 directly.

## Versioned migrations — the discipline

Rules:
- Files live in `src/db/migrations/` named `NNN_description.sql`, zero-padded and applied in
  numeric order: `001_init.sql`, `002_add_posts_index.sql`, …
- **Forward-only.** No down-migrations — a rollback on a live encrypted DB is how you lose data.
  To undo, write a new higher-numbered migration. To fix a mistake, restore a backup.
- Each file is applied inside ONE transaction, then `user_version` is bumped to its number. A
  file that fails rolls back whole — `user_version` never advances past a broken migration.
- Migration files contain bare statements — no `BEGIN`/`COMMIT` — because the runner wraps each
  file in its own transaction, and a nested `BEGIN` throws.
- Migrations are additive and idempotent where cheap (`CREATE INDEX IF NOT EXISTS`), but the
  `user_version` gate is the real guard: a file already applied is skipped by number.
- `schema.sql` still exists as `001`'s content for a fresh DB; after that, every change is a new
  numbered file. Do not edit an already-shipped migration — the gate has moved past it.

## src/db/migrations/001_init.sql

```sql
-- 001_init.sql — the initial schema. Kept idempotent so an existing pre-migrations DB is safe.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
-- later files add tables/indexes/columns: 002_..., 003_..., never editing this one.
```

## migrate() runner — in the worker

The runner reads every migration file, compares each number against `PRAGMA user_version`, and
applies the unapplied ones in a single IMMEDIATE transaction each. It runs in the worker because
the worker owns the keyed connection (see [db-layer.md](db-layer.md)); add these to `src/db/worker.js`.

```js
// src/db/worker.js — migrate runner (replaces the schema.sql-only migrate()).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// NNN_name.sql, applied in numeric order. Anything not matching the pattern is ignored,
// so notes/README in the folder do no harm.
function loadMigrations(dir) {
  const migs = readdirSync(dir)
    .map((f) => /^(\d+)_.*\.sql$/.exec(f))
    .filter(Boolean)
    .map((m) => ({ version: Number(m[1]), file: m.input })) // m.input = the matched filename
    .sort((a, b) => a.version - b.version);
  for (let i = 1; i < migs.length; i++) {
    // Two files with the same number would both pass the version gate, in an order picked by
    // the filesystem — refuse to guess.
    if (migs[i].version === migs[i - 1].version) {
      throw new Error(`duplicate migration number: ${migs[i - 1].file} vs ${migs[i].file}`);
    }
  }
  return migs;
}

export function migrate({ dir }) {
  const database = getDb(); // the worker's single keyed connection
  const applied = [];
  const current = database.pragma('user_version', { simple: true });
  for (const { version, file } of loadMigrations(dir)) {
    // The gate: skip anything already recorded in user_version. Forward-only.
    if (version <= current) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    // One migration = one transaction. user_version is bumped INSIDE it, so a failure
    // rolls back both the DDL and the version bump — never a half-applied schema.
    const tx = database.transaction(() => {
      database.exec(sql); // exec() runs the file's multiple statements
      database.pragma(`user_version = ${version}`); // pragma value can't be bound — version is our int
    });
    tx.immediate();
    applied.push(version);
  }
  return { applied, version: database.pragma('user_version', { simple: true }) };
}
```

Expose it through the facade in `src/db/index.js` and call it once at boot:

```js
// src/db/index.js
export const migrate = (dir) => pool.run({ dir }, { name: 'migrate' });

// server.js — replaces the schema.sql call; log what moved for the audit trail.
import path from 'node:path';
const { applied, version } = await db.migrate(path.resolve('src/db/migrations'));
logger.info({ applied, version }, applied.length ? 'migrations applied' : 'schema up to date');
```

## Encrypted backup — why `VACUUM INTO`, not `db.backup()`

better-sqlite3's `db.backup(dest)` opens the destination as a **fresh, unconfigured** connection.
On an encrypted source that means the copy is written **without a key — plaintext on disk.** There
is no JS option to key the target of `db.backup()`, so **do not use it here.** The
SQLite3MultipleCiphers author's guidance: use `VACUUM INTO` with the target key in the file URI.

`VACUUM INTO 'file:dest?hexkey=…'` writes a fresh, defragmented, self-contained copy encrypted with
the key you pass — reuse the same `hexkey` the connection already uses (derived from
`DB_MASTER_KEY` + `DB_KEY_SALT`, see [db-layer.md](db-layer.md), [env-and-secrets.md](env-and-secrets.md)),
so the snapshot opens with the *same* key. `VACUUM INTO` is a plain read transaction — it works in
WAL mode and does not block writers for the copy's duration on a separate destination file.

**One trap on top of the trap: URI filenames are OFF by default.** better-sqlite3 compiles SQLite
with `SQLITE_USE_URI=0` and opens connections without `SQLITE_OPEN_URI`; the native addon flips
URI parsing on (process-wide) only when it finds `SQLITE_USE_URI=1` in the **real environment** at
first load. Without it, SQLite treats the whole `file:…?hexkey=…` string as a *literal filename*
and writes the copy **unencrypted** under that garbage name — the exact failure this file exists
to prevent. So put `SQLITE_USE_URI=1` in the env file next to the other vars and validate it as
`z.literal('1')` in the env schema — a zod `.default()` would NOT do, because the native code reads
the actual environment, not the schema's output. dotenv loading it in the main process before the
db layer is imported is enough (setting `process.env` there updates the process environment the
addon reads). The `backup()` below refuses to run without it rather than silently writing plaintext.

```js
// src/db/worker.js — encrypted online backup via VACUUM INTO. The target is keyed by URI.
export function backup({ dest }) {
  // URI parsing is opt-in (env var read by the native addon at first load). Without it the
  // file:…?hexkey=… below is taken as a LITERAL filename → an unencrypted copy. Fail loudly.
  if (process.env.SQLITE_USE_URI !== '1') {
    throw new Error('backup requires SQLITE_USE_URI=1 in the environment — without it VACUUM INTO writes a PLAINTEXT copy');
  }
  const database = getDb();
  // Hygiene, not correctness: fold WAL frames back into the main file so -wal doesn't grow
  // unbounded. VACUUM INTO reads the committed snapshot through the WAL either way. Skip this
  // line if Litestream owns checkpoints (see integration-notes.md).
  database.pragma('wal_checkpoint(TRUNCATE)');
  // Same hexkey the worker opened the DB with (deriveDbKeyHex from src/lib/dbkey.js, see
  // db-layer.md / env-and-secrets.md) — the target is keyed too, so the copy stays encrypted.
  const hexkey = deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT);
  // hexkey is 64 hex chars from our own derivation, not user input — safe to interpolate.
  // URI paths use forward slashes even on Windows; single quotes are SQL-escaped.
  const uriPath = dest.replace(/\\/g, '/').replace(/'/g, "''");
  database.exec(`VACUUM INTO 'file:${uriPath}?hexkey=${hexkey}'`);
  return { dest };
}
```

```js
// src/db/index.js
export const backup = (dest) => pool.run({ dest }, { name: 'backup' });
```

> Never copy `app.db` with `cp`/`Copy-Item` while the server runs — the `-wal`/`-shm` files hold
> uncheckpointed pages and you get a torn, possibly corrupt snapshot. And never fall back to
> `db.backup()`: it would write an **unencrypted** copy. Use the `VACUUM INTO` API above.

## scripts/backup.js — timestamped file + rotation

```js
// scripts/backup.js — node scripts/backup.js  (env loaded FIRST, see db-layer.md caveat)
import 'dotenv/config';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as db from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';

const BACKUP_DIR = process.env.BACKUP_DIR ?? './backups';
const KEEP = Number(process.env.BACKUP_KEEP ?? 14); // retain last N encrypted snapshots

mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = resolve(join(BACKUP_DIR, `app-${stamp}.db`)); // absolute — VACUUM INTO resolves the URI itself

await db.backup(dest);
logger.info({ dest }, 'encrypted backup written');

// Retention: keep the newest KEEP, delete the rest. Off-box copies are handled by the shipper below.
const snapshots = readdirSync(BACKUP_DIR)
  .filter((f) => /^app-.*\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const { f } of snapshots.slice(KEEP)) unlinkSync(join(BACKUP_DIR, f));

await db.closePool();
```

## Scheduling — cron / systemd timer

Run the script on a timer; the encrypted file then gets shipped **off the box** (see the key
warning below). Add `BACKUP_DIR`/`BACKUP_KEEP`/`SQLITE_USE_URI` to the central env schema
(`src/lib/env.js`, owned by [config-and-topology.md](config-and-topology.md)).

```ini
# /etc/systemd/system/app-backup.service  (Type=oneshot)
[Service]
Type=oneshot
WorkingDirectory=/opt/app
# Env is injected the same way the server gets it — a secret manager or an EnvironmentFile that
# is NOT stored beside the backups. See the key-separation note below.
EnvironmentFile=/etc/app/app.env
ExecStart=/usr/bin/node scripts/backup.js
ExecStartPost=/usr/bin/rclone copy /opt/app/backups remote:app-backups   # off-box, already-encrypted files
```

```ini
# /etc/systemd/system/app-backup.timer   (systemctl enable --now app-backup.timer)
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true   # run a missed backup after downtime
[Install]
WantedBy=timers.target
```

An in-process `setInterval` is fine for a single always-on VPS, but a systemd timer / cron
survives crashes and restarts and is easier to reason about — prefer it.

## Restore drill — practice it before you need it

An untested backup is a hope, not a backup. Because the copy is encrypted with the same key, a
restore is: stop, swap the file into `DB_PATH`, boot, and let the worker's own `SELECT 1` key
probe (see [db-layer.md](db-layer.md)) prove the key still decrypts.

```bash
# 1. Stop the server (systemctl stop app  /  Ctrl+C on run-server.js).
# 2. Move the current DB aside — never delete it until the restore is verified. Take its
#    -wal/-shm along (same rename, so SQLite still pairs them by filename): the WAL may hold
#    the old DB's uncheckpointed commits after an unclean stop, and a stale -wal left beside
#    the incoming snapshot must not be there when it boots.
mv ./data/app.db ./data/app.db.pre-restore
[ -f ./data/app.db-wal ] && mv ./data/app.db-wal ./data/app.db.pre-restore-wal
[ -f ./data/app.db-shm ] && mv ./data/app.db-shm ./data/app.db.pre-restore-shm
# 3. Copy the chosen snapshot into place. It is self-contained — a VACUUM INTO copy has no -wal/-shm.
cp ./backups/app-2026-07-04T03-00-00-000Z.db ./data/app.db
# 4. Verify the copy opens with the SAME key and is structurally sound, BEFORE booting the app.
#    Uses the project's own key derivation (see env-and-secrets.md) rather than reinventing it.
node -e "import('dotenv/config').then(async()=>{ \
  const {default:D}=await import('better-sqlite3-multiple-ciphers'); \
  const {deriveDbKeyHex}=await import('./src/lib/dbkey.js'); \
  const dbc=new D(process.env.DB_PATH); \
  dbc.pragma(\`hexkey='\${deriveDbKeyHex(process.env.DB_MASTER_KEY,process.env.DB_KEY_SALT)}'\`); \
  console.log('select:',dbc.prepare('SELECT 1 AS ok').get()); \
  console.log('integrity:',dbc.pragma('integrity_check',{simple:true})); }); "
# 5. Boot the server. The worker's SELECT 1 probe confirms decryption; watch server.log for 'server started'.
# 6. Only after a soak period, delete app.db.pre-restore (and its -wal/-shm, if any).
```

If step 4 throws `SQLITE_NOTADB`, the key in this environment does not match the backup's key —
you restored with the wrong `DB_MASTER_KEY`/`DB_KEY_SALT` or from a differently-keyed era. Stop
and find the matching key; do not overwrite `app.db.pre-restore`.

## Integrity check — periodic health task

Corruption (bad disk, torn write, a botched manual copy) is silent until a query hits the bad
page. Run a check on a schedule and after every restore. `quick_check` skips the expensive
index cross-checks — use it for the frequent task, `integrity_check` for the deep weekly pass.

```js
// src/db/worker.js
export function integrityCheck({ quick = true } = {}) {
  const result = getDb().pragma(quick ? 'quick_check' : 'integrity_check', { simple: true });
  return { ok: result === 'ok', result };
}
```

```js
// src/db/index.js
export const integrityCheck = (opts) => pool.run(opts ?? {}, { name: 'integrityCheck' });

// wherever scheduled jobs run — a non-'ok' result is a paging-worthy event.
const { ok, result } = await db.integrityCheck({ quick: true });
if (!ok) logger.error({ result }, 'DB integrity check FAILED');
```

## A backup is only as safe as the key

The cipher means the backup file itself is useless to a thief — **unless they also have the key.**
Therefore:

- **Never store `DB_MASTER_KEY`/`DB_KEY_SALT` in the same place as the backups.** Key in a secret
  manager (or `/etc/app/app.env`, root-only); backups in object storage. Co-locating them is
  equivalent to shipping an unencrypted database.
- The off-box copy inherits the encryption — no second at-rest layer is required for
  confidentiality, though bucket-level encryption is fine defense-in-depth.
- Losing the key = losing every backup, permanently. Escrow the key separately (sealed, offline)
  with the same care as the backups themselves. See [env-and-secrets.md](env-and-secrets.md) for
  key handling and the rotation procedure — rotating the key (`PRAGMA rekey`) re-encrypts only the
  live DB, **not** old backups, so retain the previous key until its backups age out of retention.