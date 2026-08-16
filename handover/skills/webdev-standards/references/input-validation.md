# Input validation & sanitization

**The attacker can forge any request.** curl or Burp send whatever bytes they like — missing
fields, extra fields, wrong types, huge strings, `__proto__` keys, spoofed `Content-Type`.
Validation is not frontend UX duplicated on the server; it is the trust boundary. Every handler
parses its input through a `.strict()` zod schema BEFORE the value is read: regex-bound the shape,
integer-bound the size, allowlist the enumerations — then the handler only ever sees values you
already proved safe. This pairs with the server-side-calculation rule in
[transaction-endpoints.md](transaction-endpoints.md): the client sends *intent*, validated here;
the server computes every *consequence*.

Rules:
- One schema per input surface; `.parse()` (throws → the central 400) or `.safeParse()`. Never
  read `req.body.x` before validation.
- `.strict()` EVERYWHERE — an unknown field is an attack (mass assignment), not a convenience.
- Bound everything: strings get `.min/.max` + a regex; numbers get `.int()` + range. An unbounded
  `z.string()` is a DoS vector and a storage bomb.
- Validate at the edge; the DB layer then trusts its inputs (with prepared statements as the
  defense-in-depth net). Coerce explicitly and only for query params — never let a permissive
  coercion turn `"0"`/`[]`/`"false"` into a value you didn't intend.

## src/lib/schemas.js — the reusable piece library

Battle-tested building blocks. Compose these; do not hand-roll a new email/URL regex per route.

```js
// src/lib/schemas.js — shared zod pieces. Import and compose; keep the regexes in ONE place.
import { z } from 'zod';

// Email: normalize (trim + lowercase) BEFORE validating so "  Foo@X.io " and "foo@x.io" are one
// identity — otherwise UNIQUE(email) is bypassable and login lookups miss. z.email() is zod v4's
// dedicated validator (the old z.string().email() is deprecated). Cap at the RFC 5321 max of 254.
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email()); // run the format check AFTER normalization, on the cleaned value

// Username: explicit allowlist, anchored, length-bounded. No dots or unicode homoglyphs — those
// enable impersonation and confusable-name attacks. 3-32 chars: the inner
// class allows 1-30 between a required first and last alnum char.
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30})[a-z0-9]$/;
export const username = z.string().trim().toLowerCase().regex(USERNAME_RE, 'invalid username');

// Password: a POLICY, not a format. Length is the real strength driver (NIST 800-63B), so require
// length first, then a modest character-class mix. Cap at 128 — argon2 hashes any length, but an
// unbounded password is a CPU-DoS on the hash. NOTE: never .trim() a password (trailing spaces
// are legitimate secret material) and never regex-reject characters (kills passphrases/emoji).
export const password = z
  .string()
  .min(12, 'use at least 12 characters')
  .max(128)
  .refine((s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s), 'mix upper, lower, digits');

export const uuid = z.uuid(); // RFC 9562/4122; zod v4 built-in (was z.string().uuid())

// URL with a PROTOCOL ALLOWLIST — a bare url() still accepts javascript:, data:, file: which are
// XSS / SSRF / local-file vectors. Parse, then assert the scheme against an explicit set.
const URL_PROTOCOLS = new Set(['http:', 'https:']);
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((s) => {
    try {
      return URL_PROTOCOLS.has(new URL(s).protocol);
    } catch {
      return false; // not a parseable absolute URL
    }
  }, 'must be an http(s) URL');

// Safe short string for names/titles/labels: bounded, and NO control chars or line breaks (which
// enable log injection and header/CSV smuggling downstream). The class bans C0 controls (0x00-0x1F)
// and DEL (0x7F); letters, digits, punctuation, spaces, and unicode are all allowed. Reuse this
// instead of a bare z.string() for any free-text-ish field that isn't a full document body.
export const SAFE_SHORT_RE = /^[^\x00-\x1F\x7F]{1,200}$/;
export const safeShortString = z.string().trim().min(1).regex(SAFE_SHORT_RE, 'invalid characters');

// Money: bounded positive integer MINOR units (cents / fillér). Floats are forbidden — 0.1 has no
// exact binary form. The hard max is a business ceiling that also blocks overflow arithmetic.
export const moneyCents = z.number().int().positive().max(100_000_000);

// ISO date (calendar date, no time) — zod v4 format helper; keep it a string, parse to a real
// date only where you need arithmetic. Use z.iso.datetime() for full timestamps.
export const isoDate = z.iso.date();

// Pagination: coerce (query strings are always text) and clamp. The max page size is the real
// guard — an unbounded limit lets a client pull the whole table in one request.
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

// Positive DB id — the common path param. Coerced because it arrives from the URL as text.
export const idParam = z.coerce.number().int().positive();
```

Usage — compose into per-route schemas, always `.strict()`:

