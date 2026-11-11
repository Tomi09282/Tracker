---
type: screen-inventory
title: Csevegés — screen inventory
updated: 2026-10-11
route: "/coach/clients/:id/chat"
tags: [ux, screen, inventory, pulse]
---

# Edző–kliens csevegés — `/coach/clients/:id/chat` · coach + admin · Edző tab → roster row → client detail → chip "Üzenetek" → link "Teljes beszélgetés" · lit tab: Edző

`:id` is the coach–client LINK id, not a user id. The screen has NO title string: the client's name is the heading ("Edző–kliens csevegés" is a working name, not UI copy). Sources read: `frontend/src/features/chat/ChatPage.tsx`, `ChatPanel.tsx`, `useChat.ts`, `features/coaching/ChatTab.tsx`, `backend/src/chat/routes.js`, `backend/scripts/seed-demo.mjs`. Status words: **live** = in code and reachable from the route · **planned** = spec / TODO only · **cut** = decided against.

The door, tap by tap: tab `nav.coach` = "Edző" → roster row on "Klienseim" → client detail → tab chip `coaching.tab.chat` = "Üzenetek" (an embedded, height-capped copy of the same thread) → link `chat.openFull` = "Teljes beszélgetés" → this screen. There is no other door: the server's "new message" notification links to `/chat/<id>`, which is not a route and lands on Home.

## Purpose

The coach arrives from one client with a question already formed, reads the last few messages, writes one, and leaves. The screen says unmistakably WHO this is and lets a sentence be sent without ceremony. Plain text only, polled every 5 s — not realtime.

**The ONE primary action: send the message** (round paper-plane button; accessible name `chat.send` = "Küldés").

## Elements

### MUST

