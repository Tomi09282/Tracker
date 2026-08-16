# Security hardening

Why this design: the [server-skeleton](server-skeleton.md) CSP ships a static `script-src 'self'`,
the coarsest safe policy — it trusts *every* same-origin script equally, so one reflected/stored
injection that lands inside your origin executes freely. These four measures raise the bar past
"good defaults" with no SaaS dependency: a **per-response CSP nonce** so only the scripts *you*
emitted this request run (an injected `<script>` has no valid nonce), **SRI** so an off-origin asset
can't be swapped under you, **honeypots + a tarpit** that turn scanners and credential-stuffers into
self-inflicted IP bans and wasted seconds, and a **security.txt** so a finder reports a bug instead
of dropping it publicly. Everything is stdlib + `helmet` + the existing `pino`/rate-limit machinery.

## CSP nonces for scripts and styles (replace the static 'self' policy)

Rationale: a per-request nonce means the browser runs only the exact `<script>`/`<style>` tags your
server stamped this response — an injected tag carries no matching nonce and is refused.

Generate the nonce before `helmet` so the directive functions can read it off `res.locals`:

```js
// src/lib/csp.js
import { randomBytes } from 'node:crypto';

// Fresh 128-bit nonce per response (base64 keeps the attribute short). MUST run before helmet's
// CSP so the directive functions below can read res.locals.cspNonce.
export function cspNonce(_req, res, next) {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
}
```

Wire it in `server.js`, replacing the static `contentSecurityPolicy` block from
[server-skeleton](server-skeleton.md). helmet evaluates `(req, res) => string` directive values per
request:

```js
import helmet from 'helmet';
import { cspNonce } from './src/lib/csp.js';

app.use(cspNonce); // BEFORE helmet — populates res.locals.cspNonce
app.use(helmet({
  contentSecurityPolicy: {
    // useDefaults:false — spelling out every directive; helmet's defaults would re-add 'self' to
    // script-src and undo the nonce hardening.
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // No 'self' for scripts: only nonce'd tags run. 'strict-dynamic' lets a nonce'd loader pull
      // the scripts it trusts (Vite's module graph) without host-listing, and makes conformant
      // browsers ignore host-allowlist bypasses. https: is a fallback for engines that don't
      // grok 'strict-dynamic' (ignored where it's honoured) — drop it for a stricter L3 policy.
      scriptSrc: [(_req, res) => `'nonce-${res.locals.cspNonce}'`, "'strict-dynamic'", 'https:'],
      // Nonce authorises Vite's injected <style>; 'self' covers the bundled sheet. NEVER add
      // 'unsafe-inline' here — once a nonce is present, nonce-aware browsers silently ignore it
      // (it buys nothing), and legacy CSP1-only browsers would run *any* inline style.
      styleSrc: ["'self'", (_req, res) => `'nonce-${res.locals.cspNonce}'`],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],       // no <object>/<embed> sinks
      baseUri: ["'none'"],         // block <base> hijacking relative script URLs
      frameAncestors: ["'none'"],  // anti-clickjacking (helmet's default is 'self')
      reportUri: ['/api/csp-report'],   // wide-support legacy channel
      reportTo: ['csp-endpoint'],        // Reporting API channel (needs the Reporting-Endpoints header below)
    },
  },
}));
// helmet doesn't emit the reporting group header; set the modern Reporting-Endpoints (structured
// header — Report-To is deprecated and no longer honoured by current Chrome) so 'report-to'
// resolves. Use the ABSOLUTE https origin — browsers ignore non-secure/relative endpoint URLs, so a
// bare '/api/csp-report' silently disables report-to (report-uri still fires as the fallback).
app.use((req, res, next) => {
  res.setHeader('Reporting-Endpoints', `csp-endpoint="https://${req.host}/api/csp-report"`);
  next();
});
```

The report sink — unauthenticated, CSRF-exempt (browsers POST it with no custom header),
rate-limited so it can't flood the log, and parsing both report content types leniently:

