# Frontend quality

Why this design: the frontend already trusts nothing off the wire ([frontend-data-and-forms.md](frontend-data-and-forms.md))
and the backend already emits stable `{ error, code }` envelopes ([api-conventions.md](api-conventions.md)) and a nonce'd
CSP ([security-hardening.md](security-hardening.md)). This file closes the remaining *quality* gaps that only surface in a
real app: a crash on one page must not wedge the whole SPA, a strict CSP has to survive the Vite build, colors must not be
hardcoded so dark mode is a class toggle, user-facing strings must be Hungarian-first, and the growing pile of "send an
email" call sites needs one dispatch path. Everything layers on existing pieces — the `ErrorBoundary` class
([frontend-conventions.md](frontend-conventions.md)), the `api()` refresh-and-retry, the helmet CSP, the `notifySecurity()`
cooldown ([auth-account-protection.md](auth-account-protection.md)) — and never reinvents them.

## i18n with react-i18next (Hungarian primary, English fallback) [should]

Rationale: strings live in one typed table so a typo in `t('key')` is a compile error, and the backend's error CODES map to
one localizable place instead of scattered inline text. `npm i i18next react-i18next`.

```ts
// apps/web/src/i18n/hu.ts — DEFAULT namespace and source of truth for keys. Hungarian first (HU primary).
export const hu = {
  common: { save: 'Mentés', cancel: 'Mégse', retry: 'Újra', loading: 'Betöltés…' },
  // Backend CODES (api-conventions.md ERR + transaction-endpoints.md TxError) → one localizable table.
  // Code identifiers stay English (per conventions); only the message is translated.
  errors: {
    INSUFFICIENT: 'Nincs elég fedezet.',
    IDEMPOTENCY_MISMATCH: 'Ismételt kérés eltérő adatokkal — töltsd újra az oldalt.',
    STALE_SESSION: 'A munkameneted lejárt. Jelentkezz be újra.',
    FORBIDDEN: 'Ehhez a művelethez nincs jogosultságod.',
    UNKNOWN: 'Váratlan hiba történt. Próbáld újra.',
  },
} as const;
```

```ts
// apps/web/src/i18n/en.ts — FALLBACK namespace. `: typeof hu` forces its key shape to match hu exactly.
import type { hu } from './hu';
export const en: typeof hu = {
  common: { save: 'Save', cancel: 'Cancel', retry: 'Retry', loading: 'Loading…' },
  errors: {
    INSUFFICIENT: 'Insufficient funds.',
    IDEMPOTENCY_MISMATCH: 'Repeated request with different data — reload the page.',
    STALE_SESSION: 'Your session expired. Please sign in again.',
    FORBIDDEN: 'You are not allowed to do this.',
    UNKNOWN: 'Something went wrong. Please try again.',
  },
};
```

```ts
// apps/web/src/i18n/index.ts + i18next.d.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { hu } from './hu';
import { en } from './en';

void i18n.use(initReactI18next).init({
  resources: { hu: { translation: hu }, en: { translation: en } },
  lng: 'hu', fallbackLng: 'en',            // Hungarian primary, English when a key is missing
  interpolation: { escapeValue: false },   // React already escapes; double-escaping mangles output
  returnNull: false,
});
export default i18n;

// i18next.d.ts — TYPED resources: t('errors.INSUFFICIENT') autocompletes, t('errors.typo') fails to compile.
// returnNull MUST live here (not only in init) or t() is typed string|null and every `return t(...)` below breaks.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof hu };
    returnNull: false;
  }
}
```

```ts
// apps/web/src/lib/errorMessage.ts — the ONE typed error→message layer (forms, boundary, toasts all use it).
import type { TFunction } from 'i18next';
import { ApiError } from './api';

const KNOWN = ['INSUFFICIENT', 'IDEMPOTENCY_MISMATCH', 'STALE_SESSION', 'FORBIDDEN'] as const;
type Known = (typeof KNOWN)[number];

// ApiError carries only { status, message } — message is the raw response text (the
// { error, code, requestId } envelope, api-conventions.md). There is no parsed `.body`, so
// pull the code out of the message defensively; a non-JSON body just yields UNKNOWN.
function codeOf(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  try { return (JSON.parse(err.message) as { code?: string }).code; } catch { return undefined; }
}

export function errorMessage(t: TFunction, err: unknown): string {
  const code = codeOf(err);
  const key = (KNOWN as readonly string[]).includes(code ?? '') ? (code as Known) : 'UNKNOWN';
  return t(`errors.${key}`);              // never render a raw code; unknown → localized UNKNOWN
}
```

