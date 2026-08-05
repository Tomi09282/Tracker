---
type: todo-phase
phase: 6
title: TODO — Phase 6 (F15 public marketplace & community)
status: pending
updated: 2026-08-04
tags: [todo, phase-6]
---

# Phase 6 TODO — public marketplace · forum · social layer

Parent: [[TODO Master]] · Previous: [[TODO Phase-5]] · Owner req 19

## P0 — Kickoff
- [ ] **T6.0.1** SHARED_MEMORY reset + contracts carried forward — `pending`
- [ ] **T6.0.2** ui-ux-pro-max `--design-system` + `--domain ux` (feeds, cards, comment threads) — `pending` · SO-4
- [ ] **T6.0.3** `docs/pipeline/phase-6/spec.md` with job slicing + budget lines — `pending`

## Content model
- [ ] **T6.1.1** `coach_profiles` — bio, specialties, city, verified badge (admin-granted only) — `pending`
- [ ] **T6.1.2** `coach_posts` — type program / event / announcement, title, body, city, event_at, capacity, price info, published_at — `pending`
- [ ] **T6.1.3** `post_media` — cover + gallery (images/videos) through the hardened pipeline — `pending`
- [ ] **T6.1.4** `post_comments` — threaded, exactly 1 level of replies — `pending`
- [ ] **T6.1.5** `post_reactions` — likes — `pending`
- [ ] **T6.1.6** `coach_follows` — `pending`
- [ ] **T6.1.7** Body is **sanitized markdown — NEVER raw HTML**, sanitized on write AND escaped on render — `pending`

## Discovery
- [ ] **T6.2.1** Public feed: latest / following / by-city — `pending`
- [ ] **T6.2.2** Search + filters, whitelisted sort keys, cursor pagination with hard caps — `pending`
- [ ] **T6.2.3** Public coach profile page (bio, specialties, city, follower count, verified badge, posts grid) — `pending`
- [ ] **T6.2.4** Share / copy link; deep-linkable URLs for every public screen — `pending`

## Social interactions
- [ ] **T6.3.1** E23 like/reaction — all five variants (heart burst, double-tap, reaction bar, liked pulse, count roll) — `pending`
- [ ] **T6.3.2** E24 follow button — all five variants (morph pill, bell offer, avatar slide, first-of-day, unfollow guard) — `pending`
- [ ] **T6.3.3** Price info display only — actual purchase wiring arrives with coins (Phase 5) or the later payment processor — `pending`

## Safety & moderation
- [ ] **T6.4.1** Report → admin moderation queue (ties into F8) — `pending`
- [ ] **T6.4.2** Author-side comment deletion — `pending`
- [ ] **T6.4.3** Block list, enforced on feed, comments and profiles — `pending`
- [ ] **T6.4.4** Posting / commenting rate limits (per account + per IP) — `pending`
- [ ] **T6.4.5** Community guidelines acceptance logged with timestamp + version — `pending`
- [ ] **T6.4.6** Public endpoints are the widest attack surface — stricter body caps, JSON depth limits, and `public` rate tier — `pending`

## Security
- [ ] **T6.5.1** Public reads expose ONLY published, non-blocked, non-removed content — predicate hardcoded in SQL — `pending`
- [ ] **T6.5.2** Author-only mutations re-validated server-side on every edit/delete — `pending`
- [ ] **T6.5.3** Stored-XSS regression tests on every user-generated text field — `pending`
- [ ] **T6.5.4** Abuse-path trace + security regression tests — `pending`

## Phase gate
- [ ] **T6.6.1** build + smoke + `npm audit` green — `pending`
- [ ] **T6.6.2** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T6.6.3** Webview E2E ✅/❌ matrix — `pending`
- [ ] **T6.6.4** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-5]] · [[TODO Phase-7]]
