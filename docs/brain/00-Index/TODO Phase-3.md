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
- [ ] **T3.0.1** SHARED_MEMORY status board reset for Phase 3; contracts carried forward — `pending`
- [ ] **T3.0.2** ui-ux-pro-max `--design-system` + `--domain ux` passes (messaging, real-time feel, notification centers) — `pending` · SO-4
- [ ] **T3.0.3** `docs/pipeline/phase-3/spec.md` with job slicing + budget lines — `pending`

## F5 — Notifications (v1 = in-app only, decision D-8A)
- [ ] **T3.1.1** `notifications` table (user_id, type, payload JSON, read_at, created_at) — `pending` · JSON allowed here: non-relational payload blob
- [ ] **T3.1.2** `user_notification_settings` — per-type toggles + quiet hours — `pending`
- [ ] **T3.1.3** `push_devices` table created but INERT (FCM/APNs deferred) — `pending`
- [ ] **T3.1.4** In-app bell + unread badge (E11D bubble) — `pending`
- [ ] **T3.1.5** Triggers: new plan day, coach message, workout reminder, coin events (coin hook inert until Phase 5) — `pending`
- [ ] **T3.1.6** Streak watch + weekly adherence digest for coaches — `pending`
- [ ] **T3.1.7** Notification list screen with empty state (blueprint 11) — `pending`
- [ ] **T3.1.8** Quiet hours respected server-side, not just in the client — `pending` · never trust the client

## F6 — Chat (v1 = polling, decision D-5A)
- [ ] **T3.2.1** `conversations` (1:1 coach↔client, ownership-scoped both ways) — `pending`
- [ ] **T3.2.2** `messages` (body, attachment_id, read_at, created_at) — `pending`
- [ ] **T3.2.3** Polling via TanStack `refetchInterval`; WebSocket upgrade path **documented, not built** — `pending`
- [ ] **T3.2.4** Chat screen per blueprint 8 — bubbles (coach accent-subtle / client surface-1), day dividers, read ticks, composer with attachment + send morph E1D — `pending`
- [ ] **T3.2.5** Video form-check: client uploads a set video, coach replies with timestamped notes; inline player + timestamp-note chips — `pending`
- [ ] **T3.2.6** Message rate limits (per account + per conversation) — `pending`
- [ ] **T3.2.7** Report / block flows — `pending`
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
