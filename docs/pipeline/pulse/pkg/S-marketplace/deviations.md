# S-marketplace — deviations taken under Q4 (behaviour wins) and defaults that need a ruling

For INT to append to `docs/pipeline/pulse/deviations.md`. Frames: marketplace-1 (feed, Minden), marketplace-2
(search "budapest"). Route `/m`, signed out, URL only on a phone (owner answer Q5; no door added).

## The frame and the plan disagree

| # | Frames | Built | Needs a ruling? |
|---|---|---|---|
| 1 | The lead post's kicker, title, coach + tick and price are set under the cover (y 386-496) | Cover only (PLAN 4.3 "Lead post: cover only (Q4 default)"); the lead's title is the link's accessible name. Everything below the cover stands 126 pt higher than drawn. The frame version is ready as `lead-caption.option.patch` with measured pairs (R-S-marketplace-01) | yes - owner, by the pictures |

## Behaviour that the frames do not draw, kept in a Pulse form

| # | Behaviour (base) | Pulse form taken | Needs a ruling? |
|---|---|---|---|
| 2 | The chosen kind chip carries a check glyph and a tinted fill | the lime 2 pt mark under the word (kit `Chip`), `aria-pressed` kept; the glyph is gone | no |
| 3 | Tapping the chosen kind returns to "Minden" | kept in the chip's handler | no |
| 4 | The chip row scrolls sideways with a right-edge fade | `ChipRow scroll="bleed"` (snap, the chosen word followed); no fade mask (Pulse draws no mask) | no |
| 5 | A lead without a cover is a brand-gradient tile with the kind glyph | nothing is drawn at hero size (a missing image is not drawn); the lead heads the list as its first kicker row, so it stays one tap away (state marketplace-no-cover) | no |
| 6 | The search field is a bordered input with a 44 pt glyph inset | the kit underline field (`Field kit="searchField"`, glass leading, label sr-only) as a plain text input: the kit's `SearchField` always draws a clear cross while filled, and the screen note forbids one (do-not-invent) and `type="search"` would grow WebKit's own | no |
| 7 | City printed as the raw key (`budapest`, `pecs`) | the native name from the taxonomy (`Budapest`, `Pécs`), the key while the taxonomy is pending / failed - the render fix the screen note asks for | no |
| 8 | Loading: card-height skeleton blocks with a radius | a 192 pt cover block and three kicker-row skeletons (`ListRowSkeleton kicker sub`) in a status region | no |
| 9 | Error and empty: a glyph in a tinted disc, a full-width secondary button | `EmptyState` (display title, body) under the kind words; Újra is a text link with a 44 pt target | no |
| 10 | The verified tick is a 16 pt lime check (PublicChrome VerifiedBadge) | on this screen's rows the frame's 14 pt tick in ink (the same VerifiedBadge, sized and inked by className), accessible name kept | no |
| 11 | The empty copy also shows when a kind filters to zero (wrong copy) | kept (no filter-specific string exists, none invented) | copy question, as before |
