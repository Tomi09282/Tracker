---
type: ux-concept
title: UX base pack
updated: 2026-08-04
tags: [ux, shell]
---

# UX base pack

The cross-screen behaviour the Bible asks for, built once in the shell rather than per screen.

## Shipped

| Piece | Where | The decision worth remembering |
|---|---|---|
| Skeletons, never spinners | `ui/feedback/ScreenSkeleton`, E18 | Shapes match the real geometry, so the swap causes no layout shift |
| Empty states | `ui/feedback/EmptyState` | 120px illustration, one message, one CTA — never a bare "no data" |
| Offline indicator | `ui/shell/OfflineIndicator` | Appears on the `offline` event, but disappears only after a real request reaches `/healthz`. `navigator.onLine` is honest about "no interface" and lies about captive portals |
| Command palette | `ui/shell/CommandPalette` | Cmd/Ctrl+K, desktop only, and **deliberately not animated** — the Bible puts anything used 100×/day in the "no animation, ever" row |
| Haptics | `lib/haptics` | Capacitor on device, a genuine no-op on web. A wrong buzz is worse than none, and the Vibration API is not a substitute |
| Toasts | E15 | `aria-live="polite"`, never assertive; auto-dismiss pauses under the cursor |
| Bottom sheets | E14 | Escape closes, focus enters on open, softer spring than a button |
| Pull to refresh | E19 | Only arms at scroll top, or it fights the scroll |
| Swipe actions | E13 | Pointer capture so a fast swipe survives leaving the element; damping past the threshold |
| Reduced motion | `useMotionSafe` + CSS backstop | The state change still happens and stays visible — it just does not travel |

## Not built yet

- Optimistic mutations beyond the query invalidation already in place
- Coach marks on first use
- A queued-action store for writes made while offline (the indicator reports the state; it does
  not yet hold a queue)

## Untestable in this environment

The preview pane does not composite frames and `document.hasFocus()` is false, so three things
cannot be verified here and are neither claimed working nor reported broken: autofocus,
animation end-states, and anything needing a screenshot. See the gotchas in SHARED_MEMORY.
