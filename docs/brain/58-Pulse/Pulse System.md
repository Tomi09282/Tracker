---
type: design-system
title: Pulse V1 “Open Field” — the system
updated: 2026-10-18
tags: [ux, design-system, pulse]
---

> [!important] The code holds the values; this note holds the rules
> Pulse is implemented (branch `pulse-redesign`, see [[0000 Index]]). Every value — colour, type size, spacing, radius, glow, duration, metric — now lives in `frontend/src/ui/tokens/tokens.css` and nowhere else, and this note names the token instead of repeating the number. The Figma frames' exact boxes are in the geometry export (`.pulse/geometry/<screen>-<n>.json`, file `SkWidL9kDDWhBip7cUCFtr`). Sections 6 and 7 still quote the Figma kit's own calls (`app-kit.js`): those arguments are the drawing tool's, not the app's.
> File paths below (`build/pulse/…`, `shots/…`) refer to the Figma build archive at `C:\Users\Petike\Documents\TRACKER-mockups\5-pulse`.

# PULSE V1 "OPEN FIELD" — the system

Operational spec for every screen builder and for the developers. The approved look is `shots/pulse/v1-home@2x.png` + `v1-profile@2x.png`; where this file and those two shots disagree, the shots win.
Kit: `build/pulse/app-kit.js` (if the workflow hands you `build/pulse/loader.js`, paste that instead — it loads this same kit from the file and exposes the same names). Worked example: `build/pulse/app-home.js`. Reference in Figma (file `SkWidL9kDDWhBip7cUCFtr`, page `70:2`): "Pulse — Components" (`80:2`, every component in every state) and "Reference — Home" (`78:2`).

## 1. The idea

A black room in which things light up. Near-black canvas, one acid-lime lamp, giant condensed numerals, graphite renders and low-key black-and-white photographs glowing out of the dark.
Nothing is enclosed: structure = one left edge (the gutter), one right edge, 1 px rules, eyebrows, large numerals, mono meta, and space.
Lime is light, not paint. A screen has ONE glowing lime pill (its primary action); every other lime mark is a small sign that something is live, selected or done.
"Nagyon letisztult": if an element is not content, a control or a rule, it does not exist.

**Non-negotiables**
1. **No boxes.** No card, tile, panel, capsule, outlined pill, input box, icon disc, avatar circle, framed thumbnail. The only surface in the product is the bottom sheet (§4).
2. **One lime action per screen**, the only filled lime shape on it (the primary pill). A second action is text.
3. **Lime only for:** the primary action · a selected filter (the selection mark) · live / done data (segment, tick, end dot, switch on, lit tab, badge). Never for decoration, headings, links, icons at rest. Only the primary pill glows.
4. **Images glow out of black with no frame** (§5). Text never sits on a lit area.
5. **Very clean:** one hero per screen (a giant numeral, a monogram or an image — one of them), then ruled sections. No gradients, no shadows, no blur, no second accent.

`check:pulse` (the build) bans every construct of the old boxed look; `check:tokens` bans a raw value outside `tokens.css`; `check:type-scale` holds the ramp below.

## 2. Tokens (`tokens.css`; `P` in the Figma kit)

### 2.1 Palette

| Kit | Token (utility) | Use |
|---|---|---|
| `bg` | `--surface-0` (`bg-surface-0`) | the canvas, everywhere; every image is graded to it |
| `s2` | `--surface-2` | bottom sheet · skeleton block · disabled pill. Nothing else |
| `s3` | `--surface-3` | switch track (off) only |
| `s1` | `--surface-1` | reserved — do not use (`check:pulse` bans it) |
| `t1` | `--text-1` | primary text, numerals, glyphs, neutral selection mark |
| `t2` | `--text-2` | secondary text, eyebrows, inactive tab labels, utility glyphs |
| `t3` | `--text-3` | hints, placeholders, pending numerals ("/4"), chevrons. Never on `--surface-3` |
| `accent` | `--accent` | the lamp (rule 3) |
| `accentDown` | `--accent-pressed` | pressed primary pill |
| `onAccent` | `--accent-fg` | text and knob on lime |
| `edge` | `--edge` | the edge of anything you type into or tick: field underline, empty set-check ring |
| `hair` | `--surface-border` (`border-hair`) | rule between rows; disabled field underline |
| `hairS` | `--surface-border-strong` (`border-hair-strong`) | rule that opens a section / closes a table; sheet edge |
| `track` | `--track` | "off" level: meter track, blank day, locked segment |
| `danger` | `--danger` | THE one danger colour: destructive text, field error, failed-save dot |
| `warn` | `--warning` | over-target macro (value + bar), offline dot |
| `ok` | `--success` | "saved" dot. Accent is never success |
| scrim | `--scrim` | under a bottom sheet |

