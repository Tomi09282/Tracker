---
type: screen-spec
title: Áttekintés — Admin overview
route: /admin
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Áttekintés — Admin overview

The admin's landing screen. An admin opens it for one of two reasons — to see whether the platform is healthy, or to clear the queues — and the redesign answers the first in the top third so the rest of the screen can be the second. Everything on it is enforced again on the server; the page is convenience, never permission.

## Anchor

A large donut, nearly the column's width, its ring broken into three separated arcs, with the total `1 248` and the caption `Felhasználó` in the hole and a three-item legend beneath: `Tagok 1 147`, `Edzők 37`, `Új 64`. A donut and not a chart, because the headline admin number is a **composition of a countable population**, not a trend — how the user base splits is the question, and four stacked stat cards answered it as four unrelated facts. The total counts up like an odometer; the arcs draw in behind it.

> [!important]
> The three arcs claim to partition the total, and the current `/admin/stats` payload cannot honour that. It returns `users.total`, `users.coaches` and `users.new_7d` — and a coach who registered this week is in both `coaches` and `new_7d`. Making the numbers add up by computing `Tagok = total − coaches − új` silently redefines `Edzők` as "coaches who did not join this week", which is not what the legend says. Either the server returns three disjoint buckets, or the third arc stops being `Új` and becomes something that genuinely partitions.

## Blocks

1. **Eyebrow + title row** — `ADMINISZTRÁCIÓ` in uppercase accent above the h1 `Áttekintés`; on the right, a palette glyph and the accent link `Stílus stúdió`. It is a real anchor to `/admin/styles`, not a button that navigates — the studio is a page, and a page you can middle-click is a page.
2. **Donut card** — the anchor, in its own card: ring, centre total, caption, legend row with a colour dot per arc.
3. **Two summary tiles** — side by side under the donut: an icon tile plus `862` / `Gyakorlat`, and `391` / `Médiafájl`. Odometer numbers, singular unit caption under each.
4. **Section pills** — a horizontally scrolling row of three: `Fiókok`, `Moderáció` with its count badge `7`, `Piactér`. The active pill takes a card fill and an accent border; the rest are ghost. A tablist, not a nav — it swaps a panel in place. Only the open section renders, and therefore only the open section fetches.
5. **Panel header** — an icon tile, the h2 `Moderációs sor` with `7 várakozik` on the line below it, and a refresh icon button right-aligned.
6. **Queue rows** — full-width rounded list buttons, each with the exercise name, the owner's address, a media line (`3 média` with a film glyph, or an image-off glyph with `Nincs feltöltött média`), and a relative timestamp on the right. The selected row gets an accent border, an accent-subtle wash and an accent bar down its leading edge — and only the selected row carries the decision controls: a primary `Jóváhagyás` with a check and a ghost `Elutasítás` with an X. The list runs off the bottom edge; there is no pagination control in view.
7. **Bottom nav** — fixed, `ADMIN` active.

The footer line `142 aktív munkamenet · 3 908 naplóesemény az elmúlt 24 órában` is below the fold; keep it, it is the cheapest liveness signal on the screen.

## What was merged away, and why

**Four stat cards became one donut plus two tiles.** `FELHASZNÁLÓK`, `GYAKORLATOK`, `FORDÍTÁSOK`, `MÉDIAFÁJLOK` were four identical cards in a grid, each a label, a number and a sub-line — the exact "the whole UI is data fields" the previous design was rejected for. Users got the donut because its split is the one number an admin reads more than once. `FORDÍTÁSOK` was cut outright: translation row counts change when someone runs an import, which is not a thing an admin monitors, and it belongs on the accounts/content side.

**The `Áttekintés` pill is gone; four sections became three.** The overview panel it opened held four more stat cards and four trend charts. Those charts are a metrics view, not a landing screen: an admin arriving to clear a queue scrolled past all of it. The donut and the two tiles *are* the overview now, and `AdminMetrics` moves behind its own entry rather than being the default panel.

**`Moderáció` is the default open section**, because the badge is the only element on the screen that means "someone is waiting".

**The whole review panel was pulled out of the phone layout** — media strip, `VÉGREHAJTÁS`, the amber `Nincs megadva végrehajtási leírás`, `IZOMCSOPORT` and `ESZKÖZ` chip rows — and only its two decision controls kept, inside the selected row. That is what bought the queue its three visible rows.

