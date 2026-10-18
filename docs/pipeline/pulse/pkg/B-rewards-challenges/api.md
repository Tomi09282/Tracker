# B-rewards-challenges — the daily challenge draw and the reward shop (migration 033, plan Phase 4)

The contract the MAI DOBÁS / Kihívások / Jutalmak / jutalom részletek / Új jutalom lanes (and the
NAPI DOBÁS block on Ma, the JUTALMAK row on Profil, the Jutalmak door on Érmék) build against.
TypeScript types: `frontend/src/lib/lifeos-api.ts` (the Phase-4 block arrives through
`shared.patch` in this folder). Server truth: `backend/src/lifeos/challenge-routes.js`,
`reward-routes.js` (zod schemas), `backend/src/db/tx/lifeos-rewards.js` (the named transactions),
`backend/src/db/lifeos-rewards-items.js` (rows and views), `backend/src/lifeos/{challenges,rewards}.js`
(the f_app rules, pure), `backend/src/db/migrations/033_lifeos_rewards_challenges.sql`. The core and
Phase-3 contracts are unchanged: `docs/pipeline/pulse/pkg/B-core/api.md`,
`docs/pipeline/pulse/pkg/B-habits-tasks/api.md`.

House rules as before: `/api/v1`, cookie auth, `X-CSRF: 1` on writes, `{ error, code, requestId }`,
every body / query `.strict()` (an unknown key is a 400). Amounts are integer minor units (1 coin =
100); **1 point = 1 coin**. Day keys are the user's logical days. Creates carry a `clientKey`
(`^[A-Za-z0-9_-]{8,64}$`): a replay answers what the first request made.

## The economic rules of Phase 4

- **A challenge never pays by itself.** The pick turns it into a normal task (priority 2, the
  challenge's coins as the task's override, due today with no time = by the end of the logical
  day). The task pays on completion like any task (`POST /tasks/:id/complete`): on time the full
  value, completed on a later logical day half (f_app taskLatePct), trimmed by the 400-coin daily
  cap; left open it falls under the normal overdue rule at the day close. There is **no penalty for
  not picking** (f_app; "Választás nélkül minden megnyitáskor visszajön." — the draw stays on the
  table and lapses with the day).
- **A redemption is a SPEND** (`reward.redeem`, spend = 1, xp = 0): it is never an earn (today's
  earnings, the week chart and the daily cap ignore it) and it **does not reduce XP or the level**.
  It needs the **spendable** balance = max(0, balance): an account in debt can redeem nothing, and
  no redemption can take the balance below zero (the guard is inside the receipt INSERT, and
  `trg_coin_ledger_spend_covered` is the backstop).
