# Secrets & rotation

Why this design: the manual procedures in [env-and-secrets](env-and-secrets.md) (the JWT `kid`
keyring) and [db-migrations-backups](db-migrations-backups.md) (`scripts/rekey.js`) work, but "run
it by hand and remember to remove the PREV pair after 15 minutes" gets skipped at 2 a.m. This file
automates both and closes the gap the rotation story assumes: a **secret store**. Today every
high-value secret (`DB_MASTER_KEY`, `DB_KEY_SALT`, `PII_MASTER_KEY`, `BLIND_INDEX_KEY`, the JWT
keyring, `*_SIGNING_KEY`, OAuth secrets, SMTP creds) sits in `.env` in plaintext on the same disk as
the encrypted DB it protects — steal the disk and the encryption is decorative. A runtime **secret
provider** puts secrets behind a fetch (env in dev, a real store in prod) so the plaintext isn't
next to the ciphertext, and every rotation becomes a logged, chained audit event.

Nothing here reinvents the DB layer or auth: rotation drives the SAME `deriveDbKeyHex`
([env-and-secrets](env-and-secrets.md)), the SAME `hexrekey` procedure
([db-migrations-backups](db-migrations-backups.md)), and the SAME `kid` keyring
([auth-blueprint](auth-blueprint.md)) — it only changes *where the values come from* and *who pulls
the trigger*.

## The key hierarchy — what wraps/derives what

Write this down once; a rotation runbook is unusable without it. Rotating a key means rotating
everything below it in the tree.

```
secret store (KMS / Vault / sops+age)      <- root of trust; the ONLY plaintext holder
├─ DB_MASTER_KEY + DB_KEY_SALT  --scrypt-->  DB hexkey        (PRAGMA hexkey / hexrekey)
├─ PII_MASTER_KEY               --HKDF--->    per-field AES-256-GCM keys (column encryption)
├─ BLIND_INDEX_KEY              --HMAC--->    deterministic search tokens over encrypted columns
├─ JWT_SECRET (+_PREV)          --direct-->   HS256 access-token signatures, selected by kid
├─ *_SIGNING_KEY                --direct-->   webhook / cookie-state MACs
└─ OAuth secrets, SMTP creds    --direct-->   third-party credentials
```

Rules that fall out of the tree:
- **Derived keys are never stored** — `DB_MASTER_KEY`+salt regenerate the DB hexkey on demand
  (scrypt, [env-and-secrets](env-and-secrets.md)); `PII_MASTER_KEY` regenerates per-field keys via
  HKDF. Only the roots live in the store.
- **Rotating a root re-encrypts its subtree**: new `DB_MASTER_KEY` → `PRAGMA hexrekey`; new
  `PII_MASTER_KEY` → re-encrypt PII columns (a data migration, not a config swap).
- **Salts and KDF params are part of the key** — changing `DB_KEY_SALT` or the scrypt N/r/p
  without a rekey makes the DB unopenable; guard them like the secret itself.

## src/lib/secrets.js — runtime secret provider

Why an abstraction and not `process.env` everywhere: the code must not care whether a secret came
from a dev `.env` or a prod KMS, and secrets that can rotate at runtime (the JWT keyring) need a
refresh path that doesn't exist for `process.env`. One `getSecret()` with a pluggable backend.

