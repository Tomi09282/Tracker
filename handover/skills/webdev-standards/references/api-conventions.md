# API conventions

Why this design: hand-rolled handlers drift — one returns `{ error }`, the next `{ message }`, a
third a bare string; one paginates with `?page=`, another with `?offset=`. Clients then special-case
every endpoint and one refactor breaks three of them. These conventions fix response shape, status
codes, pagination, and CORS once, so the frontend `api()` wrapper (see
[frontend-conventions.md](frontend-conventions.md)) is written against a single contract. They sit ON
TOP of the existing pieces — the central error handler and request-id middleware in
[server-skeleton.md](server-skeleton.md), the `csrfProtection` middleware in
[auth-blueprint.md](auth-blueprint.md), and the idempotency rules in
[transaction-endpoints.md](transaction-endpoints.md) — and never re-invent them.

## 1. Uniform JSON error envelope

Every error response — from validation to 500 — is the SAME shape. Clients branch on `code` (a
stable machine string), show `error` (a human message), and quote `requestId` in bug reports so a
support ticket maps to one log line (the `req.id` request-id middleware lives in
[server-skeleton.md](server-skeleton.md)).

```js
// src/lib/http.js — response helpers used by every route and the central error handler.

// Machine-readable codes are a CLOSED set: clients switch on them, so adding one is a contract
// change. Keep them coarse; detail goes in the message, never in a new ad-hoc code per call site.
export const ERR = {
  VALIDATION: 'VALIDATION',           // 400 / 422 — malformed or semantically invalid input
  UNAUTHORIZED: 'UNAUTHORIZED',       // 401 — no / bad / expired credentials
  FORBIDDEN: 'FORBIDDEN',             // 403 — authenticated but not allowed
  NOT_FOUND: 'NOT_FOUND',             // 404 — no such resource (or hidden by ownership scope)
  CONFLICT: 'CONFLICT',               // 409 — state clash (duplicate, insufficient funds, race)
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE', // 413
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE', // 415
  RATE_LIMITED: 'RATE_LIMITED',       // 429
  INTERNAL: 'INTERNAL',               // 500 — never leak the cause to the client
};

// req.id is attached upstream by the request-id middleware (server-skeleton.md); fall back so the
// helper never throws when called outside that chain (e.g. a very early failure).
export function sendError(res, status, code, error) {
  return res.status(status).json({ error, code, requestId: res.req?.id ?? null });
}

export function sendOk(res, data, status = 200) {
  return status === 204 ? res.status(204).end() : res.status(status).json(data);
}
```

Status-code table — the ONLY codes this API emits, each with one meaning:

| Status | `code`                   | Means                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------ |
| 400    | `VALIDATION`             | Syntactically bad request (malformed JSON, wrong types, bad cursor). |
| 401    | `UNAUTHORIZED`           | Missing/invalid/expired auth — client should refresh then retry.   |
| 403    | `FORBIDDEN`              | Authenticated but not permitted (role, CSRF, cross-origin).        |
| 404    | `NOT_FOUND`              | Resource does not exist — also the deliberate answer for IDOR-scoped rows. |
| 409    | `CONFLICT`               | State conflict: duplicate unique key, insufficient funds, lost race. |
| 413    | `PAYLOAD_TOO_LARGE`      | Body exceeded the size limit (§8).                                 |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | Non-JSON body on a write route.                                    |
| 422    | `VALIDATION`             | Well-formed but semantically invalid (fails a business rule).      |
| 429    | `RATE_LIMITED`           | Rate limit hit — honour `Retry-After`.                             |
| 500    | `INTERNAL`               | Unexpected server fault — generic message only, cause in the log.  |

400 vs 422: 400 = "I can't parse this"; 422 = "I parsed it, but it violates a rule" (e.g. transfer
to a closed account). A zod failure is always a shape/type problem → 400; 422 is reserved for
business rules you throw explicitly. When unsure, 400 is safe — but stay consistent within a resource.

Wire the envelope into the CENTRAL handler from [server-skeleton.md](server-skeleton.md) so no route
hand-builds error JSON (this replaces the bare `{ error }` bodies shown there):

