# F10 stage-2 scratch kit host (proof tool, not product code)

Renders the lane's real stage-2 files (`frontend/src/ui/data/LedgerRow.tsx`, `SegmentBar.tsx`
`Stepper`, the specimen `features/playground/kit/data.tsx`) with the app's real CSS and fonts,
outside the app's router and shell, in two layouts:

- `#board` — the component board's count cell (with the stepper, column 3, x 906, y 2109) and its
  `ledgerRow` cell (column 2, x 473, y 3448) at the board's own coordinates, the page starting at
  board y 2080; plus the off-board states cell (rest / same column / pressed / focus / disabled /
  busy / failed / on the edge).
- `#settings-1`, `#coach-dashboard-1`, `#client-detail-2`, `#onboarding-3` — 402 pt pages with the
  ledger rows / the step bar exactly where the frame's geometry puts their kit layer.

    # in a copy of this folder; F10_FRONT = the slot's frontend folder (default slot-5)
    node <front>/node_modules/vite/bin/vite.js build --config vite.config.mjs
    node capture.mjs     # pairs + geometry + pixel ink of every text / glyph against the frame

Take a heavy lock around both. The board side is compared with the four `_components-*.png`
slices stitched back together (`.pulse/pairs/F10/kit-board/_components.board.png`). Outputs:
`.pulse/pairs/F10/` (`summary-s2.json` is copied here as `frames-summary-s2.json`).
