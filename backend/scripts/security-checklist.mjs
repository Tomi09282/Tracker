/**
 * The pre-deploy security checklist, as a MEASUREMENT.
 *
 * ═══ WHY IT IS A SCRIPT AND NOT A DOCUMENT ═════════════════════════════════════════════════════
 *
 * A checklist in Markdown records what somebody believed on the day they wrote it. Every item in
 * this project's security baseline is a claim about the RUNNING system — "cookies are HttpOnly",
 * "the database is encrypted", "a cross-site write is refused" — and each one is either true right
 * now or it is not. So each is asked of the live server or the real files, and the answer is
 * printed.
 *
 * ═══ IT DECLARES ITS OWN COVERAGE ══════════════════════════════════════════════════════════════
 *
 * A clean result is a statement about coverage before it is a statement about the subject. Items
 * this script cannot decide are printed under NOT CHECKED with the reason and who does check them —
 * because the failure mode of a green checklist is somebody reading it as "everything is fine"
 * when it means "the eleven things I know how to ask were fine".
 *
 * It does not re-implement what the gates already enforce. `check:routes` owns auth-on-every-route,
 * rate-limits-on-writes and `.strict()` schemas; `verify:gates` owns whether those gates work.
 * Duplicating them here would be a second copy that eventually disagrees.
 *
 * Needs the server running. Run: npm run security:checklist
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:3000';
const API = `${BASE}/api/v1`;
const ROOT = path.join(import.meta.dirname, '..');
const REPO = path.join(ROOT, '..');

let pass = 0;
let fail = 0;
const notChecked = [];

const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};
const skip = (label, why, who) => notChecked.push({ label, why, who });

const raw = async (path_, init = {}) => {
  const r = await fetch((path_.startsWith('/api') ? BASE : API) + path_.replace(/^\/api\/v1/, ''), init);
  return r;
};

/*
 * ═══ ASK WHETHER THERE IS A SUBJECT AT ALL ═════════════════════════════════════════════════════
 *
 * Without this the first fetch throws ECONNREFUSED and the operator gets forty lines of Node stack
 * trace where they expected a checklist. Worse than unhelpful: a security check that ends in a
 * crash is one somebody re-runs later and forgets, rather than one that told them what to fix.
 */
{
  const alive = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false);
  if (!alive) {
    console.error(
      `\nSTOP  nothing is answering on ${BASE}.\n` +
        `      Every item below asks the RUNNING server a question, so with no server there is\n` +
        `      nothing to report — not even a clean bill of health.\n\n` +
        `      Start it with:  npm start\n`,
    );
    process.exit(1);
  }
}

console.log('\n═══ AUTH AND SESSION ═══════════════════════════════════════════════════════════\n');

/* ── cookies ─────────────────────────────────────────────────────────────────────────────────── */

{
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf': '1', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: 'user@tracker.local', password: 'TrackerDev123' }),
  });
  const cookies = r.headers.getSetCookie?.() ?? [];

  check('login issues cookies at all', cookies.length >= 2, `${cookies.length} cookie(s)`);
  check(
    'every auth cookie is HttpOnly',
    cookies.length > 0 && cookies.every((c) => /HttpOnly/i.test(c)),
    cookies.map((c) => c.split('=')[0]).join(', '),
  );
  check(
    'every auth cookie states SameSite explicitly',
    cookies.every((c) => /SameSite=/i.test(c)),
    cookies.map((c) => (c.match(/SameSite=(\w+)/i) ?? [])[1] ?? 'NONE STATED').join(', '),
  );

  const refresh = cookies.find((c) => /refresh/i.test(c));
  check(
    'the refresh cookie is Path-scoped to the auth endpoints',
    !!refresh && /Path=\/api\/v1\/auth/i.test(refresh),
    (refresh?.match(/Path=([^;]+)/i) ?? [])[1] ?? 'no refresh cookie found',
  );

  // Secure and the __Host-/__Secure- prefixes are a PRODUCTION property, and this runs against a
  // dev server on plain HTTP where the blueprint's documented fallback applies. Asserting them here
  // would either fail forever or be quietly relaxed until it asserted nothing.
  if (process.env.NODE_ENV === 'production') {
    check('cookies are Secure in production', cookies.every((c) => /Secure/i.test(c)));
    check(
      'and carry the __Host-/__Secure- prefixes',
      cookies.every((c) => /^__(Host|Secure)-/.test(c)),
      cookies.map((c) => c.split('=')[0]).join(', '),
    );
  } else {
    skip(
      'Secure + __Host-/__Secure- cookie prefixes',
      `NODE_ENV is ${process.env.NODE_ENV ?? 'unset'}, and over plain HTTP the blueprint's documented dev fallback applies`,
      'run this script against the production deployment',
    );
  }
}

