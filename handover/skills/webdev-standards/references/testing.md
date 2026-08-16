# Testing

Tests here are not a coverage vanity metric — they are the **regression net for every security invariant** in [auth-blueprint](auth-blueprint.md) and [transaction-endpoints](transaction-endpoints.md). Every attack the 5-pass adversarial checklist (WIRING/FORGE/REPLAY/RACE/IDOR/EXTREMES) rules out at design time gets encoded as a permanent test, so a future refactor that reopens the hole fails CI instead of shipping. We use **Vitest** (native ESM, same `vite` toolchain as the frontend) + **supertest** for HTTP-level integration against the real Express app.

Two golden rules: (1) tests **never** touch dev/prod data — each test file gets its own throwaway encrypted DB under a unique `DB_PATH`; (2) the worker pool is pointed at that temp DB through env, exactly like production, so we test the real async facade — not a mock.

> **Rate limiters skip in the test env.** A suite makes all its requests from one IP, so per-IP limiters (login 10, register 5 / 15 min) would throttle it into false failures. The limiters in [auth-blueprint](auth-blueprint.md) and [transaction-endpoints](transaction-endpoints.md) carry `skip: () => process.env.NODE_ENV === 'test'`. Rate limiting itself gets its **own** dedicated test (fire N+1 requests, assert the last is 429) — you disable it only where it would produce noise, never coverage.

## Test env isolation

Tests load the same zod `env` object ([env-and-secrets](env-and-secrets.md)) but with throwaway values and a per-file `DB_PATH` in the OS temp dir. Two hard constraints drive the wiring below:

- Vitest runs each test file in a **separate worker process**, and `globalSetup` runs in the *main* process — so `process.env` mutations in `globalSetup` do **not** reach the workers. The unique `DB_PATH` must therefore be assigned in a **per-worker `setupFiles` script**, before `src/db/index.js` is imported (the worker pool reads env at boot).
- Vitest only auto-exposes `VITE_`-prefixed vars from `.env` files. To load our unprefixed backend vars into `process.env`, use Vite's `loadEnv` with an empty prefix in the config (`dotenv:` is **not** a Vitest option and is silently ignored).

```bash
# .env.test — loaded via loadEnv() in the config, git-ignored. Throwaway values only.
NODE_ENV=test
PORT=3999                     # unused in tests (supertest binds its own ephemeral port); src/app.js must not call listen() at import. Keep it a positive int so env.js validation passes.
TRUST_PROXY=false
DB_MASTER_KEY=test-master-key-not-a-real-secret
DB_KEY_SALT=test-key-salt-0123456789abcdef
# Must satisfy env.js: base64url, decodes to >=32 bytes. Generate one with:
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
JWT_SECRET=dGVzdC1qd3Qtc2VjcmV0LTMyLWJ5dGVzLW1pbmltdW0tbGVu
JWT_KID=test-1
LOG_LEVEL=silent              # pino: keep test output clean
DB_POOL_THREADS=1             # deterministic for most tests; RACE tests raise this (see below)
# DB_PATH is intentionally NOT set here — assigned per worker in setupFiles.
# If the project pulled in more playbooks, add throwaway values for every extra REQUIRED var in the
# central schema (APP_ORIGIN, WEBAUTHN_*, PII_*, BLIND_INDEX_KEY, …) — env.js fails fast and names them.
```

A `setupFiles` module runs inside **every** worker before the test file's imports resolve, so it is the correct place to mint a unique DB path:

```js
// test/setup/db-path.js — setupFiles entry; runs per worker, before app/db import.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// One fresh encrypted DB per worker → parallel files never collide, dev data untouched.
// Must run before any import of src/db/index.js (the pool reads DB_PATH at boot).
const dir = mkdtempSync(join(tmpdir(), 'app-test-'));
process.env.DB_PATH = join(dir, 'test.db');
```

Per-file setup applies migrations and gives each test a clean slate:

```js
// test/setup/db.js — imported by files that need a schema.
import { migrate, truncateAll } from './helpers.js';   // helpers drive the pool facade (src/db/index.js)

export async function freshSchema() { await migrate(); }        // once per file
export async function resetRows() { await truncateAll(); }      // per-test, faster than re-migrating
```

## Unit tests: DB worker transactions

