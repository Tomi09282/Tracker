# Phase 3 — spec

Author: Claude Opus 5 (solo pipeline, D-P1) · Date: 2026-08-06
Entry: **Phase 1 closed 57/58 with owner sign-off** (T1.31 carried forward as a feature, T1.11
closed as an accepted deviation). **Phase 2 is 65/66** — the one open item, T2.3.5, is a per-coach
seat cap deliberately reserved for the billing phase. Neither blocks this phase.

Scope: **F5** notifications (in-app only, decision D-8A) · **F6** chat (polling, decision D-5A).

Owner requirements covered: coach↔client communication, and the notification surface every later
phase hangs its events off (coins, streaks, marketplace).

---

## What already exists and must not be rebuilt

- **The link is the authority.** `coach_clients` carries the relationship; archiving it withdraws
  access on the very next request because the predicate is in the SQL, not in a cached flag. Chat
  and notifications hang off the LINK, never off a pair of user ids.
- **The anti-IDOR pattern**: object-level miss → 404, role gate → 403, predicate written once and
  shared (`visibility.js`, `schedule.js`, `OWN_OR_HELD`).
- **The media pipeline** — magic-byte sniff, re-encode, EXIF strip, random storage key, gated
  serving. A chat video attachment REUSES it; it does not get its own upload path.
- **The rate-limit tiers** and `check-routes`, which now refuses any write without a limiter.
- **Named worker transactions** and ADR-0005 (commit-on-return), now enforced by `check-worker-tx`.
- **The feedback catalog**: E11 (bubble/badge) is catalogued and DB-seeded; this phase implements
  the unread badge against it rather than inventing one.
- **i18n**: three live bundles, 412 keys, gated. Every string this phase adds lands in all three.

---

## The decisions this phase must make before writing code

Recorded here because they are architecture, not implementation, and getting them wrong is a
12-step table rebuild later — SQLite cannot alter a CHECK or an FK.

1. **A conversation when the link is archived.** The link is the authority everywhere else. Does
   the history vanish, freeze, or stay readable — and whose data is it?
2. **A notification whose subject is deleted.** "Your coach added Tuesday" and Tuesday is gone.
   Snapshot the text, or resolve at read time and risk a dangling row? Phase 2 has a strong opinion
   about snapshots (`exercise_name_snapshot`) — it should be applied or explicitly overruled.
3. **Quiet hours, server-side, with no cron.** Suppress at write time or filter at read time? Each
   choice does something different to a notification that goes stale during the window.
4. **Where BLOCK lives** — link, conversation, or its own table — and what a block does to an
   existing conversation and to the client's access to their own plan.
5. **Retention ENFORCED, not documented.** There is no scheduler in this product. Something has to
   actually delete an old message.
6. **What concretely stops a notification payload leaking** something the recipient may not see.

These are being answered by a design + adversarial-review pass before any DDL is written, the same
way migration 010 was produced.

---

## Job slicing

Sequential; they share contracts. Each carries its budget line (inputs ≤ 120k, work ≤ 120k,
reserve 60k of a 300k window). No job starts without one.

| Job | Goal | Writes | Budget (in / work / reserve) |
|---|---|---|---|
| **J1** | Migration 013 — notifications, settings, push_devices (inert), conversations, messages, blocks, reports | `013_*.sql` + `verify:schema` cases | 120k / 120k / 60k |
| **J2** | Notification backend — write path, read path, quiet hours, unread count | `src/notifications/` + worker tx | 100k / 120k / 60k |
| **J3** | Chat backend — conversations, messages, attachments, rate limits, block/report | `src/chat/` + worker tx | 120k / 140k / 60k |
| **J4** | Notification UI — bell, badge (E11D), list screen, empty state (blueprint 11) | `features/notifications/` | 100k / 120k / 60k |
| **J5** | Chat UI — blueprint 8, bubbles, day dividers, video form-check with timestamped notes | `features/chat/` | 120k / 140k / 60k |
| **J6** | Phase gate — abuse traces, regression tests, E2E matrix, Bible audit, brain sync | tests + docs | 80k / 100k / 60k |

---

## What v1 deliberately is not

Written down so it is not re-litigated mid-phase:

- **No push notifications.** `push_devices` is created and INERT. FCM/APNs is a deployment concern
  with per-platform credentials, and the table exists only so adding it later is not a migration.
- **No WebSocket.** Chat polls via TanStack `refetchInterval`. The upgrade path is documented, not
  built — a socket needs a connection lifecycle, auth on upgrade, and reconnect semantics, none of
  which earn their cost before there are two users talking.
- **No group chat.** 1:1 coach↔client only. The schema should not make groups impossible, but it
  should not carry the cost of them either.
- **No message editing.** A sent message is a fact. Deletion, if any, is a tombstone.
- **No read receipts beyond `read_at` on the row.** Typing indicators need a socket.

---

## Gate

Same as Phase 2's, plus what this phase adds:

`npm run build` (check-tokens + check-i18n + check-interval + tsc + vite) · `npm run smoke` ·
`npm run check:routes` · `npm run check:worker-tx` · `npm run verify:schema` · `npm audit` ·
E2E matrix at 360 and 1440 in both roles · Bible audit, measurable half · brain synced.

**Every gate added this phase must be proven load-bearing** — broken deliberately once, and seen to
fail by name. A gate never seen to fail is not evidence.
