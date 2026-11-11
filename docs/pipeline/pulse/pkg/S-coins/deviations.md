# S-coins — deviations taken under Q4 (behaviour wins) and defaults that need a ruling

For INT to append to `docs/pipeline/pulse/deviations.md`. Frames: coins-1 (Bolt), coins-2 (Eredmények), coins-3 (Kimutatás).

## Behaviour that the frames do not draw, kept in a Pulse form

| # | Behaviour (base) | Pulse form taken | Needs a ruling? |
|---|---|---|---|
| 1 | The way back is `history.back()`, not a link to one parent (/coins is also opened from the desktop command palette) | `ScreenHeader kind="push"` with `back={{ onClick: () => history.back(), label: t('nav.profile') }}`: the frame's "‹ PROFIL" eyebrow, the history as the step. The control's accessible name is now the visible parent name ("Profil") instead of "Vissza" | no |
| 2 | The balance-change feedback: the signed delta for 2.6 s in the caption slot, the figure rolling from the previous value | the delta takes the EGYENLEGED eyebrow slot (display face, upper case), lit for an earning, the eyebrow's own ink for a spend, never danger; `Numeral size="giant" mode="roll"` rolls the changed digits; reduced motion lands at once and the delta still shows | no |
| 3 | Tablist semantics (`role="tablist"` / `tab` / `tabpanel`, `aria-selected`, `aria-controls`, roving `tabIndex`, arrow keys wrap) | the kit's `Segmented layout="cells"`: a radiogroup with roving tabindex and arrow keys; one view at a time, local state, always opens on Bolt | role change only (tab -> radio); the capture's `arrived` accepts both |
| 4 | Single-flight purchase (the tapped price busy, every other price inert), the idempotency key minted at the tap, the expected price echoed | unchanged code; `busy` / `disabled` on the price control | no |
| 5 | An unaffordable price is a live control (it answers 409 with the real numbers) | the quiet price of coins-1: `TextLink text="data"` with the coin raster (20) as its lead — never disabled | no |
| 6 | An affordable price is the primary style | the small lime pill (`Pressable variant="primary" size="sm"`) with the coin and the figure. Two affordable items would show two pills (the one-pill rule). Not reachable today: after Q2 no purchasable item is listed for any account | yes (no frame; only with a future non-theme catalogue) |
| 7 | A refused purchase (409 / 5xx) shows the refusal line; a replayed key shows "already processed" | `NoticeLine tone="warn" role="alert"` and `NoticeLine tone="info" role="status"` under the list | no |
| 8 | A failed store / achievements / statement read shows the EMPTY copy (no error copy exists) | kept: store and statement -> their `EmptyState`; achievements -> "0 / 0 feloldva" + the footnote. No new copy (R22) — listed in `i18n.patch.json` copyQuestions | yes (copy) |
| 9 | A failed wallet read renders no figure, never 0 | the giant is an em dash in the pending tone, in a slot of the figure's cap height (nothing below moves) | no |
| 10 | Loading | wallet: a block at the giant's ink box under the eyebrow; store / achievements / statement: 3 / 4 / 5 `ListRowSkeleton`s under `role="status"` "Betöltés" | no |

## Removed on purpose (brief, owner)

| What | Why |
|---|---|
| The arc (`Gauge`) round the balance and its `share` of `lifetimeEarnedMinor` | not drawn; no honest denominator (the server does not send it) |
| The two tiles "Ezen a héten" / "Elköltve" (`SummaryTile`) | not drawn; no server-computed figure. Their keys `coins.weekCaption` / `coins.spentCaption` are removed by `i18n.patch.json` |
| The per-item row glyphs (Rainbow / Flame / FileText / Palette / Sparkles) and the achievement trophy glyph | the frames draw none in the store; achievements carry the medal raster (lit = earned, idle at 45 % = locked) |
| E25 B-E (fly-to-wallet, balance-pulse, breakdown-sheet, milestone) and E26 A (flame flicker) | one Pulse look (Q3), `variants.json` |

## Q2 — the store after the display filter

`theme.*` items the member does not own are not listed; an owned one keeps its "Megvan" row; with nothing to list, `coins.storeEmptyTitle`. Consequence: the frame's second row (Ember, 250, the quiet price control) is unreachable for every account today — user@ sees Aurora alone, an account that owns nothing sees the empty store. The price control, the refusal and the purchase outcome are proven only on fixtures that give the second recorded item a non-theme sku (`states.json`, `coins-store-priced` / `-affordable` / `coins-purchase-*`).
