/**
 * The admin grant step-up, exercised in both directions.
 *
 * Both directions matter equally. A step-up that refuses everything is as broken as one that
 * refuses nothing, and only one of those two failures is loud.
 */
import 'dotenv/config';

const BASE = 'http://localhost:3000/api/v1';
let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

let jar = '';
const call = async (path, init = {}) => {
  const headers = { 'x-csrf': '1', 'sec-fetch-site': 'same-origin', ...(jar ? { cookie: jar } : {}) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const m = new Map((jar ? jar.split('; ') : []).map((c) => [c.split('=')[0], c]));
    for (const c of set) m.set(c.split('=')[0], c.split(';')[0]);
    jar = [...m.values()].join('; ');
  }
  let json = null;
  try {
    json = await r.json();
  } catch { /* empty */ }
  return { status: r.status, json };
};

const db = await import('../src/db/index.js');
const PASSWORD = 'TrackerDev123';

await call('/auth/login', { method: 'POST', json: { email: 'admin@tracker.local', password: PASSWORD } });
const [target] = await db.all("SELECT id, role FROM users WHERE email = 'user@tracker.local'");
const originalRole = target.role;

/* ── the grant, which is what step-up is for ─────────────────────────────────────────────────── */

{
  const bare = await call(`/admin/users/${target.id}/role`, { method: 'POST', json: { role: 'admin' } });
  check(
    'granting admin with no password is refused, and says why',
    bare.status === 401 && bare.json?.reason === 'step_up_required',
    `${bare.status} ${bare.json?.reason ?? ''}`,
  );

  const wrong = await call(`/admin/users/${target.id}/role`, {
    method: 'POST',
    json: { role: 'admin', password: 'not-the-password' },
  });
  check('and with the wrong password', wrong.status === 401, `status ${wrong.status}`);

  const still = await db.all('SELECT role FROM users WHERE id = ?', [target.id]);
  check('the target has not been promoted by either attempt', still[0].role === originalRole, still[0].role);

  const ok = await call(`/admin/users/${target.id}/role`, {
    method: 'POST',
    json: { role: 'admin', password: PASSWORD },
  });
  check('with the right password it goes through', ok.status === 200, `status ${ok.status}`);
  const now = await db.all('SELECT role FROM users WHERE id = ?', [target.id]);
  check('and the target is an admin', now[0].role === 'admin', now[0].role);
}

/* ── and the paths that must NOT have grown a password prompt ────────────────────────────────── */

{
  const demote = await call(`/admin/users/${target.id}/role`, { method: 'POST', json: { role: 'user' } });
  check(
    'DEMOTION still needs no password — asking for one to take power away, when it is not asked to exercise it, gets the incentive backwards',
    demote.status === 200,
    `status ${demote.status}`,
  );

  const coach = await call(`/admin/users/${target.id}/role`, { method: 'POST', json: { role: 'coach' } });
  check('granting COACH still needs no password', coach.status === 200, `status ${coach.status}`);
}

/* ── put it back ─────────────────────────────────────────────────────────────────────────────── */

await call(`/admin/users/${target.id}/role`, { method: 'POST', json: { role: originalRole } });
const restored = await db.all('SELECT role FROM users WHERE id = ?', [target.id]);
check('the dev account is back to its original role', restored[0].role === originalRole, restored[0].role);

await db.closePool();
console.log(`\nstep-up: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
