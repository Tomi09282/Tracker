# Email deliverability

Why this design: the auth catalog sends ~8 security-critical emails (verify, reset, magic-link,
invite, new-device alert, lockout notice, breach "this wasn't me") through the `sendMail(...)`
abstraction referenced in [auth-email-flows.md](auth-email-flows.md) — but a token that never
reaches the inbox is a broken flow, and a reset link in spam is a support ticket at best and a
locked-out user at worst. Three things make mail actually arrive and keep your sender reputation
intact: (1) **authenticate the domain** with SPF + DKIM + DMARC so receivers trust you and can't be
spoofed as you; (2) **stop mailing addresses that reject you** — one hard bounce or spam complaint,
then a `suppressions` row, so you never re-send and never tank your reputation with repeat failures;
(3) **treat security mail as must-deliver** — a dedicated transactional subdomain isolated from any
marketing reputation, multipart text+HTML always, per-recipient send caps, and monitoring on the
delivery/complaint rate of exactly those messages. The mailer is a thin, provider-swappable facade
so no route knows which ESP is behind it, and the suppression check lives *inside* the send path so
it can't be forgotten.

Packages: your ESP SDK (this file's examples use Postmark's `postmark`; the facade hides the ESP, so
swapping to AWS `@aws-sdk/client-sesv2` touches only `sendMail`'s body). Plus the existing `zod`,
`pino`, and the `src/db` facade. The bounce/complaint webhook reuses
the verify-then-enqueue machinery in [integrations-webhooks.md](integrations-webhooks.md) verbatim —
it is just another signed provider POST.

## 1. DNS: SPF, DKIM, DMARC on a dedicated transactional subdomain

Send transactional mail from a subdomain (`mail.example.com`, envelope/From `no-reply@mail.example.com`)
kept separate from your root domain and any marketing sender. Rationale: reputation is scored
per-domain; isolating auth mail means a marketing blast (or a compromised list) can never drag your
password-reset deliverability down, and vice-versa. Publish all three records for that subdomain:

```dns
; SPF — authorizes the ESP's servers to send as this domain. ONE TXT record, ONE "v=spf1".
; "include:" delegates to the ESP's published SPF; "-all" hard-fails everything else (use "-all",
; not "~all", for a locked-down transactional sender — you know exactly who sends for it).
mail.example.com.        TXT   "v=spf1 include:spf.provider.com -all"

; DKIM — the ESP gives you a public key (or a CNAME to a key it rotates). Signs each message so a
; receiver can verify it wasn't altered and really came from an authorized signer. Selector varies
; per provider; publish exactly what the dashboard shows.
selector1._domainkey.mail.example.com.  CNAME  selector1.dkim.provider.com.

; DMARC — ties SPF+DKIM to the visible From domain (alignment) and tells receivers what to do on
; failure. Receivers look up _dmarc.<From-domain> first and only fall back to the org domain
; (where sp=, or p= if sp is absent, would apply). Publish an explicit record at
; _dmarc.mail.example.com so the transactional subdomain gets its own policy, enforcement ramp,
; and rua reports — you can reach p=reject here without waiting on whatever marketing/corporate
; mail does to the org-domain record. Start at p=none WITH rua reporting to observe, then tighten
; to quarantine, then reject once your aggregate reports show 100% pass. pct ramps enforcement gradually.
_dmarc.mail.example.com. TXT   "v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s; pct=100"
```

Enforcement ramp (do NOT jump straight to `reject` — you will silently drop your own legitimate mail
if any source is unaligned): `p=none` for ~2 weeks reading the `rua` aggregate XML → `p=quarantine` →
`p=reject`. `adkim=s; aspf=s` demand *strict* alignment (signing/return-path domain must match the
From domain exactly), which is what stops a lookalike subdomain inheriting your trust. DMARC at
`reject` is the bar for must-deliver auth mail.

## 2. The mailer facade — the single send path every flow plugs into

`sendMail(...)` is the *only* function routes call; the ESP lives behind it. It enforces the
invariants no caller should have to remember: **suppression check first** (never mail a
hard-bounced/complained address), **multipart text+HTML always**, a **category tag** so delivery
metrics can be sliced per-flow, and **never log the body or recipient token**. It returns a result
object rather than throwing, so a suppressed recipient is a normal outcome, not a 500.

```js
// src/lib/mailer.js — provider-agnostic facade. Auth flows import { sendMail } from here.
import { ServerClient } from 'postmark';
import { z } from 'zod';
import { logger } from './logger.js';
import { env } from './env.js';
import * as db from '../db/index.js';
import { canonicalizeEmail } from './email.js';       // same canonical form as the whole auth catalog
import { renderTemplate } from './email-templates.js'; // §5

const client = new ServerClient(env.POSTMARK_TOKEN);

// Strict shape: callers pass a template name + data, NOT raw HTML — so no route can inject unescaped
// user input into an email body, and every message is guaranteed multipart.
const MailInput = z.object({
  to: z.string().max(254),
  template: z.string().min(1),        // key into renderTemplate()
  data: z.record(z.string(), z.unknown()).default({}), // zod v4: z.record needs BOTH key + value schema
  category: z.enum([                  // must-deliver security mail is tagged so we can monitor it
    'verify', 'reset', 'magic', 'invite',
    'new-device', 'lockout', 'breach-alert',
  ]),
}).strict();

// Security categories must be delivered; we never suppress them for a *soft* reason and we alert on
// their failure rate (§6). Hard bounces still block them — a mailbox that doesn't exist can't be forced.
const SECURITY_CATEGORIES = new Set(['verify', 'reset', 'magic', 'new-device', 'lockout', 'breach-alert']);

export async function sendMail(input) {
  const { to, template, data, category } = MailInput.parse(input);
  const recipient = canonicalizeEmail(to);

  // Suppression gate — the whole point of the bounce/complaint pipeline. A hard-bounced or
  // complained address is NEVER mailed again; re-sending is what destroys sender reputation.
  const suppressed = await db.get(
    'SELECT reason FROM suppressions WHERE email = ?', [recipient]);
  if (suppressed) {
    // Log the fact (category + reason), never the body. This is an expected, non-error outcome.
    logger.warn({ category, reason: suppressed.reason }, 'send skipped: recipient suppressed');
    return { ok: false, skipped: 'suppressed', reason: suppressed.reason };
  }

  const { subject, text, html } = renderTemplate(template, data); // always returns BOTH parts

  try {
    const resp = await client.sendEmail({
      From: env.MAIL_FROM,                 // no-reply@mail.example.com — the aligned subdomain
      To: recipient,
      Subject: subject,
      TextBody: text,                      // plaintext part: required, improves deliverability + a11y
      HtmlBody: html,                      // HTML part: the multipart alternative
      MessageStream: env.POSTMARK_STREAM,  // a dedicated transactional stream, isolated reputation
      Tag: category,                       // slice delivery/bounce/complaint metrics per flow
      TrackOpens: !SECURITY_CATEGORIES.has(category), // don't pixel-track security mail
    });
    // Log the provider message id (for tracing a delivery) — NOT the recipient or any token.
    logger.info({ category, messageId: resp.MessageID }, 'mail sent');
    return { ok: true, messageId: resp.MessageID };
  } catch (err) {
    // Do not leak the address or body into the error log; the ESP error code is enough to triage.
    // postmark.js errors expose name + numeric `code` (the API's ErrorCode) + `statusCode`.
    logger.error({ category, name: err?.name, errorCode: err?.code, status: err?.statusCode },
      'mail send failed');
    return { ok: false, error: 'send_failed' };
  }
}
```

Rationale: one choke point where suppression, multipart discipline, tagging, and log hygiene are all
enforced by construction — a new flow gets them for free just by calling `sendMail`.

The `auth-email-flows.md` snippets call `sendMail({ to, subject, text })` directly; migrate them to
`sendMail({ to, template, data, category })` so subjects/bodies live in one templated place. The
contract (never logs the token, returns rather than throws) is unchanged.

## 3. Suppression table (add to src/db/schema.sql)

The suppression list is the durable memory of "this address rejected us." `email` is the canonical
form (so a differently-cased retry is still suppressed) and the PK, making the send-path lookup a
single indexed hit. `reason`/`source` are for auditing why an address is blocked.

```sql
CREATE TABLE IF NOT EXISTS suppressions (
  email       TEXT PRIMARY KEY,               -- canonicalizeEmail() form; matches the send-path lookup
  reason      TEXT NOT NULL,                   -- 'hard_bounce' | 'complaint' | 'manual' | 'spam_report'
  source      TEXT NOT NULL,                   -- provider event id / 'admin:<user_id>' for provenance
  detail      TEXT,                            -- bounce sub-type or diagnostic (no PII beyond the code)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Only **hard** bounces (mailbox doesn't exist, blocked domain) and **complaints** (marked as spam)
suppress. A **soft** bounce (full mailbox, transient greylisting) does NOT — the ESP retries those
itself; suppressing on a transient failure would wrongly cut off a real user. Manual entries
(`reason='manual'`) let an admin block an address; provide an un-suppress path too (a user who fixed
their mailbox and re-verifies should be removable), gated to admins with a DB role re-check as in
[auth-email-flows.md](auth-email-flows.md).

## 4. Bounce/complaint webhook — reuse the signed-webhook pipeline

The ESP POSTs bounce and complaint (spam-report) events to a webhook. This is exactly the pattern in
[integrations-webhooks.md](integrations-webhooks.md): raw-body capture before `express.json`, a
signature/secret check, verify-then-parse, then a fast ack. Register the provider in that file's
frozen allowlist and add a verifier for its scheme; below is the **handler** that converts a verified
event into a suppression (or clears one), which slots into that file's `HANDLERS` map or a dedicated
route. The write is idempotent on `email` via `INSERT OR IGNORE`, so a re-delivered event is a no-op.

```js
// src/webhooks/email-events.js — invoked with an already-VERIFIED, parsed provider event.
// Signature verification happened upstream (integrations-webhooks.md §3); this only maps semantics.
import * as db from '../db/index.js';
import { logger } from '../lib/logger.js';
import { canonicalizeEmail } from '../lib/email.js';

// Map the provider's event vocabulary to our two suppressing reasons. Anything not listed here
// (soft bounces, deliveries, opens) is intentionally ignored — only permanent failures suppress.
function suppressionReason(event) {
  // Postmark uses RecordType/Type; SES uses notificationType (SNS) or eventType (event publishing).
  const type = String(event.RecordType || event.Type || event.notificationType || event.eventType || '').toLowerCase();
  if (type === 'spamcomplaint' || type === 'complaint') return 'complaint';
  // Postmark marks permanent failures with TypeCode 1 (HardBounce) / Inactive=true; SES uses
  // bounceType='Permanent'. Treat ONLY those as hard — never suppress a Transient/soft bounce.
  const hard = event.Type === 'HardBounce'
    || event.bounce?.bounceType === 'Permanent'
    || (event.TypeCode === 1);
  return hard ? 'hard_bounce' : null;
}

export async function handleEmailEvent(event) {
  const rawEmail = event.Email || event.Recipient
    || event.bounce?.bouncedRecipients?.[0]?.emailAddress
    || event.complaint?.complainedRecipients?.[0]?.emailAddress;
  if (!rawEmail) { logger.warn({ recordType: event.RecordType }, 'email event without recipient'); return; }
  const email = canonicalizeEmail(rawEmail);
  const reason = suppressionReason(event);
  if (!reason) return; // soft bounce / non-suppressing event — the ESP handles retries itself

  // Idempotent suppress: INSERT OR IGNORE keeps the FIRST reason/source; a duplicate event no-ops.
  // Store the provider event id as source for provenance; store no message body / PII.
  await db.run(
    `INSERT OR IGNORE INTO suppressions (email, reason, source, detail)
     VALUES (?, ?, ?, ?)`,
    [email, reason, String(event.ID ?? event.MessageID ?? event.mail?.messageId ?? 'esp'), String(event.Description ?? '').slice(0, 200)]
  );
  logger.warn({ reason, category: event.Tag }, 'address suppressed from bounce/complaint');
}
```

Rationale: the webhook's authenticity is guaranteed by the shared signed-webhook path; this handler
only translates a permanent failure into a durable "stop mailing this address" fact, idempotently.

## 5. Multipart text+HTML templates — one place, always both parts

Every message ships a plaintext AND an HTML part. Rationale: a text/plain alternative measurably
improves inbox placement (spam filters distrust HTML-only mail), is what plaintext clients and
screen readers read, and forces you to keep a link that works without rendering — critical for a
reset link. Templates live in one module so subjects and bodies aren't scattered across routes, and
the data is escaped, never concatenated as HTML.

```js
// src/lib/email-templates.js — renderTemplate(name, data) -> { subject, text, html }.
import { env } from './env.js';

// Escape interpolated values — links come from OUR env.APP_ORIGIN + an opaque token, but escape
// anyway so a display name / product string can never break the markup.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A shared frame emits BOTH parts in parallel so text and HTML never drift out of sync.
function frame({ heading, body, url, label }) {
  const foot = "If you didn't request this, you can ignore this email.";
  return {
    text: `${heading}\n\n${body}\n\n${label}: ${url}\n\n${foot}`,
    html: `<!doctype html><body style="font-family:system-ui,sans-serif;max-width:520px">` +
      `<h1 style="font-size:18px">${esc(heading)}</h1><p>${esc(body)}</p>` +
      `<p><a href="${esc(url)}">${esc(label)}</a></p>` +
      `<p style="color:#666;font-size:13px">${foot}</p></body>`,
  };
}

// Each template maps data to a subject + the shared frame. Callers pass a token/opaque data — NEVER
// user HTML. magic, invite, lockout, breach-alert follow the same shape.
const TEMPLATES = {
  reset: (d) => ({ subject: 'Reset your password',
    ...frame({ heading: 'Reset your password', body: 'Use the link below within 15 minutes.',
      url: `${env.APP_ORIGIN}/reset?token=${d.token}`, label: 'Reset password' }) }),
  verify: (d) => ({ subject: 'Verify your email',
    ...frame({ heading: 'Confirm your email', body: 'Confirm this address to finish signing up.',
      url: `${env.APP_ORIGIN}/verify?token=${d.token}`, label: 'Verify email' }) }),
  'new-device': (d) => ({ subject: 'New sign-in to your account',
    ...frame({ heading: 'New device signed in', body: `A new sign-in occurred from ${d.location ?? 'an unrecognized device'}.`,
      url: `${env.APP_ORIGIN}/security`, label: 'Review activity' }) }),
};

export function renderTemplate(name, data) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`unknown email template: ${name}`); // fail loudly in dev, never send blank
  const { subject, text, html } = t(data);
  return { subject, text, html };
}
```

## 6. Per-recipient send rate limit + must-deliver monitoring

Cap how often a *single address* can be mailed for a given flow, independent of the per-route
[rate-limiting](rate-limiting-and-abuse.md) that guards the endpoint. Rationale: the endpoint limiter
throttles a client hammering *your API*; this throttles how many messages *land in one inbox* — the
signal ESPs and receivers read as "is this sender spamming a mailbox?" Reuse the DB, not an in-memory
counter, so the cap holds across [cluster](cluster-scaling.md) workers.

```js
// Inside sendMail, before the provider call (add to §2). One row per (email, category) window.
// Rationale: a per-recipient cap protects reputation even if an upstream loop mis-fires; the
// endpoint limiter can't see cross-process send volume, this can.
const PER_RECIPIENT = { window: 3600, max: 5 }; // <=5 of any one category to an address per hour
const since = Math.floor(Date.now() / 1000) - PER_RECIPIENT.window;
const recent = await db.get(
  `SELECT COUNT(*) AS n FROM mail_log WHERE email = ? AND category = ? AND created_at > ?`,
  [recipient, category, since]);