```js
// server.js — central error handler, envelope form. Client gets generic text; cause stays in logs.
// Registered LAST, after all routes, so thrown/next(err) errors funnel here.
app.use((err, req, res, _next) => {
  if (err?.name === 'ZodError') return sendError(res, 400, ERR.VALIDATION, 'invalid input');
  if (err?.type === 'entity.parse.failed') return sendError(res, 400, ERR.VALIDATION, 'malformed JSON');
  if (err?.type === 'entity.too.large') return sendError(res, 413, ERR.PAYLOAD_TOO_LARGE, 'payload too large');
  logger.error({ err, requestId: req.id, method: req.method, url: req.originalUrl }, 'unhandled route error');
  return sendError(res, 500, ERR.INTERNAL, 'internal server error');
});
```

## 2. Uniform success shapes — 200 / 201 / 204

- **Single resource** → the object directly: `{ id, ... }`. No `{ data: ... }` wrapper for singletons.
- **Collection** → `{ items: [...], nextCursor }` (see §3). ALWAYS an object, never a bare array —
  a top-level JSON array is a legacy CSRF/JSON-hijacking footgun and leaves no room to add paging
  metadata later without a breaking change.
- **201 Created** → resource was created; return the new object (or at least its `id`). Use for
  fresh writes; a replayed idempotent write returns **200** (see [transaction-endpoints.md](transaction-endpoints.md)).
- **200 OK** → reads, and updates that return the current state.
- **204 No Content** → success with nothing to say (DELETE, logout). Body MUST be empty.

```js
router.post('/posts', requireAuth, async (req, res, next) => {
  try {
    const body = CreatePostSchema.parse(req.body);
    const { lastInsertRowid } = await db.run(
      'INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)',
      [req.user.id, body.title, body.body]);
    sendOk(res, { id: lastInsertRowid, title: body.title }, 201);
  } catch (err) { next(err); }
});
```

## 3. Cursor pagination + whitelisted sort/filter

Offset pagination (`LIMIT ? OFFSET ?`) drifts under concurrent inserts (rows shift, you skip or
repeat) and gets slower the deeper you page. Use an opaque keyset cursor over a stable, unique,
indexed ordering (`(created_at, id)` — `id` breaks ties so the ordering is total). Sort and filter
field names are chosen from a **whitelist and mapped to real columns** — a user-supplied string is
NEVER interpolated into SQL, which is the one place an ORM-less codebase leaks injection.

```js
// src/lib/pagination.js
import { z } from 'zod';

const MAX_LIMIT = 100; // hard cap: a client asking for 1e9 rows must not be able to exhaust memory.

// `sortable`/`filterable` map an API key -> a real column. Column names come ONLY from these maps,
// NEVER from a raw client string — that is the one place an ORM-less codebase leaks SQL injection.
// The sort column MUST also be present in `select`, or the row won't carry the value the next
// cursor is built from.
export function makeList({ table, select, sortable, filterable = {} }) {
  const sortKeys = Object.keys(sortable); // non-empty by contract; z.enum requires >= 1 value
  const QuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(20),
    cursor: z.string().max(200).optional(),
    sort: z.enum(sortKeys).default(sortKeys[0]),
    order: z.enum(['asc', 'desc']).default('desc'),
    // Each filter contributes its own coercing zod schema keyed by the API name.
    ...Object.fromEntries(Object.entries(filterable).map(([k, f]) => [k, f.schema])),
  }).strict();

  // Cursor = base64url(JSON of the last row's ordering values). Opaque but forgeable, so its
  // decoded contents are untrusted input and stay bounded like any other param.
  const decodeCursor = (c) => {
    try { return z.object({ v: z.union([z.string(), z.number()]), id: z.number().int() })
      .parse(JSON.parse(Buffer.from(c, 'base64url').toString())); } catch { return null; }
  };

  // Returns { sql, params, col } or null (malformed cursor -> caller sends 400).
  function build(q) {
    const col = sortable[q.sort];                          // safe: whitelisted identifier
    const dir = q.order === 'asc' ? 'ASC' : 'DESC';
    const cmp = q.order === 'asc' ? '>' : '<';
    const where = [], params = [];
    for (const key of Object.keys(filterable)) {
      if (q[key] === undefined) continue;
      where.push(`${filterable[key].column} = ?`);        // safe identifier + parameterised value
      params.push(q[key]);
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!c) return null;
      where.push(`(${col} ${cmp} ? OR (${col} = ? AND id ${cmp} ?))`); // keyset over (col, id)
      params.push(c.v, c.v, c.id);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT ${select} FROM ${table} ${clause} ORDER BY ${col} ${dir}, id ${dir} LIMIT ?`;
    return { sql, params: [...params, q.limit + 1], col }; // +1 row probes "is there a next page?"
  }

  // The response envelope: run the query, slice off the probe row, emit the next cursor.
  async function run(db, q) {
    const built = build(q);
    if (!built) return null;
    const rows = await db.all(built.sql, built.params);
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const last = items.at(-1);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ v: last[built.col], id: last.id })).toString('base64url') : null;
    return { items, nextCursor };
  }
  return { QuerySchema, run };
}
```

Handler — query params ARE untrusted input, so they go through zod like a body. Each filter pairs a
real `column` with the coercing `schema` that validates its value; column names never touch the
client string:

```js
const postsList = makeList({
  table: 'posts', select: 'id, title, created_at',                 // MUST include every sortable col
  sortable: { created: 'created_at', title: 'title' },             // API key -> column
  filterable: {
    authorId: { column: 'user_id', schema: z.coerce.number().int().positive().optional() },
  },
});