All three text tiers pass WCAG AA on the canvas and on the sheet (the ratios are recorded beside each token in `tokens.css`). Rules and tracks are decoration (below the 3 : 1 of a control on purpose) and never the only carrier of a state. Semantic colours appear only as a status dot, as text, as a field's error underline or as an over-target value + bar — never as a filled surface, never glowing. Pulse is dark-only.

**Light levels** (one grammar for every state): lit = `--accent` (done · selected · live) · pending = half-tone `--text-1` segment / `--text-3` numeral (planned) · off = `--track` · ink = `--text-1` (data, neutral selection). No state is carried by hue alone: each level also differs in tone or shape.

### 2.2 Type — 16 roles (`text-<role>` utilities; `TY` in the kit)

| Role (utility) | Family · style | Use |
|---|---|---|
| `text-giant` | Big Shoulders Display · Black | the ONE hero numeral of a screen; digits, "/" and ":" only; capped by `--giant-fluid` on narrow phones |
| `text-num` | Big Shoulders Display · Black | ledger and stat numerals (190, 4/7, 83,1) |
| `text-display-xl` | Big Shoulders Display · Bold · UPPER | the screen's subject line (today's session). Max one per screen |
| `text-display` | Big Shoulders Display · Bold · UPPER | screen title (h1), empty-state title, in-page heading |
| `text-eyebrow` | Big Shoulders Display · Bold · UPPER | section labels, ledger labels, back-link parent; colour `--text-2` |
| `text-title` | Geist · SemiBold | greeting, person name, sheet title |
| `text-body` / `-body-m` / `-body-b` | Geist · Regular / Medium / SemiBold | body, input text / row titles, chips, standalone links / primary-pill label |
| `text-cap` / `-cap-m` | Geist · Regular / Medium | meta, hints, units, macro names / field labels, inline links, notices |
| `text-tab` / `-tab-on` | Geist · Medium / SemiBold | tab labels; `tab-on` also the badge figure |
| `text-data-l` | Geist Mono · Medium | inline figures (macro values) |
| `text-data` | Geist Mono · Medium | meta with figures ("18:00 · 5 gyakorlat"), weekday letters, counts, trailing values that contain a digit |
| `text-micro` | Geist Mono · Medium · UPPER | tags ("TAG", "EN"), time stamps, board labels |

Size, line height, weight and tracking of each role are declared once in `tokens.css` (`--text-<role>` and its `--line-height` / `--font-weight` / `--letter-spacing`); `check:type-scale` holds these 16 steps and nothing else. Rules: display-face words are always UPPER, Geist is sentence case, exact Hungarian strings from `feature-inventory.md` / `hu.json`. Nothing below the `micro` / `tab` step; body copy never below `cap`; input text is `body` (WebKit zoom). No size between the steps. Mono is for figures and codes; a trailing value made of words uses `cap`. Selection never changes weight except the active tab label (cells are fixed, nothing shifts). Never SF Pro; Inter exists only in the Figma status-bar clock. The monogram is component-local (Black, sized by `--mono-sm` / `--mono-md` / `--mono-lg`). The display face has no tabular figures: a number that changes on screen in it gets fixed-width digit cells from `Numeral`.

### 2.3 Spacing, radii, glow

