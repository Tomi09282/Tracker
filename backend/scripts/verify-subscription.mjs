/**
 * Subscription events, from a signed webhook all the way to a seat being refused.
 *
 * ═══ THE CHAIN THIS EXISTS TO PROVE ════════════════════════════════════════════════════════════
 *
 *   a signed event  →  a tier on `coach_subscriptions`  →  what the seat cap allows
 *
 * Each link is tested on its own elsewhere. This is the one that walks the whole thing, because
 * every link being correct in isolation is exactly the state in which a product ships a chain that
 * does not connect.
 *
 * Events are SIGNED and posted over HTTP rather than calling the transaction directly. The
 * shortcut would skip the raw-body handling, the replay claim and the route's outcome branching —
 * the three places this feature is most likely to be wrong.
 *
 * Needs the server running AND STRIPE_WEBHOOK_SECRET set. Run: npm run verify:subscription
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import * as db from '../src/db/index.js';
import { intentFrom, mapStatus } from '../src/payments/handlers.js';

const BASE = 'http://localhost:3000/api/v1';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? null;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

/* ── layer 1: the meaning of an event, with no server ────────────────────────────────────────── */

console.log('── what an event MEANS ──\n');

const subEvent = (over = {}) => ({
  id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_probe',
      customer: 'cus_probe',
      status: 'active',
      current_period_end: 1_800_000_000,
      items: { data: [{ price: { id: 'price_probe' } }] },
      ...over,
    },
  },
});

for (const [raw, expected] of [
  ['active', 'active'],
  ['trialing', 'trialing'],
  ['past_due', 'past_due'],
  ['canceled', 'canceled'],
  ['unpaid', 'canceled'],
  ['incomplete', 'canceled'],
  ['incomplete_expired', 'canceled'],
  ['paused', 'canceled'],
  ['a_status_stripe_adds_next_year', 'canceled'],
]) {
  check(`status ${raw} → ${expected}`, mapStatus(raw) === expected, mapStatus(raw));
}

{
  // `deleted` carries the subscription as it WAS. Trusting its status has shipped "deleted, and the
  // row still says active" in more than one product.
  const e = { ...subEvent({ status: 'active' }), type: 'customer.subscription.deleted' };
  check('a DELETED event is canceled whatever its payload says', intentFrom(e).status === 'canceled', intentFrom(e).status);
}

{
  const e = subEvent({ items: { data: [{ price: { id: 'price_a' } }, { price: { id: 'price_b' } }] } });
  check('a multi-item subscription is refused rather than guessed at', intentFrom(e).kind === 'unsupported', intentFrom(e).kind);
}

{
  const e = subEvent({ customer: { id: 'cus_expanded' } });
  check('an EXPANDED customer object still resolves', intentFrom(e).customerId === 'cus_expanded', intentFrom(e).customerId);
}

check('an invoice event has no intent', intentFrom({ type: 'invoice.paid', data: { object: {} } }) === null);
check('and neither does junk', intentFrom(null) === null && intentFrom({}) === null);

{
  const e = subEvent({ metadata: { coach_id: '  12; DROP TABLE users' } });
  check('a coach_id hint that is not a plain integer is dropped', intentFrom(e).coachIdHint === null, String(intentFrom(e).coachIdHint));
  const ok = subEvent({ metadata: { coach_id: '42' } });
  check('and a real one comes through as a number', intentFrom(ok).coachIdHint === 42, String(intentFrom(ok).coachIdHint));
}

/* ── layer 2: the whole chain ────────────────────────────────────────────────────────────────── */

console.log('\n── the chain: signed event → tier → seat ──\n');

const alive = await fetch('http://localhost:3000/healthz').then((r) => r.ok).catch(() => false);
if (!alive || !SECRET) {
  console.log(`\nSTOP  ${!alive ? 'no server on :3000' : 'STRIPE_WEBHOOK_SECRET is not set'} — the chain cannot be walked.`);
  console.log(`\nsubscription: ${pass} passed, ${fail} failed, the chain NOT TESTED`);
  await db.closePool();
  await new Promise((r) => setTimeout(r, 50));
  process.exit(2);
}