router.get('/posts', requireAuth, async (req, res, next) => {
  try {
    const q = postsList.QuerySchema.parse(req.query);
    const page = await postsList.run(db, q);
    if (!page) return sendError(res, 400, ERR.VALIDATION, 'invalid cursor');
    sendOk(res, page); // { items, nextCursor }
  } catch (err) { next(err); }
});
```

## 4. Versioning — `/api/v1`

Every route mounts under a version prefix from day one: `app.use('/api/v1', ...)`. Version is a
COARSE, rarely-turned dial — bump to `/api/v2` only for a breaking change (a removed field, a
changed type, altered semantics). Evolve `v1` in place for anything additive: new optional request
fields and new response fields are backward-compatible because clients ignore unknowns. Run `v1` and
`v2` side by side during a migration window, then retire `v1` behind a logged deprecation window.

```js
import { Router } from 'express';
const v1 = Router();
v1.use('/auth', authRoutes);
v1.use('/posts', postRoutes);
app.use('/api/v1', v1);
```

The frontend `api()` wrapper hardcodes the prefix in one place (`/api/v1`), so a version bump is a
one-line change there — never scattered across components.

## 5. CORS for cookie auth

The rule that dictates everything: with `credentials: 'include'`, the browser FORBIDS a wildcard
`Access-Control-Allow-Origin: *`. The server must echo back a single, explicitly allowed origin, and
that origin governs whether the browser will even hand our HttpOnly cookies to the request. So the
allowlist is a hard security boundary, not a convenience — it is the set of front-ends permitted to
act as the logged-in user. In same-origin deploys (frontend served by this server, or via the Vite
dev proxy) you need no CORS at all; add it only for a genuinely separate front-end origin.

```js
// src/lib/cors.js
import cors from 'cors';
import { env } from './env.js';

// Exact-match allowlist. env.CORS_ALLOWED_ORIGINS arrives as an ARRAY — the comma-separated raw
// value is split/trimmed by the env schema, which config-and-topology.md owns. No regex, no
// "*.example.com" — a wildcard host pattern is how subdomain-takeover turns into full cookie access.
const allowed = new Set(env.CORS_ALLOWED_ORIGINS);