- **One grid:** Tailwind's `--spacing` is the 4 pt grid of record; its three named steps are `--spacing-tight` (inside one group), `--spacing-group` (between peers; rule → eyebrow → content) and `--spacing-section` (between blocks). A larger step only before a screen's last block if it needs air.
- **Gutter:** one side gutter on the frames' left and right edges (narrower below the small-phone breakpoint, see §3); trailing glyphs and values end on the right edge by ink.
- **Vertical rhythm:** between blocks `section` · rule → eyebrow `group` · eyebrow → content `group` · eyebrow → big numeral `tight` · title → subtitle and number → unit one grid step · keep the glow of the primary pill clear of other content · chips a fixed word gap apart · list rows hug: `--row-h`, `--row-h-sub` with a sub line, `--row-h-ledger` for a ledger row.
- **Touch:** every target ≥ `--target-min` square (bare glyphs and links sit in a hit frame of that size).
- **Radii — only where a shape exists:** primary pill, switch and badge full (`--radius-full`) · bottom-sheet top `--radius-sheet` · bars and segments `--radius-bar` · skeleton and user photos `--radius-1`. Images, thumbs, rows, fields: none (`check:pulse` bans every other radius).
- **Glow** (`--shadow-glow`): on the idle primary pill only, breathing on `animate-pulse-rest`. No other shadow, blur or elevation anywhere.
- **Bottom fade:** `--nav-fade` over `--fade-h` under the tab bar; the docked action's `--dock-fade`.

### 2.4 Motion