| Element · status | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|
| Back link · live | Left arrow + label. Goes to `/coach` (the roster), NOT to the client detail | `coaching.title` = "Klienseim" | — |
| Block control · live | Top right, on the back link's baseline, ban glyph + label. One tap blocks at once: no confirmation, no toast. Absent while loading and once blocked | `chat.block` = "Letiltás" | — |
| Identity anchor · live | Monogram (two letters) and under it the client's name as the screen's only heading. Name = display name; fallback = e-mail local part; never the address | no key (computed by `personLabel` / `initialsOf`) | TD · Takács Dániel |
| Thread · live | Oldest at top, newest at the bottom. Client's messages left, the coach's right, each at most 80 % of the column. Body is plain pre-wrapped text; URLs are never links. Latest 50 messages only | list name (screen readers only): `chat.thread` = "Beszélgetés" | see frame 1 |
| Day divider · live | One centred line above the first message of each calendar day (reader's time zone), always the numeric locale date | no key (`toLocaleDateString`) | 2026. 10. 08. |
| Message meta · live | Inside each message, right-aligned: send time, 24 h. On the coach's own messages also the delivery state | `chat.read` = "Olvasva" (with a check glyph) · `chat.delivered` = "Kézbesítve" · time has no key | 12:30 ✓ Olvasva · 14:10 Kézbesítve |
| Composer label · live | Visible label above the field. It is a label, NOT a placeholder (the field has none) | `chat.compose` = "Írj üzenetet" | — |
| Composer field · live | Multi-line text field, one row at rest, hard cap 4000 characters. The old spec calls it "auto-growing"; the build only has a floor (44 pt) and a ceiling (128 pt, about five lines) and no grow logic, so longer text scrolls inside one row | — | empty |
| Send button · live | Round icon button beside the field. Disabled until the draft has non-blank text; busy while a send is in flight | `chat.send` = "Küldés" (accessible name only; no visible label) | disabled |
| Composer footer · live | Hint on the left, live character counter on the right | `chat.composeHint` = "Küldés a repülő ikonnal" · counter is hard-coded `{n} / 4000`, no key | 0 / 4000 |
| Tab bar · live | Coach: 6 tabs, "Edző" lit. Admin: 7 tabs, "Edző" lit | `nav.home` = "Kezdőlap" · `nav.workout` = "Edzés" · `nav.nutritionShort` = "Étkezés" · `nav.progress` = "Haladás" · `nav.coach` = "Edző" · `nav.profile` = "Profil" (admin adds `nav.admin` = "Admin" before Profil) | Edző lit |

### SHOULD

| Element · status | Data shown + action | Exact Hungarian copy | Sample |
|---|---|---|---|
| Pending message · live | The coach's text appears instantly, dimmed (60 %); the time is replaced by the sending label; no delivery state yet | `chat.sending` = "Küldés…" | frame 3 |
| Send-failure line · live | Danger-coloured line above the composer label; the text is put back into the field so a retry is one tap. No retry button, no failed-message variant | `chat.sendFailed` = "Az üzenetet nem sikerült elküldeni. A szöveg megmaradt." | frame 3 |
| Empty thread · live | Mark + title + body in place of the thread; bar, anchor and composer stay | `chat.emptyTitle` = "Még nincs üzenet" · `chat.emptyBody` = "Írj elsőként — a másik fél értesítést kap róla." | frame 2 |
| Blocked bar · live | Replaces the whole composer: one quiet sentence; the unblock action (undo glyph + label) only for the person who blocked | `chat.blocked` = "Ez a beszélgetés le van zárva." · `chat.unblock` = "Feloldás" | — |
| Withdrawn message · live (display only) | The row keeps its place as an italic grey line with no fill. Nobody can withdraw from the UI: the endpoint exists, the control does not | `chat.withdrawn` = "Az üzenetet visszavonták" | — |
| Report · live, pointer / keyboard only | A flag + label inside the client's messages, painted only on hover or keyboard focus, so on a touch phone it is invisible. One tap reports with a fixed reason ("abuse"); no dialog. Then disabled. Gap in the build: the unpainted control still takes taps, so a touch on that corner of a client's message files a report unseen | `chat.report` = "Jelentés" → `chat.reported` = "Jelentve" | not drawn at rest |
| Unavailable · live | One plain sentence instead of anchor, thread and composer | `chat.unavailable` = "Ez a beszélgetés már nem elérhető." | — |
| Context chips (team, "Heti terv" jump) · planned | In the old screen spec only. No code, no i18n keys | none | do not draw |
| Long-press report menu · planned | Spec only | none | do not draw |
| Presence dot, "Utoljára aktív" line · cut | The API has no last-seen data; the code deliberately draws neither | none | do not draw |

## States

- **Route loading** (conversation list in flight, or the thread being opened for the first time): bar with the back link only; skeleton = a circle where the monogram goes, a name bar, two message blocks (one left, one right, each 2/3 of the column). No copy.
- **Thread loading** (conversation known, messages in flight): monogram + name already painted, two skeleton message blocks, composer already usable.
- **Default**: thread + composer (frame 1).
- **Empty**: `chat.emptyTitle` / `chat.emptyBody` in place of the thread (frame 2).
- **Draft typed**: send button enabled (the screen's one lit shape); counter counts up; at 4000 the field stops accepting input.
- **Sending**: field clears at once, dimmed pending message with "Küldés…", send button busy.
- **Send failed**: `chat.sendFailed` above the label, text restored. The pending message stays on screen until the next successful poll (frame 3). One sentence for every cause: the request was lost (server unreachable, or the app came back from the background without a connection), a block placed from the other side in the meantime, or the rate limit (120 messages / 15 min). The line stays until the next send attempt.
- **Delivered / read**: own message with no read stamp = "Kézbesítve"; with a read stamp = check + "Olvasva". The client's messages carry the time only.
- **Withdrawn**: `chat.withdrawn` in the message's slot, left or right by sender.
- **Reported**: per message, "Jelentve", disabled; local to the visit (resets on reload).
- **Blocked by me**: no "Letiltás" in the bar; composer replaced by `chat.blocked` + `chat.unblock`; the thread stays readable.
- **Blocked by the client**: same bar with the sentence only, no action. (The member has no chat screen today, so this state can only come through the API.)
- **Unavailable** (link archived, client left, or a bad id): back link + `chat.unavailable`.
- **Load failure**: no state of its own (gap in the build). When the conversation lookup fails for a network reason the page shows the same `chat.unavailable` sentence; when the first load of the thread fails the thread shows the EMPTY state ("Még nincs üzenet"). No error copy and no retry control exist for either.
- **Offline**: shell strip at the very top of the screen, `offline.title` = "Nincs internetkapcsolat", one line (the strip's second line, `offline.queued` = "{{count}} művelet vár feltöltésre", counts workout set checks only). The composer is never disabled. What a send does then depends on how the connection went (read from the code and the data library's defaults, not run): if it dropped while the screen was open, the send is HELD — the dimmed "Küldés…" message and a busy send button stay, with no failure line, until the connection returns, and then the message goes out by itself (held in memory only: closing the app loses it, and no copy says "waiting"); if the request is actually attempted and lost, it lands in "Send failed".
- **Role variants**: coach = 6-tab bar, admin = 7-tab bar; content identical. The page has no role gate of its own and a member has no door to it.
- **Device variants**: with a hardware keyboard Enter sends and Shift+Enter breaks the line. The code's own comment says a phone's return key inserts a line break instead; that was not checked on a device (a browser that reports the on-screen return key as Enter would send). Either way the send button must always be there.
- **Hidden tab / locked phone**: polling pauses (messages 5 s, conversation list 30 s); the client's messages are marked read only while the screen is visible.
- **Sheets, dialogs, toasts**: none on this screen.

## Frames to draw

Sample thread = the demo seed's thread for the member account (`seed-demo.mjs`, THREADS → `member`), verbatim, with one substitution: the seed greets the coach as "Bence", the shared sample set names him Kovács Péter, so the first line reads "Szia Péter!". Seed ages are 12, 12, 11, 3 and 1 days before the reference moment (Friday 9 October 2026); clock times are illustrative (the seed randomises them). Signed-in coach: Kovács Péter. "Mine" = right side.

Honesty note: the two-sided thread is the seed's and the API's shape, and this screen renders it. But a member has no chat screen yet (see "Do not invent"), so in the product as built a client can neither answer nor open the thread: outside the demo data a real thread holds only the coach's messages, every one "Kézbesítve". The frames draw the two-sided thread because the member side is planned and the data already carries it.

| # | Day divider | Side | Body | Meta |
|---|---|---|---|---|
| 1 | 2026. 09. 27. | client, left | Szia Péter! Feltöltöttem a heti edzésnaplót, a guggolás jól ment. | 10:42 |
| 2 | (same day) | coach, right | Szia! Láttam, szép munka. A harmadik szettnél viszont picit előrébb dőlsz, figyelj a törzsfeszítésre. | 13:05 · ✓ Olvasva |
| 3 | 2026. 09. 28. | client, left | Rendben, jövő héten videót is küldök róla. | 11:16 |
| 4 | 2026. 10. 06. | coach, right | Tökéletes. A pénteki napon nyugodtan emelj 2,5 kg-ot a húzáson. | 12:30 · ✓ Olvasva |
| 5 | 2026. 10. 08. | coach, right | Ja és a hétvégi edzést tedd át szombat délelőttre, ha tudod. | 14:10 · Kézbesítve |

Messages 4 and 5 tie into the shared story: Friday's session is "Felsőtest – húzás", Saturday's "Alsótest – volumen" is at 10:00.

### Frame 1 — "Csevegés · beszélgetés" (default; what a returning coach sees)

1. Status bar 9:41.
2. Bar: left "← Klienseim"; right ban glyph + "Letiltás".
3. Anchor: monogram "TD"; name "Takács Dániel".
4. Thread, top to bottom: rows 3, 4, 5 of the table with their dividers ("2026. 09. 28.", "2026. 10. 06.", "2026. 10. 08."). Add rows 1–2 above only if they fit; when space is short, drop from the top, never the newest.
5. Composer: label "Írj üzenetet"; empty field; send button disabled; footer "Küldés a repülő ikonnal" left, "0 / 4000" right.
6. Tab bar, 6 cells: Kezdőlap · Edzés · Étkezés · Haladás · **Edző** (lit) · Profil.

### Frame 2 — "Csevegés · üres" (first message to a new client, draft typed)

1. Status bar; bar "← Klienseim" · "Letiltás".
2. Anchor: monogram "KA"; name "Kiss Anna".
3. Empty state: mark; title "Még nincs üzenet"; body "Írj elsőként — a másik fél értesítést kap róla."
4. Composer: label "Írj üzenetet"; field holds the draft "Szia Anna! Üdv a csapatban, hétfőn kezdünk." (illustrative user text); send button ENABLED; footer "Küldés a repülő ikonnal" · "43 / 4000".
5. Tab bar, Edző lit.

### Frame 3 — "Csevegés · küldés sikertelen" (a send attempted without a connection and lost; pending + error)

1. Offline strip at the very top of the screen, pushing everything below it down: "Nincs internetkapcsolat" (one line, no second line).
2. Bar "← Klienseim" · "Letiltás". Anchor "TD" · "Takács Dániel".
3. Thread: rows 4 and 5 with their dividers, then divider "2026. 10. 09." and the pending message, right side, dimmed: "Holnap 10:00, Alsótest – volumen. Hajrá!" (illustrative user text) with meta "Küldés…" (no time, no "Kézbesítve").
4. Composer: danger line "Az üzenetet nem sikerült elküldeni. A szöveg megmaradt."; label "Írj üzenetet"; field holds the restored text "Holnap 10:00, Alsótest – volumen. Hajrá!"; send button enabled; footer "Küldés a repülő ikonnal" · "40 / 4000".
5. Tab bar, Edző lit.

Frame 3 is the attempted-and-lost branch. Its sibling for the state board, not a fourth frame — **held while offline** (the connection dropped with the screen open): the same strip and the same dimmed "Küldés…" message, but NO danger line, the field empty and the send button busy.

Not a frame, one line for the state board — **blocked by me**: bar with "← Klienseim" only; anchor; thread unchanged; in the composer's place "Ez a beszélgetés le van zárva." left and undo glyph + "Feloldás" right.

## Images

- **The person is a monogram.** No member or coach has a profile photo anywhere in the product. The anchor can reuse the approved Profile monogram treatment (the textured condensed letters, asset `monogram-light`) at a smaller scale: "TD", "KA".
- **Empty state**: the old build draws a line speech-bubble glyph in a tinted disc. A single graphite render from the Pulse image family glowing out of the dark could replace it; it must stay one calm object and contain no lime.
- **Nothing else needs imagery.** A conversation is text; the calm of the screen is the feature.
- **Must NOT be shown as if it existed**: profile photos or avatars of real faces; photo, video, voice or file attachments in the thread; a camera, microphone, plus or attach control; link previews; stickers, GIFs, reaction emoji under messages; a coach photo in the bar.

## Do not invent

- **Inbox / conversation list, "Üzenetek" tab, unread badges** on the roster row, on the client's "Üzenetek" chip or on the Edző tab. The coach reaches each thread only through its client; no count is shown anywhere on the way.
- **Member-side chat screen** — planned, no route.
- **Presence**: online dot, "Utoljára aktív", typing indicator, "seen at 14:02". Read state is the single word "Olvasva".
- **Realtime delivery, push notifications.** Polling only; notifications are in-app.
- **Attachments of any kind** (the message record has unused attachment fields; video form-check is backend only).
- **Tappable links, link previews, formatting** (bold, lists, markdown), mentions.
- **Reactions, replies / quotes, edit, delete or withdraw control, copy / forward menu, pin, search in the thread.**
- **Quick replies, saved templates, AI suggestions, voice dictation button.**
- **Relative day labels** ("Ma", "Tegnap") — the divider is always the numeric date; relative labels would need new keys.
- **"Load earlier messages"** or infinite scroll — the server pages, the screen shows only the latest 50.
- **Block confirmation dialog, block reason, success toast; report reason picker or report dialog.** Block and report are single taps today.
- **Per-message failed badge with "Újraküldés"** — failure is one line above the composer. Likewise no "waiting for connection" / "queued" label on a held message, and no message count in the offline strip.
- **Header actions**: call, video call, info, open-client-profile button, the notification bell (the bell lives only on Home and on the coach dashboard). The spec's two context chips are not built.
- **Group chat, team broadcast, scheduled messages.**

## Notes for the designer

- **Open Field vs message bubbles.** The build tells the two voices apart with filled, bordered bubbles — boxes, which V1 forbids. Carry the two voices with alignment (left / right, 80 % max width), ink level and space; the only filled shape on the screen stays the send control. If filled bubbles turn out to be unavoidable, that is an exception for the owner to approve, not a default.
- **The primary action is an icon, and the hint depends on it.** `chat.composeHint` says "Küldés a repülő ikonnal" ("send with the plane icon"): if that line is shown, the send control must carry a paper-plane glyph. A lime pill labelled "Küldés" (the key exists) would make the hint false.
- **Lime dot ≠ presence.** The approved Profile lock-up ends in a lime full stop ("TD."). Next to a chat partner's monogram a lime dot reads as "online", which the product cannot know. Use the monogram without the dot here.
- **Six tabs.** The approved kit has five tab icons (home, training, nutrition, progress, profile). The two staff icons have since been rendered in the same family by the asset run — a whistle for "Edző" and a shield for "Admin": `assets/pulse/app/tab2-coach.png` / `tab2-coach-active.png` and `tab2-admin.png` / `tab2-admin-active.png` (on disk when this file was checked, not yet listed in `assets/pulse/manifest-app.json`; take their image hashes from the manifest once it lists them). Do not generate them again. Cell arithmetic is in the review brief, section 9.2 (coach: side inset 12, cell 63 pt at 402).
- **Where the composer sits (as built, read from the code, not run).** The page scrolls as a whole and the composer is in flow after the last message, not docked; a long thread therefore opens on the anchor and the oldest loaded message, with the composer below the fold. The intent in the spec and in the code comments is "newest message in view, composer above the nav". Draw the intent (composer docked above the tab bar, thread ending at it) and list it as an implementation change.
- **"Letiltás" fires on one tap** with no confirmation and no feedback beyond the composer changing. Keep it in the far corner, visually quiet, well away from send. A confirm step would be a new feature: propose it separately if wanted.
- **Report has no touch affordance.** On a phone "Jelentés" is never painted at rest and cannot be called up on purpose (the hover style is off on touch screens), yet the unpainted control still reacts to a tap: an accidental-report risk to fix in the build, not something to draw. Do not draw it on resting messages; if a long-press menu is drawn, label it as a proposal.
- **Failure is quiet by construction.** No failed-message style exists: the same text sits in the dimmed pending message AND in the field. Do not add a red message variant as if it existed.
- **Heading values.** A client who never set a name is shown by e-mail local part: "takacs.daniel" (lowercase, dotted, no spaces; monogram still "TD"). Names can be up to 120 characters. The heading must survive a long unbroken string (truncate or wrap).
- **Long strings.** `chat.sendFailed` is 55 characters: at caption size it is about as wide as the 354 pt column, so allow for two lines. `chat.emptyBody` (47 characters, with an em dash) needs two centred lines at body size. Both line counts are estimates, not measured in the Pulse faces. Messages run to 4000 characters, keep the sender's own line breaks, and may contain emoji (the seed has "🎉").
- **Formats.** Time "14:10" (24 h). Divider "2026. 10. 08." (Hungarian numeric date with trailing dot). Counter "43 / 4000" with spaces around the slash. Times, dates and the counter are the natural home of the mono meta role used for "18:00 · 5 gyakorlat" on the approved Home.
- **No title, no eyebrow.** Nothing on this screen says "Üzenetek" or "Csevegés"; do not add a section title that needs a new key.
- **Semantic colours** (review brief 3.1): the read check is `success`, the failure line is `danger`, the offline strip is the shared strip component used on every screen; the accent stays for the send control alone. No state is carried by colour only: "Olvasva" and "Kézbesítve" are words.
