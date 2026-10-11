---
type: design-system
title: Pulse V1 “Open Field” — the system
updated: 2026-10-11
tags: [ux, design-system, pulse]
---

> [!important] Design values live here until the code catches up
> Pulse is not implemented yet, so its tokens have no `tokens.css` to live in. The values below are the specification the implementation starts from; once a Pulse block exists in `frontend/src/ui/tokens/tokens.css`, the code becomes the source and this note must stop carrying numbers.
> File paths below (`build/pulse/…`, `shots/…`) refer to the Figma build archive at `C:\Users\Petike\Documents\TRACKER-mockups\5-pulse`.

# PULSE V1 "OPEN FIELD" — the system

Operational spec for every screen builder and for the developers. The approved look is `shots/pulse/v1-home@2x.png` + `v1-profile@2x.png`; where this file and those two shots disagree, the shots win.
Kit: `build/pulse/app-kit.js` (paste verbatim, 29.8 k chars → about 20 k left for a screen body; if the workflow hands you `build/pulse/loader.js`, paste that instead — it loads this same kit from the file and exposes the same names). Worked example: `build/pulse/app-home.js`. Reference in Figma (file `SkWidL9kDDWhBip7cUCFtr`, page `70:2`): "Pulse — Components" (`80:2`, x 0, every component in every state) and "Reference — Home" (`78:2`, x 1500).

## 1. The idea

A black room in which things light up. Near-black canvas, one acid-lime lamp, giant condensed numerals, graphite renders and low-key black-and-white photographs glowing out of the dark.
Nothing is enclosed: structure = one left edge (x 24), one right edge (x 378), 1 px rules, eyebrows, large numerals, mono meta, and space.
Lime is light, not paint. A screen has ONE glowing lime pill (its primary action); every other lime mark is a small sign that something is live, selected or done.
"Nagyon letisztult": if an element is not content, a control or a rule, it does not exist.

**Non-negotiables**
1. **No boxes.** No card, tile, panel, capsule, outlined pill, input box, icon disc, avatar circle, framed thumbnail. The only surface in the product is the bottom sheet (§4).
2. **One lime action per screen**, the only filled lime shape on it (`btnPrimary`). A second action is text.
3. **Lime only for:** the primary action · a selected filter (2 pt mark) · live / done data (segment, tick, end dot, switch on, lit tab, badge). Never for decoration, headings, links, icons at rest. Only the primary pill glows.
4. **Images glow out of black with no frame** (§5). Text never sits on a lit area.
5. **Very clean:** one hero per screen (a giant numeral, a monogram or an image — one of them), then ruled sections. No gradients, no shadows, no blur, no second accent.

## 2. Tokens (`P` in the kit)

### 2.1 Palette

| Token | Value | Contrast on bg | Use |
|---|---|---|---|
| `bg` | `#0B0D0A` | — | the canvas, everywhere; every image is graded to it |
| `s2` | `#1E2219` | 1.21 | bottom sheet · skeleton block · disabled pill. Nothing else |
| `s3` | `#2A2F24` | 1.42 | switch track (off) only |
| `s1` | `#141712` | 1.08 | reserved — do not use |
| `t1` | `#F2F5EA` | 17.7 | primary text, numerals, glyphs, neutral selection mark |
| `t2` | `#A9B09D` | 8.7 (7.2 on s2) | secondary text, eyebrows, inactive tab labels, utility glyphs |
| `t3` | `#858C79` | 5.6 (4.6 on s2, 3.9 on s3) | hints, placeholders, pending numerals ("/4"), chevrons. Never on `s3` |
| `accent` | `#CBFF2E` | 16.6 | the lamp (rule 3) |
| `accentDown` | `#B4E61F` | — | pressed primary pill |
| `onAccent` | `#0B0D0A` | 16.6 on accent | text and knob on lime |
| `edge` | `#5E615B` (= t1 36 %) | 3.1 | the edge of anything you type into or tick: field underline, empty set-check ring |
| `hair` | white 8 % (`#1F201E`) | 1.19 | rule between rows; disabled field underline |
| `hairS` | white 14 % (`#2D2F2C`) | 1.44 | rule that opens a section / closes a table; sheet edge |
| `track` | white 10 % (`#232522`) | 1.26 | "off" level: meter track, blank day, locked segment |
| `danger` | `#F87171` | 7.1 (5.9 on s2) | THE one danger colour: destructive text, field error, failed-save dot |
| `warn` | `#FBBF24` | 11.7 | over-target macro (value + bar), offline dot |
| `ok` | `#34D399` | 10.2 | "saved" dot. Accent is never success |
| scrim | black 60 % | — | under a bottom sheet |

