/**
 * verify-030 — the premium theme packs are off sale for good, and nothing that already happened moved.
 *
 * ═══ WHAT THIS HAS TO PROVE ════════════════════════════════════════════════════════════════════
 *
 * Migration 030 delists the two store items (Aurora, Ember) and retires their theme packs, with no
 * compensation (owner ruling 2026-10-17). It is only worth having if it holds on a database that
 * ALREADY has a purchase in it, so the run builds one:
 *
 *   before     — a throwaway encrypted database migrated to 029 by the same files, with a member who
 *                was credited, bought Aurora and wears it: a receipt, a debit, an entitlement, an
 *                audit row and a theme preference, every one written the way 019 requires;
 *   migrate    — the real server boots on that file and applies 030 through its own runner;
 *   history    — every coin row (receipts, ledger, entitlements, wallets, audit) and the theme
 *                preference are byte-identical to the "before" snapshot; the balance did not move;
 *   the store  — GET /coins/store lists nothing; a purchase of Ember with enough coins is 404 and
 *                charges nothing; buying Aurora again is the same 404 (not "already owned");
 *   the reads  — the statement still shows the old debit, the entitlement list still shows the grant;
 *   themes     — the roster no longer offers either pack; applying one is 404 even for the owner;
 *                a free pack still applies;
 *   the schema — a direct receipt INSERT is refused, relisting is refused, a NEW live item granting
 *                a retired pack is refused, re-activating a retired pack is refused; an unrelated
 *                new item can still be listed and bought (the store is not frozen, only the packs).
 *
 * ═══ HERMETIC ══════════════════════════════════════════════════════════════════════════════════
 *
 * A throwaway encrypted database in the OS temp directory and a throwaway server on a random port,
 * both torn down at the end. Every secret the run needs (database key, salt, JWT key, the fixture
 * password) is generated here with `crypto.randomBytes`, lives only in this process and its child,
 * and is never printed. No `.env` is read for anything this script sets; the dev database is never
 * opened. The "before" database is written by this script directly (it is a fixture, built before
 * any server exists); everything after the boot goes through the server or the worker-pool facade.
 *
 * Run: npm run verify:030
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import argon2 from 'argon2';
import { deriveDbKeyHex } from '../src/lib/dbkey.js';

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-verify-030-'));
const port = 3500 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${port}`;
const DB_FILE = path.join(dir, 'verify-030.db');

// Set BEFORE the database facade is imported: `src/lib/env.js` validates process.env at import,
// and dotenv never overrides a variable that is already set.
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: String(port),
  DB_PATH: DB_FILE,
  DB_MASTER_KEY: randomBytes(32).toString('hex'),
  DB_KEY_SALT: randomBytes(16).toString('hex'),
  JWT_SECRET: randomBytes(32).toString('base64url'),
  JWT_KID: 'verify-030',
  LOG_LEVEL: 'warn',
  CORS_ALLOWED_ORIGINS: '',
  DB_POOL_THREADS: '2',
});
for (const k of ['JWT_SECRET_PREV', 'JWT_KID_PREV', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k];

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

/* ── before: a 029 database with a real purchase in it ──────────────────────────────────────── */

const MIGRATIONS = path.resolve('src/db/migrations');
const files = readdirSync(MIGRATIONS).filter((n) => /^\d+_.*\.sql$/.test(n)).sort();
check('migration 030 exists', files.some((n) => n.startsWith('030_')), files.at(-1));

const password = randomBytes(18).toString('base64url');
const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const stamp = Date.now();
const memberEmail = `verify-030-member-${stamp}@example.com`;

const COIN_TABLES = {
  coin_purchases: 'SELECT * FROM coin_purchases ORDER BY id',
  coin_ledger: 'SELECT * FROM coin_ledger ORDER BY id',
  coin_entitlements: 'SELECT * FROM coin_entitlements ORDER BY id',
  coin_wallets: 'SELECT * FROM coin_wallets ORDER BY user_id',
  audit_log: 'SELECT * FROM audit_log ORDER BY id',
  user_theme_prefs: 'SELECT * FROM user_theme_prefs ORDER BY user_id',
};