```js
import { z } from 'zod';
import { email, username, password, safeShortString, httpUrl } from '../lib/schemas.js';

export const RegisterSchema = z.object({ email, username, password }).strict();
export const UpdateProfileSchema = z.object({
  displayName: safeShortString,
  website: httpUrl.optional(),
}).strict();
```

## src/lib/validate.js — one middleware, uniform 400

Validates any of `body` / `query` / `params` and writes the parsed (coerced, stripped, typed)
value to `req.valid.<key>` — handlers read only from there, never from the raw `req.query` etc.
A failure returns a single uniform shape; the schema decides the rules, the middleware decides the
response.

```js
// src/lib/validate.js
// IMPORTANT (express 5): req.query is a GETTER with no setter — you cannot reassign it, and
// mutating it in place (Object.assign) does not reliably persist because it is recomputed lazily
// from the URL. So we never touch req.body/req.query/req.params; the validated result lives on a
// namespaced req.valid.{body,query,params}. Handlers read req.valid.*, not the raw fields.
export const validate = (schemas) => (req, res, next) => {
  req.valid ??= {};
  for (const key of ['params', 'query', 'body']) {
    const schema = schemas[key];
    if (!schema) continue;
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      // Uniform 400. Field-level messages help legit clients; they leak no server internals
      // because the schema authored every message. Never echo the raw offending VALUE back.
      return res.status(400).json({
        error: 'invalid input',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.valid[key] = result.data;
  }
  next();
};
```

```js
// Route wiring — the handler reads req.valid, never an unvalidated field.
import { z } from 'zod';
import { validate } from '../lib/validate.js';
import { idParam, pagination } from '../lib/schemas.js';

router.get('/items',
  validate({ query: pagination }),
  async (req, res) => { const { page, pageSize } = req.valid.query; /* numbers, clamped */ });

router.patch('/items/:id',
  validate({ params: z.object({ id: idParam }).strict(), body: UpdateItemSchema }),
  async (req, res) => { const { id } = req.valid.params; /* positive int */ });
```

The central error handler in [server-skeleton.md](server-skeleton.md) already maps a thrown
`ZodError` to `400 invalid input`, so `.parse()` inside a handler is also fine; the middleware is
for the common declarative case and gives field-level detail.

## Coercion pitfalls (zod v4) and type-juggling

`req.body` is JSON so types are real. `req.query` / `req.params` are **always strings**, which is
where coercion is needed — and where it bites.

- `z.coerce.number()` uses `Number()`, so `""` → `0`, `"  "` → `0`, `[]` → `0` — and hex/exponent
  strings coerce too (`"0x10"` → `16`, `"1e3"` → `1000`), passing `.int()` without complaint. A
  bare `z.coerce.number()` silently accepts an empty query param as `0` — always add
  `.int().positive()` / `.min(1)`.
- `z.coerce.boolean()` is `Boolean()`: **every non-empty string is `true`**, including `"false"`.
  Never use it for flags. Use an enum:
  `z.enum(['true', 'false']).transform((v) => v === 'true')`.
- When the mapping matters, prefer an explicit transform:
  `z.string().regex(/^\d+$/).transform(Number)` cleanly rejects `"1.5"`/`""`/`"1e3"`.
- Duplicate query keys (`?id=1&id=2`) arrive as an ARRAY; a scalar schema correctly rejects it —
  do not `.coerce` it away.
- v4 API: use top-level `z.email()`, `z.uuid()`, `z.iso.date()` (the `z.string().email()` chain is
  deprecated); `.strict()` still means "reject unknown keys"; `z.record()` now REQUIRES both a key
  and a value schema — `z.record(z.string(), z.string())`, not `z.record(z.string())`.

## Prototype-pollution guard

`__proto__` / `constructor` / `prototype` keys can poison `Object.prototype` if the app later
merges untrusted input into an object. Two layers close this:

- **`.strict()` + a whitelist schema is the real fix**: any undeclared key — including
  `__proto__` — is rejected outright, so the polluting key never reaches application code.
- **`JSON.parse` is already safe for `__proto__`**: it defines an *own* property named
  `__proto__` rather than reassigning the prototype, so parsing alone does not pollute. Danger
  appears only if you then deep-merge/`_.set` that object with a library that walks `__proto__` —
  and strict validation already removed the key before any such merge.
- If you must accept a dynamic key/value map (rare), still reject reserved keys explicitly. zod v4
  strips `__proto__` from record/catchall output on its own (an upstream security fix), but
  `constructor` and `prototype` are ordinary own keys it will happily keep — so the refine below is
  what actually blocks those:
  ```js
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
  const safeRecord = z.record(z.string(), z.string())
    .refine((o) => Object.keys(o).every((k) => !FORBIDDEN.has(k)), 'forbidden key');
  ```
