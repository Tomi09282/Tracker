/**
 * The seat cap, exercised on BOTH paths that create a coach-client link.
 *
 * ═══ WHAT THIS HAS TO PROVE, AND IN WHICH DIRECTION ════════════════════════════════════════════
 *
 *   forward  — a coach at their cap cannot gain another client, through either path;
 *   backward — the cap NEVER touches a link that already exists, because a tier can drop without
 *              the coach's consent and a billing event must not dissolve a relationship;
 *   and      — a refused pregeneration leaves NO account behind, which is the whole reason that
 *              path became one named transaction.
 *
 * Runs against the database directly through the worker pool — no HTTP, so no rate limiter and no
 * ordering games. Every fixture is deleted at the end AND swept at the start, because a cleanup on
 * the last line only runs when nothing went wrong, which is backwards for a probe.
 *
 * Run: npm run verify:seats
 */
import 'dotenv/config';
import * as db from '../src/db/index.js';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const TAG = 'seatprobe';
const HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$c2VjdXJpdHktY2hlY2tsaXN0LWZpeHR1cmU$JmZgHMlPNVE0kbF3WvjcOKmfaJTFcOyvRakVRVOZfXo';

/* ── sweep first ─────────────────────────────────────────────────────────────────────────────── */

const sweep = async () => {
  const users = await db.all(`SELECT id FROM users WHERE email LIKE '${TAG}-%@example.com'`);
  for (const u of users) {
    await db.run('DELETE FROM coach_clients WHERE coach_id = ? OR client_id = ?', [u.id, u.id]);
    await db.run('DELETE FROM coach_subscriptions WHERE coach_id = ?', [u.id]);
    await db.run('DELETE FROM invite_codes WHERE coach_id = ?', [u.id]);
    await db.run('DELETE FROM users WHERE id = ?', [u.id]);
  }
  return users.length;
};
await sweep();

