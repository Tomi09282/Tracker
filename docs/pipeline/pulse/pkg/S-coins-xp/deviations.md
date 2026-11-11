# S-coins-xp — deviations from the frames (lifeos/coins-1v2, coins-1v2-debt, coins-2v2; nezetek/settings-v2-member SZINT row)

Pairs (app | Figma | overlay): `.pulse/pairs/S-coins-xp/*.pair.png`, captured from the built app with
`pulse-verify --package S-coins-xp` (replay, 402 pt, scale 2, insets 62 / 34). States: `states.json`.

Verdict cap: every frame state is **matched-fixture**. The dev backend runs pulse-redesign without
B-core, so the wallet of migration 031 (level, XP, bounds, week, cap, settle time, spendable, debt)
is added to the recording by an edit list with the frame's figures, exactly in the shape of
`pkg/B-core/api.md`. After B-core merges and the backend restarts, the states can be reached live.

| # | Frame element | What the app does | Why |
|---|---|---|---|
| 1 | SOROZAT block (coins-1v2, -debt): "Reggeli nyújtás 12 NAP", "×1,25", "0 FAGYASZTÁS · MÉG 18 NAP" | not drawn | Streaks come with habits (Phase 3, migration 032); no API field exists, and nothing is invented. |
| 2 | "Jutalmak · 2 beváltható ›" / "szünetel" row | not drawn | Rewards are Phase 4 (migration 033); there is no `/rewards` route or count. A row that leads nowhere would be a control that does nothing (D3). |
| 3 | Bottom bar "Ma · Edzés · Étkezés · Naptár · Haladás · Profil" | the member bar of today (Kezdőlap · Edzés · Étkezés · Haladás · Profil) | The bar is P1-nav's; Ma is Phase 3, Naptár Phase 5. |
| 4 | Store | kept under Áttekintés when GET /coins/store lists an item (Q4: nothing a user can do disappears); an empty store (after migration 030) draws nothing | The frames draw no store. The old "Bolt" switch cell is replaced by "Áttekintés" as the frames draw it; `coins.tab.store` is removed. |
| 5 | Statement subtitles "· 12 NAP · ×1,25", "2140 / 2200 kcal", "· közepes", "Újranyitva: …" | the sub is the workout's title (`sourceTitle`) or, for a non-LifeOS movement, the server's note; day-level rows (kcal, perfect day) have no sub | The ledger carries none of these facts (api.md). A row without a sub is the one-line kit row, so the rows below it sit higher than in the frame. |
| 6 | Statement rows of Phases 3-6 (task, habit, streak, reversal, reward) | labelled through `coins.reason.<key>` in hu / en / de | The keys are the reserved reason keys of api.md; the fixture puts the item's name in `sourceTitle` for them — api.md fixes `sourceTitle` only for `workout.completed`, so that part is a forward assumption. |
| 7 | Profil SZINT row (settings-v2-member) | drawn by request R-S-coins-xp-01 (SettingsPage.tsx) (re-cut on S-profile-v2) only when the wallet carries a level; while the wallet is pending or failed ÉRMÉK shows the dash and SZINT is not drawn, as the page joins SZINT "only when its data exists" | The dev backend of today sends no level, so on it the row is absent until B-core is live. JUTALMAK and "Nap és időzóna" are other packages. |
| 8 | Status bar clock | the capture tool's chrome | Not part of the page. |

## Requests

- The frame states `coins-1`, `coins-2`, `coins-3` (S-coins, design round A) open on the "Bolt" cell,
  which no longer exists: mark them `superseded` by `lifeos/coins-1v2` / `coins-2v2`, and drop or
  re-point the S-coins extra states that click "Bolt" (`coins-store-*`, `coins-purchase-*`).
- `pulse-fixture-check --file pkg/S-coins-xp/states.json` reports 137 problems, all of the kind
  "key … no recording of this endpoint has it": the freeze predates migration 031. Re-record
  GET /coins/wallet and /coins/ledger on a B-core backend (`--record --only-missing` does not
  overwrite), then the edits are plain value edits over keys the recording has.
- work-packages.json has no `S-coins-xp` entry; the proposed entry is `work-package.json` in this folder.
