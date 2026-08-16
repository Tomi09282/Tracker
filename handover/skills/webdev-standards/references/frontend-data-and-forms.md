# Frontend data & forms

Why this design: the backend already proves every request safe with `.strict()` zod schemas
([input-validation.md](input-validation.md), [transaction-endpoints.md](transaction-endpoints.md)).
If the frontend re-declares those shapes by hand they drift — a renamed field ships on the server,
the client keeps sending the old one, and you find out at runtime as a `400` the user sees. One
source of truth fixes it: **the same zod object** drives the backend's `.parse(req.body)`, the form's
`zodResolver`, and the response parse on the client, so a backend schema change the frontend hasn't
adopted becomes a **build-time type error**, not a production surprise. Everything here layers on the
EXISTING `src/lib/api.ts` wrapper ([frontend-conventions.md](frontend-conventions.md)) — its
Web-Locks cross-tab refresh and single-retry-on-401 are load-bearing; never reimplement them.

## Monorepo layout — one schema package, imported by both sides

A shared package is only a single source of truth if both apps import the *same file*, not two
copies — so make it a real workspace.

```
package.json            # { "private": true, "workspaces": ["packages/*", "apps/*"] }
packages/shared/        # @app/shared — schemas + z.infer types (the old src/lib/schemas.js moves here)
apps/api/               # Express backend — imports @app/shared for .strict().parse(req.body)
apps/web/               # Vite + React — imports @app/shared for forms AND response parsing
```

```ts
// packages/shared/src/schemas.ts — the ONE place these shapes live. Both apps import this file.
import { z } from 'zod';

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email()); // z.email() is the v4 top-level form
// The password POLICY from input-validation.md — min 12 + class mix. Moving it here IS the move of
// src/lib/schemas.js; never keep a divergent inline copy (integration-notes.md).
export const password = z.string().min(12).max(128)
  .refine((s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s), 'mix upper, lower, digits');
export const moneyCents = z.number().int().positive().max(100_000_000); // integer minor units, never floats
const accountId = z.number().int().positive();

// Request bodies — the SAME objects the backend feeds to .strict().parse(req.body):
export const TransferBody = z.object({ fromAccount: accountId, toAccount: accountId, amountCents: moneyCents }).strict();
export const OrderBody = z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) }).strict();
export const RegisterBody = z.object({ email, password }).strict();
// Login accepts any non-empty secret — existing passwords may predate the policy; the hash decides.
export const LoginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();

// Response schemas — parsed on the client so a contract break throws at the boundary, not deep in the UI:
export const TransferResult = z.object({ transferId: z.number().int().positive() }).strict();
export const OkResult = z.object({ ok: z.literal(true) }).strict();
export const AccountView = z.object({ id: accountId, balanceCents: z.number().int().nonnegative() }).strict();

export type TransferBody = z.infer<typeof TransferBody>; // z.infer replaces every hand-written payload type
export type AccountView = z.infer<typeof AccountView>;
```

The backend now imports these instead of declaring local copies:

```js
// apps/api/src/transfers/routes.js
import { TransferBody } from '@app/shared';
const body = TransferBody.parse(req.body); // was a local z.object in transaction-endpoints.md — same behaviour
```

Give `packages/shared` a real build — `tsc` emitting `dist/` plus an `exports` map (with `.d.ts`
types) pointing at it. The API is plain Node, and Node's type-stripping never applies inside
`node_modules`, so importing the raw `.ts` from a workspace package crashes at startup; Vite
consumes the same built output. Version the package (`@app/shared@x.y.z`); CI installs one version
across the workspace, so a backend that ships a shape the frontend hasn't adopted fails CI's
type-check instead of failing a user's request in production.

## Typed API client — a thin facade over `api<T>()`

The surface is small and `api()` already owns auth/refresh/retry, so a hand-written typed facade
beats codegen. It is the one place request typing, the `Idempotency-Key`, and the response `.parse()`
are enforced together.