if (recent.n >= PER_RECIPIENT.max) {
  logger.warn({ category }, 'send skipped: per-recipient rate cap');
  return { ok: false, skipped: 'rate_capped' };
}
// ...on success, record it: INSERT INTO mail_log (email, category, created_at) VALUES (?, ?, unixepoch())
```

```sql
-- add to src/db/schema.sql — feeds the per-recipient cap AND the delivery-rate monitor below.
CREATE TABLE IF NOT EXISTS mail_log (
  id          INTEGER PRIMARY KEY,
  email       TEXT    NOT NULL,               -- canonical recipient (drop on retention sweep)
  category    TEXT    NOT NULL,               -- same enum as sendMail
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_maillog_rate ON mail_log (email, category, created_at);
```

**Must-deliver monitoring**: security categories are the ones a user is *blocked* without, so watch
them. The ESP's per-tag bounce/complaint stats (or a periodic query joining `mail_log` sends against
`suppressions` created in the same window) give a per-flow failure rate; alert (see
[observability.md](observability.md)) when the complaint rate for `reset`/`verify`/`new-device`
crosses a low threshold (e.g. >0.1% complaints or a bounce spike). A rising complaint rate on
security mail is an early warning that your reputation — and therefore every user's ability to reset
a password — is degrading.

## 7. Checklist

- SPF (`-all`), DKIM, DMARC published for a **dedicated transactional subdomain**; DMARC ramped
  `none → quarantine → reject` with strict alignment (`adkim=s; aspf=s`) once `rua` shows 100% pass.
- Every send goes through `sendMail`; **suppression checked first**, address canonicalized before the
  lookup so a re-cased retry is still blocked.
- Only **hard bounces + complaints** suppress; soft bounces never do (ESP retries them).
- Bounce/complaint webhook rides the signed-webhook path ([integrations-webhooks.md](integrations-webhooks.md)):
  raw body, signature verified, verify-then-parse, idempotent `INSERT OR IGNORE` suppress.
- Every message is **multipart text+HTML**; bodies come from templates, interpolated values escaped,
  no route builds raw HTML.
- Per-recipient, per-category rate cap in the DB (survives clustering), separate from the endpoint limiter.
- Security categories tagged and monitored; alert on a complaint/bounce spike for reset/verify/new-device.
- Logs carry `category` + provider message id only — **never** the recipient, token, link, or body.

## 8. New env vars

Add to `.env.example` and the zod object in `src/lib/env.js` (see [env-and-secrets.md](env-and-secrets.md)).
Provider token is a secret (secret manager, never inline, never logged); the rest are config.

```ini
POSTMARK_TOKEN=CHANGE_ME              # ESP server token — SECRET
POSTMARK_STREAM=outbound              # dedicated transactional message stream (isolated reputation)
MAIL_FROM=no-reply@mail.example.com   # aligned with the DKIM/DMARC subdomain in §1
# APP_ORIGIN is already defined by auth-email-flows.md (link base for template URLs).
# The ESP bounce/complaint webhook secret registers via integrations-webhooks.md's env block.
```

```js
// src/lib/env.js — inside EnvSchema (validated at boot; a missing token fails fast, never leaks).
POSTMARK_TOKEN: z.string().min(1),
POSTMARK_STREAM: z.string().min(1).default('outbound'),
MAIL_FROM: z.email(), // zod v4 top-level validator; z.string().email() is deprecated (input-validation.md)
```