let before = {};
let fixture = {};
{
  const conn = new Database(DB_FILE);
  // The derived key is hex produced by scrypt here, never input; pragma cannot be parameterised.
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  // The runner's own bookkeeping, reproduced: its ledger of applied versions and the max mark.
  // Not every file ends with its own `PRAGMA user_version` (029 does not), which is exactly why
  // the runner keeps a ledger; without one the boot would re-run 029 against a schema that has it.
  conn.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))');
  const record = conn.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
  for (const f of files) {
    const v = Number.parseInt(f, 10);
    if (v >= 30) continue;
    conn.transaction(() => {
      conn.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
      record.run(v);
    })();
  }
  conn.pragma('user_version = 29');
  const mark = conn.pragma('user_version', { simple: true });
  check('the "before" database stands at 029', mark === 29, `user_version ${mark}`);

  const ins = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);

  const admin = Number(ins('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', `verify-030-admin-${stamp}@example.com`, hash, 'admin').lastInsertRowid);
  const member = Number(ins('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', memberEmail, hash, 'user').lastInsertRowid);
  const aurora = one(`SELECT id, price_minor FROM coin_store_items WHERE sku = 'theme.aurora' AND active = 1 AND delisted_at IS NULL`);
  const ember = one(`SELECT id, price_minor FROM coin_store_items WHERE sku = 'theme.ember' AND active = 1 AND delisted_at IS NULL`);
  check('before 030 both packs are on sale', Boolean(aurora && ember), `aurora ${aurora?.id}, ember ${ember?.id}`);

  const write = conn.transaction(() => {
    // Enough for BOTH packs, so the later Ember refusal cannot be the funds guard answering.
    ins(
      `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, idempotency_key, actor_user_id, request_id, note)
       VALUES (?, ?, 'admin.credit', ?, ?, 'verify-030', 'fixture credit')`,
      member, aurora.price_minor + ember.price_minor + 1000, 'verify030credit', admin,
    );
    const purchaseId = Number(ins(
      `INSERT INTO coin_purchases (user_id, item_id, sku_snapshot, title_snapshot, entitlement_key,
                                   price_minor_snapshot, request_id)
       SELECT ?, i.id, i.sku, i.title, i.entitlement_key, i.price_minor, 'verify-030'
         FROM coin_store_items i WHERE i.id = ?`,
      member, aurora.id,
    ).lastInsertRowid);
    ins(
      `INSERT INTO coin_ledger (user_id, amount_minor, reason_key, ref_type, ref_id, idempotency_key,
                                actor_user_id, request_id)
       SELECT p.user_id, -p.price_minor_snapshot, 'store.purchase', 'coin_purchase', p.id, ?, p.user_id, p.request_id
         FROM coin_purchases p WHERE p.id = ?`,
      'verify030buy', purchaseId,
    );
    ins(
      `INSERT INTO coin_entitlements (user_id, item_id, purchase_id, entitlement_key)
       SELECT p.user_id, p.item_id, p.id, p.entitlement_key FROM coin_purchases p WHERE p.id = ?`,
      purchaseId,
    );
    ins(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, detail, request_id, ip)
       VALUES (?, 'coin.store.purchase', 'coin_purchase', ?, '{}', 'verify-030', NULL)`,
      member, purchaseId,
    );
    ins(`INSERT INTO user_theme_prefs (user_id, pack) VALUES (?, 'aurora')`, member);
    return purchaseId;
  });
  const purchaseId = write();
  fixture = { member, admin, aurora, ember, purchaseId, balance: one('SELECT balance_minor AS b FROM coin_wallets WHERE user_id = ?', member).b };
  check('the fixture member bought Aurora and wears it', one('SELECT pack FROM user_theme_prefs WHERE user_id = ?', member)?.pack === 'aurora', `balance ${fixture.balance}`);

  for (const [t, sql] of Object.entries(COIN_TABLES)) before[t] = JSON.stringify(conn.prepare(sql).all());
  conn.close();
}

/* ── migrate: the real server boots on that file ────────────────────────────────────────────── */

const server = spawn(process.execPath, ['server.js'], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
let serverErr = '';
server.stderr.on('data', (c) => {
  serverErr += c.toString();
});

let db = null;
const finish = async (code) => {
  try {
    await db?.closePool();
  } catch {
    /* the pool is going away either way */
  }
  server.kill('SIGTERM');
  setTimeout(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the OS reclaims the temp dir either way */
    }
    process.exit(code);
  }, 500);
};

const deadline = Date.now() + 30_000;
let up = false;
while (Date.now() < deadline) {
  try {
    if ((await fetch(`${BASE}/readyz`)).status === 200) {
      up = true;
      break;
    }
  } catch {
    /* not listening yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}
if (!up) {
  // The server's stderr can only hold what the server logs; the env validator names variables,
  // never their values.
  console.error(`verify-030: server never became ready on :${port}\n${serverErr.slice(-2000)}`);
  await finish(1);
} else {
  try {
    await run();
  } catch (err) {
    check('the run completed', false, String(err?.message ?? err).slice(0, 200));
  }
  console.log(`\nverify-030: ${pass} passed, ${fail} failed`);
  await finish(fail === 0 ? 0 : 1);
}

async function run() {
  db = await import('../src/db/index.js');
  const { member, aurora, ember, purchaseId } = fixture;

  /** An attempt that MUST be refused. Succeeding is the failure. */
  const refused = async (label, fn, expect) => {
    try {
      await fn();
      check(label, false, 'THE WRITE WAS ACCEPTED');
    } catch (e) {
      const msg = String(e?.message ?? e);
      check(label, !expect || msg.includes(expect), msg.slice(0, 88));
    }
  };

  /* ── the migration ran, and history did not move ──────────────────────────────────────────── */

  const version = await db.get('PRAGMA user_version');
  const ledgerRow = await db.get('SELECT version FROM schema_migrations WHERE version = 30');
  check('the server applied 030 through its own runner', version?.user_version === 30 && ledgerRow?.version === 30, `user_version ${version?.user_version}`);

  // BEFORE any request writes (a login writes refresh tokens and may audit), so a difference here
  // can only have come from the migration.
  for (const [t, sql] of Object.entries(COIN_TABLES)) {
    const now = JSON.stringify(await db.all(sql));
    check(`history: ${t} is byte-identical after 030`, now === before[t], now === before[t] ? `${JSON.parse(now).length} rows` : 'DIFFERS');
  }

  const items = await db.all(
    `SELECT sku, entitlement_key AS ek, active, delisted_at AS delistedAt, price_minor AS price
       FROM coin_store_items WHERE sku IN ('theme.aurora', 'theme.ember') ORDER BY sku`,
  );
  check(
    'both items are delisted, identity and price intact',
    items.length === 2 && items.every((i) => i.active === 0 && Number.isInteger(i.delistedAt) && i.ek === i.sku && i.price === aurora.price_minor),
    JSON.stringify(items),
  );
  const packs = await db.all('SELECT key, active FROM theme_packs ORDER BY sort_order');
  const premium = packs.filter((p) => p.key === 'aurora' || p.key === 'ember');
  const free = packs.filter((p) => p.key !== 'aurora' && p.key !== 'ember');
  check('the two premium packs are retired, the free five are not', premium.length === 2 && premium.every((p) => p.active === 0) && free.length === 5 && free.every((p) => p.active === 1), JSON.stringify(packs));

  /* ── HTTP, as the member who bought Aurora ──────────────────────────────────────────────────── */

  const jar = new Map();
  const call = async (p, { method = 'GET', body } = {}) => {
    const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF'] = '1';
    const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const value = pair.slice(i + 1).trim();
      if (value === '') jar.delete(pair.slice(0, i).trim());
      else jar.set(pair.slice(0, i).trim(), value);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* not every response carries a body */
    }
    return { res, json };
  };

  const login = await call('/api/v1/auth/login', { method: 'POST', body: { email: memberEmail, password } });
  check('the member signs in', login.res.status === 200, `status ${login.res.status}`);

  {
    const { res, json } = await call('/api/v1/coins/store');
    check('GET /coins/store lists nothing', res.status === 200 && Array.isArray(json?.items) && json.items.length === 0, `status ${res.status}, ${json?.items?.length} items`);
  }
  const countLedger = async () => (await db.get('SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ?', [member])).n;
  const ledgerBefore = await countLedger();
  {
    const { res } = await call(`/api/v1/coins/store/${ember.id}/purchase`, {
      method: 'POST', body: { idempotency_key: 'verify030ember', expected_price_minor: ember.price_minor },
    });
    const wallet = await call('/api/v1/coins/wallet');
    check(
      'FORGE: buying Ember with enough coins -> 404, nothing charged',
      res.status === 404 && wallet.json?.balanceMinor === fixture.balance && (await countLedger()) === ledgerBefore,
      `status ${res.status}, balance ${wallet.json?.balanceMinor} (was ${fixture.balance})`,
    );
  }
  {
    const { res } = await call(`/api/v1/coins/store/${aurora.id}/purchase`, {
      method: 'POST', body: { idempotency_key: 'verify030again', expected_price_minor: aurora.price_minor },
    });
    check('buying the owned Aurora again -> the same 404 (a retired item is simply not for sale)', res.status === 404, `status ${res.status}`);
  }
  {
    const { json } = await call('/api/v1/coins/ledger');
    const debit = (json?.entries ?? []).find((e) => e.amountMinor === -aurora.price_minor);
    check('the statement still shows the old Aurora debit', Boolean(debit), `${json?.entries?.length} entries`);
  }
  {
    const { json } = await call('/api/v1/coins/entitlements');
    check(
      'the entitlement list still shows the Aurora grant (history, not revoked)',
      (json?.entitlements ?? []).some((e) => e.entitlementKey === 'theme.aurora'),
      `${json?.entitlements?.length} entitlements`,
    );
  }
  {
    const { json } = await call('/api/v1/me/theme');
    const keys = (json?.packs ?? []).map((p) => p.key);
    check('the theme roster no longer offers either pack', keys.length === 5 && !keys.includes('aurora') && !keys.includes('ember'), keys.join(', '));
  }
  {
    const own = await call('/api/v1/me/theme', { method: 'PUT', body: { pack: 'aurora', accent: null, gradient: null } });
    const other = await call('/api/v1/me/theme', { method: 'PUT', body: { pack: 'ember', accent: null, gradient: null } });
    check('applying a retired pack -> 404, even for the member who bought it', own.res.status === 404 && other.res.status === 404, `${own.res.status} / ${other.res.status}`);
  }
  {
    const { res } = await call('/api/v1/me/theme', { method: 'PUT', body: { pack: 'midnight', accent: null, gradient: null } });
    const read = await call('/api/v1/me/theme');
    check('a free pack still applies', res.status === 200 && read.json?.theme?.pack === 'midnight', `status ${res.status}, pack ${read.json?.theme?.pack}`);
  }

  /* ── the schema keeps the sale closed for every writer, not only the route ──────────────────── */

  await refused(
    'SCHEMA: a receipt for a delisted item is refused',
    () => db.run(
      `INSERT INTO coin_purchases (user_id, item_id, sku_snapshot, title_snapshot, entitlement_key,
                                   price_minor_snapshot, request_id)
       VALUES (?, ?, 'theme.ember', 'Ember', 'theme.ember', ?, 'verify-030')`,
      [member, ember.id, ember.price_minor],
    ),
    'not the ones the item defines',
  );
  await refused(
    'SCHEMA: relisting a retired item is refused',
    () => db.run('UPDATE coin_store_items SET active = 1, delisted_at = NULL WHERE id = ?', [aurora.id]),
    'retired',
  );
  await refused(
    'SCHEMA: clearing only delisted_at on a retired item is refused while it is active',
    async () => {
      // Two steps a careless admin might take; the first is allowed (still delisted), the second
      // would make it live again and must not be.
      await db.run('UPDATE coin_store_items SET active = 1 WHERE id = ?', [ember.id]);
      await db.run('UPDATE coin_store_items SET delisted_at = NULL WHERE id = ?', [ember.id]);
    },
    'retired',
  );
  await db.run('UPDATE coin_store_items SET active = 0 WHERE id = ?', [ember.id]);
  await refused(
    'SCHEMA: a NEW live item granting a retired pack is refused',
    () => db.run(
      `INSERT INTO coin_store_items (sku, title, description, price_minor, entitlement_key)
       VALUES ('theme.aurora-v2', 'Aurora', NULL, 100, 'theme.aurora')`,
    ),
    'retired',
  );
  await refused(
    'SCHEMA: re-activating a retired pack is refused',
    () => db.run(`UPDATE theme_packs SET active = 1 WHERE key = 'aurora'`),
    'retired',
  );
  {
    const still = await db.get(`SELECT COUNT(*) AS n FROM coin_store_items WHERE active = 1 AND delisted_at IS NULL`);
    check('after every attempt the store still holds no live item', still.n === 0, `${still.n} live`);
  }

  /* ── the store itself is not frozen: an unrelated item can still be sold ─────────────────────── */

  {
    await db.run(
      `INSERT INTO coin_store_items (sku, title, description, price_minor, entitlement_key)
       VALUES ('probe.verify-030', 'Probe', NULL, 1000, 'probe.verify-030')`,
    );
    const { json } = await call('/api/v1/coins/store');
    const probe = (json?.items ?? []).find((i) => i.sku === 'probe.verify-030');
    check('an unrelated new item is listed', json?.items?.length === 1 && Boolean(probe), `${json?.items?.length} items`);
    const { res, json: bought } = await call(`/api/v1/coins/store/${probe?.id}/purchase`, {
      method: 'POST', body: { idempotency_key: 'verify030probe', expected_price_minor: 1000 },
    });
    check('and bought through the same transaction', res.status === 200 && bought?.balanceMinor === fixture.balance - 1000, `status ${res.status}, balance ${bought?.balanceMinor}`);
  }
  {
    const p = await db.get('SELECT id FROM coin_purchases WHERE id = ?', [purchaseId]);
    check('the original Aurora receipt is still there', p?.id === purchaseId, `purchase ${p?.id}`);
  }
}