const TAG = 'subprobe';
const sweep = async () => {
  for (const u of await db.all(`SELECT id FROM users WHERE email LIKE '${TAG}-%@example.com'`)) {
    await db.run('DELETE FROM coach_subscriptions WHERE coach_id = ?', [u.id]);
    await db.run('DELETE FROM coach_clients WHERE coach_id = ? OR client_id = ?', [u.id, u.id]);
    await db.run('DELETE FROM users WHERE id = ?', [u.id]);
  }
  await db.run(`DELETE FROM processor_events WHERE event_id LIKE 'evt_${TAG}%'`);
  await db.run(`UPDATE subscription_tiers SET provider_price_id = NULL WHERE provider_price_id LIKE 'price_${TAG}%'`);
};
await sweep();

// Prices, as DATA — the whole point of 028. No deploy, no switch statement.
await db.run(`UPDATE subscription_tiers SET provider_price_id = 'price_${TAG}_starter' WHERE key = 'starter'`);
await db.run(`UPDATE subscription_tiers SET provider_price_id = 'price_${TAG}_pro' WHERE key = 'pro'`);

const HASH = '$argon2id$v=19$m=19456,p=1,t=2$c2VjdXJpdHktY2hlY2tsaXN0LWZpeHR1cmU$JmZgHMlPNVE0kbF3WvjcOKmfaJTFcOyvRakVRVOZfXo';
const email = `${TAG}-coach-${Date.now()}@example.com`;
await db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'coach')", [email, HASH]);
const coachId = (await db.all('SELECT id FROM users WHERE email = ?', [email]))[0].id;

let seq = 0;
const send = async (over, { at } = {}) => {
  const event = {
    id: `evt_${TAG}${Date.now()}${seq++}`,
    type: over.type ?? 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_${TAG}`,
        customer: `cus_${TAG}`,
        status: 'active',
        current_period_end: 1_800_000_000,
        items: { data: [{ price: { id: `price_${TAG}_starter` } }] },
        ...over.object,
      },
    },
  };
  const raw = Buffer.from(JSON.stringify(event));
  const t = at ?? Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${t}.`, 'utf8').update(raw).digest('hex');
  const r = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body: raw,
  });
  return r.status;
};

const state = async () =>
  (await db.all('SELECT tier_key, status, provider_event_at FROM coach_subscriptions WHERE coach_id = ?', [coachId]))[0] ?? null;

{
  check('the coach starts with no subscription row at all', (await state()) === null);

  const t0 = Math.floor(Date.now() / 1000) - 60;
  await send({ type: 'customer.subscription.created', object: { metadata: { coach_id: String(coachId) } } }, { at: t0 });
  const s = await state();
  check(
    'the FIRST event binds the coach through Checkout metadata and sets the tier',
    s?.tier_key === 'starter' && s?.status === 'active',
    JSON.stringify(s),
  );

  // Later events carry no metadata — resolution is by subscription id from here on.
  await send({ object: { items: { data: [{ price: { id: `price_${TAG}_pro` } }] } } });
  check('an upgrade with no metadata still resolves, by subscription id', (await state())?.tier_key === 'pro', (await state())?.tier_key);

  /*
   * ═══ THE OUT-OF-ORDER CASE, WHICH IS THE WHOLE REASON provider_event_at EXISTS ═════════════
   *
   * A retry of the OLD `starter` event arriving after the `pro` upgrade. Applying it would silently
   * downgrade a paying customer, and webhooks arriving out of order is documented behaviour rather
   * than an edge case.
   */
  /*
   * The price MUST be the real `{ id }` shape here. The first version wrote `price: 'price_…'` as a
   * bare string, so `items[0].price.id` was undefined, `priceId` came through null, and COALESCE
   * kept the existing tier — the assertion passed with the guard REMOVED, which is how it was
   * found. A malformed fixture is a green test about nothing.
   */
  const status = await send({ object: { items: { data: [{ price: { id: `price_${TAG}_starter` } }] } } }, { at: t0 - 10 });
  check('a stale event is accepted at the wire and DISCARDED at the state', status === 200, `status ${status}`);
  check('the tier did not move backwards', (await state())?.tier_key === 'pro', (await state())?.tier_key);
}