```js
// src/routes/csp-report.js
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../lib/logger.js';

export const cspReport = Router();
// Keyed on req.ip — safe ONLY because TRUST_PROXY is pinned to the real proxy (see the honeypot
// section); otherwise a spoofed X-Forwarded-For lets one client evade the limit per fake IP.
const reportLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true,
  legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });

cspReport.post('/api/csp-report', reportLimiter,
  express.json({ type: ['application/csp-report', 'application/reports+json', 'json'], limit: '8kb' }),
  (req, res) => {
    // Report fields are attacker-influenceable — use them for observability only, never logic.
    const r = req.body?.['csp-report'] ?? req.body?.body ?? req.body ?? {};
    (req.log ?? logger).warn({
      blockedUri: r['blocked-uri'] ?? r.blockedURL,
      violatedDirective: r['violated-directive'] ?? r.effectiveDirective,
      documentUri: r['document-uri'] ?? r.documentURL,
    }, 'csp violation');
    res.status(204).end(); // browsers ignore the body
  });
```

Mount `cspReport` before `csrfProtection` (or add `/api/csp-report` to its exempt set) — the
browser's report POST carries no `X-CSRF` header and would otherwise 403.

**Vite must emit the nonce.** Hashed JS/CSS assets stay static and cacheable, but `index.html`
embeds a one-time nonce, so serve it as a template. Put a placeholder in `index.html`:

```html
<!-- index.html (source): point at the entry module as usual. Vite's build rewrites src to the
     hashed asset but preserves unknown attributes, so the placeholder survives into
     dist/index.html; %CSP_NONCE% is swapped per request. -->
<script type="module" nonce="%CSP_NONCE%" src="/src/main.tsx"></script>
```

...and fill it in the SPA fallback (after static assets, before the 404):

```js
// server.js — read the built HTML once at boot; template only the HTML, never the assets.
import { readFileSync } from 'node:fs';
const indexHtml = readFileSync('./dist/index.html', 'utf8');

app.use(express.static('./dist', { index: false })); // hashed assets: long cache, no nonce
// Express 5 requires a NAMED wildcard — bare '*' throws "Missing parameter name" at boot.
app.get('/*splat', (_req, res) => {
  // no-store: the HTML carries a one-time nonce and must never be cached or shared.
  res.set('Cache-Control', 'no-store').type('html')
     .send(indexHtml.replaceAll('%CSP_NONCE%', res.locals.cspNonce));
});
```

For the Vite dev server (separate proxied origin, see [frontend-conventions](frontend-conventions.md))
inject the same placeholder via the `transformIndexHtml` hook with a static dev nonce, so
`npm run dev` exercises the identical CSP semantics.

## Subresource Integrity (SRI) for externally-hosted assets

Rationale: SRI pins a cryptographic hash on every off-origin `<script>`/`<link>`, so a compromised
CDN (or MITM on that host) serving altered bytes is rejected instead of run.

Policy (enforce in [frontend-conventions](frontend-conventions.md)): **this app self-hosts
everything** — which is what makes the strict `'self'`/nonce policy above tenable, so SRI is normally
moot. But *if* any tag ever points off-origin it MUST carry both attributes:

```html
<!-- integrity pins the bytes; crossorigin lets the browser fetch them in a verifiable mode. -->
<script src="https://cdn.example.com/lib.min.js"
        integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
        crossorigin="anonymous"></script>
```

Automate the hashes for anything Vite bundles with a build plugin — never hand-compute one:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sri } from 'vite-plugin-sri3'; // named export; place last to avoid ordering issues

