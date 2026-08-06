---
type: report
title: Webview E2E matrix — Phase 3
updated: 2026-08-06
tags: [audit, phase-3, e2e]
---

# Webview E2E matrix — Phase 3 (T3.4.3)

The screens this phase added, walked at **360 × 740** and **1440 × 900**, in the roles that can
actually reach them. Same probe as [[E2E Matrix Phase-1]] and [[E2E Matrix Phase-2]]: horizontal
overflow, targets under 44 × 44, exactly one `h1`.

**Zero defects.**

| screen | 360 | 1440 |
|---|---|---|
| `/notifications` | ✅ | ✅ |
| `/coach` (bell in the heading) | ✅ | ✅ |
| `/coach/clients/:id` | ✅ | — |
| `/coach/clients/:id` · **Üzenetek tab** | ✅ | ✅ |

## What the chat measured specifically

- **Composer 44 px** — the floor, on the control a coach uses most in this feature.
- **The thread scrolls inside its own box** (`overflow-y: auto`), so a long conversation does not
  grow the client detail page. The same law the workout player is built around, applied here.
- **`flex-direction: column-reverse`** confirmed live, which is what pins the thread to the bottom
  without a scroll calculation.
- **Zero horizontal overflow at 360** with a 4000-character message limit and `break-words` — a
  single long unbroken string is the classic way a chat bubble blows out a layout.

## The bell

44 × 44, badge capped at 99+, and the count lives in the LINK LABEL
(`Értesítések, 2 olvasatlan`) with the badge itself `aria-hidden` — a screen reader is told the
number once, not twice. Measured 2 → 0 on opening the inbox.

## Not covered

- Real iOS/Android hardware. Chromium in a webview only.
- Screen readers themselves — semantics are asserted structurally, not by listening.
- The client-side chat entry point, which is reachable from Home but was exercised here through the
  coach's tab; both render the same `ChatPanel`.
- A conversation long enough to need virtualisation. The rule is written down (past 50) and the
  paging cursor exists; the behaviour under a thousand messages is untested.
