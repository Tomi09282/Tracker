# CI/CD pipeline

Why this design: every invariant the other files hand-write — `.strict()` zod, anti-IDOR ownership,
the 5-pass adversarial checklist, integer-cents money — is only real if a machine re-checks it on
every push. This file is the **gate** (install → lint → typecheck → test → build → security) plus the
governance around it: who reviews what, how deps update, how the contract can't drift, how a risky
feature is killed or retired without a redeploy or a broken client. It composes the scanner jobs from
[supply-chain-security](supply-chain-security.md) (audit, secret-scan, semgrep, codeql, container) — it
owns the *build* pipeline and the *process*; that file owns the *scanners*. The stack landmine:
`better-sqlite3-multiple-ciphers` is a native addon and the test job must **actually open an encrypted
DB**, so CI needs a toolchain and a valid env or the zod boot-guard ([env-and-secrets](env-and-secrets.md))
aborts before a single test runs.

## 1. CI pipeline: install → lint → typecheck → test → build [must]

Rationale: one required workflow runs the same ordered gate on every push and PR, cheap checks first,
so nothing merges without passing what a reviewer would check by hand. The steps are the named scripts
from [devex-tooling](devex-tooling.md) (`lint`/`format:check`/`typecheck`/`build`, the same set its
`verify` script chains) — CI never re-inlines tool flags, so the pipeline and a local run can't drift.

```yaml
# .github/workflows/ci.yml — the merge gate.
name: ci
on:
  push: { branches: [main] }
  pull_request:
permissions: { contents: read }
concurrency:                                   # drop superseded runs on the same ref
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    env: { NODE_ENV: test, LOG_LEVEL: silent }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'          # single source of truth for the Node LTS line
          cache: 'npm'
      # ubuntu-latest ships python3 + build-essential, so node-gyp can compile the native addon;
      # prebuilds usually cover it anyway. If a runner lacks them: apt-get install -y python3 make g++.
      - run: npm ci                             # root Express app — exact, lockfile-faithful
      - run: npm ci --prefix frontend           # Vite frontend
      - run: npm run lint                       # eslint .
      - run: npm run format:check               # prettier --check . — formatting drift is a hard stop
      - run: npm run typecheck                  # tsc --noEmit over tsconfig.json (checkJs on backend JSDoc)
      - run: npm run typecheck --prefix frontend # frontend has its own strict tsconfig (Vite)
      # Mint EPHEMERAL encrypted-DB secrets so the zod boot-guard passes and a real DB opens.
      # Per-run, never real — no GitHub secret is needed just to run the encrypted-DB smoke.
      - name: Ephemeral CI secrets
        run: |
          gen() { node -e "console.log(require('node:crypto').randomBytes($1).toString('$2'))"; }
          {
            echo "DB_MASTER_KEY=$(gen 32 base64url)"; echo "DB_KEY_SALT=$(gen 16 hex)"
            echo "JWT_SECRET=$(gen 32 base64url)";     echo "JWT_KID=ci-1"
            echo "DB_PATH=$RUNNER_TEMP/ci.db";         echo "TRUST_PROXY=0"; echo "PORT=3999"
          } >> "$GITHUB_ENV"
      - run: npm run test:ci                     # vitest --coverage; opens the encrypted DB for real
      - run: npm run test:ci --prefix frontend   # vitest + @testing-library/react
      - run: npm run build                       # build script (devex-tooling.md) → vite build, dist/
```

`test:ci` (from [testing](testing.md)) points the worker pool at a per-worker temp DB, so the ephemeral
`DB_PATH` above is only the boot-guard's happy path, not where tests write. The minted set covers the
base schema in [env-and-secrets](env-and-secrets.md) — if the project adopted the extended central
schema ([config-and-topology](config-and-topology.md)), its extra **required** vars (`APP_ORIGIN`,
`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`, `PII_MASTER_KEY`, `PII_KEY_SALT`,
`BLIND_INDEX_KEY`) need ephemeral values in the same step, or the boot-guard aborts before the first
test. Keep the scanners ([supply-chain-security](supply-chain-security.md)) as **separate** workflows
so their schedules / path filters don't drag the build — they're wired as required checks in §5.

## 2. Test runner + tiered coverage gate [must]

Rationale: a single global coverage number lets a well-tested CRUD route paper over an under-tested
money path — so the floor is **tiered**, near-total on code that moves money or mints sessions, softer
elsewhere, and the smoke + adversarial cases are real CI tests, not a manual checklist.

