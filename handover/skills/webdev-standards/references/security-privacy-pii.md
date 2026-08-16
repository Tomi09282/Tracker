# Privacy & PII

Why this design: full-DB encryption ([db-layer](db-layer.md)) protects one thing — a stolen `.db`
file. It does nothing at runtime: a bug that returns a row, an over-broad admin query, a log line, or
a backup opened with the key all expose plaintext PII. So the most sensitive columns get a **second,
application-layer** AES-256-GCM envelope under a *separate* key that a DB read alone can't undo, and
the obligations a real product carries — erase-me, export-me, retain-only-as-needed, moderate UGC,
measure without surveilling — get safe-by-construction mechanics here. Everything reuses the existing
worker-pool facade, jose/argon2 auth, `.strict()` zod, and pino.

---

## 1. Field-level PII encryption (envelope over the full-DB cipher)

Rationale: a per-field AEAD under a separate key defends the *value in a returned row / backup / stray
log*, so one leak isn't game over — and it makes GDPR crypto-shredding (§2) a matter of discarding one
small key.

Add the keys to the **central** env schema — [config-and-topology](config-and-topology.md) owns
`src/lib/env.js`, so declare each var once there (never a local re-declaration), following the
`DB_MASTER_KEY` pattern from [env-and-secrets](env-and-secrets.md):

```js
// src/lib/env.js — add inside EnvSchema. A distinct key so DB-at-rest and field-level are
// independent trust domains: compromising one must not hand over the other.
PII_MASTER_KEY: z.string().min(32, 'must be at least 32 chars — generate it randomly'),
PII_KEY_SALT: z.string().min(16, 'must be at least 16 chars'),
BLIND_INDEX_KEY: z.string().min(32, 'must be at least 32 chars — keyed HMAC for equality search'),
EXPORT_LINK_KEY: z.string().min(32, 'must be at least 32 chars — keyed MAC for signed export links'), // §3
```

```js
// src/lib/pii.js — AES-256-GCM envelope + keyed blind index. Used ONLY inside the db worker
// (see db-layer.md: the worker owns the keyed connection; PII plaintext must not leak to the pool
// facade or the event loop any more than necessary).
import { scryptSync, randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';

// The DEK is derived once from the master + salt. scrypt params are PART OF THE KEY — changing them
// (or the salt) makes every existing ciphertext undecryptable, exactly like the DB key (dbkey.js).
// maxmem must cover OpenSSL's requirement of ~128*r*N bytes = 128*8*131072 = 128 MiB — Node's
// DEFAULT maxmem is only 32 MiB, so scryptSync would throw 'Invalid scrypt params' without raising
// it. 256 MiB gives comfortable headroom above the ~128 MiB requirement.
const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let dek; // module-level: derived once per worker (scrypt is deliberately hundreds of ms)
function key() {
  if (!dek) dek = scryptSync(process.env.PII_MASTER_KEY, process.env.PII_KEY_SALT, 32, SCRYPT);
  return dek;
}

// Layout of the stored BLOB: [12-byte IV][16-byte GCM tag][ciphertext]. Self-contained, so decrypt
// needs no side channels. A fresh RANDOM 96-bit IV per encryption — GCM is catastrophically broken
// under IV reuse, so never derive or reuse it.
export function encryptPii(plaintext) {
  if (plaintext == null) return null; // NULL stays NULL — a missing value isn't ""
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]); // store as a BLOB column
}

export function decryptPii(blob) {
  if (blob == null) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  // Reject malformed/truncated blobs BEFORE slicing: a shortened buffer would hand GCM a short
  // tag, and absent an authTagLength option Node accepts tags down to 32 bits — quietly cutting
  // forgery resistance. >= 28 guarantees a full 12-byte IV and 16-byte tag.
  if (buf.length < 28) throw new Error('PII_BLOB_MALFORMED');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag); // GCM verifies integrity here — final() THROWS on any tamper/wrong key
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// Blind index: you can't do `WHERE email = ?` on a randomized ciphertext (every encryption differs).
// Store a KEYED HMAC of the NORMALIZED value in a separate indexed column and search on THAT.
// Keyed (not a bare hash) so an attacker with the DB can't brute-force a low-entropy email offline.
// Normalize (trim+lowercase) BEFORE hashing so lookups match regardless of input casing.
export function blindIndex(value) {
  const norm = String(value).trim().toLowerCase();
  return createHmac('sha256', process.env.BLIND_INDEX_KEY).update(norm).digest('hex');
}

// Constant-time compare for any place you match a blind index in JS rather than in SQL. The length
// guard is mandatory: timingSafeEqual THROWS (ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH) on unequal length.
export const biEqual = (a, b) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

Schema — encrypted columns are BLOBs; each searchable one gets a sibling indexed blind-index column:

```sql
-- add to the users table / a profile table. The plaintext columns do NOT exist.
ALTER TABLE users ADD COLUMN email_enc     BLOB;   -- AES-256-GCM envelope (iv|tag|ct)
ALTER TABLE users ADD COLUMN email_bi      TEXT;   -- hmac-sha256(email) for equality lookup
ALTER TABLE users ADD COLUMN full_name_enc BLOB;   -- name/phone/address/DOB: encrypted, NOT indexed
ALTER TABLE users ADD COLUMN phone_enc     BLOB;
ALTER TABLE users ADD COLUMN erased_at     INTEGER; -- tombstone marker set by the erasure tx (§2b)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_bi ON users(email_bi); -- uniqueness + O(1) lookup
-- NULL email_bi (an erased user, §2b) is exempt from UNIQUE in SQLite — many erased rows coexist.
```

Worker usage — encrypt on write, look up by blind index, decrypt only when the value is actually needed:

```js
// src/db/worker.js — a named function; PII crypto stays inside the worker thread.
import { encryptPii, decryptPii, blindIndex } from '../lib/pii.js';

