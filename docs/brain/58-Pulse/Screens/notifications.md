---
type: screen-inventory
title: Értesítések — screen inventory
updated: 2026-10-11
route: "/notifications"
tags: [ux, screen, inventory, pulse]
---

# Értesítések — `/notifications` · every role (Tag, Edző, Admin — the screen is identical) · on a phone reached ONLY through the bell: in the Home header (all roles) and in the coach dashboard header at `/coach` (Edző, Admin); on desktop (≥ 1024 px) the Cmd/Ctrl+K command palette lists it too · lit tab: **none** (in code no tab owns this route; the old spec intended Kezdőlap)

Sources checked: `frontend/src/features/chat/{NotificationsPage,NotificationBell,useChat}.ts(x)`, `backend/src/notifications/routes.js`, `backend/src/db/worker.js` (the two places that write a notification), `backend/scripts/seed-demo.mjs` (section 11), `frontend/src/app/{router,navTabs}.ts(x)`, `hu.json`. The brain spec's tinted bell disc, cards and icon holders are the OLD look — ignored here.

## Purpose

The in-app inbox: what arrived since last time, newest first, each row optionally a link to the thing it is about. The user arrives by tapping the bell's badge, so the screen first confirms what the badge was counting (the unread number, frozen for the visit), then lists the items.

**The ONE primary action: "Összes olvasottnak jelölése"** (mark everything read). Important: the screen also fires this by itself the moment the list has rendered, so the button is on screen for about one network round trip and is a fallback (offline, or a failed request) rather than something users press.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy (key = value) | Sample data |
|---|---|---|---|---|
| Sub-screen header | live | Back control (icon only; returns to where the bell was tapped) + the screen title. | `common.back` = "Vissza" (accessible name only, not visible)<br>`notifications.title` = "Értesítések" | Értesítések |
| Unread count (the anchor) | live | The number of unread items AT ARRIVAL, held for the whole visit — it does NOT drop when the rows are marked read. Unit caption under the numeral. With 0 the bell mark is shown struck through / silent. Unknown (loading, error) → no numeral and no caption. Not tappable. Caveat: the number is read from the FIRST list the screen has, and on a return within about five minutes that is the cached list of the previous visit — the numeral can then say 0 (silent bell) above freshly arrived unread rows (a bug; do not draw it). | `notifications.unreadLabel` = "olvasatlan értesítés"<br>`notifications.withUnread` = "Értesítések, {{count}} olvasatlan" (accessible name only — never print it) | 2 · olvasatlan értesítés |
| Mark-all-read action | live | Full-width primary (with a leading check glyph today). Rendered ONLY while at least one row is unread; busy while the request runs; disabled offline. Fired automatically on arrival (see States). | `notifications.markAllRead` = "Összes olvasottnak jelölése" | visible on arrival, then gone |
| Notification row | live | Type glyph · title (1 line, truncates) · body (optional, 1 line, truncates) · relative age · state mark (unread: accent dot · read: check). A row WITH a link is one tappable target (the whole row navigates); a row WITHOUT a link is static — no press state. No chevron (removed on purpose). | title, body: NO KEY — server-written text<br>`notifications.minutesAgo` = "{{count}} perce"<br>`notifications.hoursAgo` = "{{count}} órája"<br>`notifications.daysAgo` = "{{count}} napja" | "kovacs.peter" · no body · 5 perce · unread<br>"Felszerelés frissítve" · "Az edződ módosította az eszközeidet." · 2 órája · unread |
| "Earlier" divider | live | Separates unread rows from already-read rows. Shown ONLY when both groups are present. | `notifications.earlier` = "Korábbiak" (the code upper-cases it) | KORÁBBIAK |
| Empty text | live | Replaces the list. Title + body, deliberately NO action. | `notifications.emptyTitle` = "Nincs értesítés"<br>`notifications.emptyBody` = "Ha üzenetet kapsz vagy változik a terved, itt jelenik meg." | new member |
| Error text + retry | live | Replaces the list when the request fails — also an already loaded list, when a later 60 s poll fails; one secondary action that refetches. The message is borrowed from the auth namespace and is set as the block's title (there is no body line). | `auth.errors.generic` = "Nem sikerült a művelet. Próbáld újra."<br>`common.retry` = "Újra" | — |

