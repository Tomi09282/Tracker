---
name: webdev-standards
description: Petike's personal web-stack blueprint and scaffolding templates — Node.js/Express backend, encrypted SQLite (better-sqlite3-multiple-ciphers) in a Piscina worker pool, JWT+cookie auth with refresh rotation, critical/transactional endpoint patterns (money, idempotency, anti-IDOR), cluster scaling, pino logging with crash supervisor, React+TypeScript+Tailwind frontend. Use when creating or modifying a backend server, database layer, login/auth flow, payment/transaction endpoint, logging/crash handling, scaling, or a React frontend setup. Keywords - scaffold, backend, server, sqlite, database, auth, login, JWT, register, transfer, payment, transaction, cluster, React setup.
---

# webdev-standards — the stack blueprint

Authoritative templates for every new backend/frontend. Read the reference file for the part you are building, copy the template, and adapt names/domain logic — do NOT re-design the architecture. Talk to the user in Hungarian; write all code in English.

## References (read on demand)

- [references/db-layer.md](references/db-layer.md) — encrypted SQLite via `better-sqlite3-multiple-ciphers` inside a Piscina worker pool: `src/db/worker.js`, `src/db/index.js`, required pragmas, transaction rules, migrations.
- [references/auth-blueprint.md](references/auth-blueprint.md) — `jose` access JWT (15 min, HS256+kid) + rotating opaque refresh tokens with family reuse detection, cookie flags, CSRF middleware, argon2id, rate limiting, users/refresh_tokens schema.
- [references/server-skeleton.md](references/server-skeleton.md) — `server.js` (helmet, error handler, graceful shutdown), `run-server.js` supervisor (structured crash log + exponential backoff), pino logger.
- [references/env-and-secrets.md](references/env-and-secrets.md) — `.env.example`, zod boot validation, secret generation commands, DB key derivation and `PRAGMA rekey` rotation procedure.
- [references/frontend-conventions.md](references/frontend-conventions.md) — Vite + React + TS strict + Tailwind project structure, lazy routes, the `api()` fetch wrapper (credentials + X-CSRF), state/error conventions.
- [references/transaction-endpoints.md](references/transaction-endpoints.md) — **CRITICAL endpoints** (money, inventory, irreversible state): named atomic worker transactions with in-UPDATE guards, idempotency keys, anti-IDOR ownership checks, audit log, server-side calculation, and the MANDATORY 5-pass adversarial checklist (forge / replay / race / IDOR / extremes).
- [references/cluster-scaling.md](references/cluster-scaling.md) — multi-process HTTP load balancing with node:cluster (crash-supervising primary), DB-pool sizing under clustering, per-process cache/rate-limit trade-offs, PM2 alternative.
- [references/input-validation.md](references/input-validation.md) — the trust boundary: `src/lib/schemas.js` reusable zod/regex library (email, username, password, url, money, pagination…), a central `validate()` middleware, zod v4 coercion pitfalls, prototype-pollution guard, file-upload validation (magic-byte sniffing), output encoding.
- [references/api-conventions.md](references/api-conventions.md) — uniform error envelope `{error, code, requestId}`, status-code table, cursor pagination with caps, whitelisted sort/filter, API versioning, CORS for cookie auth, content-type enforcement.
- [references/observability.md](references/observability.md) — request-id middleware + per-request child logger, structured request logging (no secrets), `/healthz` + `/readyz`, runtime metrics stub, error-tracking hook, cluster-correlated logs.
- [references/testing.md](references/testing.md) — Vitest + supertest: per-worker throwaway encrypted test DB, unit tests for worker transactions, auth-flow integration tests, and the **security regression suite** that freezes the 5-pass attacks as permanent tests; coverage gates + scripts.
- [references/db-migrations-backups.md](references/db-migrations-backups.md) — versioned `PRAGMA user_version` migrations, and **encrypted** backups via `VACUUM INTO` (never `db.backup()` — it writes plaintext), scheduling, restore drill, integrity checks, key/backup separation.
- [references/deployment.md](references/deployment.md) — multi-stage non-root Dockerfile (native addon build), Caddy/nginx TLS + `TRUST_PROXY`, systemd/PM2 running `cluster.js`, secret injection, HTTPS/HSTS, graceful shutdown.
- [references/security-checklist.md](references/security-checklist.md) — **the pre-ship gate**: (A) per-endpoint checklist + the 5-pass for money routes, (B) pre-deploy checklist; ASVS-style levels. Run it before anything ships.

