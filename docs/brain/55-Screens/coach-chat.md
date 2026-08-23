---
type: screen-spec
title: Üzenetek — coach and client conversation
route: /coach/clients/:id/chat
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Üzenetek — coach and client conversation

The one screen where a coach and a client talk in their own words. The coach arrives from `Klienseim` with a question already formed — *did the knee hold up?* — and leaves the moment it is answered, so the screen has exactly two jobs: say unmistakably **who** this is, and let a sentence be sent without ceremony.

## Anchor

A large circular monogram (`KA`) inside a thick status ring, centred in the top third, with the client's display name in the biggest type on the screen beneath it and `Utoljára aktív: 14:02` under that.

A conversation is not a countable goal and not a trend, so neither a progress ring nor a chart earns the top third. It is a **person**, and the anchor is that person: the monogram is identity, the ring is presence, the small badge riding the ring is the live/away dot. There is no separate `h1` — the name *is* the heading. Today's screen puts the client's **email address** in display type at the top; an account identifier is not a human being, and replacing it with a face and a name is most of what this redesign does.

> [!important]
> `Utoljára aktív` and the presence badge have nothing behind them. The messages API answers `read_at` and says nothing about presence. Either the endpoint grows a last-seen stamp or both the line and the badge come out. An invented "active now" is a lie the product cannot walk back.

## Blocks

- **Top bar** — back link `Klienseim` returning to the coach dashboard (not to the client detail screen), and a right-aligned ghost chip `Letiltás` with a block icon. Blocking is rare and semi-irreversible, so it sits in a corner rather than under the composer where a thumb rests.
- **Identity block** — the anchor: monogram ring, presence badge, display name, last-active caption.
- **Context chip row** — exactly two chips: `Hétfői csoport` (the team the coach–client link belongs to) and `Heti terv` (jumps to the client's plan). This is the only surviving trace of the four-tab strip, and it is deliberately the two things a coach reaches for *mid-sentence*.
- **Day divider** — one centred grey line above the first message of each day, formatted in the app's locale date format (`2026. 08. 22.`), not the raw ISO string the panel emits today.
- **Thread** — the message list, pinned to its own bottom so the newest message is always in view; history is reached by scrolling up. Bubbles stop well short of the full column width. The client's sit left on a plain raised surface, the coach's right on an accent-tinted fill. Body text is pre-wrapped and **never auto-linked** — a live URL from someone you have not met is an exfiltration surface, which is why a report flow exists at all.
- **Bubble meta** — send time in tabular numerals, then `Olvasva` with a check once the other side has read it, or `Kézbesítve` while it is only delivered. A pending bubble replaces the time with `Küldés…` and renders at reduced opacity.
- **Composer** — the label `Írj üzenetet` above a one-line auto-growing textarea on a raised surface, with a round accent-filled paper-plane button beside it, disabled until there is text.
- **Composer footer** — `Küldés a repülő ikonnal` on the left, a live counter `41 / 4000` on the right.
- **Bottom nav.**

> [!warning]
> The two mockups disagree in one place: dark puts the meta line **inside** the bubble, light puts it **under** it. Take the dark one — an outside line doubles the vertical rhythm of the thread and breaks the reversed-column trick that pins it to the bottom for free.

## What was merged away, and why

- **The four-tab strip** `Terv` / `Táplálkozás` / `Haladás` / `Üzenetek` and the wrapped email `h1` are gone; the chat is promoted from a tab into its own route. A chat panel squeezed under a tablist under a heading under a questionnaire panel gets a fraction of the viewport, and a thread capped at a fraction of the screen is why the previous design read as a data field with messages in it. What that bought: the whole column. The cost is one extra route, and the two chips carry the only cross-tab jumps that mattered.
- **The bordered scrolling box** with its own scrollbar and clipped top bubble is gone. The page scrolls; the thread does not scroll inside a box inside a page.
- **Report chips on every bubble** — removed. Nine bubbles each carrying a persistent `Jelentés` chip made every message look like evidence. Reporting moves to a long-press / context action on the other person's bubbles, keeping `Jelentés` → `Jelentve` verbatim.
- **`Letiltás` moved** from a ghost chip under the composer to the top bar. Under the composer it was one mis-tap from the send button.
- **The offline banner, the failed-send bubble with its inline error line, the retracted-message caption, and the pasted-link message** were all cut from the mockup — as *illustrations*, not as behaviours. Every one is still specified under States.
- Nine bubbles became four, with one date divider, so the anchor and the composer both fit without scrolling.

## States

- **Empty** — centred `EmptyState`, speech-bubble icon in an accent-tint circle: `Még nincs üzenet` / `Írj elsőként — a másik fél értesítést kap róla.` The anchor and the context chips stay; the thread area holds the empty state.
- **Loading** — two skeleton bubbles, one left, one right, at the same width the real ones use. The anchor renders immediately from data the client-detail query already holds.
- **Send failure** — a red caption above the composer, `Az üzenetet nem sikerült elküldeni. A szöveg megmaradt.`, and the text goes back into the box so a retry is one tap. **The optimistic bubble stays put.** A failed message that vanishes reads as a sent one, and the coach walks away believing the client was told something.
- **Withdrawn** — the row keeps its slot as a bare italic grey `Az üzenetet visszavonták` with no bubble fill. Erasing the row would make the thread lie about what happened.
- **Blocked** — composer and `Letiltás` chip are replaced by a quiet bar reading `Ez a beszélgetés le van zárva.`; only the person who blocked sees the `Feloldás` chip beside it.
- **Unavailable** — the link was archived or the client left: one plain sentence, `Ez a beszélgetés már nem elérhető.`, in place of the thread and composer.
- **Offline** — the shell's offline indicator; the send button stays enabled and the send fails into the failure state above, because a disabled composer offline is indistinguishable from a broken one.
- **Role-gated** — the client side reaches the same panel from Home with one conversation and no `Klienseim` back link; the coach side is the only one with the context chips.
- **Read receipts** — the thread marks itself read only when it holds unread messages **and** the tab is actually visible. A backgrounded tab polling must never clear the badge for someone who is not looking.

## Components

Reuses `ChatPanel` (`features/chat/ChatPanel.tsx` — the reversed-column thread, the optimistic send, the visibility-gated read mark all survive intact), `ChatTab`'s lazy idempotent conversation open, `Pressable` in its chip and icon shapes, `EmptyState`, `Skeleton`, `BottomNav`, the `control` recipe for the textarea's focus ring, and `ToastHost` for the block/unblock confirmations.

Genuinely new: the **monogram avatar ring with presence badge** (nothing in `ui/` draws an avatar today — the only circular geometry is `RestTimer` and the E16 progress ring, neither of which fits), the **context chip row**, and the **composer footer counter**. `Kézbesítve` is new copy but not new data: sent with no `read_at` is delivered, with `read_at` is `Olvasva`.

## Navigation

Bottom bar present, `EDZŐ` active. Coach role: 6 tabs (`KEZDŐ`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `PROFIL`). The notification bell stays in the Home and coach-dashboard headers and is not duplicated here — an inbox badge above an open conversation is noise.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/12-coach-chat.webp]]
![[_mockups/vilagos/12-coach-chat.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[50-UX-Concepts/Messaging and Notifications]] · [[00-Index/TODO Master]]
