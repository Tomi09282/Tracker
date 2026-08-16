# Integration notes — combining playbooks without conflicts

Read this **whenever you pull in more than one extended playbook.** Each reference file is a
self-contained module written to stand alone, so where two of them touch the **same** artifact —
the `users` table, the `audit_log`, the env schema, the money type — they necessarily overlap. This
file is the single authoritative resolution: when the docs differ, **this table wins.** It is not a
new design; it just names the canonical choice so a combined project stays coherent.

## Ownership: one file owns each shared artifact

| Shared artifact | Canonical owner | Rule for every other file |
|---|---|---|
| The zod env schema (`src/lib/env.js`) | [config-and-topology.md](config-and-topology.md) | Reference `env.*`; never re-declare a var. A file that "introduces" a var just adds it to the central schema once. |
| The `users` CREATE TABLE | [auth-blueprint.md](auth-blueprint.md) | New columns go into that CREATE TABLE (fresh DB) or a numbered migration ([db-migrations-backups.md](db-migrations-backups.md)) — **never a repeated `ALTER`** (SQLite has no `ADD COLUMN IF NOT EXISTS`, so a second boot throws). |
| The `audit_log` table + `appendAudit()` | [security-integrity.md](security-integrity.md) | Use its `prev_hash`+`entry_hash` chain, `auditEntryHash()`, and append-only triggers. Don't define a second `appendAudit`/`hash` column. |
| The migration runner | [db-migrations-backups.md](db-migrations-backups.md) | Its numbered `migrate({dir})` **supersedes** the `schemaPath` one in [db-layer.md](db-layer.md). |
| The DB worker facade (`src/db/index.js`) | [db-layer.md](db-layer.md) | Every named worker tx is `export const name = (a) => pool.run(a, {name})` and is called `await db.name(args)` — there is **no** generic `db.tx(name, args)`. |
| The HTTP error envelope | [api-conventions.md](api-conventions.md) | Its `{error, code, requestId}` supersedes the bare `{error}` handler in [server-skeleton.md](server-skeleton.md); adopt it once you wire api-conventions. |
| The CORS layer | [config-and-topology.md](config-and-topology.md) | Pick ONE implementation (the `cors` package from api-conventions.md **or** the hand-rolled middleware here), not both. Methods: `GET,POST,PUT,PATCH,DELETE`; headers: `Content-Type, X-CSRF, Idempotency-Key`. |
| The CSP | [security-hardening.md](security-hardening.md) | Its nonce + `strict-dynamic` policy (`useDefaults:false`) is canonical; helmet examples in other files are simplified starters. |
| The shared zod pieces (`src/lib/schemas.js`) | [input-validation.md](input-validation.md) | Compose its `email`/`password`/etc.; don't inline a divergent copy. Password policy is **min 12 + class mix** (auth-blueprint's inline `min(10)` defers to this). Email uses top-level `z.email()`. |

## Canonical env var names (the ones that drifted)

Use exactly these; delete any alias a feature file introduced:

- `BLIND_INDEX_KEY` — the one keyed-HMAC blind-index key (drop `EMAIL_INDEX_KEY`; email and PII share it).
- `CORS_ALLOWED_ORIGINS` — comma-separated origin allowlist (api-conventions' `CORS_ORIGINS` is the same var; standardize on this name).
- `APP_ORIGIN` — public base URL for links (owned by the central schema, referenced by auth-email-flows / account-protection).
- `EXPORT_LINK_KEY`, `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN`, `STRIPE_WEBHOOK_SECRET`, `OAUTH_STATE_SECRET`, `OAUTH_REDIRECT_BASE`, `OAUTH_GOOGLE_CLIENT_ID`/`_SECRET`, `OAUTH_GITHUB_CLIENT_ID`/`_SECRET`, `REDIS_URL`, `PII_MASTER_KEY` / `PII_KEY_SALT` — each declared **once** in the central schema; feature files read `env.*`.

## Either/or choices — pick one per project, never run both

- **Email storage.** Default: plaintext canonical `email` + `UNIQUE(email)`. High-compliance opt-in: encrypted `email_enc` (AES-GCM) + `email_bi` blind index with `UNIQUE(email_bi)` ([security-privacy-pii.md](security-privacy-pii.md)). If you adopt encryption, route **all** user creation (register, invite, OAuth) through `createUser()` and switch **every** lookup to `WHERE email_bi = ?` — do not half-adopt (a plaintext `email = ?` lookup then silently misses).
- **Idempotency.** Default (one money endpoint): `UNIQUE(created_by, idempotency_key)` columns on `transfers`, checked inside `transfer()` ([transaction-endpoints.md](transaction-endpoints.md)). Scale path (many mutating endpoints): the generic `idempotency_keys` replay-cache + `withIdempotency()` wrapper ([correctness-money-time.md](correctness-money-time.md)). One mechanism, not both.
- **Money in-memory type.** Default: plain integer minor units (`number`) with the `≤100_000_000` cap ([transaction-endpoints.md](transaction-endpoints.md), [input-validation.md](input-validation.md)) — fine for single-currency amounts well under 2^53. Switch to **bigint everywhere** ([correctness-money-time.md](correctness-money-time.md)) when you need multi-currency or values near 2^53. Never mix the two in one deployment. (On-disk it is always an INTEGER column either way.)
- **Distributed rate limiting.** Single box: the in-memory / cluster-memory store ([cluster-scaling.md](cluster-scaling.md)) — dev / one-VPS only. Multi-host or exact limits: Redis store, and `REDIS_URL` becomes **mandatory in production** ([rate-limiting-and-abuse.md](rate-limiting-and-abuse.md)).

## Account-lifecycle states (distinct, not competing)

Three lifecycle markers on `users` coexist with **different meanings** — document all three, reconcile the daily purge to check the right one:

- `deletion_requested_at` + `status='pending_deletion'` — self-service delete inside a grace window ([auth-account-protection.md](auth-account-protection.md)).
- `deleted_at` — soft delete / admin removal; the partial unique index `WHERE deleted_at IS NULL` frees the email for re-registration ([data-search-and-patterns.md](data-search-and-patterns.md), admin-tooling).
- `erased_at` + crypto-shred — GDPR erasure that keeps FK-referenced rows but destroys the PII key material ([security-privacy-pii.md](security-privacy-pii.md)).

A user lookup in an auth flow should exclude all three (`AND deleted_at IS NULL AND erased_at IS NULL AND status='active'`) so a link minted before removal can't mint a live session after it.

## TOTP single-use scope

A TOTP code is **globally single-use per 30-second step** across login-MFA and step-up — the
`user_totp.last_step` guard is shared ([auth-mfa.md](auth-mfa.md)). If a user must do two TOTP
ceremonies inside one window, they wait for the next code. Scope `last_step` per purpose only if
that UX is unacceptable.

## Quick consistency reminders

- `TRUST_PROXY` = your real controlled hop count — `1` behind one nginx/Caddy hop, `0` if directly exposed. Never `true`.
- `wal_checkpoint(TRUNCATE)` before `VACUUM INTO` backups conflicts with Litestream owning checkpoints — if you run Litestream, skip the manual checkpoint ([data-scale-recovery.md](data-scale-recovery.md)).
- Frontend error codes: the envelope `code` values ([api-conventions.md](api-conventions.md)) are the single vocabulary; the i18n `errors.*` table ([frontend-quality.md](frontend-quality.md)) keys on those exact strings.
