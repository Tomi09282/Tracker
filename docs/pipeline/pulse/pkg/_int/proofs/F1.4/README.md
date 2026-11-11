# Proof — F1.4: the Pulse type ramp, the three typefaces, and the rename that keeps old text in place

F1.4 (PLAN.md 3.3, rulings R3 and R8; detail plan-safe.md 2.2 / 2.3) declares the 16 Pulse type steps
beside the 10 steps of the old ramp, switches the three family tokens to Big Shoulders Display, Geist
and Geist Mono, binds family and case to the Pulse steps once, takes `h1, h2, h3` out of the display
rule, removes Inter and Space Grotesk, and preloads the four font files a Hungarian screen needs.
Three old names (`body`, `display`, `micro`) are also Pulse names with other metrics, so every existing
use of them was renamed to `-legacy` by a script. Everything below can be re-run.

## The result in five lines

1. **The rename is purely mechanical.** 148 class tokens in 51 files; 50 files differ from the commit
   before by the suffix alone (undoing it gives back the old bytes), the 51st is `cn.ts`, which also
   got its step list by hand. `git diff --numstat`: 50 files with equal insertions and deletions,
   147 lines.
2. **No class name is built at run time.** No `text-${…}`, no `'text-' + …`, no joined `text-` prefix
   anywhere under `src`; the bare names `'body'` / `'display'` / `'micro'` occur only as the step
   list of `cn.ts` and as unrelated values (an onboarding step, a tab key, `RequestInit`).
3. **`check:type-scale` prints 26 steps**, declared and merged alike; bound: 5 display, 3 mono,
   4 upper case. Its two binding probes woke up and pass (`verify:gates`: 50 passed, 0 failed,
   4 dormant; it was 48 / 0 / 6).
4. **No existing text changed size.** Six captures of the built app (sign-in, home, library at
   402 x 874 and at 360 x 780) have the same document height before and after, to the pixel, and the
   same `h1` metrics (34 / 40). The full proof is the hybrid sweep (F1.6).
5. **`dist/` holds no Inter and no Space Grotesk.** Six font files, 127 376 bytes; `index.html`
   preloads four of them by their hashed names.

## 1. The rename

`node codemod.mjs` (dry run) · `node codemod.mjs --write` · `node codemod.mjs --verify <rev>`

The rule has no exception: in every tracked `frontend/src/**/*.ts(x)`, `text-body`, `text-display`,
`text-micro` as a whole class token (not preceded by a word character or a hyphen, not followed by
one) gains `-legacy`. It is applied to the file's text, so strings, class names inside expressions
and the comments that describe them are renamed alike.

| | |
|---|---|
| Scope | 133 tracked `.ts` / `.tsx` files under `frontend/src` |
| Tokens renamed | **148 in 51 files** — `text-body` 54, `text-display` 22, `text-micro` 72 |
| In a string literal / a template string / JSX text / a comment | 138 / 2 / 0 / 8 |
| Left un-renamed in the scope | 0 |

Where the 148 sit, by the expression they are part of (the TypeScript parser of the project says so;
`--sites` lists every one that is not a plain attribute):

| Shape | Hits | Handled |
|---|---|---|
| a plain `className="…"` literal | 115 | renamed |
| an argument of `cn(…)` | 15 | renamed — `ChatPanel`, `NotificationBell`, `ExerciseDetailPage`, `NutritionPage`, `SetRow`, `DataTable`, `E10Tabs`, `E12E16`, `E2CopyButton`, `E4Toggle`, `E5Checkbox`, `E8E9`, `BottomNav`, `Field`, `CommandPalette` |
| an object map of class strings | 4 | renamed — `coaching/Monogram.tsx` (`SIZES.sm`), `ui/TokenProof.tsx` (three rows of its specimen table) |
| a conditional expression | 3 | renamed — `AuthPage.tsx` (both branches of the title), `SummaryTile.tsx` (the upper-case caption) |
| a template string | 2 | renamed — `AdminMetrics.tsx:74`, `ClientDetailPage.tsx:117` (the fixed head of the template; the `${…}` parts hold colours) |
| an array joined into a class string | 1 | renamed — `MarketplacePage.tsx:144` |
| a `cva()` variant map | 0 | — (`control.ts` and `surfaceRecipe.ts` hold none of the three names) |
| a comment | 8 | renamed, so the comment keeps naming the class written beside it: `ClientDetailPage:116`, `CoinsPage:282`, `PostPage:185`, `PlanListPage:41`, `WorkoutPlayer:461`, `cn.ts:18`, `SummaryTile:31`, `E12E16:543` |

Searched separately, because a text rename cannot see them — all empty:

- `text-${` (a template that continues the prefix with an expression): 0
- `'text-' +` and a quoted `text-` handed to a join: 0
- the bare names `'body'`, `'display'`, `'micro'` as string literals: 14 hits, none part of a class —
  the three entries of `TYPE_STEPS` in `cn.ts` (rewritten by hand in this step), onboarding's step
  key, the progress tab key, `Omit<RequestInit, 'body'>`, and five comments.

Not in the scope, on purpose: `tokens.css` and `index.css` (the declarations — written by hand),
`frontend/DESIGN.md` and `PATTERN-GAP.md` (prose about the old system), `scripts/` (the gate's own
description of the binding).

The recorded run: `codemod-verify.txt` (written after every hand edit of the step, against the commit
before it).

