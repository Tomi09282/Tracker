# Proof — F1.2: the three Pulse faces are installed, dormant, and checked

F1.2 (PLAN.md 3.3, ruling R8) installs `@fontsource-variable/big-shoulders-display`,
`@fontsource-variable/geist` and `@fontsource/geist-mono` (all 5.3.0, OFL-1.1), declares them by hand in
`frontend/src/ui/tokens/fonts.css` and changes nothing on screen. It also runs the glyph check that the
type step (F1.4) waits for. Everything below can be re-run with the three scripts in this folder.

## The result in four lines

1. **Glyphs: pass, all three faces.** Each carries ő ű Ő Ű (in its `latin-ext` file) and
   `document.fonts.check` goes from false to true.
2. **Tabular figures: Geist passes, Geist Mono passes, Big Shoulders Display FAILS.** The display face
   has no tabular figures at all — its `GSUB` table has no `tnum` feature, so `tabular-nums` changes
   nothing: "1" is 0.237 em wide, "0" is 0.440 em (weight 700).
3. **The successor family named by the plan fails the same way** (`@fontsource-variable/big-shoulders`
   5.3.0: same `GSUB`, no `tnum`) and is a wider cut. It was checked and NOT installed.
4. **Dormant: yes.** The build emits the six files byte-identical; the built app, booted signed-out,
   fetches none of them.

## 1. The rules against the packages, and what the binaries hold

`node glyph-check.mjs --static`

| Face | Subset | File | Bytes | unicode-range = package | font-display | cmap: ő ű Ő Ű | cmap: 0-9 | GSUB features |
|---|---|---|---|---|---|---|---|---|
| Big Shoulders Display Variable | latin-ext | big-shoulders-display-latin-ext-wght-normal.woff2 | 28688 | yes | block | yes | - | locl |
| Big Shoulders Display Variable | latin | big-shoulders-display-latin-wght-normal.woff2 | 35504 | yes | block | - | yes | ccmp dnom frac liga locl numr |
| Geist Variable | latin-ext | geist-latin-ext-wght-normal.woff2 | 16512 | yes | swap | yes | - | locl |
| Geist Variable | latin | geist-latin-wght-normal.woff2 | 29400 | yes | swap | - | yes | ccmp dnom frac liga locl numr pnum tnum |
| Geist Mono | latin-ext | geist-mono-latin-ext-500-normal.woff2 | 7156 | yes | swap | yes | - | locl |
| Geist Mono | latin | geist-mono-latin-500-normal.woff2 | 10116 | yes | swap | - | yes | ccmp dnom frac locl numr |

**Font weight of a Hungarian session, worst case (all six files): 127 376 bytes = 127.4 kB (124.4 KiB)** —
within the 150 KB of PLAN.md 3.3. Today's two faces cost 209.3 KB for the same session
(`understand/tokens-type.md` §1.4).

## 2. The faces in headless Chrome

`node glyph-check.mjs --write` (HeadlessChrome 155, a scratch page in the OS temp directory, `--dump-dom`;
the page carries the text of `fonts.css` itself with each `url()` swapped for a `data:` URL of the
installed file). Widths are in em, measured at 200 px; the two numbers in brackets are the same
character in the `serif` and the `monospace` fallback alone — a glyph that equals them is missing.

| Role | Family | Weight | fonts.check | ő em (fallbacks) | ű em (fallbacks) | Ő em (fallbacks) | Ű em (fallbacks) | Glyphs | 0-9 under tabular-nums | default figures | tnum in file | Tabular |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| display | Big Shoulders Display Variable | 700 | false -> true | 0.418 (0.500 / 0.550) | 0.433 (0.556 / 0.550) | 0.428 (0.778 / 0.550) | 0.419 (0.722 / 0.550) | PASS | UNEQUAL 0.237-0.448 em | proportional 0.237-0.448 em | no | FAIL |
| display | Big Shoulders Display Variable | 900 | false -> true | 0.480 (0.500 / 0.550) | 0.499 (0.556 / 0.550) | 0.497 (0.778 / 0.550) | 0.487 (0.722 / 0.550) | PASS | UNEQUAL 0.274-0.515 em | proportional 0.274-0.515 em | no | FAIL |
| text | Geist Variable | 400 | false -> true | 0.573 (0.500 / 0.550) | 0.575 (0.500 / 0.550) | 0.739 (0.722 / 0.550) | 0.689 (0.722 / 0.550) | PASS | one advance, 0.600 em | proportional 0.384-0.663 em | yes | PASS |
| text | Geist Variable | 500 | false -> true | 0.588 (0.500 / 0.550) | 0.586 (0.500 / 0.550) | 0.751 (0.722 / 0.550) | 0.694 (0.722 / 0.550) | PASS | one advance, 0.612 em | proportional 0.406-0.673 em | yes | PASS |
| text | Geist Variable | 600 | false -> true | 0.603 (0.500 / 0.550) | 0.597 (0.556 / 0.550) | 0.763 (0.778 / 0.550) | 0.699 (0.722 / 0.550) | PASS | one advance, 0.624 em | proportional 0.427-0.683 em | yes | PASS |
| mono | Geist Mono | 500 | false -> true | 0.600 (0.500 / 0.550) | 0.600 (0.500 / 0.550) | 0.600 (0.722 / 0.550) | 0.600 (0.722 / 0.550) | PASS | one advance, 0.600 em | already tabular | no | PASS |

- The negative control (Ж, outside every declared `unicode-range`) read as missing in 6 of 6
  measurements: the method does see a fallback when there is one.