## Extended references (on-demand feature playbooks)

Deeper, optional playbooks — each was adversarially reviewed, and the security-critical ones (★) passed a dedicated security audit that broke and fixed real vulnerabilities. Read one only when building that specific feature.

> **Combining two or more of these? Read [references/integration-notes.md](references/integration-notes.md) FIRST.** Each playbook stands alone, so where two touch the same artifact (the `users` table, `audit_log`, the env schema, the money type, idempotency) they overlap by design. integration-notes.md is the authoritative resolution: who owns each shared artifact, the canonical env-var names, and the either/or choices (email storage, money type, idempotency mechanism, rate-limit store) — pick one per project.

**Auth & identity**
- [references/auth-email-flows.md](references/auth-email-flows.md) ★ — email verification, password reset, magic-link, invites; all single-use hashed tokens with atomic consume, two-layer rate limits, sv-bump revocation.
- [references/auth-mfa.md](references/auth-mfa.md) ★ — TOTP (replay-protected), hashed recovery codes, WebAuthn/passkeys, step-up re-auth; MFA enrollment is step-up-gated.
- [references/auth-account-protection.md](references/auth-account-protection.md) ★ — session/device management, per-device logout, suspicious-login alerts, breached-password (HIBP k-anonymity), account deletion, CAPTCHA.
- [references/auth-oauth.md](references/auth-oauth.md) ★ — OAuth2 + OIDC social login: PKCE, state/nonce (constant-time), JWKS-pinned id_token verify, verified-email-only auto-link.

**Security & privacy**
- [references/security-hardening.md](references/security-hardening.md) ★ — CSP nonces, Subresource Integrity, honeypot/tarpit (unspoofable peer IP), security.txt.
- [references/security-integrity.md](references/security-integrity.md) ★ — hash-chained tamper-evident audit log, timing-safe HMAC request signing (full-target, replay-guarded), scoped API keys.
- [references/security-privacy-pii.md](references/security-privacy-pii.md) ★ — field-level AES-256-GCM PII envelope, GDPR retention/erasure, owner-bound data export (anti-IDOR), UGC moderation, privacy analytics.
- [references/secrets-and-rotation.md](references/secrets-and-rotation.md) ★ — idempotent JWT + DB key rotation (kid keyring + rekey), KMS/secret-manager integration.
- [references/rate-limiting-and-abuse.md](references/rate-limiting-and-abuse.md) ★ — Redis-backed distributed rate limiting (fails closed in prod), WAF/fail2ban, rate-of-value anti-fraud, cost controls.
- [references/supply-chain-security.md](references/supply-chain-security.md) — dependency + secret scanning (gitleaks), SAST (semgrep/CodeQL), Trivy, security-headers audit, reproducible installs.

**Correctness & integrations**
- [references/correctness-money-time.md](references/correctness-money-time.md) ★ — integer-minor-unit money (sign-correct `split`), rounding/multi-currency, UTC/timezone discipline, idempotency-key lifecycle.
- [references/integrations-webhooks.md](references/integrations-webhooks.md) ★ — inbound webhook hardening: raw-body constant-time signature verify, timestamp+event-id replay defense, verify-then-parse.
- [references/email-deliverability.md](references/email-deliverability.md) — SPF/DKIM/DMARC, bounce/complaint handling, suppression list, mailer abstraction.

**Data**
- [references/data-search-and-patterns.md](references/data-search-and-patterns.md) — FTS5 search, indexing/EXPLAIN, soft deletes, optimistic concurrency, outbox, state machines, seeds, ERD.
- [references/data-scale-recovery.md](references/data-scale-recovery.md) — Litestream replication + PITR, archival, VACUUM/ANALYZE, caching, SQLite job queue, Postgres migration playbook.

**Frontend**
- [references/frontend-data-and-forms.md](references/frontend-data-and-forms.md) — shared FE/BE zod schemas, typed API client, TanStack Query, react-hook-form, optimistic mutations.
- [references/frontend-testing-and-perf.md](references/frontend-testing-and-perf.md) — Vitest+RTL, MSW, Playwright e2e, a11y, Lighthouse CI, bundle analysis, prefetching, image opt, PWA, Storybook.
- [references/frontend-quality.md](references/frontend-quality.md) — error boundary + client reporting, CSP coordination, design tokens + dark mode, i18n, notification preferences.

