# S-admin-fix - hand-off

Frontend fix round for the three admin screens (S-admin-accounts, S-admin-posts, S-admin-moderation) after their independent
pair-picture reviews (`.pulse/review/<package>/REVIEW.md`) and the frontend consequences of B-admin-polish. Frontend only; no backend
file, no migration. Base: pulse-int 7197950.

## What was fixed (review item -> change)

Accounts (`features/admin/accounts/**`)
- 1 (blocking) offline write queued silently: `useAccountWrite` has `networkMode: 'always'`; the sheets' save is inert while offline
  and a failed `fetch` says `adminUsers.err.offline` / the generic sentence; no write fires by itself on reconnect.
- 2 (blocking) NAPLO machine codes: the client fallback is `adminUsers.audit.other` (the server now lists the nine account actions only).
- 14 (blocking) disabled ADMIN could not be re-enabled: the enable sheet of an admin target carries the admin's own password field
  (`ReasonSheet password`), body `{ reason, password }`; a refused password stands under the password field.
- 9a/9b step-up error clears on edit; the header "Ujra" of a sheet with fields sends what is typed NOW. 9c was B-admin-polish (api.ts).
- 10 a late disable / enable (`replayed: true`) is told: `adminUsers.replayed.disable|enable`.
- 11 ledger of a missing account: 404 -> "Ez a fiok nem talalhato" page.
- 2/3/4/6/8 list search 8 pt closer, section labels on the frame's 8 pt (`Section gap={8}`; the `className` gap lost to the kit's 16),
  the paging row closed by its hairline, coin stepper buttons on the figure's centre, en / de flags on their own line.
- Not fixed, DEV-095 (close X is the kit's), DEV-094 (7), DEV-100 (12, 13).

Moderation (`AdminPage`, `ModerationQueue`, `StatsPanel`, `statisticsModel`)
- 1 (blocking) refresh glyph reads the panel too (`['admin','stats']` and `['admin','moderation']`); the glyph's busy dots follow both.
- 2 (blocking) decisions never queued offline (`networkMode: 'always'`), inert offline, a failed one says so (`admin.decideFailed|decideOffline`,
  404 / 409 -> "already decided").
- 3 figures above 9 999 are "12k" (DEV-098); 4 "50 / 55 varakozik" + a line (DEV-099); 5 `networkMode: 'always'` on the two stats reads;
  6 de "Trainer"; 8 / 9 panel spacing (rule 20 label 20 numerals, curve and shield measured against the frame, pixel-equal doors / shield);
  10 one "Ujra" for both reads; 11 de caption "Sport heute".
- The empty head: an invisible count keeps the glyph's baseline, so the head stands where it does with a number (pixel-equal to the frame).
- Not fixed: 7 (DEV-100).

Posts (`MarketplaceQueue`, `marketplace/**`)
- 1 (blocking) cover and thumbnails: `UserPhoto blend="lighten"` (no feather mask), dimming on the picture itself; pixel-compared with the frame.
- 2 (blocking) profile take-down: copy says it cannot be undone, the notice names it (DEV-096).
- 3 (blocking) Jelentesek lists CASES (reports of one reason on one subject, `marketplace/reportCases.ts`) with the case's own count and
  oldest date; the switch counts cases; the report page decides the whole case (`decideReports(ids, ..., note)`).
- 4 rows 91 pt; 7 paging block spacing; 9 thumbnail box; 10 one word ("levetel") and a link from the report page to the post page; 11 English
  singular; 13 ink dot for a post nobody can see; 14 long titles wrap; 2c closed outcome in upper case.
- All post mutations are `networkMode: 'always'` (the page already gated them on `useOnline`).
- Not fixed: DEV-097 (frames older than the product), DEV-100 (history, D1).

## Shared edits (integrator files)
- `frontend/src/ui/media/UserPhoto.tsx`: one additive prop `blend?: 'lighten'`.
- `frontend/src/i18n/{hu,en,de}.json`: through `i18n.patch.json` (13 set, 8 change, made by `make-i18n.mjs`); applied in the slot, dirty by design.
- `docs/pipeline/pulse/deviations.md`: DEV-095 .. DEV-100.
- `docs/pipeline/pulse/work-packages.json`: the S-admin-fix entry (`pkg/S-admin-fix/work-package.json`) - in the working tree of the slot only, the integrator adds it.

## Evidence
- Pair pictures (app | Figma 2x) in `.pulse/pairs/S-admin-fix/`, captured live against a scratch backend (own port, throwaway encrypted DB) with
  `pulse-shot --live`; `states.json` here lists the account states. Looked at: accounts list (top and paging row), account page (three bands), name /
  disable / coin / enable-admin sheets, reports list, post page (cover, MEDIA), moderation panel and empty state.
- Behaviour exercised in the browser on the scratch backend: wrong step-up password = ONE request, error under the field, clears on edit;
  enable of a disabled admin with the right password; a coin write that fails fails at once (no queue); the refresh glyph with a row added
  meanwhile; the 56-row queue head ("50 / 56").
