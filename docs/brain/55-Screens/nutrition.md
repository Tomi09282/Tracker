---
type: screen-spec
title: Táplálkozás — Nutrition
route: /nutrition
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Táplálkozás — Nutrition

The client's food day for one calendar date: how far today's eating is from the prescribed macro targets, and the place to add what they just ate. They came here with one question — *am I over or under* — and one task — *log this thing*. Everything else on the screen serves those two.

## Anchor

A calorie ring, nearly the width of the column, holding a flame glyph, the figure `1840`, the denominator `/ 2400 kcal`, and under it the plan day's own name `Edzésnap`.

A ring because calories are the one **countable goal against a fixed quota** on this screen — the shape of an arc sweeping toward a full circle *is* the quantity, read before any digit is. The other three macros are not quotas in the same sense; they are supporting figures, and they get tiles. The ring also carries the day's identity: the plan-day name sits inside it rather than as a card heading above it, so the label is attached to the thing it labels.

> [!important]
> The ring's arc clamps at a full sweep; the number inside never clamps. This is `MacroBars`' existing rule, moved. Someone who ate 3200 against a 2400 target must not see the same picture as someone who ate exactly 2400 — the arc goes full, the figure reads the truth, and both take the warning colour.

## Blocks

1. **Header row** — h1 `Táplálkozás` left; a rounded date control right, calendar glyph plus `2026-08-23`. Tapping opens the OS date picker and reloads the whole day. The date is the *browser's* local calendar day, not the server's.
2. **Calorie ring** (anchor) — flame glyph, `1840`, `/ 2400 kcal`, `Edzésnap`. Falls back to `A mai nap` when the plan day is unnamed.
   - *No-target variant*: the schedule's cycle doesn't land on this date, so there is no denominator to draw. Track only, no arc, `1840 kcal` alone, and the grey line `Erre a napra nincs előírt cél — az étrend ciklusa nem esik ide.` A missing target is a fact about the plan, and an unexplained blank reads as a bug.
3. **Macro tile row** — three tiles across: a steak puck with `128g` over `Fehérje · cél 180g`; a wheat puck with `190g` over `Szénhidrát · cél 250g`; a droplet puck with `84g` over `Zsír · cél 70g`. A thin fill bar runs along each tile's bottom edge.
   - *Over-target tile*: the fat tile — warning-tinted card, warning border, a warning triangle before the figure, warning-filled bar. **Warning, never danger.** Someone 14 g over on fat has had a normal Tuesday, and the tone of a colour is part of what the app says to them.
   - *No-target variant*: the tile shows the amount and the label with no `· cél` clause and no bar.
4. **`Hozzáadás` section** — a rounded badge glyph (`+`) then the h2. Below it a full-width search field: magnifier inset left, grey placeholder `Étel keresése…`, an X clear at the right once there is text.
5. **Result list** — up to eight flat rows while text is typed and nothing is picked. Each: a round food glyph, bold truncated name `Csirkemell, bőr nélkül`, grey caption `165 kcal · 31g P /100g` (brand appended after a middot when present), a `+` pinned right. Tapping selects and clears the list. No match: the single grey line `Nincs találat`.
6. **Picked-item card** — replaces the result list. Left: bold name over a live-recalculating `248 kcal`, recomputed from the food's own per-100g figures as the grams change. Middle: a numeric field pre-filled from the food's serving size (`150`) with a `g` suffix and a validity check mark. Right: the filled primary `Hozzáadás`, busy while saving. On success the card disappears and the ring and tiles grow.
7. **`Naplózva` section** — a notebook badge glyph then the h2. Items are grouped by meal label **in the order they were eaten**, not alphabetically — that is the order the user remembers. Each group carries a tiny uppercase header: `REGGELI`, `EBÉD`, `VACSORA` for items pushed from a coach's diet plan, `EGYÉB` for anything logged here.
8. **Log rows** — one bordered card *per group*, hairline-divided inside. Each row: bold truncated name over a grey tabular caption `80g · 303 kcal`, ghost trash icon-button at the right edge.
9. **Bottom navigation** — fixed, blurred, five tabs.

## What was merged away, and why