/* ── CSRF, on a real state-changing route ────────────────────────────────────────────────────── */

{
  const attempt = (headers) =>
    fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ email: 'user@tracker.local', password: 'TrackerDev123' }),
    }).then((r) => r.status);

  check('a cross-site write is refused', (await attempt({ 'sec-fetch-site': 'cross-site', 'x-csrf': '1' })) === 403);
  check('a write with no X-CSRF header is refused', (await attempt({ 'sec-fetch-site': 'same-origin' })) === 403);
  check(
    'a write with the wrong content type is refused',
    (await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-csrf': '1', 'sec-fetch-site': 'same-origin' },
      body: 'email=x',
    }).then((r) => r.status)) >= 400,
  );
}

/* ── password hashing ────────────────────────────────────────────────────────────────────────── */

const db = await import('../src/db/index.js');
{
  const rows = await db.all('SELECT password_hash FROM users WHERE password_hash IS NOT NULL LIMIT 200');

  /*
   * ═══ PARSED BY NAME, BECAUSE THE FIRST VERSION READ THEM BY POSITION ═════════════════════════
   *
   * It matched `m=…,t=…,p=…` and the library writes `m=19456,p=1,t=2`. The order is not fixed by
   * the PHC string format, and this one is not the order the documentation example uses.
   *
   * The interesting part is not the wrong regex — it is what the wrong regex did to the assertion
   * BELOW it. Every match came back null, so the "below the floor" filter ran over nothing, found
   * nothing, and reported PASS. One assertion failed loudly while the one that actually checks the
   * cost parameters passed by measuring an empty list. So `every hash meets …` now also requires
   * that something was parsed at all.
   */
  const params = rows.map((r) => {
    const m = r.password_hash.match(/^\$argon2id\$v=19\$([^$]+)\$/);
    if (!m) return null;
    const kv = Object.fromEntries(m[1].split(',').map((p) => p.split('=').map((s) => s.trim())));
    return { m: +kv.m, t: +kv.t, p: +kv.p };
  });

  check('every stored hash is argon2id', params.every(Boolean), `${rows.length} hash(es) inspected`);
  check(
    'and none is bcrypt or anything else',
    !rows.some((r) => /^\$2[aby]\$|^\$6\$|^[a-f0-9]{32}$/.test(r.password_hash)),
  );
  const weak = params.filter((x) => !x || x.m < 19456 || x.t < 2 || x.p < 1);
  check(
    'every hash meets m=19456 / t=2 / p=1',
    params.length > 0 && weak.length === 0,
    weak.length
      ? `${weak.length} below the floor or unparsed`
      : params[0]
        ? `${params.length} inspected, e.g. m=${params[0].m} t=${params[0].t} p=${params[0].p}`
        : 'NOTHING PARSED — this assertion measured an empty list',
  );
}

console.log('\n═══ DATABASE ═══════════════════════════════════════════════════════════════════\n');

