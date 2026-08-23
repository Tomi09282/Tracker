---
type: screen-spec
title: Értesítések — Notifications
route: /notifications
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Értesítések — Notifications

The notification inbox: everything the app or a coach has sent since last time, newest first, each one a link to the thing it is about. The user arrived by tapping a badge, so the screen's first job is to confirm what that badge was counting — and its second is to let them clear it deliberately rather than by accident.

## Anchor

An oversized bell glyph in a large soft tinted circle with an accent dot badge at its upper right, the figure `3` in very heavy numerals directly beneath it, and the caption `olvasatlan értesítés` under that. The bell is the badge the user just tapped, enlarged — the anchor is the answer to the gesture that opened the screen. A count is the only number this screen owns, so it gets the count, not a chart.

> [!warning]
> `NotificationsPage` marks everything read on mount, once the list has rendered. With the count promoted to the anchor, that means the largest element on the screen shows `3` for one frame and then drops to `0` while the user is still reading it. **The anchor freezes the arrival count for the duration of the visit** and does not follow the live unread query; rows lose their unread tint as they are marked, which is where the state change belongs. Without this the redesign's own anchor destroys itself on paint.

## Blocks

1. **Header row** — a back control on the left, h1 `Értesítések` centred. The old back *text* link is gone; the control is the icon.
2. **Bell anchor** — see above.
3. **`Összes olvasottnak jelölése`** — a full-width filled button with a check icon, sitting **above** the list. It is the primary action and it now sits where a primary action is reachable, instead of below an unbounded list. It renders only while something is unread.
4. **Unread rows** — each: a type icon in a tinted holder, the title in body text, one truncated body line, the relative time right-aligned (`12 perce`, `3 órája`, `5 órája`), and an accent dot at the row's right edge. Accent border, accent-tinted fill. In the mockup: `Új üzenet` / `Szia! A tegnapi guggolásnál fájt a térdem a harm…`, `Változott a terved` / `Alsótest A · 4 nap · 7 napos ciklus`, `Új étrend` / `Étrend · 7 napos ciklus`.
5. **`KORÁBBIAK`** — a section header with a history icon holder, dividing unread from already-seen.
6. **Read rows** — the same row shape on the quiet surface: `Új rekord` / `Fekvenyomás · becsült 1RM · 102,5 kg` / `2 napja`, with a green check where the unread dot was. The list runs off the bottom edge; the clipped row is the fold cue.

> [!important]
> Two strings on this screen do not exist yet. The anchor caption needs a pluralised key (`{{count}} olvasatlan értesítés`, rendered with the count split out into the numeral above it) — `notifications.withUnread` is an accessibility label for the bell link and must not be reused for visible copy. `KORÁBBIAK` needs a key of its own.

## What was merged away, and why

The header unread pill is gone: its count *is* the anchor now, and two live readouts of the same number on one screen is precisely the pattern this redesign was called in to remove. The back text link became an icon control. The row chevrons went. The primary action moved from below the list to above it.

The chevrons are the cut that needs defending. `link_path` is nullable — some notifications go somewhere and some are just statements — so the chevron was carrying a real distinction, badly: at the far right of a row whose left side already says everything.

> [!warning]
> Without the chevron, a row with a destination and a row without one look identical. The affordance has to be carried by press feedback instead: a row with `link_path` is a `Link` and presses; a row without one has no press state at all and no pointer cursor. If both press, the screen lies twice — once by moving, once by not moving.

(`link_path` is validated server-side to start with a single `/`. That CHECK constraint is what makes rendering it as a router link safe rather than merely conventional; an absolute URL in a notification is an open redirect.)

The keyboard focus ring is absent from the mockup. That is a rendering artefact of a static image, not a decision — the focus ring is not removable.

## States

- **Loading** — a quiet unbadged bell with a skeleton where the numeral goes, then two card-shaped row skeletons. The mark-read button is absent until there is a count to justify it.
- **Empty** — the anchor renders at `0` with a struck-through bell and no dot badge, and the list is replaced by `Nincs értesítés` / `Ha üzenetet kapsz vagy változik a terved, itt jelenik meg.` No suggested next step, because there is none: an empty state that invents an action for a screen with nothing to do is noise. The button does not render.
- **Error** — a failed fetch shows the bell with no numeral rather than `0`. Nothing-to-show and could-not-load are different facts.
- **Offline** — the list polls once a minute while the tab is visible and pauses when hidden; offline it shows the last successful poll under the `Nincs internetkapcsolat` banner, and the mark-read button is disabled because marking read is a server write. The badge is never decremented locally — the server owns the count and caps it, so client arithmetic would drift.
- **Marking in flight** — the button shows busy; rows keep their unread tint until the refetch lands. No optimistic clearing.
- **Role-gated** — none. Every role has the same inbox; a coach's rows simply carry different `type` values.

## Components

Reuses `Pressable`, `EmptyState`, `Skeleton`, `OfflineIndicator`, `BottomNav`, the `control` recipe, router `Link` rows, and the `useNotifications` / `useMarkNotificationsRead` / `useUnreadCount` hooks unchanged. `NotificationBell` is the entry point that lives in other screens' headers and is not rendered here.

Genuinely new: the bell anchor; a **`type` → icon map**, since rows carry no icon at all today and the four types in the mockup (message, plan change, nutrition plan, personal record) each need one, with a documented fallback for an unknown type; the `KORÁBBIAK` divider; and the unread dot that replaces the chevron.

## Navigation

Member bar, five tabs, `Kezdőlap` active — `/notifications` is entered from the home header's bell and owns no tab of its own. That is the standing decision: a notification centre is a transient inbox, not a destination, and the bar was already full. Coach six, admin seven, same rule.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/12b-notifications.webp]]
![[_mockups/vilagos/12b-notifications.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
