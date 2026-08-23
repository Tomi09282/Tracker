---
type: screen-spec
title: Kezdőlap — Home
route: /
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Kezdőlap — Home

The screen a client opens twenty times a day and reads in about two seconds: am I on track this week, and is there a session waiting for me right now. Everything on it is either that answer or a way to act on it — the redesign's whole job was to stop this page from being a scrollable readout of the same database rows the API returns.

## Anchor

A large open-bottom progress ring in the top third, holding a tabular `2` against a faded `/ 5`, captioned `HETI EDZÉS`. A ring, because weekly sessions are a **countable goal with a known denominator** — the exact shape a ring reads well and a chart reads badly. The seven-cell week row lives *inside the same panel*, under the caption, so the ring's number and the evidence behind it are one object rather than two stacked sections. A trend chart was rejected here: five-per-week is a target to hit, not a curve to interpret.

> [!important]
> The ring's denominator comes from the active plan's weekly session count, not from a constant. A client on a three-day plan sees `2 / 3`. If no plan is active there is no denominator and this whole panel is replaced by the empty-state anchor — see [[Screens/01b Home empty]].

## Blocks

1. **Header row** — `Szia!` in the display face, the localised date beneath it with a capitalised first letter (`Szombat, augusztus 22.`), and a bell button at the far right carrying a danger-coloured unread badge (`3`, capped at `99+`). No page title, no breadcrumb: the active nav tab already says where you are.
2. **Week panel (the anchor)** — the ring, the `HETI EDZÉS` caption, and a seven-cell weekday row. Each cell stacks the weekday initial (`H K SZE CS P SZO V`) over **one** status glyph, in strict priority: green check (trained) beats accent dumbbell (scheduled) beats blank. Today's cell takes the accent border and pale accent fill; trained cells take the pale success fill. Cells are display-only — they are evidence, not navigation.
3. **`Mai edzés` section header** — a tinted rounded icon tile holding a play-circle, then the title. The eyebrow is now a *heading with a mark*, not a tiny uppercase label; it earns the weight because it introduces the only actionable region on the page.
4. **Live-session banner** — renders only while a workout is running. Accent-outlined card, `Edzés folyamatban` on the strong line and the session title or `Szabad edzés` truncated beneath it, then a full-width filled accent `Folytatás` button. **This is the one filled button on the screen when it appears.**
5. **Day list** — replaces the banner's button region when no session is running: one card per scheduled occurrence today. Leading glyph (moon = rest, check = trained, dumbbell = to do), the day name in bold, a grey caption combining plan name, a clock glyph with the wall-clock time and the exercise count (`5 napos program · 18:00 · 5 gyakorlat`), and a trailing element that is one of `Pihenőnap` (grey text), `Kész` (success text), or an **outlined** `Indítás` button. Trained cards take the pale success fill.
6. **Nutrition block** — a section header (tinted icon tile, `Táplálkozás`, trailing accent link `Megnyitás ›`) over a wrapping grid of macro tiles. Each tile: a tinted circular glyph, the logged figure large (`1840`, `128 g`, `210 g`), the target small beneath it (`cél 2500`, `cél 160 g`, `cél 250 g`), and a bar across the bottom. Three fit the row; `Zsír` wraps to the next row below the fold. The whole block is absent when nothing is logged and no target exists.
7. **Bottom nav** — fixed, blurred, hairline top border, `Kezdőlap` active.

## What was merged away, and why

The rejected version was a header, a week grid, three schedule cards and a four-row macro table — twenty-six discrete values, every one of them the same size and colour, none of them the answer to "what do I do now".

