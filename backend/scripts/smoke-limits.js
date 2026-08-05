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

console.log(`\n${failed === 0 ? 'LIMITS OK' : 'LIMITS FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
