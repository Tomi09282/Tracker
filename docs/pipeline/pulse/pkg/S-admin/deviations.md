# S-admin — deviations taken under Q4 (behaviour wins) and defaults that need a ruling

For INT to append to `docs/pipeline/pulse/deviations.md`. Frames: admin-1 (Moderáció, nothing open), admin-2 (a
submission open), admin-3 (Fiókok). Route `/admin`, account admin@.

## Behaviour that the frames do not draw, kept in a Pulse form

| # | Behaviour (base) | Pulse form taken | Needs a ruling? |
|---|---|---|---|
| 1 | Section tabs: `role="tablist"` / `tab` / `tabpanel` with `aria-controls` | the kit's `Segmented layout="cells"` (a radiogroup with roving tabindex and arrows); the panel is a `section` named by the chosen section. The Moderáció option's accessible name is now "Moderáció 3" (the capture's `^Moderáció` regex still matches) | role change only |
| 2 | Desktop (>= 1024 px) keeps its 12-column layout (R21): the sections as a rail beside the panel, the moderation list beside the review | the rail is a `RowStack` radiogroup of `ListRow role="radio"` (chosen in ink, the others muted, the waiting count as the row value); the review pane is unboxed (no `Surface`) and shows its own display-face name + e-mail head. One control rendered, picked by `useWide` (no hidden duplicate) | no (no frame; structure) |
| 3 | The refresh control spun its glyph while the queue refetched | `Pressable variant="link" shape="icon" busy`: the kit's three dots while fetching (busy also disables it for that moment) | no |
| 4 | The reject flow: reason field + author-facing hint, the destructive control disabled until the trimmed reason is non-empty, cancel returns; no confirm | kept 1:1: `Field` (Indoklás, hint), then `TextLink tone="danger"` Elutasítás (disabled while empty, busy while deciding) and `TextLink` Mégse; no pill while the form is open | no (the frame note calls it "a variant worth a second artboard") |
| 5 | Approve acts at once; on success the review closes and `['admin']` / `['exercises']` are invalidated; a failure shows nothing | unchanged code; the one lime pill (`Pressable variant="primary" size="lg"`) with busy dots; the silence on failure is kept (no copy exists) | yes (known gap: failure silence) |
| 6 | A stale submission (decided elsewhere, 404) showed an `EmptyState` with an X icon | `NoticeLine tone="warn" role="status"` with the title + detail inside the open block; the refresh control is the way out | no |
| 7 | No instructions: a warning line | `NoticeLine tone="warn"` "Nincs megadva végrehajtási leírás" in place of the Végrehajtás section | no |
| 8 | The review block order was media, description, steps, muscles, equipment | the frame's order: media, description, IZOMCSOPORT, ESZKÖZ, VÉGREHAJTÁS, decision (order is not behaviour; prep correction) | no |
| 9 | Muscles as chips (primary = lime fill) | the kit's `RoleKey layout="inline"` (8 pt dot, lime / lime 55 %, the role read to assistive tech) | no |
| 10 | Equipment as chips | the 48 pt equipment still (`Pic slot={equipmentStill(slug)}`) + the word; a slug with no still shows the word alone | no |
| 11 | Accounts: a four-column table that scrolled sideways in a box | two-line `ListRow`s (e-mail; role · date in mono with the letiltva / jelszócsere flags; the client count, a dash for a member). The sort keys are mono labels above the rows (`Pressable variant="link"` + 12 pt arrow, `aria-pressed`); KLIENSEK is static, as the server cannot sort by it. Debounce, sort flip, cap note unchanged | no |
| 12 | Figures failed to load: nothing shown (no copy) | kept: hero, ledger, count and footer absent. While the query client retries a 5xx (twice, `app/providers.tsx`) the figures skeleton stands, so the `admin-figures-failed` capture shows the skeleton, as the base did | no |
| 13 | Piactér (undrawn): status buttons (primary / secondary), cards with a reason chip, note and snapshot always visible | the moderation grammar without a new tap: eyebrow, the status filter as a `ChipRow` rail (lime-marked words, `scroll="bleed"`), each report a ruled block (`ListRow` subject + reason · reporters + mono date, the live-page `TextLink` with the external glyph, the note, the snapshot under its eyebrow with the truncated line), then Döntés. The decide form: two `Field`s (max 2000), the one lime pill Helybenhagyás és eltávolítás (disabled until a reason), the reason-required helper, then Elutasítás and Mégse as links. Note and snapshot stay visible without a tap (the prep's collapsed variant needed an owner yes, which was not asked) | yes, if the owner wants the reports collapsed behind a row tap like Moderáció |
| 14 | (fix round 2, review finding 1) A submitted upload that draws nothing (the demo seed's blank 92-byte transparent WebP, or a broken file) left a 354 x 199 hole in the review, indistinguishable from "no media" | the upload's rectangle stands on the kit's skeleton block (`--skeleton-base`, radius 2, static), which is how the admin-2 body script itself draws a blank still (`skel(P.cw, 199)`, node "blank still (asset submission-split-squat needed)"); an opaque photograph covers it completely. The capture's `boxed` probe counts this one backing as a boxed surface (admin-2, admin-2-tall, admin-rejecting, admin-w1280) | yes: allow it (the photo's own backing, not an enclosure), or take it out again and accept the hole until R-S-admin-03 serves a real photograph |
| 15 | (fix round 2, review finding 4) Wide (>= 1024 px): the chosen moderation row kept its down chevron while its review stood beside the list | the list rows' chevrons point right (the review opens beside them); the chosen row's chevron is in ink like its name, the others text-3. The phone keeps the down / up chevrons of admin-1 / -2 | no (no frame) |

## Removed on purpose (brief, owner)

| What | Why |
|---|---|
| `AdminMetrics.tsx` (imported nowhere) and its 14 `adminMetrics.*` keys; the `adminMetrics.clock.utc` untranslated entry | brief / work-packages.json notes; removed by `i18n.patch.json` through the tool |
| `admin.exercises`, `admin.media`, `admin.section.overview` | no reader after the rewrite (check-i18n gate dry run green with the removal) |
| The donut (`Gauge`), the summary tiles, `CountUp`, the section icons (Users / Dumbbell / Image / ShieldCheck / Globe), Film / ImageOff / Check / X glyphs, the shield-off glyph on a disabled account | not drawn; the giant `Numeral` rolls, the role split is `SplitBar` + `SplitLegend` (G-data) |

## Data that only fixtures reach (verdict `matched-fixture`)

The dev DB answers 49 users (45 / 3 / 1), 1660 exercises, 4 media, other owners; the frames draw 19 (15 / 3 / 1), 1656, 3 and the
`@pelda.hu` owners. The three frame states replay recordings edited to the frame's figures (`states.json` overrides, checked by
pulse-fixture-check against 184 recordings). The `letiltva` flag of admin-3 is NOT set: no recording holds a disabled account, so a
`disabledAt` value cannot be schema-checked (ruling 2026-10-17); the flag is drawn by the code (`text-danger`, micro upper).
The submitted image is the seed's blank upload; the frame draws a barbell photograph (the screen note calls the photograph illustrative and the seed file a blank placeholder). A fixture cannot answer a binary body, so the photograph cannot be replayed: request R-S-admin-03. The `letiltva` flag stays unset: pulse-fixture-check refuses `disabledAt` = a number ("the recordings have null"), tried again in fix round 2.

## Phase 1 — admin section routes (package S-admin-routes, design round A: admin-view-1 / -2 / -3 / -3-report)

The sections of `/admin` became the admin bar's routes: `/admin` = Moderáció (`AdminPage`), `/admin/accounts` = Fiókok
(`AdminAccountsPage`), `/admin/marketplace` = Piactér (`AdminMarketplacePage`), each under the shared `AdminHeader`
(eyebrow, the Stílus stúdió door, the tab's name as the display title). `AdminShell`'s local section switch / rail is gone;
the file now holds `AdminHeader` and `AdminForbidden`. Every server check is unchanged (the pages only explain a refusal).

| # | Frame vs app | What the app does | Owner question? |
|---|---|---|---|
| 16 | admin-view-1 draws a "Szabályok ›" door row under the closed Gyakorlat / Médiafájl ledger | not drawn: `/admin/rules` arrives in Phase 2, and a row that leads nowhere is a control that does nothing (D3). Everything under the ledger therefore stands 57 pt higher than in the frame | no — it lands with Phase 2 |
| 17 | admin-view-3-report is a pushed page | it is `/admin/marketplace?report=<id>` (with the list's `?status=`), not a route of its own: the server has no read of one report, the case is a row of the status list, and `app/router.tsx` / `routeMeta.ts` are the integrator's. The back control (`ScreenHeader back`, label Piactér) takes the history step when the row pushed the page, else replaces to the list; a report no longer in its list (decided elsewhere, stale link) sends the reader to the list | no |
| 18 | admin-view-3-report draws the lime pill "Helybenhagyás és eltávolítás" lit with an empty reason field | the pill stays disabled until a removal reason is typed, with the existing helper line "Eltávolításhoz indok kell." under it (behaviour wins, Q4): the frame state is not reachable with an empty field | yes, if the pill should look enabled and refuse on tap instead |
| 19 | the report page draws no reporter note | the reporter's own note, when there is one, stays on the page under the date (it was always visible before; behaviour wins). The frame state's fixture empties it | no |
| 20 | the old in-row "Mégse" of the decision form | gone, as the frame says: the back control leaves the page (`admin.marketplace.cancel` removed) | no |
| 21 | admin-view-3's four status words 16 apart (the kit line is 24) | `ChipRow className="gap-x-4"` on this one line so the four words fit 354 as drawn; at 360 the line scrolls sideways inside itself (bleed), as the kit allows | no |
| 22 | admin-view-3-report's DÖNTÉS section is 24 apart throughout (kit `sect` with gap 24: rule, 24, eyebrow, 24, form) | built as a `section` of `Rule strong` + `SectionHeader rule={false}` + the form at `gap-6`; the snapshot section keeps the default 16 | no |
| 23 | the "Válassz egy beküldést" hint under the phone queue (an admin-1 leftover, round-A review finding 4) | removed on a phone; kept in the wide two-pane layout, where it explains the empty pane | no |
| 24 | Fiókok carried its own "FIÓKOK" eyebrow as a section of /admin | gone: the page title names the list (admin-view-2); `adminUsers.title` stays the list's accessible name | no |
| 25 | report subjects in admin-view-3 are one line at 402 | `lines={2}`: at 360 a long subject wraps to a second line instead of losing its end | no |

Keys: `admin.marketplace.report` added (hu "Bejelentés" from the frame; en "Report", de "Meldung" proposed — C5); `admin.title`,
`admin.sections`, `admin.marketplace.cancel` removed (no reader). The state scripts in `states.json` reach each tab by its route
(no switch click any more); four new states `admin-view-1 / -2 / -3 / -3-report` replay the frames' data by fixture
(verdict cap `matched-fixture`).