{
  const pragmas = Object.fromEntries(
    await Promise.all(
      ['journal_mode', 'synchronous', 'busy_timeout', 'foreign_keys'].map(async (p) => {
        const [row] = await db.all(`PRAGMA ${p}`);
        return [p, Object.values(row)[0]];
      }),
    ),
  );
  check('journal_mode = WAL', String(pragmas.journal_mode).toLowerCase() === 'wal', String(pragmas.journal_mode));
  check('synchronous = NORMAL (1)', Number(pragmas.synchronous) === 1, String(pragmas.synchronous));
  check('busy_timeout = 5000', Number(pragmas.busy_timeout) === 5000, String(pragmas.busy_timeout));
  check('foreign_keys = ON', Number(pragmas.foreign_keys) === 1, String(pragmas.foreign_keys));

  // Encryption, read from the FILE rather than from a config value that claims it. An unencrypted
  // SQLite database starts with the ASCII string `SQLite format 3`.
  const dbPath = process.env.DB_PATH ? path.resolve(ROOT, process.env.DB_PATH) : null;
  if (dbPath && fs.existsSync(dbPath)) {
    const header = fs.readFileSync(dbPath, { encoding: 'latin1', flag: 'r' }).slice(0, 15);
    check(
      'the database file is encrypted — no plaintext SQLite header',
      header !== 'SQLite format 3',
      header === 'SQLite format 3' ? 'PLAINTEXT' : 'no readable header',
    );
  } else {
    skip('database file encryption', `DB_PATH did not resolve to a file (${dbPath ?? 'unset'})`, 'set DB_PATH and re-run');
  }

  const [fk] = await db.all('PRAGMA foreign_key_check');
  check('no foreign key violations in the live data', fk === undefined, fk ? JSON.stringify(fk) : '');
}

console.log('\n═══ HEADERS ════════════════════════════════════════════════════════════════════\n');

{
  const r = await raw('/healthz');
  const h = (n) => r.headers.get(n);

  const csp = h('content-security-policy') ?? '';
  check('a Content-Security-Policy is sent', csp.length > 0);
  check("it has no 'unsafe-inline' anywhere", !/unsafe-inline/.test(csp), csp.match(/unsafe-\w+/g)?.join(' ') ?? '');
  check("it has no 'unsafe-eval'", !/unsafe-eval/.test(csp));
  check("frame-ancestors is 'none'", /frame-ancestors 'none'/.test(csp));
  check('object-src is none', /object-src 'none'/.test(csp));
  // The two the PWA depends on, which used to be implicit via default-src.
  check('worker-src and manifest-src are stated explicitly', /worker-src/.test(csp) && /manifest-src/.test(csp));

  check('X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff');
  check('Referrer-Policy is set', !!h('referrer-policy'), h('referrer-policy') ?? '');
  check('Permissions-Policy denies camera/mic/geo/payment', /camera=\(\)/.test(h('permissions-policy') ?? ''));
  check('the server does not announce itself', !h('x-powered-by'), h('x-powered-by') ?? 'absent');

  if (process.env.NODE_ENV === 'production') {
    check('HSTS is sent in production', !!h('strict-transport-security'), h('strict-transport-security') ?? '');
  } else {
    skip('HSTS', 'deliberately off outside production — it would pin a plain-HTTP dev host', 'the production deployment');
  }
}

console.log('\n═══ SECRETS ════════════════════════════════════════════════════════════════════\n');

