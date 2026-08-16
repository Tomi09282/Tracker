# Env & secrets — validation, key handling, rotation

Rules:
- `.env` is gitignored; `.env.example` with placeholders is committed.
- Env is validated at boot BEFORE anything else runs; invalid env → `exit(1)` with a message that
  names the variable but never prints its value.
- Secrets exist only in `.env` (or a secret manager in production) and in process memory.
  They never appear in logs, error messages, commits, or client responses.
- Do not use better-sqlite3's `verbose` option — it would echo key pragmas into the log.

## .env.example

```ini
NODE_ENV=development
PORT=3000
# Number of trusted reverse-proxy hops (1 behind nginx/caddy). MUST stay 0 when the server
# is directly exposed, or clients can spoof X-Forwarded-For and bypass per-IP rate limits.
TRUST_PROXY=0

DB_PATH=./data/app.db
# Master secret for DB encryption — generate with the command below, 32+ chars random
DB_MASTER_KEY=CHANGE_ME
# Per-database salt for key derivation, 16+ chars
DB_KEY_SALT=CHANGE_ME

# 32 random bytes, base64url — signs access JWTs
JWT_SECRET=CHANGE_ME
# Key id for rotation; bump to k2, k3... when rotating
JWT_KID=k1
# Only set while rotating the JWT secret (see auth-blueprint.md keyring), remove after 15 min:
# JWT_SECRET_PREV=
# JWT_KID_PREV=

LOG_LEVEL=info
# DB worker threads per process. Leave unset in single-process mode (defaults to cores-1).
# Set to 2 when running cluster.js — see cluster-scaling.md.
# DB_POOL_THREADS=2
```

Generate secrets:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## src/lib/env.js — boot validation

```js
// src/lib/env.js — import this FIRST in server.js. Fails fast on invalid config.
import 'dotenv/config';
import { z } from 'zod';

// Node's base64url decoder silently skips invalid characters, which could shrink an HS256 key
// below the 256-bit minimum — so validate both the format and the decoded length.
const base64url32 = (name) =>
  z.string()
    .regex(/^[A-Za-z0-9_-]{43,}$/, `${name} must be 32+ random bytes base64url-encoded`)
    .refine((s) => Buffer.from(s, 'base64url').length >= 32, `${name} decodes to fewer than 32 bytes`);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DB_PATH: z.string().min(1),
  DB_MASTER_KEY: z.string().min(32, 'must be at least 32 chars — generate it randomly'),
  DB_KEY_SALT: z.string().min(16, 'must be at least 16 chars'),
  JWT_SECRET: base64url32('JWT_SECRET'),
  JWT_KID: z.string().min(1),
  JWT_SECRET_PREV: base64url32('JWT_SECRET_PREV').optional(),
  JWT_KID_PREV: z.string().min(1).optional(),
  LOG_LEVEL: z.string().default('info'),
  DB_POOL_THREADS: z.coerce.number().int().min(1).max(64).optional(),
}).superRefine((e, ctx) => {
  // The rotation keyring (auth-blueprint.md) only engages when BOTH prev vars are set, and it is
  // a Map keyed by kid — so half a pair means old tokens silently fail verification during
  // rotation, and a reused kid would overwrite the CURRENT secret. Catch both at boot.
  if (!!e.JWT_SECRET_PREV !== !!e.JWT_KID_PREV)
    ctx.addIssue({ code: 'custom', path: ['JWT_SECRET_PREV'], message: 'JWT_SECRET_PREV and JWT_KID_PREV must be set together' });
  if (e.JWT_KID_PREV && e.JWT_KID_PREV === e.JWT_KID)
    ctx.addIssue({ code: 'custom', path: ['JWT_KID_PREV'], message: 'must differ from JWT_KID' });
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Name the offending variables only — never print values.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  console.error(`FATAL: invalid environment — ${issues}`);
  process.exit(1);
}

export const env = parsed.data;
```

## src/lib/dbkey.js — the single source of truth for DB key derivation

