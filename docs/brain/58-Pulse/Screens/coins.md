---
type: screen-inventory
title: Érmék — screen inventory
updated: 2026-10-11
route: "/coins"
tags: [ux, screen, inventory, pulse]
---

# Érmék — `/coins` · every role (Tag, Edző, Admin — the screen is identical) · reached from Profil: the "Érmék" row (and, in the approved V1 Profile, the "Eredmények" row too — both open the same screen on the same sub-tab); on desktop (≥ 1024 px) the Cmd/Ctrl+K command palette lists it too · lit tab: **Profil**

Sources checked: `frontend/src/features/coins/{CoinsPage,CoinBalance,useCoins}.tsx`, `backend/src/coins/routes.js`, `backend/src/db/migrations/019_coins.sql`, `backend/scripts/seed-demo.mjs` (section 9), `frontend/src/app/navTabs.ts`, `hu.json`. The brain spec's ring, tiles, cards and tinted icon holders are the OLD look — ignored here.

## Purpose

The coin wallet. The user comes to check one number (the balance), see what it buys (two theme packs), see what earned it (seven fixed achievements, awarded automatically) and read every credit and debit. Coins are earn-only; nothing is claimed here and nothing is bought with money.

**The ONE primary action: buy a store item by tapping its price** — one tap, no confirmation, no sheet. It exists as a primary (lime) control only while an unowned item is affordable. For the sample persona nothing is affordable, so the resting screen has no lime pill at all.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy (key = value) | Sample data |
|---|---|---|---|---|
| Sub-screen header | live | Back control (icon only, goes back in history) + the screen title. Nothing else in the header — no balance, no menu. | `common.back` = "Vissza" (accessible name only, not visible)<br>`coins.title` = "Érmék" | Érmék |
| Balance | live | Whole coins as one integer — the heaviest figure on the screen — with a caption under it. Stays fixed above all three sub-tabs. Not tappable. In the running app a small coin line glyph sits above the figure and an empty ring track surrounds both (old look; the track never fills — see SHOULD). | `coins.balanceCaption` = "Egyenleged"<br>`coins.balanceLabel` = "{{count}} érme" (accessible name only — never print "190 érme") | 190 · Egyenleged |
| Balance change feedback | live | For 2.6 s after the balance changes the caption slot shows the signed whole-coin delta instead of the caption, then the caption returns; the figure rolls from the PREVIOUS value (never from 0). Earned = accent colour, spent = muted (never danger). | no key — digits only, e.g. "+50", "-250" (ASCII hyphen as the minus) | the seed's Aurora purchase: 450 → 200, caption "-250" |
| Sub-tab switch | live | Three mutually exclusive views, in this order; the screen ALWAYS opens on the first; the header and the balance do not move. No deep link to a tab. | `coins.tab.store` = "Bolt"<br>`coins.tab.achievements` = "Eredmények"<br>`coins.tab.statement` = "Kimutatás" | Bolt selected |
| Bolt — section label | live | One label above the list; shown only when the list has items. | `coins.storeSection` = "Megvásárolható" | Megvásárolható |
| Bolt — item row | live | Title · one-line description (truncates) · trailing state: either the price (coin glyph + whole number) or the owned mark + label. Server order: price, then id. Exactly TWO items exist, both theme packs, both 250. Each row also carries a leading per-item line glyph today (Aurora = a rainbow, Ember = a flame; old look, no artwork). | `coins.item.theme.aurora.title` = "Aurora"<br>`coins.item.theme.aurora.description` = "Hideg, északi fényű színátmenet."<br>`coins.item.theme.ember.title` = "Ember"<br>`coins.item.theme.ember.description` = "Egyetlen meleg kiemelés."<br>`coins.owned` = "Megvan"<br>price: digits only, no key | Aurora — Megvan<br>Ember — 250 |
| Bolt — price control (the buy action) | live | Tap = buy now. Affordable → primary style. Not affordable → quiet style but STILL tappable (deliberately never disabled). While one purchase runs: that control is busy, every other price is disabled. | none beyond the number | Ember 250 with balance 190 → quiet, tappable |
| Bolt — purchase result line | live | One line under the list. Any failure (too few coins, price changed, already owned, rate limit, network) → ONE generic warning line; the shortfall is never stated. A replayed request → a muted info line. SUCCESS HAS NO MESSAGE: the balance rolls down, the delta shows, the row turns to "Megvan". | `coins.purchaseRefused` = "A vásárlás nem ment át. Ellenőrizd az egyenleged — lehet, hogy közben változott az ár."<br>`coins.alreadyProcessed` = "Ez a vásárlás már megtörtént, nem terheltünk újra." | tapping Ember's 250 at balance 190 → the refusal line |
| Eredmények — counter | live | Unlocked / total, one line. | `coins.unlockedCount` = "{{done}} / {{total}} feloldva" | 4 / 7 feloldva |
| Eredmények — achievement row (always 7) | live | Title + one line: what it PAID (unlocked) or what it PAYS (locked). Locked rows are dimmed and carry a lock mark. Every row has the SAME leading trophy line glyph today (tinted when unlocked, grey when locked) — one mark for all seven. Fixed server order, locked and unlocked interleaved. Not tappable, nothing to claim. | `achievement.workout.first` = "Az első edzés"<br>`achievement.workout.sessions.10` = "10 edzés"<br>`achievement.workout.sessions.100` = "100 edzés"<br>`achievement.pr.first` = "Az első csúcs"<br>`achievement.streak.workout.7` = "7 napos sorozat"<br>`achievement.streak.workout.30` = "30 napos sorozat"<br>`achievement.nutrition.logged.7` = "7 nap naplózva"<br>`coins.paidYou` = "{{count}} érmét adott"<br>`coins.pays` = "{{count}} érmét ad" | see Frame 2 |
| Eredmények — footnote | live | Explains that nothing has to be collected. | `coins.awardedNote` = "Ezeket az app adja oda magától, amikor teljesíted őket — nincs mit begyűjteni." | — |
| Kimutatás — statement row | live | Reason · date · optional note · signed whole-coin amount. Newest first. Credits "+N" in accent, debits "-N" in neutral text (never danger). Not tappable. FIRST 25 ROWS ONLY — no load-more. | reason: NO KEY — the server's ENGLISH label ("Achievement reward", "Store purchase", "Administrative credit", "Administrative debit")<br>date: NO KEY — hard-coded browser-locale short date<br>note: free text, printed after the date only when the row has one. In the product ONLY an admin adjustment has a note (mandatory there, 1–280 characters). A purchase made in the app writes NO note and a reward has none — the "Aurora" on the demo's purchase row is written by the seed script alone | see Frame 3 |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy (key = value) | Sample data |
|---|---|---|---|---|
| Statement — empty | live | Replaces the list for an account with no movement (every new member). No action. | `coins.noHistoryTitle` = "Még nincs mozgás"<br>`coins.noHistoryBody` = "Az érmék akkor jelennek meg itt, amikor kiérdemelted vagy elköltötted őket." | new member: balance 0 |
| Store — empty | live (unreachable with today's catalogue) | Replaces the list when nothing is for sale. No action. Also what a FAILED store request shows (no error copy exists). | `coins.storeEmptyTitle` = "A bolt üres"<br>`coins.storeEmptyBody` = "Most nincs megvásárolható tétel." | — |
| Offline strip (app shell, above the header) | live | One or two lines; pushes the screen down. A purchase never enters the offline outbox, but it does not fail at once either: while the browser reports offline the request is HELD — the tapped price stays busy, the other prices stay disabled — and it is sent when the connection returns. The refusal line appears only when a request was really attempted and failed (for example the server is unreachable while the browser still reports a connection). | `offline.title` = "Nincs internetkapcsolat"<br>`offline.queued` = "{{count}} művelet vár feltöltésre" | Nincs internetkapcsolat |
| "This week" / "spent" readouts | planned — copy and a client slot exist, the server sends NO data, so the running app shows two permanent placeholders | Coins earned in the last 7 days; coins spent in total. Read-only. | `coins.weekCaption` = "Ezen a héten"<br>`coins.spentCaption` = "Elköltve" | none — do not draw figures |
| Share-of-lifetime arc around the balance | planned — client reads a field the server never sends | Balance ÷ lifetime earnings. | no key | none |
| Deep link to a sub-tab (Profil "Eredmények" → the Eredmények view) | planned (review brief P-06) | Today both Profil rows land on Bolt. | — | — |
| Third store item "weekly report" | planned — a glyph is mapped for SKU `feature.weekly_report`; not in the catalogue, no hu.json key | — | no key | do not draw |
| Achievement category and unlock date | cut from the UI — returned by the API, never rendered, no copy | — | no key | — |

## States

- **Before the screen** — route chunk loading: the shell's full-screen skeleton.
- **Wallet loading** — a placeholder exactly where the figure goes; no number, no caption.
- **Wallet request failed** — NO figure (a neutral coin mark in its place), never "0". No error text and no retry exist (gap).
- **Balance just changed** — delta in the caption slot for 2.6 s; with reduced motion the number lands at once, the delta still shows.
- **Bolt** — loading (3 row placeholders) · rows · owned row ("Megvan") · price affordable (primary) · price not affordable (quiet, still tappable; also every price while the wallet is still loading or has failed, because the balance is then read as 0) · purchase in flight (tapped price busy, the other prices disabled) · refused (warning line) · replayed (muted line) · empty ("A bolt üres" / "Most nincs megvásárolható tétel.").
- **Eredmények** — loading (4 row placeholders) · always 7 rows, each locked or unlocked · request failed → "0 / 0 feloldva" and the footnote with no rows (no error copy; gap).
- **Kimutatás** — loading (5 line placeholders) · rows · empty ("Még nincs mozgás" + body) · request failed → the same empty copy (gap).
- **Offline** — shell strip above the header; the last loaded data stays. A purchase tapped while the browser reports offline is held (price busy, the others disabled) and sent on reconnect; the refusal line shows only when a request really failed. Opened while the browser reports offline and no coin data is cached yet, the screen shows a FALSE zero state — "0" over "Egyenleged", "A bolt üres", "0 / 0 feloldva", "Még nincs mozgás" — because held requests count as neither loading nor failed (a bug that contradicts "never 0"; flag it, do not draw it as a designed state).
- **Roles / devices** — none. Tag, Edző and Admin see the same screen; only the tab bar differs (5 / 6 / 7 tabs, Profil lit). An admin's manual grants appear to the receiver as ordinary statement rows.
- **Overlays** — none. No sheet, dialog, toast or confirmation anywhere on this screen.

## Frames to draw

All three: 402 × 874, member tab bar (Kezdőlap · Edzés · Étkezés · Haladás · **Profil** lit), status bar 9:41. The header and the balance block are identical in all three.

### Frame 1 — "Érmék · Bolt" (the default landing; what a returning user sees every time)

1. Sub-screen header: back chevron (bare glyph, no disc; accessible name "Vissza") · title **Érmék** (display face → ÉRMÉK).
2. Balance: **190** (the screen's one giant numeral) · caption **Egyenleged**. Optional: the kit's coin render beside the numeral.
3. Sub-tab switch: **Bolt** (selected) · Eredmények · Kimutatás.
4. Section label: **Megvásárolható** (as an eyebrow → MEGVÁSÁROLHATÓ).
5. Row: **Aurora** · "Hideg, északi fényű színátmenet." · trailing: check mark + **Megvan**.
6. Row: **Ember** · "Egyetlen meleg kiemelés." · trailing: coin glyph + **250** in the QUIET (non-lime) style — 190 < 250, yet it is a live control.
7. Nothing under the list at rest. Empty black down to the bottom fade.
8. Tab bar, Profil lit.

No lime pill on this frame — that is the truth for the persona (owns Aurora, cannot afford Ember). Variant 1b if a second artboard is wanted: the same frame after tapping 250, with the warning line "A vásárlás nem ment át. Ellenőrizd az egyenleged — lehet, hogy közben változott az ár." under the list (2 lines at caption size, 3 at body size).

### Frame 2 — "Érmék · Eredmények"

1. Header **Érmék** · **190** · **Egyenleged** (as Frame 1).
2. Sub-tab switch: Bolt · **Eredmények** (selected) · Kimutatás.
3. Counter: **4 / 7 feloldva**.
4. Seven rows, in this order:

| # | Title | Line | State |
|---|---|---|---|
| 1 | Az első edzés | 25 érmét adott | unlocked |
| 2 | 10 edzés | 50 érmét adott | unlocked |
| 3 | 100 edzés | 250 érmét ad | locked (lock mark, dimmed) |
| 4 | Az első csúcs | 25 érmét adott | unlocked |
| 5 | 7 napos sorozat | 50 érmét adott | unlocked |
| 6 | 30 napos sorozat | 150 érmét ad | locked |
| 7 | 7 nap naplózva | 25 érmét ad | locked |

5. Footnote: "Ezeket az app adja oda magától, amikor teljesíted őket — nincs mit begyűjteni." (2 lines at caption size; may sit under the fold — the fade may cut row 7, never the footnote alone).
6. Tab bar, Profil lit.

### Frame 3 — "Érmék · Kimutatás"

1. Header **Érmék** · **190** · **Egyenleged**.
2. Sub-tab switch: Bolt · Eredmények · **Kimutatás** (selected).
3. Seven rows, newest first (reason · date · note → amount):

| # | Reason (server English, verbatim) | Date (hu device) | Note | Amount |
|---|---|---|---|---|
| 1 | Administrative debit | 2026. 09. 27. | Téves jóváírás korrekciója. | -10 |
| 2 | Store purchase | 2026. 09. 04. | Aurora | -250 |
| 3 | Administrative credit | 2026. 08. 30. | Demó feltöltés a bemutatóhoz. | +300 |
| 4 | Achievement reward | 2026. 08. 15. | — | +50 |
| 5 | Achievement reward | 2026. 08. 08. | — | +50 |
| 6 | Achievement reward | 2026. 07. 21. | — | +25 |
| 7 | Achievement reward | 2026. 07. 17. | — | +25 |

The second line of a row is "date · note" (e.g. "2026. 09. 04. · Aurora"), or the date alone. Check: 25 + 25 + 50 + 50 + 300 − 250 − 10 = 190. Row 2's note "Aurora" is the demo seed's own: a purchase made in the app stores no note, so a real purchase row is "Store purchase" over the date alone — the row must read correctly without an item name.
4. Tab bar, Profil lit; the bottom fade cuts the last row.

Sample data source: all rows, amounts, notes and ages are the demo seed's own (`seed-demo.mjs` section 9; ages 12 / 35 / 40 / 55 / 62 / 80 / 84 days before 9 October 2026) and equal section 6.8 of the feature inventory. Coach variant, also from the seed: Kovács Péter · balance **125** · statement = one row "Administrative credit · Edzői indulócsomag. · +125" · the seed gives the coach no unlocks (0 / 7 feloldva) · store: Aurora 250 and Ember 250, both unowned and unaffordable.

## Images

- **Could help:** the kit's graphite coin render (asset `coin`, already on the approved V1 Profile row) as the one object glowing beside the balance — monochrome steel, never gold.
- **Could help:** for the two store rows, a small swatch in the pack's own accent is real data — Aurora `#4FD1C5`, Ember `#F0803C` (`tokens.css`). It shows what is being bought without pretending a preview exists.
- **Achievements:** no artwork per achievement exists and none may be invented. Seven identical markers (for example the Home week-bar grammar: 4 lit, 3 off) are on-system; trophies, medals and badge art are not.
- **Statement:** needs no imagery.
- **Must NOT be shown as if it existed:** gold coins or treasure, coin bundles for sale, theme preview screenshots or phone mock-ups of a pack, per-achievement illustrations, a member photo, confetti or any celebration art.

## Do not invent

- Buying coins with money, top-up, payment methods, "Premium", gifting or sending coins to someone.
- "X coins until …", next-reward teasers, countdown offers, daily login bonus, limited-time deals.
- A "claim" / "collect" button, an unlock celebration, an unlock toast or notification.
- Progress toward a locked achievement ("7 / 10 edzés", a progress bar) — the API returns none. Unlock dates, categories, filters or sections for achievements.
- An eighth achievement, levels, XP, ranks, a streak counter, leaderboards.
- Store items other than Aurora and Ember; an item detail page, a preview, a cart, quantities, a purchase confirmation sheet, a success screen, a refund.
- A disabled price, or a "you need 60 more coins" hint — the control stays live and the refusal line is generic.
- "Apply now" / "wear it" on a bought pack — a pack is chosen in Profil → Megjelenés.
- Working "Ezen a héten" / "Elköltve" figures, a lifetime total, a balance chart, a share-of-lifetime ring.
- Statement filters (earned / spent), search, month headers, a running-balance column, tappable rows, export, load-more, Hungarian reason labels.
- A printed "190 érme" label; the balance in the header or the tab bar; a Coins tab.
- A "how to earn" list other than the seven achievements.

## Notes for the designer

- **The primary action is usually absent.** The persona owns one item and cannot afford the other. Draw the lime price pill only on a deliberate "affordable" variant (real past state from the seed: balance 450 before Aurora was bought, both items at 250). In that state the code gives EVERY affordable price the primary style — two lime pills — which breaks "one lime pill per screen"; a rule is needed (owner decision, not designed here).
- **What the store sells is a colour theme of the old design.** Whether packs survive inside Pulse is an open owner decision (review brief, decision 3). Draw the rows by name and description only.
- **Long strings:** `coins.purchaseRefused` is 86 characters (2 lines at caption size on 354 pt, 3 at body size); `coins.awardedNote` 78 (2 lines); `coins.noHistoryBody` 75 (2 lines). A statement note can be up to 280 characters and truncates on one line together with the date. Item descriptions are one truncated line.
- **Mixed language in Kimutatás:** English reason labels over Hungarian notes — verbatim today, no key. Flag it; do not translate in the mock without saying so.
- **A purchase row does not say what was bought.** The app stores no note on a purchase (only the demo seed does), so outside the demo a spend reads "Store purchase · date · -250". Showing the item would need a backend change — flag it, do not rely on it.
- **Date format** is the browser's default locale, not the app language: "2026. 09. 27." on a Hungarian phone, "9/27/2026" on an English one.
- **Minus sign:** the app prints an ASCII hyphen ("-250"), not "−".
- **Big balances:** one admin adjustment can move up to 10 000 coins, so 5-digit balances are possible. Digit grouping: the rolling figure (the default behaviour variant, motion allowed) uses the APP language — "12 450" in Hungarian; with reduced motion or a non-rolling variant it falls back to the browser locale ("12,450" on an English phone). Four-digit balances are not grouped in Hungarian ("1450").
- **Errors are under-designed in the product:** a failed store / achievements / statement request shows the EMPTY copy, and a failed wallet shows no figure with no message. If an error state is drawn, it needs new copy (none exists).
- **Both Profil rows land on Bolt** — tapping "Eredmények" (4/7) does not open the Eredmények view.
- **Sub-screen header** has no approved V1 drawing yet: bare back chevron + display title, tab bar stays with Profil lit (review brief M-13) — no boxed icon button.
- The balance roll and the achievement shimmer are admin-switchable behaviour variants (Style Studio E25 / E26): design the state, not the animation.
- In the live demo database the four reward rows are stored in a different order than their dates (seed artefact: +50, +25, +50, +25); the table above is chronological, as real accounts are.
