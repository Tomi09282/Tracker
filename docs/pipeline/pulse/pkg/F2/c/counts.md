# check:pulse against the independent count — every difference, explained

PLAN.md 3.6: *"At G-c each rule's total must equal the independent count of F0 step 6, or the
difference is explained in writing."* This is the writing. The numbers are produced by
`compare.mjs` in this folder; the two full listings (every line on which the two counters disagree)
are `counts.base.txt` and `counts.now.txt`.

## What was compared

| | Counter A — the record | Counter B — the ratchet |
|---|---|---|
| Built by | the integrator, F0 (`pkg/_int/record-baseline.mjs`) | lane G-c (`frontend/scripts/check-pulse.mjs`) |
| How | plain `git grep -P` per line; two small tag scans | its own lexer (comments blanked, strings marked), its own tag and expression scanner |
| Comments | counted | blanked |
| Record | `pkg/_int/baseline/independent-counts.json`, tree `0860942` | — |

Two runs, both reproducible:

```
# 1. the SAME tree the record was taken on (the base worktree, 0860942)
node docs/pipeline/pulse/pkg/F2/c/compare.mjs --tree <base worktree> \
     --record docs/pipeline/pulse/pkg/_int/baseline/independent-counts.json --rename-three

# 2. today's tree (212e1be + this branch), against a scratch run of the same grep script on it
node docs/pipeline/pulse/pkg/F2/c/compare.mjs --tree . --record <scratch>/independent-counts.json
```

`--rename-three` applies the F1.4 codemod to the text in memory (`text-body`, `text-display`,
`text-micro` not followed by `-` become `-legacy`): the base tree spells those three steps by the
names Pulse now re-uses, and the ratchet counts the ten by their names of today. For run 2 the
scratch copy of the grep script had one line changed for the same reason (its list of the ten
names); nothing in `pkg/_int/` was touched.

## Run 1 — the base tree, against the F0 record