The `transfer` transaction ([transaction-endpoints](transaction-endpoints.md)) is authoritative money-movement logic. Unit-test it by importing it straight from `src/db/worker.js` and calling it in-process — no Piscina, no Express, just the invariant. The worker module lazily opens its own connection from `DB_PATH` on first call ([db-layer](db-layer.md)), so the per-worker temp-DB wiring above applies unchanged; open a second direct connection for seeding and assertions (WAL + `busy_timeout` let the two coexist).

```js
// test/unit/transfer.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { deriveDbKeyHex } from '../../src/lib/dbkey.js';
import { runMigrations, seedUserWithAccounts } from '../setup/helpers.js';
import { transfer } from '../../src/db/worker.js';   // called in-process here: no pool, no HTTP

// Direct handle for fixtures and assertions. Import the real deriveDbKeyHex instead of copying the
// scrypt call — the OWASP params are part of the key, so a copy silently drifts the day they change.
// PRAGMA order matters: hexkey MUST be the first statement (before journal_mode etc.).
function openTestDb() {
  const db = new Database(process.env.DB_PATH);
  db.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  db.prepare('SELECT 1').get(); // throws SQLITE_NOTADB immediately if the key is wrong
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

// transfer() re-checks the session INSIDE the tx, so the seeded user's session_version must match sv.
const base = { userId: 1, sv: 0, ip: '127.0.0.1', userAgent: 'vitest' };
const bal = (db, id) => db.prepare('SELECT balance_cents AS b FROM accounts WHERE id = ?').get(id).b;

describe('transfer (worker tx)', () => {
  let db;
  beforeEach(() => {
    db = openTestDb();
    runMigrations(db);
    // Truncates, then seeds: user 1 (session_version 0) owns account 1; account 2 is someone else's.
    seedUserWithAccounts(db, { userId: 1, sv: 0, balances: { 1: 100, 2: 0 } });
  });

  it('moves funds atomically and is balanced', () => {
    const r = transfer({ ...base, fromAccount: 1, toAccount: 2, amountCents: 40, idempotencyKey: 'k1' });
    expect(r).toMatchObject({ ok: true, replayed: false });
    expect(bal(db, 1)).toBe(60);
    expect(bal(db, 2)).toBe(40);
  });

  it('rejects overdraft and rolls back (EXTREMES)', () => {
    // Business failures throw inside the tx (forcing rollback) but cross the worker boundary as
    // { ok: false, code } — piscina does not preserve custom Error fields reliably.
    const r = transfer({ ...base, fromAccount: 1, toAccount: 2, amountCents: 999, idempotencyKey: 'k2' });
    expect(r).toEqual({ ok: false, code: 'INSUFFICIENT' });
    expect(bal(db, 1)).toBe(100); // unchanged
  });

  it('is idempotent: same key twice = one debit (REPLAY)', () => {
    const args = { ...base, fromAccount: 1, toAccount: 2, amountCents: 10, idempotencyKey: 'dup' };
    transfer(args);
    const second = transfer(args);
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(bal(db, 1)).toBe(90); // debited once
  });
});
```

## Integration tests: Express + supertest

Boot the real app and exercise the full auth flow. Assert on **cookies** (the security surface): `HttpOnly`, `SameSite`, and that tokens never appear in the JSON body. Supertest's agent persists cookies across requests, so register → login → authed → refresh → logout runs in one chain.

This assumes the [server-skeleton](server-skeleton.md) `server.js` is split for testability: `src/app.js` builds and **exports** the Express `app` without calling `listen()`, and `server.js` stays the entry that validates env, migrates, listens, and installs the crash handlers. Supertest binds its own ephemeral port.

> **Secure-cookie caveat.** superagent's cookie jar drops cookies flagged `Secure` when the request is plain HTTP — which supertest always is. `__Host-`/`__Secure-` prefixes *require* `Secure`, so those cookies would never round-trip in a supertest agent. The stack already gates the prefix + `Secure` flag on `NODE_ENV === 'production'` ([auth-blueprint](auth-blueprint.md)); in `test`/`dev` the cookies use plain names (`access`/`refresh`) and are still `HttpOnly`+`SameSite`. Import those names from `src/auth/middleware.js` (auth-blueprint owns them; the [config-and-topology](config-and-topology.md) `cookies.js` overlay only overrides `ACCESS_COOKIE` for cross-subdomain prod and does not export `REFRESH_COOKIE`), and assert the prefix/`Secure` logic in a dedicated unit test of the cookie builder.

