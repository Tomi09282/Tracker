/**
 * The payment webhook, driven through every failure mode.
 *
 * ═══ TWO LAYERS, TESTED SEPARATELY ═════════════════════════════════════════════════════════════
 *
 * The signature check is a pure function and is exercised directly — no server, no clock, no
 * database — so every branch can be reached deliberately rather than hoped for.
 *
 * The ROUTE is then exercised over HTTP, because the things that go wrong there are things a unit
 * test cannot see: the body arriving parsed instead of raw, the CSRF middleware intercepting a
 * caller that has no cookie, a replay being accepted because the claim was a SELECT.
 *
 * Run: npm run verify:webhook
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { verifyWebhook, parseSignatureHeader } from '../src/payments/signature.js';

const BASE = 'http://localhost:3000/api/v1';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? null;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

/* ── layer 1: the signature, every branch ────────────────────────────────────────────────────── */

const TEST_SECRET = 'whsec_probe_secret_value_0123456789';
const NOW = 1_700_000_000;
const body = Buffer.from(JSON.stringify({ id: 'evt_probe', type: 'customer.subscription.updated' }));

const sign = (rawBody, t, secret = TEST_SECRET) =>
  crypto.createHmac('sha256', secret).update(`${t}.`, 'utf8').update(rawBody).digest('hex');

const header = (t, sig) => `t=${t},v1=${sig}`;

console.log('── the signature check ──\n');