export function createUser({ email, passwordHash, fullName }) {
  const info = stmt(
    `INSERT INTO users (email_enc, email_bi, password_hash, full_name_enc)
     VALUES (?, ?, ?, ?)`               // email_bi is UNIQUE → duplicate registration fails atomically
  ).run(encryptPii(email), blindIndex(email), passwordHash, encryptPii(fullName));
  return { id: Number(info.lastInsertRowid) };
}

export function findUserByEmail({ email }) {
  // Search on the blind index, never on the ciphertext. Decrypt only the row we found.
  const row = stmt('SELECT id, email_enc, password_hash, role, session_version FROM users WHERE email_bi = ?')
    .get(blindIndex(email));
  if (!row) return null;
  return { ...row, email: decryptPii(row.email_enc), email_enc: undefined };
}
```

Every named worker function below (`createUser`, `findUserByEmail`, `eraseUser`, `buildExport`,
`auditEvent`, `runRetention`) needs a one-line facade export in `src/db/index.js`, exactly like
`transfer` in [transaction-endpoints](transaction-endpoints.md) — e.g.
`export const eraseUser = (args) => pool.run(args, { name: 'eraseUser' });`. `db.*` calls in the
routes below resolve through those.

- Login by email keeps working: the `email_bi` UNIQUE index is the lookup and the uniqueness
  constraint — the auth flow in [auth-blueprint](auth-blueprint.md) swaps `WHERE email = ?` for
  `findUserByEmail`, everything else (argon2, dummy-hash timing) is unchanged.
- Never log a decrypted value, never return `*_enc`/`*_bi` to a client, and never put PII in a JWT
  claim ([observability](observability.md) log discipline). Decrypt at the last moment, for the
  narrowest scope.
- Rotating `PII_MASTER_KEY` = re-encrypt every BLOB with the new DEK (a maintenance job that
  decrypts with the old key, re-encrypts with the new); rotating `BLIND_INDEX_KEY` = recompute every
  `*_bi`. Both are offline batch jobs, same discipline as the DB rekey in [env-and-secrets](env-and-secrets.md).

---

## 2. GDPR retention + right-to-erasure

Rationale: "delete data we no longer need" and "erase me" are legal obligations — retention is a
scheduled per-table sweep; erasure is an atomic **crypto-shred** (destroy the value) plus tombstone,
keeping only the non-identifying financial record the law requires retained.

### 2a. Retention sweep (reuse the daily purge hook)

The refresh-token purge already runs daily ([auth-blueprint](auth-blueprint.md) Maintenance). Add a
retention pass to the *same* scheduler so there is one place that ages data out.

```js
// src/db/worker.js — data retention sweep. Policy lives in ONE table so it is auditable and
// changeable without a code deploy; the sweep anonymizes or deletes per row.
export function runRetention({ now = Math.floor(Date.now() / 1000) } = {}) {
  const tx = getDb().transaction(() => {
    // Example policies — tune per table. Financial audit rows are NOT deleted here (legal
    // retention); §2b strips their direct identifiers instead.
    const deletedSupport = stmt(
      `DELETE FROM support_messages WHERE created_at < ? - (90 * 86400)` // 90-day support retention
    ).run(now).changes;
    // Analytics events carry no identifiers by construction (§6) — nothing to redact; still age
    // them out so the table doesn't grow forever. day_bucket is the only time column ('YYYY-MM-DD'
    // sorts lexicographically), so sweep on it directly.
    const deletedEvents = stmt(
      `DELETE FROM analytics_events WHERE day_bucket < date(?, 'unixepoch', '-180 days')`
    ).run(now).changes;
    return { deletedSupport, deletedEvents };
  });
  return tx.immediate();
}
```

```js
// src/db/index.js
export const runRetention = () => pool.run({}, { name: 'runRetention' });