## 2. The 26 steps

`node scripts/check-type-scale.mjs` → `OK — 26 step(s), declared and merged alike; bound: 5 display, 3 mono, 4 upper case`

| Pulse (16) | size / line / weight / tracking | face, case |
|---|---|---|
| `giant` | 124 / 108 / 900 / −1 % | display |
| `num` | 48 / 48 / 900 | display |
| `display-xl` | 48 / 48 / 700 / +1 % | display, upper |
| `display` | 32 / 34 / 700 / +1 % | display, upper |
| `eyebrow` | 16 / 20 / 700 / +6 % | display, upper |
| `title` | 22 / 28 / 600 / −1 % | text |
| `body` · `body-m` · `body-b` | 16 / 22 / 400 · 500 · 600 | text |
| `cap` · `cap-m` | 13 / 18 / 400 · 500 | text |
| `tab` · `tab-on` | 11 / 14 / 500 · 600 / +1 % | text |
| `data-l` | 16 / 20 / 500 / −1 % | mono |
| `data` | 13 / 18 / 500 | mono |
| `micro` | 11 / 16 / 500 / +10 % | mono, upper |

| Legacy (10), old metrics | size / line / weight / tracking |
|---|---|
| `display-legacy` | 34 / 40 / 700 / −2 % |
| `timer` | 48 / 48 / 700 / −3 % |
| `title-1` · `title-2` · `title-3` | 26 / 32 / 700 / −1 % · 20 / 26 / 600 · 17 / 24 / 600 |
| `body-legacy` · `body-strong` | 15 / 22 / 400 · 500 |
| `body-s` | 13 / 18 / 400 |
| `caption` | 12 / 16 / 500 |
| `micro-legacy` | 11 / 14 / 600 / +6 % |

`--giant-fluid: min(var(--text-giant), 31vw)` is declared outside the `--text-` namespace.

Two decisions the plan does not spell out:

- **The inherited base stays 15 / 22.** `body` in `index.css` reads `--text-body-legacy`. Text with no
  type class inherits that size, and the plan's rule for this step is "no existing text changes
  size"; the reader note (`understand/tokens-type.md` 3.5) had the base move to 16, which was written
  before ruling R3 kept all ten legacy steps. When the legacy step is deleted in the closing cleanup,
  `check:tokens` fails on the undeclared name and forces the rule onto `--text-body`.
- **The legacy steps are bound to no face.** Only the roster of `check-type-scale.mjs` is in the
  binding block. A legacy heading is in the display face exactly where its call site says
  `font-display` (29 sites in 22 files); every other heading is the text face now, because `h1, h2, h3` left the
  display rule.

## 3. The built app

`npm run build` (12 gate scripts, `tsc -b`, `vite build`) — exit 0.

- `dist/assets`: `big-shoulders-display-latin(-ext)-wght-normal`, `geist-latin(-ext)-wght-normal`,
  `geist-mono-latin(-ext)-500-normal` — six `.woff2`, 127 376 bytes. No file and no string of Inter
  or Space Grotesk anywhere in `dist/`.
- `dist/index.html` carries four `<link rel="preload" as="font" type="font/woff2" crossorigin>` tags
  with the hashed names of the display and text faces, both subsets. They are made from the bundle
  in `vite.config.ts`; a stem that matches no emitted file fails the build.
- The built CSS holds the binding in `@layer components` and the three `-legacy` utilities with the
  old metrics.

Looked at in headless Chrome (402 x 874 and 360 x 780, the built app on :5189, signed in once):

| State | document height before → after | `h1` | faces loaded | overflow, console |
|---|---|---|---|---|
| sign-in, 402 | 874 → 874 | 34 / 40, text face | Geist | 0, none |
| home, 402 | 1138 → 1138 | 34 / 40, text face | Geist, Big Shoulders Display | 0, none |
| library, 402 | 3151 → 3151 | 34 / 40, text face | Geist | 0, none |
| sign-in, 360 | 780 → 780 | same | Geist | 0, none |
| home, 360 | 1138 → 1138 | same | Geist, Big Shoulders Display | 0, none |
| library, 360 | 3112 → 3112 | same | Geist | 0, none |

("before" = the F1.5 tree, same build, same account, minutes earlier; pictures in
`.pulse/shots/F1.5/` and `.pulse/shots/F1.5/before-F1.4/`.)

## 4. What it looks like now, honestly

Text is Geist everywhere, including every heading. Big Shoulders Display shows only where an old call
site names the display face — on Home that is the "0 / 4" inside the ring. No screen has an eyebrow,
a giant numeral or an upper-case display title yet: no call site uses a Pulse role name before its
screen is rebuilt. The app is the old layout in Pulse colours and Pulse letters, not Pulse.

## 5. Known after this step

- **DEV-003.** Big Shoulders Display has no tabular figures. Three sites tick in it from now on and
  jump sideways on a tick until `Numeral` gives them digit cells: `workout/RestTimer.tsx:101` and
  `:154`, `workout/IntervalStage.tsx:147`. Eleven more pair `tabular-nums` with the display face on a
  number that stands still (list in `proofs/F1.2/README.md`).
- `ui/TokenProof.tsx` (the old specimen page, deleted with the kit host) still says in prose that the
  families are Space Grotesk and Inter, and prints the old metrics beside the legacy class names.