- Never build objects from user input with `obj[userKey] = v` without this guard.

## Headers you trust

Headers are client-controlled too. Validate the few you act on; derive the rest from
infrastructure, not the request.

- `req.ip` is trustworthy only when `TRUST_PROXY` matches the real hop count (see
  [env-and-secrets.md](env-and-secrets.md)) — otherwise `X-Forwarded-For` is spoofable and
  bypasses per-IP rate limits.
- CSRF headers (`Sec-Fetch-Site`, `X-CSRF`, `Content-Type`) are enforced by `csrfProtection` in
  [auth-blueprint.md](auth-blueprint.md); `Idempotency-Key` is regex-bounded in
  [transaction-endpoints.md](transaction-endpoints.md). Any other header you branch on gets the
  same treatment: `z.enum(['2024-01','2024-06']).catch('2024-06').parse(req.get('X-Api-Version'))`.
- Never reflect a raw header into a response, redirect `Location`, log line, or filename — it can
  carry CRLF (header/log injection) or path traversal.

## File upload validation

Trusting the filename or the client-sent `Content-Type` is the classic upload hole — both are
attacker-controlled. Enforce size, sniff the REAL type from magic bytes, allowlist the extension,
randomize the stored name, and store OUTSIDE the web root so an uploaded `.js`/`.html` can never
be served or executed.

```js
// src/uploads/routes.js — image upload. Packages: multer, file-type (ESM-only, matches our ESM stack).
import { Router } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from '../auth/middleware.js';
import { logger } from '../lib/logger.js';

// Buffer in memory with a HARD size cap enforced by multer itself — the limit must bite before
// the whole body is read, or a large upload is a memory-DoS. Store outside ./public.
const UPLOAD_DIR = path.resolve('./storage/uploads'); // NOT under any static-served directory
const MAX_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

// The allowlist is keyed by the SNIFFED mime → canonical extension. The client's extension and
// Content-Type are ignored entirely; only the magic-byte result decides.
const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const router = Router();

router.post('/avatar', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });

    // Sniff the actual bytes — do NOT trust req.file.mimetype or the original name. Note this is a
    // best-effort magic-byte hint, not a guarantee the file is well-formed — the re-encode below
    // is what actually neutralizes a malicious payload.
    const sniffed = await fileTypeFromBuffer(req.file.buffer);
    const ext = sniffed && ALLOWED.get(sniffed.mime);
    if (!ext) {
      logger.warn({ userId: req.user.id, claimed: req.file.mimetype }, 'rejected upload: type not allowed');
      return res.status(415).json({ error: 'unsupported file type' });
    }

    // Randomized filename: no user-controlled bytes in the path (kills traversal and overwrite),
    // canonical extension from the allowlist. mkdir -p once.
    await mkdir(UPLOAD_DIR, { recursive: true });
    const storedName = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, storedName), req.file.buffer, { flag: 'wx' }); // wx: never clobber

    // Serve later through an authenticated handler that streams the file — never via a static
    // mount over the storage dir. Persist storedName; never persist the original filename as a path.
    res.status(201).json({ file: storedName });
  } catch (err) { next(err); }
});

export default router;
```

Image hardening: re-encode with `sharp` (strips EXIF and neutralizes polyglot files that are valid
image + valid script), and serve downloads with `Content-Disposition: attachment` +
`X-Content-Type-Options: nosniff` so a browser never renders a stored file inline.

## Output side — encode for context, never concatenate

Validation stops bad input; correct *output encoding* stops that input from executing where it
lands. The rule is contextual: escape for the exact sink.

- **SQL**: parameterized queries only (`?` placeholders — the entire DB layer in
  [db-layer.md](db-layer.md) is prepared statements). NEVER interpolate a value into SQL text.
  The one place identifiers can't be parameters (table/column names) uses a hard-coded allowlist,
  never a string from the request.
- **HTML**: React escapes text by default — render `{value}`, and treat `dangerouslySetInnerHTML`
  as a red flag. If you must render user-supplied HTML, sanitize with a real allowlist library
  (DOMPurify) — never a regex. Building HTML by string concatenation on the server is forbidden.
- **JSON responses**: `res.json()` sets `Content-Type: application/json` and escapes properly; do
  not hand-build JSON strings. With `X-Content-Type-Options: nosniff` (helmet default) the browser
  won't reinterpret it as HTML.
- **Other sinks**: shell → pass an argv array to `execFile`, never `exec` with an interpolated
  string; redirects → allowlist the target path, never reflect a raw URL param into `Location`;
  logs → the `safeShortString` control-char ban above prevents log-injection line breaks.

The through-line: input is validated at the edge (this file), authority and amounts are computed
server-side ([transaction-endpoints.md](transaction-endpoints.md)), and output is encoded for its
sink. Skip any one layer and the other two don't save you.