All three text tiers pass 4.5 : 1 on `bg` and on `s2`; no text token had to change. Rules and tracks are decoration (below 3 : 1 on purpose) and never the only carrier of a state. Semantic colours appear only as a 6 pt dot, as text, as a 2 px field underline or as an over-target value + bar — never as a filled surface, never glowing. Pulse is dark-only.

**Light levels** (one grammar for every state): lit = `accent` (done · selected · live) · pending = `t1` 50 % segment / `t3` numeral (planned) · off = `track` · ink = `t1` (data, neutral selection). No state is carried by hue alone: each level also differs in tone or shape.

### 2.2 Type — 7 sizes, 16 roles (`TY`, set with `tx(str, role, colour)`)

| Role | Family · style | Size / LH | Track | Use |
|---|---|---|---|---|
| `giant` | Big Shoulders Display · Black | 124 / 108 | −1 % | the ONE hero numeral of a screen; digits, "/" and ":" only |
| `num` | Big Shoulders Display · Black | 48 / 48 | 0 | ledger and stat numerals (190, 4/7, 83,1) |
| `displayXL` | Big Shoulders Display · Bold · UPPER | 48 / 48 | +1 % | the screen's subject line (today's session). Max one per screen |
| `display` | Big Shoulders Display · Bold · UPPER | 32 / 34 | +1 % | screen title (h1), empty-state title, in-page heading |
| `eyebrow` | Big Shoulders Display · Bold · UPPER | 16 / 20 | +6 % | section labels, ledger labels, back-link parent; colour `t2` |
| `title` | Geist · SemiBold | 22 / 28 | −1 % | greeting, person name, sheet title |
| `body` / `bodyM` / `bodyB` | Geist · Regular / Medium / SemiBold | 16 / 22 | 0 | body, input text / row titles, chips, standalone links / primary-pill label |
| `cap` / `capM` | Geist · Regular / Medium | 13 / 18 | 0 | meta, hints, units, macro names / field labels, inline links, notices |
| `tab` / `tabOn` | Geist · Medium / SemiBold | 11 / 14 | +1 % | tab labels; `tabOn` also the badge figure |
| `dataL` | Geist Mono · Medium | 16 / 20 | −1 % | inline figures (macro values) |
| `data` | Geist Mono · Medium | 13 / 18 | 0 | meta with figures ("18:00 · 5 gyakorlat"), weekday letters, counts, trailing values that contain a digit |
| `micro` | Geist Mono · Medium · UPPER | 11 / 16 | +10 % | tags ("TAG", "EN"), time stamps, board labels |

Rules: display-face words are always UPPER, Geist is sentence case, exact Hungarian strings from `feature-inventory.md` / `hu.json`. Nothing under 11 pt; body copy never under 13; input text is 16 (WebKit zoom). No size between the steps. Mono is for figures and codes; a trailing value made of words uses `cap`. Selection never changes weight except the active tab label (cells are fixed, nothing shifts). Never SF Pro (does not render in this file); Inter exists only in the status-bar clock. The monogram is component-local (Black, any size).

### 2.3 Spacing, radii, glow