**Delivery & ops**
- [references/devex-tooling.md](references/devex-tooling.md) — ESLint flat config, Prettier, husky+lint-staged, commitlint, editorconfig, engines pin, devcontainer, backend JSDoc types.
- [references/ci-cd-pipeline.md](references/ci-cd-pipeline.md) — GitHub Actions pipeline, coverage gate, Dependabot/Renovate, Changesets, PR template/CODEOWNERS, OpenAPI+contract tests, feature flags.
- [references/ops-observability.md](references/ops-observability.md) — error monitoring, uptime, log shipping, OpenTelemetry tracing, resource/OOM guards.
- [references/ops-resilience.md](references/ops-resilience.md) — timeouts + circuit breakers, backpressure, graceful degradation, load testing, chaos, zero-downtime deploys, runbooks.

**Platform**
- [references/admin-tooling.md](references/admin-tooling.md) — back-office with its own authz (admin role + DB re-check + step-up) and full action auditing.
- [references/config-and-topology.md](references/config-and-topology.md) — env-schema completeness + dev/staging/prod parity, CORS + cookie-domain + cross-subdomain topology.

## Scaffolding checklist — new backend

1. `npm init -y`, set `"type": "module"`, then:
   `npm i express helmet zod pino argon2 jose express-rate-limit piscina better-sqlite3-multiple-ciphers dotenv cookie-parser`
2. Copy `.env.example` from env-and-secrets.md, generate real secrets with the commands there, create `src/lib/env.js` boot validation. Add `.env`, `data/`, `logs/` to `.gitignore`.
3. DB layer from db-layer.md + env-and-secrets.md: `src/lib/dbkey.js`, `src/db/worker.js`, `src/db/index.js`, `src/db/schema.sql`; run `migrate()` once at startup.
4. Auth from auth-blueprint.md: `src/auth/tokens.js`, `src/auth/middleware.js`, `src/auth/routes.js`.
5. `server.js`, `run-server.js`, `src/lib/logger.js` from server-skeleton.md; request-id + `/healthz` + `/readyz` from observability.md.
6. Input layer from input-validation.md: `src/lib/schemas.js` (shared zod pieces) + `src/lib/validate.js`; API shape from api-conventions.md (error envelope, pagination, CORS — only for a separate frontend origin; `npm i cors` then).
7. Migrations + encrypted backups from db-migrations-backups.md (`VACUUM INTO`, never `db.backup()`); wire the migrate runner at boot.
8. Any endpoint that moves money/inventory/irreversible state: STOP, read transaction-endpoints.md, build from its template, then walk its 5-pass checklist (forge / replay / race / IDOR / extremes) against your own code.
9. Tests from testing.md: `npm i -D vitest supertest`, and add the **security regression suite** case for every critical endpoint in the same PR.
10. High traffic expected? Add `cluster.js` from cluster-scaling.md and set `DB_POOL_THREADS=2`.
11. Deploy from deployment.md (Docker non-root, TLS proxy, `TRUST_PROXY`).
12. **Before shipping: run security-checklist.md** — the per-endpoint gate for every route + the pre-deploy gate. If any box is uncertain, it's a no.
13. Smoke test: register → login → authenticated call → refresh → logout; check cookie flags in devtools; confirm a slow query does NOT freeze other requests; replay + parallel-race a critical endpoint if there is one.

## Scaffolding checklist — new frontend

1. `npm create vite@latest` (react-ts template), add Tailwind, enable TS strict, then `npm i react-router-dom`.
2. Structure + `src/lib/api.ts` wrapper from frontend-conventions.md.
3. Route-level `React.lazy` + `<Suspense>` + error boundary from day one.

## Non-negotiables (summary — details in CLAUDE.md and ~/.claude/rules/)

- SQLite never on the main thread; encrypted DB always; WAL+busy_timeout pragmas.
- Prepared statements only; zod `.strict()` on every input; secrets never in logs/git/client responses.
- Cookies HttpOnly+Secure+SameSite with prefixes; argon2id; rate limits on auth routes.
- NEVER trust the client: every request is forgeable (Burp); all authoritative calculation happens server-side; ownership checks on every row; money = integer cents.
- Critical/transactional endpoints get the 5-pass adversarial review — no exceptions.
