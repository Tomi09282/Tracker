/**
 * The mandatory 5-pass adversarial checklist, on every payment endpoint.
 *
 *   forge  ·  replay  ·  race  ·  IDOR  ·  extremes
 *
 * ═══ ONE ENDPOINT, AND SAYING SO IS PART OF THE RESULT ═════════════════════════════════════════
 *
 * `POST /payments/webhook` is currently the whole payment surface. The Checkout Session route is
 * not built — it needs live credentials — so this file covers one endpoint and the count is stated
 * rather than implied. A checklist that reads "all payment endpoints pass" while covering one is
 * the failure mode this header exists to prevent; when the second endpoint lands it goes here, and
 * the number below has to change with it.
 *
 * The FORGE and REPLAY passes overlap `verify:webhook` deliberately. That file proves the
 * mechanism; this one asks the adversary's question — not "does the signature check work" but
 * "what can somebody who wants a free plan actually do".
 *
 * Needs the server and STRIPE_WEBHOOK_SECRET. Run: npm run verify:payments
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import * as db from '../src/db/index.js';

const BASE = 'http://localhost:3000/api/v1';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? null;
const ENDPOINTS = ['POST /payments/webhook'];

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const alive = await fetch('http://localhost:3000/healthz').then((r) => r.ok).catch(() => false);
if (!alive || !SECRET) {
  console.log(`\nSTOP  ${!alive ? 'no server on :3000' : 'STRIPE_WEBHOOK_SECRET is not set'} — nothing can be attacked.`);
  await db.closePool();
  await new Promise((r) => setTimeout(r, 50));
  process.exit(2);
}

const TAG = 'advprobe';
const HASH = '$argon2id$v=19$m=19456,p=1,t=2$c2VjdXJpdHktY2hlY2tsaXN0LWZpeHR1cmU$JmZgHMlPNVE0kbF3WvjcOKmfaJTFcOyvRakVRVOZfXo';

const sweep = async () => {
  for (const u of await db.all(`SELECT id FROM users WHERE email LIKE '${TAG}-%@example.com'`)) {
    await db.run('DELETE FROM coach_subscriptions WHERE coach_id = ?', [u.id]);
    await db.run('DELETE FROM users WHERE id = ?', [u.id]);
  }
  await db.run(`DELETE FROM processor_events WHERE event_id LIKE 'evt_${TAG}%'`);
  await db.run(`UPDATE subscription_tiers SET provider_price_id = NULL WHERE provider_price_id LIKE 'price_${TAG}%'`);
};
await sweep();

await db.run(`UPDATE subscription_tiers SET provider_price_id = 'price_${TAG}_pro' WHERE key = 'pro'`);

const mkCoach = async (label) => {
  const email = `${TAG}-${label}-${Date.now()}${Math.floor(Math.random() * 1e5)}@example.com`;
  await db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'coach')", [email, HASH]);
  return (await db.all('SELECT id FROM users WHERE email = ?', [email]))[0].id;
};

const victim = await mkCoach('victim');
const attacker = await mkCoach('attacker');

let seq = 0;
const build = (over = {}) => ({
  id: `evt_${TAG}${Date.now()}${seq++}`,
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: `sub_${TAG}`,
      customer: `cus_${TAG}`,
      status: 'active',
      current_period_end: 1_800_000_000,
      items: { data: [{ price: { id: `price_${TAG}_pro` } }] },
      ...over,
    },
  },
});

const signedPost = async (event, { at, secret = SECRET, mutateBody } = {}) => {
  let raw = Buffer.from(JSON.stringify(event));
  const t = at ?? Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.`, 'utf8').update(raw).digest('hex');
  if (mutateBody) raw = mutateBody(raw);
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body: raw,
  });
  let json = null;
  try {
    json = await r.json();
  } catch { /* bare 400 */ }
  return { status: r.status, json };
};

const tierOf = async (coachId) =>
  (await db.all('SELECT tier_key, status FROM coach_subscriptions WHERE coach_id = ?', [coachId]))[0] ?? null;

/* ── PASS 1: FORGE ───────────────────────────────────────────────────────────────────────────── */

console.log('\n═══ PASS 1 — FORGE ═══════════════════════════════════════════════\n');

{
  const e = build({ metadata: { coach_id: String(attacker) } });
  const raw = Buffer.from(JSON.stringify(e));
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
  check('an event with NO signature grants nothing', r.status === 400, `status ${r.status}`);
  check('and no subscription appeared', (await tierOf(attacker)) === null);
}

{
  const r = await signedPost(build({ metadata: { coach_id: String(attacker) } }), { secret: 'whsec_attackers_own_guess_000000' });
  check('a signature under a guessed secret grants nothing', r.status === 400, `status ${r.status}`);
  check('and still no subscription', (await tierOf(attacker)) === null);
}

