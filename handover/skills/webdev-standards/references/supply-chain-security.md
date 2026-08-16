# Supply-chain security

Why this design: every other reference file hardens the code *you* wrote. This one hardens the code
you *pulled in* — the transitive dependency tree, the base image, the build step, and the commit
that accidentally leaks a secret. The threat model is different: an attacker doesn't need a bug in
your handler if a compromised `node_modules` package, a stale CVE, or a `DB_MASTER_KEY` pasted into a
committed `.env` gives them the same access. So the defenses are **automated gates that run without a
human remembering to** — in CI on every PR, on a weekly schedule (new CVEs land against unchanged
code), and locally in a pre-commit hook (the last line before a secret leaves your machine). Each
gate below fails the build on a real finding; none is advisory-only.

Everything cross-references the invariants it enforces — the parameterized-SQL and cookie rules from
[auth-blueprint](auth-blueprint.md), the `process.env`-only-in-env.js rule from
[env-and-secrets](env-and-secrets.md), the single-`api()`-fetch rule from
[frontend-conventions](frontend-conventions.md), the helmet CSP from [server-skeleton](server-skeleton.md),
the Dockerfile from [deployment](deployment.md), and the pre-ship gate in [security-checklist](security-checklist.md).
This file is the *automation* of the "Dependencies" and "Secrets" boxes on that checklist.

> **Pin third-party actions by commit SHA, not by tag.** `@v4` / `@v2` are *mutable* — a compromised
> action re-points the tag at malicious code (this happened to `tj-actions` and to `trivy-action`
> itself in 2026). The tag forms below are shown for readability; in the real workflows pin each
> non-GitHub action to a full `@<sha>  # vX.Y.Z` and let Dependabot (§5) bump the SHAs.

---

## 1. Reproducible installs: `npm ci` + committed lockfile [must]

**Rationale:** `npm install` can silently resolve a *different* tree than the one you audited; `npm ci`
installs the lockfile byte-for-byte and fails if `package.json` and the lock disagree — so what CI
scanned is exactly what ships.

- Commit **both** lockfiles: root (`package-lock.json`) and frontend (`frontend/package-lock.json`).
- CI and Docker ([deployment](deployment.md)) always use `npm ci`, **never** `npm install`.
- Add `lockfile-lint` to reject any dependency whose `resolved` URL isn't the public registry over
  HTTPS — a `git+ssh` or `http:` resolution is a classic dependency-confusion / MITM vector.

```yaml
# .github/workflows/ci.yml (job fragment) — runs on PR + push.
jobs:
  install:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        dir: ['.', 'frontend']   # root Express app + Vite frontend, same rules for both
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'   # pin the LTS line once, reused everywhere
          cache: 'npm'
          cache-dependency-path: ${{ matrix.dir }}/package-lock.json
      # ci (not install): exact, lockfile-faithful, fails on package.json/lock drift.
      - run: npm ci --prefix ${{ matrix.dir }}
      # Reject non-registry / insecure resolved URLs before they ever reach a build.
      - run: npx --yes lockfile-lint --path ${{ matrix.dir }}/package-lock.json
             --type npm --allowed-hosts npm --validate-https --validate-integrity
```

For the crypto-critical native deps (`better-sqlite3-multiple-ciphers`, `argon2`, `jose`) also verify
publisher provenance — npm's registry signatures catch a tampered tarball the integrity hash alone
wouldn't if the lock itself were poisoned:

```bash
npm audit signatures   # verifies registry ECDSA signatures + npm provenance attestations (npm 9.5+)
```

---

## 2. Dependency vulnerability scanning: npm audit + osv-scanner [must]

**Rationale:** a dependency that was clean at merge time turns vulnerable the day a CVE is published
against it — so scanning must run on a **schedule** against the unchanged lockfile, not only on PRs.

