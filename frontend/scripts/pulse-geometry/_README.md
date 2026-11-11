# Pulse frame geometry (F0 export, PLAN 3.2 item 2 / R27)

The boxes of every visible layer of the 59 approved Pulse frames, exported once from the Figma design file
`SkWidL9kDDWhBip7cUCFtr` (pages `70:3` member, `70:4` coach, `70:5` public / auth / admin), plus the component
board. The capture tool's geometry probe compares rendered DOM boxes with these files (2 pt; ink-tight
numerals 3 pt).

The export was strictly read-only: nothing in the Figma file was created, moved, renamed, restyled or deleted.

The plan names `frontend/scripts/pulse-geometry/<frame>.json` as the home of these files; this folder
(`.pulse/geometry/`, git-ignored) is where the exporter was allowed to write. The integrator copies
`<key>.json`, `_index.json`, `_components.json` and this file there.

## Files

| File | Content |
|---|---|
| `<screen>-<n>.json` (59) | one app frame; the key equals the PNG name `kepernyok-2x/<key>@2x.png` |
| `_index.json` | `{ fileKey, frames: { <key>: { id, name, width, height, nodes, page, file } }, boards: { _components: {...} } }` — `frames` holds exactly the 59 keys |
| `_components.json` | the component board (node `80:2`, page `70:2`, 1300 x 5094, 1003 nodes), same format |
| `_tools/` | the exporter (see "Re-running") and `verify-png.mjs` |
| `_raw/` | the raw payloads the files are built from (`build.mjs` re-creates everything from them offline) |

Key to frame: on each page the frames sit on a grid (x = 0 / 502 / 1004, y = row x 2600) and every row carries
a page-level layer `Row label/<screen>`; the key is `<label>-<column + 1>`. All 59 keys were found, and every
frame is 402 wide with exactly half the pixel size of its 2x PNG.

## Format

```jsonc
{
  "key": "home-1",
  "frame": { "id": "86:5", "name": "Kezdőlap — edzésnap", "width": 402, "height": 874,
             "page": "70:3", "pageName": "member", "fill": { "hex": "#0b0d0a", "opacity": 1 }, "clipsContent": true },
  "source": { "fileKey": "SkWidL9kDDWhBip7cUCFtr", "method": "..." },
  "nodes": [ /* document order = paint order (later nodes are drawn above earlier ones), parents before children */
    { "id": "86:21", "name": "2", "type": "TEXT",          // FRAME | TEXT | RECTANGLE | ELLIPSE | VECTOR
      "x": 19, "y": 177.2, "w": 61, "h": 108,              // absoluteBoundingBox relative to the frame's top-left, 0.1 pt
      "depth": 5, "parentId": "86:20",                     // depth 1 = direct child of the frame; parentId of depth 1 = frame.id
      "opacity": 1,                                        // the node's OWN opacity (not multiplied with its ancestors')
      "fill": { "hex": "#f2f5ea", "opacity": 1 },          // first visible SOLID fill; on TEXT it repeats text.color
      "text": {                                            // TEXT only
        "characters": "2",                                 // the real string, in its stored case
        "fontFamily": "Big Shoulders Display", "fontStyle": "Black", "fontSize": 124,
        "lineHeightPx": 108,                               // null = AUTO (only the status-bar clock, Inter)
        "letterSpacing": -1.24, "letterSpacingPercent": -1, // px (computed) and the authored percent
        "color": "#f2f5ea", "colorOpacity": 1,             // null when the text has no solid fill
        "case": "ORIGINAL",                                // UPPER = rendered upper-case (CSS text-transform), characters keep their case
        "align": "LEFT", "autoResize": "WIDTH_AND_HEIGHT", // HEIGHT = fixed width, wraps; WIDTH_AND_HEIGHT = hugs one line
        "maxLines": 1,                                     // only when truncation (ellipsis) is on
        "ink": { "x": 24, "y": 178.8, "w": 52.2, "h": 100.4 }, // absoluteRenderBounds: the glyph ink box; null for blank strings
        "segments": [ { "start": 0, "end": 5, "fontFamily": "...", "fontStyle": "...", "fontSize": 13, "color": "#...", "colorOpacity": 1, "case": "ORIGINAL" } ]
                                                           // only for mixed-style text; the top-level style is the first segment's
      } }
  ]
}
```

Optional node fields, present only when they apply:

| Field | Meaning |
|---|---|
| `image: true` | the node has an IMAGE fill |
| `gradient` | first gradient fill `{ type, opacity, stops: [{ hex, alpha, position }] }` (`text.gradient` on TEXT) |
| `otherFill` | a fill type that is neither solid, gradient nor image |
| `cornerRadius` | number, or `[tl, tr, br, bl]` when the corners differ; `cornerSmoothing` when set |
| `strokeWeight` | only when a visible stroke exists: number or `[top, right, bottom, left]`; with `stroke { hex, opacity }` / `strokeGradient`, `strokeAlign` (INSIDE / CENTER / OUTSIDE), `dash` |
| `clipsContent: true` | the frame clips its children |
| `visibleBox` | the part of the box left visible by clipping ancestors (and the frame), when smaller than the box |
| `clippedOut: true` | the box intersects the frame but a clipping ancestor hides all of it — skip it when comparing |
| `absolute: true` | absolutely positioned inside an auto-layout parent (overlays, fades, chrome) |
| `effects` | `["DROP_SHADOW:20", ...]` type and radius |
| `rotation`, `mask`, `blendMode` | as in Figma; a rotated node's box is its axis-aligned bounding box |