- **The signed-in e-mail address is gone from the header.** It was rendered on the busiest screen in the product and answered a question nobody asks twenty times a day. It belongs on `Profil`. This also frees the header to be two lines instead of a four-item baseline scramble that truncated the date on narrow phones.
- **Day numbers and the `‹ ›` week pager are gone.** The strip is now *this week*, full stop. Paging existed because the strip was built on a server window endpoint that accepts any `from` date — but a client standing in the gym does not browse to March, and the pager cost two controls, a date-range sub-header and a whole loading state for a journey the history screen already owns properly. Losing the day numbers is what let seven cells fit inside the ring's panel instead of needing their own section.
- **Three workout cards collapsed to one live banner plus a short day list.** Every untrained day used to emit its own filled accent button; three filled primaries is the same as none. Now the accent is spent once — on `Folytatás` if something is running, on the empty state's action if nothing is.
- **The four-row macro table with its bars became three tiles.** A table of `label / value / bar` repeated four times is the purest form of "the whole UI is data fields". Tiles make each macro one object you read at a glance, and dropping the fourth below the fold is honest: `Kalória` is what people check, `Zsír` is what they check afterwards.
- **The page is allowed to continue past the fold now.** The previous layout fought to fit everything above it and compressed everything as a result.

> [!warning]
> The macro tiles must read the same hook and the same totals as the full nutrition screen (`useNutritionDay`, one query key). `NutritionCard` was built specifically so Home and `/nutrition` could never disagree about a number. A tile that does its own arithmetic re-introduces exactly that bug.

## States

- **Empty (no plan day today)** — the day list is replaced by the centred empty panel. Own note: [[Screens/01b Home empty]].
- **Loading** — a skeleton block in the shape of the week panel, and a second in the shape of the day list. Never a spinner: a skeleton says where the content will sit. The ring does not animate in from a fake value; it renders once the count is known.
- **Error** — the week panel and the day list fail independently. A failed week query shows the panel frame with the ring absent and a retry affordance; a failed today query falls back to the empty panel copy, because a client with no answer and a client with no plan need the same next step.
- **Offline** — the strip appears above the header: `Nincs internetkapcsolat` with `3 művelet vár feltöltésre` beneath. `Indítás` stays enabled (a start is queued through the outbox); the nutrition block keeps showing the last cached day rather than blanking.
- **Session already running** — every `Indítás` in the day list is disabled. The server would *resume* rather than replace, so offering "start" would be a lie about what the tap does.
- **Role-gated** — none on this screen. Coach and admin see the same Home; their extra destinations live in the nav.

## Components

Reuses `Pressable` and the `control` recipe (every button, chip and icon button here), `NotificationBell` with its server-capped badge, `EmptyState`, `Skeleton`, `OfflineIndicator`, `BottomNav`, and `NutritionCard`'s data hook.

`WeekStrip` survives but is **reshaped**, not reused as-is: it loses its own section heading, its date range, its pager and its day numbers, and it moves inside the anchor panel. Keep its server-sourced dates — the schedule rule (`starts_on + k*cycle_days + day_index`, plus skip and move exceptions) must not get a second implementation in the browser.

Genuinely new: **`WeeklyRing`** (arc + `CountUp`-backed numerator + caption; `CountUp` already exists and already uses tabular figures, so the ring wraps it rather than counting its own), **`MacroTile`** (the tile that replaces a `MacroBars` row on this screen only — `MacroBars` stays on `/nutrition`), and **`SectionHeader`** (tinted icon tile + title + optional trailing link), used twice here and reusable across the redesign.

## Navigation

Bottom bar, `Kezdőlap` active with the pale accent pill drawn behind its icon. Member: **5 tabs** — `Kezdőlap`, `Edzés`, `Étkezés`, `Haladás`, `Profil`.

> [!warning]
> `BottomNav` clamps with `slice(0, 5)`. The member bar is now exactly full, and coach (6) and admin (7) **cannot** be expressed in this component as written — an admin tab pushed past the clamp is how `/admin` became unreachable once already. Overflow behaviour has to be designed before the coach and admin shells are built; do not solve it by squeezing six labels into five cells.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/01-home.webp]]
![[_mockups/vilagos/01-home.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