The runner and thresholds live in full in [testing](testing.md) (Vitest + supertest; `src/db/tx/**`
100% lines, `src/auth/**` 95%, softer global floor). CI's job is to run them as a required check —
`npm run test:ci` fails the build the moment a threshold slips or a security regression goes red. The
non-negotiables it enforces:

- The mandated smoke path **register → login → authed call → refresh → logout** runs green as one
  supertest chain (`test/integration/auth-flow.test.js`).
- Every transactional endpoint carries at least one **REPLAY** (same idempotency key → one debit) and
  one **RACE** (concurrent double-spend → exactly one `201`, one `409`) test (`test/security/*.test.js`).
  RACE only contends with `DB_POOL_THREADS ≥ 2`, set in that file's setup before the pool boots.

```jsonc
// package.json — the one script CI calls.
{ "scripts": { "test:ci": "vitest run --mode test --coverage --reporter=dot" } }
```

> A red security-regression test is a **stop with no override**. Adding a transactional endpoint means
> adding its 5-pass cases in the same PR — the [transaction-endpoints](transaction-endpoints.md)
> checklist isn't "done" until the matching `test/security/*.test.js` is green.

## 3. Dependabot: grouped, security-priority updates [should]

Rationale: batching routine devDep bumps into one PR cuts noise; keeping the crypto/auth libraries as
individual PRs forces a careful read of exactly the upgrades that can break auth or weaken encryption;
the security channel raises CVE fixes immediately regardless of cadence.

```yaml
# .github/dependabot.yml — both package roots + the Actions themselves.
version: 2
updates:
  - package-ecosystem: npm            # root Express app
    directory: '/'
    schedule: { interval: weekly }
    open-pull-requests-limit: 10
    groups:
      dev-minor-patch:                # one PR for all non-major dev tooling — review together
        dependency-type: development
        update-types: [minor, patch]
  - package-ecosystem: npm            # Vite frontend
    directory: '/frontend'
    schedule: { interval: weekly }
    groups:
      dev-minor-patch: { dependency-type: development, update-types: [minor, patch] }
  - package-ecosystem: github-actions # the workflow Actions
    directory: '/'
    schedule: { interval: weekly }
    groups: { actions: { patterns: ['*'] } }
```

The `groups` block batches **only** devDeps; runtime deps — and specifically **`jose`, `argon2`,
`better-sqlite3-multiple-ciphers`, `express`, `helmet`** — fall outside every group and so arrive as
one PR each, exactly the ones that deserve a careful review + full CI run. Caveat: a group scoped to
`update-types: [minor, patch]` marks its matched devDeps as handled and **does not** open their
major-version PRs (a group without a major update-type suppresses them), so bump a grouped devDep's
major by hand when you want it. Enable *Dependabot alerts*
+ *security updates* in **Settings → Code security** ([supply-chain-security](supply-chain-security.md) §5):
a published CVE then gets a fix PR the day it lands, not next Monday. Renovate is a drop-in alternative
if you want regex groups + auto-merge for the passing devDep group; the intent is identical.

## 4. Changesets for versioning + changelog [nice]

Rationale: releases here are a **deploy tag**, not an npm publish, so full semantic-release is overkill
— Changesets lets each user-facing change carry its own note, then rolls them into a version bump +
`CHANGELOG.md` at release time without ever publishing to a registry.

```bash
npm i -D @changesets/cli @changesets/changelog-git && npx changeset init
```

```jsonc
// .changeset/config.json — private project: bump version + changelog, never publish.
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": "@changesets/changelog-git",   // its own package (installed above — the CLI doesn't
                                              // bundle it); entries link to the commit, no GitHub token needed
  "commit": false, "access": "restricted", "baseBranch": "main"
}
```

Contributors run `npx changeset` per user-facing change (pick `patch`/`minor`/`major`, write a
one-liner); it drops a markdown file under `.changeset/`. A release job consumes them:

```yaml
# .github/workflows/release.yml — on push to main, open/refresh a "Version Packages" PR; merging it
# bumps package.json + CHANGELOG.md. NO publish step (private deploy-tag model).
name: release
on: { push: { branches: [main] } }
permissions: { contents: write, pull-requests: write }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - uses: changesets/action@v2
        with: { version: 'npx changeset version' }   # no `publish:` — private project
        env:
          # Block style on purpose: `${{ }}` contains `{`/`}`, which a plain scalar inside a
          # flow map (`env: { ... }`) can't hold — that variant fails to parse.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The bumped version becomes the deploy tag; `CHANGELOG.md` is the human record of what shipped — tie it
to the deprecation notices in §8 so a removed field is announced where clients read it.

## 5. PR template + CODEOWNERS + branch protection [should]

Rationale: the checklist that catches this stack's footguns has to live where the change is made — so
the PR template embeds the blueprint's own gates, CODEOWNERS forces review on the files that can leak
money or secrets, and branch protection makes the CI checks unskippable.

```markdown
<!-- .github/pull_request_template.md -->
## What & why