```ts
// apps/web/src/lib/client.ts — types the request IN, parses the response OUT. Never bypass api().
import { z } from 'zod';
import { api } from './api';                          // THE wrapper — do not replace it
import { TransferBody, TransferResult, LoginBody, RegisterBody, OkResult, AccountView } from '@app/shared';

// A fresh key PER mutation attempt (16–64 chars, transaction-endpoints.md); the CALLER passes it in
// so a network retry of the SAME attempt against an idempotency-backed endpoint REPLAYS (200/201)
// instead of double-charging. crypto.randomUUID needs a secure context (https / localhost).
export const newIdempotencyKey = () => crypto.randomUUID().replace(/-/g, ''); // 32 hex chars — passes the server's ^[A-Za-z0-9_-]{16,64}$

// key is OPTIONAL: only endpoints wired to the idempotency store (transaction-endpoints.md) consume
// the header; other routes ignore it, so don't send it there and don't imply replay semantics.
async function mutate<Req extends z.ZodType, Res extends z.ZodType>(
  path: string, reqSchema: Req, resSchema: Res, body: z.input<Req>, key?: string,
): Promise<z.infer<Res>> {
  const parsed = reqSchema.parse(body);               // reject a bad shape before it hits the network
  const data = await api<unknown>(path, {
    method: 'POST', body: JSON.stringify(parsed),
    ...(key ? { headers: { 'Idempotency-Key': key } } : {}), // required only by mutating/critical endpoints
  });
  return resSchema.parse(data);                        // contract violation THROWS here, never corrupts state
}

async function query<Res extends z.ZodType>(path: string, resSchema: Res): Promise<z.infer<Res>> {
  return resSchema.parse(await api<unknown>(path));    // parse GETs too — trust nothing off the wire
}

export const client = {
  transfers: { create: (b: z.infer<typeof TransferBody>, key: string) => mutate('/transfer', TransferBody, TransferResult, b, key) },
  accounts:  { get: (id: number) => query(`/accounts/${id}`, AccountView) },
  auth: {
    // No Idempotency-Key: the auth routes (auth-blueprint.md) don't consume one — a duplicate
    // register is caught by the UNIQUE email (409), and re-login is naturally safe.
    login:    (b: z.infer<typeof LoginBody>)    => mutate('/auth/login',    LoginBody,    OkResult, b),
    register: (b: z.infer<typeof RegisterBody>) => mutate('/auth/register', RegisterBody, OkResult, b),
  },
};
```

`api()` already throws `ApiError(status, message)` on non-2xx (the `message` is the raw response text)
and does the single refresh retry — the client adds typing and parsing on top and never catches the
401 itself. Note `ApiError` carries only `status` and `message`; there is no parsed `.body`/`.code`
field, so branch on `err.status` (below), never on a `code` that isn't there.

## TanStack Query — server state over the typed client

`queryFn` calls the typed client (never raw fetch); the retry predicate must not fight the wrapper's
own refresh-and-retry or retry deterministic business failures.

```tsx
// apps/web/src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // per-query override below; beats refetch-on-every-mount
      retry: (failureCount, err) => {
        // 401 is owned by api()'s single refresh-and-retry — retrying here double-refreshes. 4xx
        // business errors (409 insufficient, 422 idempotency mismatch, 403/404) are DETERMINISTIC:
        // a retry can't change the answer. Only network/5xx are transient.
        if (err instanceof ApiError && err.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false }, // mutations carry an Idempotency-Key; a retry is an explicit decision
  },
});
```

```tsx
// apps/web/src/data/useTransfer.ts — a read with a tuned staleTime, and a mutation that invalidates
// the touched balances on the server's authoritative success.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client, newIdempotencyKey } from '../lib/client';
import type { TransferBody } from '@app/shared';

export const accountKeys = { detail: (id: number) => ['account', id] as const };

export const useAccount = (id: number) =>
  useQuery({ queryKey: accountKeys.detail(id), queryFn: () => client.accounts.get(id), staleTime: 10_000 }); // balances go stale fast

export function useTransfer() {
  const qc = useQueryClient();
  return useMutation({
    // Key generated ONCE per attempt: a network-layer retry of this attempt replays (200); a new
    // user click is a new attempt → a new key.
    mutationFn: (body: TransferBody) => client.transfers.create(body, newIdempotencyKey()),
    onSuccess: (_r, body) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(body.fromAccount) });
      qc.invalidateQueries({ queryKey: accountKeys.detail(body.toAccount) }); // drop stale cache, refetch truth
    },
  });
}
```

## react-hook-form + zodResolver on the shared schema

The form validates with the EXACT object the backend enforces, so client rules can never disagree
with the server's — and business failures map cleanly back onto fields. Money inputs bind to
**integer minor units**, matching the storage rule. (`TransferBody`'s input and output TypeScript
types coincide, so `useForm<TransferBody>` type-checks directly — note the `email` normalization
above changes the *value*, not the type, so it's fine too. Only a schema whose output TYPE differs
from its input — `z.coerce.number()`, a `.transform()`, a `.default()` — needs
`useForm<z.input<S>, unknown, z.output<S>>`.)

