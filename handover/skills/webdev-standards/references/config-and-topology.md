# Config & topology

Why this design: [env-and-secrets](env-and-secrets.md) set the pattern — one zod schema, fail-fast at
boot, never print values. The catalog then added ~20 new vars (`REDIS_URL`, `PII_MASTER_KEY`,
`BLIND_INDEX_KEY`, `*_SIGNING_KEY`, `WEBAUTHN_*`, GlitchTip DSN, SMTP creds, OAuth secrets, feature
flags) scattered across a dozen files, each saying "add it to `src/lib/env.js`" — nobody owns the
whole picture. This file makes the schema **the single `process.env` reader** (enforced by the
ESLint `no-process-env` ban below; only the secret provider shares the exception), keeps
`.env.example` provably in sync, and pins down the
one topology decision that silently breaks cookie-auth: **`__Host-` cookies cannot set a `Domain`**,
so `api.example.com` + `app.example.com` cannot share them. It builds on
[env-and-secrets](env-and-secrets.md) (KDF, DB/JWT keys) and
[secrets-and-rotation](secrets-and-rotation.md) (runtime provider) without re-teaching them.

## The env schema is the ONLY process.env reader

One file reads `process.env`; everything else imports `env`. Enforce it so it stays true — a stray
`process.env.FOO` elsewhere skips validation and ships `undefined` into a signature or a URL.

```js
// eslint.config.js — the rule that makes this file load-bearing. Core `no-process-env` still ships
// (and runs) in ESLint 9 but is deprecated; prefer `n/no-process-env` from eslint-plugin-n, which
// is the maintained home for this rule. Shown with the core name; swap to `n/` when you add the plugin.
export default [{
  rules: {
    // Ban process.env everywhere...
    'no-process-env': 'error',
  },
}, {
  // ...except in the two files allowed to bootstrap it (env validation + the secret provider).
  files: ['src/lib/env.js', 'src/lib/secrets.js'],
  rules: { 'no-process-env': 'off' },
}];
```

## The env schema + fail-fast parse — ALL errors at once

Extends the schema in [env-and-secrets](env-and-secrets.md) with every catalog var. Grouped by
concern; `.safeParse` (not `.parse`) so boot reports *every* missing/invalid var in one message
instead of dying on the first — the difference between one deploy and twenty. The shape lives in
its own side-effect-free module so tooling (the CI drift check below) can import it without
triggering the fail-fast parse.