`npm audit` alone can't gate cleanly (it exits non-zero on *any* severity and has no allowlist), so
gate with **`audit-ci`** on a High/Critical threshold plus a reviewed allowlist, and cross-check with
**osv-scanner** (Google's OSV database — broader coverage, reads `package-lock.json` directly).

```yaml
# .github/workflows/dependency-audit.yml
name: dependency-audit
on:
  pull_request:
  push: { branches: [main] }
  schedule:
    - cron: '17 6 * * 1'   # every Monday 06:17 UTC — new CVEs vs unchanged code
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        dir: ['.', 'frontend']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
          cache-dependency-path: '${{ matrix.dir }}/package-lock.json'
      - run: npm ci --prefix ${{ matrix.dir }}
      # audit-ci gates on a severity floor and honours an allowlist of triaged advisories.
      # --directory points it at THIS matrix leg's tree — without it, it audits the cwd (root) twice.
      - run: npx --yes audit-ci --directory ${{ matrix.dir }} --config ${{ matrix.dir }}/audit-ci.jsonc

  # Second opinion from the OSV database. osv-scanner ships as a REUSABLE WORKFLOW — called with a
  # job-level `uses:`, not as a step action. It checks out the repo itself and reads the lockfiles
  # directly (no install). fail-on-vuln defaults to true, so ANY OSV advisory fails the job —
  # audit-ci is the tunable gate, osv-scanner the strict backstop.
  osv:
    permissions:
      actions: read            # the reusable workflow reads its own run metadata
      contents: read
      security-events: write   # it uploads results to code scanning as SARIF
    uses: google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@v2.3.8
    with:
      scan-args: |-
        --lockfile=./package-lock.json
        --lockfile=./frontend/package-lock.json
```

```jsonc
// audit-ci.jsonc — one per package root. Gate on high+; every allowlist entry needs a reason + expiry.
{
  "moderate": false,       // don't fail the build on moderate…
  "high": true,            // …but a High or Critical advisory is a hard stop
  "critical": true,
  "report-type": "important",
  // Accepted advisories: only advisory IDs, each justified in review. Prune on every renewal.
  // e.g. a dev-only tool with no runtime exposure whose fix isn't released yet:
  "allowlist": ["GHSA-xxxx-xxxx-xxxx"]
}
```

An empty `allowlist` is the goal state; a non-empty one is a tracked debt, not a permanent silence.
For the runtime-only view (dev-tooling CVEs can't be exploited in production), add a stricter
`npm audit --omit=dev --audit-level=high` step — a High there blocks a release even if the combined
audit is allow-listed.

---

## 3. Secret scanning: gitleaks in CI + pre-commit [must]

**Rationale:** `.env` is gitignored ([env-and-secrets](env-and-secrets.md)), but the leak that hurts is
the one the gitignore rule *doesn't* cover — a key pasted into a test file, a commit message, or a
config snippet. Gitleaks scans **content**, so it catches the shape of the secret wherever it lands;
the pre-commit hook stops it before it's even committed, and the CI job scans the **full history** so a
force-pushed or squashed leak still surfaces.

```toml
# gitleaks.toml — extends the default ruleset with THIS stack's secret shapes.
[extend]
useDefault = true   # keep gitleaks' built-in rules (AWS keys, PEM blocks, generic high-entropy)

# --- base64url secrets: JWT_SECRET(_PREV), DB_MASTER_KEY, BLIND_INDEX_KEY (32+ bytes = 43+ base64url chars) ---
[[rules]]
id = "webdev-base64url-secret"
description = "Assignment of a 32+ byte base64url secret to a known key var"
# Matches KEY = "…43+ base64url chars…" in .env / JS / YAML.
regex = '''(?i)\b(DB_MASTER_KEY|DB_KEY_SALT|BLIND_INDEX_KEY|JWT_SECRET(?:_PREV)?)\b\s*[:=]\s*['"]?[A-Za-z0-9_-]{43,}'''
keywords = ["DB_MASTER_KEY", "JWT_SECRET", "DB_KEY_SALT", "BLIND_INDEX_KEY"]

# --- derived DB hexkey leaking via a PRAGMA (64 hex chars = the 32-byte scrypt output, dbkey.js) ---
[[rules]]
id = "webdev-sqlite-hexkey"
description = "SQLite hexkey/key PRAGMA with an inline 64-hex-char key"
regex = '''(?i)pragma\s+(?:hex)?(?:re)?key\s*=\s*['"]?[0-9a-f]{64}'''
keywords = ["hexkey", "hexrekey", "pragma"]

# --- a committed .env body: a secret var assigned a non-empty value ---
[[rules]]
id = "webdev-dotenv-body"
description = "Inlined .env contents containing a secret variable"
regex = '''(?m)^\s*(DB_MASTER_KEY|DB_KEY_SALT|BLIND_INDEX_KEY|JWT_SECRET(?:_PREV)?)\s*=\s*\S+'''
keywords = ["DB_MASTER_KEY", "JWT_SECRET", "DB_KEY_SALT", "BLIND_INDEX_KEY"]

# The example file ships intentional placeholders (CHANGE_ME) — never flag it.
[allowlist]
paths = ['''(^|/)\.env\.example$''']
regexes = ['''CHANGE_ME''', '''test-master-key-not-a-real-secret''']  # documented test fixtures
```

```yaml
# .github/workflows/secret-scan.yml
name: secret-scan
on: [pull_request, push]
permissions:
  contents: read
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # full history — a squashed/force-pushed leak still surfaces
      # NOTE: gitleaks-action@v2 is free for personal repos; org-owned repos need a paid
      # GITLEAKS_LICENSE. To stay license-free everywhere, run the OSS binary directly instead, e.g.
      # `docker run -v "$PWD:/repo" zricethezav/gitleaks:latest git /repo --config /repo/gitleaks.toml --redact`.
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITLEAKS_CONFIG: gitleaks.toml
```

Pre-commit hook (plain, no husky dependency needed — but the `.husky/` variant is identical):

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit  (chmod +x). Scans ONLY the staged diff → fast, blocks the commit on a hit.
set -euo pipefail
# `git --pre-commit --staged` replaced the deprecated `protect --staged` in gitleaks v8.19.
gitleaks git --pre-commit --staged --redact --config gitleaks.toml
# --redact: never print the secret itself into the terminal / CI log.
```

> A gitleaks hit means the secret is **already compromised the moment it was typed on a shared branch**.
> Removing the commit is not enough — rotate the key (JWT keyring / rekey procedures in
> [env-and-secrets](env-and-secrets.md)) before un-blocking.

---

## 4. SAST: semgrep with house-rule custom rules [should]

**Rationale:** generic rulesets catch generic bugs; the failures that actually happen on *this* stack
are blueprint violations — a raw `fetch(` bypassing the CSRF-aware `api()` wrapper, a `better-sqlite3`
import sneaking around the worker-pool facade, a client-sent `total`. Encode those invariants as
custom rules so a reviewer never has to spot them by eye.

```yaml
# .github/workflows/semgrep.yml
name: semgrep
on:
  pull_request:
  schedule: [{ cron: '23 6 * * 1' }]
permissions: { contents: read }
jobs:
  semgrep:
    runs-on: ubuntu-latest
    container: { image: semgrep/semgrep }
    steps:
      - uses: actions/checkout@v4
      # Community rulesets + our house rules; --error makes any finding fail the job.
      - run: semgrep ci --config p/javascript --config p/nodejs --config p/react
             --config p/owasp-top-ten --config p/jwt --config ./semgrep-rules.yml --error
```

```yaml
# semgrep-rules.yml — invariants of THIS blueprint. Each message names the file that owns the rule.
rules:
  - id: raw-fetch-outside-api-wrapper
    languages: [typescript, javascript]
    severity: ERROR
    message: >-
      Use the single api() wrapper (src/lib/api.ts) — it adds credentials, X-CSRF and cross-tab
      refresh. Raw fetch() bypasses CSRF + auth. See frontend-conventions.md.
    paths: { exclude: ['src/lib/api.ts', 'test/**'] }
    patterns:
      - pattern: fetch(...)

  - id: better-sqlite3-import-outside-db-layer
    languages: [javascript, typescript]
    severity: ERROR
    message: >-
      Only src/db/ may import the driver. The app talks to the async worker-pool facade
      src/db/index.js — never open a connection on the event loop. See db-layer.md.
    paths: { exclude: ['src/db/**', 'test/**'] }
    pattern-either:
      - pattern: import $X from "better-sqlite3-multiple-ciphers"
      - pattern: require("better-sqlite3-multiple-ciphers")

  - id: string-concatenated-sql
    languages: [javascript, typescript]
    severity: ERROR
    message: >-
      SQL must be parameterized (bound ? placeholders) — never string-built. Concatenation is
      injection. See db-layer.md / transaction-endpoints.md.
    patterns:
      - pattern-either:
          - pattern: $DB.prepare("..." + $X)
          - pattern: $DB.prepare(`...${$X}...`)
          - pattern: $DB.exec("..." + $X)

  - id: client-supplied-money-field
    languages: [javascript, typescript]
    severity: ERROR
    message: >-
      A price/total/amount/balance read from req.body is an attack surface — compute it server-side
      from the DB. Never trust the client. See transaction-endpoints.md.
    pattern-regex: 'req\.body\.(total|price|amount|balance|cost|subtotal)\b'

  - id: jwtverify-without-algorithms-pin
    languages: [javascript, typescript]
    severity: ERROR
    message: >-
      jwtVerify must pin { algorithms: ['HS256'] } — without it, an attacker can downgrade the alg.
      See auth-blueprint.md.
    patterns:
      # Match ANY call (including the 2-arg form with no options at all), then subtract the pinned form.
      - pattern: jwtVerify(...)
      - pattern-not: jwtVerify($TOK, $KEY, { ..., algorithms: [...] })

  - id: cookie-missing-httponly-secure
    languages: [javascript, typescript]
    severity: ERROR
    message: >-
      Auth cookies must be httpOnly + secure + sameSite (with __Host-/__Secure- prefix in prod).
      See auth-blueprint.md.
    patterns:
      - pattern: res.cookie($NAME, $VAL, $OPTS)
      - pattern-not: res.cookie($NAME, $VAL, { ..., httpOnly: true, secure: $SEC, sameSite: $SS })

  - id: process-env-outside-env-js
    languages: [javascript, typescript]
    severity: WARNING
    message: >-
      Read config through the validated env object (src/lib/env.js), not process.env directly.
      See env-and-secrets.md.
    paths:
      exclude: ['src/lib/env.js', 'src/db/worker.js', 'scripts/**', 'test/**', 'vitest.config.js']
    pattern-regex: 'process\.env\.'
```

> `process-env-outside-env-js` is a **WARNING**, not an error: a few legitimate spots read `process.env`
> before `env.js` is importable (the worker reads `DB_PATH`, the test setup mints it — see
> [testing](testing.md)). Keep the excludes tight; a new hit is a review prompt, not an auto-fail.

---

## 5. CodeQL + GitHub push-protection [should]

**Rationale:** CodeQL is deep semantic dataflow analysis (taint from an HTTP source to a SQL/exec sink)
that pattern-based SAST can't do; it's free for the repo and complements semgrep rather than
duplicating it. Enable GitHub **push protection** too — it blocks a known secret *at push time*,
before the CI secret-scan even runs.

```yaml
# .github/workflows/codeql.yml
name: codeql
on:
  pull_request:
  schedule: [{ cron: '41 6 * * 1' }]
permissions:
  security-events: write   # required to upload the SARIF results
  contents: read
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          queries: security-extended   # the fuller security query pack, not just the default set
      - uses: github/codeql-action/analyze@v3
```

In repo **Settings → Code security**: turn on *Secret scanning* and *Push protection* (blocks pushes
containing recognised secret patterns), and *Dependabot alerts* + *security updates* (automated PRs
bumping vulnerable transitive deps — the same CVE feed as §2, but with the fix pre-written).
Dependabot's `github-actions` ecosystem also bumps the pinned action SHAs above. CodeQL's own workflow
doubles as GitHub code scanning; findings land in the Security tab as SARIF.

---

## 6. Automated security-headers audit [should]

**Rationale:** the helmet config in [server-skeleton](server-skeleton.md) is only as good as the day it
was written — a refactor that reorders middleware or loosens the CSP is invisible in review but obvious
to an automated assertion. Boot the real app in CI and assert the actual response headers, so a header
regression fails the build like any other test.

First, **add the missing directives to the helmet config** (the current [server-skeleton](server-skeleton.md)
block omits HSTS and the cross-origin isolation headers — add them there so prod and this test agree):

```js
// server.js — the hardened helmet block this audit asserts against.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Per-request nonce (res.locals.cspNonce, set by a middleware before helmet) — NOT 'unsafe-inline'.
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],       // clickjacking: stronger than the default 'self'
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  // HSTS: 2 years, subdomains, preload-eligible. Harmless on loopback; the proxy also sets it (deployment.md).
  strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
  // Cross-origin isolation: helmet sets COOP same-origin + CORP same-origin by default; keep them explicit.
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
// helmet has no Permissions-Policy helper — set it directly. Lock down powerful features.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
```

Then assert those headers against the running app (Vitest + supertest, same harness as [testing](testing.md)):

```js
// test/security/headers.test.js — a header regression fails CI like any other test.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';   // Express instance, no listen() — see testing.md

describe('security headers', () => {
  it('sends the hardened header set on a representative route', async () => {
    const res = await request(app).get('/healthz');   // public, cheap route (deployment.md)
    const h = res.headers;

    // CSP present, nonce-based, and NOT relaxed with unsafe-inline.
    expect(h['content-security-policy']).toMatch(/default-src 'self'/);
    expect(h['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(h['content-security-policy']).not.toMatch(/unsafe-inline/);

    // HSTS: long max-age + includeSubDomains + preload.
    expect(h['strict-transport-security']).toMatch(/max-age=63072000/);
    expect(h['strict-transport-security']).toMatch(/includeSubDomains/);
    expect(h['strict-transport-security']).toMatch(/preload/);

    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['permissions-policy']).toMatch(/camera=\(\)/);
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['cross-origin-resource-policy']).toBe('same-origin');
    expect(h['x-powered-by']).toBeUndefined();   // app.disable('x-powered-by')
  });
});
```

> These assertions *are* the Mozilla Observatory / securityheaders.com scoring rules encoded locally —
> same criteria (CSP without `unsafe-inline`, HSTS preload, `nosniff`, framing denied), but they gate a
> merge instead of grading a live URL after the fact. Run an external grader against staging as a
> secondary check, never as the primary gate (it can't see a PR).

---

## 7. Container image scanning: Trivy + hadolint [nice]

**Rationale:** the multi-stage Dockerfile in [deployment](deployment.md) pulls a base image and OS
packages you don't control; a CVE in the base `node:*-slim` or a `libssl` package is your CVE the moment
you ship it. Trivy scans the *built final-stage image* for OS-package + Node-dependency CVEs and Dockerfile
misconfigurations; hadolint lints the Dockerfile itself. Only relevant once the app is Dockerized.

```yaml
# .github/workflows/container-scan.yml
name: container-scan
on:
  pull_request: { paths: ['Dockerfile', 'package-lock.json', 'frontend/package-lock.json'] }
  schedule: [{ cron: '53 6 * * 1' }]   # base-image CVEs land against an unchanged Dockerfile
permissions: { contents: read }
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Lint the Dockerfile: catches missing USER, unpinned base, apt without --no-install-recommends.
      - uses: hadolint/hadolint-action@v3.1.0
        with: { dockerfile: Dockerfile }
      # Build the real runtime stage so the scan sees exactly what ships (see deployment.md multi-stage).
      - run: docker build --target runtime -t app:scan .
      # Pin trivy-action by SHA in the real file — this action was itself compromised in 2026.
      - uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: app:scan
          scanners: 'vuln,misconfig,secret'   # CVEs + Dockerfile misconfig + accidental baked secrets
          severity: 'HIGH,CRITICAL'
          exit-code: '1'                       # fail the build on HIGH/CRITICAL
          ignore-unfixed: true                 # don't block on CVEs with no available patch yet
          trivyignores: '.trivyignore'
```

```
# .trivyignore — triaged findings only, each with a CVE id, reason, and a re-review date.
# CVE-2024-XXXXX  base-image libfoo; not in the code path we exercise; recheck 2026-09.
```

Pin the base image **by digest** (`FROM node:22-bookworm-slim@sha256:…`) so a re-pushed tag can't swap
the image under you, keep the `USER node` / non-root and multi-stage layout from
[deployment](deployment.md), and scan on a schedule — a new base-image CVE must fail the build even when
no code changed.

---

## Wiring it into the gate

These jobs are the automated half of the "Dependencies" and "Secrets" rows of the pre-deploy gate in
[security-checklist](security-checklist.md). Make them **required status checks** on the default branch so
a red scan blocks merge with no override:

- On every PR: `install` (§1), `dependency-audit` (§2), `secret-scan` (§3), `semgrep` (§4), `codeql` (§5),
  `test/security/headers.test.js` (§6, part of `test:ci` from [testing](testing.md)), `container-scan` (§7, if Dockerized).
- Weekly `schedule`: the audit, semgrep, codeql, and container scans re-run against unchanged code —
  because a CVE published today makes yesterday's clean tree vulnerable.
- Locally: the gitleaks pre-commit hook (§3) is the last gate before a secret leaves the machine.

A finding is a **stop**, not a warning. Fix the code, bump the dep, or file a justified, dated allowlist
entry — then re-run the gate.