export default defineConfig({
  plugins: [react(), sri()], // rewrites emitted <script>/<link> with integrity="sha384-…" at build
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

Two rules keep SRI and CSP in lockstep:
- **Widen the CSP only in tandem with SRI.** Add a CDN host to `scriptSrc`/`connectSrc` ONLY in the
  same change that adds `integrity` to its tag — a host allowlisted without SRI is un-pinned trust.
- **`'strict-dynamic'` ignores host allowlists.** Under the script policy above, a browser that
  honours it won't load a plain `<script src=cdn>` at all — pull such assets from a nonce'd loader,
  or drop `'strict-dynamic'` and rely on host + SRI. Pick one model per asset.

## Honeypot / tarpit for credential-stuffing and scanners

Rationale: scanners hammer well-known paths and stuffing bots retry logins fast; a decoy route no
real client ever touches converts a scan into an instant durable IP ban, and a delay on
already-throttled logins bleeds the automation's throughput without touching real users.

**The ban must key on the true socket peer, never a spoofable header.** This is the sharp edge of
the whole section: a honeypot that bans `req.ip` for 24h is a *weapon pointed at you* the moment
`req.ip` is client-controlled. This app runs behind a reverse proxy (env `TRUST_PROXY`), so with a
loose `trust proxy` setting Express takes `req.ip` from the **left-most `X-Forwarded-For` entry**,
which the client fully controls. An attacker then sends `GET /.env` with
`X-Forwarded-For: <victim-or-proxy-ip>` and gets an arbitrary IP — a real user, your own CDN, or
`127.0.0.1` — banned for a day. So:

- **Pin `trust proxy`.** Set it to the exact proxy hop count or the proxy's CIDR (never `true` on a
  public server), so Express reads the client address the proxy actually appended and discards
  attacker-forged left-most hops. See [server-skeleton](server-skeleton.md)/[deployment](deployment.md).
- **Ban from the proxy's access log, not the app.** `fail2ban` runs `iptables`, which matches the
  packet's *real* source IP. Behind a proxy every packet arrives from the proxy's LAN IP, so a jail
  tailing the Node log and banning `req.ip` either bans the wrong host or bans nothing. Point the
  jail at the reverse proxy's access log (nginx/Caddy sees the true peer) — the app-log line below
  is for observability, and its ban value is `req.socket.remoteAddress` (unspoofable) not `req.ip`.

**(1) Decoy routes → ban signal.** Mount BEFORE `csrfProtection`, auth, and rate-limiters so a hit
is cheap and unmissable — a POST to a trap must reach the trap and get logged, not die earlier as a
CSRF 403:

```js
// src/routes/honeypot.js
import { Router } from 'express';
import { logger } from '../lib/logger.js';

export const honeypot = Router();
// Paths a legitimate SPA/API client never requests. Extend freely.
const TRAPS = ['/wp-login.php', '/wp-admin', '/admin.php', '/.env', '/phpmyadmin', '/xmlrpc.php'];

for (const path of TRAPS) {
  honeypot.all(path, (req, res) => {
    // peerIp is the raw TCP peer — unspoofable, unlike req.ip which can derive from X-Forwarded-For.
    // fwd is the (untrusted) client-claimed chain, logged for triage only, NEVER used to ban.
    (req.log ?? logger).warn(
      { peerIp: req.socket.remoteAddress, fwd: req.get('X-Forwarded-For'),
        path: req.originalUrl, ua: req.get('User-Agent') },
      'honeypot hit');
    res.status(404).end(); // look like a boring 404 — don't reveal it's a trap
  });
}
```

The matching `fail2ban` jail lives in ops config referenced from [deployment](deployment.md), not in
the app. **Tail the reverse proxy access log** so `<HOST>` is the real client, and gate on the trap
path so only decoy hits count:

```ini
# /etc/fail2ban/filter.d/app-honeypot.conf — matches the reverse-proxy (nginx-style) access log.
[Definition]
failregex = ^<HOST> .*"(GET|POST|HEAD) /(wp-login\.php|wp-admin|admin\.php|\.env|phpmyadmin|xmlrpc\.php)

# /etc/fail2ban/jail.d/app.conf
[app-honeypot]
enabled  = true
logpath  = /var/log/nginx/access.log   # the proxy log — its %h is the true client IP
maxretry = 1         # one hit is enough — a real client never lands here
bantime  = 86400     # 24h; escalate repeat offenders via the recidive jail
findtime = 3600
```

A hidden honeypot **form field** catches bots on the login/register POST: add a field the CSS hides
from humans, declare it in the `.strict()` schema (so it's a *known* optional field, not a rejected
extra), and fail like any validation error:

```js
// body.website is a decoy the real form hides via CSS. Humans leave it empty; .max(0) allows only
// "" (or omission) and rejects any real value — don't hint that it's a trap.
const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  website: z.string().max(0).optional(), // honeypot
}).strict();
```

**(2) Tarpit on repeated auth failure.** The login backoff in [auth-blueprint](auth-blueprint.md)
returns 429 once `next_login_at` trips. Hold that 429 for a few seconds with an **unref'd** timer:
the socket ties up the bot's connection while the event loop stays free, and real users (never in
this branch) don't see it:

