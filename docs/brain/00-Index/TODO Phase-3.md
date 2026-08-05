---
type: todo-phase
phase: 3
title: TODO — Phase 3 (F5 notifications + F6 chat)
status: pending
updated: 2026-08-04
tags: [todo, phase-3]
---

# Phase 3 TODO — notifications · chat · video form-check

Parent: [[TODO Master]] · Previous: [[TODO Phase-2]]

## P0 — Kickoff
- [x] **T3.0.1** SHARED_MEMORY status board reset for Phase 3; contracts carried forward — `done` · status board reset to Phase 3; the Phase 2 detail collapsed to one line and its twenty accumulated lessons live in the cold brain at [[0010-phase-2-lessons]] rather than in this hot file. Contracts carried forward: the LINK is the authority, 404-not-403 on object misses, predicates written once, guards inside the UPDATE, ADR-0005 commit-on-return (now gated), rollups recomputed not incremented
- [x] **T3.0.2** ui-ux-pro-max `--design-system` + `--domain ux` passes (messaging, real-time feel, notification centers) — `done` · decisions recorded in [[Messaging and Notifications]] BEFORE any UI exists, which is when they are cheap. **The pass found a live defect**: `BottomNav` clamps at five slots exactly as its comment promises, and a coach already fills all five — so pushing an admin tab made six and an ADMIN COULD NOT REACH /admin FROM THE NAVIGATION AT ALL. Measured, then fixed by moving admin into Settings, where it belongs anyway: role-specific and infrequent is the definition of secondary navigation. Phase 3 would have made this two tabs worse. Resolved by deciding that **neither chat nor notifications takes a nav tab** — notifications are a header bell (a transient inbox is not a destination), coach-side chat is the Chat tab that ALREADY exists on the client detail screen (a coach's chat is always about a client, and going through the client inherits the link predicate for free), and client-side chat is one conversation reachable from Home. Also decided: optimistic send with a failed bubble that STAYS marked rather than vanishing (a vanished message reads as a sent one — the T2.0.3 lesson), 5 s polling with the conversation open and paused when the tab is hidden, 60 s for the unread count, virtualise past 50, and no typing indicators, read receipts, editing or sound
- [x] **T3.0.3** `docs/pipeline/phase-3/spec.md` with job slicing + budget lines — `done` · `docs/pipeline/phase-3/spec.md` — six jobs with budget lines, what must not be rebuilt, and **the six architecture decisions written down BEFORE any DDL** (conversation vs archived link, notification payload vs deleted subject, quiet hours with no cron, where block lives, retention enforced not documented, what stops a payload leaking). They are recorded as decisions rather than left implicit because SQLite cannot alter a CHECK or an FK — getting one wrong is a 12-step table rebuild, which is exactly what migration 011 had to work around

## F5 — Notifications (v1 = in-app only, decision D-8A)
- [x] **T3.1.1** `notifications` table (user_id, type, payload JSON, read_at, created_at) — `done` · `notifications` — shipped in migration 013 (schema v13), scope deliberately NARROW after a four-lens adversarial review found every severe defect in the ELABORATE parts of a fuller design — collapse upserts, quiet-hours triggers, an automated retention sweep, a dedupe key bounded by a GLOB that was a no-op. One of them, `CHECK (deliver_after <= created_at + 2678400)`, would have bricked every collapsed notification 31 days on, and SQLite cannot alter a CHECK. Proven by `npm run verify:013` — 25 refusals run against a live database inside a transaction that is always rolled back. The payload is a SNAPSHOT (title/body/link_path written by the server), the same decision 010 made for `exercise_name_snapshot`: "your coach added Tuesday" must still read correctly after Tuesday is deleted
- [ ] **T3.1.2** `user_notification_settings` — per-type toggles + quiet hours — `pending`
- [x] **T3.1.3** `push_devices` table created but INERT (FCM/APNs deferred) — `done` · `push_devices` created and INERT, no route writes it. The token is stored HASHED like every other credential here, and the uniqueness is scoped to the USER — a globally unique token column would let one account claim another's token and silently redirect its notifications, which the review found in the fuller design
- [ ] **T3.1.4** In-app bell + unread badge (E11D bubble) — `pending`
- [ ] **T3.1.5** Triggers: new plan day, coach message, workout reminder, coin events (coin hook inert until Phase 5) — `pending`
- [ ] **T3.1.6** Streak watch + weekly adherence digest for coaches — `pending`
- [ ] **T3.1.7** Notification list screen with empty state (blueprint 11) — `pending`
- [ ] **T3.1.8** Quiet hours respected server-side, not just in the client — `pending` · never trust the client

## F6 — Chat (v1 = polling, decision D-5A)
- [x] **T3.2.1** `conversations` (1:1 coach↔client, ownership-scoped both ways) — `done` · `conversations` — one per LINK, not per (coach, client) pair: the same two people can be linked, archived and linked again, and those are different working relationships. The parties are denormalised for the hot read and FROZEN by trigger, and a conversation that claims a link it does not belong to is refused
- [x] **T3.2.2** `messages` (body, attachment_id, read_at, created_at) — `done` · `messages` — body bounded 1..4000 in the COLUMN as well as in zod, because zod guards one route and the column guards every writer that will ever exist. A sent message is immutable except for its deletion tombstone and read stamp. `last_message_at` is RECOMPUTED by trigger, never incremented
- [ ] **T3.2.3** Polling via TanStack `refetchInterval`; WebSocket upgrade path **documented, not built** — `pending`
- [ ] **T3.2.4** Chat screen per blueprint 8 — bubbles (coach accent-subtle / client surface-1), day dividers, read ticks, composer with attachment + send morph E1D — `pending`
- [ ] **T3.2.5** Video form-check: client uploads a set video, coach replies with timestamped notes; inline player + timestamp-note chips — `pending`
- [ ] **T3.2.6** Message rate limits (per account + per conversation) — `pending`
- [x] **T3.2.7** Report / block flows — `done` · `message_reports` WITH A STATUS, because the review's sharpest product point was that a report written into a table nobody reads is worse than no report button: it promises a response that cannot arrive. Block lives on the conversation and names WHO blocked — a coach blocking a client and a client blocking a coach are different events with different remedies, and a boolean cannot tell a moderator which happened
- [ ] **T3.2.8** Retention policy documented and enforced — `pending`

## Security
- [ ] **T3.3.1** Conversation access re-validated on EVERY read and write; a message id from another conversation returns 404 — `pending`
- [ ] **T3.3.2** Video upload through the Phase 1 pipeline: magic-byte sniff, size cap, random key, sandboxed transcode when video processing lands — `pending`
- [ ] **T3.3.3** Message body sanitized on output; no raw HTML ever — `pending`
- [ ] **T3.3.4** Notification payloads leak nothing the recipient may not see — `pending`
- [ ] **T3.3.5** Abuse-path trace + security regression tests per endpoint — `pending`

## Phase gate
- [ ] **T3.4.1** build + smoke + `npm audit` green — `pending`
- [ ] **T3.4.2** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T3.4.3** Webview E2E ✅/❌ matrix — `pending`
- [ ] **T3.4.4** Brain updated + `brain-sync.mjs` run; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-2]] · [[TODO Phase-4]]