Import `./i18n` once in `main.tsx` before `<App />`; in components `const { t } = useTranslation()`. Language never comes
from `localStorage` — persist it in the same cookie as the theme (below).

## Global error boundary upgrade + client error reporting [must]

Rationale: one crashed route must not wedge the SPA, an expired session is a redirect (not a red page), and a real crash
sends a *scrubbed* report — never cookies, PII, or tokens.

```tsx
// apps/web/src/components/ErrorBoundary.tsx — extends the class from frontend-conventions.md.
// (1) reset on route change  (2) auth-expiry ≠ crash  (3) scrubbed POST to /api/client-errors.
import { Component, type ReactNode } from 'react';

// Thrown by api() ONLY after a failed refresh (an unrecoverable 401). The boundary treats it as "log in again".
export class AuthExpiredError extends Error {}

interface Props {
  children: ReactNode;
  resetKeys: unknown[];        // e.g. [location.key] — a change clears a stale crash on navigation
  onAuthExpired: () => void;   // clears useAuth user + redirects to /login
  release: string;             // build hash (VITE_RELEASE) — correlates report ↔ source map
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidUpdate(prev: Props) {
    // Reset on route change so a crash on one page doesn't persist onto the next.
    if (this.state.error && !same(prev.resetKeys, this.props.resetKeys)) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    if (error instanceof AuthExpiredError) return this.props.onAuthExpired(); // redirect, not a crash report
    // Scrubbed report. NEVER cookies / PII / tokens — only these five fields (backend zod .strict() enforces it too).
    void fetch('/api/client-errors', {
      method: 'POST', credentials: 'include', keepalive: true,      // survives an immediate reload
      // Sec-Fetch-Site + JSON body + this header satisfy csrfProtection (auth-blueprint.md); the HttpOnly
      // cookie authenticates — we never read it.
      headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 4000),
        route: location.pathname,       // pathname only — query strings can carry tokens/PII
        release: this.props.release,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});                 // reporting must never throw during a crash
  }

  render() {
    if (!this.state.error) return this.props.children;
    // AuthExpiredError: getDerivedStateFromError has ALREADY set state (that is what stops re-rendering the
    // crashed child), so gate here — render nothing while the onAuthExpired redirect lands, never the red fallback.
    if (this.state.error instanceof AuthExpiredError) return null;
    return <div className="p-8 text-center bg-surface text-danger">Hiba történt — töltsd újra az oldalt.</div>;
  }
}
const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
```

```tsx
// App.tsx — wrap routes; useLocation().key changes on every navigation, clearUser comes from useAuth.
function BoundaryWrapper({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { clearUser } = useAuth();
  return (
    <ErrorBoundary resetKeys={[location.key]} release={import.meta.env.VITE_RELEASE ?? 'dev'}
      // window.location explicitly — the router's `location` above shadows the global, and it has no .assign().
      onAuthExpired={() => { clearUser(); window.location.assign('/login'); }}>
      {children}
    </ErrorBoundary>
  );
}
```

```js
// apps/api/src/routes/client-errors.js — pino logs the scrubbed report to server.log (observability.md).
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { csrfProtection } from '../auth/middleware.js';   // same guard every mutating route uses (auth-blueprint.md)

// .strict(): a client that adds cookie/token/email fields is REJECTED, not silently logged (defence in depth).
const ClientErrorSchema = z.object({
  message: z.string().max(500), stack: z.string().max(4000).optional(),
  route: z.string().max(200), release: z.string().max(64), userAgent: z.string().max(300),
}).strict();

const limiter = rateLimit({ windowMs: 60_000, limit: 30, skip: () => process.env.NODE_ENV === 'test' });

export const clientErrors = Router();
// Public (a crash can happen while logged out) but CSRF-guarded so it can't be POSTed cross-site. requireAuth
// is intentionally NOT applied; req.user is set only if a valid access cookie rode along, else undefined.
clientErrors.post('/api/client-errors', csrfProtection, limiter, (req, res) => {
  const parsed = ClientErrorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid report', code: 'VALIDATION' });
  // userId from the session only — NEVER a client-supplied id; no PII beyond that. May be undefined when logged out.
  req.log.warn({ clientError: parsed.data, userId: req.user?.id }, 'client error report');
  res.status(204).end();
});
```