Units are Figma points = CSS px at the 402-wide viewport. The PNGs are 2x: multiply by 2 to address pixels.
Included: every node with `visible` true (no hidden ancestor) whose bounding box intersects the frame box.
Excluded: hidden layers and everything below them; layers wholly outside the frame.

## How names map to the DOM

- **Text: match on `text.characters`, never on `name`.** Of the 1979 text nodes in the 59 frames, 1395 are
  named by their own string, 77 by a truncated prefix of it (long names are cut at 28 characters) and 507 carry a
  role name instead (`Title`, `Count`, `Meta`, `Label`, `time`, ...). `characters` is always the full string.
  Where `case` is `UPPER`, the DOM text content keeps the stored case and CSS upper-cases it.
- **Structural frames are NOT called "Row" / "Col" in the app frames** (the plan assumed they were; there is
  not one such layer in the 59 frames, and five on the component board). Auto-layout containers carry role
  names that repeat many times per frame — `Content`, `Header`, `Bar`, `Title`, `Text`, `List`, `Body`,
  `Trailing`, `Controls`, `Figure`, `Value`, `Label`, `Meta` — so they cannot be matched by name. Match them
  through their children (text content) or through the kit layer above them.
- **Kit components are named `<Kind>/<label>[ · <state>]`** and map to `data-kit` like this (read off the
  component board, where each specimen sits in a frame named after its kit function):

  | `data-kit` (kit function) | Layer names |
  |---|---|
  | `btnPrimary` | `Button/primary`, `Button/primary · pressed` / `· disabled` / `· busy` / `· <label>`; busy dots `Dot` |
  | `textLink` | `Link/<label>` (+ `glyph/chev`) |
  | `iconBtn` | `Button/icon · <glyph>`, `Button/back`; glyph `glyph/<name>`; `Badge/count` |
  | `chipRow` | `Chips` > `Chip/<label>[ · selected]` > `Mark` (the 2 pt underline) |
  | `segSwitch` | `Segmented` > `Chip/<label>[ · selected]` > `Mark` |
  | `uiSwitch` | `Switch/on`, `Switch/off`, `Switch/off · disabled` > `Knob` |
  | `setCheck` | `Set check/done` (> `glyph/check`), `Set check/todo` (> `Ring`) |
  | `pic` | `Image/<asset name>` (rectangle with an image fill) |
  | `inputField`, `searchField` | `Field/<label>[ · focus / error / disabled]` > `Labelled input` > `Input/underline` > `Underline`, `Caret` |
  | `screenHead` | `Header` > `Bar` > `Title`, `Button/back` (> `chevron-left`), `Button/icon · ...` |
  | `sect` | `Section/<title>` with `Rule/section` (1 pt, white 14 %) |
  | `listRow` | `List` > `Row/<label>` > `Text`, `chevron-right`, `Monogram slot`; separators `Rule/row` (1 pt, white 8 %) |
  | `ledgerRow` | `Ledger row/<label>` |
  | `statBlock` | `Stat/<label>` > `Num/<value>` |
  | `segBar` | `Week bar` / `Segment bar` > `Seg/<x>` > `Segment/on` / `off` / `half`, `Today dot`; `Stepper` |
  | `macroCol` | `Macro row` > `Macro/<label>` > `Value`, `Figure`; `Progress` > `Fill` |
  | `sparkline` | `Sparkline` (vectors) |
  | `monogramMark` | `Monogram/<initials>` (+ `Dot`) |
  | `emptyState` | `Empty state` |
  | `skel` | `Skeleton` |
  | `noticeLine` | `Notice/danger` / `warn` / `ok` (+ `Dot`); as a toast inside `Toast` |
  | `chatMsg` | `Message/in`, `Message/out` |
  | tab bar | `Tab bar` > `Tab/<id>[ · active]` > `Icon/tab2-<id>[-active]` + label text; `Bottom fade` behind it |
  | bottom sheet | `Scrim`, `Sheet/<title>` > `Grabber`, `Sheet header`, `Body` |
  | dock action | `Dock fade` + `Button/primary` |

  Screen-specific composites follow the same `<Kind>/<label>` pattern (`Post row/...`, `Day/...`, `Step/...`,
  `Option/...`, `Slot/...`, `Exercise/...`, `Legend/...`, `Level/...`, `Role dot/...`, `Specimen/...`).
- **Icons** are `glyph/<name>` frames (square, 12 to 30 pt, mostly 16 / 20 / 24, clipping) inside
  `chevron-left` / `chevron-right` or button wrappers, holding `VECTOR` nodes that are all named `Vector`.
  Compare the glyph frame, not its vectors.