```js
// src/lib/secrets.js — the ONLY place the app reads raw secret material from.
// Backend is chosen by SECRETS_PROVIDER: 'env' (dev/test) or 'file' (sops/age-decrypted JSON in prod).
import 'dotenv/config';
import { readFileSync } from 'node:fs';

// Cache the WHOLE resolved secret set as one immutable snapshot so a single refresh reads a single
// consistent view. NEVER read individual secrets with separate I/O calls — that opens a torn-read
// window where a concurrent rotation is observed half-applied (e.g. new JWT_KID paired with the old
// JWT_SECRET → tokens nobody can verify). loadSecrets() is the only reader; getSecret() indexes it.
let cache = null;

function backend() {
  // Dev/test: secrets already live in process.env (validated by src/lib/env.js), zero new deps.
  // Snapshot process.env by copy so a later mutation can't tear a read mid-rebuild.
  if (process.env.SECRETS_PROVIDER !== 'file') return { ...process.env };
  // Prod: SECRETS_FILE points at a JSON blob a sidecar/initContainer decrypted from an age/sops
  // file (or fetched from Vault/cloud SM) into a tmpfs (RAM-backed) path — never persisted to disk.
  // The writer MUST publish updates by atomic rename (write temp + rename over the path), so a
  // reader either sees the whole old file or the whole new one, never a half-written blob. A single
  // readFileSync of a rename-published file is therefore a consistent snapshot.
  const path = process.env.SECRETS_FILE;
  if (!path) throw new Error('SECRETS_FILE is required when SECRETS_PROVIDER=file');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadSecrets({ force = false } = {}) {
  if (cache && !force) return cache;
  // Freeze so callers cannot accidentally mutate the shared snapshot.
  cache = Object.freeze(backend());
  return cache;
}

// getSecret(name) — throws (fail-fast) if a required secret is absent, so a misconfigured store
// crashes loudly rather than silently signing with `undefined`. Empty string counts as absent so
// a retired PREV pair (set to '' during rotation) reads as "not present". NEVER log the value.
export function getSecret(name) {
  const v = loadSecrets()[name];
  if (v == null || v === '') throw new Error(`secret ${name} is not set`);
  return v;
}

// Called by the rotation job after it writes new values to the store, so a running process picks up
// the new JWT keyring WITHOUT a restart (the DB key still needs the rekey procedure). Returns the
// fresh snapshot so callers rebuild derived state (the keyring) from THAT exact snapshot — see below.
export function refreshSecrets() { return loadSecrets({ force: true }); }
```

Wiring: `src/lib/env.js` still validates the *static boot shape* from `process.env` and fails fast
([env-and-secrets](env-and-secrets.md)). The **rotating** values (the JWT keyring, including the
transient PREV pair) are read only through `getSecret()` — they are NOT round-tripped through
env.js's zod schema, so an in-flight PREV pair (or its later `''` retirement) never has to satisfy
the boot-time `base64url32` refinement. Keep the secret provider and the DB out of the same trust
domain (see below).

## Hot-reloadable JWT keyring

The keyring in [auth-blueprint](auth-blueprint.md) is built once at import from `env`. To rotate
without a restart, build it from a **single secrets snapshot** and expose a rebuild the rotation job
can call. Reading kid+secret from one snapshot (not four independent `getSecret()` calls) is what
makes the rebuild atomic: a rotation is either fully visible or not at all.

```js
// src/auth/tokens.js — replace the module-level `keyring` const with a rebuildable one.
import { refreshSecrets } from '../lib/secrets.js';

let keyring, currentKid;

export function rebuildKeyring() {
  const s = refreshSecrets(); // ONE consistent snapshot; all reads below index the same view.
  if (!s.JWT_KID || !s.JWT_SECRET) throw new Error('JWT_KID/JWT_SECRET not set'); // fail closed
  const ring = new Map([[s.JWT_KID, Buffer.from(s.JWT_SECRET, 'base64url')]]);
  // PREV pair is present only during the rotation window; verify still accepts old-kid tokens.
  // Require BOTH halves together so a torn store can never map a kid to the wrong secret.
  if (s.JWT_KID_PREV && s.JWT_SECRET_PREV) {
    ring.set(s.JWT_KID_PREV, Buffer.from(s.JWT_SECRET_PREV, 'base64url'));
  }
  keyring = ring;
  currentKid = s.JWT_KID;
}
rebuildKeyring(); // build at import; sign/verify below read `keyring`/`currentKid`.

export const activeKid = () => currentKid;
export const keyFor = (kid) => keyring.get(kid);
```

`signAccessToken` sets `kid: activeKid()` in the protected header and signs with
`keyFor(activeKid())`; `verifyAccessToken`'s resolver returns `keyFor(header.kid)` (throw on a
miss) — identical logic to [auth-blueprint](auth-blueprint.md), just sourced from the store. jose
compares the HS256 MAC in constant time internally, so we never hand-roll a secret comparison.
(jose's one published timing bug, CVE-2021-29443, was a padding oracle in JWE AES-CBC-HMAC
*decryption*, not JWS verification — fixed in 3.11.4; we pin ≥4.) A rotation + `rebuildKeyring()`
swaps keys live.