- Caps (plan L8): **50 live challenges** (archived ones do not count), 200 challenges ever kept;
  **100 live rewards**, 300 ever kept; a reward costs **1..10000 coins** (`rewardCostMax`); a
  challenge pays 0..50 coins (the task override's cap); weight 1..5.

## Errors shared by every route here

`401` anonymous · `403` no `X-CSRF` · `400 validation_error` · `404 not_found` (also another
account's challenge / reward / redemption — indistinguishable; an archived reward on redeem) ·
`409 conflict` (an idempotency key reused for a different thing) · `409` with a `code`:

| code | when |
|---|---|
| `TIMEZONE_REQUIRED` | a create, draw, pick or redeem before the browser zone was sent (`PATCH /me/prefs`) |
| `LIMIT_REACHED` (+ `limit`) | the 51st live challenge, the 201st challenge in all, the 101st live reward, the 301st reward in all, a pick at 300 open tasks, a restore over the live cap |
| `NO_DRAW` | reroll / pick before today's draw exists |
| `EMPTY_POOL` | draw / reroll with no live challenge to draw from |
| `REROLL_USED` | the second reroll of the day |
| `ALREADY_PICKED` | a second pick of the day (or a reroll after the pick) |
| `NOT_OFFERED` | the challenge is not one of today's options (or was archived after the draw) |
| `ALREADY_REDEEMED` | a one-time reward that was redeemed |
| `COOLDOWN` (+ `availableOn`, `daysLeft`) | inside the reward's pihenő |
| `INSUFFICIENT` (+ `missingMinor`) | the spendable balance does not cover the cost |

The redeem refusals are checked in f_app's order: ALREADY_REDEEMED, then COOLDOWN, then INSUFFICIENT.

Limits: reads 600 / 15 min per IP; writes 300 per IP and 200 per account; draw / reroll / pick 60
per account; redeem 60 per account.

## The daily draw

One draw per user per logical day. It offers up to **three distinct** live challenges, drawn in the
server's worker with `crypto.randomInt`, **weighted** (weight 2 is twice as likely as 1), without
replacement, excluding challenges already accepted today. A pool of one or two offers one or two.

### `ChallengeDraw` (in `GET /lifeos/today` as `challenge`, in every draw answer as `draw`)

```ts
{ date, state: 'empty_pool' | 'due' | 'drawn' | 'picked', poolCount,
  options: ChallengeOption[],        // Challenge + chosen: boolean; [] for empty_pool / due
  rerollsLeft: 0 | 1,                // "még 1 maradt ma"
  picked: { challengeId, taskId, pickedAt, done, taskDeleted } | null }
```

- `due`: the client draws (`POST /challenges/today/draw`) — the read itself never draws.
- `drawn`: the options are on the table; nothing picked yet. The same hand comes back on every
  open that day.
- `picked`: the chosen option has `chosen: true`; `picked.done` = the task was completed
  (teljesítve), otherwise elvállalva.

`GET /lifeos/today` gains `challenge: ChallengeDraw | null` (null before a zone is set). Every
`Task` gains `challengeId: number | null`.

### GET /challenges/today → `{ started, draw: ChallengeDraw | null }`

### POST /challenges/today/draw → 201 `{ draw }` | 200 `{ draw, already: true }`

Body `{}`. Idempotent per day: concurrent draws make one draw; every later call answers it.
`409 EMPTY_POOL` with no live challenge.

### POST /challenges/today/reroll → 200 `{ draw }` | 200 `{ draw, replayed: true }`

Body `{ rerollKey }`. Once per day, before the pick. The new hand excludes the previous one
(falling back to the whole unaccepted pool when that leaves fewer than three). The same `rerollKey`
again answers the current hand (`replayed`). `409 NO_DRAW | REROLL_USED | ALREADY_PICKED | EMPTY_POOL`.

### POST /challenges/today/pick → 201 `{ task, draw }` | 200 `{ task, draw, replayed: true }`

Body `{ challengeId, clientKey }` ("Ezt vállalom"). `challengeId` must be one of today's options and
not archived. Creates the task (title = the challenge's name, priority 2, `points` = the
challenge's coins, `dueOn` = today, `dueTime` null, `challengeId`) — the `clientKey` is the task's
key: the same key and challenge again is a replay, the same key for another challenge `409 conflict`.
`409 NO_DRAW | ALREADY_PICKED | NOT_OFFERED | LIMIT_REACHED`. No coin moves here.

## The challenge pool

### `Challenge`

```ts
{ id, name, category: 'discipline' | 'movement' | 'mind' | 'connection' | 'food' | null,
  points /* 0..50 */, weight /* 1..5 */, valueMinor, archived, archivedAt }
```

The categories are the round-B frames' Fegyelem · Mozgás · Elme · Kapcsolat · Étkezés; the client
translates the key.

### GET /challenges → `{ active: Challenge[], archived: Challenge[], limits: { pool: 50 } }`

AKTÍV "n / 50" and ARCHIVÁLT, each by name.

### POST /challenges → 201 `{ challenge }` (200 `{ challenge, replayed: true }`)

`{ clientKey, name (1..80), category?, points? (0..50, default the admin rule challengePoints = 15), weight? (1..5, default 1) }`.

### GET /challenges/:id → `{ challenge }` · PATCH /challenges/:id → `{ challenge }`

PATCH takes any of name / category / points / weight (at least one). A task already picked keeps
its coins.

### POST /challenges/:id/archive · POST /challenges/:id/restore → `{ challenge }`

"Archiválás" / "Visszaállítás". Idempotent. Restore over 50 live → `409 LIMIT_REACHED`.

### DELETE /challenges/:id → 204

Soft delete; the tasks it became keep their history. A second delete is 404.

## The reward shop

### `Reward`

```ts
{ id, name, description, costMinor, repeatable, cooldownDays /* null = no limit */,
  archived, archivedAt, redeemedCount, lastRedeemedOn,
  availability: { ok: true } | { ok: false, reason: 'ALREADY_REDEEMED' }
              | { ok: false, reason: 'COOLDOWN', availableOn, daysLeft }
              | { ok: false, reason: 'INSUFFICIENT', missingMinor }
              | { ok: false, reason: 'TIMEZONE_REQUIRED' },
  progressBp /* 0..10000: the 4 pt bar */, balanceAfterMinor /* spendable − cost */ }
```

The rewards-1 status line maps directly: `ok` → lime dot + "beváltható" + "Beváltás";
`COOLDOWN` → "pihen · még {daysLeft} nap"; `ALREADY_REDEEMED` → "beváltva · egyszeri";
`INSUFFICIENT` → "még {missingMinor/100} érme".

**The cooldown counts logical days**: redeemed on day D with N days of pihenő, the reward is
redeemable again from D + N (the coffee redeemed on 10.14 with 3 days opens on 10.17).

### GET /rewards → `RewardsResponse`

`{ started, today, balanceMinor, spendableMinor, items (live, by cost), archived, redeemableCount, limits: { rewards: 100, costMaxMinor: 1000000 } }`.
`redeemableCount` is Profil's "N elérhető" and the Érmék door's "N beváltható".

### GET /rewards/:id → `{ reward, spendableMinor, redemptions }`

`redemptions`: BEVÁLTÁSOK, newest first, at most 100.

### POST /rewards → 201 `{ reward }` (200 `{ reward, replayed: true }`)

`{ clientKey, name (1..80), description? (1..280, may span lines, null clears), cost (WHOLE coins, 1..10000), repeatable? (default true), cooldownDays? (0..365; 0 / null = no limit; must be absent / 0 / null when one-time) }`.

### PATCH /rewards/:id → `{ reward }`

Any of the create fields but `clientKey`. Past redemptions keep their snapshots. Turning a reward
that was redeemed more than once into a one-time one is `409 conflict`.

### POST /rewards/:id/archive · POST /rewards/:id/restore → `{ reward }`

"Archiválás" (the redemptions stay). Idempotent. An archived reward cannot be redeemed (404).

### POST /rewards/:id/redeem → 201 `{ redemption, balanceMinor, spendableMinor }`

Body `{ clientKey }` — nothing else ("Beváltás · 80 érme"). The cost is the stored reward's. The
same key again: 200 with `replayed: true`, the same receipt, no second debit; the same key for
another reward `409 conflict`. `409 ALREADY_REDEEMED | COOLDOWN | INSUFFICIENT`, `404` for an
archived or foreign reward.

### `RewardRedemption`

`{ id, rewardId, name, costMinor, localDate, redeemedAt, fulfilled, fulfilledAt }` — name and cost
are snapshots of the moment of redemption.

### GET /rewards/redemptions → `{ redemptions }` (newest first, at most 100)

### POST /rewards/redemptions/:id/fulfilled → `{ redemption }`

Body `{ fulfilled: boolean }` — the "Teljesítve" tick. Bookkeeping only; it moves no coins.
Idempotent; another account's redemption is 404.

## GET /coins/ledger

A `reward.redeem` entry carries `localDate` (the redemption's logical day), `sourceType: 'reward'`,
`sourceId` (the reward) and `sourceTitle` (the name on the receipt) — coins-2v2's
"Jutalom beváltva · Desszert a cukrászdában −80".

## Behaviour changes outside the new routes

- `GET /lifeos/today` gains `challenge` (above); `Task` gains `challengeId`.
- The GDPR export gains `challenges`, `challenge_draws`, `rewards`, `reward_redemptions`.
- `coin_reasons` gains `reward.redeem`; `trg_coin_ledger_ref_truthful` gains its clause.