```js
// src/lib/tarpit.js
// Delay a response without blocking the loop. unref() so a pending tarpit can't keep the process
// alive at shutdown (Timeout.unref() returns the same timer, so clearTimeout still cancels it);
// res.on('close') clears it if the client gives up first, which also prevents send() from firing
// on an already-closed response.
export function tarpit(res, ms, send) {
  const t = setTimeout(send, ms + Math.floor(Math.random() * 1000)).unref(); // jitter defeats retry pacing
  res.on('close', () => clearTimeout(t));
}
```

Apply it at the existing backoff branch in `/login` — the ONLY change is *when* the 429 is sent:

```js
if (user && user.next_login_at > Math.floor(Date.now() / 1000)) {
  // Was an instant 429. Now delayed — slows automated stuffing; the worker keeps serving meanwhile.
  return tarpit(res, 3000, () =>
    res.status(429).json({ error: 'too many attempts, try again later' }));
}
```

Both traps are defence-in-depth on top of — never a replacement for — the per-IP + per-account rate
limiters and argon2id from [auth-blueprint](auth-blueprint.md). The per-IP limiter shares the same
`trust proxy` caveat: pin it, or an attacker cycles forged `X-Forwarded-For` values to reset the
per-IP window and stuff freely.

## security.txt + responsible-disclosure policy

Rationale: a machine-readable contact (RFC 9116) routes a finder to you privately under an agreed
policy, turning a would-be public 0-day drop into a coordinated report.

Serve it as a plain static file — **exempt from auth and CSRF, cacheable, no nonce** — reachable
unauthenticated at the exact well-known path (mount BEFORE the protected routers):

```js
// server.js
app.use('/.well-known', express.static('./public/.well-known', {
  maxAge: '1d',
  setHeaders: (res) => res.type('text/plain'), // RFC 9116 requires text/plain
}));
```

```
# public/.well-known/security.txt  (RFC 9116) — sign with the PGP key for production; HTTPS only.
Contact: mailto:security@example.com
Contact: https://example.com/security
Encryption: https://example.com/.well-known/pgp-key.txt
Policy: https://example.com/security-policy
Preferred-Languages: en, hu
Canonical: https://example.com/.well-known/security.txt
# Expires MUST be in the future — a stale file is ignored. RFC 9116 recommends < 1 year out; renew.
Expires: 2027-01-01T00:00:00.000Z
```

A short `SECURITY.md` at the repo root states scope, safe-harbour, and response expectations — what a
good-faith researcher reads before poking:

```markdown
# Security policy

## Reporting
Email security@example.com (PGP: /.well-known/pgp-key.txt). We acknowledge within 3 business days
and aim to ship a fix or mitigation within 30 days for confirmed issues.

## Scope
In scope: this application and its API. Out of scope: third-party services, volumetric DoS, social
engineering, physical attacks, and scanner output without a working PoC.

## Safe harbour
We won't pursue legal action for good-faith research respecting this policy: no privacy violation,
no data destruction/exfiltration beyond proving the issue, no service degradation, and no
disclosure before we've had a reasonable chance to remediate.
```

Add `/.well-known/security.txt` and `/api/csp-report` to the CSRF-exempt set (or mount both before
`csrfProtection`): both are unauthenticated and report-only, and no real state depends on them.