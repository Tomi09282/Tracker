# TRACKER — Design System (Pulse V1 "Open Field")

The app has ONE look: **Pulse V1 "Open Field"** — a near-black room in which things light up. One
canvas, one acid-lime lamp, giant condensed numerals, graphite renders and low-key black-and-white
photographs glowing out of the dark; 1 px rules, eyebrows, mono meta and space instead of boxes.
It replaced the liquid-glass look and its theme packs in October 2026
(`docs/brain/60-Decisions/0020-pulse-replaces-liquid-glass.md`; how it was implemented and what the
owner ruled on the way: `0021-pulse-implementation.md`).

This file is the developer's map. It does not repeat values or the design rules:

| What | Where |
|---|---|
| The rules (what may exist, the light levels, layout grammar, components and their states, imagery, do / don't) | `docs/brain/58-Pulse/Pulse System.md` |
| Every value (colour, type, spacing, radius, glow, motion, metrics) | `src/ui/tokens/tokens.css` — the only file in `src/` allowed a raw value |
| What each screen does (exact Hungarian copy, states, do-not-invent) | `docs/brain/58-Pulse/Screens/<screen>.md`, `Feature inventory.md` |
| The 59 approved frames | Figma `SkWidL9kDDWhBip7cUCFtr`; 2x PNGs in `TRACKER-mockups/5-pulse/kepernyok-2x/`; every node's box in `.pulse/geometry/<frame>.json` |
| Where the app knowingly differs from a frame | `docs/pipeline/pulse/deviations.md` |
| Proposed strings waiting for the owner | `docs/pipeline/pulse/copy-to-approve.md` |
| The component board in the running app | `/playground` (the kit specimens, `src/features/playground/PulseKit.tsx` + `kit/`) |

**Rule 0 — compose, do not invent.** A screen is built from `src/ui`. If the kit has no piece for
what a frame draws, the piece is added to `src/ui` once (with its specimen on the kit board), never
drawn locally in a page. Second implementations of a solved problem are this project's recurring
defect.

---

## 1. The non-negotiables, as the build sees them

1. **No boxes.** No card, tile, panel, capsule, outlined pill, input box, icon disc, avatar circle,
   framed thumbnail. The only surface is the bottom sheet.
2. **One lime action per screen** — the primary pill, the only filled lime shape and the only thing
   that glows. Every other action is a text link.
3. **Lime is light, not paint:** the primary action, a selection mark, live / done data. Never a
   heading, a link or an icon at rest.
4. **Images glow out of black with no frame** (`Pic`); text never sits on a lit area.
5. **One hero per screen** (a giant numeral, a monogram or an image), then ruled sections.

`check:pulse` turns the old boxed vocabulary into bans (`node scripts/check-pulse.mjs --list-rules`):
a card or stat tile, a gauge, the aurora, a legacy type step or display-face class, a card / field /
sized built-in radius, a tinted wash or `info` colour, a `secondary` / `ghost` / `danger` button,
a control with no variant, the status chip, a shaped skeleton, a raw `<input>` / `<textarea>` /
`<select>` outside `src/ui`, a blur or a shadow other than the pill's glow, `surface-1`, a
`surface-2/3` fill outside its four uses, pure black or white, a `var()` of a retired token, an icon
on an empty state or section header. One counted site anywhere under `src` fails the build.

---

## 2. Where things live, and what enforces them

| Path | Role |
|---|---|
| `src/ui/tokens/tokens.css` | Layer 1 primitives (`@theme static`), Layer 2 semantics (one `:root`: Pulse is the only look), Layer 3 component tokens, then the component tokens each foundation lane added. The only file allowed a raw hex, `rgb()`, px radius, ms duration or `cubic-bezier()`. |
| `src/ui/tokens/fonts.css` | Big Shoulders Display (display), Geist (body), Geist Mono (figures) — self-hosted, `latin` + `latin-ext`. |
| `src/index.css` | Base layer, the global `:focus-visible` ring and the reduced-motion backstop (both held by `check:pulse`), local utilities (`.screen-x`, `.measure`), keyframes. Linted like a feature file. |
| `src/ui/primitives/control.ts` | The control recipe every interactive element is built from (§4). |
| `src/ui/**` | The kit. The only place a raw `<button>` (`check:tokens` raw-button) or a raw form element (`check:pulse` raw-form) may be written; every other rule applies. |
| `src/assets/pulse/` | The 49 shipped stills (alpha-baked WebP, density variants), built by `npm run assets:pulse` from `assets-src/pulse/assets.json`. |
| everything else in `src/` | All rules, no exemption. |

**The build** (`npm run build`) runs these gates before `tsc -b` and `vite build`; `npm run verify:gates`
plants one defect per rule and proves each gate still catches it:

| Gate | Holds |
|---|---|
| `check:tokens` | no raw value outside the token file; no stock Tailwind palette; no undeclared `var()`; a colour utility on a retired stem (`RETIRED_STEMS`) fails |
| `check:pulse` | the bans of §1, the focus ring, the reduced-motion backstop |
| `check:type-scale` | exactly the 16 Pulse steps, declared and merged alike (the class merger knows them) |
| `check:i18n` | every key in `hu` / `en` / `de`, no hard-coded visible text, identical strings only where listed in `scripts/data/i18n-untranslated.json` |
| `check:nav` / `check:nav-active` | every route has a door; one lit tab on every route |
| `check:elements` | the element-variant roster against `catalog.ts`; dormant entries in `scripts/data/elements-dormant.json` |
| `check:assets` | the image shelf: format, caps, the 1.0 MB budget, the lime of the lit rasters equal to `--accent`, no `mix-blend-` in `src` |
| `check:canvas`, `check:safe-area` | the canvas colour is the same in the token, `index.html` and the manifest; every edge-pinned element covers its inset (exemptions in `scripts/data/safe-area-exempt.json`) |
| `check:interval`, `check:autosave`, `verify:outbox` | behaviour contracts the redesign must not break |

---

## 3. Tokens — how to use them

- **Colour:** utilities on the semantic names only — `bg-surface-0`, `text-text-1/2/3`, `bg-accent`,
  `text-accent-fg`, `border-hair` / `border-hair-strong`, `border-edge`, `bg-track`, `text-danger` /
  `-warning` / `-success`. `surface-1` is reserved; `surface-2` is the sheet, the skeleton, the
  disabled pill; `surface-3` is the off switch track. Semantic colours are a dot, text, a field's error
  underline or an over-target value — never a fill.
- **Type:** exactly one `text-<role>` utility per text node, from the 16 roles (`giant`, `num`,
  `display-xl`, `display`, `eyebrow`, `title`, `body`, `body-m`, `body-b`, `cap`, `cap-m`, `tab`,
  `tab-on`, `data-l`, `data`, `micro`). Each carries its family, size, line height, weight and
  tracking; do not add `font-*`, `leading-*` or `tracking-*` beside it. Display-face words are upper
  case (the role does it); Geist is sentence case.
- **Space:** Tailwind's `--spacing` is the 4 pt grid; `--spacing-tight` / `-group` / `-section` are its
  named steps. Metrics a component shares with its skeleton (`--row-h`, `--row-h-sub`, `--row-h-ledger`,
  `--thumb`, `--control-h-primary`, …) are tokens, consumed as `min-h-[var(--row-h)]`.
- **Shell:** the safe-area, header, dock and fade positions (`--safe-t`, `--safe-b`, `--head-top-root`,
  `--head-top-push`, `--dock-b`, `--fade-h`, `--page-pad-b`, `--nav-h`, …) are tokens; a page never
  spells an offset of its own. `Screen`, `ScreenHeader` and `Dock` apply them.
- **Radius:** none, except the full pill / switch / badge, the sheet's top, bars (`--radius-bar`) and
  the skeleton / user photo (`--radius-1`).
- **Motion:** `--duration-instant` / `-fast` / `-base` / `-slow` / `-ambient`, `--ease-standard`.
  Transform and opacity only. Reduced motion keeps state changes and drops travel and loops.
- **A future pack** is one `:root[data-theme='x'] { --accent: … }` line plus a second set of the lit
  rasters (the tab icons and medals are pixels). None ships (D1).

---

## 4. The kit — `src/ui`

Every kit function of the Figma build (`app-kit.js`) has one React counterpart; kit components carry
`data-kit="<kit function name>"` so the geometry probe can find them.

| Kit (Figma) | Component | Notes |
|---|---|---|
| `btnPrimary` | `Pressable` / `PressableLink` with `variant="primary"` | 56 pt by default, `size="sm"` 44; the glow is a pseudo-layer; busy = three dots, same size |
| `textLink` | `TextLink`, or `variant="link"` (`tone="danger"` for destructive) | bare words in a 44 pt frame; pressed 60 %, off 40 % |
| `iconBtn` | `variant="link"` + `shape="icon"` | bare glyph in 44 × 44 |
| `chipRow` / `segSwitch` | `ChipRow`, `Segmented` (`feedback/variants/E6Segmented.tsx`) | words; a lime mark for a filter, an ink mark for a view switch |
| `inputField` / `searchField` | `Field`, `MaskedField`, `NumeralField`, `NumberStepper`, `TextArea`, `SearchField`, `FeedbackField`, `DateTrigger`, `FilePick` | the underline field; a raw form element outside `src/ui` is banned |
| `uiSwitch` / `setCheck` | `Switch`, `CheckMark`, `Toggle` | the switch is the one control that is a shape |
| `listRow` / `rowStack` / `ledgerRow` | `ListRow`, `RowStack`, `LedgerRow` | rows on the gutter, hairlines between |
| `sect` / `secHead` / `rule` | `Section`, `SectionHeader`, `Rule` | strong rule → eyebrow (+ one trailing node) → content |
| `numeral` / `fraction` / `statBlock` | `Numeral`, `FigureUnit`, `StatBlock`, `CountUp` | ink-tight (`--trim-display-*`), fixed digit cells for a changing number |
| `segBar` / `stepper` / `progressBar` / `macroCol` | `SegmentBar` (with its stepper), `ProgressBar`, `MacroColumns`, `SplitBar` (admin) | the light levels: lit / half / off |
| `sparkline` / chart | `Sparkline`, `TrendChart`, `ProgressChart` | body data is drawn neutral |
| `monogramMark` | `data/Monogram` | the product has no profile photos |
| `badgeCount` | `BadgeCount` | on the bell only, never on a tab |
| `emptyState` / `skel` / `noticeLine` | `EmptyState`, `ScreenSkeleton`, `NoticeLine`, `StatusLine`, `Dot` | left-aligned; never a spinner |
| `showToast` | `toast()` + `ToastHost` (`feedback/variants/E12E16.tsx`) | the top band; Undo, 4 s with pause, up to three lines |
| `bottomSheet` | `Sheet` (`feedback/variants/E14E20.tsx`), `SelectSheet`, `ConfirmSheet` | the one surface; pickers and confirmations are sheets |
| `chatMsg` | the chat feature's message rows | no bubbles |
| `scaffold` / `screenHead` / `dockAction` / `chrome` | `Screen`, `ScreenHeader`, `Dock`, `BottomNav` | root / greeting / pushed headers; the owning tab stays lit |
| `pic` | `Pic`, `UserPhoto` | LIGHTEN stills, no frame; user media desaturated |
| the mannequin | `MuscleMap` | the graphite render with lit regions, 1:1 with the frames |

**`control()`** (`src/ui/primitives/control.ts`) has two looks and no third: the lime pill
(`variant: 'primary'`, `size` `lg` default / `sm`) and the text link (`variant: 'link'`, `shape:
'icon'` for a bare glyph). A control always names its variant — there is no default look. The 44 pt
floor is on both axes of every variant with no opt-out; focus is redrawn (`--focus-ring`), never
removed; disabled is unmistakable and inert; busy keeps its size.

**Element variants (Style Studio).** Each of the 27 catalogue elements has one Pulse look. The rows
stay because the frozen backend still serves their letters; every element is dormant with its reason
(`scripts/data/elements-dormant.json`), and the studio says so ("nem használt").

---

## 5. Building a screen

1. Read the frame (2x PNG), its geometry JSON and its screen note. The numbers in the geometry are the
   specification; do not estimate from the picture.
2. Compose it from `src/ui` inside `Screen` / `ScreenHeader` / `Dock`. Strings come from the frame,
   the screen note or `hu.json` — through i18n keys in all three languages; a string nobody drew is a
   copy question, not an invention.
3. Keep behaviour: hooks, routes, query keys and everything above a page's `return` stay as they are
   (Q4: behaviour wins; where it forces a difference from the frame, log it in `deviations.md`).
4. Prove it against the frame: `node scripts/pulse-verify.mjs --package <id>` builds and captures the
   app at 402 pt (insets 62 / 34, replay of the recorded API) and writes the pair tiles and the
   geometry comparison; `pulse-shot --compare` tells two captures apart.

---

## 6. Voice

Hungarian is primary; `en` and `de` ship from the same key set as `hu`. **Never hardcode visible text.**
The bundle already has a consistent voice — these rules are extracted from it, with real strings.

### 6.1 Address the user directly, informally, second person singular

> `auth.loginTitle` — **„Jelentkezz be a fiókodba"**
> `onboarding.step.goal.title` — **„Mi a célod?"**
> `home.greeting` — **„Szia!"**

**WHY:** this is a training app used mid-effort. Formal address (*Ön*) would make the app a clerk;
the product is closer to a training partner. Never `magázás`, never impersonal
(*"A cél kiválasztása"*).

### 6.2 An empty state says what will appear here, not that nothing is here

> `home.emptyTitle` / `home.emptyBody` — **„Ma nincs betervezve edzés" / „Ha van aktív terved, a mai napja itt jelenik meg."**
> `coins.noHistoryTitle` / `Body` — **„Még nincs mozgás" / „Az érmék akkor jelennek meg itt, amikor kiérdemelted vagy elköltötted őket."**
> `coaching.noHistoryTitle` — **„Még nincs edzéselőzmény" / „Amint a kliens elvégzi az első edzést, itt jelenik meg."**

**WHY:** "Nincs adat" tells the user the app is broken. The pattern is *title = the current fact,
body = the condition under which it fills*. Note the recurring **„Még"** — nothing is empty, it is
*not yet*.

### 6.3 An error says what happened, what survived, and what to do

> `chat.sendFailed` — **„Az üzenetet nem sikerült elküldeni. A szöveg megmaradt."**
> `onboarding.saveError` — **„A mentés nem sikerült — a válasz megmarad, újrapróbáljuk"**
> `auth.errors.rateLimited` — **„Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra."**
> `progress.outOfRange` — **„Ez az érték kívül esik a hihető tartományon. Ellenőrizd, nem ütöttél-e el valamit."**

**WHY:** the sentence that matters after a failure is *"did I lose my work"*. Answer it in the same
string. Never a code, never a stack, never "Hiba történt."

### 6.4 Say the consequence before the irreversible action

> `coaching.archiveConfirmBody` — **„{{email}} ezután nem lesz a klienseid között, és nem látod a jövőbeli adatait. Ez visszafordítható, de a hozzáférés azonnal megszűnik."**
> `coaching.codeOnce` — **„Másold ki most. Ez az egyetlen alkalom, amikor látod — a szerver csak a hashét tárolja."**
> `progress.photoPrivacyNote` — **„A fotóidat alapból SENKI nem látja — az edződ sem, amíg te nem engeded meg."**

**WHY:** confirmation dialogs that only say "Biztos?" move the decision without informing it. State
what changes, whether it can be undone, and when it takes effect.

### 6.5 Explain why you are asking, and mark what is optional

> `onboarding.sexHint` — **„Az erőnormák és az 1RM-becslés miatt kérdezzük. Kihagyható."**
> `onboarding.bodyOptional` — **„Ez a rész opcionális. Nélküle is működik minden — a terhelésbecslés lesz pontatlanabb."**
> `onboarding.equipmentHint` — **„Csak azt jelöld, amihez tényleg hozzáférsz. A terv ehhez igazodik."**

**WHY:** every personal field the app asks for costs trust. Naming the use, and naming the cost of
skipping it, is what buys it back.

### 6.6 Numbers get their meaning, not just their value

> `progress.notEnough` — **„Még kevés adat a grafikonhoz ({{count}} nap). Három edzésnap kell hozzá — két pont még nem trend."**
> `marketplace.searchCapped` — **„A keresés egy oldalnyi találatot ad. Szűkíts a szavakkal vagy a várossal, ha nem ezt kerested."**

**WHY:** a limit the user cannot see is a limit they will assume is a bug.

### 6.7 Buttons are verbs, one or two words, no punctuation

`common.save` „Mentés" · `common.retry` „Újra" · `common.cancel` „Mégse" ·
`workout.check` „Kész" · `workout.skipRest` „Pihenő átugrása" · `coaching.mintCode` „Új kód"

In-flight states are their own key and end in an ellipsis: `chat.sending` „Küldés…",
`onboarding.saving` „Mentés…". **WHY:** a label that changes to a sentence resizes the button.

### 6.8 Never moralise about the body

> `workout.interval.work` — **„Hajrá"**
> `progress.tab.body` — **„Test"**, `nutrition.macro.*` — plain nutrient names

**WHY:** no "crush it", no praise for a low number, no green for a falling weight. The app reports;
the user decides what it means. This is the one voice rule that is also a color rule (see DECISIONS).

### 6.9 Interpolation and pluralisation

All counts go through `{{count}}` with the i18n plural machinery — Hungarian takes a singular noun
after a numeral (`„{{count}} gyakorlat"`, not *gyakorlatok*), and hardcoding either form breaks `en`
and `de`. Every key must exist in all three bundles — `hu` is the reference that defines the set,
and `check-i18n` fails the build on a key missing from one bundle just as it does on a key only one
bundle has.

---

## 7. DECISIONS — do not undo

Each is a value or a construction with a recorded reason. The decisions of the liquid-glass file that
Pulse retired (packs, gradients, card padding, shadow stacks, accent ramps) are gone with it; these
carried over or arrived with Pulse.

1. **One look, no theme engine** (D1). Nothing writes an accent at run time; a future pack overrides
   `--accent` in one place.
2. **No boxes.** Grouping is a rule above and a section step below, never a surface. `surface-1` is
   reserved.
3. **One glowing thing per screen** — the idle primary pill. No other shadow, blur or elevation.
4. **The display face is never global** and always upper case; three families, self-hosted for CSP.
5. **A number that changes in the display face gets fixed digit cells** (`Numeral`): Big Shoulders has
   no tabular figures (DEV-003).
6. **Every type role carries its line height, weight and tracking**; one role per text node.
7. **`@theme static` is load-bearing.** Tailwind tree-shakes `@theme` variables it sees no utility for,
   and half of Layer 1 is consumed through `var()` from CSS and JS.
8. **`--spacing` IS the scale.** No parallel spacing scale.
9. **`.screen-x` uses `max()`, not addition** — the inset replaces the gutter; `check-safe-area` reads it.
10. **The 44 pt floor is on both axes of every control**, with no opt-out from a call site.
11. **Focus is redrawn, never removed** — in `control.ts` and in `index.css`.
12. **Disabled is unmistakable AND inert; busy keeps its size.**
13. **`Pressable` defaults `type="button"`; the label of a `Field` is always rendered** — a placeholder
    is not a label.
14. **`Switch` is a real `role="switch"`.**
15. **Charts of body data are neutral.** A green number is the app telling someone which way their body
    should go.
16. **Macro overshoot is `warning`, never `danger`.** The tone of a colour is part of what it says.
17. **Accent is never success.** "Saved" is the `success` dot; lime means live, selected or done.
18. **Never pure `#000` / `#FFF`** (`check:pulse` black-white): the canvas is the near-black
    `--surface-0`, which every image is graded to.
19. **Images reserve their box** and sit on LIGHTEN with no frame; text never sits on a lit area.
20. **Reduced motion collapses durations; it does not remove the state change.**
21. **Behaviour wins over the frame** (Q4): nothing a user can do today disappears; each difference is a
    `DEV-<n>` entry in `docs/pipeline/pulse/deviations.md`.
22. **No visible string without a source** (R22): the frame, the screen note or `hu.json`; a proposed
    string waits in `copy-to-approve.md`.

---

## 8. OPEN — what is not finished

- The eight equipment stills that do not exist yet (the list API carries the keys; the library rows
  leave the cell empty until the stills ship).
- The frames that still differ, each with its reason: `docs/pipeline/pulse/review/final.json`.
- The deviations awaiting a ruling (`deviations.md`), the strings awaiting a tick (`copy-to-approve.md`),
  the regression sweep's non-regression findings (`docs/pipeline/pulse/review/open.md`).
- The follow-up packages, in order: (1) the coin-store pack delisting on the backend (Q2), (2) finish /
  abandon workout (D3) — the frames draw the action; the app does not fake it.