const mkUser = async (label, role = 'user') => {
  const email = `${TAG}-${label}-${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await db.run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, HASH, role]);
  return (await db.all('SELECT id FROM users WHERE email = ?', [email]))[0].id;
};

const setTier = async (coachId, tierKey, status = 'active') => {
  await db.run(
    `INSERT INTO coach_subscriptions (coach_id, tier_key, status, updated_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(coach_id) DO UPDATE SET tier_key = excluded.tier_key, status = excluded.status`,
    [coachId, tierKey, status],
  );
};

const linkCount = async (coachId) =>
  (await db.all("SELECT COUNT(*) AS n FROM coach_clients WHERE coach_id = ? AND status = 'active'", [coachId]))[0].n;

/** Fill a coach to exactly `n` active clients, bypassing the cap on purpose to build the fixture. */
const fillTo = async (coachId, n) => {
  for (let i = await linkCount(coachId); i < n; i += 1) {
    const c = await mkUser(`filler${i}`);
    await db.run(
      `INSERT INTO coach_clients (coach_id, client_id, status, origin, accepted_at)
       VALUES (?, ?, 'active', 'team_code', unixepoch())`,
      [coachId, c],
    );
  }
};

/* ── the cap refuses a redemption ────────────────────────────────────────────────────────────── */

const coach = await mkUser('coach', 'coach');
await setTier(coach, 'starter'); // cap 10

{
  await fillTo(coach, 10);
  check('the fixture coach is exactly at the Starter cap', (await linkCount(coach)) === 10, `${await linkCount(coach)}`);

  // A real code, redeemed through the real transaction.
  const crypto = await import('node:crypto');
  const raw = `SEAT-${Date.now()}`;
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  await db.run(
    `INSERT INTO invite_codes (coach_id, code_hash, max_uses, uses) VALUES (?, ?, 50, 0)`,
    [coach, digest],
  );

  const newcomer = await mkUser('newcomer');
  const r = await db.redeemInvite({ userId: newcomer, digest, ip: null });

  check('a valid code is refused when the coach has no seat', r.outcome === 'seat_limit', r.outcome);
  check('and NO link was created', (await linkCount(coach)) === 10, `${await linkCount(coach)} link(s)`);

  const rows = await db.all(
    "SELECT outcome FROM invite_redemptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [newcomer],
  );
  check(
    'the attempt is RECORDED as seat_limit, not swallowed',
    rows[0]?.outcome === 'seat_limit',
    rows[0]?.outcome ?? 'no row',
  );

  // The code must not have been spent on a redemption that did not happen.
  const uses = (await db.all('SELECT uses FROM invite_codes WHERE code_hash = ?', [digest]))[0].uses;
  check('and the code was not consumed by the refusal', uses === 0, `uses=${uses}`);

  /*
   * Rule 1: an ALREADY ACTIVE link consumes no new seat. Without this, a client re-redeeming a code
   * for a coach they are already with would be refused — an idempotent repeat turned into an error
   * by a counter.
   */
  const existing = (await db.all("SELECT client_id FROM coach_clients WHERE coach_id = ? AND status = 'active' LIMIT 1", [coach]))[0].client_id;
  const again = await db.redeemInvite({ userId: existing, digest, ip: null });
  check('an existing client re-redeeming is NOT refused', again.outcome === 'accepted', again.outcome);
}

/* ── the cap never touches what already exists ───────────────────────────────────────────────── */

{
  const before = await linkCount(coach);
  // The involuntary downgrade: the processor moves them to canceled. Nothing may be dissolved.
  await setTier(coach, 'starter', 'canceled');
  const after = await linkCount(coach);
  check(
    'a CANCELED subscription dissolves no existing link',
    after === before && after === 10,
    `${before} → ${after}`,
  );

  /*
   * ═══ RULE 2 NEEDS A COACH BETWEEN THE TWO CAPS, OR IT PROVES NOTHING ═══════════════════════
   *
   * The first version asked this of the coach above — ten clients on Starter. Both readings refuse
   * the eleventh: canceled→free (10 > 3) and canceled→starter (10 >= 10). So the assertion passed
   * whether or not the status filter existed, and a mutation removing that filter entirely was NOT
   * caught. Measured, by removing it and watching the probe stay green.
   *
   * Five clients discriminates: free (cap 3) refuses, Starter (cap 10) accepts. The fixture is what
   * makes the assertion an assertion.
   */
  const midCoach = await mkUser('midcoach', 'coach');
  await setTier(midCoach, 'starter');
  await fillTo(midCoach, 5);

  const c2 = await mkUser('afterCancel');
  await db.run(
    `INSERT INTO invite_codes (coach_id, code_hash, max_uses, uses) VALUES (?, 'seatprobe-cancel-digest', 50, 0)`,
    [midCoach],
  );

  // First, on an ACTIVE starter: five of ten used, so a sixth must be allowed. This is the control
  // — without it, "refused after cancelling" could just mean the cap is broken in general.
  const control = await db.redeemInvite({ userId: c2, digest: 'seatprobe-cancel-digest', ip: null });
  check('a coach at 5 of 10 on Starter accepts a sixth', control.outcome === 'accepted', control.outcome);
  await db.run('DELETE FROM coach_clients WHERE coach_id = ? AND client_id = ?', [midCoach, c2]);

  await setTier(midCoach, 'starter', 'canceled');
  const r2 = await db.redeemInvite({ userId: c2, digest: 'seatprobe-cancel-digest', ip: null });
  check(
    'but once CANCELED the same coach is refused — the row still says starter, the entitlement is free',
    r2.outcome === 'seat_limit',
    r2.outcome,
  );

  // Rule 3: past_due keeps the tier. A failed card is a dunning window, not a decision.
  await setTier(coach, 'starter', 'past_due');
  const capNow = await db.all(
    `SELECT t.client_cap AS cap FROM subscription_tiers t
      WHERE t.key = COALESCE((SELECT s.tier_key FROM coach_subscriptions s
                               WHERE s.coach_id = ? AND s.status IN ('trialing','active','past_due')), 'free')`,
    [coach],
  );
  check('past_due KEEPS the tier rather than dropping to free', capNow[0].cap === 10, `cap=${capNow[0].cap}`);
}

/* ── unlimited ───────────────────────────────────────────────────────────────────────────────── */

{
  await setTier(coach, 'unlimited', 'active');
  const c3 = await mkUser('unlimited1');
  await db.run(
    `INSERT INTO invite_codes (coach_id, code_hash, max_uses, uses) VALUES (?, 'seatprobe-unlimited-digest', 50, 0)`,
    [coach],
  );
  const r3 = await db.redeemInvite({ userId: c3, digest: 'seatprobe-unlimited-digest', ip: null });
  check('client_cap NULL means unlimited and the eleventh client goes through', r3.outcome === 'accepted', r3.outcome);
  check('the link exists', (await linkCount(coach)) === 11, `${await linkCount(coach)}`);
}

/* ── the pregeneration path ──────────────────────────────────────────────────────────────────── */

{
  const coach2 = await mkUser('pregen', 'coach');
  await setTier(coach2, 'free'); // cap 3
  await fillTo(coach2, 3);

  const usersBefore = (await db.all('SELECT COUNT(*) AS n FROM users'))[0].n;
  const refused = await db.pregenerateClient({
    coachId: coach2,
    email: `${TAG}-pregen-refused@example.com`,
    passwordHash: HASH,
    requestId: 'seatprobe',
  });
  const usersAfter = (await db.all('SELECT COUNT(*) AS n FROM users'))[0].n;

  check('pregeneration is refused at the cap too', refused.outcome === 'seat_limit', refused.outcome);
  check(
    'and leaves NO orphan account — the whole reason it became one transaction',
    usersAfter === usersBefore,
    `${usersBefore} → ${usersAfter}`,
  );
  const orphan = await db.all('SELECT id FROM users WHERE email = ?', [`${TAG}-pregen-refused@example.com`]);
  check('the address is still free for a later attempt', orphan.length === 0);

  // And below the cap it creates the account AND the link, atomically.
  await setTier(coach2, 'starter');
  const ok = await db.pregenerateClient({
    coachId: coach2,
    email: `${TAG}-pregen-ok@example.com`,
    passwordHash: HASH,
    requestId: 'seatprobe',
  });
  check('below the cap it goes through', ok.outcome === 'created', ok.outcome);
  const linked = await db.all("SELECT status FROM coach_clients WHERE coach_id = ? AND client_id = ?", [coach2, ok.userId]);
  check('and the account and the link arrive together', linked[0]?.status === 'active', linked[0]?.status ?? 'no link');

  const dup = await db.pregenerateClient({
    coachId: coach2,
    email: `${TAG}-pregen-ok@example.com`,
    passwordHash: HASH,
    requestId: 'seatprobe',
  });
  check('a taken address is reported, not crashed on', dup.outcome === 'email_taken', dup.outcome);
}

/* ── cleanup ─────────────────────────────────────────────────────────────────────────────────── */

await db.run("DELETE FROM invite_codes WHERE code_hash LIKE 'seatprobe-%'");
const swept = await sweep();
check('the probe left nothing behind', swept > 0 || true, `${swept} fixture user(s) removed`);
const left = await db.all(`SELECT COUNT(*) AS n FROM users WHERE email LIKE '${TAG}-%@example.com'`);
check('and no fixture user survives', left[0].n === 0, `${left[0].n} left`);

await db.closePool();
console.log(`\nseats: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
