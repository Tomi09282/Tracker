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
     * Handling comes next (T8.2.2). Answering 200 for an event nothing acts on yet is deliberate
     * and is NOT the same as dropping it: the row in `processor_events` records that it arrived,
     * with its type and its time, so the first handler can be written against events that really
     * came rather than against the documentation's examples.
     */
    req.log.info({ eventId: id, type }, 'payment webhook accepted');
    res.json({ received: true });
  }),
);

export default router;