```js
// src/lib/dbkey.js — used by BOTH src/db/worker.js and scripts/rekey.js.
// WARNING: the scrypt parameters are PART OF THE KEY. Changing them (or the salt) on an
// existing database makes it unopenable — that requires the rekey procedure below.
import { scryptSync } from 'node:crypto';

// OWASP scrypt minimum: N=2^17, r=8, p=1. maxmem must exceed 128*N*r bytes or scrypt throws.
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export function deriveDbKeyHex(master, salt) {
  return scryptSync(master, salt, 32, SCRYPT_PARAMS).toString('hex');
}
```

## How the DB key works

- `DB_MASTER_KEY` + `DB_KEY_SALT` → `deriveDbKeyHex()` → raw 32-byte key →
  `PRAGMA hexkey` right after opening the connection (see db-layer.md).
- Why hexkey instead of `PRAGMA key='passphrase'`: no quoting/escaping pitfalls, our own strong
  KDF instead of the library default, and one master secret can serve several databases by
  varying the salt.
- A wrong key surfaces as `SQLITE_NOTADB` ("file is not a database") on the first query — the
  worker's `SELECT 1` probe turns that into an immediate, clear startup failure.
- Derivation takes ~100-300 ms once per worker at startup — that is intentional (key stretching).

## Key rotation — rekey procedure

Run offline (server stopped), with a backup taken first. Two hard requirements learned from the
library's issue tracker: the pragma is `hexrekey` (NOT "rehexkey" — SQLite silently ignores
unknown pragmas, so a typo would "succeed" without rekeying anything), and **rekey does not work
in WAL mode** — the script must temporarily switch to a DELETE journal.

```js
// scripts/rekey.js — node scripts/rekey.js (reads OLD_* and NEW_* from env)
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

// Fail by NAME, not with an opaque scrypt TypeError, before the DB is ever opened.
const missing = ['DB_PATH', 'OLD_MASTER_KEY', 'OLD_KEY_SALT', 'NEW_MASTER_KEY', 'NEW_KEY_SALT']
  .filter((k) => !process.env[k]);
if (missing.length) { console.error(`missing env: ${missing.join(', ')}`); process.exit(1); }

const oldKey = deriveDbKeyHex(process.env.OLD_MASTER_KEY, process.env.OLD_KEY_SALT);
const newKey = deriveDbKeyHex(process.env.NEW_MASTER_KEY, process.env.NEW_KEY_SALT);

const db = new Database(process.env.DB_PATH);
db.pragma(`hexkey='${oldKey}'`);
db.prepare('SELECT count(*) FROM sqlite_master').get(); // verify the old key actually decrypts
db.pragma('journal_mode = DELETE');                     // rekeying is unsupported in WAL mode
db.pragma(`hexrekey='${newKey}'`);                      // re-encrypts every page in place
db.pragma('journal_mode = WAL');                        // restore the runtime journal mode
db.close();

// Trust nothing: reopen with the NEW key and prove it decrypts before declaring success.
const check = new Database(process.env.DB_PATH);
check.pragma(`hexkey='${newKey}'`);
check.prepare('SELECT count(*) FROM sqlite_master').get();
check.close();
console.log('rekey complete and verified');
```

Steps: 1) stop the server, 2) copy the DB file as backup, 3) run the script, 4) update `.env`,
5) start the server and verify the `SELECT 1` probe passes, 6) delete the backup after a soak
period. (`PRAGMA hexrekey=''` with an empty value decrypts the database entirely.)

## Production notes

- Prefer injecting env vars from a secret manager (Docker/K8s secrets, Vault, cloud SM) over a
  `.env` file on disk; the code does not change — dotenv simply finds nothing to load.
- Rotate `JWT_SECRET` with the kid keyring (see auth-blueprint.md): set `JWT_SECRET_PREV` +
  `JWT_KID_PREV` to the old pair, put the new pair in `JWT_SECRET`/`JWT_KID`, restart, then
  remove the PREV pair after 15 minutes (max access-token lifetime).
