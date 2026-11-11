# F10 scratch kit host (proof tool, not product code)

Renders the data lane's real files (`frontend/src/ui/data/*`, `ui/feedback/CountUp.tsx`, the specimen
`features/playground/kit/data.tsx`) with the app's real CSS, outside the router, in two layouts:
`#board` (column 3 of the Figma component board at the board's coordinates, aligned to
`_components-2.png`, which starts at board y 1273) and `#<frame>` (402 pt pages with the components
placed where the frame's geometry puts their kit layer). Used before the F7 kit host was merged and
for the frame-level pairs, which the screens themselves cannot show yet.

    # in a copy of this folder; F10_FRONT = the slot's frontend folder (default slot-5)
    node <front>/node_modules/vite/bin/vite.js build --config vite.config.mjs
    node capture.mjs     # pairs + geometry (the capture tool's own page probes and compareGeometry)
    node dynamic.mjs     # roll / tick in flight, reduced motion, the no-text-box fallback

Take a heavy lock (`.pulse/locks/heavy-<n>`) around both. `scratch.css` names the slot by an
absolute path. Outputs: `.pulse/pairs/F10/` (`frames-summary.json` and `dynamic.json` are copied here).