Durations `--duration-instant` · `-fast` · `-base` · `-slow` · `-ambient` (and `--duration-toast` for the toast's stay), easing `--ease-standard` (`--ease-linear` for loops). Transform and opacity only.

| Motion | Spec |
|---|---|
| Press | pill → `--accent-pressed`, glow off, a slight scale-down in `instant`; rows and links → `--pressed-opacity` |
| Ignite (select chip / tab / check / switch / segment done) | mark or fill 0 → 100 % in `fast`; previous selection fades in `fast`; nothing slides |
| Count-up (hero numeral, bars) | only when the value changed: digits roll in `slow`, segments fill left → right in `fast` each with a short stagger, bars grow in `base` |
| Resting pulse | idle primary pill: glow opacity breathes on `ambient` alternate after `--delay-rest`; max one loop per screen |
| Lights-on (route) | hero image fades up from black in `slow`; content rises a grid step with a `base` fade, max 4 staggered items |
| Sheet | rises in `slow`, scrim fades in `base`; closes in `base` |
| Toast | drops from the status zone in `base`, stays `--duration-toast`, leaves in `fast` |
| Skeleton | sheen on `ambient` (`animate-sheen`); never a spinner |

`prefers-reduced-motion`: state changes stay, travel and loops go (the backstop in `src/index.css`, held by `check:pulse`).

## 3. Layout grammar (drawn on the 402 pt iPhone 17 Pro frame)

| Zone | Where | Notes |
|---|---|---|
| Status bar | the top inset (`--safe-t`) | Only the toast band (`--band-pad-t`) may enter |
| Header, root screen | from `--head-top-root` | the greeting header (Home only) or one `display` title |
| Header, pushed screen | from `--head-top-push` | back row (chevron + parent eyebrow), then the `display` title |
| First block | under the header | then blocks `--spacing-section` apart |
| Bottom fade | `--fade-h` above the bottom | under the tab bar |
| Tab bar | `--nav-h` high, `--tabbar-offset` above the bottom inset | no capsule, no surface |
| Docked action | `--dock-b` with tabs · `--dock-b-bare` without | adds its own fade |
| Home indicator | the bottom inset (`--safe-b`) | — |

The frames' exact positions per screen are in the geometry export; the app's are the tokens above, so a screen never spells an offset of its own.

- **Header patterns:** root + greeting (Home only) · root + big title (one `display` line + ONE optional trailing icon button) · pushed (back chevron + parent name as eyebrow, then the `display` title; the tab bar stays, the owning tab stays lit) · modal = bottom sheet (title + close). No top app bar, no centred title, no hamburger.
- **Section** = strong rule → eyebrow (+ one trailing meta or link on the same baseline) → content. The hero block directly under the header has no rule.
- **How much fits:** below a root header, a hero + two sections (the Home) or one section head + about eight list rows with the next one cut. If you need more, it scrolls; do not shrink type or gaps.
- **The fold:** content either ends clear above the fade or runs under it. The fade may cut a row or a control, never a label standing alone; a scrolling list always shows a cut row (the scroll cue).
- **Screens without tabs** (login, register, public marketplace, multi-step flows): no tab bar; the primary action is docked bare.
- **Full-bleed:** a chip row or a hero image may run past the right edge and is cut by the screen edge; nothing runs past the gutter on the left.
- **Widths:** 360 – 430 supported, drawn at 402; a narrower gutter on the smallest phones; above `--screen-max` a screen without a desktop layout is a centred column; `giant` follows `--giant-fluid`.

## 4. Components (app component · kit function → anatomy → states)

| Component | Kit | Anatomy | States |
|---|---|---|---|
| Tab bar | `tabBar` (via `chrome`) | equal cells across the bar inset by tab count (`--tabbar-inset-5` / `-6` / `-7`); image icon `--tab-icon` (`--tab-icon-dense` with seven tabs) over a `tab` label; the whole cell is the target, every cell ≥ `--target-min` | inactive: steel icon + `--text-2` Medium · active: lime-lit icon + `--text-1` SemiBold · pressed: icon at `--pressed-opacity`. No badges on tabs. All seven icons (incl. the whistle "Edző" and the shield "Admin") are rendered stills |
| Primary pill | `btnPrimary` | `--control-h-primary` high (sm: `--control-h`), full radius, content width or docked; label `body-b` on `--accent-fg` | default: accent + glow · pressed: `--accent-pressed`, no glow · disabled: `--surface-2` fill, `--text-3` label · busy: three dots, no glow |
| Secondary action | `textLink` | bare text in a target-size frame; `cap-m` + chevron in a section head, `body-m` standalone, on the left edge | default `--text-1` · off `--disabled-opacity` · pressed `--pressed-opacity` |
| Destructive action | `textLink({ danger })`, `listRow({ color: P.danger })` | danger text only — never a red fill | always confirmed in a bottom sheet (confirm = danger text, cancel = `--text-1` text, no lime pill in that sheet) |
| Icon button | `iconBtn` | bare `--icon-lg` glyph in a target-size frame; lime count badge top-right | with / without badge (1 – 99, 99+) |
| Filter chips | `chipRow` | words a word-gap apart, target height, `body-m`; the row bleeds off the right edge | idle `--text-2` · selected `--text-1` + `--mark-h` lime mark under the word · multi-select wraps |
| Segmented switch | `segSwitch` | same words; hug (in a section head) or equal cells on a hairline (page-level tabs) | selected `--text-1` + `--mark-h` INK mark (neutral: it changes the view, not the subject) |
| Underline field | `inputField` | label `cap-m --text-2` · target-height input, `body` text · 1 px `--edge` underline · hint `cap --text-3` under it | idle · focus: 2 px lime underline + lime caret · error: 2 px danger underline, hint in danger · disabled: `--text-3` text, hairline · empty: placeholder `--text-3` |
| Search field | `searchField` | field without label, search glyph `--icon-md` `--text-2`, placeholder | empty · focus · filled + clear |
| Switch | `uiSwitch` | `--switch-w` × `--switch-h`, knob `--switch-knob` — the one control that is a shape | on: accent + dark knob · off: `--surface-3` + `--text-2` knob · disabled `--disabled-opacity` (its hint is the row's sub line) |
| Set check | `setCheck` | target-size frame | to do: a ring in `--edge` · done: bare lime tick. Also the radio mark of a single-choice list |
| List row | `listRow` + `rowStack` | title `body-m` (1 line, 2 with `lines`), sub `cap --text-2`; lead slot `--thumb` = glow thumb or `--mono-sm` monogram or glyph; trailing value / node / chevron (ink on the right edge); hairline between rows | plain · sub · thumb · monogram · value · two-line · destructive · with switch / check / tag · pressed · skeleton |
| Ledger row | `ledgerRow` | `--row-h-ledger` high, ONE baseline: eyebrow label · note · `num` value ink-right (+ unit) · chevron | value · fraction · unit + sparkline · failed = "—" (never 0) |
| Big numeral | `statBlock` + `numeral` / `fraction` | eyebrow → `tight` → ink-tight numeral on the gutter (`--trim-display-*`) → caption | `giant` (one per screen) · `num`; denominator in `--text-3` |
| Week / segment bar | `segBar` | 7 (or n) square-ended `--seg-h` segments, optional mono labels | on (lime) · half (half-tone `--text-1`) · off (`--track`) · today: label `--text-1` + dot |
| Macro columns | `macroCol` | 4 across: name · mono value + unit · `--bar-h` bar · target | on target · over (`--warning` value + bar) · no target (no bar) |
| Progress bar | `progressBar` | `--bar-h`, `--track` + `--text-1` fill | 0 – 100 %; lime only if it is the screen's live datum |
| Sparkline / chart | `sparkline` | a thin line with an end dot; no area, no grid, no box. Chart = same at full width + hairline axes + mono labels | series · gap (dotted) · live end dot (lime) |
| Monogram | `monogramMark` | Big Shoulders Black initials, ink-tight. The product has NO profile photos and no avatar discs | `--mono-sm` (rows) · `--mono-md` (headers) · `--mono-lg` hero with the light texture + lime dot (one per screen) |
| Badge / tag | `badgeCount` · `tx(s, 'micro', P.t2)` | lime count (`--badge-h`) on the bell only · a tag is plain mono caps, no outline | hidden at 0 · 1 – 99 · 99+ |
| Empty / error state | `emptyState` | left-aligned: `display` title, `body --text-2`, then the pill (if it is the screen's one action) or a link | empty · error ("Újra") |
| Skeleton | `skel` | `--skeleton-base` blocks, `--radius-1`, in place of each text line; numerals = one block at cap height; images are withheld | — |
| Status line / toast | `noticeLine` · `showToast` | `--dot` semantic dot + `cap-m` (+ trailing link). Toast = the page's own black dropping over the header zone with one line and a rule: no capsule | `--danger` · `--warning` · `--success` · ink. In flow it is the inline error / offline strip. No celebration toasts |
| Bottom sheet | `bottomSheet` | THE one surface: `--sheet-bg`, top `--sheet-radius`, hairline edge, on `--scrim`; grabber (`--grabber`), title + close, body `group` apart. Pickers and confirmations are sheets — no centred dialogs | — |
| Chat | `chatMsg` | no bubbles — a bubble is a card. The edge says who speaks (theirs left, mine right, a capped measure) and the tone says whose (theirs `--text-1`, mine `--text-2`); tight within a group, wider between, one mono stamp per group. Composer = underline field + small primary pill | in · out · with time |
| Flow progress | `stepper` | n `--bar-h` segments, the first `cur` lit, + mono "cur / n" | — |

Recipes without a kit function: number stepper = icon button (minus) · numeral · icon button (plus) · live marker = a `--dot` lime dot before the title · section status = trailing `cap` text in the section head ("Felszerelés mentve").

## 5. Imagery

- **Two families only.** (a) Graphite / bead-blasted steel CG objects on pure black: tab icons, coin, equipment, the mannequin. (b) Low-key black-and-white photography on true black: the Home fist (`hero-grip`). No colour photography, no illustration, no line-icon as a main visual, no stock-photo rectangles.
- **How an image sits:** a true-black-edged still set to LIGHTEN (`Pic`), so no rectangle shows; it bleeds off the right or top edge or floats in black. No frame, radius, border, scrim or caption box; no parent up to the screen may have a fill. Transparent cutouts (icons, coin) are drawn as they are.
- **Text never sits on a lit area.** Keep a clear band of black between ink and the lit part of an image.
- **At most one hero image per screen**, to the right of or above the hero text, never behind it. A screen whose hero is a numeral or a monogram needs none.
- **Thumbnails** (`--thumb`, in a list row's lead slot) are keyed by equipment or exercise type — the catalogue has no per-exercise media. In a mixed list every row keeps the same text edge (the slot stays, empty). A text-only list is always acceptable; a grey placeholder square is not.
- **The mannequin** is the body motif and the only image that is also an interface: the selected muscle is the lamp. It may appear on the muscle selector (large), exercise detail and workout player (small, read-only: primary lit, secondary `--muscle-secondary`) and as a crop on a library entry row. Nowhere as decoration. Front and back renders share one canvas, so the lit variants swap without moving.
- **User photos** (progress photos, a marketplace cover) are the only non-generated images: plain rectangles, `--radius-1`, no border, shown desaturated in lists and feeds.
- The 49 stills and their manifest ship through the asset pipeline (`frontend/src/assets/pulse`, `check:assets`).

## 6. Do / Don't

| Do | Don't |
|---|---|
| Open a section with `sect()` — rule, eyebrow, content | Wrap the section in a filled or stroked frame "to group it" |
| Put a stat in a `ledgerRow` or a `statBlock` | Build a 2 × 2 grid of stat tiles |
| One `btnPrimary`; the second action is a `textLink` | Two pills, an outlined "ghost" button, a lime icon button |
| Filter with words: `chipRow(['Mell', 'Elülső vállizom'], 0)` | Pills with a fill or an outline around each chip |
| `inputField` with an underline | A rounded input box, a search capsule |
| `monogramMark('KP')` | A circle with initials, a grey avatar placeholder |
| `pic('hero-grip', 216, 180)` on LIGHTEN | An image in a rounded rectangle, a gradient scrim with text over it |
| Empty state: left-aligned title + line + action | A centred illustration in a dashed box with a grey icon disc |
| Confirm a destructive action in a `bottomSheet` | A centred alert card, a red filled button |
| Show state with the light levels (lime / half / off) | Coloured status chips, green "success" banners |

**The five ways a builder slides back into generic cards — check your screenshot for each:**
1. *"These three things belong together, so I'll put a surface behind them."* → `AL(.., { fill: P.s1 })`, a radius, a stroke. Grouping is a rule above and 32 pt below. `s1` is not a token you may use.
2. *"A list item needs a tile."* → rows with their own background, radius and padding, 8 pt apart. Rows are `listRow` on the gutter, divided by hairlines (`rowStack`).
3. *"Dashboards are grids of KPI tiles."* → coach and admin screens with boxed numbers. Use ledger rows: label | note | numeral on one baseline, or one `giant` + a segment bar.
4. *"A control needs a container."* → outlined chips, boxed inputs, a segmented capsule, an icon in a circle, a thumbnail in a rounded square. Every one of them has a boxless kit function.
5. *"An overlay or a message is a floating card."* → centred modal, toast capsule, tooltip bubble, chat bubbles, banner with a tinted background. Sheets, the toast band, `noticeLine` and `chatMsg` cover all of them.

Also wrong: lime headings or links · more than one glowing thing · a hero numeral AND a hero image AND a monogram on one screen · `t3` for anything the user must read to act · mono for sentences · centred layouts (the system is left-aligned) · invented features, badges on tabs, profile photos.

**From the old boxed muscle selector to Open Field:** search capsule → `iconBtn('search')` in the header or a `searchField` line · chip pills → `chipRow` · "Elöl / Hátul" capsule → `segSwitch` (hug) as the trailing node of the "Izomcsoport" section head · framed thumbnails → 48 pt glow thumbs or text-only rows · count row → section head with a trailing `textLink('Szűrők törlése', { lead: 'x' })` · tab capsule with a lime pill → `tabBar`.

## 7. The kit API (`app-kit.js`)

Skeleton of every script (re-runnable: `scaffold` removes the previous frame of the same name; `guarded` removes a half-built one):

```js
/* app-kit.js pasted verbatim */
const page = await figma.getNodeByIdAsync('70:3'); await figma.setCurrentPageAsync(page);
const out = await guarded(async () => {
  const [root, content] = scaffold('Tag · Haladás', 0, 0);               // pushed screen: { top: 64 }
  add(content, await screenHead('root', 'Haladás'), { fillW: true });
  const s = await sect(content, 'Testsúly');                              // add blocks to `content`, rows to `s`
  add(s, rowStack([await ledgerRow('Testsúly', null, '83,1', { unit: 'kg' })], { close: true }), { fillW: true });
  await chrome(root, 'progress');                                         // LAST; then dockAction / bottomSheet
  return root;
});
await out.screenshot({ scale: 1 });
return { rootId: out.id };
```

Order of the overlays: content → `showToast` → `chrome` → `dockAction` → `bottomSheet`. Dry run before spending a Figma call: `node build/pulse/dry-run.js <script.js>` executes a script (with the kit pasted in) against a mock of the plugin API and catches JavaScript errors and helper misuse (not layout). Facts that bite: kit names are reserved (never `const listRow = …`) · `add()` returns the child, `appendChild` returns nothing · frames do NOT clip unless `clip: true` · `abs` works only in an auto-layout parent, `at` only in a `plain` frame · children fill only via `add(.., { fillW: true })` · `numeral`, `fraction`, `monogramMark`, `put`, `secHead` measure rendered ink, so call them inside the script that draws them · colours are `#RRGGBB`.

**Primitives**

| Signature | Example |
|---|---|
| `AL(dir, o)` → auto-layout frame; `o`: name gap pad fill radius smooth align justify stroke strokeW clip effects wrap rowGap w h opacity | `AL('V', { name: 'Workout', gap: 4 })` |
| `add(parent, child, o)` → child; `o`: fillW fillH lines abs+pin at | `add(block, await btnPrimary('Indítás'), { fillW: true })` |
| `tx(str, role, color = P.t1, o)` → text in a ramp role | `await tx('Felsőtest – húzás', 'displayXL')` |
| `T(str, o)` → raw text (family style size lh ls color upper align w name) | only when no role fits (the status-bar clock) |
| `rect(w, h, o)` · `oval(w, h, o)`; `o`: fill radius stroke strokeW effects opacity name | `oval(6, 6, { fill: P.accent, name: 'Live dot' })` |
| `plain(name, w, h)` → non-auto-layout transparent frame | `add(plain('Stage', 354, 200), node, { at: [0, 12] })` |
| `size(frame, w, h)` → fix one or both axes (undefined = hug) | `size(row, P.cw)` |
| `solid(hex, opacity)` · `lin(deg, stops)` · `img(hash, mode)` · `shadow(y, blur, alpha, color, spread)` · `paints(x)` · `hex(h)` | `rect(402, 80, { fill: lin(90, [[P.bg, 0, 0], [P.bg, 1, 1]]) })` |
| `glyph(key / svg, size = 20, color = P.t2, sw = 1.75)`; keys in `IC`: chev back down x check search plus minus bell | `IC.send = '<path d="…"/>'; glyph('send', 20, P.t1)` |
| `pic(slot / hash, w, h, fit)` → image; default LIGHTEN glow, `fit` = transparent cutout | `pic('hero-grip', 216, 180)` · `pic('coin', 22, 22, true)` |
| `guarded(fn)` → runs the build; on error removes what the script created | see the skeleton |
| `mk(node)` → register a node you created with a raw `figma.create*()` | `mk(figma.createNodeFromSvg(svg))` |
| `met(role)` → `{ top, base }` of a role's line box · `put(parent, text, role, { base, left / right })` · `inkX(node)` → `[l, r]` | `await put(row, await tx('kg', 'cap', P.t2), 'cap', { right: 334, base: 57 })` |
| `P` tokens · `TY` ramp · `IC` glyph paths · `TABS` labels · `ctr` · `pinB` · `pinT` | `P.img['hero-bowl'] = '92af9300c31724beb22e56938e7fa0b03d4bf023'` |

**Structure**

| Signature | Example |
|---|---|
| `scaffold(name, x, y, o)` → `[root, content]`; `o`: h, top (72 · 64), gap (32) | `const [root, content] = scaffold('Tag · Profil', 502, 0)` |
| `screenHead(kind, title, o)`; kind `'greet' / 'root' / 'push'`; `o`: sub, parent, trail | `await screenHead('push', 'Fekvenyomás', { parent: 'Gyakorlatok' })` |
| `sect(parent, label, o)` → column; `o`: tr, role (of a text `tr`), rule, gap | `const s = await sect(content, 'Mai edzés', { tr: meta, role: 'data' })` |
| `secHead(label, tr, role)` → eyebrow + trailing on one baseline | `await secHead('Táplálkozás', await textLink('Megnyitás', { trail: 'chev' }))` |
| `rule(strong, w = 354)` | `add(s, rule(true), { fillW: true })` |
| `rowStack(rows, o)`; `o`: open, close, name | `rowStack([r1, r2, r3], { open: true, close: true })` |
| `chrome(root, key, role)` → tab bar; key `home training nutrition progress coach admin profile` or `null`; role `'member' / 'coach' / 'admin'` | `await chrome(root, 'coach', 'coach')` |
| `tabBar(root, key, role)` (called by `chrome`) | — |
| `dockAction(root, node, tabs = true)` | `dockAction(root, await btnPrimary('Tovább'), false)` |

**Actions, selection, input**

| Signature | Example |
|---|---|
| `btnPrimary(label, o)`; `o.state 'pressed' / 'disabled' / 'busy'`, `o.sm` | `await btnPrimary('Mentés', { state: 'busy' })` |
| `textLink(label, o)`; `o`: lead, trail, danger, role, off | `await textLink('Kijelentkezés', { danger: true, role: 'bodyM' })` |
| `iconBtn(key, count)` · `badgeCount(n)` | `await iconBtn('bell', 2)` |
| `chipRow(labels, sel, o)`; sel = index or indexes; `o`: wrap + w, fill + w, ink | `await chipRow(['Rúd', 'Gép', 'Pad'], [0, 2], { wrap: true, w: P.cw })` |
| `segSwitch(labels, sel, w)` | `await segSwitch(['Elöl', 'Hátul'], 0)` · `await segSwitch(['Bolt', 'Eredmények'], 0, P.cw)` |
| `inputField(label, o)`; `o`: value, ph, hint, state `'focus' / 'error' / 'disabled'`, lead, trail, w | `await inputField('E-mail', { value: 'a@b', state: 'error', hint: '…' })` |
| `searchField(ph, o)` | `await searchField('Gyakorlat neve…')` |
| `uiSwitch(on, disabled)` · `setCheck(done)` | `await listRow('Sípszó', { trail: uiSwitch(true) })` |

**Rows and data**

| Signature | Example |
|---|---|
| `listRow(title, o)`; `o`: sub, lines, thumb, mono, lead, value, trail, chev, color | `await listRow('Kovács Péter', { sub: 'Erőemelő csapat', mono: 'KP', value: '5 perce' })` |
| `ledgerRow(label, note, value, o)`; value = string or node; `o`: unit, chev | `await ledgerRow('Eredmények', 'feloldva', await fraction('4', '7'))` |
| `numeral(str, role = 'num', color)` · `fraction(a, b, role = 'num', gap = 6, ca, cb)` | `await fraction('2', '4', 'giant', 12)` |
| `statBlock(label, node, caption)` | `await statBlock('Heti edzés', await fraction('2', '4', 'giant', 12))` |
| `segBar(segs, o)`; segs `[[state, label?, isToday?]]`, state `'on' / 'half' / 'off'`; `o`: w, h, gap, name | `await segBar([['on', 'H'], ['half', 'P', true], ['off', 'V']])` |
| `stepper(cur, n)` | `await stepper(2, 5)` |
| `progressBar(pct, w, color)` | `progressBar(0.62, P.cw)` |
| `macroCol(row, name, value, unit, pct, caption, w = 76.5)` — adds itself to `row` | `await macroCol(row, 'Fehérje', '128', 'g', 128 / 180, 'cél 180 g')` |
| `sparkline(vals, w = 140, h = 32, o)`; null = gap; `o`: color, dot | `sparkline([88.4, 87.9, null, null, 84.1, 83.1], P.cw, 96, { color: P.t1, dot: P.accent })` |
| `monogramMark(str, size = 28, o)`; `o`: dot, light, color | `await monogramMark('TD', 176, { dot: true, light: true })` |

**States and overlays**

| Signature | Example |
|---|---|
| `emptyState(title, body, action)` | `await emptyState('Nincs találat', 'Próbálj más keresőszót vagy szűrőt.', await textLink('Szűrők törlése', { role: 'bodyM' }))` |
| `skel(w, h = 16)` | `add(col, skel(220))` |
| `noticeLine(msg, kind, action)`; kind `'danger' / 'warn' / 'ok'` | `await noticeLine('Nincs internetkapcsolat · 3 művelet vár feltöltésre', 'warn')` |
| `showToast(root, msg, kind, action)` — before `chrome` | `await showToast(root, 'Felszerelés mentve', 'ok')` |
| `bottomSheet(root, title, nodes)` — after `chrome` | `await bottomSheet(root, 'Kijelentkezés', [await tx('Biztosan kijelentkezel?', 'body', P.t2), await textLink('Kijelentkezés', { danger: true, role: 'bodyM' })])` |
| `chatMsg(text, mine, time)` | `await chatMsg('Rendben, átteszem.', true, '14:05')` |

## Appendix — what changed against the V1 scripts, and what did not

Deliberate token fixes against the first V1 scripts (visible on "Reference — Home" only as shifts of a few points): the pill label is `body-b`, the plan line and the e-mail are `body`, the weekday letters are `data`, numerals are placed by ink under the eyebrow, tab cells are equal, the field underline is `--edge` instead of a fainter white, and the retired roles of those scripts (a second `num` size, `displayL`, `label`, `dataS`, `headline`, a smaller `body`) do not exist.
Not applied — owner decisions kept the approved look: Geist Mono stays · the fist photograph and the textured monogram stay · the mannequin stays as rendered · "Edzés" opens the player (and the library when no session runs, D2) · no finish-workout action (D3, its own package) · the rules and the off level keep their tones.