```tsx
// apps/web/src/pages/transfer/TransferForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TransferBody } from '@app/shared';           // SAME schema the backend parses
import { ApiError } from '../../lib/api';
import { useTransfer } from '../../data/useTransfer';

// Business-error responses from /transfer carry NO machine `code` in the body (transaction-endpoints.md
// returns { error } only); ApiError exposes just `status`. So map on the HTTP STATUS, per that route's
// TX_HTTP table: 409 insufficient, 403 forbidden account, 422 idempotency-key reuse.
const STATUS_TO_FIELD: Record<number, { field: 'amountCents' | 'toAccount' | 'root'; msg: string }> = {
  409: { field: 'amountCents', msg: 'Insufficient funds.' },
  403: { field: 'toAccount',   msg: 'You cannot use this account.' },
  422: { field: 'root',        msg: 'This request could not be processed — please retry.' },
  400: { field: 'root',        msg: 'Invalid transfer.' },
};

export function TransferForm({ fromAccount }: { fromAccount: number }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<TransferBody>({ resolver: zodResolver(TransferBody), defaultValues: { fromAccount, toAccount: 0, amountCents: 0 } });
  const transfer = useTransfer();

  const onSubmit = handleSubmit(async (values) => {
    try { await transfer.mutateAsync(values); }
    catch (err) {
      const m = (err instanceof ApiError ? STATUS_TO_FIELD[err.status] : undefined)
        ?? { field: 'root' as const, msg: 'Transfer failed.' };
      setError(m.field, { message: m.msg }); // the server is the authority; surface its verdict
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Money binds to INTEGER minor units — valueAsNumber + step=1, never a float. Show a formatted
          major-unit value elsewhere; what's SUBMITTED is cents. */}
      <input type="number" step={1} min={1} {...register('amountCents', { valueAsNumber: true })} />
      {errors.amountCents && <p role="alert">{errors.amountCents.message}</p>}
      <input type="number" step={1} min={1} {...register('toAccount', { valueAsNumber: true })} />
      {errors.toAccount && <p role="alert">{errors.toAccount.message}</p>}
      {errors.root && <p role="alert">{errors.root.message}</p>}
      <button type="submit" disabled={isSubmitting}>Send</button>{/* disabled while pending → no double-submit */}
    </form>
  );
}
```

The pattern is fixed — `zodResolver(SharedSchema)`, inline `role="alert"` errors, submit disabled
while pending, `setError` mapping the response `status` onto a field or `root` (`setError('root', …)`
is supported and clears on next submit). Reuse it verbatim for orders, login, register; only the
schema and status-map change.

## Optimistic mutations — reversible actions ONLY

An optimistic update shows a value the server hasn't confirmed. For a toggle that's fine — rollback
restores the exact prior state. For money/inventory it's a **lie**: the authoritative balance is
whatever the server computed, and a rolled-back optimistic balance shows a number that was never
true. So optimism is allowed for low-stakes reversible UI and FORBIDDEN on money/inventory/
irreversible endpoints, which wait for the server's authoritative `200`/`201`.

```tsx
// ALLOWED: a reversible toggle (mark-read, star, reorder). Snapshot → rollback → invalidate.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../lib/client';

export function useToggleRead(id: number) {
  const qc = useQueryClient();
  const key = ['notification', id] as const;
  return useMutation({
    // notifications.setRead is added to the client facade like the entries above.
    mutationFn: (read: boolean) => client.notifications.setRead(id, read),
    onMutate: async (read) => {
      await qc.cancelQueries({ queryKey: key });              // stop an in-flight refetch clobbering us
      const prev = qc.getQueryData(key);                       // snapshot for rollback
      qc.setQueryData(key, (o: any) => ({ ...o, read }));      // optimistic paint
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.prev), // exact restore — reversible by definition
    onSettled: () => qc.invalidateQueries({ queryKey: key }),  // reconcile with server truth
  });
}
```

`useTransfer` above is the counter-example: NO `onMutate`, no optimistic `setQueryData` — it only
updates the cache from the confirmed response via `onSuccess` invalidation, because the balance the
server computes is the only truth. Record this as a lint/review note in
[frontend-conventions.md](frontend-conventions.md): **no optimistic `setQueryData` on any money,
inventory, or irreversible endpoint.**