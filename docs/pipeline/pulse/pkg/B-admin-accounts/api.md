# B-admin-accounts - the account list, the account page and the account writes (no migration)

For the frontend lane S-admin-accounts. Frames: `admin-accounts-v2`, `admin-account-detail-1`, `-2a-name`,
`-2b-role`, `-2c-disable`, `-2d-coins`, `-3a-disabled`, `-3b-own`. House rules unchanged: base `/api/v1`, cookie
auth, `X-CSRF: 1` and a JSON content type on every write, errors are `{ error, code, requestId }`, every body,
param and query is a `.strict()` zod schema, timestamps are epoch **seconds**, coin amounts are integer **minor
units** (1 coin = 100). Every route here is `requireAuth` + `requireRole('admin')` and then re-reads the caller as an
**enabled admin in the database**; a token that says admin while the database does not gets **403**.

**No migration** (036 is not used). The e-mail is read-only: no route edits it.

## At a glance

| Frame | Call |
|---|---|
| list, search, filters, "N fiók", "Továbbiak 8 / 19" | `GET /admin/users` |
| account page (one request) | `GET /admin/users/:id` |
| Név szerkesztése | `PATCH /admin/users/:id/name` |
| Szerepkör (grant admin asks the admin's own password) | `POST /admin/users/:id/role` (existing) |
| Fiók letiltása / Engedélyezés (reason required both ways) | `POST /admin/users/:id/disable`, `POST /admin/users/:id/enable` (enable changed) |
| Érme-korrekció | `POST /admin/users/:id/coins` (existing; refuses your own account now) |
| Teljes napló (coin ledger of the account) | `GET /admin/coins/ledger?user_id=:id` (existing) |
| Kizárás feloldása | `POST /admin/users/:id/reset-lockout` |
| Kijelentkeztetés mindenhonnan | `POST /admin/users/:id/signout-all` |
| Jelszócsere kényszerítése | `POST /admin/users/:id/force-password-change` |

## Common errors

| Status | `code` | When |
|---|---|---|
| 401 | `unauthorized` | no cookie / expired / the session was ended |
| 403 | `forbidden` | not an admin - and also a token that says admin while the database does not (demoted, disabled, ended sessions) |
| 400 | `validation_error` | any schema failure: unknown field, wrong type, bad `:id` (string, negative, zero, leading zero, exponent, hex, over 2 147 483 647), bad query, bad cursor |
| 404 | `not_found` | the account does not exist (a well-formed id). A non-admin always gets 403, never a 404, so nothing here is an existence oracle |
| 409 | `conflict` | a rule refused it; the body adds `reason` (see the role / disable / coin sections) |
| 429 | `rate_limited` | the admin read budget (600 / IP + 300 / admin per 15 min) or write budget (120 / IP + 60 / admin per 15 min); the coin route keeps its own 10 / 15 min |

`:id` is validated as `^[1-9]\d{0,9}$` and <= 2 147 483 647 (a **400** otherwise). The older role / disable / enable
routes keep their old behaviour for a malformed id (404).

Every write returns `replayed: boolean`: **true** when the account was already in the requested state - nothing was
written, no second audit row, and the response is still 200. One real effect = one audit row.

## GET /admin/users - the list

Query (all optional, `.strict()`, anything else is a 400 - there is no `limit` and no `page`):

| param | values |
|---|---|
| `q` | free text, trimmed, <= 80 **code points**, no control / bidi characters. Matched as a substring of the e-mail **or** the display name, accent- and case-insensitively ("arpad" finds "Árpád"). `%`, `_` and `\` are literals. A blank `q` is no search |
| `role` | `user` \| `coach` \| `admin` |
| `state` | `all` (default) \| `active` \| `disabled` (`enabled` is accepted as the old spelling of `active`) |
| `sort` | `name` \| `created` (default) \| `email` \| `role` \| `clients` |
| `dir` | `asc` \| `desc`. Default per key: `name`, `email`, `role` asc; `created`, `clients` desc |
| `cursor` | the opaque `nextCursor` of the previous page **for the same sort and dir**; anything else is a **400** |

`name` sorts by the display name, or the e-mail for an account without one, folded (accents and case ignored).
`clients` is the number of **active** coach links. Every key has a keyset cursor with the id as the tiebreak, so a page
boundary never skips or repeats a row. The page is capped at **24** rows.

```ts
export type AdminRole = 'user' | 'coach' | 'admin';
export type AdminUserSort = 'name' | 'created' | 'email' | 'role' | 'clients';

export interface AdminUserRow {
  id: number;
  email: string;
  displayName: string | null;   // new
  role: AdminRole;
  createdAt: number;
  disabledAt: number | null;    // set = LETILTVA
  mustChange: 0 | 1;            // 1 = JELSZÓCSERE flag (an integer here, a boolean in the account page)
  hasProfile: 0 | 1;            // has a marketplace profile
  clientCount: number;          // active coach links (meaningful for coaches)
}

export interface AdminUserList {
  users: AdminUserRow[];
  nextCursor: string | null;    // null = last page. Send it back unchanged with the same sort / dir / filters
  sort: { key: AdminUserSort; direction: 'asc' | 'desc' };   // what was applied
  total: number;                // size of the WHOLE filtered set ("19 fiók"), not of the page; unchanged while paging
}
```

"Továbbiak 8 / 19": shown = `rows loaded so far`, total = `total`. Changing `q`, a filter or the sort starts a new
walk (drop the cursor). The response is additive to the old shape (`users`, `nextCursor`, `sort`).

## GET /admin/users/:id - the account page, ONE request

200:

```ts
export interface AdminAccountDetail {
  account: {
    id: number;
    email: string;                  // READ-ONLY (the login identity)
    displayName: string | null;
    role: AdminRole;
    createdAt: number;
    mustChange: boolean;
    createdBy: { id: number; displayName: string | null; email: string } | null;   // a coach who pre-generated the account
    isSelf: boolean;                // true = the admin's own account (frame 3b: hide Szerepkör and Letiltás)
    disabledAt: number | null;
    disabled: {                     // null unless disabled
      at: number;
      reason: string | null;        // from the audit row; null if the row is missing
      by: { id: number; email: string; displayName: string | null } | null;
    } | null;
  };
  sessions: { open: number; lastStartedAt: number | null };   // open = logins with a live refresh token
  lockout: { failedLogins: number; lockedUntil: number | null };   // lockedUntil only while in the future
  coaching: {
    asCoach: {
      activeClients: number;
      clientCap: number | null;     // null = unlimited
      capExempt: boolean;           // true for an admin
      tierKey: string | null;
      links: { active: number; invited: number; archived: number };
    };
    asClient: { links: { active: number; invited: number; archived: number } };
    subscription: { tierKey: string; tierName: string; status: 'trialing' | 'active' | 'past_due' | 'canceled'; currentPeriodEnd: number | null } | null;
  };
  marketplace: {                    // null = no profile
    handle: string;
    published: boolean;
    verified: boolean;
    removed: boolean;
    posts: { draft: number; live: number; withdrawn: number; removed: number };   // removed > withdrawn > live > draft
    openReports: number;            // open (non-terminal) reports against this author
  } | null;
  coins: {
    balanceMinor: number;           // may be negative (LifeOS penalties)
    entries: { id: number; amountMinor: number; reasonKey: string; note: string | null; createdAt: number }[];   // last 3, newest first; note only on an admin's own adjustment
    totalEntries: number;
  };
  activity: { workouts: number; nutritionLogs: number; measurements: number; photos: number };   // COUNTS ONLY
  audit: { id: number; action: string; createdAt: number; requestId: string | null; actorId: number | null; actorEmail: string | null }[];   // last 5 events targeting this account, newest first
}
```

Never present: password hash, session version, token hashes, any `provider_*` id of the subscription, any content of a
workout / meal / measurement / photo, the audit `detail`. `activity` is deliberately four counts - admins cannot read
health content (the privacy rule); the page shows the note "A tartalom privát: az admin csak a darabszámot látja."
`workouts` counts completed sessions; `nutritionLogs` counts logged food entries.

`404` for an unknown id. The door rows: "Teljes napló" -> `GET /admin/coins/ledger?user_id=<id>` (existing);
"Nyitott bejelentés" -> Piactér filtered to `marketplace.handle` (B-admin-posts).

## PATCH /admin/users/:id/name

Body `{ displayName: string | null }` - **required and nullable**, `.strict()`. Validated by the same code as
`PATCH /auth/me` (`lib/display-name.js`): trimmed, no control or bidi characters, **2..120 code points** (an emoji is
one), `null` clears. Editing your own name is allowed.

200 `{ account: AdminAccountBrief, replayed: boolean }` where

```ts
export interface AdminAccountBrief { id: number; email: string; displayName: string | null; role: AdminRole; disabledAt: number | null; mustChange: boolean }
```

Audit action `user.name.change` (detail carries no name: the log outlives the person).
Errors: 400 (schema / id), 403, 404.

## POST /admin/users/:id/reset-lockout

Body `{}` (or none). Clears the failed-login counter and the wait. "Locked" = failed logins > 0 or a wait still in the
future; nothing to clear = `replayed: true`. Allowed on a disabled account. 200 `{ account, replayed }`.
Audit `user.lockout.reset`. Errors: 400, 403, 404.

## POST /admin/users/:id/signout-all

Body `{}` (or none). Revokes every refresh token and bumps the session version: live access tokens die on their next
request. No open session = `replayed: true`.
200 `{ account, replayed, sessions: number /* sessions ended */, selfSignedOut: boolean }`.
Signing **yourself** out is allowed: the server clears your cookies and answers `selfSignedOut: true` - the client
must go to the login screen. Audit `user.sessions.revoke`. Errors: 400, 403, 404.

## POST /admin/users/:id/force-password-change

Body `{}` (or none). Sets `must_change_credentials`, ends every session. The person can still sign in, but reaches
only `/auth/me`, `/auth/change-credentials` and `/auth/logout` until they choose a new password. Already flagged =
`replayed: true`. 200 `{ account, replayed, selfSignedOut: boolean }` (same self rule as above).
Audit `user.password.force`. Errors: 400, 403, 404.

## Existing routes, as the account page uses them

**POST /admin/users/:id/role** - body `{ role: 'user'|'coach'|'admin', password?: string }`. Granting `admin` needs the
**admin's own** `password` (the step-up): missing -> 401 `{ reason: 'step_up_required' }`, wrong -> 401 `unauthorized`.
200 `{ ok: true, account: { id, role }, replayed }`. 409 `reason: 'cannot_change_own_role'` on your own account.
(A malformed id here is a 404.)

**POST /admin/users/:id/disable** - body `{ reason: string }` (1..2000, trimmed). 200 `{ account: { id, disabledAt }, replayed }`.
409 `reason: 'cannot_disable_self'`. The reason is shown back on the account page (`account.disabled.reason`).

**POST /admin/users/:id/enable** - **changed: the body now REQUIRES `{ reason: string }`** (1..2000, trimmed; a missing
or blank reason is a 400). 200 `{ account: { id, disabledAt: null }, replayed }`; enabling an enabled account is a
replay. Audit `user.enable` carries the reason. (Nothing in the app called it before this package.)

**POST /admin/users/:id/coins** - body `{ amount_minor: int (-1 000 000..1 000 000, not 0), note: string (1..280), idempotency_key: /^[A-Za-z0-9_-]{8,64}$/ }`.
200 `{ outcome: 'applied', replayed, entryId, amountMinor, note, movedAt, balanceMinor }`.
**New: 409 `{ reason: 'cannot_adjust_own_coins' }` when `:id` is the caller** - frame 3b still draws Érme-korrekció on
the own account; hide it or expect that 409. Other 409s: `insufficient` (a debit below zero, with `balanceMinor`),
key reuse. Own budget: 10 / 15 min per IP and per admin.

## Other facts the screens can rely on

- A planted/unknown `sort`, `dir`, `role`, `state` is a 400, never SQL. A garbage cursor is a 400 (restart the walk).
- `GET /admin/users/:id` costs one read of the 300 / 15 min per-admin budget.
- Two admins acting on each other at once: exactly one effect, the other call is refused (401/403).
- The inspect page's `coaching.asCoach.clientCap` follows the seat rule: an admin is exempt; others resolve through a
  trialing / active / past_due subscription, else the free tier.

## Follow-ups (not done here)

- `audit_log` has no index on `(target_type, target_id)`: the "last 5 events" read walks the table by id descending
  and stops at 5 matches (and the disable-reason lookup uses `audit_log_action_idx`). Cheap while the log is small; an
  index would be migration 036 and was left out on purpose - decide with B-admin-posts / B-admin-stats if one is added.
- The `name` sort and the folded search call a SQL function per row (no index can serve them); fine for thousands of
  accounts, revisit with a stored folded column if the table grows into the hundreds of thousands.
