---
type: ux-concept
title: Messaging and notifications — the decisions before the code
updated: 2026-08-06
tags: [ux, phase-3, chat, notifications]
---

# Messaging and notifications — decided before building (T3.0.2)

The Phase 3 UI is not designed yet, which is exactly when these are cheap to decide. Everything
below is a decision with its reasoning, so it is not re-argued halfway through the build.

## 0. The finding that forced this: the navigation is already full

Planning where chat and notifications go surfaced a **live defect**.

`BottomNav` takes five slots and clamps with `tabs.slice(0, 5)` — deliberately, and its comment
says so: *"a sixth item is clamped rather than squeezed in — an overflow menu is the correct answer
there"*. But `AppLayout` gives an **admin six tabs**: home, library, settings, coach, plans, admin.

**Measured: an admin sees five tabs and `/admin` is not one of them.** The route works, the role
check works, and there is no way to reach it from the navigation. The clamp did exactly what it
promised; nobody counted.

Phase 3 would have made this two tabs worse.

### Decision: the bottom nav is for DESTINATIONS, and neither of these is one

| surface | where it lives | why |
|---|---|---|
| **Notifications** | a **bell in the screen header**, badge on the bell | Both platform idioms put a notification centre in a header, not in the tab bar. It is a transient inbox, not a place you go. §9 `nav-hierarchy`: primary nav and secondary surfaces must be separated. |
| **Chat, coach side** | the **Chat tab that already exists** on the client detail screen (blueprint 8, currently a placeholder) | A coach's chat is always *about a client*. Reaching it through the client is the shorter path, not the longer one — and it inherits the link's ownership predicate for free. |
| **Chat, client side** | one conversation, reachable from **Home** and from the notification | A client has exactly one coach. A whole tab for one conversation is a tab spent on a screen with one row. |
| **Admin** | moved **into Settings** | It is the least-used destination in the product and belongs to a role, not to the daily loop. This frees the sixth slot and fixes the defect above. |

Net effect: **no new bottom-nav tabs in Phase 3**, and the admin defect is fixed rather than
inherited.

## 1. Polling cadence, and what "real-time feel" actually is

Chat is polling (decision D-5A). Real-time *feel* does not come from a short interval — it comes
from the send being instant and the arrival being unsurprising.

- **Send is optimistic.** The message appears the moment it is submitted, in a pending state. This
  is what makes the app feel live; a 3-second round trip before your own text appears never does.
- **A failed send says so, and stays.** Learned the hard way in T2.0.3: `SetRow` had a failure path
  that silently did nothing. A failed message keeps its bubble, marked, with a retry — it must
  never vanish, because a vanished message reads as a sent message.
- **Interval: 5 s with the conversation open, paused when the tab is hidden.** Not 1 s: a phone in
  a gym on mobile data pays for every poll, and nobody reads faster than 5 s. `refetchInterval`
  accepts a function, so hidden-tab pausing is one line rather than an effect.
- **Unread count polls at 60 s elsewhere.** A badge that is a minute stale costs nothing; a badge
  that polls every 5 s from every screen is a battery bug.

## 2. The badge, and the rule everyone gets wrong

`NavTab` already carries `badge?: number`, and E11 is the catalogued element. The rule that matters
is **clearing**, not showing:

- The badge clears when the user **has actually seen the list**, not when the app decides they
  probably did. `read_at` is per notification, set by the read that displays it.
- A badge over 99 shows `99+`. Unbounded digits break the bar's layout, and the difference between
  100 and 342 unread is not information anyone acts on.
- **The count is never rendered from a cached number the server did not send.** Optimistic
  decrement is where badges start lying.

## 3. The message list

- **Virtualise past 50** (§3 `virtualize-lists`). A year of coaching is thousands of messages.
- **Load newest first, page backwards.** Chat is read from the bottom; a cursor that pages *older*
  is the natural shape, and it matches the keyset pagination this codebase already uses.
- **Day dividers**, per blueprint 8. Dates are the only structure a long conversation has.
- **Coach bubbles `accent-subtle`, client bubbles `surface-1`** — per the blueprint, and both must
  clear 4.5:1 in light and dark, checked independently rather than assumed from one theme.
- **No raw HTML, ever.** Text renders as text. Links are detected and rendered as links *only* if
  that survives the security pass — an auto-linked URL in a message from a stranger is an
  exfiltration surface, and this product has a report/block flow precisely because not every
  message is friendly.

## 4. Empty states

Blueprint 11, and this product's existing rule: a blank screen or a bare "No data" is a defect. Each
of the three needs its own, because the right next action differs:

- **No conversation yet (client)** — "Your coach will start here" plus nothing to do. Honest: the
  client cannot open a conversation with nobody.
- **No messages yet (coach, in a client)** — the compose box IS the action.
- **No notifications** — "Nothing yet", and it should not suggest an action, because there is none.

## 5. What must NOT be built

- No typing indicators. They need a socket and they leak presence.
- No read receipts beyond the row's own `read_at`. "Seen at 23:41" is a social contract this
  product has not asked for.
- No message editing. A sent message is a fact; the schema treats it that way.
- No sound. A gym app that beeps on a message during a set is uninstalled.

## Related

[[Feedback Variants]] (E11 badge) · [[UX Base Pack]] · `docs/pipeline/phase-3/spec.md`