{
  // Signed correctly, then one byte of the body changed after signing — the classic.
  const r = await signedPost(build({ metadata: { coach_id: String(victim) } }), {
    mutateBody: (b) => Buffer.from(b.toString('utf8').replace('"active"', '"trialing"')),
  });
  check('a body altered AFTER signing is refused', r.status === 400, `status ${r.status}`);
  check('and nothing was written', (await tierOf(victim)) === null);
}

/* ── PASS 2: REPLAY ──────────────────────────────────────────────────────────────────────────── */

console.log('\n═══ PASS 2 — REPLAY ══════════════════════════════════════════════\n');

const legit = build({ metadata: { coach_id: String(victim) } });
{
  const first = await signedPost(legit);
  check('a genuine event applies once', first.status === 200 && (await tierOf(victim))?.tier_key === 'pro', JSON.stringify(await tierOf(victim)));

  const again = await signedPost(legit);
  check('captured and resent verbatim, it is recognised as a replay', again.json?.replayed === true, JSON.stringify(again.json));

  const rows = await db.all('SELECT COUNT(*) AS n FROM processor_events WHERE event_id = ?', [legit.id]);
  check('and exactly ONE processor_events row exists', rows[0].n === 1, `${rows[0].n}`);
}

{
  // A capture replayed after the signature window. Even a perfect copy is dead.
  const old = Math.floor(Date.now() / 1000) - 3600;
  const r = await signedPost(build({ metadata: { coach_id: String(victim) } }), { at: old });
  check('a capture replayed an hour later is refused at the signature', r.status === 400, `status ${r.status}`);
}

/* ── PASS 3: RACE ────────────────────────────────────────────────────────────────────────────── */

console.log('\n═══ PASS 3 — RACE ════════════════════════════════════════════════\n');

{
  /*
   * The case the `INSERT OR IGNORE` claim exists for. A SELECT-then-INSERT would let both of these
   * pass the check and both apply — and a sender retrying while the first delivery is still in
   * flight is documented behaviour, not a contrived race.
   */
  const raced = build({ metadata: { coach_id: String(victim) } });
  const [a, b] = await Promise.all([signedPost(raced), signedPost(raced)]);

  const replayed = [a, b].filter((r) => r.json?.replayed === true).length;
  const applied = [a, b].filter((r) => r.json?.replayed !== true && r.status === 200).length;

  check('two concurrent deliveries: exactly one applies', applied === 1, `${applied} applied, ${replayed} replayed`);
  check('and the other is told it is a replay', replayed === 1, `${replayed}`);

  const rows = await db.all('SELECT COUNT(*) AS n FROM processor_events WHERE event_id = ?', [raced.id]);
  check('one row, not two', rows[0].n === 1, `${rows[0].n}`);
}

{
  // Two DIFFERENT events for the same coach, fired together. Both are legitimate; the row must end
  // in one of the two states and not in a torn mix of both.
  const up = build({ metadata: { coach_id: String(victim) }, status: 'active' });
  const down = build({ metadata: { coach_id: String(victim) }, status: 'past_due' });
  await Promise.all([signedPost(up), signedPost(down)]);
  const s = await tierOf(victim);
  check(
    'two different concurrent events leave ONE coherent state',
    s !== null && ['active', 'past_due'].includes(s.status),
    JSON.stringify(s),
  );
}

/* ── PASS 4: IDOR ────────────────────────────────────────────────────────────────────────────── */

console.log('\n═══ PASS 4 — IDOR ════════════════════════════════════════════════\n');

{
  /*
   * The metadata hint is how a brand-new subscription finds its coach, and it is therefore the one
   * field that names an account. If it could override an EXISTING binding, anybody able to
   * influence a Checkout Session's metadata could redirect somebody else's paid subscription onto
   * their own account.
   *
   * `sub_advprobe` already belongs to the victim from PASS 2. The attacker now claims it.
   */
  const before = await tierOf(attacker);
  const r = await signedPost(build({ metadata: { coach_id: String(attacker) } }));
  const after = await tierOf(attacker);

  check('a hint naming somebody else does not move an existing subscription', r.status === 200, `status ${r.status}`);
  check(
    'the attacker gained nothing',
    JSON.stringify(before) === JSON.stringify(after) && after === null,
    JSON.stringify(after),
  );
  check("and the victim's subscription is intact", (await tierOf(victim))?.tier_key === 'pro', JSON.stringify(await tierOf(victim)));
}

{
  // A hint pointing at a plain user, not a coach. Nothing should bind.
  const email = `${TAG}-plainuser-${Date.now()}@example.com`;
  await db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')", [email, HASH]);
  const plain = (await db.all('SELECT id FROM users WHERE email = ?', [email]))[0].id;

  await signedPost(build({ id: 'sub_idor_plain', customer: 'cus_idor_plain', metadata: { coach_id: String(plain) } }));
  const bound = await db.all('SELECT COUNT(*) AS n FROM coach_subscriptions WHERE coach_id = ?', [plain]);
  check('a hint naming a non-coach binds nothing', bound[0].n === 0, `${bound[0].n} row(s)`);
  await db.run('DELETE FROM users WHERE id = ?', [plain]);
}