## What is NOT reliable

1. **Device chrome is not in the DOM.** Ignore `StatusBar` (0,0 402 x 62 in 58 frames; `post-detail-3`, the
   402 x 542 text specimen, has none) with `time` ("9:41", Inter), `DynamicIsland` and `signal-wifi-battery`,
   and `HomeIndicator` (139 x 5, 8 pt above the bottom edge) — the plan ignores the status-bar band, the home
   indicator and the 52 pt corners anyway.
2. **Text boxes of hugging text depend on the rasteriser.** `w` of a `WIDTH_AND_HEIGHT` text is Figma's advance
   width; Chrome differs by a fraction of a point per glyph. Compare the left / top edge and the line box
   height (`lineHeightPx`), not the right edge of long strings. Wrapping text (`HEIGHT`) has a trustworthy width.
3. **Numerals: use `text.ink`, not the box.** The big Big Shoulders figures have line boxes tighter than their
   ink and are optically shifted (home-1 "2": box x 19, ink x 24). The ink box is what "ink-tight numerals
   within 3 pt" should be measured against; it is Figma's render bounds and matched the PNGs to 0.5 pt.
4. **The strings are sample data** (names, dates, counts, "9:41"). A replayed recording shows other values, so
   data-driven boxes shift with string length; boxes without a DOM counterpart must be listed, not forced.
5. **Frame height is the design's scroll height, not the viewport** (874). In taller frames the tab bar, the
   bottom fade and docked actions sit at the bottom of the full height; frames marked "(rövidítve)" are
   abbreviated on purpose.
6. **Vectors**: the box is the geometry without the stroke, so a line has `w` or `h` of 0 and a stroked glyph is
   up to one stroke weight larger when rendered. 1317 of them, all named `Vector`.
7. **Images**: the box is the image rectangle, not the visible subject. Hero stills use `blendMode: LIGHTEN`
   and often overflow their stage or the frame (`visibleBox` gives the visible part).
8. **Opacity and colour**: `opacity` is per node; a dimmed ancestor (`opacity` 0.4, disabled states) is not
   folded in. `fill` is only the first visible solid fill — check `gradient` / `image` before concluding that
   a node paints nothing. 11 text nodes have no solid fill (`color: null`).
9. **Overlays**: under `Scrim` / `Sheet/...` / `Toast` the covered nodes are still listed with their full
   boxes (Figma does not clip them); use paint order to know what is on top.
10. **Sub-point values** (76.4 pt tab cells, 43.7 pt segments) come from equal-cell maths; the DOM may round
    each to a device pixel. That is inside the 2 pt tolerance, but sums can drift by 1 pt.
11. `effects`, `strokeAlign`, `dash`, `cornerSmoothing` are recorded for reference only; the type ramp and the
    tokens in `docs/brain/58-Pulse/Pulse System.md` stay the authority for styles.

## Verified

- All 59 keys present; every frame is 402 wide and half its 2x PNG in both directions.
- All 59 app frames came through two channels (the `get_metadata` XML for the boxes of frames, texts,
  rectangles and ellipses; a Plugin API script for styles, paints, vectors and clipping) and a frame is built
  only when two checksums computed inside Figma agree with the XML (boxes; id | type | name | characters).
  The component board came through the Plugin API script alone.
- Parent chain and depth consistent for all 7861 nodes; no duplicate ids; no box outside its frame.
- `node _tools/verify-png.mjs`: 131 opaque signal-coloured shapes (lime pills, segments, dots, notices) measured
  in the 2x PNGs by colour threshold — worst edge deviation 0.4 pt; 125 large-numeral ink boxes — worst 0.5 pt.

## Re-running

The Figma file is the source; export again only if the design changes.

1. `node _tools/build.mjs` rebuilds every file from `_raw/` and prints, per page, `complete` or the next cursor.
2. To re-export a page: delete its `_raw/h-<page>-*.json`, then run `_tools/export-hybrid.min.js` through the
   Figma MCP tool `use_figma` (first line: `PG='<page>',ST=[0,0]`), repeating with the returned `next` cursor
   until it is null. A result is capped near 20 kB, hence the cursor. The page's `get_metadata` XML must be in
   `_raw/metadata-<page>.json`.
3. The component board: `_tools/export-plugin.min.js` with `PG='70:2'`, `IDS=[['_components','80:2']]`,
   `CD=0`, `DRY=0`, same cursor loop.
4. `node _tools/harvest.mjs <agent transcript .jsonl>` copies the returned payloads into `_raw/`, so no
   payload is ever re-typed; then `build.mjs`, then `verify-png.mjs`.

## Fallback (not needed)

Had the export been unusable, R27's fallback was to measure the lime pill, the hairlines, the bar and the
numeral ink from the 2x PNG by colour threshold and mark every other box `unmeasured`.
`_tools/verify-png.mjs` contains exactly that measurement (a dependency-free PNG decoder plus a bounding-box
scan per colour) and can be lifted into the capture tool if a frame ever has to be measured without Figma.