{
  const gitignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  check('.env is gitignored', /^\.env$|^\*\*\/\.env$|^\.env\b/m.test(gitignore));
  check('backups/ is gitignored', /backups\//.test(gitignore));
  check('.env.example is committed', fs.existsSync(path.join(ROOT, '.env.example')));

  const example = fs.existsSync(path.join(ROOT, '.env.example'))
    ? fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')
    : '';
  const realKey = process.env.DB_KEY ?? process.env.DB_MASTER_KEY ?? '';
  check(
    '.env.example carries placeholders, not the real key',
    !realKey || !example.includes(realKey),
  );

  // What git actually TRACKS, which is the only question that matters for a secret.
  let tracked = '';
  try {
    tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' });
  } catch {
    /* not a git checkout */
  }
  check(
    'no .env file is tracked by git',
    !tracked.split('\n').some((f) => /(^|\/)\.env$/.test(f.trim())),
    tracked.split('\n').filter((f) => /(^|\/)\.env/.test(f)).join(' ') || 'none',
  );

  // An error response must not carry a stack trace or an SQL fragment.
  const boom = await fetch(`${API}/exercises/999999999`, { headers: { 'x-csrf': '1' } });
  const text = await boom.text();
  check(
    'an error response leaks no stack trace or SQL',
    !/\bat\s+\w+\s+\(|SQLITE_|node_modules|SELECT\s|\.js:\d+/.test(text),
    text.slice(0, 80),
  );
}

console.log('\n═══ RATE LIMITS ════════════════════════════════════════════════════════════════\n');

{
  /*
   * ═══ THIS ASKS THE SERVER, NOT THIS PROCESS ══════════════════════════════════════════════════
   *
   * The first version branched on `process.env.NODE_ENV` — the environment of the SCRIPT — to
   * decide whether the limiters were on. Then it reported:
   *
   *     FAIL  /login is rate limited  (still accepting after 40 attempts)
   *
   * and the finding was true of nothing. The script's env said `development`, so it ran the
   * assertion; the server answering on :3000 was a different process entirely, started earlier
   * with limiters disabled, because the one this session launched had never bound the port
   * (`EADDRINUSE`, retried behind its own supervisor). A checklist that reads its own environment
   * and reports on somebody else's is the same defect the rekey preconditions had.
   *
   * `standardHeaders: true` means a limited route ANSWERS with `RateLimit-*`. Absent headers is
   * the honest signal — no limiter ran — and it needs no endpoint that discloses the environment.
   *
   * It also does not hammer. Exhausting the real login limiter locks the operator out of their own
   * product for fifteen minutes, which is a poor thing for a pre-deploy check to do; the headers
   * state the policy without spending it.
   */
  const probe = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf': '1', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: 'nobody-checklist@tracker.local', password: 'wrong-password-here' }),
  });
  const limit = probe.headers.get('ratelimit-limit');
  const remaining = probe.headers.get('ratelimit-remaining');

  if (limit === null) {
    check(
      '/login is rate limited',
      false,
      'no RateLimit-* headers — no limiter ran. Either none is attached, or this server has them disabled (NODE_ENV=test). Check WHICH server is on :3000 before believing this.',
    );
  } else {
    check('/login is rate limited', Number(limit) > 0, `limit ${limit}, ${remaining} left in this window`);
    check(
      'and the limit is tight enough to matter',
      Number(limit) <= 20,
      `${limit} attempts per window`,
    );
  }

  {
    check(
      'and a failed login says nothing about whether the account exists',
      await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf': '1', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ email: 'user@tracker.local', password: 'definitely-wrong' }),
      })
        .then((r) => r.json())
        .then((j) => !/exist|unknown|found|password/i.test(JSON.stringify(j)))
        .catch(() => false),
    );
  }
}

/* ── the honest part ─────────────────────────────────────────────────────────────────────────── */

skip(
  'auth on every route, rate limits on every write, .strict() on every schema',
  'enforced statically on the whole route table, which is stronger than sampling it here',
  'npm run check:routes (and verify:gates proves that gate still fires)',
);
skip(
  'one worker transaction per logical write, guards inside the UPDATE',
  'a property of the source, not of a response',
  'npm run check:worker-tx / check:route-tx / check:body-writes',
);
skip(
  'admin writes reach the audit log and re-check the role in the DB',
  'same — a static property of the route table',
  'npm run check:admin-audit',
);
skip(
  'the encrypted backup restores and the key rotation works',
  'both are destructive-adjacent and run against scratch copies',
  'npm run restore:drill / verify:rekey',
);
skip(
  'anti-IDOR on every object-level read and write',
  'the ownership predicate is per-route; sampling it here would prove one route and imply all of them',
  'smoke covers the forged-id case per endpoint (572 assertions)',
);

console.log('\n═══ NOT CHECKED HERE ═══════════════════════════════════════════════════════════\n');
for (const s of notChecked) {
  console.log(`  ·  ${s.label}`);
  console.log(`     why: ${s.why}`);
  console.log(`     who: ${s.who}`);
}

await db.closePool();
console.log(`\nsecurity checklist: ${pass} passed, ${fail} failed, ${notChecked.length} deliberately not checked here`);
process.exit(fail ? 1 : 0);
