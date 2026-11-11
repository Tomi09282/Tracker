# F9 stage 2 scratch host (proof tool, not product code)

Renders the structure lane's real files (`frontend/src/ui/data/Monogram.tsx`, the specimen
`features/playground/kit/structure.tsx`) with the app's real CSS and fonts, outside the router:
`?view=list` (the monogram specimens, including the cells the kit board only shows in its list
layout) and `?view=<frame>` (a 402 pt page with the monogram placed where the frame's geometry puts
`Monogram/…`: settings-1, coach-profile-1, client-detail-1, coach-chat-1, coach-chat-2).

    # in a copy of this folder; F9_FRONT = the slot's frontend folder (default slot-6); take a heavy lock
    node <front>/node_modules/vite/bin/vite.js build --config vite.config.mjs
    node serve-shoot.mjs <out dir>                       # 402 x H, scale 2, headless Chrome
    node pair.mjs <frame@2x.png> <shot.png> <out.png> x y w h 1   # Figma | app | difference
    node ink.mjs <png> x0,y0,x1,y1                       # the lit-pixel box of a region

Outputs: `.pulse/pairs/F9/s2/`.