```js
// src/lib/env.schema.js — the shape ONLY: no process.env read, no side effects, so
// scripts/check-env-example.js can import it without executing env.js's parse-and-exit.
// See env-and-secrets.md for base64url32() + the DB/JWT vars; only the NEW groups are shown here
// to avoid duplicating that file. base64url32(name) is defined there — reuse it, do not redefine.
import { z } from 'zod';

export const ENV_SHAPE = z.object({
  // ── core (env-and-secrets.md) ──────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // DB_*, JWT_* : see env-and-secrets.md (unchanged).

  // ── topology (this file) ───────────────────────────────────────────────────
  // Comma-separated exact origins allowed to call the API with credentials. NO wildcards, NO
  // trailing slash, scheme+host+port only. Empty in same-origin prod (CORS never fires).
  CORS_ALLOWED_ORIGINS: z.string().default('').transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  // Public URL the browser uses for the web app — the redirect base for OAuth, email links, etc.
  APP_ORIGIN: z.string().url(),
  // WebAuthn is bound to these (auth-mfa.md). rpID MUST be a registrable suffix of APP_ORIGIN's
  // host; a cross-subdomain split changes what these can legally be (see topology section below).
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().min(1),
  WEBAUTHN_ORIGIN: z.string().url(),

  // ── data-plane secrets (cross-referenced, validated here) ──────────────────
  PII_MASTER_KEY: z.string().min(32),                       // security-privacy-pii.md
  PII_KEY_SALT: z.string().min(16),
  BLIND_INDEX_KEY: z.string().min(32),                      // keyed HMAC, security-privacy-pii.md
  REDIS_URL: z.string().url().startsWith('redis').optional(), // rate-limiting-and-abuse.md
  WEBHOOK_SIGNING_KEY: z.string().min(32).optional(),       // integrations-webhooks.md
  COOKIE_STATE_SIGNING_KEY: z.string().min(32).optional(),  // OAuth state MAC, auth-oauth.md

  // ── third-party creds (optional: absent → feature disabled, see matrix) ─────
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  OAUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GLITCHTIP_DSN: z.string().url().optional(),               // observability.md error-reporter

  // ── operational ────────────────────────────────────────────────────────────
  LOG_LEVEL: z.string().default('info'),
  DB_POOL_THREADS: z.coerce.number().int().min(1).max(64).optional(),
  // Feature flags: default OFF (fail-safe) so a new flag never activates by omission.
  FEATURE_SIGNUP_OPEN: z.enum(['on', 'off']).default('off'),
  FEATURE_PASSKEYS: z.enum(['on', 'off']).default('off'),
});
// Deliberately NOT .strict() (unlike request-body schemas): this parses process.env directly,
// which always carries platform vars (PATH, HOME, CI/PaaS-injected keys) — a strict parse would
// fail every boot. Typo protection comes from elsewhere: a typo'd REQUIRED var still dies loudly
// as missing, a half-typo'd SMTP block trips the all-or-nothing refinement below, and the
// .env.example CI drift check catches misspelled keys in the committed contract.

// ── src/lib/env.js — import FIRST in server.js ───────────────────────────────
import 'dotenv/config';
import { ENV_SHAPE } from './env.schema.js';

// Cross-field invariants live here, not scattered across call sites. These catch the mistakes
// that make each subsystem "work" locally but break auth or email in prod.
const EnvSchema = ENV_SHAPE
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production') {
      // SMTP is all-or-nothing: half-configured mail silently drops verification/reset emails.
      const smtp = [e.SMTP_HOST, e.SMTP_PORT, e.SMTP_USER, e.SMTP_PASS];
      if (smtp.some(Boolean) && !smtp.every(Boolean))
        ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_* must be all set or all unset' });
      // A cross-subdomain rpID that is not a suffix of APP_ORIGIN's host = passkeys silently rejected.
      // Compare .hostname (no port) — an rpID never carries a port. Match on a LABEL boundary, not a
      // bare .endsWith(): "evil-example.com".endsWith("example.com") is true but is NOT a subdomain,
      // so a plain suffix test would wave through a typo'd/wrong host. Require exact host or a dotted
      // suffix (host === rpID || host ends with "." + rpID).
      const appHost = new URL(e.APP_ORIGIN).hostname;
      if (appHost !== e.WEBAUTHN_RP_ID && !appHost.endsWith(`.${e.WEBAUTHN_RP_ID}`))
        ctx.addIssue({ code: 'custom', path: ['WEBAUTHN_RP_ID'], message: 'must be a registrable suffix of APP_ORIGIN host' });
      // Redis is mandatory in prod: the in-memory limiter is per-process, so a cluster leaks
      // rate limits (rate-limiting-and-abuse.md). Fail closed at boot, not under attack.
      if (!e.REDIS_URL)
        ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'required in production (shared rate-limit store)' });
    }
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // One message listing EVERY offending var (names only, never values).
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  console.error(`FATAL: invalid environment —\n  ${issues}`);
  process.exit(1);
}
export const env = parsed.data;
```

## .env.example kept in sync by CI

`.env.example` is the committed contract (gitignore lets it through per [deployment](deployment.md)).
It rots the instant someone adds a zod key and forgets the placeholder. A CI check makes drift a red
build, not a 2 a.m. surprise — it asserts **every schema key has a line** and, in reverse, no example
line is orphaned.

```js
// scripts/check-env-example.js — run in CI. Exits non-zero on any drift.
import { readFileSync } from 'node:fs';
// Import the schema module, NOT env.js — importing env.js runs its safeParse(process.env) and
// process.exit(1)s in a CI job that (correctly) has no real secrets set. env.schema.js is pure.
import { ENV_SHAPE } from '../src/lib/env.schema.js';

const schemaKeys = new Set(Object.keys(ENV_SHAPE.shape));
const exampleKeys = new Set(
  readFileSync('.env.example', 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1]) // ignore comments/blank lines
    .filter(Boolean),
);
const missing = [...schemaKeys].filter((k) => !exampleKeys.has(k));   // in schema, not documented
const orphan = [...exampleKeys].filter((k) => !schemaKeys.has(k));    // documented, not in schema
if (missing.length || orphan.length) {
  console.error('.env.example drift:', { missing, orphan });
  process.exit(1);
}
console.log('.env.example is in sync with the env schema');
```

Placeholders never contain real secrets — `CHANGE_ME` for secret material, real defaults for
non-secret knobs. The generator command for secrets lives in [env-and-secrets](env-and-secrets.md).

## Config precedence & per-environment defaults

One order, applied by `dotenv/config` + the schema, highest wins:

1. **Real process env** (systemd `Environment=`, K8s secret, CI var) — always wins; how prod injects.
2. **`.env`** — dev/local only, gitignored; `dotenv` never overwrites an already-set var.
3. **Schema `.default(...)`** — the floor for non-secret knobs (`PORT`, `LOG_LEVEL`, flags).
4. Secrets have **no default** — absence is a boot error, never a silent fallback.

Parity: dev/staging/prod run the *same schema*, only values differ. `NODE_ENV` gates the cross-field
rules above, so staging (prod-grade strictness with test data) catches prod misconfig first. Keep a
distinct `staging` value only where behavior must differ; everything security-relevant stays identical.