- **The four-row macro table is gone.** Four stacked label-plus-number-plus-bar rows is a table, and a table is exactly the "the whole UI is data fields" verdict that killed the previous pass. It became one ring plus three tiles: same four figures, one of them promoted to the thing you read from across the room, three of them differentiated by an icon rather than by their position in a list.
- **The totals-card heading collapsed into the ring.** `A mai nap` / `Edzésnap` was a heading row above a card; it is now the third line inside the ring. One less horizontal rule, and the day's name now sits on the day's number.
- **The protein term left the log row caption.** The code renders `150g · 248 kcal · 46,5g P`; the design of record renders `80g · 303 kcal`. Protein has a tile of its own at the top — repeating it on every row made the same gram figure appear in three places. Grams and kcal are what identify the entry; the totals answer the macro question.
- **The undo toast was cut.** It would have been the only floating layer on the screen, and it would have advertised reversibility for an action that is already instant everywhere else in this product. The feedback for a delete is the ring shrinking.
- **Two of five results and three of six log rows are not in frame.** Deliberate: the list runs past the bottom edge so the mockup does not promise a fixed row count. Do not build a fixed-height log.

> [!warning]
> Delete is one tap with **no confirmation and no undo**, exactly as the shipped code behaves. That is a decision, not an oversight — but it means the trash target must clear the tap-target floor with real separation from the row's own tap area, and nothing else on the row may be tappable.

## States

- **Empty** (nothing logged today) — `EmptyState` with an apple outline in the tinted square, title `Még nincs bejegyzés`, body `Keress rá egy ételre, és add hozzá a naphoz.` No button; the search field above is the action. The ring and tiles still render, at zero against the target.
- **Loading** — the ring draws its track with a skeleton where the figure goes; the three tiles become three skeleton blocks of the same footprint; the log becomes three row skeletons. The heading and the date control never flicker.
- **Error** — there is none. A failed day fetch reads as zero.
- **Offline** — the shell's strip `Nincs internetkapcsolat`, plus `3 művelet vár feltöltésre` when the outbox holds writes. Nothing on this screen renders it; it belongs to the app shell.
- **No target for this date** — described in Blocks 2 and 3.
- **Role-gated** — none. A coach never opens this route; they read the same day read-only inside the client detail `Táplálkozás` tab.

> [!warning]
> The screen cannot tell "you ate nothing" from "the request failed" — both land on the empty state with a zeroed ring. On a screen whose whole job is a number, a silently-zero total is a lie the user will act on. This needs a real error branch before ship, even if it is one line.

## Components

- Reused as-is: `Pressable` (ghost result rows, ghost icon trash, primary `Hozzáadás`), the `control` recipe for the tap-target floor on the date and grams fields, `EmptyState`, `Skeleton`.
- **`MacroBars` is retired on this screen.** Its two rules survive and must move with it: the clamped fill with the unclamped label, and warning-not-danger for overshoot. Do not let them die with the component.
- The ring is **half-there**: `Progress` (variant D in `ui/feedback/variants/E12E16.tsx`) already draws an accent arc over a track, and its own comment names nutrition as its intended caller — but it renders a percentage in the middle. It needs a value/target signature that renders the absolute figure with a denominator underneath.
- `CountUp` for the ring figure: `tabular-nums` so the digits do not jitter, and it must render the final value immediately under reduced motion.
- **Genuinely new**: the macro tile (icon puck, figure, `label · cél N`, bottom bar, warning variant); the rounded section-badge glyph before `Hozzáadás` and `Naplózva`; the grouped log card (one card per meal group with dividers, replacing one card per row); the food glyph pucks in the result rows.
- **Not used**: `Sheet`. This screen has no bottom sheet, dialog, toast or rest timer — no overlay of any kind.

## Navigation

Bottom bar, `ÉTKEZÉS` active. Member: five tabs — `KEZDŐLAP`, `EDZÉS`, `ÉTKEZÉS`, `HALADÁS`, `PROFIL`.

> [!warning]
> This is a change to the nav contract, not just to this screen. Today `/nutrition` has **no tab at all** — it is reached from the home card or the command palette, and the member bar holds three items (`Kezdőlap`, `Beállítások`, `Gyakorlatok`). `BottomNav` also clamps its list, which is why the admin tab silently vanished once. A five-tab member bar, a six-tab coach bar and a seven-tab admin bar all need that clamp reconsidered together, with an overflow answer — not five tabs squeezed into seven.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/03-nutrition.webp]]
![[_mockups/vilagos/03-nutrition.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