> [!warning]
> That last cut reintroduces, exactly, the defect `ModerationQueue.tsx` was rewritten to remove. Its header comment is explicit: approving publishes a movement into the shared library for every user, and the decision controls live in the panel **so that deciding without loading the submission is impossible** — the buttons do not exist until the panel is open, and the panel is what fetches the instructions, the muscles and the media. A row showing a name, an address and `3 média` is precisely what the old table showed.
>
> The resolution that keeps both the picture and the invariant: **selecting a row expands it in place into the full review** — media, instructions, muscle and equipment chips, the missing-description warning — with `Jóváhagyás` and `Elutasítás` at the bottom of that expansion. What the mockup shows is the top of that expansion with the rest below the fold. Do not implement a collapsed row that can approve. Above the wide breakpoint the two-pane queue/panel split stays as it is.

## States

- **Loading** — `Skeleton` blocks: one at donut proportions, two at tile proportions, one tall block for the open panel. The pill row renders immediately; the `Moderáció` badge is absent until the count is known, never a grey zero.
- **Empty queue** — `EmptyState` with a check glyph: `Nincs mit moderálni` / `Minden beküldött gyakorlatot elbíráltál.`
- **Nothing selected** — `Válassz egy beküldést` / `A jóváhagyás megosztja a gyakorlatot a teljes könyvtárban, ezért előbb nyisd meg és nézd át.`
- **Stale submission** — someone else decided it while the queue was on screen, which is a 404: `Ez a beküldés már nincs a sorban` / `Időközben valaki döntött róla. Frissítsd a listát.` The new refresh button is the recovery.
- **Rejecting** — the decision controls swap for the `Indoklás` field (hint `A beküldő elolvassa, a saját gyakorlatánál jelenik meg.`), a danger `Elutasítás` inert until the reason has text, and a ghost `Mégse`.
- **Deciding** — busy on the acting button; on success the row leaves the queue, the selection clears, and the admin and exercise caches are invalidated together.
- **Offline** — the shell indicator; the queue keeps its last data and decisions fail into the generic error.
- **Role-gated** — a non-admin gets the whole page replaced by one centred `EmptyState` with a shield: `Nincs jogosultságod` / `Ez az oldal csak adminisztrátoroknak érhető el.` It renders as the page `h1`, because for that visitor it *is* the page.

## Components

Reused: `CountUp` for every headline number, `Pressable` (queue rows use `shape="field"`, pills use compact ghost/secondary, decisions use primary/ghost/danger), `Field` for `Indoklás`, `EmptyState`, `Skeleton`, `AdminShell`'s tablist and lazy `render`, `ModerationQueue`, `MarketplaceQueue`, `UserSearch` with `DataTable` behind the `Fiókok` pill.

Genuinely new:
- **Segmented donut** — nothing in `src/ui/` draws one. The only arcs in the codebase are single-value rings inside `RestTimer` and the E16 progress variants. This needs a real component: multi-segment, gapped, with a centre slot and a legend, accessible as a figure with a text alternative rather than as a bare `<svg>`.
- **Summary tile** — icon tile beside a number and a singular caption. A narrower thing than today's `StatCard`, which carries a label above and a sub-line below.
- **Queue refresh control** — an explicit refetch of `['admin', 'moderation']`. Today the queue only refreshes as a side effect of a decision, which leaves the stale-submission state with no way out.

> [!important]
> The donut caption `Felhasználó` and the tile captions `Gyakorlat` / `Médiafájl` are **singular**. The existing keys (`admin.users`, `admin.exercises`, `admin.media`) are plural table labels. New keys, plus `Tagok` and `Új` for the legend — do not overload the old ones, they still appear as-is inside the panels.

## Navigation

Bottom bar, `ADMIN` active — the accent-subtle pill behind the shield glyph. **Seven tabs for the admin role**: `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `EDZŐ`, `ADMIN`, `PROFIL`; labels truncate on a phone and the mockup shows them truncated.

> [!warning]
> `BottomNav` clamps with `tabs.slice(0, 5)`, and `AppLayout` deliberately keeps admin out of the bar for exactly that reason — its comment records that pushing admin made six tabs and the sixth silently vanished, so `/admin` became unreachable from the nav. Seven tabs is a change to the bar's contract, not a change to this screen: the clamp has to go, the cell sizing has to survive seven labels at the narrowest width, and the `end` matching for `/` still has to hold. Do not implement the seven-tab bar inside this screen's ticket.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/11-admin-attekintes.webp]]
![[_mockups/vilagos/11-admin-attekintes.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