- Before any text used them, all six declared faces were `unloaded`.
- The ten advances of the display face under `tabular-nums`, weight 700, digits 0-9:
  `0.440 0.237 0.424 0.437 0.448 0.446 0.433 0.408 0.433 0.432` em — identical to the advances without
  `tabular-nums`. A run of ten "1" is 2.365 em wide, a run of ten "0" is 4.395 em.
- The browser and the binary agree: Geist has `tnum` and obeys it; Geist Mono has none and needs none
  (every figure is 0.600 em); Big Shoulders Display has none and its figures are proportional.

Full numbers: `result.json`.

## 3. The successor family (PLAN.md 3.3, "If the glyph check fails")

The plan's continuation for the display face is: replace it by `@fontsource-variable/big-shoulders`
(same publisher, same version) and check again. It was checked as a candidate, without installing it
into the app:

- fetched with `npm pack @fontsource-variable/big-shoulders@5.3.0` into a scratch folder outside the
  repository; the tarball's sha512 equals the registry's `dist.integrity`
  (`sha512-b6JtGj6cqvOO5RLu…`); licence OFL-1.1;
- checked with `successor.fonts.css` (this folder — the shipped rules with the two display rules
  pointed at the successor):
  `node glyph-check.mjs --fonts-css successor.fonts.css --display "Big Shoulders Variable|@fontsource-variable/big-shoulders" --modules <scratch>/node_modules --write --out result-successor.json`

| Role | Family | Weight | Glyphs | 0-9 under tabular-nums | tnum in file | Tabular | ő em |
|---|---|---|---|---|---|---|---|
| display | Big Shoulders Variable | 700 | PASS | UNEQUAL 0.272-0.493 em | no | FAIL | 0.470 |
| display | Big Shoulders Variable | 900 | PASS | UNEQUAL 0.289-0.534 em | no | FAIL | 0.503 |

`GSUB` of the successor's `latin` files (`wght` and `opsz` alike): `ccmp dnom frac liga locl numr` — the
same list as Big Shoulders Display, no `tnum`. Its `wght` file is also a WIDER cut than the family the 59
frames are drawn in (ő 0.470 em against 0.418 em at weight 700), so it would move every display line
away from the frames and repair nothing.

**Therefore the app keeps the family of ruling R8 and the frames, Big Shoulders Display; the successor is
not a dependency.** Full numbers: `result-successor.json`.

## 4. What this means for the steps that follow

Facts, and the continuations the plan already names — the ruling is the orchestrator's and the owner's:

- A number that does not change reads exactly as the frames draw it: Figma set the frames with the same
  (only) figures of this face. Nothing is wrong with a static numeral.
- A number that CHANGES on screen in the display face jumps sideways on every tick, and no CSS can stop
  it. The plan's stand-in is **fixed-width digit cells in `Numeral`** (PLAN.md section 10, row "Big
  Shoulders Display ships tabular figures"; lane F10, with `CountUp` as the digit roller).
- 14 sites pair `tabular-nums` with the display face today (`font-display`, `text-display`,
  `text-timer`), and will lose the alignment they have in Space Grotesk the moment F1.4 re-points the
  family. Three of them tick:
  `features/workout/RestTimer.tsx:101` and `:154`, `features/workout/IntervalStage.tsx:147`.
  The other eleven: `admin/AdminPage.tsx:84`, `chat/NotificationsPage.tsx:133`,
  `coaching/CoachDashboard.tsx:259`, `coins/CoinBalance.tsx:90` (a rolling count),
  `compose/ComposePage.tsx:341`, `marketplace/PostPage.tsx:187`, `nutrition/NutritionPage.tsx:170`,
  `onboarding/OnboardingPage.tsx:511`, `plans/PlanListPage.tsx:248`, `ui/data/SummaryTile.tsx:99`,
  `ui/feedback/TrendChart.tsx:155`.
- F1.4 is "not made unless the F1.2 glyph check passed". The part of the check that has no stand-in —
  the letters — passed for all three faces. The part that failed has the stand-in above. Whether F1.4
  goes ahead on that basis is asked in the step report and logged as `DEV-003` in `deviations.md`.

## 5. Installed, dormant

`node dormant-check.mjs` (after `npm run build`; a static server over `dist` on 127.0.0.1:5189 with no
backend behind it, headless Chrome on `/login`)

- 6 of 6 declared files are emitted to `dist/assets` under hashed names, byte-identical to the
  installed ones, each loaded by an `@font-face` rule of the built CSS; 0 unresolved `url()`. The
  assumption of PLAN.md section 10 — a `url()` naming a file inside a Fontsource package is resolved by
  the bundler — holds; no relative path into `node_modules` was needed.
- Outside `@font-face`, the built CSS, the built scripts and `index.html` name none of the three
  families: nothing can ask for them.
- The signed-out app mounted, fetched `inter-latin-wght-normal-*.woff2` (so text really was laid out and
  a font request is visible to the log) and none of the six new files.

## The scripts

| File | What it is |
|---|---|
| `glyph-check.mjs` | legs A (rules against the packages), B (binaries), C (headless Chrome); `--write` records `result.json`; exit 1 while the display face has no tabular figures |
| `font-tables.mjs` | reads `fvar`, `GSUB` and `cmap` out of a `.woff2` with Node's own Brotli — no dependency |
| `dormant-check.mjs` | the build output and a signed-out boot of the built app |
| `successor.fonts.css` | the candidate stylesheet of section 3 — not shipped, not imported |
| `result.json`, `result-successor.json` | the recorded runs of 2026-10-13 |

Headless Chrome is heavy on the build machine: take a heavy lock around `glyph-check.mjs` and
`dormant-check.mjs`. Run `glyph-check.mjs` again after any upgrade of the three packages.
