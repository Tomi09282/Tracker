// src/payments/webhook.js — the processor's side of the conversation, and the least trusted input
// in the product.
//
// ═══ WHY THIS ROUTER SITS ABOVE TWO GLOBAL MIDDLEWARES ═════════════════════════════════════════
//
// ABOVE `express.json`, because the signature covers the RAW BYTES. Parsing and re-serialising
// changes key order, whitespace and unicode escapes, and the HMAC over the result matches nothing.
// This is the one place in the product that wants a Buffer.
//
// ABOVE `csrfProtection`, because the caller is Stripe. It sends no `X-CSRF` header, no
// `Sec-Fetch-Site`, no cookie and no session — it cannot, and no configuration would make it. CSRF
// defends a browser that carries the user's credentials automatically; there is no browser and no
// credential here. **The signature is the authentication**, and it is strictly stronger than the
// three CSRF layers it replaces.
//
// ═══ VERIFY, THEN PARSE — IN THAT ORDER, ENFORCED BY STRUCTURE ═════════════════════════════════
//
// `JSON.parse` appears exactly once in this file and it is below the signature check with nothing
// between them. The Stripe SDK's `constructEvent` does both in one call, which is convenient and
// makes the ordering a claim rather than a fact; here it is a fact you can see.
import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import * as db from '../db/index.js';
import { asyncRoute } from '../lib/http.js';
import { env } from '../lib/env.js';
import { verifyWebhook } from './signature.js';
import { intentFrom } from './handlers.js';

const router = Router();

/*
 * Generous, because a legitimate burst is real: a price change or a dunning run can produce
 * hundreds of events in a minute, and dropping them costs subscription state. Present, because
 * without it an unauthenticated endpoint that computes an HMAC over a 64 KB body is a CPU
 * amplifier that needs no credential at all.
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * ═══ EVERY FAILURE ANSWERS THE SAME ════════════════════════════════════════════════════════════
 *
 * 400, no body, no reason. A forger tuning an attack learns nothing about which part was wrong —
 * whether the timestamp was outside tolerance, the signature failed, or the event was a replay.
 * The reason goes to the log, where the operator can see it and the attacker cannot.
 *
 * A 400 also tells Stripe not to retry, which is right for all three: none of them becomes valid
 * by being sent again.
 */
const refuse = (res) => res.status(400).end();

router.post(
  '/payments/webhook',
  webhookLimiter,
  // 1 MB: Stripe events are a few kilobytes and the largest documented ones are well under this.
  // The cap is what stops an unauthenticated caller choosing how much memory to allocate.
  express.raw({ type: 'application/json', limit: '1mb' }),
  asyncRoute(async (req, res) => {
    const verdict = verifyWebhook({
      header: req.get('stripe-signature'),
      rawBody: req.body,
      secret: env.STRIPE_WEBHOOK_SECRET,
      nowSeconds: Math.floor(Date.now() / 1000),
    });

    if (!verdict.ok) {
      // `warn` and not `error`: a forged webhook is an expected event on a public URL, and paging
      // somebody for it would train them to ignore the channel. It IS worth seeing.
      req.log.warn({ reason: verdict.reason }, 'payment webhook refused');
      return refuse(res);
    }

    // ── verified. only now does anything read the contents ──────────────────────────────────
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      // A body that carries a valid signature and is not JSON means the secret is shared with
      // something that is not Stripe. Worth a louder line than a forgery.
      req.log.error('payment webhook: signature verified but the body is not JSON');
      return refuse(res);
    }

    const id = typeof event?.id === 'string' ? event.id : null;
    const type = typeof event?.type === 'string' ? event.type : null;
    if (!id || !type || !/^evt_[A-Za-z0-9]{1,255}$/.test(id) || type.length > 128) {
      req.log.warn({ id, type }, 'payment webhook: verified but shaped wrong');
      return refuse(res);
    }

    /*
     * ═══ THE REPLAY CLAIM IS THE INSERT ══════════════════════════════════════════════════════
     *
     * Not `SELECT then INSERT`. Two deliveries of the same event arriving together would both pass
     * a SELECT and both apply — and Stripe retrying is not an edge case, it is the documented
     * behaviour when a response is slow.
     *
     * The unique index on `(provider, event_id)` decides it, so exactly one caller wins and the
     * loser learns it lost from a constraint rather than from a race it could win.
     *
     * The timestamp tolerance in `verifyWebhook` bounds how long a captured request stays useful;
     * this table makes a replay INSIDE that window a no-op as well. Both halves are needed: the
     * table alone would grow forever, and the tolerance alone would let a five-minute replay
     * through.
     */
    const claimed = await db.claimProcessorEvent({
      eventId: id,
      eventType: type,
      eventAt: verdict.timestamp,
      requestId: res.locals.requestId,
    });

    if (!claimed.fresh) {
      // 200, not 400. The event WAS delivered and processed; saying otherwise makes Stripe retry
      // something that already happened.
      req.log.info({ eventId: id, type }, 'payment webhook replayed — already processed');
      return res.json({ received: true, replayed: true });
    }

    /*
     * ═══ THE CLAIM IS ALREADY MADE, SO HANDLING MUST NOT THROW ═══════════════════════════════
     *
     * `processor_events` now holds this id, and a replay would be refused by it. That is correct —
     * the event WAS received — but it means a handler that throws leaves an event marked as seen
     * and never applied, with the sender told 200 and no retry coming.
     *
     * So every outcome below is a RESULT, not an exception, and the ones that mean "nothing was
     * applied" are logged at a level somebody will see.
     */
    const intent = intentFrom(event);

    if (intent === null) {
      // Most of what a processor sends is invoices, charges and payment methods. Recording and
      // ignoring is the correct handling, and `info` rather than `warn` keeps the real problems
      // visible.
      req.log.info({ eventId: id, type }, 'payment webhook accepted — no action for this type');
      return res.json({ received: true });
    }

    if (intent.kind === 'unsupported') {
      req.log.error({ eventId: id, type, reason: intent.reason }, 'payment webhook: shape this product does not handle');
      return res.json({ received: true });
    }

    const result = await db.applySubscriptionEvent({
      subscriptionId: intent.subscriptionId,
      customerId: intent.customerId,
      priceId: intent.priceId,
      status: intent.status,
      currentPeriodEnd: intent.currentPeriodEnd,
      coachIdHint: intent.coachIdHint,
      eventAt: verdict.timestamp,
    });

    if (result.outcome === 'unattributed') {
      // Somebody may have paid and received nothing. This is the loudest line in the file.
      req.log.error(
        { eventId: id, type, subscriptionId: intent.subscriptionId, customerId: intent.customerId },
        'payment webhook: NO COACH resolves for this subscription — the event was recorded and NOT applied',
      );
    } else if (result.outcome === 'unknown_price') {
      req.log.error(
        { eventId: id, priceId: result.priceId },
        'payment webhook: no tier maps to this price — add provider_price_id to subscription_tiers',
      );
    } else if (result.outcome === 'stale') {
      // Expected and harmless: webhooks arrive out of order by design. `info`, not `warn`.
      req.log.info({ eventId: id, type, coachId: result.coachId }, 'payment webhook: older than the state held, discarded');
    } else {
      req.log.info(
        { eventId: id, type, coachId: result.coachId, tier: result.tierKey, status: result.status },
        'subscription updated',
      );
    }

    res.json({ received: true });
  }),
);

export default router;
