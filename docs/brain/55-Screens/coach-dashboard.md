---
type: screen-spec
title: Klienseim — Coach dashboard
route: /coach
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Klienseim — Coach dashboard

The coach's home base: the one screen that answers "who are my people, and which of them stopped training" before anything is tapped, and from which access is handed out — a join code, a pre-made account — or taken back.

## Anchor

A donut with the client total in its centre (`12` over the caption `KLIENSEK`), its ring split into one segment per team, with a three-item legend beneath: `Hétfői csoport 6` · `Szerdai csoport 4` · `Csapat nélkül 2`.

A ring, because a roster is a countable population and the number is the first thing the coach wants. The segmentation is what earns it over a plain number: the old screen printed the team split as grey sub-headings inside the roster, so it could only be read by scrolling the whole list. Here the same fact is one glance, and it frees the list below to be flat.

## Blocks

1. **Header** — accent eyebrow `EDZŐI FELÜLET` over the h1 `Klienseim`; on the right the notification bell with its unread badge. The bell rides this screen's own heading, not a global app bar — see [[Messaging and Notifications]] for why it is not a tab.
2. **Anchor donut** — total, caption, legend. The legend is the roster's team key.
3. **Two summary tiles**, side by side: a ticket tile `CSAPATOK` `3` and a key tile `ÉLŐ KÓDOK` `2`. Both numbers count up on mount. `CSAPATOK` is pressable and opens the teams sheet.
4. **Handover banner** (only when at least one account is pending) — alert-toned card, triangle icon, headline `2 fiók átadásra vár`, and a short body line. The long sentence `Ezeknek a fiókoknak még te ismered a jelszavát, ezért a kliens addig nem tud belépni az appba, amíg sajátot nem állít be.` is cut to its consequence: `Amíg nem állítanak be saját jelszót, nem tudnak belépni`.
5. **Section `Csatlakozási kódok`** — an icon tile, the heading, and the one primary on the screen: the `+ Új kód` pill. Under it, one row per live code: `8 / 20 felhasználva` on the left, a ghost `Visszavonás` on the right. A ghost `Előre létrehozott fiókok` button closes the section and opens the pre-gen sheet.
6. **Section `Névsor`** — icon tile, heading, and the roster total right-aligned. Then a flat list of client rows: monogram avatar (`AN`), the client's **name** (was the e-mail until [[0017-a-person-has-a-name]]; a roster of forty rows was a roster of forty deliverable addresses), and a meta line `6 edzés / 28 nap` that switches to the alert tone at zero, plus the mini chip `ÁTADÁSRA VÁR` where it applies. An archive icon button closes each row. The whole text column is the link to `/coach/clients/:linkId`.
7. **Bottom nav.**

## What was merged away, and why

- **The three-card stat row became one donut plus two tiles.** `Kliensek` was the only stat worth a display number; it moved into the ring. Teams and codes are pure inventory and now sit in half-height tiles.
- **The team sub-headings are gone from the roster.** Their information moved into the donut legend, which reports the same split without spending a heading per team on a list the coach scrolls daily. The list is flat and every row now looks the same, which is what makes a zero-session row visible.
- **Two forms left the scroll.** `Csapat neve` + `Létrehozás` moved into a sheet behind the `CSAPATOK` tile; `E-mail címek` + `Fiókok létrehozása` (with its hint `Vesszővel vagy szóközzel elválasztva.` and the once-only temp-password panel) moved into a sheet behind the ghost `Előre létrehozott fiókok` button. They are setup acts done a handful of times; they were costing the daily screen two labelled fields, two buttons and two explanatory paragraphs.
- **The code explainer paragraph was cut** (`A kód titkosított formában tárolódik — a nyílt szöveget egyszer látod, létrehozáskor. Utána már nem előhívható.`). It is not lost: the same fact is stated at the moment it matters, inside the `A kód elkészült` sheet — `Másold ki most. Ez az egyetlen alkalom, amikor látod — a szerver csak a hashét tárolja.`
- **What that bought:** the roster now starts within the first screenful instead of below four sections of forms. The previous version failed because everything on it was a field; here the only field on the page is behind a sheet.

> [!warning] Temp passwords in a sheet
> The pre-gen sheet renders passwords that exist nowhere else — `Az ideiglenes jelszavakat most írd fel — nincsenek nyílt szövegben tárolva.` A sheet that closes on scrim tap and Escape will destroy them on a mis-tap. While that panel is on screen the sheet must close only through its own explicit dismiss, and that dismiss must say what is being thrown away.

> [!important] The donut is not a chart of everything
> Segments are teams, and one legend row per team. A coach with many teams overflows it. Cap the legend at the largest few and fold the tail into `Csapat nélkül`'s neighbour as a single "other" segment; do not shrink the labels.

## States

- **Loading** — a circle skeleton where the donut goes, two tile skeletons, one roster skeleton. Same geometry as the real thing, so nothing shifts.
- **Empty (no clients)** — the donut is suppressed entirely; an empty state carries `Még nincs kliensed` / `Adj ki egy csatlakozási kódot, vagy hozz létre fiókokat nekik.` The `+ Új kód` pill stays visible above it. A ring drawn at zero is a decoration pretending to be data.
- **No live codes** — the code section keeps its heading and pill, the row list simply does not render.
- **Error** — the roster query failing shows the generic list error; the screen shell, header and tiles still render from whatever resolved.
- **Offline** — the shell's offline indicator; `Új kód`, `Visszavonás`, `Archiválás` and both sheet forms are disabled, because there is no queued-write store yet ([[UX Base Pack]]).
- **Role-gated** — a non-coach reaching `/coach` gets the whole page replaced by `Ez a felület edzőknek szól` / `Ha edzőként szeretnél belépni, kérj meghívót.` The route is a convenience; the server enforces the role regardless.
- **Busy** — every mutation button shows its busy state in place; the archive confirmation sheet keeps `Archiválás` / `Mégse`.

## Components

Reuses `Pressable` (primary pill, ghost row buttons, icon button for archive), `CountUp` on all three numbers, `Sheet` for the minted code, the archive confirmation, the teams form and the pre-gen form, `Field` inside those sheets, `CopyButton` (E2) for the code and for each `email / password` pair, `EmptyState`, `Skeleton`, `NotificationBell`, `BottomNav`, and the `control` recipe for the row surfaces.

Genuinely new: the segmented ring (the shipped `Progress` E16-D ring is single-value and cannot express a split), the icon-tile section header with a trailing count, and the monogram avatar — was an inline `email.slice(0, 2)` on three screens, which rendered `DE` for every demo client. Now one component fed by `personInitials` ([[0017-a-person-has-a-name]]); the same function had **six** copies across the app before that.

## Navigation

Bottom bar with `EDZŐ` active. Coach role: 6 tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `PROFIL`.

> [!warning] The bar has to grow before this ships
> `BottomNav` clamps with `tabs.slice(0, 5)` and the shipped coach set is a different five (`Kezdőlap, Gyakorlatok, Beállítások, Edző, Tervek`). Two changes are required: raise the clamp to the coach's six, and drop the separate `Tervek` tab — in this design the plan library is reached through `EDZŐ`, not from the bar. Leaving the clamp at five silently deletes `PROFIL`, which is exactly how `/admin` lost its tab once already.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/06-coach-dashboard.webp]]
![[_mockups/vilagos/06-coach-dashboard.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[50-UX-Concepts/Messaging and Notifications]] · [[00-Index/TODO Master]]