## Hot-reload vs restart matrix

Which vars rotate live and which need a rolling restart. "Live" means a running process picks up the
change via `refreshSecrets()` + a rebuild hook ([secrets-and-rotation](secrets-and-rotation.md));
"restart" means the value is read once at boot and baked into a long-lived resource.

| Var(s) | Change without downtime? | Why / mechanism |
|---|---|---|
| `JWT_SECRET`/`_PREV`, `JWT_KID`/`_PREV` | **Live** | Rebuildable keyring; overlap window verifies both kids ([secrets-and-rotation](secrets-and-rotation.md)). |
| `FEATURE_*` flags | **Live** (if read per-request) | Read `env.FEATURE_X` at the call site, not cached in a module const. |
| `WEBHOOK_SIGNING_KEY`, `COOKIE_STATE_SIGNING_KEY` | **Live** | MAC keys resolved via `getSecret()` per verify; keep a PREV during overlap. |
| `LOG_LEVEL` | **Live** via SIGHUP | Reset `logger.level` in a signal handler; no reconnect needed. |
| `SMTP_*`, `OAUTH_*`, `GLITCHTIP_DSN` | **Live-ish** | Lazily-built clients; a `refreshSecrets()` + client rebuild reconnects. |
| `DB_MASTER_KEY`, `DB_KEY_SALT` | **Restart (offline)** | `hexrekey` re-encrypts every page, unsupported in WAL — offline runbook ([secrets-and-rotation](secrets-and-rotation.md)). |
| `PII_MASTER_KEY`, `BLIND_INDEX_KEY` | **Restart + data migration** | Rotating re-encrypts columns / recomputes blind indexes ([security-privacy-pii](security-privacy-pii.md)). |
| `REDIS_URL`, `DB_PATH`, `DB_POOL_THREADS`, `PORT`, `TRUST_PROXY` | **Restart (rolling)** | Baked into pools/listeners/connections at boot. |
| `CORS_ALLOWED_ORIGINS`, `APP_ORIGIN`, `WEBAUTHN_*` | **Restart (rolling)** | Topology; changing them mid-flight would split-brain auth. |

Rule of thumb: **key material behind `getSecret()` can go live; anything that opens a socket, a DB
file, or defines the origin/cookie topology needs a rolling restart** ([cluster-scaling](cluster-scaling.md)).

## Topology decision: same-origin vs cross-subdomain

This is the single most consequential config choice, because the auth model in
[auth-blueprint](auth-blueprint.md) uses `__Host-` cookies, and **`__Host-` cookies are forbidden
from carrying a `Domain` attribute** — they are locked to the exact host that set them, `Path=/`,
`Secure`. That is a deliberate anti-fixation defense, and it is non-negotiable in this stack.

**Pick same-origin (the default).** `app` and `api` are one origin; a reverse proxy routes `/api/*`
to Node and everything else to the web bundle ([deployment](deployment.md)). One host → `__Host-`
cookies work as designed, CORS never fires (same-origin requests are exempt), and WebAuthn `rpID` is
just that host.

```
                    https://example.com                (ONE origin)
                            │
                    ┌───────┴────────┐  reverse proxy (Caddy/nginx)
          /api/* ──▶│ Node/Express   │◀── everything else ──▶ static web bundle
                    └────────────────┘
    __Host- cookie host = example.com   ·   WEBAUTHN_RP_ID = example.com
```

**Cross-subdomain (`api.example.com` + `app.example.com`) is the trap.** The two hosts share a
registrable domain, so they are **same-site** — `SameSite=Lax`/`Strict` is *not* the blocker (those
cookies are sent on same-site requests, even cross-origin ones). The blocker is host scoping: a
`__Host-` cookie has **no `Domain`**, so one set on the response from `api.example.com` is host-only
to `api.example.com` and can never be shared with `app.example.com`, and the reverse-proxy trick
that would keep them one origin is gone. If you genuinely must split hosts, you must **downgrade
every auth cookie from `__Host-` to `__Secure-` with an explicit `Domain=example.com`** (see below)
so both subdomains receive it, accepting the weaker host-scoping (a sibling subdomain can now toss
cookies, per [auth-blueprint](auth-blueprint.md)). Treat that as a conscious security regression,
documented and reviewed — not a default.

| | Same-origin (default) | Cross-subdomain |
|---|---|---|
| Access cookie prefix | `__Host-access` (strongest) | `__Secure-access` + `Domain=example.com` (weaker) |
| Refresh cookie | `__Secure-refresh` (already, Path=/api/auth) | `__Secure-refresh` + `Domain=example.com` |
| CORS | Not needed | Required, credentialed, exact allowlist |
| `WEBAUTHN_RP_ID` | `example.com` | `example.com` (parent — covers both subs) |
| Verdict | **Use this** | Only with explicit sign-off |

