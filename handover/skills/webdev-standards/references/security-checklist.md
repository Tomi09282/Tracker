# Security checklist (pre-ship gate)

The final boss. Every other reference file builds one piece; this file is where you prove the
pieces are wired together before code leaves your machine. Nothing here is new policy — it is the
consolidated gate that cross-checks [auth-blueprint](auth-blueprint.md),
[transaction-endpoints](transaction-endpoints.md), [db-layer](db-layer.md),
[env-and-secrets](env-and-secrets.md), [server-skeleton](server-skeleton.md), and
[cluster-scaling](cluster-scaling.md). A perfect handler on a miswired route is still a hole.

Two gates: **(A)** run per NEW route, **(B)** run once before every deploy. Levels map to
OWASP ASVS: **L1** = every app; **L2** = apps with real user data / sessions (this stack's
baseline); **L3** = money, irreversible state, high-value data.

---

## (A) Per-endpoint gate — run for EVERY new route

**Threat model: the attacker fully controls the HTTP request** — Burp/curl forge every field,
header, and cookie. The frontend is UX, never a boundary (see
[transaction-endpoints](transaction-endpoints.md)). Walk this list for the route before merging.

### Wiring & authentication — L1

- [ ] Route is mounted **after** `csrfProtection` (app-level in [server-skeleton](server-skeleton.md)) — not on a router that bypasses it.
- [ ] Non-public routes carry `requireAuth`; the handler reads identity from `req.user`, never from the body.
- [ ] Reachable only over HTTPS in production (HSTS + secure cookies, gate B).
- [ ] Method is correct: state changes are POST/PUT/PATCH/DELETE (GET must be side-effect-free, or CSRF's `SAFE_METHODS` skip lets it through unprotected).

### Authorization & ownership (anti-IDOR) — L2

- [ ] Every row read or written is scoped to the caller: `WHERE id = ? AND user_id = ?` — see [transaction-endpoints](transaction-endpoints.md) "Reads are critical too".
- [ ] Role-gated actions call `requireRole(...)` **and** re-read the role from the DB in the handler ([auth-blueprint](auth-blueprint.md)) — the JWT role is a fast-path hint, the DB is truth.
- [ ] Ownership for money/state is re-checked **inside** the worker transaction, not only in middleware (anti-TOCTOU).
- [ ] "Not found" vs "forbidden" responses don't confirm which ids exist (prefer 404; see the documented residual on integer ids).

### Input validation — L1

- [ ] Body/params/query parsed by a **`.strict()`** zod schema — unknown fields rejected (blocks mass assignment). See [input-validation](input-validation.md) for the shared schema library.
- [ ] Numbers are bounded integers (`z.number().int().positive().max(...)`); strings are length- and regex-bounded.
- [ ] Money is INTEGER minor units (fillér/cents) — no floats, ever.
- [ ] Header inputs (`Idempotency-Key`, etc.) are regex-validated, not trusted raw.

### Authoritative computation — L2

- [ ] Every price, total, balance, role, discount, and permission is **computed server-side** from DB data.
- [ ] A client-sent `total`/`price`/`role` field is treated as an attack, not a convenience — it is never believed.

### Rate limiting — L2

- [ ] Authenticated routes use a **per-user** limiter (`keyGenerator` returns `req.user.id`); public ones a per-IP limiter whose `keyGenerator` returns `ipKeyGenerator(req.ip)` (the helper subnet-masks IPv6 so a client can't rotate addresses — express-rate-limit v8.2+ hard-fails at startup on a raw `req.ip` keyGenerator).
- [ ] Auth routes keep their per-IP **and** per-account limiters + login backoff ([auth-blueprint](auth-blueprint.md)).
- [ ] Limits account for clustering: the default in-memory store counts per process → effective limit ≈ `limit × workers` ([cluster-scaling](cluster-scaling.md)); divide the limit, or move to a shared store (`@express-rate-limit/cluster-memory-store` for one-box `node:cluster`, `rate-limit-redis` across hosts) if they must be exact.

### Errors & logging — L1

- [ ] Client responses are **generic** (`invalid input`, `forbidden`, `internal server error`); stack/SQL/internal codes stay in the log (central error handler, [server-skeleton](server-skeleton.md)).
- [ ] Business failures returned as `{ ok:false, code }` values from the worker, mapped to HTTP by a table — never thrown across the thread boundary ([transaction-endpoints](transaction-endpoints.md)).
- [ ] Security-relevant events logged via pino at `warn`/`info`; logs contain **no** passwords, tokens, cookies, DB key, or full bodies ([server-skeleton](server-skeleton.md) log discipline).
- [ ] **Denied** attempts (IDOR probing, insufficient funds, key misuse) logged **outside** any rolled-back transaction — attack probing must never be invisible.

### Money / irreversible state — the 5-pass — L3

If the route moves money, inventory, or irreversible state, do NOT ship until you have walked
WIRING plus all five passes against your own code and stated the answer for each (full rationale in
[transaction-endpoints](transaction-endpoints.md)):

- [ ] **0. WIRING** — behind `requireAuth`, `csrfProtection`, a per-user limiter, HTTPS-only?
- [ ] **1. FORGE** — no forged field/header changes money or authority beyond validated bounds; `.strict()` rejects extras; no client price/total believed.
- [ ] **2. REPLAY** — same request twice ⇒ exactly ONE effect (per-user-scoped `Idempotency-Key`, `UNIQUE(created_by, idempotency_key)`).
- [ ] **3. RACE** — same request twice CONCURRENTLY ⇒ guard holds; the guard lives **inside** the `UPDATE ... WHERE balance_cents >= ?` + `changes === 1`, inside one IMMEDIATE tx.
- [ ] **4. IDOR** — every id swapped for another user's ids ⇒ ownership re-checked inside the tx; errors don't confirm existence.
- [ ] **5. EXTREMES** — negative/zero/max/fractional/overflow values, huge strings, unit/currency confusion all rejected; all numbers bounded ints, all strings bounded.
- [ ] Session re-checked from the DB inside the tx (`session_version` vs `sv`) so a banned/logged-out-everywhere principal can't move money within a cache window.
- [ ] Success writes an in-tx `audit_log` row; the operation is one **named** worker function (not generic `writeTx`).

---

## (B) Pre-deploy gate — run once before shipping

### Secrets — L1

- [ ] `.env` is **gitignored**; only `.env.example` with placeholders is committed ([env-and-secrets](env-and-secrets.md)).
- [ ] `git log -p` / secret scanner shows no key, token, or password ever committed (rotate immediately if one was).
- [ ] Production secrets come from a secret manager (Docker/K8s secrets, Vault, cloud SM), not a plaintext file on a shared box.
- [ ] Secrets appear **only** in env + process memory — never in logs, errors, client responses, or the `verbose` DB option.

### Database at rest — L3

- [ ] SQLite is **encrypted** (`better-sqlite3-multiple-ciphers`, `PRAGMA hexkey` from the scrypt-derived key, [db-layer](db-layer.md)).
- [ ] `DB_MASTER_KEY`/`DB_KEY_SALT` are stored **separately from the database backups** — a backup + its key in the same bucket is plaintext.
- [ ] scrypt params + salt are pinned and unchanged on an existing DB (changing them bricks it — rekey via [env-and-secrets](env-and-secrets.md)).
- [ ] Runtime PRAGMAs applied on every connection: `WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`.

### Cookies & session — L2

- [ ] Auth cookies are `HttpOnly` + `Secure` + `SameSite` + `__Host-`/`__Secure-` prefixes in production ([auth-blueprint](auth-blueprint.md)); no token ever in `localStorage` ([frontend-conventions](frontend-conventions.md)).
- [ ] Access JWT: 15-min TTL, HS256, `kid` keyring, `sv` claim re-checked against the DB.
- [ ] Refresh token: opaque, SHA-256-hashed in DB, **rotated** every use, **family reuse-detection** revokes the family + bumps `sv`.
- [ ] Passwords hashed with **argon2id** at OWASP params; unknown-email login does dummy-hash work (no timing enumeration).
- [ ] CSRF defense-in-depth live: `Sec-Fetch-Site` + `X-CSRF: 1` header + JSON-only bodies ([auth-blueprint](auth-blueprint.md)).

### Transport & headers — L1

- [ ] HTTPS enforced end-to-end; **HSTS** on (via `helmet`, `includeSubDomains` if applicable).
- [ ] `helmet` **CSP** set and tightened for the app ([server-skeleton](server-skeleton.md)); `x-powered-by` disabled (helmet does this by default); `frame-ancestors 'none'` set explicitly — helmet's default CSP is `frame-ancestors 'self'`, which still permits same-origin framing.
- [ ] `TRUST_PROXY` matches the real hop count — **0** when directly exposed, or clients spoof `X-Forwarded-For` and bypass per-IP limits ([env-and-secrets](env-and-secrets.md), [cluster-scaling](cluster-scaling.md)).
- [ ] JSON body limit set (`express.json({ limit })`); oversized/malformed bodies return 413/400, not a stack.

### Dependencies — L1

- [ ] `npm audit` clean of high/critical (or each exception documented); lockfile committed.
- [ ] Node.js on a current **LTS**; production installs are `npm ci` from the lockfile.

### Operational resilience — L2

- [ ] Rate limits present on auth **and** every critical route; high-value ops require fresh re-auth (password confirm).
- [ ] Central error handler leaks nothing: Zod ⇒ 400 `invalid input`, parse ⇒ 400, too-large ⇒ 413, else ⇒ 500 generic ([server-skeleton](server-skeleton.md)).
- [ ] `uncaughtException`/`unhandledRejection` handlers log with stack then exit non-zero; supervisor (`run-server.js` / `cluster.js`) restarts with backoff and writes `crash.log`.
- [ ] Logging is **durable**: pino sync destination to `server.log`; security-audit + auth events survive a crash.
- [ ] Refresh-token maintenance purge scheduled; `family_created_at` preserved so the 30-day absolute cap can't be erased ([auth-blueprint](auth-blueprint.md)).

### Backups — L3

- [ ] Backups run and are **encrypted**, with the DB key stored elsewhere.
- [ ] A **restore drill** has actually been performed — an untested backup is a hope, not a backup.
- [ ] Backup retention + access are least-privilege (a leaked backup is a full breach of data at rest).

---

## Sign-off

Ship only when: **(A)** passed for every new/changed route (money/state routes with WIRING and all
five passes answered), and **(B)** passed for the deploy. If any box is uncertain, it is a **no** —
fix the code, then re-run the gate.