As shipped in [frontend-conventions.md](frontend-conventions.md), `api()`'s catch block re-throws the original
`ApiError(401, ...)` when `tryRefresh()` comes back `false`. Swap that one throw for `AuthExpiredError` so the boundary can
tell expiry from a crash — everything else about `api()` (dedup'd refresh, Web Locks, single retry) is unchanged:

```ts
// apps/web/src/lib/api.ts — the ONLY change vs frontend-conventions.md: what gets thrown after a failed refresh.
import { AuthExpiredError } from '../components/ErrorBoundary';

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  try {
    return await request<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      if (await tryRefresh()) return request<T>(path, options); // one retry with the fresh access cookie
      throw new AuthExpiredError();       // refresh itself failed — unrecoverable, not a bare 401 anymore
    }
    throw err;
  }
}
```

Every other 401 an endpoint can still return (e.g. one that intentionally skips the refresh dance) stays a plain
`ApiError(401)` and flows through `errorMessage()`'s `STALE_SESSION` copy in a form/toast instead of the boundary — only
the refresh-retry seam upgrades to `AuthExpiredError`.

## Strict CSP coordinated with helmet + Vite [must]

Rationale: the strict backend CSP ([security-hardening.md](security-hardening.md)) only holds if the Vite *build* emits no
inline scripts and the API stays same-origin so cookies stay first-party — this is the frontend half of that contract, not
a second policy.

The CSP is defined ONCE by helmet in [security-hardening.md](security-hardening.md) (nonce'd `script-src`,
`connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, plus helmet's default `Strict-Transport-Security` and
`X-Content-Type-Options: nosniff`). Do not redefine it. Make the build satisfy it:

```ts
// vite.config.ts — prod build is CSP-compatible by construction; dev proxy keeps cookies first-party.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// git may be absent in a tarball/CI build (deployment.md) — never let config eval throw. Prefer an injected
// env, then git, then a stable fallback.
function release(): string {
  if (process.env.VITE_RELEASE) return process.env.VITE_RELEASE;
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; }
}

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_RELEASE': JSON.stringify(release()) }, // → error-report ↔ source-map correlation
  // Stamp nonce="%CSP_NONCE%" on every built <script>, stylesheet <link> AND modulepreload <link>; the SPA
  // fallback replaceAll()s the placeholder per request (security-hardening.md). Without this the Vite-injected
  // modulepreload <link>s carry no nonce and the strict script-src (no 'self') reports violations. The build
  // itself emits no inline <script> — code loads via external hashed modules, and the modulepreload polyfill
  // is bundled into the entry chunk, not inlined. Do not introduce inline <script>.
  html: { cspNonce: '%CSP_NONCE%' },
  // DEV ONLY: reach the API through this proxy so the browser sees ONE origin and HttpOnly cookies stay
  // first-party — the same reason connect-src can be 'self' with no host allowlist.
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

Dev vs prod, the one real difference: the Vite dev server injects an inline HMR/react-refresh script and inline styles the
strict nonce policy forbids. Do NOT weaken the prod policy for dev — serve a looser CSP only when
`NODE_ENV !== 'production'` (add `'unsafe-inline'`/`'unsafe-eval'` and the Vite dev origin to `script-src`/`connect-src` in
the helmet block, gated on env). In prod the app is served same-origin (static build behind the same host / the reverse
proxy in [deployment.md](deployment.md)), so `connect-src 'self'` covers the whole API — no cross-origin exception ever.

Verify in e2e: load every route, assert `0` CSP violations in the console, and confirm `Strict-Transport-Security` +
`X-Content-Type-Options: nosniff` are present (free from helmet defaults — [security-checklist.md](security-checklist.md)).

## Design tokens + dark mode in Tailwind (CSS-variable driven) [should]

Rationale: two layers (primitive scales → semantic names) driven by CSS variables make dark mode a class toggle that swaps
variable *values*, and let backend error states (danger/warning/success) map to semantic tokens, not raw hex.

```css
/* apps/web/src/styles/tokens.css — LAYER 1 primitives → LAYER 2 semantic tokens; dark swaps only the values. */
:root {
  --gray-0:#fff; --gray-100:#f4f4f5; --gray-800:#27272a; --gray-950:#09090b;   /* L1: only place raw colors live */
  --red-600:#dc2626; --amber-500:#f59e0b; --green-600:#16a34a;
  --color-surface:var(--gray-0); --color-text:var(--gray-950); --color-muted:var(--gray-800); /* L2: components use ONLY these */
  --color-danger:var(--red-600); --color-warning:var(--amber-500); --color-success:var(--green-600);
}
:root.dark {                    /* dark = same semantic names, remapped primitives — no component/class changes */
  --color-surface:var(--gray-950); --color-text:var(--gray-0); --color-muted:var(--gray-100);
}
```

```ts
// tailwind.config.ts — darkMode:'class'; colors point at the variables, not hex (the 'tokens in config' rule).
import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',                                       // toggled by `dark` on <html>, not the OS media query
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    surface: 'var(--color-surface)', text: 'var(--color-text)', muted: 'var(--color-muted)',
    danger: 'var(--color-danger)', warning: 'var(--color-warning)', success: 'var(--color-success)', // maps API states
  } } },
} satisfies Config;
```

```ts
// apps/web/src/lib/theme.ts — theme in a COOKIE (not localStorage), matching the no-localStorage ethos.
export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // First-party, non-HttpOnly (the pre-hydration script reads it), 1 year, Lax. No PII — just a mode flag.
  document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
```

```html
<!-- index.html <head>, FIRST — set the class before React hydrates so there is no flash-of-wrong-theme (FOUC). -->
<script>
  (function () {
    var m = document.cookie.match(/(?:^|; )theme=(light|dark)/);
    if (m ? m[1] === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.add('dark');
  })();
</script>
```

Because `html.cspNonce` (build config above) stamps the `%CSP_NONCE%` placeholder on this inline tag too, it is
authorized per request like every other script — no `'unsafe-inline'`, no hash bookkeeping. (If this HTML is ever served
outside the nonce-templating path from [security-hardening.md](security-hardening.md), a static sha256 hash of the script
in `script-src` works instead — the script never changes.)

## Notification abstraction & preferences / quiet-hours [should]

Rationale: the catalog keeps adding senders (verify, reset, new-device, lockout, breach, invite) that each call
`sendMail()` directly ([auth-account-protection.md](auth-account-protection.md)); one dispatch layer gives every feature
preferences, one rate limit, localization, and unsubscribe, while security-critical alerts stay non-optional.

```sql
-- migrations (db-migrations-backups.md). Optional categories default ON; security ones aren't stored (can't be off).
CREATE TABLE notification_prefs (
  user_id    INTEGER NOT NULL,
  category   TEXT    NOT NULL,           -- 'product_update' | 'invite' | 'digest' — OPTIONAL categories only
  enabled    INTEGER NOT NULL DEFAULT 1,
  consent_at TEXT    NOT NULL DEFAULT (datetime('now')),  -- records opt-in/out for unsubscribe compliance
  PRIMARY KEY (user_id, category),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE users ADD COLUMN quiet_start TEXT;  -- 'HH:MM' or NULL; holds optional (non-security) notifications
ALTER TABLE users ADD COLUMN quiet_end   TEXT;
ALTER TABLE users ADD COLUMN quiet_tz    TEXT;  -- IANA zone, e.g. 'Europe/Budapest'; validate at write time (zod)
```

```js
// apps/api/src/notify/dispatch.js — the SINGLE path every feature routes through. Channel-agnostic (email now,
// in-app/SMS later share this signature). Sits ABOVE the sendMail() facade (email-deliverability.md): prefs,
// quiet hours and coalescing live here; suppression, templating and log hygiene stay in the mailer.
import { logger } from '../lib/logger.js';
import { sendMail } from '../lib/mailer.js';
import * as db from '../db/index.js';
import { unsubscribeUrl } from './unsubscribe.js';

// Security categories (spelled exactly as in the mailer's MailInput category enum — ONE vocabulary) are
// NON-OPTIONAL and documented so: they IGNORE prefs AND quiet-hours (a user must always learn their account was
// touched, and a magic link they just requested must never be held) but still coalesce. Everything else
// ('product_update', 'invite', 'digest', … — add new optional categories to the MailInput enum) is opt-outable
// and quiet-hours-aware.
const SECURITY = new Set(['verify', 'reset', 'magic', 'new-device', 'lockout', 'breach-alert']);

const lastSent = new Map();                       // `${userId}:${category}` -> epoch ms (per-process; fine clustered)
const COOLDOWN_MS = 60_000;

export async function notify({ userId, category, templateKey, vars = {}, locale = 'hu' }) {
  const security = SECURITY.has(category);
  const user = await db.get('SELECT id, email, quiet_start, quiet_end, quiet_tz FROM users WHERE id = ?', [userId]);
  if (!user) return;

  if (!security) {
    const pref = await db.get(
      'SELECT enabled FROM notification_prefs WHERE user_id = ? AND category = ?', [userId, category]);
    if (pref && pref.enabled === 0) return;       // opted out (default ON if no row)
    if (inQuietHours(user)) return;               // held during quiet hours
  }

  // Global per-user coalescing so no feature (or retry storm) can flood a user — generalizes the lockout
  // 'rate-limit the notifications' note to every sender. Applies to security categories too.
  const key = `${userId}:${category}`;
  if ((lastSent.get(key) ?? 0) + COOLDOWN_MS > Date.now()) return;
  lastSent.set(key, Date.now());

  // Render + send through the mailer facade. Its zod-.strict() input (email-deliverability.md) is currently
  // { to, template, data, category } — never raw subject/text, so no caller can inject unescaped input into a
  // body. `locale` rides in data for renderTemplate's lookup into the shared notify.* i18n tables (hu primary,
  // en fallback). REQUIRED companion change: add `listUnsubscribe: z.string().url().optional()` to MailInput in
  // email-deliverability.md and have sendMail set the List-Unsubscribe header when present (optional mail only)
  // — a .strict() schema throws on an unknown key, so this call is broken until that field exists.
  const listUnsubscribe = security ? undefined : unsubscribeUrl(userId, category);

  // Best-effort, never blocks the triggering request (auth-account-protection.md rule): a mailer outage must
  // not turn a login into a 500. sendMail returns a RESULT object instead of throwing (suppressed/send-failed
  // are normal outcomes) — check .ok; the .catch only guards unexpected bugs. No PII in the log line.
  queueMicrotask(() => {
    sendMail({ to: user.email, template: templateKey, data: { ...vars, locale }, category, listUnsubscribe })
      .then((r) => { if (!r.ok) logger.warn({ userId, category, reason: r.skipped ?? r.error }, 'notify send failed'); })
      .catch((err) => logger.warn({ userId, category, err: err.message }, 'notify send failed'));
  });
}

function inQuietHours(user) {
  if (!user.quiet_start || !user.quiet_end || !user.quiet_tz) return false;
  let now;
  try {
    // hourCycle 'h23', NOT hour12:false — legacy ICU maps the latter to h24 and renders midnight as '24:00',
    // which breaks the string compare below.
    now = new Intl.DateTimeFormat('en-GB',
      { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: user.quiet_tz }).format(new Date());
  } catch { return false; }                                // a bad stored zone must not take the send path down
  const [s, e] = [user.quiet_start, user.quiet_end];       // 'HH:MM' compare; handles windows wrapping past midnight
  return s <= e ? now >= s && now < e : now >= s || now < e;
}
```

```js
// apps/api/src/notify/unsubscribe.js — signed, forge-proof opt-out. HMAC so a link can't be edited to opt OTHER
// users out; timing-safe compare. Only optional categories are unsubscribable.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env.js';
import * as db from '../db/index.js';

// Dedicated purpose string in the MAC prevents cross-use with any other JWT_SECRET-keyed MAC. Links do rotate
// out if JWT_SECRET is rotated (auth keyring) — acceptable for an unsubscribe link.
const mac = (u, c) => createHmac('sha256', env.JWT_SECRET).update(`unsub:${u}:${c}`).digest('base64url');
export const unsubscribeUrl = (u, c) => `${env.APP_ORIGIN}/api/notify/unsubscribe?u=${u}&c=${c}&t=${mac(u, c)}`;

export async function handleUnsubscribe(req, res) {
  const { u, c, t } = req.query;
  const expected = Buffer.from(mac(String(u), String(c)));
  const got = Buffer.from(String(t ?? ''));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {  // constant-time before any write
    return res.status(400).json({ error: 'invalid unsubscribe link', code: 'VALIDATION' });
  }
  // Record the opt-out WITH a consent timestamp (compliance); UPSERT so a repeat click is idempotent.
  await db.run(
    `INSERT INTO notification_prefs (user_id, category, enabled, consent_at) VALUES (?, ?, 0, datetime('now'))
     ON CONFLICT(user_id, category) DO UPDATE SET enabled = 0, consent_at = datetime('now')`, [u, c]);
  res.status(200).json({ ok: true });
}
```

Every user-addressed feature now calls `notify({ userId, category, templateKey, vars, locale })` — never `sendMail()`
directly. (Flows that mail a non-user address — e.g. an invite to a brand-new email — keep calling `sendMail()`: there is
no user row to gate on.) Templates live in the shared `notify.*` i18n keys (Hungarian primary, English fallback), rendered
inside the mailer's `renderTemplate()` ([email-deliverability.md](email-deliverability.md)), so a new locale is one table,
not a code change. Security categories (`verify`/`reset`/`magic`/`new-device`/`lockout`/`breach-alert`) are documented
**non-optional**: they skip the preference and quiet-hours gates but still coalesce — exactly the "rate-limit the
notifications to avoid a spam vector" property the lockout item asks for, generalized to every sender.

## Env vars

Nothing new: `APP_ORIGIN` (the absolute origin unsubscribe links are built from) is already in the zod schema —
[config-and-topology.md](config-and-topology.md) owns it. The FOUC/CSP notes above assume the frontend is served from
that same origin.