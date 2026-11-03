// scripts/smoke-limits.js — the dedicated rate-limit suite.
//
// The functional suite runs with NODE_ENV=test, where the limiters are skipped so one machine
// hitting every endpoint from one IP is not throttled into false failures. That skip is exactly
// the kind of convenience that quietly disables a control forever — so the limiters get their
// own run here, with NODE_ENV=development and the skip NOT active.
import 'dotenv/config';

const BASE = process.env.SMOKE_BASE ?? `http://localhost:${process.env.PORT ?? 3000}`;
const stamp = Date.now();

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' },
    body: JSON.stringify(body),
  });

// --- per-IP register limiter: 5 per 15 minutes -----------------------------------------------
{
  const statuses = [];
  for (let i = 0; i < 8; i += 1) {
    const res = await post('/api/v1/auth/register', {
      email: `rl-reg-${stamp}-${i}@example.com`,
      password: 'SmokePass123x',
    });
    statuses.push(res.status);
  }
  const first = statuses.slice(0, 5);
  const rest = statuses.slice(5);
  check('register: first 5 accepted', first.every((s) => s === 201), first.join(','));
  check('register: 6th onward -> 429', rest.every((s) => s === 429), rest.join(','));
}

// --- per-IP login limiter: 10 per 15 minutes -------------------------------------------------
{
  const statuses = [];
  for (let i = 0; i < 13; i += 1) {
    const res = await post('/api/v1/auth/login', {
      email: `rl-login-${stamp}@example.com`,
      password: 'WrongPassword123',
    });
    statuses.push(res.status);
  }
  check('login: budget of 10 enforced', statuses.slice(0, 10).every((s) => s === 401), statuses.slice(0, 10).join(','));
  check('login: over budget -> 429', statuses.slice(10).every((s) => s === 429), statuses.slice(10).join(','));
}

// --- the limiter must advertise itself so clients can back off ------------------------------
{
  const res = await post('/api/v1/auth/login', { email: `rl-hdr-${stamp}@example.com`, password: 'WrongPassword123' });
  const hasStandard = res.headers.has('ratelimit') || res.headers.has('ratelimit-limit');
  check('standard RateLimit headers present', hasStandard, [...res.headers.keys()].filter((k) => k.startsWith('ratelimit')).join(','));
}

// --- the account-admin writes carry the admin write budget: 60 per admin AND 120 per IP -------
//
// B-admin-accounts. The account writes share the budgets of admin/limiters.js with the older admin
// writes (role, disable, enable, moderation). The admin tokens are signed here from the throwaway
// database's own rows (login has its own 10-per-IP budget, which the blocks above use up), so this
// needs no password and no login. After the first call the POST is a replay (nothing to reset),
// which is exactly what makes it cheap to repeat: the limiter, not the transaction, is what stops
// call 61.
if (process.env.SMOKE_ACCOUNTS && process.env.DB_PATH) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { deriveDbKeyHex } = await import('../src/lib/dbkey.js');
  const { signAccessToken } = await import('../src/auth/tokens.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  const plant = (label, role) => {
    const id = Number(
      conn.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(`rl-adm-${label}-${stamp}@example.com`, 'x', role).lastInsertRowid,
    );
    return conn.prepare('SELECT id, role, session_version FROM users WHERE id = ?').get(id);
  };
  const victim = plant('victim', 'user');
  const admins = [plant('a1', 'admin'), plant('a2', 'admin')];
  const reset = async (admin) => {
    const token = await signAccessToken(admin);
    const res = await fetch(`${BASE}/api/v1/admin/users/${victim.id}/reset-lockout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF': '1', Cookie: `access=${token}` },
      body: '{}',
    });
    return res.status;
  };
  const first = [];
  for (let i = 0; i < 64; i += 1) first.push(await reset(admins[0]));
  check(
    'account writes: one admin gets 60 calls per 15 minutes, then 429',
    first.slice(0, 60).every((s) => s === 200) && first.slice(60).every((s) => s === 429),
    `${first.slice(58, 62).join(',')} ... ${first.slice(60).join(',')}`,
  );
  // 64 calls are on the per-IP counter and the second admin has used none of its own 60: the per-IP
  // budget (120) runs out after 56 more calls.
  const second = [];
  for (let i = 0; i < 60; i += 1) second.push(await reset(admins[1]));
  const okCount = second.filter((s) => s === 200).length;
  check(
    'account writes: the per-IP budget of 120 stops a second admin before its own 60 are used',
    okCount === 56 && second.slice(56).every((s) => s === 429),
    `${okCount} accepted, then ${second.slice(55, 58).join(',')}`,
  );
  conn.close();
}

console.log(`\n${failed === 0 ? 'LIMITS OK' : 'LIMITS FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