The only two notification kinds the server really writes (both carry a link):

| Kind | Title | Body | Glyph family today | Tap goes to |
|---|---|---|---|---|
| New chat message | the SENDER'S E-MAIL LOCAL PART, e.g. "kovacs.peter" (not the display name) | none — message text is deliberately never copied | message | `/chat/<id>` — NOT a route → the user lands on Home (member and coach alike) |
| Coach changed the client's equipment | "Felszerelés frissítve" (hard-coded server string) | "Az edződ módosította az eszközeidet." (hard-coded server string) | generic bell (its type has no glyph of its own) | `/settings` (top of Profil, not the Felszerelés section) |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy (key = value) | Sample data |
|---|---|---|---|---|
| The bell (entry point — lives on Home and the coach dashboard, NOT on this screen) | live | Bare bell + count badge. Badge hidden at 0 · the number 1–99 · "99+" when the server reports the count as capped. Tap → this screen. The count is polled every 60 s while the app is visible and never adjusted locally. | accessible name: `notifications.title` = "Értesítések" (no unread) / `notifications.withUnread` = "Értesítések, {{count}} olvasatlan"<br>"99+": hard-coded, no key | 2 |
| Offline strip (app shell, above the header) | live | One or two lines; pushes the screen down. | `offline.title` = "Nincs internetkapcsolat"<br>`offline.queued` = "{{count}} művelet vár feltöltésre" | Nincs internetkapcsolat |
| Type glyph families | live in the client, mostly unused | The row mark is chosen by the first word of the type: chat / coach → message · plan / workout → dumbbell · nutrition → salad · record → trophy · anything else → bell. Only "message" and "bell" occur with real server data. | no key | — |
| Older items (beyond the first 30) | planned — the API pages with a cursor, the screen loads the first page only | No load-more control exists. | no key | — |
| Mark ONE row read | cut from the UI — the API accepts ids, nothing calls it. Marking a row UNREAD does not exist at all (no endpoint) | — | no key | — |
| A destination for chat rows on the member side | planned — there is no member chat screen or route | — | no key | — |
| More notification kinds (plan changed, new record, nutrition, achievement, coins) | planned — the server emits none. Glyph families exist only for plan / workout / nutrition / record; an achievement or coin kind has none and would fall back to the bell | — | no key | — |
| Notification preferences, push, e-mail | cut / deferred — in-app only | — | no key | — |

## States

- **Before the screen** — route chunk loading: the shell's full-screen skeleton.
- **Loading** — header · a neutral (unlit) bell mark · a placeholder where the numeral goes · two row placeholders. No caption, no button.
- **Arrival with unread** — numeral N · "olvasatlan értesítés" · the primary button, which turns busy at once because the screen marks everything read by itself · unread rows · "Korábbiak" · read rows.
- **Settled (same visit, one round trip later)** — the numeral STILL shows N · the button is gone · every row carries the read mark · the "Korábbiak" divider is gone (no unread group left). This is how the screen looks for the rest of the visit.
- **Arrival with nothing unread** — numeral 0 with the silent bell · caption · no button · all rows read · no divider.
- **Only unread, no older rows** — no divider.
- **Empty** — numeral 0 with the silent bell · caption · "Nincs értesítés" · "Ha üzenetet kapsz vagy változik a terved, itt jelenik meg." · no action.
- **Error** — bell mark with NO numeral and NO caption (unknown is not zero) · "Nem sikerült a művelet. Próbáld újra." · [Újra].
- **Offline** — shell strip · the last loaded list stays · the automatic mark-read does not fire · the button stays visible but DISABLED, so the unread look persists. Opened while the browser reports offline with no list cached: the Loading layout stays (the request is held; no error appears).
- **Mark-read failed** — no message exists; the button returns to idle and stays; rows stay unread. (The only way an idle, enabled button stays on screen while online.)
- **New item while the screen is open** (60 s poll, paused when the app is hidden) — it appears on top as unread and is marked read automatically; the numeral does not change.
- **Row** — with link (pressable) / without link (static). Unread / read.
- **Bell** — no badge / 1–99 / "99+".
- **Roles / devices** — none. Content differs only by who writes to you: a coach's rows are client messages (title = the client's e-mail local part, e.g. "takacs.daniel"). Rows tied to a coach–client link disappear when that link is archived.
- **Overlays** — none. No sheet, dialog, toast, swipe action or menu.