export const corsMiddleware = cors({
  origin(origin, cb) {
    // No Origin header = same-origin / curl / server-to-server → allow; the browser adds Origin
    // for every cross-origin request, so this branch is never a cross-site browser call.
    if (!origin || allowed.has(origin)) return cb(null, true);
    return cb(null, false); // no ACAO header echoed → the browser blocks the response
  },
  credentials: true,                              // required so the browser sends/accepts our cookies
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  // EVERY custom request header must be listed or its preflight fails: X-CSRF (auth-blueprint.md)
  // and Idempotency-Key (§6) — forgetting one silently breaks only the cross-origin deploy.
  allowedHeaders: ['Content-Type', 'X-CSRF', 'Idempotency-Key'],
  maxAge: 600,                                    // cache preflights 10 min to cut OPTIONS chatter
});
```

Mount it before the routes so preflights are answered: `app.use(corsMiddleware);`. As app-level
middleware the `cors` package answers preflight `OPTIONS` for every route itself, so no separate
`app.options(...)` handler is needed. Be clear about what `cb(null, false)` does: the middleware
never blocks a request server-side — it only withholds the ACAO headers and the *browser* enforces
the block. Server-side enforcement of state-changing requests stays with `csrfProtection`, whose
`X-CSRF` header intentionally triggers a CORS preflight cross-origin — that preflight is exactly what
the CSRF design in [auth-blueprint.md](auth-blueprint.md) relies on; a hostile site cannot pass it
without being on the allowlist.

Scope check before reaching for this file: with `SameSite=Lax`/`Strict` auth cookies, a truly
cross-*site* frontend never receives the cookies at all, so the only credentialed split that works is
the cross-subdomain (same-site) topology in [config-and-topology.md](config-and-topology.md). That
file shows the same policy hand-rolled — either implementation is fine, but a codebase keeps exactly
ONE. The split also requires consciously extending `csrfProtection`'s `Sec-Fetch-Site` check to
accept `same-site` (it admits only `same-origin`/`none` by default) — a reviewed change bundled with
the cookie downgrade documented there, never a silent removal.

## 6. Idempotency on ALL unsafe methods

[transaction-endpoints.md](transaction-endpoints.md) makes idempotency mandatory for money/inventory
writes; extend the same discipline to EVERY non-safe, non-idempotent method (`POST`, and any `PATCH`
that is not naturally idempotent). A network retry or double-click must never create two resources.
The contract: the client sends an `Idempotency-Key` header; the server stores the key scoped per user
alongside the result, and a replay returns the ORIGINAL result with **200** (never re-executing).

The guard below only enforces that a well-formed key is PRESENT — it does not itself store or replay.
The store-and-replay layer (and the `409` on key-reuse-with-different-params) is the named atomic
worker transaction from [transaction-endpoints.md](transaction-endpoints.md); wire this guard in
front of it rather than re-implementing that logic here.

```js
// Presence/format guard for non-critical unsafe writes. It rejects a missing/garbage key early; the
// actual dedupe (store result, detect replay, 409 on param mismatch) is the in-transaction version
// from transaction-endpoints.md (params_hash + audit) — do NOT duplicate that logic here.
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function requireIdempotencyKey(req, res, next) {
  const key = req.get('Idempotency-Key') ?? '';
  if (!IDEMPOTENCY_RE.test(key)) {
    return sendError(res, 400, ERR.VALIDATION, 'missing or invalid Idempotency-Key');
  }
  req.idempotencyKey = key;
  next();
}
```

`PUT` and `DELETE` are idempotent by definition (same request, same final state) and need no key.
`GET`/`HEAD` are safe. A key reused with different parameters returns **409 CONFLICT**
(`code: CONFLICT`) — same contract as the transactional path.

## 7. Content-Type and Accept enforcement

Write requests MUST send `Content-Type: application/json`; the `csrfProtection` middleware in
[auth-blueprint.md](auth-blueprint.md) already rejects a non-JSON body with **415** (this doubles as
CSRF defence — HTML forms cannot set `application/json` cross-origin). `express.json()` only parses
that type, so anything else arrives as an empty body and fails zod validation anyway. This API speaks
JSON only; it does not content-negotiate. Ignore `Accept` for success responses (always JSON), and
never emit `406` — a client that wants XML is simply unsupported.

## 8. Request size limits

Bound the body globally so a giant payload can't exhaust memory before validation runs. Keep the
100 kb JSON cap from [server-skeleton.md](server-skeleton.md); raise it per-route ONLY where a
legitimately larger body exists (e.g. bulk import), never globally. One trap: you cannot just add a
second `express.json()` on the route — the global parser runs first, 413s anything over 100 kb, and
body-parser never re-parses an already-parsed body, so a route-level parser after it is dead code.
The global parser has to SKIP the oversized route instead:

```js
// server.js — over-limit -> entity.too.large -> 413 in the central handler (§1).
const json100kb = express.json({ limit: '100kb' });
app.use((req, res, next) =>
  req.path === '/api/v1/bulk-import' ? next() : json100kb(req, res, next));

// routes — the ONE endpoint with a legitimately larger body mounts its own parser:
router.post('/bulk-import', express.json({ limit: '2mb' }), requireAuth, handler);
```

Every string/array field additionally gets a zod `.max(...)` bound (see the `.strict()` schemas in
[transaction-endpoints.md](transaction-endpoints.md)) — the body limit stops the megabyte; the field
bounds stop the malicious-but-small `"a".repeat(90000)`.

## Env var

CORS uses `CORS_ALLOWED_ORIGINS` — the schema entry (with its split/trim transform to an array)
already lives in the env schema that [config-and-topology.md](config-and-topology.md) owns, so the
only thing to add is the line in `.env.example`:

```ini
# Comma-separated exact origins allowed to send credentialed cross-origin requests.
# Empty in same-origin deploys. Example: https://app.example.com,https://admin.example.com
CORS_ALLOWED_ORIGINS=
```