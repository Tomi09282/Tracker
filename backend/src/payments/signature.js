// src/payments/signature.js — is this webhook really from the processor?
//
// ═══ WHY THIS IS A PURE FUNCTION IN ITS OWN FILE ═══════════════════════════════════════════════
//
// It is the only thing standing between a stranger with a URL and this product's subscription
// state. A forged `customer.subscription.updated` naming any coach and any tier is a free upgrade
// — or, pointed the other way, a way to cancel somebody's plan. So it takes its inputs as
// arguments and returns a verdict: no request object, no clock of its own, no database. That is
// what lets `verify:webhook` drive it through every failure mode without a server.
//
// It also does NOT use the Stripe SDK. ADR-0014's rule is one interface, and there is a second
// reason here: `constructEvent` both verifies and parses, and this product wants those separated so
// the parse provably cannot run on an unverified body.
import crypto from 'node:crypto';

/**
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends
 *
 *     Stripe-Signature: t=1614556800,v1=<hex>,v1=<hex during a secret rotation>
 *
 * More than one `v1` is normal — it is how a secret is rotated without dropping events — so this
 * accepts the signature if ANY of them matches. That is not a weakening: each is a full-strength
 * HMAC under a secret the caller must already hold.
 */
export function parseSignatureHeader(header) {
  if (typeof header !== 'string' || header.length === 0 || header.length > 2048) return null;

  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && /^\d{1,15}$/.test(value)) timestamp = Number(value);
    else if (key === 'v1' && /^[a-f0-9]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * The verdict. `ok` is the only field the route may branch on for its RESPONSE — every failure
 * answers identically, because telling a forger whether the timestamp or the signature was wrong
 * turns the endpoint into an oracle for tuning the next attempt. `reason` exists for the LOG.
 */
export function verifyWebhook({ header, rawBody, secret, nowSeconds, toleranceSeconds = 300 }) {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };
  if (!Buffer.isBuffer(rawBody)) return { ok: false, reason: 'body_not_raw' };

  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: 'malformed_header' };

  /*
   * ═══ THE TIMESTAMP IS CHECKED BEFORE THE HMAC, AND BOTH DIRECTIONS ARE CHECKED ═══════════════
   *
   * Before, because an HMAC over a body that may be megabytes is work a forger should not be able
   * to make the server do by sending a stale header.
   *
   * BOTH directions, because `now - t <= tolerance` alone accepts a timestamp from next year. That
   * is not a theoretical shape: it is the arithmetic people write when they are thinking about
   * "too old" and forget that the attacker chooses `t`. A far-future `t` with a valid signature —
   * obtainable if a signed payload ever leaks — would replay forever.
   */
  const age = nowSeconds - parsed.timestamp;
  if (age > toleranceSeconds) return { ok: false, reason: 'too_old' };
  if (age < -toleranceSeconds) return { ok: false, reason: 'too_far_future' };

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parsed.timestamp}.`, 'utf8')
    .update(rawBody)
    .digest();

  /*
   * `timingSafeEqual` and not `===`.
   *
   * A string comparison returns as soon as two bytes differ, and the time it took says how many
   * leading bytes were right. That is enough to reconstruct a signature one byte at a time over
   * enough requests. The lengths are already equal here — both sides are a 32-byte SHA-256 digest,
   * and the header regex above rejected anything that was not 64 hex characters — so the
   * length-mismatch throw cannot fire and there is no length to leak.
   */
  for (const candidate of parsed.signatures) {
    const given = Buffer.from(candidate, 'hex');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      return { ok: true, timestamp: parsed.timestamp };
    }
  }

  return { ok: false, reason: 'bad_signature' };
}