## Cookie attributes per topology

[auth-blueprint](auth-blueprint.md) already fixes the per-cookie rules and owns `ACCESS_COOKIE`/
`REFRESH_COOKIE`/`AUTH_PATH` in `src/auth/middleware.js` — access is `__Host-`/`SameSite=Lax`/
`Path=/`, refresh is `__Secure-`/`SameSite=Strict`/`Path=/api/auth` (refresh is `__Secure-` even
same-origin because `__Host-` forbids the `Path` scoping). Do **not** re-flatten those into one
prefix. The only thing topology changes is: cross-subdomain has to drop the access cookie's `__Host-`
to `__Secure-` and add a parent `Domain` so `app.*` and `api.*` share it. This helper contributes
just that decision; the blueprint keeps setting SameSite/Path/maxAge per cookie.

```js
// src/auth/cookies.js — topology-only overrides layered onto auth-blueprint's per-cookie options.
import { env } from '../lib/env.js';

// Secure/prefixes gate on NODE_ENV === 'production' — the SAME predicate as auth-blueprint's
// middleware.js. If the two modules ever disagree, the cookie NAME splits between environments
// (one sets '__Host-access', the other reads 'access') and auth silently breaks.
const prod = env.NODE_ENV === 'production';
// Cross-subdomain iff any allowed origin differs from APP_ORIGIN's host → we had to leave __Host-.
const appHost = new URL(env.APP_ORIGIN).host;
export const crossSub = env.CORS_ALLOWED_ORIGINS.some((o) => new URL(o).host !== appHost);

// The registrable parent both subdomains share (e.g. app.example.com → example.com). Naive last-two-
// labels; for multi-label public suffixes (foo.co.uk) set an explicit COOKIE_DOMAIN instead.
const parentDomain = appHost.split('.').slice(-2).join('.');

// Access-cookie name: same-origin keeps __Host-; cross-subdomain must downgrade to __Secure- (Domain
// is illegal on __Host-). Refresh stays __Secure- in BOTH topologies (blueprint: Path=/api/auth).
export const ACCESS_COOKIE = !prod ? 'access' : crossSub ? '__Secure-access' : '__Host-access';

// Merge into the blueprint's setAuthCookies options: only cross-subdomain in prod adds a Domain, and
// only there — a __Host- cookie MUST NOT carry Domain, so same-origin returns {}.
export function crossSubDomainOpts() {
  return prod && crossSub ? { domain: parentDomain } : {};
}
```

## CORS policy (only when cross-subdomain)

Same-origin needs no CORS. When you *have* split hosts, the policy is: **exact origin echo,
credentials on, never `*`.** `Access-Control-Allow-Origin: *` is illegal alongside credentials, and
reflecting an unvalidated `Origin` is an open-CORS hole — echo only allowlisted origins.

```js
// server.js — mount BEFORE routes. No `cors` package needed; the policy is small and explicit.
import { env } from './src/lib/env.js';

const ALLOWED = new Set(env.CORS_ALLOWED_ORIGINS); // exact scheme+host+port strings

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);   // echo the exact match, never '*'
    res.setHeader('Vary', 'Origin');                        // caches must key on Origin
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // required for cookie auth
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
    // The custom headers our api() wrapper and transaction endpoints send.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF, Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '600');         // cache preflight 10 min (browsers cap it anyway: Chrome 2 h, Firefox 24 h)
    // Expose any non-simple response header the client must read (e.g. rate-limit info).
    res.setHeader('Access-Control-Expose-Headers', 'RateLimit-Remaining, RateLimit-Reset');
  }
  // An unlisted or missing Origin gets NO CORS headers → the browser blocks the credentialed call.
  if (req.method === 'OPTIONS') return res.sendStatus(204); // preflight ends here
  next();
});
```

The CSRF model still holds: the `X-CSRF: 1` custom header ([auth-blueprint](auth-blueprint.md))
forces a preflight cross-origin, and the allowlist is what that preflight validates against.

## Dev proxy keeps everything first-party

In dev, Vite proxies `/api` to the backend so the browser sees **one origin** (`localhost:5173`) —
CORS never engages and cookies are first-party, mirroring same-origin prod exactly. This is the
config in [frontend-conventions](frontend-conventions.md); reproduced here as the dev half of the
topology contract.

```ts
// vite.config.ts — dev requests to /api are same-origin from the browser's view.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

Golden path: proxy-in-dev, reverse-proxy-in-prod — first-party end to end, `__Host-` cookies
throughout, CORS dormant. You light up CORS only the day you consciously choose cross-subdomain, and
by then the schema, cookie helper, and matrix have already told you what else must change.