## Stack invariant checklist (tick every box that applies)
- [ ] All new inputs validated with **`.strict()` zod** (unknown field → 400) — [input-validation]
- [ ] Every row read has an **ownership / anti-IDOR** check (`WHERE id=? AND user_id=?`) — [transaction-endpoints]
- [ ] Money is **integer minor units** (cents), never a float — [transaction-endpoints]
- [ ] Config read via the validated `env` object, never raw `process.env` — [env-and-secrets]
- [ ] SQL is parameterised (`?` placeholders); no string-built queries — [db-layer]

## Transaction endpoints ONLY — 5-pass sign-off (paste the endpoint, tick each pass)
- [ ] **FORGE** — extra/unknown fields rejected (strict zod, no mass-assignment)
- [ ] **REPLAY** — same idempotency key twice → one effect (test present)
- [ ] **RACE** — concurrent double-spend → exactly one success (test present, pool ≥2 threads)
- [ ] **IDOR** — cannot act on another user's row → 403/404
- [ ] **EXTREMES** — non-positive / fractional / overflow amount → 400
```

```
# .github/CODEOWNERS — auto-requests review on surfaces that can lose money or leak secrets.
/src/auth/**            @me
/src/db/**              @me
/src/db/tx/**           @me
/src/routes/transfer*   @me
*.env*                  @me
/src/lib/env.js         @me
/src/lib/dbkey.js       @me
/.github/**             @me
```

In **Settings → Branches** protection for `main`: require a PR + review (CODEOWNERS review then becomes
mandatory for those paths) and require these **status checks green** — `ci / build-and-test` (§1) plus
the security workflows from [supply-chain-security](supply-chain-security.md) (`dependency-audit`,
`secret-scan`, `semgrep`, `codeql`, and `container-scan` if Dockerized). Enable *Require branches up to
date* so a check can't pass against a stale base, and *Do not allow bypassing* so the rules bind admins.

## 6. OpenAPI generation + contract tests [nice]

Rationale: the zod schemas in [input-validation](input-validation.md) already *are* the contract —
deriving the OpenAPI spec from them means the doc can't drift from what the server validates, and a
committed spec + a CI diff check turns any drift into a failed build.

```js
// scripts/gen-openapi.js — same zod schemas that validate at runtime = single source of truth.
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { writeFileSync } from 'node:fs';
import { registerSchemas } from '../src/lib/openapi-registry.js'; // registerPath({ method, path, request, responses })

const registry = new OpenAPIRegistry();
registerSchemas(registry);
const doc = new OpenApiGeneratorV31(registry.definitions)
  .generateDocument({ openapi: '3.1.0', info: { title: 'app', version: '1.0.0' } });
// Output ordering follows registration order, so a plain stringify normally diffs only on a real
// contract change (a zod-to-openapi upgrade can reorder keys — regenerate + commit if that happens).
// Don't pass Object.keys().sort() as arg 2 of JSON.stringify — that's a property allowlist and would
// DROP every nested key.
writeFileSync('openapi.json', JSON.stringify(doc, null, 2) + '\n');
```

Commit `openapi.json`, then gate on regeneration producing no diff (the spec-drift guard):

```yaml
# ci.yml (fragment) — fails if the committed spec no longer matches the zod schemas.
- run: node scripts/gen-openapi.js
- run: git diff --exit-code openapi.json   # nonzero = a schema changed but the spec wasn't regenerated
```

Contract-test the **running** server against that spec (Vitest + supertest, same harness as [testing](testing.md)):

```js
// test/contract/me.test.js — assert real responses satisfy the committed schema.
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';                  // OpenAPI 3.1 schemas ARE JSON Schema 2020-12 —
                                                      // the draft-04 build (`ajv-draft-04`) can't parse them.
import { app } from '../../src/app.js';
import { loginAs } from '../setup/helpers.js';
import spec from '../../openapi.json' with { type: 'json' };

const ajv = new Ajv2020({ strict: false });
describe('contract: GET /api/v1/me', () => {
  it('response matches the OpenAPI schema', async () => {
    const { agent } = await loginAs(app, 'alice');
    const res = await agent.get('/api/v1/me').set('X-CSRF', '1').expect(200);
    const schema = spec.paths['/api/v1/me'].get.responses['200'].content['application/json'].schema;
    expect(ajv.validate(schema, res.body), ajv.errorsText()).toBe(true);
  });
});
```

Generate the frontend `api()` types from the **same** `openapi.json` (e.g. `openapi-typescript`
→ `frontend/src/lib/api-types.ts`) so client and server share one source of truth — a schema change
that breaks the frontend then surfaces as a TypeScript error in the frontend typecheck (§1), not at
runtime. This is the build-time half of the shared-schema rule in §8.

## 7. Feature flags + kill switches [should]

Rationale: a risky surface — new registrations, a money endpoint, a broken session path — must be
disableable **server-side, never trusting the client, and without a redeploy for the DB-backed case**;
start with zod-validated env flags for on/off and staged rollout, graduate to a table only when you
need runtime toggles.

Env flags are validated in `src/lib/env.js` like every other var — that schema is owned by
[config-and-topology](config-and-topology.md), which already declares `FEATURE_SIGNUP_OPEN` and
`FEATURE_PASSKEYS` as `'on'`/`'off'` enums. Extend it; don't fork the vocabulary or mint an alias
([integration-notes](integration-notes.md)):

```js
// src/lib/env.js — add to the central ENV_SHAPE (config-and-topology.md owns it). Flags stay string
// enums ('on'/'off', matching the FEATURE_* vars already there) because z.coerce.boolean is loose
// ("false" → true). New-feature flags default 'off' (fail-safe: never active by omission); a KILL
// SWITCH guards an already-live surface, so it defaults 'on' — otherwise every fresh environment
// boots with the money endpoint frozen.
// ...inside ENV_SHAPE (FEATURE_SIGNUP_OPEN is the registration switch — reuse it, don't re-declare):
  FEATURE_TRANSFERS: z.enum(['on', 'off']).default('on'), // KILL SWITCH: 'off' → freeze the money endpoint
  FEATURE_NEW_CHECKOUT_ROLLOUT: z.coerce.number().int().min(0).max(100).default(0), // % staged rollout
```

```js
// src/lib/flags.js — evaluated SERVER-SIDE only; a client-sent flag is never trusted.
import { createHash } from 'node:crypto';
import { env } from './env.js';

export const isEnabled = (name) => env[name] === 'on';

// Deterministic per-user bucketing: same user → same decision, so a rollout is stable, not a
// per-request coin flip. Hash(name+userId) mod 100 < percentage.
export function inRollout(name, userId) {
  const pct = env[name];                             // 0..100
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return createHash('sha256').update(`${name}:${userId}`).digest().readUInt32BE(0) % 100 < pct;
}
```

```js
// Guard middleware — a frozen surface returns 403 before the handler runs. KILL SWITCH in one line.
import { isEnabled } from '../lib/flags.js';
import { ERR, sendError } from '../lib/http.js';   // api-conventions.md
export const requireFeature = (name) => (req, res, next) =>
  isEnabled(name) ? next() : sendError(res, 403, ERR.FORBIDDEN, 'feature temporarily unavailable');
// router.post('/register', requireFeature('FEATURE_SIGNUP_OPEN'), ...);
// router.post('/api/v1/transfer', requireFeature('FEATURE_TRANSFERS'), requireAuth, ...);
```

To flip a flag **without a redeploy**, graduate to a `feature_flags` table read through the worker pool
([db-layer](db-layer.md)) with a short in-process cache — same pattern *and same caveat* as the
clustered `sv` cache in [auth-blueprint](auth-blueprint.md): each process caches independently, so a
flip must invalidate every process (bump a `flags_version`, or accept a short-TTL staleness window).
**Force-logout-all** is the same lever as a global `sv` bump — reuse `invalidateSvCache()`, don't
invent a parallel path.

```sql
-- migration: DB-backed flags. `enabled` is authoritative; updated_by + audit log record who flipped it.
CREATE TABLE IF NOT EXISTS feature_flags (
  name        TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,   -- 0/1, server-side only
  rollout_pct INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  updated_by  INTEGER,                       -- user_id who last flipped it
  updated_at  INTEGER NOT NULL
);
```

> **Every flag flip is an audit event.** Env-driven (a deploy diff) or DB-backed (a row update), write
> it through `appendAudit()` — [security-integrity](security-integrity.md) owns the tamper-evident
> audit chain ([integration-notes](integration-notes.md)) — because a kill switch is a security action,
> and "who froze transfers at 03:00 and why" must be answerable. Never expose raw flag
> state to an unauthenticated client; it learns a feature is off only by getting a `403` from the route.

## 8. Graceful deprecation & API versioning [should]

Rationale: an endpoint or schema must evolve without breaking an already-deployed client — including a
stale cached SPA build — so the rule is **additive-first**, breaking changes get a version bump and a
deprecation window, and an old client hitting a changed contract is told to refresh, not left to
mis-parse.

This is the process layer over the `/api/v1` mechanism in [api-conventions](api-conventions.md) §4 —
that file owns *how* the prefix is mounted; this owns *when* you turn the dial and how you retire the old one.

**Additive-first for the shared zod schemas.** Adding an **optional** request field or a **new**
response field is backward-compatible (old clients ignore unknowns; the server tolerates absence) — do
it in `v1` in place. **Changing a type, removing a field, or altering semantics** is breaking → new
`/api/v2` router, both served during the window. Because the frontend `api()` types are generated from
the same schema (§6), a breaking change the client hasn't caught up to is a **TypeScript error at build
time**, not a runtime shape mismatch.

**Deprecation lifecycle** — mark → warn → sunset → remove:

```js
// src/middleware/deprecation.js — announce a sunset on a still-working route.
export const deprecate = ({ since, sunset, link }) => {
  // Both header values are fixed dates — compute once at mount, not per request.
  const deprecation = `@${Math.floor(new Date(since).getTime() / 1000)}`; // RFC 9745: structured-field
                                                                          // Date (when it became deprecated)
  const sunsetHttp = new Date(sunset).toUTCString();                      // removal date, HTTP-date per RFC 8594
  return (req, res, next) => {
    res.set('Deprecation', deprecation);
    res.set('Sunset', sunsetHttp);
    if (link) res.set('Link', `<${link}>; rel="deprecation"`); // → CHANGELOG / migration note (RFC 9745 rel)
    req.log?.warn({ route: req.originalUrl, sunset }, 'deprecated endpoint called'); // track real usage
    next();
  };
};
// v1.post('/old-transfer', deprecate({ since: '2026-06-01', sunset: '2026-09-01', link: '/CHANGELOG.md#v2-transfer' }), ...);
```

The `warn` log tells you *when it's safe to remove*: watch the deprecated-route counter fall to zero
before the sunset date, then delete the route in the PR that records the removal in `CHANGELOG.md` (§4).

**Client-minimum-version gate.** A very old cached SPA can hit a changed contract; catch it at runtime
and force a refresh instead of a silent mis-parse. The `api()` wrapper
([frontend-conventions](frontend-conventions.md)) sends its build version; the server rejects builds
below the floor with a distinct code the wrapper handles by hard-reloading. The wrapper switches on the
`code`, so this is a **contract change**: add `CLIENT_TOO_OLD` to the closed `ERR` set (and `426` to the
status table) in [api-conventions](api-conventions.md) — never a bare string literal at the call site.

```js
// src/middleware/client-version.js — reject a stale SPA build with a signal it knows to act on.
import { env } from '../lib/env.js';
import { ERR, sendError } from '../lib/http.js';   // ERR.CLIENT_TOO_OLD registered in api-conventions.md
export function clientVersionGate(req, res, next) {
  const v = Number(req.get('X-Client-Version'));   // set by api() from the build stamp
  // Same-origin SPA only: no header (curl / server-to-server) isn't a browser client → allow through.
  if (Number.isFinite(v) && v < env.MIN_CLIENT_VERSION) {
    return sendError(res, 426, ERR.CLIENT_TOO_OLD, 'please reload to update'); // 426 Upgrade Required
  }
  next();
}
```

The wrapper treats `426 / CLIENT_TOO_OLD` as a forced-refresh trigger (`location.reload()` once the
in-flight action is safely abandoned), so a client running against a contract it predates gets a clean
reload, not a corrupted parse. Bump `MIN_CLIENT_VERSION` only on a genuinely breaking deploy — a coarse
dial, exactly like the `/api/vN` prefix.

## New env vars

Add to `.env.example` and the central zod schema in `src/lib/env.js` — [config-and-topology](config-and-topology.md)
owns that schema; each var is declared there once ([integration-notes](integration-notes.md)):

```ini
# Feature flags / kill switches (§7) — server-side only, evaluated before the handler runs.
# FEATURE_SIGNUP_OPEN (the registration switch) already lives in the central schema.
FEATURE_TRANSFERS=on                 # off → freeze the money endpoint
FEATURE_NEW_CHECKOUT_ROLLOUT=0       # 0..100 staged rollout percentage
# Lowest SPA build the API will serve (§8). Bump on a breaking deploy to force stale clients to reload.
MIN_CLIENT_VERSION=1
```