## Frames to draw

All three: 402 × 874, status bar 9:41, member tab bar with **no tab lit** (five idle icons: Kezdőlap · Edzés · Étkezés · Haladás · Profil).

### Frame 1 — "Értesítések · érkezés, 2 olvasatlan" (what paints first when the member taps the bell showing 2)

1. Sub-screen header: back chevron (bare glyph; accessible name "Vissza") · title **Értesítések** (display face → ÉRTESÍTÉSEK).
2. Anchor: **2** (the screen's one giant numeral) · caption **olvasatlan értesítés**.
3. Primary pill: **Összes olvasottnak jelölése** (draw it idle; in the running app it is busy on arrival and disappears a moment later).
4. Unread row: **kovacs.peter** · (no body line) · **5 perce** · lime unread dot · message mark.
5. Unread row: **Felszerelés frissítve** · "Az edződ módosította az eszközeidet." · **2 órája** · lime unread dot · bell mark.
6. Divider label: **Korábbiak** (as an eyebrow → KORÁBBIAK).
7. Read row: **kovacs.peter** · (no body) · **1 napja** · read check.
8. Read row: **kovacs.peter** · (no body) · **3 napja** · read check.
9. Read row: **Felszerelés frissítve** · "Az edződ módosította az eszközeidet." · **12 napja** · read check.
10. Read row: **kovacs.peter** · (no body) · **20 napja** · read check — cut by the bottom fade.
11. Tab bar, nothing lit.

### Frame 2 — "Értesítések · megnyitás után" (the settled state: the same visit after the automatic mark-read; where the screen rests)

1. Header **Értesítések**.
2. Anchor: **2** · **olvasatlan értesítés** (unchanged on purpose).
3. NO pill. NO "Korábbiak" label.
4. Six rows, all with the read check, same order and text as Frame 1: kovacs.peter · 5 perce / Felszerelés frissítve · Az edződ módosította az eszközeidet. · 2 órája / kovacs.peter · 1 napja / kovacs.peter · 3 napja / Felszerelés frissítve · Az edződ módosította az eszközeidet. · 12 napja / kovacs.peter · 20 napja.
5. Tab bar, nothing lit.

### Frame 3 — "Értesítések · üres" (a new member, or a member without a coach)

1. Header **Értesítések**.
2. Anchor: **0** with the silent / struck-through bell mark · **olvasatlan értesítés**.
3. Title **Nincs értesítés**.
4. Body "Ha üzenetet kapsz vagy változik a terved, itt jelenik meg." (2 lines).
5. No button, no illustration with a call to action.
6. Tab bar, nothing lit.

Sample data source: the two unread rows are section 6.5 of the feature inventory verbatim. The four read rows are illustrative repeats of the same two real kinds (ages invented, shapes real). The demo seed was NOT used here — see Notes.

## Images

- **The anchor is the numeral.** The old design put an oversized line bell above it; in Pulse a line glyph must not be the main visual. If the screen wants one glowing object, it is a graphite 3D bell in the tab-icon render family (lit for unread, dark / silent for 0) — NEW art, no such asset exists in the kit yet (`gen.py`).
- **Row marks:** five small glyph families exist (message, dumbbell, salad, trophy, bell); with real data only two occur. They are utility marks, not pictures; the unread state is carried by the lime dot, the read state by a check. In the kit's `icons.json`: `bell`, `check`, `chevron-left` and `message-circle` exist; the app's own `message-square` and the struck-through `bell-off` do not (use `message-circle`; a silent bell is new work).
- **Sender identity is text only.** The payload has no sender id, no display name and no initials — a monogram such as "KP" cannot be derived and must not be drawn.
- **Must NOT be shown as if it existed:** profile photos or avatars, a message preview, attachment or image thumbnails, a per-type coloured app icon, an empty-state illustration that suggests an action.

## Do not invent

- Message text in a chat notification — the server deliberately sends the sender's name only.
- The sender's display name ("Kovács Péter"), monogram or photo — the title is the e-mail local part ("kovacs.peter").
- Kinds the server never emits: plan changed, new plan, workout reminder, new record, achievement unlocked, coins earned or spent, streak at risk, nutrition reminder, client joined / inactive, moderation.
- Tabs or filters ("Összes / Olvasatlan"), category chips, search.
- Day headers ("Ma", "Tegnap") — the only divider is "Korábbiak".
- Swipe to delete or archive, "delete all", a per-row read toggle, a long-press menu, mute.
- A settings gear, a push opt-in prompt, quiet hours, e-mail toggles.
- Inline actions on a row (reply, open, accept); a chevron on rows.
- Pull-to-refresh, load-more, infinite scroll, a "new notifications" pill.
- Absolute dates or clock times, "most" / "épp most", weeks or months — only "perce / órája / napja" (so "0 perce" and "84 napja" are real).
- A Notifications tab, a badge on any tab, a bell on any screen other than Home and the coach dashboard.
- The unread count in the title ("Értesítések (2)"); a toast for a new item.
- An action in the empty state.
- A lit Kezdőlap tab as existing behaviour.

## Notes for the designer

- **The one lime pill is ephemeral.** The screen marks everything read on arrival, so "Összes olvasottnak jelölése" is busy as it appears and gone a moment later. Frame 2 is where the screen actually rests. Whether marking read should become a deliberate tap is an owner decision — do not redesign it silently.
- **The numeral keeps saying 2 while no row looks unread.** That is intended (the arrival count is frozen); the caption must make it read as "what you came for", not as a live counter.
- **Bare chat rows.** A message row is ONE line of text ("kovacs.peter") — no body. Row height must work for title-only rows next to title + body rows.
- **Dead link:** tapping a chat row drops the user on Home (members have no chat screen; the coach's chat lives at `/coach/clients/:id/chat`). The row still presses like a link.
- **Count mismatch at the extreme:** the anchor counts unread rows within the first 30 loaded items, the bell badge counts up to "99+". Design the numeral for 0–30.
- **Long strings:** "Összes olvasottnak jelölése" is 27 characters — it fits the 354 pt pill, and should be checked at 360 pt wide. `notifications.emptyBody` is 58 characters (2 lines). A title can be a long e-mail local part and truncates.
- **No tab lit** means a bar of five (coach six, admin seven) idle icons. Back returns to Home or to `/coach`, whichever bell was used.
- **The demo database is misleading.** Its seeded inbox for the member (8 rows: "Új üzenet az edződtől", "Új személyes csúcs!", "Teljesítmény feloldva", "A sorozatod veszélyben" …) uses kinds no server code emits, states coin amounts in internal units ("5 000 érmét", "25 000 érméért" for 50 and 250 coins) and has a typo ("Frissült az edzéstervedet"). The owner sees those rows in his demo; they are not product copy and are not used here.
- **Sub-screen header** has no approved V1 drawing yet: bare back chevron + display title (review brief M-13) — no boxed icon button.
- **Coach variant sample:** unread row "takacs.daniel" · 5 perce (a client's message; the local part of takacs.daniel@pelda.hu). Other clients would appear the same way (e.g. "nagy.eszter" — illustrative, same shape). An admin receives nothing the server emits unless they are also in a coach–client relationship.