## Rotation events → a hash-chained audit table

Every rotation is a security event and must land in a tamper-evident log. Rather than retrofit the
money-path `audit_log` in [transaction-endpoints](transaction-endpoints.md) (whose in-tx `transfer()`
writer would break if we added NOT NULL columns to it), use a dedicated append-only `audit_chain`
table for security/rotation events, with a `prev_hash` chain so a deleted or edited row breaks the
chain. NEVER log the secret itself — only *that* a named key rotated, by whom, and when.

```sql
-- add to src/db/migrations (new numbered file, see db-migrations-backups.md).
CREATE TABLE IF NOT EXISTS audit_chain (
  id         INTEGER PRIMARY KEY,           -- rowid; monotonic append order
  user_id    INTEGER,                       -- actor, or NULL for a scheduled/automated job
  action     TEXT NOT NULL,                 -- e.g. 'jwt.rotate.promote'
  detail     TEXT NOT NULL,                 -- JSON: key NAMES / kids only, never key bytes
  created_at INTEGER NOT NULL,
  prev_hash  TEXT NOT NULL,                 -- row_hash of the previous row ('' for the genesis row)
  row_hash   TEXT NOT NULL                  -- sha256(prev_hash || canonical payload)
);
```

```js
// src/db/worker.js — hash-chained append. Each row commits sha256 over a JSON object of the exact
// stored fields, so removing or mutating any row invalidates every row_hash after it (detect via a
// verify pass). JSON.stringify of an OBJECT is used deliberately: every field is quoted/escaped, so
// an attacker-influenced `action` or `detail` string cannot inject a field delimiter into the
// pre-image (the classic hash-chain concatenation-ambiguity bug). Field order here is fixed and the
// verify pass MUST reproduce it byte-for-byte.
import { createHash } from 'node:crypto';

export function appendAudit({ userId, action, detail }) {
  const database = getDb();
  const tx = database.transaction(() => {
    // Serialized by the IMMEDIATE write lock, so no two appends can read the same tip and fork.
    const prev = stmt('SELECT row_hash FROM audit_chain ORDER BY id DESC LIMIT 1').get();
    const prevHash = prev ? prev.row_hash : ''; // genesis row chains from the empty string
    const ts = Math.floor(Date.now() / 1000);
    const detailJson = JSON.stringify(detail ?? null); // key NAMES and kids only, never bytes
    // Hash the exact serialized fields we store, so a verify pass can recompute row_hash identically.
    const payload = JSON.stringify({ userId: userId ?? null, action, detail: detailJson, ts, prevHash });
    const rowHash = createHash('sha256').update(payload).digest('hex');
    const info = stmt(
      `INSERT INTO audit_chain (user_id, action, detail, created_at, prev_hash, row_hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId ?? null, action, detailJson, ts, prevHash, rowHash);
    return { id: Number(info.lastInsertRowid), rowHash };
  });
  return tx.immediate(); // BEGIN IMMEDIATE: take the write lock up front so the tip read + append
                         // are serialized against every other writer and respect busy_timeout.
}
```

```js
// src/db/index.js
export const appendAudit = (args) => pool.run(args, { name: 'appendAudit' });
```

Emit on every rotation, e.g. `await db.appendAudit({ userId: null, action: 'jwt.rotate.promote',
detail: { fromKid: 'k3', toKid: 'k4' } })` — kids, never key bytes.

> **What the chain does and does NOT prove.** The chain makes tampering *detectable only if the
> verifier holds an anchor the attacker cannot rewrite* — otherwise an attacker with DB write access
> can edit a row and recompute every `row_hash` forward, and the chain re-validates. So the verify
> pass must compare the current tip `row_hash` (and row count) against a value shipped **off-box**:
> log the tip to `server.log` (durable pino sink, [observability](observability.md)) on each append,
> or mirror it to append-only/WORM storage. In-DB alone this is evidence against *accidental*
> edits and against an attacker who cannot also rewrite the anchor — not against a full DB compromise.

## Automated JWT rotation — scheduled job

The manual dance (generate → move current to PREV → set new pair → reload → drop PREV after the
15-min access TTL) becomes one **idempotent** script driven by the secret store, run on a schedule
and completing across two invocations: **promote** now, **retire** after the access-token TTL.

Idempotency matters because the emergency runbook (below) and any crash-retry can invoke `promote`
twice. A naive `nextKid(current)` derivation is NOT idempotent: after the first promote the live
`JWT_KID` is already the new kid, so a second promote would move the *new* kid into PREV and
**overwrite `JWT_SECRET_PREV`, destroying the genuinely-previous secret** — every in-flight token
signed with the true old kid then fails verification (a self-inflicted auth outage). The fix: detect
an in-progress rotation and re-drive the *same* target rather than chaining a fresh kid, and swap all
values through one atomic write so a reader never sees a half-applied pair.

```js
// scripts/rotate-jwt.js — node scripts/rotate-jwt.js --phase=promote | --phase=retire
// Talks to the secret store's WRITE API (shown here as a thin adapter you implement per backend).
import 'dotenv/config'; // load env BEFORE importing the db layer (see db-layer.md caveat)
import { randomBytes } from 'node:crypto';
// putSecrets writes an ATOMIC multi-key update (single Vault PUT / single rename-published file),
// so no reader observes JWT_KID updated without its matching JWT_SECRET. getSecrets reads a snapshot.
import { putSecrets, getSecrets } from '../src/lib/secret-store-admin.js';
import * as db from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';
import { ACCESS_TTL_SEC } from '../src/auth/tokens.js';