```js
// test/integration/auth-flow.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';               // Express instance, no listen()
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../src/auth/middleware.js'; // env-aware names
import { freshSchema, resetRows } from '../setup/db.js';
import { backdateConsumedAt } from '../setup/helpers.js'; // direct-DB fixture: ages consumed_at

const creds = { email: 'a@b.co', password: 'Correct-Horse-9!' };

beforeAll(freshSchema);
beforeEach(resetRows);

// Assert a Set-Cookie header carries the required security attributes for the current env.
function expectAuthCookie(setCookie, name) {
  const c = setCookie.find((s) => s.startsWith(name + '='));
  expect(c, `missing cookie ${name}`).toBeDefined();
  expect(c).toMatch(/HttpOnly/i);
  expect(c).toMatch(/SameSite=(Strict|Lax)/i);
  return c;
}

describe('auth flow', () => {
  it('register → login → authed → refresh → logout', async () => {
    const agent = request.agent(app);

    // csrfProtection is app-level: every non-safe method needs X-CSRF (the frontend wrapper always
    // sends it). supertest's .send(object) sets Content-Type: application/json → the JSON check passes.
    await agent.post('/api/auth/register').set('X-CSRF', '1').send(creds).expect(201);

    const login = await agent.post('/api/auth/login').set('X-CSRF', '1').send(creds).expect(200);
    const cookies = login.headers['set-cookie'];
    expectAuthCookie(cookies, ACCESS_COOKIE);
    expectAuthCookie(cookies, REFRESH_COOKIE);
    expect(JSON.stringify(login.body)).not.toMatch(/eyJ|refresh/i); // no token leaked in body

    await agent.get('/api/me').expect(200); // GET is a CSRF-safe method — no header needed

    // Rotation: refresh issues NEW tokens.
    const refresh = await agent.post('/api/auth/refresh').set('X-CSRF', '1').expect(200);
    expectAuthCookie(refresh.headers['set-cookie'], REFRESH_COOKIE);

    await agent.post('/api/auth/logout').set('X-CSRF', '1').expect(200); // res.json({ ok: true })
    await agent.get('/api/me').expect(401); // cookies cleared
  });

  it('rejects unauthenticated access', async () => {
    await request(app).get('/api/me').expect(401);
  });

  it('detects refresh-token reuse and kills the family', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').set('X-CSRF', '1').send(creds).expect(201);
    const login = await agent.post('/api/auth/login').set('X-CSRF', '1').send(creds).expect(200);

    // Grab the pre-rotation refresh cookie straight from the Set-Cookie header (robust across jars).
    const preRotation = login.headers['set-cookie'].find((s) => s.startsWith(REFRESH_COOKIE + '='));
    const stolen = preRotation.split(';')[0]; // "name=value"

    await agent.post('/api/auth/refresh').set('X-CSRF', '1').expect(200); // rotates → old token consumed

    // Within 10 s of consumption the design reads a replay as a benign two-tab race: 409 and NO
    // revocation (false theft alarms would train us to ignore the real signal). Pin that branch.
    await request(app).post('/api/auth/refresh')
      .set('Cookie', stolen).set('X-CSRF', '1').expect(409);

    // Age the consumption past the race window; the same replay must now read as theft.
    await backdateConsumedAt(11); // helper: UPDATE refresh_tokens SET consumed_at = consumed_at - 11

    await request(app).post('/api/auth/refresh')
      .set('Cookie', stolen).set('X-CSRF', '1').expect(401); // family revoked + sv bumped
    await agent.get('/api/me').expect(401); // even the live access token dies (sv re-check)
  });
});
```

## Security regression suite

The 5-pass checklist, frozen as tests. **This file is the point of the whole standard** — never delete a case; every one maps to an attack the design already defends against. Run it against a transactional endpoint (`POST /api/transfer`).