| Rule | Record | Ratchet | Diff | Why |
|---|---|---|---|---|
| `surface` | 97 | 97 | 0 | |
| `summary-tile` | 12 | 12 | 0 | |
| `gauge` | 8 | 8 | 0 | |
| `aurora` | 9 | 9 | 0 | |
| `legacy-type` | 612 | 572 | −40 | 40 mentions on 36 comment lines. With comments blanked the grep gives 572 too. |
| `font-display-class` | 29 | 29 | 0 | |
| `legacy-radius` | 199 | 175 | −24 | 24 mentions on 21 comment lines — among them all 9 bare `rounded` ("a rounded SQUARE"): no code line uses the bare utility. Grep without comments: 175. |
| `wash` | 214 | 205 | −9 | −13 in comments; **+4 by rule**: the ratchet also counts a colour utility on the two other bridged colour names, `accent-hover` and `scrim-strong` (`ExerciseDetailPage.tsx:191`, `TokenProof.tsx:155`, `E14E20.tsx:346`, `control.ts:67`). Both names are deleted in the closing cleanup with the rest of the bridge. |
| `legacy-variant` | 152 | 152 | 0 | Equal by two differences that cancel: −1 in a comment (`ExerciseDetailPage.tsx:261`); **+1 by rule** — `cta?: 'primary' \| 'secondary'` in `PublicChrome.tsx:118`: `cta` is handed to `control({ variant: cta })`, so the variant is counted where that name gets its values (the alias rule). |
| `pill-size` | 59 | 58 | −1 | −2 in comments (`ComposePage.tsx:96`, `ExerciseDetailPage.tsx:261`); **+1 by rule** — `control({ variant: cta, shape: 'chip' })` in `PublicChrome.tsx:148`, where `cta` defaults to `'primary'` (the grep needs the literal on the line). The ratchet counts per ELEMENT (an opening tag or a `control()` call with a reachable `primary` and no `size`), the record per line; on this tree the two coincide everywhere else. |
| `pressable-no-variant` | 30 | 30 | 0 | The ratchet additionally counts a `control()` call with no `variant` — there is none today. |
| `legacy-chip-call` | 3 | 3 | 0 | |
| `shaped-skeleton` | 94 | 94 | 0 | |
| `raw-form` | 22 | 22 | 0 | |
| `blur-shadow` | 27 | 28 | +1 | −1 in a comment; **−1 by rule**: `shadow-[var(--shadow-glow)]` in `control.ts:67` IS the glow (the grep only exempted the spelling `shadow-glow`); **+3 by rule**: a shadow set as a style, which no class grep sees — `boxShadow:` in `E12E16.tsx:150`, `E17E19.tsx:141`, `E4Toggle.tsx:315`. |
| `reserved-surface-1` | 30 | 29 | −1 | −2 in comments; **+1 by rule**: the reserved level through another utility than `bg-` — `text-surface-1` in `LibraryPage.tsx:191`. |
| `reserved-surface-2-3` | 92 | 84 | −8 | −7 in comments; **−1 by rule**: the allow-list — `bg-surface-3` in `Switch.tsx:71` is the switch's off track. (The record says so itself: "the ratchet subtracts its allow-list".) |
| `black-white` | 1 | 1 | 0 | |
| `legacy-var` | 185 | 153 | −32 | Per token name, the only names that differ: `--card-pad` 11 → 10 (one in a comment); **`--focus-ring` 31 → 0** and **`--sheet-bg` 6 → 0** (not bridged — see below); **`--card-radius` 0 → 4**, **`--nav-fg-active` 0 → 1**, **`--nav-fg-idle` 0 → 1** (bridged, and not in the record's list). −1 −31 −6 +4 +1 +1 = −32. |
| `heading-icon` | 48 | 48 | 0 | |

Eleven rules are equal to the unit. Of the nine that differ, two differ ONLY by comments
(`legacy-type`, `legacy-radius`: the grep with comments blanked gives the ratchet's number), and the
other seven by the rule decisions listed — 13 sites more, 40 sites fewer, each named above.

### The three decisions behind the `legacy-var` difference

The record took its name list from the plan (plan-safe 2.3). The ratchet takes it from what the
tree declares and from what the closing cleanup deletes (PLAN.md 7.3, rows 1, 2 and 6):

- **`--focus-ring` is not bridged.** `tokens.css` declares it as a Pulse token ("Focus is redrawn on
  the lamp, never removed"), `control.ts` draws every focus ring with it, and the kept-rules leg of
  this same gate REQUIRES `index.css` to keep `outline: 2px solid var(--focus-ring)`. A rule that
  counted it could never reach zero while the other leg holds.
- **`--sheet-bg` is not bridged.** It is the fill of the one surface Pulse has; plan-safe lists it
  under "component tokens that stay, re-valued" as well, `tokens.css` does not mark it BRIDGE, and
  no row of the closing cleanup deletes it. It is also how the sheet is painted without tripping
  `reserved-surface-2-3` (below).
- **`--card-radius`, `--nav-fg-active`, `--nav-fg-idle` are bridged** (the card block of
  `tokens.css` is marked BRIDGE; closing row 6 retires `--nav-fg-*`). So are `--glass-sheen-angle`
  and the five `--btn-*` aliases, which nothing uses. The ten legacy type steps are counted as
  `var()` too (`var(--text-body-legacy)` in `index.css` since F1.4): they are deleted in row 2.

## Run 2 — today's tree

Same grep script, same patterns, run on the tree of this branch (`counts.now.txt`):

| Rule | Grep | Ratchet | Diff | | Rule | Grep | Ratchet | Diff |
|---|---|---|---|---|---|---|---|---|
| `surface` | 95 | 95 | 0 | | `pressable-no-variant` | 28 | 28 | 0 |
| `summary-tile` | 12 | 12 | 0 | | `legacy-chip-call` | 3 | 3 | 0 |
| `gauge` | 8 | 8 | 0 | | `shaped-skeleton` | 94 | 94 | 0 |
| `aurora` | 9 | 9 | 0 | | `raw-form` | 17 | 17 | 0 |
| `legacy-type` | 601 | 561 | −40 | | `blur-shadow` | 27 | 28 | +1 |
| `font-display-class` | 29 | 29 | 0 | | `reserved-surface-1` | 30 | 29 | −1 |
| `legacy-radius` | 194 | 170 | −24 | | `reserved-surface-2-3` | 91 | 83 | −8 |
| `wash` | 210 | 201 | −9 | | `black-white` | 1 | 1 | 0 |
| `legacy-variant` | 146 | 146 | 0 | | `legacy-var` | 181 | 152 | −29 |
| `pill-size` | 56 | 55 | −1 | | `heading-icon` | 47 | 47 | 0 |

The differences are the same lines as in run 1, with one change: `--focus-ring` is used 30 times
now, and `index.css` has gained `var(--text-body-legacy)` and its line-height (+2) — hence −29.

What moved between the two trees is the switch itself, and both counters moved by the same amount:
F1.1 deleted the theme engine (`ThemeStudio`, `AccentPicker`, `GradientBuilder`, the Megjelenés block
of `SettingsPage`) — `surface` 97 → 95, `legacy-type` 572 → 561, `legacy-radius` 175 → 170, `wash`
205 → 201, `legacy-variant` 152 → 146, `pill-size` 58 → 55, `pressable-no-variant` 30 → 28,
`raw-form` 22 → 17, `reserved-surface-2-3` 84 → 83, `heading-icon` 48 → 47. F1.4 renamed 148 class
tokens and raised nothing.

**Total today: 1 768 counted sites in 84 of 142 files.** The integrator's `--init` on the merged tree
turns these into the budgets.

## The lexer, against the TypeScript parser

The ratchet reads with a hand-written lexer (no dependency, like every gate here). Its two outputs
were compared with `typescript`'s own parse of the same 139 `.ts` / `.tsx` files:

```
node docs/pipeline/pulse/pkg/F2/c/compare.mjs --lexer --tree .
lexer: 139 .ts/.tsx file(s) — 139 with identical comment blanking, 0 differing,
       1 with a different string mask, 0 where the ratchet's counts change
```

The one string-mask difference is the documented limit: an apostrophe in JSX TEXT
(`TokenProof.tsx:252`, "the accent's own hue family") opens a "string" that ends with its line.

## What the ratchet does not see

- A variant that travels through a prop of ANOTHER file: `<PublicTopBar cta="secondary">` (six call
  sites in `PostPage` and `CoachProfilePage`). It is counted once, where `cta` is declared; when
  that union loses `'secondary'`, the type checker names the six.
- A class name assembled at run time, and a `size` that arrives through a spread (`{...props}`).
- `var(--surface-2)` / `var(--surface-3)` used as an SVG stroke, a hover fill or a scrollbar colour (7 sites): the
  rule is about the `bg-` utility, as the plan words it.
- Structure. A hand-built box made of legal tokens is not a countable construct; the runtime
  boxed-surface probe of the capture tool is the net for that.