// kids are opaque and only need to be UNIQUE + never-reused. Derive from a monotonic counter kept in
// the store (KID_SEQ), not by parsing the current kid — parsing regresses/collides on retry.
function nextKid(cur) {
  const seq = Number(cur.KID_SEQ ?? 0) + 1;
  return { kid: `k${seq}`, seq };
}

async function promote() {
  const cur = await getSecrets(); // one snapshot of all rotating values
  // Idempotency guard: a PREV pair already present means a prior promote ran but its reload may not
  // have finished. Do NOT chain a new kid (that would clobber the real PREV secret). Leave the store
  // untouched and just re-trigger the reload; the operation converges instead of destroying keys.
  if (cur.JWT_KID_PREV && cur.JWT_SECRET_PREV) {
    logger.warn({ activeKid: cur.JWT_KID, prevKid: cur.JWT_KID_PREV },
      'promote is a no-op: a rotation is already in progress; re-triggering reload only');
  } else {
    const { kid: newKid, seq } = nextKid(cur);
    const newSecret = randomBytes(32).toString('base64url'); // 256-bit HS256 key
    // ONE atomic write of all five keys: PREV = the outgoing pair, active = the new pair, seq bumped.
    // Atomicity is what lets verify accept BOTH kids without ever seeing a torn kid/secret mismatch.
    await putSecrets({
      JWT_KID_PREV: cur.JWT_KID,
      JWT_SECRET_PREV: cur.JWT_SECRET,
      JWT_KID: newKid,
      JWT_SECRET: newSecret,
      KID_SEQ: String(seq),
    });
    await db.appendAudit({ userId: null, action: 'jwt.rotate.promote', detail: { fromKid: cur.JWT_KID, toKid: newKid } });
    logger.warn({ fromKid: cur.JWT_KID, toKid: newKid }, 'JWT key promoted; PREV retained for one access TTL');
  }
  // Trigger a rolling reload so every process calls rebuildKeyring() (a SIGHUP handler, or a rolling
  // restart under the process manager — see cluster-scaling.md). Runs on BOTH paths above — that is
  // what makes a retried promote converge: same store state, reload delivered again.
}

async function retire() {
  // Run >= ACCESS_TTL_SEC after promote: every token signed with the old kid has now expired, so the
  // PREV pair can go. Setting BOTH to '' in one atomic write; empty reads as "absent" (getSecret).
  await putSecrets({ JWT_KID_PREV: '', JWT_SECRET_PREV: '' });
  await db.appendAudit({ userId: null, action: 'jwt.rotate.retire', detail: { retiredAfterSec: ACCESS_TTL_SEC } });
  logger.warn('JWT PREV pair retired; single active key'); // reload again so keyrings drop the PREV key
}