```js
// test/security/transfer-endpoint.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { app } from '../../src/app.js';
import { freshSchema, resetRows } from '../setup/db.js';
import { loginAs, seedAccount } from '../setup/helpers.js'; // loginAs → { agent, accountId }; seedAccount → accountId

beforeAll(freshSchema);
beforeEach(resetRows);

// The route takes the idempotency key as an Idempotency-Key HEADER matching /^[A-Za-z0-9_-]{16,64}$/
// ([transaction-endpoints]) — randomUUID() (36 chars) satisfies it. Body is { fromAccount, toAccount,
// amountCents } with numeric account ids, per the strict zod schema.
const post = (agent, body, key = randomUUID()) =>
  agent.post('/api/transfer').set('X-CSRF', '1').set('Idempotency-Key', key).send(body);

describe('POST /api/transfer — 5-pass regression', () => {
  it('FORGE: unknown/extra field → 400 (strict zod, no mass-assignment)', async () => {
    const { agent, accountId } = await loginAs(app, 'alice', 100);
    const bob = await seedAccount('bob', 0);
    await post(agent, { fromAccount: accountId, toAccount: bob, amountCents: 10, isAdmin: true, balanceCents: 999 })
      .expect(400); // injected fields
  });

  it('IDOR: transfer from an account you do not own → 403', async () => {
    const { agent, accountId } = await loginAs(app, 'alice', 100);
    const carol = await seedAccount('carol', 500);
    // Ownership is re-checked INSIDE the tx → FORBIDDEN maps to 403.
    await post(agent, { fromAccount: carol, toAccount: accountId, amountCents: 500 }).expect(403);
  });

  it('REPLAY: same idempotency key twice → one debit', async () => {
    const { agent, accountId } = await loginAs(app, 'alice', 100);
    const bob = await seedAccount('bob', 0);
    const body = { fromAccount: accountId, toAccount: bob, amountCents: 30 };
    const key = randomUUID();
    await post(agent, body, key).expect(201);
    await post(agent, body, key).expect(200); // replay, not re-charged
    const me = await agent.get('/api/accounts/self');
    expect(me.body.balanceCents).toBe(70); // debited exactly once
  });

  it('RACE: concurrent double-spend → exactly one 201, one 409', async () => {
    const { agent, accountId } = await loginAs(app, 'alice', 50);
    const bob = await seedAccount('bob', 0);
    const fire = () => post(agent, { fromAccount: accountId, toAccount: bob, amountCents: 50 }); // distinct keys: a race, not a replay
    const results = await Promise.all([fire(), fire()]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]); // atomic named tx serializes; second sees insufficient funds
  });

  it('EXTREMES: non-positive / fractional / non-numeric amount → 400', async () => {
    const { agent, accountId } = await loginAs(app, 'alice', 100);
    const bob = await seedAccount('bob', 0);
    // 1e309 stringifies to null over JSON, so it also exercises the null branch — both must 400.
    for (const amountCents of [-1, 0, 0.5, 1e309, '10', null]) {
      await post(agent, { fromAccount: accountId, toAccount: bob, amountCents }).expect(400);
    }
  });
});
```

> RACE tests only contend if the pool has ≥2 threads. The pool reads `DB_POOL_THREADS` at boot, and ESM hoists static imports — a plain `process.env.DB_POOL_THREADS = '4'` at the top of the test file runs *after* `src/db/index.js` has already booted, so it silently does nothing. Wrap it in `vi.hoisted(() => { process.env.DB_POOL_THREADS = '4'; })` (hoisted callbacks run before the imports) or set it in a `setupFiles` script. The atomic named worker transaction is what forces one caller to lose with 409.

## Coverage config & scripts

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig({
  test: {
    // loadEnv('test', …, '') loads ALL vars from .env.test into the test env — the empty third
    // argument disables the VITE_ prefix filter, and pinning mode 'test' here means no CLI flag can
    // ever point tests at .env.development. (`dotenv:` is not a Vitest option.)
    env: loadEnv('test', process.cwd(), ''),
    setupFiles: ['./test/setup/db-path.js'],   // per-worker unique DB_PATH, before app/db import
    pool: 'forks', // the default since Vitest 2 — one child process per test file, so per-file env stays isolated
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['src/**/*.d.ts', 'src/app.js'], // app.js is wiring — asserted via supertest, not line %
      thresholds: {
        // Hard floors — CI fails below. Auth + tx code should be near-total.
        lines: 80, functions: 80, branches: 75,
        'src/db/worker.js': { lines: 100, functions: 100, branches: 90 },
        'src/auth/**': { lines: 95, functions: 95, branches: 90 },
      },
    },
  },
});
```

```jsonc
// package.json (scripts) — no --mode flag needed: Vitest's default mode is already 'test',
// and the config pins loadEnv('test', …) regardless of CLI flags.
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:security": "vitest run test/security",
    "test:ci": "vitest run --coverage --reporter=dot"
  }
}
```

**Rules of the road:** wire `test:ci` into the pipeline as a required check; a red security test blocks merge, no override. When you add a transactional endpoint, you add its 5-pass cases in the same PR — the checklist in [transaction-endpoints](transaction-endpoints.md) is not "done" until the matching `test/security/*.test.js` is green. Never point tests at a real `DB_PATH`; the per-worker temp-DB setup above is the only sanctioned path.