// wherever the daily maintenance runs (same hook as the refresh-token purge):
const r = await db.runRetention();
logger.info(r, 'retention sweep complete');
```

Document the concrete schedule per table in the retention table of [compliance](#5-legal--compliance-surface-compliancemd).

### 2b. Right-to-erasure endpoint (crypto-shred + tombstone + revoke)

```js
// src/db/worker.js — erase a user. ONE named atomic transaction (see transaction-endpoints.md).
// Crypto-shred: null the encrypted PII so the ciphertext is gone AND (if per-user DEKs are used)
// drop the user's key. Even without per-user DEKs, nulling the BLOBs destroys the recoverable value.
export function eraseUser({ userId }) {
  const tx = getDb().transaction(() => {
    const u = stmt('SELECT id FROM users WHERE id = ?').get(userId);
    if (!u) throw new Error('NOT_FOUND');

    // 1. Destroy / tombstone every PII column. email_bi must go too or the erased user is still
    //    findable/enumerable by a known email. Keep the row (FKs from financial records) but empty it.
    stmt(
      `UPDATE users
         SET email_enc = NULL, email_bi = NULL, full_name_enc = NULL, phone_enc = NULL,
             password_hash = 'ERASED', role = 'erased', erased_at = unixepoch(),
             session_version = session_version + 1   -- kills every live access token (auth-blueprint.md)
       WHERE id = ?`
    ).run(userId);

    // 2. Revoke ALL refresh families for the user — no session may survive erasure.
    stmt('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);

    // 3. Strip direct identifiers from retained financial rows WITHOUT deleting them
    //    (legal retention of the transaction record). The money facts stay; the person is unlinked.
    stmt(`UPDATE transfers SET created_by = NULL WHERE created_by = ?`).run(userId); // keep amounts, drop link
    //    audit_log rows are deliberately NOT touched: they are append-only by trigger and user_id
    //    is inside entry_hash (security-integrity.md) — the UPDATE would abort, and nulling
    //    user_id would (correctly) read as tampering. That is lawful: the chained fields hold only
    //    an internal numeric id plus non-PII detail, which stops identifying anyone once this row
    //    is shredded, and the rows are retained under legal obligation (GDPR Art. 17(3)(b)). If
    //    policy also demands redacting the UNCHAINED ip/user_agent annotations, use the offline
    //    trigger-drop maintenance pattern from security-integrity.md — never in this hot tx.

    // 4. A NON-PII erasure record in the hash-chained audit log (proof the erasure happened, for
    //    the regulator) — carries no personal data itself. userId: null must be explicit: the
    //    canonical appendAudit binds it directly and better-sqlite3 throws on undefined.
    appendAudit({ userId: null, action: 'account_erased', detail: JSON.stringify({ subject: userId }) });
    return { erased: true };
  });
  tx.immediate();
  return { ok: true };
}
```

`appendAudit` is the tamper-evident chained logger — each row commits the `entry_hash` of the row
before it as its `prev_hash`, so a later selective deletion of an audit row is detectable. It is
defined ONCE, in [security-integrity](security-integrity.md) (the `prev_hash` + `entry_hash`
columns, the `auditEntryHash()` helper, and the append-only triggers) — per
[integration-notes](integration-notes.md) that file owns `audit_log`, so do NOT re-declare the
function or invent a second hash column here. This file adds only the two integration points:

```js
// src/db/worker.js — audit integration. appendAudit (security-integrity.md) is SELECT-prev +
// INSERT + seal, so it is race-free exactly when it runs under an immediate transaction — the
// write lock serializes appenders, so no two rows ever read the same prev_hash.
//
// 1. eraseUser above calls it INSIDE its own tx.immediate(): the erasure and its audit proof
//    commit or roll back together, and the write lock is already held.
// 2. The export routes (§3) append OUTSIDE any transaction, so that path gets its own immediate
//    tx via this exported wrapper — a bare append from a pool worker would race a concurrent one
//    and fork the chain.
export function auditEvent({ userId = null, action, detail }) {
  const tx = getDb().transaction(() => appendAudit({ userId, action, detail }));
  tx.immediate();
  return { ok: true };
}
```

The erase route requires a **fresh** password re-auth so a hijacked live session can't nuke an
account (this is a destructive, irreversible operation):

```js
// src/account/routes.js — POST /api/account/erase. Mount under app-level csrfProtection, after requireAuth.
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as db from '../db/index.js';
import { requireAuth, clearAuthCookies, invalidateSvCache } from '../auth/middleware.js';
import { logger } from '../lib/logger.js';

const eraseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
const EraseSchema = z.object({ password: z.string().min(1).max(128) }).strict();

router.post('/account/erase', requireAuth, eraseLimiter, async (req, res, next) => {
  try {
    const { password } = EraseSchema.parse(req.body);
    // Fresh re-auth: re-read the hash and verify NOW — the JWT alone is not enough for erasure.
    // password_hash is NOT PII-encrypted (it is already an argon2 hash), so the generic facade reads it.
    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user || !(await argon2.verify(user.password_hash, password))) {
      logger.warn({ userId: req.user.id }, 'erase denied: bad re-auth');
      return res.status(401).json({ error: 'invalid credentials' });
    }
    await db.eraseUser({ userId: req.user.id });
    invalidateSvCache(req.user.id); // sv bump already done in the tx; drop the cache so it bites now
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- Crypto-shred beats row-delete here because FKs (financial rows) reference the user; nulling the
  encrypted columns makes the *value* unrecoverable while the skeleton row survives for legal audit.
- The bumped `session_version` + revoked families guarantee no token issued before erasure keeps
  working (the sv re-check in [auth-blueprint](auth-blueprint.md) enforces it within one cache TTL).
- Erasure of backups: old encrypted backups still contain the pre-erasure PII. Document (in
  [compliance](#5-legal--compliance-surface-compliancemd)) that PII ages out of backups within the
  backup retention window — GDPR accepts a bounded backup lag, not indefinite retention.

---

## 3. Data export / portability (async, signed link, audited)

Rationale: a full-PII export is both a heavy job (a large export holds a DB worker for its whole
build — hand it to a job queue at scale) and the single richest thing an attacker can steal — so it
is step-up-authed, decrypted only into the artifact, delivered via a signed short-lived link
**bound to the owning user**, rate-limited, and audited on every request.

```js
// src/db/worker.js — build the export artifact inside the worker (it owns the PII key). Returns a
// plain object; the caller writes it to a file and mints a link. Decrypt here; never log the values.
import { decryptPii } from '../lib/pii.js';
export function buildExport({ userId }) {
  const u = stmt('SELECT id, email_enc, full_name_enc, phone_enc, role, created_at FROM users WHERE id = ?')
    .get(userId);
  if (!u) throw new Error('NOT_FOUND');
  const transfers = stmt('SELECT id, amount_cents, created_at FROM transfers WHERE created_by = ?').all(userId);
  // Documented, versioned, machine-readable schema. schema_version lets a consumer parse it stably.
  return {
    schema_version: 1,
    generated_at: Math.floor(Date.now() / 1000),
    subject: {
      id: u.id,
      email: decryptPii(u.email_enc),        // decrypted ONLY into the artifact, never into a log
      full_name: decryptPii(u.full_name_enc),
      phone: decryptPii(u.phone_enc),
      role: u.role,
      created_at: u.created_at,
    },
    transfers, // money stays as integer minor units — document the unit in the schema
  };
}
```

```js
// src/account/export.js — export job + signed link. The route awaits this inline, which is fine
// while exports are small (the DB work already runs in a pool worker); at scale, move generation
// behind a real job queue so a big artifact can't monopolize a worker.
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as db from '../db/index.js';
import { env } from '../lib/env.js'; // main-thread module → read the validated env object, not process.env
import { logger } from '../lib/logger.js';

const EXPORT_DIR = path.resolve('./storage/exports'); // OUTSIDE the web root — never statically served
export const LINK_TTL_SEC = 15 * 60; // exported: the request route reports it to the client

// The link is a keyed, time-limited MAC that BINDS the file to its owner. The userId is part of the
// signed message AND is re-checked at download (below) — so a leaked link is useless to a different
// authenticated account, not merely "hard to guess". This closes the IDOR: requireAuth alone proves
// only that *some* user is logged in, never that THIS export is theirs.
function signLink(fileId, ownerId, exp) {
  const mac = createHmac('sha256', env.EXPORT_LINK_KEY).update(`${fileId}.${ownerId}.${exp}`).digest('hex');
  return `/api/account/export/${fileId}?exp=${exp}&sig=${mac}`;
}
// Verifies the MAC over (fileId, ownerId, exp). ownerId is supplied by the download route from the
// authenticated session (req.user.id) — NOT from the URL — so a caller cannot substitute another
// user's id to make the MAC match. A wrong owner → MAC mismatch → 403.
export function verifyLink(fileId, ownerId, exp, sig) {
  // Strict integer expiry: reject non-numeric/expired BEFORE any crypto so a bogus exp can't slip by.
  const expNum = Number(exp);
  if (!/^[0-9a-f]{32}$/.test(fileId) || !Number.isInteger(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = createHmac('sha256', env.EXPORT_LINK_KEY).update(`${fileId}.${ownerId}.${exp}`).digest('hex');
  const a = Buffer.from(sig ?? '', 'hex'), b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b); // timing-safe MAC compare (length guard first)
}

// Builds the artifact, persists it owner-tagged, and mints the owner-bound link. Every generation
// is audited (chained log) — a full-PII export is a sensitive, exfiltration-relevant event.
export async function generateExport(userId) {
  const data = await db.buildExport({ userId });
  await mkdir(EXPORT_DIR, { recursive: true });
  const fileId = randomBytes(16).toString('hex');
  // Persist the owner alongside the artifact so the download route can enforce ownership even if the
  // signing key were later rotated. The MAC binds the owner cryptographically; this is defense-in-depth.
  await writeFile(path.join(EXPORT_DIR, `${fileId}.json`),
    JSON.stringify({ owner_id: userId, data }), { flag: 'wx' }); // wx: never overwrite an existing id
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
  await db.auditEvent({ userId, action: 'data_export_generated', detail: JSON.stringify({ fileId }) });
  logger.info({ userId, fileId }, 'data export generated'); // fileId only — never the payload
  return signLink(fileId, userId, exp);
}
```

```js
// src/account/routes.js — request + download. Step-up re-auth to REQUEST; owner-bound signed link
// AND an ownership re-check to DOWNLOAD.
const exportLimiter = rateLimit({          // cheap-to-abuse dump-and-scrape guard
  windowMs: 24 * 60 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/account/export', requireAuth, exportLimiter, async (req, res, next) => {
  try {
    const { password } = EraseSchema.parse(req.body); // reuse the fresh-password re-auth schema
    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user || !(await argon2.verify(user.password_hash, password))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const link = await generateExport(req.user.id); // awaited inline — fine for small exports; a job queue at scale
    res.status(202).json({ link, expiresInSec: LINK_TTL_SEC }); // 202: accepted, link is time-limited
  } catch (err) { next(err); }
});

router.get('/account/export/:fileId', requireAuth, async (req, res, next) => {
  try {
    const { fileId } = req.params;
    // Query params can be string | undefined | array | nested object (Express extended parser);
    // coerce to string so verifyLink never sees an array/object (which would NaN/throw its way past
    // the check). A non-string simply becomes '' and fails the MAC.
    const exp = typeof req.query.exp === 'string' ? req.query.exp : '';
    const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
    // Bind the MAC check to the CALLER's own id — never to an id from the URL. A user holding another
    // user's link fails here because req.user.id doesn't match the signed owner. (fileId is validated
    // to [0-9a-f]{32} inside verifyLink, so the path.join below cannot traverse.)
    if (!verifyLink(fileId, req.user.id, exp, sig)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const raw = await readFile(path.join(EXPORT_DIR, `${fileId}.json`), 'utf8').catch(() => null);
    if (!raw) return res.status(404).json({ error: 'not found' });
    const artifact = JSON.parse(raw);
    // Defense-in-depth ownership check against the persisted owner (anti-IDOR: WHERE owner = caller).
    if (artifact.owner_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    await db.auditEvent({ userId: req.user.id, action: 'data_export_downloaded', detail: JSON.stringify({ fileId }) });
    res.set('Content-Type', 'application/json')
       .set('Content-Disposition', `attachment; filename="export-${fileId}.json"`) // download, never inline-render
       .set('X-Content-Type-Options', 'nosniff')
       .send(JSON.stringify(artifact.data)); // ship only the payload, not the owner wrapper
  } catch (err) { next(err); }
});
```

- The link is unforgeable (keyed MAC), short-lived, **owner-bound**, and still behind `requireAuth`
  — four independent gates. Because the MAC and a persisted `owner_id` both pin the artifact to one
  account, a leaked URL is useless to a different user, not merely to an anonymous stranger.
- Purge generated artifacts on the retention sweep (§2a): they contain full plaintext PII and must
  not linger in `storage/exports`.

---

## 4. Content moderation / UGC safety (ugc.md)

Rationale: any string a user submits that another user or an admin later *sees* is an injection sink —
React's default escaping covers the common case, but email templates, admin panels, and
`dangerouslySetInnerHTML` are where it doesn't. Extends the upload/output rules in
[input-validation](input-validation.md) with the moderation-specific pieces.

**Input & output discipline (the XSS surface React does NOT cover):**

- Store UGC as the raw text the user typed (bounded + control-char-free via `safeShortString`, see
  [input-validation](input-validation.md)); do the *encoding at the output sink*, per context.
- React `{value}` escapes HTML — safe by default. The dangerous sinks:
  - `dangerouslySetInnerHTML`: forbidden for UGC unless sanitized with **DOMPurify** (allowlist,
    never a regex). Treat any occurrence as a review red flag.
  - **Email templates** interpolating user data: HTML-escape every interpolated value; a display
    name of `<img src=x onerror=...>` renders in the recipient's mail client otherwise.
  - **Admin panels** rendering user strings: same escaping as the public app — admins are the
    highest-value XSS target (session = full control).
  - CSV/Excel export of UGC: prefix a leading `=`, `+`, `-`, `@` with `'` to stop formula injection.

```js
// src/lib/sanitize-html.js — the ONLY place UGC becomes HTML. Server-side allowlist sanitizer for
// the rare field that must render formatting (e.g. a rich note). Everything else stays plain text.
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
const DOMPurify = createDOMPurify(new JSDOM('').window);
// Do NOT set PARSER_MEDIA_TYPE: 'application/xhtml+xml' with this jsdom setup — under XHTML parsing
// DOMPurify returns '' for input containing void tags like <br> (cure53/DOMPurify#938). The default
// text/html parser (what we use) handles the allowlist below correctly.
export const sanitizeHtml = (dirty) =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^https?:/i, // no javascript:/data: URIs in hrefs
  });
```

**File-upload pipeline** — build on the magic-byte-sniffing uploader in
[input-validation](input-validation.md); the UGC-specific hardening:

- Validate the **real** type from magic bytes (`file-type`), not the extension or client
  `Content-Type`; cap size at the multer limit so it bites before the body is fully read.
- Store **outside the web root**; serve only through an authenticated streaming handler with the
  correct `Content-Type`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`
  — a stored file must never be executed or rendered inline.
- **SVG is not a safe image type for upload** — it's an XML document that can carry `<script>`.
  Either reject `image/svg+xml` outright, or sanitize it through DOMPurify with
  `USE_PROFILES: { svg: true }` and re-serve as an attachment, never inline.
- **Strip image metadata**: re-encode raster uploads with `sharp` — this drops EXIF (which can carry
  GPS location, a privacy leak) and neutralizes polyglot files that are a valid image *and* a valid
  script.

```js
// avatar hardening after the sniff+allowlist in input-validation.js — re-encode strips EXIF/GPS
// and defuses polyglots. sharp drops all input metadata by default (no keepMetadata/keepExif call
// here), and rotate() bakes in + removes the EXIF orientation tag, so the output is metadata-free.
import sharp from 'sharp';
const clean = await sharp(req.file.buffer).rotate().jpeg({ quality: 82 }).toBuffer();
```

**Moderation / report path** — if content is user-visible, users need a way to flag it and admins a
queue to act on:

```sql
CREATE TABLE IF NOT EXISTS content_reports (
  id           INTEGER PRIMARY KEY,
  content_type TEXT NOT NULL,                 -- 'note' | 'message' | 'avatar' ...
  content_id   INTEGER NOT NULL,
  reporter_id  INTEGER REFERENCES users(id),  -- nullable: survives reporter erasure (§2b)
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open | actioned | dismissed
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Report submission is a per-user rate-limited POST (`.strict()` schema, `content_type` an enum,
`reason` a bounded `safeShortString`); the admin action route is behind `requireRole('admin')` **and**
a DB-side role re-check ([auth-blueprint](auth-blueprint.md)), and every moderation decision writes
a chained audit row (`db.auditEvent`, §2b).

---

## 5. Legal / compliance surface (compliance.md)

Rationale: §2-§3 are the *how*; the law also requires the documented *basis* — versioned agreements
users actually accepted, a lawful basis per purpose, an honest cookie posture, an Art. 30 record, a
retention schedule, and a breach runbook. None live in code but all underpin the mechanics.

**Versioned ToS / Privacy Policy with recorded acceptance:**

```sql
CREATE TABLE IF NOT EXISTS policy_acceptances (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document     TEXT NOT NULL,        -- 'tos' | 'privacy'
  version      TEXT NOT NULL,        -- e.g. '2026-07-01'; bump on MATERIAL change
  accepted_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, document, version)
);
```

- Store the accepted **version + timestamp** at registration and again whenever a material change
  ships; a middleware compares the user's latest accepted version against the current one and
  re-prompts (a soft gate, not a login block) on mismatch.
- Keep the actual document text under version control (a `legal/` folder) so `version` maps to
  exact wording — "they accepted v2026-07-01" is only meaningful if that text is retrievable.

**Lawful basis / consent record** — separate the purposes, because they have different legal bases:

```sql
CREATE TABLE IF NOT EXISTS consents (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,        -- 'marketing_email' | 'product_analytics' ...
  granted     INTEGER NOT NULL,     -- 1 grant / 0 withdraw; append a NEW row on change (audit trail)
  basis       TEXT NOT NULL,        -- 'consent' | 'contract' | 'legitimate_interest' | 'legal_obligation'
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

- **Transactional email** (password reset, receipts, security alerts) is *contract/legitimate
  interest* — no consent toggle, and it must be a separate send path from marketing so a
  marketing-consent withdrawal never suppresses a security alert.
- **Marketing email** is *consent* — off by default, withdrawable, and the withdrawal is honored on
  the next send (check `consents` before every marketing send).
- Withdrawal appends a new `granted = 0` row rather than updating — you keep the full grant/withdraw
  history, which is itself part of the compliance record.

**Cookie / consent posture (write this down so a banner doesn't wrongly gate login):** the auth
cookies (`__Host-access`, `__Secure-refresh`, see [auth-blueprint](auth-blueprint.md)) are
**strictly necessary** — they authenticate the session, carry no tracking, and are exempt from the
ePrivacy consent requirement. Document that reasoning explicitly so nobody later drops a consent
banner in front of the login flow. Only *non-essential* cookies/storage would need a banner — and
this stack deliberately has none (no third-party analytics, §6; no localStorage tokens,
[frontend-conventions](frontend-conventions.md)).

**Records of processing (Art. 30)** — a short living table in `compliance.md`: for each processing
activity, the **purpose**, **data categories**, **lawful basis**, **retention**, and **recipients
/ sub-processors** (hosting, email provider, backup storage). This is the document a regulator asks
for first.

**Data-retention schedule** — one table mapping each stored table to its `retention_days`, wired to
the §2a sweep so the documented policy and the code that enforces it can't drift:

| Table | Retention | Basis |
| --- | --- | --- |
| `support_messages` | 90 days | support ops, then purge |
| `analytics_events` | 180 days | product metrics, non-PII (§6) |
| `refresh_tokens` | expiry + 30-day cap | session security ([auth-blueprint](auth-blueprint.md)) |
| `transfers` / `audit_log` | legal retention (e.g. 7 yrs); `transfers` unlinked on erasure, `audit_log` append-only — retained numeric id under Art. 17(3)(b) (§2b) | accounting / anti-fraud |
| `data exports` (files) | purged on next sweep | minimize plaintext-PII artifacts (§3) |

**Breach-notification runbook (72-hour GDPR clock):** on suspected breach — (1) contain (rotate the
implicated key: `DB_MASTER_KEY`, `PII_MASTER_KEY`, or `JWT_SECRET` per [env-and-secrets](env-and-secrets.md);
force `logout-all` via an `sv` bump), (2) assess scope from the hash-chained `audit_log` (run
`verify-audit.js` from [security-integrity](security-integrity.md) first — it proves the trail
wasn't rewritten) and `server.log`, (3) if personal data is at risk,
notify the supervisory authority **within 72 hours** of becoming aware, and affected users
"without undue delay" if the risk is high. Link this runbook from the incident/on-call docs in
[deployment](deployment.md) / [observability](observability.md) so it's found under pressure.

---

## 6. Privacy-preserving analytics (analytics.md)

Rationale: ops observability ([observability](observability.md)) tells you the *box* is healthy but
nothing about product/funnel behavior. Fill that gap deliberately with a self-hosted, cookieless,
PII-free approach — reaching for Google Analytics later would drag in a consent banner and a
sub-processor, against this stack's no-third-party ethos.

- **Operational metrics** (latency, status classes, event-loop lag) already live in
  [observability](observability.md) — that split stays: ops metrics are essential and unconsented;
  *product* metrics are the new, separately-governed layer here.
- **Self-hosted & cookieless.** Either run a Plausible/Umami-style self-hosted collector, or — the
  zero-dependency option that fits this stack — record first-party events straight into the DB /
  log pipeline. No third-party script, no tracking cookie, no cross-site identifier.

```sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,         -- 'signup_completed' | 'checkout_started' ... (an allowlisted enum)
  props       TEXT,                  -- JSON: NON-PII dimensions only (plan tier, page, referrer host)
  day_bucket  TEXT NOT NULL          -- 'YYYY-MM-DD' — the ONLY time column, deliberately: a precise
                                     -- per-event timestamp would undo the coarse-time promise and
                                     -- make events re-identifiable. NO per-event user id either.
);
```

```js
// src/lib/analytics.js — record a product event. PII-MINIMIZED BY CONSTRUCTION: the signature has
// no place to pass a user id, an email, or a money amount, so a careless call site can't leak them.
import * as db from '../db/index.js';
const ALLOWED = new Set(['signup_completed', 'checkout_started', 'checkout_completed', 'feature_used']);
export async function track(name, props = {}) {
  if (!ALLOWED.has(name)) return;         // allowlist: no ad-hoc event names carrying free-text PII
  const day = new Date().toISOString().slice(0, 10); // day granularity — not a re-identifying timestamp
  // props must be small, low-cardinality dimensions. NEVER pass user identifiers or money amounts.
  await db.run('INSERT INTO analytics_events (name, props, day_bucket) VALUES (?, ?, ?)',
    [name, JSON.stringify(props ?? {}), day]);
}
```

- **PII minimization is enforced, not requested:** no user id column, day-bucket instead of a
  timestamp, an event-name allowlist, and low-cardinality props only. Never log a user identifier,
  email, IP, or money amount into an analytics event — those belong to the operational log
  (correlated by `requestId`, [observability](observability.md)), not the product-metrics table.
- **Consent-gated when non-essential.** Aggregate, non-identifying counts can run on legitimate
  interest; anything that could re-identify a user requires the `product_analytics` consent (§5) —
  check `consents` before recording those, so analytics aligns with the compliance layer instead of
  quietly undermining it.
- Age events out on the retention sweep (§2a) — 180 days is plenty for product trends and keeps the
  table (and any residual re-identification risk) bounded.