const phase = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1];
const run = { promote, retire }[phase];
if (!run) throw new Error('use --phase=promote|retire');
await run();
await db.closePool();
```

Schedule (systemd timer / cron, see [db-migrations-backups](db-migrations-backups.md) for the timer
shape): `promote` on the cadence (e.g. monthly), then `retire` 20 minutes later (past the 15-min
`ACCESS_TTL_SEC`). Each phase is followed by a reload so keyrings pick up the change. The overlap
makes it zero-downtime — new tokens use the new kid, in-flight old-kid tokens still verify until
they expire. Because `promote` is idempotent and `retire` is naturally idempotent (setting `''`
twice is a no-op), a crashed-and-retried timer never corrupts the keyring.

> `putSecrets`/`getSecrets` in `src/lib/secret-store-admin.js` are the provider's write-side and MUST
> be atomic per call: for `sops`/`age` re-encrypt the full blob and publish by rename; for Vault
> `PUT` the whole KV path in one write; for cloud SM put the whole secret version. Keep this adapter
> OUT of the running app — only the rotation job (with elevated store credentials) imports it.

## Automated DB rekey — quarterly runbook

The DB key cannot rotate live (the rekey re-encrypts every page and is unsupported in WAL mode, so
`scripts/rekey.js` switches to a DELETE journal for the operation — [env-and-secrets](env-and-secrets.md),
[db-migrations-backups](db-migrations-backups.md)), so this stays an **offline, scheduled runbook**,
just a wired and logged one. It reuses `scripts/rekey.js` unchanged; the wrapper adds backup +
pre/post verification + an audit event.

```bash
# scripts/rekey-runbook.sh — quarterly. Run on the box, server STOPPED. Fails closed at each step.
set -euo pipefail
systemctl stop app                                   # 1. quiesce: no writers during rekey

node scripts/backup.js                               # 2. encrypted snapshot FIRST (VACUUM INTO)
LATEST=$(ls -t backups/app-*.db | head -1)

# 3. fetch OLD_* (current values) and generate NEW_* into the env for scripts/rekey.js
#    (store-get.js/store-put.js are thin CLIs over src/lib/secret-store-admin.js). Assign THEN
#    export: under `set -e` a plain assignment propagates the substitution's failure, while
#    `export VAR=$(cmd)` masks it (export's own exit status wins) and would rekey with empty keys.
OLD_MASTER_KEY=$(node scripts/store-get.js DB_MASTER_KEY)
OLD_KEY_SALT=$(node scripts/store-get.js DB_KEY_SALT)
NEW_MASTER_KEY=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
NEW_KEY_SALT=$(node -e "console.log(require('node:crypto').randomBytes(16).toString('base64url'))")
export OLD_MASTER_KEY OLD_KEY_SALT NEW_MASTER_KEY NEW_KEY_SALT

# 4. Escrow the NEW material to the store BEFORE the swap, keeping the OLD material too, so a crash
#    mid-rekey leaves BOTH keys recoverable — you retry with whichever key actually opens the file.
node scripts/store-put.js DB_MASTER_KEY_NEXT "$NEW_MASTER_KEY"
node scripts/store-put.js DB_KEY_SALT_NEXT   "$NEW_KEY_SALT"

node scripts/rekey.js                                # 5. hexrekey in a DELETE journal, then verified reopen

# 6. Escrow the OLD material under retired names BEFORE overwriting the live ones: the pre-rekey
#    backup opens ONLY with the old key, so it must stay recoverable until that backup leaves retention.
node scripts/store-put.js DB_MASTER_KEY_PREV "$OLD_MASTER_KEY"
node scripts/store-put.js DB_KEY_SALT_PREV   "$OLD_KEY_SALT"

# 7. Promote the new material to the live names and clear the staging copies.
node scripts/store-put.js DB_MASTER_KEY "$NEW_MASTER_KEY"
node scripts/store-put.js DB_KEY_SALT   "$NEW_KEY_SALT"
node scripts/store-put.js DB_MASTER_KEY_NEXT ""
node scripts/store-put.js DB_KEY_SALT_NEXT   ""