{
  const before = await state();
  await send({ object: { items: { data: [{ price: { id: 'price_that_no_tier_claims' } }] } } });
  const after = await state();
  check(
    'an unknown price changes NOTHING rather than inventing a tier',
    after.tier_key === before.tier_key && after.status === before.status,
    `${before.tier_key} → ${after.tier_key}`,
  );
}

{
  // A subscription nobody here owns. Recorded, not applied — and the route logs it at error level
  // because somebody may have paid and received nothing.
  const rows = await db.all('SELECT COUNT(*) AS n FROM coach_subscriptions');
  const status = await send({
    object: { id: 'sub_orphan_probe', customer: 'cus_orphan_probe', metadata: {} },
  });
  const after = await db.all('SELECT COUNT(*) AS n FROM coach_subscriptions');
  check('an unattributable event creates no subscription row', after[0].n === rows[0].n, `${rows[0].n} → ${after[0].n}`);
  check('and still answers 200, because the event WAS received', status === 200, `status ${status}`);
}

/* ── and the point of all of it: the seat cap follows ─────────────────────────────────────────── */

{
  // `pro` is 50. Fill to 4 so the difference between pro and free (3) is decidable either way.
  for (let i = 0; i < 4; i += 1) {
    const c = `${TAG}-client${i}-${Date.now()}@example.com`;
    await db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')", [c, HASH]);
    const id = (await db.all('SELECT id FROM users WHERE email = ?', [c]))[0].id;
    await db.run(
      `INSERT INTO coach_clients (coach_id, client_id, status, origin, accepted_at) VALUES (?, ?, 'active', 'team_code', unixepoch())`,
      [coachId, id],
    );
  }

  const digest = crypto.createHash('sha256').update(`SUB-${Date.now()}`).digest('hex');
  await db.run('INSERT INTO invite_codes (coach_id, code_hash, max_uses, uses) VALUES (?, ?, 50, 0)', [coachId, digest]);
  const newcomer = `${TAG}-newcomer-${Date.now()}@example.com`;
  await db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')", [newcomer, HASH]);
  const newcomerId = (await db.all('SELECT id FROM users WHERE email = ?', [newcomer]))[0].id;

  const onPro = await db.redeemInvite({ userId: newcomerId, digest, ip: null });
  check('on Pro, the fifth client is allowed', onPro.outcome === 'accepted', onPro.outcome);
  await db.run('DELETE FROM coach_clients WHERE coach_id = ? AND client_id = ?', [coachId, newcomerId]);

  // Now the card fails for good: Stripe sends `unpaid`, which this product reads as canceled.
  await send({ object: { status: 'unpaid', items: { data: [{ price: { id: `price_${TAG}_pro` } }] } } });
  check('an unpaid subscription reads as canceled', (await state())?.status === 'canceled', (await state())?.status);

  const afterUnpaid = await db.redeemInvite({ userId: newcomerId, digest, ip: null });
  check(
    'and the seat cap follows IMMEDIATELY — canceled resolves to free, which 4 clients exceed',
    afterUnpaid.outcome === 'seat_limit',
    afterUnpaid.outcome,
  );

  const stillThere = await db.all("SELECT COUNT(*) AS n FROM coach_clients WHERE coach_id = ? AND status = 'active'", [coachId]);
  check(
    'while the four existing clients are untouched — a billing event never dissolves a relationship',
    stillThere[0].n === 4,
    `${stillThere[0].n} link(s)`,
  );
}

await sweep();
const left = await db.all(`SELECT COUNT(*) AS n FROM users WHERE email LIKE '${TAG}-%@example.com'`);
check('the probe left nothing behind', left[0].n === 0, `${left[0].n} left`);

await db.closePool();
await new Promise((r) => setTimeout(r, 50));
console.log(`\nsubscription: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