- **Grid 4 pt.** Scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 (· 48 only before a screen's last block if it needs air).
- **Gutter 24** → content width 354 (`P.cw`). Everything starts on x 24; trailing glyphs and values end on x 378 by ink.
- **Vertical rhythm:** between blocks **32** · rule → eyebrow **16** · eyebrow → content **16** · eyebrow → big numeral **8** · title → subtitle **4** · label → value **8** · number → unit **4** · content → primary pill **20** (keep ≥ 20 clear around the pill for its glow) · chips 24 apart · list rows hug: min 56, 64 with a sub line, 76 ledger.
- **Touch:** every target ≥ 44 × 44 (bare glyphs and links sit in 44 pt hit frames).
- **Radii — only where a shape exists:** primary pill 28 (full) · switch 14 (full) · badge 9 (full) · bottom-sheet top 28 · bars and segments 1 · skeleton 2 · user photos 2. Images, thumbs, rows, fields: none. Phone frame 52 (canvas only).
- **Glow** (`P.glow`): `0 0 20px accent 38 %` + `0 4px 10px -2px accent 30 %`, on the idle primary pill only. No other shadow, blur or elevation anywhere.
- **Bottom fade:** `bg` 0 → 100 % over the first 28 % of the last 130 pt, under the tab bar. Dock fade: same, 50 %.

### 2.4 Motion (developers; app tokens)

`instant` 100 ms · `fast` 150 · `base` 250 · `slow` 400 · `ambient` 1200 · easing `cubic-bezier(0.16, 1, 0.3, 1)`. Transform and opacity only.

| Motion | Spec |
|---|---|
| Press | pill → `accentDown`, glow off, scale 0.98 in `instant`; rows and links → opacity 0.6 |
| Ignite (select chip / tab / check / switch / segment done) | mark or fill 0 → 100 % in `fast`; previous selection fades in `fast`; nothing slides |
| Count-up (hero numeral, bars) | only when the value changed: digits roll in `slow`, segments fill left → right `fast` each with 60 ms stagger, bars grow in `base` |
| Resting pulse | idle primary pill: glow opacity 100 → 65 → 100 % on `ambient` alternate, starts after 1.5 s; max one loop per screen |
| Lights-on (route) | hero image fades up from black in `slow`; content rises 8 px with a `base` fade, max 4 staggered items |
| Sheet | rises in `slow`, scrim fades in `base`; closes in `base` |
| Toast | drops from the status zone in `base`, stays 4 s, leaves in `fast` |
| Skeleton | sheen on `ambient`; never a spinner |

`prefers-reduced-motion`: state changes stay, travel and loops go.

## 3. Layout grammar (402 × 874, iPhone 17 Pro)

| Zone | y | Notes |
|---|---|---|
| Status bar | 0 – 62 | Dynamic Island 126 × 37 at y 11. Only the toast band may enter |
| Header, root screen | 72 – 120 | `scaffold(..)` → content top 72; `screenHead('greet' / 'root')` is 48 high |
| Header, pushed screen | 64 – 146 | `scaffold(.., { top: 64 })`; back row 64 – 108 (chevron + parent eyebrow), display title 112 – 146 |
| First block | 152 (root) · 178 (pushed) | then blocks 32 apart |
| Bottom fade | 744 – 874 | solid from 780 |
| Tab bar | 782 – 838 | 56 high; no capsule, no surface |
| Docked action | 714 – 770 with tabs · 768 – 824 without | `dockAction` (adds its own fade) |
| Home indicator | 861 – 866 | 139 × 5 |

- **Header patterns:** root + greeting (`greet`: title 22 + date line; Home only) · root + big title (`root`: one `display` line + ONE optional trailing `iconBtn`) · pushed (`push`: back chevron + parent name as eyebrow, then the `display` title; the tab bar stays, the owning tab stays lit) · modal = `bottomSheet` (title 22 + close). No top app bar, no centred title, no hamburger.
- **Section** = `sect()`: strong rule → eyebrow (+ one trailing meta or link on the same baseline) → content. The hero block directly under the header has no rule (`{ rule: false }` or a `statBlock`).
- **How much fits:** below a root header there are 592 pt before the fade. That is a hero (≈ 190) + two sections (≈ 200 + ≈ 135) — the Home — or one section head + 8 list rows with the 9th cut. If you need more, it scrolls; do not shrink type or gaps.
- **The fold:** content either ends ≥ 24 pt above the fade (y ≤ 720) or runs under it. The fade may cut a row or a control, never a label standing alone; a scrolling list always shows a cut row (the scroll cue).
- **Long-scroll frame:** build the 874 viewport first; then the full page as a second frame `"<Screen> · scroll"` with `scaffold(name, x + 502, y, { h: contentEnd + 140 })` — `chrome` docks the tabs at its bottom.
- **Screens without tabs** (login, register, public marketplace, multi-step flows): `chrome(root, null)`; the primary action is docked with `dockAction(root, pill, false)`.
- **Full-bleed:** a chip row or a hero image may run past x 378 and is cut by the screen edge; nothing runs past x 24 on the left.
- **Widths** (developers): 360 – 430 supported, drawn at 402; gutter 16 below 376; `giant` = `min(124px, 31vw)`.

## 4. Components (kit function → anatomy → states)

| Component | Kit | Anatomy and metrics | States |
|---|---|---|---|
| Tab bar | `tabBar` (via `chrome`) | equal cells on 402 − 2 × inset; image icon 32 + 2 + label 11 pt; whole cell × 56 is the target. **5 tabs** inset 10 → 76.4 pt · **6** inset 12 → 63.0 · **7** inset 8 → 386 / 7 = **55.1 pt** with icon 28: widest label "Kezdőlap" measures 49 pt (3 pt air each side), tightest neighbours "Étkezés" 42 / "Haladás" 43 keep 12.6 pt between labels; every cell ≥ 44. At 360 pt a 7th cell is 49.1 — if it fails on a device, admin loses its tab (owner's call) | inactive: steel icon 100 % + `t2` Medium · active: lime-lit icon + `t1` SemiBold · pressed (dev): icon 60 %. No badges on tabs. all seven icons (incl. the whistle "Edző" and the shield "Admin") are in `P.img`; a missing `tab2-coach` / `tab2-admin` hash falls back to profile / progress |
| Primary pill | `btnPrimary` | 56 high (sm 44), full radius, content width or docked; label `bodyB` on `onAccent` | default: accent + glow · pressed: `accentDown`, no glow · disabled: `s2` fill, `t3` label · busy: three dots, no glow |
| Secondary action | `textLink` | bare text in a 44 pt frame; `capM` + chevron in a section head, `bodyM` standalone, on the left edge | default `t1` · off 40 % · pressed (dev) 60 % |
| Destructive action | `textLink({ danger })`, `listRow({ color: P.danger })` | danger text only — never a red fill | always confirmed in a bottom sheet (confirm = danger text, cancel = `t1` text, no lime pill in that sheet) |
| Icon button | `iconBtn` | bare 24 pt glyph (stroke 1.75) in 44 × 44; lime count badge top-right | with / without badge (1 – 99, 99+) |
| Filter chips | `chipRow` | words 24 apart, 44 high, `bodyM`; the row bleeds off the right edge | idle `t2` · selected `t1` + 2 pt lime mark under the word · multi-select wraps (`{ wrap, w }`) |
| Segmented switch | `segSwitch` | same words; hug (in a section head) or equal cells on a hairline (page-level tabs) | selected `t1` + 2 pt INK mark (neutral: it changes the view, not the subject) |
| Underline field | `inputField` | label `capM t2` · 44 pt input, text 16 · 1 px `edge` underline · hint `cap t3` 8 below | idle · focus: 2 px lime underline + lime caret · error: 2 px danger underline, hint in danger · disabled: `t3` text, hairline · empty: placeholder `t3` |
| Search field | `searchField` | field without label, search glyph 20 `t2`, placeholder | empty · focus · filled + clear (trail `glyph('x')`) |
| Switch | `uiSwitch` | 48 × 28 — the one control that is a shape | on: accent + dark knob · off: `s3` + `t2` knob · disabled 40 % (its hint is the row's sub line) |
| Set check | `setCheck` | 44 pt frame | to do: 24 pt ring in `edge` · done: bare lime tick. Also the radio mark of a single-choice list |
| List row | `listRow` + `rowStack` | title `bodyM` (1 line, 2 with `lines`), sub `cap t2`; lead slot 48 = glow thumb or 28 pt monogram or 20 pt glyph; trailing value / node / chevron (ink on the right edge); hairline between rows | plain · sub · thumb · monogram · value · two-line · destructive · with switch / check / tag · pressed (dev) 60 % · skeleton |
| Ledger row | `ledgerRow` | 76 high, ONE baseline at 57: eyebrow label x 0 · note x 112 · `num` value ink-right 334 (+ unit) · chevron | value · fraction · unit + sparkline · failed = "—" (never 0) |
| Big numeral | `statBlock` + `numeral` / `fraction` | eyebrow → 8 → ink-tight numeral on the gutter → caption | `giant` (one per screen) · `num`; denominator in `t3` |
| Week / segment bar | `segBar` | 7 (or n) square-ended 6 pt segments, 8 apart, optional mono labels | on (lime) · half (`t1` 50 %) · off (`track`) · today: label `t1` + 4 pt dot |
| Macro columns | `macroCol` | 4 across, 16 apart: name · mono value + unit · 4 pt bar · target | on target · over (`warn` value + bar) · no target (no bar) |
| Progress bar | `progressBar` | 4 pt, `track` + `t1` fill | 0 – 100 %; lime only if it is the screen's live datum |
| Sparkline / chart | `sparkline` | 1.5 px line, 3 pt end dot; no area, no grid, no box. Chart = same at full width + hairline axes + mono labels | series · gap (dotted) · live end dot (lime) |
| Monogram | `monogramMark` | Big Shoulders Black initials, ink-tight. The product has NO profile photos and no avatar discs | 28 (rows) · 64 (headers) · hero 176 with the light texture + lime dot (one per screen) |
| Badge / tag | `badgeCount` · `tx(s, 'micro', P.t2)` | lime count on the bell only · a tag is plain mono caps, no outline | hidden at 0 · 1 – 99 · 99+ |
| Empty / error state | `emptyState` | left-aligned: `display` title, `body t2`, then the pill (if it is the screen's one action) or a link | empty · error ("Újra") |
| Skeleton | `skel` | `s2` blocks, radius 2, in place of each text line (16 / 12 high); numerals = one block at cap height; images are withheld | — |
| Status line / toast | `noticeLine` · `showToast` | 6 pt semantic dot + `capM` (+ trailing link). Toast = the page's own black dropping over the header zone (0 – 120) with one line and a rule: no capsule | `danger` · `warn` · `ok` · ink. In flow it is the inline error / offline strip. No celebration toasts |
| Bottom sheet | `bottomSheet` | THE one surface: `s2`, top radius 28, hairline edge, on a 60 % scrim; grabber, title 22 + close, body 16 apart. Pickers and confirmations are sheets — no centred dialogs | — |
| Chat | `chatMsg` | no bubbles — a bubble is a card. The edge says who speaks (theirs left, mine right, max 280 wide) and the tone says whose (theirs `t1`, mine `t2`); 4 within a group, 20 between, one mono stamp per group. Composer = `inputField` + `btnPrimary({ sm })` | in · out · with time |
| Flow progress | `stepper` | n 4 pt segments, the first `cur` lit, + mono "cur / n" | — |

Recipes without a kit function: number stepper = `iconBtn('minus')` · `numeral` · `iconBtn('plus')` · live marker = a 6 pt lime dot before the title · section status = trailing `cap` text in the section head ("Felszerelés mentve").

## 5. Imagery

- **Two families only.** (a) Graphite / bead-blasted steel CG objects on pure black: tab icons, coin, equipment, the mannequin. (b) Low-key black-and-white photography on true black: the Home fist (`hero-grip`). No colour photography, no illustration, no line-icon as a main visual, no stock-photo rectangles.
- **How an image sits:** `pic(slot, w, h)` — a true-black-edged still set to LIGHTEN, so no rectangle shows; it bleeds off the right or top edge or floats in black. No frame, radius, border, scrim or caption box; no parent up to the screen may have a fill. Transparent cutouts (icons, coin) use `pic(slot, w, h, true)`.
- **Text never sits on a lit area.** Keep ≥ 12 pt of black between ink and the lit part of an image.
- **At most one hero image per screen**, to the right of or above the hero text, never behind it. A screen whose hero is a numeral or a monogram needs none.
- **Thumbnails** (48 pt, in a list row's lead slot) are keyed by equipment or exercise type — the catalogue has no per-exercise media. In a mixed list every row keeps the same text edge (the 48 pt slot stays, empty). A text-only list is always acceptable; a grey placeholder square is not.
- **The mannequin** is the body motif and the only image that is also an interface: the selected muscle is the lamp. It may appear on the muscle selector (large), exercise detail and workout player (small, read-only: primary 100 %, secondary 40 %) and as a crop on a library entry row. Nowhere as decoration. `muscle-figure-front` has the chest lit, `figure-back-pull` the back; the neutral and other lit variants are in `manifest-app.json` (one shared canvas, so they swap without moving).
- **User photos** (progress photos, a marketplace cover) are the only non-generated images: plain rectangles, radius 2, no border, shown desaturated in lists and feeds.
- Image hashes: `P.img` in the kit; more arrive in `assets/pulse/manifest-app.json` — paint them with `pic('<imageHash>', w, h)` or patch `P.img`.

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

Deliberate token fixes (all visible on "Reference — Home" only as 1 – 3.5 pt shifts): pill label 17 → 16 SemiBold · plan line / e-mail 15 → 16 · weekday letters mono 12 → 13 · number → unit 3 → 4 · numerals placed by ink (8 under the eyebrow) · tab cells equal (icons move ≤ 3 pt; "Kezdőlap" still starts on the gutter) · field underline white 24 % (2.1 : 1) → `edge` (3.1 : 1) · retired roles: `num` 64, `displayL` 36, `label` 14, `dataS` 12, `headline` 17, `body` 15.
Not applied — open owner decisions, the approved look stays: Geist Mono stays · the fist photograph and the textured monogram stay · the mannequin stays as rendered · "Edzés" opens the player · no finish-workout action · rules stay 8 / 14 % and the off level 10 %.