{
  const r = await signedPost(build({ id: 'sub_idor_nobody', customer: 'cus_idor_nobody', metadata: {} }));
  const rows = await db.all("SELECT COUNT(*) AS n FROM coach_subscriptions WHERE provider_subscription_id = 'sub_idor_nobody'");
  check('an event that resolves to nobody creates no row', rows[0].n === 0, `${rows[0].n}`);
  check('and is still acknowledged, because it WAS received', r.status === 200, `status ${r.status}`);
}

/* ── PASS 5: EXTREMES ────────────────────────────────────────────────────────────────────────── */

console.log('\n═══ PASS 5 — EXTREMES ════════════════════════════════════════════\n');

{
  const t = Math.floor(Date.now() / 1000);
  const big = Buffer.alloc(2 * 1024 * 1024, 0x41);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.`, 'utf8').update(big).digest('hex');
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body: big,
  }).catch(() => ({ status: 0 }));
  check('a 2 MB body is refused by the cap, not by a crash', r.status >= 400 && r.status < 500, `status ${r.status}`);
}

for (const [label, body] of [
  ['an empty body', Buffer.alloc(0)],
  ['a body that is not JSON', Buffer.from('not json at all')],
  ['a JSON array instead of an object', Buffer.from('[]')],
  ['a null literal', Buffer.from('null')],
]) {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.`, 'utf8').update(body).digest('hex');
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body,
  });
  check(`${label} is refused without a 500`, r.status >= 400 && r.status < 500, `status ${r.status}`);
}

{
  /*
   * ═══ DEEP NESTING: THE PROPERTY IS "NO 5xx AND STILL ALIVE", NOT "REFUSED" ═════════════════
   *
   * The first version of this case demanded a 4xx and reported a failure at 200. That was my
   * expectation being wrong, not the product: the payload parses, carries a valid `evt_` id and a
   * handled type, and `intentFrom` finds no subscription object in it — so the correct outcome is
   * exactly what happened, recorded and no action taken.
   *
   * What deep nesting actually threatens is `JSON.parse` blowing the stack, which would be a 500 or
   * a dead worker. So the assertion is that, and the depth is raised from a trivial 60 to something
   * that genuinely stresses the parser. The health check afterwards is the half that matters: a
   * crashed process answers nothing.
   */
  const depth = 5000;
  const body = Buffer.from(
    `{"id":"evt_deep","type":"customer.subscription.updated","data":${'{"object":'.repeat(depth)}{}${'}'.repeat(depth)}}`,
  );
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.`, 'utf8').update(body).digest('hex');
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body,
  }).catch(() => ({ status: 0 }));

  check(`JSON nested ${depth} deep does not produce a 5xx`, r.status !== 0 && r.status < 500, `status ${r.status}`);
  const stillUp = await fetch('http://localhost:3000/healthz').then((x) => x.ok).catch(() => false);
  check('and the server is still answering afterwards', stillUp === true);
  await db.run("DELETE FROM processor_events WHERE event_id = 'evt_deep'");
}

{
  // Absurd but well-formed values. None may reach the database as-is or throw.
  const r = await signedPost(
    build({
      id: 'sub_extreme',
      customer: 'cus_extreme',
      current_period_end: Number.MAX_SAFE_INTEGER,
      metadata: { coach_id: '9'.repeat(30) },
    }),
  );
  check('an out-of-range coach_id hint is dropped, not queried with', r.status === 200, `status ${r.status}`);
  const rows = await db.all("SELECT COUNT(*) AS n FROM coach_subscriptions WHERE provider_subscription_id = 'sub_extreme'");
  check('and it bound nothing', rows[0].n === 0, `${rows[0].n}`);
}

{
  const r = await signedPost(build({ status: 'a'.repeat(500) }));
  check('an absurdly long status does not reach the CHECK constraint as a 500', r.status === 200, `status ${r.status}`);
}

/* ── coverage, stated ────────────────────────────────────────────────────────────────────────── */

await sweep();
const left = await db.all(`SELECT COUNT(*) AS n FROM users WHERE email LIKE '${TAG}-%@example.com'`);
check('the probe left nothing behind', left[0].n === 0, `${left[0].n} left`);

console.log(`\nendpoints covered: ${ENDPOINTS.length} — ${ENDPOINTS.join(', ')}`);
console.log('NOT covered: the Checkout Session route, which is not built (needs live credentials).');
console.log(`\npayments adversarial: ${pass} passed, ${fail} failed`);

await db.closePool();
await new Promise((r) => setTimeout(r, 50));
process.exit(fail ? 1 : 0);