systemctl start app                                  # 8. boot: the worker's SELECT 1 probe proves decrypt
# 9. Chained audit event via the SAME facade the app uses — never a shell-only side channel.
node -e "import('dotenv/config').then(()=>import('./src/db/index.js')).then(async db=>{ \
  await db.appendAudit({ userId:null, action:'db.rekey', detail:{ backup:'$LATEST' } }); \
  await db.closePool(); });"
echo "rekey done. Retain $LATEST until its retention window closes — it opens only with the OLD key (escrowed as DB_MASTER_KEY_PREV / DB_KEY_SALT_PREV)."
```

Two things this runbook must never do: delete the pre-rekey backup (the only rollback — it opens
only with the **old** key, which is exactly why step 6 escrows that key; keep both until the backup
ages out of retention, [db-migrations-backups](db-migrations-backups.md)); or run while the server
is up (a concurrent writer during `hexrekey` corrupts the copy).

## Backup key separation — different trust domain

Generalizing the backup warning in [db-migrations-backups](db-migrations-backups.md): the encrypted
DB and the key that opens it must not share a blast radius. If the same compromise (stolen disk,
leaked backup bucket, over-broad IAM role) yields both, the encryption bought nothing.

- **DB backups** → object storage (bucket A, its own credentials).
- **Key material** (`DB_MASTER_KEY`, `DB_KEY_SALT`, and any retired keys still guarding old backups)
  → the secret store or a sealed offline escrow (domain B, *different* credentials, *different*
  account/project). Never the same bucket, never the same `.env` shipped with the backups.
- The rotation job needs write access to B; the backup shipper needs write access to A; **no single
  credential grants both.** That split is the control — audit it in the pre-ship gate
  ([security-checklist](security-checklist.md)).

## Emergency full-rotation runbook — suspected compromise

When you suspect a secret leaked (a laptop stolen, a repo history exposing `.env`, an anomalous
audit chain), rotate everything the blast radius could reach, fastest-revocation first. Assume the
attacker has every current secret until proven otherwise.

1. **Sessions first (seconds).** Bump `session_version` **for every user** and revoke every refresh
   family — the fleet-wide variant of `logout-all` ([auth-blueprint](auth-blueprint.md)), which is
   per-user; here you run it with no `WHERE` filter, in one atomic `writeTx` (parameterized, no
   string-built SQL): `UPDATE users SET session_version = session_version + 1` and
   `UPDATE refresh_tokens SET revoked = 1`, then flush the sv cache in every process
   (`invalidateSvCache()`). Kills live access tokens within one sv-cache TTL regardless of the JWT key.
2. **JWT keyring (minutes).** Run `rotate-jwt.js --phase=retire` FIRST to drop any in-flight PREV
   pair — otherwise a scheduled rotation caught mid-window makes `promote` a no-op (its idempotency
   guard) and the assumed-leaked active key would survive. Then `--phase=promote` mints a fresh key,
   then `--phase=retire` again immediately — **skip the grace window**; a leaked key must not keep
   verifying. (Step 1 already made every current access token fail the sv check, so this is defence
   in depth.) Clients silently re-auth via the refresh flow, whose tokens step 1 already revoked →
   forced login.
3. **DB key (offline, ASAP).** Run the rekey runbook with fresh material. The old key is now assumed
   public, so any pre-rotation backup it opens is compromised data — rotate the PII/blind-index keys
   too if they gate it.
4. **Derived-data keys (data migration).** New `PII_MASTER_KEY` → re-encrypt PII columns under
   HKDF keys; new `BLIND_INDEX_KEY` → recompute search tokens. Batched, in worker transactions, one
   audit event per batch.
5. **Third-party creds.** Rotate OAuth secrets, SMTP creds, and `*_SIGNING_KEY` at their providers;
   update the store; reload.
6. **Record the chain.** `appendAudit` a `security.emergency_rotation` event (scope + reason, no
   secrets) and verify the chain end-to-end against the off-box anchor (above) — an intact chain
   from before the incident is your evidence of what the attacker did and did not alter.

Rehearse steps 1-2 (fully automated, reversible-by-re-login); steps 3-4 are the ones that hurt
under pressure, which is exactly why the runbook exists before you need it.
