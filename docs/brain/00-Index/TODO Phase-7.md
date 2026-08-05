---
type: todo-phase
phase: 7
title: TODO — Phase 7 (F8 full admin + F9 platform polish)
status: pending
updated: 2026-08-04
tags: [todo, phase-7]
---

# Phase 7 TODO — full admin · Element Style Studio · platform polish

Parent: [[TODO Master]] · Previous: [[TODO Phase-6]] · Owner req 9, 10

## P0 — Kickoff
- [ ] **T7.0.1** SHARED_MEMORY reset + contracts carried forward — `pending`
- [ ] **T7.0.2** ui-ux-pro-max `--design-system` (admin/dashboard, Linear/Raycast crispness) + `--domain chart` (mandatory — the admin is chart-heavy) — `pending` · SO-4
- [ ] **T7.0.3** Read `webdev-standards/references/admin-tooling.md` — `pending`
- [ ] **T7.0.4** `docs/pipeline/phase-7/spec.md` with job slicing + budget lines — `pending`

## F8 — Full admin panel (blueprint 10)
- [ ] **T7.1.1** Left sidebar (icon + label), max-1120px content on a 12-col grid — `pending`
- [ ] **T7.1.2** Stat cards — icon, odometer number (E16D), delta chip — `pending`
- [ ] **T7.1.3** Metrics: DAU/MAU, signups, active coaches, logs/day, coin velocity — `pending`
- [ ] **T7.1.4** Accent area charts — `pending`
- [ ] **T7.1.5** Dense tables — sticky header, row hover, sortable with `aria-sort` — `pending`
- [ ] **T7.1.6** User search + detail — `pending`
- [ ] **T7.1.7** Role grant / disable account / session reset (sv bump) — `pending`
- [ ] **T7.1.8** Audited coin adjust — `pending` · reuses the Phase 5 idempotent ledger path
- [ ] **T7.1.9** Exercise moderation queue (full, upgrading Phase 1's lite version) — `pending`
- [ ] **T7.1.10** Post/comment moderation queue from F15 reports — `pending`
- [ ] **T7.1.11** `audit_log` entry for EVERY admin action, no exceptions — `pending`

## Element Style Studio (owner req 24)
- [ ] **T7.2.1** Element list left / variant cards right with **live interactive preview** — `pending` · blueprint 10
- [ ] **T7.2.2** Switch the active variant per element E1–E26 × A–E — `pending`
- [ ] **T7.2.3** Change applies GLOBALLY to every user, with no code change and no redeploy — `pending` · `element_style_config`
- [ ] **T7.2.4** Every change audited (actor, element, old→new variant, timestamp) — `pending`
- [ ] **T7.2.5** Admin role re-checked in the DB at execution time, not just from the JWT — `pending`

## F9 — Platform polish
- [ ] **T7.3.1** PWA install + offline shell — `pending`
- [ ] **T7.3.2** Offline indicator with queued actions — `pending`
- [ ] **T7.3.3** i18n HU/EN completion sweep — every string keyed, `check:i18n` green — `pending`
- [ ] **T7.3.4** GDPR data export — owner-bound, anti-IDOR — `pending`
- [ ] **T7.3.5** GDPR account deletion (health data = sensitive category) — `pending`
- [ ] **T7.3.6** Capacitor safe-area insets verified on real device sizes — `pending`
- [ ] **T7.3.7** Cmd+K command palette on desktop — `pending` · no open/close animation (used constantly)
- [ ] **T7.3.8** Encrypted backup + documented, tested restore drill — `pending`
- [ ] **T7.3.9** `scripts/rekey.js` runbook documented — `pending` · script exists from BASE

## Security
- [ ] **T7.4.1** Admin routes: `requireRole` + DB role re-check + step-up where destructive — `pending`
- [ ] **T7.4.2** Admin endpoints on their own rate tier, all abuse signals logged — `pending`
- [ ] **T7.4.3** Export/delete flows ownership-bound and rate-limited — `pending`
- [ ] **T7.4.4** Full pre-deploy security checklist walked — `pending`

## Phase gate
- [ ] **T7.5.1** build + smoke + `npm audit` green — `pending`
- [ ] **T7.5.2** Screenshots 360/1440 + Bible line-by-line audit — `pending`
- [ ] **T7.5.3** Webview E2E ✅/❌ matrix — `pending`
- [ ] **T7.5.4** **Full regression sweep across the entire app**, all features, all green — `pending` · E2E protocol final sweep
- [ ] **T7.5.5** Brain updated + sync; SHARED_MEMORY pruned — `pending`

## Related
[[TODO Master]] · [[TODO Phase-6]] · [[TODO Phase-8]]
