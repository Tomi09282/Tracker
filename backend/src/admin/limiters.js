// src/admin/limiters.js — the admin routes' rate-limit budgets, defined ONCE.
//
// Moved out of admin/routes.js (package B-admin-accounts) because a second admin router
// (admin/accounts.js) needs the SAME buckets. Two routers each building their own limiter would
// double the budget the day the second one landed: express-rate-limit keeps its counters per
// INSTANCE, so "120 per IP" would quietly become "120 here and 120 there".
//
// ═══ READS AND WRITES DO NOT SHARE A BUDGET ════════════════════════════════════════════════════
//
// They used to: one `adminLimiter` at 120 per 15 minutes per IP covered all eight routes, reads
// included. Opening the dashboard costs three requests — stats, metrics, users — so a working admin
// session spends the write budget on looking at things, and the limiter that is supposed to bound
// damage is exhausted by the page that shows there is none.
//
// And it was IP-only. A per-IP limit stops one machine; it does not stop one principal with a
// laptop, a phone and a VPN, which is the shape of an actual compromised admin session.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const limiter = (limit, keyGenerator) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    ...(keyGenerator ? { keyGenerator } : {}),
  });

export const adminReadIpLimiter = limiter(600);
export const adminReadLimiter = limiter(300, (req) => `adm-r:${req.user?.id ?? ipKeyGenerator(req.ip)}`);
export const adminWriteIpLimiter = limiter(120);
export const adminWriteLimiter = limiter(60, (req) => `adm-w:${req.user?.id ?? ipKeyGenerator(req.ip)}`);