{
  const good = verifyWebhook({ header: header(NOW, sign(body, NOW)), rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check('a correctly signed event verifies', good.ok === true, good.reason ?? 'ok');
}

{
  // One byte of the body changed, signature untouched. This is the whole point of the mechanism.
  const tampered = Buffer.from(JSON.stringify({ id: 'evt_probe', type: 'customer.subscription.deleted' }));
  const r = verifyWebhook({ header: header(NOW, sign(body, NOW)), rawBody: tampered, secret: TEST_SECRET, nowSeconds: NOW });
  check('a tampered body is refused', r.ok === false && r.reason === 'bad_signature', r.reason);
}

{
  const r = verifyWebhook({ header: header(NOW, sign(body, NOW, 'whsec_the_wrong_secret_00000000')), rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check('a signature under the wrong secret is refused', r.ok === false && r.reason === 'bad_signature', r.reason);
}

{
  // Replay of a genuine, correctly signed request from six minutes ago.
  const old = NOW - 400;
  const r = verifyWebhook({ header: header(old, sign(body, old)), rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check('a valid signature from outside the window is refused', r.ok === false && r.reason === 'too_old', r.reason);
}

{
  /*
   * The direction that gets forgotten. `now - t <= tolerance` alone accepts a timestamp from next
   * year, which would make a leaked signed payload replayable forever. The attacker chooses `t`.
   */
  const future = NOW + 400;
  const r = verifyWebhook({ header: header(future, sign(body, future)), rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check('and so is one from the FUTURE — the attacker chooses t', r.ok === false && r.reason === 'too_far_future', r.reason);
}

{
  const edge = NOW - 300;
  const r = verifyWebhook({ header: header(edge, sign(body, edge)), rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check('exactly at the tolerance is still accepted', r.ok === true, r.reason ?? 'ok');
}

{
  const r = verifyWebhook({ header: header(NOW, sign(body, NOW)), rawBody: body, secret: null, nowSeconds: NOW });
  check('with NO secret configured it refuses rather than waving it through', r.ok === false && r.reason === 'no_secret_configured', r.reason);
}

{
  const r = verifyWebhook({ header: header(NOW, sign(body, NOW)), rawBody: body.toString('utf8'), secret: TEST_SECRET, nowSeconds: NOW });
  check('a STRING body is refused — a parsed body cannot be verified', r.ok === false && r.reason === 'body_not_raw', r.reason);
}

for (const [label, h] of [
  ['no header at all', undefined],
  ['an empty header', ''],
  ['no timestamp', `v1=${sign(body, NOW)}`],
  ['no signature', `t=${NOW}`],
  ['junk', 'not-a-signature-header'],
  ['a signature of the wrong length', `t=${NOW},v1=abc123`],
]) {
  const r = verifyWebhook({ header: h, rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check(`${label} is refused`, r.ok === false && r.reason === 'malformed_header', r.reason);
}

{
  // Secret rotation sends two v1 values; either matching is a full-strength HMAC.
  const h = `t=${NOW},v1=${sign(body, NOW, 'whsec_old_secret_000000000000000')},v1=${sign(body, NOW)}`;
  const r = verifyWebhook({ header: h, rawBody: body, secret: TEST_SECRET, nowSeconds: NOW });
  check('during a secret rotation, either v1 matching is enough', r.ok === true, r.reason ?? 'ok');
}

{
  const p = parseSignatureHeader(`t=${NOW},v1=${'a'.repeat(64)}`);
  check('the header parser returns the timestamp as a number', p?.timestamp === NOW, String(p?.timestamp));
  const huge = parseSignatureHeader(`t=${NOW},` + `v1=${'a'.repeat(64)},`.repeat(500));
  check('an absurdly long header is refused rather than parsed', huge === null);
}

/* ── layer 2: the route ──────────────────────────────────────────────────────────────────────── */

console.log('\n── the route ──\n');

const alive = await fetch('http://localhost:3000/healthz').then((r) => r.ok).catch(() => false);
if (!alive) {
  console.log('\nSTOP  no server on :3000 — the route half cannot be tested. Start it with npm start.');
  console.log(`\nwebhook: ${pass} passed, ${fail} failed, the route half NOT TESTED`);
  process.exit(2);
}

const post = async (rawBody, headers = {}) => {
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  });
  let json = null;
  try {
    json = await r.json();
  } catch { /* a bare 400 has no body, which is deliberate */ }
  return { status: r.status, json };
};

{
  const r = await post(body, { 'stripe-signature': 'garbage' });
  check('an unsigned request is refused', r.status === 400, `status ${r.status}`);
  check('and the refusal carries NO body — nothing for a forger to tune against', r.json === null, JSON.stringify(r.json));
}

{
  // No X-CSRF, no Sec-Fetch-Site, no cookie — exactly what Stripe sends. If the route were below
  // csrfProtection this would be a 403, and every real event would be lost.
  const r = await post(body, { 'stripe-signature': 'garbage' });
  check('CSRF does not intercept it — a 403 here would mean every real event is dropped', r.status !== 403, `status ${r.status}`);
}

if (!SECRET) {
  console.log('\nnote: STRIPE_WEBHOOK_SECRET is not set, so the ACCEPTED path cannot be driven over HTTP.');
  console.log('      The refusal path above is fully covered, and layer 1 covers acceptance.');
} else {
  const eventId = `evt_probe${Date.now()}`;
  const payload = Buffer.from(JSON.stringify({ id: eventId, type: 'customer.subscription.updated' }));
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.`, 'utf8').update(payload).digest('hex');

  const first = await post(payload, { 'stripe-signature': `t=${t},v1=${sig}` });
  check('a correctly signed event is accepted', first.status === 200 && first.json?.received === true, `status ${first.status}`);

  /*
   * The same bytes again. Stripe retries when a response is slow — documented behaviour, not an
   * edge case — so this is the common path, not the attack.
   */
  const replay = await post(payload, { 'stripe-signature': `t=${t},v1=${sig}` });
  check(
    'an identical replay is recognised, not processed twice',
    replay.status === 200 && replay.json?.replayed === true,
    `status ${replay.status} ${JSON.stringify(replay.json)}`,
  );

  // 200 and not 400 on a replay: a 400 makes the sender retry something that already happened.
  check('and it answers 200 so the sender stops retrying', replay.status === 200, `status ${replay.status}`);

  const db = await import('../src/db/index.js');
  const rows = await db.all('SELECT COUNT(*) AS n FROM processor_events WHERE event_id = ?', [eventId]);
  check('exactly ONE row exists for the event', rows[0].n === 1, `${rows[0].n} row(s)`);
  await db.run('DELETE FROM processor_events WHERE event_id = ?', [eventId]);
  await db.closePool();
  // One tick before exiting: closing the pool and calling process.exit in the same breath races
  // Piscina teardown and trips a libuv assertion on Windows. Same fix as verify-gdpr.
  await new Promise((r) => setTimeout(r, 50));
}

console.log(`\nwebhook: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
